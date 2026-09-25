"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { Prisma } from "@/prisma/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { requireFinanceUser } from "@/lib/psychology-access";
import { bookingTimes } from "@/lib/booking";
import { lockAndValidateBooking } from "@/lib/booking-server";
import { createAuditLog } from "@/lib/audit";
import { fromZonedTime } from "date-fns-tz"; //Se elimina formatInTimeZone porque ya no se requiere formatear la fecha aquí, solo la conversión de zona horaria.

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
    whereClause.tenantId = usuario.tenantId;

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
        estado: serialized["realizada"] === null ? "CANCELADO" : serialized["realizada"] === true ? "REALIZADO" : "PROGRAMADO",
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
  //Se eliminan 'startDateStr' y 'endDateStr'.
  dateStr: string, // Ahora el flujo maneja eventos/citas dentro del mismo día, requiriendo la fecha del día ('dateStr') y su bloque horario específico.
  horaInicioStr: string,
  horaFinStr: string,
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await requireFinanceUser(token);
    if (![citaId, consultorioId].every((n) => Number.isSafeInteger(n) && n > 0)) return { error: "Reserva o consultorio inválido." };
    const horario = bookingTimes(dateStr, horaInicioStr, horaFinStr);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${usuario.tenantId} FOR UPDATE`;
      const cita = await tx.citasPsicologos.findFirst({ where: { id: BigInt(citaId), tenantId: usuario.tenantId },
        include: { PaqueteAdquirido: { include: { TerapiasPsicologos: true } }, Servicio_CitasPsicologos_servicioIdToServicio: true } });
      if (!cita || cita.realizada !== false) throw new Error("Solo puedes mover una cita programada de este sistema.");
      const rental = /alquiler/i.test(cita.PaqueteAdquirido?.TerapiasPsicologos?.nombre || cita.Servicio_CitasPsicologos_servicioIdToServicio?.nombre || "");
      if (rental && (!cita.horaInicio || !cita.horaFin || cita.horaFin.getTime() - cita.horaInicio.getTime() !== horario.fin.getTime() - horario.inicio.getTime())) {
        throw new Error("Para cambiar la duración contratada, edita la reserva y revisa su valor. El exceso real se registra como adicional en Recepción.");
      }
      await lockAndValidateBooking(tx, { tenantId: usuario.tenantId, psicologoId: cita.psicologoId, consultorioId: BigInt(consultorioId), inicio: horario.inicio, fin: horario.fin, excludeId: cita.id });
      const updated = await tx.citasPsicologos.update({ where: { id: cita.id, tenantId: usuario.tenantId },
        data: { consultorioId: BigInt(consultorioId), horaInicio: horario.inicio, horaFin: horario.fin, fechaCita: horario.fecha } });
      await createAuditLog({ tenantId: usuario.tenantId, usuarioId: usuario.id, accion: "UPDATE", entidad: "Cita", entidadId: citaId,
        detalles: { descripcion: "Reprogramación desde calendario", antes: serializeBigInt(cita), despues: serializeBigInt(updated) }, tx });
    });

    revalidatePath("/dashboard/citas/programacion");
    return { success: true };
  } catch (error) {
    console.error("Error moviendo cita:", error);
    return { error: error instanceof Error && error.name === "Error" ? error.message : "Error al mover la cita" };
  }
}

export async function unassignCita(token: string, citaId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await requireFinanceUser(token);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${usuario.tenantId} FOR UPDATE`;
      const cita = await tx.citasPsicologos.findFirst({ where: { id: BigInt(citaId), tenantId: usuario.tenantId },
        include: { PaqueteAdquirido: { include: { TerapiasPsicologos: true } }, Servicio_CitasPsicologos_servicioIdToServicio: true } });
      if (!cita || cita.realizada !== false) throw new Error("Reserva no disponible.");
      const rental = /alquiler/i.test(cita.PaqueteAdquirido?.TerapiasPsicologos?.nombre || cita.Servicio_CitasPsicologos_servicioIdToServicio?.nombre || "");
      if (rental) throw new Error("Un alquiler requiere consultorio. Selecciona otro espacio o cancela la reserva.");
      await tx.citasPsicologos.update({ where: { id: cita.id, tenantId: usuario.tenantId }, data: { consultorioId: null } });
      await createAuditLog({ tenantId: usuario.tenantId, usuarioId: usuario.id, accion: "UPDATE", entidad: "Cita", entidadId: citaId, detalles: { consultorioAnterior: cita.consultorioId?.toString(), consultorioNuevo: null }, tx });
    });

    revalidatePath("/dashboard/citas/programacion");
    return { success: true };
  } catch (error) {
    console.error("Error desasignando cita:", error);
    return { error: error instanceof Error && error.name === "Error" ? error.message : "Error al desasignar la cita" };
  }
}
