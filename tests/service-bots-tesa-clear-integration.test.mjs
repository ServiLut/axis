import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE,FUMIGACION_BLUE,FUMIGACION_RED} from '../automation/service-bots/line-scope.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {drainProgramRegistrations,registrationHash,registrationStatus,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const adminToken='a'.repeat(43),webhookToken='b'.repeat(43);
function fixture(company='fumigacion'){
 const at=Date.now()-120000,b=BUSINESSES[company],human='573043332213',sender=b.phones[0],members=[...TESA_BOT_PHONES,human];
 const config={company,...b,enabled:true,chiefOnly:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:at,authHash:hash(adminToken),webhookHash:hash(webhookToken),lines:b.phones.map((phone,i)=>({phone,instance:'LOCAL_CASE_'+i})),tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:sender,activatedAt:at+1000,allowedParticipantPhones:[human],verifiedMembership:{owner:sender,ownerOpen:true,verifiedAt:Date.now(),expiresAt:Date.now()+300000,sourceHash:'a'.repeat(64),participantPhones:members,participantBindings:members.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}},...(company==='fumigacion'?{operationalLineScope:{company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[FUMIGACION_RED],authorizedAt:new Date(at+1000).toISOString()}}:{})};
 const store=new Store(':memory:',company,randomBytes(32)),engine=new Engine(store,config),event={id:'CLEAR_CURRENT_SOURCE',phone:'573000001234',line:sender,fromMe:false,at:Date.now(),kind:'text',text:'Prefiero mañana en la tarde'};
 store.enqueue(event);const caseId=company+':'+event.id;store.saveConversation(event.phone,{slots:{service:'cucarachas',location:'Itagüí',preference:'mañana en la tarde'},asked:[],caseId});
 return {config,store,engine,event,request:{phone:event.phone,line:event.line,source:event.id,caseId,topic:'disponibilidad-y-tecnico',conditions:{service:'cucarachas',location:'Itagüí',preference:'mañana en la tarde'},text:'ignored original private wording'}};
}
test('new FUM case has one clear decision while duplicate request keeps its original exact text and source',()=>{
 const f=fixture();try{const first=routeCaseQuestion(f.store,f.config,f.request),row=f.store.db.prepare('SELECT * FROM tesa_outbox').get(),body=f.store.open(row.body);
  assert.equal(first.created,true);assert.match(body,/^Equipo TESA, necesito confirmar disponibilidad para este caso\./);assert.equal((body.match(/¿/g)||[]).length,1);assert.match(body,/¿Se puede atender este caso\?/);assert.match(body,/técnico \[nombre en Tenaxis\]; fecha \[día\]; franja \[inicio-fin\]/);assert.match(body,/mañana en la tarde/);assert.match(body,/Respondan citando este mensaje\./);assert.doesNotMatch(body,/^\d+\. |Qué sabemos:|Qué falta confirmar:/m);assert.ok(body.length<=1200);assert.equal(body.includes(f.event.phone),false);
  const question=f.store.db.prepare('SELECT * FROM tesa_questions').get(),source=f.store.open(question.body);assert.equal(source.source,f.event.id);assert.equal(source.caseId,f.request.caseId);assert.equal(question.source_line,f.event.line);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(f.event.id).body).text,f.event.text);
  const next=routeCaseQuestion(f.store,f.config,f.request);assert.equal(next.created,false);assert.equal(next.id,first.id);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM tesa_outbox').get().body),body);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}
});
test('Miguel retains the previous single-paragraph case wording and destinations',()=>{
 const f=fixture('servicio-tecnico');try{assert.equal(routeCaseQuestion(f.store,f.config,f.request).created,true);const body=f.store.open(f.store.db.prepare('SELECT body FROM tesa_outbox').get().body);assert.match(body,/¿Qué disponibilidad, ruta y técnico corresponden a este caso\?/);assert.doesNotMatch(body,/\n1\.|Los corchetes/);}finally{f.store.close();}
});
test('the actual FUM routing keeps the literal mattress count in the readable group context',()=>{
 const f=fixture();try{
  const e={...f.event,id:'CLEAR_MATTRESS_COUNT',at:Date.now(),text:'Tengo chinches en seis colchones en un apartamento de Itagüí'};f.store.enqueue(e);
  const slots={service:'chinches',location:'Itagüí',site:'apartamento',mattresses:'seis colchones'};f.store.saveConversation(e.phone,{...f.store.conversation(e.phone).state,slots});
  const result=routeCaseQuestion(f.store,f.config,{...f.request,source:e.id,conditions:slots});assert.equal(result.created,true);
  const text=f.store.open(f.store.db.prepare('SELECT body FROM tesa_outbox').get().body);assert.match(text,/Colchones: seis colchones/);assert.match(text,/Servicio: chinches/);assert.equal((text.match(/¿/g)||[]).length,1);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(e.id).body).text,e.text);
 }finally{f.store.close();}
});

