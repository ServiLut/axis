import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,HILARY} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {initializeTesaStore,prepareTesaQuestion,bindTesaQuestionDelivery,acceptTesaQuotedAnswer} from '../automation/service-bots/tesa-operations.mjs';
import {formatMariaTesaQuestion} from '../automation/service-bots/tesa-question-wording.mjs';
import {parseMariaUnregisteredTesaAnswer,prepareMariaUnregisteredTesaPlan,continueMariaUnregisteredTesaCustomer,MARIA_UNREGISTERED_TESA_PREFIX} from '../automation/service-bots/maria-tesa-unregistered.mjs';

const facts={service:'cucarachas y hormigas y arañas',site:'casa',location:'medellin',locationDetails:'San Antonio de Prado',rooms:'2 habitaciones',area:'un poco menos de 70 mts',floors:'dos pisos'};

function fixture({service=facts.service}={}){
 const now=Date.now(),start=now-5000,phone='573000009212',line=BUSINESSES.fumigacion.phones[0],participants=[...TESA_BOT_PHONES,HILARY];
 const s=new Store(':memory:','fumigacion',randomBytes(32));initializeTesaStore(s);
 const c={...BUSINESSES.fumigacion,company:'fumigacion',enabled:true,activatedAt:start,operatorRouting:CURRENT_OPERATOR_ROUTING,mariaTesaUnregistered:{enabled:true,startsAt:start},lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'case-quote-test-'+i})),tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:line,activatedAt:start,allowedParticipantPhones:[HILARY],verifiedMembership:{owner:line,ownerOpen:true,verifiedAt:now,expiresAt:now+300000,sourceHash:'b'.repeat(64),participantPhones:participants,participantBindings:participants.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}}};
 const source={id:'CASE_QUOTE_CUSTOMER_SOURCE',phone,line,kind:'text',fromMe:false,forwarded:false,at:now-2000,text:'Son 2 habitaciones, casa de dos pisos, 2 baños, la cocina y zona de ropas un poco menos de 70 mts'},caseId='fumigacion:'+source.id,slots={...facts,service};
 s.enqueue(source);s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(source.id);s.saveConversation(phone,{caseId,slots,asked:[],awaitingHumanReview:true});
 const request={phone,line,caseId,topic:'cotizacion-verificada',conditions:{...slots},source:source.id,text:formatMariaTesaQuestion({bot:'María Ángel',name:'Fumigación',reference:caseId,last4:phone.slice(-4),lineLast4:line.slice(-4),topic:'cotizacion-verificada',contextFacts:slots})};
 const question=prepareTesaQuestion(s,c,request);assert.equal(question.created,true);assert.equal(prepareMariaUnregisteredTesaPlan(s,c,request,question).prepared,true);
 s.saveConversation(phone,{...s.conversation(phone).state,pendingTesaQuestionId:question.id});
 const mid='CASE_QUOTE_NATIVE_QUESTION_MID';s.db.prepare("UPDATE tesa_outbox SET state='ACCEPTED',mid=? WHERE question_id=?").run(mid,question.id);
 bindTesaQuestionDelivery(s,c,{outboxId:question.outboxId,mid,groupJid:TESA_GROUP_JID,senderLine:line,text:s.open(s.db.prepare('SELECT body FROM tesa_outbox WHERE id=?').get(question.outboxId).body),state:'DELIVERED',at:now,nativeVerified:true});
 const t={currentAttention:async()=>({complete:true,sources:[]}),currentCustomerActivity:async()=>({complete:true,sources:s.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0').all(phone)})};
 let expectedAnswer;
 const verifiers={verifyQuestionDelivery:async()=>true,verifyHumanAnswer:async(config,transport,q,answer)=>q.id===question.id&&answer.text===expectedAnswer};
 const answer=async(text,patch={},beforeConsume=()=>{})=>{
  expectedAnswer=text;
  const event={id:'CASE_QUOTE_NATIVE_HUMAN',company:'fumigacion',groupJid:TESA_GROUP_JID,line,receivingLine:line,participant:{phone:HILARY,jid:HILARY+'@s.whatsapp.net'},at:Date.now(),kind:'text',text,fromMe:false,forwarded:false,quote:{mid,groupJid:TESA_GROUP_JID,participantJid:line+'@s.whatsapp.net'},...patch};
  const accepted=acceptTesaQuotedAnswer(s,c,event);beforeConsume();return {accepted,outcome:await continueMariaUnregisteredTesaCustomer(s,c,t,accepted,verifiers)};
 };
 const out=()=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(MARIA_UNREGISTERED_TESA_PREFIX+question.id);
 const noBusiness=()=>assert.equal(s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 return {s,c,t,phone,line,slots,request,question,answer,out,noBusiness};
}

test('the announced answer format and equivalent human amount labels parse without a price inference',()=>{
 const rendered=formatMariaTesaQuestion({topic:'cotizacion-verificada',contextFacts:facts}),advertised=rendered.match(/Ejemplo de formato \(por completar\): ([^/]+) \/ falta/)[1];
 const announced=advertised.replace('[importe]','$350.000 COP').replace('[alcance]','control de arañas, hormigas y cucarachas');
 for(const text of [announced,'valor 350000; incluye control de cucarachas','VALOR TOTAL: $350.000 pesos; INCLUYE: control de cucarachas','precio: COP 350000\nincluye: control de cucarachas','Precio total 350000 COP; incluye control de cucarachas','cotización $350.000; incluye control de cucarachas','cotizacion total: 350000 pesos; incluye control de cucarachas','total: $350.000\nincluye: control de cucarachas']){
  const parsed=parseMariaUnregisteredTesaAnswer(text);assert.equal(parsed?.kind,'case-quote',text);assert.equal(parsed.priceCop,350000,text);
 }
});

test('a number alone, range, instruction, policy, uncertain scope or ambiguous amount never becomes a quote',()=>{
 for(const text of ['350000','valor total 350000','valor total 350000; incluye','precio entre 100000 y 350000; incluye control de cucarachas','precio 100000-350000; incluye control de cucarachas','precio 350,00; incluye control de cucarachas','precio COP 350000 pesos; incluye control de cucarachas','Dile precio 350000; incluye control de cucarachas','precio 350000; incluye control de cucarachas con descuento','precio 350000; incluye control de cucarachas con garantía','precio 350000; incluye control de cucarachas si acepta','precio 350000; incluye control de cucarachas o arañas','precio 350000; incluye control de cucarachas sin hormigas','precio 350000; incluye control de cucarachas hasta el patio','precio 350000; incluye control de cucarachas costo adicional 50000','precio 350000; incluye control de cucarachas; reserva mañana','precio 350000; incluye control de cucarachas\nordena el servicio'])assert.equal(parseMariaUnregisteredTesaAnswer(text),null,text);
});

test('native quoted multi-pest coverage accepts a different order and singular or plural, exactly once',async()=>{
 for(const scope of ['control de arañas, hormigas y cucarachas','fumigación para cucaracha, araña y hormiga en casa de dos pisos','control de hormigas y cucarachas y arañas']){
  const f=fixture();try{
   const {accepted,outcome}=await f.answer('valor total $350.000 COP; incluye '+scope);assert.equal(accepted.accepted,true);assert.equal(outcome.queued,true);assert.equal(outcome.ordinaryPrice,false);
   const state=f.s.conversation(f.phone).state,out=f.out();assert.match(f.s.open(out.body),/350\.000 COP/);assert.ok(f.s.open(out.body).includes(scope));assert.equal(state.quotedCasePrice.priceCop,350000);assert.equal(state.quotedCasePrice.scope,scope);assert.equal(state.quotedCasePrice.ordinaryRegistrationEligible,false);assert.equal(state.quotedPrice,undefined);assert.deepEqual(state.slots,f.slots);
   const duplicate=await continueMariaUnregisteredTesaCustomer(f.s,f.c,f.t,accepted,{});assert.equal(duplicate.duplicate,true);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);f.noBusiness();
  }finally{f.s.close();}
 }
});

test('multi-pest omission, expansion and broad substitutions remain under review',async()=>{
 for(const scope of ['control de cucarachas y hormigas','control de cucarachas y arañas','control de hormigas y arañas','control de cucarachas, hormigas, arañas y roedores','control de cucarachas, hormigas y arañas y otras plagas','control de cucarachas, hormigas, arañas y todos los insectos','control de plagas']){
  const f=fixture();try{const {outcome}=await f.answer('valor total 350000; incluye '+scope);assert.equal(outcome.queued,false,scope);assert.equal(f.out(),undefined);assert.equal(f.s.conversation(f.phone).state.awaitingHumanReview,true);f.noBusiness();}finally{f.s.close();}
 }
});

test('an extra pest formerly absent from the exclusion list never extends a single-pest scope',async()=>{
 for(const extra of ['arañas','avispas','mosquitos','moscas','zancudos','chiripas','termitas','garrapatas','alacranes','escorpiones','ácaros']){
  const f=fixture({service:'cucarachas'});try{const {outcome}=await f.answer('valor total 350000; incluye control de cucarachas y '+extra);assert.equal(outcome.queued,false,extra);assert.equal(f.out(),undefined);f.noBusiness();}finally{f.s.close();}
 }
});

test('the more natural label cannot bypass a human hold, question expiry or the native quotation',async()=>{
 for(const variant of ['hold','expired','unquoted']){
  const f=fixture();try{
   if(variant==='hold')f.s.hold(f.phone,'SYNTHETIC_STAFF_TAKEOVER',true);
   const {outcome}=await f.answer('precio total 350000; incluye control de arañas, hormigas y cucarachas',variant==='unquoted'?{quote:undefined}:{},()=>{if(variant==='expired')f.s.db.prepare('UPDATE tesa_questions SET valid_until=? WHERE id=?').run(Date.now()-1,f.question.id);});
   assert.equal(outcome.queued,false,variant);assert.equal(f.out(),undefined);if(variant==='hold')assert.equal(f.s.conversation(f.phone).hold,1);f.noBusiness();
  }finally{f.s.close();}
 }
});
