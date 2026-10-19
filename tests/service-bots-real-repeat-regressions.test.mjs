// Engine/Store regressions from reviewed native conversation shapes. All
// identifiers, names and addresses below are synthetic; no transport or model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {registrationStatus} from '../automation/service-bots/maria-program.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD} from '../automation/service-bots/client-requested-schedule.mjs';

function fixture(t){
 const start=Date.parse('2026-10-17T20:30:00.000Z');t.mock.timers.enable({apis:['Date'],now:start});
 const store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-1000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'local-repeat-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'synthetic_local_only_'.padEnd(43,'x'),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-1000,expiresAt:Date.parse('2026-11-07T16:56:52.680Z')},staffPlanning:{enabled:true,mode:'internal-staff-assignment',startsAt:start-1000},clientRequestedSchedule:{enabled:true,guard:MARIA_CLIENT_SCHEDULE_GUARD,startsAt:start-1000}};
 const engine=new Engine(store,config);let n=0;
 const turn=async(text,patch={})=>{const event={id:'LOCAL_REAL_REPEAT_'+ ++n,phone:'573000007386',line:config.lines[0].phone,at:start+n*10000,kind:'text',fromMe:false,forwarded:false,text,...patch};t.mock.timers.setTime(event.at);store.enqueue(event);await engine.process(event);return event;};
 const row=e=>store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const reply=e=>{const r=row(e);return r&&store.open(r.body);};
 const deliver=e=>{const r=row(e);assert.ok(r,'response for '+e.text);const mid='LOCAL_ACK_'+e.id;t.mock.timers.setTime(e.at+1000);store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);store.recordFirstBotReply(r,mid,config.bot,e.at+1000);store.delivery(mid,e.line,'DELIVERED');const proof=store.open(store.db.prepare('SELECT value FROM meta WHERE key=?').get('first-delivery:'+r.id).value);assert.equal(proof.mid,mid);assert.equal(proof.state,'DELIVERED');return reply(e);};
 const state=e=>store.conversation(e.phone).state;
 return {store,config,turn,row,reply,deliver,state};
}
async function using(t,fn){const f=fixture(t);try{await fn(f);}finally{f.store.close();}}
async function accepted(f){const quote=await f.turn('Chinches en un colchón en mi casa de Medellín.');assert.match(f.deliver(quote),/100\.000/);const yes=await f.turn('Si');assert.match(f.deliver(yes),/Tu nombre completo/);return {quote,yes};}
const facts='Persona Sintética\nCarrera 50#100 50 in108\n18 de octubre\nHora :PM o am';

