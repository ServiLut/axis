import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,OPERATOR_ROUTING,DIEGO,HILARY,TECHNICAL_COORDINATOR} from '../automation/service-bots/config.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {drain,flushOutbox,Transport} from '../automation/service-bots/transport.mjs';
import {createDrainScheduler,createBotServer} from '../automation/service-bots/server.mjs';
import {initializeInactivityFollowup,recordResponseTiming,recordDeliveryTiming,responseTimingStatus} from '../automation/service-bots/inactivity-followup.mjs';

function fixture(){const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,responseTargetMs:3000,activatedAt:Date.now()-86400000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i}))};const store=new Store(':memory:','fumigacion',randomBytes(32));return {config,store,engine:new Engine(store,config)};}
const event=(f,id,phone='573001112233',at=Date.now())=>({id,phone,at,line:f.config.lines[0].phone,fromMe:false,kind:'text',text:'Hola'});

test('verified wake is nonblocking, does not overlap drains and remains durable when another source arrives',async()=>{
 const f=fixture(),callbacks=[];let interval,started=0,finish;
 const scheduler=createDrainScheduler(f.config,f.store,async()=>{started++;await new Promise(resolve=>{finish=resolve;});return {processed:0};},{setImmediateFn:cb=>callbacks.push(cb),setIntervalFn:(cb,ms)=>{interval={cb,ms};return {};},clearIntervalFn:()=>{}});
 try{
  scheduler.wake();assert.equal(started,0);assert.equal(callbacks.length,1);assert.equal(interval.ms,1000);
  callbacks.shift()();await Promise.resolve();assert.equal(started,1);
  scheduler.wake();scheduler.wake();assert.equal(started,1);assert.equal(callbacks.length,0);assert.ok(f.store.db.prepare("SELECT 1 FROM meta WHERE key='verified-ingestion-drain-wake-v1'").get());
  finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(callbacks.length,1);callbacks.shift()();await Promise.resolve();assert.equal(started,2);finish();await new Promise(resolve=>setImmediate(resolve));
 }finally{scheduler.close();f.store.close();}
});

test('Miguel retains a ten-second timer and no immediate wake',()=>{
 const f=fixture(),calls=[];f.config.company='servicio-tecnico';
 const scheduler=createDrainScheduler(f.config,f.store,async()=>{}, {setImmediateFn:cb=>calls.push(cb),setIntervalFn:(cb,ms)=>{assert.equal(ms,10000);return {};},clearIntervalFn:()=>{}});
 try{scheduler.wake();assert.equal(calls.length,0);assert.equal(scheduler.intervalMs,10000);}finally{scheduler.close();f.store.close();}
});

test('María sends an already ready response before another model request and keeps approved deterministic wording',async()=>{
 const f=fixture(),order=[];try{
  const old=event(f,'LATENCY001');f.store.enqueue(old);await f.engine.process(old);
  f.store.enqueue(event(f,'LATENCY002','573004445566'));
  const result=await drain(f.store,f.config,{verifyLine:async()=>{},understand:async()=>{order.push('understand');return {};},composeReply:async()=>{throw Error('wording model must not run');},send:async(row,text)=>{order.push('send:'+row.phone);assert.ok(text.includes('María Ángel'));return 'BOT_'+row.phone;}},f.engine);
  assert.equal(order[0],'send:573001112233');assert.equal(order[1],'understand');assert.equal(result.processed,1);assert.equal(result.accepted,2);
 }finally{f.store.close();}
});

test('superseded and held sources do not consume an understanding call',async()=>{
 const f=fixture();try{
  const at=Date.now();f.store.enqueue(event(f,'SUPERSEDED001','573001112233',at));f.store.enqueue(event(f,'SUPERSEDED002','573001112233',at+1));
  let analyses=0;const t={verifyLine:async()=>{},understand:async()=>{analyses++;return {};},send:async()=> 'BOT_SUPERSEDED'};
  await drain(f.store,f.config,t,f.engine);assert.equal(analyses,0);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get('SUPERSEDED001').state,'OBSERVED_SUPERSEDED');
  f.store.hold('573001112233','staff');await drain(f.store,f.config,t,f.engine);assert.equal(analyses,0);
 }finally{f.store.close();}
});

