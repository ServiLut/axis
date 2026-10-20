import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,HILARY} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {registrationStatus} from '../automation/service-bots/maria-program.mjs';
import {CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {MARIA_UNDERSTANDING_GUARD} from '../automation/service-bots/maria-understanding.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';

// Same isolated Engine/Store approach as service-bots-reception-flow. All phone
// and source IDs here are synthetic; this suite cannot call a model or server.
function fixture({tesa=false}={}){
 const start=Math.floor((Date.now()-60000)/1000)*1000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:start-1000,
  lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'complaint-local-'+i})),
  mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-1000,expiresAt:start+86400000}};
 if(tesa){
  const now=Date.now(),participants=[...TESA_BOT_PHONES,HILARY],sender=c.lines[0].phone;
  c.tesaOperations={enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:sender,activatedAt:c.activatedAt,allowedParticipantPhones:[HILARY],
   verifiedMembership:{owner:sender,ownerOpen:true,verifiedAt:now,expiresAt:now+300000,sourceHash:'a'.repeat(64),participantPhones:participants,participantBindings:participants.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}};
 }
 const engine=new Engine(s,c);let seq=0;
 const event=(text,extra={})=>({id:'USER_COMPLAINT_LOCAL_'+ ++seq,phone:'573000001197',line:c.lines[0].phone,at:start+seq*1000,kind:'text',fromMe:false,forwarded:false,text,...extra});
 const row=e=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const result=e=>{const r=row(e);return {e,row:r,text:r?s.open(r.body):null,state:s.conversation(e.phone).state};};
 const process=async(e,semantic=null)=>{const analysis=semantic?{company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,intent:{kind:semantic,evidence:e.text.slice(0,200)},slots:{}}:{};await engine.process(e,analysis);return result(e);};
 const turn=async(text,semantic=null,extra={})=>{const e=event(text,extra);historicalPriceClock.timers.setTime(e.at);s.enqueue(e);return process(e,semantic);};
 const deliver=e=>{const r=row(e);assert.ok(r,e.id);const mid='MID_'+e.id;s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);s.recordFirstBotReply({...r,mid},mid,c.bot,e.at);s.delivery(mid,e.line,'DELIVERED');s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+r.id);};
 const questions=()=>s.db.prepare('SELECT id,phone,case_id,topic,recipient,source_id,outbox_id,body FROM questions ORDER BY rowid').all();
 const noBusiness=()=>{const r=registrationStatus(c,s);assert.equal(r.prepared,0);assert.equal(r.saved,0);assert.equal(s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);};
 return {s,c,engine,event,process,turn,deliver,result,questions,noBusiness};
}

async function mediaBurst(f){
 const greeting=await f.turn('Buenas tardes');f.deliver(greeting.e);
 const written=[f.event('comeje'),f.event('Barrio Salvador'),f.event('Es un apartamento prefabricado.')],firstImage=f.event('',{kind:'image'});
 for(const e of [...written,firstImage])f.s.enqueue(e);
 for(const e of written)await f.process(e);
 const first=await f.process(firstImage),second=await f.turn('',null,{kind:'image'});
 return {greeting,written,firstImage,first,second};
}

test('real missed sequence is acknowledged with empathy and precise limits while the own internal question is reused',async()=>{
 const f=fixture();try{
  const first=await f.turn('Aun seguimos con cucarachas 😭 Que podemos hacer?','reinforcement');
  assert.match(first.text||'',/Lamento que el problema con las cucarachas continúe/);assert.match(first.text,/pendiente|confirmad/);
  const questions=f.questions();assert.equal(questions.length,1);assert.equal(questions[0].case_id,first.state.caseId);
  f.deliver(first.e);const originalSource=f.s.open(questions[0].body).source;
  const counts=await f.turn('He realizado una fumigación y 3 refuerzos ya 🫠');
  assert.match(counts.text||'',/una fumigación y tres refuerzos/);assert.match(counts.text,/Me indicas/);
  assert.doesNotMatch(counts.text,/te hemos realizado|servicios registrados|se verificaron|gratis|garant[ií]a aprobada/i);
  assert.deepEqual(f.questions(),questions);assert.equal(counts.state.caseId,first.state.caseId);
  const request=await f.turn('Podemos hacer otro refuerzo hoy? Y me haces un descuentico');
  assert.match(request.text||'',/hoy/);assert.match(request.text,/descuento/);assert.match(request.text,/no están confirmados ni la visita para hoy ni el descuento/);
  assert.deepEqual(f.questions(),questions);assert.equal(f.s.open(f.questions()[0].body).source,originalSource);
  const status=await f.turn('Hola. Sigo pendiente');assert.match(status.text||'',/refuerzo sigue pendiente/);assert.match(status.text,/no tengo confirmadas/);
  assert.deepEqual(f.questions(),questions);assert.equal(f.s.conversation(status.e.phone).hold,0);assert.equal(status.state.caseId,first.state.caseId);
  for(const r of [first,counts,request,status])assert.doesNotMatch(r.text||'',/te (?:visitaremos|contactaremos)|asesora|agendad[oa]|reservad[oa]|descuento autorizado|garant[ií]a aprobada|\$\d/i);
  f.noBusiness();
 }finally{f.s.close();}
});

