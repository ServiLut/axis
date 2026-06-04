"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type SugerenciaOrden = {
  id: number;
  numeroOrden: string | null;
  fechaVisita: Date | null;
  valorCotizado: number | null;
  cliente: {
    nombre: string | null;
    apellido: string | null;
    telefono: string;
  };
  servicio: {
    nombre: string;
  };
  direccion: {
    direccion: string;
  } | null;
  tipoServicio: {
    nombre: string;
  } | null;
};

export async function getSugerenciasRefuerzo(
  token: string,
  filters?: {
    fechaInicio?: string;
    fechaFin?: string;
    estado?: "PENDIENTE" | "RECHAZADO" | "TODOS";
  }
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };
    const baseWhere = usuario.rol === "SU_ADMIN" ? {} : { tenantId: usuario.tenantId };

    // 14 days ago (UTC calculation) for standard services
    const now = new Date();
    const targetDate14 = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 14));
    const end14 = new Date(targetDate14); end14.setUTCHours(23, 59, 59, 999);

    // 7 days ago (UTC calculation) for special services
    const targetDate7 = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 7));
    const end7 = new Date(targetDate7); end7.setUTCHours(23, 59, 59, 999);

    // Date Filters
    // Default Start for PENDING: 01/01/2026
    const defaultStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    
    let startLimit: Date | undefined = defaultStart;
    let explicitStart = false;

    if (filters?.fechaInicio) {
      const parsedStart = new Date(filters.fechaInicio);
      if (!isNaN(parsedStart.getTime())) {
        const parts = filters.fechaInicio.split('-');
        if (parts.length === 3) {
            startLimit = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
            explicitStart = true;
        }
      }
    }

    // User End Date
    let userEndLimit: Date | null = null;
    if (filters?.fechaFin) {
       const parts = filters.fechaFin.split('-');
       if (parts.length === 3) {
           userEndLimit = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59, 999));
       }
    }

    // Calculate effective end dates for PENDING
    // For pending, we generally use the default start limit (2026) if no explicit start is given
    const pendingStart = explicitStart && startLimit ? startLimit : defaultStart;
    
    const effectiveEnd14 = userEndLimit && userEndLimit < end14 ? userEndLimit : end14;
    const effectiveEnd7 = userEndLimit && userEndLimit < end7 ? userEndLimit : end7;

    const specialServices = ["C: CONTROL DE CHINCHES", "3"];

    const whereClause: Prisma.OrdenServicioWhereInput = {
      ...baseWhere,
      NOT: {
        tipoServicio: {
          nombre: {
            equals: "Refuerzo",
            mode: "insensitive",
          },
        },
      },
    };

    if (filters?.estado === "RECHAZADO") {
      // Show ALL rejected services. 
      // Only apply date filters if explicitly requested by user.
      whereClause.seguimientoRevisado = true;
      whereClause.fechaVisita = {};
      
      if (explicitStart && startLimit) {
        whereClause.fechaVisita.gte = startLimit;
      }
      if (userEndLimit) {
        whereClause.fechaVisita.lte = userEndLimit;
      }
      // If object is empty, delete it to avoid Prisma error? No, empty object is valid (no filter).
      if (Object.keys(whereClause.fechaVisita).length === 0) {
        delete whereClause.fechaVisita;
      }
    } else if (filters?.estado === "TODOS") {
      // Combine Rejected (Broad) OR Pending (Strict)
      const rejectedDateFilter: Prisma.DateTimeNullableFilter = {};
      if (explicitStart && startLimit) rejectedDateFilter.gte = startLimit;
      if (userEndLimit) rejectedDateFilter.lte = userEndLimit;

      whereClause.OR = [
        {
          seguimientoRevisado: true,
          fechaVisita: Object.keys(rejectedDateFilter).length > 0 ? rejectedDateFilter : undefined,
        },
        {
          seguimientoRevisado: { not: true },
          OR: [
            // Standard services: 14 days ago
            {
              fechaVisita: {
                gte: pendingStart,
                lte: effectiveEnd14,
              },
              servicio: {
                nombre: { notIn: specialServices },
              },
            },
            // Special services: 7 days ago
            {
              fechaVisita: {
                gte: pendingStart,
                lte: effectiveEnd7,
              },
              servicio: {
                nombre: { in: specialServices },
              },
            },
          ],
        },
      ];
    } else {
      // PENDIENTE (Default) - Strict 14/7 day logic
      whereClause.seguimientoRevisado = { not: true };
      whereClause.OR = [
        // Standard services: 14 days ago
        {
          fechaVisita: {
            gte: pendingStart,
            lte: effectiveEnd14,
          },
          servicio: {
            nombre: { notIn: specialServices },
          },
        },
        // Special services: 7 days ago
        {
          fechaVisita: {
            gte: pendingStart,
            lte: effectiveEnd7,
          },
          servicio: {
            nombre: { in: specialServices },
          },
        },
      ];
    }

    const ordenesRaw = await prisma.ordenServicio.findMany({
      where: whereClause,
      select: {
        id: true,
        numeroOrden: true,
        fechaVisita: true,
        valorCotizado: true,
        cliente: {
          select: {
            nombre: true,
            apellido: true,
            telefono: true,
          },
        },
        servicio: {
          select: {
            nombre: true,
          },
        },
        direccion: {
          select: {
            direccion: true,
          },
        },
        tipoServicio: {
          select: {
            nombre: true,
          },
        },
      },
    });

    const ordenes: SugerenciaOrden[] = ordenesRaw.map(o => ({
      ...o,
      valorCotizado: o.valorCotizado ? Number(o.valorCotizado) : null
    }));

    return { ordenes };
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return { error: "Error al cargar sugerencias" };
  }
}

