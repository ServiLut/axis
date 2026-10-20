import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store,MARIA_EARLY_DELIVERY_GUARD} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {flushOutbox} from '../automation/service-bots/transport.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';
import {DUAL_LINE_SCOPE_VERSION,DUAL_LINE_AUTHORIZATION_SOURCE,FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED,operationalCoverage} from '../automation/service-bots/line-scope.mjs';

// Only synthetic memory/temp stores and mocked transports; no HTTP or models.
const NOW=Date.parse('2026-10-20T17:30:00Z'),PHONE='573000009991',MID='3EB0_SYNTHETIC_EARLY_ACK',WRONG='3EB0_SYNTHETIC_WRONG_ACK';
function fixture(t,line=BLUE,company='fumigacion'){
 let now=NOW;t.mock.method(Date,'now',()=>now);
 const config={company,...BUSINESSES[company],enabled:true,activatedAt:Date.parse('2026-10-03T14:23:58.495Z'),historyCheckRequired:true,
  lines:company==='fumigacion'?[{phone:BLUE,instance:'cucaracha-azul'},{phone:RED,instance:'cucaracha-roja'}]:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'synthetic-st-'+i})),
  ...(company==='fumigacion'?{publicResponseStartsAt:Date.parse('2026-10-17T20:20:36.716Z'),operationalLineScope:{company,version:DUAL_LINE_SCOPE_VERSION,authorizationSource:DUAL_LINE_AUTHORIZATION_SOURCE,activeLines:[BLUE,RED],suspendedLines:[],authorizedAt:'2026-10-09T21:43:05.250Z',lineStartsAt:{[BLUE]:'2026-10-09T21:43:05.250Z',[RED]:'2026-10-19T19:07:53.012Z'}}}:{})};
 if(company!=='fumigacion')line=config.lines[0].phone;
 const store=new Store(':memory:',company,randomBytes(32));t.after(()=>store.close());initializeInactivityFollowup(config,store);
 const event={id:'SYNTHETIC_INPUT',phone:PHONE,line,at:now-10,kind:'text',text:'Hola',fromMe:false,forwarded:false};store.enqueue(event);
 store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(event.id);
 store.savePriorHistory(PHONE,{priorOutgoing:false,cutoff:config.activatedAt,checks:[]},event.id);
 const id=event.id+':reply',caseId=company+':'+event.id;store.queue(id,PHONE,line,'Hola, puedo ayudarte.',false,store.conversation(PHONE).revision,caseId);
 let sends=0;
 const transport={verifyLine:async()=>({open:true,ownerVerified:true}),currentAttention:async()=>({complete:true,sources:[],checks:[],through:now,coverage:operationalCoverage(config)}),send:async()=>{sends++;return MID;}};
 return {store,config,transport,id,caseId,line,event,get now(){return now;},advance:ms=>{now+=ms;},get sends(){return sends;},row:()=>store.db.prepare('SELECT * FROM outbox WHERE id=?').get(id),
  reserve:()=>{store.db.prepare("UPDATE outbox SET state='SENDING',updated=? WHERE id=?").run(now,id);return now;},
  accept:()=>{const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=?,updated=? WHERE id=?").run(MID,now,id);store.recordFirstBotReply(row,MID,config.bot,now);},
  buffers:()=>store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'early-delivery:%'").all(),
  first:()=>{const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get('first-delivery:'+id);return row?store.open(row.value):null;}};
}

for(const line of [BLUE,RED])test('exact '+line.slice(-4)+' ACK during send await reconciles after authorship and latency, without changing attention',async t=>{
 const f=fixture(t,line);let firstObserved,firstRead;
 f.transport.send=async()=>{
  assert.equal(f.row().state,'SENDING');assert.equal(f.row().mid,null);
  f.advance(100);firstObserved=f.now;assert.equal(f.store.delivery(MID,line,'DELIVERED'),0);
  assert.equal(f.first(),null);assert.equal(f.store.caseAuthorship(f.caseId),null);
  f.advance(100);firstRead=f.now;f.store.delivery(MID,line,'READ');f.advance(100);f.store.delivery(MID,line,'DELIVERED');
  assert.equal(f.row().state,'SENDING');assert.equal(f.store.open(f.buffers()[0].value).guard,MARIA_EARLY_DELIVERY_GUARD);return MID;
 };
 const result=await flushOutbox(f.store,f.config,f.transport);
 assert.equal(result.accepted,1);assert.equal(result.uncertain,0);assert.equal(f.row().state,'READ');assert.equal(f.first().verifiedAt,firstObserved);
 const timing=f.store.db.prepare('SELECT * FROM response_latency WHERE outbox_id=?').get(f.id);
 assert.equal(timing.delivery_ack_observed_at,firstObserved);assert.equal(timing.read_ack_observed_at,firstRead);assert.equal(timing.accepted_at,f.now);
 const author=f.store.caseAuthorship(f.caseId);assert.equal(author.state,'BOT_FIRST_REPLY_VERIFIED');assert.equal(author.priorReadByStaff,'UNVERIFIED');assert.equal(author.creatorCreditWritten,false);assert.equal(author.deliveryVerifiedAt,firstObserved);
 assert.equal(f.store.conversation(PHONE).hold,0);assert.equal(f.buffers().length,0);
 f.advance(100);f.store.delivery(MID,line,'DELIVERED');assert.equal(f.row().state,'READ');assert.equal(f.first().verifiedAt,firstObserved);
});

