"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { Prisma } from "@/prisma/generated/prisma/client";

export type BalanceSummary = {
  ingresos: {
    totalRecaudado: number;
    totalRepuestos: number;
    cantidadServicios: number;
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
};

export async function getBalanceGeneral(
  token: string,
  fechaInicio: Date,
  fechaFin: Date
) {
  const payload = verifyToken(token);
  if (!payload) return { success: false as const, error: "No autorizado" };

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!user) return { success: false as const, error: "Usuario no encontrado" };

    // Filtros por fecha y tenant
    const dateFilter = {
      gte: fechaInicio,
      lte: fechaFin,
    };

    let totalIngresos = 0;
    let totalRepuestos = 0;
    let cantidadServicios = 0;
    let desglosePorMetodo: { metodo: string; total: number }[] = [];
    
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
          paqueteId: true,
          PaqueteAdquirido: {
            select: {
              precioPagado: true,
              sesionesTotales: true
            }
          }
        }
      });

      const metodoMap: Record<string, number> = {};

      for (const cita of citas) {
        let valorSesion = 0;

        if (cita.PaqueteAdquirido && cita.PaqueteAdquirido.sesionesTotales > 0) {
           // Calculate pro-rated value from Package
           const precioTotal = Number(cita.PaqueteAdquirido.precioPagado);
           const sesiones = cita.PaqueteAdquirido.sesionesTotales;
           valorSesion = precioTotal / sesiones;
        } else {
           // Direct value from appointment
           valorSesion = Number(cita.valor || 0);
        }

        totalIngresos += valorSesion;

        // Grouping by payment method
        const metodo = cita.metodoPago || "No especificado";
        if (!metodoMap[metodo]) metodoMap[metodo] = 0;
        metodoMap[metodo] += valorSesion;
      }

      cantidadServicios = citas.length;
      totalRepuestos = 0; // Not needed for Tenant 4

      desglosePorMetodo = Object.entries(metodoMap).map(([metodo, total]) => ({
        metodo,
        total
      })).sort((a, b) => b.total - a.total);

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

    if (user.rol !== "SU_ADMIN") {
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

    if (user.rol !== "SU_ADMIN") {
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

    if (user.rol !== "SU_ADMIN") {
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
    const neto = totalIngresos - (totalNomina + totalAnticipos + totalOtrosEgresos);

    const data: BalanceSummary = {
      ingresos: {
        totalRecaudado: totalIngresos,
        totalRepuestos: totalRepuestos,
        cantidadServicios: cantidadServicios,
        desglosePorMetodo,
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
      isTenant4: user.tenantId === 4
    };

    return { success: true as const, data };
  } catch (error) {
    console.error("Error calculating balance:", error);
    return { success: false as const, error: "Error al calcular el balance" };
  }
}
