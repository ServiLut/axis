import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,validateEvent} from '../automation/service-bots/config.mjs';
import {decodeWebhook} from '../automation/service-bots/webhook.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {acceptsOrdinaryQuotation,registrationStatus} from '../automation/service-bots/maria-program.mjs';
import {afterServiceKind} from '../automation/service-bots/after-service.mjs';
const actorId='7508385b-536e-4aa2-8137-d734dfc900ef';
const complaint='Buenas noches. Contratamos el servicio de fumigación y pagamos en dos ocasiones para controlar cucarachas. Han pasado más de 10 días desde los servicios y el problema está peor. Solicitamos una garantía y una solución efectiva.';
function fixture(){
 const start=Math.floor(Date.now()/1000)*1000-30000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'SYNTHETIC_OWN_'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId,startsAt:start-60000,expiresAt:start+86400000}};
 const engine=new Engine(s,c);let seq=0;
 const turn=async(text,extra={})=>{
  const raw={id:'INTAKE_CONTINUITY_'+ ++seq,phone:'573009000011',line:c.lines[0].phone,at:start+seq*1000,kind:'text',fromMe:false,forwarded:false,text,...extra};
  const line=c.lines.find(value=>value.phone===raw.line),contextInfo={...(raw.quotedId?{stanzaId:raw.quotedId}:{}),...(raw.forwarded?{isForwarded:true}:{})};
  const native={event:'messages.upsert',instance:line.instance,data:{key:{id:raw.id,remoteJid:raw.phone+'@s.whatsapp.net',fromMe:raw.fromMe},messageTimestamp:raw.at/1000,message:{extendedTextMessage:{text:raw.text,contextInfo}}}};
  const parsed=decodeWebhook(native,c);assert.equal(parsed.events.length,1);const e=validateEvent(parsed.events[0],c,start+30000);assert.ok(e);assert.equal(e.quotedId,raw.quotedId||null);assert.equal(e.quoteId,undefined);
  historicalPriceClock.timers.setTime(e.at);s.enqueue(e);await engine.process(e);return e;
 };
 const row=e=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const reply=e=>{const r=row(e);return r?s.open(r.body):null;};
 const deliver=e=>{const r=row(e);assert.ok(r,'own reply '+e.id);const mid='SYNTHETIC_MID_'+e.id;s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);s.recordFirstBotReply({...r,mid},mid,c.bot,e.at);s.delivery(mid,e.line,'READ');s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({verifiedAt:e.at,mid,line:e.line,state:'READ'}),'first-delivery:'+r.id);return reply(e);};
 const quote=async()=>{const e=await turn('Tengo cucarachas en apartamento de 42 mts2 en Medellín. ¿Cuánto cuesta?');assert.match(deliver(e),/129.000/);return e;};
 return {s,c,engine,turn,row,reply,deliver,quote};
}

test('a plural warranty complaint survives a greeting, its quoted followup and later property fragments',async()=>{
 const f=fixture();try{
  const first=await f.turn(complaint);f.deliver(first);f.deliver(await f.turn('Buenas tardes'));
  for(const [text,extra] of [['Me confirmas porfa',{quotedId:first.id}],['Casa',{}],['120',{}]]){
   const e=await f.turn(text,extra),state=f.s.conversation(e.phone).state;
   assert.equal(state.caseId,'fumigacion:'+first.id);assert.equal(state.requestedAfterServiceReview?.sourceId,first.id);
   assert.doesNotMatch(f.reply(e)||'',/qué tipo de inmueble|cuántas habitaciones|metros cuadrados|cotizaci[oó]n|129\.000/i);
  }
  assert.equal(registrationStatus(f.c,f.s).prepared,0);
  assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM questions WHERE topic='cotizacion-verificada'").get().n,0);
 }finally{f.s.close();}
});

