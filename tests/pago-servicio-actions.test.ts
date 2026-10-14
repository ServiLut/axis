import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { loadServerModule } from "./load-server-module";
import type * as Actions from "../app/(protected)/dashboard/contabilidad/caja/pagos-actions";
import type * as Cash from "../app/(protected)/dashboard/contabilidad/caja/actions";
import type * as PackagePayment from "../lib/package-payment";
import type { Prisma } from "../prisma/generated/prisma/client";

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
    CREATE TABLE "TerapiasPsicologos"("id" bigint PRIMARY KEY,"tenantId" integer,"empresaId" integer,"nombre" text,"cantidadSesiones" integer);
    INSERT INTO "Tenant" VALUES(4),(9);
    INSERT INTO "Usuario" VALUES(10,4,'ADMIN',true,true,'Recepción','Prueba');
    INSERT INTO "Cliente" VALUES(100,4,'Paciente','Prueba');
    INSERT INTO "CitasPsicologos" VALUES
      (1,4,100,'2026-09-26T14:00:00Z',50000,'PENDIENTE',false,NULL,NULL),
      (2,4,100,'2026-09-25T14:00:00Z',20000,'CONCILIADO',true,NULL,'EFECTIVO');
    INSERT INTO "PaqueteAdquirido" VALUES(3,4,100,'2026-09-26T15:00:00Z',90000,'ACTIVO');
    INSERT INTO "TerapiasPsicologos" VALUES(1,4,3,'Terapia de tres sesiones',3),(49,4,3,'Alquiler de consultorio',1),(50,9,3,'Alquiler externo',1),(51,4,2,'Alquiler de otra entidad',1);
    ALTER TABLE "CitasPsicologos" ADD "psicologoId" integer;
    ALTER TABLE "CitasPsicologos" ADD "empresaId" integer DEFAULT 3;
    ALTER TABLE "PaqueteAdquirido" ADD "usuarioId" integer;
    ALTER TABLE "PaqueteAdquirido" ADD "catalogoId" bigint DEFAULT 1;
    ALTER TABLE "PaqueteAdquirido" ADD "sesionesTotales" integer DEFAULT 1;
    UPDATE "PaqueteAdquirido" SET "sesionesTotales"=3 WHERE "catalogoId"=1;`);
  await db.exec(readFileSync("docs/sql/2026-09-24-caja-diaria.sql", "utf8"));
  await db.exec(readFileSync("docs/sql/2026-09-25-recepcion.sql", "utf8"));
  await db.exec(readFileSync("docs/sql/2026-09-26-pagos-servicios.sql", "utf8"));
  const state = { auditFail: false, tenantId: 4, audits: [] as Record<string, unknown>[] };
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
        updateMany: async ({ where, data }: { where: { tenantId: number; paqueteId: bigint }; data: { estadoPago: string; metodoPago: string | null } }) =>
          driver.query(`UPDATE "CitasPsicologos" SET "estadoPago"=$1,"metodoPago"=$2
            WHERE "tenantId"=$3 AND "paqueteId"=$4 AND "realizada" IS NOT NULL`,
            [data.estadoPago,data.metodoPago,where.tenantId,where.paqueteId.toString()]),
      },
      paqueteAdquirido: { findFirst: async ({ where }: { where: { id: bigint; tenantId: number } }) =>
        (await driver.query<{ precioPagado: string; fechaCompra: Date; estado: string }>(
          `SELECT "precioPagado"::text,"fechaCompra","estado" FROM "PaqueteAdquirido" WHERE "id"=$1 AND "tenantId"=$2`,
          [where.id.toString(),where.tenantId])).rows[0] || null },
    };
  };
  const prisma = { ...raw(db), $transaction: async <T>(fn: (tx: ReturnType<typeof raw>) => Promise<T>) => db.transaction((tx) => fn(raw(tx))) };
  const actions = loadServerModule<typeof Actions>("app/(protected)/dashboard/contabilidad/caja/pagos-actions.ts", {
    "@/lib/prisma": prisma, "./prisma": prisma,
    "./auth": { verifyToken: (token: string) => token === "valid" ? { userId: 10 } : null },
    "@/lib/audit": { createAuditLog: async (p: { tenantId: number; accion: string; detalles: Record<string, unknown>; tx: ReturnType<typeof raw> }) => {
      if (state.auditFail) throw new Error("Audit unavailable");
      await p.tx.$executeRaw`INSERT INTO "Auditoria"("tenantId","accion") VALUES(${p.tenantId},${p.accion})`;
      state.audits.push(p.detalles);
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
  const packagePayment = loadServerModule<typeof PackagePayment>("lib/package-payment.ts", {}, { NEXT_PUBLIC_RECEPCION_ENABLED:"true" });
  return { db, actions, cashActions, state, count,
    packageState: () => packagePayment.getPackagePaymentState(prisma as unknown as Prisma.TransactionClient,4,3n) };
}

test("cobro mixto se escribe una vez y bloquea otro pago cuando ya se cubrió el saldo", async () => {
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

test("transferencia superior al saldo guarda todo el dinero una vez sin cambiar el precio", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`UPDATE "CitasPsicologos" SET valor=28350 WHERE id=1`);
    const input = { origen: "CITA" as const, origenId: "1", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "TRANSFERENCIA" as const, monto: "28.400", referencia: "3192463011" }] };
    const first = await f.actions.registrarPagoServicio("valid", input);
    assert.ok("ids" in first, JSON.stringify(first));
    const retry = await f.actions.registrarPagoServicio("valid", { ...input, lineas: [{ ...input.lineas[0], monto: "28400" }] });
    assert.equal(JSON.stringify(retry), JSON.stringify(first));
    assert.equal(await f.count("MovimientoCaja"), 1); assert.equal(await f.count("PagoServicioPsicologia"), 1);
    const saved = await f.db.query(`SELECT monto::text,"metodoPago",referencia FROM "PagoServicioPsicologia"`);
    assert.deepEqual(saved.rows, [{ monto: "28400.00", metodoPago: "TRANSFERENCIA", referencia: "3192463011" }]);
    assert.equal(f.state.audits[0].adicionalRecibido, 50);
    assert.equal(f.state.audits[0].saldoPendiente, 0);
    assert.equal((await f.db.query<{valor:string}>(`SELECT valor::text FROM "CitasPsicologos" WHERE id=1`)).rows[0].valor,"28350.00");
    assert.equal((await f.db.query<{ estadoPago: string }>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE id=1`)).rows[0].estadoPago, "CONCILIADO");
  } finally { await f.db.close(); }
});

