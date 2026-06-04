"use server";

import prisma from "@/lib/prisma";

export async function getRecentSessions() {
  try {
    const sessions = await prisma.sesionActividad.findMany({
      where: {
        Usuario: {
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

export async function getSessionEvents(sessionId: number, page: number = 1, limit: number = 50) {
  try {
    const skip = (page - 1) * limit;

    const [eventos, total] = await Promise.all([
      prisma.logEvento.findMany({
        where: { sesionId: sessionId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.logEvento.count({
        where: { sesionId: sessionId },
      }),
    ]);

    return { success: true, data: eventos, total, page, limit };
  } catch {
    return { success: false, error: "Error al obtener eventos" };
  }
}