import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {mariaIncidentalPetMention} from '../automation/service-bots/after-service.mjs';
import {drainProgramRegistrations,registrationHash,registrationStatus,MARIA_PROGRAM_PET_PRESENCE_GUARD,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';

const actorId='7508385b-536e-4aa2-8137-d734dfc900ef',orderId='85c47fc8-5314-4f68-a8d6-dde112640f5d';
function fixture(){
 const start=Math.floor((Date.now()-60000)/1000)*1000,store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'synthetic-pet-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId,startsAt:start-60000,expiresAt:start+86400000}};
 const engine=new Engine(store,config);let sequence=0,writes=0,payload;
 const event=(text,patch={})=>({id:'PET_SOURCE_'+ ++sequence,phone:'573001112233',at:start+sequence*1000,line:config.lines[0].phone,fromMe:false,kind:'text',text,...patch});
 const process=async e=>{store.enqueue(e);await engine.process(e);return e;},turn=async(text,patch={})=>process(event(text,patch));
 const row=e=>store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
 const deliver=e=>{const reply=row(e);assert.ok(reply,'reply for '+e.text);const mid='MID'+e.id;store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,reply.id);store.recordFirstBotReply({...reply,mid},mid,config.bot,e.at);store.delivery(mid,e.line,'DELIVERED');store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+reply.id);return store.open(reply.body);};
 const transport={verifyLine:async()=>{},currentAttention:async()=>({complete:true,sources:store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(phone,at)=>({complete:true,sources:store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(phone,at)}),request:async(line,path,body)=>{
  const id=body.where.key.id,inbound=store.db.prepare('SELECT body FROM events WHERE id=?').get(id),outbound=store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
  if(inbound){const e=store.open(inbound.body);return {messages:{records:[{key:{id,remoteJid:e.phone+'@s.whatsapp.net',fromMe:e.fromMe},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}
  if(outbound)return {messages:{records:[{key:{id,remoteJid:outbound.phone+'@s.whatsapp.net',fromMe:true},message:{conversation:store.open(outbound.body)},status:'DELIVERY_ACK'}]}};
  return {messages:{records:[]}};
 },fetcher:async(url,options)=>{assert.ok(!url.endsWith('/receipt'));writes++;payload=JSON.parse(options.body);return {ok:true,json:async()=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actorId,createdById:actorId,phone:payload.phone,persisted:true,orderId,caseId:payload.caseId,acceptanceId:payload.quote.acceptanceId,requestHash:registrationHash(payload),state:'NUEVO',scheduled:false,paymentRecorded:false})};}};
 const quote=async(text='Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?')=>{const e=await turn(text);assert.match(deliver(e),/129.000/);return e;};
 const facts=async()=>{deliver(await turn('Sí'));deliver(await turn('Persona Sintética'));const address=await turn('Calle 50 # 42-18 apartamento 301');return address;};
 return {store,config,engine,event,process,turn,row,deliver,transport,quote,facts,stats:()=>({writes,payload})};
}

test('separate pet presence is acknowledged once and reaches the confirmed own order with its full native source',async()=>{
 const f=fixture();try{
  await f.quote();const pets=await f.turn('Tengo dos mascotas.');assert.equal(f.deliver(pets),'Anoté: Tengo dos mascotas.');
  const address=await f.facts(),summary=f.deliver(address);assert.match(summary,/Presencia de mascotas informada: Tengo dos mascotas\./);assert.doesNotMatch(summary,/segur|inofensiv|retir|protecci/i);
  const confirmation=await f.turn('Sí');assert.equal(f.row(confirmation),undefined);await drainProgramRegistrations(f.store,f.config,f.transport);await drainProgramRegistrations(f.store,f.config,f.transport);
  const {writes,payload}=f.stats();assert.equal(writes,1);assert.equal(payload.petPresence,'Tengo dos mascotas');assert.deepEqual(payload.sources.petPresence,{id:pets.id,text:pets.text,at:new Date(pets.at).toISOString()});assert.equal(payload.quote.acceptanceId,confirmation.id);
  assert.equal(payload.customerName,'Persona Sintética');assert.equal(payload.address,'Calle 50 # 42-18 apartamento 301');assert.equal(payload.quote.priceCop,129000);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.store.conversation(pets.phone).state.programServiceId,orderId);
 }finally{f.store.close();}
});

test('a pet note sent before the original price acceptance permits the prior-facts path',async()=>{
 const f=fixture();try{
  const first=await f.quote('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Mi nombre es Persona Sintética. Mi dirección es Calle 50 # 42-18 apartamento 301. Tengo dos mascotas. Cuánto cuesta?');
  const accepted=await f.turn('Sí');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);assert.equal(f.stats().payload.petPresence,'Tengo dos mascotas');assert.equal(f.stats().payload.sources.petPresence.id,first.id);assert.equal(f.stats().payload.quote.acceptanceId,accepted.id);
 }finally{f.store.close();}
});

test('a new pet source after the delivered summary requires a newly delivered summary and later confirmation',async()=>{
 const f=fixture();try{
  await f.quote();const address=await f.facts();f.deliver(address);const pets=await f.turn('Tengo dos mascotas.');assert.match(f.deliver(pets),/Presencia de mascotas informada: Tengo dos mascotas/);assert.equal(registrationStatus(f.config,f.store).prepared,0);
  await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,0);const confirmed=await f.turn('Confirmo');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);assert.equal(f.stats().payload.quote.acceptanceId,confirmed.id);
 }finally{f.store.close();}
});

