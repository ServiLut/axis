import {createHash,randomUUID} from 'node:crypto';
import {MARIA_TENANT,MARIA_COMPANY} from './maria-program.mjs';
import {FUMIGACION_BLUE,FUMIGACION_RED} from './line-scope.mjs';
import {MARIA_FINANCIAL_READER_GUARD,MARIA_FINANCIAL_SCHEMA,MARIA_FINANCIAL_SCOPE,MARIA_FINANCIAL_COHORT_SHA256,MARIA_FINANCIAL_APPROVED_SCOPES} from './maria-financial-reader.mjs';
import {isMariaCollectionsContext} from './maria-collections-context.mjs';
import {publicTextSafe} from './config.mjs';

// Isolated runtime core, OFF by default. No endpoint, credential, scheduler or host wiring.
export const COLLECTOR_GUARD='own-finite-reviewed-obligation-reminder-v1';
export const COLLECTOR_STAGED='COLLECTOR_STAGED';
export const PROOF_TTL_MS=120000;
export const FINAL_FINANCIAL_LAG_MS=5000;
export const FINAL_NATIVE_LAG_MS=5000;
const PN=/^57\d{10}$/,ID=/^[A-Za-z0-9:_-]{1,160}$/,HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const digest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const fail=reason=>{throw Error(reason)};
const exact=(v,fields)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===fields.split(',').sort().join(',');
const fresh=(at,now,max=PROOF_TTL_MS)=>Number.isSafeInteger(at)&&at<=now&&now-at<=max;
const same=(a,b)=>digest(a)===digest(b);
const own=(scope,value)=>value?.company===scope.company&&value.tenantId===scope.tenantId&&value.companyId===scope.companyId;
export const COLLECTION_SCOPE=Object.freeze({company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,lines:Object.freeze([FUMIGACION_BLUE,FUMIGACION_RED])});
const instances=Object.freeze({[FUMIGACION_BLUE]:'cucaracha-azul',[FUMIGACION_RED]:'cucaracha-roja'});
const rowFields='obligationId,clientId,phone,originLine,currency,balanceMinor,financialRevision,commercialReference,serviceDescription,serviceDate';
const safeLabel=v=>typeof v==='string'&&v.length>=1&&v.length<=100&&/^[\p{L}\p{N} .#_/-]+$/u.test(v);
const basisFlags=['dueBasisVerified','commercialAcceptanceVerified','dueAndPayable','paymentsReconciled','creditsReconciled','bonusCourtesyReconciled','fundsEvidenceReconciled','informedCashCollectionsChecked','customerBalanceSupported','originalSourcesVerified'];
const sorted=rows=>[...rows].sort((a,b)=>a.obligationId.localeCompare(b.obligationId));
const safeReason=e=>/^COLLECTOR_[A-Z0-9_]+$/.test(e?.message??'')?e.message:'COLLECTOR_SOURCE_UNAVAILABLE';
const frozen=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const item of Object.values(v))frozen(item);}return v};
const inputCopy=v=>frozen(structuredClone(v));
const isoTime=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v?Date.parse(v):NaN;

export function obligationKey(scope,obligationId){
 if(!UUID.test(obligationId??''))fail('COLLECTOR_OBLIGATION_ID_REQUIRED');
 // Neither wording, task/date, balance, phone nor a refreshed revision mints a new attempt.
 return 'collector-obligation:'+digest([scope.company,scope.tenantId,scope.companyId,obligationId])+':v1';
}
export function groupKey(scope,rows){
 const ordered=sorted(rows);return 'collector-group:'+digest([scope.company,scope.tenantId,scope.companyId,ordered[0]?.phone,ordered[0]?.originLine,ordered.map(r=>obligationKey(scope,r.obligationId))])+':v1';
}
function rowValid(scope,row){
 return exact(row,rowFields)&&UUID.test(row.obligationId??'')&&UUID.test(row.clientId??'')&&PN.test(row.phone??'')&&scope.lines.includes(row.originLine)&&row.currency==='COP'&&Number.isSafeInteger(row.balanceMinor)&&row.balanceMinor>0&&HASH.test(row.financialRevision??'')&&safeLabel(row.commercialReference)&&safeLabel(row.serviceDescription)&&/^\d{4}-\d{2}-\d{2}$/.test(row.serviceDate??'')&&Number.isFinite(Date.parse(row.serviceDate+'T00:00:00Z'))&&new Date(row.serviceDate+'T00:00:00Z').toISOString().slice(0,10)===row.serviceDate;
}
function totalMinor(rows){const n=rows.reduce((s,r)=>s+BigInt(r.balanceMinor),0n);if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('COLLECTOR_AMOUNT_OVERFLOW');return Number(n)}
function copy(rows){
 const minor=BigInt(totalMinor(rows)),cents=minor%100n;
 const amount='$'+new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(minor/100n)+(cents?','+String(cents).padStart(2,'0'):'')+' COP';
 const references=rows.map(r=>r.commercialReference+' · '+r.serviceDescription+' · '+r.serviceDate).join('; ');
 return 'Hola, soy María Ángel de FUMIGACION. Según la revisión, aparece un saldo pendiente de '+amount+' correspondiente a: '+references+'. ¿Nos ayudas a revisar el pago? Si ya pagaste o tienes un soporte, puedes compartirlo para verificarlo antes de continuar. Gracias por tu ayuda.';
}

