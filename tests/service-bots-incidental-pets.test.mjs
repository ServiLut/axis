import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {MARIA_UNDERSTANDING_GUARD} from '../automation/service-bots/maria-understanding.mjs';
import {commonQuestionTopics} from '../automation/service-bots/faq.mjs';
import {mariaIncidentalPetMention,MARIA_INCIDENTAL_PETS_GUARD} from '../automation/service-bots/after-service.mjs';

const original='Buenas tardes. Tan amable 6 me informa que cuesta un servicio de fumigación. pero hay mascotas.';
const source=(text,extra={})=>({id:'SYNTHETIC_PETS_SOURCE',phone:'573000001234',line:BUSINESSES.fumigacion.phones[0],at:Date.now(),kind:'text',fromMe:false,forwarded:false,text,...extra});
function fixture(company='fumigacion'){
 const s=new Store(':memory:',company,randomBytes(32));if(company==='fumigacion')s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const c={company,...BUSINESSES[company],enabled:true,chiefOnly:true,lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'ISOLATED_PETS_'+i}))},engine=new Engine(s,c);let sequence=0;
 const process=async(text,{mockAi=false,...extra}={})=>{
  const e=source(text,{id:'SYNTHETIC_PETS_'+ ++sequence,line:c.lines[0].phone,at:Date.now()+sequence,...extra});
  const analysis=mockAi?{guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,company:'FUMIGACION',eventId:e.id,intent:{kind:'general-question',evidence:'que cuesta un servicio de fumigación'},slots:{service:'fumigación',detail:'hay mascotas'}}:{};
  historicalPriceClock.timers.setTime(e.at);s.enqueue(e);await engine.process(e,analysis);const row=s.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply');
  return {e,reply:row?s.open(row.body):null,state:s.conversation(e.phone).state,eventState:s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state};
 };return {s,c,process};
}

test('incidental pet presence retains its exact current source without changing native text',()=>{
 const e=source(original),before=JSON.stringify(e),note=mariaIncidentalPetMention(e);
 assert.equal(note.guard,MARIA_INCIDENTAL_PETS_GUARD);assert.equal(note.sourceId,e.id);assert.equal(note.at,e.at);assert.equal(note.text,'hay mascotas');
 assert.doesNotMatch(note.classificationText,/mascotas/);assert.match(note.classificationText,/que cuesta un servicio/);assert.equal(JSON.stringify(e),before);
 assert.deepEqual(commonQuestionTopics(original),[],'the actual defect was not a FAQ match');
});

test('the verified literal price request continues ordinary intake instead of personal exception review',async t=>{
 for(const mockAi of [false,true])await t.test(mockAi?'literal simulated understanding':'no model',async()=>{
  const f=fixture();try{const r=await f.process(original,{mockAi});
   assert.notEqual(r.eventState,'REVIEW');assert.notEqual(r.eventState,'OBSERVED_REVIEW');assert.match(r.reply,/plaga|prevención/);assert.match(r.reply,/municipio/);
   assert.doesNotMatch(r.reply,/revisaremos tu caso|respuesta clara|segur|inofensiv|sin riesgo|pueden quedar|puedes quedar|no afecta/i);
   assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(f.s.conversation(r.e.phone).hold,0);
   assert.deepEqual(r.state.receptionNotes.incidentalPets,[{guard:MARIA_INCIDENTAL_PETS_GUARD,sourceId:r.e.id,at:r.e.at,text:'hay mascotas'}]);
   assert.equal(r.state.slots.detail,undefined,'pet presence is not a fault');assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(r.e.id).body).text,original);
  }finally{f.s.close();}
 });
});

test('a price question mark does not turn separate pet presence into a safety FAQ',async()=>{
 const f=fixture();try{const r=await f.process('¿Cuánto cuesta fumigar? Tengo dos mascotas.');
  assert.notEqual(r.eventState,'REVIEW');assert.match(r.reply,/plaga|prevención/);assert.equal(r.state.pendingFaqQuestion,undefined);
  assert.equal(r.state.receptionNotes.incidentalPets[0].text,'Tengo dos mascotas');assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.s.close();}
});

test('complete ordinary facts plus incidental pets use only the existing approved price',async()=>{
 const f=fixture();try{const r=await f.process('¿Cuánto cuesta para cucarachas en apartamento de 42 mts2 en Itagüí? Tengo mascotas.');
  assert.match(r.reply,/129\.000/);assert.equal(r.state.quotedPrice.priceCop,129000);assert.equal(r.state.quotedPrice.accepted,undefined);
  assert.equal(r.state.receptionNotes.incidentalPets[0].sourceId,r.e.id);assert.doesNotMatch(r.reply,/segur|inofensiv|quedarse|mascotas.*(?:no|sin)/i);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.s.close();}
});

test('safety, health, products and conditional or quoted statements never qualify as incidental',async t=>{
 const texts=[
  'Tengo mascotas. ¿El producto es seguro?', 'Hay mascotas, ¿las debo sacar?', '¿Hay mascotas?',
  '¿Cuánto cuesta fumigar si tengo mascotas?', 'Si hay mascotas, ¿cuánto cuesta?', 'No hay mascotas.',
  'Mi vecino dijo que hay mascotas.', 'Me dijeron: "hay mascotas".', 'Hay mascotas y un bebé.',
  'Tengo mascotas y niños.', 'Hay mascotas. Mi perro está intoxicado.', 'Hay mascotas y mi perro vomita.',
  'Hay mascotas. ¿Cuándo pueden volver?', 'Tengo mascotas y asma.', 'Hay mascotas. ¿Qué productos usan?',
  'Tengo mascotas. ¿Les hace daño?', 'Hay mascotas. ¿Se pueden quedar?', 'Hay mascotas y es sin riesgo.'
 ];
 for(const text of texts)await t.test(text,()=>assert.equal(mariaIncidentalPetMention(source(text)),null));
});

