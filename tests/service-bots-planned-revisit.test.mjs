import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';

// Anonymized wording of the verified customer turn; the technician's reported
// recommendation and requested time are claims, not a saved booking or tariff.
const request='Buenos días. En días pasados nos visitó el técnico de fumigación Carlos hizo su trabajo muy bien. Nos dio varias recomendaciones, entre ellas nueva visita en 10 días. Necesito que por favor me agende la cita para el viernes a las 8:00 am y no me cambien la hora ni el técnico. También necesito saber el precio.';
const initial={slots:{},asked:[]};
function fixture(){
  const store=new Store(':memory:','fumigacion',randomBytes(32));
  const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true};
  const engine=new Engine(store,config);let n=0;
  return {store,async process(text,extra={}){const e={id:'REVISIT'+(++n),phone:'573001112233',line:config.phones[0],at:Date.now()+n,fromMe:false,kind:'text',text,...extra};store.enqueue(e);await engine.process(e);return e;}};
}

test('a recommended return visit is reviewed before new intake, without claiming a booking',()=>{
  const d=customerDecision('fumigacion',initial,{id:'OBSERVED',at:1,kind:'text',text:request});
  assert.equal(d.reviewTopic,'service-followup');
  assert.equal(d.reviewConditions.kind,'planned-revisit');
  assert.deepEqual(d.state.asked,[]);
  assert.deepEqual(d.state.slots,{});
  assert.match(d.reviewQuestion,/antecedente.*disponibilidad.*técnico.*precio/i);
  assert.match(d.pendingQuestion,/8:00 am/);
  assert.match(d.reply,/pendiente de confirmación/i);
  assert.doesNotMatch(d.reply,/cotización|inmueble|habitaciones|municipio|Sandra|Carlos|8:00|agendad|reservad/i);
  assert.equal(d.question,undefined);
});

test('reported past treatment and an explicit second visit also preserve existing intake data',()=>{
  const state={slots:{site:'casa',rooms:'2 habitaciones',location:'medellin'},asked:['service'],introduced:true};
  const d=customerDecision('fumigacion',state,{id:'OTHER',at:2,kind:'text',text:'Me realizaron una fumigación. Quiero programar la segunda visita para el martes.'});
  assert.equal(d.reviewConditions.kind,'planned-revisit');
  assert.deepEqual(d.state.slots,state.slots);
  assert.deepEqual(d.state.asked,state.asked);
});

test('a planned revisit creates one case question only for Sandra and preserves staff takeover',async()=>{
  const f=fixture();try{
    const first=await f.process(request);
    const repeat=await f.process(request.replace('viernes','martes'));
    const qs=f.store.db.prepare('SELECT topic,recipient FROM questions').all();
    assert.deepEqual(qs.map(({topic,recipient})=>({topic,recipient})),[{topic:'service-followup',recipient:SANDRA}]);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(repeat.id+':reply').n,0);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(first.id).state,'REVIEW');
    const staff=await f.process('Buenos días, estamos atendiendo esta solicitud.',{fromMe:true});
    const held=await f.process(request);
    assert.equal(f.store.conversation(held.phone).hold,1);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(staff.id).state,'STAFF_TAKEOVER');
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(held.id).state,'OBSERVED_HUMAN');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(held.id+':reply').n,0);
  }finally{f.store.close();}
});

test('a forwarded recommendation stays unverified and personal risk takes precedence',()=>{
  const forwarded=customerDecision('fumigacion',initial,{id:'FORWARDED',at:1,kind:'text',text:request,forwarded:true});
  assert.equal(forwarded.reviewConditions.kind,'planned-revisit');
  assert.equal(forwarded.reviewConditions.directCustomerReport,false);
  for(const suffix of ['Tengo dolor e intoxicación.','Necesito una garantía gratis.','Ya pagué por transferencia.']){
    const d=customerDecision('fumigacion',initial,{kind:'text',text:request+' '+suffix});
    assert.ok(d.review);
    assert.notEqual(d.reviewConditions?.kind,'planned-revisit');
    assert.equal(d.question,undefined);
  }
});

test('new work, an unperformed service or third-party claims do not become the reported revisit',()=>{
  for(const text of ['Quiero agendar una nueva visita de fumigación para mi casa.','Nunca nos visitó el técnico de fumigación. Quiero programar una nueva visita.','No me realizaron una fumigación. Necesito una segunda visita.','El técnico de fumigación visitó a mi vecino. Necesito programar una nueva visita.']){
    const d=customerDecision('fumigacion',initial,{kind:'text',text});
    assert.notEqual(d.reviewConditions?.kind,'planned-revisit');
  }
  const technical=customerDecision('servicio-tecnico',initial,{kind:'text',text:request});
  assert.notEqual(technical.reviewConditions?.kind,'planned-revisit');
});

test('a duration question in the same followup cannot enter the common-answer intake path',async()=>{
  const f=fixture();try{
    const e=await f.process(request+' ¿Cuánto dura la visita?');
    const q=f.store.db.prepare('SELECT topic FROM questions').all();
    assert.deepEqual(q.map(x=>x.topic),['service-followup']);
    const reply=f.store.open(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply').body);
    assert.doesNotMatch(reply,/plaga|inmueble|durará|minutos|garantía/i);
    assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='APPROVED_CUSTOMER_ANSWER_SELECTED'").get().n,0);
  }finally{f.store.close();}
});
