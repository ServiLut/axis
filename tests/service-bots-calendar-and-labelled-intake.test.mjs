// Local synthetic Engine/Store only; no network, model or business adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {literalProgramPreference,calendarProgramPreferenceIssue,acceptsOrdinaryQuotation,quotationAmountAffirmation,acceptsOwnQuotedAmount} from '../automation/service-bots/maria-program.mjs';
import {literalIntakeTiming} from '../automation/service-bots/intake-timing.mjs';
const START=Date.parse('2026-10-16T21:20:00.000Z');
test('own-price acceptance with a calendar tail uses the native event clock, not processing time',()=>{
  const text='Acepto los $129.000. El 24 de octubre a las 10 am';
  assert.equal(quotationAmountAffirmation(text,START),129000);
  assert.equal(acceptsOwnQuotedAmount(text,129000,START),true);
  assert.equal(quotationAmountAffirmation(text,Date.parse('2026-10-25T18:00:00Z')),null);
});
async function using(t,fn){t.mock.timers.enable({apis:['Date'],now:START});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:START-5000};try{await fn(f);}finally{f.store.close();}}
async function accepted(f){const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí.');assert.match(f.deliver(quote),/129\.000/);f.deliver(await f.turn('Sí, por favor'));return quote;}
async function facts(f,text='Nombre: Laura Gómez\nDirección: Calle 50 # 42-18 apartamento 301'){const event=await f.turn(text);f.deliver(event);return event;}
const pending=f=>f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n;
const dates=['El 24 de octubre a las 10 am','24/10/2026 a las 10 am','El sábado 24 de octubre a las 10 am'];
for(const text of dates)test('the actual Engine retains an explicit calendar preference and its complete original source: '+text,t=>using(t,async f=>{
  const q=await accepted(f);await facts(f);const timing=await f.turn(text),reply=f.reply(timing);assert.match(reply,/¿Confirmas que estos datos son correctos/);assert.ok(reply.includes(text));assert.equal(f.state(timing).slots.preference,text);assert.equal(f.entry(timing),undefined);assert.equal(pending(f),0);
  f.deliver(timing);const final=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.slots.preference,text);assert.equal(entry.payload.sources.preference.text,text);assert.equal(entry.payload.sources.preference.id,timing.id);assert.equal(entry.payload.sources.acceptance.id,final.id);assert.equal(entry.payload.customerName,'Laura Gómez');assert.equal(entry.payload.address,'Calle 50 # 42-18 apartamento 301');assert.equal(entry.payload.quote.priceCop,129000);assert.equal(entry.payload.quote.sourceId,q.id);assert.equal(entry.staffPlanning.mode,'internal-staff-assignment');assert.equal(entry.status,'PENDING');
}));
for(const [text,issue] of [
  ['El 31 de febrero a las 10 am','invalid-date'],['31/02/2026 a las 10 am','invalid-date'],['24/13/2026 a las 10 am','invalid-date'],['El 29 de febrero de 2026 a las 10 am','invalid-date'],
  ['15/10/2026 a las 10 am','past-date'],['El 15 de octubre a las 10 am','past-date'],['El viernes 24 de octubre a las 10 am','weekday-mismatch'],['El 24 de octubre a las 25:10','invalid-time'],['24/10/2026 a las 10:99 am','invalid-time'],['El 24 de octubre a las 0 am','invalid-time'],['16/10/2026 a las 10 am','past-date'],
])test('invalid calendar facts ask a concrete clarification without retaining an older preference: '+text,t=>using(t,async f=>{
  await accepted(f);await facts(f);const old=await f.turn('Lo necesito mañana a las 9 am.');f.deliver(old);
  assert.equal(calendarProgramPreferenceIssue(text,Date.now()),issue);assert.equal(literalProgramPreference(text,Date.now()),null);
  const invalid=await f.turn(text),state=f.state(invalid),reply=f.reply(invalid);assert.match(reply,/fecha|hora|semana/);assert.match(reply,/¿Qué fecha y hora válidas prefieres/);assert.doesNotMatch(reply,/reservad|programad[oa]|confirmad[oa]/);assert.equal(state.slots.preference,undefined);assert.equal(state.intakeSources.preference,undefined);assert.equal(state.programIntake.stage,'details');assert.equal(state.programIntake.customerName,'Laura Gómez');assert.equal(state.programIntake.address,'Calle 50 # 42-18 apartamento 301');assert.equal(state.quotedPrice.priceCop,129000);assert.equal(pending(f),0);f.deliver(invalid);
  const yes=await f.turn('Sí');assert.equal(f.entry(yes),undefined);assert.equal(pending(f),0);f.deliver(yes);
  const correction=await f.turn('El sábado 24 de octubre a las 10 am');assert.match(f.reply(correction),/¿Confirmas que estos datos son correctos/);assert.equal(f.entry(correction),undefined);f.deliver(correction);const final=await f.turn('Sí, confirmo que los datos son correctos.');assert.ok(f.entry(final));assert.equal(f.entry(final).payload.sources.preference.id,correction.id);
}));
test('calendar validation uses the native event day in Bogota, never a UTC next-day rollover',t=>using(t,async f=>{
  await accepted(f);await facts(f);const at=Date.parse('2026-10-17T00:30:00.000Z'),text='16/10/2026 a las 11 pm';
  const timing=await f.turn(text,{at});assert.equal(f.state(timing).slots.preference,text);assert.match(f.reply(timing),/¿Confirmas que estos datos son correctos/);assert.equal(calendarProgramPreferenceIssue(text,at),null);assert.equal(calendarProgramPreferenceIssue('16/10/2026 a las 6 pm',at),'past-date');
}));
test('a valid calendar correction replaces only timing and requires its own delivered new summary',t=>using(t,async f=>{
  const q=await accepted(f),originalFacts=await facts(f);const old=await f.turn('El 24 de octubre a las 10 am');f.deliver(old);
  const correction=await f.turn('Prefiero el 25 de octubre a las 11 am');assert.equal(f.state(correction).slots.preference,'el 25 de octubre a las 11 am');assert.match(f.reply(correction),/¿Confirmas que estos datos son correctos/);assert.equal(f.entry(correction),undefined);
  const early=await f.turn('Sí, confirmo que los datos son correctos.');assert.equal(f.entry(early),undefined);f.deliver(correction);const final=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.customerName,'Laura Gómez');assert.equal(entry.payload.sources.customerName.id,originalFacts.id);assert.equal(entry.payload.sources.preference.id,correction.id);assert.equal(entry.payload.quote.sourceId,q.id);assert.equal(entry.payload.quote.priceCop,129000);
}));
for(const text of ['No soy Laura Gómez','Mi vecina dijo: Soy Laura Gómez','"Soy Laura Gómez"','Soy de Medellín','Soy el técnico Pedro Pérez','Soy Laura Gómez según mi vecina'])test('uncertain, quoted or relayed Soy words never become a customer name: '+text,t=>using(t,async f=>{
  await accepted(f);const event=await f.turn(text);assert.equal(f.state(event).programIntake?.customerName,undefined);assert.equal(f.entry(event),undefined);assert.equal(pending(f),0);
}));
for(const text of ['Sí. Soy Laura Gómez','Sí. Nombre: Laura Gómez\nDirección: Calle 50 # 42-18\nHorario: mañana a las 10 am'])test('new field wrappers do not broaden the backend final acceptance grammar: '+text,()=>assert.equal(acceptsOrdinaryQuotation(text),false));
for(const text of ['Si el 24 de octubre a las 10 am','Mi vecino dijo el 24 de octubre a las 10 am','¿El 24 de octubre a las 10 am?','No quiero el 24 de octubre a las 10 am','Horario: mañana a las 10 am si es gratis','24/10/2026 a las 10 am o 25/10/2026 a las 11 am'])test('timing parser does not select a conditional, third-party or alternative request: '+text,()=>assert.equal(literalProgramPreference(text,START),null));
for(const patch of [{forwarded:true},{quotedId:'OTHER_NATIVE_SOURCE'},{fromMe:true}])test('a native calendar turn retains human/source boundaries: '+JSON.stringify(patch),t=>using(t,async f=>{
  await accepted(f);await facts(f);const event=await f.turn('El 24 de octubre a las 10 am',patch);assert.equal(f.entry(event),undefined);assert.equal(pending(f),0);if(patch.fromMe)assert.equal(f.store.conversation(event.phone).hold,1);
}));
test('pre-quotation intake keeps only a valid original calendar or Horario literal and native timestamp',()=>{
  const source=text=>({id:'CURRENT_CALENDAR_SOURCE',phone:'573000007384',line:'573126944997',at:START,kind:'text',fromMe:false,forwarded:false,text});
  for(const text of dates){const value=literalIntakeTiming('fumigacion',source(text));assert.equal(value.preference,text);assert.equal(value.source.sourceId,'CURRENT_CALENDAR_SOURCE');assert.equal(value.source.at,START);}
  assert.equal(literalIntakeTiming('fumigacion',source('Horario: mañana a las 10 am')).preference,'mañana a las 10 am');
  for(const text of ['El 31 de febrero a las 10 am','El viernes 24 de octubre a las 10 am','15/10/2026 a las 10 am'])assert.equal(literalIntakeTiming('fumigacion',source(text)),null);
});
for(const combined of [false,true])test('Horario label preserves requested time separately from name and address: combined='+combined,t=>using(t,async f=>{
  await accepted(f);if(!combined)await facts(f);const text=combined?'Nombre: Laura Gómez\nDirección: Calle 50 # 42-18 apartamento 301\nHorario: mañana a las 10 am':'Horario: mañana a las 10 am';
  const timing=await f.turn(text);assert.match(f.reply(timing),/¿Confirmas que estos datos son correctos/);assert.equal(f.state(timing).slots.preference,'mañana a las 10 am');assert.equal(f.state(timing).programIntake.customerName,'Laura Gómez');assert.equal(f.state(timing).programIntake.address,'Calle 50 # 42-18 apartamento 301');assert.equal(pending(f),0);f.deliver(timing);
  const final=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.sources.preference.text,text);assert.equal(entry.payload.sources.preference.id,timing.id);assert.equal(entry.payload.slots.preference,'mañana a las 10 am');
}));
for(const combined of [false,true])test('Soy wrapper is not persisted as part of the customer name: combined='+combined,t=>using(t,async f=>{
  await accepted(f);const name=await f.turn(combined?'Soy Laura Gómez y mi dirección es Calle 50 # 42-18 apartamento 301':'Soy Laura Gómez');assert.equal(f.state(name).programIntake.customerName,'Laura Gómez');assert.equal(f.state(name).programIntake.nameSource.text,name.text);f.deliver(name);if(!combined)await facts(f,'Dirección: Calle 50 # 42-18 apartamento 301');
  const timing=await f.turn('Lo necesito mañana a las 10 am.');assert.match(f.reply(timing),/• Nombre: Laura Gómez(?:\n|$)/);assert.doesNotMatch(f.reply(timing),/Nombre: Soy/);assert.equal(f.entry(timing),undefined);f.deliver(timing);const final=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.customerName,'Laura Gómez');assert.equal(entry.payload.sources.customerName.text,name.text);assert.equal(entry.payload.sources.customerName.id,name.id);
}));
