import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {createBotServer as productionServer} from '../automation/service-bots/server.mjs';
import * as financial from '../automation/service-bots/maria-financial-reader.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const bindings=n=>Array.from({length:n},(_,i)=>({orderId:id(i+1),expectedClientId:id(1001+i)}));
const pins=financial.MARIA_FINANCIAL_APPROVED_SCOPES.map(p=>p.sha256);
const syntheticPins=[5,188].map(n=>sha(JSON.stringify(bindings(n))));
const readerUrl=new URL('../automation/service-bots/maria-financial-reader.mjs',import.meta.url),serverUrl=new URL('../automation/service-bots/server.mjs',import.meta.url);
const readerSource=readFileSync(readerUrl,'utf8'),serverSource=readFileSync(serverUrl,'utf8');
let syntheticReader=readerSource;
for(let i=0;i<2;i++){assert.equal(syntheticReader.split(pins[i]).length-1,1);syntheticReader=syntheticReader.replace(pins[i],syntheticPins[i]);}
assert.equal(syntheticReader.replace(syntheticPins[0],pins[0]).replace(syntheticPins[1],pins[1]),readerSource);
const temp=mkdtempSync(join(tmpdir(),'maria-financial-server-concurrency-')),readerFile=join(temp,'reader.mjs'),serverFile=join(temp,'server.mjs');
writeFileSync(readerFile,syntheticReader);
const relocations=[];
const relocatedServer=serverSource.replace(/from '([^']+)'/g,(original,spec)=>{
 if(!spec.startsWith('.'))return original;
 const target=spec==='./maria-financial-reader.mjs'?pathToFileURL(readerFile).href:new URL(spec,serverUrl).href;
 const replacement="from '"+target+"'";relocations.push([original,replacement]);return replacement;
});
let reversed=relocatedServer;for(const[a,b]of relocations)reversed=reversed.replace(b,a);assert.equal(reversed,serverSource);
writeFileSync(serverFile,relocatedServer);
const {createBotServer}=await import(pathToFileURL(serverFile).href);
after(()=>{assert.equal(readFileSync(readerUrl,'utf8'),readerSource);assert.equal(readFileSync(serverUrl,'utf8'),serverSource);const target=resolve(temp),prefix=resolve(tmpdir())+sep+'maria-financial-server-concurrency-';assert.ok(target.startsWith(prefix));rmSync(target,{recursive:true,force:true});});

