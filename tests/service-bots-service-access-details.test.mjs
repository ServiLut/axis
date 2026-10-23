import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {drainProgramRegistrations} from '../automation/service-bots/maria-program.mjs';
import {customerDeferralRequested} from '../automation/service-bots/customer-deferral.mjs';
import {serviceAccessFacts} from '../automation/service-bots/service-access-details.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD,projectClientRequestedSchedule} from '../automation/service-bots/client-requested-schedule.mjs';

const start=Date.parse('2026-10-23T18:00:00.000Z');
async function using(t,fn,fixtureStart=start){t.mock.timers.enable({apis:['Date'],now:fixtureStart});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at),{start:fixtureStart});try{await fn(f);}finally{f.store.close();}}
const native=text=>({kind:'text',fromMe:false,text});
for(const line of ['573126944997','573126938721'])test('new '+line+' intake retains Bello, collects access separately, confirms and makes one local write',t=>using(t,async f=>{
 const turn=text=>f.turn(text,{line});
 const quote=await turn('Quiero cotizar cucarachas en apartamento de 60 m2 con 3 habitaciones en Bello.');assert.match(f.deliver(quote),/149\.000/);
 const yes=await turn('Sí');assert.match(f.deliver(yes),/barrio.*sector.*vereda/);assert.match(f.reply(yes),/unidad.*conjunto.*edificio/);assert.doesNotMatch(f.reply(yes),/El municipio/);
 f.deliver(await turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301'));
 const barrio=await turn('Barrio Niquía');assert.doesNotMatch(f.deliver(barrio),/Tu nombre|La dirección|El barrio/);assert.match(f.reply(barrio),/unidad/);
 const unit=await turn('Conjunto Los Arces');assert.match(f.deliver(unit),/• Barrio Niquía\n• Conjunto Los Arces/);assert.match(f.reply(unit),/¿Confirmas/);assert.equal(f.state(unit).slots.location,'bello');assert.equal(f.state(unit).programIntake.address,'Calle 50 # 42-18 apartamento 301');
 const confirm=await turn('Sí, confirmo que los datos son correctos.');assert.equal(f.entry(confirm).status,'PENDING');assert.equal(f.entry(confirm).payload.accessDetails.unit.source.id,unit.id);
 let writes=0;const transport=f.transport(async(_url,options)=>{writes++;return {ok:true,json:async()=>f.receipt(JSON.parse(options.body))};});
 await drainProgramRegistrations(f.store,f.config,transport);await drainProgramRegistrations(f.store,f.config,transport);
 assert.equal(writes,1);assert.equal(f.entry(confirm).status,'SAVED');
}));
test('the screenshot postponement is not acceptance and does not launch a form',t=>using(t,async f=>{
 f.deliver(await f.turn('Quiero cotizar cucarachas en apartamento de 60 m2 con 3 habitaciones en Bello.'));
 const e=await f.turn('Mañana le confirmo el día, muchas gracias por la información');assert.equal(f.state(e).customerDeferral.active,true);assert.doesNotMatch(f.reply(e),/nombre|dirección|compárteme|¿Confirmas/);assert.equal(f.state(e).programIntake,undefined);
}));
test('a new turn on an earlier quotation reuses its sourced access facts without replay or repeated fields',t=>using(t,async f=>{
 const quote=await f.turn('Cucarachas en apartamento de 3 habitaciones en Bello, barrio Niquía, unidad Los Arces');f.deliver(quote);f.deliver(await f.turn('Sí'));
 const e=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301',{at:Date.parse('2026-10-23T17:10:00.000Z')});
 assert.match(f.reply(e),/• barrio Niquía\n• unidad Los Arces/);assert.match(f.reply(e),/¿Confirmas/);assert.doesNotMatch(f.reply(e),/El barrio|El nombre de la unidad|El municipio/);assert.equal(f.state(e).caseId,'fumigacion:'+quote.id);assert.equal(f.entry(e),undefined);
},Date.parse('2026-10-22T18:10:00.000Z')));
test('access collection preserves the requested date/time and reaches one exact scheduled receipt',t=>using(t,async f=>{
 f.config.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:start-1000};f.config.clientRequestedSchedule={enabled:true,startsAt:start-1000,guard:MARIA_CLIENT_SCHEDULE_GUARD};
 f.deliver(await f.turn('Cucarachas en apartamento de 3 habitaciones en Bello.'));f.deliver(await f.turn('Sí'));
 f.deliver(await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301'));
 f.deliver(await f.turn('Barrio Niquía'));const noUnit=await f.turn('No hay unidad');assert.ok(f.row(noUnit));f.deliver(noUnit);
 const timing=await f.turn('Mañana a las 9 de la mañana');assert.match(f.deliver(timing),/24\/10\/2026 a las 9:00 a\. m\./);assert.match(f.reply(timing),/No hay unidad/);
 const accepted=await f.turn('Sí, confirmo que los datos son correctos.');let writes=0;
 await drainProgramRegistrations(f.store,f.config,f.transport(async(_url,options)=>{writes++;const p=JSON.parse(options.body),v=projectClientRequestedSchedule(p.slots.preference,p.sources.preference.at,p.sources.acceptance.at),schedule={guard:MARIA_CLIENT_SCHEDULE_GUARD,requestedDate:v.requestedDate,requestedTime:v.requestedTime,visitAt:v.requestedDate+'T05:00:00.000Z',startAt:v.requestedDate+'T14:00:00.000Z',endAt:null,technicianId:null,preferenceLiteral:p.slots.preference,preferenceSourceId:p.sources.preference.id,preferenceSourceAt:p.sources.preference.at,summaryMid:p.summaryConfirmation.mid,acceptanceId:p.sources.acceptance.id,verifiedCurrentFields:true};return {ok:true,json:async()=>({...f.receipt(p),state:'PROGRAMADO',scheduled:true,schedulingKind:'client-requested-without-technician',schedule})};}));
 assert.equal(writes,1);assert.equal(f.entry(accepted).status,'SAVED');assert.equal(f.entry(accepted).receipt.schedule.requestedTime,'09:00');
}));
test('a changed native access source after confirmation prevents a business write',t=>using(t,async f=>{
 f.deliver(await f.turn('Cucarachas en apartamento de 3 habitaciones en Bello.'));f.deliver(await f.turn('Sí'));f.deliver(await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301'));f.deliver(await f.turn('Barrio Niquía'));const unit=await f.turn('Unidad Los Arces');f.deliver(unit);const accepted=await f.turn('Sí, confirmo que los datos son correctos.');
 f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal({...unit,text:'Unidad Otro Lugar'}),unit.id);let writes=0;
 await drainProgramRegistrations(f.store,f.config,f.transport(async()=>{writes++;throw Error('NO_WRITE_ALLOWED');}));assert.equal(writes,0);assert.equal(f.entry(accepted).status,'REVIEW');
}));
for(const text of ['Mañana le confirmo el día, muchas gracias por la información','Mañana te confirmo la fecha','Le confirmo el horario mañana'])test('bounded date postponement: '+text,()=>assert.equal(customerDeferralRequested(native(text)),true));
for(const text of ['Confirmo el servicio para mañana a las 9','No, mañana le confirmo el día','Mi vecina dijo mañana le confirmo el día','Mañana le confirmo el día si cuesta menos'])test('not a direct date postponement: '+text,()=>assert.equal(customerDeferralRequested(native(text)),false));
test('absence is explicit and an entire-complex request cannot be captured as access',()=>{
 assert.deepEqual(serviceAccessFacts(native('Barrio Niquía, no hay unidad')),{neighborhood:'Barrio Niquía',unit:'no hay unidad'});
 for(const text of ['Conjunto completo Los Arces','Unidad por confirmar','Unidad Los Arces, quiero fumigar toda la unidad']){const v=serviceAccessFacts(native(text));if(text.includes(', quiero'))assert.ok(v.unit);else assert.equal(v.unit,undefined);}
 assert.deepEqual(serviceAccessFacts({...native('Barrio Niquía'),forwarded:true}),{});assert.deepEqual(serviceAccessFacts({...native('Unidad Los Arces'),quotedId:'OTHER'}),{});
});
