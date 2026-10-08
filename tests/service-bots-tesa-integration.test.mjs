import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {drainTesaGroup,ingestTesaWebhook,refreshTesaMembership} from '../automation/service-bots/tesa-transport.mjs';
import {tesaCaseAnswers} from '../automation/service-bots/tesa-operations.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';

const human='573043332213',customer='573001112233',mid='TESA_OWN_QUESTION_001';
function fixture(company='fumigacion'){
 const now=Date.now(),business=BUSINESSES[company],sender=business.phones[0];
 const participants=[...TESA_BOT_PHONES,human].map(phone=>({id:phone+'@s.whatsapp.net',phoneNumber:phone+'@s.whatsapp.net'}));
 const config={company,...business,enabled:true,chiefOnly:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:now-3600000,
  lines:business.phones.map((phone,i)=>({phone,instance:'synthetic-own-'+i,apiKey:'a'.repeat(32)})),tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:sender,activatedAt:now-60000,
   allowedParticipantPhones:[human],verifiedMembership:{owner:sender,ownerOpen:true,verifiedAt:now-1000,expiresAt:now+300000,sourceHash:'a'.repeat(64),participantPhones:participants.map(p=>p.id.split('@')[0]),participantBindings:participants.map(p=>({jid:p.id,phone:p.id.split('@')[0]}))}}};
 const store=new Store(':memory:',company,randomBytes(32)),engine=new Engine(store,config),source={id:'CUSTOMER_TESA_001',phone:customer,line:business.phones[1],fromMe:false,at:now,kind:'text',text:'¿Qué horario pueden ofrecer?'};
 store.enqueue(source);const caseId=company+':'+source.id;store.saveConversation(customer,{slots:{service:'cucarachas',location:'medellin'},asked:[],caseId});
 let sends=0;
 const transport={verifyLine:async()=>({open:true,ownerVerified:true}),request:async(line,path,body)=>{
  if(path.startsWith('/group/findGroupInfos/'))return {id:TESA_GROUP_JID,subject:TESA_GROUP_SUBJECT,size:participants.length,participants};
  if(path.startsWith('/message/sendText/')){sends++;assert.equal(line.phone,sender);assert.equal(body.number,TESA_GROUP_JID);return {key:{id:mid,remoteJid:TESA_GROUP_JID}};}
  if(path.startsWith('/chat/findMessages/')){const o=store.db.prepare('SELECT * FROM tesa_outbox WHERE mid=?').get(mid);return {messages:{records:[{key:{id:mid,fromMe:true,remoteJid:TESA_GROUP_JID},message:{conversation:store.open(o.body)},MessageUpdate:[{status:'DELIVERY_ACK'}]}]}};}
  throw Error('UNEXPECTED_REQUEST');
 }};
 const request={phone:customer,line:source.line,caseId,topic:'disponibilidad-y-tecnico',conditions:{service:'cucarachas',location:'medellin'},source:source.id,recipients:[human],text:'original private question'};
 return {store,engine,config,source,caseId,transport,request,get sends(){return sends;}};
}