const admin='a'.repeat(60),webhook='w'.repeat(60),token='f'.repeat(60),registration='r'.repeat(60);
const BLUE='573126944997',PHONE='573000008801';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const bounded=promise=>Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('SYNTHETIC_TEST_GATE_TIMEOUT')),3000);timer.unref?.();})]);
const presence=()=>({present:false,reference:null}),metadata=()=>({present:false,sourceRef:null,entries:[],contentReturned:false});
function snapshot(b,at){return {orderId:b.orderId,clientId:b.expectedClientId,financialFingerprint:sha('finance:'+b.orderId),bindingFingerprint:sha('binding:'+b.orderId),sourceConflicts:[],reconciliationRequired:true,order:{reference:presence(),shortOrderId:b.orderId.slice(0,8).toUpperCase(),createdAt:at,updatedAt:at,deletedAt:null,state:'TECNICO_FINALIZO',visitType:'NUEVO',visitAt:at,technicianId:null,parentOrderId:null,quotedCop:'140000',recordedPaidCop:'0',paymentState:'PENDIENTE',basePaymentMethods:[],paymentMethodId:null,paymentMethod:null,bankId:null,bankNameRef:null,paymentAt:null,paymentReference:presence(),liquidatedAt:null,liquidatedById:null,invoice:presence(),electronicInvoice:presence(),paymentBreakdown:metadata(),paymentSupports:metadata()},clientBinding:{id:b.expectedClientId,updatedAt:at,deletedAt:null},portfolio:null,reportedCash:null,technicianRemittance:null,followups:[],amountMeaning:'Separate recorded financial sources; neither quoted-minus-paid nor technician remittance establishes collectible customer debt.',customerDebtVerified:false,bankReceiptVerified:false,serviceExecutionVerified:false,contractualDueDateVerified:false,collectionAuthorizedByThisRead:false};}
async function fixture(t,{realModule=false}={}){
 const at=Date.now(),scope=financial.MARIA_FINANCIAL_SCOPE;
 const f={backendCalls:0,engineCalls:0,providerCalls:0,financialEntered:deferred(),engineEntered:deferred(),aiEntered:deferred()};
 f.store=new Store(':memory:','fumigacion',randomBytes(32));
 f.config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:false,historyCheckRequired:false,inactivityFollowupEnabled:false,responseTargetMs:10000,activatedAt:at-3600000,authHash:sha(admin),webhookHash:sha(webhook),lines:[{phone:BLUE,instance:'cucaracha-azul'},{phone:'573126938721',instance:'cucaracha-roja'}],mariaProgram:{enabled:true,token:registration,actorId:scope.actorId,tenantId:scope.tenantId,companyId:scope.companyId,startsAt:at-3600000,expiresAt:Math.min(at+86400000,Date.parse(financial.MARIA_FINANCIAL_MAX_EXPIRY))}};
 f.body={...scope,username:'maria.angel.bot',guard:financial.MARIA_FINANCIAL_READER_GUARD,url:financial.MARIA_FINANCIAL_READER_URL,token,startsAt:new Date(at-1000).toISOString(),expiresAt:new Date(Math.min(at+3600000,f.config.mariaProgram.expiresAt)).toISOString(),controlledCohortSha256:financial.MARIA_FINANCIAL_COHORT_SHA256,initialOrderBindings:bindings(5),authorizationReference:financial.MARIA_FINANCIAL_AUTHORIZATION,nonce:'u'.repeat(60)};
 const fetcher=async(target,options)=>{
  if(target==='https://api.openai.com/v1/responses'){
   f.aiEntered.resolve();if(f.aiGate)await f.aiGate.promise;
   return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'{"choice":0}'}]}],usage:{input_tokens:5,output_tokens:2}})};
  }
  assert.equal(target,financial.MARIA_FINANCIAL_READER_URL+'/snapshots');assert.equal(options.headers.Authorization,'Bearer '+token);f.backendCalls++;f.financialEntered.resolve();if(f.financialGate)await f.financialGate.promise;
  const now=Date.now(),iso=new Date(now).toISOString(),body=JSON.parse(options.body);
  return new Response(JSON.stringify({guard:financial.MARIA_FINANCIAL_READER_GUARD,schemaVersion:financial.MARIA_FINANCIAL_SCHEMA,company:scope.company,tenantId:scope.tenantId,companyId:scope.companyId,advisorMembershipId:scope.actorId,readOnly:true,cohortSha256:financial.MARIA_FINANCIAL_COHORT_SHA256,allowlistHash:syntheticPins[0],financialReadStartedAt:iso,checkedAt:iso,validUntil:new Date(now+30000).toISOString(),coverage:{completeForRequestedBindings:true,requestedOrders:body.orders.length,initialFiveOnly:true,configuredBoundOrders:5,allCompanyPortfolioCovered:false,hardDeletesCovered:false,bankVerified:false,freeTextAndDocumentContentsReturned:false,financialSourcesAreNotDebtAuthorization:true},snapshots:body.orders.map(b=>snapshot(b,iso))}));
 };
 const engine={process:async e=>{f.engineCalls++;f.engineEntered.resolve();if(f.engineGate)await f.engineGate.promise;f.store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(e.id);}};
 const transport={fetcher,understand:async()=>({}),verifyLine:async()=>{},send:async()=>{f.providerCalls++;throw Error('NO_CUSTOMER_SEND_EXPECTED');}};
 f.server=(realModule?productionServer:createBotServer)(f.config,f.store,transport,engine);
 await new Promise(resolve=>f.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+f.server.address().port;
 f.post=async(route,body={})=>{const response=await fetch(base+route,{method:'POST',headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(4000)});return{status:response.status,body:await response.json()};};
 f.event=(suffix='1')=>{const e={id:'SYNTHETIC_DRAIN_EVENT_'+suffix,phone:PHONE,line:BLUE,at:Date.now(),kind:'text',text:'Hola',fromMe:false};f.store.enqueue(e);return e;};
 t.after(async()=>{f.engineGate?.resolve();f.financialGate?.resolve();f.aiGate?.resolve();f.server.closeAllConnections();await new Promise(resolve=>f.server.close(resolve));f.store.close();});
 return f;
}
const profileCount=f=>f.store.db.prepare('SELECT count(*) n FROM meta WHERE key=?').get(financial.MARIA_FINANCIAL_META_KEY).n;
const nonceCount=f=>f.store.db.prepare("SELECT count(*) n FROM meta WHERE key LIKE 'maria-financial-reader-setup-nonce:%'").get().n;

