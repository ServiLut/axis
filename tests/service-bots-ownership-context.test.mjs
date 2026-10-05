import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { mkdtempSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../automation/service-bots/store.mjs';
import { Engine, extractSlots } from '../automation/service-bots/engine.mjs';
import { drain } from '../automation/service-bots/transport.mjs';
import { decodeWebhook } from '../automation/service-bots/webhook.mjs';
import { BUSINESSES, SANDRA } from '../automation/service-bots/config.mjs';
import { createBotServer } from '../automation/service-bots/server.mjs';

function fixture(company='fumigacion',path=':memory:',key=randomBytes(32)) {
  const c={company,...BUSINESSES[company],enabled:true,chiefOnly:true,historyCheckRequired:true,activatedAt:Date.now()-10000,
    lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company+'-'+i,apiKey:'fake-own-'+i}))};
  const s=new Store(path,company,key),engine=new Engine(s,c);
  let sent=0;
  const transport={priorHistory:async()=>({cutoff:c.activatedAt,priorOutgoing:false,checks:[]}),verifyLine:async()=>{},
    understand:async()=>({}),send:async()=> 'BOTMID'+(++sent)};
  const event=patch=>({id:'CLIENT01',phone:'573001112233',line:c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',text:'Hola',...patch});
  const process=async patch=>{const e=event(patch);s.enqueue(e);await drain(s,c,transport,engine);return e;};
  return {c,s,engine,transport,event,process};
}

test('first reply needs exact delivery; reading does not take ownership or hold the chat',async()=>{
  for(const company of Object.keys(BUSINESSES)){
    const f=fixture(company);
    try {
      const message=await f.process(),caseId=f.s.conversation(message.phone).state.caseId;
      assert.equal(f.s.caseAuthorship(caseId).state,'DELIVERY_PENDING');
      assert.equal(f.s.delivery('BOTMID1',f.c.lines[1].phone,'READ'),0);
      assert.equal(f.s.caseAuthorship(caseId).state,'DELIVERY_PENDING');
      assert.equal(f.s.delivery('BOTMID1',message.line,'DELIVERED'),1);
      const before=f.s.caseAuthorship(caseId);
      assert.equal(before.state,'BOT_FIRST_REPLY_VERIFIED');
      assert.equal(before.priorReadByStaff,'UNVERIFIED');
      assert.equal(before.creatorCreditWritten,false);
      const update=decodeWebhook({instance:f.c.lines[0].instance,event:'messages.update',data:{keyId:message.id,status:'READ'}},f.c);
      for(const d of update.deliveries)f.s.delivery(d.mid,message.line,d.state);
      assert.equal(f.s.conversation(message.phone).hold,0);
      assert.deepEqual(f.s.caseAuthorship(caseId),before);
      f.s.delivery('BOTMID1',message.line,'READ');
      f.s.delivery('BOTMID1',message.line,'DELIVERED');
      assert.equal(f.s.db.prepare('SELECT state FROM outbox WHERE mid=?').get('BOTMID1').state,'READ');
      assert.equal(f.s.caseAuthorship(caseId).firstProviderMessageId,'BOTMID1');
    } finally {f.s.close();}
  }
});

test('a later staff message preserves first-bot authorship while preventing simultaneous replies',async()=>{
  const f=fixture();
  try {
    const first=await f.process(),caseId=f.s.conversation(first.phone).state.caseId;
    f.s.delivery('BOTMID1',first.line,'READ');
    const before=f.s.caseAuthorship(caseId);
    await f.process({id:'STAFF02',line:f.c.lines[1].phone,fromMe:true,at:Date.now()+1,text:'Te atiendo personalmente.'});
    assert.equal(f.s.conversation(first.phone).hold,1);
    const count=f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
    await f.process({id:'CLIENT03',at:Date.now()+2,text:'¿Y el servicio?'});
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,count);
    assert.deepEqual(f.s.caseAuthorship(caseId),before);
    assert.equal(f.s.caseAuthorship(caseId).serviceCompleted,false);
  } finally {f.s.close();}
});

