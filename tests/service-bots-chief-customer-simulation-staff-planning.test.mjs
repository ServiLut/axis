// Process-local Engine only: all chief sources and delivery proofs are synthetic.
// No production Store, native provider, model, grant or business adapter is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startChiefCustomerSimulation,runChiefCustomerSimulationTurn,acknowledgeChiefCustomerSimulationOutput,chiefCustomerSimulationStatus,chiefCustomerSimulationDraft,finishChiefCustomerSimulation,CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD} from '../automation/service-bots/chief-customer-simulation.mjs';
import {executeChiefCustomerSimulation} from '../automation/service-bots/chief-customer-simulation-hook.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {canonical,registrationHash} from '../automation/service-bots/maria-program.mjs';

const BLUE='573126944997',RED='573126938721',clock=Date.parse('2026-10-16T23:00:00.000Z'),mode='internal-staff-assignment';
const prefix='María Ángel, prueba cliente: ',first='Esto es una PRUEBA. Tengo cucarachas en un apartamento de Itagüí de 2 habitaciones.';
const facts='Mi nombre es Persona Sintética y mi dirección es Calle de Prueba 0 # 0';
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(canonical(value))).digest('hex');
let sequence=0;
function fixture(t){
  t.mock.timers.enable({apis:['Date'],now:clock});
  let simulationId;
  const native=(text,patch={})=>{t.mock.timers.tick(1100);const source={id:'3EB0'+(++sequence).toString(16).toUpperCase().padStart(20,'0'),phone:SANDRA,line:BLUE,at:Date.now(),fromMe:false,forwarded:false,kind:'text',quotedId:null,text,...patch};return {source,sourceProof:{guard:CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,verified:true,sourceId:source.id,phone:source.phone,line:source.line,at:source.at,textHash:sha(source.text),nativeProofHash:sha('SYNTHETIC_LOCAL_PROOF:'+source.id)}};};
  const initial=native('María Ángel, inicia prueba cliente');
  const start=options=>{const result=startChiefCustomerSimulation({...initial,authorizationId:'synthetic-explicit-chief-mode-authorization',...options});simulationId=result.simulationId;return result;};
  const config={company:'fumigacion',enabled:false,chiefOnly:true,replyOnlyToChief:true,activatedAt:clock-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'fixture-unused-'+i})),operationalLineScope:{company:'fumigacion',version:'authorized-fumigacion-blue-only-v1',authorizationSource:'direct-user-20261009-red-block-24h',authorizedAt:new Date(clock-60000).toISOString(),activeLines:[BLUE],suspendedLines:[RED]}};
  const hookStart=async(patch={})=>{const c={...config,...patch};for(const key of ['provider','mariaProgram','readToken','transport'])Object.defineProperty(c,key,{enumerable:true,get(){throw Error('LIVE_CONFIG_MUST_NOT_ENTER_SIMULATION:'+key);}});const source=initial.source,result=await executeChiefCustomerSimulation({company:'fumigacion',get db(){throw Error('LIVE_STORE_NOT_USED_BY_START');}},c,{},source,{action:'customer-simulation',params:{command:'start'}},{verified:true,sourceId:source.id,phone:SANDRA,line:BLUE,at:source.at});simulationId=result.data.simulationId;return result;};
  const ack=output=>{t.mock.timers.tick(1000);acknowledgeChiefCustomerSimulationOutput({simulationId,outputId:output.id,proof:{guard:CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD,verified:true,internal:true,recipient:SANDRA,line:BLUE,outboxId:output.outboxId,mid:'3EB0'+(++sequence).toString(16).toUpperCase().padStart(20,'0'),text:output.text,textHash:output.textHash,state:'DELIVERED',verifiedAt:Date.now(),nativeProofHash:sha('SYNTHETIC_LOCAL_DELIVERY:'+output.id)}});};
  const turn=async(text,{acknowledge=true}={})=>{const input=native(prefix+text),result=await runChiefCustomerSimulationTurn({simulationId,...input,customerText:text});if(acknowledge)for(const output of result.outputs)ack(output);return {...input,result};};
  const close=()=>{if(simulationId&&['ACTIVE','REVIEW'].includes(chiefCustomerSimulationStatus({simulationId}).status))finishChiefCustomerSimulation({simulationId,...native('María Ángel, termina prueba cliente')});};
  return {initial,start,hookStart,turn,ack,close,get id(){return simulationId;}};
}
async function beforeTiming(f){
  await f.turn(first);await f.turn('Sí, deseo continuar con la cotización de $129.000.');return f.turn(facts);
}
const outputText=result=>result.outputs.map(output=>output.text).join('\n');

