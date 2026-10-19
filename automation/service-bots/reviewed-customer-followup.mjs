import {createHash} from 'node:crypto';
import {knownInternalRecipient,normalize,publicTextSafe} from './config.mjs';
import {FUMIGACION_BLUE,operationalLineAllowed} from './line-scope.mjs';
import {MARIA_COMPANY,MARIA_TENANT} from './maria-program.mjs';
import {literalCommercialRefusal} from './commercial-objections.mjs';
import {priorAttentionRelease,nativeSourceBeforeRelease} from './explicit-return-attention.mjs';
import {readOwnRetentionProgramContactHistory} from './retention-eligibility.mjs';

export const REVIEWED_CUSTOMER_FOLLOWUP_GUARD='own-blue-current-authorized-reviewed-customer-followup-v1';
export const REVIEWED_CUSTOMER_FOLLOWUP_STAGED='FOLLOWUP_STAGED';
export const REVIEWED_CUSTOMER_FOLLOWUP_FRESHNESS_MS=120000;
const PN=/^57\d{10}$/,ID=/^[A-Za-z0-9:_-]{1,160}$/,SOURCE=/^[A-Za-z0-9_-]{8,100}$/,HASH=/^[a-f0-9]{64}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
const canonical=v=>Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
const fail=reason=>{throw Error(reason);};
const reasonOf=e=>/^FOLLOWUP_[A-Z0-9_]+$/.test(e?.message??'')?e.message:'FOLLOWUP_READ_UNVERIFIED';
const fresh=(at,now)=>Number.isSafeInteger(at)&&at<=now&&now-at<=REVIEWED_CUSTOMER_FOLLOWUP_FRESHNESS_MS;
const unknownLocal=()=>({found:false,hold:null,revision:null,caseId:null,doNotContact:null,optOutGlobal:null,humanHold:null,awaitingHumanReview:null,contactDeclined:null,closed:null});
const sourceText=r=>{const m=r.message?.ephemeralMessage?.message??r.message??{};return m.conversation??m.extendedTextMessage?.text;};
const sourceAt=r=>Number(typeof r.messageTimestamp==='object'?r.messageTimestamp.low:r.messageTimestamp)*1000;
const contextOf=r=>{const m=r.message?.ephemeralMessage?.message??r.message??{};return m.extendedTextMessage?.contextInfo??r.contextInfo??{};};

/** Immutable content hash; delivery acknowledgements alone do not change it. */
export function reviewedFollowupNativeSourceHash(record){
  if(!object(record)||!object(record.key))fail('FOLLOWUP_NATIVE_SOURCE_REQUIRED');
  return hash({key:record.key,at:sourceAt(record),message:record.message??null,messageType:record.messageType??null});
}
export function reviewedCustomerFollowupKey(phone,sourceId){
  if(!PN.test(phone??'')||!SOURCE.test(sourceId??''))fail('FOLLOWUP_EXACT_RECIPIENT_SOURCE_REQUIRED');
  // Text, task/date and source hash cannot manufacture a second attempt.
  return 'reviewed-customer-followup:'+hash(['fumigacion',FUMIGACION_BLUE,phone,sourceId])+':v1';
}
export function reviewedFollowupHistoryHash(records){
  return hash(records.map(r=>({id:r.key.id,at:sourceAt(r),fromMe:r.key.fromMe,hash:reviewedFollowupNativeSourceHash(r)})).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id)));
}

