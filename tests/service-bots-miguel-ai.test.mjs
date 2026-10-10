import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,SANDRA,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {Transport,drain} from '../automation/service-bots/transport.mjs';
import {aiConfiguration,aiStatus,ownAiScopeMatches,MIGUEL_CONVERSATIONAL_AI_GUARD,CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {installOwnAiSetup,restoreOwnAiSetup,MIGUEL_OWN_AI_SETUP_GUARD} from '../automation/service-bots/ai-setup.mjs';
import {understandOwnCustomer,composeOwnReply,replyCandidates,probeOwnAi,evaluateOwnAi,ownAiUsage} from '../automation/service-bots/conversational-ai.mjs';
import {MIGUEL_UNDERSTANDING_GUARD,MIGUEL_INTENTS,MIGUEL_EVALUATION_CASES,ownMiguelIntent,miguelSemanticFollowup} from '../automation/service-bots/miguel-understanding.mjs';

const phone='573001112233',secret='sk-proj-'+ 'MiguelIsolatedCredential'.repeat(3),empty=()=>({service:null,location:null,site:null,detail:null,preference:null});
const setup=(extra={})=>({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'S.TECNICO',BOT_OPENAI_API_KEY:secret,BOT_AI_MODEL:'gpt-6-luna',BOT_AI_MONTHLY_CALL_LIMIT:'10000',BOT_AI_ENABLED_FROM:new Date(Date.now()-10000).toISOString(),BOT_OPENAI_PROJECT_ID:'proj_miguel_isolated',...extra});
function fixture({handler,limit=10000,configured=true,store}={}){
 const c={company:'servicio-tecnico',...BUSINESSES['servicio-tecnico'],enabled:true,chiefOnly:true,operatorRouting:CURRENT_OPERATOR_ROUTING,historyCheckRequired:true,activatedAt:Date.now()-20000,
  lines:BUSINESSES['servicio-tecnico'].phones.map((phone,i)=>({phone,instance:'miguel-isolated-'+i})),conversationalAi:aiConfiguration(configured?setup({BOT_AI_MONTHLY_CALL_LIMIT:String(limit)}):{},'servicio-tecnico')};
 const s=store||new Store(':memory:','servicio-tecnico',randomBytes(32)),requests=[],sent=[];
 const fetcher=async(url,options)=>{
  const body=JSON.parse(options.body),input=JSON.parse(body.input);requests.push({url,options,body,input});
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.type,'json_schema');assert.match(body.text.format.name,/^miguel_/);
  assert.equal(options.headers.Authorization,'Bearer '+secret);assert.equal(options.headers['OpenAI-Project'],'proj_miguel_isolated');assert.deepEqual(body.reasoning,{effort:'none'});
  const value=handler?await handler(body,input,s,c):body.text.format.name==='miguel_literal_slots'?{slots:empty(),intent:{kind:'other',evidence:input.customerText}}:{choice:body.text.format.schema.properties.choice.enum.includes(1)?1:0};
  if(value instanceof Error)throw value;
  return {ok:true,json:async()=>({status:'completed',output_text:JSON.stringify(value),usage:{input_tokens:30,output_tokens:15}})};
 };
 const engine=new Engine(s,c),t=new Transport(c,fetcher);
 t.verifyLine=async()=>({verified:true});t.priorHistory=async()=>({cutoff:c.activatedAt,priorOutgoing:false,guardVersion:'canonical-and-alternate-phone-v2'});t.currentAttention=async()=>({complete:true,sources:[]});
 t.send=async(row,text)=>{sent.push({row,text});return 'MIGUELISOLATED'+sent.length;};
 const event=(text,id='MIGUEL_SOURCE01',extra={})=>({id,text,phone,line:c.lines[0].phone,kind:'text',fromMe:false,at:Date.now(),...extra});
 const run=async(text,id='MIGUEL_SOURCE01',extra={})=>{const e=event(text,id,extra);s.enqueue(e);await drain(s,c,t,engine);return e;};
 const reply=id=>{const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id+':reply');return row&&{...row,text:s.open(row.body)};};
 return {c,s,t,engine,requests,sent,fetcher,event,run,reply};
}

