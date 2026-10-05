import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {loadServerModule} from './load-server-module';
import type * as Operator from '../lib/psychology-bot-operator';
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE "Usuario" (id SERIAL PRIMARY KEY,"tenantId" INT,"empresaId" INT,username TEXT UNIQUE,email TEXT UNIQUE,password TEXT,nombre TEXT,apellido TEXT,rol TEXT,activo BOOLEAN,aprobado BOOLEAN);
 CREATE TABLE "PsicologiaBotConfig" (id INT PRIMARY KEY);INSERT INTO "PsicologiaBotConfig" VALUES(4);`);
 await db.exec(readFileSync('docs/sql/2026-10-05-luisa-operator-scheduling.sql','utf8'));
 const audits:any[]=[];let hashes=0;let failAudit=false;
 const raw=(s:TemplateStringsArray,...v:unknown[])=>db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v);
 const tx={
  $queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).rows,
  $executeRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).affectedRows,
  usuario:{findFirst:async()=>(await db.query(`SELECT id FROM "Usuario" WHERE username='luisa.fernanda.bot' OR email='luisa.fernanda.bot@automation.invalid'`)).rows[0],create:async({data}:any)=>(await db.query(`INSERT INTO "Usuario" ("tenantId","empresaId",username,email,password,nombre,apellido,rol,activo,aprobado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[data.tenantId,data.empresaId,data.username,data.email,data.password,data.nombre,data.apellido,data.rol,data.activo,data.aprobado])).rows[0]},
 };
 const api=loadServerModule<typeof Operator>('lib/psychology-bot-operator.ts',{'node:crypto':{randomBytes},bcrypt:{hash:async(secret:string,rounds:number)=>{assert.ok(secret.length>=60);assert.equal(rounds,12);hashes++;return 'one-way-hash'}},'./audit':{createAuditLog:async(a:any)=>{if(failAudit)throw Error('AUDIT_FAILED');audits.push(a)}}});
 return {db,tx,api,audits,get hashes(){return hashes},set failAudit(v:boolean){failAudit=v}};
}
test('own Luisa service identity is created once, scoped to company 3 and audited without a usable password',async()=>{
 const f=await fixture();try{
  const first=await f.api.provisionLuisaOperator(f.tx as never);assert.equal(first.created,true);assert.equal(first.operator.username,'luisa.fernanda.bot');assert.equal(first.operator.role,'ASESOR');
  const second=await f.api.provisionLuisaOperator(f.tx as never);assert.equal(second.created,false);assert.equal(f.hashes,1);assert.equal(f.audits.length,1);
  const user=(await f.db.query<any>('SELECT * FROM "Usuario"')).rows[0];assert.equal(user.tenantId,4);assert.equal(user.empresaId,3);assert.equal(user.password,'one-way-hash');
  assert.equal(f.audits[0].usuarioId,user.id);assert.equal(f.audits[0].detalles.financialWrites,false);assert.equal(JSON.stringify(first).includes('password'),false);
 }finally{await f.db.close()}
});
test('disabled operator, altered scope or role fail closed and cannot be recreated to bypass suspension',async()=>{
 const f=await fixture();try{
  await f.api.provisionLuisaOperator(f.tx as never);
  for(const sql of [`UPDATE "Usuario" SET activo=false`,`UPDATE "Usuario" SET "empresaId"=2`,`UPDATE "Usuario" SET "tenantId"=8`,`UPDATE "Usuario" SET rol='ADMIN'`,`UPDATE "PsicologiaBotOperator" SET enabled=false`]){
   await f.db.exec('BEGIN');await f.db.exec(sql);assert.equal(await f.api.readLuisaOperator(f.tx as never),null);await assert.rejects(()=>f.api.provisionLuisaOperator(f.tx as never),/REQUIRES_REVIEW/);await f.db.exec('ROLLBACK');
  }
 }finally{await f.db.close()}
});
test('an existing unbound username is preserved; audit failure rolls back the account and binding',async()=>{
 const f=await fixture();try{
  await f.db.exec(`INSERT INTO "Usuario" (username) VALUES ('luisa.fernanda.bot')`);await assert.rejects(()=>f.api.provisionLuisaOperator(f.tx as never),/COLLISION/);
  await f.db.exec('DELETE FROM "Usuario"');f.failAudit=true;await f.db.exec('BEGIN');await assert.rejects(()=>f.api.provisionLuisaOperator(f.tx as never),/AUDIT_FAILED/);await f.db.exec('ROLLBACK');
  assert.equal((await f.db.query('SELECT id FROM "Usuario"')).rows.length,0);assert.equal((await f.db.query('SELECT id FROM "PsicologiaBotOperator"')).rows.length,0);
 }finally{await f.db.close()}
});