test('a response after earlier staff attention cannot claim first response or creator credit',async()=>{
  const f=fixture();
  try {
    const staff=f.event({id:'HUMANFIRST',fromMe:true,text:'Hola, te atiendo.'});f.s.enqueue(staff);await f.engine.process(staff);
    f.s.hold(staff.phone,'EXPLICIT_CHIEF_RELEASE',false);
    await f.process({id:'CLIENTAFTER',at:staff.at+1,text:'cucarachas'});
    const caseId=f.s.conversation(staff.phone).state.caseId;
    f.s.delivery('BOTMID1',staff.line,'READ');
    const attribution=f.s.caseAuthorship(caseId);
    assert.equal(attribution.state,'FIRST_REPLY_REVIEW');
    assert.equal(attribution.firstReplyEligible,false);
    assert.equal(attribution.priorStaffSource,'HUMANFIRST');
    assert.equal(attribution.creatorCreditWritten,false);
  } finally {f.s.close();}
});

test('uncertain sends do not create an authorship claim or get retried',async()=>{
  const f=fixture();
  try {
    let attempts=0;f.transport.send=async()=>{attempts++;throw Error('uncertain');};
    const first=await f.process(),caseId=f.s.conversation(first.phone).state.caseId;
    assert.equal(f.s.caseAuthorship(caseId),null);
    await drain(f.s,f.c,f.transport,f.engine);
    assert.equal(attempts,1);
    assert.equal(f.s.db.prepare('SELECT state FROM outbox').get().state,'UNCERTAIN');
  } finally {f.s.close();}
});

test('ownership survives restart encrypted and cannot be read with another company',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'service-owner-')),path=join(directory,'own.sqlite'),key=randomBytes(32);
  const f=fixture('fumigacion',path,key);
  let reopened;
  try {
    const first=await f.process(),caseId=f.s.conversation(first.phone).state.caseId;
    f.s.delivery('BOTMID1',first.line,'READ');const before=f.s.caseAuthorship(caseId);f.s.close();
    reopened=new Store(path,'fumigacion',key);
    assert.deepEqual(reopened.caseAuthorship(caseId),before);
    assert.ok(!reopened.db.prepare('SELECT body FROM case_authorship').get().body.includes('María'));
    const other=new Store(':memory:','servicio-tecnico',key);
    try {assert.throws(()=>other.open(reopened.db.prepare('SELECT body FROM case_authorship').get().body),/ENCRYPTED_SCOPE_MISMATCH/);}finally{other.close();}
    reopened.close();reopened=null;
  } finally {
    if(reopened)reopened.close();
    // Delete only this fixture's exact files; never recurse through the temp directory.
    for(const suffix of ['','-wal','-shm'])if(existsSync(path+suffix))unlinkSync(path+suffix);
    rmdirSync(directory);
  }
});

test('context includes prior customer/bot turns once, excludes other contacts and declares coverage',async()=>{
  const f=fixture();
  try {
    const first=await f.process();f.s.delivery('BOTMID1',first.line,'READ');
    const echo=f.event({id:'BOTMID1',fromMe:true,text:f.s.open(f.s.db.prepare('SELECT body FROM outbox').get().body)});f.s.enqueue(echo);await f.engine.process(echo);
    f.s.enqueue(f.event({id:'UNRELATED',phone:'573009998877',text:'Dato de otro contacto'}));
    const current=f.event({id:'QUESTION02',at:Date.now()+1,text:'¿Qué fue lo que me dijiste?'});f.s.enqueue(current);
    f.s.enqueue(f.event({id:'FUTURE',at:current.at+1,text:'Mensaje posterior'}));
    const history=f.s.conversationContext(current.phone,current.at,20,current.id);
    assert.equal(history.turns.filter(t=>t.role==='bot').length,1);
    assert.ok(history.turns.some(t=>t.sourceId===first.id));
    assert.ok(history.turns.some(t=>t.sourceId===current.id));
    assert.ok(history.turns.every(t=>!['UNRELATED','FUTURE','BOTMID1'].includes(t.sourceId)));
    assert.equal(history.fullWhatsAppHistoryRead,false);
    assert.equal(history.mediaOriginalsIncluded,false);
    assert.equal(history.referencesAreUntrusted,true);
    assert.equal(f.s.conversationContext(current.phone,current.at,1,current.id).completeStoredHistory,false);
    assert.throws(()=>f.s.conversationContext('573009998877',current.at,20,current.id),/CONTEXT_SOURCE_SCOPE_REQUIRED/);
  } finally {f.s.close();}
});

