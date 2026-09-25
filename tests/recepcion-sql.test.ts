import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { loadServerModule } from "./load-server-module";
import type * as Actions from "../app/(protected)/dashboard/recepcion/actions";

const fecha = "2026-01-01";
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "Tenant" ("id" INTEGER PRIMARY KEY);
    CREATE TABLE "Usuario" ("id" INTEGER PRIMARY KEY,"tenantId" INTEGER,"nombre" TEXT,"apellido" TEXT);
    CREATE TABLE "CitasPsicologos" ("id" BIGINT PRIMARY KEY);
    CREATE TABLE "Auditoria" ("id" BIGSERIAL PRIMARY KEY,"tenantId" INTEGER,"entidad" TEXT,"entidadId" TEXT,"accion" TEXT);
    INSERT INTO "Tenant" VALUES (4),(9);
    INSERT INTO "Usuario" VALUES (10,4,'Recepción','Prueba'),(20,4,'Profesional','Uno'),(21,4,'Profesional','Dos'),(90,9,'Otro','Sistema');
    INSERT INTO "CitasPsicologos" VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9);`);
  await db.exec(readFileSync("docs/sql/2026-09-24-caja-diaria.sql", "utf8"));
  await db.exec(readFileSync("docs/sql/2026-09-25-recepcion.sql", "utf8"));
  const state = { tenantId: 4, rol: "ADMIN", activo: true, aprobado: true, auditFail: false, hourly: 18900, rentalCount: 1 };
  const usuario = {
    findUnique: async () => ({ id: 10, ...state }),
    findFirst: async ({ where }: { where: { id: number; tenantId: number } }) => [20,21].includes(where.id) && where.tenantId === 4 ? { id: where.id } : null,
    findMany: async () => [{ id: 20, nombre: "Profesional", apellido: "Uno" }, { id: 21, nombre: "Profesional", apellido: "Dos" }],
  };
  const citasPsicologos = {
    findFirst: async ({ where }: { where: { id: bigint; tenantId: number; psicologoId: number } }) => where.tenantId === 4 && where.psicologoId === 20 ? {
      id: where.id, psicologoId: 20, consultorioId: 1n, realizada: false,
      horaFin: new Date("2026-01-01T16:00:00Z"), PaqueteAdquirido: { TerapiasPsicologos: { nombre: "Alquiler de consultorio" } },
    } : null,
    findMany: async () => [],
  };
  const terapiasPsicologos = { findMany: async () => Array.from({ length: state.rentalCount }, () => ({ precioBase: state.hourly })) };
  const raw = (driver: PGlite | Transaction) => {
    const execute = async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const sql = strings.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "");
      return driver.query(sql, params.map((p) => typeof p === "bigint" ? p.toString() : p));
    };
    return { $queryRaw: async (s: TemplateStringsArray, ...p: unknown[]) => (await execute(s, ...p)).rows,
      $executeRaw: async (s: TemplateStringsArray, ...p: unknown[]) => (await execute(s, ...p)).affectedRows,
      usuario, citasPsicologos, terapiasPsicologos };
  };
  const prisma = { ...raw(db), $transaction: async <T>(fn: (tx: ReturnType<typeof raw>) => Promise<T>) => db.transaction((tx) => fn(raw(tx))) };
  const auth = { verifyToken: (token: string) => token === "valid" ? { userId: 10 } : null };
  const audit = { createAuditLog: async (p: { tenantId: number; entidad: string; entidadId: string; accion: string; tx: ReturnType<typeof raw> }) => {
    if (state.auditFail) throw new Error("Audit unavailable");
    await p.tx.$executeRaw`INSERT INTO "Auditoria" ("tenantId","entidad","entidadId","accion") VALUES (${p.tenantId},${p.entidad},${p.entidadId},${p.accion})`;
  } };
  const actions = loadServerModule<typeof Actions>("app/(protected)/dashboard/recepcion/actions.ts", {
    "@/lib/prisma": prisma, "./prisma": prisma, "./auth": auth, "@/lib/audit": audit,
    "next/cache": { revalidatePath() {} }, "@/prisma/generated/prisma/client": { Prisma: {} },
  }, { NEXT_PUBLIC_RECEPCION_ENABLED: "true" });
  const create = (extra = {}) => actions.createReceptionCharge("valid", {
    solicitudId: randomUUID(), fecha, profesionalId: 20, tipo: "IMPRESION", cantidad: 10, nota: "", ...extra });
  const count = async (table: string) => Number((await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}"`)).rows[0].n);
  return { db, state, actions, create, count };
}