test('native room case …4149 remains understandable, minimized and linked to its literal source',()=>{
 const f=fixture();try{
  const e={...f.event,id:'CLEAR_ROOM_4149',phone:'573000004149',text:'Es una habitación Masomenos pequeña la verdad no sé cuánto mide..'};f.store.enqueue(e);
  const caseId='fumigacion:'+e.id,slots={service:'control de Plaga',location:'Itagüí',site:'Hogar',rooms:'una habitación'};f.store.saveConversation(e.phone,{slots,asked:[],caseId});
  const result=routeCaseQuestion(f.store,f.config,{...f.request,phone:e.phone,source:e.id,caseId,topic:'cotizacion-verificada',conditions:{...slots,detail:'cotización técnica'}});assert.equal(result.created,true);
  const out=f.store.db.prepare('SELECT * FROM tesa_outbox').get(),text=f.store.open(out.body),q=f.store.db.prepare('SELECT * FROM tesa_questions').get();
  assert.match(text,/^Equipo TESA, necesito cotizar este caso\./);assert.match(text,/Cliente …4149 · línea azul …4997/);assert.match(text,/Habitaciones: una habitación; Medida: no informada/);assert.ok(text.includes('Cliente: «'+e.text+'».'));assert.equal((text.match(/¿/g)||[]).length,1);assert.match(text,/valor y qué incluye, o el dato concreto que falta/);assert.match(text,/Respondan citando este mensaje\./);assert.ok(text.length<700);
  assert.doesNotMatch(text,/cotización técnica|Falla:|\d+\s*(?:m2|m²)|\$|573000004149/);assert.equal(f.store.open(q.body).source,e.id);assert.equal(q.case_id,caseId);assert.equal(q.customer_phone,e.phone);assert.equal(q.source_line,e.line);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(e.id).body).text,e.text);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}
});

test('an arbitrary programServiceId or unbacked registered state cannot present the case as saved',()=>{
 for(const unbackedState of [false,true]){const f=fixture();try{
  if(unbackedState)f.store.saveConversation(f.event.phone,{...f.store.conversation(f.event.phone).state,programIntake:{stage:'registered'},programServiceId:'85c47fc8-5314-4f68-a8d6-dde112640f5d'});
  const before=f.store.conversation(f.event.phone),r=routeCaseQuestion(f.store,f.config,{...f.request,conditions:{...f.request.conditions,programServiceId:'85c47fc8-5314-4f68-a8d6-dde112640f5d',quotedPriceCop:129000}});assert.equal(r.created,true);
  const text=f.store.open(f.store.db.prepare('SELECT body FROM tesa_outbox').get().body);assert.match(text,/confirmar disponibilidad/);assert.doesNotMatch(text,/ya registrada|aceptado por el cliente|85c47fc8|129000|129\.000/);assert.deepEqual(f.store.conversation(f.event.phone),before);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'tesa-continuation-plan:%'").get().n,0);
 }finally{f.store.close();}}
});

