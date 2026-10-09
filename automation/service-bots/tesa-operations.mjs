import {createHash} from 'node:crypto';
import {BUSINESSES,SANDRA,normalize,questionRecipients} from './config.mjs';
import {getTesaConfig} from './tesa-config.mjs';
import {TESA_GROUP_JID,validateTesaGroupEvent} from './tesa-webhook.mjs';
import {quotationInquiry} from './prices.mjs';
import {customerQuestionKey,technicalAvailabilityQuestion} from './technical-scope.mjs';
import {assertOperationalLineScope,operationalLineAllowed,operationalCoverage} from './line-scope.mjs';

export const TESA_OPERATIONS_GUARD='exact-group-native-human-quoted-case-answer-v1';
const sha=value=>createHash('sha256').update(value).digest('hex');
const ownBots=Object.values(BUSINESSES).flatMap(b=>b.phones);
const freshSourceMs=600000,answerValidityMs=1800000;
const freshMembership=(config,now=Date.now())=>{const t=getTesaConfig(config,now);return t&&t.verifiedMembership.verifiedAt>=now-300000?t:null;};
let transaction=0;
function scoped(store,config){if(!BUSINESSES[store.company]||config.company!==store.company)throw Error('TESA_DATABASE_SCOPE_REQUIRED');}
function atomic(store,fn){const name='tesa_operation_'+(++transaction);store.db.exec('SAVEPOINT '+name);try{const r=fn();store.db.exec('RELEASE SAVEPOINT '+name);return r;}catch(error){store.db.exec('ROLLBACK TO SAVEPOINT '+name);store.db.exec('RELEASE SAVEPOINT '+name);throw error;}}
const canonical=value=>typeof value==='string'?normalize(value).replace(/[¿?¡!.,;:]+/g,' ').replace(/\s+/g,' ').trim():Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const forbidden=text=>/\b(?:cuotas?|abonos?|pagos?|pagar|bancos?|bancari[oa]s?|transferencias?|consignaciones?|cuentas? bancarias?|garantias?|gratuit[oa]s?|refuerzos?|certificados?|certificaciones?|politicas?|descuentos?|inofensiv[oa]|intoxicacion|reingreso)\b/.test(normalize(text));
const addressInText=text=>/\b(?:cl|cra|cr|kr|av|tv|dg|diag|transv|trv|circ|calle|carrera|avenida|transversal|diagonal|circular)\.?\s*(?:(?:n[°ºo.]?\.?|numero)\s*)?\d/.test(normalize(text))||/#\s*\d/.test(text);
const questionBodySafe=text=>typeof text==='string'&&text.trim().length>=8&&text.length<=1200&&!/(?:https?:\/\/|www\.|\b57\d{10}\b|\b3\d{9}\b|\b\d{7,}\b)/i.test(text)&&!forbidden(text)&&!addressInText(text);
const eventKey=e=>sha(JSON.stringify([e.company,e.groupJid,e.id,e.participant?.phone||e.participant?.jid||null]));
// Copies on own receiving lines can have different provider timestamps and
// fromMe flags. Preserve those in event_sources; dedupe the native content.
const stableEvent=e=>({id:e.id,company:e.company,groupJid:e.groupJid,participantKey:e.participant?.phone||e.participant?.jid||null,kind:e.kind,text:e.text,forwarded:e.forwarded,quote:e.quote?{mid:e.quote.mid,groupJid:e.quote.groupJid,participantJid:e.quote.participantJid}:null});
const stateResult=(row,created=false,store=null)=>({id:row?.id??null,state:row?.state??'NOT_PREPARED',created,valid:Boolean(row?.state==='ANSWERED'&&row.valid_until>Date.now()),answer:store&&row?.answer?store.open(row.answer):null,sourceId:row?.source_id??null});
function pendingPrivateQuestion(store,{phone,caseId,topic,conditions}){
 const rows=store.db.prepare("SELECT * FROM questions WHERE case_id=? AND state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW') AND (phone=? OR phone IS NULL OR phone='' OR state='LEGACY_PENDING') ORDER BY rowid").all(caseId,phone);
 const legacy=rows.find(q=>q.state==='LEGACY_PENDING');if(legacy)return legacy;
 if(store.company==='servicio-tecnico'&&(topic==='customer-question'||topic==='special-quotation'&&conditions?.kind==='technical-painting')){
  const currentKey=customerQuestionKey(conditions?.question||''),matching=rows.find(q=>{if(q.topic!=='customer-question')return false;const old=store.open(q.body).conditions?.question||'';return topic==='customer-question'?currentKey&&customerQuestionKey(old)===currentKey:technicalAvailabilityQuestion(old);});if(matching)return matching;
 }
 if(store.company==='fumigacion'&&topic==='service-followup'&&['requested-control','reinforcement','verification'].includes(conditions?.kind)){
  const pending=rows.find(q=>['service-followup','special-quotation','cotizacion-verificada','disponibilidad-y-cotizacion','disponibilidad-y-tecnico','missing-intake:service'].includes(q.topic));if(pending)return pending;
 }
 if(topic==='cotizacion-verificada'){
  const pending=rows.find(q=>['cotizacion-verificada','disponibilidad-y-cotizacion','disponibilidad-y-tecnico','customer-question'].includes(q.topic)&&(q.topic!=='customer-question'||quotationInquiry(store.open(q.body).conditions?.question||'')));if(pending)return pending;
 }
 return rows.find(q=>q.topic===topic)||null;
}

