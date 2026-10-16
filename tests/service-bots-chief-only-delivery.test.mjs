import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {Transport,drain,flushOutbox} from '../automation/service-bots/transport.mjs';
import {BUSINESSES,SANDRA,HILARY,DIEGO,CURRENT_OPERATOR_ROUTING,configFromEnv,chiefReplyRestrictionActive,outboundRecipientAllowed,validateEvent} from '../automation/service-bots/config.mjs';
import {drainTesaGroup} from '../automation/service-bots/tesa-transport.mjs';
import {queueTesaGuidanceList,drainTesaGuidanceLists} from '../automation/service-bots/tesa-guidance-list.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {FUMIGACION_BLUE,BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';
import {initializeIntakeJournal,recordIntakeWebhook,intakeAudit} from '../automation/service-bots/intake-journal.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';

const customer='573001112233';
function configuration(company='fumigacion'){
  const now=Date.now(),business=BUSINESSES[company];
  return {company,...business,enabled:false,chiefOnly:true,replyOnlyToChief:true,activatedAt:now-60000,provider:'https://synthetic.invalid',operatorRouting:CURRENT_OPERATOR_ROUTING,
    lines:business.phones.map((phone,i)=>({phone,instance:'synthetic-restriction-'+i,apiKey:String(i).repeat(32)}))};
}
function env(company='fumigacion'){
  const c=configuration(company);return {BOT_COMPANY:company,BOT_LINES_JSON:JSON.stringify(c.lines),BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'c'.repeat(64),BOT_DATA_KEY:'b'.repeat(64),BOT_DATABASE_PATH:'/data/'+company+'/bot.sqlite',BOT_EVOLUTION_URL:c.provider,
    BOT_ACTIVATED_AT:new Date(c.activatedAt).toISOString(),BOT_ENABLED:'false',BOT_CHIEF_ONLY:'true',BOT_REPLY_ONLY_TO_CHIEF:'true'};
}
function fixture(company='fumigacion'){
  const c=configuration(company),s=new Store(':memory:',company,randomBytes(32));return {c,s,e:new Engine(s,c)};
}
const withFixture=async(fn,company)=>{const f=fixture(company);try{await fn(f);}finally{f.s.close();}};
const snapshot=s=>s.db.prepare('SELECT * FROM outbox ORDER BY rowid').all();

