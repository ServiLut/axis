import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {initializeInactivityFollowup,inactivityCandidate,queueInactivityFollowups,inactivityDeliveryValid,inactivityStatus} from '../automation/service-bots/inactivity-followup.mjs';

function fixture(){
 const now=Math.floor(Date.now()/1000)*1000,sourceAt=now-21*60000;
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:now-86400000,inactivityFollowupEnabled:true,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i}))};
 config.mariaProgram={enabled:true,url:'https://own.example/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:now-86400000,expiresAt:now+2*86400000};
 const store=new Store(':memory:','fumigacion',randomBytes(32));
 const event={id:'INACTIVITY001',phone:'573001112233',line:config.lines[0].phone,at:sourceAt,kind:'text',text:'Hola, necesito una cotización',fromMe:false};
 store.enqueue(event);store.db.prepare("UPDATE events SET state='DONE',received_at=? WHERE id=?").run(sourceAt+10,event.id);
 const caseId='fumigacion:'+event.id;
 store.saveConversation(event.phone,{caseId,lastHandledSourceId:event.id,slots:{},asked:['service']});
 store.savePriorHistory(event.phone,{cutoff:config.activatedAt,priorOutgoing:false},event.id);
 const conv=store.conversation(event.phone),outId=event.id+':reply';
 store.queue(outId,event.phone,event.line,'¿Para qué plaga necesitas el servicio?',false,conv.revision,caseId);
 const out=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(outId);
 store.recordFirstBotReply(out,'BOTINACTIVITY001',config.bot,sourceAt+500);
 store.db.prepare("UPDATE outbox SET mid='BOTINACTIVITY001',state='ACCEPTED',created=?,updated=? WHERE id=?").run(sourceAt+100,sourceAt+500,outId);
 store.delivery('BOTINACTIVITY001',event.line,'DELIVERED');store.db.prepare('UPDATE outbox SET updated=? WHERE id=?').run(sourceAt+600,outId);
 const transport={currentCustomerActivity:async()=>({complete:true,sources:[{id:event.id,line:event.line,at:event.at}]}),fetcher:async(url,options)=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:config.mariaProgram.actorId,phone:body.phone,complete:true,eligibleForFollowup:true})};}};
 initializeInactivityFollowup(config,store,now);
 return {now,sourceAt,config,store,event,caseId,outId,transport};
}

test('only an open own delivered case is followed once with a missing-field question',async()=>{
 const f=fixture();try{
  const candidate=inactivityCandidate(f.config,f.store,f.event.phone,f.now);assert.ok(candidate);assert.match(candidate.text,/qué plaga/);
  assert.equal((await queueInactivityFollowups(f.store,f.config,f.transport,f.now)).queued,1);
  assert.equal((await queueInactivityFollowups(f.store,f.config,f.transport,f.now)).queued,0);
  const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(candidate.id);assert.equal(row.state,'READY');assert.equal(row.case_id,f.caseId);
  assert.equal(await inactivityDeliveryValid(f.store,f.config,f.transport,row),true);
  assert.equal(f.store.caseAuthorship(f.caseId).firstOutboxId,f.outId);
  assert.equal(f.store.caseAuthorship(f.caseId).creatorCreditWritten,false);
 }finally{f.store.close();}
});

test('a quotation expiring during the final program read prevents delivery',async()=>{
 const f=fixture();try{
  const conv=f.store.conversation(f.event.phone);f.store.saveConversation(f.event.phone,{...conv.state,quotedPrice:{accepted:false,expiresAt:Date.now()+60000}});
  assert.equal((await queueInactivityFollowups(f.store,f.config,f.transport,f.now)).queued,1);
  const row=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'inactivity:%'").get(),original=f.transport.fetcher;
  f.transport.fetcher=async(...args)=>{const response=await original(...args);const latest=f.store.conversation(f.event.phone);f.store.saveConversation(f.event.phone,{...latest.state,quotedPrice:{...latest.state.quotedPrice,expiresAt:Date.now()-1}});return response;};
  assert.equal(await inactivityDeliveryValid(f.store,f.config,f.transport,row),false);
 }finally{f.store.close();}
});

