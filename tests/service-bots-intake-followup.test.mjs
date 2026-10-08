import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision,extractSlots,parseUnderstanding} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,DIEGO} from '../automation/service-bots/config.mjs';

function fixture(){
  const store=new Store(':memory:','fumigacion',randomBytes(32));
  const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,lines:BUSINESSES.fumigacion.phones.map(phone=>({phone}))};
  const engine=new Engine(store,config);let n=0;
  return {store,async process(text){const event={id:'INTAKEFIX'+(++n),phone:'573001112233',line:config.lines[0].phone,at:Date.now()+n,fromMe:false,kind:'text',text};store.enqueue(event);await engine.process(event);return event;}};
}

test('unread standalone links are references, not questions or confirmed intake fields',()=>{
  for(const company of ['fumigacion','servicio-tecnico']){
    const state={slots:{detail:'dato previo'},asked:['service'],introduced:true};
    for(const text of ['https://youtube.com/shorts/u_7xAYoSA1k?si=SQbn317LrxRLkDZB','https://example.com/casa/medellin/cucarachas?producto=duracion']){
      const d=customerDecision(company,state,{kind:'text',text});
      assert.equal(d.reviewTopic,'unread-link');
      assert.deepEqual(d.state.slots,state.slots);
      assert.deepEqual(d.state.asked,state.asked);
      assert.match(d.review,/no ha sido leído/i);
      assert.doesNotMatch(d.review,/hizo una pregunta concreta/i);
      assert.doesNotMatch(d.reply,/pregunta|cotización|confirmado|Sandra|Diego/i);
      assert.equal(d.question,undefined);
    }
  }
});

test('link query punctuation and path words do not replace literal customer data',()=>{
  const state={slots:{},asked:[]};
  const text='Casa con 2 habitaciones en Medellín https://example.com/cucarachas?cuanto=vale';
  const d=customerDecision('fumigacion',state,{kind:'text',text});
  assert.equal(d.reviewTopic,undefined);
  assert.deepEqual(d.state.slots,{site:'casa',rooms:'2 habitaciones',location:'medellin',locationDetails:'Casa con 2 habitaciones en Medellín'});
  assert.match(d.reply,/plaga/i);
  assert.equal(extractSlots('https://example.com/casa/medellin/cucarachas?metros=50','fumigacion').service,undefined);
  assert.deepEqual(parseUnderstanding({slots:{location:'medellin'}},'https://example.com/medellin?ref=one'),{});
  const technical=customerDecision('servicio-tecnico',{slots:{service:'lavadora'},asked:['detail']},{kind:'text',text:'No enciende https://example.com/medellin/lunes?ref=one'});
  assert.equal(technical.state.slots.detail,'No enciende');
  assert.equal(technical.state.slots.location,undefined);
  assert.equal(technical.state.slots.preference,undefined);
});

test('repeated unread links keep one review and cannot release human attention',async()=>{
  for(const company of ['fumigacion','servicio-tecnico']){
    const s=new Store(':memory:',company,randomBytes(32)),c={company,...BUSINESSES[company],enabled:true,chiefOnly:true},engine=new Engine(s,c);
    const e={id:'LINKFIRST01',phone:'573001112233',line:c.phones[0],at:Date.now(),fromMe:false,kind:'text',text:'https://example.com/video?ref=one'};
    try{
      s.enqueue(e);await engine.process(e);
      const second={...e,id:'LINKSECOND2',at:e.at+1};s.enqueue(second);await engine.process(second);
      const q=s.db.prepare('SELECT topic,recipient FROM questions').all();
      assert.deepEqual(q.map(({topic,recipient})=>({topic,recipient})),[{topic:'unread-link',recipient:SANDRA}]);
      assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(second.id+':reply').n,0);
      assert.deepEqual(s.conversation(e.phone).state.slots,{});
      s.hold(e.phone,'verified-staff');
      const held={...e,id:'LINKHUMAN03',at:e.at+2,text:'https://example.com/another?ref=two'};s.enqueue(held);await engine.process(held);
      assert.equal(s.conversation(e.phone).hold,1);
      assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get(held.id).state,'OBSERVED_HUMAN');
      assert.equal(s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
      assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(held.id+':reply').n,0);
    }finally{s.close();}
  }
});

