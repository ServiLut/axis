import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {
  resolveOwnBlueNativeIdentity,verifyStoredNativeIdentitySource,listStoredNativeIdentitySources,
  nativeIdentityEvidenceHash,NATIVE_IDENTITY_RESOLUTION_GUARD,
} from '../automation/service-bots/native-identity-resolution.mjs';
import {
  initializePrivateNativeCachePair,prospectivePrivateNativeCacheBody,recordPrivateNativeCachePairs,
  decodePrivateNativeCachePairs,decodeWebhook,observePrivateIdentity,
} from '../automation/service-bots/webhook.mjs';
import {
  FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED,DUAL_LINE_SCOPE_VERSION,DUAL_LINE_AUTHORIZATION_SOURCE,
  BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE,
} from '../automation/service-bots/line-scope.mjs';

// Local encrypted in-memory SQLite and memory-only provider doubles. No HTTP,
// models, messages, business rows, permissions, live owners or real contacts.
const ACTIVATED=Date.parse('2026-10-08T18:00:00.000Z');
const BLUE_START='2026-10-09T21:46:58.000Z',RED_START='2026-10-19T20:00:00.000Z';
const CUT=Date.parse(RED_START),AT=CUT+5000,INSTALLED=Date.parse('2026-10-16T18:00:00.000Z');
const PHONE='573000008432',LID='123456789008432@lid';
const copy=structuredClone;
const suffix=(line,id)=>createHash('sha256').update(line+':'+id).digest('hex');
const proofKey=(line,id)=>'private-native-cache-pair-proof:'+suffix(line,id);
function fixture(t,{line=RED,startedAt=INSTALLED}={}){
  const clock={now:AT+1000};t.mock.method(Date,'now',()=>clock.now);
  const store=new Store(':memory:','fumigacion',randomBytes(32));t.after(()=>store.close());
  const config={company:'fumigacion',name:'FUMIGACION',enabled:true,activatedAt:ACTIVATED,
    lines:[{phone:BLUE,instance:'cucaracha-azul'},{phone:RED,instance:'cucaracha-roja'}],
    operationalLineScope:{company:'fumigacion',version:DUAL_LINE_SCOPE_VERSION,authorizationSource:DUAL_LINE_AUTHORIZATION_SOURCE,
      activeLines:[BLUE,RED],suspendedLines:[],authorizedAt:BLUE_START,lineStartsAt:{[BLUE]:BLUE_START,[RED]:RED_START}}};
  const instance=line===RED?'cucaracha-roja':'cucaracha-azul';
  const current={id:'SYNTHETIC_CURRENT_DB',instanceId:'SYNTHETIC_'+instance,key:{id:'SYNTHETIC_DUAL_CURRENT',remoteJid:LID,fromMe:false},messageTimestamp:AT/1000,message:{conversation:'Hola, quisiera una cotización'},instance,line,owner:line};
  const pair={id:'SYNTHETIC_PAIR_DB',instanceId:'SYNTHETIC_'+instance,key:{id:'SYNTHETIC_DUAL_PAIR',remoteJid:LID,remoteJidAlt:PHONE+'@s.whatsapp.net',fromMe:true},messageTimestamp:(CUT+1000)/1000,message:{conversation:'Respuesta sintética anterior'},status:'DELIVERY_ACK',instance,line,owner:line};
  const rows=[copy(current),copy(pair)],body={event:'messages.upsert',instance,data:current},calls=[];
  let ownerOverride=null,pageOverride=null;
  const transport={config,verifyLine:async phone=>{
    calls.push({kind:'owner',phone});
    return ownerOverride?ownerOverride(phone):{phone,instance:phone===RED?'cucaracha-roja':'cucaracha-azul',open:true,ownerVerified:true,checkedAt:new Date(clock.now).toISOString()};
  },request:async(own,route,request)=>{
    calls.push({kind:'native',phone:own.phone,instance:own.instance,route,request:copy(request)});
    if(pageOverride)return pageOverride(own,route,request);
    const found=request.where.key.id?rows.filter(row=>row.key.id===request.where.key.id):rows;
    return {messages:{total:found.length,records:copy(found)}};
  }};
  assert.equal(initializePrivateNativeCachePair(store,config,startedAt),startedAt);
  const startRow=store.db.prepare("SELECT value FROM meta WHERE key='private-native-cache-pair-start:v1'").get().value;
  const resolve=()=>resolveOwnBlueNativeIdentity(config,transport,body,{authenticated:true,startedAt,now:clock.now});
  const prospective=()=>prospectivePrivateNativeCacheBody(store,config,body,{startedAt,now:clock.now});
  const meta=key=>{const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?store.open(row.value):null;};
  async function prepare(){
    const result=await resolve();assert.equal(result.resolutions.length,1);
    assert.equal(recordPrivateNativeCachePairs(store,config,body,result,{startedAt,now:clock.now}).recorded,1);
    const decoded=decodePrivateNativeCachePairs(store,config,body,{now:clock.now});assert.equal(decoded.length,1);
    observePrivateIdentity(store,body,config,{events:decoded},clock.now);
    const event={...decoded[0].event,line:decoded[0].owner,at:AT};store.enqueue(event);
    store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(event.id);
    return {result,decoded,event};
  }
  return {clock,config,store,line,instance,body,current,pair,rows,calls,transport,startedAt,startRow,resolve,prospective,meta,prepare,
    setOwner:fn=>{ownerOverride=fn;},setPage:fn=>{pageOverride=fn;}};
}

