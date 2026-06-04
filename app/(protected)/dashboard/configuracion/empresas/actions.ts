"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";

export async function getEmpresas(token: string) {
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

    const where = usuario.rol === "SU_ADMIN" ? {} : { tenantId: usuario.tenantId };

    const empresas = await prisma.empresa.findMany({
      where,
      orderBy: {
        nombre: "asc",
      },
      include: {
        _count: {
          select: { servicios: true, usuarios: true, ordenesServicio: true }
        }
      }
    });

    return { empresas };
  } catch (error) {
    console.error("Error obteniendo empresas:", error);
    return { error: "Error al cargar las empresas" };
  }
}

export async function createEmpresa(token: string, formData: FormData) {
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

    if (!nombre || nombre.trim() === "") {
        return { error: "El nombre es obligatorio" };
    }

    const nuevaEmpresa = await prisma.empresa.create({
      data: {
        tenantId: usuario.tenantId,
        nombre: nombre.trim(),
        estado,
      },
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "CREATE",
      entidad: "Empresa",
      entidadId: nuevaEmpresa.id,
      detalles: {
        descripcion: "Empresa creada",
        despues: nuevaEmpresa,
      },
    });

    revalidatePath("/dashboard/configuracion/empresas");
    return { success: true, message: "Empresa creada exitosamente" };
  } catch (error) {
    console.error("Error creando empresa:", error);
    return { error: "Error al crear la empresa" };
  }
}

export async function updateEmpresa(token: string, id: number, formData: FormData) {
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

    if (!nombre || nombre.trim() === "") {
        return { error: "El nombre es obligatorio" };
    }

    const existingEmpresa = await prisma.empresa.findUnique({
        where: { id, tenantId: usuario.tenantId }
    });

    const updatedEmpresa = await prisma.empresa.update({
        where: { id, tenantId: usuario.tenantId },
        data: {
            nombre: nombre.trim(),
            estado,
        }
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "UPDATE",
      entidad: "Empresa",
      entidadId: id,
      detalles: {
        descripcion: "Empresa actualizada",
        antes: existingEmpresa,
        despues: updatedEmpresa,
      },
    });

    revalidatePath("/dashboard/configuracion/empresas");
    return { success: true, message: "Empresa actualizada exitosamente" };
  } catch (error) {
    console.error("Error actualizando empresa:", error);
    return { error: "Error al actualizar la empresa" };
  }
}

export async function deleteEmpresa(token: string, id: number) {
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
  
      // Check for related records manually to give better feedback if FK constraint fails
      const empresa = await prisma.empresa.findUnique({
        where: { id, tenantId: usuario.tenantId },
        include: {
            _count: {
                select: { servicios: true, usuarios: true, ordenesServicio: true }
            }
        }
      });

      if (!empresa) {
        return { error: "Empresa no encontrada" };
      }

      if (empresa._count.servicios > 0 || empresa._count.usuarios > 0 || empresa._count.ordenesServicio > 0) {
        return { error: "No se puede eliminar la empresa porque tiene registros asociados (servicios, usuarios u órdenes)." };
      }

      await prisma.empresa.delete({
        where: { id, tenantId: usuario.tenantId },
      });

      await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "DELETE",
        entidad: "Empresa",
        entidadId: id,
        detalles: {
          descripcion: "Empresa eliminada",
          antes: empresa,
        },
      });
  
      revalidatePath("/dashboard/configuracion/empresas");
      return { success: true, message: "Empresa eliminada exitosamente" };
    } catch (error) {
      console.error("Error eliminando empresa:", error);
      // Fallback for race conditions or other errors
      if (JSON.stringify(error).includes("Foreign key constraint failed")) {
          return { error: "No se puede eliminar la empresa porque tiene registros asociados." };
      }
      return { error: "Error al eliminar la empresa" };
    }
}

export async function getEmpresaServices(token: string, empresaId: number) {
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

    const servicios = await prisma.servicio.findMany({
      where: {
        tenantId: usuario.tenantId,
        empresaId: empresaId,
        activo: true
      },
      select: {
        id: true,
        nombre: true,
        activo: true
      },
      orderBy: {
        nombre: "asc"
      }
    });

    return { servicios };
  } catch (error) {
    console.error("Error obteniendo servicios de la empresa:", error);
    return { error: "Error al cargar los servicios de la empresa" };
  }
}

export async function getEmpresaUsers(token: string, empresaId: number) {
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

    const usuarios = await prisma.usuario.findMany({
      where: {
        tenantId: usuario.tenantId,
        empresaId: empresaId,
        activo: true
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        username: true,
        rol: true
      },
      orderBy: {
        nombre: "asc"
      }
    });

    return { usuarios };
  } catch (error) {
    console.error("Error obteniendo usuarios de la empresa:", error);
    return { error: "Error al cargar los usuarios de la empresa" };
  }
}