test('a human takeover stays silent through the same postservice updates without releasing or duplicating the question',async()=>{
 const f=fixture();try{
  const first=await f.turn('Aun seguimos con cucarachas 😭 Que podemos hacer?','reinforcement');const before=f.questions();assert.equal(before.length,1);
  f.s.hold(first.e.phone,'SYNTHETIC_STAFF_TAKEOVER',true);
  for(const text of ['He realizado una fumigación y 3 refuerzos ya 🫠','Podemos hacer otro refuerzo hoy? Y me haces un descuentico','Hola. Sigo pendiente']){
   const result=await f.turn(text);assert.equal(result.text,null,text);assert.equal(f.s.conversation(result.e.phone).hold,1);assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(result.e.id).state,'OBSERVED_HUMAN');assert.deepEqual(f.questions(),before);
  }
  f.noBusiness();
 }finally{f.s.close();}
});

test('generic control de Plaga is not accepted as a pest and the missing pest is asked directly',async()=>{
 const f=fixture();try{
  const result=await f.turn('Necesito control de Plaga');
  assert.match(result.text||'',/qu[eé] plaga/i);assert.doesNotMatch(result.text,/precio confirmado|cotización.*confirmación|tecnico|técnico/i);
  assert.notEqual(result.state.slots.service,'control de Plaga');assert.equal(result.state.quotedPrice,undefined);assert.equal(f.questions().length,0);f.noBusiness();
 }finally{f.s.close();}
});

test('Rosales newline Belén is retained literally and only the municipality remains missing',async()=>{
 const f=fixture();try{
  const first=await f.turn('Cucarachas en apartamento de 3 habitaciones');assert.match(first.text||'',/municipio/i);
  const result=await f.turn('Rosales\nBelén');
  assert.match(result.state.slots.locationDetails||'',/Rosales/);assert.match(result.state.slots.locationDetails||'',/Belén/);
  assert.equal(result.state.slots.location,undefined);assert.match(result.text||'',/municipio/i);assert.doesNotMatch(result.text,/(?:municipio\s+y\s+barrio|qu[eé]\s+barrio|en\s+qu[eé]\s+barrio)/i);
  assert.equal(result.state.slots.rooms,'3 habitaciones');assert.equal(result.state.quotedPrice,undefined);assert.equal(f.questions().length,0);f.noBusiness();
 }finally{f.s.close();}
});

test('split Rosales and Belén in a rapid native batch preserve both location fragments and never infer Medellín',async()=>{
 const f=fixture();try{
  await f.turn('Cucarachas en apartamento de 3 habitaciones');const first=f.event('Rosales'),second=f.event('Belén');f.s.enqueue(first);f.s.enqueue(second);
  await f.process(first);const result=await f.process(second);
  assert.match(result.state.slots.locationDetails||'',/Rosales/);assert.match(result.state.slots.locationDetails||'',/Belén/);assert.equal(result.state.slots.location,undefined);
  assert.deepEqual(result.state.intakeSources.locationDetails.sources.map(ref=>ref.sourceId),[first.id,second.id]);
  assert.match(result.text||'',/municipio/i);assert.doesNotMatch(result.text,/(?:municipio\s+y\s+barrio|qu[eé]\s+barrio|en\s+qu[eé]\s+barrio)/i);f.noBusiness();
 }finally{f.s.close();}
});

test('three bedrooms and two bathrooms retain the literal bedroom count without summing both as bedrooms',async()=>{
 const f=fixture();try{
  const first=await f.turn('Cucarachas en apartamento en Medellín');assert.match(first.text||'',/habitaciones|metros cuadrados/i);
  const result=await f.turn('3 habitaciones 2 baños');assert.equal(result.state.slots.rooms,'3 habitaciones');assert.equal(result.state.slots.area,undefined);
  assert.match(result.text||'',/149\.000/);assert.doesNotMatch(result.text,/cuántas habitaciones|cinco habitaciones|5 habitaciones|metros cuadrados tiene/i);
  assert.equal(result.state.quotedPrice.priceCop,149000);assert.equal(f.questions().length,0);f.noBusiness();
 }finally{f.s.close();}
});

