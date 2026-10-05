import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {Transport,drain} from '../automation/service-bots/transport.mjs';
import {BUSINESSES,SANDRA,DIEGO,HILARY,OPERATOR_ROUTING,questionRecipients,internalRecipients,publicTextSafe,validateEvent,configFromEnv} from '../automation/service-bots/config.mjs';
import {decodeWebhook} from '../automation/service-bots/webhook.mjs';
const setup=(company='fumigacion',route=OPERATOR_ROUTING)=>{
 const store=new Store(':memory:',company,randomBytes(32)),config={company,...BUSINESSES[company],operatorRouting:route,enabled:true,chiefOnly:true,activatedAt:Date.now()-60000,lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company+'-'+i,apiKey:String(i).repeat(32)}))};
 return {store,config,engine:new Engine(store,config)};
};
const ev=(f,patch={})=>({id:'ROUTE_EVENT_001',phone:'573001112233',at:Date.now(),line:f.config.lines[0].phone,kind:'text',fromMe:false,text:'Es casa en Bello, 3 habitaciones, patio; ratas',...patch});
const process=async(f,e)=>{f.store.enqueue(e);await f.engine.process(e);};
const question=(f,patch={})=>f.store.questionToRecipients({phone:'573001112233',line:f.config.lines[0].phone,caseId:'CASE_OP_001',topic:'cotizacion-verificada',conditions:{service:'ratas'},text:'Consulta de cotización de este caso.',source:'ROUTE_EVENT_001',recipients:questionRecipients(f.config,'cotizacion-verificada'),...patch});
const markDelivered=(f,recipient,mid)=>{const row=f.store.db.prepare('SELECT * FROM outbox WHERE internal=1 AND phone=?').get(recipient);f.store.db.prepare("UPDATE outbox SET state='DELIVERED',mid=? WHERE id=?").run(mid,row.id);return row;};

