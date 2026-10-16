import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots,customerDecision} from '../automation/service-bots/engine.mjs';
import {drain} from '../automation/service-bots/transport.mjs';
import {BUSINESSES,OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,selectBusinessPrice,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';

// Desidentified regressions from two prospectively observed own READ outputs.
// Memory-only store, fake transport and synthetic identities: no network/model.
const phone='573000000001',line=BUSINESSES.fumigacion.phones[0];
function fixture(){
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING,historyCheckRequired:true,activatedAt:Date.now()-10000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-'+i}))};
 const s=new Store(':memory:','fumigacion',randomBytes(32)),engine=new Engine(s,c);let sequence=0;
 s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const transport={config:c,verifyLine:async()=>{},priorHistory:async()=>({cutoff:c.activatedAt,priorOutgoing:false}),currentAttention:async()=>({complete:true,sources:[]}),understand:async()=>({}),send:async()=> 'SYNTHETIC'+(++sequence)};
 const process=async(id,text,extra={})=>{const event={id,text,phone,line:c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',...extra};s.enqueue(event);await drain(s,c,transport,engine);return event;};
 const reply=id=>{const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id+':reply');return row&&{...row,text:s.open(row.body)};};
 return {c,s,process,reply};
}
const scopedState=()=>({caseId:'fumigacion:VALIDITY0001',slots:{},asked:['service','location'],introduced:true});
const source=(id,text,at=Date.now())=>({id,text,phone,line,at,kind:'text',fromMe:false});

test('native quotation validity and delivered elliptical continuation preserve purpose without reopening pest intake',async()=>{
 const f=fixture();try{
  await f.process('VALIDITYHELLO01','Hola buenos días');
  await f.process('VALIDITYQUERY01','Para saber si aún está vigente la cotización que se había enviado');
  assert.match(f.reply('VALIDITYQUERY01').text,/cotización sigue vigente/);
  assert.match(f.reply('VALIDITYQUERY01').text,/número de la cotización o una captura/);
  assert.doesNotMatch(f.reply('VALIDITYQUERY01').text,/plaga|\$|vigente\.$|reservad|programad/);
  f.s.delivery(f.reply('VALIDITYQUERY01').mid,f.c.lines[0].phone,'DELIVERED');
  await f.process('VALIDITYQUERY02','Era para mirar si aún sigue vigente o ya no',{at:Date.now()+1000});
  assert.match(f.reply('VALIDITYQUERY02').text,/cotización sigue vigente/);
  assert.doesNotMatch(f.reply('VALIDITYQUERY02').text,/plaga|\$|vigente\.$|reservad|programad/);
  const state=f.s.conversation(phone).state;
  assert.equal(state.requestedQuotationValidity.sourceId,'VALIDITYQUERY01');
  assert.equal(state.requestedQuotationValidity.lastSourceId,'VALIDITYQUERY02');
  assert.equal(state.quotedPrice,undefined);
  assert.equal(state.programIntake,undefined);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  f.s.delivery(f.reply('VALIDITYQUERY02').mid,f.c.lines[0].phone,'DELIVERED');
  await f.process('VALIDITYQUERY03','Sí',{at:Date.now()+2000});
  assert.match(f.reply('VALIDITYQUERY03').text,/cotización sigue vigente/);
  assert.equal(f.s.conversation(phone).state.quotedPrice,undefined);
  assert.equal(f.s.conversation(phone).state.programIntake,undefined);
 }finally{f.s.close();}
});

test('a supplied quotation reference requests verification without turning it into a new quote or acceptance',async()=>{
 const f=fixture();try{
  await f.process('VALIDITYREF001','¿Sigue vigente la cotización?');
  await f.process('VALIDITYREF002','Cotización ABC-1234',{at:Date.now()+1000});
  assert.match(f.reply('VALIDITYREF002').text,/referencia de la cotización|vigencia/);
  assert.doesNotMatch(f.reply('VALIDITYREF002').text,/plaga|\$|ya está|vigente\.$|reservad|programad/);
  assert.equal(f.s.conversation(phone).state.quotedPrice,undefined);
  assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM questions WHERE topic='existing-quotation'").get().n,1);
 }finally{f.s.close();}
});

test('same-second distinct native continuation follows retained Engine order without replaying a duplicate',async()=>{
 const f=fixture();try{
  const at=Math.floor(Date.now()/1000)*1000;
  await f.process('VALIDITYSEC001','¿Sigue vigente la cotización?',{at});
  f.s.delivery(f.reply('VALIDITYSEC001').mid,f.c.lines[0].phone,'DELIVERED');
  await f.process('VALIDITYSEC002','Si aún sigue vigente',{at});
  assert.match(f.reply('VALIDITYSEC002').text,/cotización sigue vigente/);
  assert.doesNotMatch(f.reply('VALIDITYSEC002').text,/plaga|\$/);
  const outputs=f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
  await f.process('VALIDITYSEC002','Si aún sigue vigente',{at});
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,outputs);
  assert.equal(f.s.conversation(phone).state.requestedQuotationValidity.lastSourceId,'VALIDITYSEC002');
  assert.equal(f.s.conversation(phone).state.quotedPrice,undefined);
 }finally{f.s.close();}
});

test('an exact delivered own quote is referenced as historical amount without certifying validity or accepting it',async()=>{
 const f=fixture();try{
  await f.process('VALIDITYOWN001','Chinches en un colchón en una casa de Medellín');
  const own=f.reply('VALIDITYOWN001');assert.match(own.text,/99\.000/);
  f.s.delivery(own.mid,f.c.lines[0].phone,'DELIVERED');
  await f.process('VALIDITYOWN002','¿La cotización sigue vigente?',{at:Date.now()+1000});
  assert.match(f.reply('VALIDITYOWN002').text,/cotización que te envié.*99\.000/);
  assert.match(f.reply('VALIDITYOWN002').text,/vigencia.*necesita confirmación/);
  assert.doesNotMatch(f.reply('VALIDITYOWN002').text,/número de la cotización|confirmada|reservad|programad/);
  assert.notEqual(f.s.conversation(phone).state.quotedPrice.accepted,true);
  assert.equal(f.s.conversation(phone).state.programIntake,undefined);
 }finally{f.s.close();}
});

test('elliptical validity needs the same native case, line, contact and immediately retained source',()=>{
 const first=source('VALIDITYBOUND01','¿Sigue vigente mi cotización?'),x=customerDecision('fumigacion',scopedState(),first);
 const remembered={...x.state,lastHandledSourceId:first.id};
 const next=source('VALIDITYBOUND02','si aún sigue vigente',first.at+1000);
 assert.equal(customerDecision('fumigacion',remembered,next).quotationValidity,true);
 for(const alter of [s=>s.caseId='fumigacion:ANOTHERCASE01',s=>s.lastHandledSourceId='OTHERANCHOR01',s=>s.requestedQuotationValidity={...s.requestedQuotationValidity,phone:'573000000002'},s=>s.requestedQuotationValidity={...s.requestedQuotationValidity,line:'573000000003'}]){
  const changed=structuredClone(remembered);alter(changed);assert.notEqual(customerDecision('fumigacion',changed,next).quotationValidity,true);
 }
 assert.notEqual(customerDecision('fumigacion',remembered,{...next,forwarded:true}).quotationValidity,true);
 assert.notEqual(customerDecision('fumigacion',remembered,{...next,at:first.at+86400001}).quotationValidity,true);
 assert.notEqual(customerDecision('servicio-tecnico',remembered,next).quotationValidity,true);
});

test('new quote, safety priority and a human hold retain their existing routes',async()=>{
 const ordinary=customerDecision('fumigacion',scopedState(),source('VALIDITYNEW001','No tengo una cotización vigente, necesito una nueva cotización'));
 assert.notEqual(ordinary.quotationValidity,true);
 assert.notEqual(customerDecision('fumigacion',scopedState(),source('VALIDITYNEW002','Necesito una nueva cotización vigente para una casa')).quotationValidity,true);
 assert.notEqual(customerDecision('fumigacion',scopedState(),source('VALIDITYSAFE01','¿Sigue vigente la cotización? Tengo un bebé')).quotationValidity,true);
 const f=fixture();try{
  await f.process('VALIDITYHUM001','Asesora atendiendo',{fromMe:true});
  await f.process('VALIDITYHUM002','¿Sigue vigente la cotización?');
  assert.equal(f.reply('VALIDITYHUM002'),undefined);
  assert.equal(f.s.conversation(phone).hold,1);
 }finally{f.s.close();}
});

test('base cama variants and unresolved scope cannot receive the one-mattress price',()=>{
 for(const text of ['Un colchón y creo que la base cama también','Un colchón y dos bases cama','Un colchón y la base de cama','Un colchón y las bases de la cama','Un colchón y la basecama','Un colchón y dos basecamas','Un colchón y las bases de camas','¿Cuánto cuesta un colchón y la base cama?','No sé si hay chinches en la base cama, tengo un colchón','¿Cuánto cuesta un colchón si no hay chinches en la base cama?','No solo la base cama, también un colchón']){
  const slots=extractSlots(text,'fumigacion');assert.ok(slots.affectedFurniture,text);
  assert.equal(selectBusinessPrice({service:'chinches',site:'casa',location:'medellin',...slots},{scheduleHash:LEGACY_BUSINESS_PRICE_HASH}).entry,undefined,text);
 }
 assert.equal(extractSlots('Un colchón y base de datos','fumigacion').affectedFurniture,undefined);
 assert.equal(extractSlots('Un colchón y base cama','servicio-tecnico').affectedFurniture,undefined);
});

test('explicitly excluded furniture does not become extra affected furniture',()=>{
 for(const text of ['Un colchón, no la base cama','Un colchón sin base cama','Un colchón sin basecama','Un colchón; no hay chinches en las basecamas','Un colchón; no hay chinches en la base cama','Un colchón; la base cama no tiene chinches','Un colchón; no quiero tratar la base cama']){
  const slots=extractSlots(text,'fumigacion');assert.equal(slots.affectedFurniture,undefined,text);
  assert.equal(selectBusinessPrice({service:'chinches',site:'casa',location:'medellin',...slots},{scheduleHash:LEGACY_BUSINESS_PRICE_HASH}).entry?.priceCop,99000,text);
 }
});

test('real-shaped base-cama flow retains the furniture and later literal room-scope doubt through awaiting review',async()=>{
 const f=fixture();try{
  for(const [id,text] of [['FURNITUREHEL01','Buenas noches'],['FURNITUREDAT01','Chinches en Envigado'],['FURNITUREDAT02','En una casa'],['FURNITUREDAT03','En la habitación'],['FURNITUREDAT04','Un colchón y creo que la base cama también']])await f.process(id,text);
  assert.ok(f.s.conversation(phone).state.slots.affectedFurniture);
  assert.doesNotMatch(f.reply('FURNITUREDAT04').text,/99\.000|\$/);
  assert.equal(f.s.conversation(phone).state.quotedPrice,undefined);
  assert.equal(f.s.conversation(phone).state.awaitingHumanReview,true);
  const questions=f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n;
  await f.process('FURNITURESCP01','¿Pero hacen el tratamiento solo al colchón o a toda la habitación?');
  assert.match(f.reply('FURNITURESCP01').text,/solo el colchón o también la habitación/);
  assert.match(f.reply('FURNITURESCP01').text,/alcance aún debe confirmarse/);
  assert.doesNotMatch(f.reply('FURNITURESCP01').text,/Recibí tu pregunta|99\.000|incluye|cubre toda|registrad|programad/);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,questions);
  assert.equal(f.s.conversation(phone).state.programIntake,undefined);
  assert.equal(f.s.conversation(phone).hold,0);
 }finally{f.s.close();}
});

