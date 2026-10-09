import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,HILARY} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {prepareTesaQuestion,bindTesaQuestionDelivery,acceptTesaQuotedAnswer,tesaCaseAnswers} from '../automation/service-bots/tesa-operations.mjs';
import {drainTesaGroup} from '../automation/service-bots/tesa-transport.mjs';

const customer='573001112233',caseId='FUM_BLUE_CASE',mid='TESA_BLUE_QUESTION_MID';
function fixture(scoped=true){
 const now=Date.now(),business=BUSINESSES.fumigacion,blue=business.phones[0];
 const participants=[...TESA_BOT_PHONES,HILARY].map(phone=>({id:phone+'@s.whatsapp.net',phoneNumber:phone+'@s.whatsapp.net'}));
 const config={company:'fumigacion',...business,enabled:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:now-60000,
  lines:business.phones.map((phone,i)=>({phone,instance:'own-group-'+i})),tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,
   senderLine:blue,activatedAt:now-30000,allowedParticipantPhones:[HILARY],verifiedMembership:{owner:blue,ownerOpen:true,verifiedAt:now-500,
    expiresAt:now+240000,sourceHash:'a'.repeat(64),participantPhones:participants.map(p=>p.id.split('@')[0]),participantBindings:participants.map(p=>({jid:p.id,phone:p.id.split('@')[0]}))}}};
 const enableScope=()=>{config.operationalLineScope={version:'authorized-fumigacion-blue-only-v1',company:'fumigacion',activeLines:[blue],suspendedLines:[business.phones[1]],
  authorizedAt:new Date(now-2000).toISOString(),authorizationSource:'direct-user-20261009-red-block-24h'};};
 if(scoped)enableScope();
 const store=new Store(':memory:',config.company,randomBytes(32));
 const source={id:'BLUE_GROUP_CUSTOMER_SOURCE',phone:customer,line:blue,at:now,fromMe:false,kind:'text',text:'¿Qué técnico está disponible mañana?'};
 store.enqueue(source);store.saveConversation(customer,{slots:{service:'cucarachas',location:'medellin'},asked:[],caseId});
 const request={phone:customer,line:blue,caseId,topic:'disponibilidad-y-tecnico',conditions:{service:'cucarachas',question:'¿Disponible mañana?'},source:source.id,
  text:'María Ángel · ref FUM-A · contacto 2233 · Cucarachas en Medellín. ¿Técnico disponible mañana?'};
 let sends=0;
 const transport={verifyLine:async(phone)=>{assert.equal(phone,blue);return {open:true,ownerVerified:true};},request:async(line,path,body)=>{
  if(path.startsWith('/group/findGroupInfos/'))return {id:TESA_GROUP_JID,subject:TESA_GROUP_SUBJECT,size:participants.length,participants};
  if(path.startsWith('/message/sendText/')){assert.equal(line.phone,blue);assert.equal(body.number,TESA_GROUP_JID);sends++;return {key:{id:mid,remoteJid:TESA_GROUP_JID}};}
  throw Error('UNEXPECTED_TEST_NATIVE_REQUEST');
 }};
 return {config,store,source,request,transport,enableScope,get sends(){return sends;}};
}

test('a newly authorized blue customer case can ask TESA without consulting or sending from red',async()=>{
 const f=fixture();try{
  const prepared=prepareTesaQuestion(f.store,f.config,f.request);assert.equal(prepared.created,true);
  assert.equal((await drainTesaGroup(f.store,f.config,f.transport)).accepted,1);assert.equal(f.sends,1);
  const out=f.store.db.prepare('SELECT * FROM tesa_outbox').get();assert.equal(out.source_line,'573126944997');assert.equal(out.sender_line,'573126944997');
 }finally{f.store.close();}
});

test('a red, shared or preauthorization customer source cannot prepare a new blue group question',()=>{
 for(const kind of ['red','shared','old']){
  const f=fixture();try{
   if(kind==='red'){f.store.db.prepare('UPDATE events SET line=?').run(f.config.lines[1].phone);f.request.line=f.config.lines[1].phone;}
   if(kind==='shared')f.store.enqueue({...f.source,line:f.config.lines[1].phone});
   if(kind==='old')f.store.db.prepare('UPDATE events SET at=?').run(Date.parse(f.config.operationalLineScope.authorizedAt)-1);
   assert.equal(prepareTesaQuestion(f.store,f.config,f.request).state,'TESA_OPERATIONAL_SCOPE_REVIEW');
   assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,0);
  }finally{f.store.close();}
 }
});