test('wrong line and wrong returned MID cannot apply an early receipt',async t=>{
 const f=fixture(t);f.transport.send=async()=>{f.store.delivery(MID,RED,'READ');f.store.delivery(WRONG,BLUE,'READ');return MID;};
 await flushOutbox(f.store,f.config,f.transport);
 assert.equal(f.row().state,'ACCEPTED');assert.equal(f.first(),null);assert.equal(f.store.caseAuthorship(f.caseId).state,'DELIVERY_PENDING');
 assert.equal(f.buffers().length,1);assert.deepEqual(f.store.open(f.buffers()[0].value).receipts.map(r=>r.mid),[WRONG]);
 assert.deepEqual(f.store.reconcileEarlyDelivery(f.id,WRONG,BLUE,NOW),[]);assert.equal(f.row().mid,MID);
});

test('early READ then send failure stays UNCERTAIN, has no proof and is never retried',async t=>{
 const f=fixture(t);let sends=0;f.transport.send=async()=>{sends++;f.store.delivery(MID,BLUE,'READ');throw Error('synthetic timeout');};
 const result=await flushOutbox(f.store,f.config,f.transport);assert.equal(result.uncertain,1);assert.equal(f.row().state,'UNCERTAIN');assert.equal(f.first(),null);assert.equal(f.store.caseAuthorship(f.caseId),null);
 assert.deepEqual(f.store.reconcileEarlyDelivery(f.id,MID,BLUE,NOW),[]);await flushOutbox(f.store,f.config,f.transport);assert.equal(sends,1);assert.equal(f.buffers().length,1);assert.equal(f.store.conversation(PHONE).hold,0);
});

test('no reservation, ambiguous sends, old or future reservation and invalid receipts do not buffer',t=>{
 const f=fixture(t);f.store.delivery(MID,BLUE,'READ');assert.equal(f.buffers().length,0);
 const started=f.reserve();f.store.queue('SYNTHETIC_OTHER',PHONE,BLUE,'Hola.',false,1);f.store.db.prepare("UPDATE outbox SET state='SENDING' WHERE id='SYNTHETIC_OTHER'").run();
 f.store.delivery(MID,BLUE,'READ');assert.equal(f.buffers().length,0);f.store.db.prepare("UPDATE outbox SET state='UNCERTAIN' WHERE id='SYNTHETIC_OTHER'").run();
 f.store.db.prepare('UPDATE outbox SET updated=? WHERE id=?').run(f.now-60000,f.id);f.store.delivery(MID,BLUE,'READ');assert.equal(f.buffers().length,0);
 f.store.db.prepare('UPDATE outbox SET updated=? WHERE id=?').run(f.now+1,f.id);f.store.delivery(MID,BLUE,'READ');assert.equal(f.buffers().length,0);
 f.store.db.prepare('UPDATE outbox SET updated=? WHERE id=?').run(started,f.id);for(const [mid,state] of [[MID,'SERVER_ACK'],['bad\nMID','READ'],['','READ']])f.store.delivery(mid,BLUE,state);
 assert.equal(f.buffers().length,0);f.advance(59999);f.store.delivery(MID,BLUE,'READ');assert.equal(f.buffers().length,1);
 f.advance(1);f.accept();assert.deepEqual(f.store.reconcileEarlyDelivery(f.id,MID,BLUE,started),[]);assert.equal(f.row().state,'ACCEPTED');
});