test('Miguel requires its exact own scope and exposes a distinct guard without its credential',()=>{
 const ai=aiConfiguration(setup(),'servicio-tecnico'),s={company:'servicio-tecnico'},c={company:'servicio-tecnico',conversationalAi:ai};
 assert.equal(ai.ready,true);assert.equal(ai.monthlyCallLimit,10000);assert.equal(ownAiScopeMatches(c,s),true);assert.equal(ownAiScopeMatches(c,{company:'fumigacion'}),false);
 assert.equal(aiConfiguration({},'servicio-tecnico').ready,false);assert.equal(aiConfiguration(setup({BOT_AI_SCOPE:'S.TECNICO'}),'fumigacion').ready,false);
 assert.throws(()=>aiConfiguration(setup({BOT_AI_SCOPE:'FUMIGACION'}),'servicio-tecnico'),/OWN_SCOPE/);
 assert.equal(aiStatus(c).guard,MIGUEL_CONVERSATIONAL_AI_GUARD);assert.notEqual(aiStatus(c).guard,CONVERSATIONAL_AI_GUARD);assert.equal(JSON.stringify(aiStatus(c)).includes(secret),false);
});

test('Miguel setup stages one own probe then saves encrypted scope and restores across a database restart',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'miguel-ai-isolated-')),file=path.join(directory,'bot.sqlite'),key=randomBytes(32);
 const f=fixture({configured:false,store:new Store(file,'servicio-tecnico',key)});let restarted;
 try{
  const env=setup(),value=await installOwnAiSetup(f.c,f.s,env,f.fetcher);
  assert.equal(value.company,'S.TECNICO');assert.equal(value.guard,MIGUEL_OWN_AI_SETUP_GUARD);assert.equal(value.health.company,'S.TECNICO');assert.equal(value.health.guard,MIGUEL_CONVERSATIONAL_AI_GUARD);assert.equal(f.requests.length,1);
  const sealed=f.s.db.prepare("SELECT value FROM meta WHERE key='own-ai-initial-setup'").get().value,record=f.s.open(sealed);
  assert.equal(sealed.includes(secret),false);assert.equal(JSON.stringify(value).includes(secret),false);assert.equal(record.env.BOT_AI_SCOPE,'S.TECNICO');
  const again=await installOwnAiSetup(f.c,f.s,env,f.fetcher);assert.equal(again.duplicate,true);assert.equal(f.requests.length,1);
  assert.equal(ownAiUsage(f.c,f.s).callsReserved,1);assert.equal(ownAiUsage(f.c,f.s).outcomes.done,1);
  f.s.close();restarted=new Store(file,'servicio-tecnico',key);const config={...f.c,conversationalAi:aiConfiguration({},'servicio-tecnico')};
  assert.equal(restoreOwnAiSetup(config,restarted),true);assert.equal(ownAiScopeMatches(config,restarted),true);assert.equal(ownAiUsage(config,restarted).callsReserved,1);
  await probeOwnAi(config,restarted,()=>{throw Error('No repeated isolated probe permitted');});
  for(const table of ['events','outbox','conversations','questions'])assert.equal(restarted.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 }finally{
  try{f.s.close();}catch{}restarted?.close();
  const absolute=path.resolve(directory),parent=path.resolve(os.tmpdir());if(!absolute.startsWith(parent+path.sep)||!path.basename(absolute).startsWith('miguel-ai-isolated-'))throw Error('ISOLATED_CLEANUP_SCOPE');
  fs.rmSync(absolute,{recursive:true,force:true});
 }
});