test('a question about prior information is reviewed rather than replaced with another intake question',async()=>{
  const f=fixture();
  try {
    const first=await f.process();const asked=[...f.s.conversation(first.phone).state.asked];
    await f.process({id:'FOLLOWUP',at:Date.now()+1,text:'¿Qué fue lo que me dijiste antes?'});
    assert.deepEqual(f.s.conversation(first.phone).state.asked,asked);
    assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get('FOLLOWUP').state,'REVIEW');
    const question=f.s.db.prepare('SELECT body FROM questions WHERE recipient=?').get(SANDRA);
    assert.match(f.s.open(question.body).text,/Qué fue lo que me dijiste antes/);
    assert.match(f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get('FOLLOWUP:reply').body),/lo que ya conversamos/);
  } finally {f.s.close();}
});

test('an explicit new service has a separate case, retains first-case authorship, and excludes old case answers',async()=>{
  const f=fixture();
  try {
    const first=await f.process(),oldCase=f.s.conversation(first.phone).state.caseId;
    f.s.delivery('BOTMID1',first.line,'READ');const oldOwner=f.s.caseAuthorship(oldCase);
    f.s.saveConversation(first.phone,{...f.s.conversation(first.phone).state,slots:{service:'cucarachas',site:'casa',location:'bello'}});
    const question=f.s.question({phone:first.phone,line:first.line,caseId:oldCase,topic:'old-rate',conditions:{case:oldCase},recipient:SANDRA,text:'Pregunta aislada',source:first.id});
    f.s.db.prepare("UPDATE questions SET state='ANSWERED',answer=?,valid_until=? WHERE id=?").run(f.s.seal('Respuesta solo del caso anterior'),Date.now()+600000,question.id);
    let context;f.transport.understand=async(e,c)=>{context=c;return {};};
    await f.process({id:'NEWCASE',at:Date.now()+1,text:'Necesito otro servicio para hormigas'});
    assert.notEqual(f.s.conversation(first.phone).state.caseId,oldCase);
    assert.equal(f.s.conversation(first.phone).state.slots.service,'hormigas');
    assert.equal(f.s.conversation(first.phone).state.slots.site,undefined);
    assert.equal(context.requestedNewCase,true);assert.deepEqual(context.caseAnswers,[]);assert.deepEqual(context.slots,{});
    assert.deepEqual(f.s.caseAuthorship(oldCase),oldOwner);
  } finally {f.s.close();}
});

test('opening/read synchronization without a written message never becomes staff takeover',()=>{
  const f=fixture();
  try {
    for(const message of [undefined,{}, {protocolMessage:{type:'HISTORY_SYNC_NOTIFICATION'}}]){
      const result=decodeWebhook({instance:f.c.lines[0].instance,event:'messages.upsert',data:{key:{id:'VIEWONLY',remoteJid:'573001112233@s.whatsapp.net',fromMe:true},messageTimestamp:Math.floor(Date.now()/1000),message,status:'READ'}},f.c);
      assert.deepEqual(result.events,[]);
    }
  }finally{f.s.close();}
});

test('a repeated contextual question creates one internal request and reserves sensitive excerpts',async()=>{
  const f=fixture();
  try {
    await f.process();
    const text='¿Qué quedó con lo anterior? Mi clave es privada123';
    await f.process({id:'QUESTIONONE',at:Date.now()+1,text});
    await f.process({id:'QUESTIONTWO',at:Date.now()+2,text});
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    const question=f.s.open(f.s.db.prepare('SELECT body FROM questions').get().body);
    assert.ok(!question.text.includes('privada123'));
    assert.match(question.text,/dato reservado/);
    assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'question:%'").get().n,1);
  }finally{f.s.close();}
});

test('a delayed earlier staff source requires authorship review without erasing the original bot evidence',async()=>{
  const f=fixture();
  try {
    const first=await f.process(),caseId=f.s.conversation(first.phone).state.caseId;
    f.s.delivery('BOTMID1',first.line,'READ');const before=f.s.caseAuthorship(caseId);
    const staff=f.event({id:'EARLIER_STAFF_LATE',fromMe:true,at:before.sentAt-2000,text:'Ya te estaba atendiendo.'});
    f.s.enqueue(staff);await f.engine.process(staff);
    const after=f.s.caseAuthorship(caseId);
    assert.equal(after.state,'FIRST_REPLY_REVIEW');
    assert.equal(after.firstReplyEligible,false);
    assert.equal(after.priorStaffSource,staff.id);
    assert.equal(after.firstProviderMessageId,before.firstProviderMessageId);
    assert.equal(after.attentionOrderingReview,'EARLIER_STAFF_SOURCE_RECEIVED_LATE');
    assert.equal(after.creatorCreditWritten,false);
  }finally{f.s.close();}
});

