// Full synthetic Engine/ledger turns; no provider, model or production write.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {drainProgramRegistrations} from '../automation/service-bots/maria-program.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD,projectClientRequestedSchedule} from '../automation/service-bots/client-requested-schedule.mjs';
import {flushOutbox} from '../automation/service-bots/transport.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';
const start=Date.parse('2026-10-23T18:00:00Z');
async function using(t,fn){t.mock.timers.enable({apis:['Date'],now:start});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at),{start});f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:start-1000};f.config.clientRequestedSchedule={enabled:true,startsAt:start-1000,guard:MARIA_CLIENT_SCHEDULE_GUARD};try{initializeInactivityFollowup(f.config,f.store);await fn(f);}finally{f.store.close();}}
function scheduledReceipt(f,p){const {complete,...calendar}=projectClientRequestedSchedule(p.slots.preference,p.sources.preference.at,p.sources.acceptance.at);assert.equal(complete,true);return {...f.receipt(p),state:'PROGRAMADO',scheduled:true,schedulingKind:'client-requested-without-technician',schedule:{...calendar,preferenceSourceId:p.sources.preference.id,preferenceSourceAt:p.sources.preference.at,summaryMid:p.summaryConfirmation.mid,acceptanceId:p.quote.acceptanceId,verifiedCurrentFields:true}};}
async function prepare(f,line){const turn=text=>f.turn(text,{line});f.deliver(await turn('Cucarachas en apartamento de 3 habitaciones en Bello, barrio Niquía, unidad Los Arces.'));const accepted=await turn('Sí');f.deliver(accepted);return {turn,accepted};}
async function saved(f,line){const {turn}=await prepare(f,line);f.deliver(await turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301'));const timing=await turn('Mañana a las 9 de la mañana');f.deliver(timing);const accepted=await turn('Sí');let writes=0;const transport=f.transport(async(_url,o)=>{writes++;return {ok:true,json:async()=>scheduledReceipt(f,JSON.parse(o.body))};});await drainProgramRegistrations(f.store,f.config,transport);assert.equal(f.entry(accepted).status,'SAVED');return {turn,accepted,transport,get writes(){return writes;}};}
for(const line of ['573126944997','573126938721']){
test(line+' keeps each requested field and summary once while acknowledgements arrive between facts',t=>using(t,async f=>{
 const {turn,accepted}=await prepare(f,line),promptId=f.state(accepted).programIntake.promptId;
 for(const text of ['Sí','Listo','Sí']){const e=await turn(text);assert.doesNotMatch(f.reply(e)||'',/compárteme|pendiente.*confirmación/);assert.equal(f.state(e).programIntake.promptId,promptId);assert.equal(f.state(e).programIntake.stage,'name');}
 f.deliver(await turn('Nombre: Persona Sintética'));const prompt=f.state(accepted).programIntake.promptId;
 const repeated=await turn('Nombre: Persona Sintética');assert.equal(f.reply(repeated),undefined);assert.equal(f.state(repeated).programIntake.promptId,prompt);
 f.deliver(await turn('Dirección: Calle 50 # 42-18 apartamento 301'));const details=f.state(accepted).programIntake.promptId;
 for(const text of ['Sí','Listo']){const e=await turn(text);assert.doesNotMatch(f.reply(e)||'',/Qué día|compárteme|pendiente/);assert.equal(f.state(e).programIntake.promptId,details);}
 const timing=await turn('Mañana a las 9 de la mañana');f.deliver(timing);assert.match(f.reply(timing),/24\/10\/2026 a las 9:00 a\. m\./);
 const reminder=await turn('Ya te los envié');assert.match(f.reply(reminder),/ya tengo tus datos/);f.deliver(reminder);
 const repeatedReminder=await turn('Ya te los envié');assert.equal(f.reply(repeatedReminder),undefined);assert.equal(f.state(repeatedReminder).programIntake.promptId,timing.id+':reply');
 const confirm=await turn('Sí');assert.equal(f.entry(confirm).status,'PENDING');const again=await turn('Sí');assert.equal(f.reply(again),undefined);assert.equal(f.entry(again).status,'PENDING');await turn('Ya te confirmé');
 let writes=0;await drainProgramRegistrations(f.store,f.config,f.transport(async(_url,o)=>{writes++;return {ok:true,json:async()=>scheduledReceipt(f,JSON.parse(o.body))};}));assert.equal(writes,1);assert.equal(f.entry(confirm).status,'SAVED');assert.equal(f.entry(confirm).payload.quote.acceptanceId,confirm.id);
}));
test(line+' never downgrades a saved calendar or repeats its summary on closing acknowledgements',t=>using(t,async f=>{
 const v=await saved(f,line),before=structuredClone(f.entry(v.accepted));
 for(const text of ['Sí','Listo','Perfecto','Gracias','Ya te confirmé','Sí, confirmo que los datos son correctos.','Ya te los envié',before.payload.sources.customerName.text,'Sí']){const e=await v.turn(text);assert.doesNotMatch(f.reply(e)||'',/pendiente|Revisa|confirmado y programado|compárteme|¿Confirmas|Deseas continuar/);if(f.row(e))f.deliver(e);assert.equal(f.state(e).programIntake.stage,'registered');assert.notEqual(f.state(e).awaitingHumanReview,true);}
 for(const text of ['¿Ya quedó confirmado?','¿Qué día quedó mi servicio?','¿A qué hora quedó mi servicio?','¿Cuándo sería el servicio?']){const e=await v.turn(text);assert.match(f.reply(e),/confirmado para el 24\/10\/2026 a las 9:00 a\. m\./);assert.doesNotMatch(f.reply(e),/pendiente|compárteme|tecnico|equipo interno/);f.deliver(e);}
 await drainProgramRegistrations(f.store,f.config,v.transport);assert.equal(v.writes,1);assert.deepEqual(f.entry(v.accepted),before);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,0);
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%:saved'").get().n,1);
}));
}
test('a saved schedule keeps a concrete question separate from closing courtesy',t=>using(t,async f=>{
 const v=await saved(f,f.config.lines[0].phone),before=structuredClone(f.entry(v.accepted));
 const safety=await v.turn('¿Es seguro para mis mascotas?');assert.doesNotMatch(f.reply(safety)||'',/^Con gusto 😊$/);assert.ok(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n>0);
 assert.deepEqual(f.entry(v.accepted),before);assert.equal(v.writes,1);
}));
test('rapid acknowledgements before prompt delivery still deliver one form rather than suppressing the whole intake',t=>using(t,async f=>{
 f.deliver(await f.turn('Cucarachas en apartamento de 3 habitaciones en Bello, barrio Niquía, unidad Los Arces.'));
 await f.turn('Sí');await f.turn('Sí');await f.turn('Sí');let sends=0;
 const transport=f.transport(async()=>{throw Error('NO_BUSINESS_WRITE');});transport.send=async(_row,text)=>{assert.match(text,/Para registrar tu solicitud/);sends++;return 'SYNTHETIC_SEND_FORM';};
 await flushOutbox(f.store,f.config,transport);await flushOutbox(f.store,f.config,transport);assert.equal(sends,1);
}));
test('rapid acknowledgements after saving deliver one receipt-based result, with no second write or repeated summary',t=>using(t,async f=>{
 const v=await saved(f,f.config.lines[0].phone);await v.turn('Sí');await v.turn('Listo');await v.turn('Perfecto');let sends=0;
 v.transport.send=async(_row,text)=>{assert.match(text,/confirmado para el 24\/10\/2026 a las 9:00 a\. m\./);assert.doesNotMatch(text,/pendiente|• Nombre|compárteme/);sends++;return 'SYNTHETIC_SEND_SAVED';};
 await flushOutbox(f.store,f.config,v.transport);await flushOutbox(f.store,f.config,v.transport);assert.equal(sends,1);assert.equal(v.writes,1);
 const thanks=await v.turn('Gracias');assert.equal(f.reply(thanks),undefined);
}));
test('a summary not yet delivered survives a rapid acknowledgement and still needs a later acceptance',t=>using(t,async f=>{
 const {turn}=await prepare(f,f.config.lines[0].phone);f.deliver(await turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301'));await turn('Mañana a las 9 de la mañana');await turn('Sí');const waiting=await turn('Sí');assert.equal(f.entry(waiting),undefined);let sends=0;
 const transport=f.transport(async(_url,o)=>({ok:true,json:async()=>scheduledReceipt(f,JSON.parse(o.body))}));transport.send=async(_row,text)=>{assert.match(text,/Revisa los datos de tu solicitud/);sends++;return 'SYNTHETIC_SUMMARY_LATEST';};
 await flushOutbox(f.store,f.config,transport);assert.equal(sends,1);f.store.delivery('SYNTHETIC_SUMMARY_LATEST',waiting.line,'DELIVERED');
 const accepted=await turn('Sí');assert.equal(f.entry(accepted).status,'PENDING');assert.equal(f.entry(accepted).summaryOutboxId,waiting.id+':reply');await drainProgramRegistrations(f.store,f.config,transport);assert.equal(f.entry(accepted).status,'SAVED');
}));
test('a newer changed summary cannot reuse an earlier identical-delivery candidate',t=>using(t,async f=>{
 const {turn}=await prepare(f,f.config.lines[0].phone);f.deliver(await turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301'));const old=await turn('Mañana a las 9 de la mañana');await turn('Sí');
 const changed=await turn('Mañana a las 11 de la mañana');assert.match(f.reply(changed),/11:00 a\. m\./);f.deliver(old);
 const premature=await turn('Sí');assert.equal(f.entry(premature),undefined);assert.notEqual(f.state(premature).programIntake.promptId,old.id+':reply');
 f.deliver(premature);const accepted=await turn('Sí');assert.equal(f.entry(accepted).payload.sources.preference.id,changed.id);assert.equal(f.entry(accepted).summaryOutboxId,premature.id+':reply');
}));
for(const text of ['Sí, pero a las 11','Si me sirve, te confirmo mañana','No, cambió la dirección','Sí, y cuesta 100.000'])test('a changed or conditional turn while a write waits cannot count as neutral confirmation: '+text,t=>using(t,async f=>{
 const {turn}=await prepare(f,f.config.lines[0].phone);f.deliver(await turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301'));f.deliver(await turn('Mañana a las 9 de la mañana'));const accepted=await turn('Sí');await turn(text);let writes=0;
 await drainProgramRegistrations(f.store,f.config,f.transport(async()=>{writes++;throw Error('NO_WRITE');}));assert.equal(writes,0);assert.notEqual(f.entry(accepted).status,'SAVED');
}));
for(const kind of ['missing-receipt','changed-receipt','different-line','hold','expired'])test('a completed stage alone is never proof of confirmation: '+kind,t=>using(t,async f=>{
 const v=await saved(f,f.config.lines[0].phone),key='maria-registration:'+f.state(v.accepted).caseId;
 if(kind==='missing-receipt')f.store.db.prepare('DELETE FROM meta WHERE key=?').run(key);
 if(kind==='changed-receipt'){const entry=f.entry(v.accepted);entry.receipt.schedule.requestedTime='14:00';f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(entry),key);}
 if(kind==='hold')f.store.hold(v.accepted.phone,'OWN_NATIVE_HUMAN');
 if(kind==='expired')f.config.mariaProgram.expiresAt=Date.now()-1;
 const e=await f.turn('¿Ya quedó confirmado?',{line:f.config.lines[kind==='different-line'?1:0].phone});assert.doesNotMatch(f.reply(e)||'',/Sí, tu servicio está confirmado/);assert.equal(v.writes,1);
}));