test("Postgres: sale, partial/shared payment and reversal leave exact balances and one cash event", async () => {
  const f = await fixture();
  try {
    const a = await f.create(), b = await f.create({ cantidad: 1 });
    assert.ok("id" in a && "id" in b);
    if (!("id" in a) || !("id" in b)) return;
    const input = { solicitudId: randomUUID(), fecha, metodoPago: "TRANSFERENCIA" as const, referencia: "BANK-001",
      aplicaciones: [{ cargoId: a.id, monto: "4000.00" }, { cargoId: b.id, monto: "800.00" }] };
    const payment = await f.actions.recordReceptionPayment("valid", input);
    assert.ok("id" in payment, JSON.stringify(payment));
    const retry = await f.actions.recordReceptionPayment("valid", input);
    assert.equal("id" in retry && retry.id, "id" in payment && payment.id);
    assert.equal(await f.count("MovimientoCaja"), 1);
    assert.equal(await f.count("AplicacionPagoRecepcion"), 2);
    const summary = await f.actions.getReceptionData("valid", fecha);
    assert.ok("cargos" in summary);
    if ("cargos" in summary) assert.equal(summary.cargos.find((c) => c.id === a.id)?.pagado, "4000.00");
    assert.ok("error" in await f.actions.recordReceptionPayment("valid", { ...input, solicitudId: randomUUID() }));
    assert.ok("error" in await f.actions.recordReceptionPayment("valid", { ...input, solicitudId: randomUUID(), referencia: "BANK-002", aplicaciones: [{ cargoId: a.id, monto: "4000.01" }] }));
    assert.ok("error" in await f.actions.cancelReceptionCharge("valid", a.id, "Corrección prueba"));
    if (!("id" in payment)) return;
    const req = randomUUID();
    assert.ok("success" in await f.actions.refundReceptionPayment("valid", payment.id, fecha, "Devolución comprobada", req));
    assert.ok("success" in await f.actions.refundReceptionPayment("valid", payment.id, fecha, "Devolución comprobada", req));
    assert.equal(await f.count("MovimientoCaja"), 2);
    const cash = (await f.db.query<{ total: string }>(`SELECT SUM(CASE WHEN "tipo"='INGRESO' THEN "monto" ELSE -"monto" END)::text AS total FROM "MovimientoCaja"`)).rows[0];
    assert.equal(Number(cash.total), 0);
    assert.ok("success" in await f.actions.cancelReceptionCharge("valid", a.id, "Corrección prueba"));
    assert.equal(await f.count("CargoRecepcion"), 2);
  } finally { await f.db.close(); }
});

