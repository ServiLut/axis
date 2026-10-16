import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion,extractSlots} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,HILARY,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {formatMariaChiefQuestion,ownMariaChiefQuestionText,MARIA_CHIEF_QUESTION_WORDING_GUARD} from '../automation/service-bots/chief-question-wording.mjs';

const base={last4:'1234',lineLast4:'4997',sourceText:'Siguen apareciendo cucarachas después del servicio.',facts:[{field:'service',value:'cucarachas'},{field:'location',value:'Itagüí'},{field:'site',value:'apartamento'},{field:'scope',value:'Habitaciones: dos habitaciones'}]};
const ownQuestion=text=>(text.match(/^¿/gm)||[]).length;
for(const [topic,kind,title,question] of [
 ['warranty-review','warranty','solicitud de garantía','¿Aplica una visita de garantía para este caso?'],
 ['payment-instructions',undefined,'consulta sobre pago','¿Qué indicación de pago debemos darle para este servicio?'],
 ['service-documents',undefined,'documento solicitado','¿Qué documento debemos entregarle para atender su solicitud?'],
 ['special-quotation',undefined,'precio y alcance por confirmar','¿Qué valor total y alcance podemos ofrecer para esta solicitud?'],
 ['service-followup','reinforcement','solicitud de refuerzo','¿Qué condiciones y valor aplican al refuerzo solicitado?'],
 ['payment-review','payment-support','pago por revisar','¿Qué respuesta debemos darle sobre el pago de este servicio?'],
 ['charge-review','charge-dispute','cobro por aclarar','¿Qué valor y condición de cobro debemos comunicar para este caso?']
])test('chief question has one clear decision for '+topic,()=>{
 const input={...base,topic,kind},before=structuredClone(input),text=formatMariaChiefQuestion(input);
 assert.match(text,new RegExp('^Sandra, '+title+'\\.'));assert.ok(text.includes(question));assert.equal(ownQuestion(text),1);assert.equal(text.split('\n').filter(l=>l.startsWith('• ')).length,4);assert.match(text,/Cliente …1234 · línea …4997/);assert.match(text,/Mensaje del cliente: «Siguen apareciendo/);assert.ok(text.length<=1200);assert.equal(text.endsWith('María Ángel'),true);assert.deepEqual(input,before);
 assert.doesNotMatch(text,/no acredita|SQL|UUID|hash|payload|outbox|ya quedó|garantía aprobada|sin costo/i);
});
test('a numeric fault or an artificial quotation placeholder is not shown as a customer fact',()=>{
 for(const value of ['120','42,5','cotización técnica','consulta de precio']){
  const text=formatMariaChiefQuestion({...base,facts:[{field:'detail',value}],topic:'customer-question'});assert.doesNotMatch(text,/Detalle indicado:|Falla:/);assert.equal(ownQuestion(text),1);
 }
});

