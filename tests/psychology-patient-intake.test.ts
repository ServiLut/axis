import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {loadServerModule} from './load-server-module';
import * as reception from '../lib/psychology-reception';
import {parseUnderstanding,understandingSchema,type Understanding} from '../lib/psychology-ai';
import type * as Intake from '../lib/psychology-patient-intake';
const base=Object.fromEntries(Object.keys(understandingSchema.properties).map(k=>[k,null]));
const understand=(data:Partial<Understanding>={})=>parseUnderstanding({...base,additionalServices:[],rentalRequests:[],roomPreferenceChanges:[],confidence:0.99,intent:'data',explicitConsent:false,...data});
const full={firstName:'Ana María',lastName:'Pérez López',documentType:'CC',document:'12345678',email:'ana@example.test',address:'Calle 10 # 20-30'};
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE "Cliente" (id SERIAL PRIMARY KEY,"tenantId" INT,"empresaId" INT,nombre TEXT,apellido TEXT,"numeroDocumento" TEXT,"tipoDocumento" TEXT,telefono TEXT,telefono2 TEXT,correo TEXT,"deletedAt" TIMESTAMPTZ);
 CREATE TABLE "PsicologiaBotOutbox" (id TEXT,phone TEXT,status TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW());`);
 await db.exec('CREATE TABLE "CitasPsicologos" ("pacienteId" INT,"tenantId" INT,"empresaId" INT)');
 const audit:unknown[]=[];let creates=0;let stage='DATA';let state:reception.ReceptionState={service:'individual'};let seq=0;
 const raw=(s:TemplateStringsArray,...v:unknown[])=>db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v);
 const tx={
  $queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).rows,
  cliente:{create:async({data}:{data:any})=>{
   assert.equal(data.tenantId,4);assert.equal(data.empresaId,3);assert.equal(data.telefono,'573001111111');assert.equal(data.direcciones.create.tenantId,4);
   creates++;const r=await db.query<{id:number}>('INSERT INTO "Cliente" ("tenantId","empresaId",nombre,apellido,"numeroDocumento","tipoDocumento",telefono,correo) VALUES (4,3,$1,$2,$3,$4,$5,$6) RETURNING id',[data.nombre,data.apellido,data.numeroDocumento,data.tipoDocumento,data.telefono,data.correo]);return r.rows[0];
  }},
 };
 const api=loadServerModule<typeof Intake>('lib/psychology-patient-intake.ts',{'./psychology-reception':reception,'./psychology-bot-operator':{requireLuisaOperator:async()=>({id:900,username:'luisa.fernanda.bot'})},'./psychology-patient-scheduling':{},'./audit':{createAuditLog:async(data:unknown)=>{audit.push(data)}}});
 const step=async(data:Partial<Understanding>,text='dato',acceptedSummary=true)=>{
  const event={id:'intake-'+(++seq),phone:'573001111111',kind:'text' as const,text,fromMe:false,at:new Date(Date.now()+10).toISOString()};
  const result=await api.handlePatientIntake(tx as never,event,stage,state,understand(data));
  if(result){stage=result.stage;state=result.state;if(stage==='DATA_CONFIRM'&&state.intake?.summaryEvent===event.id&&acceptedSummary)await db.query('INSERT INTO "PsicologiaBotOutbox" (id,phone,status) VALUES ($1,$2,$3)',[event.id+':reply:0',event.phone,'ACCEPTED']);}
  return result;
 };
 return {db,api,tx,audit,step,get state(){return state},get stage(){return stage},get creates(){return creates}};
}
test('partial patient data is retained; confirmed summary creates one scoped patient and gathers preferences',async()=>{
 const f=await fixture();try{
  let r=await f.step({firstName:full.firstName});assert.equal(r?.stage,'DATA');assert.ok(r?.messages[0].includes('apellidos'));assert.equal(f.creates,0);
  r=await f.step(full);assert.equal(r?.stage,'DATA_CONFIRM');assert.equal(f.creates,0);assert.ok(r?.messages[0].includes(full.email));
  r=await f.step({intent:'confirm',explicitConsent:true},'sí, correctos');assert.equal(f.creates,1);assert.equal(f.audit.length,1);assert.equal(r?.stage,'PREFERENCES');assert.ok(r?.messages.some(m=>m.includes('guardado')));
  r=await f.step({intent:'preferences',professionalPreference:'female'});assert.equal(f.creates,1);assert.ok(r?.messages[0].includes('presencial'));
  r=await f.step({intent:'preferences',modality:'virtual'});assert.ok(r?.messages[0].includes('fecha'));
  r=await f.step({intent:'preferences',date:new Date(Date.now()+86400000).toISOString().slice(0,10),start:'15:00'});assert.equal(r?.stage,'HUMAN');assert.ok(r?.handoff?.includes('Datos ya registrados'));assert.equal(f.creates,1);
 }finally{await f.db.close()}
});
test('changed or undelivered summaries and ambiguous input cannot create a patient',async()=>{
 const f=await fixture();try{
  await f.step(full,'datos',false);let r=await f.step({intent:'confirm',explicitConsent:true},'sí');assert.equal(f.creates,0);assert.equal(r?.stage,'DATA_CONFIRM');
  r=await f.step({intent:'confirm',email:'corregido@example.test',explicitConsent:true},'sí pero cambia el correo');assert.equal(f.creates,0);assert.ok(r?.messages[0].includes('corregido@example.test'));
  r=await f.step({intent:'reject'},'no');assert.equal(r?.stage,'DATA');assert.equal(f.creates,0);assert.ok(!r?.handoff);
  r=await f.step({confidence:0.5},'confuso');assert.equal(r?.stage,'DATA');r=await f.step({confidence:0.5},'confuso');assert.equal(r?.stage,'HUMAN');assert.equal(f.creates,0);
 }finally{await f.db.close()}
});
test('an existing matching patient is reused; mismatches and duplicate matches are not overwritten',async()=>{
 for(const mode of ['match','mismatch','duplicate','legacy','unscoped','otherCompany'] as const){
  const f=await fixture();try{
   await f.db.query('INSERT INTO "Cliente" ("tenantId","empresaId",nombre,apellido,"numeroDocumento","tipoDocumento",telefono) VALUES (4,3,$1,$2,$3,$4,$5)',[mode==='mismatch'?'Otro':full.firstName,full.lastName,full.document,full.documentType,'300 111 1111']);
   if(mode==='duplicate')await f.db.exec(`INSERT INTO "Cliente" ("tenantId","empresaId",telefono) VALUES (4,3,'573001111111')`);
   if(['legacy','unscoped'].includes(mode))await f.db.exec('UPDATE "Cliente" SET "empresaId"=NULL');
   if(mode==='otherCompany')await f.db.exec('UPDATE "Cliente" SET "empresaId"=2');
   if(mode==='legacy')await f.db.exec('INSERT INTO "CitasPsicologos" VALUES (1,4,3)');
   await f.step(full);const r=await f.step({intent:'confirm',explicitConsent:true},'correcto');assert.equal(f.creates,0);assert.equal(r?.stage,['match','legacy'].includes(mode)?'PREFERENCES':'HUMAN');
  }finally{await f.db.close()}
 }
});
test('handoff, sender echoes, urgent messages and other companies do not gain intake write access',async()=>{
 const f=await fixture();try{
  const event={id:'scope-check',phone:'573001111111',kind:'text' as const,text:'mis datos',fromMe:false,at:new Date().toISOString()};
  for(const patch of [{phone:reception.SANDRA_PHONE},{fromMe:true},{kind:'attachment' as const}])assert.equal(await f.api.handlePatientIntake(f.tx as never,{...event,...patch},'DATA',{},understand(full)),null);
  assert.equal(await f.api.handlePatientIntake(f.tx as never,event,'HUMAN',{},understand(full)),null);
  assert.equal(await f.api.handlePatientIntake(f.tx as never,event,'DATA',{},understand({...full,intent:'urgent'})),null);
  await f.db.query('INSERT INTO "Cliente" ("tenantId","empresaId",nombre,telefono) VALUES (8,8,$1,$2)',['No consultar','573001111111']);
  await f.step(full);await f.step({intent:'confirm',explicitConsent:true},'sí');assert.equal(f.creates,1);
 }finally{await f.db.close()}
});
