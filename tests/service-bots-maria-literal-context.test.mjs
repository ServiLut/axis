import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {customerDecision,Engine} from '../automation/service-bots/engine.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {MARIA_UNDERSTANDING_GUARD} from '../automation/service-bots/maria-understanding.mjs';
import {mariaLiteralServiceContext} from '../automation/service-bots/after-service.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';

const event=(text,id='SYNTHETIC_CONTEXT_SOURCE')=>({id,at:Date.now(),kind:'text',text,fromMe:false,forwarded:false,phone:'573000001234',line:BUSINESSES.fumigacion.phones[0]});
const empty=()=>({slots:{},asked:[],caseId:'SYNTHETIC_CONTEXT_CASE'});
const complete=()=>({slots:{service:'cucarachas',site:'apartamento',rooms:'2 habitaciones',location:'medellin'},asked:['service','site','size','location'],caseId:'SYNTHETIC_CONTEXT_CASE'});
const analysis=(e,kind='new-service')=>({guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,company:'FUMIGACION',eventId:e.id,intent:{kind,evidence:e.text.slice(0,200)},slots:{service:'cucarachas'}});
function fixture(){const s=new Store(':memory:','fumigacion',randomBytes(32)),c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,lines:BUSINESSES.fumigacion.phones.map(phone=>({phone}))},engine=new Engine(s,c);return {s,c,engine,async process(text,id,extra={}){const e={...event(text,id),...extra};s.enqueue(e);await engine.process(e);return e;}};}

