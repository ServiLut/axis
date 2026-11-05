import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {resetUserTestMemory,conversationMemoryBoundary} from '../automation/service-bots/conversation-memory-reset.mjs';
import {initializeTesaStore} from '../automation/service-bots/tesa-operations.mjs';
import {priorAttentionRelease,nativeSourceBeforeRelease} from '../automation/service-bots/explicit-return-attention.mjs';
import {drain,flushOutbox} from '../automation/service-bots/transport.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {DUAL_LINE_SCOPE_VERSION,DUAL_LINE_AUTHORIZATION_SOURCE,operationalHistoryGuard} from '../automation/service-bots/line-scope.mjs';
const P='573000098765',OTHER='573000098764',B='573126944997',R='573126938721',SRC='direct-user-memory-reset-synthetic-authorized-both-lines-v1';
const now=Date.parse('2026-11-05T18:00:00.000Z');
function event(id,at=now-20000,line=B,phone=P,fromMe=false){return{id,phone,line,at,fromMe,kind:'text',text:'Cucarachas'};}
function fixture(t){t.mock.timers.enable({apis:['Date'],now});const s=new Store(':memory:','fumigacion',randomBytes(32));
 s.enqueue(event('OLDSOURCE0001'));s.db.prepare("UPDATE events SET state='DONE'").run();
 s.saveConversation(P,{slots:{service:'cucarachas',area:'999 m2'},asked:['area'],introduced:true,caseId:'fumigacion:OLDSOURCE0001',quotedPrice:{priceCop:999},programIntake:{stage:'name'},awaitingHumanReview:true});
 s.queue('old-output',P,B,'Oferta anterior',false,1,'fumigacion:OLDSOURCE0001');s.db.prepare("UPDATE outbox SET state='READ',mid='OLDMID000001',created=?,updated=? WHERE id='old-output'").run(now-19000,now-19000);
 s.enqueue(event('OTHERPHONE001',now-18000,R,OTHER));s.db.prepare("UPDATE events SET state='DONE' WHERE phone=?").run(OTHER);
 t.after(()=>s.close());return s;
}
const snapshot=s=>JSON.stringify(['conversations','events','event_sources','outbox','questions','question_routes','case_authorship','meta','audit'].map(n=>s.db.prepare('SELECT * FROM '+n+' ORDER BY rowid').all()));
const reset=(s,extra={})=>resetUserTestMemory(s,{phone:P,source:SRC,expectedRevision:s.conversation(P).revision,...extra},Date.now());
test('reset archives the exact former memory, keeps native proof rows and affects only the requested phone',t=>{const s=fixture(t),old=s.db.prepare('SELECT * FROM conversations WHERE phone=?').get(P),other=s.db.prepare('SELECT * FROM conversations WHERE phone=?').get(OTHER),events=s.db.prepare('SELECT * FROM events').all(),outputs=s.db.prepare('SELECT * FROM outbox').all();
 const result=reset(s);assert.equal(result.activeStateClean,true);assert.deepEqual(s.conversation(P).state,{slots:{},asked:[],lastText:''});assert.equal(s.conversation(P).at,old.at);assert.equal(s.conversation(P).revision,old.revision+1);
 assert.deepEqual(s.db.prepare('SELECT * FROM conversations WHERE phone=?').get(OTHER),other);assert.deepEqual(s.db.prepare('SELECT * FROM events').all(),events);assert.deepEqual(s.db.prepare('SELECT * FROM outbox').all(),outputs);
 const backup=s.db.prepare("SELECT value FROM meta WHERE key LIKE 'conversation-memory-backup:%'").get();assert.equal(JSON.stringify(s.open(backup.value).conversation),JSON.stringify(old));assert.equal(backup.value.includes('999 m2'),false);assert.equal(result.businessWrites,0);assert.equal(result.nativeMessagesDeleted,0);
});
test('the first new turn is clean and the other WhatsApp line shares the same reset boundary',t=>{const s=fixture(t);reset(s);t.mock.timers.tick(2000);s.enqueue(event('NEWSOURCE001',Date.now(),R));
 const first=s.conversationContext(P,Date.now(),20,'NEWSOURCE001');assert.equal(first.turns.length,1);assert.equal(first.turns[0].sourceId,'NEWSOURCE001');assert.equal(first.memoryResetAt,now);assert.equal(first.completeStoredHistory,true);assert.equal(s.queue('new-allowed-reply',P,R,'Hola',false,s.conversation(P).revision,'fumigacion:NEWSOURCE001'),true);
 t.mock.timers.tick(2000);s.enqueue(event('NEWSOURCE002',Date.now(),B));assert.deepEqual(s.conversationContext(P,Date.now(),20,'NEWSOURCE002').turns.map(v=>v.sourceId),['NEWSOURCE001','NEWSOURCE002']);
});
test('late old webhooks and old bot echoes stay evidence without reviving old memory or a hold',t=>{const s=fixture(t);reset(s);const before=s.conversation(P);s.enqueue(event('LATEOLDSOURCE',now-2000));s.enqueue(event('OLDMID000001',now-19000,B,P,true));assert.deepEqual(s.conversation(P),before);
 assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get('LATEOLDSOURCE').state,'OBSERVED_BEFORE_MEMORY_RESET');t.mock.timers.tick(2000);s.enqueue(event('NEWSOURCE001',Date.now(),R));assert.deepEqual(s.conversationContext(P,Date.now(),20,'NEWSOURCE001').turns.map(v=>v.sourceId),['NEWSOURCE001']);
});
test('new human activity after reset still freezes the conversation',t=>{const s=fixture(t);reset(s);t.mock.timers.tick(2000);s.enqueue(event('NEWSTAFF0001',Date.now(),R,P,true));assert.equal(s.conversation(P).hold,1);});
test('the pending-turn batch never includes rows from before the explicit memory boundary',t=>{const s=fixture(t);s.db.prepare("UPDATE events SET state='OBSERVED_SUPERSEDED' WHERE phone=?").run(P);reset(s);t.mock.timers.tick(2000);s.enqueue(event('NEWSOURCE001',Date.now(),R));
 assert.deepEqual(s.customerTurnBatch(P,'NEWSOURCE001',null).map(v=>v.id),['NEWSOURCE001']);assert.deepEqual(s.customerTurnBatch(P,'NEWSOURCE001','OLDSOURCE0001').map(v=>v.id),['NEWSOURCE001']);assert.deepEqual(s.customerTurnBatch(P,'OLDSOURCE0001',null),[]);
});
test('active sends, pending events, stale revision and an unacknowledged hold abort with zero mutations',t=>{const s=fixture(t);
 for(const state of ['SENDING']){s.db.prepare('UPDATE outbox SET state=?').run(state);const before=snapshot(s);assert.throws(()=>reset(s));assert.equal(snapshot(s),before);}s.db.prepare("UPDATE outbox SET state='READ'").run();
 s.db.prepare("UPDATE events SET state='PENDING' WHERE phone=?").run(P);let before=snapshot(s);assert.throws(()=>reset(s));assert.equal(snapshot(s),before);s.db.prepare("UPDATE events SET state='DONE'").run();
 before=snapshot(s);assert.throws(()=>reset(s,{releaseHumanHold:'true'}));assert.equal(snapshot(s),before);assert.throws(()=>reset(s,{expectedRevision:999}));assert.equal(snapshot(s),before);s.db.prepare('UPDATE conversations SET hold=1 WHERE phone=?').run(P);before=snapshot(s);assert.throws(()=>reset(s));assert.equal(snapshot(s),before);
});
test('only an explicit same-phone reset releases that test hold; the other person remains held',t=>{const s=fixture(t);s.db.prepare('UPDATE conversations SET hold=1').run();const other=s.conversation(OTHER);reset(s,{releaseHumanHold:true});assert.equal(s.conversation(P).hold,0);assert.deepEqual(s.conversation(OTHER),other);assert.deepEqual(s.open(s.db.prepare('SELECT value FROM meta WHERE key=?').get('chief-release:'+P).value),{source:SRC,at:now});});
test('ready customer and routed internal questions are suppressed while uncertain/accepted/read rows stay unchanged',async t=>{const s=fixture(t);s.queue('ready-client',P,B,'Anterior',false,1);s.queue('ready-chief','573016803926',B,'Pregunta anterior',true,0);s.queue('ready-route','573016803926',R,'Otra ruta',true,0);s.queue('uncertain-client',P,B,'Incierto',false,1);s.db.prepare("UPDATE outbox SET state='UNCERTAIN',mid='UNCERTAINMID' WHERE id='uncertain-client'").run();
 s.db.prepare("INSERT INTO questions(id,phone,case_id,state,outbox_id) VALUES('old-question',?,'old-case','PENDING','ready-chief')").run(P);s.db.prepare("INSERT INTO question_routes(question_id,recipient,line,outbox_id) VALUES('old-question','573016803926',?,'ready-route')").run(R);
 const uncertain=s.db.prepare("SELECT * FROM outbox WHERE id='uncertain-client'").get(),read=s.db.prepare("SELECT * FROM outbox WHERE id='old-output'").get();reset(s);
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='READY'").get().n,0);assert.equal(s.db.prepare("SELECT state FROM questions WHERE id='old-question'").get().state,'CANCELLED_MEMORY_RESET');assert.deepEqual(s.db.prepare("SELECT * FROM outbox WHERE id='uncertain-client'").get(),uncertain);assert.deepEqual(s.db.prepare("SELECT * FROM outbox WHERE id='old-output'").get(),read);
 let calls=0;await flushOutbox(s,{company:'fumigacion',lines:[]},{send(){calls++;throw Error('NO_SEND_ALLOWED');}});assert.equal(calls,0);
});
test('native attention accepts only older messages on the two explicitly reset own lines; new or edited human messages still block',t=>{const s=fixture(t);s.db.prepare('UPDATE conversations SET hold=1 WHERE phone=?').run(P);reset(s,{releaseHumanHold:true});t.mock.timers.tick(3000);s.enqueue(event('NEWSOURCE001',Date.now(),R));const config={company:'fumigacion',activatedAt:now-86400000,lines:[{phone:B},{phone:R}]},context={phone:P,line:R,revision:s.conversation(P).revision,sourceAt:Date.now(),created:Date.now(),internal:false},attention={complete:true,sources:[],through:Date.now()};
 const release=priorAttentionRelease(s,config,context,attention);assert.ok(release?.memoryResetBoundary);const old={id:'MANUALOLD001',line:B,phone:P,at:now-5000,kind:'text'};assert.equal(nativeSourceBeforeRelease(old,context,release,config,attention.through),true);assert.equal(nativeSourceBeforeRelease({...old,phone:OTHER},context,release,config,attention.through),false);assert.equal(nativeSourceBeforeRelease({...old,edited:true},context,release,config,attention.through),false);assert.equal(nativeSourceBeforeRelease({...old,at:now+1000},context,release,config,attention.through),false);
 assert.equal(nativeSourceBeforeRelease(old,context,{source:'normal-release',at:now},config,attention.through),false);
});
test('reapplying the same reset or presenting a corrupt boundary cannot alter any other memory',t=>{const s=fixture(t);reset(s);const before=snapshot(s);assert.throws(()=>reset(s));assert.equal(snapshot(s),before);const key='conversation-memory-boundary:'+P,row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(key),b=s.open(row.value);s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({...b,phone:OTHER}),key);assert.throws(()=>conversationMemoryBoundary(s,P));});
test('a pending TESA send prevents reset and ready TESA questions are cancelled only for the target phone',t=>{const s=fixture(t);initializeTesaStore(s);const q=s.seal({source:'OLDSOURCE0001'});
 s.db.prepare("INSERT INTO tesa_questions(id,company,case_id,customer_phone,topic,conditions_hash,group_jid,source_line,sender_line,body,state,outbox_id) VALUES('tq','fumigacion','old',?,'topic','hash','group',?,?,?,'PENDING','to')").run(P,B,B,q);
 s.db.prepare("INSERT INTO tesa_outbox(id,question_id,company,customer_phone,case_id,group_jid,source_line,sender_line,body,text_hash,state,created,updated) VALUES('to','tq','fumigacion',?,'old','group',?,?,?,'hash','SENDING',?,?)").run(P,B,B,q,now,now);let before=snapshot(s);assert.throws(()=>reset(s));assert.equal(snapshot(s),before);s.db.prepare("UPDATE tesa_outbox SET state='READY'").run();reset(s);assert.equal(s.db.prepare("SELECT state FROM tesa_outbox WHERE id='to'").get().state,'SUPPRESSED_MEMORY_RESET');assert.equal(s.db.prepare("SELECT state FROM tesa_questions WHERE id='tq'").get().state,'CANCELLED_MEMORY_RESET');
});

