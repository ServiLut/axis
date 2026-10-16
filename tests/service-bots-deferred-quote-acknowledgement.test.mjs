// Synthetic deterministic Engine and chief-sandbox sources only: no network,
// model, real WhatsApp, production Store or business write is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {startChiefCustomerSimulation,runChiefCustomerSimulationTurn,acknowledgeChiefCustomerSimulationOutput,finishChiefCustomerSimulation,CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD} from '../automation/service-bots/chief-customer-simulation.mjs';
import {SANDRA} from '../automation/service-bots/config.mjs';
import {customerDeferralAcknowledgement} from '../automation/service-bots/customer-deferral.mjs';
const START=Date.parse('2026-10-16T22:50:00.000Z'),BLUE='573126944997';
const initial='Quiero cotizar un servicio nuevo para chinches: dos colchones en un apartamento de Itagüí, barrio Santa María. No hay otros muebles afectados.';
const uncertainty='Todavía no sé si será uno o dos colchones.',correction='Es un colchón, no dos.',defer='Gracias, por ahora lo voy a pensar.';
const count=(s,table)=>s.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)?s.db.prepare('SELECT COUNT(*) n FROM '+table).get().n:0;
const using=async(t,fn)=>{t.mock.timers.enable({apis:['Date'],now:START});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));try{await fn(f);}finally{f.store.close();}};
async function deferredQuote(f){
 const first=await f.turn(initial);assert.match(f.deliver(first),/200\.000/);
 const missing=await f.turn(uncertainty);assert.match(f.deliver(missing),/Cuántos colchones/);assert.doesNotMatch(f.reply(missing),/muebles|bases de cama/);
 const corrected=await f.turn(correction);assert.match(f.deliver(corrected),/100\.000/);const quote=structuredClone(f.state(corrected).quotedPrice);
 const deferred=await f.turn(defer);assert.match(f.deliver(deferred),/pensarlo con calma/);return {first,corrected,deferred,quote};
}
for(const acknowledgement of ['Sí.','Ok.','Listo, gracias.','De acuerdo.','Está bien.','Confirmo.'])test('a short acknowledgement after postponing the corrected quote neither resumes nor escalates: '+acknowledgement,t=>using(t,async f=>{
 const {deferred,quote}=await deferredQuote(f),before=f.state(deferred),privateQuestions=count(f.store,'questions'),groupQuestions=count(f.store,'tesa_questions'),internal=f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n;
 const final=await f.turn(acknowledgement),state=f.state(final);assert.doesNotMatch(f.reply(final)||'',/cotización.*confirmación|precio|alcance|deseas continuar|100[.,]000|200[.,]000|nombre completo|dirección/i);assert.match(f.reply(final)||'',/pensarlo con calma|de acuerdo|entendido/i);
 assert.deepEqual(state.quotedPrice,quote);assert.deepEqual(state.slots,before.slots);assert.deepEqual(state.customerDeferral,before.customerDeferral);assert.equal(state.customerDeferral.active,true);assert.notEqual(state.quotedPrice.accepted,true);assert.equal(state.programIntake,undefined);assert.equal(state.awaitingHumanReview,before.awaitingHumanReview);assert.equal(count(f.store,'questions'),privateQuestions);assert.equal(count(f.store,'tesa_questions'),groupQuestions);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,internal);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);assert.equal(f.store.conversation(final.phone).hold,0);
}));
test('the exact chief-sandbox customer sequence preserves the pause instead of emitting an internal pricing question',async t=>{
 t.mock.timers.enable({apis:['Date'],now:START});let n=0;const sha=text=>createHash('sha256').update(text).digest('hex');
 const native=text=>{t.mock.timers.tick(1100);const source={id:'SYNTHETIC_DEFERRED_CHIEF_'+ ++n,phone:SANDRA,line:BLUE,kind:'text',fromMe:false,forwarded:false,quotedId:null,at:Date.now(),text};return {source,sourceProof:{guard:CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,verified:true,sourceId:source.id,phone:SANDRA,line:BLUE,at:source.at,textHash:sha(source.text),nativeProofHash:sha('SYNTHETIC_NATIVE_'+source.id)}};};
 const started=startChiefCustomerSimulation({...native('María Ángel, inicia prueba cliente'),authorizationId:'direct-user-synthetic-deferred-customer-flow'}),id=started.simulationId;
 try{
  let last;
  for(const text of [initial,uncertainty,correction,defer,'Sí.']){
   last=await runChiefCustomerSimulationTurn({simulationId:id,...native('María Ángel, prueba cliente: '+text),customerText:text});
   for(const output of last.outputs){t.mock.timers.tick(1000);acknowledgeChiefCustomerSimulationOutput({simulationId:id,outputId:output.id,proof:{guard:CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD,verified:true,internal:true,recipient:SANDRA,line:BLUE,outboxId:output.outboxId,mid:'SYNTHETIC_REAL_INTERNAL_MID_'+ ++n,text:output.text,textHash:output.textHash,state:'DELIVERED',verifiedAt:Date.now(),nativeProofHash:sha('SYNTHETIC_DELIVERY_'+output.id)}});}
  }
  assert.equal(last.testOrderDraft,null);assert.equal(last.outputs.length,1);assert.equal(last.outputs[0].kind,'customer-reply');assert.match(last.outputs[0].text,/pensarlo con calma|de acuerdo|entendido/i);assert.doesNotMatch(last.outputs[0].text,/cotización.*confirmación|precio|alcance/i);assert.equal(last.businessWrites,0);assert.equal(last.providerCalls,0);assert.equal(last.modelCalls,0);
 }finally{finishChiefCustomerSimulation({simulationId:id,...native('María Ángel, termina prueba cliente')});}
});
test('an explicit later request can resume while a bare affirmative cannot supply that evidence',t=>using(t,async f=>{
 const {deferred}=await deferredQuote(f),original=f.state(deferred).customerDeferral;await f.turn('Sí.');const resumed=await f.turn('Quiero continuar');assert.equal(f.state(resumed).customerDeferral.active,false);assert.equal(f.state(resumed).customerDeferral.sourceId,original.sourceId);assert.equal(f.state(resumed).customerDeferral.resumedBy.sourceId,resumed.id);assert.notEqual(f.state(resumed).quotedPrice.accepted,true);
}));
test('a later explicit acceptance of the exact own delivered 100K quote resumes normal data collection without repricing or TESA',t=>using(t,async f=>{
 const {corrected,deferred,quote}=await deferredQuote(f),old=f.state(deferred),slots=structuredClone(old.slots),exclusion=structuredClone(old.mattressFurnitureExclusion),marker=structuredClone(old.customerDeferral),questions=count(f.store,'questions')+count(f.store,'tesa_questions');assert.equal(exclusion.active,true);
 await f.turn('Sí.');const final=await f.turn('Sí, deseo continuar con la cotización de $100.000.'),state=f.state(final);assert.equal(state.customerDeferral.active,false);assert.equal(state.customerDeferral.sourceId,marker.sourceId);assert.equal(state.customerDeferral.resumedBy.sourceId,final.id);assert.equal(state.customerDeferral.resumedBy.kind,'verified-own-quotation-acceptance');assert.equal(state.quotedPrice.sourceId,corrected.id);assert.equal(state.quotedPrice.priceCop,quote.priceCop);assert.equal(state.quotedPrice.priceCop,100000);assert.equal(state.quotedPrice.accepted,true);assert.deepEqual(state.slots,slots);assert.equal(state.mattressFurnitureExclusion.active,true);assert.equal(state.mattressFurnitureExclusion.sourceId,exclusion.sourceId);assert.equal(state.mattressFurnitureExclusion.sourceHash,exclusion.sourceHash);assert.equal(state.intakeSources.mattresses.sourceId,corrected.id);assert.match(f.reply(final),/nombre completo/);assert.match(f.reply(final),/dirección/);assert.doesNotMatch(f.reply(final),/precio|alcance|200[.,]000|100[.,]000/);assert.ok(state.programIntake);assert.equal(f.entry(final),undefined);assert.equal(count(f.store,'questions')+count(f.store,'tesa_questions'),questions);
}));
for(const mode of ['wrong-amount','no-first-proof','quoted','forwarded','ACCEPTED','UNCERTAIN','no-mid','other-line','negated','conditional'])test('an amount cannot resume the postponement without its current own direct delivered quote: '+mode,t=>using(t,async f=>{
 const {corrected}=await deferredQuote(f);await f.turn('Sí.');if(mode==='no-first-proof')f.store.db.prepare('DELETE FROM meta WHERE key=?').run('first-delivery:'+f.row(corrected).id);if(['ACCEPTED','UNCERTAIN'].includes(mode))f.store.db.prepare('UPDATE outbox SET state=? WHERE id=?').run(mode,f.row(corrected).id);if(mode==='no-mid')f.store.db.prepare('UPDATE outbox SET mid=NULL WHERE id=?').run(f.row(corrected).id);
 const text=mode==='wrong-amount'?'Sí, deseo continuar con la cotización de $200.000.':mode==='negated'?'No deseo continuar con la cotización de $100.000.':mode==='conditional'?'Si pueden, deseo continuar con la cotización de $100.000.':'Sí, deseo continuar con la cotización de $100.000.';
 const final=await f.turn(text,mode==='quoted'?{quotedId:'ANOTHER_SOURCE'}:mode==='forwarded'?{forwarded:true}:mode==='other-line'?{line:f.config.lines[1].phone}:{});assert.equal(f.state(final).customerDeferral.active,true);assert.notEqual(f.state(final).quotedPrice.accepted,true);assert.equal(f.state(final).programIntake,undefined);assert.equal(f.entry(final),undefined);
}));
for(const [text,patch] of [['¿Sí?',{}],['Sí, ya pagué.',{}],['Sí, pero mi bebé tiene dolor.',{}],['Mi vecino dijo: sí.',{}],['"Sí"',{}],['Sí.',{forwarded:true}],['Sí.',{quotedId:'OTHER_SOURCE'}],['Sí.',{fromMe:true}],['Sí.',{kind:'audio'}],['Sí, quiero continuar',{}]])test('the new acknowledgement helper grants no authority to questions, priority or relayed words: '+text+JSON.stringify(patch),()=>{
 assert.equal(customerDeferralAcknowledgement({id:'SYNTHETIC_ACK_SOURCE',phone:'573000007384',line:BLUE,at:START,kind:'text',fromMe:false,forwarded:false,text,...patch}),false);
});
test('a safety or payment question after deferral keeps its original review priority and cannot accept the quote',t=>using(t,async f=>{
 await deferredQuote(f);const question=await f.turn('Sí, pero mi bebé tiene dolor.');assert.equal(f.state(question).customerDeferral.active,true);assert.doesNotMatch(f.reply(question)||'',/pensarlo con calma/);assert.ok(count(f.store,'questions')>0);assert.notEqual(f.state(question).quotedPrice.accepted,true);assert.equal(f.entry(question),undefined);
}));
test('a genuinely new case does not inherit the prior postponement, and ordinary quote acceptance still works',t=>using(t,async f=>{
 const old=await deferredQuote(f),oldCase=f.state(old.deferred).caseId,next=await f.turn('Quiero cotizar otro servicio nuevo para cucarachas en un apartamento de dos habitaciones en Bello.');assert.notEqual(f.state(next).caseId,oldCase);assert.equal(f.state(next).customerDeferral,undefined);f.deliver(next);const yes=await f.turn('Sí.');assert.equal(f.state(yes).quotedPrice.accepted,true);assert.match(f.reply(yes),/nombre completo|dirección/);assert.equal(f.entry(yes),undefined);
}));
