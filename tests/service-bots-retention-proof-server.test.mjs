import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {Transport} from '../automation/service-bots/transport.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {planPreventiveRetention} from '../automation/service-bots/preventive-retention.mjs';
import {createRetentionDeliveryRuntime,retentionCycleKey,retentionOutboxId,retentionCaseId,RETENTION_SOURCE_GUARD,RETENTION_DELIVERY_PROOF_GUARD} from '../automation/service-bots/retention-delivery.mjs';

const tokens={admin:'a'.repeat(43),webhook:'w'.repeat(43),proof:'p'.repeat(43),registration:'r'.repeat(43),audit:'s'.repeat(43)};
const digest=value=>createHash('sha256').update(value).digest('hex');
const ACTOR='25b2e265-e463-4592-bab1-86b7b1687eae',CLIENT='7ccbbfe2-6a75-424e-8b23-dc40771507d7',ORDER='4a6d4007-04fa-4cab-89cb-2d9b39ba1c80',PHONE='573000001111';
const key=retentionCycleKey(PHONE,ORDER);
const grant=config=>({actorId:config.mariaProgram.actorId,token:tokens.proof,startsAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});

// This is a local, synthetic trusted reader used only to seed a durable cycle.
// createBotServer deliberately receives no eligibility reader, matching its
// production fail-closed configuration. No real network or native traffic occurs.
async function seedCycle(config,store,transport){
  const now=Date.now(),line=config.lines[0].phone,anchorAt=new Date(now-70*86400000).toISOString();
  const contact={phone:PHONE,identity:{kind:'PN',phone:PHONE,bindingVerified:true},contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true,optOutGlobal:false,doNotContact:false,humanHold:false,activeCase:false,pendingVisit:false,pendingQuotation:false,
    completedServices:[{company:'FUMIGACION',phone:PHONE,clientId:CLIENT,orderId:ORDER,sourceId:ORDER,completedAt:anchorAt,completedVerified:true,originLine:line,originLineVerified:true}],bookingInteractions:[],futureBookings:[],rejections:[]};
  const plannerInput={contacts:[contact],history:[],coverage:{whatsapp:{contactHistoryComplete:true,lines:config.lines.map(l=>({line:l.phone,complete:true,connected:true,suspended:false}))},program:{company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true}}};
  const plan=planPreventiveRetention({day:new Date(now-5*3600000).toISOString().slice(0,10),now,...plannerInput}),candidate=plan.prepared[0];assert.ok(candidate);
  store.db.prepare('INSERT INTO conversations(phone,line,revision,hold,body) VALUES(?,?,1,0,?)').run(PHONE,line,store.seal({caseId:retentionCaseId(key),slots:{},asked:[]}));
  store.queue(retentionOutboxId(key),PHONE,line,candidate.text,false,1,retentionCaseId(key));
  const runtime=createRetentionDeliveryRuntime(config,store,transport,{loadEligibility:async()=>({guard:RETENTION_SOURCE_GUARD,company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId:ACTOR,clientId:CLIENT,phone:PHONE,lastCompletedOrderId:ORDER,anchorAt,anchorKind:'COMPLETED_SERVICE',canonicalRecipientUniqueVerified:true,checkedAt:new Date().toISOString(),plannerInput})});
  await runtime.prepareCycle(plan,candidate);
  store.db.prepare("UPDATE outbox SET state='DELIVERED',mid='3EB0_HTTP_TEST_ONLY',updated=? WHERE id=?").run(Date.now(),retentionOutboxId(key));
}

