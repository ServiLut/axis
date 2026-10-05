import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadServerModule } from './load-server-module';
import { phoneDigits,SANDRA_PHONE } from '../lib/psychology-reception';
import type * as Booking from '../lib/psychology-bot-booking';
import type * as Identity from '../lib/psychology-booking-identity';
import {validateBookingSpecialty} from '../lib/psychology-bot-booking';
import * as bookingMessages from '../lib/psychology-booking-messages';
async function fixture(rental=false) {
 const db=new PGlite();await db.exec(`CREATE TABLE "CitasPsicologos" (id BIGINT PRIMARY KEY,"tenantId" INT,"empresaId" INT,"pacienteId" INT,"psicologoId" INT);
 CREATE TABLE "Cliente" (id INT,"tenantId" INT,"empresaId" INT,telefono TEXT,telefono2 TEXT,"deletedAt" TIMESTAMPTZ);
 CREATE TABLE "Usuario" (id INT,"tenantId" INT,"empresaId" INT,nombre TEXT,apellido TEXT,telefono TEXT,activo BOOLEAN,rol TEXT);
 INSERT INTO "Cliente" VALUES (1,4,3,'573001111111',NULL,NULL);
 INSERT INTO "Usuario" VALUES (29,4,3,'Profesional','Prueba','573002222222',true,'TECNICO');`);await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const details={customerId:rental?null:1,professionalId:29,roomId:'1',serviceId:rental?'49':'1',date,start:'10:00',end:'11:00',rental,serviceName:rental?'Alquiler':'Individual',sessionCount:1,amount:rental?'18900':'119900',professionalName:'Profesional'};
 await db.query(`INSERT INTO "PsicologiaBotProposal" (code,"customerPhone","professionalPhone",details,"expiresAt") VALUES ('ABCD1234ABCD',$1,$2,$3,NOW()+INTERVAL '12 hours')`,[rental?'573002222222':'573001111111','573002222222',JSON.stringify(details)]);
 const state={writes:0,audits:0,occupied:false,active:true,package:false,consumed:0,missing:0,price:rental?18900:119900,sessions:1,category:rental?'Alquiler':'Terapia Individual',serviceName:rental?'Alquiler':'Individual'};const sent:{phone:string;text:string}[]=[];
 const raw=async(s:TemplateStringsArray,...v:unknown[])=>db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v.map(x=>typeof x==='bigint'?String(x):x));
 const tx={
  $queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).rows,
  $executeRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).affectedRows,
  usuario:{findFirst:async({where}:{where:{id:number;tenantId:number;empresaId:number}})=>state.active?(await db.query('SELECT * FROM "Usuario" WHERE id=$1 AND "tenantId"=$2 AND "empresaId"=$3',[where.id,where.tenantId,where.empresaId])).rows[0]:null},
  cliente:{findFirst:async({where}:{where:{id:number;tenantId:number;empresaId:number}})=>(await db.query('SELECT * FROM "Cliente" WHERE id=$1 AND "tenantId"=$2 AND "empresaId"=$3',[where.id,where.tenantId,where.empresaId])).rows[0]},consultorios:{findFirst:async()=>({id:1n})},
  terapiasPsicologos:{findFirst:async()=>({id:rental?49n:1n,nombre:state.serviceName,categoria:state.category,precioBase:state.price,cantidadSesiones:state.sessions})},
  paqueteAdquirido:{findFirst:async()=>state.package?{id:1n}:null,updateMany:async()=>{state.consumed++;return {count:1}},create:async()=>({id:1n})},
  citasPsicologos:{count:async()=>state.missing,create:async({data}:{data:Record<string,unknown>})=>{state.writes++;assert.equal(data.estadoPago,undefined);await db.exec('INSERT INTO "CitasPsicologos" (id) VALUES (100)');return {id:100n}}},
 };
 const identity=loadServerModule<typeof Identity>('lib/psychology-booking-identity.ts',{'./psychology-reception':{phoneDigits}});
 const api=loadServerModule<typeof Booking>('lib/psychology-bot-booking.ts',{
  './psychology-bot-operator':{requireLuisaOperator:async()=>({id:900,username:'luisa.fernanda.bot'})},
  './psychology-booking-messages':bookingMessages,
  'node:crypto':{createHash},'./psychology-reception':{phoneDigits,SANDRA_PHONE},
  './psychology-booking-identity':identity,
  './booking-server':{normalizedRental:async(_tx:unknown,_tenant:number,_service:bigint,inicio:Date)=>rental?{valor:18900,fin:new Date(inicio.getTime()+3600000)}:null,lockAndValidateBooking:async()=>{if(state.occupied)throw Error('Occupied')}},
  './audit':{createAuditLog:async()=>{state.audits++}},'./package-payment':{getPackagePaymentState:async()=>null},
 });
 const message=async(phone:string,text='CONFIRMAR ABCD1234ABCD')=>{await db.query('UPDATE "Usuario" SET activo=$1 WHERE id=29',[state.active]);return api.handleBookingMessage(tx as never,{id:'event-'+Date.now(),phone,text,fromMe:false,kind:'text',at:new Date().toISOString()},async(_t,_id,p,text)=>{if(/quedó para/.test(text)){assert.equal((await db.query('SELECT id FROM "CitasPsicologos" WHERE id=100')).rows.length,1);assert.equal((await db.query<{status:string}>('SELECT status FROM "PsicologiaBotProposal" WHERE "citaId"=100')).rows[0]?.status,'BOOKED');}sent.push({phone:p,text})});};
 const proposeOwnRental=(phone:string)=>api.proposeBooking(tx as never,{id:'synthetic-own-rental-'+phone,phone,kind:'text',text:'Reservar consultorio 10',fromMe:false,at:new Date().toISOString()},{rawPhone:'573002222222',serviceId:'49',professionalId:'29',room:'1',date,start:'10:00',end:'11:00'},async(_tx,_id,p,text)=>{sent.push({phone:p,text})});
 return {db,state,sent,message,proposeOwnRental};
}

