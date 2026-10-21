// Synthetic local Engine/Store only. No model, network or business adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {acceptsOrdinaryQuotation,acceptsExplicitOrdinaryQuotation,literalProgramPreference,registrationStatus,registrationHash} from '../automation/service-bots/maria-program.mjs';
import {literalIntakeTiming} from '../automation/service-bots/intake-timing.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD,projectClientRequestedSchedule} from '../automation/service-bots/client-requested-schedule.mjs';

const START=Date.parse('2026-10-20T14:00:00.000Z'),phone='573009000011',line=BUSINESSES.fumigacion.phones[0];
function fixture(t){
 const s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:START-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-timing-'+i})),staffPlanning:{enabled:true,mode:'internal-staff-assignment',startsAt:START-60000},clientRequestedSchedule:{enabled:true,startsAt:START-60000,guard:MARIA_CLIENT_SCHEDULE_GUARD},mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:START-60000,expiresAt:Date.parse('2026-11-07T16:56:52.680Z')}};
 const engine=new Engine(s,c);let seq=0;
 const row=e=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const reply=e=>{const r=row(e);return r?s.open(r.body):null;};
 const turn=async(text,patch={})=>{const e={id:'TIMED_FORM_'+ ++seq,phone,line,at:START+seq*1000,kind:'text',fromMe:false,forwarded:false,text,...patch};t.mock.timers.setTime(e.at);s.enqueue(e);await engine.process(e);return e;};
 const deliver=e=>{const r=row(e);assert.ok(r,'reply for '+e.text);const mid='MID_'+e.id;s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);s.recordFirstBotReply({...r,mid},mid,c.bot,e.at);s.delivery(mid,e.line,'DELIVERED');s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+r.id);return reply(e);};
 const state=e=>s.conversation(e.phone).state;
 const entry=e=>{const r=s.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+state(e).caseId);return r&&s.open(r.value);};
 const quote=async()=>{const q=await turn('Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta?');assert.match(deliver(q),/149\.000/);return q;};
 return {s,c,turn,row,reply,deliver,state,entry,quote};
}
async function using(t,fn){t.mock.timers.enable({apis:['Date'],now:START});const f=fixture(t);try{await fn(f);}finally{f.s.close();}}
const positive=['Sí, mañana a las 10 a. m.','Sí, mañana a las 10 p. m.','Sí, acepto el servicio para mañana a las 10 a.m.','Sí, lo quiero para mañana a las 10 a. m.'];
for(const text of positive)test('native price consent with a literal requested time does not repeat the quote: '+text,t=>using(t,async f=>{
 const q=await f.quote(),e=await f.turn(text),state=f.state(e);
 assert.equal(acceptsExplicitOrdinaryQuotation(text),true);assert.equal(acceptsOrdinaryQuotation(text),false);
 assert.equal(state.quotedPrice.accepted,true);assert.equal(state.quotedPrice.sourceId,q.id);assert.equal(state.quotedPrice.acceptanceSource,e.id);assert.equal(state.quotedPrice.priceCop,149000);
 assert.equal(state.programIntake.stage,'name');assert.match(f.reply(e),/nombre completo/);assert.doesNotMatch(f.reply(e),/149\.000|Deseas continuar|día y a qué hora/);
 const expected=text.slice(text.indexOf('mañana'));assert.equal(state.slots.preference,expected);assert.equal(state.intakeSources.preference.sourceId,e.id);assert.equal(f.entry(e),undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 f.deliver(e);const fields=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18');assert.equal(f.state(fields).programIntake.stage,'confirm');assert.match(f.reply(fields),/21\/10\/2026 a las 10:00 [ap]\. m\./);assert.match(f.reply(fields),/sin técnico asignado/);assert.equal(f.entry(fields),undefined);
 f.deliver(fields);const priceAgain=await f.turn(text);assert.equal(f.entry(priceAgain),undefined);assert.equal(f.state(priceAgain).programIntake.stage,'confirm');assert.equal(f.state(priceAgain).programIntake.promptId,fields.id+':reply');assert.equal(f.reply(priceAgain),null);
 const final=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.confirmationKind,'delivered-summary-confirmed');assert.equal(entry.summaryOutboxId,fields.id+':reply');assert.equal(entry.payload.slots.preference,expected);assert.equal(entry.payload.sources.preference.id,priceAgain.id);assert.equal(entry.payload.sources.preference.text,text);assert.equal(entry.payload.sources.acceptance.id,final.id);assert.equal(entry.requestHash,registrationHash(entry.payload));
}));