test('native crib/count/uncertainty sequence preserves literal 1 and leaves the repeated-count loop',t=>using(t,async f=>{
 f.deliver(await f.turn('Chinches\nHabitación solo una\nSabaneta'));f.deliver(await f.turn('Casa'));
 const crib=await f.turn('Una cuna');assert.equal(f.state(crib).slots.mattresses,undefined);assert.match(f.deliver(crib),/cuna/);
 const count=await f.turn('1');assert.equal(f.state(count).pendingMattressCountClarification.literal,'1');assert.equal(f.state(count).pendingMattressCountClarification.unitInferred,false);assert.equal(f.state(count).slots.mattresses,undefined);assert.equal(f.state(count).quotedPrice,undefined);assert.match(f.deliver(count),/Conservé tu respuesta «1»/);
 const doubt=await f.turn('No he visto el chinche');assert.match(f.deliver(doubt),/confirmar qué plaga/);assert.equal(f.state(doubt).awaitingHumanReview,true);
 for(const text of ['Solo hay una persona afectada','1 cama']){const e=await f.turn(text);assert.equal(f.state(e).slots.mattresses,undefined);assert.equal(f.state(e).quotedPrice,undefined);assert.doesNotMatch(f.reply(e)||'',/Para cotizar esa cama, confirma cuántos/);if(f.row(e))f.deliver(e);}
 assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(count.id).body).text,'1');assert.equal(registrationStatus(f.config,f.store).prepared,0);
}));
for(const boundary of ['undelivered','forwarded','quoted','another-line'])test('bare count only binds an own delivered same-line question: '+boundary,t=>using(t,async f=>{
 const initial=await f.turn('Chinches en mi casa de Sabaneta.');if(boundary!=='undelivered')f.deliver(initial);
 const e=await f.turn('1',boundary==='forwarded'?{forwarded:true}:boundary==='quoted'?{quotedId:'UNRELATED_SOURCE'}:boundary==='another-line'?{line:f.config.lines[1].phone}:{});
 assert.equal(f.state(e).pendingMattressCountClarification,undefined);assert.equal(f.state(e).slots.mattresses,undefined);assert.equal(f.state(e).quotedPrice,undefined);
}));
test('accepted mattress quote answers the furniture/socket price question before taking more data',t=>using(t,async f=>{
 const {quote}=await accepted(f);const scope=await f.turn('Pero cuanto vale la fumigación en muebles colchón toma corrientes etc lo ideal es fumigar bn');
 assert.match(f.deliver(scope),/valor y el alcance para muebles, tomacorrientes/);assert.doesNotMatch(f.reply(scope),/compárteme|Tu nombre completo|100\.000/);assert.equal(f.state(scope).quotedPrice.sourceId,quote.id);assert.equal(f.state(scope).awaitingHumanReview,true);assert.equal(f.state(scope).requestedMattressScopeReview.sourceId,scope.id);
 const e=await f.turn(facts),pi=f.state(e).programIntake;assert.equal(pi.customerName,'Persona Sintética');assert.equal(pi.address,'Carrera 50#100 50 in108');assert.equal(pi.requestedDateLiteral,'18 de octubre');assert.equal(pi.nameSource.id,e.id);assert.equal(pi.nameSource.text,facts);assert.equal(pi.addressSource.text,facts);assert.equal(pi.requestedDateSource.text,facts);
 assert.match(f.reply(e),/hora exacta, con a\. m\. o p\. m\./);assert.match(f.reply(e),/alcance.*pendientes/);assert.doesNotMatch(f.reply(e),/Tu nombre completo|dirección completa|Qué día|programado|registrado|100\.000/);assert.equal(f.state(e).awaitingHumanReview,true);assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.equal(pi.preview,null);
 const yes=await f.turn('Si');assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.equal(f.state(yes).programIntake.preview,null);
}));
test('delivered registration prompt retains four-line literal facts and asks only the unanswered clock',t=>using(t,async f=>{
 await accepted(f);const e=await f.turn(facts),pi=f.state(e).programIntake;assert.equal(pi.customerName,'Persona Sintética');assert.equal(pi.address,'Carrera 50#100 50 in108');assert.equal(pi.requestedDateLiteral,'18 de octubre');assert.match(f.reply(e),/hora exacta/);assert.doesNotMatch(f.reply(e),/nombre completo|dirección completa|Qué día/);assert.equal(pi.nameSource.text,facts);assert.equal(registrationStatus(f.config,f.store).prepared,0);
}));
for(const suffix of ['Mi vecino dice que es para otra solicitud','No quiero el servicio','Quiero un descuento'])test('a mixed extra line cannot be dropped while parsing a requested field batch: '+suffix,t=>using(t,async f=>{
 await accepted(f);const e=await f.turn(facts+'\n'+suffix);assert.equal(f.state(e).programIntake.customerName,undefined);assert.equal(f.state(e).programIntake.address,undefined);assert.equal(registrationStatus(f.config,f.store).prepared,0);
}));
for(const boundary of ['forwarded','quoted','human','another-line','changed-prompt'])test('pending expanded scope facts retain native attention and prompt boundaries: '+boundary,t=>using(t,async f=>{
 await accepted(f);const scope=await f.turn('Pero cuanto vale la fumigación en muebles colchón toma corrientes etc lo ideal es fumigar bn');f.deliver(scope);
 if(boundary==='changed-prompt')f.store.db.prepare('DELETE FROM meta WHERE key=?').run('first-delivery:'+f.state(scope).programIntake.promptId);
 const e=await f.turn(facts,boundary==='forwarded'?{forwarded:true}:boundary==='quoted'?{quotedId:'UNRELATED_SOURCE'}:boundary==='human'?{fromMe:true}:boundary==='another-line'?{line:f.config.lines[1].phone}:{});
 assert.equal(f.state(e).programIntake.customerName,undefined);assert.equal(f.state(e).programIntake.address,undefined);assert.equal(registrationStatus(f.config,f.store).prepared,0);
}));
