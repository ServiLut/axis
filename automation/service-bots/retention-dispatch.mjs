import {createHash} from 'node:crypto';
import {BUSINESSES,knownInternalRecipient,publicTextSafe} from './config.mjs';
import {MARIA_TENANT,MARIA_COMPANY,MARIA_PROGRAM_URL,programEnabled} from './maria-program.mjs';
import {PREVENTIVE_RETENTION_GUARD,PREVENTIVE_RETENTION_NOTE} from './preventive-retention.mjs';
import {bogotaDayWindow} from './daily-operational-audit.mjs';
import {operationalLineAllowed} from './line-scope.mjs';
import {createRetentionDeliveryRuntime,retentionCycleKey,retentionOutboxId,retentionCaseId,retentionOutboxContextKey,RETENTION_DELIVERY_PROOF_GUARD,RETENTION_PROOF_FRESHNESS_MS} from './retention-delivery.mjs';

export const RETENTION_DISPATCH_GUARD='own-staged-fresh-retention-dispatch-and-key-only-note-v1';
export const RETENTION_PLAN_SOURCE_GUARD='own-fumigacion-retention-plan-source-v1';
export const RETENTION_NOTE_ACCESS_GUARD='own-expiring-separate-fumigacion-retention-note-access-v1';
export const RETENTION_NOTE_URL=MARIA_PROGRAM_URL+'/operational-audit/retention-note';
export const RETENTION_STAGING_STATE='RETENTION_STAGED';
const grantKey='own-retention-note-access';
const keyPattern=/^preventive-retention-fumigacion-[a-f0-9]{40}-v1$/;
const safeId=/^[A-Za-z0-9:_-]{1,160}$/;
const digest=v=>createHash('sha256').update(String(v)).digest('hex');
const iso=v=>new Date(v).toISOString();
const day=v=>new Date(v).toLocaleDateString('sv-SE',{timeZone:'America/Bogota'});
const millis=v=>typeof v==='number'?v:typeof v==='string'?Date.parse(v):NaN;
const fresh=(at,now)=>Number.isFinite(at)&&at<=now&&now-at<=RETENTION_PROOF_FRESHNESS_MS;
const fail=reason=>{throw Error(reason);};
const reasonOf=e=>/^RETENTION_[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'RETENTION_OPERATION_UNCERTAIN';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const held=conv=>!conv||conv.hold||['awaitingHumanReview','humanHold','doNotContact','optOutGlobal','activeCase','pendingVisit','pendingQuotation'].some(k=>conv.state[k]===true);
const pendingLocal=(s,phone)=>Boolean(s.db.prepare("SELECT 1 FROM events WHERE phone=? AND state IN ('PENDING','PROCESSING') LIMIT 1").get(phone));

function ownScope(c,s){
  if(c.company!=='fumigacion'||s.company!==c.company||c.lines?.length!==2||new Set(c.lines.map(l=>l.phone)).size!==2||c.lines.some(l=>!BUSINESSES.fumigacion.phones.includes(l.phone)))fail('RETENTION_OWN_RUNTIME_SCOPE_REQUIRED');
}
function otherHashes(c){return [c.authHash,c.webhookHash,c.retentionProofAccess?.tokenHash,...[c.mariaProgram?.token,c.programSupervision?.token].filter(v=>typeof v==='string').map(digest)];}
function validGrant(c,b){
  const p=c.mariaProgram;
  if(c.company!=='fumigacion'||p?.enabled!==true||!b||Object.keys(b).sort().join(',')!=='actorId,expiresAt,startsAt,token,url'||!safeId.test(b.actorId??'')||b.actorId!==p.actorId||b.url!==RETENTION_NOTE_URL||!/^[A-Za-z0-9_-]{43,128}$/.test(b.token??'')||otherHashes(c).includes(digest(b.token)))fail('RETENTION_SEPARATE_NOTE_ACCESS_REQUIRED');
  const startsAt=millis(b.startsAt),expiresAt=millis(b.expiresAt);
  if(!Number.isFinite(p.startsAt)||!Number.isFinite(p.expiresAt)||!Number.isFinite(startsAt)||!Number.isFinite(expiresAt)||startsAt<p.startsAt||expiresAt>p.expiresAt||startsAt>=expiresAt)fail('RETENTION_NOTE_ACCESS_CUTOFF_REQUIRED');
  return {...b,startsAt,expiresAt};
}
function noteReady(c,at){
  try{const b=validGrant(c,c.retentionNoteAccess);return programEnabled(c,at)&&b.startsAt<=at&&at<b.expiresAt;}catch{return false;}
}
export function retentionNoteAccessStatus(c,now=Date.now()){
  const b=c.retentionNoteAccess;
  return {guard:RETENTION_NOTE_ACCESS_GUARD,configured:Boolean(b),enabled:noteReady(c,now),actorId:b?.actorId??null,expiresAt:Number.isFinite(b?.expiresAt)?iso(b.expiresAt):null,keyOnly:true,appointmentsWritesEnabled:false};
}
export function installRetentionNoteAccess(c,s,body,now=Date.now()){
  ownScope(c,s);const b=validGrant(c,body);
  if(!programEnabled(c,now)||b.startsAt>now||b.expiresAt<=now)fail('RETENTION_NOTE_ACCESS_CUTOFF_REQUIRED');
  s.tx(()=>{s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(grantKey,s.seal(b));s.audit('OWN_RETENTION_NOTE_ACCESS_CONFIGURED',RETENTION_NOTE_ACCESS_GUARD,{actorId:b.actorId,startsAt:b.startsAt,expiresAt:b.expiresAt,businessWrites:0,sends:0});});
  c.retentionNoteAccess=b;return retentionNoteAccessStatus(c,now);
}
export function restoreRetentionNoteAccess(c,s){
  ownScope(c,s);const row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(grantKey);
  if(row){
    const b=s.open(row.value);
    // Keep the original cutoff and actor for review. A later global change
    // disables only this grant; it does not renew access or stop the bot.
    try{c.retentionNoteAccess=validGrant(c,b);}catch{c.retentionNoteAccess=b;}
  }
  return retentionNoteAccessStatus(c);
}
function initialize(c,s){
  ownScope(c,s);
  s.db.exec(`CREATE TABLE IF NOT EXISTS retention_dispatch(
    cycle_key TEXT PRIMARY KEY,day TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS retention_dispatch_day ON retention_dispatch(day,cycle_key);
    CREATE TABLE IF NOT EXISTS retention_dispatch_ledger(
    id INTEGER PRIMARY KEY,cycle_key TEXT NOT NULL,at INTEGER NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,body TEXT NOT NULL,
    FOREIGN KEY(cycle_key) REFERENCES retention_dispatch(cycle_key));`);
}
const read=(s,key)=>{const r=s.db.prepare('SELECT * FROM retention_dispatch WHERE cycle_key=?').get(key);return r?{...r,value:s.open(r.body)}:null;};
function record(s,key,state,reason,at,detail={}){
  s.db.prepare('UPDATE retention_dispatch SET state=?,updated_at=? WHERE cycle_key=?').run(state,at,key);
  s.db.prepare('INSERT INTO retention_dispatch_ledger(cycle_key,at,state,reason,body) VALUES(?,?,?,?,?)').run(key,at,state,reason,s.seal(detail));
}
function input(body,at,queue=false){
  if(!body||typeof body!=='object'||Array.isArray(body)||!['company,day','company,cursor,day'].includes(Object.keys(body).sort().join(','))||body.company!=='fumigacion')fail('RETENTION_DAY_CURSOR_ONLY_REQUIRED');
  bogotaDayWindow(body.day);if(body.day!==day(at))fail('RETENTION_CURRENT_BOGOTA_DAY_REQUIRED');
  const cursor=body.cursor??null;
  if(cursor!==null&&(typeof cursor!=='string'||!(queue?keyPattern:safeId).test(cursor)))fail('RETENTION_CURSOR_REQUIRED');
  return {company:'fumigacion',day:body.day,cursor};
}
function planValid(plan,candidate,at){
  return plan?.guard===PREVENTIVE_RETENTION_GUARD&&plan.company==='fumigacion'&&plan.crossedCoverageComplete===true&&fresh(millis(plan.checkedAt),at)&&plan.day===day(at)&&Array.isArray(plan.prepared)&&plan.prepared.some(c=>same(c,candidate))&&candidate?.guard===plan.guard&&candidate.company===plan.company&&candidate.day===plan.day&&candidate.sourceAnchorKind==='completed-service'&&/^57\d{10}$/.test(candidate.phone??'')&&!knownInternalRecipient(candidate.phone)&&BUSINESSES.fumigacion.phones.includes(candidate.line)&&safeId.test(candidate.sourceAnchorId??'')&&candidate.dedupKey===retentionCycleKey(candidate.phone,candidate.sourceAnchorId)&&typeof candidate.text==='string'&&candidate.text.length<=1000&&publicTextSafe(candidate.text)&&candidate.textHash===digest(candidate.text)&&candidate.sends===0&&candidate.businessWrites===0&&candidate.noteEligible===false;
}
function stageLocal(c,s,candidate,at){
  if(!programEnabled(c,at))fail('RETENTION_RUNTIME_UNAVAILABLE');
  if(!operationalLineAllowed(c,candidate.line))fail('RETENTION_ORIGIN_LINE_UNAVAILABLE');
  const conv=s.conversation(candidate.phone);
  if(conv&&(conv.line!==candidate.line||held(conv)))fail('RETENTION_LOCAL_HOLD_OR_IDENTITY_REVIEW');
  if(pendingLocal(s,candidate.phone))fail('RETENTION_LOCAL_TURN_PENDING');
  if(s.db.prepare("SELECT 1 FROM outbox WHERE phone=? AND internal=0 AND state IN ('READY','RETENTION_STAGED','SENDING','ACCEPTED','UNCERTAIN') LIMIT 1").get(candidate.phone))fail('RETENTION_OTHER_CUSTOMER_OUTBOX_PENDING');
  return conv;
}
function queuePage(s,b,{notes=false}={}){
  // A real delivery can arrive after midnight. Note processing reads pending
  // accepted cycles from earlier days, then proves current eligibility again.
  const sql=notes?"SELECT * FROM retention_dispatch WHERE day<=? AND state='ACCEPTED' AND cycle_key>? ORDER BY cycle_key LIMIT 26":'SELECT * FROM retention_dispatch WHERE day=? AND cycle_key>? ORDER BY cycle_key LIMIT 26';
  const rows=s.db.prepare(sql).all(b.day,b.cursor??'');
  return {rows:rows.slice(0,25),nextCursor:rows.length>25?rows[24].cycle_key:null,complete:rows.length<=25};
}
function receiptValid(r,proof,at){
  return r?.company==='fumigacion'&&r.tenantId===MARIA_TENANT&&r.companyId===MARIA_COMPANY&&r.actor?.membershipId===proof.actorId&&r.actor.username==='maria.angel.bot'&&r.clientId===proof.clientId&&r.cycleKey===proof.cycleKey&&safeId.test(r.id??'')&&r.text===PREVENTIVE_RETENTION_NOTE&&r.sourceLine===proof.line&&r.nativeMessageId===proof.native.mid&&['DELIVERED','READ'].includes(r.deliveryStatus)&&!(proof.native.delivery==='READ'&&r.deliveryStatus!=='READ')&&fresh(millis(r.deliveryObservedAt),at)&&Number.isFinite(millis(r.createdAt))&&millis(r.createdAt)<=at&&(r.deliveredAt===null||Number.isFinite(millis(r.deliveredAt))&&millis(r.deliveredAt)<=millis(r.deliveryObservedAt))&&typeof r.replayed==='boolean';
}
const receiptFields=r=>({id:r.id,clientId:r.clientId,company:r.company,tenantId:r.tenantId,companyId:r.companyId,actor:{membershipId:r.actor.membershipId,username:r.actor.username},cycleKey:r.cycleKey,text:r.text,sourceLine:r.sourceLine,nativeMessageId:r.nativeMessageId,deliveryStatus:r.deliveryStatus,deliveryObservedAt:iso(millis(r.deliveryObservedAt)),deliveredAt:r.deliveredAt===null?null:iso(millis(r.deliveredAt)),createdAt:iso(millis(r.createdAt)),replayed:r.replayed});

/** Internal dependencies carry authentic source authority. HTTP callers can
 * supply only the current Bogota day and a cursor, never a plan or proof.
 * No timer is installed, no general READY row is produced, and activation is
 * an explicit constructor option, false by default. */
export function createRetentionDispatchRuntime(c,s,transport,{loadPlan,loadEligibility,now=Date.now,enabled=false,fetcher}={}){
  initialize(c,s);
  const clock=()=>{const at=now();if(!Number.isSafeInteger(at))fail('RETENTION_TIME_REQUIRED');return at;};
  const delivery=createRetentionDeliveryRuntime(c,s,transport,{loadEligibility,now:clock});
  let lastGuardAt=null,lastProofAt=null;
  const connected=()=>typeof loadEligibility==='function';
  const configured=()=>enabled===true&&connected()&&programEnabled(c,clock())&&transport?.config===c&&typeof transport.send==='function';
  const summary=(b,extra)=>({guard:RETENTION_DISPATCH_GUARD,company:'fumigacion',day:b.day,cursor:b.cursor,...extra});
  async function stage(plan,candidate){
    if(candidate?.sourceAnchorKind==='booking-interaction')return {state:'DEFERRED',reason:'RETENTION_BOOKING_ONLY_PROOF_NOT_SUPPORTED',sends:0,programNotesWritten:0};
    const at=clock();if(!planValid(plan,candidate,at))fail('RETENTION_APPROVED_PLAN_REQUIRED');
    const previous=read(s,candidate.dedupKey);
    if(previous){const {preparedAt:oldAt,...oldCandidate}=previous.value.candidate,{preparedAt:newAt,...newCandidate}=candidate;if(!same(oldCandidate,newCandidate))fail('RETENTION_CYCLE_ALREADY_RESERVED');return {cycleKey:previous.cycle_key,state:previous.state,duplicate:true};}
    s.tx(()=>{
      const conv=stageLocal(c,s,candidate,at),id=retentionOutboxId(candidate.dedupKey),caseId=retentionCaseId(candidate.dedupKey);
      if(s.db.prepare('SELECT 1 FROM outbox WHERE id=?').get(id))fail('RETENTION_EXISTING_ATTEMPT_PRESERVED');
      if(!conv)s.db.prepare('INSERT INTO conversations(phone,line,body) VALUES(?,?,?)').run(candidate.phone,candidate.line,s.seal({caseId,slots:{},asked:[],lastText:''}));
      const current=conv??s.conversation(candidate.phone),context={guard:RETENTION_DELIVERY_PROOF_GUARD,company:c.company,cycleKey:candidate.dedupKey,outboxId:id,caseId,phone:candidate.phone,line:candidate.line,textHash:candidate.textHash,revision:current.revision,conversationCaseId:current.state.caseId??null};
      s.db.prepare('INSERT INTO outbox(id,phone,line,body,internal,revision,state,created,updated,case_id) VALUES(?,?,?,?,0,?,?,?,?,?)').run(id,candidate.phone,candidate.line,s.seal(candidate.text),current.revision,RETENTION_STAGING_STATE,at,at,caseId);
      s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(retentionOutboxContextKey(candidate.dedupKey),s.seal(context));
      s.db.prepare('INSERT INTO retention_dispatch VALUES(?,?,?,?,?,?)').run(candidate.dedupKey,candidate.day,'STAGED',at,at,s.seal({guard:RETENTION_DISPATCH_GUARD,company:c.company,candidate,context}));
      record(s,candidate.dedupKey,'STAGED','NON_SENDABLE_OWN_OUTBOX',at,{outboxId:id,sends:0,businessWrites:0});
    });
    try{const result=await delivery.prepareCycle(plan,candidate);s.tx(()=>record(s,candidate.dedupKey,'PREPARED','FRESH_OWN_SOURCE_PREPARED',clock(),{sends:0,businessWrites:0}));return {...result,stagingState:RETENTION_STAGING_STATE};}
    catch(error){const reason=reasonOf(error);s.tx(()=>record(s,candidate.dedupKey,'REVIEW',reason,clock(),{sends:0,businessWrites:0}));return {cycleKey:candidate.dedupKey,state:'REVIEW',reason,sends:0,programNotesWritten:0};}
  }
  const prepare=async body=>{
    ownScope(c,s);const b=input(body,clock());
    if(!connected()||typeof loadPlan!=='function')return summary(b,{pending:true,reason:'RETENTION_ELIGIBILITY_ADAPTER_REQUIRED',prepared:0,sends:0,programNotesWritten:0});
    const source=await loadPlan({...b,now:clock()}),at=clock();
    if(source?.guard!==RETENTION_PLAN_SOURCE_GUARD||source.company!==c.company||source.tenantId!==MARIA_TENANT||source.companyId!==MARIA_COMPANY||source.actorId!==c.mariaProgram?.actorId||source.day!==b.day||source.cursor!==b.cursor||!fresh(millis(source.checkedAt),at)||typeof source.complete!=='boolean'||(source.nextCursor!==null&&(!safeId.test(source.nextCursor??'')||source.nextCursor===b.cursor))||source.complete!==(source.nextCursor===null)||!Array.isArray(source.plan?.prepared)||source.plan.prepared.length>25)fail('RETENTION_OWN_PLAN_SOURCE_REQUIRED');
    const results=[];for(const candidate of source.plan.prepared)results.push(await stage(source.plan,candidate));
    return summary(b,{results,prepared:results.filter(r=>r.state==='PREPARED').length,nextCursor:source.nextCursor,complete:source.complete,crossedCoverageComplete:source.plan.crossedCoverageComplete===true,sends:0,programNotesWritten:0});
  };
  const dispatch=async body=>{
    ownScope(c,s);const b=input(body,clock(),true);
    if(!configured())return summary(b,{pending:true,reason:'RETENTION_DISPATCH_DISABLED',accepted:0,uncertain:0,sends:0,programNotesWritten:0});
    const page=queuePage(s,b),results=[];let accepted=0,uncertain=0;
    for(const row of page.rows){
      if(row.state!=='PREPARED'){results.push({cycleKey:row.cycle_key,state:row.state,reason:'RETENTION_EXISTING_ATTEMPT_PRESERVED'});continue;}
      const guard=await delivery.dispatchGuard({company:c.company,key:row.cycle_key});
      if(!guard.eligible){s.tx(()=>record(s,row.cycle_key,'REVIEW',guard.reason,clock(),{sends:0}));results.push({cycleKey:row.cycle_key,state:'REVIEW',reason:guard.reason});continue;}
      let reserved=false,outbox,text;
      s.tx(()=>{
        const current=read(s,row.cycle_key),conv=s.conversation(current.value.candidate.phone),at=clock();outbox=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(guard.outboxId);text=current.value.candidate.text;
        if(!configured()||current.state!=='PREPARED'||current.value.guard!==RETENTION_DISPATCH_GUARD||current.value.company!==c.company||current.value.candidate.dedupKey!==guard.cycleKey||current.value.candidate.phone!==guard.phone||current.value.candidate.line!==guard.line||!fresh(millis(guard.sourceCheckedAt),at)||!fresh(millis(guard.checkedAt),at)||held(conv)||conv.revision!==guard.revision||(conv.state.caseId??null)!==guard.conversationCaseId||pendingLocal(s,guard.phone)||outbox?.state!==RETENTION_STAGING_STATE||outbox.mid!==null||outbox.id!==guard.outboxId||outbox.phone!==guard.phone||outbox.line!==guard.line||outbox.internal!==0||outbox.case_id!==guard.caseId||outbox.revision!==guard.revision||s.open(outbox.body)!==text||digest(text)!==guard.textHash||!publicTextSafe(text))return;
        reserved=Boolean(s.db.prepare("UPDATE outbox SET state='SENDING',updated=? WHERE id=? AND state=? AND mid IS NULL").run(at,outbox.id,RETENTION_STAGING_STATE).changes);
        if(reserved)record(s,row.cycle_key,'SENDING','OWN_FRESH_GUARD_RESERVED',at,{outboxId:outbox.id,textHash:guard.textHash});
      });
      if(!reserved){results.push({cycleKey:row.cycle_key,state:read(s,row.cycle_key).state,reason:'RETENTION_RESERVATION_CHANGED'});continue;}
      lastGuardAt=clock();
      try{
        const mid=await transport.send(outbox,text);if(!safeId.test(mid??''))fail('RETENTION_NATIVE_ACCEPTANCE_REQUIRED');
        s.tx(()=>{s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED',updated=? WHERE id=? AND state='SENDING'").run(mid,clock(),outbox.id);record(s,row.cycle_key,'ACCEPTED','NATIVE_ACCEPTED_NOT_DELIVERY',clock(),{mid,programNotesWritten:0});});accepted++;results.push({cycleKey:row.cycle_key,state:'ACCEPTED'});
      }catch(error){s.tx(()=>{s.db.prepare("UPDATE outbox SET state='UNCERTAIN',updated=? WHERE id=? AND state='SENDING'").run(clock(),outbox.id);record(s,row.cycle_key,'UNCERTAIN',reasonOf(error),clock(),{automaticRetry:false});});uncertain++;results.push({cycleKey:row.cycle_key,state:'UNCERTAIN'});}
    }
    return summary(b,{results,nextCursor:page.nextCursor,complete:page.complete,accepted,uncertain,sends:accepted+uncertain,programNotesWritten:0});
  };
  const writeNotes=async body=>{
    ownScope(c,s);const b=input(body,clock(),true);
    if(!configured()||!noteReady(c,clock())||typeof fetcher!=='function')return summary(b,{pending:true,reason:'RETENTION_NOTE_DISABLED',programNotesWritten:0,sends:0});
    const page=queuePage(s,b,{notes:true}),results=[];let programNotesWritten=0;
    for(const row of page.rows){
      if(row.state!=='ACCEPTED'){results.push({cycleKey:row.cycle_key,state:row.state,reason:'RETENTION_EXISTING_NOTE_ATTEMPT_PRESERVED'});continue;}
      const proof=await delivery.deliveryProof({company:c.company,key:row.cycle_key});
      if(!proof.eligible){results.push({cycleKey:row.cycle_key,state:row.state,pending:true,reason:proof.reason});continue;}
      const grant=c.retentionNoteAccess;let reserved=false;
      s.tx(()=>{
        const at=clock(),current=read(s,row.cycle_key),outbox=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(retentionOutboxId(row.cycle_key)),conv=s.conversation(proof.phone);
        if(!configured()||!noteReady(c,at)||current.state!=='ACCEPTED'||current.value.candidate.phone!==proof.phone||current.value.candidate.line!==proof.line||current.value.candidate.dedupKey!==proof.cycleKey||!fresh(millis(proof.checkedAt),at)||!fresh(millis(proof.native.checkedAt),at)||held(conv)||conv.revision!==current.value.context.revision||(conv.state.caseId??null)!==current.value.context.conversationCaseId||pendingLocal(s,proof.phone)||!['DELIVERED','READ'].includes(outbox?.state)||outbox.mid!==proof.native.mid||outbox.phone!==proof.phone||outbox.line!==proof.line||outbox.internal!==0||outbox.case_id!==retentionCaseId(proof.cycleKey)||digest(s.open(outbox.body))!==proof.native.textHash)return;
        record(s,row.cycle_key,'NOTE_SENDING','FRESH_NATIVE_PROOF_RESERVED',at,{mid:proof.native.mid,deliveredAt:proof.native.deliveredAt});reserved=true;
      });
      if(!reserved){results.push({cycleKey:row.cycle_key,pending:true,reason:'RETENTION_NOTE_RESERVATION_CHANGED'});continue;}
      lastProofAt=clock();
      try{
        const response=await fetcher(RETENTION_NOTE_URL,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+grant.token,'Content-Type':'application/json'},body:JSON.stringify({cycleKey:row.cycle_key}),signal:AbortSignal.timeout(20000)});
        if(!response.ok)fail('RETENTION_NOTE_HTTP_UNCERTAIN');
        const raw=await response.json(),receipt=raw?.success===true?raw.data:raw;
        if(!noteReady(c,clock())||c.retentionNoteAccess!==grant||!receiptValid(receipt,proof,clock()))fail('RETENTION_NOTE_RECEIPT_UNCERTAIN');
        s.tx(()=>record(s,row.cycle_key,'NOTED','OWN_EXACT_NOTE_RECEIPT',clock(),{receipt:receiptFields(receipt)}));if(!receipt.replayed)programNotesWritten++;results.push({cycleKey:row.cycle_key,state:'NOTED',replayed:receipt.replayed});
      }catch(error){s.tx(()=>record(s,row.cycle_key,'NOTE_UNCERTAIN',reasonOf(error),clock(),{automaticRetry:false}));results.push({cycleKey:row.cycle_key,state:'NOTE_UNCERTAIN'});}
    }
    return summary(b,{results,nextCursor:page.nextCursor,complete:page.complete,programNotesWritten,sends:0});
  };
  const status=()=>({guard:RETENTION_DISPATCH_GUARD,company:c.company,preparedPipeline:true,activationRequested:enabled===true,defaultOff:enabled!==true,autonomousEnabled:false,eligibilityAdapterConnected:connected(),planAdapterConnected:typeof loadPlan==='function',sendingEnabled:Boolean(configured()&&fresh(lastGuardAt,clock())),notesEnabled:Boolean(configured()&&noteReady(c,clock())&&fresh(lastProofAt,clock())),stagingState:RETENTION_STAGING_STATE,generalOutboxSendingEnabled:false,automaticRetriesEnabled:false,bookingOnlySupported:false,bookingOnlyReason:'RETENTION_BOOKING_ONLY_PROOF_NOT_SUPPORTED',noteAccess:retentionNoteAccessStatus(c,clock()),states:Object.fromEntries(s.db.prepare('SELECT state,COUNT(*) count FROM retention_dispatch GROUP BY state').all().map(r=>[r.state,r.count]))});
  return {prepare,dispatch,writeNotes,status};
}