test('a legitimate new quote to a stored same-case complaint can restore its context without replaying the old event',async()=>{
 const f=fixture();try{
  const first=await f.turn(complaint);f.deliver(first);let state=f.s.conversation(first.phone).state;delete state.requestedAfterServiceReview;f.s.saveConversation(first.phone,state);
  f.deliver(await f.turn('Buenas tardes'));
  const before=f.s.db.prepare('SELECT state FROM events WHERE id=?').get(first.id).state,original=f.row(first);
  const followup=await f.turn('Me confirmas porfa',{quotedId:first.id});state=f.s.conversation(first.phone).state;
  assert.equal(state.requestedAfterServiceReview?.sourceId,first.id);assert.equal(state.requestedAfterServiceReview?.kind,'warranty');
  assert.doesNotMatch(f.reply(followup)||'',/tipo de inmueble|metros cuadrados/);
  assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(first.id).state,before);assert.equal(f.row(first).mid,original.mid);
 }finally{f.s.close();}
});

test('restoring a quoted complaint preserves its still-pending historical question instead of rerouting or duplicating it',async()=>{
 const f=fixture();try{
  const first=await f.turn(complaint);f.deliver(first);
  const initial=f.s.db.prepare('SELECT * FROM questions WHERE phone=? AND recipient=?').get(first.phone,SANDRA);
  f.s.db.prepare('DELETE FROM questions WHERE id=?').run(initial.id);f.s.db.prepare('DELETE FROM outbox WHERE id=?').run(initial.outbox_id);
  f.s.question({phone:first.phone,line:first.line,caseId:'fumigacion:'+first.id,recipient:SANDRA,topic:'revision:'+first.id,conditions:{event:first.id,caseId:'fumigacion:'+first.id},source:first.id,text:'Consulta histórica propia'});
  const old=f.s.db.prepare('SELECT * FROM questions WHERE phone=? AND recipient=?').get(first.phone,SANDRA);
  const originalOutbox=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(old.outbox_id);
  const state=f.s.conversation(first.phone).state;delete state.requestedAfterServiceReview;f.s.saveConversation(first.phone,state);f.deliver(await f.turn('Buenas tardes'));
  await f.turn('Me confirmas porfa',{quotedId:first.id});await f.turn('Casa');await f.turn('120');
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions WHERE phone=?').get(first.phone).n,1);
  assert.deepEqual({...f.s.db.prepare('SELECT id,recipient,topic,outbox_id FROM questions').get()},{id:old.id,recipient:SANDRA,topic:'revision:'+first.id,outbox_id:old.outbox_id});
  const retained=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(old.outbox_id);assert.equal(retained.body,originalOutbox.body);assert.equal(retained.state,originalOutbox.state);
 }finally{f.s.close();}
});

test('a later payment exception preserves the warranty marker without confirming the payment',async()=>{
 const f=fixture();try{
  const e=await f.turn('Ya pagué por transferencia. Solicitamos una garantía del servicio anterior.'),state=f.s.conversation(e.phone).state;
  assert.equal(state.requestedAfterServiceReview?.kind,'warranty');assert.equal(state.requestedAfterServiceReview?.sourceId,e.id);
  assert.match(f.reply(e),/falta verificar/);assert.doesNotMatch(f.reply(e),/pago confirmado|garant[ií]a concedida/);
 }finally{f.s.close();}
});

test('a quoted legacy complaint later than the first greeting belongs to the same bounded active case',async()=>{
 const f=fixture();try{
  const greeting=await f.turn('Buenas tardes');f.deliver(greeting);const claim=await f.turn(complaint);f.deliver(claim);
  const state=f.s.conversation(claim.phone).state;delete state.requestedAfterServiceReview;f.s.saveConversation(claim.phone,state);f.deliver(await f.turn('Buenas tardes'));
  const e=await f.turn('Me confirmas porfa',{quotedId:claim.id}),now=f.s.conversation(e.phone).state;
  assert.equal(now.caseId,'fumigacion:'+greeting.id);assert.equal(now.requestedAfterServiceReview?.sourceId,claim.id);assert.doesNotMatch(f.reply(e)||'',/tipo de inmueble|metros cuadrados/);
 }finally{f.s.close();}
});