test('cross-company setup and tampered stored identity cannot configure Miguel or reach a provider',async()=>{
 const f=fixture({configured:false}),other=new Store(':memory:','fumigacion',randomBytes(32));
 try{
  await assert.rejects(installOwnAiSetup(f.c,other,setup(),f.fetcher),/OWN_SCOPE/);await assert.rejects(installOwnAiSetup(f.c,f.s,setup({BOT_AI_SCOPE:'FUMIGACION'}),f.fetcher),/OWN_SCOPE/);
  assert.equal(f.requests.length,0);const env=setup();await installOwnAiSetup(f.c,f.s,env,f.fetcher);
  const row=f.s.db.prepare("SELECT value FROM meta WHERE key='own-ai-initial-setup'").get(),record=f.s.open(row.value);record.health.company='FUMIGACION';
  f.s.db.prepare("UPDATE meta SET value=? WHERE key='own-ai-initial-setup'").run(f.s.seal(record));
  assert.throws(()=>restoreOwnAiSetup({...f.c,conversationalAi:aiConfiguration({},'servicio-tecnico')},f.s),/STORED_CONFIGURATION_INVALID/);
  await assert.rejects(installOwnAiSetup(f.c,f.s,env,f.fetcher),/ALREADY_CONFIGURED/);assert.equal(f.requests.length,1);
 }finally{f.s.close();other.close();}
});

test('failed or uncertain Miguel setup remains inactive and is never automatically retried',async()=>{
 const f=fixture({configured:false});let calls=0;
 try{
  const e=f.event('Hola');f.s.enqueue(e);f.s.hold(phone,e.id);const env=setup(),fail=async()=>{calls++;assert.equal(f.c.conversationalAi.ready,false);throw Error('isolated response lost');};
  await assert.rejects(installOwnAiSetup(f.c,f.s,env,fail),/response lost/);await assert.rejects(installOwnAiSetup(f.c,f.s,env,fail),/ALREADY_RESERVED/);
  assert.equal(calls,1);assert.equal(f.c.conversationalAi.ready,false);assert.equal(f.s.conversation(phone).hold,1);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key='own-ai-initial-setup'").get().n,0);
 }finally{f.s.close();}
});

test('technical extraction preserves literal equipment and negative fault with its own context and knowledge',async()=>{
 const f=fixture({handler:()=>({slots:{...empty(),service:'refrigerador',detail:'no enfría',location:'Medellín',preference:'inventada'},intent:{kind:'new-service',evidence:'Mi refrigerador no enfría en Medellín'}})});
 try{
  f.s.approvedPriceCatalogs=()=>{throw Error('Fumigacion knowledge must not be queried');};
  const e=f.event('Mi refrigerador no enfría en Medellín. Mi correo privado@example.com'),analysis=await understandOwnCustomer(f.c,f.s,f.fetcher,e,{slots:{detail:'hace ruido',rooms:'FUM-ROOMS',mattresses:'FUM-MATTRESS',staff:'OTHER_SECRET'},caseAnswers:[{company:'FUMIGACION',source:'WRONG_COMPANY_SOURCE',at:Date.now()-1000,validUntil:Date.now()+10000,question:'OTHER_QUESTION',answer:'OTHER_ANSWER'}]});
  assert.deepEqual(analysis.slots,{service:'refrigerador',location:'Medellín',detail:'no enfría'});assert.equal(analysis.company,'S.TECNICO');assert.equal(analysis.guard,MIGUEL_CONVERSATIONAL_AI_GUARD);assert.equal(ownMiguelIntent(analysis,e).kind,'new-service');
  const r=f.requests[0];assert.equal(r.input.context.slots.detail,'hace ruido');assert.equal(r.input.approvedKnowledge.company,'S.TECNICO');assert.deepEqual(r.body.text.format.schema.properties.intent.properties.kind.enum,MIGUEL_INTENTS);
  for(const forbidden of ['FUMIGACION','FUM-ROOMS','FUM-MATTRESS','OTHER_SECRET','OTHER_ANSWER','privado@example.com','99.000','María Ángel'])assert.equal(r.body.input.includes(forbidden),false);
 }finally{f.s.close();}
});