test('literal registration fields skip the model while a returned registered case can understand a later concern without personal context',async()=>{
 for(const stage of ['name','address','confirm','correction','pending','registered']){
  const f=fixture();try{
   const e={...event(f,'REGISTRATION_STAGE_'+stage),text:'Solicito que revisen porque la intervención anterior no quedó bien'};
   f.store.enqueue(e);f.store.saveConversation(e.phone,{caseId:'fumigacion:ORIGINAL',slots:{service:'cucarachas'},asked:['preference'],lastText:'Calle 50 # 42-18',programIntake:{stage,customerName:'Juan Pérez',address:'Calle 50 # 42-18'}});
   let calls=0;const t={verifyLine:async()=>{},understand:async(input,context)=>{calls++;assert.equal(context.programIntake,undefined);assert.equal(context.lastText,null);assert.equal(context.conversationHistory,undefined);return {};},send:async()=> 'BOT_RETURNED_CASE'};
   await drain(f.store,f.config,t,f.engine);assert.equal(calls,stage==='registered'?1:0);
  }finally{f.store.close();}
 }
});

test('source receipt, queue, accepted and delivery acknowledgements remain distinct durable measurements',()=>{
 const f=fixture();try{
  initializeInactivityFollowup(f.config,f.store);const e=event(f,'TIMING_SOURCE01');f.store.enqueue(e);f.store.db.prepare('UPDATE events SET at=1000,received_at=1200 WHERE id=?').run(e.id);
  f.store.queue(e.id+':reply',e.phone,e.line,'¿Qué plaga necesitas tratar?',false,1);f.store.db.prepare("UPDATE outbox SET created=1500,mid='TIMING_BOT_01',state='ACCEPTED' WHERE id=?").run(e.id+':reply');
  const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');recordResponseTiming(f.store,row,1900);
  let report=responseTimingStatus(f.config,f.store);assert.equal(report.recent[0].receiptToAcceptedMs,700);assert.equal(report.recent[0].deliveryAckObservedAt,null);assert.equal(report.underTarget,1);
  recordDeliveryTiming(f.store,'TIMING_BOT_01',e.line,'DELIVERED',2400);recordDeliveryTiming(f.store,'TIMING_BOT_01',e.line,'READ',2600);
  report=responseTimingStatus(f.config,f.store);assert.equal(report.recent[0].deliveryAckObservedAt,2400);assert.equal(report.recent[0].readAckObservedAt,2600);assert.equal(report.recent[0].acceptedAt,1900);assert.equal(report.deliveryIsDistinctFromAcceptance,true);
  recordDeliveryTiming(f.store,'TIMING_BOT_01',f.config.lines[1].phone,'READ',2700);assert.equal(responseTimingStatus(f.config,f.store).recent[0].readAckObservedAt,2600);
 }finally{f.store.close();}
});

test('HTTP receipt measurement includes owner verification time and duplicate ingestion preserves the first receipt',async()=>{
 const f=fixture();delete f.config.responseTargetMs;
 const token=randomBytes(32).toString('base64url');f.config.webhookHash=createHash('sha256').update(token).digest('hex');f.config.authHash=createHash('sha256').update('separate-administration').digest('hex');
 let checkStarted,checkCompleted;
 const server=createBotServer(f.config,f.store,{verifyLine:async()=>{checkStarted=Date.now();await new Promise(resolve=>setTimeout(resolve,30));checkCompleted=Date.now();}},f.engine);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const e=event(f,'HTTP_LATENCY01');const body={instance:f.config.lines[0].instance,owner:e.line,event:{...e,at:new Date(e.at).toISOString()}};
  const options={method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)};
  assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/event',options)).status,202);
  const first=f.store.db.prepare('SELECT received_at FROM events WHERE id=?').get(e.id).received_at;
  assert.ok(first<=checkStarted);assert.ok(first<checkCompleted);
  await fetch('http://127.0.0.1:'+server.address().port+'/event',options);
  assert.equal(f.store.db.prepare('SELECT received_at FROM events WHERE id=?').get(e.id).received_at,first);
 }finally{await new Promise(resolve=>server.close(resolve));f.store.close();}
});

