import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {drainProgramRegistrations,registrationHash,registrationStatus,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {drainTesaGroup,ingestTesaWebhook,tesaCustomerReplyStillValid} from '../automation/service-bots/tesa-transport.mjs';
import {flushOutbox,drain} from '../automation/service-bots/transport.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';

const actor='7508385b-536e-4aa2-8137-d734dfc900ef',order='85c47fc8-5314-4f68-a8d6-dde112640f5d',customer='573001112233',human='573043332213',groupMid='TESA_NEW_ORDER_001';
function fixture(){
 const now=Date.now(),start=Math.floor((now-30000)/1000)*1000,store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const participants=[...TESA_BOT_PHONES,human].map(phone=>({id:phone+'@s.whatsapp.net',phoneNumber:phone+'@s.whatsapp.net'}));
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:start-60000,historyCheckRequired:true,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:actor,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:start+86400000},tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:BUSINESSES.fumigacion.phones[0],activatedAt:start-60000,allowedParticipantPhones:[human],verifiedMembership:{owner:BUSINESSES.fumigacion.phones[0],ownerOpen:true,verifiedAt:now,expiresAt:now+300000,sourceHash:'a'.repeat(64),participantPhones:participants.map(p=>p.id.split('@')[0]),participantBindings:participants.map(p=>({jid:p.id,phone:p.id.split('@')[0]}))}}};
 initializeInactivityFollowup(config,store);
 const engine=new Engine(store,config);let count=0,writes=0,groupSends=0,customerSends=0,payload,nativeAnswer;const customerSendIds=[];
 const turn=async (text,patch={})=>{const e={id:'FULL_PIPELINE_'+ ++count,phone:customer,line:config.lines[0].phone,fromMe:false,kind:'text',text,at:start+count*1000,...patch};store.enqueue(e);await engine.process(e);return e;};
 const delivered=e=>{const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');assert.ok(row);const mid='MID_'+e.id;store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,row.id);store.recordFirstBotReply({...row,mid},mid,config.bot,e.at);store.delivery(mid,e.line,'DELIVERED');store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+row.id);return store.open(row.body);};
 const receipt=p=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actor,createdById:actor,phone:p.phone,persisted:true,orderId:order,caseId:p.caseId,acceptanceId:p.quote.acceptanceId,requestHash:registrationHash(p),state:'NUEVO',scheduled:false,paymentRecorded:false});
 const transport={verifyLine:async()=>{},currentAttention:async()=>({complete:true,sources:store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(phone,at)=>({complete:true,sources:store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(phone,at)}),send:async out=>{customerSends++;customerSendIds.push(out.id);return 'CUSTOMER_SEND_'+customerSends;},request:async(line,path,body)=>{
  if(path.startsWith('/group/findGroupInfos/'))return {id:TESA_GROUP_JID,subject:TESA_GROUP_SUBJECT,size:participants.length,participants};
  if(path.startsWith('/message/sendText/')){groupSends++;return {key:{id:groupMid,remoteJid:TESA_GROUP_JID}};}
  const id=body.where.key.id;
  if(id===groupMid){const out=store.db.prepare('SELECT * FROM tesa_outbox WHERE mid=?').get(groupMid);return {messages:{records:[{key:{id,fromMe:true,remoteJid:TESA_GROUP_JID},message:{conversation:store.open(out.body)},messageTimestamp:Math.floor(Date.now()/1000),status:'DELIVERY_ACK'}]}};}
  if(nativeAnswer?.key.id===id)return {messages:{records:[structuredClone(nativeAnswer)]}};
  const inbound=store.db.prepare('SELECT body FROM events WHERE id=?').get(id),out=store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
  if(inbound){const e=store.open(inbound.body);return {messages:{records:[{key:{id,fromMe:e.fromMe,remoteJid:e.phone+'@s.whatsapp.net'},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}
  if(out)return {messages:{records:[{key:{id,fromMe:true,remoteJid:out.phone+'@s.whatsapp.net'},message:{conversation:store.open(out.body)},status:'DELIVERY_ACK',messageTimestamp:start/1000}]}};
  return {messages:{records:[]}};
 },fetcher:async(url,opts)=>{writes++;payload=JSON.parse(opts.body);return {ok:true,json:async()=>receipt(payload)};}};
 const save=async({firstText='Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. ¿Cuánto cuesta?'}={})=>{
  const first=await turn(firstText);assert.match(delivered(first),/129.000/);
  assert.match(delivered(await turn('Sí, agéndame para mañana en la tarde')),/nombre completo/);
  const fields=await turn('Juliana Arango Pérez\nCarrera 74b número 94-110 interior 201');assert.match(delivered(fields),/Juliana Arango Pérez/);
  const accepted=await turn('Confirmo');
  await drainProgramRegistrations(store,config,transport,routeCaseQuestion);
  assert.equal(registrationStatus(config,store).saved,1);assert.equal(payload.customerName,'Juliana Arango Pérez');assert.equal(payload.address,'Carrera 74b número 94-110 interior 201');assert.equal(payload.sources.customerName.text,fields.text);assert.equal(payload.sources.address.text,fields.text);assert.equal(payload.quote.acceptanceId,accepted.id);assert.equal(payload.quote.scheduleHash,BUSINESS_PRICE_HASH);assert.equal(payload.quote.priceCop,129000);
  for(const absent of ['technicianId','fecha','hora','activity','08:00','18:00','oficina'])assert.equal(JSON.stringify(payload).includes(absent),false,absent);
  const queued=store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'program:%:saved'").get();assert.match(store.open(queued.body),/quedó registrada/);assert.match(store.open(queued.body),/horario aún está pendiente/);
  store.db.prepare("UPDATE outbox SET state='DELIVERED',mid='SAVED_RECEIPT_001' WHERE id=?").run(queued.id);
  const question=store.db.prepare('SELECT * FROM tesa_outbox').get();assert.ok(question);assert.match(store.open(question.body),/mañana en la tarde/);assert.doesNotMatch(store.open(question.body),/Juliana|Carrera 74|573001112233/);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'tesa-continuation-plan:%'").get().n,1);
  await drainTesaGroup(store,config,transport);assert.equal(groupSends,1);
  return {accepted,fields};
 };
 const answer=(text='Hay disponibilidad mañana a las 3 p. m.; el técnico es Andrés.',patch={})=>{
  nativeAnswer={key:{id:'HUMAN_OPERATIONAL_001',remoteJid:TESA_GROUP_JID,fromMe:false,participant:human+'@s.whatsapp.net'},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:text},contextInfo:{stanzaId:groupMid,participant:config.lines[0].phone+'@s.whatsapp.net'},...patch};
  return {instance:config.lines[0].instance,event:'messages.upsert',data:structuredClone(nativeAnswer)};
 };
 return {store,config,transport,engine,turn,delivered,save,answer,native:()=>nativeAnswer,setNative:value=>{nativeAnswer=value;},counts:()=>({writes,groupSends,customerSends,customerSendIds:[...customerSendIds],payload})};
}
test('a customer confirmation after delivered own TESA continuation does not reopen the same operational question',async()=>{
 const f=fixture();try{
  await f.save();await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());
  await flushOutbox(f.store,f.config,f.transport);
  const continuation=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'tesa-continuation:%'").get();
  f.store.delivery(continuation.mid,f.config.lines[0].phone,'DELIVERED');
  const confirmation=await f.turn('Confirmo',{at:Math.floor(Date.now()/1000)*1000+1000});
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);
  assert.equal(f.store.conversation(customer).state.awaitingHumanReview,false);
  assert.equal(f.counts().writes,1);
  assert.equal(f.counts().groupSends,1);
  const reply=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(confirmation.id+':reply');
  assert.ok(reply);assert.equal(f.store.open(reply.body),'Recibí tu confirmación para el servicio.');
 }finally{f.store.close();}
});

const confirmationText='Recibí tu confirmación para el servicio.';

test('incidental pets preserve the complete quoted intake, single own registration and operational confirmation flow',async()=>{
 const f=fixture();try{
  await f.save({firstText:'Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. ¿Cuánto cuesta? Tengo dos mascotas.'});
  const notes=structuredClone(f.store.conversation(customer).state.receptionNotes.incidentalPets);
  assert.equal(notes.length,1);assert.equal(notes[0].text,'Tengo dos mascotas');
  // This existing closed registration contract does not map the local note
  // into a Tenaxis observation, and the test must not imply otherwise.
  assert.equal(Object.hasOwn(f.counts().payload,'receptionNotes'),false);
  await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());await flushOutbox(f.store,f.config,f.transport);
  const continuation=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'tesa-continuation:%'").get();f.store.delivery(continuation.mid,f.config.lines[0].phone,'DELIVERED');
  const e=await f.turn('Confirmo',{at:Math.floor(Date.now()/1000)*1000+1000});
  const out=f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply');assert.equal(f.store.open(out.body),confirmationText);
  assert.deepEqual(f.store.conversation(customer).state.receptionNotes.incidentalPets,notes);
  assert.equal(f.counts().writes,1);assert.equal(f.counts().groupSends,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);
 }finally{f.store.close();}
});
const meta=(f,key)=>{const row=f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row&&f.store.open(row.value);};
const putMeta=(f,key,value)=>f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(value),key);
const freshAt=()=>Math.floor(Date.now()/1000)*1000+1000;
async function continued(f,{delivered=true}={}){
 const {accepted}=await f.save();await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());
 await flushOutbox(f.store,f.config,f.transport);
 const out=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'tesa-continuation:%'").get();
 assert.ok(out);if(delivered)f.store.delivery(out.mid,f.config.lines[0].phone,'DELIVERED');
 return {accepted,out:f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(out.id),question:f.store.db.prepare('SELECT * FROM tesa_questions').get()};
}
const ownReply=(f,e)=>{const row=f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply');return row&&f.store.open(row.body);};

test('Confirmo and Acepto, including a quote of the delivered own continuation, retain the original order, sources and price',async()=>{
 for(const [text,quoted] of [['Confirmo',false],['Acepto',false],['Sí, confirmo. Gracias',true]]){const f=fixture();try{
  const {accepted,out,question}=await continued(f),caseId=f.store.conversation(customer).state.caseId;
  const original=meta(f,'maria-registration:'+caseId),payload=structuredClone(f.counts().payload),conditions=f.store.open(question.body).conditions,originalQuote=structuredClone(f.store.conversation(customer).state.quotedPrice);
  assert.ok(conditions.priceSource);const oldQuestion={...question};
  const e=await f.turn(text,{at:freshAt(),...(quoted?{quotedId:out.mid}:{})});
  assert.equal(ownReply(f,e),confirmationText,text);assert.equal(f.store.conversation(customer).state.awaitingHumanReview,false);
  assert.equal(f.store.conversation(customer).state.programServiceId,order);assert.deepEqual(f.store.conversation(customer).state.quotedPrice,originalQuote);assert.notEqual(f.store.conversation(customer).state.quotedPrice.acceptanceSource,e.id);
  assert.deepEqual(meta(f,'maria-registration:'+caseId),original);assert.deepEqual(f.counts().payload,payload);assert.deepEqual({...f.store.db.prepare('SELECT * FROM tesa_questions').get()},oldQuestion);
  assert.equal(f.counts().writes,1);assert.equal(f.counts().groupSends,1);assert.equal(payload.quote.acceptanceId,accepted.id);assert.equal(original.receipt.state,'NUEVO');assert.equal(original.receipt.scheduled,false);
  assert.doesNotMatch(ownReply(f,e),/Andrés|3 p|técnico asignado|qued[oó] agendad|horario confirmado/);
 }finally{f.store.close();}}
});

test('a real change of day or time creates new scoped availability and cannot reuse the delivered answer',async()=>{
 for(const text of ['Sí, agéndame para el viernes en la mañana','Acepto, agéndame para mañana a las 4 pm']){const f=fixture();try{
  const {question}=await continued(f),entryKey='maria-registration:'+question.case_id,original=meta(f,entryKey);
  const e=await f.turn(text,{at:freshAt()});const questions=f.store.db.prepare('SELECT * FROM tesa_questions ORDER BY rowid').all();
  assert.equal(questions.length,2,text);assert.equal(questions[0].id,question.id);assert.equal(questions[0].state,'ANSWERED');assert.equal(questions[1].state,'PENDING');assert.notEqual(questions[1].conditions_hash,question.conditions_hash);
  assert.notEqual(f.store.open(questions[1].body).conditions.preference,f.store.open(question.body).conditions.preference);assert.equal(f.store.conversation(customer).state.pendingTesaQuestionId,questions[1].id);assert.equal(f.store.conversation(customer).state.awaitingHumanReview,true);
  assert.notEqual(ownReply(f,e),confirmationText);assert.doesNotMatch(ownReply(f,e)||'',/Andrés|3 p/);assert.deepEqual(meta(f,entryKey),original);assert.equal(f.counts().writes,1);
 }finally{f.store.close();}}
});

test('a new service starts its own case without reusing the old order availability or writing another order',async()=>{
 const f=fixture();try{
  const {question}=await continued(f),original=meta(f,'maria-registration:'+question.case_id);
  const e=await f.turn('Quiero un nuevo servicio de fumigación para chinches en dos colchones en mi apartamento de Itagüí',{at:freshAt()});
  assert.notEqual(f.store.conversation(customer).state.caseId,question.case_id);assert.equal(f.store.conversation(customer).state.programServiceId,undefined);assert.notEqual(ownReply(f,e),confirmationText);assert.doesNotMatch(ownReply(f,e)||'',/Andrés|3 p/);
  assert.deepEqual(meta(f,'maria-registration:'+question.case_id),original);assert.equal(f.counts().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);
 }finally{f.store.close();}
});

test('an expired answer, observed edit or different human answer keeps review without silently deduplicating the changed source',async()=>{
 for(const change of ['expired','edited','different-human-answer']){const f=fixture();try{
  const {question}=await continued(f);
  if(change==='expired')f.store.db.prepare('UPDATE tesa_questions SET valid_until=? WHERE id=?').run(Date.now()-1,question.id);
  else if(change==='edited'){const body=f.answer('Hay disponibilidad el viernes a las 8');await ingestTesaWebhook(f.store,f.config,f.transport,body);}
  else{const body=f.answer('Hay disponibilidad el viernes a las 8',{key:{...f.native().key,id:'SECOND_HUMAN_SOURCE_001'}});await ingestTesaWebhook(f.store,f.config,f.transport,body);}
  const e=await f.turn('Confirmo',{at:freshAt()});assert.equal(ownReply(f,e),'Necesito verificar nuevamente la disponibilidad para continuar.',change);assert.equal(f.store.conversation(customer).state.awaitingHumanReview,true,change);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);assert.equal(f.counts().groupSends,1);assert.equal(f.counts().writes,1);assert.equal(f.store.conversation(customer).hold,0);
  if(change!=='expired')assert.equal(f.store.db.prepare('SELECT state FROM tesa_questions').get().state,'ANSWER_REVIEW');
 }finally{f.store.close();}}
});

