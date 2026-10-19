import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,publicTextSafe} from '../automation/service-bots/config.mjs';
import {adviserReply} from '../automation/service-bots/adviser-tone.mjs';
import {commonQuestionTopics,selectCommonAnswer} from '../automation/service-bots/faq.mjs';
import {OFFICE_CUSTOMER_REPLY_SOURCE,OFFICE_CUSTOMER_REPLY_VERSION,officeReceptionTopics,selectOfficeReceptionReply,officeReceptionCopyIsCurrent,saveOfficeReceptionReference,officeReceptionReplyStillValid} from '../automation/service-bots/office-customer-replies.mjs';
import {mariaReplyContract,ownReplyTextAllowed} from '../automation/service-bots/conversational-ai.mjs';

const questions={duration:'¿Cuánto dura la visita?',treatment:'¿Qué productos usan?',safety:'¿Cuándo puedo entrar?',preparation:'¿Qué debo hacer antes de que vengan?',cleaning:'¿Cuándo puedo limpiar?',inclusions:'¿Qué incluye el servicio?',reinforcement:'¿Incluye una segunda aplicación?',warranty:'¿Qué garantía tiene?'};
const pending=topics=>({state:{caseId:'fumigacion:synthetic-case',slots:{service:'cucarachas',site:'apartamento',rooms:'dos habitaciones',location:'itagui'},quotedPrice:{accepted:true,priceCop:129000},programIntake:{stage:'details',customerName:'Persona Sintética',address:'Calle de Prueba 0'}},reply:'Con gusto. Tu pregunta quedó pendiente de revisión.',review:'Una condición de este caso aún no está verificada.',reviewTopic:'common-question',reviewConditions:{topics},pendingQuestion:topics.map(topic=>questions[topic]).join(' ')});

for(const topic of officeReceptionTopics())test('office '+topic+' explains its pending fact without granting policy or changing received data',()=>{
 const decision=pending([topic]),before=structuredClone(decision),selected=selectOfficeReceptionReply('fumigacion',decision);
 assert.ok(selected);assert.equal(selected.reviewPreserved,true);assert.deepEqual(decision,before);assert.equal(publicTextSafe(selected.text),true);
 assert.equal(selected.ranges.length,1);assert.match(selected.ranges[0],/^RESPUESTAS!C\d+:D\d+$/);
 assert.doesNotMatch(selected.text,/\d|\[[^\]]+\]|100\s*%|inofensiv|no (?:es|son) tóxic|ya (?:quedó|está) (?:agendado|confirmado)|Sandra|Hilary|coordinación|API|Excel/iu);
 assert.equal(adviserReply('fumigacion',decision),selected.text);
 assert.equal(officeReceptionCopyIsCurrent(selected,selected.text),true);
 assert.equal(officeReceptionCopyIsCurrent({...selected,version:'old-version'},selected.text),false);
 assert.equal(officeReceptionCopyIsCurrent(selected,selected.text+' Garantía aprobada.'),false);
});

test('approved answers, concrete case answers, receipts and other companies retain their original bytes',()=>{
 const d=pending(['duration']);
 assert.equal(selectOfficeReceptionReply('fumigacion',d,{approvedAnswer:true}),null);
 assert.equal(adviserReply('fumigacion',d,{approvedAnswer:true}),d.reply);
 assert.equal(selectOfficeReceptionReply('servicio-tecnico',d),null);
 assert.equal(adviserReply('servicio-tecnico',d),d.reply);
 for(const patch of [{specificCustomerQuestionReply:'Pregunta concreta del caso.'},{literalServiceContext:true},{registrationInformation:true},{observed:true},{courtesy:true},{state:{programIntake:{stage:'registered'}}},{review:null}])assert.equal(selectOfficeReceptionReply('fumigacion',{...d,...patch}),null);
 assert.equal(adviserReply('fumigacion',{reply:'Registraré el servicio:\n• Persona Sintética\n¿Confirmas estos datos?',state:{programIntake:{stage:'confirm'}}}),'Registraré el servicio:\n• Persona Sintética\n¿Confirmas estos datos?');
});

test('all requested FAQ aspects are retained and an unknown or additional request is never hidden',()=>{
 const d=pending(['duration','safety']),selected=selectOfficeReceptionReply('fumigacion',d);
 assert.ok(selected.text.includes(selectOfficeReceptionReply('fumigacion',pending(['duration'])).text));
 assert.ok(selected.text.includes(selectOfficeReceptionReply('fumigacion',pending(['safety'])).text));
 assert.equal(selected.ranges.length,2);
 for(const topics of [[],['duration','duration'],['duration','not-a-topic']])assert.equal(selectOfficeReceptionReply('fumigacion',pending(topics)),null);
 for(const question of ['¿Cuánto dura y cuánto cuesta?','¿Cuándo puedo entrar y pagar con tarjeta?','¿Qué productos usan? Estoy embarazada.','¿Cuánto dura? Quiero reprogramar.','¿Cuánto dura? Ya pagué.','¿Cuánto dura la visita y trabajan en Rionegro?','¿Cuánto dura la visita? ¿Atienden los domingos?','¿Cuánto dura la visita y me devuelven el dinero si no funciona?'])assert.equal(selectOfficeReceptionReply('fumigacion',{...pending(['duration']),pendingQuestion:question}),null);
});

