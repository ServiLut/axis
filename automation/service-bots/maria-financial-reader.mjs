import {createHash} from 'node:crypto';

// Independent finite read capability. No sender, financial writer or scheduler.
export const MARIA_FINANCIAL_READER_GUARD='own-fumigacion-financial-readonly-v1';
export const MARIA_FINANCIAL_READER_URL='https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-financial-reader';
export const MARIA_FINANCIAL_SCHEMA='own-fumigacion-financial-sources-projection-v2';
export const MARIA_FINANCIAL_AUTHORIZATION='direct-user-limited-financial-read-20261112';
export const MARIA_FINANCIAL_MAX_EXPIRY='2026-12-07T16:56:52.680Z';
export const MARIA_FINANCIAL_SCOPE=Object.freeze({company:'FUMIGACION',tenantId:'9ffea9df-1e06-4590-acec-0e5cde715ba9',companyId:'35a19d89-15d1-4c32-8353-3471b6d9f0ff',actorId:'25b2e265-e463-4592-bab1-86b7b1687eae'});
export const MARIA_FINANCIAL_COHORT_SHA256='d1fee7c513702448a4a5bf4a54889b19a0b0cb37f84978df68017236f1d35dab';
export const MARIA_FINANCIAL_APPROVED_SCOPES=Object.freeze([
 Object.freeze({count:5,sha256:'27df889ea8838b66b8024bef13de0080df388c5931d57b21a70d22242c742733'}),
 Object.freeze({count:188,sha256:'da93a01fe29729ff737eb32467208275fd09ebc1cf379063676793321521d6ce'}),
]);
export const MARIA_FINANCIAL_META_KEY='maria-financial-reader-setup:v1';
const SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,TOKEN=/^[A-Za-z0-9_-]{43,128}$/;
const setupKeys='actorId,authorizationReference,company,companyId,controlledCohortSha256,expiresAt,guard,initialOrderBindings,nonce,startsAt,tenantId,token,url,username';
const storedKeys=setupKeys.replace(',nonce','')+',version';
const amountMeaning='Separate recorded financial sources; neither quoted-minus-paid nor technician remittance establishes collectible customer debt.';
const sha=v=>createHash('sha256').update(v).digest('hex');
const object=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
const fail=()=>{throw Error('OWN_FINANCIAL_READ_NOT_VERIFIED');};
const requireValue=ok=>{if(!ok)fail();};
const instant=v=>{requireValue(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v));const n=Date.parse(v);requireValue(Number.isSafeInteger(n)&&new Date(n).toISOString()===v);return n;};
const own=v=>Object.entries(MARIA_FINANCIAL_SCOPE).every(([key,value])=>v?.[key]===value);
const bindingHash=rows=>sha(JSON.stringify([...rows].sort((a,b)=>a.orderId.localeCompare(b.orderId)).map(r=>({orderId:r.orderId,expectedClientId:r.expectedClientId}))));
const forbiddenHashes=c=>[c.authHash,c.webhookHash,c.retentionProofAccess?.tokenHash,c.ownOrderScheduling?.proofToken,...[c.mariaProgram?.token,c.programSupervision?.token,c.retentionNoteAccess?.token,c.ownOrderScheduling?.token].filter(v=>typeof v==='string').map(sha)].filter(Boolean);
function bindings(rows,max){
 requireValue(Array.isArray(rows)&&rows.length>=1&&rows.length<=max&&new Set(rows.map(r=>r?.orderId)).size===rows.length);
 for(const r of rows)requireValue(exact(r,'orderId,expectedClientId')&&UUID.test(r.orderId)&&UUID.test(r.expectedClientId));
 return rows.map(r=>({orderId:r.orderId,expectedClientId:r.expectedClientId}));
}
function profile(c,value,at,stored=false){
 const p=c.mariaProgram;
 requireValue(c.company==='fumigacion'&&c.enabled===true&&p?.enabled===true&&p.actorId===MARIA_FINANCIAL_SCOPE.actorId&&p.tenantId===MARIA_FINANCIAL_SCOPE.tenantId&&p.companyId===MARIA_FINANCIAL_SCOPE.companyId&&Number.isSafeInteger(p.startsAt)&&Number.isSafeInteger(p.expiresAt)&&p.startsAt<=at&&at<p.expiresAt);
 requireValue(exact(value,stored?storedKeys:setupKeys)&&(!stored||value.version===1)&&own(value)&&value.username==='maria.angel.bot'&&value.guard===MARIA_FINANCIAL_READER_GUARD&&value.url===MARIA_FINANCIAL_READER_URL&&value.authorizationReference===MARIA_FINANCIAL_AUTHORIZATION&&value.controlledCohortSha256===MARIA_FINANCIAL_COHORT_SHA256&&typeof value.token==='string'&&TOKEN.test(value.token)&&!forbiddenHashes(c).includes(sha(value.token)));
 const startsAt=instant(value.startsAt),expiresAt=instant(value.expiresAt);
 requireValue(startsAt>=Math.max(p.startsAt,Date.parse('2026-11-12T00:00:00.000Z'))&&startsAt<=at&&at<expiresAt&&startsAt<expiresAt&&expiresAt<=Math.min(p.expiresAt,Date.parse(MARIA_FINANCIAL_MAX_EXPIRY)));
 const rows=bindings(value.initialOrderBindings,257),allowlistHash=bindingHash(rows);
 requireValue(Buffer.byteLength(JSON.stringify(value))<=65536&&MARIA_FINANCIAL_APPROVED_SCOPES.some(s=>s.count===rows.length&&s.sha256===allowlistHash));
 if(!stored)requireValue(typeof value.nonce==='string'&&TOKEN.test(value.nonce)&&value.nonce!==value.token&&!forbiddenHashes(c).includes(sha(value.nonce)));
 return {value:structuredClone(value),startsAt,expiresAt,allowlistHash};
}
function requestBody(body,revalidate,allowed){
 requireValue(exact(body,'orders')&&Buffer.byteLength(JSON.stringify(body))<=8192&&Array.isArray(body.orders)&&body.orders.length>=1&&body.orders.length<=5&&new Set(body.orders.map(r=>r?.orderId)).size===body.orders.length);
 const keys=revalidate?'expectedBindingFingerprint,expectedClientId,expectedFinancialFingerprint,orderId':'expectedClientId,orderId';
 for(const r of body.orders)requireValue(exact(r,keys)&&UUID.test(r.orderId)&&UUID.test(r.expectedClientId)&&allowed.some(a=>a.orderId===r.orderId&&a.expectedClientId===r.expectedClientId)&&(!revalidate||SHA.test(r.expectedFinancialFingerprint)&&SHA.test(r.expectedBindingFingerprint)));
 return structuredClone(body);
}

