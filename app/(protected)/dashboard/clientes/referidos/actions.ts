"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { Prisma } from "@/prisma/generated/prisma/client";

export async function getReferidos(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const whereClause: Prisma.ReferidosWhereInput = {};

    if (usuario.rol !== "SU_ADMIN") {
      whereClause.Usuario = {
        tenantId: usuario.tenantId,
      };
    }

    const referidos = await prisma.referidos.findMany({
      where: whereClause,
      include: {
        Usuario: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            rol: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    const serializedReferidos = referidos.map((r) => ({
      ...r,
      id: r.id.toString(),
    }));

    return { referidos: serializedReferidos };
  } catch (error) {
    console.error("Error obteniendo referidos:", error);
    return { error: "Error al cargar referidos" };
  }
}
