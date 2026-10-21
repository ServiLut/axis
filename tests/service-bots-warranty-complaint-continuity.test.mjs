import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,SANDRA} from '../automation/service-bots/config.mjs';
import {afterServiceKind} from '../automation/service-bots/after-service.mjs';
const complaint='Llevo días queriendo escribirles pero siempre es en la noche y se me olvida al día siguiente. La verdad las cucarachas siguieron saliendo, quería saber si me pueden dar alguna garantía';
function fixture(line='573126944997'){
 const store=new Store(':memory:','fumigacion',randomBytes(32)),config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:CURRENT_OPERATOR_ROUTING},engine=new Engine(store,config);let n=0;
 const start=Date.now()+1000;
 return {store,config,async process(text,extra={}){const e={id:'WARRANTY_'+String(++n).padStart(5,'0'),at:start+n*1000,phone:'573000002973',line,fromMe:false,kind:'text',text,...extra};store.enqueue(e);await engine.process(e);return e;},reply(e){const row=store.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply');return row?store.open(row.body):null;}};
}
test('the reported personal guarantee request is recognized without granting coverage',()=>{
 assert.equal(afterServiceKind(complaint),'warranty');
 const d=customerDecision('fumigacion',{slots:{},asked:[]},{id:'ORIGINAL_1',at:1,phone:'573000002973',line:'573126944997',fromMe:false,kind:'text',text:complaint});
 assert.equal(d.reviewTopic,'warranty-review');assert.equal(d.state.requestedAfterServiceReview.sourceId,'ORIGINAL_1');assert.doesNotMatch(d.reply,/plaga deseas|tipo de inmueble|garantía cubierta|gratis|sin costo/);
});
test('polite wording does not turn denied, hypothetical or pre-sale policy questions into a warranty claim',()=>{
 for(const text of ['No quería saber si me pueden dar alguna garantía','Si quisiera saber si me pueden dar alguna garantía, ¿cómo sería?','Quisiera saber si me pueden dar garantía si los contrato','¿Qué garantía tiene una fumigación nueva?','¿Tiene garantía?'])assert.equal(afterServiceKind(text),null,text);
});
for(const line of BUSINESSES.fumigacion.phones)test('complaint, video and repeated requests preserve one guarantee case on '+line,async()=>{
 const f=fixture(line);try{
  const first=await f.process(complaint),initialCase=f.store.conversation(first.phone).state.caseId;
  const video=await f.process('',{kind:'video'}),status=await f.process('No recibí respuesta'),later=await f.process('Necesito una respuesta',{at:Date.now()+10*60000});
  const state=f.store.conversation(first.phone).state;
  assert.equal(state.caseId,initialCase);assert.equal(state.requestedAfterServiceReview.kind,'warranty');assert.equal(state.requestedAfterServiceReview.sourceId,first.id);
  assert.match(f.reply(video),/video.*garantía/);assert.doesNotMatch(f.reply(video),/plaga deseas|tipo de inmueble|metros cuadrados|veo|muestra|se observa|cotiz/i);
  assert.match(f.reply(status),/Lamento.*esperando/);assert.doesNotMatch(f.reply(status),/plaga deseas|tipo de inmueble|cotiz|confirmada.*visita.*mañana/i);
  assert.ok(f.reply(later));assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
  assert.deepEqual(f.store.db.prepare('SELECT recipient,topic FROM questions').all().map(r=>({...r})),[{recipient:SANDRA,topic:'warranty-review'}]);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'warranty-response-delay:%'").get().n,1);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='OWN_UNANSWERED_WARRANTY_ESCALATED'").get().n,1);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM questions WHERE topic LIKE 'missing-intake:%'").get().n,0);
 }finally{f.store.close();}
});
test('a video recovers a known literal guarantee source even when a former generic review lacked its marker',async()=>{
 const f=fixture();try{
  const first=await f.process(complaint),conv=f.store.conversation(first.phone);delete conv.state.requestedAfterServiceReview;f.store.saveConversation(first.phone,conv.state);
  const video=await f.process('',{kind:'video'});assert.equal(f.store.conversation(first.phone).state.requestedAfterServiceReview.sourceId,first.id);assert.match(f.reply(video),/video.*garantía/);assert.doesNotMatch(f.reply(video),/plaga deseas|inmueble/);
 }finally{f.store.close();}
});
test('real advisor intervention keeps priority over guarantee media and new response alerts',async()=>{
 const f=fixture();try{
  await f.process(complaint);const before=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
  await f.process('Estoy atendiendo este caso',{fromMe:true});await f.process('',{kind:'video'});await f.process('Necesito una respuesta');
  assert.equal(f.store.conversation('573000002973').hold,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,before);
 }finally{f.store.close();}
});
test('safety or payment exceptions still take priority without erasing the guarantee source',async()=>{
 for(const text of ['Tengo intoxicación','Ya pagué por transferencia']){const f=fixture();try{const first=await f.process(complaint),e=await f.process(text);assert.equal(f.store.conversation(e.phone).state.requestedAfterServiceReview.sourceId,first.id);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'warranty-response-delay:%'").get().n,0);}finally{f.store.close();}}
});
