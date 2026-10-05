import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';

// Exact wording of the verified turn, without contact identifiers.
const request='Por favor para solicitar unos documentos que me está requiriendo la empresa, posterior a la prestación del servicio de la fumigación';
const initial={slots:{},asked:[]};
function fixture(company='fumigacion'){
  const store=new Store(':memory:',company,randomBytes(32));
  const config={company,...BUSINESSES[company],enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING};
  const engine=new Engine(store,config);let n=0;
  const event=(text,extra={})=>({id:'DOCS'+(++n),phone:'573001112233',line:config.phones[0],at:Date.now()+n,fromMe:false,kind:'text',text,...extra});
  return {store,engine,event,async process(text,extra={}){const e=event(text,extra);store.enqueue(e);await engine.process(e);return e;}};
}
test('verified post-service document request goes to review before new intake',()=>{
  const d=customerDecision('fumigacion',initial,{kind:'text',text:request});
  assert.equal(d.reviewTopic,'service-documents');
  assert.deepEqual(d.state.slots,{});assert.deepEqual(d.state.asked,[]);
  assert.equal(d.question,undefined);
  assert.match(d.reply,/documentos/i);
  assert.doesNotMatch(d.reply,/inmueble|plaga|habitaciones|municipio|cotización|Sandra|Diego|Hilary|enviados|certificado emitido/i);
});
test('past-service variants preserve facts without confirming documents exist',()=>{
  const state={slots:{site:'casa',rooms:'2 habitaciones',location:'bello'},asked:['service']};
  for(const text of ['Necesito las fichas de seguridad después del servicio realizado.','Me hicieron una fumigación ayer y necesito los documentos.','Solicito los soportes de la reparación realizada.']){
    const d=customerDecision('fumigacion',state,{kind:'text',text});
    assert.equal(d.reviewTopic,'service-documents',text);
    assert.deepEqual(d.state.slots,state.slots);assert.deepEqual(d.state.asked,state.asked);
  }
});
test('one administrative question goes only to Sandra, then details and repetition do not reopen intake',async()=>{
  const f=fixture();try{
    const first=await f.process(request);
    const q=f.store.db.prepare('SELECT topic,recipient FROM questions').all();
    assert.deepEqual(q.map(({topic,recipient})=>({topic,recipient})),[{topic:'service-documents',recipient:SANDRA}]);
    const details=await f.process('Estos son los documentos: permiso ambiental, fichas de seguridad y ARL de quienes vinieron.');
    const repeat=await f.process(request);
    for(const e of [details,repeat])assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(e.id+':reply').n,0);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(first.id).state,'REVIEW');
    assert.equal(f.store.conversation(first.phone).state.awaitingHumanReview,true);
    assert.deepEqual(f.store.conversation(first.phone).state.slots,{});
  }finally{f.store.close();}
});
test('a rapid first batch keeps the prior document request when the list follows',async()=>{
  const f=fixture();try{
    const first=f.event(request),last=f.event('Estos son los documentos: permiso ambiental y fichas de seguridad de los productos utilizados.');
    f.store.enqueue(first);f.store.enqueue(last);await f.engine.process(first);await f.engine.process(last);
    const q=f.store.db.prepare('SELECT topic,recipient,body FROM questions').get();
    assert.equal(q.topic,'service-documents');assert.equal(q.recipient,SANDRA);
    assert.equal(f.store.open(q.body).source,first.id);
    const reply=f.store.open(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(last.id+':reply').body);
    assert.doesNotMatch(reply,/plaga|inmueble|habitaciones|municipio/i);
    assert.deepEqual(f.store.conversation(last.phone).state.slots,{});
  }finally{f.store.close();}
});
test('staff takeover continues to suppress a document request',async()=>{
  const f=fixture();try{
    await f.process('Estamos atendiendo tu solicitud.',{fromMe:true});
    const e=await f.process(request);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OBSERVED_HUMAN');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  }finally{f.store.close();}
});
test('a distinct new service may start its own intake after document review',async()=>{
  const f=fixture();try{
    await f.process(request);
    const e=await f.process('Necesito otro servicio para cucarachas en una casa de 2 habitaciones en Bello.');
    const state=f.store.conversation(e.phone).state;
    assert.equal(state.caseId,'fumigacion:'+e.id);
    assert.equal(state.slots.site,'casa');
    const questions=f.store.db.prepare('SELECT case_id,topic FROM questions').all();
    assert.ok(questions.some(q=>q.case_id===state.caseId&&q.topic==='cotizacion-verificada'));
    assert.equal(questions.filter(q=>q.topic==='service-documents').length,1);
  }finally{f.store.close();}
});
test('forwarded statements remain a review claim and never establish a saved service',()=>{
  const d=customerDecision('fumigacion',initial,{kind:'text',text:request,forwarded:true});
  assert.equal(d.reviewTopic,'service-documents');
  assert.equal(d.reviewConditions.directCustomerReport,false);
  assert.match(d.review,/no acredita/i);
});
test('prospective and unrelated document mentions do not become post-service requests',()=>{
  for(const text of ['¿Qué documentos necesito antes de fumigar mi casa?','Estoy vendiendo documentos para empresas.','Nunca me hicieron una fumigación. Necesito cotizar el servicio.']){
    assert.notEqual(customerDecision('fumigacion',initial,{kind:'text',text}).reviewTopic,'service-documents');
  }
});
test('a personal risk or payment report keeps its existing review ahead of document handling',()=>{
  for(const suffix of ['Tengo dolor e intoxicación.','Ya pagué por transferencia.']){
    const d=customerDecision('fumigacion',initial,{kind:'text',text:request+' '+suffix});
    assert.ok(d.review);assert.notEqual(d.reviewTopic,'service-documents');
  }
});
test('technical service documents keep their company and use Sandra without Fumigation prices',async()=>{
  const f=fixture('servicio-tecnico');try{
    await f.process('Necesito los documentos posteriores a la reparación realizada.');
    const q=f.store.db.prepare('SELECT topic,recipient,body FROM questions').get();
    assert.equal(q.topic,'service-documents');assert.equal(q.recipient,SANDRA);
    assert.match(f.store.open(q.body).text,/^S.TECNICO:/);
    assert.equal(f.store.approvedPriceCatalogs().length,0);
  }finally{f.store.close();}
});
