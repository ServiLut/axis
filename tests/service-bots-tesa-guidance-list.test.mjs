import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {FUMIGACION_BLUE,BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';
import {initializeTesaStore,acceptTesaQuotedAnswer} from '../automation/service-bots/tesa-operations.mjs';
import {queueTesaGuidanceList,guidanceListStatus,drainTesaGuidanceLists,TESA_GUIDANCE_LIST_GUARD} from '../automation/service-bots/tesa-guidance-list.mjs';

const human='573043332213',mid='SYNTHETIC_GUIDANCE_MID';
const body=()=>({key:'maria-guidance-current-v1',sourceHash:'a'.repeat(64),items:[{title:'Servicios ofrecidos',
  question:'¿Cómo confirmamos si se ofrece un servicio que no aparece en el listado?',
  example:'Una persona pregunta por un tratamiento que no reconoce en la información disponible.'}]});
function fixture(company='fumigacion'){
  const now=Date.now(),business=BUSINESSES[company],store=new Store(':memory:',company,randomBytes(32));
  const config={company,...business,enabled:true,provider:'https://synthetic.invalid',activatedAt:now-60000,
    lines:business.phones.map((phone,i)=>({phone,instance:'synthetic-guidance-'+i,apiKey:'SYNTHETIC_NOT_A_REAL_KEY'})),
    operationalLineScope:company==='fumigacion'?{company,version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,
      activeLines:[FUMIGACION_BLUE],suspendedLines:[business.phones[1]],authorizedAt:new Date(now-50000).toISOString()}:null};
  const participants=[...TESA_BOT_PHONES,human].map(phone=>({id:phone+'@s.whatsapp.net',phoneNumber:phone+'@s.whatsapp.net'}));
  config.tesaOperations={enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:business.phones[0],activatedAt:now-30000,
    allowedParticipantPhones:[human],verifiedMembership:{owner:business.phones[0],ownerOpen:true,verifiedAt:now-100,expiresAt:now+240000,
      sourceHash:'a'.repeat(64),participantPhones:participants.map(p=>p.id.split('@')[0]),participantBindings:participants.map(p=>({jid:p.id,phone:p.id.split('@')[0]}))}};
  const calls=[],hooks={};let sends=0,checks=0,ownerChecks=0;
  const transport={verifyLine:async phone=>{
    calls.push({kind:'owner',phone});ownerChecks++;if(hooks.owner)await hooks.owner(ownerChecks);
    return {phone,instance:config.lines.find(l=>l.phone===phone)?.instance,ownerVerified:true,open:true,...hooks.ownerProof};
  },request:async(line,path,request)=>{
    assert.equal(line.phone,FUMIGACION_BLUE,'no red or foreign provider request');calls.push({kind:'request',phone:line.phone,path});
    if(path.startsWith('/group/findGroupInfos/')){if(hooks.group)await hooks.group();return {id:TESA_GROUP_JID,subject:TESA_GROUP_SUBJECT,size:participants.length,participants,...hooks.groupResult};}
    if(path.startsWith('/message/sendText/')){
      assert.deepEqual(Object.keys(request).sort(),['linkPreview','number','text']);assert.equal(request.number,TESA_GROUP_JID);assert.equal(request.linkPreview,false);sends++;
      if(hooks.send)await hooks.send(request);return {key:{id:mid,remoteJid:TESA_GROUP_JID,...hooks.receipt}};
    }
    if(path.startsWith('/chat/findMessages/')){
      checks++;assert.equal(request.where.key.id,mid);
      const row=store.db.prepare('SELECT * FROM tesa_guidance_lists WHERE mid=?').get(mid);
      const native={key:{id:mid,remoteJid:TESA_GROUP_JID,fromMe:true,participant:FUMIGACION_BLUE+'@s.whatsapp.net'},messageTimestamp:Math.floor(row.created/1000),
        message:{conversation:store.open(row.body).text},status:'DELIVERY_ACK'};
      return {messages:{records:hooks.native?await hooks.native(native):[native]}};
    }
    throw Error('UNEXPECTED_SYNTHETIC_REQUEST');
  }};
  const queue=p=>queueTesaGuidanceList(store,config,p??body()),drain=()=>drainTesaGuidanceLists(store,config,transport);
  const row=()=>store.db.prepare('SELECT * FROM tesa_guidance_lists ORDER BY rowid DESC LIMIT 1').get();
  return {store,config,transport,hooks,calls,queue,drain,row,counts:()=>({sends,checks,ownerChecks})};
}
const withFixture=async(fn,company)=>{const f=fixture(company);try{await fn(f);}finally{f.store.close();}};

test('general guidance is encrypted, closed, independent of customer queues and safely readable by key',()=>withFixture(async f=>{
  const before=f.store.db.prepare('SELECT COUNT(*) n FROM meta').get().n,q=f.queue(),r=f.row();
  assert.equal(q.queued,true);assert.equal(q.state,'READY');assert.equal(q.caseBound,false);assert.equal(q.automaticAnswerAdoption,false);
  assert.ok(!r.body.includes(body().items[0].example));assert.equal(f.store.open(r.body).guard,TESA_GUIDANCE_LIST_GUARD);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM meta').get().n,before);assert.equal(f.counts().sends,0);
  const status=guidanceListStatus(f.store,f.config);assert.deepEqual(status.states,{READY:1});assert.equal(Object.hasOwn(status,'list'),false);
  const selected=guidanceListStatus(f.store,f.config,{key:body().key});assert.equal(selected.list.sourceHash,body().sourceHash);
  assert.match(selected.list.text,/Ejemplo sencillo:/);assert.equal(selected.list.text.length<=5000,true);
  assert.equal(guidanceListStatus(f.store,f.config,{key:'synthetic-not-found'}).found,false);assert.equal(f.counts().sends,0);
}));
test('same key is immutable and identical source/text under a different key never creates another list',()=>withFixture(async f=>{
  const first=f.queue();assert.equal(f.queue().id,first.id);assert.equal(f.queue({...body(),key:'maria-guidance-different-v1'}).id,first.id);
  const changed=body();changed.items[0].question='¿Cómo se verifica el alcance general de un servicio?';
  assert.throws(()=>f.queue(changed),/TESA_GUIDANCE_KEY_CONFLICT/);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_guidance_lists').get().n,1);
}));
test('closed schema rejects extra route, customer, proof and item fields and invalid bounds',()=>withFixture(async f=>{
  for(const patch of [{groupJid:'foreign@g.us'},{line:BUSINESSES.fumigacion.phones[1]},{phone:'573000001234'},{sourceHash:'bad'},
    {sourceHash:['a'.repeat(64)]},{key:12345678},{key:'bad'},{items:[]},{items:Array(7).fill(body().items[0])}]){
    assert.throws(()=>f.queue({...body(),...patch}),/TESA_GUIDANCE_/);
  }
  for(const item of [{...body().items[0],sourceId:'fake'}, {...body().items[0],title:'x'.repeat(81)},{...body().items[0],example:'x'.repeat(251)},
    {...body().items[0],question:'x'.repeat(351)},{...body().items[0],title:' Hidden'}, {...body().items[0],example:'Una línea\nOtra línea'}])
    assert.throws(()=>f.queue({...body(),items:[item]}),/TESA_GUIDANCE_/);
  assert.throws(()=>guidanceListStatus(f.store,f.config,{key:body().key,phone:'fake'}),/TESA_GUIDANCE_STATUS_KEY_REQUIRED/);
  assert.throws(()=>guidanceListStatus(f.store,f.config,{key:12345678}),/TESA_GUIDANCE_STATUS_KEY_REQUIRED/);
}));
test('PII, addresses, URLs, credentials and finances cannot enter any title, question or example',async t=>{
  for(const text of ['Llamar al 573001112233','cliente １２３４５６','correo persona @ ejemplo . co','Visitar ejemplo.dev','Abrir https://example.invalid',
    'Revisar token privado','Bearer reservado','La clave de acceso','Contraseña privada','En la Carrera cuarenta','Juliana Arango Pérez',
    'La dirección del cliente','Solicita un abono','Necesita un reembolso','La tarifa del servicio','Un valor especial','Pagar en efectivo','$ por servicio']){
    await t.test(text,()=>withFixture(async f=>{
      for(const field of ['title','question','example'])assert.throws(()=>f.queue({...body(),items:[{...body().items[0],[field]:text}]}),/GENERAL_MINIMIZED/);
      assert.equal(f.counts().sends,0);
    }));
  }
});
test('one READY list per cycle is sent only through verified blue and exact current group membership',()=>withFixture(async f=>{
  f.queue();const second=body();second.key+='-next';second.items[0].title='Alcance consultado';f.queue(second);
  const result=await f.drain();assert.equal(result.accepted,1);assert.equal(f.counts().sends,1);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM tesa_guidance_lists WHERE state='READY'").get().n,1);
  assert.ok(f.calls.every(c=>c.phone===FUMIGACION_BLUE));assert.ok(f.counts().ownerChecks>=2);
  assert.deepEqual(guidanceListStatus(f.store,f.config).states,{ACCEPTED:1,READY:1});
}));
test('provider receipt is ACCEPTED only, and exact native identity/text/delivery is required for DELIVERED then READ',()=>withFixture(async f=>{
  f.queue();await f.drain();assert.equal(f.row().state,'ACCEPTED');assert.equal(f.row().native_proof,null);
  await f.drain();assert.equal(f.row().state,'DELIVERED');assert.equal(f.store.open(f.row().native_proof).authorJid,FUMIGACION_BLUE+'@s.whatsapp.net');
  const checks=f.counts().checks;await f.drain();assert.equal(f.counts().checks,checks,'at least sixty second delivery backoff');
  f.store.db.prepare('UPDATE tesa_guidance_lists SET checked_at=0').run();
  f.hooks.native=n=>[{...n,status:'READ'}];await f.drain();assert.equal(f.row().state,'READ');
  const afterRead=f.calls.length;await f.drain();assert.equal(f.calls.length,afterRead,'READ is final and receives no polling');
  assert.equal(f.counts().sends,1);
}));
test('wrong native MID/group/author/text, contradictory duplicates and non-delivery cannot prove delivery',async t=>{
  const patches=[
    n=>[{...n,key:{...n.key,id:'OTHER_SYNTHETIC_ID'}}],n=>[{...n,key:{...n.key,remoteJid:'other@g.us'}}],
    n=>[{...n,key:{...n.key,fromMe:false}}],n=>[{...n,key:{...n.key,participant:human+'@s.whatsapp.net'}}],
    n=>[{...n,authorJid:human+'@s.whatsapp.net'}],n=>[{...n,message:{conversation:'Different content'}}],
    n=>[n,structuredClone(n)],n=>[{...n,status:'SERVER_ACK'}],n=>[{...n,messageTimestamp:0}],
    n=>[{...n,isEdited:true}],n=>[{...n,isDeleted:true}],n=>[{...n,status:'DELETED',MessageUpdate:[{status:'READ'}]}],
    n=>[{...n,status:'REVOKED'}],n=>[{...n,message:{...n.message,protocolMessage:{type:'REVOKE'}}}],
    n=>[{...n,message:{ephemeralMessage:{message:{...n.message,editedMessage:{message:{conversation:'edited'}}}}}}],
    n=>[{...n,message:{ephemeralMessage:{isDeleted:true,message:n.message}}}],
    n=>[{...n,message:{extendedTextMessage:{text:n.message.conversation,protocolMessage:{type:'REVOKE'}}}}],
    n=>[{...n,message:{...n.message,ephemeralMessage:{message:n.message}}}],
  ];
  for(const [i,patch] of patches.entries())await t.test('native adversary '+i,()=>withFixture(async f=>{
    f.queue();await f.drain();f.hooks.native=patch;await f.drain();assert.equal(f.row().state,'ACCEPTED');assert.equal(f.row().native_proof,null);assert.equal(f.counts().sends,1);
  }));
});
test('failed preflight stays READY and does not reserve or attempt a send',async t=>{
  for(const kind of ['membership','owner','wrong-group'])await t.test(kind,()=>withFixture(async f=>{
    f.queue();if(kind==='membership')f.hooks.group=()=>{throw Error('PRIVATE_SYNTHETIC_FAILURE');};
    if(kind==='owner')f.hooks.ownerProof={ownerVerified:false};
    if(kind==='wrong-group')f.hooks.groupResult={id:'wrong@g.us'};
    const r=await f.drain();assert.equal(r.accepted,0);assert.equal(f.row().state,'READY');assert.equal(f.counts().sends,0);
    assert.equal(JSON.stringify(f.row()).includes('PRIVATE_SYNTHETIC_FAILURE'),false);
    const firstCalls=f.calls.length;await f.drain();assert.equal(f.calls.length,firstCalls,'failed preflight is not polled again before sixty seconds');
    f.hooks.group=undefined;f.hooks.ownerProof=undefined;f.hooks.groupResult=undefined;
    f.store.db.prepare('UPDATE tesa_guidance_lists SET checked_at=?').run(Date.now()-60001);
    await f.drain();assert.equal(f.counts().sends,1,'a due preflight can recover before any prior send');
  }));
});
test('a failed delivery preflight also waits sixty seconds before another provider read',()=>withFixture(async f=>{
  f.queue();await f.drain();f.hooks.group=()=>{throw Error('PRIVATE_SYNTHETIC_FAILURE');};await f.drain();
  const first=f.calls.length;assert.equal(f.row().state,'ACCEPTED');await f.drain();assert.equal(f.calls.length,first);
  assert.equal(f.counts().sends,1);
}));
test('any failure or malformed receipt after reservation is UNCERTAIN and cannot resend under any new key',async t=>{
  for(const kind of ['throw','wrong-group','missing-id','disable-after-send'])await t.test(kind,()=>withFixture(async f=>{
    f.queue();if(kind==='throw')f.hooks.send=()=>{throw Error('PRIVATE_SYNTHETIC_FAILURE');};
    if(kind==='wrong-group')f.hooks.receipt={remoteJid:'wrong@g.us'};
    if(kind==='missing-id')f.hooks.receipt={id:null};
    if(kind==='disable-after-send')f.hooks.send=()=>{f.config.enabled=false;};
    await f.drain();assert.equal(f.row().state,'UNCERTAIN');assert.equal(f.counts().sends,1);f.config.enabled=true;
    assert.equal(f.queue({...body(),key:'maria-guidance-alternate-v1'}).state,'UNCERTAIN');
    await f.drain();assert.equal(f.counts().sends,1);assert.equal(JSON.stringify(f.row()).includes('PRIVATE_SYNTHETIC_FAILURE'),false);
  }));
});
test('an abandoned SENDING reservation becomes UNCERTAIN without provider traffic',()=>withFixture(async f=>{
  f.queue();f.store.db.prepare("UPDATE tesa_guidance_lists SET state='SENDING'").run();await f.drain();
  assert.equal(f.row().state,'UNCERTAIN');assert.equal(f.calls.length,0);assert.equal(f.counts().sends,0);
}));
test('scope or binding changes across asynchronous membership and owner checks stop sending',async t=>{
  for(const kind of ['scope','instance','disabled','sender','key'])await t.test(kind,()=>withFixture(async f=>{
    f.queue();f.hooks.owner=n=>{if(n!==2)return;if(kind==='scope')f.config.operationalLineScope=null;if(kind==='instance')f.config.lines[0].instance+='changed';
      if(kind==='disabled')f.config.enabled=false;if(kind==='sender')f.config.tesaOperations.senderLine=f.config.lines[1].phone;if(kind==='key')f.config.lines[0].apiKey='DIFFERENT_SYNTHETIC_KEY';};
    await f.drain();assert.equal(f.row().state,'READY');assert.equal(f.counts().sends,0);
  }));
});
test('a wrong route or missing blue scope cannot enqueue or even query the provider',async t=>{
  for(const kind of ['no-scope','wrong-group','red-sender','disabled'])await t.test(kind,()=>withFixture(async f=>{
    if(kind==='no-scope')f.config.operationalLineScope=null;if(kind==='wrong-group')f.config.tesaOperations.groupJid='wrong@g.us';
    if(kind==='red-sender')f.config.tesaOperations.senderLine=f.config.lines[1].phone;if(kind==='disabled')f.config.enabled=false;
    assert.throws(()=>f.queue(),/TESA_GUIDANCE_/);assert.equal((await f.drain()).enabled,false);assert.equal(f.calls.length,0);
  }));
});
test('Miguel remains unchanged: no queue, table, provider read or write',()=>withFixture(async f=>{
  const before=f.store.db.prepare('SELECT name FROM sqlite_master ORDER BY name').all();
  assert.throws(()=>f.queue(),/OWN_ENABLED_FUM_REQUIRED/);assert.equal(guidanceListStatus(f.store,f.config).enabled,false);
  assert.equal((await f.drain()).enabled,false);assert.equal(f.calls.length,0);
  assert.deepEqual(f.store.db.prepare('SELECT name FROM sqlite_master ORDER BY name').all(),before);
},'servicio-tecnico'));
test('a quote of a guidance list is observed without binding a case, changing policy or releasing a hold',()=>withFixture(async f=>{
  initializeTesaStore(f.store);f.queue();await f.drain();await f.drain();
  const customer='573001112233';f.store.saveConversation(customer,{caseId:'SYNTHETIC_CASE',slots:{},asked:[]});f.store.hold(customer,'HUMAN_SOURCE',true);
  const before=f.store.conversation(customer),answer=acceptTesaQuotedAnswer(f.store,f.config,{id:'SYNTHETIC_GENERAL_RESPONSE',company:'fumigacion',
    groupJid:TESA_GROUP_JID,receivingLine:FUMIGACION_BLUE,line:FUMIGACION_BLUE,participant:{phone:human,jid:human+'@s.whatsapp.net'},
    at:Date.now(),kind:'text',text:'Sobre el primer punto, revisen el alcance específico antes de continuar.',fromMe:false,forwarded:false,
    quote:{mid,groupJid:TESA_GROUP_JID,participantJid:FUMIGACION_BLUE+'@s.whatsapp.net'},media:null});
  assert.equal(answer.accepted,false);assert.equal(answer.state,'OBSERVED_UNSCOPED_QUOTE');assert.deepEqual(f.store.conversation(customer),before);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM knowledge').get().n,0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}));
test('tampered encrypted text/hash cannot be sent or reported as a verified list',()=>withFixture(async f=>{
  f.queue();const row=f.row(),saved=f.store.open(row.body);saved.text+=' Tampered.';f.store.db.prepare('UPDATE tesa_guidance_lists SET body=?').run(f.store.seal(saved));
  await f.drain();assert.equal(f.row().state,'READY');assert.equal(f.calls.length,0);
  assert.throws(()=>guidanceListStatus(f.store,f.config,{key:body().key}),/STORED_HASH_CONFLICT/);
}));