test('different replies about the same missing field create one precise question and one review acknowledgement',async()=>{
  const f=fixture();
  try {
    await f.process({text:'Necesito fumigar cucarachas en Sabaneta'});
    await f.process({id:'MISSINGONE',at:Date.now()+1,text:'Necesito el servicio'});
    await f.process({id:'MISSINGTWO',at:Date.now()+2,text:'Para mañana'});
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    const question=f.s.open(f.s.db.prepare('SELECT body FROM questions').get().body);
    assert.match(question.text,/tipo de inmueble/);
    assert.match(question.text,/cucarachas/);
    assert.match(question.text,/sabaneta/);
    assert.ok(!question.text.includes('Falta site'));
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get('MISSINGTWO:reply').n,0);
  }finally{f.s.close();}
});

test('an already delivered legacy clarification is reused without a third question or another customer acknowledgement',async()=>{
  const f=fixture();
  try {
    const first=await f.process({text:'cucarachas en sabaneta'}),caseId=f.s.conversation(first.phone).state.caseId;
    const old=f.s.question({phone:first.phone,line:first.line,caseId,topic:'revision:OLDREQUEST',conditions:{event:'OLDREQUEST',caseId},recipient:SANDRA,source:'OLDREQUEST',text:'FUMIGACION: contacto terminado en 2233. Falta site. La pregunta ya se hizo; la nueva respuesta no permitió verificar ese dato.'});
    f.s.db.prepare("UPDATE outbox SET state='DELIVERED',mid='OLDQUESTIONMID' WHERE id=?").run('question:'+old.id);
    await f.process({id:'AFTERLEGACY',at:Date.now()+1,text:'Lo necesito pronto'});
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get('AFTERLEGACY:reply').n,0);
    assert.equal(f.s.db.prepare('SELECT state FROM outbox WHERE mid=?').get('OLDQUESTIONMID').state,'DELIVERED');
  }finally{f.s.close();}
});

test('continuation after an upgrade preserves the actual older reply instead of claiming the new reply was first',async()=>{
  const f=fixture();
  try {
    const first=f.event();f.s.enqueue(first);
    f.s.saveConversation(first.phone,{slots:{service:'cucarachas'},asked:['site'],caseId:f.c.company+':'+first.id});
    f.s.queue(first.id+':reply',first.phone,first.line,'¿En qué tipo de inmueble?',false,1);
    f.s.db.prepare("UPDATE outbox SET state='READ',mid='LEGACYBOTMID' WHERE id=?").run(first.id+':reply');
    f.s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(first.id);
    await f.process({id:'CONTINUE02',at:Date.now()+1,text:'casa'});
    const owner=f.s.caseAuthorship(f.c.company+':'+first.id);
    assert.equal(owner.firstProviderMessageId,'LEGACYBOTMID');
    assert.equal(owner.firstOutboxId,first.id+':reply');
    assert.equal(owner.state,'FIRST_REPLY_REVIEW');
    assert.equal(owner.firstReplyEligible,false);
    assert.equal(owner.sentAt,null);
    assert.equal(owner.creatorCreditWritten,false);
  }finally{f.s.close();}
});

