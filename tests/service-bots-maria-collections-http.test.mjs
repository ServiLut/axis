import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Engine} from '../automation/service-bots/engine.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {Transport} from '../automation/service-bots/transport.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {createBotServer as productionServer} from '../automation/service-bots/server.mjs';
import {COLLECTION_SCOPE,digest,groupKey,obligationKey,COLLECTOR_GUARD} from '../automation/service-bots/maria-collections.mjs';

// Reuse the existing synthetic source fixture, not a fake host/Engine. The
// fixture's checked temporary reader changes exactly the two approved PINs.
// This extraction includes no tests, private data or production override.
const fixtureUrl=new URL('./service-bots-maria-collections-host.test.mjs',import.meta.url),fixtureSource=readFileSync(fixtureUrl,'utf8'),marker="test('default OFF,";
assert.equal(fixtureSource.split(marker).length,2);
let fixturePrefix=fixtureSource.slice(0,fixtureSource.indexOf(marker));
fixturePrefix=fixturePrefix.replace(/from '(\.\.[^']+)'/g,(_,spec)=>"from '"+new URL(spec,fixtureUrl).href+"'").replaceAll('import.meta.url',JSON.stringify(fixtureUrl.href));
const shared=await import('data:text/javascript;base64,'+Buffer.from(fixturePrefix+'\nexport {fixture,host,reader,hostFile,readerFile,AT,PHONE,BLUE,RED,five};').toString('base64'));
const serverUrl=new URL('../automation/service-bots/server.mjs',import.meta.url),serverSource=readFileSync(serverUrl,'utf8'),temp=mkdtempSync(join(tmpdir(),'maria-collections-http-')),serverFile=join(temp,'server.mjs'),relocations=[];
const serverCopy=serverSource.replace(/from '([^']+)'/g,(original,spec)=>{if(!spec.startsWith('.'))return original;const target=spec==='./maria-financial-reader.mjs'?pathToFileURL(shared.readerFile).href:spec==='./maria-collections-host.mjs'?pathToFileURL(shared.hostFile).href:new URL(spec,serverUrl).href,replacement="from '"+target+"'";relocations.push([original,replacement]);return replacement;});
let restored=serverCopy;for(const[a,b]of relocations)restored=restored.replace(b,a);assert.equal(restored,serverSource);writeFileSync(serverFile,serverCopy);
const {createBotServer}=await import(pathToFileURL(serverFile).href),sha=v=>createHash('sha256').update(v).digest('hex');
const ADMIN='a'.repeat(60),WEBHOOK='w'.repeat(60),FINANCIAL='f'.repeat(60),REGISTRATION='r'.repeat(60),AT=shared.AT,BLUE=shared.BLUE,RED=shared.RED,PHONE=shared.PHONE;
const routes=['/collections-status','/collections-review-install','/collections-prepare','/collections-dispatch','/collections-delivery-proof','/collections-replies-review'];
after(()=>{assert.equal(readFileSync(serverUrl,'utf8'),serverSource);assert.equal(readFileSync(fixtureUrl,'utf8'),fixtureSource);const safe=resolve(temp);assert.ok(safe.startsWith(resolve(tmpdir())+sep+'maria-collections-http-'));rmSync(safe,{recursive:true,force:true});});