test('stale snapshots, copied old cases and post-reset old-revision queues cannot restore previous memory',t=>{const s=fixture(t),stale=s.conversation(P).state,copy={...stale};reset(s);const clean=s.conversation(P).state;
 assert.throws(()=>s.saveConversation(P,stale));assert.throws(()=>s.saveConversation(P,copy));assert.deepEqual(s.conversation(P).state,clean);assert.equal(s.queue('late-queue',P,B,'No reenviar',false,1,'fumigacion:OLDSOURCE0001'),false);
 assert.throws(()=>s.question({phone:P,line:B,caseId:'fumigacion:OLDSOURCE0001',topic:'customer-question',conditions:{},recipient:'573016803926',text:'Vieja',source:'OLDSOURCE0001'}));
 t.mock.timers.tick(2000);s.enqueue(event('NEWSOURCE001',Date.now(),R));const current=s.conversation(P).state;current.caseId='fumigacion:NEWSOURCE001';current.slots.service='cucarachas';s.saveConversation(P,current);assert.equal(s.conversation(P).state.slots.service,'cucarachas');
});
test('a same-second new message remains eligible and visible after a millisecond reset',t=>{const s=fixture(t);t.mock.timers.tick(500);reset(s);s.enqueue(event('SAMESECOND001',now,R));assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get('SAMESECOND001').state,'PENDING');assert.deepEqual(s.customerTurnBatch(P,'SAMESECOND001',null).map(v=>v.id),['SAMESECOND001']);assert.equal(s.conversationContext(P,Date.now(),20,'SAMESECOND001').turns.length,1);});
test('late human messages and mutations are never absorbed as old test history',t=>{const s=fixture(t);reset(s);s.enqueue({...event('OLDMID000001',now-19000,B,P,true),edited:true});assert.equal(s.conversation(P).hold,1);});

