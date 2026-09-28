import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {loadServerModule} from './load-server-module';
import * as reception from '../lib/psychology-reception';
import {parseUnderstanding,understandingSchema,type Understanding} from '../lib/psychology-ai';
import type * as Intake from '../lib/psychology-patient-intake';
import type * as Returning from '../lib/psychology-returning-patient';
const base=Object.fromEntries(Object.keys(understandingSchema.properties).map(k=>[k,null]));
const understand=(data:Partial<Understanding>={})=>parseUnderstanding({...base,additionalServices:[],rentalRequests:[],confidence:0.99,intent:'accept',explicitConsent:false,...data});
const event:reception.ReceptionEvent={id:'returning-contract',phone:'34600111222',kind:'text',text:'Me fue muy bien en la primera sesión, por eso decido continuar con la señorita Deicy',fromMe:false,at:new Date().toISOString()};
async function fixture(){
 const db=new PGlite();await db.exec(`
 CREATE TABLE "Cliente" (id INT,"tenantId" INT,"empresaId" INT,telefono TEXT,telefono2 TEXT,"deletedAt" TIMESTAMPTZ);
 CREATE TABLE "Usuario" (id INT,nombre TEXT,activo BOOLEAN,rol TEXT,"tenantId" INT,"empresaId" INT);
 CREATE TABLE "CitasPsicologos" (id BIGINT,"tenantId" INT,"empresaId" INT,"pacienteId" INT,"psicologoId" INT,"paqueteId" BIGINT,realizada BOOLEAN,"fechaCita" TIMESTAMPTZ,"horaInicio" TIMESTAMPTZ);
 CREATE TABLE "PaqueteAdquirido" (id BIGINT,"tenantId" INT,"clienteId" INT,"catalogoId" BIGINT);
 CREATE TABLE "TerapiasPsicologos" (id BIGINT,"tenantId" INT,"empresaId" INT,nombre TEXT);
 INSERT INTO "Cliente" VALUES (11,4,NULL,'+34 600 111 222',NULL,NULL);
 INSERT INTO "Usuario" VALUES (8,'Deicy',true,'TECNICO',4,NULL);
 INSERT INTO "CitasPsicologos" VALUES (21,4,3,11,8,31,true,NOW()-INTERVAL '1 day',NOW()-INTERVAL '1 day');
 INSERT INTO "PaqueteAdquirido" VALUES (31,4,11,41);
 INSERT INTO "TerapiasPsicologos" VALUES (41,4,3,'Terapia individual');`);
 const audit:any[]=[];let reads=0;
 const tx={$queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>{reads++;return (await db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v)).rows;}};
 const mocks={'./psychology-reception':reception,'./audit':{createAuditLog:async(data:unknown)=>{audit.push(data)}}};
 const intake=loadServerModule<typeof Intake>('lib/psychology-patient-intake.ts',mocks);
 const api=loadServerModule<typeof Returning>('lib/psychology-returning-patient.ts',{...mocks,'./psychology-patient-intake':intake});
 const run=(u:Partial<Understanding>={},text=event.text,stage='NEW',state:reception.ReceptionState={})=>api.handleReturningPatient(tx as never,{...event,text},stage,state,understand(u));
 return {db,tx,audit,intake,api,run,get reads(){return reads}};
}
test('returning caller reuses a scoped legacy record and requested prior professional; no patient, booking or payment writes',async()=>{
 const f=await fixture();try{
  const r=await f.run();assert.equal(r?.stage,'PREFERENCES');assert.equal(r?.state.intake?.clientId,11);assert.equal(r?.state.intake?.professionalId,8);
  assert.equal(r?.state.intake?.priorServiceId,'41');assert.ok(r?.messages[0].includes('presencial'));assert.ok(!r?.handoff);assert.equal(f.audit.length,1);
  assert.equal(f.audit[0].detalles.patientChanged,false);assert.equal(f.audit[0].detalles.appointmentCreated,false);
  let next=await f.intake.handlePatientIntake(f.tx as never,event,r!.stage,r!.state,understand({intent:'preferences',modality:'virtual'}));
  assert.ok(next?.messages[0].includes('fecha'));
  next=await f.intake.handlePatientIntake(f.tx as never,event,next!.stage,next!.state,understand({intent:'preferences',date:new Date(Date.now()+2*86400000).toISOString().slice(0,10),start:'15:00'}));
  assert.equal(next?.stage,'HUMAN');assert.ok(next?.handoff?.includes('profesional solicitado Axis 8'));assert.ok(next?.handoff?.includes('saldo del paquete antes de cobrar'));
  assert.ok(!next?.messages.join(' ').includes('20.000'));assert.equal(f.reads,3);
 }finally{await f.db.close()}
});
test('local Colombian phones and a verified alternative number match without requiring an international prefix in storage',async()=>{
 const f=await fixture();try{
  await f.db.exec(`UPDATE "Cliente" SET telefono='300 111 1111',telefono2='301 222 3333'`);
  for(const phone of ['573001111111','573012223333']){
   const r=await f.api.handleReturningPatient(f.tx as never,{...event,phone},'NEW',{},understand());assert.equal(r?.state.intake?.clientId,11);
  }
 }finally{await f.db.close()}
});
test('identity, company, prior care and professional inconsistencies require review without disclosing a record',async()=>{
 for(const mutation of [
  `INSERT INTO "Cliente" VALUES (12,4,3,'34600111222',NULL,NULL); INSERT INTO "CitasPsicologos" SELECT 22,4,3,12,8,31,true,NOW()-INTERVAL '1 day',NOW()-INTERVAL '1 day'`,
  `UPDATE "Cliente" SET "empresaId"=2`, `UPDATE "Cliente" SET "tenantId"=8`, `UPDATE "Cliente" SET "deletedAt"=NOW()`,
  `UPDATE "CitasPsicologos" SET "empresaId"=2`, `UPDATE "CitasPsicologos" SET realizada=false`,
  `UPDATE "Usuario" SET activo=false`, `UPDATE "Usuario" SET "empresaId"=2`, `UPDATE "Usuario" SET "tenantId"=8`,
  `UPDATE "PaqueteAdquirido" SET "clienteId"=12`, `UPDATE "TerapiasPsicologos" SET "empresaId"=2`,
  `UPDATE "TerapiasPsicologos" SET nombre='Alquiler de consultorio'`,
 ]){
  const f=await fixture();try{await f.db.exec(mutation);const r=await f.run();assert.equal(r?.stage,'HUMAN',mutation);assert.equal(f.audit.length,0);assert.ok(!r?.messages[0].includes('11'));}finally{await f.db.close()}
 }
});
test('an existing future appointment prevents a second intake proposal; a cancelled appointment does not',async()=>{
 const f=await fixture();try{
  await f.db.exec(`INSERT INTO "CitasPsicologos" VALUES (23,4,3,11,8,31,false,NOW()+INTERVAL '1 day',NOW()+INTERVAL '1 day')`);
  const r=await f.run();assert.equal(r?.stage,'HUMAN');assert.ok(r?.handoff?.includes('cita futura'));assert.equal(f.audit.length,0);
  await f.db.exec('UPDATE "CitasPsicologos" SET realizada=NULL WHERE id=23');assert.equal((await f.run())?.stage,'PREFERENCES');
 }finally{await f.db.close()}
});
test('an unspecified, negated or changed professional is not silently assigned to the previous provider',async()=>{
 const f=await fixture();try{
  for(const text of ['Quiero continuar','Quiero continuar, pero no con Deicy','Quiero continuar con otra psicóloga, diferente a Deicy']){
   const r=await f.run({},text);assert.equal(r?.state.intake?.professionalId,undefined);assert.ok(r?.messages[0].includes('psicólogo, psicóloga'));
  }
  let r=await f.run();
  let next=await f.intake.handlePatientIntake(f.tx as never,event,r!.stage,r!.state,understand({intent:'preferences',professionalId:99}));assert.equal(next?.stage,'HUMAN');
  next=await f.intake.handlePatientIntake(f.tx as never,event,r!.stage,r!.state,understand({intent:'preferences',professionalPreference:'male'}));assert.equal(next?.state.intake?.professionalId,undefined);assert.equal(next?.state.intake?.preference,'male');
 }finally{await f.db.close()}
});
test('human takeover, urgencies, stop, outbound, chief and ambiguous messages cannot enter this path',async()=>{
 const f=await fixture();try{
  for(const stage of ['HUMAN','STOPPED','DATA','PREFERENCES'])assert.equal(await f.run({},event.text,stage),null);
  for(const u of [{intent:'urgent'},{intent:'stop'},{confidence:0.8},{service:'individual'}] as Partial<Understanding>[])assert.equal(await f.run(u),null);
  for(const patch of [{fromMe:true},{phone:reception.SANDRA_PHONE},{phone:reception.PSYCHOLOGY_PHONE},{phone:'invalid'},{kind:'audio' as const}])assert.equal(await f.api.handleReturningPatient(f.tx as never,{...event,...patch},'NEW',{},understand()),null);
  assert.equal(await f.run({},'No quiero continuar'),null);assert.equal(await f.run({},event.text,'NEW',{service:'alquiler'}),null);
  assert.equal(f.reads,0);assert.equal(f.audit.length,0);
 }finally{await f.db.close()}
});
