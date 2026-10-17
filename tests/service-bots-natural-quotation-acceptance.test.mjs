// Isolated Engine/Store regressions. No provider, model, production Store or
// business adapter is invoked; prepared requests remain synthetic local data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {acceptsOrdinaryQuotation,acceptsExplicitOrdinaryQuotation,confirmsOrdinarySummaryData} from '../automation/service-bots/maria-program.mjs';

const START=Date.parse('2026-10-16T21:20:00.000Z');
const POSITIVE=['Sí, acepto esa cotización','Sí, acepto la cotización','Acepto el servicio','Acepto esa cotización.','Acepto esta cotización, gracias.','Sí, acepto el servicio. Muchas gracias.','Si, acepto la cotizacion.'];
const NEGATIVE=[
  'No acepto esa cotización.','Sí, no acepto la cotización.','Sí, acepto esa cotización, pero con descuento.','Acepto el servicio si hay disponibilidad.','Si acepto la cotización','Si acepto el servicio',
  '¿Acepto esa cotización?','Sí, acepto la cotización, ¿cómo pago?','Mi vecina dijo: acepto esa cotización.','El asesor dice que acepto el servicio.','"Sí, acepto esa cotización"',
  'Acepto otra cotización.','Acepto el servicio anterior.','Acepto el servicio por $119.000.','Sí, acepto esa cotización de $119.000.','Acepto el servicio sólo si no cobran más.','Acepto el servicio cuando tenga dinero.','Tal vez acepto el servicio.',
  'Gracias, la voy a pensar.','Sí, acepto la cotización o la otra.','Sí, acepto el servicio y registra el pago.','Sí, acepto esa cotización. https://example.invalid/',
];
const naturalFacts='Sí, acepto esa cotización. Me llamo Persona Sintética y la dirección es Calle de Prueba 0 # 0.';
async function using(t,fn){t.mock.timers.enable({apis:['Date'],now:START});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:START-5000};try{await fn(f);}finally{f.store.close();}}
const quote=async f=>{const e=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.');assert.match(f.deliver(e),/129\.000/);return e;};
const registrations=f=>f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n;
for(const text of POSITIVE)test('whole-message price acceptance stays separate from final data confirmation: '+text,()=>{assert.equal(acceptsExplicitOrdinaryQuotation(text),true);assert.equal(acceptsOrdinaryQuotation(text),false);assert.equal(confirmsOrdinarySummaryData(text),false);});
for(const text of NEGATIVE)test('no quotation consent from a condition, refusal, different price, third party or question: '+text,()=>{assert.equal(acceptsExplicitOrdinaryQuotation(text),false);assert.equal(acceptsOrdinaryQuotation(text),false);});
test('explicit price consent can carry literal self-introduction and address without becoming final data consent',()=>{
 assert.equal(acceptsExplicitOrdinaryQuotation(naturalFacts),true);assert.equal(acceptsOrdinaryQuotation(naturalFacts),false);assert.equal(confirmsOrdinarySummaryData(naturalFacts),false);
});
for(const tail of [
 'pero no quiero el servicio','si hay disponibilidad','la asesora dijo que vale $119.000','según mi vecina',
 'el precio es $119.000','quiero registrar el pago','no acepto el precio','y dame un descuento',
])test('a labelled address cannot hide a condition, different price, third party or refusal: '+tail,()=>{
 assert.equal(acceptsExplicitOrdinaryQuotation(naturalFacts.replace(/\.$/,', '+tail+'.')),false);
});
test('Engine uses an accepted quote plus Me llamo/la dirección es and asks only the missing timing',t=>using(t,async f=>{
 const q=await quote(f),facts=await f.turn(naturalFacts),reply=f.reply(facts),state=f.state(facts);
 assert.equal(state.quotedPrice.accepted,true);assert.equal(state.quotedPrice.sourceId,q.id);assert.equal(state.quotedPrice.acceptanceSource,facts.id);assert.equal(state.quotedPrice.priceCop,129000);
 assert.equal(state.programIntake.customerName,'Persona Sintética');assert.equal(state.programIntake.address,'Calle de Prueba 0 # 0');
 assert.equal(state.programIntake.nameSource.id,facts.id);assert.equal(state.programIntake.addressSource.id,facts.id);
 assert.match(reply,/Qué día y franja/);assert.doesNotMatch(reply,/nombre completo|dirección completa|Deseas continuar|129\.000/);assert.equal(f.entry(facts),undefined);f.deliver(facts);
 const timing=await f.turn('Lo necesito mañana a las 9 am.');assert.match(f.reply(timing),/• Nombre: Persona Sintética/);assert.match(f.reply(timing),/• Dirección: Calle de Prueba 0 # 0/);assert.match(f.reply(timing),/¿Confirmas que estos datos son correctos/);assert.equal(f.entry(timing),undefined);f.deliver(timing);
 const final=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.sources.customerName.id,facts.id);assert.equal(entry.payload.sources.address.id,facts.id);assert.equal(entry.payload.sources.acceptance.id,final.id);assert.equal(entry.payload.quote.sourceId,q.id);assert.equal(entry.payload.quote.priceCop,129000);
}));
for(const text of POSITIVE.slice(0,3))test('Engine continues its delivered own 129K quotation and asks only missing data: '+text,t=>using(t,async f=>{
  const q=await quote(f),before=structuredClone(f.state(q)),questions=f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n;
  const acceptance=await f.turn(text),state=f.state(acceptance),reply=f.reply(acceptance);
  assert.equal(state.quotedPrice.accepted,true);assert.equal(state.quotedPrice.acceptanceSource,acceptance.id);assert.equal(state.quotedPrice.sourceId,q.id);assert.equal(state.quotedPrice.priceCop,129000);assert.equal(state.quotedPrice.scheduleHash,before.quotedPrice.scheduleHash);
  assert.deepEqual(state.slots,before.slots);assert.equal(state.programIntake.stage,'name');assert.match(reply,/nombre completo/);assert.match(reply,/dirección completa/);assert.match(reply,/día y franja/);assert.doesNotMatch(reply,/129\.000|Deseas continuar|Recibí tu pregunta/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,questions);assert.equal(registrations(f),0);
  f.deliver(acceptance);const facts=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');assert.match(f.reply(facts),/Qué día y franja/);assert.doesNotMatch(f.reply(facts),/nombre completo|dirección completa/);assert.equal(f.entry(facts),undefined);assert.equal(registrations(f),0);
  f.deliver(facts);const timing=await f.turn('Lo necesito mañana a las 9 am.');assert.match(f.reply(timing),/¿Confirmas que estos datos son correctos/);assert.match(f.reply(timing),/Preferencia solicitada: mañana a las 9 am/);assert.equal(f.entry(timing),undefined);f.deliver(timing);
  const final=await f.turn('Sí, confirmo que los datos son correctos.'),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.customerName,'Persona Sintética');assert.equal(entry.payload.address,'Calle 50 # 42-18 apartamento 301');assert.equal(entry.payload.quote.priceCop,129000);assert.equal(entry.payload.quote.sourceId,q.id);assert.equal(entry.payload.slots.preference,'mañana a las 9 am');assert.equal(entry.payload.sources.preference.id,timing.id);assert.equal(entry.payload.sources.acceptance.id,final.id);assert.notEqual(entry.payload.sources.acceptance.id,acceptance.id);assert.equal(entry.staffPlanning.mode,'internal-staff-assignment');assert.equal(entry.status,'PENDING');
}));
for(const text of POSITIVE.slice(0,3))test('accepting a quote again after a delivered summary never confirms new client fields or timing: '+text,t=>using(t,async f=>{
  await quote(f);f.deliver(await f.turn('Sí'));const facts=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');f.deliver(facts);const timing=await f.turn('Lo necesito mañana a las 9 am.');assert.match(f.reply(timing),/¿Confirmas que estos datos son correctos/);f.deliver(timing);
  const priceAgain=await f.turn(text);assert.equal(f.entry(priceAgain),undefined);assert.equal(registrations(f),0);assert.equal(f.state(priceAgain).programIntake.stage,'confirm');assert.equal(f.state(priceAgain).programIntake.customerName,'Persona Sintética');assert.equal(f.state(priceAgain).programIntake.address,'Calle 50 # 42-18 apartamento 301');assert.equal(f.state(priceAgain).slots.preference,'mañana a las 9 am');
}));
for(const mode of ['undelivered','missing-first-delivery','different-line','forwarded','quoted','human','missing-current-case','different-customer','no-current-quote'])test('natural quotation words do not replace their own current native scope: '+mode,t=>using(t,async f=>{
  const q=await quote(f),before=f.state(q);
  if(mode==='undelivered')f.store.db.prepare("UPDATE outbox SET state='ACCEPTED' WHERE id=?").run(f.row(q).id);
  if(mode==='missing-first-delivery')f.store.db.prepare('DELETE FROM meta WHERE key=?').run('first-delivery:'+f.row(q).id);
  if(mode==='human')await f.turn('La asesora está atendiendo este chat.',{fromMe:true});
  if(mode==='missing-current-case')f.store.saveConversation(q.phone,{...before,caseId:'fumigacion:SOURCE_NOT_STORED'});
  if(mode==='no-current-quote'){const {quotedPrice,...rest}=before;f.store.saveConversation(q.phone,rest);}
  const patch=mode==='different-line'?{line:f.config.lines[1].phone}:mode==='forwarded'?{forwarded:true}:mode==='quoted'?{quotedId:'OTHER_NATIVE_SOURCE'}:mode==='different-customer'?{phone:'573000005555'}:{};
  const a=await f.turn('Sí, acepto esa cotización',patch);assert.notEqual(f.state(a).quotedPrice?.accepted,true);assert.equal(f.entry(a),undefined);assert.equal(registrations(f),0);
  if(mode==='human')assert.equal(f.store.conversation(q.phone).hold,1);
}));
test('a vague acknowledgement after explicit postponement stays deferred and cannot collect or register data',t=>using(t,async f=>{
  await quote(f);const deferred=await f.turn('Gracias, por ahora lo voy a pensar.');f.deliver(deferred);const marker=structuredClone(f.state(deferred).customerDeferral);
  for(const text of ['Sí.','Listo.','De acuerdo.']){const a=await f.turn(text);assert.equal(f.state(a).customerDeferral.active,true);assert.deepEqual(f.state(a).customerDeferral,marker);assert.notEqual(f.state(a).quotedPrice?.accepted,true);assert.equal(f.state(a).programIntake,undefined);assert.equal(registrations(f),0);f.deliver(a);}
}));
