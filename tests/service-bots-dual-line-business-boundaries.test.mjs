// Memory-only records and synthetic adapters. No provider or business API.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,SANDRA,HILARY,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED,DUAL_LINE_SCOPE_VERSION,DUAL_LINE_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';
import {drainProgramRegistrations} from '../automation/service-bots/maria-program.mjs';
import {prepareOwnSchedulingPlan} from '../automation/service-bots/maria-own-order-scheduling.mjs';
import {ownSchedulingEnabled,MARIA_SCHEDULING_URL} from '../automation/service-bots/maria-scheduling-access.mjs';
import {enqueueChiefCommand,drainChiefActions} from '../automation/service-bots/chief-actions.mjs';
import {initializeTesaStore,prepareTesaQuestion,tesaOperationalScopeSafe} from '../automation/service-bots/tesa-operations.mjs';
import {drainTesaGroup} from '../automation/service-bots/tesa-transport.mjs';
import {queueTesaGuidanceList,drainTesaGuidanceLists} from '../automation/service-bots/tesa-guidance-list.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';

const NOW=Date.parse('2026-10-19T23:00:00.000Z'),BLUE_START='2026-10-09T10:00:00.000Z',PUBLIC_START=Date.parse('2026-10-17T18:00:00.000Z');
function dual(config,redStart=NOW-30000){
 config.activatedAt=Date.parse(BLUE_START)-1000;config.publicResponseStartsAt=PUBLIC_START;
 config.lines=config.lines.map(line=>({...line,instance:line.phone===BLUE?'cucaracha-azul':'cucaracha-roja'}));
 config.operationalLineScope={company:'fumigacion',version:DUAL_LINE_SCOPE_VERSION,authorizationSource:DUAL_LINE_AUTHORIZATION_SOURCE,
  authorizedAt:BLUE_START,activeLines:[BLUE,RED],suspendedLines:[],lineStartsAt:{[BLUE]:BLUE_START,[RED]:new Date(redStart).toISOString()}};
 return config;
}
function programFixture(t,line=RED,{timed=false}={}){
 t.mock.timers.enable({apis:['Date'],now:NOW});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));
 dual(f.config);t.mock.timers.setTime(NOW);f.store.importKnowledge(approvedBusinessPriceSchedule());
 if(timed){f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:NOW-1000};f.config.clientRequestedSchedule={enabled:true,guard:'own-confirmed-client-time-without-technician-v1',startsAt:NOW-1000};}
 let sequence=0;const original=f.turn;f.turn=(text,patch={})=>original(text,{line,at:NOW+(++sequence)*10000,...patch});
 return f;
}
async function prepared(f,{timed=false}={}){
 const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.');f.deliver(quote);
 f.deliver(await f.turn('Sí'));
 const facts=await f.turn('Nombre: Laura Gómez\nDirección: Calle 50 # 42-18 apartamento 301');f.deliver(facts);
 if(timed)f.deliver(await f.turn('Prefiero mañana a las 9 am.'));
 const final=await f.turn('Sí, confirmo que los datos son correctos.');return {quote,facts,final,entry:f.entry(final)};
}

