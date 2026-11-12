import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {Transport} from '../automation/service-bots/transport.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import * as production from '../automation/service-bots/maria-financial-reader.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex'),clone=structuredClone;
const syntheticId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const syntheticBindings=count=>Array.from({length:count},(_,i)=>({orderId:syntheticId(i+1),expectedClientId:syntheticId(1001+i)}));
const bindingHash=rows=>sha(JSON.stringify([...rows].sort((a,b)=>a.orderId.localeCompare(b.orderId))));
// Test-only source copy: replace exactly two private binding SHA literals. There
// is no production parameter/env bypass, and no private profile/ID/token is read.
const sourceUrl=new URL('../automation/service-bots/maria-financial-reader.mjs',import.meta.url),source=readFileSync(sourceUrl,'utf8');
const realPins=['27df889ea8838b66b8024bef13de0080df388c5931d57b21a70d22242c742733','da93a01fe29729ff737eb32467208275fd09ebc1cf379063676793321521d6ce'];
let testSource=source;for(const [i,pin] of realPins.entries()){assert.equal(testSource.split(pin).length-1,1);testSource=testSource.replace(pin,bindingHash(syntheticBindings(i?188:5)));}
assert.equal(testSource.replace(bindingHash(syntheticBindings(5)),realPins[0]).replace(bindingHash(syntheticBindings(188)),realPins[1]),source);
const harnessDir=mkdtempSync(join(tmpdir(),'maria-financial-reader-')),harnessFile=join(harnessDir,'reader.mjs');writeFileSync(harnessFile,testSource);
const harness=await import(pathToFileURL(harnessFile).href);
after(()=>{const safe=resolve(harnessDir),base=resolve(tmpdir())+sep+'maria-financial-reader-';assert.ok(safe.startsWith(base));rmSync(safe,{recursive:true,force:true});});
const {MARIA_FINANCIAL_SCOPE:scope,MARIA_FINANCIAL_READER_URL:url,MARIA_FINANCIAL_READER_GUARD:guard,MARIA_FINANCIAL_SCHEMA:schema,MARIA_FINANCIAL_META_KEY:metaKey}=production;
const tokens={admin:'a'.repeat(60),webhook:'w'.repeat(60),registration:'r'.repeat(60),audit:'s'.repeat(60),note:'n'.repeat(60),proof:'p'.repeat(60),financial:'f'.repeat(60),schedule:'o'.repeat(60)};
const presence=()=>({present:false,reference:null}),metadata=()=>({present:false,sourceRef:null,entries:[],contentReturned:false});
function snapshot(binding,at){return {
 orderId:binding.orderId,clientId:binding.expectedClientId,financialFingerprint:sha('finance:'+binding.orderId),bindingFingerprint:sha('binding:'+binding.orderId),sourceConflicts:[],reconciliationRequired:true,
 order:{reference:presence(),shortOrderId:binding.orderId.slice(0,8).toUpperCase(),createdAt:at,updatedAt:at,deletedAt:null,state:'PENDIENTE',visitType:'SERVICIO',visitAt:at,technicianId:null,parentOrderId:null,quotedCop:'140000',recordedPaidCop:'0',paymentState:'PENDIENTE',basePaymentMethods:[],paymentMethodId:null,paymentMethod:null,bankId:null,bankNameRef:null,paymentAt:null,paymentReference:presence(),liquidatedAt:null,liquidatedById:null,invoice:presence(),electronicInvoice:presence(),paymentBreakdown:metadata(),paymentSupports:metadata()},
 clientBinding:{id:binding.expectedClientId,updatedAt:at,deletedAt:null},portfolio:null,reportedCash:null,technicianRemittance:null,followups:[],amountMeaning:'Separate recorded financial sources; neither quoted-minus-paid nor technician remittance establishes collectible customer debt.',customerDebtVerified:false,bankReceiptVerified:false,serviceExecutionVerified:false,contractualDueDateVerified:false,collectionAuthorizedByThisRead:false,
};}
function response(f,body,revalidate){
 const now=Date.now(),at=new Date(now).toISOString(),snapshots=body.orders.map(b=>snapshot(b,at));
 if(f.rowsPatch)for(const r of snapshots)f.rowsPatch(r);
 const data={guard,schemaVersion:schema,company:scope.company,tenantId:scope.tenantId,companyId:scope.companyId,advisorMembershipId:scope.actorId,readOnly:true,cohortSha256:production.MARIA_FINANCIAL_COHORT_SHA256,allowlistHash:bindingHash(f.body.initialOrderBindings),financialReadStartedAt:at,checkedAt:at,validUntil:new Date(Math.min(now+30000,Date.parse(f.body.expiresAt))).toISOString(),coverage:{completeForRequestedBindings:true,requestedOrders:body.orders.length,initialFiveOnly:f.body.initialOrderBindings.length===5,configuredBoundOrders:f.body.initialOrderBindings.length,allCompanyPortfolioCovered:false,hardDeletesCovered:false,bankVerified:false,freeTextAndDocumentContentsReturned:false,financialSourcesAreNotDebtAuthorization:true},snapshots};
 if(revalidate){const results=snapshots.map(row=>{const expected=body.orders.find(r=>r.orderId===row.orderId);return {orderId:row.orderId,same:row.financialFingerprint===expected.expectedFinancialFingerprint&&row.bindingFingerprint===expected.expectedBindingFingerprint,requiresReview:row.sourceConflicts.length>0};});const same=results.every(r=>r.same),success=same&&results.every(r=>!r.requiresReview);Object.assign(data,{status:success?'UNCHANGED':'REVIEW',same,revalidationSucceeded:success,results,sendPermitted:false});if(!success)data.validUntil=null;}
 if(f.patch)f.patch(data);return data;
}
function fixture(t,{count=5,realModule=false,company='fumigacion'}={}){
 const now=Date.now(),f={calls:[],at:now};
 f.config={company,...BUSINESSES[company],enabled:true,activatedAt:now-7200000,responseTargetMs:10000,authHash:sha(tokens.admin),webhookHash:sha(tokens.webhook),provider:'https://real-network-forbidden.invalid',lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'financial-test-'+i,apiKey:'synthetic-only'})),mariaProgram:{enabled:true,token:tokens.registration,actorId:scope.actorId,tenantId:scope.tenantId,companyId:scope.companyId,startsAt:now-3600000,expiresAt:Math.min(now+86400000,Date.parse(production.MARIA_FINANCIAL_MAX_EXPIRY))},programSupervision:{token:tokens.audit},retentionNoteAccess:{token:tokens.note},retentionProofAccess:{tokenHash:sha(tokens.proof)},ownOrderScheduling:{token:tokens.schedule,proofToken:sha('q'.repeat(60))}};
 f.body={...scope,username:'maria.angel.bot',guard,url,token:tokens.financial,startsAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),controlledCohortSha256:production.MARIA_FINANCIAL_COHORT_SHA256,initialOrderBindings:syntheticBindings(count),authorizationReference:production.MARIA_FINANCIAL_AUTHORIZATION,nonce:randomBytes(36).toString('base64url')};
 f.store=new Store(':memory:',company,randomBytes(32));
 f.fetcher=async(target,options)=>{f.calls.push({url:target,options});assert.ok([url+'/snapshots',url+'/revalidate'].includes(target));assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+tokens.financial);if(f.hook)await f.hook();if(f.error)throw Error('private backend error '+tokens.financial);const data=response(f,JSON.parse(options.body),target.endsWith('/revalidate'));return new Response(JSON.stringify(data),{status:f.httpStatus??200});};
 f.runtime=company==='fumigacion'?(realModule?production:harness).createMariaFinancialReaderRuntime(f.config,f.store,{fetcher:f.fetcher}):null;
 f.orders=(n=1)=>({orders:clone(f.body.initialOrderBindings.slice(0,n))});
 f.revalidation=(n=1)=>({orders:f.orders(n).orders.map(b=>({...b,expectedFinancialFingerprint:sha('finance:'+b.orderId),expectedBindingFingerprint:sha('binding:'+b.orderId)}))});
 f.setup=()=>f.runtime.install(f.body);f.saved=()=>f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey).value);
 t.after(()=>f.store.close());return f;
}