test('even the same pet words from a newer source renew the summary source before saving',async()=>{
 const f=fixture();try{
  await f.quote();await f.turn('Tengo dos mascotas.');const address=await f.facts();f.deliver(address);const newer=await f.turn('Tengo dos mascotas.');assert.match(f.deliver(newer),/¿Confirmas/);assert.equal(registrationStatus(f.config,f.store).prepared,0);await f.turn('Sí');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().payload.sources.petPresence.id,newer.id);
 }finally{f.store.close();}
});

test('the latest validated literal pet presence in the current case replaces the earlier observation',async()=>{
 const f=fixture();try{
  await f.quote();await f.turn('Tengo dos mascotas.');const pets=await f.turn('Tenemos tres mascotas.');const address=await f.facts();assert.match(f.deliver(address),/Presencia de mascotas informada: Tenemos tres mascotas/);await f.turn('Sí');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().payload.petPresence,'Tenemos tres mascotas');assert.equal(f.stats().payload.sources.petPresence.id,pets.id);
 }finally{f.store.close();}
});

test('a pet note cannot be misread as the requested customer name',async()=>{
 const f=fixture();try{await f.quote();f.deliver(await f.turn('Sí'));const pets=await f.turn('Tengo dos mascotas.');assert.equal(f.store.conversation(pets.phone).state.programIntake.customerName,undefined);assert.match(f.deliver(pets),/nombre completo/);assert.equal(registrationStatus(f.config,f.store).prepared,0);}finally{f.store.close();}
});

test('a separate pet source in the same pending facts batch is retained before the summary',async()=>{
 const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Sí'));const name=f.event('Persona Sintética'),pets=f.event('Tengo dos mascotas.'),address=f.event('Calle 50 # 42-18 apartamento 301');
  for(const e of [name,pets,address])f.store.enqueue(e);for(const e of [name,pets,address])await f.engine.process(e);
  const pi=f.store.conversation(address.phone).state.programIntake;assert.equal(pi.customerName,name.text);assert.equal(pi.address,address.text);assert.match(f.deliver(address),/Presencia de mascotas informada: Tengo dos mascotas/);await f.turn('Sí');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);assert.equal(f.stats().payload.sources.petPresence.id,pets.id);
 }finally{f.store.close();}
});

for(const text of ['No tengo mascotas.','Ya no tengo mascotas.','Me equivoqué, no son dos mascotas, es una.','Me equivoqué, son tres.','Tengo dos perros.','Tengo 3 mascotas, puedo dejarlas dentro','¿Puedo dejarlas dentro?']){
 for(const batched of [false,true])test('a later incompatible pet source invalidates the old summary without inferring a replacement: '+text+' batch='+batched,async()=>{
  const f=fixture();try{
   await f.quote();f.deliver(await f.turn('Tengo dos mascotas.'));f.deliver(await f.facts());
   if(batched){const change=f.event(text),yes=f.event('Confirmo');f.store.enqueue(change);f.store.enqueue(yes);await f.engine.process(change);await f.engine.process(yes);}
   else{await f.turn(text);await f.turn('Confirmo');}
   await drainProgramRegistrations(f.store,f.config,f.transport);const state=f.store.conversation('573001112233').state;
   assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.equal(state.programIntake.stage,'review');assert.equal(state.programIntake.preview,null);assert.equal(state.programServiceId,undefined);
  }finally{f.store.close();}
 });
}

