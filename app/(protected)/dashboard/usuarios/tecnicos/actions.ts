"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { PSYCHOLOGY_TENANT_ID } from "@/lib/constants/tenants";
import { setUserAccess } from "../accesos/actions";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";

export async function getTecnicos(token: string) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const where: Prisma.UsuarioWhereInput = { tenantId: PSYCHOLOGY_TENANT_ID, rol: "TECNICO" };

    const tecnicos = await prisma.usuario.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        rol: true,
        telefono: true,
        createdAt: true,
        activo: true,
      },
    });

    return { tecnicos };
  } catch (error) {
    console.error("Error obteniendo psicólogos:", error);
    return { error: "Error al cargar los psicólogos" };
  }
}

export async function getTecnico(token: string, id: number) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const where: Prisma.UsuarioWhereInput = { id, rol: "TECNICO" };
    where.tenantId = PSYCHOLOGY_TENANT_ID;

    const tecnico = await prisma.usuario.findFirst({
      where,
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        rol: true,
        telefono: true,
        createdAt: true,
        activo: true,
      },
    });

    if (!tecnico) {
      return { error: "Psicólogo no encontrado" };
    }

    return { tecnico };
  } catch (error) {
    console.error("Error obteniendo psicólogo:", error);
    return { error: "Error al cargar el psicólogo" };
  }
}

export async function toggleTecnicoStatus(token: string, id: number, activo: boolean) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const where: Prisma.UsuarioWhereInput = { id, rol: "TECNICO" };
    where.tenantId = PSYCHOLOGY_TENANT_ID;

    // Verificar permiso
    const tecnico = await prisma.usuario.findFirst({
      where,
    });

    if (!tecnico) {
      return { error: "Psicólogo no encontrado" };
    }

    return await setUserAccess(token, id, activo, "Cambio de acceso desde el listado de psicólogos.");
  } catch (error) {
    console.error("Error cambiando estado psicólogo:", error);
    return { error: "Error al cambiar el estado del psicólogo" };
  }
}

export async function deleteTecnico(token: string, id: number) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const where: Prisma.UsuarioWhereInput = { id, rol: "TECNICO" };
    where.tenantId = PSYCHOLOGY_TENANT_ID;

    // Verificar que el usuario a eliminar sea un técnico y pertenezca al tenant (si no es SU_ADMIN)
    const tecnicoToDelete = await prisma.usuario.findFirst({
      where,
    });

    if (!tecnicoToDelete) {
      return { error: "Psicólogo no encontrado o no autorizado para eliminar" };
    }

    await prisma.usuario.delete({
      where: {
        id: id,
      },
    });

    revalidatePath("/dashboard/usuarios/tecnicos");
    return { success: true, message: "Psicólogo eliminado exitosamente" };
  } catch (error) {
    console.error("Error eliminando psicólogo:", error);
    return {
      error:
        "Error al eliminar el psicólogo. Verifique que no tenga órdenes o asignaciones asociadas.",
    };
  }
}

export async function updateTecnico(token: string, id: number, formData: FormData) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const nombre = formData.get("nombre") as string;
    const apellido = formData.get("apellido") as string;
    const telefono = formData.get("telefono") as string;
    const rol = formData.get("rol") as "SU_ADMIN" | "ADMIN" | "TECNICO" | "ASESOR";
    
    const where: Prisma.UsuarioWhereInput = { id, rol: "TECNICO" };
    where.tenantId = PSYCHOLOGY_TENANT_ID;

    // Verify tenant and role
    const tecnico = await prisma.usuario.findFirst({
      where,
    });

    if (!tecnico) {
      return { error: "Psicólogo no encontrado" };
    }

    await prisma.usuario.update({
      where: { id: id },
      data: {
        nombre,
        apellido,
        telefono,
        rol,
      },
    });

    revalidatePath("/dashboard/usuarios/tecnicos");
    return { success: true, message: "Psicólogo actualizado exitosamente" };
  } catch (error) {
    console.error("Error actualizando psicólogo:", error);
    return { error: "Error al actualizar el psicólogo" };
  }
}
