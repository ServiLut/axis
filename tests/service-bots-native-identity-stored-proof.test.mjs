import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {validateEvent} from '../automation/service-bots/config.mjs';
import {
  resolveOwnBlueNativeIdentity,verifyStoredNativeIdentitySource,listStoredNativeIdentitySources,
  nativeIdentityEvidenceHash,NATIVE_IDENTITY_MAX_AGE_MS,NATIVE_IDENTITY_STORED_FINGERPRINT_VERSION,
} from '../automation/service-bots/native-identity-resolution.mjs';
import {
  initializePrivateNativeCachePair,recordPrivateNativeCachePairs,decodePrivateNativeCachePairs,observePrivateIdentity,
} from '../automation/service-bots/webhook.mjs';
import {FUMIGACION_BLUE,FUMIGACION_RED,BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';

// In-memory runtime/provider doubles only. No network, business records, real
// identities, models, credentials, replay route or production hold changes.
const SOURCE=Date.parse('2026-10-16T18:00:00.000Z'),PHONE='573000009321',LID='123456789000321@lid';
const suffix=id=>createHash('sha256').update(FUMIGACION_BLUE+':'+id).digest('hex');
const proofKey=id=>'private-native-cache-pair-proof:'+suffix(id);
const identityKey=id=>'private-native-identity:'+suffix(id);
const copy=value=>structuredClone(value);

async function fixture(t){
  const clock={now:SOURCE+1000};t.mock.method(Date,'now',()=>clock.now);
  const store=new Store(':memory:','fumigacion',randomBytes(32));t.after(()=>store.close());
  const config={company:'fumigacion',name:'FUMIGACION',enabled:true,activatedAt:SOURCE-3600000,
    lines:[{phone:FUMIGACION_BLUE,instance:'cucaracha-azul'},{phone:FUMIGACION_RED,instance:'cucaracha-roja'}],
    operationalLineScope:{company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[FUMIGACION_RED],authorizedAt:new Date(SOURCE-3590000).toISOString()}};
  const source={id:'SYNTHETIC_SOURCE_DB',instanceId:'SYNTHETIC_BLUE_INSTANCE',key:{id:'STORED_NATIVE_CUSTOMER_SOURCE',remoteJid:LID,fromMe:false,addressingMode:'lid'},messageTimestamp:SOURCE/1000,message:{conversation:'Nombre: Cliente Sintetico'},contextInfo:{},MessageUpdate:[{status:'DELIVERY_ACK'}]};
  const pair={id:'SYNTHETIC_PAIR_DB',instanceId:'SYNTHETIC_BLUE_INSTANCE',key:{id:'STORED_NATIVE_EXPLICIT_PAIR',remoteJid:LID,remoteJidAlt:PHONE+'@s.whatsapp.net',fromMe:true},messageTimestamp:(SOURCE-1000)/1000,message:{conversation:'Respuesta sintética'},MessageUpdate:[{status:'DELIVERY_ACK'}]};
  const body={instance:'cucaracha-azul',event:'messages.upsert',data:copy(source)},rows=[copy(source),copy(pair)],calls=[];
  let ownerOverride=null,requestOverride=null;
  const transport={config,verifyLine:async phone=>{calls.push({kind:'owner',phone});return ownerOverride?ownerOverride(phone):{phone,instance:'cucaracha-azul',open:true,ownerVerified:true,checkedAt:new Date(clock.now).toISOString()};},request:async(line,route,request)=>{
    calls.push({kind:'native',phone:line.phone,instance:line.instance,route,request});
    if(requestOverride)return requestOverride(line,route,request);
    const selected=request.where?.key?.id?rows.filter(row=>row.key.id===request.where.key.id):rows;
    return {messages:{total:selected.length,records:copy(selected)}};
  }};
  const startedAt=SOURCE-5000;initializePrivateNativeCachePair(store,config,startedAt);
  const resolution=await resolveOwnBlueNativeIdentity(config,transport,body,{authenticated:true,startedAt,now:clock.now});
  assert.equal(resolution.resolutions.length,1);
  assert.equal(recordPrivateNativeCachePairs(store,config,body,resolution,{startedAt,now:clock.now}).recorded,1);
  const decoded=decodePrivateNativeCachePairs(store,config,body,{now:clock.now});assert.equal(decoded.length,1);
  observePrivateIdentity(store,body,config,{events:decoded,deliveries:[]},clock.now);
  const event=validateEvent(decoded[0],config,clock.now);assert.ok(event);store.enqueue(event);
  store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(event.id);
  const expected={...event};
  const meta=key=>{const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?store.open(row.value):null;};
  const setMeta=(key,value)=>store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal(value),key);
  function changeProof(mutator){const value=meta(proofKey(event.id));mutator(value);const {proofHash,...unsigned}=value.proof;value.proof.proofHash=nativeIdentityEvidenceHash(unsigned);setMeta(proofKey(event.id),value);const identity=meta(identityKey(event.id));identity.proofHash=value.proof.proofHash;setMeta(identityKey(event.id),identity);}
  const snapshot=()=>JSON.stringify(Object.fromEntries(['events','event_sources','meta','outbox','audit','conversations'].map(table=>[table,store.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()])));
  calls.length=0;clock.now=SOURCE+600000;
  const verify=(provided=undefined)=>verifyStoredNativeIdentitySource(store,config,transport,expected,provided);
  const list=()=>listStoredNativeIdentitySources(store,config,{phone:PHONE,line:FUMIGACION_BLUE,since:config.activatedAt,through:clock.now});
  return {clock,store,config,source,pair,body,rows,event,expected,calls,transport,resolution,meta,setMeta,changeProof,snapshot,verify,list,setOwner:fn=>{ownerOverride=fn;},setRequest:fn=>{requestOverride=fn;}};
}

