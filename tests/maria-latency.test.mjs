import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {drain} from '../automation/service-bots/transport.mjs';
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