test('a real question outside a link keeps its own review without reading linked content',()=>{
  for(const company of ['fumigacion','servicio-tecnico']){
    const d=customerDecision(company,{slots:{},asked:[]},{kind:'text',text:'¿Me puedes confirmar el servicio? https://example.com/video?ref=one'});
    assert.equal(d.reviewTopic,'customer-question');
    assert.match(d.reply,/pendiente/i);
    assert.equal(d.question,undefined);
  }
});

test('the observed Sopetran and spelled room count remain literal intake data',async()=>{
  const f=fixture();try{
    await f.process('Hola');
    const place=await f.process('Buenas noches. Tengo en mi casa una plaga de ratas. Vivo en una casa, primer piso.\nEn Sopetrán Antioquia');
    const e=await f.process('Tiene dos habitaciones');
    const state=f.store.conversation(e.phone).state;
    assert.equal(state.slots.location,'Sopetrán');
    assert.equal(state.intakeSources.location.sourceId,place.id);
    assert.equal(state.slots.rooms,'dos habitaciones');
    assert.equal(state.intakeSources.rooms.sourceId,e.id);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'WAITING_COORDINATOR');
    assert.deepEqual(f.store.db.prepare('SELECT topic,recipient FROM questions').all().map(({topic,recipient})=>({topic,recipient})),[{topic:'cotizacion-verificada',recipient:SANDRA}]);
  }finally{f.store.close();}
});

test('a superseded literal size answer retains its source without expanding metres',async()=>{
  const f=fixture();try{
    const first=await f.process('Hola, cucarachas en mi casa de Sopetrán');
    const prior={id:'BATCHSIZE01',phone:first.phone,line:first.line,at:first.at+1,fromMe:false,kind:'text',text:'Aproximadamente 100 metros'};
    const current={...prior,id:'BATCHSIZE02',at:prior.at+1,text:'Tiene dos habitaciones'};
    f.store.enqueue(prior);f.store.enqueue(current);
    await new Engine(f.store,{company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true}).process(prior);
    await new Engine(f.store,{company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true}).process(current);
    const state=f.store.conversation(current.phone).state;
    assert.equal(state.slots.area,'100 metros');
    assert.equal(state.intakeSources.area.sourceId,prior.id);
    assert.equal(state.intakeSources.area.unitExpanded,false);
    assert.equal(state.slots.rooms,'dos habitaciones');
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(prior.id).state,'OBSERVED_SUPERSEDED');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(prior.id+':reply').n,0);
  }finally{f.store.close();}
});

test('a pure greeting after intake does not create a missing-field question or repeat intake',async()=>{
  for(const company of ['fumigacion','servicio-tecnico']){
    const s=new Store(':memory:',company,randomBytes(32)),c={company,...BUSINESSES[company],enabled:true,chiefOnly:true},engine=new Engine(s,c);
    const e={id:'GREETFIRST1',phone:'573001112233',line:c.phones[0],at:Date.now(),fromMe:false,kind:'text',text:'Hola'};
    try{
      s.enqueue(e);await engine.process(e);const before=structuredClone(s.conversation(e.phone).state);
      const next={...e,id:'GREETAGAIN2',at:e.at+1,text:'Buenas noches'};s.enqueue(next);await engine.process(next);
      const state=s.conversation(e.phone).state;
      assert.deepEqual(state.asked,before.asked);assert.deepEqual(state.slots,before.slots);
      assert.equal(s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
      const reply=s.open(s.db.prepare('SELECT body FROM outbox WHERE id=?').get(next.id+':reply').body);
      assert.equal(reply,'Buenas noches.');
      assert.equal(s.db.prepare('SELECT case_id FROM outbox WHERE id=?').get(next.id+':reply').case_id,null);
    }finally{s.close();}
  }
});

test('a pure greeting cannot release human attention or consume pending quotation context',async()=>{
  const f=fixture();try{
    const first=await f.process('Hola, cucarachas en casa de Medellín con 2 habitaciones');
    const before=structuredClone(f.store.conversation(first.phone).state);
    await f.process('Buenas noches');
    assert.deepEqual(f.store.conversation(first.phone).state.slots,before.slots);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    f.store.hold(first.phone,'verified-staff');const held=await f.process('Buenas noches');
    assert.equal(f.store.conversation(held.phone).hold,1);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(held.id).state,'OBSERVED_HUMAN');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(held.id+':reply').n,0);
  }finally{f.store.close();}
});