test('already processed source older than ingress freshness is verified read-only through separate new proof',async t=>{
  const f=await fixture(t),before=f.snapshot(),result=await f.verify(copy(f.rows[0]));
  assert.ok(f.clock.now-f.event.at>NATIVE_IDENTITY_MAX_AGE_MS);assert.equal(result?.verified,true);assert.equal(result.readOnly,true);assert.equal(result.sourceId,f.event.id);assert.equal(result.phone,PHONE);assert.equal(result.lid,LID);assert.equal(result.record.key.remoteJidAlt,undefined);
  assert.equal(f.snapshot(),before);assert.equal(JSON.stringify(f.body.data),JSON.stringify(f.source));
  assert.deepEqual(f.calls.filter(call=>call.kind==='owner').map(call=>call.phone),[FUMIGACION_BLUE,FUMIGACION_BLUE]);
  assert.ok(f.calls.every(call=>call.phone===FUMIGACION_BLUE));assert.equal(f.calls.filter(call=>call.kind==='native').length,2);
});

test('new immutable fingerprints are explicitly versioned without changing full legacy source-hash meaning',async t=>{
  const f=await fixture(t),proof=f.resolution.resolutions[0].proof;
  assert.equal(proof.immutableFingerprintVersion,NATIVE_IDENTITY_STORED_FINGERPRINT_VERSION);
  assert.equal(proof.sourceHash,nativeIdentityEvidenceHash({id:f.source.id,instanceId:f.source.instanceId,key:f.source.key,messageTimestamp:SOURCE,message:f.source.message,contextInfo:f.source.contextInfo,status:null,MessageUpdate:f.source.MessageUpdate}));
  assert.match(proof.sourceImmutableHash,/^[a-f0-9]{64}$/);assert.match(proof.pairSources[0].immutableHash,/^[a-f0-9]{64}$/);
});

test('delivery progression on source and explicit pair preserves immutable body proof',async t=>{
  const f=await fixture(t);f.rows[0].MessageUpdate.push({status:'READ'});f.rows[1].MessageUpdate.push({status:'READ'});f.rows[1].status='READ';
  assert.equal((await f.verify())?.verified,true);
});