test('quotation of a complaint before an explicit fresh-case reset cannot restore that older context',async()=>{
 const f=fixture();try{
  const claim=await f.turn(complaint);f.deliver(claim);const fresh=await f.turn('Necesito un servicio nuevo para cucarachas en apartamento de 42 mts2 en Medellín');f.deliver(fresh);
  const e=await f.turn('Me confirmas porfa',{quotedId:claim.id}),state=f.s.conversation(e.phone).state;
  assert.equal(state.caseId,'fumigacion:'+fresh.id);assert.equal(state.requestedAfterServiceReview,undefined);
 }finally{f.s.close();}
});

test('an explicit fresh service in the quoting turn takes precedence over the older complaint context',async()=>{
 const f=fixture();try{
  const claim=await f.turn(complaint);f.deliver(claim);
  const fresh=await f.turn('Necesito un servicio nuevo para cucarachas en apartamento de 42 mts2 en Medellín',{quotedId:claim.id});
  assert.equal(f.s.conversation(fresh.phone).state.caseId,'fumigacion:'+fresh.id);assert.equal(f.s.conversation(fresh.phone).state.requestedAfterServiceReview,undefined);
 }finally{f.s.close();}
});

test('a quote from a foreign phone or own different line cannot restore the active customer case',async()=>{
 for(const variant of ['phone','line']){const f=fixture();try{
  const greeting=await f.turn('Buenas tardes');f.deliver(greeting);
  const unrelated=await f.turn(complaint,variant==='phone'?{phone:'573009000022'}:{line:f.c.lines[1].phone});f.deliver(unrelated);
  if(variant==='line'){const legacy=f.s.conversation(greeting.phone).state;delete legacy.requestedAfterServiceReview;f.s.saveConversation(greeting.phone,legacy);}
  const e=await f.turn('Me confirmas porfa',{quotedId:unrelated.id});assert.equal(f.s.conversation(e.phone).state.requestedAfterServiceReview,undefined);
 }finally{f.s.close();}}
});

test('a forwarded source or forwarded quoting turn is not a direct own-customer context restoration',async()=>{
 for(const variant of ['source','current']){const f=fixture();try{
  const claim=await f.turn(complaint,variant==='source'?{forwarded:true}:{});f.deliver(claim);const state=f.s.conversation(claim.phone).state;delete state.requestedAfterServiceReview;f.s.saveConversation(claim.phone,state);f.deliver(await f.turn('Buenas tardes'));
  if(variant==='current'){const legacy=f.s.conversation(claim.phone).state;delete legacy.requestedAfterServiceReview;f.s.saveConversation(claim.phone,legacy);}
  const e=await f.turn('Me confirmas porfa',{quotedId:claim.id,...(variant==='current'?{forwarded:true}:{})});assert.equal(f.s.conversation(e.phone).state.requestedAfterServiceReview,undefined);
 }finally{f.s.close();}}
});

test('plural warranty requests remain claims for review rather than negated, hypothetical or generic warranty questions',()=>{
 for(const text of ['Solicitamos una garantía del servicio','Necesitamos la garantía de la fumigación','Requerimos aplicar la garantía','Pedimos la garantía del tratamiento'])assert.equal(afterServiceKind(text),'warranty',text);
 for(const text of ['No solicitamos una garantía','Si solicitamos una garantía, ¿qué pasaría?','¿Qué significa garantía?','Nunca necesitamos una garantía'])assert.equal(afterServiceKind(text),null,text);
});

test('treating all floors or a different municipality still requires scope review rather than the ordinary address exception',async()=>{
 for(const address of ['Calle 10 # 20-30 para fumigar todos los pisos','Calle 10 # 20-30 para tratar 2 pisos','Calle 10 # 20-30 en Soacha']){const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Sí'));const e=await f.turn('Nombre: Persona Sintética\nDirección: '+address);
  assert.equal(f.s.conversation(e.phone).state.programIntake?.stage,'review');assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}}
});

