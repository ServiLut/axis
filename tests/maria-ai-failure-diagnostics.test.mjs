import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {aiConfiguration} from '../automation/service-bots/ai-settings.mjs';
import {probeOwnAi,ownAiUsage,MARIA_AI_FAILURE_GUARD} from '../automation/service-bots/conversational-ai.mjs';

const privateValue='SYNTHETIC_PRIVATE_ERROR_VALUE';
const response=data=>({ok:true,status:200,json:async()=>data});
const output=text=>response({status:'completed',output_text:text});
function fixture(company='fumigacion',limit=20){
 const config={company,conversationalAi:aiConfiguration({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:company==='fumigacion'?'FUMIGACION':'S.TECNICO',BOT_AI_MODEL:'fixture-model',BOT_OPENAI_API_KEY:privateValue,BOT_AI_MONTHLY_CALL_LIMIT:String(limit),BOT_AI_ENABLED_FROM:new Date(Date.now()-60000).toISOString()},company)};
 const store=new Store(':memory:',company,randomBytes(32));
 const attempt=()=>store.db.prepare("SELECT value FROM meta WHERE key LIKE 'ai-attempt:%' ORDER BY rowid DESC LIMIT 1").get();
 return {config,store,attempt:()=>{const row=attempt();return row?store.open(row.value):null;}};
}
const scenarios=[
 ...[401,403,429,500].map(status=>({name:'http-'+status,fetcher:async()=>({ok:false,status}),reason:'AI_PROVIDER_HTTP',stage:'provider-response',http:status})),
 {name:'timeout',fetcher:async()=>{throw new DOMException(privateValue,'TimeoutError');},reason:'AI_PROVIDER_TIMEOUT',stage:'provider-request'},
 {name:'abort',fetcher:async()=>{throw new DOMException(privateValue,'AbortError');},reason:'AI_PROVIDER_ABORTED',stage:'provider-request'},
 {name:'transport-error-with-secret',fetcher:async()=>{throw Error('Bearer '+privateValue);},reason:'AI_PROVIDER_TRANSPORT_FAILURE',stage:'provider-request'},
 {name:'provider-json-invalid',fetcher:async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError(privateValue);}}),reason:'AI_PROVIDER_RESPONSE_INVALID_JSON',stage:'provider-json'},
 {name:'provider-json-timeout',fetcher:async()=>({ok:true,status:200,json:async()=>{throw new DOMException(privateValue,'TimeoutError');}}),reason:'AI_PROVIDER_TIMEOUT',stage:'provider-json'},
 {name:'provider-json-aborted',fetcher:async()=>({ok:true,status:200,json:async()=>{throw new DOMException(privateValue,'AbortError');}}),reason:'AI_PROVIDER_ABORTED',stage:'provider-json'},
 {name:'provider-json-body-transport',fetcher:async()=>({ok:true,status:200,json:async()=>{throw new TypeError(privateValue);}}),reason:'AI_PROVIDER_TRANSPORT_FAILURE',stage:'provider-json'},
 {name:'untrusted-error-message-cannot-spoof-schema-stage',fetcher:async()=>{throw Error('AI_RESPONSE_SCHEMA');},reason:'AI_PROVIDER_TRANSPORT_FAILURE',stage:'provider-request'},
 {name:'structured-json-invalid',fetcher:async()=>output('{"choice":'+privateValue),reason:'AI_STRUCTURED_OUTPUT_INVALID_JSON',stage:'structured-json'},
 {name:'incomplete',fetcher:async()=>response({status:'incomplete',incomplete_details:{reason:privateValue}}),reason:'AI_RESPONSE_UNUSABLE',stage:'provider-response'},
 {name:'refusal',fetcher:async()=>response({output:[{content:[{type:'refusal',refusal:privateValue}]}]}),reason:'AI_RESPONSE_UNUSABLE',stage:'provider-response'},
 {name:'provider-error-body',fetcher:async()=>response({error:{message:privateValue}}),reason:'AI_RESPONSE_UNUSABLE',stage:'provider-response'},
 {name:'extra-schema-field',fetcher:async()=>output(JSON.stringify({choice:0,extra:privateValue})),reason:'AI_RESPONSE_SCHEMA',stage:'schema-validation'},
 {name:'unapproved-reply',fetcher:async()=>output('{"choice":7}'),reason:'AI_REPLY_NOT_APPROVED',stage:'schema-validation'},
 {name:'null-output',fetcher:async()=>output('null'),reason:'AI_RESPONSE_SCHEMA',stage:'schema-validation'},
];
for(const scenario of scenarios)test('Maria persists closed diagnostic without secret or retry: '+scenario.name,async()=>{
 const f=fixture();let calls=0;const fetcher=async(...args)=>{calls++;return scenario.fetcher(...args);};
 try{
  await assert.rejects(()=>probeOwnAi(f.config,f.store,fetcher));
  const first=f.attempt();assert.equal(first.state,'FAILED');
  assert.deepEqual(first.failure,{guard:MARIA_AI_FAILURE_GUARD,reasonCode:scenario.reason,stage:scenario.stage,httpStatus:scenario.http??null,automaticRetry:false});
  await assert.rejects(()=>probeOwnAi(f.config,f.store,fetcher),/AI_ATTEMPT_ALREADY_RESERVED/);
  assert.equal(calls,1);assert.deepEqual(f.attempt(),first);
  const usage=ownAiUsage(f.config,f.store);assert.equal(usage.callsReserved,1);assert.equal(usage.outcomes.failed,1);
  assert.equal(usage.failureDiagnostics.classifiedFailures,1);assert.equal(usage.failureDiagnostics.legacyOrUnclassifiedFailures,0);
  assert.deepEqual(usage.failureDiagnostics.countsByReason,{[scenario.reason]:1});
  const saved=f.store.db.prepare('SELECT value FROM meta').all().map(row=>f.store.open(row.value));
  assert.equal(JSON.stringify([...saved,usage]).includes(privateValue),false);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}
});