test('supervisor reads only explicit own sources, uses administrative authentication, and changes no stored state',async()=>{
  const f=fixture(),token='a'.repeat(43),webhookToken='b'.repeat(43);
  f.c.authHash=createHash('sha256').update(token).digest('hex');f.c.webhookHash=createHash('sha256').update(webhookToken).digest('hex');
  const server=createBotServer(f.c,f.s,f.transport,f.engine);
  try {
    const first=await f.process({text:'cucarachas en sabaneta'});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/review-events';
    const call=async(body,auth=token)=>fetch(url,{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const before={events:f.s.db.prepare('SELECT id,state FROM events').all(),outbox:f.s.db.prepare('SELECT id,state FROM outbox').all(),audit:f.s.db.prepare('SELECT COUNT(*) n FROM audit').get().n};
    assert.equal((await call({company:f.c.company,eventIds:[first.id]},webhookToken)).status,401);
    assert.equal((await call({company:'servicio-tecnico',eventIds:[first.id]})).status,400);
    assert.equal((await call({company:f.c.company,eventIds:Array(51).fill(first.id)})).status,400);
    const result=await(await call({company:f.c.company,eventIds:[first.id,'UNKNOWN001']})).json();
    assert.equal(result.readOnly,true);assert.equal(result.fullWhatsAppHistoryRead,false);assert.equal(result.originalMediaRead,false);
    assert.equal(result.results[0].event.text,'cucarachas en sabaneta');
    assert.equal(result.results[0].response.id,first.id+':reply');
    assert.deepEqual(result.results[1],{id:'UNKNOWN001',found:false});
    assert.deepEqual({events:f.s.db.prepare('SELECT id,state FROM events').all(),outbox:f.s.db.prepare('SELECT id,state FROM outbox').all(),audit:f.s.db.prepare('SELECT COUNT(*) n FROM audit').get().n},before);
  }finally{await new Promise(resolve=>server.close(resolve));f.s.close();}
});

test('a concrete customer question is preserved and an interrogative alternative is not saved as an answer',async()=>{
  const f=fixture();
  try {
    await f.process();
    const before=f.s.conversation('573001112233').state;
    await f.process({id:'PRICEQUERY',at:Date.now()+1,text:'¿Cuánto cuesta para casa o apartamento?'});
    const after=f.s.conversation('573001112233').state;
    assert.deepEqual(after.asked,before.asked);assert.deepEqual(after.slots,before.slots);
    assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get('PRICEQUERY').state,'REVIEW');
    const question=f.s.open(f.s.db.prepare('SELECT body FROM questions').get().body);
    assert.match(question.text,/Cuánto cuesta para casa o apartamento/);
    assert.match(question.text,/Qué respuesta verificada/);
    const response=f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get('PRICEQUERY:reply').body);
    assert.ok(!response.includes('Qué plaga'));assert.ok(!response.includes('tipo de inmueble'));
  }finally{f.s.close();}
});

test('a rapid multipart reply keeps an earlier house answer when the municipality arrives next',async()=>{
  const f=fixture();
  try {
    await f.process({text:'cucarachas'});
    const house=f.event({id:'HOUSEFIRST',at:Date.now()+1,text:'Casa 2 niveles'}),city=f.event({id:'CITYAFTER',at:house.at+1000,text:'Sabaneta'});
    f.s.enqueue(house);f.s.enqueue(city);await drain(f.s,f.c,f.transport,f.engine);
    const current=f.s.conversation(house.phone).state;
    assert.equal(current.slots.site,'casa');assert.equal(current.slots.location,'sabaneta');
    assert.equal(current.intakeSources.site.sourceId,'HOUSEFIRST');
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get('HOUSEFIRST:reply').n,0);
    assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get('CITYAFTER:reply').body),'¿Cuántas habitaciones o metros cuadrados tiene el lugar?');
  }finally{f.s.close();}
});

test('batch context does not mix another contact, a future reply, a quoted question, or an earlier case',async()=>{
  const f=fixture();
  try {
    await f.process({text:'cucarachas en casa en bello'});
    await f.process({id:'NEWBATCHCASE',at:Date.now()+1,text:'Necesito otro servicio para hormigas'});
    const first=f.event({id:'SITEQUESTION',at:Date.now()+2,text:'¿Es para una casa?'}),city=f.event({id:'BATCHCITY',at:first.at+1000,text:'Sabaneta'});
    f.s.enqueue(first);f.s.enqueue(f.event({id:'OTHERCONTACT',phone:'573009998877',at:first.at,text:'Casa'}));f.s.enqueue(city);
    await f.engine.process(first);await f.engine.process(city);
    const current=f.s.conversation(city.phone).state;
    assert.equal(current.slots.service,'hormigas');assert.equal(current.slots.site,undefined);assert.equal(current.slots.location,'sabaneta');
    assert.equal(current.intakeSources.site,undefined);
    f.s.enqueue(f.event({id:'FUTUREHOUSE',at:city.at+1,text:'Casa'}));
    assert.ok(f.s.customerTurnBatch(city.phone,city.id,'NEWBATCHCASE').every(e=>e.id!=='FUTUREHOUSE'&&e.id!=='OTHERCONTACT'));
  }finally{f.s.close();}
});

