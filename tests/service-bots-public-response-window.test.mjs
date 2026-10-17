import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,HILARY,CURRENT_OPERATOR_ROUTING,configFromEnv} from '../automation/service-bots/config.mjs';
import {Transport,drain,flushOutbox} from '../automation/service-bots/transport.mjs';
import {publicResponseWindowConfig,publicResponseWindow,publicOperationAllowed,publicEventAllowed,publicOutboxAllowed,publicTesaOutboxAllowed} from '../automation/service-bots/public-response-window.mjs';
import {drainTesaGroup} from '../automation/service-bots/tesa-transport.mjs';
import {queueTesaGuidanceList,drainTesaGuidanceLists} from '../automation/service-bots/tesa-guidance-list.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {FUMIGACION_BLUE,BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';
import {initializeInactivityFollowup,inactivityCandidate} from '../automation/service-bots/inactivity-followup.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';

const customer='573001112233';
function fixture(company='fumigacion'){
 const now=Date.now(),c={company,...BUSINESSES[company],enabled:true,chiefOnly:true,replyOnlyToChief:false,activatedAt:now-86400000,
  publicResponseStartsAt:now-2000,provider:'https://synthetic.invalid',operatorRouting:CURRENT_OPERATOR_ROUTING,
  lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'synthetic-public-'+i,apiKey:String(i).repeat(32)}))};
 const s=new Store(':memory:',company,randomBytes(32));initializeInactivityFollowup(c,s,now);return {now,c,s,e:new Engine(s,c)};
}
const withFixture=async fn=>{const f=fixture();try{await fn(f);}finally{f.s.close();}};
function event(f,id='FRESH_PUBLIC_SOURCE_001',at=f.now-500,phone=customer){return {id,phone,line:f.c.lines[0].phone,at,fromMe:false,kind:'text',text:'Hola'};}
function oldOut(f,id='old-ready',phone=SANDRA,created=f.c.publicResponseStartsAt-1){f.s.queue(id,phone,f.c.lines[0].phone,'Texto original intacto.',phone===SANDRA,0);f.s.db.prepare('UPDATE outbox SET created=?,updated=? WHERE id=?').run(created,created,id);}
function tesa(f){
 const phones=[...TESA_BOT_PHONES,HILARY];f.c.tesaOperations={enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:f.c.lines[0].phone,activatedAt:f.c.activatedAt,allowedParticipantPhones:[HILARY],
  verifiedMembership:{owner:f.c.lines[0].phone,ownerOpen:true,verifiedAt:f.now-10,expiresAt:f.now+240000,sourceHash:'a'.repeat(64),participantPhones:phones,participantBindings:phones.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}};
}

