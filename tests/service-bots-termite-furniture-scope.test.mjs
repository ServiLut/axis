// Local memory-only Engine sources. No model, network, send or business write.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {literalTermiteFurnitureScope} from '../automation/service-bots/maria-furniture-scope.mjs';

const nativeText='Buenas tardes. Tengo comején en un mueble de mi apartamento en Itagüí, barrio Santa María. ¿Cuánto cuesta tratarlo?';
const using=async(t,fn)=>{t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T22:10:00.000Z')});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));try{await fn(f);}finally{f.store.close();}};

test('comején explicitly confined to a furniture item requests its own scope and quotation instead of whole-property size',t=>using(t,async f=>{
 const e=await f.turn(nativeText),state=f.state(e),reply=f.reply(e);
 assert.doesNotMatch(reply,/habitaciones|metros cuadrados/i);
 assert.match(reply,/mueble/);
 assert.equal(state.slots.service,'comején');assert.equal(state.slots.site,'apartamento');assert.equal(state.slots.location,'itagui');
 assert.equal(state.slots.treatmentScope,'un mueble');assert.equal(state.intakeSources.treatmentScope.sourceId,e.id);
 assert.equal(state.awaitingHumanReview,true);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(f.entry(e),undefined);
 const rows=f.store.db.prepare('SELECT * FROM questions').all();assert.equal(rows.length,1);
 const question=f.store.open(rows[0].body);assert.equal(question.source,e.id);assert.match(JSON.stringify(question),/mueble/);assert.doesNotMatch(reply,/\$|garantizado|aplicaremos|agendado|registrado/i);
 assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(e.id).body).text,nativeText);
}));

for(const text of ['Tengo comején en un mueble de mi casa en Itagüí. ¿Cuánto vale?','Un mueble tiene comején en mi apartamento de Itagüí. ¿Cuánto cuesta?','Quiero tratar mi mueble con comején en Itagüí. ¿Cuánto cuesta?','Tengo comején en unos muebles de mi apartamento en Itagüí. ¿Cuánto cuesta?','Sí, tengo comején en un mueble de mi apartamento en Itagüí. ¿Cuánto cuesta?'])test('a direct item-scoped request follows review without asking for house size: '+text,t=>using(t,async f=>{
 const e=await f.turn(text),state=f.state(e);assert.doesNotMatch(f.reply(e),/habitaciones|metros cuadrados|\$|registrado|agendado/);assert.match(f.reply(e),/mueble/);assert.equal(state.awaitingHumanReview,true);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(state.intakeSources.treatmentScope.sourceId,e.id);assert.equal(f.entry(e),undefined);
}));

