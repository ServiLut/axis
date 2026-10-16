// All provider responses and chief events in this file are synthetic. The
// fetcher cannot make network requests, and the Store is always in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Transport} from '../automation/service-bots/transport.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,getTesaConfig} from '../automation/service-bots/tesa-config.mjs';
import {drainTesaGroup} from '../automation/service-bots/tesa-transport.mjs';
import {CHIEF_TESA_TEST_CYCLE as CYCLE,CHIEF_TESA_TEST_LINE as BLUE,CHIEF_TESA_TEST_CHIEF as CHIEF,CHIEF_TESA_TEST_TEXT as TEXT,chiefTesaTestHash as hash,parseChiefTesaTestCommand,executeChiefTesaTest,chiefTesaTestStatus} from '../automation/service-bots/chief-tesa-test.mjs';
const RED='573126938721',STAFF='573000008765',START=Date.parse('2026-10-16T22:20:00.000Z'),SEND='María Ángel, envía la pregunta PRUEBA a TESA.',LOOKUP='María Ángel, consulta la pregunta PRUEBA de TESA.',KEY='chief-tesa-test:'+CYCLE,MID='SYNTHETIC_TESA_TEST_OUTPUT';
function fixture(t){
 t.mock.timers.enable({apis:['Date'],now:START});
 const s=new Store(':memory:','fumigacion',randomBytes(32)),line={phone:BLUE,instance:'synthetic-blue-only',apiKey:'synthetic-no-network'},c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:false,chiefOnly:true,replyOnlyToChief:true,activatedAt:START-60000,provider:'https://synthetic.invalid',lines:[line,{phone:RED,instance:'synthetic-red-never-read',apiKey:'unused'}],chiefTesaTest:{enabled:true,cycleId:CYCLE,startsAt:START,expiresAt:START+3600000},tesaOperations:{enabled:true,senderLine:BLUE,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,activatedAt:START-30000,allowedParticipantPhones:[CHIEF,STAFF],verifiedMembership:{owner:BLUE,ownerOpen:true,verifiedAt:START,expiresAt:START+300000,sourceHash:'a'.repeat(64),participantPhones:[BLUE,CHIEF,STAFF],participantBindings:[BLUE,CHIEF,STAFF].map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}}};
 let sequence=0,sends=0,owners=0,groupReads=0,finds=0,sendAt=null,mode=null,nativeRows=null;
 c.mariaProgram={enabled:true,token:'synthetic_ordinary_'.padEnd(43,'a'),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',tenantId:'9ffea9df-1e06-4590-acec-0e5cde715ba9',companyId:'35a19d89-15d1-4c32-8353-3471b6d9f0ff',startsAt:START-60000,expiresAt:START+7200000};
 c.mariaTestOrder={enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-test-order',token:'synthetic_test_order_'.padEnd(43,'b'),actorId:c.mariaProgram.actorId,tenantId:c.mariaProgram.tenantId,companyId:c.mariaProgram.companyId,startsAt:START,expiresAt:START+3600000};
 const entry=()=>{const row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(KEY);return row&&s.open(row.value);};
 const source=(text=SEND,patch={})=>{t.mock.timers.tick(1100);const e={id:'SYNTHETIC_CHIEF_TESA_'+ ++sequence,phone:CHIEF,line:BLUE,kind:'text',fromMe:false,forwarded:false,quotedId:null,at:Date.now(),text,...patch};s.enqueue(e);return e;};
 const proof=e=>({verified:true,sourceId:e.id,phone:e.phone,line:e.line,at:e.at});
 const outgoing=patch=>({id:'SYNTHETIC_NATIVE_PARENT',key:{id:MID,remoteJid:TESA_GROUP_JID,fromMe:true},message:{conversation:TEXT},messageTimestamp:Math.floor((sendAt??Date.now())/1000),MessageUpdate:[{status:'DELIVERY_ACK'}],...patch});
 const fetcher=async(url,options)=>{
  assert.ok(url.startsWith(c.provider+'/'));assert.doesNotMatch(url,/synthetic-red/);let data;
  if(url.includes('/instance/fetchInstances')){owners++;data=[{name:line.instance,ownerJid:(mode==='wrong-owner'||mode==='wrong-owner-after'&&sends?STAFF:BLUE)+'@s.whatsapp.net',connectionStatus:'open'}];}
  else if(url.includes('/group/findGroupInfos/')){groupReads++;data={id:TESA_GROUP_JID,subject:mode==='wrong-group'?TESA_GROUP_SUBJECT+' changed':TESA_GROUP_SUBJECT,size:3,participants:[BLUE,CHIEF,STAFF].map(phone=>({id:phone+'@s.whatsapp.net'}))};if(mode==='race'&&groupReads===1){const e=entry();s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({...e,updatedAt:e.updatedAt+1}),KEY);}}
  else if(url.includes('/message/sendText/')){sends++;sendAt=Date.now();assert.equal(entry().status,'SENDING');assert.equal(entry().sendAttempts,1);assert.deepEqual(JSON.parse(options.body),{number:TESA_GROUP_JID,text:TEXT,linkPreview:false});if(mode==='timeout')throw Error('SYNTHETIC_UNCERTAIN_SEND');data={key:{id:MID,remoteJid:mode==='wrong-receipt-group'?'another@g.us':TESA_GROUP_JID,fromMe:true}};}
  else if(url.includes('/chat/findMessages/')){
   finds++;const body=JSON.parse(options.body),id=body.where.key.id,row=id&&s.db.prepare('SELECT body FROM events WHERE id=?').get(id);
   if(row){const e=s.open(row.body);data={messages:{total:1,records:[{key:{id:e.id,remoteJid:e.phone+'@s.whatsapp.net',fromMe:false},message:{conversation:mode==='bad-native-source'?e.text+' altered':e.text},messageTimestamp:e.at/1000}]}};}
   else {const rows=nativeRows??[outgoing()];data={messages:{total:mode==='overflow'?101:rows.length,records:rows}};}
  }else throw Error('UNEXPECTED_SYNTHETIC_ROUTE:'+url);
  return {ok:true,json:async()=>data};
 };
 const transport=new Transport(c,fetcher),run=async(action='send',patch={})=>{const e=source(action==='send'?SEND:LOOKUP,patch);return executeChiefTesaTest(s,c,transport,{source:e,native:proof(e),action});};
 return {s,c,line,transport,source,proof,run,entry,outgoing,mode:value=>mode=value,rows:value=>nativeRows=value,stats:()=>({sends,owners,groupReads,finds}),close:()=>s.close()};
}
const using=async(t,fn)=>{const f=fixture(t);try{await fn(f);}finally{f.close();}};
test('the fixed test has one readable question, no private identifiers, no reservation and a required quoted response',()=>{
 assert.ok(TEXT.length<=1200);assert.match(TEXT,/PRUEBA — NO RESERVAR/);assert.match(TEXT,/17\/oct\/2026/);assert.match(TEXT,/¿Qué técnico y qué franja/);assert.match(TEXT,/Ejemplo de respuesta/);assert.match(TEXT,/respondan citando este mensaje/);assert.doesNotMatch(TEXT,/57\d{10}|https?:|\b(?:Calle|Carrera)\b|\$\d/);
 assert.deepEqual(parseChiefTesaTestCommand(SEND),{action:'send'});assert.deepEqual(parseChiefTesaTestCommand(LOOKUP),{action:'lookup'});
 for(const text of ['envía a TESA','María Ángel, ¿envía la pregunta PRUEBA a TESA?','Sandra dijo: '+SEND,SEND+' y reserva',null,{}])assert.equal(parseChiefTesaTestCommand(text),null);
});
test('default OFF and the customer pause are independent gates, without creating a cycle',t=>using(t,async f=>{
 delete f.c.chiefTesaTest;assert.equal(chiefTesaTestStatus(f.s,f.c).enabled,false);await assert.rejects(f.run(),/LIMITED_ACCESS_REQUIRED/);assert.equal(f.entry(),undefined);assert.equal(f.stats().sends,0);
}));
test('one exact new chief source reserves a durable cycle before one dedicated send; only native delivery completes it',t=>using(t,async f=>{
 assert.ok(getTesaConfig(f.c));const before=JSON.stringify(f.c);const accepted=await f.run();assert.equal(accepted.status,'ACCEPTED');assert.equal(accepted.deliveryVerified,false);assert.equal(f.entry().source.text,SEND);assert.equal(f.entry().textHash,hash(TEXT));const done=await f.run('lookup');assert.equal(done.status,'DELIVERED');assert.equal(done.deliveryVerified,true);assert.equal(f.stats().sends,1);assert.ok(f.stats().owners>=4);assert.ok(f.stats().groupReads>=4);assert.equal(f.c.enabled,false);assert.equal(f.c.replyOnlyToChief,true);assert.ok(before.includes('chiefOnly'));
 for(const table of ['outbox','tesa_outbox','tesa_questions']){const exists=f.s.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);if(exists)assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);}
}));
test('a second send command preserves the same fixed cycle and never creates or replays another question',t=>using(t,async f=>{
 await f.run();const original=f.entry(),snapshot=JSON.stringify(original.source),second=await f.run();assert.equal(second.existingCyclePreserved,true);assert.equal(second.lookupOnly,true);assert.equal(f.stats().sends,1);assert.equal(JSON.stringify(f.entry().source),snapshot);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'chief-tesa-test:%'").get().n,1);
}));
for(const [name,patch] of [['other-chief',{phone:STAFF}],['red',{line:RED}],['outgoing',{fromMe:true}],['forwarded',{forwarded:true}],['quoted',{quotedId:'ANOTHER_SOURCE'}],['old',{at:START-121000}],['future',{at:START+100000}]])test('unverified or non-direct authority cannot prepare the cycle: '+name,t=>using(t,async f=>{
 await assert.rejects(f.run('send',patch));assert.equal(f.entry(),undefined);assert.equal(f.stats().sends,0);
}));
for(const [name,mutate] of [['customers-open',c=>c.enabled=true],['not-chief-only',c=>c.chiefOnly=false],['not-sandra-restricted',c=>c.replyOnlyToChief=false],['wrong-cycle',c=>c.chiefTesaTest.cycleId='ANOTHER_CYCLE'],['expired',c=>c.chiefTesaTest.expiresAt=START],['extended',c=>c.chiefTesaTest.expiresAt=Date.parse('2026-11-07T16:56:52.680Z')],['other-group',c=>c.tesaOperations.groupJid='another@g.us'],['source-grant-disabled',c=>c.mariaTestOrder.enabled=false],['source-grant-expired',c=>c.mariaTestOrder.expiresAt=START],['source-grant-different-cutoff',c=>c.mariaTestOrder.startsAt=START-1],['source-grant-unverified-token',c=>c.mariaTestOrder.token=c.mariaProgram.token]])test('no test-send permission outside the fixed paused scope: '+name,t=>using(t,async f=>{
 mutate(f.c);await assert.rejects(f.run());assert.equal(f.entry(),undefined);assert.equal(f.stats().sends,0);
}));
for(const mode of ['wrong-owner','wrong-group','bad-native-source','race'])test('fresh own owner/group/source and unchanged reserved ledger are required before raw sending: '+mode,t=>using(t,async f=>{
 f.mode(mode);const result=await f.run();assert.equal(result.status,'UNCERTAIN');assert.equal(f.stats().sends,0);assert.equal(f.entry().sendAttempts,1);await f.run();assert.equal(f.stats().sends,0);
}));
test('a send timeout stays uncertain across a new Transport and can only be found natively, without another send',t=>using(t,async f=>{
 f.mode('timeout');const result=await f.run();assert.equal(result.status,'UNCERTAIN');assert.equal(result.mid,null);f.mode(null);const source=f.source(LOOKUP),restarted=new Transport(f.c,f.transport.fetcher);const found=await executeChiefTesaTest(f.s,f.c,restarted,{action:'lookup',source,native:f.proof(source)});assert.equal(found.status,'DELIVERED');assert.equal(found.mid,MID);assert.equal(f.stats().sends,1);await f.run();assert.equal(f.stats().sends,1);
}));
test('a failed owner check after the response retains its MID as uncertain rather than losing it or resending',t=>using(t,async f=>{
 f.mode('wrong-owner-after');const result=await f.run();assert.equal(result.status,'UNCERTAIN');assert.equal(result.mid,MID);assert.equal(f.stats().sends,1);f.mode(null);const done=await f.run('lookup');assert.equal(done.status,'DELIVERED');assert.equal(f.stats().sends,1);
}));
test('a valid observed MID with a contradictory receipt group is retained as uncertain without certifying identity or delivery',t=>using(t,async f=>{
 f.mode('wrong-receipt-group');const result=await f.run();assert.equal(result.status,'UNCERTAIN');assert.equal(result.mid,MID);assert.equal(result.deliveryVerified,false);assert.equal(f.entry().mid,MID);assert.equal(f.stats().sends,1);await f.run();assert.equal(f.stats().sends,1);
}));
for(const mode of ['no-ack','wrong-text','wrong-group','edited','quoted','forwarded','duplicate','overflow','old-time','different-mid','other-line-participant','unlinked-update','other-instance-update','other-key-id-update','other-nested-key-update','other-message-key-update','mixed-failed','unlinked-envelope-ack'])test('incomplete or contradictory native evidence cannot prove delivery: '+mode,t=>using(t,async f=>{
 await f.run();const r=f.outgoing();if(mode==='no-ack')r.MessageUpdate=[];if(mode==='wrong-text')r.message.conversation+=' changed';if(mode==='wrong-group')r.key.remoteJid='another@g.us';if(mode==='edited')r.MessageUpdate.push({status:'EDITED'});if(mode==='quoted')r.message.messageContextInfo={stanzaId:'ANOTHER_SOURCE'};if(mode==='forwarded')r.message.messageContextInfo={isForwarded:true};if(mode==='old-time')r.messageTimestamp=START/1000-20;if(mode==='different-mid')r.key.id='DIFFERENT_NATIVE_MID';if(mode==='other-line-participant')r.key.participant=RED+'@s.whatsapp.net';if(mode==='unlinked-update')r.MessageUpdate=[{status:'DELIVERY_ACK',messageId:'OTHER_NATIVE_ROW'}];if(mode==='other-instance-update'){r.instanceId='SYNTHETIC_OWN_DB_INSTANCE';r.MessageUpdate=[{status:'DELIVERY_ACK',instanceId:'OTHER_DB_INSTANCE'}];}if(mode==='other-key-id-update')r.MessageUpdate=[{status:'DELIVERY_ACK',keyId:'OTHER_NATIVE_MID'}];if(mode==='other-nested-key-update')r.MessageUpdate=[{status:'DELIVERY_ACK',key:{id:'OTHER_NATIVE_MID'}}];if(mode==='other-message-key-update')r.MessageUpdate=[{status:'DELIVERY_ACK',messageKeyId:'OTHER_NATIVE_MID'}];if(mode==='mixed-failed')r.MessageUpdate.push({status:'FAILED'});if(mode==='unlinked-envelope-ack'){r.MessageUpdate=[];r.update={status:'DELIVERY_ACK'};}f.rows(mode==='duplicate'?[r,structuredClone(r)]:[r]);if(mode==='overflow')f.mode('overflow');
 try{const result=await f.run('lookup');assert.equal(result.deliveryVerified,false);}catch(error){assert.match(error.message,/CHIEF_TESA_TEST_/);}assert.equal(chiefTesaTestStatus(f.s,f.c).deliveryVerified,false);assert.equal(f.stats().sends,1);
}));
test('generic sends and ordinary TESA drains remain closed even when the dedicated fixture is allowed',t=>using(t,async f=>{
 await assert.rejects(f.transport.request(f.line,'/message/sendText/'+f.line.instance,{number:TESA_GROUP_JID,text:TEXT}),/CHIEF_ONLY_DELIVERY_RESTRICTION/);await assert.rejects(f.transport.send({phone:STAFF,line:BLUE,internal:0},'hello'),/CHIEF_ONLY_DELIVERY_RESTRICTION/);const result=await drainTesaGroup(f.s,f.c,f.transport);assert.equal(result.restrictedToChief,true);assert.equal(f.stats().sends,0);await f.run();assert.equal(f.stats().sends,1);assert.equal(f.c.enabled,false);
}));
