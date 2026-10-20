// Literal deterministic intake only; no real messages, model or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots,MARIA_PEST_IDENTITY_GUARD} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';

for(const text of ['No es para cucarachas si no que para chinches','No es para cucarachas sino para chinches','No es para cucarachas, es para chinches','No necesito tratar cucarachas sino chinches'])test('a direct contrasted correction preserves only the affirmed pest: '+text,()=>{
 const slots=extractSlots(text,'fumigacion');assert.equal(slots.service,'chinches');assert.doesNotMatch(slots.service,/cucarachas/);
});
test('reported property of another person is not adopted as the current customer property',()=>{
 const text='Soy una conocida de la señora. Fueron a fumigar la casa de ella. Pero no es para cucarachas si no que para chinches.',slots=extractSlots(text,'fumigacion');
 assert.equal(slots.service,'chinches');assert.equal(slots.site,undefined);assert.equal(slots.rooms,undefined);assert.equal(slots.mattresses,undefined);
 assert.equal(MARIA_PEST_IDENTITY_GUARD,'literal-pest-negation-and-contrast-before-generic-description-v2');
});
for(const text of ['No es para cucarachas','No quiero tratar cucarachas','Si no hay cucarachas entonces necesito tratar chinches','Si no hay cucarachas en el apartamento podríamos tratar chinches'])test('a negated or conditional pest cannot become affirmed intake: '+text,()=>{
 assert.equal(extractSlots(text,'fumigacion').service,undefined);
});
for(const text of ['Tengo chinches en mi casa','Chinches en una casa de dos habitaciones','Quiero cotizar chinches en mi apartamento'])test('a direct own property remains literal: '+text,()=>{
 const slots=extractSlots(text,'fumigacion');assert.equal(slots.service,'chinches');assert.match(slots.site,/casa|apartamento/);
});
test('the actual new service does not quote the rejected pest or infer mattresses from rooms',async()=>{
 const now=Date.now(),c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:now-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-pest-'+i}))},s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());const engine=new Engine(s,c);let seq=0;
 const turn=async text=>{const e={id:'PEST_CONTRAST_'+ ++seq,phone:'573009000011',line:c.lines[0].phone,at:now+seq,kind:'text',fromMe:false,forwarded:false,text};s.enqueue(e);await engine.process(e);const row=s.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply');return {e,text:row&&s.open(row.body),state:s.conversation(e.phone).state};};
 try{
  await turn('Hola');const correction=await turn('No es para cucarachas si no que para chinches en mi apartamento en Medellín');assert.equal(correction.state.slots.service,'chinches');assert.equal(correction.state.slots.site,'apartamento');assert.match(correction.text,/colchones/);assert.doesNotMatch(correction.text,/habitaciones|metros cuadrados|129\.000|149\.000/);
  const rooms=await turn('2 habitaciones');assert.equal(rooms.state.slots.service,'chinches');assert.equal(rooms.state.slots.mattresses,undefined);assert.equal(rooms.state.quotedPrice,undefined);assert.doesNotMatch(rooms.text||'',/129\.000|149\.000|Deseas continuar/);
 }finally{s.close();}
});

function sizeBatchFixture(){
 const now=Date.now(),c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:now-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-size-'+i}))},s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());const engine=new Engine(s,c);let seq=0;
 const turn=async(text,patch={})=>{const e={id:'BARE_BATCH_SIZE_'+ ++seq,phone:'573009000011',line:c.lines[0].phone,at:now+seq,kind:'text',fromMe:false,forwarded:false,text,...patch};s.enqueue(e);await engine.process(e);const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,row,text:row&&s.open(row.body),state:s.conversation(e.phone).state};};
 const deliver=r=>{assert.ok(r.row);const mid='MID_'+r.e.id;s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.row.id);s.recordFirstBotReply({...r.row,mid},mid,c.bot,r.e.at);s.delivery(mid,r.e.line,'DELIVERED');s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({verifiedAt:r.e.at,mid,line:r.e.line,state:'DELIVERED'}),'first-delivery:'+r.row.id);};
 return {s,c,turn,deliver};
}
test('a bare number plus municipality answers a delivered size batch with one concrete unit clarification',async()=>{
 const f=sizeBatchFixture();try{
  const first=await f.turn('Cucarachas en apartamento');assert.match(first.text,/habitaciones o metros cuadrados/);assert.deepEqual(first.state.initialIntakeRequestedFields,['size','location']);f.deliver(first);
  const batch=await f.turn('2\nMedellín Manrique');assert.equal(batch.state.slots.location,'medellin');assert.match(batch.state.slots.locationDetails,/Medellín Manrique/);assert.equal(batch.state.slots.rooms,undefined);assert.equal(batch.state.slots.area,undefined);assert.equal(batch.state.slots.mattresses,undefined);assert.match(batch.text,/¿Ese 2 corresponde a habitaciones o a metros cuadrados\?/);assert.match(batch.text,/cantidad con su unidad/);assert.equal(batch.state.quotedPrice,undefined);
  f.deliver(batch);const full=await f.turn('2 habitaciones');assert.equal(full.state.slots.rooms,'2 habitaciones');assert.equal(full.state.intakeSources.rooms.sourceId,full.e.id);assert.equal(full.state.slots.location,'medellin');assert.match(full.text,/\$[\d.]+ COP/);assert.doesNotMatch(full.text,/qué plaga|tipo de inmueble|municipio y barrio/i);
 }finally{f.s.close();}
});
for(const mode of ['undelivered','different-customer','forwarded','quoted','human'])test('bare batch size cannot bypass its delivered own prompt or source/attention scope: '+mode,async()=>{
 const f=sizeBatchFixture();try{
  const first=await f.turn('Cucarachas en apartamento');if(mode!=='undelivered')f.deliver(first);if(mode==='human')await f.turn('Yo atiendo este chat',{fromMe:true});
  const patch=mode==='different-customer'?{phone:'573009000022'}:mode==='forwarded'?{forwarded:true}:mode==='quoted'?{quotedId:'OTHER_SOURCE'}:{};
  const batch=await f.turn('2\nMedellín Manrique',patch);assert.equal(batch.state.slots.rooms,undefined);assert.equal(batch.state.slots.area,undefined);assert.equal(batch.state.slots.mattresses,undefined);assert.equal(batch.state.quotedPrice,undefined);assert.doesNotMatch(batch.text||'',/¿Ese 2 corresponde/);if(mode==='human')assert.equal(f.s.conversation(batch.e.phone).hold,1);
 }finally{f.s.close();}
});
