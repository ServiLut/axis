import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Transport,drain,MARIA_HISTORY_PROTOCOL_GUARD} from '../automation/service-bots/transport.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE,FUMIGACION_BLUE,FUMIGACION_RED,operationalHistoryGuard} from '../automation/service-bots/line-scope.mjs';

const customer='573001112233',pn=customer+'@s.whatsapp.net';
function fixture(company='fumigacion',options={}){
  const c={company,...BUSINESSES[company],enabled:true,activatedAt:Date.now()-60000,historyCheckRequired:true,provider:'https://isolated.invalid',
    lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company+'-fixture-'+i,apiKey:'isolated-'+i}))};
  const records=new Map(),calls=[];
  const t=new Transport(c,async(url,request)=>{
    const line=c.lines.find(l=>url.includes(l.instance));assert.ok(line,'own fixture instance');
    if(url.includes('fetchInstances'))return {ok:true,json:async()=>[{name:line.instance,ownerJid:(options.ownerPhone??line.phone)+'@s.whatsapp.net',connectionStatus:'open'}]};
    assert.ok(url.includes('findMessages'),'fixture has no sending or model route');
    const q=JSON.parse(request.body);calls.push({line:line.phone,q});
    if(Date.parse(q.where.messageTimestamp.gte)>=c.activatedAt)return {ok:true,json:async()=>({messages:{total:0,records:[]}})};
    const addressField=q.where.key.remoteJid?'remoteJid':'remoteJidAlt',all=records.get(line.phone+':'+addressField)||[];
    const standard={total:all.length,records:all.slice((q.page-1)*q.offset,q.page*q.offset)};
    const value=options.response?options.response(q,line,addressField,standard):standard;
    return {ok:true,json:async()=>({messages:value})};
  });
  return {c,t,records,calls};
}
function row(f,id,message,patch={}){
  return {key:{id,fromMe:true,remoteJid:pn,...patch.key},messageTimestamp:Math.floor((f.c.activatedAt-5000)/1000),
    ...(message===undefined?{}:{message}),...patch,key:{id,fromMe:true,remoteJid:pn,...patch.key}};
}
const protocol=(f,id='SYNC001',patch={})=>row(f,id,{protocolMessage:{type:'HISTORY_SYNC_NOTIFICATION'}},patch);
const many=(f,n)=>Array.from({length:n},(_,i)=>protocol(f,'SYNC'+String(i).padStart(3,'0')));
function set(f,records,addressField='remoteJid',line=f.c.lines[0]){f.records.set(line.phone+':'+addressField,records);return f;}
function reviewed(result){return result.checks.find(x=>x.protocolGuard===MARIA_HISTORY_PROTOCOL_GUARD);}

test('a sole exact synchronization packet is excluded only after a complete anchored FUM read',async()=>{
  const f=fixture();set(f,[protocol(f)]);const r=await f.t.priorHistory(customer),check=reviewed(r);
  assert.equal(r.priorOutgoing,false);assert.equal(r.guardVersion,operationalHistoryGuard(f.c));
  assert.equal(check.total,1);assert.equal(check.read,1);assert.equal(check.protocolCount,1);assert.equal(check.complete,true);
  assert.equal(check.lastSourceId,'SYNC001');assert.deepEqual(check.attentionSources,[]);assert.match(check.firstSourceHash,/^[a-f0-9]{64}$/);
  assert.equal(r.classificationScope,'explicit-native-synchronization-packets-and-outgoing-attention; no-complete-chat-history');
  assert.deepEqual(f.calls.map(x=>[x.q.offset,x.q.page]),[[1,1],[50,1],[1,1],[1,1],[1,1]]);
  for(const {q} of f.calls){assert.equal(q.where.key.remoteJid??q.where.key.remoteJidAlt,pn);assert.equal(q.where.key.fromMe,true);assert.equal(q.where.messageTimestamp.gte,'2000-01-01T00:00:00.000Z');assert.equal(Date.parse(q.where.messageTimestamp.lte),f.c.activatedAt-1);}
});

