import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Engine} from '../automation/service-bots/engine.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,SANDRA,HILARY,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {explicitMariaAdviserRequest} from '../automation/service-bots/maria-adviser-handoff.mjs';
import {reviewMariaWorkflow} from '../automation/service-bots/maria-workflow-review.mjs';
import {afterServiceKind} from '../automation/service-bots/after-service.mjs';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {drainProgramRegistrations} from '../automation/service-bots/maria-program.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD,projectClientRequestedSchedule} from '../automation/service-bots/client-requested-schedule.mjs';

function fixture(line=BUSINESSES.fumigacion.phones[0]){
 const store=new Store(':memory:','fumigacion',randomBytes(32)),config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:CURRENT_OPERATOR_ROUTING},engine=new Engine(store,config);let n=0;
 const start=Date.now()+1000;
 const turn=async(text,patch={})=>{const e={id:'HUMAN_HANDOFF_'+ ++n,at:start+n*1000,phone:'573000001234',line,kind:'text',fromMe:false,forwarded:false,text,...patch};store.enqueue(e);await engine.process(e);return e;};
 const reply=e=>{const r=store.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply');return r?store.open(r.body):null;};
 return {store,config,turn,reply};
}
test('literal personal adviser requests are distinguished from denials, quotations and examples',()=>{
 for(const text of ['Un asesor','Quiero hablar con una persona','¿Me puedes pasar con un asesor?','Necesito que me responda un asesor','Hola, un asesor por favor'])assert.equal(explicitMariaAdviserRequest({kind:'text',fromMe:false,text}),true,text);
 for(const text of ['No quiero hablar con un asesor','Mi vecina dijo que quiere un asesor','Si quisiera hablar con un asesor','¿Ustedes tienen asesores?','Puedo hablar','Un asesor dijo que es gratis'])assert.equal(explicitMariaAdviserRequest({kind:'text',fromMe:false,text}),false,text);
 assert.equal(explicitMariaAdviserRequest({kind:'text',fromMe:false,forwarded:true,text:'Un asesor'}),false);
});
test('a personal guarantee request phrased as performing one is not lost to reinforcement or general quotation',()=>{
 assert.equal(afterServiceKind('Creo que sería importante realizar una garantía para el refuerzo antes que sea mayor la presencia'),'warranty');
 for(const text of ['Quiero saber qué garantía tiene el servicio','Necesito conocer la garantía antes de contratar','No quiero una garantía','Si deseo una garantía, ¿qué pasa?'])assert.equal(afterServiceKind(text),null,text);
});
for(const line of BUSINESSES.fumigacion.phones)test('adviser request interrupts the form and preserves collected fields on '+line,async()=>{
 const f=fixture(line);try{
  const initial=await f.turn('Tengo cucarachas en un apartamento de Medellín'),state=f.store.conversation(initial.phone).state;
  state.programIntake={stage:'details',customerName:'Laura Gómez',address:'Calle 50 # 42-18 apartamento 301',requestedFields:['preference']};f.store.saveConversation(initial.phone,state);
  const request=await f.turn('Un asesor'),after=f.store.conversation(initial.phone).state;
  assert.match(f.reply(request),/asesor te atienda/);assert.doesNotMatch(f.reply(request),/nombre completo|dirección completa|qué día/);
  assert.deepEqual(after.programIntake,state.programIntake);assert.equal(after.awaitingHumanReview,true);assert.equal(f.store.conversation(initial.phone).hold,0);
  await f.turn('Un asesor');await f.turn('Ya los envie');const status=await f.turn('Necesito una respuesta');
  assert.doesNotMatch(f.reply(status)||'',/dirección completa|nombre completo|día y.*hora/);
  const qs=f.store.db.prepare("SELECT * FROM questions WHERE topic='adviser-assistance'").all();assert.equal(qs.length,1);assert.equal(qs[0].recipient,SANDRA);
  const qtext=f.store.open(qs[0].body).text;assert.match(qtext,/atención de asesor solicitada/);assert.match(qtext,/Para el cliente:/);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 }finally{f.store.close();}
});
for(const line of BUSINESSES.fumigacion.phones)test('an exact delivered warranty question carries an explicitly authorized chief answer to the same customer and line '+line,async()=>{
 const f=fixture(line);try{
  const first=await f.turn('Quiero la garantía: las cucarachas siguen saliendo.'),q=f.store.db.prepare("SELECT * FROM questions WHERE topic='warranty-review'").get();assert.ok(q);
  const mid='OWN_DELIVERED_WARRANTY_QUESTION';f.store.db.prepare("UPDATE outbox SET mid=?,state='READ' WHERE id=?").run(mid,q.outbox_id);
  const answer=await f.turn('Para el cliente: Lamento lo ocurrido. Necesito confirmar la fecha del servicio para revisar tu garantía.',{phone:SANDRA,quotedId:mid});
  const row=f.store.db.prepare("SELECT * FROM outbox WHERE id=?").get('chief-case-answer:'+q.id+':v1');assert.ok(row);assert.equal(row.phone,first.phone);assert.equal(row.line,line);assert.equal(row.internal,0);assert.equal(row.state,'READY');assert.equal(row.case_id,q.case_id);assert.equal(row.revision,f.store.conversation(first.phone).revision);
  assert.equal(f.store.open(row.body),'Lamento lo ocurrido. Necesito confirmar la fecha del servicio para revisar tu garantía.');
  await f.turn('Para el cliente: otra indicación',{phone:SANDRA,quotedId:mid});assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'chief-case-answer:%'").get().n,1);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(answer.id).state,'CASE_ANSWER');
 }finally{f.store.close();}
});
test('a real takeover, unquoted response, different operator or non-customer-facing note cannot send the chief answer',async()=>{
 for(const mode of ['hold','unquoted','other-operator','internal-note','accepted-only']){
  const f=fixture();try{
   const initial=await f.turn('Quiero la garantía del servicio.'),q=f.store.db.prepare("SELECT * FROM questions WHERE topic='warranty-review'").get(),mid='OWN_WARRANTY_QUESTION';
   f.store.db.prepare('UPDATE outbox SET mid=?,state=? WHERE id=?').run(mid,mode==='accepted-only'?'ACCEPTED':'READ',q.outbox_id);
   if(mode==='hold')await f.turn('Estoy atendiendo este caso',{fromMe:true});
   await f.turn(mode==='internal-note'?'Revisaré el caso y te aviso.':'Para el cliente: Necesito confirmar la fecha del servicio.',{phone:mode==='other-operator'?HILARY:SANDRA,...(mode==='unquoted'?{}:{quotedId:mid})});
   assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'chief-case-answer:%'").get().n,0,mode);
   if(mode==='hold')assert.equal(f.store.conversation(initial.phone).hold,1);
  }finally{f.store.close();}
 }
});
test('a legacy generic-review question is supported only when its exact original native source is a warranty claim',async()=>{
 for(const warranty of [true,false]){
  const f=fixture();try{
   const first=await f.turn(warranty?'Quiero la garantía del servicio.':'Quiero saber qué garantía tiene un servicio nuevo.'),q=f.store.db.prepare('SELECT * FROM questions LIMIT 1').get();assert.ok(q);
   f.store.db.prepare('UPDATE questions SET topic=? WHERE id=?').run('revision:'+first.id,q.id);f.store.db.prepare("UPDATE outbox SET mid=?,state='READ' WHERE id=?").run('LEGACY_QUESTION_MID',q.outbox_id);
   await f.turn('Para el cliente: Necesito confirmar la fecha del servicio.',{phone:SANDRA,quotedId:'LEGACY_QUESTION_MID'});
   assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'chief-case-answer:%'").get().n,warranty?1:0);
  }finally{f.store.close();}
 }
});
test('workflow diagnosis is source bound and read only and never grants permission to contact',async()=>{
 const f=fixture();try{
  const e=await f.turn('Quiero la garantía del servicio.'),before=JSON.stringify(f.store.db.prepare('SELECT * FROM conversations').all()),count=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
  f.store.audit('NATIVE_ATTENTION_UNVERIFIED',e.id+':reply',{reasonCode:'ATTENTION_COVERAGE_UNVERIFIED',attemptedSend:false,humanHoldChanged:false});
  f.store.audit('HUMAN_TAKEOVER','OTHER_PERSON',{phone:'573001111111',text:'PRIVATE_OTHER_PERSON'});
  const result=reviewMariaWorkflow(f.store,f.config,{company:'fumigacion',line:e.line,contacts:[{phone:e.phone,sourceId:e.id}]});assert.equal(result.readOnly,true);assert.equal(result.results[0].afterService.kind,'warranty');assert.equal(result.results[0].contactPermissionGranted,false);assert.equal(result.results[0].questions.length,1);
  assert.equal(result.results[0].attention.recent[0].reasonCode,'ATTENTION_COVERAGE_UNVERIFIED');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_OTHER_PERSON|OTHER_PERSON|573001111111/);
  assert.equal(JSON.stringify(f.store.db.prepare('SELECT * FROM conversations').all()),before);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,count);
  assert.equal(reviewMariaWorkflow(f.store,f.config,{company:'fumigacion',line:BUSINESSES.fumigacion.phones[1],contacts:[{phone:e.phone,sourceId:e.id}]}).results[0].found,false);
  assert.throws(()=>reviewMariaWorkflow(f.store,f.config,{company:'servicio-tecnico',line:e.line,contacts:[{phone:e.phone,sourceId:e.id}]}));
 }finally{f.store.close();}
});
test('a complete native multiline form progresses from quotation through summary and one verified local registration receipt',async t=>{
 const start=Date.parse('2026-10-16T21:20:00Z');t.mock.timers.enable({apis:['Date'],now:start});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:start-5000};
 try{
  const quote=await f.turn('Tengo cucarachas en apartamento de dos habitaciones en Itagüí.');assert.match(f.deliver(quote),/129\.000/);f.deliver(await f.turn('Sí'));
  const facts=await f.turn('Laura Gómez Martínez\nCra 44 # 83-20 (interior 402) donde la señora Marina\n17/10/26 8 am');
  assert.match(f.reply(facts),/Confirmas que estos datos/);assert.doesNotMatch(f.reply(facts),/año completo/);assert.equal(f.state(facts).programIntake.customerName,'Laura Gómez Martínez');assert.match(f.state(facts).programIntake.address,/interior 402/);f.deliver(facts);
  const timing=await f.turn('17/10/2026 8 am');assert.match(f.reply(timing),/Confirmas que estos datos/);assert.doesNotMatch(f.reply(timing),/compárteme|nombre completo|dirección completa/);f.deliver(timing);
  const final=await f.turn('Sí, confirmo que los datos son correctos.');assert.ok(f.entry(final));let writes=0;
  const result=await drainProgramRegistrations(f.store,f.config,f.transport(async(_url,opts)=>{writes++;return {ok:true,json:async()=>f.receipt(JSON.parse(opts.body))};}));assert.equal(writes,1);assert.equal(result.persisted,1);assert.equal(f.entry(final).status,'SAVED');
 }finally{f.store.close();}
});
for(const line of BUSINESSES.fumigacion.phones)test('the current client-calendar profile retains the form and exact time through one local PROGRAMADO receipt on '+line,async t=>{
 const start=Date.parse('2026-10-16T21:20:00Z');t.mock.timers.enable({apis:['Date'],now:start});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));
 f.config.lines.sort((a,b)=>(a.phone===line?-1:1));f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:start-5000};f.config.clientRequestedSchedule={enabled:true,startsAt:start-1000,guard:MARIA_CLIENT_SCHEDULE_GUARD};
 try{
  const quote=await f.turn('Tengo cucarachas en apartamento de dos habitaciones en Itagüí.');f.deliver(quote);f.deliver(await f.turn('Sí'));
  const fields=await f.turn('Laura Gómez Martínez\nCra 44 # 83-20 (interior 402) donde la señora Marina\n17/10/26 8 am');assert.match(f.deliver(fields),/17\/10\/2026 a las 8:00 a\. m\./);assert.doesNotMatch(f.reply(fields),/año completo/);assert.equal(f.entry(fields),undefined);
  const timing=await f.turn('17/10/2026 8 am');assert.match(f.deliver(timing),/Horario solicitado: 17\/10\/2026 a las 8:00 a\. m\./);assert.equal(f.entry(timing),undefined);
  const final=await f.turn('Sí, confirmo que los datos son correctos.');assert.ok(f.entry(final));let creates=0;
  const transport=f.transport(async(_url,opts)=>{creates++;const p=JSON.parse(opts.body),projection=projectClientRequestedSchedule(p.slots.preference,p.sources.preference.at,p.sources.acceptance.at),{complete,...calendar}=projection;assert.equal(complete,true);return {ok:true,json:async()=>({...f.receipt(p),state:'PROGRAMADO',scheduled:true,schedulingKind:'client-requested-without-technician',schedule:{...calendar,preferenceSourceId:p.sources.preference.id,preferenceSourceAt:p.sources.preference.at,summaryMid:p.summaryConfirmation.mid,acceptanceId:p.quote.acceptanceId,verifiedCurrentFields:true}})};});
  assert.equal((await drainProgramRegistrations(f.store,f.config,transport)).persisted,1);assert.equal(creates,1);assert.equal(f.entry(final).status,'SAVED');assert.equal(f.entry(final).receipt.schedule.startAt,'2026-10-17T13:00:00.000Z');assert.equal(f.entry(final).receipt.schedule.technicianId,null);
  await drainProgramRegistrations(f.store,f.config,transport);assert.equal(creates,1);
 }finally{f.store.close();}
});

test('already sent the facts gets one focused confirmation hint without losing the delivered summary or creating an order',async t=>{
 const start=Date.parse('2026-10-16T21:20:00Z');t.mock.timers.enable({apis:['Date'],now:start});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));
 try{
  const {facts}=await f.summary();f.deliver(facts);const summaryMid=f.store.db.prepare('SELECT mid FROM outbox WHERE id=?').get(facts.id+':reply').mid;
  const reminder=await f.turn('Ya te los envié.');assert.match(f.deliver(reminder),/ya tengo tus datos.*confirmes/s);assert.equal(f.entry(reminder),undefined);assert.equal(f.state(reminder).programIntake.promptId,facts.id+':reply');
  const again=await f.turn('Ya te los envié.');assert.equal(f.reply(again),undefined);assert.equal(f.entry(again),undefined);
  const yes=await f.turn('Sí, confirmo que los datos son correctos.');assert.ok(f.entry(yes));assert.equal(f.entry(yes).payload.summaryConfirmation.mid,summaryMid);
 }finally{f.store.close();}
});
