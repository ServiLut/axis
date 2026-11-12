import {createHash} from 'node:crypto';
import {MARIA_TENANT,MARIA_COMPANY} from './maria-program.mjs';
import {FUMIGACION_BLUE,FUMIGACION_RED} from './line-scope.mjs';
import {knownInternalRecipient} from './config.mjs';

export const MARIA_COLLECTIONS_CONTEXT_GUARD='own-obligation-collection-reply-context-v1';
const COLLECTOR_GUARD='own-finite-reviewed-obligation-reminder-v1';
const PN=/^57\d{10}$/,ID=/^[A-Za-z0-9:_-]{1,160}$/,MID=/^[A-Za-z0-9_-]{8,100}$/,HASH=/^[a-f0-9]{64}$/;
const LINES=[FUMIGACION_BLUE,FUMIGACION_RED];
const scope=['fumigacion',MARIA_TENANT,MARIA_COMPANY];
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const fail=reason=>{throw Error('COLLECTION_CONTEXT_'+reason)};
const same=(a,b)=>digest(a)===digest(b);
const obligationKey=id=>'collector-obligation:'+digest([...scope,id])+':v1';
const fields='guard,groupKey,attemptId,outboxId,phone,line,obligationKeys,orderIds,textHash,text,attemptAt,manifestHash';
const exact=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.split(',').sort().join(',');
const receipt=v=>({contextId:v.contextId,groupKey:v.groupKey,attemptId:v.attemptId,outboxId:v.outboxId,phone:v.phone,line:v.line,textHash:v.textHash,obligationKeys:[...v.obligationKeys],orderIds:[...v.orderIds]});
const disabled=()=>({consumed:false,reason:'COLLECTION_CONTEXT_DISABLED'});
const normalize=text=>text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const instances=new WeakMap();
export const isMariaCollectionsContext=(value,store)=>instances.get(value)===store&&value.enabled===true;

function replyKind(e){
 const text=normalize(e.text);
 if(e.forwarded||!['text','audio','image','document','video','call'].includes(e.kind))return 'SOURCE_REVIEW';
 if(['audio','image','document','video'].includes(e.kind))return 'PAYMENT_EVIDENCE_UNREAD';
 if(/\b(?:ya|si|yo|le|les|lo)\s+(?:pague|pagamos|cancele|cancelamos|consigne|transferi|abone)|\bpago (?:realizado|hecho)|\b(?:entregue|di)\b.{0,35}\b(?:efectivo|dinero|tecnico)\b/.test(text))return 'PAYMENT_REPORTED';
 if(/\b(?:no debo|no corresponde|no reconozco|desacuerdo|reclamo|equivocad\w*|ya habiamos|cobro indebido)\b/.test(text))return 'DISPUTE';
 if(/\b(?:no me (?:escriban|contacten)|dejen de|no contactar|no escribir)\b/.test(text))return 'CONTACT_DECLINED';
 if(/\b(?:cuanto|cual es el (?:saldo|valor)|que debo|de cuanto|valor|saldo|cuenta|donde pago|como pago)\b/.test(text))return 'AMOUNT_OR_PAYMENT_QUESTION';
 if(/\b(?:pagare|pago (?:el|la|manana|hoy|luego|despues)|puedo pagar|plazo|quincena|otro dia|prometo)\b/.test(text))return 'PAYMENT_PROMISE_OR_DEFERRAL';
 if(/^(?:ok(?:ay)?|listo|si|dale|bueno|de acuerdo|gracias|perfecto|ok listo)[\s.,!¡]*$/.test(text.trim()))return 'ACKNOWLEDGEMENT';
 return 'UNCLASSIFIED_COLLECTION_REVIEW';
}

