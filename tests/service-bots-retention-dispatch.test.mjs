import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../automation/service-bots/store.mjs';
import {Transport,flushOutbox} from '../automation/service-bots/transport.mjs';
import {planPreventiveRetention,PREVENTIVE_RETENTION_NOTE} from '../automation/service-bots/preventive-retention.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {RETENTION_SOURCE_GUARD,retentionOutboxId,retentionCaseId} from '../automation/service-bots/retention-delivery.mjs';
import {createRetentionDispatchRuntime,RETENTION_PLAN_SOURCE_GUARD,RETENTION_STAGING_STATE,RETENTION_NOTE_URL,installRetentionNoteAccess,restoreRetentionNoteAccess,retentionNoteAccessStatus} from '../automation/service-bots/retention-dispatch.mjs';

const NOW=Date.parse('2026-10-10T17:00:00Z'),DAY='2026-10-10',PN='573000001111',BLUE='573126944997',RED='573126938721',CLIENT='synthetic-client',ORDER='synthetic-completed-order',ACTOR='synthetic-own-actor',MID='3EB0_SYNTHETIC_RETENTION';
const hash=v=>createHash('sha256').update(v).digest('hex');
function fixture({enabled=false,conversation=true,loadEligibility=true,loadPlan=true}={}){
  const f={now:NOW,calls:[],sourceCalls:0,planCalls:0,sendCalls:0,noteCalls:0};
  f.config={company:'fumigacion',name:'FUMIGACION',enabled:true,provider:'https://native.invalid',authHash:hash('A'.repeat(43)),webhookHash:hash('W'.repeat(43)),mariaProgram:{enabled:true,actorId:ACTOR,token:'R'.repeat(43),startsAt:NOW-1000,expiresAt:NOW+3600000},programSupervision:{token:'U'.repeat(43)},retentionProofAccess:{tokenHash:hash('P'.repeat(43))},lines:[{phone:BLUE,instance:'synthetic-blue',apiKey:'fake-only'},{phone:RED,instance:'synthetic-red',apiKey:'fake-only'}]};
  f.store=new Store(':memory:','fumigacion',randomBytes(32));
  f.contact={phone:PN,identity:{kind:'PN',phone:PN,bindingVerified:true},name:{value:'Camila',phone:PN,verified:true,sourceId:'synthetic-name'},contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true,optOutGlobal:false,doNotContact:false,humanHold:false,activeCase:false,pendingVisit:false,pendingQuotation:false,completedServices:[{company:'FUMIGACION',phone:PN,clientId:CLIENT,orderId:ORDER,sourceId:ORDER,completedAt:new Date(NOW-70*86400000).toISOString(),completedVerified:true,originLine:BLUE,originLineVerified:true}],bookingInteractions:[],futureBookings:[],rejections:[]};
  f.input={coverage:{whatsapp:{contactHistoryComplete:true,lines:[{line:BLUE,complete:true,suspended:false,connected:true},{line:RED,complete:true,suspended:false,connected:true}]},program:{company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true}},contacts:[f.contact],history:[]};
  f.replan=()=>{f.plan=planPreventiveRetention({day:DAY,now:f.now,...f.input});f.candidate=f.plan.prepared[0];f.key=f.candidate?.dedupKey;};f.replan();
  f.originalState={caseId:'fumigacion:original-closed-case',slots:{address:'Literal original'},asked:[],registeredInProgram:true};
  if(conversation)f.store.db.prepare('INSERT INTO conversations(phone,line,revision,body) VALUES(?,?,7,?)').run(PN,BLUE,f.store.seal(f.originalState));
  f.native=()=>({key:{id:MID,remoteJid:PN+'@s.whatsapp.net',fromMe:true},messageTimestamp:Math.floor((f.sentAt??f.now)/1000),message:{conversation:f.candidate.text},status:'DELIVERY_ACK',MessageUpdate:[]});
  f.noteReceipt=()=>({id:'synthetic-note-id',clientId:CLIENT,company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actor:{membershipId:ACTOR,username:'maria.angel.bot'},cycleKey:f.key,text:PREVENTIVE_RETENTION_NOTE,sourceLine:BLUE,nativeMessageId:MID,deliveryStatus:'DELIVERED',deliveryObservedAt:new Date(f.now).toISOString(),deliveredAt:null,createdAt:new Date(f.now).toISOString(),replayed:false});
  f.fetcher=async(url,options)=>{
    f.calls.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});
    if(url===RETENTION_NOTE_URL){f.noteCalls++;if(f.noteAwait)await f.noteAwait();if(f.noteError)throw Error(f.noteError);return {ok:f.noteHttpOk!==false,json:async()=>({...f.noteReceipt(),...f.receiptPatch})};}
    if(url.includes('/message/sendText/')){f.sendCalls++;if(f.sendAwait)await f.sendAwait();if(f.sendError)throw Error(f.sendError);f.sentAt=f.now;return {ok:true,json:async()=>({key:{id:MID}})};}
    if(url.includes('/instance/fetchInstances')){if(f.ownerAwait)await f.ownerAwait();return {ok:true,json:async()=>[{name:'synthetic-blue',ownerJid:(f.wrongOwner?RED:BLUE)+'@s.whatsapp.net',connectionStatus:'open'}]};}
    if(f.nativeAwait)await f.nativeAwait();return {ok:true,json:async()=>({messages:{total:1,records:[{...f.native(),...f.nativePatch}]}})};
  };
  f.transport=new Transport(f.config,f.fetcher);
  f.loadPlan=async({day,cursor})=>{f.planCalls++;if(f.planAwait)await f.planAwait();return {guard:RETENTION_PLAN_SOURCE_GUARD,company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId:ACTOR,day,cursor,nextCursor:null,complete:true,checkedAt:new Date(f.now).toISOString(),plan:f.plan,...f.planSourcePatch};};
  f.loadEligibility=async()=>{f.sourceCalls++;if(f.sourceAwait)await f.sourceAwait();return {guard:RETENTION_SOURCE_GUARD,company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId:ACTOR,clientId:CLIENT,phone:PN,lastCompletedOrderId:ORDER,anchorAt:f.contact.completedServices[0]?.completedAt,anchorKind:'COMPLETED_SERVICE',canonicalRecipientUniqueVerified:true,checkedAt:new Date(f.now).toISOString(),plannerInput:structuredClone(f.input),...f.sourcePatch};};
  f.makeRuntime=(active=enabled)=>createRetentionDispatchRuntime(f.config,f.store,f.transport,{loadPlan:loadPlan?f.loadPlan:undefined,loadEligibility:loadEligibility?f.loadEligibility:undefined,now:()=>f.now,enabled:active,fetcher:f.fetcher});
  f.runtime=f.makeRuntime();f.prepare=()=>f.runtime.prepare({company:'fumigacion',day:DAY});f.dispatch=()=>f.runtime.dispatch({company:'fumigacion',day:DAY});f.notes=()=>f.runtime.writeNotes({company:'fumigacion',day:DAY});
  f.install=()=>installRetentionNoteAccess(f.config,f.store,{actorId:ACTOR,url:RETENTION_NOTE_URL,token:'N'.repeat(43),startsAt:new Date(NOW-1000).toISOString(),expiresAt:new Date(NOW+3600000).toISOString()},f.now);
  f.delivered=()=>{f.now+=2000;f.store.delivery(MID,BLUE,'DELIVERED');};
  return f;
}

