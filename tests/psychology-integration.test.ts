import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { authorizePsychologyIntegration } from "../lib/psychology-integration-auth";
import { loadServerModule } from "./load-server-module";
import { getBogotaDayRange } from "../lib/bogota-date";
import type * as Route from "../app/api/integrations/psicologos/route";
import type { NextRequest } from "next/server";

const token = "synthetic-test-token-not-a-real-secret-1234567890";
const config = { enabled: "true", tokenHash: createHash("sha256").update(token).digest("hex") };
test("integration uses dedicated hash, denies missing, wrong and malformed keys", () => {
  assert.equal(authorizePsychologyIntegration("Bearer " + token, config), 200);
  for (const authorization of [null, "", "Basic " + token, "Bearer abc", "Bearer " + "x".repeat(43), "Bearer " + "x".repeat(1000)]) {
    assert.equal(authorizePsychologyIntegration(authorization, config), 401);
  }
});
test("integration is off unless enabled and configured correctly", () => {
  for (const invalid of [{}, { ...config, enabled: "false" }, { ...config, tokenHash: "" }, { ...config, tokenHash: "not-a-hash" }]) {
    assert.equal(authorizePsychologyIntegration("Bearer " + token, invalid), 503);
  }
});

function fixture() {
  const calls: { entity: string; query: Record<string, unknown> }[] = [];
  const state = { authorized: true, companyName: "Psicologos en Colombia", missing: 0, exists: true };
  const list = (entity: string, result: unknown[]) => async (query: Record<string, unknown>) => { calls.push({ entity, query }); return result; };
  const prisma = {
    tenant: { findUnique: async () => ({ nombre: "PSICOLOGOS" }) },
    empresa: { findFirst: async () => ({ nombre: state.companyName }) },
    terapiasPsicologos: { findMany: list("catalog", [{ id: 9n, nombre: "Ficticio", categoria: "TEST", cantidadSesiones: 3, precioBase: { toFixed: () => "330000.00" } }]) },
    usuario: { findMany: list("professionals", [{ id: 901, nombre: "Profesional", apellido: "Prueba" }]), findFirst: async () => state.exists ? { id: 901 } : null },
    consultorios: { findMany: list("rooms", [{ id: 902n, nombre: "Prueba" }]), findFirst: async () => ({ id: 902n }) },
    citasPsicologos: { count: async () => state.missing, findMany: list("busy", [{ horaInicio: new Date("2026-09-26T12:00:00Z"), horaFin: new Date("2026-09-26T13:00:00Z"), psicologoId: 901, consultorioId: 902n }]) },
  };
  const route = loadServerModule<typeof Route>("app/api/integrations/psicologos/route.ts", {
    "@/lib/prisma": prisma,
    "@/lib/psychology-integration-auth": { authorizePsychologyIntegration: () => state.authorized ? 200 : 401 },
    "@/lib/bogota-date": { bogotaToday: () => "2026-09-26", getBogotaDayRange: (date = "2026-09-26") => getBogotaDayRange(date) },
    "next/server": { NextResponse: { json: (body: unknown, init: ResponseInit) => new Response(JSON.stringify(body), { ...init, headers: { ...init.headers, "Content-Type": "application/json" } }) } },
  });
  const get = (query: string) => route.GET({ headers: new Headers(), nextUrl: new URL("https://example.test/api?" + query) } as NextRequest);
  return { state, calls, get };
}

test("read-only catalog is fixed to Psicologos and selects no passwords or patient data", async () => {
  const f = fixture();
  const res = await f.get("resource=catalog");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store, private");
  const body = await res.json();
  assert.equal(body.tenantId, 4);
  assert.equal(body.companyId, 3);
  assert.equal(body.services[0].precioBase, "330000.00");
  for (const call of f.calls) {
    const where = call.query.where as { tenantId: number; empresaId: number };
    assert.equal(where.tenantId, 4); assert.equal(where.empresaId, 3);
    assert.ok(call.query.select); assert.equal(call.query.include, undefined);
    assert.doesNotMatch(JSON.stringify(call.query.select), /password|numeroDocumento|telefono|observacion|Cliente/);
  }
  assert.equal((await f.get("resource=catalog&tenantId=1")).status, 400);
  f.state.companyName = "Otra empresa";
  assert.equal((await f.get("resource=catalog")).status, 503);
});
test("no integration data is returned without authorization", async () => {
  const f = fixture(); f.state.authorized = false;
  assert.equal((await f.get("resource=catalog")).status, 401);
  assert.equal(f.calls.length, 0);
});
test("availability is bounded and includes completed occupancy without customer identities", async () => {
  const f = fixture();
  const query = "resource=availability&date=2026-09-26&professionalId=901&roomId=902";
  const body = await (await f.get(query)).json();
  assert.equal(body.coverageComplete, true);
  assert.equal(body.mustRecheckBeforeBooking, true);
  assert.equal(body.busy[0].professionalBusy, true);
  const busy = f.calls.find(c => c.entity === "busy")!;
  assert.deepEqual(JSON.parse(JSON.stringify(busy.query.select)), { horaInicio: true, horaFin: true, psicologoId: true, consultorioId: true });
  assert.deepEqual(JSON.parse(JSON.stringify((busy.query.where as { realizada: unknown }).realizada)), { not: null });
  f.state.missing = 1;
  assert.equal((await (await f.get(query)).json()).coverageComplete, false);
  for (const date of ["2026-02-30", "2026-09-25", "2030-01-01"]) {
    assert.equal((await f.get(`resource=availability&date=${date}&professionalId=901`)).status, 400);
  }
  assert.equal((await f.get("resource=availability")).status, 400);
  f.state.exists = false;
  assert.equal((await f.get(query)).status, 404);
});
