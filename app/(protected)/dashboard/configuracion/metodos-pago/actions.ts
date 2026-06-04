"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getMetodosPago(token: string) {
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

    const metodosPago = await prisma.metodoPago.findMany({
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

    return { metodosPago };
  } catch (error) {
    console.error("Error obteniendo métodos de pago:", error);
    return { error: "Error al cargar los métodos de pago" };
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

export async function createMetodoPago(token: string, formData: FormData) {
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

    await prisma.metodoPago.create({
      data: {
        tenantId: usuario.tenantId,
        nombre,
        activo,
        empresaId,
      },
    });

    revalidatePath("/dashboard/configuracion/metodos-pago");
    return { success: true, message: "Método de pago creado exitosamente" };
  } catch (error) {
    console.error("Error creando método de pago:", error);
    return { error: "Error al crear el método de pago" };
  }
}

export async function updateMetodoPago(token: string, id: number, formData: FormData) {
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

    await prisma.metodoPago.update({
        where: { id, tenantId: usuario.tenantId },
        data: {
            nombre,
            activo,
            empresaId
        }
    });

    revalidatePath("/dashboard/configuracion/metodos-pago");
    return { success: true, message: "Método de pago actualizado exitosamente" };
  } catch (error) {
    console.error("Error actualizando método de pago:", error);
    return { error: "Error al actualizar el método de pago" };
  }
}

export async function deleteMetodoPago(token: string, id: number) {
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

      // Check if it has related orders
      const metodo = await prisma.metodoPago.findUnique({
          where: { id, tenantId: usuario.tenantId },
          include: {
              _count: {
                  select: { ordenes: true }
              }
          }
      });

      if (!metodo) {
          return { error: "Método de pago no encontrado" };
      }

      if (metodo._count.ordenes > 0) {
          return { error: "No se puede eliminar porque tiene órdenes de servicio asociadas." };
      }
  
      await prisma.metodoPago.delete({
        where: { id, tenantId: usuario.tenantId },
      });
  
      revalidatePath("/dashboard/configuracion/metodos-pago");
      return { success: true, message: "Método de pago eliminado exitosamente" };
    } catch (error) {
      console.error("Error eliminando método de pago:", error);
      return { error: "Error al eliminar el método de pago." };
    }
  }
