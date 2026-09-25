"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { requireReceptionUser } from "@/lib/psychology-access";
import { createAuditLog } from "@/lib/audit";
import { getBogotaDayRange } from "@/lib/bogota-date";
import { cajaAmountInCents } from "@/lib/caja";
import { pesos, quoteCargo, validateReceptionPayment, requireId, requireReason, requireRequestId,
  requireOperationDate, RECEPCION_CODES, type CargoInput, type PagoInput, type ReceptionService,
  type ReceptionCode, type CargoRow, type PagoRow } from "@/lib/recepcion";
import { revalidatePath } from "next/cache";

type Tx = Prisma.TransactionClient;
const refresh = () => { revalidatePath("/dashboard/recepcion"); revalidatePath("/dashboard/contabilidad/caja"); };
const failure = (error: unknown) => {
  if (error instanceof Error && error.name === "Error") return { error: error.message };
  console.error("Operación de recepción fallida", error instanceof Error ? error.name : "unknown");
  return { error: "No se pudo confirmar la operación. Reintenta con los mismos datos; si persiste, informa a administración." };
};
async function services(tx: Tx, tenantId: number) {
  const rows = await tx.$queryRaw<ReceptionService[]>`
  SELECT "codigo", "nombre", "precio"::text, "unidad" FROM "ServicioRecepcion"
  WHERE "tenantId" = ${tenantId} ORDER BY "codigo"`;
  const rentals = await tx.terapiasPsicologos.findMany({ where: { tenantId, activo: true, cantidadSesiones: 1,
    nombre: { contains: "alquiler", mode: "insensitive" } }, select: { precioBase: true } });
  // The normal rate has one source of truth: the active single-session rental in the catalog.
  // Ambiguous catalogs must be corrected instead of guessing a rate.
  return rows.map((row) => row.codigo === "EXTRA_HORA" ? { ...row, precio: rentals.length === 1 ? Number(rentals[0].precioBase).toFixed(2) : null } : row);
}
async function lockReception(tx: Tx, tenantId: number) {
  // A short tenant-scoped lock serializes payments, reversals and idempotent retries.
  // No network/upload work is allowed inside this transaction.
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
}
function sameRequest(saved: unknown, input: unknown) {
  // JSONB object property order is not stable; compare normalized JSON recursively.
  const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object" ? `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`).join(",")}}` : JSON.stringify(v);
  if (canonical(saved) !== canonical(input)) throw new Error("Este identificador ya se usó con otros datos. Consulta el registro antes de crear otra operación.");
}

export async function getReceptionData(token: string, fecha: string) {
  try {
    const user = await requireReceptionUser(token);
    const range = getBogotaDayRange(fecha);
    const [catalogo, profesionales, reservas, cargos, pagos] = await Promise.all([
      services(prisma, user.tenantId),
      prisma.usuario.findMany({ where: { tenantId: user.tenantId, rol: "TECNICO", activo: true },
        select: { id: true, nombre: true, apellido: true }, orderBy: { nombre: "asc" } }),
      prisma.citasPsicologos.findMany({ where: { tenantId: user.tenantId, fechaCita: { gte: range.start, lt: range.end }, realizada: { not: null } },
        select: { id: true, psicologoId: true, horaInicio: true, horaFin: true, consultorios: { select: { nombre: true } } }, orderBy: { horaInicio: "asc" } }),
      prisma.$queryRaw<CargoRow[]>`
        SELECT c."id"::text, c."fecha"::text, c."profesionalId", CONCAT(u."nombre",' ',u."apellido") AS "profesional",
          c."citaId"::text,c."codigo",c."concepto",c."cantidad",c."precioUnitario"::text,c."total"::text,
          c."minutosExtra",c."nota",c."anulado",COALESCE(a."pagado",0)::numeric(12,2)::text AS "pagado"
        FROM "CargoRecepcion" c JOIN "Usuario" u ON u."id" = c."profesionalId" AND u."tenantId" = c."tenantId"
        LEFT JOIN (SELECT ap."cargoId", SUM(ap."monto") AS "pagado" FROM "AplicacionPagoRecepcion" ap
          JOIN "PagoRecepcion" p ON p."id" = ap."pagoId" WHERE NOT p."reversado" AND p."tenantId" = ${user.tenantId} GROUP BY ap."cargoId") a ON a."cargoId" = c."id"
        WHERE c."tenantId" = ${user.tenantId} AND c."fecha" = ${fecha}::date ORDER BY c."id" DESC`,
      prisma.$queryRaw<PagoRow[]>`
        SELECT p."id"::text,p."fecha"::text,p."monto"::text,p."metodoPago",p."referencia",p."reversado",
          STRING_AGG(ap."cargoId"::text,', ' ORDER BY ap."cargoId") AS "cargos"
        FROM "PagoRecepcion" p JOIN "AplicacionPagoRecepcion" ap ON ap."pagoId" = p."id"
        WHERE p."tenantId" = ${user.tenantId} AND p."fecha" = ${fecha}::date GROUP BY p."id" ORDER BY p."id" DESC`,
    ]);
    return { catalogo, profesionales, cargos, pagos, admin: ["ADMIN", "SU_ADMIN"].includes(user.rol || ""),
      reservas: reservas.map((r) => ({ id: r.id.toString(), profesionalId: r.psicologoId,
        inicio: r.horaInicio?.toISOString() || "", fin: r.horaFin?.toISOString() || "", consultorio: r.consultorios?.nombre || "Sin consultorio" })) };
  } catch (error) { return failure(error); }
}

