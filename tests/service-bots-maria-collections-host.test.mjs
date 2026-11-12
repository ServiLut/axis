import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store} from '../automation/service-bots/store.mjs';
import {Transport} from '../automation/service-bots/transport.mjs';
import {digest,COLLECTION_SCOPE} from '../automation/service-bots/maria-collections.mjs';
import {mariaCollectionsNativeSource,mariaCollectionsNativeHistoryHash,MARIA_COLLECTIONS_NATIVE_BASIS} from '../automation/service-bots/maria-collections-native.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const five=Array.from({length:5},(_,i)=>({orderId:id(i+1),expectedClientId:id(1001+i)}));
const bindingHash=rows=>sha(JSON.stringify([...rows].sort((a,b)=>a.orderId.localeCompare(b.orderId))));
const readerUrl=new URL('../automation/service-bots/maria-financial-reader.mjs',import.meta.url),coreUrl=new URL('../automation/service-bots/maria-collections.mjs',import.meta.url),hostUrl=new URL('../automation/service-bots/maria-collections-host.mjs',import.meta.url);
const readerSource=readFileSync(readerUrl,'utf8'),coreSource=readFileSync(coreUrl,'utf8'),hostSource=readFileSync(hostUrl,'utf8');
const dir=mkdtempSync(join(tmpdir(),'maria-collections-host-')),readerFile=join(dir,'reader.mjs'),coreFile=join(dir,'core.mjs'),hostFile=join(dir,'host.mjs');
const pins=['27df889ea8838b66b8024bef13de0080df388c5931d57b21a70d22242c742733','da93a01fe29729ff737eb32467208275fd09ebc1cf379063676793321521d6ce'];
const syntheticPins=[5,188].map(count=>bindingHash(Array.from({length:count},(_,i)=>({orderId:id(i+1),expectedClientId:id(1001+i)}))));
let readerCopy=readerSource;for(let i=0;i<2;i++){assert.equal(readerCopy.split(pins[i]).length-1,1);readerCopy=readerCopy.replace(pins[i],syntheticPins[i]);}assert.equal(readerCopy.replace(syntheticPins[0],pins[0]).replace(syntheticPins[1],pins[1]),readerSource);writeFileSync(readerFile,readerCopy);
function relocate(source,url,overrides={}){
 let result=source;const changes=[];
 for(const match of source.matchAll(/from '(\.[^']+)'/g)){const literal=match[1],target=overrides[literal]??new URL(literal,url).href;assert.equal(result.split("from '"+literal+"'").length-1,1);result=result.replace("from '"+literal+"'","from '"+target+"'");changes.push([literal,target]);}
 let restored=result;for(const [literal,target]of changes)restored=restored.replace("from '"+target+"'","from '"+literal+"'");assert.equal(restored,source);return result;
}
writeFileSync(coreFile,relocate(coreSource,coreUrl,{'./maria-financial-reader.mjs':pathToFileURL(readerFile).href}));
writeFileSync(hostFile,relocate(hostSource,hostUrl,{'./maria-financial-reader.mjs':pathToFileURL(readerFile).href,'./maria-collections.mjs':pathToFileURL(coreFile).href}));
const reader=await import(pathToFileURL(readerFile).href),host=await import(pathToFileURL(hostFile).href);
const AT=Date.parse('2026-11-12T22:00:00.000Z'),realNow=Date.now;Date.now=()=>AT;
after(()=>{Date.now=realNow;assert.equal(readFileSync(readerUrl,'utf8'),readerSource);assert.equal(readFileSync(coreUrl,'utf8'),coreSource);assert.equal(readFileSync(hostUrl,'utf8'),hostSource);const safe=resolve(dir);assert.ok(safe.startsWith(resolve(tmpdir())+sep+'maria-collections-host-'));rmSync(safe,{recursive:true,force:true});});

