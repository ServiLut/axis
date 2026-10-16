// All original-chief events and delivery receipts below are synthetic fixtures.
// No webhook, native provider, real transport, model or production Store is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {startChiefCustomerSimulation,runChiefCustomerSimulationTurn,acknowledgeChiefCustomerSimulationOutput,chiefCustomerSimulationStatus,finishChiefCustomerSimulation,CHIEF_CUSTOMER_SIMULATION_GUARD,CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD,CHIEF_CUSTOMER_SIMULATION_PHONE,parseChiefCustomerSimulationCommand} from '../automation/service-bots/chief-customer-simulation.mjs';
import {registrationHash,canonical,acceptsOrdinaryQuotation} from '../automation/service-bots/maria-program.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {SANDRA} from '../automation/service-bots/config.mjs';
const BLUE='573126944997',RED='573126938721',clock=Date.parse('2026-10-16T22:00:00Z');
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
let sequence=0;
function fixture(t){
  t.mock.timers.enable({apis:['Date'],now:clock});
  const native=(text,patch={})=>{t.mock.timers.tick(1100);const source={id:'3EB0'+(++sequence).toString(16).toUpperCase().padStart(20,'0'),phone:SANDRA,line:BLUE,at:Date.now(),fromMe:false,forwarded:false,kind:'text',quotedId:null,text,...patch},sourceProof={guard:CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,verified:true,sourceId:source.id,phone:source.phone,line:source.line,at:source.at,textHash:sha(source.text),nativeProofHash:sha('SYNTHETIC_PROOF_ONLY:'+source.id)};return {source,sourceProof};};
  const start=native('María Ángel, inicia prueba cliente');
  const initial=startChiefCustomerSimulation({...start,authorizationId:'direct-user-explicit-sandra-simulation-test-fixture'});
  const id=initial.simulationId;
  const delivery=(output,patch={})=>({guard:CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD,verified:true,internal:true,recipient:SANDRA,line:BLUE,outboxId:output.outboxId,mid:'3EB0'+(++sequence).toString(16).toUpperCase().padStart(20,'0'),text:output.text,textHash:output.textHash,state:'DELIVERED',verifiedAt:Date.now(),nativeProofHash:sha('SYNTHETIC_DELIVERY_ONLY:'+output.id),...patch});
  const acknowledge=(output,patch={})=>{t.mock.timers.tick(1000);const proof=delivery(output,patch);return {proof,result:acknowledgeChiefCustomerSimulationOutput({simulationId:id,outputId:output.id,proof})};};
  const turn=async(text,{ack=true,sourcePatch={}}={})=>{const input={...native('María Ángel, prueba cliente: '+text,sourcePatch),customerText:text},result=await runChiefCustomerSimulationTurn({simulationId:id,...input});if(ack)for(const output of result.outputs)acknowledge(output);return {input,result};};
  const close=()=>{if(['ACTIVE','REVIEW'].includes(chiefCustomerSimulationStatus({simulationId:id}).status))finishChiefCustomerSimulation({simulationId:id,...native('María Ángel, termina prueba cliente')});};
  return {initial,id,native,delivery,acknowledge,turn,close,start};
}
const first='Esto es una PRUEBA. Tengo cucarachas en un apartamento de Itagüí de 2 habitaciones.';
const facts='Nombre: Persona Sintética\nDirección: Calle de Prueba 0 # 0';

