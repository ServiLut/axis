import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision,extractSlots} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,DIEGO} from '../automation/service-bots/config.mjs';

function fixture(){
  const store=new Store(':memory:','fumigacion',randomBytes(32));
  const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,lines:BUSINESSES.fumigacion.phones.map(phone=>({phone}))};
  const engine=new Engine(store,config);let n=0;
  return {store,async process(text){const event={id:'INTAKEFIX'+(++n),phone:'573001112233',line:config.lines[0].phone,at:Date.now()+n,fromMe:false,kind:'text',text};store.enqueue(event);await engine.process(event);return event;}};
}

test('size reply uses the preceding area question without repeating the same data request',async()=>{
  const f=fixture();try{
    await f.process('Hola, requiero una cotización técnica para control de Cucarachas en un apartamento ubicado en Medellín.');
    const e=await f.process('Hola María Ángel son 52 metros');
    assert.equal(f.store.conversation(e.phone).state.slots.area,'52 metros');
    const questions=f.store.db.prepare('SELECT topic FROM questions').all();
    assert.deepEqual(questions.map(q=>q.topic),['cotizacion-verificada']);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'WAITING_COORDINATOR');
  }finally{f.store.close();}
});

test('bare metres outside an area prompt and linear measurements are not converted to area',()=>{
  for(const [state,text] of [[{slots:{},asked:[]},'Son 52 metros'],[{slots:{},asked:['size']},'Son 52 metros de tubería']]){
    assert.equal(customerDecision('fumigacion',state,{kind:'text',text}).state.slots.area,undefined);
  }
});

test('all explicitly named pests and a finca remain in the same quotation context',()=>{
  const slots=extractSlots('Para zancudos, arañas, moscas y cucarachas. Una finca','fumigacion');
  for(const pest of ['zancudos','arañas','moscas','cucarachas'])assert.ok(slots.service.includes(pest),pest);
  assert.equal(slots.site,'finca');
  assert.equal(extractSlots('Casa finca con 6 habitaciones, un garage y una oficina','fumigacion').site,'casa finca');
  assert.equal(extractSlots('Una nevera en una finca','servicio-tecnico').site,undefined);
});

test('additional area data keeps one pending quotation and no repeated client acknowledgment',async()=>{
  const f=fixture();try{
    await f.process('Hola, cotización para cucarachas en mi apartamento de Medellín, Belén Zafra');
    await f.process('Tiene 2 habitaciones');
    const e=await f.process('Son aprox 40m2');
    assert.equal(f.store.conversation(e.phone).state.slots.area,'40m2');
    assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM questions WHERE topic='cotizacion-verificada'").get().n,1);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(e.id+':reply').n,0);
  }finally{f.store.close();}
});

test('arrival question without punctuation preserves its purpose instead of asking the pest',()=>{
  const d=customerDecision('fumigacion',{slots:{},asked:['service']},{kind:'text',text:'Le pregunto ya son las 4 quedaron de venir hoy a esta hora'});
  assert.equal(d.reviewTopic,'service-followup');
  assert.match(d.reviewQuestion,/estado actual|llegada/i);
  assert.doesNotMatch(d.reply,/plaga|inmueble|cotización/i);
});

test('arrival followup preserves personal safety and payment review priority',()=>{
  for(const [text,expected] of [['A qué hora llega el técnico, tengo dolor e intoxicación','atención personal'],['A qué hora llega el técnico, ya pagué','comprobar el ingreso']]){
    const d=customerDecision('fumigacion',{slots:{},asked:['service']},{kind:'text',text});
    assert.equal(d.reviewTopic,undefined);
    assert.ok(d.review.includes(expected));
  }
});

test('pending quotation is not resent when its destination changes; other cases and topics stay separate',()=>{
  const s=new Store(':memory:','fumigacion',randomBytes(32));try{
    const q={phone:'573001112233',line:'573126944997',caseId:'same-case',topic:'cotizacion-verificada',conditions:{rooms:'2 habitaciones'},recipient:DIEGO,text:'Cotización pendiente',source:'source-one'};
    const first=s.question(q);assert.equal(first.created,true);
    const next=s.question({...q,recipient:SANDRA,conditions:{...q.conditions,area:'40m2'},source:'source-two'});
    assert.equal(next.created,false);assert.equal(next.id,first.id);
    assert.equal(s.question({...q,caseId:'different-case'}).created,true);
    assert.equal(s.question({...q,topic:'other-topic'}).created,true);
  }finally{s.close();}
});

test('written human attention still suppresses arrival and intake turns',async()=>{
  const f=fixture();try{
    const first=await f.process('Hola');f.store.hold(first.phone,'verified-staff');
    const e=await f.process('Le pregunto ya son las 4 quedaron de venir hoy a esta hora');
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OBSERVED_HUMAN');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  }finally{f.store.close();}
});

test('technical service also keeps a single availability question and acknowledgment while pending',async()=>{
  const s=new Store(':memory:','servicio-tecnico',randomBytes(32));
  const c={company:'servicio-tecnico',...BUSINESSES['servicio-tecnico'],enabled:true,chiefOnly:true};
  const engine=new Engine(s,c);let n=0;
  const process=async text=>{const e={id:'STINTAKEFIX'+(++n),phone:'573001112233',line:c.phones[0],at:Date.now()+n,fromMe:false,kind:'text',text};s.enqueue(e);await engine.process(e);return e;};
  try{
    await process('Nevera');await process('No enfría');await process('Medellín');await process('Hoy en la tarde');
    const e=await process('Mañana también puedo');
    assert.equal(s.db.prepare("SELECT COUNT(*) n FROM questions WHERE topic='disponibilidad-y-cotizacion'").get().n,1);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(e.id+':reply').n,0);
  }finally{s.close();}
});
