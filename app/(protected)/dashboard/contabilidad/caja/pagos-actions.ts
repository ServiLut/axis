"use server";

import prisma from "@/lib/prisma";
import { requireReceptionUser } from "@/lib/psychology-access";
import { validatePagoServicio, type PagoServicioInput } from "@/lib/pago-servicio";
import { createAuditLog } from "@/lib/audit";
import { bogotaToday, getBogotaDayRange } from "@/lib/bogota-date";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

type ExistingLine = { id: string; citaId: string | null; paqueteId: string | null; fecha: string;
  monto: string; metodoPago: string; referencia: string; linea: number };
type OpenItem = { origen: "CITA" | "PAQUETE"; id: string; fecha: string; persona: string;
  valor: string; registrado: string; estado: string; situacion: "PENDIENTE" | "SIN_LIBRO" | "REVISAR_LEGADO" };
type OpenItemWithCounts = OpenItem & { totalRegistros: number; vencidos: number; sinLibro: number; legado: number;
  valorVencido: string; valorSinLibro: string };

function fail(error: unknown) {
  if (error instanceof Error && error.name === "Error") return { error: error.message };
  console.error("Error en recaudo de Psicología", error instanceof Error ? error.name : "unknown");
  return { error: "No se pudo confirmar el recaudo. Revisa el libro antes de reintentar con los mismos datos." };
}

export async function getPendientesPsicologia(token: string, fecha: string, offset = 0) {
  try {
    const user = await requireReceptionUser(token);
    getBogotaDayRange(fecha);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error("Página de pendientes inválida.");
    // La fecha de cobro y la de prestación son distintas. Los pagos históricos marcados
    // CONCILIADO no se inventan como movimientos: se presentan para verificación.
    const rows = await prisma.$queryRaw<OpenItemWithCounts[]>`
      WITH cobros_cita AS (
        SELECT "citaId", SUM("monto") AS total FROM "PagoServicioPsicologia"
        WHERE "tenantId" = ${user.tenantId} AND NOT "reversado" AND "citaId" IS NOT NULL GROUP BY "citaId"
      ), cobros_paquete AS (
        SELECT "paqueteId", SUM("monto") AS total FROM "PagoServicioPsicologia"
        WHERE "tenantId" = ${user.tenantId} AND NOT "reversado" AND "paqueteId" IS NOT NULL GROUP BY "paqueteId"
      ), pendientes AS (
      SELECT 'CITA' AS "origen", (c."id"::text) AS "id", (c."fechaCita" AT TIME ZONE 'America/Bogota')::date::text AS "fecha",
        CONCAT_WS(' ',cl."nombre",cl."apellido") AS "persona", c."valor"::numeric(12,2)::text AS "valor",
        COALESCE(pc.total,0)::numeric(12,2)::text AS "registrado", COALESCE(c."estadoPago"::text,'PENDIENTE') AS "estado",
        CASE WHEN c."estadoPago" IN ('CONCILIADO','CONSIGNADO','EFECTIVO_DECLARADO') AND COALESCE(pc.total,0)=0
          THEN CASE WHEN (c."fechaCita" AT TIME ZONE 'America/Bogota')::date < '2026-09-26'::date
            THEN 'REVISAR_LEGADO' ELSE 'SIN_LIBRO' END
          ELSE 'PENDIENTE' END AS "situacion"
      FROM "CitasPsicologos" c LEFT JOIN "Cliente" cl ON cl."id"=c."pacienteId" AND cl."tenantId"=c."tenantId"
      LEFT JOIN cobros_cita pc ON pc."citaId"=c."id"
      WHERE c."tenantId"=${user.tenantId} AND c."paqueteId" IS NULL AND c."realizada" IS DISTINCT FROM NULL
        AND c."fechaCita" IS NOT NULL AND c."valor">0
        AND c."valor" > COALESCE(pc.total,0)
      UNION ALL
      SELECT 'PAQUETE', p."id"::text, (p."fechaCompra" AT TIME ZONE 'America/Bogota')::date::text,
        CONCAT_WS(' ',cl."nombre",cl."apellido"), p."precioPagado"::numeric(12,2)::text,
        COALESCE(pp.total,0)::numeric(12,2)::text,
        p."estado"::text,
        CASE WHEN (p."fechaCompra" AT TIME ZONE 'America/Bogota')::date < '2026-09-26'::date
          AND COALESCE(pp.total,0)=0 THEN 'REVISAR_LEGADO' ELSE 'PENDIENTE' END
      FROM "PaqueteAdquirido" p LEFT JOIN "Cliente" cl ON cl."id"=p."clienteId" AND cl."tenantId"=p."tenantId"
      LEFT JOIN cobros_paquete pp ON pp."paqueteId"=p."id"
      WHERE p."tenantId"=${user.tenantId} AND p."precioPagado">0 AND p."fechaCompra" IS NOT NULL
        AND (p."fechaCompra" AT TIME ZONE 'America/Bogota')::date <= ${fecha}::date
        AND p."precioPagado">COALESCE(pp.total,0)
      )
      SELECT pendientes.*,
        COUNT(*) OVER()::int AS "totalRegistros",
        COUNT(*) FILTER (WHERE "fecha" < ${fecha} AND "situacion" <> 'REVISAR_LEGADO') OVER()::int AS "vencidos",
        COUNT(*) FILTER (WHERE "situacion" = 'SIN_LIBRO') OVER()::int AS "sinLibro",
        COUNT(*) FILTER (WHERE "situacion" = 'REVISAR_LEGADO') OVER()::int AS "legado",
        COALESCE(SUM("valor"::numeric-"registrado"::numeric) FILTER
          (WHERE "fecha" < ${fecha} AND "situacion" = 'PENDIENTE') OVER(),0)::numeric(12,2)::text AS "valorVencido",
        COALESCE(SUM("valor"::numeric-"registrado"::numeric) FILTER
          (WHERE "situacion" = 'SIN_LIBRO') OVER(),0)::numeric(12,2)::text AS "valorSinLibro"
      FROM pendientes ORDER BY "fecha" DESC,"id"::bigint DESC,"origen" DESC LIMIT 200 OFFSET ${offset}`;
    return { items: rows.map((row): OpenItem => ({ origen: row.origen, id: row.id, fecha: row.fecha,
      persona: row.persona, valor: row.valor, registrado: row.registrado, estado: row.estado, situacion: row.situacion })),
      summary: { total: rows[0]?.totalRegistros ?? 0, vencidos: rows[0]?.vencidos ?? 0,
        sinLibro: rows[0]?.sinLibro ?? 0, legado: rows[0]?.legado ?? 0,
        valorVencido: rows[0]?.valorVencido ?? "0.00", valorSinLibro: rows[0]?.valorSinLibro ?? "0.00" } };
  } catch (error) { return fail(error); }
}

