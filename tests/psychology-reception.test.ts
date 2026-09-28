import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { decideReception,validateReceptionEvent,phoneDigits,type ReceptionEvent } from '../lib/psychology-reception';
import { sanitizeCode } from '../scripts/build-psychology-reception.mjs';
const now=Date.parse('2026-09-28T16:00:00Z');
const e:ReceptionEvent={id:'event-12345',phone:'573001234567',at:new Date(now).toISOString(),text:'hola',kind:'text',fromMe:false};
const templates={servicios:{approved:true,text:'1. Individual\n2. Pareja',version:'1'},individual:{approved:true,text:'Precio y condiciones exactos\n$119.900',version:'1'},datos:{approved:true,text:'Datos exactos',version:'1'}};
test('only current, well-formed events enter the durable queue',()=>{
 assert.ok(validateReceptionEvent(e,now,now-1000));
 for(const change of [{phone:'123@g.us'},{at:'2026-09-28T16:00:00'},{at:'2026-09-20T16:00:00Z'},{at:'2026-09-28T16:03:00Z'},{fromMe:'false'},{id:"' sql"},{text:'x'.repeat(8001)}])assert.equal(validateReceptionEvent({...e,...change},now,now-1000),null);
 assert.equal(phoneDigits('300 123 4567'),'573001234567');
});
test('exact saved service text, no payment request before a new acceptance',()=>{
 const greeting=decideReception(e,'NEW',{},templates,'FULL');assert.equal(greeting.stage,'NEED');
 const menu=decideReception({...e,text:'/servicios'},'NEED',{},templates,'FULL');assert.equal(menu.messages[0],templates.servicios.text);
 const offer=decideReception({...e,text:'1'},'MENU',{},templates,'FULL');assert.equal(offer.messages[0],templates.individual.text);assert.equal(offer.stage,'OFFER');
 const accepted=decideReception({...e,text:'sí'},'OFFER',offer.state,templates,'FULL');assert.equal(accepted.stage,'DATA');assert.equal(accepted.messages[0],'Por favor, regálame estos datos 😊');assert.equal(accepted.messages[1],templates.datos.text);
 const unclear=decideReception({...e,text:'sí'},'OFFER',offer.state,templates,'REVIEW');assert.equal(unclear.stage,'HUMAN');assert.ok(unclear.handoff);
});
test('clinical narratives and missing prices are never classified as ordinary sales',()=>{
 for(const text of ['necesito terapia individual porque estoy deprimido','me quiero morir','quiero sexologia']){
  const d=decideReception({...e,text},'NEED',{},templates,'FULL');assert.equal(d.stage,'HUMAN');assert.ok(d.handoff);assert.ok(!d.messages.includes(templates.individual.text));
 }
 const urgent=decideReception({...e,text:'me quiero morir'},'HUMAN',{alerted:true},templates,'FULL');assert.equal(urgent.handoff,'Atención humana urgente');
});
test('staff reply pauses automation; a receipt is not payment confirmation; audio is not guessed',()=>{
 assert.equal(decideReception({...e,fromMe:true},'MENU',{},templates,'FULL').stage,'HUMAN');
 for(const kind of ['audio','attachment'] as const){const d=decideReception({...e,kind},'OFFER',{},templates,'FULL');assert.equal(d.stage,'HUMAN');assert.ok(d.handoff);}
 assert.deepEqual(decideReception(e,'HUMAN',{},templates,'FULL').messages,[]);
});
test('Sandra policy charges 20000 only for a single session and never asks a prepaid package for a second deposit',()=>{
 const approved={...templates,reserva_sesion:{approved:true,text:'Abono autorizado $20.000',version:'2'},reserva_paquete:{approved:true,text:'Paquete: único pago',version:'2'}};
 const accepted=decideReception({...e,text:'sí'},'OFFER',{service:'individual'},approved,'DEPOSIT_20000');assert.equal(accepted.stage,'PAYMENT_FORMAT');
 const single=decideReception({...e,text:'una sesión'},'PAYMENT_FORMAT',{},approved,'DEPOSIT_20000');assert.equal(single.messages[0],approved.reserva_sesion.text);
 const pack=decideReception({...e,text:'paquete'},'PAYMENT_FORMAT',{},approved,'DEPOSIT_20000');assert.equal(pack.messages[0],approved.reserva_paquete.text);
 const prepaid=decideReception({...e,text:'ya tengo paquete'},'PAYMENT_FORMAT',{},approved,'DEPOSIT_20000');assert.equal(prepaid.stage,'HUMAN');assert.ok(prepaid.messages[0].includes('no necesitas otro anticipo'));assert.ok(!prepaid.messages.includes(approved.reserva_sesion.text));
});
test('n8n whitelist removes keys/media and excludes groups, wrong number and protocol history',()=>{
 const run=(body:unknown)=>new Function('$json',sanitizeCode)({body});
 const input={event:'messages.upsert',instance:'psicologos-en-colombia',sender:'573016818845@s.whatsapp.net',apikey:'secret',data:{key:{remoteJid:'573001234567@s.whatsapp.net',fromMe:false,id:'wa123456'},messageTimestamp:now/1000,message:{conversation:'hola'},base64:'private-media'}};
 const output=run(input)[0].json;assert.equal(output.event.phone,e.phone);assert.equal(output.event.text,'hola');assert.ok(!JSON.stringify(output).includes('secret'));assert.ok(!JSON.stringify(output).includes('private-media'));
 for(const changes of [{instance:'other'},{sender:'573009999999@s.whatsapp.net'},{data:{...input.data,key:{...input.data.key,remoteJid:'123@g.us'}}},{data:{...input.data,message:{protocolMessage:{}}}}])assert.equal(run({...input,...changes})[0].json.action,'ignore');
});
test('SQL queues enforce idempotency, rollback and claim without sending an ambiguous item again',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "CitasPsicologos" (id BIGINT PRIMARY KEY)');
  await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
  await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
  await db.exec(`INSERT INTO "PsicologiaBotConversation" (phone) VALUES ('573001234567');
   INSERT INTO "PsicologiaBotEvent" (id,phone,"eventAt",kind) VALUES ('one','573001234567',NOW(),'text') ON CONFLICT DO NOTHING;
   INSERT INTO "PsicologiaBotEvent" (id,phone,"eventAt",kind) VALUES ('one','573001234567',NOW(),'text') ON CONFLICT DO NOTHING;`);
  assert.equal((await db.query<{n:number}>('SELECT COUNT(*)::int n FROM "PsicologiaBotEvent"')).rows[0].n,1);
  await db.exec(`INSERT INTO "PsicologiaBotOutbox" (id,phone,content,status) VALUES ('a','573001234567','first','UNCERTAIN'),('b','573001234567','second','PENDING'),('c','573001234568','other','PENDING')`);
  const claim=await db.query<{id:string}>(`UPDATE "PsicologiaBotOutbox" SET status='SENDING',"attemptedAt"=NOW() WHERE id=(SELECT o.id FROM "PsicologiaBotOutbox" o WHERE o.status='PENDING' AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" p WHERE p.phone=o.phone AND p.status IN ('SENDING','UNCERTAIN')) ORDER BY o."createdAt",o.id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id`);
  assert.equal(claim.rows[0].id,'c');
  await assert.rejects(()=>db.exec(`INSERT INTO "PsicologiaBotConversation" (phone,"tenantId") VALUES ('573001234569',9)`));
 }finally{await db.close()}
});