const BLUE=COLLECTION_SCOPE.lines[0],RED=COLLECTION_SCOPE.lines[1],PHONE='573000007777',iso=at=>new Date(at).toISOString();
const kinds=['PRICE_ACCEPTANCE','SERVICE_PERFORMED','CONTRACTUAL_DUE','PAYMENTS_RECONCILED','CREDITS_RECONCILED','BONUS_COURTESY_RECONCILED','FUNDS_EVIDENCE_RECONCILED','CUSTOMER_CASH_RECONCILED','CUSTOMER_BALANCE_SUPPORTED','ORIGINAL_SOURCES_REVIEWED'];
const presence=()=>({present:false,reference:null}),metadata=()=>({present:false,sourceRef:null,entries:[],contentReturned:false});
function financialSnapshot(binding,changed=false,conflict=false){return {orderId:binding.orderId,clientId:binding.expectedClientId,financialFingerprint:digest(changed?'changed financial source':'synthetic financial source'),bindingFingerprint:digest('synthetic binding source'),sourceConflicts:conflict?['UNAPPLIED_PAYMENT_REVIEW']:[],reconciliationRequired:true,
 order:{reference:presence(),shortOrderId:binding.orderId.slice(0,8).toUpperCase(),createdAt:iso(AT-1000),updatedAt:iso(AT-1000),deletedAt:null,state:'TECNICO_FINALIZO',visitType:'SERVICIO',visitAt:iso(AT-1000),technicianId:null,parentOrderId:null,quotedCop:'140000',recordedPaidCop:'0',paymentState:'PENDIENTE',basePaymentMethods:[],paymentMethodId:null,paymentMethod:null,bankId:null,bankNameRef:null,paymentAt:null,paymentReference:presence(),liquidatedAt:null,liquidatedById:null,invoice:presence(),electronicInvoice:presence(),paymentBreakdown:metadata(),paymentSupports:metadata()},clientBinding:{id:binding.expectedClientId,updatedAt:iso(AT-1000),deletedAt:null},portfolio:null,reportedCash:null,technicianRemittance:null,followups:[],amountMeaning:'Separate recorded financial sources; neither quoted-minus-paid nor technician remittance establishes collectible customer debt.',customerDebtVerified:false,bankReceiptVerified:false,serviceExecutionVerified:false,contractualDueDateVerified:false,collectionAuthorizedByThisRead:false};}
