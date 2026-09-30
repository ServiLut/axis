import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {idleChatSources,enqueueIdleChatResumes,idleResumeDecision,idleReplyStillCurrent} from '../lib/psychology-handover';
import {recordPsychologyStaffTakeover,psychologyStaffSendAllowed,isPsychologyBotEcho,chiefStaffDecision,chiefAddressesBot,chiefPresenceQuestion} from '../lib/psychology-staff-ownership';
import {classifyReceptionHistory,staffObservation} from '../lib/psychology-staff-observation';
import {resumeReception,type ReceptionEvent} from '../lib/psychology-reception';
import {sqlTx} from './psychology-campaign-fixture';

const phone='573000000010';
const event=(patch:Partial<ReceptionEvent>={}):ReceptionEvent=>({id:'staff-1',phone,at:new Date().toISOString(),kind:'text',text:'Con mucho gusto',fromMe:true,...patch});

test('direct presence questions without punctuation do not become silent third-person observations',()=>{
 for(const text of ['Luisa estan funcionando?','Luisa estás funcionando?','Hola Luisa me escuchas','Luisa, ¿estás activa?']){
  const e=event({phone:'573016803926',fromMe:false,text});assert.equal(chiefAddressesBot(e),true,text);assert.equal(chiefPresenceQuestion(e),true,text);
 }
 for(const text of ['Luisa está trabajando','Dile a Luisa que responda','Luisa no respondió hoy','"Luisa estás funcionando?"','Luisa estas funcionando? revisa un pago'])assert.equal(chiefPresenceQuestion(event({phone:'573016803926',fromMe:false,text})),false,text);
 assert.equal(chiefPresenceQuestion(event({text:'Luisa estas funcionando?'})),false);
});

test('staff holds and already queued idle continuations never expire or resume on a timer',async()=>{
 const tx={$queryRaw:()=>{throw Error('no background release expected')}} as never;
 assert.deepEqual(await idleChatSources(tx,15),[]);
 assert.equal(await enqueueIdleChatResumes(tx,240),0);
 assert.equal(idleResumeDecision({humanHold:{kind:'staff'}},null,'original'),null);
 assert.equal(await idleReplyStillCurrent(tx,'idle-resume:original:reply:0',phone),false);
 assert.equal(await idleReplyStillCurrent(tx,'normal:reply:0',phone),true);
});

test('human ingestion cancels queued replies; last send gate blocks claimed replies, late events and protected holds',async()=>{
 const db=new PGlite();try{
 await db.exec('CREATE TABLE "CitasPsicologos"(id BIGINT PRIMARY KEY)');
 await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
 const tx=sqlTx(db) as never;
 await db.query('INSERT INTO "PsicologiaBotConversation"(phone,stage,state) VALUES($1,\'NEED\',\'{}\')',[phone]);
 await db.query('INSERT INTO "PsicologiaBotOutbox"(id,phone,content,status) VALUES(\'queued\',$1,\'Pregunta anterior\',\'PENDING\'),(\'claimed\',$1,\'Respuesta preparada\',\'SENDING\')',[phone]);
 assert.equal(await psychologyStaffSendAllowed(tx,'claimed',phone),true);
 assert.equal(await recordPsychologyStaffTakeover(tx,event()),true);
 assert.equal((await db.query<{status:string}>('SELECT status FROM "PsicologiaBotOutbox" WHERE id=\'queued\'')).rows[0].status,'CANCELLED');
 assert.equal(await psychologyStaffSendAllowed(tx,'claimed',phone),false);
 const c=(await db.query('SELECT stage,state FROM "PsicologiaBotConversation" WHERE phone=$1',[phone])).rows[0] as {stage:string;state:Parameters<typeof resumeReception>[0]};
 assert.equal(c.stage,'HUMAN');assert.equal(c.state.staffMessage?.id,'staff-1');
 // A new customer question is not a release. Only the authorized command calls resumeReception.
 const released=resumeReception(c.state);released.state.staffReleasedAt=new Date(Date.now()+1000).toISOString();
 await db.query('UPDATE "PsicologiaBotConversation" SET stage=$1,state=$2::jsonb WHERE phone=$3',[released.stage,JSON.stringify(released.state),phone]);
 assert.equal(await recordPsychologyStaffTakeover(tx,event({at:new Date(Date.now()-1000).toISOString()})),false);
 assert.equal(await psychologyStaffSendAllowed(tx,'claimed',phone),false);
 await db.query('INSERT INTO "PsicologiaBotOutbox"(id,phone,content,status,"createdAt") VALUES(\'fresh\',$1,\'Respuesta nueva\',\'SENDING\',NOW()+INTERVAL \'2 seconds\')',[phone]);
 assert.equal(await psychologyStaffSendAllowed(tx,'fresh',phone),true);
 // Even if the conversation state update has not run, a new staff event blocks a claimed reply.
 await db.query('INSERT INTO "PsicologiaBotEvent"(id,phone,"eventAt",kind,text,"fromMe","receivedAt") VALUES(\'late\',$1,NOW(),\'text\',\'Ya la atiendo\',true,NOW()+INTERVAL \'3 seconds\')',[phone]);
 assert.equal(await psychologyStaffSendAllowed(tx,'fresh',phone),false);
 await db.exec('DELETE FROM "PsicologiaBotEvent"');
 // Do not replace clinical/review holds, but staff ownership still blocks duplicate replies.
 await db.query('UPDATE "PsicologiaBotConversation" SET stage=\'HUMAN\',state=\'{"humanHold":{"kind":"urgent"}}\' WHERE phone=$1',[phone]);
 await recordPsychologyStaffTakeover(tx,event());
 assert.equal(await psychologyStaffSendAllowed(tx,'claimed',phone),false);
 const urgent=(await db.query('SELECT state FROM "PsicologiaBotConversation" WHERE phone=$1',[phone])).rows[0] as {state:typeof c.state};
 assert.equal(urgent.state.humanHold?.kind,'urgent');
 // Administrative reports to the verified chief remain deliverable.
 await db.query('INSERT INTO "PsicologiaBotOutbox"(id,phone,content,status) VALUES(\'report\',\'573016803926\',\'Resumen\',\'SENDING\')');
 assert.equal(await psychologyStaffSendAllowed(tx,'report','573016803926'),true);
 assert.equal(await psychologyStaffSendAllowed(tx,'report',phone),false);
 }finally{await db.close()}
});