test('the isolated customer flow quotes, captures literal fields and emits only a synthetic test envelope',async t=>{
  const f=fixture(t),previousFetch=globalThis.fetch;let fetched=0;
  globalThis.fetch=async()=>{fetched++;throw Error('NETWORK_FORBIDDEN_IN_SIMULATION');};
  try{
    const quote=await f.turn(first);assert.match(quote.result.outputs[0].text,/SIMULACIÓN/);assert.match(quote.result.outputs[0].text,/129.000/);assert.equal(quote.result.testOrderDraft,null);
    const accepted=await f.turn('Sí, deseo continuar con la cotización de $129.000.');assert.match(accepted.result.outputs[0].text,/nombre completo/);
    const fields=await f.turn(facts);assert.match(fields.result.outputs[0].text,/Persona Sintética/);assert.match(fields.result.outputs[0].text,/Calle de Prueba 0 # 0/);assert.match(fields.result.outputs[0].text,/Confirmas/);
    const final=await f.turn('Confirmo');
    const draft=final.result.testOrderDraft;assert.ok(draft);assert.equal(draft.initialTestFixtureEligible,true);
    const e=draft.envelope,p=e.syntheticPayload;assert.equal(p.customerName,'Persona Sintética');assert.equal(p.address,'Calle de Prueba 0 # 0');assert.equal(p.phone,CHIEF_CUSTOMER_SIMULATION_PHONE);assert.equal(p.line,BLUE);assert.equal(p.quote.priceCop,129000);assert.equal(p.quote.scheduleHash,BUSINESS_PRICE_HASH);assert.equal(e.synthetic,true);assert.equal(e.syntheticRequestHash,registrationHash(p));const {payloadHash,...body}=e;assert.equal(payloadHash,sha(body));
    assert.equal(final.result.commercialDeliveryVerified,false);assert.equal(final.result.ordinaryCustomerAcceptanceVerified,false);assert.equal(final.result.businessWrites,0);assert.equal(fetched,0);
    for(const ref of [p.sourceId,p.quote.sourceId,p.quote.acceptanceId,...Object.values(p.sources).map(s=>s.id)]){assert.match(ref,/^SIM_[a-f0-9]{64}$/);assert.ok(e.sourceMap.some(s=>s.syntheticSourceId===ref));}
    assert.match(p.quote.mid,/^SIM_[a-f0-9]{64}$/);assert.ok(e.simulatedDeliveries.some(d=>d.mid===p.quote.mid&&d.at===p.quote.deliveredAt&&d.synthetic===true));
    assert.ok(e.chiefSources.every(s=>s.author===SANDRA&&s.line===BLUE&&!s.fromMe&&!s.forwarded));assert.equal(draft.fieldSourceMap.customerName,fields.input.source.id);assert.equal(draft.fieldSourceMap.address,fields.input.source.id);assert.equal(draft.fieldSourceMap.acceptance,final.input.source.id);
    for(const [id,ref] of Object.entries(p.sources)){const mapping=e.sourceMap.find(m=>m.syntheticSourceId===ref.id);assert.ok(mapping,id);assert.equal(mapping.customerTextHash,sha(ref.text));assert.equal(mapping.nativeTextHash,e.chiefSources.find(n=>n.id===mapping.chiefSourceId).textHash);assert.equal(mapping.customerTextOffset,'María Ángel, prueba cliente: '.length);assert.notEqual(mapping.nativeTextHash,mapping.customerTextHash);}
    assert.equal(Object.hasOwn(final.result,'store'),false);assert.equal(Object.hasOwn(final.result,'config'),false);assert.doesNotMatch(JSON.stringify(final.result),/apiKey|Bearer |provider\.url|OPENAI_API_KEY/);
    if(process.env.MARIA_CHIEF_SIMULATION_FIXTURE_DIR){mkdirSync(process.env.MARIA_CHIEF_SIMULATION_FIXTURE_DIR,{recursive:true});writeFileSync(join(process.env.MARIA_CHIEF_SIMULATION_FIXTURE_DIR,'chief-customer-simulation-prefixed-envelope-synthetic.json'),JSON.stringify(e,null,2)+'\n');}
  }finally{globalThis.fetch=previousFetch;f.close();}
});

test('the native command prefix is explicit while the customer suffix remains literal, including multiline data',async t=>{
  const text='Nombre: Persona Sintética\nDirección: Calle de Prueba 0 # 0';
  assert.deepEqual(parseChiefCustomerSimulationCommand('María Ángel, prueba cliente: '+text),{action:'turn',customerText:text,customerTextOffset:'María Ángel, prueba cliente: '.length});
  for(const value of ['inicia prueba cliente','Sandra dijo: María Ángel, inicia prueba cliente','María Ángel, no inicia prueba cliente','María Ángel, ¿inicia prueba cliente?','María Ángel, si inicia prueba cliente','«María Ángel, inicia prueba cliente»','María Ángel, inicia prueba cliente y programa una orden','María Ángel, prueba cliente: '])assert.equal(parseChiefCustomerSimulationCommand(value),null,value);
  const f=fixture(t);try{
    const input=f.native('María Ángel, prueba cliente: '+text);
    for(const customerText of [text.trim()+'!',undefined,'Nombre: Otro nombre'])await assert.rejects(runChiefCustomerSimulationTurn({simulationId:f.id,...input,customerText}),/LITERAL_CUSTOMER_TEXT_REQUIRED/);
    const bare=f.native(text);await assert.rejects(runChiefCustomerSimulationTurn({simulationId:f.id,...bare,customerText:text}),/LITERAL_CUSTOMER_TEXT_REQUIRED/);
    assert.equal(chiefCustomerSimulationStatus({simulationId:f.id}).turns,0);
    assert.throws(()=>finishChiefCustomerSimulation({simulationId:f.id,...f.native('Termina')}),/EXPLICIT_FINISH_COMMAND_REQUIRED/);
  }finally{f.close();}
});

test('an unacknowledged simulated quote cannot prepare a registration or obtain a fake commercial-delivery claim',async t=>{
  const f=fixture(t);try{const q=await f.turn(first,{ack:false});assert.match(q.result.outputs[0].text,/129.000/);const yes=await f.turn('Sí',{ack:false});assert.equal(yes.result.testOrderDraft,null);assert.notEqual(yes.result.phase,'pending');assert.equal(yes.result.commercialDeliveryVerified,false);}finally{f.close();}
});

test('the actual internal reply needs exact recipient, line, MID, text, state and hash before its memory-only delivery is acknowledged',async t=>{
  const f=fixture(t);try{const q=await f.turn(first,{ack:false}),output=q.result.outputs[0];t.mock.timers.tick(1000);const good=f.delivery(output);
    for(const patch of [{recipient:'573000009999'},{line:RED},{mid:'SIM_'+'a'.repeat(64)},{text:good.text+' altered'},{textHash:'f'.repeat(64)},{state:'ACCEPTED'},{internal:false},{verified:false},{outboxId:'ANOTHER_ROW'},{verifiedAt:Date.now()+1},{nativeProofHash:'bad'}])assert.throws(()=>acknowledgeChiefCustomerSimulationOutput({simulationId:f.id,outputId:output.id,proof:{...good,...patch}}),/SIMULATION_EXACT_INTERNAL_DELIVERY_REQUIRED/);
    const accepted=acknowledgeChiefCustomerSimulationOutput({simulationId:f.id,outputId:output.id,proof:good});assert.equal(accepted.simulatedDelivery,true);assert.equal(accepted.commercialDeliveryVerified,false);assert.equal(acknowledgeChiefCustomerSimulationOutput({simulationId:f.id,outputId:output.id,proof:good}).created,false);
    assert.throws(()=>acknowledgeChiefCustomerSimulationOutput({simulationId:f.id,outputId:output.id,proof:{...good,mid:'3EB0'+'F'.repeat(20)}}),/SOURCE_CONFLICT/);
  }finally{f.close();}
});

test('names and addresses corrected after the first summary require another acknowledged summary and remain exact in the final DTO',async t=>{
  const f=fixture(t);try{await f.turn(first);await f.turn('Sí');await f.turn(facts);const correction=await f.turn('Nombre: Laura Gómez\nDirección: Calle de Prueba 1 # 2');assert.equal(correction.result.testOrderDraft,null);assert.match(correction.result.outputs[0].text,/Laura Gómez/);assert.match(correction.result.outputs[0].text,/Calle de Prueba 1 # 2/);const final=await f.turn('Confirmo');assert.ok(final.result.testOrderDraft);const d=final.result.testOrderDraft;assert.equal(d.envelope.syntheticPayload.customerName,'Laura Gómez');assert.equal(d.envelope.syntheticPayload.address,'Calle de Prueba 1 # 2');assert.equal(d.fieldSourceMap.customerName,correction.input.source.id);assert.equal(d.fieldSourceMap.address,correction.input.source.id);}finally{f.close();}
});

test('the isolated flow preserves a missing field, negation and deferral instead of manufacturing a completed order',async t=>{
  const f=fixture(t);try{await f.turn(first);await f.turn('Sí');const partial=await f.turn('Nombre: Persona Sintética');assert.equal(partial.result.testOrderDraft,null);assert.match(partial.result.outputs[0].text,/dirección/i);const deferred=await f.turn('Gracias, lo voy a pensar.');assert.equal(deferred.result.testOrderDraft,null);assert.equal(deferred.result.commercialDeliveryVerified,false);const no=await f.turn('No, no quiero continuar con la PRUEBA.');assert.equal(no.result.testOrderDraft,null);}finally{f.close();}
});

test('only one trial is active and duplicate native sources are idempotent without a second event or output',async t=>{
  const f=fixture(t);try{const second=f.native('María Ángel, inicia prueba cliente');assert.throws(()=>startChiefCustomerSimulation({...second,authorizationId:'another-direct-user-authorization'}),/ALREADY_ACTIVE/);const q=await f.turn(first,{ack:false});const duplicate=await runChiefCustomerSimulationTurn({simulationId:f.id,...q.input});assert.equal(duplicate.created,false);assert.deepEqual(duplicate.outputs,q.result.outputs);assert.equal(chiefCustomerSimulationStatus({simulationId:f.id}).turns,1);assert.equal(chiefCustomerSimulationStatus({simulationId:f.id}).outputs,1);assert.equal(startChiefCustomerSimulation({...f.start,authorizationId:'direct-user-explicit-sandra-simulation-test-fixture'}).created,false);
    const changed={...q.input.source,text:'Another body'};await assert.rejects(runChiefCustomerSimulationTurn({simulationId:f.id,source:changed,sourceProof:{...q.input.sourceProof,textHash:sha(changed.text)}}),/CONFLICT/);
  }finally{f.close();}
});

test('other senders, wrong lines, forwards, outgoing text, media and unverified proofs cannot enter the sandbox',async t=>{
  const f=fixture(t);try{for(const patch of [{phone:'573000009999'},{line:RED},{fromMe:true},{forwarded:true},{forwarded:undefined},{kind:'audio'},{at:Date.now()-180000},{at:Date.now()+10000}]){const bad=f.native('Necesito fumigación',patch);await assert.rejects(runChiefCustomerSimulationTurn({simulationId:f.id,...bad}),/NATIVE_CHIEF_SOURCE_REQUIRED/);}const bad=f.native('Necesito fumigación');await assert.rejects(runChiefCustomerSimulationTurn({simulationId:f.id,...bad,sourceProof:{...bad.sourceProof,verified:false}}),/NATIVE_CHIEF_PROOF_REQUIRED/);assert.equal(chiefCustomerSimulationStatus({simulationId:f.id}).turns,0);}finally{f.close();}
});

test('an unrelated quoted MID never becomes a customer reply to an own delivered test output',async t=>{
  const f=fixture(t);try{await f.turn(first);const bad={...f.native('María Ángel, prueba cliente: Sí',{quotedId:'3EB0'+'F'.repeat(20)}),customerText:'Sí'};await assert.rejects(runChiefCustomerSimulationTurn({simulationId:f.id,...bad}),/UNLINKED_REPLY/);assert.equal(chiefCustomerSimulationStatus({simulationId:f.id}).turns,1);}finally{f.close();}
});

test('finishing or losing the in-memory session cannot recover it, delete native history or claim a Tenaxis cleanup',async t=>{
  const f=fixture(t);const end=finishChiefCustomerSimulation({simulationId:f.id,...f.native('María Ángel, termina prueba cliente')});assert.equal(end.status,'FINISHED');assert.equal(end.memoryRetained,false);assert.match(end.text,/no se retiró ni se modificó/);assert.equal(chiefCustomerSimulationStatus({simulationId:f.id}).status,'FINISHED');await assert.rejects(runChiefCustomerSimulationTurn({simulationId:f.id,...f.native('Sí')}),/UNKNOWN_AFTER_RESTART_OR_NOT_STARTED/);assert.equal(chiefCustomerSimulationStatus({simulationId:'00000000-0000-4000-8000-000000000000'}).status,'NOT_ACTIVE_OR_LOST_AFTER_RESTART');assert.throws(()=>startChiefCustomerSimulation({...f.start,authorizationId:'direct-user-explicit-sandra-simulation-test-fixture'}),/OLD_START_NOT_REPLAYED/);
});

test('the short-lived memory expires closed without restarting or replaying an old trial',async t=>{
  const f=fixture(t);t.mock.timers.tick(2*3600000);assert.equal(chiefCustomerSimulationStatus({simulationId:f.id}).status,'EXPIRED');await assert.rejects(runChiefCustomerSimulationTurn({simulationId:f.id,...f.native('Sí')}),/UNKNOWN_AFTER_RESTART_OR_NOT_STARTED/);
});

test('the prepared test envelope is immutable even if another customer turn arrives before the explicit PRUEBA write',async t=>{
  const f=fixture(t);try{await f.turn(first);await f.turn('Sí');await f.turn(facts);const final=await f.turn('Confirmo');const saved=structuredClone(final.result.testOrderDraft.envelope);const courtesy=await f.turn('Gracias');assert.deepEqual(courtesy.result.testOrderDraft.envelope,saved);assert.equal(courtesy.result.testOrderDraft.envelope.testRunId,saved.testRunId);}finally{f.close();}
});

test('a processing failure keeps the memory in review instead of retrying a previously uncertain turn',async t=>{
  const f=fixture(t),original=Engine.prototype.process;try{Engine.prototype.process=async()=>{throw Error('SYNTHETIC_PROCESS_FAILURE');};await assert.rejects(f.turn(first),/SYNTHETIC_PROCESS_FAILURE/);assert.equal(chiefCustomerSimulationStatus({simulationId:f.id}).status,'REVIEW');Engine.prototype.process=original;await assert.rejects(f.turn('Sí'),/REVIEW_AFTER_PROCESSING_FAILURE/);}finally{Engine.prototype.process=original;f.close();}
});

for(const phrase of ['Sí, confirmo que los datos son correctos','Sí, los datos están bien'])test('natural data confirmation completes only the acknowledged synthetic summary: '+phrase,async t=>{
  const f=fixture(t);try{
    await f.turn(first);await f.turn('Sí');const fields=await f.turn(facts);assert.equal(acceptsOrdinaryQuotation(phrase),false);
    const result=await f.turn(phrase),draft=result.result.testOrderDraft;assert.ok(draft);const p=draft.envelope.syntheticPayload;
    assert.equal(p.sources.acceptance.text,phrase);assert.equal(p.customerName,'Persona Sintética');assert.equal(p.address,'Calle de Prueba 0 # 0');assert.equal(p.summaryConfirmation.phone,CHIEF_CUSTOMER_SIMULATION_PHONE);assert.match(p.summaryConfirmation.mid,/^SIM_[a-f0-9]{64}$/);assert.equal(p.summaryConfirmation.text,fields.result.outputs[0].text.split('\n\n').slice(1).join('\n\n'));assert.equal(result.result.ordinaryCustomerAcceptanceVerified,false);assert.equal(result.result.businessWrites,0);
    if(process.env.MARIA_CHIEF_SIMULATION_NATURAL_FIXTURE_DIR&&phrase.startsWith('Sí, confirmo'))writeFileSync(join(process.env.MARIA_CHIEF_SIMULATION_NATURAL_FIXTURE_DIR,'chief-customer-simulation-natural-summary-envelope-synthetic.json'),JSON.stringify(draft.envelope,null,2)+'\n');
  }finally{f.close();}
});

test('the longer PRUEBA-qualified data assertion remains a documented unsupported variant, without manufacturing consent',async t=>{
  const f=fixture(t);try{await f.turn(first);await f.turn('Sí');await f.turn(facts);const result=await f.turn('Sí, confirmo que los datos de la PRUEBA son correctos');assert.equal(result.result.testOrderDraft,null);assert.equal(result.result.outputs.length,0);assert.equal(result.result.phase,'confirm');}finally{f.close();}
});