test('receipt buffer is capped at eight MIDs; READ and its first timestamps are monotonic at capacity',t=>{
 const f=fixture(t),started=f.reserve();for(let i=0;i<9;i++){f.store.delivery('3EB0_SYNTHETIC_'+i,BLUE,'DELIVERED');f.advance(1);}
 let buffer=f.store.open(f.buffers()[0].value);assert.equal(buffer.receipts.length,8);assert.equal(buffer.receipts.some(r=>r.mid==='3EB0_SYNTHETIC_8'),false);
 const first=buffer.receipts[0].observedAt;f.store.delivery('3EB0_SYNTHETIC_0',BLUE,'READ');const read=f.now;f.advance(1);f.store.delivery('3EB0_SYNTHETIC_0',BLUE,'READ');f.store.delivery('3EB0_SYNTHETIC_0',BLUE,'DELIVERED');
 buffer=f.store.open(f.buffers()[0].value);assert.equal(buffer.startedAt,started);assert.equal(buffer.receipts[0].state,'READ');assert.equal(buffer.receipts[0].observedAt,first);assert.equal(buffer.receipts[0].readObservedAt,read);
 assert.equal(f.row().state,'SENDING');assert.equal(f.first(),null);
});

test('a persisted early READ survives restart only as evidence; SENDING becomes UNCERTAIN without adoption',t=>{
 const directory=mkdtempSync(join(tmpdir(),'maria-early-delivery-test-')),path=join(directory,'synthetic.sqlite'),key=randomBytes(32);t.after(()=>rmSync(directory,{recursive:true,force:true}));
 let now=NOW;t.mock.method(Date,'now',()=>now);let store=new Store(path,'fumigacion',key);
 store.queue('SYNTHETIC_RESTART',PHONE,BLUE,'Hola.',false,1);store.db.prepare("UPDATE outbox SET state='SENDING',updated=?").run(now);store.delivery(MID,BLUE,'READ');
 const encrypted=store.db.prepare("SELECT value FROM meta WHERE key LIKE 'early-delivery:%'").get().value;assert.doesNotMatch(encrypted,new RegExp(MID+'|'+PHONE));store.close();now++;
 store=new Store(path,'fumigacion',key);try{assert.equal(store.db.prepare('SELECT state FROM outbox').get().state,'UNCERTAIN');assert.equal(store.db.prepare("SELECT value FROM meta WHERE key LIKE 'early-delivery:%'").get().value,encrypted);assert.deepEqual(store.reconcileEarlyDelivery('SYNTHETIC_RESTART',MID,BLUE,NOW),[]);assert.equal(store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'first-delivery:%'").get().n,0);}finally{store.close();}
});

test('reconciliation failure after accepted commit cannot mark an accepted send UNCERTAIN or retry it',async t=>{
 const f=fixture(t);f.transport.send=async()=>{f.store.delivery(MID,BLUE,'READ');return MID;};t.mock.method(f.store,'reconcileEarlyDelivery',()=>{throw Error('synthetic bookkeeping error');});
 const result=await flushOutbox(f.store,f.config,f.transport);assert.equal(result.accepted,1);assert.equal(result.uncertain,0);assert.equal(f.row().state,'ACCEPTED');assert.equal(f.row().mid,MID);assert.equal(f.store.caseAuthorship(f.caseId).state,'DELIVERY_PENDING');
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='EARLY_DELIVERY_RECONCILIATION_REVIEW'").get().n,1);
 await flushOutbox(f.store,f.config,f.transport);assert.equal(f.row().state,'ACCEPTED');assert.equal(f.first(),null);
});

test('early delivery does not remove a human hold or qualify an earlier staff reply; Miguel remains legacy',t=>{
 const f=fixture(t),started=f.reserve();f.store.delivery(MID,BLUE,'READ');
 const staff={...f.event,id:'SYNTHETIC_REAL_STAFF',at:f.now-1,fromMe:true,text:'Yo atiendo este caso.'};f.store.enqueue(staff);f.store.hold(PHONE,staff.id,true);f.accept();
 assert.equal(f.store.reconcileEarlyDelivery(f.id,MID,BLUE,started)[0].state,'READ');assert.equal(f.row().state,'READ');assert.equal(f.store.conversation(PHONE).hold,1);assert.equal(f.store.caseAuthorship(f.caseId).state,'FIRST_REPLY_REVIEW');assert.equal(f.store.caseAuthorship(f.caseId).firstReplyEligible,false);
 const legacy=new Store(':memory:','servicio-tecnico',randomBytes(32));try{legacy.queue('SYNTHETIC_ST',PHONE,BLUE,'Hola.',false,1);legacy.db.prepare("UPDATE outbox SET state='SENDING',updated=?").run(f.now);legacy.delivery(MID,BLUE,'READ');assert.equal(legacy.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'early-delivery:%'").get().n,0);legacy.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=?").run(MID);assert.deepEqual(legacy.reconcileEarlyDelivery('SYNTHETIC_ST',MID,BLUE,f.now),[]);assert.equal(legacy.delivery(MID,BLUE,'READ'),1);}finally{legacy.close();}
});