test('the complete protocol-only fallback may cover exactly two pages of fifty',async()=>{
  const f=fixture();set(f,many(f,100));const r=await f.t.priorHistory(customer);
  assert.equal(r.priorOutgoing,false);assert.equal(reviewed(r).read,100);assert.equal(reviewed(r).protocolCount,100);
  assert.deepEqual(f.calls.filter(x=>x.q.offset===50).map(x=>x.q.page),[1,2]);
});

test('an older human message on page two keeps attention despite the newest protocol',async()=>{
  const f=fixture(),records=many(f,50);records.push(row(f,'OLDERHUMAN',{conversation:'Ya estoy atendiendo esta solicitud.'}));set(f,records);
  const r=await f.t.priorHistory(customer);assert.equal(r.priorOutgoing,true);assert.equal(reviewed(r).read,51);
  assert.equal(reviewed(r).lastSourceId,'SYNC000');assert.deepEqual(reviewed(r).attentionSources.map(x=>x.id),['OLDERHUMAN']);
});

test('text, media, edit, revocation and unknown bodies in a fallback retain positive evidence',async t=>{
  const variants=[
    ['text',{message:{conversation:'Te estoy atendiendo.'}}],['media',{message:{audioMessage:{url:'https://media.invalid/audio'}}}],
    ['edited',{MessageUpdate:[{status:'EDITED'}]}],['revoked',{revoked:true}],['body absent',{message:undefined}],
    ['other protocol',{message:{protocolMessage:{type:'REVOKE'}}}],['wrapper',{message:{ephemeralMessage:{message:{protocolMessage:{type:'HISTORY_SYNC_NOTIFICATION'}}}}}],
    ['mixed',{message:{protocolMessage:{type:'HISTORY_SYNC_NOTIFICATION'},conversation:'Saliente humano'}}],
    ['unknown key',{message:{protocolMessage:{type:'HISTORY_SYNC_NOTIFICATION',unknown:'unverified'}}}]
  ];
  for(const [name,patch] of variants)await t.test(name,async()=>{const f=fixture();set(f,[protocol(f,'ANCHOR'),protocol(f,'ATTENTION',patch)]);const r=await f.t.priorHistory(customer);assert.equal(r.priorOutgoing,true);assert.deepEqual(reviewed(r).attentionSources.map(x=>x.id),['ATTENTION']);});
});

test('a mixed or unavailable first body follows the existing positive shortcut without protocol fallback',async t=>{
  const variants=[{message:{protocolMessage:{type:'HISTORY_SYNC_NOTIFICATION'},conversation:'Humano'}},{message:undefined},{status:'EDITED'},{MessageUpdate:{status:'EDITED'}},{messageType:'unknown'},{isEdited:true}];
  for(const [i,patch] of variants.entries())await t.test(String(i),async()=>{const f=fixture();set(f,[protocol(f,'FIRST',patch)]);const r=await f.t.priorHistory(customer);assert.equal(r.priorOutgoing,true);assert.equal(reviewed(r),undefined);assert.ok(f.calls.every(x=>x.q.offset===1));});
});

test('verified PN alternative with LID identity traverses its own protocol page',async()=>{
  const f=fixture();set(f,[protocol(f,'ALTLID',{key:{remoteJid:'12345678@lid',remoteJidAlt:pn}})],'remoteJidAlt');
  const r=await f.t.priorHistory(customer);assert.equal(r.priorOutgoing,false);assert.equal(reviewed(r).addressField,'remoteJidAlt');
  assert.equal(reviewed(r).lastSourceId,'ALTLID');
});

test('the same source may occur consistently under both explicit addressing forms',async()=>{
  const f=fixture(),source=protocol(f,'BOTHFORMS',{key:{remoteJidAlt:pn}});set(f,[source]);set(f,[structuredClone(source)],'remoteJidAlt');
  const r=await f.t.priorHistory(customer);assert.equal(r.priorOutgoing,false);assert.equal(r.checks.filter(x=>x.protocolGuard).length,2);
});

test('a source changed between addressing forms is unverified',async()=>{
  const f=fixture(),source=protocol(f,'BOTHFORMS',{key:{remoteJidAlt:pn}});set(f,[source]);set(f,[{...source,message:{conversation:'Cuerpo cambiado'}}],'remoteJidAlt');
  await assert.rejects(()=>f.t.priorHistory(customer),/HISTORY_RESULT_UNVERIFIED/);
});