test('own rental proposal uses verified professional identity and waits for exact confirmation',async()=>{
 const f=await fixture(true);try{
  await f.db.exec('DELETE FROM "PsicologiaBotProposal"');
  await assert.rejects(()=>f.proposeOwnRental('573009999999'),/identidad autorizada/);assert.equal(f.sent.length,0);
  const code=await f.proposeOwnRental('573002222222');assert.equal(f.state.writes,0);assert.equal(f.sent.length,1);assert.equal(f.sent[0].phone,'573002222222');
  await f.message('573002222222','CONFIRMAR '+code);assert.equal(f.state.writes,1);
  await f.message('573002222222','CONFIRMAR '+code);assert.equal(f.state.writes,1);
 }finally{await f.db.close()}
});
test('both exact confirmed senders are required; a payment image cannot create a booking',async()=>{
 const f=await fixture();try {
  await f.message('573009999999');assert.equal(f.state.writes,0);
  await f.message('573001111111');assert.equal(f.state.writes,0);
  await f.message('573002222222');assert.equal(f.state.writes,0);
  assert.ok(f.sent.some(m=>m.phone===SANDRA_PHONE&&m.text.includes('comprobante')));
  await f.db.exec(`UPDATE "PsicologiaBotProposal" SET "evidenceApprovedAt"=NOW(),"evidencePath"='verified-receipt'`);
  await f.message('573001111111');assert.equal(f.state.writes,1);
  await f.message('573001111111');assert.equal(f.state.writes,1);
  assert.equal(f.state.audits,1);
 }finally{await f.db.close()}
});
test('registered rental professional receives a confirmation only after saving once, without an ordinary chief alert',async()=>{
 const f=await fixture(true);try{await f.message('573002222222');assert.equal(f.state.writes,1);await f.message('573002222222');assert.equal(f.state.writes,1);assert.equal(f.sent.filter(m=>/quedó para/.test(m.text)).length,1);assert.equal(f.sent.some(m=>m.phone===SANDRA_PHONE),false);}finally{await f.db.close()}
});
test('changed availability, incomplete agenda and suspended professional block finalization',async()=>{
 for(const flag of ['occupied','active','missing'] as const){const f=await fixture(true);try {
  if(flag==='active')f.state.active=false;else if(flag==='missing')f.state.missing=1;else f.state.occupied=true;
  await assert.rejects(()=>f.message('573002222222'));assert.equal(f.state.writes,0);
 }finally{await f.db.close()}}
});
test('a prepaid package session consumes once without recording a second payment',async()=>{
 const f=await fixture(true);try{f.state.package=true;await f.message('573002222222');await f.message('573002222222');assert.equal(f.state.consumed,1);assert.equal(f.state.writes,1);}finally{await f.db.close()}
});
test('legacy customer and professional with scoped appointment history remain verifiable at final confirmation',async()=>{
 const f=await fixture();try{
  await f.db.exec(`UPDATE "Cliente" SET "empresaId"=NULL;UPDATE "Usuario" SET "empresaId"=NULL;
   INSERT INTO "CitasPsicologos" VALUES (77,4,3,1,29);
   UPDATE "PsicologiaBotProposal" SET "evidenceApprovedAt"=NOW(),"evidencePath"='verified-receipt'`);
  await f.message('573001111111');await f.message('573002222222');assert.equal(f.state.writes,1);
    const companies=await f.db.query<{empresaId:number|null}>('SELECT "empresaId" FROM "Cliente" UNION ALL SELECT "empresaId" FROM "Usuario"');assert.ok(companies.rows.every(r=>r.empresaId===null));
 }finally{await f.db.close()}
});
test('the same legacy identity checks apply from chief proposal through both confirmations',async()=>{
 const f=await fixture();try{
  await f.db.exec(`DELETE FROM "PsicologiaBotProposal";UPDATE "Cliente" SET "empresaId"=NULL,telefono='3001111111';UPDATE "Usuario" SET "empresaId"=NULL,telefono='3002222222';
   INSERT INTO "CitasPsicologos" VALUES (77,4,3,1,29)`);
  const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
  await f.message(SANDRA_PHONE,`RESERVAR 573001111111 1 29 1 ${date} 10:00 11:00`);
  const proposal=(await f.db.query<{code:string;details:{customerId:number;professionalId:number}}>('SELECT code,details FROM "PsicologiaBotProposal"')).rows[0];
  assert.equal(proposal.details.customerId,1);assert.equal(proposal.details.professionalId,29);assert.equal(f.state.writes,0);
  await f.message('573001111111','CONFIRMAR '+proposal.code);assert.equal(f.state.writes,0);
  await f.db.exec(`UPDATE "PsicologiaBotProposal" SET "evidenceApprovedAt"=NOW(),"evidencePath"='verified-receipt'`);
  await f.message('573002222222','CONFIRMAR '+proposal.code);assert.equal(f.state.writes,1);
 }finally{await f.db.close()}
});
test('customer alternative and international phones remain exact, with tenant and deleted-record checks',async()=>{
 const f=await fixture();try{
  await f.db.exec(`UPDATE "Cliente" SET telefono='3009999999',telefono2='+34 600 111 222';
   UPDATE "PsicologiaBotProposal" SET "customerPhone"='34600111222',"customerConfirmedAt"=NOW(),"evidenceApprovedAt"=NOW(),"evidencePath"='verified-receipt'`);
  await f.message('573002222222');assert.equal(f.state.writes,1);
 }finally{await f.db.close()}
 for(const mutation of [`UPDATE "Cliente" SET "tenantId"=9`,`UPDATE "Cliente" SET "deletedAt"=NOW()`,`UPDATE "Usuario" SET rol='ASESOR'`,`UPDATE "Usuario" SET "tenantId"=9`]){
  const g=await fixture();try{await g.db.exec(mutation);await g.db.exec(`UPDATE "PsicologiaBotProposal" SET "customerConfirmedAt"=NOW(),"evidenceApprovedAt"=NOW(),"evidencePath"='verified-receipt'`);
   await assert.rejects(()=>g.message('573002222222'));assert.equal(g.state.writes,0);
  }finally{await g.db.close()}
 }
});
test('final confirmation rejects changed customer phone, duplicate identity and unproven legacy scope',async()=>{
 for(const mutation of [
  `UPDATE "Cliente" SET telefono='573009999999'`,
  `INSERT INTO "Cliente" VALUES (2,4,3,'573001111111',NULL,NULL)`,
  `UPDATE "Cliente" SET "empresaId"=NULL`,
  `UPDATE "Usuario" SET "empresaId"=NULL`,
  `UPDATE "Usuario" SET "empresaId"=2`,
  `INSERT INTO "Usuario" VALUES (30,4,3,'Otro','Profesional','573002222222',true,'TECNICO')`,
 ]){
  const f=await fixture();try{
   await f.db.exec(mutation);await f.db.exec(`UPDATE "PsicologiaBotProposal" SET "customerConfirmedAt"=NOW(),"evidenceApprovedAt"=NOW(),"evidencePath"='verified-receipt'`);
   await assert.rejects(()=>f.message('573002222222'),mutation);assert.equal(f.state.writes,0);assert.equal(f.state.consumed,0);
  }finally{await f.db.close()}
 }
});

