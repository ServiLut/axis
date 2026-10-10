import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Transport} from '../automation/service-bots/transport.mjs';
import {planPreventiveRetention} from '../automation/service-bots/preventive-retention.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {createRetentionDeliveryRuntime,retentionCycleKey,retentionOutboxId,retentionCaseId,RETENTION_DELIVERY_PROOF_GUARD,RETENTION_SOURCE_GUARD} from '../automation/service-bots/retention-delivery.mjs';

const NOW=Date.parse('2026-10-10T17:00:00Z'),PHONE='573000001111',OTHER='573000002222',BLUE='573126944997',RED='573126938721';
const ORDER='4a6d4007-04fa-4cab-89cb-2d9b39ba1c80',CLIENT='7ccbbfe2-6a75-424e-8b23-dc40771507d7',ACTOR='25b2e265-e463-4592-bab1-86b7b1687eae',MID='3EB0_RETENTION_TEST_ONLY';
function fixture(){
  const f={now:NOW,calls:[],sourceCalls:0};
  f.config={company:'fumigacion',name:'FUMIGACION',enabled:true,provider:'https://native.invalid',mariaProgram:{enabled:true,actorId:ACTOR},lines:[{phone:BLUE,instance:'blue-test',apiKey:'test-not-a-secret'},{phone:RED,instance:'red-test',apiKey:'test-not-a-secret'}]};
  f.store=new Store(':memory:','fumigacion',randomBytes(32));
  f.contact={phone:PHONE,identity:{kind:'PN',phone:PHONE,bindingVerified:true},name:{value:'Camila',phone:PHONE,verified:true,sourceId:'NAME'},contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true,optOutGlobal:false,doNotContact:false,humanHold:false,activeCase:false,pendingVisit:false,pendingQuotation:false,
    completedServices:[{company:'FUMIGACION',phone:PHONE,clientId:CLIENT,orderId:ORDER,sourceId:ORDER,completedAt:new Date(NOW-70*86400000).toISOString(),completedVerified:true,originLine:BLUE,originLineVerified:true}],bookingInteractions:[],futureBookings:[],rejections:[]};
  f.input={coverage:{whatsapp:{contactHistoryComplete:true,lines:[{line:BLUE,complete:true,suspended:false,connected:true},{line:RED,complete:true,suspended:false,connected:true}]},program:{company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true}},contacts:[f.contact],history:[]};
  f.plan=planPreventiveRetention({day:'2026-10-10',now:f.now,...f.input});f.candidate=f.plan.prepared[0];f.key=f.candidate.dedupKey;
  f.source=()=>({guard:RETENTION_SOURCE_GUARD,company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId:ACTOR,clientId:CLIENT,phone:PHONE,lastCompletedOrderId:ORDER,anchorAt:f.contact.completedServices[0].completedAt,anchorKind:'COMPLETED_SERVICE',canonicalRecipientUniqueVerified:true,checkedAt:new Date(f.now).toISOString(),plannerInput:structuredClone(f.input)});
  f.loadEligibility=async()=>{f.sourceCalls++;if(f.sourceAwait)await f.sourceAwait();return {...f.source(),...f.sourcePatch};};
  f.native=()=>({key:{id:MID,remoteJid:PHONE+'@s.whatsapp.net',fromMe:true},messageTimestamp:Math.floor((NOW+1000)/1000),message:{conversation:f.candidate.text},status:'DELIVERY_ACK',MessageUpdate:[]});
  f.fetcher=async(url,options)=>{f.calls.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});if(f.fetchOverride)return f.fetchOverride(url,options);
    return {ok:true,json:async()=>url.includes('/instance/fetchInstances')?[{name:'blue-test',ownerJid:BLUE+'@s.whatsapp.net',connectionStatus:'open'}]:{messages:{total:1,records:[{...f.native(),...f.nativePatch}]}}};};
  f.transport=new Transport(f.config,f.fetcher);f.runtime=createRetentionDeliveryRuntime(f.config,f.store,f.transport,{loadEligibility:f.loadEligibility,now:()=>f.now});
  f.store.db.prepare('INSERT INTO conversations(phone,line,revision,hold,body) VALUES(?,?,1,0,?)').run(PHONE,BLUE,f.store.seal({caseId:retentionCaseId(f.key),slots:{},asked:[]}));
  f.store.queue(retentionOutboxId(f.key),PHONE,BLUE,f.candidate.text,false,1,retentionCaseId(f.key));
  f.store.db.prepare('UPDATE outbox SET created=?,updated=? WHERE id=?').run(NOW,NOW,retentionOutboxId(f.key));
  f.prepare=()=>f.runtime.prepareCycle(f.plan,f.candidate);
  f.delivered=(state='DELIVERED')=>{f.now=NOW+2000;f.store.db.prepare('UPDATE outbox SET state=?,mid=?,updated=? WHERE id=?').run(state,MID,f.now,retentionOutboxId(f.key));};
  f.proof=()=>f.runtime.deliveryProof({company:'fumigacion',key:f.key});
  return f;
}