test('operational new questions use a separate group outbox while private history and customer identity stay intact',async()=>{
 const f=fixture();try{
  const prepared=routeCaseQuestion(f.store,f.config,f.request);assert.equal(prepared.created,true);
  const o=f.store.db.prepare('SELECT * FROM tesa_outbox').get();assert.equal(o.source_line,f.source.line);assert.equal(o.sender_line,f.config.lines[0].phone);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM conversations WHERE phone=?').get(TESA_GROUP_JID).n,0);
  const sent=await drainTesaGroup(f.store,f.config,f.transport);assert.equal(sent.accepted,1);assert.equal(f.sends,1);
  await drainTesaGroup(f.store,f.config,f.transport);assert.equal(f.sends,1);assert.equal(f.store.db.prepare('SELECT state FROM tesa_outbox').get().state,'DELIVERED');
 }finally{f.store.close();}
});
test('a verified native quoted group answer completes only this bot operational wait and enters only its case context',async()=>{
 const f=fixture();try{
  const prepared=routeCaseQuestion(f.store,f.config,f.request);
  f.store.saveConversation(customer,{...f.store.conversation(customer).state,awaitingHumanReview:true,pendingTesaQuestionId:prepared.id});
  await drainTesaGroup(f.store,f.config,f.transport);
  const body={instance:f.config.lines[0].instance,event:'messages.upsert',data:{key:{id:'TESA_HUMAN_ANSWER_001',remoteJid:TESA_GROUP_JID,fromMe:false,participant:human+'@s.whatsapp.net'},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'Hay ruta mañana a las 10 a. m. para este caso.'},contextInfo:{stanzaId:mid,participant:f.config.lines[0].phone+'@s.whatsapp.net'}}};
  const received=await ingestTesaWebhook(f.store,f.config,f.transport,body);assert.equal(received.caseAnswers,1);
  assert.equal(f.store.conversation(customer).hold,0);assert.equal(f.store.conversation(customer).state.awaitingHumanReview,false);
  assert.equal(tesaCaseAnswers(f.store,f.config,{caseId:f.caseId,customerPhone:customer}).length,1);
  assert.deepEqual(tesaCaseAnswers(f.store,f.config,{caseId:'other-case',customerPhone:customer}),[]);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  assert.equal((await ingestTesaWebhook(f.store,f.config,f.transport,body)).caseAnswers,0);
 }finally{f.store.close();}
});
test('staff takeover prevents a new group query and no group answer releases a human hold',async()=>{
 const f=fixture();try{
  routeCaseQuestion(f.store,f.config,f.request);f.store.hold(customer,'STAFF_MESSAGE_001',true);
  const result=await drainTesaGroup(f.store,f.config,f.transport);assert.equal(result.accepted,0);assert.equal(f.sends,0);assert.equal(f.store.conversation(customer).hold,1);
 }finally{f.store.close();}
});
test('a send without receipt is durable UNCERTAIN and is not sent again after refresh',async()=>{
 const f=fixture();try{
  routeCaseQuestion(f.store,f.config,f.request);let calls=0;const request=f.transport.request;
  f.transport.request=async(...args)=>{if(args[1].startsWith('/message/sendText/')){calls++;throw Error('CHANNEL_HTTP_502');}return request(...args);};
  assert.equal((await drainTesaGroup(f.store,f.config,f.transport)).uncertain,1);
  await drainTesaGroup(f.store,f.config,f.transport);assert.equal(calls,1);assert.equal(f.store.db.prepare('SELECT state FROM tesa_outbox').get().state,'UNCERTAIN');
 }finally{f.store.close();}
});
test('failed or foreign current group membership leaves new group sends closed without falling back to private coordinators',async()=>{
 const f=fixture();try{
  routeCaseQuestion(f.store,f.config,f.request);f.config.tesaOperations.verifiedMembership.expiresAt=Date.now()-1;
  f.transport.request=async()=>({id:'foreign@g.us',subject:TESA_GROUP_SUBJECT,participants:[],size:0});
  assert.equal((await drainTesaGroup(f.store,f.config,f.transport)).membershipReview,true);
  assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}
});
test('ordinary private ingestion does not wait for or read TESA metadata',async()=>{
 const f=fixture();try{
  let calls=0;f.transport.request=async()=>{calls++;throw Error('SHOULD_NOT_RUN');};
  assert.equal((await ingestTesaWebhook(f.store,f.config,f.transport,{instance:f.config.lines[0].instance,event:'messages.upsert',data:{key:{remoteJid:customer+'@s.whatsapp.net'}}})).observed,0);assert.equal(calls,0);
 }finally{f.store.close();}
});
test('Miguel keeps source 9392 separate from verified group sender 1941 without accessing FUM database',async()=>{
 const f=fixture('servicio-tecnico');try{
  assert.equal(routeCaseQuestion(f.store,f.config,f.request).created,true);await refreshTesaMembership(f.config,f.transport,{force:true});await drainTesaGroup(f.store,f.config,f.transport);
  const o=f.store.db.prepare('SELECT * FROM tesa_outbox').get();assert.equal(o.company,'servicio-tecnico');assert.equal(o.source_line,'573137689392');assert.equal(o.sender_line,'573022691941');assert.equal(f.sends,1);
 }finally{f.store.close();}
});

test('group receipts with a colliding MID never mark a private outbox delivered',async()=>{
 const f=fixture(),token='w'.repeat(43);f.config.webhookHash=createHash('sha256').update(token).digest('hex');
 f.store.queue('private-question',human,f.config.lines[0].phone,'Consulta privada anterior',true,0);
 f.store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id='private-question'").run(mid);
 const server=createBotServer(f.config,f.store,f.transport,f.engine);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/webhook',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({event:'messages.update',instance:f.config.lines[0].instance,data:{key:{id:mid,remoteJid:TESA_GROUP_JID},update:{status:'DELIVERY_ACK'}}})});
  assert.equal(response.status,202);assert.equal((await response.json()).deliveryUpdates,0);
  assert.equal(f.store.db.prepare("SELECT state FROM outbox WHERE id='private-question'").get().state,'ACCEPTED');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));f.store.close();}
});

test('a group question omits full phone, address abbreviations and URLs from customer facts',()=>{
 const f=fixture();try{
  const prepared=routeCaseQuestion(f.store,f.config,{...f.request,conditions:{...f.request.conditions,detail:'Cl. 45 #32-20 apto 301; Cra. 43A #1 Sur-100; llamar 573001112233; https://private.example'}});
  assert.equal(prepared.created,true);const text=f.store.open(f.store.db.prepare('SELECT body FROM tesa_outbox').get().body);
  for(const sensitive of ['45 #32','43A','573001112233','https://private.example'])assert.equal(text.includes(sensitive),false);
 }finally{f.store.close();}
});