test('a saved program response is measured from the actual confirming source, while reminders are not fresh-response SLA samples',()=>{
 const f=fixture();try{
  initializeInactivityFollowup(f.config,f.store);const e=event(f,'PROGRAM_CONFIRM01');f.store.enqueue(e);
  const caseId='fumigacion:FIRST_SOURCE';f.store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('maria-registration:'+caseId,f.store.seal({payload:{sourceId:e.id},status:'SAVED'}));
  f.store.queue('program:'+caseId+':saved',e.phone,e.line,'Tu solicitud quedó registrada.',false,1,caseId);
  const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('program:'+caseId+':saved');recordResponseTiming(f.store,row,Date.now());
  assert.equal(responseTimingStatus(f.config,f.store).recent[0].eventId,e.id);
  f.store.queue('inactivity:own:case',e.phone,e.line,'¿Deseas continuar?',false,1,caseId);recordResponseTiming(f.store,f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('inactivity:own:case'),Date.now());
  assert.equal(responseTimingStatus(f.config,f.store).measuredSamples,1);
 }finally{f.store.close();}
});

function nativeTransportFixture(f,{wrongOwner=null,incomplete=false}={}){
 initializeInactivityFollowup(f.config,f.store);
 f.config.provider='https://own-provider.example';f.config.lines.forEach((line,i)=>{line.apiKey='isolated-provider-fixture-'+i;});
 const owners=new Map(),reads=[];let sends=0;
 const transport=new Transport(f.config,async(url,options)=>{
  const endpoint=new URL(url);
  if(endpoint.pathname==='/instance/fetchInstances'){
   const line=f.config.lines.find(l=>l.instance===endpoint.searchParams.get('instanceName'));assert.ok(line);assert.equal(options.headers.apikey,line.apiKey);
   owners.set(line.phone,(owners.get(line.phone)||0)+1);
   return {ok:true,json:async()=>[{name:line.instance,ownerJid:(wrongOwner===line.phone?'573009998877':line.phone)+'@s.whatsapp.net',connectionStatus:'open'}]};
  }
  if(endpoint.pathname.startsWith('/chat/findMessages/')){
   const line=f.config.lines.find(l=>endpoint.pathname.endsWith('/'+l.instance));assert.ok(line);assert.equal(options.headers.apikey,line.apiKey);
   const body=JSON.parse(options.body);assert.equal(body.where.key.fromMe,true);assert.equal(body.offset,50);reads.push({line:line.phone,key:body.where.key});
   return {ok:true,json:async()=>({messages:{total:incomplete?1:0,records:[]}})};
  }
  if(endpoint.pathname.startsWith('/message/sendText/')){sends++;return {ok:true,json:async()=>({key:{id:'ISOLATED_NATIVE_GUARD_MID'}})};}
  throw Error('Unexpected isolated provider endpoint');
 });
 return {transport,owners,reads,get sends(){return sends;}};
}

test('real native attention verifies both owners once and both aliases without a redundant outgoing owner request',async()=>{
 const f=fixture();try{
  const e=event(f,'NATIVE_OWNER_SINGLE01');f.store.enqueue(e);await f.engine.process(e);f.config.historyCheckRequired=true;
  const native=nativeTransportFixture(f),result=await flushOutbox(f.store,f.config,native.transport);
  assert.equal(result.accepted,1);assert.equal(native.sends,1);
  assert.equal(native.owners.get(f.config.lines[0].phone),1);assert.equal(native.owners.get(f.config.lines[1].phone),1);
  assert.equal(native.reads.length,4);
  for(const line of f.config.lines)for(const field of ['remoteJid','remoteJidAlt'])assert.ok(native.reads.some(read=>read.line===line.phone&&read.key[field]===e.phone+'@s.whatsapp.net'));
 }finally{f.store.close();}
});