const source=(text,patch={})=>({id:'SYNTHETIC_TERMITE_SCOPE',kind:'text',fromMe:false,forwarded:false,line:'573126944997',phone:'573000007384',at:Date.parse('2026-10-16T22:00:00.000Z'),text,...patch});
const nonasserted=['No hay muebles con comején.','No tengo comején en un mueble.','Tuve comején en un mueble hace un año.','Mi vecino dice: tengo comején en un mueble.','Si tengo comején en un mueble, ¿cuánto cuesta?','Cuando tengo comején en un mueble, ¿qué hago?','Quizás tengo comején en un mueble.','"Tengo comején en un mueble".'];
for(const text of nonasserted)test('negation, history, others or hypothetical scope never become a present item assertion: '+text,()=>{
 assert.equal(literalTermiteFurnitureScope(source(text)),null);
});
for(const patch of [{forwarded:true},{quotedId:'OTHER_NATIVE_SOURCE'},{fromMe:true},{kind:'audio'}])test('only a direct original text source may establish furniture scope: '+JSON.stringify(patch),()=>{
 assert.equal(literalTermiteFurnitureScope(source(nativeText,patch)),null);
});
for(const suffix of ['Mi bebé tiene dolor.','Ya pagué el servicio.','Tengo una queja y quiero una devolución.'])test('existing safety, payment and complaint priorities precede furniture quotation: '+suffix,t=>using(t,async f=>{
 const e=await f.turn(nativeText+' '+suffix),state=f.state(e);assert.equal(state.slots.treatmentScope,undefined);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.doesNotMatch(f.reply(e),/Para tratar el comején|habitaciones|metros cuadrados/);assert.ok(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n>0);
}));
for(const text of nonasserted)test('Engine cannot turn a nonasserted furniture reference plus a room count into a price or registration: '+text,t=>using(t,async f=>{
 const e=await f.turn(text+' Es un apartamento de dos habitaciones en Itagüí. ¿Cuánto cuesta?'),state=f.state(e);assert.equal(state.slots.treatmentScope,undefined);assert.equal(state.intakeSources?.treatmentScope,undefined);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(f.entry(e),undefined);assert.doesNotMatch(f.reply(e)||'',/\$|179[.,]000|registrado|agendado/);
}));
for(const patch of [{forwarded:true},{quotedId:'OTHER_NATIVE_SOURCE'}])test('Engine cannot price or register forwarded or quoted furniture scope',t=>using(t,async f=>{
 const e=await f.turn('Tengo comején en un mueble de mi apartamento de dos habitaciones en Itagüí. ¿Cuánto cuesta?',patch),state=f.state(e);assert.equal(state.slots.treatmentScope,undefined);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(f.entry(e),undefined);assert.doesNotMatch(f.reply(e)||'',/\$|179[.,]000/);
}));
for(const text of ['Tengo comején en un mueble y en el techo de mi apartamento de dos habitaciones en Itagüí. ¿Cuánto cuesta?','Tengo comején en un mueble y quiero tratar toda mi casa de dos habitaciones en Itagüí. ¿Cuánto cuesta?'])test('a current mixed item-and-property scope stays in special review without a standard room price',t=>using(t,async f=>{
 const e=await f.turn(text),state=f.state(e);assert.match(state.slots.treatmentScope,/un mueble y /);assert.equal(state.awaitingHumanReview,true);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(f.entry(e),undefined);assert.match(f.reply(e),/mueble y la parte del inmueble/);assert.doesNotMatch(f.reply(e),/\$|179[.,]000|habitaciones|metros cuadrados/);
 const question=f.store.open(f.store.db.prepare('SELECT body FROM questions').get().body);assert.equal(question.conditions.scopeKind,'mixed-furniture-property');assert.equal(question.source,e.id);
}));
test('not knowing the item measurements does not negate its affirmed infestation or ask for house size',t=>using(t,async f=>{
 const text='Tengo comején en un mueble de mi apartamento en Itagüí. No sé cuánto mide el mueble. ¿Cuánto cuesta?',e=await f.turn(text),state=f.state(e);assert.equal(state.slots.treatmentScope,'un mueble');assert.equal(state.awaitingHumanReview,true);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(f.entry(e),undefined);assert.match(f.reply(e),/ese mueble/);assert.doesNotMatch(f.reply(e),/habitaciones|metros cuadrados|\$/);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(e.id).body).text,text);
}));
test('a literal plurality is acknowledged as plural without a quantity or price inference',t=>using(t,async f=>{
 const e=await f.turn('Tengo comején en unos muebles de mi apartamento en Itagüí. ¿Cuánto cuesta?'),state=f.state(e);assert.equal(state.slots.treatmentScope,'unos muebles');assert.match(f.reply(e),/esos muebles/);assert.doesNotMatch(f.reply(e),/ese mueble,|\$/);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(f.entry(e),undefined);
}));
test('the apartment floor is location context and never a fabricated additional affected surface',t=>using(t,async f=>{
 const text='Tengo comején en un mueble de mi apartamento del tercer piso en Itagüí. ¿Cuánto cuesta?',e=await f.turn(text),state=f.state(e);assert.equal(state.slots.treatmentScope,'un mueble');assert.equal(state.awaitingHumanReview,true);assert.equal(state.quotedPrice,undefined);assert.equal(f.entry(e),undefined);const question=f.store.open(f.store.db.prepare('SELECT body FROM questions').get().body);assert.equal(question.conditions.scopeKind,'furniture-item');assert.match(f.reply(e),/ese mueble/);assert.doesNotMatch(f.reply(e),/parte del inmueble/);
}));
test('plural item-and-structure scope keeps a plural acknowledgement without a standard quotation',t=>using(t,async f=>{
 const e=await f.turn('Tengo comején en unos muebles y en el techo de mi apartamento de dos habitaciones en Itagüí. ¿Cuánto cuesta?'),state=f.state(e);assert.equal(state.slots.treatmentScope,'unos muebles y en el techo');assert.match(f.reply(e),/en los muebles y la parte del inmueble/);assert.doesNotMatch(f.reply(e),/en el mueble y|\$|179[.,]000/);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(f.entry(e),undefined);
}));
test('the existing multiple-property review keeps priority over an unresolved furniture reference',t=>using(t,async f=>{
 const e=await f.turn('Tengo comején en un mueble y quiero cotizar dos apartamentos en Itagüí. ¿Cuánto cuesta?'),state=f.state(e),row=f.store.db.prepare('SELECT * FROM questions').get(),body=f.store.open(row.body);assert.equal(row.topic,'special-quotation');assert.equal(body.conditions.kind,'special-property');assert.equal(state.awaitingHumanReview,true);assert.equal(state.slots.treatmentScope,undefined);assert.equal(state.quotedPrice,undefined);assert.equal(state.programIntake,undefined);assert.equal(f.entry(e),undefined);assert.doesNotMatch(f.reply(e),/\$|habitaciones|metros cuadrados/);
}));
test('staff takeover preserves its hold and emits no customer or internal question',t=>using(t,async f=>{
 const staff=source('Te atiende una persona.',{id:'SYNTHETIC_TERMITE_STAFF',fromMe:true,at:Date.now()});f.store.enqueue(staff);await f.engine.process(staff);const before=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
 const e=await f.turn(nativeText);assert.equal(f.store.conversation(e.phone).hold,1);assert.equal(f.reply(e),undefined);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,before);assert.equal(f.state(e).slots.treatmentScope,undefined);
}));
test('an ordinary apartment quotation remains independent of an item-scoped special case on another phone',t=>using(t,async f=>{
 const special=await f.turn(nativeText);assert.equal(f.state(special).awaitingHumanReview,true);
 const ordinary=await f.turn('Tengo cucarachas en un apartamento de dos habitaciones en Itagüí.',{phone:'573000007385'}),state=f.state(ordinary);assert.equal(state.quotedPrice.priceCop,129000);assert.equal(state.slots.treatmentScope,undefined);assert.equal(state.awaitingHumanReview,undefined);assert.notEqual(state.caseId,f.state(special).caseId);
}));
