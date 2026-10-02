import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "../prisma/generated/prisma/client";
import { loadServerModule } from "./load-server-module";
import type * as Actions from "../app/(protected)/dashboard/citas/price-actions";

function fixture() {
  const actor = { id: 10, tenantId: 4, rol: "ADMIN", activo: true, aprobado: true };
  const state = { citaValue: "18900", packageValue: "28350", paid: "18900", payment: "PENDIENTE", count: 1,
    sessions: 1, packageTenant: 4, company: 3, cancelled: false, inconsistencies: 0, auditFail: false, writes: 0, audits: 0,
    snapshotDetails: null as unknown };
  const prisma = {
    usuario: { findUnique: async () => actor },
    citasPsicologos: {
      findFirst: async (q: { where: { tenantId: number; empresaId: number } }) => q.where.tenantId === 4 && q.where.empresaId === state.company ?
        { id: 2576n, tenantId: 4, empresaId: state.company, valor: state.citaValue, realizada: state.cancelled ? null : true,
          estadoPago: state.payment, PaqueteAdquirido: { id: 2072n, tenantId: state.packageTenant, precioPagado: state.packageValue,
            sesionesTotales: state.sessions, estado: "ACTIVO", TerapiasPsicologos: { nombre: "Alquiler de Consultorio" } } } : null,
      count: async () => state.count,
      update: async (q: { data: { valor: string } }) => { state.citaValue = q.data.valor; state.writes++; },
      updateMany: async (q: { data: { estadoPago: string } }) => { state.payment = q.data.estadoPago; state.writes++; },
    },
    paqueteAdquirido: { update: async (q: { data: { precioPagado: string } }) => { state.packageValue = q.data.precioPagado; state.writes++; } },
    $queryRaw: async (sql: TemplateStringsArray) => sql.join("").includes('AS "completo"') ?
      [{ completo: Number(state.paid) >= Number(state.packageValue), metodoPago: "TRANSFERENCIA" }] :
      sql.join("").includes("inconsistencias") ? [{ registrado: state.paid, inconsistencias: state.inconsistencies }] : [{ id: 4 }],
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const before = { ...state };
      try { return await fn(prisma); } catch (error) { Object.assign(state, before); throw error; }
    },
  };
  const actions = loadServerModule<typeof Actions>("app/(protected)/dashboard/citas/price-actions.ts", {
    "@/lib/prisma": prisma, "./prisma": prisma, "./auth": { verifyToken: (token: string) => token === "valid" ? { userId: 10 } : null },
    "@/lib/audit": { createAuditLog: async (input: { detalles: unknown; tx: unknown }) => {
      assert.ok(input.tx); if (state.auditFail) throw Error("AUDIT_FAIL"); state.audits++; state.snapshotDetails = input.detalles;
    } }, "next/cache": { revalidatePath() {} }, "@/prisma/generated/prisma/client": { Prisma },
  }, { NEXT_PUBLIC_RECEPCION_ENABLED: "true" });
  const snapshot = async () => { const result = await actions.getRentalPriceCorrection("valid", "2576");
    assert.ok("snapshot" in result); return result.snapshot; };
  return { state, actor, actions, snapshot };
}

test("correcting completed single rental aligns booking/package and uses the existing payment without new cash", async () => {
  const f = fixture();
  const result = await f.actions.correctRentalPrice("valid", { expected: await f.snapshot(), valor: "18900", motivo: "Corrección del valor acordado: 18.900" });
  assert.ok("success" in result && result.success); assert.equal(f.state.citaValue, "18900.00"); assert.equal(f.state.packageValue, "18900.00");
  assert.equal(f.state.payment, "CONCILIADO"); assert.equal(f.state.paid, "18900"); assert.equal(f.state.audits, 1);
  const audit = f.state.snapshotDetails as { cajaModificada: boolean; pagosModificados: boolean; horarioModificado: boolean };
  assert.equal(audit.cajaModificada, false); assert.equal(audit.pagosModificados, false); assert.equal(audit.horarioModificado, false);
});

test("invalid identity, company and package scope cannot perform price corrections", async () => {
  const f = fixture(); const expected = await f.snapshot();
  assert.ok((await f.actions.correctRentalPrice("invalid", { expected, valor: "18900", motivo: "Error de digitación" })).error);
  f.actor.tenantId = 2;
  assert.ok((await f.actions.correctRentalPrice("valid", { expected, valor: "18900", motivo: "Error de digitación" })).error);
  f.actor.tenantId = 4; f.state.company = 2;
  assert.ok((await f.actions.correctRentalPrice("valid", { expected, valor: "18900", motivo: "Error de digitación" })).error);
  f.state.company = 3; f.state.packageTenant = 2;
  assert.ok((await f.actions.correctRentalPrice("valid", { expected, valor: "18900", motivo: "Error de digitación" })).error);
  assert.equal(f.state.writes, 0);
});

test("shared, multi-session or cancelled rentals stay protected", async () => {
  for (const key of ["count", "sessions", "cancelled"] as const) {
    const f = fixture(); const expected = await f.snapshot();
    if (key === "cancelled") f.state.cancelled = true; else f.state[key] = 2;
    assert.ok((await f.actions.correctRentalPrice("valid", { expected, valor: "18900", motivo: "Error de digitación" })).error);
    assert.equal(f.state.writes, 0);
  }
});

test("stale price/payment snapshot and inconsistent cash links require a fresh human review", async () => {
  const f = fixture(); const expected = await f.snapshot(); f.state.paid = "18901";
  assert.match((await f.actions.correctRentalPrice("valid", { expected, valor: "20000", motivo: "Error de digitación" })).error || "", /cambiaron/);
  f.state.paid = "18900"; f.state.inconsistencies = 1;
  assert.match((await f.actions.correctRentalPrice("valid", { expected, valor: "18900", motivo: "Error de digitación" })).error || "", /libro/);
  assert.equal(f.state.writes, 0);
});

test("a correction cannot hide an overpayment or bypass its required reason", async () => {
  const f = fixture(); const expected = await f.snapshot();
  for (const input of [{ valor: "18000", motivo: "Error de digitación" }, { valor: "0", motivo: "Error de digitación" },
    { valor: "18900.001", motivo: "Error de digitación" }, { valor: "18900", motivo: "" }]) {
    assert.ok((await f.actions.correctRentalPrice("valid", { expected, ...input })).error);
  }
  assert.equal(f.state.writes, 0);
});

test("required audit failure rolls back package, booking and propagated payment state", async () => {
  const f = fixture(); const expected = await f.snapshot(); f.state.auditFail = true;
  assert.ok((await f.actions.correctRentalPrice("valid", { expected, valor: "18900", motivo: "Error de digitación" })).error);
  assert.equal(f.state.packageValue, "28350"); assert.equal(f.state.citaValue, "18900"); assert.equal(f.state.payment, "PENDIENTE");
  assert.equal(f.state.writes, 0);
});

test("a repeated correction is a no-op and a remaining balance stays pending", async () => {
  const f = fixture();
  const first = await f.actions.correctRentalPrice("valid", { expected: await f.snapshot(), valor: "20000", motivo: "Error de digitación" });
  assert.ok("success" in first && first.success);
  assert.equal(f.state.payment, "PENDIENTE"); const writes = f.state.writes;
  const result = await f.actions.correctRentalPrice("valid", { expected: await f.snapshot(), valor: "20000", motivo: "Error de digitación" });
  assert.ok("changed" in result && result.changed === false); assert.equal(f.state.writes, writes); assert.equal(f.state.audits, 1);
});
