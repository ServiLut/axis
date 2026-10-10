import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {MARIA_COMPANY,MARIA_TENANT,MARIA_PROGRAM_URL} from '../automation/service-bots/maria-program.mjs';
import {INTAKE_JOURNAL_GUARD,initializeIntakeJournal} from '../automation/service-bots/intake-journal.mjs';
import {BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';
import {planPreventiveRetention} from '../automation/service-bots/preventive-retention.mjs';
import {retentionCycleKey,retentionOutboxId,retentionCaseId,createRetentionDeliveryRuntime} from '../automation/service-bots/retention-delivery.mjs';
import {createRetentionDispatchRuntime} from '../automation/service-bots/retention-dispatch.mjs';
import {createRetentionEligibilityAdapter,readOwnRetentionNativeHistory,readOwnRetentionProgramContactHistory,RETENTION_NATIVE_HISTORY_GUARD} from '../automation/service-bots/retention-eligibility.mjs';

const P='573000001111',OTHER='573000002222',BLUE='573126944997',RED='573126938721';
const CLIENT='7ccbbfe2-6a75-424e-8b23-dc40771507d7',ORDER='4a6d4007-04fa-4cab-89cb-2d9b39ba1c80',ACTOR='25b2e265-e463-4592-bab1-86b7b1687eae';
const PG='own-fumigacion-daily-readonly-program-snapshot-v1',DAY=86400000;
const day=t=>new Date(t).toLocaleDateString('sv-SE',{timeZone:'America/Bogota'});
const iso=t=>new Date(t).toISOString();
function fixture(){
 const at=Date.now(),f={at,calls:{pages:0,program:0,journal:0,native:0}};
 f.config={company:'fumigacion',name:'FUMIGACION',enabled:true,activatedAt:at-100*DAY,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i,apiKey:'dummy-local-api-key'})),mariaProgram:{enabled:true,token:'r'.repeat(43),actorId:ACTOR,startsAt:at-DAY,expiresAt:at+DAY},programSupervision:{actorId:ACTOR,token:'a'.repeat(43),url:MARIA_PROGRAM_URL+'/operational-audit',startsAt:at-1000,expiresAt:at+3600000}};
 f.store=new Store(':memory:','fumigacion',randomBytes(32));
 const scope={guard:PG,company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:ACTOR,readOnly:true,checkedAt:iso(at)};
 f.order={id:ORDER,clientId:CLIENT,createdAt:iso(at-80*DAY),state:'LIQUIDADO',scheduledAt:iso(at-70*DAY-3600000),actualStartedAt:iso(at-70*DAY-3600000),actualFinishedAt:iso(at-70*DAY),deletedAt:null,canonicalContacts:[P],contactScopeVerified:true};
 f.page={...scope,asOfDay:day(at),customers:[{clientId:CLIENT,canonicalContacts:[P],contactScopeVerified:true,name:{nombre:'Camila',apellido:null,literalComplete:true},lastCompletedOrder:{orderId:ORDER,actualFinishedAt:f.order.actualFinishedAt}}],page:{cursor:null,nextCursor:null,hasMore:false}};
 f.program={...scope,searchedContacts:[{phone:P,complete:true,identityAmbiguous:false,clientIds:[CLIENT],orderIds:[ORDER]}],orders:[f.order],coverage:{contactSearchComplete:true,noncanonicalPhoneFieldsCovered:true,integrityConflicts:false}};
 f.source={sourceId:'OWN_ORDER_SOURCE',phone:P,line:BLUE,at:at-70*DAY-7200000,fromMe:false,nativeBindingVerified:true,forwarded:false,literalText:'Gracias',media:false,deleted:false,interpretation:{verified:true,sourceId:'OWN_ORDER_SOURCE',phone:P,line:BLUE,literalText:'Gracias',kind:'neutral'}};
 f.native={guard:RETENTION_NATIVE_HISTORY_GUARD,company:'fumigacion',phone:P,checkedAt:iso(at),readOnly:true,sources:[f.source],lines:f.config.lines.map(l=>({line:l.phone,instance:l.instance,ownerVerified:true,complete:true,connected:true,suspended:false})),coverage:{bothLinesHistoryComplete:true,providerSyncProven:true,semanticReviewComplete:true,globalNoContactStatusComplete:true,originalMediaReviewComplete:true},globalStatus:{optOutGlobal:false,doNotContact:false},originalLine:BLUE,originalLineVerified:true,origin:{verified:true,sourceId:f.source.sourceId,orderId:ORDER,phone:P,line:BLUE}};
 f.journal={guard:INTAKE_JOURNAL_GUARD,company:'fumigacion',readOnly:true,checkedAt:iso(at),installedFrom:at-100*DAY,historicalCoverageComplete:true,allWhatsAppTrafficComplete:true};
 f.transport={config:f.config,fetcher:()=>{throw Error('no real traffic');}};
 f.options={now:()=>f.at,readProgramCandidatePage:async(c,fetcher,body)=>{f.calls.pages++;return f.page;},readProgramContactHistory:async()=>{f.calls.program++;return f.program;},readJournalCoverage:async(c,s,range)=>{f.calls.journal++;return {...f.journal,...range};},readNativeHistory:async(c,t,range)=>{f.calls.native++;return {...f.native,from:range.from,to:range.to};}};
 f.request={company:'fumigacion',phone:P,lastCompletedOrderId:ORDER,cycleKey:retentionCycleKey(P,ORDER),now:at};
 f.adapter=()=>createRetentionEligibilityAdapter(f.config,f.store,f.transport,f.options);
 f.load=()=>f.adapter().loadEligibility(f.request);
 return f;
}
function diagnostic(source,f){return planPreventiveRetention({day:day(f.at),now:f.at,...source.plannerInput});}
async function stageOwn(f){
 const adapter=f.adapter(),dispatch=createRetentionDispatchRuntime(f.config,f.store,f.transport,{loadPlan:adapter.loadPlan,loadEligibility:adapter.loadEligibility,now:()=>f.at});
 const result=await dispatch.prepare({company:'fumigacion',day:day(f.at),cursor:null});assert.equal(result.prepared,1);
 return {adapter,dispatch};
}