test('real provider owner mismatch or incomplete native coverage fails closed before an external send',async()=>{
 for(const failure of ['first-owner','other-owner','coverage']){
  const f=fixture();try{
   const e=event(f,'NATIVE_OWNER_FAIL_'+failure);f.store.enqueue(e);await f.engine.process(e);f.config.historyCheckRequired=true;
   const native=nativeTransportFixture(f,{wrongOwner:failure==='first-owner'?f.config.lines[0].phone:failure==='other-owner'?f.config.lines[1].phone:null,incomplete:failure==='coverage'});
   const result=await flushOutbox(f.store,f.config,native.transport);
   assert.equal(native.sends,0);assert.equal(result.accepted,0);assert.equal(result.suppressed,1);
   assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(e.id+':reply').state,'ATTENTION_REVIEW');assert.equal(f.store.conversation(e.phone).hold,1);
   assert.equal(native.owners.get(f.config.lines[0].phone),1);
   if(failure==='other-owner')assert.equal(native.owners.get(f.config.lines[1].phone),1);
  }finally{f.store.close();}
 }
});

test('internal replies and external routes without native attention retain the original real owner check',async()=>{
 for(const internal of [true,false]){
  const f=fixture();try{
   f.config.historyCheckRequired=internal;
   if(internal)f.store.queue('INTERNAL_OWNER_SINGLE01','573016803926',f.config.lines[0].phone,'Estado verificado.',true,0);
   else{const e=event(f,'EXTERNAL_OWNER_SINGLE01');f.store.enqueue(e);await f.engine.process(e);}
   const native=nativeTransportFixture(f),result=await flushOutbox(f.store,f.config,native.transport);
   assert.equal(result.accepted,1);assert.equal(native.sends,1);assert.equal(native.owners.get(f.config.lines[0].phone),1);assert.equal(native.owners.has(f.config.lines[1].phone),false);assert.equal(native.reads.length,0);
  }finally{f.store.close();}
 }
});

function operatorDeliveryFixture(company='fumigacion',routing=CURRENT_OPERATOR_ROUTING){
 const config={company,...BUSINESSES[company],enabled:true,chiefOnly:true,operatorRouting:routing,activatedAt:Date.now()-86400000,provider:'https://isolated-provider.example',lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'isolated-own-'+i,apiKey:'isolated-own-key-'+i}))};
 const store=new Store(':memory:',company,randomBytes(32));let ownerChecks=0,sends=0;const recipients=[];
 const transport=new Transport(config,async(url,options)=>{
  const endpoint=new URL(url);
  if(endpoint.pathname==='/instance/fetchInstances'){
   ownerChecks++;const line=config.lines.find(l=>l.instance===endpoint.searchParams.get('instanceName'));assert.ok(line);assert.equal(options.headers.apikey,line.apiKey);
   return {ok:true,json:async()=>[{name:line.instance,ownerJid:line.phone+'@s.whatsapp.net',connectionStatus:'open'}]};
  }
  if(endpoint.pathname.startsWith('/message/sendText/')){sends++;recipients.push(JSON.parse(options.body).number);return {ok:true,json:async()=>({key:{id:'ISOLATED_OPERATOR_MID_'+sends}})};}
  throw Error('Unexpected isolated provider endpoint');
 });
 return {config,store,transport,recipients,get ownerChecks(){return ownerChecks;},get sends(){return sends;}};
}

