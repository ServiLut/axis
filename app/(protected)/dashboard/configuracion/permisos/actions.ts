"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { TipoPermiso } from "@/prisma/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { sendPermissionRequestEmail } from "@/lib/mail";

// Solicitar un permiso
export async function requestPermission(
  token: string,
  tipo: TipoPermiso,
  entidadId?: string,
  motivo?: string
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    // Verificar si ya existe una solicitud pendiente o aprobada y vigente para lo mismo
    const existing = await prisma.permiso.findFirst({
      where: {
        tenantId: payload.tenantId,
        usuarioId: payload.userId,
        tipo,
        entidadId: entidadId || null,
        OR: [
          { estado: "PENDIENTE" },
          { 
            estado: "APROBADO",
            fechaExpiracion: { gt: new Date() }
          }
        ]
      }
    });

    if (existing) {
      if (existing.estado === "APROBADO") {
        return { message: "Ya tienes un permiso activo para esta acción." };
      }
      return { message: "Ya existe una solicitud pendiente para esta acción." };
    }

    const newPermiso = await prisma.permiso.create({
      data: {
        tenantId: payload.tenantId,
        usuarioId: payload.userId,
        tipo,
        entidadId: entidadId || null,
        motivo,
        estado: "PENDIENTE"
      }
    });

    // Enviar correo a los admins:
    // 1. SU_ADMIN globales
    // 2. ADMIN del tenant actual
    // 3. ADMIN del tenant principal (ID 1) - para soporte centralizado
    const admins = await prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [
          { rol: "SU_ADMIN" },
          { 
            rol: "ADMIN",
            tenantId: { in: [payload.tenantId, 1] } 
          }
        ]
      },
      select: { email: true }
    });

    console.log(`Solicitud de permiso: tenantId=${payload.tenantId}, admins encontrados=${admins.length}`);

    const solicitanteName = `${payload.nombre} ${payload.apellido}`;
    const adminEmails = admins.map(a => a.email).filter((e): e is string => !!e);

    if (adminEmails.length > 0) {
        try {
            await sendPermissionRequestEmail(
                adminEmails,
                newPermiso.id,
                solicitanteName,
                tipo,
                motivo || ""
            );
        } catch (err) {
            console.error("Error sending permission emails:", err);
        }
    }

    revalidatePath("/dashboard/configuracion/permisos");
    return { success: true, message: "Solicitud de permiso enviada." };
  } catch (error) {
    console.error("Error requesting permission:", error);
    return { error: "Error al solicitar permiso." };
  }
}

// Obtener solicitudes pendientes (para admin)
export async function getPendingPermissions(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  // Solo ADMIN y SU_ADMIN pueden ver solicitudes de otros
  // Asesor/Tecnico no deberian ver esto, pero si lo ven, que sea vacio o error
  if (!["ADMIN", "SU_ADMIN"].includes(payload.role)) {
    return { error: "Permiso denegado" };
  }

  try {
    const permisos = await prisma.permiso.findMany({
      where: {
        tenantId: payload.tenantId,
        estado: "PENDIENTE"
      },
      include: {
        usuario: {
          select: {
            nombre: true,
            apellido: true,
            email: true,
            rol: true
          }
        }
      },
      orderBy: {
        fechaSolicitud: "desc"
      }
    });

    return { permisos };
  } catch (error) {
    console.error("Error fetching pending permissions:", error);
    return { error: "Error al obtener permisos pendientes." };
  }
}

// Aprobar permiso
export async function approvePermission(
  token: string, 
  permisoId: number, 
  durationMinutes: number = 60
) {
  const payload = verifyToken(token);
  if (!payload || !["ADMIN", "SU_ADMIN"].includes(payload.role)) {
    return { error: "No autorizado" };
  }

  try {
    const fechaExpiracion = new Date();
    fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + durationMinutes);

    await prisma.permiso.update({
      where: { id: permisoId },
      data: {
        estado: "APROBADO",
        adminId: payload.userId,
        fechaAprobacion: new Date(),
        fechaExpiracion
      }
    });

    revalidatePath("/dashboard/configuracion/permisos");
    return { success: true, message: "Permiso aprobado." };
  } catch (error) {
    console.error("Error approving permission:", error);
    return { error: "Error al aprobar permiso." };
  }
}

