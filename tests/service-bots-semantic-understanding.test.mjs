import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {customerDecision,Engine} from '../automation/service-bots/engine.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,OPERATOR_ROUTING,DIEGO,HILARY,SANDRA} from '../automation/service-bots/config.mjs';
import {CONVERSATIONAL_AI_GUARD,aiConfiguration} from '../automation/service-bots/ai-settings.mjs';
import {understandOwnCustomer,evaluateOwnAi,ownAiUsage} from '../automation/service-bots/conversational-ai.mjs';
import {MARIA_UNDERSTANDING_GUARD,MARIA_EVALUATION_CASES,validatedIntent} from '../automation/service-bots/maria-understanding.mjs';
const empty=()=>({service:null,location:null,site:null,detail:null,preference:null});
const event=(text,id='LOCAL_INTENT_01')=>({id,text,at:Date.now(),kind:'text',fromMe:false,phone:'573001112233',line:BUSINESSES.fumigacion.phones[0]});
const analysis=(e,kind,evidence=e.text)=>({company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,slots:{},intent:{kind,evidence}});
const decide=(text,kind,evidence)=>{const e=event(text);return customerDecision('fumigacion',{slots:{},asked:[]},e,analysis(e,kind,evidence));};
function fixture(){
 const s=new Store(':memory:','fumigacion',randomBytes(32));
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING,
  lines:BUSINESSES.fumigacion.phones.map(phone=>({phone})),conversationalAi:aiConfiguration({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_AI_MODEL:'gpt-6-luna',BOT_OPENAI_API_KEY:'isolated-own-key',BOT_AI_MONTHLY_CALL_LIMIT:'30',BOT_AI_ENABLED_FROM:new Date(Date.now()-10000).toISOString()},'fumigacion')};
 return {s,c};
}
test('semantic understanding resolves paraphrased followups without new intake or coverage promises',()=>{
 for(const [text,kind,expected] of [
  ['Quisiera que regresaran a reforzar el tratamiento que hicieron.','reinforcement','reinforcement'],
  ['Me gustaría que volvieran a revisar cómo quedó el tratamiento anterior.','verification','verification'],
  ['Quiero hacer valer la garantía del tratamiento que me hicieron.','warranty-claim','warranty'],
  ['Quiero que revisen cómo quedó.','verification','verification']]){
  const d=decide(text,kind);assert.equal(d.reviewConditions.kind,expected);assert.equal(d.question,undefined);assert.doesNotMatch(d.reply,/plaga|inmueble|metros|gratis|cubierta|confirmado|cotiz/i);
 }
});
test('generic conditions, ambiguous requests and prior-treatment problems stay separate',()=>{
 const general=decide('¿Qué es un refuerzo y qué incluye?','general-question');assert.equal(general.reviewConditions.kind,'general-question');assert.equal(general.state.requestedAfterServiceReview,undefined);
 const mixed=decide('Necesito fumigar otra casa y revisar el tratamiento de la anterior.','ambiguous');assert.equal(mixed.reviewConditions.kind,'ambiguous-followup');
 const past=decide('Fumigaron hace dos semanas y siguen apareciendo cucarachas.','post-service');assert.equal(past.reviewConditions.kind,'post-service');
});
test('a semantic label cannot import facts from another source, unquoted evidence or another company',()=>{
 const e=event('Cucarachas en apartamento'),a=analysis(e,'warranty-claim','garantía');
 assert.equal(validatedIntent(a.intent,e.text),null);
 for(const change of [{eventId:'OTHER'},{company:'S.TECNICO'},{semanticGuard:'UNKNOWN'}])assert.equal(customerDecision('fumigacion',{slots:{},asked:[]},e,{...analysis(e,'verification'),...change}).state.requestedAfterServiceReview,undefined);
 assert.equal(customerDecision('servicio-tecnico',{slots:{},asked:[]},e,analysis(e,'verification')).state.requestedAfterServiceReview,undefined);
});
test('safety, actual payment, native followup kind and human attention retain priority',async()=>{
 for(const [text,kind] of [['Quiero una verificación y tengo intoxicación','verification'],['Solicito la garantía y ya pagué por transferencia','warranty-claim']])assert.notEqual(decide(text,kind).reviewConditions?.kind,kind);
 assert.equal(decide('Necesito un refuerzo de la fumigación','verification').reviewConditions.kind,'reinforcement');
 const f=fixture();try{const e=event('Quiero que regresen a revisar el tratamiento anterior.');f.s.enqueue(e);f.s.hold(e.phone,'ISOLATED-HUMAN');await new Engine(f.s,f.c).process(e,analysis(e,'verification'));assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);}finally{f.s.close();}
});
test('semantic source and single operational question are preserved across continuation',async()=>{
 const f=fixture();try{
  const engine=new Engine(f.s,f.c),first=event('Me gustaría que volvieran a revisar cómo quedó el tratamiento anterior.');f.s.enqueue(first);await engine.process(first,analysis(first,'verification'));
  const next=event('Cucarachas en apartamento de 42 mts2 en Itagüí.','LOCAL_INTENT_02');f.s.enqueue(next);await engine.process(next);
  const state=f.s.conversation(first.phone).state;assert.equal(state.requestedAfterServiceReview.sourceId,first.id);assert.equal(state.requestedAfterServiceReview.evidence,first.text);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);
  assert.deepEqual(f.s.db.prepare('SELECT phone FROM outbox WHERE internal=1 ORDER BY phone').all().map(r=>r.phone),[DIEGO,HILARY].sort());
 }finally{f.s.close();}
});
test('semantic mixed request does not clear a prior case or migrate its old questions',async()=>{
 const f=fixture();try{
  const engine=new Engine(f.s,f.c),first=event('Necesito refuerzo');f.s.enqueue(first);await engine.process(first);const previous=f.s.conversation(first.phone).state.caseId;
  const next=event('Quiero un servicio nuevo y revisar lo que hicieron antes.','LOCAL_INTENT_03');f.s.enqueue(next);await engine.process(next,analysis(next,'ambiguous'));
  assert.equal(f.s.conversation(first.phone).state.caseId,previous);assert.equal(f.s.conversation(first.phone).state.requestedAfterServiceReview.sourceId,first.id);
 }finally{f.s.close();}
});
test('quality evaluation uses fixed isolated cases, persists counts, deduplicates and creates no business records',async()=>{
 const f=fixture(),inputs=[];let calls=0;
 const fetcher=async(url,options)=>{calls++;const body=JSON.parse(options.body),input=JSON.parse(body.input);inputs.push(input);const c=MARIA_EVALUATION_CASES.find(c=>c.text===input.customerText);assert.equal(body.reasoning.effort,'none');return {ok:true,json:async()=>({status:'completed',output_text:JSON.stringify({slots:empty(),intent:{kind:c.expected,evidence:c.text.slice(0,150)}}),usage:{input_tokens:20,output_tokens:10}})};};
 try{
  const ids=MARIA_EVALUATION_CASES.map(c=>c.id),r=await evaluateOwnAi(f.c,f.s,fetcher,ids);assert.equal(r.passed,12);assert.equal(calls,12);
  await evaluateOwnAi(f.c,f.s,fetcher,ids);assert.equal(calls,12);assert.equal(ownAiUsage(f.c,f.s).callsReserved,12);
  for(const table of ['events','outbox','conversations','questions'])assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
  assert.ok(inputs.some(i=>i.context.previousCustomerText==='Me fumigaron la semana pasada.'));
  assert.equal(inputs[0].reviewedExamples.some(e=>e.customer===MARIA_EVALUATION_CASES[0].text),false);
  await assert.rejects(evaluateOwnAi(f.c,f.s,fetcher,['unreviewed-case']),/CASE_IDS/);
 }finally{f.s.close();}
});
test('existing pending review makes no additional model call or repeated acknowledgement',async()=>{
 const f=fixture();try{let calls=0;const e=event('Mañana en la tarde');const r=await understandOwnCustomer(f.c,f.s,()=>{calls++;},e,{awaitingHumanReview:true,slots:{},asked:[]});assert.deepEqual(r,{});assert.equal(calls,0);}finally{f.s.close();}
});

