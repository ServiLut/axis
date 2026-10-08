import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots,capabilitiesReply} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,selectBusinessPrice} from '../automation/service-bots/business-prices.mjs';
import {CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {MARIA_UNDERSTANDING_GUARD} from '../automation/service-bots/maria-understanding.mjs';
function fixture(){
 const start=Date.now()-60000,s=new Store(':memory:','fumigacion',randomBytes(32));
 s.importKnowledge(approvedBusinessPriceSchedule());
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:start-1000,lines:BUSINESSES.fumigacion.phones.map(phone=>({phone}))};
 const engine=new Engine(s,c);let seq=0;
 const turn=async(text,semantic=null,slots={})=>{const e={id:'AUTONOMY_SOURCE_'+ ++seq,phone:'573009000011',line:c.lines[1].phone,at:start+seq*1000,fromMe:false,kind:'text',text};s.enqueue(e);
  const analysis=semantic?{company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,intent:{kind:semantic,evidence:text.slice(0,200)},slots}:{};
  await engine.process(e,analysis);const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,row,text:row?s.open(row.body):null,state:s.conversation(e.phone).state};};
 return {s,c,turn};
}
test('native empty form and factual followups complete ordinary intake without a staff question',async()=>{
 const f=fixture();try{
  const form='Hola, requiero una cotización técnica para control de [Plaga] en un [Empresa/Hogar] ubicado en [Municipio].';
  const first=await f.turn(form,'new-service',{service:'[Plaga]',site:'[Empresa/Hogar]',location:'[Municipio]'});
  assert.deepEqual(first.state.slots,{});assert.match(first.text,/plaga/);assert.match(first.text,/municipio/);
  await f.turn('Para un apto','general-question');await f.turn('Tres habitaciones','general-question');
  await f.turn('72 mts cuadrados','general-question');await f.turn('Tenemos mucha plaga de cucarachas en la cocina','new-service');await f.turn('Y closets');
  const pending=await f.turn('Cuánto me vale la fumigación');assert.match(pending.text,/municipio/);assert.doesNotMatch(pending.text,/revisi[oó]n|asesora|confirmación/);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(pending.state.awaitingHumanReview,undefined);
  const quote=await f.turn('En Medellín, barrio Robledo');assert.match(quote.text,/149.000/,JSON.stringify(quote.state));assert.equal(quote.state.slots.area,'72 mts cuadrados');
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.s.close();}
});
test('a bed count remains literal and asks the customer for the missing mattress fact without staff delegation',async()=>{
 const f=fixture();try{await f.turn('Tengo problema con chinches en una cama doble, apartamento en Medellín');
  const result=await f.turn('Solo hay una cama doble');assert.match(result.text,/colchones/);assert.equal(result.state.slots.mattresses,undefined);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.doesNotMatch(result.text,/revisaremos|asesora/);
 }finally{f.s.close();}
});
test('ordinary customer availability question quotes approved facts rather than delegating the reception',async()=>{
 const f=fixture();try{const result=await f.turn('Tengo cucarachas en apartamento de 72 mts cuadrados en Medellín. ¿Pueden venir mañana?','general-question');
  assert.match(result.text,/149.000/);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.match(result.state.slots.preference,/mañana/);
 }finally{f.s.close();}
});
test('explicit square abbreviation prices; bare metres remain unresolved instead of receiving invented square units',()=>{
 for(const area of ['72 mts cuadrados','72 mt cuadrados','72 mts. cuadrados']){assert.equal(extractSlots(area,'fumigacion').area,area);assert.equal(selectBusinessPrice({service:'cucarachas',site:'apartamento',location:'medellin',area}).entry?.priceCop,149000);}
 assert.equal(selectBusinessPrice({service:'cucarachas',site:'apartamento',location:'medellin',area:'72 metros'}).entry,undefined);
});
test('registration-enabled factual capabilities never deny the installed own program or claim a saved service',()=>{
 const f=fixture();try{const now=Date.now();f.c.mariaProgram={enabled:true,startsAt:now-1000,expiresAt:now+60000};const reply=capabilitiesReply(f.c,SANDRA,4);
  assert.match(reply,/registrar.*a mi nombre/);assert.doesNotMatch(reply,/Todavía no creo servicios|ya.*guardad/);
 }finally{f.s.close();}
});
test('Sandra directed readonly request is answered under her hold without a generic review or another confirmation',async()=>{
 const f=fixture();try{const e={id:'CHIEF_CALLS_REQUEST_001',phone:SANDRA,line:f.c.lines[0].phone,at:Date.now(),kind:'text',fromMe:false,text:'Maria angel, necesito que me digas cuantas llamadas han salido y entrado de las 2 lineas de whatsapp'};
  f.s.enqueue(e);f.s.hold(SANDRA,'VERIFIED_STAFF_001',true);const engine=new Engine(f.s,f.c);await engine.process(e);await engine.process(e);
  const row=f.s.db.prepare('SELECT * FROM outbox').get();assert.ok(row);assert.equal(row.phone,SANDRA);assert.match(f.s.open(row.body),/historial de llamadas/);assert.doesNotMatch(f.s.open(row.body),/guardé tu solicitud|ejecutado cambios|confírmame|necesito tu confirmación|autorizas/);
  assert.equal(f.s.conversation(SANDRA).hold,1);assert.equal(f.s.db.prepare("SELECT name FROM sqlite_master WHERE name='chief_requests'").get(),undefined);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);
 }finally{f.s.close();}
});