test('trusted own readers build the existing delivery contract without sending or business changes',async()=>{
 const f=fixture();try{
  const a=f.adapter();assert.equal(a.status().connected,true);assert.equal(a.status().bothLinesHistoryComplete,false);
  const r=await a.loadEligibility(f.request);assert.equal(r.pending,false);assert.equal(r.canonicalRecipientUniqueVerified,true);assert.equal(r.clientId,CLIENT);assert.equal(r.anchorAt,f.order.actualFinishedAt);assert.equal(a.status().bothLinesHistoryComplete,true);assert.equal(a.status().sendingEnabled,false);
  const plan=diagnostic(r,f),candidate=plan.prepared[0];assert.equal(plan.prepared.length,1);assert.equal(candidate.ageDays,70);assert.equal(candidate.line,BLUE);
  f.store.db.prepare('INSERT INTO conversations(phone,line,revision,hold,body) VALUES(?,?,1,0,?)').run(P,BLUE,f.store.seal({caseId:'previous-own-case',slots:{},asked:[]}));
  const dispatch=createRetentionDispatchRuntime(f.config,f.store,f.transport,{loadPlan:a.loadPlan,loadEligibility:a.loadEligibility,now:()=>f.at});
  assert.equal((await dispatch.prepare({company:'fumigacion',day:day(f.at),cursor:null})).prepared,1);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM retention_cycles').get().n,1);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'RETENTION_STAGED');assert.equal(f.store.conversation(P).state.caseId,'previous-own-case');
  f.transport.verifyLine=async phone=>({phone,instance:f.config.lines.find(l=>l.phone===phone).instance,ownerVerified:true,open:true});
  const runtime=createRetentionDeliveryRuntime(f.config,f.store,f.transport,{loadEligibility:a.loadEligibility,now:()=>f.at});
  assert.equal((await runtime.dispatchGuard({company:'fumigacion',key:f.request.cycleKey})).eligible,true);
  assert.equal((await a.loadEligibility(f.request)).plannerInput.history.length,0);
  f.at+=120001;assert.equal(a.status().bothLinesHistoryComplete,false);
 }finally{f.store.close();}
});