/**
 * Isolated OFF-by-default adapter; it never sends, changes a payment/order, or
 * changes conversations, event states, holds, questions or ordinary acceptance.
 *
 * Host integration (same existing Store/connection, never another live Store):
 * 1. Inside the collector reservation Store.tx, registerAttempt and assertAttempt
 *    synchronously BEFORE changing COLLECTOR_STAGED to SENDING. Roll back all
 *    claims/context/outbox changes together on any error; no await in that tx.
 * 2. In the receipt transaction, persist exact outbox ACCEPTED+MID, then attachMid.
 *    ACCEPTED is association only, never native delivery or payment proof.
 * 3. For authenticated, validateEvent-normalized, durably enqueued incoming
 *    customer events, inspectIncoming BEFORE ordinary quote/intake/acceptance
 *    and before discarding held/superseded turns. Keep staff/internal gates.
 *    If consumed, finish the event in a dedicated review state and notify the
 *    existing human-review route once. Do not call continuingQuote or register
 *    an order, send a reply, release a hold, or acknowledge a payment.
 * 4. Consult hasReviewBlock in collector attention checks. A reply creates a
 *    durable block only; this module has no automatic/manual release API. A
 *    separately reviewed resolution must preserve this history.
 *
 * PN authority belongs to authenticated ingress/native identity validation.
 * No LID, quoted text, name, phone typed in a message or same-topic inference
 * resolves identity here. A persisted canonical PN responding on the other own
 * line is conservatively consumed without linking its reply to an obligation
 * or matching that other line's MID. Both source/origin lines stay literal.
 * Ambiguous
 * obligations, changed attention, old cited MIDs and unknown receipts go to
 * review, not an inferred balance/acceptance. Unquoted active contexts have no
 * silent TTL: even explicit new-service text is conservatively held for human
 * separation. No claim of full WhatsApp history or delivery is made.
 */
