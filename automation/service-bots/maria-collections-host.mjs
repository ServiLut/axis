import {createMariaCollections,digest,groupKey,COLLECTION_SCOPE} from './maria-collections.mjs';
import {createMariaCollectionsNative,mariaCollectionsNativeSource} from './maria-collections-native.mjs';
import {createMariaCollectionsContext,isMariaCollectionsContext} from './maria-collections-context.mjs';
import {createMariaFinancialReaderRuntime,MARIA_FINANCIAL_SCOPE,MARIA_FINANCIAL_APPROVED_SCOPES} from './maria-financial-reader.mjs';
import {Transport} from './transport.mjs';
import {knownInternalRecipient,outboundRecipientAllowed} from './config.mjs';
import {operationalLineAllowed} from './line-scope.mjs';
import {publicOperationAllowed} from './public-response-window.mjs';

export const MARIA_COLLECTIONS_HOST_GUARD='own-pinned-reviewed-collection-host-v1';
export const MARIA_COLLECTIONS_AUTHORITY_MAX_EXPIRY='2026-11-13T00:00:00.000Z';
export const MARIA_COLLECTIONS_AUTHORITY_REFERENCE='direct-user-own-empathetic-collections-20261112';
const SCOPE={company:COLLECTION_SCOPE.company,tenantId:COLLECTION_SCOPE.tenantId,companyId:COLLECTION_SCOPE.companyId};
const HASH=/^[a-f0-9]{64}$/,ID=/^[A-Za-z0-9:_-]{1,160}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,PN=/^57\d{10}$/,MID=/^[A-Za-z0-9_-]{8,100}$/;
const evidenceFlags={PRICE_ACCEPTANCE:'commercialAcceptanceVerified',SERVICE_PERFORMED:'dueBasisVerified',CONTRACTUAL_DUE:'dueAndPayable',PAYMENTS_RECONCILED:'paymentsReconciled',CREDITS_RECONCILED:'creditsReconciled',BONUS_COURTESY_RECONCILED:'bonusCourtesyReconciled',FUNDS_EVIDENCE_RECONCILED:'fundsEvidenceReconciled',CUSTOMER_CASH_RECONCILED:'informedCashCollectionsChecked',CUSTOMER_BALANCE_SUPPORTED:'customerBalanceSupported',ORIGINAL_SOURCES_REVIEWED:'originalSourcesVerified'};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
const own=v=>Object.entries(SCOPE).every(([k,value])=>v?.[k]===value);
const fail=reason=>{throw Error('COLLECTIONS_HOST_'+reason)};
const need=(ok,reason)=>{if(!ok)fail(reason)};
const fresh=(at,now,max=120000)=>Number.isSafeInteger(at)&&at>=0&&at<=now&&now-at<=max;
const frozen=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const child of Object.values(v))frozen(child);}return v};
const copy=v=>frozen(structuredClone(v));
const same=(a,b)=>digest(a)===digest(b);
const safeReason=e=>/^(?:COLLECTIONS_HOST|COLLECTOR_NATIVE|COLLECTOR)_[A-Z0-9_]+$/.test(e?.message??'')?e.message:'COLLECTIONS_HOST_SOURCE_UNAVAILABLE';
const isoMillis=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v?Date.parse(v):NaN;
export function collectionsReviewedRecordKey(reviewId){need(ID.test(reviewId??''),'REVIEW_ID_REQUIRED');return 'maria-collections-reviewed:'+digest(reviewId)+':v1';}

/** Isolated OFF-default host. Pins and resolver are authenticated host inputs,
 * never HTTP fields. The resolver synchronously reads the host's encrypted,
 * independently reviewed catalog; no record is auto-registered by this module.
 * The financial fetch seam is for the existing capability, not new credentials.
 */
