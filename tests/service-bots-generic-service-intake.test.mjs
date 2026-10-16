import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';

// Synthetic original events and in-memory persistence only. No model, network,
// customer message, operational dispatch, or business registration is exercised.
function fixture(){
 const at=Math.floor((Date.now()-60000)/1000)*1000,s=new Store(':memory:','fumigacion',randomBytes(32));
 s.importKnowledge(approvedBusinessPriceSchedule());
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:at-1000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'generic-local-'+i}))};
 const engine=new Engine(s,c),phone='573000007384';let seq=0;
 const turn=async(text,service=null,extra={})=>{
  const e={id:'GENERIC_INTAKE_SOURCE_'+ ++seq,phone,line:c.lines[0].phone,at:at+seq*1000,kind:'text',fromMe:false,forwarded:false,text,...extra};s.enqueue(e);
  const a=service?{guard:CONVERSATIONAL_AI_GUARD,company:'FUMIGACION',eventId:e.id,slots:{service}}:{};
  await engine.process(e,a);const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
  return {e,state:s.conversation(phone).state,text:row?s.open(row.body):null};
 };
 const noInternal=()=>{assert.equal(s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,0);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,0);};
 return {s,c,phone,turn,noInternal};
}
const isolated=fn=>async()=>{const f=fixture();try{await fn(f);}finally{f.s.close();}};

for(const [text,service] of [
 ['Hola, ¿cuánto cuesta fumigar un apartamento?','fumigar'],
 ['Hola, ¿cuánto cuesta la fumigación de un apartamento?','fumigación'],
 ['Hola, ¿cuánto cuesta el control de plagas en un apartamento?','control de plagas'],
 ['Hola, ¿cuánto cuesta el tratamiento de plagas en un apartamento?','tratamiento de plagas']
])test('a literal generic procedure is not the missing pest: '+service,isolated(async f=>{
 const first=await f.turn(text,service);
 assert.match(first.text,/plaga|prevención/i);assert.match(first.text,/habitaciones|metros cuadrados/);assert.match(first.text,/municipio/);assert.doesNotMatch(first.text,/qué tipo de inmueble/i);
 assert.equal(first.state.slots.site,'apartamento');assert.ok(first.state.asked.includes('service'));f.noInternal();
}));

test('the actual three-turn sequence asks only pest and neighborhood while preserving every known source',isolated(async f=>{
 const first=await f.turn('Hola, ¿cuánto cuesta fumigar un apartamento?','fumigar');
 const rooms=await f.turn('Tiene dos habitaciones.');
 const city=await f.turn('En Itagüí.');
 assert.match(city.text,/\n1\. .*plaga|\n1\. .*prevención/i);assert.match(city.text,/\n2\. .*barrio.*vereda/i);
 assert.doesNotMatch(city.text,/municipio|habitaciones|metros cuadrados|tipo de inmueble|precio confirmado|pendiente de confirmación/i);
 assert.equal(city.state.slots.site,'apartamento');assert.equal(city.state.slots.rooms,'dos habitaciones');assert.equal(city.state.slots.location,'itagui');
 assert.equal(city.state.intakeSources.site.sourceId,first.e.id);assert.equal(city.state.intakeSources.rooms.sourceId,rooms.e.id);assert.equal(city.state.intakeSources.location.sourceId,city.e.id);
 assert.equal(city.state.intakeSources.service.sourceId,first.e.id);assert.equal(city.state.quotedPrice,undefined);assert.equal(city.state.awaitingHumanReview,undefined);
 assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(first.e.id).body).text,first.e.text);f.noInternal();
 const neighborhood=await f.turn('Barrio Santa María.');assert.match(neighborhood.text,/plaga|preventivo/i);assert.doesNotMatch(neighborhood.text,/barrio|municipio|habitaciones|tipo de inmueble/i);f.noInternal();
 const pest=await f.turn('Cucarachas');assert.equal(pest.state.slots.service,'cucarachas');assert.equal(pest.state.intakeSources.service.sourceId,pest.e.id);assert.equal(pest.state.quotedPrice.priceCop,129000);assert.match(pest.text,/129\.000/);f.noInternal();
}));

for(const location of ['En Itagüí, barrio Santa María.','Itagüí, Santa María.'])test('a provided neighborhood is not requested again: '+location,isolated(async f=>{
 await f.turn('Hola, ¿cuánto cuesta fumigar un apartamento?','fumigar');await f.turn('Tiene dos habitaciones.');
 const r=await f.turn(location);assert.match(r.text,/plaga|preventivo/i);assert.doesNotMatch(r.text,/barrio|municipio|habitaciones|tipo de inmueble/i);f.noInternal();
}));

test('generic semantic procedure cannot replace an explicitly named pest or trigger another quote',isolated(async f=>{
 const r=await f.turn('Hola, ¿cuánto cuesta fumigar cucarachas en un apartamento de dos habitaciones en Itagüí?','fumigar');
 assert.equal(r.state.slots.service,'cucarachas');assert.equal(r.state.quotedPrice.priceCop,129000);assert.match(r.text,/129\.000/);assert.doesNotMatch(r.text,/qué plaga/i);f.noInternal();
}));

test('generic clarification does not override a human intervention',isolated(async f=>{
 await f.turn('Hola, ¿cuánto cuesta fumigar un apartamento?','fumigar');await f.turn('Buenas tardes, te atiende una asesora.',null,{fromMe:true});
 const r=await f.turn('Tiene dos habitaciones en Itagüí.');assert.equal(r.text,null);assert.equal(f.s.conversation(f.phone).hold,1);f.noInternal();
}));

test('missing pest clarification does not absorb a separate special-property review',isolated(async f=>{
 const r=await f.turn('Necesito cotización para todo el edificio de 10 apartamentos en Itagüí.');
 assert.equal(r.state.awaitingHumanReview,true);assert.equal(r.state.quotedPrice,undefined);
 const topics=f.s.db.prepare('SELECT topic FROM questions').all().map(row=>row.topic);assert.deepEqual(topics,['special-quotation']);
}));