test('a continuation without a delivered receipt cannot be used as customer confirmation evidence',async()=>{
 for(const state of ['READY','SENDING','UNCERTAIN','ACCEPTED']){const f=fixture();try{
  const {out}=await continued(f,{delivered:false});f.store.db.prepare('UPDATE outbox SET state=? WHERE id=?').run(state,out.id);
  const e=await f.turn('Acepto',{at:freshAt()});assert.equal(ownReply(f,e),undefined,state);assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(out.id).state,state);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);assert.equal(f.counts().groupSends,1);assert.equal(f.counts().writes,1);
 }finally{f.store.close();}}
});

test('confirmation evidence stays limited to its own quote, receipt, source, case, line, time and prospective plan',async()=>{
 for(const change of ['foreign-quote','forwarded','other-line','old-time','future-time','missing-delivery-proof','missing-plan','foreign-plan-case','changed-slots','changed-receipt-actor','changed-receipt-hash','uncertain-registration','changed-order','changed-observed-answer','revoked-human','expired-program','pending-source']){const f=fixture();try{
  const {out,question}=await continued(f),caseId=question.case_id,entryKey='maria-registration:'+caseId,planKey='tesa-continuation-plan:'+question.id;
  const patch={at:freshAt()};
  if(change==='foreign-quote')patch.quotedId='FOREIGN_DELIVERED_MID';
  if(change==='forwarded')patch.forwarded=true;
  if(change==='other-line')patch.line=f.config.lines[1].phone;
  if(change==='old-time')patch.at=out.updated-5000;
  if(change==='future-time')patch.at=Date.now()+61000;
  if(change==='missing-delivery-proof')f.store.db.prepare('DELETE FROM meta WHERE key=?').run('first-delivery:'+out.id);
  if(change==='missing-plan')f.store.db.prepare('DELETE FROM meta WHERE key=?').run(planKey);
  if(change==='foreign-plan-case')putMeta(f,planKey,{...meta(f,planKey),caseId:'fumigacion:another-case'});
  if(change==='changed-slots')f.store.saveConversation(customer,{...f.store.conversation(customer).state,slots:{...f.store.conversation(customer).state.slots,preference:'el viernes en la mañana'}});
  if(change==='changed-receipt-actor'){const entry=meta(f,entryKey);entry.receipt.createdById='another-actor';putMeta(f,entryKey,entry);}
  if(change==='changed-receipt-hash'){const entry=meta(f,entryKey);entry.receipt.requestHash='b'.repeat(64);putMeta(f,entryKey,entry);}
  if(change==='uncertain-registration')putMeta(f,entryKey,{...meta(f,entryKey),status:'UNCERTAIN'});
  if(change==='changed-order')f.store.saveConversation(customer,{...f.store.conversation(customer).state,programServiceId:'another-order'});
  if(change==='changed-observed-answer'){const answer=f.store.open(question.answer),row=f.store.db.prepare('SELECT body FROM tesa_events WHERE id=?').get(answer.sourceKey);f.store.db.prepare('UPDATE tesa_events SET body=? WHERE id=?').run(f.store.seal({...f.store.open(row.body),text:'Hay ruta el viernes'}),answer.sourceKey);}
  if(change==='revoked-human')f.config.tesaOperations.allowedParticipantPhones=[f.config.lines[1].phone];
  if(change==='expired-program')f.config.mariaProgram.expiresAt=Date.now()-1;
  if(change==='pending-source')f.store.enqueue({id:'PENDING_CHANGED_SOURCE',phone:customer,line:f.config.lines[0].phone,fromMe:false,kind:'text',text:'Cambié de dirección',at:freshAt()-1000});
  const e=await f.turn('Confirmo',patch);assert.notEqual(ownReply(f,e),confirmationText,change);assert.equal(f.counts().writes,1,change);assert.equal(f.counts().groupSends,1,change);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,1,change);
  if(change==='missing-plan')assert.equal(meta(f,planKey),undefined,'an old question never acquires a plan on confirmation');
 }finally{f.store.close();}}
});