test("acceso desde una cita resuelve su paquete completo y saldo sin crear ingresos", async () => {
  const f=await fixture();try {
    await f.db.exec(`INSERT INTO "CitasPsicologos"(id,"tenantId","pacienteId","fechaCita",valor,"estadoPago",realizada,"paqueteId")
      VALUES (20,4,100,'2026-09-28T14:00:00Z',30000,'PENDIENTE',true,3)`);
    const first=await f.actions.getCobroDesdeCita("valid","20");assert.ok("item" in first,JSON.stringify(first));
    if (!("item" in first)) return;
    assert.equal(first.item.origen,"PAQUETE");assert.equal(first.item.id,"3");assert.equal(first.item.valor,"90000.00");assert.equal(first.item.registrado,"0.00");
    assert.equal(await f.count("MovimientoCaja"),0);assert.equal(await f.count("PagoServicioPsicologia"),0);
    const payment=await f.actions.registrarPagoServicio("valid",{origen:"PAQUETE",origenId:"3",fecha:"2026-09-26",solicitudId:randomUUID(),confirmado:true,abonoConfirmado:true,
      lineas:[{metodoPago:"EFECTIVO",monto:"30000",referencia:""}]});assert.ok("ids" in payment);
    const partial=await f.actions.getCobroDesdeCita("valid","20");assert.ok("item" in partial);if("item" in partial)assert.equal(partial.item.registrado,"30000.00");
    await f.actions.registrarPagoServicio("valid",{origen:"PAQUETE",origenId:"3",fecha:"2026-09-26",solicitudId:randomUUID(),confirmado:true,
      lineas:[{metodoPago:"TRANSFERENCIA",monto:"60000",referencia:"T-2"}]});
    const full=await f.actions.getCobroDesdeCita("valid","20");assert.ok("notice" in full);if("notice" in full)assert.match(full.notice,/valor completo/);
  }finally {await f.db.close();}
});

test("paquete de 18.900 admite 37.800 mixtos, registra diferencia y no duplica sesiones ni ingreso", async () => {
  const f=await fixture(); try {
    await f.db.exec(`UPDATE "PaqueteAdquirido" SET "precioPagado"=18900 WHERE id=3;
      INSERT INTO "CitasPsicologos"(id,"tenantId","paqueteId",realizada,"estadoPago") VALUES(10,4,3,false,'PENDIENTE')`);
    const input={origen:'PAQUETE' as const,origenId:'3',fecha:'2026-09-26',solicitudId:randomUUID(),confirmado:true,
      lineas:[{metodoPago:'EFECTIVO' as const,monto:'18.900',referencia:''},{metodoPago:'TRANSFERENCIA' as const,monto:'18.900',referencia:'REDONDEO-1'}]};
    const saved=await f.actions.registrarPagoServicio('valid',input); assert.ok('ids' in saved,JSON.stringify(saved));
    assert.equal(JSON.stringify(await f.actions.registrarPagoServicio('valid',input)),JSON.stringify(saved));
    assert.equal(await f.count('MovimientoCaja'),2); assert.equal(await f.count('PagoServicioPsicologia'),2);
    assert.equal((await f.db.query<{total:string}>(`SELECT SUM(monto)::text AS total FROM "MovimientoCaja"`)).rows[0].total,'37800.00');
    assert.equal((await f.db.query<{precio:string}>(`SELECT "precioPagado"::text AS precio FROM "PaqueteAdquirido" WHERE id=3`)).rows[0].precio,'18900.00');
    assert.equal(f.state.audits[0].adicionalRecibido,18900); assert.equal(f.state.audits[0].saldoPendiente,0);
    assert.equal((await f.packageState())?.estadoPago,'CONCILIADO');
    assert.ok('notice' in await f.actions.getCobroDesdeCita('valid','10'));
    assert.ok('error' in await f.actions.registrarPagoServicio('valid',{...input,solicitudId:randomUUID()}));
    assert.equal(await f.count('MovimientoCaja'),2);
  } finally { await f.db.close(); }
});