export async function createReceptionCharge(token: string, input: CargoInput) {
  try {
    const user = await requireReceptionUser(token);
    const solicitudId = requireRequestId(input.solicitudId);
    const snapshot = { solicitudId, fecha: input.fecha, profesionalId: input.profesionalId, citaId: input.citaId || "",
      tipo: input.tipo, cantidad: input.tipo === "IMPRESION" ? input.cantidad : 1,
      ...(input.tipo === "TIEMPO_EXTRA" ? { minutosExtra: input.minutosExtra } : {}), nota: input.nota.trim() };
    const id = await prisma.$transaction(async (tx) => {
      await lockReception(tx, user.tenantId);
      const saved = await tx.$queryRaw<{ id: string; solicitud: unknown }[]>`SELECT "id"::text,"solicitud" FROM "CargoRecepcion"
        WHERE "tenantId" = ${user.tenantId} AND "creadoPorId" = ${user.id} AND "solicitudId" = ${solicitudId}::uuid`;
      if (saved[0]) { sameRequest(saved[0].solicitud, snapshot); return saved[0].id; }
      const q = quoteCargo(snapshot, await services(tx, user.tenantId));
      const professional = await tx.usuario.findFirst({ where: { id: q.profesionalId, tenantId: user.tenantId, rol: "TECNICO", activo: true }, select: { id: true } });
      if (!professional) throw new Error("El profesional no está activo en este sistema.");
      if (q.citaId) {
        const cita = await tx.citasPsicologos.findFirst({ where: { id: BigInt(q.citaId), tenantId: user.tenantId, psicologoId: q.profesionalId },
          include: { PaqueteAdquirido: { include: { TerapiasPsicologos: true } }, Servicio_CitasPsicologos_servicioIdToServicio: true } });
        if (!cita) throw new Error("La reserva no pertenece a este profesional y sistema.");
        if (q.codigo !== "IMPRESION") {
          const name = cita.PaqueteAdquirido?.TerapiasPsicologos?.nombre || cita.Servicio_CitasPsicologos_servicioIdToServicio?.nombre || "";
          if (!/alquiler/i.test(name) || !cita.consultorioId || cita.realizada === null) throw new Error("Solo se puede agregar tiempo a un alquiler vigente con consultorio.");
          if (!cita.horaFin || cita.horaFin.getTime() > Date.now()) throw new Error("El horario reservado todavía no ha finalizado.");
          if (getBogotaDayRange(q.fecha).end <= cita.horaFin) throw new Error("La fecha del adicional no puede preceder al fin de la reserva.");
          const previous = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text FROM "CargoRecepcion" WHERE "tenantId" = ${user.tenantId}
            AND "citaId" = ${q.citaId}::bigint AND "codigo" IN ('EXTRA_CORTO','EXTRA_MEDIO','EXTRA_HORA') AND NOT "anulado"`;
          if (previous.length) throw new Error("Esta reserva ya tiene tiempo extra. Revisa o anula el cargo anterior antes de reemplazarlo.");
        }
      }
      const inserted = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "CargoRecepcion"
        ("tenantId","profesionalId","citaId","creadoPorId","fecha","codigo","concepto","cantidad","precioUnitario","total","minutosExtra","nota","solicitudId","solicitud")
        VALUES (${user.tenantId},${q.profesionalId},${q.citaId}::bigint,${user.id},${q.fecha}::date,${q.codigo},${q.concepto},${q.cantidad},
          ${q.precioUnitario}::numeric,${q.total}::numeric,${q.minutosExtra},${q.nota},${q.solicitudId}::uuid,${JSON.stringify(snapshot)}::jsonb) RETURNING "id"::text`;
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "CREATE", entidad: "CargoRecepcion", entidadId: inserted[0].id, detalles: q, tx });
      return inserted[0].id;
    });
    refresh(); return { success: true, id };
  } catch (error) { return failure(error); }
}

