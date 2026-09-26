"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { requireFinanceUser } from "@/lib/psychology-access";
import { createAuditLog } from "@/lib/audit";
import { cajaAmountInCents } from "@/lib/caja";

async function validExpense(data: { userId?: number; monto: number; razon: string; titulo: string }, tenantId: number) {
  if (!Number.isFinite(data.monto)) throw new Error("Monto inválido.");
  const amount = cajaAmountInCents(String(data.monto)) / 100;
  if (!data.titulo.trim() || !data.razon.trim() || data.titulo.length > 120 || data.razon.length > 1000) throw new Error("Indica título y motivo válidos.");
  if (data.userId && !(await prisma.usuario.findFirst({ where: { id: data.userId, tenantId }, select: { id: true } }))) throw new Error("El responsable no pertenece al sistema.");
  return { userId: data.userId || null, monto: amount, titulo: data.titulo.trim(), razon: data.razon.trim() };
}

export async function getEgresos(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await requireFinanceUser(token);
    const whereClause: Prisma.EgresosWhereInput = { tenantId: user.tenantId };

    const egresos = await prisma.egresos.findMany({
      where: whereClause,
      include: {
        Usuario: {
          select: {
            nombre: true,
            apellido: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    // Serialize BigInt and Date
    const serializedEgresos = egresos.map((e) => ({
      ...e,
      id: e.id.toString(),
      created_at: e.created_at.toISOString(),
    }));

    return { success: true as const, data: serializedEgresos };
  } catch (error) {
    console.error("Error fetching egresos:", error);
    return { success: false as const, error: "Error al cargar egresos" };
  }
}

export async function getUsuarios(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await requireFinanceUser(token);

    const whereClause: Prisma.UsuarioWhereInput = {
      activo: true,
      tenantId: user.tenantId,
    };

    if (user.rol !== "SU_ADMIN") {
      whereClause.tenantId = user.tenantId;
    }

    const usuarios = await prisma.usuario.findMany({
      where: whereClause,
      select: {
        id: true,
        nombre: true,
        apellido: true,
      },
      orderBy: {
        nombre: "asc",
      },
    });

    return { success: true as const, data: usuarios };
  } catch (error) {
    console.error("Error fetching usuarios:", error);
    return { success: false as const, error: "Error al cargar usuarios" };
  }
}

export async function createEgreso(
  token: string,
  data: { userId?: number; monto: number; razon: string; titulo: string }
) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await requireFinanceUser(token);
    if (user.tenantId === 4 && process.env.NEXT_PUBLIC_RECEPCION_ENABLED === "true")
      return { success: false as const, error: "Registra el gasto en Contabilidad → Caja diaria para que aparezca una sola vez con fecha y medio de pago." };
    const values = await validExpense(data, user.tenantId);
    const egreso = await prisma.$transaction(async (tx) => {
      const row = await tx.egresos.create({ data: { ...values, tenantId: user.tenantId } });
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "CREATE", entidad: "Egreso", entidadId: row.id.toString(), detalles: values, tx });
      return row;
    });

    revalidatePath("/dashboard/contabilidad/egresos");
    return { success: true as const, data: { ...egreso, id: egreso.id.toString() } };
  } catch (error) {
    console.error("Error creating egreso:", error);
    return { success: false as const, error: "Error al crear egreso" };
  }
}

export async function updateEgreso(
  token: string,
  id: string,
  data: { userId?: number; monto: number; razon: string; titulo: string }
) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await requireFinanceUser(token, true);
    const values = await validExpense(data, user.tenantId);
    const egreso = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${user.tenantId} FOR UPDATE`;
      const before = await tx.egresos.findFirst({ where: { id: BigInt(id), tenantId: user.tenantId } });
      if (!before || (before.monto || 0) <= 0) throw new Error("Egreso no disponible para editar.");
      const reversed = await tx.auditoria.findFirst({ where: { tenantId: user.tenantId, entidad: "Egreso", entidadId: id, accion: "REVERSE" } });
      if (reversed) throw new Error("El egreso ya fue anulado.");
      const row = await tx.egresos.update({ where: { id: BigInt(id), tenantId: user.tenantId }, data: values });
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "UPDATE", entidad: "Egreso", entidadId: id,
        detalles: { antes: { monto: before.monto, titulo: before.titulo, razon: before.razon, userId: before.userId }, despues: values }, tx });
      return row;
    });

    revalidatePath("/dashboard/contabilidad/egresos");
    return { success: true as const, data: { ...egreso, id: egreso.id.toString() } };
  } catch (error) {
    console.error("Error updating egreso:", error);
    return { success: false as const, error: "Error al actualizar egreso" };
  }
}

export async function deleteEgreso(token: string, id: string, motivo: string) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await requireFinanceUser(token, true);
    const reason = motivo.trim();
    if (reason.length < 5 || reason.length > 240) throw new Error("Indica el motivo de la anulación (5 a 240 caracteres).");
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${user.tenantId} FOR UPDATE`;
      const before = await tx.egresos.findFirst({ where: { id: BigInt(id), tenantId: user.tenantId } });
      if (!before || (before.monto || 0) <= 0) throw new Error("Egreso no disponible para anular.");
      const reversed = await tx.auditoria.findFirst({ where: { tenantId: user.tenantId, entidad: "Egreso", entidadId: id, accion: "REVERSE" } });
      if (reversed) return;
      const reversal = await tx.egresos.create({ data: { tenantId: user.tenantId, userId: before.userId,
        monto: -(before.monto || 0), titulo: `Anulación de egreso ${id}`, razon: reason } });
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "REVERSE", entidad: "Egreso", entidadId: id,
        detalles: { monto: before.monto, motivo: reason, reversoId: reversal.id.toString() }, tx });
    });

    revalidatePath("/dashboard/contabilidad/egresos");
    return { success: true as const };
  } catch (error) {
    console.error("Error deleting egreso:", error);
    return { success: false as const, error: error instanceof Error && error.name === "Error" ? error.message : "Error al anular egreso" };
  }
}
