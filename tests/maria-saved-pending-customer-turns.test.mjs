import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,SANDRA,HILARY} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {drainProgramRegistrations,registrationHash,registrationStatus,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';

const actor='7508385b-536e-4aa2-8137-d734dfc900ef',order='85c47fc8-5314-4f68-a8d6-dde112640f5d',phone='573001112233';
function fixture({preference=true}={}){
 const now=Date.now(),start=Math.floor((now-30000)/1000)*1000,store=new Store(':memory:','fumigacion',randomBytes(32));
 store.importKnowledge(approvedBusinessPriceSchedule());
 const business=BUSINESSES.fumigacion,blue=business.phones[0],participants=[...TESA_BOT_PHONES,HILARY];
 const config={company:'fumigacion',...business,enabled:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:start-60000,
  lines:business.phones.map((phone,i)=>({phone,instance:'isolated-pending-'+i})),
  operationalLineScope:{version:'authorized-fumigacion-blue-only-v1',company:'fumigacion',activeLines:[blue],suspendedLines:[business.phones[1]],authorizedAt:new Date(start-59000).toISOString(),authorizationSource:'direct-user-20261009-red-block-24h'},
  mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:actor,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:start+86400000},
  tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:blue,activatedAt:start-60000,allowedParticipantPhones:[HILARY],verifiedMembership:{owner:blue,ownerOpen:true,verifiedAt:now,expiresAt:now+300000,sourceHash:'a'.repeat(64),participantPhones:participants,participantBindings:participants.map(p=>({jid:p+'@s.whatsapp.net',phone:p}))}}};
 const engine=new Engine(store,config);let count=0,writes=0;
 const turn=async(text,patch={})=>{const e={id:'SAVED_PENDING_'+ ++count,phone,line:blue,fromMe:false,kind:'text',text,at:start+count*1000,...patch};store.enqueue(e);await engine.process(e);return e;};
 const reply=e=>{const r=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return r&&store.open(r.body);};
 const delivered=e=>{const r=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');assert.ok(r,e.text);const mid='MID_'+e.id;store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);store.recordFirstBotReply({...r,mid},mid,config.bot,e.at);store.delivery(mid,e.line,'DELIVERED');store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+r.id);return store.open(r.body);};
 const receipt=p=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actor,createdById:actor,phone:p.phone,persisted:true,orderId:order,caseId:p.caseId,acceptanceId:p.quote.acceptanceId,requestHash:registrationHash(p),state:'NUEVO',scheduled:false,paymentRecorded:false});
 const transport={verifyLine:async()=>{},currentAttention:async()=>({complete:true,sources:store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(phone,at)=>({complete:true,sources:store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(phone,at)}),request:async(line,path,body)=>{
  const id=body.where.key.id,inbound=store.db.prepare('SELECT body FROM events WHERE id=?').get(id),out=store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
  if(inbound){const e=store.open(inbound.body);return {messages:{records:[{key:{id,fromMe:e.fromMe,remoteJid:e.phone+'@s.whatsapp.net'},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}
  return {messages:{records:out?[{key:{id,fromMe:true,remoteJid:out.phone+'@s.whatsapp.net'},message:{conversation:store.open(out.body)},status:'DELIVERY_ACK',messageTimestamp:start/1000}]:[]}};
 },fetcher:async(url,opts)=>{writes++;return {ok:true,json:async()=>receipt(JSON.parse(opts.body))};}};
 const save=async()=>{
  delivered(await turn('Tengo cucarachas en apartamento de 42 mts2 en Itagüí. ¿Cuánto cuesta?'));
  delivered(await turn(preference?'Sí, agéndame para mañana en la tarde':'Sí'));
  delivered(await turn('Nombre: Juan Pérez\nDirección: Calle 50 # 42-18 apartamento 301'));
  const accepted=await turn('Confirmo');await drainProgramRegistrations(store,config,transport,routeCaseQuestion);
  assert.equal(registrationStatus(config,store).saved,1);assert.equal(writes,1);
  return {accepted,caseId:store.conversation(phone).state.caseId};
 };
 return {store,config,engine,turn,reply,delivered,save,transport,get writes(){return writes;},setState:change=>store.saveConversation(phone,{...store.conversation(phone).state,...change})};
}
function pendingQuestions(f){return f.store.db.prepare('SELECT * FROM tesa_questions').all().length;}
function cancellationMarkers(f){return f.store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'maria-saved-cancellation-request:%'").all().map(row=>({...row,value:f.store.open(row.value)}));}

test('a new direct status turn after a saved own order acknowledges the unconfirmed schedule without another operational question',async()=>{
 for(const text of ['¿Y entonces?','¿Ya hay horario?','¿Cuándo sería el servicio?']){const f=fixture();try{
  const {caseId}=await f.save(),questions=pendingQuestions(f),before=f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+caseId).value);
  const e=await f.turn(text);assert.equal(f.reply(e),'Aún no tengo confirmado el horario del servicio.');
  assert.equal(pendingQuestions(f),questions);assert.equal(f.writes,1);assert.equal(f.store.conversation(phone).state.awaitingHumanReview,true);
  assert.deepEqual(f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+caseId).value),before);
 }finally{f.store.close();}}
});

test('an unequivocal new cancellation is a durable request and one private exception, never a cancelled order',async()=>{
 const f=fixture();try{
  const {caseId}=await f.save(),questions=pendingQuestions(f),before=f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+caseId).value);
  const e=await f.turn('Por favor cancela mi servicio');
  assert.match(f.reply(e),/Recibí tu solicitud de cancelación/);assert.match(f.reply(e),/no tengo confirmada la cancelación/);
  const markers=cancellationMarkers(f);assert.equal(markers.length,1);assert.equal(markers[0].value.state,'REQUEST');assert.equal(markers[0].value.orderId,order);assert.equal(markers[0].value.sources[0].id,e.id);assert.equal(markers[0].value.sources[0].text,e.text);
  assert.equal(pendingQuestions(f),questions);assert.equal(f.writes,1);assert.equal(f.store.conversation(phone).hold,0);assert.equal(f.store.conversation(phone).state.awaitingHumanReview,true);
  assert.deepEqual(f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+caseId).value),before);
  const alerts=f.store.db.prepare('SELECT * FROM outbox WHERE phone=? AND internal=1').all(SANDRA);assert.equal(alerts.length,1);assert.match(f.store.open(alerts[0].body),/cancelación/);assert.match(f.store.open(alerts[0].body),/No he cancelado la orden/);
  await f.engine.process(e);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE phone=? AND internal=1').get(SANDRA).n,1);
  const repeat=await f.turn('Quiero cancelar mi servicio');assert.match(f.reply(repeat),/solicitud de cancelación/);
  assert.equal(cancellationMarkers(f).length,1);assert.equal(cancellationMarkers(f)[0].value.sources.length,2);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE phone=? AND internal=1').get(SANDRA).n,1);
  const status=await f.turn('¿Y entonces?');assert.match(f.reply(status),/solicitud de cancelación/);assert.doesNotMatch(f.reply(status),/asesora|confirmado el horario/i);
 }finally{f.store.close();}
});

