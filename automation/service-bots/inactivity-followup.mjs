import {createHash} from 'node:crypto';
import {knownInternalRecipient,normalize,publicTextSafe} from './config.mjs';
import {programEnabled,programFollowupEligible} from './maria-program.mjs';
import {assertOperationalLineScope,operationalLineAllowed} from './line-scope.mjs';

export const INACTIVITY_GUARD='own-delivered-open-case-once-after-20-minutes-and-native-recheck-v1';
const WAIT=20*60000,WINDOW=86400000;
const excluded=/\b(?:cancel\w*|rechaz\w*|no (?:gracias|quiero|deseo|necesito|me interesa|voy a continuar|voy a contratar)|prefiero no|no me (?:escrib\w*|contact\w*)|deja de (?:escribir|contactar)|refuerzo\w*|verificaci[oó]n|garanti\w*|comprobante\w*|transfer\w*|consign\w*|abono\w*|pague|pagado|pago|factura\w*|certificado\w*|documento\w*|fumigaron|vinieron|ya (?:hicieron|realizaron))\b|^(?:no|no por ahora|por ahora no|paso)[.! ]*$/;

// This records an installation window, never changes old events to PENDING.
// The direct instruction permits reviewing the bot's currently open cases;
// only the preceding 24 hours can qualify, and each case can be followed once.
export function initializeInactivityFollowup(config,store,now=Date.now()){
 if(config.company!=='fumigacion')return null;
 store.db.exec(`CREATE TABLE IF NOT EXISTS inactivity_followups(case_id TEXT PRIMARY KEY,outbox_id TEXT UNIQUE,source_id TEXT,queued_at INTEGER,body TEXT);
 CREATE TABLE IF NOT EXISTS response_latency(outbox_id TEXT PRIMARY KEY,event_id TEXT,line TEXT,provider_at INTEGER,received_at INTEGER,queued_at INTEGER,accepted_at INTEGER,delivery_ack_observed_at INTEGER,read_ack_observed_at INTEGER);`);
 const key='inactivity-followup-installation-v1',old=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
 if(old)return store.open(old.value);
 const setup={installedAt:now,eligibleSince:Math.max(config.activatedAt||now,now-WINDOW),guard:INACTIVITY_GUARD,minimumInactiveMs:WAIT,maximumSourceAgeMs:WINDOW,onePerCase:true};
 store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,store.seal(setup));return setup;
}

export function inactivityStatus(config,store){
 if(config.company!=='fumigacion')return {prepared:false,enabled:false};
 const installation=initializeInactivityFollowup(config,store);
 return {prepared:true,enabled:Boolean(config.enabled&&config.inactivityFollowupEnabled&&programEnabled(config)),programContextRequired:true,guard:INACTIVITY_GUARD,installation,queuedCases:store.db.prepare('SELECT COUNT(*) n FROM inactivity_followups').get().n,humanChatsReleased:0};
}

function completed(state){return Boolean(state.programServiceId||state.serviceRegistered||state.serviceCompleted||state.closed||state.completed||state.programRegistration?.serviceId);}
function blockedState(state){return state.awaitingHumanReview||state.requestedAfterServiceReview||state.requestedControlReview||state.pendingFaqQuestion||state.programIntake||completed(state);}
function quoteCurrent(quote,now){return !quote||!((quote.validUntil&&quote.validUntil<=now)||(quote.expiresAt&&quote.expiresAt<=now));}
function lineScopeEligible(config,store,phone,line,sourceAt){
 const scope=assertOperationalLineScope(config);
 return !scope||(operationalLineAllowed(config,line)&&sourceAt>=Date.parse(scope.authorizedAt)&&!store.hasSourcesOutsideLine(phone,line));
}
function followupText(state){
 if(state.quotedPrice&&!state.quotedPrice.accepted)return '¿Deseas continuar con la cotización que te compartí?';
 const slots=state.slots||{};
 let question;
 if(!slots.service)question='¿qué plaga deseas tratar o buscas un servicio de prevención?';
 else if(!slots.site)question='¿qué tipo de inmueble necesitas tratar?';
 else if(normalize(slots.service).includes('chinches')&&!slots.mattresses)question='¿cuántos colchones están afectados y hay chinches en bases de cama u otros muebles?';
 else if(!normalize(slots.service).includes('chinches')&&!slots.area&&!slots.rooms)question='¿cuántas habitaciones o metros cuadrados tiene el lugar?';
 else if(!slots.location&&!slots.locationDetails)question='¿en qué municipio y barrio o vereda necesitas el servicio?';
 else if(state.quotedPrice?.accepted&&!slots.preference)question='¿qué día y franja horaria prefieres para el servicio?';
 return question?'Si deseas continuar con tu solicitud, '+question:null;
}

