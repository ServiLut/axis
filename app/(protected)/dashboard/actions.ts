"use server";

import prisma from "@/lib/prisma";
import { verifyToken, signToken } from "@/lib/auth";
import { PSYCHOLOGY_TENANT_ID } from "@/lib/constants/tenants";
import { EstadoPagoOrden, Prisma } from "@/prisma/generated/prisma/client";
import { fromZonedTime } from "date-fns-tz";

// Contrato exclusivo de la variante psicológica del Dashboard. No se mezcla con
// las métricas de OrdenServicio para mantener intactos los demás tenants.
export interface PsychologyDashboardStats {
  citasHoy: number;
  programadasHoy: number;
  realizadasHoy: number;
  canceladasHoy: number;
  ingresosHoy: number;
  pendienteHoy: number;
  citasTotal: number;
  programadasTotal: number;
  realizadasTotal: number;
  canceladasTotal: number;
  tasaCancelacionTotal: number;
  ingresosTotal: number;
  pendienteTotal: number;
  topTerapias: { nombre: string; cantidad: number }[];
}

const BOGOTA_TIME_ZONE = "America/Bogota";

// Las citas se almacenan con zona horaria. Construir ambos límites desde la fecha
// de Bogotá evita que el servidor (por ejemplo, configurado en UTC) cambie el día.
const getBogotaDayRange = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const tomorrow = [
    nextDay.getUTCFullYear(),
    String(nextDay.getUTCMonth() + 1).padStart(2, "0"),
    String(nextDay.getUTCDate()).padStart(2, "0"),
  ].join("-");

  return {
    start: fromZonedTime(`${today}T00:00:00`, BOGOTA_TIME_ZONE),
    end: fromZonedTime(`${tomorrow}T00:00:00`, BOGOTA_TIME_ZONE),
  };
};

// Cartera: cita vigente, con valor real y todavía no conciliada. Los estados
// intermedios (declarado/consignado) siguen pendientes hasta llegar a CONCILIADO.
const pendingPsychologyPaymentWhere: Prisma.CitasPsicologosWhereInput = {
  realizada: { not: null },
  valor: { gt: 0 },
  OR: [
    { estadoPago: null },
    { estadoPago: { not: EstadoPagoOrden.CONCILIADO } },
  ],
};

const toNumber = (value: unknown): number => {
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return Number(value || 0);
};

async function getPsychologyDashboardStats(): Promise<PsychologyDashboardStats> {
  const { start, end } = getBogotaDayRange();
  const tenantWhere = { tenantId: PSYCHOLOGY_TENANT_ID };
  const todayWhere: Prisma.CitasPsicologosWhereInput = {
    ...tenantWhere,
    fechaCita: { gte: start, lt: end },
  };

  const [
    citasHoy,
    programadasHoy,
    realizadasHoy,
    canceladasHoy,
    ingresosHoy,
    pendienteHoy,
    citasTotal,
    programadasTotal,
    realizadasTotal,
    canceladasTotal,
    ingresosTotal,
    pendienteTotal,
    terapiasSolicitadas,
  ] = await Promise.all([
    prisma.citasPsicologos.count({ where: todayWhere }),
    prisma.citasPsicologos.count({
      where: { ...todayWhere, realizada: false },
    }),
    prisma.citasPsicologos.count({
      where: { ...todayWhere, realizada: true },
    }),
    prisma.citasPsicologos.count({
      where: { ...todayWhere, realizada: null },
    }),
    prisma.citasPsicologos.aggregate({
      where: {
        ...todayWhere,
        realizada: { not: null },
        estadoPago: EstadoPagoOrden.CONCILIADO,
      },
      _sum: { valor: true },
    }),
    prisma.citasPsicologos.aggregate({
      where: { ...todayWhere, ...pendingPsychologyPaymentWhere },
      _sum: { valor: true },
    }),
    prisma.citasPsicologos.count({ where: tenantWhere }),
    prisma.citasPsicologos.count({
      where: { ...tenantWhere, realizada: false },
    }),
    prisma.citasPsicologos.count({
      where: { ...tenantWhere, realizada: true },
    }),
    prisma.citasPsicologos.count({
      where: { ...tenantWhere, realizada: null },
    }),
    prisma.citasPsicologos.aggregate({
      where: {
        ...tenantWhere,
        realizada: { not: null },
        estadoPago: EstadoPagoOrden.CONCILIADO,
      },
      _sum: { valor: true },
    }),
    prisma.citasPsicologos.aggregate({
      where: { ...tenantWhere, ...pendingPsychologyPaymentWhere },
      _sum: { valor: true },
    }),
    prisma.citasPsicologos.findMany({
      where: { ...tenantWhere, realizada: { not: null } },
      select: {
        PaqueteAdquirido: {
          select: {
            TerapiasPsicologos: { select: { nombre: true } },
          },
        },
        Servicio_CitasPsicologos_servicioIdToServicio: {
          select: { nombre: true },
        },
      },
    }),
  ]);

  // Una cita puede obtener su nombre desde el paquete o desde el servicio legado.
  // Se resuelven ambas fuentes para no perder registros durante la transición.
  const therapyCounts = new Map<string, number>();
  for (const cita of terapiasSolicitadas) {
    const nombre =
      cita.PaqueteAdquirido?.TerapiasPsicologos.nombre ||
      cita.Servicio_CitasPsicologos_servicioIdToServicio?.nombre ||
      "Sin terapia especificada";
    therapyCounts.set(nombre, (therapyCounts.get(nombre) || 0) + 1);
  }

  const topTerapias = Array.from(therapyCounts, ([nombre, cantidad]) => ({
    nombre,
    cantidad,
  }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre))
    .slice(0, 5);

  return {
    citasHoy,
    programadasHoy,
    realizadasHoy,
    canceladasHoy,
    ingresosHoy: toNumber(ingresosHoy._sum.valor),
    pendienteHoy: toNumber(pendienteHoy._sum.valor),
    citasTotal,
    programadasTotal,
    realizadasTotal,
    canceladasTotal,
    tasaCancelacionTotal:
      citasTotal > 0 ? (canceladasTotal / citasTotal) * 100 : 0,
    ingresosTotal: toNumber(ingresosTotal._sum.valor),
    pendienteTotal: toNumber(pendienteTotal._sum.valor),
    topTerapias,
  };
}

