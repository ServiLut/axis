import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,OPERATOR_ROUTING,DIEGO,HILARY} from '../automation/service-bots/config.mjs';
import {specialQuotation,selectPrice} from '../automation/service-bots/prices.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';

const address='Carrera 12 Sur 34 Apto 503 Torre 1 Conjunto Alameda Sabaneta';
function fixture(){
  const store=new Store(':memory:','fumigacion',randomBytes(32));
  const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING};
  const engine=new Engine(store,config);let n=0;const at=Date.now();
  const enqueue=(text,extra={})=>{const e={id:'CONTROLFIX'+(++n),phone:'573001112233',line:config.phones[0],at:at+n,fromMe:false,kind:'text',text,...extra};store.enqueue(e);return e;};
  return {store,enqueue,handle:e=>engine.process(e),async process(text,extra={}){const e=enqueue(text,extra);await engine.process(e);return e;}};
}
test('a requested control visit and a fifteen-day control require antecedent review before intake',()=>{
  for(const text of ['Por favor visita de control','Control de 15 días']){
    const d=customerDecision('fumigacion',{slots:{},asked:[]},{id:'CONTROL',at:1,kind:'text',text});
    assert.equal(d.reviewTopic,'service-followup');assert.equal(d.reviewConditions.kind,'requested-control');
    assert.deepEqual(d.state.asked,[]);assert.match(d.reviewQuestion,/antecedente/);
    assert.doesNotMatch(d.reply,/plaga|inmueble|cotiz|gratis|garant|agendad|confirmado/i);
  }
});
test('control continuation saves literal facts with one question, without restarting a quotation',async()=>{
  const f=fixture();try{
    const first=await f.process('Por favor visita de control');await f.process('Control de 15 días');
    const pest=f.enqueue('Cucarachas'),extra=f.enqueue('Y hormiga');await f.handle(pest);await f.handle(extra);
    await f.process(address+' Hora 10.30 am');
    const qs=f.store.db.prepare('SELECT topic,recipient FROM questions').all();
    assert.deepEqual(qs.map(q=>q.topic),['service-followup']);assert.equal(qs[0].recipient,DIEGO);
    assert.deepEqual(f.store.db.prepare('SELECT phone FROM outbox WHERE internal=1 ORDER BY phone').all().map(r=>r.phone).sort(),[DIEGO,HILARY].sort());
    const state=f.store.conversation(first.phone).state;
    assert.equal(state.slots.service,'cucarachas y hormigas');assert.equal(state.slots.site,'apartamento');
    assert.equal(state.requestedControlReview.sourceId,first.id);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='REVIEWED_PRICE_SELECTED'").get().n,0);
  }finally{f.store.close();}
});
test('additive pests in one rapid batch retain both own sources',async()=>{
  const f=fixture();try{
    await f.process('Hola');const pest=f.enqueue('Cucarachas'),extra=f.enqueue('Y hormiga');
    await f.handle(pest);await f.handle(extra);
    const state=f.store.conversation(extra.phone).state;
    assert.equal(state.slots.service,'cucarachas y hormigas');
    assert.deepEqual(state.intakeSources.service.sources.map(s=>s.sourceId),[pest.id,extra.id]);
  }finally{f.store.close();}
});
test('a later additive pest retains the prior pest, while an explicit correction replaces it',async()=>{
  const f=fixture();try{
    await f.process('Cucarachas');const extra=await f.process('También hormigas');
    assert.equal(f.store.conversation(extra.phone).state.slots.service,'cucarachas y hormigas');
    const correction=await f.process('No, son chinches');
    assert.equal(f.store.conversation(correction.phone).state.slots.service,'chinches');
  }finally{f.store.close();}
});
test('an apartment address inside a complex is not a request for the whole property',()=>{
  for(const text of [address,'Cucarachas en mi apartamento en un conjunto residencial en Sabaneta','Un apartamento en el edificio Alameda, 3 habitaciones en Sabaneta']){
    assert.equal(specialQuotation(text,{site:'apartamento'}),false);
  }
  const selected=selectPrice({service:'cucarachas',site:'apartamento',rooms:'3 habitaciones',location:'sabaneta',locationDetails:address},[approvedBusinessPriceSchedule()]);
  assert.equal(selected.entry.priceCop,149000);
});
test('common areas, whole buildings and multiple properties still require special review',()=>{
  for(const text of ['Cotizar el edificio entero','Fumigación para el conjunto residencial Alameda','Mi apartamento y las zonas comunes del conjunto','Apartamento y parqueadero','2 apartamentos en un conjunto','Cotización técnica formal para un apartamento']){
    assert.equal(specialQuotation(text,{site:'apartamento'}),true);
  }
});
test('a control followup keeps an already pending own case question and its destinations',async()=>{
  const f=fixture();try{
    const initial=await f.process('Cucarachas en edificio de 5 apartamentos');
    const before=f.store.db.prepare('SELECT id,recipient,outbox_id FROM questions').all();
    await f.process('Control de 15 días');
    assert.deepEqual(f.store.db.prepare('SELECT id,recipient,outbox_id FROM questions').all(),before);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);
    assert.equal(f.store.conversation(initial.phone).state.humanServiceConfirmed,undefined);
  }finally{f.store.close();}
});
test('general prevention, negative prior-service statements and the technical company do not adopt a control visit',()=>{
  for(const text of ['Quiero un nuevo servicio de control de plagas','Servicio preventivo de control de plagas cada 15 días','No necesito visita de control, es una fumigación nueva']){
    assert.notEqual(customerDecision('fumigacion',{slots:{},asked:[]},{kind:'text',text}).reviewConditions?.kind,'requested-control');
  }
  assert.notEqual(customerDecision('servicio-tecnico',{slots:{},asked:[]},{kind:'text',text:'Control de 15 días'}).reviewConditions?.kind,'requested-control');
});
test('a new explicit service after control starts a separate case with its own facts',async()=>{
  const f=fixture();try{
    const first=await f.process('Control de 15 días');
    const next=await f.process('Nuevo servicio para una casa de 3 habitaciones con chinches en Bello');
    const state=f.store.conversation(next.phone).state;
    assert.notEqual(state.caseId,'fumigacion:'+first.id);assert.equal(state.requestedControlReview,undefined);
    assert.equal(state.slots.service,'chinches');
  }finally{f.store.close();}
});
test('staff takeover suppresses control continuation and does not release the case',async()=>{
  const f=fixture();try{
    await f.process('Control de 15 días');await f.process('Estamos atendiendo.',{fromMe:true});
    const held=await f.process('Control de 15 días');
    assert.equal(f.store.conversation(held.phone).hold,1);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(held.id).state,'OBSERVED_HUMAN');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(held.id+':reply').n,0);
  }finally{f.store.close();}
});