export function inactivityCandidate(config,store,phone,now=Date.now()){
 if(config.company!=='fumigacion'||!config.enabled||!config.inactivityFollowupEnabled||!programEnabled(config,now)||knownInternalRecipient(phone))return null;
 const installation=initializeInactivityFollowup(config,store,now),conv=store.conversation(phone),state=conv?.state;
 if(!conv||conv.hold||!state?.caseId||blockedState(state)||!config.lines.some(l=>l.phone===conv.line)||store.db.prepare('SELECT 1 FROM inactivity_followups WHERE case_id=?').get(state.caseId))return null;
 const author=store.caseAuthorship(state.caseId);
 if(author?.state!=='BOT_FIRST_REPLY_VERIFIED'||!author.firstReplyEligible||author.priorStaffSource)return null;
 const retry=store.db.prepare('SELECT value FROM meta WHERE key=?').get('inactivity-native-checked:'+state.caseId);
 if(retry&&store.open(retry.value).at>now-60000)return null;
 const latest=store.db.prepare('SELECT * FROM events WHERE phone=? AND from_me=0 ORDER BY at DESC,rowid DESC LIMIT 1').get(phone);
 if(!latest||latest.at<installation.eligibleSince||latest.at<now-WINDOW||latest.at>now-WAIT||latest.state!=='DONE')return null;
 const event=store.open(latest.body);
 if(!lineScopeEligible(config,store,phone,event.line,event.at))return null;
 if(event.kind!=='text'||event.forwarded||event.id!==state.lastHandledSourceId||excluded.test(normalize(event.text)))return null;
 const firstId=state.caseId.startsWith('fumigacion:')?state.caseId.slice('fumigacion:'.length):null;
 const first=firstId&&store.db.prepare('SELECT at FROM events WHERE id=? AND phone=? AND from_me=0').get(firstId,phone);
 if(!first)return null;
 const total=store.db.prepare('SELECT COUNT(*) n FROM events WHERE phone=? AND from_me=0 AND at BETWEEN ? AND ?').get(phone,first.at,latest.at).n;
 if(total>40)return null;
 const caseTurns=store.db.prepare('SELECT body FROM events WHERE phone=? AND from_me=0 AND at BETWEEN ? AND ? ORDER BY at,rowid LIMIT 40').all(phone,first.at,latest.at).map(r=>store.open(r.body));
 // A later courtesy does not revoke a prior rejection. Unread media and any
 // after-service/payment/document exception in this case remain in review.
 if(caseTurns.some(turn=>turn.kind!=='text'||turn.forwarded||excluded.test(normalize(turn.text))))return null;
 if(store.db.prepare("SELECT 1 FROM events WHERE phone=? AND state IN ('PENDING','HISTORY_REVIEW','REVIEW','WAITING_COORDINATOR','ANSWER_REVIEW')").get(phone)||
    store.db.prepare("SELECT 1 FROM questions WHERE phone=? AND case_id=? AND state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW')").get(phone,state.caseId)||
    store.db.prepare("SELECT 1 FROM outbox WHERE phone=? AND internal=0 AND state IN ('READY','SENDING','UNCERTAIN','ACCEPTED')").get(phone))return null;
 const source=store.db.prepare("SELECT * FROM outbox WHERE phone=? AND case_id=? AND internal=0 AND state IN ('DELIVERED','READ') ORDER BY created DESC,rowid DESC LIMIT 1").get(phone,state.caseId);
 if(!source||source.line!==event.line||!source.mid||source.created<latest.received_at||source.updated>now-WAIT||!store.approvedReplyStillValid(source)||!store.priceReplyStillValid(source))return null;
 if(!quoteCurrent(state.quotedPrice,now))return null;
 const text=followupText(state);if(!text||!publicTextSafe(text))return null;
 const id='inactivity:fumigacion:'+createHash('sha256').update(state.caseId).digest('hex')+':v1';
 return {id,phone,line:event.line,caseId:state.caseId,sourceId:event.id,lastSourceAt:event.at,lastReplyId:source.id,lastReplyMid:source.mid,revision:conv.revision,text};
}