test('external completeness/eligibility claims and foreign scope cannot become trusted reader input',async()=>{
 const f=fixture();try{
  for(const req of [{...f.request,complete:true},{...f.request,eligible:true},{...f.request,plannerInput:{}},{...f.request,company:'servicio-tecnico'},{...f.request,phone:OTHER}]){const r=await f.adapter().loadEligibility(req);assert.equal(r.pending,true);assert.equal(r.canonicalRecipientUniqueVerified,false);}
  assert.equal(f.calls.pages,0);
  const foreign=new Store(':memory:','servicio-tecnico',randomBytes(32));try{assert.throws(()=>createRetentionEligibilityAdapter(f.config,foreign,f.transport),/OWN_RUNTIME_SCOPE/);}finally{foreign.close();}
 }finally{f.store.close();}
});

test('suspended red stops source reads while authorized readonly history can precede execution activation',async()=>{
 for(const mode of ['red','historical']){
  const f=fixture();try{
   if(mode==='red')f.config.operationalLineScope={version:BLUE_ONLY_SCOPE_VERSION,company:'fumigacion',authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,authorizedAt:iso(f.at-1000),activeLines:[BLUE],suspendedLines:[RED]};else f.config.activatedAt=f.at-DAY;
   const r=await f.load();if(mode==='red'){assert.equal(r.reason,'RETENTION_BOTH_LINES_HISTORY_PENDING_SUSPENDED');assert.equal(r.pending,true);assert.deepEqual(f.calls,{pages:0,program:0,journal:0,native:0});}else{assert.equal(r.pending,false);assert.equal(f.calls.native,1);}
  }finally{f.store.close();}
 }
});

test('real journal defaults cannot be substituted by a complete provider cache',async()=>{
 const f=fixture();try{
  initializeIntakeJournal(f.store,f.config);delete f.options.readJournalCoverage;
  const a=f.adapter(),r=await a.loadEligibility(f.request);assert.equal(r.reason,'RETENTION_JOURNAL_HISTORICAL_COVERAGE_PENDING');assert.equal(f.calls.native,0);assert.equal(a.status().connected,true);assert.equal(a.status().bothLinesHistoryComplete,false);
 }finally{f.store.close();}
});

test('scope, aliases, incomplete normalized search, changed completion and stale program reads are pending',async()=>{
 for(const mode of ['scope','alias','noncanonical','changed','stale','wrong-client','correction']){
  const f=fixture();try{
   if(mode==='scope')f.program.companyId='foreign';if(mode==='alias')f.page.customers[0].canonicalContacts.push(OTHER);if(mode==='noncanonical')f.program.coverage.noncanonicalPhoneFieldsCovered=false;
   if(mode==='changed')f.order.id='ANOTHER_ORDER';if(mode==='stale')f.program.checkedAt=iso(f.at-120001);if(mode==='wrong-client')f.program.searchedContacts[0].clientIds=['other-client'];if(mode==='correction')f.order.deletedAt=iso(f.at-1000);
   const r=await f.load();assert.equal(r.pending,true,mode);assert.equal(r.canonicalRecipientUniqueVerified,false,mode);assert.equal(f.calls.native,0,mode);
  }finally{f.store.close();}
 }
});