test('human attention, pending questions, after-service, documents, payment and closed records cannot be followed',()=>{
 const checks=[
  f=>f.store.hold(f.event.phone,'staff'),
  f=>f.store.saveConversation(f.event.phone,{...f.store.conversation(f.event.phone).state,awaitingHumanReview:true}),
  f=>f.store.saveConversation(f.event.phone,{...f.store.conversation(f.event.phone).state,requestedAfterServiceReview:{kind:'warranty'}}),
  f=>f.store.saveConversation(f.event.phone,{...f.store.conversation(f.event.phone).state,requestedControlReview:true}),
  f=>f.store.saveConversation(f.event.phone,{...f.store.conversation(f.event.phone).state,programIntake:{stage:'pending'}}),
  f=>f.store.saveConversation(f.event.phone,{...f.store.conversation(f.event.phone).state,programServiceId:'REAL_SAVED_SERVICE'}),
  f=>f.store.question({phone:f.event.phone,line:f.event.line,caseId:f.caseId,topic:'service-followup',conditions:{},recipient:'573233350137',text:'Revisión pendiente',source:f.event.id}),
  ...['No gracias','No','No deseo continuar','Por ahora no','Prefiero no contratar','Necesito garantía','Solicito refuerzo','Verificación del servicio','Adjunto comprobante de pago','Envíame el certificado'].map(text=>f=>f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal({...f.event,text}),f.event.id)),
 ];
 for(const check of checks){const f=fixture();try{check(f);assert.equal(inactivityCandidate(f.config,f.store,f.event.phone,f.now),null);}finally{f.store.close();}}
});

