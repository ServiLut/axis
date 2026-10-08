import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {drain} from '../automation/service-bots/transport.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {registrationHash,registrationStatus,drainProgramRegistrations,MARIA_PROGRAM_GUARD,MARIA_PROGRAM_PIPELINE_GUARD,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';

const ACTOR='7508385b-536e-4aa2-8137-d734dfc900ef',ORDER='85c47fc8-5314-4f68-a8d6-dde112640f5d';
function fixture(){
 const start=Math.floor((Date.now()-30000)/1000)*1000,store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,responseTargetMs:3000,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:ACTOR,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:start+86400000}};
 const engine=new Engine(store,config);let counter=0,writes=0,receipts=0,sends=0,latestPayload;
 const event=(text,patch={})=>({id:'DRAINORDER'+ ++counter,phone:'573001112233',at:start+counter*1000,line:config.lines[0].phone,fromMe:false,kind:'text',text,...patch});
 const turn=async text=>{const e=event(text);store.enqueue(e);await engine.process(e);return e;};
 const delivered=e=>{const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');assert.ok(row);const mid='MID'+e.id;store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,row.id);store.recordFirstBotReply({...row,mid},mid,config.bot,e.at);store.delivery(mid,e.line,'DELIVERED');store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({verifiedAt:e.at,mid,line:e.line,state:'DELIVERED'}),'first-delivery:'+row.id);};
 const receipt=p=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:ACTOR,createdById:ACTOR,phone:p.phone,persisted:true,orderId:ORDER,caseId:p.caseId,acceptanceId:p.quote.acceptanceId,requestHash:registrationHash(p),state:'NUEVO',scheduled:false,paymentRecorded:false});
 const transport={verifyLine:async()=>{},understand:async()=>{throw Error('registration pipeline must not call a model');},send:async()=> 'MOCKSEND'+ ++sends,currentAttention:async()=>({complete:true,sources:store.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(phone,at)=>({complete:true,sources:store.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(phone,at)}),request:async(line,path,body)=>{
  const id=body.where.key.id,source=store.db.prepare('SELECT body FROM events WHERE id=?').get(id),out=store.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
  if(source){const e=store.open(source.body);return {messages:{records:[{key:{id,remoteJid:e.phone+'@s.whatsapp.net',fromMe:e.fromMe},message:{conversation:e.text},messageTimestamp:e.at/1000}]}};}
  if(out)return {messages:{records:[{key:{id,remoteJid:out.phone+'@s.whatsapp.net',fromMe:true},message:{conversation:store.open(out.body)},status:'DELIVERY_ACK',messageTimestamp:start/1000}]}};
  return {messages:{records:[]}};
 },fetcher:async(url,options)=>{if(url.endsWith('/receipt')){receipts++;return {ok:true,json:async()=>receipt(latestPayload)};}writes++;latestPayload=JSON.parse(options.body);return {ok:true,json:async()=>receipt(latestPayload)};}};
 const ready=async()=>{const first=await turn('Tengo cucarachas en mi apartamento de 42 mts2 en Itagüí. Mi nombre es Juan Pérez. Mi dirección es Calle 50 # 42-18 apartamento 301. Cuánto cuesta?');delivered(first);const acceptance=await turn('Perfecto');const row=store.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").get();assert.ok(row,'the authorized source is prepared');assert.equal(store.open(row.value).status,'PENDING');return {first,acceptance};};
 return {store,config,engine,transport,event,turn,ready,stats:()=>({writes,receipts,sends,payload:latestPayload})};
}

test('real fast drain resolves a queued native courtesy before consuming a prepared registration',async()=>{const f=fixture();try{
 const {acceptance}=await f.ready(),thanks=f.event('Muchas gracias');f.store.enqueue(thanks);
 await drain(f.store,f.config,f.transport,f.engine);
 assert.equal(f.stats().writes,1,'a queued unprocessed courtesy must not permanently review the accepted case');assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(registrationStatus(f.config,f.store).review,0);assert.equal(f.stats().payload.quote.acceptanceId,acceptance.id);assert.equal(f.stats().payload.sources.acceptance.text,'Perfecto');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM audit WHERE action=?').get('OWN_SERVICE_REGISTRATION_REVIEW').n,0);
}finally{f.store.close();}});
test('the real fast drain can register a complete prepared case with no newer customer input',async()=>{const f=fixture();try{
 await f.ready();await drain(f.store,f.config,f.transport,f.engine);assert.equal(f.stats().writes,1);assert.equal(registrationStatus(f.config,f.store).saved,1);assert.equal(f.store.conversation('573001112233').state.programServiceId,ORDER);
}finally{f.store.close();}});
test('courtesy arriving during native attention or activity reads is deferred until Engine classifies it',async()=>{
 for(const phase of ['attention','activity-before-snapshot','activity-after-snapshot']){const f=fixture();try{
  const {acceptance}=await f.ready(),key=f.store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'maria-registration:%'").get(),original=f.store.open(key.value);
  let incoming,injected=false;const method=phase==='attention'?'currentAttention':'currentCustomerActivity',read=f.transport[method];
  f.transport[method]=async(...args)=>{
   if(injected)return read(...args);injected=true;
   const snapshot=phase==='activity-after-snapshot'?await read(...args):null;
   incoming=f.event('Muchas gracias');f.store.enqueue(incoming);
   return snapshot??read(...args);
  };
  const result=await drainProgramRegistrations(f.store,f.config,f.transport);
  assert.equal(result.deferred,1,phase);assert.equal(result.reviewed,0,phase);assert.equal(f.stats().writes,0,phase);
  assert.deepEqual(f.store.open(f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key.key).value),original,'no new acceptance or reservation during unresolved ingestion');
  assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(incoming.id).state,'PENDING');
  await drain(f.store,f.config,f.transport,f.engine);
  assert.equal(f.stats().writes,1,phase);assert.equal(registrationStatus(f.config,f.store).saved,1,phase);assert.equal(registrationStatus(f.config,f.store).review,0,phase);assert.equal(f.stats().payload.quote.acceptanceId,acceptance.id,phase);
 }finally{f.store.close();}}
});
test('a cancellation or payment arriving during native reads is classified before write and still blocks registration',async()=>{
 for(const text of ['No quiero el servicio','Gracias, ¿cómo pago?']){const f=fixture();try{
  await f.ready();let injected=false;const read=f.transport.currentCustomerActivity;
  f.transport.currentCustomerActivity=async(...args)=>{const snapshot=await read(...args);if(!injected){injected=true;f.store.enqueue(f.event(text));}return snapshot;};
  const initial=await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(initial.deferred,1);assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).prepared,1);
  await drain(f.store,f.config,f.transport,f.engine);assert.equal(f.stats().writes,0);assert.equal(registrationStatus(f.config,f.store).saved,0);assert.equal(registrationStatus(f.config,f.store).review,1);
 }finally{f.store.close();}}
});
test('unknown native activity and a human takeover during verification never authorize a business write',async()=>{
 for(const kind of ['unknown-customer','human']){const f=fixture();try{
  const {acceptance}=await f.ready();
  if(kind==='unknown-customer'){const read=f.transport.currentCustomerActivity;f.transport.currentCustomerActivity=async(...args)=>{const snapshot=await read(...args);return {...snapshot,sources:[...snapshot.sources,{id:'NOT_INGESTED',line:f.config.lines[0].phone,at:acceptance.at+1000}]};};}
  else{const read=f.transport.currentAttention;f.transport.currentAttention=async(...args)=>{const snapshot=await read(...args);return {...snapshot,sources:[...snapshot.sources,{id:'UNKNOWN_NATIVE_STAFF',line:f.config.lines[0].phone}]};};}
  const result=await drainProgramRegistrations(f.store,f.config,f.transport);assert.equal(result.deferred,0,kind);assert.equal(result.reviewed,1,kind);assert.equal(f.stats().writes,0,kind);assert.equal(registrationStatus(f.config,f.store).review,1,kind);
  if(kind==='human')assert.equal(f.store.conversation('573001112233').hold,1);
 }finally{f.store.close();}}
});
test('deferred pending input cannot grant payment, changed address, cancellation, other line or staff authority to write',async()=>{
 for(const kind of ['payment','correction','cancel','other-line','staff']){const f=fixture();try{
  await f.ready();const text=kind==='payment'?'Gracias, ¿cómo pago?':kind==='correction'?'La dirección es Calle 99 # 10-10':kind==='cancel'?'No quiero el servicio':'Muchas gracias';
  f.store.enqueue(f.event(text,{...(kind==='other-line'?{line:f.config.lines[1].phone}:{}),...(kind==='staff'?{fromMe:true}: {})}));
  await drain(f.store,f.config,f.transport,f.engine);assert.equal(f.stats().writes,0,kind);assert.equal(registrationStatus(f.config,f.store).saved,0,kind);assert.equal(registrationStatus(f.config,f.store).review,1,kind);
  if(kind==='staff')assert.equal(f.store.conversation('573001112233').hold,1);
 }finally{f.store.close();}}
});
test('registration status exposes prepared states and only safe aggregated review reasons',async()=>{const f=fixture();try{
 await f.ready();let status=registrationStatus(f.config,f.store);assert.equal(status.guard,MARIA_PROGRAM_GUARD);assert.equal(status.pipelineGuard,MARIA_PROGRAM_PIPELINE_GUARD);assert.equal(status.prepared,1);assert.equal(status.states.PENDING,1);assert.equal(status.states.SENDING,0);assert.equal(status.lastReviewReason,null);
 const key=f.store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'maria-registration:%'").get(),entry=f.store.open(key.value);f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal({...entry,status:'REVIEW',reason:'CASE_CHANGED_BEFORE_WRITE',reviewAt:Date.now()}),key.key);
 status=registrationStatus(f.config,f.store);assert.equal(status.prepared,0);assert.equal(status.review,1);assert.equal(status.lastReviewReason,'CASE_CHANGED_BEFORE_WRITE');assert.deepEqual(status.reviewReasons,[{reason:'CASE_CHANGED_BEFORE_WRITE',count:1}]);assert.doesNotMatch(JSON.stringify(status),/573001112233|Juan Pérez|Calle 50|DRAINORDER/);
 f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal({...entry,status:'REVIEW',reason:'PRIVATE_CUSTOMER_573001112233',reviewAt:Date.now()}),key.key);assert.equal(registrationStatus(f.config,f.store).lastReviewReason,'OTHER_REVIEW');
}finally{f.store.close();}});