export async function revalidateInactivity(store,config,transport,candidate,now=Date.now()){
 const current=inactivityCandidate(config,store,candidate.phone,now);
 // Already queued candidates are checked by the same state gates without
 // deleting their durable once-per-case record.
 if(!current||current.id!==candidate.id||current.sourceId!==candidate.sourceId||current.revision!==candidate.revision)return false;
 if(typeof transport.currentCustomerActivity!=='function')return false;
 const native=await transport.currentCustomerActivity(candidate.phone,candidate.lastSourceAt);
 if(!native.complete||!native.sources.some(s=>s.id===candidate.sourceId&&s.line===candidate.line&&s.at===candidate.lastSourceAt)||native.sources.some(s=>s.at>candidate.lastSourceAt||s.at===candidate.lastSourceAt&&s.id!==candidate.sourceId))return false;
 if(!await programFollowupEligible(config,store,transport,candidate.phone))return false;
 const latest=store.conversation(candidate.phone);
 const checkedAt=Math.max(now,Date.now());
 return lineScopeEligible(config,store,candidate.phone,candidate.line,candidate.lastSourceAt)&&!latest?.hold&&!blockedState(latest?.state||{})&&latest?.revision===candidate.revision&&candidate.lastSourceAt>=checkedAt-WINDOW&&quoteCurrent(latest?.state.quotedPrice,checkedAt);
}

export async function queueInactivityFollowups(store,config,transport,now=Date.now()){
 initializeInactivityFollowup(config,store,now);
 if(config.company!=='fumigacion'||!config.enabled||!config.inactivityFollowupEnabled||!programEnabled(config,now))return {enabled:false,queued:0,prepared:config.company==='fumigacion'};
 let queued=0,review=0,attempts=0;
 for(const row of store.db.prepare('SELECT phone FROM conversations WHERE hold=0 AND at BETWEEN ? AND ? ORDER BY at LIMIT 20').all(now-WINDOW,now-WAIT)){
  const candidate=inactivityCandidate(config,store,row.phone,now);if(!candidate)continue;
  // Only one candidate performs network reads per idle worker cycle. A new
  // authenticated source wakes active reception rather than waiting behind
  // a whole batch of inactivity requests.
  if(attempts++)break;
  try{if(!await revalidateInactivity(store,config,transport,candidate,now)){store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('inactivity-native-checked:'+candidate.caseId,store.seal({at:now}));continue;}}
  catch{store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('inactivity-native-checked:'+candidate.caseId,store.seal({at:now}));store.audit('INACTIVITY_NATIVE_REVIEW',candidate.sourceId,{attemptedSend:false});review++;continue;}
  store.tx(()=>{
   const current=inactivityCandidate(config,store,row.phone,Math.max(now,Date.now()));if(!current||current.revision!==candidate.revision||current.sourceId!==candidate.sourceId)return;
   store.db.prepare('INSERT INTO inactivity_followups VALUES(?,?,?,?,?)').run(candidate.caseId,candidate.id,candidate.sourceId,Date.now(),store.seal(candidate));
   if(store.queue(candidate.id,candidate.phone,candidate.line,candidate.text,false,candidate.revision,candidate.caseId))queued++;
   store.audit('OWN_CASE_INACTIVITY_FOLLOWUP_QUEUED',candidate.sourceId,{caseId:candidate.caseId,outboxId:candidate.id,lastReplyId:candidate.lastReplyId,closedServiceClaimed:false,onePerCase:true});
  });
 }
 return {enabled:true,queued,review};
}

export async function inactivityDeliveryValid(store,config,transport,row){
 if(!row.id.startsWith('inactivity:'))return true;
 const record=store.db.prepare('SELECT body FROM inactivity_followups WHERE outbox_id=?').get(row.id);if(!record)return false;
 const candidate=store.open(record.body),conv=store.conversation(row.phone),now=Date.now();
 if(!lineScopeEligible(config,store,row.phone,candidate.line,candidate.lastSourceAt))return false;
 if(!config.inactivityFollowupEnabled||conv?.hold||blockedState(conv?.state||{})||conv?.state.caseId!==candidate.caseId||conv?.revision!==candidate.revision||candidate.lastSourceAt<now-WINDOW)return false;
 const quote=conv.state.quotedPrice,prior=store.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND case_id=? AND state IN ('DELIVERED','READ')").get(candidate.lastReplyId,row.phone,candidate.caseId);
 if(!prior||prior.mid!==candidate.lastReplyMid||!store.approvedReplyStillValid(prior)||!store.priceReplyStillValid(prior)||!quoteCurrent(quote,now))return false;
 if(store.db.prepare('SELECT 1 FROM events WHERE phone=? AND from_me=0 AND (at>? OR (at=? AND id<>?))').get(row.phone,candidate.lastSourceAt,candidate.lastSourceAt,candidate.sourceId)||store.db.prepare("SELECT 1 FROM questions WHERE phone=? AND case_id=? AND state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW')").get(row.phone,candidate.caseId))return false;
 const native=await transport.currentCustomerActivity(row.phone,candidate.lastSourceAt);
 if(!native.complete||!native.sources.some(s=>s.id===candidate.sourceId&&s.line===candidate.line&&s.at===candidate.lastSourceAt)||native.sources.some(s=>s.at>candidate.lastSourceAt||s.at===candidate.lastSourceAt&&s.id!==candidate.sourceId))return false;
 if(!await programFollowupEligible(config,store,transport,row.phone))return false;
 const latest=store.conversation(row.phone);
 const checkedAt=Date.now();
 if(!lineScopeEligible(config,store,row.phone,candidate.line,candidate.lastSourceAt))return false;
 return programEnabled(config,checkedAt)&&!latest?.hold&&!blockedState(latest?.state||{})&&latest?.revision===candidate.revision&&candidate.lastSourceAt>=checkedAt-WINDOW&&quoteCurrent(latest?.state.quotedPrice,checkedAt)&&store.approvedReplyStillValid(prior)&&store.priceReplyStillValid(prior)&&native.complete&&native.sources.some(s=>s.id===candidate.sourceId&&s.line===candidate.line&&s.at===candidate.lastSourceAt)&&!native.sources.some(s=>s.at>candidate.lastSourceAt||s.at===candidate.lastSourceAt&&s.id!==candidate.sourceId);
}