test('a genuine safety or exposure question stays in review without safety claims or a new quote',async t=>{
 for(const text of ['Tengo mascotas. ¿El producto es seguro?','Hay mascotas, ¿las debo sacar?','Mi mascota está intoxicada después de la fumigación','Tengo mascotas y un bebé. ¿Pueden quedarse?'])await t.test(text,async()=>{
  const f=fixture();try{await f.process('Tengo cucarachas en apartamento de 42 mts2 en Itagüí. ¿Cuánto cuesta?');const r=await f.process(text);
   assert.equal(r.eventState,'REVIEW');assert.doesNotMatch(r.reply||'',/129\.000|seguro|inofensivo|sin riesgo|pueden quedarse/i);
   assert.ok(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n>0);assert.equal(r.state.receptionNotes?.incidentalPets,undefined);
  }finally{f.s.close();}
 });
});

test('a later safety question does not erase the earlier sourced presence note',async()=>{
 const f=fixture();try{const first=await f.process(original);const later=await f.process('¿Es seguro para mis mascotas?');
  assert.equal(later.eventState,'REVIEW');assert.equal(later.state.receptionNotes.incidentalPets.length,1);assert.equal(later.state.receptionNotes.incidentalPets[0].sourceId,first.e.id);
  assert.doesNotMatch(later.reply||'',/seguro|inofensivo|sin riesgo/i);
 }finally{f.s.close();}
});

test('forwarded or unbound sources cannot receive the incidental exception',()=>{
 for(const patch of [{forwarded:true},{fromMe:true},{quotedId:'OLDER_QUOTE'},{kind:'audio'},{id:''},{at:null}])assert.equal(mariaIncidentalPetMention(source(original,patch)),null);
});

test('Miguel retains his existing review behavior without a FUM presence note',async()=>{
 const f=fixture('servicio-tecnico');try{const r=await f.process(original);assert.equal(r.eventState,'REVIEW');assert.equal(r.state.receptionNotes?.incidentalPets,undefined);}finally{f.s.close();}
});

test('a new own case clears the previous pet note and later presence belongs only to its current source',async()=>{
 const f=fixture();try{
  const first=await f.process(original),oldCase=first.state.caseId;assert.equal(first.state.receptionNotes.incidentalPets[0].sourceId,first.e.id);
  const next=await f.process('Quiero un servicio nuevo para cucarachas en una casa de 3 habitaciones en Medellín.');
  assert.notEqual(next.state.caseId,oldCase);assert.equal(next.state.caseId,'fumigacion:'+next.e.id);assert.equal(next.state.receptionNotes?.incidentalPets,undefined);
  const current=await f.process('Tengo mascotas.');assert.equal(current.state.caseId,next.state.caseId);
  assert.deepEqual(current.state.receptionNotes.incidentalPets,[{guard:MARIA_INCIDENTAL_PETS_GUARD,sourceId:current.e.id,at:current.e.at,text:'Tengo mascotas'}]);
  assert.ok(!current.state.receptionNotes.incidentalPets.some(note=>note.sourceId===first.e.id));
 }finally{f.s.close();}
});

test('a separate safety query anywhere in the event prevents incidental exemption despite a price question',async t=>{
 const price='¿Cuánto cuesta para cucarachas en apartamento de 42 mts2 en Itagüí?';
 const variants=[
  price+' Tengo mascotas. ¿Las puedo dejar dentro?',
  price+' Tengo mascotas. Quisiera saber si las dejo dentro.',
  price+' Tengo mascotas. Las puedo dejar dentro',
  price+' Tengo mascotas. Quisiera saber qué debo hacer con ellas.',
  price+' Tengo mascotas. Explícame cómo hacer con ellas.',
  '¿Las puedo dejar dentro? Tengo mascotas. '+price,
  'Tengo mascotas. ¿Las puedo dejar dentro? '+price,
  price+' Tengo mascotas. ¿Y qué hago con ellas?',
  price+' Tengo mascotas. ¿Debo llevarlas a otro lugar?'
  ,'¿Cuánto cuesta para cucarachas en apartamento de 42 mts2 en Itagüí y qué hago con mi perro? Tengo mascotas.'
  ,'Tengo mascotas. ¿Cuánto cuesta y puedo comer durante la fumigación?'
  ,'Tengo mascotas. ¿Cuánto cuesta para cucarachas en apartamento de 42 mts2 en Itagüí y puedo comer durante la fumigación?'
  ,'Tengo mascotas. Cuánto cuesta para cucarachas en apartamento de 42 mts2 en Itagüí y qué hago con mi perro'
 ];
 for(const text of variants)await t.test(text,async()=>{
  assert.equal(mariaIncidentalPetMention(source(text)),null);
  const f=fixture();try{const r=await f.process(text);assert.equal(r.eventState,'REVIEW');assert.equal(r.state.receptionNotes?.incidentalPets,undefined);assert.equal(r.state.quotedPrice,undefined);
   assert.ok(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n>0);assert.doesNotMatch(r.reply||'',/129\.000|seguro|inofensivo|puedes dejarlas/i);
  }finally{f.s.close();}
 });
});

test('a simple presence note keeps a separate identifiable price inquiry in either order',async()=>{
 for(const text of ['¿Cuánto cuesta fumigar? Tengo mascotas.','Tengo mascotas. ¿Cuánto cuesta fumigar?','Hay mascotas.','¿Qué datos necesitan para cotizar? Tengo mascotas.']){
  assert.ok(mariaIncidentalPetMention(source(text)),text);
 }
});