function nativeValid(r,phone,{incoming=false,now}={}){
  const key=r?.key,pn=phone+'@s.whatsapp.net',addresses=[key?.remoteJid,key?.remoteJidAlt].filter(v=>v!=null&&v!==''),at=sourceAt(r??{});
  if(!key||!SOURCE.test(key.id??'')||typeof key.fromMe!=='boolean'||incoming&&key.fromMe!==false||!addresses.length||!addresses.includes(pn)||addresses.some(a=>typeof a!=='string'||!/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(a)||a.endsWith('@s.whatsapp.net')&&a!==pn)||!Number.isSafeInteger(at)||at<0||at>now)fail('FOLLOWUP_NATIVE_PN_SOURCE_UNVERIFIED');
  const updates=r.MessageUpdate??[];
  if(!Array.isArray(updates)||[r.status,...updates.map(u=>u.status)].some(s=>['EDITED','DELETED','REVOKED','ERROR','FAILED',0].includes(s))||['isEdited','edited','deleted','isDeleted','revoked','isRevoked'].some(k=>r[k]!=null&&r[k]!==false))fail('FOLLOWUP_NATIVE_SOURCE_CHANGED');
  const m=r.message?.ephemeralMessage?.message??r.message??{},context=contextOf(r);
  if(m.protocolMessage||m.editedMessage||context.isForwarded||context.forwardingScore>0)fail('FOLLOWUP_NATIVE_SOURCE_CHANGED');
  if(m.audioMessage||m.imageMessage||m.videoMessage||m.documentMessage||m.stickerMessage)fail('FOLLOWUP_ORIGINAL_MEDIA_REVIEW_REQUIRED');
  if(typeof sourceText(r)!=='string'||!sourceText(r).trim())fail('FOLLOWUP_NATIVE_CONTENT_UNAVAILABLE');
  return r;
}
function scoped(c,s,t){
  if(c?.company!=='fumigacion'||s?.company!=='fumigacion'||t?.config!==c||!c.lines?.some(l=>l.phone===FUMIGACION_BLUE&&l.instance==='cucaracha-azul')||!operationalLineAllowed(c,FUMIGACION_BLUE)||typeof t.verifyLine!=='function'||typeof t.request!=='function')fail('FOLLOWUP_OWN_BLUE_RUNTIME_REQUIRED');
}
function identity(body){
  if(body.company!=='fumigacion'||body.line!==FUMIGACION_BLUE||!PN.test(body.phone??'')||knownInternalRecipient(body.phone)||!SOURCE.test(body.sourceId??''))fail('FOLLOWUP_EXACT_RECIPIENT_SOURCE_REQUIRED');
  if(!Number.isSafeInteger(body.historyFrom)||body.historyFrom<0)fail('FOLLOWUP_CASE_HISTORY_RANGE_REQUIRED');
  return body;
}
function authorizationValid(value){return exact(value,'auditId,authorizationReference,sourceHash')&&ID.test(value.auditId??'')&&typeof value.authorizationReference==='string'&&value.authorizationReference.trim().length>=8&&value.authorizationReference.length<=500&&HASH.test(value.sourceHash??'');}
function safeText(text){
  return typeof text==='string'&&text.trim()===text&&text.length>=12&&text.length<=600&&publicTextSafe(text)&&!/[\d$€£]|https?:|www\./i.test(text)&&!/[\r\n]{2,}/.test(text)&&!/\b(?:precios?|tarifas?|valor|costos?|descuentos?|garanti\w*|gratis|gratuit\w*|pagos?|abonos?|confirmad\w*|programad\w*|agendad\w*|reservad\w*|asegur\w*|te enviaremos|vamos a enviar|iremos|llegaremos)\b/.test(normalize(text));
}
function futureContactDeferral(record,now){
  const text=normalize(sourceText(record)),at=sourceAt(record);let unresolved=text;
  if(!/\b(?:escrib\w*|contact\w*|llam\w*|retom\w*)\b/.test(text))return false;
  for(const [pattern,delay] of [[/\bpasado manana\b/g,2*86400000],[/\bmanana\b/g,86400000],[/\b(?:proxima|otra) semana\b/g,7*86400000]]){
    if(pattern.test(unresolved)&&at+delay>now)return true;
    unresolved=unresolved.replace(pattern,'');
  }
  for(const value of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)){
    const date=Date.parse(value[0]+'T05:00:00Z');
    if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==value[0]||date>now)return true;
    unresolved=unresolved.replace(value[0],'');
  }
  // Human month/day names, partial dates and conditional contact timing need
  // review. Never guess a year, weekday or whether an ambiguous day has passed.
  if(/\b(?:hoy|ayer|lunes|martes|miercoles|jueves|viernes|sabado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|luego|despues|cuando|hasta|pronto|proxim\w*|mas (?:adelante|tarde)|otro dia|dentro de|a partir de|(?:el|para el)\s+\d{1,2})\b|\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(unresolved))return true;
  return false;
}
function initialize(s){
  s.db.exec(`CREATE TABLE IF NOT EXISTS reviewed_customer_followups(
    followup_key TEXT PRIMARY KEY,phone TEXT NOT NULL,line TEXT NOT NULL,source_id TEXT NOT NULL,
    outbox_id TEXT NOT NULL UNIQUE,state TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS reviewed_followup_fact ON reviewed_customer_followups(phone,line,source_id);
    CREATE TABLE IF NOT EXISTS reviewed_customer_followup_ledger(
      id INTEGER PRIMARY KEY,followup_key TEXT NOT NULL,at INTEGER NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,body TEXT NOT NULL,
      FOREIGN KEY(followup_key) REFERENCES reviewed_customer_followups(followup_key));`);
}
const stored=(s,key)=>{const row=s.db.prepare('SELECT * FROM reviewed_customer_followups WHERE followup_key=?').get(key);return row?{...row,value:s.open(row.body)}:null;};
function record(s,key,state,reason,at,detail={}){
  s.db.prepare('UPDATE reviewed_customer_followups SET state=?,updated=? WHERE followup_key=?').run(state,at,key);
  s.db.prepare('INSERT INTO reviewed_customer_followup_ledger(followup_key,at,state,reason,body) VALUES(?,?,?,?,?)').run(key,at,state,reason,s.seal(detail));
}

