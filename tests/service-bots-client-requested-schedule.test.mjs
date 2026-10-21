// Synthetic Engine + own in-memory ledger. Never calls a provider, model or DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {drainProgramRegistrations,registrationHash,registrationStatus} from '../automation/service-bots/maria-program.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD,clientRequestedScheduleConfig,clientRequestedScheduleEnabled,projectClientRequestedSchedule,clientRequestedScheduleReceiptMatches} from '../automation/service-bots/client-requested-schedule.mjs';
const START=Date.parse('2026-10-16T21:20:00.000Z');
async function using(t,fn,enabled=true){
 t.mock.timers.enable({apis:['Date'],now:START});
 const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));
 f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:START-5000};
 f.config.clientRequestedSchedule={enabled,startsAt:START-1000,guard:MARIA_CLIENT_SCHEDULE_GUARD};
 try{await fn(f);}finally{f.store.close();}
}
async function throughFacts(f){
 const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí.');f.deliver(quote);
 const yes=await f.turn('Sí, acepto esa cotización');f.deliver(yes);
 assert.match(f.reply(yes),/Qué día y a qué hora necesitas el servicio/);assert.doesNotMatch(f.reply(yes),/franja horaria|horario queda pendiente/);
 assert.equal(f.entry(yes),undefined);
 const fields=await f.turn('Soy Persona Sintética y mi dirección es Calle de Prueba 0 # 0.');f.deliver(fields);
 return {quote,fields};
}
test('status exposes the separate calendar capability without rewriting legacy scope',t=>using(t,async f=>{
 const status=registrationStatus(f.config,f.store);
 assert.equal(status.registrationKind,'new-service-pending-scheduling');assert.equal(status.scheduled,false);
 assert.equal(status.clientRequestedSchedule.configured,true);assert.equal(status.clientRequestedSchedule.enabled,true);
 assert.equal(status.clientRequestedSchedule.guard,MARIA_CLIENT_SCHEDULE_GUARD);assert.equal(status.clientRequestedSchedule.technicianAssignment,false);
 assert.equal(status.clientRequestedSchedule.expiresAt,new Date(f.config.mariaProgram.expiresAt).toISOString());
 f.config.enabled=false;assert.equal(registrationStatus(f.config,f.store).clientRequestedSchedule.enabled,false);
 assert.equal(registrationStatus(f.config,f.store).clientRequestedSchedule.configured,true);
}));
async function prepared(f,confirmation='Sí',preference='El sábado 24 de octubre a las 10 am'){
 const facts=await throughFacts(f),pref=await f.turn(preference),text=f.deliver(pref);
 assert.match(text,/• Horario solicitado: 24\/10\/2026 a las 10:00 a\. m\./);
 assert.doesNotMatch(text,/Registraré|sin técnico|equipo interno|sistema/);
 assert.doesNotMatch(text,/pendiente de coordinación/);
 assert.equal(f.entry(pref),undefined);
 const final=await f.turn(confirmation),entry=f.entry(final);assert.ok(entry);
 return {...facts,pref,final,entry};
}
function scheduledReceipt(f,p){
 const projection=projectClientRequestedSchedule(p.slots.preference,p.sources.preference.at,p.sources.acceptance.at);
 assert.equal(projection.complete,true);
 const {complete,...calendar}=projection;
 return {...f.receipt(p),state:'PROGRAMADO',scheduled:true,schedulingKind:'client-requested-without-technician',schedule:{...calendar,preferenceSourceId:p.sources.preference.id,preferenceSourceAt:p.sources.preference.at,summaryMid:p.summaryConfirmation.mid,acceptanceId:p.quote.acceptanceId,verifiedCurrentFields:true}};
}
for(const confirmation of ['Sí','Correcto','Listo','Sí, confirmo que los datos son correctos.'])test('the actual Engine programs only after its delivered calendar summary and fresh confirmation: '+confirmation,t=>using(t,async f=>{
 const {pref,final,entry}=await prepared(f,confirmation);
 assert.equal(entry.payload.clientSchedule.guard,MARIA_CLIENT_SCHEDULE_GUARD);
 assert.equal(entry.payload.sources.preference.id,pref.id);
 assert.equal(entry.payload.sources.acceptance.id,final.id);
 assert.equal(entry.payload.summaryConfirmation.text,f.reply(pref));
 assert.equal(entry.requestHash,registrationHash(entry.payload));
 let creates=0,routes=0;
 const result=await drainProgramRegistrations(f.store,f.config,f.transport(async(_url,opts)=>{
  creates++;return {ok:true,json:async()=>scheduledReceipt(f,JSON.parse(opts.body))};
 }),()=>{routes++;throw Error('NO_TECHNICIAN_DEPENDENCY');});
 assert.equal(result.persisted,1);assert.equal(creates,1);assert.equal(routes,0);
 const saved=f.entry(final);assert.equal(saved.status,'SAVED');assert.equal(saved.receipt.state,'PROGRAMADO');
 assert.equal(saved.receipt.schedule.requestedDate,'2026-10-24');
 assert.equal(saved.receipt.schedule.visitAt,'2026-10-24T05:00:00.000Z');
 assert.equal(saved.receipt.schedule.startAt,'2026-10-24T15:00:00.000Z');
 assert.equal(saved.receipt.schedule.endAt,null);assert.equal(saved.receipt.schedule.technicianId,null);
 const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('program:'+entry.payload.caseId+':saved'),reply=f.store.open(row.body);
 assert.match(reply,/Tu servicio quedó confirmado y programado/);assert.match(reply,/• Horario: 24\/10\/2026 a las 10:00 a\. m\./);
 assert.doesNotMatch(reply,/pendiente de coordinación|disponibilidad se confirma|equipo interno|asignar el técnico|ruta/);
 assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,0);
 assert.notEqual(f.state(final).awaitingHumanReview,true);
 await drainProgramRegistrations(f.store,f.config,f.transport(async()=>{throw Error('DUPLICATE_CREATE');}));
 assert.equal(creates,1);
}));
for(const field of ['startAt','visitAt','endAt','technicianId','preferenceSourceId','summaryMid','acceptanceId'])test('a mismatched calendar receipt never certifies a save: '+field,t=>using(t,async f=>{
 const {final,entry}=await prepared(f);const r=scheduledReceipt(f,entry.payload);r.schedule[field]='CONTRADICTORY';
 assert.equal(clientRequestedScheduleReceiptMatches(entry.payload,r),false);
 const result=await drainProgramRegistrations(f.store,f.config,f.transport(async()=>({ok:true,json:async()=>r})));
 assert.equal(result.persisted,0);assert.equal(f.entry(final).status,'UNCERTAIN');
 assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%:saved'").get().n,0);
}));
test('an unknown creation result uses only a later receipt lookup, never another creation',t=>using(t,async f=>{
 const {final,entry}=await prepared(f);let creates=0,reads=0;
 const transport=f.transport(async(url)=>{
  if(url.endsWith('/receipt')){reads++;return {ok:true,json:async()=>scheduledReceipt(f,entry.payload)};}
  creates++;throw Error('UNKNOWN_SYNTHETIC_RESULT');
 });
 await drainProgramRegistrations(f.store,f.config,transport);assert.equal(f.entry(final).status,'UNCERTAIN');
 await drainProgramRegistrations(f.store,f.config,transport);assert.equal(f.entry(final).status,'SAVED');
 assert.equal(creates,1);assert.equal(reads,1);
}));
test('disabling the client-calendar flag after preparation prevents a write, retaining the source',t=>using(t,async f=>{
 const {final,entry}=await prepared(f);f.config.clientRequestedSchedule.enabled=false;let calls=0;
 await drainProgramRegistrations(f.store,f.config,f.transport(async()=>{calls++;}));
 assert.equal(calls,0);assert.equal(f.entry(final).status,'REVIEW');assert.equal(f.entry(final).payload.sources.preference.id,entry.payload.sources.preference.id);
}));
test('a calendar without an exact hour asks for clarification and preserves the collected fields',t=>using(t,async f=>{
 await throughFacts(f);const pref=await f.turn('Mañana en la tarde');assert.match(f.reply(pref),/hora.*mañana o en la tarde|A qué hora/);
 assert.equal(f.state(pref).programIntake.customerName,'Persona Sintética');assert.equal(f.state(pref).programIntake.address,'Calle de Prueba 0 # 0');
 assert.equal(f.entry(pref),undefined);f.deliver(pref);const bare=await f.turn('Sí');assert.equal(f.entry(bare),undefined);
}));
test('a legacy case cannot acquire the client-calendar opt-in when the configuration changes later',t=>using(t,async f=>{
 const {quote}=await throughFacts(f);f.config.clientRequestedSchedule.startsAt=quote.at+1000;
 const pref=await f.turn('El sábado 24 de octubre a las 10 am');assert.match(f.deliver(pref),/Preferencia solicitada/);
 const final=await f.turn('Sí, confirmo que los datos son correctos.');assert.equal(f.entry(final).payload.clientSchedule,undefined);
}));
test('calendar configuration defaults OFF and rejects other companies and retroactive cutoffs',()=>{
 assert.deepEqual(clientRequestedScheduleConfig({},'fumigacion',START),{enabled:false});
 const env={BOT_MARIA_CLIENT_REQUESTED_SCHEDULE_ENABLED:'true',BOT_MARIA_CLIENT_REQUESTED_SCHEDULE_STARTS_AT:new Date(START+1000).toISOString()};
 const enabled=clientRequestedScheduleConfig(env,'fumigacion',START);assert.equal(enabled.guard,MARIA_CLIENT_SCHEDULE_GUARD);
 assert.throws(()=>clientRequestedScheduleConfig(env,'servicio-tecnico',START));
 assert.throws(()=>clientRequestedScheduleConfig(env,'fumigacion',START+2000));
 assert.equal(clientRequestedScheduleEnabled({company:'servicio-tecnico',clientRequestedSchedule:enabled},START+2000),false);
});