test('bot echo matching is nonempty text, scoped and time-bounded; staff audio still takes ownership',async()=>{
 const db=new PGlite();try{
 await db.exec('CREATE TABLE "CitasPsicologos"(id BIGINT PRIMARY KEY)');
 await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
 const tx=sqlTx(db) as never;
 await db.query('INSERT INTO "PsicologiaBotConversation"(phone) VALUES($1)',[phone]);
 await db.query('INSERT INTO "PsicologiaBotOutbox"(id,phone,content,status,"attemptedAt") VALUES(\'sent\',$1,\'Con mucho gusto\',\'ACCEPTED\',NOW())',[phone]);
 assert.equal(await isPsychologyBotEcho(tx,event()),true);
 assert.equal(await recordPsychologyStaffTakeover(tx,event()),false);
 assert.equal(await isPsychologyBotEcho(tx,event({at:new Date(Date.now()+180000).toISOString()})),false);
 assert.equal(await isPsychologyBotEcho(tx,event({phone:'573000000011'})),false);
 assert.equal(await recordPsychologyStaffTakeover(tx,event({kind:'audio',text:''})),true);
 }finally{await db.close()}
});

test('observation excludes known bot messages even with truncated text and uses only staff text from supplied same-chat history',()=>{
 const now=new Date();const history=classifyReceptionHistory([
 {direction:'outbound_staff_or_bot',text:'same phrase',source:'wa-staff',messageId:6,at:now.toISOString()},
 {direction:'outbound_staff_or_bot',text:'same phrase',source:'wa-bot',messageId:7,at:now.toISOString()},
 {direction:'inbound',text:'Cliente',source:'in',at:now.toISOString()},
 {direction:'outbound_staff_or_bot',text:'[Archivo o audio previo sin transcripción disponible]',source:'media',at:now.toISOString()}
 ],[{id:'outbox',content:'same phrase with original full text',messageId:'7',attemptedAt:now}]);
 assert.equal(history[0].direction,'outbound_staff');assert.equal(history[1].direction,'outbound_bot');
 const observed=staffObservation(history,'HUMAN');assert.equal(observed.mode,'observe_without_reply');
 assert.deepEqual(observed.examples.map(x=>x.source),['wa-staff']);
 assert.equal(staffObservation(history,'NEED').mode,'use_reviewed_tone');
});

