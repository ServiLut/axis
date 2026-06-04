"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";

export async function getAnticipos(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!user) return { success: false as const, error: "Usuario no encontrado" };

    const whereClause: Prisma.AnticiposWhereInput = {};
    if (user.rol !== "SU_ADMIN") {
      whereClause.tenantId = user.tenantId;
    }

    const anticipos = await prisma.anticipos.findMany({
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
    const serializedAnticipos = anticipos.map((a) => ({
      ...a,
      id: a.id.toString(),
      created_at: a.created_at.toISOString(),
    }));

    return { success: true as const, data: serializedAnticipos };
  } catch (error) {
    console.error("Error fetching anticipos:", error);
    return { success: false as const, error: "Error al cargar anticipos" };
  }
}

export async function getTecnicos(token: string) {
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

    const tecnicos = await prisma.usuario.findMany({
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

    return { success: true as const, data: tecnicos };
  } catch (error) {
    console.error("Error fetching tecnicos:", error);
    return { success: false as const, error: "Error al cargar técnicos" };
  }
}

export async function createAnticipo(
  token: string,
  data: { usuarioId: number; monto: number; razon: string }
) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!user) return { success: false as const, error: "Usuario no encontrado" };

    const anticipo = await prisma.anticipos.create({
      data: {
        usuarioId: data.usuarioId,
        monto: data.monto,
        razon: data.razon,
        tenantId: user.tenantId,
      },
    });

    revalidatePath("/dashboard/contabilidad/anticipos");
    return { success: true as const, data: { ...anticipo, id: anticipo.id.toString() } };
  } catch (error) {
    console.error("Error creating anticipo:", error);
    return { success: false as const, error: "Error al crear anticipo" };
  }
}

export async function updateAnticipo(
  token: string,
  id: string,
  data: { usuarioId: number; monto: number; razon: string }
) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const anticipo = await prisma.anticipos.update({
      where: { id: BigInt(id) },
      data: {
        usuarioId: data.usuarioId,
        monto: data.monto,
        razon: data.razon,
      },
    });

    revalidatePath("/dashboard/contabilidad/anticipos");
    return { success: true as const, data: { ...anticipo, id: anticipo.id.toString() } };
  } catch (error) {
    console.error("Error updating anticipo:", error);
    return { success: false as const, error: "Error al actualizar anticipo" };
  }
}

export async function deleteAnticipo(token: string, id: string) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    await prisma.anticipos.delete({
      where: { id: BigInt(id) },
    });

    revalidatePath("/dashboard/contabilidad/anticipos");
    return { success: true as const };
  } catch (error) {
    console.error("Error deleting anticipo:", error);
    return { success: false as const, error: "Error al eliminar anticipo" };
  }
}
