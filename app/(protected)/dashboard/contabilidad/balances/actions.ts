"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { Prisma } from "@/prisma/generated/prisma/client";
import { requireFinanceUser } from "@/lib/psychology-access";
import { getBogotaDayRange } from "@/lib/bogota-date";

export type BalanceSummary = {
  ingresos: {
    totalRecaudado: number;
    totalRepuestos: number;
    cantidadServicios: number;
    valorRealizado?: number;
    valorPorConciliar?: number;
    desglosePorMetodo: {
      metodo: string;
      total: number;
    }[];
  };
  egresos: {
    totalNominaPagada: number;
    totalAnticipos: number;
    totalOtrosEgresos: number;
    cantidadNominas: number;
    cantidadAnticipos: number;
    cantidadOtrosEgresos: number;
  };
  neto: number;
  periodo: {
    inicio: Date;
    fin: Date;
  };
  isTenant4?: boolean;
  caja?: { ingresos: string; egresos: string; neto: string };
};

export async function getBalanceGeneral(
  token: string,
  fechaInicio: Date,
  fechaFin: Date
) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await requireFinanceUser(token, true);
    if (!Number.isFinite(fechaInicio.getTime()) || !Number.isFinite(fechaFin.getTime()) || fechaFin < fechaInicio) return { success: false as const, error: "Periodo inválido." };
    const inicioDia = fechaInicio.toISOString().slice(0, 10), finDia = fechaFin.toISOString().slice(0, 10);

    // Filtros por fecha y tenant
    const dateFilter = {
      gte: getBogotaDayRange(inicioDia).start,
      lt: getBogotaDayRange(finDia).end,
    };

    let totalIngresos = 0;
    let totalRepuestos = 0;
    let cantidadServicios = 0;
    let desglosePorMetodo: { metodo: string; total: number }[] = [];
    let valorRealizado: number | undefined, valorPorConciliar: number | undefined;
    
    // Logic split for Tenant 4 vs Others
    if (user.tenantId === 4) {
      // --- TENANT 4 LOGIC ---
      
      // 1. Fetch individual appointments (Citas) with Package info
      const citas = await prisma.citasPsicologos.findMany({
        where: {
          tenantId: 4,
          realizada: true,
          fechaCita: dateFilter,
        },
        select: {
          id: true,
          valor: true,
          metodoPago: true,
          estadoPago: true,
          paqueteId: true,
          PaqueteAdquirido: {
            select: {
              precioPagado: true,
              sesionesTotales: true
            }
          }
        }
      });

      const metodoMap: Record<string, Prisma.Decimal> = {};
      let realizado = new Prisma.Decimal(0), pendiente = new Prisma.Decimal(0);

      for (const cita of citas) {
        let valorSesion = new Prisma.Decimal(0);

        if (cita.PaqueteAdquirido && cita.PaqueteAdquirido.sesionesTotales > 0) {
           // Calculate pro-rated value from Package
           const precioTotal = new Prisma.Decimal(cita.PaqueteAdquirido.precioPagado);
           const sesiones = cita.PaqueteAdquirido.sesionesTotales;
           valorSesion = precioTotal.div(sesiones);
        } else {
           // Direct value from appointment
           valorSesion = new Prisma.Decimal(cita.valor || 0);
        }

        realizado = realizado.add(valorSesion);
        if (cita.estadoPago !== "CONCILIADO") { pendiente = pendiente.add(valorSesion); continue; }

        // Grouping by payment method
        const metodo = cita.metodoPago || "No especificado";
        if (!metodoMap[metodo]) metodoMap[metodo] = new Prisma.Decimal(0);
        metodoMap[metodo] = metodoMap[metodo].add(valorSesion);
      }

      cantidadServicios = citas.length;
      totalRepuestos = 0; // Not needed for Tenant 4

      desglosePorMetodo = Object.entries(metodoMap).map(([metodo, total]) => ({
        metodo,
        total: Number(total.toFixed(2))
      })).sort((a, b) => b.total - a.total);
      totalIngresos = Number(desglosePorMetodo.reduce((sum, m) => sum.add(m.total), new Prisma.Decimal(0)).toFixed(2));
      valorRealizado = Number(realizado.toFixed(2));
      valorPorConciliar = Number(pendiente.toFixed(2));

    } else {
      // --- STANDARD LOGIC ---
      
      const whereServicios: Prisma.OrdenServicioWhereInput = {
        fechaVisita: dateFilter,
        estadoServicio: {
          nombre: {
            in: ["Finalizado", "Entregado", "Terminado", "Completado", "Liquidado"],
            mode: 'insensitive'
          }
        }
      };

      if (user.rol !== "SU_ADMIN") {
        whereServicios.tenantId = user.tenantId;
      }

      const [serviciosAgregados, serviciosPorMetodo] = await Promise.all([
        prisma.ordenServicio.aggregate({
          where: whereServicios,
          _sum: {
            valorPagado: true,
            valorRepuestos: true,
          },
          _count: {
            id: true,
          },
        }),
        prisma.ordenServicio.groupBy({
          by: ['metodoPagoId'],
          where: whereServicios,
          _sum: {
            valorPagado: true,
          },
        })
      ]);

      // Fetch payment method names
      const metodoIds = serviciosPorMetodo
        .map(s => s.metodoPagoId)
        .filter((id): id is number => id !== null);

      const metodosPago = await prisma.metodoPago.findMany({
        where: { id: { in: metodoIds } },
        select: { id: true, nombre: true }
      });

      const metodosMap = new Map(metodosPago.map(m => [m.id, m.nombre]));

      desglosePorMetodo = serviciosPorMetodo.map(item => ({
        metodo: item.metodoPagoId ? metodosMap.get(item.metodoPagoId) || "Desconocido" : "No asignado",
        total: Number(item._sum.valorPagado || 0)
      })).sort((a, b) => b.total - a.total);

      totalIngresos = Number(serviciosAgregados._sum.valorPagado || 0);
      totalRepuestos = Number(serviciosAgregados._sum.valorRepuestos || 0);
      cantidadServicios = serviciosAgregados._count.id;
    }

    // --- SHARED EGRESOS LOGIC (Nomina + Anticipos) ---
    // 2. Egresos: Nóminas PAGADAS
    const whereNominas: Prisma.NominaWhereInput = {
      fechaGeneracion: dateFilter,
      estado: "PAGADO",
    };

    if (user.rol !== "SU_ADMIN" || user.tenantId === 4) {
      whereNominas.tenantId = user.tenantId;
    }

    const nominas = await prisma.nomina.aggregate({
      where: whereNominas,
      _sum: {
        totalPagar: true,
      },
      _count: {
        id: true,
      },
    });

    // 3. Egresos: Anticipos
    const whereAnticipos: Prisma.AnticiposWhereInput = {
      created_at: dateFilter,
    };

    if (user.rol !== "SU_ADMIN" || user.tenantId === 4) {
      whereAnticipos.tenantId = user.tenantId;
    }

    const anticipos = await prisma.anticipos.aggregate({
      where: whereAnticipos,
      _sum: {
        monto: true,
      },
      _count: {
        id: true,
      },
    });

    // 4. Egresos Adicionales (Tabla Egresos)
    let totalOtrosEgresos = 0;
    let cantidadOtrosEgresos = 0;

    const whereOtrosEgresos: Prisma.EgresosWhereInput = {
      created_at: dateFilter,
    };

    if (user.rol !== "SU_ADMIN" || user.tenantId === 4) {
      whereOtrosEgresos.tenantId = user.tenantId;
    }

    const otrosEgresos = await prisma.egresos.aggregate({
      where: whereOtrosEgresos,
      _sum: {
        monto: true,
      },
      _count: {
        id: true,
      },
    });

    totalOtrosEgresos = Number(otrosEgresos._sum.monto || 0);
    cantidadOtrosEgresos = otrosEgresos._count.id;

    const totalNomina = Number(nominas._sum.totalPagar || 0);
    const totalAnticipos = Number(anticipos._sum.monto || 0);
    
    // Neto calculation
    const neto = Number(new Prisma.Decimal(totalIngresos).sub(totalNomina).sub(totalAnticipos).sub(totalOtrosEgresos).toFixed(2));
    let caja: BalanceSummary["caja"];
    if (user.tenantId === 4 && process.env.NEXT_PUBLIC_RECEPCION_ENABLED === "true") {
      const rows = await prisma.$queryRaw<{ ingresos: string; egresos: string; neto: string }[]>`
        SELECT COALESCE(SUM("monto") FILTER (WHERE "tipo" = 'INGRESO'),0)::numeric(12,2)::text AS "ingresos",
          COALESCE(SUM("monto") FILTER (WHERE "tipo" = 'EGRESO'),0)::numeric(12,2)::text AS "egresos",
          COALESCE(SUM(CASE WHEN "tipo" = 'INGRESO' THEN "monto" ELSE -"monto" END),0)::numeric(12,2)::text AS "neto"
        FROM "MovimientoCaja" WHERE "tenantId" = ${user.tenantId} AND "fecha" BETWEEN ${inicioDia}::date AND ${finDia}::date`;
      caja = rows[0];
    }

    const data: BalanceSummary = {
      ingresos: {
        totalRecaudado: totalIngresos,
        totalRepuestos: totalRepuestos,
        cantidadServicios: cantidadServicios,
        desglosePorMetodo,
        valorRealizado,
        valorPorConciliar,
      },
      egresos: {
        totalNominaPagada: totalNomina,
        totalAnticipos: totalAnticipos,
        totalOtrosEgresos,
        cantidadNominas: nominas._count.id,
        cantidadAnticipos: anticipos._count.id,
        cantidadOtrosEgresos,
      },
      neto,
      periodo: {
        inicio: fechaInicio,
        fin: fechaFin,
      },
      isTenant4: user.tenantId === 4,
      caja,
    };

    return { success: true as const, data };
  } catch (error) {
    console.error("Error calculating balance:", error);
    return { success: false as const, error: "Error al calcular el balance" };
  }
}
