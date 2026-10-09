import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {configFromEnv,BUSINESSES,validateEvent} from '../automation/service-bots/config.mjs';
import {operationalCoverage} from '../automation/service-bots/line-scope.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {drainProgramRegistrations,registrationStatus,registrationHash,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {approvedBusinessPriceSchedule,BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
const blue='573126944997',red='573126938721',phone='573001112233';
const actorId='7508385b-536e-4aa2-8137-d734dfc900ef',orderId='85c47fc8-5314-4f68-a8d6-dde112640f5d';
const scope=at=>({version:'authorized-fumigacion-blue-only-v1',company:'fumigacion',activeLines:[blue],suspendedLines:[red],authorizedAt:new Date(at).toISOString(),authorizationSource:'direct-user-20261009-red-block-24h',reportedBlockedDurationHours:24});
function environment(company='fumigacion'){
 const lines=BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'own-'+i,apiKey:String(i).repeat(32)}));
 return {BOT_COMPANY:company,BOT_LINES_JSON:JSON.stringify(lines),BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'c'.repeat(64),BOT_DATA_KEY:'b'.repeat(64),BOT_DATABASE_PATH:'/data/'+company+'/bot.sqlite',BOT_EVOLUTION_URL:'https://own.example',BOT_ENABLED:'true',BOT_CHIEF_ONLY:'true',BOT_PRIOR_HISTORY_CHECK:'true',BOT_ACTIVATED_AT:new Date(Date.now()-3600000).toISOString()};
}
test('blue-only mode is a dedicated explicit FUM authorization and retains both credentials',()=>{
 const env=environment(),authorization=scope(Date.now()-10000),config=configFromEnv({...env,BOT_OPERATIONAL_LINE_SCOPE_JSON:JSON.stringify(authorization)});
 assert.deepEqual(config.operationalLineScope,authorization);assert.equal(config.lines.length,2);assert.equal(new Set(config.lines.map(l=>l.apiKey)).size,2);
 assert.equal(operationalCoverage(config).fullCompanyCoverageComplete,false);assert.deepEqual(operationalCoverage(config).suspendedLines,[red]);
 assert.equal(configFromEnv(env).operationalLineScope,null);
 for(const bad of [{...authorization,company:'servicio-tecnico'},{...authorization,activeLines:[red],suspendedLines:[blue]},{...authorization,authorizationSource:'reported-by-a-group-member'},{...authorization,authorizedAt:'invalid'},{...authorization,reportedBlockedDurationHours:1},[]])assert.throws(()=>configFromEnv({...env,BOT_OPERATIONAL_LINE_SCOPE_JSON:JSON.stringify(bad)}),/OPERATIONAL_LINE_SCOPE_REQUIRED/);
 assert.throws(()=>configFromEnv({...environment('servicio-tecnico'),BOT_OPERATIONAL_LINE_SCOPE_JSON:JSON.stringify(authorization)}),/OPERATIONAL_LINE_SCOPE_REQUIRED/);
});
test('private operational ingress accepts new blue sources, never suspended red or replay before authorization',()=>{
 const config=configFromEnv({...environment(),BOT_OPERATIONAL_LINE_SCOPE_JSON:JSON.stringify(scope(Date.now()-10000))});
 const now=Date.now(),body={instance:'own-0',owner:blue,event:{id:'NATIVE_BLUE_NEW',phone,at:new Date(now).toISOString(),kind:'text',text:'Hola',fromMe:false}};
 assert.ok(validateEvent(body,config,now));
 assert.equal(validateEvent({...body,instance:'own-1',owner:red},config,now),null);
 assert.equal(validateEvent({...body,event:{...body.event,fromMe:true},instance:'own-1',owner:red},config,now),null);
 assert.equal(validateEvent({...body,event:{...body.event,at:new Date(now-11000).toISOString()}},config,now),null);
 assert.ok(validateEvent({...body,instance:'own-1',owner:red},{...config,operationalLineScope:null},now));
});
test('the reported 24-hour block never automatically removes the explicit suspended route',()=>{
 const env=environment(),now=Date.now();env.BOT_ACTIVATED_AT=new Date(now-7*86400000).toISOString();
 const config=configFromEnv({...env,BOT_OPERATIONAL_LINE_SCOPE_JSON:JSON.stringify(scope(now-2*86400000))});
 assert.deepEqual(operationalCoverage(config).activeLines,[blue]);assert.deepEqual(operationalCoverage(config).suspendedLines,[red]);assert.equal(operationalCoverage(config).fullCompanyCoverageComplete,false);
});
async function withServer(run){
 const config=configFromEnv({...environment(),BOT_OPERATIONAL_LINE_SCOPE_JSON:JSON.stringify(scope(Date.now()-2000))});
 const auth=randomBytes(32).toString('base64url'),webhook=randomBytes(32).toString('base64url');config.authHash=createHash('sha256').update(auth).digest('hex');config.webhookHash=createHash('sha256').update(webhook).digest('hex');
 const store=new Store(':memory:','fumigacion',randomBytes(32)),calls=[];
 const transport={verifyLine:async line=>{calls.push(['verify',line]);if(line!==blue)throw Error('SUSPENDED');return {phone:line,ownerVerified:true,open:true};},verifyLineBinding:async line=>{calls.push(['binding',line]);return {phone:line,ownerVerified:true,open:false};}};
 const server=createBotServer(config,store,transport,{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const post=async(path,body={})=>{const res=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{Authorization:'Bearer '+(['/webhook','/event','/delivery'].includes(path)?webhook:auth),'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
 try{await run({config,store,calls,post});}finally{await new Promise(r=>server.close(r));store.close();}
}
test('health checks only active blue and exposes unverified suspended coverage rather than both lines ready',async()=>withServer(async({post,calls})=>{
 const result=await post('/channel-health');assert.equal(result.status,200);assert.equal(result.body.ready,true);assert.deepEqual(calls,[['verify',blue]]);
 assert.equal(result.body.operationalCoverage.fullCompanyCoverageComplete,false);assert.equal(result.body.lines.find(l=>l.phone===red).verified,false);assert.equal(result.body.lines.find(l=>l.phone===red).currentCoverage,false);
 const status=await post('/status');assert.equal(status.body.operationalCoverage.mode,'authorized-fumigacion-blue-only-v1');assert.equal(status.body.programRegistration.operationalCoverage.fullCompanyCoverageComplete,false);
}));
function redWebhook(id,fromMe,text='Hola'){return {instance:'own-1',event:'messages.upsert',data:{key:{id,remoteJid:phone+'@s.whatsapp.net',fromMe},message:{conversation:text},messageTimestamp:Math.floor(Date.now()/1000)}};}
test('red customer sources are durable observations with no operational admission or line migration',async()=>withServer(async({post,store,calls})=>{
 const body=redWebhook('RED_CUSTOMER_001',false),first=await post('/webhook',body),second=await post('/webhook',body);
 assert.equal(first.body.accepted,0);assert.equal(first.body.observed,1);assert.equal(second.body.duplicates,1);
 const row=store.db.prepare('SELECT line,state FROM events WHERE id=?').get('RED_CUSTOMER_001');assert.equal(row.line,red);assert.equal(row.state,'OBSERVED_SUSPENDED_LINE');assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(calls.some(([kind])=>kind==='verify'),false);
}));
test('a native red staff observation keeps human takeover while a known red bot echo does not',async()=>withServer(async({post,store})=>{
 await post('/webhook',redWebhook('RED_CUSTOMER_002',false));store.queue('known-red',phone,red,'Hola',false,0);store.db.prepare("UPDATE outbox SET state='DELIVERED',mid='RED_BOT_ECHO_001' WHERE id='known-red'").run();
 await post('/webhook',redWebhook('RED_BOT_ECHO_001',true));assert.equal(store.conversation(phone).hold,0);
 await post('/webhook',redWebhook('RED_STAFF_001',true,'Soy la asesora'));assert.equal(store.conversation(phone).hold,1);assert.equal(store.db.prepare('SELECT state FROM events WHERE id=?').get('RED_STAFF_001').state,'OBSERVED_SUSPENDED_LINE');
}));
test('red delivery metadata changes only its existing ledger entry and never queues a response',async()=>withServer(async({post,store,calls})=>{
 store.queue('red-previous',phone,red,'Mensaje anterior',false,0);store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid='RED_OLD_MID' WHERE id='red-previous'").run();
 const result=await post('/delivery',{instance:'own-1',owner:red,mid:'RED_OLD_MID',state:'DELIVERED'});assert.equal(result.body.observedOnly,true);assert.equal(store.db.prepare("SELECT state FROM outbox WHERE id='red-previous'").get().state,'DELIVERED');assert.deepEqual(calls,[['binding',red]]);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);
}));
function programFixture(){
 const start=Math.floor((Date.now()-30000)/1000)*1000,store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:start+86400000}};
 const engine=new Engine(store,config);let count=0;
 const turn=async text=>{const event={id:'BLUE_SOURCE_'+ ++count,phone,at:start+count*1000,line:blue,fromMe:false,kind:'text',text};store.enqueue(event);await engine.process(event);return event;};
 const deliver=event=>{const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(event.id+':reply');assert.ok(row);const mid='MID_'+event.id;store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,row.id);store.recordFirstBotReply({...row,mid},mid,config.bot,event.at);store.delivery(mid,event.line,'DELIVERED');store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({verifiedAt:event.at,mid,line:blue,state:'DELIVERED'}),'first-delivery:'+row.id);};
 const transport={verifyLine:async line=>assert.equal(line,blue),currentAttention:async()=>({complete:true,sources:store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(p,at)=>({complete:true,sources:store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(p,at)}),request:async(l,path,body)=>{assert.equal(l.phone,blue);const id=body.where.key.id,inbound=store.db.prepare('SELECT body FROM events WHERE id=?').get(id),outbound=store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);if(inbound){const e=store.open(inbound.body);return {messages:{records:[{key:{id,remoteJid:phone+'@s.whatsapp.net',fromMe:false},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}return {messages:{records:outbound?[{key:{id,remoteJid:phone+'@s.whatsapp.net',fromMe:true},message:{conversation:store.open(outbound.body)},status:'DELIVERY_ACK'}]:[]}};}};
 return {config,store,start,turn,deliver,transport};
}
const receipt=p=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actorId,createdById:actorId,phone:p.phone,persisted:true,orderId,caseId:p.caseId,acceptanceId:p.quote.acceptanceId,requestHash:registrationHash(p),state:'NUEVO',scheduled:false,paymentRecorded:false});
test('a fresh blue acceptance reuses its prior blue literal facts and price with native verification before one write',async()=>{
 const f=programFixture();try{
  const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Mi nombre es Juan Pérez. Mi dirección es Calle 50 # 42-18 apartamento 301. Cuánto cuesta?');f.deliver(first);f.config.operationalLineScope=scope(first.at+1);
  const acceptance=await f.turn('Perfecto');let writes=0,payload;f.transport.fetcher=async(url,opts)=>{writes++;payload=JSON.parse(opts.body);return {ok:true,json:async()=>receipt(payload)};};
  await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(payload.sources.customerName.id,first.id);assert.equal(payload.quote.acceptanceId,acceptance.id);assert.equal(payload.quote.scheduleHash,BUSINESS_PRICE_HASH);await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(writes,1);
 }finally{f.store.close();}
});
test('pre-cutoff pending registration is preserved as review with no business write or new questions',async()=>{
 const f=programFixture();try{
  const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Mi nombre es Juan Pérez. Mi dirección es Calle 50 # 42-18 apartamento 301. Cuánto cuesta?');f.deliver(first);const acceptance=await f.turn('Perfecto');f.config.operationalLineScope=scope(acceptance.at+1);const count=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
  let calls=0;f.transport.fetcher=async()=>{calls++;throw Error('must not write');};await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(calls,0);assert.equal(registrationStatus(f.config,f.store).review,1);assert.equal(registrationStatus(f.config,f.store).lastReviewReason,'OPERATIONAL_LINE_SCOPE_REVIEW');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,count);
 }finally{f.store.close();}
});
test('a red native field mixed into a fresh blue accepted request prevents writes even if the payload claims blue',async()=>{
 const f=programFixture();try{
  f.config.operationalLineScope=scope(f.start);const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Mi nombre es Juan Pérez. Mi dirección es Calle 50 # 42-18 apartamento 301. Cuánto cuesta?');f.deliver(first);await f.turn('Perfecto');f.store.db.prepare('UPDATE events SET line=? WHERE id=?').run(red,first.id);
  let calls=0;f.transport.fetcher=async()=>{calls++;throw Error('must not write');};await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(calls,0);assert.equal(registrationStatus(f.config,f.store).review,1);
 }finally{f.store.close();}
});
test('a duplicated native source attributed to both lines cannot authorize a new blue-only program write',async()=>{
 const f=programFixture();try{
  f.config.operationalLineScope=scope(f.start);const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Mi nombre es Juan Pérez. Mi dirección es Calle 50 # 42-18 apartamento 301. Cuánto cuesta?');f.deliver(first);await f.turn('Perfecto');f.store.db.prepare('INSERT INTO event_sources(event_id,line) VALUES(?,?)').run(first.id,red);
  let calls=0;f.transport.fetcher=async()=>{calls++;throw Error('must not write');};await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(calls,0);assert.equal(registrationStatus(f.config,f.store).review,1);
 }finally{f.store.close();}
});
test('a shared-line source observed during native verification is checked again before reserving a write',async()=>{
 const f=programFixture();try{
  f.config.operationalLineScope=scope(f.start);const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Mi nombre es Juan Pérez. Mi dirección es Calle 50 # 42-18 apartamento 301. Cuánto cuesta?');f.deliver(first);await f.turn('Perfecto');
  const original=f.transport.currentCustomerActivity;f.transport.currentCustomerActivity=async(...args)=>{const result=await original(...args);f.store.db.prepare('INSERT INTO event_sources(event_id,line) VALUES(?,?)').run(first.id,red);return result;};
  let calls=0;const count=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;f.transport.fetcher=async()=>{calls++;throw Error('must not write');};await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(calls,0);assert.equal(registrationStatus(f.config,f.store).lastReviewReason,'OPERATIONAL_LINE_SCOPE_REVIEW');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,count);
 }finally{f.store.close();}
});
test('an uncertain pre-cutoff business write is checked only by its old receipt and never sends a historical confirmation',async()=>{
 const f=programFixture();try{
  const first=await f.turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Mi nombre es Juan Pérez. Mi dirección es Calle 50 # 42-18 apartamento 301. Cuánto cuesta?');f.deliver(first);const acceptance=await f.turn('Perfecto');let payload,writes=0,reads=0;
  f.transport.fetcher=async(url,opts)=>{if(url.endsWith('/receipt')){reads++;return {ok:true,json:async()=>receipt(payload)};}writes++;payload=JSON.parse(opts.body);throw Error('connection lost after commit');};
  await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(registrationStatus(f.config,f.store).uncertain,1);f.config.operationalLineScope=scope(acceptance.at+1);const count=f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
  await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(writes,1);assert.equal(reads,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,count);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'program:%'").get().n,0);
 }finally{f.store.close();}
});