// Scoped continuity applies to the customer's actual source, not merely the
// blue group sender. An old or shared/red case never becomes a new blue case.
export function tesaOperationalScopeSafe(store,config,{phone,line,source,senderLine,created}={}){
 const scope=assertOperationalLineScope(config);if(!scope)return true;
 const cutoff=Date.parse(scope.authorizedAt);
 if(!operationalLineAllowed(config,line)||!operationalLineAllowed(config,senderLine)||
   !Number.isFinite(created)||created<cutoff||typeof store.hasSourcesOutsideLine!=='function'||
   store.hasSourcesOutsideLine(phone,line))return false;
 const row=store.db.prepare('SELECT * FROM events WHERE id=? AND phone=? AND from_me=0').get(source,phone);
 return Boolean(row&&row.line===line&&row.at>=cutoff);
}

export function tesaOutboxScopeSafe(store,config,row){
 if(!assertOperationalLineScope(config))return true;
 const question=store.db.prepare('SELECT * FROM tesa_questions WHERE id=? AND company=?').get(row?.question_id,store.company);
 if(!question||question.source_line!==row.source_line||question.sender_line!==row.sender_line||question.customer_phone!==row.customer_phone||question.case_id!==row.case_id)return false;
 const body=store.open(question.body);
 return tesaOperationalScopeSafe(store,config,{phone:row.customer_phone,line:row.source_line,source:body.source,senderLine:row.sender_line,created:row.created});
}

export function initializeTesaStore(store){
 if(!BUSINESSES[store.company]||typeof store.seal!=='function'||typeof store.open!=='function')throw Error('TESA_OWN_STORE_REQUIRED');
 store.db.exec(`
 CREATE TABLE IF NOT EXISTS tesa_events(id TEXT PRIMARY KEY,company TEXT NOT NULL,mid TEXT NOT NULL,group_jid TEXT NOT NULL,participant_key TEXT NOT NULL,at INTEGER NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL,UNIQUE(company,group_jid,mid,participant_key));
 CREATE TABLE IF NOT EXISTS tesa_event_sources(event_id TEXT NOT NULL,receiving_line TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(event_id,receiving_line),FOREIGN KEY(event_id) REFERENCES tesa_events(id));
 CREATE TABLE IF NOT EXISTS tesa_questions(id TEXT PRIMARY KEY,company TEXT NOT NULL,case_id TEXT NOT NULL,customer_phone TEXT NOT NULL,topic TEXT NOT NULL,conditions_hash TEXT NOT NULL,group_jid TEXT NOT NULL,source_line TEXT NOT NULL,sender_line TEXT NOT NULL,body TEXT NOT NULL,answer TEXT,source_id TEXT,answer_at INTEGER,valid_until INTEGER,state TEXT NOT NULL DEFAULT 'PENDING',outbox_id TEXT UNIQUE NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS tesa_question_once ON tesa_questions(company,case_id,customer_phone,topic,conditions_hash);
 CREATE TABLE IF NOT EXISTS tesa_outbox(id TEXT PRIMARY KEY,question_id TEXT NOT NULL UNIQUE,company TEXT NOT NULL,customer_phone TEXT NOT NULL,case_id TEXT NOT NULL,group_jid TEXT NOT NULL,source_line TEXT NOT NULL,sender_line TEXT NOT NULL,body TEXT NOT NULL,text_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'READY',mid TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,native_proof TEXT,FOREIGN KEY(question_id) REFERENCES tesa_questions(id));
 CREATE UNIQUE INDEX IF NOT EXISTS tesa_native_question_mid ON tesa_outbox(company,group_jid,sender_line,mid) WHERE mid IS NOT NULL;
 `);return {guard:TESA_OPERATIONS_GUARD};
}