test("Postgres: server enforces current tariff boundaries, immutable prices and one extra per reservation", async () => {
  const f = await fixture();
  try {
    for (const [i, minutes] of [1,14,15,16,30,31,60,61].entries()) {
      const result = await f.create({ tipo: "TIEMPO_EXTRA", cantidad: 1, citaId: String(i + 1), minutosExtra: minutes, nota: "Entrega verificada por recepción" });
      assert.ok("id" in result, JSON.stringify(result));
    }
    const totals = await f.db.query<{ minutosExtra: number; total: string }>(`SELECT "minutosExtra","total"::text FROM "CargoRecepcion" ORDER BY "id"`);
    assert.deepEqual(totals.rows.map((r) => r.total), ["4000.00","4000.00","4000.00","8000.00","8000.00","18900.00","18900.00","18900.00"]);
    assert.ok("error" in await f.create({ tipo: "TIEMPO_EXTRA", citaId: "1", minutosExtra: 30, nota: "Segunda solicitud" }));
    f.state.hourly = 20000;
    assert.ok("id" in await f.create({ tipo: "TIEMPO_EXTRA", citaId: "9", minutosExtra: 31, nota: "Tarifa del catálogo" }));
    assert.equal((await f.db.query<{ total: string }>(`SELECT "total"::text FROM "CargoRecepcion" WHERE "citaId" = 9`)).rows[0].total, "20000.00");
    assert.ok("success" in await f.actions.updateReceptionRate("valid", "IMPRESION", "900.00", "Tarifa autorizada de prueba"));
    assert.ok("error" in await f.actions.updateReceptionRate("valid", "EXTRA_HORA", "25000.00", "No duplicar tarifa"));
    f.state.rentalCount = 2;
    const page = await f.actions.getReceptionData("valid", fecha);
    assert.ok("catalogo" in page && page.catalogo.find((s) => s.codigo === "EXTRA_HORA")?.precio === null);
  } finally { await f.db.close(); }
});

test("Postgres: idempotent concurrent retries and audit failure cannot leave partial financial operations", async () => {
  const f = await fixture();
  try {
    const request = randomUUID();
    const results = await Promise.all([f.create({ solicitudId: request }), f.create({ solicitudId: request })]);
    assert.ok(results.every((r) => "id" in r), JSON.stringify(results));
    assert.equal(await f.count("CargoRecepcion"), 1);
    assert.ok("error" in await f.create({ solicitudId: request, cantidad: 2 }));
    f.state.auditFail = true;
    assert.ok("error" in await f.create());
    assert.equal(await f.count("CargoRecepcion"), 1);
    const charge = results[0]; if (!("id" in charge)) return;
    assert.ok("error" in await f.actions.recordReceptionPayment("valid", { solicitudId: randomUUID(), fecha, metodoPago: "EFECTIVO", referencia: "REC-001", aplicaciones: [{ cargoId: charge.id, monto: "8000" }] }));
    assert.equal(await f.count("MovimientoCaja"), 0);
    assert.equal(await f.count("PagoRecepcion"), 0);
  } finally { await f.db.close(); }
});

test("Postgres: wrong tenant, disabled users, different debtor and public database role are denied", async () => {
  const f = await fixture();
  try {
    assert.ok("error" in await f.create({ profesionalId: 90 }));
    const a = await f.create(), b = await f.create({ profesionalId: 21 });
    if (!("id" in a) || !("id" in b)) { assert.fail("Fixture charges failed"); }
    assert.ok("error" in await f.actions.recordReceptionPayment("valid", { solicitudId: randomUUID(), fecha, metodoPago: "EFECTIVO", referencia: "REC-003", aplicaciones: [{ cargoId: a.id, monto: "100" }, { cargoId: b.id, monto: "100" }] }));
    f.state.tenantId = 9; assert.ok("error" in await f.create());
    assert.ok("error" in await f.actions.getReceptionData("valid", fecha));
    f.state.tenantId = 4; f.state.activo = false; assert.ok("error" in await f.create());
    f.state.activo = true; f.state.rol = "ASESOR";
    assert.ok("error" in await f.actions.updateReceptionRate("valid", "IMPRESION", "1", "Sin permiso"));
    await f.db.exec(`CREATE ROLE reception_public; GRANT SELECT ON "CargoRecepcion" TO reception_public; SET ROLE reception_public;`);
    assert.equal(await f.count("CargoRecepcion"), 0);
    await f.db.exec("RESET ROLE");
  } finally { await f.db.close(); }
});
