import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,validateEvent} from '../automation/service-bots/config.mjs';
import {Transport,flushOutbox,READ_SUPERVISION_GUARD} from '../automation/service-bots/transport.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';
import {resolveOwnBlueNativeIdentity} from '../automation/service-bots/native-identity-resolution.mjs';
import {decodeWebhook,initializePrivateNativeCachePair,recordPrivateNativeCachePairs,decodePrivateNativeCachePairs,observePrivateIdentity} from '../automation/service-bots/webhook.mjs';
import {FUMIGACION_BLUE,FUMIGACION_RED,BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';

// Synthetic in-memory doubles only: no HTTP, UI, model, credential, business
// mutation, production database, historical replay or suspended-line access.
const NOW=Date.parse('2026-10-19T14:00:00Z'),PHONE='573000009991',PN=PHONE+'@s.whatsapp.net',LID='123456789000991@lid';
const copy=value=>structuredClone(value);
function fixture(t){
  t.mock.method(Date,'now',()=>NOW);
  const store=new Store(':memory:','fumigacion',randomBytes(32));t.after(()=>store.close());
  const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:NOW-3600000,historyCheckRequired:true,
    lines:[{phone:FUMIGACION_BLUE,instance:'cucaracha-azul'},{phone:FUMIGACION_RED,instance:'cucaracha-roja'}],
    operationalLineScope:{company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[FUMIGACION_RED],authorizedAt:new Date(NOW-3590000).toISOString()}};
  initializeInactivityFollowup(config,store);
  const f={store,config,current:[],history:[],lid:[],anchors:[],calls:[],sent:0,response:null};
  const transport=new Transport(config,()=>assert.fail('HTTP is forbidden in this fixture'));
  transport.verifyLine=async phone=>{assert.equal(phone,FUMIGACION_BLUE,'red line is excluded');return {phone,instance:'cucaracha-azul',open:true,ownerVerified:true,checkedAt:new Date(NOW).toISOString()};};
  transport.request=async(line,route,query)=>{
    assert.equal(line.phone,FUMIGACION_BLUE,'red line is excluded');assert.equal(route,'/chat/findMessages/cucaracha-azul');f.calls.push(copy(query));
    const key=query.where.key;
    let rows=key.id?f.anchors.filter(row=>row.key.id===key.id):key.remoteJid===LID?(typeof key.fromMe==='boolean'?f.lid:f.anchors):(Date.parse(query.where.messageTimestamp.gte)<config.activatedAt?f.history:f.current).filter(row=>Object.entries(key).every(([field,value])=>row.key[field]===value));
    const result={total:rows.length,records:copy(rows.slice((query.page-1)*query.offset,query.page*query.offset))};
    return {messages:f.response?f.response(query,result):result};
  };
  transport.send=async()=>{f.sent++;return 'SYNTHETIC_SENT_'+f.sent;};
  f.transport=transport;
  f.prepare=()=>{
    const source={id:'SYNTHETIC_CUSTOMER_001',phone:PHONE,line:FUMIGACION_BLUE,at:NOW-2000,fromMe:false,kind:'text',text:'Hola',forwarded:false};
    store.enqueue(source);store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(source.id);
    store.queue(source.id+':reply',PHONE,FUMIGACION_BLUE,'Hola, puedo ayudarte.',false,store.conversation(PHONE).revision);
    return source;
  };
  f.out=()=>store.db.prepare('SELECT * FROM outbox WHERE id=?').get('SYNTHETIC_CUSTOMER_001:reply');
  return f;
}
const receipt=(id='SYNTHETIC_READ_RECEIPT',patch={})=>({key:{id,remoteJid:PN,fromMe:true},status:'READ',...patch});
const historyReceipt=(i,patch={})=>receipt('SYNTHETIC_HISTORY_'+String(i).padStart(3,'0'),patch);
const historicalText=(id='SYNTHETIC_HUMAN_HISTORY')=>receipt(id,{messageTimestamp:(NOW-3700000)/1000,message:{conversation:'Yo continúo la atención.'}});