function fixture(t,{enabled,installProfile=true,catalogInstalled=true,recordPatch}={}){
 const f={at:AT,providerCalls:[],financialCalls:[],sends:0,records:[{line:BLUE,key:{id:'SYNTHETIC_CUSTOMER_SOURCE_0001',remoteJid:PHONE+'@s.whatsapp.net',fromMe:false},messageTimestamp:(AT-1000)/1000,message:{conversation:'Información del servicio revisada.'}}]};
 f.store=new Store(':memory:','fumigacion',randomBytes(32));t.after(()=>f.store.close());
 f.config={company:'fumigacion',enabled:true,activatedAt:AT-86400000,authHash:sha('a'.repeat(60)),provider:'https://synthetic-provider.invalid',lines:[{phone:BLUE,instance:'cucaracha-azul',apiKey:'synthetic-only'},{phone:RED,instance:'cucaracha-roja',apiKey:'synthetic-only'}],mariaProgram:{enabled:true,token:'r'.repeat(60),actorId:reader.MARIA_FINANCIAL_SCOPE.actorId,tenantId:reader.MARIA_FINANCIAL_SCOPE.tenantId,companyId:reader.MARIA_FINANCIAL_SCOPE.companyId,startsAt:AT-3600000,expiresAt:AT+60000}};
 f.store.db.prepare('INSERT INTO conversations(phone,line,revision,at,body) VALUES(?,?,7,?,?)').run(PHONE,BLUE,AT-2000,f.store.seal({caseId:'synthetic-host-case',slots:{},asked:[]}));
 f.profile={...reader.MARIA_FINANCIAL_SCOPE,username:'maria.angel.bot',guard:reader.MARIA_FINANCIAL_READER_GUARD,url:reader.MARIA_FINANCIAL_READER_URL,token:'f'.repeat(60),startsAt:iso(AT-1000),expiresAt:iso(AT+60000),controlledCohortSha256:reader.MARIA_FINANCIAL_COHORT_SHA256,initialOrderBindings:five,authorizationReference:reader.MARIA_FINANCIAL_AUTHORIZATION,version:1};
 if(installProfile)f.store.db.prepare('INSERT INTO meta VALUES(?,?)').run(reader.MARIA_FINANCIAL_META_KEY,f.store.seal(f.profile));
 const sourceHashes=Object.fromEntries(['MANIFEST','CATALOG_REVIEW','NATIVE_REVIEW','COVERAGE','WINDOW','DUE_REVIEW',...kinds].map(k=>[k,digest('synthetic '+k)])),row={obligationId:five[0].orderId,clientId:five[0].expectedClientId,phone:PHONE,originLine:BLUE,currency:'COP',balanceMinor:12000000,financialRevision:digest('synthetic financial source'),commercialReference:'SYNTHETIC-001',serviceDescription:'Control de plagas',serviceDate:'2026-11-01'};
 f.authority={reference:host.MARIA_COLLECTIONS_AUTHORITY_REFERENCE,sourceHash:digest('synthetic authority source'),company:COLLECTION_SCOPE.company,tenantId:COLLECTION_SCOPE.tenantId,companyId:COLLECTION_SCOPE.companyId,expiresAt:AT+60000,oneOff:true};
 const manifest={version:'collector-finite-manifest-v1',manifestId:'synthetic-host-manifest',company:COLLECTION_SCOPE.company,tenantId:COLLECTION_SCOPE.tenantId,companyId:COLLECTION_SCOPE.companyId,reviewedAt:AT-1000,expiresAt:AT+60000,sourceHash:sourceHashes.MANIFEST,rows:[row]},sources=f.records.map(r=>mariaCollectionsNativeSource(r,PHONE,r.line));
 const nativeBasis={guard:MARIA_COLLECTIONS_NATIVE_BASIS,company:COLLECTION_SCOPE.company,tenantId:COLLECTION_SCOPE.tenantId,companyId:COLLECTION_SCOPE.companyId,manifestHash:digest(manifest),phone:PHONE,originLine:BLUE,reviewedAt:AT-500,expiresAt:AT+60000,reviewSourceHash:sourceHashes.NATIVE_REVIEW,coverage:{kind:'predetermined-obligation-pertinent-native-window-v1',from:AT-86400000,through:AT-500,lines:[BLUE,RED],sourceHash:sourceHashes.COVERAGE,populationVerified:true,synchronizationVerified:true,priorRestrictionsReviewed:true,identityCoverageVerified:true},sources,historyHash:mariaCollectionsNativeHistoryHash(sources),mediaReviews:[],findings:{sourceHistoryHash:mariaCollectionsNativeHistoryHash(sources),semanticReviewComplete:true,originalLineVerified:true,contactPermissionVerified:true,contactDeferralClear:true,pendingPaymentClaim:false,optOut:false,humanHold:false,contactPurpose:'own-pending-obligation'},permittedContactWindow:{timezone:'America/Bogota',from:AT-10000,to:AT+60000,sourceHash:sourceHashes.WINDOW}};nativeBasis.basisHash=digest(nativeBasis);
 f.record={version:'collector-reviewed-case-v1',reviewId:'synthetic-reviewed-case',authorityHash:digest(f.authority),reviewSourceHash:sourceHashes.CATALOG_REVIEW,reviewedAt:AT-1000,expiresAt:AT+60000,manifest,nativeBasis,dueBasis:{guard:'collector-reviewed-due-basis-v1',manifestHash:digest(manifest),reviewSourceHash:sourceHashes.DUE_REVIEW,reviewedAt:AT-1000,expiresAt:AT+60000,rows:[{orderId:row.obligationId,clientId:row.clientId,financialFingerprint:row.financialRevision,bindingFingerprint:digest('synthetic binding source'),currency:'COP',acceptedPriceMinor:14000000,acceptedAt:AT-86400000,performedAt:AT-43200000,dueAt:AT-3600000,supportedBalanceMinor:row.balanceMinor,evidence:kinds.map(kind=>({kind,sourceHash:sourceHashes[kind]}))}]}};
 if(recordPatch)recordPatch(f.record);f.pin={reviewId:f.record.reviewId,recordHash:digest(f.record),reviewSourceHash:f.record.reviewSourceHash,authorityHash:digest(f.authority),sourceHashes:Object.values(sourceHashes)};f.selector={reviewId:f.pin.reviewId,recordHash:f.pin.recordHash};
 f.writeCatalog=()=>f.store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(host.collectionsReviewedRecordKey(f.record.reviewId),f.store.seal(f.record));if(catalogInstalled)f.writeCatalog();
 Object.defineProperty(f,'catalogMissing',{get:()=>!f.store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(host.collectionsReviewedRecordKey(f.record.reviewId)),set:missing=>{if(missing)f.store.db.prepare('DELETE FROM meta WHERE key=?').run(host.collectionsReviewedRecordKey(f.record.reviewId));else f.writeCatalog();}});
 f.transport=new Transport(f.config,async(target,options)=>{
  const u=new URL(target),instance=u.searchParams.get('instanceName')??u.pathname.split('/').at(-1),line=f.config.lines.find(l=>l.instance===instance);assert.ok(line);f.providerCalls.push({path:u.pathname,method:options.method});
  if(u.pathname==='/instance/fetchInstances')return new Response(JSON.stringify([{name:line.instance,ownerJid:line.phone+'@s.whatsapp.net',connectionStatus:'open'}]));
  const body=JSON.parse(options.body);
  if(u.pathname.startsWith('/message/sendText/')){f.sends++;assert.ok(f.store.db.prepare("SELECT 1 FROM maria_collection_contexts c JOIN outbox o ON o.id=c.outbox_id WHERE o.state='SENDING'").get());if(f.sendUncertain)throw Error('synthetic provider uncertainty');const mid='SYNTHETIC_HOST_SENT_MID_0001';f.records.push({line:line.phone,key:{id:mid,remoteJid:body.number+'@s.whatsapp.net',fromMe:true},messageTimestamp:AT/1000,message:{conversation:body.text},status:'READ'});return new Response(JSON.stringify({key:{id:mid}}));}
  assert.ok(u.pathname.startsWith('/chat/findMessages/'));const q=body.where.key,found=f.records.filter(r=>r.line===line.phone&&Object.entries(q).every(([k,v])=>r.key[k]===v)&&(!body.where.messageTimestamp||r.messageTimestamp*1000>=Date.parse(body.where.messageTimestamp.gte)&&r.messageTimestamp*1000<=Date.parse(body.where.messageTimestamp.lte)));return new Response(JSON.stringify({messages:{total:found.length,records:found.slice((body.page-1)*body.offset,body.page*body.offset)}}));
 });
 f.financialFetch=async(target,options)=>{
  assert.ok([reader.MARIA_FINANCIAL_READER_URL+'/snapshots',reader.MARIA_FINANCIAL_READER_URL+'/revalidate'].includes(target));assert.equal(options.headers.Authorization,'Bearer '+f.profile.token);const body=JSON.parse(options.body);f.financialCalls.push({target,body});if(f.financialError)throw Error('synthetic financial uncertainty');
  const snapshots=body.orders.map(b=>financialSnapshot(b,f.financialChanged,f.financialConflict)),data={guard:reader.MARIA_FINANCIAL_READER_GUARD,schemaVersion:reader.MARIA_FINANCIAL_SCHEMA,company:'FUMIGACION',tenantId:reader.MARIA_FINANCIAL_SCOPE.tenantId,companyId:reader.MARIA_FINANCIAL_SCOPE.companyId,advisorMembershipId:reader.MARIA_FINANCIAL_SCOPE.actorId,readOnly:true,cohortSha256:reader.MARIA_FINANCIAL_COHORT_SHA256,allowlistHash:syntheticPins[0],financialReadStartedAt:iso(AT),checkedAt:iso(AT),validUntil:iso(AT+30000),coverage:{completeForRequestedBindings:true,requestedOrders:body.orders.length,initialFiveOnly:true,configuredBoundOrders:5,allCompanyPortfolioCovered:false,hardDeletesCovered:false,bankVerified:false,freeTextAndDocumentContentsReturned:false,financialSourcesAreNotDebtAuthorization:true},snapshots};
  if(target.endsWith('/revalidate')){const results=snapshots.map(s=>{const expected=body.orders.find(b=>b.orderId===s.orderId);return {orderId:s.orderId,same:expected.expectedFinancialFingerprint===s.financialFingerprint&&expected.expectedBindingFingerprint===s.bindingFingerprint,requiresReview:s.sourceConflicts.length>0}}),same=results.every(r=>r.same),ok=same&&results.every(r=>!r.requiresReview);Object.assign(data,{results,same,status:ok?'UNCHANGED':'REVIEW',revalidationSucceeded:ok,sendPermitted:false});if(!ok)data.validUntil=null;}
  return new Response(JSON.stringify(data));
 };
 f.makeHost=()=>host.createMariaCollectionsHost(f.config,f.store,f.transport,{authorization:f.authority,catalogPins:[f.pin],financialFetch:f.financialFetch,now:()=>f.at,...(enabled===undefined?{}:{enabled})});f.host=f.makeHost();
 f.claims=()=>f.store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='collector_claims'").get()?f.store.db.prepare('SELECT COUNT(*) n FROM collector_claims').get().n:0;
 return f;
}

