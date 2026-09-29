import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { deletePsychologyAppointment } from "../lib/psychology-appointment-delete";
import { loadServerModule } from "./load-server-module";
import type * as Actions from "../app/(protected)/dashboard/citas/actions";

type SqlClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> };
function adapter(db: SqlClient) {
  const query = (strings: TemplateStringsArray, values: unknown[]) => db.query(
    strings.reduce((sql, part, i) => sql + (i ? `$${i}` : "") + part, ""),
    values.map(v => typeof v === "bigint" ? String(v) : v),
  );
  return {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => (await query(strings, values)).rows,
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => (await query(strings, values)).affectedRows,
  } as unknown as Parameters<typeof deletePsychologyAppointment>[0];
}
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "Tenant" (id int PRIMARY KEY); INSERT INTO "Tenant" VALUES(4),(5);
    CREATE TABLE "TerapiasPsicologos"(id bigint PRIMARY KEY,"tenantId" int,"empresaId" int);
    INSERT INTO "TerapiasPsicologos" VALUES(10,4,3);
    CREATE TABLE "PaqueteAdquirido"(id bigint PRIMARY KEY,"tenantId" int,"catalogoId" bigint,"sesionesTotales" int,"sesionesConsumidas" int,"saldoRestante" int,"clienteId" int,"usuarioId" int);
    INSERT INTO "PaqueteAdquirido" VALUES(100,4,10,3,1,2,NULL,24);
    CREATE TABLE "CitasPsicologos"(id bigint PRIMARY KEY,"tenantId" int,"empresaId" int,"paqueteId" bigint,realizada boolean,"estadoPago" text,"comprobantePath" text,valor numeric,"pacienteId" int,"psicologoId" int);
    INSERT INTO "CitasPsicologos" VALUES(1,4,3,100,false,'PENDIENTE',NULL,330000,NULL,24);
    CREATE TABLE "PagoServicioPsicologia"("tenantId" int,"citaId" bigint REFERENCES "CitasPsicologos", "paqueteId" bigint);
    CREATE TABLE "CargoRecepcion"("tenantId" int,"citaId" bigint REFERENCES "CitasPsicologos");
    CREATE TABLE "PsicologiaBotProposal"("citaId" bigint REFERENCES "CitasPsicologos");`);
  const run = (tenantId = 4) => db.transaction(tx => deletePsychologyAppointment(adapter(tx), tenantId, 1n));
  const state = async () => ({
    citas: (await db.query('SELECT * FROM "CitasPsicologos"')).rows,
    paquetes: (await db.query('SELECT * FROM "PaqueteAdquirido"')).rows,
  });
  return { db, run, state };
}

test("scheduled deletion returns exactly one reserved session, including concurrent retries", async () => {
  const f = await fixture();
  try {
    const results = await Promise.all([f.run(), f.run()]);
    assert.equal(results.filter(r => r.deleted).length, 1);
    const change = results.find(r => r.deleted)!;
    assert.ok(change.deleted && change.restoredPackage);
    assert.equal((change.before as { valor: number }).valor, 330000);
    const state = await f.state();
    assert.equal(state.citas.length, 0);
    assert.equal((state.paquetes[0] as { saldoRestante: number }).saldoRestante, 3);
    assert.equal((state.paquetes[0] as { sesionesConsumidas: number }).sesionesConsumidas, 0);
  } finally { await f.db.close(); }
});

test("a cancelled appointment does not restore a previously returned session again", async () => {
  const f = await fixture();
  try {
    await f.db.exec('UPDATE "CitasPsicologos" SET realizada=NULL; UPDATE "PaqueteAdquirido" SET "sesionesConsumidas"=0,"saldoRestante"=3;');
    const result = await f.run();
    assert.ok(result.deleted); assert.equal(result.restoredPackage, null);
    assert.equal(((await f.state()).paquetes[0] as { saldoRestante: number }).saldoRestante, 3);
  } finally { await f.db.close(); }
});

test("patient packages require the same owner; legacy appointments without a package do not create credits", async () => {
  const f = await fixture();
  try {
    await f.db.exec('UPDATE "PaqueteAdquirido" SET "clienteId"=31,"usuarioId"=NULL; UPDATE "CitasPsicologos" SET "pacienteId"=32;');
    const before = await f.state(); await assert.rejects(f.run(), /saldo/); assert.deepEqual(await f.state(), before);
    await f.db.exec('UPDATE "CitasPsicologos" SET "pacienteId"=31;');
    assert.ok((await f.run()).deleted);
    await f.db.exec(`INSERT INTO "CitasPsicologos" VALUES(1,4,3,NULL,false,'PENDIENTE',NULL,18900,NULL,24);`);
    const packs = (await f.state()).paquetes;
    const legacy = await f.run(); assert.ok(legacy.deleted); assert.equal(legacy.restoredPackage, null);
    assert.deepEqual((await f.state()).paquetes, packs);
  } finally { await f.db.close(); }
});

test("attended, paid, receipt and linked-history records are preserved", async () => {
  const scenarios = [
    'UPDATE "CitasPsicologos" SET realizada=true',
    `UPDATE "CitasPsicologos" SET "estadoPago"='CONCILIADO'`,
    `UPDATE "CitasPsicologos" SET "comprobantePath"='private/receipt.png'`,
    'INSERT INTO "PagoServicioPsicologia" VALUES(4,1,NULL)',
    'INSERT INTO "PagoServicioPsicologia" VALUES(4,NULL,100)',
    'INSERT INTO "CargoRecepcion" VALUES(4,1)',
    'INSERT INTO "PsicologiaBotProposal" VALUES(1)',
  ];
  const f = await fixture();
  try {
    for (const sql of scenarios) {
      await f.db.exec('UPDATE "CitasPsicologos" SET realizada=false,"estadoPago"=\'PENDIENTE\',"comprobantePath"=NULL; DELETE FROM "PagoServicioPsicologia"; DELETE FROM "CargoRecepcion"; DELETE FROM "PsicologiaBotProposal";');
      await f.db.exec(sql); const before = await f.state();
      await assert.rejects(f.run()); assert.deepEqual(await f.state(), before);
    }
  } finally { await f.db.close(); }
});

test("other tenant/company and inconsistent package counters cannot alter a credit", async () => {
  const f = await fixture();
  try {
    const before = await f.state();
    await assert.rejects(f.run(5), /PSICOLOGOS/); assert.deepEqual(await f.state(), before);
    await f.db.exec('UPDATE "CitasPsicologos" SET "empresaId"=8');
    assert.deepEqual(await f.run(), { deleted: false });
    await f.db.exec('UPDATE "CitasPsicologos" SET "empresaId"=3; UPDATE "TerapiasPsicologos" SET "empresaId"=8;');
    await assert.rejects(f.run(), /saldo/);
    await f.db.exec('UPDATE "TerapiasPsicologos" SET "empresaId"=3; UPDATE "PaqueteAdquirido" SET "sesionesConsumidas"=0');
    const inconsistent = await f.state();
    await assert.rejects(f.run(), /saldo/); assert.deepEqual(await f.state(), inconsistent);
  } finally { await f.db.close(); }
});

test("failure saving mandatory audit rolls back both deletion and restored balance", async () => {
  const f = await fixture();
  try {
    const before = await f.state();
    await assert.rejects(f.db.transaction(async tx => {
      await deletePsychologyAppointment(adapter(tx), 4, 1n);
      await tx.exec('INSERT INTO missing_audit VALUES(1)');
    }));
    assert.deepEqual(await f.state(), before);
  } finally { await f.db.close(); }
});

test("server action validates access and requires transaction audit for a successful deletion", async () => {
  let calls = 0; let audited = 0;
  const tx = {};
  const actions = loadServerModule<typeof Actions>('app/(protected)/dashboard/citas/actions.ts', {
    '@/lib/prisma': { $transaction: async (fn: (tx: object) => Promise<unknown>) => fn(tx) },
    '@/lib/auth': {}, 'next/cache': { revalidatePath() {} },
    '@/prisma/generated/prisma/client': {}, 'date-fns-tz': {}, '@supabase/supabase-js': {},
    '@/lib/psychology-access': { requireFinanceUser: async (token: string) => { if (token !== 'valid') throw Error('No autorizado'); return { id: 10, tenantId: 4 }; } },
    '@/lib/psychology-appointment-delete': { deletePsychologyAppointment: async (passed: object) => { assert.equal(passed, tx); calls++; return { deleted: true, before: { id: 1 }, restoredPackage: { before: { saldo: 2 }, after: { saldo: 3 } } }; } },
    '@/lib/audit': { createAuditLog: async (args: { tx: object; required: boolean; detalles: unknown }) => { assert.equal(args.tx, tx); assert.equal(args.required, true); assert.ok(args.detalles); audited++; } },
  });
  assert.ok((await actions.deleteCita('invalid', 1)).error);
  assert.ok((await actions.deleteCita('valid', -1)).error); assert.equal(calls, 0);
  assert.equal((await actions.deleteCita('valid', 1)).success, true);
  assert.equal(calls, 1); assert.equal(audited, 1);
});
