import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {Transport,drain,flushOutbox,MARIA_ATTENTION_FAILURE_GUARD} from '../automation/service-bots/transport.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';
import {DUAL_LINE_SCOPE_VERSION,DUAL_LINE_AUTHORIZATION_SOURCE,FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED,operationalHistoryGuard,operationalCoverage} from '../automation/service-bots/line-scope.mjs';

// Synthetic memory stores and transports only; no HTTP, model or business I/O.
const NOW=Date.parse('2026-10-20T16:30:00.000Z'),PHONE='573000009991';
function fixture(t,line=BLUE,company='fumigacion'){
 let now=NOW;t.mock.method(Date,'now',()=>now);
 const config={company,...BUSINESSES[company],enabled:true,activatedAt:Date.parse('2026-10-03T14:23:58.495Z'),historyCheckRequired:true,
  lines:company==='fumigacion'?[{phone:BLUE,instance:'cucaracha-azul'},{phone:RED,instance:'cucaracha-roja'}]:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'synthetic-st-'+i})),
  ...(company==='fumigacion'?{publicResponseStartsAt:Date.parse('2026-10-17T20:20:36.716Z'),operationalLineScope:{company,version:DUAL_LINE_SCOPE_VERSION,authorizationSource:DUAL_LINE_AUTHORIZATION_SOURCE,activeLines:[BLUE,RED],suspendedLines:[],authorizedAt:'2026-10-09T21:43:05.250Z',lineStartsAt:{[BLUE]:'2026-10-09T21:43:05.250Z',[RED]:'2026-10-19T19:07:53.012Z'}}}:{})};
 if(company!=='fumigacion')line=config.lines[0].phone;
 const store=new Store(':memory:',company,randomBytes(32));t.after(()=>store.close());initializeInactivityFollowup(config,store);
 const f={config,store,line,sent:[],checks:0,failure:'ATTENTION_COVERAGE_UNVERIFIED',duringCheck:null,advance:()=>{now+=1000;}};
 const transport=new Transport(config,()=>assert.fail('HTTP is forbidden'));
 transport.verifyLine=async phone=>{assert.ok(config.lines.some(l=>l.phone===phone));return {phone,open:true,ownerVerified:true};};
 transport.priorHistory=async()=>({cutoff:config.activatedAt,checkedAt:now,guardVersion:operationalHistoryGuard(config),priorOutgoing:false,checks:config.lines.flatMap(l=>['remoteJid','remoteJidAlt'].map(addressField=>({line:l.phone,addressField,total:0}))),coverage:operationalCoverage(config)});
 transport.currentAttention=async()=>{f.checks++;if(f.duringCheck)await f.duringCheck();if(f.failure)throw Error(f.failure);return {complete:true,sources:[],checks:[],through:now,coverage:operationalCoverage(config)};};
 transport.understand=async()=>assert.fail('Model understanding is forbidden for this greeting fixture');
 transport.send=async(o,text)=>{f.sent.push({id:o.id,line:o.line,text});return 'SYNTHETIC_SENT_'+f.sent.length;};
 f.transport=transport;f.engine=new Engine(store,config);
 f.event=(id,text='Hola',fromMe=false)=>({id,phone:PHONE,line,at:now-10,kind:'text',text,fromMe,forwarded:false});
 f.prepare=()=>{const e=f.event('SYNTHETIC_BEFORE_FAILURE');store.enqueue(e);store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(e.id);store.queue(e.id+':reply',PHONE,line,'Hola, puedo ayudarte.',false,store.conversation(PHONE).revision);return e;};
 f.old=()=>store.db.prepare('SELECT * FROM outbox WHERE id=?').get('SYNTHETIC_BEFORE_FAILURE:reply');
 return f;
}