test('pure enumeration exposes only matching processed own-phone proof sources',async t=>{
  const f=await fixture(t),before=f.snapshot();assert.deepEqual(f.list(),[{id:f.event.id,phone:PHONE,line:FUMIGACION_BLUE,lid:LID,at:SOURCE,proofHash:f.resolution.resolutions[0].proof.proofHash}]);
  assert.deepEqual(listStoredNativeIdentitySources(f.store,f.config,{phone:'573000009322',line:FUMIGACION_BLUE,since:f.config.activatedAt,through:f.clock.now}),[]);
  assert.deepEqual(listStoredNativeIdentitySources(f.store,f.config,{phone:PHONE,line:FUMIGACION_RED,since:f.config.activatedAt,through:f.clock.now}),[]);
  assert.deepEqual(listStoredNativeIdentitySources(f.store,f.config,{phone:PHONE,line:FUMIGACION_BLUE,since:SOURCE+1,through:f.clock.now}),[]);
  assert.equal(f.calls.length,0);assert.equal(f.snapshot(),before);
});

for(const mode of ['missing-event','pending','processing','missing-proof','unresolved-marker','missing-start','old-unversioned-proof','stale-proof-at-creation','future-proof','forged-proof-hash','internal-authority'])test('missing, historical, unprocessed or invalid provenance is never promoted: '+mode,async t=>{
  const f=await fixture(t);
  if(mode==='missing-event'){f.store.db.prepare('DELETE FROM event_sources WHERE event_id=?').run(f.event.id);f.store.db.prepare('DELETE FROM events WHERE id=?').run(f.event.id);}
  if(mode==='pending'||mode==='processing')f.store.db.prepare('UPDATE events SET state=? WHERE id=?').run(mode.toUpperCase(),f.event.id);
  if(mode==='missing-proof')f.store.db.prepare('DELETE FROM meta WHERE key=?').run(proofKey(f.event.id));
  if(mode==='unresolved-marker'){const value=f.meta(identityKey(f.event.id));value.state='UNRESOLVED';f.setMeta(identityKey(f.event.id),value);}
  if(mode==='missing-start')f.store.db.prepare("DELETE FROM meta WHERE key='private-native-cache-pair-start:v1'").run();
  if(mode==='old-unversioned-proof')f.changeProof(value=>{delete value.proof.immutableFingerprintVersion;delete value.proof.sourceImmutableHash;for(const pair of value.proof.pairSources)delete pair.immutableHash;});
  if(mode==='stale-proof-at-creation')f.changeProof(value=>{value.proof.checkedAt=SOURCE+NATIVE_IDENTITY_MAX_AGE_MS+1;value.recordedAt=value.proof.checkedAt;});
  if(mode==='future-proof')f.changeProof(value=>{value.proof.checkedAt=f.clock.now+1;value.recordedAt=f.clock.now+1;});
  if(mode==='forged-proof-hash'){const value=f.meta(proofKey(f.event.id));value.proof.phone='573000009322';f.setMeta(proofKey(f.event.id),value);}
  if(mode==='internal-authority')f.changeProof(value=>{value.authority='chief';});
  const before=f.snapshot();assert.equal(await f.verify(),null);assert.throws(()=>f.list(),/STORED_NATIVE_IDENTITY_COVERAGE_UNVERIFIED/);assert.equal(f.snapshot(),before);assert.equal(f.calls.length,0);
});

test('an unreadable stored provenance artifact cannot silently disappear from coverage',async t=>{
  const f=await fixture(t);f.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run('invalid-ciphertext',proofKey(f.event.id));
  const before=f.snapshot();assert.equal(await f.verify(),null);assert.throws(()=>f.list(),/STORED_NATIVE_IDENTITY_COVERAGE_UNVERIFIED/);assert.equal(f.snapshot(),before);
});

for(const [field,value] of [['phone','573000009322'],['line',FUMIGACION_RED],['id','ANOTHER_SOURCE_MID'],['text','Other text'],['at',SOURCE+1000],['kind','audio'],['fromMe',true],['forwarded',true],['quotedId','UNRELATED_NATIVE_QUOTE']])test('expected processed source must match exactly: '+field,async t=>{
  const f=await fixture(t);f.expected[field]=value;assert.equal(await f.verify(),null);assert.equal(f.calls.length,0);
});

