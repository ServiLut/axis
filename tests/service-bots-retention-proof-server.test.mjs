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
import {RETENTION_NOTE_URL,RETENTION_DISPATCH_GUARD} from '../automation/service-bots/retention-dispatch.mjs';

const tokens={admin:'a'.repeat(43),webhook:'w'.repeat(43),proof:'p'.repeat(43),registration:'r'.repeat(43),audit:'s'.repeat(43),note:'n'.repeat(43)};
const digest=value=>createHash('sha256').update(value).digest('hex');
const ACTOR='25b2e265-e463-4592-bab1-86b7b1687eae',CLIENT='7ccbbfe2-6a75-424e-8b23-dc40771507d7',ORDER='4a6d4007-04fa-4cab-89cb-2d9b39ba1c80',PHONE='573000001111';
const key=retentionCycleKey(PHONE,ORDER);
const grant=config=>({actorId:config.mariaProgram.actorId,token:tokens.proof,startsAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});
const noteGrant=config=>({...grant(config),url:RETENTION_NOTE_URL,token:tokens.note});
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Bogota'});
const operations=['/preventive-retention-prepare','/preventive-retention-dispatch','/preventive-retention-notes'];

// This is a local, synthetic trusted reader used only to seed a durable cycle.
// createBotServer connects its own readers, whose program access and history
// remain unverified in this fixture. No real network or native traffic occurs.
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

test('valid HTTP proof grant and durable delivered outbox remain pending with connected readers and unverified own access',async()=>withServer(async({config,post,store,calls})=>{
  assert.equal((await post('/retention-proof-setup',grant(config))).status,200);const original=store.db.prepare('SELECT * FROM outbox').get();
  const r=await post('/retention-delivery-proof',{company:'fumigacion',key},tokens.proof);assert.equal(r.status,200);assert.equal(r.body.guard,RETENTION_DELIVERY_PROOF_GUARD);assert.equal(r.body.eligible,false);assert.equal(r.body.pending,true);assert.equal(r.body.reason,'RETENTION_SEPARATE_PROGRAM_READ_ACCESS_REQUIRED');assert.equal(r.body.sends,0);assert.equal(r.body.programNotesWritten,0);assert.equal(r.body.cycleKey,key);assert.doesNotMatch(JSON.stringify(r.body),new RegExp(PHONE+'|'+CLIENT));
  assert.deepEqual(store.db.prepare('SELECT * FROM outbox').get(),original);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);assert.equal(store.db.prepare('SELECT state FROM retention_cycles').get().state,'PROOF_PENDING');assert.equal(calls.length,0);
  const status=await post('/status');assert.equal(status.status,200);assert.equal(status.body.enabled,true);const runtime=status.body.preventiveRetention.deliveryProof;assert.equal(runtime.eligibilityAdapterConnected,true);assert.equal(runtime.sendingEnabled,false);assert.equal(runtime.notesEnabled,false);assert.equal(runtime.automaticRetriesEnabled,false);assert.equal(status.body.preventiveRetention.eligibilityAdapter.connected,true);assert.equal(status.body.preventiveRetention.eligibilityAdapter.bothLinesHistoryComplete,false);assert.equal(status.body.preventiveRetention.eligibilityAdapter.programReadAccessConnected,false);
},{seed:true}));

test('technical HTTP runtime cannot install or use Fumigacion proof access',async()=>withServer(async({config,post,store,calls})=>{
  const setup=await post('/retention-proof-setup',grant(config));assert.equal(setup.status,403);assert.equal(setup.body.error,'OWN_FUMIGACION_RETENTION_REQUIRED');assert.equal((await post('/retention-delivery-proof',{company:'fumigacion',key},tokens.proof)).status,401);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(calls.length,0);
},{company:'servicio-tecnico'}));

test('preventive HTTP operations and note setup require admin; active proof and note grants never become an admin role',async()=>withServer(async({config,post,store,calls})=>{
  assert.equal((await post('/retention-proof-setup',grant(config))).status,200);assert.equal((await post('/retention-note-setup',noteGrant(config))).status,200);
  for(const path of operations)for(const token of [null,tokens.webhook,tokens.proof,tokens.registration,tokens.audit,tokens.note])assert.equal((await post(path,{company:'fumigacion',day:today()},token)).status,401,path);
  for(const token of [null,tokens.webhook,tokens.proof,tokens.registration,tokens.audit,tokens.note])assert.equal((await post('/retention-note-setup',noteGrant(config),token)).status,401);
  assert.equal((await post('/retention-delivery-proof',{company:'fumigacion',key},tokens.note)).status,401);assert.equal((await post('/status',{},tokens.note)).status,401);assert.equal((await post('/webhook',{},tokens.note)).status,401);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(calls.length,0);
}));