for(const line of [BLUE,RED])for(const reason of ['CHANNEL_NOT_READY','ATTENTION_COVERAGE_UNVERIFIED','ATTENTION_SOURCE_OUTSIDE_SCOPE']){
 test('FUM '+line.slice(-4)+' '+reason+' blocks its old output; only a fresh verified source can continue',async t=>{
  const f=fixture(t,line);f.failure=reason;f.prepare();const initialRevision=f.store.conversation(PHONE).revision;
  await flushOutbox(f.store,f.config,f.transport);
  assert.equal(f.old().state,'ATTENTION_REVIEW');assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,0);assert.equal(f.store.conversation(PHONE).revision,initialRevision);
  const audit=f.store.open(f.store.db.prepare("SELECT detail FROM audit WHERE action='NATIVE_ATTENTION_UNVERIFIED'").get().detail);
  assert.equal(audit.reasonCode,reason);assert.equal(audit.guard,MARIA_ATTENTION_FAILURE_GUARD);assert.equal(audit.humanHoldChanged,false);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action IN ('HUMAN_TAKEOVER','EXPLICIT_RELEASE')").get().n,0);
  const preserved={...f.old()};f.failure=null;await flushOutbox(f.store,f.config,f.transport);
  assert.equal(f.checks,1,'restored transport alone never retries an old review output');assert.equal(f.sent.length,0);assert.deepEqual({...f.old()},preserved);
  f.advance();const fresh=f.event('SYNTHETIC_NEW_CUSTOMER_SOURCE');f.store.enqueue(fresh);await drain(f.store,f.config,f.transport,f.engine);
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].id,fresh.id+':reply');assert.equal(f.sent[0].line,line);assert.equal(f.checks,2);
  assert.equal(f.store.conversation(PHONE).hold,0);assert.deepEqual({...f.old()},preserved);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(fresh.id).state,'DONE');
 });
}

for(const line of [BLUE,RED])test('FUM '+line.slice(-4)+' preserves a real staff takeover arriving during the failed attention await',async t=>{
 const f=fixture(t,line);f.prepare();
 let staff;f.duringCheck=async()=>{await Promise.resolve();staff=f.event('SYNTHETIC_CONCURRENT_STAFF','Yo continúo la atención.',true);f.store.enqueue(staff);};
 await flushOutbox(f.store,f.config,f.transport);
 assert.equal(f.sent.length,0);assert.equal(f.old().state,'SUPPRESSED_HUMAN');assert.equal(f.store.conversation(PHONE).hold,1);
 await f.engine.process(staff);f.duringCheck=null;f.failure=null;f.advance();const fresh=f.event('SYNTHETIC_CUSTOMER_AFTER_STAFF');f.store.enqueue(fresh);await drain(f.store,f.config,f.transport,f.engine);
 assert.equal(f.sent.length,0);assert.equal(f.old().state,'SUPPRESSED_HUMAN');assert.equal(f.store.conversation(PHONE).hold,1);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(fresh.id).state,'OBSERVED_HUMAN');
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='EXPLICIT_RELEASE'").get().n,0);
});

for(const line of [BLUE,RED])test('FUM '+line.slice(-4)+' leaves an inherited technical or human hold and suppressed output untouched',async t=>{
 const f=fixture(t,line);f.prepare();f.store.hold(PHONE,'attention-review:SYNTHETIC_HISTORICAL_SOURCE',true);
 const original={...f.old()},revision=f.store.conversation(PHONE).revision;f.failure=null;f.advance();const fresh=f.event('SYNTHETIC_FRESH_UNDER_INHERITED_HOLD');f.store.enqueue(fresh);await drain(f.store,f.config,f.transport,f.engine);
 assert.equal(f.sent.length,0);assert.deepEqual({...f.old()},original);assert.equal(f.store.conversation(PHONE).hold,1);assert.ok(f.store.conversation(PHONE).revision>=revision);
 assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(fresh.id).state,'OBSERVED_HUMAN');assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='EXPLICIT_RELEASE'").get().n,0);
});

test('Miguel retains its existing technical-failure hold behavior',async t=>{
 const f=fixture(t,BLUE,'servicio-tecnico');f.prepare();await flushOutbox(f.store,f.config,f.transport);
 assert.equal(f.sent.length,0);assert.equal(f.old().state,'ATTENTION_REVIEW');assert.equal(f.store.conversation(PHONE).hold,1);
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='HUMAN_TAKEOVER'").get().n,1);
});
