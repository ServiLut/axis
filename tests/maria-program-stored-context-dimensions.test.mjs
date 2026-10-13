import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision,extractSlots} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,validateEvent} from '../automation/service-bots/config.mjs';
import {decodeWebhook} from '../automation/service-bots/webhook.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {registrationStatus} from '../automation/service-bots/maria-program.mjs';
const complaint='Contratamos dos fumigaciones y el problema sigue peor. Solicitamos una garantía del servicio anterior.';
function fixture(){
 const start=Math.floor(Date.now()/1000)*1000-30000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'synthetic-context-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-60000,expiresAt:start+86400000}};
 const engine=new Engine(s,c);let seq=0;
 const turn=async(text,extra={})=>{
  const raw={id:'STORED_DIMENSIONS_'+ ++seq,phone:'573009000011',line:c.lines[0].phone,at:start+seq*1000,kind:'text',fromMe:false,forwarded:false,text,...extra},line=c.lines.find(l=>l.phone===raw.line);
  const parsed=decodeWebhook({event:'messages.upsert',instance:line.instance,data:{key:{id:raw.id,remoteJid:raw.phone+'@s.whatsapp.net',fromMe:raw.fromMe},messageTimestamp:raw.at/1000,message:{extendedTextMessage:{text:raw.text,contextInfo:{...(raw.quotedId?{stanzaId:raw.quotedId}:{}),...(raw.forwarded?{isForwarded:true}:{})}}}}},c);
  const e=validateEvent(parsed.events[0],c,start+30000);assert.ok(e);s.enqueue(e);await engine.process(e);return e;
 };
 const row=e=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply'),reply=e=>{const r=row(e);return r?s.open(r.body):null;};
 const deliver=e=>{const r=row(e);assert.ok(r);const mid='SYNTH_STORED_MID_'+e.id;s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);s.recordFirstBotReply({...r,mid},mid,c.bot,e.at);s.delivery(mid,e.line,'READ');s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({verifiedAt:e.at,mid,line:e.line,state:'READ'}),'first-delivery:'+r.id);return reply(e);};
 const eraseMarker=phone=>{const state=s.conversation(phone).state;delete state.requestedAfterServiceReview;s.saveConversation(phone,state);};
 return {s,c,engine,turn,row,reply,deliver,eraseMarker};
}
test('an uncited current fragment restores a direct pending warranty inside the active case without another question or replay',async()=>{
 const f=fixture();try{
  const greeting=await f.turn('Buenas tardes');f.deliver(greeting);const claim=await f.turn(complaint);f.deliver(claim);
  const initial=f.s.db.prepare('SELECT * FROM questions WHERE phone=? AND recipient=?').get(claim.phone,SANDRA);
  f.s.db.prepare('DELETE FROM questions WHERE id=?').run(initial.id);f.s.db.prepare('DELETE FROM outbox WHERE id=?').run(initial.outbox_id);
  f.s.question({phone:claim.phone,line:claim.line,caseId:'fumigacion:'+greeting.id,recipient:SANDRA,topic:'revision:'+claim.id,conditions:{event:claim.id,caseId:'fumigacion:'+greeting.id},source:claim.id,text:'Consulta histórica sintética'});
  const prior=f.s.db.prepare('SELECT * FROM questions').get(),out=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(prior.outbox_id),claimBefore=f.s.db.prepare('SELECT state,body FROM events WHERE id=?').get(claim.id);
  f.eraseMarker(claim.phone);const e=await f.turn('120 metros cuadrados'),state=f.s.conversation(e.phone).state;
  assert.equal(state.caseId,'fumigacion:'+greeting.id);assert.equal(state.requestedAfterServiceReview?.sourceId,claim.id);assert.equal(state.requestedAfterServiceReview?.kind,'warranty');
  assert.match(f.reply(e)||'',/garantía.*pendiente/i);assert.doesNotMatch(f.reply(e)||'',/municipio|plaga|habitaciones|cotizaci[oó]n/i);
  assert.deepEqual(f.s.db.prepare('SELECT * FROM questions').all(),[prior]);assert.deepEqual(f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(prior.outbox_id),out);assert.deepEqual(f.s.db.prepare('SELECT state,body FROM events WHERE id=?').get(claim.id),claimBefore);
  assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});
test('stored recovery does not infer a complaint from negation, hypothesis or a third party',async()=>{
 for(const phrase of ['No solicitamos una garantía del servicio anterior','Si solicitamos una garantía del servicio anterior, ¿qué harían?','Mi vecino dijo que solicitamos una garantía del servicio anterior','"Solicitamos una garantía del servicio anterior"']){const f=fixture();try{
  f.deliver(await f.turn('Buenas tardes'));const claim=await f.turn(phrase);if(f.row(claim))f.deliver(claim);f.eraseMarker(claim.phone);const e=await f.turn('120 metros cuadrados');assert.equal(f.s.conversation(e.phone).state.requestedAfterServiceReview,undefined,phrase);
 }finally{f.s.close();}}
});
test('a fresh service inside a rapid first batch bounds the last fragment after the change of purpose',async()=>{
 const f=fixture();try{
  const make=(id,text,at)=>({id,phone:'573009000011',line:f.c.lines[0].phone,at,kind:'text',fromMe:false,forwarded:false,text}),at=Date.now()-5000;
  const batch=[make('SYNTH_BATCH_CLAIM',complaint,at),make('SYNTH_BATCH_NEW','Necesito un servicio nuevo para cucarachas en apartamento de 42 mts2 en Medellín',at+1000),make('SYNTH_BATCH_FRAGMENT','120 metros cuadrados',at+2000)];
  for(const e of batch)f.s.enqueue(e);for(const e of batch)await f.engine.process(e);
  const state=f.s.conversation(batch[2].phone).state;assert.equal(state.caseId,'fumigacion:'+batch[1].id);assert.equal(state.requestedAfterServiceReview,undefined);assert.equal(state.requestedProductInquiry,undefined);
 }finally{f.s.close();}
});
test('more than four hundred own-case sources preserve a stored warranty rather than restarting ordinary intake',async()=>{
 const f=fixture();try{
  const first=await f.turn(complaint);f.deliver(first);f.eraseMarker(first.phone);
  for(let i=0;i<401;i++){const e={id:'SYNTH_CASE_ROW_'+i,phone:first.phone,line:first.line,at:first.at+i+1,kind:'text',fromMe:false,forwarded:false,text:'Buenas tardes'};f.s.enqueue(e);f.s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(e.id);}
  const e=await f.turn('120 metros cuadrados',{at:first.at+1000}),state=f.s.conversation(e.phone).state;assert.equal(state.requestedAfterServiceReview.sourceId,first.id);assert.doesNotMatch(f.reply(e)||'',/inmueble|municipio|plaga/);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});
test('exceeding the explicit own-case read bound blocks ordinary intake with coverage metadata instead of silently dropping the history',async()=>{
 const f=fixture();try{
  const first=await f.turn('Buenas tardes');f.deliver(first);
  for(let i=0;i<4097;i++){const e={id:'SYNTH_UNCERTAIN_ROW_'+i,phone:first.phone,line:first.line,at:first.at+i+1,kind:'text',fromMe:false,forwarded:false,text:'Hola'};f.s.enqueue(e);f.s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(e.id);}
  const e=await f.turn('120 metros cuadrados',{at:first.at+5000}),state=f.s.conversation(e.phone).state;assert.equal(state.storedContextCoverageIncomplete.maximumOwnRows,4096);assert.match(f.reply(e)||'',/contexto anterior/);assert.doesNotMatch(f.reply(e)||'',/inmueble|municipio|plaga/);assert.equal(registrationStatus(f.c,f.s).prepared,0);
  const next=await f.turn('Mi casa',{at:e.at+1000});assert.equal(f.reply(next),null);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  const fresh=await f.turn('Necesito un servicio nuevo para cucarachas en apartamento de 42 mts2 en Medellín',{at:next.at+1000}),latest=f.s.conversation(fresh.phone).state;assert.equal(latest.caseId,'fumigacion:'+fresh.id);assert.equal(latest.storedContextCoverageIncomplete,undefined);assert.equal(latest.requestedAfterServiceReview,undefined);assert.equal(latest.quotedPrice.priceCop,129000);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});
test('a fresh case, foreign phone/line, forwarded source or backdated row cannot restore an older stored claim',async()=>{
 for(const variant of ['fresh-case','foreign-phone','foreign-line','forwarded','backdated']){const f=fixture();try{
  const first=await f.turn('Buenas tardes');f.deliver(first);
  const claim=await f.turn(complaint,variant==='foreign-phone'?{phone:'573009000022'}:variant==='foreign-line'?{line:f.c.lines[1].phone}:variant==='forwarded'?{forwarded:true}:variant==='backdated'?{at:first.at-1000}:{});if(f.row(claim))f.deliver(claim);f.eraseMarker(first.phone);
  if(variant==='fresh-case'){const fresh=await f.turn('Necesito un servicio nuevo para cucarachas en apartamento de 42 mts2 en Medellín');f.deliver(fresh);}
  const e=await f.turn('120 metros cuadrados');assert.equal(f.s.conversation(e.phone).state.requestedAfterServiceReview,undefined,variant);
 }finally{f.s.close();}}
});
test('dimensions without units are retained literally and receive a directed clarification instead of the generic size prompt',async()=>{
 const f=fixture();try{
  f.deliver(await f.turn('Necesito tratar ratas en una bodega'));const e=await f.turn('10 x 5'),state=f.s.conversation(e.phone).state;
  assert.equal(state.slots.dimensions,'10 x 5');assert.equal(state.slots.area,undefined);assert.equal(state.intakeSources.dimensions.sourceId,e.id);assert.match(f.reply(e)||'',/medidas|metros|largo|ancho/i);assert.doesNotMatch(f.reply(e)||'',/habitaciones o metros cuadrados|50/);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});
test('explicit metre dimensions advance a warehouse inquiry to missing municipality and a special quotation without calculating area',async()=>{
 const f=fixture();try{
  f.deliver(await f.turn('Necesito tratar ratas en una bodega'));const e=await f.turn('10 mt x 5 mt');f.deliver(e);let state=f.s.conversation(e.phone).state;
  assert.equal(state.slots.dimensions,'10 mt x 5 mt');assert.equal(state.slots.area,undefined);assert.match(f.reply(e)||'',/municipio/i);assert.doesNotMatch(f.reply(e)||'',/habitaciones o metros cuadrados|50|129\.000/);
  const location=await f.turn('Medellín'),latest=f.s.conversation(location.phone).state;assert.equal(latest.slots.dimensions,'10 mt x 5 mt');assert.equal(latest.slots.location,'medellin');assert.equal(latest.slots.area,undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);
  assert.ok(f.s.db.prepare("SELECT id FROM questions WHERE topic='special-quotation'").get());assert.equal(f.s.db.prepare("SELECT id FROM questions WHERE topic='cotizacion-verificada'").get(),undefined);
 }finally{f.s.close();}
});
test('dimensions do not enter facts from hypothetical, negated, quoted, forwarded or another business sources',async()=>{
 for(const text of ['Si mide 10 mt x 5 mt','No mide 10 mt x 5 mt','Mi vecino dice 10 mt x 5 mt','"10 mt x 5 mt"','10 mt x 5 mt x 3 mt','¿10 mt x 5 mt?'])assert.equal(extractSlots(text,'fumigacion').dimensions,undefined,text);
 assert.equal(extractSlots('10 mt x 5 mt','servicio-tecnico').dimensions,undefined);
 const state={slots:{service:'ratas',site:'bodega'},asked:['size'],caseId:'fumigacion:SYNTHETIC_FIRST'},e={id:'SYNTHETIC_FORWARDED',phone:'573009000011',line:'573126944997',at:Date.now(),kind:'text',fromMe:false,forwarded:true,text:'10 mt x 5 mt'};
 assert.equal(customerDecision('fumigacion',state,e,{}).state.slots.dimensions,undefined);
});
test('literal prior-quotation and added-scope references do not become a new service, price or acceptance',()=>{
 const state={slots:{location:'medellin'},asked:['service'],caseId:'fumigacion:SYNTHETIC_FIRST'};
 for(const text of ['Para solicitar el servicio de acuerdo a la cotización realizada','Servicio preventivo como me lo enviaste en la cotización','Hola, para recordarte la solicitud que hice el viernes y por favor en la cotización poner sellar el zócalo del cuarto principal también']){
  const result=customerDecision('fumigacion',state,{id:'SYNTHETIC_PREVIOUS',kind:'text',fromMe:false,forwarded:false,text},{});assert.equal(result.reviewTopic,'existing-quotation',text);assert.deepEqual(result.state.slots,state.slots);assert.equal(result.state.quotedPrice,undefined);assert.equal(result.state.programIntake,undefined);
 }
});
test('literal technical-document requests and stated appointment variants retain only their reported purpose',()=>{
 const state={slots:{service:'cucarachas'},asked:[],caseId:'fumigacion:SYNTHETIC_FIRST'};
 for(const text of ['De enviarme la factura electrónica','Ya me tienes la factura?','Depronto ya nos tienen la factura?','Y por favor me puedes enviar las fichas técnicas del producto aplicado']){
  const result=customerDecision('fumigacion',state,{id:'SYNTHETIC_DOCS',kind:'text',fromMe:false,forwarded:false,text},{});assert.equal(result.reviewTopic,'service-documents',text);assert.deepEqual(result.state.slots,state.slots);assert.doesNotMatch(result.reply,/enviad|entregad|segur|aprobado/i);
 }
 const schedule=customerDecision('fumigacion',state,{id:'SYNTHETIC_SCHEDULE',kind:'text',fromMe:false,forwarded:false,text:'Entonces la cita para mañana a las 10 am'},{});assert.equal(schedule.reviewConditions.kind,'reported-existing-schedule');assert.equal(schedule.state.programServiceId,undefined);assert.equal(schedule.state.slots.preference,undefined);
});
test('the new reference patterns exclude hypothetical, denied, quoted or prospective initial requests',()=>{
 for(const text of ['No quiero solicitar el servicio de acuerdo a la cotización realizada','Si quisiera solicitar el servicio de acuerdo a la cotización realizada','Mi vecino dijo: para solicitar el servicio de acuerdo a la cotización realizada','No necesito fichas técnicas del producto aplicado','Si me puedes enviar las fichas técnicas del producto aplicado','Mi vecino dijo que me puedes enviar las fichas técnicas del producto aplicado','No, entonces la cita para mañana a las 10 am','Si entonces la cita para mañana a las 10 am','Mi vecino dijo: entonces la cita para mañana a las 10 am','Quisiera una cita para mañana']){
  const result=customerDecision('fumigacion',{slots:{},asked:[],caseId:'fumigacion:SYNTHETIC_FIRST'},{id:'SYNTHETIC_NEGATIVE',kind:'text',fromMe:false,forwarded:false,text},{});assert.ok(!['service-documents','existing-quotation'].includes(result.reviewTopic),text);assert.notEqual(result.reviewConditions?.kind,'reported-existing-schedule',text);
 }
 const other=customerDecision('servicio-tecnico',{slots:{},asked:[],caseId:'servicio-tecnico:SYNTHETIC_FIRST'},{id:'SYNTHETIC_OTHER',kind:'text',fromMe:false,forwarded:false,text:'Entonces la cita para mañana a las 10 am'},{});assert.notEqual(other.reviewConditions?.kind,'reported-existing-schedule');
});
test('a product question followed by rodent/warehouse dimensions asks purpose once without treating it as accepted fumigation',async()=>{
 const f=fixture();try{
  const product=await f.turn('Veneno de marca desconocida líquido tiene?');if(f.row(product))f.deliver(product);const initialQuestions=f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n;
  const detail=await f.turn('Rata\nBodega\n10');assert.match(f.reply(detail)||'',/servicio.*producto/i);assert.equal(f.s.conversation(detail.phone).state.requestedProductInquiry.sourceId,product.id);
  for(const text of ['10 x 5','10 mt x 5 mt']){const e=await f.turn(text);assert.match(f.reply(e)||'',/Conservé las medidas/);assert.doesNotMatch(f.reply(e)||'',/[¿?]|municipio|129\.000|50/);}
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,initialQuestions);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});
test('an explicit service purpose after a product query starts its own case without inheriting product or warranty markers',async()=>{
 const f=fixture();try{
  const product=await f.turn('Veneno de marca desconocida líquido tiene?');if(f.row(product))f.deliver(product);
  const e=await f.turn('Quiero fumigar ratas en una bodega de Medellín'),state=f.s.conversation(e.phone).state;
  assert.equal(state.caseId,'fumigacion:'+e.id);assert.equal(state.requestedProductInquiry,undefined);assert.equal(state.productPurposeClarification,undefined);assert.equal(state.requestedAfterServiceReview,undefined);assert.equal(state.slots.site,'bodega');assert.equal(state.slots.location,'medellin');assert.equal(state.slots.service,'ratas');assert.equal(state.quotedPrice,undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});
test('choosing product information or a forwarded/conditional service statement cannot accept or create a fumigation',async()=>{
 for(const [text,extra] of [['Solo producto',{}],['Si quiero fumigar ratas, ¿cuánto costaría?',{}],['Quiero fumigar ratas en una bodega',{forwarded:true}]]){const f=fixture();try{
  const product=await f.turn('Veneno de marca desconocida líquido tiene?');if(f.row(product))f.deliver(product);const e=await f.turn(text,extra),state=f.s.conversation(e.phone).state;assert.equal(state.caseId,'fumigacion:'+product.id);assert.equal(state.requestedProductInquiry.sourceId,product.id);assert.equal(state.quotedPrice,undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}}
});
test('the literal Calazans neighborhood answer keeps its source and asks only municipality without inventing it',()=>{
 for(const text of ['Altos de Calazans','Altos de Calasanz']){
  const state={slots:{service:'cucarachas',site:'apartamento',rooms:'2 habitaciones'},asked:['location'],caseId:'fumigacion:SYNTHETIC_FIRST'},e={id:'SYNTHETIC_LOCATION',kind:'text',fromMe:false,forwarded:false,text,at:1000};
  const d=customerDecision('fumigacion',state,e,{});assert.equal(d.state.slots.locationDetails,text);assert.equal(d.state.slots.location,undefined);assert.equal(d.state.intakeSources.locationDetails.sourceId,e.id);assert.equal(d.state.intakeSources.locationDetails.municipalityInferred,false);assert.match(d.reply,/municipio/);assert.doesNotMatch(d.reply,/barrio/);
 }
 for(const text of ['Si estuviera en Altos de Calazans','No estoy en Altos de Calazans','Mi vecino dice Altos de Calazans','Altos de Calazans perfume'])assert.equal(customerDecision('fumigacion',{slots:{},asked:['location']},{id:'SYNTHETIC_NEGATIVE_LOCATION',kind:'text',fromMe:false,forwarded:false,text,at:1000},{}).state.slots.locationDetails,undefined);
});