export function recordResponseTiming(store,row,acceptedAt=null){
 if(row.internal)return;
 let eventId=row.id.endsWith(':reply')?row.id.slice(0,-6):null;
 if(!eventId&&row.id.startsWith('program:')&&row.case_id){
  const registration=store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+row.case_id);
  eventId=registration?store.open(registration.value).payload?.sourceId:null;
 }
 const source=eventId&&store.db.prepare('SELECT at,received_at FROM events WHERE id=? AND phone=? AND line=?').get(eventId,row.phone,row.line);
 if(!source)return;
 store.db.prepare('INSERT INTO response_latency(outbox_id,event_id,line,provider_at,received_at,queued_at,accepted_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(outbox_id) DO UPDATE SET accepted_at=COALESCE(excluded.accepted_at,response_latency.accepted_at)').run(row.id,eventId,row.line,source.at,source.received_at??null,row.created,acceptedAt);
}
export function recordDeliveryTiming(store,mid,line,state,observedAt=Date.now()){
 if(!['DELIVERED','READ'].includes(state))return;
 const row=store.db.prepare('SELECT id FROM outbox WHERE mid=? AND line=? AND internal=0').get(mid,line);if(!row)return;
 store.db.prepare('UPDATE response_latency SET delivery_ack_observed_at=COALESCE(delivery_ack_observed_at,?),read_ack_observed_at=CASE WHEN ?=1 THEN COALESCE(read_ack_observed_at,?) ELSE read_ack_observed_at END WHERE outbox_id=?').run(observedAt,Number(state==='READ'),observedAt,row.id);
}
export function responseTimingStatus(config,store){
 if(config.company!=='fumigacion')return null;
 initializeInactivityFollowup(config,store);
 const rows=store.db.prepare('SELECT * FROM response_latency ORDER BY queued_at DESC LIMIT 100').all();
 const duration=(a,b)=>a!=null&&b!=null&&b>=a?b-a:null;
 const accepted=rows.map(r=>duration(r.received_at,r.accepted_at)).filter(n=>n!==null).sort((a,b)=>a-b);
 return {targetMs:config.responseTargetMs??null,measuredSamples:rows.length,acceptedSamples:accepted.length,underTarget:config.responseTargetMs?accepted.filter(n=>n<=config.responseTargetMs).length:null,p50AcceptedFromReceiptMs:accepted.length?accepted[Math.ceil(accepted.length*.5)-1]:null,p95AcceptedFromReceiptMs:accepted.length?accepted[Math.ceil(accepted.length*.95)-1]:null,deliveryIsDistinctFromAcceptance:true,deliveryTimeBasis:'server-observation-of-authenticated-provider-ack; not-exact-provider-delivery-time',fullHistoryMeasured:false,recent:rows.map(r=>({eventId:r.event_id,line:r.line,providerAt:r.provider_at,receivedAt:r.received_at,queuedAt:r.queued_at,acceptedAt:r.accepted_at,deliveryAckObservedAt:r.delivery_ack_observed_at,readAckObservedAt:r.read_ack_observed_at,receiptToQueueMs:duration(r.received_at,r.queued_at),receiptToAcceptedMs:duration(r.received_at,r.accepted_at),providerToAcceptedMs:duration(r.provider_at,r.accepted_at)}))};
}
