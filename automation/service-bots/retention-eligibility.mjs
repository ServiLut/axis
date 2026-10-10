import {createHash} from 'node:crypto';
import {BUSINESSES,knownInternalRecipient} from './config.mjs';
import {MARIA_COMPANY,MARIA_TENANT,MARIA_PROGRAM_URL} from './maria-program.mjs';
import {programSupervisionStatus,readRetentionCandidates} from './program-supervision.mjs';
import {intakeJournalStatus,INTAKE_JOURNAL_GUARD} from './intake-journal.mjs';
import {operationalLineAllowed,operationalCoverage} from './line-scope.mjs';
import {planPreventiveRetention,PREVENTIVE_RETENTION_AUTHORIZATION} from './preventive-retention.mjs';
import {RETENTION_SOURCE_GUARD,RETENTION_DELIVERY_PROOF_GUARD,retentionCycleKey,retentionOutboxId,retentionCaseId,retentionOutboxContextKey} from './retention-delivery.mjs';

export const RETENTION_ELIGIBILITY_ADAPTER_GUARD='own-fumigacion-crossed-retention-eligibility-readonly-v1';
export const RETENTION_NATIVE_HISTORY_GUARD='own-fumigacion-retention-native-history-readonly-v1';
export const RETENTION_ELIGIBILITY_PLAN_GUARD='own-fumigacion-retention-plan-source-v1';
const PROGRAM_GUARD='own-fumigacion-daily-readonly-program-snapshot-v1';
const DISPATCH_GUARD='own-staged-fresh-retention-dispatch-and-key-only-note-v1';
const PN=/^57\d{10}$/,ID=/^[A-Za-z0-9:_-]{1,160}$/;
const time=v=>typeof v==='number'&&Number.isSafeInteger(v)?v:typeof v==='string'?Date.parse(v):NaN;
const iso=v=>new Date(v).toISOString();
const day=v=>new Date(v).toLocaleDateString('sv-SE',{timeZone:'America/Bogota'});
const freshness=(value,now)=>Number.isFinite(time(value))&&time(value)<=now&&now-time(value)<=120000;
const table=(s,name)=>Boolean(s.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
const fail=reason=>{throw Error(reason);};
const boundedReason=e=>/^RETENTION_[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'RETENTION_SOURCE_READ_UNAVAILABLE';
const digest=v=>createHash('sha256').update(String(v)).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const historyRange=now=>({from:Date.parse(day(now)+'T05:00:00Z')-90*86400000,to:now});
const readScope=(c,r)=>r?.guard===PROGRAM_GUARD&&r.company==='FUMIGACION'&&r.tenantId===MARIA_TENANT&&r.companyId===MARIA_COMPANY&&r.advisorMembershipId===c.mariaProgram?.actorId&&r.readOnly===true;
function ownRuntime(c,s){
 if(c.company!=='fumigacion'||s.company!==c.company||!Array.isArray(c.lines)||c.lines.length!==2||new Set(c.lines.map(l=>l.phone)).size!==2||c.lines.some(l=>!BUSINESSES.fumigacion.phones.includes(l.phone)))fail('RETENTION_OWN_RUNTIME_SCOPE_REQUIRED');
}
function programReady(c,now){
 const p=c.mariaProgram,a=c.programSupervision;
 return programSupervisionStatus(c).enabled&&p?.enabled===true&&Number.isFinite(p.startsAt)&&Number.isFinite(p.expiresAt)&&p.startsAt<=now&&now<p.expiresAt&&a?.startsAt<=now&&now<a?.expiresAt;
}

/** Exact readonly route. The registration, admin and proof credentials are never used. */
export async function readOwnRetentionProgramContactHistory(config,fetcher,{phone},now=Date.now()){
 if(!PN.test(phone??'')||!programReady(config,now)||typeof fetcher!=='function')fail('RETENTION_SEPARATE_PROGRAM_READ_ACCESS_REQUIRED');
 const url=MARIA_PROGRAM_URL+'/operational-audit/contact-audit';
 const result=await fetcher(url,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.programSupervision.token,'Content-Type':'application/json'},body:JSON.stringify({phones:[phone]}),signal:AbortSignal.timeout(20000)});
 if(!result.ok)fail('RETENTION_PROGRAM_HISTORY_NOT_VERIFIED');
 const raw=await result.json(),data=raw?.success===true?raw.data:raw;
 if(!programReady(config,Date.now())||!readScope(config,data)||!freshness(data.checkedAt,Date.now()))fail('RETENTION_PROGRAM_HISTORY_SCOPE_REQUIRED');
 return data;
}