for(const line of [BLUE,RED])test('fresh same-line PN prepares ordinary registration without another line: '+line.slice(-4),async t=>{
 const f=programFixture(t,line);try{const p=await prepared(f);assert.ok(p.entry);assert.equal(p.entry.status,'PENDING');assert.equal(p.entry.payload.line,line);assert.equal(p.entry.payload.sources.acceptance.line,line);assert.equal(f.store.db.prepare('SELECT line FROM outbox WHERE mid=?').get(p.entry.payload.quote.mid).line,line);assert.equal(f.store.hasSourcesOutsideLine(p.final.phone,line),false);}finally{f.store.close();}
});
test('fresh red requested-time registration retains its ordinary no-technician contract',async t=>{
 const f=programFixture(t,RED,{timed:true});try{const p=await prepared(f,{timed:true});assert.ok(p.entry);assert.equal(p.entry.payload.line,RED);assert.equal(p.entry.payload.clientSchedule.guard,'own-confirmed-client-time-without-technician-v1');assert.equal(p.entry.payload.sources.acceptance.line,RED);assert.equal(p.entry.payload.clientSchedule.technicianId,undefined);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-own-scheduling:%'").get().n,0);}finally{f.store.close();}
});
test('a fresh red affirmative cannot adopt quotation and facts from before its new line cutoff',async t=>{
 const f=programFixture(t);try{
  const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.');f.deliver(quote);f.deliver(await f.turn('Sí'));
  const facts=await f.turn('Nombre: Laura Gómez\nDirección: Calle 50 # 42-18 apartamento 301');f.deliver(facts);
  const before=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(facts.id).body;
  f.config.operationalLineScope.lineStartsAt[RED]=new Date(facts.at+5000).toISOString();
  const final=await f.turn('Sí, confirmo que los datos son correctos.');assert.equal(f.entry(final),undefined);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
  assert.equal(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(facts.id).body,before);
 }finally{f.store.close();}
});
for(const state of ['PENDING','UNCERTAIN'])test('a newly opened red boundary preserves an older '+state+' registration without reads or replay',async t=>{
 const f=programFixture(t);try{const p=await prepared(f);assert.ok(p.entry);const key='maria-registration:'+p.entry.payload.caseId,entry={...p.entry,status:state};f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(entry),key);
  f.config.operationalLineScope.lineStartsAt[RED]=new Date(p.final.at+1000).toISOString();t.mock.timers.setTime(p.final.at+10000);
  const before=f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value;let calls=0;const blocked=async()=>{calls++;throw Error('NO_NATIVE_OR_BACKEND');};
  const result=await drainProgramRegistrations(f.store,f.config,{fetcher:blocked,request:blocked,verifyLine:blocked,currentAttention:blocked,currentCustomerActivity:blocked});assert.equal(calls,0);assert.equal(result.deferred,1);assert.equal(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value,before);
 }finally{f.store.close();}
});
test('cross-line lineage and a changed current case still prevent red registration writes',async t=>{
 for(const kind of ['other-line','changed-case','hold']){const f=programFixture(t);try{const p=await prepared(f);assert.ok(p.entry);
   if(kind==='other-line'){const extra={...p.final,id:'OTHER_LINE_NATIVE_SOURCE',line:BLUE,at:p.final.at+1};f.store.enqueue(extra);f.store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(extra.id);}
   if(kind==='changed-case'){const c=f.state(p.final);f.store.saveConversation(p.final.phone,{...c,caseId:'fumigacion:OTHER_CASE'});}
   if(kind==='hold')f.store.hold(p.final.phone,'OWN_STAFF_TAKEOVER',true);
   let calls=0;await drainProgramRegistrations(f.store,f.config,f.transport(async()=>{calls++;throw Error('NO_WRITE');}));assert.equal(calls,0);assert.notEqual(f.entry(p.final)?.status,'SAVED');if(kind==='hold')assert.equal(f.store.conversation(p.final.phone).hold,1);
  }finally{f.store.close();t.mock.timers.reset();}}
});