for(const [text,expected] of [
 ['¿Cuándo puedo entrar?',['safety']],['Cuando podemos ingresar',['safety']],['¿Cuánto tiempo debemos estar afuera?',['safety']],['¿Cuántas horas afuera?',['safety']],
 ['¿Qué debo hacer antes de que vengan?',['preparation']],['Qué debo hacer antes de llegar',[]],['¿Cuánto dura la visita?',['duration']],
 ['¿Cuánto dura el efecto?',[]],['Estoy embarazada, ¿cuándo puedo entrar?',[]],['Mi mascota vomita, ¿cuándo puedo entrar?',[]],
 ['¿Cuándo puedo entrar y qué debo hacer antes de que vengan?',['safety','preparation']]
])test('FAQ recognition preserves scope and exceptions: '+text,()=>assert.deepEqual(commonQuestionTopics(text),expected));

test('recognizing re-entry still cannot produce a technical safety answer without a reviewed product source',()=>{
 const result=selectCommonAnswer('¿Cuándo puedo entrar?',{service:'cucarachas',site:'apartamento'},[],'synthetic');
 assert.deepEqual(result.topics,['safety']);assert.equal(result.answer,undefined);
 assert.match(OFFICE_CUSTOMER_REPLY_VERSION,/^[a-f0-9]{64}$/);assert.equal(OFFICE_CUSTOMER_REPLY_SOURCE.sha256,'26d1086c045a62cde5fe480d30c0d2f208557772133558014282577b56f24388');
});

test('actual Engine supplies concrete pending reception and keeps the question in review without invented durations',async()=>{
 const s=new Store(':memory:','fumigacion',randomBytes(32));
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:Date.now()-10000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'office-copy-fixture-'+i}))};
 const engine=new Engine(s,c),e={id:'OFFICE_COPY_DURATION_EVENT',phone:'573000007385',line:c.phones[0],at:Date.now(),kind:'text',fromMe:false,forwarded:false,text:'¿Cuánto dura la visita?'};
 try{
  s.enqueue(e);await engine.process(e);
  const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');assert.ok(row);
  const reply=s.open(row.body);assert.match(reply,/duración depende del área/);assert.match(reply,/Aún falta confirmar/);assert.doesNotMatch(reply,/\d|habitaciones|qué plaga/);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
  assert.equal(s.conversation(e.phone).hold,0);assert.equal(s.db.prepare('SELECT state FROM questions').get().state,'PENDING');
  assert.equal(s.approvedCustomerAnswers().length,0);
 }finally{s.close();}
});

test('a versioned office response binds exact text, native source, company, case and recipient before dispatch',()=>{
 const s=new Store(':memory:','fumigacion',randomBytes(32)),event={id:'OFFICE_RECHECK_EVENT',phone:'573000007385',line:BUSINESSES.fumigacion.phones[0],at:Date.now(),kind:'text',fromMe:false,forwarded:false,text:questions.duration},caseId='fumigacion:OFFICE_RECHECK_EVENT';
 try{
  const selected=selectOfficeReceptionReply('fumigacion',pending(['duration']));s.enqueue(event);s.saveConversation(event.phone,{caseId});s.queue(event.id+':reply',event.phone,event.line,selected.text,false,s.conversation(event.phone).revision,caseId);
  const row=()=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(event.id+':reply');
  saveOfficeReceptionReference(s,event,caseId,selected);assert.equal(officeReceptionReplyStillValid(s,row()),true);
  s.saveConversation(event.phone,{caseId:'fumigacion:another-case'});assert.equal(officeReceptionReplyStillValid(s,row()),false);s.saveConversation(event.phone,{caseId});
  assert.equal(officeReceptionReplyStillValid(s,{...row(),phone:'573000007386'}),false);assert.equal(officeReceptionReplyStillValid(s,{...row(),line:BUSINESSES.fumigacion.phones[1]}),false);assert.equal(officeReceptionReplyStillValid(s,{...row(),case_id:'another-case'}),false);
  assert.equal(mariaReplyContract({company:'fumigacion'},s,row(),selected.text),null);
  assert.equal(ownReplyTextAllowed({company:'fumigacion'},s,row(),selected.text,selected.text+' Puedes entrar en una hora.'),false);
  s.db.prepare('UPDATE events SET body=? WHERE id=?').run(s.seal({...event,text:'Texto distinto.'}),event.id);assert.equal(officeReceptionReplyStillValid(s,row()),false);
  s.db.prepare('UPDATE events SET body=? WHERE id=?').run(s.seal(event),event.id);
  s.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(s.seal(selected.text+' Garantía de seis meses.'),row().id);assert.equal(officeReceptionReplyStillValid(s,row()),false);
  assert.equal(officeReceptionCopyIsCurrent({...selected,text:'Garantía de seis meses.'},'Garantía de seis meses.'),false);
  assert.equal(officeReceptionReplyStillValid(s,{...row(),id:'OLD_UNREFERENCED_REPLY'}),true);
 }finally{s.close();}
});