test('written rooms stay scoped and negated counts or linear pipes do not become size',()=>{
  assert.equal(extractSlots('Casa con dos habitaciones','fumigacion').rooms,'dos habitaciones');
  assert.equal(extractSlots('Tiene tres cuartos','fumigacion').rooms,'tres cuartos');
  for(const text of ['No tiene dos habitaciones','No son tres cuartos','Entre dos y tres habitaciones','Dos piezas del motor'])assert.equal(extractSlots(text,'fumigacion').rooms,undefined);
  assert.equal(extractSlots('Tiene dos habitaciones en Sopetrán','servicio-tecnico').rooms,undefined);
  assert.equal(extractSlots('Tiene dos habitaciones en Sopetrán','servicio-tecnico').location,undefined);
  const d=customerDecision('fumigacion',{slots:{},asked:['size'],introduced:true},{kind:'text',text:'100 metros de tubería'});
  assert.equal(d.state.slots.area,undefined);
});

test('mixed greetings still collect facts or review safety and payment',()=>{
  const state={slots:{},asked:['service'],introduced:true};
  for(const text of ['Buenas noches, tengo dolor e intoxicación','Buenas noches, ya pagué']){
    const d=customerDecision('fumigacion',state,{kind:'text',text});assert.ok(d.review);assert.equal(d.greeting,undefined);
  }
  const d=customerDecision('fumigacion',state,{kind:'text',text:'Buenas noches, cucarachas en casa de Medellín con dos habitaciones'});
  assert.equal(d.state.slots.rooms,'dos habitaciones');assert.equal(d.question.topic,'cotizacion-verificada');
});

test('the multiline apartment and room reply asks only the unconfirmed municipality without a staff clarification',async()=>{
  const f=fixture();try{
    await f.process('Hola');
    const e=await f.process('Cucarachas\nApartamentos con 3 piezas grandes\nBarrio las palmas');
    const state=f.store.conversation(e.phone).state;
    assert.equal(state.slots.site,'apartamento');
    assert.equal(state.slots.rooms,'3 piezas');
    assert.equal(state.slots.location,undefined);
    assert.match(state.slots.locationDetails,/Barrio las palmas/);
    assert.equal(state.intakeSources.site.sourceId,e.id);
    assert.equal(state.intakeSources.rooms.sourceId,e.id);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'DONE');
    const reply=f.store.open(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply').body);
    assert.match(reply,/municipio/);assert.doesNotMatch(reply,/barrio|tipo de inmueble|cuántas habitaciones|metros cuadrados|qué plaga/i);
    assert.equal(state.intakeSources.locationDetails.municipalityInferred,false);
    const detail=await f.process('Para todo el Apartamento donde vivo mi apartamento consta con 3 piezas baño sala pequeña y cocina');
    assert.equal(f.store.conversation(detail.phone).state.slots.rooms,'3 piezas');
    assert.equal(f.store.conversation(detail.phone).state.slots.location,undefined);
    const followup=f.store.open(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(detail.id+':reply').body);
    assert.match(followup,/municipio/);assert.doesNotMatch(followup,/barrio|tipo de inmueble|cuántas habitaciones|metros cuadrados|qué plaga/i);
    const questions=f.store.db.prepare('SELECT topic,recipient FROM questions').all();
    assert.deepEqual(questions,[]);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,0);
  }finally{f.store.close();}
});

