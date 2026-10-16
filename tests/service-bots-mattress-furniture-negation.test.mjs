import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';

const request='Quiero cotizar otro servicio nuevo para chinches: son dos colchones en un apartamento de Itagüí, barrio Santa María. ';
function fixture(){
 const at=Math.floor((Date.now()-60000)/1000)*1000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:at-1000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'furniture-local-'+i}))},engine=new Engine(s,c);let seq=0;
 const turn=async text=>{const e={id:'MATTRESS_SCOPE_LOCAL_'+ ++seq,phone:'573000007388',line:c.lines[0].phone,at:at+seq*1000,kind:'text',fromMe:false,forwarded:false,text};s.enqueue(e);await engine.process(e);const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,state:s.conversation(e.phone).state,text:row?s.open(row.body):null};};
 return {s,c,turn};
}
const isolated=fn=>async()=>{const f=fixture();try{await fn(f);}finally{f.s.close();}};
for(const text of ['No hay otros muebles afectados.','No tengo otros muebles afectados.','No hay chinches en otros muebles.','No hay chinches en los otros muebles.','Sin otros muebles afectados.','No hay muebles afectados.','Los muebles no tienen chinches.','Las bases de cama no están afectadas.'])test('a direct exclusion is not additional affected furniture: '+text,isolated(async f=>{
 const r=await f.turn(request+text);assert.equal(r.state.slots.affectedFurniture,undefined);assert.equal(r.state.slots.mattresses,'dos colchones');assert.equal(r.state.quotedPrice.priceCop,198000);assert.match(r.text,/198\.000/);assert.equal(r.state.awaitingHumanReview,undefined);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,0);
}));
for(const text of ['Hay otros muebles afectados.','También hay chinches en la base de cama.','No hay otros muebles afectados, pero la base de cama tiene chinches.','No hay otros muebles afectados y el sofá tiene chinches.','No sé si hay otros muebles afectados.','Quizás hay otros muebles afectados.','Si no hay otros muebles afectados, ¿cuánto cuesta?','¿No hay otros muebles afectados?','No hay otros muebles afectados?','Mi vecino dice que no hay otros muebles afectados.','No hay otros muebles sin chinches.','No es cierto que no hay otros muebles afectados.','Cuando no hay otros muebles afectados.','No hay otros muebles que no estén afectados.'])test('positive, uncertain, conditional, interrogative or relayed furniture scope stays guarded: '+text,isolated(async f=>{
 const r=await f.turn(request+text);assert.ok(r.state.slots.affectedFurniture);assert.equal(r.state.quotedPrice,undefined);assert.doesNotMatch(r.text||'',/198\.000/);
}));
test('the exact new-case request keeps prior case evidence and quotes only its two explicitly isolated mattresses',isolated(async f=>{
 const first=await f.turn('Tengo cucarachas en apartamento de una habitación en Itagüí. ¿Cuánto cuesta?'),oldCase=first.state.caseId;
 const r=await f.turn(request+'No hay otros muebles afectados.');assert.notEqual(r.state.caseId,oldCase);assert.equal(r.state.slots.service,'chinches');assert.equal(r.state.slots.rooms,undefined);assert.equal(r.state.quotedPrice.priceCop,198000);assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(first.e.id).body).text,first.e.text);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='OWN_SERVICE_REGISTRATION_SAVED'").get().n,0);
}));
test('six mattresses still require their own volume quotation despite no other furniture',isolated(async f=>{
 const r=await f.turn(request.replace('dos colchones','seis colchones')+'No hay otros muebles afectados.');assert.equal(r.state.slots.affectedFurniture,undefined);assert.equal(r.state.slots.mattresses,'seis colchones');assert.equal(r.state.quotedPrice,undefined);assert.doesNotMatch(r.text||'',/594\.000|198\.000/);
}));
test('a product inquiry with excluded furniture is not a service price or authorization',isolated(async f=>{
 const r=await f.turn('¿Venden producto para chinches para dos colchones? No hay otros muebles afectados.');assert.equal(r.state.quotedPrice,undefined);assert.doesNotMatch(r.text||'',/198\.000/);assert.ok(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n>0);
}));
test('a stated exclusion never erases a later positive base or sofa from extraction',()=>{
 for(const text of ['No hay otros muebles afectados; hay una base de cama con chinches.','No hay otros muebles afectados. El sofá también tiene chinches.'])assert.ok(extractSlots(text,'fumigacion').affectedFurniture);
});