test("un importe menor requiere abono explícito y una devolución recalcula el saldo real", async () => {
  const f=await fixture(); try {
    const input={origen:'CITA' as const,origenId:'1',fecha:'2026-09-26',solicitudId:randomUUID(),confirmado:true,
      lineas:[{metodoPago:'EFECTIVO' as const,monto:'20000',referencia:''}]};
    const rejected=await f.actions.registrarPagoServicio('valid',input);
    assert.ok('error' in rejected); if('error' in rejected) assert.match(rejected.error!,/abono/);
    assert.equal(await f.count('MovimientoCaja'),0);
    const partial=await f.actions.registrarPagoServicio('valid',{...input,abonoConfirmado:true});
    assert.ok('ids' in partial,JSON.stringify(partial)); if(!('ids' in partial))return;
    assert.equal((await f.db.query<{estadoPago:string}>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE id=1`)).rows[0].estadoPago,'PENDIENTE');
    const full=await f.actions.registrarPagoServicio('valid',{...input,solicitudId:randomUUID(),lineas:[{...input.lineas[0],monto:'60000'}]});
    assert.ok('ids' in full,JSON.stringify(full)); if(!('ids' in full))return;
    assert.ok('success' in await f.actions.devolverPagoServicio('valid',partial.ids[0],'2026-09-26','Devolución registrada',randomUUID()));
    assert.equal((await f.db.query<{estadoPago:string}>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE id=1`)).rows[0].estadoPago,'CONCILIADO');
    assert.ok('success' in await f.actions.devolverPagoServicio('valid',full.ids[0],'2026-09-26','Devolución registrada',randomUUID()));
    assert.equal((await f.db.query<{estadoPago:string}>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE id=1`)).rows[0].estadoPago,'PENDIENTE');
  } finally { await f.db.close(); }
});

test("un importe adicional conserva autorización, confirmación y reversión si falla auditoría", async () => {
  const f=await fixture(); try {
    const input={origen:'CITA' as const,origenId:'1',fecha:'2026-09-26',solicitudId:randomUUID(),confirmado:true,
      lineas:[{metodoPago:'EFECTIVO' as const,monto:'60000',referencia:''}]};
    assert.ok('error' in await f.actions.registrarPagoServicio('invalid',input));
    assert.ok('error' in await f.actions.registrarPagoServicio('valid',{...input,confirmado:false}));
    f.state.tenantId=9; assert.ok('error' in await f.actions.registrarPagoServicio('valid',input)); f.state.tenantId=4;
    f.state.auditFail=true; assert.ok('error' in await f.actions.registrarPagoServicio('valid',input));
    assert.equal(await f.count('MovimientoCaja'),0); assert.equal(await f.count('PagoServicioPsicologia'),0);
    assert.equal((await f.db.query<{estadoPago:string}>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE id=1`)).rows[0].estadoPago,'PENDIENTE');
  } finally { await f.db.close(); }
});

test("acceso directo a cobro respeta empresa, sesión, cancelación, legado y vínculo de paquete", async () => {
  const f=await fixture();try {
    assert.ok("item" in await f.actions.getCobroDesdeCita("valid","1"));
    const legacy=await f.actions.getCobroDesdeCita("valid","2");assert.ok('item' in legacy);if('item' in legacy)assert.equal(legacy.item.situacion,'REVISAR_LEGADO');
    assert.ok("error" in await f.actions.getCobroDesdeCita("invalid","1"));
    for (const id of ["1 OR 1=1","-1","9999999999999999999999","missing"]) assert.ok("error" in await f.actions.getCobroDesdeCita("valid",id));
    await f.db.exec('UPDATE "CitasPsicologos" SET "empresaId"=2 WHERE id=1');assert.ok("error" in await f.actions.getCobroDesdeCita("valid","1"));
    await f.db.exec('UPDATE "CitasPsicologos" SET "empresaId"=3,"tenantId"=9 WHERE id=1');assert.ok("error" in await f.actions.getCobroDesdeCita("valid","1"));
    await f.db.exec('UPDATE "CitasPsicologos" SET "tenantId"=4,realizada=NULL WHERE id=1');assert.ok("error" in await f.actions.getCobroDesdeCita("valid","1"));
    await f.db.exec('UPDATE "CitasPsicologos" SET realizada=true,"paqueteId"=999 WHERE id=1');assert.ok("error" in await f.actions.getCobroDesdeCita("valid","1"));
    await f.db.exec(`UPDATE "CitasPsicologos" SET "paqueteId"=3 WHERE id=1; UPDATE "PaqueteAdquirido" SET estado='CANCELADO' WHERE id=3`);assert.ok("error" in await f.actions.getCobroDesdeCita("valid","1"));
    await f.db.exec(`UPDATE "PaqueteAdquirido" SET estado='ACTIVO',"fechaCompra"='2026-09-25T15:00:00Z' WHERE id=3`);assert.ok("item" in await f.actions.getCobroDesdeCita("valid","1"));
    assert.equal(await f.count("MovimientoCaja"),0);assert.equal(await f.count("PagoServicioPsicologia"),0);
  }finally{await f.db.close();}
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
    const noAudit = await f.actions.registrarPagoServicio("valid", { origen: "CITA", origenId: "1", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true, abonoConfirmado: true,
      lineas: [{ metodoPago: "EFECTIVO", monto: "10000", referencia: "" }] });
    assert.ok("error" in noAudit);
    assert.equal(await f.count("MovimientoCaja"),0);
  } finally { await f.db.close(); }
});