function dualMemoryFixture(t){
 const s=fixture(t),config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:now-86400000,publicResponseStartsAt:now-60000,historyCheckRequired:true,responseTargetMs:3000,
  lines:[{phone:B,instance:'cucaracha-azul'},{phone:R,instance:'cucaracha-roja'}],operationalLineScope:{company:'fumigacion',version:DUAL_LINE_SCOPE_VERSION,authorizationSource:DUAL_LINE_AUTHORIZATION_SOURCE,activeLines:[B,R],suspendedLines:[],authorizedAt:new Date(now-50000).toISOString(),lineStartsAt:{[B]:new Date(now-50000).toISOString(),[R]:new Date(now-40000).toISOString()}}};
 s.enqueue(event('OLDREDSOURCE1',now-10000,R));s.db.prepare("UPDATE events SET state='DONE' WHERE phone=?").run(P);
 s.queue('old-red-output',P,R,'Oferta roja anterior',false,s.conversation(P).revision,'fumigacion:OLDREDSOURCE1');s.db.prepare("UPDATE outbox SET state='DELIVERED',mid='OLDREDMID001',created=?,updated=? WHERE id='old-red-output'").run(now-9000,now-9000);
 s.savePriorHistory(P,{cutoff:config.activatedAt,checkedAt:now-5000,priorOutgoing:true,guardVersion:operationalHistoryGuard(config),checks:[{line:B,total:2,lastAt:config.activatedAt-1000},{line:R,total:1,lastAt:config.activatedAt-2000}]},'OLDREDSOURCE1');
 initializeTesaStore(s);
 // A cancelled private question may never have reached an outbox at all.
 s.db.prepare("INSERT INTO questions(id,phone,case_id,state) VALUES('old-unrouted',?,'fumigacion:OLDREDSOURCE1','PENDING')").run(P);
 s.queue('old-question-route','573016803926',B,'Pregunta anterior',true,0);
 s.db.prepare("INSERT INTO questions(id,phone,case_id,state,outbox_id) VALUES('old-routed',?,'fumigacion:OLDREDSOURCE1','PENDING','old-question-route')").run(P);
 s.db.prepare("INSERT INTO question_routes(question_id,recipient,line,outbox_id) VALUES('old-routed','573016803926',?,'old-question-route')").run(B);
 s.db.prepare("INSERT INTO tesa_questions(id,company,case_id,customer_phone,topic,conditions_hash,group_jid,source_line,sender_line,body,state,outbox_id) VALUES('old-tesa','fumigacion','fumigacion:OLDREDSOURCE1',?,'topic','hash','group',?,?,?,'PENDING','old-tesa-output')").run(P,R,R,s.seal({source:'OLDREDSOURCE1'}));
 reset(s,{releaseHumanHold:true});return {s,config,engine:new Engine(s,config)};
}
function memoryTransport(sent){return {verifyLine:async()=>{},understand:async()=>({}),currentAttention:async()=>({complete:true,sources:[],checks:[],through:Date.now()}),send:async(row,text)=>{sent.push({id:row.id,line:row.line,text});return 'SYNTHETIC_MEMORY_MID_'+sent.length;}};}

