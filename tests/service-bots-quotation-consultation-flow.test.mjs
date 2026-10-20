import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,HILARY} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {approvedBusinessPriceSchedule,selectBusinessPrice} from '../automation/service-bots/business-prices.mjs';
import {composeOwnReply} from '../automation/service-bots/conversational-ai.mjs';
import {aiConfiguration} from '../automation/service-bots/ai-settings.mjs';

mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T18:23:00.000Z')});
const initial='1. Cucarachas, arañas y hormigas\n2. casa\n3. Medellín, san Antonio de Prado';
const size='Son 2 habitaciones, casa de dos pisos, 2 baños, la cocina y zona de ropas un poco menos de 70 mts';
function fixture(){
 const start=Date.now()-60000,b=BUSINESSES.fumigacion,line=b.phones[1],sender=b.phones[0],members=[...TESA_BOT_PHONES,HILARY];
 const s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());
 const c={...b,company:'fumigacion',enabled:true,activatedAt:start,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:b.phones.map((phone,i)=>({phone,instance:'CONSULTATION_LOCAL_'+i})),mariaTesaUnregistered:{enabled:true,startsAt:start},tesaOperations:{enabled:true,senderLine:sender,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,activatedAt:start,allowedParticipantPhones:[HILARY],verifiedMembership:{owner:sender,ownerOpen:true,verifiedAt:Date.now(),expiresAt:Date.now()+300000,sourceHash:'a'.repeat(64),participantPhones:members,participantBindings:members.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}}};
 const engine=new Engine(s,c);let sequence=0;
 const turn=async(text,extra={})=>{mock.timers.setTime(Date.now()+1000);const e={id:'CONSULTATION_NATIVE_'+ ++sequence,phone:'573000004321',line,at:Date.now(),kind:'text',fromMe:false,forwarded:false,text,...extra};s.enqueue(e);await engine.process(e);return e;};
 const row=e=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 return {s,c,turn,row,text:e=>{const out=row(e);return out?s.open(out.body):null;}};
}

test('the reported multi-pest home case consults once with complete literal facts and a clear price doubt',async()=>{
 const f=fixture();try{
  const first=await f.turn(initial);assert.match(f.text(first),/habitaciones o metros cuadrados/);
  const next=await f.turn(size),reply=f.text(next),state=f.s.conversation(next.phone).state;
  assert.equal(state.slots.service,'cucarachas y hormigas y arañas');assert.equal(state.slots.floors,'dos pisos');assert.equal(state.slots.rooms,'2 habitaciones');assert.equal(state.slots.area,undefined);
  assert.match(reply,/consultando el valor y qué incluye el servicio/);assert.doesNotMatch(reply,/no tengo un precio|Ya tengo el dato|\$|cuántas habitaciones|qué plaga/i);
  const q=f.s.db.prepare('SELECT * FROM tesa_questions').get(),body=f.s.open(q.body),out=f.s.db.prepare('SELECT * FROM tesa_outbox').get(),group=f.s.open(out.body);
  assert.equal(q.topic,'cotizacion-verificada');assert.equal(q.source_line,next.line);assert.equal(body.source,next.id);assert.equal(body.conditions.quotationGapReason,'BUSINESS_PRICE_EXTRA_SCOPE_REVIEW');
  assert.match(group,/línea roja …8721/);assert.match(group,/Servicio: cucarachas y hormigas y arañas/);assert.match(group,/Municipio: medellin/);assert.match(group,/Ubicación indicada: Medellín, san Antonio de Prado/);
  assert.doesNotMatch(group,/Ubicación indicada: 1\./);assert.match(group,/Habitaciones: 2 habitaciones/);assert.match(group,/Pisos informados: dos pisos/);assert.ok(group.includes(size));assert.match(group,/para todas las plagas indicadas/);
  assert.match(group,/¿Qué valor total y alcance podemos confirmar para este caso\?/);assert.match(group,/Respondan citando este mensaje/);assert.ok(group.length<=1200);assert.doesNotMatch(group,/573000004321|70 m²|\$|129[ .]?000|149[ .]?000/);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(state.quotedPrice,undefined);assert.equal(state.quotedCasePrice,undefined);
  assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-tesa-unregistered-plan:%'").get().n,1);
  const status=await f.turn('Sigo pendiente');assert.match(f.text(status),/consultando el valor/);
  await f.turn('Sigo pendiente');assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,1);
 }finally{f.s.close();}
});

test('a source-checked pending consultation remains deterministic without a styling model call',async()=>{
 const f=fixture();try{
  await f.turn(initial);const e=await f.turn(size),row=f.row(e),text=f.text(e);
  f.c.conversationalAi=aiConfiguration({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_AI_MODEL:'isolated-consultation-model',BOT_OPENAI_API_KEY:'isolated-key',BOT_AI_MONTHLY_CALL_LIMIT:'10',BOT_AI_ENABLED_FROM:'2026-10-20T18:00:00.000Z'},'fumigacion');
  let calls=0;assert.equal(await composeOwnReply(f.c,f.s,async()=>{calls++;throw Error('NO_MODEL_FOR_FIXED_CONSULTATION');},row,text),text);assert.equal(calls,0);
 }finally{f.s.close();}
});

test('a real staff intervention preserves the existing consultation and prevents a second customer reply',async()=>{
 const f=fixture();try{
  await f.turn(initial);await f.turn(size);const before=f.s.db.prepare('SELECT * FROM tesa_outbox').all();
  await f.turn('Te atiendo personalmente.',{fromMe:true});const later=await f.turn('¿En qué horario?');
  assert.equal(f.s.conversation(later.phone).hold,1);assert.equal(f.text(later),null);assert.deepEqual(f.s.db.prepare('SELECT * FROM tesa_outbox').all(),before);
 }finally{f.s.close();}
});

test('written floor counts stay literal and unresolved floor scope cannot enable an ordinary price',()=>{
 assert.equal(extractSlots('Casa de dos pisos','fumigacion').floors,'dos pisos');
 assert.equal(extractSlots('No son dos pisos','fumigacion').floors,undefined);
 for(const scope of ['Quizás dos pisos','Son dos o tres pisos','Son 2-3 pisos','Son 2 pisos y 3 pisos']){
  const slots=extractSlots('Cucarachas en casa de 2 habitaciones en Medellín. '+scope,'fumigacion');
  assert.ok(slots.floors,scope);assert.equal(selectBusinessPrice(slots).entry,undefined,scope);
 }
 for(const scope of ['un piso','uno piso','1 piso']){
  const slots=extractSlots('Cucarachas en casa de 2 habitaciones en Medellín, de '+scope,'fumigacion');
  assert.equal(selectBusinessPrice(slots).entry?.priceCop,129000,scope);
 }
});

test('an unresolved alternative floor count is presented to TESA without silently quoting a one-floor table',async()=>{
 for(const scope of ['2 o 3 pisos','dos o tres pisos','dos pisos y tres pisos']){
  const f=fixture();try{
   const e=await f.turn('Cucarachas en casa de 2 habitaciones en Medellín, de '+scope),text=f.text(e),state=f.s.conversation(e.phone).state;
   assert.match(text,/consultando el valor/);assert.doesNotMatch(text,/\$|129[ .]?000/);assert.equal(state.quotedPrice,undefined);
   const out=f.s.db.prepare('SELECT body FROM tesa_outbox').get();assert.ok(out);assert.ok(f.s.open(out.body).includes(scope));
  }finally{f.s.close();}
 }
});