export function createCollector({scope=COLLECTION_SCOPE,store,authorization,verifyManifest,financialReader,replyContext,readFinancialProof,readNativeHistory,readCurrentAttention,readCurrentState,send,readNativeDelivery,confirmDeadAttempt,enabled=false,now=Date.now}={}){
 if(!same(scope,COLLECTION_SCOPE))fail('COLLECTOR_OWN_SCOPE_REQUIRED');scope=COLLECTION_SCOPE;
 if(store?.company!==scope.company||typeof store.tx!=='function'||typeof store.seal!=='function'||typeof store.open!=='function')fail('COLLECTOR_OWN_STORE_REQUIRED');
 const clock=()=>{const n=now();if(!Number.isSafeInteger(n)||n<0)fail('COLLECTOR_TIME_REQUIRED');return n};
 const authority=authorization&&inputCopy(authorization);
 const workerId=randomUUID();
 const authorized=()=>exact(authority,'reference,sourceHash,company,tenantId,companyId,expiresAt,oneOff')&&own(scope,authority)&&ID.test(authority.reference??'')&&HASH.test(authority.sourceHash??'')&&authority.oneOff===true&&Number.isSafeInteger(authority.expiresAt)&&clock()<authority.expiresAt;
 // Host dependency: it must resolve a server-held reviewed manifest hash, never
 // return a receipt merely because incoming JSON asserts eligibility or same.
 function manifestVerified(manifest){
  if(typeof verifyManifest!=='function')fail('COLLECTOR_VERIFIED_MANIFEST_REQUIRED');
  const manifestHash=digest(manifest),authorizationHash=digest(authority),at=clock();
  const proof=verifyManifest(inputCopy({manifest,manifestHash,authorizationHash}));
  if(!exact(proof,'guard,company,tenantId,companyId,manifestHash,authorizationHash,sourceHash,checkedAt,expiresAt')||proof.guard!=='collector-verified-manifest-v1'||!own(scope,proof)||proof.manifestHash!==manifestHash||proof.authorizationHash!==authorizationHash||proof.sourceHash!==manifest.sourceHash||!fresh(proof.checkedAt,at)||!Number.isSafeInteger(proof.expiresAt)||proof.expiresAt<=at||proof.expiresAt>Math.min(manifest.expiresAt,authority.expiresAt))fail('COLLECTOR_VERIFIED_MANIFEST_REQUIRED');
  return structuredClone(proof);
 }
 function backendProjection(data,rows,revalidate){
  const at=clock(),started=isoTime(data?.financialReadStartedAt),checked=isoTime(data?.checkedAt),until=isoTime(data?.validUntil);
  if(data?.guard!==MARIA_FINANCIAL_READER_GUARD||data.schemaVersion!==MARIA_FINANCIAL_SCHEMA||data.company!=='FUMIGACION'||data.tenantId!==scope.tenantId||data.companyId!==scope.companyId||data.advisorMembershipId!==MARIA_FINANCIAL_SCOPE.actorId||data.readOnly!==true||data.cohortSha256!==MARIA_FINANCIAL_COHORT_SHA256||!MARIA_FINANCIAL_APPROVED_SCOPES.some(pin=>pin.sha256===data.allowlistHash)||!fresh(started,at,30000)||!fresh(checked,at,30000)||checked<started||!Number.isSafeInteger(until)||until<=at||until>started+30000||data.coverage?.completeForRequestedBindings!==true||data.coverage.requestedOrders!==rows.length||data.coverage.financialSourcesAreNotDebtAuthorization!==true||!Array.isArray(data.snapshots)||data.snapshots.length!==rows.length)fail('COLLECTOR_BACKEND_FINANCIAL_READ_REQUIRED');
  const found=new Set();
  for(const s of data.snapshots){
   const row=rows.find(r=>r.obligationId===s.orderId);
   if(!row||found.has(s.orderId)||s.clientId!==row.clientId||s.clientBinding?.id!==row.clientId||s.financialFingerprint!==row.financialRevision||!HASH.test(s.bindingFingerprint??'')||s.reconciliationRequired!==true||!Array.isArray(s.sourceConflicts)||s.sourceConflicts.length||['customerDebtVerified','bankReceiptVerified','serviceExecutionVerified','contractualDueDateVerified','collectionAuthorizedByThisRead'].some(flag=>s[flag]!==false))fail('COLLECTOR_BACKEND_BINDING_OR_RECONCILIATION_REQUIRED');
   found.add(s.orderId);
  }
  if(revalidate){
   if(data.status!=='UNCHANGED'||data.same!==true||data.revalidationSucceeded!==true||data.sendPermitted!==false||!Array.isArray(data.results)||data.results.length!==rows.length||new Set(data.results.map(r=>r.orderId)).size!==rows.length||data.results.some(r=>!found.has(r.orderId)||r.same!==true||r.requiresReview!==false))fail('COLLECTOR_BACKEND_REVALIDATION_REQUIRED');
  }
  return {checkedAt:checked,startedAt:started,validUntil:until,snapshots:structuredClone(data.snapshots)};
 }
 async function readBackend(rows,previous=null){
  let checkedAt=Number.MAX_SAFE_INTEGER,startedAt=Number.MAX_SAFE_INTEGER,validUntil=Number.MAX_SAFE_INTEGER;const snapshots=[];
  for(let i=0;i<rows.length;i+=5){
   const chunk=rows.slice(i,i+5),orders=chunk.map(r=>({orderId:r.obligationId,expectedClientId:r.clientId}));
   if(previous)for(const order of orders){const old=previous.snapshots.find(s=>s.orderId===order.orderId);if(!old)fail('COLLECTOR_BACKEND_BINDING_OR_RECONCILIATION_REQUIRED');order.expectedFinancialFingerprint=old.financialFingerprint;order.expectedBindingFingerprint=old.bindingFingerprint;}
   const data=await financialReader[previous?'revalidate':'snapshots'](inputCopy({orders})),part=backendProjection(data,chunk,Boolean(previous));
   if(previous&&part.snapshots.some(s=>s.bindingFingerprint!==previous.snapshots.find(old=>old.orderId===s.orderId)?.bindingFingerprint))fail('COLLECTOR_BACKEND_BINDING_OR_RECONCILIATION_REQUIRED');
   checkedAt=Math.min(checkedAt,part.checkedAt);startedAt=Math.min(startedAt,part.startedAt);validUntil=Math.min(validUntil,part.validUntil);snapshots.push(...part.snapshots);
  }
  return inputCopy({checkedAt,startedAt,validUntil,snapshots});
 }
 // Local ledger only; the module has no financial/business mutation dependency.
 store.db.exec(`CREATE TABLE IF NOT EXISTS collector_groups(group_key TEXT PRIMARY KEY,state TEXT NOT NULL,outbox_id TEXT NOT NULL UNIQUE,created INTEGER NOT NULL,updated INTEGER NOT NULL,body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS collector_claims(obligation_key TEXT PRIMARY KEY,group_key TEXT NOT NULL,state TEXT NOT NULL,FOREIGN KEY(group_key) REFERENCES collector_groups(group_key));
 CREATE TABLE IF NOT EXISTS collector_ledger(id INTEGER PRIMARY KEY,group_key TEXT NOT NULL,at INTEGER NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,body TEXT NOT NULL,FOREIGN KEY(group_key) REFERENCES collector_groups(group_key));`);
 const get=key=>{const r=store.db.prepare('SELECT * FROM collector_groups WHERE group_key=?').get(key);return r?{...r,value:store.open(r.body)}:null};
 const record=(key,state,reason,detail={})=>{
  store.db.prepare('UPDATE collector_groups SET state=?,updated=? WHERE group_key=?').run(state,clock(),key);
  store.db.prepare('UPDATE collector_claims SET state=? WHERE group_key=?').run(state,key);
  store.db.prepare('INSERT INTO collector_ledger(group_key,at,state,reason,body) VALUES(?,?,?,?,?)').run(key,clock(),state,reason,store.seal(detail));
 };
 // Construction never adopts/reclassifies another live worker's attempt.
 const local=(phone,line,key)=>{
  const c=store.conversation(phone),s=c?.state;
  if(!c||c.line!==line||![0,1].includes(c.hold)||!Number.isSafeInteger(c.revision)||!s||typeof s!=='object')fail('COLLECTOR_LOCAL_ATTENTION_UNKNOWN');
  if(c.hold||s.commercialRefusal?.kind==='no-contact'||['humanHold','awaitingHumanReview','doNotContact','optOutGlobal','contactDeclined','closed'].some(k=>s[k]===true))fail('COLLECTOR_LOCAL_ATTENTION_BLOCKED');
  for(const k of ['humanHold','awaitingHumanReview','doNotContact','optOutGlobal','contactDeclined','closed'])if(s[k]!==undefined&&typeof s[k]!=='boolean')fail('COLLECTOR_LOCAL_ATTENTION_UNKNOWN');
  for(const ownLine of scope.lines){const suffix=createHash('sha256').update(phone+':'+ownLine).digest('hex');if(store.db.prepare('SELECT 1 FROM meta WHERE key=?').get('commercial-optout:fumigacion:'+suffix))fail('COLLECTOR_DURABLE_OPTOUT_PRESERVED');}
  if(replyContext?.store===store&&typeof replyContext.hasReviewBlock==='function'&&replyContext.hasReviewBlock({phone,line,obligationKeys:[]}))fail('COLLECTOR_DURABLE_COLLECTION_REVIEW');
  if(store.db.prepare("SELECT 1 FROM events WHERE phone=? AND state IN ('PENDING','PROCESSING','REVIEW','HISTORY_REVIEW','ANSWER_REVIEW','WAITING_COORDINATOR','COLLECTION_REPLY_REVIEW') LIMIT 1").get(phone))fail('COLLECTOR_PENDING_TURN');
  if(store.db.prepare("SELECT 1 FROM questions WHERE phone=? AND state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW') LIMIT 1").get(phone))fail('COLLECTOR_PENDING_HUMAN_REVIEW');
  if(store.db.prepare("SELECT 1 FROM outbox WHERE phone=? AND internal=0 AND id<>? AND state IN ('READY','COLLECTOR_STAGED','FOLLOWUP_STAGED','RETENTION_STAGED','SENDING','ACCEPTED','UNCERTAIN') LIMIT 1").get(phone,key))fail('COLLECTOR_OTHER_ATTEMPT_PENDING');
  return {revision:c.revision,caseId:s.caseId??null,hash:digest([c.line,c.hold,c.revision,c.at,s])};
 };
 const brief=(g,extra={})=>({guard:COLLECTOR_GUARD,key:g?.group_key??null,state:g?.state??'NOT_FOUND',sends:0,businessWrites:0,automaticRetry:false,...extra});
 function prepare(manifest){
  if(!authorized())fail('COLLECTOR_DIRECT_AUTHORIZATION_REQUIRED');
  if(!exact(manifest,'version,manifestId,company,tenantId,companyId,reviewedAt,expiresAt,sourceHash,rows')||manifest.version!=='collector-finite-manifest-v1'||!own(scope,manifest)||!ID.test(manifest.manifestId??'')||!HASH.test(manifest.sourceHash??'')||!fresh(manifest.reviewedAt,clock())||!Number.isSafeInteger(manifest.expiresAt)||manifest.expiresAt<=clock()||manifest.expiresAt>manifest.reviewedAt+PROOF_TTL_MS||!Array.isArray(manifest.rows)||manifest.rows.length<1||manifest.rows.length>25)fail('COLLECTOR_FINITE_MANIFEST_REQUIRED');
  manifest=structuredClone(manifest);const rows=sorted(manifest.rows);
  if(rows.some(r=>!rowValid(scope,r))||new Set(rows.map(r=>r.obligationId)).size!==rows.length||rows.some(r=>r.phone!==rows[0].phone||r.originLine!==rows[0].originLine||r.clientId!==rows[0].clientId))fail('COLLECTOR_GROUP_IDENTITY_OR_AMOUNT_REQUIRED');
  totalMinor(rows);const manifestVerification=manifestVerified(manifest),key=groupKey(scope,rows),old=get(key);
  if(old)return brief(old,{duplicate:true});
  const context=local(rows[0].phone,rows[0].originLine,key),text=copy(rows),value={manifest,manifestHash:digest(manifest),manifestVerification,authorizationHash:digest(authority),context,text,textHash:digest(text)};
  if(text.length>1200)fail('COLLECTOR_COPY_TOO_LONG');
  if(!publicTextSafe(text))fail('COLLECTOR_PUBLIC_TEXT_REVIEW');
  store.tx(()=>{
   if(get(key))fail('COLLECTOR_GROUP_ALREADY_RESERVED');
   manifestVerified(manifest);
   const current=local(rows[0].phone,rows[0].originLine,key);if(!same(current,context))fail('COLLECTOR_LOCAL_CHANGED');
   if(!publicTextSafe(text))fail('COLLECTOR_PUBLIC_TEXT_REVIEW');
   // All obligation claims and the non-sendable outbox are one transaction.
   if(rows.some(r=>store.db.prepare('SELECT 1 FROM collector_claims WHERE obligation_key=?').get(obligationKey(scope,r.obligationId))))fail('COLLECTOR_OBLIGATION_ALREADY_CLAIMED');
   store.db.prepare('INSERT INTO collector_groups VALUES(?,?,?,?,?,?)').run(key,'STAGED',key,clock(),clock(),store.seal(value));
   for(const row of rows)store.db.prepare('INSERT INTO collector_claims VALUES(?,?,?)').run(obligationKey(scope,row.obligationId),key,'STAGED');
   store.db.prepare('INSERT INTO outbox(id,phone,line,body,internal,revision,state,created,updated,case_id) VALUES(?,?,?,?,0,?,?,?,?,?)').run(key,rows[0].phone,rows[0].originLine,store.seal(text),context.revision,COLLECTOR_STAGED,clock(),clock(),context.caseId);
   record(key,'STAGED','COLLECTOR_FINITE_PROPOSAL_STORED',{manifestHash:value.manifestHash,textHash:value.textHash,sends:0});
  });return brief(get(key));
 }
 function checkFinancial(proof,g,at){
  if(proof?.guard!=='collector-financial-proof-v1'||!own(scope,proof)||proof.complete!==true||!fresh(proof.checkedAt,at)||!Array.isArray(proof.rows)||proof.rows.length!==g.value.manifest.rows.length)fail('COLLECTOR_LIVE_FINANCIAL_PROOF_REQUIRED');
  const rows=sorted(proof.rows);
  for(let i=0;i<rows.length;i++){
   const {paidClaim,pendingEvidence,disputed,provenanceHash,...rest}=rows[i];
   const row=Object.fromEntries(Object.entries(rest).filter(([key])=>!basisFlags.includes(key)));
   if(paidClaim!==false||pendingEvidence!==false||disputed!==false)fail('COLLECTOR_PAYMENT_OR_DISPUTE_REVIEW');
   if(!HASH.test(provenanceHash??'')||basisFlags.some(flag=>rest[flag]!==true))fail('COLLECTOR_DUE_BASIS_OR_RECONCILIATION_REQUIRED');
   if(!rowValid(scope,row)||!same(row,sorted(g.value.manifest.rows)[i]))fail('COLLECTOR_FINANCIAL_REVISION_OR_BALANCE_CHANGED');
  }
 }
 function checkNative(proof,g,at){
  const row=g.value.manifest.rows[0];
  if(proof?.guard!=='collector-native-cross-v1'||!own(scope,proof)||proof.phone!==row.phone||proof.originLine!==row.originLine||proof.ownerPhone!==row.originLine||proof.instance!==instances[row.originLine]||proof.identityVerified!==true||proof.originalLineVerified!==true||proof.bothLinesComplete!==true||proof.mediaReviewComplete!==true||proof.pendingPaymentClaim!==false||proof.optOut!==false||proof.humanHold!==false||proof.contactPermissionVerified!==true||proof.contactDeferralClear!==true||proof.contactPurpose!=='own-pending-obligation'||!fresh(proof.checkedAt,at)||!HASH.test(proof.historyHash??'')||!Array.isArray(proof.coveredLines)||proof.coveredLines.length!==2||new Set(proof.coveredLines).size!==2||scope.lines.some(l=>!proof.coveredLines.includes(l)))fail('COLLECTOR_CROSSED_NATIVE_PROOF_REQUIRED');
 }
 function checkAttention(proof,g,at){
  const row=g.value.manifest.rows[0];
  const window=proof?.permittedContactWindow;
  if(proof?.guard!=='collector-current-attention-v1'||!own(scope,proof)||proof.phone!==row.phone||proof.line!==row.originLine||proof.ownerPhone!==row.originLine||proof.instance!==instances[row.originLine]||proof.complete!==true||proof.lineAllowed!==true||proof.ownerVerified!==true||proof.channelOpen!==true||proof.humanHold!==false||proof.optOut!==false||proof.paidClaim!==false||proof.contactAllowedNow!==true||window?.timezone!=='America/Bogota'||!Number.isSafeInteger(window.from)||!Number.isSafeInteger(window.to)||window.from>at||at>=window.to||!HASH.test(window.sourceHash??'')||!fresh(proof.checkedAt,at))fail('COLLECTOR_CURRENT_ATTENTION_REQUIRED');
 }
 function checkCurrentState(bundle,g,at){
  const row=g.value.manifest.rows[0];
  if(!exact(bundle,'guard,company,tenantId,companyId,phone,originLine,checkedAt,native,attention')||bundle.guard!=='collector-current-state-v1'||!own(scope,bundle)||bundle.phone!==row.phone||bundle.originLine!==row.originLine||!Number.isSafeInteger(bundle.native?.checkedAt)||!Number.isSafeInteger(bundle.attention?.checkedAt)||bundle.checkedAt!==Math.min(bundle.native.checkedAt,bundle.attention.checkedAt)||!fresh(bundle.checkedAt,at,FINAL_NATIVE_LAG_MS))fail('COLLECTOR_COORDINATED_CURRENT_STATE_REQUIRED');
  checkNative(bundle.native,g,at);checkAttention(bundle.attention,g,at);
  if(bundle.attention.historyHash!==bundle.native.historyHash)fail('COLLECTOR_NATIVE_ATTENTION_HISTORY_MISMATCH');
 }
 async function dispatch(key){
  const initial=get(key);if(!initial)return brief(null);
  if(initial.state!=='STAGED')return brief(initial,{duplicate:true});
  if(enabled!==true)return brief(initial,{disabled:true});
  try{
   if(!publicTextSafe(initial.value.text))fail('COLLECTOR_PUBLIC_TEXT_REVIEW');
   if(!authorized()||initial.value.authorizationHash!==digest(authority))fail('COLLECTOR_DIRECT_AUTHORIZATION_REQUIRED');
   if([readFinancialProof,readNativeHistory,readCurrentAttention,readCurrentState,send,readNativeDelivery,financialReader?.snapshots,financialReader?.revalidate].some(f=>typeof f!=='function'))fail('COLLECTOR_LIVE_READERS_REQUIRED');
   if(!isMariaCollectionsContext(replyContext,store)||[replyContext?.registerAttempt,replyContext?.assertAttempt,replyContext?.attachMid,replyContext?.hasReviewBlock].some(f=>typeof f!=='function'))fail('COLLECTOR_DURABLE_CONTEXT_REQUIRED');
   if(clock()>=initial.value.manifest.expiresAt)fail('COLLECTOR_MANIFEST_EXPIRED');
   manifestVerified(initial.value.manifest);
   const input=inputCopy({...scope,rows:initial.value.manifest.rows,key});
   let financial,native,attention,backend;const nativeHashes=[];
   // Re-read after awaits. Callback existence and a reviewed export are not live proof.
   for(let pass=0;pass<2;pass++){
    backend=await readBackend(input.rows);
    financial=inputCopy(await readFinancialProof(inputCopy({...input,financialSnapshot:backend})));checkFinancial(financial,initial,clock());
    native=inputCopy(await readNativeHistory(input));checkNative(native,initial,clock());nativeHashes.push(native.historyHash);
    attention=inputCopy(await readCurrentAttention(input));checkAttention(attention,initial,clock());
   }
   if(nativeHashes[0]!==nativeHashes[1])fail('COLLECTOR_NATIVE_HISTORY_CHANGED');
   backend=await readBackend(input.rows,backend);
   // Reconcile the FINAL backend snapshot, not the older second-pass proof.
   financial=inputCopy(await readFinancialProof(inputCopy({...input,financialSnapshot:backend})));checkFinancial(financial,initial,clock());
   // Last external await: one coordinated native/attention state from the same
   // immutable re-read, retaining real capture times and the five-second bound.
   const state=inputCopy(await readCurrentState(input));checkCurrentState(state,initial,clock());
   native=state.native;attention=state.attention;
   if(nativeHashes.some(hash=>hash!==native.historyHash))fail('COLLECTOR_NATIVE_HISTORY_CHANGED');
   let reserved=false,row,reservedValue;
   store.tx(()=>{
    const g=get(key),at=clock();if(!g)return;
    if(g.state!=='STAGED')return;
    if(!publicTextSafe(g.value.text))fail('COLLECTOR_PUBLIC_TEXT_REVIEW');
    manifestVerified(g.value.manifest);
    const first=g.value.manifest.rows[0],context=local(first.phone,first.originLine,key);
    if(!authorized()||!same(g.value,initial.value)||g.value.authorizationHash!==digest(authority)||g.value.manifestHash!==digest(g.value.manifest)||at>=g.value.manifest.expiresAt||!same(context,g.value.context)||!fresh(financial.checkedAt,at,FINAL_FINANCIAL_LAG_MS)||!fresh(backend.startedAt,at,FINAL_FINANCIAL_LAG_MS)||!fresh(backend.checkedAt,at,FINAL_FINANCIAL_LAG_MS)||at>=backend.validUntil||!fresh(native.checkedAt,at,FINAL_NATIVE_LAG_MS)||!fresh(attention.checkedAt,at,FINAL_NATIVE_LAG_MS))fail('COLLECTOR_STALE_PROOF_OR_LOCAL_CHANGE');
    checkFinancial(financial,g,at);checkNative(native,g,at);checkAttention(attention,g,at);
    const claims=store.db.prepare('SELECT obligation_key,state FROM collector_claims WHERE group_key=?').all(key);
    if(claims.length!==g.value.manifest.rows.length||claims.some(c=>c.state!=='STAGED')||g.value.manifest.rows.some(r=>!claims.some(c=>c.obligation_key===obligationKey(scope,r.obligationId))))fail('COLLECTOR_GROUP_CLAIMS_CHANGED');
    row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(key);
    if(row?.state!==COLLECTOR_STAGED||row.mid!==null||row.phone!==first.phone||row.line!==first.originLine||row.revision!==context.revision||row.case_id!==context.caseId||row.internal!==0||store.open(row.body)!==g.value.text||digest(g.value.text)!==g.value.textHash)fail('COLLECTOR_OUTBOX_ASSOCIATION_CHANGED');
    const attempt={id:digest([key,workerId,at]),workerId,startedAt:at},contextInput={guard:COLLECTOR_GUARD,groupKey:key,attemptId:attempt.id,outboxId:key,phone:first.phone,line:first.originLine,obligationKeys:sorted(g.value.manifest.rows).map(r=>obligationKey(scope,r.obligationId)),orderIds:sorted(g.value.manifest.rows).map(r=>r.obligationId),textHash:g.value.textHash,text:g.value.text,attemptAt:at,manifestHash:g.value.manifestHash};
    const receipt=replyContext.registerAttempt(inputCopy(contextInput));
    const expectedReceipt={contextId:receipt?.contextId,groupKey:key,attemptId:attempt.id,outboxId:key,phone:first.phone,line:first.originLine,textHash:contextInput.textHash,obligationKeys:contextInput.obligationKeys,orderIds:contextInput.orderIds};
    if(!exact(receipt,'contextId,groupKey,attemptId,outboxId,phone,line,textHash,obligationKeys,orderIds')||!ID.test(receipt.contextId??'')||!same(receipt,expectedReceipt)||!same(replyContext.assertAttempt(inputCopy({...contextInput,contextId:receipt.contextId})),receipt))fail('COLLECTOR_DURABLE_CONTEXT_REQUIRED');
    reserved=Boolean(store.db.prepare("UPDATE outbox SET state='SENDING',updated=? WHERE id=? AND state=? AND mid IS NULL").run(at,key,COLLECTOR_STAGED).changes);
    if(!reserved)fail('COLLECTOR_OUTBOX_ASSOCIATION_CHANGED');
    g.value.attempt=attempt;g.value.replyContext=receipt;reservedValue=inputCopy(g.value);store.db.prepare('UPDATE collector_groups SET body=? WHERE group_key=?').run(store.seal(g.value),key);record(key,'SENDING','COLLECTOR_ATTEMPT_RESERVED',{attempt,contextId:receipt.contextId,financialCheckedAt:financial.checkedAt,backendCheckedAt:backend.checkedAt,nativeCheckedAt:native.checkedAt,historyHash:native.historyHash,textHash:g.value.textHash});
   });
   if(!reserved)return brief(get(key),{duplicate:true});
   let mid;
   try{
    mid=await send(inputCopy({...row,state:'SENDING'}),reservedValue.text);if(!/^[A-Za-z0-9_-]{8,100}$/.test(mid??''))fail('COLLECTOR_NATIVE_MID_REQUIRED');
    store.tx(()=>{
     const current=get(key),currentOutbox=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(key);
     if(current?.state!=='SENDING'||!same(current.value,reservedValue)||currentOutbox?.state!=='SENDING'||currentOutbox.mid!==null||['phone','line','revision','case_id','internal'].some(field=>currentOutbox[field]!==row[field])||store.open(currentOutbox.body)!==reservedValue.text||!store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=?,updated=? WHERE id=? AND state='SENDING' AND mid IS NULL").run(mid,clock(),key).changes)fail('COLLECTOR_ACK_ASSOCIATION_CHANGED');
     const linked=replyContext.attachMid({contextId:current.value.replyContext.contextId,attemptId:current.value.attempt.id,outboxId:key,mid});
     if(!same(linked,{...current.value.replyContext,mid,deliveryVerified:false}))fail('COLLECTOR_DURABLE_CONTEXT_REQUIRED');record(key,'ACCEPTED','COLLECTOR_NATIVE_ACCEPTED_NOT_DELIVERY',{mid});
    });
    return brief(get(key),{sends:1,deliveryVerified:false});
   }catch(e){store.tx(()=>{
    const observed=typeof mid==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(mid)?{observedMid:mid,midBindingVerified:false,observedForAttempt:reservedValue.attempt.id}:{};
    if(get(key)?.state==='SENDING'){store.db.prepare("UPDATE outbox SET state='UNCERTAIN',updated=? WHERE id=? AND state='SENDING'").run(clock(),key);record(key,'UNCERTAIN',safeReason(e),{...observed,automaticRetry:false});}
    else if(observed.observedMid)store.db.prepare('INSERT INTO collector_ledger(group_key,at,state,reason,body) VALUES(?,?,?,?,?)').run(key,clock(),'UNCERTAIN',safeReason(e),store.seal({...observed,automaticRetry:false,existingGroupStatePreserved:true}));
   });return brief(get(key),{sends:1,deliveryVerified:false});}
  }catch(e){store.tx(()=>{if(get(key)?.state==='STAGED')record(key,'REVIEW',safeReason(e),{attemptedSend:false});});return brief(get(key),{reason:safeReason(e)});}
 }
 async function proveDelivery(key){
  const g=get(key);if(!g||!['ACCEPTED','DELIVERED','READ'].includes(g.state))return brief(g,{deliveryVerified:false});
  try{
   if(typeof readNativeDelivery!=='function')fail('COLLECTOR_NATIVE_DELIVERY_READER_REQUIRED');
   const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(key),attemptAt=g.value.attempt?.startedAt,proof=await readNativeDelivery({key,mid:row.mid,phone:row.phone,line:row.line,text:g.value.text,attemptAt});
   if(proof?.guard!=='collector-native-delivery-v1'||!own(scope,proof)||proof.mid!==row.mid||proof.phone!==row.phone||proof.line!==row.line||proof.ownerPhone!==row.line||proof.instance!==instances[row.line]||proof.ownerVerified!==true||proof.fromMe!==true||proof.text!==g.value.text||proof.unmodified!==true||!HASH.test(proof.sourceHash??'')||!['DELIVERY_ACK','READ'].includes(proof.nativeAck)||!fresh(proof.checkedAt,clock()))fail('COLLECTOR_EXACT_NATIVE_ACK_REQUIRED');
   if(!Number.isSafeInteger(attemptAt)||proof.attemptAt!==attemptAt||!Number.isSafeInteger(proof.nativeSentAt)||proof.nativeSentAt<attemptAt||proof.nativeSentAt>clock()){
    store.tx(()=>store.db.prepare('INSERT INTO collector_ledger(group_key,at,state,reason,body) VALUES(?,?,?,?,?)').run(key,clock(),'ACK_OBSERVED','COLLECTOR_NATIVE_SEND_ORDER_UNPROVEN',store.seal({mid:proof.mid,nativeAck:proof.nativeAck,nativeSentAt:proof.nativeSentAt??null,attemptAt,sourceHash:proof.sourceHash})));
    return brief(get(key),{textualAckVerified:true,deliveryVerified:false,reason:'COLLECTOR_NATIVE_SEND_ORDER_UNPROVEN'});
   }
   store.tx(()=>{
    const currentGroup=get(key),current=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(key);
    if(!currentGroup||!['ACCEPTED','DELIVERED','READ'].includes(currentGroup.state)||!same(currentGroup.value.attempt,g.value.attempt)||currentGroup.value.text!==g.value.text||current?.mid!==row.mid||current.phone!==row.phone||current.line!==row.line||store.open(current.body)!==g.value.text||!['ACCEPTED','DELIVERED','READ'].includes(current.state))fail('COLLECTOR_NATIVE_PROOF_ASSOCIATION_CHANGED');
    // Another proof may have advanced to READ during the external await.
    const state=currentGroup.state==='READ'||current.state==='READ'||proof.nativeAck==='READ'?'READ':'DELIVERED';
    store.db.prepare('UPDATE outbox SET state=?,updated=? WHERE id=?').run(state,clock(),key);record(key,state,'COLLECTOR_EXACT_NATIVE_DELIVERY',{mid:proof.mid,sourceHash:proof.sourceHash,checkedAt:proof.checkedAt,deliveredAt:null});
   });
   return brief(get(key),{deliveryVerified:true,deliveredAt:null});
  }catch(e){return brief(get(key),{deliveryVerified:false,reason:safeReason(e)});}
 }
 async function recoverInterrupted(key){
  const initial=get(key);if(!initial||initial.state!=='SENDING')return brief(initial);
  if(typeof confirmDeadAttempt!=='function')return brief(initial,{reason:'COLLECTOR_DEAD_PROCESS_PROOF_REQUIRED'});
  try{const proof=await confirmDeadAttempt({key,attempt:initial.value.attempt});
   if(proof?.guard!=='collector-dead-attempt-v1'||!own(scope,proof)||proof.key!==key||proof.attemptId!==initial.value.attempt?.id||proof.deadProcessConfirmed!==true||!fresh(proof.checkedAt,clock()))fail('COLLECTOR_DEAD_PROCESS_PROOF_REQUIRED');
   store.tx(()=>{const current=get(key),row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(key);if(current.state!=='SENDING'||current.value.attempt?.id!==proof.attemptId||!['SENDING','UNCERTAIN'].includes(row?.state)||row.mid!==null)fail('COLLECTOR_RECOVERY_ASSOCIATION_CHANGED');store.db.prepare("UPDATE outbox SET state='UNCERTAIN',updated=? WHERE id=? AND state IN ('SENDING','UNCERTAIN') AND mid IS NULL").run(clock(),key);record(key,'UNCERTAIN','COLLECTOR_CONFIRMED_INTERRUPTED_ATTEMPT',{attemptId:proof.attemptId,automaticRetry:false});});return brief(get(key));
  }catch(e){return brief(get(key),{reason:safeReason(e)});}
 }
 return {prepare,dispatch,proveDelivery,recoverInterrupted,status:key=>brief(get(key)),capabilities:()=>({guard:COLLECTOR_GUARD,defaultOff:enabled!==true,finiteOnly:true,automaticRetry:false,businessWrites:false,replyContextIntegrationInstalled:false,productionReady:false,verifiedManifestResolverConfigured:typeof verifyManifest==='function',durableContextConfigured:isMariaCollectionsContext(replyContext,store),liveFinancialReaderConfigured:typeof financialReader?.snapshots==='function'&&typeof financialReader?.revalidate==='function'})};
}

export const createMariaCollections=createCollector;