test('explicit staff planning remains isolated and captures requested timing before an acknowledged summary and final fresh confirmation',async t=>{
  const f=fixture(t),previous=globalThis.fetch;let fetched=0;globalThis.fetch=async()=>{fetched++;throw Error('NO_NETWORK_IN_STAFF_SIMULATION');};
  try{
    const initial=f.start({workflowMode:mode});assert.equal(initial.workflowMode,mode);const fields=await beforeTiming(f);assert.match(outputText(fields.result),/día y franja horaria prefieres/);assert.equal(fields.result.phase,'details');assert.equal(fields.result.testOrderDraft,null);
    const timing=await f.turn('Prefiero mañana en la tarde.',{acknowledge:false});assert.match(outputText(timing.result),/^• Preferencia solicitada: mañana en la tarde$/m);assert.match(outputText(timing.result),/Persona Sintética/);assert.match(outputText(timing.result),/Calle de Prueba 0 # 0/);assert.doesNotMatch(outputText(timing.result),/visita programada|técnico confirmado/);
    const premature=await f.turn('Sí, confirmo que los datos son correctos.');assert.equal(premature.result.testOrderDraft,null);for(const output of timing.result.outputs)f.ack(output);
    const final=await f.turn('Sí, confirmo que los datos son correctos.'),draft=final.result.testOrderDraft;assert.ok(draft);assert.equal(draft.initialTestFixtureEligible,true);const p=draft.envelope.syntheticPayload;
    assert.equal(p.slots.preference,'mañana en la tarde');assert.equal(p.sources.preference.text,'Prefiero mañana en la tarde.');assert.equal(p.customerName,'Persona Sintética');assert.equal(p.address,'Calle de Prueba 0 # 0');assert.equal(draft.fieldSourceMap.customerName,fields.source.id);assert.equal(draft.fieldSourceMap.address,fields.source.id);assert.equal(draft.fieldSourceMap.preference,timing.source.id);assert.notEqual(p.sources.preference.id,p.sources.customerName.id);assert.equal(draft.envelope.syntheticRequestHash,registrationHash(p));assert.match(p.summaryConfirmation.text,/• Preferencia solicitada: mañana en la tarde/);
    assert.equal(final.result.businessWrites,0);assert.equal(final.result.providerCalls,0);assert.equal(final.result.modelCalls,0);assert.equal(final.result.commercialDeliveryVerified,false);assert.equal(fetched,0);assert.doesNotMatch(JSON.stringify(final.result),/LIVE_CONFIG|apiKey|Bearer |readToken/);assert.equal(chiefCustomerSimulationDraft({simulationId:f.id}).testOrderDraft.initialTestFixtureEligible,true);
  }finally{globalThis.fetch=previous;f.close();}
});

test('the unchanged default sandbox still prepares the original fixture without a timing field',async t=>{
  const f=fixture(t);try{assert.equal(Object.hasOwn(f.start(),'workflowMode'),false);const fields=await beforeTiming(f);assert.match(outputText(fields.result),/¿Confirmas que estos datos/);assert.doesNotMatch(outputText(fields.result),/día y franja horaria prefieres/);const final=await f.turn('Confirmo');assert.equal(final.result.testOrderDraft.initialTestFixtureEligible,true);assert.equal(Object.hasOwn(final.result.testOrderDraft.envelope.syntheticPayload.sources,'preference'),false);}finally{f.close();}
});

test('a corrected requested time needs its own delivered revised summary and a new final confirmation',async t=>{
 const f=fixture(t);try{
  f.start({workflowMode:mode});await beforeTiming(f);await f.turn('Prefiero mañana a las 9 a. m.');
  const correction=await f.turn('Me equivoqué, prefiero mañana a las 10 a. m.',{acknowledge:false});
  assert.match(outputText(correction.result),/• Preferencia solicitada: mañana a las 10 a\. m/);assert.equal(correction.result.testOrderDraft,null);
  const premature=await f.turn('Sí, confirmo que los datos son correctos.');assert.equal(premature.result.testOrderDraft,null);
  for(const output of correction.result.outputs)f.ack(output);
  const completed=await f.turn('Sí, confirmo que los datos son correctos.'),p=completed.result.testOrderDraft.envelope.syntheticPayload;
  assert.match(p.slots.preference,/mañana a las 10 a\. m/);assert.equal(p.sources.preference.text,'Me equivoqué, prefiero mañana a las 10 a. m.');
  assert.equal(completed.result.testOrderDraft.fieldSourceMap.preference,correction.source.id);assert.equal(completed.result.testOrderDraft.initialTestFixtureEligible,true);
  assert.match(p.summaryConfirmation.text,/• Preferencia solicitada: mañana a las 10 a\. m/);assert.equal(completed.result.businessWrites,0);
 }finally{f.close();}
});

for(const value of [null,false,true,'other-mode',{enabled:true,mode,apiKey:'NOT_ALLOWED'}])test('a sandbox mode accepts only the literal whitelist, not configuration or authority: '+JSON.stringify(value),t=>{
  const f=fixture(t);try{assert.throws(()=>f.start({workflowMode:value}),/SIMULATION_WORKFLOW_MODE_UNSUPPORTED/);assert.equal(chiefCustomerSimulationStatus().status,'NOT_ACTIVE_OR_LOST_AFTER_RESTART');}finally{f.close();}
});

test('repeating the same native start does not change the already selected workflow',async t=>{
  const f=fixture(t);try{f.start();assert.equal(f.start({workflowMode:mode}).created,false);const fields=await beforeTiming(f);assert.match(outputText(fields.result),/¿Confirmas que estos datos/);assert.doesNotMatch(outputText(fields.result),/día y franja horaria prefieres/);}finally{f.close();}
});

for(const variant of ['active','absent','off','future','wrong-mode','malformed-cutoff'])test('the authorized chief hook copies only the currently active own workflow mode: '+variant,async t=>{
  const f=fixture(t);try{
    const staffPlanning=variant==='absent'?undefined:{enabled:variant!=='off',mode:variant==='wrong-mode'?'other-mode':mode,startsAt:variant==='future'?clock+60000:variant==='malformed-cutoff'?'not-a-date':clock};
    const start=await f.hookStart(staffPlanning===undefined?{}:{staffPlanning});assert.equal(start.state,'DONE');assert.equal(start.data.workflowMode,variant==='active'?mode:undefined);const fields=await beforeTiming(f);assert.equal(/día y franja horaria prefieres/.test(outputText(fields.result)),variant==='active');assert.equal(fields.result.businessWrites,0);assert.equal(fields.result.providerCalls,0);assert.equal(fields.result.modelCalls,0);
  }finally{f.close();}
});

test('an active live workflow does not bypass the hook pause and native Sandra authorization',async t=>{
  const f=fixture(t);try{const result=await f.hookStart({staffPlanning:{enabled:true,mode,startsAt:clock},enabled:true});assert.equal(result.state,'BLOCKED');assert.equal(chiefCustomerSimulationStatus().status,'NOT_ACTIVE_OR_LOST_AFTER_RESTART');}finally{f.close();}
});
