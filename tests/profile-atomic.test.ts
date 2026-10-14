import assert from "node:assert/strict";
import test from "node:test";
import type { PUT } from "../app/api/profile/route";
import { loadServerModule } from "./load-server-module";

class KnownRequestError extends Error {}
type Result = { status: number; body: { reauthenticate?: boolean; error?: string } };

function fixture() {
  let state = { user: { nombre: "Antes", password: "old-hash", authVersion: 2 }, account: { valorHora: 10 } };
  let failAccount = false;
  let validToken = true;
  let transactions = 0;
  let userWrites = 0;
  let accountWrites = 0;
  const accountQueries: unknown[] = [];
  const tx = {
    usuario: { update: async (query: { where: { id: number; tenantId: number }; data: { nombre: string; password?: string; authVersion?: { increment: number } } }) => {
      assert.equal(query.where.id, 9);
      assert.equal(query.where.tenantId, 4);
      userWrites += 1;
      state.user.nombre = query.data.nombre;
      if (query.data.password) state.user.password = query.data.password;
      if (query.data.authVersion) state.user.authVersion += query.data.authVersion.increment;
      return state.user;
    } },
    cuentasPago: {
      findFirst: async (query: unknown) => { accountQueries.push(query); return { id: 22n }; },
      update: async (query: { where: { id: bigint; userId: number; tenantId: number }; data: { valorHora: number } }) => {
        assert.equal(query.where.id, 22n);
        assert.equal(query.where.userId, 9);
        assert.equal(query.where.tenantId, 4);
        accountWrites += 1;
        if (failAccount) throw new Error("account write failed");
        state.account.valorHora = query.data.valorHora;
      },
    },
  };
  const server = loadServerModule<{ PUT: typeof PUT }>("app/api/profile/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status: number }) => ({ body, status: options?.status ?? 200 }) } },
    "next/headers": { headers: async () => new Headers({ authorization: "Bearer fixture" }) },
    "@/lib/auth": { verifyToken: async () => validToken ? { userId: 9, tenantId: 4 } : null },
    "@/lib/psychology": { PSYCHOLOGY_TENANT_ID: 4 },
    bcrypt: { hash: async () => "new-hash" },
    "@/prisma/generated/prisma/client": { Prisma: { PrismaClientKnownRequestError: KnownRequestError } },
    "@/lib/prisma": { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      const before = structuredClone(state);
      try { return await callback(tx); } catch (error) { state = before; throw error; }
    } },
  });
  const submit = (extra: Record<string, unknown> = {}) => server.PUT({ json: async () => ({
    username: "fixture", email: "fixture@example.invalid", nombre: "Después", apellido: "Fixture",
    cuentaPago: { banco: "Fixture", tipoCuenta: "AHORROS", numeroCuenta: "fixture", valorHora: "0" },
    ...extra,
  }) } as Parameters<typeof PUT>[0]) as unknown as Promise<Result>;
  return { submit, accountQueries, state: () => state, transactions: () => transactions, writes: () => ({ userWrites, accountWrites }), failAccount: () => { failAccount = true; }, invalidToken: () => { validToken = false; } };
}

test("profile and its own psychology payment account save together; explicit zero is preserved", async () => {
  const f = fixture();
  assert.equal((await f.submit()).status, 200);
  assert.equal(f.state().user.nombre, "Después");
  assert.equal(f.state().account.valorHora, 0);
  assert.equal(f.transactions(), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.accountQueries)), [{ where: { userId: 9, tenantId: 4 }, orderBy: { id: "asc" }, select: { id: true } }]);
});

test("a payment-account failure cannot leave a changed profile or password", async () => {
  const f = fixture(); f.failAccount();
  assert.equal((await f.submit({ password: "fixture-only" })).status, 500);
  assert.deepEqual(f.writes(), { userWrites: 1, accountWrites: 1 });
  assert.deepEqual(f.state(), { user: { nombre: "Antes", password: "old-hash", authVersion: 2 }, account: { valorHora: 10 } });
});

test("password updates retain revocation and ask the interface to sign in again", async () => {
  const f = fixture();
  const result = await f.submit({ password: "fixture-only" });
  assert.equal(result.status, 200);
  assert.equal(result.body.reauthenticate, true);
  assert.equal(f.state().user.authVersion, 3);
  assert.equal(f.state().user.password, "new-hash");
});

test("invalid hourly amounts and invalid sessions cannot reach profile writes", async () => {
  for (const value of ["-1", "abc", "Infinity"]) {
    const f = fixture();
    assert.equal((await f.submit({ cuentaPago: { valorHora: value } })).status, 400);
    assert.equal(f.transactions(), 0);
  }
  const f = fixture(); f.invalidToken();
  assert.equal((await f.submit()).status, 401);
  assert.equal(f.transactions(), 0);
});