test('staff also owns the chief conversation; conversational replies stop while independent reports and other-chat alerts remain deliverable',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "CitasPsicologos"(id BIGINT PRIMARY KEY)');
  await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
  const tx=sqlTx(db) as never,chief='573016803926';
  await db.query('INSERT INTO "PsicologiaBotConversation"(phone) VALUES($1),($2)',[chief,phone]);
  await db.query('INSERT INTO "PsicologiaBotEvent"(id,phone,"eventAt",kind,text) VALUES(\'chief-source\',$1,NOW(),\'text\',\'Luisa, ayúdame\'),(\'client-source\',$2,NOW(),\'text\',\'Ayuda\'),(\'chief-unaddressed\',$1,NOW(),\'text\',\'Mensaje al personal\')',[chief,phone]);
  await db.query('INSERT INTO "PsicologiaBotOutbox"(id,phone,content,status) VALUES(\'chief-source:chief-result\',$1,\'Pregunta inoportuna\',\'PENDING\'),(\'chief-source:status\',$1,\'Respuesta reclamada\',\'SENDING\'),(\'night:20260929\',$1,\'Informe nocturno\',\'PENDING\'),(\'client-source:handoff\',$1,\'Alerta\',\'SENDING\')',[chief]);
  await db.query('INSERT INTO "PsicologiaBotOutbox"(id,phone,content,status) VALUES(\'chief-unaddressed:chief-result\',$1,\'No responder\',\'SENDING\')',[chief]);
  assert.equal(await psychologyStaffSendAllowed(tx,'chief-source:status',chief),true);
  assert.equal(await psychologyStaffSendAllowed(tx,'chief-unaddressed:chief-result',chief),false);
  assert.equal(await recordPsychologyStaffTakeover(tx,event({phone:chief,kind:'attachment',text:''})),true);
  assert.equal(await recordPsychologyStaffTakeover(tx,event({id:'delayed-old-staff',phone:chief,kind:'attachment',text:'',at:new Date(Date.now()-60000).toISOString()})),false);
  const owner=(await db.query<{state:{staffMessage:{id:string}}}>('SELECT state FROM "PsicologiaBotConversation" WHERE phone=$1',[chief])).rows[0];
  assert.equal(owner.state.staffMessage.id,'staff-1');
  const statuses=(await db.query<{id:string;status:string}>('SELECT id,status FROM "PsicologiaBotOutbox"')).rows;
  assert.equal(statuses.find(x=>x.id==='chief-source:chief-result')?.status,'CANCELLED');
  assert.equal(statuses.find(x=>x.id==='night:20260929')?.status,'PENDING');
  assert.equal(await psychologyStaffSendAllowed(tx,'chief-source:status',chief),false);
  assert.equal(await psychologyStaffSendAllowed(tx,'client-source:handoff',chief),true);
  await db.exec('UPDATE "PsicologiaBotOutbox" SET status=\'SENDING\' WHERE id=\'night:20260929\'');
  assert.equal(await psychologyStaffSendAllowed(tx,'night:20260929',chief),true);
  assert.equal(await psychologyStaffSendAllowed(tx,'night:20260929',phone),false);
 }finally{await db.close()}
});

test('the chief explicitly returns her own chat; ambiguous, stale, quoted or other-sender requests cannot release it',()=>{
 const staffAt='2026-09-29T16:25:00Z';
 const state={humanHold:{kind:'staff' as const,resumeStage:'NEW',since:staffAt},staffMessage:{id:'staff',at:staffAt}};
 const chief=event({phone:'573016803926',fromMe:false,at:'2026-09-29T16:30:00Z',text:'Luisa, retoma este chat, por favor.'});
 const released=chiefStaffDecision(chief,'HUMAN',state);
 assert.equal(released?.action,'release');
 if(released?.action!=='release')throw Error('Expected release');
 assert.equal(released.state.staffReleasedAt,chief.at);assert.equal(released.state.staffMessage,undefined);assert.equal(released.state.humanHold,undefined);
 for(const text of ['Gracias','Sí','Te ayude a sacar la plata mirar si hay','No, Luisa, retoma este chat','Sandra dijo: Luisa, retoma este chat'])assert.equal(chiefStaffDecision({...chief,text},'HUMAN',state)?.action,'observe');
 assert.equal(chiefStaffDecision({...chief,kind:'audio'},'HUMAN',state)?.action,'observe');
 assert.equal(chiefStaffDecision({...chief,text:'Hola, Luisa Fernanda, retoma este chat, por favor.'},'HUMAN',state)?.action,'release');
 assert.equal(chiefStaffDecision({...chief,at:staffAt},'HUMAN',state)?.action,'observe');
 assert.equal(chiefStaffDecision({...chief,phone},'HUMAN',state),null);
 assert.equal(chiefStaffDecision({...chief,fromMe:true},'HUMAN',state),null);
 assert.equal(chiefStaffDecision(chief,'NEW',{}),null);
 assert.equal(chiefStaffDecision({...chief,text:'REANUDAR 573016803926'},'HUMAN',state)?.action,'observe');
});

test('Sandra must directly address Luisa or the bot; ordinary staff talk and mentions do not activate it',()=>{
 const chief=event({phone:'573016803926',fromMe:false});
 for(const text of ['Luisa, revisa la agenda','Hola, Luisa Fernanda, necesito tu ayuda','Luisa necesito que me ayudes','Bot, retoma este chat','Luisa, retoma este chat','ESTADO BOT'])assert.equal(chiefAddressesBot({...chief,text}),true,text);
 for(const text of ['Mi amor, necesito sacar la plata','Te ayude a sacar la plata mirar si hay','Sí','Gracias','Dile a Luisa que revise','Luisa no respondió hoy','Sandra dijo: Luisa, revisa','"Luisa, revisa la agenda"'])assert.equal(chiefAddressesBot({...chief,text}),false,text);
 assert.equal(chiefAddressesBot({...chief,text:'Sí',quotedText:'Luisa, revisa la agenda'}),false);
 assert.equal(chiefAddressesBot({...chief,phone,text:'Luisa, revisa'}),false);
 assert.equal(chiefAddressesBot({...chief,fromMe:true,text:'Luisa, revisa'}),false);
 assert.equal(chiefAddressesBot({...chief,kind:'audio',text:''}),false);
 // Preparation transcribes first. Only the resulting direct address may be interpreted.
 assert.equal(chiefAddressesBot({...chief,kind:'text',text:'Luisa, revisa la agenda'}),true);
});