export async function recordReceptionPayment(token: string, input: PagoInput) {
  try {
    const user = await requireReceptionUser(token);
    const data = validateReceptionPayment(input);
    const id = await prisma.$transaction(async (tx) => {
      await lockReception(tx, user.tenantId);
      const saved = await tx.$queryRaw<{ id: string; solicitud: unknown }[]>`SELECT "id"::text,"solicitud" FROM "PagoRecepcion"
        WHERE "tenantId" = ${user.tenantId} AND "creadoPorId" = ${user.id} AND "solicitudId" = ${data.solicitudId}::uuid`;
      if (saved[0]) { sameRequest(saved[0].solicitud, data); return saved[0].id; }
      const duplicate = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text FROM "PagoRecepcion" WHERE "tenantId" = ${user.tenantId}
        AND "metodoPago" = ${data.metodoPago} AND lower(trim("referencia")) = lower(${data.referencia}) AND NOT "reversado"`;
      if (duplicate.length) throw new Error("Ya existe un pago con esa referencia y medio. Consulta el libro antes de volver a cobrar.");
      let owner: number | null = null;
      for (const item of data.aplicaciones) {
        const rows = await tx.$queryRaw<{ total: string; pagado: string; profesionalId: number; fecha: string; anulado: boolean }[]>`
          SELECT c."total"::text,c."profesionalId",c."fecha"::text,c."anulado",
          COALESCE((SELECT SUM(ap."monto") FROM "AplicacionPagoRecepcion" ap JOIN "PagoRecepcion" p ON p."id" = ap."pagoId"
            WHERE ap."cargoId" = c."id" AND p."tenantId" = ${user.tenantId} AND NOT p."reversado"),0)::numeric(12,2)::text AS "pagado"
          FROM "CargoRecepcion" c WHERE c."id" = ${item.cargoId}::bigint AND c."tenantId" = ${user.tenantId}`;
        const cargo = rows[0];
        if (!cargo || cargo.anulado) throw new Error("Uno de los cargos no existe o está anulado.");
        if (cargo.fecha > data.fecha) throw new Error("El pago no puede preceder al cargo; registra anticipos en su circuito correspondiente.");
        if (owner !== null && cargo.profesionalId !== owner) throw new Error("Un pago solo puede aplicarse a cargos del mismo profesional.");
        owner = cargo.profesionalId;
        const remaining = cajaAmountInCents(cargo.total) - Math.round(Number(cargo.pagado) * 100);
        if (cajaAmountInCents(item.monto) > remaining) throw new Error("El pago supera el saldo pendiente. Actualiza la pantalla.");
      }
      const movement = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "MovimientoCaja"
        ("tenantId","creadoPorId","fecha","tipo","metodoPago","monto","concepto","referencia","solicitudId")
        VALUES (${user.tenantId},${user.id},${data.fecha}::date,'INGRESO',${data.metodoPago},${data.total}::numeric,
          ${`Pago de servicios de recepción: ${data.aplicaciones.map((a) => a.cargoId).join(", ").slice(0, 180)}`},${data.referencia},${data.solicitudId}::uuid) RETURNING "id"::text`;
      const rows = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "PagoRecepcion"
        ("tenantId","creadoPorId","fecha","monto","metodoPago","referencia","movimientoCajaId","solicitudId","solicitud")
        VALUES (${user.tenantId},${user.id},${data.fecha}::date,${data.total}::numeric,${data.metodoPago},${data.referencia},${movement[0].id}::bigint,${data.solicitudId}::uuid,${JSON.stringify(data)}::jsonb) RETURNING "id"::text`;
      for (const item of data.aplicaciones) await tx.$executeRaw`INSERT INTO "AplicacionPagoRecepcion" ("pagoId","cargoId","monto")
        VALUES (${rows[0].id}::bigint,${item.cargoId}::bigint,${item.monto}::numeric)`;
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "CREATE", entidad: "PagoRecepcion", entidadId: rows[0].id, detalles: data, tx });
      return rows[0].id;
    });
    refresh(); return { success: true, id };
  } catch (error) { return failure(error); }
}

export async function cancelReceptionCharge(token: string, id: string, reason: string) {
  try {
    const user = await requireReceptionUser(token, true);
    requireId(id); const motivo = requireReason(reason);
    await prisma.$transaction(async (tx) => {
      await lockReception(tx, user.tenantId);
      const rows = await tx.$queryRaw<{ anulado: boolean; pagos: string }[]>`SELECT c."anulado",
        COALESCE((SELECT SUM(a."monto") FROM "AplicacionPagoRecepcion" a JOIN "PagoRecepcion" p ON p."id" = a."pagoId"
          WHERE a."cargoId" = c."id" AND NOT p."reversado"),0)::text AS "pagos"
        FROM "CargoRecepcion" c WHERE c."tenantId" = ${user.tenantId} AND c."id" = ${id}::bigint`;
      if (!rows[0]) throw new Error("Cargo no encontrado.");
      if (rows[0].anulado) return;
      if (Number(rows[0].pagos) !== 0) throw new Error("Primero registra la devolución del pago; el dinero no puede desaparecer al anular el cargo.");
      await tx.$executeRaw`UPDATE "CargoRecepcion" SET "anulado" = TRUE,"motivoAnulacion" = ${motivo} WHERE "tenantId" = ${user.tenantId} AND "id" = ${id}::bigint`;
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "CANCEL", entidad: "CargoRecepcion", entidadId: id, detalles: { motivo }, tx });
    });
    refresh(); return { success: true };
  } catch (error) { return failure(error); }
}

export async function refundReceptionPayment(token: string, id: string, fecha: string, reason: string, solicitudId: string) {
  try {
    const user = await requireReceptionUser(token, true);
    requireId(id); requireRequestId(solicitudId); requireOperationDate(fecha); const motivo = requireReason(reason);
    await prisma.$transaction(async (tx) => {
      await lockReception(tx, user.tenantId);
      const rows = await tx.$queryRaw<{ reversado: boolean; monto: string; metodoPago: string; fecha: string }[]>`SELECT "reversado","monto"::text,"metodoPago","fecha"::text
        FROM "PagoRecepcion" WHERE "tenantId" = ${user.tenantId} AND "id" = ${id}::bigint`;
      const pago = rows[0];
      if (!pago) throw new Error("Pago no encontrado.");
      if (pago.reversado) return;
      if (fecha < pago.fecha) throw new Error("La devolución no puede preceder al pago.");
      const movement = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "MovimientoCaja"
        ("tenantId","creadoPorId","fecha","tipo","metodoPago","monto","concepto","referencia","solicitudId")
        VALUES (${user.tenantId},${user.id},${fecha}::date,'EGRESO',${pago.metodoPago},${pago.monto}::numeric,
          ${`Devolución pago recepción ${id}: ${motivo}`.slice(0,240)},${`REV-PAGO-${id}`},${solicitudId}::uuid) RETURNING "id"::text`;
      await tx.$executeRaw`UPDATE "PagoRecepcion" SET "reversado" = TRUE,"reversoMovimientoId" = ${movement[0].id}::bigint WHERE "tenantId" = ${user.tenantId} AND "id" = ${id}::bigint`;
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "REFUND", entidad: "PagoRecepcion", entidadId: id, detalles: { motivo, fecha, movimientoId: movement[0].id }, tx });
    });
    refresh(); return { success: true };
  } catch (error) { return failure(error); }
}

export async function updateReceptionRate(token: string, codigo: ReceptionCode, precio: string, reason: string) {
  try {
    const user = await requireReceptionUser(token, true);
    if (!RECEPCION_CODES.includes(codigo)) throw new Error("Servicio inválido.");
    if (codigo === "EXTRA_HORA") throw new Error("La tarifa normal se configura en el servicio de alquiler del catálogo, para evitar precios diferentes.");
    const importe = pesos(cajaAmountInCents(precio)); const motivo = requireReason(reason);
    await prisma.$transaction(async (tx) => {
      await lockReception(tx, user.tenantId);
      const previous = (await services(tx, user.tenantId)).find((s) => s.codigo === codigo);
      if (!previous) throw new Error("Servicio no encontrado.");
      await tx.$executeRaw`UPDATE "ServicioRecepcion" SET "precio" = ${importe}::numeric,"updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = ${user.tenantId} AND "codigo" = ${codigo}`;
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "UPDATE", entidad: "ServicioRecepcion", entidadId: codigo, detalles: { antes: previous.precio, despues: importe, motivo }, tx });
    });
    refresh(); return { success: true };
  } catch (error) { return failure(error); }
}
