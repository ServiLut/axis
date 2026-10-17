import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {COMMERCIAL_OBJECTION_GUARD,literalCommercialRefusal,literalPriceObjection,ownCommercialCustomerTurn} from '../automation/service-bots/commercial-objections.mjs';
import {inactivityCandidate} from '../automation/service-bots/inactivity-followup.mjs';
import {SANDRA} from '../automation/service-bots/config.mjs';
import {officeReceptionDeclineText} from '../automation/service-bots/office-reception-snippets.mjs';

const START=Date.parse('2026-10-16T21:20:00.000Z');
const QUOTE='Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.';
const prepared=f=>f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n;
const discountQuestions=f=>f.store.db.prepare("SELECT * FROM questions WHERE topic='commercial-discount-review'").all();
async function fixture(t,action){
 t.mock.timers.enable({apis:['Date'],now:START});
 const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));
 let network=0;t.mock.method(globalThis,'fetch',()=>{network++;throw Error('Synthetic commercial tests forbid network');});
 try{await action(f);assert.equal(network,0);}finally{f.store.close();}
}
async function quote(f,{deliver=true}={}){const e=await f.turn(QUOTE);if(deliver)f.deliver(e);return e;}

test('ordinary price concern acknowledges the delivered current price without acceptance, discount or data intake',async t=>fixture(t,async f=>{
 const q=await quote(f),original=structuredClone(f.state(q).quotedPrice);
 const e=await f.turn('Se me hace caro para lo que tenía previsto.');
 assert.match(f.reply(e),/Entiendo tu preocupación por el precio/);assert.match(f.reply(e),/129\.000/);assert.match(f.reply(e),/presupuesto/);
 assert.doesNotMatch(f.reply(e),/Recibí tu pregunta|nombre completo|dirección completa|Deseas continuar|descuento (?:de|aprobado)/i);
 assert.deepEqual(f.state(e).quotedPrice,original);assert.equal(f.state(e).programIntake,undefined);assert.equal(prepared(f),0);assert.equal(discountQuestions(f).length,0);
 assert.equal(f.store.priceReplyStillValid(f.row(e)),true);
}));

test('discount request routes exactly one clear question to Sandra and never approves or reprices',async t=>fixture(t,async f=>{
 await quote(f);
 const first=await f.turn('Se me hace caro. ¿Tienen algún descuento?');f.deliver(first);
 const second=await f.turn('¿Me pueden hacer un descuento?');
 const questions=discountQuestions(f);assert.equal(questions.length,1);assert.equal(questions[0].recipient,SANDRA);
 const request=f.store.open(questions[0].body);assert.match(request.text,/129\.000/);assert.match(request.text,/¿Autorizas alguna opción.*mantener el valor/);
 assert.equal(request.conditions.priceCop,129000);assert.equal(questions[0].state,'PENDING');
 assert.match(f.reply(second),/aún no hay un descuento aprobado/);assert.equal(f.state(second).quotedPrice.priceCop,129000);assert.notEqual(f.state(second).quotedPrice.accepted,true);assert.equal(prepared(f),0);
}));

for(const budget of ['Tengo cien mil pesos. ¿Qué me recomiendas?','Mi presupuesto es $100.000.','Puedo gastar 100000 pesos.'])test('price conversation follows the supplied budget without a generic fallback or invented discount: '+budget,async t=>fixture(t,async f=>{
 await quote(f);const objection=await f.turn('Se me hace caro, tenía pensado gastar menos.');f.deliver(objection);
 const e=await f.turn(budget);assert.match(f.reply(e),/Gracias por contarme tu presupuesto/);assert.match(f.reply(e),/129\.000/);
 assert.doesNotMatch(f.reply(e),/Recibí tu pregunta|Qué presupuesto|¿Deseas continuar|descuento aprobado|nombre completo/);
 assert.equal(f.state(e).commercialPriceObjection.budgetLiteral,budget);assert.equal(f.state(e).commercialPriceObjection.budgetSourceId,e.id);
 assert.equal(f.state(e).quotedPrice.priceCop,129000);assert.notEqual(f.state(e).quotedPrice.accepted,true);assert.equal(prepared(f),0);
 const questions=discountQuestions(f);assert.equal(questions.length,1);assert.match(f.store.open(questions[0].body).text,/129\.000/);assert.ok(f.store.open(questions[0].body).text.includes(budget));
 f.deliver(e);const again=await f.turn(budget);assert.equal(discountQuestions(f).length,1);assert.match(f.reply(again),/Gracias por contarme tu presupuesto/);
}));