test('an accepted own registration receipt presents saved-awaiting-schedule and keeps fields, authorship and native sources',async()=>{
 const f=fixture();try{
  const actor='7508385b-536e-4aa2-8137-d734dfc900ef',order='85c47fc8-5314-4f68-a8d6-dde112640f5d',phone='573000006789',start=Math.floor((Date.now()-30000)/1000)*1000;
  f.config.mariaProgram={enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:actor,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:start+86400000};f.store.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));initializeInactivityFollowup(f.config,f.store);let count=0,writes=0,payload;
  const turn=async text=>{const e={id:'CLEAR_SAVED_'+ ++count,phone,line:f.config.lines[0].phone,fromMe:false,kind:'text',text,at:start+count*1000};historicalPriceClock.timers.setTime(e.at);f.store.enqueue(e);await f.engine.process(e);return e;};
  const delivered=e=>{const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');assert.ok(row,e.text);const mid='MID_'+e.id;f.store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id=?").run(mid,row.id);f.store.recordFirstBotReply({...row,mid},mid,f.config.bot,e.at);f.store.delivery(mid,e.line,'DELIVERED');f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+row.id);return f.store.open(row.body);};
  const transport={verifyLine:async()=>{},currentAttention:async()=>({complete:true,sources:f.store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(number,at)=>({complete:true,sources:f.store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(number,at)}),request:async(line,path,body)=>{
   const id=body.where.key.id,source=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(id),out=f.store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
   if(source){const e=f.store.open(source.body);return {messages:{records:[{key:{id,fromMe:false,remoteJid:e.phone+'@s.whatsapp.net'},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}
   if(out)return {messages:{records:[{key:{id,fromMe:true,remoteJid:out.phone+'@s.whatsapp.net'},message:{conversation:f.store.open(out.body)},status:'DELIVERY_ACK'}]}};return {messages:{records:[]}};
  },fetcher:async(url,opts)=>{writes++;payload=JSON.parse(opts.body);return {ok:true,json:async()=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actor,createdById:actor,phone:payload.phone,persisted:true,orderId:order,caseId:payload.caseId,acceptanceId:payload.quote.acceptanceId,requestHash:registrationHash(payload),state:'NUEVO',scheduled:false,paymentRecorded:false})};}};
  assert.match(delivered(await turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. ¿Cuánto cuesta?')),/129.000/);delivered(await turn('Sí, agéndame para mañana en la tarde'));const name=await turn('Persona Sintética');delivered(name);const address=await turn('Calle 50 # 42-18 apartamento 301');delivered(address);const accepted=await turn('Confirmo');
  await drainProgramRegistrations(f.store,f.config,transport,routeCaseQuestion);assert.equal(writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);
  const row=f.store.db.prepare('SELECT * FROM tesa_questions WHERE customer_phone=?').get(phone),out=f.store.db.prepare('SELECT * FROM tesa_outbox WHERE question_id=?').get(row.id),text=f.store.open(out.body),body=f.store.open(row.body),entry=f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+payload.caseId).value);
  assert.match(text,/solicitud ya registrada; faltan técnico y horario/);assert.equal((text.match(/^¿/gm)||[]).length,1);assert.match(text,/¿Qué técnico, fecha y franja de inicio y fin pueden confirmar para esta solicitud\?/);assert.match(text,/mañana en la tarde/);assert.match(text,/Respondan citando este mensaje\./);assert.doesNotMatch(text,/todavía sin registrar|¿Pueden cotizar|Persona Sintética|Calle 50|573000006789|129\.000|85c47fc8/);assert.ok(text.length<=1200);
  assert.equal(entry.status,'SAVED');assert.equal(entry.receipt.orderId,order);assert.equal(entry.receipt.createdById,actor);assert.equal(entry.receipt.advisorMembershipId,actor);assert.equal(entry.receipt.requestHash,registrationHash(payload));assert.equal(entry.receipt.acceptanceId,accepted.id);assert.equal(payload.sources.customerName.id,name.id);assert.equal(payload.sources.address.id,address.id);assert.equal(payload.quote.priceCop,129000);assert.equal(body.source,accepted.id);assert.equal(body.caseId,payload.caseId);assert.equal(body.conditions.programServiceId,order);assert.equal(row.source_line,accepted.line);assert.equal(f.store.caseAuthorship(payload.caseId).programCreatorMembershipId,actor);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'tesa-continuation-plan:%'").get().n,1);
 }finally{f.store.close();}
});
test('previous private pending question is not copied or moved to the new group format',()=>{
 const f=fixture();try{f.store.questionToRecipients({...f.request,recipients:['573016803926'],text:'Historical own private question'});const prior=f.store.db.prepare('SELECT * FROM questions').get();const r=routeCaseQuestion(f.store,f.config,f.request);assert.equal(r.created,false);assert.equal(r.privateQuestionPreserved,true);assert.deepEqual(f.store.db.prepare('SELECT * FROM questions').get(),prior);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,0);}finally{f.store.close();}
});

const list={key:'current-guidance-fixture-v1',sourceHash:'b'.repeat(64),items:[{title:'Duración de la visita',question:'¿Qué tiempo necesita el técnico para esta clase de visita?',example:'Explicar qué duración se utiliza y cuándo hace falta otro dato.'}]};
async function serverFixture(company='fumigacion'){
 const f=fixture(company);let network=0;const transport={request:async()=>{network++;throw Error('NO_EXTERNAL_REQUEST_IN_ENDPOINT_TEST');},verifyLine:async()=>{network++;throw Error('NO_EXTERNAL_REQUEST_IN_ENDPOINT_TEST');}};
 const server=createBotServer(f.config,f.store,transport,f.engine);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const request=async(route,body,token=adminToken)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {http:response.status,data:await response.json()};};
 return {...f,request,network:()=>network,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));f.store.close();}};
}
test('guidance endpoint requires own admin auth and queues exact fixed-group list only once without sending in the HTTP handler',async()=>{
 const f=await serverFixture();try{
  assert.equal((await f.request('/notify-tesa-guidance',list,webhookToken)).http,401);
  const first=await f.request('/notify-tesa-guidance',list);assert.equal(first.http,202);assert.equal(first.data.queued,true);assert.equal(first.data.state,'READY');
  const duplicate=await f.request('/notify-tesa-guidance',list);assert.equal(duplicate.http,202);assert.equal(duplicate.data.queued,false);assert.equal(duplicate.data.id,first.data.id);
  const status=await f.request('/tesa-guidance-status',{key:list.key});assert.equal(status.http,200);assert.equal(status.data.found,true);assert.equal(status.data.list.state,'READY');assert.equal(status.data.list.deliveryVerified,false);assert.match(status.data.list.text,/1\) Duración/);
  assert.equal(f.network(),0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{await f.close();}
});
test('guidance endpoint cannot accept a destination override or change a stable key and does not open other company send routes',async()=>{
 const f=await serverFixture();try{
  assert.equal((await f.request('/notify-tesa-guidance',{...list,groupJid:'foreign@g.us'})).http,409);
  assert.equal((await f.request('/notify-tesa-guidance',list)).http,202);
  const conflict=await f.request('/notify-tesa-guidance',{...list,items:[{...list.items[0],question:'¿Qué otro dato falta para la visita?'}]});assert.equal(conflict.http,409);assert.equal(conflict.data.error,'TESA_GUIDANCE_KEY_CONFLICT');
  assert.equal((await f.request('/tesa-guidance-status',{key:list.key,company:'servicio-tecnico'})).http,400);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_guidance_lists').get().n,1);assert.equal(f.network(),0);
 }finally{await f.close();}
 const g=await serverFixture('servicio-tecnico');try{assert.equal((await g.request('/notify-tesa-guidance',list)).http,403);assert.equal((await g.request('/tesa-guidance-status',{key:list.key})).http,403);assert.equal(g.network(),0);}finally{await g.close();}
});
