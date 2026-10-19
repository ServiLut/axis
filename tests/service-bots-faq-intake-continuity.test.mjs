// Isolated Engine/Store fixtures. No HTTP, provider, model or business adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {FAQ_AUTHORITY} from '../automation/service-bots/faq.mjs';

const START=Date.parse('2026-10-16T21:20:00.000Z');
const ANSWER='En este caso ficticio, la visita tiene una duración estimada de treinta minutos.';
const CONTEXT='Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.';
function approvedDuration(){
 const originalText='Fuente ficticia de duración para una prueba aislada.';
 return {company:'fumigacion',kind:'approved_customer_answers',at:new Date(START).toISOString(),authorizationSource:FAQ_AUTHORITY,
  source:{nativeVerified:true,sender:'573043332213',line:'573126944997',id:'SYNTHETIC_FAQ_DURATION',questionMid:'SYNTHETIC_FAQ_QUESTION',at:new Date(START-1000).toISOString(),originalText,bodyHash:createHash('sha256').update(originalText).digest('hex')},
  approval:{reviewed:true,source:FAQ_AUTHORITY,at:new Date(START).toISOString()},
  entries:[{id:'synthetic-duration',topics:['duration'],text:ANSWER,appliesTo:{services:['cucarachas'],sites:['apartamento']},reviewAfter:new Date(START+86400000).toISOString()}]};
}
async function using(t,fn){
 t.mock.timers.enable({apis:['Date'],now:START});
 const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));
 f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:START-5000};
 f.store.importKnowledge(approvedDuration());
 try{await fn(f);}finally{f.store.close();}
}
const registrations=f=>f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n;
async function stage(f,target){
 const q=await f.turn(CONTEXT);assert.match(f.deliver(q),/129\.000/);
 const accepted=await f.turn('Sí');f.deliver(accepted);
 if(target!=='name')f.deliver(await f.turn('Nombre: Persona Sintética'));
 if(['details','confirm'].includes(target))f.deliver(await f.turn('Dirección: Calle de Prueba 0 # 0'));
 if(target==='confirm')f.deliver(await f.turn('Lo necesito mañana a las 9 am.'));
 assert.equal(f.state(accepted).programIntake.stage,target);
 return {q,accepted};
}
for(const currentStage of ['name','address','details','confirm'])test('approved informational FAQ survives '+currentStage+' and preserves the exact intake proof',t=>using(t,async f=>{
 const {q,accepted}=await stage(f,currentStage),before=structuredClone(f.state(accepted));
 const questionCount=f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n;
 const faq=await f.turn('¿Cuánto dura la visita?');
 assert.equal(f.reply(faq),ANSWER);
 const after=f.state(faq);
 assert.deepEqual(after.programIntake,before.programIntake);
 assert.deepEqual(after.quotedPrice,before.quotedPrice);
 assert.deepEqual(after.slots,before.slots);
 assert.deepEqual(after.intakeSources,before.intakeSources);
 assert.equal(after.quotedPrice.sourceId,q.id);
 assert.equal(after.quotedPrice.acceptanceSource,accepted.id);
 assert.equal(registrations(f),0);
 assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,questionCount);
 assert.equal(f.store.approvedReplyStillValid(f.row(faq)),true);
 const ref=f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('approved-reply:'+f.row(faq).id).value);
 assert.equal(ref.question,faq.text);assert.equal(ref.answer,ANSWER);assert.equal(ref.finalText,ANSWER);
 assert.equal(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('price-reply:'+f.row(faq).id),undefined);
 f.deliver(faq);
 if(f.state(faq).programIntake.stage==='name')f.deliver(await f.turn('Nombre: Persona Sintética'));
 if(f.state(faq).programIntake.stage==='address')f.deliver(await f.turn('Dirección: Calle de Prueba 0 # 0'));
 if(f.state(faq).programIntake.stage==='details')f.deliver(await f.turn('Lo necesito mañana a las 9 am.'));
 const summaryState=structuredClone(f.state(faq));assert.equal(summaryState.programIntake.stage,'confirm');
 const confirmation=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(confirmation);
 assert.ok(entry);assert.equal(registrations(f),1);
 assert.equal(entry.summaryOutboxId,summaryState.programIntake.promptId);
 assert.equal(entry.payload.quote.sourceId,q.id);assert.equal(entry.payload.sources.acceptance.id,confirmation.id);
 assert.equal(entry.payload.sources.customerName.id,summaryState.programIntake.nameSource.id);
 assert.equal(entry.payload.sources.address.id,summaryState.programIntake.addressSource.id);
}));

