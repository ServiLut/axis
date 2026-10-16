// Isolated presentation of native synthetic sources only. No network, models,
// delivery, authority changes or business writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {ownMariaChiefQuestionText} from '../automation/service-bots/chief-question-wording.mjs';
import {MARIA_TERMITE_FURNITURE_SCOPE_GUARD} from '../automation/service-bots/maria-furniture-scope.mjs';
const initial='Buenas tardes. Tengo comején en un mueble de mi apartamento en Itagüí, barrio Santa María. No sé cuánto mide el mueble. ¿Cuánto cuesta tratarlo?',start=Date.parse('2026-10-16T22:32:00.000Z');
async function using(t,fn,text=initial){
 t.mock.timers.enable({apis:['Date'],now:start});const store=new Store(':memory:','fumigacion',randomBytes(32)),config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:'sandra',activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'chief-furniture-local-'+i})),tesaOperations:{enabled:false}},engine=new Engine(store,config),event={id:'CHIEF_FURNITURE_OWN_NATIVE_SOURCE',phone:'573000007386',line:config.lines[0].phone,at:start,kind:'text',fromMe:false,forwarded:false,text};store.enqueue(event);await engine.process(event);const row=store.db.prepare('SELECT * FROM questions').get(),body=store.open(row.body),request={...body,phone:event.phone,line:event.line,caseId:row.case_id,source:body.source,topic:row.topic,recipients:[SANDRA]};
 try{await fn({store,config,event,row,body,request});}finally{store.close();}
}
test('the exact furniture request asks Sandra one clear scope question without relabelling the entire request as a location',t=>using(t,async f=>{
 const text=f.body.text,state=f.store.conversation(f.event.phone).state;assert.match(text,/^• Servicio: comején$/m);assert.match(text,/^• Municipio: itagui$/m);assert.match(text,/^• Inmueble: apartamento$/m);assert.match(text,/^• Alcance indicado: un mueble$/m);assert.doesNotMatch(text,/Ubicación indicada:|Alcance indicado: Alcance:|habitaciones|metros cuadrados/);assert.equal((text.match(/^• Alcance indicado:/gm)||[]).length,1);assert.equal((text.match(/^¿/gm)||[]).length,1);assert.match(text,/Mensaje del cliente: «Buenas tardes\. Tengo comején.*No sé cuánto mide el mueble\. ¿Cuánto cuesta tratarlo\?/);assert.ok(text.length<=1200);
 assert.equal(state.intakeSources.treatmentScope.guard,MARIA_TERMITE_FURNITURE_SCOPE_GUARD);assert.equal(f.body.source,f.event.id);assert.equal(f.row.topic,'special-quotation');assert.equal(f.body.conditions.treatmentScope,'un mueble');assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(f.event.id).body).text,initial);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
}));
test('a literal mixed furniture and structure scope is shown in full without silently reducing it to one item',t=>using(t,async f=>{
 assert.match(f.body.text,/^• Alcance indicado: un mueble y en el techo$/m);assert.doesNotMatch(f.body.text,/Ubicación indicada:|habitaciones|metros cuadrados/);assert.equal(f.body.conditions.scopeKind,'mixed-furniture-property');
},'Tengo comején en un mueble y en el techo de mi apartamento de Itagüí. ¿Cuánto cuesta?'));
for(const mode of ['wrong-guard','wrong-at','other-source','other-line','other-phone','forwarded','quoted','scope-mismatch'])test('an invalid furniture source never supplies a scope bullet: '+mode,t=>using(t,async f=>{
 const beforeOut=f.store.db.prepare('SELECT id,body FROM outbox WHERE internal=1').get(),state=f.store.conversation(f.event.phone).state,ref=state.intakeSources.treatmentScope;
 if(mode==='wrong-guard')ref.guard='UNVERIFIED';if(mode==='wrong-at')ref.at--;if(mode==='other-source')ref.sourceId='OTHER_CASE_SOURCE';if(mode==='scope-mismatch')state.slots.treatmentScope='unos muebles';
 if(['other-line','other-phone','forwarded','quoted'].includes(mode)){const saved=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(f.event.id),event=f.store.open(saved.body);if(mode==='other-line')event.line=f.config.lines[1].phone;if(mode==='other-phone')event.phone='573000007387';if(mode==='forwarded')event.forwarded=true;if(mode==='quoted')event.quotedId='OTHER_NATIVE_MID';f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal(event),f.event.id);}
 f.store.saveConversation(f.event.phone,state);const text=ownMariaChiefQuestionText(f.store,f.config,f.request,extractSlots);assert.doesNotMatch(text||'',/^• Alcance indicado:/m);assert.equal(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(beforeOut.id).body,beforeOut.body);
}));
test('a later different explicit scope cannot be overruled by a valid old furniture reference',t=>using(t,async f=>{
 const current={...f.event,id:'CHIEF_FURNITURE_CURRENT_SCOPE',at:f.event.at+1000,text:'Tengo comején en unos muebles de mi apartamento en Itagüí. ¿Cuánto cuesta?' };f.store.enqueue(current);const state=f.store.conversation(f.event.phone).state;f.store.saveConversation(f.event.phone,{...state,lastHandledSourceId:current.id});const before=f.store.conversation(f.event.phone),text=ownMariaChiefQuestionText(f.store,f.config,{...f.request,source:current.id},extractSlots);assert.doesNotMatch(text,/^• Alcance indicado:/m);assert.match(text,/Mensaje del cliente: «Tengo comején en unos muebles/);assert.deepEqual(f.store.conversation(f.event.phone),before);
}));
for(const place of ['Barrio Santa María','Barrio Las Hormigas'])test('a complete source that is only a neighborhood remains location context without an inferred municipality: '+place,t=>using(t,async f=>{
 const current={...f.event,id:'CHIEF_FURNITURE_PURE_LOCATION',at:f.event.at+1000,text:place};f.store.enqueue(current);const previous=f.store.conversation(f.event.phone).state,state={...previous,lastHandledSourceId:current.id,slots:{locationDetails:current.text},intakeLocationParts:[{sourceId:current.id,at:current.at,text:current.text}],intakeSources:{locationDetails:{sourceCoverageComplete:true,sources:[{sourceId:current.id,at:current.at}]}}};f.store.saveConversation(f.event.phone,state);const text=ownMariaChiefQuestionText(f.store,f.config,{...f.request,source:current.id},extractSlots);assert.ok(text.includes('• Ubicación indicada: '+place));assert.doesNotMatch(text,/^• Municipio:/m);assert.ok(text.includes('Mensaje del cliente: «'+place+'»'));
}));
