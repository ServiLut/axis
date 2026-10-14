import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {acceptsOrdinaryQuotation,literalProgramPreference,drainProgramRegistrations,registrationHash,registrationStatus,MARIA_PROGRAM_FORM_BATCH_GUARD,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';

const actorId='7508385b-536e-4aa2-8137-d734dfc900ef',orderId='85c47fc8-5314-4f68-a8d6-dde112640f5d';
function fixture(){
 const start=Math.floor((Date.now()-30000)/1000)*1000,store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'synthetic-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId,startsAt:start-60000,expiresAt:start+86400000}};
 const engine=new Engine(store,config);let sequence=0,writes=0,payload;
 const event=(text,patch={})=>({id:'FASTFACT'+ ++sequence,phone:'573001112233',at:start+sequence*1000,line:config.lines[0].phone,fromMe:false,kind:'text',text,...patch});
 const process=async e=>{store.enqueue(e);await engine.process(e);return e;},turn=async(text,patch={})=>process(event(text,patch));
 const row=e=>store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const deliver=e=>{const reply=row(e);assert.ok(reply,e.id);const mid='MID'+e.id;store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,reply.id);store.recordFirstBotReply({...reply,mid},mid,config.bot,e.at);store.delivery(mid,e.line,'DELIVERED');store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+reply.id);return store.open(reply.body);};
 const transport={verifyLine:async()=>{},currentAttention:async()=>({complete:true,sources:store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(phone,at)=>({complete:true,sources:store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(phone,at)}),request:async(line,path,body)=>{
  const id=body.where.key.id,inbound=store.db.prepare('SELECT body FROM events WHERE id=?').get(id),outbound=store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
  if(inbound){const e=store.open(inbound.body);return {messages:{records:[{key:{id,remoteJid:e.phone+'@s.whatsapp.net',fromMe:e.fromMe},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}
  if(outbound)return {messages:{records:[{key:{id,remoteJid:outbound.phone+'@s.whatsapp.net',fromMe:true},message:{conversation:store.open(outbound.body)},status:'DELIVERY_ACK'}]}};
  return {messages:{records:[]}};
 },fetcher:async(url,options)=>{assert.ok(!url.endsWith('/receipt'),'these cases have one definite write');writes++;payload=JSON.parse(options.body);return {ok:true,json:async()=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actorId,createdById:actorId,phone:payload.phone,persisted:true,orderId,caseId:payload.caseId,acceptanceId:payload.quote.acceptanceId,requestHash:registrationHash(payload),state:'NUEVO',scheduled:false,paymentRecorded:false})};}};
 const quote=async()=>{const first=await turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');deliver(first);return first;};
 const requested=async()=>{await quote();const acceptance=await turn('Sí');deliver(acceptance);return acceptance;};
 const batch=async events=>{for(const e of events)store.enqueue(e);for(const e of events)await engine.process(e);};
 return {store,config,engine,event,turn,process,row,deliver,transport,quote,requested,batch,stats:()=>({writes,payload})};
}

test('separate bare facts in one pending batch retain both sources after the delivered joint prompt',async()=>{
 const f=fixture();try{
  await f.requested();const name=f.event('Persona Sintética'),address=f.event('Calle 50 # 42-18 apartamento 301');await f.batch([name,address]);
  const pi=f.store.conversation(address.phone).state.programIntake;assert.equal(pi.customerName,name.text);assert.equal(pi.address,address.text);assert.equal(pi.nameSource.id,name.id);assert.equal(pi.addressSource.id,address.id);assert.equal(pi.stage,'confirm');assert.match(f.deliver(address),/¿Confirmas/);assert.equal(registrationStatus(f.config,f.store).prepared,0);
  const confirmation=await f.turn('Confirmo');await drainProgramRegistrations(f.store,f.config,f.transport);await drainProgramRegistrations(f.store,f.config,f.transport);
  assert.equal(f.stats().writes,1);assert.equal(f.stats().payload.sources.customerName.id,name.id);assert.equal(f.stats().payload.sources.address.id,address.id);assert.equal(f.stats().payload.quote.acceptanceId,confirmation.id);assert.equal(registrationStatus(f.config,f.store).saved,1);
 }finally{f.store.close();}
});

test('facts and yes sent after price acceptance still require a newly delivered summary and literal confirmation',async()=>{
 const f=fixture();try{
  const firstAcceptance=await f.requested(),name=f.event('Persona Sintética'),address=f.event('Calle 50 # 42-18 apartamento 301'),yes=f.event('Sí');await f.batch([name,address,yes]);
  assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.equal(f.store.conversation(yes.phone).state.programIntake.stage,'confirm');assert.match(f.deliver(yes),/¿Confirmas/);
  const final=await f.turn('Sí');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);assert.equal(f.stats().payload.quote.acceptanceId,final.id);assert.notEqual(final.id,firstAcceptance.id);
 }finally{f.store.close();}
});

test('the final gratitude in a facts batch preserves the facts and asks a summary without accepting it',async()=>{
 for(const finalCourtesy of ['Gracias','Hola, buenas tardes, ¿cómo estás?']){const f=fixture();try{
  await f.requested();const greeting=f.event('Buenas tardes'),name=f.event('Persona Sintética'),address=f.event('Calle 50 # 42-18 apartamento 301'),thanks=f.event(finalCourtesy);await f.batch([greeting,name,address,thanks]);
  const pi=f.store.conversation(thanks.phone).state.programIntake;assert.equal(pi.customerName,name.text);assert.equal(pi.nameSource.id,name.id);assert.equal(pi.addressSource.id,address.id);assert.equal(pi.stage,'confirm');assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.match(f.deliver(thanks),/¿Confirmas/);
  await f.turn('Sí');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);
 }finally{f.store.close();}}
});

test('porfavor is a literal politeness spelling and does not grant conditional or urgent-date consent',()=>{
 assert.equal(literalProgramPreference('Para hoy en la tarde porfavor'),'hoy en la tarde porfavor');assert.equal(literalProgramPreference('Sí, mañana porfavor'),'mañana porfavor');assert.equal(acceptsOrdinaryQuotation('Sí, mañana porfavor'),true);
 for(const text of ['Si mañana porfavor','Sí, si hay disponibilidad hoy porfavor','Urgente porfavor'])assert.equal(acceptsOrdinaryQuotation(text),false,text);
 assert.equal(literalProgramPreference('Urgente porfavor'),null);
});

test('registration status exposes the installed form-batch guard only in its own company scope',()=>{
 const f=fixture();try{assert.equal(registrationStatus(f.config,f.store).formBatchGuard,MARIA_PROGRAM_FORM_BATCH_GUARD);assert.equal(registrationStatus({...f.config,company:'servicio-tecnico'},f.store).formBatchGuard,null);}finally{f.store.close();}
});

test('known native facts earlier in the same WhatsApp second do not become a newer customer turn',async()=>{
 const f=fixture();try{
  await f.requested();f.deliver(await f.turn('Persona Sintética'));const address=await f.turn('Calle 50 # 42-18 apartamento 301');f.deliver(address);const final=await f.turn('Confirmo',{at:address.at});
  await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);assert.equal(registrationStatus(f.config,f.store).review,0);assert.equal(f.stats().payload.quote.acceptanceId,final.id);assert.equal(f.stats().payload.sources.address.id,address.id);
 }finally{f.store.close();}
});

test('an unknown native source in the acceptance second still blocks registration',async()=>{
 const f=fixture();try{
  await f.requested();f.deliver(await f.turn('Persona Sintética'));const address=await f.turn('Calle 50 # 42-18 apartamento 301');f.deliver(address);const final=await f.turn('Confirmo',{at:address.at});
  const read=f.transport.currentCustomerActivity;f.transport.currentCustomerActivity=async(...args)=>{const snapshot=await read(...args);return {...snapshot,sources:[...snapshot.sources,{id:'UNOBSERVED_SAME_SECOND',line:final.line,at:final.at}]};};
  await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).review,1);
 }finally{f.store.close();}
});