/** Uses only the existing separate readonly program access. No setup/grant occurs. */
export async function readReviewedFollowupProgram(config,transport,{phone},now=Date.now()){
  return readOwnRetentionProgramContactHistory(config,transport.fetcher,{phone},now);
}
function programSnapshot(c,data,phone,from,now){
  if(data?.guard!=='own-fumigacion-daily-readonly-program-snapshot-v1'||data.company!=='FUMIGACION'||data.tenantId!==MARIA_TENANT||data.companyId!==MARIA_COMPANY||data.advisorMembershipId!==c.mariaProgram?.actorId||data.readOnly!==true||!fresh(Date.parse(data.checkedAt),now)||data.coverage?.contactSearchComplete!==true||data.coverage.integrityConflicts!==false||!Array.isArray(data.searchedContacts)||data.searchedContacts.length!==1||!Array.isArray(data.orders))fail('FOLLOWUP_FRESH_PROGRAM_SCOPE_REQUIRED');
  const contact=data.searchedContacts[0];
  if(contact.phone!==phone||contact.complete!==true||contact.identityAmbiguous!==false||!Array.isArray(contact.clientIds)||contact.clientIds.length>1||new Set(contact.clientIds).size!==contact.clientIds.length||!Array.isArray(contact.orderIds)||new Set(contact.orderIds).size!==contact.orderIds.length||contact.orderIds.some(id=>!ID.test(id??'')))fail('FOLLOWUP_PROGRAM_IDENTITY_UNVERIFIED');
  if(data.orders.length!==contact.orderIds.length||data.orders.some(o=>!contact.orderIds.includes(o.id)||!contact.clientIds.includes(o.clientId)||o.contactScopeVerified!==true||!Array.isArray(o.canonicalContacts)||!o.canonicalContacts.includes(phone)))fail('FOLLOWUP_PROGRAM_HISTORY_INCOMPLETE');
  const states=new Set(['NUEVO','PROCESO','PROGRAMADO','REPROGRAMADO','LIQUIDADO','TECNICO_FINALIZO','CANCELADO','SIN_CONCRETAR']);
  for(const o of data.orders){
    const times=['createdAt','scheduledAt','actualStartedAt','actualFinishedAt'].map(k=>o[k]===null?null:Date.parse(o[k]));
    // An old unresolved or finished order is history. Only a new/current-case
    // record, execution or a future booking contradicts this recovery proposal.
    if(times.some(t=>t!==null&&!Number.isFinite(t))||!states.has(o.state)||times.some(t=>t!==null&&t>=from)||o.deletedAt!==null)fail('FOLLOWUP_EXISTING_CASE_OR_BOOKING_REVIEW');
  }
  return {checkedAt:Date.parse(data.checkedAt),hash:hash(data),clientIds:contact.clientIds,orderIds:contact.orderIds,noncanonicalPhoneFieldsCovered:data.coverage.noncanonicalPhoneFieldsCovered===true,hardDeletesCovered:data.coverage.hardDeletesCovered===true};
}

/**
 * Callers are authenticated by the host's existing admin route. The host injects
 * the exact direct-user authorization; HTTP cannot grant itself authority.
 * prepare stores a proposal only. send recalculates all eligibility internally.
 * This module never enqueues/replays customer events or mutates conversation state.
 */