test('an explicitly corrected name still renews its summary and preserves the valid unchanged pet observation',async()=>{
 const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Tengo dos mascotas.'));f.deliver(await f.facts());const corrected=await f.turn('Me equivoqué. Mi nombre es Ana Pérez');assert.match(f.deliver(corrected),/a nombre de Ana Pérez/);assert.match(f.store.open(f.row(corrected).body),/Presencia de mascotas informada: Tengo dos mascotas/);await f.turn('Confirmo');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);assert.equal(f.stats().payload.customerName,'Ana Pérez');assert.equal(f.stats().payload.petPresence,'Tengo dos mascotas');
 }finally{f.store.close();}
});

for(const [customerName,addressText] of [['María Gato','Calle 50 # 42-18 apartamento 301'],['María Mascotas','Calle 50 # 42-18 apartamento 301'],['Persona Sintética','Calle 50 # 42-18 apartamento 301 unidad Los Gatos']]){
 for(const batched of [false,true])test('validated literal name/address animal words retain their field meaning: '+customerName+' '+addressText+' batch='+batched,async()=>{
  const f=fixture();try{
   await f.quote();f.deliver(await f.turn('Sí'));f.deliver(await f.turn('Tengo dos mascotas.'));let address;
   if(batched){const name=f.event(customerName);address=f.event(addressText);for(const e of [name,address])f.store.enqueue(e);for(const e of [name,address])await f.engine.process(e);}
   else{f.deliver(await f.turn(customerName));address=await f.turn(addressText);}
   assert.match(f.deliver(address),/¿Confirmas/);await f.turn('Confirmo');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);assert.equal(f.stats().payload.customerName,customerName);assert.equal(f.stats().payload.address,addressText);assert.equal(f.stats().payload.petPresence,'Tengo dos mascotas');
  }finally{f.store.close();}
 });
}

for(const label of ['', 'Dirección: '])test('an address prefix never exempts a later mixed pet safety clause: '+label,async()=>{
 const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Sí'));f.deliver(await f.turn('Tengo dos mascotas.'));f.deliver(await f.turn('Persona Sintética'));await f.turn(label+'Calle 50 # 42-18 apartamento 301 unidad Los Gatos, tengo 3 mascotas, puedo dejarlas dentro');await f.turn('Confirmo');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.equal(f.store.conversation('573001112233').state.programIntake.stage,'review');
 }finally{f.store.close();}
});

for(const label of ['', 'Dirección: '])test('an animal action appended to a parseable address cannot reuse the earlier pet observation: '+label,async()=>{
 const f=fixture();try{
  await f.quote();f.deliver(await f.turn('Tengo dos mascotas.'));f.deliver(await f.facts());const changed=await f.turn(label+'Calle 50 # 42-18 apartamento 301 unidad Los Gatos, puedo dejarlas dentro');await f.turn('Confirmo');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.equal(f.store.conversation(changed.phone).state.programIntake.stage,'review');assert.equal(f.store.conversation(changed.phone).state.programIntake.preview,null);
 }finally{f.store.close();}
});