test('normalized empty text is rejected before ingestion while real text and original media remain valid',t=>{
  const f=fixture(t),body={instance:'cucaracha-azul',owner:FUMIGACION_BLUE,event:{id:'SYNTHETIC_NORMALIZED',phone:PHONE,at:new Date(NOW).toISOString(),kind:'text',fromMe:true,text:''}};
  for(const fromMe of [true,false])for(const text of ['', ' \n\t']){
    const e=validateEvent({...body,event:{...body.event,fromMe,text,status:'READ'}},f.config,NOW);
    assert.equal(e,null);if(e)f.store.enqueue(e);
  }
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(f.store.conversation(PHONE),null);
  assert.ok(validateEvent({...body,event:{...body.event,text:'Yo atiendo este chat.'}},f.config,NOW));
  for(const kind of ['audio','image','video','document','call'])assert.ok(validateEvent({...body,event:{...body.event,kind}},f.config,NOW),kind);
});

test('delivery, opening and presence metadata never enqueue a human intervention',t=>{
  const f=fixture(t);f.prepare();
  for(const event of ['messages.update','messages.upsert','chat.update','presence.update'])for(const status of ['READ','DELIVERY_ACK',3,4]){
    const decoded=decodeWebhook({instance:'cucaracha-azul',event,data:{...receipt(),status}},f.config);
    assert.deepEqual(decoded.events,[]);
    for(const d of decoded.deliveries)f.store.delivery(d.mid,FUMIGACION_BLUE,d.state);
  }
  assert.equal(f.store.conversation(PHONE).hold,0);assert.equal(f.out().state,'READY');
});

test('real normalized staff text still immediately suppresses a prepared reply',t=>{
  const f=fixture(t);f.prepare();
  const e=validateEvent({instance:'cucaracha-azul',owner:FUMIGACION_BLUE,event:{id:'SYNTHETIC_STAFF_TEXT',phone:PHONE,at:new Date(NOW).toISOString(),kind:'text',fromMe:true,text:'Yo continúo la atención.',status:'READ'}},f.config,NOW);
  f.store.enqueue(e);assert.equal(f.store.conversation(PHONE).hold,1);assert.equal(f.out().state,'SUPPRESSED_HUMAN');
});

test('canonical and explicit PN alternative ignore only empty receipt metadata missing its timestamp',async t=>{
  const f=fixture(t);
  const bodies=[undefined,null,{}, {conversation:' \t'}, {extendedTextMessage:{text:''}}];
  const statuses=[{status:'READ'},{status:'DELIVERY_ACK'},{status:3},{status:4},{status:undefined,update:{status:'READ'}},{status:undefined,MessageUpdate:[{status:'DELIVERY_ACK'},{status:'READ'}]}];
  for(const alternate of [false,true])for(const message of bodies)for(const status of statuses){
    const row=receipt('SYNTHETIC_READ_RECEIPT',{message,...status});if(alternate)row.key={...row.key,remoteJid:LID,remoteJidAlt:PN};
    f.current=[row];const result=await f.transport.currentAttention(PHONE,{store:f.store});
    assert.equal(result.complete,true);assert.deepEqual(result.sources,[]);assert.equal(result.checks.length,2);
  }
  f.prepare();await flushOutbox(f.store,f.config,f.transport);assert.equal(f.sent,1);assert.equal(f.store.conversation(PHONE).hold,0);assert.equal(f.out().state,'ACCEPTED');
  assert.match(READ_SUPERVISION_GUARD,/read-receipts/);
});