test('technical negated equipment and location are rejected while a negative fault remains literal',async()=>{
 const f=fixture({handler:()=>({slots:{...empty(),service:'nevera',location:'Bogotá',detail:'no centrifuga'},intent:{kind:'new-service',evidence:'Lavadora no centrifuga'}})});
 try{
  const e=f.event('No tengo nevera. No estoy en Bogotá. Lavadora no centrifuga en Medellín.'),analysis=await understandOwnCustomer(f.c,f.s,f.fetcher,e,{});
  assert.equal(analysis.slots.service,undefined);assert.equal(analysis.slots.location,undefined);assert.equal(analysis.slots.detail,'no centrifuga');
 }finally{f.s.close();}
});

test('technical understanding rejects non-own, old, staff, internal, forwarded, media and human-held turns',async()=>{
 const f=fixture(),other=new Store(':memory:','fumigacion',randomBytes(32));
 try{
  const e=f.event('Mi nevera no enfría');for(const change of [{at:f.c.conversationalAi.enabledFrom-1},{fromMe:true},{phone:SANDRA},{forwarded:true},{kind:'audio'},{line:'not-own'},{text:'Si tuviera una nevera'},{text:'Mi vecino tiene una nevera'}])assert.deepEqual(await understandOwnCustomer(f.c,f.s,f.fetcher,{...e,...change},{}),{});
  assert.deepEqual(await understandOwnCustomer(f.c,other,f.fetcher,e,{}),{});f.s.enqueue(e);f.s.hold(phone,e.id);assert.deepEqual(await understandOwnCustomer(f.c,f.s,f.fetcher,e,{}),{});assert.equal(f.requests.length,0);
 }finally{f.s.close();other.close();}
});

test('Miguel calls remain durable, bounded and idempotent, and failed extraction does not retry',async()=>{
 const f=fixture({limit:1});try{
  const e=f.event('Mi nevera no enfría');await understandOwnCustomer(f.c,f.s,f.fetcher,e,{});await understandOwnCustomer(f.c,f.s,f.fetcher,e,{});assert.equal(f.requests.length,1);
  await assert.rejects(understandOwnCustomer(f.c,f.s,f.fetcher,{...e,id:'MIGUEL_LIMIT02'},{}),/MONTHLY_CALL_LIMIT/);assert.equal(ownAiUsage(f.c,f.s).remaining,0);assert.equal(ownAiUsage(f.c,f.s).outcomes.done,1);
 }finally{f.s.close();}
 const fail=fixture({handler:()=>Error('isolated unknown provider outcome')});try{
  const e=fail.event('Medellín');await assert.rejects(understandOwnCustomer(fail.c,fail.s,fail.fetcher,e,{}));await assert.rejects(understandOwnCustomer(fail.c,fail.s,fail.fetcher,e,{}),/ALREADY_RESERVED/);assert.equal(fail.requests.length,1);assert.equal(ownAiUsage(fail.c,fail.s).outcomes.failed,1);assert.ok(ownAiUsage(fail.c,fail.s).outcomes.lastFailureAt);
 }finally{fail.s.close();}
});