for(const line of [B,R])test('the first fresh '+line.slice(-4)+' turn passes drain, Engine and flush after explicitly archived dual-line memory',async t=>{
 const {s,config,engine}=dualMemoryFixture(t),priorRows=s.db.prepare('SELECT * FROM events WHERE phone=? ORDER BY rowid').all(P),oldRead=s.db.prepare("SELECT * FROM outbox WHERE id='old-output'").get(),oldDelivered=s.db.prepare("SELECT * FROM outbox WHERE id='old-red-output'").get(),sent=[];
 assert.equal(s.hasSourcesOutsideLine(P,line),false);t.mock.timers.tick(2000);const e=event('FRESHMEMORY001',Date.now(),line);s.enqueue(e);
 await drain(s,config,memoryTransport(sent),engine);
 assert.equal(sent.length,1);assert.equal(sent[0].line,line);assert.equal(sent[0].id,e.id+':reply');assert.doesNotMatch(sent[0].text,/999|Oferta anterior|Oferta roja anterior/);
 assert.notEqual(s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OPERATIONAL_SCOPE_REVIEW');assert.equal(s.db.prepare('SELECT state FROM outbox WHERE id=?').get(e.id+':reply').state,'ACCEPTED');
 assert.deepEqual(s.db.prepare('SELECT * FROM events WHERE phone=? AND id<>? ORDER BY rowid').all(P,e.id),priorRows);assert.deepEqual(s.db.prepare("SELECT * FROM outbox WHERE id='old-output'").get(),oldRead);assert.deepEqual(s.db.prepare("SELECT * FROM outbox WHERE id='old-red-output'").get(),oldDelivered);
});

test('a fresh source on the other line still blocks a second line after a personal-memory reset',async t=>{
 const {s,config,engine}=dualMemoryFixture(t),sent=[],transport=memoryTransport(sent);t.mock.timers.tick(2000);s.enqueue(event('FRESHRED001',Date.now(),R));await drain(s,config,transport,engine);assert.equal(sent.length,1);
 t.mock.timers.tick(2000);s.enqueue(event('FRESHBLUE001',Date.now(),B));await drain(s,config,transport,engine);assert.equal(sent.length,1);assert.equal(s.hasSourcesOutsideLine(P,B),true);assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get('FRESHBLUE001').state,'OPERATIONAL_SCOPE_REVIEW');
});