test('source hash comparison ignores JSON key order but preserves source content',async()=>{
  const f=fixture('fumigacion',{response:(q,line,field,value)=>q.offset===50&&value.records.length?{...value,records:value.records.map(r=>({messageTimestamp:r.messageTimestamp,message:r.message,key:{remoteJid:r.key.remoteJid,fromMe:r.key.fromMe,id:r.key.id}}))}:value});
  set(f,[protocol(f)]);assert.equal((await f.t.priorHistory(customer)).priorOutgoing,false);
});

test('changing totals, an anchor mutation and premature or short pages cannot establish absence',async t=>{
  const variants=[
    ['total changes',q=>q.offset===50,{total:2,records:[]}],
    ['anchor missing',q=>q.offset===50,{total:1,records:[{key:{id:'OTHER',fromMe:true,remoteJid:pn},messageTimestamp:1}]}],
    ['anchor changes',q=>q.offset===50,null],
    ['empty page two',q=>q.offset===50&&q.page===2,{total:51,records:[]}],
    ['short page one',q=>q.offset===50&&q.page===1,null]
  ];
  for(const [name,when,replacement] of variants)await t.test(name,async()=>{
    const f=fixture('fumigacion',{response:(q,line,field,value)=>{
      if(!when(q)||!value.total)return value;
      if(name==='anchor changes')return {...value,records:[{...value.records[0],message:{conversation:'Nuevo cuerpo'}}]};
      if(name==='short page one')return {...value,records:value.records.slice(0,49)};
      return replacement;
    }});set(f,many(f,name.includes('page')?51:1));await assert.rejects(()=>f.t.priorHistory(customer),/HISTORY_RESULT_UNVERIFIED/);
  });
});

test('duplicate sources within or across pages cannot satisfy total coverage',async t=>{
  for(const across of [false,true])await t.test(across?'across pages':'within page',async()=>{
    const f=fixture(),records=many(f,across?51:2);records[records.length-1]=structuredClone(records[0]);set(f,records);
    await assert.rejects(()=>f.t.priorHistory(customer),/HISTORY_RESULT_UNVERIFIED/);
  });
});

test('the protocol fallback refuses more than one hundred sources without expanding its limit',async()=>{
  const f=fixture();set(f,many(f,101));await assert.rejects(()=>f.t.priorHistory(customer),/HISTORY_RESULT_UNVERIFIED/);assert.equal(f.calls.length,1);
});

test('each fallback row must retain phone identity, outgoing direction and the historical time window',async t=>{
  const variants=[
    ['other phone',{key:{remoteJid:'573009998877@s.whatsapp.net'}}],['conflicting alternative',{key:{remoteJidAlt:'573009998877@s.whatsapp.net'}}],
    ['incoming',{key:{fromMe:false}}],['missing MID',{key:{id:''}}],['future',{messageTimestamp:Math.floor(Date.now()/1000)}],
    ['before query start',{messageTimestamp:946684799}],['invalid timestamp',{messageTimestamp:'not-a-time'}]
  ];
  for(const [name,patch] of variants)await t.test(name,async()=>{const f=fixture();set(f,[protocol(f,'ANCHOR'),protocol(f,'BADROW',patch)]);await assert.rejects(()=>f.t.priorHistory(customer),/HISTORY_RESULT_UNVERIFIED/);});
});

test('a conflicting canonical phone under a matching LID alternative cannot be excluded',async()=>{
  const f=fixture();set(f,[protocol(f,'CONFLICT',{key:{remoteJid:'573009998877@s.whatsapp.net',remoteJidAlt:pn}})],'remoteJidAlt');
  await assert.rejects(()=>f.t.priorHistory(customer),/HISTORY_RESULT_UNVERIFIED/);
});

test('owner and first timestamp controls remain blocking',async()=>{
  const owner=fixture('fumigacion',{ownerPhone:'573009998877'});set(owner,[protocol(owner)]);await assert.rejects(()=>owner.t.priorHistory(customer),/CHANNEL_OWNER_MISMATCH/);
  const time=fixture();set(time,[protocol(time,'FUTURE',{messageTimestamp:Math.floor(Date.now()/1000)})]);await assert.rejects(()=>time.t.priorHistory(customer),/HISTORY_RESULT_OUTSIDE_SCOPE/);
});

