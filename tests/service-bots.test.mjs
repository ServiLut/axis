import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { Store } from '../automation/service-bots/store.mjs';
import { Engine,customerDecision,parseUnderstanding } from '../automation/service-bots/engine.mjs';
import { BUSINESSES,configFromEnv,validateEvent,authorized,SANDRA,DIEGO,publicTextSafe } from '../automation/service-bots/config.mjs';
import { Transport,drain } from '../automation/service-bots/transport.mjs';
import { decodeWebhook } from '../automation/service-bots/webhook.mjs';
import { createBotServer } from '../automation/service-bots/server.mjs';
const config=(company='fumigacion')=>({company,...BUSINESSES[company],enabled:true,activatedAt:Date.now()-60000,lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company+'-'+i}))});
const event=(overrides={})=>({id:'MESSAGE001',phone:'573001112233',at:Date.now(),line:'573126944997',fromMe:false,kind:'text',text:'Hola',...overrides});
const fixture=(company='fumigacion')=>{const store=new Store(':memory:',company,randomBytes(32));return {store,config:config(company),engine:new Engine(store,config(company))};};

test('public replies exclude internal consultation and media work; necessary questions stay valid',()=>{
 for(const text of ['Voy a verificar con Diego o Sandra.','Estoy verificando la ruta con Diego.','Consultaré con Sandra.','Ya le pregunté al equipo.','Estoy transcribiendo el audio.','Voy a procesar tu archivo adjunto.','Transcribo tu mensaje de voz.'])assert.equal(publicTextSafe(text),false,text);
 for(const text of ['Gracias por tu audio. ¿En qué barrio necesitas el servicio?','Tu solicitud sigue pendiente de confirmación.','¿Qué falla presenta la nevera?','No pude escuchar bien tu audio. ¿Me escribes lo que necesitas?'])assert.equal(publicTextSafe(text),true,text);
});

test('last delivery gate blocks an old unsafe customer reply without contacting the provider',async()=>{
 const f=fixture();try{
  f.store.enqueue(event());await f.engine.process(event());f.store.db.prepare('DELETE FROM outbox').run();
  f.store.queue('unsafe-old','573001112233',f.config.lines[0].phone,'Estoy transcribiendo el audio.',false,f.store.conversation('573001112233').revision);
  let calls=0;const result=await drain(f.store,f.config,{verifyLine:async()=>{calls++;},send:async()=>{calls++;return 'MUST_NOT_SEND';}},f.engine);
  assert.equal(calls,0);assert.equal(result.uncertain,0);assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get('unsafe-old').state,'COMMUNICATION_REVIEW');assert.equal(f.store.conversation('573001112233').hold,1);
 }finally{f.store.close();}
});

test('transport validates external text while retaining exact internal recipients',async()=>{
 const c={...config(),provider:'https://own.example',lines:config().lines.map((l,i)=>({...l,apiKey:String(i).repeat(32)}))};let calls=0;
 const t=new Transport(c,async()=>{calls++;return {ok:true,json:async()=>({key:{id:'INTERNALMSG'}})};});
 await assert.rejects(()=>t.send({phone:'573001112233',line:c.lines[0].phone,internal:false},'Voy a verificar con Sandra.'),/EXTERNAL_TEXT_REJECTED/);assert.equal(calls,0);
 assert.equal(await t.send({phone:DIEGO,line:c.lines[0].phone,internal:true},'Diego, ¿cuánto dura el refuerzo de este servicio?'), 'INTERNALMSG');
 await assert.rejects(()=>t.send({phone:'573001112233',line:c.lines[0].phone,internal:true},'¿Cuánto dura?'),/INTERNAL_RECIPIENT_MISMATCH/);assert.equal(calls,1);
});