test('candidate pagination retains duplicates, repeated cursors and wrong days as unknown',async()=>{
 for(const mode of ['other-client','repeat','wrong-day']){
  const f=fixture();try{
   f.options.readProgramCandidatePage=async(c,fetcher,b)=>{
    f.calls.pages++;
    if(!b.cursor)return {...f.page,page:{cursor:null,nextCursor:'CURSOR_1',hasMore:true}};
    if(mode==='other-client')return {...f.page,customers:[{...f.page.customers[0],clientId:'other-client'}],page:{cursor:'CURSOR_1',nextCursor:null,hasMore:false}};
    if(mode==='wrong-day')return {...f.page,asOfDay:'2000-01-01',page:{cursor:'CURSOR_1',nextCursor:null,hasMore:false}};
    return {...f.page,customers:[],page:{cursor:'CURSOR_1',nextCursor:'CURSOR_1',hasMore:true}};
   };
   const r=await f.load();assert.equal(r.pending,true,mode);assert.equal(f.calls.program,0);
  }finally{f.store.close();}
 }
});

test('fresh reservation, no-contact and human evidence are kept in planner input',async()=>{
 for(const mode of ['future','optout','hold','refusal','recent']){
  const f=fixture();try{
   if(mode==='future'){f.program.orders.push({...f.order,id:'FUTURE_ORDER',state:'NUEVO',createdAt:iso(f.at-DAY),scheduledAt:iso(f.at+DAY),actualStartedAt:null,actualFinishedAt:null});f.program.searchedContacts[0].orderIds.push('FUTURE_ORDER');}
   if(mode==='optout')f.native.globalStatus.optOutGlobal=true;
   if(mode==='hold')f.store.db.prepare('INSERT INTO conversations(phone,line,revision,hold,body) VALUES(?,?,1,1,?)').run(P,BLUE,f.store.seal({slots:{},asked:[]}));
   if(['refusal','recent'].includes(mode)){const text=mode==='refusal'?'No me contacten':'Quiero agendar';f.native.sources.push({...f.source,sourceId:'NEW_NATIVE_SOURCE',at:f.at-DAY,literalText:text,interpretation:{...f.source.interpretation,sourceId:'NEW_NATIVE_SOURCE',literalText:text,kind:mode==='refusal'?'do-not-contact':'booking-request'}});}
   const r=await f.load();assert.equal(r.pending,false,mode);assert.equal(diagnostic(r,f).prepared.length,0,mode);
   assert.notEqual(r.reason,'RETENTION_SOURCE_VERIFIED',mode);
   if(mode==='future')assert.equal(r.plannerInput.contacts[0].futureBookings[0].state,'NUEVO');
  }finally{f.store.close();}
 }
});

test('booking-only and newer booking anchors have explicit completed-proof blockers',async()=>{
 const f=fixture();try{
  assert.equal((await f.adapter().loadEligibility({...f.request,lastCompletedOrderId:null})).reason,'RETENTION_COMPLETED_SERVICE_PROOF_REQUIRED');
  f.native.sources.push({...f.source,sourceId:'LATER_BOOKING',at:f.at-65*DAY,literalText:'Quiero agendar',interpretation:{...f.source.interpretation,sourceId:'LATER_BOOKING',literalText:'Quiero agendar',kind:'booking-request'}});
  assert.equal((await f.load()).reason,'RETENTION_BOOKING_ANCHOR_PROOF_UNSUPPORTED');
  f.program.orders=[];f.program.searchedContacts[0].orderIds=[];assert.equal((await f.load()).reason,'RETENTION_COMPLETED_SERVICE_PROOF_REQUIRED');
 }finally{f.store.close();}
});