export async function registrarPagoServicio(token: string, input: PagoServicioInput) {
  try {
    const user = await requireReceptionUser(token);
    const data = validatePagoServicio(input);
    const ids = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${user.tenantId} FOR UPDATE`;
      const saved = await tx.$queryRaw<ExistingLine[]>`SELECT "id"::text,"citaId"::text,"paqueteId"::text,"fecha"::text,
        "monto"::text,"metodoPago","referencia","linea" FROM "PagoServicioPsicologia"
        WHERE "tenantId"=${user.tenantId} AND "creadoPorId"=${user.id} AND "solicitudId"=${data.solicitudId}::uuid ORDER BY "linea"`;
      if (saved.length) {
        const same = saved.length === data.lineas.length && saved.every((row, index) =>
          row.linea === index + 1 && row.citaId === (data.origen === "CITA" ? data.origenId : null) &&
          row.paqueteId === (data.origen === "PAQUETE" ? data.origenId : null) && row.fecha === data.fecha &&
          row.monto === data.lineas[index].monto && row.metodoPago === data.lineas[index].metodoPago &&
          row.referencia === data.lineas[index].referencia);
        if (!same) throw new Error("Este identificador ya se utilizó para otro pago. Actualiza la pantalla.");
        return saved.map((row) => row.id);
      }
      const cita = data.origen === "CITA" ? await tx.citasPsicologos.findFirst({ where: {
        id: BigInt(data.origenId), tenantId: user.tenantId, paqueteId: null, realizada: { not: null } },
        select: { valor: true, estadoPago: true, fechaCita: true } }) : null;
      const paquete = data.origen === "PAQUETE" ? await tx.paqueteAdquirido.findFirst({ where: {
        id: BigInt(data.origenId), tenantId: user.tenantId }, select: { precioPagado: true, fechaCompra: true } }) : null;
      if (!cita && !paquete) throw new Error("La cita o el paquete no está disponible en PSICOLOGOS.");
      if (cita?.estadoPago && cita.estadoPago !== "PENDIENTE")
        throw new Error("Esta cita ya tiene un estado de cobro anterior. Revisa el comprobante y el banco antes de registrar otro pago.");
      if (paquete?.fechaCompra && paquete.fechaCompra < new Date("2026-09-26T05:00:00Z"))
        throw new Error("Este paquete es anterior al nuevo libro. Verifica primero su pago histórico para no duplicar ingresos.");
      const valor = Number(cita?.valor ?? paquete?.precioPagado ?? 0);
      if (!Number.isFinite(valor) || valor <= 0) throw new Error("El servicio no tiene precio válido.");
      // Una cita futura puede pagarse hoy: caja registra el día real del dinero,
      // mientras la agenda conserva el día de la prestación.
      const previous = await tx.$queryRaw<{ total: string }[]>`SELECT COALESCE(SUM("monto"),0)::text AS "total"
        FROM "PagoServicioPsicologia" WHERE "tenantId"=${user.tenantId} AND NOT "reversado"
        AND (${data.origen === "CITA"} AND "citaId"=${data.origenId}::bigint OR ${data.origen === "PAQUETE"} AND "paqueteId"=${data.origenId}::bigint)`;
      const already = Math.round(Number(previous[0].total) * 100);
      if (!Number.isSafeInteger(already) || already + data.totalCentavos > Math.round(valor * 100))
        throw new Error("El cobro excede el valor pendiente. Consulta los pagos existentes.");
      const ids: string[] = [];
      for (const [index, line] of data.lineas.entries()) {
        if (line.referencia) {
          const duplicate = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text FROM "PagoServicioPsicologia"
            WHERE "tenantId"=${user.tenantId} AND NOT "reversado" AND "metodoPago"=${line.metodoPago}
              AND lower(trim("referencia"))=lower(${line.referencia}) LIMIT 1`;
          const duplicateReception = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text FROM "PagoRecepcion"
            WHERE "tenantId"=${user.tenantId} AND NOT "reversado" AND "metodoPago"=${line.metodoPago}
              AND lower(trim("referencia"))=lower(${line.referencia}) LIMIT 1`;
          if (duplicate.length || duplicateReception.length) throw new Error("La referencia ya existe en el libro. Verifica si este dinero se registró antes.");
        }
        const movement = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "MovimientoCaja"
          ("tenantId","creadoPorId","fecha","tipo","metodoPago","monto","concepto","referencia","solicitudId")
          VALUES (${user.tenantId},${user.id},${data.fecha}::date,'INGRESO',${line.metodoPago},${line.monto}::numeric,
            ${`Pago ${data.origen.toLowerCase()} ${data.origenId}`},${line.referencia},${randomUUID()}::uuid) RETURNING "id"::text`;
        const payment = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "PagoServicioPsicologia"
          ("tenantId","creadoPorId","citaId","paqueteId","movimientoCajaId","fecha","monto","metodoPago","referencia","solicitudId","linea")
          VALUES (${user.tenantId},${user.id},${data.origen === "CITA" ? data.origenId : null}::bigint,
            ${data.origen === "PAQUETE" ? data.origenId : null}::bigint,${movement[0].id}::bigint,${data.fecha}::date,
            ${line.monto}::numeric,${line.metodoPago},${line.referencia},${data.solicitudId}::uuid,${index + 1}) RETURNING "id"::text`;
        ids.push(payment[0].id);
      }
      if (cita) await tx.citasPsicologos.update({ where: { id: BigInt(data.origenId) },
        data: { estadoPago: already + data.totalCentavos === Math.round(valor * 100) ? "CONCILIADO" : "PENDIENTE",
          metodoPago: data.lineas.length === 1 ? data.lineas[0].metodoPago : "MIXTO" } });
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "CREATE", entidad: "PagoServicioPsicologia",
        entidadId: ids.join(","), detalles: { origen: data.origen, origenId: data.origenId, fecha: data.fecha,
          lineas: data.lineas.map((line) => ({ metodoPago: line.metodoPago, monto: line.monto, referencia: line.referencia })) }, tx });
      return ids;
    });
    revalidatePath("/dashboard/contabilidad/caja"); revalidatePath("/dashboard/citas");
    return { success: true, ids };
  } catch (error) { return fail(error); }
}

export async function getPagosServicioDelDia(token: string, fecha: string) {
  try {
    const user = await requireReceptionUser(token);
    getBogotaDayRange(fecha);
    const rows = await prisma.$queryRaw<{ id: string; origen: string; origenId: string; monto: string;
      metodoPago: string; referencia: string; reversado: boolean }[]>`
      SELECT "id"::text, CASE WHEN "citaId" IS NULL THEN 'PAQUETE' ELSE 'CITA' END AS "origen",
        COALESCE("citaId","paqueteId")::text AS "origenId", "monto"::text, "metodoPago","referencia","reversado"
      FROM "PagoServicioPsicologia" WHERE "tenantId"=${user.tenantId} AND "fecha"=${fecha}::date
      ORDER BY "id" DESC LIMIT 100`;
    return { pagos: rows, admin: user.rol === "ADMIN" || user.rol === "SU_ADMIN" };
  } catch (error) { return fail(error); }
}

export async function devolverPagoServicio(token: string, id: string, fecha: string, motivo: string, solicitudId: string) {
  try {
    const user = await requireReceptionUser(token, true);
    getBogotaDayRange(fecha);
    if (fecha > bogotaToday())
      throw new Error("La devolución no puede tener fecha futura.");
    if (!/^[1-9]\d{0,17}$/.test(id) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(solicitudId))
      throw new Error("Registro inválido.");
    const reason = motivo.trim();
    if (reason.length < 5 || reason.length > 180) throw new Error("Indica el motivo de la devolución (5 a 180 caracteres).");
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${user.tenantId} FOR UPDATE`;
      const rows = await tx.$queryRaw<{ citaId: string | null; paqueteId: string | null; monto: string;
        metodoPago: string; fecha: string; reversado: boolean }[]>`
        SELECT "citaId"::text,"paqueteId"::text,"monto"::text,"metodoPago","fecha"::text,"reversado"
        FROM "PagoServicioPsicologia" WHERE "tenantId"=${user.tenantId} AND "id"=${id}::bigint`;
      const pago = rows[0];
      if (!pago) throw new Error("Pago no encontrado.");
      if (pago.reversado) return;
      if (fecha < pago.fecha) throw new Error("La devolución no puede ser anterior al pago.");
      const movement = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "MovimientoCaja"
        ("tenantId","creadoPorId","fecha","tipo","metodoPago","monto","concepto","referencia","solicitudId")
        VALUES (${user.tenantId},${user.id},${fecha}::date,'EGRESO',${pago.metodoPago},${pago.monto}::numeric,
          ${`Devolución pago ${id}: ${reason}`},${`DEV-${id}`},${solicitudId}::uuid) RETURNING "id"::text`;
      await tx.$executeRaw`UPDATE "PagoServicioPsicologia" SET "reversado"=TRUE,
        "reversoMovimientoId"=${movement[0].id}::bigint WHERE "tenantId"=${user.tenantId} AND "id"=${id}::bigint`;
      if (pago.citaId) await tx.citasPsicologos.update({ where: { id: BigInt(pago.citaId) }, data: { estadoPago: "PENDIENTE" } });
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "REFUND", entidad: "PagoServicioPsicologia",
        entidadId: id, detalles: { fecha, motivo: reason, movimientoId: movement[0].id }, tx });
    });
    revalidatePath("/dashboard/contabilidad/caja"); revalidatePath("/dashboard/citas");
    return { success: true };
  } catch (error) { return fail(error); }
}