test('new RED LID resolves from its exact current native source and its own post-authorization pair',async t=>{
  const f=fixture(t),original=JSON.stringify(f.body),result=await f.resolve();
  assert.equal(result.resolutions.length,1);assert.deepEqual(result.unresolved,[]);
  const resolution=result.resolutions[0],proof=resolution.proof;
  assert.equal(resolution.line,RED);assert.equal(resolution.instance,'cucaracha-roja');assert.equal(resolution.phone,PHONE);
  assert.equal(proof.startsAt,CUT);assert.equal(proof.owner.phone,RED);assert.equal(proof.owner.instance,'cucaracha-roja');
  assert.equal(proof.originalKeyPreserved,true);assert.equal(proof.phoneInferred,false);assert.equal(result.historicalCoverageComplete,false);
  const {proofHash,...unsigned}=proof;assert.equal(proofHash,nativeIdentityEvidenceHash(unsigned));
  assert.deepEqual(f.calls.filter(call=>call.kind==='owner').map(call=>call.phone),[RED,RED]);
  assert.ok(f.calls.every(call=>call.phone===RED));
  assert.equal(f.calls.find(call=>call.kind==='native').route,'/chat/findMessages/cucaracha-roja');
  assert.equal(f.calls.find(call=>call.kind==='native').request.where.messageTimestamp.gte,RED_START);
  assert.equal(JSON.stringify(f.body),original);assert.equal(f.body.data.key.remoteJidAlt,undefined);
});

test('RED proof, immutable identity metadata and later read-only verification are scoped to RED, without moving legacy start',async t=>{
  const f=fixture(t),{event}=await f.prepare();
  assert.equal(f.meta(proofKey(RED,event.id)).firstInstalledAt,CUT);
  assert.equal(f.meta(proofKey(BLUE,event.id)),null);
  assert.equal(f.store.db.prepare("SELECT value FROM meta WHERE key='private-native-cache-pair-start:v1'").get().value,f.startRow);
  f.clock.now=AT+600000;f.calls.length=0;
  const verified=await verifyStoredNativeIdentitySource(f.store,f.config,f.transport,event,copy(f.rows[0]));
  assert.equal(verified?.verified,true);assert.equal(verified.line,RED);assert.equal(verified.phone,PHONE);
  assert.ok(f.calls.every(call=>call.phone===RED));
  assert.deepEqual(listStoredNativeIdentitySources(f.store,f.config,{phone:PHONE,line:RED,since:ACTIVATED,through:f.clock.now}).map(item=>item.id),[event.id]);
  assert.deepEqual(listStoredNativeIdentitySources(f.store,f.config,{phone:PHONE,line:BLUE,since:ACTIVATED,through:f.clock.now}),[]);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
});