/** Reads provider-cache facts safely. Cache pagination is not a synchronization proof. */
export async function readOwnRetentionNativeHistory(config,transport,{phone,from,to}){
 const authorized=historyRange(Date.now());
 if(config.company!=='fumigacion'||!PN.test(phone??'')||!Number.isFinite(from)||!Number.isFinite(to)||from>to||from<authorized.from||to>authorized.to)fail('RETENTION_AUTHORIZED_HISTORICAL_READ_RANGE_REQUIRED');
 if(transport?.config!==config||typeof transport.verifyLine!=='function'||typeof transport.request!=='function')fail('RETENTION_OWN_NATIVE_TRANSPORT_REQUIRED');
 if(config.lines.some(l=>!operationalLineAllowed(config,l.phone)))fail('RETENTION_BOTH_LINES_HISTORY_PENDING_SUSPENDED');
 const sources=new Map(),checks=[];
 for(const line of config.lines){
  const binding=await transport.verifyLine(line.phone);
  if(binding?.ownerVerified!==true||binding.phone!==line.phone||binding.instance!==line.instance||binding.open!==true)fail('RETENTION_NATIVE_HISTORY_OWNER_REQUIRED');
  for(const addressField of ['remoteJid','remoteJidAlt']){
   let total=null,read=0;const mids=new Set();
   for(let page=1;page<=20;page++){
    const result=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{[addressField]:phone+'@s.whatsapp.net'},messageTimestamp:{gte:iso(from),lte:iso(to)}},offset:100,page});
    const value=result?.messages;
    if(!value||!Number.isSafeInteger(value.total)||value.total<0||value.total>2000||!Array.isArray(value.records)||value.records.length>100||total!==null&&total!==value.total)fail('RETENTION_NATIVE_CACHE_PAGINATION_UNVERIFIED');
    total=value.total;read+=value.records.length;
    for(const r of value.records){
     const key=r.key??{},at=Number(r.messageTimestamp)*1000,addresses=[key.remoteJid,key.remoteJidAlt].filter(Boolean),phones=addresses.filter(a=>PN.test(String(a).split('@')[0])&&a.endsWith('@s.whatsapp.net'));
     if(!ID.test(key.id??'')||key[addressField]!==phone+'@s.whatsapp.net'||typeof key.fromMe!=='boolean'||!addresses.every(a=>/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(a))||phones.some(a=>a!==phone+'@s.whatsapp.net')||!Number.isFinite(at)||at<from||at>to||mids.has(key.id))fail('RETENTION_NATIVE_CACHE_IDENTITY_OR_RANGE_REQUIRED');
     mids.add(key.id);
     const m=r.message?.ephemeralMessage?.message??r.message??{},text=m.conversation??m.extendedTextMessage?.text??null,media=Boolean(m.audioMessage||m.imageMessage||m.videoMessage||m.documentMessage),context=m.extendedTextMessage?.contextInfo??r.contextInfo??{};
     const source={sourceId:key.id,phone,line:line.phone,at,fromMe:key.fromMe,nativeBindingVerified:true,forwarded:Boolean(context.isForwarded||context.forwardingScore>0),literalText:typeof text==='string'?text:null,media,interpretation:null,deleted:[r.status,...(r.MessageUpdate??[]).map(u=>u.status)].includes('DELETED')};
     const id=line.phone+':'+key.id,previous=sources.get(id);
     if(previous&&JSON.stringify(previous)!==JSON.stringify(source))fail('RETENTION_NATIVE_CACHE_SOURCE_CONFLICT');sources.set(id,source);
    }
    if(read===total)break;
    if(read>total||!value.records.length||page===20)fail('RETENTION_NATIVE_CACHE_PAGINATION_UNVERIFIED');
   }
   checks.push({line:line.phone,instance:line.instance,addressField,total,read,ownerVerified:true,cachePageComplete:read===total});
  }
 }
 return {guard:RETENTION_NATIVE_HISTORY_GUARD,company:'fumigacion',phone,from,to,checkedAt:iso(Date.now()),authorization:PREVENTIVE_RETENTION_AUTHORIZATION,sources:[...sources.values()],checks,lines:config.lines.map(l=>({line:l.phone,connected:true,suspended:false,complete:false})),coverage:{providerCachePagesComplete:true,bothLinesHistoryComplete:false,providerSyncProven:false,semanticReviewComplete:false,globalNoContactStatusComplete:false,originalMediaReviewComplete:false,priorRangeNoContactStatusProven:false},globalStatus:null,originalLine:null,originalLineVerified:false,readOnly:true};
}

