"use server";

import prisma from "@/lib/prisma";
import { verifyToken, signToken } from "@/lib/auth";
import { Prisma } from "@/prisma/generated/prisma/client";

export async function getDashboardStats(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };
    
    // If user is SU_ADMIN, they see data from ALL tenants.
    // Otherwise, they only see data from their assigned tenant.
    const baseWhere = usuario.rol === "SU_ADMIN" ? {} : { tenantId: usuario.tenantId };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      serviciosAgendadosHoy,
      serviciosRealizadosHoy,
      serviciosEnProcesoHoy,
      serviciosEnProcesoTotal,
      serviciosRealizadosTotal,
      serviciosTotalesHistorico,
      ingresosHoy,
      ingresosTotal,
      topServicios,
      sinCobrarHoyAgg,
      sinCobrarTotalAgg,
      serviciosCanceladosTotal,
      serviciosFinalizadosTotal,
      serviciosCanceladosHoy,
      serviciosFinalizadosHoy
    ] = await Promise.all([
      // Servicios agendados para hoy (cualquier estado, fecha visita = hoy)
      prisma.ordenServicio.count({
        where: {
          ...baseWhere,
          fechaVisita: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
      // Servicios realizados hoy (Estado Liquidado y fecha visita = hoy)
      prisma.ordenServicio.count({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: "Liquidado" },
          fechaVisita: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
       // Servicios en proceso hoy (Estado EN_PROCESO y fecha visita = hoy)
       prisma.ordenServicio.count({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: "En Proceso" },
          fechaVisita: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
      // Servicios en proceso (Total actual)
      prisma.ordenServicio.count({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: "En Proceso" },
        },
      }),
       // Servicios realizados (Total histórico - Liquidado)
       prisma.ordenServicio.count({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: "Liquidado" },
        },
      }),
      // Servicios Totales (Total histórico)
      prisma.ordenServicio.count({
        where: {
          ...baseWhere,
        },
      }),
      // Ingresos Hoy (Suma valorPagado de servicios con fecha visita hoy)
      prisma.ordenServicio.aggregate({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: "Liquidado" },
          metodoPago: { nombre: { not: "por cobrar" } },
          fechaVisita: {
            gte: today,
            lt: tomorrow,
          },
        },
        _sum: {
          valorPagado: true,
          valorCotizado: true,
          valorRepuestos: true,
        },
      }),
      // Ingresos Totales (Total histórico - Liquidado only)
      prisma.ordenServicio.aggregate({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: "Liquidado" },
          metodoPago: { nombre: { not: "por cobrar" } },
        },
        _sum: {
          valorPagado: true,
          valorCotizado: true,
          valorRepuestos: true,
        },
      }),
      // Servicios más solicitados
      prisma.ordenServicio.groupBy({
        by: ['servicioId'],
        where: {
          ...baseWhere,
        },
        _count: {
          servicioId: true,
        },
        orderBy: {
          _count: {
            servicioId: 'desc',
          },
        },
        take: 5,
      }),
      // Sin Cobrar Hoy (Broader scope: Liquidado, En Proceso, Agendado, etc.)
      prisma.ordenServicio.aggregate({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: { notIn: ["Cancelado", "No Concretado"] } },
          fechaVisita: {
            gte: today,
            lt: tomorrow,
          },
          metodoPago: { nombre: "por cobrar" },
        },
        _sum: {
          valorPagado: true,
          valorCotizado: true,
          valorRepuestos: true,
        },
      }),
      // Sin Cobrar Total (Broader scope: Everything not Cancelled/No Concretado)
      prisma.ordenServicio.aggregate({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: { notIn: ["Cancelado", "No Concretado"] } },
          metodoPago: { nombre: "por cobrar" },
        },
        _sum: {
          valorPagado: true,
          valorCotizado: true,
          valorRepuestos: true,
        },
      }),
      // Servicios Cancelados (Total histórico)
      prisma.ordenServicio.count({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: { in: ["Cancelado", "No Concretado"] } },
        },
      }),
      // Servicios Finalizados (Pendientes de Liquidar)
      prisma.ordenServicio.count({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: "Finalizado" },
        },
      }),
      // Servicios Cancelados Hoy
      prisma.ordenServicio.count({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: { in: ["Cancelado", "No Concretado"] } },
          fechaVisita: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
      // Servicios Finalizados Hoy (Pendientes de Liquidar Hoy)
      prisma.ordenServicio.count({
        where: {
          ...baseWhere,
          estadoServicio: { nombre: "Finalizado" },
          fechaVisita: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
    ]);

    // Fetch names for top services
    const topServiciosWithNames = await Promise.all(
      topServicios.map(async (item) => {
        const servicio = await prisma.servicio.findUnique({
          where: { id: item.servicioId },
          select: { nombre: true },
        });
        return {
          nombre: servicio?.nombre || "Desconocido",
          cantidad: item._count.servicioId,
        };
      })
    );

    const toNum = (val: unknown): number => {
      if (val && typeof val === 'object' && 'toNumber' in val) {
        return (val as { toNumber: () => number }).toNumber();
      }
      return Number(val || 0);
    };

    const ingresosHoyVal = toNum(ingresosHoy._sum.valorPagado);

    // Sin Cobrar Hoy uses the broader aggregation (Agendado + En Proceso + Liquidado)
    const totalCotizadoHoyBroad = toNum(sinCobrarHoyAgg._sum.valorCotizado);
    const totalRepuestosHoyBroad = toNum(sinCobrarHoyAgg._sum.valorRepuestos);
    // Ignoramos lo pagado si es "por cobrar", asumimos que todo es deuda
    const sinCobrarHoy = totalCotizadoHoyBroad + totalRepuestosHoyBroad;

    const ingresosTotalVal = toNum(ingresosTotal._sum.valorPagado);
    
    // Sin Cobrar Total uses the broader aggregation (Agendado + En Proceso + Liquidado)
    const totalCotizadoTotalBroad = toNum(sinCobrarTotalAgg._sum.valorCotizado);
    const totalRepuestosTotalBroad = toNum(sinCobrarTotalAgg._sum.valorRepuestos);
    // Ignoramos lo pagado si es "por cobrar", asumimos que todo es deuda
    const sinCobrarTotal = totalCotizadoTotalBroad + totalRepuestosTotalBroad;

    const tasaCancelacionTotal = serviciosTotalesHistorico > 0 
      ? (serviciosCanceladosTotal / serviciosTotalesHistorico) * 100 
      : 0;

    const tasaCancelacionHoy = serviciosAgendadosHoy > 0
      ? (serviciosCanceladosHoy / serviciosAgendadosHoy) * 100
      : 0;

    return {
      stats: {
        serviciosAgendadosHoy,
        serviciosRealizadosHoy,
        serviciosEnProcesoHoy,
        serviciosEnProcesoTotal,
        serviciosRealizadosTotal,
        serviciosTotalesHistorico,
        ingresosHoy: ingresosHoyVal,
        ingresosTotal: ingresosTotalVal,
        sinCobrarHoy,
        sinCobrarTotal,
        topServicios: topServiciosWithNames,
        serviciosCanceladosTotal,
        tasaCancelacionTotal,
        serviciosFinalizadosTotal,
        serviciosCanceladosHoy,
        serviciosFinalizadosHoy,
        tasaCancelacionHoy,
      },
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return { error: "Error al cargar estadísticas" };
  }
}

export async function getAllTenants(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        nombre: true,
      },
      orderBy: {
        nombre: 'asc',
      },
    });
    return { tenants };
  } catch (error) {
    console.error("Error fetching tenants:", error);
    return { error: "Error al cargar sistemas" };
  }
}