export async function getDashboardStats(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    // La rama se decide con el usuario fresco de BD. Esto también respeta el
    // tenant seleccionado por SU_ADMIN aunque el JWT anterior estuviera obsoleto.
    if (usuario.tenantId === PSYCHOLOGY_TENANT_ID) {
      return {
        type: "psychology" as const,
        stats: await getPsychologyDashboardStats(),
      };
    }
    
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
      type: "services" as const,
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

/**
 * Devuelve únicamente la cartera del tenant de Psicología para el modal del
 * Dashboard. Se mantiene separada del detalle de OrdenServicio para prevenir
 * cruces de modelos, rutas o datos entre tenants.
 */
export async function getPsychologyOutstandingDetails(
  token: string,
  type: "today" | "total"
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };
    if (usuario.tenantId !== PSYCHOLOGY_TENANT_ID) {
      return { error: "Esta consulta solo está disponible para Psicología" };
    }

    const { start, end } = getBogotaDayRange();
    const where: Prisma.CitasPsicologosWhereInput = {
      tenantId: PSYCHOLOGY_TENANT_ID,
      ...pendingPsychologyPaymentWhere,
      ...(type === "today"
        ? { fechaCita: { gte: start, lt: end } }
        : {}),
    };

    const citas = await prisma.citasPsicologos.findMany({
      where,
      select: {
        id: true,
        fechaCita: true,
        valor: true,
        metodoPago: true,
        estadoPago: true,
        realizada: true,
        Cliente: {
          select: { nombre: true, apellido: true },
        },
        PaqueteAdquirido: {
          select: {
            TerapiasPsicologos: { select: { nombre: true } },
          },
        },
        Servicio_CitasPsicologos_servicioIdToServicio: {
          select: { nombre: true },
        },
      },
      orderBy: [{ fechaCita: "desc" }, { id: "desc" }],
    });

    return {
      citas: citas.map((cita) => ({
        id: Number(cita.id),
        numeroCita: `CITA-${cita.id.toString()}`,
        fechaCita: cita.fechaCita,
        paciente: cita.Cliente,
        terapia:
          cita.PaqueteAdquirido?.TerapiasPsicologos.nombre ||
          cita.Servicio_CitasPsicologos_servicioIdToServicio?.nombre ||
          "Sin terapia especificada",
        metodoPago: cita.metodoPago,
        estadoPago: cita.estadoPago,
        estadoCita: cita.realizada ? "Realizada" : "Programada",
        pendiente: toNumber(cita.valor),
      })),
    };
  } catch (error) {
    console.error("Error fetching psychology outstanding details:", error);
    return { error: "Error al cargar la cartera de Psicología" };
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
