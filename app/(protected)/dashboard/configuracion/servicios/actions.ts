"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";

export async function getServicios(token: string) {
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
      ? { deleteAt: null }
      : { tenantId: usuario.tenantId, deleteAt: null };

    const servicios = await prisma.servicio.findMany({
      where,
      orderBy: {
        nombre: "asc",
      },
      include: {
        empresa: {
          select: {
            id: true,
            nombre: true,
          }
        }
      }
    });

    return { servicios };
  } catch (error) {
    console.error("Error obteniendo servicios:", error);
    return { error: "Error al cargar los servicios" };
  }
}

export async function getEmpresasOptions(token: string) {
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

export async function createServicio(token: string, formData: FormData) {
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
    const activo = formData.get("activo") === "on";
    const empresaId = formData.get("empresaId") ? parseInt(formData.get("empresaId") as string) : null;

    if (!nombre) {
        return { error: "El nombre es obligatorio" };
    }

    const nuevoServicio = await prisma.servicio.create({
      data: {
        tenantId: usuario.tenantId,
        nombre,
        activo,
        empresaId,
      },
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "CREATE",
      entidad: "ServicioConfig",
      entidadId: nuevoServicio.id,
      detalles: {
        descripcion: "Servicio creado en configuración",
        despues: nuevoServicio,
      },
    });

    revalidatePath("/dashboard/configuracion/servicios");
    return { success: true, message: "Servicio creado exitosamente" };
  } catch (error) {
    console.error("Error creando servicio:", error);
    return { error: "Error al crear el servicio" };
  }
}

export async function updateServicio(token: string, id: number, formData: FormData) {
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
    const activo = formData.get("activo") === "on";
    const empresaId = formData.get("empresaId") ? parseInt(formData.get("empresaId") as string) : null;

    if (!nombre) {
        return { error: "El nombre es obligatorio" };
    }

    const existingServicio = await prisma.servicio.findUnique({
        where: { id, tenantId: usuario.tenantId }
    });

    const updatedServicio = await prisma.servicio.update({
        where: { id, tenantId: usuario.tenantId },
        data: {
            nombre,
            activo,
            empresaId
        }
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "UPDATE",
      entidad: "ServicioConfig",
      entidadId: id,
      detalles: {
        descripcion: "Servicio de configuración actualizado",
        antes: existingServicio,
        despues: updatedServicio,
      },
    });

    revalidatePath("/dashboard/configuracion/servicios");
    return { success: true, message: "Servicio actualizado exitosamente" };
  } catch (error) {
    console.error("Error actualizando servicio:", error);
    return { error: "Error al actualizar el servicio" };
  }
}

export async function deleteServicio(token: string, id: number) {
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
  
      const servicio = await prisma.servicio.findUnique({
        where: { id, tenantId: usuario.tenantId }
      });

      await prisma.servicio.update({
        where: { id, tenantId: usuario.tenantId },
        data: {
            deleteAt: new Date(),
        }
      });

      await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "DELETE",
        entidad: "ServicioConfig",
        entidadId: id,
        detalles: {
          descripcion: "Servicio de configuración eliminado (Soft Delete)",
          antes: servicio,
        },
      });
  
      revalidatePath("/dashboard/configuracion/servicios");
      return { success: true, message: "Servicio eliminado exitosamente" };
    } catch (error) {
      console.error("Error eliminando servicio:", error);
      return { error: "Error al eliminar el servicio. Verifique que no tenga órdenes de servicio asociadas." };
    }
  }