export function observeTesaGroupEvent(store,config,event){
 scoped(store,config);initializeTesaStore(store);
 const e=validateTesaGroupEvent(event,config,Date.now());if(!e||e.groupJid!==TESA_GROUP_JID)return {observed:false,state:'IGNORED_GROUP_SCOPE'};
 return atomic(store,()=>{
  const id=eventKey(e),old=store.db.prepare('SELECT * FROM tesa_events WHERE id=?').get(id),body=stableEvent(e);
  if(old&&JSON.stringify(store.open(old.body))!==JSON.stringify(body)){
   store.audit('TESA_NATIVE_SOURCE_CONFLICT_REVIEW',e.id,{sourceKey:id,prior:store.open(old.body),additional:e});
   store.db.prepare("UPDATE tesa_events SET state='OBSERVATION_CONFLICT_REVIEW' WHERE id=?").run(id);
   store.db.prepare("UPDATE tesa_questions SET state='ANSWER_REVIEW' WHERE company=? AND source_id=? AND state='ANSWERED'").run(store.company,e.id);
   return {observed:true,id,state:'OBSERVATION_CONFLICT_REVIEW',duplicate:true,event:e};
  }
  const state=e.fromMe||ownBots.includes(e.participant?.phone)?'OBSERVED_OWN_BOT':e.forwarded?'OBSERVED_FORWARDED':!e.participant?.phone?'OBSERVED_IDENTITY_REVIEW':'OBSERVED';
  if(!old)store.db.prepare('INSERT INTO tesa_events VALUES(?,?,?,?,?,?,?,?)').run(id,store.company,e.id,e.groupJid,e.participant?.phone||e.participant?.jid||'unknown',e.at,store.seal(body),state);
  store.db.prepare('INSERT OR IGNORE INTO tesa_event_sources VALUES(?,?,?)').run(id,e.receivingLine,store.seal(e));
  return {observed:true,id,state:old?.state||state,duplicate:Boolean(old),event:e};
 });
}