async function withServer(run,{company='fumigacion',seed=false}={}){
  const now=Date.now(),config={company,...BUSINESSES[company],enabled:true,activatedAt:now-7200000,responseTargetMs:10000,authHash:digest(tokens.admin),webhookHash:digest(tokens.webhook),provider:'https://forbidden-real-network.invalid',
    lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'proof-server-'+i,apiKey:'test-only-key'})),mariaProgram:{enabled:true,actorId:ACTOR,token:tokens.registration,startsAt:now-3600000,expiresAt:now+86400000},programSupervision:{token:tokens.audit,actorId:ACTOR,startsAt:now-3600000,expiresAt:now+86400000}};
  const store=new Store(':memory:',company,randomBytes(32)),calls=[];
  const transport=new Transport(config,async(url,options)=>{calls.push({url,method:options?.method});throw Error('TEST_REAL_PROVIDER_TRAFFIC_FORBIDDEN');});
  if(seed)await seedCycle(config,store,transport);
  const server=createBotServer(config,store,transport,{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const post=async(path,body={},token=tokens.admin)=>{const r=await fetch(base+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});return {status:r.status,body:await r.json(),cacheControl:r.headers.get('cache-control')};};
  try{await run({config,store,calls,post});}finally{await new Promise(resolve=>server.close(resolve));store.close();}
}

test('HTTP proof is closed before its separate grant; admin, ingress and existing program secrets are insufficient',async()=>withServer(async({post,store,calls})=>{
  for(const token of [null,tokens.admin,tokens.webhook,tokens.proof,tokens.registration,tokens.audit]){const r=await post('/retention-delivery-proof',{company:'fumigacion',key},token);assert.equal(r.status,401);assert.deepEqual(r.body,{error:'UNAUTHORIZED'});}
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM retention_cycles').get().n,0);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(calls.length,0);
}));

test('HTTP setup requires admin and a separate proof grant cannot access admin or webhook routes',async()=>withServer(async({config,post,store,calls})=>{
  const body=grant(config);
  for(const token of [null,tokens.webhook,tokens.proof,tokens.registration,tokens.audit])assert.equal((await post('/retention-proof-setup',body,token)).status,401);
  const installed=await post('/retention-proof-setup',body);assert.equal(installed.status,200);assert.equal(installed.body.enabled,true);assert.equal(installed.body.readOnly,true);assert.equal(installed.body.customerMessagesEnabled,false);assert.equal(installed.body.customerNotesWritesEnabled,false);assert.equal(installed.cacheControl,'no-store, private');assert.doesNotMatch(JSON.stringify(installed.body),new RegExp(tokens.proof));
  for(const [path,b] of [['/status',{}],['/intake-audit',{company:'fumigacion',day:new Date(Date.now()-5*3600000).toISOString().slice(0,10)}],['/retention-proof-setup',body],['/webhook',{}]])assert.equal((await post(path,b,tokens.proof)).status,401,path);
  for(const token of [tokens.admin,tokens.webhook,tokens.registration,tokens.audit])assert.equal((await post('/retention-delivery-proof',{company:'fumigacion',key},token)).status,401);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(calls.length,0);
}));