test('historical READY or red-source group questions remain durable review without migration or uncertain send',async()=>{
 for(const kind of ['old','red']){
  const f=fixture(false);try{
   if(kind==='red'){f.store.db.prepare('UPDATE events SET line=?').run(f.config.lines[1].phone);f.request.line=f.config.lines[1].phone;}
   const prepared=prepareTesaQuestion(f.store,f.config,f.request);assert.equal(prepared.created,true);
   f.enableScope();if(kind==='old')f.store.db.prepare('UPDATE tesa_outbox SET created=?').run(Date.parse(f.config.operationalLineScope.authorizedAt)-1);
   const before=f.store.db.prepare('SELECT * FROM tesa_outbox').get(),questionBefore={...f.store.db.prepare('SELECT * FROM tesa_questions').get()};
   const result=await drainTesaGroup(f.store,f.config,f.transport);assert.equal(f.sends,0);assert.equal(result.uncertain,0);assert.equal(result.scopeReviewed,1);
   const after=f.store.db.prepare('SELECT * FROM tesa_outbox').get();assert.equal(after.state,'OPERATIONAL_SCOPE_REVIEW');assert.equal(after.body,before.body);
   assert.equal(after.source_line,before.source_line);assert.equal(after.sender_line,before.sender_line);assert.equal(after.mid,null);
   assert.deepEqual({...f.store.db.prepare('SELECT * FROM tesa_questions').get()},questionBefore);
  }finally{f.store.close();}
 }
});

test('a shared duplicate arriving during group owner verification blocks the question before sending',async()=>{
 const f=fixture();try{
  assert.equal(prepareTesaQuestion(f.store,f.config,f.request).created,true);
  f.transport.verifyLine=async()=>{f.store.enqueue({...f.source,line:f.config.lines[1].phone});return {open:true,ownerVerified:true};};
  const result=await drainTesaGroup(f.store,f.config,f.transport);
  assert.equal(f.sends,0);assert.equal(result.accepted,0);assert.equal(result.uncertain,0);assert.equal(result.scopeReviewed,1);
  assert.equal(f.store.db.prepare('SELECT state FROM tesa_outbox').get().state,'OPERATIONAL_SCOPE_REVIEW');
 }finally{f.store.close();}
});

test('historical delivered and uncertain group outcomes are not resent or changed by single-line mode',async()=>{
 for(const state of ['DELIVERED','UNCERTAIN']){
  const f=fixture(false);try{
   prepareTesaQuestion(f.store,f.config,f.request);f.store.db.prepare('UPDATE tesa_outbox SET state=?,mid=?').run(state,state==='DELIVERED'?mid:null);
   f.enableScope();f.store.db.prepare('UPDATE tesa_outbox SET created=?').run(Date.parse(f.config.operationalLineScope.authorizedAt)-1);
   const before={...f.store.db.prepare('SELECT * FROM tesa_outbox').get()};await drainTesaGroup(f.store,f.config,f.transport);
   assert.equal(f.sends,0);assert.deepEqual({...f.store.db.prepare('SELECT * FROM tesa_outbox').get()},before);
  }finally{f.store.close();}
 }
});

test('a quoted answer to a historical group question is observed without resuming its customer case or overwriting its question',()=>{
 const f=fixture(false);try{
  const prepared=prepareTesaQuestion(f.store,f.config,f.request),row=f.store.db.prepare('SELECT * FROM tesa_outbox').get();
  f.store.db.prepare("UPDATE tesa_outbox SET state='ACCEPTED',mid=?").run(mid);
  bindTesaQuestionDelivery(f.store,f.config,{outboxId:row.id,mid,groupJid:TESA_GROUP_JID,senderLine:row.sender_line,text:f.store.open(row.body),state:'DELIVERED',at:Date.now(),nativeVerified:true});
  f.enableScope();f.store.db.prepare('UPDATE tesa_outbox SET created=?').run(Date.parse(f.config.operationalLineScope.authorizedAt)-1);
  const before={...f.store.db.prepare('SELECT * FROM tesa_questions WHERE id=?').get(prepared.id)};
  const result=acceptTesaQuotedAnswer(f.store,f.config,{id:'TESA_HUMAN_SCOPED_RESPONSE',company:'fumigacion',groupJid:TESA_GROUP_JID,
   receivingLine:f.config.lines[0].phone,line:f.config.lines[0].phone,participant:{phone:HILARY,jid:HILARY+'@s.whatsapp.net'},at:Date.now(),kind:'text',
   text:'Para ese caso puede ir el técnico mañana a las tres.',fromMe:false,forwarded:false,quote:{mid,groupJid:TESA_GROUP_JID,participantJid:f.config.lines[0].phone+'@s.whatsapp.net'},media:null});
  assert.equal(result.accepted,false);assert.equal(result.state,'OBSERVED_OPERATIONAL_SCOPE_REVIEW');
  assert.deepEqual({...f.store.db.prepare('SELECT * FROM tesa_questions WHERE id=?').get(prepared.id)},before);
  assert.equal(f.store.db.prepare('SELECT state FROM tesa_outbox').get().state,'DELIVERED');
  assert.deepEqual(tesaCaseAnswers(f.store,f.config,{caseId,customerPhone:customer}),[]);
 }finally{f.store.close();}
});
