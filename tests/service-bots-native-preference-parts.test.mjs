// Actual in-memory Engine/native-source transport. No model, HTTP or business DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {drainProgramRegistrations,registrationHash} from '../automation/service-bots/maria-program.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD,clientRequestedScheduleReceiptMatches} from '../automation/service-bots/client-requested-schedule.mjs';
import {MARIA_PREFERENCE_PARTS_GUARD,nativePreferenceTime,projectNativePreferenceParts} from '../automation/service-bots/native-preference-parts.mjs';
const START=Date.parse('2026-10-16T21:20:00.000Z');
async function using(t,action){
 t.mock.timers.enable({apis:['Date'],now:START});
 const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));
 f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:START-5000};
 f.config.clientRequestedSchedule={enabled:true,startsAt:START-1000,guard:MARIA_CLIENT_SCHEDULE_GUARD};
 let network=0;t.mock.method(globalThis,'fetch',()=>{network++;throw Error('NO_NETWORK');});
 f.say=async(text,patch={})=>{const e=await f.turn(text,patch);if(f.row(e))f.deliver(e);return e;};
 try{await action(f);assert.equal(network,0);}finally{f.store.close();}
}
async function facts(f){await f.say('Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.');await f.say('Sí, acepto esa cotización');await f.say('Soy Persona Sintética y mi dirección es Calle de Prueba 0 # 0.');}
async function parts(f,day='El sábado 24 de octubre',hour='A las 10 am'){await facts(f);const date=await f.say(day),time=await f.say(hour);return {date,time};}
function receipt(f,p){const {complete,...schedule}=projectNativePreferenceParts(p.preferenceParts,p.sources.acceptance.at);assert.equal(complete,true);return {...f.receipt(p),state:'PROGRAMADO',scheduled:true,schedulingKind:'client-requested-without-technician',schedule:{...schedule,summaryMid:p.summaryConfirmation.mid,acceptanceId:p.quote.acceptanceId,verifiedCurrentFields:true}};}
for(const [name,first,second,date,time] of [
 ['date then hour','El sábado 24 de octubre','A las 10 am','2026-10-24','10:00'],
 ['hour then date','A las 10 am','El sábado 24 de octubre','2026-10-24','10:00'],
 ['date then colon hour','El sábado 24 de octubre','10:00 am','2026-10-24','10:00'],
 ['relative date then hour','Mañana','A las 10 am','2026-10-17','10:00'],
 ['numeric morning phrase','El sábado 24 de octubre','Me sirve a las 10 de la mañana','2026-10-24','10:00'],
 ['word morning phrase','El sábado 24 de octubre','a las diez de la mañana','2026-10-24','10:00'],
 ['word afternoon phrase','El sábado 24 de octubre','a las dos de la tarde','2026-10-24','14:00'],
])test('fragmented native timing prepares and saves without repeating supplied fields: '+name,t=>using(t,async f=>{
 await facts(f);const a=await f.say(first),b=await f.say(second);
 assert.match(f.reply(b),/• Horario solicitado:/);assert.match(f.reply(b),/¿Confirmas que estos datos son correctos/);
 assert.doesNotMatch(f.reply(b),/Me falta|Escríbeme el día y la hora juntos/);assert.equal(f.entry(b),undefined);
 const final=await f.say('Sí'),entry=f.entry(final),p=entry.payload,projection=projectNativePreferenceParts(p.preferenceParts,p.sources.acceptance.at);
 assert.equal(p.preferenceParts.guard,MARIA_PREFERENCE_PARTS_GUARD);assert.equal(p.sources.preference,undefined);
 assert.deepEqual(new Set([p.preferenceParts.date.id,p.preferenceParts.time.id]),new Set([a.id,b.id]));
 for(const src of [p.preferenceParts.date,p.preferenceParts.time]){assert.equal(src.text,src.id===a.id?first:second);assert.equal(src.phone,final.phone);assert.equal(src.line,final.line);assert.equal(src.fromMe,false);}
 assert.equal(projection.requestedDate,date);assert.equal(projection.requestedTime,time);assert.equal(entry.requestHash,registrationHash(p));
 let writes=0;const result=await drainProgramRegistrations(f.store,f.config,f.transport(async(_url,options)=>{writes++;const body=JSON.parse(options.body);return {ok:true,json:async()=>receipt(f,body)};}),()=>{throw Error('NO_TECHNICIAN_ROUTING');});
 assert.equal(result.persisted,1);assert.equal(writes,1);assert.equal(f.entry(final).status,'SAVED');
 assert.equal(f.entry(final).receipt.schedule.startAt,new Date(date+'T'+time+':00.000-05:00').toISOString());assert.equal(f.entry(final).receipt.schedule.technicianId,null);assert.equal(f.entry(final).receipt.schedule.endAt,null);
}));
for(const [change,wanted] of [['A las 11 am','11:00'],['El domingo 25 de octubre','10:00']])test('changed fragment invalidates delivered summary and retains the other original: '+change,t=>using(t,async f=>{
 const prior=await parts(f),oldSummary=f.row(prior.time).mid,correction=await f.say(change);
 assert.match(f.reply(correction),/¿Confirmas que estos datos son correctos/);assert.equal(f.entry(correction),undefined);assert.notEqual(f.row(correction).mid,oldSummary);
 const final=await f.say('Correcto'),p=f.entry(final).payload,projection=projectNativePreferenceParts(p.preferenceParts,p.sources.acceptance.at);
 assert.equal(projection.requestedTime,wanted);assert.equal(p.summaryConfirmation.mid,f.row(correction).mid);
 assert.equal(change.startsWith('A las')?p.preferenceParts.time.id:p.preferenceParts.date.id,correction.id);
 assert.equal(change.startsWith('A las')?p.preferenceParts.date.id:p.preferenceParts.time.id,change.startsWith('A las')?prior.date.id:prior.time.id);
}));
for(const phrase of ['Sí, esos datos están correctos.','Sí, todos los datos están correctos','Confirmo que esos datos son correctos'])test('natural data agreement confirms only the revised delivered v4 summary with separate native day and corrected 2pm: '+phrase,t=>using(t,async f=>{
 const prior=await parts(f),oldMid=f.row(prior.time).mid,corrected=await f.say('A las dos de la tarde');assert.match(f.reply(corrected),/2:00 p\. m\./);assert.equal(f.entry(corrected),undefined);
 const final=await f.say(phrase),entry=f.entry(final);assert.ok(entry);const p=entry.payload;assert.equal(p.summaryConfirmation.mid,f.row(corrected).mid);assert.notEqual(p.summaryConfirmation.mid,oldMid);assert.equal(p.sources.acceptance.text,phrase);assert.equal(p.preferenceParts.date.id,prior.date.id);assert.equal(p.preferenceParts.time.id,corrected.id);assert.equal(p.slots.preference,'24/10/2026 a las 2:00 p. m.');
 let writes=0;await drainProgramRegistrations(f.store,f.config,f.transport(async(_url,opts)=>{writes++;return {ok:true,json:async()=>receipt(f,JSON.parse(opts.body))};}));assert.equal(writes,1);assert.equal(f.entry(final).status,'SAVED');assert.equal(f.entry(final).receipt.schedule.startAt,'2026-10-24T19:00:00.000Z');assert.equal(f.entry(final).receipt.schedule.technicianId,null);
}));
for(const change of ['A las 11 am','El domingo 25 de octubre'])test('single-source v1 can receive an explicit one-field correction with both originals retained: '+change,t=>using(t,async f=>{
 await facts(f);const complete=await f.say('El sábado 24 de octubre a las 10 am');assert.match(f.reply(complete),/¿Confirmas/);
 const correction=await f.say(change);assert.match(f.reply(correction),/¿Confirmas/);
 const final=await f.say('Listo'),p=f.entry(final).payload;
 assert.ok(p.preferenceParts);assert.equal(p.sources.preference,undefined);assert.equal([p.preferenceParts.date.id,p.preferenceParts.time.id].includes(complete.id),true);
 assert.equal([p.preferenceParts.date.id,p.preferenceParts.time.id].includes(correction.id),true);
}));
for(const invalid of ['A las 10','A las 25:00','A las 9:65 am','A las dos','Me sirve a las dos','A las doce de la mañana','Mejor a las 13 de la mañana','Entre las diez y las once de la mañana','No puedo a las diez de la mañana','Si puedo a las dos de la tarde'])test('an ambiguous or invalid later hour cannot retain an older confirmed summary: '+invalid,t=>using(t,async f=>{
 await parts(f);const bad=await f.say(invalid);assert.match(f.reply(bad),/A qué hora|hora.*mañana o en la tarde/);assert.equal(f.entry(bad),undefined);
 const yes=await f.say('Sí');assert.equal(f.entry(yes),undefined);assert.match(f.reply(yes),/A qué hora|hora.*mañana o en la tarde/);
 const corrected=await f.say('A las 11 am');assert.match(f.reply(corrected),/11:00 a\. m\./);const final=await f.say('Sí');assert.equal(f.entry(final).payload.preferenceParts.time.id,corrected.id);
}));
for(const kind of ['stored-time-text','source-phone','source-line','native-time-text'])test('part provenance is rechecked before any adapter call: '+kind,t=>using(t,async f=>{
 await parts(f);const final=await f.say('Sí'),key='maria-registration:'+f.state(final).caseId,entry=f.entry(final);
 if(kind!=='native-time-text'){
  if(kind==='stored-time-text')entry.payload.preferenceParts.time.text='A las 11 am';
  if(kind==='source-phone')entry.payload.preferenceParts.time.phone='573000000002';
  if(kind==='source-line')entry.payload.preferenceParts.time.line=f.config.lines[1].phone;
  entry.requestHash=registrationHash(entry.payload);f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(entry),key);
 }
 let calls=0;const transport=f.transport(async()=>{calls++;return {ok:true,json:async()=>receipt(f,entry.payload)};});
 if(kind==='native-time-text'){const read=transport.request;transport.request=async(...args)=>{const result=await read(...args);for(const row of result.messages?.records||[])if(row.key.id===entry.payload.preferenceParts.time.id)row.message.conversation='A las 11 am';return result;};}
 const result=await drainProgramRegistrations(f.store,f.config,transport);assert.equal(calls,0);assert.equal(result.persisted,0);assert.equal(f.entry(final).status,'REVIEW');
}));
for(const field of ['date','time'])test('receipt cannot substitute a native part source: '+field,t=>using(t,async f=>{
 await parts(f);const final=await f.say('Sí'),entry=f.entry(final),r=receipt(f,entry.payload);r.schedule.preferenceParts[field].id='SYNTHETIC_FOREIGN_SOURCE';
 assert.equal(clientRequestedScheduleReceiptMatches(entry.payload,r),false);
 await drainProgramRegistrations(f.store,f.config,f.transport(async()=>({ok:true,json:async()=>r})));assert.equal(f.entry(final).status,'UNCERTAIN');
}));
test('a full single native preference keeps its original v1 contract',t=>using(t,async f=>{
 await facts(f);const full=await f.say('El sábado 24 de octubre a las 10 am');const final=await f.say('Sí'),p=f.entry(final).payload;
 assert.equal(p.preferenceParts,undefined);assert.equal(p.sources.preference.id,full.id);assert.equal(p.slots.preference,'El sábado 24 de octubre a las 10 am');
}));
for(const value of ['10','13 pm','25:00','9:65 am','de 9 a 11 am','antes de las 10 am','no a las 10 am'])test('time-only grammar never invents a meridian, range or impossible clock: '+value,()=>assert.equal(nativePreferenceTime(value),null));
for(const [text,clock] of [
 ['Me sirve a las 10 de la mañana','10:00'],['a las diez de la mañana','10:00'],['a las dos de la tarde','14:00'],
 ['A la una de la tarde','13:00'],['La hora correcta es 10:30 de la mañana','10:30'],['mejor a las 2:45 de la tarde','14:45'],
 ['12 am','00:00'],['12 pm','12:00'],
])test('natural exact clock keeps its explicit meridian: '+text,()=>assert.equal(nativePreferenceTime(text),clock));
for(const text of [
 'a las diez','a las 10','a las trece de la tarde','a las 13 de la mañana','a las 0 de la mañana','a las 10:65 de la mañana',
 'a las doce de la mañana','a las 12 de la tarde','a las doce de la noche','a las diez:30 de la mañana',
 'el asesor dijo a las diez de la mañana','me contaron a las dos de la tarde','si puedo a las dos de la tarde',
 'no puedo a las diez de la mañana','entre las diez y once de la mañana','a las diez o a las dos de la tarde',
 'a las diez de la mañana hasta las once','"a las dos de la tarde"',
])test('natural clock does not infer an ambiguous, impossible or relayed hour: '+text,()=>assert.equal(nativePreferenceTime(text),null));