test('fresh cross-line evidence arriving after Engine still stops its ready reply at flush',async t=>{
 const {s,config,engine}=dualMemoryFixture(t),sent=[];t.mock.timers.tick(2000);const e=event('ENGINEFRESH001',Date.now(),R);s.enqueue(e);await engine.process(e);assert.equal(s.db.prepare('SELECT state FROM outbox WHERE id=?').get(e.id+':reply').state,'READY');
 t.mock.timers.tick(2000);s.enqueue(event('NEWFOREIGN001',Date.now(),B));await flushOutbox(s,config,memoryTransport(sent));assert.deepEqual(sent,[]);assert.equal(s.db.prepare('SELECT state FROM outbox WHERE id=?').get(e.id+':reply').state,'OPERATIONAL_SCOPE_REVIEW');
});

for(const state of ['UNCERTAIN','ACCEPTED','SENDING'])test('an archived foreign '+state+' receipt is preserved and still blocks a fresh send',async t=>{
 const {s,config,engine}=dualMemoryFixture(t);s.db.prepare('UPDATE outbox SET state=? WHERE id=?').run(state,'old-output');const old=s.db.prepare("SELECT * FROM outbox WHERE id='old-output'").get(),sent=[];
 t.mock.timers.tick(2000);s.enqueue(event('NEWBLOCKED001',Date.now(),R));await drain(s,config,memoryTransport(sent),engine);assert.deepEqual(sent,[]);assert.equal(s.hasSourcesOutsideLine(P,R),true);assert.deepEqual(s.db.prepare("SELECT * FROM outbox WHERE id='old-output'").get(),old);assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get('NEWBLOCKED001').state,'OPERATIONAL_SCOPE_REVIEW');
});

