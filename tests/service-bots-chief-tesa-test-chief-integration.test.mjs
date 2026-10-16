// The chief, group, native attestations and dedicated TESA adapter are synthetic
// local fixtures. No HTTP, provider, model or production database is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,chiefTesaTestConfiguration,configFromEnv,outboundRecipientAllowed} from '../automation/service-bots/config.mjs';
import {mariaTestOrderAccessConfig} from '../automation/service-bots/maria-test-order-access.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {parseChiefCommand,drainChiefActions,reviewChiefActions,chiefActionsStatus} from '../automation/service-bots/chief-actions.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT} from '../automation/service-bots/tesa-config.mjs';
import {CHIEF_TESA_TEST_CYCLE as CYCLE,CHIEF_TESA_TEST_LINE as BLUE,CHIEF_TESA_TEST_TEXT as TEXT,CHIEF_TESA_TEST_DELIVERY_GUARD,chiefTesaTestHash,chiefTesaTestSendEntry} from '../automation/service-bots/chief-tesa-test.mjs';
const CLOCK=Date.parse('2026-10-16T22:40:00.000Z'),RED='573126938721',OTHER='573000001234',ACTOR='7508385b-536e-4aa2-8137-d734dfc900ef',SEND='María Ángel, envía la pregunta PRUEBA a TESA',LOOKUP='María Ángel, consulta la pregunta PRUEBA de TESA';
let sequence=0;
function environment(){return {BOT_COMPANY:'fumigacion',BOT_ENABLED:'false',BOT_CHIEF_ONLY:'true',BOT_REPLY_ONLY_TO_CHIEF:'true',BOT_CHIEF_TESA_TEST_ENABLED:'true',BOT_ACTIVATED_AT:new Date(CLOCK-3600000).toISOString(),BOT_LINES_JSON:JSON.stringify([{phone:BLUE,instance:'blue-fixture',apiKey:'SYNTHETIC_BLUE_INSTANCE_KEY_'.padEnd(43,'b')},{phone:RED,instance:'red-never-query',apiKey:'SYNTHETIC_RED_INSTANCE_KEY_'.padEnd(43,'r')}]),BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'b'.repeat(64),BOT_DATA_KEY:'c'.repeat(64),BOT_DATABASE_PATH:'/data/fumigacion/synthetic.sqlite',BOT_EVOLUTION_URL:'https://fixture.invalid',BOT_MARIA_PROGRAM_ENABLED:'true',BOT_MARIA_PROGRAM_URL:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',BOT_MARIA_PROGRAM_TOKEN:'SYNTHETIC_ORDINARY_TOKEN_'.padEnd(43,'o'),BOT_MARIA_PROGRAM_ACTOR_ID:ACTOR,BOT_MARIA_PROGRAM_STARTS_AT_UTC:new Date(CLOCK-3600000).toISOString(),BOT_MARIA_PROGRAM_EXPIRES_AT_UTC:'2026-11-07T16:56:52.680Z',BOT_MARIA_TEST_ORDER_ENABLED:'true',BOT_MARIA_TEST_ORDER_URL:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-test-order',BOT_MARIA_TEST_ORDER_TOKEN:'SYNTHETIC_SEPARATE_TEST_'.padEnd(43,'t'),BOT_MARIA_TEST_ORDER_STARTS_AT:new Date(CLOCK-60000).toISOString(),BOT_MARIA_TEST_ORDER_EXPIRES_AT:new Date(CLOCK+3600000).toISOString()};}
function fixture(t){
 t.mock.timers.enable({apis:['Date'],now:CLOCK});const env=environment(),c=configFromEnv(env);c.operationalLineScope={company:'fumigacion',version:'authorized-fumigacion-blue-only-v1',authorizationSource:'direct-user-20261009-red-block-24h',authorizedAt:env.BOT_ACTIVATED_AT,activeLines:[BLUE],suspendedLines:[RED]};c.tesaOperations={enabled:true,senderLine:BLUE,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT};
 const s=new Store(':memory:','fumigacion',randomBytes(32)),engine=new Engine(s,c);let sends=0,lookups=0,proofVerified=true;
 const source=(text,patch={})=>{t.mock.timers.tick(1100);const e={id:'SYNTHETIC_TESA_CHIEF_'+ ++sequence,phone:SANDRA,line:BLUE,at:Date.now(),kind:'text',fromMe:false,forwarded:false,quotedId:null,text,...patch};s.enqueue(e);return e;};
 const transport={fetcher:async()=>{throw Error('NO_MODEL_OR_HTTP_FOR_LITERAL_TEST');},verifyChiefCommandSource:async e=>({verified:proofVerified,sourceId:e.id,phone:SANDRA,line:BLUE,at:e.at}),sendChiefTesaTest:async(store,cycle)=>{assert.equal(cycle,CYCLE);const e=chiefTesaTestSendEntry(store,c,cycle);assert.equal(e.status,'SENDING');assert.equal(e.sendAttempts,1);assert.equal(e.source.text,SEND);assert.equal(e.text,TEXT);sends++;return {mid:'SYNTHETIC_TESA_GROUP_MID',line:BLUE,groupJid:TESA_GROUP_JID,textHash:chiefTesaTestHash(TEXT)};},verifyChiefTesaTestDelivery:async(store,cycle)=>{lookups++;const e=chiefTesaTestSendEntry(store,c,cycle,{lookup:true});return {guard:CHIEF_TESA_TEST_DELIVERY_GUARD,verified:true,cycleId:CYCLE,line:BLUE,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,mid:e.mid,text:TEXT,textHash:chiefTesaTestHash(TEXT),state:'DELIVERED',at:Math.floor(e.sendStartedAt/1000)*1000,nativeProofHash:'d'.repeat(64)};}};
 const dispatch=async(text=SEND,patch={})=>{const e=source(text,patch);await engine.process(e);await drainChiefActions(s,c,transport);return {source:e,command:reviewChiefActions(s,c).commands.find(row=>row.sourceId===e.id)};};
 return {c,s,engine,env,source,dispatch,transport,stats:()=>({sends,lookups}),badProof:()=>proofVerified=false,close:()=>s.close()};
}