test('human attention is retained and a bounded confirmation cannot consume model budget or create any scheduling write',async()=>{
 const f=fixture();try{
  await continued(f);f.store.hold(customer,'EXACT_HUMAN_SOURCE');const e=await f.turn('Confirmo',{at:freshAt()});
  assert.equal(ownReply(f,e),undefined);assert.equal(f.store.conversation(customer).hold,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);assert.equal(f.counts().writes,1);
 }finally{f.store.close();}
 const g=fixture();try{
  const {out,question}=await continued(g);let modelCalls=0;g.config.historyCheckRequired=false;g.transport.understand=async()=>{modelCalls++;throw Error('MODEL_MUST_NOT_RUN');};
  const e={id:'CONFIRM_WITH_ZERO_MODEL_BUDGET',phone:customer,line:g.config.lines[0].phone,fromMe:false,kind:'text',text:'Acepto',quotedId:out.mid,at:freshAt()};g.store.enqueue(e);await drain(g.store,g.config,g.transport,g.engine);
  assert.equal(modelCalls,0);assert.equal(ownReply(g,e),confirmationText);assert.equal(g.store.conversation(customer).state.awaitingHumanReview,false);assert.equal(g.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);assert.equal(g.counts().writes,1);assert.equal(g.counts().groupSends,1);assert.equal(meta(g,'maria-registration:'+question.case_id).receipt.scheduled,false);
 }finally{g.store.close();}
});
