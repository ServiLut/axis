import assert from "node:assert/strict";
import { test } from "node:test";
import { loadServerModule } from "./load-server-module";
import type * as Dashboard from "../app/(protected)/dashboard/actions";
import type * as Clients from "../app/(protected)/dashboard/clientes/nuevo/actions";
import type * as Caja from "../app/(protected)/dashboard/contabilidad/caja/actions";
import type { CajaInput } from "../lib/caja";

const auth = { verifyToken: (token: string) => token === "valid" ? { userId: 10 } : null, signToken: () => "token" };
const mockEnums = { EstadoPagoOrden: { CONCILIADO: "CONCILIADO" }, Prisma: {} };

test("dashboard statistics and outstanding detail use identical date boundaries and tenant", async () => {
  const queries: { where: { tenantId: number; fechaCita?: { gte: Date; lt: Date } } }[] = [];
  const prisma = { usuario: { findUnique: async () => ({ tenantId: 4, rol: "ADMIN" }) }, citasPsicologos: {
    count: async (q: typeof queries[number]) => { queries.push(q); return 1; },
    aggregate: async (q: typeof queries[number]) => { queries.push(q); return { _sum: { valor: 50000 } }; },
    findMany: async (q: typeof queries[number]) => { queries.push(q); return []; },
  } };
  const actions = loadServerModule<typeof Dashboard>("app/(protected)/dashboard/actions.ts", {
    "@/lib/prisma": prisma, "@/lib/auth": auth, "@/prisma/generated/prisma/client": mockEnums,
  });
  const result = await actions.getDashboardStats("valid", "2026-09-23");
  assert.ok("stats" in result && result.type === "psychology");
  if (!("stats" in result) || result.type !== "psychology") return;
  assert.equal(result.stats.fechaConsulta, "2026-09-23");
  assert.ok(queries.every((q) => q.where.tenantId === 4));
  const dated = queries.filter((q) => q.where.fechaCita);
  assert.equal(dated.length, 6);
  for (const query of dated) {
    assert.equal(query.where.fechaCita?.gte.toISOString(), "2026-09-23T05:00:00.000Z");
    assert.equal(query.where.fechaCita?.lt.toISOString(), "2026-09-24T05:00:00.000Z");
  }
  await actions.getPsychologyOutstandingDetails("valid", "today", "2026-09-23");
  assert.equal(queries.at(-1)?.where.fechaCita?.gte.toISOString(), "2026-09-23T05:00:00.000Z");
  await actions.getPsychologyOutstandingDetails("valid", "total", "2026-09-23");
  assert.equal(queries.at(-1)?.where.fechaCita, undefined);
});

test("psychology detail denies other tenants and invalid dates before reading appointments", async () => {
  let calls = 0;
  let tenantId = 1;
  const actions = loadServerModule<typeof Dashboard>("app/(protected)/dashboard/actions.ts", {
    "@/lib/prisma": { usuario: { findUnique: async () => ({ tenantId, rol: "ADMIN" }) }, citasPsicologos: { findMany: () => { calls++; return []; } } },
    "@/lib/auth": auth, "@/prisma/generated/prisma/client": mockEnums,
  });
  assert.ok((await actions.getPsychologyOutstandingDetails("valid", "today", "2026-09-23")).error);
  tenantId = 4;
  assert.ok((await actions.getPsychologyOutstandingDetails("valid", "today", "2026-02-30")).error);
  assert.ok((await actions.getPsychologyOutstandingDetails("invalid", "today", "2026-09-23")).error);
  assert.equal(calls, 0);
});