test('quoted, forwarded, conditional, ambiguous and unrelated review text cannot create cancellation authority',async()=>{
 const probes=[['Quiero cancelar mi servicio',{forwarded:true}],['Cancela mi servicio',{quotedId:'OTHER_QUOTED'}],['Si no hay horario quiero cancelar mi servicio',{}],['No quiero cancelar mi servicio',{}],['Mi vecino dijo cancela mi servicio',{}],['¿Puedo cancelar sin pagar?',{}],['Cancelación',{}],['Cancela mi otro servicio',{}],['Cancela mi servicio de la semana pasada',{}],['Por favor cancela mi servicio y devuélveme el dinero',{}],['¿Es seguro para mis mascotas?',{}],['¿Cómo pago?',{}],['Necesito la garantía',{}],['Si no confirman, cancélalo',{}],['No lo canceles',{}],['¿Cancélalo?',{}],['Cancélalo',{forwarded:true}],['Cancélalo',{quotedId:'OTHER_QUOTED'}]];
 for(const [text,patch] of probes){const f=fixture();try{
  await f.save();const e=await f.turn(text,patch);assert.equal(cancellationMarkers(f).length,0,text);assert.ok(!String(f.reply(e)||'').includes('Recibí tu solicitud de cancelación'),text);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-saved-review-alert:%'").get().n,0,text);assert.equal(f.writes,1);
 }finally{f.store.close();}}
});

test('a singular direct cancellation imperative uses only the verified current saved pending case',async()=>{
 for(const text of ['Cancélalo','Cancélalo por favor','Por favor cancélenlo','Cancele el servicio','No quiero mi servicio']){const f=fixture();try{
  await f.save();const e=await f.turn(text);assert.match(f.reply(e),/solicitud de cancelación/,text);assert.equal(cancellationMarkers(f).length,1,text);assert.equal(cancellationMarkers(f)[0].value.sources[0].text,text);assert.equal(f.writes,1);
 }finally{f.store.close();}}
});

