// Synthetic actual Engine/Store only. Native messages/deliveries and adapter
// receipts are local fixtures; no network, models or real business writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createSummaryScopeFixture} from './fixtures/maria-summary-scope-flow.mjs';
import {currentMariaLocationProjection} from '../automation/service-bots/current-location-projection.mjs';
import {drainProgramRegistrations,registrationHash} from '../automation/service-bots/maria-program.mjs';

const start=Date.parse('2026-10-16T21:20:00.000Z'),firstText='Chinches en dos colchones en un apartamento de Itagüí. No hay otros muebles afectados.',finalText='Sí, confirmo que los datos son correctos.';
const sha=text=>createHash('sha256').update(text).digest('hex');
const using=async(t,fn)=>{t.mock.timers.enable({apis:['Date'],now:start});const f=createSummaryScopeFixture(at=>t.mock.timers.setTime(at));try{await fn(f);}finally{f.store.close();}};
async function prepare(f,first=firstText){
 const original=await f.turn(first);f.deliver(original);f.deliver(await f.turn('Todavía no sé si será uno o dos colchones.'));
 const correction=await f.turn('Es un colchón, no dos.');assert.match(f.deliver(correction),/100\.000/);
 f.deliver(await f.turn('Gracias, por ahora lo voy a pensar.'));f.deliver(await f.turn('Sí.'));
 const acceptance=await f.turn('Sí, deseo continuar con la cotización de $100.000.');f.deliver(acceptance);
 const facts=await f.turn('Mi nombre es Persona Sintética y mi dirección es Calle de Prueba 0 # 0');assert.match(f.reply(facts),/^• Colchones informados: un colchón$/m);f.deliver(facts);
 return {original,correction,acceptance,facts,state:f.state(facts)};
}
function rewriteEvent(f,event,patch){const saved=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(event.id),original=f.store.open(saved.body);f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal({...original,...patch}),event.id);}

test('the legitimate short mixed source corrects two to one, preserves every other original character and prepares the real DTO',t=>using(t,async f=>{
 const {original,correction,facts,state}=await prepare(f),before=structuredClone(state),p=currentMariaLocationProjection(f.store,state,facts);
 assert.equal(p.review,false);assert.equal(p.locationDetails,'Chinches en un apartamento de Itagüí. No hay otros muebles afectados.');assert.equal(p.omissions.length,1);
 const removed=p.omissions[0];assert.equal(original.text.slice(removed.start,removed.end),'en dos colchones ');assert.equal(removed.removed,'en dos colchones ');assert.equal(removed.sourceHash,sha(original.text));assert.equal(removed.fragmentHash,sha(removed.removed));assert.equal(removed.currentSourceId,correction.id);assert.equal(removed.quotePriceCop,100000);assert.equal(p.locationDetails,original.text.slice(0,removed.start)+original.text.slice(removed.end));assert.deepEqual(state,before);
 const final=await f.turn(finalText),entry=f.entry(final);assert.ok(entry);assert.equal(entry.payload.slots.mattresses,'un colchón');assert.equal(entry.payload.quote.priceCop,100000);assert.equal(entry.payload.locationDetails,p.locationDetails);assert.equal(entry.payload.sources.customerName.text,facts.text);assert.equal(entry.payload.sources.address.text,facts.text);assert.equal(entry.payload.summaryConfirmation.text,f.reply(facts));assert.equal(entry.requestHash,registrationHash(entry.payload));
 const stored=f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(original.id).body);assert.equal(stored.text,original.text);assert.equal(f.state(final).slots.locationDetails,original.text);
 const audit=f.store.db.prepare("SELECT * FROM audit WHERE action='OWN_CURRENT_LOCATION_PROJECTED' AND source=?").get(final.id);assert.ok(audit);
 let posted;await drainProgramRegistrations(f.store,f.config,f.transport(async(_url,opts)=>{posted=JSON.parse(opts.body);return {ok:true,json:async()=>f.receipt(posted)};}));assert.deepEqual(posted,entry.payload);assert.equal(registrationHash(posted),entry.requestHash);
 if(process.env.MARIA_CORRECTED_SPAN_FIXTURE_DIR){mkdirSync(process.env.MARIA_CORRECTED_SPAN_FIXTURE_DIR,{recursive:true});writeFileSync(join(process.env.MARIA_CORRECTED_SPAN_FIXTURE_DIR,'corrected-one-mattress-span-engine-dto-synthetic.json'),JSON.stringify({synthetic:true,networkCalls:0,modelCalls:0,businessWrites:0,entry,projection:p},null,2)+'\n');}
}));

