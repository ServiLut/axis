import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {customerDecision,Engine} from '../automation/service-bots/engine.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,OPERATOR_ROUTING,DIEGO,HILARY,SANDRA} from '../automation/service-bots/config.mjs';
import {afterServiceKind,explicitNewService} from '../automation/service-bots/after-service.mjs';
const initial={slots:{},asked:[]};
const decision=text=>customerDecision('fumigacion',initial,{id:'LOCAL',at:1,kind:'text',text});
function fixture(){const store=new Store(':memory:','fumigacion',randomBytes(32)),config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING},engine=new Engine(store,config);let n=0;const at=Date.now();const enqueue=(text,extra={})=>{const e={id:'AFTER'+(++n),at:at+n,phone:'573001112233',line:config.phones[0],fromMe:false,kind:'text',text,...extra};store.enqueue(e);return e;};return {store,enqueue,handle:e=>engine.process(e),async process(text,extra={}){const e=enqueue(text,extra);await engine.process(e);return e;}};}
test('reinforcement requests are reviewed as followups before new-service intake',()=>{
 for(const text of ['Necesito un refuerzo de la fumigación','Ya me fumigaron y necesito un refuerzo','Refuerzo','Por favor un refuerzo']){const d=decision(text);assert.equal(d.reviewConditions?.kind,'reinforcement',text);assert.equal(d.reviewTopic,'service-followup');assert.equal(d.question,undefined);assert.doesNotMatch(d.reply,/plaga|inmueble|metros|cotiz|gratis|garantiz|confirmado/i);}
});
test('verification of a service is separate from a new quotation',()=>{
 for(const text of ['Quiero una verificación del servicio','Me hicieron la fumigación. Ahora necesito una verificación','Verificación','Necesito que verifiquen el tratamiento']){const d=decision(text);assert.equal(d.reviewConditions?.kind,'verification',text);assert.equal(d.question,undefined);}
});
test('warranty claims preserve the request for Sandra without granting coverage',()=>{
 for(const text of ['Necesito hacer efectiva la garantía de la fumigación','Solicito la garantía del servicio','Es por garantía','Garantía']){const d=decision(text);assert.equal(d.reviewConditions?.kind,'warranty',text);assert.equal(d.reviewTopic,'warranty-review');assert.doesNotMatch(d.reply,/gratis|sin costo|garantiz|cubiert|confirmado/i);}
});
test('new services and generic warranty questions do not become warranty claims',()=>{
 for(const text of ['Quiero un servicio nuevo de fumigación','No necesito un refuerzo. Quiero fumigación nueva','Quiero verificar el precio de una fumigación nueva','¿Qué garantía tiene una fumigación nueva?','Quiero verificar el pago del servicio','Necesito verificar mis datos'])assert.equal(decision(text).state.requestedAfterServiceReview,undefined,text);
 assert.equal(decision('Control de plagas para mi apartamento').reviewConditions?.kind,undefined);
});
test('the first reinforcement source and operational question survive continuation',async()=>{
 const f=fixture();try{const e=await f.process('Necesito un refuerzo de la fumigación');await f.process('Cucarachas en apartamento de 42 mts2 en Itagüí');await f.process('¿Cuándo pueden venir para el refuerzo?');const state=f.store.conversation(e.phone).state;assert.equal(state.requestedAfterServiceReview.sourceId,e.id);assert.equal(state.requestedAfterServiceReview.kind,'reinforcement');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);assert.deepEqual(f.store.db.prepare('SELECT phone FROM outbox WHERE internal=1 ORDER BY phone').all().map(o=>o.phone).sort(),[DIEGO,HILARY].sort());assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='REVIEWED_PRICE_SELECTED'").get().n,0);}finally{f.store.close();}
});
test('a followup in the same rapid batch takes priority over intake fields',async()=>{
 const f=fixture();try{const e=f.enqueue('Quiero una verificación del servicio'),next=f.enqueue('Cucarachas en apartamento de 42 mts2 en Itagüí');await f.handle(e);await f.handle(next);assert.equal(f.store.conversation(e.phone).state.requestedAfterServiceReview.sourceId,e.id);assert.equal(f.store.db.prepare('SELECT topic FROM questions').get().topic,'service-followup');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);}finally{f.store.close();}
});
test('warranty followups create one question for Sandra only',async()=>{
 const f=fixture();try{await f.process('Solicito la garantía de la fumigación');await f.process('Estoy en Medellín');await f.process('Necesito hacer efectiva la garantía');assert.deepEqual(f.store.db.prepare('SELECT recipient,topic FROM questions').all().map(r=>({...r})),[{recipient:SANDRA,topic:'warranty-review'}]);assert.deepEqual(f.store.db.prepare('SELECT phone FROM outbox WHERE internal=1').all().map(r=>({...r})),[{phone:SANDRA}]);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);}finally{f.store.close();}
});
test('an explicit separate new service clears the followup marker only in the new case',async()=>{
 const f=fixture();try{const first=await f.process('Refuerzo');const priorCase=f.store.conversation(first.phone).state.caseId;const next=await f.process('Quiero un servicio nuevo de fumigación para otro apartamento');const state=f.store.conversation(next.phone).state;assert.notEqual(state.caseId,priorCase);assert.equal(state.requestedAfterServiceReview,undefined);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions WHERE case_id=?').get(priorCase).n,1);}finally{f.store.close();}
});
test('denying a new service does not clear the reinforcement source',async()=>{
 const f=fixture();try{const first=await f.process('Refuerzo');const priorCase=f.store.conversation(first.phone).state.caseId;await f.process('No quiero un nuevo servicio, necesito el refuerzo');assert.equal(f.store.conversation(first.phone).state.caseId,priorCase);assert.equal(f.store.conversation(first.phone).state.requestedAfterServiceReview.sourceId,first.id);}finally{f.store.close();}
});
test('safety, payments, staff takeover and other-company scope keep priority',async()=>{
 for(const text of ['Necesito refuerzo y tengo intoxicación','Solicito garantía y ya pagué por transferencia'])assert.ok(!['reinforcement','warranty'].includes(decision(text).reviewConditions?.kind));
 const technical=customerDecision('servicio-tecnico',initial,{kind:'text',text:'Refuerzo'});assert.equal(technical.state.requestedAfterServiceReview,undefined);
 const f=fixture();try{await f.process('Estamos atendiendo tu solicitud',{fromMe:true});const e=await f.process('Necesito refuerzo');assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OBSERVED_HUMAN');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);}finally{f.store.close();}
});
test('negative and explanatory phrases do not authorize a new case or a return request',()=>{
 for(const text of ['No quiero hacer un nuevo servicio','No es un servicio nuevo','No necesito pedir otro servicio'])assert.equal(explicitNewService(text),false,text);
 for(const text of ['No necesito refuerzo','¿Qué es un refuerzo?','¿Incluye un refuerzo?','¿Tiene garantía?'])assert.equal(afterServiceKind(text),null,text);
 assert.equal(afterServiceKind('Necesito un servicio nuevo y un refuerzo'),'ambiguous-followup');
 assert.equal(decision('Necesito un servicio nuevo y un refuerzo').reviewConditions.kind,'ambiguous-followup');
});
test('a later warranty claim keeps the original reinforcement source and its old destinations',async()=>{
 const f=fixture();try{const first=await f.process('Refuerzo'),claim=await f.process('Solicito la garantía del servicio');await f.process('Necesito hacer efectiva la garantía');const state=f.store.conversation(first.phone).state;assert.equal(state.requestedAfterServiceReview.sourceId,first.id);assert.equal(state.requestedAfterServiceReview.warrantySource.sourceId,claim.id);assert.deepEqual(f.store.db.prepare('SELECT recipient,topic FROM questions ORDER BY rowid').all().map(r=>({...r})),[{recipient:DIEGO,topic:'service-followup'},{recipient:SANDRA,topic:'warranty-review'}]);assert.deepEqual(f.store.db.prepare('SELECT phone FROM outbox WHERE internal=1 ORDER BY phone').all().map(r=>r.phone),[DIEGO,HILARY,SANDRA].sort());assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,2);}finally{f.store.close();}
});
test('a later safety or payment exception keeps priority over the preserved followup',async()=>{
 for(const text of ['Ahora tengo intoxicación','Ya pagué por transferencia']){const f=fixture();try{const first=await f.process('Necesito refuerzo');await f.process(text);const rows=f.store.db.prepare('SELECT recipient,topic FROM questions ORDER BY rowid').all();assert.equal(rows.at(-1).recipient,SANDRA);assert.match(rows.at(-1).topic,/^revision:/);assert.equal(f.store.conversation(first.phone).state.requestedAfterServiceReview.sourceId,first.id);}finally{f.store.close();}}
});