test('Maria outcomes count own current-month legacy attempts and preserve her independent budget',async()=>{
 const s=new Store(':memory:','fumigacion',randomBytes(32)),c={company:'fumigacion',...BUSINESSES.fumigacion,lines:BUSINESSES.fumigacion.phones.map(phone=>({phone})),conversationalAi:aiConfiguration(setup({BOT_AI_SCOPE:'FUMIGACION'}),'fumigacion')};let calls=0;
 const fetcher=async(url,options)=>{calls++;if(calls===2)throw Error('isolated Fumigacion failure');const input=JSON.parse(JSON.parse(options.body).input);return {ok:true,json:async()=>({status:'completed',output_text:JSON.stringify({slots:empty(),intent:{kind:'other',evidence:input.customerText}})})};};
 try{
  const e={id:'MARIA_OUTCOME01',phone,line:c.lines[0].phone,kind:'text',fromMe:false,at:Date.now(),text:'Medellín'};
  await understandOwnCustomer(c,s,fetcher,e,{});await assert.rejects(understandOwnCustomer(c,s,fetcher,{...e,id:'MARIA_OUTCOME02'},{}),/Fumigacion failure/);
  const month=new Date().toISOString().slice(0,7);
  for(const [id,value] of [['foreign',{state:'DONE',company:'S.TECNICO',month,at:Date.now()+1000}],['previous-month',{state:'DONE',month:'2001-01',at:Date.now()+1000}]])s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('ai-attempt:'+id,s.seal(value));
  const result=ownAiUsage(c,s);assert.equal(result.callsReserved,2);assert.equal(result.monthlyCallLimit,10000);assert.equal(result.remaining,9998);assert.equal(result.latestQuality,null);assert.equal(result.outcomes.done,1);assert.equal(result.outcomes.failed,1);assert.equal(result.outcomes.started,0);assert.ok(result.outcomes.lastSuccessAt);assert.ok(result.outcomes.lastFailureAt);assert.equal(JSON.stringify(result).includes(secret),false);
  assert.equal(ownAiUsage(c,{company:'servicio-tecnico'}),null);
 }finally{s.close();}
});

test('technical approved wording cannot import price schedules, painting promises or generated claims',async()=>{
 const f=fixture();try{
  const e=f.event('Mi nevera no enfría');f.s.enqueue(e);const conv=f.s.conversation(phone),caseId='servicio-tecnico:'+e.id;
  f.s.saveConversation(phone,{...conv.state,caseId,slots:{service:'nevera',detail:'no enfría'}});const text='¿Qué falla presenta el equipo?';f.s.queue(e.id+':reply',phone,e.line,text,false,conv.revision,caseId);const row=f.s.db.prepare('SELECT * FROM outbox').get();
  const chosen=await composeOwnReply(f.c,f.s,f.fetcher,row,text);assert.equal(chosen,'Cuéntame qué falla presenta el equipo.');assert.equal(f.requests[0].input.company,'S.TECNICO');assert.equal(f.requests[0].input.context.slots.detail,'no enfría');assert.equal(f.requests[0].body.instructions.includes('María'),false);
  assert.deepEqual(replyCandidates('¿Qué plaga deseas tratar o buscas un servicio preventivo?','servicio-tecnico'),['¿Qué plaga deseas tratar o buscas un servicio preventivo?']);
  assert.deepEqual(replyCandidates('Con gusto. La cotización es $99.000 COP.','servicio-tecnico'),['Con gusto. La cotización es $99.000 COP.']);
  f.s.hold(phone,'MIGUEL_STAFF01');const before=f.requests.length;assert.equal(await composeOwnReply(f.c,f.s,f.fetcher,row,text),text);assert.equal(f.requests.length,before);
 }finally{f.s.close();}
});

test('Miguel quality cases are distinct, deduplicated and restricted to technical interpretations',async()=>{
 const f=fixture({handler:(body,input)=>{const c=MIGUEL_EVALUATION_CASES.find(c=>c.text===input.customerText);return {slots:empty(),intent:{kind:c.expected,evidence:c.text}};}});
 try{
  const ids=MIGUEL_EVALUATION_CASES.map(c=>c.id),result=await evaluateOwnAi(f.c,f.s,f.fetcher,ids);assert.equal(result.company,'S.TECNICO');assert.equal(result.passed,12);await evaluateOwnAi(f.c,f.s,f.fetcher,ids);assert.equal(f.requests.length,12);assert.equal(ownAiUsage(f.c,f.s).latestQuality.company,'S.TECNICO');
  assert.equal(f.requests.some(r=>r.body.input.includes('María Ángel')),false);for(const table of ['events','outbox','conversations','questions'])assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
  await assert.rejects(evaluateOwnAi(f.c,f.s,f.fetcher,['new-standard']),/CASE_IDS/);
 }finally{f.s.close();}
});