test('price scope clarification does not affirm products, warranties, extra pests or new services',async()=>{
 for(const text of ['¿El precio ya incluye cucarachas y chinches?','¿El precio ya incluye garantía?','¿El precio ya incluye el servicio gratis para cucarachas?','¿El precio ya incluye un nuevo servicio para cucarachas?']){const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Sí'));const e=await f.turn(text);assert.notEqual(f.reply(e),'Sí, la cotización de $129.000 COP es para el control de cucarachas.');assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}}
});

test('a complete literal date preference after yes is consent only with an accented or punctuated affirmative',()=>{
 for(const text of ['Sí, mañana en la tarde','Si, mañana en la tarde','Sí mañana en la tarde','Sí, para mañana','Sí, mañana a las 3 pm','Sí, el viernes por la mañana.','Sí, mañana en la tarde. Nombre: Persona Sintética\nDirección: Calle 10 # 20-30'])assert.equal(acceptsOrdinaryQuotation(text),true,text);
 for(const text of ['Si mañana en la tarde','Si mañana llueve lo hacemos otro día','Sí, si mañana queda libre','Sí, mañana pero con descuento','Sí, mañana ¿está disponible?','El técnico dijo Sí, mañana en la tarde'])assert.equal(acceptsOrdinaryQuotation(text),false,text);
});

test('literal timed acceptance continues the delivered own quotation and starts its missing-fields form',async()=>{
 const f=fixture();try{
  const quote=await f.quote(),e=await f.turn('Sí, mañana en la tarde'),state=f.s.conversation(e.phone).state;
  assert.equal(state.quotedPrice.sourceId,quote.id);assert.equal(state.quotedPrice.accepted,true);assert.equal(state.programIntake?.stage,'name');
  assert.match(f.reply(e),/nombre completo/);assert.doesNotMatch(f.reply(e),/129\.000/);
 }finally{f.s.close();}
});

test('a literal own-price scope question during the form answers without losing the missing-fields prompt',async()=>{
 const f=fixture();try{
  const q=await f.quote();f.deliver(await f.turn('Sí'));const before=f.s.conversation(q.phone).state.programIntake;
  const e=await f.turn('¿El precio ya incluye el servicio para cucarachas?'),state=f.s.conversation(e.phone).state;
  assert.match(f.reply(e)||'',/129\.000.*cucarachas/);assert.deepEqual(state.programIntake,before);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});

test('an ordinary address floor is a location component rather than a request to treat multiple floors',async()=>{
 const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Sí'));
  const e=await f.turn('Nombre: Persona Sintética\nDirección: Calle 10 # 20-30 piso 2 apartamento 201');
  assert.equal(f.s.conversation(e.phone).state.programIntake?.stage,'confirm');assert.match(f.reply(e)||'',/piso 2 apartamento 201/);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.s.close();}
});

test('a standalone preference supplied during the form stays literal and reaches the pending payload with its own source',async()=>{
 const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Sí'));
  const timing=await f.turn('Para mañana en la tarde');f.deliver(timing);
  assert.equal(f.s.conversation(timing.phone).state.slots.preference,'mañana en la tarde');
  const fields=await f.turn('Nombre: Persona Sintética\nDirección: Calle 10 # 20-30');assert.match(f.deliver(fields),/Preferencia solicitada: mañana en la tarde/);assert.match(f.reply(fields),/pendiente de coordinación/);
  const accepted=await f.turn('Confirmo');
  const row=f.s.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").get(),entry=row&&f.s.open(row.value);
  assert.equal(entry?.status,'PENDING');assert.equal(entry.payload.slots.preference,'mañana en la tarde');
  assert.deepEqual(entry.payload.sources.preference,{id:timing.id,text:timing.text,at:new Date(timing.at).toISOString()});
  assert.equal(entry.payload.sources.acceptance.id,accepted.id);assert.equal(entry.payload.fechaVisita,undefined);assert.equal(entry.payload.tecnicoId,undefined);
 }finally{f.s.close();}
});

