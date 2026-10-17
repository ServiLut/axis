import test from 'node:test';import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {confirmsOrdinarySummaryData,acceptsOrdinaryQuotation,registrationStatus,registrationHash,drainProgramRegistrations,MARIA_SUMMARY_DATA_CONFIRMATION_GUARD} from '../automation/service-bots/maria-program.mjs';
const positive=['Sí, confirmo que los datos son correctos.','Los datos están bien.','Confirmo que mis datos son correctos','Todos los datos son correctos, gracias','Sí, los datos están correctos','Si, confirmo que los datos están bien. Muchas gracias.','Sí, esos datos están correctos.','Sí, todos los datos están correctos','Confirmo que esos datos son correctos','Estos datos están bien.'];
const negative=['Si los datos están bien','Si confirmo que los datos son correctos','Sí, si los datos son correctos','¿Los datos están bien?','No, los datos están bien','Los datos no son correctos','Los datos están bien, pero cambia la dirección','Mi mamá dijo: los datos están bien','"Los datos están bien"','Los datos están bien PRUEBA','Sí, confirmo que los datos son correctos PRUEBA','Los datos están bien para mañana','Los datos están bien, precio $129.000','Los datos están bien, ya pagué','Los datos están bien si hay cupo','Los datos están bien, Calle 30 # 20-10','Los datos están bien https://example.invalid','Creo que los datos están bien','Si esos datos están correctos','Sí, esos datos no están correctos','¿Esos datos están correctos?','Mi mamá dijo: esos datos están correctos','Confirmo que esos datos son correctos si hay cupo','Sí, esos datos están correctos, pero cambia la hora','Sí, esos datos están correctos mañana'];
for(const text of positive)test('closed data agreement is separate from initial price consent: '+text,()=>{assert.equal(confirmsOrdinarySummaryData(text),true);assert.equal(acceptsOrdinaryQuotation(text),false);});
for(const text of negative)test('a conditional, correction, third party, test suffix or extra fact is not data confirmation: '+text,()=>assert.equal(confirmsOrdinarySummaryData(text),false));
const withFixture=async(t,fn)=>{t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T21:20:00.000Z')});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at));try{await fn(f);}finally{f.store.close();}};
for(const text of positive)test('a real engine summary and later direct data agreement preserve exact payload/source: '+text,t=>withFixture(t,async f=>{
 const {quote,facts}=await f.summary();f.deliver(facts);const final=await f.turn(text),entry=f.entry(final),p=entry?.payload;assert.ok(entry);assert.equal(entry.confirmationKind,'delivered-summary-confirmed');assert.equal(entry.summaryOutboxId,f.row(facts).id);assert.equal(p.summaryConfirmation.guard,MARIA_SUMMARY_DATA_CONFIRMATION_GUARD);assert.equal(p.summaryConfirmation.mid,f.row(facts).mid);assert.equal(p.summaryConfirmation.text,f.reply(facts));assert.equal(p.summaryConfirmation.caseId,f.state(final).caseId);assert.equal(p.sources.acceptance.text,text);assert.equal(p.sources.acceptance.id,final.id);assert.equal(p.quote.acceptanceId,final.id);assert.equal(p.quote.sourceId,quote.id);assert.equal(entry.requestHash,registrationHash(p));assert.equal(registrationStatus(f.config,f.store).prepared,1);
}));
test('the full isolated write adapter accepts only the same delivered summary and exact final source',t=>withFixture(t,async f=>{
 const {facts}=await f.summary();f.deliver(facts);const final=await f.turn(positive[0]);let writes=0,payload;
 await drainProgramRegistrations(f.store,f.config,f.transport(async(_url,opts)=>{writes++;payload=JSON.parse(opts.body);return {ok:true,json:async()=>f.receipt(payload)};}));
 assert.equal(writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(payload.sources.acceptance.id,final.id);assert.equal(payload.sources.acceptance.text,positive[0]);assert.equal(f.state(final).programIntake.stage,'registered');assert.equal(f.state(final).programServiceId,f.receipt(payload).orderId);
}));
for(const mode of ['READY','ACCEPTED','NO_MID','NO_FIRST_PROOF','PROOF_MID','PROOF_LINE','PROOF_FUTURE','TEXT','CASE','quoted','forwarded','human','paused','defer'])test('new data confirmation cannot bypass own summary source and attention: '+mode,t=>withFixture(t,async f=>{
 const {facts}=await f.summary();if(!['READY','ACCEPTED'].includes(mode))f.deliver(facts);const row=f.row(facts),key='first-delivery:'+row.id;
 if(mode==='ACCEPTED')f.store.db.prepare("UPDATE outbox SET mid='UNCHECKED_MID',state='ACCEPTED' WHERE id=?").run(row.id);
 if(mode==='NO_MID')f.store.db.prepare('UPDATE outbox SET mid=NULL WHERE id=?').run(row.id);
 if(mode==='NO_FIRST_PROOF')f.store.db.prepare('DELETE FROM meta WHERE key=?').run(key);
 if(mode.startsWith('PROOF_')){const r=f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key),p=f.store.open(r.value);if(mode==='PROOF_MID')p.mid='DIFFERENT_MID';if(mode==='PROOF_LINE')p.line=f.config.lines[1].phone;if(mode==='PROOF_FUTURE')p.verifiedAt=facts.at+60000;f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(p),key);}
 if(mode==='TEXT')f.store.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(f.store.seal('Otro resumen no coincidente.'),row.id);
 if(mode==='CASE')f.store.db.prepare("UPDATE outbox SET case_id='fumigacion:OTHER_CASE' WHERE id=?").run(row.id);
 if(mode==='human')f.store.hold(facts.phone,'SYNTHETIC_STAFF_HOLD',true);
 if(mode==='paused')f.config.enabled=false;
 if(mode==='defer')await f.turn('Gracias, por ahora lo voy a pensar.');
 const final=await f.turn(positive[0],mode==='quoted'?{quotedId:'ANOTHER_NATIVE_SOURCE'}:mode==='forwarded'?{forwarded:true}:{});assert.equal(f.entry(final),undefined);assert.equal(registrationStatus(f.config,f.store).prepared,0);
}));
for(const text of [positive[0],...positive.slice(6)])test('data agreement cannot accept an initial quote or the preprovided-facts path without a summary: '+text,t=>withFixture(t,async f=>{
 const quote=await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí. Nombre: Laura Gómez\nDirección: Calle 50 # 42-18 apartamento 301');f.deliver(quote);const final=await f.turn(text);assert.equal(Boolean(f.state(final).quotedPrice?.accepted),false);assert.equal(f.entry(final),undefined);
}));
test('a later address correction requires its new summary, preserving the old source unchanged',t=>withFixture(t,async f=>{
 const {facts}=await f.summary();f.deliver(facts);const original=f.row(facts),body=original.body;const corrected=await f.turn('Dirección: Calle 60 # 30-20 apartamento 201');assert.match(f.reply(corrected),/¿Confirmas que estos datos son correctos/);const premature=await f.turn(positive[1]);assert.equal(f.entry(premature),undefined);f.deliver(corrected);const final=await f.turn(positive[0]);assert.equal(f.entry(final).payload.address,'Calle 60 # 30-20 apartamento 201');assert.equal(f.entry(final).payload.summaryConfirmation.mid,f.row(corrected).mid);assert.equal(f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(original.id).body,body);
}));
test('legacy short confirmation keeps its DTO shape without optional summary metadata',t=>withFixture(t,async f=>{const {facts}=await f.summary();f.deliver(facts);const final=await f.turn('Confirmo');assert.ok(f.entry(final));assert.equal(Object.hasOwn(f.entry(final).payload,'summaryConfirmation'),false);}));
test('a new summary presents one field per line and keeps scheduling pending',t=>withFixture(t,async f=>{
 const {facts}=await f.summary();assert.equal(f.reply(facts),['Revisa los datos de tu solicitud:','','• Servicio: cucarachas','• Inmueble informado: apartamento','• Habitaciones informadas: dos habitaciones','• Valor: $129.000','• Nombre: Laura Gómez','• Dirección: Calle 50 # 42-18 apartamento 301','• Municipio: itagui','','El horario sigue pendiente de coordinación.','','¿Confirmas que estos datos son correctos?'].join('\n'));
}));
test('an already delivered legacy paragraph remains exact and can support only its own later data agreement',t=>withFixture(t,async f=>{
 const {facts}=await f.summary(),row=f.row(facts),legacy='Registraré el servicio de cucarachas por $129.000 en Calle 50 # 42-18 apartamento 301, itagui, a nombre de Laura Gómez. ¿Confirmas que estos datos son correctos?';
 f.store.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(f.store.seal(legacy),row.id);f.deliver(facts);const stored=f.row(facts).body,final=await f.turn(positive[0]);assert.equal(f.entry(final).payload.summaryConfirmation.text,legacy);assert.equal(f.row(facts).body,stored);
}));
