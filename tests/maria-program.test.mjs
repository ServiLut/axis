import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {registrationConfig,installProgramSetup,registrationStatus,registrationHash,drainProgramRegistrations,acceptsOrdinaryQuotation,literalIntakeTextWithoutRegistrationFields,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {BUSINESS_PRICE_HASH,approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
const actorId='7508385b-536e-4aa2-8137-d734dfc900ef',orderId='85c47fc8-5314-4f68-a8d6-dde112640f5d';
const base=()=>Math.floor((Date.now()-30000)/1000)*1000;
function fixture(){
 const start=base(),store=new Store(':memory:','fumigacion',randomBytes(32));
 store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:start+86400000}};
 const engine=new Engine(store,config);let counter=0;
 const event=text=>({id:'SOURCE'+ ++counter,phone:'573001112233',at:start+counter*1000,line:config.lines[0].phone,fromMe:false,kind:'text',text});
 const delivered=e=>{const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');assert.ok(row,'response '+e.text);store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run('MID'+e.id,row.id);store.recordFirstBotReply({...row,mid:'MID'+e.id},'MID'+e.id,config.bot,e.at);store.delivery('MID'+e.id,e.line,'DELIVERED');store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({verifiedAt:e.at,mid:'MID'+e.id,line:e.line,state:'DELIVERED'}),'first-delivery:'+row.id);return store.open(row.body);};
 const turn=async text=>{const e=event(text);store.enqueue(e);await engine.process(e);return e;};
 const ready=async()=>{const first=await turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');const text=delivered(first);assert.match(text,/129.000/);const accept=await turn('Sí');assert.match(delivered(accept),/nombre completo/);const name=await turn('Juan Pérez');assert.match(delivered(name),/dirección completa/);const address=await turn('Calle 50 # 42-18 apartamento 301');assert.match(delivered(address),/Juan Pérez/);const final=await turn('Confirmo');assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(final.id+':reply').n,0);return {first,accept,name,address,final};};
 return {store,config,engine,turn,delivered,ready};
}
function transport(f,handler){
 return {verifyLine:async()=>{},currentCustomerActivity:async(phone,at)=>({complete:true,sources:f.store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(phone,at)}),currentAttention:async()=>({complete:true,sources:f.store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),request:async(l,path,body)=>{
  const id=body.where.key.id;
  if(id){const inbound=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(id);const outbound=f.store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
   if(inbound){const e=f.store.open(inbound.body);return {messages:{records:[{key:{id,remoteJid:e.phone+'@s.whatsapp.net',fromMe:false},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}
   if(outbound)return {messages:{records:[{key:{id,remoteJid:outbound.phone+'@s.whatsapp.net',fromMe:true},message:{conversation:f.store.open(outbound.body)},status:'DELIVERY_ACK',messageTimestamp:base()/1000}]}};
   return {messages:{records:[]}};
  }
  return {messages:{records:[]}};
 },fetcher:handler};
}
const receipt=p=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actorId,createdById:actorId,phone:p.phone,persisted:true,orderId,caseId:p.caseId,acceptanceId:p.quote.acceptanceId,requestHash:registrationHash(p),state:'NUEVO',scheduled:false,paymentRecorded:false});
test('natural quotation acceptance admits scheduling/politeness and explicit facts without granting another scope',()=>{
 for(const text of ['Sí, agéndame para mañana','Perfecto','Listo, muchas gracias','Sí. Mi nombre es Juan Pérez y mi dirección es Calle 50 # 42-18'])assert.equal(acceptsOrdinaryQuotation(text),true,text);
 for(const text of ['Gracias','No gracias','Sí, si mañana queda libre','Sí pero si hay descuento','Perfecto, ¿cómo pago?','El técnico dijo sí','Sí, agéndame otro servicio','Sí. Mi nombre es Juan Pérez. El técnico dice que sí','Sí. Mi dirección es Calle 50 # 42-18 pero es un refuerzo','Sí. Mi nombre es Juan Pérez y mi nombre es Juana Pérez'])assert.equal(acceptsOrdinaryQuotation(text),false,text);
});
test('registration field removal preserves the service request and any later question, changed scope or complaint',()=>{
 const text=literalIntakeTextWithoutRegistrationFields('Tengo cucarachas en apartamento de 42 mts2 en Itagüí. Mi nombre es Juan Pérez. Mi dirección es Calle 50 # 42-18 apartamento 301. ¿Cuánto cuesta?');assert.match(text,/cucarachas/);assert.match(text,/42 mts2/);assert.match(text,/Itagüí/);assert.match(text,/¿Cuánto cuesta/);assert.doesNotMatch(text,/Juan Pérez|Calle 50|apartamento 301/);
 for(const suffix of ['para 2 apartamentos','pero es una garantía','en Soacha','y también una casa','para todo el edificio']){const result=literalIntakeTextWithoutRegistrationFields('Mi dirección es Calle 50 # 42-18 '+suffix);assert.ok(result.includes(suffix),result);}
 assert.equal(literalIntakeTextWithoutRegistrationFields('Mi nombre es quiero un refuerzo'),'Mi nombre es quiero un refuerzo');
 assert.equal(literalIntakeTextWithoutRegistrationFields('Mi dirección es no recuerdo'),'Mi dirección es no recuerdo');
});
test('asks missing literal fields together and captures both from one delivered response without reasking',async()=>{
 const f=fixture();try{
  const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');f.delivered(first);
  const accept=await f.turn('Sí'),prompt=f.delivered(accept);assert.match(prompt,/nombre completo/);assert.match(prompt,/dirección completa/);
  const facts=await f.turn('Mi nombre es Juan Pérez y mi dirección es Calle 50 # 42-18 apartamento 301');
  const preview=f.delivered(facts);assert.match(preview,/Juan Pérez/);assert.match(preview,/Calle 50 # 42-18 apartamento 301/);assert.match(preview,/Confirmas/);
  await f.turn('Listo, muchas gracias');let payload;
  await drainProgramRegistrations(f.store,f.config,transport(f,async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>receipt(payload)};}));
  assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(payload.sources.customerName.id,facts.id);assert.equal(payload.sources.address.id,facts.id);assert.equal(payload.sources.address.text,facts.text);
 }finally{f.store.close();}
});
test('reuses explicit fields from the same case before delivered price acceptance and confirms only after receipt',async()=>{
 const f=fixture();try{
  const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Mi nombre es Juan Pérez. Mi dirección es Calle 50 # 42-18 apartamento 301. Cuánto cuesta?');f.delivered(first);
  const accept=await f.turn('Perfecto');let payload;
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(accept.id+':reply').n,0);
  await drainProgramRegistrations(f.store,f.config,transport(f,async(url,opts)=>{payload=JSON.parse(opts.body);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%'").get().n,0);return {ok:true,json:async()=>receipt(payload)};}));
  assert.equal(registrationStatus(f.config,f.store).saved,1,JSON.stringify(f.store.conversation(accept.phone).state));assert.equal(payload.customerName,'Juan Pérez');assert.equal(payload.address,'Calle 50 # 42-18 apartamento 301');assert.equal(payload.sources.customerName.id,first.id);assert.equal(payload.quote.acceptanceId,accept.id);assert.equal(payload.sources.acceptance.text,'Perfecto');
 }finally{f.store.close();}
});
test('acceptance and explicitly labelled facts in one turn keep their complete native source',async()=>{
 const f=fixture();try{
  const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');f.delivered(first);
  const accept=await f.turn('Sí. Mi nombre es Juan Pérez y mi dirección es Calle 50 # 42-18 apartamento 301');let payload;
  await drainProgramRegistrations(f.store,f.config,transport(f,async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>receipt(payload)};}));
  assert.equal(registrationStatus(f.config,f.store).saved,1,JSON.stringify(f.store.conversation(accept.phone).state));for(const source of Object.values(payload.sources)){assert.equal(source.id,accept.id);assert.equal(source.text,accept.text);}assert.equal(payload.quote.acceptanceId,accept.id);
 }finally{f.store.close();}
});
test('a prior different case or forwarded labelled facts cannot supply the new registration',async()=>{
 const f=fixture();try{
  const old={id:'OTHERCASE',phone:'573001112233',line:f.config.lines[0].phone,kind:'text',fromMe:false,text:'Mi nombre es Otra Persona y mi dirección es Calle 99 # 10-10',at:base()-1000};f.store.enqueue(old);
  const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');f.delivered(first);
  const foreign={...old,id:'FORWARDED',forwarded:true,at:first.at+100};f.store.enqueue(foreign);
  const accept=await f.turn('Sí'),reply=f.delivered(accept);assert.match(reply,/nombre completo/);assert.match(reply,/dirección completa/);assert.equal(f.store.conversation(accept.phone).state.programIntake.customerName,undefined);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 }finally{f.store.close();}
});
test('verified save consults the injected operational router with no address, phone or full name in its text',async()=>{
 const f=fixture();try{const stages=await f.ready();const conv=f.store.conversation(stages.final.phone);conv.state.slots.preference='mañana en la tarde';f.store.saveConversation(stages.final.phone,conv.state);f.config.tesaOperations={enabled:true};let calls=0;
  await drainProgramRegistrations(f.store,f.config,transport(f,async(url,opts)=>({ok:true,json:async()=>receipt(JSON.parse(opts.body))})),(store,config,request)=>{calls++;assert.equal(registrationStatus(config,store).saved,1);assert.equal(request.phone,stages.final.phone);assert.equal(request.source,stages.final.id);assert.equal(request.caseId,conv.state.caseId);assert.equal(request.topic,'disponibilidad-y-tecnico');assert.doesNotMatch(request.text,/573001112233|Juan Pérez|Calle 50/);return {id:'TESA-QUESTION',outboxId:'tesa-question:TESA-QUESTION',created:true};});
  assert.equal(calls,1);assert.equal(f.store.conversation(stages.final.phone).state.pendingTesaQuestionId,'TESA-QUESTION');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.store.close();}
});
test('missing or failed operational routing preserves the saved receipt without a private fallback or business replay',async()=>{
 for(const router of [null,()=>{throw Error('routing unavailable');}]){const f=fixture();try{const stages=await f.ready();const conv=f.store.conversation(stages.final.phone);conv.state.slots.preference='mañana';f.store.saveConversation(stages.final.phone,conv.state);f.config.tesaOperations={enabled:true};let writes=0;const t=transport(f,async(url,opts)=>{writes++;return {ok:true,json:async()=>receipt(JSON.parse(opts.body))};});await drainProgramRegistrations(f.store,f.config,t,router);await drainProgramRegistrations(f.store,f.config,t,router);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(registrationStatus(f.config,f.store).uncertain,0);assert.equal(writes,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);}finally{f.store.close();}}
});
test('a native pure courtesy after final acceptance does not renew acceptance or require another confirmation',async()=>{
 const f=fixture();try{const stages=await f.ready();await f.turn('Muchas gracias');let payload,writes=0;
  await drainProgramRegistrations(f.store,f.config,transport(f,async(url,opts)=>{writes++;payload=JSON.parse(opts.body);return {ok:true,json:async()=>receipt(payload)};}));
  assert.equal(writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(payload.quote.acceptanceId,stages.final.id);assert.equal(payload.quote.acceptedAt,new Date(stages.final.at).toISOString());assert.equal(payload.sources.acceptance.text,'Confirmo');
 }finally{f.store.close();}
});
test('a courtesy cannot hide a later change, forwarded text, native mismatch or another line before registration',async()=>{
 for(const kind of ['payment','cancellation','forwarded','native-mismatch','another-line']){const f=fixture();try{const stages=await f.ready();const courtesy=await f.turn('Muchas gracias');let writes=0;const t=transport(f,async()=>{writes++;throw Error('must not write');});
   if(kind==='payment')await f.turn('Gracias, ¿cómo pago?');
   if(kind==='cancellation')await f.turn('No quiero el servicio');
   if(kind==='forwarded'){const row=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(courtesy.id);f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal({...f.store.open(row.body),forwarded:true}),courtesy.id);}
   if(kind==='native-mismatch'){const read=t.request;t.request=async(...args)=>{const response=await read(...args);if(args[2].where.key.id===courtesy.id)response.messages.records[0].message.conversation='No acepto';return response;};}
   if(kind==='another-line'){const read=t.currentCustomerActivity;t.currentCustomerActivity=async(...args)=>{const response=await read(...args);response.sources.push({id:'UNKNOWN_OTHER_LINE',line:f.config.lines[1].phone,at:stages.final.at+1});return response;};}
   await drainProgramRegistrations(f.store,f.config,t);assert.equal(writes,0,kind);assert.equal(registrationStatus(f.config,f.store).saved,0,kind);
  }finally{f.store.close();}}
});
test('only delivered accepted approved quotation collects literal fields; saved receipt precedes confirmation',async()=>{
 const f=fixture();try{const stages=await f.ready();let writes=0;const t=transport(f,async(url,opts)=>{writes++;const p=JSON.parse(opts.body);assert.equal(p.customerName,'Juan Pérez');assert.equal(p.sources.acceptance.id,stages.final.id);assert.equal(p.quote.scheduleHash,BUSINESS_PRICE_HASH);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%'").get().n,0);return {ok:true,json:async()=>receipt(p)};});
  const before=f.store.conversation(stages.final.phone).state;assert.equal(before.quotedPrice.acceptanceSource,stages.accept.id);
  await drainProgramRegistrations(f.store,f.config,t);assert.equal(writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.store.conversation(stages.final.phone).state.programServiceId,orderId);
  const response=f.store.db.prepare("SELECT * FROM outbox WHERE id LIKE 'program:%'").get();assert.match(f.store.open(response.body),/quedó registrada/);assert.match(f.store.open(response.body),/pendiente de confirmación/);assert.equal(f.store.caseAuthorship(before.caseId).programCreatorMembershipId,actorId);
  await drainProgramRegistrations(f.store,f.config,t);assert.equal(writes,1);
 }finally{f.store.close();}
});
test('summary confirmation before delivery never prepares a write',async()=>{
 const f=fixture();try{const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');f.delivered(first);f.delivered(await f.turn('Sí'));f.delivered(await f.turn('Juan Pérez'));await f.turn('Calle 50 # 42-18 apartamento 301');await f.turn('Confirmo');assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);}finally{f.store.close();}
});
test('human takeover after preparation preserves source but prevents program write',async()=>{
 const f=fixture();try{const e=await f.ready();f.store.hold(e.final.phone,'native-human');let calls=0;await drainProgramRegistrations(f.store,f.config,transport(f,async()=>{calls++;throw Error('must not write');}));assert.equal(calls,0);assert.equal(registrationStatus(f.config,f.store).review,1);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%'").get().n,0);}finally{f.store.close();}
});
test('native field changed or customer new turn prevents write even with stored affirmative',async()=>{
 const f=fixture();try{await f.ready();let calls=0;const t=transport(f,async()=>{calls++;throw Error('must not write');});const request=t.request;t.request=async(l,path,body)=>{const r=await request(l,path,body);if(body.where.key.id==='SOURCE3')r.messages.records[0].message.conversation='Nombre diferente';return r;};await drainProgramRegistrations(f.store,f.config,t);assert.equal(calls,0);assert.equal(registrationStatus(f.config,f.store).review,1);}finally{f.store.close();}
});
test('uncertain write is recovered only through same receipt, never a second POST registration',async()=>{
 const f=fixture();try{await f.ready();let writeCalls=0,lookups=0,payload;const t=transport(f,async(url,opts)=>{if(url.endsWith('/receipt')){lookups++;const body=JSON.parse(opts.body);assert.equal(body.acceptanceId,payload.quote.acceptanceId);return {ok:true,json:async()=>receipt(payload)};}writeCalls++;payload=JSON.parse(opts.body);throw Error('connection lost after commit');});await drainProgramRegistrations(f.store,f.config,t);assert.equal(registrationStatus(f.config,f.store).uncertain,1);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%'").get().n,0);await drainProgramRegistrations(f.store,f.config,t);assert.equal(writeCalls,1);assert.equal(lookups,1);assert.equal(registrationStatus(f.config,f.store).saved,1);}finally{f.store.close();}
});
test('cross-company or wrong creator receipt cannot confirm registration',async()=>{
 const f=fixture();try{await f.ready();const t=transport(f,async(url,opts)=>({ok:true,json:async()=>({...receipt(JSON.parse(opts.body)),advisorMembershipId:'e62d789d-79ed-465c-8457-1551c62a9a09'})}));await drainProgramRegistrations(f.store,f.config,t);assert.equal(registrationStatus(f.config,f.store).saved,0);assert.equal(registrationStatus(f.config,f.store).uncertain,1);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%'").get().n,0);}finally{f.store.close();}
});
test('program setup verifies fixed backend scope before storing secret; disabled is default',async()=>{
 const f=fixture();try{const body={enabled:true,url:f.config.mariaProgram.url,token:'a'.repeat(43),actorId,startsAt:new Date(f.config.mariaProgram.startsAt).toISOString(),expiresAt:new Date(f.config.mariaProgram.expiresAt).toISOString()};f.config.mariaProgram={enabled:false};assert.deepEqual(registrationConfig({},'fumigacion'),{enabled:false});await assert.rejects(()=>installProgramSetup(f.config,f.store,body,async()=>({ok:true,json:async()=>({company:'S.TECNICO'})})));assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key='maria-program-setup'").get().n,0);const status={company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actorId,username:'maria.angel.bot',enabled:true,businessWritesEnabled:true,registrationKind:'new-service-pending-scheduling',priceScheduleHash:BUSINESS_PRICE_HASH,startsAt:body.startsAt,expiresAt:body.expiresAt};await installProgramSetup(f.config,f.store,body,async()=>({ok:true,json:async()=>status}));assert.equal(registrationStatus(f.config,f.store).enabled,true);assert.equal(JSON.stringify(registrationStatus(f.config,f.store)).includes(body.token),false);}finally{f.store.close();}
});
test('warranty and payment question retain personal review and never prepare new service',async()=>{
 for(const message of ['Es una garantía del servicio anterior','¿Cómo pago?','No acepto']){const f=fixture();try{const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');f.delivered(first);f.delivered(await f.turn('Sí'));await f.turn(message);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);}finally{f.store.close();}}
});
async function collectBeforeAddress(f){
 const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');f.delivered(first);f.delivered(await f.turn('Sí'));f.delivered(await f.turn('Juan Pérez'));
}
test('different municipality or multiple properties in the address cannot preserve an ordinary quote',async()=>{
 for(const address of ['Calle 50 # 42-18, es para todo el edificio','Calle 50 # 42-18 para 2 apartamentos','Calle 50 # 42-18 en Soacha','Calle 50 # 42-18 en Bogotá']){
  const f=fixture();try{await collectBeforeAddress(f);const e=await f.turn(address);const conv=f.store.conversation(e.phone);assert.equal(conv.state.programIntake.stage,'review',address);const row=f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply');assert.match(f.store.open(row.body),/revisión/);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);}finally{f.store.close();}
 }
});
test('correction requires a new delivered summary and records the corrected literal facts',async()=>{
 const f=fixture();try{await collectBeforeAddress(f);f.delivered(await f.turn('Calle 50 # 42-18 apartamento 301'));const correction=await f.turn('Mi nombre es Juana Pérez');const reply=f.delivered(correction);assert.match(reply,/Juana Pérez/);assert.doesNotMatch(reply,/Juan Pérez/);await f.turn('Confirmo');let payload;await drainProgramRegistrations(f.store,f.config,transport(f,async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({success:true,data:receipt(payload)})};}));assert.equal(payload.customerName,'Juana Pérez');assert.equal(payload.sources.customerName.id,correction.id);assert.equal(registrationStatus(f.config,f.store).saved,1);}finally{f.store.close();}
});
test('No about summary followed by an affirmative without correction cannot create; rejection closes intake',async()=>{
 for(const answer of ['No','No quiero el servicio','No gracias']){
  const f=fixture();try{await collectBeforeAddress(f);f.delivered(await f.turn('Calle 50 # 42-18 apartamento 301'));const negative=await f.turn(answer);f.delivered(negative);await f.turn('Confirmo');assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);const st=f.store.conversation(negative.phone).state;if(answer!=='No'){assert.equal(st.closed,true);assert.equal(st.programIntake.stage,'declined');}}finally{f.store.close();}
 }
});
test('a cancellation in the other line during native checks prevents a service write',async()=>{
 const f=fixture();try{const stages=await f.ready();let calls=0;const t=transport(f,async()=>{calls++;throw Error('must not write');});const get=t.currentCustomerActivity;t.currentCustomerActivity=async(phone,at)=>{const r=await get(phone,at);r.sources.push({id:'CANCEL_OTHER',line:f.config.lines[1].phone,at});return r;};await drainProgramRegistrations(f.store,f.config,t);assert.equal(calls,0);assert.equal(registrationStatus(f.config,f.store).review,1);}finally{f.store.close();}
});
test('receipt recovery after human takeover preserves the saved record without sending customer confirmation',async()=>{
 const f=fixture();try{const stages=await f.ready();let writes=0,payload;const t=transport(f,async(url,opts)=>{if(url.endsWith('/receipt'))return {ok:true,json:async()=>receipt(payload)};writes++;payload=JSON.parse(opts.body);throw Error('commit response lost');});await drainProgramRegistrations(f.store,f.config,t);f.store.hold(stages.final.phone,'OWN_STAFF');await drainProgramRegistrations(f.store,f.config,t);assert.equal(writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%'").get().n,0);assert.equal(f.store.conversation(stages.final.phone).hold,1);}finally{f.store.close();}
});
test('program token expiry while native checks run prevents registration',async()=>{
 const f=fixture();try{await f.ready();let calls=0;const t=transport(f,async()=>{calls++;throw Error('must not write');});const get=t.currentCustomerActivity;t.currentCustomerActivity=async(phone,at)=>{const r=await get(phone,at);f.config.mariaProgram.expiresAt=Date.now()-1;return r;};await drainProgramRegistrations(f.store,f.config,t);assert.equal(calls,0);}finally{f.store.close();}
});
test('an old quote without new delivery evidence keeps its existing continuation instead of falling silent',async()=>{
 const f=fixture();try{const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');f.delivered(first);f.store.db.prepare('DELETE FROM meta WHERE key=?').run('first-delivery:'+first.id+':reply');const acceptance=await f.turn('Sí');const row=f.store.db.prepare('SELECT body FROM outbox WHERE id=?').get(acceptance.id+':reply');assert.ok(row);assert.match(f.store.open(row.body),/día y franja/);assert.equal(f.store.conversation(acceptance.phone).state.programIntake,undefined);}finally{f.store.close();}
});
test('a repeated late delivery acknowledgment cannot renew a quotation older than 24 hours',async()=>{
 const f=fixture();try{const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Cuánto cuesta?');f.delivered(first);f.store.db.prepare('UPDATE outbox SET created=? WHERE id=?').run(Date.now()-86400001,first.id+':reply');const acceptance=await f.turn('Sí');assert.equal(f.store.conversation(acceptance.phone).state.programIntake,undefined);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);}finally{f.store.close();}
});
test('program configuration rejects an unverified destination before transmitting its credential',async()=>{
 const f=fixture();try{const body={enabled:true,url:'https://another.example/integrations/maria-service-registration',token:'a'.repeat(43),actorId,startsAt:new Date(f.config.mariaProgram.startsAt).toISOString(),expiresAt:new Date(f.config.mariaProgram.expiresAt).toISOString()};let requests=0;await assert.rejects(()=>installProgramSetup(f.config,f.store,body,async()=>{requests++;throw Error('must not transmit');}));assert.equal(requests,0);}finally{f.store.close();}
});
test('receipt with a contradictory creator or phone never confirms a service',async()=>{
 for(const mismatch of [{createdById:'e62d789d-79ed-465c-8457-1551c62a9a09'},{phone:'573009998877'}]){
  const f=fixture();try{await f.ready();await drainProgramRegistrations(f.store,f.config,transport(f,async(url,opts)=>({ok:true,json:async()=>({...receipt(JSON.parse(opts.body)),...mismatch})})));assert.equal(registrationStatus(f.config,f.store).saved,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%'").get().n,0);}finally{f.store.close();}
 }
});
