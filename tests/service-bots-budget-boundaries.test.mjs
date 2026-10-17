import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';

const START=Date.parse('2026-10-16T21:20:00.000Z');
const QUOTE='Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.';
const questions=f=>f.store.db.prepare("SELECT * FROM questions WHERE topic='commercial-discount-review'").all();
async function scenario(t,action){
 t.mock.timers.enable({apis:['Date'],now:START});
 const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));
 let externalCalls=0;t.mock.method(globalThis,'fetch',()=>{externalCalls++;throw Error('Budget boundary tests forbid network');});
 try{await action(f);assert.equal(externalCalls,0);}finally{f.store.close();}
}
async function startObjection(f){
 const quote=await f.turn(QUOTE);f.deliver(quote);
 const objection=await f.turn('Se me hace caro.');f.deliver(objection);
 return {quote,objection};
}

for(const text of ['Tengo 50 cucarachas.','Tengo 2 habitaciones.','Tengo 20 habitaciones.','Tengo 100 metros cuadrados.','Tengo cincuenta cucarachas y mil preguntas.','Tengo 50.000 cucarachas.','Tengo 50.5 metros cuadrados.'])test('service quantities after a price concern do not become a monetary budget: '+text,async t=>scenario(t,async f=>{
 await startObjection(f);const e=await f.turn(text),state=f.state(e);
 assert.equal(state.commercialPriceObjection?.budgetSourceId,undefined);
 assert.equal(state.commercialPriceObjection?.budgetLiteral,undefined);
 assert.equal(questions(f).length,0);
 assert.doesNotMatch(f.reply(e)||'',/Gracias por contarme tu presupuesto|opción autorizada para tu caso/);
}));

test('actual monetary budgets retain exact current sources, the original objection and only one internal question',async t=>scenario(t,async f=>{
 const {objection}=await startObjection(f),original=structuredClone(f.state(objection).commercialPriceObjection);
 for(const budget of ['Tengo $100.000.','Mi presupuesto es $90.000.']){
  const e=await f.turn(budget),state=f.state(e),marker=state.commercialPriceObjection;
  assert.match(f.reply(e),/Gracias por contarme tu presupuesto/);
  assert.equal(marker.sourceId,objection.id);assert.equal(marker.sourceHash,original.sourceHash);assert.match(marker.sourceHash,/^[a-f0-9]{64}$/);
  assert.equal(marker.budgetLiteral,budget);assert.equal(marker.budgetSourceId,e.id);assert.equal(marker.budgetSourceAt,e.at);assert.match(marker.budgetSourceHash,/^[a-f0-9]{64}$/);
  for(const key of ['quotationSourceId','quotationOutboxId','entryId','priceCop'])assert.equal(marker[key],original[key]);
  assert.equal(questions(f).length,1);assert.equal(state.quotedPrice.priceCop,129000);assert.notEqual(state.quotedPrice.accepted,true);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
  f.deliver(e);
 }
}));

for(const text of ['No gracias, mejor no.','No quiero continuar con la cotización.'])test('a clear refusal during price negotiation closes the case without another price or budget request: '+text,async t=>scenario(t,async f=>{
 await startObjection(f);const e=await f.turn(text);
 assert.equal(f.state(e).closed,true);
 assert.doesNotMatch(f.reply(e)||'',/129\.000|[¿?]|presupuesto|Deseas continuar|nombre completo/i);
 assert.equal(questions(f).length,0);
 const next=await f.turn('Gracias');assert.equal(f.row(next),undefined);
}));

for(const field of ['sourceHash','quotationSourceId','quotationOutboxId','entryId','priceCop'])test('a budget continuation must retain its original native objection and exact own quote binding: '+field,async t=>scenario(t,async f=>{
 const {objection}=await startObjection(f),state=f.state(objection);
 f.store.saveConversation(objection.phone,{...state,commercialPriceObjection:{...state.commercialPriceObjection,[field]:field==='priceCop'?1:'SYNTHETIC_WRONG_REFERENCE'}});
 const e=await f.turn('Mi presupuesto es $100.000.');
 assert.equal(f.state(e).commercialPriceObjection?.budgetSourceId,undefined);
 assert.equal(questions(f).length,0);
 assert.doesNotMatch(f.reply(e)||'',/Gracias por contarme tu presupuesto/);
}));