test('default OFF, unknown catalog and selector-only boundaries never create claims or invoke send',async t=>{
 const f=fixture(t);assert.equal(f.host.status().enabled,false);assert.equal(f.host.status().dataStatus,'UNKNOWN');assert.equal((await f.host.dispatch(f.selector)).state,'OFF');
 const fake=Object.create(Transport.prototype);fake.config=f.config;fake.send=async()=>true;assert.throws(()=>host.createMariaCollectionsHost(f.config,f.store,fake),/OWN_RUNTIME_REQUIRED/);
 for(const body of [{...f.selector,eligible:true},{...f.selector,phone:PHONE},{...f.selector,rows:f.record.manifest.rows},{reviewId:f.selector.reviewId,recordHash:digest('unknown')}])assert.equal((await f.host.prepare(body)).state,'NEEDS_REVIEW');
 f.catalogMissing=true;assert.equal((await f.host.prepare(f.selector)).state,'NEEDS_REVIEW');assert.equal(f.claims(),0);assert.equal(f.financialCalls.length,0);assert.equal(f.providerCalls.length,0);assert.equal(f.sends,0);assert.equal(f.host.status().productionReady,false);
});

test('real reader/native/context/Transport pipeline prepares a pinned reviewed balance, sends once and proves the exact native receipt',async t=>{
 const f=fixture(t,{enabled:true}),prepared=await f.host.prepare(f.selector);assert.equal(prepared.state,'STAGED',prepared.reason);assert.equal(f.claims(),1);assert.equal(f.sends,0);assert.ok(f.financialCalls.length>0);assert.ok(f.providerCalls.length>0);
 const text=f.store.open(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(prepared.key).body);assert.ok(text.includes('$120.000 COP'));assert.ok(!text.includes('$140.000 COP'));
 const sent=await f.host.dispatch(f.selector);assert.equal(sent.state,'ACCEPTED',sent.reason);assert.equal(sent.deliveryVerified,false);assert.equal(f.sends,1);assert.equal((await f.host.dispatch(f.selector)).duplicate,true);assert.equal(f.sends,1);
 const proof=await f.host.proveDelivery(f.selector);assert.equal(proof.state,'READ',proof.reason);assert.equal(proof.deliveryVerified,true);assert.equal(f.sends,1);assert.equal(proof.businessWrites,0);assert.equal(f.host.status().state,'READ');assert.equal(f.host.status().dataStatus,'UNKNOWN');
});