function localAttempts(s,phone,{cycleKey,now}){
 if(!table(s,'outbox'))return [];
 const cycles=new Map(table(s,'retention_cycles')?s.db.prepare('SELECT c.* FROM retention_cycles c JOIN outbox o ON o.id=c.outbox_id WHERE o.phone=? AND o.internal=0').all(phone).map(r=>[r.cycle_key,{...r,value:s.open(r.body)}]):[]);
 const dispatches=new Map(table(s,'retention_dispatch')?s.db.prepare("SELECT d.* FROM retention_dispatch d JOIN outbox o ON o.id=d.cycle_key||':retention' WHERE o.phone=? AND o.internal=0").all(phone).map(r=>[r.cycle_key,{...r,value:s.open(r.body)}]):[]);
 const conversation=s.conversation(phone),exactOutboxId=retentionOutboxId(cycleKey),exactCaseId=retentionCaseId(cycleKey);
 const contextRow=s.db.prepare('SELECT value FROM meta WHERE key=?').get(retentionOutboxContextKey(cycleKey)),context=contextRow?s.open(contextRow.value):null;
 const cycle=cycles.get(cycleKey),dispatch=dispatches.get(cycleKey);
 const attempted=table(s,'retention_dispatch_ledger')&&Boolean(s.db.prepare("SELECT 1 FROM retention_dispatch_ledger WHERE cycle_key=? AND state NOT IN ('STAGED','PREPARED') LIMIT 1").get(cycleKey))||table(s,'retention_delivery_ledger')&&Boolean(s.db.prepare("SELECT 1 FROM retention_delivery_ledger WHERE cycle_key=? AND state<>'PREPARED' LIMIT 1").get(cycleKey));
 return s.db.prepare("SELECT * FROM outbox WHERE phone=? AND internal=0 AND id LIKE 'preventive-retention-fumigacion-%-v1:retention'").all(phone).filter(o=>{
  // A fresh durable reservation cannot be sent and has never produced a MID.
  // Only this request's exact reservation is omitted, never an earlier attempt.
  const candidate=dispatch?.value?.candidate,text=s.open(o.body);
  const exactContext=context?.guard===RETENTION_DELIVERY_PROOF_GUARD&&context.company==='fumigacion'&&context.cycleKey===cycleKey&&context.outboxId===o.id&&context.caseId===o.case_id&&context.phone===phone&&context.line===o.line&&context.textHash===digest(text)&&context.revision===o.revision&&(conversation?.state.caseId??null)===context.conversationCaseId;
  const exactDispatch=['STAGED','PREPARED'].includes(dispatch?.state)&&dispatch.value?.guard===DISPATCH_GUARD&&dispatch.value.company==='fumigacion'&&same(dispatch.value.context,context)&&candidate?.company==='fumigacion'&&candidate.phone===phone&&candidate.line===o.line&&candidate.dedupKey===cycleKey&&candidate.sourceAnchorKind==='completed-service'&&cycleKey===retentionCycleKey(phone,candidate.sourceAnchorId)&&candidate.text===text&&candidate.textHash===digest(text)&&freshness(candidate.preparedAt,now);
  const exactCycle=!cycle||cycle.state==='PREPARED'&&cycle.value?.guard===RETENTION_DELIVERY_PROOF_GUARD&&cycle.value.company==='fumigacion'&&cycle.outbox_id===o.id&&cycle.value.outboxId===o.id&&cycle.value.caseId===o.case_id&&cycle.value.revision===o.revision&&same(cycle.value.candidate,candidate);
  return !(o.id===exactOutboxId&&o.state==='RETENTION_STAGED'&&o.mid===null&&o.case_id===exactCaseId&&conversation?.line===o.line&&conversation.revision===o.revision&&freshness(o.created,now)&&exactContext&&exactDispatch&&exactCycle&&!attempted);
 }).map(o=>{
  const dedupKey=o.id.slice(0,-10),anchor=cycles.get(dedupKey)?.value?.candidate??dispatches.get(dedupKey)?.value?.candidate;
  return {company:'fumigacion',phone,line:o.line,dedupKey,sourceAnchorId:anchor?.sourceAnchorId??null,outboxId:o.id,caseId:o.case_id,mid:o.mid,state:o.state};
 });
}
function journalProof(config,store,{from,to}){
 const observed=intakeJournalStatus(store,config);
 return {...observed,company:'fumigacion',from,to,checkedAt:iso(Date.now()),readOnly:true};
}
function fullJournal(c,j,range,now){
 return j?.guard===INTAKE_JOURNAL_GUARD&&j.company===c.company&&j.readOnly===true&&j.from===range.from&&j.to===range.to&&freshness(j.checkedAt,now)&&j.historicalCoverageComplete===true&&j.allWhatsAppTrafficComplete===true&&Number.isFinite(j.installedFrom)&&j.installedFrom<=range.from;
}
function fullNative(c,n,range,phone,now){
 return n?.guard===RETENTION_NATIVE_HISTORY_GUARD&&n.company===c.company&&n.phone===phone&&n.from===range.from&&n.to===range.to&&n.readOnly===true&&freshness(n.checkedAt,now)&&Array.isArray(n.sources)&&Array.isArray(n.lines)&&BUSINESSES.fumigacion.phones.every(line=>n.lines.filter(l=>l.line===line).length===1&&n.lines.find(l=>l.line===line).complete===true&&n.lines.find(l=>l.line===line).connected===true&&n.lines.find(l=>l.line===line).suspended===false&&n.lines.find(l=>l.line===line).ownerVerified===true&&n.lines.find(l=>l.line===line).instance===c.lines.find(l=>l.phone===line).instance)&&n.coverage?.bothLinesHistoryComplete===true&&n.coverage.providerSyncProven===true&&n.coverage.semanticReviewComplete===true&&n.coverage.globalNoContactStatusComplete===true&&n.coverage.originalMediaReviewComplete===true;
}
const closed=new Set(['TECNICO_FINALIZO','LIQUIDADO']);
const cancelled=new Set(['CANCELADO','SIN_CONCRETAR']);
const states=new Set(['NUEVO','PROCESO','CANCELADO','PROGRAMADO','LIQUIDADO','TECNICO_FINALIZO','REPROGRAMADO','SIN_CONCRETAR']);
function orderFacts(data,phone,clientId,now){
 const searched=data.searchedContacts;
 if(!Array.isArray(searched)||searched.length!==1||searched[0].phone!==phone||searched[0].complete!==true||searched[0].identityAmbiguous!==false||!Array.isArray(searched[0].clientIds)||searched[0].clientIds.length!==1||searched[0].clientIds[0]!==clientId||!Array.isArray(searched[0].orderIds)||searched[0].orderIds.some(id=>!ID.test(id??''))||new Set(searched[0].orderIds).size!==searched[0].orderIds.length||data.coverage?.contactSearchComplete!==true||data.coverage.noncanonicalPhoneFieldsCovered!==true||data.coverage.integrityConflicts!==false||!Array.isArray(data.orders))fail('RETENTION_UNIQUE_COMPLETE_PROGRAM_CONTACT_REQUIRED');
 const orders=[],ids=new Set();
 for(const r of data.orders){
  if(!ID.test(r.id??'')||ids.has(r.id)||r.clientId!==clientId||r.contactScopeVerified!==true||!Array.isArray(r.canonicalContacts)||r.canonicalContacts.length!==1||r.canonicalContacts[0]!==phone||!states.has(r.state)||!Number.isFinite(time(r.createdAt))||time(r.createdAt)>now||r.scheduledAt!==null&&!Number.isFinite(time(r.scheduledAt))||r.deletedAt!==null&&!Number.isFinite(time(r.deletedAt)))fail('RETENTION_PROGRAM_ORDER_IDENTITY_OR_DATES_REQUIRED');
  ids.add(r.id);orders.push(r);
 }
 if(!same([...ids].sort(),[...searched[0].orderIds].sort()))fail('RETENTION_PROGRAM_ORDER_HISTORY_INCOMPLETE');
 if(orders.some(r=>r.deletedAt!==null&&time(r.deletedAt)>now))fail('RETENTION_PROGRAM_ORDER_IDENTITY_OR_DATES_REQUIRED');
 const completed=orders.filter(r=>closed.has(r.state));
 if(completed.some(r=>r.deletedAt!==null||!Number.isFinite(time(r.actualStartedAt))||!Number.isFinite(time(r.actualFinishedAt))||time(r.actualStartedAt)<time(r.createdAt)||time(r.actualFinishedAt)<time(r.actualStartedAt)||time(r.actualFinishedAt)>now))fail('RETENTION_COMPLETION_OR_CORRECTION_REQUIRES_REVIEW');
 return {orders,completed:completed.sort((a,b)=>time(b.actualFinishedAt)-time(a.actualFinishedAt)),active:orders.filter(r=>r.deletedAt===null&&!closed.has(r.state)&&!cancelled.has(r.state)),recentBookingMetadata:orders.some(r=>r.deletedAt===null&&(time(r.createdAt)>=now-30*86400000||Number.isFinite(time(r.scheduledAt))&&time(r.scheduledAt)>=now-30*86400000)),future:orders.filter(r=>r.deletedAt===null&&Number.isFinite(time(r.scheduledAt))&&time(r.scheduledAt)>=now)};
}
function nativeFacts(n,phone,range,store,orderId){
 if(n.originalLineVerified!==true||!BUSINESSES.fumigacion.phones.includes(n.originalLine)||typeof n.globalStatus?.optOutGlobal!=='boolean'||typeof n.globalStatus?.doNotContact!=='boolean')fail('RETENTION_NATIVE_ORIGIN_OR_GLOBAL_STATUS_REQUIRED');
 if(n.origin?.verified!==true||n.origin.orderId!==orderId||n.origin.phone!==phone||n.origin.line!==n.originalLine||!n.sources.some(s=>s.sourceId===n.origin.sourceId&&s.phone===phone&&s.line===n.originalLine&&s.fromMe===false&&s.forwarded!==true))fail('RETENTION_NATIVE_ORIGIN_SOURCE_REQUIRED');
 const bookingInteractions=[],rejections=[],futureBookings=[];const ids=new Set();
 for(const s of n.sources){
  const sourceKey=s.line+':'+s.sourceId;
  if(!ID.test(s.sourceId??'')||ids.has(sourceKey)||s.phone!==phone||!BUSINESSES.fumigacion.phones.includes(s.line)||s.nativeBindingVerified!==true||typeof s.fromMe!=='boolean'||!Number.isFinite(time(s.at))||time(s.at)<range.from||time(s.at)>range.to||s.deleted===true||s.edited===true||s.media===true&&s.originalReviewed!==true)fail('RETENTION_NATIVE_SOURCE_IDENTITY_OR_CORRECTION_REQUIRED');
  ids.add(sourceKey);
  const interpretation=s.interpretation;
  if(!interpretation||interpretation.verified!==true||interpretation.sourceId!==s.sourceId||interpretation.phone!==phone||interpretation.line!==s.line||typeof s.literalText!=='string'||interpretation.literalText!==s.literalText||!['neutral','booking-request','booking-confirmation','reschedule-request','refusal','do-not-contact'].includes(interpretation.kind))fail('RETENTION_NATIVE_INTERPRETATION_NOT_VERIFIED');
  if(s.fromMe){
   if(!store.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(s.sourceId,phone,s.line))fail('RETENTION_NATIVE_STAFF_ATTENTION_REQUIRES_REVIEW');
   if(interpretation.kind!=='neutral')fail('RETENTION_NATIVE_OUTGOING_INTERPRETATION_REQUIRED');continue;
  }
  if(s.forwarded===true&&interpretation.kind!=='neutral')fail('RETENTION_FORWARDED_OPERATION_REQUIRES_REVIEW');
  const fact={phone,line:s.line,sourceId:s.sourceId,at:iso(time(s.at)),nativeBindingVerified:true,fromMe:false,forwarded:s.forwarded===true,kind:interpretation.kind};
  if(['booking-request','booking-confirmation','reschedule-request'].includes(fact.kind))bookingInteractions.push(fact);
  if(['refusal','do-not-contact'].includes(fact.kind))rejections.push(fact);
  if(interpretation.futureBooking){
   const b=interpretation.futureBooking;
   if(b.verified!==true||!Number.isFinite(time(b.scheduledAt))||!['NUEVO','PROGRAMADO','CONFIRMADO','CANCELADO'].includes(b.state)||typeof b.cancelled!=='boolean'||b.cancelled!==(b.state==='CANCELADO'))fail('RETENTION_NATIVE_FUTURE_BOOKING_REQUIRES_REVIEW');
   futureBookings.push({company:'FUMIGACION',phone,scopeVerified:true,scheduledAt:iso(time(b.scheduledAt)),state:b.state,cancelled:b.cancelled});
  }
 }
 return {bookingInteractions,rejections,futureBookings};
}