test('budget words without a delivered current objection do not create a discount request',async t=>fixture(t,async f=>{
 await quote(f);await f.turn('Tengo cien mil pesos. ¿Qué me recomiendas?');assert.equal(discountQuestions(f).length,0);
}));

for(const text of ['No gracias, no quiero el servicio. No me escriban más.','Usted es una hijueputa. No quiero el servicio. No me vuelvan a escribir.'])test('direct refusal and opt-out close intake, stay respectful, and persist without followups: '+text,async t=>fixture(t,async f=>{
 await quote(f);const e=await f.turn(text),state=f.state(e);
 assert.equal(state.closed,true);assert.equal(state.doNotContact,true);assert.equal(state.contactDeclined,true);assert.equal(state.commercialRefusal.guard,COMMERCIAL_OBJECTION_GUARD);assert.equal(state.quotedPrice.accepted,false);
 assert.doesNotMatch(f.reply(e),/hijueputa|insulto|groser|129\.000|Deseas continuar|nombre completo|dirección completa|Si más adelante/i);f.deliver(e);
 const courtesy=await f.turn('Gracias');assert.equal(f.row(courtesy),undefined);
 const next=await f.turn('Sí, acepto. Nombre: Laura Gómez. Dirección: Calle 50 # 42-18. Mañana a las 10 am.');assert.equal(f.row(next),undefined);assert.equal(f.state(next).closed,true);assert.equal(prepared(f),0);
 f.config.inactivityFollowupEnabled=true;assert.equal(inactivityCandidate(f.config,f.store,e.phone,Date.now()+21*60000),null);
 const count=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;await f.engine.process(e);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,count);
}));

test('durable same-line opt-out survives a case reset and a new-service attempt without reopening contact',async t=>fixture(t,async f=>{
 await quote(f);const refusal=await f.turn('No me escriban más.');
 f.store.saveConversation(refusal.phone,{slots:{},asked:[],lastText:'',caseId:'fumigacion:synthetic-reset'});
 const next=await f.turn('Necesito otro servicio para ratas en una casa de 60 m² en Bello.');
 assert.equal(f.row(next),undefined);assert.equal(f.state(next).doNotContact,true);assert.equal(f.state(next).closed,true);assert.equal(f.state(next).commercialRefusal.sourceId,refusal.id);assert.equal(prepared(f),0);
}));

test('a refusal without opt-out closes its case but does not manufacture a no-contact instruction',async t=>fixture(t,async f=>{
 await quote(f);const refusal=await f.turn('No gracias, no quiero el servicio.');
 assert.equal(f.state(refusal).closed,true);assert.notEqual(f.state(refusal).doNotContact,true);assert.equal(f.state(refusal).commercialRefusal.kind,'service-refusal');
 assert.equal(f.reply(refusal),officeReceptionDeclineText({reply:'Entendido, gracias por avisarme.',courtesy:true,state:{closed:true}}));
 const courtesy=await f.turn('Listo, gracias.');assert.equal(f.row(courtesy),undefined);assert.equal(prepared(f),0);
}));