test('production pins are the two approved hashes and scope, without a test override or private identifiers',async t=>{
 assert.equal(production.MARIA_FINANCIAL_SCHEMA,'own-fumigacion-financial-sources-projection-v2');
 assert.deepEqual(production.MARIA_FINANCIAL_APPROVED_SCOPES,[{count:5,sha256:realPins[0]},{count:188,sha256:realPins[1]}]);assert.equal(scope.tenantId,MARIA_TENANT);assert.equal(scope.companyId,MARIA_COMPANY);
 const f=fixture(t,{realModule:true});await assert.rejects(f.setup(),/OWN_FINANCIAL_READ_NOT_VERIFIED/);assert.equal(f.calls.length,0);assert.doesNotMatch(source,/process\.env|testOverride|readFile|financial-reader\.private/);assert.equal(source.match(/^import /gm).length,1);
 assert.throws(()=>production.createMariaFinancialReaderRuntime({...f.config,company:'servicio-tecnico'},f.store,{fetcher:f.fetcher}));
});
test('absent encrypted setup is disabled and makes zero calls or financial/queue writes',async t=>{
 const f=fixture(t);assert.equal(f.runtime.status().enabled,false);assert.equal(f.runtime.status().configured,false);await assert.rejects(f.runtime.snapshots(f.orders()));await assert.rejects(f.runtime.revalidate(f.revalidation()));assert.equal(f.calls.length,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-financial-reader-%'").get().n,0);
});
test('valid setup checks five live bindings, stores encrypted profile and consumes nonce atomically',async t=>{
 const f=fixture(t),parent=clone(f.config);const result=await f.setup();assert.equal(result.enabled,true);assert.equal(result.configuredBoundOrders,5);assert.equal(result.financialWritesEnabled,false);assert.equal(f.calls.length,1);assert.deepEqual(JSON.parse(f.calls[0].options.body),f.orders(5));assert.deepEqual(f.config,parent);
 for(const row of f.store.db.prepare('SELECT key,value FROM meta').all())assert.doesNotMatch(row.value,new RegExp(tokens.financial+'|'+f.body.nonce+'|'+f.body.initialOrderBindings[0].orderId));assert.doesNotMatch(JSON.stringify(result),new RegExp(tokens.financial+'|'+f.body.nonce));assert.equal(f.saved().version,1);assert.equal(f.saved().nonce,undefined);
 await assert.rejects(f.setup());assert.equal(f.calls.length,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
});
test('approved 188-binding scope is finite, checked via only five, with no expansion to 257 arbitrary rows',async t=>{
 const f=fixture(t,{count:188});assert.equal((await f.setup()).configuredBoundOrders,188);assert.equal(JSON.parse(f.calls[0].options.body).orders.length,5);assert.equal((await f.runtime.snapshots({orders:[clone(f.body.initialOrderBindings[187])]})).snapshots.length,1);
 const other=fixture(t,{count:257});await assert.rejects(other.setup());assert.equal(other.calls.length,0);
});
test('setup rejects foreign scope, actor, URL, cohort, authorization and closed-profile extras before I/O',async t=>{
 for(const patch of [{company:'OTHER'},{tenantId:syntheticId(9)},{companyId:syntheticId(10)},{actorId:syntheticId(11)},{username:'other'},{guard:'other'},{url:url+'/snapshots'},{url:'http://127.0.0.1'},{url:'https://user:pass@tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-financial-reader'},{controlledCohortSha256:sha('other')},{authorizationReference:'other'},{enabled:true},{preparedOnly:true},{tokenSha256:sha(tokens.financial)},{nonce:'short'}]){
  const f=fixture(t);Object.assign(f.body,patch);await assert.rejects(f.setup());assert.equal(f.calls.length,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-financial-reader-%'").get().n,0);
 }
});
test('financial token must be independent of every current runtime role and hash',async t=>{
 for(const token of Object.values(tokens).filter(v=>v!==tokens.financial).concat('q'.repeat(60))){const f=fixture(t);f.body.token=token;await assert.rejects(f.setup());assert.equal(f.calls.length,0);}
 const f=fixture(t);f.body.nonce=f.body.token;await assert.rejects(f.setup());assert.equal(f.calls.length,0);
});
test('expiry is bound to current parent and exact December cap, not caller metadata or an old parent cache',async t=>{
 for(const patch of [{startsAt:'2026-02-30T00:00:00.000Z'},{startsAt:new Date(Date.now()+60000).toISOString()},{expiresAt:new Date(Date.now()-1).toISOString()},{expiresAt:'2026-12-07T16:56:52.681Z'}]){const f=fixture(t);Object.assign(f.body,patch);await assert.rejects(f.setup());assert.equal(f.calls.length,0);}
 for(const field of ['actorId','tenantId','companyId']){const f=fixture(t);f.config.mariaProgram[field]=syntheticId(500);await assert.rejects(f.setup());assert.equal(f.calls.length,0);}
 const f=fixture(t);f.hook=()=>{f.config.mariaProgram.expiresAt=Date.now()-1;};await assert.rejects(f.setup());assert.equal(f.runtime.status().configured,false);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-financial-reader-%'").get().n,0);
});
test('backend errors are redacted, leave nonce unconsumed and preserve previous valid encrypted setup',async t=>{
 const f=fixture(t);f.error=true;await assert.rejects(f.setup(),{message:'OWN_FINANCIAL_READ_NOT_VERIFIED'});assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-financial-reader-%'").get().n,0);f.error=false;await f.setup();const saved=f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey).value;f.body.nonce=randomBytes(36).toString('base64url');f.httpStatus=403;await assert.rejects(f.setup());assert.equal(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey).value,saved);assert.equal(f.runtime.status().enabled,true);
});
test('wrong backend guard/scope/hash/coverage and stale/future/extended TTL never install a profile',async t=>{
 for(const patch of [d=>d.guard='wrong',d=>d.company='OTHER',d=>d.tenantId=syntheticId(5),d=>d.companyId=syntheticId(5),d=>d.advisorMembershipId=syntheticId(5),d=>d.schemaVersion='old',d=>d.schemaVersion='own-fumigacion-financial-sources-projection-v1',d=>d.allowlistHash=sha('other'),d=>d.cohortSha256=sha('other'),d=>d.readOnly=false,d=>d.coverage.freeTextAndDocumentContentsReturned=true,d=>d.coverage.configuredBoundOrders=257,d=>d.coverage.completeForRequestedBindings=false,d=>d.checkedAt=new Date(Date.now()+60000).toISOString(),d=>d.financialReadStartedAt=new Date(Date.now()-30001).toISOString(),d=>d.validUntil=new Date(Date.parse(d.financialReadStartedAt)+30001).toISOString(),d=>d.validUntil=null,d=>d.token=tokens.financial]){
  const f=fixture(t);f.patch=patch;await assert.rejects(f.setup());assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-financial-reader-%'").get().n,0);
 }
});
test('closed financial projection rejects document bytes, arbitrary extra content and cross-client related records',async t=>{
 for(const patch of [r=>r.order.paymentSupports.contentReturned=true,r=>r.order.paymentSupports.url='https://private.invalid',r=>r.order.paymentReference.reference='https://private.invalid',r=>r.clientId=syntheticId(800),r=>r.clientBinding.id=syntheticId(800),r=>r.customerDebtVerified=true,r=>r.collectionAuthorizedByThisRead=true,r=>r.order.state=tokens.financial,r=>r.financialFingerprint='old']){
  const f=fixture(t);f.rowsPatch=patch;await assert.rejects(f.setup());assert.equal(f.runtime.status().configured,false);
 }
});
test('snapshot and revalidation bodies are closed, bound, duplicate-free and limited to five before forwarding',async t=>{
 const f=fixture(t);await f.setup();const calls=f.calls.length;
 for(const body of [{},{orders:[]},{orders:syntheticBindings(6)},{orders:[...f.orders().orders,...f.orders().orders]},{...f.orders(),url:'https://private.invalid'},{orders:[{...f.orders().orders[0],tenantId:scope.tenantId}]},{orders:[{...f.orders().orders[0],expectedClientId:syntheticId(900)}]},{orders:[{orderId:syntheticId(900),expectedClientId:syntheticId(901)}]}])await assert.rejects(f.runtime.snapshots(body));
 for(const body of [f.orders(),{orders:[{...f.revalidation().orders[0],expectedFinancialFingerprint:'wrong'}]},{...f.revalidation(),sendPermitted:true}])await assert.rejects(f.runtime.revalidate(body));assert.equal(f.calls.length,calls);
});
test('every read calls the fixed backend anew; it returns bounded native financial metadata without permission to send',async t=>{
 const f=fixture(t);await f.setup();const a=await f.runtime.snapshots(f.orders(5)),b=await f.runtime.snapshots(f.orders(5));assert.equal(a.snapshots.length,5);assert.equal(b.readOnly,true);assert.equal(f.calls.length,3);assert.ok(b.snapshots.every(r=>r.collectionAuthorizedByThisRead===false&&r.customerDebtVerified===false));assert.equal(f.runtime.status().customerMessagesEnabled,false);
});
test('recorded zero, payment-support metadata and staff cash remain separate readable sources rather than collectible debt',async t=>{
 const f=fixture(t);await f.setup();const reference='financial-ref:'+sha('synthetic support');
 f.rowsPatch=row=>{
  const at=row.clientBinding.updatedAt;row.order.paymentSupports={present:true,sourceRef:reference,entries:[{index:0,reference,amounts:{monto:'140000'},methods:['EFECTIVO'],contentReturned:false}],contentReturned:false};
  row.reportedCash={id:syntheticId(8001),orderId:row.orderId,technicianId:syntheticId(8002),declaredCop:'140000',remitted:false,declaredAt:at,evidence:{present:true,reference},observation:presence()};
  row.portfolio={id:syntheticId(8003),orderId:row.orderId,clientId:row.clientId,technicianId:syntheticId(8002),initialCop:'140000',recordedPendingCop:'140000',state:'PENDIENTE',origin:'ORDEN',promisedPaymentAt:null,paidAt:null,createdAt:at,updatedAt:at,reason:presence(),observation:presence()};
  row.sourceConflicts=['CASH_DECLARATION_AND_RECORDED_PAID_DIFFER','PAYMENT_SUPPORT_WITH_ZERO_RECORDED_PAID'];
 };
 const r=await f.runtime.snapshots(f.orders()),row=r.snapshots[0];assert.equal(row.order.recordedPaidCop,'0');assert.equal(row.reportedCash.declaredCop,'140000');assert.equal(row.reportedCash.remitted,false);assert.equal(row.order.paymentSupports.contentReturned,false);assert.equal(row.customerDebtVerified,false);assert.equal(row.collectionAuthorizedByThisRead,false);const review=await f.runtime.revalidate(f.revalidation());assert.equal(review.status,'REVIEW');assert.equal(review.same,true);assert.equal(review.sendPermitted,false);
});
test('revalidation accepts UNCHANGED and legitimate same=true REVIEW conflicts, while send stays false',async t=>{
 const f=fixture(t);await f.setup();const good=await f.runtime.revalidate(f.revalidation());assert.equal(good.status,'UNCHANGED');assert.equal(good.same,true);assert.equal(good.sendPermitted,false);
 f.rowsPatch=r=>r.sourceConflicts.push('CASH_DECLARATION_AND_RECORDED_PAID_DIFFER');const review=await f.runtime.revalidate(f.revalidation());assert.equal(review.status,'REVIEW');assert.equal(review.same,true);assert.equal(review.revalidationSucceeded,false);assert.equal(review.validUntil,null);
 f.rowsPatch=r=>r.financialFingerprint=sha('changed');const changed=await f.runtime.revalidate(f.revalidation());assert.equal(changed.same,false);assert.equal(changed.status,'REVIEW');
});
test('revalidation cannot falsely assert a matching fingerprint, clean conflicts or permission to send',async t=>{
 const f=fixture(t);await f.setup();for(const patch of [d=>d.sendPermitted=true,d=>d.results[0].same=false,d=>d.results[0].requiresReview=true,d=>d.revalidationSucceeded=false,d=>d.status='REVIEW']){f.patch=patch;await assert.rejects(f.runtime.revalidate(f.revalidation()));}
});
test('reader rechecks current encrypted version and parent after awaits and never trusts a private stale config cache',async t=>{
 const f=fixture(t);await f.setup();const original=f.saved();f.hook=()=>{const p=f.saved();p.token='z'.repeat(60);f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(p),metaKey);};await assert.rejects(f.runtime.snapshots(f.orders()));
 f.hook=undefined;for(const patch of [{version:0},{version:2},{url:'https://private.invalid'},{enabled:true},{expiresAt:new Date(Date.now()-1).toISOString()},{initialOrderBindings:syntheticBindings(4)}]){const p={...original,...patch};f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(p),metaKey);const status=f.runtime.status();assert.equal(status.enabled,false);if(patch.expiresAt){assert.equal(status.expiresAt,patch.expiresAt);assert.equal(status.configuredBoundOrders,5);}const calls=f.calls.length;await assert.rejects(f.runtime.snapshots(f.orders()));assert.equal(f.calls.length,calls);}
});
test('concurrent setup commits one profile and one consumed nonce, with no partial update',async t=>{
 const f=fixture(t);const second={...clone(f.body),nonce:randomBytes(36).toString('base64url')};const results=await Promise.allSettled([f.setup(),f.runtime.install(second)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-financial-reader-setup-nonce:%'").get().n,1);assert.equal(f.runtime.status().enabled,true);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
});

async function withServer(t,run,{company='fumigacion'}={}){
 const f=fixture(t,{company,realModule:true}),transport=new Transport(f.config,f.fetcher),server=createBotServer(f.config,f.store,transport,{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const post=async(path,body={},token=tokens.admin,method='POST')=>{const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(3000)});return {status:r.status,body:await r.json(),cacheControl:r.headers.get('cache-control')};};
 try{await run({...f,post});}finally{await new Promise(resolve=>server.close(resolve));}
}
const routes=['/financial-reader-setup','/financial-reader-status','/financial-reader-snapshots','/financial-reader-revalidate'];
test('all four financial HTTP routes require current admin; financial and existing grants never become admin',async t=>withServer(t,async f=>{
 for(const route of routes)for(const token of [null,tokens.financial,tokens.webhook,tokens.registration,tokens.audit,tokens.proof,tokens.note]){const r=await f.post(route,{},token);assert.equal(r.status,401);assert.deepEqual(r.body,{error:'UNAUTHORIZED'});}
 assert.equal(f.calls.length,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}));
test('HTTP default status is redacted/private and reads stay closed until verified setup',async t=>withServer(t,async f=>{
 const s=await f.post('/financial-reader-status');assert.equal(s.status,200);assert.equal(s.cacheControl,'no-store, private');assert.equal(s.body.enabled,false);assert.equal(s.body.financialWritesEnabled,false);
 for(const route of routes.slice(2)){const r=await f.post(route,f.orders());assert.equal(r.status,409);assert.equal(r.body.error,'OWN_FINANCIAL_READ_NOT_VERIFIED');assert.doesNotMatch(JSON.stringify(r),new RegExp(tokens.financial));}assert.equal(f.calls.length,0);assert.equal((await f.post('/financial-reader-status',{enabled:true})).status,400);
}));
test('HTTP setup errors do not print private tokens or persist unapproved synthetic binding scope',async t=>withServer(t,async f=>{
 const r=await f.post('/financial-reader-setup',f.body);assert.equal(r.status,409);assert.deepEqual(r.body,{error:'OWN_FINANCIAL_READER_SETUP_NOT_APPLIED'});assert.equal(r.cacheControl,'no-store, private');assert.equal(f.calls.length,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM meta WHERE key=?').get(metaKey).n,0);
 assert.equal((await f.post('/financial-reader-status',{},tokens.admin,'GET')).status,405);
}));
test('financial HTTP bodies are byte-bounded at 64KiB setup and 8KiB reads/status after authentication',async t=>withServer(t,async f=>{
 assert.equal((await f.post('/financial-reader-setup',' '.repeat(65537))).status,413);for(const route of routes.slice(1))assert.equal((await f.post(route,' '.repeat(8193))).status,413);assert.equal((await f.post('/financial-reader-setup',' '.repeat(65537),tokens.financial)).status,401);assert.equal(f.calls.length,0);
}));
test('other bots cannot configure or access own FUM financial reader even with their admin role',async t=>withServer(t,async f=>{
 for(const route of routes){const r=await f.post(route,route.endsWith('setup')?f.body:{});assert.equal(r.status,403);assert.equal(r.body.error,'OWN_FUMIGACION_FINANCIAL_READ_REQUIRED');}assert.equal(f.calls.length,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
},{company:'servicio-tecnico'}));
