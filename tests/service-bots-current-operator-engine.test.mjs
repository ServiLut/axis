import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,DIEGO,HILARY,CURRENT_OPERATOR_ROUTING,TECHNICAL_COORDINATOR} from '../automation/service-bots/config.mjs';

function setup(company='fumigacion'){
 const config={company,...BUSINESSES[company],operatorRouting:CURRENT_OPERATOR_ROUTING,enabled:true,chiefOnly:true,activatedAt:Date.now()-60000,lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'current-local-'+i}))};
 const store=new Store(':memory:',company,randomBytes(32));return {config,store,engine:new Engine(store,config)};
}
const ev=(f,patch={})=>({id:'CURRENT_ENGINE_SOURCE_001',phone:'573001112233',at:Date.now(),line:f.config.lines[0].phone,kind:'text',fromMe:false,text:'Hola',...patch});
const process=async(f,e)=>{f.store.enqueue(e);await f.engine.process(e);};
const state=(f,id)=>f.store.db.prepare('SELECT state FROM events WHERE id=?').get(id).state;
function oldQuestion(f,recipient=DIEGO,delivery='DELIVERED',questionState='PENDING'){
 const question=f.store.question({phone:'573001112233',line:f.config.lines[0].phone,caseId:'CURRENT_OLD_CASE',topic:'cotizacion-verificada',conditions:{service:'cucarachas'},recipient,text:'Consulta original del caso.',source:'CURRENT_OLD_SOURCE'});
 const outbound=f.store.db.prepare('SELECT * FROM outbox WHERE phone=?').get(recipient);
 f.store.db.prepare('UPDATE outbox SET state=?,mid=? WHERE id=?').run(delivery,'CURRENT_OLD_QUESTION_MID',outbound.id);
 f.store.db.prepare('UPDATE questions SET state=? WHERE id=?').run(questionState,question.id);
 return {question,outbound};
}