test('the verified plural invoice complaint preserves the case before intake and requotation',()=>{
 for(const state of [empty(),complete()]){
  const e=event('Disculpe, no me han mandado mis facturas que le pedí'),d=customerDecision('fumigacion',state,e,analysis(e));
  assert.equal(d.reviewTopic,'service-documents');assert.equal(d.question,undefined);assert.deepEqual(d.state.slots,state.slots);assert.deepEqual(d.state.asked,state.asked);assert.equal(d.state.caseId,state.caseId);
  assert.doesNotMatch(d.reply,/plaga|inmueble|habitaciones|cotiz|enviad|emitid|list[oa]s|Sandra|TESA/i);
  assert.match(d.review,/no acredita/);
 }
});
test('current plural document delivery requests remain document review rather than new services',()=>{
 for(const text of ['Necesito mis certificados','Por favor envíenme las facturas','Me faltan los soportes del servicio','Aún no nos han enviado los documentos que solicitamos','Necesito las fichas de seguridad del servicio anterior']){
  const e=event(text),state=complete(),d=customerDecision('fumigacion',state,e,analysis(e));
  assert.equal(d.reviewTopic,'service-documents',text);assert.equal(d.question,undefined,text);assert.deepEqual(d.state.slots,state.slots);
 }
});
test('polite invoice and certificate requests are recognized with natural me-envian verb forms',()=>{
 for(const text of ['Buenas tardes, por favor me envían las facturas y los certificados de los servicios que realizaron.','Por favor me envian las facturas y certificados de los servicios que realizaron','¿Me envían la factura?','Hola por favor nos mandan los certificados','No me envían mis facturas que solicité']){
  const e=event(text),d=customerDecision('fumigacion',complete(),e,analysis(e));assert.equal(d.reviewTopic,'service-documents',text);assert.equal(d.question,undefined);assert.match(d.reply,/documentos/);
 }
});
test('certificate capability is a general question without asserting a previous service',()=>{
 for(const text of ['¿Ustedes entregan certificados?','¿Dan certificados si los contrato?','¿Qué documentos necesito antes de fumigar mi casa?']){
  const e=event(text),d=customerDecision('fumigacion',empty(),e,analysis(e));
  assert.equal(d.reviewTopic,'customer-question',text);assert.equal(d.state.requestedAfterServiceReview,undefined);assert.equal(d.question,undefined);assert.doesNotMatch(d.reply,/registro de tu servicio|ya.*servicio/);
 }
});
test('a certificate-only purpose is a capability question even when pests are explicitly denied',()=>{
 const e=event('Solo es para el certificado, no tenemos plagas'),d=customerDecision('fumigacion',empty(),e,analysis(e));
 assert.equal(d.reviewTopic,'customer-question');assert.equal(d.reviewConditions.kind,'documents-capability');assert.equal(d.observed,undefined);assert.match(d.reply,/documentos/);assert.deepEqual(d.state.slots,{});
});
test('nominal pending invoices request documents rather than silently observing a reference',()=>{
 for(const text of ['Disculpe, mis facturas siguen pendientes','Tengo pendiente la factura del servicio de ayer','Los certificados están pendientes']){
  const d=customerDecision('fumigacion',empty(),event(text));assert.equal(d.reviewTopic,'service-documents',text);assert.equal(d.observed,undefined);assert.match(d.reply,/documentos/);
 }
});
test('a current arrival report preserves the same case and never opens a quotation',()=>{
 for(const text of ['Estamos esperando su llegada','Estoy esperando al técnico','Seguimos esperando que llegue el fumigador'])for(const state of [empty(),complete()]){
  const e=event(text),d=customerDecision('fumigacion',state,e,analysis(e));
  assert.equal(d.reviewTopic,'service-followup',text);assert.equal(d.reviewConditions.kind,'arrival');assert.equal(d.question,undefined);assert.deepEqual(d.state.slots,state.slots);assert.deepEqual(d.state.asked,state.asked);assert.equal(d.state.caseId,state.caseId);
  assert.doesNotMatch(d.reply,/cotiz|plaga|inmueble|confirmad[oa].*(?:hora|visita)/);
 }
});
test('a reported existing schedule requests verification without quoting or creating an appointment',()=>{
 for(const text of ['Ya me agendaron para mañana a las 6pm','Me programaron para el martes','Ya tengo programada la fumigación de mañana'])for(const state of [empty(),complete()]){
  const e=event(text),d=customerDecision('fumigacion',state,e,analysis(e));
  assert.equal(d.reviewTopic,'disponibilidad-y-tecnico',text);assert.equal(d.reviewConditions.kind,'reported-existing-schedule');assert.equal(d.question,undefined);assert.deepEqual(d.state.slots,state.slots);assert.equal(d.state.caseId,state.caseId);
  assert.doesNotMatch(d.reply,/cotiz|plaga|inmueble|qued[oó].*agend|tu cita.*confirmad/);
 }
});
test('a repeated reported-schedule clarification preserves its one question and sends only one acknowledgement',async()=>{
 const f=fixture();try{
  const first=await f.process('Ya me agendaron para mañana a las tres, sólo quiero confirmar la visita','SYNTH_SCHEDULE_REPEAT_1');
  await f.process('Ya me agendaron para mañana a las tres sólo quiero confirmar la visita!','SYNTH_SCHEDULE_REPEAT_2',{at:first.at+1000});
  const questions=f.s.db.prepare('SELECT topic,body FROM questions').all();assert.equal(questions.length,1);assert.equal(questions[0].topic,'disponibilidad-y-tecnico');assert.equal(f.s.open(questions[0].body).source,first.id);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);assert.equal(f.s.conversation(first.phone).state.programServiceId,undefined);
 }finally{f.s.close();}
});
test('a purchase or product capability request cannot become a pest-control service',()=>{
 for(const text of ['Necesito comprar gel para cucarachas','¿Venden insecticidas?','Quisiera adquirir productos para control de plagas']){
  const e=event(text),state=empty(),d=customerDecision('fumigacion',state,e,analysis(e));
  assert.equal(d.reviewTopic,'customer-question',text);assert.equal(d.reviewConditions.kind,'product-commercial-question');assert.equal(d.question,undefined);assert.deepEqual(d.state.slots,state.slots);assert.doesNotMatch(d.reply,/vendemos|precio|plaga.*tratar|inmueble/);
 }
});
test('unsolicited supplier advertising is observed without a chief question or a customer quotation',async()=>{
 const f=fixture();try{
  const e=await f.process('Les ofrecemos productos para control de plagas','SYNTH_SUPPLIER_OFFER');
  assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OBSERVED_SUPPLIER_OFFER');
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.deepEqual(f.s.conversation(e.phone).state.slots,{});
 }finally{f.s.close();}
});
test('a directed supplier offer has only courtesy and no acceptance or operational intake',()=>{
 const e=event('María Ángel, les ofrecemos gel para cucarachas'),d=customerDecision('fumigacion',complete(),e,analysis(e));
 assert.equal(d.review,undefined);assert.equal(d.question,undefined);assert.equal(d.courtesy,true);assert.equal(d.reply,'Gracias por compartir tu propuesta.');assert.deepEqual(d.state.slots,complete().slots);
});
test('one plural document case creates one administrative question and its repetitions stay pending',async()=>{
 const f=fixture();try{
  const first=await f.process('No me han enviado mis facturas que les pedí','SYNTH_DOC_REQUEST_1');
  await f.process('Necesito también los certificados del servicio','SYNTH_DOC_REQUEST_2',{at:first.at+1000});
  const q=f.s.db.prepare('SELECT topic,recipient FROM questions').all();assert.deepEqual(q.map(x=>({...x})),[{topic:'service-documents',recipient:SANDRA}]);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);assert.equal(f.s.conversation(first.phone).state.awaitingHumanReview,true);
 }finally{f.s.close();}
});
test('staff takeover suppresses all literal context acknowledgements and internal questions',async()=>{
 for(const text of ['No me han enviado mis facturas','Estamos esperando su llegada','Ya me agendaron mañana','Necesito comprar gel para cucarachas','Les ofrecemos productos para control de plagas']){
  const f=fixture();try{const e=event(text);f.s.enqueue(e);f.s.hold(e.phone,'SYNTHETIC_STAFF_SOURCE',true);await f.engine.process(e);assert.ok(['OBSERVED_HUMAN','OBSERVED_SUPERSEDED'].includes(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state));assert.equal(f.s.conversation(e.phone).hold,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);}finally{f.s.close();}
 }
});
test('safety and reported payments keep priority over document and operational context requests',()=>{
 for(const text of ['Necesito mis facturas y tengo intoxicación','Estamos esperando su llegada, tengo dolor','Ya me agendaron y pagué por transferencia','Necesito comprar gel y estoy embarazada']){
  const d=customerDecision('fumigacion',empty(),event(text));assert.ok(d.review,text);assert.notEqual(d.reviewTopic,'service-documents');assert.notEqual(d.reviewConditions?.kind,'arrival');assert.notEqual(d.reviewConditions?.kind,'reported-existing-schedule');assert.notEqual(d.reviewConditions?.kind,'product-commercial-question');
 }
});
test('negated, hypothetical, third-party and quoted arrival or schedule words do not assert a visit or reprice the case',()=>{
 for(const text of ['No estamos esperando su llegada','Si estamos esperando su llegada, ¿qué pasaría?','Mi vecina dijo: ya me agendaron mañana','"Ya me agendaron para mañana"','No me agendaron para mañana','Si me agendaron para mañana, no lo sé']){
  const e=event(text),state=complete(),d=customerDecision('fumigacion',state,e,analysis(e));
  assert.notEqual(d.reviewConditions?.kind,'arrival',text);assert.notEqual(d.reviewConditions?.kind,'reported-existing-schedule',text);assert.equal(d.question,undefined,text);assert.deepEqual(d.state.slots,state.slots);assert.equal(d.state.programServiceId,undefined);
 }
});
test('denying documents or a product purchase does not erase an affirmed new-service request',()=>{
 for(const text of ['No necesito factura; quiero fumigar mi apartamento en Medellín por cucarachas','No quiero comprar gel para cucarachas; quiero una fumigación nueva para mi apartamento en Medellín']){
  const e=event(text),d=customerDecision('fumigacion',empty(),e,analysis(e));
  assert.notEqual(d.reviewTopic,'service-documents');assert.notEqual(d.reviewConditions?.kind,'product-commercial-question');assert.equal(d.review,undefined,text);assert.equal(d.state.slots.site,'apartamento');assert.equal(d.state.slots.location,'medellin');assert.match(d.reply,/habitaciones|metros/);
 }
});
test('arrival and schedule guards are scoped to Maria and do not assign a technical appointment',()=>{
 for(const text of ['Estamos esperando su llegada','Ya me agendaron para mañana a las 6pm']){
  const e=event(text),d=customerDecision('servicio-tecnico',{slots:{},asked:[]},e);
  assert.equal(d.reviewConditions?.guard,undefined);assert.equal(d.state.programServiceId,undefined);assert.equal(d.state.requestedAfterServiceReview,undefined);
 }
});
test('a rapid invoice complaint retains its original source when the literal detail follows',async()=>{
 const f=fixture();try{
  const first=event('No me han mandado mis facturas que le pedí','SYNTH_BATCH_DOCUMENTS'),next=event('La de hoy también necesito','SYNTH_BATCH_DETAIL');next.at=first.at+1000;
  f.s.enqueue(first);f.s.enqueue(next);await f.engine.process(first);await f.engine.process(next);
  const q=f.s.db.prepare('SELECT body,topic FROM questions').get();assert.equal(q.topic,'service-documents');assert.equal(f.s.open(q.body).source,first.id);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);assert.deepEqual(f.s.conversation(first.phone).state.slots,{});
 }finally{f.s.close();}
});
test('hypothetical product interest cannot create a product purchase or a new quote',()=>{
 for(const text of ['Si necesito comprar gel para cucarachas, ¿lo venden?','No necesito comprar gel para cucarachas','Mi vecina dijo que necesita comprar gel para cucarachas']){
  const e=event(text),state=complete(),context=mariaLiteralServiceContext(e),d=customerDecision('fumigacion',state,e,analysis(e));
  assert.ok(['context-reference','product-commercial-question'].includes(context?.kind),text);assert.equal(d.question,undefined,text);assert.deepEqual(d.state.slots,state.slots);assert.doesNotMatch(d.reply||'',/vendemos|compraste|compra.*confirmad|productos?.*entregad/);
 }
});
test('document, schedule and supplier context cannot advance an already accepted service registration form',async()=>{
 for(const text of ['Necesito mis facturas','Estamos esperando su llegada','Ya me agendaron para mañana','Necesito comprar gel para cucarachas','Les ofrecemos productos para control de plagas','No me agendaron para mañana','Mi vecina dijo: ya me agendaron mañana','Les ofrecemos productos para control de plagas disponibles mañana']){
  const f=fixture();try{
   const now=Date.now();f.s.importKnowledge(approvedBusinessPriceSchedule());
   f.c.mariaProgram={enabled:true,startsAt:now-60000,expiresAt:now+86400000,actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY};
   const first=await f.process('Tengo cucarachas en apartamento de 42 mts2 en Itagüí. Cuánto cuesta?','SYNTH_ACCEPTED_QUOTE');
   const row=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(first.id+':reply'),mid='SYNTH_OWN_QUOTE_MID';assert.ok(row);
   f.s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,row.id);f.s.recordFirstBotReply({...row,mid},mid,f.c.bot,first.at);f.s.delivery(mid,first.line,'DELIVERED');
   f.s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.s.seal({verifiedAt:first.at,mid,line:first.line,state:'DELIVERED'}),'first-delivery:'+row.id);
   const accepted=await f.process('Sí','SYNTH_ACCEPTANCE',{at:first.at+1000}),before=structuredClone(f.s.conversation(first.phone).state);
   assert.equal(before.quotedPrice.accepted,true);assert.ok(before.programIntake);
   await f.process(text,'SYNTH_POST_ACCEPTANCE_CONTEXT',{at:accepted.at+1000});
   const after=f.s.conversation(first.phone).state;assert.deepEqual(after.programIntake,before.programIntake,text);assert.deepEqual(after.slots,before.slots,text);
   assert.equal(after.programServiceId,undefined);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
  }finally{f.s.close();}
 }
});