// Closed response projections: metadata references are accepted, source contents/URLs are not.
const bool=v=>typeof v==='boolean',id=v=>typeof v==='string'&&UUID.test(v),hash=v=>typeof v==='string'&&SHA.test(v),tag=v=>typeof v==='string'&&/^[\p{L}\p{N} _-]{1,100}$/u.test(v),decimal=v=>typeof v==='string'&&/^-?\d{1,30}(?:\.\d{1,20})?$/.test(v),date=v=>{try{instant(v);return true;}catch{return false;}};
const nullable=check=>v=>v===null||check(v),list=(check,max)=>v=>Array.isArray(v)&&v.length<=max&&v.every(check);
const opaque=v=>typeof v==='string'&&/^financial-ref:[a-f0-9]{64}$/.test(v);
const method=v=>typeof v==='string'&&/^(?:EFECTIVO|TRANSFERENCIA|CREDITO|CRÉDITO|BONO|CORTESIA|CORTESÍA|PENDIENTE|TARJETA|OTRO)$/.test(v);
function shape(value,spec){requireValue(exact(value,Object.keys(spec).join(',')));for(const [k,check] of Object.entries(spec))requireValue(check(value[k]));return structuredClone(value);}
const shaped=spec=>v=>{shape(v,spec);return true;};
const presence=v=>{shape(v,{present:bool,reference:nullable(opaque)});return v.present===Boolean(v.reference);};
const metadata=v=>{
 shape(v,{present:bool,sourceRef:nullable(opaque),entries:list(shaped({index:x=>Number.isSafeInteger(x)&&x>=0&&x<1000,reference:opaque,amounts:x=>object(x)&&Object.keys(x).every(k=>['monto','valor','amount','valorPagado','valorCobrado'].includes(k)&&nullable(decimal)(x[k])),methods:list(method,9),contentReturned:x=>x===false}),1000),contentReturned:x=>x===false});
 return v.present===Boolean(v.sourceRef)&&v.entries.every((entry,i)=>entry.index===i);
};
const orderSpec={reference:presence,shortOrderId:v=>typeof v==='string'&&/^[A-F0-9]{8}$/.test(v),createdAt:nullable(date),updatedAt:nullable(date),deletedAt:nullable(date),state:tag,visitType:nullable(tag),visitAt:nullable(date),technicianId:nullable(id),parentOrderId:nullable(id),quotedCop:nullable(decimal),recordedPaidCop:nullable(decimal),paymentState:tag,basePaymentMethods:list(method,9),paymentMethodId:nullable(id),paymentMethod:nullable(shaped({id,standardName:nullable(method),nameRef:opaque})),bankId:nullable(id),bankNameRef:nullable(opaque),paymentAt:nullable(date),paymentReference:presence,liquidatedAt:nullable(date),liquidatedById:nullable(id),invoice:presence,electronicInvoice:presence,paymentBreakdown:metadata,paymentSupports:metadata};
const portfolioSpec={id,orderId:id,clientId:id,technicianId:nullable(id),initialCop:decimal,recordedPendingCop:decimal,state:tag,origin:tag,promisedPaymentAt:nullable(date),paidAt:nullable(date),createdAt:date,updatedAt:date,reason:presence,observation:presence};
const cashSpec={id,orderId:id,technicianId:id,declaredCop:decimal,remitted:bool,declaredAt:date,evidence:presence,observation:presence};
const remittanceSpec={linkId:id,orderId:id,depositId:id,technicianId:id,recordedById:id,at:date,wholeDepositCop:decimal,allocatedToThisOrderCop:v=>v===null,linkedOrderCount:v=>Number.isSafeInteger(v)&&v>=1,state:tag,differenceCop:nullable(decimal),createdAt:date,bankReference:presence,support:presence,observation:presence};
const snapshotSpec={orderId:id,clientId:id,financialFingerprint:hash,bindingFingerprint:hash,sourceConflicts:list(v=>typeof v==='string'&&/^[A-Z_]{1,100}$/.test(v),20),reconciliationRequired:v=>v===true,order:shaped(orderSpec),clientBinding:shaped({id,updatedAt:date,deletedAt:nullable(date)}),portfolio:nullable(shaped(portfolioSpec)),reportedCash:nullable(shaped(cashSpec)),technicianRemittance:nullable(shaped(remittanceSpec)),followups:list(shaped({id,state:tag,createdAt:date,updatedAt:date,completedAt:nullable(date),contactedAt:nullable(date)}),1000),amountMeaning:v=>v===amountMeaning,customerDebtVerified:v=>v===false,bankReceiptVerified:v=>v===false,serviceExecutionVerified:v=>v===false,contractualDueDateVerified:v=>v===false,collectionAuthorizedByThisRead:v=>v===false};
function responseProof(data,p,body,revalidate,at){
 const base='guard,schemaVersion,company,tenantId,companyId,advisorMembershipId,readOnly,cohortSha256,allowlistHash,financialReadStartedAt,checkedAt,validUntil,coverage,snapshots';
 requireValue(exact(data,revalidate?base+',status,same,revalidationSucceeded,results,sendPermitted':base)&&data.guard===MARIA_FINANCIAL_READER_GUARD&&data.schemaVersion===MARIA_FINANCIAL_SCHEMA&&data.company==='FUMIGACION'&&data.tenantId===MARIA_FINANCIAL_SCOPE.tenantId&&data.companyId===MARIA_FINANCIAL_SCOPE.companyId&&data.advisorMembershipId===MARIA_FINANCIAL_SCOPE.actorId&&data.readOnly===true&&data.cohortSha256===MARIA_FINANCIAL_COHORT_SHA256&&data.allowlistHash===p.allowlistHash);
 const started=instant(data.financialReadStartedAt),checked=instant(data.checkedAt);
 requireValue(started<=checked&&checked<=at&&at-started<30000);
 if(data.validUntil!==null){const until=instant(data.validUntil);requireValue(checked<until&&at<until&&until<=Math.min(started+30000,p.expiresAt));}else requireValue(revalidate&&data.revalidationSucceeded===false);
 const coverage=shape(data.coverage,{completeForRequestedBindings:v=>v===true,requestedOrders:v=>v===body.orders.length,initialFiveOnly:v=>v===(p.value.initialOrderBindings.length===5),configuredBoundOrders:v=>v===p.value.initialOrderBindings.length,allCompanyPortfolioCovered:v=>v===false,hardDeletesCovered:v=>v===false,bankVerified:v=>v===false,freeTextAndDocumentContentsReturned:v=>v===false,financialSourcesAreNotDebtAuthorization:v=>v===true});
 requireValue(Array.isArray(data.snapshots)&&data.snapshots.length===body.orders.length&&new Set(data.snapshots.map(r=>r?.orderId)).size===body.orders.length);
 const snapshots=data.snapshots.map(row=>{
  const value=shape(row,snapshotSpec),expected=body.orders.find(r=>r.orderId===row.orderId);
  requireValue(expected?.expectedClientId===row.clientId&&row.clientBinding.id===row.clientId&&row.order.shortOrderId===row.orderId.slice(0,8).toUpperCase()&&(!row.portfolio||row.portfolio.orderId===row.orderId&&row.portfolio.clientId===row.clientId)&&(!row.reportedCash||row.reportedCash.orderId===row.orderId)&&(!row.technicianRemittance||row.technicianRemittance.orderId===row.orderId));return value;
 });
 const result={...data,coverage,snapshots};
 if(revalidate){
  requireValue(Array.isArray(data.results)&&data.results.length===snapshots.length&&new Set(data.results.map(r=>r?.orderId)).size===snapshots.length&&data.sendPermitted===false);
  for(const row of data.results){shape(row,{orderId:id,same:bool,requiresReview:bool});const current=snapshots.find(r=>r.orderId===row.orderId),expected=body.orders.find(r=>r.orderId===row.orderId);requireValue(current&&expected&&row.same===(current.financialFingerprint===expected.expectedFinancialFingerprint&&current.bindingFingerprint===expected.expectedBindingFingerprint)&&row.requiresReview===(current.sourceConflicts.length>0));}
  const same=data.results.every(r=>r.same),success=same&&data.results.every(r=>!r.requiresReview);requireValue(data.same===same&&data.revalidationSucceeded===success&&data.status===(success?'UNCHANGED':'REVIEW')&&(success?data.validUntil!==null:data.validUntil===null));
 }
 return result;
}
async function readJson(response){
 requireValue(response?.ok===true);const chunks=[];let size=0;
 for await(const chunk of response.body){const bytes=Buffer.from(chunk);size+=bytes.length;requireValue(size<=512*1024);chunks.push(bytes);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail();}
}