test('a later installation is a second RED cutoff and cannot recover an earlier callback',async t=>{
  const f=fixture(t,{startedAt:CUT+2000});
  assert.equal((await f.resolve()).resolutions[0].proof.startsAt,CUT+2000);
  f.current.messageTimestamp=(CUT+1000)/1000;
  assert.equal(f.prospective(),null);assert.equal((await f.resolve()).resolutions.length,0);
});

for(const mode of ['blue-only','missing-scope','wrong-version','wrong-authorization','wrong-red-instance','red-not-active','changed-blue-cut','missing-red-cut'])test('RED requires the complete separately authorized exact dual-line scope: '+mode,async t=>{
  const f=fixture(t),scope=f.config.operationalLineScope;
  if(mode==='blue-only')f.config.operationalLineScope={company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[BLUE],suspendedLines:[RED],authorizedAt:BLUE_START};
  if(mode==='missing-scope')delete f.config.operationalLineScope;
  if(mode==='wrong-version')scope.version='unapproved-dual';
  if(mode==='wrong-authorization')scope.authorizationSource='inferred-from-connected';
  if(mode==='wrong-red-instance')f.config.lines[1].instance='another-instance';
  if(mode==='red-not-active')scope.activeLines=[BLUE];
  if(mode==='changed-blue-cut')scope.lineStartsAt[BLUE]='2026-10-10T21:46:58.000Z';
  if(mode==='missing-red-cut')delete scope.lineStartsAt[RED];
  assert.equal(f.prospective(),null);assert.equal((await f.resolve()).resolutions.length,0);
  assert.equal(f.calls.length,0);
});

for(const mode of ['owner-phone','owner-instance','owner-closed','owner-stale','owner-after-change'])test('RED owner must be exact and fresh before and after the native read: '+mode,async t=>{
  const f=fixture(t);let reads=0;f.setOwner(phone=>({phone:mode==='owner-phone'?BLUE:phone,instance:mode==='owner-instance'?'cucaracha-azul':'cucaracha-roja',open:mode!=='owner-closed'&&!(mode==='owner-after-change'&&++reads===2),ownerVerified:true,checkedAt:new Date(f.clock.now-(mode==='owner-stale'?30001:0)).toISOString()}));
  const result=await f.resolve();assert.equal(result.resolutions.length,0);assert.match(result.unresolved[0].reason,/OWN_RED_NATIVE_OWNER/);
});

for(const mode of ['callback-before-cut','pair-before-cut','native-source-blue','native-pair-blue','callback-blue','blue-instance-source','blue-instance-pair'])test('RED cannot borrow old or other-line source identity: '+mode,async t=>{
  const f=fixture(t);
  if(mode==='callback-before-cut'){f.current.messageTimestamp=(CUT-1000)/1000;f.rows[0]=copy(f.current);}
  if(mode==='pair-before-cut')f.rows[1].messageTimestamp=(CUT-1000)/1000;
  if(mode==='native-source-blue')f.rows[0].owner=BLUE;
  if(mode==='native-pair-blue')f.rows[1].line=BLUE;
  if(mode==='callback-blue')f.current.line=BLUE;
  if(mode==='blue-instance-source')f.rows[0].instance='cucaracha-azul';
  if(mode==='blue-instance-pair')f.rows[1].instance='cucaracha-azul';
  const result=await f.resolve();assert.equal(result.resolutions.length,0);
  if(mode==='callback-before-cut')assert.equal(f.prospective(),null);
});

for(const mode of ['unmapped','two-pns','body-phone','push-name','different-lid','partial-page','wrong-body','edited-pair'])test('RED identity preserves complete native proof requirements: '+mode,async t=>{
  const f=fixture(t);
  if(mode==='unmapped')f.rows.splice(1);
  if(mode==='two-pns')f.rows.push({...copy(f.rows[1]),key:{...f.rows[1].key,id:'SYNTHETIC_CONFLICT_PAIR',remoteJidAlt:'573000008433@s.whatsapp.net'}});
  if(mode==='body-phone'){f.rows.splice(1);f.current.message.conversation='Mi teléfono es '+PHONE;f.rows[0]=copy(f.current);}
  if(mode==='push-name'){f.rows.splice(1);f.rows[0].pushName=PHONE;}
  if(mode==='different-lid')f.rows[1].key.remoteJid='987654321008432@lid';
  if(mode==='partial-page')f.setPage(()=>({messages:{total:3,records:copy(f.rows)}}));
  if(mode==='wrong-body')f.rows[0].message.conversation='Otro mensaje';
  if(mode==='edited-pair')f.rows[1].edited=true;
  assert.equal((await f.resolve()).resolutions.length,0);
});

