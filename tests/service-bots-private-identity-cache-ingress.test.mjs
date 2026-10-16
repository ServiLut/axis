import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {initializePrivateNativeCachePair,privateIdentityStatus} from '../automation/service-bots/webhook.mjs';
import {FUMIGACION_BLUE,FUMIGACION_RED,BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';
import {NATIVE_IDENTITY_RESOLUTION_GUARD} from '../automation/service-bots/native-identity-resolution.mjs';

// The only HTTP traffic is an ephemeral loopback test server. Provider reads,
// account owners, phones and messages are isolated in-memory fixtures.
const PHONE='573000006834',LID='123456789016423@lid',TOKEN='w'.repeat(43),START_KEY='private-native-cache-pair-start:v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
const record=(id,at,patch={})=>({key:{id,remoteJid:LID,fromMe:false},messageTimestamp:at/1000,message:{conversation:'Hola, quiero cotizar un apartamento'},...patch});
const body=(row,instance='cucaracha-azul')=>({instance,event:'messages.upsert',data:row});
async function fixture(run){
 const now=Date.now(),at=Math.floor((now-1000)/1000)*1000,start=at-10000,activatedAt=start-3600000;
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt,responseTargetMs:null,historyCheckRequired:false,authHash:hash('a'.repeat(43)),webhookHash:hash(TOKEN),lines:[{phone:FUMIGACION_BLUE,instance:'cucaracha-azul'},{phone:FUMIGACION_RED,instance:'cucaracha-roja'}],operationalLineScope:{company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[FUMIGACION_RED],authorizedAt:new Date(activatedAt+1000).toISOString()}};
 const s=new Store(':memory:',c.company,randomBytes(32)),engine=new Engine(s,c),requests=[],bindings=[];
 assert.equal(initializePrivateNativeCachePair(s,c,start),start);
 let rows=[],throwRequest=false;
 const t={config:c,verifyLine:async phone=>{bindings.push(phone);return {phone,instance:c.lines.find(l=>l.phone===phone).instance,ownerVerified:true,open:true,checkedAt:new Date().toISOString()};},verifyLineBinding:async phone=>({phone,instance:c.lines.find(l=>l.phone===phone).instance,ownerVerified:true,open:false,checkedAt:new Date().toISOString()}),request:async(line,path,value)=>{requests.push({line:line.phone,path,value});if(throwRequest)throw Error('ISOLATED_PROVIDER_READ_FAILURE');return {messages:{total:rows.length,records:structuredClone(rows)}};}};
 const server=createBotServer(c,s,t,engine);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const post=async(payload,token=TOKEN)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/webhook',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(3000)});return {status:response.status,value:await response.json()};};
 const pair=(phone=PHONE)=>record('NATIVE_PRIOR_PAIRED_SOURCE',at-1000,{key:{id:'NATIVE_PRIOR_PAIRED_SOURCE',remoteJid:LID,remoteJidAlt:phone+'@s.whatsapp.net',fromMe:true},message:{conversation:'Intervención humana anterior'},status:'DELIVERY_ACK'});
 const original=id=>{const row=s.db.prepare('SELECT body FROM intake_journal WHERE original=1 ORDER BY row_id').all().find(r=>s.open(r.body).sourceId===id);return row?s.open(row.body):null;};
 try{await run({s,c,engine,t,post,pair,at,start,requests,bindings,original,setRows:value=>{rows=value;},failReads:()=>{throwRequest=true;}});}finally{await new Promise(resolve=>server.close(resolve));s.close();}
}