test('paused participant or pending staff takeover prevents confirmation and any appointment write',async()=>{
 for(const mode of ['paused-patient','paused-professional','staff-pending','sender-echo'] as const){
  const f=await fixture();try{
   const phone=mode==='paused-professional'?'573002222222':'573001111111';
   await f.db.query('INSERT INTO "PsicologiaBotConversation" (phone,stage) VALUES ($1,$2)',[phone,mode.startsWith('paused')?'HUMAN':'NEW']);
   await f.db.exec(`UPDATE "PsicologiaBotProposal" SET "customerConfirmedAt"=NOW(),"evidenceApprovedAt"=NOW(),"evidencePath"='verified-receipt'`);
   if(mode==='staff-pending'||mode==='sender-echo'){
    await f.db.query(`INSERT INTO "PsicologiaBotEvent" (id,phone,"eventAt",kind,text,"fromMe") VALUES ('pending-staff',$1,NOW(),'text','confirmed by staff',true)`,[phone]);
    if(mode==='sender-echo')await f.db.query(`INSERT INTO "PsicologiaBotOutbox" (id,phone,content,status) VALUES ('bot-echo',$1,'confirmed by staff','ACCEPTED')`,[phone]);
   }
   if(mode==='sender-echo'){await f.message('573002222222');assert.equal(f.state.writes,1);}
   else{await assert.rejects(()=>f.message('573002222222'),/humana/i);assert.equal(f.state.writes,0);assert.equal(f.state.consumed,0);assert.equal(f.sent.length,0);}
  }finally{await f.db.close()}
 }
});

