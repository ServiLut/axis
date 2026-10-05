import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadServerModule} from './load-server-module';
import * as reception from '../lib/psychology-reception';
import * as bookingMessages from '../lib/psychology-booking-messages';
import * as booking from '../lib/booking';
import {parseUnderstanding,understandingSchema,type Understanding} from '../lib/psychology-ai';
import type * as Scheduling from '../lib/psychology-patient-scheduling';
import type * as Booking from '../lib/psychology-bot-booking';
import type * as Identity from '../lib/psychology-booking-identity';
const base=Object.fromEntries(Object.keys(understandingSchema.properties).map(k=>[k,null]));
const understand=(data:Partial<Understanding>={})=>parseUnderstanding({...base,additionalServices:[],rentalRequests:[],roomPreferenceChanges:[],confidence:.99,intent:'preferences',explicitConsent:false,...data});
const phone='573001111111',professionalPhone='573002222222';
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE "Usuario" (id INT PRIMARY KEY,"tenantId" INT,"empresaId" INT,nombre TEXT,apellido TEXT,telefono TEXT,activo BOOLEAN,rol TEXT);
 CREATE TABLE "Cliente" (id INT PRIMARY KEY,"tenantId" INT,"empresaId" INT,telefono TEXT,telefono2 TEXT,"deletedAt" TIMESTAMPTZ);
 CREATE TABLE "CitasPsicologos" (id BIGINT PRIMARY KEY,"tenantId" INT,"empresaId" INT,"pacienteId" INT,"psicologoId" INT);
 INSERT INTO "Usuario" VALUES (29,4,3,'Profesional','Prueba','${professionalPhone}',true,'TECNICO');
 INSERT INTO "Cliente" VALUES (11,4,3,'${phone}',NULL,NULL);`);
 await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
 await db.exec(readFileSync('docs/sql/2026-10-05-luisa-operator-scheduling.sql','utf8'));
 const audit:any[]=[];let created:any=null,paid=true,held=false,conflict=false,seq=0;
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const service={id:1n,nombre:'Individual (Una sesión)',categoria:'Terapia Individual',precioBase:119900,cantidadSesiones:1};
 let state:reception.ReceptionState={service:'individual',intake:{draft:{},clientId:11,professionalId:29,serviceId:'1',preference:'either',modality:'virtual',date,start:'10:00'}};
 const raw=(s:TemplateStringsArray,...v:unknown[])=>db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v.map(x=>typeof x==='bigint'?String(x):x));
 const tx={
  $queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).rows,
  $executeRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).affectedRows,
  terapiasPsicologos:{findMany:async()=>[service],findFirst:async()=>service},
  usuario:{findMany:async()=>[{id:29,nombre:'Profesional',apellido:'Prueba'}]},
  consultorios:{findMany:async()=>[{id:1n,nombre:'Consultorio 10'},{id:2n,nombre:'Consultorio 11'}],findFirst:async()=>({id:1n,nombre:'Consultorio 10'})},
  citasPsicologos:{count:async()=>0,findMany:async()=>[],create:async({data}:any)=>{created=data;await db.exec('INSERT INTO "CitasPsicologos" (id) VALUES (100)');return {id:100n}}},
  paqueteAdquirido:{findFirst:async()=>paid?{id:1n}:null,updateMany:async()=>({count:1}),create:async()=>({id:1n})},
 };
 const queue=async(_tx:any,id:string,p:string,text:string)=>{await db.query('INSERT INTO "PsicologiaBotOutbox" (id,phone,content) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[id,p,text]);};
 const identity=loadServerModule<typeof Identity>('lib/psychology-booking-identity.ts',{'./psychology-reception':reception});
 const auditMock={createAuditLog:async(d:any)=>{audit.push(d)}};
 const operator={requireLuisaOperator:async()=>{if(held)throw Error('LUISA_OPERATOR_NOT_READY');return {id:900}}};
 const bookingApi=loadServerModule<typeof Booking>('lib/psychology-bot-booking.ts',{'node:crypto':{createHash},'./psychology-reception':reception,'./psychology-booking-identity':identity,'./psychology-booking-messages':bookingMessages,'./psychology-bot-operator':operator,'./audit':auditMock,'./booking-server':{normalizedRental:async()=>null,lockAndValidateBooking:async()=>{if(conflict)throw Error('Occupied')}},'./package-payment':{getPackagePaymentState:async()=>paid?{estadoPago:'CONCILIADO'}:null}});
 const api=loadServerModule<typeof Scheduling>('lib/psychology-patient-scheduling.ts',{'node:crypto':{createHash},'./psychology-reception':reception,'./psychology-bot-operator':operator,'./psychology-booking-identity':identity,'./psychology-bot-booking':bookingApi,'./booking':booking,'./psychology-booking-messages':bookingMessages,'./audit':auditMock});
 const event=(text:string,p=phone,extra:Partial<reception.ReceptionEvent>={}):reception.ReceptionEvent=>({id:'source-'+(++seq),phone:p,text,kind:'text',fromMe:false,at:new Date(Date.now()+20).toISOString(),...extra});
 const sync=async()=>{await db.query('INSERT INTO "PsicologiaBotConversation" (phone,stage,state) VALUES ($1,$2,$3) ON CONFLICT (phone) DO UPDATE SET stage=EXCLUDED.stage,state=EXCLUDED.state',[phone,'PREFERENCES',JSON.stringify(state)]);};
 const step=async(text='solicitud',u:Partial<Understanding>={})=>{const r=await api.schedulePatient(tx as never,event(text),state,state.intake!,understand(u),queue);state=r.state;await sync();return r;};
 const acceptOutbox=async()=>{await db.exec(`UPDATE "PsicologiaBotOutbox" SET status='ACCEPTED',"attemptedAt"=NOW()-INTERVAL '1 minute'`)};
 const answer=async(text='Sí, disponible, una hora',patch:Partial<reception.ReceptionEvent>={},u:Partial<Understanding>={})=>{
  const r=(await db.query<any>('SELECT * FROM "PsicologiaBotAppointmentRequest" ORDER BY "createdAt" DESC LIMIT 1')).rows[0];
  const e=event(text,professionalPhone,{quotedOutboxId:r.questionOutboxId,...patch});
  await db.query('INSERT INTO "PsicologiaBotConversation" (phone) VALUES ($1) ON CONFLICT DO NOTHING',[e.phone]);
  await db.query('INSERT INTO "PsicologiaBotEvent" (id,phone,"eventAt",kind,text,"fromMe") VALUES ($1,$2,$3,$4,$5,$6)',[e.id,e.phone,e.at,e.kind,e.text,e.fromMe]);
  return api.handlePatientAvailability(tx as never,e,understand(u),queue);
 };
 return {db,tx,api,bookingApi,queue,audit,event,step,answer,acceptOutbox,get state(){return state},get created(){return created},set paid(v:boolean){paid=v},set held(v:boolean){held=v},set conflict(v:boolean){conflict=v}};
}
test('new patient path obtains native availability, creates a proposal and saves once with Luisa attribution only after confirmations and paid package',async()=>{
 const f=await fixture();try{
  await f.step();assert.equal(f.created,null);assert.equal((await f.db.query('SELECT id FROM "PsicologiaBotAppointmentRequest"')).rows.length,1);
  await f.step('gracias');assert.equal((await f.db.query('SELECT id FROM "PsicologiaBotAppointmentRequest"')).rows.length,1);
  await f.acceptOutbox();assert.equal(await f.answer(),true);
  const p=(await f.db.query<any>('SELECT * FROM "PsicologiaBotProposal"')).rows[0];assert.ok(p);assert.equal(p.details.end,'11:00');assert.equal(f.created,null);
  for(const sender of [phone,professionalPhone])await f.bookingApi.handleBookingMessage(f.tx as never,f.event('CONFIRMAR '+p.code,sender),f.queue);
  const saved=f.created as Record<string,unknown>|null;assert.ok(saved);assert.equal(saved.creadoPorId,900);assert.equal(saved.tenantId,4);assert.equal(saved.empresaId,3);assert.equal(saved.valor,0);
  assert.ok(f.audit.some(a=>a.accion==='CREATE'&&a.usuarioId===900&&a.detalles.professionalConfirmed));
  await f.bookingApi.handleBookingMessage(f.tx as never,f.event('CONFIRMAR '+p.code,phone),f.queue);
  assert.equal((await f.db.query('SELECT id FROM "CitasPsicologos"')).rows.length,1);
 }finally{await f.db.close()}
});
test('quoted text, wrong sender, staff echo, uncertain send and missing native reply ID cannot supply availability',async()=>{
 const f=await fixture();try{
  await f.step();assert.equal(await f.answer(),false);await f.acceptOutbox();
  for(const patch of [{quotedOutboxId:undefined,quotedText:'Hola. ¿Puedes atender'},{phone:'573009999999'},{fromMe:true},{quotedOutboxId:'another-question'}])assert.equal(await f.answer('Sí, una hora',patch),false);
  assert.equal((await f.db.query('SELECT code FROM "PsicologiaBotProposal"')).rows.length,0);assert.equal(f.created,null);
 }finally{await f.db.close()}
});
test('professional response cannot override patient choice; a human hold blocks automatic continuation',async()=>{
 const f=await fixture();try{
  await f.step();await f.acceptOutbox();await f.db.query(`UPDATE "PsicologiaBotConversation" SET stage='HUMAN' WHERE phone=$1`,[phone]);
  assert.equal(await f.answer(),true);assert.equal((await f.db.query('SELECT code FROM "PsicologiaBotProposal"')).rows.length,0);
  await f.db.query(`UPDATE "PsicologiaBotConversation" SET stage='PREFERENCES' WHERE phone=$1`,[phone]);
  assert.equal(await f.answer('Sí, una hora',{}, {date:'2099-01-01'}),true);
  assert.equal((await f.db.query<any>('SELECT status FROM "PsicologiaBotAppointmentRequest"')).rows[0].status,'REVIEW');assert.equal(f.created,null);
 }finally{await f.db.close()}
});
test('physical appointments present free rooms and require the patient actual choice before proposing',async()=>{
 const f=await fixture();try{
  f.state.intake!.modality='presencial';await f.step();await f.acceptOutbox();await f.answer();
  assert.equal((await f.db.query('SELECT code FROM "PsicologiaBotProposal"')).rows.length,0);
  const state=(await f.db.query<any>('SELECT state FROM "PsicologiaBotConversation" WHERE phone=$1',[phone])).rows[0].state;
  Object.assign(f.state,state);await f.acceptOutbox();await f.step('2');
  const p=(await f.db.query<any>('SELECT details FROM "PsicologiaBotProposal"')).rows[0];assert.equal(p.details.roomId,'2');assert.equal(f.created,null);
 }finally{await f.db.close()}
});
test('service and professional option numbers are bound to an accepted own preceding offer',async()=>{
 const f=await fixture();try{
  delete f.state.intake!.serviceId;delete f.state.intake!.professionalId;
  await f.step('1');assert.equal(f.state.intake!.serviceId,undefined);await f.acceptOutbox();await f.step('1');assert.equal(f.state.intake!.serviceId,'1');
  assert.equal(f.state.intake!.professionalId,undefined);await f.acceptOutbox();await f.step('1');assert.equal(f.state.intake!.professionalId,29);
  assert.equal((await f.db.query('SELECT id FROM "PsicologiaBotAppointmentRequest"')).rows.length,1);
 }finally{await f.db.close()}
});
test('unverified payment and a changed calendar cannot create an autonomous appointment',async()=>{
 const f=await fixture();try{
  f.paid=false;await f.step();await f.acceptOutbox();await f.answer();const p=(await f.db.query<any>('SELECT code FROM "PsicologiaBotProposal"')).rows[0];
  for(const sender of [phone,professionalPhone])await f.bookingApi.handleBookingMessage(f.tx as never,f.event('CONFIRMAR '+p.code,sender),f.queue);
  assert.equal(f.created,null);f.paid=true;f.conflict=true;
  await assert.rejects(()=>f.bookingApi.handleBookingMessage(f.tx as never,f.event('CONFIRMAR '+p.code,phone),f.queue),/Occupied/);assert.equal(f.created,null);
 }finally{await f.db.close()}
});
test('duration is literal, unique and bounded; no default length or ambiguous alternative',async()=>{
 const f=await fixture();try{
  for(const text of ['sí','no, una hora','sí, una o dos horas','sí, 300 minutos','sí, una hora pero quizá dos'])assert.equal(f.api.availabilityEnd(text,'10:00',null),null);
  assert.equal(f.api.availabilityEnd('Sí, una hora','10:00',null),'11:00');assert.equal(f.api.availabilityEnd('Sí, 50 minutos','10:00','11:00'),null);
 }finally{await f.db.close()}
});