test('missing or contradictory reviewed due evidence and native basis block before live reads and before claims',async t=>{
 for(const recordPatch of [r=>r.dueBasis.rows[0].evidence.pop(),r=>r.dueBasis.rows[0].supportedBalanceMinor=1,r=>r.dueBasis.rows[0].evidence[0].sourceHash=digest('not pinned'),r=>r.nativeBasis=null]){
  const f=fixture(t,{enabled:true,recordPatch}),r=await f.host.prepare(f.selector);assert.equal(r.state,'NEEDS_REVIEW');assert.equal(f.claims(),0);assert.equal(f.financialCalls.length,0);assert.equal(f.providerCalls.length,0);assert.equal(f.sends,0);
 }
 const changed=fixture(t,{enabled:true});changed.record.dueBasis.rows[0].supportedBalanceMinor++;changed.writeCatalog();assert.equal((await changed.host.prepare(changed.selector)).state,'NEEDS_REVIEW');assert.equal(changed.claims(),0);assert.equal(changed.financialCalls.length,0);
});

test('actual missing capability, changed fingerprints, unapplied financial evidence and missing current native sources leave zero claims',async t=>{
 const missing=fixture(t,{enabled:true,installProfile:false});assert.equal((await missing.host.prepare(missing.selector)).state,'NEEDS_REVIEW');assert.equal(missing.claims(),0);assert.equal(missing.financialCalls.length,0);
 for(const mode of ['financialChanged','financialConflict','financialError','nativeMissing']){
  const f=fixture(t,{enabled:true});if(mode==='nativeMissing')f.records=[];else f[mode]=true;const r=await f.host.prepare(f.selector);assert.equal(r.state,'NEEDS_REVIEW',mode);assert.equal(r.dataStatus,'UNKNOWN',mode);assert.equal(f.claims(),0,mode);assert.equal(f.sends,0,mode);
 }
});

