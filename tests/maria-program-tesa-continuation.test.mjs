import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH as BUSINESS_PRICE_HASH,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {drainProgramRegistrations,registrationHash,registrationStatus,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {drainTesaGroup,ingestTesaWebhook,tesaCustomerReplyStillValid} from '../automation/service-bots/tesa-transport.mjs';
import {flushOutbox} from '../automation/service-bots/transport.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';

const actor='7508385b-536e-4aa2-8137-d734dfc900ef',order='85c47fc8-5314-4f68-a8d6-dde112640f5d',customer='573001112233',human='573043332213',groupMid='TESA_NEW_ORDER_001';
function fixture(){
 const now=Date.now(),start=Math.floor((now-30000)/1000)*1000,store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const participants=[...TESA_BOT_PHONES,human].map(phone=>({id:phone+'@s.whatsapp.net',phoneNumber:phone+'@s.whatsapp.net'}));
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:start-60000,historyCheckRequired:true,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:actor,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:start+86400000},tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:BUSINESSES.fumigacion.phones[0],activatedAt:start-60000,allowedParticipantPhones:[human],verifiedMembership:{owner:BUSINESSES.fumigacion.phones[0],ownerOpen:true,verifiedAt:now,expiresAt:now+300000,sourceHash:'a'.repeat(64),participantPhones:participants.map(p=>p.id.split('@')[0]),participantBindings:participants.map(p=>({jid:p.id,phone:p.id.split('@')[0]}))}}};
 initializeInactivityFollowup(config,store);
 const engine=new Engine(store,config);let count=0,writes=0,groupSends=0,customerSends=0,payload,nativeAnswer;const customerSendIds=[];
 const turn=async text=>{const e={id:'FULL_PIPELINE_'+ ++count,phone:customer,line:config.lines[0].phone,fromMe:false,kind:'text',text,at:start+count*1000};historicalPriceClock.timers.setTime(e.at);store.enqueue(e);await engine.process(e);return e;};
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
 const save=async()=>{
  const first=await turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. ¿Cuánto cuesta?');assert.match(delivered(first),/129.000/);
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
test('full own price, separate fields, accepted NEW receipt and exact quoted human availability continue the customer once',async()=>{
 const f=fixture();try{
  await f.save();const body=f.answer();assert.equal((await ingestTesaWebhook(f.store,f.config,f.transport,body)).caseAnswers,1);
  const reply=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'tesa-continuation:%'").get();assert.ok(reply);assert.match(f.store.open(reply.body),/mañana a las 3 p. m.; el técnico es Andrés/);assert.match(f.store.open(reply.body),/requiere confirmación en la agenda/);assert.equal(await tesaCustomerReplyStillValid(f.store,f.config,f.transport,reply),true);
  assert.equal(f.store.conversation(customer).hold,0);assert.equal(f.store.conversation(customer).state.awaitingHumanReview,false);assert.equal(f.store.conversation(customer).state.programServiceId,order);
  await ingestTesaWebhook(f.store,f.config,f.transport,body);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,1);assert.equal(f.counts().writes,1);assert.equal(f.counts().groupSends,1);
  await flushOutbox(f.store,f.config,f.transport);assert.equal(f.counts().customerSends,1);await flushOutbox(f.store,f.config,f.transport);assert.equal(f.counts().customerSends,1);
 }finally{f.store.close();}
});
test('fresh human source must be native, exact, operational and unchanged before customer continuity',async()=>{
 for(const change of ['no-native','wrong-text','wrong-human','wrong-quote','native-forward','edited','uncertain-availability','instruction','full-phone','warranty','human-hold','new-customer','new-case','changed-slots','historical-question']){
  const f=fixture();try{
   await f.save();const body=f.answer();
   if(change==='no-native')f.setNative(null);
   if(change==='wrong-text')f.native().message.conversation='Hay ruta el viernes a las 8';
   if(change==='wrong-human')f.native().key.participant=f.config.lines[1].phone+'@s.whatsapp.net';
   if(change==='wrong-quote')f.native().contextInfo.stanzaId='FOREIGN_QUESTION_001';
   if(change==='native-forward')f.native().contextInfo.isForwarded=true;
   if(change==='edited')f.native().isEdited=true;
   if(change==='uncertain-availability'){const modified=f.answer('Quizás hay disponibilidad mañana a las 3');body.data=modified.data;}
   if(change==='instruction'){const modified=f.answer('Confírmale mañana a las 3');body.data=modified.data;}
   if(change==='full-phone'){const modified=f.answer('El técnico disponible mañana es 573009998877');body.data=modified.data;}
   if(change==='warranty'){const modified=f.answer('Mañana hay ruta con garantía gratis');body.data=modified.data;}
   if(change==='human-hold')f.store.hold(customer,'STAFF_TAKEOVER');
   if(change==='new-customer')f.store.enqueue({id:'NEW_CANCEL_SOURCE',phone:customer,line:f.config.lines[0].phone,fromMe:false,kind:'text',text:'No quiero',at:Date.now()});
   if(change==='new-case')f.store.saveConversation(customer,{...f.store.conversation(customer).state,caseId:'fumigacion:another'});
   if(change==='changed-slots')f.store.saveConversation(customer,{...f.store.conversation(customer).state,slots:{...f.store.conversation(customer).state.slots,preference:'el viernes'}});
   if(change==='historical-question')f.store.db.prepare("DELETE FROM meta WHERE key LIKE 'tesa-continuation-plan:%'").run();
   await ingestTesaWebhook(f.store,f.config,f.transport,body);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,0,change);assert.equal(f.counts().writes,1,change);assert.equal(f.store.conversation(customer).state.awaitingHumanReview,true,change);
  }finally{f.store.close();}
 }
});
test('another human answer, source edit or client correction after queue stops delivery without resending, release or order mutation',async()=>{
 for(const change of ['additional-answer','source-edit','client-correction','during-native-await']){const f=fixture();try{
  await f.save();await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());const out=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'tesa-continuation:%'").get();assert.ok(out);
  if(change==='additional-answer'){const body=f.answer('Hay ruta el viernes a las 8',{key:{...f.native().key,id:'OTHER_HUMAN_SOURCE'}});await ingestTesaWebhook(f.store,f.config,f.transport,body);}
  if(change==='source-edit')f.native().message.conversation='Hay ruta el viernes a las 8';
  if(change==='client-correction')await f.turn('La dirección es Calle 80 # 20-10');
  if(change==='during-native-await'){const read=f.transport.currentCustomerActivity;let first=true;f.transport.currentCustomerActivity=async(...args)=>{const result=await read(...args);if(first){first=false;f.store.hold(customer,'HUMAN_DURING_READ');}return result;};}
  assert.equal(await tesaCustomerReplyStillValid(f.store,f.config,f.transport,out),false,change);assert.equal(f.counts().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.store.conversation(customer).state.programServiceId,order);
 }finally{f.store.close();}}
});
test('a changed native operational answer during the final attention await cannot pass the second pre-send guard',async()=>{
 const f=fixture();try{
  await f.save();await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());const read=f.transport.currentAttention;let reads=0;
  f.transport.currentAttention=async(...args)=>{const result=await read(...args);if(++reads===2)f.native().message.conversation='Hay disponibilidad el viernes a las 8';return result;};
  const result=await flushOutbox(f.store,f.config,f.transport);
  assert.equal(f.counts().customerSends,0);assert.equal(result.suppressed,1);assert.equal(f.store.db.prepare("SELECT state FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().state,'TESA_ANSWER_REVIEW');assert.equal(f.store.conversation(customer).hold,0);assert.equal(f.counts().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);
 }finally{f.store.close();}
});
test('a native answer edited during the second customer-activity await is re-read after that await before reserving its send',async()=>{
 const f=fixture();try{
  await f.save();await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());const read=f.transport.currentCustomerActivity;let reads=0;
  f.transport.currentCustomerActivity=async(...args)=>{const result=await read(...args);if(++reads===2)f.native().message.conversation='Hay disponibilidad el viernes a las 8';return result;};
  const result=await flushOutbox(f.store,f.config,f.transport);
  assert.equal(reads,2);assert.equal(f.counts().customerSends,0);assert.equal(result.accepted,0);assert.equal(result.suppressed,1);assert.equal(f.store.db.prepare("SELECT state FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().state,'TESA_ANSWER_REVIEW');assert.equal(f.counts().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.store.conversation(customer).hold,0);
 }finally{f.store.close();}
});
test('edits during initial activity or courtesy verification cannot prepare a stale operational reply without a webhook',async()=>{
 for(const phase of ['activity','courtesy']){const f=fixture();try{
  await f.save();const courtesy=phase==='courtesy'?await f.turn('Muchas gracias'):null;
  if(phase==='activity'){const read=f.transport.currentCustomerActivity;f.transport.currentCustomerActivity=async(...args)=>{const result=await read(...args);f.native().message.conversation='Hay disponibilidad el viernes a las 8';return result;};}
  else{const read=f.transport.request;f.transport.request=async(...args)=>{const result=await read(...args);if(args[2]?.where?.key?.id===courtesy.id)f.native().message.conversation='Hay disponibilidad el viernes a las 8';return result;};}
  await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,0,phase);assert.equal(f.store.conversation(customer).state.awaitingHumanReview,true);assert.equal(f.counts().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);
 }finally{f.store.close();}}
});
test('a temporary native read failure defers only the newly prepared continuation and never repeats the business write or group question',async()=>{
 const f=fixture();try{
  await f.save();const body=f.answer(),read=f.transport.request;let fail=true;
  f.transport.request=async(line,path,payload)=>{if(payload?.where?.key?.id===body.data.key.id&&fail){fail=false;throw Error('CHANNEL_HTTP_502');}return read(line,path,payload);};
  assert.equal((await ingestTesaWebhook(f.store,f.config,f.transport,body)).caseAnswers,1);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,0);
  assert.equal((await ingestTesaWebhook(f.store,f.config,f.transport,body)).caseAnswers,0);
  const row=f.store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'tesa-continuation-read:%'").get();assert.ok(row);const pending=f.store.open(row.value);assert.equal(pending.state,'PENDING_NATIVE_READ');
  await drainTesaGroup(f.store,f.config,f.transport);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,0,'native retry respects its interval');
  f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal({...pending,nextAt:Date.now()-1}),row.key);
  await drainTesaGroup(f.store,f.config,f.transport);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,1);assert.equal(f.counts().writes,1);assert.equal(f.counts().groupSends,1);
  await drainTesaGroup(f.store,f.config,f.transport);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,1);
 }finally{f.store.close();}
});
test('a processed native pure courtesy before the human answer does not strand the saved order or renew its acceptance',async()=>{
 for(const text of ['Gracias','Muchas gracias','Gracias, muy amable']){const f=fixture();try{
  const {accepted}=await f.save();const courtesy=await f.turn(text);const original=f.counts().payload;
  await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());const out=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'tesa-continuation:%'").get();assert.ok(out,text);assert.equal(out.revision,f.store.conversation(customer).revision);
  assert.equal(await tesaCustomerReplyStillValid(f.store,f.config,f.transport,out),true);assert.equal(f.counts().writes,1);assert.equal(original.quote.acceptanceId,accepted.id);assert.notEqual(original.quote.acceptanceId,courtesy.id);
 }finally{f.store.close();}}
});
test('a stored courtesy with a changed native body cannot carry a saved order continuation',async()=>{
 const f=fixture();try{
  await f.save();const courtesy=await f.turn('Muchas gracias'),read=f.transport.request;
  f.transport.request=async(...args)=>{const result=await read(...args);if(args[2]?.where?.key?.id===courtesy.id)result.messages.records[0].message.conversation='No quiero el servicio';return result;};
  await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,0);assert.equal(f.counts().writes,1);
 }finally{f.store.close();}
});
test('a queued native courtesy waits for Engine classification before preparing the operational customer reply',async()=>{
 const f=fixture();try{
  await f.save();const e={id:'PENDING_PURE_COURTESY',phone:customer,line:f.config.lines[0].phone,fromMe:false,kind:'text',text:'Gracias, muy amable',at:Math.floor(Date.now()/1000)*1000};f.store.enqueue(e);
  await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-continuation:%'").get().n,0);
  const row=f.store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'tesa-continuation-read:%'").get();assert.ok(row);
  await f.engine.process(e);f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal({...f.store.open(row.value),nextAt:Date.now()-1}),row.key);
  await drainTesaGroup(f.store,f.config,f.transport);const out=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'tesa-continuation:%'").get();assert.ok(out);assert.equal(await tesaCustomerReplyStillValid(f.store,f.config,f.transport,out),true);assert.equal(f.counts().writes,1);assert.equal(f.counts().groupSends,1);
 }finally{f.store.close();}
});
test('courtesy arriving after queue defers then updates only the verified send revision without duplicating the answer or renewing acceptance',async()=>{
 const f=fixture();try{
  const {accepted}=await f.save();await ingestTesaWebhook(f.store,f.config,f.transport,f.answer());const out=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'tesa-continuation:%'").get();
  const e={id:'PENDING_AFTER_OPERATION',phone:customer,line:f.config.lines[0].phone,fromMe:false,kind:'text',text:'Muchas gracias',at:Math.floor(Date.now()/1000)*1000};f.store.enqueue(e);
  assert.equal(await tesaCustomerReplyStillValid(f.store,f.config,f.transport,out),null);await flushOutbox(f.store,f.config,f.transport);assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(out.id).state,'READY');assert.equal(f.counts().customerSends,0);
  await f.engine.process(e);await flushOutbox(f.store,f.config,f.transport);assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(out.id).state,'ACCEPTED');assert.equal(f.counts().customerSendIds.filter(id=>id.startsWith('tesa-continuation:')).length,1);assert.equal(f.counts().payload.quote.acceptanceId,accepted.id);assert.equal(f.counts().writes,1);
  await flushOutbox(f.store,f.config,f.transport);assert.equal(f.counts().customerSendIds.filter(id=>id.startsWith('tesa-continuation:')).length,1);
 }finally{f.store.close();}
});