test('catalog price, package size or service identity changes require a new proposal',async()=>{
 for(const field of ['price','sessions','serviceName'] as const){const f=await fixture();try{
  await f.db.exec(`UPDATE "PsicologiaBotProposal" SET "customerConfirmedAt"=NOW(),"evidenceApprovedAt"=NOW(),"evidencePath"='verified-receipt'`);
  if(field==='price')f.state.price=120000;else if(field==='sessions')f.state.sessions=3;else f.state.serviceName='Another therapy';
  await assert.rejects(()=>f.message('573002222222'));assert.equal(f.state.writes,0);assert.equal(f.state.consumed,0);
 }finally{await f.db.close()}}
});

test('specialty restrictions are enforced before proposing or committing',async()=>{
 for(const [category,id] of [['Neuropsicología',28],['Terapia de Sexología',82],['Apoyo Emocional Mascotas',24],['Terapia Individual',29],['Terapia Familiar',24]] as const)assert.doesNotThrow(()=>validateBookingSpecialty(category,id,false));
 for(const id of [28,82]){assert.doesNotThrow(()=>validateBookingSpecialty('Alquiler',id,true));assert.throws(()=>validateBookingSpecialty('Terapia Individual',id,false));}
 for(const category of ['Neuropsicología','Terapia de Sexología','Apoyo Emocional Mascotas']){const f=await fixture();try{
  f.state.category=category;
  const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
  await assert.rejects(()=>f.message(SANDRA_PHONE,`RESERVAR 573001111111 1 29 1 ${date} 10:00 11:00`));
  await f.db.exec(`UPDATE "PsicologiaBotProposal" SET "customerConfirmedAt"=NOW(),"evidenceApprovedAt"=NOW(),"evidencePath"='verified-receipt'`);
  await assert.rejects(()=>f.message('573002222222'));assert.equal(f.state.writes,0);
 }finally{await f.db.close()}}
});
