"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";

export async function getEgresos(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!user) return { success: false as const, error: "Usuario no encontrado" };

    const whereClause: Prisma.EgresosWhereInput = {};
    if (user.rol !== "SU_ADMIN") {
      whereClause.tenantId = user.tenantId;
    }

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
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!user) return { success: false as const, error: "Usuario no encontrado" };

    const whereClause: Prisma.UsuarioWhereInput = {
      activo: true,
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
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!user) return { success: false as const, error: "Usuario no encontrado" };

    const egreso = await prisma.egresos.create({
      data: {
        userId: data.userId || null,
        monto: data.monto,
        razon: data.razon,
        titulo: data.titulo,
        tenantId: user.tenantId,
      },
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
    const egreso = await prisma.egresos.update({
      where: { id: BigInt(id) },
      data: {
        userId: data.userId || null,
        monto: data.monto,
        razon: data.razon,
        titulo: data.titulo,
      },
    });

    revalidatePath("/dashboard/contabilidad/egresos");
    return { success: true as const, data: { ...egreso, id: egreso.id.toString() } };
  } catch (error) {
    console.error("Error updating egreso:", error);
    return { success: false as const, error: "Error al actualizar egreso" };
  }
}

export async function deleteEgreso(token: string, id: string) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    await prisma.egresos.delete({
      where: { id: BigInt(id) },
    });

    revalidatePath("/dashboard/contabilidad/egresos");
    return { success: true as const };
  } catch (error) {
    console.error("Error deleting egreso:", error);
    return { success: false as const, error: "Error al eliminar egreso" };
  }
}
