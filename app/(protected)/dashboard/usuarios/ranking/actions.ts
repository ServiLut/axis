"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { startOfDay, endOfDay } from "date-fns";

export async function getUserRanking(token: string, startDate?: string, endDate?: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const baseWhere =
      usuario.rol === "SU_ADMIN" ? {} : { tenantId: usuario.tenantId };

    // Fetch all eligible users first
    const users = await prisma.usuario.findMany({
      where: {
        rol: { in: ["ADMIN", "SU_ADMIN", "ASESOR"] },
        activo: true,
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        rol: true,
        email: true,
      },
    });

    if (users.length === 0) {
      return { ranking: [] };
    }

    const start = startDate ? startOfDay(new Date(startDate)) : new Date("2026-01-01T00:00:00");
    const end = endDate ? endOfDay(new Date(endDate)) : new Date();

    // Fetch all services for these users to aggregate in memory
    const allServices = await prisma.ordenServicio.findMany({
      where: {
        ...baseWhere,
        creadoPorId: { in: users.map((u) => u.id) },
        fechaVisita: {
          gte: start,
          lte: end,
        },
      },
      select: {
        creadoPorId: true,
        valorPagado: true,
        estadoServicio: { select: { nombre: true } },
        metodoPago: { select: { nombre: true } },
      },
    });

    // Combine data
    const fullRanking = users
      .map((user) => {
        const userServices = allServices.filter((s) => s.creadoPorId === user.id);
        
        const totalLiquidado = userServices
          .filter(
            (s) =>
              s.estadoServicio.nombre === "Liquidado" &&
              s.metodoPago?.nombre !== "por cobrar",
          )
          .reduce((acc, s) => acc + Number(s.valorPagado || 0), 0);

        return {
          userId: user.id,
          nombre: user.nombre,
          apellido: user.apellido,
          rol: user.rol,
          email: user.email,
          cantidadServicios: userServices.length,
          totalLiquidado,
        };
      })
      .sort((a, b) => b.totalLiquidado - a.totalLiquidado);

    return { ranking: fullRanking };
  } catch (error) {
    console.error("Error fetching user ranking:", error);
    return { error: "Error al cargar el ranking" };
  }
}

export async function getUserDetails(token: string, targetUserId: number, startDate?: string, endDate?: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const baseWhere =
      usuario.rol === "SU_ADMIN" ? {} : { tenantId: usuario.tenantId };

    const start = startDate ? startOfDay(new Date(startDate)) : new Date("2026-01-01T00:00:00");
    const end = endDate ? endOfDay(new Date(endDate)) : new Date();

    // Fetch all services created by this user
    const services = await prisma.ordenServicio.findMany({
      where: {
        ...baseWhere,
        creadoPorId: targetUserId,
        fechaVisita: {
          gte: start,
          lte: end,
        },
      },
      select: {
        id: true,
        numeroOrden: true,
        fechaVisita: true,
        valorPagado: true,
        estadoServicio: {
          select: { nombre: true },
        },
        metodoPago: {
          select: { nombre: true },
        },
        cliente: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
          },
        },
        tipoServicio: {
          select: { nombre: true },
        },
      },
      orderBy: {
        fechaVisita: "desc",
      },
    });

    // KPI Calculation
    const totalServices = services.length;

    const liquidatedServices = services.filter(
      (s) => s.estadoServicio.nombre === "Liquidado",
    );

    const paidServices = liquidatedServices.filter(
      (s) => s.metodoPago?.nombre !== "por cobrar",
    );

    const totalLiquidadoCount = liquidatedServices.length;

    const effectivenessPercentage =
      totalServices > 0 ? (totalLiquidadoCount / totalServices) * 100 : 0;

    const recaudoNuevo = paidServices
      .filter((s) => s.tipoServicio?.nombre?.toLowerCase().includes("nuevo"))
      .reduce((acc, s) => acc + Number(s.valorPagado || 0), 0);

    const recaudoRefuerzo = paidServices
      .filter((s) => s.tipoServicio?.nombre?.toLowerCase().includes("refuerzo"))
      .reduce((acc, s) => acc + Number(s.valorPagado || 0), 0);

    // Count clients created by this user
    const totalClientsCreated = await prisma.cliente.count({
      where: {
        ...baseWhere,
        creadoPorId: targetUserId,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
    });

    return {
      services: services.map((s) => ({
        id: s.id,
        numeroOrden: s.numeroOrden,
        fechaVisita: s.fechaVisita,
        cliente: `${s.cliente.nombre || ""} ${s.cliente.apellido || ""}`.trim(),
        estado: s.estadoServicio.nombre,
        valorPagado: Number(s.valorPagado || 0),
        tipo: s.tipoServicio?.nombre || "N/A",
      })),
      kpi: {
        totalServicios: totalServices,
        clientesEfectivos: totalLiquidadoCount,
        porcentajeEfectividad: effectivenessPercentage,
        totalClientesCreados: totalClientsCreated,
        recaudoNuevo,
        recaudoRefuerzo,
      },
    };
  } catch (error) {
    console.error("Error fetching user details:", error);
    return { error: "Error al cargar detalles del usuario" };
  }
}