test('unknown bodies, mutations and malformed timestamps retain attention review and a safe reason code',async t=>{
  for(const patch of [
    {status:'EDITED'},{status:'DELETED'},{status:'REVOKED'}, {MessageUpdate:[{status:'READ'},{status:'EDITED'}]},
    {update:{status:'DELETED'}},{isEdited:true},{deleted:true}, {message:{protocolMessage:{type:0}}},
    {message:{unknownMessage:{}}},{message:{conversation:'Mensaje real'}},{message:{imageMessage:{mimetype:'image/jpeg'}}},
    {messageType:'conversation'},{unknownOperation:'not-a-receipt'}, {contextInfo:{stanzaId:'SYNTHETIC_QUOTE'}},
    {status:'ERROR'},{status:undefined},{MessageUpdate:{status:'READ'}},{messageTimestamp:'invalid'}
  ]){
    const f=fixture(t);f.prepare();f.current=[receipt('SYNTHETIC_UNCERTAIN_SOURCE',patch)];
    await flushOutbox(f.store,f.config,f.transport);
    assert.equal(f.sent,0,JSON.stringify(patch));assert.equal(f.out().state,'ATTENTION_REVIEW',JSON.stringify(patch));assert.equal(f.store.conversation(PHONE).hold,1);
    const audit=f.store.db.prepare("SELECT detail FROM audit WHERE action='NATIVE_ATTENTION_UNVERIFIED'").get();
    assert.equal(f.store.open(audit.detail).reasonCode,'ATTENTION_SOURCE_OUTSIDE_SCOPE');
  }
});

test('READ never hides real text, original media, an authenticated edit or a deletion',async t=>{
  const f=fixture(t);
  for(const patch of [{message:{conversation:'Yo atiendo.'}},...['audio','image','video','document'].map(kind=>({message:{[kind+'Message']:{mimetype:'synthetic/type'}}})),{MessageUpdate:[{status:'EDITED'}]},{isEdited:true},{status:'EDITED'},{update:{status:'EDITED'}},{deleted:true},{MessageUpdate:[{status:'DELETED'}]},{message:{protocolMessage:{type:0}}}]){
    f.current=[receipt('SYNTHETIC_REAL_OUTGOING',{messageTimestamp:(NOW-1000)/1000,...patch})];
    const attention=await f.transport.currentAttention(PHONE,{store:f.store});assert.equal(attention.sources.length,1);
  }
  f.prepare();await flushOutbox(f.store,f.config,f.transport);assert.equal(f.sent,0);assert.equal(f.out().state,'SUPPRESSED_HUMAN');assert.equal(f.store.conversation(PHONE).hold,1);
});

test('identity, complete pagination and provider failures remain blocking despite empty READ metadata',async t=>{
  const cases=[
    () => ({total:101,records:[]}),
    () => ({total:1,records:[]}),
    () => ({total:1,records:[receipt('SYNTHETIC_WRONG_PHONE',{key:{id:'SYNTHETIC_WRONG_PHONE',remoteJid:'573000009992@s.whatsapp.net',fromMe:true}})]}),
    () => ({total:1,records:[receipt('SYNTHETIC_CONFLICTING_ALT',{key:{id:'SYNTHETIC_CONFLICTING_ALT',remoteJid:PN,remoteJidAlt:'573000009992@s.whatsapp.net',fromMe:true}})]}),
    () => ({total:1,records:[receipt('SYNTHETIC_CONFLICTING_PN',{key:{id:'SYNTHETIC_CONFLICTING_PN',remoteJid:'573000009992@s.whatsapp.net',remoteJidAlt:PN,fromMe:true}})]}),
    () => ({total:1,records:[receipt('SYNTHETIC_WRONG_DIRECTION',{key:{id:'SYNTHETIC_WRONG_DIRECTION',remoteJid:PN,fromMe:false}})]}),
    (q,r) => q.page===2?{...r,total:r.total+1}:r,
  ];
  for(const response of cases){
    const f=fixture(t);f.prepare();f.current=Array.from({length:51},(_,i)=>receipt('SYNTHETIC_CURRENT_'+String(i).padStart(3,'0')));f.response=response;
    await flushOutbox(f.store,f.config,f.transport);assert.equal(f.sent,0);assert.equal(f.out().state,'ATTENTION_REVIEW');assert.equal(f.store.conversation(PHONE).hold,1);
  }
});

