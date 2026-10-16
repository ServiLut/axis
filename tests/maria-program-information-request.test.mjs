import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {ordinaryRegistrationDataQuestion,registrationStatus} from '../automation/service-bots/maria-program.mjs';
import {aiConfiguration} from '../automation/service-bots/ai-settings.mjs';
import {composeOwnReply,mariaReplyContract} from '../automation/service-bots/conversational-ai.mjs';

function fixture(t){
 const start=Date.parse('2026-10-16T19:00:00.000Z');t.mock.timers.enable({apis:['Date'],now:start});
 const store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'synthetic-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-60000,expiresAt:Date.parse('2026-11-07T16:56:52.680Z')}};
 const engine=new Engine(store,config);let n=0;
 const turn=async(text,patch={})=>{const e={id:'DATASOURCE'+ ++n,text,phone:'573001112233',line:config.lines[0].phone,kind:'text',fromMe:false,at:start+n*10000,...patch};t.mock.timers.setTime(e.at);store.enqueue(e);await engine.process(e);return e;};
 const row=e=>store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const reply=e=>{const r=row(e);return r&&store.open(r.body);};
 const deliver=e=>{const r=row(e);assert.ok(r);t.mock.timers.setTime(e.at+4000);const mid='MID'+e.id;store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);store.delivery(mid,e.line,'DELIVERED');return reply(e);};
 const quote=async()=>{const e=await turn('Tengo chinches en dos colchones en mi apartamento de Medellín, barrio Laureles');assert.match(deliver(e),/198\.000/);return e;};
 return {store,config,turn,row,reply,deliver,quote};
}
test('the closed question grammar excludes exceptions, third parties, payment and mixed questions',()=>{
 for(const text of ['¿Qué datos necesitas para agendar?','Qué información te envío para registrar el servicio?','¿Qué datos te mando?'])assert.equal(ordinaryRegistrationDataQuestion(text),true,text);
 for(const text of ['¿Qué datos necesitas para agendar y cómo pago?','Mi mamá pregunta qué datos necesitas para agendar','¿Qué datos necesitas para una garantía?','¿Qué producto usas?','No quiero agendar, ¿qué datos necesitas?'])assert.equal(ordinaryRegistrationDataQuestion(text),false,text);
});
test('a data question after the delivered own quote lists missing fields without accepting or opening registration',async t=>{
 const f=fixture(t);try{const quote=await f.quote(),e=await f.turn('¿Qué datos necesitas para agendar?');
  assert.match(f.reply(e),/1\. Tu nombre completo\.\n2\. La dirección completa/);assert.match(f.reply(e),/3\. Qué día y franja horaria prefieres/);
  assert.doesNotMatch(f.reply(e),/teléfono|plaga|colchones|198\.000|respuesta confirmada/);
  const state=f.store.conversation(e.phone).state;assert.equal(Boolean(state.quotedPrice.accepted),false);assert.equal(state.quotedPrice.sourceId,quote.id);assert.equal(state.programIntake,undefined);
  assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.store.close();}
});
test('price acceptance proactively requests missing data without requiring the customer to ask',async t=>{
 const f=fixture(t);try{await f.quote();const yes=await f.turn('Sí, por favor');assert.match(f.reply(yes),/Para registrar tu solicitud, compárteme:\n1\. Tu nombre completo/);assert.match(f.reply(yes),/dirección completa/);assert.match(f.reply(yes),/día y franja/);assert.equal(f.store.conversation(yes.phone).state.programIntake.stage,'name');assert.equal(registrationStatus(f.config,f.store).prepared,0);}finally{f.store.close();}
});
test('a configured reply model cannot prepend echoes or flatten the authentic informational data list',async t=>{
 const f=fixture(t);try{await f.quote();const e=await f.turn('¿Qué datos necesitas para agendar?'),row=f.row(e),text=f.reply(e);let calls=0;
  f.config.conversationalAi=aiConfiguration({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_AI_MODEL:'isolated-data-test-model',BOT_OPENAI_API_KEY:'isolated-key',BOT_AI_MONTHLY_CALL_LIMIT:'10',BOT_AI_ENABLED_FROM:'2026-10-16T18:00:00.000Z'},'fumigacion');
  assert.equal(mariaReplyContract(f.config,f.store,row,text),null);
  assert.equal(await composeOwnReply(f.config,f.store,async()=>{calls++;throw Error('MODEL_MUST_NOT_RUN');},row,text),text);assert.equal(calls,0);assert.match(text,/\n1\.[^\n]+\n2\.[^\n]+\n3\./);assert.doesNotMatch(text,/Me indicas|El inmueble|La ubicación|Ya tengo el dato/);
 }finally{f.store.close();}
});
test('pre-acceptance supplied fields keep their original sources and require a new delivered summary and confirmation',async t=>{
 const f=fixture(t);try{await f.quote();f.deliver(await f.turn('¿Qué datos necesitas para agendar?'));
  const facts=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');f.deliver(facts);
  let state=f.store.conversation(facts.phone).state;assert.ok(state.registrationInformationRequest.nameSource,JSON.stringify({state,reply:f.reply(facts)}));assert.equal(state.registrationInformationRequest.nameSource.id,facts.id);assert.equal(state.registrationInformationRequest.addressSource.id,facts.id);assert.equal(state.programIntake,undefined);assert.equal(Boolean(state.quotedPrice.accepted),false);
  const yes=await f.turn('Sí');assert.match(f.reply(yes),/¿Confirmas que estos datos son correctos/);state=f.store.conversation(yes.phone).state;assert.equal(state.programIntake.stage,'confirm');assert.equal(state.programIntake.nameSource.id,facts.id);assert.equal(registrationStatus(f.config,f.store).prepared,0);
  await f.turn('Sí');assert.equal(registrationStatus(f.config,f.store).prepared,0,'undelivered summary cannot authorize a write');
 }finally{f.store.close();}
});
test('known fields are not requested again and a delivered summary then confirmation may prepare exactly one request',async t=>{
 const f=fixture(t);try{await f.quote();f.deliver(await f.turn('¿Qué datos necesitas para agendar?'));
  const facts=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');f.deliver(facts);
  const repeated=await f.turn('¿Qué datos necesitas para agendar?');assert.match(f.reply(repeated),/1\. Qué día y franja horaria prefieres/);assert.doesNotMatch(f.reply(repeated),/nombre completo|dirección completa/);f.deliver(repeated);
  const summary=await f.turn('Sí');assert.match(f.deliver(summary),/¿Confirmas que estos datos son correctos/);assert.equal(registrationStatus(f.config,f.store).prepared,0);
  const confirmed=await f.turn('Confirmo');assert.equal(registrationStatus(f.config,f.store).prepared,1);
  const state=f.store.conversation(confirmed.phone).state,entry=f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+state.caseId),payload=f.store.open(entry.value).payload;
  assert.equal(payload.customerName,'Persona Sintética');assert.equal(payload.sources.customerName.id,facts.id);assert.equal(payload.sources.address.id,facts.id);assert.equal(payload.sources.acceptance.id,confirmed.id);assert.equal(payload.quote.priceCop,198000);
 }finally{f.store.close();}
});
for(const mode of ['forwarded','quoted','human','disabled','uncertain-quote'])test('information request respects '+mode,async t=>{
 const f=fixture(t);try{const quote=await f.quote();
  if(mode==='human')await f.turn('La asesora está atendiendo',{fromMe:true});if(mode==='disabled')f.config.mariaProgram.enabled=false;
  if(mode==='uncertain-quote')f.store.db.prepare("UPDATE outbox SET state='UNCERTAIN' WHERE id=?").run(f.row(quote).id);
  const e=await f.turn('¿Qué datos necesitas para agendar?',mode==='forwarded'?{forwarded:true}:mode==='quoted'?{quotedId:'OTHER_SOURCE01'}:{});
  assert.equal(f.store.conversation(e.phone).state.registrationInformationRequest,undefined);assert.equal(registrationStatus(f.config,f.store).prepared,0);
 }finally{f.store.close();}
});