test('catalog revocation and unprepared requests cannot dispatch; sender uncertainty stays once-only with durable context',async t=>{
 const unprepared=fixture(t,{enabled:true});assert.equal((await unprepared.host.dispatch(unprepared.selector)).state,'NEEDS_REVIEW');assert.equal(unprepared.claims(),0);assert.equal(unprepared.sends,0);
 const f=fixture(t,{enabled:true});assert.equal((await f.host.prepare(f.selector)).state,'STAGED');f.catalogMissing=true;assert.equal((await f.host.dispatch(f.selector)).state,'NEEDS_REVIEW');assert.equal(f.sends,0);f.catalogMissing=false;f.sendUncertain=true;assert.equal((await f.host.dispatch(f.selector)).state,'UNCERTAIN');assert.equal(f.sends,1);f.host=f.makeHost();assert.equal((await f.host.dispatch(f.selector)).duplicate,true);assert.equal(f.sends,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM maria_collection_contexts').get().n,1);
});

test('real context preserves a payment reply for read-only admin review without unsolicited notifications or payment acceptance',async t=>{
 const f=fixture(t,{enabled:true});await f.host.prepare(f.selector);await f.host.dispatch(f.selector);const event={id:'SYNTHETIC_HOST_PAYMENT_REPLY_0001',phone:PHONE,line:BLUE,fromMe:false,at:AT+1,kind:'text',text:'Ya pagué al técnico',quotedId:'SYNTHETIC_HOST_SENT_MID_0001'};f.store.enqueue(event);assert.equal(f.host.collectionsContext.inspectIncoming(event).consumed,true);const before=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,r=f.host.repliesReview();assert.equal(r.items.length,1);assert.equal(r.items[0].replyKind,'PAYMENT_REPORTED');assert.equal(r.items[0].blockFurtherCollection,true);assert.equal(r.items[0].paymentVerified,false);assert.doesNotMatch(JSON.stringify(r),new RegExp(PHONE+'|'+event.id+'|'+five[0].orderId));assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,before);assert.equal(f.sends,1);assert.equal(r.businessWrites,0);
});

test('a pinned revised manifest cannot reinterpret an existing immutable obligation claim as the newly reviewed proposal',async t=>{
 const f=fixture(t,{enabled:true}),first=await f.host.prepare(f.selector);assert.equal(first.state,'STAGED');const calls=f.financialCalls.length,again=await f.host.prepare(f.selector);assert.equal(again.duplicate,true);assert.equal(again.dataStatus,'UNKNOWN');assert.equal(f.financialCalls.length,calls);
 f.record.reviewId='synthetic-revised-review';f.record.manifest.manifestId='synthetic-revised-review';f.record.nativeBasis.manifestHash=digest(f.record.manifest);delete f.record.nativeBasis.basisHash;f.record.nativeBasis.basisHash=digest(f.record.nativeBasis);f.record.dueBasis.manifestHash=digest(f.record.manifest);f.pin={...f.pin,reviewId:f.record.reviewId,recordHash:digest(f.record)};f.selector={reviewId:f.pin.reviewId,recordHash:f.pin.recordHash};f.writeCatalog();f.host=f.makeHost();const r=await f.host.prepare(f.selector);assert.equal(r.state,'NEEDS_REVIEW');assert.equal(r.reason,'COLLECTIONS_HOST_PREVIOUS_OBLIGATION_REVIEW_PRESERVED');assert.equal(f.claims(),1);assert.equal(f.financialCalls.length,calls);assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM collector_groups').get().n,1);
});