export function createMariaCollectionsContext({store,enabled=false,now=Date.now,internalRecipients=[]}={}){
 if(store?.company!=='fumigacion'||typeof store.seal!=='function'||typeof store.open!=='function'||typeof store.tx!=='function')fail('OWN_STORE_REQUIRED');
 if(typeof enabled!=='boolean'||typeof now!=='function'||!Array.isArray(internalRecipients)||internalRecipients.some(p=>!PN.test(p)))fail('CONFIG_REQUIRED');
 const isCustomer=p=>PN.test(p??'')&&!LINES.includes(p)&&!knownInternalRecipient(p)&&!internalRecipients.includes(p);
 const clock=()=>{const at=now();if(!Number.isSafeInteger(at)||at<0)fail('TIME_REQUIRED');return at};
 const active=()=>{if(!enabled)fail('DISABLED')};
 const inTransaction=()=>{active();if(store.db.isTransaction!==true)fail('RESERVATION_TRANSACTION_REQUIRED')};
 if(enabled)store.db.exec(`CREATE TABLE IF NOT EXISTS maria_collection_contexts(context_id TEXT PRIMARY KEY,group_key TEXT NOT NULL UNIQUE,outbox_id TEXT NOT NULL UNIQUE,attempt_id TEXT NOT NULL,phone TEXT NOT NULL,line TEXT NOT NULL,attempt_at INTEGER NOT NULL,mid TEXT,review_required INTEGER NOT NULL DEFAULT 0,body TEXT NOT NULL,FOREIGN KEY(outbox_id) REFERENCES outbox(id));
 CREATE UNIQUE INDEX IF NOT EXISTS maria_collection_context_mid ON maria_collection_contexts(line,mid) WHERE mid IS NOT NULL;
 CREATE TABLE IF NOT EXISTS maria_collection_context_obligations(context_id TEXT NOT NULL,obligation_key TEXT NOT NULL UNIQUE,PRIMARY KEY(context_id,obligation_key),FOREIGN KEY(context_id) REFERENCES maria_collection_contexts(context_id));
 CREATE TABLE IF NOT EXISTS maria_collection_replies(source_id TEXT NOT NULL,line TEXT NOT NULL,phone TEXT NOT NULL,source_hash TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(source_id,line),FOREIGN KEY(source_id) REFERENCES events(id));`);
 const load=row=>{
  if(!row)return null;const v=store.open(row.body);
  if(v?.contextGuard!==MARIA_COLLECTIONS_CONTEXT_GUARD||row.context_id!==v.contextId||row.group_key!==v.groupKey||row.outbox_id!==v.outboxId||row.attempt_id!==v.attemptId||row.phone!==v.phone||row.line!==v.line||row.attempt_at!==v.attemptAt)fail('DURABLE_ASSOCIATION_CHANGED');
  const keys=store.db.prepare('SELECT obligation_key FROM maria_collection_context_obligations WHERE context_id=? ORDER BY obligation_key').all(v.contextId).map(r=>r.obligation_key);
  if(!same(keys,[...v.obligationKeys].sort()))fail('DURABLE_OBLIGATIONS_CHANGED');
  return {...row,value:v};
 };
 const get=id=>load(store.db.prepare('SELECT * FROM maria_collection_contexts WHERE context_id=?').get(id));
 const input=value=>{
  if(!exact(value,fields)||value.guard!==COLLECTOR_GUARD||!ID.test(value.attemptId??'')||!isCustomer(value.phone)||!LINES.includes(value.line)||value.groupKey!==value.outboxId||!HASH.test(value.textHash??'')||!HASH.test(value.manifestHash??'')||typeof value.text!=='string'||!value.text.trim()||value.text.length>1200||digest(value.text)!==value.textHash||!Number.isSafeInteger(value.attemptAt)||value.attemptAt<0||value.attemptAt>clock())fail('ATTEMPT_BINDING_REQUIRED');
  const orders=value.orderIds,keys=value.obligationKeys;
  if(!Array.isArray(orders)||orders.length<1||orders.length>25||orders.some(id=>!ID.test(id))||new Set(orders).size!==orders.length||!Array.isArray(keys)||keys.length!==orders.length||new Set(keys).size!==keys.length)fail('OBLIGATIONS_REQUIRED');
  const sorted=[...orders].sort((a,b)=>a.localeCompare(b));
  if(!same(orders,sorted)||!same(keys,sorted.map(obligationKey))||value.groupKey!=='collector-group:'+digest([...scope,value.phone,value.line,keys])+':v1')fail('OBLIGATIONS_SCOPE_REQUIRED');
  return {...structuredClone(value),contextGuard:MARIA_COLLECTIONS_CONTEXT_GUARD,contextId:'collection-context:'+digest([MARIA_COLLECTIONS_CONTEXT_GUARD,value.groupKey,value.attemptId])+':v1'};
 };
 const verifyOutbox=(v,states,mid=null)=>{
  const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(v.outboxId);
  if(!row||!states.includes(row.state)||row.phone!==v.phone||row.line!==v.line||row.internal!==0||row.mid!==mid||store.open(row.body)!==v.text)fail('OUTBOX_ASSOCIATION_REQUIRED');
  return row;
 };
 function hasReviewBlock({phone,line,obligationKeys=[]}={}){
  if(!enabled)return false;
  if(!isCustomer(phone)||!LINES.includes(line)||!Array.isArray(obligationKeys))fail('LOOKUP_SCOPE_REQUIRED');
  if(store.db.prepare('SELECT 1 FROM maria_collection_replies WHERE phone=? LIMIT 1').get(phone))return true;
  return obligationKeys.some(key=>store.db.prepare('SELECT 1 FROM maria_collection_context_obligations o JOIN maria_collection_contexts c USING(context_id) WHERE o.obligation_key=? AND c.review_required=1').get(key));
 }
 function registerAttempt(value){
  inTransaction();const v=input(value),row=verifyOutbox(v,['COLLECTOR_STAGED']);
  const old=get(v.contextId);
  if(old){if(!same(old.value,{...v,attention:old.value.attention}))fail('ATTEMPT_CHANGED');return receipt(v)}
  if(hasReviewBlock(v))fail('REVIEW_BLOCK_PRESERVED');
  const conv=store.conversation(v.phone),s=conv?.state;
  if(!conv||conv.hold!==0||conv.line!==v.line||row.revision!==conv.revision||row.case_id!==(s?.caseId??null)||['humanHold','awaitingHumanReview','doNotContact','optOutGlobal','contactDeclined','closed'].some(k=>s?.[k]!==undefined&&s[k]!==false))fail('ATTENTION_CHANGED');
  v.attention={revision:conv.revision,caseId:s?.caseId??null,at:conv.at};
  store.db.prepare('INSERT INTO maria_collection_contexts(context_id,group_key,outbox_id,attempt_id,phone,line,attempt_at,body) VALUES(?,?,?,?,?,?,?,?)').run(v.contextId,v.groupKey,v.outboxId,v.attemptId,v.phone,v.line,v.attemptAt,store.seal(v));
  const insert=store.db.prepare('INSERT INTO maria_collection_context_obligations(context_id,obligation_key) VALUES(?,?)');for(const key of v.obligationKeys)insert.run(v.contextId,key);
  return receipt(v);
 }
 function assertAttempt(value){
  inTransaction();if(!exact(value,fields+',contextId'))fail('ATTEMPT_BINDING_REQUIRED');
  const {contextId,...raw}=value,v=input(raw),row=get(contextId);
  if(!row||contextId!==v.contextId||!same(row.value,{...v,attention:row.value.attention})||row.mid!==null||row.review_required!==0)fail('ATTEMPT_NOT_DURABLE');
  verifyOutbox(v,['COLLECTOR_STAGED']);return receipt(v);
 }
 function attachMid({contextId,attemptId,outboxId,mid}={}){
  inTransaction();if(!MID.test(mid??''))fail('NATIVE_MID_REQUIRED');const row=get(contextId),v=row?.value;
  if(!v||v.attemptId!==attemptId||v.outboxId!==outboxId||row.mid!==null&&row.mid!==mid)fail('MID_ASSOCIATION_REQUIRED');
  verifyOutbox(v,['ACCEPTED','DELIVERED','READ'],mid);
  if(store.db.prepare('SELECT 1 FROM outbox WHERE line=? AND mid=? AND id<>?').get(v.line,mid,outboxId))fail('AMBIGUOUS_NATIVE_MID');
  store.db.prepare('UPDATE maria_collection_contexts SET mid=? WHERE context_id=? AND (mid IS NULL OR mid=?)').run(mid,contextId,mid);
  return {...receipt(v),mid,deliveryVerified:false};
 }
 function inspectIncoming(e){
  if(!enabled)return disabled();
  if(!e||!isCustomer(e.phone)||!LINES.includes(e.line)||e.fromMe!==false||e.group===true||/@(?:g\.us|lid)$/.test(e.jid??'')||!MID.test(e.id??'')||!Number.isSafeInteger(e.at)||e.at>clock()+60000||typeof e.text!=='string'||e.text.length>6000)return {consumed:false,reason:'COLLECTION_CONTEXT_NOT_CUSTOMER_SOURCE'};
  const run=()=>{
   const source=store.db.prepare('SELECT * FROM events WHERE id=?').get(e.id);
   if(!source||source.phone!==e.phone||source.line!==e.line||source.from_me!==0||source.at!==e.at||!same(store.open(source.body),e))fail('PERSISTED_CUSTOMER_SOURCE_REQUIRED');
   if(store.db.prepare('SELECT 1 FROM event_sources WHERE event_id=? AND line<>?').get(e.id,e.line))fail('AMBIGUOUS_SOURCE_LINE');
   const previous=store.db.prepare('SELECT * FROM maria_collection_replies WHERE source_id=? AND line=?').get(e.id,e.line),sourceHash=digest(e);
   if(previous){if(previous.phone!==e.phone||previous.source_hash!==sourceHash)fail('SOURCE_CHANGED');return {...store.open(previous.body),duplicate:true}}
   const sameLine=store.db.prepare('SELECT * FROM maria_collection_contexts WHERE phone=? AND line=? AND attempt_at<=? ORDER BY attempt_at,context_id').all(e.phone,e.line,e.at+999).map(load);
   const crossLine=sameLine.length===0;
   const all=crossLine?store.db.prepare('SELECT * FROM maria_collection_contexts WHERE phone=? AND line<>? AND line IN (?,?) AND attempt_at<=? ORDER BY attempt_at,context_id').all(e.phone,e.line,...LINES,e.at+999).map(load):sameLine;
   if(!all.length)return {consumed:false,reason:'COLLECTION_CONTEXT_NO_ASSOCIATION'};
   // Exact citations are authoritative only together with this PN/line and own
   // outbox; quoted text never selects or manufactures an obligation.
   const cited=!crossLine&&e.quotedId&&all.filter(r=>r.mid===e.quotedId);
   let chosen,correlation;
   if(cited?.length===1){verifyOutbox(cited[0].value,['ACCEPTED','DELIVERED','READ'],cited[0].mid);chosen=cited;correlation='EXACT_OWN_COLLECTION_MID'}
   else {
    chosen=all.filter(r=>{const o=store.db.prepare('SELECT state FROM outbox WHERE id=?').get(r.outbox_id);return ['SENDING','UNCERTAIN','ACCEPTED','DELIVERED','READ'].includes(o?.state)});
    if(!chosen.length)return {consumed:false,reason:'COLLECTION_CONTEXT_NO_ATTEMPT_ASSOCIATION'};
    for(const row of chosen)verifyOutbox(row.value,['SENDING','UNCERTAIN','ACCEPTED','DELIVERED','READ'],row.mid);
    correlation=crossLine?'CROSS_LINE_UNCONFIRMED_COLLECTION_CONTEXT':e.quotedId?'OTHER_CITATION_REQUIRES_SEPARATION':chosen.length===1&&chosen[0].mid?'UNIQUE_OWN_COLLECTION_CONTEXT':'AMBIGUOUS_OR_UNCONFIRMED_COLLECTION_CONTEXT';
   }
   const conv=store.conversation(e.phone),attentionChanged=chosen.some(r=>r.value.attention.caseId!==(conv?.state?.caseId??null));
   const held=conv?.hold!==0||['humanHold','awaitingHumanReview','doNotContact','optOutGlobal','contactDeclined','closed'].some(k=>conv?.state?.[k]===true);
   const result={guard:MARIA_COLLECTIONS_CONTEXT_GUARD,consumed:true,requiresHumanReview:true,blockFurtherCollection:true,sourceId:e.id,phone:e.phone,line:e.line,contextIds:chosen.map(r=>r.context_id),obligationKeys:crossLine?[]:[...new Set(chosen.flatMap(r=>r.value.obligationKeys))],orderIds:crossLine?[]:[...new Set(chosen.flatMap(r=>r.value.orderIds))],...(crossLine?{contextOriginLines:[...new Set(chosen.map(r=>r.line))],obligationAssociationVerified:false,quotedCollectionMidVerified:false}:{}),correlation,replyKind:replyKind(e),attentionChanged,humanAttentionPreserved:held,sourceForwarded:e.forwarded===true,quotedId:e.quotedId??null,automaticReplyPermitted:false,quoteAcceptancePermitted:false,orderRegistrationPermitted:false,paymentVerified:false,deliveryVerified:false};
   for(const row of chosen)store.db.prepare('UPDATE maria_collection_contexts SET review_required=1 WHERE context_id=?').run(row.context_id);
   store.db.prepare('INSERT INTO maria_collection_replies(source_id,line,phone,source_hash,body) VALUES(?,?,?,?,?)').run(e.id,e.line,e.phone,sourceHash,store.seal(result));
   return result;
  };
  return store.db.isTransaction?run():store.tx(run);
 }
 const adapter=Object.freeze({store,enabled,guard:MARIA_COLLECTIONS_CONTEXT_GUARD,registerAttempt,assertAttempt,attachMid,inspectIncoming,hasReviewBlock});
 instances.set(adapter,store);return adapter;
}
