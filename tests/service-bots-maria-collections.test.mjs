import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {Store} from '../automation/service-bots/store.mjs';
import {publicTextSafe} from '../automation/service-bots/config.mjs';
import {Transport} from '../automation/service-bots/transport.mjs';
import {createMariaCollectionsContext} from '../automation/service-bots/maria-collections-context.mjs';
import {MARIA_FINANCIAL_READER_GUARD,MARIA_FINANCIAL_SCHEMA,MARIA_FINANCIAL_SCOPE,MARIA_FINANCIAL_COHORT_SHA256,MARIA_FINANCIAL_APPROVED_SCOPES} from '../automation/service-bots/maria-financial-reader.mjs';
import {createCollector,digest,groupKey,obligationKey,COLLECTOR_STAGED,PROOF_TTL_MS,COLLECTION_SCOPE} from '../automation/service-bots/maria-collections.mjs';

const syntheticId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ORDER_A=syntheticId(1),ORDER_B=syntheticId(2),ORDER_C=syntheticId(3),CLIENT_A=syntheticId(1001);
const BLUE='573126944997',RED='573126938721',PHONE='573000009001',OTHER='573000009002';
const scope=COLLECTION_SCOPE;
const instances={[BLUE]:'cucaracha-azul',[RED]:'cucaracha-roja'};
const basis={dueBasisVerified:true,commercialAcceptanceVerified:true,dueAndPayable:true,paymentsReconciled:true,creditsReconciled:true,bonusCourtesyReconciled:true,fundsEvidenceReconciled:true,informedCashCollectionsChecked:true,customerBalanceSupported:true,originalSourcesVerified:true,provenanceHash:digest('verified original basis/payments/credits/courtesy/cash evidence')};
const clone=structuredClone;
function fixture(t,{enabled=true,disk=false,missingFinancial=false}={}){
 const f={at:Date.parse('2026-11-12T20:00:00Z'),sends:0,financialCalls:0,nativeCalls:0,attentionCalls:0,currentStateCalls:0,key:randomBytes(32),extraStores:[]};
 let dir=null;const path=disk?(dir=mkdtempSync(join(tmpdir(),'maria-collector-')),join(dir,'ledger.sqlite')):':memory:';
 f.store=new Store(path,'fumigacion',f.key);
 f.addContact=(phone=PHONE,line=BLUE)=>f.store.db.prepare('INSERT INTO conversations(phone,line,revision,at,body) VALUES(?,?,7,?,?)').run(phone,line,f.at,f.store.seal({caseId:'fumigacion:fixture-'+phone,slots:{},asked:[]}));f.addContact();
 f.rows=[{obligationId:ORDER_A,clientId:CLIENT_A,phone:PHONE,originLine:BLUE,currency:'COP',balanceMinor:12900000,financialRevision:digest('revision-A'),commercialReference:'REF-A',serviceDescription:'Control de cucarachas',serviceDate:'2026-10-21'},{obligationId:ORDER_B,clientId:CLIENT_A,phone:PHONE,originLine:BLUE,currency:'COP',balanceMinor:20000000,financialRevision:digest('revision-B'),commercialReference:'REF-B',serviceDescription:'Tratamiento de chinches',serviceDate:'2026-10-22'}];
 f.authorization={reference:'direct-user-finite-synthetic-authority',sourceHash:digest('synthetic authority'),...scope,expiresAt:f.at+86400000,oneOff:true};delete f.authorization.lines;
 f.reviewedManifestHashes=new Set();f.review=m=>f.reviewedManifestHashes.add(digest(m));
 f.manifest=(rows=f.rows)=>{const m=({version:'collector-finite-manifest-v1',manifestId:'finite-synthetic-manifest',company:scope.company,tenantId:scope.tenantId,companyId:scope.companyId,reviewedAt:f.at,expiresAt:f.at+PROOF_TTL_MS,sourceHash:digest('reviewed financial manifest'),rows:clone(rows)});f.review(m);return m;};
 f.backendCalls=[];
 f.backendResponse=(body,revalidate)=>{
  const at=new Date(f.at).toISOString(),snapshots=body.orders.map(b=>{const r=f.rows.find(row=>row.obligationId===b.orderId);return {orderId:b.orderId,clientId:b.expectedClientId,clientBinding:{id:b.expectedClientId},financialFingerprint:r.financialRevision,bindingFingerprint:digest('binding:'+b.orderId),sourceConflicts:[],reconciliationRequired:true,customerDebtVerified:false,bankReceiptVerified:false,serviceExecutionVerified:false,contractualDueDateVerified:false,collectionAuthorizedByThisRead:false};});
  const data={guard:MARIA_FINANCIAL_READER_GUARD,schemaVersion:MARIA_FINANCIAL_SCHEMA,company:'FUMIGACION',tenantId:scope.tenantId,companyId:scope.companyId,advisorMembershipId:MARIA_FINANCIAL_SCOPE.actorId,readOnly:true,cohortSha256:MARIA_FINANCIAL_COHORT_SHA256,allowlistHash:MARIA_FINANCIAL_APPROVED_SCOPES[0].sha256,financialReadStartedAt:at,checkedAt:at,validUntil:new Date(f.at+30000).toISOString(),coverage:{completeForRequestedBindings:true,requestedOrders:body.orders.length,financialSourcesAreNotDebtAuthorization:true},snapshots};
  if(revalidate)Object.assign(data,{status:'UNCHANGED',same:true,revalidationSucceeded:true,sendPermitted:false,results:snapshots.map(s=>({orderId:s.orderId,same:true,requiresReview:false}))});
  if(f.backendPatch)f.backendPatch(data,revalidate);return data;
 };
 const latency=()=>{if(f.callbackLatencyMs)f.at+=f.callbackLatencyMs};
 const nativeProof=capture=>({guard:'collector-native-cross-v1',...scope,phone:PHONE,originLine:BLUE,ownerPhone:BLUE,instance:instances[BLUE],identityVerified:true,originalLineVerified:true,bothLinesComplete:true,mediaReviewComplete:true,pendingPaymentClaim:false,optOut:false,humanHold:false,contactPermissionVerified:true,contactDeferralClear:true,contactPurpose:'own-pending-obligation',historyHash:digest('BLUE+RED reviewed originals'),coveredLines:[BLUE,RED],checkedAt:capture,...f.nativePatch});
 const attentionProof=capture=>({guard:'collector-current-attention-v1',...scope,phone:PHONE,line:BLUE,ownerPhone:BLUE,instance:instances[BLUE],complete:true,lineAllowed:true,ownerVerified:true,channelOpen:true,humanHold:false,optOut:false,paidClaim:false,contactAllowedNow:true,historyHash:digest('BLUE+RED reviewed originals'),permittedContactWindow:{from:capture-1000,to:capture+60000,timezone:'America/Bogota',sourceHash:digest('applicable reviewed contact hours')},checkedAt:capture,...f.attentionPatch});
 const callbacks={
  verifyManifest:input=>{if(!f.reviewedManifestHashes.has(input.manifestHash))return null;return {guard:'collector-verified-manifest-v1',company:scope.company,tenantId:scope.tenantId,companyId:scope.companyId,manifestHash:input.manifestHash,authorizationHash:input.authorizationHash,sourceHash:input.manifest.sourceHash,checkedAt:f.at,expiresAt:input.manifest.expiresAt,...f.manifestProofPatch};},
  financialReader:{snapshots:async body=>{f.backendCalls.push({operation:'snapshots',body});if(f.backendHook)await f.backendHook('snapshots',body);latency();return f.backendResponse(body,false);},revalidate:async body=>{f.backendCalls.push({operation:'revalidate',body});if(f.backendHook)await f.backendHook('revalidate',body);latency();return f.backendResponse(body,true);}},
  readFinancialProof:missingFinancial?undefined:async input=>{f.financialCalls++;if(f.financialHook)await f.financialHook(input);latency();return {guard:'collector-financial-proof-v1',...scope,checkedAt:input.financialSnapshot.checkedAt,complete:true,rows:input.rows.map(r=>({...clone(r),...basis,paidClaim:false,pendingEvidence:false,disputed:false,...f.financialRowPatch})),...f.financialPatch};},
  readNativeHistory:async()=>{const capture=f.at;f.nativeCalls++;if(f.nativeHook)await f.nativeHook();latency();return nativeProof(capture);},
  readCurrentAttention:async()=>{const capture=f.at;f.attentionCalls++;if(f.attentionHook)await f.attentionHook();latency();return attentionProof(capture);},
  // One new high-level coordinated callback; the two proof timestamps retain
  // its capture start even if it resolves later. Counters/hooks retain the old
  // final-source observations without modeling two unrelated callback awaits.
  readCurrentState:async()=>{const capture=f.at;f.currentStateCalls++;f.nativeCalls++;if(f.nativeHook)await f.nativeHook();f.attentionCalls++;if(f.attentionHook)await f.attentionHook();if(f.currentStateHook)await f.currentStateHook();latency();const native=nativeProof(capture),attention=attentionProof(capture);return {guard:'collector-current-state-v1',company:scope.company,tenantId:scope.tenantId,companyId:scope.companyId,phone:PHONE,originLine:BLUE,checkedAt:Math.min(native.checkedAt,attention.checkedAt),native,attention,...f.currentStatePatch};},
  send:async(row,text)=>{f.sends++;assert.equal(f.store.db.prepare('SELECT state FROM collector_groups WHERE group_key=?').get(row.id).state,'SENDING');assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(row.id).state,'SENDING');assert.ok(f.store.db.prepare("SELECT 1 FROM collector_ledger WHERE group_key=? AND state='SENDING'").get(row.id));if(f.sendHook)await f.sendHook();if(f.sendError)throw Error('provider failed after request with private token');return 'NATIVE_COLLECTOR_MID_0001';},
  readNativeDelivery:async input=>{const proof={guard:'collector-native-delivery-v1',...scope,...input,ownerPhone:input.line,instance:instances[input.line],ownerVerified:true,fromMe:true,unmodified:true,sourceHash:digest('literal provider source'),nativeAck:'DELIVERY_ACK',nativeSentAt:f.at,checkedAt:f.at,...f.deliveryPatch};return f.deliveryHook?await f.deliveryHook(input,proof):proof;},
  confirmDeadAttempt:async input=>({guard:'collector-dead-attempt-v1',...scope,key:input.key,attemptId:input.attempt?.id,deadProcessConfirmed:f.deadConfirmed===true,checkedAt:f.at,...f.deadProofPatch}),
 };
 f.open=(store=f.store)=>{const context=createMariaCollectionsContext({store,enabled:true,now:()=>f.at});f.context=context;return createCollector({scope,store,authorization:f.authorization,...callbacks,...f.callbackOverrides,replyContext:f.contextDecorator?f.contextDecorator(context):context,enabled,now:()=>f.at});};f.runtime=f.open();
 f.worker=()=>{const s=new Store(path,'fumigacion',f.key);f.extraStores.push(s);return f.open(s);};
 f.prepare=(rows=f.rows)=>f.runtime.prepare(f.manifest(rows));
 f.restart=()=>{f.store.close();f.store=new Store(path,'fumigacion',f.key);f.runtime=f.open();};
 t.after(()=>{for(const s of f.extraStores)s.close();f.store.close();if(dir){const safe=resolve(dir),base=resolve(tmpdir())+sep+'maria-collector-';assert.ok(safe.startsWith(base));rmSync(safe,{recursive:true,force:true});}});
 return f;
}

