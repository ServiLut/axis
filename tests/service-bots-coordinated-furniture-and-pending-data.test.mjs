import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,BUSINESS_PRICE_HASH,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {registrationStatus,registrationHash,acceptsOrdinaryQuotation} from '../automation/service-bots/maria-program.mjs';
import {aiConfiguration} from '../automation/service-bots/ai-settings.mjs';
import {composeOwnReply} from '../automation/service-bots/conversational-ai.mjs';

const request='Buenas tardes. Quiero cotizar otro servicio nuevo para chinches: son 3 colchones en un apartamento de Itagüí, barrio Santa María. ';
const exact=request+'No hay camas ni otros muebles afectados.';
function fixture(t){
 const start=Date.parse('2026-10-16T20:08:00.000Z');t.mock.timers.enable({apis:['Date'],now:start});
 const s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-3600000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'coordinated-local-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-3600000,expiresAt:Date.parse('2026-11-07T16:56:52.680Z')}};
 const engine=new Engine(s,c);let n=0;
 const turn=async(text,patch={})=>{const e={id:'COORDINATED_LOCAL_'+ ++n,phone:'573000007384',line:c.lines[0].phone,at:start+n*10000,kind:'text',fromMe:false,forwarded:false,text,...patch};t.mock.timers.setTime(e.at);s.enqueue(e);await engine.process(e);return e;};
 const row=e=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const reply=e=>{const r=row(e);return r&&s.open(r.body);};
 const deliver=e=>{const r=row(e);assert.ok(r);t.mock.timers.setTime(e.at+4000);const mid='MID_'+e.id;s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);s.delivery(mid,e.line,'DELIVERED');return reply(e);};
 const state=e=>s.conversation(e.phone).state;
 const questionCount=()=>s.db.prepare('SELECT COUNT(*) n FROM questions').get().n+s.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n;
 return {s,c,turn,row,reply,deliver,state,questionCount};
}
for(const exclusion of ['No hay camas ni otros muebles afectados.','No tengo bases de cama ni otros muebles afectados.','Sin camas ni otros muebles afectados.','No hay sofás ni bases de cama ni otros muebles afectados.'])test('a complete direct coordinated exclusion preserves only the mattress quote: '+exclusion,async t=>{
 const f=fixture(t);try{const e=await f.turn(request+exclusion),state=f.state(e);assert.equal(extractSlots(request+exclusion,'fumigacion').affectedFurniture,undefined);assert.equal(state.slots.affectedFurniture,undefined);assert.equal(state.quotedPrice.priceCop,300000);assert.equal(state.quotedPrice.scheduleHash,BUSINESS_PRICE_HASH);assert.match(f.reply(e),/3 colchones.*300\.000/);assert.equal(state.awaitingHumanReview,undefined);assert.equal(f.questionCount(),0);assert.equal(registrationStatus(f.c,f.s).prepared,0);}finally{f.s.close();}
});
for(const exclusion of ['No hay camas ni otros muebles afectados, pero el sofá tiene chinches.','No hay camas ni otros muebles afectados y el sofá tiene chinches.','No sé si hay camas ni otros muebles afectados.','¿No hay camas ni otros muebles afectados?','Mi vecino dice que no hay camas ni otros muebles afectados.','Si no hay camas ni otros muebles afectados, ¿cuánto cuesta?','No es cierto que no hay camas ni otros muebles afectados.','No hay camas ni otros muebles que no estén afectados.'])test('coordinated exclusion does not erase positive, relayed or uncertain furniture: '+exclusion,async t=>{
 const f=fixture(t);try{const e=await f.turn(request+exclusion);assert.ok(f.state(e).slots.affectedFurniture);assert.equal(f.state(e).quotedPrice,undefined);assert.doesNotMatch(f.reply(e)||'',/300\.000/);assert.equal(registrationStatus(f.c,f.s).prepared,0);}finally{f.s.close();}
});
test('a new case after a legacy quote, quantity doubt and scoped human return uses only its new three mattresses',async t=>{
 const f=fixture(t);try{const old=await f.turn('Quiero cotizar otro servicio nuevo para chinches: son dos colchones en un apartamento de Itagüí. No hay otros muebles afectados.',{at:Date.parse('2026-10-16T19:30:00.000Z')});assert.match(f.deliver(old),/198\.000/);
  await f.turn('Todavía no sé si será uno o dos colchones.',{at:Date.parse('2026-10-16T19:31:00.000Z')});await f.turn('La asesora está atendiendo.',{fromMe:true,at:Date.parse('2026-10-16T19:32:00.000Z')});f.s.hold(old.phone,'SYNTHETIC_SCOPED_RETURN',false);
  const e=await f.turn(exact);assert.equal(f.state(e).caseId,'fumigacion:'+e.id);assert.equal(f.state(e).quotedPrice.priceCop,300000);assert.equal(f.state(e).quotedPrice.sourceId,e.id);assert.match(f.reply(e),/300\.000/);assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(old.id).body).text,old.text);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});
