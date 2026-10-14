import assert from "node:assert/strict";
import { test } from "node:test";
import { loadServerModule } from "../../../../tests/load-server-module";
import type * as Patients from "./actions";

type PhoneCondition = { in?: string[]; contains?: string };
type Query = { where: {
  tenantId: number;
  createdAt?: { gte?: Date; lt?: Date };
  OR?: { telefono?: PhoneCondition; telefono2?: PhoneCondition }[];
} };

function fixture() {
  const queries: Query[] = [];
  const actions = loadServerModule<typeof Patients>("app/(protected)/dashboard/clientes/actions.ts", {
    "@/lib/auth": { verifyToken: () => ({ userId: 10, role: "ADMIN", tenantId: 4 }) },
    "@/lib/prisma": { cliente: {
      count: async (query: Query) => { queries.push(query); return 0; },
      findMany: async (query: Query) => { queries.push(query); return []; },
    } },
    "@/prisma/generated/prisma/client": { Prisma: { Decimal: { isDecimal: () => false } } },
    "@/lib/audit": {},
    "next/cache": {},
  });
  return { actions, queries };
}

test("patient registration filters and exports cover the entire selected Bogotá day", async () => {
  const { actions, queries } = fixture();
  const filters = { startDate: "2026-10-14", endDate: "2026-10-14" };
  assert.ok("clientes" in await actions.getClientes("valid", 1, 10, "", false, filters));
  assert.ok("clientes" in await actions.getAllClientesForExport("valid", "", false, filters));
  assert.equal(queries.length, 3);
  for (const query of queries) {
    assert.equal(query.where.tenantId, 4);
    assert.equal(query.where.createdAt?.gte?.toISOString(), "2026-10-14T05:00:00.000Z");
    assert.equal(query.where.createdAt?.lt?.toISOString(), "2026-10-15T05:00:00.000Z");
  }
});

test("one-sided patient filters do not add an unrelated bound", async () => {
  const startOnly = fixture();
  await startOnly.actions.getClientes("valid", 1, 10, "", false, { startDate: "2026-10-14" });
  assert.equal(startOnly.queries[0].where.createdAt?.gte?.toISOString(), "2026-10-14T05:00:00.000Z");
  assert.equal(startOnly.queries[0].where.createdAt?.lt, undefined);
  const endOnly = fixture();
  await endOnly.actions.getAllClientesForExport("valid", "", false, { endDate: "2026-10-14" });
  assert.equal(endOnly.queries[0].where.createdAt?.gte, undefined);
  assert.equal(endOnly.queries[0].where.createdAt?.lt?.toISOString(), "2026-10-15T05:00:00.000Z");
});

test("impossible or reversed patient registration dates are rejected before reading records", async () => {
  for (const filters of [{ startDate: "2026-02-30" }, { endDate: "no-es-fecha" }, { startDate: "2026-10-15", endDate: "2026-10-14" }]) {
    const { actions, queries } = fixture();
    assert.ok((await actions.getClientes("valid", 1, 10, "", false, filters)).error);
    assert.ok((await actions.getAllClientesForExport("valid", "", false, filters)).error);
    assert.equal(queries.length, 0);
  }
});

test("clearing patient date filters removes the date restriction from both queries", async () => {
  const { actions, queries } = fixture();
  await actions.getClientes("valid");
  await actions.getAllClientesForExport("valid");
  assert.equal(queries.length, 3);
  assert.ok(queries.every((query) => query.where.createdAt === undefined));
});

test("patient lists and exports find formatted Colombian and international phone numbers", async () => {
  for (const [term, expected] of [
    ["  +57 (300) 123-4567  ", ["+573001234567", "573001234567", "3001234567"]],
    ["+1 (202) 555-0123", ["+12025550123", "12025550123"]],
  ] as const) {
    const { actions, queries } = fixture();
    await actions.getClientes("valid", 1, 10, term);
    await actions.getAllClientesForExport("valid", term);
    assert.equal(queries.length, 3);
    for (const query of queries) {
      for (const field of ["telefono", "telefono2"] as const) {
        const variants = query.where.OR?.find((condition) => condition[field]?.in)?.[field]?.in;
        assert.deepEqual(Array.from(variants || []).sort(), [...expected].sort());
      }
    }
  }
});

test("incomplete formatted patient phones remain searchable without affecting text searches", async () => {
  const partial = fixture();
  await partial.actions.getClientes("valid", 1, 10, "300 123");
  await partial.actions.getAllClientesForExport("valid", "300 123");
  for (const query of partial.queries) {
    assert.ok(query.where.OR?.some((condition) => condition.telefono?.contains === "300123"));
    assert.ok(query.where.OR?.some((condition) => condition.telefono2?.contains === "300123"));
  }
  const name = fixture();
  await name.actions.getClientes("valid", 1, 10, "Ana Pérez");
  assert.ok(name.queries.every((query) => !query.where.OR?.some((condition) => condition.telefono?.in || condition.telefono2?.in)));
});