export async function switchUserTenant(token: string, newTenantId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: newTenantId },
    });

    if (!tenant) return { error: "Sistema no encontrado" };

    const updatedUser = await prisma.usuario.update({
      where: { id: payload.userId },
      data: { tenantId: newTenantId },
      include: { tenant: true },
    });

    // Generar nuevo token con la información actualizada
    const newToken = signToken({
      userId: updatedUser.id,
      tenantId: updatedUser.tenantId,
      tenantName: updatedUser.tenant.nombre,
      username: updatedUser.username,
      nombre: updatedUser.nombre,
      apellido: updatedUser.apellido,
      role: updatedUser.rol!,
      aprobado: updatedUser.aprobado || false,
    });

    return { success: true, newToken };
  } catch (error) {
    console.error("Error switching tenant:", error);
    return { error: "Error al cambiar de sistema" };
  }
}

export async function getUnpaidServicesDetails(token: string, type: 'today' | 'total') {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const baseWhere = usuario.rol === "SU_ADMIN" ? {} : { tenantId: usuario.tenantId };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let whereClause: Prisma.OrdenServicioWhereInput = { ...baseWhere };

    if (type === 'today') {
      whereClause = {
        ...whereClause,
        fechaVisita: {
          gte: today,
          lt: tomorrow,
        },
        estadoServicio: {
          nombre: {
            notIn: ["Cancelado", "No Concretado"]
          }
        },
        metodoPago: { nombre: "por cobrar" }
      };
    } else {
      // For total, we now use the broader scope (all not Cancelled/No Concretado)
      whereClause = {
        ...whereClause,
        estadoServicio: {
          nombre: {
            notIn: ["Cancelado", "No Concretado"]
          }
        },
        metodoPago: { nombre: "por cobrar" }
      };
    }

    const services = await prisma.ordenServicio.findMany({
      where: whereClause,
      select: {
        id: true,
        numeroOrden: true,
        valorCotizado: true,
        valorPagado: true,
        valorRepuestos: true,
        fechaVisita: true,
        cliente: {
          select: {
            nombre: true,
            apellido: true,
            empresa: {
              select: { nombre: true }
            }
          }
        },
        servicio: {
          select: { nombre: true }
        },
        metodoPago: {
          select: { nombre: true }
        },
        estadoServicio: {
          select: { nombre: true }
        }
      },
      orderBy: {
        fechaVisita: 'desc'
      }
    });

    // Filter for unpaid services in memory
    const unpaidServices = services.filter(service => {
      const total = Number(service.valorCotizado || 0) + Number(service.valorRepuestos || 0);
      const paid = Number(service.valorPagado || 0);
      const isPorCobrar = service.metodoPago?.nombre === "por cobrar";
      // Si es 'por cobrar', lo incluimos siempre
      return isPorCobrar || total > paid;
    }).map(service => {
      const total = Number(service.valorCotizado || 0) + Number(service.valorRepuestos || 0);
      const paid = Number(service.valorPagado || 0);
      const isPorCobrar = service.metodoPago?.nombre === "por cobrar";
      
      return {
        id: service.id,
        numeroOrden: service.numeroOrden,
        fechaVisita: service.fechaVisita,
        cliente: service.cliente,
        servicio: service.servicio,
        metodoPago: service.metodoPago,
        estadoServicio: service.estadoServicio,
        total: total,
        pagado: paid,
        // Si es 'por cobrar', la deuda es total, ignorando lo pagado
        pendiente: isPorCobrar ? total : (total - paid)
      };
    });

    return { services: unpaidServices };

  } catch (error) {
    console.error("Error fetching unpaid services details:", error);
    return { error: "Error al cargar detalles" };
  }
}
