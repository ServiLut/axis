import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';

const initial='Quiero cotizar otro servicio nuevo para chinches: son dos colchones en un apartamento de Itagüí, barrio Santa María. No hay otros muebles afectados.';
const uncertainCount='Todavía no sé si será uno o dos colchones.';
function fixture(){
 const at=Math.floor((Date.now()-60000)/1000)*1000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:at-1000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'scope-memory-local-'+i}))},engine=new Engine(s,c);let seq=0;
 const turn=async(text,extra={})=>{const e={id:'MATTRESS_MEMORY_LOCAL_'+ ++seq,phone:'573000007389',line:c.lines[0].phone,at:at+seq*1000,kind:'text',fromMe:false,forwarded:false,text,...extra};historicalPriceClock.timers.setTime(e.at);s.enqueue(e);await engine.process(e);const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,state:s.conversation(e.phone).state,text:row?s.open(row.body):null};};
 return {s,c,turn};
}
const isolated=fn=>async()=>{const f=fixture();try{await fn(f);}finally{f.s.close();}};
test('exact quantity doubt asks only mattress count after the same-case native exclusion',isolated(async f=>{
 const first=await f.turn(initial);assert.equal(first.state.quotedPrice.priceCop,198000);
 const r=await f.turn(uncertainCount);assert.match(r.text,/cuántos colchones/i);assert.doesNotMatch(r.text,/bases? de cama|otros muebles|198\.000/);assert.equal(r.state.slots.mattresses,undefined);assert.equal(r.state.quotedPrice,undefined);
 const memory=r.state.mattressFurnitureExclusion;assert.equal(memory.sourceId,first.e.id);assert.equal(memory.caseId,r.state.caseId);assert.equal(memory.line,first.e.line);assert.equal(memory.active,true);assert.equal(memory.checkedSourceId,r.e.id);assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(first.e.id).body).text,initial);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,0);
}));
test('a new case does not inherit the old exclusion',isolated(async f=>{
 const first=await f.turn(initial),r=await f.turn('Necesito otro servicio nuevo para chinches en un apartamento de Medellín.');assert.notEqual(r.state.caseId,first.state.caseId);assert.match(r.text,/bases? de cama|otros muebles/i);assert.equal(r.state.mattressFurnitureExclusion,undefined);assert.equal(r.state.quotedPrice,undefined);
}));
for(const text of ['La base de cama también tiene chinches.','El sofá también está afectado.','No sé si hay chinches en otros muebles.','¿También tratarían las bases de cama?'])test('later positive or uncertain furniture scope invalidates presentation exclusion: '+text,isolated(async f=>{
 await f.turn(initial);const changed=await f.turn(text);assert.equal(changed.state.mattressFurnitureExclusion.active,false);assert.ok(changed.state.mattressFurnitureExclusion.invalidatedBy);
 // Historical quotations can remain as evidence; this current doubt must not
 // issue a new price or acquire authority from the presentation-only memory.
 assert.notEqual(changed.state.quotedPrice?.sourceId,changed.e.id);assert.doesNotMatch(changed.text||'',/198\.000/);
}));
for(const extra of [{forwarded:true},{quotedId:'A_DIFFERENT_SOURCE'}])test('forwarded or quoted exclusion cannot create memory: '+JSON.stringify(extra),isolated(async f=>{
 const first=await f.turn(initial,extra),r=await f.turn(uncertainCount);assert.equal(first.state.mattressFurnitureExclusion,undefined);assert.equal(r.state.mattressFurnitureExclusion,undefined);assert.equal(r.state.quotedPrice,undefined);
 // Forwarded intake may remain under its original review rather than emit an
 // ordinary question. If a count is requested, its unverified scope stays in it.
 if(/cuántos colchones/i.test(r.text||''))assert.match(r.text,/bases? de cama|otros muebles/i);
}));
test('reported third-party exclusion does not become own presentation memory',isolated(async f=>{
 const r=await f.turn(initial.replace('No hay otros muebles afectados.','Mi vecino dice que no hay otros muebles afectados.'));assert.equal(r.state.mattressFurnitureExclusion,undefined);assert.ok(r.state.slots.affectedFurniture);assert.equal(r.state.quotedPrice,undefined);
}));
test('another source line cannot use the original line exclusion',isolated(async f=>{
 await f.turn(initial);const r=await f.turn(uncertainCount,{line:f.c.lines[1].phone});assert.match(r.text||'',/bases? de cama|otros muebles/i);assert.equal(r.state.quotedPrice,undefined);
}));
test('changed original source invalidates the memo before its next presentation',isolated(async f=>{
 const first=await f.turn(initial);f.s.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.s.seal({...first.e,text:initial.replace('No hay otros muebles afectados.','Hay otros muebles afectados.')}),first.e.id);
 const r=await f.turn(uncertainCount);assert.match(r.text||'',/bases? de cama|otros muebles/i);assert.equal(r.state.mattressFurnitureExclusion.active,false);assert.equal(r.state.quotedPrice,undefined);
}));
for(const extra of [{quotedId:'ANOTHER_SOURCE'},{forwarded:true}])test('a current quoted or forwarded quantity doubt cannot consume a prior exclusion: '+JSON.stringify(extra),isolated(async f=>{
 const first=await f.turn(initial),before=structuredClone(first.state.mattressFurnitureExclusion),r=await f.turn(uncertainCount,extra);
 assert.deepEqual(r.state.mattressFurnitureExclusion,before);assert.equal(r.state.mattressFurnitureExclusion.checkedSourceId,first.e.id);assert.notEqual(r.state.quotedPrice?.sourceId,r.e.id);assert.doesNotMatch(r.text||'',/198\.000/);
 // The existing forwarded-source review can remain silent; a quoted ordinary
 // count prompt must keep its unverified scope question instead of using memory.
 if(!extra.forwarded)assert.match(r.text||'',/bases? de cama|otros muebles/i);
}));
