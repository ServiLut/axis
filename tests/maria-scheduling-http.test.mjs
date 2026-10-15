import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {Transport} from '../automation/service-bots/transport.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {MARIA_SCHEDULING_URL} from '../automation/service-bots/maria-scheduling-access.mjs';

const token={admin:'a'.repeat(43),webhook:'w'.repeat(43),program:'p'.repeat(43),schedule:'s'.repeat(43),proof:'v'.repeat(43)};
const hash=v=>createHash('sha256').update(v).digest('hex');
async function isolated(run,company='fumigacion'){
 const now=Date.now(),config={company,...BUSINESSES[company],enabled:true,activatedAt:now-60000,responseTargetMs:10000,authHash:hash(token.admin),webhookHash:hash(token.webhook),provider:'https://no-real-network.invalid',lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'synthetic-http-'+i})),mariaProgram:{enabled:true,actorId:'25b2e265-e463-4592-bab1-86b7b1687eae',startsAt:now-60000,expiresAt:now+86400000,token:token.program}};
 const store=new Store(':memory:',company,randomBytes(32)),calls=[];
 const transport=new Transport(config,async(...args)=>{calls.push(args[0]);throw Error('REAL_NETWORK_FORBIDDEN');});
 const server=createBotServer(config,store,transport,{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const post=async(route,body={},key=token.admin)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+route,{method:'POST',headers:{'content-type':'application/json',...(key?{authorization:'Bearer '+key}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});return {status:r.status,body:await r.json()};};
 const grant={actorId:config.mariaProgram.actorId,url:MARIA_SCHEDULING_URL,token:token.schedule,proofToken:token.proof,startsAt:now-1000,expiresAt:config.mariaProgram.expiresAt};
 try{await run({config,store,calls,post,grant});}finally{await new Promise(r=>server.close(r));store.close();}
}
test('HTTP scheduling is closed before a separate grant and no current credential impersonates a proof',()=>isolated(async({post,calls,store})=>{
 for(const key of [null,...Object.values(token)])assert.equal((await post('/program-scheduling-proof',{company:'fumigacion',schedulingKey:'00000000-0000-4000-8000-000000000001'},key)).status,401);
 assert.equal(calls.length,0);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);
}));
test('HTTP installation is admin-only and installed proof/write secrets do not gain admin or ingress access',()=>isolated(async({post,grant,calls})=>{
 for(const key of [null,token.webhook,token.program,token.schedule,token.proof])assert.equal((await post('/own-order-scheduling-setup',grant,key)).status,401);
 const r=await post('/own-order-scheduling-setup',grant);assert.equal(r.status,200);assert.equal(r.body.enabled,true);assert.equal(r.body.scope,'FIRST_SCHEDULE_OF_OWN_NEW_ORDER_ONLY');assert.doesNotMatch(JSON.stringify(r.body),new RegExp(token.schedule+'|'+token.proof));
 for(const key of [token.schedule,token.proof])for(const route of ['/status','/webhook','/own-order-scheduling-setup'])assert.equal((await post(route,{},key)).status,401);
 for(const key of [token.admin,token.webhook,token.program,token.schedule])assert.equal((await post('/program-scheduling-proof',{},key)).status,401);
 assert.equal((await post('/program-scheduling-proof',{company:'fumigacion',schedulingKey:'00000000-0000-4000-8000-000000000001'},token.proof)).status,409);assert.equal(calls.length,0);
}));
test('HTTP setup cannot expand parent expiry or business scope; expired proof access stops without releasing holds',()=>isolated(async({post,config,grant,store,calls})=>{
 for(const patch of [{expiresAt:grant.expiresAt+1},{actorId:'another-actor'},{paymentsEnabled:true},{url:MARIA_SCHEDULING_URL+'/other'}])assert.equal((await post('/own-order-scheduling-setup',{...grant,...patch})).status,409);
 assert.equal(config.ownOrderScheduling,undefined);assert.equal((await post('/own-order-scheduling-setup',grant)).status,200);
 config.ownOrderScheduling.expiresAt=Date.now()-1;assert.equal((await post('/program-scheduling-proof',{},token.proof)).status,401);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(calls.length,0);
}));
test('another business never acquires the Fumigación scheduling scope',()=>isolated(async({post,grant,config,calls})=>{
 assert.equal((await post('/own-order-scheduling-setup',grant)).status,403);assert.equal(config.ownOrderScheduling,undefined);assert.equal(calls.length,0);
},'servicio-tecnico'));