test('attention diagnostics retain only bounded uppercase error codes',async t=>{
  for(const [message,expected] of [['ATTENTION_COVERAGE_UNVERIFIED','ATTENTION_COVERAGE_UNVERIFIED'],['https://secret.invalid/?token=synthetic-private','ATTENTION_CHECK_FAILED'],['X'.repeat(101),'ATTENTION_CHECK_FAILED']]){
    const f=fixture(t);f.prepare();f.transport.currentAttention=async()=>{throw Error(message);};await flushOutbox(f.store,f.config,f.transport);
    const audit=f.store.open(f.store.db.prepare("SELECT detail FROM audit WHERE action='NATIVE_ATTENTION_UNVERIFIED'").get().detail);
    assert.equal(audit.reasonCode,expected);assert.equal(audit.attemptedSend,false);assert.doesNotMatch(JSON.stringify(audit),/secret|token|synthetic-private/);assert.equal(f.sent,0);
  }
});

test('preactivation receipts are excluded only after a complete anchored scan including page two',async t=>{
  const f=fixture(t);f.history=Array.from({length:51},(_,i)=>historyReceipt(i));
  const result=await f.transport.priorHistory(PHONE),check=result.checks.find(check=>check.total);
  assert.equal(result.priorOutgoing,false);assert.equal(check.readSupervisionGuard,READ_SUPERVISION_GUARD);assert.equal(check.readReceiptCount,51);assert.equal(check.complete,true);assert.equal(check.read,51);
  assert.ok(f.calls.some(q=>q.offset===1));assert.ok(f.calls.some(q=>q.offset===50&&q.page===2));
});

test('an earlier human outgoing behind fifty READ receipts still retains historical attention',async t=>{
  const f=fixture(t);f.history=[...Array.from({length:50},(_,i)=>historyReceipt(i)),historicalText()];
  const result=await f.transport.priorHistory(PHONE),check=result.checks.find(check=>check.total);
  assert.equal(result.priorOutgoing,true);assert.equal(check.readReceiptCount,50);assert.deepEqual(check.attentionSources.map(source=>source.id),['SYNTHETIC_HUMAN_HISTORY']);
  f.history=[historicalText(),historyReceipt(1)];assert.equal((await f.transport.priorHistory(PHONE)).priorOutgoing,true);
});

test('historical receipts cannot prove absence with changed totals, changed anchor, incomplete pages or over one hundred rows',async t=>{
  for(const mode of ['total','anchor','short','over-limit']){
    const f=fixture(t);f.history=Array.from({length:mode==='over-limit'?101:51},(_,i)=>historyReceipt(i));
    f.response=(q,result)=>{
      if(q.offset===1||!result.total)return result;
      if(mode==='total')return {...result,total:result.total+1};
      if(mode==='anchor'&&q.page===1)return {...result,records:[{...result.records[0],status:'DELIVERY_ACK'},...result.records.slice(1)]};
      if(mode==='short')return {...result,records:result.records.slice(0,-1)};
      return result;
    };
    await assert.rejects(()=>f.transport.priorHistory(PHONE),/HISTORY_RESULT_UNVERIFIED/,mode);
  }
});

test('new receipt-only proof never releases or replays an existing historical human hold',async t=>{
  const f=fixture(t);f.prepare();f.store.savePriorHistory(PHONE,{cutoff:f.config.activatedAt,priorOutgoing:true,checks:[{line:FUMIGACION_BLUE,total:1}]},'SYNTHETIC_OLD_HOLD');
  const revision=f.store.conversation(PHONE).revision,body=f.out().body;
  f.history=[historyReceipt(1)];f.current=[receipt()];const check=await f.transport.priorHistory(PHONE);assert.equal(check.priorOutgoing,false);
  f.store.savePriorHistory(PHONE,check,'SYNTHETIC_NEW_PROOF');await f.transport.currentAttention(PHONE,{store:f.store});await flushOutbox(f.store,f.config,f.transport);
  assert.equal(f.store.conversation(PHONE).hold,1);assert.equal(f.store.conversation(PHONE).revision,revision);assert.equal(f.out().state,'SUPPRESSED_HUMAN');assert.equal(f.out().body,body);assert.equal(f.sent,0);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='EXPLICIT_RELEASE'").get().n,0);
});