test("el paquete se cobra una sola vez y la devolución abre saldo sin borrar el ingreso", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "CitasPsicologos"("id","tenantId","paqueteId","realizada","estadoPago")
      VALUES(10,4,3,false,'PENDIENTE'),(11,4,3,true,'PENDIENTE'),(12,4,3,NULL,'PENDIENTE'),(13,9,3,false,'PENDIENTE');`);
    assert.equal(await f.packageState(),null);
    const payment = await f.actions.registrarPagoServicio("valid", { origen: "PAQUETE", origenId: "3", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "TRANSFERENCIA", monto: "90000", referencia: "PKG-001" }] });
    assert.ok("ids" in payment, JSON.stringify(payment));
    if (!("ids" in payment)) return;
    assert.equal(await f.count("MovimientoCaja"),1);
    assert.equal((await f.packageState())?.estadoPago,"CONCILIADO");
    const appointments = await f.db.query<{ id: number; estadoPago: string; metodoPago: string | null }>(
      `SELECT "id"::int,"estadoPago","metodoPago" FROM "CitasPsicologos" WHERE "id">=10 ORDER BY "id"`);
    assert.deepEqual(appointments.rows.map(r=>[r.id,r.estadoPago,r.metodoPago]),[
      [10,"CONCILIADO","TRANSFERENCIA"],[11,"CONCILIADO","TRANSFERENCIA"],[12,"PENDIENTE",null],[13,"PENDIENTE",null]]);
    const duplicate = await f.actions.registrarPagoServicio("valid", { origen: "PAQUETE", origenId: "3", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "TRANSFERENCIA", monto: "90000", referencia: "PKG-001" }] });
    assert.ok("error" in duplicate);
    const refund = await f.actions.devolverPagoServicio("valid",payment.ids[0],"2026-09-26","Devolución efectuada",randomUUID());
    assert.ok("success" in refund,JSON.stringify(refund));
    assert.equal(await f.count("MovimientoCaja"),2);
    const net = await f.db.query<{ total: string }>(`SELECT SUM(CASE WHEN "tipo"='INGRESO' THEN "monto" ELSE -"monto" END)::text AS total FROM "MovimientoCaja"`);
    assert.equal(net.rows[0].total,"0.00");
    const afterRefund = await f.db.query<{ estadoPago: string }>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE "id"=10`);
    assert.equal(afterRefund.rows[0].estadoPago,"PENDIENTE");
    assert.equal((await f.packageState())?.estadoPago,"PENDIENTE");
    const open = await f.actions.getPendientesPsicologia("valid","2026-09-26");
    assert.ok("items" in open);
    if ("items" in open) assert.equal(open.items.find((item) => item.origen === "PAQUETE" && item.id === "3")?.registrado,"0.00");
  } finally { await f.db.close(); }
});