test('default OFF prepares encrypted non-sendable outbox, preserves business case and generic sender ignores it',async()=>{
  const f=fixture();try{
    const before=f.store.conversation(PN),r=await f.prepare();assert.equal(r.prepared,1);assert.equal(r.sends,0);assert.equal(f.sourceCalls,1);assert.equal(f.sendCalls,0);
    const outbox=f.store.db.prepare('SELECT * FROM outbox').get();assert.equal(outbox.state,RETENTION_STAGING_STATE);assert.equal(outbox.case_id,retentionCaseId(f.key));assert.equal(outbox.revision,before.revision);assert.deepEqual(f.store.conversation(PN),before);assert.doesNotMatch(outbox.body,/Camila|Literal original/);
    const drained=await flushOutbox(f.store,f.config,f.transport);assert.equal(drained.accepted,0);assert.equal(f.calls.length,0);assert.equal((await f.dispatch()).reason,'RETENTION_DISPATCH_DISABLED');assert.equal((await f.notes()).reason,'RETENTION_NOTE_DISABLED');
    assert.equal(f.runtime.status().sendingEnabled,false);assert.equal(f.runtime.status().notesEnabled,false);assert.equal(f.runtime.status().autonomousEnabled,false);assert.equal(f.runtime.status().generalOutboxSendingEnabled,false);
    assert.equal((await f.prepare()).results[0].duplicate,true);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);
  }finally{f.store.close();}
});
test('new verified historical PN can stage without erasing or inventing existing intake facts',async()=>{
  const f=fixture({conversation:false});try{assert.equal((await f.prepare()).prepared,1);assert.deepEqual(f.store.conversation(PN).state,{caseId:retentionCaseId(f.key),slots:{},asked:[],lastText:''});assert.equal(f.sendCalls,0);}finally{f.store.close();}
});
test('day/cursor endpoints reject operator facts, foreign company, future day and unsafe cursor',async()=>{
  const f=fixture();try{for(const body of [{company:'fumigacion',day:DAY,delivery:'READ'},{company:'servicio-tecnico',day:DAY},{company:'fumigacion',day:'2026-10-11'},{company:'fumigacion',day:DAY,cursor:'https://secret.invalid'}])for(const method of ['prepare','dispatch','writeNotes'])await assert.rejects(f.runtime[method](body));assert.equal(f.planCalls,0);assert.equal(f.sendCalls,0);assert.equal(f.noteCalls,0);}finally{f.store.close();}
});
test('missing own adapters and foreign, future or incomplete plan envelope never produce an authorized queue',async()=>{
  for(const options of [{loadEligibility:false},{loadPlan:false}]){const f=fixture(options);try{assert.equal((await f.prepare()).pending,true);assert.equal(f.planCalls,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);}finally{f.store.close();}}
  for(const patch of [{companyId:'OTHER'},{actorId:'OTHER'},{checkedAt:new Date(NOW+1).toISOString()},{cursor:'OTHER'},{complete:true,nextCursor:'NEXT'},{complete:false,nextCursor:null}]){const f=fixture();try{f.planSourcePatch=patch;await assert.rejects(f.prepare(),/OWN_PLAN_SOURCE_REQUIRED/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);}finally{f.store.close();}}
});
test('incomplete eligibility or prior attempt leaves staging under review with zero sends and no retry promotion',async()=>{
  for(const kind of ['red','future','refusal','prior']){const f=fixture({enabled:true});try{
    if(kind==='red')f.input.coverage.whatsapp.lines[1].complete=false;if(kind==='future')f.contact.futureBookings.push({company:'FUMIGACION',phone:PN,scopeVerified:true,state:'PROGRAMADO',cancelled:false,scheduledAt:new Date(NOW+86400000).toISOString()});if(kind==='refusal')f.contact.doNotContact=true;if(kind==='prior')f.input.history.push({company:'fumigacion',phone:PN,dedupKey:f.key,state:'UNCERTAIN'});
    assert.equal((await f.prepare()).results[0].state,'REVIEW',kind);await f.dispatch();await f.prepare();assert.equal(f.sendCalls,0);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,RETENTION_STAGING_STATE);assert.equal(f.store.db.prepare('SELECT state FROM retention_dispatch').get().state,'REVIEW');
  }finally{f.store.close();}}
});
test('fresh pre-send guard catches new booking, rejection, incomplete red history and local or owner changes',async()=>{
  for(const kind of ['booking','future','refusal','red','hold','revision','case','staff','owner','during-await']){const f=fixture({enabled:true});try{
    await f.prepare();if(kind==='booking')f.contact.bookingInteractions.push({phone:PN,line:BLUE,sourceId:'new-booking',at:new Date(NOW-86400000).toISOString(),nativeBindingVerified:true,fromMe:false,kind:'booking-request'});if(kind==='future')f.contact.futureBookings.push({company:'FUMIGACION',phone:PN,scopeVerified:true,state:'PROGRAMADO',cancelled:false,scheduledAt:new Date(NOW+86400000).toISOString()});if(kind==='refusal')f.contact.doNotContact=true;if(kind==='red')f.input.coverage.whatsapp.lines[1].complete=false;if(kind==='hold')f.store.hold(PN,'synthetic-human',true);if(kind==='revision')f.store.db.prepare('UPDATE conversations SET revision=revision+1').run();if(kind==='case')f.store.saveConversation(PN,{...f.originalState,caseId:'another-case'});if(kind==='staff')f.store.db.prepare('INSERT INTO events(id,phone,from_me,state) VALUES(?,?,1,?)').run('pending-staff',PN,'PENDING');if(kind==='owner')f.wrongOwner=true;if(kind==='during-await')f.ownerAwait=async()=>{f.store.hold(PN,'human-during-read',true);};
    const r=await f.dispatch();assert.equal(r.accepted,0,kind);assert.equal(f.sendCalls,0,kind);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,RETENTION_STAGING_STATE,kind);
  }finally{f.store.close();}}
});
test('staged context forgery and external READY or UNCERTAIN row cannot be adopted',async()=>{
  for(const state of ['READY','UNCERTAIN','ACCEPTED','READ']){const f=fixture();try{f.store.queue(retentionOutboxId(f.key),PN,BLUE,f.candidate.text,false,7,retentionCaseId(f.key));f.store.db.prepare('UPDATE outbox SET state=?').run(state);await assert.rejects(f.prepare(),/EXISTING_ATTEMPT|OTHER_CUSTOMER_OUTBOX/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM retention_dispatch').get().n,0);assert.equal(f.sendCalls,0);}finally{f.store.close();}}
  const f=fixture({enabled:true});try{await f.prepare();f.store.saveConversation(PN,{...f.originalState,caseId:retentionCaseId(f.key)});assert.equal((await f.dispatch()).accepted,0);assert.equal(f.sendCalls,0);}finally{f.store.close();}
});
test('atomic durable reservation sends only once across concurrent workers; ACCEPTED is not delivery or a note',async()=>{
  const f=fixture({enabled:true});try{await f.prepare();f.install();const peer=f.makeRuntime(true);const results=await Promise.all([f.dispatch(),peer.dispatch({company:'fumigacion',day:DAY})]);assert.equal(results.reduce((n,r)=>n+r.accepted,0),1);assert.equal(f.sendCalls,1);assert.equal(f.store.db.prepare('SELECT state,mid FROM outbox').get().state,'ACCEPTED');await f.dispatch();const notes=await f.notes();assert.equal(notes.programNotesWritten,0);assert.equal(f.noteCalls,0);assert.equal(f.sendCalls,1);assert.equal(f.store.db.prepare('SELECT state FROM retention_dispatch').get().state,'ACCEPTED');}finally{f.store.close();}
});
test('uncertain send, pending SENDING, ACCEPTED, delivered and read cannot be retried by restarted worker',async()=>{
  const f=fixture({enabled:true});try{await f.prepare();f.sendError='https://secret.invalid/?token=do-not-persist';assert.equal((await f.dispatch()).uncertain,1);const restarted=f.makeRuntime(true);await restarted.dispatch({company:'fumigacion',day:DAY});assert.equal(f.sendCalls,1);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'UNCERTAIN');for(const row of f.store.db.prepare('SELECT reason,body FROM retention_dispatch_ledger').all()){assert.doesNotMatch(row.reason,/secret|token/);assert.doesNotMatch(JSON.stringify(f.store.open(row.body)),/do-not-persist/);}}finally{f.store.close();}
  for(const state of ['SENDING','ACCEPTED','DELIVERED','READ']){const g=fixture({enabled:true});try{await g.prepare();g.store.db.prepare('UPDATE retention_dispatch SET state=?').run(state);g.store.db.prepare('UPDATE outbox SET state=?,mid=?').run(state,MID);await g.makeRuntime(true).dispatch({company:'fumigacion',day:DAY});assert.equal(g.sendCalls,0,state);}finally{g.store.close();}}
});
test('note uses only stable cycleKey and third token after fresh own native proof, without invented deliveredAt',async()=>{
  const f=fixture({enabled:true});try{await f.prepare();f.install();await f.dispatch();f.delivered();const r=await f.notes();assert.equal(r.programNotesWritten,1);assert.equal(f.noteCalls,1);assert.equal(f.sendCalls,1);const request=f.calls.find(c=>c.url===RETENTION_NOTE_URL);assert.deepEqual(request.body,{cycleKey:f.key});assert.equal(f.store.db.prepare('SELECT state FROM retention_dispatch').get().state,'NOTED');const note=f.store.db.prepare("SELECT body FROM retention_dispatch_ledger WHERE state='NOTED'").get();assert.equal(f.store.open(note.body).receipt.deliveredAt,null);await f.notes();await f.dispatch();assert.equal(f.noteCalls,1);assert.equal(f.sendCalls,1);assert.deepEqual(f.store.conversation(PN).state,f.originalState);}finally{f.store.close();}
});
test('local delivery without native ACK and fresh proof never authorizes note',async()=>{
  for(const kind of ['no-ack','wrong-pn','hold','red','slow']){const f=fixture({enabled:true});try{await f.prepare();f.install();await f.dispatch();f.delivered();if(kind==='no-ack')f.nativePatch={status:'SERVER_ACK'};if(kind==='wrong-pn')f.nativePatch={key:{id:MID,remoteJid:'573000009999@s.whatsapp.net',fromMe:true}};if(kind==='hold')f.store.hold(PN,'human',true);if(kind==='red')f.input.coverage.whatsapp.lines[1].complete=false;if(kind==='slow')f.nativeAwait=async()=>{f.now+=120001;};assert.equal((await f.notes()).programNotesWritten,0,kind);assert.equal(f.noteCalls,0,kind);}finally{f.store.close();}}
});
test('third note access is private encrypted, own scoped, expiry bounded and independent of all existing tokens',()=>{
  const f=fixture();try{
    const body={actorId:ACTOR,url:RETENTION_NOTE_URL,token:'N'.repeat(43),startsAt:new Date(NOW-1000).toISOString(),expiresAt:new Date(NOW+3600000).toISOString()};
    for(const token of ['A','W','R','U','P'].map(c=>c.repeat(43)))assert.throws(()=>installRetentionNoteAccess(f.config,f.store,{...body,token},f.now),/SEPARATE_NOTE_ACCESS/);
    for(const patch of [{actorId:'FOREIGN'},{url:RETENTION_NOTE_URL+'/other'},{startsAt:new Date(NOW+1).toISOString()},{expiresAt:new Date(NOW+3600001).toISOString()},{expiresAt:new Date(NOW).toISOString()},{tenantId:MARIA_TENANT}])assert.throws(()=>installRetentionNoteAccess(f.config,f.store,{...body,...patch},f.now));
    f.install();const raw=f.store.db.prepare("SELECT value FROM meta WHERE key='own-retention-note-access'").get().value;assert.doesNotMatch(raw,/NNNNNN|synthetic-own-actor/);delete f.config.retentionNoteAccess;restoreRetentionNoteAccess(f.config,f.store);assert.equal(retentionNoteAccessStatus(f.config,f.now).enabled,true);assert.doesNotMatch(JSON.stringify(f.runtime.status()),/NNNNNN/);f.config.mariaProgram.actorId='CHANGED';assert.equal(retentionNoteAccessStatus(f.config,f.now).enabled,false);f.config.mariaProgram.actorId=ACTOR;assert.equal(retentionNoteAccessStatus(f.config,NOW+3600000).enabled,false);f.config.mariaProgram.expiresAt=NOW+2000;assert.equal(retentionNoteAccessStatus(f.config,NOW).enabled,false);
  }finally{f.store.close();}
});
test('HTTP rejection, timeout, malformed/foreign note receipt stay uncertain and never retry or claim note count',async()=>{
  for(const kind of ['timeout','http','actor','pn-scope','mid','text','future','deliveredAt','replayed']){const f=fixture({enabled:true});try{await f.prepare();f.install();await f.dispatch();f.delivered();if(kind==='timeout')f.noteError='https://note.invalid/?token=private-do-not-store';if(kind==='http')f.noteHttpOk=false;if(kind==='actor')f.receiptPatch={actor:{membershipId:'FOREIGN',username:'maria.angel.bot'}};if(kind==='pn-scope')f.receiptPatch={clientId:'FOREIGN'};if(kind==='mid')f.receiptPatch={nativeMessageId:'OTHER'};if(kind==='text')f.receiptPatch={text:'Nota inventada'};if(kind==='future')f.receiptPatch={deliveryObservedAt:new Date(f.now+1).toISOString()};if(kind==='deliveredAt')f.receiptPatch={deliveredAt:new Date(f.now+1).toISOString()};if(kind==='replayed')f.receiptPatch={replayed:'false'};assert.equal((await f.notes()).programNotesWritten,0,kind);assert.equal(f.store.db.prepare('SELECT state FROM retention_dispatch').get().state,'NOTE_UNCERTAIN');await f.makeRuntime(true).writeNotes({company:'fumigacion',day:DAY});assert.equal(f.noteCalls,1,kind);const last=f.store.db.prepare('SELECT reason,body FROM retention_dispatch_ledger ORDER BY id DESC LIMIT 1').get();assert.doesNotMatch(last.reason,/private|token/);assert.doesNotMatch(JSON.stringify(f.store.open(last.body)),/private-do-not-store/);}finally{f.store.close();}}
});
test('booking-only planner candidate defers explicitly without manufacturing completed order or note',async()=>{
  const f=fixture();try{f.contact.completedServices=[];f.contact.bookingInteractions=[{phone:PN,line:BLUE,sourceId:'old-booking',at:new Date(NOW-70*86400000).toISOString(),nativeBindingVerified:true,fromMe:false,kind:'booking-request'}];f.replan();assert.equal(f.candidate.sourceAnchorKind,'booking-interaction');const r=await f.prepare();assert.equal(r.prepared,0);assert.equal(r.results[0].reason,'RETENTION_BOOKING_ONLY_PROOF_NOT_SUPPORTED');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(f.sendCalls,0);assert.equal(f.noteCalls,0);}finally{f.store.close();}
});
test('disk restart preserves acceptance and uncertain note reservations without sending or repeating a note',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'own-retention-test-')),file=join(directory,'own.sqlite'),cipherKey=randomBytes(32),f=fixture({enabled:true});
  try{
    f.store.close();f.store=new Store(file,'fumigacion',cipherKey);f.runtime=f.makeRuntime(true);await f.prepare();f.install();await f.dispatch();f.delivered();f.noteError='synthetic-timeout';await f.notes();assert.equal(f.noteCalls,1);assert.equal(f.sendCalls,1);f.store.close();
    f.store=new Store(file,'fumigacion',cipherKey);delete f.config.retentionNoteAccess;restoreRetentionNoteAccess(f.config,f.store);f.runtime=f.makeRuntime(true);await f.dispatch();await f.notes();assert.equal(f.sendCalls,1);assert.equal(f.noteCalls,1);assert.equal(f.store.db.prepare('SELECT state FROM retention_dispatch').get().state,'NOTE_UNCERTAIN');assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'DELIVERED');
  }finally{f.store.close();const target=resolve(directory);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('own-retention-test-'));rmSync(target,{recursive:true,force:true});}
});
test('durable queue paginates current-day rows and reports partial read until its terminal page',async()=>{
  const f=fixture({enabled:true});try{
    f.store.tx(()=>{for(let i=0;i<27;i++){const key='preventive-retention-fumigacion-'+i.toString(16).padStart(40,'0')+'-v1';f.store.db.prepare('INSERT INTO retention_dispatch VALUES(?,?,?,?,?,?)').run(key,i===0?'2026-10-09':DAY,'REVIEW',NOW,NOW,f.store.seal({}));}});
    const first=await f.dispatch();assert.equal(first.results.length,25);assert.equal(first.complete,false);assert.ok(first.nextCursor);const second=await f.runtime.dispatch({company:'fumigacion',day:DAY,cursor:first.nextCursor});assert.equal(second.results.length,1);assert.equal(second.complete,true);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.results,...second.results].map(r=>r.cycleKey)).size,26);assert.equal(f.sendCalls,0);assert.equal(f.sourceCalls,0);
  }finally{f.store.close();}
});
test('post-await reader timestamps, fresh replan duplicate and changed cutoff are checked without stale pre-read clock',async()=>{
  const f=fixture({enabled:true});try{
    f.sourceAwait=async()=>{await Promise.resolve();f.now+=500;};assert.equal((await f.prepare()).prepared,1);f.replan();assert.equal((await f.prepare()).results[0].duplicate,true);assert.equal((await f.dispatch()).accepted,1);assert.equal(f.sendCalls,1);f.config.mariaProgram.expiresAt=f.now;assert.equal(f.runtime.status().sendingEnabled,false);assert.equal((await f.notes()).reason,'RETENTION_NOTE_DISABLED');
  }finally{f.store.close();}
});
test('confirmed replay receipt does not claim a newly written note and unrelated response fields are never persisted',async()=>{
  const f=fixture({enabled:true});try{await f.prepare();f.install();await f.dispatch();f.delivered();f.receiptPatch={replayed:true,irrelevantDebug:'https://secret.invalid/?token=do-not-store'};assert.equal((await f.notes()).programNotesWritten,0);const last=f.store.db.prepare("SELECT body FROM retention_dispatch_ledger WHERE state='NOTED'").get();assert.doesNotMatch(JSON.stringify(f.store.open(last.body)),/secret.invalid|do-not-store|irrelevantDebug/);assert.equal(f.noteCalls,1);}finally{f.store.close();}
});
test('restore preserves an original grant for review and fails closed after actor or global token changes without disabling runtime',()=>{
  const f=fixture();try{
    f.install();const original=f.store.open(f.store.db.prepare("SELECT value FROM meta WHERE key='own-retention-note-access'").get().value);
    f.config.mariaProgram.actorId='changed-actor';delete f.config.retentionNoteAccess;restoreRetentionNoteAccess(f.config,f.store);assert.equal(retentionNoteAccessStatus(f.config,f.now).enabled,false);assert.equal(f.config.enabled,true);assert.deepEqual(f.config.retentionNoteAccess,original);
    f.config.mariaProgram.actorId=ACTOR;f.config.authHash=hash(original.token);delete f.config.retentionNoteAccess;restoreRetentionNoteAccess(f.config,f.store);assert.equal(retentionNoteAccessStatus(f.config,f.now).enabled,false);assert.equal(f.config.enabled,true);assert.equal(f.config.retentionNoteAccess.expiresAt,original.expiresAt);
  }finally{f.store.close();}
});
test('delivery acknowledged after Bogota midnight processes the earlier accepted cycle with fresh current proof and no resend',async()=>{
  const f=fixture({enabled:true});try{
    f.config.mariaProgram.expiresAt=NOW+3*86400000;await f.prepare();installRetentionNoteAccess(f.config,f.store,{actorId:ACTOR,url:RETENTION_NOTE_URL,token:'N'.repeat(43),startsAt:new Date(NOW-1000).toISOString(),expiresAt:new Date(NOW+3*86400000).toISOString()},f.now);await f.dispatch();
    f.now=Date.parse('2026-10-11T05:01:00Z');f.store.delivery(MID,BLUE,'DELIVERED');const first=await f.runtime.writeNotes({company:'fumigacion',day:'2026-10-11'});assert.equal(first.programNotesWritten,1);assert.equal(f.noteCalls,1);assert.equal(f.sendCalls,1);assert.equal(f.store.db.prepare('SELECT day,state FROM retention_dispatch').get().day,DAY);assert.equal(f.store.db.prepare('SELECT state FROM retention_dispatch').get().state,'NOTED');const last=f.store.db.prepare("SELECT body FROM retention_dispatch_ledger WHERE state='NOTED'").get();assert.equal(f.store.open(last.body).receipt.deliveredAt,null);await f.runtime.writeNotes({company:'fumigacion',day:'2026-10-11'});assert.equal(f.noteCalls,1);assert.equal(f.sendCalls,1);
  }finally{f.store.close();}
});
test('note proof retains the sent literal across rounded-month boundary while current 60–90 day eligibility stays mandatory',async()=>{
  for(const anchorDays of [74,90]){const f=fixture({enabled:true});try{
    f.contact.completedServices[0].completedAt=new Date(NOW-anchorDays*86400000).toISOString();f.replan();f.config.mariaProgram.expiresAt=NOW+3*86400000;await f.prepare();installRetentionNoteAccess(f.config,f.store,{actorId:ACTOR,url:RETENTION_NOTE_URL,token:'N'.repeat(43),startsAt:new Date(NOW-1000).toISOString(),expiresAt:new Date(NOW+3*86400000).toISOString()},f.now);await f.dispatch();const sentLiteral=f.candidate.text;f.now=Date.parse('2026-10-11T05:01:00Z');f.store.delivery(MID,BLUE,'DELIVERED');
    const r=await f.runtime.writeNotes({company:'fumigacion',day:'2026-10-11'});assert.equal(r.programNotesWritten,anchorDays===74?1:0,String(anchorDays));assert.equal(f.sendCalls,1);assert.equal(f.noteCalls,anchorDays===74?1:0);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM outbox').get().body),sentLiteral);if(anchorDays===74){assert.match(sentLiteral,/2 meses/);const proof=f.store.open(f.store.db.prepare("SELECT body FROM retention_delivery_ledger WHERE state='PROVEN' ORDER BY id DESC LIMIT 1").get().body).proof;assert.equal(proof.daysSinceAnchor,75);assert.equal(proof.native.text,sentLiteral);}
  }finally{f.store.close();}}
});
test('pre-send guard crossing midnight cannot send an earlier-day preparation even with current eligible source',async()=>{
  const f=fixture({enabled:true});try{f.config.mariaProgram.expiresAt=NOW+3*86400000;await f.prepare();f.now=Date.parse('2026-10-11T04:59:59Z');f.sourceAwait=async()=>{f.now=Date.parse('2026-10-11T05:00:01Z');};const r=await f.dispatch();assert.equal(r.accepted,0);assert.equal(r.results[0].reason,'RETENTION_CURRENT_DISPATCH_PLAN_REQUIRED');assert.equal(f.sendCalls,0);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,RETENTION_STAGING_STATE);}finally{f.store.close();}
});