test('holds, wrong line/case, altered receipt, missing saved entry and unrelated review cannot answer as a saved pending operation',async()=>{
 for(const kind of ['hold','line','case','receipt','payload','no-operation','answered-operation','no-entry','warranty','expired']){for(const text of ['¿Y entonces?','Cancela mi servicio']){const f=fixture();try{
  const {caseId}=await f.save(),patch={};
  if(kind==='hold')f.store.hold(phone,'STAFF_NATIVE');
  if(kind==='line')patch.line=f.config.lines[1].phone;
  if(kind==='case')f.setState({caseId:'fumigacion:OTHER_CASE'});
  if(kind==='receipt'){const key='maria-registration:'+caseId,r=f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value);r.receipt.createdById='59a1c111-0000-4000-a000-000000000001';f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(r),key);}
  if(kind==='payload'){const key='maria-registration:'+caseId,r=f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value);r.payload.quote.priceCop=99000;f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(r),key);}
  if(kind==='no-operation'){f.store.db.prepare('DELETE FROM tesa_outbox').run();f.store.db.prepare('DELETE FROM tesa_questions').run();f.store.db.prepare("DELETE FROM meta WHERE key LIKE 'maria-scheduling-review:%'").run();}
  if(kind==='answered-operation')f.store.db.prepare("UPDATE tesa_questions SET state='ANSWERED'").run();
  if(kind==='no-entry')f.store.db.prepare('DELETE FROM meta WHERE key=?').run('maria-registration:'+caseId);
  if(kind==='warranty')f.setState({requestedAfterServiceReview:{kind:'warranty',sourceId:'WARRANTY_NATIVE'}});
  if(kind==='expired')f.config.mariaProgram.expiresAt=Date.now()-1;
  const e=await f.turn(text,patch);assert.equal(f.reply(e),undefined,kind+text);assert.equal(cancellationMarkers(f).length,0,kind+text);assert.equal(f.writes,1);
 }finally{f.store.close();}}}
});

test('a saved own case taking its first preference never promises an unavailable adviser',async()=>{
 const f=fixture({preference:false});try{
  await f.save();const e=await f.turn('Mañana en la tarde');assert.equal(f.reply(e),'Aún no tengo confirmado el horario del servicio.');assert.equal(f.writes,1);
 }finally{f.store.close();}
});

test('an unrelated legacy pending question cannot swallow the new cancellation exception or change its historical source',async()=>{
 const f=fixture();try{
  const {caseId}=await f.save();f.store.importPendingQuestions({company:'fumigacion',source:'historical-test-import',entries:[{id:'OLD_OPERATOR_REQUEST',caseId,recipient:HILARY,topic:'historical-quotation',askedAt:'2026-10-01T18:00:00.000Z',answered:false}]});
  const legacy={...f.store.db.prepare("SELECT * FROM questions WHERE state='LEGACY_PENDING'").get()};
  const e=await f.turn('Cancélalo');assert.match(f.reply(e),/solicitud de cancelación/);assert.equal(cancellationMarkers(f).length,1);
  const alert=f.store.db.prepare('SELECT * FROM outbox WHERE phone=? AND internal=1').get(SANDRA);assert.ok(alert);assert.equal(alert.state,'READY');assert.equal(cancellationMarkers(f)[0].value.alertId,alert.id);
  assert.deepEqual({...f.store.db.prepare('SELECT * FROM questions WHERE id=?').get(legacy.id)},legacy);assert.equal(f.writes,1);
 }finally{f.store.close();}
});

test('a repeated cancellation preserves an existing uncertain or delivered private alert without another send attempt',async()=>{
 for(const state of ['UNCERTAIN','DELIVERED']){const f=fixture();try{
  await f.save();await f.turn('Cancélalo');const out=f.store.db.prepare('SELECT * FROM outbox WHERE phone=? AND internal=1').get(SANDRA);
  f.store.db.prepare('UPDATE outbox SET state=?,mid=? WHERE id=?').run(state,state==='DELIVERED'?'EXISTING_PRIVATE_MID':null,out.id);
  const before={...f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(out.id)};await f.turn('Por favor cancele el servicio');
  assert.deepEqual({...f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(out.id)},before);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE phone=? AND internal=1').get(SANDRA).n,1);assert.equal(cancellationMarkers(f)[0].value.sources.length,2);assert.equal(f.writes,1);
 }finally{f.store.close();}}
});