test("abonos sucesivos de paquete conservan saldo y propagan el medio mixto sin duplicar caja", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "CitasPsicologos"("id","tenantId","paqueteId","realizada","estadoPago")
      VALUES(10,4,3,false,'PENDIENTE');`);
    const base = {origen:"PAQUETE" as const,origenId:"3",fecha:"2026-09-26",confirmado:true,abonoConfirmado:true};
    assert.ok("ids" in await f.actions.registrarPagoServicio("valid",{...base,solicitudId:randomUUID(),
      lineas:[{metodoPago:"EFECTIVO",monto:"30000",referencia:""}]}));
    assert.equal((await f.packageState())?.estadoPago,"PENDIENTE");
    assert.ok("ids" in await f.actions.registrarPagoServicio("valid",{...base,solicitudId:randomUUID(),
      lineas:[{metodoPago:"TRANSFERENCIA",monto:"60000",referencia:"FINAL-001"}]}));
    const settlement=await f.packageState();
    assert.equal(settlement?.estadoPago,"CONCILIADO"); assert.equal(settlement?.metodoPago,"MIXTO");
    const cita=await f.db.query<{estadoPago:string;metodoPago:string}>(`SELECT "estadoPago","metodoPago" FROM "CitasPsicologos" WHERE "id"=10`);
    assert.equal(cita.rows[0].metodoPago,"MIXTO"); assert.equal(cita.rows[0].estadoPago,"CONCILIADO");
    assert.equal(await f.count("MovimientoCaja"),2);
  } finally { await f.db.close(); }
});

test("alquiler identifica al profesional, conserva legado y excluye paquetes cancelados", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`UPDATE "PaqueteAdquirido" SET "clienteId"=NULL,"usuarioId"=10 WHERE "id"=3;
      INSERT INTO "CitasPsicologos"("id","tenantId","pacienteId","fechaCita","valor","estadoPago","realizada")
      VALUES(20,4,100,'2026-09-20T14:00:00Z',5000,'PENDIENTE',true);
      INSERT INTO "PaqueteAdquirido"("id","tenantId","clienteId","fechaCompra","precioPagado","estado")
      VALUES(4,4,100,'2026-09-26T15:00:00Z',30000,'CANCELADO');`);
    const open = await f.actions.getPendientesPsicologia("valid","2026-09-26");
    assert.ok("items" in open,JSON.stringify(open));
    if ("items" in open) {
      assert.equal(open.items[0].id,"20");
      assert.equal(open.items[0].origen,"CITA");
      assert.equal(open.items.find(r=>r.origen==="PAQUETE" && r.id==="3")?.persona,"Recepción Prueba");
      assert.equal(open.items.some(r=>r.origen==="PAQUETE" && r.id==="4"),false);
    }
    const canceled = await f.actions.registrarPagoServicio("valid", { origen:"PAQUETE",origenId:"4",fecha:"2026-09-26",
      solicitudId:randomUUID(),confirmado:true,lineas:[{metodoPago:"EFECTIVO",monto:"30000",referencia:""}] });
    assert.ok("error" in canceled);
    assert.equal(await f.count("MovimientoCaja"),0);
  } finally { await f.db.close(); }
});

test('conciliación histórica exige revisión y permite referencia vacía sin duplicar reintentos',async()=>{
 const f=await fixture();try{
  const input={origen:'CITA' as const,origenId:'2',fecha:'2026-09-25',solicitudId:randomUUID(),confirmado:true,historicoRevisado:true,lineas:[{metodoPago:'EFECTIVO' as const,monto:'20000',referencia:''}]};
  assert.ok('error' in await f.actions.registrarPagoServicio('valid',{...input,historicoRevisado:false}));
  assert.ok('ids' in await f.actions.registrarPagoServicio('valid',input));assert.ok('ids' in await f.actions.registrarPagoServicio('valid',input));assert.equal(await f.count('MovimientoCaja'),1);
  const rows=await f.db.query<{fecha:string}>(`SELECT fecha::text FROM "MovimientoCaja"`);assert.equal(rows.rows[0].fecha,'2026-09-25');
  assert.ok('error' in await f.actions.registrarPagoServicio('valid',{...input,solicitudId:randomUUID()}));
 }finally{await f.db.close()}
});

test('transferencia sin referencia guarda, concilia y reintenta una sola vez; referencia repetida sigue bloqueada',async()=>{
 const f=await fixture();try{
  const input={origen:'CITA' as const,origenId:'1',fecha:'2026-09-26',solicitudId:randomUUID(),confirmado:true,lineas:[{metodoPago:'TRANSFERENCIA' as const,monto:'50000',referencia:''}]};
  assert.ok('ids' in await f.actions.registrarPagoServicio('valid',input));
  assert.ok('ids' in await f.actions.registrarPagoServicio('valid',input));
  assert.equal(await f.count('MovimientoCaja'),1);assert.equal(await f.count('PagoServicioPsicologia'),1);
  assert.equal((await f.db.query<{estadoPago:string}>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE id=1`)).rows[0].estadoPago,'CONCILIADO');
  const p={...input,origen:'PAQUETE' as const,origenId:'3',solicitudId:randomUUID(),abonoConfirmado:true,lineas:[{metodoPago:'TRANSFERENCIA' as const,monto:'20000',referencia:'TX-UNICA'}]};
  assert.ok('ids' in await f.actions.registrarPagoServicio('valid',p));
  assert.ok('error' in await f.actions.registrarPagoServicio('valid',{...p,solicitudId:randomUUID()}));
  assert.equal(await f.count('MovimientoCaja'),2);
 }finally{await f.db.close();}
});