test('explicit price-consent header keeps a labelled name, address and exact requested time together',t=>using(t,async f=>{
 const q=await f.quote(),text='Acepto la cotización. Nombre: Persona Sintética\nDirección: Calle 50 # 42-18\nHorario: mañana a las 10 a. m.',e=await f.turn(text),state=f.state(e);
 assert.equal(literalProgramPreference(text,e.at),'mañana a las 10 a. m.');assert.equal(acceptsExplicitOrdinaryQuotation(text),true);assert.equal(acceptsOrdinaryQuotation(text),false);
 assert.equal(state.quotedPrice.sourceId,q.id);assert.equal(state.quotedPrice.accepted,true);assert.equal(state.programIntake.stage,'confirm');assert.equal(state.programIntake.customerName,'Persona Sintética');assert.equal(state.programIntake.address,'Calle 50 # 42-18');assert.equal(state.slots.preference,'mañana a las 10 a. m.');assert.equal(state.intakeSources.preference.sourceId,e.id);assert.match(f.reply(e),/Horario solicitado: 21\/10\/2026 a las 10:00 a\. m\./);assert.equal(f.entry(e),undefined);
 f.deliver(e);const final=await f.turn('Confirmo'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.sources.preference.text,text);assert.equal(entry.payload.sources.preference.id,e.id);assert.equal(entry.payload.sources.customerName.id,e.id);assert.equal(entry.payload.sources.address.id,e.id);assert.equal(entry.payload.sources.acceptance.id,final.id);
}));

for(const timing of ['mañana a las 10 a. m.','Horario: mañana a las 10 a. m.'])test('a delivered name/address prompt accepts a complete bare form with timing: '+timing,t=>using(t,async f=>{
 await f.quote();const yes=await f.turn('Sí');f.deliver(yes);const text='Persona Sintética\nCalle 50 # 42-18\n'+timing,e=await f.turn(text),state=f.state(e);
 assert.equal(state.programIntake.customerName,'Persona Sintética');assert.equal(state.programIntake.address,'Calle 50 # 42-18');assert.equal(state.slots.preference,'mañana a las 10 a. m.');assert.equal(state.intakeSources.preference.sourceId,e.id);assert.equal(state.programIntake.stage,'confirm');assert.match(f.reply(e),/Horario solicitado: 21\/10\/2026 a las 10:00 a\. m\./);assert.doesNotMatch(f.reply(e),/Para registrar tu solicitud|Me falta/);assert.equal(f.entry(e),undefined);
 f.deliver(e);const final=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.sources.customerName.text,text);assert.equal(entry.payload.sources.address.text,text);assert.equal(entry.payload.sources.preference.text,text);assert.equal(entry.payload.sources.acceptance.id,final.id);
}));

const negative=['Si mañana a las 10 a. m.','Sí, si mañana hay disponibilidad','Sí, puede ser mañana a las 10 a. m.','Sí, podría ser mañana a las 10 a. m.','No acepto el servicio para mañana a las 10 a. m.','Sí, acepto el servicio si mañana queda disponible','Sí, acepto el servicio para mañana a las 10 a. m. pero con descuento','Sí, acepto el servicio para mañana a las 10 a. m. y registra el pago','Sí, reprograma el servicio para mañana a las 10 a. m.','Mi vecina dijo: Sí, acepto el servicio para mañana a las 10 a. m.','Sí, mañana a las 10 a. m. o a las 11 a. m.'];
for(const text of negative)test('a condition, refusal, other speaker, business exception or alternative cannot accept price: '+text,()=>{
 assert.equal(acceptsExplicitOrdinaryQuotation(text),false);assert.equal(acceptsOrdinaryQuotation(text),false);
});
for(const patch of [{phone:'573009000022'},{line:BUSINESSES.fumigacion.phones[1]},{forwarded:true},{quotedId:'OTHER_SOURCE'}])test('timed price consent cannot adopt another customer, line or relayed source: '+JSON.stringify(patch),t=>using(t,async f=>{
 await f.quote();const e=await f.turn(positive[0],patch);assert.notEqual(f.state(e).quotedPrice?.accepted,true);assert.equal(f.entry(e),undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);
}));
test('a bare form without a delivered own data prompt is not adopted as client facts',t=>using(t,async f=>{
 await f.quote();await f.turn('Sí');const e=await f.turn('Persona Sintética\nCalle 50 # 42-18\nmañana a las 10 a. m.');assert.equal(f.state(e).programIntake.customerName,undefined);assert.equal(f.state(e).programIntake.address,undefined);assert.equal(f.entry(e),undefined);
}));
test('an ambiguous requested hour preserves bare client facts and asks for the precise hour',t=>using(t,async f=>{
 await f.quote();f.deliver(await f.turn('Sí'));const e=await f.turn('Persona Sintética\nCalle 50 # 42-18\nmañana a las 10');assert.equal(f.state(e).programIntake.customerName,'Persona Sintética');assert.equal(f.state(e).programIntake.address,'Calle 50 # 42-18');assert.equal(f.state(e).programIntake.stage,'details');assert.match(f.reply(e),/hora exacta/);assert.equal(f.entry(e),undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);
}));
test('a compact las10 spelling preserves price consent and raw facts while requesting a verifiable clock',t=>using(t,async f=>{
 await f.quote();const text='Sí, acepto el servicio para mañana a las10 a.m.',e=await f.turn(text);assert.equal(f.state(e).quotedPrice.accepted,true);assert.equal(f.state(e).slots.preference,'mañana a las10 a.m.');assert.doesNotMatch(f.reply(e),/149\.000|Deseas continuar/);f.deliver(e);
 const fields=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18');assert.equal(f.state(fields).programIntake.customerName,'Persona Sintética');assert.equal(f.state(fields).programIntake.address,'Calle 50 # 42-18');assert.equal(f.state(fields).programIntake.stage,'details');assert.match(f.reply(fields),/hora exacta/);assert.equal(f.entry(fields),undefined);
}));
test('the intake timing recognizer preserves dotted and compact native clock spelling',()=>{
 for(const text of positive){const timing=literalIntakeTiming('fumigacion',{id:'NATIVE_TIMING_SOURCE',phone,line,at:START,kind:'text',fromMe:false,forwarded:false,text});assert.equal(timing.preference,text.slice(text.indexOf('mañana')));assert.equal(timing.source.sourceId,'NATIVE_TIMING_SOURCE');}
});