test('FAQ before quotation acceptance answers without accepting, recotizing or collecting registration facts',t=>using(t,async f=>{
 const q=await f.turn(CONTEXT);f.deliver(q);const before=structuredClone(f.state(q));
 const faq=await f.turn('¿Cuánto dura la visita?');assert.equal(f.reply(faq),ANSWER);
 assert.deepEqual(f.state(faq).quotedPrice,before.quotedPrice);assert.equal(f.state(faq).programIntake,undefined);assert.equal(registrations(f),0);
 f.deliver(faq);const yes=await f.turn('Sí');assert.equal(f.state(yes).programIntake.stage,'name');assert.equal(f.state(yes).quotedPrice.acceptanceSource,yes.id);
}));

test('an unanswered FAQ mixed with price retains the whole question instead of publishing only the price',t=>using(t,async f=>{
 const e=await f.turn(CONTEXT+' ¿Cuánto dura la visita y cuánto cuesta?');
 assert.equal(f.state(e).quotedPrice,undefined);assert.equal(f.state(e).programIntake,undefined);assert.equal(registrations(f),0);
 assert.doesNotMatch(f.reply(e)||'',/129\.000|Deseas continuar/);
 const questions=f.store.db.prepare('SELECT * FROM questions').all();assert.equal(questions.length,1);
 const texts=f.store.db.prepare('SELECT body FROM outbox WHERE internal=1').all().map(x=>f.store.open(x.body)).join('\n');
 assert.match(texts,/Cuánto dura la visita y cuánto cuesta/i);
 assert.ok(f.state(e).awaitingHumanReview);
}));

for(const text of [
 'Acepto el servicio. ¿Cuánto dura la visita?',
 'Sí, confirmo que los datos son correctos. ¿Cuánto dura la visita?',
 '¿Cuánto dura la visita? Lo necesito mañana a las 10 am.',
 '¿Cuánto dura la visita y qué horario tienen?',
 '¿Cuánto dura la visita y qué garantía tiene?',
 '¿Cuánto dura la visita y cómo pago?',
 '¿Cuánto dura la visita y qué productos usan?',
])test('mixed FAQ cannot confirm or partially resolve an intake request: '+text,t=>using(t,async f=>{
 await stage(f,'confirm');const before=structuredClone(f.store.conversation('573000007384').state.programIntake);
 const e=await f.turn(text);assert.equal(registrations(f),0);assert.equal(f.entry(e),undefined);
 assert.notEqual(f.state(e).programIntake?.stage,'pending');assert.equal(f.state(e).programIntake?.promptId,before.promptId);
 assert.notEqual(f.reply(e),ANSWER,'the additional request must not be silently dropped');
 assert.ok(f.state(e).awaitingHumanReview||f.state(e).requestedAfterServiceReview||f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n>0);
}));

for(const mode of ['human','paused','forwarded'])test('FAQ continuity preserves '+mode+' controls',t=>using(t,async f=>{
 await stage(f,'name');
 if(mode==='human')await f.turn('La asesora atiende este chat.',{fromMe:true});
 if(mode==='paused')f.config.enabled=false;
 const e=await f.turn('¿Cuánto dura la visita?',mode==='forwarded'?{forwarded:true}:{});
 assert.notEqual(f.reply(e),ANSWER);assert.equal(registrations(f),0);
 if(mode==='human')assert.equal(f.store.conversation(e.phone).hold,1);
}));