test('property plurals remain canonical and pieces require an explicit property in the literal text',()=>{
  for(const [literal,expected] of [['apartamentos','apartamento'],['casas','casa'],['restaurantes','restaurante'],['locales','local'],['oficinas','oficina'],['bodegas','bodega'],['fincas','finca']]){
    assert.equal(extractSlots(literal,'fumigacion').site,expected);
  }
  assert.equal(extractSlots('Mi apartamento tiene 3 piezas grandes','fumigacion').rooms,'3 piezas');
  for(const text of ['Tengo 3 piezas grandes','Apartamento con 3 piezas de repuesto','Apartamento con 3 piezas del motor']){
    assert.equal(extractSlots(text,'fumigacion').rooms,undefined);
  }
  const technical=extractSlots('Lavadora en apartamentos con 3 piezas','servicio-tecnico');
  assert.equal(technical.site,undefined);assert.equal(technical.rooms,undefined);
});

test('a literal cafe and Santa Fe de Antioquia reply keeps the pest and asks only the missing size',async()=>{
  const f=fixture();try{
    await f.process('Hola buenas tardes');
    await f.process('Sería para tratar unas ratas');
    const e=await f.process('Es en café de la plaza en santa fe de Antioquia');
    const state=f.store.conversation(e.phone).state;
    assert.equal(state.slots.service,'ratas');
    assert.equal(state.slots.site,'café');
    assert.equal(state.slots.location,'santa fe de Antioquia');
    assert.equal(state.intakeSources.site.sourceId,e.id);
    assert.equal(state.intakeSources.location.sourceId,e.id);
    assert.equal(state.slots.area,undefined);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
    const reply=f.store.open(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply').body);
    assert.match(reply,/habitaciones|metros cuadrados/i);
    assert.doesNotMatch(reply,/tipo de inmueble|municipio|revisaremos/i);
  }finally{f.store.close();}
});

test('literal cafe locations and cafeteria nouns remain scoped to fumigacion',()=>{
  assert.equal(extractSlots('Es en café de la plaza','fumigacion').site,'café');
  assert.equal(extractSlots('En el café de la plaza','fumigacion').site,'café');
  assert.equal(extractSlots('Una cafetería en Santafé de Antioquia','fumigacion').site,'cafetería');
  assert.equal(extractSlots('Una cafetería en Santafé de Antioquia','fumigacion').location,'Santafé de Antioquia');
  const technical=extractSlots('Cafetería en Santa Fe de Antioquia','servicio-tecnico');
  assert.equal(technical.site,undefined);
  assert.equal(technical.location,undefined);
});

test('coffee beverages, colors and a different Santa Fe do not invent property or municipality',()=>{
  for(const text of ['Las ratas son de color café','Es un café con leche','No es en un café','Tomamos café']){
    assert.equal(extractSlots(text,'fumigacion').site,undefined);
  }
  assert.equal(extractSlots('Santa Fe de Bogotá','fumigacion').location,undefined);
});

test('size after a literal cafe creates one quotation question without inventing price or schedule',async()=>{
  const f=fixture();try{
    await f.process('Hola');
    await f.process('Ratas');
    await f.process('Es en café de la plaza en Santa Fe de Antioquia');
    const e=await f.process('Son 52 metros cuadrados');
    const state=f.store.conversation(e.phone).state;
    assert.equal(state.slots.site,'café');
    assert.equal(state.slots.area,'52 metros cuadrados');
    assert.equal(state.slots.preference,undefined);
    const questions=f.store.db.prepare('SELECT topic,recipient FROM questions').all();
    assert.deepEqual(questions.map(({topic,recipient})=>({topic,recipient})),[{topic:'cotizacion-verificada',recipient:SANDRA}]);
    const next=await f.process('Son aproximadamente 52 metros cuadrados');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(next.id+':reply').n,0);
  }finally{f.store.close();}
});

