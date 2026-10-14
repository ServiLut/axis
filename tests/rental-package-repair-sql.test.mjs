import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readRentalSnapshot, moneyFingerprints } from '../scripts/lib/rental-package-database.mjs';
import { planRentalPackageRepairs } from '../scripts/lib/rental-package-prices.mjs';
import { applyRepairPlan } from '../scripts/lib/rental-package-repair.mjs';

// Actual PostgreSQL syntax is exercised against an isolated in-memory database.
// These tests do not load dotenv, connect to production or write any local backup.
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE "Tenant" (id int primary key, nombre text);
    CREATE TABLE "Empresa" (id int primary key,"tenantId" int);
    CREATE TABLE "Usuario" (id int primary key,"tenantId" int,rol text,activo boolean,aprobado boolean);
    CREATE TABLE consultorios (id bigint primary key,"tenantId" int,"empresaId" int);
    CREATE TABLE "TerapiasPsicologos" (id bigint primary key,"tenantId" int,"empresaId" int,nombre text,categoria text,"cantidadSesiones" int,"precioBase" numeric(12,2));
    CREATE TABLE "PaqueteAdquirido" (id bigserial primary key,"tenantId" int,"clienteId" int,"usuarioId" int,"catalogoId" bigint,
      "sesionesTotales" int,"sesionesConsumidas" int,"saldoRestante" int,"precioPagado" numeric(12,2),estado text,"fechaCompra" timestamptz,
      "fechaVencimiento" timestamptz,created_at timestamptz default now());
    CREATE TABLE "CitasPsicologos" (id bigint primary key,"tenantId" int,"empresaId" int,"paqueteId" bigint,"pacienteId" int,"psicologoId" int,
      "consultorioId" bigint,"fechaCita" timestamptz,"horaInicio" timestamptz,"horaFin" timestamptz,valor numeric(12,2),realizada boolean,
      "estadoPago" text,"metodoPago" text,"comprobantePath" text,"createdAt" timestamptz,observacion text);
    CREATE TABLE "Auditoria" (id serial primary key,"tenantId" int,"usuarioId" int,accion text,entidad text,"entidadId" text,detalles jsonb,metadata jsonb,"createdAt" timestamp default now());
    CREATE TABLE "MovimientoCaja" (id bigint primary key,"tenantId" int,monto numeric(12,2),tipo text);
    CREATE TABLE "PagoServicioPsicologia" (id bigint primary key,"tenantId" int,"paqueteId" bigint,"citaId" bigint,monto numeric(12,2),reversado boolean,"movimientoCajaId" bigint);
    CREATE TABLE "CargoRecepcion" (id bigint primary key,"tenantId" int);
    CREATE TABLE "PagoRecepcion" (id bigint primary key,"tenantId" int);
    CREATE TABLE "AplicacionPagoRecepcion" ("pagoId" bigint,"cargoId" bigint,monto numeric(12,2));
    INSERT INTO "Tenant" VALUES (4,'PSICOLOGOS'); INSERT INTO "Empresa" VALUES (3,4);
    INSERT INTO "Usuario" VALUES (10,4,'ADMIN',true,true),(84,4,'TECNICO',true,true);
    INSERT INTO consultorios VALUES (12,4,3);
    INSERT INTO "TerapiasPsicologos" VALUES (49,4,3,'Alquiler de Consultorio','ALQUILER',1,18900);
    INSERT INTO "PaqueteAdquirido" (id,"tenantId","clienteId","usuarioId","catalogoId","sesionesTotales","sesionesConsumidas","saldoRestante","precioPagado",estado,"fechaCompra")
      VALUES (2013,4,NULL,84,49,1,1,0,56700,'ACTIVO','2026-09-16T19:18:24.595Z');
    SELECT setval('"PaqueteAdquirido_id_seq"',2013);
    INSERT INTO "CitasPsicologos" VALUES
      (2498,4,3,2013,NULL,84,12,'2026-10-03T20:00Z','2026-10-03T20:00Z','2026-10-03T23:00Z',56700,NULL,'PENDIENTE','transferencia',NULL,'2026-09-16T19:18:24.595Z','Conservar observación histórica'),
      (2708,4,3,2013,NULL,84,12,'2026-10-10T20:00Z','2026-10-10T20:00Z','2026-10-10T21:00Z',18900,true,'PENDIENTE','transferencia',NULL,'2026-10-10T17:43:26.988Z','Conservar observación de reserva');
    INSERT INTO "Auditoria" ("tenantId","usuarioId",accion,entidad,"entidadId",detalles)
      SELECT 4,10,'CREATE','Cita','2708',jsonb_build_object('despues',to_jsonb(c)) FROM "CitasPsicologos" c WHERE id=2708;
    INSERT INTO "MovimientoCaja" VALUES (1,4,5971200,'INGRESO');
  `);
  const snapshot = await readRentalSnapshot(db);
  const approved = JSON.parse(JSON.stringify({ snapshot, selectedCitaIds: ['2708'], plan: planRentalPackageRepairs(snapshot, ['2708']) }));
  const options = { actorId: 10, requestId: '032580d5-9992-4e44-8f90-444444444444', reason: 'Restaurar el precio contractual documentado de una hora', backup: async () => {} };
  return { db, approved, options };
}

test('real SQL creates own rental package, preserves all other cita data and cancelled history, and money hashes stay exact', async () => {
  const { db, approved, options } = await fixture();
  try {
    assert.equal(approved.plan.summary.eligibleBookings, 1);
    const beforeMoney = await moneyFingerprints(db);
    const beforeCitas = (await db.query('SELECT to_jsonb(c) AS record FROM "CitasPsicologos" c ORDER BY id')).rows;
    const result = await applyRepairPlan(db, approved, options);
    const afterCitas = (await db.query('SELECT to_jsonb(c) AS record FROM "CitasPsicologos" c ORDER BY id')).rows;
    assert.deepEqual(afterCitas[0], beforeCitas[0]);
    const expected = structuredClone(beforeCitas[1]); expected.record.paqueteId = 2014;
    assert.deepEqual(afterCitas[1], expected); assert.equal(result.changes[0].newPackageId, '2014');
    const packages = (await db.query('SELECT id::text,estado,"precioPagado"::text,"sesionesConsumidas","saldoRestante","fechaCompra" FROM "PaqueteAdquirido" ORDER BY id')).rows;
    assert.equal(packages[0].estado, 'CANCELADO'); assert.equal(packages[0].precioPagado, '56700.00');
    assert.equal(packages[1].precioPagado, '18900.00'); assert.equal(packages[1].sesionesConsumidas, 1);
    assert.equal(packages[1].fechaCompra.toISOString(), '2026-10-10T17:43:26.988Z');
    assert.deepEqual(await moneyFingerprints(db), beforeMoney);
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "Auditoria"')).rows[0].count, 5);
    const again = await applyRepairPlan(db, approved, options); assert.equal(again.alreadyApplied, true);
  } finally { await db.close(); }
});

test('real SQL rejects a new reversed payment in the approved target and leaves every row unchanged', async () => {
  const { db, approved, options } = await fixture();
  try {
    await db.exec('INSERT INTO "PagoServicioPsicologia" VALUES (50,4,2013,NULL,18900,true,1);');
    const before = await readRentalSnapshot(db);
    await assert.rejects(applyRepairPlan(db, approved, options), /STALE/);
    const after = await readRentalSnapshot(db);
    assert.deepEqual(after.packages, before.packages); assert.deepEqual(after.financialFingerprints, before.financialFingerprints);
  } finally { await db.close(); }
});

test('real SQL audit constraint failure rolls back cloned package, updated link and all repair audits', async () => {
  const { db, approved, options } = await fixture();
  try {
    await db.exec(`ALTER TABLE "Auditoria" ADD CONSTRAINT reject_relink CHECK (accion <> 'REPAIR_RENTAL_PACKAGE_LINK');`);
    const before = await readRentalSnapshot(db);
    await assert.rejects(applyRepairPlan(db, approved, options), error => error.code === '23514');
    const after = await readRentalSnapshot(db);
    assert.deepEqual(after.packages, before.packages); assert.deepEqual(after.financialFingerprints, before.financialFingerprints);
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "PaqueteAdquirido"')).rows[0].count, 1);
  } finally { await db.close(); }
});
