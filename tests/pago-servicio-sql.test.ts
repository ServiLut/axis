import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("Postgres: un pago debe pertenecer a una cita o paquete y a un solo movimiento", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Tenant"("id" integer PRIMARY KEY);
      CREATE TABLE "Usuario"("id" integer PRIMARY KEY);
      CREATE TABLE "CitasPsicologos"("id" bigint PRIMARY KEY);
      CREATE TABLE "PaqueteAdquirido"("id" bigint PRIMARY KEY);
      INSERT INTO "Tenant" VALUES(4); INSERT INTO "Usuario" VALUES(10);
      INSERT INTO "CitasPsicologos" VALUES(1); INSERT INTO "PaqueteAdquirido" VALUES(2);`);
    await db.exec(readFileSync("docs/sql/2026-09-24-caja-diaria.sql", "utf8"));
    await db.exec(readFileSync("docs/sql/2026-09-26-pagos-servicios.sql", "utf8"));
    await db.exec(`INSERT INTO "MovimientoCaja"("tenantId","creadoPorId","fecha","tipo","metodoPago","monto","concepto","solicitudId")
      VALUES(4,10,'2026-09-26','INGRESO','EFECTIVO',100,'Pago de cita','11111111-1111-4111-8111-111111111111');`);
    const insert = (cita: string, paquete: string, id: number) => db.exec(`INSERT INTO "PagoServicioPsicologia"
      ("tenantId","creadoPorId","citaId","paqueteId","movimientoCajaId","fecha","monto","metodoPago","solicitudId","linea")
      VALUES(4,10,${cita},${paquete},${id},'2026-09-26',100,'EFECTIVO','22222222-2222-4222-8222-222222222222',1);`);
    await assert.rejects(insert("NULL", "NULL", 1));
    await assert.rejects(insert("1", "2", 1));
    await insert("1", "NULL", 1);
    await assert.rejects(insert("1", "NULL", 1));
    const rows = await db.query<{ n: number }>(`SELECT count(*)::integer AS n FROM "PagoServicioPsicologia"`);
    assert.equal(rows.rows[0].n, 1);
    await db.exec(`CREATE ROLE cash_public; GRANT SELECT ON "PagoServicioPsicologia" TO cash_public; SET ROLE cash_public;`);
    const publicRows = await db.query<{ n: number }>(`SELECT count(*)::integer AS n FROM "PagoServicioPsicologia"`);
    assert.equal(publicRows.rows[0].n, 0);
    await db.exec("RESET ROLE");
  } finally { await db.close(); }
});