test('company config rejects other businesses and shared database paths',()=>{
  const lines=config().lines.map((l,i)=>({...l,apiKey:String(i).repeat(32)}));
  const env={BOT_COMPANY:'fumigacion',BOT_LINES_JSON:JSON.stringify(lines),BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'c'.repeat(64),BOT_DATA_KEY:'b'.repeat(64),BOT_DATABASE_PATH:'/data/fumigacion/bot.sqlite',BOT_EVOLUTION_URL:'https://own.example'};
  assert.equal(configFromEnv(env).bot,'María Ángel');
  for(const patch of [{BOT_COMPANY:'psicologos'},{BOT_DATABASE_PATH:'/data/servicio-tecnico/bot.sqlite'},{BOT_LINES_JSON:JSON.stringify(config('servicio-tecnico').lines)},{BOT_EVOLUTION_URL:'http://own.example'}])assert.throws(()=>configFromEnv({...env,...patch}));
  for(const patch of [{BOT_EVOLUTION_TOKEN:'shared-global-access'},
    {BOT_LINES_JSON:JSON.stringify(lines.map(l=>({...l,apiKey:lines[0].apiKey})))},
    {BOT_LINES_JSON:JSON.stringify(config().lines)}])assert.throws(()=>configFromEnv({...env,...patch}),/DEDICATED_INSTANCE_ACCESS_REQUIRED/);
});

