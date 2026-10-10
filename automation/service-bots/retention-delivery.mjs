import {createHash} from 'node:crypto';
import {BUSINESSES,knownInternalRecipient} from './config.mjs';
import {MARIA_COMPANY,MARIA_TENANT} from './maria-program.mjs';
import {planPreventiveRetention,PREVENTIVE_RETENTION_GUARD} from './preventive-retention.mjs';
import {operationalLineAllowed} from './line-scope.mjs';
import {Transport} from './transport.mjs';

export const RETENTION_DELIVERY_PROOF_GUARD='own-fumigacion-retention-delivery-proof-v1';
export const RETENTION_SOURCE_GUARD='own-fumigacion-retention-source-readonly-v1';
export const RETENTION_PROOF_FRESHNESS_MS=120000;
const cyclePattern=/^preventive-retention-fumigacion-[a-f0-9]{40}-v1$/;
const pn=/^57\d{10}$/;
const identifier=/^[A-Za-z0-9:_-]{1,160}$/;
const millis=v=>typeof v==='number'&&Number.isSafeInteger(v)?v:typeof v==='string'?Date.parse(v):NaN;
const iso=v=>new Date(v).toISOString();
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const day=v=>new Date(v).toLocaleDateString('sv-SE',{timeZone:'America/Bogota'});
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const fail=code=>{throw Error(code);};
const reasonOf=e=>/^RETENTION_[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'RETENTION_RECHECK_UNAVAILABLE';
const fresh=(at,now)=>Number.isFinite(at)&&at<=now&&now-at<=RETENTION_PROOF_FRESHNESS_MS;

export function retentionCycleKey(phone,lastCompletedOrderId){
  if(!pn.test(phone??'')||!identifier.test(lastCompletedOrderId??''))fail('RETENTION_CYCLE_IDENTITY_REQUIRED');
  return 'preventive-retention-fumigacion-'+hash('fumigacion|'+phone+'|completed-service|'+lastCompletedOrderId).slice(0,40)+'-v1';
}
export function retentionOutboxId(key){if(!cyclePattern.test(key??''))fail('RETENTION_CYCLE_KEY_REQUIRED');return key+':retention';}
export function retentionCaseId(key){if(!cyclePattern.test(key??''))fail('RETENTION_CYCLE_KEY_REQUIRED');return 'fumigacion:retention:'+key;}

function scope(config,store){
  if(config.company!=='fumigacion'||store.company!==config.company||!Array.isArray(config.lines)||config.lines.length!==2||new Set(config.lines.map(l=>l.phone)).size!==2||config.lines.some(l=>!BUSINESSES.fumigacion.phones.includes(l.phone)))fail('RETENTION_OWN_RUNTIME_SCOPE_REQUIRED');
}
export function initializeRetentionDelivery(config,store){
  scope(config,store);
  store.db.exec(`CREATE TABLE IF NOT EXISTS retention_cycles(
    cycle_key TEXT PRIMARY KEY,outbox_id TEXT NOT NULL UNIQUE,state TEXT NOT NULL,
    created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS retention_delivery_ledger(
    id INTEGER PRIMARY KEY,cycle_key TEXT NOT NULL,at INTEGER NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,body TEXT NOT NULL,
    FOREIGN KEY(cycle_key) REFERENCES retention_cycles(cycle_key));
    CREATE INDEX IF NOT EXISTS retention_ledger_cycle ON retention_delivery_ledger(cycle_key,id);`);
}
const entry=(store,key)=>{const r=store.db.prepare('SELECT * FROM retention_cycles WHERE cycle_key=?').get(key);return r?{...r,value:store.open(r.body)}:null;};
const tableExists=store=>Boolean(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='retention_cycles'").get());

function localState(config,store,candidate,expectedRevision=null){
  scope(config,store);
  if(config.enabled!==true||!operationalLineAllowed(config,candidate.line))fail('RETENTION_ORIGIN_LINE_UNAVAILABLE');
  const conv=store.conversation(candidate.phone);
  if(!conv||conv.line!==candidate.line||conv.hold||conv.state.awaitingHumanReview||conv.state.humanHold||conv.state.doNotContact||conv.state.optOutGlobal)fail('RETENTION_LOCAL_HOLD_OR_IDENTITY_REVIEW');
  if(conv.state.caseId!==retentionCaseId(candidate.dedupKey)||expectedRevision!==null&&conv.revision!==expectedRevision)fail('RETENTION_LOCAL_CASE_CHANGED');
  if(store.db.prepare("SELECT 1 FROM events WHERE phone=? AND from_me=0 AND state IN ('PENDING','PROCESSING') LIMIT 1").get(candidate.phone))fail('RETENTION_LOCAL_CUSTOMER_TURN_PENDING');
  const outbox=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(retentionOutboxId(candidate.dedupKey));
  if(!outbox||outbox.phone!==candidate.phone||outbox.line!==candidate.line||outbox.internal!==0||outbox.case_id!==retentionCaseId(candidate.dedupKey)||outbox.revision!==conv.revision||store.open(outbox.body)!==candidate.text||hash(candidate.text)!==candidate.textHash)fail('RETENTION_OWN_OUTBOX_ASSOCIATION_REQUIRED');
  if(store.db.prepare("SELECT 1 FROM outbox WHERE phone=? AND internal=0 AND id<>? AND state IN ('READY','SENDING','ACCEPTED','UNCERTAIN') LIMIT 1").get(candidate.phone,outbox.id))fail('RETENTION_OTHER_CUSTOMER_OUTBOX_PENDING');
  return {conv,outbox};
}

const candidateIdentity=c=>({company:c.company,phone:c.phone,line:c.line,sourceAnchorId:c.sourceAnchorId,sourceAnchorKind:c.sourceAnchorKind,sourceAnchorAt:c.sourceAnchorAt,dedupKey:c.dedupKey,text:c.text,textHash:c.textHash});
function candidateValid(c){
  return c?.guard===PREVENTIVE_RETENTION_GUARD&&c.company==='fumigacion'&&pn.test(c.phone??'')&&!knownInternalRecipient(c.phone)&&BUSINESSES.fumigacion.phones.includes(c.line)&&c.sourceAnchorKind==='completed-service'&&identifier.test(c.sourceAnchorId??'')&&c.dedupKey===retentionCycleKey(c.phone,c.sourceAnchorId)&&typeof c.text==='string'&&c.text.length<=1000&&c.textHash===hash(c.text)&&c.noteEligible===false&&c.requiresActualNativeDelivery===true&&c.appointmentOrServicePromised===false&&c.sends===0&&c.businessWrites===0;
}

// loadEligibility is an injected, authenticated server-side reader, never a
// deserialized HTTP claim. The production default has no adapter and fails
// closed. Its fresh plannerInput is reevaluated here on preparation and proof.
async function eligibleSource(config,candidate,loadEligibility,clock,{cycle=null,outbox=null}={}){
  if(typeof loadEligibility!=='function')fail('RETENTION_ELIGIBILITY_ADAPTER_REQUIRED');
  const requestedAt=clock();
  const source=await loadEligibility({company:'fumigacion',phone:candidate.phone,cycleKey:candidate.dedupKey,lastCompletedOrderId:candidate.sourceAnchorId,now:requestedAt});
  const now=clock();
  const actor=config.mariaProgram?.actorId;
  if(source?.guard!==RETENTION_SOURCE_GUARD||source.company!=='fumigacion'||source.tenantId!==MARIA_TENANT||source.companyId!==MARIA_COMPANY||!identifier.test(actor??'')||source.actorId!==actor||!identifier.test(source.clientId??'')||source.phone!==candidate.phone||source.lastCompletedOrderId!==candidate.sourceAnchorId||source.anchorKind!=='COMPLETED_SERVICE'||millis(source.anchorAt)!==millis(candidate.sourceAnchorAt)||source.canonicalRecipientUniqueVerified!==true||!fresh(millis(source.checkedAt),now))fail('RETENTION_FRESH_OWN_SOURCE_REQUIRED');
  const input=source.plannerInput;
  if(!input||!Array.isArray(input.contacts)||input.contacts.length!==1||input.contacts[0].phone!==candidate.phone||!Array.isArray(input.history))fail('RETENTION_COMPLETE_SOURCE_INPUT_REQUIRED');
  const contact=input.contacts[0];
  if(['optOutGlobal','doNotContact','humanHold','activeCase','pendingVisit','pendingQuotation'].some(k=>contact[k]!==false))fail('RETENTION_CURRENT_CUSTOMER_STATUS_REQUIRED');
  if(!Array.isArray(contact.completedServices)||!Array.isArray(contact.bookingInteractions)||!Array.isArray(contact.futureBookings)||!Array.isArray(contact.rejections))fail('RETENTION_COMPLETE_SOURCE_INPUT_REQUIRED');
  const selected=contact.completedServices.filter(s=>s.orderId===source.lastCompletedOrderId&&s.sourceId===source.lastCompletedOrderId&&millis(s.completedAt)===millis(source.anchorAt));
  if(selected.length!==1||selected[0].clientId!==source.clientId)fail('RETENTION_LAST_COMPLETED_SOURCE_REQUIRED');
  // Preparation keeps every prior attempt, including a same-key uncertainty.
  // Proof may omit one delivered record only when it identifies this already
  // durable cycle, exact own outbox, case, line and provider MID. A second row,
  // missing association or any uncertainty still blocks the planner.
  const ownCycle=cycle?.cycle_key===candidate.dedupKey&&cycle.value?.guard===RETENTION_DELIVERY_PROOF_GUARD&&cycle.value.company==='fumigacion'&&same(cycle.value.candidate,candidate)&&cycle.value.outboxId===outbox?.id&&cycle.value.caseId===outbox?.case_id&&outbox?.id===retentionOutboxId(candidate.dedupKey)&&outbox.case_id===retentionCaseId(candidate.dedupKey)&&outbox.phone===candidate.phone&&outbox.line===candidate.line&&outbox.internal===0&&['DELIVERED','READ'].includes(outbox.state)&&identifier.test(outbox.mid??'');
  let ownRecordExcluded=false;
  const history=input.history.filter(h=>{
    const exact=ownCycle&&!ownRecordExcluded&&h.company==='fumigacion'&&h.phone===candidate.phone&&h.dedupKey===candidate.dedupKey&&h.sourceAnchorId===candidate.sourceAnchorId&&h.outboxId===outbox.id&&h.caseId===outbox.case_id&&h.line===outbox.line&&h.mid===outbox.mid&&['DELIVERED','READ'].includes(h.state);
    if(exact)ownRecordExcluded=true;return !exact;
  });
  const replanned=planPreventiveRetention({company:'fumigacion',day:day(now),now,coverage:input.coverage,contacts:input.contacts,history});
  const approved=replanned.prepared.find(c=>c.dedupKey===candidate.dedupKey);
  if(replanned.crossedCoverageComplete!==true||!approved||!same(candidateIdentity(approved),candidateIdentity(candidate)))fail('RETENTION_CURRENT_ELIGIBILITY_NOT_VERIFIED');
  return {source,approved,wholeSourceEligibility:{complete:true,noFutureBooking:true,noRecentAgenda:true,noRejectionOrOptOut:true,noHumanHold:true,originalLineVerified:true,canonicalRecipientUniqueVerified:true,bothLinesHistoryComplete:true}};
}

function ledger(store,row,state,reason,detail,now){
  store.tx(()=>{
    store.db.prepare('UPDATE retention_cycles SET state=?,updated_at=? WHERE cycle_key=?').run(state,now,row.cycle_key);
    store.db.prepare('INSERT INTO retention_delivery_ledger(cycle_key,at,state,reason,body) VALUES(?,?,?,?,?)').run(row.cycle_key,now,state,reason,store.seal(detail));
  });
}
function pending(reason,key=null){return {guard:RETENTION_DELIVERY_PROOF_GUARD,company:'fumigacion',eligible:false,pending:true,reason,...(key?{cycleKey:key}:{}),sends:0,programNotesWritten:0};}

function providedAckIdentityMatches(update,mid,phone,addresses,line){
  if(!update||typeof update!=='object'||Array.isArray(update))return false;
  if(update.key!==undefined&&update.key!==null&&(typeof update.key!=='object'||Array.isArray(update.key)))return false;
  const jid=phone+'@s.whatsapp.net';
  for(const info of [update,update.key??{}]){
    if(info===update.key&&info.id!==undefined&&info.id!==mid)return false;
    if(info.fromMe!==undefined&&info.fromMe!==null&&info.fromMe!==true)return false;
    for(const field of ['remoteJid','remoteJidAlt','participant']){
      const value=info[field];if(value===undefined||value===null)continue;
      if(typeof value!=='string'||!/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(value)||(/^57\d{10}@s\.whatsapp\.net$/.test(value)?value!==jid:!addresses.includes(value)))return false;
    }
    if(info.sourceLine!==undefined&&info.sourceLine!==line||info.line!==undefined&&info.line!==line)return false;
  }
  return true;
}

async function nativeDelivery(config,transport,row,candidate,preparedAt,clock){
  if(transport?.config!==config||typeof transport.verifyLine!=='function'||typeof transport.request!=='function')fail('RETENTION_OWN_NATIVE_TRANSPORT_REQUIRED');
  const binding=await transport.verifyLine(candidate.line);
  if(binding?.ownerVerified!==true||binding.phone!==candidate.line||binding.open!==true)fail('RETENTION_NATIVE_OWNER_REQUIRED');
  const line=config.lines.find(l=>l.phone===candidate.line);
  if(binding.instance!==line.instance)fail('RETENTION_NATIVE_OWNER_REQUIRED');
  const data=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{id:row.mid}},offset:10,page:1});
  const now=clock();
  const messages=data?.messages;
  if(!messages||messages.total!==1||!Array.isArray(messages.records)||messages.records.length!==1)fail('RETENTION_NATIVE_MID_NOT_UNIQUE');
  const native=messages.records[0],key=native.key??{},jid=candidate.phone+'@s.whatsapp.net',addresses=[key.remoteJid,key.remoteJidAlt].filter(Boolean);
  const nativePN=addresses.filter(v=>/^57\d{10}@s\.whatsapp\.net$/.test(v));
  if(key.id!==row.mid||key.fromMe!==true||!addresses.every(v=>/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(v))||!nativePN.length||nativePN.some(v=>v!==jid)||new Set(nativePN).size!==1)fail('RETENTION_NATIVE_RECIPIENT_REQUIRED');
  const m=native.message?.ephemeralMessage?.message??native.message??{},context=m.extendedTextMessage?.contextInfo??native.contextInfo??{},text=m.conversation??m.extendedTextMessage?.text;
  const sentAt=Number(native.messageTimestamp)*1000;
  if(text!==candidate.text||hash(text??'')!==candidate.textHash||context.isForwarded||context.forwardingScore>0||!Number.isFinite(sentAt)||sentAt<preparedAt-1000||sentAt>now)fail('RETENTION_NATIVE_TEXT_OR_TIME_REQUIRED');
  const updates=native.MessageUpdate??[];
  if(!Array.isArray(updates)||updates.some(u=>!providedAckIdentityMatches(u,row.mid,candidate.phone,addresses,candidate.line)))fail('RETENTION_NATIVE_DELIVERY_REQUIRED');
  const statuses=[native.status,...updates.map(u=>u.status)];
  if(statuses.some(s=>['EDITED','DELETED'].includes(s)))fail('RETENTION_NATIVE_TEXT_OR_TIME_REQUIRED');
  const delivery=statuses.includes('READ')?'READ':statuses.includes('DELIVERY_ACK')?'DELIVERED':null;
  if(!delivery)fail('RETENTION_NATIVE_DELIVERY_REQUIRED');
  // Provider messageTimestamp is sending time, not delivery time. The native
  // acknowledgement proves delivery; absent a real receipt timestamp keep null.
  return {mid:row.mid,text,textHash:candidate.textHash,delivery,deliveredAt:null,checkedAt:iso(now),fromMe:true,recipientPhone:candidate.phone,sourceLine:candidate.line,verified:true};
}