test('review installation requires an independent constructor pin and current financial/native preflight, writes encrypted meta only and never activates sending',async t=>{
 const f=fixture(t,{catalogInstalled:false});assert.equal((await f.host.prepare(f.selector)).state,'NEEDS_REVIEW');assert.equal(f.claims(),0);const altered={...f.record,eligible:true};assert.equal((await f.host.installReviewedRecord(altered)).state,'NEEDS_REVIEW');assert.equal(f.financialCalls.length,0);
 const empty=host.createMariaCollectionsHost(f.config,f.store,f.transport,{authorization:f.authority,financialFetch:f.financialFetch,now:()=>f.at});assert.equal((await empty.installReviewedRecord(f.record)).state,'NEEDS_REVIEW');assert.equal(f.financialCalls.length,0);
 const installed=await f.host.installReviewedRecord(f.record);assert.equal(installed.state,'REVIEWED_RECORD_STORED',installed.reason);assert.equal(installed.claimsCreated,0);assert.equal(f.claims(),0);assert.equal(f.sends,0);const saved=f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(host.collectionsReviewedRecordKey(f.record.reviewId));assert.ok(saved);assert.ok(!saved.value.includes(PHONE));assert.deepEqual(f.store.open(saved.value),f.record);const calls=f.financialCalls.length;assert.equal((await f.host.installReviewedRecord(f.record)).duplicate,true);assert.equal(f.financialCalls.length,calls);assert.equal((await f.host.prepare(f.selector)).state,'STAGED');assert.equal((await f.host.dispatch(f.selector)).state,'OFF');assert.equal(f.sends,0);
 for(const mode of ['financialConflict','nativeMissing']){const g=fixture(t,{catalogInstalled:false});if(mode==='nativeMissing')g.records=[];else g[mode]=true;assert.equal((await g.host.installReviewedRecord(g.record)).state,'NEEDS_REVIEW');assert.equal(g.catalogMissing,true);assert.equal(g.claims(),0);assert.equal(g.sends,0);}
});

test('late payment replies and exact receipt reads survive disabled sending and expired one-off authority',async t=>{
 const f=fixture(t,{enabled:true});await f.host.prepare(f.selector);await f.host.dispatch(f.selector);f.at=AT+60001;Date.now=()=>f.at;
 try{f.host=host.createMariaCollectionsHost(f.config,f.store,f.transport,{authorization:f.authority,catalogPins:[f.pin],financialFetch:f.financialFetch,now:()=>f.at,enabled:false});assert.equal((await f.host.dispatch(f.selector)).state,'OFF');assert.equal((await f.host.prepare(f.selector)).state,'NEEDS_REVIEW');const proof=await f.host.proveDelivery(f.selector);assert.equal(proof.deliveryVerified,true,proof.reason);assert.equal(proof.state,'READ');const event={id:'SYNTHETIC_LATE_PAYMENT_REPLY_0001',phone:PHONE,line:BLUE,fromMe:false,at:f.at,kind:'text',text:'Ya pagué',quotedId:'SYNTHETIC_HOST_SENT_MID_0001'};f.store.enqueue(event);assert.equal(f.host.collectionsContext.inspectIncoming(event).consumed,true);assert.equal(f.host.repliesReview().items.length,1);assert.equal(f.sends,1);}finally{Date.now=()=>AT;}
});