test('literal cafe intake does not resume a case taken by staff',async()=>{
  const f=fixture();try{
    const first=await f.process('Hola');f.store.hold(first.phone,'verified-staff');
    const e=await f.process('Ratas en una cafetería en Santa Fe de Antioquia de 52 metros cuadrados');
    assert.equal(f.store.conversation(e.phone).hold,1);
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OBSERVED_HUMAN');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(e.id+':reply').n,0);
  }finally{f.store.close();}
});

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
  assert.doesNotMatch(d.review,/ya acordado|hora confirmada/i);
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

test('explicit technician phone request without punctuation does not reopen quotation intake',()=>{
  const text='Hola me podrías compartir el número del técnico por que mi mama es toda nerviosa y viejita y quiere preguntarle cosas de la fumigacion ppr favor';
  for(const company of ['fumigacion','servicio-tecnico']){
    const state={slots:{site:'apartamento'},asked:['size']};
    const d=customerDecision(company,state,{kind:'text',text});
    assert.equal(d.reviewTopic,'requested-technician-contact');
    assert.deepEqual(d.state.slots,state.slots);
    assert.deepEqual(d.state.asked,state.asked);
    assert.match(d.reviewQuestion,/autorizado|compartir/i);
    assert.doesNotMatch(d.reply,/metros|plaga|inmueble|cotización|Sandra|Diego|\d{10}/i);
    assert.equal(d.question,undefined);
  }
});

test('repeated technician contact request keeps one chief question and no duplicate customer acknowledgment',async()=>{
  const f=fixture();try{
    await f.process('Me compartes el número del técnico');
    const e=await f.process('Me puedes pasar el teléfono del técnico por favor');
    const q=f.store.db.prepare('SELECT recipient,topic FROM questions').all();
    assert.deepEqual(q.map(({recipient,topic})=>({recipient,topic})),[{recipient:SANDRA,topic:'requested-technician-contact'}]);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(e.id+':reply').n,0);
  }finally{f.store.close();}
});

test('a new technical service request still collects intake and personal-risk contact requests keep human review',()=>{
  const d=customerDecision('fumigacion',{slots:{},asked:[]},{kind:'text',text:'Necesito un técnico para fumigar cucarachas'});
  assert.equal(d.reviewTopic,undefined);assert.match(d.reply,/inmueble/i);
  for(const text of ['Pásame el número del técnico, tengo dolor e intoxicación','Quiero el teléfono del técnico porque ya pagué']){
    const r=customerDecision('fumigacion',{slots:{},asked:[]},{kind:'text',text});
    assert.equal(r.reviewTopic,undefined);assert.ok(r.review);
  }
});

test('technician contact request cannot release existing human attention',async()=>{
  const f=fixture();try{
    const first=await f.process('Hola');f.store.hold(first.phone,'verified-staff');
    const e=await f.process('Me compartes el número del técnico');
    assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OBSERVED_HUMAN');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(e.id+':reply').n,0);
  }finally{f.store.close();}
});

test('a request for the amount to send is payment review, never fresh intake or a received payment',()=>{
  for(const company of ['fumigacion','servicio-tecnico']){
    const state={slots:{site:'casa'},asked:['service']};
    for(const text of ['Cuanto te mando','Cuánto te pago','Cómo te pago','A qué cuenta transfiero']){
      const d=customerDecision(company,state,{kind:'text',text});
      assert.equal(d.reviewTopic,'payment-instructions');
      assert.deepEqual(d.state.asked,state.asked);
      assert.match(d.reviewQuestion,/importe|medio de pago/i);
      assert.doesNotMatch(d.reply,/recibí|pago recibido|inmueble|plaga|Sandra|Diego|\d/i);
      assert.equal(d.question,undefined);
    }
  }
});