test('approved cycle is encrypted, bound to existing own outbox, durable and idempotent without queue or send',async()=>{
  const f=fixture();try{const before=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,p=await f.prepare();assert.equal(p.state,'PREPARED');assert.equal(p.cycleKey,retentionCycleKey(PHONE,ORDER));assert.equal(p.sends,0);
    const raw=f.store.db.prepare('SELECT body FROM retention_cycles').get().body;assert.doesNotMatch(raw,new RegExp(PHONE+'|'+CLIENT+'|Camila'));assert.equal(f.store.open(raw).outboxId,retentionOutboxId(f.key));
    f.now+=1000;assert.equal((await f.prepare()).duplicate,true);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,before);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM retention_delivery_ledger').get().n,1);assert.equal(f.calls.length,0);
    const restarted=createRetentionDeliveryRuntime(f.config,f.store,f.transport,{loadEligibility:f.loadEligibility,now:()=>f.now});assert.equal(restarted.status().states.PREPARED,1);assert.equal(restarted.status().sendingEnabled,false);assert.equal(restarted.status().notesEnabled,false);
  }finally{f.store.close();}
});
test('without the trusted internal source reader no cycle or proof is authorized and runtime stays enabled',async()=>{
  const f=fixture();try{const offline=createRetentionDeliveryRuntime(f.config,f.store,f.transport,{now:()=>f.now});assert.equal(offline.status().eligibilityAdapterConnected,false);await assert.rejects(offline.prepareCycle(f.plan,f.candidate),/ELIGIBILITY_ADAPTER_REQUIRED/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM retention_cycles').get().n,0);
    await f.prepare();f.delivered();const r=await offline.deliveryProof({company:'fumigacion',key:f.key});assert.equal(r.eligible,false);assert.equal(r.reason,'RETENTION_ELIGIBILITY_ADAPTER_REQUIRED');assert.equal(f.config.enabled,true);assert.equal(f.calls.length,0);
  }finally{f.store.close();}
});
test('proof accepts only an opaque own cycle key; HTTP delivery and eligibility claims have no authority',async()=>{
  const f=fixture();try{await f.prepare();f.delivered();for(const body of [{company:'servicio-tecnico',key:f.key},{company:'fumigacion',key:f.key,delivery:'READ'},{company:'fumigacion',key:f.key,eligible:true},{company:'fumigacion',key:'random'}]){const r=await f.runtime.deliveryProof(body);assert.equal(r.eligible,false);assert.equal(r.reason,'RETENTION_PROOF_KEY_ONLY_REQUIRED');}
    const other=retentionCycleKey(OTHER,ORDER);assert.equal((await f.runtime.deliveryProof({company:'fumigacion',key:other})).reason,'RETENTION_OWN_CYCLE_NOT_FOUND');assert.equal(f.calls.length,0);
  }finally{f.store.close();}
});
test('fresh own owner/MID/PN/text/ACK proof returns exact backend DTO and never invents delivery timestamp',async()=>{
  const f=fixture();try{await f.prepare();f.delivered();const r=await f.proof();assert.equal(r.guard,RETENTION_DELIVERY_PROOF_GUARD);assert.equal(r.eligible,true);assert.equal(r.clientId,CLIENT);assert.equal(r.actorId,ACTOR);assert.equal(r.lastCompletedOrderId,ORDER);assert.equal(r.anchorKind,'COMPLETED_SERVICE');assert.equal(r.daysSinceAnchor,70);
    assert.equal(r.native.delivery,'DELIVERED');assert.equal(r.native.deliveredAt,null);assert.equal(r.native.fromMe,true);assert.equal(r.native.recipientPhone,PHONE);assert.equal(r.native.sourceLine,BLUE);assert.equal(r.native.textHash,f.candidate.textHash);assert.equal(r.checkedAt,r.native.checkedAt);assert.ok(Object.values(r.wholeSourceEligibility).every(v=>v===true));assert.equal(f.runtime.status().states.PROVEN,1);
    assert.equal(f.calls.length,2);assert.match(f.calls[0].url,/fetchInstances/);assert.equal(f.calls[0].method,'GET');assert.match(f.calls[1].url,/findMessages\/blue-test$/);assert.deepEqual(f.calls[1].body.where,{key:{id:MID}});assert.ok(f.calls.every(c=>!c.url.includes('/send')));
    f.nativePatch={status:'READ'};f.now+=1000;assert.equal((await f.proof()).native.delivery,'READ');assert.equal(f.calls.length,4,'each explicit proof performs a new native read');
  }finally{f.store.close();}
});
test('LID has identity only with exact native alternate PN; contradictory PN and group addresses fail closed',async()=>{
  for(const [key,accepted] of [[{id:MID,remoteJid:'123456@lid',remoteJidAlt:PHONE+'@s.whatsapp.net',fromMe:true},true],[{id:MID,remoteJid:OTHER+'@s.whatsapp.net',remoteJidAlt:PHONE+'@s.whatsapp.net',fromMe:true},false],[{id:MID,remoteJid:'123456@g.us',remoteJidAlt:PHONE+'@s.whatsapp.net',fromMe:true},false],[{id:MID,remoteJid:'123456@lid',fromMe:true},false]]){
    const f=fixture();try{await f.prepare();f.delivered();f.nativePatch={key};assert.equal((await f.proof()).eligible,accepted);}finally{f.store.close();}
  }
});
test('accepted, done, failed and uncertain local outcomes remain pending with no native query or resend',async()=>{
  for(const state of ['READY','ACCEPTED','DONE','FAILED','UNCERTAIN','SENDING']){const f=fixture();try{await f.prepare();f.delivered(state);const r=await f.proof();assert.equal(r.eligible,false);assert.equal(r.reason,'RETENTION_LOCAL_DELIVERY_PENDING');assert.equal(f.calls.length,0);assert.equal(f.runtime.status().states.PROOF_PENDING,1);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,state);}finally{f.store.close();}}
});
test('holds, changed cases/revisions, pending customer turn and other outbox work stop proof before native traffic',async()=>{
  for(const kind of ['hold','case','revision','customer','other-outbox']){const f=fixture();try{await f.prepare();f.delivered();if(kind==='hold')f.store.hold(PHONE,'staff',true);if(kind==='case')f.store.saveConversation(PHONE,{caseId:'fumigacion:other'});if(kind==='revision')f.store.db.prepare('UPDATE conversations SET revision=2 WHERE phone=?').run(PHONE);if(kind==='customer')f.store.enqueue({id:'NEW_CUSTOMER',phone:PHONE,line:BLUE,fromMe:false,at:f.now,kind:'text',text:'No me contacten'});if(kind==='other-outbox')f.store.queue('OTHER_REPLY',PHONE,BLUE,'Otro mensaje',false,1,retentionCaseId(f.key));
    assert.equal((await f.proof()).eligible,false);assert.equal(f.calls.length,0);
  }finally{f.store.close();}}
});
test('outbox identity, case, line and literal text association are required on preparation and again on proof',async()=>{
  for(const mutation of [s=>s.db.prepare('UPDATE outbox SET phone=?').run(OTHER),s=>s.db.prepare('UPDATE outbox SET line=?').run(RED),s=>s.db.prepare('UPDATE outbox SET internal=1').run(),s=>s.db.prepare('UPDATE outbox SET case_id=?').run('other'),s=>s.db.prepare('UPDATE outbox SET body=?').run(s.seal('Texto cambiado'))]){
    const f=fixture();try{mutation(f.store);await assert.rejects(f.prepare(),/OWN_OUTBOX_ASSOCIATION_REQUIRED/);assert.equal(f.calls.length,0);}finally{f.store.close();}
  }
  const f=fixture();try{await f.prepare();f.delivered();f.store.db.prepare('UPDATE outbox SET body=?').run(f.store.seal('Texto cambiado'));assert.equal((await f.proof()).eligible,false);assert.equal(f.calls.length,0);}finally{f.store.close();}
});
test('own current source is reloaded; recent booking, future order, rejection and incomplete history prevent proof',async()=>{
  for(const kind of ['recent','future','refusal','incomplete','foreign','stale','future-proof','ambiguous']){const f=fixture();try{await f.prepare();f.delivered();if(kind==='recent')f.contact.bookingInteractions.push({phone:PHONE,line:BLUE,sourceId:'RECENT_BOOKING',at:new Date(f.now-86400000).toISOString(),nativeBindingVerified:true,fromMe:false,kind:'booking-request'});if(kind==='future')f.contact.futureBookings.push({phone:PHONE,company:'FUMIGACION',scopeVerified:true,scheduledAt:new Date(f.now+86400000).toISOString(),state:'PROGRAMADO',cancelled:false});if(kind==='refusal')f.contact.doNotContact=true;if(kind==='incomplete')f.input.coverage.whatsapp.lines[1].complete=false;if(kind==='foreign')f.sourcePatch={companyId:'OTHER'};if(kind==='stale')f.sourcePatch={checkedAt:new Date(f.now-120001).toISOString()};if(kind==='future-proof')f.sourcePatch={checkedAt:new Date(f.now+1).toISOString()};if(kind==='ambiguous')f.sourcePatch={canonicalRecipientUniqueVerified:false};
    assert.equal((await f.proof()).eligible,false,kind);assert.equal(f.calls.length,0,kind);
  }finally{f.store.close();}}
});
test('native read rejects wrong owner, MID, direction, text, edited body, ACK-less state and incomplete lookup',async()=>{
  for(const kind of ['owner','mid','direction','text','edit','ack','time','total']){const f=fixture();try{await f.prepare();f.delivered();if(kind==='owner')f.fetchOverride=async()=>({ok:true,json:async()=>[{name:'blue-test',ownerJid:RED+'@s.whatsapp.net',connectionStatus:'open'}]});if(kind==='mid')f.nativePatch={key:{...f.native().key,id:'OTHER_MID'}};if(kind==='direction')f.nativePatch={key:{...f.native().key,fromMe:false}};if(kind==='text')f.nativePatch={message:{conversation:'Texto no enviado'}};if(kind==='edit')f.nativePatch={MessageUpdate:[{status:'EDITED'}]};if(kind==='ack')f.nativePatch={status:'SERVER_ACK'};if(kind==='time')f.nativePatch={messageTimestamp:Math.floor((f.now+1000)/1000)};if(kind==='total')f.fetchOverride=async url=>({ok:true,json:async()=>url.includes('fetchInstances')?[{name:'blue-test',ownerJid:BLUE+'@s.whatsapp.net',connectionStatus:'open'}]:{messages:{total:2,records:[f.native()]}}});
    assert.equal((await f.proof()).eligible,false,kind);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'DELIVERED');
  }finally{f.store.close();}}
});
test('freshness and local source changes during awaits are checked again before publishing proof',async()=>{
  for(const kind of ['slow','staff']){const f=fixture();try{await f.prepare();f.delivered();f.fetchOverride=async url=>{if(url.includes('fetchInstances'))return {ok:true,json:async()=>[{name:'blue-test',ownerJid:BLUE+'@s.whatsapp.net',connectionStatus:'open'}]};if(kind==='slow')f.now+=120001;else f.store.hold(PHONE,'NEW_STAFF',true);return {ok:true,json:async()=>({messages:{total:1,records:[f.native()]}})};};assert.equal((await f.proof()).eligible,false);}finally{f.store.close();}}
});
test('network uncertainty records a bounded private ledger reason without credentials, automatic retries or outbox mutations',async()=>{
  const f=fixture();try{await f.prepare();f.delivered();f.fetchOverride=async()=>{throw Error('https://native.invalid/?apikey=do-not-persist-token');};const r=await f.proof();assert.equal(r.reason,'RETENTION_RECHECK_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(r),/native.invalid|apikey|persist-token/);assert.equal(f.calls.length,1);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'DELIVERED');const last=f.store.db.prepare('SELECT reason,body FROM retention_delivery_ledger ORDER BY id DESC LIMIT 1').get();assert.doesNotMatch(JSON.stringify(f.store.open(last.body)),/apikey|persist-token/);assert.equal(last.reason,r.reason);assert.equal(f.runtime.status().automaticRetriesEnabled,false);}finally{f.store.close();}
});
test('booking-only anchors and cross-company stores cannot create a service-completion proof cycle',async()=>{
  const f=fixture();try{const candidate={...f.candidate,sourceAnchorKind:'booking-interaction'};await assert.rejects(f.runtime.prepareCycle({...f.plan,prepared:[candidate]},candidate),/APPROVED_PLAN_REQUIRED/);const other=new Store(':memory:','servicio-tecnico',randomBytes(32));try{assert.throws(()=>createRetentionDeliveryRuntime(f.config,other,f.transport),/OWN_RUNTIME_SCOPE/);}finally{other.close();}assert.equal(f.calls.length,0);}finally{f.store.close();}
});
test('extra candidate claims cannot be persisted even when embedded in an apparently approved HTTP-shaped plan',async()=>{
  const f=fixture();try{const candidate={...f.candidate,unrelatedSecret:'do-not-store'};await assert.rejects(f.runtime.prepareCycle({...f.plan,prepared:[candidate]},candidate),/APPROVED_PLAN_REQUIRED/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM retention_cycles').get().n,0);assert.equal(f.calls.length,0);}finally{f.store.close();}
});
test('creation preserves every same-key prior attempt when no durable local cycle exists',async()=>{
  for(const state of ['READY','FAILED','UNCERTAIN','ACCEPTED','DELIVERED','READ']){const f=fixture();try{
    f.input.history.push({company:'fumigacion',phone:PHONE,dedupKey:f.key,sourceAnchorId:ORDER,state,mid:'PRIOR_OTHER_NATIVE_MID',outboxId:retentionOutboxId(f.key),caseId:retentionCaseId(f.key),line:BLUE});
    await assert.rejects(f.prepare(),/CURRENT_ELIGIBILITY_NOT_VERIFIED/,state);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM retention_cycles').get().n,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM retention_delivery_ledger').get().n,0);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'READY');assert.equal(f.calls.length,0);
  }finally{f.store.close();}}
});
test('proof omits only one unambiguously associated delivered attempt of the exact existing local cycle',async()=>{
  const own=f=>({company:'fumigacion',phone:PHONE,dedupKey:f.key,sourceAnchorId:ORDER,state:'DELIVERED',mid:MID,outboxId:retentionOutboxId(f.key),caseId:retentionCaseId(f.key),line:BLUE});
  const good=fixture();try{await good.prepare();good.delivered();good.input.history.push(own(good));assert.equal((await good.proof()).eligible,true);}finally{good.store.close();}
  for(const kind of ['missing-outbox','other-mid','other-case','uncertain','accepted','extra-uncertain','duplicate']){const f=fixture();try{await f.prepare();f.delivered();const h=own(f);if(kind==='missing-outbox')delete h.outboxId;if(kind==='other-mid')h.mid='PRIOR_OTHER_NATIVE_MID';if(kind==='other-case')h.caseId='other-case';if(kind==='uncertain')h.state='UNCERTAIN';if(kind==='accepted')h.state='ACCEPTED';f.input.history.push(h);if(kind==='extra-uncertain')f.input.history.push({...h,state:'UNCERTAIN',mid:'OTHER_UNCERTAIN'});if(kind==='duplicate')f.input.history.push({...h});const proof=await f.proof();assert.equal(proof.eligible,false,kind);assert.equal(proof.reason,'RETENTION_CURRENT_ELIGIBILITY_NOT_VERIFIED');assert.equal(f.calls.length,0);assert.equal(f.runtime.status().states.PROOF_PENDING,1);
  }finally{f.store.close();}}
});
test('ACK update metadata must preserve the exact MID, outgoing direction, recipient and source line',async()=>{
  for(const update of [{key:{id:MID,remoteJid:OTHER+'@s.whatsapp.net',fromMe:false}},{key:{id:MID,remoteJid:OTHER+'@s.whatsapp.net',fromMe:true}},{key:{id:MID,participant:OTHER+'@s.whatsapp.net'}},{key:{id:MID,participantAlt:OTHER+'@s.whatsapp.net'}},{key:{id:MID,fromMe:false}},{fromMe:false},{remoteJid:OTHER+'@s.whatsapp.net'},{key:{id:MID,remoteJid:'another@g.us'}},{key:{id:MID},sourceLine:RED}]){const f=fixture();try{await f.prepare();f.delivered();f.nativePatch={status:'SERVER_ACK',MessageUpdate:[{...update,status:'READ'}]};const proof=await f.proof();assert.equal(proof.eligible,false);assert.equal(proof.reason,'RETENTION_NATIVE_DELIVERY_REQUIRED');}finally{f.store.close();}}
  const good=fixture();try{await good.prepare();good.delivered();good.nativePatch={status:'SERVER_ACK',MessageUpdate:[{key:{id:MID,remoteJid:PHONE+'@s.whatsapp.net',fromMe:true},status:'READ'}]};assert.equal((await good.proof()).native.delivery,'READ');}finally{good.store.close();}
});
test('reader-produced checkedAt during an await is compared to the post-read clock on preparation and proof',async()=>{
  const f=fixture();try{f.sourceAwait=async()=>{await Promise.resolve();f.now+=500;};await f.prepare();assert.equal(f.runtime.status().states.PREPARED,1);f.delivered();const proof=await f.proof();assert.equal(proof.eligible,true);assert.equal(proof.checkedAt,new Date(f.now).toISOString());assert.equal(proof.native.checkedAt,proof.checkedAt);}finally{f.store.close();}
});
test('a genuinely future checkedAt remains invalid after the await, and eligibility expiring before publication stays pending',async()=>{
  const f=fixture();try{f.sourceAwait=async()=>{f.now+=500;};f.sourcePatch={checkedAt:new Date(NOW+1000).toISOString()};await assert.rejects(f.prepare(),/FRESH_OWN_SOURCE_REQUIRED/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM retention_cycles').get().n,0);}finally{f.store.close();}
  const old=fixture();try{await old.prepare();old.delivered();old.sourceAwait=async()=>{old.now+=120001;};const proof=await old.proof();assert.equal(proof.eligible,false);assert.equal(proof.reason,'RETENTION_PROOF_RECHECK_CHANGED');}finally{old.store.close();}
});