test('native scope, sync, global status, original media and exact origin reference require evidence',async()=>{
 for(const mode of ['phone','sync','binding','origin','media','interpretation','edit','staff','refusal-forwarded','stale']){
  const f=fixture();try{
   if(mode==='phone')f.native.phone=OTHER;if(mode==='sync')f.native.coverage.providerSyncProven=false;if(mode==='binding')f.native.lines[1].ownerVerified=false;if(mode==='origin')f.native.origin.orderId='OTHER_ORDER';
   if(mode==='media')f.source.media=true;if(mode==='interpretation')f.source.interpretation.literalText='other';if(mode==='edit')f.source.edited=true;
   if(mode==='staff')f.native.sources.push({...f.source,sourceId:'STAFF_SOURCE',fromMe:true,interpretation:{...f.source.interpretation,sourceId:'STAFF_SOURCE'}});
   if(mode==='refusal-forwarded')f.native.sources.push({...f.source,sourceId:'FORWARDED_SOURCE',forwarded:true,interpretation:{...f.source.interpretation,sourceId:'FORWARDED_SOURCE',kind:'refusal'}});
   if(mode==='stale')f.native.checkedAt=iso(f.at-120001);
   const r=await f.load();assert.equal(r.pending,true,mode);assert.equal(r.canonicalRecipientUniqueVerified,false,mode);
  }finally{f.store.close();}
 }
});

test('a mid-read hold, scope retirement or stale clock cannot authorize a candidate',async()=>{
 for(const mode of ['hold','scope','expired']){
  const f=fixture();try{
   const read=f.options.readNativeHistory;f.options.readNativeHistory=async(...args)=>{const value=await read(...args);if(mode==='hold')f.store.db.prepare('INSERT INTO conversations(phone,line,revision,hold,body) VALUES(?,?,1,1,?)').run(P,BLUE,f.store.seal({slots:{},asked:[]}));if(mode==='scope')f.config.operationalLineScope={version:BLUE_ONLY_SCOPE_VERSION,company:'fumigacion',authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,authorizedAt:iso(f.at),activeLines:[BLUE],suspendedLines:[RED]};if(mode==='expired')f.at+=120001;return value;};
   const r=await f.load();if(mode==='hold'){assert.equal(r.pending,false);assert.equal(diagnostic(r,f).prepared.length,0);}else assert.equal(r.pending,true);
  }finally{f.store.close();}
 }
});

test('durable own ready/uncertain/accepted/delivered histories block duplicate candidates without mutation',async()=>{
 for(const state of ['READY','UNCERTAIN','ACCEPTED','DELIVERED','READ']){
  const f=fixture();try{
   f.store.queue(retentionOutboxId(f.request.cycleKey),P,BLUE,'Previous retained literal',false,1,retentionCaseId(f.request.cycleKey));
   f.store.db.prepare('UPDATE outbox SET state=?,mid=?').run(state,'OWN_OLD_MID');
   const r=await f.load();assert.equal(r.plannerInput.history.length,1);assert.equal(r.plannerInput.history[0].state,state);assert.equal(diagnostic(r,f).prepared.length,0);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,state);
  }finally{f.store.close();}
 }
});

test('old, mismatched and MID-bearing staged rows are preserved rather than filtered generically',async()=>{
 for(const mode of ['old','mid','case','revision','line','context','dispatch-ledger','delivery-ledger']){
  const f=fixture();try{
   await stageOwn(f);
   if(mode==='old')f.store.db.prepare('UPDATE outbox SET created=?').run(f.at-120001);if(mode==='mid')f.store.db.prepare('UPDATE outbox SET mid=?').run('PRIOR_MID');if(mode==='case')f.store.db.prepare('UPDATE outbox SET case_id=?').run('OTHER_CASE');if(mode==='revision')f.store.db.prepare('UPDATE outbox SET revision=2').run();if(mode==='line')f.store.db.prepare('UPDATE outbox SET line=?').run(RED);
   if(mode==='context')f.store.db.prepare("DELETE FROM meta WHERE key LIKE 'retention-outbox-context:%'").run();
   if(mode==='dispatch-ledger')f.store.db.prepare('INSERT INTO retention_dispatch_ledger(cycle_key,at,state,reason,body) VALUES(?,?,?,?,?)').run(f.request.cycleKey,f.at,'SENDING','OWN_PRIOR_ATTEMPT',f.store.seal({}));
   if(mode==='delivery-ledger')f.store.db.prepare('INSERT INTO retention_delivery_ledger(cycle_key,at,state,reason,body) VALUES(?,?,?,?,?)').run(f.request.cycleKey,f.at,'PROVEN','OWN_PRIOR_PROOF',f.store.seal({}));
   const r=await f.load();assert.equal(r.plannerInput.history.length,1,mode);assert.equal(diagnostic(r,f).prepared.length,0,mode);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'RETENTION_STAGED');
  }finally{f.store.close();}
 }
});