test('an ambiguous labelled name asks for one clear value and can finish after its delivered summary',async()=>{
 const f=fixture();try{
  await f.requested();const ambiguous=await f.turn('Mi nombre es Juan Pérez y mi nombre es Carlos Ruiz y mi dirección es Calle 50 # 42-18');
  assert.equal(f.store.conversation(ambiguous.phone).state.programIntake.customerName,undefined);assert.match(f.deliver(ambiguous),/nombre completo/);await f.turn('Sí');assert.equal(registrationStatus(f.config,f.store).prepared,0);
  const clear=await f.turn('Nombre: Persona Sintética');assert.equal(f.store.conversation(clear.phone).state.programIntake.customerName,'Persona Sintética');assert.match(f.deliver(clear),/¿Confirmas/);
  const final=await f.turn('Sí');assert.equal(f.row(final),undefined);await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);assert.equal(f.stats().payload.customerName,'Persona Sintética');assert.equal(f.stats().payload.sources.customerName.id,clear.id);assert.equal(f.stats().payload.quote.acceptanceId,final.id);
 }finally{f.store.close();}
});

test('two different bare names in one batch stay ambiguous until a new clear source',async()=>{
 const f=fixture();try{
  await f.requested();const first=f.event('Persona Sintética'),second=f.event('Otro Nombre'),address=f.event('Calle 50 # 42-18 apartamento 301');await f.batch([first,second,address]);
  assert.equal(f.store.conversation(address.phone).state.programIntake.customerName,undefined);assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.match(f.deliver(address),/nombre completo/);
 }finally{f.store.close();}
});

test('the same-second exception preserves native mismatch and human takeover blockers',async()=>{
 for(const variant of ['edited-fact','human']){const f=fixture();try{
  await f.requested();f.deliver(await f.turn('Persona Sintética'));const address=await f.turn('Calle 50 # 42-18 apartamento 301');f.deliver(address);await f.turn('Confirmo',{at:address.at});
  if(variant==='edited-fact'){const request=f.transport.request;f.transport.request=async(...args)=>{const response=await request(...args);if(args[2].where.key.id===address.id)response.messages.records[0].message.conversation='Calle 99 # 10-10';return response;};}
  else{const read=f.transport.currentAttention;f.transport.currentAttention=async()=>({...await read(),sources:[{id:'UNKNOWN_STAFF',line:address.line}]});}
  await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,0,variant);assert.equal(registrationStatus(f.config,f.store).review,1,variant);if(variant==='human')assert.equal(f.store.conversation(address.phone).hold,1);
 }finally{f.store.close();}}
});