test('a direct price question including a base cannot quote the mattress alone',async()=>{
 const f=fixture();try{
  await f.process('FURNITUREPRI01','Tengo chinches en un colchón y la base cama de una casa en Medellín, ¿cuánto cuesta?');
  assert.ok(f.s.conversation(phone).state.slots.affectedFurniture);
  assert.doesNotMatch(f.reply('FURNITUREPRI01').text,/99\.000|\$/);
  assert.equal(f.s.conversation(phone).state.quotedPrice,undefined);
 }finally{f.s.close();}
});

test('mattress-versus-room scope is concrete REVIEW without price, inclusion or acceptance',async()=>{
 const f=fixture();try{
  await f.process('FURNITUREOWN01','Chinches en un colchón en una casa de Medellín');
  f.s.delivery(f.reply('FURNITUREOWN01').mid,f.c.lines[0].phone,'DELIVERED');
  await f.process('FURNITUREOWN02','¿Ese servicio cubre solo el colchón o también la habitación?');
  assert.match(f.reply('FURNITUREOWN02').text,/solo el colchón o también la habitación/);
  assert.match(f.reply('FURNITUREOWN02').text,/aún debe confirmarse/);
  assert.notEqual(f.s.conversation(phone).state.quotedPrice.accepted,true);
  assert.equal(f.s.conversation(phone).state.programIntake,undefined);
 }finally{f.s.close();}
});