export function createMariaCollectionsHost(config,store,transport,{authorization=null,catalogPins=[],resolveReviewedRecord,collectionsContext=null,enabled=false,financialFetch=globalThis.fetch,now=Date.now}={}){
 need(config?.company==='fumigacion'&&store?.company==='fumigacion'&&transport instanceof Transport&&transport.config===config&&['send','request','verifyLine','verifyLineBinding','currentAttention'].every(k=>transport[k]===Transport.prototype[k])&&typeof enabled==='boolean'&&typeof now==='function','OWN_RUNTIME_REQUIRED');
 const clock=()=>{const at=now();need(Number.isSafeInteger(at)&&at>=0,'CLOCK_REQUIRED');return at};
 const authority=authorization&&copy(authorization),authorityHash=authority?digest(authority):null;
 need(Array.isArray(catalogPins)&&catalogPins.length<=257,'FINITE_CATALOG_PINS_REQUIRED');
 const pins=copy(catalogPins);
 need(pins.every(p=>exact(p,'reviewId,recordHash,reviewSourceHash,authorityHash,sourceHashes')&&ID.test(p.reviewId??'')&&[p.recordHash,p.reviewSourceHash,p.authorityHash].every(h=>HASH.test(h??''))&&p.authorityHash===authorityHash&&Array.isArray(p.sourceHashes)&&p.sourceHashes.length>0&&p.sourceHashes.length<=128&&p.sourceHashes.every(h=>HASH.test(h??''))&&new Set(p.sourceHashes).size===p.sourceHashes.length)&&new Set(pins.map(p=>p.reviewId)).size===pins.length,'FINITE_CATALOG_PINS_REQUIRED');
 const context=collectionsContext??createMariaCollectionsContext({store,enabled:true,now});
 need(isMariaCollectionsContext(context,store),'REAL_SAME_STORE_CONTEXT_REQUIRED');
 const financialReader=createMariaFinancialReaderRuntime(config,store,{fetcher:financialFetch});
 const resolver=resolveReviewedRecord??(({reviewId})=>{const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get(collectionsReviewedRecordKey(reviewId));return row?store.open(row.value):null;});
 let last=null;
 const pending=(reason,extra={})=>{last={state:'NEEDS_REVIEW',dataStatus:'UNKNOWN',reason,checkedAt:clock()};return {guard:MARIA_COLLECTIONS_HOST_GUARD,...last,sends:0,businessWrites:0,automaticRetry:false,productionReady:false,...extra}};
 const selector=body=>{need(exact(body,'reviewId,recordHash')&&ID.test(body.reviewId??'')&&HASH.test(body.recordHash??''),'REVIEW_SELECTOR_ONLY_REQUIRED');const pin=pins.find(p=>p.reviewId===body.reviewId&&p.recordHash===body.recordHash);need(pin,'REVIEW_NOT_PINNED');return pin};
 const authorityValid=(historical=false)=>need(exact(authority,'reference,sourceHash,company,tenantId,companyId,expiresAt,oneOff')&&own(authority)&&authority.reference===MARIA_COLLECTIONS_AUTHORITY_REFERENCE&&HASH.test(authority.sourceHash??'')&&authority.oneOff===true&&Number.isSafeInteger(authority.expiresAt)&&authority.expiresAt<=Date.parse(MARIA_COLLECTIONS_AUTHORITY_MAX_EXPIRY)&&(historical||clock()<authority.expiresAt),'DIRECT_FINITE_AUTHORITY_REQUIRED');
 const timeBox=(v,historical=false)=>need(Number.isSafeInteger(v.reviewedAt)&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>v.reviewedAt&&v.expiresAt<=v.reviewedAt+120000&&(historical||fresh(v.reviewedAt,clock())&&clock()<v.expiresAt),'REVIEW_EXPIRED_OR_UNAVAILABLE');
 function recordFor(body,historical=false,candidate=null){
  const pin=selector(body);authorityValid(historical);need(typeof resolver==='function','REVIEW_CATALOG_UNAVAILABLE');
  const raw=candidate??resolver(copy({reviewId:pin.reviewId,recordHash:pin.recordHash}));
  need(exact(raw,'version,reviewId,authorityHash,reviewSourceHash,reviewedAt,expiresAt,manifest,nativeBasis,dueBasis')&&raw.version==='collector-reviewed-case-v1'&&raw.reviewId===pin.reviewId&&raw.authorityHash===authorityHash&&raw.reviewSourceHash===pin.reviewSourceHash&&digest(raw)===pin.recordHash,'REVIEW_RECORD_NOT_VERIFIED');
  const record=copy(raw),m=record.manifest,b=record.nativeBasis,d=record.dueBasis;timeBox(record,historical);
  need(exact(m,'version,manifestId,company,tenantId,companyId,reviewedAt,expiresAt,sourceHash,rows')&&m.version==='collector-finite-manifest-v1'&&own(m)&&ID.test(m.manifestId??'')&&HASH.test(m.sourceHash??'')&&pin.sourceHashes.includes(m.sourceHash)&&Array.isArray(m.rows)&&m.rows.length>0&&m.rows.length<=25,'MANIFEST_REVIEW_REQUIRED');timeBox(m,historical);
  need(m.expiresAt<=Math.min(record.expiresAt,authority.expiresAt)&&m.rows.every(r=>UUID.test(r.obligationId??'')&&UUID.test(r.clientId??'')&&PN.test(r.phone??'')&&!knownInternalRecipient(r.phone)&&!COLLECTION_SCOPE.lines.includes(r.phone)&&COLLECTION_SCOPE.lines.includes(r.originLine)&&r.currency==='COP'&&Number.isSafeInteger(r.balanceMinor)&&r.balanceMinor>0&&HASH.test(r.financialRevision??''))&&new Set(m.rows.map(r=>r.obligationId)).size===m.rows.length&&m.rows.every(r=>r.clientId===m.rows[0].clientId&&r.phone===m.rows[0].phone&&r.originLine===m.rows[0].originLine),'IMMUTABLE_OWN_OBLIGATIONS_REQUIRED');
  need(b&&b.manifestHash===digest(m)&&b.phone===m.rows[0].phone&&b.originLine===m.rows[0].originLine&&pin.sourceHashes.includes(b.reviewSourceHash)&&pin.sourceHashes.includes(b.coverage?.sourceHash)&&pin.sourceHashes.includes(b.permittedContactWindow?.sourceHash)&&Array.isArray(b.sources)&&b.sources.length>0&&Array.isArray(b.mediaReviews)&&b.mediaReviews.every(r=>pin.sourceHashes.includes(r.originalHash)&&pin.sourceHashes.includes(r.reviewHash)),'NATIVE_REVIEW_BASIS_REQUIRED');
  need(exact(d,'guard,manifestHash,reviewSourceHash,reviewedAt,expiresAt,rows')&&d.guard==='collector-reviewed-due-basis-v1'&&d.manifestHash===digest(m)&&pin.sourceHashes.includes(d.reviewSourceHash)&&Array.isArray(d.rows)&&d.rows.length===m.rows.length,'DUE_BASIS_REQUIRED');timeBox(d,historical);
  need(d.expiresAt<=Math.min(record.expiresAt,m.expiresAt),'DUE_BASIS_REQUIRED');
  for(const row of m.rows){
   const matches=d.rows.filter(r=>r.orderId===row.obligationId),r=matches[0];
   need(matches.length===1&&exact(r,'orderId,clientId,financialFingerprint,bindingFingerprint,currency,acceptedPriceMinor,acceptedAt,performedAt,dueAt,supportedBalanceMinor,evidence')&&r.clientId===row.clientId&&r.financialFingerprint===row.financialRevision&&HASH.test(r.bindingFingerprint??'')&&r.currency==='COP'&&Number.isSafeInteger(r.acceptedPriceMinor)&&r.acceptedPriceMinor>0&&r.supportedBalanceMinor===row.balanceMinor&&r.supportedBalanceMinor<=r.acceptedPriceMinor&&[r.acceptedAt,r.performedAt,r.dueAt].every(at=>Number.isSafeInteger(at)&&at>=0&&at<=d.reviewedAt)&&r.acceptedAt<=r.performedAt&&Array.isArray(r.evidence)&&r.evidence.length===Object.keys(evidenceFlags).length&&new Set(r.evidence.map(e=>e.kind)).size===r.evidence.length&&r.evidence.every(e=>exact(e,'kind,sourceHash')&&Object.hasOwn(evidenceFlags,e.kind)&&pin.sourceHashes.includes(e.sourceHash)),'DUE_OR_RECONCILIATION_EVIDENCE_REQUIRED');
  }
  return {pin,record};
 }
 function requireFinancialStatus(){
  const s=financialReader.status();need(s.configured===true&&s.enabled===true&&s.readOnly===true&&s.company==='FUMIGACION'&&s.tenantId===SCOPE.tenantId&&s.companyId===SCOPE.companyId&&s.actorId===MARIA_FINANCIAL_SCOPE.actorId&&MARIA_FINANCIAL_APPROVED_SCOPES.some(p=>p.count===s.configuredBoundOrders)&&['financialWritesEnabled','customerMessagesEnabled','customerNotesWritesEnabled','schedulersEnabled','collectionAuthorizedByThisRead'].every(k=>s[k]===false),'CURRENT_FINANCIAL_CAPABILITY_REQUIRED');
  return s;
 }
 function financialEvidence(record,snapshots){
  need(Array.isArray(snapshots)&&snapshots.length===record.manifest.rows.length,'CURRENT_FINANCIAL_BINDINGS_REQUIRED');
  for(const r of record.dueBasis.rows){const found=snapshots.filter(s=>s.orderId===r.orderId),s=found[0];need(found.length===1&&s.clientId===r.clientId&&s.financialFingerprint===r.financialFingerprint&&s.bindingFingerprint===r.bindingFingerprint&&Array.isArray(s.sourceConflicts)&&s.sourceConflicts.length===0&&s.reconciliationRequired===true&&['customerDebtVerified','bankReceiptVerified','serviceExecutionVerified','contractualDueDateVerified','collectionAuthorizedByThisRead'].every(k=>s[k]===false),'FINANCIAL_CHANGED_OR_REVIEW_PENDING');}
 }
 function sendGate(record){
  const r=record.manifest.rows[0],at=clock();return config.enabled===true&&outboundRecipientAllowed(config,r.phone)&&operationalLineAllowed(config,r.originLine)&&publicOperationAllowed(config,{line:r.originLine,sourceAt:at,createdAt:at},at)&&config.lines.some(l=>l.phone===r.originLine&&typeof l.apiKey==='string'&&l.apiKey.length>0);
 }
 function nativeFor(body,candidate=null){
  return createMariaCollectionsNative(config,store,transport,{now,resolveReviewedBasis:req=>{const current=recordFor(body,false,candidate).record;need(req.manifestHash===digest(current.manifest)&&req.key===groupKey(COLLECTION_SCOPE,current.manifest.rows),'NATIVE_MANIFEST_CHANGED');return current.nativeBasis;}});
 }
 function runtime(body,{historical=false}={}){
  const {record,pin}=recordFor(body,historical),key=groupKey(COLLECTION_SCOPE,record.manifest.rows);
  const native=nativeFor(body);
  const collector=createMariaCollections({store,authorization:authority,enabled,now,financialReader,replyContext:context,
   verifyManifest:input=>{const current=recordFor(body).record;need(input.manifestHash===digest(current.manifest)&&input.authorizationHash===authorityHash,'MANIFEST_NOT_PINNED');return {guard:'collector-verified-manifest-v1',...SCOPE,manifestHash:input.manifestHash,authorizationHash:authorityHash,sourceHash:current.manifest.sourceHash,checkedAt:current.reviewedAt,expiresAt:Math.min(current.expiresAt,current.manifest.expiresAt)};},
   readFinancialProof:async input=>{const current=recordFor(body).record;requireFinancialStatus();financialEvidence(current,input.financialSnapshot?.snapshots);return {guard:'collector-financial-proof-v1',...SCOPE,complete:true,checkedAt:input.financialSnapshot.checkedAt,rows:current.manifest.rows.map(r=>({...r,...Object.fromEntries(Object.values(evidenceFlags).map(k=>[k,true])),paidClaim:false,pendingEvidence:false,disputed:false,provenanceHash:digest({recordHash:pin.recordHash,dueBasis:current.dueBasis,financialFingerprint:r.financialRevision})}))};},
   readNativeHistory:async input=>{const proof=await native.readNativeHistory(input);return enabled&&!sendGate(record)?{...proof,bothLinesComplete:false,reason:'COLLECTIONS_HOST_CURRENT_SENDER_GATE_CLOSED'}:proof;},
   readCurrentAttention:input=>native.readCurrentAttention(input),readCurrentState:input=>native.readCurrentState(input),send:(row,text)=>transport.send(row,text),readNativeDelivery:readDelivery,
  });
  return {record,pin,key,native,collector};
 }
 async function preflight(body,candidate=null){
  const {record}=recordFor(body,false,candidate);requireFinancialStatus();const started=clock(),snapshots=[];
  for(let i=0;i<record.manifest.rows.length;i+=5){const r=await financialReader.snapshots({orders:record.manifest.rows.slice(i,i+5).map(v=>({orderId:v.obligationId,expectedClientId:v.clientId}))});need(fresh(isoMillis(r.financialReadStartedAt),clock(),5000),'FINANCIAL_CAPTURE_STALE');snapshots.push(...r.snapshots);}
  financialEvidence(record,snapshots);
  const native=nativeFor(body,candidate);need(typeof native.preflightReviewedManifest==='function','NATIVE_PREFLIGHT_UNAVAILABLE');const proof=await native.preflightReviewedManifest(record.manifest);
  need(proof?.complete===true&&proof.native?.bothLinesComplete===true&&proof.attention?.complete===true&&proof.native.historyHash===record.nativeBasis.historyHash&&proof.attention.historyHash===record.nativeBasis.historyHash&&fresh(proof.native.checkedAt,clock(),5000)&&fresh(proof.attention.checkedAt,clock(),5000),'CURRENT_NATIVE_REVIEW_PENDING');
  need(fresh(started,clock(),5000),'PREFLIGHT_CAPTURE_STALE');recordFor(body,false,candidate);requireFinancialStatus();need(sendGate(record),'CURRENT_SENDER_GATE_CLOSED');return {record,started};
 }
 async function readDelivery(input){
  const started=clock(),line=config.lines.find(l=>l.phone===input.line);need(line&&MID.test(input.mid??'')&&PN.test(input.phone??'')&&!knownInternalRecipient(input.phone),'EXACT_DELIVERY_INPUT_REQUIRED');
  const before=await transport.verifyLine(input.line);need(before?.phone===input.line&&before.instance===line.instance&&before.ownerVerified===true&&before.open===true,'EXACT_DELIVERY_OWNER_REQUIRED');
  const response=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{id:input.mid}},offset:2,page:1}),messages=response?.messages;
  need(messages?.total===1&&Array.isArray(messages.records)&&messages.records.length===1,'EXACT_NATIVE_MID_REQUIRED');
  const raw=messages.records[0],source=mariaCollectionsNativeSource(raw,input.phone,input.line),m=raw.message?.ephemeralMessage?.message??raw.message??{},text=m.conversation??m.extendedTextMessage?.text,updates=raw.MessageUpdate??[],statuses=[raw.status,...updates.map(u=>u.status)];
  need(source.id===input.mid&&source.fromMe===true&&source.media===false&&text===input.text&&!(typeof m.conversation==='string'&&typeof m.extendedTextMessage?.text==='string'&&m.conversation!==m.extendedTextMessage.text)&&statuses.every(s=>s==null||['PENDING','SERVER_ACK','DELIVERY_ACK','READ',1,2,3,4].includes(s)),'EXACT_NATIVE_TEXT_REQUIRED');
  for(const u of updates)need((u.keyId==null||u.keyId===input.mid)&&(u.messageId==null||u.messageId===input.mid||typeof raw.id==='string'&&u.messageId===raw.id)&&(u.instanceId==null||u.instanceId===raw.instanceId),'EXACT_NATIVE_ACK_ASSOCIATION_REQUIRED');
  const nativeAck=statuses.some(s=>s==='READ'||s===4)?'READ':statuses.some(s=>s==='DELIVERY_ACK'||s===3)?'DELIVERY_ACK':null;need(nativeAck,'NATIVE_DELIVERY_PENDING');
  const after=await transport.verifyLine(input.line);need(same(before,after)||after?.phone===before.phone&&after.instance===before.instance&&after.ownerVerified===true&&after.open===true,'EXACT_DELIVERY_OWNER_REQUIRED');need(fresh(started,clock(),5000),'DELIVERY_READ_TOO_SLOW');
  return {guard:'collector-native-delivery-v1',...SCOPE,mid:input.mid,phone:input.phone,line:input.line,ownerPhone:input.line,instance:line.instance,ownerVerified:true,fromMe:true,text,unmodified:true,sourceHash:digest(raw),nativeAck,attemptAt:input.attemptAt,nativeSentAt:source.at,checkedAt:started};
 }
 async function prepare(body){
  try{
   const {record}=recordFor(body),key=groupKey(COLLECTION_SCOPE,record.manifest.rows),hasLedger=store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='collector_groups'").get(),old=hasLedger&&store.db.prepare('SELECT state,body FROM collector_groups WHERE group_key=?').get(key);
   if(old){const saved=store.open(old.body);need(saved.manifestHash===digest(record.manifest)&&saved.authorizationHash===authorityHash,'PREVIOUS_OBLIGATION_REVIEW_PRESERVED');last={state:old.state,dataStatus:'UNKNOWN',checkedAt:clock()};return {guard:MARIA_COLLECTIONS_HOST_GUARD,state:old.state,key,reviewId:body.reviewId,duplicate:true,dataStatus:'UNKNOWN',sends:0,businessWrites:0,automaticRetry:false,productionReady:false};}
   const {started}=await preflight(body),active=runtime(body);
   const result=active.collector.prepare(record.manifest);last={state:result.state,dataStatus:'VERIFIED_REVIEWED_CASE',checkedAt:started};return {...result,guard:MARIA_COLLECTIONS_HOST_GUARD,reviewId:body.reviewId,dataStatus:last.dataStatus,sendingEnabled:enabled,productionReady:false};
  }catch(e){return pending(safeReason(e));}
 }
 async function installReviewedRecord(raw){
  try{
   need(raw&&typeof raw==='object'&&!Array.isArray(raw),'REVIEW_RECORD_NOT_VERIFIED');const candidate=copy(raw),body={reviewId:candidate.reviewId,recordHash:digest(candidate)};recordFor(body,false,candidate);
   const key=collectionsReviewedRecordKey(body.reviewId),old=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
   if(old){need(digest(store.open(old.value))===body.recordHash,'REVIEW_RECORD_ALREADY_EXISTS');last={state:'REVIEWED_RECORD_STORED',dataStatus:'UNKNOWN',checkedAt:clock()};return {guard:MARIA_COLLECTIONS_HOST_GUARD,state:'REVIEWED_RECORD_STORED',duplicate:true,dataStatus:'UNKNOWN',reviewId:body.reviewId,recordHash:body.recordHash,sends:0,businessWrites:0,productionReady:false};}
   const {started}=await preflight(body,candidate);
   store.tx(()=>{recordFor(body,false,candidate);requireFinancialStatus();need(fresh(started,clock(),5000)&&sendGate(candidate),'PREFLIGHT_CAPTURE_STALE');need(!store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(key),'REVIEW_RECORD_ALREADY_EXISTS');store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,store.seal(candidate));store.audit('COLLECTIONS_REVIEW_RECORD_INSTALLED',body.reviewId,{recordHash:body.recordHash,bindings:candidate.manifest.rows.length,sends:0,businessWrites:0});});
   last={state:'REVIEWED_RECORD_STORED',dataStatus:'VERIFIED_REVIEWED_CASE',checkedAt:started};return {guard:MARIA_COLLECTIONS_HOST_GUARD,...last,reviewId:body.reviewId,recordHash:body.recordHash,sends:0,businessWrites:0,claimsCreated:0,productionReady:false};
  }catch(e){return pending(safeReason(e));}
 }
 async function dispatch(body){
  try{selector(body);if(!enabled){last={state:'OFF',dataStatus:'UNKNOWN',checkedAt:clock()};return {guard:MARIA_COLLECTIONS_HOST_GUARD,...last,sends:0,businessWrites:0,automaticRetry:false,productionReady:false};}const active=runtime(body);requireFinancialStatus();need(sendGate(active.record),'CURRENT_SENDER_GATE_CLOSED');need(active.collector.status(active.key).state!=='NOT_FOUND','VERIFIED_PREPARATION_REQUIRED');const result=await active.collector.dispatch(active.key);last={state:result.state,dataStatus:'UNKNOWN',reason:result.reason??null,checkedAt:clock()};return {...result,guard:MARIA_COLLECTIONS_HOST_GUARD,reviewId:body.reviewId,productionReady:false};}catch(e){return pending(safeReason(e));}
 }
 async function proveDelivery(body){try{const active=runtime(body,{historical:true}),result=await active.collector.proveDelivery(active.key);last={state:result.state,dataStatus:'UNKNOWN',reason:result.reason??null,checkedAt:clock()};return {...result,guard:MARIA_COLLECTIONS_HOST_GUARD,reviewId:body.reviewId,productionReady:false};}catch(e){return pending(safeReason(e));}}
 function repliesReview(body={after:0,limit:20}){
  need(exact(body,'after,limit')&&Number.isSafeInteger(body.after)&&body.after>=0&&Number.isSafeInteger(body.limit)&&body.limit>=1&&body.limit<=50,'REPLIES_REVIEW_CURSOR_REQUIRED');
  const rows=store.db.prepare('SELECT rowid AS cursor,body FROM maria_collection_replies WHERE rowid>? ORDER BY rowid LIMIT ?').all(body.after,body.limit),items=rows.map(r=>{const v=store.open(r.body);return {cursor:r.cursor,replyKind:v.replyKind,correlation:v.correlation,requiresHumanReview:true,blockFurtherCollection:true,obligationCount:v.obligationKeys.length,sourceFingerprint:digest([v.sourceId,v.line]),automaticReplyPermitted:false,paymentVerified:false};});
  return {guard:MARIA_COLLECTIONS_HOST_GUARD,readOnly:true,items,nextAfter:items.at(-1)?.cursor??body.after,sends:0,businessWrites:0};
 }
 const status=()=>{const s=financialReader.status();return {guard:MARIA_COLLECTIONS_HOST_GUARD,state:last?.state??'NEEDS_REVIEW',dataStatus:last&&fresh(last.checkedAt,clock(),5000)?last.dataStatus:'UNKNOWN',reason:last?.reason??(last?'COLLECTIONS_HOST_STATE_RECORDED':'COLLECTIONS_HOST_REVIEWED_CASE_NOT_LOADED'),enabled,catalogEntries:pins.length,financialReaderConfigured:s.configured===true&&s.enabled===true,contextConfigured:true,automaticRetry:false,schedulerEnabled:false,productionReady:false,customerMessages:0,businessWrites:0};};
 return Object.freeze({guard:MARIA_COLLECTIONS_HOST_GUARD,collectionsContext:context,status,installReviewedRecord,prepare,dispatch,proveDelivery,repliesReview});
}
