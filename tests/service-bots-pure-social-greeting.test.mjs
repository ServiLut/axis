import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {MARIA_UNDERSTANDING_GUARD} from '../automation/service-bots/maria-understanding.mjs';
const event=(text='Cómo está?',id='AC778BE95BCEBB7D5E0FD99777FE2A44')=>({id,text,phone:'573000008123',line:'573126944997',at:1791478326000,kind:'text',fromMe:false,forwarded:false});
const general=e=>({company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,intent:{kind:'general-question',evidence:e.text}});
const initial=()=>({slots:{service:'cucarachas',site:'apartamento',location:'medellin'},asked:['size'],introduced:true,initialIntakeAllRequested:true,caseId:'LOCAL_CASE'});
const fixture=()=>{const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:1791478000000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'local-'+i}))};const s=new Store(':memory:',c.company,randomBytes(32));return {c,s,engine:new Engine(s,c)};};
test('exact native social source overrides a cached general-question label without opening operational review',()=>{
 const e=event(),state=initial(),d=customerDecision('fumigacion',state,e,general(e));
 assert.equal(d.courtesy,true);assert.equal(d.socialGreeting,true);assert.equal(d.review,undefined);assert.equal(d.question,undefined);
 assert.deepEqual(d.state.slots,state.slots);assert.deepEqual(d.state.asked,state.asked);assert.equal(d.state.caseId,state.caseId);
 assert.equal(d.reply,'Gracias por preguntar. Estoy aquí para ayudarte.');assert.deepEqual(state,initial());
});
test('pure forms accept punctuation and greeting prefix, not extra content',()=>{
 for(const text of ['Cómo está?','¿Cómo está?','¿Cómo estás?','Como estan?','Hola, ¿cómo está?','Buenas tardes, ¿cómo está?'])assert.equal(customerDecision('fumigacion',{slots:{},asked:[]},event(text),general(event(text))).courtesy,true,text);
});
test('greeting plus task, followup, warranty or safety retains its substantive route',()=>{
 const cases=[['Cómo está? Necesito fumigar mi casa','general-question'],['Hola, ¿cómo está? Necesito un refuerzo','reinforcement'],['Cómo está? Quiero verificar el tratamiento anterior','verification'],['Cómo está? Reclamo la garantía','warranty-claim'],['Cómo está? Tengo intoxicación','general-question'],['Cómo está el servicio?','general-question']];
 for(const [text,kind] of cases){const e=event(text),d=customerDecision('fumigacion',initial(),e,{...general(e),intent:{kind,evidence:text}});assert.notEqual(d.socialGreeting,true,text);assert.notEqual(d.courtesy,true,text);}
});
test('historical-service question is not a pure social greeting',()=>{
 const e=event('Buenas noches. Ustedes son los que frecuentemente fumigan aquí en villa florida 2 en Medellín?');
 const d=customerDecision('fumigacion',initial(),e,general(e));assert.equal(d.reviewConditions.kind,'general-question');assert.notEqual(d.courtesy,true);
});
test('parvovirus, audio and forwarded message retain review',()=>{
 for(const e of [event('Hola cómo está? Necesito desinfección especial por parvovirus'),{...event('Cómo está?'),kind:'audio'},{...event('Cómo está?'),forwarded:true}])assert.notEqual(customerDecision('fumigacion',initial(),e,general(e)).socialGreeting,true);
});
test('other company does not receive FUM social guard',()=>{
 const e=event();assert.notEqual(customerDecision('servicio-tecnico',initial(),e,general(e)).socialGreeting,true);
});
test('rapid initial greeting followed by exact social question produces no operational questions or alerts',async()=>{
 const f=fixture();try{
  const first=event('Hola buenas tardes','LOCAL_GREETING_BEFORE_SOCIAL');first.at-=1000;f.s.enqueue(first);await f.engine.process(first);
  const before=f.s.conversation(first.phone).state;
  const e=event();f.s.enqueue(e);await f.engine.process(e,general(e));
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,0);
  const rows=f.s.db.prepare('SELECT body FROM outbox WHERE id=?').all(e.id+':reply');assert.equal(rows.length,1);
  assert.equal(f.s.open(rows[0].body),'Gracias por preguntar. Estoy aquí para ayudarte.');
  const after=f.s.conversation(e.phone).state;assert.deepEqual(after.slots,before.slots);assert.deepEqual(after.asked,before.asked);assert.equal(after.caseId,before.caseId);
 }finally{f.s.close();}
});
test('human hold and previously pending review are not released by a social greeting',async()=>{
 for(const mode of ['hold','review']){const f=fixture();try{
  const first=event('Hola','LOCAL_SETUP_HUMAN_CASE');first.at-=1000;f.s.enqueue(first);await f.engine.process(first);f.s.db.prepare('DELETE FROM outbox').run();
  const e=event();const current=f.s.conversation(e.phone).state;f.s.saveConversation(e.phone,{...current,...(mode==='review'?{awaitingHumanReview:true}:{})});if(mode==='hold')f.s.hold(e.phone,'LOCAL_STAFF');
  f.s.enqueue(e);await f.engine.process(e,general(e));assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  const c=f.s.conversation(e.phone);if(mode==='hold')assert.equal(c.hold,1);else assert.equal(c.state.awaitingHumanReview,true);
 }finally{f.s.close();}}
});