test('only questions cancelled by the explicit reset lose their previous-line blocking role',t=>{
 const {s}=dualMemoryFixture(t);assert.equal(s.hasSourcesOutsideLine(P,B),false);assert.equal(s.hasSourcesOutsideLine(P,R),false);
 for(const [table,id] of [['questions','old-unrouted'],['questions','old-routed'],['tesa_questions','old-tesa']]){s.db.prepare('UPDATE '+table+" SET state='ANSWERED' WHERE id=?").run(id);assert.equal(s.hasSourcesOutsideLine(P,id==='old-tesa'?B:R),true);s.db.prepare('UPDATE '+table+" SET state='CANCELLED_MEMORY_RESET' WHERE id=?").run(id);}
 assert.equal(s.hasSourcesOutsideLine(P,R),false);
});

test('malformed, unknown-line or not-wholly-old prior-history checks cannot be exempted by a memory reset',t=>{
 const {s}=dualMemoryFixture(t),prior=s.priorHistory(P);assert.equal(s.hasSourcesOutsideLine(P,R),false);
 for(const patch of [{cutoff:now+1},{checks:null},{checks:[null]},{checks:[{line:B,total:1}]},{checks:[{line:B,total:1,lastAt:now}]},{checks:[{line:B,total:-1,lastAt:now-20000}]},{checks:[{line:'573000099999',total:1,lastAt:prior.cutoff-1000}]}]){
  s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({...prior,...patch}),'prior-history:'+P);assert.equal(s.hasSourcesOutsideLine(P,R),true);
 }
 s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal(prior),'prior-history:'+P);assert.equal(s.hasSourcesOutsideLine(P,R),false);
});