// Rechazar permiso
export async function rejectPermission(token: string, permisoId: number) {
  const payload = verifyToken(token);
  if (!payload || !["ADMIN", "SU_ADMIN"].includes(payload.role)) {
    return { error: "No autorizado" };
  }

  try {
    await prisma.permiso.update({
      where: { id: permisoId },
      data: {
        estado: "RECHAZADO",
        adminId: payload.userId,
        fechaAprobacion: new Date() // Se usa para saber cuando se tomó la decisión
      }
    });

    revalidatePath("/dashboard/configuracion/permisos");
    return { success: true, message: "Permiso rechazado." };
  } catch (error) {
    console.error("Error rejecting permission:", error);
    return { error: "Error al rechazar permiso." };
  }
}

// Verificar si el usuario tiene permiso activo
export async function checkPermission(
  token: string,
  tipo: TipoPermiso,
  entidadId?: string
) {
  const payload = verifyToken(token);
  if (!payload) return { allowed: false };

  // SU_ADMIN siempre tiene permiso (opcional, dependiendo de reglas de negocio)
  if (payload.role === "SU_ADMIN") return { allowed: true };
  
  // ADMIN normalmente tiene permisos, pero si el requerimiento es estricto granular, 
  // podríamos requerir que incluso admin solicite, pero asumiremos que Admin tiene acceso.
  if (payload.role === "ADMIN") return { allowed: true };

  try {
    const permiso = await prisma.permiso.findFirst({
      where: {
        tenantId: payload.tenantId,
        usuarioId: payload.userId,
        tipo,
        entidadId: entidadId || null,
        estado: "APROBADO",
        fechaExpiracion: { gt: new Date() }
      }
    });

    return { allowed: !!permiso };
  } catch (error) {
    console.error("Error checking permission:", error);
    return { allowed: false };
  }
}

// Obtener historial de permisos (para admin)
export async function getPermissionHistory(token: string) {
    const payload = verifyToken(token);
    if (!payload || !["ADMIN", "SU_ADMIN"].includes(payload.role)) {
      return { error: "No autorizado" };
    }
  
    try {
      const permisos = await prisma.permiso.findMany({
        where: {
          tenantId: payload.tenantId,
          estado: { not: "PENDIENTE" }
        },
        include: {
          usuario: {
            select: {
              nombre: true,
              apellido: true
            }
          },
          admin: {
            select: {
              nombre: true,
              apellido: true
            }
          }
        },
        orderBy: {
          fechaSolicitud: "desc"
        },
        take: 100 // Limitar ultimos 100
      });
  
      return { permisos };
    } catch (error) {
      console.error("Error fetching permission history:", error);
      return { error: "Error al obtener historial." };
    }
  }

// Check status of a specific permission for the current user (to show pending status)
export async function getMyPermissionStatus(token: string, tipo: TipoPermiso, entidadId?: string) {
    const payload = verifyToken(token);
    if (!payload) return { status: null };

    try {
        const permiso = await prisma.permiso.findFirst({
            where: {
                tenantId: payload.tenantId,
                usuarioId: payload.userId,
                tipo,
                entidadId: entidadId || null,
                OR: [
                    { estado: "PENDIENTE" },
                    { 
                      estado: "APROBADO",
                      fechaExpiracion: { gt: new Date() }
                    },
                    {
                      estado: "RECHAZADO",
                      // Show rejected status only for a short time or recent
                      fechaAprobacion: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
                    }
                ]
            },
            orderBy: {
                fechaSolicitud: 'desc'
            }
        });
        
        return { permiso };
    } catch (error) {
        return { status: null, error };
    }
}