test('a technical new case excludes old intake and operational explanations from model context',async()=>{
 const f=fixture();try{
  await understandOwnCustomer(f.c,f.s,f.fetcher,f.event('Necesito revisar mi lavadora'),{requestedNewCase:true,slots:{service:'OLD_EQUIPMENT',detail:'OLD_FAULT'},lastText:'OLD_CUSTOMER',asked:['detail'],caseAnswers:[{source:'OLD_SOURCE01',at:Date.now()-1000,validUntil:Date.now()+10000,question:'OLD_QUESTION',answer:'OLD_ANSWER'}]});
  const context=f.requests[0].input.context;assert.deepEqual(context.slots,{});assert.deepEqual(context.sameCaseClarifications,[]);assert.deepEqual(context.asked,[]);assert.equal(context.previousCustomerText,null);assert.equal(context.newCase,true);
 }finally{f.s.close();}
});

test('own technical intents require exact event, company, guard, evidence and semantic profile',()=>{
 const f=fixture();try{
  const e=f.event('Necesito que revisen la reparación anterior'),analysis={company:'S.TECNICO',eventId:e.id,guard:MIGUEL_CONVERSATIONAL_AI_GUARD,semanticGuard:MIGUEL_UNDERSTANDING_GUARD,slots:{},intent:{kind:'post-service',evidence:e.text}};
  assert.equal(miguelSemanticFollowup(analysis,e).kind,'post-service');for(const change of [{company:'FUMIGACION'},{eventId:'OTHER_EVENT01'},{guard:CONVERSATIONAL_AI_GUARD},{semanticGuard:'unknown'},{intent:{kind:'reinforcement',evidence:e.text}},{intent:{kind:'new-service',evidence:'inventado'}}])assert.equal(ownMiguelIntent({...analysis,...change},e),null);
 }finally{f.s.close();}
});

test('isolated technical drain keeps current literal equipment and fault without asking them again',async()=>{
 const f=fixture({handler:(body,input)=>body.text.format.name==='miguel_literal_slots'?{slots:{...empty(),service:'refrigerador',detail:'no enfría',location:'Medellín'},intent:{kind:'new-service',evidence:'Mi refrigerador no enfría en Medellín'}}:{choice:0}});
 try{
  const id='MIGUEL_DRAIN01';await f.run('Mi refrigerador no enfría en Medellín',id);const conv=f.s.conversation(phone),reply=f.reply(id);
  assert.equal(conv.state.slots.service,'refrigerador');assert.equal(conv.state.slots.detail,'no enfría');assert.match(conv.state.slots.location,/^medell[ií]n$/i);assert.equal(conv.state.intakeSources.detail.guard,MIGUEL_CONVERSATIONAL_AI_GUARD);
  assert.doesNotMatch(reply.text,/Qué equipo|Qué falla/);assert.match(reply.text,/día|franja/);assert.equal(f.sent.filter(x=>!x.row.internal).length,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.s.close();}
});

test('spoofed technical understanding does not fill intake or create AI provenance',()=>{
 const f=fixture();try{
  const e=f.event('Mi refrigerador zumba en Palmira'),analysis={company:'S.TECNICO',eventId:e.id,guard:MIGUEL_CONVERSATIONAL_AI_GUARD,semanticGuard:MIGUEL_UNDERSTANDING_GUARD,slots:{service:'refrigerador',detail:'zumba',location:'Palmira'},intent:{kind:'new-service',evidence:e.text}},state={slots:{},asked:[]};
  const baseline=customerDecision('servicio-tecnico',state,e).state;
  for(const change of [{company:'FUMIGACION'},{eventId:'WRONG_EVENT01'},{guard:CONVERSATIONAL_AI_GUARD},{semanticGuard:'WRONG_GUARD'}]){
   const actual=customerDecision('servicio-tecnico',state,e,{...analysis,...change}).state;assert.deepEqual(actual.slots,baseline.slots);assert.equal(Object.values(actual.intakeSources||{}).some(s=>s.guard===MIGUEL_CONVERSATIONAL_AI_GUARD),false);
  }
 }finally{f.s.close();}
});