test('optional own cutoff accepts only canonical UTC after the original activation',()=>{
 const activation=Date.parse('2026-10-17T10:00:00.000Z'),good='2026-10-17T13:00:00.000Z';
 assert.equal(publicResponseWindowConfig({},'fumigacion',activation),null);
 assert.equal(publicResponseWindowConfig({BOT_PUBLIC_RESPONSE_STARTS_AT:good},'fumigacion',activation),Date.parse(good));
 for(const value of ['',null,'today','2026-10-17','2026-10-17T13:00:00-05:00','2026-10-17T13:00:00Z','2026-02-30T13:00:00.000Z','2026-10-17T09:59:59.999Z'])assert.throws(()=>publicResponseWindowConfig({BOT_PUBLIC_RESPONSE_STARTS_AT:value},'fumigacion',activation),/PUBLIC_RESPONSE_CUTOFF_REQUIRED/);
 assert.equal(publicResponseWindowConfig({BOT_PUBLIC_RESPONSE_STARTS_AT:'malformed'},'servicio-tecnico',activation),null);
});
test('config retains original activation and reports the distinct public cut without changing another business',()=>{
 const f=fixture();try{
 const env={BOT_COMPANY:f.c.company,BOT_LINES_JSON:JSON.stringify(f.c.lines),BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'b'.repeat(64),BOT_DATA_KEY:'c'.repeat(64),BOT_DATABASE_PATH:'/data/fumigacion/bot.sqlite',BOT_EVOLUTION_URL:f.c.provider,BOT_ACTIVATED_AT:new Date(f.c.activatedAt).toISOString(),BOT_ENABLED:'true',BOT_PRIOR_HISTORY_CHECK:'true',BOT_PUBLIC_RESPONSE_STARTS_AT:new Date(f.c.publicResponseStartsAt).toISOString()};
 const c=configFromEnv(env);assert.equal(c.activatedAt,f.c.activatedAt);assert.equal(c.publicResponseStartsAt,f.c.publicResponseStartsAt);assert.equal(publicResponseWindow(c).active,true);
 }finally{f.s.close();}
});
test('malformed direct clock closes source and queue gates; default, pause and Miguel retain their contracts',()=>withFixture(async f=>{
 assert.equal(publicOperationAllowed(f.c,{sourceAt:f.now,createdAt:f.now},f.now),true);
 for(const patch of [{sourceAt:f.c.publicResponseStartsAt-1,createdAt:f.now},{sourceAt:f.now,createdAt:f.c.publicResponseStartsAt-1},{sourceAt:NaN,createdAt:f.now},{sourceAt:f.now,createdAt:null},{sourceAt:f.now+61000,createdAt:f.now}])assert.equal(publicOperationAllowed(f.c,patch,f.now),false);
 assert.equal(publicEventAllowed(f.c,{at:f.now,received_at:null},f.now),false);
 for(const bad of [NaN,'yesterday',f.c.activatedAt-1])assert.equal(publicOperationAllowed({...f.c,publicResponseStartsAt:bad},{sourceAt:f.now,createdAt:f.now},f.now),false);
 for(const c of [{...f.c,publicResponseStartsAt:null},{...f.c,enabled:false},{...f.c,company:'servicio-tecnico',publicResponseStartsAt:NaN}])assert.equal(publicOperationAllowed(c,{sourceAt:NaN,createdAt:NaN},f.now),true);
}));
test('old PENDING rows do not consume the fast LIMIT or run a model; a fresh real Engine greeting flows',()=>withFixture(async f=>{
 f.c.responseTargetMs=3000;
 for(let i=0;i<35;i++){const e=event(f,'OLD_PUBLIC_SOURCE_'+String(i).padStart(3,'0'),f.c.publicResponseStartsAt-1000-i,'57300000'+String(i).padStart(4,'0'));f.s.enqueue(e);f.s.db.prepare('UPDATE events SET received_at=? WHERE id=?').run(f.c.publicResponseStartsAt-500,e.id);}
 const before=f.s.db.prepare('SELECT * FROM events ORDER BY rowid').all(),fresh=event(f);f.s.enqueue(fresh);const sent=[];
 const result=await drain(f.s,f.c,{understand:async()=>{throw Error('NO_GREETING_MODEL');},verifyLine:async()=>{},send:async(row,text)=>{sent.push({row,text});return 'FRESH_PUBLIC_REPLY_001';}},f.e);
 assert.equal(result.processed,1);assert.equal(sent.length,1);assert.equal(sent[0].row.phone,customer);assert.match(sent[0].text,/Hola|María/);assert.deepEqual(f.s.db.prepare('SELECT * FROM events WHERE id<>? ORDER BY rowid').all(fresh.id),before);
}));
test('thirty old READY reports remain byte-for-byte and do not starve a fresh chief result',()=>withFixture(async f=>{
 for(let i=0;i<30;i++)oldOut(f,'old-chief-report-'+i);
 const before=f.s.db.prepare('SELECT * FROM outbox ORDER BY rowid').all();f.s.queue('fresh-chief-result',SANDRA,f.c.lines[0].phone,'Resultado nuevo solicitado.',true,0);const calls=[];
 const result=await flushOutbox(f.s,f.c,{verifyLine:async()=>{},send:async row=>{calls.push(row.id);return 'FRESH_CHIEF_RESULT_001';}});
 assert.equal(result.accepted,1);assert.deepEqual(calls,['fresh-chief-result']);assert.deepEqual(f.s.db.prepare("SELECT * FROM outbox WHERE id<>'fresh-chief-result' ORDER BY rowid").all(),before);
}));
test('a freshly queued customer output based solely on an old incoming source is preserved without sending',()=>withFixture(async f=>{
 const e=event(f,'OLD_CUSTOMER_SOURCE_001',f.c.publicResponseStartsAt-1000);f.s.enqueue(e);const conv=f.s.conversation(customer);f.s.queue(e.id+':reply',customer,e.line,'Respuesta que no debe salir.',false,conv.revision,'fumigacion:'+e.id);
 const before=f.s.db.prepare('SELECT * FROM outbox').all();let sends=0;assert.equal(publicOutboxAllowed(f.s,f.c,before[0]),false);
 await flushOutbox(f.s,f.c,{verifyLine:async()=>{throw Error('NO_OWNER_CHECK');},send:async()=>{sends++;}});assert.equal(sends,0);assert.deepEqual(f.s.db.prepare('SELECT * FROM outbox').all(),before);
}));
test('public cutoff changed during channel await prevents reservation and leaves READY intact',()=>withFixture(async f=>{
 const e=event(f);f.s.enqueue(e);const revision=f.s.conversation(customer).revision;f.s.queue(e.id+':reply',customer,e.line,'Hola, con gusto te ayudo.',false,revision,'fumigacion:'+e.id);const before=f.s.db.prepare('SELECT * FROM outbox').all();let sends=0;
 await flushOutbox(f.s,f.c,{verifyLine:async()=>{f.c.publicResponseStartsAt=Date.now()+1000;},send:async()=>{sends++;}});assert.equal(sends,0);assert.deepEqual(f.s.db.prepare('SELECT * FROM outbox').all(),before);
}));
test('fresh sources never release a human hold or revive uncertain prior sends',()=>withFixture(async f=>{
 const e=event(f);f.s.enqueue(e);f.s.hold(customer,'STAFF_HOLD_KEPT');oldOut(f,'old-uncertain');f.s.db.prepare("UPDATE outbox SET state='UNCERTAIN',mid='PRIOR_UNCERTAIN_MID' WHERE id='old-uncertain'").run();const prior=f.s.db.prepare("SELECT * FROM outbox WHERE id='old-uncertain'").get();
 let sends=0;await drain(f.s,f.c,{verifyLine:async()=>{},send:async()=>{sends++;}},f.e);assert.equal(sends,0);assert.equal(f.s.conversation(customer).hold,1);assert.deepEqual(f.s.db.prepare("SELECT * FROM outbox WHERE id='old-uncertain'").get(),prior);
}));
test('real private transport rejects a historical queue before any HTTP',()=>withFixture(async f=>{
 let calls=0;const transport=new Transport(f.c,async()=>{calls++;throw Error('NO_HTTP');});
 await assert.rejects(()=>transport.send({phone:SANDRA,line:f.c.lines[0].phone,internal:true,created:f.c.publicResponseStartsAt-1},'Original'),/PUBLIC_RESPONSE_WINDOW_REQUIRED/);assert.equal(calls,0);
}));
test('TESA READY from an older customer source is retained while current sources qualify',()=>withFixture(async f=>{
 tesa(f);const e=event(f,'TESA_ORIGINAL_SOURCE_001',f.c.publicResponseStartsAt-1000);f.s.enqueue(e);const caseId='fumigacion:'+e.id;f.s.saveConversation(customer,{caseId,slots:{service:'cucarachas',location:'medellin'}});
 routeCaseQuestion(f.s,f.c,{phone:customer,line:e.line,caseId,topic:'disponibilidad-y-tecnico',conditions:{service:'cucarachas',location:'medellin'},source:e.id,recipients:[HILARY],text:'¿Qué disponibilidad hay para este caso?'});
 const before=f.s.db.prepare('SELECT * FROM tesa_outbox').all();assert.equal(before.length,1);assert.equal(publicTesaOutboxAllowed(f.s,f.c,before[0]),false);let sends=0;
 await drainTesaGroup(f.s,f.c,{request:async()=>{sends++;throw Error('NO_NETWORK_REQUIRED');},verifyLine:async()=>{throw Error('NO_OWNER_CHECK');}});assert.equal(sends,0);assert.deepEqual(f.s.db.prepare('SELECT * FROM tesa_outbox').all(),before);
 const fresh=event(f,'TESA_FRESH_SOURCE_001',f.now-200,'573001112244');f.s.enqueue(fresh);const freshCase='fumigacion:'+fresh.id;f.s.saveConversation(fresh.phone,{caseId:freshCase,slots:{service:'cucarachas',location:'medellin'}});
 routeCaseQuestion(f.s,f.c,{phone:fresh.phone,line:fresh.line,caseId:freshCase,topic:'disponibilidad-y-tecnico',conditions:{service:'cucarachas',location:'medellin'},source:fresh.id,recipients:[HILARY],text:'¿Qué disponibilidad hay para este nuevo caso?'});
 const freshRow=f.s.db.prepare('SELECT * FROM tesa_outbox WHERE customer_phone=?').get(fresh.phone);assert.equal(publicTesaOutboxAllowed(f.s,f.c,freshRow),true);
 const result=await drainTesaGroup(f.s,f.c,{verifyLine:async()=>{},request:async(_line,path)=>{assert.match(path,/message\/sendText\//);sends++;return {key:{id:'TESA_NEW_SEND_001',remoteJid:TESA_GROUP_JID}};}});assert.equal(result.accepted,1);assert.equal(sends,1);assert.deepEqual(f.s.db.prepare('SELECT * FROM tesa_outbox WHERE id=?').get(before[0].id),before[0]);
}));
test('TESA general READY lists created before reopening have no TTL-based revival or row change',()=>withFixture(async f=>{
 tesa(f);f.c.operationalLineScope={company:f.c.company,version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[f.c.lines[1].phone],authorizedAt:new Date(f.c.activatedAt).toISOString()};
 queueTesaGuidanceList(f.s,f.c,{key:'old-general-guidance',sourceHash:'a'.repeat(64),items:[{title:'Consulta general',question:'¿Cómo se aclara un dato pendiente?',example:'Una persona no conoce la información.'}]});
 f.s.db.prepare('UPDATE tesa_guidance_lists SET created=?,updated=?').run(f.c.publicResponseStartsAt-1,f.c.publicResponseStartsAt-1);const before=f.s.db.prepare('SELECT * FROM tesa_guidance_lists').all();let calls=0;
 const result=await drainTesaGuidanceLists(f.s,f.c,{request:async()=>{calls++;throw Error('NO_NETWORK');},verifyLine:async()=>{calls++;throw Error('NO_NETWORK');}});assert.equal(result.accepted,0);assert.equal(calls,0);assert.deepEqual(f.s.db.prepare('SELECT * FROM tesa_guidance_lists').all(),before);
}));
test('inactivity cannot reopen a case whose first source predates the public cut, even after a fresh courtesy',()=>withFixture(async f=>{
 f.c.publicResponseStartsAt=f.now-30*60000;f.c.inactivityFollowupEnabled=true;f.c.mariaProgram={enabled:true,url:'https://synthetic.invalid/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:f.c.activatedAt,expiresAt:f.now+86400000};
 const first=event(f,'OLD_CASE_ANCHOR_001',f.c.publicResponseStartsAt-1),last=event(f,'CURRENT_CASE_COURTESY_001',f.now-21*60000),caseId='fumigacion:'+first.id;f.s.enqueue(first);f.s.enqueue(last);f.s.db.prepare("UPDATE events SET state='DONE',received_at=at+1").run();f.s.saveConversation(customer,{caseId,lastHandledSourceId:last.id,slots:{},asked:['service']});
 f.s.savePriorHistory(customer,{cutoff:f.c.activatedAt,priorOutgoing:false},first.id);
 for(const source of [first,last]){const id=source.id+':reply';f.s.queue(id,customer,source.line,'¿Qué plaga deseas tratar?',false,source===first?1:2,caseId);const row=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id),mid=source.id+'_BOT';if(source===first)f.s.recordFirstBotReply(row,mid,f.c.bot,source.at+50);f.s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED',created=?,updated=? WHERE id=?").run(mid,source.at+10,source.at+50,id);f.s.delivery(mid,source.line,'DELIVERED');f.s.db.prepare('UPDATE outbox SET updated=? WHERE id=?').run(source.at+100,id);}
 assert.ok(inactivityCandidate({...f.c,publicResponseStartsAt:null},f.s,customer,f.now),'the otherwise eligible own delivered case exists');
 assert.equal(inactivityCandidate(f.c,f.s,customer,f.now),null);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM inactivity_followups').get().n,0);
}));
test('a manual outgoing source before reopening holds the customer at ingestion without replaying that PENDING source',()=>withFixture(async f=>{
 const staff={...event(f,'STAFF_MANUAL_BEFORE_PUBLIC_001',f.c.publicResponseStartsAt-1000),fromMe:true,text:'Te atiendo personalmente.'};f.s.enqueue(staff);assert.equal(f.s.conversation(customer).hold,1);const before=f.s.db.prepare('SELECT * FROM events WHERE id=?').get(staff.id);f.s.enqueue(event(f));let sends=0;
 await drain(f.s,f.c,{verifyLine:async()=>{},send:async()=>{sends++;}},f.e);assert.equal(sends,0);assert.equal(f.s.conversation(customer).hold,1);assert.deepEqual(f.s.db.prepare('SELECT * FROM events WHERE id=?').get(staff.id),before);
}));
for(const complete of [true,false])test('native attention closes a manual PENDING source received during an unresolved pre-cut send; coverage complete='+complete,()=>withFixture(async f=>{
 // During the small unresolved send window ingestion cannot safely attribute
 // an outgoing MID. The native pre-send check must retain that uncertainty.
 const seed=event(f,'PRIOR_CUSTOMER_SEED_001',f.c.publicResponseStartsAt-2000);f.s.enqueue(seed);f.s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(seed.id);const conv=f.s.conversation(customer);
 f.s.queue('unresolved-prior-send',customer,seed.line,'Respuesta de resultado incierto.',false,conv.revision,'fumigacion:'+seed.id);f.s.db.prepare("UPDATE outbox SET state='SENDING',created=?,updated=? WHERE id='unresolved-prior-send'").run(f.c.publicResponseStartsAt-1500,f.c.publicResponseStartsAt-1500);
 const staff={...event(f,'UNCLASSIFIED_MANUAL_PRIOR_001',f.c.publicResponseStartsAt-1000),fromMe:true,text:'Yo continuaré atendiendo este caso.'};f.s.enqueue(staff);assert.equal(f.s.conversation(customer).hold,0,'unresolved native author is not falsely classified at ingestion');
 f.s.db.prepare("UPDATE outbox SET state='UNCERTAIN' WHERE id='unresolved-prior-send'").run();const priorEvent=f.s.db.prepare('SELECT * FROM events WHERE id=?').get(staff.id),priorOut=f.s.db.prepare("SELECT * FROM outbox WHERE id='unresolved-prior-send'").get();
 f.c.historyCheckRequired=true;f.s.savePriorHistory(customer,{cutoff:f.c.activatedAt,priorOutgoing:false},seed.id);f.s.enqueue(event(f));let sends=0,attention=0,writes=0;
 await drain(f.s,f.c,{verifyLine:async()=>{},currentAttention:async()=>{attention++;return {complete,through:Date.now(),sources:[{id:staff.id,line:staff.line,at:staff.at}],checks:[]};},fetcher:async()=>{writes++;throw Error('NO_BUSINESS_WRITE');},send:async()=>{sends++;}},f.e);
 assert.equal(attention,1);assert.equal(sends,0);assert.equal(writes,0);assert.equal(f.s.conversation(customer).hold,1);assert.deepEqual(f.s.db.prepare('SELECT * FROM events WHERE id=?').get(staff.id),priorEvent);assert.deepEqual(f.s.db.prepare("SELECT * FROM outbox WHERE id='unresolved-prior-send'").get(),priorOut);
}));
