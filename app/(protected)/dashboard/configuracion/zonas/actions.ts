"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getZonas(token: string) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const where = usuario.rol === "SU_ADMIN" 
      ? { deletedAt: null } 
      : { tenantId: usuario.tenantId, deletedAt: null };

    const zonas = await prisma.zona.findMany({
      where,
      orderBy: {
        nombre: "asc",
      },
    });

    return { zonas };
  } catch (error) {
    console.error("Error obteniendo zonas:", error);
    return { error: "Error al cargar las zonas" };
  }
}

export async function createZona(token: string, formData: FormData) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const nombre = formData.get("nombre") as string;
    const estado = formData.get("estado") === "on"; 

    if (!nombre) {
        return { error: "El nombre es obligatorio" };
    }

    await prisma.zona.create({
      data: {
        tenantId: usuario.tenantId,
        nombre,
        estado,
      },
    });

    revalidatePath("/dashboard/configuracion/zonas");
    return { success: true, message: "Zona creada exitosamente" };
  } catch (error) {
    console.error("Error creando zona:", error);
    return { error: "Error al crear la zona" };
  }
}

export async function updateZona(token: string, id: number, formData: FormData) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const nombre = formData.get("nombre") as string;
    const estado = formData.get("estado") === "on";

    if (!nombre) {
        return { error: "El nombre es obligatorio" };
    }

    await prisma.zona.update({
        where: { id, tenantId: usuario.tenantId },
        data: {
            nombre,
            estado
        }
    });

    revalidatePath("/dashboard/configuracion/zonas");
    return { success: true, message: "Zona actualizada exitosamente" };
  } catch (error) {
    console.error("Error actualizando zona:", error);
    return { error: "Error al actualizar la zona" };
  }
}

export async function deleteZona(token: string, id: number) {
    const payload = verifyToken(token);
  
    if (!payload) {
      return { error: "No autorizado" };
    }
  
    try {
      const usuario = await prisma.usuario.findUnique({
        where: { id: payload.userId },
        select: { tenantId: true },
      });
  
      if (!usuario) {
        return { error: "Usuario no encontrado" };
      }
  
      await prisma.zona.update({
        where: { id, tenantId: usuario.tenantId },
        data: {
            deletedAt: new Date()
        }
      });
  
      revalidatePath("/dashboard/configuracion/zonas");
      return { success: true, message: "Zona eliminada exitosamente" };
    } catch (error) {
      console.error("Error eliminando zona:", error);
      return { error: "Error al eliminar la zona" };
    }
  }