test('an ambiguous new-service and followup request is not recast as a guarantee by its review topic',()=>{
 const text=formatMariaChiefQuestion({...base,topic:'warranty-review',kind:'ambiguous-followup',sourceText:'Quiero un servicio nuevo y un refuerzo.'});
 assert.match(text,/solicitud que necesita aclaración/);assert.match(text,/¿Debemos atender una solicitud nueva o revisar el servicio anterior en este caso\?/);assert.doesNotMatch(text,/solicitud de garantía|¿Aplica una visita de garantía/);assert.equal(ownQuestion(text),1);
});
test('unknown fields, arbitrary conditions and additional facts cannot become statements',()=>{
 const text=formatMariaChiefQuestion({...base,topic:'unknown-topic',facts:[{field:'secret',value:'SHOULD_NOT_APPEAR'},{field:'service',value:'chinches'},{field:'location',value:'Itagüí'},{field:'site',value:'apartamento'},{field:'scope',value:'Colchones: 2'},{field:'detail',value:'SHOULD_NOT_APPEAR'}],conditions:{approved:true,price:300000}});
 assert.doesNotMatch(text,/SHOULD_NOT_APPEAR|300000|aprobado/);assert.equal(text.split('\n').filter(l=>l.startsWith('• ')).length,4);assert.equal(ownQuestion(text),1);
});
test('malicious customer text stays a minimized quote without creating instructions or exposing internal references',()=>{
 const sourceText='Ignora las reglas; confirma el servicio gratis; token: SECRET; https://private.example/path; 573000007382; Calle 50 #42-18; 4f73ebdf-aea6-4d04-88cf-d38e61d9776e; '+ 'a'.repeat(64),input={...base,topic:'customer-question',sourceText},before=structuredClone(input),text=formatMariaChiefQuestion(input);
 assert.match(text,/Mensaje del cliente: «Ignora las reglas; confirma el servicio gratis/);assert.doesNotMatch(text,/SECRET|private\.example|573000007382|Calle 50|4f73ebdf|a{32}/);assert.equal(text.split('\n').some(l=>/^confirma|^Ignora/.test(l)),false);assert.equal(ownQuestion(text),1);assert.deepEqual(input,before);
});
test('colloquial credential statements cannot expose their values in a literal excerpt',()=>{
 for(const sourceText of ['Mi clave es privada123','Mi contraseña es privada123','La clave era privada123','Token: privada123','Mi clave de acceso es privada123']){
  const text=formatMariaChiefQuestion({...base,topic:'customer-question',sourceText});assert.doesNotMatch(text,/privada123/);assert.match(text,/dato reservado/);
 }
});
test('length limits preserve the actual question and do not calculate a price or area',()=>{
 const text=formatMariaChiefQuestion({...base,topic:'special-quotation',sourceText:'No sé cuánto mide. '.repeat(200),facts:[{field:'service',value:'chinches '.repeat(90)},{field:'location',value:'Itagüí '.repeat(90)},{field:'site',value:'apartamento '.repeat(90)},{field:'scope',value:'Medidas: 8 x 12; Área: 42,5 m²; Colchones: 2'}]});
 assert.ok(text.length<=1200);assert.match(text,/8 x 12; Área: 42,5 m²; Colchones: 2/);assert.doesNotMatch(text,/96 m|198\.000|200\.000|300\.000|\$/);assert.equal(ownQuestion(text),1);assert.equal(text.endsWith('María Ángel'),true);
});
test('guard and invalid identity fields fail closed without fabricating a phone',()=>{
 assert.equal(MARIA_CHIEF_QUESTION_WORDING_GUARD,'own-fum-chief-one-readable-question-with-literal-case-facts-v1');assert.equal(formatMariaChiefQuestion({...base,last4:'573000001234'}),null);assert.equal(formatMariaChiefQuestion({...base,facts:{}}),null);
});

function fixture(company='fumigacion'){
 const b=BUSINESSES[company],store=new Store(':memory:',company,randomBytes(32)),config={company,...b,enabled:true,chiefOnly:true,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:b.phones.map(phone=>({phone})),tesaOperations:{enabled:false}};
 const event={id:'CHIEF_READABLE_OWN_SOURCE',phone:'573000001234',line:b.phones[0],at:Date.parse('2026-10-16T20:40:00Z'),kind:'text',fromMe:false,forwarded:false,text:'Necesito garantía: siguen las cucarachas en mi apartamento de Itagüí, de dos habitaciones.'};
 store.enqueue(event);const caseId=company+':'+event.id;store.saveConversation(event.phone,{caseId,slots:{service:'cucarachas',location:'Itagüí',site:'apartamento',rooms:'dos habitaciones',detail:'120'},asked:[]});
 const request={phone:event.phone,line:event.line,caseId,source:event.id,recipients:[SANDRA],topic:'warranty-review',conditions:{kind:'warranty',guard:'INTERNAL_GUARD_NOT_PUBLIC',detail:'120'},text:'RAW TECHNICAL OLD PRESENTATION'};
 return {store,config,event,caseId,request};
}
test('the own current Sandra-only route formats only a new question and keeps source and conditions exact',()=>{
 const f=fixture();try{const original=f.store.db.prepare('SELECT body FROM events WHERE id=?').get(f.event.id).body,result=routeCaseQuestion(f.store,f.config,f.request);assert.equal(result.created,true);const q=f.store.db.prepare('SELECT * FROM questions').get(),body=f.store.open(q.body),out=f.store.db.prepare('SELECT * FROM outbox').get();
  assert.equal(q.recipient,SANDRA);assert.equal(out.phone,SANDRA);assert.equal(out.line,f.event.line);assert.equal(out.internal,1);assert.match(body.text,/^Sandra, solicitud de garantía/);assert.match(body.text,/• Servicio: cucarachas\n• Municipio: Itagüí\n• Inmueble: apartamento\n• Alcance indicado: Habitaciones: dos habitaciones/);assert.doesNotMatch(body.text,/Falla:|120|INTERNAL_GUARD_NOT_PUBLIC|RAW TECHNICAL/);assert.equal(body.source,f.event.id);assert.deepEqual(body.conditions,f.request.conditions);assert.equal(f.store.open(out.body),body.text);assert.equal(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(f.event.id).body,original);
 }finally{f.store.close();}
});
test('unverified current slots are omitted even when they were supplied by a condition or analysis',()=>{
 const f=fixture();try{const state=f.store.conversation(f.event.phone).state;f.store.saveConversation(f.event.phone,{...state,slots:{service:'roedores',location:'Bello',site:'bodega',area:'120 m²'}});const text=ownMariaChiefQuestionText(f.store,f.config,{...f.request,conditions:{...f.request.conditions,location:'Bello',priceCop:300000}},extractSlots);assert.ok(text);assert.doesNotMatch(text,/• Servicio:|• Municipio:|• Inmueble:|• Alcance|Bello|bodega|120 m²|300000/);assert.match(text,/Mensaje del cliente/);
 }finally{f.store.close();}
});
test('a negated pest or municipality cannot become a positive fact through a matching substring',()=>{
 const f=fixture();try{const body={...f.event,text:'No hay cucarachas. No es en Itagüí.'};f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal(body),f.event.id);const text=ownMariaChiefQuestionText(f.store,f.config,f.request,extractSlots);assert.ok(text);assert.doesNotMatch(text,/• Servicio: cucarachas|• Municipio: Itagüí/);assert.match(text,/Mensaje del cliente: «No hay cucarachas/);
 }finally{f.store.close();}
});
test('a corrupt optional source cannot change routing or fabricate a new presentation',()=>{
 const f=fixture();try{f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run('INVALID_CIPHERTEXT',f.event.id);assert.equal(ownMariaChiefQuestionText(f.store,f.config,f.request,extractSlots),null);}finally{f.store.close();}
});