test('availability asked before quoting preserves the requested timing source without inventing an appointment',async()=>{
 const f=fixture();try{
  f.deliver(await f.turn('Quiero cotizar una fumigación'));
  const timing=await f.turn('¿Pueden venir el viernes en la mañana?');f.deliver(timing);
  const quote=await f.turn('Cucarachas, apartamento de 42 mts2 en Medellín');assert.match(f.deliver(quote),/129.000/);
  f.deliver(await f.turn('Sí'));f.deliver(await f.turn('Nombre: Persona Sintética\nDirección: Calle 10 # 20-30'));await f.turn('Confirmo');
  const entry=f.s.open(f.s.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").get().value);
  assert.equal(entry.payload.slots.preference,'viernes en la mañana');assert.equal(entry.payload.sources.preference.id,timing.id);assert.equal(entry.payload.sources.preference.text,timing.text);
  assert.equal(entry.payload.fechaVisita,undefined);assert.equal(entry.payload.tecnicoId,undefined);
 }finally{f.s.close();}
});

test('a corrected preference after the summary requires a newly delivered summary before registration',async()=>{
 const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Sí, mañana en la tarde'));
  f.deliver(await f.turn('Nombre: Persona Sintética\nDirección: Calle 10 # 20-30'));
  const changed=await f.turn('Para el viernes por la mañana');assert.match(f.reply(changed)||'',/Preferencia solicitada: viernes por la mañana/);
  assert.equal(registrationStatus(f.c,f.s).prepared,0);
  f.deliver(changed);await f.turn('Confirmo');
  const entry=f.s.open(f.s.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").get().value);
  assert.equal(entry.payload.slots.preference,'viernes por la mañana');assert.equal(entry.payload.sources.preference.id,changed.id);assert.equal(entry.summaryOutboxId,changed.id+':reply');
 }finally{f.s.close();}
});

test('a literal time-of-day fragment during the form is a preference rather than the customer name',async()=>{
 for(const phrase of ['En la tarde','Por la mañana','En la noche']){const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Sí'));const timing=await f.turn(phrase),state=f.s.conversation(timing.phone).state;
  assert.equal(state.programIntake.customerName,undefined);assert.equal(state.slots.preference,phrase);assert.match(f.deliver(timing),/nombre completo/);
  const fields=await f.turn('Nombre: Persona Sintética\nDirección: Calle 10 # 20-30');f.deliver(fields);await f.turn('Confirmo');
  const entry=f.s.open(f.s.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").get().value);
  assert.equal(entry.payload.customerName,'Persona Sintética');assert.equal(entry.payload.slots.preference,phrase);assert.equal(entry.payload.sources.preference.id,timing.id);assert.equal(entry.payload.fechaVisita,undefined);
 }finally{f.s.close();}}
});

test('an unsourced or mismatched preference cannot be serialized as a verified requested time',async()=>{
 for(const mode of ['missing','wrong-at','foreign-phone','earlier-case-at']){const f=fixture();try{
  const quote=await f.quote();f.deliver(await f.turn('Sí'));const state=f.s.conversation(quote.phone).state;
  state.slots.preference='el viernes en la mañana';state.intakeSources={...state.intakeSources,preference:{sourceId:'MISSING_PREFERENCE_SOURCE',at:quote.at}};
  if(mode==='wrong-at')state.intakeSources.preference={sourceId:quote.id,at:quote.at+1};
  if(mode==='foreign-phone'){
   const raw={id:'FOREIGN_PREFERENCE_SOURCE',phone:'573009000022',line:f.c.lines[0].phone,at:quote.at,kind:'text',fromMe:false,text:'el viernes en la mañana'};f.s.enqueue(raw);state.intakeSources.preference={sourceId:raw.id,at:raw.at};
  }
  if(mode==='earlier-case-at'){
   const raw={id:'EARLIER_CASE_PREFERENCE',phone:quote.phone,line:quote.line,at:quote.at-1000,kind:'text',fromMe:false,forwarded:false,text:'el viernes en la mañana'};f.s.enqueue(raw);state.intakeSources.preference={sourceId:raw.id,at:raw.at};
  }
  f.s.saveConversation(quote.phone,state);f.deliver(await f.turn('Nombre: Persona Sintética\nDirección: Calle 10 # 20-30'));await f.turn('Confirmo');
  const entry=f.s.open(f.s.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").get().value);
  assert.equal(entry.payload.slots.preference,undefined);assert.equal(entry.payload.sources.preference,undefined);
 }finally{f.s.close();}}
});
