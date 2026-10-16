import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {registrationStatus} from '../automation/service-bots/maria-program.mjs';
import {MARIA_INTAKE_TIMING_GUARD} from '../automation/service-bots/intake-timing.mjs';
import {CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {MARIA_UNDERSTANDING_GUARD} from '../automation/service-bots/maria-understanding.mjs';

function fixture(){
 const start=Math.floor((Date.now()-60000)/1000)*1000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:start-1000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'reception-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-1000,expiresAt:start+86400000}};
 const engine=new Engine(s,c);let seq=0;
 const event=(text,extra={})=>({id:'RECEPTION'+ ++seq,phone:'573009000011',line:c.lines[0].phone,at:start+seq*1000,kind:'text',fromMe:false,forwarded:false,text,...extra});
 const row=e=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const result=e=>{const r=row(e);return {e,row:r,text:r?s.open(r.body):null,state:s.conversation(e.phone).state};};
 const process=async(e,semantic=null)=>{const analysis=semantic?{company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,intent:{kind:semantic,evidence:e.text.slice(0,200)},slots:{}}:{};await engine.process(e,analysis);return result(e);};
 const turn=async(text,semantic=null,extra={})=>{const e=event(text,extra);s.enqueue(e);return process(e,semantic);};
 const deliver=e=>{const r=row(e);assert.ok(r,e.id);const mid='MID'+e.id;s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);s.recordFirstBotReply({...r,mid},mid,c.bot,e.at);s.delivery(mid,e.line,'DELIVERED');s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+r.id);};
 return {s,c,engine,event,process,turn,deliver,result};
}

