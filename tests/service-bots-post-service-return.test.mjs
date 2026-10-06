import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';

// Exact wording of the verified incoming complaint, with no contact or address.
const complaint='es que hace poco realizaron un control de plagas en mi apto, pero la verdad antes salieron mas cucarachas';
const initial={slots:{},asked:['service'],introduced:true};

test('a reported recent pest-control problem is reviewed before asking new-intake size',()=>{
  const d=customerDecision('fumigacion',initial,{id:'RECENT',at:1,kind:'text',text:complaint});
  assert.equal(d.reviewTopic,'service-followup');
  assert.equal(d.reviewConditions.kind,'post-service');
  assert.equal(d.question,undefined);
  assert.deepEqual(d.state.asked,initial.asked);
  assert.doesNotMatch(d.reply,/habitaciones|metros cuadrados|cotización|garantía|gratis|precio|hora confirmada/i);
});

test('literal recurrence and worsening after reported treatment both keep human review',()=>{
  for(const text of ['Me fumigaron el apartamento y ahora salen más cucarachas.','Nos realizaron un control de plagas y siguen apareciendo hormigas.','Hace poco realizaron una fumigación en mi casa, volvieron las cucarachas.','Me hicieron una fumigación y otra vez están apareciendo chinches.']){
    const d=customerDecision('fumigacion',initial,{kind:'text',text});
    assert.equal(d.reviewConditions?.kind,'post-service',text);
    assert.equal(d.question,undefined);
  }
});

test('new requests, denied treatment and unrelated accounts do not become post-service',()=>{
  for(const text of ['Quiero que realicen un control de plagas en mi apto porque salen más cucarachas.','No realizaron un control de plagas en mi apto y salen más cucarachas.','Nunca me hicieron una fumigación y siguen apareciendo chinches.','Realizaron un control de plagas en el apartamento de mi vecino y salieron más cucarachas.','Antes salieron más cucarachas. Quiero una fumigación nueva.']){
    const d=customerDecision('fumigacion',initial,{kind:'text',text});
    assert.notEqual(d.reviewConditions?.kind,'post-service',text);
  }
  const technical=customerDecision('servicio-tecnico',initial,{kind:'text',text:complaint});
  assert.notEqual(technical.reviewConditions?.kind,'post-service');
});

test('the same case persists one administrative review and no operational price request',async()=>{
  const store=new Store(':memory:','fumigacion',randomBytes(32));
  const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true};
  const engine=new Engine(store,config);let n=0;
  const process=async(text,extra={})=>{const e={id:'POSTSERVICE'+(++n),phone:'573001112233',line:config.phones[0],at:Date.now()+n,fromMe:false,kind:'text',text,...extra};store.enqueue(e);await engine.process(e);return e;};
  try{
    await process('amigo como vas');
    const first=await process(complaint);
    const repeat=await process('Nos realizaron un control de plagas y siguen apareciendo cucarachas.');
    const qs=store.db.prepare('SELECT topic,recipient FROM questions').all();
    assert.deepEqual(qs.map(({topic,recipient})=>({topic,recipient})),[{topic:'service-followup',recipient:SANDRA}]);
    assert.equal(store.db.prepare('SELECT state FROM events WHERE id=?').get(first.id).state,'REVIEW');
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(repeat.id+':reply').n,0);
    await process('Estamos revisando tu solicitud.',{fromMe:true});
    const held=await process(complaint);
    assert.equal(store.db.prepare('SELECT state FROM events WHERE id=?').get(held.id).state,'OBSERVED_HUMAN');
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(held.id+':reply').n,0);
  }finally{store.close();}
});