test('a bare written count after an either-unit size question requires the unit instead of inventing square metres or bedrooms',async()=>{
 const f=fixture();try{
  const first=await f.turn('Cucarachas en apartamento en Medellín');assert.match(first.text||'',/habitaciones|metros cuadrados/i);
  const result=await f.turn('Son tres');assert.equal(result.state.slots.area,undefined);assert.equal(result.state.slots.rooms,undefined);assert.equal(result.state.quotedPrice,undefined);
  assert.match(result.text||'',/habitaciones|metros cuadrados/i);assert.doesNotMatch(result.text,/\$\d|precio confirmado|pendiente de confirmación|datos completos/i);
  assert.equal(f.questions().length,0);f.noBusiness();
  f.deliver(result.e);
  const clarified=await f.turn('Habitaciones');assert.match(clarified.state.slots.rooms||'',/tres|3/);assert.equal(clarified.state.slots.area,undefined);assert.equal(clarified.state.quotedPrice.priceCop,149000);assert.match(clarified.text||'',/149\.000/);
  assert.deepEqual(clarified.state.intakeSources.rooms.sources.map(ref=>ref.sourceId),[result.e.id,clarified.e.id]);f.noBusiness();
 }finally{f.s.close();}
});

test('a separate room unit cannot resolve an undelivered, later-acknowledged, forwarded, different-case or human-held clarification',async()=>{
 for(const variant of ['undelivered','late-ack','forwarded','wrong-case','human-hold']){
  const f=fixture();try{
   await f.turn('Cucarachas en apartamento en Medellín');const clarification=await f.turn('Son tres');
   assert.match(clarification.text||'',/habitaciones|metros cuadrados/i);assert.equal(clarification.state.slots.rooms,undefined);
   if(variant!=='undelivered')f.deliver(clarification.e);
   if(variant==='late-ack'){
    const key='first-delivery:'+clarification.e.id+':reply',proof=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value);
    f.s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.s.seal({...proof,verifiedAt:clarification.e.at+100000}),key);
   }
   if(variant==='wrong-case')f.s.saveConversation(clarification.e.phone,{...f.s.conversation(clarification.e.phone).state,caseId:'fumigacion:OTHER_SYNTHETIC_CASE'});
   if(variant==='human-hold')f.s.hold(clarification.e.phone,'SYNTHETIC_UNIT_STAFF',true);
   const result=await f.turn('Habitaciones',null,variant==='forwarded'?{forwarded:true}:{});
   assert.equal(result.state.slots.rooms,undefined,variant);assert.equal(result.state.slots.area,undefined,variant);assert.equal(result.state.quotedPrice,undefined,variant);
   assert.doesNotMatch(result.text||'',/149\.000|tres habitaciones|3 habitaciones/,variant);
   if(variant==='human-hold'){assert.equal(result.text,null);assert.equal(f.s.conversation(result.e.phone).hold,1);}
   assert.equal(f.questions().length,0,variant);f.noBusiness();
  }finally{f.s.close();}
 }
});

test('rapid text and two unread images receive one contextual acknowledgement and one media review question',async()=>{
 const f=fixture();try{
  const greeting=await f.turn('Buenas tardes');f.deliver(greeting.e);
  const written=[f.event('comeje'),f.event('Barrio Salvador'),f.event('Es un apartamento prefabricado.')],firstImage=f.event('',{kind:'image'});
  for(const e of [...written,firstImage])f.s.enqueue(e);
  for(const e of written)await f.process(e);
  const first=await f.process(firstImage);
  assert.ok(first.text);assert.match(first.text,/apartamento/i);assert.match(first.text,/Barrio Salvador/i);assert.match(first.text,/¿Te refieres a comején\?/);
  assert.match(first.text,/contenido.*necesita revisión/);assert.doesNotMatch(first.text,/veo|en la foto|la imagen muestra|confirm[oó].*comején|\$\d|agendad|reservad/i);
  assert.equal(first.state.slots.location,undefined);assert.equal(first.state.quotedPrice,undefined);assert.equal(first.state.slots.site,'apartamento');
  const question=f.questions();assert.equal(question.length,1);assert.equal(question[0].topic,'media-content-review');assert.equal(f.s.open(question[0].body).source,firstImage.id);
  const second=await f.turn('',null,{kind:'image'});assert.equal(second.text,null);assert.deepEqual(f.questions(),question);
  assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE phone=? AND internal=0 AND id<>?").get(greeting.e.phone,greeting.e.id+':reply').n,1);
  assert.equal(second.state.pendingMediaBurst.firstSourceId,firstImage.id);assert.equal(second.state.pendingMediaBurst.sourceIds.includes(second.e.id),true);f.noBusiness();
 }finally{f.s.close();}
});

