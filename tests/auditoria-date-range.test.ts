import assert from "node:assert/strict";
import test from "node:test";
import * as bogotaDate from "../lib/bogota-date";
import type * as Audit from "../app/(protected)/dashboard/monitoreo/auditoria/actions";
import { loadServerModule } from "./load-server-module";

function fixture() {
  const queries: Array<{ where: Record<string, unknown> }> = [];
  const emptyRows = { findMany: async () => [] };
  const server = loadServerModule<typeof Audit>("app/(protected)/dashboard/monitoreo/auditoria/actions.ts", {
    "@/lib/auth": { verifyToken: async () => ({ userId: 9, role: "ADMIN", tenantId: 4 }) },
    "@/lib/psychology": { PSYCHOLOGY_TENANT_ID: 4 },
    "@/lib/bogota-date": bogotaDate,
    "@/prisma/generated/prisma/client": {},
    "@/lib/prisma": {
      auditoria: { count: async (query: { where: Record<string, unknown> }) => { queries.push(query); return 0; }, findMany: async (query: { where: Record<string, unknown> }) => { queries.push(query); return []; } },
      empresa: emptyRows, cliente: emptyRows, usuario: emptyRows, ordenServicio: emptyRows,
      tipoServicio: emptyRows, estadoServicio: emptyRows, metodoPago: emptyRows, zona: emptyRows,
      direccion: emptyRows, vehiculo: emptyRows,
    },
  });
  return { server, queries };
}

test("audit list and export include the same entire final Colombia day", async () => {
  const f = fixture();
  const filters = { fechaInicio: "2026-10-14", fechaFin: "2026-10-14" };
  assert.ok(!(await f.server.getAuditoria("fixture", 1, 20, filters)).error);
  assert.ok(!(await f.server.getAuditoriaForExport("fixture", filters)).error);
  assert.equal(f.queries.length, 3);
  for (const query of f.queries) {
    assert.equal(query.where.tenantId, 4);
    assert.deepEqual(query.where.createdAt, { gte: new Date("2026-10-14T05:00:00Z"), lt: new Date("2026-10-15T05:00:00Z") });
  }
});

test("impossible or reversed audit dates cannot reach database queries", async () => {
  for (const filters of [{ fechaInicio: "2026-02-30" }, { fechaInicio: "2026-10-15", fechaFin: "2026-10-14" }]) {
    const f = fixture();
    assert.ok((await f.server.getAuditoria("fixture", 1, 20, filters)).error);
    assert.ok((await f.server.getAuditoriaForExport("fixture", filters)).error);
    assert.equal(f.queries.length, 0);
  }
});
