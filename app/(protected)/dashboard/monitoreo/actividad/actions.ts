"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { PSYCHOLOGY_TENANT_ID } from "@/lib/psychology";

const isPsychologyAdmin = async (token: string) => {
  const payload = await verifyToken(token);
  if (!payload || !["ADMIN", "SU_ADMIN"].includes(payload.role)) return false;
  return !!(await prisma.usuario.findFirst({
    where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true, rol: { in: ["ADMIN", "SU_ADMIN"] } },
    select: { id: true },
  }));
};

export async function getRecentSessions(token: string) {
  try {
    if (!(await isPsychologyAdmin(token))) return { success: false, error: "No autorizado" };
    const sessions = await prisma.sesionActividad.findMany({
      where: {
        Usuario: {
          tenantId: PSYCHOLOGY_TENANT_ID,
          rol: {
            in: ["SU_ADMIN", "ADMIN", "ASESOR"],
          },
        },
      },
      include: {
        Usuario: {
          select: {
            nombre: true,
            apellido: true,
            username: true,
          },
        },
        _count: {
          select: { LogEvento: true },
        },
      },
      orderBy: {
        fechaInicio: "desc",
      },
      take: 50,
    });

    return { success: true, data: sessions };
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return { success: false, error: "Error al obtener sesiones" };
  }
}

export async function getSessionEvents(token: string, sessionId: number, page: number = 1, limit: number = 50) {
  try {
    if (!(await isPsychologyAdmin(token))) return { success: false, error: "No autorizado" };
    if (!Number.isSafeInteger(sessionId) || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return { success: false, error: "Parámetros de consulta inválidos" };
    }
    const skip = (page - 1) * limit;
    const where = {
      sesionId: sessionId,
      SesionActividad: { Usuario: { tenantId: PSYCHOLOGY_TENANT_ID } },
    };

    const [eventos, total] = await Promise.all([
      prisma.logEvento.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.logEvento.count({
        where,
      }),
    ]);

    return { success: true, data: eventos, total, page, limit };
  } catch {
    return { success: false, error: "Error al obtener eventos" };
  }
}