test("alquileres cancelados salen de pendientes y alquileres sin citas quedan en revisión sin cobro ordinario", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "PaqueteAdquirido"(id,"tenantId","usuarioId","catalogoId","fechaCompra","precioPagado",estado)
      VALUES(20,4,10,49,'2026-09-26T15:00:00Z',18900,'ACTIVO'),
        (21,4,10,49,'2026-09-26T15:00:00Z',18900,'ACTIVO'),
        (22,4,10,49,'2026-09-26T15:00:00Z',18900,'ACTIVO'),
        (23,4,10,49,'2026-09-26T15:00:00Z',18900,'ACTIVO');
      INSERT INTO "CitasPsicologos"(id,"tenantId","empresaId","paqueteId",realizada,valor,"estadoPago")
      VALUES(20,4,3,20,NULL,18900,'PENDIENTE'),(22,9,3,22,false,18900,'PENDIENTE'),(23,4,2,23,false,18900,'PENDIENTE');`);
    const result = await f.actions.getPendientesPsicologia("valid", "2026-09-30");
    assert.ok("items" in result, JSON.stringify(result));
    if (!("items" in result)) return;
    assert.ok(result.items.some((item) => item.origen === "PAQUETE" && item.id === "3"));
    assert.ok(!result.items.some((item) => item.origen === "PAQUETE" && ["20","22","23"].includes(item.id)));
    const unassigned = result.items.find((item) => item.origen === "PAQUETE" && item.id === "21");
    assert.equal(unassigned?.situacion, "REVISAR_ALQUILER");
    assert.equal(unassigned?.alquilerSinReserva, true);
    for (const id of ["20","21","22","23"]) {
      const payment = await f.actions.registrarPagoServicio("valid", { origen: "PAQUETE", origenId: id, fecha: "2026-09-26",
        solicitudId: randomUUID(), confirmado: true, historicoRevisado: true,
        lineas: [{ metodoPago: "EFECTIVO", monto: "18900", referencia: "" }] });
      assert.ok("error" in payment);
      if ("error" in payment) assert.match(payment.error, id === "21" ? /reserva vinculada/ : /reserva vigente/);
    }
    assert.equal(await f.count("MovimientoCaja"), 0);
    assert.equal(await f.count("PagoServicioPsicologia"), 0);
    assert.equal(await f.count("Auditoria"), 0);
  } finally { await f.db.close(); }
});

test("alquiler compartido con historia cancelada permanece visible en revisión y bloquea el cobro de cita 2708", async () => {
  const f = await fixture();
  try {
    const baseline = await f.actions.getPendientesPsicologia("valid", "2026-09-30");
    assert.ok("summary" in baseline);
    await f.db.exec(`INSERT INTO "PaqueteAdquirido"(id,"tenantId","usuarioId","catalogoId","fechaCompra","precioPagado",estado)
      VALUES(2013,4,10,49,'2026-09-26T15:00:00Z',56700,'ACTIVO');
      INSERT INTO "CitasPsicologos"(id,"tenantId","empresaId","paqueteId",realizada,valor,"estadoPago")
      VALUES(2498,4,3,2013,NULL,56700,'PENDIENTE'),(2708,4,3,2013,true,18900,'PENDIENTE');`);
    const direct = await f.actions.getCobroDesdeCita("valid", "2708");
    assert.ok("error" in direct);
    if ("error" in direct) assert.match(direct.error, /compartido.*valor contratado/);
    const open = await f.actions.getPendientesPsicologia("valid", "2026-09-30");
    assert.ok("items" in open, JSON.stringify(open));
    if (!("items" in open) || !("summary" in baseline)) return;
    assert.equal(open.items.find((item) => item.origen === "PAQUETE" && item.id === "2013")?.situacion, "REVISAR_ALQUILER");
    assert.equal(open.summary.revisarAlquiler, 1);
    assert.equal(open.summary.vencidos, baseline.summary.vencidos);
    assert.equal(open.summary.valorVencido, baseline.summary.valorVencido);
    assert.equal(open.summary.legado, baseline.summary.legado);
    for (const monto of ["56700", "18900"]) {
      const payment = await f.actions.registrarPagoServicio("valid", { origen: "PAQUETE", origenId: "2013", fecha: "2026-09-26",
        solicitudId: randomUUID(), confirmado: true, historicoRevisado: true, abonoConfirmado: true,
        lineas: [{ metodoPago: "EFECTIVO", monto, referencia: "" }] });
      assert.ok("error" in payment);
      if ("error" in payment) assert.match(payment.error, /compartido/);
    }
    assert.equal(await f.count("MovimientoCaja"), 0);
    assert.equal(await f.count("PagoServicioPsicologia"), 0);
    assert.equal(await f.count("Auditoria"), 0);
    assert.equal((await f.db.query<{ precio: string }>(`SELECT "precioPagado"::text AS precio FROM "PaqueteAdquirido" WHERE id=2013`)).rows[0].precio, "56700.00");
    assert.deepEqual((await f.db.query<{ estadoPago: string }>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE "paqueteId"=2013 ORDER BY id`)).rows.map((row) => row.estadoPago), ["PENDIENTE", "PENDIENTE"]);
  } finally { await f.db.close(); }
});

