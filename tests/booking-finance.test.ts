import assert from "node:assert/strict";
import { test } from "node:test";
import { fromZonedTime } from "date-fns-tz";
import { Prisma } from "../prisma/generated/prisma/client";
import { loadServerModule } from "./load-server-module";
import type * as Calendar from "../app/(protected)/dashboard/citas/programacion/actions";
import type * as Appointments from "../app/(protected)/dashboard/citas/actions";
import type * as Balances from "../app/(protected)/dashboard/contabilidad/balances/actions";
import type * as Expenses from "../app/(protected)/dashboard/contabilidad/egresos/actions";
import type * as Audit from "../lib/audit";

const auth = { verifyToken: (token: string) => token === "valid" ? { userId: 10 } : null };
const actor = { id: 10, tenantId: 4, rol: "SU_ADMIN", activo: true, aprobado: true };
const mockEnums = { Prisma, Rol: { SU_ADMIN: "SU_ADMIN" }, EstadoPagoOrden: { PENDIENTE: "PENDIENTE", CONCILIADO: "CONCILIADO" } };

function bookingFixture() {
  const state = { occupied: false, active: true, ownerValid: true, writes: 0, audits: 0, locks: 0, query: "", cancelled: false };
  const cita = { id: 1n, tenantId: 4, psicologoId: 20, consultorioId: 2n, realizada: false as boolean | null,
    horaInicio: new Date("2026-09-25T15:00:00Z"), horaFin: new Date("2026-09-25T16:00:00Z"),
    PaqueteAdquirido: { TerapiasPsicologos: { nombre: "Alquiler consultorio" } } };
  const prisma = {
    usuario: { findUnique: async () => ({ ...actor, activo: state.active }), findFirst: async () => state.ownerValid ? { id: 20 } : null },
    consultorios: { findFirst: async () => ({ id: 2n }) },
    citasPsicologos: {
      findFirst: async (q: { where: { OR?: unknown } }) => {
        if (q.where.OR) { state.query = JSON.stringify(q.where, (_, v) => typeof v === "bigint" ? v.toString() : v); return state.occupied ? { id: 2n } : null; }
        return { ...cita, realizada: state.cancelled ? null : cita.realizada };
      },
      update: async () => { state.writes++; return cita; },
      updateMany: async () => { state.writes++; return { count: 1 }; },
      findMany: async () => [false, true, null].map((realizada, i) => ({ ...cita, id: BigInt(i + 1), realizada })),
    },
    $queryRaw: async () => { state.locks++; return [{ id: 4 }]; },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
  };
  const mocks = { "@/lib/prisma": prisma, "./prisma": prisma, "@/lib/auth": auth, "./auth": auth,
    "@/lib/audit": { createAuditLog: async () => { state.audits++; } }, "next/cache": { revalidatePath() {} },
    "@/prisma/generated/prisma/client": mockEnums, "date-fns-tz": { fromZonedTime }, "@supabase/supabase-js": {} };
  return { state, calendar: loadServerModule<typeof Calendar>("app/(protected)/dashboard/citas/programacion/actions.ts", mocks),
    appointments: loadServerModule<typeof Appointments>("app/(protected)/dashboard/citas/actions.ts", mocks) };
}

test("calendar keeps completed status and moves only full, nonoverlapping reservations", async () => {
  const f = bookingFixture();
  const read = await f.calendar.getCitasByDateRange("valid", "2026-09-25");
  assert.deepEqual(Array.from(read.ordenes || [], (c) => c.estado), ["PROGRAMADO", "REALIZADO", "CANCELADO"]);
  assert.ok((await f.calendar.moveCita("valid", 1, 2, "2026-09-26", "10:00", "12:00")).error);
  assert.ok((await f.calendar.unassignCita("valid", 1)).error);
  assert.equal(f.state.writes, 0);
  assert.equal((await f.calendar.moveCita("valid", 1, 2, "2026-09-26", "10:00", "11:00")).success, true);
  assert.equal(f.state.audits, 1);
  f.state.occupied = true;
  assert.match((await f.calendar.moveCita("valid", 1, 2, "2026-09-26", "10:00", "11:00")).error || "", /ya tiene/);
  assert.match(f.state.query, /psicologoId/);
  assert.match(f.state.query, /consultorioId/);
  assert.match(f.state.query, /"realizada":\{"not":null\}/);
  assert.equal(f.state.writes, 1);
});

test("restoring cancelled appointments cannot bypass professional/room conflicts or inactive-user checks", async () => {
  const f = bookingFixture(); f.state.cancelled = true; f.state.occupied = true;
  assert.match((await f.appointments.restoreCitaCancelada("valid", 1)).error || "", /ya tiene/);
  assert.equal(f.state.writes, 0);
  f.state.occupied = false; f.state.ownerValid = false;
  assert.ok((await f.appointments.restoreCitaCancelada("valid", 1)).error);
  f.state.ownerValid = true; f.state.active = false;
  assert.ok((await f.appointments.restoreCitaCancelada("valid", 1)).error);
  f.state.active = true;
  assert.equal((await f.appointments.restoreCitaCancelada("valid", 1)).success, true);
  assert.equal(f.state.writes, 1); assert.equal(f.state.audits, 1); assert.ok(f.state.locks > 0);
});