test('verified current-case explanations reach understanding while expired, unlinked and new-case answers do not',async()=>{
 const f=fixture(),inputs=[];
 const fetcher=async(url,options)=>{const body=JSON.parse(options.body);inputs.push(JSON.parse(body.input));return {ok:true,json:async()=>({status:'completed',output_text:JSON.stringify({slots:empty(),intent:{kind:'verification',evidence:'revisen el tratamiento anterior'}})})};};
 try{
  const a={question:'¿Qué antecedente corresponde?',answer:'Es una revisión del tratamiento anterior. Teléfono +57 300 222 3344',source:'VERIFIED01',at:Date.now()-1000,validUntil:Date.now()+60000};
  const context={caseAnswers:[a,{...a,source:'EXPIRED01',validUntil:Date.now()-1},{answer:'UNLINKED_UNAPPROVED'}]};
  await understandOwnCustomer(f.c,f.s,fetcher,event('Necesito que revisen el tratamiento anterior.','CLARIFY_LOCAL_01'),context);
  assert.equal(inputs[0].context.sameCaseClarifications.length,1);assert.match(inputs[0].context.sameCaseClarifications[0].answer,/revisión del tratamiento anterior/);assert.doesNotMatch(JSON.stringify(inputs[0]),/300 222 3344|EXPIRED|UNLINKED/);
  await understandOwnCustomer(f.c,f.s,fetcher,event('Necesito que revisen el tratamiento anterior.','CLARIFY_LOCAL_02'),{...context,requestedNewCase:true});
  assert.equal(inputs[1].context.sameCaseClarifications.length,0);
 }finally{f.s.close();}
});