async function seedStoredLid(f){
  const at=NOW-10000;
  const source={id:'SYNTHETIC_SOURCE_DB',instanceId:'SYNTHETIC_BLUE_INSTANCE',key:{id:'SYNTHETIC_STORED_CUSTOMER',remoteJid:LID,fromMe:false},messageTimestamp:at/1000,message:{conversation:'Nombre: Cliente Sintetico'},MessageUpdate:[{status:'DELIVERY_ACK'}]};
  const pair={id:'SYNTHETIC_PAIR_DB',instanceId:'SYNTHETIC_BLUE_INSTANCE',key:{id:'SYNTHETIC_IDENTITY_PAIR',remoteJid:LID,remoteJidAlt:PN,fromMe:true},messageTimestamp:(at-1000)/1000,message:{conversation:'Respuesta sintética'},MessageUpdate:[{status:'DELIVERY_ACK'}]};
  f.anchors=[source,pair];const body={instance:'cucaracha-azul',event:'messages.upsert',data:copy(source)},startedAt=at-5000;
  initializePrivateNativeCachePair(f.store,f.config,startedAt);
  const resolution=await resolveOwnBlueNativeIdentity(f.config,f.transport,body,{authenticated:true,startedAt,now:NOW});assert.equal(resolution.resolutions.length,1);
  assert.equal(recordPrivateNativeCachePairs(f.store,f.config,body,resolution,{startedAt,now:NOW}).recorded,1);
  const decoded=decodePrivateNativeCachePairs(f.store,f.config,body,{now:NOW});observePrivateIdentity(f.store,body,f.config,{events:decoded,deliveries:[]},NOW);
  const event=validateEvent(decoded[0],f.config,NOW);assert.ok(event);f.store.enqueue(event);f.store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(event.id);
  return pair;
}

test('stored verified LID uses the same empty receipt exception while retaining its real outgoing source',async t=>{
  const f=fixture(t),pair=await seedStoredLid(f);
  for(const status of ['READ','DELIVERY_ACK',3,4]){
    const row=receipt('SYNTHETIC_LID_READ',{key:{id:'SYNTHETIC_LID_READ',remoteJid:LID,fromMe:true},status});f.lid=[pair,row];
    const result=await f.transport.currentAttention(PHONE,{store:f.store});assert.equal(result.complete,true);assert.deepEqual(result.sources.map(source=>source.id),[pair.key.id]);
    assert.ok(result.checks.some(check=>check.addressField==='stored-native-lid'));
  }
  for(const patch of [{isEdited:true},{status:'EDITED'},{MessageUpdate:[{status:'EDITED'}]},{deleted:true},{update:{status:'DELETED'}},{message:{protocolMessage:{type:'REVOKE'}}}]){
    f.lid=[pair,receipt('SYNTHETIC_LID_MUTATION',{key:{id:'SYNTHETIC_LID_MUTATION',remoteJid:LID,fromMe:true},messageTimestamp:(NOW-1000)/1000,...patch})];
    const result=await f.transport.currentAttention(PHONE,{store:f.store});assert.equal(result.sources.length,2);assert.ok(result.sources[1].edited||result.sources[1].deleted);
  }
});

test('stored LID still blocks uncertain edits, conflicting PN, duplicate receipts and incomplete coverage',async t=>{
  for(const mode of ['edited','deleted','pn-conflict','duplicate','partial']){
    const f=fixture(t),pair=await seedStoredLid(f),row=receipt('SYNTHETIC_LID_UNCERTAIN',{key:{id:'SYNTHETIC_LID_UNCERTAIN',remoteJid:LID,fromMe:true}});
    if(mode==='edited')row.MessageUpdate=[{status:'EDITED'}];if(mode==='deleted')row.deleted=true;if(mode==='pn-conflict')row.key.remoteJidAlt='573000009992@s.whatsapp.net';
    f.lid=[pair,row];if(mode==='duplicate')f.lid.push(copy(row));
    if(mode==='partial')f.response=(q,result)=>q.where.key.remoteJid===LID&&q.where.key.fromMe===true?{...result,total:result.total+1}:result;
    await assert.rejects(()=>f.transport.currentAttention(PHONE,{store:f.store}),/STORED_NATIVE_LID_(?:SOURCE_UNVERIFIED|IDENTITY_CONFLICT|COVERAGE_UNVERIFIED)/,mode);
  }
});