test('default OFF stages an encrypted non-READY proposal and makes zero external calls',async t=>{
 const f=fixture(t,{enabled:false}),g=f.prepare();assert.equal(g.state,'STAGED');const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(g.key);assert.equal(row.state,COLLECTOR_STAGED);assert.ok(!row.body.includes(PHONE));assert.equal((await f.runtime.dispatch(g.key)).disabled,true);assert.equal(f.sends,0);assert.equal(f.financialCalls,0);assert.equal(f.runtime.capabilities().businessWrites,false);
 const defaultRuntime=createCollector({store:f.store});assert.equal(defaultRuntime.capabilities().defaultOff,true);assert.equal((await defaultRuntime.dispatch(g.key)).disabled,true);assert.equal(f.sends,0);
});
test('row order, wording-independent dates and manifest identifiers do not mint another obligation/group attempt',t=>{
 const f=fixture(t),first=f.prepare();f.at+=1000;const m=f.manifest([...f.rows].reverse());m.manifestId='another-task-and-date';m.sourceHash=digest('another review');f.review(m);const again=f.runtime.prepare(m);assert.equal(again.key,first.key);assert.equal(again.duplicate,true);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM collector_claims').get().n,2);assert.equal(groupKey(scope,f.rows),groupKey(scope,[...f.rows].reverse()));assert.equal(obligationKey(scope,ORDER_A),obligationKey(scope,clone(f.rows)[0].obligationId));
});
test('overlapping groups reserve all obligations or none, including across recipient corrections',t=>{
 const f=fixture(t),first=f.prepare();f.store.db.prepare("UPDATE outbox SET state='REVIEW' WHERE id=?").run(first.key);
 const c={...clone(f.rows[0]),obligationId:ORDER_C},overlap=[f.rows[1],c];assert.throws(()=>f.prepare(overlap),/COLLECTOR_OBLIGATION_ALREADY_CLAIMED/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM collector_groups').get().n,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM collector_claims').get().n,2);
 f.addContact(OTHER);assert.throws(()=>f.prepare(f.rows.map(r=>({...r,phone:OTHER}))),/COLLECTOR_OBLIGATION_ALREADY_CLAIMED/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM collector_groups').get().n,1);
});
test('missing financial reader returns REVIEW with zero sends; a reviewed export alone cannot authorize a send',async t=>{
 const f=fixture(t,{missingFinancial:true}),g=f.prepare(),r=await f.runtime.dispatch(g.key);assert.equal(r.state,'REVIEW');assert.equal(r.reason,'COLLECTOR_LIVE_READERS_REQUIRED');assert.equal(f.sends,0);
});
test('balance or accounting revision changes invalidate the proposal instead of silently repricing it',async t=>{
 for(const patch of [{balanceMinor:1},{financialRevision:digest('different revision')},{balanceMinor:0},{currency:'USD'}]){
  const f=fixture(t),g=f.prepare();f.financialRowPatch=patch;const r=await f.runtime.dispatch(g.key);assert.equal(r.state,'REVIEW');assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT state FROM collector_claims LIMIT 1').get().state,'REVIEW');
 }
});
test('foreign tenant/client, recipient or original line cannot be adopted from a financial proof',async t=>{
 for(const [financialPatch,financialRowPatch] of [[{tenantId:'foreign'},{}],[{companyId:'foreign'},{}],[{}, {phone:OTHER}],[{}, {originLine:RED}],[{}, {clientId:'OTHER_CLIENT'}]]){
  const f=fixture(t),g=f.prepare();f.financialPatch=financialPatch;f.financialRowPatch=financialRowPatch;assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);
 }
});
test('unread originals, paid claims, disputes, incomplete RED history, optouts and human holds are blockers',async t=>{
 for(const patch of [{mediaReviewComplete:false},{bothLinesComplete:false},{coveredLines:[BLUE]},{pendingPaymentClaim:true},{optOut:true},{humanHold:true},{identityVerified:false},{originalLineVerified:false},{phone:OTHER},{originLine:RED}]){
  const f=fixture(t),g=f.prepare();f.nativePatch=patch;assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);
 }
 for(const patch of [{paidClaim:true},{pendingEvidence:true},{disputed:true}]){
  const f=fixture(t),g=f.prepare();f.financialRowPatch=patch;assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);
 }
});
test('current attention is mandatory and cannot release optouts, paused chats or a disabled original line',async t=>{
 for(const patch of [{humanHold:true},{optOut:true},{paidClaim:true},{complete:false},{lineAllowed:false},{ownerVerified:false},{channelOpen:false}]){
  const f=fixture(t),g=f.prepare();f.attentionPatch=patch;assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);
 }
 const f=fixture(t),g=f.prepare();f.store.db.prepare('UPDATE conversations SET hold=1 WHERE phone=?').run(PHONE);assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);
});
test('stale or future financial proofs and expired manifests are not current authorization',async t=>{
 for(const delta of [-PROOF_TTL_MS-1,1]){const f=fixture(t),g=f.prepare();f.financialPatch={checkedAt:f.at+delta};assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);}
 const f=fixture(t),g=f.prepare();f.at+=PROOF_TTL_MS;assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);
});
test('changed balance/history, new local intervention and lag during awaits block the atomic claim',async t=>{
 for(const mode of ['balance','history','local','lag']){
  const f=fixture(t),g=f.prepare();
  if(mode==='balance')f.financialHook=()=>{if(f.financialCalls===2)f.financialRowPatch={balanceMinor:1}};
  if(mode==='history')f.nativeHook=()=>{if(f.nativeCalls===2)f.nativePatch={historyHash:digest('new native payment')}};
  if(mode==='local')f.attentionHook=()=>{if(f.attentionCalls===2)f.store.db.prepare('UPDATE conversations SET revision=revision+1 WHERE phone=?').run(PHONE)};
  if(mode==='lag')f.currentStateHook=()=>{f.at+=5001};
  assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW',mode);assert.equal(f.sends,0,mode);
 }
});
test('two concurrent workers share a durable atomic group claim and attempt the provider once',async t=>{
 const f=fixture(t,{disk:true}),g=f.prepare(),other=f.worker();await Promise.all([f.runtime.dispatch(g.key),other.dispatch(g.key)]);assert.equal(f.sends,1);assert.equal(f.runtime.status(g.key).state,'ACCEPTED');assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM collector_ledger WHERE group_key=? AND state='SENDING'").get(g.key).n,1);
});
test('timeout after durable reservation remains UNCERTAIN across restart and cannot retry or prove a guessed MID',async t=>{
 const f=fixture(t,{disk:true}),g=f.prepare();f.sendError=true;assert.equal((await f.runtime.dispatch(g.key)).state,'UNCERTAIN');f.restart();assert.equal((await f.runtime.dispatch(g.key)).duplicate,true);assert.equal((await f.runtime.proveDelivery(g.key)).deliveryVerified,false);assert.equal(f.sends,1);assert.equal(f.store.db.prepare('SELECT state FROM collector_claims LIMIT 1').get().state,'UNCERTAIN');
});
test('interrupted SENDING needs explicit proof that its exact worker/attempt died before recovery',async t=>{
 const f=fixture(t,{disk:true}),g=f.prepare();const saved=f.store.db.prepare('SELECT body FROM collector_groups WHERE group_key=?').get(g.key),value=f.store.open(saved.body);value.attempt={id:'synthetic-interrupted-attempt',workerId:'dead-worker',startedAt:f.at};f.store.db.prepare("UPDATE collector_groups SET state='SENDING',body=? WHERE group_key=?").run(f.store.seal(value),g.key);f.store.db.prepare("UPDATE collector_claims SET state='SENDING' WHERE group_key=?").run(g.key);f.store.db.prepare("UPDATE outbox SET state='SENDING' WHERE id=?").run(g.key);f.restart();assert.equal(f.runtime.status(g.key).state,'SENDING');assert.equal((await f.runtime.recoverInterrupted(g.key)).reason,'COLLECTOR_DEAD_PROCESS_PROOF_REQUIRED');f.deadConfirmed=true;assert.equal((await f.runtime.recoverInterrupted(g.key)).state,'UNCERTAIN');await f.runtime.dispatch(g.key);assert.equal(f.sends,0);
});
test('ACCEPTED is not delivery; only the exact native MID/PN/line/literal and delivery ACK qualify',async t=>{
 const f=fixture(t),g=f.prepare();const accepted=await f.runtime.dispatch(g.key);assert.equal(accepted.deliveryVerified,false);assert.equal(accepted.state,'ACCEPTED');
 for(const patch of [{nativeAck:'SERVER_ACK'},{nativeAck:'SENT'},{nativeAck:3},{mid:'OTHER_NATIVE_MID'},{phone:OTHER},{line:RED},{fromMe:false},{text:'different amount'},{unmodified:false},{checkedAt:f.at-PROOF_TTL_MS-1}]){
  f.deliveryPatch=patch;assert.equal((await f.runtime.proveDelivery(g.key)).deliveryVerified,false);assert.equal(f.runtime.status(g.key).state,'ACCEPTED');
 }
 f.deliveryPatch={};const proven=await f.runtime.proveDelivery(g.key);assert.equal(proven.state,'DELIVERED');assert.equal(proven.deliveryVerified,true);assert.equal(proven.deliveredAt,null);assert.equal(f.sends,1);assert.equal((await f.runtime.dispatch(g.key)).duplicate,true);
});
test('manifest rejects extra eligibility claims, identity mixing and amount overflow',t=>{
 const f=fixture(t),m=f.manifest();assert.throws(()=>f.runtime.prepare({...m,eligible:true}),/COLLECTOR_FINITE_MANIFEST_REQUIRED/);
 assert.throws(()=>f.prepare(f.rows.map((r,i)=>i?{...r,originLine:RED}:r)),/COLLECTOR_GROUP_IDENTITY_OR_AMOUNT_REQUIRED/);
 assert.throws(()=>f.prepare(f.rows.map(r=>({...r,balanceMinor:Number.MAX_SAFE_INTEGER}))),/COLLECTOR_AMOUNT_OVERFLOW/);
 const exact=f.prepare([{...f.rows[0],balanceMinor:Number.MAX_SAFE_INTEGER}]);assert.ok(f.store.open(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(exact.key).body).includes('$90.071.992.547.409,91 COP'));
});
test('factory pins the real FUM tenant/company and BLUE/RED bindings rather than trusting caller-selected scope',t=>{
 const f=fixture(t);
 for(const wrong of [{...scope,tenantId:'foreign-tenant'},{...scope,companyId:'foreign-company'},{...scope,lines:[BLUE,'573000000099']}])assert.throws(()=>createCollector({scope:wrong,store:f.store}),/COLLECTOR_OWN_SCOPE_REQUIRED/);
 assert.equal(Object.isFrozen(COLLECTION_SCOPE),true);assert.equal(Object.isFrozen(COLLECTION_SCOPE.lines),true);
});
test('attention and native delivery proofs require the fixed financial scope plus current exact owner/instance',async t=>{
 for(const patch of [{tenantId:'foreign'},{companyId:'foreign'},{company:'other'},{ownerPhone:RED},{instance:'other-instance'}]){
  const f=fixture(t),g=f.prepare();f.attentionPatch=patch;assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);
 }
 const f=fixture(t),g=f.prepare();await f.runtime.dispatch(g.key);
 for(const patch of [{tenantId:'foreign'},{companyId:'foreign'},{company:'other'},{ownerPhone:RED},{instance:'other-instance'},{ownerVerified:false}]){f.deliveryPatch=patch;assert.equal((await f.runtime.proveDelivery(g.key)).deliveryVerified,false);assert.equal(f.runtime.status(g.key).state,'ACCEPTED');}
});
test('positive exported balance cannot replace accepted due basis, reconciled credits/courtesy or cash collected from the customer',async t=>{
 for(const field of Object.keys(basis)){
  const f=fixture(t),g=f.prepare();f.financialRowPatch={[field]:field==='provenanceHash'?undefined:false};assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW',field);assert.equal(f.sends,0,field);
 }
});
test('permission, deferral and the applicable Bogota contact window are mandatory, without inferring a new grant',async t=>{
 for(const patch of [{contactPermissionVerified:false},{contactDeferralClear:false},{contactPurpose:'marketing'}]){const f=fixture(t),g=f.prepare();f.nativePatch=patch;assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);}
 for(const patch of [{contactAllowedNow:false},{permittedContactWindow:null},{permittedContactWindow:{from:0,to:1,timezone:'America/Bogota',sourceHash:digest('expired window')}}]){const f=fixture(t),g=f.prepare();f.attentionPatch=patch;assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);}
});
test('a durable optout on RED and WAITING_COORDINATOR cannot be bypassed by clean current flags',async t=>{
 const optout=fixture(t),suffix=createHash('sha256').update(PHONE+':'+RED).digest('hex');optout.store.db.prepare('INSERT INTO meta VALUES(?,?)').run('commercial-optout:fumigacion:'+suffix,optout.store.seal({kind:'no-contact'}));assert.throws(()=>optout.prepare(),/COLLECTOR_DURABLE_OPTOUT_PRESERVED/);assert.equal(optout.sends,0);
 const pending=fixture(t),g=pending.prepare();pending.store.db.prepare("INSERT INTO events(id,phone,line,at,from_me,body,state,revision) VALUES(?,?,?,?,0,?,'WAITING_COORDINATOR',7)").run('pending-source',PHONE,BLUE,pending.at,pending.store.seal({text:'Ya pagué al técnico'}));assert.equal((await pending.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(pending.sends,0);
});
test('literal copy identifies verified commercial reference, service and date without claiming a fresh today',t=>{
 const f=fixture(t),g=f.prepare(),text=f.store.open(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(g.key).body);assert.ok(text.includes('REF-A · Control de cucarachas · 2026-10-21'));assert.ok(text.includes('REF-B · Tratamiento de chinches · 2026-10-22'));assert.ok(!text.includes('hoy'));
 const m=f.manifest();m.rows[0].serviceDate='2026-02-30';assert.throws(()=>f.runtime.prepare(m),/COLLECTOR_GROUP_IDENTITY_OR_AMOUNT_REQUIRED/);
});
test('an exact literal ACK with unproven send chronology stays textual evidence rather than strict delivery',async t=>{
 const f=fixture(t),g=f.prepare();await f.runtime.dispatch(g.key);
 for(const patch of [{nativeSentAt:f.at-1000},{nativeSentAt:undefined},{nativeSentAt:f.at+1000},{attemptAt:f.at-1}]){f.deliveryPatch=patch;const proof=await f.runtime.proveDelivery(g.key);assert.equal(proof.textualAckVerified,true);assert.equal(proof.deliveryVerified,false);assert.equal(f.runtime.status(g.key).state,'ACCEPTED');}
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM collector_ledger WHERE state='ACK_OBSERVED'").get().n,4);assert.equal(f.sends,1);
});
test('constructing another adapter never recovers a live worker; group/outbox acceptance uses one conditional transaction',async t=>{
 const f=fixture(t),g=f.prepare();f.sendHook=async()=>{const other=f.open();assert.equal(other.status(g.key).state,'SENDING');assert.equal((await other.dispatch(g.key)).duplicate,true);assert.equal((await other.recoverInterrupted(g.key)).reason,'COLLECTOR_DEAD_PROCESS_PROOF_REQUIRED');};assert.equal((await f.runtime.dispatch(g.key)).state,'ACCEPTED');assert.equal(f.sends,1);
 const raced=fixture(t),r=raced.prepare();raced.sendHook=()=>raced.store.db.prepare("UPDATE outbox SET state='UNCERTAIN' WHERE id=?").run(r.key);assert.equal((await raced.runtime.dispatch(r.key)).state,'UNCERTAIN');assert.equal(raced.store.db.prepare("SELECT COUNT(*) n FROM collector_ledger WHERE state='ACCEPTED'").get().n,0);assert.equal((await raced.runtime.dispatch(r.key)).duplicate,true);assert.equal(raced.sends,1);
});

test('a delayed DELIVERY_ACK cannot degrade a concurrent READ on the current group, outbox or claims',async t=>{
 const f=fixture(t),g=f.prepare();await f.runtime.dispatch(g.key);const pending=[];
 f.deliveryHook=(_input,proof)=>new Promise(resolve=>pending.push({proof,resolve}));
 const first=f.runtime.proveDelivery(g.key),delayed=f.runtime.proveDelivery(g.key);assert.equal(pending.length,2);
 pending[0].resolve({...pending[0].proof,nativeAck:'READ'});assert.equal((await first).state,'READ');
 pending[1].resolve(pending[1].proof);const result=await delayed;assert.equal(result.deliveryVerified,true);assert.equal(result.state,'READ');
 assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(g.key).state,'READ');assert.equal(f.runtime.status(g.key).state,'READ');assert.ok(f.store.db.prepare('SELECT state FROM collector_claims WHERE group_key=?').all(g.key).every(c=>c.state==='READ'));assert.equal(f.sends,1);
});

test('a final native cross after the last attention await blocks new paid claims, history changes and stale final proofs',async t=>{
 for(const mode of ['paid-claim','history','slow-native','stale-native']){
  const f=fixture(t),g=f.prepare();
  f.attentionHook=async()=>{if(f.attentionCalls===2){await Promise.resolve();if(mode==='paid-claim')f.nativePatch={pendingPaymentClaim:true,historyHash:digest('payment arrived during final attention')};if(mode==='history')f.nativePatch={historyHash:digest('new native event during final attention')};}};
  if(mode==='slow-native')f.nativeHook=()=>{if(f.nativeCalls===3)f.at+=5001};
  if(mode==='stale-native')f.nativeHook=()=>{if(f.nativeCalls===3)f.nativePatch={checkedAt:f.at-5001}};
  const result=await f.runtime.dispatch(g.key);assert.equal(result.state,'REVIEW',mode);assert.equal(f.nativeCalls,3,mode);assert.equal(f.sends,0,mode);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM collector_ledger WHERE state='SENDING'").get().n,0,mode);
 }
});

test('only an exact host-reviewed manifest hash can stage a proposal; booleans, async receipts and revoked records cannot authorize it',async t=>{
 const unknown=fixture(t),m=unknown.manifest();unknown.reviewedManifestHashes.clear();assert.throws(()=>unknown.runtime.prepare(m),/COLLECTOR_VERIFIED_MANIFEST_REQUIRED/);assert.equal(unknown.store.db.prepare('SELECT COUNT(*) n FROM collector_claims').get().n,0);
 for(const resolver of [()=>true,async()=>true,input=>({...input.manifest,verified:true,same:true})]){
  const f=fixture(t);f.callbackOverrides={verifyManifest:resolver};f.runtime=f.open();assert.throws(()=>f.prepare(),/COLLECTOR_VERIFIED_MANIFEST_REQUIRED/);assert.equal(f.sends,0);
 }
 const changed=fixture(t),original=changed.manifest();original.rows[0].balanceMinor++;assert.throws(()=>changed.runtime.prepare(original),/COLLECTOR_VERIFIED_MANIFEST_REQUIRED/);
 const revoked=fixture(t),g=revoked.prepare();revoked.reviewedManifestHashes.clear();assert.equal((await revoked.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(revoked.backendCalls.length,0);assert.equal(revoked.sends,0);
});

test('manifest verification binds exact authority, original source, finite expiry and current review, including immediately before claim',async t=>{
 for(const patch of [{authorizationHash:digest('other authority')},{sourceHash:digest('other source')},{manifestHash:digest('other manifest')},{expiresAt:Date.parse('2026-11-12T20:10:00Z')},{checkedAt:Date.parse('2026-11-12T20:00:00Z')+1},{companyId:'foreign'}]){
  const f=fixture(t);f.manifestProofPatch=patch;assert.throws(()=>f.prepare(),/COLLECTOR_VERIFIED_MANIFEST_REQUIRED/);assert.equal(f.sends,0);
 }
 const f=fixture(t),g=f.prepare();f.nativeHook=()=>{if(f.nativeCalls===3)f.reviewedManifestHashes.clear()};assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM maria_collection_contexts').get().n,0);
});

test('trusted due-basis booleans cannot replace a current own backend reader or the fixed V2 bound source projection',async t=>{
 const missing=fixture(t);missing.callbackOverrides={financialReader:undefined};missing.runtime=missing.open();const g=missing.prepare();assert.equal((await missing.runtime.dispatch(g.key)).reason,'COLLECTOR_LIVE_READERS_REQUIRED');assert.equal(missing.sends,0);
 for(const mutate of [d=>d.schemaVersion='own-fumigacion-financial-sources-projection-v1',d=>d.tenantId='foreign',d=>d.advisorMembershipId=syntheticId(500),d=>d.cohortSha256=digest('other cohort'),d=>d.allowlistHash=digest('unapproved scope'),d=>d.coverage.completeForRequestedBindings=false,d=>d.snapshots[0].clientId=syntheticId(999),d=>d.snapshots[0].clientBinding.id=syntheticId(999),d=>d.snapshots[0].orderId=syntheticId(999),d=>d.snapshots[0].financialFingerprint=digest('changed'),d=>d.snapshots[0].bindingFingerprint='invalid',d=>d.snapshots[0].customerDebtVerified=true,d=>d.snapshots[0].collectionAuthorizedByThisRead=true,d=>d.snapshots[0].sourceConflicts.push('CASH_RECONCILIATION_REQUIRED'),d=>d.snapshots[1]=clone(d.snapshots[0])]){
  const f=fixture(t),p=f.prepare();f.backendPatch=mutate;assert.equal((await f.runtime.dispatch(p.key)).state,'REVIEW');assert.equal(f.sends,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM collector_ledger WHERE state='SENDING'").get().n,0);
 }
});

test('same=true REVIEW or an isolated same boolean is not a financial preflight, and revalidation cannot grant sending',async t=>{
 for(const mutate of [d=>{d.status='REVIEW';d.revalidationSucceeded=false;d.validUntil=null;d.results[0].requiresReview=true;},d=>d.revalidationSucceeded=false,d=>d.sendPermitted=true,d=>d.results[0].same=false,d=>d.results[0].requiresReview=true,d=>d.results=[],d=>d.snapshots[0].bindingFingerprint=digest('new binding')]){
  const f=fixture(t),g=f.prepare();f.backendPatch=(d,revalidate)=>{if(revalidate)mutate(d)};assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM maria_collection_contexts').get().n,0);
 }
});

test('backend chunks never exceed five and the final revalidation covers every exact immutable obligation/client binding',async t=>{
 const f=fixture(t);f.rows=Array.from({length:6},(_,i)=>({...clone(f.rows[0]),obligationId:syntheticId(i+1),financialRevision:digest('revision-'+i),commercialReference:'R'+i,serviceDescription:'Control'}));const g=f.prepare();assert.equal((await f.runtime.dispatch(g.key)).state,'ACCEPTED');
 assert.deepEqual(f.backendCalls.map(c=>[c.operation,c.body.orders.length]),[['snapshots',5],['snapshots',1],['snapshots',5],['snapshots',1],['revalidate',5],['revalidate',1]]);
 const revalidated=f.backendCalls.filter(c=>c.operation==='revalidate').flatMap(c=>c.body.orders);assert.deepEqual(revalidated.map(r=>r.orderId),f.rows.map(r=>r.obligationId));assert.ok(revalidated.every(r=>r.expectedClientId===CLIENT_A&&r.expectedFinancialFingerprint===f.rows.find(row=>row.obligationId===r.orderId).financialRevision&&r.expectedBindingFingerprint===digest('binding:'+r.orderId)));assert.equal(f.sends,1);
});

test('stale or future backend projections and lag in final revalidation never reserve a send',async t=>{
 for(const mutate of [d=>d.checkedAt=new Date(Date.parse(d.checkedAt)+1).toISOString(),d=>d.financialReadStartedAt=new Date(Date.parse(d.checkedAt)-30001).toISOString(),d=>d.validUntil=new Date(Date.parse(d.financialReadStartedAt)+30001).toISOString(),d=>d.validUntil=d.checkedAt]){
  const f=fixture(t),g=f.prepare();f.backendPatch=mutate;assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);
 }
 const f=fixture(t),g=f.prepare();let capture;f.backendHook=op=>{if(op==='revalidate'){capture=f.at;f.at+=5001}};f.backendPatch=(data,revalidate)=>{if(revalidate){data.financialReadStartedAt=new Date(capture).toISOString();data.checkedAt=new Date(f.at).toISOString();data.validUntil=new Date(capture+30000).toISOString()}};assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);
});

test('real durable context is committed before the send callback and associated to the exact accepted MID afterwards',async t=>{
 const f=fixture(t),g=f.prepare();f.sendHook=()=>{const row=f.store.db.prepare('SELECT * FROM maria_collection_contexts WHERE outbox_id=?').get(g.key),v=f.store.open(row.body),group=f.store.open(f.store.db.prepare('SELECT body FROM collector_groups WHERE group_key=?').get(g.key).body);assert.equal(row.mid,null);assert.equal(row.attempt_id,group.attempt.id);assert.equal(v.manifestHash,group.manifestHash);assert.equal(v.textHash,group.textHash);assert.equal(v.text,group.text);assert.deepEqual(v.orderIds,f.rows.map(r=>r.obligationId));assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM maria_collection_context_obligations').get().n,2);assert.equal(f.store.db.isTransaction,false);};
 assert.equal((await f.runtime.dispatch(g.key)).state,'ACCEPTED');const context=f.store.db.prepare('SELECT * FROM maria_collection_contexts WHERE outbox_id=?').get(g.key);assert.equal(context.mid,'NATIVE_COLLECTOR_MID_0001');assert.ok(!context.body.includes(PHONE));assert.equal(f.runtime.capabilities().replyContextIntegrationInstalled,false);assert.equal(f.runtime.capabilities().productionReady,false);
});

test('context persistence failure rolls back before SENDING and zero provider attempts; failed MID association stays uncertain without retry',async t=>{
 const f=fixture(t),g=f.prepare();f.store.db.exec("CREATE TRIGGER reject_collection_context BEFORE INSERT ON maria_collection_contexts BEGIN SELECT RAISE(ABORT,'synthetic context storage failure'); END;");assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM maria_collection_contexts').get().n,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM collector_ledger WHERE state='SENDING'").get().n,0);assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(g.key).state,COLLECTOR_STAGED);
 const mid=fixture(t),p=mid.prepare();mid.store.db.exec("CREATE TRIGGER reject_collection_mid BEFORE UPDATE OF mid ON maria_collection_contexts BEGIN SELECT RAISE(ABORT,'synthetic association failure'); END;");assert.equal((await mid.runtime.dispatch(p.key)).state,'UNCERTAIN');assert.equal(mid.sends,1);assert.equal(mid.store.db.prepare('SELECT mid FROM outbox WHERE id=?').get(p.key).mid,null);assert.equal(mid.store.db.prepare('SELECT mid FROM maria_collection_contexts WHERE outbox_id=?').get(p.key).mid,null);assert.equal((await mid.runtime.dispatch(p.key)).duplicate,true);assert.equal(mid.sends,1);
});

test('the durable context must belong to the same Store and pending collection review blocks another clean proof',async t=>{
 const f=fixture(t);const other=new Store(':memory:','fumigacion',randomBytes(32));t.after(()=>other.close());f.contextDecorator=()=>createMariaCollectionsContext({store:other,enabled:true,now:()=>f.at});f.runtime=f.open();const g=f.prepare();assert.equal((await f.runtime.dispatch(g.key)).reason,'COLLECTOR_DURABLE_CONTEXT_REQUIRED');assert.equal(f.sends,0);
 const pending=fixture(t),p=pending.prepare();await pending.runtime.dispatch(p.key);
 // Existing human-review processing writes the durable reply through the real context.
 const event={id:'SYNTHETIC_PAYMENT_REPLY_0001',phone:PHONE,line:BLUE,fromMe:false,at:pending.at+1,text:'Ya pagué',kind:'text',jid:PHONE+'@s.whatsapp.net'};pending.at++;pending.store.enqueue(event);assert.equal(pending.context.inspectIncoming(event).consumed,true);
 const next={...clone(pending.rows[0]),obligationId:ORDER_C};assert.throws(()=>pending.prepare([next]),/COLLECTOR_DURABLE_COLLECTION_REVIEW/);assert.equal(pending.sends,1);
});

test('callback inputs are immutable snapshots and arbitrary alternate obligation identifiers cannot mint another key',async t=>{
 const f=fixture(t),g=f.prepare();f.financialHook=input=>{assert.ok(Object.isFrozen(input));assert.ok(Object.isFrozen(input.rows[0]));assert.throws(()=>input.rows[0].balanceMinor=1,TypeError);assert.ok(Object.isFrozen(input.financialSnapshot.snapshots[0]));};assert.equal((await f.runtime.dispatch(g.key)).state,'ACCEPTED');
 assert.throws(()=>f.prepare([{...clone(f.rows[0]),obligationId:'new-wording-for-same-order'}]),/COLLECTOR_GROUP_IDENTITY_OR_AMOUNT_REQUIRED/);assert.throws(()=>obligationKey(scope,ORDER_A.toUpperCase().replace('00000000','ABCDEF00')),/COLLECTOR_OBLIGATION_ID_REQUIRED/);assert.equal(f.sends,1);
});

test('a fabricated or disabled context object cannot certify durable reply integration',async t=>{
 for(const decorate of [context=>({...context}),()=>({store:null,registerAttempt:()=>true,assertAttempt:()=>true,attachMid:()=>true,hasReviewBlock:()=>false})]){
  const f=fixture(t);f.contextDecorator=decorate;f.runtime=f.open();const g=f.prepare();assert.equal((await f.runtime.dispatch(g.key)).reason,'COLLECTOR_DURABLE_CONTEXT_REQUIRED');assert.equal(f.backendCalls.length,0);assert.equal(f.sends,0);
 }
 const f=fixture(t);f.contextDecorator=()=>createMariaCollectionsContext({store:f.store});f.runtime=f.open();const g=f.prepare();assert.equal((await f.runtime.dispatch(g.key)).reason,'COLLECTOR_DURABLE_CONTEXT_REQUIRED');assert.equal(f.sends,0);
});

test('changing durable proposal during preflight or exact attempt/outbox during send cannot be accepted under the old evidence',async t=>{
 const f=fixture(t),g=f.prepare();f.nativeHook=()=>{if(f.nativeCalls===3){const record=f.store.db.prepare('SELECT body FROM collector_groups WHERE group_key=?').get(g.key),value=f.store.open(record.body);value.text+=' Corregido';value.textHash=digest(value.text);f.store.db.prepare('UPDATE collector_groups SET body=? WHERE group_key=?').run(f.store.seal(value),g.key);f.store.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(f.store.seal(value.text),g.key);}};assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM maria_collection_contexts').get().n,0);
 for(const mode of ['attempt','recipient','literal']){
  const changed=fixture(t),p=changed.prepare();changed.sendHook=()=>{if(mode==='attempt'){const raw=changed.store.db.prepare('SELECT body FROM collector_groups WHERE group_key=?').get(p.key),value=changed.store.open(raw.body);value.attempt.id=digest('other attempt');changed.store.db.prepare('UPDATE collector_groups SET body=? WHERE group_key=?').run(changed.store.seal(value),p.key);}else if(mode==='recipient')changed.store.db.prepare('UPDATE outbox SET phone=? WHERE id=?').run(OTHER,p.key);else changed.store.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(changed.store.seal('changed literal'),p.key);};
  assert.equal((await changed.runtime.dispatch(p.key)).state,'UNCERTAIN',mode);assert.equal(changed.sends,1,mode);assert.equal(changed.store.db.prepare("SELECT COUNT(*) n FROM collector_ledger WHERE state='ACCEPTED'").get().n,0,mode);assert.equal((await changed.runtime.dispatch(p.key)).duplicate,true,mode);
 }
});

test('the real generated reminder passes the unchanged public policy and actual Transport.send with a mocked provider',async t=>{
 const f=fixture(t),providerCalls=[];
 const transport=new Transport({company:'fumigacion',enabled:true,provider:'https://synthetic-provider.invalid',lines:[{phone:BLUE,instance:'cucaracha-azul',apiKey:'synthetic-only'}]},async(target,options)=>{providerCalls.push({target,body:JSON.parse(options.body)});assert.equal(target,'https://synthetic-provider.invalid/message/sendText/cucaracha-azul');return new Response(JSON.stringify({key:{id:'NATIVE_COLLECTOR_MID_0001'}}));});
 f.callbackOverrides={send:async(row,text)=>{f.sends++;assert.equal(publicTextSafe(text),true);assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(row.id).state,'SENDING');assert.ok(f.store.db.prepare('SELECT 1 FROM maria_collection_contexts WHERE outbox_id=?').get(row.id));return transport.send(row,text);}};f.runtime=f.open();
 const g=f.prepare(),text=f.store.open(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(g.key).body);
 assert.equal(publicTextSafe('Si ya pagaste o tienes un soporte, compártelo para que lo revise el equipo. Gracias.'),false);assert.equal(publicTextSafe(text),true);assert.ok(text.includes('Si ya pagaste o tienes un soporte, puedes compartirlo para verificarlo antes de continuar. Gracias por tu ayuda.'));
 assert.equal((await f.runtime.dispatch(g.key)).state,'ACCEPTED');assert.equal(f.sends,1);assert.equal(providerCalls.length,1);assert.equal(providerCalls[0].body.text,text);assert.equal(providerCalls[0].body.number,PHONE);
});

test('unsafe generated copy is rejected before claims and invokes none of the otherwise-allowing live callbacks',t=>{
 const f=fixture(t),rows=f.rows.map(r=>({...r,serviceDescription:'Webhook'}));assert.throws(()=>f.prepare(rows),/COLLECTOR_PUBLIC_TEXT_REVIEW/);
 for(const table of ['collector_groups','collector_claims','collector_ledger','outbox','maria_collection_contexts'])assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0,table);
 assert.equal(f.backendCalls.length,0);assert.equal(f.financialCalls,0);assert.equal(f.nativeCalls,0);assert.equal(f.attentionCalls,0);assert.equal(f.sends,0);assert.equal(f.runtime.capabilities().businessWrites,false);
});

test('unsafe already-staged or changed-before-claim text remains REVIEW without SENDING, UNCERTAIN, provider attempt or context',async t=>{
 for(const mode of ['already-staged','after-native']){
  const f=fixture(t),g=f.prepare(),makeUnsafe=()=>{const raw=f.store.db.prepare('SELECT body FROM collector_groups WHERE group_key=?').get(g.key),v=f.store.open(raw.body);v.text='Si ya pagaste, compártelo para que lo revise el equipo.';v.textHash=digest(v.text);assert.equal(publicTextSafe(v.text),false);f.store.db.prepare('UPDATE collector_groups SET body=? WHERE group_key=?').run(f.store.seal(v),g.key);f.store.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(f.store.seal(v.text),g.key);};
  if(mode==='already-staged')makeUnsafe();else f.nativeHook=()=>{if(f.nativeCalls===3)makeUnsafe()};
  const result=await f.runtime.dispatch(g.key);assert.equal(result.state,'REVIEW',mode);assert.equal(result.reason,'COLLECTOR_PUBLIC_TEXT_REVIEW',mode);assert.equal(result.businessWrites,0,mode);assert.equal(f.sends,0,mode);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM collector_ledger WHERE state IN ('SENDING','UNCERTAIN')").get().n,0,mode);assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(g.key).state,COLLECTOR_STAGED,mode);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM maria_collection_contexts').get().n,0,mode);
  if(mode==='already-staged'){assert.equal(f.backendCalls.length,0);assert.equal(f.financialCalls,0);assert.equal(f.nativeCalls,0);assert.equal(f.attentionCalls,0);}
 }
});

test('financial capture-age is bounded at five seconds even when V2 checkedAt is now and its original TTL remains valid',async t=>{
 for(const captureAge of [29000,5001,5000]){
  const f=fixture(t),g=f.prepare();f.backendPatch=(data,revalidate)=>{if(revalidate){data.financialReadStartedAt=new Date(f.at-captureAge).toISOString();data.checkedAt=new Date(f.at).toISOString();data.validUntil=new Date(f.at-captureAge+30000).toISOString();}};
  const result=await f.runtime.dispatch(g.key),allowed=captureAge<=5000;assert.equal(result.state,allowed?'ACCEPTED':'REVIEW',String(captureAge));assert.equal(f.sends,allowed?1:0,String(captureAge));assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM collector_ledger WHERE state='SENDING'").get().n,allowed?1:0,String(captureAge));assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM maria_collection_contexts').get().n,allowed?1:0,String(captureAge));
 }
});
test('a valid observed MID survives ACK-context transaction rollback only as encrypted unverified UNCERTAIN evidence',async t=>{
 const f=fixture(t),g=f.prepare();f.store.db.exec("CREATE TRIGGER reject_collection_mid_r2 BEFORE UPDATE OF mid ON maria_collection_contexts BEGIN SELECT RAISE(ABORT,'synthetic association failure'); END;");const result=await f.runtime.dispatch(g.key);assert.equal(result.state,'UNCERTAIN');assert.equal(f.sends,1);const row=f.store.db.prepare("SELECT body FROM collector_ledger WHERE group_key=? AND state='UNCERTAIN' ORDER BY id DESC LIMIT 1").get(g.key),detail=f.store.open(row.body);assert.equal(detail.observedMid,'NATIVE_COLLECTOR_MID_0001');assert.equal(detail.midBindingVerified,false);assert.equal(detail.automaticRetry,false);assert.ok(detail.observedForAttempt);assert.equal(row.body.includes('NATIVE_COLLECTOR_MID_0001'),false);assert.equal(f.store.db.prepare('SELECT mid FROM outbox WHERE id=?').get(g.key).mid,null);assert.equal(f.store.db.prepare('SELECT mid FROM maria_collection_contexts WHERE outbox_id=?').get(g.key).mid,null);assert.equal(f.store.db.prepare("SELECT count(*) n FROM collector_ledger WHERE state='ACCEPTED'").get().n,0);assert.equal((await f.runtime.proveDelivery(g.key)).deliveryVerified,false);assert.equal((await f.runtime.dispatch(g.key)).duplicate,true);assert.equal(f.sends,1);
});
test('observed MID after changed outbox association remains unbound and cannot trigger a second send',async t=>{
 const f=fixture(t),g=f.prepare();f.sendHook=()=>f.store.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(f.store.seal('Changed while provider was sending'),g.key);assert.equal((await f.runtime.dispatch(g.key)).state,'UNCERTAIN');const detail=f.store.open(f.store.db.prepare("SELECT body FROM collector_ledger WHERE state='UNCERTAIN' ORDER BY id DESC LIMIT 1").get().body);assert.equal(detail.observedMid,'NATIVE_COLLECTOR_MID_0001');assert.equal(detail.midBindingVerified,false);assert.equal(f.store.db.prepare('SELECT mid FROM outbox').get().mid,null);assert.equal((await f.runtime.dispatch(g.key)).duplicate,true);assert.equal(f.sends,1);
});
test('native seconds300ms before exact local attempt remain literal ACK evidence, never strict delivery or a retry',async t=>{
 const f=fixture(t);f.at+=300;const g=f.prepare();assert.equal((await f.runtime.dispatch(g.key)).state,'ACCEPTED');f.deliveryPatch={nativeSentAt:Math.floor(f.at/1000)*1000};const proof=await f.runtime.proveDelivery(g.key);assert.equal(proof.textualAckVerified,true);assert.equal(proof.deliveryVerified,false);assert.equal(proof.reason,'COLLECTOR_NATIVE_SEND_ORDER_UNPROVEN');assert.equal(f.runtime.status(g.key).state,'ACCEPTED');assert.equal(f.store.db.prepare("SELECT count(*) n FROM collector_ledger WHERE state='ACK_OBSERVED'").get().n,1);assert.equal((await f.runtime.dispatch(g.key)).duplicate,true);assert.equal(f.sends,1);
});
test('final coordinated native/attention bundle is mandatory, scoped, history-consistent and captured without timestamp minting',async t=>{
 for(const mode of ['missing','guard','scope','phone','history','extra','minted','stale']){
  const f=fixture(t);if(mode==='missing')f.callbackOverrides={readCurrentState:undefined};
  if(mode==='guard')f.currentStatePatch={guard:'untyped'};if(mode==='scope')f.currentStatePatch={tenantId:'other'};if(mode==='phone')f.currentStatePatch={phone:OTHER};if(mode==='history')f.attentionPatch={historyHash:digest('unrelated attention history')};if(mode==='extra')f.currentStatePatch={complete:true};if(mode==='minted')f.currentStateHook=()=>{f.at+=1000;f.currentStatePatch={checkedAt:f.at}};if(mode==='stale')f.currentStateHook=()=>{f.at+=5001};f.runtime=f.open();const g=f.prepare(),result=await f.runtime.dispatch(g.key);assert.equal(result.state,'REVIEW',mode);assert.equal(f.sends,0,mode);assert.equal(f.store.db.prepare("SELECT count(*) n FROM collector_ledger WHERE state='SENDING'").get().n,0,mode);
 }
});
test('two-second callback latency refreshes FINAL financial proof and coherent state instead of consuming old attention',async t=>{
 const f=fixture(t),g=f.prepare();f.callbackLatencyMs=2000;const finalFinancial=[];f.financialHook=input=>{finalFinancial.push({checkedAt:input.financialSnapshot.checkedAt,backendOperation:f.backendCalls.at(-1).operation})};const result=await f.runtime.dispatch(g.key);assert.equal(result.state,'ACCEPTED');assert.equal(f.sends,1);assert.equal(f.financialCalls,3);assert.equal(f.currentStateCalls,1);assert.equal(finalFinancial.at(-1).backendOperation,'revalidate');assert.ok(finalFinancial.at(-1).checkedAt>finalFinancial[1].checkedAt);const receipt=f.store.open(f.store.db.prepare("SELECT body FROM collector_ledger WHERE state='SENDING'").get().body);assert.equal(receipt.financialCheckedAt,receipt.backendCheckedAt);assert.ok(f.at-receipt.financialCheckedAt<=5000);assert.ok(f.at-receipt.nativeCheckedAt<=5000);
});
test('final current-state latency beyond five seconds still stays REVIEW even with fresh completion metadata',async t=>{
 const f=fixture(t),g=f.prepare();f.callbackLatencyMs=2000;f.currentStateHook=()=>{f.at+=2000};assert.equal((await f.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(f.sends,0);assert.equal(f.store.db.prepare("SELECT count(*) n FROM collector_ledger WHERE state='SENDING'").get().n,0);
});
test('durable collection-review events and nested no-contact refusal stop the final local guard',async t=>{
 const held=fixture(t),g=held.prepare();held.currentStateHook=()=>held.store.db.prepare("INSERT INTO events(id,phone,line,at,from_me,body,state,revision) VALUES(?,?,?,?,0,?,'COLLECTION_REPLY_REVIEW',7)").run('SYNTHETIC_FINAL_COLLECTION_REVIEW',PHONE,RED,held.at,held.store.seal({text:'Do not interpret as acceptance'}));assert.equal((await held.runtime.dispatch(g.key)).state,'REVIEW');assert.equal(held.sends,0);
 const refusal=fixture(t),p=refusal.prepare();refusal.currentStateHook=()=>{const c=refusal.store.conversation(PHONE);refusal.store.saveConversation(PHONE,{...c.state,commercialRefusal:{kind:'no-contact'}})};assert.equal((await refusal.runtime.dispatch(p.key)).state,'REVIEW');assert.equal(refusal.sends,0);
});
