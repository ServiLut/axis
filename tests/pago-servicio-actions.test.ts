import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { loadServerModule } from "./load-server-module";
import type * as Actions from "../app/(protected)/dashboard/contabilidad/caja/pagos-actions";
import type * as Cash from "../app/(protected)/dashboard/contabilidad/caja/actions";

async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "Tenant"("id" integer PRIMARY KEY);
    CREATE TABLE "Usuario"("id" integer PRIMARY KEY,"tenantId" integer,"rol" text,"activo" boolean,"aprobado" boolean,
      "nombre" text,"apellido" text);
    CREATE TABLE "Cliente"("id" integer PRIMARY KEY,"tenantId" integer,"nombre" text,"apellido" text);
    CREATE TABLE "CitasPsicologos"("id" bigint PRIMARY KEY,"tenantId" integer,"pacienteId" integer,
      "fechaCita" timestamptz,"valor" numeric(12,2),"estadoPago" text,"realizada" boolean,"paqueteId" bigint,"metodoPago" text);
    CREATE TABLE "PaqueteAdquirido"("id" bigint PRIMARY KEY,"tenantId" integer,"clienteId" integer,
      "fechaCompra" timestamptz,"precioPagado" numeric(12,2),"estado" text);
    CREATE TABLE "Auditoria"("id" bigserial PRIMARY KEY,"tenantId" integer,"accion" text);
    INSERT INTO "Tenant" VALUES(4),(9);
    INSERT INTO "Usuario" VALUES(10,4,'ADMIN',true,true,'Recepción','Prueba');
    INSERT INTO "Cliente" VALUES(100,4,'Paciente','Prueba');
    INSERT INTO "CitasPsicologos" VALUES
      (1,4,100,'2026-09-26T14:00:00Z',50000,'PENDIENTE',false,NULL,NULL),
      (2,4,100,'2026-09-25T14:00:00Z',20000,'CONCILIADO',true,NULL,'EFECTIVO');
    INSERT INTO "PaqueteAdquirido" VALUES(3,4,100,'2026-09-26T15:00:00Z',90000,'ACTIVO');`);
  await db.exec(readFileSync("docs/sql/2026-09-24-caja-diaria.sql", "utf8"));
  await db.exec(readFileSync("docs/sql/2026-09-25-recepcion.sql", "utf8"));
  await db.exec(readFileSync("docs/sql/2026-09-26-pagos-servicios.sql", "utf8"));
  const state = { auditFail: false, tenantId: 4 };
  const raw = (driver: PGlite | Transaction) => {
    const execute = async (strings: TemplateStringsArray, ...params: unknown[]) => driver.query(
      strings.reduce((sql, part, index) => sql + (index ? `$${index}` : "") + part, ""),
      params.map((p) => typeof p === "bigint" ? p.toString() : p));
    return {
      $queryRaw: async (s: TemplateStringsArray, ...p: unknown[]) => (await execute(s,...p)).rows,
      $executeRaw: async (s: TemplateStringsArray, ...p: unknown[]) => (await execute(s,...p)).affectedRows,
      usuario: { findUnique: async () => ({ id: 10, tenantId: state.tenantId, rol: "ADMIN", activo: true, aprobado: true }) },
      citasPsicologos: {
        findFirst: async ({ where }: { where: { id: bigint; tenantId: number } }) =>
          (await driver.query<{ valor: string; estadoPago: string; fechaCita: Date }>(
            `SELECT "valor"::text,"estadoPago","fechaCita" FROM "CitasPsicologos" WHERE "id"=$1 AND "tenantId"=$2 AND "paqueteId" IS NULL`,
            [where.id.toString(),where.tenantId])).rows[0] || null,
        update: async ({ where, data }: { where: { id: bigint }; data: { estadoPago: string; metodoPago?: string } }) => {
          await driver.query(`UPDATE "CitasPsicologos" SET "estadoPago"=$1,"metodoPago"=COALESCE($2,"metodoPago") WHERE "id"=$3`,
            [data.estadoPago,data.metodoPago || null,where.id.toString()]);
        },
      },
      paqueteAdquirido: { findFirst: async ({ where }: { where: { id: bigint; tenantId: number } }) =>
        (await driver.query<{ precioPagado: string; fechaCompra: Date }>(
          `SELECT "precioPagado"::text,"fechaCompra" FROM "PaqueteAdquirido" WHERE "id"=$1 AND "tenantId"=$2`,
          [where.id.toString(),where.tenantId])).rows[0] || null },
    };
  };
  const prisma = { ...raw(db), $transaction: async <T>(fn: (tx: ReturnType<typeof raw>) => Promise<T>) => db.transaction((tx) => fn(raw(tx))) };
  const actions = loadServerModule<typeof Actions>("app/(protected)/dashboard/contabilidad/caja/pagos-actions.ts", {
    "@/lib/prisma": prisma, "./prisma": prisma,
    "./auth": { verifyToken: (token: string) => token === "valid" ? { userId: 10 } : null },
    "@/lib/audit": { createAuditLog: async (p: { tenantId: number; accion: string; tx: ReturnType<typeof raw> }) => {
      if (state.auditFail) throw new Error("Audit unavailable");
      await p.tx.$executeRaw`INSERT INTO "Auditoria"("tenantId","accion") VALUES(${p.tenantId},${p.accion})`;
    } },
    "next/cache": { revalidatePath() {} },
    "node:crypto": { randomUUID },
  }, { NEXT_PUBLIC_RECEPCION_ENABLED: "true" });
  const cashActions = loadServerModule<typeof Cash>("app/(protected)/dashboard/contabilidad/caja/actions.ts", {
    "@/lib/prisma": prisma,
    "@/lib/auth": { verifyToken: (token: string) => token === "valid" ? { userId: 10 } : null },
    "@/lib/audit": { createAuditLog: async (p: { tenantId: number; accion: string; tx: ReturnType<typeof raw> }) => {
      if (state.auditFail) throw new Error("Audit unavailable");
      await p.tx.$executeRaw`INSERT INTO "Auditoria"("tenantId","accion") VALUES(${p.tenantId},${p.accion})`;
    } },
  }, { NEXT_PUBLIC_RECEPCION_ENABLED: "true" });
  const count = async (table: string) => Number((await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}"`)).rows[0].n);
  return { db, actions, cashActions, state, count };
}

