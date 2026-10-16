import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {flushOutbox} from '../automation/service-bots/transport.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';

const PHONE='573000001111',OTHER='573000002222',NOW=Date.now(),RELEASE=NOW-5000;

function fixture(t,{release=true,company='fumigacion'}={}){
  t.mock.method(Date,'now',()=>NOW);
  const config={company,...BUSINESSES[company],enabled:true,historyCheckRequired:true,activatedAt:NOW-120000,
    lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company+'-'+i,apiKey:'isolated-'+i}))};
  const store=new Store(':memory:',company,randomBytes(32));
  initializeInactivityFollowup(config,store);
  const line=config.lines[0].phone,caseId=company+':ORIGINAL_SOURCE';
  store.enqueue({id:'ORIGINAL_SOURCE',phone:PHONE,line,at:NOW-90000,fromMe:false,kind:'text',text:'Hola'});
  store.saveConversation(PHONE,{caseId,slots:{},asked:[]});
  store.savePriorHistory(PHONE,{cutoff:config.activatedAt,priorOutgoing:false,checks:[]},'ORIGINAL_SOURCE');
  store.queue('ORIGINAL_SOURCE:reply',PHONE,line,'Hola.',false,store.conversation(PHONE).revision,caseId);
  store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid='BOT_ORIGINAL_MID',created=?,updated=? WHERE id='ORIGINAL_SOURCE:reply'").run(NOW-80000,NOW-80000);
  store.recordFirstBotReply(store.db.prepare("SELECT * FROM outbox WHERE id='ORIGINAL_SOURCE:reply'").get(),'BOT_ORIGINAL_MID',config.bot,NOW-80000);
  store.delivery('BOT_ORIGINAL_MID',line,'READ');
  const firstAuthorship=store.caseAuthorship(caseId);
  if(release){store.hold(PHONE,'EXISTING_NATIVE_MANUAL',true);store.hold(PHONE,'VERIFIED_EXPLICIT_CHIEF_RETURN',false);}
  const setRelease=value=>store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('chief-release:'+PHONE,store.seal(value));
  if(release)setRelease({source:'VERIFIED_EXPLICIT_CHIEF_RETURN',at:RELEASE});
  store.enqueue({id:'FRESH_CUSTOMER_SOURCE',phone:PHONE,line,at:NOW-1000,fromMe:false,kind:'text',text:'¿Me ayudas?'});
  store.db.prepare("UPDATE events SET state='DONE' WHERE id IN ('ORIGINAL_SOURCE','FRESH_CUSTOMER_SOURCE')").run();
  store.queue('FRESH_CUSTOMER_SOURCE:reply',PHONE,line,'Claro. ¿Qué necesitas?',false,store.conversation(PHONE).revision,caseId);
  const sources=[{id:'EXISTING_NATIVE_MANUAL',line,at:Math.floor((NOW-20000)/1000)*1000}];
  const sent=[];
  const transport={verifyLine:async()=>{},currentAttention:async()=>({complete:true,through:NOW,sources,checks:[]}),send:async(row,text)=>{sent.push({id:row.id,text});return 'ISOLATED_NEW_MID';}};
  const run=()=>flushOutbox(store,config,transport);
  const row=()=>store.db.prepare("SELECT * FROM outbox WHERE id='FRESH_CUSTOMER_SOURCE:reply'").get();
  const audit=action=>store.db.prepare('SELECT * FROM audit WHERE action=?').all(action).map(r=>({...r,detail:store.open(r.detail)}));
  t.after(()=>store.close());
  return {config,store,line,caseId,firstAuthorship,setRelease,sources,sent,transport,run,row,audit};
}

test('explicit return permits the next fresh reply despite older native manual history and preserves its evidence',async t=>{
  const f=fixture(t),history=f.store.priorHistory(PHONE),marker=f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('chief-release:'+PHONE).value;
  const result=await f.run();
  assert.equal(result.accepted,1);assert.equal(f.sent.length,1);assert.equal(f.store.conversation(PHONE).hold,0);
  assert.equal(f.row().state,'ACCEPTED');assert.deepEqual(f.store.caseAuthorship(f.caseId),f.firstAuthorship);
  assert.deepEqual(f.store.priorHistory(PHONE),history);
  assert.equal(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('chief-release:'+PHONE).value,marker);
  const preserved=f.audit('NATIVE_PRE_RELEASE_ATTENTION_PRESERVED');assert.equal(preserved.length,1);
  assert.deepEqual(preserved[0].detail.sources,f.sources);assert.equal(preserved[0].detail.authorUnverified,true);assert.equal(preserved[0].detail.holdReleased,false);
  const checked=f.audit('NATIVE_ATTENTION_CHECKED')[0].detail;assert.equal(checked.knownOutgoing,0);assert.equal(checked.releasedHistoricalOutgoing,1);
});