/** Dependencies are trusted internal readers supplied by server wiring, never request bodies.
 * Default provider reads retain cache/sync limits; no sending, note, hold or business write. */
export function createRetentionEligibilityAdapter(config,store,transport,{now=Date.now,fetcher=transport?.fetcher,readProgramCandidatePage=readRetentionCandidates,readProgramContactHistory=readOwnRetentionProgramContactHistory,readNativeHistory=readOwnRetentionNativeHistory,readJournalCoverage=journalProof}={}){
 ownRuntime(config,store);
 let lastCheck=null,lastPlan=null;
 const clock=()=>{const t=now();if(!Number.isSafeInteger(t))fail('RETENTION_TIME_REQUIRED');return t;};
 const loadEligibility=async request=>{
  const at=clock(),base={guard:RETENTION_SOURCE_GUARD,company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId:config.mariaProgram?.actorId??null,clientId:null,phone:request?.phone??null,lastCompletedOrderId:request?.lastCompletedOrderId??null,anchorKind:'COMPLETED_SERVICE',anchorAt:null,canonicalRecipientUniqueVerified:false,checkedAt:iso(at),pending:true,readOnly:true,sends:0,businessWrites:0};
  const pending=reason=>{lastCheck={checkedAt:iso(clock()),complete:false,bothLinesHistoryComplete:false,reason};return {...base,checkedAt:lastCheck.checkedAt,reason};};
  try{
   ownRuntime(config,store);
   if(!request||Object.keys(request).some(k=>!['company','phone','cycleKey','lastCompletedOrderId','now'].includes(k))||request.company!=='fumigacion'||!PN.test(request.phone??'')||knownInternalRecipient(request.phone))return pending('RETENTION_OWN_CANDIDATE_REQUEST_REQUIRED');
   if(!ID.test(request.lastCompletedOrderId??''))return pending('RETENTION_COMPLETED_SERVICE_PROOF_REQUIRED');
   if(request.cycleKey!==retentionCycleKey(request.phone,request.lastCompletedOrderId))return pending('RETENTION_OWN_CANDIDATE_REQUEST_REQUIRED');
   if(config.enabled!==true||!programReady(config,at))return pending('RETENTION_SEPARATE_PROGRAM_READ_ACCESS_REQUIRED');
   if(config.lines.some(l=>!operationalLineAllowed(config,l.phone)))return pending('RETENTION_BOTH_LINES_HISTORY_PENDING_SUSPENDED');
   const range=historyRange(at);
   let cursor=null,customer=null;const cursors=new Set();
   for(let i=0;i<100;i++){
    const page=await readProgramCandidatePage(config,fetcher,{asOfDay:day(at),...(cursor?{cursor}:{}),limit:100});
    if(!readScope(config,page)||page.asOfDay!==day(at)||!freshness(page.checkedAt,clock())||!Array.isArray(page.customers)||page.page?.cursor!==cursor||typeof page.page.hasMore!=='boolean')fail('RETENTION_PROGRAM_CANDIDATE_PAGE_REQUIRED');
    for(const row of page.customers){
     if(!Array.isArray(row.canonicalContacts)||!row.canonicalContacts.includes(request.phone))continue;
     if(customer&&customer.clientId!==row.clientId||!ID.test(row.clientId??'')||row.contactScopeVerified!==true||row.canonicalContacts.length!==1)fail('RETENTION_PROGRAM_CONTACT_ALIAS_OR_CONFLICT');customer=row;
    }
    if(!page.page.hasMore){if(page.page.nextCursor!==null)fail('RETENTION_PROGRAM_CANDIDATE_PAGE_REQUIRED');break;}
    if(!ID.test(page.page.nextCursor??'')||cursors.has(page.page.nextCursor)||i===99)fail('RETENTION_PROGRAM_CANDIDATE_PAGINATION_PENDING');cursors.add(page.page.nextCursor);cursor=page.page.nextCursor;
   }
   if(!customer)return pending('RETENTION_PROGRAM_CLIENT_NOT_VERIFIED');
   base.clientId=customer.clientId;
   const program=await readProgramContactHistory(config,fetcher,{phone:request.phone},clock());
   if(!readScope(config,program)||!freshness(program.checkedAt,clock()))fail('RETENTION_PROGRAM_HISTORY_SCOPE_REQUIRED');
   const facts=orderFacts(program,request.phone,customer.clientId,clock()),latest=facts.completed[0];
   if(!latest)return pending('RETENTION_COMPLETED_SERVICE_PROOF_REQUIRED');
   if(latest.id!==request.lastCompletedOrderId||customer.lastCompletedOrder?.orderId!==latest.id||time(customer.lastCompletedOrder.actualFinishedAt)!==time(latest.actualFinishedAt))return pending('RETENTION_LAST_COMPLETION_CHANGED');
   base.anchorAt=iso(time(latest.actualFinishedAt));
   const journal=await readJournalCoverage(config,store,range);
   if(!fullJournal(config,journal,range,clock()))return pending('RETENTION_JOURNAL_HISTORICAL_COVERAGE_PENDING');
   const native=await readNativeHistory(config,transport,{phone:request.phone,...range});
   if(!fullNative(config,native,range,request.phone,clock()))return pending('RETENTION_BOTH_LINES_SYNC_OR_REVIEW_PENDING');
   const conversation=store.conversation(request.phone),current=conversation?.state??{},nativeFact=nativeFacts(native,request.phone,range,store,latest.id);
   if(config.enabled!==true||base.actorId!==config.mariaProgram?.actorId||!programReady(config,clock())||config.lines.some(l=>!operationalLineAllowed(config,l.phone))||!freshness(program.checkedAt,clock())||!freshness(native.checkedAt,clock())||!freshness(journal.checkedAt,clock()))return pending('RETENTION_SOURCE_CHANGED_OR_EXPIRED');
   const completion=[latest].map(r=>({company:'FUMIGACION',phone:request.phone,clientId:customer.clientId,orderId:r.id,sourceId:r.id,completedAt:iso(time(r.actualFinishedAt)),completedVerified:true,originLine:native.originalLine,originLineVerified:true}));
   const future=facts.future.map(r=>({company:'FUMIGACION',phone:request.phone,scopeVerified:true,scheduledAt:iso(time(r.scheduledAt)),state:cancelled.has(r.state)?'CANCELADO':closed.has(r.state)?'REALIZADO':r.state==='PROCESO'?'EN_PROCESO':r.state==='REPROGRAMADO'?'PROGRAMADO':r.state,cancelled:cancelled.has(r.state)}));
   const contact={phone:request.phone,identity:{kind:'PN',phone:request.phone,bindingVerified:true},contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true,optOutGlobal:native.globalStatus.optOutGlobal||current.optOutGlobal===true,doNotContact:native.globalStatus.doNotContact||current.doNotContact===true,humanHold:Boolean(conversation?.hold||current.humanHold||current.awaitingHumanReview),activeCase:facts.active.length>0||facts.recentBookingMetadata||Boolean(current.activeCase),pendingVisit:facts.future.some(r=>!cancelled.has(r.state)),pendingQuotation:Boolean(current.pendingQuotation),completedServices:completion,bookingInteractions:nativeFact.bookingInteractions,futureBookings:[...future,...nativeFact.futureBookings],rejections:nativeFact.rejections};
   if(customer.name?.literalComplete===true){const value=[customer.name.nombre,customer.name.apellido].filter(v=>typeof v==='string'&&v.trim()).join(' ').trim();if(value)contact.name={value,phone:request.phone,verified:true,sourceId:customer.clientId};}
   const coverage={whatsapp:{contactHistoryComplete:true,lines:native.lines},program:{company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true}},history=localAttempts(store,request.phone,{cycleKey:request.cycleKey,now:clock()});
   const plannerInput={coverage,contacts:[contact],history};
   const diagnostic=planPreventiveRetention({company:'fumigacion',day:day(clock()),now:clock(),...plannerInput});
   if(diagnostic.prepared.some(c=>c.sourceAnchorKind==='booking-interaction'))return pending('RETENTION_BOOKING_ANCHOR_PROOF_UNSUPPORTED');
   const checkedAt=iso(clock());lastCheck={checkedAt,complete:true,bothLinesHistoryComplete:true,reason:diagnostic.prepared.length?'RETENTION_SOURCE_VERIFIED':diagnostic.deferred[0]?.reason??diagnostic.excluded[0]?.reason??'RETENTION_CANDIDATE_EXCLUDED'};
   return {...base,canonicalRecipientUniqueVerified:true,checkedAt,pending:false,plannerInput,coverageComplete:true,reason:lastCheck.reason};
  }catch(error){return pending(boundedReason(error));}
 };
 const loadPlan=async request=>{
  const at=clock();ownRuntime(config,store);
  if(!request||Object.keys(request).some(k=>!['company','day','cursor','now'].includes(k))||request.company!=='fumigacion'||request.day!==day(at)||request.cursor!==null&&!ID.test(request.cursor??''))fail('RETENTION_OWN_PLAN_REQUEST_REQUIRED');
  if(config.enabled!==true||!programReady(config,at))fail('RETENTION_SEPARATE_PROGRAM_READ_ACCESS_REQUIRED');
  if(config.lines.some(l=>!operationalLineAllowed(config,l.phone)))fail('RETENTION_BOTH_LINES_HISTORY_PENDING_SUSPENDED');
  const page=await readProgramCandidatePage(config,fetcher,{asOfDay:request.day,...(request.cursor?{cursor:request.cursor}:{}),limit:25});
  if(!readScope(config,page)||page.asOfDay!==request.day||!freshness(page.checkedAt,clock())||!Array.isArray(page.customers)||page.customers.length>25||page.page?.cursor!==request.cursor||typeof page.page.hasMore!=='boolean'||page.page.hasMore&&(!ID.test(page.page.nextCursor??'')||page.page.nextCursor===request.cursor)||!page.page.hasMore&&page.page.nextCursor!==null)fail('RETENTION_PROGRAM_CANDIDATE_PAGE_REQUIRED');
  const contacts=[],history=[],pendingContacts=[];let coverage=null;
  for(const customer of page.customers){
   const phones=customer.canonicalContacts,phone=phones?.length===1?phones[0]:null,orderId=customer.lastCompletedOrder?.orderId;
   if(!PN.test(phone??'')||knownInternalRecipient(phone)||!ID.test(orderId??'')){pendingContacts.push({phone:PN.test(phone??'')?phone:null,reason:'RETENTION_PROGRAM_CONTACT_ALIAS_OR_COMPLETION_PENDING'});continue;}
   const source=await loadEligibility({company:'fumigacion',phone,lastCompletedOrderId:orderId,cycleKey:retentionCycleKey(phone,orderId)});
   if(source.pending||!source.plannerInput){pendingContacts.push({phone,reason:source.reason});continue;}
   contacts.push(...source.plannerInput.contacts);history.push(...source.plannerInput.history);coverage=source.plannerInput.coverage;
  }
  const checked=clock();
  if(request.day!==day(checked)||!freshness(page.checkedAt,checked)||config.enabled!==true||!programReady(config,checked)||config.lines.some(l=>!operationalLineAllowed(config,l.phone)))fail('RETENTION_SOURCE_CHANGED_OR_EXPIRED');
  coverage??={whatsapp:{contactHistoryComplete:false,lines:config.lines.map(l=>({line:l.phone,connected:operationalLineAllowed(config,l.phone),suspended:!operationalLineAllowed(config,l.phone),complete:false}))},program:{company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,contactHistoryComplete:false,futureBookingsComplete:false,noContactStatusComplete:false}};
  const plan=planPreventiveRetention({company:'fumigacion',day:request.day,now:checked,coverage,contacts,history});
  plan.deferred.push(...pendingContacts.map(p=>({phone:p.phone,state:'DEFERRED',reason:p.reason})));plan.coveragePendingContacts=pendingContacts.length;
  const nextCursor=page.page.hasMore?page.page.nextCursor:null,complete=nextCursor===null,checkedAt=iso(checked);
  lastPlan={day:request.day,checkedAt,complete,paginationVerified:true,prepared:plan.prepared.length,coveragePendingContacts:pendingContacts.length,crossedCoverageComplete:plan.crossedCoverageComplete};
  return {guard:RETENTION_ELIGIBILITY_PLAN_GUARD,company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId:config.mariaProgram.actorId,day:request.day,cursor:request.cursor,nextCursor,complete,checkedAt,plan,readOnly:true,sends:0,businessWrites:0};
 };
 return {loadEligibility,loadPlan,status:()=>({guard:RETENTION_ELIGIBILITY_ADAPTER_GUARD,company:'fumigacion',implemented:true,connected:[readProgramCandidatePage,readProgramContactHistory,readNativeHistory,readJournalCoverage].every(f=>typeof f==='function'),programReadAccessConnected:programSupervisionStatus(config).enabled,bothLinesHistoryComplete:config.enabled===true&&programReady(config,clock())&&config.lines.every(l=>operationalLineAllowed(config,l.phone))&&lastCheck?.bothLinesHistoryComplete===true&&freshness(lastCheck.checkedAt,clock()),lastCheck,lastPlan,operationalCoverage:operationalCoverage(config),sendingEnabled:false,notesEnabled:false,readOnly:true})};
}
