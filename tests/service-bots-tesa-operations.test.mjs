import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,SANDRA,HILARY,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT} from '../automation/service-bots/tesa-config.mjs';
import {initializeTesaStore,observeTesaGroupEvent,prepareTesaQuestion,bindTesaQuestionDelivery,acceptTesaQuotedAnswer,tesaCaseAnswers,tesaStatus,reviewTesaSources} from '../automation/service-bots/tesa-operations.mjs';
const CUSTOMER='573001112233',HUMAN='573012993828';
function fixture(company='servicio-tecnico'){
 const now=Date.now(),business=BUSINESSES[company],phones=[...business.phones,SANDRA,HILARY,HUMAN];
 const config={company,...business,enabled:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:now-60000,lines:business.phones.map((phone,i)=>({phone,instance:company+'-local-'+i}))};
 config.tesaOperations={enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:business.phones[0],activatedAt:now-30000,allowedParticipantPhones:[SANDRA,HILARY,HUMAN],verifiedMembership:{owner:business.phones[0],ownerOpen:true,verifiedAt:now-1000,expiresAt:now+240000,sourceHash:'a'.repeat(64),participantPhones:phones,participantBindings:phones.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}};
 const store=new Store(':memory:',company,randomBytes(32));initializeTesaStore(store);
 const source={id:'TESA_CUSTOMER_SOURCE_001',phone:CUSTOMER,line:business.phones[1],at:now-1000,kind:'text',text:'Necesito reparar la nevera en Bello.',fromMe:false};store.enqueue(source);
 const request={phone:CUSTOMER,line:source.line,caseId:'CASE_TESA_A',topic:'disponibilidad-y-tecnico',conditions:{service:'nevera',question:'Disponible mañana?'},source:source.id,text:business.bot+' · '+business.name+' · ref CASE-A · contacto 2233 · Nevera en Bello. ¿Técnico disponible mañana?'};
 return {store,config,source,request};
}
const event=(f,patch={})=>({id:'TESA_HUMAN_RESPONSE_001',company:f.config.company,groupJid:TESA_GROUP_JID,receivingLine:f.config.tesaOperations.senderLine,line:f.config.tesaOperations.senderLine,participant:{phone:HUMAN,jid:HUMAN+'@s.whatsapp.net',altJid:null},at:Date.now(),kind:'text',text:'Para este caso puede ir el técnico mañana a las tres.',fromMe:false,forwarded:false,quote:{mid:'TESA_OWN_QUESTION_MID',groupJid:TESA_GROUP_JID,participantJid:f.config.tesaOperations.senderLine+'@s.whatsapp.net'},media:null,...patch});
function prepared(f){return prepareTesaQuestion(f.store,f.config,f.request);}
function delivered(f){const q=prepared(f),row=f.store.db.prepare('SELECT * FROM tesa_outbox WHERE id=?').get(q.outboxId);f.store.db.prepare("UPDATE tesa_outbox SET state='ACCEPTED',mid=? WHERE id=?").run('TESA_OWN_QUESTION_MID',row.id);const proof={outboxId:row.id,mid:'TESA_OWN_QUESTION_MID',groupJid:TESA_GROUP_JID,senderLine:row.sender_line,text:f.store.open(row.body),state:'DELIVERED',at:Date.now(),nativeVerified:true};bindTesaQuestionDelivery(f.store,f.config,proof);return {q,row,proof};}