function repinNativeFixture(f){
 const b=f.record.nativeBasis;b.manifestHash=digest(f.record.manifest);b.sources=f.records.map(r=>mariaCollectionsNativeSource(r,PHONE,r.line));b.historyHash=mariaCollectionsNativeHistoryHash(b.sources);b.findings.sourceHistoryHash=b.historyHash;delete b.basisHash;b.basisHash=digest(b);f.record.dueBasis.manifestHash=digest(f.record.manifest);f.pin={...f.pin,recordHash:digest(f.record)};f.selector={reviewId:f.pin.reviewId,recordHash:f.pin.recordHash};f.writeCatalog();f.host=f.makeHost();
}
test('real host blocks an other-line LID-only source before claims without inheriting PN from the reviewed line',async t=>{
 const f=fixture(t,{enabled:true}),lid='123456789012345@lid';f.records[0].key.remoteJid=lid;f.records[0].key.remoteJidAlt=PHONE+'@s.whatsapp.net';repinNativeFixture(f);f.records.push({line:RED,key:{id:'SYNTHETIC_RED_UNKNOWN_LID_0001',remoteJid:lid,fromMe:false},messageTimestamp:(AT-1000)/1000,message:{conversation:'ya pagué'}});
 const result=await f.host.prepare(f.selector);assert.equal(result.state,'NEEDS_REVIEW');assert.equal(result.reason,'COLLECTIONS_HOST_CURRENT_NATIVE_REVIEW_PENDING');assert.equal(f.claims(),0);assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM outbox').get().n,0);assert.equal(f.store.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='collector_groups'").get().n,0);
});
test('real host admits the same LID only through exact reviewed explicit-PN sources on each own line',async t=>{
 const f=fixture(t),lid='123456789012345@lid';f.records[0].key.remoteJid=lid;f.records[0].key.remoteJidAlt=PHONE+'@s.whatsapp.net';f.records.push({line:RED,key:{id:'SYNTHETIC_RED_REVIEWED_PN_0001',remoteJid:lid,remoteJidAlt:PHONE+'@s.whatsapp.net',fromMe:false},messageTimestamp:(AT-1000)/1000,message:{conversation:'Información del servicio revisada en esta línea.'}});repinNativeFixture(f);
 const result=await f.host.prepare(f.selector);assert.equal(result.state,'STAGED',result.reason);assert.equal(f.claims(),1);assert.equal(f.sends,0);assert.equal((await f.host.dispatch(f.selector)).state,'OFF');
});
test('real final current-state bundle follows financial revalidation and blocks changed attention before SENDING',async t=>{
 const f=fixture(t,{enabled:true}),read=f.financialFetch,provider=f.transport.fetcher;let finalRevalidated=false,mutatedDuringFinalAttention=false;
 f.financialFetch=async(...args)=>{const response=await read(...args);if(args[0].endsWith('/revalidate'))finalRevalidated=true;return response;};
 f.transport.fetcher=async(target,options)=>{if(finalRevalidated&&!mutatedDuringFinalAttention&&options.body&&JSON.parse(options.body).offset===50){mutatedDuringFinalAttention=true;f.records[0].message={conversation:'changed after final financial revalidation, same MID/time'};}return provider(target,options);};f.host=f.makeHost();
 assert.equal((await f.host.prepare(f.selector)).state,'STAGED');const result=await f.host.dispatch(f.selector);assert.equal(finalRevalidated,true);assert.equal(mutatedDuringFinalAttention,true);assert.equal(result.state,'REVIEW');assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM maria_collection_contexts').get().n,0);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'COLLECTOR_STAGED');assert.equal(f.claims(),1);
});
test('empty breakdown presence adds no host ban or arithmetic balance; actual backend payment conflicts still block',async t=>{
 // Current backend flags every nonzero paid amount. The clean partial variant
 // is an interface fixture only: the host adds no extra categorical policy.
 for(const [paid,conflict] of [['0',false],['10000',true],['10000',false]]){const f=fixture(t),read=f.financialFetch,reviewed=digest('synthetic reviewed financial source '+paid+conflict);f.record.manifest.rows[0].financialRevision=reviewed;f.record.dueBasis.rows[0].financialFingerprint=reviewed;
  f.financialFetch=async(...args)=>{const response=await read(...args),data=await response.json();for(const row of data.snapshots){row.financialFingerprint=reviewed;row.order.recordedPaidCop=paid;row.sourceConflicts=conflict?['SOURCE_UNINTERPRETED_PAYMENT_EVIDENCE']:[];row.order.paymentBreakdown={present:true,sourceRef:'financial-ref:'+'c'.repeat(64),entries:[],contentReturned:false};}return new Response(JSON.stringify(data));};repinNativeFixture(f);
  const result=await f.host.prepare(f.selector);if(conflict){assert.equal(result.state,'NEEDS_REVIEW');assert.equal(f.claims(),0);}else{assert.equal(result.state,'STAGED',result.reason);const text=f.store.open(f.store.db.prepare('SELECT body FROM outbox').get().body);assert.ok(text.includes('$120.000 COP'));assert.ok(!text.includes('$130.000 COP'));assert.ok(!text.includes('$140.000 COP'));assert.equal((await f.host.dispatch(f.selector)).state,'OFF');}assert.equal(f.sends,0);
 }
});