export async function getSeguimientoTrimestral(
  token: string,
  filters?: { estado?: "PENDIENTE" | "RECHAZADO" | "TODOS" }
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };
    const baseWhere = usuario.rol === "SU_ADMIN" ? {} : { tenantId: usuario.tenantId };

    // Determine Status Filter
    let statusFilter: boolean | { not: true } | undefined = { not: true }; // Default PENDIENTE
    if (filters?.estado === "RECHAZADO") {
      statusFilter = true;
    } else if (filters?.estado === "TODOS") {
      statusFilter = undefined;
    }

    // 3 months ago (UTC calculation)
    const now = new Date();
    const targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 3, now.getDate()));
    
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const whereClause: Prisma.OrdenServicioWhereInput = {
      ...baseWhere,
      fechaVisita: {
        gte: startOfDay,
        lte: endOfDay,
      },
      NOT: {
        tipoServicio: {
          nombre: {
            equals: "Refuerzo",
            mode: "insensitive",
          },
        },
      },
    };

    if (statusFilter !== undefined) {
      whereClause.seguimientoRevisado = statusFilter;
    }

    // Get orders from that day
    const candidates = await prisma.ordenServicio.findMany({
      where: whereClause,
      select: {
        id: true,
        numeroOrden: true,
        fechaVisita: true,
        valorCotizado: true,
        clienteId: true,
        cliente: {
          select: {
            nombre: true,
            apellido: true,
            telefono: true,
          },
        },
        servicio: {
          select: {
            nombre: true,
          },
        },
        direccion: {
          select: {
            direccion: true,
          },
        },
        tipoServicio: {
          select: {
            nombre: true,
          },
        },
      },
    });

    // Filter: Ensure client has NO reinforcement (type 3) since that date
    // We check for existence of ANY order with tipoServicioId=3 for this client created/visited AFTER startOfDay
    const filteredOrdenes: SugerenciaOrden[] = [];

    for (const orden of candidates) {
      const refuerzoExistente = await prisma.ordenServicio.count({
        where: {
          clienteId: orden.clienteId,
          tipoServicioId: 3,
          fechaVisita: {
            gt: startOfDay, // Since the service date
          },
        },
      });

      if (refuerzoExistente === 0) {
        filteredOrdenes.push({
          ...orden,
          valorCotizado: orden.valorCotizado ? Number(orden.valorCotizado) : null
        });
      }
    }

    return { ordenes: filteredOrdenes };
  } catch (error) {
    console.error("Error fetching quarterly follow-up:", error);
    return { error: "Error al cargar seguimiento trimestral" };
  }
}

export async function rechazarSeguimiento(token: string, ordenId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    await prisma.ordenServicio.update({
      where: { id: ordenId },
      data: { seguimientoRevisado: true },
    });
    
    revalidatePath("/dashboard/servicios/seguimiento");
    return { success: true };
  } catch (error) {
    console.error("Error rejecting follow-up:", error);
    return { error: "Error al rechazar seguimiento" };
  }
}

export async function registrarRefuerzo(
  token: string, 
  ordenOrigenId: number, 
  fechaNueva: Date, 
  montoNuevo: number
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const ordenOrigen = await prisma.ordenServicio.findUnique({
      where: { id: ordenOrigenId },
    });

    if (!ordenOrigen) return { error: "Orden original no encontrada" };

    // Find suitable status
    const estado = await prisma.estadoServicio.findFirst({
      where: {
        tenantId: ordenOrigen.tenantId,
        nombre: "Agendado por Realizar", // Preferred
        activo: true,
      },
    }) || await prisma.estadoServicio.findFirst({
      where: {
        tenantId: ordenOrigen.tenantId,
        activo: true,
      },
    });

    if (!estado) return { error: "No se encontró un estado de servicio válido" };

    // Transaction
    const [nuevaOrden] = await prisma.$transaction([
      prisma.ordenServicio.create({
        data: {
          tenantId: ordenOrigen.tenantId,
          clienteId: ordenOrigen.clienteId,
          servicioId: ordenOrigen.servicioId,
          tipoServicioId: 3, // Refuerzo
          direccionId: ordenOrigen.direccionId,
          direccionTexto: ordenOrigen.direccionTexto || "",
          empresaId: ordenOrigen.empresaId,
          creadoPorId: usuario.id,
          estadoServicioId: estado.id,
          fechaVisita: fechaNueva,
          valorCotizado: montoNuevo,
          ordenPadreId: ordenOrigenId,
          observacion: `Refuerzo generado desde seguimiento. Orden original: ${ordenOrigen.numeroOrden ?? ordenOrigenId}`,
        },
      }),
      prisma.ordenServicio.update({
        where: { id: ordenOrigenId },
        data: { seguimientoRevisado: true },
      }),
    ]);

    revalidatePath("/dashboard/servicios/seguimiento");
    return { success: true, nuevaOrdenId: nuevaOrden.id };
  } catch (error) {
    console.error("Error registering reinforcement:", error);
    return { error: "Error al registrar refuerzo" };
  }
}