test("cobro mixto de cita se escribe una vez en el libro, se reintenta y no supera el saldo", async () => {
  const f = await fixture();
  try {
    const input = { origen: "CITA" as const, origenId: "1", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "EFECTIVO" as const, monto: "20000", referencia: "" },
        { metodoPago: "TRANSFERENCIA" as const, monto: "30000", referencia: "TX-123" }] };
    const first = await f.actions.registrarPagoServicio("valid", input);
    assert.ok("ids" in first, JSON.stringify(first));
    assert.ok("ids" in await f.actions.registrarPagoServicio("valid", input));
    assert.equal(await f.count("MovimientoCaja"), 2);
    assert.equal(await f.count("PagoServicioPsicologia"), 2);
    const cash = await f.db.query<{ metodoPago: string; monto: string }>(`SELECT "metodoPago","monto"::text FROM "MovimientoCaja" ORDER BY "id"`);
    assert.deepEqual(cash.rows.map((row) => [row.metodoPago,row.monto]), [["EFECTIVO","20000.00"],["TRANSFERENCIA","30000.00"]]);
    assert.equal((await f.db.query<{ estadoPago: string }>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE "id"=1`)).rows[0].estadoPago,"CONCILIADO");
    const extra = await f.actions.registrarPagoServicio("valid", { ...input, solicitudId: randomUUID(), lineas: [{ metodoPago: "EFECTIVO", monto: "1", referencia: "" }] });
    assert.ok("error" in extra);
  } finally { await f.db.close(); }
});

test("no convierte conciliaciones viejas en ingresos y falla en bloque si no hay auditoría", async () => {
  const f = await fixture();
  try {
    const old = await f.actions.registrarPagoServicio("valid", { origen: "CITA", origenId: "2", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "EFECTIVO", monto: "20000", referencia: "" }] });
    assert.ok("error" in old);
    const pending = await f.actions.getPendientesPsicologia("valid", "2026-09-26");
    assert.ok("items" in pending, JSON.stringify(pending));
    if ("items" in pending) assert.equal(pending.items.find((item) => item.origen === "CITA" && item.id === "2")?.situacion,"REVISAR_LEGADO");
    f.state.auditFail = true;
    const noAudit = await f.actions.registrarPagoServicio("valid", { origen: "CITA", origenId: "1", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "EFECTIVO", monto: "10000", referencia: "" }] });
    assert.ok("error" in noAudit);
    assert.equal(await f.count("MovimientoCaja"),0);
  } finally { await f.db.close(); }
});

test("el paquete se cobra una sola vez y la devolución abre saldo sin borrar el ingreso", async () => {
  const f = await fixture();
  try {
    const payment = await f.actions.registrarPagoServicio("valid", { origen: "PAQUETE", origenId: "3", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "TRANSFERENCIA", monto: "90000", referencia: "PKG-001" }] });
    assert.ok("ids" in payment, JSON.stringify(payment));
    if (!("ids" in payment)) return;
    assert.equal(await f.count("MovimientoCaja"),1);
    const duplicate = await f.actions.registrarPagoServicio("valid", { origen: "PAQUETE", origenId: "3", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "TRANSFERENCIA", monto: "90000", referencia: "PKG-001" }] });
    assert.ok("error" in duplicate);
    const refund = await f.actions.devolverPagoServicio("valid",payment.ids[0],"2026-09-26","Devolución efectuada",randomUUID());
    assert.ok("success" in refund,JSON.stringify(refund));
    assert.equal(await f.count("MovimientoCaja"),2);
    const net = await f.db.query<{ total: string }>(`SELECT SUM(CASE WHEN "tipo"='INGRESO' THEN "monto" ELSE -"monto" END)::text AS total FROM "MovimientoCaja"`);
    assert.equal(net.rows[0].total,"0.00");
    const open = await f.actions.getPendientesPsicologia("valid","2026-09-26");
    assert.ok("items" in open);
    if ("items" in open) assert.equal(open.items.find((item) => item.origen === "PAQUETE" && item.id === "3")?.registrado,"0.00");
  } finally { await f.db.close(); }
});

test("gasto de internet y cobro de cita comparten libro sin duplicar el ingreso", async () => {
  const f = await fixture();
  try {
    const payment = await f.actions.registrarPagoServicio("valid", { origen: "CITA", origenId: "1", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "EFECTIVO", monto: "50000", referencia: "" }] });
    assert.ok("ids" in payment,JSON.stringify(payment));
    const expense = await f.cashActions.createCajaMovement("valid", { fecha: "2026-09-26", tipo: "EGRESO",
      metodoPago: "TRANSFERENCIA", monto: "10000", concepto: "Pago de internet", referencia: "FACT-001", solicitudId: randomUUID() });
    assert.ok("success" in expense,JSON.stringify(expense));
    const ledger = await f.cashActions.getCajaMovements("valid","2026-09-26");
    assert.ok("movements" in ledger,JSON.stringify(ledger));
    if ("movements" in ledger && ledger.movements) assert.deepEqual(ledger.movements.map((row) => row.tipo).sort(),["EGRESO","INGRESO"]);
    const totals = await f.db.query<{ neto: string }>(`SELECT SUM(CASE WHEN "tipo"='INGRESO' THEN "monto" ELSE -"monto" END)::text AS neto FROM "MovimientoCaja"`);
    assert.equal(totals.rows[0].neto,"40000.00");
    f.state.auditFail = true;
    const noAudit = await f.cashActions.createCajaMovement("valid", { fecha: "2026-09-26", tipo: "EGRESO",
      metodoPago: "EFECTIVO", monto: "100", concepto: "Compra sin auditoría", referencia: "", solicitudId: randomUUID() });
    assert.ok("error" in noAudit);
    assert.equal(await f.count("MovimientoCaja"),2);
  } finally { await f.db.close(); }
});