test("client creation checks international/local duplicates without inserting a second client", async () => {
  let filter = "";
  let writes = 0;
  const actions = loadServerModule<typeof Clients>("app/(protected)/dashboard/clientes/nuevo/actions.ts", {
    "@/lib/prisma": { usuario: { findUnique: async () => ({ tenantId: 4 }) }, cliente: {
      findFirst: async (q: unknown) => { filter = JSON.stringify(q); return { id: 2 }; },
      create: async () => { writes++; return { id: 3 }; },
    } }, "@/lib/auth": auth, "next/cache": { revalidatePath() {} }, "@/lib/mysql": {}, "@/prisma/generated/prisma/client": mockEnums,
  });
  const form = new FormData();
  form.set("telefono", "+57 3001234567");
  form.set("telefono2", "+1 (202) 555-0123");
  assert.ok((await actions.createCliente("valid", form)).error);
  for (const number of ["3001234567", "+573001234567", "+12025550123"]) assert.ok(filter.includes(number));
  assert.equal(writes, 0);
});

const input: CajaInput = { fecha: "2026-09-23", tipo: "INGRESO", metodoPago: "EFECTIVO", monto: "100.00", concepto: "Ingreso prueba", referencia: "", solicitudId: "12345678-1234-4234-8234-123456789abc" };
function cajaFixture({ enabled = true, tenantId = 4, rol = "ASESOR", activo = true, aprobado = true, duplicate = false } = {}) {
  const queries: { sql: string; values: unknown[] }[] = [];
  let userReads = 0;
  const prisma = {
    usuario: { findUnique: async () => { userReads++; return { id: 10, tenantId, rol, activo, aprobado }; } },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?"); queries.push({ sql, values });
      if (sql.includes("INSERT INTO")) return duplicate ? [] : [{ id: 1n }];
      if (sql.includes('"solicitudId"')) return [{ ...input, id: "1" }];
      return [];
    },
  };
  return { queries, userReads: () => userReads, actions: loadServerModule<typeof Caja>("app/(protected)/dashboard/contabilidad/caja/actions.ts", {
    "@/lib/prisma": prisma, "@/lib/auth": auth,
  }, enabled ? { NEXT_PUBLIC_CAJA_DIARIA_ENABLED: "true" } : {}) };
}

test("disabled cash module does not read users or access the new table", async () => {
  const fixture = cajaFixture({ enabled: false });
  assert.ok((await fixture.actions.createCajaMovement("valid", input)).error);
  assert.ok((await fixture.actions.getCajaMovements("valid", input.fecha)).error);
  assert.equal(fixture.userReads(), 0);
  assert.equal(fixture.queries.length, 0);
});

test("cash requires an active approved allowed role in the current psychology tenant", async () => {
  for (const options of [{ tenantId: 1 }, { rol: "TECNICO" }, { activo: false }, { aprobado: false }]) {
    const fixture = cajaFixture(options);
    assert.ok((await fixture.actions.createCajaMovement("valid", input)).error);
    assert.ok((await fixture.actions.getCajaMovements("valid", input.fecha)).error);
    assert.equal(fixture.queries.length, 0);
  }
});

test("cash parameterizes user input and stamps user/tenant from the authenticated session", async () => {
  const fixture = cajaFixture();
  const concept = "Papelería '); DROP TABLE fake; --";
  assert.equal((await fixture.actions.createCajaMovement("valid", { ...input, concepto: concept })).success, true);
  assert.equal(fixture.queries.length, 1);
  assert.ok(!fixture.queries[0].sql.includes(concept));
  assert.ok(fixture.queries[0].values.includes(concept));
  assert.equal(fixture.queries[0].values[0], 4);
  assert.equal(fixture.queries[0].values[1], 10);
});

test("cash retries return the existing movement; conflicting reuse cannot create another", async () => {
  const fixture = cajaFixture({ duplicate: true });
  assert.equal((await fixture.actions.createCajaMovement("valid", input)).id, "1");
  assert.ok((await fixture.actions.createCajaMovement("valid", { ...input, monto: "200.00" })).error);
  assert.ok(fixture.queries[0].sql.includes("ON CONFLICT"));
});

test("invalid cash amounts and dates cannot reach the ledger", async () => {
  const fixture = cajaFixture();
  assert.ok((await fixture.actions.createCajaMovement("valid", { ...input, monto: "-1" })).error);
  assert.ok((await fixture.actions.getCajaMovements("valid", "2026-02-30")).error);
  assert.equal(fixture.queries.length, 0);
});
