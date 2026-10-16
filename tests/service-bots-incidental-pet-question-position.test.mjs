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
import {registrationStatus} from '../automation/service-bots/maria-program.mjs';
import {mariaIncidentalPetMention,MARIA_INCIDENTAL_PETS_GUARD} from '../automation/service-bots/after-service.mjs';

const source=text=>({id:'ISOLATED_PET_QUESTION_POSITION',phone:'573000006732',line:BUSINESSES.fumigacion.phones[0],at:Date.now(),kind:'text',fromMe:false,forwarded:false,text});
const ordinaryVariants=[
 'Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta? Tengo dos mascotas.',
 'Cucarachas en apartamento de 60 m² en Medellín, cuánto cuesta? Tengo dos mascotas.',
 'Tengo cucarachas en un apartamento de 60 m² en Medellín: ¿qué precio tiene? Hay mascotas.',
 'Hay dos mascotas. Cucarachas en apartamento de 60 m² en Medellín, ¿cuál es el valor?',
 'Cucarachas en apartamento de 60 m² en Medellín, ¿me pueden cotizar? Tenemos mascotas.',
 'Apartamento en Medellín para cucarachas, ¿qué datos necesitan para cotizar? Tengo mascotas.'
];

for(const text of ordinaryVariants)test('a commercial inquiry after literal facts keeps the incidental pet source: '+text,()=>{
 const e=source(text),nativeBefore=JSON.stringify(e),note=mariaIncidentalPetMention(e);
 assert.equal(note?.guard,MARIA_INCIDENTAL_PETS_GUARD);
 assert.equal(note.sourceId,e.id);assert.equal(note.at,e.at);
 assert.match(note.text,/^(?:Tengo dos|Hay dos|Hay|Tenemos|Tengo) mascotas$/);
 assert.doesNotMatch(note.classificationText,/mascotas/);
 assert.equal(JSON.stringify(e),nativeBefore,'classification must preserve the original native event');
});

const reviewVariants=[
 'Tengo mascotas. ¿Qué hago con ellas, cuánto cuesta fumigar?',
 'Tengo mascotas. ¿Cómo las manejo, cuánto cuesta fumigar?',
 'Tengo mascotas. Quisiera saber qué hacer con ellas, ¿cuánto cuesta fumigar?',
 'Tengo mascotas. Dime qué hago con mi perro, ¿cuánto cuesta fumigar?',
 'Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta y qué hago con ellas? Tengo mascotas.',
 'Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta? Tengo mascotas. ¿Qué producto usan?',
 'Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta? Tengo mascotas. ¿Es seguro?',
 'Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta? Tengo mascotas. ¿Pueden quedarse?',
 'Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta? Tengo mascotas. ¿Dónde las dejo?',
 'Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta? Tengo mascotas. Quiero saber cuándo volver.',
 'Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta? Tengo mascotas y mi perro vomita.'
];
for(const text of reviewVariants)test('an additional request or actual safety issue still needs review: '+text,()=>{
 assert.equal(mariaIncidentalPetMention(source(text)),null);
});

test('the complete ordinary request quotes the approved price and keeps pets as a sourced note without accepting or creating a service',async()=>{
 const store=new Store(':memory:','fumigacion',randomBytes(32));
 try{
  store.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
  const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'ISOLATED_PET_POSITION_'+i}))};
  const engine=new Engine(store,config),e=source(ordinaryVariants[0]);historicalPriceClock.timers.setTime(e.at);store.enqueue(e);await engine.process(e);
  const row=store.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply'),reply=row?store.open(row.body):null,state=store.conversation(e.phone).state;
  assert.notEqual(store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'REVIEW');
  assert.match(reply,/149\.000/);assert.equal(state.quotedPrice.priceCop,149000);assert.notEqual(state.quotedPrice.accepted,true);
  assert.deepEqual(state.receptionNotes.incidentalPets,[{guard:MARIA_INCIDENTAL_PETS_GUARD,sourceId:e.id,at:e.at,text:'Tengo dos mascotas'}]);
  assert.equal(state.programIntake,undefined);assert.equal(registrationStatus(config,store).saved,0);assert.equal(registrationStatus(config,store).prepared,0);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  assert.doesNotMatch(reply,/segur|sin riesgo|inofensiv|pueden quedarse|no afecta/i);
  assert.equal(store.open(store.db.prepare('SELECT body FROM events WHERE id=?').get(e.id).body).text,e.text);
 }finally{store.close();}
});