function operationsFixture(t){
 t.mock.timers.enable({apis:['Date'],now:NOW});const store=new Store(':memory:','fumigacion',randomBytes(32)),config=dual({company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map(phone=>({phone,instance:''}))});
 const phones=[...TESA_BOT_PHONES,HILARY];config.tesaOperations={enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:BLUE,activatedAt:NOW-600000,allowedParticipantPhones:[HILARY],verifiedMembership:{owner:BLUE,ownerOpen:true,verifiedAt:NOW-100,expiresAt:NOW+240000,sourceHash:'a'.repeat(64),participantPhones:phones,participantBindings:phones.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}};
 initializeTesaStore(store);return {store,config};
}
function incoming(f,id,line,at,phone='573000006001'){
 const event={id,phone,line,at,kind:'text',fromMe:false,forwarded:false,text:'Necesito revisar un servicio de cucarachas.'};f.store.enqueue(event);const caseId='fumigacion:'+id;f.store.saveConversation(phone,{caseId,slots:{service:'cucarachas',location:'medellin'}});return {...event,caseId};
}
function question(f,e){return prepareTesaQuestion(f.store,f.config,{phone:e.phone,line:e.line,caseId:e.caseId,topic:'disponibilidad-y-tecnico',source:e.id,conditions:{service:'cucarachas',location:'medellin'},text:'¿Qué disponibilidad corresponde a este caso?'});}
test('TESA applies the customer red boundary while keeping its blue sender and blue continuity',t=>{
 const f=operationsFixture(t);try{for(const[line,at,expected,id]of [[RED,NOW-40000,false,'RED_OLD'],[RED,NOW-1000,true,'RED_NEW'],[BLUE,NOW-40000,true,'BLUE_CURRENT']]){const e=incoming(f,id,line,at,'57300000600'+(id==='RED_OLD'?'1':id==='RED_NEW'?'2':'3'));assert.equal(tesaOperationalScopeSafe(f.store,f.config,{phone:e.phone,line,source:e.id,senderLine:BLUE,created:NOW}),expected);assert.equal(question(f,e).created,expected);}}finally{f.store.close();}
});
for(const refreshedCreated of [false,true])test('six old red TESA sources cannot consume the dispatch limit; refreshed queue time='+refreshedCreated,async t=>{
 const f=operationsFixture(t);try{const scope=f.config.operationalLineScope;delete f.config.operationalLineScope;
  for(let i=0;i<6;i++){const e=incoming(f,'TESA_OLD_RED_'+i,RED,NOW-40000,'57300000601'+i),q=question(f,e);assert.equal(q.created,true);const created=refreshedCreated?NOW:NOW-40000;f.store.db.prepare('UPDATE tesa_outbox SET created=?,updated=? WHERE id=?').run(created,created,q.outboxId);}
  f.config.operationalLineScope=scope;const old=f.store.db.prepare('SELECT * FROM tesa_outbox ORDER BY rowid').all(),fresh=incoming(f,'TESA_FRESH_RED',RED,NOW-1000,'573000006099'),q=question(f,fresh);assert.equal(q.created,true);let sends=0;
  const result=await drainTesaGroup(f.store,f.config,{verifyLine:async()=>{},request:async(line,path)=>{assert.equal(line.phone,BLUE);assert.match(path,/message\/sendText/);sends++;return {key:{id:'SYNTHETIC_DUAL_TESA_MID',remoteJid:TESA_GROUP_JID}};}});
  assert.equal(result.accepted,1);assert.equal(sends,1);assert.equal(f.store.db.prepare('SELECT source_line FROM tesa_outbox WHERE id=?').get(q.outboxId).source_line,RED);for(const row of old)assert.deepEqual(f.store.db.prepare('SELECT * FROM tesa_outbox WHERE id=?').get(row.id),row);
 }finally{f.store.close();}
});
test('a fresh red chief command is not starved or authorized by older red commands',async t=>{
 const f=operationsFixture(t);try{const commands=[];for(let i=0;i<4;i++){const old=i<3,source={id:'DUAL_CHIEF_SOURCE_'+i,phone:SANDRA,line:RED,at:old?NOW-40000:NOW-1000,kind:'text',text:'María, revisa este asunto.',fromMe:false,forwarded:false};f.store.enqueue(source);const q=enqueueChiefCommand(f.store,f.config,source,{action:'unsupported',params:{reason:'NO_SUPPORTED_COMMAND'},body:source.text,directed:true});if(old)f.store.db.prepare('UPDATE chief_commands SET created=?,updated=? WHERE id=?').run(NOW-40000,NOW-40000,q.id);commands.push(f.store.db.prepare('SELECT * FROM chief_commands WHERE id=?').get(q.id));}
  let verifies=0;await drainChiefActions(f.store,f.config,{verifyChiefCommandSource:async source=>{verifies++;return {verified:true,sourceId:source.id,phone:source.phone,line:source.line,at:source.at};}});assert.equal(verifies,1);for(const row of commands.slice(0,3))assert.deepEqual(f.store.db.prepare('SELECT * FROM chief_commands WHERE id=?').get(row.id),row);assert.notEqual(f.store.db.prepare('SELECT state FROM chief_commands WHERE id=?').get(commands[3].id).state,'PENDING');
 }finally{f.store.close();}
});
test('general guidance remains blue-only and qualifies by its own blue boundary',async t=>{
 const f=operationsFixture(t);try{f.config.operationalLineScope.lineStartsAt[RED]=new Date(NOW+60000).toISOString();queueTesaGuidanceList(f.store,f.config,{key:'dual-general-guidance',sourceHash:'b'.repeat(64),items:[{title:'Consulta general',question:'¿Cómo se aclara un dato pendiente?',example:'Una persona no conoce la información.'}]});let sends=0;
  const phones=[...TESA_BOT_PHONES,HILARY],transport={verifyLine:async phone=>({phone,instance:'cucaracha-azul',ownerVerified:true,open:true}),request:async(line,path)=>{assert.equal(line.phone,BLUE);if(path.startsWith('/group/findGroupInfos/'))return {id:TESA_GROUP_JID,subject:TESA_GROUP_SUBJECT,size:phones.length,participants:phones.map(phone=>({id:phone+'@s.whatsapp.net'}))};assert.match(path,/message\/sendText/);sends++;return {key:{id:'DUAL_GUIDANCE_NATIVE_MID',remoteJid:TESA_GROUP_JID}};}};
  const result=await drainTesaGuidanceLists(f.store,f.config,transport);assert.equal(result.accepted,1);assert.equal(sends,1);
 }finally{f.store.close();}
});
test('red ordinary registration does not grant the separate blue first-scheduling route',t=>{
 const f=operationsFixture(t);try{
  const actorId='7508385b-536e-4aa2-8137-d734dfc900ef',expiresAt=NOW+86400000;
  f.config.mariaProgram={enabled:true,actorId,token:'a'.repeat(43),startsAt:NOW-10000,expiresAt};
  f.config.ownOrderScheduling={actorId,url:MARIA_SCHEDULING_URL,token:'x'.repeat(43),proofToken:'b'.repeat(64),startsAt:NOW-1000,expiresAt};
  assert.equal(ownSchedulingEnabled(f.config),true);
  assert.equal(prepareOwnSchedulingPlan(f.store,f.config,{line:RED,topic:'disponibilidad-y-tecnico'},{created:true,outboxId:'tesa-question:synthetic'}),false);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-own-scheduling-plan:%'").get().n,0);
 }finally{f.store.close();}
});
