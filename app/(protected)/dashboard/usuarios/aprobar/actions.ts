"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";

import { Rol } from "@/prisma/generated/prisma/client";

export async function getUsuariosPendientes(token: string, status: boolean | null = false) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    // Verify admin role if necessary, or just tenant isolation
    const usuarioAdmin = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuarioAdmin) return { error: "Usuario no encontrado" };
    
    // Only Admin can approve? Or maybe others? Assuming Admin for now.
    // if (usuarioAdmin.rol !== "ADMIN") return { error: "No tiene permisos" };

    const usuarios = await prisma.usuario.findMany({
      where: {
        tenantId: usuarioAdmin.tenantId,
        aprobado: {
          equals: status
        },
        // Exclude the current user just in case
        NOT: {
          id: payload.userId
        }
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        username: true,
        rol: true,
        createdAt: true,
        tipoDocumento: true,
        numeroDocumento: true,
        telefono: true,
        empresa: {
          select: {
            id: true,
            nombre: true
          }
        }
      }
    });

    return { usuarios };
  } catch (error) {
    console.error("Error cargando usuarios pendientes:", error);
    return { error: "Error al cargar usuarios" };
  }
}

export async function aprobarUsuario(token: string, userId: number, data: { rol: Rol; empresaId: number | null }) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuarioAdmin = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuarioAdmin) return { error: "Usuario no encontrado" };

    const usuarioPrevio = await prisma.usuario.findUnique({
      where: { id: userId, tenantId: usuarioAdmin.tenantId }
    });

    const updatedUser = await prisma.usuario.update({
      where: {
        id: userId,
        tenantId: usuarioAdmin.tenantId // Ensure same tenant
      },
      data: {
        aprobado: true,
        activo: true, // Ensure they are active too upon approval
        rol: data.rol,
        empresaId: data.empresaId
      }
    });

    await createAuditLog({
      tenantId: usuarioAdmin.tenantId,
      usuarioId: payload.userId,
      accion: "UPDATE",
      entidad: "Usuario",
      entidadId: userId,
      detalles: {
        descripcion: "Usuario aprobado",
        antes: usuarioPrevio,
        despues: updatedUser,
      },
    });

    revalidatePath("/dashboard/usuarios/aprobar");
    revalidatePath("/dashboard/usuarios");
    return { success: true, message: "Usuario aprobado correctamente" };
  } catch (error) {
    console.error("Error aprobando usuario:", error);
    return { error: "Error al aprobar usuario" };
  }
}

export async function getEmpresasOptions(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const empresas = await prisma.empresa.findMany({
      where: {
        tenantId: usuario.tenantId,
      },
      select: {
        id: true,
        nombre: true,
      },
      orderBy: {
        nombre: "asc",
      },
    });

    return { empresas };
  } catch (error) {
    console.error("Error obteniendo empresas:", error);
    return { error: "Error al cargar las empresas" };
  }
}

export async function rechazarUsuario(token: string, userId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuarioAdmin = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuarioAdmin) return { error: "Usuario no encontrado" };

    const usuarioPrevio = await prisma.usuario.findUnique({
      where: { id: userId, tenantId: usuarioAdmin.tenantId }
    });

    // We mark as rejected (aprobado: null) instead of deleting.
    await prisma.usuario.update({
      where: {
        id: userId,
        tenantId: usuarioAdmin.tenantId
      },
      data: {
        aprobado: null // New Logic: null is Rejected
      }
    });

    await createAuditLog({
      tenantId: usuarioAdmin.tenantId,
      usuarioId: payload.userId,
      accion: "UPDATE",
      entidad: "Usuario",
      entidadId: userId,
      detalles: {
        descripcion: "Usuario rechazado",
        antes: usuarioPrevio,
        despues: { aprobado: null },
      },
    });

    revalidatePath("/dashboard/usuarios/aprobar");
    return { success: true, message: "Solicitud rechazada correctamente" };
  } catch (error) {
    console.error("Error rechazando usuario:", error);
    return { error: "Error al rechazar usuario" };
  }
}