test('a compound greeting introduces the actual bot once and a named-person request is not turned into pest intake',async()=>{
  for(const text of ['Hola buenos días!','Hola, requiero una cotización para mi inmueble.','Hola con daniela']){
    const f=fixture();
    try {
      const first=await f.process({text});
      const reply=f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(first.id+':reply').body);
      assert.match(reply,/Hola, soy María Ángel/);
      if(text==='Hola con daniela'){assert.ok(!reply.includes('Qué plaga'));assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(first.id).state,'REVIEW');}
      await f.process({id:'HELLOAGAIN',at:Date.now()+1,text:'Hola'});
      const next=f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get('HELLOAGAIN:reply');
      if(next)assert.ok(!f.s.open(next.body).includes('soy María Ángel'));
    }finally{f.s.close();}
  }
});

test('a price question followed by location data retains both and creates one clarification for size already asked',async()=>{
  const f=fixture();
  try {
    await f.process({text:'cucarachas en casa'});
    const question=f.event({id:'BATCHPRICEQ',at:Date.now()+1,text:'¿Cuánto cuesta?'}),city=f.event({id:'AFTERPRICE',at:question.at+1000,text:'Sabaneta'});
    f.s.enqueue(question);f.s.enqueue(city);await drain(f.s,f.c,f.transport,f.engine);
    const q=f.s.db.prepare('SELECT * FROM questions').get(),review=f.s.open(q.body);
    assert.equal(q.topic,'missing-intake:size');assert.equal(review.source,question.id);
    assert.match(review.text,/Pregunta pendiente: ¿Cuánto cuesta/);assert.match(review.text,/Mensaje actual: Sabaneta/);
    assert.equal(f.s.conversation(city.phone).state.slots.location,'sabaneta');
    const response=f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(city.id+':reply').body);
    assert.doesNotMatch(response,/habitaciones o metros cuadrados|inmueble|municipio|día y franja/);
  }finally{f.s.close();}
});

test('a native outgoing message missing from the webhook blocks sending but does not erase first bot evidence',async()=>{
  const f=fixture();
  try {
    const first=await f.process();f.s.delivery('BOTMID1',first.line,'READ');
    const before=f.s.caseAuthorship(f.s.conversation(first.phone).state.caseId);
    f.transport.currentAttention=async()=>({complete:true,sources:[{id:'NATIVESTAFF',line:first.line,at:Date.now()}]});
    await f.process({id:'NEXTATTENTION',at:Date.now()+1,text:'cucarachas'});
    assert.equal(f.s.conversation(first.phone).hold,1);
    assert.equal(f.s.db.prepare('SELECT state FROM outbox WHERE id=?').get('NEXTATTENTION:reply').state,'SUPPRESSED_HUMAN');
    assert.deepEqual(f.s.caseAuthorship(before.caseId),before);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE mid IS NOT NULL').get().n,1);
  }finally{f.s.close();}
});

test('an unavailable native attention check stops before any send and does not retry an old response',async()=>{
  const f=fixture();
  try {
    let sent=0;f.transport.send=async()=>{sent++;return 'NEVER';};f.transport.currentAttention=async()=>{throw Error('partial');};
    const first=await f.process();await drain(f.s,f.c,f.transport,f.engine);
    assert.equal(sent,0);assert.equal(f.s.db.prepare('SELECT state FROM outbox WHERE id=?').get(first.id+':reply').state,'ATTENTION_REVIEW');
    assert.equal(f.s.caseAuthorship(f.c.company+':'+first.id),null);
  }finally{f.s.close();}
});

test('a provider phone alternative resolves customer and staff identity without granting internal authority',()=>{
  const f=fixture();
  try {
    for(const fromMe of [false,true]){
      const result=decodeWebhook({instance:f.c.lines[0].instance,event:'messages.upsert',data:{key:{id:'ALTSOURCE01',remoteJid:'987654321@lid',remoteJidAlt:'573001112233@s.whatsapp.net',fromMe},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'Hola'}}},f.c);
      assert.equal(result.events.length,1);assert.equal(result.events[0].event.phone,'573001112233');assert.equal(result.events[0].event.fromMe,fromMe);
    }
  }finally{f.s.close();}
});