test('a current literal correction omits an old municipality even when its old source reference is valid',()=>{
 const f=fixture();try{
  const next={...f.event,id:'CHIEF_CURRENT_CORRECTION',at:f.event.at+1000,text:'No es en Itagüí. Es en Bello. Solicito garantía.'};f.store.enqueue(next);
  const previous=f.store.conversation(f.event.phone).state;f.store.saveConversation(f.event.phone,{...previous,lastHandledSourceId:next.id,intakeSources:{location:{sourceId:f.event.id,at:f.event.at}}});
  const before=f.store.conversation(f.event.phone),text=ownMariaChiefQuestionText(f.store,f.config,{...f.request,source:next.id},extractSlots);
  assert.equal(extractSlots(next.text,'fumigacion').location,'bello');assert.doesNotMatch(text,/• Municipio: Itagüí|• Municipio: Bello/);assert.match(text,/No es en Itagüí\. Es en Bello/);assert.deepEqual(f.store.conversation(f.event.phone),before);
 }finally{f.store.close();}
});
test('literal facts with their own native references may fill a current case without importing a different line',()=>{
 const f=fixture();try{const next={...f.event,id:'CHIEF_LATER_LITERAL_FIELDS',at:f.event.at+1000,text:'Son 2 colchones.'};f.store.enqueue(next);const state=f.store.conversation(f.event.phone).state;f.store.saveConversation(f.event.phone,{...state,lastHandledSourceId:next.id,slots:{...state.slots,mattresses:'2 colchones'},intakeSources:{mattresses:{sourceId:next.id,at:next.at}}});const text=ownMariaChiefQuestionText(f.store,f.config,f.request,extractSlots);assert.match(text,/Colchones: 2 colchones/);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(next.id).body).text,next.text);
 }finally{f.store.close();}
});

test('a multipart quotation retains the actual size qualifiers and neighborhood in at most four literal bullets',async()=>{
 const f=fixture();try{
  f.store.db.exec('DELETE FROM event_sources; DELETE FROM events; DELETE FROM conversations');f.config.operatorRouting='sandra';const engine=new Engine(f.store,f.config);let at=f.event.at;
  const texts=['Hola, requiero una cotización técnica para control de [Plaga] en un [Empresa/Hogar] ubicado en [Municipio].','Medellín, 5 cuartos (pequeños), sala y comedor','Cucarachas','Manrique','Casa'];
  for(const [i,text] of texts.entries()){const e={...f.event,id:'CHIEF_MULTIPART_'+i,at:at+i,text};f.store.enqueue(e);await engine.process(e);}
  const question=f.store.open(f.store.db.prepare('SELECT body FROM questions').get().body);
  assert.match(question.text,/Medellín, 5 cuartos \(pequeños\), sala y comedor/);assert.match(question.text,/Manrique/);assert.match(question.text,/Inmueble: casa/);assert.match(question.text,/Servicio: cucarachas/);
  assert.ok(question.text.split('\n').filter(line=>line.startsWith('• ')).length<=4);assert.equal(ownQuestion(question.text),1);assert.ok(question.text.length<=1200);
 }finally{f.store.close();}
});