test('a later native manual intervention blocks again after explicit return',async t=>{
  const f=fixture(t);f.sources.push({id:'LATER_MANUAL',line:f.line,at:Math.floor((NOW-2000)/1000)*1000});
  const result=await f.run();assert.equal(result.accepted,0);assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,1);
  assert.equal(f.row().state,'SUPPRESSED_HUMAN');assert.deepEqual(f.store.caseAuthorship(f.caseId),f.firstAuthorship);
  assert.equal(f.audit('NATIVE_PRIOR_ATTENTION_BLOCKED_REPLY')[0].source,'LATER_MANUAL');
});

test('a native manual message in the explicit return second remains ambiguous and blocks',async t=>{
  const f=fixture(t);f.sources[0].at=Math.floor(RELEASE/1000)*1000;
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,1);
});

test('an old outgoing source with an edit of unknown time remains blocked after return',async t=>{
  for(const editedSource of [{edited:true,kind:'text'},{kind:'edited-body-unavailable'}]){
    const f=fixture(t);Object.assign(f.sources[0],editedSource);
    assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,1);
  }
});

test('the last millisecond of the native second must be strictly before the return',async t=>{
  const f=fixture(t);f.sources[0].at=Math.floor((NOW-20000)/1000)*1000;f.setRelease({source:'VERIFIED_EXPLICIT_CHIEF_RETURN',at:f.sources[0].at+999});
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);
});

test('no explicit return keeps older unknown native outgoing attention blocked',async t=>{
  const f=fixture(t,{release:false});assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,1);
  assert.equal(f.audit('NATIVE_PRE_RELEASE_ATTENTION_PRESERVED').length,0);
});

test('malformed and future return markers cannot bypass native attention',async t=>{
  for(const invalid of [null,[],{}, {source:'',at:RELEASE},{source:22,at:RELEASE},{source:'verified',at:String(RELEASE)}, {source:'verified',at:NOW+1},{source:'verified',at:-1},{source:'verified',at:RELEASE,phone:OTHER}]){
    const f=fixture(t);f.setRelease(invalid);assert.equal((await f.run()).accepted,0,JSON.stringify(invalid));assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,1);
  }
});

test('an unreadable encrypted return marker fails closed',async t=>{
  const f=fixture(t);f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run('not-a-valid-encrypted-marker','chief-release:'+PHONE);
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);assert.equal(f.row().state,'SUPPRESSED_HUMAN');
});

test('a return stored for another phone cannot apply to this customer',async t=>{
  const f=fixture(t);f.store.db.prepare('UPDATE meta SET key=? WHERE key=?').run('chief-release:'+OTHER,'chief-release:'+PHONE);
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,1);
});

test('a manual source from another own line cannot be ignored by this line return',async t=>{
  const f=fixture(t);f.sources[0].line=f.config.lines[1].phone;
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,1);
});

test('a conflicting native source phone cannot use the customer return',async t=>{
  const f=fixture(t);f.sources[0].phone=OTHER;
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);
});

test('a conversation on another line cannot use the outgoing line return',async t=>{
  const f=fixture(t);f.store.db.prepare('UPDATE conversations SET line=? WHERE phone=?').run(f.config.lines[1].phone,PHONE);
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);
});

test('pending staff input still blocks even if native outgoing predates an explicit return',async t=>{
  const f=fixture(t);
  f.store.enqueue({id:'PENDING_OLDER_STAFF',phone:PHONE,line:f.line,at:NOW-15000,fromMe:true,kind:'text',text:'Te ayudo yo.'});
  f.store.hold(PHONE,'VERIFIED_EXPLICIT_CHIEF_RETURN',false);f.setRelease({source:'VERIFIED_EXPLICIT_CHIEF_RETURN',at:RELEASE});
  // Prepare a genuinely fresh reply after that return, leaving the unprocessed
  // staff source visible. The return must not reinterpret its pending state.
  f.store.db.prepare("UPDATE outbox SET state='READY',revision=? WHERE id='FRESH_CUSTOMER_SOURCE:reply'").run(f.store.conversation(PHONE).revision);
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);assert.equal(f.store.db.prepare("SELECT state FROM events WHERE id='PENDING_OLDER_STAFF'").get().state,'PENDING');
});

test('a hold created after the explicit return cannot be lifted by reading its older marker',async t=>{
  const f=fixture(t);f.store.hold(PHONE,'NEW_HUMAN_TAKEOVER',true);
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,1);
});

test('a reply prepared before the return is not made eligible again',async t=>{
  const f=fixture(t);f.store.db.prepare("UPDATE outbox SET created=? WHERE id='FRESH_CUSTOMER_SOURCE:reply'").run(RELEASE-1);
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);
});

test('queueing an old customer turn after the return does not make it a fresh conversation',async t=>{
  const f=fixture(t);f.store.db.prepare('UPDATE conversations SET at=? WHERE phone=?').run(RELEASE-1,PHONE);
  assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);
});

test('the Maria fix does not change Miguel native attention handling',async t=>{
  const f=fixture(t,{company:'servicio-tecnico'});assert.equal((await f.run()).accepted,0);assert.equal(f.sent.length,0);assert.equal(f.store.conversation(PHONE).hold,1);
});
