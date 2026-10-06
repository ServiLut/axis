import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,OPERATOR_ROUTING,DIEGO,SANDRA} from '../automation/service-bots/config.mjs';

function fixture(){
  const store=new Store(':memory:','servicio-tecnico',randomBytes(32));
  const config={company:'servicio-tecnico',...BUSINESSES['servicio-tecnico'],enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING};
  const engine=new Engine(store,config);let seq=0;
  return {store,config,async process(text,patch={}){
    const e={id:'TECH_PAINT_'+(++seq),phone:'573001112233',line:config.phones[1],kind:'text',fromMe:false,at:Date.now()+seq,text,...patch};
    store.enqueue(e);await engine.process(e);return e;
  },replies(){return store.db.prepare('SELECT body FROM outbox WHERE internal=0').all().map(r=>store.open(r.body));}};
}

test('explicit refrigerator painting reviews actual service scope once before fault or scheduling intake',async()=>{
  const f=fixture();try{
    await f.process('Hola! Necesito un servicio tecnico de reparación');
    const request=await f.process('necesito pintar una nevera gris plata');
    await f.process('tienen ese servicio??');await f.process('listo');
    await f.process('tienen ese servicio?');await f.process('solo por saber');
    await f.process('yo les llevaria la nevera');await f.process('estoy en medellin');
    const replies=f.replies();
    assert.equal(replies.some(t=>/qué falla|día y franja|municipio y barrio/i.test(t)),false);
    const questions=f.store.db.prepare('SELECT topic,recipient FROM questions').all();
    assert.deepEqual(questions.map(r=>({...r})),[{topic:'special-quotation',recipient:DIEGO}]);
    const state=f.store.conversation(request.phone).state;
    assert.equal(state.technicalPaintingRequest.sourceId,request.id);
    assert.equal(state.technicalPaintingRequest.text,request.text);
    assert.equal(state.slots.location,'medellin');
    assert.equal(state.slots.preference,undefined);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,1);
    assert.equal(replies.filter(t=>/pintura/i.test(t)).length,1);
  }finally{f.store.close();}
});

test('literal repeated customer question ignores punctuation and preserves the original pending recipient',async()=>{
  const f=fixture();try{
    const first=await f.process('Tienen ese servicio??');
    const old=f.store.db.prepare('SELECT * FROM questions').get();
    assert.equal(old.recipient,SANDRA);
    f.store.db.prepare("UPDATE outbox SET state='DELIVERED',mid='EXISTING_OWN_MID' WHERE id=?").run(old.outbox_id);
    await f.process('tienen ese servicio?');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(f.replies().length,1);
    assert.equal(f.store.db.prepare('SELECT recipient FROM questions').get().recipient,SANDRA);
    assert.equal(f.store.db.prepare('SELECT mid FROM outbox WHERE id=?').get(old.outbox_id).mid,'EXISTING_OWN_MID');
    const different=await f.process('Cuánto cuesta?');
    assert.notEqual(first.id,different.id);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,2);
  }finally{f.store.close();}
});

test('historical availability question stays at Sandra when painting scope becomes explicit',async()=>{
  const f=fixture();try{
    await f.process('tienen ese servicio?');
    const old=f.store.db.prepare('SELECT * FROM questions').get();
    f.store.db.prepare("UPDATE outbox SET state='DELIVERED',mid='HISTORICAL_SCOPE_MID' WHERE id=?").run(old.outbox_id);
    await f.process('necesito pintar una nevera gris plata');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(f.store.db.prepare('SELECT recipient FROM questions').get().recipient,SANDRA);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,1);
    assert.equal(f.replies().length,1);
  }finally{f.store.close();}
});

test('painting recognition cannot adopt a forwarded or negated request, payment, exception, or Fumigacion scope',()=>{
  const state={slots:{},asked:[]};
  for(const patch of [{text:'no necesito pintar una nevera, necesito reparar la lavadora'},{text:'necesito pintar una nevera gris plata',forwarded:true}]){
    const d=customerDecision('servicio-tecnico',state,{kind:'text',...patch});
    assert.equal(d.state.technicalPaintingRequest,undefined);
  }
  for(const text of ['necesito pintar una nevera, ya pagué','quiero pintar una nevera, tengo una queja']){
    const d=customerDecision('servicio-tecnico',state,{kind:'text',text});
    assert.ok(d.review);assert.notEqual(d.reviewTopic,'special-quotation');
  }
  const d=customerDecision('fumigacion',state,{kind:'text',text:'necesito pintar una nevera gris plata'});
  assert.equal(d.state.technicalPaintingRequest,undefined);
});

test('human hold and an explicit new case preserve their independent boundaries',async()=>{
  const f=fixture();try{
    const first=await f.process('necesito pintar una nevera gris plata');
    const second=await f.process('otro equipo, lavadora que no centrifuga');
    assert.equal(f.store.conversation(second.phone).state.technicalPaintingRequest,undefined);
    assert.notEqual(f.store.conversation(second.phone).state.caseId,'servicio-tecnico:'+first.id);
    f.store.hold(first.phone,'EXACT_STAFF_SOURCE',true);
    const before=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
    const held=await f.process('tienen ese servicio?');
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(held.id).state,'OBSERVED_HUMAN');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,before);
    assert.equal(f.store.conversation(held.phone).hold,1);
  }finally{f.store.close();}
});