test('a concrete data question during pending furniture review receives missing fields while all authority remains pending',async t=>{
 const f=fixture(t);try{const first=await f.turn(request+'La base de cama también tiene chinches.');assert.equal(f.state(first).awaitingHumanReview,true);const before=f.questionCount(),e=await f.turn('¿Qué datos necesitas para agendar?'),text=f.reply(e),state=f.state(e);
  assert.match(text,/1\. Tu nombre completo\.\n2\. La dirección completa/);assert.match(text,/3\. Qué día y franja horaria prefieres/);assert.match(text,/precio.*horario.*pendientes de confirmación/);assert.doesNotMatch(text,/teléfono|plaga|300\.000|198\.000|registrad[oa]|agendad[oa]/i);assert.equal(state.awaitingHumanReview,true);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(state.registrationInformationRequest,undefined);assert.equal(f.questionCount(),before);assert.equal(registrationStatus(f.c,f.s).prepared,0);
  await f.turn('Sí');assert.equal(registrationStatus(f.c,f.s).prepared,0);assert.equal(f.state(e).programIntake,undefined);
 }finally{f.s.close();}
});
test('pending information keeps verified explicit fields and never repeats them or lets the model flatten the list',async t=>{
 const f=fixture(t);try{await f.turn(request+'Hay otros muebles afectados.');await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');const e=await f.turn('¿Qué datos necesitas para agendar?'),text=f.reply(e);assert.match(text,/1\. Qué día y franja horaria prefieres/);assert.doesNotMatch(text,/nombre completo|dirección completa/);
  f.c.conversationalAi=aiConfiguration({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_AI_MODEL:'isolated-pending-data-model',BOT_OPENAI_API_KEY:'isolated-key',BOT_AI_MONTHLY_CALL_LIMIT:'10',BOT_AI_ENABLED_FROM:'2026-10-16T18:00:00.000Z'},'fumigacion');let calls=0;assert.equal(await composeOwnReply(f.c,f.s,async()=>{calls++;throw Error('MODEL_MUST_NOT_RUN');},f.row(e),text),text);assert.equal(calls,0);assert.equal(f.state(e).awaitingHumanReview,true);
 }finally{f.s.close();}
});
for(const mode of ['human','forwarded','quoted','disabled','payment-question','warranty-question','another-case'])test('pending data information respects '+mode,async t=>{
 const f=fixture(t);try{await f.turn(request+'Hay otros muebles afectados.');if(mode==='human')await f.turn('La asesora está atendiendo.',{fromMe:true});if(mode==='disabled')f.c.mariaProgram.enabled=false;if(mode==='another-case'){const conv=f.s.conversation('573000007384');f.s.saveConversation(conv.phone,{...conv.state,caseId:'fumigacion:UNSTORED_SOURCE'});}
  const text=mode==='payment-question'?'¿Qué datos necesitas para agendar y cómo pago?':mode==='warranty-question'?'¿Qué datos necesitas para una garantía?':'¿Qué datos necesitas para agendar?',e=await f.turn(text,mode==='forwarded'?{forwarded:true}:mode==='quoted'?{quotedId:'OTHER_NATIVE_SOURCE'}:{});assert.doesNotMatch(f.reply(e)||'',/Para preparar tu solicitud/);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});
test('the exact affirmative price reply continues the delivered own quote and proactively requests data',async t=>{
 const f=fixture(t);try{const quote=await f.turn('Quiero cotizar otro servicio nuevo para cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.');assert.match(f.deliver(quote),/129\.000/);const before=f.questionCount(),e=await f.turn('Sí, deseo continuar con la cotización de $129.000.');assert.match(f.reply(e),/Para registrar tu solicitud, compárteme:\n1\. Tu nombre completo/);assert.doesNotMatch(f.reply(e),/¿Deseas continuar|129\.000/);assert.equal(f.state(e).quotedPrice.sourceId,quote.id);assert.equal(f.state(e).quotedPrice.acceptanceSource,e.id);assert.equal(f.state(e).programIntake.stage,'name');assert.equal(f.questionCount(),before);assert.equal(registrationStatus(f.c,f.s).prepared,0);}finally{f.s.close();}
});
for(const text of ['Sí, deseo continuar con la cotización de $119.000.','No deseo continuar con la cotización de $129.000.','¿Sí, deseo continuar con la cotización de $129.000?','Mi mamá dice: sí, deseo continuar con la cotización de $129.000.','Sí, deseo continuar con la cotización de $129.000 USD.','Sí, deseo continuar con la cotización de $129.000 o $119.000.','Sí, deseo continuar con la cotización de $129.000, pero con descuento.'])test('an amount phrase cannot bypass acceptance guards: '+text,async t=>{
 const f=fixture(t);try{const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.');f.deliver(quote);const e=await f.turn(text);assert.equal(Boolean(f.state(e).quotedPrice?.accepted),false);assert.equal(f.state(e).programIntake,undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);}finally{f.s.close();}
});
for(const mode of ['READY','ACCEPTED','UNCERTAIN','NO_MID','NO_FIRST_DELIVERY'])test('a quoted amount cannot replace or accept the original quotation without complete delivery proof: '+mode,async t=>{
 const f=fixture(t);try{const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.'),original=f.state(quote).quotedPrice;
  if(mode==='NO_MID'||mode==='NO_FIRST_DELIVERY'){f.deliver(quote);if(mode==='NO_MID')f.s.db.prepare('UPDATE outbox SET mid=NULL WHERE id=?').run(f.row(quote).id);else f.s.db.prepare('DELETE FROM meta WHERE key=?').run('first-delivery:'+f.row(quote).id);}
  else f.s.db.prepare('UPDATE outbox SET state=? WHERE id=?').run(mode,f.row(quote).id);
  const e=await f.turn('Sí, deseo continuar con la cotización de $129.000.');assert.equal(f.state(e).quotedPrice.sourceId,original.sourceId);assert.equal(f.state(e).quotedPrice.priceCop,original.priceCop);assert.equal(Boolean(f.state(e).quotedPrice.accepted),false);assert.equal(f.state(e).programIntake,undefined);assert.doesNotMatch(f.reply(e)||'',/El servicio tiene un valor|¿Deseas continuar/);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 }finally{f.s.close();}
});
test('amount consent then literal fields, delivered summary and a new yes prepare the original-price DTO with the final yes as acceptance',async t=>{
 const f=fixture(t);try{const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.');f.deliver(quote);const amountConsent=await f.turn('Sí, deseo continuar con la cotización de $129.000.');f.deliver(amountConsent);
  const facts=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');assert.match(f.reply(facts),/¿Confirmas que estos datos son correctos/);assert.equal(registrationStatus(f.c,f.s).prepared,0);f.deliver(facts);
  const final=await f.turn('Sí'),state=f.state(final),saved=f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+state.caseId);assert.ok(saved);const entry=f.s.open(saved.value),p=entry.payload;
  assert.equal(entry.confirmationKind,'delivered-summary-confirmed');assert.equal(entry.summaryOutboxId,f.row(facts).id);assert.equal(entry.requestHash,registrationHash(p));assert.equal(p.quote.priceCop,129000);assert.equal(p.quote.scheduleHash,BUSINESS_PRICE_HASH);assert.equal(p.quote.sourceId,quote.id);assert.equal(p.quote.mid,f.row(quote).mid);assert.equal(p.quote.acceptanceId,final.id);assert.equal(p.sources.acceptance.id,final.id);assert.equal(p.sources.acceptance.text,'Sí');assert.equal(acceptsOrdinaryQuotation(p.sources.acceptance.text),true);assert.equal(p.sources.customerName.id,facts.id);assert.equal(p.sources.address.id,facts.id);assert.equal(p.sourceId,final.id);assert.notEqual(p.sources.acceptance.id,amountConsent.id);assert.equal(registrationStatus(f.c,f.s).prepared,1);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,1);
 }finally{f.s.close();}
});
test('amount consent with already supplied data still requires a new delivered summary and final yes',async t=>{
 const f=fixture(t);try{const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.\nNombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');f.deliver(quote);const consent=await f.turn('Sí, deseo continuar con la cotización de $129.000.');assert.match(f.reply(consent),/¿Confirmas que estos datos son correctos/);assert.equal(f.state(consent).programIntake.stage,'confirm');assert.equal(registrationStatus(f.c,f.s).prepared,0);f.deliver(consent);const final=await f.turn('Sí');assert.equal(registrationStatus(f.c,f.s).prepared,1);const entry=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+f.state(final).caseId).value);assert.equal(entry.payload.sources.acceptance.text,'Sí');assert.equal(entry.payload.quote.acceptanceId,final.id);assert.equal(entry.confirmationKind,'delivered-summary-confirmed');
 }finally{f.s.close();}
});
for(const patch of [{forwarded:true},{quotedId:'OTHER_SOURCE'}, {kind:'audio'}])test('price amount acceptance requires a new direct text source: '+JSON.stringify(patch),async t=>{
 const f=fixture(t);try{const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.');f.deliver(quote);const e=await f.turn('Sí, deseo continuar con la cotización de $129.000.',patch);assert.equal(Boolean(f.state(e).quotedPrice?.accepted),false);assert.equal(f.state(e).programIntake,undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);}finally{f.s.close();}
});