for(const mode of ['source-text','source-key','source-time','source-direction','source-forwarded','source-edited','source-deleted','source-new-pn','source-instance','pair-text','pair-pn','pair-lid','pair-direction','pair-time','pair-forwarded','pair-edited','pair-ack-lost','pair-missing','pair-duplicate','new-conflicting-pn'])test('fresh native source or pair changes block stored identity: '+mode,async t=>{
  const f=await fixture(t),source=f.rows[0],pair=f.rows[1];
  if(mode==='source-text')source.message.conversation='Changed body';if(mode==='source-key')source.key.addressingMode='pn';if(mode==='source-time')source.messageTimestamp+=1;if(mode==='source-direction')source.key.fromMe=true;
  if(mode==='source-forwarded')source.contextInfo={isForwarded:true};if(mode==='source-edited')source.MessageUpdate.push({status:'EDITED'});if(mode==='source-deleted')source.deleted=true;if(mode==='source-new-pn')source.key.remoteJidAlt='573000009322@s.whatsapp.net';if(mode==='source-instance')source.instanceId='OTHER_INSTANCE';
  if(mode==='pair-text')pair.message.conversation='Changed pair body';if(mode==='pair-pn')pair.key.remoteJidAlt='573000009322@s.whatsapp.net';if(mode==='pair-lid')pair.key.remoteJid='99999999999999@lid';if(mode==='pair-direction')pair.key.fromMe=false;if(mode==='pair-time')pair.messageTimestamp-=1;
  if(mode==='pair-forwarded')pair.contextInfo={isForwarded:true};if(mode==='pair-edited')pair.MessageUpdate.push({status:'EDITED'});if(mode==='pair-ack-lost')pair.MessageUpdate=[{status:'SERVER_ACK'}];if(mode==='pair-missing')f.rows.splice(1,1);if(mode==='pair-duplicate')f.rows.push(copy(pair));
  if(mode==='new-conflicting-pn')f.rows.push({...copy(pair),key:{...pair.key,id:'NEW_CONFLICTING_NATIVE_PAIR',remoteJidAlt:'573000009322@s.whatsapp.net'}});
  const before=f.snapshot();assert.equal(await f.verify(),null);assert.equal(f.snapshot(),before);
});

test('caller-provided native source must also match the independently refreshed body',async t=>{
  const f=await fixture(t),provided=copy(f.source);provided.message.conversation='Caller supplied another body';assert.equal(await f.verify(provided),null);
});

for(const mode of ['wrong-owner','closed-owner','stale-owner','owner-after-change','native-error','partial-pair-page','duplicate-source','other-transport','disabled','wrong-company'])test('owner, cache coverage and own runtime scope remain mandatory: '+mode,async t=>{
  const f=await fixture(t);
  if(mode.includes('owner')){let reads=0;f.setOwner(phone=>({phone:mode==='wrong-owner'?'573000009322':phone,instance:'cucaracha-azul',open:mode!=='closed-owner'&&!(mode==='owner-after-change'&&++reads===2),ownerVerified:true,checkedAt:new Date(mode==='stale-owner'?f.clock.now-30001:f.clock.now).toISOString()}));}
  if(mode==='native-error')f.setRequest(()=>{throw Error('synthetic read failure');});
  if(mode==='partial-pair-page')f.setRequest((line,route,request)=>({messages:{total:request.where.key.id?1:3,records:request.where.key.id?[copy(f.rows[0])]:copy(f.rows)}}));
  if(mode==='duplicate-source')f.rows.push(copy(f.rows[0]));if(mode==='other-transport')f.transport.config={...f.config};if(mode==='disabled')f.config.enabled=false;if(mode==='wrong-company')f.config.company='servicio-tecnico';
  assert.equal(await f.verify(),null);
});

test('unrelated LID overfetch is not borrowed as a phone pair',async t=>{
  const f=await fixture(t);f.rows.push({...copy(f.pair),key:{...f.pair.key,id:'OTHER_LID_SOURCE',remoteJid:'99999999999999@lid',remoteJidAlt:'573000009322@s.whatsapp.net'}});
  assert.equal((await f.verify())?.verified,true);
});

test('a stored event change during native awaits invalidates the decision without restoration or replay',async t=>{
  const f=await fixture(t);let calls=0;f.setRequest((line,route,request)=>{if(++calls===2){const changed={...f.event,text:'Changed stored source'};f.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.store.seal(changed),f.event.id);}return {messages:{total:request.where.key.id?1:2,records:request.where.key.id?[copy(f.rows[0])]:copy(f.rows)}};});
  assert.equal(await f.verify(),null);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(f.event.id).body).text,'Changed stored source');
});
