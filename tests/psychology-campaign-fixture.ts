import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
export async function campaignFixture(db:PGlite){
 await db.exec(`CREATE TABLE IF NOT EXISTS "Usuario" (id INT PRIMARY KEY,"tenantId" INT,"empresaId" INT,activo BOOLEAN,rol TEXT,telefono TEXT);
 CREATE TABLE "TerapiasPsicologos"(id BIGINT PRIMARY KEY,"tenantId" INT,"empresaId" INT,nombre TEXT);
 CREATE TABLE "PaqueteAdquirido"(id BIGINT PRIMARY KEY,"tenantId" INT,"clienteId" INT,"usuarioId" INT,"catalogoId" BIGINT,estado TEXT,"fechaCompra" TIMESTAMPTZ);
 CREATE TABLE "CargoRecepcion"(id BIGINT PRIMARY KEY,"tenantId" INT,"profesionalId" INT,fecha TIMESTAMPTZ,anulado BOOLEAN);
 ALTER TABLE "CitasPsicologos" ADD COLUMN IF NOT EXISTS "psicologoId" INT;
 ALTER TABLE "CitasPsicologos" ADD COLUMN IF NOT EXISTS "paqueteId" BIGINT;`);
 await db.exec(readFileSync('docs/sql/2026-09-28-psychology-campaign-pacing.sql','utf8'));
}
export function sqlTx(db:Pick<PGlite,'query'>){
 const query=(s:TemplateStringsArray,...v:unknown[])=>db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v);
 return {$queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await query(s,...v)).rows,$executeRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await query(s,...v)).affectedRows,auditoria:{create:async()=>({})}};
}