test('a reported prior quotation without punctuation does not ask the property again',()=>{
  const d=customerDecision('fumigacion',{slots:{},asked:['service']},{kind:'text',text:'Yo ya cotize para san pedro de los milagros'});
  assert.equal(d.reviewTopic,'existing-quotation');
  assert.match(d.reviewQuestion,/cotización|antecedente/i);
  assert.doesNotMatch(d.reply,/inmueble|plaga|habitaciones|ya confirmada/i);
  assert.equal(d.question,undefined);
});

test('reported pests returning after a prior treatment keep post-service review without promising a warranty',()=>{
  const d=customerDecision('fumigacion',{slots:{},asked:['service']},{kind:'text',text:'Hola es q en el mes de mayo me hicieron una fumigación a mi casa de chinches de cama y en mi habitación otra vez están apareciendo'});
  assert.equal(d.reviewTopic,'service-followup');
  assert.equal(d.reviewConditions.kind,'post-service');
  assert.doesNotMatch(d.reply,/habitaciones|metros cuadrados|garantía|gratis|precio|hora confirmada/i);
  assert.match(d.reviewQuestion,/antecedente|revisita/i);
});

test('a direct scheduling question without punctuation is reviewed before asking intake again',()=>{
  const d=customerDecision('fumigacion',{slots:{},asked:['service']},{kind:'text',text:'A que horas me puedes colaborar mañana'});
  assert.equal(d.reviewTopic,'customer-question');
  assert.doesNotMatch(d.reply,/plaga|inmueble|habitaciones/i);
});

test('new payment and prior-quotation turns each retain one question and no repeated acknowledgment',async()=>{
  for(const [first,next,topic]of [['Cuanto te mando','Cuánto debo enviarte','payment-instructions'],['Yo ya cotize para san pedro de los milagros','Ya me cotizaron este servicio','existing-quotation']]){
    const f=fixture();try{
      await f.process(first);const e=await f.process(next);
      assert.deepEqual(f.store.db.prepare('SELECT topic,recipient FROM questions').all().map(({topic,recipient})=>({topic,recipient})),[{topic,recipient:SANDRA}]);
      assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(e.id+':reply').n,0);
    }finally{f.store.close();}
  }
});

test('payment requests cannot override reported-payment or personal-safety review',()=>{
  for(const [text,expected]of [['Cuanto te mando, ya pagué','comprobar el ingreso'],['Cuánto debo enviarte, tengo dolor e intoxicación','atención personal']]){
    const d=customerDecision('fumigacion',{slots:{},asked:[]},{kind:'text',text});
    assert.equal(d.reviewTopic,undefined);assert.ok(d.review.includes(expected));
  }
});

test('previous-service review does not convert a new quotation or equipment part into a prior service',()=>{
  for(const text of ['Quiero cotizar una fumigación para chinches en una casa','Me hicieron un presupuesto para fumigar mi casa','Cuanto te mando de fotos del equipo']){
    const d=customerDecision('fumigacion',{slots:{},asked:[]},{kind:'text',text});
    assert.notEqual(d.reviewTopic,'existing-quotation');
    assert.notEqual(d.reviewTopic,'service-followup');
    assert.notEqual(d.reviewTopic,'payment-instructions');
  }
});

test('existing human attention prevents payment and prior-quotation replies and questions',async()=>{
  const f=fixture();try{
    const first=await f.process('Hola');f.store.hold(first.phone,'verified-staff');
    for(const text of ['Cuanto te mando','Yo ya cotize para san pedro de los milagros']){
      const e=await f.process(text);
      assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OBSERVED_HUMAN');
      assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(e.id+':reply').n,0);
    }
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  }finally{f.store.close();}
});