test('provider requests select only the existing key of their own originating line',async()=>{
 const c={...config(),provider:'https://own.example',lines:config().lines.map((l,i)=>({...l,apiKey:String(i).repeat(32)})),providerToken:'must-never-be-used'};
 const calls=[];
 const t=new Transport(c,async(url,options)=>{calls.push({url,options});const line=c.lines.find(l=>url.includes(encodeURIComponent(l.instance)));return {ok:true,json:async()=>url.includes('/message/')?{key:{id:'OUTBOUND001'}}:[{name:line.instance,ownerJid:line.phone+'@s.whatsapp.net',connectionStatus:'open'}]};});
 for(const line of c.lines){await t.verifyLine(line.phone);await t.send({phone:'573001112233',line:line.phone,internal:false},'Hola');}
 assert.deepEqual(calls.map(call=>call.options.headers.apikey),[c.lines[0].apiKey,c.lines[0].apiKey,c.lines[1].apiKey,c.lines[1].apiKey]);
 assert.equal(calls.some(call=>call.options.headers.apikey===c.providerToken),false);
 const before=calls.length;
 await assert.rejects(()=>t.verifyLine('573016818845'),/LINE_OUTSIDE_COMPANY/);
 await assert.rejects(()=>t.request({...c.lines[0]},'/instance/fetchInstances'),/INSTANCE_ACCESS_REQUIRED/);
 assert.equal(calls.length,before);
 const bad=new Transport(c,async()=>({ok:true,json:async()=>[{name:c.lines[0].instance,ownerJid:'573152819233@s.whatsapp.net',connectionStatus:'open'}]}));
 await assert.rejects(()=>bad.verifyLine(c.lines[0].phone),/CHANNEL_OWNER_MISMATCH/);
});
test('authentication requires a dedicated token and constant-time matching',()=>{
  const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
  assert.equal(authorized('Bearer '+token,hash),true);assert.equal(authorized('Bearer '+randomBytes(32).toString('base64url'),hash),false);assert.equal(authorized('',hash),false);
});
test('events reject cross-company identity, groups, stale data and unknown sender',()=>{
  const c=config(),e={...event(),at:new Date().toISOString()};
  const body={instance:c.lines[0].instance,owner:c.lines[0].phone,event:e};
  assert.ok(validateEvent(body,c));
  for(const patch of [{owner:'573016818845'},{instance:'abogados'},{event:{...e,group:true}},{event:{...e,phone:'unknown'}},{event:{...e,at:new Date(Date.now()-1200000).toISOString()}}])assert.equal(validateEvent({...body,...patch},c),null);
});
test('ciphertext is authenticated and cannot be reused across companies',()=>{
  const key=randomBytes(32),a=new Store(':memory:','fumigacion',key),b=new Store(':memory:','servicio-tecnico',key);
  try{const text=a.seal({phone:'573001112233'});assert.equal(text.includes('573001112233'),false);assert.throws(()=>b.open(text));assert.throws(()=>a.open(text.slice(0,-4)+'xxxx'));}finally{a.close();b.close();}
});
test('duplicate message IDs and conflicting payloads never create another event',()=>{
  const f=fixture();try{const e=event();assert.equal(f.store.enqueue(e).duplicate,false);assert.equal(f.store.enqueue(e).duplicate,true);assert.throws(()=>f.store.enqueue({...e,text:'Otra cosa'}));assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM events').get().n,1);}finally{f.store.close();}
});
test('both lines share a case and a newer message suppresses a pending old reply',async()=>{
  const f=fixture();try{const first=event();f.store.enqueue(first);await f.engine.process(first);const second=event({id:'MESSAGE002',line:f.config.lines[1].phone,at:first.at+1,text:'Cucarachas'});f.store.enqueue(second);await f.engine.process(second);
    const sent=[];await drain(f.store,f.config,{verifyLine:async()=>{},send:async(o,t)=>{sent.push({o,t});return 'OUTBOUND001';},understand:async()=>({})},f.engine);
    assert.equal(sent.length,1);assert.equal(sent[0].o.line,f.config.lines[1].phone);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM conversations').get().n,1);
  }finally{f.store.close();}
});
test('staff takeover persists and suppresses automatic customer replies',async()=>{
  const f=fixture();try{const e=event();f.store.enqueue(e);await f.engine.process(e);const staff=event({id:'STAFFMESSAGE',fromMe:true,text:'Yo lo atiendo'});f.store.enqueue(staff);await f.engine.process(staff);assert.equal(f.store.conversation(e.phone).hold,1);
    const later=event({id:'MESSAGE003',text:'Cucarachas'});f.store.enqueue(later);await f.engine.process(later);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(later.id).state,'OBSERVED_HUMAN');assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'SUPPRESSED_HUMAN');
  }finally{f.store.close();}
});
test('only exact provider IDs mark an echo; matching staff text still takes over',async()=>{
  const f=fixture();try{const e=event();f.store.enqueue(e);f.store.queue('q',e.phone,e.line,'Mismo texto',false,1);f.store.db.prepare("UPDATE outbox SET mid='BOTMESSAGE1',state='ACCEPTED'").run();const own=event({id:'BOTMESSAGE1',fromMe:true,text:'Mismo texto'});f.store.enqueue(own);await f.engine.process(own);assert.equal(f.store.conversation(e.phone).hold,0);const staff=event({id:'STAFFMESSAGE',fromMe:true,text:'Mismo texto'});f.store.enqueue(staff);await f.engine.process(staff);assert.equal(f.store.conversation(e.phone).hold,1);}finally{f.store.close();}
});
test('natural thank you cannot release a human chat',async()=>{
  const f=fixture();try{const e=event({phone:SANDRA});f.store.enqueue(e);f.store.hold(SANDRA,'staff');const reply=event({id:'CHIEFMESSAGE',phone:SANDRA,text:'María Ángel, gracias'});f.store.enqueue(reply);await f.engine.process(reply);assert.equal(f.store.conversation(SANDRA).hold,1);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(reply.id).state,'CHIEF_COURTESY');}finally{f.store.close();}
});
test('explicit chief release targets only the specified case and needs direct address',async()=>{
  const f=fixture();try{const e=event();f.store.enqueue(e);f.store.hold(e.phone,'staff');const third=event({id:'THIRDPERSON',phone:SANDRA,text:'María Ángel puede retomar chat de '+e.phone});f.store.enqueue(third);await f.engine.process(third);assert.equal(f.store.conversation(e.phone).hold,1);const direct=event({id:'CHIEFRELEASE',phone:SANDRA,text:'María Ángel, retoma chat de '+e.phone});f.store.enqueue(direct);await f.engine.process(direct);assert.equal(f.store.conversation(e.phone).hold,0);}finally{f.store.close();}
});
test('quoted delivered answers are learned only for their exact company and case',async()=>{
  const f=fixture();try{const q=f.store.question({phone:'573001112233',line:f.config.lines[0].phone,caseId:'CASE001',topic:'horario',conditions:{date:'hoy'},recipient:DIEGO,text:'¿Qué horario?',source:'SOURCE001'});f.store.db.prepare("UPDATE outbox SET mid='QUESTIONMID',state='DELIVERED'").run();
    const other=event({id:'OTHERANSWER',phone:SANDRA,quotedId:'QUESTIONMID',text:'A las 3'});f.store.enqueue(other);await f.engine.process(other);assert.equal(f.store.db.prepare('SELECT state FROM questions WHERE id=?').get(q.id).state,'PENDING');
    const answer=event({id:'EXACTANSWER',phone:DIEGO,quotedId:'QUESTIONMID',text:'Hoy a las 3 con el técnico confirmado para este caso'});f.store.enqueue(answer);await f.engine.process(answer);assert.equal(f.store.db.prepare('SELECT state FROM questions WHERE id=?').get(q.id).state,'ANSWERED');assert.equal(f.store.question({phone:'573001112233',line:f.config.lines[0].phone,caseId:'CASE001',topic:'horario',conditions:{date:'hoy'},recipient:DIEGO,text:'¿Qué horario?',source:'SOURCE002'}).created,false);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
  }finally{f.store.close();}
});
test('unquoted yes and accepted-only delivery never create learned answers',async()=>{
  const f=fixture();try{f.store.question({phone:'573001112233',line:f.config.lines[0].phone,caseId:'CASE001',topic:'horario',conditions:{},recipient:DIEGO,text:'¿Horario?',source:'SOURCE001'});f.store.db.prepare("UPDATE outbox SET mid='QUESTIONMID',state='ACCEPTED'").run();for(const e of [event({id:'YESUNQUOTED',phone:DIEGO,text:'Sí'}),event({id:'YESACCEPTED',phone:DIEGO,quotedId:'QUESTIONMID',text:'Sí'})]){f.store.enqueue(e);await f.engine.process(e);}assert.equal(f.store.db.prepare('SELECT state FROM questions').get().state,'PENDING');}finally{f.store.close();}
});
test('pending questions are deduplicated; changed case or conditions remain separate',()=>{
  const f=fixture();try{const q={phone:'573001112233',line:f.config.lines[0].phone,caseId:'CASE001',topic:'horario',conditions:{date:'hoy'},recipient:DIEGO,text:'¿Horario?',source:'SOURCE001'};assert.equal(f.store.question(q).created,true);assert.equal(f.store.question(q).created,false);assert.equal(f.store.question({...q,caseId:'CASE002'}).created,true);assert.equal(f.store.question({...q,conditions:{date:'mañana'}}).created,true);}finally{f.store.close();}
});
test('historical examples keep their label and cannot cross the company boundary',()=>{
  const f=fixture();try{const k={company:'fumigacion',kind:'historical_observations',source:'file-sha256',at:new Date().toISOString(),entries:[{price:'historical only'}]};assert.equal(f.store.importKnowledge(k).kind,'historical_observations');assert.throws(()=>f.store.importKnowledge({...k,company:'servicio-tecnico'}));assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM knowledge').get().n,1);}finally{f.store.close();}
});
test('media, payment claims, guarantees and chemical exposure require review',()=>{
  const state={slots:{},asked:[]};for(const e of [event({kind:'image',text:''}),event({text:'Te envié el comprobante del pago'}),event({text:'Quiero la devolución'}),event({text:'Mi mascota estuvo expuesta al producto'})]){const r=customerDecision('fumigacion',state,e);assert.ok(r.review);assert.doesNotMatch(r.reply,/pago confirmado|cita confirmada|diagn[oó]stico/i);}
});
test('symptom collection does not diagnose; model spans cannot invent price or availability',()=>{
  assert.deepEqual(parseUnderstanding({slots:{service:'nevera',location:'Bello',preference:'hoy a las 3',price:'120000'}},'Es una nevera en Bello'),{service:'nevera',location:'Bello'});
  const r=customerDecision('servicio-tecnico',{slots:{service:'nevera'},asked:['detail']},event({text:'No enfría'}));assert.equal(r.state.slots.detail,'No enfría');assert.doesNotMatch(r.reply,/gas|compresor|garant/i);
});
test('a price question is never stored as a preferred time',()=>{
  const r=customerDecision('servicio-tecnico',{slots:{service:'nevera',detail:'no enfría',location:'Bello'},asked:['preference']},event({text:'¿Cuánto cuesta?'}));assert.ok(r.review);assert.equal(r.state.slots.preference,undefined);
});
test('ambiguous send stays uncertain and is never automatically retried',async()=>{
  const f=fixture();try{const e=event();f.store.enqueue(e);await f.engine.process(e);let calls=0;const transport={verifyLine:async()=>{},send:async()=>{calls++;throw new Error('timeout');},understand:async()=>({})};await drain(f.store,f.config,transport,f.engine);await drain(f.store,f.config,transport,f.engine);assert.equal(calls,1);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'UNCERTAIN');}finally{f.store.close();}
});
test('a staff event arriving during channel verification blocks sending',async()=>{
  const f=fixture();try{const e=event();f.store.enqueue(e);await f.engine.process(e);let calls=0;await drain(f.store,f.config,{verifyLine:async()=>f.store.enqueue(event({id:'STAFFARRIVAL',fromMe:true})),send:async()=>{calls++;return 'MID';},understand:async()=>({})},f.engine);assert.equal(calls,0);}finally{f.store.close();}
});
test('imported historical pending questions create no outbound messages and cannot be repeated',()=>{
  const f=fixture();try{const d={company:'fumigacion',source:'prior-ledger',entries:[{id:'old-question',caseId:'D99985A6',recipient:DIEGO,topic:'cierre',askedAt:'2026-10-01'}]};assert.equal(f.store.importPendingQuestions(d).outboundCreated,0);assert.equal(f.store.importPendingQuestions(d).imported,0);const q=f.store.question({phone:'573001112233',line:f.config.lines[0].phone,caseId:'D99985A6',topic:'cierre',conditions:{},recipient:DIEGO,text:'No repetir',source:'NEW001'});assert.equal(q.created,false);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.throws(()=>f.store.importPendingQuestions({...d,company:'servicio-tecnico'}));}finally{f.store.close();}
});
test('a call event remains observed and never implies an agreement or abandonment',()=>{
  const d=customerDecision('fumigacion',{slots:{},asked:[]},event({kind:'call',text:''}));assert.equal(d.observed,true);assert.equal(d.reply,undefined);assert.equal(d.question,undefined);
});
test('provider webhook rejects unresolved LIDs and groups and retains exact quote IDs',()=>{
  const c=config();const source={event:'messages.upsert',instance:c.lines[0].instance,data:{key:{id:'PROVIDERMSG',remoteJid:DIEGO+'@s.whatsapp.net',fromMe:false},messageTimestamp:Math.floor(Date.now()/1000),message:{extendedTextMessage:{text:'Hoy a las 3',contextInfo:{stanzaId:'EXACTQUOTE'}}}}};
  assert.equal(decodeWebhook(source,c).events[0].event.quotedId,'EXACTQUOTE');for(const jid of ['120363001@g.us','123456@lid'])assert.equal(decodeWebhook({...source,data:{...source.data,key:{...source.data.key,remoteJid:jid}}},c).events.length,0);assert.equal(decodeWebhook({...source,instance:'abogados'},c).events.length,0);
});
test('HTTP boundary separates webhook and administration credentials and verifies owner before ingestion',async()=>{
  const f=fixture();const control=randomBytes(32).toString('base64url'),webhook=randomBytes(32).toString('base64url');f.config.authHash=createHash('sha256').update(control).digest('hex');f.config.webhookHash=createHash('sha256').update(webhook).digest('hex');let verified=0;
  const server=createBotServer(f.config,f.store,{verifyLine:async()=>{verified++;},understand:async()=>({}),send:async()=>{throw new Error('Tests do not send');}},f.engine);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
  const post=(path,token,data={})=>fetch(url+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data)});
  try{assert.equal((await post('/status',control)).status,200);assert.equal((await post('/knowledge',webhook)).status,401);assert.equal((await post('/event',control)).status,401);assert.equal((await post('/supervision',webhook)).status,401);const c=f.config,e={...event(),at:new Date().toISOString()};const r=await post('/event',webhook,{instance:c.lines[0].instance,owner:c.lines[0].phone,event:e});assert.equal(r.status,202);assert.equal(verified,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM events').get().n,1);
    const view=await (await post('/supervision',control,{limit:1})).json();assert.equal(view.company,c.name);assert.equal(view.metadataOnly,true);assert.equal(view.events[0].id,e.id);assert.equal('body' in view.events[0],false);assert.equal('text' in view.events[0],false);assert.equal(view.remainingEvents,0);assert.equal(view.nextEventRow,1);assert.equal((await (await post('/supervision',control,{afterEventRow:1})).json()).events.length,0);assert.equal((await post('/supervision',control,{limit:101})).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));f.store.close();}
});
test('two messages with the same provider second use only the latest received context',async()=>{
  const f=fixture();try{const a=event(),b=event({id:'SAMESECOND2',at:a.at,text:'Cucarachas en apartamento de Bello'});f.store.enqueue(a);f.store.enqueue(b);await f.engine.process(a);await f.engine.process(b);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(a.id).state,'OBSERVED_SUPERSEDED');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);}finally{f.store.close();}
});
test('overlapping source lines preserve provenance without a second response',async()=>{
  const f=fixture();try{const e=event();f.store.enqueue(e);assert.equal(f.store.enqueue({...e,line:f.config.lines[1].phone}).duplicate,true);await f.engine.process(e);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM event_sources').get().n,2);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);}finally{f.store.close();}
});
test('even a delivered quoted yes stays pending when technical detail is missing',async()=>{
  const f=fixture();try{f.store.question({phone:'573001112233',line:f.config.lines[0].phone,caseId:'CASE001',topic:'horario-precio-tecnico',conditions:{},recipient:DIEGO,text:'¿Qué técnico, horario y cotización corresponden?',source:'SOURCE001'});f.store.db.prepare("UPDATE outbox SET mid='QUESTIONMID',state='DELIVERED'").run();const e=event({id:'QUOTEDYES01',phone:DIEGO,quotedId:'QUESTIONMID',text:'Sí'});f.store.enqueue(e);await f.engine.process(e);assert.equal(f.store.db.prepare('SELECT state FROM questions').get().state,'ANSWER_REVIEW');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);}finally{f.store.close();}
});
test('old pending replies expire without attempting delivery after connection recovery',async()=>{
  const f=fixture();try{const e=event();f.store.enqueue(e);await f.engine.process(e);f.store.db.prepare('UPDATE outbox SET created=?').run(Date.now()-700000);let calls=0;await drain(f.store,f.config,{verifyLine:async()=>{},send:async()=>{calls++;return 'MID';},understand:async()=>({})},f.engine);assert.equal(calls,0);assert.equal(f.store.db.prepare('SELECT state FROM outbox').get().state,'EXPIRED_REVIEW');}finally{f.store.close();}
});