for(const text of [
 'Chinches en dos colchones en un apartamento de Itagüí, barrio Santa María. No hay otros muebles afectados.',
 'Chinches en dos colchones en un apartamento de Itagüí, entrada por portería. No hay otros muebles afectados.',
 'Chinches en dos colchones en un apartamento de Itagüí, calle 50. No hay otros muebles afectados.',
 'Chinches en dos colchones en un apartamento de Itagüí; la entrada necesita llave. No hay otros muebles afectados.',
 'Chinches en dos colchones en un apartamento de Itagüí. Son dos colchones. No hay otros muebles afectados.'
])test('an address, access restriction or ambiguous duplicate never disappears with the old count: '+text,t=>using(t,async f=>{
 const {state,facts}=await prepare(f,text),before=structuredClone(state),p=currentMariaLocationProjection(f.store,state,facts);
 if(text.includes('; la entrada')){assert.equal(p.review,false);assert.match(p.locationDetails,/; la entrada necesita llave\./);assert.doesNotMatch(p.locationDetails,/dos colchones/);}else{assert.equal(p.review,true);assert.equal(p.locationDetails,state.slots.locationDetails);}
 assert.deepEqual(state,before);
}));

for(const mode of ['ACCEPTED','UNCERTAIN','no-MID','no-first-proof','wrong-first-MID','wrong-first-line','wrong-case','wrong-phone','wrong-line','wrong-price','unaccepted','quote-before-correction'])test('count projection cannot use an unverified or contradictory own quotation: '+mode,t=>using(t,async f=>{
 const {state,correction,facts}=await prepare(f),quote=f.row(correction),proofKey='first-delivery:'+quote.id;
 if(mode==='ACCEPTED'||mode==='UNCERTAIN')f.store.db.prepare('UPDATE outbox SET state=? WHERE id=?').run(mode,quote.id);
 if(mode==='no-MID')f.store.db.prepare('UPDATE outbox SET mid=NULL WHERE id=?').run(quote.id);
 if(mode==='no-first-proof')f.store.db.prepare('DELETE FROM meta WHERE key=?').run(proofKey);
 if(mode==='wrong-first-MID'||mode==='wrong-first-line'){const saved=f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(proofKey),proof=f.store.open(saved.value);proof[mode==='wrong-first-MID'?'mid':'line']='WRONG';f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(proof),proofKey);}
 if(mode==='wrong-case')f.store.db.prepare('UPDATE outbox SET case_id=? WHERE id=?').run('fumigacion:OTHER_SOURCE',quote.id);
 if(mode==='wrong-phone')f.store.db.prepare('UPDATE outbox SET phone=? WHERE id=?').run('573000007385',quote.id);
 if(mode==='wrong-line')f.store.db.prepare('UPDATE outbox SET line=? WHERE id=?').run('573126938721',quote.id);
 if(mode==='wrong-price')state.quotedPrice.priceCop++;
 if(mode==='unaccepted')state.quotedPrice.accepted=false;
 if(mode==='quote-before-correction')state.quotedPrice.issuedAt=correction.at-10000;
 const p=currentMariaLocationProjection(f.store,state,facts);assert.equal(p.review,true);assert.equal(p.locationDetails,state.slots.locationDetails);assert.equal(f.entry(facts),undefined);
}));

for(const mode of ['original-forward','original-quote','original-other-phone','correction-forward','correction-quote','correction-third-party','correction-conditional','correction-quoted-text','correction-before-original','missing-current-source'])test('source provenance and literal correction remain mandatory for a projected span: '+mode,t=>using(t,async f=>{
 const {state,original,correction,facts}=await prepare(f);
 if(mode==='original-forward')rewriteEvent(f,original,{forwarded:true});if(mode==='original-quote')rewriteEvent(f,original,{quotedId:'OTHER_SOURCE'});if(mode==='original-other-phone')rewriteEvent(f,original,{phone:'573000007385'});
 if(mode==='correction-forward')rewriteEvent(f,correction,{forwarded:true});if(mode==='correction-quote')rewriteEvent(f,correction,{quotedId:'OTHER_SOURCE'});
 if(mode==='correction-third-party')rewriteEvent(f,correction,{text:'Mi vecino dice: es un colchón, no dos.'});if(mode==='correction-conditional')rewriteEvent(f,correction,{text:'Si es un colchón, no dos.'});if(mode==='correction-quoted-text')rewriteEvent(f,correction,{text:'"Es un colchón", no dos.'});
 if(mode==='correction-before-original'){state.intakeSources.mattresses.at=original.at-1;rewriteEvent(f,correction,{at:original.at-1});}
 if(mode==='missing-current-source')state.intakeSources.mattresses.sourceId='NONEXISTENT_CORRECTION';
 const p=currentMariaLocationProjection(f.store,state,facts);assert.equal(p.review,true);assert.equal(p.locationDetails,state.slots.locationDetails);
}));