test('a future incoming LID keeps its raw original and records an encrypted explicit-pair proof before ordinary ingestion',async()=>fixture(async f=>{
 const current=record('NATIVE_FUTURE_CALLBACK',f.at),payload=body(current),before=JSON.stringify(payload);f.setRows([current,f.pair()]);const r=await f.post(payload);
 assert.equal(r.status,202);assert.equal(r.value.accepted,1);assert.equal(r.value.unresolvedPrivateIdentity,0);assert.equal(JSON.stringify(payload),before);
 const original=f.original(current.key.id);assert.equal(original.identity,'LID_PENDING');assert.equal(original.phone,null);assert.equal(original.nativeKey.remoteJidAlt,null);assert.equal(original.literalText,current.message.conversation);
 const event=f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(current.key.id).body);assert.equal(event.phone,PHONE);assert.equal(event.text,current.message.conversation);assert.equal(event.line,FUMIGACION_BLUE);assert.equal(event.fromMe,false);
 const encrypted=f.s.db.prepare("SELECT value FROM meta WHERE key LIKE 'private-native-cache-pair-proof:%'").get().value;assert.ok(!encrypted.includes(PHONE));assert.ok(!encrypted.includes(current.message.conversation));
 const proof=f.s.open(encrypted);assert.equal(proof.state,'RESOLVED_NATIVE_CACHE_PAIR');assert.equal(proof.originalCarriedPhone,false);assert.equal(proof.authority,'external-customer-only');assert.equal(proof.proof.pairSources[0].id,f.pair().key.id);assert.equal(proof.proof.guard,NATIVE_IDENTITY_RESOLUTION_GUARD);assert.match(proof.proof.proofHash,/^[a-f0-9]{64}$/);
 const status=privateIdentityStatus(f.s,f.c);assert.equal(status.resolvedSources,1);assert.equal(status.resolvedNativeCachePairSources,1);assert.equal(status.unresolvedSources,0);assert.equal(status.historicalReplayEnabled,false);assert.equal(status.historicalCoverageComplete,false);assert.ok(!JSON.stringify(status).includes(PHONE));
 assert.deepEqual(f.requests.map(v=>v.path),['/chat/findMessages/cucaracha-azul']);assert.ok(f.bindings.every(value=>value===FUMIGACION_BLUE));assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 assert.throws(()=>f.s.db.exec("UPDATE intake_journal SET body='changed'"),/APPEND_ONLY/);
}));