test("alquiler cuenta referencias de otras entidades y rechaza catálogo ajeno antes de cobrar", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "PaqueteAdquirido"(id,"tenantId","usuarioId","catalogoId","fechaCompra","precioPagado",estado)
      VALUES(30,4,10,49,'2026-09-26T15:00:00Z',18900,'ACTIVO'),(31,4,10,50,'2026-09-26T15:00:00Z',18900,'ACTIVO'),
        (32,4,10,51,'2026-09-26T15:00:00Z',18900,'ACTIVO');
      INSERT INTO "CitasPsicologos"(id,"tenantId","empresaId","paqueteId",realizada,valor,"estadoPago")
      VALUES(30,4,3,30,false,18900,'PENDIENTE'),(300,9,2,30,NULL,18900,'PENDIENTE'),
        (31,4,3,31,false,18900,'PENDIENTE'),(32,4,3,32,false,18900,'PENDIENTE');`);
    const open = await f.actions.getPendientesPsicologia("valid", "2026-09-30");
    assert.ok("items" in open);
    if ("items" in open) {
      assert.equal(open.items.find((item) => item.origen === "PAQUETE" && item.id === "30")?.situacion, "REVISAR_ALQUILER");
      assert.ok(!open.items.some((item) => item.origen === "PAQUETE" && ["31","32"].includes(item.id)));
    }
    for (const id of ["30","31","32"]) {
      const direct = await f.actions.getCobroDesdeCita("valid", id);
      assert.ok("error" in direct);
      const payment = await f.actions.registrarPagoServicio("valid", { origen: "PAQUETE", origenId: id, fecha: "2026-09-26",
        solicitudId: randomUUID(), confirmado: true, lineas: [{ metodoPago: "EFECTIVO", monto: "18900", referencia: "" }] });
      assert.ok("error" in payment);
      if ("error" in payment) assert.match(payment.error, id === "30" ? /compartido/ : /catálogo/);
    }
    assert.equal(await f.count("MovimientoCaja"), 0);
    assert.equal(await f.count("PagoServicioPsicologia"), 0);
  } finally { await f.db.close(); }
});

test("alquiler propio cobra una vez y un reintento exacto conserva el ingreso aunque cambie su vínculo después", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "PaqueteAdquirido"(id,"tenantId","usuarioId","catalogoId","fechaCompra","precioPagado",estado)
      VALUES(40,4,10,49,'2026-09-26T15:00:00Z',18900,'ACTIVO');
      INSERT INTO "CitasPsicologos"(id,"tenantId","empresaId","paqueteId",realizada,valor,"estadoPago")
      VALUES(40,4,3,40,false,18900,'PENDIENTE');`);
    const direct = await f.actions.getCobroDesdeCita("valid", "40");
    assert.ok("item" in direct, JSON.stringify(direct));
    if ("item" in direct) assert.equal(direct.item.valor, "18900.00");
    const input = { origen: "PAQUETE" as const, origenId: "40", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "TRANSFERENCIA" as const, monto: "18900", referencia: "RENTAL-40" }] };
    const paid = await f.actions.registrarPagoServicio("valid", input);
    assert.ok("ids" in paid, JSON.stringify(paid));
    assert.equal((await f.db.query<{ estadoPago: string }>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE id=40`)).rows[0].estadoPago, "CONCILIADO");
    await f.db.exec(`INSERT INTO "CitasPsicologos"(id,"tenantId","empresaId","paqueteId",realizada,valor,"estadoPago")
      VALUES(41,4,3,40,NULL,18900,'PENDIENTE');`);
    assert.equal(JSON.stringify(await f.actions.registrarPagoServicio("valid", input)), JSON.stringify(paid));
    const open = await f.actions.getPendientesPsicologia("valid", "2026-09-30");
    assert.ok("items" in open);
    if ("items" in open) {
      const sharedPaid = open.items.find((item) => item.origen === "PAQUETE" && item.id === "40");
      assert.equal(sharedPaid?.situacion, "REVISAR_ALQUILER");
      assert.equal(sharedPaid?.registrado, "18900.00");
    }
    const noDirect = await f.actions.getCobroDesdeCita("valid", "40");
    assert.ok("error" in noDirect);
    const newPayment = await f.actions.registrarPagoServicio("valid", { ...input, solicitudId: randomUUID() });
    assert.ok("error" in newPayment);
    if ("error" in newPayment) assert.match(newPayment.error, /compartido/);
    assert.equal(await f.count("MovimientoCaja"), 1);
    assert.equal(await f.count("PagoServicioPsicologia"), 1);
  } finally { await f.db.close(); }
});

test("alquiler con una sola cita bloquea precio heredado, contrato múltiple o valor sin confirmar sin escribir dinero", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "PaqueteAdquirido"(id,"tenantId","usuarioId","catalogoId","fechaCompra","precioPagado",estado,"sesionesTotales")
      VALUES(60,4,10,49,'2026-09-26T15:00:00Z',56700,'ACTIVO',1),
        (61,4,10,49,'2026-09-26T15:00:00Z',18900,'ACTIVO',2),
        (62,4,10,49,'2026-09-26T15:00:00Z',0,'ACTIVO',1),
        (63,4,10,49,'2026-09-26T15:00:00Z',18900,'ACTIVO',1);
      INSERT INTO "CitasPsicologos"(id,"tenantId","empresaId","paqueteId",realizada,valor,"estadoPago")
      VALUES(60,4,3,60,false,18900,'PENDIENTE'),(61,4,3,61,false,18900,'PENDIENTE'),
        (62,4,3,62,false,18900,'PENDIENTE'),(63,4,3,63,false,0,'PENDIENTE');`);
    const open = await f.actions.getPendientesPsicologia("valid", "2026-09-30");
    assert.ok("items" in open);
    for (const id of ["60","61","62","63"]) {
      if ("items" in open) {
        const reviewItem: { situacion: string; alquilerContratoInconsistente?: boolean } | undefined = open.items.find((row) => row.origen === "PAQUETE" && row.id === id);
        assert.equal(reviewItem?.situacion, "REVISAR_ALQUILER");
        assert.equal(reviewItem?.alquilerContratoInconsistente, true);
      }
      assert.ok("error" in await f.actions.getCobroDesdeCita("valid", id));
      const payment = await f.actions.registrarPagoServicio("valid", { origen: "PAQUETE", origenId: id, fecha: "2026-09-26",
        solicitudId: randomUUID(), confirmado: true, historicoRevisado: true, abonoConfirmado: true,
        lineas: [{ metodoPago: "EFECTIVO", monto: "18900", referencia: "" }] });
      assert.ok("error" in payment);
      if ("error" in payment) assert.match(payment.error, /contrato y el valor/);
    }
    if ("items" in open) assert.equal(open.summary.revisarAlquiler, 4);
    assert.equal(await f.count("MovimientoCaja"), 0);
    assert.equal(await f.count("PagoServicioPsicologia"), 0);
    assert.equal(await f.count("Auditoria"), 0);
  } finally { await f.db.close(); }
});

