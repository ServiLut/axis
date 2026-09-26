import assert from "node:assert/strict";
import { test } from "node:test";
import { loadServerModule } from "./load-server-module";
import type * as Catalog from "../app/(protected)/dashboard/citas/servicios-paquetes/actions";

function fixture(active = true) {
  const calls: Array<{ action: string; query: { where: Record<string, unknown> } }> = [];
  const prisma = {
    usuario: { findUnique: async () => ({ id: 901, tenantId: 4, rol: "ADMIN", activo: active }) },
    terapiasPsicologos: {
      findMany: async (query: { where: Record<string, unknown> }) => { calls.push({ action: "read", query }); return []; },
      findFirst: async (query: { where: Record<string, unknown> }) => { calls.push({ action: "lookup", query }); return null; },
      update: async () => { throw Error("Must not update a foreign catalog item"); },
    },
  };
  const actions = loadServerModule<typeof Catalog>("app/(protected)/dashboard/citas/servicios-paquetes/actions.ts", {
    "@/lib/prisma": prisma,
    "@/lib/auth": { verifyToken: () => ({ userId: 901 }) },
    "@/lib/audit": { createAuditLog: async () => {} },
    "next/cache": { revalidatePath: () => {} },
    "@/prisma/generated/prisma/client": { Rol: { ADMIN: "ADMIN", SU_ADMIN: "SU_ADMIN" }, EstadoPaquete: {}, Prisma: { Decimal: { isDecimal: () => false } } },
  });
  return { actions, calls };
}

test("psychology catalog search remains within tenant 4 even when caller requests another tenant", async () => {
  const f = fixture();
  await f.actions.getTerapiasPsicologos("valid", { tenantId: "1", term: "Individual", estado: "active" });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].query.where.tenantId, 4);
  assert.equal(f.calls[0].query.where.activo, true);
  assert.ok(f.calls[0].query.where.OR);
});

test("psychology operators cannot modify or deactivate therapies from another tenant", async () => {
  const f = fixture();
  const form = new FormData(); form.set("tenantId", "1");
  assert.ok("error" in await f.actions.updateTerapiaPsicologos("valid", 999, form));
  assert.ok("error" in await f.actions.toggleTerapiaPsicologosActivo("valid", 999, false));
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(c => c.query.where.tenantId === 4));
});

test("inactive administrators cannot read or change the catalog", async () => {
  const f = fixture(false);
  assert.ok("error" in await f.actions.getTerapiasPsicologos("valid"));
  assert.ok("error" in await f.actions.toggleTerapiaPsicologosActivo("valid", 999, true));
  assert.equal(f.calls.length, 0);
});
