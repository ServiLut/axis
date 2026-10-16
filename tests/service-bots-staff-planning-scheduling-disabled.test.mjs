// Synthetic configuration and SQLite :memory: only; no native/Backend calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {MARIA_SCHEDULING_URL,installOwnSchedulingAccess,restoreOwnSchedulingAccess,ownSchedulingEnabled,ownSchedulingAccessStatus,ownSchedulingProofAuthorized} from '../automation/service-bots/maria-scheduling-access.mjs';
import {MARIA_OWN_SCHEDULING_GUARD,prepareOwnSchedulingPlan,ownSchedulingPlan,continueOwnSchedulingOffer,ownSchedulingCustomerTurn,ownSchedulingProof,ownSchedulingReplyStillValid,drainOwnScheduling,ownSchedulingStatus} from '../automation/service-bots/maria-own-order-scheduling.mjs';
const now=Date.parse('2026-10-16T23:30:00.000Z'),actor='7508385b-536e-4aa2-8137-d734dfc900ef',mode='internal-staff-assignment',phone='573000006789',line='573126944997';
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){
 t.mock.timers.enable({apis:['Date'],now});
 const c={company:'fumigacion',enabled:true,activatedAt:now-7200000,authHash:sha('a'.repeat(43)),webhookHash:sha('w'.repeat(43)),mariaProgram:{enabled:true,actorId:actor,token:'r'.repeat(43),startsAt:now-3600000,expiresAt:now+86400000}},s=new Store(':memory:','fumigacion',randomBytes(32));
 const body={actorId:actor,url:MARIA_SCHEDULING_URL,token:'x'.repeat(43),proofToken:'y'.repeat(43),startsAt:now-1800000,expiresAt:c.mariaProgram.expiresAt};
 installOwnSchedulingAccess(c,s,body,now);
 const put=(key,value)=>s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,s.seal(value));
 const snapshot=()=>({meta:s.db.prepare('SELECT * FROM meta ORDER BY key').all(),outbox:s.db.prepare('SELECT * FROM outbox ORDER BY rowid').all(),events:s.db.prepare('SELECT * FROM events ORDER BY rowid').all(),conversations:s.db.prepare('SELECT * FROM conversations ORDER BY phone').all()});
 const activate=()=>{c.staffPlanning={enabled:true,mode,startsAt:now};};
 return {c,s,body,put,snapshot,activate};
}

test('an active staff-assignment workflow disables scheduling and its proof while preserving the configured finite access',t=>{
 const f=fixture(t);try{
  assert.equal(ownSchedulingEnabled(f.c,now),true);assert.equal(ownSchedulingProofAuthorized(f.c,'Bearer '+f.body.proofToken,now),true);const before=f.snapshot(),access=structuredClone(f.c.ownOrderScheduling);f.activate();
  const status=ownSchedulingAccessStatus(f.c,now);assert.equal(status.configured,true);assert.equal(status.enabled,false);assert.equal(status.actorId,actor);assert.equal(status.startsAt,new Date(f.body.startsAt).toISOString());assert.equal(status.expiresAt,new Date(f.body.expiresAt).toISOString());assert.equal(status.otherOrdersEnabled,false);assert.equal(status.reprogrammingEnabled,false);assert.equal(status.paymentsEnabled,false);assert.equal(ownSchedulingProofAuthorized(f.c,'Bearer '+f.body.proofToken,now),false);assert.deepEqual(f.c.ownOrderScheduling,access);assert.deepEqual(f.snapshot(),before);assert.doesNotMatch(JSON.stringify(status),/x{43}|y{43}/);
 }finally{f.s.close();}
});

test('the restriction begins exactly at the valid profile cutoff, including cases anchored before it',t=>{
 const f=fixture(t);try{f.c.staffPlanning={enabled:true,mode,startsAt:now+5000};assert.equal(ownSchedulingEnabled(f.c,now+4999),true);assert.equal(ownSchedulingAccessStatus(f.c,now+5000).enabled,false);assert.equal(ownSchedulingEnabled(f.c,now+6000),false);assert.equal(ownSchedulingEnabled(f.c,NaN),false);assert.equal(ownSchedulingEnabled(f.c,'2026-10-16T23:30:00Z'),false);}finally{f.s.close();}
});

for(const profile of [undefined,{enabled:false,mode,startsAt:now},{enabled:true,mode:'other-mode',startsAt:now},{enabled:true,mode,startsAt:'not-a-timestamp'}])test('default and inactive staff profiles preserve the historical scheduling gate: '+JSON.stringify(profile),t=>{
 const f=fixture(t);try{f.c.staffPlanning=profile;assert.equal(ownSchedulingEnabled(f.c,now),true);assert.equal(ownSchedulingAccessStatus(f.c,now).configured,true);assert.equal(ownSchedulingProofAuthorized(f.c,'Bearer '+f.body.proofToken,now),true);}finally{f.s.close();}
});

