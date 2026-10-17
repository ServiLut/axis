// Synthetic Engine/Store only. No transport, model, server or business writes.
import test from 'node:test';import assert from 'node:assert/strict';
import {acceptsOwnQuotedAmount,acceptsOrdinaryQuotation,quotationAmountAffirmation,literalProgramPreference} from '../automation/service-bots/maria-program.mjs';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
const realFailure='Sí, acepto los $129.000. Mi nombre es Persona Sintética y la dirección es Calle de Prueba 0 # 0. Lo necesito mañana a las 9 am.';
const start=Date.parse('2026-10-16T21:20:00.000Z');
async function using(t,fn){t.mock.timers.enable({apis:['Date'],now:start});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:start-5000};try{await fn(f);}finally{f.store.close();}}
test('the observed own amount and literal facts open intake but never confirm a summary',()=>{assert.equal(quotationAmountAffirmation(realFailure),129000);assert.equal(acceptsOwnQuotedAmount(realFailure,129000),true);assert.equal(acceptsOwnQuotedAmount(realFailure,119000),false);assert.equal(acceptsOrdinaryQuotation(realFailure),false);assert.equal(literalProgramPreference(realFailure),'mañana a las 9 am');});
for(const text of [
 'Sí, acepto los $129.000. Pero no quiero el servicio.',
 'Sí, acepto los $129.000. Si hay disponibilidad mañana a las 9 am.',
 'Mi vecina dijo: Sí, acepto los $129.000.',
 '"Sí, acepto los $129.000."',
 '¿Sí, acepto los $129.000?',
 'Sí, acepto los $129.000. Mi nombre es Persona Sintética. La asesora dijo que tiene garantía.',
 'Sí, acepto los $129.000. Mi nombre es Persona Sintética. https://example.invalid/',
 'Sí, acepto los $129.000. Quiero saber si son gratis los refuerzos.',
 'Sí, acepto los $129.000. Mi nombre es No Quiero. Lo necesito mañana a las 9 am.',
 'Sí, acepto los $129.000. Dirección: no sé. Lo necesito mañana a las 9 am.',
 'Sí, acepto los $129.000. Mi nombre es Persona Sintética y mi dirección es Calle de Prueba 0 # 0, no acepto el precio.',
 'Sí, acepto los $129.000. Mi dirección es Calle de Prueba 0 # 0 si hay disponibilidad mañana a las 9 am.',
 'Sí, acepto los $129.000. Mi dirección es Calle de Prueba 0 # 0 siempre que no cobren más.',
 'Sí, acepto los $129.000. Mi dirección es Calle de Prueba 0 # 0 según mi vecina.',
 'Sí, acepto los $129.000. Mi dirección es Calle de Prueba 0 # 0, el precio es $119.000.'
])test('combined amount rejects unknown, conditional or contradictory content: '+text,()=>{assert.equal(quotationAmountAffirmation(text),null);});
for(const [input,expected] of [
 ['Prefiero mañana a las 9 a. m.','mañana a las 9 a. m.'],
 ['Lo necesito mañana a las 9 am.','mañana a las 9 am'],
 ['Me equivoqué, prefiero mañana a las 10 a. m.','mañana a las 10 a. m.'],
 ['Mi nombre es Persona Sintética y la dirección es Calle de Prueba 0 # 0. Lo necesito mañana a las 9 am.','mañana a las 9 am']
])test('timing remains literal with source punctuation: '+input,()=>assert.equal(literalProgramPreference(input),expected));
for(const input of ['Si hay disponibilidad mañana a las 9 am.','No lo necesito mañana a las 9 am.','Mi asesor dijo que mañana a las 9 am.','Lo necesito mañana a las 9 am pero sólo si es gratis.'])test('timing refuses uncertain/negated/third-party remainder: '+input,()=>assert.equal(literalProgramPreference(input),null));
test('Engine advances the actual combined message to a complete sourced summary without reasking or reissuing quotation',t=>using(t,async f=>{
 const quote=await f.turn('Hola, quiero cotizar la fumigación de un apartamento de dos habitaciones en Itagüí, barrio Santa María. Tenemos cucarachas.');assert.match(f.deliver(quote),/129\.000/);
 const facts=await f.turn(realFailure),reply=f.reply(facts);assert.match(reply,/• Nombre: Persona Sintética/);assert.match(reply,/• Dirección: Calle de Prueba 0 # 0/);assert.match(reply,/• Preferencia solicitada: mañana a las 9 am/);assert.match(reply,/¿Confirmas que estos datos son correctos/);assert.doesNotMatch(reply,/Deseas continuar|compárteme|nombre completo|día y franja/);assert.equal(f.entry(facts),undefined);
 f.deliver(facts);const confirmation=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(confirmation);assert.ok(entry);assert.equal(entry.payload.customerName,'Persona Sintética');assert.equal(entry.payload.address,'Calle de Prueba 0 # 0');assert.equal(entry.payload.slots.preference,'mañana a las 9 am');assert.equal(entry.payload.sources.customerName.id,facts.id);assert.equal(entry.payload.sources.address.id,facts.id);assert.equal(entry.payload.sources.preference.id,facts.id);assert.equal(entry.payload.sources.acceptance.id,confirmation.id);assert.equal(entry.payload.quote.acceptanceId,confirmation.id);assert.equal(entry.staffPlanning.mode,'internal-staff-assignment');assert.equal(entry.status,'PENDING');
}));
test('corrected dotted time requires another delivered summary and a newer confirmation',t=>using(t,async f=>{
 f.deliver(await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí.'));const facts=await f.turn(realFailure);f.deliver(facts);
 const correction=await f.turn('Me equivoqué, prefiero mañana a las 10 a. m.');assert.match(f.reply(correction),/• Preferencia solicitada: mañana a las 10 a\. m\./);assert.doesNotMatch(f.reply(correction),/Preferencia solicitada: mañana a las 9/);assert.equal(f.entry(correction),undefined);f.deliver(correction);const final=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.slots.preference,'mañana a las 10 a. m.');assert.equal(entry.payload.sources.preference.id,correction.id);assert.equal(entry.payload.quote.acceptanceId,final.id);
}));
test('an amount/fact batch without exact current quote delivery cannot become an intake receipt',t=>using(t,async f=>{
 const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí.');f.deliver(quote);f.store.db.prepare('DELETE FROM meta WHERE key=?').run('first-delivery:'+quote.id+':reply');const facts=await f.turn(realFailure);assert.equal(f.entry(facts),undefined);assert.notEqual(f.state(facts).quotedPrice?.accepted,true);
}));
