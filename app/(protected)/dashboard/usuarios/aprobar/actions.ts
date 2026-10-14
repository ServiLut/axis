"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { PSYCHOLOGY_TENANT_ID } from "@/lib/constants/tenants";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";

import { Rol } from "@/prisma/generated/prisma/client";

export async function getUsuariosPendientes(token: string, status: boolean | null = false) {
  const payload = await verifyToken(token);
  if (!payload) return { error: "No autorizado" };
  if (payload.role !== "ADMIN" && payload.role !== "SU_ADMIN") return { error: "Solo administradores pueden gestionar solicitudes de acceso." };

  try {
    // Verify admin role if necessary, or just tenant isolation
    const usuarioAdmin = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true, rol: true },
    });

    if (!usuarioAdmin) return { error: "Usuario no encontrado" };
    
    // Only Admin can approve? Or maybe others? Assuming Admin for now.
    // if (usuarioAdmin.rol !== "ADMIN") return { error: "No tiene permisos" };

    const usuarios = await prisma.usuario.findMany({
      where: {
        tenantId: PSYCHOLOGY_TENANT_ID,
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
  const payload = await verifyToken(token);
  if (!payload) return { error: "No autorizado" };
  if (payload.role !== "ADMIN" && payload.role !== "SU_ADMIN") return { error: "Solo administradores pueden gestionar solicitudes de acceso." };

  try {
    const usuarioAdmin = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true },
    });

    if (!usuarioAdmin) return { error: "Usuario no encontrado" };

    const companyOptions = await getEmpresasOptions(token);
    if (companyOptions.error) return { error: companyOptions.error };
    const normalizeCompanyName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
    const exactCompanies = companyOptions.empresas?.filter((empresa) => normalizeCompanyName(empresa.nombre) === "PSICOLOGOS") || [];
    const companies = exactCompanies.length ? exactCompanies : companyOptions.empresas?.filter((empresa) => normalizeCompanyName(empresa.nombre) === "PSICOLOGOS EN COLOMBIA") || [];
    if (companies.length !== 1) return { error: "No se pudo identificar la empresa Psicólogos en Colombia. Revisa su configuración antes de aprobar el acceso." };

    const usuarioPrevio = await prisma.usuario.findUnique({
      where: { id: userId, tenantId: PSYCHOLOGY_TENANT_ID }
    });

    if (!usuarioPrevio) return { error: "Solicitud no encontrada en Psicólogos en Colombia." };

    const updatedUser = await prisma.usuario.update({
      where: {
        id: userId,
        tenantId: PSYCHOLOGY_TENANT_ID // Ensure same tenant
      },
      data: {
        aprobado: true,
        activo: true, // Ensure they are active too upon approval
        rol: data.rol,
        empresaId: companies[0].id
      }
    });

    await createAuditLog({
      tenantId: PSYCHOLOGY_TENANT_ID,
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
  const payload = await verifyToken(token);
  if (!payload) return { error: "No autorizado" };
  if (payload.role !== "ADMIN" && payload.role !== "SU_ADMIN") return { error: "Solo administradores pueden gestionar solicitudes de acceso." };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const empresas = await prisma.empresa.findMany({
      where: {
        tenantId: PSYCHOLOGY_TENANT_ID,
        estado: true,
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
  const payload = await verifyToken(token);
  if (!payload) return { error: "No autorizado" };
  if (payload.role !== "ADMIN" && payload.role !== "SU_ADMIN") return { error: "Solo administradores pueden gestionar solicitudes de acceso." };

  try {
    const usuarioAdmin = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true },
    });

    if (!usuarioAdmin) return { error: "Usuario no encontrado" };

    const usuarioPrevio = await prisma.usuario.findUnique({
      where: { id: userId, tenantId: PSYCHOLOGY_TENANT_ID }
    });

    if (!usuarioPrevio) return { error: "Solicitud no encontrada en Psicólogos en Colombia." };

    // We mark as rejected (aprobado: null) instead of deleting.
    await prisma.usuario.update({
      where: {
        id: userId,
        tenantId: PSYCHOLOGY_TENANT_ID
      },
      data: {
        aprobado: null // New Logic: null is Rejected
      }
    });

    await createAuditLog({
      tenantId: PSYCHOLOGY_TENANT_ID,
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
