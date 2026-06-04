"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { Prisma, Rol } from "@/prisma/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

// Helper to serialize BigInt and Decimal (same as in citas/actions.ts)
const serializeBigInt = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return Number(obj);
  if (obj instanceof Date) return obj.toISOString();
  if (Prisma.Decimal.isDecimal(obj)) return Number(obj);
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === "object") {
    if ("s" in obj && "e" in obj && "d" in obj && "toFixed" in obj) {
      return Number(obj);
    }
    const newObj: Record<string, unknown> = {};
    const entries = Object.entries(obj as Record<string, unknown>);
    for (const [key, value] of entries) {
      newObj[key] = serializeBigInt(value);
    }
    return newObj;
  }
  return obj;
};

export async function getCitasByDateRange(
  token: string,
  dateStr: string,
  tecnicoId?: number,
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const TIMEZONE = "America/Bogota";
    
    // Construct start and end for the day in Bogota
    const start = fromZonedTime(`${dateStr}T00:00:00`, TIMEZONE);
    const end = fromZonedTime(`${dateStr}T23:59:59.999`, TIMEZONE);

    // Debug
    // console.log("Fetching citas for:", dateStr, "Start:", start.toISOString(), "End:", end.toISOString());

    const whereClause: Prisma.CitasPsicologosWhereInput = {
      fechaCita: {
        gte: start,
        lte: end,
      },
    };

    // Check Tenant
    if (usuario.rol !== Rol.SU_ADMIN) {
      whereClause.tenantId = usuario.tenantId;
    }

    if (tecnicoId) {
      whereClause.psicologoId = tecnicoId;
    }

    const citas = await prisma.citasPsicologos.findMany({
      where: whereClause,
      include: {
        Cliente: {
          select: { nombre: true, apellido: true, numeroDocumento: true },
        },
        Usuario_CitasPsicologos_psicologoIdToUsuario: {
          select: { nombre: true, apellido: true },
        },
        Servicio_CitasPsicologos_servicioIdToServicio: {
          select: { nombre: true },
        },
        Servicio_CitasPsicologos_tipoServicioToServicio: {
          select: { nombre: true, id: true },
        },
        Empresa: {
          select: { nombre: true },
        },
        PaqueteAdquirido: {
          include: {
            TerapiasPsicologos: true,
          },
        },
        consultorios: {
          select: { id: true, nombre: true },
        },
      },
      orderBy: {
        horaInicio: "asc",
      },
    });

    const citasSerialized = citas.map((cita) => {
      const serialized = serializeBigInt(cita) as Record<string, unknown>;

      const terapiaNombre = cita.PaqueteAdquirido?.TerapiasPsicologos?.nombre;
      const servicioNombre =
        cita.Servicio_CitasPsicologos_servicioIdToServicio?.nombre;

      const servicioObj = {
        nombre: terapiaNombre || servicioNombre || "Sin servicio",
      };

      // Map to structure similar to OrdenServicio for UI compatibility
      return {
        id: (serialized["id"] as number) || 0,
        numeroOrden: `CITA-${serialized["id"]}`,
        fechaVisita: serialized["fechaCita"],
        horaInicio: serialized["horaInicio"],
        horaFin: serialized["horaFin"],
        cliente: serialized["Cliente"],
        tecnico: serialized["Usuario_CitasPsicologos_psicologoIdToUsuario"],
        servicio: servicioObj,
        tipoServicio:
          serialized["Servicio_CitasPsicologos_tipoServicioToServicio"],
        empresa: serialized["Empresa"],
        consultorioId: serialized["consultorioId"],
        consultorio: serialized["consultorios"],

        // Mapped/Default fields
        estado: serialized["realizada"] === null ? "CANCELADO" : "PROGRAMADO",
        realizada: serialized["realizada"] === null ? null : (serialized["realizada"] as boolean),
        direccionTexto: "Consultorio",
        municipio: "",
        barrio: "",
        valorCotizado: serialized["valor"] ? Number(serialized["valor"]) : null,
      };
    });

    return { ordenes: citasSerialized };
  } catch (error) {
    console.error("Error obteniendo citas por fecha:", error);
    return { error: "Error al cargar la programación" };
  }
}

export async function moveCita(
  token: string,
  citaId: number,
  consultorioId: number,
  startDateStr: string,
  endDateStr: string
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });
    
    // Validate Dates
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { error: "Fechas inválidas" };
    }

    const TIMEZONE = "America/Bogota";
    // Correctly set fechaCita to the start of the day in Bogota timezone
    const dayStr = formatInTimeZone(start, TIMEZONE, "yyyy-MM-dd");
    const fechaCita = fromZonedTime(`${dayStr}T00:00`, TIMEZONE);

    await prisma.citasPsicologos.update({
      where: { id: BigInt(citaId), tenantId: usuario?.tenantId },
      data: {
        consultorioId: BigInt(consultorioId),
        horaInicio: start,
        horaFin: end,
        fechaCita: fechaCita
      },
    });

    revalidatePath("/dashboard/citas/programacion");
    return { success: true };
  } catch (error) {
    console.error("Error moviendo cita:", error);
    return { error: "Error al mover la cita" };
  }
}

export async function unassignCita(token: string, citaId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    await prisma.citasPsicologos.update({
      where: { id: BigInt(citaId), tenantId: usuario?.tenantId },
      data: {
        consultorioId: null,
      },
    });

    revalidatePath("/dashboard/citas/programacion");
    return { success: true };
  } catch (error) {
    console.error("Error desasignando cita:", error);
    return { error: "Error al desasignar la cita" };
  }
}
