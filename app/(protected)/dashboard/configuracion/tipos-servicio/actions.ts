"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getTiposServicio(token: string) {
  const payload = verifyToken(token);

  if (!payload || (payload.role !== "ADMIN" && payload.role !== "SU_ADMIN")) {
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

    const tiposServicio = await prisma.tipoServicio.findMany({
      where: {
        tenantId: usuario.tenantId,
      },
      orderBy: {
        nombre: "asc",
      },
      include: {
        Empresa: {
          select: {
            id: true,
            nombre: true,
          }
        },
        _count: {
          select: { ordenes: true }
        }
      }
    });

    return { tiposServicio };
  } catch (error) {
    console.error("Error obteniendo tipos de servicio:", error);
    return { error: "Error al cargar los tipos de servicio" };
  }
}

export async function getEmpresasOptions(token: string) {
  const payload = verifyToken(token);

  if (!payload || (payload.role !== "ADMIN" && payload.role !== "SU_ADMIN")) {
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

export async function createTipoServicio(token: string, formData: FormData) {
  const payload = verifyToken(token);

  if (!payload || (payload.role !== "ADMIN" && payload.role !== "SU_ADMIN")) {
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

    await prisma.tipoServicio.create({
      data: {
        tenantId: usuario.tenantId,
        nombre,
        activo,
        empresaId,
      },
    });

    revalidatePath("/dashboard/configuracion/tipos-servicio");
    return { success: true, message: "Tipo de servicio creado exitosamente" };
  } catch (error) {
    console.error("Error creando tipo de servicio:", error);
    return { error: "Error al crear el tipo de servicio" };
  }
}

export async function updateTipoServicio(token: string, id: number, formData: FormData) {
  const payload = verifyToken(token);

  if (!payload || (payload.role !== "ADMIN" && payload.role !== "SU_ADMIN")) {
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

    await prisma.tipoServicio.update({
        where: { id, tenantId: usuario.tenantId },
        data: {
            nombre,
            activo,
            empresaId
        }
    });

    revalidatePath("/dashboard/configuracion/tipos-servicio");
    return { success: true, message: "Tipo de servicio actualizado exitosamente" };
  } catch (error) {
    console.error("Error actualizando tipo de servicio:", error);
    return { error: "Error al actualizar el tipo de servicio" };
  }
}

export async function deleteTipoServicio(token: string, id: number) {
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

      // Check if it has related orders
      const tipo = await prisma.tipoServicio.findUnique({
          where: { id, tenantId: usuario.tenantId },
          include: {
              _count: {
                  select: { ordenes: true }
              }
          }
      });

      if (!tipo) {
          return { error: "Tipo de servicio no encontrado" };
      }

      if (tipo._count.ordenes > 0) {
          return { error: "No se puede eliminar porque tiene órdenes de servicio asociadas." };
      }
  
      await prisma.tipoServicio.delete({
        where: { id, tenantId: usuario.tenantId },
      });
  
      revalidatePath("/dashboard/configuracion/tipos-servicio");
      return { success: true, message: "Tipo de servicio eliminado exitosamente" };
    } catch (error) {
      console.error("Error eliminando tipo de servicio:", error);
      return { error: "Error al eliminar el tipo de servicio." };
    }
  }