test('new route preserves an exact pending historical Diego answer without a new acknowledgement',async()=>{
 const f=setup();try{
  const {question}=oldQuestion(f);const e=ev(f,{phone:DIEGO,text:'Para este caso el técnico puede ir mañana a las 3 de la tarde.',quotedId:'CURRENT_OLD_QUESTION_MID'});
  await process(f,e);const row=f.store.db.prepare('SELECT * FROM questions WHERE id=?').get(question.id);
  assert.equal(state(f,e.id),'CASE_ANSWER');assert.equal(row.state,'ANSWERED');assert.equal(row.source_id,e.id);assert.equal(row.case_id,'CURRENT_OLD_CASE');
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM audit WHERE action=?').get('CASE_ANSWER_LEARNED').n,1);
 }finally{f.store.close();}
});
test('new route observes uncited Diego status, capabilities and commands without dialogue or release',async()=>{
 for(const text of ['María Ángel, estás activa?','María Ángel, qué puedes hacer?','María Ángel, retoma el chat de 573001112233']){
  const f=setup();try{
   f.store.enqueue(ev(f,{id:'CURRENT_CUSTOMER_HOLD'}));f.store.hold('573001112233','CURRENT_STAFF',true);
   const e=ev(f,{phone:DIEGO,text});await process(f,e);
   assert.equal(state(f,e.id),'OBSERVED_INTERNAL');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(f.store.conversation('573001112233').hold,1);
  }finally{f.store.close();}
 }
});
test('Diego quote must be same line, delivered and an eligible question; forwarded and media remain observed',async()=>{
 const variants=[{delivery:'ACCEPTED'},{questionState:'EXPIRED'},{lineIndex:1},{forwarded:true},{kind:'audio'}];
 for(const patch of variants){const f=setup();try{
  const {question}=oldQuestion(f,DIEGO,patch.delivery||'DELIVERED',patch.questionState||'PENDING');
  const e=ev(f,{phone:DIEGO,line:f.config.lines[patch.lineIndex||0].phone,kind:patch.kind||'text',forwarded:patch.forwarded||false,quotedId:'CURRENT_OLD_QUESTION_MID',text:'María Ángel, estás activa?'});await process(f,e);
  assert.equal(state(f,e.id),patch.forwarded?'OBSERVED_FORWARDED':'OBSERVED_INTERNAL');
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);
  assert.equal(f.store.db.prepare('SELECT state FROM questions WHERE id=?').get(question.id).state,patch.questionState||'PENDING');
 }finally{f.store.close();}}
});
test('exact additional quoted Diego or technical coordinator source is preserved for review without acknowledgement',async()=>{
 for(const [company,recipient] of [['fumigacion',DIEGO],['servicio-tecnico',TECHNICAL_COORDINATOR]]){
  const f=setup(company);try{
   const {question}=oldQuestion(f,recipient);
   const first=ev(f,{id:'CURRENT_FIRST_ANSWER',phone:recipient,text:'Para este caso el técnico puede ir mañana a las 3.',quotedId:'CURRENT_OLD_QUESTION_MID'});
   await process(f,first);const outboundBefore=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
   const second=ev(f,{id:'CURRENT_SECOND_ANSWER',phone:recipient,text:'Para este caso tendría que ser a las 4.',quotedId:'CURRENT_OLD_QUESTION_MID'});
   await process(f,second);const row=f.store.db.prepare('SELECT * FROM questions WHERE id=?').get(question.id);
   assert.equal(state(f,second.id),'ANSWER_REVIEW');assert.equal(row.state,'ANSWER_REVIEW');assert.equal(row.source_id,first.id);assert.equal(f.store.open(row.answer),first.text);
   assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,outboundBefore);
   const audit=f.store.db.prepare('SELECT detail FROM audit WHERE action=?').get('CASE_ANSWER_ADDITIONAL_SOURCE_REVIEW');
   assert.equal(f.store.open(audit.detail).text,second.text);assert.equal(f.store.open(audit.detail).priorSource,first.id);
  }finally{f.store.close();}
 }
});
test('own delivered output that is not a question gives Diego no directed-dialogue exception',async()=>{
 const f=setup();try{
  const out=f.store.queue('CURRENT_OLD_STATUS',DIEGO,f.config.lines[0].phone,'Mensaje histórico.',true,0);
  f.store.db.prepare("UPDATE outbox SET state='DELIVERED',mid='CURRENT_STATUS_MID' WHERE id=?").run(out.id||'CURRENT_OLD_STATUS');
  const e=ev(f,{phone:DIEGO,text:'María Ángel, estás activa?',quotedId:'CURRENT_STATUS_MID'});await process(f,e);
  assert.equal(state(f,e.id),'OBSERVED_INTERNAL');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);
 }finally{f.store.close();}
});
test('FUM observes technical business lines outside scope without bot dialogue',async()=>{
 for(const phone of BUSINESSES['servicio-tecnico'].phones){const f=setup();try{
  const e=ev(f,{phone,text:'María Ángel, estás activa?'});await process(f,e);
  assert.equal(state(f,e.id),'OBSERVED_INTERNAL_OUTSIDE_SCOPE');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}}
});
test('technical runtime observes uncited FUM coordination line but admits an exact pending answer',async()=>{
 for(const cited of [false,true]){const f=setup('servicio-tecnico');try{
  const original=cited?oldQuestion(f,TECHNICAL_COORDINATOR):null;
  const e=ev(f,{phone:TECHNICAL_COORDINATOR,text:cited?'Para este caso el técnico puede ir mañana a las 3.':'Miguel Ángel, estás activo?',quotedId:cited?'CURRENT_OLD_QUESTION_MID':null});await process(f,e);
  assert.equal(state(f,e.id),cited?'CASE_ANSWER':'OBSERVED_INTERNAL');
  if(cited)assert.equal(f.store.db.prepare('SELECT state FROM questions WHERE id=?').get(original.question.id).state,'ANSWERED');
  else assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}}
});
test('engine passes followup kind so arrival goes to Hilary and refuerzo remains with Sandra',async()=>{
 for(const [text,expected] of [['El técnico no ha llegado',HILARY],['Necesito un refuerzo del servicio anterior',SANDRA],['Quiero verificar el tratamiento anterior',SANDRA]]){
  const f=setup();try{
   const e=ev(f,{text});await process(f,e);
   const phones=f.store.db.prepare('SELECT DISTINCT phone FROM outbox WHERE internal=1').all().map(row=>row.phone);
   assert.deepEqual(phones,[expected],text);
  }finally{f.store.close();}
 }
});
