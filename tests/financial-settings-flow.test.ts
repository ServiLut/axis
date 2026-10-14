import assert from "node:assert/strict";
import { test } from "node:test";
import { loadServerModule } from "./load-server-module";
import * as psychology from "../lib/psychology";
import type * as Methods from "../app/(protected)/dashboard/configuracion/metodos-pago/actions";
import type * as Permissions from "../app/(protected)/dashboard/configuracion/permisos/actions";

function fixture(role = "SU_ADMIN") {
  const writes: { operation: string; query: unknown }[] = [];
  const entityQueries: { where: { id: number; tenantId: number } }[] = [];
  const prisma = {
    usuario: { findUnique: async () => ({ tenantId: 4 }) },
    empresa: { findFirst: async (query: typeof entityQueries[number]) => {
      entityQueries.push(query);
      return query.where.id === 5 && query.where.tenantId === 4 ? { id: 5 } : null;
    } },
    metodoPago: {
      create: async (query: unknown) => { writes.push({ operation: "create", query }); },
      update: async (query: unknown) => { writes.push({ operation: "update", query }); },
    },
    permiso: { update: async (query: unknown) => { writes.push({ operation: "approve", query }); } },
  };
  const mocks = {
    "@/lib/prisma": prisma,
    "@/lib/auth": { verifyToken: async (token: string) => token === "valid" ? { userId: 10, tenantId: 4, role } : null },
    "@/lib/psychology": psychology,
    "next/cache": { revalidatePath() {} },
    "@/lib/mail": { sendPermissionRequestEmail: async () => {} },
  };
  return { writes, entityQueries,
    methods: loadServerModule<typeof Methods>("app/(protected)/dashboard/configuracion/metodos-pago/actions.ts", mocks),
    permissions: loadServerModule<typeof Permissions>("app/(protected)/dashboard/configuracion/permisos/actions.ts", mocks),
  };
}

function form(empresaId: string, nombre = "  Transferencia  ") {
  const data = new FormData();
  data.set("nombre", nombre);
  data.set("activo", "on");
  data.set("empresaId", empresaId);
  return data;
}

test("payment-method create and update reject foreign companies before writing", async () => {
  const f = fixture();
  assert.match((await f.methods.createMetodoPago("valid", form("99"))).error || "", /no pertenece/);
  assert.match((await f.methods.updateMetodoPago("valid", 8, form("99"))).error || "", /no pertenece/);
  assert.equal(f.writes.length, 0);
  assert.ok(f.entityQueries.every(query => query.where.tenantId === 4));
});

test("payment methods support no company and trim names without changing active status", async () => {
  const f = fixture();
  assert.equal((await f.methods.createMetodoPago("valid", form("null"))).success, true);
  assert.equal(f.entityQueries.length, 0);
  const query = f.writes[0].query as { data: { tenantId: number; nombre: string; empresaId: number | null; activo: boolean } };
  assert.equal(query.data.tenantId, 4);
  assert.equal(query.data.nombre, "Transferencia");
  assert.equal(query.data.empresaId, null);
  assert.equal(query.data.activo, true);
});

test("valid payment-method update scopes both selected company and target method", async () => {
  const f = fixture();
  assert.equal((await f.methods.updateMetodoPago("valid", 8, form("5"))).success, true);
  const query = f.writes[0].query as { where: { id: number; tenantId: number }; data: { empresaId: number } };
  assert.equal(query.where.id, 8);
  assert.equal(query.where.tenantId, 4);
  assert.equal(query.data.empresaId, 5);
  assert.equal(f.entityQueries[0].where.tenantId, 4);
});

test("payment methods reject malformed company IDs and empty names", async () => {
  const f = fixture();
  for (const id of ["5suffix", "0", "-1", "1.5"]) assert.ok((await f.methods.createMetodoPago("valid", form(id))).error);
  assert.ok((await f.methods.createMetodoPago("valid", form("", "  "))).error);
  assert.equal(f.entityQueries.length, 0);
  assert.equal(f.writes.length, 0);
});

test("temporary permissions reject invalid durations before updating", async () => {
  const f = fixture();
  for (const duration of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.match((await f.permissions.approvePermission("valid", 8, duration)).error || "", /duración/);
  }
  assert.equal(f.writes.length, 0);
});

test("temporary permission approval preserves duration and tenant scope", async () => {
  const f = fixture();
  const start = Date.now();
  assert.equal((await f.permissions.approvePermission("valid", 8, 30)).success, true);
  const query = f.writes[0].query as { where: { id: number; tenantId: number }; data: { adminId: number; estado: string; fechaExpiracion: Date } };
  assert.equal(query.where.id, 8);
  assert.equal(query.where.tenantId, 4);
  assert.equal(query.data.adminId, 10);
  assert.equal(query.data.estado, "APROBADO");
  assert.ok(query.data.fechaExpiracion.getTime() >= start + 30 * 60_000);
  assert.ok(query.data.fechaExpiracion.getTime() <= Date.now() + 30 * 60_000);
});

test("nonadmin and unauthenticated actors cannot configure payment methods or grant permission", async () => {
  const f = fixture("ASESOR");
  assert.ok((await f.methods.createMetodoPago("valid", form("5"))).error);
  assert.ok((await f.methods.updateMetodoPago("invalid", 8, form("5"))).error);
  assert.ok((await f.permissions.approvePermission("valid", 8, 30)).error);
  assert.equal(f.entityQueries.length, 0);
  assert.equal(f.writes.length, 0);
});
