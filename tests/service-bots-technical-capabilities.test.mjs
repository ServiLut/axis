import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {Engine,customerDecision,extractSlots} from '../automation/service-bots/engine.mjs';
import {registrationStatus} from '../automation/service-bots/maria-program.mjs';
import {MIGUEL_CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {MIGUEL_UNDERSTANDING_GUARD} from '../automation/service-bots/miguel-understanding.mjs';

test('technical reception never calls a local question a persisted business registration',()=>{
 const decision=customerDecision('servicio-tecnico',{slots:{service:'nevera',detail:'no enfría',location:'medellin',preference:'mañana'},asked:['preference']},{kind:'text',text:'Mañana',fromMe:false});
 assert.equal(decision.question.topic,'disponibilidad-y-cotizacion');assert.match(decision.reply,/Recibí tu solicitud/);assert.doesNotMatch(decision.reply,/registrad|guardad|agendad/);
});
test('technical status exposes only its own scope and cannot present a Maria program actor',()=>{
 const s=new Store(':memory:','servicio-tecnico',randomBytes(32));try{
  const result=registrationStatus({company:'servicio-tecnico',...BUSINESSES['servicio-tecnico'],lines:BUSINESSES['servicio-tecnico'].phones.map(phone=>({phone})),mariaProgram:{enabled:true,actorId:'FOREIGN_MARIA_ACTOR'}},s);
  assert.equal(result.company,'S.TECNICO');assert.equal(result.enabled,false);assert.equal(result.configured,false);assert.equal(result.guard,null);assert.equal(result.advisorMembershipId,null);assert.equal(result.companyId,null);assert.equal(result.tenantId,null);assert.equal(result.saved,0);
  assert.equal(JSON.stringify(result).includes('FOREIGN_MARIA_ACTOR'),false);
 }finally{s.close();}
});
test('a technical pure social greeting preserves a pending intake rather than creating review',()=>{
 const prior={slots:{service:'nevera'},asked:['detail']};
 const decision=customerDecision('servicio-tecnico',prior,{kind:'text',text:'Hola, ¿cómo está?',fromMe:false,forwarded:false});
 assert.equal(decision.socialGreeting,true);assert.deepEqual(decision.state.slots,prior.slots);assert.equal(decision.review,undefined);assert.equal(decision.question,undefined);
});
test('native technical facts cannot restore an equipment or city denied in the actual text',()=>{
 const slots=extractSlots('No tengo nevera. No estoy en Bello. Mi lavadora no centrifuga en Medellín.','servicio-tecnico');
 assert.equal(slots.service,'lavadora');assert.equal(slots.location,'medellin');
 assert.deepEqual(extractSlots('Si tuviera una nevera en Envigado necesitaría una revisión.','servicio-tecnico'),{});
});
test('verified technical post-service intent preserves the original repair instead of opening new intake',()=>{
 const e={id:'TECH_OLD_REPAIR_SOURCE',kind:'text',text:'Repararon mi lavadora y sigue sin centrifugar.',fromMe:false,forwarded:false,at:Date.now()};
 const analysis={company:'S.TECNICO',eventId:e.id,guard:MIGUEL_CONVERSATIONAL_AI_GUARD,semanticGuard:MIGUEL_UNDERSTANDING_GUARD,intent:{kind:'post-service',evidence:e.text},slots:{service:'lavadora',detail:'sin centrifugar'}};
 const d=customerDecision('servicio-tecnico',{slots:{},asked:[]},e,analysis);
 assert.equal(d.reviewTopic,'service-followup');assert.equal(d.state.requestedTechnicalReview.sourceId,e.id);assert.equal(d.question,undefined);assert.doesNotMatch(d.reply,/qué falla|día y franja|registrad/);
 const next=customerDecision('servicio-tecnico',d.state,{...e,id:'TECH_OLD_DETAIL_SOURCE',text:'En Medellín'},{});
 assert.equal(next.reviewSource,e.id);assert.equal(next.question,undefined);
});
test('verified painting question checks offered scope before asking about fault or scheduling',()=>{
 const e={id:'TECH_PAINTING_QUESTION',kind:'text',text:'¿Pintan neveras?',fromMe:false,forwarded:false,at:Date.now()};
 const a={company:'S.TECNICO',eventId:e.id,guard:MIGUEL_CONVERSATIONAL_AI_GUARD,semanticGuard:MIGUEL_UNDERSTANDING_GUARD,intent:{kind:'painting-scope',evidence:e.text},slots:{}};
 const d=customerDecision('servicio-tecnico',{slots:{},asked:[]},e,a);
 assert.equal(d.reviewConditions.kind,'technical-painting');assert.doesNotMatch(d.reply,/qué falla|día y franja|registrad/);
});

test('own technical general capacity inquiry naming equipment does not open repair intake',()=>{
 const e={id:'TECH_PURCHASE_CAPACITY',kind:'text',text:'Compran neveras dañadas para repuestos',fromMe:false,forwarded:false,at:Date.now()};
 const a={company:'S.TECNICO',eventId:e.id,guard:MIGUEL_CONVERSATIONAL_AI_GUARD,semanticGuard:MIGUEL_UNDERSTANDING_GUARD,intent:{kind:'general-question',evidence:e.text},slots:{service:'neveras'}};
 const prior={slots:{},asked:[]},d=customerDecision('servicio-tecnico',prior,e,a);
 assert.equal(d.reviewTopic,'customer-question');assert.deepEqual(d.state.slots,prior.slots);assert.equal(d.question,undefined);assert.doesNotMatch(d.reply,/qué falla|día y franja|registrad/);
});

test('technical preference provided with initial facts is never requested again',()=>{
 const d=customerDecision('servicio-tecnico',{slots:{service:'nevera',detail:'no enfría',location:'medellin',preference:'mañana en la tarde'},asked:[]},{kind:'text',text:'Listo para la revisión',fromMe:false,forwarded:false});
 assert.equal(d.question.topic,'disponibilidad-y-cotizacion');assert.equal(d.state.slots.preference,'mañana en la tarde');assert.doesNotMatch(d.reply,/qué día|franja horaria prefieres/);
});

test('technical guarantee claim and later location retain the first repair concern',()=>{
 const e={id:'TECH_GUARANTEE_FIRST',kind:'text',text:'Quiero reclamar la garantía de la reparación de mi lavadora.',fromMe:false,forwarded:false,at:Date.now()};
 const a={company:'S.TECNICO',eventId:e.id,guard:MIGUEL_CONVERSATIONAL_AI_GUARD,semanticGuard:MIGUEL_UNDERSTANDING_GUARD,intent:{kind:'warranty-claim',evidence:e.text},slots:{service:'lavadora'}};
 const d=customerDecision('servicio-tecnico',{slots:{},asked:[]},e,a);
 assert.equal(d.reviewTopic,'warranty-review');assert.equal(d.state.requestedTechnicalReview.sourceId,e.id);
 const next=customerDecision('servicio-tecnico',d.state,{...e,id:'TECH_GUARANTEE_LOCATION',text:'En Medellín'},{});
 assert.equal(next.reviewSource,e.id);assert.equal(next.reviewTopic,'warranty-review');assert.equal(next.question,undefined);assert.doesNotMatch(next.reply,/qué falla|día y franja|registrad/);
});

test('technical equipment metaquestion keeps the same case, fields and no operational question',async()=>{
 const c={company:'servicio-tecnico',...BUSINESSES['servicio-tecnico'],enabled:true,lines:BUSINESSES['servicio-tecnico'].phones.map(phone=>({phone,instance:'isolated-'+phone}))};
 const s=new Store(':memory:',c.company,randomBytes(32));try{
  const at=Date.now(),e={id:'TECH_OTHER_EQUIPMENT_META',phone:'573000005432',line:c.lines[0].phone,at,kind:'text',fromMe:false,forwarded:false,text:'Por qué me preguntas por otro equipo'};
  const prior={caseId:'TECH_EXISTING_CASE',slots:{service:'nevera',detail:'no enfría',location:'medellin',preference:'mañana'},asked:['detail'],introduced:true};
  s.enqueue(e);s.saveConversation(e.phone,prior);await new Engine(s,c).process(e);
  const result=s.conversation(e.phone).state;
  assert.equal(result.caseId,prior.caseId);assert.deepEqual(result.slots,prior.slots);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  const row=s.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply');assert.match(s.open(row.body),/nevera/);assert.doesNotMatch(s.open(row.body),/registrad|revisión|pendiente|qué equipo/);
 }finally{s.close();}
});

test('technical metaquestion cannot become the requested fault, while explicit correction remains literal',()=>{
 const prior={slots:{service:'nevera'},asked:['detail']};
 const d=customerDecision('servicio-tecnico',prior,{kind:'text',text:'Por qué preguntas otra vez',fromMe:false,forwarded:false});
 assert.deepEqual(d.state.slots,prior.slots);assert.equal(d.review,undefined);assert.deepEqual(extractSlots('Por qué preguntas por mi nevera otra vez','servicio-tecnico'),{});
 const corrected=customerDecision('servicio-tecnico',prior,{kind:'text',text:'Ya te dije que es una lavadora, no una nevera',fromMe:false,forwarded:false});
 assert.equal(corrected.state.slots.service,'lavadora');assert.equal(corrected.state.slots.detail,undefined);
});
