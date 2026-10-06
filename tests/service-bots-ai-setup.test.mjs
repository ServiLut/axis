import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {aiConfiguration} from '../automation/service-bots/ai-settings.mjs';
import {installOwnAiSetup,restoreOwnAiSetup} from '../automation/service-bots/ai-setup.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
const secret='sk-proj-'+ 'IsolatedOwnCredential'.repeat(4);
const setup=()=>({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_OPENAI_API_KEY:secret,BOT_AI_MODEL:'gpt-6-luna',BOT_AI_MONTHLY_CALL_LIMIT:'10000',BOT_AI_ENABLED_FROM:new Date(Date.now()+60000).toISOString(),BOT_OPENAI_PROJECT_ID:'proj_isolated_own'});
function fixture(company='fumigacion'){
 const s=new Store(':memory:',company,randomBytes(32));
 const token='a'.repeat(43),c={company,...BUSINESSES[company],enabled:true,lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'isolated-'+i})),authHash:createHash('sha256').update(token).digest('hex'),webhookHash:createHash('sha256').update('b'.repeat(43)).digest('hex'),conversationalAi:aiConfiguration({},company)};
 let calls=0;
 const fetcher=async(url,options)=>{calls++;const body=JSON.parse(options.body);
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer '+secret);
  assert.equal(options.headers['OpenAI-Project'],'proj_isolated_own');assert.equal(body.store,false);assert.deepEqual(body.reasoning,{effort:'none'});
  assert.equal(body.text.format.strict,true);assert.equal(body.max_output_tokens,80);
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'{"choice":0}'}]}],usage:{input_tokens:20,output_tokens:5}})};
 };
 return {s,c,token,fetcher,calls:()=>calls};
}
test('initial own AI setup verifies one provider call before applying encrypted durable configuration; identical retry is harmless',async()=>{
 const f=fixture();try{
  const env=setup();const first=await installOwnAiSetup(f.c,f.s,env,f.fetcher);
  assert.equal(first.configured,true);assert.equal(f.calls(),1);assert.equal(f.c.conversationalAi.monthlyCallLimit,10000);
  const encrypted=f.s.db.prepare("SELECT value FROM meta WHERE key='own-ai-initial-setup'").get().value;
  assert.equal(encrypted.includes(secret),false);assert.equal(JSON.stringify(first).includes(secret),false);
  assert.equal(f.s.open(f.s.db.prepare("SELECT value FROM meta WHERE key=?").get('ai-budget:'+new Date().toISOString().slice(0,7)).value).calls,1);
  const again=await installOwnAiSetup(f.c,f.s,env,f.fetcher);assert.equal(again.duplicate,true);assert.equal(f.calls(),1);
  await assert.rejects(installOwnAiSetup(f.c,f.s,{...env,BOT_AI_MONTHLY_CALL_LIMIT:'3000'},f.fetcher),/ALREADY_CONFIGURED/);
  const restarted={...f.c,conversationalAi:aiConfiguration({},'fumigacion')};assert.equal(restoreOwnAiSetup(restarted,f.s),true);
  assert.equal(restarted.conversationalAi.key,secret);assert.equal(restarted.conversationalAi.enabledFrom,Date.parse(env.BOT_AI_ENABLED_FROM));
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.s.close();}
});
test('wrong company, extra fields, old cut and invalid scope never reach provider',async()=>{
 const f=fixture();const other=fixture('servicio-tecnico');try{
  await assert.rejects(installOwnAiSetup(other.c,other.s,setup(),other.fetcher),/OWN_SCOPE/);
  for(const bad of [{...setup(),extra:'wrong'},{...setup(),BOT_AI_SCOPE:'S.TECNICO'},{...setup(),BOT_AI_ENABLED_FROM:'2026-01-01T00:00:00.000Z'}])await assert.rejects(installOwnAiSetup(f.c,f.s,bad,f.fetcher));
  assert.equal(f.calls(),0);assert.equal(other.calls(),0);assert.equal(f.c.conversationalAi.ready,false);
 }finally{f.s.close();other.s.close();}
});
test('failed provider setup preserves inactive config and human holds; the same failed attempt is not retried',async()=>{
 const f=fixture();try{
  const e={id:'ISOLATEDHOLD',phone:'573001112233',line:f.c.lines[0].phone,at:Date.now(),kind:'text',text:'Hola',fromMe:false};
  f.s.enqueue(e);f.s.hold(e.phone,e.id);const env=setup();let calls=0;
  const fail=async()=>{calls++;return {ok:false,status:429};};
  await assert.rejects(installOwnAiSetup(f.c,f.s,env,fail),/HTTP_429/);
  await assert.rejects(installOwnAiSetup(f.c,f.s,env,fail),/ALREADY_RESERVED/);
  assert.equal(calls,1);assert.equal(f.c.conversationalAi.ready,false);assert.equal(f.s.conversation(e.phone).hold,1);
  assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key='own-ai-initial-setup'").get().n,0);
 }finally{f.s.close();}
});
test('setup HTTP route requires own admin authentication and never returns the credential',async()=>{
 const f=fixture();const server=createBotServer(f.c,f.s,{fetcher:f.fetcher},{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/ai-setup',env=setup();
  const post=auth=>fetch(url,{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(env)});
  const denied=await post('b'.repeat(43));assert.equal(denied.status,401);assert.equal(f.calls(),0);
  const ok=await post(f.token);assert.equal(ok.status,200);assert.equal((await ok.text()).includes(secret),false);assert.equal(f.calls(),1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));f.s.close();}
});