export function retentionDeliveryStatus(config,store,{eligibilityAdapterConnected=false}={}){
  scope(config,store);
  const states=tableExists(store)?Object.fromEntries(store.db.prepare('SELECT state,COUNT(*) count FROM retention_cycles GROUP BY state').all().map(r=>[r.state,r.count])):{};
  return {guard:RETENTION_DELIVERY_PROOF_GUARD,company:'fumigacion',eligibilityAdapterConnected:eligibilityAdapterConnected===true,sendingEnabled:false,notesEnabled:false,automaticRetriesEnabled:false,proofRequiresFreshNativeRead:true,proofFreshnessMs:RETENTION_PROOF_FRESHNESS_MS,states,readOnlyBusinessOperations:true};
}

export function createRetentionDeliveryRuntime(config,store,transport,{loadEligibility,now=Date.now}={}){
  initializeRetentionDelivery(config,store);
  const clock=()=>{const value=now();if(!Number.isSafeInteger(value))fail('RETENTION_TIME_REQUIRED');return value;};
  const connected=()=>typeof loadEligibility==='function';
  const prepareCycle=async(plan,candidate)=>{
    const at=clock();
    if(!candidateValid(candidate)||plan?.guard!==PREVENTIVE_RETENTION_GUARD||plan.company!=='fumigacion'||plan.crossedCoverageComplete!==true||!fresh(millis(plan.checkedAt),at)||!Array.isArray(plan.prepared)||!plan.prepared.some(c=>same(c,candidate)))fail('RETENTION_APPROVED_PLAN_REQUIRED');
    const before=localState(config,store,candidate),source=await eligibleSource(config,candidate,loadEligibility,clock);
    const preparedAt=millis(candidate.preparedAt);
    if(!Number.isFinite(preparedAt)||candidate.preparedAt!==iso(preparedAt)||!same(candidate,{...source.approved,preparedAt:candidate.preparedAt}))fail('RETENTION_APPROVED_PLAN_REQUIRED');
    const after=localState(config,store,candidate,before.conv.revision),finished=clock();
    if(!fresh(millis(source.source.checkedAt),finished)||!fresh(millis(plan.checkedAt),finished))fail('RETENTION_FRESH_OWN_SOURCE_REQUIRED');
    const previous=entry(store,candidate.dedupKey);
    const value={guard:RETENTION_DELIVERY_PROOF_GUARD,company:'fumigacion',candidate,actorId:source.source.actorId,clientId:source.source.clientId,lastCompletedOrderId:source.source.lastCompletedOrderId,anchorAt:iso(millis(source.source.anchorAt)),sourceCheckedAt:iso(millis(source.source.checkedAt)),revision:after.conv.revision,outboxId:after.outbox.id,caseId:after.outbox.case_id,preparedAt};
    if(!Number.isFinite(value.preparedAt)||value.preparedAt>at||after.outbox.created<value.preparedAt)fail('RETENTION_OWN_OUTBOX_ASSOCIATION_REQUIRED');
    if(previous){const {sourceCheckedAt:oldChecked,...oldValue}=previous.value,{sourceCheckedAt:newChecked,...newValue}=value;if(!same(oldValue,newValue))fail('RETENTION_CYCLE_ALREADY_RESERVED');return {guard:RETENTION_DELIVERY_PROOF_GUARD,cycleKey:previous.cycle_key,state:previous.state,duplicate:true,sends:0,programNotesWritten:0};}
    store.tx(()=>{
      store.db.prepare('INSERT INTO retention_cycles VALUES(?,?,?,?,?,?)').run(candidate.dedupKey,after.outbox.id,'PREPARED',finished,finished,store.seal(value));
      store.db.prepare('INSERT INTO retention_delivery_ledger(cycle_key,at,state,reason,body) VALUES(?,?,?,?,?)').run(candidate.dedupKey,finished,'PREPARED','OWN_APPROVED_CYCLE',store.seal({outboxId:after.outbox.id,sourceCheckedAt:value.sourceCheckedAt,businessWrites:0,sends:0}));
    });
    return {guard:RETENTION_DELIVERY_PROOF_GUARD,cycleKey:candidate.dedupKey,state:'PREPARED',duplicate:false,sends:0,programNotesWritten:0};
  };
  const deliveryProof=async(body,fetcher)=>{
    const at=clock();scope(config,store);
    if(!body||Object.keys(body).sort().join(',')!=='company,key'||body.company!=='fumigacion'||!cyclePattern.test(body.key??''))return pending('RETENTION_PROOF_KEY_ONLY_REQUIRED');
    const cycle=entry(store,body.key);if(!cycle)return pending('RETENTION_OWN_CYCLE_NOT_FOUND',body.key);
    try{
      if(!candidateValid(cycle.value.candidate)||cycle.value.company!=='fumigacion')fail('RETENTION_OWN_CYCLE_SCOPE_REQUIRED');
      const candidate=cycle.value.candidate,before=localState(config,store,candidate,cycle.value.revision);
      if(!['DELIVERED','READ'].includes(before.outbox.state)||!identifier.test(before.outbox.mid??''))fail('RETENTION_LOCAL_DELIVERY_PENDING');
      const source=await eligibleSource(config,candidate,loadEligibility,clock,{cycle,outbox:before.outbox});
      if(source.source.clientId!==cycle.value.clientId||source.source.actorId!==cycle.value.actorId)fail('RETENTION_OWN_CLIENT_CHANGED');
      const native=await nativeDelivery(config,fetcher?new Transport(config,fetcher):transport,before.outbox,candidate,cycle.value.preparedAt,clock);
      const after=localState(config,store,candidate,cycle.value.revision),checkedAt=clock();
      if(after.outbox.mid!==before.outbox.mid||after.outbox.state!==before.outbox.state||config.mariaProgram?.actorId!==cycle.value.actorId||!fresh(millis(source.source.checkedAt),checkedAt)||!fresh(millis(native.checkedAt),checkedAt)||!fresh(at,checkedAt))fail('RETENTION_PROOF_RECHECK_CHANGED');
      const proof={guard:RETENTION_DELIVERY_PROOF_GUARD,company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId:cycle.value.actorId,clientId:cycle.value.clientId,phone:candidate.phone,line:candidate.line,lastCompletedOrderId:cycle.value.lastCompletedOrderId,anchorAt:cycle.value.anchorAt,anchorKind:'COMPLETED_SERVICE',daysSinceAnchor:source.approved.ageDays,cycleKey:body.key,eligible:true,checkedAt:iso(checkedAt),wholeSourceEligibility:source.wholeSourceEligibility,native};
      ledger(store,cycle,'PROVEN','EXACT_FRESH_NATIVE_DELIVERY',{proof,businessWrites:0,sends:0},checkedAt);return proof;
    }catch(error){const reason=reasonOf(error);ledger(store,cycle,'PROOF_PENDING',reason,{businessWrites:0,sends:0},clock());return pending(reason,body.key);}
  };
  return {prepareCycle,deliveryProof,status:()=>retentionDeliveryStatus(config,store,{eligibilityAdapterConnected:connected()})};
}