test('unread media or newer native input prevents a followup even before ingestion catches up',async()=>{
 const f=fixture();try{
  f.transport.currentCustomerActivity=async()=>({complete:true,sources:[{id:f.event.id,line:f.event.line,at:f.event.at},{id:'NATIVE_AUDIO_NEW',line:f.event.line,at:f.event.at+1000}]});
  assert.equal((await queueInactivityFollowups(f.store,f.config,f.transport,f.now)).queued,0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM inactivity_followups').get().n,0);
 }finally{f.store.close();}
});

test('a new source after queueing suppresses followup without requeueing the same case',async()=>{
 const f=fixture();try{
  await queueInactivityFollowups(f.store,f.config,f.transport,f.now);
  const row=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'inactivity:%'").get();
  f.store.enqueue({...f.event,id:'INACTIVITY002',at:f.now,text:'Cucarachas'});
  assert.equal(await inactivityDeliveryValid(f.store,f.config,f.transport,row),false);
  assert.equal((await queueInactivityFollowups(f.store,f.config,f.transport,f.now)).queued,0);
 }finally{f.store.close();}
});

test('native incomplete/error result creates no outbound and uncertain existing sends block followup',async()=>{
 const f=fixture();try{
  f.transport.currentCustomerActivity=async()=>({complete:false,sources:[]});assert.equal((await queueInactivityFollowups(f.store,f.config,f.transport,f.now)).queued,0);
  f.transport.currentCustomerActivity=async()=>{throw Error('native error');};assert.equal((await queueInactivityFollowups(f.store,f.config,f.transport,f.now+60001)).review,1);
  f.store.db.prepare("UPDATE outbox SET state='UNCERTAIN' WHERE id=?").run(f.outId);assert.equal(inactivityCandidate(f.config,f.store,f.event.phone,f.now),null);
 }finally{f.store.close();}
});

test('expiry, less than twenty minutes, historical sources and disabled mode retain a quiet prepared feature',()=>{
 const f=fixture();try{
  assert.equal(inactivityCandidate(f.config,f.store,f.event.phone,f.sourceAt+19*60000),null);
  assert.equal(inactivityCandidate(f.config,f.store,f.event.phone,f.now+86400000),null);
  const first=inactivityStatus(f.config,f.store).installation;initializeInactivityFollowup(f.config,f.store,f.now+86400000);assert.deepEqual(inactivityStatus(f.config,f.store).installation,first);
  f.config.inactivityFollowupEnabled=false;assert.equal(inactivityStatus(f.config,f.store).prepared,true);assert.equal(inactivityStatus(f.config,f.store).enabled,false);
  assert.equal(inactivityCandidate(f.config,f.store,f.event.phone,f.now),null);
 }finally{f.store.close();}
});

test('staff interventions during native reads invalidate a queued candidate',async()=>{
 const f=fixture();try{
  f.transport.currentCustomerActivity=async()=>{f.store.hold(f.event.phone,'new-staff-message');return {complete:true,sources:[{id:f.event.id,line:f.event.line,at:f.event.at}]};};
  assert.equal((await queueInactivityFollowups(f.store,f.config,f.transport,f.now)).queued,0);assert.equal(f.store.conversation(f.event.phone).hold,1);
 }finally{f.store.close();}
});

test('a courtesy after an earlier rejection does not reopen the case; media anywhere in the case stays excluded',()=>{
 for(const extra of [{text:'No gracias',kind:'text'},{text:'',kind:'audio'}]){
  const f=fixture();try{
   f.store.db.prepare('UPDATE events SET at=?,body=? WHERE id=?').run(f.event.at-1000,f.store.seal({...f.event,at:f.event.at-1000,...extra}),f.event.id);
   const next={...f.event,id:'COURTESY_AFTER01',text:'Muchas gracias'};f.store.enqueue(next);f.store.db.prepare("UPDATE events SET state='DONE',received_at=? WHERE id=?").run(f.sourceAt+10,next.id);
   f.store.saveConversation(next.phone,{...f.store.conversation(next.phone).state,lastHandledSourceId:next.id});
   f.store.db.prepare('UPDATE outbox SET revision=?').run(f.store.conversation(next.phone).revision);
   assert.equal(inactivityCandidate(f.config,f.store,next.phone,f.now),null);
  }finally{f.store.close();}
 }
});

test('expired quote or changed delivered reference is checked again after queueing',async()=>{
 const f=fixture();try{
  await queueInactivityFollowups(f.store,f.config,f.transport,f.now);const row=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'inactivity:%'").get();
  f.store.saveConversation(f.event.phone,{...f.store.conversation(f.event.phone).state,quotedPrice:{expiresAt:Date.now()-1}});
  assert.equal(await inactivityDeliveryValid(f.store,f.config,f.transport,row),false);
  f.store.saveConversation(f.event.phone,{...f.store.conversation(f.event.phone).state,quotedPrice:null});f.store.db.prepare("UPDATE outbox SET state='PRICE_REVIEW' WHERE id=?").run(f.outId);
  assert.equal(await inactivityDeliveryValid(f.store,f.config,f.transport,row),false);
 }finally{f.store.close();}
});

test('missing own program connection keeps followup prepared and sends nothing',async()=>{
 const f=fixture();try{
  f.config.mariaProgram={enabled:false};const status=inactivityStatus(f.config,f.store);assert.equal(status.prepared,true);assert.equal(status.enabled,false);assert.equal(status.programContextRequired,true);
  assert.equal((await queueInactivityFollowups(f.store,f.config,f.transport,f.now)).queued,0);
 }finally{f.store.close();}
});

test('a service registered in the program after queueing blocks the pending followup',async()=>{
 const f=fixture();try{
  await queueInactivityFollowups(f.store,f.config,f.transport,f.now);const row=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'inactivity:%'").get();assert.ok(row);
  const original=f.transport.fetcher;f.transport.fetcher=async(url,options)=>{const result=await original(url,options),body=await result.json();return {ok:true,json:async()=>({...body,eligibleForFollowup:false})};};
  assert.equal(await inactivityDeliveryValid(f.store,f.config,f.transport,row),false);
 }finally{f.store.close();}
});