async function lateDaySummary(f){
 const base=Date.parse('2026-10-20T23:50:00.000Z'),q=await f.turn('Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta?',{at:base});assert.match(f.deliver(q),/149\.000/);
 const acceptance=await f.turn('Sí, mañana a las 10 a. m.',{at:base+1000});f.deliver(acceptance);
 const fields=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18',{at:base+2000});assert.equal(f.state(fields).programIntake.stage,'confirm');assert.deepEqual(f.state(fields).programIntake.preview.requestedSchedule,{requestedDate:'2026-10-21',requestedTime:'10:00'});f.deliver(fields);
 return {q,acceptance,fields};
}
test('repeated relative timing after Bogotá midnight requires its own new delivered summary and later confirmation',t=>using(t,async f=>{
 const {acceptance,fields}=await lateDaySummary(f),originalBody=f.row(fields).body,originalPreview=structuredClone(f.state(fields).programIntake.preview),afterMidnight=Date.parse('2026-10-21T05:10:00.000Z');
 const renewed=await f.turn('Sí, mañana a las 10 a. m.',{at:afterMidnight}),state=f.state(renewed);
 assert.equal(state.slots.preference,originalPreview.preference);assert.equal(state.intakeSources.preference.sourceId,renewed.id);assert.notEqual(state.intakeSources.preference.sourceId,acceptance.id);assert.deepEqual(state.programIntake.preview.requestedSchedule,{requestedDate:'2026-10-22',requestedTime:'10:00'});assert.equal(state.programIntake.promptId,renewed.id+':reply');assert.match(f.reply(renewed),/¿Confirmas que estos datos son correctos/);assert.equal(f.entry(renewed),undefined);assert.equal(f.row(fields).body,originalBody);
 const early=await f.turn('Confirmo',{at:afterMidnight+1000});assert.equal(f.entry(early),undefined);assert.equal(registrationStatus(f.c,f.s).prepared,0);
 f.deliver(renewed);const final=await f.turn('Confirmo',{at:afterMidnight+2000}),entry=f.entry(final);assert.ok(entry);assert.equal(entry.summaryOutboxId,renewed.id+':reply');assert.equal(entry.payload.summaryConfirmation.mid,f.row(renewed).mid);assert.equal(entry.payload.sources.preference.id,renewed.id);assert.equal(entry.payload.sources.acceptance.id,final.id);assert.equal(entry.payload.sources.customerName.id,fields.id);assert.equal(entry.payload.sources.address.id,fields.id);
 const projection=projectClientRequestedSchedule(entry.payload.slots.preference,entry.payload.sources.preference.at,entry.payload.sources.acceptance.at);assert.equal(projection.requestedDate,'2026-10-22');assert.equal(projection.requestedTime,'10:00');assert.equal(f.row(fields).body,originalBody);
}));
test('a confirmation after Bogotá midnight keeps the original native date when no new timing was supplied',t=>using(t,async f=>{
 const {acceptance,fields}=await lateDaySummary(f),final=await f.turn('Confirmo',{at:Date.parse('2026-10-21T05:10:00.000Z')}),entry=f.entry(final);assert.ok(entry);assert.equal(entry.summaryOutboxId,fields.id+':reply');assert.equal(entry.payload.sources.preference.id,acceptance.id);
 const projection=projectClientRequestedSchedule(entry.payload.slots.preference,entry.payload.sources.preference.at,entry.payload.sources.acceptance.at);assert.equal(projection.requestedDate,'2026-10-21');assert.equal(projection.requestedTime,'10:00');
}));