for(const variant of ['missing-source','wrong-phone','wrong-line','wrong-at','before-case','before-access','forwarded','quoted','safety','different-text'])test('invalid pet source blocks registration without silently dropping the note: '+variant,async()=>{
 const f=fixture();try{
  await f.quote();const pets=await f.turn('Tengo dos mascotas.');const address=await f.facts();f.deliver(address);const conv=f.store.conversation(pets.phone),note=conv.state.receptionNotes.incidentalPets[0];
  if(variant==='missing-source')note.sourceId='UNKNOWN_SOURCE';
  else if(variant==='wrong-at')note.at++;
  else if(variant==='different-text')note.text='Tengo tres mascotas';
  else{
   const eventRow=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(pets.id),native=f.store.open(eventRow.body);
   if(variant==='wrong-phone')native.phone='573005556677';
   if(variant==='wrong-line')native.line=f.config.lines[1].phone;
   if(variant==='before-case')conv.state.caseId='fumigacion:'+address.id;
   if(variant==='before-access'){native.at=f.config.mariaProgram.startsAt-1000;note.at=native.at;}
   if(variant==='forwarded')native.forwarded=true;
   if(variant==='quoted')native.quotedId='ANOTHER_SOURCE';
   if(variant==='safety')native.text='Tengo dos mascotas. ¿Es seguro el producto?';
   f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal(native),pets.id);
  }
  f.store.saveConversation(pets.phone,conv.state);await f.turn('Confirmo');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.equal(f.store.conversation(pets.phone).state.programIntake.stage,'review');
 }finally{f.store.close();}
});

test('native quoted metadata on the pet fact blocks the write even when stored text still matches',async()=>{
 const f=fixture();try{
  await f.quote();const pets=await f.turn('Tengo dos mascotas.');f.deliver(await f.facts());await f.turn('Sí');const request=f.transport.request;f.transport.request=async(...args)=>{const response=await request(...args);if(args[2].where.key.id===pets.id)response.messages.records[0].message={extendedTextMessage:{text:pets.text,contextInfo:{stanzaId:'QUOTED_PRIOR'}}};return response;};
  await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).review,1);
 }finally{f.store.close();}
});

for(const text of ['Tengo mascotas, cómo las protejo','Tengo mascotas, volveré luego','Tengo mascotas, qué hago con ellas'])test('the closed registration contract rejects ambiguous protection and return wording: '+text,async()=>{
 const f=fixture();try{
  await f.quote();const address=await f.facts();f.deliver(address);await f.turn(text);await f.turn('Sí');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).prepared,0);assert.ok(f.store.conversation(address.phone).state.awaitingHumanReview||f.store.conversation(address.phone).state.programIntake.stage==='review');
 }finally{f.store.close();}
});

test('a new pet source before POST postpones the write and cannot reuse an earlier acceptance',async()=>{
 const f=fixture();try{
  await f.quote();f.deliver(await f.facts());await f.turn('Sí');const pets=f.event('Tengo dos mascotas.');f.store.enqueue(pets);const first=await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(first.deferred,1);assert.equal(f.stats().writes,0);await f.engine.process(pets);await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).review,1);
 }finally{f.store.close();}
});

test('safety, health, quotes and relayed pet claims cannot become an incidental presence or an automatic acknowledgement',async()=>{
 for(const [text,patch] of [['Tengo dos mascotas. ¿Es seguro?',{}],['Tengo dos mascotas intoxicadas.',{}],['"Tengo dos mascotas"',{}],['Mi vecino dijo que tengo dos mascotas.',{}],['Tengo dos mascotas.',{quotedId:'PRIOR'}],['Tengo dos mascotas.',{forwarded:true}]]){
  const f=fixture();try{await f.quote();const e=await f.turn(text,patch);assert.equal(mariaIncidentalPetMention(e),null,text);assert.equal(f.store.conversation(e.phone).state.receptionNotes?.incidentalPets,undefined,text);const row=f.row(e);assert.ok(!row||!/^Anoté:/.test(f.store.open(row.body)),text);assert.equal(f.stats().writes,0);}finally{f.store.close();}
 }
});

test('no pet note retains the prior DTO shape and the scoped registration status exposes its guard',async()=>{
 const f=fixture();try{await f.quote();f.deliver(await f.facts());await f.turn('Sí');await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(f.stats().writes,1);assert.equal(Object.hasOwn(f.stats().payload,'petPresence'),false);assert.equal(Object.hasOwn(f.stats().payload.sources,'petPresence'),false);assert.equal(registrationStatus(f.config,f.store).petPresenceGuard,MARIA_PROGRAM_PET_PRESENCE_GUARD);assert.equal(registrationStatus({...f.config,company:'servicio-tecnico'},f.store).petPresenceGuard,null);}finally{f.store.close();}
});