async function fixture(t,{pins=true,sending,rawPins,rawEnabled,catalogInstalled=true,engineMode='real',production=false,company='fumigacion',fast=false}={}){
 const f=shared.fixture(t,{enabled:false,catalogInstalled});
 Object.assign(f.config,{...BUSINESSES.fumigacion,...f.config,webhookHash:sha(WEBHOOK),historyCheckRequired:true,inactivityFollowupEnabled:false,responseTargetMs:fast?3000:10000,chiefOnly:false});assert.ok(f.store instanceof Store);assert.ok(f.transport instanceof Transport);
 f.authority={reference:shared.host.MARIA_COLLECTIONS_AUTHORITY_REFERENCE,sourceHash:sha('puedes hacer que maria revise el programa y revise cuales están pendientes por cobrar y le escriba a cada cliente realizando el respectivo cobro muy empático'),company:COLLECTION_SCOPE.company,tenantId:COLLECTION_SCOPE.tenantId,companyId:COLLECTION_SCOPE.companyId,expiresAt:Date.parse(shared.host.MARIA_COLLECTIONS_AUTHORITY_MAX_EXPIRY),oneOff:true};
 f.record.authorityHash=digest(f.authority);f.pin={...f.pin,recordHash:digest(f.record),authorityHash:digest(f.authority)};f.selector={reviewId:f.pin.reviewId,recordHash:f.pin.recordHash};if(catalogInstalled)f.writeCatalog();
 const providerFetch=f.transport.fetcher;f.transport.fetcher=(target,options)=>target.startsWith(shared.reader.MARIA_FINANCIAL_READER_URL+'/')?f.financialFetch(target,options):providerFetch(target,options);
 f.context=f.host.collectionsContext;f.engine=engineMode==='fake'?{}:engineMode==='absent-context'?new Engine(f.store,f.config):new Engine(f.store,f.config,{collectionsContext:f.context});
 if(engineMode==='fake-process')f.engine.process=async()=>{};
 if(engineMode==='fake-context')f.engine.collectionsContext={...f.context};
 if(engineMode==='fake-transport')f.transport.send=async()=>{};
 if(company!=='fumigacion'){f.config.company=company;f.store.company=company;f.config.lines=BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'synthetic-foreign-'+i}));}
 const names=['BOT_COLLECTIONS_REVIEW_PINS_JSON','BOT_COLLECTIONS_ENABLED'],old=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{
  if(rawPins!==undefined)process.env.BOT_COLLECTIONS_REVIEW_PINS_JSON=rawPins;else if(pins)process.env.BOT_COLLECTIONS_REVIEW_PINS_JSON=JSON.stringify([f.pin]);else delete process.env.BOT_COLLECTIONS_REVIEW_PINS_JSON;
  if(rawEnabled!==undefined)process.env.BOT_COLLECTIONS_ENABLED=rawEnabled;else if(sending!==undefined)process.env.BOT_COLLECTIONS_ENABLED=String(sending);else delete process.env.BOT_COLLECTIONS_ENABLED;
  f.server=(production?productionServer:createBotServer)(f.config,f.store,f.transport,f.engine);
 }finally{for(const k of names)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
 await new Promise(r=>f.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+f.server.address().port;
 f.post=async(route,body={},token=ADMIN,method='POST')=>{const response=await fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(4000)});return{status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};};
 t.after(async()=>{f.server.closeAllConnections();await new Promise(r=>f.server.close(r));});return f;
}
function durableAttempt(f,{attemptAt=AT,phone=PHONE,line=BLUE}={}){
 const row={obligationId:shared.five[0].orderId,phone,originLine:line},key=groupKey(COLLECTION_SCOPE,[row]),text='Hola, podemos revisar el saldo pendiente de tu servicio. Gracias por tu ayuda.';
 const c=f.store.conversation(phone);assert.ok(c);f.store.db.prepare('INSERT INTO outbox(id,phone,line,body,internal,revision,state,created,updated,case_id) VALUES(?,?,?,?,0,?,?,?, ?,?)').run(key,phone,line,f.store.seal(text),c.revision,'COLLECTOR_STAGED',attemptAt,attemptAt,c.state.caseId);
 const input={guard:COLLECTOR_GUARD,groupKey:key,attemptId:'synthetic-http-attempt',outboxId:key,phone,line,orderIds:[row.obligationId],obligationKeys:[obligationKey(COLLECTION_SCOPE,row.obligationId)],textHash:digest(text),text,attemptAt,manifestHash:digest('synthetic-http-manifest')};
 f.store.tx(()=>{const r=f.context.registerAttempt(input);f.context.assertAttempt({...input,contextId:r.contextId});f.store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id=?").run('SYNTHETIC_HTTP_COLLECTION_MID_0001',key);f.context.attachMid({...r,mid:'SYNTHETIC_HTTP_COLLECTION_MID_0001'});});return key;
}
const incoming=(line=BLUE,{id='SYNTHETIC_HTTP_PAYMENT_REPLY_0001',at=AT+1000,text='ya pagué',phone=PHONE}={})=>({owner:line,instance:line===BLUE?'cucaracha-azul':'cucaracha-roja',event:{id,phone,fromMe:false,at:new Date(at).toISOString(),kind:'text',text,quotedId:null}});

test('collections default OFF/no pins is private, creates no claims and startup never installs or dispatches',async t=>{
 const f=await fixture(t,{pins:false,production:true});const s=await f.post('/collections-status');assert.equal(s.status,200);assert.equal(s.cache,'no-store, private');assert.equal(s.body.enabled,false);assert.equal(s.body.contextConfigured,true);assert.equal(s.body.catalogEntries,0);assert.equal(s.body.dataStatus,'UNKNOWN');
 for(const route of routes.slice(1)){const r=await f.post(route,route.endsWith('replies-review')?{after:0,limit:20}:f.selector);assert.equal(r.status,200);assert.equal(r.body.businessWrites,0);}
 assert.equal(f.claims(),0);assert.equal(f.sends,0);assert.equal(f.providerCalls.length,0);assert.equal(f.financialCalls.length,0);
 for(const route of ['/collections-status/','/collections-status?enabled=true','/collections-%73tatus','/collections-setup'])assert.equal((await f.post(route,{})).status,404);
});
test('six collections HTTP routes require existing admin, POST and own FUM scope',async t=>{
 const f=await fixture(t,{pins:false});for(const route of routes)for(const token of [null,WEBHOOK,FINANCIAL,REGISTRATION,'z'.repeat(60)]){const r=await f.post(route,' '.repeat(262145),token);assert.equal(r.status,401);assert.deepEqual(r.body,{error:'UNAUTHORIZED'});}
 for(const route of routes)assert.equal((await f.post(route,{},ADMIN,'GET')).status,405);
 const foreign=await fixture(t,{pins:false,company:'servicio-tecnico'});for(const route of routes)assert.equal((await foreign.post(route,{})).status,403);
 assert.equal(f.financialCalls.length,0);assert.equal(f.providerCalls.length,0);assert.equal(f.sends,0);
});
test('byte limits precede JSON decoding; selectors/cursors/status are closed and cannot carry authority or pins',async t=>{
 const f=await fixture(t);for(const route of routes){const limit=route==='/collections-review-install'?262144:8192;assert.equal((await f.post(route,' '.repeat(limit+1))).status,413);assert.equal((await f.post(route,' '.repeat(limit))).status,400);}
 assert.equal((await f.post('/collections-status',{enabled:true})).status,400);
 for(const route of ['/collections-prepare','/collections-dispatch','/collections-delivery-proof'])for(const body of [{...f.selector,phone:PHONE},{...f.selector,authority:f.authority},{...f.selector,catalogPins:[f.pin]},{...f.selector,eligible:true}]){const r=await f.post(route,body);assert.equal(r.status,200);assert.equal(r.body.state,'NEEDS_REVIEW');}
 for(const body of [{after:0,limit:51},{after:0,limit:20,phone:PHONE},[]]){const r=await f.post('/collections-replies-review',body);assert.equal(r.status,409);assert.deepEqual(r.body,{error:'OWN_COLLECTIONS_NOT_VERIFIED'});}
 assert.equal(f.claims(),0);assert.equal(f.sends,0);assert.equal(f.providerCalls.length,0);assert.equal(f.financialCalls.length,0);
});
test('malformed/oversized constructor ENV closes only collections and never echoes its contents',async t=>{
 for(const options of [{rawPins:'secret-malformed-json'},{rawPins:' '.repeat(65537)},{rawPins:'{}'},{rawPins:'[{}]'},{rawEnabled:'TRUE'}]){const f=await fixture(t,options),s=await f.post('/collections-status');assert.equal(s.status,200);assert.equal(s.body.dataStatus,'UNKNOWN');assert.equal(s.body.reason,'OWN_COLLECTIONS_CONFIGURATION_UNAVAILABLE');assert.equal(s.body.enabled,false);assert.equal((await f.post('/collections-prepare',f.selector)).status,409);assert.equal((await f.post('/financial-reader-status')).status,200);assert.equal((await f.post('/drain')).status,200);assert.doesNotMatch(JSON.stringify(s),/secret-malformed-json|recordHash|sourceHashes/);assert.equal(f.sends,0);assert.equal(f.claims(),0);}
});
test('fake or missing actual Engine/context/Transport cannot expose a monetary operation; old four-argument ABI remains',async t=>{
 for(const engineMode of ['fake','absent-context','fake-process','fake-context','fake-transport']){const f=await fixture(t,{engineMode,pins:false,production:true});const s=await f.post('/collections-status');assert.equal(s.status,200);assert.equal(s.body.dataStatus,'UNKNOWN');assert.equal(s.body.enabled,false);assert.equal((await f.post('/collections-prepare',f.selector)).status,409);assert.equal((await f.post('/financial-reader-status')).status,200);assert.equal(f.sends,0);assert.equal(f.claims(),0);assert.equal(f.providerCalls.length,0);}
});
test('actual HTTP pipeline installs only an independently pinned record, prepares separately, sends once and proves exact native MID',async t=>{
 const f=await fixture(t,{sending:true,catalogInstalled:false});assert.equal((await f.post('/collections-prepare',f.selector)).body.state,'NEEDS_REVIEW');assert.equal(f.claims(),0);
 const altered={...f.record,eligible:true};assert.equal((await f.post('/collections-review-install',altered)).body.state,'NEEDS_REVIEW');assert.equal(f.financialCalls.length,0);
 const installed=await f.post('/collections-review-install',f.record);assert.equal(installed.status,200);assert.equal(installed.body.state,'REVIEWED_RECORD_STORED',installed.body.reason);assert.equal(installed.body.claimsCreated,0);assert.equal(f.claims(),0);assert.equal(f.sends,0);assert.equal((await f.post('/collections-review-install',f.record)).body.duplicate,true);
 assert.equal((await f.post('/collections-prepare',f.selector)).body.state,'STAGED');assert.equal(f.claims(),1);assert.equal(f.sends,0);assert.equal((await f.post('/collections-dispatch',f.selector)).body.state,'ACCEPTED');assert.equal(f.sends,1);assert.equal((await f.post('/collections-dispatch',f.selector)).body.duplicate,true);assert.equal(f.sends,1);assert.equal((await f.post('/collections-delivery-proof',f.selector)).body.deliveryVerified,true);
});
test('paused public/sender and expired authority still consume verified same-line paid replies before history/model work',async t=>{
 const f=await fixture(t,{sending:false});durableAttempt(f);f.config.enabled=false;Date.now=()=>Date.parse('2026-11-13T00:00:01.000Z');f.at=Date.now();f.config.activatedAt=Date.now()-60000;const at=Date.now(),event=incoming(BLUE,{at});
 const before=f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),outbox=f.store.db.prepare('SELECT * FROM outbox').all(),provider=f.providerCalls.length;
 assert.equal((await f.post('/event',event,ADMIN)).status,401);assert.equal((await f.post('/event',event,WEBHOOK)).body.accepted,true);assert.equal(f.providerCalls.length,provider+1);const reads=f.providerCalls.length;
 try{const r=await f.post('/drain');assert.equal(r.status,200);assert.equal(r.body.processed,1);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(event.event.id).state,'COLLECTION_REPLY_REVIEW');assert.equal(f.providerCalls.length,reads);assert.equal(f.financialCalls.length,0);assert.equal(f.sends,0);assert.deepEqual(f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),before);assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox').all(),outbox);assert.equal(f.store.db.prepare('SELECT count(*) n FROM questions').get().n,0);const review=await f.post('/collections-replies-review',{after:0,limit:20});assert.equal(review.body.items.length,1);assert.equal(review.body.items[0].replyKind,'PAYMENT_REPORTED');assert.equal(review.body.items[0].paymentVerified,false);assert.doesNotMatch(JSON.stringify(review.body),new RegExp(PHONE+'|'+event.event.id));assert.equal((await f.post('/drain')).body.processed??0,0);}finally{Date.now=()=>AT;}
});
test('same canonical PN arriving on the other own line is conservatively consumed before quote/model even while paused',async t=>{
 const f=await fixture(t);durableAttempt(f);f.config.enabled=false;const event=incoming(RED,{id:'SYNTHETIC_HTTP_CROSS_LINE_0001'});assert.equal((await f.post('/event',event,WEBHOOK)).body.accepted,true);const calls=f.providerCalls.length;
 const r=await f.post('/drain');assert.equal(r.body.processed,1);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(event.event.id).state,'COLLECTION_REPLY_REVIEW');assert.equal(f.providerCalls.length,calls);assert.equal(f.financialCalls.length,0);assert.equal(f.sends,0);const reply=f.store.open(f.store.db.prepare('SELECT body FROM maria_collection_replies').get().body);assert.equal(reply.correlation,'CROSS_LINE_UNCONFIRMED_COLLECTION_CONTEXT');assert.equal(reply.paymentVerified,false);assert.equal(f.store.db.prepare('SELECT line FROM outbox').get().line,BLUE);assert.equal(f.store.db.prepare('SELECT line FROM events WHERE id=?').get(event.event.id).line,RED);assert.equal(f.store.db.prepare('SELECT count(*) n FROM questions').get().n,0);
});
test('paused ingress accepts only active canonical collection associations, preserves second precision and ignores older sources',async t=>{
 const f=await fixture(t);f.at=AT+750;durableAttempt(f,{attemptAt:AT+750});f.config.enabled=false;
 const rounded=incoming(BLUE,{id:'SYNTHETIC_HTTP_ROUNDED_0001',at:AT}),old=incoming(BLUE,{id:'SYNTHETIC_HTTP_TOO_OLD_0001',at:AT-1000}),other=incoming(BLUE,{id:'SYNTHETIC_HTTP_OTHER_PHONE_0001',phone:'573000006666'});
 for(const e of [old,other])assert.equal((await f.post('/event',e,WEBHOOK)).body.accepted,false);assert.equal((await f.post('/event',rounded,WEBHOOK)).body.accepted,true);assert.equal((await f.post('/drain')).body.processed,1);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(rounded.event.id).state,'COLLECTION_REPLY_REVIEW');assert.equal(f.store.db.prepare('SELECT count(*) n FROM events').get().n,1);assert.equal(f.sends,0);
});
test('ambiguous line, corrupted ciphertext and changed persisted source stop in REVIEW without ordinary fallback or ledger changes',async t=>{
 for(const mode of ['ambiguous','cipher','binding']){const f=await fixture(t);durableAttempt(f);f.config.enabled=false;const body=incoming(BLUE,{id:'SYNTHETIC_HTTP_SOURCE_'+mode});assert.equal((await f.post('/event',body,WEBHOOK)).body.accepted,true);const ledger=f.store.db.prepare('SELECT * FROM outbox').all(),conversation=f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),calls=f.providerCalls.length;
  if(mode==='ambiguous')f.store.db.prepare('INSERT INTO event_sources(event_id,line) VALUES(?,?)').run(body.event.id,RED);
  if(mode==='cipher')f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run('invalid-ciphertext',body.event.id);
  if(mode==='binding'){const row=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(body.event.id),e=f.store.open(row.body);e.phone='573000006666';f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal(e),body.event.id);}
  assert.equal((await f.post('/drain')).body.processed,1);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(body.event.id).state,'REVIEW');assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox').all(),ledger);assert.deepEqual(f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),conversation);assert.equal(f.store.db.prepare('SELECT count(*) n FROM questions').get().n,0);assert.equal(f.sends,0);assert.equal(f.providerCalls.length,calls);
 }
});
test('paused webhook uses explicit native PN only for existing collection context, with invalid sender ENV and no extra native/model reads',async t=>{
 const f=await fixture(t,{rawPins:'not-json'});durableAttempt(f);f.config.enabled=false;
 const raw=(id,phone)=>({key:{id,remoteJid:'123456789012345@lid',remoteJidAlt:phone+'@s.whatsapp.net',fromMe:false},messageTimestamp:(AT+1000)/1000,message:{conversation:'ok listo'}}),body={event:'messages.upsert',instance:'cucaracha-roja',data:[raw('SYNTHETIC_HTTP_WEBHOOK_REPLY_0001',PHONE),raw('SYNTHETIC_HTTP_WEBHOOK_OTHER_0001','573000006666')]};
 const response=await f.post('/webhook',body,WEBHOOK);assert.equal(response.status,202);assert.equal(response.body.accepted,1);assert.equal(f.providerCalls.length,1);const calls=f.providerCalls.length;assert.equal((await f.post('/drain')).body.processed,1);assert.equal(f.providerCalls.length,calls);assert.equal(f.store.db.prepare('SELECT count(*) n FROM events').get().n,1);assert.equal(f.store.db.prepare('SELECT state FROM events').get().state,'COLLECTION_REPLY_REVIEW');assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM maria_collection_replies').get().body).correlation,'CROSS_LINE_UNCONFIRMED_COLLECTION_CONTEXT');assert.equal(f.sends,0);assert.equal(f.financialCalls.length,0);assert.equal((await f.post('/collections-status')).body.dataStatus,'UNKNOWN');
});
test('fast paused scheduler continues bounded early-consumer batches beyond thirty without ordinary history/model or sends',async t=>{
 const f=await fixture(t,{fast:true});durableAttempt(f);f.config.enabled=false;
 for(let i=0;i<32;i++){const value=incoming(i%2?RED:BLUE,{id:'SYNTHETIC_HTTP_BATCH_REPLY_'+String(i).padStart(4,'0'),at:AT+1000+i});f.store.enqueue({id:value.event.id,phone:PHONE,line:value.owner,fromMe:false,at:Date.parse(value.event.at),kind:'text',text:value.event.text,forwarded:false,quotedId:null});}
 assert.equal((await f.post('/event',incoming(BLUE,{id:'SYNTHETIC_HTTP_BATCH_WAKE_0001',at:AT+2000}),WEBHOOK)).body.accepted,true);const calls=f.providerCalls.length;
 for(let i=0;i<100&&f.store.db.prepare("SELECT count(*) n FROM events WHERE state='PENDING'").get().n;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE state='COLLECTION_REPLY_REVIEW'").get().n,33);assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE state='PENDING'").get().n,0);assert.equal(f.providerCalls.length,calls);assert.equal(f.financialCalls.length,0);assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM questions').get().n,0);
});
test('authenticated conflicting duplicate source is preserved in REVIEW without new financial evidence or ordinary fallback',async t=>{
 const f=await fixture(t);durableAttempt(f);f.config.enabled=false;const original=incoming();assert.equal((await f.post('/event',original,WEBHOOK)).body.accepted,true);const before=f.store.db.prepare('SELECT body FROM events').get().body,outbox=f.store.db.prepare('SELECT * FROM outbox').all();
 const changed=structuredClone(original);changed.event.text='el texto cambió';const result=await f.post('/event',changed,WEBHOOK);assert.equal(result.status,202);assert.equal(result.body.requiresReview,true);assert.equal(f.store.db.prepare('SELECT state FROM events').get().state,'REVIEW');assert.equal(f.store.db.prepare('SELECT body FROM events').get().body,before);const calls=f.providerCalls.length;await f.post('/drain');assert.equal(f.providerCalls.length,calls);assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox').all(),outbox);assert.equal(f.sends,0);assert.equal(f.financialCalls.length,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM questions').get().n,0);
});
for(const enabled of [true,false])for(const crossLine of [false,true])test('bounded thirty-reply batch defers ordinary work with public '+enabled+' and '+(crossLine?'cross-line':'same-line')+' context',async t=>{
 const f=await fixture(t,{fast:false});durableAttempt(f);f.config.enabled=enabled;const line=crossLine?RED:BLUE;
 for(let i=0;i<30;i++){const v=incoming(line,{id:'SYNTHETIC_HTTP_BOUNDED_REPLY_'+String(i).padStart(4,'0'),at:AT+1000+i});f.store.enqueue({id:v.event.id,phone:PHONE,line,fromMe:false,at:Date.parse(v.event.at),kind:'text',text:v.event.text,forwarded:false,quotedId:null});}
 const last=incoming(line,{id:'SYNTHETIC_HTTP_BOUNDED_LAST_0001',at:AT+2000});assert.equal((await f.post('/event',last,WEBHOOK)).body.accepted,true);const calls=f.providerCalls.length,outbox=f.store.db.prepare('SELECT * FROM outbox').all();
 const first=await f.post('/drain');assert.equal(first.status,200);assert.equal(first.body.processed,30);assert.equal(first.body.collectionsPending,true);assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE state='COLLECTION_REPLY_REVIEW'").get().n,30);assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE state='PENDING'").get().n,1);assert.equal(f.providerCalls.length,calls);assert.equal(f.financialCalls.length,0);assert.equal(f.sends,0);assert.ok(f.store.db.prepare('SELECT 1 FROM meta WHERE key=?').get('verified-ingestion-drain-wake-v1'));
 const second=await f.post('/drain');assert.equal(second.status,200);assert.equal(second.body.processed,1);assert.equal(second.body.collectionsPending,undefined);assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE state='COLLECTION_REPLY_REVIEW'").get().n,31);assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE state='PENDING'").get().n,0);assert.equal(f.providerCalls.length,calls);assert.equal(f.financialCalls.length,0);assert.equal(f.sends,0);assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox').all(),outbox);assert.equal(f.store.db.prepare('SELECT count(*) n FROM questions').get().n,0);
});
test('existing nonfast scheduler resumes the remaining collection reply on its next bounded tick',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture(t,{fast:false});durableAttempt(f);f.config.enabled=true;
 for(let i=0;i<30;i++){const v=incoming(i%2?RED:BLUE,{id:'SYNTHETIC_HTTP_NEXT_TICK_'+String(i).padStart(4,'0'),at:AT+1000+i});f.store.enqueue({id:v.event.id,phone:PHONE,line:v.owner,fromMe:false,at:Date.parse(v.event.at),kind:'text',text:v.event.text,forwarded:false,quotedId:null});}
 assert.equal((await f.post('/event',incoming(RED,{id:'SYNTHETIC_HTTP_NEXT_TICK_LAST_0001',at:AT+2000}),WEBHOOK)).body.accepted,true);const calls=f.providerCalls.length;
 const reviews=()=>f.store.db.prepare("SELECT count(*) n FROM events WHERE state='COLLECTION_REPLY_REVIEW'").get().n;
 assert.equal(reviews(),0);t.mock.timers.tick(10000);for(let i=0;i<100&&reviews()<30;i++)await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(reviews(),30);assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE state='PENDING'").get().n,1);assert.equal(f.providerCalls.length,calls);assert.ok(f.store.db.prepare('SELECT 1 FROM meta WHERE key=?').get('verified-ingestion-drain-wake-v1'));
 t.mock.timers.tick(10000);for(let i=0;i<100&&reviews()<31;i++)await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(reviews(),31);assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE state='PENDING'").get().n,0);assert.equal(f.providerCalls.length,calls);assert.equal(f.financialCalls.length,0);assert.equal(f.sends,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM questions').get().n,0);
});