test("psychology balances exclude pending amounts from conciliated services and scope every source even for superadmin", async () => {
  const queries: { where: { tenantId: number; fechaCita?: { gte: Date; lt: Date } } }[] = [];
  const aggregate = (field: string) => async (query: typeof queries[number]) => { queries.push(query); return { _sum: { [field]: 10 }, _count: { id: 1 } }; };
  const prisma = { usuario: { findUnique: async () => actor }, citasPsicologos: { findMany: async (q: typeof queries[number]) => {
    queries.push(q); return [
      { valor: 300, estadoPago: "PENDIENTE" },
      { valor: 100, estadoPago: "CONCILIADO", metodoPago: "EFECTIVO" },
      ...Array.from({ length: 3 }, () => ({ estadoPago: "CONCILIADO", metodoPago: "TRANSFERENCIA", PaqueteAdquirido: { precioPagado: 100, sesionesTotales: 3 } })),
    ];
  } }, nomina: { aggregate: aggregate("totalPagar") }, anticipos: { aggregate: aggregate("monto") }, egresos: { aggregate: aggregate("monto") },
    $queryRaw: async () => [{ ingresos: "500.00", egresos: "20.00", neto: "480.00" }] };
  const actions = loadServerModule<typeof Balances>("app/(protected)/dashboard/contabilidad/balances/actions.ts", {
    "@/lib/prisma": prisma, "./prisma": prisma, "@/lib/auth": auth, "./auth": auth, "@/prisma/generated/prisma/client": mockEnums,
  }, { NEXT_PUBLIC_RECEPCION_ENABLED: "true" });
  const result = await actions.getBalanceGeneral("valid", new Date("2026-09-25"), new Date("2026-09-25"));
  assert.equal(result.success, true); if (!result.success) return;
  assert.equal(result.data.ingresos.totalRecaudado, 200);
  assert.equal(result.data.ingresos.valorPorConciliar, 300);
  assert.equal(result.data.ingresos.valorRealizado, 500);
  assert.equal(result.data.neto, 170);
  assert.equal(result.data.caja?.neto, "480.00");
  assert.ok(queries.every((q) => q.where.tenantId === 4));
  assert.equal(queries[0].where.fechaCita?.gte.toISOString(), "2026-09-25T05:00:00.000Z");
  assert.equal(queries[0].where.fechaCita?.lt.toISOString(), "2026-09-26T05:00:00.000Z");
});

test("expense annulment conserves original, requires a reason and creates one opposite entry", async () => {
  const state = { reversed: false, entries: [] as { monto: number; razon: string }[], rol: "ADMIN" };
  const prisma = { usuario: { findUnique: async () => ({ ...actor, rol: state.rol }) },
    $queryRaw: async () => [],
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
    auditoria: { findFirst: async () => state.reversed ? { id: 1 } : null },
    egresos: { findFirst: async () => ({ id: 1n, tenantId: 4, monto: 100, userId: 20 }),
      create: async ({ data }: { data: { monto: number; razon: string } }) => { state.entries.push(data); return { id: 2n }; } },
  };
  const actions = loadServerModule<typeof Expenses>("app/(protected)/dashboard/contabilidad/egresos/actions.ts", {
    "@/lib/prisma": prisma, "./prisma": prisma, "@/lib/auth": auth, "./auth": auth, "next/cache": { revalidatePath() {} },
    "@/lib/audit": { createAuditLog: async () => { state.reversed = true; } },
  });
  assert.equal((await actions.deleteEgreso("valid", "1", "")).success, false);
  state.rol = "ASESOR";
  assert.equal((await actions.deleteEgreso("valid", "1", "Registro duplicado")).success, false);
  state.rol = "ADMIN";
  assert.equal((await actions.deleteEgreso("valid", "1", "Registro duplicado")).success, true);
  assert.equal((await actions.deleteEgreso("valid", "1", "Registro duplicado")).success, true);
  assert.equal(state.entries.length, 1); assert.equal(state.entries[0].monto, -100);
  assert.equal(state.entries[0].razon, "Registro duplicado");
});

test("required audit failure propagates to roll back transactional writes", async () => {
  const db = { auditoria: { create: async () => { throw new Error("offline"); } } };
  const audit = loadServerModule<typeof Audit>("lib/audit.ts", { "./prisma": db, "../prisma/generated/prisma/client": mockEnums });
  const data = { tenantId: 4, accion: "CREATE", entidad: "CargoRecepcion", entidadId: "1" };
  await assert.rejects(audit.createAuditLog({ ...data, tx: db as unknown as Prisma.TransactionClient }), /revertida/);
  await assert.rejects(audit.createAuditLog({ ...data, required: true }), /revertida/);
});