test("precio inconsistente de alquiler ya pagado permanece en revisión sin cambiar el ingreso ni repetirlo", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "PaqueteAdquirido"(id,"tenantId","usuarioId","catalogoId","fechaCompra","precioPagado",estado)
      VALUES(64,4,10,49,'2026-09-26T15:00:00Z',18900,'ACTIVO');
      INSERT INTO "CitasPsicologos"(id,"tenantId","empresaId","paqueteId",realizada,valor,"estadoPago")
      VALUES(64,4,3,64,true,18900,'PENDIENTE');`);
    const input = { origen: "PAQUETE" as const, origenId: "64", fecha: "2026-09-26", solicitudId: randomUUID(), confirmado: true,
      lineas: [{ metodoPago: "EFECTIVO" as const, monto: "18900", referencia: "" }] };
    const paid = await f.actions.registrarPagoServicio("valid", input);
    assert.ok("ids" in paid);
    await f.db.exec(`UPDATE "PaqueteAdquirido" SET "precioPagado"=5000 WHERE id=64`);
    const open = await f.actions.getPendientesPsicologia("valid", "2026-09-30");
    assert.ok("items" in open);
    if ("items" in open) {
      const item = open.items.find((item) => item.origen === "PAQUETE" && item.id === "64");
      assert.equal(item?.situacion, "REVISAR_ALQUILER");
      assert.equal(item?.alquilerContratoInconsistente, true);
      assert.equal(item?.registrado, "18900.00");
    }
    assert.ok("error" in await f.actions.getCobroDesdeCita("valid", "64"));
    const declined = await f.actions.registrarPagoServicio("valid", { ...input, solicitudId: randomUUID() });
    assert.ok("error" in declined);
    if ("error" in declined) assert.match(declined.error, /contrato y el valor/);
    assert.equal(JSON.stringify(await f.actions.registrarPagoServicio("valid", input)), JSON.stringify(paid));
    assert.equal(await f.count("MovimientoCaja"), 1);
    assert.equal(await f.count("PagoServicioPsicologia"), 1);
    assert.equal((await f.db.query<{ estadoPago: string }>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE id=64`)).rows[0].estadoPago, "CONCILIADO");
  } finally { await f.db.close(); }
});

test("terapia de varias sesiones conserva recaudo sin citas o con citas solo canceladas", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "PaqueteAdquirido"(id,"tenantId","clienteId","catalogoId","fechaCompra","precioPagado",estado)
      VALUES(50,4,100,1,'2026-09-26T15:00:00Z',90000,'ACTIVO');
      INSERT INTO "CitasPsicologos"(id,"tenantId","empresaId","paqueteId",realizada,valor,"estadoPago")
      VALUES(50,4,3,50,NULL,30000,'PENDIENTE');`);
    const open = await f.actions.getPendientesPsicologia("valid", "2026-09-30");
    assert.ok("items" in open);
    if ("items" in open) for (const id of ["3","50"]) assert.equal(open.items.find((item) => item.origen === "PAQUETE" && item.id === id)?.situacion, "PENDIENTE");
    for (const id of ["3","50"]) {
      const payment = await f.actions.registrarPagoServicio("valid", { origen: "PAQUETE", origenId: id, fecha: "2026-09-26",
        solicitudId: randomUUID(), confirmado: true, lineas: [{ metodoPago: "EFECTIVO", monto: "90000", referencia: "" }] });
      assert.ok("ids" in payment, JSON.stringify(payment));
    }
    assert.equal(await f.count("MovimientoCaja"), 2);
    assert.equal(await f.count("PagoServicioPsicologia"), 2);
    assert.equal((await f.db.query<{ estadoPago: string }>(`SELECT "estadoPago" FROM "CitasPsicologos" WHERE id=50`)).rows[0].estadoPago, "PENDIENTE");
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