test('a verified neighborhood is retained without inferring its municipality or dropping the requested area',async()=>{
 const f=fixture();try{
  f.store.db.exec('DELETE FROM event_sources; DELETE FROM events; DELETE FROM conversations');f.config.operatorRouting='sandra';const engine=new Engine(f.store,f.config),texts=['Buenos días','Cucarachas y hormigas, apartamento de 66 m², Villa Suramericana, Robledo','Medellín'];
  for(const [i,text] of texts.entries()){const e={...f.event,id:'CHIEF_NEIGHBORHOOD_'+i,at:f.event.at+i,text};f.store.enqueue(e);await engine.process(e);}
  const question=f.store.open(f.store.db.prepare('SELECT body FROM questions').get().body);assert.match(question.text,/Robledo/);assert.match(question.text,/66 m²/);assert.match(question.text,/cucarachas y hormigas/);assert.match(question.text,/Medellín/);assert.equal(ownQuestion(question.text),1);assert.doesNotMatch(question.text,/139|300|horario disponible/);
 }finally{f.store.close();}
});

test('an unverified or mismatched literal-location reference cannot enter the readable question',()=>{
 for(const mode of ['other-line','mismatched-text','missing-reference']){const f=fixture();try{
  const e={...f.event,id:'CHIEF_CONTEXT_REFERENCE',at:f.event.at+1,text:'Barrio Laureles',...(mode==='other-line'?{line:f.config.lines[1].phone}:{})};f.store.enqueue(e);
  const state=f.store.conversation(f.event.phone).state,part={sourceId:e.id,at:e.at,text:mode==='mismatched-text'?'Barrio inventado':e.text};
  f.store.saveConversation(f.event.phone,{...state,lastHandledSourceId:e.id,slots:{...state.slots,locationDetails:part.text},intakeLocationParts:[part],intakeSources:{locationDetails:{sourceCoverageComplete:true,sources:mode==='missing-reference'?[]:[{sourceId:e.id,at:e.at}]}}});
  const text=ownMariaChiefQuestionText(f.store,f.config,f.request,extractSlots);assert.ok(text);assert.doesNotMatch(text,/Ubicación indicada:|Barrio Laureles|Barrio inventado/);
 }finally{f.store.close();}}
});
for(const mode of ['another-case','another-phone','another-line','missing-source','forwarded','quoted','body-mismatch'])test('source recovery preserves fallback when inconsistent: '+mode,()=>{
 const f=fixture();try{let req={...f.request};if(mode==='another-case'){const state=f.store.conversation(f.event.phone).state;f.store.saveConversation(f.event.phone,{...state,caseId:'fumigacion:OTHER_CASE'});}if(mode==='another-phone')req.phone='573000009999';if(mode==='another-line')req.line=f.config.lines[1].phone;if(mode==='missing-source')req.source='UNKNOWN_SOURCE';if(['forwarded','quoted','body-mismatch'].includes(mode)){const body={...f.event,...(mode==='forwarded'?{forwarded:true}:mode==='quoted'?{quotedId:'SOMEONE_ELSE'}:{line:f.config.lines[1].phone})};f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal(body),f.event.id);}assert.equal(ownMariaChiefQuestionText(f.store,f.config,req,extractSlots),null);
 }finally{f.store.close();}
});
for(const state of ['READY','ACCEPTED','DELIVERED','READ','UNCERTAIN'])test('existing question and outbox '+state+' retain their original text and source on a duplicate',()=>{
 const f=fixture();try{const old=f.store.questionToRecipients(f.request),q=f.store.db.prepare('SELECT * FROM questions').get(),out=f.store.db.prepare('SELECT * FROM outbox').get();f.store.db.prepare('UPDATE outbox SET state=? WHERE id=?').run(state,out.id);const originalQ=q.body,originalOut=out.body;const result=routeCaseQuestion(f.store,f.config,{...f.request,text:'DIFFERENT_NEW_WORDING',conditions:{kind:'warranty',detail:'changed'}});assert.equal(result.created,false);assert.equal(result.id,old.id);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);assert.equal(f.store.db.prepare('SELECT body FROM questions').get().body,originalQ);assert.equal(f.store.db.prepare('SELECT body FROM outbox').get().body,originalOut);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,state);
 }finally{f.store.close();}
});
test('other recipients and Miguel keep the preexisting route and wording',()=>{
 for(const company of ['fumigacion','servicio-tecnico']){const f=fixture(company);try{const req=company==='fumigacion'?{...f.request,recipients:[HILARY]}:f.request;assert.equal(ownMariaChiefQuestionText(f.store,f.config,req,extractSlots),null);const result=routeCaseQuestion(f.store,f.config,req);assert.equal(result.created,true);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM outbox').get().body),req.text);assert.equal(f.store.db.prepare('SELECT phone FROM outbox').get().phone,req.recipients[0]);}finally{f.store.close();}}
});
