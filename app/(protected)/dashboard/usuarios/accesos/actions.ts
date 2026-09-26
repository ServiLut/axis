"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import bcrypt from "bcrypt";
import { Buffer } from "node:buffer";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";
import { Prisma } from "@/prisma/generated/prisma/client";

const managementRoles = ["ADMIN", "SU_ADMIN"];
async function administrator(token: string) {
  const actor = await verifyToken(token);
  if (!actor || !managementRoles.includes(actor.role)) throw Error("Acceso reservado a administradores activos.");
  return actor;
}

export async function getUserAccess(token: string) {
  try {
    const actor = await administrator(token);
    const users = await prisma.usuario.findMany({
      where: { tenantId: actor.tenantId, ...(actor.role !== "SU_ADMIN" ? { rol: { not: "SU_ADMIN" as const } } : {}) },
      select: { id: true, nombre: true, apellido: true, username: true, rol: true, activo: true, aprobado: true },
      orderBy: [{ nombre: "asc" }, { apellido: "asc" }],
    });
    return { users, currentUserId: actor.userId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudieron cargar los usuarios." };
  }
}

async function lockAccounts(tx: Prisma.TransactionClient, actorId: number, targetId: number, tenantId: number) {
  // All management operations take the same tenant lock, preventing races with
  // suspension/password changes by other administrators in this screen.
  await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`;
  const actor = await tx.usuario.findFirst({ where: { id: actorId, tenantId, activo: true, aprobado: true }, select: { rol: true } });
  if (!actor?.rol || !managementRoles.includes(actor.rol)) throw Error("Tu acceso administrativo ya no está activo.");
  const target = await tx.usuario.findFirst({
    where: { id: targetId, tenantId },
    select: { id: true, rol: true, activo: true, aprobado: true, authVersion: true },
  });
  if (!target || (target.rol === "SU_ADMIN" && actor.rol !== "SU_ADMIN")) throw Error("Usuario no disponible en este sistema.");
  if (actorId === targetId) throw Error("Gestiona tu propia contraseña desde Perfil. No puedes suspender tu propia cuenta aquí.");
  return target;
}

export async function setUserAccess(token: string, targetId: number, active: boolean, reason: string) {
  try {
    const actor = await administrator(token);
    if (!Number.isSafeInteger(targetId) || targetId <= 0 || typeof active !== "boolean") throw Error("Solicitud no válida.");
    if (typeof reason !== "string" || reason.trim().length < 5 || reason.length > 500) throw Error("Escribe un motivo de 5 a 500 caracteres.");
    const result = await prisma.$transaction(async tx => {
      const target = await lockAccounts(tx, actor.userId, targetId, actor.tenantId);
      if (target.activo === active) return { changed: false };
      if (!active && managementRoles.includes(target.rol || "")) {
        const remaining = await tx.usuario.count({ where: { tenantId: actor.tenantId, activo: true, aprobado: true, rol: { in: ["ADMIN", "SU_ADMIN"] }, id: { not: targetId } } });
        if (!remaining) throw Error("Debe permanecer al menos un administrador activo.");
      }
      await tx.usuario.update({ where: { id: targetId }, data: { activo: active, authVersion: { increment: 1 } } });
      await createAuditLog({ tx, required: true, tenantId: actor.tenantId, usuarioId: actor.userId,
        accion: active ? "USER_REACTIVATED" : "USER_SUSPENDED", entidad: "Usuario", entidadId: targetId,
        detalles: { antes: { activo: target.activo }, despues: { activo: active }, motivo: reason.trim(), accesosAnterioresRevocados: true },
      });
      return { changed: true };
    });
    revalidatePath("/dashboard/usuarios/accesos");
    revalidatePath("/dashboard/usuarios/tecnicos");
    return { success: true, message: result.changed ? (active ? "Usuario reactivado. Debe iniciar sesión nuevamente." : "Usuario suspendido. Sus accesos anteriores quedaron revocados.") : "El usuario ya tiene ese estado." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo cambiar el acceso." };
  }
}

export async function resetUserPassword(token: string, targetId: number, password: string, confirmation: string) {
  try {
    const actor = await administrator(token);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) throw Error("Usuario no válido.");
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72 || !password.trim()) throw Error("Usa al menos 8 caracteres y como máximo 72 bytes.");
    if (password !== confirmation) throw Error("Las contraseñas no coinciden.");
    const hashed = await bcrypt.hash(password, 12);
    await prisma.$transaction(async tx => {
      await lockAccounts(tx, actor.userId, targetId, actor.tenantId);
      await tx.usuario.update({ where: { id: targetId }, data: { password: hashed, authVersion: { increment: 1 } } });
      // Never record plaintext or the password hash in audit data.
      await createAuditLog({ tx, required: true, tenantId: actor.tenantId, usuarioId: actor.userId,
        accion: "USER_PASSWORD_CHANGED", entidad: "Usuario", entidadId: targetId,
        detalles: { accesosAnterioresRevocados: true, cambioAdministrativo: true },
      });
    });
    return { success: true, message: "Contraseña cambiada. El usuario debe iniciar sesión nuevamente. Su estado activo o suspendido se conserva." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo cambiar la contraseña." };
  }
}