test('restoring existing credentials during staff planning keeps them configured without authorizing scheduling',t=>{
 const f=fixture(t);try{f.activate();const before=f.snapshot(),restored={...f.c,ownOrderScheduling:undefined};restoreOwnSchedulingAccess(restored,f.s);assert.deepEqual(restored.ownOrderScheduling,f.c.ownOrderScheduling);assert.equal(ownSchedulingAccessStatus(restored,now).configured,true);assert.equal(ownSchedulingAccessStatus(restored,now).enabled,false);assert.equal(ownSchedulingProofAuthorized(restored,'Bearer '+f.body.proofToken,now),false);assert.deepEqual(f.snapshot(),before);}finally{f.s.close();}
});

test('old offered, pending, uncertain, saved and review records remain unchanged and all scheduling entry points make zero calls',async t=>{
 const f=fixture(t);try{
  const plan={guard:MARIA_OWN_SCHEDULING_GUARD,questionId:'LEGACY_QUESTION',caseId:'fumigacion:LEGACY_CASE',phone,line,actorId:actor,registrationAcceptanceId:'LEGACY_ACCEPTANCE',registrationRequestHash:'a'.repeat(64),orderId:'85c47fc8-5314-4f68-a8d6-dde112640f5d',createdAt:now-3600000,registrationCreatedAt:new Date(now-3600000).toISOString()};
  f.put('maria-own-scheduling-plan:'+plan.questionId,plan);
  for(const [i,status] of ['OFFERED','PENDING','SENDING','UNCERTAIN','SAVED','REVIEW'].entries()){
   const schedulingKey='7508385b-536e-4aa2-8137-'+String(i).padStart(12,'0');f.put('maria-own-scheduling:'+schedulingKey,{guard:MARIA_OWN_SCHEDULING_GUARD,schedulingKey,status,plan,slot:{technicianName:'Técnico Sintético',dateBogota:'2026-10-17',startLocal:'09:00',endLocal:'10:00'},confirmation:{id:'LEGACY_CONFIRMATION',text:'Confirmo',at:now-3600000},receipt:status==='SAVED'?{persisted:true,committed:{state:'PROGRAMADO'}}:null});
  }
  f.put('maria-registration:'+plan.caseId,{status:'SAVED',requestHash:plan.registrationRequestHash,receipt:{orderId:plan.orderId,state:'NUEVO',scheduled:false}});
  const before=f.snapshot();f.activate();let calls=0;const forbidden=async()=>{calls++;throw Error('NO_NATIVE_OR_BACKEND_CALLS');},transport={fetcher:forbidden,request:forbidden,verifyLine:forbidden,currentAttention:forbidden,currentCustomerActivity:forbidden};
  const request={caseId:plan.caseId,phone,line,topic:'disponibilidad-y-tecnico'},created={created:true,id:plan.questionId,outboxId:'tesa-question:'+plan.questionId};
  assert.equal(prepareOwnSchedulingPlan(f.s,f.c,request,created),false);assert.equal(ownSchedulingPlan(f.s,f.c,plan.questionId),null);assert.deepEqual(await continueOwnSchedulingOffer(f.s,f.c,transport,{questionId:plan.questionId},{verifyRegistered:forbidden}),{prepared:false,queued:false});
  const key='7508385b-536e-4aa2-8137-000000000000',state={caseId:plan.caseId,pendingOwnScheduling:{schedulingKey:key}},event={id:'NEW_CONFIRMATION',phone,line,text:'Confirmo',at:now,kind:'text',fromMe:false,forwarded:false};
  assert.equal(ownSchedulingCustomerTurn(f.s,f.c,state,event),null);await assert.rejects(ownSchedulingProof(f.s,f.c,transport,{company:'fumigacion',schedulingKey:key},{verifyRegistered:forbidden}),/OWN_SCHEDULING_PROOF_SCOPE_REQUIRED/);assert.equal(await ownSchedulingReplyStillValid(f.s,f.c,transport,{id:'maria-schedule-saved:'+key,phone,line,case_id:plan.caseId},{verifyRegistered:forbidden}),false);
  assert.deepEqual(await drainOwnScheduling(f.s,f.c,transport,{verifyProof:forbidden}),{enabled:false,processed:0});const status=ownSchedulingStatus(f.s,f.c);assert.equal(status.configured,true);assert.equal(status.enabled,false);assert.deepEqual(status.states,{OFFERED:1,PENDING:1,SENDING:1,UNCERTAIN:1,SAVED:1,REVIEW:1});assert.equal(calls,0);assert.deepEqual(f.snapshot(),before);assert.deepEqual(state,{caseId:plan.caseId,pendingOwnScheduling:{schedulingKey:key}});
 }finally{f.s.close();}
});