test('the supplied multi-pest case retains both pests, the stated area, and literal locality without inventing a municipality or price',async()=>{
  const f=fixture();
  try {
    await f.process({text:'Cucarachas pequeñas en cocina y hormigas'});
    await f.process({id:'AREAREPLY',at:Date.now()+1,text:'Un apartamento de 66 m cuadrados'});
    await f.process({id:'LOCALITYREPLY',at:Date.now()+2,text:'Villa suramericana, Robledo'});
    const slots=f.s.conversation('573001112233').state.slots;
    assert.equal(slots.service,'cucarachas y hormigas');assert.equal(slots.area,'66 m cuadrados');assert.equal(slots.site,'apartamento');
    assert.equal(slots.locationDetails,'Villa suramericana, Robledo');assert.equal(slots.location,undefined);
    assert.equal(slots.price,undefined);assert.equal(slots.technician,undefined);
    assert.equal(extractSlots('Un apartamento de 66 m² en Robledo','fumigacion').area,'66 m²');
    assert.equal(extractSlots('4 habitaciones, Santa Helena vereda el placer, ratas','fumigacion').rooms,'4 habitaciones');
  }finally{f.s.close();}
});

test('a new pest-control greeting requests the quotation intake together, without a tariff or technical claims',async()=>{
  const f=fixture();
  try {
    const first=await f.process({text:'Buenos días'});
    const reply=f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(first.id+':reply').body);
    assert.match(reply,/Hola, soy María Ángel/);assert.match(reply,/Qué plaga/);
    assert.match(reply,/tipo de inmueble/);assert.match(reply,/habitaciones o metros cuadrados/);
    assert.match(reply,/municipio y barrio o vereda/);
    assert.doesNotMatch(reply,/139|300|ISO|insecticida|veneno|Sandra|Diego|técnico/i);
    assert.equal(f.s.conversation(first.phone).state.initialIntakeAllRequested,true);
  }finally{f.s.close();}
});

test('the supplied multi-line room and rodent answer retains each fact and asks only the still-missing property type',async()=>{
  const f=fixture();
  try {
    await f.process({text:'Buenos días'});
    const answer=await f.process({id:'ROOMSVEREDARODENTS',at:Date.now()+1,text:'4 habitaciones\nSanta helena vereda el placer\nRatas'});
    const state=f.s.conversation(answer.phone).state;
    assert.equal(state.slots.rooms,'4 habitaciones');assert.equal(state.slots.service,'ratas');
    assert.match(state.slots.locationDetails,/Santa helena vereda el placer/);
    const reply=f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(answer.id+':reply').body);
    assert.match(reply,/tipo de inmueble/);assert.doesNotMatch(reply,/habitaciones|qué plaga|municipio|139|300/i);
  }finally{f.s.close();}
});

test('a property and town without size cannot skip the room or area requirement',async()=>{
  const f=fixture();
  try {
    const first=await f.process({text:'Cucarachas en una casa en Bello'});
    const reply=f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(first.id+':reply').body);
    assert.match(reply,/habitaciones o metros cuadrados/);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
    assert.doesNotMatch(reply,/precio|horario|confirmada/i);
  }finally{f.s.close();}
});

test('complete quotation facts create one human quotation request before asking availability or inventing a price',async()=>{
  const f=fixture();
  try {
    await f.process({text:'Buenos días'});
    const answer=await f.process({id:'FULLQUOTEFACTS',at:Date.now()+1,text:'Cucarachas y hormigas, apartamento de 66 m², Villa Suramericana, Robledo'});
    const row=f.s.db.prepare('SELECT * FROM questions').get(),question=f.s.open(row.body);
    assert.equal(row.topic,'cotizacion-verificada');assert.equal(row.recipient,SANDRA);
    assert.match(question.text,/66 m²/);assert.match(question.text,/cucarachas y hormigas/);
    assert.match(question.text,/Robledo/);assert.doesNotMatch(question.text,/139|300|horario disponible/);
    const reply=f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(answer.id+':reply').body);
    assert.match(reply,/Una asesora continuará contigo/);assert.doesNotMatch(reply,/día|horaria|confirmada|139|300/i);
    assert.equal(f.s.conversation(answer.phone).state.slots.price,undefined);
    await f.process({id:'SAMEQUOTEFACTS',at:Date.now()+2,text:'Un apartamento de 66 m²'});
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get('SAMEQUOTEFACTS:reply').n,0);
  }finally{f.s.close();}
});