test('the TESA exception is configured OFF by default and true requires the same structurally limited test grant and paused chief scope',()=>{
 const env=environment(),ordinary={enabled:true,actorId:ACTOR,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,token:env.BOT_MARIA_PROGRAM_TOKEN,startsAt:CLOCK-3600000,expiresAt:Date.parse('2026-11-07T16:56:52.680Z')},grant=mariaTestOrderAccessConfig(env,'fumigacion',ordinary),cutoff=CLOCK-3600000;
 assert.deepEqual(chiefTesaTestConfiguration({},'fumigacion',grant,cutoff),{enabled:false});assert.deepEqual(chiefTesaTestConfiguration(env,'fumigacion',grant,cutoff),{enabled:true,cycleId:CYCLE,startsAt:grant.startsAt,expiresAt:grant.expiresAt});
 for(const patch of [{BOT_CHIEF_TESA_TEST_ENABLED:'yes'},{BOT_ENABLED:'true'},{BOT_CHIEF_ONLY:'false'},{BOT_REPLY_ONLY_TO_CHIEF:'false'}])assert.throws(()=>chiefTesaTestConfiguration({...env,...patch},'fumigacion',grant,cutoff));
 assert.throws(()=>chiefTesaTestConfiguration(env,'servicio-tecnico',grant,cutoff));assert.throws(()=>chiefTesaTestConfiguration(env,'fumigacion',{enabled:false},cutoff));assert.throws(()=>chiefTesaTestConfiguration(env,'fumigacion',{...grant,expiresAt:Date.parse('2026-10-18T00:00:00Z')},cutoff));
});

test('expired or not-yet-started valid configuration still loads on restart but cannot enable the TESA exception',t=>{
 const f=fixture(t);try{
  assert.equal(chiefActionsStatus(f.s,f.c).chiefTesaTest.enabled,true);t.mock.timers.setTime(f.c.chiefTesaTest.expiresAt+1);const expired=configFromEnv(f.env);expired.tesaOperations=f.c.tesaOperations;assert.equal(expired.chiefTesaTest.enabled,true);assert.equal(chiefActionsStatus(f.s,expired).chiefTesaTest.enabled,false);
  t.mock.timers.setTime(CLOCK);const future={...f.env,BOT_MARIA_TEST_ORDER_STARTS_AT:new Date(CLOCK+3600000).toISOString(),BOT_MARIA_TEST_ORDER_EXPIRES_AT:new Date(CLOCK+2*3600000).toISOString()},pending=configFromEnv(future);pending.tesaOperations=f.c.tesaOperations;assert.equal(pending.chiefTesaTest.enabled,true);assert.equal(chiefActionsStatus(f.s,pending).chiefTesaTest.enabled,false);
 }finally{f.close();}
});