for(const patch of [{forwarded:true},{quotedId:'SYNTHETIC_OTHER_PERSON_SOURCE'}])test('forwarded or quoted objections/refusals cannot create commercial consent or opt-out facts: '+JSON.stringify(patch),async t=>fixture(t,async f=>{
 await quote(f);
 for(const text of ['Se me hace caro. ¿Tienen descuento?','No quiero el servicio. No me escriban más.']){
  const e=await f.turn(text,patch);assert.equal(f.state(e).commercialRefusal,undefined);assert.equal(f.state(e).doNotContact,undefined);assert.equal(f.state(e).commercialPriceObjection,undefined);assert.equal(discountQuestions(f).length,0);
 }
}));

for(const text of ['Mi vecino dijo: no quiero el servicio, no me escriban más.','Según mi mamá, se le hace caro. ¿Tienen descuento?','El cliente preguntó si tienen descuento.','"No quiero el servicio. No me escriban más."','En otra empresa me dijeron que tienen descuento.'])test('reported or other-company words are not first-person commercial authority: '+text,()=>{
 const e={kind:'text',fromMe:false,forwarded:false,text};assert.equal(literalCommercialRefusal(e),null);assert.equal(literalPriceObjection(e),null);
});

test('narrated profanity about pests, negated rejection and explicit acceptance keep their proper paths',()=>{
 for(const text of ['Esas hijueputas cucarachas no me dejan dormir.','No quiero rechazar el servicio.','No quiero que me dejen sin servicio.','No quiero el servicio si no pueden atender mañana.'])assert.equal(literalCommercialRefusal({kind:'text',fromMe:false,text}),null);
 for(const text of ['No quiero un descuento, quiero el servicio.','Es caro, pero sí acepto ese valor.'])assert.equal(literalPriceObjection({kind:'text',fromMe:false,text}),null);
});

test('quote without delivery proof cannot support an authoritative price-objection reply or discount route',async t=>fixture(t,async f=>{
 await quote(f,{deliver:false});const e=await f.turn('Se me hace caro. ¿Tienen descuento?');
 assert.equal(f.state(e).commercialPriceObjection,undefined);assert.equal(discountQuestions(f).length,0);assert.doesNotMatch(f.reply(e)||'',/El valor de la cotización que te compartí es de/);assert.equal(prepared(f),0);
}));

test('accepted quotation is not reopened as an unaccepted objection and human hold remains in control',async t=>fixture(t,async f=>{
 await quote(f);const accepted=await f.turn('Sí, acepto esa cotización');f.deliver(accepted);
 const objection=await f.turn('Se me hace caro. ¿Tienen descuento?');assert.equal(f.state(objection).commercialPriceObjection,undefined);assert.equal(discountQuestions(f).length,0);
 await f.turn('Buenas tardes, te atiende una asesora.',{fromMe:true});const held=await f.turn('No quiero el servicio. No me escriban más.');
 assert.equal(f.store.conversation(held.phone).hold,1);assert.equal(f.row(held),undefined);assert.equal(f.state(held).commercialRefusal,undefined);
}));

test('historical, source-mismatched and other-company events cannot install prospective commercial markers',async t=>fixture(t,async f=>{
 const q=await quote(f);const state=f.state(q),current=Date.now();
 f.config.activatedAt=START-86400000;
 const pending={id:'SYNTHETIC_OLD_COMMERCIAL',phone:q.phone,line:q.line,at:current-600000,kind:'text',fromMe:false,forwarded:false,text:'No me escriban más.'};f.store.enqueue(pending);
 assert.equal(ownCommercialCustomerTurn(f.store,f.config,state,pending),null);
 const fresh={...pending,id:'SYNTHETIC_BOUND_COMMERCIAL',at:current,text:'Mensaje original'};f.store.enqueue(fresh);
 assert.equal(ownCommercialCustomerTurn(f.store,f.config,state,{...fresh,text:'No me escriban más.'}),null);
 assert.equal(ownCommercialCustomerTurn(f.store,{...f.config,company:'servicio-tecnico'},state,{...fresh,text:'Se me hace caro'}),null);
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'commercial-optout:%'").get().n,0);
}));