export function createReviewedCustomerFollowupRuntime(config,store,transport,{authorization,readProgram,now=Date.now}={}){
  scoped(config,store,transport);initialize(store);
  const authority=authorizationValid(authorization)?Object.freeze({...authorization}):null;
  const clock=()=>{const n=now();if(!Number.isSafeInteger(n))fail('FOLLOWUP_TIME_REQUIRED');return n;};
  const reader=readProgram??((input,at)=>readReviewedFollowupProgram(config,transport,input,at));
  let sending=false;
  const observe=phone=>{
    const unknown=unknownLocal();let conv;
    try{conv=store.conversation(phone);unknown.found=Boolean(conv);if(!conv||conv.line!==FUMIGACION_BLUE||![0,1].includes(conv.hold)||!Number.isSafeInteger(conv.revision)||conv.revision<0||!object(conv.state)||!ID.test(conv.state.caseId??''))return {public:unknown,conv:null};
      const flags=['doNotContact','optOutGlobal','humanHold','awaitingHumanReview','contactDeclined','closed'];
      if(flags.some(k=>conv.state[k]!==undefined&&typeof conv.state[k]!=='boolean'))return {public:unknown,conv:null};
      let durable=false;
      for(const line of config.lines){const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get('commercial-optout:fumigacion:'+hash(phone+':'+line.phone));if(row){store.open(row.value);durable=true;}}
      const value={found:true,hold:conv.hold===1,revision:conv.revision,caseId:conv.state.caseId,...Object.fromEntries(flags.map(k=>[k,conv.state[k]===true]))};
      value.doNotContact ||= durable||conv.state.commercialRefusal?.kind==='no-contact';
      return {public:value,conv,hash:hash([conv.line,conv.hold,conv.revision,conv.at,conv.state])};
    }catch{return {public:unknown,conv:null};}
  };
  const localAllowed=(phone,excludeKey=null)=>{
    const local=observe(phone),v=local.public;
    if(!local.conv||v.hold===null)fail('FOLLOWUP_LOCAL_ATTENTION_UNKNOWN');
    if(v.hold||v.humanHold||v.awaitingHumanReview)fail('FOLLOWUP_HUMAN_ATTENTION_PRESERVED');
    if(v.doNotContact||v.optOutGlobal||v.contactDeclined||v.closed)fail('FOLLOWUP_NO_CONTACT_OR_CLOSED');
    if(typeof store.hasSourcesOutsideLine!=='function'||store.hasSourcesOutsideLine(phone,FUMIGACION_BLUE))fail('FOLLOWUP_CROSS_LINE_HISTORY_REVIEW');
    if(store.db.prepare("SELECT 1 FROM events WHERE phone=? AND state IN ('PENDING','PROCESSING','REVIEW','HISTORY_REVIEW','ANSWER_REVIEW','WAITING_COORDINATOR') LIMIT 1").get(phone))fail('FOLLOWUP_LOCAL_TURN_PENDING');
    if(store.db.prepare("SELECT 1 FROM questions WHERE phone=? AND state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW') LIMIT 1").get(phone))fail('FOLLOWUP_OPERATOR_QUESTION_PENDING');
    if(store.db.prepare("SELECT 1 FROM outbox WHERE phone=? AND internal=0 AND id<>? AND state IN ('READY','FOLLOWUP_STAGED','RETENTION_STAGED','SENDING','ACCEPTED','UNCERTAIN') LIMIT 1").get(phone,excludeKey??''))fail('FOLLOWUP_OTHER_ATTEMPT_PRESERVED');
    return local;
  };
  const owner=async()=>{
    const binding=await transport.verifyLine(FUMIGACION_BLUE),line=config.lines.find(l=>l.phone===FUMIGACION_BLUE);
    if(binding?.ownerVerified!==true||binding.open!==true||binding.phone!==FUMIGACION_BLUE||binding.instance!==line.instance)fail('FOLLOWUP_NATIVE_OWNER_UNVERIFIED');
    return line;
  };
  const nativeSource=async input=>{
    const line=await owner(),data=await transport.request(line,'/chat/findMessages/'+line.instance,{where:{key:{id:input.sourceId}},offset:10,page:1});
    if(data?.messages?.total!==1||!Array.isArray(data.messages.records)||data.messages.records.length!==1)fail('FOLLOWUP_NATIVE_SOURCE_NOT_UNIQUE');
    const row=nativeValid(data.messages.records[0],input.phone,{incoming:true,now:clock()});
    if(row.key.id!==input.sourceId||sourceAt(row)<input.historyFrom)fail('FOLLOWUP_NATIVE_SOURCE_SCOPE_REQUIRED');
    return row;
  };
  const nativeHistory=async input=>{
    const line=await owner(),through=clock(),rows=new Map(),checks=[];
    const queries=[{field:'remoteJid',address:input.phone+'@s.whatsapp.net'},{field:'remoteJidAlt',address:input.phone+'@s.whatsapp.net'}],knownLids=new Set();
    for(let queryIndex=0;queryIndex<queries.length;queryIndex++){
      const {field,address}=queries[queryIndex];
      let total=null,read=0;const seen=new Set();
      for(let page=1;page<=20;page++){
        // Read all retained canonical/explicit-alternate history so an earlier
        // refusal cannot be hidden by moving the proposed case's start date.
        const data=await transport.request(line,'/chat/findMessages/'+line.instance,{where:{key:{[field]:address},messageTimestamp:{gte:new Date(0).toISOString(),lte:new Date(through).toISOString()}},offset:100,page}),result=data?.messages;
        if(!result||!Number.isSafeInteger(result.total)||result.total<0||result.total>2000||!Array.isArray(result.records)||result.records.length>100||total!==null&&total!==result.total)fail('FOLLOWUP_NATIVE_HISTORY_INCOMPLETE');
        total=result.total;read+=result.records.length;
        for(const raw of result.records){
          // Same-JID context without an explicit native PN is not promoted to
          // customer identity. It can contain an earlier refusal/media/edit,
          // so it prevents eligibility until that context is independently read.
          const rawAddresses=[raw?.key?.remoteJid,raw?.key?.remoteJidAlt].filter(Boolean);
          if(address.endsWith('@lid')&&!rawAddresses.includes(input.phone+'@s.whatsapp.net'))fail(rawAddresses.some(v=>typeof v==='string'&&v.endsWith('@s.whatsapp.net'))?'FOLLOWUP_NATIVE_HISTORY_IDENTITY_CONFLICT':'FOLLOWUP_NATIVE_LID_CONTEXT_REQUIRED');
          const r=nativeValid(raw,input.phone,{now:through});if(r.key[field]!==address||seen.has(r.key.id))fail('FOLLOWUP_NATIVE_HISTORY_IDENTITY_CONFLICT');seen.add(r.key.id);const prior=rows.get(r.key.id);if(prior&&reviewedFollowupNativeSourceHash(prior)!==reviewedFollowupNativeSourceHash(r))fail('FOLLOWUP_NATIVE_SOURCE_CHANGED');rows.set(r.key.id,r);
          for(const lid of [r.key.remoteJid,r.key.remoteJidAlt].filter(v=>typeof v==='string'&&v.endsWith('@lid'))){if(knownLids.has(lid))continue;if(knownLids.size>=8)fail('FOLLOWUP_NATIVE_LID_HISTORY_INCOMPLETE');knownLids.add(lid);queries.push({field:'remoteJid',address:lid});}
        }
        if(read===total)break;
        if(!result.records.length||read>total||page===20)fail('FOLLOWUP_NATIVE_HISTORY_INCOMPLETE');
      }
      checks.push({addressField:address.endsWith('@lid')?'explicit-native-lid':field,...(address.endsWith('@lid')?{lidHash:hash(address)}:{}),total,read});
    }
    const records=[...rows.values()].sort((a,b)=>sourceAt(a)-sourceAt(b)||a.key.id.localeCompare(b.key.id));
    if(!records.some(r=>r.key.id===input.sourceId))fail('FOLLOWUP_NATIVE_HISTORY_SOURCE_MISSING');
    if(records.filter(r=>r.key.fromMe===false).at(-1)?.key.id!==input.sourceId)fail('FOLLOWUP_NATIVE_SOURCE_NOT_LATEST');
    for(const r of records.filter(r=>r.key.fromMe===false)){
      // Read only the customer's own written body. A reply's stanzaId does
      // not turn that body into a quotation; quotedMessage is never adopted.
      // The refusal parser still rejects text that merely relays a quotation.
      const refusal=literalCommercialRefusal({id:r.key.id,phone:input.phone,line:FUMIGACION_BLUE,at:sourceAt(r),fromMe:false,kind:'text',text:sourceText(r),forwarded:false,quotedId:null});
      if(refusal)fail('FOLLOWUP_NATIVE_REFUSAL_PRESERVED');
      if(futureContactDeferral(r,through))fail('FOLLOWUP_CUSTOMER_FUTURE_CONTACT_PRESERVED');
    }
    return {records,hash:reviewedFollowupHistoryHash(records),from:input.historyFrom,through,checks};
  };
  const inspect=async(input,{review=null,excludeKey=null,onEligible=null}={})=>{
    const result={guard:REVIEWED_CUSTOMER_FOLLOWUP_GUARD,company:'fumigacion',line:FUMIGACION_BLUE,phone:input.phone,sourceId:input.sourceId,readOnly:true,eligible:false,local:unknownLocal(),coverage:'current-blue-native-cache-and-reviewed-case-window; unlinked-identities-and-provider-sync-not-certified'};
    try{
      scoped(config,store,transport);if(config.enabled!==true)fail('FOLLOWUP_CUSTOMER_GATE_CLOSED');
      const source=await nativeSource(input);result.native={verified:true,sourceHash:reviewedFollowupNativeSourceHash(source),at:sourceAt(source)};
      result.local=observe(input.phone).public;const before=localAllowed(input.phone,excludeKey);
      const history=await nativeHistory(input);result.history={hash:history.hash,from:history.from,through:history.through,sourceCount:history.records.length,checks:history.checks};
      if(result.native.sourceHash!==reviewedFollowupNativeSourceHash(history.records.find(r=>r.key.id===input.sourceId)))fail('FOLLOWUP_NATIVE_SOURCE_CHANGED');
      if(review&&(review.nativeSourceHash!==result.native.sourceHash||review.historyHash!==history.hash||review.revision!==before.conv.revision||review.caseId!==before.conv.state.caseId||!fresh(review.reviewedAt,clock())))fail('FOLLOWUP_REVIEW_STALE_OR_NATIVE_CHANGED');
      const program=programSnapshot(config,await reader({company:'fumigacion',phone:input.phone,from:input.historyFrom},clock()),input.phone,input.historyFrom,clock());result.program=program;
      if(typeof transport.currentAttention!=='function')fail('FOLLOWUP_NATIVE_ATTENTION_UNKNOWN');
      const attention=await transport.currentAttention(input.phone,{store});
      if(attention?.complete!==true||!fresh(attention.through,clock())||!Array.isArray(attention.sources))fail('FOLLOWUP_NATIVE_ATTENTION_UNKNOWN');
      const release=priorAttentionRelease(store,config,{phone:input.phone,line:FUMIGACION_BLUE,created:clock(),sourceAt:clock()},attention);
      for(const s of [...attention.sources,...history.records.filter(r=>r.key.fromMe).map(r=>({id:r.key.id,line:FUMIGACION_BLUE,at:sourceAt(r),kind:'text'}))]){
        if(store.db.prepare("SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=? AND state IN ('ACCEPTED','DELIVERED','READ')").get(s.id,input.phone,s.line))continue;
        if(nativeSourceBeforeRelease(s,{phone:input.phone,line:FUMIGACION_BLUE},release,config,attention.through))continue;
        fail('FOLLOWUP_NATIVE_HUMAN_ATTENTION_PRESERVED');
      }
      await owner();
      // Program/attention/owner reads can outlast a new native customer turn
      // before its webhook reaches this journal. Read incoming history again
      // after those awaits; a fresh local revision alone cannot prove silence.
      const finalHistory=await nativeHistory(input),after=localAllowed(input.phone,excludeKey);result.local=after.public;
      if(finalHistory.hash!==history.hash||result.native.sourceHash!==reviewedFollowupNativeSourceHash(finalHistory.records.find(r=>r.key.id===input.sourceId))||after.hash!==before.hash||!fresh(program.checkedAt,clock())||!fresh(attention.through,clock())||!fresh(finalHistory.through,clock()))fail('FOLLOWUP_CONTEXT_CHANGED_DURING_READ');
      if(review&&(review.historyHash!==finalHistory.hash||review.revision!==after.conv.revision||review.caseId!==after.conv.state.caseId||!fresh(review.reviewedAt,clock())))fail('FOLLOWUP_REVIEW_STALE_OR_NATIVE_CHANGED');
      result.history={...result.history,through:finalHistory.through,checks:finalHistory.checks};
      const checked={result,source,history:finalHistory,program,local:after};
      // The synchronous callback performs the durable transaction immediately
      // after final validation, with no async operation before reservation.
      const completion=onEligible?onEligible(checked):null;
      result.eligible=true;return {...checked,completion};
    }catch(e){result.reason=reasonOf(e);return {result};}
  };
  const keyInput=body=>{if(!exact(body,'company,key')||body.company!=='fumigacion'||!/^reviewed-customer-followup:[a-f0-9]{64}:v1$/.test(body.key??''))fail('FOLLOWUP_EXACT_KEY_REQUIRED');return body.key;};
  const status=entry=>{
    if(!entry)return {guard:REVIEWED_CUSTOMER_FOLLOWUP_GUARD,found:false,readOnly:true};
    const row=store.db.prepare('SELECT state,mid FROM outbox WHERE id=?').get(entry.outbox_id);
    return {guard:REVIEWED_CUSTOMER_FOLLOWUP_GUARD,found:true,key:entry.followup_key,state:entry.state,outboxId:entry.outbox_id,outboxState:row?.state??null,mid:row?.mid??null,automaticRetry:false,readOnly:true};
  };
  const readStatus=async body=>{
    if(exact(body,'company,key'))return status(stored(store,keyInput(body)));
    if(!exact(body,'company,line,phone,sourceId,historyFrom'))fail('FOLLOWUP_CLOSED_READ_FIELDS_REQUIRED');
    const input=identity(body),checked=await inspect(input);return {...checked.result,key:reviewedCustomerFollowupKey(input.phone,input.sourceId)};
  };
  const prepare=async body=>{
    if(!exact(body,'company,line,phone,sourceId,authorization,review'))fail('FOLLOWUP_CLOSED_PREPARE_FIELDS_REQUIRED');
    if(!authority||!authorizationValid(body.authorization)||hash(body.authorization)!==hash(authority))fail('FOLLOWUP_DIRECT_TASK_AUTHORIZATION_REQUIRED');
    const review=body.review;
    if(!exact(review,'nativeSourceHash,historyFrom,historyHash,revision,caseId,text,textHash,reviewedAt')||!HASH.test(review.nativeSourceHash??'')||!HASH.test(review.historyHash??'')||!Number.isSafeInteger(review.revision)||review.revision<0||!ID.test(review.caseId??'')||!safeText(review.text)||review.textHash!==hash(review.text)||!Number.isSafeInteger(review.reviewedAt))fail('FOLLOWUP_EXACT_REVIEWED_PROPOSAL_REQUIRED');
    const input=identity({...body,historyFrom:review.historyFrom}),key=reviewedCustomerFollowupKey(input.phone,input.sourceId),existing=stored(store,key),proposalHash=hash(body);
    if(existing){if(existing.value.proposalHash!==proposalHash)fail('FOLLOWUP_LAST_FACT_ALREADY_RESERVED');return {...status(existing),duplicate:true,queued:false};}
    if(!fresh(review.reviewedAt,clock()))fail('FOLLOWUP_REVIEW_STALE_OR_NATIVE_CHANGED');
    const checked=await inspect(input,{review,excludeKey:key,onEligible:checked=>store.tx(()=>{
        const current=localAllowed(input.phone,key);if(current.hash!==checked.local.hash||!fresh(review.reviewedAt,clock()))fail('FOLLOWUP_CONTEXT_CHANGED_DURING_READ');
        if(store.db.prepare('SELECT 1 FROM outbox WHERE id=?').get(key))fail('FOLLOWUP_LAST_FACT_ALREADY_RESERVED');
        const at=clock(),value={guard:REVIEWED_CUSTOMER_FOLLOWUP_GUARD,authorization:authority,input:{company:'fumigacion',line:FUMIGACION_BLUE,phone:input.phone,sourceId:input.sourceId,historyFrom:input.historyFrom},review,proposalHash,conversationHash:current.hash,programHash:checked.program.hash,preparedAt:at};
        store.db.prepare('INSERT INTO outbox(id,phone,line,body,internal,revision,state,created,updated,case_id) VALUES(?,?,?,?,0,?,?,?,?,?)').run(key,input.phone,FUMIGACION_BLUE,store.seal(review.text),review.revision,REVIEWED_CUSTOMER_FOLLOWUP_STAGED,at,at,review.caseId);
        store.db.prepare('INSERT INTO reviewed_customer_followups VALUES(?,?,?,?,?,?,?,?,?)').run(key,input.phone,FUMIGACION_BLUE,input.sourceId,key,'PREPARED',at,at,store.seal(value));
        record(store,key,'PREPARED','REVIEWED_PROPOSAL_NON_SENDABLE',at,{authorization:authority,proposalHash,nativeSourceHash:review.nativeSourceHash,historyHash:review.historyHash,textHash:review.textHash,businessWrites:0,sends:0});
      })});
    if(!checked.result.eligible)return {...checked.result,state:'REVIEW',queued:false};
    return {...status(stored(store,key)),queued:false,staged:true};
  };
  const send=async body=>{
    const key=keyInput(body),entry=stored(store,key);if(!entry)return status(null);
    if(entry.state!=='PREPARED')return {...status(entry),duplicate:true,sends:0};
    if(sending)return {guard:REVIEWED_CUSTOMER_FOLLOWUP_GUARD,key,state:'BUSY',sends:0};
    sending=true;
    try{
      if(!authority||hash(entry.value.authorization)!==hash(authority))fail('FOLLOWUP_DIRECT_TASK_AUTHORIZATION_REQUIRED');
      let row,reserved=false;
      const checked=await inspect(entry.value.input,{review:entry.value.review,excludeKey:key,onEligible:checked=>store.tx(()=>{
          const current=stored(store,key),local=localAllowed(entry.phone,key),at=clock();row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(key);
          if(current.state!=='PREPARED'||current.value.proposalHash!==entry.value.proposalHash||local.hash!==entry.value.conversationHash||local.hash!==checked.local.hash||!fresh(entry.value.review.reviewedAt,at)||!fresh(checked.program.checkedAt,at)||row?.state!==REVIEWED_CUSTOMER_FOLLOWUP_STAGED||row.mid!==null||row.phone!==entry.phone||row.line!==FUMIGACION_BLUE||row.internal!==0||row.revision!==local.conv.revision||row.case_id!==local.conv.state.caseId||store.open(row.body)!==entry.value.review.text)fail('FOLLOWUP_CONTEXT_CHANGED_BEFORE_RESERVATION');
          reserved=Boolean(store.db.prepare("UPDATE outbox SET state='SENDING',updated=? WHERE id=? AND state=? AND mid IS NULL").run(at,key,REVIEWED_CUSTOMER_FOLLOWUP_STAGED).changes);
          if(reserved)record(store,key,'SENDING','OWN_NATIVE_DELIVERY_RESERVED',at,{textHash:entry.value.review.textHash});
        })});
      if(!checked.result.eligible){store.tx(()=>record(store,key,'REVIEW',checked.result.reason,clock(),{attemptedSend:false}));return {...status(stored(store,key)),reason:checked.result.reason,sends:0};}
      if(!reserved)fail('FOLLOWUP_RESERVATION_CHANGED');
      try{
        const mid=await transport.send(row,entry.value.review.text);if(!SOURCE.test(mid??''))fail('FOLLOWUP_NATIVE_ACCEPTANCE_UNVERIFIED');
        store.tx(()=>{store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED',updated=? WHERE id=? AND state='SENDING'").run(mid,clock(),key);record(store,key,'ACCEPTED','NATIVE_ACCEPTED_NOT_DELIVERY',clock(),{mid,automaticRetry:false});});
        // Do not call recordFirstBotReply: this audited continuation grants no
        // first-response or service-creator credit. The exact outbox MID is
        // sufficient for Store.enqueue/Engine to recognize its own echo.
        return {...status(stored(store,key)),sends:1,deliveryVerified:false};
      }catch(e){store.tx(()=>{store.db.prepare("UPDATE outbox SET state='UNCERTAIN',updated=? WHERE id=? AND state='SENDING'").run(clock(),key);record(store,key,'UNCERTAIN',reasonOf(e),clock(),{automaticRetry:false});});return {...status(stored(store,key)),sends:1,deliveryVerified:false};}
    }catch(e){const current=stored(store,key);if(current?.state==='PREPARED')store.tx(()=>record(store,key,'REVIEW',reasonOf(e),clock(),{attemptedSend:false}));return {...status(stored(store,key)),reason:reasonOf(e),sends:0};}
    finally{sending=false;}
  };
  return {readStatus,prepare,send,status:()=>({guard:REVIEWED_CUSTOMER_FOLLOWUP_GUARD,company:'fumigacion',authorizationConfigured:Boolean(authority),stagingState:REVIEWED_CUSTOMER_FOLLOWUP_STAGED,automaticRetry:false,businessWritesEnabled:false,existingAdminAuthenticationRequired:true})};
}
