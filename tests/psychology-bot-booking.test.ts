import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadServerModule } from './load-server-module';
import { phoneDigits,SANDRA_PHONE } from '../lib/psychology-reception';
import type * as Booking from '../lib/psychology-bot-booking';
async function fixture(rental=false) {
 const db=new PGlite();await db.exec('CREATE TABLE "CitasPsicologos" (id BIGINT PRIMARY KEY)');await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const details={customerId:rental?null:1,professionalId:29,roomId:'1',serviceId:rental?'49':'1',date,start:'10:00',end:'11:00',rental,serviceName:rental?'Alquiler':'Individual',amount:rental?'18900':'119900',professionalName:'Profesional'};
 await db.query(`INSERT INTO "PsicologiaBotProposal" (code,"customerPhone","professionalPhone",details,"expiresAt") VALUES ('ABCD1234ABCD',$1,$2,$3,NOW()+INTERVAL '12 hours')`,[rental?'573002222222':'573001111111','573002222222',JSON.stringify(details)]);
 const state={writes:0,audits:0,occupied:false,active:true,package:false,consumed:0,missing:0};const sent:{phone:string;text:string}[]=[];
 const raw=async(s:TemplateStringsArray,...v:unknown[])=>db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v.map(x=>typeof x==='bigint'?String(x):x));
 const tx={
  $queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).rows,
  $executeRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await raw(s,...v)).affectedRows,
  usuario:{findFirst:async()=>state.active?{id:29,telefono:'573002222222'}:null},
  cliente:{findFirst:async()=>({id:1})},consultorios:{findFirst:async()=>({id:1n})},
  terapiasPsicologos:{findFirst:async()=>({id:rental?49n:1n,precioBase:rental?18900:119900,cantidadSesiones:1})},
  paqueteAdquirido:{findFirst:async()=>state.package?{id:1n}:null,updateMany:async()=>{state.consumed++;return {count:1}},create:async()=>({id:1n})},
  citasPsicologos:{count:async()=>state.missing,create:async({data}:{data:Record<string,unknown>})=>{state.writes++;assert.equal(data.estadoPago,undefined);await db.exec('INSERT INTO "CitasPsicologos" (id) VALUES (100)');return {id:100n}}},
 };
 const api=loadServerModule<typeof Booking>('lib/psychology-bot-booking.ts',{
  'node:crypto':{createHash},'./psychology-reception':{phoneDigits,SANDRA_PHONE},
  './booking-server':{normalizedRental:async()=>rental?{valor:18900}:null,lockAndValidateBooking:async()=>{if(state.occupied)throw Error('Occupied')}},
  './audit':{createAuditLog:async()=>{state.audits++}},'./package-payment':{getPackagePaymentState:async()=>null},
 });
 const message=async(phone:string,text='CONFIRMAR ABCD1234ABCD')=>api.handleBookingMessage(tx as never,{id:'event-'+Date.now(),phone,text,fromMe:false,kind:'text',at:new Date().toISOString()},async(_t,_id,p,text)=>{sent.push({phone:p,text})});
 return {db,state,sent,message};
}
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
test('registered rental professional can confirm their own reservation without proof',async()=>{
 const f=await fixture(true);try{await f.message('573002222222');assert.equal(f.state.writes,1);await f.message('573002222222');assert.equal(f.state.writes,1);}finally{await f.db.close()}
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
