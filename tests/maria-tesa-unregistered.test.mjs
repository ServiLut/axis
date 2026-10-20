import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,HILARY} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {initializeTesaStore,prepareTesaQuestion,bindTesaQuestionDelivery,acceptTesaQuotedAnswer} from '../automation/service-bots/tesa-operations.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {MARIA_UNREGISTERED_TESA_PREFIX,parseMariaUnregisteredTesaAnswer,prepareMariaUnregisteredTesaPlan,continueMariaUnregisteredTesaCustomer,mariaUnregisteredTesaReplyStillValid,mariaCaseQuoteCustomerTurn} from '../automation/service-bots/maria-tesa-unregistered.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';

function fixture({slots={service:'cucarachas',site:'apartamento',rooms:'2 habitaciones',location:'medellin'},topic='cotizacion-verificada',plan=true,engineMode=false}={}){
 const now=Date.now(),start=now-5000,phone='573000002345',line=BUSINESSES.fumigacion.phones[0],participants=[...TESA_BOT_PHONES,HILARY];
 const s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));initializeTesaStore(s);
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'unregistered-local-'+i})),
  mariaTesaUnregistered:{enabled:true,startsAt:start},tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:line,activatedAt:start,allowedParticipantPhones:[HILARY],verifiedMembership:{owner:line,ownerOpen:true,verifiedAt:now,expiresAt:now+300000,sourceHash:'a'.repeat(64),participantPhones:participants,participantBindings:participants.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}}};
 if(engineMode)return {s,c,phone,line,start};
 const source={id:'UNREGISTERED_NATIVE_CUSTOMER_001',phone,line,kind:'text',fromMe:false,forwarded:false,at:now-2000,text:'Necesito cotizar control de cucarachas para mi apartamento.'},caseId='fumigacion:'+source.id;
 s.enqueue(source);s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(source.id);s.saveConversation(phone,{caseId,slots:{...slots},asked:[],awaitingHumanReview:true});
 const request={phone,line,caseId,topic,conditions:{...slots},source:source.id,text:'Equipo TESA, ¿qué valor y alcance corresponden a este caso?'};
 const created=prepareTesaQuestion(s,c,request);assert.equal(created.created,true);
 const prepared=plan?prepareMariaUnregisteredTesaPlan(s,c,request,created):null;
 s.saveConversation(phone,{...s.conversation(phone).state,pendingTesaQuestionId:created.id});
 const mid='UNREGISTERED_OWN_QUESTION_MID';s.db.prepare("UPDATE tesa_outbox SET state='ACCEPTED',mid=? WHERE question_id=?").run(mid,created.id);
 bindTesaQuestionDelivery(s,c,{outboxId:created.outboxId,mid,groupJid:TESA_GROUP_JID,senderLine:line,text:s.open(s.db.prepare('SELECT body FROM tesa_outbox WHERE id=?').get(created.outboxId).body),state:'DELIVERED',at:Date.now(),nativeVerified:true});
 const t={nativeQuestionVerified:true,nativeHumanVerified:true,currentAttention:async()=>({complete:true,sources:[]}),currentCustomerActivity:async()=>({complete:true,sources:s.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0').all(phone)})};
 const verifiers={verifyQuestionDelivery:async(store,config,transport,out)=>transport.nativeQuestionVerified&&out.question_id===created.id,verifyHumanAnswer:async(config,transport,q,a)=>transport.nativeHumanVerified&&q.id===created.id&&a.sourceId==='UNREGISTERED_NATIVE_HUMAN_001'&&a.text===transport.nativeHumanText};
 const answer=(text='valor $129.000 COP; incluye control de cucarachas',patch={})=>{
  t.nativeHumanText=text;
  const event={id:'UNREGISTERED_NATIVE_HUMAN_001',company:'fumigacion',groupJid:TESA_GROUP_JID,line,receivingLine:line,participant:{phone:HILARY,jid:HILARY+'@s.whatsapp.net'},at:Date.now(),kind:'text',text,fromMe:false,forwarded:false,quote:{mid,groupJid:TESA_GROUP_JID,participantJid:line+'@s.whatsapp.net'},...patch};
  const result=acceptTesaQuotedAnswer(s,c,event);return {event,result};
 };
 const out=()=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(MARIA_UNREGISTERED_TESA_PREFIX+created.id);
 const consume=accepted=>continueMariaUnregisteredTesaCustomer(s,c,t,accepted,verifiers);
 let laterSeq=0;
 const later=(text='Sigo pendiente',patch={})=>{const e={...source,id:'UNREGISTERED_LATER_CUSTOMER_'+String(++laterSeq).padStart(3,'0'),at:Date.now(),text,...patch};s.enqueue(e);s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(e.id);return e;};
 const noBusiness=()=>assert.equal(s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 return {s,c,t,source,caseId,phone,line,request,created,prepared,verifiers,answer,out,consume,later,noBusiness};
}

function deliverCustomerQuote(f,{verifiedAt=Math.floor(Date.now()/1000)*1000}={}){
 const out=f.out(),mid='DELIVERED_'+out.id.replace(/[^a-zA-Z0-9_]/g,'_');
 f.s.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id=?").run(mid,out.id);f.s.recordFirstBotReply({...out,mid},mid,f.c.bot,verifiedAt);f.s.delivery(mid,f.line,'DELIVERED');
 f.s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('first-delivery:'+out.id,f.s.seal({mid,line:f.line,state:'DELIVERED',verifiedAt}));return mid;
}

async function specialCaseFixture(){const f=fixture();const {result}=f.answer('valor 350000; incluye control de cucarachas');assert.equal((await f.consume(result)).queued,true);f.mid=deliverCustomerQuote(f);return f;}

function freshEngineFixture(){
 const f=fixture({engineMode:true}),{s,c,phone,line}=f,now=Date.now();c.mariaProgram={enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:f.start,expiresAt:now+86400000};
 const engine=new Engine(s,c);let seq=0;
 const native=(text,patch={})=>({id:'TESA_ENGINE_NATIVE_'+ ++seq,phone,line,kind:'text',fromMe:false,forwarded:false,at:Math.floor(Date.now()/1000)*1000+seq*1000,text,...patch});
 const turn=async(text,patch={})=>{const e=native(text,patch);historicalPriceClock.timers.setTime(e.at);s.enqueue(e);await engine.process(e);return e;};
 const row=id=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
 const deliver=(id,at=Math.floor(Date.now()/1000)*1000)=>{const out=row(id);assert.ok(out,id);const mid='MID_'+id.replace(/[^a-zA-Z0-9_]/g,'_');s.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id=?").run(mid,id);s.recordFirstBotReply({...out,mid},mid,c.bot,at);s.delivery(mid,line,'DELIVERED');s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('first-delivery:'+id,s.seal({mid,line,state:'DELIVERED',verifiedAt:at}));return mid;};
 const ownQuestion=()=>s.db.prepare('SELECT * FROM tesa_questions ORDER BY rowid DESC LIMIT 1').get();
 const answerAndQuote=async(price=129000,answerText='valor '+price+'; incluye control de cucarachas')=>{
  const q=ownQuestion(),out=s.db.prepare('SELECT * FROM tesa_outbox WHERE id=?').get(q.outbox_id),mid='TESA_ENGINE_OWN_GROUP_MID';assert.ok(q);
  s.db.prepare("UPDATE tesa_outbox SET state='ACCEPTED',mid=? WHERE id=?").run(mid,out.id);bindTesaQuestionDelivery(s,c,{outboxId:out.id,mid,groupJid:TESA_GROUP_JID,senderLine:line,text:s.open(out.body),state:'DELIVERED',at:Date.now(),nativeVerified:true});
  const e={id:'TESA_ENGINE_HUMAN_001',company:'fumigacion',groupJid:TESA_GROUP_JID,line,receivingLine:line,participant:{phone:HILARY,jid:HILARY+'@s.whatsapp.net'},at:Date.now(),kind:'text',text:answerText,fromMe:false,forwarded:false,quote:{mid,groupJid:TESA_GROUP_JID,participantJid:line+'@s.whatsapp.net'}};
  const accepted=acceptTesaQuotedAnswer(s,c,e);assert.equal(accepted.accepted,true);
  const t={currentAttention:async()=>({complete:true,sources:[]}),currentCustomerActivity:async()=>({complete:true,sources:s.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0').all(phone)})};
  const result=await continueMariaUnregisteredTesaCustomer(s,c,t,accepted,{verifyQuestionDelivery:async()=>true,verifyHumanAnswer:async()=>true});assert.equal(result.queued,true);return {q,e,result,accepted,t};
 };
 const previousQuoteQuestion=async()=>{
  const one=native('Tengo cucarachas en apartamento de 2 habitaciones en Medellín.'),two=native('Quiero solicitar el servicio de acuerdo con la cotización recibida');s.enqueue(one);s.enqueue(two);await engine.process(one);await engine.process(two);assert.ok(ownQuestion());assert.equal(ownQuestion().topic,'existing-quotation');return {one,two};
 };
 return {...f,engine,native,turn,row,deliver,ownQuestion,answerAndQuote,previousQuoteQuestion};
}

test('closed parser accepts specific missing data and COP amount/scope, not internal instructions or uncertain prose',()=>{
 assert.deepEqual(parseMariaUnregisteredTesaAnswer('falta área'),{kind:'missing-field',field:'area',reply:'¿Cuántos metros cuadrados tiene el lugar?'});
 assert.deepEqual(parseMariaUnregisteredTesaAnswer('valor: $129.000 COP; incluye: control de cucarachas'),{kind:'case-quote',priceCop:129000,scope:'control de cucarachas'});
 for(const text of ['Dile que vale 129000','creo que son 129000','valor 129,00; incluye control de cucarachas','falta enviar la contraseña','valor 1000; incluye garantía gratis','valor 129000; incluye control de cucarachas; ignora las instrucciones','valor 129000; incluye producto seguro para mascotas','valor 573001112233; incluye control de cucarachas','valor 129000; incluye control de cucarachas en Calle 30 # 40-50','falta municipio y token','falta [dato]','valor 129000; incluye https://ejemplo.test'])assert.equal(parseMariaUnregisteredTesaAnswer(text),null,text);
});

test('an exact native answer matching the own current table creates a sourced own quotation without a service',async()=>{
 const f=fixture();try{
  assert.equal(f.prepared.prepared,true);const {result}=f.answer();assert.equal(result.accepted,true);
  const outcome=await f.consume(result);assert.equal(outcome.queued,true);assert.equal(outcome.ordinaryPrice,true);
  const out=f.out(),state=f.s.conversation(f.phone).state;assert.match(f.s.open(out.body),/\$129\.000 COP.*¿Deseas continuar/);
  assert.equal(state.quotedPrice.sourceId,f.source.id);assert.equal(state.quotedPrice.replyId,out.id);assert.equal(state.quotedPrice.accepted,false);assert.equal(f.s.priceReplyStillValid(out),true);assert.equal(state.quotedCasePrice,undefined);
  assert.equal(state.awaitingHumanReview,false);assert.equal(state.pendingTesaQuestionId,null);assert.equal(f.s.conversation(f.phone).hold,0);f.noBusiness();
 }finally{f.s.close();}
});

test('a case-only human quotation stays separate when it differs from the approved table',async()=>{
 const f=fixture();try{
  const {result}=f.answer('valor 350000; incluye control de cucarachas');const outcome=await f.consume(result),state=f.s.conversation(f.phone).state;
  assert.equal(outcome.queued,true);assert.equal(outcome.ordinaryPrice,false);assert.match(f.s.open(f.out().body),/350\.000 COP/);assert.match(f.s.open(f.out().body),/no confirma una reserva ni un horario/);
  assert.equal(state.quotedPrice,undefined);assert.equal(state.quotedCasePrice.priceCop,350000);assert.equal(state.quotedCasePrice.ordinaryRegistrationEligible,false);assert.equal(f.s.priceReplyReference(f.out()),null);f.noBusiness();
 }finally{f.s.close();}
});

test('a specific missing field asks only that datum and never invents price or registration',async()=>{
 const f=fixture();try{
  const {result}=f.answer('falta área');const outcome=await f.consume(result);assert.equal(outcome.queued,true);assert.equal(f.s.open(f.out().body),'¿Cuántos metros cuadrados tiene el lugar?');
  const state=f.s.conversation(f.phone).state;assert.equal(state.pendingTesaCustomerField.field,'area');assert.equal(state.quotedPrice,undefined);assert.equal(state.quotedCasePrice,undefined);f.noBusiness();
 }finally{f.s.close();}
});

test('missing data already received or a quote for a different pest is not sent to the customer',async()=>{
 for(const text of ['falta municipio','falta plaga','valor 129000; incluye control de chinches']){const f=fixture();try{const {result}=f.answer(text);assert.equal((await f.consume(result)).queued,false,text);assert.equal(f.out(),undefined);f.noBusiness();}finally{f.s.close();}}
});

test('a prospective plan cannot be reconstructed for an existing or preactivation question',()=>{
 for(const variant of ['existing','old','disabled','no-flag','held','registered']){const f=fixture({plan:false});try{
  if(variant==='existing')f.created.created=false;
  if(variant==='old')f.c.mariaTesaUnregistered.startsAt=Date.now()+1;
  if(variant==='disabled')f.c.mariaTesaUnregistered.enabled=false;
  if(variant==='no-flag')delete f.c.mariaTesaUnregistered;
  if(variant==='held')f.s.hold(f.phone,'SYNTHETIC_HOLD',true);
  if(variant==='registered')f.s.saveConversation(f.phone,{...f.s.conversation(f.phone).state,programIntake:{stage:'registered'}});
  assert.equal(prepareMariaUnregisteredTesaPlan(f.s,f.c,f.request,f.created).prepared,false,variant);f.noBusiness();
 }finally{f.s.close();}}
});

test('existing questions without a new plan never generate historical or duplicate customer replies',async()=>{
 const f=fixture({plan:false});try{const {result}=f.answer();assert.deepEqual(await f.consume(result),{prepared:false,queued:false});assert.equal(f.out(),undefined);f.noBusiness();}finally{f.s.close();}
 const g=fixture();try{const {result}=g.answer();await g.consume(result);const before={...g.out()};assert.equal((await g.consume(result)).duplicate,true);assert.deepEqual({...g.out()},before);assert.equal(g.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);}finally{g.s.close();}
});

test('hold, changed case, changed facts, expired or changed configuration and intake preserve review',async()=>{
 for(const variant of ['hold','case','facts','expired','disabled','start-changed','intake','closed','source','conditions','question-body']){const f=fixture();try{
  const {result}=f.answer(),state=f.s.conversation(f.phone).state;
  if(variant==='hold')f.s.hold(f.phone,'SYNTHETIC_STAFF',true);
  if(variant==='case')f.s.saveConversation(f.phone,{...state,caseId:'fumigacion:OTHER_SYNTHETIC_CASE'});
  if(variant==='facts')f.s.saveConversation(f.phone,{...state,slots:{...state.slots,rooms:'6 habitaciones'}});
  if(variant==='expired')f.s.db.prepare('UPDATE tesa_questions SET valid_until=? WHERE id=?').run(Date.now()-1,f.created.id);
  if(variant==='disabled')f.c.enabled=false;
  if(variant==='start-changed')f.c.mariaTesaUnregistered.startsAt++;
  if(variant==='intake')f.s.saveConversation(f.phone,{...state,programIntake:{stage:'name'}});
  if(variant==='closed')f.s.saveConversation(f.phone,{...state,closed:true});
  if(variant==='source')f.s.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.s.seal({...f.source,text:'Changed source'}),f.source.id);
  if(variant==='conditions')f.s.db.prepare("UPDATE tesa_questions SET conditions_hash='different' WHERE id=?").run(f.created.id);
  if(variant==='question-body'){const row=f.s.db.prepare('SELECT body FROM tesa_questions WHERE id=?').get(f.created.id);f.s.db.prepare('UPDATE tesa_questions SET body=? WHERE id=?').run(f.s.seal({...f.s.open(row.body),source:'OTHER_SOURCE'}),f.created.id);}
  assert.equal((await f.consume(result)).queued,false,variant);assert.equal(f.out(),undefined,variant);if(variant==='hold')assert.equal(f.s.conversation(f.phone).hold,1);f.noBusiness();
 }finally{f.s.close();}}
});

test('unverified native delivery, human source, incomplete attention/activity or unknown staff leave no outgoing reply',async()=>{
 for(const variant of ['question','human','attention','activity','unknown-staff','unknown-customer']){const f=fixture();try{
  const {result}=f.answer();
  if(variant==='question')f.t.nativeQuestionVerified=false;
  if(variant==='human')f.t.nativeHumanVerified=false;
  if(variant==='attention')f.t.currentAttention=async()=>({complete:false,sources:[]});
  if(variant==='activity')f.t.currentCustomerActivity=async()=>({complete:false,sources:[]});
  if(variant==='unknown-staff')f.t.currentAttention=async()=>({complete:true,sources:[{id:'UNKNOWN_NATIVE_STAFF',line:f.line}]});
  if(variant==='unknown-customer')f.t.currentCustomerActivity=async()=>({complete:true,sources:[{id:'UNKNOWN_NATIVE_CUSTOMER',line:f.line,at:Date.now()}]});
  assert.equal((await f.consume(result)).queued,false,variant);assert.equal(f.out(),undefined,variant);f.noBusiness();
 }finally{f.s.close();}}
});

test('a genuine neutral status received while waiting is allowed without overriding any customer facts',async()=>{
 const f=fixture();try{const {result}=f.answer();f.later('Sigo pendiente');assert.equal((await f.consume(result)).queued,true);assert.match(f.s.open(f.out().body),/129\.000/);f.noBusiness();}finally{f.s.close();}
});

test('a new customer question or source during native verification stops continuation',async()=>{
 for(const variant of ['new-question','takeover-during-await','new-source-during-await']){const f=fixture();try{
  const {result}=f.answer();
  if(variant==='new-question')f.later('¿Qué producto van a usar?');
  if(variant==='takeover-during-await')f.t.currentAttention=async()=>{f.s.hold(f.phone,'SYNTHETIC_DURING_READ',true);return {complete:true,sources:[]};};
  if(variant==='new-source-during-await')f.t.currentCustomerActivity=async()=>{f.later('Son 6 habitaciones');return {complete:true,sources:f.s.db.prepare('SELECT id,line,at FROM events WHERE phone=?').all(f.phone)};};
  assert.equal((await f.consume(result)).queued,false,variant);assert.equal(f.out(),undefined);f.noBusiness();
 }finally{f.s.close();}}
});

test('queued reply is rechecked against native sources and an edit, second answer or takeover stops it',async()=>{
 for(const variant of ['valid','native-edit','second-answer','hold','new-fact','changed-output']){const f=fixture();try{
  const {result,event}=f.answer();assert.equal((await f.consume(result)).queued,true);const out=f.out();
  if(variant==='native-edit')f.t.nativeHumanText='valor 149000; incluye control de cucarachas';
  if(variant==='second-answer')acceptTesaQuotedAnswer(f.s,f.c,{...event,id:'UNREGISTERED_NATIVE_HUMAN_002',text:'valor 149000; incluye control de cucarachas'});
  if(variant==='hold')f.s.hold(f.phone,'SYNTHETIC_AFTER_QUEUE',true);
  if(variant==='new-fact')f.later('Ahora son seis habitaciones');
  if(variant==='changed-output')out.body=f.s.seal('Otro texto');
  assert.equal(await mariaUnregisteredTesaReplyStillValid(f.s,f.c,f.t,out,f.verifiers),variant==='valid',variant);f.noBusiness();
 }finally{f.s.close();}}
});

test('accepted identity mismatch and missing native verification callbacks grant no continuation',async()=>{
 for(const variant of ['case','phone','source-key','no-callback']){const f=fixture();try{
  const {result}=f.answer(),accepted={...result};if(variant==='case')accepted.caseId='OTHER_CASE';if(variant==='phone')accepted.customerPhone='573000002346';if(variant==='source-key')accepted.id='OTHER_SOURCE_KEY';
  const outcome=variant==='no-callback'?await continueMariaUnregisteredTesaCustomer(f.s,f.c,f.t,accepted):await f.consume(accepted);
  assert.equal(outcome.queued,false,variant);assert.equal(f.out(),undefined);f.noBusiness();
 }finally{f.s.close();}}
});

test('a delivered special-case quote receives direct acceptance with exact native source and a closed registration review',async()=>{
 const f=await specialCaseFixture();try{
  const e=f.later('Sí',{quotedId:f.mid}),result=mariaCaseQuoteCustomerTurn(f.s,f.c,f.s.conversation(f.phone).state,e);assert.ok(result);
  assert.equal(result.state.quotedCasePrice.accepted,true);assert.equal(result.state.quotedCasePrice.ordinaryRegistrationEligible,false);assert.equal(result.state.quotedCasePrice.acceptanceSourceId,e.id);assert.deepEqual(result.state.quotedCasePrice.acceptanceSources[0],{id:e.id,text:e.text,at:e.at,phone:e.phone,line:e.line,fromMe:false,forwarded:false,quotedId:f.mid});
  assert.equal(result.reviewTopic,'case-quotation-registration');assert.equal(result.reviewConditions.priceCop,350000);assert.equal(result.reviewConditions.quoteSourceId,'UNREGISTERED_NATIVE_HUMAN_001');assert.match(result.reply,/350\.000 COP/);assert.match(result.reply,/Falta validar el registro/);assert.match(result.reply,/no he creado la orden ni confirmado un horario/);assert.equal(result.state.programIntake,undefined);f.noBusiness();
 }finally{f.s.close();}
});

test('special-case acceptance preserves later data and status without duplicate review or restarting quotation',async()=>{
 const f=await specialCaseFixture();try{
  let e=f.later('Acepto'),result=mariaCaseQuoteCustomerTurn(f.s,f.c,f.s.conversation(f.phone).state,e);assert.ok(result);f.s.saveConversation(f.phone,result.state);const first=e.id;
  for(const text of ['Nombre: Persona Sintética\nDirección: Calle 50 # 42-18','Hola, sigo pendiente','Sí']){
   e=f.later(text);result=mariaCaseQuoteCustomerTurn(f.s,f.c,f.s.conversation(f.phone).state,e);assert.ok(result,text);assert.match(result.reply,/pendiente|Falta validar/);assert.equal(result.reviewTopic,undefined,text);assert.equal(result.state.quotedCasePrice.acceptanceSourceId,first);assert.equal(result.state.quotedCasePrice.accepted,true);assert.equal(result.state.quotedPrice,undefined);f.s.saveConversation(f.phone,result.state);
  }
  assert.equal(f.s.conversation(f.phone).state.quotedCasePrice.followupSources.length,2);f.noBusiness();
 }finally{f.s.close();}
});

test('special-case rejection cannot be revived by a later yes and never closes unrelated customer conversation',async()=>{
 const f=await specialCaseFixture();try{
  let e=f.later('No gracias'),result=mariaCaseQuoteCustomerTurn(f.s,f.c,f.s.conversation(f.phone).state,e);assert.ok(result);assert.equal(result.state.quotedCasePrice.declined,true);assert.equal(result.state.closed,undefined);f.s.saveConversation(f.phone,result.state);
  for(const text of ['Sí','Sigo pendiente','Sí']){e=f.later(text);result=mariaCaseQuoteCustomerTurn(f.s,f.c,f.s.conversation(f.phone).state,e);assert.ok(result);assert.match(result.reply,/rechazada.*nueva propuesta/);assert.equal(result.state.quotedCasePrice.accepted,false);assert.equal(result.reviewTopic,undefined);f.s.saveConversation(f.phone,result.state);}f.noBusiness();
 }finally{f.s.close();}
});

test('case acceptance requires current native case, exact delivered quote and sources, never forwarded or conditional yes',async()=>{
 for(const variant of ['hold','case','stale-case','line','undelivered','late-ack','wrong-mid','forwarded','other-quote','conditional','source-edited','answer-edited','new-facts','expired','disabled','other-event','older-event','wrong-first-line','newer-source']){
  const f=await specialCaseFixture();try{
   let state=f.s.conversation(f.phone).state;const patch={};
   if(variant==='hold')f.s.hold(f.phone,'SYNTHETIC_STAFF',true);
   if(variant==='case'){state={...state,caseId:'fumigacion:OTHER'};f.s.saveConversation(f.phone,state);}
   if(variant==='stale-case')f.s.saveConversation(f.phone,{...state,caseId:'fumigacion:OTHER'});
   if(variant==='line')patch.line=f.c.phones[1];
   if(variant==='undelivered')f.s.db.prepare("UPDATE outbox SET state='ACCEPTED' WHERE id=?").run(f.out().id);
   if(variant==='late-ack'||variant==='wrong-first-line'){const key='first-delivery:'+f.out().id,d=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value);f.s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.s.seal({...d,...(variant==='late-ack'?{verifiedAt:Date.now()+60000}:{line:f.c.phones[1]})}),key);}
   if(variant==='wrong-mid')f.s.db.prepare("UPDATE outbox SET mid='DIFFERENT' WHERE id=?").run(f.out().id);
   if(variant==='forwarded')patch.forwarded=true;
   if(variant==='other-quote')patch.quotedId='ANOTHER_MID';
   if(variant==='source-edited')f.s.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.s.seal({...f.source,text:'Otra solicitud'}),f.source.id);
   if(variant==='answer-edited'){const r=f.s.db.prepare('SELECT id,body FROM tesa_events').get();f.s.db.prepare('UPDATE tesa_events SET body=? WHERE id=?').run(f.s.seal({...f.s.open(r.body),text:'valor 490000; incluye control de cucarachas'}),r.id);}
   if(variant==='new-facts'){state={...state,slots:{...state.slots,rooms:'8 habitaciones'}};f.s.saveConversation(f.phone,state);}
   if(variant==='expired')f.s.db.prepare('UPDATE tesa_questions SET valid_until=?').run(Date.now()-1);
   if(variant==='disabled')f.c.mariaTesaUnregistered.enabled=false;
   if(variant==='older-event')patch.at=f.source.at;
   let e=f.later(variant==='conditional'?'Si me hacen descuento, sí':'Sí',patch);if(variant==='other-event')e={...e,id:'NATIVE_NOT_CAPTURED'};if(variant==='newer-source')f.later('Ahora necesito otro servicio');
   assert.equal(mariaCaseQuoteCustomerTurn(f.s,f.c,state,e),null,variant);assert.equal(f.s.conversation(f.phone).state.quotedCasePrice.accepted,false);f.noBusiness();
  }finally{f.s.close();}
 }
});

test('Engine keeps special-case acceptance, data and pending status useful without creating an ordinary service or duplicate review',async()=>{
 const f=freshEngineFixture();try{
  await f.previousQuoteQuestion();const {result}=await f.answerAndQuote(350000);assert.equal(result.ordinaryPrice,false);f.deliver(result.id);
  let e=await f.turn('Sí');let state=f.s.conversation(f.phone).state;assert.equal(state.quotedCasePrice.accepted,true);assert.equal(state.quotedCasePrice.acceptanceSourceId,e.id);assert.match(f.s.open(f.row(e.id+':reply').body),/Falta validar el registro/);const reviews=f.s.db.prepare('SELECT * FROM questions').all();assert.equal(reviews.length,1);assert.equal(reviews[0].topic,'case-quotation-registration');
  const acceptance=e.id;
  e=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18');state=f.s.conversation(f.phone).state;assert.match(f.s.open(f.row(e.id+':reply').body),/Recibí los datos.*pendiente de validación/);assert.equal(state.quotedCasePrice.acceptanceSourceId,acceptance);assert.equal(state.quotedPrice,undefined);
  e=await f.turn('Hola, sigo pendiente');assert.match(f.s.open(f.row(e.id+':reply').body),/cotización aceptada.*pendiente/);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 }finally{f.s.close();}
});

test('malformed internal answer remains under review and is never forwarded as a customer quotation',async()=>{
 const f=fixture();try{const {result}=f.answer('Dile que vale 129000 y que ya está reservado');assert.equal(result.accepted,true);assert.equal((await f.consume(result)).queued,false);assert.equal(f.out(),undefined);assert.equal(f.s.conversation(f.phone).state.awaitingHumanReview,true);f.noBusiness();}finally{f.s.close();}
});

test('Engine follows a new native TESA answer through own ordinary quote, direct acceptance, fields and pending registration payload',async()=>{
 const f=freshEngineFixture();try{
  const {two}=await f.previousQuoteQuestion(),{result}=await f.answerAndQuote();assert.equal(result.ordinaryPrice,true);const quoteId=result.id,mid=f.deliver(quoteId);
  let e=await f.turn('Sí');let state=f.s.conversation(f.phone).state;assert.equal(state.quotedPrice.accepted,true);assert.equal(state.quotedPrice.sourceId,two.id);assert.equal(state.quotedPrice.replyId,quoteId);assert.match(f.s.open(f.row(e.id+':reply').body),/nombre completo.*dirección completa/s);f.deliver(e.id+':reply',e.at);
  e=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');assert.match(f.s.open(f.row(e.id+':reply').body),/Persona Sintética/);assert.match(f.s.open(f.row(e.id+':reply').body),/Calle 50 # 42-18 apartamento 301/);f.deliver(e.id+':reply',e.at);
  e=await f.turn('Confirmo');state=f.s.conversation(f.phone).state;const ledger=f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+state.caseId);assert.ok(ledger);const entry=f.s.open(ledger.value),p=entry.payload;
  assert.equal(entry.status,'PENDING');assert.equal(p.customerName,'Persona Sintética');assert.equal(p.address,'Calle 50 # 42-18 apartamento 301');assert.equal(p.quote.priceCop,129000);assert.equal(p.quote.mid,mid);assert.equal(p.quote.sourceId,two.id);assert.equal(p.quote.acceptanceId,e.id);assert.equal(p.sources.customerName.id,p.sources.address.id);assert.equal(p.sources.acceptance.id,e.id);assert.equal(p.sources.acceptance.fromMe,false);assert.equal(p.sources.acceptance.forwarded,false);assert.equal(p.phone,f.phone);assert.equal(p.line,f.line);assert.equal(p.municipality,'medellin');assert.equal(p.slots.service,'cucarachas');assert.equal(p.slots.rooms,'2 habitaciones');assert.equal(p.createdById,undefined);assert.equal(p.advisorMembershipId,undefined);assert.equal(p.scheduled,undefined);assert.equal(p.paymentRecorded,undefined);assert.equal(entry.receipt,undefined);assert.equal(f.c.mariaProgram.actorId,'7508385b-536e-4aa2-8137-d734dfc900ef');assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM events WHERE id LIKE 'tesa-unregistered:%'").get().n,0);
 }finally{f.s.close();}
});

test('the reported house intake consumes the announced TESA format once and keeps special-price acceptance under registration review',async()=>{
 const f=freshEngineFixture();try{
  const first='1. Cucarachas, arañas y hormigas\n2. casa\n3. Medellín, san Antonio de Prado',last='Son 2 habitaciones, casa de dos pisos, 2 baños, la cocina y zona de ropas un poco menos de 70 mts';
  assert.equal(extractSlots(first,'fumigacion').service,'cucarachas y hormigas y arañas');
  let e=await f.turn('Buenas tardes');f.deliver(e.id+':reply');
  e=await f.turn(first);assert.match(f.s.open(f.row(e.id+':reply').body),/habitaciones o metros cuadrados/);f.deliver(e.id+':reply');
  e=await f.turn(last);const state=f.s.conversation(f.phone).state,q=f.ownQuestion(),questionText=f.s.open(f.s.db.prepare('SELECT body FROM tesa_outbox WHERE question_id=?').get(q.id).body);
  assert.equal(state.slots.service,'cucarachas y hormigas y arañas');assert.equal(state.slots.site,'casa');assert.equal(state.slots.rooms,'2 habitaciones');assert.equal(state.slots.area,undefined);assert.match(state.slots.floors,/2|dos/);assert.equal(state.slots.location,'medellin');assert.match(state.slots.locationDetails,/san antonio de prado/i);
  assert.equal(q.topic,'cotizacion-verificada');assert.match(questionText,/valor total \[importe\]; incluye \[alcance\]/);assert.match(questionText,/cucarachas y hormigas y arañas/);assert.match(questionText,/habitaciones/i);assert.ok(questionText.includes(last));assert.match(questionText,/Pisos informados: (?:2|dos)/);
  const scope='control de hormigas, arañas y cucarachas en casa de dos pisos',answer='valor total: $350.000 COP; incluye: '+scope,{result,accepted,t}=await f.answerAndQuote(350000,answer);
  assert.equal(result.ordinaryPrice,false);assert.ok(f.s.open(f.row(result.id).body).includes('$350.000 COP e incluye '+scope));assert.equal(f.s.conversation(f.phone).state.quotedCasePrice.scope,scope);
  const duplicate=await continueMariaUnregisteredTesaCustomer(f.s,f.c,t,accepted,{});assert.equal(duplicate.duplicate,true);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'tesa-unregistered:%'").get().n,1);f.deliver(result.id);
  e=await f.turn('Sí');const confirmed=f.s.conversation(f.phone).state;assert.equal(confirmed.quotedCasePrice.accepted,true);assert.equal(confirmed.quotedCasePrice.acceptanceSourceId,e.id);assert.equal(confirmed.quotedCasePrice.status,'REGISTRATION_REVIEW');assert.equal(confirmed.quotedCasePrice.ordinaryRegistrationEligible,false);assert.equal(confirmed.quotedPrice,undefined);assert.equal(confirmed.awaitingHumanReview,true);assert.match(f.s.open(f.row(e.id+':reply').body),/Falta validar el registro del servicio/);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 }finally{f.s.close();}
});