test('invalid financial scope during a real in-flight drain reaches validation, not unrelated BUSY',async t=>{
 const f=await fixture(t,{realModule:true});f.engineGate=deferred();const e=f.event(),running=f.post('/drain');await bounded(f.engineEntered.promise);
 const before=JSON.stringify(f.config.mariaProgram),result=await f.post('/financial-reader-setup',{...f.body,tenantId:id(999)});
 f.engineGate.resolve();const completed=await running;
 assert.equal(result.status,409);assert.equal(result.body.error,'OWN_FINANCIAL_READER_SETUP_NOT_APPLIED');assert.equal(f.backendCalls,0);assert.equal(profileCount(f),0);assert.equal(nonceCount(f),0);assert.equal(JSON.stringify(f.config.mariaProgram),before);
 assert.equal(completed.body.processed,1);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'DONE');assert.equal(f.providerCalls,0);
});
test('valid independent financial install can finish while customer drain is waiting, without changing parent or sending',async t=>{
 const f=await fixture(t);f.engineGate=deferred();f.event();const running=f.post('/drain');await bounded(f.engineEntered.promise);const parent=JSON.stringify(f.config.mariaProgram);
 const installed=await f.post('/financial-reader-setup',f.body);assert.equal(installed.status,200);assert.equal(installed.body.configured,true);assert.equal(installed.body.financialWritesEnabled,false);assert.equal(f.backendCalls,1);assert.equal(profileCount(f),1);assert.equal(nonceCount(f),1);assert.equal(JSON.stringify(f.config.mariaProgram),parent);assert.equal(f.providerCalls,0);
 assert.equal((await f.post('/drain')).body.busy,true);f.engineGate.resolve();assert.equal((await running).body.processed,1);
});
test('financial setup waiting on backend does not pause a new customer drain',async t=>{
 const f=await fixture(t);f.financialGate=deferred();const pending=f.post('/financial-reader-setup',f.body);await bounded(f.financialEntered.promise);
 const e=f.event();const drained=await f.post('/drain');assert.equal(drained.status,200);assert.equal(drained.body.busy,undefined);assert.equal(drained.body.processed,1);assert.equal(f.engineCalls,1);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'DONE');assert.equal(profileCount(f),0);assert.equal(nonceCount(f),0);
 f.financialGate.resolve();assert.equal((await pending).status,200);assert.equal(f.providerCalls,0);
});
test('two concurrent financial installs still allow one backend check and one committed nonce',async t=>{
 const f=await fixture(t);f.financialGate=deferred();const first=f.post('/financial-reader-setup',f.body);await bounded(f.financialEntered.promise);
 const second=await f.post('/financial-reader-setup',{...f.body,nonce:'v'.repeat(60)});assert.equal(second.status,409);assert.equal(second.body.error,'OWN_FINANCIAL_READER_SETUP_BUSY');assert.equal(f.backendCalls,1);assert.equal(profileCount(f),0);assert.equal(nonceCount(f),0);
 f.financialGate.resolve();assert.equal((await first).status,200);assert.equal(profileCount(f),1);assert.equal(nonceCount(f),1);assert.equal(f.providerCalls,0);
});
test('existing parent or AI setup flag continues to block financial setup and customer drain',async t=>{
 const f=await fixture(t);f.aiGate=deferred();const env={BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_OPENAI_API_KEY:'sk-proj-'+'SyntheticOwnCredential'.repeat(3),BOT_AI_MODEL:'gpt-6-luna',BOT_AI_MONTHLY_CALL_LIMIT:'1000',BOT_AI_ENABLED_FROM:new Date(Date.now()+60000).toISOString(),BOT_OPENAI_PROJECT_ID:'proj_synthetic_finance_mutex'};
 const pending=f.post('/ai-setup',env);await bounded(f.aiEntered.promise);
 const blocked=await f.post('/financial-reader-setup',f.body);assert.equal(blocked.status,409);assert.equal(blocked.body.error,'OWN_FINANCIAL_READER_SETUP_BUSY');assert.equal((await f.post('/drain')).body.busy,true);assert.equal(f.backendCalls,0);assert.equal(profileCount(f),0);assert.equal(nonceCount(f),0);
 f.aiGate.resolve();assert.equal((await pending).status,200);assert.equal(f.providerCalls,0);
});
test('parent changes while financial verification awaits fail closed and release only financial mutex',async t=>{
 const f=await fixture(t);f.financialGate=deferred();const pending=f.post('/financial-reader-setup',f.body);await bounded(f.financialEntered.promise);f.config.mariaProgram.enabled=false;f.financialGate.resolve();const result=await pending;
 assert.equal(result.status,409);assert.equal(result.body.error,'OWN_FINANCIAL_READER_SETUP_NOT_APPLIED');assert.equal(profileCount(f),0);assert.equal(nonceCount(f),0);assert.equal(f.config.mariaProgram.enabled,false);
 const invalid=await f.post('/financial-reader-setup',{...f.body,actorId:id(999)});assert.equal(invalid.body.error,'OWN_FINANCIAL_READER_SETUP_NOT_APPLIED');assert.equal((await f.post('/drain')).body.busy,undefined);assert.equal(f.providerCalls,0);
});