test('installation cutoff is encrypted once and an older first message remains unresolved rather than recovered',async()=>fixture(async f=>{
 const before=f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(START_KEY).value;assert.equal(initializePrivateNativeCachePair(f.s,f.c,Date.now()+3600000),f.start);assert.equal(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(START_KEY).value,before);
 const old=record('NATIVE_OLD_FIRST_CALLBACK',f.start-1000);f.setRows([old,f.pair()]);const r=await f.post(body(old));assert.equal(r.value.accepted,0);assert.equal(f.requests.length,0);assert.equal(privateIdentityStatus(f.s,f.c).unresolvedIncomingSources,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'private-native-cache-pair-proof:%'").get().n,0);
}));

test('a duplicate future callback preserves the first proof and never adds another provider read or queued source',async()=>fixture(async f=>{
 const current=record('NATIVE_DUPLICATE_CALLBACK',f.at),payload=body(current);f.setRows([current,f.pair()]);assert.equal((await f.post(payload)).value.accepted,1);
 const firstProof=f.s.db.prepare("SELECT value FROM meta WHERE key LIKE 'private-native-cache-pair-proof:%'").get().value,originalBefore=JSON.stringify(f.original(current.key.id));
 const duplicate=await f.post(payload);assert.equal(duplicate.value.duplicates,1);assert.equal(f.requests.length,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM events').get().n,1);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='PRIVATE_NATIVE_IDENTITY_CACHE_PAIR_VERIFIED'").get().n,1);assert.equal(f.s.db.prepare("SELECT value FROM meta WHERE key LIKE 'private-native-cache-pair-proof:%'").get().value,firstProof);assert.equal(JSON.stringify(f.original(current.key.id)),originalBefore);
}));

test('a previously unresolved MID is never retried after a pair appears; only a new incoming source can resolve',async()=>fixture(async f=>{
 const old=record('NATIVE_PREVIOUS_UNRESOLVED',f.at-2000);f.setRows([old]);assert.equal((await f.post(body(old))).value.accepted,0);assert.equal(f.requests.length,1);
 const originalBefore=JSON.stringify(f.original(old.key.id));f.setRows([old,f.pair()]);assert.equal((await f.post(body(old))).value.accepted,0);assert.equal(f.requests.length,1);assert.equal(JSON.stringify(f.original(old.key.id)),originalBefore);
 const current=record('NATIVE_NEXT_CALLBACK_ONLY',f.at);f.setRows([old,current,f.pair()]);assert.equal((await f.post(body(current))).value.accepted,1);
 assert.equal(f.s.db.prepare('SELECT 1 FROM events WHERE id=?').get(old.key.id),undefined);assert.equal(privateIdentityStatus(f.s,f.c).unresolvedIncomingSources,1);assert.equal(privateIdentityStatus(f.s,f.c).resolvedNativeCachePairSources,1);
}));

test('a manual paired outgoing message still takes human attention and the following resolved LID stays observed human',async()=>fixture(async f=>{
 const staff=f.pair();assert.equal((await f.post(body(staff))).value.accepted,1);assert.equal(f.s.conversation(PHONE).hold,1);assert.equal(f.requests.length,0);
 assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='STAFF_TAKEOVER_AT_INGESTION'").get().n,1);
 const current=record('NATIVE_INCOMING_UNDER_HOLD',f.at);f.setRows([staff,current]);assert.equal((await f.post(body(current))).value.accepted,1);assert.equal(f.s.conversation(PHONE).hold,1);
 const event=f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(current.key.id).body);await f.engine.process(event);
 assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(current.key.id).state,'OBSERVED_HUMAN');assert.equal(f.s.conversation(PHONE).hold,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='EXPLICIT_RELEASE'").get().n,0);
}));

test('native cache cannot grant Chief authority through a LID pair',async()=>fixture(async f=>{
 const current=record('NATIVE_LID_CHIEF_BLOCKED',f.at);current.message={conversation:'María Ángel, retoma el chat de '+PHONE};f.setRows([current,f.pair(SANDRA)]);const r=await f.post(body(current));assert.equal(r.value.accepted,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(privateIdentityStatus(f.s,f.c).resolvedNativeCachePairSources,0);assert.equal(privateIdentityStatus(f.s,f.c).unresolvedSources,1);
}));

test('red suspended callback never invokes the blue native resolver',async()=>fixture(async f=>{
 const current=record('NATIVE_RED_CALLBACK_ONLY',f.at);f.setRows([current,f.pair()]);const r=await f.post(body(current,'cucaracha-roja'));assert.equal(r.value.accepted,0);assert.equal(r.value.reason,'USER_AUTHORIZED_SUSPENDED_LINE');assert.equal(f.requests.length,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(privateIdentityStatus(f.s,f.c).resolvedNativeCachePairSources,0);
}));

test('failed cache reads preserve the journal and leave identity unresolved without delivery or business work',async()=>fixture(async f=>{
 const current=record('NATIVE_PROVIDER_READ_FAIL',f.at);f.failReads();const r=await f.post(body(current));assert.equal(r.status,202);assert.equal(r.value.accepted,0);assert.equal(f.original(current.key.id).identity,'LID_PENDING');assert.equal(privateIdentityStatus(f.s,f.c).unresolvedSources,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}));

test('unauthenticated LID payload creates no original, provider read, resolution or customer event',async()=>fixture(async f=>{
 const current=record('NATIVE_UNAUTHENTICATED_LID',f.at);f.setRows([current,f.pair()]);const r=await f.post(body(current),'x'.repeat(43));assert.equal(r.status,401);assert.equal(f.requests.length,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM intake_journal').get().n,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);
}));