test('the native chief ledger sends one dedicated fixed test and reports ACCEPTED as pending until a separate native delivery lookup',async t=>{
 const f=fixture(t);try{
  const prior=f.source('Contexto cliente sintético',{phone:OTHER});f.s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(prior.id);f.s.hold(OTHER,'SYNTHETIC_HUMAN_OWNER');
  const first=await f.dispatch();assert.equal(first.command.action,'chief-tesa-test');assert.equal(first.command.status,'NEEDS_CONTEXT');assert.equal(first.command.result.data.status,'ACCEPTED');assert.equal(first.command.result.data.deliveryVerified,false);assert.match(first.command.result.text,/pendiente de comprobación/);assert.equal(f.stats().sends,1);
  const repeated=await f.dispatch();assert.equal(repeated.command.result.data.existingCyclePreserved,true);assert.equal(f.stats().sends,1);
  const proof=await f.dispatch(LOOKUP);assert.equal(proof.command.status,'DONE');assert.equal(proof.command.result.data.deliveryVerified,true);assert.match(proof.command.result.text,/quedó entregada/);assert.match(proof.command.result.text,/no he verificado una respuesta humana citada/);assert.equal(f.stats().sends,1);assert.equal(f.stats().lookups,1);
  assert.equal(f.s.conversation(OTHER).hold,1);assert.equal(f.c.enabled,false);assert.equal(outboundRecipientAllowed(f.c,TESA_GROUP_JID),false);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal<>1 OR phone<>?').get(SANDRA).n,0);
  assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%' OR key LIKE 'maria-test-order:%'").get().n,0);const metadata=chiefActionsStatus(f.s,f.c).chiefTesaTest;assert.equal(metadata.cycleId,CYCLE);assert.equal(metadata.reservationCreated,false);assert.equal(metadata.ordinaryMessagesEnabled,false);assert.equal(metadata.startsAt,new Date(f.c.mariaTestOrder.startsAt).toISOString());assert.equal(metadata.expiresAt,new Date(f.c.mariaTestOrder.expiresAt).toISOString());
 }finally{f.close();}
});

test('a lookup before any explicit send does not prepare a cycle or imply an available service',async t=>{
 const f=fixture(t);try{const result=await f.dispatch(LOOKUP);assert.equal(result.command.status,'NEEDS_CONTEXT');assert.equal(result.command.result.data.status,'NOT_PREPARED');assert.equal(f.stats().sends,0);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'chief-tesa-test:%'").get().n,0);}finally{f.close();}
});

test('wrong native proof, forwarded or quoted text, revoked test access and expiry cannot reach the dedicated sender',async t=>{
 const f=fixture(t);try{
  for(const text of ['María, envía la pregunta PRUEBA a TESA','María Ángel, no envía la pregunta PRUEBA a TESA','Sandra dijo: '+SEND,'«'+SEND+'»',SEND+' y reserva agenda'])assert.notEqual(parseChiefCommand({...f.source(text),forwarded:false},f.c)?.action,'chief-tesa-test',text);
  for(const patch of [{forwarded:true},{quotedId:'UNRELATED_NATIVE_QUOTE'}]){const result=await f.dispatch(SEND,patch);assert.notEqual(result.command?.status,'DONE');}
  const enabled=f.c.mariaTestOrder;f.c.mariaTestOrder={enabled:false};assert.equal((await f.dispatch()).command.status,'BLOCKED');f.c.mariaTestOrder=enabled;
  f.badProof();assert.equal((await f.dispatch()).command.status,'BLOCKED');assert.equal(f.stats().sends,0);
 }finally{f.close();}
});

test('an ambiguous dedicated result remains pending and a new command cannot repeat it',async t=>{
 const f=fixture(t);try{f.transport.sendChiefTesaTest=async()=>{throw Error('SYNTHETIC_UNCERTAIN_RESULT');};const first=await f.dispatch();assert.equal(first.command.status,'NEEDS_CONTEXT');assert.equal(first.command.result.data.status,'UNCERTAIN');const before=first.command.result.data.sendAttempts;const repeat=await f.dispatch();assert.equal(repeat.command.result.data.sendAttempts,before);assert.equal(repeat.command.result.data.existingCyclePreserved,true);assert.equal(repeat.command.result.data.resendAllowed,false);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'chief-tesa-test:%'").get().n,1);}finally{f.close();}
});