export function prepareTesaQuestion(store,config,request){
 scoped(store,config);initializeTesaStore(store);const now=Date.now(),t=freshMembership(config,now);
 if(!t)return {id:null,state:'TESA_DISABLED_OR_MEMBERSHIP_PENDING',created:false,valid:false};
 const {phone,line,caseId,topic,conditions={},source,text}=request||{};
 if(!/^57\d{10}$/.test(phone||'')||typeof caseId!=='string'||!caseId||caseId.length>160||typeof topic!=='string'||!BUSINESSES[store.company].phones.includes(line))throw Error('TESA_CASE_SCOPE_REQUIRED');
 return atomic(store,()=>{
  // Existing private questions retain their destinations, sources and delivery.
  const prior=pendingPrivateQuestion(store,{phone,caseId,topic,conditions});
  if(prior)return {...stateResult(prior,false,store),valid:false,privateQuestionPreserved:true};
  if(!tesaOperationalScopeSafe(store,config,{phone,line,source,senderLine:t.senderLine,created:now})){
   store.audit('TESA_OPERATIONAL_SCOPE_QUESTION_REVIEW',source,{caseId,topic,sourceLine:line,coverage:operationalCoverage(config),outboundCreated:false,migrated:false});
   return {id:null,state:'TESA_OPERATIONAL_SCOPE_REVIEW',created:false,valid:false};
  }
  const recipients=questionRecipients(config,topic,conditions);
  if(!recipients.some(p=>p!==SANDRA)||forbidden(topic)||forbidden(JSON.stringify(conditions)))return {id:null,state:'TESA_DIRECTION_REVIEW_REQUIRED',created:false,valid:false};
  const sourceRow=store.db.prepare('SELECT * FROM events WHERE id=? AND phone=? AND from_me=0').get(source,phone);
  const sourceLine=sourceRow&&(sourceRow.line===line||store.db.prepare('SELECT 1 FROM event_sources WHERE event_id=? AND line=?').get(source,line));
  if(!sourceRow||!sourceLine||sourceRow.at<t.activatedAt||sourceRow.at<now-freshSourceMs||sourceRow.at>now+60000)return {id:null,state:'TESA_FRESH_CUSTOMER_SOURCE_REQUIRED',created:false,valid:false};
  if(!questionBodySafe(text)){
   // Keep the customer's reception committed; record the review without
   // copying the rejected address, phone or other protected body into audit.
   store.audit('TESA_QUESTION_MINIMIZATION_REVIEW',source,{caseId,topic,sourceLine:line,groupJid:t.groupJid,reason:'UNSAFE_GROUP_QUESTION',textHash:typeof text==='string'?sha(text):null,outboundCreated:false});
   return {id:null,state:'TESA_MINIMIZATION_REVIEW_REQUIRED',created:false,valid:false,answer:null,sourceId:null};
  }
  const hash=sha(JSON.stringify(canonical(conditions))),old=store.db.prepare("SELECT * FROM tesa_questions WHERE company=? AND case_id=? AND customer_phone=? AND topic=? AND (state IN ('PENDING','ANSWER_REVIEW') OR conditions_hash=?) ORDER BY rowid LIMIT 1").get(store.company,caseId,phone,topic,hash);
  if(old)return stateResult(old,false,store);
  const id=sha(JSON.stringify([store.company,caseId,phone,topic,hash])),outboxId='tesa-question:'+id,body={text,conditions,source,caseId,customerPhone:phone,sourceLine:line,groupJid:t.groupJid,senderLine:t.senderLine};
  store.db.prepare('INSERT INTO tesa_questions(id,company,case_id,customer_phone,topic,conditions_hash,group_jid,source_line,sender_line,body,outbox_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,store.company,caseId,phone,topic,hash,t.groupJid,line,t.senderLine,store.seal(body),outboxId);
  store.db.prepare('INSERT INTO tesa_outbox(id,question_id,company,customer_phone,case_id,group_jid,source_line,sender_line,body,text_hash,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(outboxId,id,store.company,phone,caseId,t.groupJid,line,t.senderLine,store.seal(text),sha(text),now,now);
  store.audit('TESA_CASE_QUESTION_PREPARED',source,{id,caseId,topic,groupJid:t.groupJid,sourceLine:line,senderLine:t.senderLine,privatePendingMigrated:false});
  return {id,state:'PENDING',created:true,valid:false,outboxId,answer:null,sourceId:null};
 });
}

export function bindTesaQuestionDelivery(store,config,proof){
 scoped(store,config);initializeTesaStore(store);const t=freshMembership(config);if(!t)throw Error('TESA_CURRENT_MEMBERSHIP_REQUIRED');
 return atomic(store,()=>{
  const row=store.db.prepare('SELECT * FROM tesa_outbox WHERE id=? AND company=?').get(proof?.outboxId,store.company);
  if(!row||!['ACCEPTED','DELIVERED','READ'].includes(row.state)||row.mid!==proof.mid||proof.nativeVerified!==true||!['DELIVERED','READ'].includes(proof.state)||!/^[-A-Za-z0-9_]{8,120}$/.test(proof.mid||'')||proof.groupJid!==row.group_jid||proof.groupJid!==t.groupJid||proof.senderLine!==row.sender_line||proof.senderLine!==t.senderLine||proof.text!==store.open(row.body)||sha(proof.text)!==row.text_hash||!Number.isFinite(proof.at)||proof.at<row.created-1000||proof.at>Date.now()+60000||proof.authorJid&&proof.authorJid!==row.sender_line+'@s.whatsapp.net'||proof.company&&proof.company!==store.company)throw Error('TESA_EXACT_NATIVE_DELIVERY_REQUIRED');
  if(row.mid&&row.mid!==proof.mid)throw Error('TESA_DELIVERY_ID_CONFLICT');
  if(row.state==='READ'&&proof.state==='DELIVERED')return {id:row.id,mid:row.mid,state:'READ',duplicate:true};
  store.db.prepare('UPDATE tesa_outbox SET state=?,mid=?,updated=?,native_proof=? WHERE id=?').run(proof.state,proof.mid,Date.now(),store.seal({...proof,company:store.company}),row.id);
  return {id:row.id,mid:proof.mid,state:proof.state,duplicate:Boolean(row.mid)};
 });
}

export function acceptTesaQuotedAnswer(store,config,event){
 scoped(store,config);initializeTesaStore(store);const now=Date.now(),t=freshMembership(config,now),observed=observeTesaGroupEvent(store,config,event);
 if(!t||!observed.observed)return {accepted:false,state:observed.state||'OBSERVED'};
 const e=observed.event,sourceKey=observed.id;
 return atomic(store,()=>{
  const finish=state=>{store.db.prepare('UPDATE tesa_events SET state=? WHERE id=?').run(state,sourceKey);return {accepted:false,id:sourceKey,state};};
  if(['CASE_ANSWER','ANSWER_REVIEW','OBSERVATION_CONFLICT_REVIEW'].includes(observed.state))return {accepted:false,id:sourceKey,state:observed.state,duplicate:true};
  const scope=assertOperationalLineScope(config);if(scope&&e.at<Date.parse(scope.authorizedAt))return finish('OBSERVED_OPERATIONAL_SCOPE_REVIEW');
  const phone=e.participant?.phone,human=t.allowedParticipantPhones.includes(phone)&&t.verifiedMembership.participantPhones.includes(phone)&&!ownBots.includes(phone);
  if(!human||e.fromMe||e.forwarded||e.kind!=='text'||e.media||!e.text.trim()||e.at<t.activatedAt||e.at<now-freshSourceMs||e.at>now+60000)return finish('OBSERVED');
  const quote=e.quote;if(!quote?.mid||quote.groupJid!==t.groupJid||quote.participantJid!==t.senderLine+'@s.whatsapp.net'||e.receivingLine!==t.senderLine)return finish('OBSERVED_UNSCOPED_QUOTE');
  const q=store.db.prepare("SELECT q.*,o.state delivery,o.mid,o.native_proof,o.created outbox_created FROM tesa_questions q JOIN tesa_outbox o ON o.id=q.outbox_id WHERE q.company=? AND q.group_jid=? AND q.sender_line=? AND o.mid=? AND o.state IN ('DELIVERED','READ') AND q.state IN ('PENDING','ANSWERED','ANSWER_REVIEW')").get(store.company,t.groupJid,e.receivingLine,quote.mid);
  if(!q||!q.native_proof||e.caseId&&e.caseId!==q.case_id||e.customerPhone&&e.customerPhone!==q.customer_phone)return finish('OBSERVED_UNSCOPED_QUOTE');
  if(!tesaOperationalScopeSafe(store,config,{phone:q.customer_phone,line:q.source_line,source:store.open(q.body).source,senderLine:q.sender_line,created:q.outbox_created}))return finish('OBSERVED_OPERATIONAL_SCOPE_REVIEW');
  const nativeProof=store.open(q.native_proof);if(!nativeProof.nativeVerified||nativeProof.mid!==quote.mid)return finish('OBSERVED_UNSCOPED_QUOTE');
  if(forbidden(e.text))return finish('OBSERVED_DIRECTION_REVIEW');
  if(q.state!=='PENDING'){
   store.audit('TESA_CASE_ADDITIONAL_SOURCE_REVIEW',e.id,{question:q.id,caseId:q.case_id,sourceKey,participant:phone,text:e.text,priorSource:q.source_id,groupJid:t.groupJid});
   store.db.prepare("UPDATE tesa_questions SET state='ANSWER_REVIEW' WHERE id=?").run(q.id);return finish('ANSWER_REVIEW');
  }
  const clarity=/^(?:si|no|ok|listo|vale|perfecto|gracias)[.! ]*$/.test(normalize(e.text));
  const answer={text:e.text,participant:{...e.participant},sourceId:e.id,sourceKey,groupJid:e.groupJid,receivingLine:e.receivingLine,questionMid:quote.mid,caseId:q.case_id,customerPhone:q.customer_phone,at:e.at,membershipProof:{verifiedAt:t.verifiedMembership.verifiedAt,sourceHash:t.verifiedMembership.sourceHash,owner:t.verifiedMembership.owner},scope:'same-company-and-case-only; recheck before scheduling'};
  store.db.prepare('UPDATE tesa_questions SET answer=?,source_id=?,answer_at=?,valid_until=?,state=? WHERE id=? AND state=?').run(store.seal(answer),e.id,e.at,clarity?null:e.at+answerValidityMs,clarity?'ANSWER_REVIEW':'ANSWERED',q.id,'PENDING');
  store.audit(clarity?'TESA_CASE_ANSWER_CLARITY_PENDING':'TESA_CASE_ANSWER_LEARNED',e.id,{question:q.id,caseId:q.case_id,participant:phone,sourceKey,groupJid:t.groupJid,businessExecuted:false});
  store.db.prepare('UPDATE tesa_events SET state=? WHERE id=?').run(clarity?'ANSWER_REVIEW':'CASE_ANSWER',sourceKey);
  return {accepted:!clarity,id:sourceKey,questionId:q.id,state:clarity?'ANSWER_REVIEW':'CASE_ANSWER',caseId:q.case_id,customerPhone:q.customer_phone,businessExecuted:false,acknowledgementQueued:false};
 });
}

export function tesaCaseAnswers(store,config,{caseId,customerPhone}){
 scoped(store,config);initializeTesaStore(store);if(!freshMembership(config))return [];
 return store.db.prepare("SELECT q.*,o.created outbox_created FROM tesa_questions q JOIN tesa_outbox o ON o.id=q.outbox_id WHERE q.company=? AND q.case_id=? AND q.customer_phone=? AND q.state='ANSWERED' AND q.valid_until>? ORDER BY q.answer_at").all(store.company,caseId,customerPhone,Date.now()).filter(q=>tesaOperationalScopeSafe(store,config,{phone:q.customer_phone,line:q.source_line,source:store.open(q.body).source,senderLine:q.sender_line,created:q.outbox_created})).map(q=>{const body=store.open(q.body),answer=store.open(q.answer);return {question:body.text,answer:answer.text,source:q.source_id,at:q.answer_at,validUntil:q.valid_until,scope:'same-company-and-case-only; recheck before scheduling',groupJid:q.group_jid,sourceLine:q.source_line,senderLine:q.sender_line,participant:answer.participant,questionMid:answer.questionMid};});
}

export function tesaStatus(store,config){scoped(store,config);initializeTesaStore(store);const t=freshMembership(config);return {guard:TESA_OPERATIONS_GUARD,enabled:Boolean(t),groupJid:t?.groupJid||null,senderLine:t?.senderLine||null,events:store.db.prepare('SELECT state,COUNT(*) n FROM tesa_events GROUP BY state').all(),questions:store.db.prepare('SELECT state,COUNT(*) n FROM tesa_questions GROUP BY state').all(),outbox:store.db.prepare('SELECT state,COUNT(*) n FROM tesa_outbox GROUP BY state').all(),businessWritesEnabled:false,humanHoldsModified:false};}

export function reviewTesaSources(store,{ids,afterCursor,limit}={}){
 initializeTesaStore(store);let rows;
 if(Array.isArray(ids)&&ids.length>=1&&ids.length<=50&&ids.every(id=>typeof id==='string'))rows=store.db.prepare('SELECT rowid cursor,* FROM tesa_events WHERE id IN ('+ids.map(()=>'?').join(',')+') OR mid IN ('+ids.map(()=>'?').join(',')+') ORDER BY rowid').all(...ids,...ids);
 else if(Number.isInteger(afterCursor)&&afterCursor>=0&&Number.isInteger(limit)&&limit>=1&&limit<=50)rows=store.db.prepare('SELECT rowid cursor,* FROM tesa_events WHERE rowid>? ORDER BY rowid LIMIT ?').all(afterCursor,limit);
 else throw Error('TESA_EXPLICIT_SOURCE_SELECTION_REQUIRED');
 return {company:store.company,readOnly:true,results:rows.map(row=>({id:row.id,mid:row.mid,state:row.state,cursor:row.cursor,event:store.open(row.body),sources:store.db.prepare('SELECT body FROM tesa_event_sources WHERE event_id=?').all(row.id).map(s=>store.open(s.body))})),sends:0};
}