export function createMariaFinancialReaderRuntime(config,store,{fetcher}={}){
 requireValue(config?.company==='fumigacion'&&store?.company==='fumigacion'&&typeof store.tx==='function'&&typeof store.seal==='function'&&typeof store.open==='function');
 const stored=()=>{const r=store.db.prepare('SELECT value FROM meta WHERE key=?').get(MARIA_FINANCIAL_META_KEY);return r?store.open(r.value):null;};
 const current=()=>profile(config,stored(),Date.now(),true);
 const status=()=>{
  let p=null,summary=null;const configured=Boolean(store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(MARIA_FINANCIAL_META_KEY));
  // Expired/disabled access still has useful redacted configuration diagnostics.
  try{const value=stored();requireValue(exact(value,storedKeys)&&value.version===1&&own(value)&&value.guard===MARIA_FINANCIAL_READER_GUARD&&value.url===MARIA_FINANCIAL_READER_URL&&value.controlledCohortSha256===MARIA_FINANCIAL_COHORT_SHA256);instant(value.startsAt);instant(value.expiresAt);const rows=bindings(value.initialOrderBindings,257);requireValue(MARIA_FINANCIAL_APPROVED_SCOPES.some(s=>s.count===rows.length&&s.sha256===bindingHash(rows)));summary={startsAt:value.startsAt,expiresAt:value.expiresAt,count:rows.length};}catch{}
  try{p=current();}catch{}
  return {guard:MARIA_FINANCIAL_READER_GUARD,configured,enabled:Boolean(p),readOnly:true,company:'FUMIGACION',tenantId:summary?MARIA_FINANCIAL_SCOPE.tenantId:null,companyId:summary?MARIA_FINANCIAL_SCOPE.companyId:null,actorId:summary?MARIA_FINANCIAL_SCOPE.actorId:null,startsAt:summary?.startsAt??null,expiresAt:summary?.expiresAt??null,configuredBoundOrders:summary?.count??0,financialWritesEnabled:false,customerMessagesEnabled:false,customerNotesWritesEnabled:false,schedulersEnabled:false,collectionAuthorizedByThisRead:false};
 };
 async function request(p,body,revalidate){
  requireValue(typeof fetcher==='function');const before=JSON.stringify(p.value),request=requestBody(body,revalidate,p.value.initialOrderBindings);
  const response=await fetcher(MARIA_FINANCIAL_READER_URL+(revalidate?'/revalidate':'/snapshots'),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+p.value.token,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(15000)});
  const data=await readJson(response);profile(config,p.value,Date.now(),true);requireValue(JSON.stringify(p.value)===before&&!JSON.stringify(data).includes(p.value.token));return responseProof(data,p,request,revalidate,Date.now());
 }
 async function install(body){
  try{
   requireValue(Buffer.byteLength(JSON.stringify(body))<=65536);const checked=profile(config,body,Date.now()),nonceKey='maria-financial-reader-setup-nonce:'+sha(body.nonce);
   requireValue(!store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(nonceKey));
   const {nonce,...fields}=checked.value,value={...fields,version:1},candidate=profile(config,value,Date.now(),true),previous=store.db.prepare('SELECT value FROM meta WHERE key=?').get(MARIA_FINANCIAL_META_KEY)?.value??null;
   await request(candidate,{orders:candidate.value.initialOrderBindings.slice(0,5)},false);
   store.tx(()=>{
    profile(config,value,Date.now(),true);requireValue((store.db.prepare('SELECT value FROM meta WHERE key=?').get(MARIA_FINANCIAL_META_KEY)?.value??null)===previous&&!store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(nonceKey));
    store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(nonceKey,store.seal({version:1,at:Date.now(),authorizationReference:MARIA_FINANCIAL_AUTHORIZATION}));
    store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(MARIA_FINANCIAL_META_KEY,store.seal(value));
    store.audit('OWN_FINANCIAL_READER_SETUP_VERIFIED',MARIA_FINANCIAL_READER_GUARD,{authorizationReference:MARIA_FINANCIAL_AUTHORIZATION,boundOrders:value.initialOrderBindings.length,expiresAt:value.expiresAt,readOnly:true,businessWrites:0,sends:0});
   });return status();
  }catch{fail();}
 }
 const read=async(body,revalidate)=>{try{const p=current(),version=JSON.stringify(p.value),data=await request(p,body,revalidate);requireValue(JSON.stringify(current().value)===version);return data;}catch{fail();}};
 return {install,status,snapshots:body=>read(body,false),revalidate:body=>read(body,true)};
}