test('new group questions are isolated, encrypted and retain distinct source/sender lines',()=>{const f=fixture();try{
 const q=prepared(f),row=f.store.db.prepare('SELECT * FROM tesa_outbox').get();assert.equal(q.created,true);assert.equal(row.source_line,f.source.line);assert.equal(row.sender_line,f.config.lines[0].phone);assert.equal(row.group_jid,TESA_GROUP_JID);assert.equal(f.store.open(row.body),f.request.text);assert.ok(!row.body.includes(f.request.text));assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
}finally{f.store.close();}});
test('private pending and legacy questions are preserved without migration or group send',()=>{for(const state of ['PENDING','ANSWER_REVIEW','LEGACY_PENDING']){const f=fixture();try{
 const old=f.store.question({phone:CUSTOMER,line:f.source.line,caseId:f.request.caseId,topic:f.request.topic,conditions:{old:true},recipient:SANDRA,text:'Pregunta privada anterior.',source:f.source.id});f.store.db.prepare('UPDATE questions SET state=? WHERE id=?').run(state,old.id);
 const q=prepared(f);assert.equal(q.id,old.id);assert.equal(q.created,false);assert.equal(q.privateQuestionPreserved,true);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,0);assert.equal(f.store.db.prepare('SELECT recipient FROM questions WHERE id=?').get(old.id).recipient,SANDRA);
}finally{f.store.close();}}});
test('group case/topic dedupe retains original conditions and source even after punctuation/details change',()=>{const f=fixture();try{
 const q=prepared(f),again=prepareTesaQuestion(f.store,f.config,{...f.request,conditions:{...f.request.conditions,question:'¿Disponible mañana?!',extra:'Dato adicional.'}});assert.equal(again.id,q.id);assert.equal(again.created,false);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,1);
}finally{f.store.close();}});
test('legacy empty customer phone and historical price-family pending questions never migrate to the group',()=>{
 for(const type of ['legacy-empty','availability-price','customer-cost','technical-scope']){const f=fixture();try{
  const topic=type==='availability-price'?'disponibilidad-y-cotizacion':type==='customer-cost'||type==='technical-scope'?'customer-question':f.request.topic;
  const questionText=type==='technical-scope'?'Tienen ese servicio?':'Cuál es el costo?';
  const old=f.store.question({phone:CUSTOMER,line:f.source.line,caseId:f.request.caseId,topic,conditions:{question:questionText},recipient:SANDRA,text:'Pregunta privada histórica del caso.',source:f.source.id});
  if(type==='legacy-empty')f.store.db.prepare("UPDATE questions SET phone='',state='LEGACY_PENDING' WHERE id=?").run(old.id);
  const before={...f.store.db.prepare('SELECT * FROM questions WHERE id=?').get(old.id)};
  const request=type==='technical-scope'?{...f.request,topic:'special-quotation',conditions:{kind:'technical-painting',question:'Necesito pintar la nevera'}}:{...f.request,topic:type==='legacy-empty'?f.request.topic:'cotizacion-verificada'};
  const result=prepareTesaQuestion(f.store,f.config,request);assert.equal(result.id,old.id,type);assert.equal(result.privateQuestionPreserved,true,type);assert.equal(result.created,false,type);assert.deepEqual({...f.store.db.prepare('SELECT * FROM questions WHERE id=?').get(old.id)},before);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,0);
 }finally{f.store.close();}}
});
test('disabled/stale membership, old source and cross-company cannot prepare a group question',()=>{for(const type of ['disabled','stale-membership','stale-source','wrong-line']){const f=fixture();try{
 if(type==='disabled')f.config.tesaOperations.enabled=false;if(type==='stale-membership')f.config.tesaOperations.verifiedMembership.verifiedAt=Date.now()-301000;if(type==='stale-source')f.store.db.prepare('UPDATE events SET at=? WHERE id=?').run(Date.now()-601000,f.source.id);
 if(type==='wrong-line')assert.throws(()=>prepareTesaQuestion(f.store,f.config,{...f.request,line:'573126944997'}),/TESA_CASE_SCOPE_REQUIRED/);else assert.equal(prepared(f).created,false);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,0);
}finally{f.store.close();}}const f=fixture();try{assert.throws(()=>prepareTesaQuestion(f.store,{...f.config,company:'fumigacion'},f.request),/DATABASE_SCOPE/);}finally{f.store.close();}});
test('payments, direction, warranty and reinforcement never become group operational questions',()=>{for(const [topic,conditions]of [['payment-instructions',{}],['warranty-review',{}],['service-documents',{}],['service-followup',{kind:'reinforcement'}],['service-followup',{kind:'verification'}]]){const f=fixture('fumigacion');try{assert.equal(prepareTesaQuestion(f.store,f.config,{...f.request,topic,conditions}).created,false);}finally{f.store.close();}}});
test('question minimization reviews full phones, complete/abbreviated addresses and policies without creating a group output',()=>{
 for(const text of ['Consulta del cliente '+CUSTOMER,'Consulta en calle 20 # 30-10','Consulta en Cl. 45 #32-20','Consulta en Cra. 43A #1 Sur-100','Consulta en cl45','Consulta en CR 43A','Consulta en Av. Número 6','Consulta en Transv. 20','Consulta en # 32-20','¿Qué pago debe hacer este caso?']){const f=fixture();try{
  const result=prepareTesaQuestion(f.store,f.config,{...f.request,text});assert.equal(result.state,'TESA_MINIMIZATION_REVIEW_REQUIRED',text);assert.equal(result.valid,false);assert.equal(result.created,false);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,0);
  const audit=f.store.db.prepare("SELECT * FROM audit WHERE action='TESA_QUESTION_MINIMIZATION_REVIEW'").get();assert.equal(audit.source,f.source.id);const detail=f.store.open(audit.detail);assert.equal(detail.outboundCreated,false);assert.match(detail.textHash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(detail).includes(text),false);assert.equal(JSON.stringify(detail).includes(CUSTOMER),false);
 }finally{f.store.close();}}
 for(const text of ['Miguel Ángel · ref A · contacto 2233 · ¿La cotización de este caso es 180000?','Miguel Ángel · ref A · contacto 2233 · Nevera en Bello, ¿disponible mañana 8-10?']){const f=fixture();try{assert.equal(prepareTesaQuestion(f.store,f.config,{...f.request,text}).created,true,text);}finally{f.store.close();}}
});
test('unsafe group text preserves newly stored reception and review audit in the surrounding transaction',()=>{const f=fixture();try{
 const source={...f.source,id:'TESA_CUSTOMER_SOURCE_UNSAFE_002',text:'Necesito reparar la nevera. Cl. 45 #32-20.'};
 const result=f.store.tx(()=>{
  f.store.db.prepare('INSERT INTO events(id,phone,at,line,from_me,body) VALUES(?,?,?,?,?,?)').run(source.id,source.phone,source.at,source.line,0,f.store.seal(source));f.store.db.prepare('INSERT INTO event_sources VALUES(?,?)').run(source.id,source.line);
  return prepareTesaQuestion(f.store,f.config,{...f.request,source:source.id,text:'Miguel Ángel · ref A · contacto 2233 · Cl. 45 #32-20 · ¿Técnico disponible?'});
 });
 assert.equal(result.valid,false);assert.equal(result.created,false);assert.deepEqual(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(source.id).body),source);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM event_sources WHERE event_id=?').get(source.id).n,1);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='TESA_QUESTION_MINIMIZATION_REVIEW' AND source=?").get(source.id).n,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}finally{f.store.close();}});
test('delivery binding requires ACCEPTED native MID, exact text/line/group and actual DELIVERED/READ',()=>{const f=fixture();try{
 const q=prepared(f),row=f.store.db.prepare('SELECT * FROM tesa_outbox').get(),proof={outboxId:q.outboxId,mid:'TESA_OWN_QUESTION_MID',groupJid:TESA_GROUP_JID,senderLine:row.sender_line,text:f.request.text,state:'DELIVERED',at:Date.now(),nativeVerified:true};
 assert.throws(()=>bindTesaQuestionDelivery(f.store,f.config,proof),/EXACT_NATIVE/);f.store.db.prepare("UPDATE tesa_outbox SET state='ACCEPTED',mid=?").run(proof.mid);
 for(const patch of [{nativeVerified:false},{text:'Otro texto.'},{groupJid:'123@g.us'},{senderLine:f.source.line},{state:'ACCEPTED'},{mid:'WRONG_NATIVE_MID'}])assert.throws(()=>bindTesaQuestionDelivery(f.store,f.config,{...proof,...patch}),/EXACT_NATIVE/);
 assert.equal(bindTesaQuestionDelivery(f.store,f.config,proof).state,'DELIVERED');assert.equal(bindTesaQuestionDelivery(f.store,f.config,{...proof,state:'READ'}).state,'READ');assert.equal(bindTesaQuestionDelivery(f.store,f.config,proof).state,'READ');
}finally{f.store.close();}});
test('exact current human quote learns only this case, with no acknowledgements, writes or hold change',()=>{const f=fixture();try{
 delivered(f);f.store.hold(CUSTOMER,'LOCAL_STAFF',true);const accepted=acceptTesaQuotedAnswer(f.store,f.config,event(f));assert.equal(accepted.accepted,true);assert.equal(accepted.businessExecuted,false);assert.equal(accepted.acknowledgementQueued,false);
 const answers=tesaCaseAnswers(f.store,f.config,{caseId:f.request.caseId,customerPhone:CUSTOMER});assert.equal(answers.length,1);assert.equal(answers[0].answer,event(f).text);assert.equal(typeof answers[0].question,'string');assert.equal(answers[0].source,'TESA_HUMAN_RESPONSE_001');assert.equal(f.store.conversation(CUSTOMER).hold,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(tesaCaseAnswers(f.store,f.config,{caseId:'OTHER_CASE',customerPhone:CUSTOMER}).length,0);
}finally{f.store.close();}});
test('wrong quote author/MID/group/receiving line, own bot, forwarding, media and stale source confer no answer',()=>{for(const type of ['author','mid','group','line','bot','forwarded','media','stale']){const f=fixture();try{
 delivered(f);const e=event(f);if(type==='author')e.quote.participantJid=HUMAN+'@s.whatsapp.net';if(type==='mid')e.quote.mid='OTHER_QUESTION_MID';if(type==='group')e.groupJid='123@g.us';if(type==='line'){e.receivingLine=f.source.line;e.line=f.source.line;}if(type==='bot'){e.participant={phone:f.config.lines[0].phone,jid:f.config.lines[0].phone+'@s.whatsapp.net'};}if(type==='forwarded')e.forwarded=true;if(type==='media'){e.kind='audio';e.media={mime:'audio/ogg'};}if(type==='stale')e.at=Date.now()-601000;
 assert.equal(acceptTesaQuotedAnswer(f.store,f.config,e).accepted,false);assert.equal(tesaCaseAnswers(f.store,f.config,{caseId:f.request.caseId,customerPhone:CUSTOMER}).length,0);
}finally{f.store.close();}}});
test('accepted-only question or uncited post has no authority or generic response',()=>{const f=fixture();try{
 prepared(f);assert.equal(acceptTesaQuotedAnswer(f.store,f.config,event(f)).accepted,false);assert.equal(observeTesaGroupEvent(f.store,f.config,event(f,{id:'TESA_UNCITED_POST',quote:null,text:'Buenas tardes equipo.'})).observed,true);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}finally{f.store.close();}});
test('unapproved member or unresolved native LID is observed without participant authority',()=>{for(const unresolved of [false,true]){const f=fixture();try{
 const member='573001000999',jid=unresolved?'123456789@lid':member+'@s.whatsapp.net';
 if(!unresolved)f.config.tesaOperations.verifiedMembership.participantPhones.push(member);
 f.config.tesaOperations.verifiedMembership.participantBindings.push({jid,phone:unresolved?null:member});
 delivered(f);const e=event(f,{participant:{phone:unresolved?null:member,jid}}),observed=observeTesaGroupEvent(f.store,f.config,e);assert.equal(observed.observed,true);assert.equal(acceptTesaQuotedAnswer(f.store,f.config,e).accepted,false);assert.equal(tesaCaseAnswers(f.store,f.config,{caseId:f.request.caseId,customerPhone:CUSTOMER}).length,0);
}finally{f.store.close();}}});
test('second exact source is retained for review and does not replace first answer or create an ack',()=>{const f=fixture();try{
 delivered(f);acceptTesaQuotedAnswer(f.store,f.config,event(f));const second=acceptTesaQuotedAnswer(f.store,f.config,event(f,{id:'TESA_SECOND_RESPONSE',text:'Para este caso tendría que ser a las cuatro.'}));assert.equal(second.state,'ANSWER_REVIEW');const q=f.store.db.prepare('SELECT * FROM tesa_questions').get();assert.equal(q.source_id,'TESA_HUMAN_RESPONSE_001');assert.equal(f.store.open(q.answer).text,event(f).text);assert.equal(tesaCaseAnswers(f.store,f.config,{caseId:f.request.caseId,customerPhone:CUSTOMER}).length,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}finally{f.store.close();}});
test('repeat MID is deduped despite native timestamp/fromMe variations and preserves all receiving sources',()=>{const f=fixture();try{
 f.config.activatedAt=Date.now()-300000;f.config.tesaOperations.activatedAt=Date.now()-180000;
 const a=observeTesaGroupEvent(f.store,f.config,event(f,{quote:null}));const b=observeTesaGroupEvent(f.store,f.config,event(f,{quote:null,at:Date.now()-121000,fromMe:true,receivingLine:f.source.line,line:f.source.line}));assert.equal(a.id,b.id);assert.equal(b.duplicate,true);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_events').get().n,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_event_sources').get().n,2);
}finally{f.store.close();}});
test('edited source is conflict review without throwing, preserving first body and disabling reuse',()=>{const f=fixture();try{
 delivered(f);acceptTesaQuotedAnswer(f.store,f.config,event(f));const edited=acceptTesaQuotedAnswer(f.store,f.config,event(f,{text:'Este texto fue modificado.'}));assert.equal(edited.state,'OBSERVATION_CONFLICT_REVIEW');assert.equal(edited.accepted,false);assert.equal(f.store.open(f.store.db.prepare('SELECT answer FROM tesa_questions').get().answer).text,event(f).text);assert.equal(tesaCaseAnswers(f.store,f.config,{caseId:f.request.caseId,customerPhone:CUSTOMER}).length,0);
}finally{f.store.close();}});
test('terse ack, warranty/payment statement and expired knowledge do not become executable case answers',()=>{for(const text of ['Listo','El caso tiene garantía gratuita.','El cliente debe pagar una cuota.']){const f=fixture();try{delivered(f);assert.equal(acceptTesaQuotedAnswer(f.store,f.config,event(f,{text})).accepted,false);assert.equal(tesaCaseAnswers(f.store,f.config,{caseId:f.request.caseId,customerPhone:CUSTOMER}).length,0);}finally{f.store.close();}}const f=fixture();try{delivered(f);acceptTesaQuotedAnswer(f.store,f.config,event(f));f.store.db.prepare('UPDATE tesa_questions SET valid_until=?').run(Date.now()-1);assert.equal(tesaCaseAnswers(f.store,f.config,{caseId:f.request.caseId,customerPhone:CUSTOMER}).length,0);}finally{f.store.close();}});
test('savepoints support outer store transaction and status/explicit source read never expose group credentials',()=>{const f=fixture();try{
 f.store.tx(()=>{prepared(f);observeTesaGroupEvent(f.store,f.config,event(f,{quote:null}));});const status=tesaStatus(f.store,f.config);assert.equal(status.enabled,true);assert.equal(status.humanHoldsModified,false);assert.equal(status.questions[0].n,1);assert.throws(()=>reviewTesaSources(f.store,{}),/EXPLICIT_SOURCE_SELECTION/);const selected=reviewTesaSources(f.store,{ids:['TESA_HUMAN_RESPONSE_001']});assert.equal(selected.results.length,1);assert.equal(selected.results[0].sources.length,1);assert.equal(selected.readOnly,true);
}finally{f.store.close();}});