test('successful request keeps the same result/cache/budget and has no failure diagnostic',async()=>{
 const f=fixture();let calls=0;try{
  const fetcher=async()=>{calls++;return output('{"choice":0}');};
  await probeOwnAi(f.config,f.store,fetcher);await probeOwnAi(f.config,f.store,fetcher);
  assert.equal(calls,1);assert.equal(f.attempt().state,'DONE');assert.equal(f.attempt().failure,undefined);
  const usage=ownAiUsage(f.config,f.store);assert.equal(usage.outcomes.done,1);assert.equal(usage.outcomes.failed,0);assert.equal(usage.callsReserved,1);
  assert.deepEqual(usage.failureDiagnostics.countsByReason,{});assert.equal(usage.failureDiagnostics.lastClassifiedFailure,null);
 }finally{f.store.close();}
});

test('historical unknown failures retain exact encrypted values and are not assigned an invented reason',()=>{
 const f=fixture();try{
  const key='ai-attempt:legacy-failure',value=f.store.seal({state:'FAILED',month:new Date().toISOString().slice(0,7),model:'fixture-model',at:Date.now()-1000});
  f.store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,value);
  const usage=ownAiUsage(f.config,f.store);assert.equal(usage.outcomes.failed,1);assert.equal(usage.failureDiagnostics.legacyOrUnclassifiedFailures,1);assert.equal(usage.failureDiagnostics.classifiedFailures,0);
  assert.equal(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value,value);
 }finally{f.store.close();}
});

test('usage rejects unrecognized stored diagnostics and never exports unknown/raw fields',()=>{
 const f=fixture();try{
  const month=new Date().toISOString().slice(0,7),at=Date.now();
  const rows=[{guard:MARIA_AI_FAILURE_GUARD,reasonCode:privateValue,stage:'provider-request',httpStatus:null,automaticRetry:false},{guard:MARIA_AI_FAILURE_GUARD,reasonCode:'AI_PROVIDER_HTTP',stage:privateValue,httpStatus:500,automaticRetry:false},{guard:MARIA_AI_FAILURE_GUARD,reasonCode:'AI_PROVIDER_HTTP',stage:'provider-response',httpStatus:privateValue,automaticRetry:false},{guard:MARIA_AI_FAILURE_GUARD,reasonCode:'AI_PROVIDER_HTTP',stage:'provider-response',httpStatus:429,automaticRetry:false,raw:privateValue}];
  rows.forEach((failure,index)=>f.store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('ai-attempt:stored-'+index,f.store.seal({state:'FAILED',month,model:'fixture-model',at:at+index,failure})));
  const usage=ownAiUsage(f.config,f.store);assert.equal(usage.failureDiagnostics.classifiedFailures,1);assert.equal(usage.failureDiagnostics.legacyOrUnclassifiedFailures,3);assert.equal(JSON.stringify(usage).includes(privateValue),false);
 }finally{f.store.close();}
});

test('Miguel retains its old attempt and status shape without Maria diagnostics',async()=>{
 const f=fixture('servicio-tecnico');try{
  await assert.rejects(()=>probeOwnAi(f.config,f.store,async()=>{throw Error(privateValue);}));
  assert.equal(f.attempt().company,'S.TECNICO');assert.equal(f.attempt().failure,undefined);
  assert.equal(ownAiUsage(f.config,f.store).failureDiagnostics,undefined);
 }finally{f.store.close();}
});

test('monthly budget remains reserved once and a second key never makes another provider call',async()=>{
 const f=fixture('fumigacion',1);let calls=0;const fetcher=async()=>{calls++;return output('{"choice":0}');};try{
  await probeOwnAi(f.config,f.store,fetcher);f.config.conversationalAi.enabledFrom++;
  await assert.rejects(()=>probeOwnAi(f.config,f.store,fetcher),/AI_MONTHLY_CALL_LIMIT/);assert.equal(calls,1);assert.equal(ownAiUsage(f.config,f.store).callsReserved,1);
 }finally{f.store.close();}
});