test('pure greeting gathers pest and municipality before property and size, then quotes the literal approved 149000',async()=>{
 const f=fixture();try{
  const greeting=await f.turn('Buenas tardes');assert.match(greeting.text,/^Buenas tardes, soy María Ángel\./);assert.match(greeting.text,/plaga[\s\S]*\n2\. El municipio/);assert.doesNotMatch(greeting.text,/tipo de inmueble|habitaciones|metros cuadrados/);assert.equal(greeting.state.initialIntakeAllRequested,false);assert.deepEqual(greeting.state.asked,['service','location']);
  const pest=await f.turn('Cucarachas en Medellín');assert.match(pest.text,/tipo de inmueble/);assert.doesNotMatch(pest.text,/qué plaga|municipio|soy María/i);assert.equal(pest.state.slots.service,'cucarachas');assert.equal(pest.state.slots.location,'medellin');
  const property=await f.turn('Apartamento');assert.match(property.text,/habitaciones o metros cuadrados/);assert.doesNotMatch(property.text,/tipo de inmueble|municipio|soy María/i);
  const quote=await f.turn('60 m²');assert.match(quote.text,/\$149\.000 COP/);assert.match(quote.text,/¿Deseas continuar con esta cotización\?/);assert.equal(quote.state.quotedPrice.priceCop,149000);assert.notEqual(quote.state.quotedPrice.accepted,true);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(registrationStatus(f.c,f.s).prepared,0);
  f.deliver(quote.e);const accepted=await f.turn('Sí');assert.match(accepted.text,/nombre completo.*dirección completa/);assert.equal(accepted.state.programIntake.stage,'name');assert.doesNotMatch(accepted.text,/agendad|reservad|técnico confirmado|servicio confirmado/i);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});

test('a current literal day survives a general-question semantic label and receives only a sourced acknowledgement',async()=>{
 const f=fixture();try{
  const timing=await f.turn('Para hoy porfavor','general-question');assert.equal(timing.state.slots.preference,'hoy');assert.deepEqual(timing.state.intakeSources.preference,{sourceId:timing.e.id,at:timing.e.at,guard:MARIA_INTAKE_TIMING_GUARD,context:'literal-customer-preference-not-confirmed-availability'});assert.match(timing.text,/Entiendo que lo necesitas hoy\./);assert.match(timing.text,/plaga/);assert.doesNotMatch(timing.text,/respuesta confirmada|disponible|agendad|reservad|registrad/);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  const later=await f.turn('Cucarachas en Medellín');assert.equal(later.state.slots.preference,'hoy');assert.equal(later.state.intakeSources.preference.sourceId,timing.e.id);assert.doesNotMatch(later.text,/lo necesitas hoy/);assert.equal(later.state.quotedPrice,undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);
  await f.turn('Apartamento');const quote=await f.turn('60 m²');assert.match(quote.text,/\$149\.000 COP/);assert.doesNotMatch(quote.text,/lo necesitas hoy/);f.deliver(quote.e);
  const accepted=await f.turn('Sí');assert.match(accepted.text,/nombre completo.*dirección completa/);f.deliver(accepted.e);
  const facts=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');assert.match(facts.text,/\$149\.000/);assert.match(facts.text,/Preferencia solicitada: hoy/);assert.match(facts.text,/horario sigue pendiente de coordinación/);f.deliver(facts.e);
  const confirmed=await f.turn('Confirmo'),stored=f.s.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").get(),entry=stored&&f.s.open(stored.value);assert.equal(entry.status,'PENDING');assert.equal(entry.payload.quote.priceCop,149000);assert.equal(entry.payload.slots.preference,'hoy');assert.equal(entry.payload.sources.preference.id,timing.e.id);assert.equal(entry.payload.sources.preference.text,timing.e.text);assert.equal(entry.payload.quote.acceptanceId,confirmed.e.id);assert.equal(registrationStatus(f.c,f.s).saved,0);
 }finally{f.s.close();}
});

test('a superseded own timing fragment remains in the pending customer batch with its original source',async()=>{
 const f=fixture();try{
  await f.turn('Buenas tardes');const timing=f.event('Para mañana en la tarde'),facts=f.event('Cucarachas en Medellín');f.s.enqueue(timing);f.s.enqueue(facts);await f.process(timing);const latest=await f.process(facts);
  assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(timing.id).state,'OBSERVED_SUPERSEDED');assert.equal(latest.state.slots.preference,'mañana en la tarde');assert.equal(latest.state.intakeSources.preference.sourceId,timing.id);assert.equal(latest.state.intakeSources.preference.guard,MARIA_INTAKE_TIMING_GUARD);assert.match(latest.text,/tipo de inmueble/);assert.doesNotMatch(latest.text,/lo necesitas mañana|respuesta confirmada/);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});

test('direct AI preference references cannot replace the current literal timing guard or its raw value',()=>{
 for(const aiPreference of ['Mañana en la tarde','mañana en la noche']){
  const e={id:'DIRECT_TIMING_SOURCE',phone:'573009000011',line:BUSINESSES.fumigacion.phones[0],at:Date.now(),kind:'text',fromMe:false,forwarded:false,text:'Mañana en la tarde'};
  const analysis={company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,intent:{kind:'general-question',evidence:e.text},slots:{preference:aiPreference}};
  const decision=customerDecision('fumigacion',{slots:{},asked:['service'],lastText:''},e,analysis);assert.equal(decision.state.slots.preference,e.text);assert.equal(decision.state.intakeSources.preference.guard,MARIA_INTAKE_TIMING_GUARD);assert.equal(decision.state.intakeSources.preference.sourceId,e.id);assert.equal(decision.state.intakeSources.preference.at,e.at);
 }
});

test('urgency without a day stays separate and a later literal day does not invent availability or acceptance',async()=>{
 const f=fixture();try{
  const urgent=await f.turn('Lo necesito urgente','general-question');assert.equal(urgent.state.slots.urgency,'urgente');assert.equal(urgent.state.slots.preference,undefined);assert.equal(urgent.state.intakeSources.urgency.sourceId,urgent.e.id);assert.match(urgent.text,/lo necesitas con urgencia/);assert.doesNotMatch(urgent.text,/hoy|mañana|agendad|reservad|disponible/);
  const timing=await f.turn('Para mañana en la tarde');assert.equal(timing.state.slots.preference,'mañana en la tarde');assert.equal(timing.state.slots.urgency,'urgente');assert.equal(timing.state.intakeSources.urgency.sourceId,urgent.e.id);assert.equal(timing.state.intakeSources.preference.sourceId,timing.e.id);assert.equal(timing.state.quotedPrice,undefined);assert.equal(timing.state.programIntake,undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});

test('a requested day after a delivered quote is a preference and cannot accept or prepare the service',async()=>{
 const f=fixture();try{
  const quote=await f.turn('Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta?');f.deliver(quote.e);
  const day=await f.turn('Para hoy porfavor');assert.equal(day.state.slots.preference,'hoy');assert.notEqual(day.state.quotedPrice.accepted,true);assert.equal(day.state.programIntake,undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);assert.doesNotMatch(day.text,/quedó registrada|agendad|reservad|técnico confirmado/i);
 }finally{f.s.close();}
});

test('warranty and product conversations cannot acquire an ordinary timing source or restart an automatic quote',async()=>{
 for(const variant of ['warranty','product']){const f=fixture();try{
  const first=await f.turn(variant==='warranty'?'Solicito una garantía del servicio anterior':'¿Venden gel para cucarachas?');const marker=variant==='warranty'?'requestedAfterServiceReview':'requestedProductInquiry';assert.ok(first.state[marker]);
  const later=await f.turn('Lo necesito urgente hoy','general-question');assert.equal(later.state[marker].sourceId,first.state[marker].sourceId);assert.equal(later.state.intakeSources?.preference?.guard===MARIA_INTAKE_TIMING_GUARD,false);assert.equal(later.state.intakeSources?.urgency?.guard===MARIA_INTAKE_TIMING_GUARD,false);assert.equal(later.state.quotedPrice,undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);assert.doesNotMatch(later.text||'',/\$149\.000|tipo de inmueble|habitaciones o metros cuadrados/);
 }finally{f.s.close();}}
});

test('forwarded, hypothetical and human-held timing cannot become an ordinary current preference',async()=>{
 for(const variant of ['forwarded','conditional','hold']){const f=fixture();try{
  await f.turn('Buenas tardes');if(variant==='hold')f.s.hold('573009000011','SYNTHETIC_HUMAN');const result=await f.turn(variant==='conditional'?'Si mañana pueden, lo necesito':'Para mañana en la tarde',null,variant==='forwarded'?{forwarded:true}:{});
  assert.equal(result.state.intakeSources?.preference?.guard===MARIA_INTAKE_TIMING_GUARD,false);assert.equal(registrationStatus(f.c,f.s).prepared,0);if(variant==='hold'){assert.equal(f.s.conversation(result.e.phone).hold,1);assert.equal(result.text,null);}
 }finally{f.s.close();}}
});