test('HTTP setup rejects foreign actor, reused credentials, expired/future or expanded cutoff and extra authority fields',async()=>withServer(async({config,post,store,calls})=>{
  const body=grant(config),at=Date.now();
  const patches=[{actorId:'foreign-actor'},{startsAt:new Date(config.mariaProgram.startsAt-1).toISOString()},{expiresAt:new Date(config.mariaProgram.expiresAt+1).toISOString()},{startsAt:new Date(at+60000).toISOString()},{expiresAt:new Date(at-1).toISOString()},{startsAt:body.expiresAt},{operation:'write-notes'},...['admin','webhook','registration','audit'].map(role=>({token:tokens[role]}))];
  for(const patch of patches){const r=await post('/retention-proof-setup',{...body,...patch});assert.equal(r.status,409,JSON.stringify(Object.keys(patch)));assert.equal(r.body.error,'OWN_RETENTION_PROOF_SETUP_NOT_APPLIED');}
  assert.equal(config.retentionProofAccess,undefined);assert.equal(store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key='own-retention-proof-access'").get().n,0);assert.equal(calls.length,0);
}));

test('HTTP proof access stops at expiry and admin remains an independent role',async()=>withServer(async({config,post,calls})=>{
  assert.equal((await post('/retention-proof-setup',grant(config))).status,200);
  assert.equal((await post('/retention-delivery-proof',{company:'fumigacion',key},tokens.proof)).status,200);
  config.retentionProofAccess.expiresAt=Date.now()-1;
  assert.equal((await post('/retention-delivery-proof',{company:'fumigacion',key},tokens.proof)).status,401);
  const status=await post('/status');assert.equal(status.status,200);assert.equal(status.body.preventiveRetention.proofAccess.enabled,false);assert.equal(status.body.enabled,true);assert.equal(calls.length,0);
}));

test('HTTP proof rejects added delivery/eligibility/phone claims without touching the prepared cycle or ledger',async()=>withServer(async({config,post,store,calls})=>{
  assert.equal((await post('/retention-proof-setup',grant(config))).status,200);const before=store.db.prepare('SELECT COUNT(*) n FROM retention_delivery_ledger').get().n;
  for(const patch of [{delivery:'READ'},{native:{verified:true,delivery:'READ'}},{eligible:true},{wholeSourceEligibility:{complete:true}},{phone:PHONE},{clientId:CLIENT}]){const r=await post('/retention-delivery-proof',{company:'fumigacion',key,...patch},tokens.proof);assert.equal(r.status,200);assert.equal(r.body.eligible,false);assert.equal(r.body.reason,'RETENTION_PROOF_KEY_ONLY_REQUIRED');}
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM retention_delivery_ledger').get().n,before);assert.equal(store.db.prepare('SELECT state FROM retention_cycles').get().state,'PREPARED');assert.equal(calls.length,0);
},{seed:true}));

test('valid HTTP proof grant and durable delivered outbox remain pending without the complete eligibility adapter',async()=>withServer(async({config,post,store,calls})=>{
  assert.equal((await post('/retention-proof-setup',grant(config))).status,200);const original=store.db.prepare('SELECT * FROM outbox').get();
  const r=await post('/retention-delivery-proof',{company:'fumigacion',key},tokens.proof);assert.equal(r.status,200);assert.equal(r.body.guard,RETENTION_DELIVERY_PROOF_GUARD);assert.equal(r.body.eligible,false);assert.equal(r.body.pending,true);assert.equal(r.body.reason,'RETENTION_ELIGIBILITY_ADAPTER_REQUIRED');assert.equal(r.body.sends,0);assert.equal(r.body.programNotesWritten,0);assert.equal(r.body.cycleKey,key);assert.doesNotMatch(JSON.stringify(r.body),new RegExp(PHONE+'|'+CLIENT));
  assert.deepEqual(store.db.prepare('SELECT * FROM outbox').get(),original);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);assert.equal(store.db.prepare('SELECT state FROM retention_cycles').get().state,'PROOF_PENDING');assert.equal(calls.length,0);
  const status=await post('/status');assert.equal(status.status,200);assert.equal(status.body.enabled,true);const runtime=status.body.preventiveRetention.deliveryProof;assert.equal(runtime.eligibilityAdapterConnected,false);assert.equal(runtime.sendingEnabled,false);assert.equal(runtime.notesEnabled,false);assert.equal(runtime.automaticRetriesEnabled,false);
},{seed:true}));

test('technical HTTP runtime cannot install or use Fumigacion proof access',async()=>withServer(async({config,post,store,calls})=>{
  const setup=await post('/retention-proof-setup',grant(config));assert.equal(setup.status,403);assert.equal(setup.body.error,'OWN_FUMIGACION_RETENTION_REQUIRED');assert.equal((await post('/retention-delivery-proof',{company:'fumigacion',key},tokens.proof)).status,401);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(calls.length,0);
},{company:'servicio-tecnico'}));