test('an own delivered pest clarification accepts the new immediate direct yes using both native fragments',async()=>{
 const f=fixture();try{
  const burst=await mediaBurst(f);assert.match(burst.first.text||'',/¿Te refieres a comején\?/);f.deliver(burst.first.e);
  const result=await f.turn('Sí');assert.equal(result.state.slots.service,'comején');
  assert.deepEqual(result.state.intakeSources.service.sources.map(ref=>ref.sourceId),[burst.written[0].id,result.e.id]);
  assert.equal(result.state.slots.location,undefined);assert.equal(result.state.quotedPrice,undefined);assert.doesNotMatch(result.text||'',/imagen muestra|veo.*comej[eé]n|garant[ií]a|\$\d|agendad|reservad/i);f.noBusiness();
 }finally{f.s.close();}
});

test('no-delivery, later acknowledgement, forwarded yes, other case and human attention cannot resolve a pest clarification from a media burst',async()=>{
 for(const variant of ['undelivered','late-ack','forwarded','wrong-case','human-hold']){
  const f=fixture();try{
   const burst=await mediaBurst(f);assert.match(burst.first.text||'',/¿Te refieres a comején\?/);
   if(variant!=='undelivered')f.deliver(burst.first.e);
   if(variant==='late-ack'){
    const key='first-delivery:'+burst.first.e.id+':reply',proof=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value);
    f.s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.s.seal({...proof,verifiedAt:burst.first.e.at+100000}),key);
   }
   if(variant==='wrong-case')f.s.saveConversation(burst.first.e.phone,{...f.s.conversation(burst.first.e.phone).state,caseId:'fumigacion:OTHER_SYNTHETIC_PEST_CASE'});
   if(variant==='human-hold')f.s.hold(burst.first.e.phone,'SYNTHETIC_PEST_STAFF',true);
   const result=await f.turn('Sí',null,variant==='forwarded'?{forwarded:true}:{});
   assert.notEqual(result.state.slots.service,'comején',variant);assert.equal(result.state.quotedPrice,undefined,variant);
   if(variant==='human-hold'){assert.equal(result.text,null);assert.equal(f.s.conversation(result.e.phone).hold,1);}
   f.noBusiness();
  }finally{f.s.close();}
 }
});

test('a denied pest clarification cannot revive after another attachment and a later yes',async()=>{
 const f=fixture();try{
  const burst=await mediaBurst(f);f.deliver(burst.first.e);
  const denied=await f.turn('No');assert.equal(denied.state.pendingPestClarification,undefined);
  await f.turn('',null,{kind:'image'});
  const result=await f.turn('Sí');assert.notEqual(result.state.slots.service,'comején');assert.equal(result.state.quotedPrice,undefined);f.noBusiness();
 }finally{f.s.close();}
});

test('a private media question cannot hide the own pending TESA quotation from a direct status request',async()=>{
 const f=fixture({tesa:true});try{
  const quoted=await f.turn('Cucarachas en un edificio de 7 apartamentos en Medellín');
  const groupBefore=f.s.db.prepare('SELECT * FROM tesa_questions').all();assert.equal(groupBefore.length,1);assert.equal(groupBefore[0].topic,'special-quotation');
  const media=await f.turn('',null,{kind:'image'});assert.ok(media.text);const privateBefore=f.questions();assert.equal(privateBefore.length,1);assert.equal(privateBefore[0].topic,'media-content-review');
  const status=await f.turn('Sigo pendiente');assert.match(status.text||'',/consultando el valor y qué incluye el servicio/);assert.doesNotMatch(status.text,/archivo|imagen|revisi[oó]n del contenido/);
  assert.equal(status.state.caseId,quoted.state.caseId);assert.deepEqual(f.questions(),privateBefore);assert.deepEqual(f.s.db.prepare('SELECT * FROM tesa_questions').all(),groupBefore);f.noBusiness();
 }finally{f.s.close();}
});
