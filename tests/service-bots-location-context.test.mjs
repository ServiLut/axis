import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';

function fixture(company='fumigacion'){
  const store=new Store(':memory:',company,randomBytes(32));
  const config={company,...BUSINESSES[company],enabled:true,chiefOnly:true,lines:BUSINESSES[company].phones.map(phone=>({phone}))};
  const engine=new Engine(store,config);let n=0;const at=Date.now();
  const enqueue=(text,extra={})=>{const event={id:'LOCATIONFIX'+(++n),phone:'573001112233',line:config.lines[0].phone,at:at+n,fromMe:false,kind:'text',text,...extra};store.enqueue(event);return event;};
  return {store,enqueue,handle:event=>engine.process(event),async process(text,extra={}){const event=enqueue(text,extra);await engine.process(event);return event;}};
}

test('a rapid quotation sequence includes both literal city and later location in the one chief question',async()=>{
  const f=fixture();try{
    await f.process('Hola, requiero una cotización técnica para control de [Plaga] en un [Empresa/Hogar] ubicado en [Municipio].');
    const size=f.enqueue('Medellín, 5 cuartos (pequeños), sala y comedor');
    const pest=f.enqueue('Cucarachas');await f.handle(size);await f.handle(pest);
    const location=f.enqueue('Manrique');const property=f.enqueue('Casa');await f.handle(location);await f.handle(property);
    const rows=f.store.db.prepare('SELECT recipient,body FROM questions').all();
    assert.equal(rows.length,1);assert.equal(rows[0].recipient,SANDRA);
    const question=f.store.open(rows[0].body);
    assert.match(question.text,/Medellín, 5 cuartos \(pequeños\), sala y comedor/);
    assert.match(question.text,/Manrique/);assert.match(question.text,/Inmueble: casa/);assert.match(question.text,/Servicio: cucarachas/);
    assert.equal(question.conditions.location,'medellin');
    const saved=f.store.conversation(property.phone).state;
    assert.deepEqual(saved.intakeLocationParts.map(part=>part.sourceId),[size.id,location.id]);
    assert.deepEqual(saved.intakeSources.locationDetails.sources.map(part=>part.sourceId),[size.id,location.id]);
    const count=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
    const repeated=await f.process('Manrique');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,count);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(repeated.id+':reply').n,0);
  }finally{f.store.close();}
});

test('an explicit prompted location remains literal without assigning its municipality',()=>{
  const event={id:'LOCATION-LITERAL',at:100,kind:'text',text:'Barrio Laureles'};
  const d=customerDecision('fumigacion',{slots:{service:'cucarachas',site:'casa',rooms:'2 cuartos'},asked:['location']},event);
  assert.equal(d.state.slots.locationDetails,event.text);assert.equal(d.state.slots.location,undefined);
  assert.equal(d.state.intakeSources.locationDetails.sourceId,event.id);
});

test('a short location name does not become location outside our prompt or from a link, question or forwarded message',()=>{
  const original={slots:{location:'medellin'},asked:[],initialIntakeAllRequested:true};
  for(const event of [
    {kind:'text',text:'No Manrique'},
    {kind:'text',text:'¿Manrique?'},
    {kind:'text',text:'https://example.com/Manrique?barrio=Laureles'},
    {kind:'text',text:'Manrique',forwarded:true},
    {kind:'audio',text:'Manrique'},
    {kind:'text',text:'Mi apellido es Manrique'}
  ]){
    const d=customerDecision('fumigacion',original,{id:'LOCATION-UNTRUSTED',at:100,...event});
    assert.equal(d.state.slots.locationDetails,undefined);
    assert.equal(d.state.intakeLocationParts,undefined);
  }
  const unrelated=customerDecision('fumigacion',{slots:{},asked:[]},{id:'LOCATION-NO-PROMPT',at:100,kind:'text',text:'Manrique'});
  assert.equal(unrelated.state.slots.locationDetails,undefined);
  const other=customerDecision('servicio-tecnico',original,{id:'LOCATION-OTHER',at:100,kind:'text',text:'Manrique'});
  assert.equal(other.state.slots.locationDetails,undefined);
});

test('future, another contact and staff sources cannot add location to the current quotation',async()=>{
  const f=fixture(),human=fixture();try{
    const first=await f.process('Hola');
    const property=f.enqueue('Casa, 2 cuartos en Medellín, cucarachas');
    f.enqueue('Manrique',{phone:'573001112234'});
    f.enqueue('Barrio inventado',{at:property.at+60000});
    f.enqueue('Barrio Laureles',{fromMe:true});
    assert.deepEqual(f.store.customerTurnBatch(property.phone,property.id,first.id).map(event=>event.text),[property.text]);
    await human.process('Hola');await human.process(property.text);
    const staff=await human.process('Barrio Laureles',{fromMe:true});
    const incoming=await human.process('Manrique');
    assert.equal(human.store.db.prepare('SELECT state FROM events WHERE id=?').get(staff.id).state,'STAFF_TAKEOVER');
    assert.equal(human.store.db.prepare('SELECT state FROM events WHERE id=?').get(incoming.id).state,'OBSERVED_HUMAN');
    assert.equal(human.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.doesNotMatch(human.store.conversation(incoming.phone).state.slots.locationDetails,/Laureles|Manrique/);
  }finally{f.store.close();human.store.close();}
});

test('a clearly new case does not inherit earlier location parts',async()=>{
  const f=fixture();try{
    const first=await f.process('Hola');
    await f.process('Casa, 2 cuartos, cucarachas, barrio Laureles');
    const next=await f.process('Nuevo servicio para una finca de 3 cuartos con hormigas en Sabaneta');
    const saved=f.store.conversation(next.phone).state;
    assert.notEqual(saved.caseId,'fumigacion:'+first.id);
    assert.equal(saved.slots.location,'sabaneta');
    assert.equal(saved.slots.locationDetails,undefined);
    assert.equal(saved.intakeLocationParts,undefined);
  }finally{f.store.close();}
});
