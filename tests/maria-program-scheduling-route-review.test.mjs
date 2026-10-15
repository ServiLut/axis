import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {drainProgramRegistrations,registrationHash,registrationStatus,MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD,MARIA_TENANT,MARIA_COMPANY,ownSavedPendingOperation,queueOwnSavedServiceReview,savedServiceReviewStillValid} from '../automation/service-bots/maria-program.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {prepareTesaQuestion} from '../automation/service-bots/tesa-operations.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';
import {BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';

const actor='7508385b-536e-4aa2-8137-d734dfc900ef',order='85c47fc8-5314-4f68-a8d6-dde112640f5d',phone='573001112233';
function fixture(){
 const now=Date.now(),start=Math.floor((now-30000)/1000)*1000,store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const participants=[...TESA_BOT_PHONES,'573043332213'];
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-route-'+i})),operationalLineScope:{company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,authorizedAt:new Date(start-50000).toISOString(),activeLines:[BUSINESSES.fumigacion.phones[0]],suspendedLines:[BUSINESSES.fumigacion.phones[1]],reportedBlockedDurationHours:24},mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:actor,startsAt:start-60000,expiresAt:start+86400000},tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:BUSINESSES.fumigacion.phones[0],activatedAt:start-60000,allowedParticipantPhones:['573043332213'],verifiedMembership:{owner:BUSINESSES.fumigacion.phones[0],ownerOpen:true,verifiedAt:now,expiresAt:now+300000,sourceHash:'a'.repeat(64),participantPhones:participants,participantBindings:participants.map(p=>({jid:p+'@s.whatsapp.net',phone:p}))}}};
 initializeInactivityFollowup(config,store);const engine=new Engine(store,config);let count=0,writes=0,payload;
 const turn=async text=>{const e={id:'SCHEDULE_'+ ++count,phone,line:config.lines[0].phone,fromMe:false,kind:'text',text,at:start+count*1000};store.enqueue(e);await engine.process(e);return e;};
 const deliver=e=>{const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');assert.ok(row,e.text);const mid='MID_'+e.id;store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id=?").run(mid,row.id);store.recordFirstBotReply({...row,mid},mid,config.bot,e.at);store.delivery(mid,e.line,'DELIVERED');store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+row.id);return store.open(row.body);};
 const transport={verifyLine:async()=>{},currentAttention:async()=>({complete:true,sources:store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(phone,at)=>({complete:true,sources:store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(phone,at)}),request:async(line,path,body)=>{
  const id=body.where.key.id,source=store.db.prepare('SELECT body FROM events WHERE id=?').get(id),out=store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
  if(source){const e=store.open(source.body);return {messages:{records:[{key:{id,fromMe:false,remoteJid:e.phone+'@s.whatsapp.net'},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}
  if(out)return {messages:{records:[{key:{id,fromMe:true,remoteJid:out.phone+'@s.whatsapp.net'},message:{conversation:store.open(out.body)},status:'DELIVERY_ACK'}]}};return {messages:{records:[]}};
 },fetcher:async(url,opts)=>{writes++;payload=JSON.parse(opts.body);return {ok:true,json:async()=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actor,createdById:actor,phone:payload.phone,persisted:true,orderId:order,caseId:payload.caseId,acceptanceId:payload.quote.acceptanceId,requestHash:registrationHash(payload),state:'NUEVO',scheduled:false,paymentRecorded:false})};}};
 const prepare=async()=>{deliver(await turn('Tengo cucarachas en apartamento de 42 mts2 en Itagüí. ¿Cuánto cuesta?'));deliver(await turn('Sí, agéndame para mañana en la tarde'));deliver(await turn('Persona Sintética'));deliver(await turn('Calle 50 # 42-18 apartamento 301'));return turn('Confirmo');};
 const alerts=()=>store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'chief-report:maria-saved-%'").all();
 const marker=()=>{const r=store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'maria-scheduling-review:%'").get();return r?{key:r.key,...store.open(r.value)}:null;};
 return {store,config,engine,turn,deliver,transport,prepare,alerts,marker,stats:()=>({writes,payload})};
}
const advance=async(ms,fn)=>{const read=Date.now,base=read();Date.now=()=>base+ms;try{return await fn();}finally{Date.now=read;}};

for(const failure of ['membership','stale-source','minimization','throws','missing-router'])test('a new saved own service with no prepared scheduling question creates one durable minimized Sandra alert: '+failure,async()=>{
 const f=fixture();try{
  const final=await f.prepare();let router=routeCaseQuestion;
  if(failure==='membership')f.config.tesaOperations.verifiedMembership.verifiedAt-=600000;
  if(failure==='stale-source')f.config.tesaOperations.activatedAt=Date.now();
  if(failure==='minimization')router=(s,c,q)=>prepareTesaQuestion(s,c,{...q,text:'Consulta en Calle 50 # 42-18 al número 573001112233'});
  if(failure==='throws')router=()=>{throw Error('isolated failure');};
  if(failure==='missing-router')router=null;
  await drainProgramRegistrations(f.store,f.config,f.transport,router);await drainProgramRegistrations(f.store,f.config,f.transport,router);
  assert.equal(f.stats().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(registrationStatus(f.config,f.store).uncertain,0);assert.equal(f.store.caseAuthorship(f.stats().payload.caseId).programCreatorMembershipId,actor);
  const alerts=f.alerts();assert.equal(alerts.length,1);assert.equal(alerts[0].phone,SANDRA);assert.equal(alerts[0].line,f.config.lines[0].phone);assert.equal(alerts[0].internal,1);const text=f.store.open(alerts[0].body);assert.doesNotMatch(text,/573001112233|Persona Sintética|Calle 50|mañana.*confirmad|se contactó.*grupo/);assert.match(text,/Aún no tengo confirmado el horario del servicio/);assert.equal(f.marker().guard,MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD);assert.equal(f.marker().status,'DIRECTION_REVIEW_PREPARED');
  const saved=f.store.db.prepare("SELECT body FROM outbox WHERE id LIKE 'program:%:saved'").get();assert.match(f.store.open(saved.body),/Aún no tengo confirmado el horario del servicio\./);
  await f.turn('¿Ya tienen técnico?');assert.equal(f.alerts().length,1);assert.equal(f.store.conversation(final.phone).state.programServiceId,order);
 }finally{f.store.close();}
});

for(const state of ['READY','ACCEPTED','DELIVERED','READ','UNCERTAIN'])test('existing exact TESA '+state+' remains intact, with one prospective internal escalation after 20 minutes',async()=>{
 const f=fixture();try{
  await f.prepare();let before;
  const router=(s,c,q)=>{const r=prepareTesaQuestion(s,c,q);s.db.prepare('UPDATE tesa_outbox SET state=?,mid=? WHERE id=?').run(state,state==='READY'?null:'EXISTING_MID',r.outboxId);before={q:{...s.db.prepare('SELECT * FROM tesa_questions WHERE id=?').get(r.id)},o:{...s.db.prepare('SELECT * FROM tesa_outbox WHERE id=?').get(r.outboxId)}};return {created:false,id:null,state:'TESA_DISABLED_OR_MEMBERSHIP_PENDING'};};
  await drainProgramRegistrations(f.store,f.config,f.transport,router);assert.equal(f.alerts().length,0);assert.equal(f.marker().linkedQuestion.id,before.q.id);assert.equal(f.marker().status,'WAITING_FOR_COORDINATION');assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'tesa-continuation-plan:%'").get().n,0);
  await advance(19*60000,()=>drainProgramRegistrations(f.store,f.config,f.transport,router));assert.equal(f.alerts().length,0);
  await advance(20*60000+1000,async()=>{await drainProgramRegistrations(f.store,f.config,f.transport,router);await drainProgramRegistrations(f.store,f.config,f.transport,router);});assert.equal(f.alerts().length,1);assert.equal(f.stats().writes,1);assert.deepEqual({...f.store.db.prepare('SELECT * FROM tesa_questions WHERE id=?').get(before.q.id)},before.q);assert.deepEqual({...f.store.db.prepare('SELECT * FROM tesa_outbox WHERE id=?').get(before.o.id)},before.o);
 }finally{f.store.close();}
});

for(const questionState of ['ANSWERED','ANSWER_REVIEW'])test('existing '+questionState+' TESA question is not recreated or silently adopted',async()=>{
 const f=fixture();try{await f.prepare();await drainProgramRegistrations(f.store,f.config,f.transport,(s,c,q)=>{const r=prepareTesaQuestion(s,c,q);s.db.prepare('UPDATE tesa_questions SET state=? WHERE id=?').run(questionState,r.id);return {...r,created:false};});assert.equal(f.alerts().length,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'tesa-continuation-plan:%'").get().n,0);await advance(20*60000+1000,()=>drainProgramRegistrations(f.store,f.config,f.transport));assert.equal(f.alerts().length,questionState==='ANSWERED'?0:1);assert.equal(f.stats().writes,1);}finally{f.store.close();}
});

test('an unrelated legacy question never swallows a new scheduling-failure fact or changes the old question',async()=>{
 const f=fixture();try{await f.prepare();const caseId=f.store.conversation(phone).state.caseId;f.store.db.prepare("INSERT INTO questions(id,phone,case_id,topic,conditions_hash,recipient,body,state,outbox_id) VALUES(?,'',?,?,?,?,?,'LEGACY_PENDING',NULL)").run('UNRELATED_LEGACY',caseId,'historical-price','legacy',SANDRA,f.store.seal({source:'OLD',text:'histórico'}));const before={...f.store.db.prepare('SELECT * FROM questions WHERE id=?').get('UNRELATED_LEGACY')};f.config.tesaOperations.verifiedMembership.verifiedAt-=600000;await drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion);assert.equal(f.alerts().length,1);assert.deepEqual({...f.store.db.prepare('SELECT * FROM questions WHERE id=?').get('UNRELATED_LEGACY')},before);assert.equal(f.stats().writes,1);}finally{f.store.close();}
});

for(const blocker of ['hold','changed-case','red-source','closed','old-marker'])test('prospective wait escalation preserves scope and never replays cases: '+blocker,async()=>{
 const f=fixture();try{
  await f.prepare();await drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion);const marker=f.marker(),conv=f.store.conversation(phone);
  if(blocker==='hold')f.store.hold(phone,'VERIFIED_HUMAN');
  if(blocker==='changed-case')f.store.saveConversation(phone,{...conv.state,caseId:'fumigacion:OTHER'});
  if(blocker==='closed')f.store.saveConversation(phone,{...conv.state,closed:true});
  if(blocker==='red-source')f.store.enqueue({id:'RED_HISTORY',phone,line:f.config.lines[1].phone,at:Date.now(),kind:'text',fromMe:false,text:'Otra línea'});
  if(blocker==='old-marker')f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal({...marker,guard:'historical-not-authorized'}),marker.key);
  await advance(20*60000+1000,()=>drainProgramRegistrations(f.store,f.config,f.transport));assert.equal(f.alerts().length,0);assert.equal(f.stats().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.store.conversation(phone).hold,blocker==='hold'?1:0);
 }finally{f.store.close();}
});

test('an internal alert queue failure preserves the definite saved receipt and its single durable attempt',async()=>{
 const f=fixture();try{await f.prepare();const queue=f.store.queue.bind(f.store);f.store.queue=(...args)=>{if(args[0].startsWith('chief-report:maria-saved-'))throw Error('isolated queue failure');return queue(...args);};f.config.tesaOperations.verifiedMembership.verifiedAt-=600000;await drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion);await advance(20*60000+1000,()=>drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion));assert.equal(f.stats().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(registrationStatus(f.config,f.store).uncertain,0);assert.equal(f.marker().status,'DIRECTION_REVIEW_PREPARATION_FAILED');assert.equal(f.alerts().length,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-saved-review-alert:%'").get().n,1);}finally{f.store.close();}
});

for(const questionState of ['PENDING','ANSWER_REVIEW','ANSWERED'])test('a matching existing private '+questionState+' question preserves its destination and uncertain outbox',async()=>{
 const f=fixture();try{
  await f.prepare();let before;
  await drainProgramRegistrations(f.store,f.config,f.transport,(s,c,q)=>{const r=s.question({...q,recipient:'573043332213'});s.db.prepare('UPDATE questions SET state=? WHERE id=?').run(questionState,r.id);s.db.prepare("UPDATE outbox SET state='UNCERTAIN' WHERE id=?").run('question:'+r.id);before={question:{...s.db.prepare('SELECT * FROM questions WHERE id=?').get(r.id)},outbox:{...s.db.prepare('SELECT * FROM outbox WHERE id=?').get('question:'+r.id)}};return {created:false,id:null,state:'TESA_MEMBERSHIP_PENDING'};});
  assert.equal(f.alerts().length,0);await advance(20*60000+1000,()=>drainProgramRegistrations(f.store,f.config,f.transport));assert.equal(f.alerts().length,questionState==='ANSWERED'?0:1);assert.deepEqual({...f.store.db.prepare('SELECT * FROM questions WHERE id=?').get(before.question.id)},before.question);assert.deepEqual({...f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(before.outbox.id)},before.outbox);assert.equal(f.stats().writes,1);
 }finally{f.store.close();}
});

test('a current own cancellation request suppresses the later coordination escalation without cancelling the saved order',async()=>{
 const f=fixture();try{
  await f.prepare();await drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion);const q={...f.store.db.prepare('SELECT * FROM tesa_questions').get()},out={...f.store.db.prepare('SELECT * FROM tesa_outbox').get()};await f.turn('Cancela mi servicio');assert.equal(f.alerts().length,1);assert.match(f.store.open(f.alerts()[0].body),/solicitud de cancelación/);
  await advance(20*60000+1000,async()=>{await drainProgramRegistrations(f.store,f.config,f.transport);await drainProgramRegistrations(f.store,f.config,f.transport);});assert.equal(f.alerts().length,1);assert.equal(f.marker().status,'CANCELLATION_REVIEW');assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.store.conversation(phone).hold,0);assert.equal(f.store.conversation(phone).state.programServiceId,order);assert.deepEqual({...f.store.db.prepare('SELECT * FROM tesa_questions').get()},q);assert.deepEqual({...f.store.db.prepare('SELECT * FROM tesa_outbox').get()},out);assert.equal(f.stats().writes,1);
 }finally{f.store.close();}
});

test('a verified new own pending-operation source can reuse the receipt helper and stable exception outbox without touching uncertain delivery',async()=>{
 const f=fixture();try{await f.prepare();f.config.tesaOperations.verifiedMembership.verifiedAt-=600000;await drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion);const e=await f.turn('¿Ya tienen técnico?'),state=f.store.conversation(phone).state,own=ownSavedPendingOperation(f.store,f.config,state,e);assert.ok(own);const prior=f.alerts()[0];f.store.db.prepare("UPDATE outbox SET state='UNCERTAIN' WHERE id=?").run(prior.id);const result=queueOwnSavedServiceReview(f.store,f.config,own.entry,{motive:'scheduling-unconfirmed',text:'No sustituir texto previo',sourceId:e.id});assert.equal(result.queued,false);assert.equal(result.state,'UNCERTAIN');assert.equal(f.alerts().length,1);assert.equal(f.store.open(f.alerts()[0].body),f.store.open(prior.body));assert.equal(ownSavedPendingOperation(f.store,f.config,state,{...e,text:'otra fuente'}),null);}finally{f.store.close();}
});

for(const mutation of ['none','hold','new-case','closed','expiry','changed-body','changed-ledger','changed-payload','pending-staff','resolved','uncertain','accepted'])test('saved private alert local send guard rechecks the current ledger, source and case: '+mutation,async()=>{
 const f=fixture();try{
  await f.prepare();f.config.tesaOperations.verifiedMembership.verifiedAt-=600000;await drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion);const alert=f.alerts()[0],text=f.store.open(alert.body),conv=f.store.conversation(phone);
  assert.equal(savedServiceReviewStillValid(f.store,f.config,alert,text),true);
  if(mutation==='hold')f.store.hold(phone,'HUMAN_AFTER_QUEUE');
  if(mutation==='new-case')f.store.saveConversation(phone,{...conv.state,caseId:'fumigacion:NEW_CASE'});
  if(mutation==='closed')f.store.saveConversation(phone,{...conv.state,closed:true});
  if(mutation==='expiry')f.config.mariaProgram.expiresAt=Date.now()-1;
  if(mutation==='changed-body')f.store.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(f.store.seal('Texto alterado sin la fuente original'),alert.id);
  if(mutation==='changed-ledger'){const row=f.store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'maria-saved-review-alert:%'").get();f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal({...f.store.open(row.value),textHash:'0'.repeat(64)}),row.key);}
  if(mutation==='changed-payload'){const row=f.store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'maria-registration:%'").get(),entry=f.store.open(row.value);entry.payload.customerName='Otro Nombre';f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(entry),row.key);}
  if(mutation==='pending-staff')f.store.enqueue({id:'STAFF_WAITING_CLASSIFICATION',phone,line:f.config.lines[0].phone,at:Date.now(),fromMe:true,kind:'text',text:'Yo continúo'});
  if(mutation==='resolved')f.store.saveConversation(phone,{...conv.state,verifiedTesaAnswerSource:'EXACT_ANSWER_SOURCE',awaitingHumanReview:false});
  if(mutation==='uncertain'||mutation==='accepted')f.store.db.prepare('UPDATE outbox SET state=? WHERE id=?').run(mutation.toUpperCase(),alert.id);
  const current=f.alerts()[0];assert.equal(savedServiceReviewStillValid(f.store,f.config,current,f.store.open(current.body)),mutation==='none');assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.stats().writes,1);assert.equal(f.alerts().length,1);assert.equal(f.alerts()[0].state,['uncertain','accepted'].includes(mutation)?mutation.toUpperCase():'READY');
 }finally{f.store.close();}
});

test('a queued scheduling alert becomes invalid after a source-verified current cancellation request',async()=>{
 const f=fixture();try{await f.prepare();f.config.tesaOperations.verifiedMembership.verifiedAt-=600000;await drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion);const scheduling=f.alerts()[0];await f.turn('Cancela mi servicio');assert.equal(f.alerts().length,2);assert.equal(savedServiceReviewStillValid(f.store,f.config,scheduling,f.store.open(scheduling.body)),false);const cancellation=f.alerts().find(row=>row.id!==scheduling.id);assert.equal(savedServiceReviewStillValid(f.store,f.config,cancellation,f.store.open(cancellation.body)),true);assert.equal(f.stats().writes,1);}finally{f.store.close();}
});

for(const mutation of ['none','source-body','marker-hash','missing-source','pending-staff'])test('a cancellation alert requires the exact durable request and its original native source: '+mutation,async()=>{
 const f=fixture();try{
  await f.prepare();await drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion);await f.turn('Cancela mi servicio');const alert=f.alerts()[0],ref=f.store.conversation(phone).state.requestedProgramCancellationReview,row=f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(ref.key),marker=f.store.open(row.value);
  assert.equal(savedServiceReviewStillValid(f.store,f.config,alert,f.store.open(alert.body)),true);
  if(mutation==='source-body'){const source=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(marker.sources[0].id);f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal({...f.store.open(source.body),text:'Y entonces'}),marker.sources[0].id);}
  if(mutation==='marker-hash')f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal({...marker,receiptHash:'0'.repeat(64)}),ref.key);
  if(mutation==='missing-source'){marker.sources[0].id='MISSING_NATIVE_CANCELLATION_SOURCE';f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(marker),ref.key);const conv=f.store.conversation(phone);conv.state.requestedProgramCancellationReview.firstSourceId=marker.sources[0].id;f.store.saveConversation(phone,conv.state);}
  if(mutation==='pending-staff')f.store.enqueue({id:'STAFF_BEFORE_CANCEL_ALERT',phone,line:f.config.lines[0].phone,at:Date.now(),fromMe:true,kind:'text',text:'Atención humana'});
  assert.equal(savedServiceReviewStillValid(f.store,f.config,alert,f.store.open(alert.body)),mutation==='none');assert.equal(f.stats().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);
 }finally{f.store.close();}
});

test('a pending exact own echo does not become an unclassified staff takeover',async()=>{
 const f=fixture();try{await f.prepare();f.config.tesaOperations.verifiedMembership.verifiedAt-=600000;await drainProgramRegistrations(f.store,f.config,f.transport,routeCaseQuestion);const own=f.store.db.prepare("SELECT * FROM outbox WHERE phone=? AND state='DELIVERED' AND internal=0 LIMIT 1").get(phone);f.store.enqueue({id:own.mid,phone,line:own.line,at:Date.now(),fromMe:true,kind:'text',text:f.store.open(own.body)});const alert=f.alerts()[0];assert.equal(savedServiceReviewStillValid(f.store,f.config,alert,f.store.open(alert.body)),true);assert.equal(f.store.conversation(phone).hold,0);}finally{f.store.close();}
});