test('RED read/status callbacks and empty READ upserts cannot create identity or staff text events',async t=>{
  const f=fixture(t);f.body.event='messages.update';f.body.data={key:{id:f.current.key.id,remoteJid:LID,fromMe:true},status:'READ'};
  assert.equal(f.prospective(),null);assert.equal((await f.resolve()).resolutions.length,0);
  assert.equal(decodeWebhook(f.body,f.config).events.length,0);assert.equal(f.calls.length,0);
  f.body.event='messages.upsert';f.body.data={key:{id:'SYNTHETIC_RED_EMPTY_READ',remoteJid:LID,fromMe:false},messageTimestamp:AT/1000,message:{},status:'READ'};
  assert.equal((await f.resolve()).resolutions.length,0);assert.equal(f.calls.length,0);
  assert.deepEqual(decodePrivateNativeCachePairs(f.store,f.config,f.body,{now:f.clock.now}),[]);
});

test('BLUE guard, original durable start and native query history remain unchanged under valid dual scope',async t=>{
  const f=fixture(t,{line:BLUE}),result=await f.resolve();
  assert.equal(result.guard,NATIVE_IDENTITY_RESOLUTION_GUARD);assert.equal(result.resolutions.length,1);
  assert.equal(result.resolutions[0].proof.startsAt,INSTALLED);
  assert.equal(f.calls.find(call=>call.kind==='native').request.where.messageTimestamp.gte,new Date(ACTIVATED).toISOString());
  assert.ok(f.calls.every(call=>call.phone===BLUE));
});

test('an existing BLUE proof cannot be decoded, recorded or borrowed for RED even with the same native MID',async t=>{
  const f=fixture(t,{line:BLUE}),{result}=await f.prepare();
  const redBody={...f.body,instance:'cucaracha-roja',data:{...copy(f.current),line:RED,owner:RED,instance:'cucaracha-roja'}};
  assert.equal(recordPrivateNativeCachePairs(f.store,f.config,redBody,result,{startedAt:f.startedAt,now:f.clock.now}).recorded,0);
  assert.deepEqual(decodePrivateNativeCachePairs(f.store,f.config,redBody,{now:f.clock.now}),[]);
});

for(const mode of ['owner','instance','hash','cut','body','red-suspended'])test('stored RED proof cannot survive changed scope, source or ownership: '+mode,async t=>{
  const f=fixture(t),{event}=await f.prepare();f.clock.now=AT+600000;
  if(mode==='owner')f.setOwner(phone=>({phone:BLUE,instance:'cucaracha-roja',open:true,ownerVerified:true,checkedAt:new Date(f.clock.now).toISOString()}));
  if(mode==='instance')f.rows[0].instance='cucaracha-azul';
  if(mode==='body')f.rows[0].message.conversation='Cambio de contenido';
  if(mode==='hash'){const value=f.meta(proofKey(RED,event.id));value.proof.phone='573000008433';f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.store.seal(value),proofKey(RED,event.id));}
  if(mode==='cut')f.config.operationalLineScope.lineStartsAt[RED]='2026-10-19T20:00:04.000Z';
  if(mode==='red-suspended')f.config.operationalLineScope={company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[BLUE],suspendedLines:[RED],authorizedAt:BLUE_START};
  assert.equal(await verifyStoredNativeIdentitySource(f.store,f.config,f.transport,event),null);
  if(mode==='hash'||mode==='cut')assert.throws(()=>listStoredNativeIdentitySources(f.store,f.config,{phone:PHONE,line:RED,since:ACTIVATED,through:f.clock.now}),/STORED_NATIVE_IDENTITY_COVERAGE_UNVERIFIED/);
});