test('Miguel retains the previous positive protocol result and offset-one queries',async()=>{
  const f=fixture('servicio-tecnico');set(f,[protocol(f)]);const r=await f.t.priorHistory(customer);
  assert.equal(r.priorOutgoing,true);assert.equal(reviewed(r),undefined);assert.equal(r.classificationScope,undefined);assert.ok(f.calls.every(x=>x.q.offset===1));assert.equal(r.guardVersion,operationalHistoryGuard(f.c));
});

test('the authorized blue-only route does not read or reconnect the suspended red line',async()=>{
  const f=fixture();f.c.operationalLineScope={company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[FUMIGACION_RED],authorizedAt:new Date(f.c.activatedAt+1000).toISOString(),reportedBlockedDurationHours:24};
  const blue=f.c.lines.find(x=>x.phone===FUMIGACION_BLUE);set(f,[protocol(f)],'remoteJid',blue);const r=await f.t.priorHistory(customer);
  assert.equal(r.priorOutgoing,false);assert.equal(r.checks.length,2);assert.ok(f.calls.every(x=>x.line===FUMIGACION_BLUE));assert.equal(r.guardVersion,operationalHistoryGuard(f.c));assert.equal(r.coverage.fullCompanyCoverageComplete,false);
});

test('history failure enters review without a send or automatic polling retry',async()=>{
  const f=fixture('fumigacion',{response:(q,line,field,value)=>q.offset===50&&value.total?{total:value.total,records:[]}:value});set(f,[protocol(f)]);
  const s=new Store(':memory:',f.c.company,randomBytes(32)),e=new Engine(s,f.c);let sends=0,models=0;f.t.send=async()=>{sends++;return 'NOT-SENT';};f.t.understand=async()=>{models++;return {};};
  try{const event={id:'NEW-HISTORY-FAIL',phone:customer,line:f.c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',text:'Hola'};s.enqueue(event);await drain(s,f.c,f.t,e);const calls=f.calls.length;await drain(s,f.c,f.t,e);
    assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get(event.id).state,'HISTORY_REVIEW');assert.equal(sends,0);assert.equal(models,0);assert.equal(f.calls.length,calls);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  }finally{s.close();}
});

test('new protocol-only proof never clears an existing human hold',async()=>{
  const f=fixture();set(f,[protocol(f)]);const s=new Store(':memory:',f.c.company,randomBytes(32));
  try{const event={id:'HELD-CONTACT',phone:customer,line:f.c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',text:'Hola'};s.enqueue(event);s.hold(customer,'HUMAN-OWN-SOURCE');const before=s.conversation(customer).revision;
    s.savePriorHistory(customer,await f.t.priorHistory(customer),event.id);assert.equal(s.priorHistory(customer).priorOutgoing,false);assert.equal(s.conversation(customer).hold,1);assert.equal(s.conversation(customer).revision,before);
  }finally{s.close();}
});

test('an existing cached history hold remains cached and is not reclassified or released',async()=>{
  const f=fixture(),s=new Store(':memory:',f.c.company,randomBytes(32)),e=new Engine(s,f.c);let sends=0;f.t.send=async()=>{sends++;return 'NOT-SENT';};
  try{const event={id:'CACHED-HELD',phone:customer,line:f.c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',text:'Hola'};s.enqueue(event);
    const old={cutoff:f.c.activatedAt,guardVersion:operationalHistoryGuard(f.c),priorOutgoing:true,checks:[{line:f.c.lines[0].phone,total:1,lastSourceId:'HISTORICAL-PROTOCOL'}]};s.savePriorHistory(customer,old,'PRIOR-OWN-CHECK');await drain(s,f.c,f.t,e);
    assert.deepEqual(s.priorHistory(customer),old);assert.equal(s.conversation(customer).hold,1);assert.equal(f.calls.length,0);assert.equal(sends,0);assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get(event.id).state,'OBSERVED_HUMAN');
  }finally{s.close();}
});