test('new operational questions have exact company roles; general safety/payment review and documents keep Sandra',()=>{
 const f=setup();const st=setup('servicio-tecnico');
 try{
  for(const topic of ['cotizacion-verificada','special-quotation','disponibilidad-y-tecnico','service-followup','existing-quotation','missing-intake:mattresses']){
   assert.deepEqual(questionRecipients(f.config,topic),[DIEGO,HILARY]);assert.deepEqual(questionRecipients(st.config,topic),[DIEGO]);
  }
  for(const topic of ['revision:safety','payment-instructions','common-question'])assert.deepEqual(questionRecipients(f.config,topic),[SANDRA]);
  assert.deepEqual(questionRecipients({...f.config,operatorRouting:'sandra'},'cotizacion-verificada'),[SANDRA]);
  assert.deepEqual(internalRecipients(st.config),[SANDRA,DIEGO]);
  assert.equal(publicTextSafe('Voy a consultar con Hilary.'),false);
 }finally{f.store.close();st.store.close();}
});
test('new question is one record with two stable deliveries; retry or changed details does not resend',()=>{
 const f=setup();try{
  const q=question(f);assert.equal(q.created,true);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
  assert.deepEqual(f.store.db.prepare('SELECT phone FROM outbox ORDER BY rowid').all().map(r=>r.phone),[DIEGO,HILARY]);
  assert.equal(question(f).created,false);
  assert.equal(question(f,{conditions:{service:'ratas',rooms:'3 habitaciones'}}).created,false);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,2);
 }finally{f.store.close();}
});
test('old pending questions stay at original recipient despite routing and new intake details',()=>{
 for(const topic of ['cotizacion-verificada','special-quotation','missing-intake:mattresses']){
  const f=setup();try{
   const old=f.store.question({phone:'573001112233',line:f.config.lines[0].phone,caseId:'CASE_OP_001',topic,conditions:{old:true},recipient:SANDRA,text:'Pregunta ya enviada.',source:'HISTORIC001'});
   const current=question(f,{topic,conditions:{new:true}});
   assert.equal(current.created,false);assert.equal(current.id,old.id);
   assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM question_routes').get().n,0);
   assert.deepEqual(f.store.db.prepare('SELECT phone FROM outbox').all().map(r=>r.phone),[SANDRA]);
  }finally{f.store.close();}
 }
});
test('actual engine creates one operational question to both FUM operators and only Diego for technical',async()=>{
 for(const company of ['fumigacion','servicio-tecnico']){
  const f=setup(company);try{
   await process(f,ev(f,{text:company==='fumigacion'?'Casa, ratas, Bello, 3 habitaciones':'La nevera no enfría en Bello'}));
   if(company==='servicio-tecnico'){
    await process(f,ev(f,{id:'ROUTE_EVENT_002',text:'No enfría'}));
    await process(f,ev(f,{id:'ROUTE_EVENT_003',text:'Mañana por la tarde'}));
   }
   const phones=f.store.db.prepare('SELECT DISTINCT phone FROM outbox WHERE internal=1 ORDER BY phone').all().map(r=>r.phone);
   assert.deepEqual(phones,company==='fumigacion'?[HILARY,DIEGO].sort():[DIEGO]);
  }finally{f.store.close();}
 }
});
test('Hilary answer uses exact delivered own line citation; records same case without client send or business write',async()=>{
 const f=setup();try{
  const q=question(f);markDelivered(f,HILARY,'HILARY_QUESTION_001');
  await process(f,ev(f,{id:'HILARY_RESPONSE_001',phone:HILARY,text:'Para este caso, la cotización es de $130.000.',quotedId:'HILARY_QUESTION_001'}));
  const saved=f.store.db.prepare('SELECT * FROM questions WHERE id=?').get(q.id);
  assert.equal(saved.state,'ANSWERED');assert.equal(saved.source_id,'HILARY_RESPONSE_001');assert.equal(saved.case_id,'CASE_OP_001');
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,0);
 }finally{f.store.close();}
});
test('wrong sender, wrong line, forwarded and undelivered quotes confer no case answer',async()=>{
 const variants=[{phone:SANDRA},{lineIndex:1},{forwarded:true},{undelivered:true}];
 for(const patch of variants){
  const f=setup();try{
   const q=question(f);const row=markDelivered(f,HILARY,'HILARY_QUESTION_002');
   if(patch.undelivered)f.store.db.prepare("UPDATE outbox SET state='ACCEPTED' WHERE id=?").run(row.id);
   await process(f,ev(f,{id:'INVALID_ANSWER_001',phone:patch.phone||HILARY,line:f.config.lines[patch.lineIndex||0].phone,forwarded:patch.forwarded||false,quotedId:'HILARY_QUESTION_002',text:'El precio de este caso sería $130.000.'}));
   assert.equal(f.store.db.prepare('SELECT state FROM questions WHERE id=?').get(q.id).state,'PENDING');
  }finally{f.store.close();}
 }
});
test('second operator response preserves first source and invalidates answer for human review',async()=>{
 const f=setup();try{
  const q=question(f);markDelivered(f,HILARY,'Q_HILARY_003');markDelivered(f,DIEGO,'Q_DIEGO_003');
  await process(f,ev(f,{id:'ANSWER_HILARY_003',phone:HILARY,quotedId:'Q_HILARY_003',text:'El técnico disponible para este caso es Juan a las 3.'}));
  await process(f,ev(f,{id:'ANSWER_DIEGO_003',phone:DIEGO,quotedId:'Q_DIEGO_003',text:'Para este caso es Pedro a las 4.'}));
  const row=f.store.db.prepare('SELECT * FROM questions WHERE id=?').get(q.id);
  assert.equal(row.state,'ANSWER_REVIEW');assert.equal(row.source_id,'ANSWER_HILARY_003');assert.match(f.store.open(row.answer),/Juan/);
  const audit=f.store.db.prepare("SELECT detail FROM audit WHERE action='CASE_ANSWER_ADDITIONAL_SOURCE_REVIEW'").get();
  assert.match(f.store.open(audit.detail).text,/Pedro/);
 }finally{f.store.close();}
});
test('Hilary has no technical authority and neither operator can release customer human hold',async()=>{
 const f=setup('servicio-tecnico');try{
  await process(f,ev(f,{id:'HILARY_ST_001',phone:HILARY,text:'Miguel Ángel, retoma el chat de 573001112233'}));
  assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get('HILARY_ST_001').state,'OBSERVED_INTERNAL_OUTSIDE_SCOPE');
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}
 const f2=setup();try{
  await process(f2,ev(f2));f2.store.hold('573001112233','STAFFSOURCE',true);
  for(const [i,phone] of [DIEGO,HILARY].entries())await process(f2,ev(f2,{id:'OPERATOR_RELEASE_'+i,phone,text:'María Ángel, retoma el chat de 573001112233'}));
  assert.equal(f2.store.conversation('573001112233').hold,1);
 }finally{f2.store.close();}
});
test('scoped Hilary internal webhook is retained under chief-only pause; exact alternate phone has no general authority',async()=>{
 const f=setup();try{
  f.config.enabled=false;
  const raw={instance:f.config.lines[0].instance,event:'messages.upsert',data:{key:{id:'HILARY_NATIVE_001',remoteJid:'123456@lid',remoteJidAlt:HILARY+'@s.whatsapp.net',fromMe:false},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'María Ángel, estás ahí?'}}};
  const decoded=decodeWebhook(raw,f.config);assert.equal(decoded.events.length,1);
  const valid=validateEvent(decoded.events[0],f.config);assert.equal(valid.phone,HILARY);
  f.store.enqueue(valid);const calls=[];
  await drain(f.store,f.config,{verifyLine:async()=>{},send:async(row)=>{calls.push(row.phone);return 'HILARY_PRESENCE_001';}},f.engine);
  assert.deepEqual(calls,[HILARY]);
  assert.equal(f.store.db.prepare("SELECT state FROM events WHERE id='HILARY_NATIVE_001'").get().state,'CHIEF_PRESENCE');
 }finally{f.store.close();}
});
test('transport sends scoped Hilary internally but rejects other company and mislabeled customer route',async()=>{
 const f=setup(),st=setup('servicio-tecnico');try{
  let sends=0;const fetcher=async()=>{sends++;return {ok:true,json:async()=>({key:{id:'OPERATOR_SEND001'}})};};
  const t=new Transport({...f.config,provider:'https://own.example'},fetcher);
  assert.equal(await t.send({phone:HILARY,line:f.config.lines[0].phone,internal:true},'Consulta concreta del caso.'),'OPERATOR_SEND001');
  await assert.rejects(()=>new Transport({...st.config,provider:'https://own.example'},fetcher).send({phone:HILARY,line:st.config.lines[0].phone,internal:true},'Consulta'),/INTERNAL_RECIPIENT_MISMATCH/);
  await assert.rejects(()=>t.send({phone:HILARY,line:f.config.lines[0].phone,internal:false},'Hola'),/INTERNAL_ROLE_REQUIRED/);
  assert.equal(sends,1);
 }finally{f.store.close();st.store.close();}
});
test('configuration requires exact opt-in routing value and remains Sandra by default',()=>{
 const f=setup();try{
  const env={BOT_COMPANY:'fumigacion',BOT_LINES_JSON:JSON.stringify(f.config.lines),BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'c'.repeat(64),BOT_DATA_KEY:'b'.repeat(64),BOT_DATABASE_PATH:'/data/fumigacion/bot.sqlite',BOT_EVOLUTION_URL:'https://own.example'};
  assert.equal(configFromEnv(env).operatorRouting,'sandra');
  assert.equal(configFromEnv({...env,BOT_OPERATIONAL_ROUTING:OPERATOR_ROUTING}).operatorRouting,OPERATOR_ROUTING);
  assert.throws(()=>configFromEnv({...env,BOT_OPERATIONAL_ROUTING:'all-operators'}),/OPERATOR_ROUTING_REQUIRED/);
 }finally{f.store.close();}
});