test('unknown output, private-question or legacy TESA question states remain foreign evidence after reset',t=>{
 const s=fixture(t);reset(s);assert.equal(s.hasSourcesOutsideLine(P,R),false);
 s.db.prepare("UPDATE outbox SET state=NULL WHERE id='old-output'").run();const unknownOutput=s.db.prepare("SELECT * FROM outbox WHERE id='old-output'").get();assert.equal(s.hasSourcesOutsideLine(P,R),true);assert.deepEqual(s.db.prepare("SELECT * FROM outbox WHERE id='old-output'").get(),unknownOutput);s.db.prepare("UPDATE outbox SET state='READ' WHERE id='old-output'").run();assert.equal(s.hasSourcesOutsideLine(P,R),false);
 s.db.prepare('INSERT INTO questions(id,phone,case_id,state) VALUES(?,?,?,NULL)').run('fresh-unknown-question',P,'unverified-case');assert.equal(s.hasSourcesOutsideLine(P,R),true);
 s.db.prepare("UPDATE questions SET state='PENDING' WHERE id=?").run('fresh-unknown-question');assert.equal(s.hasSourcesOutsideLine(P,R),true);
 s.db.prepare("UPDATE questions SET state='CANCELLED_MEMORY_RESET' WHERE id=?").run('fresh-unknown-question');assert.equal(s.hasSourcesOutsideLine(P,R),false);
 // Older local tables can lack the current schema's NOT NULL constraint.
 s.db.exec('CREATE TABLE tesa_questions(id TEXT,customer_phone TEXT,source_line TEXT,state TEXT)');s.db.prepare('INSERT INTO tesa_questions VALUES(?,?,?,NULL)').run('legacy-null-tesa',P,B);assert.equal(s.hasSourcesOutsideLine(P,R),true);
 s.db.prepare("UPDATE tesa_questions SET state='PENDING'").run();assert.equal(s.hasSourcesOutsideLine(P,R),true);s.db.prepare("UPDATE tesa_questions SET state='CANCELLED_MEMORY_RESET'").run();assert.equal(s.hasSourcesOutsideLine(P,R),false);
});

test('a cancelled marker never exempts missing, unknown or third-line question routes',t=>{
 const s=fixture(t),foreign='573000099999';reset(s);
 s.db.prepare("INSERT INTO questions(id,phone,case_id,state) VALUES('cancelled-q',?,'old-case','CANCELLED_MEMORY_RESET')").run(P);assert.equal(s.hasSourcesOutsideLine(P,R),false);
 s.db.prepare("UPDATE questions SET outbox_id='missing-route' WHERE id='cancelled-q'").run();assert.equal(s.hasSourcesOutsideLine(P,R),true);
 s.queue('missing-route','573016803926',foreign,'Pregunta antigua',true,0);assert.equal(s.hasSourcesOutsideLine(P,R),true);
 s.db.prepare("UPDATE outbox SET line=NULL WHERE id='missing-route'").run();assert.equal(s.hasSourcesOutsideLine(P,R),true);s.db.prepare("UPDATE outbox SET line=? WHERE id='missing-route'").run(B);assert.equal(s.hasSourcesOutsideLine(P,R),false);
 s.db.prepare("INSERT INTO question_routes(question_id,recipient,line,outbox_id) VALUES('cancelled-q','573016803926',?,'missing-route')").run(foreign);assert.equal(s.hasSourcesOutsideLine(P,R),true);
 s.db.prepare("UPDATE question_routes SET line=NULL").run();assert.equal(s.hasSourcesOutsideLine(P,R),true);s.db.prepare('UPDATE question_routes SET line=?').run(B);assert.equal(s.hasSourcesOutsideLine(P,R),false);
 s.db.exec('CREATE TABLE tesa_questions(id TEXT,customer_phone TEXT,source_line TEXT,state TEXT)');s.db.prepare("INSERT INTO tesa_questions VALUES('cancelled-tesa',?,?,'CANCELLED_MEMORY_RESET')").run(P,foreign);assert.equal(s.hasSourcesOutsideLine(P,R),true);
 s.db.prepare('UPDATE tesa_questions SET source_line=NULL').run();assert.equal(s.hasSourcesOutsideLine(P,R),true);s.db.prepare('UPDATE tesa_questions SET source_line=?').run(B);assert.equal(s.hasSourcesOutsideLine(P,R),false);
});