test('real readonly program route keeps its own credential, scope and bounded errors',async()=>{
 const f=fixture();try{
  const calls=[];const reader=async(url,o)=>{calls.push({url,o});return {ok:true,json:async()=>f.program};};
  const r=await readOwnRetentionProgramContactHistory(f.config,reader,{phone:P});assert.equal(r.companyId,MARIA_COMPANY);assert.equal(calls[0].url,MARIA_PROGRAM_URL+'/operational-audit/contact-audit');assert.equal(calls[0].o.headers.Authorization,'Bearer '+f.config.programSupervision.token);assert.deepEqual(JSON.parse(calls[0].o.body),{phones:[P]});
  f.config.programSupervision.token=f.config.mariaProgram.token;await assert.rejects(readOwnRetentionProgramContactHistory(f.config,reader,{phone:P}),/SEPARATE_PROGRAM_READ_ACCESS_REQUIRED/);assert.equal(calls.length,1);
 }finally{f.store.close();}
});

test('provider-cache pagination never claims synchronization, complete no-contact or full history',async()=>{
 const f=fixture();try{
  let calls=0;const transport={config:f.config,verifyLine:async phone=>{calls++;const l=f.config.lines.find(l=>l.phone===phone);return {phone,instance:l.instance,ownerVerified:true,open:true};},request:async()=>{calls++;return {messages:{total:0,records:[]}};}};
  const range={phone:P,from:f.at-90*DAY,to:f.at},r=await readOwnRetentionNativeHistory(f.config,transport,range);
  assert.equal(calls,6);assert.equal(r.coverage.providerCachePagesComplete,true);assert.equal(r.coverage.providerSyncProven,false);assert.equal(r.coverage.bothLinesHistoryComplete,false);assert.equal(r.coverage.globalNoContactStatusComplete,false);assert.ok(r.lines.every(l=>l.complete===false));
  f.config.activatedAt=f.at-DAY;const historical=await readOwnRetentionNativeHistory(f.config,transport,range);assert.equal(historical.readOnly,true);assert.equal(historical.coverage.bothLinesHistoryComplete,false);assert.equal(calls,12);
  await assert.rejects(readOwnRetentionNativeHistory(f.config,transport,{...range,from:f.at-100*DAY}),/AUTHORIZED_HISTORICAL_READ_RANGE_REQUIRED/);assert.equal(calls,12);
 }finally{f.store.close();}
});