test('the optional own FUM env narrows delivery to Sandra without enabling customer responses',()=>{
  const c=configFromEnv(env());assert.equal(c.enabled,false);assert.equal(c.chiefOnly,true);assert.equal(c.replyOnlyToChief,true);
  assert.equal(chiefReplyRestrictionActive(c),true);assert.equal(outboundRecipientAllowed(c,SANDRA),true);
  for(const phone of [customer,HILARY,DIEGO,TESA_GROUP_JID,null,SANDRA+'@s.whatsapp.net'])assert.equal(outboundRecipientAllowed(c,phone),false);
  assert.equal(configFromEnv({...env(),BOT_REPLY_ONLY_TO_CHIEF:'false'}).replyOnlyToChief,false);
  const omitted=env();delete omitted.BOT_REPLY_ONLY_TO_CHIEF;assert.equal(configFromEnv(omitted).replyOnlyToChief,false);
  for(const value of ['TRUE','1','true ',null])assert.throws(()=>configFromEnv({...env(),BOT_REPLY_ONLY_TO_CHIEF:value}),/CHIEF_REPLY_RESTRICTION_REQUIRED/);
});
test('the flag cannot change Miguel recipient scope or the default delivery contract',()=>{
  const c=configFromEnv(env('servicio-tecnico'));assert.equal(c.replyOnlyToChief,false);assert.equal(outboundRecipientAllowed({...c,replyOnlyToChief:true},HILARY),true);
  assert.equal(outboundRecipientAllowed({company:'fumigacion'},customer),true);
});
for(const [company,restricted] of [['fumigacion',true],['fumigacion',false],['servicio-tecnico',true]])test('authenticated status reports only the actual optional restriction: '+company+'/'+restricted,()=>withFixture(async({c,s,e})=>{
  c.replyOnlyToChief=restricted;const token='s'.repeat(43);c.authHash=createHash('sha256').update(token).digest('hex');
  const server=createBotServer(c,s,{request:async()=>{throw Error('NO_PROVIDER_HTTP');},fetcher:async()=>{throw Error('NO_BUSINESS_OR_MODEL_HTTP');}},e);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/status',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,200);const value=await response.json(),active=company==='fumigacion'&&restricted;
    assert.equal(value.replyOnlyToChief,active);assert.deepEqual(value.allowedReplyRecipients,active?[SANDRA]:null);assert.equal(value.customerResponsesEnabled,false);assert.equal(value.businessWritesEnabled,false);assert.equal(value.ownOrderScheduling?.enabled??false,false);
  }finally{await new Promise(resolve=>server.close(resolve));}
},company));
for(const phone of [customer,HILARY,DIEGO])test('the real private transport rejects '+phone+' before any provider request',async()=>{
  const c=configuration();c.enabled=true;let calls=0;const t=new Transport(c,async()=>{calls++;throw Error('NO_HTTP_ALLOWED');});
  await assert.rejects(()=>t.send({phone,line:c.lines[0].phone,internal:phone!==customer},'Mensaje que debe conservarse'),/CHIEF_ONLY_DELIVERY_RESTRICTION/);assert.equal(calls,0);
});
for(const endpoint of ['sendText','sendMedia','sendWhatsAppAudio','sendButtons'])test('the low-level '+endpoint+' request cannot bypass the Sandra gate',async()=>{
  const c=configuration();let calls=0;const t=new Transport(c,async()=>{calls++;throw Error('NO_HTTP_ALLOWED');});
  for(const number of [customer,HILARY,TESA_GROUP_JID,undefined])await assert.rejects(()=>t.request(c.lines[0],'/message/'+endpoint+'/'+c.lines[0].instance,{number,text:'Original'}),/CHIEF_ONLY_DELIVERY_RESTRICTION/);
  assert.equal(calls,0);
});
test('Sandra text and verified chief document retain their existing exact recipient and payload',async()=>{
  const c=configuration(),calls=[],t=new Transport(c,async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({key:{id:'SYNTHETIC_CHIEF_SEND_001'}})};});
  const row={phone:SANDRA,line:c.lines[0].phone,internal:true};assert.equal(await t.send(row,'Sandra, consulta de prueba.'),'SYNTHETIC_CHIEF_SEND_001');
  const bytes=Buffer.alloc(120);Buffer.from('504b0304','hex').copy(bytes);const doc={kind:'chief_document',fileName:'synthetic.xlsx',mediaBase64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),caption:'Documento interno sintético.'};
  await t.send(row,doc);assert.equal(calls.length,2);assert.ok(calls.every(v=>v.body.number===SANDRA));assert.match(calls[0].url,/sendText/);assert.match(calls[1].url,/sendMedia/);
});
test('read-only own provider operations remain available under the delivery restriction',async()=>{
  const c=configuration(),calls=[],t=new Transport(c,async(url)=>{calls.push(url);return {ok:true,json:async()=>({messages:{records:[]}})};});
  await t.request(c.lines[0],'/chat/findMessages/'+c.lines[0].instance,{where:{key:{id:'SYNTHETIC_NATIVE_SOURCE'}}});assert.equal(calls.length,1);assert.match(calls[0],/findMessages/);
});
test('flush skips all blocked rows before checks and mutations even with a custom transport',()=>withFixture(async({c,s})=>{
  c.enabled=true;
  for(let i=0;i<25;i++)s.queue('blocked-'+i,i%2?customer:HILARY,c.lines[0].phone,'Texto original '+i,i%2===0,0);
  s.queue('chief-new',SANDRA,c.lines[0].phone,'Sandra, resultado pertinente.',true,0);
  for(const [i,state] of ['ACCEPTED','UNCERTAIN','DELIVERED','READ'].entries()){
    s.queue('historical-'+i,DIEGO,c.lines[0].phone,'Histórico original '+i,true,0);s.db.prepare('UPDATE outbox SET state=?,mid=? WHERE id=?').run(state,'HISTORICAL_MID_'+i,'historical-'+i);
  }
  const before=snapshot(s),calls=[];
  const result=await flushOutbox(s,c,{verifyLine:async p=>{calls.push(['verify',p]);},send:async(row,text)=>{calls.push(['send',row.phone,text]);return 'CHIEF_NEW_SEND_001';}});
  assert.equal(result.accepted,1);assert.deepEqual(calls,[['verify',c.lines[0].phone],['send',SANDRA,'Sandra, resultado pertinente.']]);
  assert.deepEqual(snapshot(s).filter(r=>r.phone!==SANDRA),before.filter(r=>r.phone!==SANDRA));assert.equal(s.db.prepare('SELECT COUNT(*) n FROM conversations WHERE hold=1').get().n,0);
}));
test('the paused drain processes only Sandra while retaining other pending sources and holds',()=>withFixture(async({c,s,e})=>{
  const now=Date.now(),events=[{id:'CUSTOMER_PAUSE_001',phone:customer,text:'Quiero contratar el servicio.'},{id:'OPERATOR_PAUSE_001',phone:HILARY,text:'María, revisa este cliente.'},{id:'CHIEF_PAUSE_001',phone:SANDRA,text:'María Ángel, gracias'}].map(x=>({...x,line:c.lines[0].phone,at:now,fromMe:false,kind:'text'}));
  for(const event of events)s.enqueue(event);s.hold(customer,'SYNTHETIC_STAFF_TAKEOVER',true);
  const blockedBefore=s.db.prepare('SELECT * FROM events WHERE phone<>? ORDER BY rowid').all(SANDRA),heldBefore=s.conversation(customer),sent=[];
  await drain(s,c,{verifyLine:async()=>{},send:async row=>{sent.push(row.phone);return 'CHIEF_PAUSE_REPLY_001';}},e);
  assert.deepEqual(sent,[SANDRA]);assert.deepEqual(s.db.prepare('SELECT * FROM events WHERE phone<>? ORDER BY rowid').all(SANDRA),blockedBefore);assert.deepEqual(s.conversation(customer),heldBefore);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
}));
test('private native reception remains append-only and observable even while customer replies are paused',()=>withFixture(async({c,s})=>{
  const now=Date.now();initializeIntakeJournal(s,c,{now:now-1000});
  const raw={instance:c.lines[0].instance,event:'messages.upsert',data:{key:{id:'PAUSED_NATIVE_INTAKE_001',remoteJid:customer+'@s.whatsapp.net',fromMe:false},messageTimestamp:Math.floor(now/1000),message:{conversation:'Quiero fumigar mi apartamento'}}};
  const original=structuredClone(raw);const recorded=recordIntakeWebhook(s,c,raw,{authenticated:true,verifiedBinding:{phone:c.lines[0].phone,instance:c.lines[0].instance,ownerVerified:true,open:true},receivedAt:now});
  assert.equal(recorded.recorded,1);assert.deepEqual(raw,original);const day=new Date(now-5*3600000).toISOString().slice(0,10),a=intakeAudit(s,c,{company:c.company,day});
  assert.equal(a.aggregates.originalPrivateIncomingMessages,1);assert.equal(a.sources[0].literalText,'Quiero fumigar mi apartamento');assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  assert.ok(validateEvent({instance:c.lines[0].instance,owner:c.lines[0].phone,event:{id:'CHIEF_NATIVE_VALID_001',phone:SANDRA,at:new Date(now).toISOString(),fromMe:false,kind:'text',text:'María Ángel, gracias'}},c,now));
}));
test('TESA group READY/ACCEPTED and case data remain immutable without even reading membership',()=>withFixture(async({c,s})=>{
  c.enabled=true;c.replyOnlyToChief=false;
  const participants=[...TESA_BOT_PHONES,HILARY];c.tesaOperations={enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:c.lines[0].phone,activatedAt:c.activatedAt,allowedParticipantPhones:[HILARY],verifiedMembership:{owner:c.lines[0].phone,ownerOpen:true,verifiedAt:Date.now()-10,expiresAt:Date.now()+240000,sourceHash:'a'.repeat(64),participantPhones:participants,participantBindings:participants.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}};
  const event={id:'TESA_PAUSE_CASE_001',phone:customer,line:c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',text:'¿Qué horario hay?'};s.enqueue(event);const caseId='fumigacion:'+event.id;s.saveConversation(customer,{caseId,slots:{service:'cucarachas',location:'medellin'}});
  routeCaseQuestion(s,c,{phone:customer,line:event.line,caseId,topic:'disponibilidad-y-tecnico',conditions:{service:'cucarachas',location:'medellin'},source:event.id,recipients:[HILARY],text:'Pregunta original'});
  const before=s.db.prepare('SELECT * FROM tesa_outbox').all(),conv=s.conversation(customer);assert.equal(before.length,1);c.replyOnlyToChief=true;
  const result=await drainTesaGroup(s,c,{request:async()=>{throw Error('NO_PROVIDER_READ_OR_SEND');},verifyLine:async()=>{throw Error('NO_PROVIDER_READ_OR_SEND');}});
  assert.equal(result.restrictedToChief,true);assert.equal(result.accepted,0);assert.deepEqual(s.db.prepare('SELECT * FROM tesa_outbox').all(),before);assert.deepEqual(s.conversation(customer),conv);
}));
test('TESA general guidance restriction leaves its durable list and pending result untouched',()=>withFixture(async({c,s})=>{
  c.enabled=true;c.replyOnlyToChief=false;c.operationalLineScope={company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[c.lines[1].phone],authorizedAt:new Date(c.activatedAt).toISOString()};
  c.tesaOperations={enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:FUMIGACION_BLUE};
  queueTesaGuidanceList(s,c,{key:'synthetic-paused-guidance',sourceHash:'a'.repeat(64),items:[{title:'Consulta general',question:'¿Cómo se confirma un dato pendiente?',example:'Falta una indicación operativa.'}]});
  const before=s.db.prepare('SELECT * FROM tesa_guidance_lists').all();c.replyOnlyToChief=true;
  const result=await drainTesaGuidanceLists(s,c,{request:async()=>{throw Error('NO_PROVIDER_READ_OR_SEND');}});assert.equal(result.restrictedToChief,true);assert.equal(result.accepted,0);assert.deepEqual(s.db.prepare('SELECT * FROM tesa_guidance_lists').all(),before);
}));