test('an initial price question retains the stated pest and asks only the missing property',async()=>{
  const f=fixture();
  try {
    const first=await f.process({text:'Hola, ¿cuánto cuesta el servicio para ratas?'});
    const reply=f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(first.id+':reply').body);
    assert.match(reply,/tipo de inmueble/);assert.doesNotMatch(reply,/cuéntame|habitaciones|metros cuadrados|Qué plaga/i);
    assert.equal(f.s.conversation(first.phone).state.slots.service,'ratas');
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  }finally{f.s.close();}
});

test('an unanswered size requirement is a precise single pending clarification rather than an error or repeated customer acknowledgement',async()=>{
  const f=fixture();
  try {
    await f.process({text:'Cucarachas en una casa en Bello'});
    await f.process({id:'SIZEUNKNOWN1',at:Date.now()+1,text:'No sé cuánto mide'});
    await f.process({id:'SIZEUNKNOWN2',at:Date.now()+2,text:'No tengo ese dato'});
    const row=f.s.db.prepare('SELECT * FROM questions').get();
    assert.equal(row.topic,'missing-intake:size');assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.match(f.s.open(row.body).text,/habitaciones o metros cuadrados/);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get('SIZEUNKNOWN2:reply').n,0);
  }finally{f.s.close();}
});

test('the verified service thank-you receives courtesy without reopening intake or claiming that service',async()=>{
  const f=fixture();
  try {
    const first=await f.process({text:'muchísimas gracias  por  servició  de  fumigación  Dios  bendiga  la  empresa y  a todo  el  personal 🙏🏻'});
    const reply=f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(first.id+':reply').body);
    assert.match(reply,/Con gusto/);assert.doesNotMatch(reply,/inmueble|plaga|cotización|habitaciones|municipio|confirmad/i);
    assert.deepEqual(f.s.conversation(first.phone).state.slots,{});
    assert.deepEqual(f.s.conversation(first.phone).state.asked,[]);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
    f.s.delivery('BOTMID1',first.line,'READ');
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM case_authorship').get().n,0);
  }finally{f.s.close();}
});

test('courtesy with a greeting preserves an existing pending case without another intake list or clarification',async()=>{
  const f=fixture();
  try {
    const first=await f.process({text:'Cucarachas en casa en Bello'});
    const before=f.s.conversation(first.phone).state;
    const replyEvent=await f.process({id:'SERVICETHANKS',at:Date.now()+1,text:'Hola, muchas gracias por la atención. Dios los bendiga 🙏'});
    const after=f.s.conversation(first.phone).state;
    assert.deepEqual(after.slots,before.slots);assert.deepEqual(after.asked,before.asked);assert.equal(after.caseId,before.caseId);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
    assert.doesNotMatch(f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(replyEvent.id+':reply').body),/cuéntame|metros|municipio|plaga/i);
  }finally{f.s.close();}
});

test('thanks containing a new request, uncertainty, payment, or safety issue are not dismissed as courtesy',async()=>{
  const cases=[
    ['Gracias, necesito otro servicio para ratas',/inmueble/],
    ['Gracias, ¿qué garantía tiene el servicio?',/Revisaremos tu caso/],
    ['Gracias, ya pagué por el servicio',/falta verificarlo/],
    ['Gracias, pero mi perro está intoxicado',/Revisaremos tu caso/],
  ];
  for(const [text,expected] of cases){
    const f=fixture();
    try{
      const first=await f.process({text});
      assert.match(f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(first.id+':reply').body),expected);
    }finally{f.s.close();}
  }
});

test('service gratitude cannot release staff attention or produce a customer response while paused',async()=>{
  for(const held of [true,false]){
    const f=fixture();
    try{
      if(held){const staff=f.event({id:'STAFFTHANKS',fromMe:true,text:'Ya te atendí.'});f.s.enqueue(staff);await f.engine.process(staff);}
      else f.c.enabled=false;
      const source=await f.process({id:'CUSTOMERTHANKS',at:Date.now()+1,text:'Muchas gracias por el servicio de fumigación.'});
      assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
      assert.equal(f.s.conversation(source.phone).hold,Number(held));
    }finally{f.s.close();}
  }
});