test('reader errors never reveal credentials or create outgoing/business records',async()=>{
 const f=fixture();try{
  f.options.readProgramCandidatePage=async()=>{throw Error('https://private.invalid/?token=never-persist');};
  const r=await f.load();assert.equal(r.reason,'RETENTION_SOURCE_READ_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(r),/private.invalid|token=|never-persist/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}
});

test('contact search order IDs and literal order rows must match exactly',async()=>{
 for(const mode of ['omitted-order','duplicate-id','unknown-id']){
  const f=fixture();try{
   if(mode==='omitted-order')f.program.searchedContacts[0].orderIds.push('UNREAD_FUTURE_ORDER');
   if(mode==='duplicate-id')f.program.searchedContacts[0].orderIds.push(ORDER);
   if(mode==='unknown-id')f.program.searchedContacts[0].orderIds=['not an ID'];
   const source=await f.load();assert.equal(source.pending,true,mode);assert.equal(f.calls.native,0,mode);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  }finally{f.store.close();}
 }
});

test('recent program metadata and impossible completion chronology cannot trigger retention',async()=>{
 for(const mode of ['creation','schedule']){
  const f=fixture();try{
   if(mode==='creation')f.order.createdAt=iso(f.at-DAY);else f.order.scheduledAt=iso(f.at-DAY);
   const source=await f.load();if(mode==='creation')assert.equal(source.reason,'RETENTION_COMPLETION_OR_CORRECTION_REQUIRES_REVIEW');else{assert.equal(source.pending,false);assert.equal(diagnostic(source,f).prepared.length,0);assert.equal(source.reason,'CURRENT_CASE_IN_PROGRESS');}
  }finally{f.store.close();}
 }
});

test('own plan pages keep pagination separate from crossed evidence and reject caller facts',async()=>{
 const f=fixture();try{
  const a=f.adapter(),plan=await a.loadPlan({company:'fumigacion',day:day(f.at),cursor:null,now:0});
  assert.equal(plan.guard,'own-fumigacion-retention-plan-source-v1');assert.equal(plan.complete,true);assert.equal(plan.nextCursor,null);assert.equal(plan.plan.prepared.length,1);assert.equal(plan.plan.crossedCoverageComplete,true);assert.equal(plan.sends,0);
  await assert.rejects(a.loadPlan({company:'fumigacion',day:day(f.at),cursor:null,complete:true}),/OWN_PLAN_REQUEST_REQUIRED/);
  await assert.rejects(a.loadPlan({company:'fumigacion',day:'2000-01-01',cursor:null}),/OWN_PLAN_REQUEST_REQUIRED/);
  initializeIntakeJournal(f.store,f.config);delete f.options.readJournalCoverage;
  const pending=await f.adapter().loadPlan({company:'fumigacion',day:day(f.at),cursor:null});
  assert.equal(pending.complete,true);assert.equal(pending.plan.crossedCoverageComplete,false);assert.equal(pending.plan.prepared.length,0);assert.equal(pending.plan.coveragePendingContacts,1);assert.equal(pending.plan.deferred[0].reason,'RETENTION_JOURNAL_HISTORICAL_COVERAGE_PENDING');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}
});

test('plan cursor pages use at most 25 candidates and never mark an unfinished page complete',async()=>{
 const f=fixture();try{
  f.options.readProgramCandidatePage=async(c,fetcher,body)=>{
   if(body.limit===100)return f.page;
   assert.equal(body.limit,25);
   return body.cursor?{...f.page,customers:[],page:{cursor:'NEXT_OWN_PAGE',hasMore:false,nextCursor:null}}:{...f.page,page:{cursor:null,hasMore:true,nextCursor:'NEXT_OWN_PAGE'}};
  };
  const a=f.adapter(),first=await a.loadPlan({company:'fumigacion',day:day(f.at),cursor:null});assert.equal(first.complete,false);assert.equal(first.nextCursor,'NEXT_OWN_PAGE');assert.equal(first.plan.prepared.length,1);
  const second=await a.loadPlan({company:'fumigacion',day:day(f.at),cursor:first.nextCursor});assert.equal(second.complete,true);assert.equal(second.plan.prepared.length,0);
  f.config.operationalLineScope={version:BLUE_ONLY_SCOPE_VERSION,company:'fumigacion',authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,authorizedAt:iso(f.at),activeLines:[BLUE],suspendedLines:[RED]};
  await assert.rejects(a.loadPlan({company:'fumigacion',day:day(f.at),cursor:null}),/BOTH_LINES_HISTORY_PENDING_SUSPENDED/);
 }finally{f.store.close();}
});