test('preventive HTTP dispatcher and notes remain OFF even after valid access setup; prepare does not certify missing history',async()=>withServer(async({config,post,store,calls})=>{
  const setup=await post('/retention-note-setup',noteGrant(config));assert.equal(setup.status,200);assert.equal(setup.body.configured,true);assert.equal(setup.body.enabled,true);assert.equal(setup.body.keyOnly,true);assert.equal(setup.cacheControl,'no-store, private');assert.doesNotMatch(JSON.stringify(setup.body),new RegExp(tokens.note));
  const body={company:'fumigacion',day:today()},before=store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
  for(const [path,reason] of [['/preventive-retention-dispatch','RETENTION_DISPATCH_DISABLED'],['/preventive-retention-notes','RETENTION_NOTE_DISABLED']]){const r=await post(path,body);assert.equal(r.status,200);assert.equal(r.body.pending,true);assert.equal(r.body.reason,reason);assert.equal(r.body.sends,0);assert.equal(r.body.programNotesWritten,0);assert.equal(r.cacheControl,'no-store, private');}
  const prepared=await post('/preventive-retention-prepare',body);assert.equal(prepared.status,409);assert.deepEqual(prepared.body,{error:'OWN_RETENTION_OPERATION_NOT_VERIFIED'});
  const status=await post('/status');assert.equal(status.status,200);assert.equal(status.body.enabled,true);assert.equal(status.body.fullyAutonomous,false);const p=status.body.preventiveRetention,d=p.dispatch;assert.equal(d.guard,RETENTION_DISPATCH_GUARD);assert.equal(d.activationRequested,false);assert.equal(d.defaultOff,true);assert.equal(d.autonomousEnabled,false);assert.equal(d.sendingEnabled,false);assert.equal(d.notesEnabled,false);assert.equal(d.automaticRetriesEnabled,false);assert.equal(d.generalOutboxSendingEnabled,false);assert.equal(d.eligibilityAdapterConnected,true);assert.equal(d.planAdapterConnected,true);assert.equal(d.noteAccess.configured,true);assert.equal(p.eligibilityAdapter.bothLinesHistoryComplete,false);assert.equal(p.sendsEnabled,false);assert.equal(p.notesEnabled,false);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,before);assert.equal(calls.length,0);
}));

test('preventive HTTP bodies reject externally supplied plans, identity, delivery facts and activation flags without mutating queues',async()=>withServer(async({post,store,calls})=>{
  const before=store.db.prepare('SELECT COUNT(*) n FROM meta').get().n;
  for(const patch of [{enabled:true},{activationRequested:true},{phone:PHONE},{cycleKey:key},{plan:{prepared:[{phone:PHONE}]}},{eligible:true},{native:{verified:true,delivery:'READ'}},{wholeSourceEligibility:{complete:true}},{actorId:ACTOR}])for(const path of operations){const r=await post(path,{company:'fumigacion',day:today(),...patch});assert.equal(r.status,409,path);assert.equal(r.body.error,'OWN_RETENTION_OPERATION_NOT_VERIFIED');}
  for(const path of operations)assert.equal((await post(path,{company:'servicio-tecnico',day:today()})).status,409);
  const status=await post('/status');assert.equal(status.body.preventiveRetention.dispatch.activationRequested,false);assert.equal(status.body.preventiveRetention.dispatch.defaultOff,true);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM meta').get().n,before);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM retention_dispatch').get().n,0);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM retention_cycles').get().n,0);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(calls.length,0);
}));

test('HTTP note setup enforces independent token, own actor, fixed endpoint and original expiry without activating outreach',async()=>withServer(async({config,post,store,calls})=>{
  assert.equal((await post('/retention-proof-setup',grant(config))).status,200);const body=noteGrant(config),now=Date.now();
  const patches=[{actorId:'foreign'},{url:RETENTION_NOTE_URL+'/other'},{startsAt:new Date(config.mariaProgram.startsAt-1).toISOString()},{startsAt:new Date(now+60000).toISOString()},{expiresAt:new Date(now-1).toISOString()},{expiresAt:new Date(config.mariaProgram.expiresAt+1).toISOString()},{enabled:true},{tenantId:MARIA_TENANT},...['admin','webhook','registration','audit','proof'].map(role=>({token:tokens[role]}))];
  for(const patch of patches){const r=await post('/retention-note-setup',{...body,...patch});assert.equal(r.status,409);assert.equal(r.body.error,'OWN_RETENTION_NOTE_SETUP_NOT_APPLIED');}assert.equal(config.retentionNoteAccess,undefined);assert.equal(store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key='own-retention-note-access'").get().n,0);
  assert.equal((await post('/retention-note-setup',body)).status,200);assert.equal((await post('/retention-proof-setup',{...grant(config),token:tokens.note})).status,409);const raw=store.db.prepare("SELECT value FROM meta WHERE key='own-retention-note-access'").get().value;assert.doesNotMatch(raw,new RegExp(tokens.note));assert.equal(store.open(raw).actorId,ACTOR);
  config.retentionNoteAccess.expiresAt=Date.now()-1;const status=await post('/status');assert.equal(status.body.preventiveRetention.dispatch.noteAccess.enabled,false);assert.equal(status.body.preventiveRetention.dispatch.sendingEnabled,false);assert.equal(status.body.preventiveRetention.dispatch.notesEnabled,false);assert.equal(status.body.enabled,true);assert.equal(calls.length,0);
}));

test('technical HTTP runtime forbids every preventive operation and note setup even with its own admin role',async()=>withServer(async({config,post,store,calls})=>{
  for(const path of [...operations,'/retention-note-setup']){const r=await post(path,path==='/retention-note-setup'?noteGrant(config):{company:'fumigacion',day:today()});assert.equal(r.status,403,path);assert.equal(r.body.error,'OWN_FUMIGACION_RETENTION_REQUIRED');}
  const status=await post('/status');assert.equal(status.status,200);assert.equal(status.body.preventiveRetention,null);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key='own-retention-note-access'").get().n,0);assert.equal(calls.length,0);
},{company:'servicio-tecnico'}));