test('current routing retires recent and older READY questions to Diego before any owner lookup or delivery',async()=>{
 for(const company of ['fumigacion','servicio-tecnico']){
  const f=operatorDeliveryFixture(company);try{
   const originals=[];
   for(const [i,age] of [0,9*60000].entries()){
    const question=f.store.question({phone:'573001112233',line:f.config.lines[0].phone,caseId:'ISOLATED_CASE_'+i,topic:'disponibilidad-y-tecnico',conditions:{case:i},recipient:DIEGO,text:'Pregunta original '+i,source:'ISOLATED_SOURCE_'+i});
    const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=(SELECT outbox_id FROM questions WHERE id=?)').get(question.id);assert.ok(row);
    f.store.db.prepare('UPDATE outbox SET created=? WHERE id=?').run(Date.now()-age,row.id);originals.push({id:row.id,body:row.body,caseId:row.case_id,questionId:question.id});
   }
   const result=await flushOutbox(f.store,f.config,f.transport);assert.equal(result.suppressed,2);assert.equal(result.accepted,0);assert.equal(f.ownerChecks,0);assert.equal(f.sends,0);
   for(const original of originals){
    const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(original.id);assert.equal(row.state,'RECIPIENT_RETIRED_REVIEW');assert.equal(row.phone,DIEGO);assert.equal(row.body,original.body);assert.equal(row.case_id,original.caseId);assert.equal(row.mid,null);
    const question=f.store.db.prepare('SELECT recipient,state,outbox_id FROM questions WHERE id=?').get(original.questionId);assert.equal(question.recipient,DIEGO);assert.equal(question.state,'PENDING');assert.equal(question.outbox_id,original.id);
    const audit=f.store.db.prepare("SELECT detail FROM audit WHERE action='INTERNAL_RECIPIENT_RETIRED_BEFORE_SEND' AND source=?").get(original.id);assert.ok(audit);assert.equal(f.store.open(audit.detail).attemptedSend,false);assert.equal(f.store.open(audit.detail).redirected,false);
   }
   assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,2);await flushOutbox(f.store,f.config,f.transport);assert.equal(f.sends,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='INTERNAL_RECIPIENT_RETIRED_BEFORE_SEND'").get().n,2);
  }finally{f.store.close();}
 }
});

test('delivered, read and uncertain historical Diego outcomes remain byte-for-byte unchanged',async()=>{
 const f=operatorDeliveryFixture();try{
  for(const state of ['DELIVERED','READ','UNCERTAIN']){const id='ISOLATED_HISTORICAL_'+state;f.store.queue(id,DIEGO,f.config.lines[0].phone,'Texto histórico '+state,true,0,'ISOLATED_HISTORICAL_CASE');f.store.db.prepare('UPDATE outbox SET state=?,mid=?,updated=1000 WHERE id=?').run(state,state==='UNCERTAIN'?null:'ISOLATED_OLD_MID_'+state,id);}
  const before=f.store.db.prepare('SELECT * FROM outbox ORDER BY id').all();await flushOutbox(f.store,f.config,f.transport);assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox ORDER BY id').all(),before);assert.equal(f.ownerChecks,0);assert.equal(f.sends,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='INTERNAL_RECIPIENT_RETIRED_BEFORE_SEND'").get().n,0);
 }finally{f.store.close();}
});

test('new operational recipients remain deliverable while the explicitly historical routing retains its prior Diego rule',async()=>{
 for(const [company,routing,recipient] of [['fumigacion',CURRENT_OPERATOR_ROUTING,HILARY],['servicio-tecnico',CURRENT_OPERATOR_ROUTING,TECHNICAL_COORDINATOR],['fumigacion',OPERATOR_ROUTING,DIEGO],['servicio-tecnico',OPERATOR_ROUTING,DIEGO]]){
  const f=operatorDeliveryFixture(company,routing);try{
   f.store.queue('ISOLATED_ALLOWED_OPERATOR',recipient,f.config.lines[0].phone,'Consulta operativa propia.',true,0,'ISOLATED_ALLOWED_CASE');
   const result=await flushOutbox(f.store,f.config,f.transport);assert.equal(result.accepted,1);assert.equal(result.suppressed,0);assert.equal(f.ownerChecks,1);assert.equal(f.sends,1);assert.deepEqual(f.recipients,[recipient]);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'ACCEPTED');
  }finally{f.store.close();}
 }
});
