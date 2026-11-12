import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {COLLECTION_SCOPE,digest,groupKey} from '../automation/service-bots/maria-collections.mjs';
import {createMariaCollectionsNative,mariaCollectionsNativeSource,mariaCollectionsNativeHistoryHash,MARIA_COLLECTIONS_NATIVE_BASIS} from '../automation/service-bots/maria-collections-native.mjs';
import {FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED} from '../automation/service-bots/line-scope.mjs';

const PHONE='573000001234',AT=Date.parse('2026-11-12T20:00:00.000Z'),PN=PHONE+'@s.whatsapp.net';
const raw=({id='COLLECTION_CUSTOMER_NATIVE_0001',line=BLUE,at=AT-1000,fromMe=false,text='Información del servicio revisada.',jid=PN,alt,...extra}={})=>({line,key:{id,remoteJid:jid,fromMe,...(alt?{remoteJidAlt:alt}:{})},messageTimestamp:at/1000,message:{conversation:text},...extra});
function fixture(t,{records=[raw()],basisChange,requestChange,attentionChange,ownerChange}={}){
 const store=new Store(':memory:','fumigacion',randomBytes(32));t.after(()=>store.close());
 const config={company:'fumigacion',enabled:true,activatedAt:AT-86400000,lines:[{phone:BLUE,instance:'cucaracha-azul'},{phone:RED,instance:'cucaracha-roja'}]};
 const rows=[{obligationId:'00000000-0000-4000-8000-000000000001',clientId:'00000000-0000-4000-8000-000000000002',phone:PHONE,originLine:BLUE,currency:'COP',balanceMinor:12000000,financialRevision:'a'.repeat(64),commercialReference:'TEST-001',serviceDescription:'Fumigación',serviceDate:'2026-11-01'}],key=groupKey(COLLECTION_SCOPE,rows);
 const manifest={version:'collector-finite-manifest-v1',manifestId:'native:fixture',...COLLECTION_SCOPE,reviewedAt:AT-2000,expiresAt:AT+60000,sourceHash:'b'.repeat(64),rows};delete manifest.lines;
 store.db.exec('CREATE TABLE collector_groups(group_key TEXT PRIMARY KEY,state TEXT,body TEXT)');store.db.prepare('INSERT INTO collector_groups VALUES(?,?,?)').run(key,'STAGED',store.seal({manifest,manifestHash:digest(manifest)}));
 store.db.prepare('INSERT INTO conversations(phone,line,revision,at,body) VALUES(?,?,7,?,?)').run(PHONE,BLUE,AT-3000,store.seal({caseId:'fixture:native',slots:{},asked:[]}));
 const sources=records.map(r=>mariaCollectionsNativeSource(r,PHONE,r.line));
 const basis={guard:MARIA_COLLECTIONS_NATIVE_BASIS,company:'fumigacion',tenantId:COLLECTION_SCOPE.tenantId,companyId:COLLECTION_SCOPE.companyId,manifestHash:digest(manifest),phone:PHONE,originLine:BLUE,reviewedAt:AT-500,expiresAt:AT+60000,reviewSourceHash:'1'.repeat(64),coverage:{kind:'predetermined-obligation-pertinent-native-window-v1',from:AT-86400000,through:AT-500,lines:[BLUE,RED],sourceHash:'2'.repeat(64),populationVerified:true,synchronizationVerified:true,priorRestrictionsReviewed:true,identityCoverageVerified:true},sources,historyHash:mariaCollectionsNativeHistoryHash(sources),mediaReviews:sources.filter(s=>s.media).map(s=>({line:s.line,id:s.id,contentHash:s.contentHash,originalHash:'3'.repeat(64),reviewHash:'4'.repeat(64)})),findings:{sourceHistoryHash:mariaCollectionsNativeHistoryHash(sources),semanticReviewComplete:true,originalLineVerified:true,contactPermissionVerified:true,contactDeferralClear:true,pendingPaymentClaim:false,optOut:false,humanHold:false,contactPurpose:'own-pending-obligation'},permittedContactWindow:{timezone:'America/Bogota',from:AT-10000,to:AT+60000,sourceHash:'5'.repeat(64)}};
 const sign=()=>{delete basis.basisHash;basis.basisHash=digest(basis)};if(basisChange)basisChange(basis);sign();
 let calls=0,owners=0,basisReads=0,currentTime=AT;const requests=[];
 const transport={config,async verifyLine(phone){owners++;return ownerChange?ownerChange(phone,owners):{phone,instance:config.lines.find(l=>l.phone===phone).instance,ownerVerified:true,open:true}},async request(line,path,body){calls++;requests.push({phone:line.phone,path,body:structuredClone(body)});if(requestChange){const result=requestChange({line,path,body,calls,records,store,basis,sign});if(result!==undefined)return result}const query=body.where.key,found=records.filter(r=>r.line===line.phone&&r.key.fromMe===query.fromMe&&Object.entries(query).every(([k,v])=>r.key[k]===v)&&r.messageTimestamp*1000>=Date.parse(body.where.messageTimestamp.gte)&&r.messageTimestamp*1000<=Date.parse(body.where.messageTimestamp.lte));return {messages:{total:found.length,records:found.slice((body.page-1)*body.offset,body.page*body.offset)}}},async currentAttention(phone,{store:ownStore}){assert.equal(phone,PHONE);assert.equal(ownStore,store);return attentionChange?attentionChange({store,basis,sign}):{through:AT,complete:true,sources:records.filter(r=>r.key.fromMe).map(r=>({id:r.key.id,line:r.line,at:r.messageTimestamp*1000,kind:'text'})),checks:[BLUE,RED].flatMap(line=>['remoteJid','remoteJidAlt'].map(addressField=>({line,addressField,total:0,read:0})))}}};
 const input={...COLLECTION_SCOPE,rows,key};const adapter=createMariaCollectionsNative(config,store,transport,{resolveReviewedBasis:async req=>{basisReads++;assert.equal(req.manifestHash,digest(manifest));return structuredClone(basis)},now:()=>currentTime});
 return {store,config,transport,adapter,input,manifest,basis,sign,records,requests,advance:n=>currentTime+=n,count:()=>({calls,owners,basisReads})};
}
const blocked=(r,why)=>{assert.equal(r.bothLinesComplete,false);assert.equal(r.complete,false);assert.equal(r.sends,0);assert.equal(r.businessWrites,false);if(why)assert.match(r.reason,why);return r};

test('constructor performs no reads or writes; another company/transport/config is rejected',t=>{
 const f=fixture(t);assert.deepEqual(f.count(),{calls:0,owners:0,basisReads:0});assert.equal(f.adapter.status(),null);assert.throws(()=>createMariaCollectionsNative({...f.config},f.store,f.transport,{resolveReviewedBasis(){}}),/OWN_DUAL_RUNTIME/);assert.throws(()=>createMariaCollectionsNative({...f.config,company:'other'},f.store,{...f.transport,config:{}},{resolveReviewedBasis(){}}),/OWN_DUAL_RUNTIME/);
});
test('a complete trusted bounded basis produces only pertinent, never global, proof with eight direction queries',async t=>{
 const f=fixture(t),r=await f.adapter.readNativeHistory(f.input);assert.equal(r.bothLinesComplete,true);assert.equal(r.coverage.completeForReviewedPertinentScope,true);assert.equal(r.coverage.globalHistoryComplete,false);assert.equal(r.historyHash,f.basis.historyHash);assert.equal(r.coveredLines.length,2);assert.equal(f.count().calls,8);assert.equal(f.count().owners,4);assert.equal(f.count().basisReads,2);assert.equal(f.requests.every(q=>q.path.startsWith('/chat/findMessages/')),true);assert.equal(f.requests.every(q=>typeof q.body.where.key.fromMe==='boolean'),true);
});
test('canonical and explicit alternate sources deduplicate only on exact immutable content',async t=>{
 const f=fixture(t,{records:[raw({alt:PN}),raw({id:'RED_ALTERNATE_NATIVE_0002',line:RED,jid:'123456789012345@lid',alt:PN})]});const r=await f.adapter.readNativeHistory(f.input);assert.equal(r.bothLinesComplete,true);assert.equal(f.requests.some(q=>q.body.where.key.remoteJid==='123456789012345@lid'),true);assert.equal(r.coverage.paginationChecks.every(c=>c.closed),true);
});
test('ACK changes do not mutate a content hash; body, native binding, media metadata do',()=>{
 const r=raw(),a=mariaCollectionsNativeSource(r,PHONE,BLUE);assert.deepEqual(mariaCollectionsNativeSource({...r,status:'READ',MessageUpdate:[{status:'SERVER_ACK',createdAt:'later'},{status:'READ'}]},PHONE,BLUE),a);assert.notEqual(mariaCollectionsNativeSource({...r,message:{conversation:'changed'}},PHONE,BLUE).contentHash,a.contentHash);assert.notEqual(mariaCollectionsNativeSource({...r,key:{...r.key,remoteJidAlt:'123456789012345@lid'}},PHONE,BLUE).contentHash,a.contentHash);
});
test('an ACK-labelled update cannot hide a message mutation payload',()=>{
 const r=raw();assert.throws(()=>mariaCollectionsNativeSource({...r,MessageUpdate:[{status:'READ',message:{conversation:'changed'}}]},PHONE,BLUE),/MUTATED_SOURCE/);
});
for(const flag of ['populationVerified','synchronizationVerified','priorRestrictionsReviewed','identityCoverageVerified'])test('page completion cannot replace trusted '+flag,async t=>{
 const f=fixture(t,{basisChange:b=>b.coverage[flag]=false});blocked(await f.adapter.readNativeHistory(f.input),/PERTINENT_COVERAGE/);assert.equal(f.count().calls,0);
});
for(const [label,change] of [['contact permission',b=>b.findings.contactPermissionVerified=false],['paid claim',b=>b.findings.pendingPaymentClaim=true],['optout',b=>b.findings.optOut=true],['deferral',b=>b.findings.contactDeferralClear=false],['semantic gap',b=>b.findings.semanticReviewComplete=false],['origin',b=>b.originLine=RED],['expiry',b=>b.expiresAt=AT],['wrongmanifest',b=>b.manifestHash='0'.repeat(64)]])test('reviewed '+label+' stays blocked',async t=>{
 const f=fixture(t,{basisChange:change});blocked(await f.adapter.readNativeHistory(f.input));assert.equal(f.count().calls,0);
});
test('no caller flags or refreshed export can manufacture reviewed native authority',async t=>{
 const f=fixture(t);blocked(await f.adapter.readNativeHistory({...f.input,bothLinesComplete:true}),/MANIFEST_INPUT/);blocked(await f.adapter.readNativeHistory({...f.input,rows:f.input.rows.map(r=>({...r,balanceMinor:1}))}),/DURABLE_MANIFEST/);assert.equal(f.count().calls,0);
});
test('a tampered reviewed hash is rejected before provider reads',async t=>{
 const f=fixture(t);f.basis.findings.contactPurpose='other';blocked(await f.adapter.readNativeHistory(f.input),/BASIS_HASH/);assert.equal(f.count().calls,0);
});
test('closed pagination covers a real second page for the same direction and line',async t=>{
 const records=Array.from({length:101},(_,i)=>raw({id:'PAGED_COLLECTION_SOURCE_'+String(i).padStart(4,'0'),at:AT-2000+i*10}));const f=fixture(t,{records}),r=await f.adapter.readNativeHistory(f.input);assert.equal(r.bothLinesComplete,true);assert.equal(f.requests.some(q=>q.body.page===2),true);
});
for(const [label,response] of [['changedtotal',({body})=>({messages:{total:body.page===1?101:102,records:body.page===1?Array.from({length:100},(_,i)=>raw({id:'UNSTABLE_SOURCE_'+String(i).padStart(4,'0')})):[]}})],['truncated',()=>({messages:{total:2,records:[]}})],['overflow',()=>({messages:{total:2001,records:[]}})],['malformed',()=>({messages:{total:1,records:null}})]])test('pagination '+label+' is an explicit blocker',async t=>{
 const f=fixture(t,{requestChange:response});blocked(await f.adapter.readNativeHistory(f.input),/PAGINATION/);
});
test('duplicate same-page source IDs and cross-query body variants do not silently overwrite',async t=>{
 const f=fixture(t,{requestChange:({calls})=>calls===1?{messages:{total:2,records:[raw(),raw()]}}:undefined});blocked(await f.adapter.readNativeHistory(f.input),/FILTER_OR_RANGE/);
 const g=fixture(t,{records:[raw({alt:PN})],requestChange:({body})=>body.where.key.remoteJidAlt?{messages:{total:1,records:[raw({alt:PN,text:'changed alternate body'})]}}:undefined});blocked(await g.adapter.readNativeHistory(g.input),/VARIANT_OR_MUTATION/);
});
for(const [label,record] of [['otherPN',raw({jid:'573000004321@s.whatsapp.net'})],['conflict',raw({alt:'573000004321@s.whatsapp.net'})],['LIDonly',raw({jid:'123456789012345@lid'})],['group',raw({jid:'123456789@g.us'})]])test(label+' cannot supply customer identity',()=>{assert.throws(()=>mariaCollectionsNativeSource(record,PHONE,BLUE),/PN_IDENTITY/)});
test('group participants and a truncated long timestamp cannot manufacture a direct PN source',()=>{
 const r=raw();for(const extra of [{group:true},{isGroup:true},{key:{...r.key,participant:'573000004321@s.whatsapp.net'}},{messageTimestamp:{low:r.messageTimestamp,high:1}}])assert.throws(()=>mariaCollectionsNativeSource({...r,...extra},PHONE,BLUE),/PN_IDENTITY/);
});
test('a discovered LID row without explicit PN binding blocks coverage rather than inheriting identity',async t=>{
 const lid='123456789012345@lid',f=fixture(t,{records:[raw({jid:lid,alt:PN})],requestChange:({body})=>body.where.key.remoteJid===lid?{messages:{total:1,records:[raw({jid:lid})]}}:undefined});blocked(await f.adapter.readNativeHistory(f.input),/PN_IDENTITY/);
});
for(const [label,change] of [['body',r=>r.message={conversation:'changed'}],['new',(_r,records)=>records.push(raw({id:'NEW_CUSTOMER_MESSAGE_0002'}))],['missing',(_r,records)=>records.splice(0)],['timestamp',r=>r.messageTimestamp-=1]])test('a '+label+' source invalidates frozen semantic review',async t=>{
 const f=fixture(t);change(f.records[0],f.records);blocked(await f.adapter.readNativeHistory(f.input),/NEW_CHANGED_OR_MISSING/);
});
for(const status of ['EDITED','DELETED','REVOKED','ERROR'])test(status+' marker cannot be hidden by unchanged text or ACK',async t=>{
 const f=fixture(t);f.records[0].MessageUpdate=[{status:'READ'},{status}];blocked(await f.adapter.readNativeHistory(f.input),/MUTATED_SOURCE/);
});
test('new media requires an exact original review; original review cannot be substituted for another source',async t=>{
 const media=raw({message:{imageMessage:{url:'https://private.invalid/secret-path',directPath:'/private',caption:'comprobante'}},messageType:'imageMessage'}),f=fixture(t,{records:[media]});assert.equal((await f.adapter.readNativeHistory(f.input)).mediaReviewComplete,true);f.basis.mediaReviews=[];f.sign();blocked(await f.adapter.readNativeHistory(f.input),/ORIGINAL_MEDIA/);
});
test('proof and error status never emit native text, media locators or credentials',async t=>{
 const media=raw({message:{documentMessage:{url:'https://private.invalid/secret-path',mediaKey:'secret-key',caption:'personal-account-123'}},messageType:'documentMessage'}),f=fixture(t,{records:[media]}),r=await f.adapter.readNativeHistory(f.input);assert.equal(r.bothLinesComplete,true);assert.doesNotMatch(JSON.stringify(r),/secret-path|private\.invalid|secret-key|personal-account|documentMessage/);f.transport.request=async()=>{throw Error('Bearer SECRET_TOKEN')};const blockedResult=blocked(await f.adapter.readNativeHistory(f.input));assert.doesNotMatch(JSON.stringify(blockedResult),/SECRET_TOKEN|Bearer/);
});
test('owner must be exact OPEN on both lines at the end as well as the beginning',async t=>{
 for(const patch of [phone=>({phone,instance:'wrong',ownerVerified:true,open:true}),phone=>({phone,instance:phone===BLUE?'cucaracha-azul':'cucaracha-roja',ownerVerified:true,open:false}),(_phone,n)=>({phone:BLUE,instance:'cucaracha-azul',ownerVerified:n<3,open:true})]){const f=fixture(t,{ownerChange:patch});blocked(await f.adapter.readNativeHistory(f.input),/EXACT_OPEN_OWNER/)}
});
test('a new hold or local pending event during provider awaits is not erased by a clean reviewed basis',async t=>{
 const f=fixture(t,{requestChange:({calls,store})=>{if(calls===1)store.db.prepare('UPDATE conversations SET hold=1').run()}});blocked(await f.adapter.readNativeHistory(f.input),/LOCAL_ATTENTION_OR_HOLD/);assert.equal(f.store.conversation(PHONE).hold,1);
 const g=fixture(t);g.store.enqueue({id:'NEW_LOCAL_PAYMENT_CLAIM_0001',phone:PHONE,line:RED,at:AT,fromMe:false,kind:'text',text:'ya pagué'});blocked(await g.adapter.readNativeHistory(g.input),/LOCAL_/);assert.equal(g.count().calls,0);
});
test('durable optout in the other line blocks both native proof and current attention',async t=>{
 const f=fixture(t),{createHash}=await import('node:crypto'),suffix=createHash('sha256').update(PHONE+':'+RED).digest('hex');f.store.db.prepare('INSERT INTO meta VALUES(?,?)').run('commercial-optout:fumigacion:'+suffix,f.store.seal({source:'fixture'}));blocked(await f.adapter.readNativeHistory(f.input),/DURABLE_OPTOUT/);blocked(await f.adapter.readCurrentAttention(f.input),/DURABLE_OPTOUT/);
});
test('reviewed basis changing during reads is detected before proof',async t=>{
 const f=fixture(t,{requestChange:({calls,basis,sign})=>{if(calls===1){basis.reviewSourceHash='9'.repeat(64);sign()}}});blocked(await f.adapter.readNativeHistory(f.input),/BASIS_MANIFEST_OR_ATTENTION_CHANGED/);
});
test('current attention uses its own fresh native check, both-line owners and preserved local state',async t=>{
 const f=fixture(t,{records:[raw(),raw({id:'OWN_STAFF_REVIEWED_SOURCE_0002',fromMe:true,at:AT-2000})]}),before=f.store.db.prepare('SELECT body,hold FROM conversations').get(),r=await f.adapter.readCurrentAttention(f.input);assert.equal(r.complete,true);assert.equal(r.contactAllowedNow,true);assert.equal(r.guard,'collector-current-attention-v1');assert.equal(r.coverage.globalHistoryComplete,false);assert.deepEqual(f.store.db.prepare('SELECT body,hold FROM conversations').get(),before);assert.equal(f.count().owners,8);
});
test('unknown human outgoing after reviewed native read blocks attention and does not create a hold',async t=>{
 const f=fixture(t,{attentionChange:()=>({complete:true,through:AT,sources:[{id:'NEW_HUMAN_OUTGOING_0003',line:RED,at:AT,kind:'text'}],checks:[BLUE,RED].flatMap(line=>['remoteJid','remoteJidAlt'].map(addressField=>({line,addressField,total:1,read:1})))})});blocked(await f.adapter.readCurrentAttention(f.input),/NEW_OR_UNREVIEWED_HUMAN_ATTENTION/);assert.equal(f.store.conversation(PHONE).hold,0);
});
test('partial or stale currentAttention cannot claim the current contact window is allowed',async t=>{
 for(const attention of [{complete:false,through:AT,sources:[],checks:[]},{complete:true,through:AT-60000,sources:[],checks:[]},{complete:true,through:AT,sources:[],checks:[{line:BLUE,addressField:'remoteJid',total:0,read:0}]}]){const f=fixture(t,{attentionChange:()=>attention});blocked(await f.adapter.readCurrentAttention(f.input),/LIVE_ATTENTION_COVERAGE/)}
});
test('a hold introduced during currentAttention awaits blocks and remains untouched',async t=>{
 const f=fixture(t,{attentionChange:({store})=>{store.db.prepare('UPDATE conversations SET hold=1').run();return {complete:true,through:AT,sources:[],checks:[BLUE,RED].flatMap(line=>['remoteJid','remoteJidAlt'].map(addressField=>({line,addressField,total:0,read:0})))}}});blocked(await f.adapter.readCurrentAttention(f.input),/LOCAL_ATTENTION_OR_HOLD/);assert.equal(f.store.conversation(PHONE).hold,1);
});
for(const [label,mutation] of [['raw update',{update:{status:'DELETED'}}],['ACK isDeleted',{MessageUpdate:[{status:'READ',isDeleted:true}]}],['top edited body',{editedMessage:{conversation:'changed'}}],['unknown ACK semantic field',{MessageUpdate:[{status:'READ',extraBody:{conversation:'changed'}}]}]])test('N01 '+label+' blocks before hashing or proof',async t=>{
 const f=fixture(t);Object.assign(f.records[0],mutation);assert.throws(()=>mariaCollectionsNativeSource(f.records[0],PHONE,BLUE),/MUTATED_SOURCE_REVIEW/);blocked(await f.adapter.readNativeHistory(f.input),/MUTATED_SOURCE_REVIEW/);
});
test('N02 a 29s provider read cannot redate its capture to the completion clock',async t=>{
 let f;f=fixture(t,{requestChange:({calls})=>{if(calls===1)f.advance(29000)}});blocked(await f.adapter.readNativeHistory(f.input),/READ_TOO_SLOW/);
});
test('N02 successful proof preserves the original capture timestamp and exposes its range',async t=>{
 let f;f=fixture(t,{requestChange:({calls})=>{if(calls===1)f.advance(1000)}});const r=await f.adapter.readNativeHistory(f.input);assert.equal(r.bothLinesComplete,true);assert.equal(r.checkedAt,AT);assert.equal(r.coverage.snapshotStartedAt,AT);assert.equal(r.coverage.queriedThrough,AT);
});
test('N02 currentAttention cannot refresh a slow source capture to a new checkedAt',async t=>{
 let f;f=fixture(t,{attentionChange:()=>{f.advance(29000);return {complete:true,through:AT,sources:[],checks:[BLUE,RED].flatMap(line=>['remoteJid','remoteJidAlt'].map(addressField=>({line,addressField,total:0,read:0})))}}});blocked(await f.adapter.readCurrentAttention(f.input),/LIVE_ATTENTION_COVERAGE_REQUIRED|READ_TOO_SLOW/);
});
test('N03 a same-MID same-time body mutation during attention is caught by the final immutable re-read',async t=>{
 let f;f=fixture(t,{records:[raw(),raw({id:'OWN_STAFF_REVIEWED_SOURCE_0002',fromMe:true,at:AT-2000})],attentionChange:()=>{f.records[1].message={conversation:'Changed after native check'};return {complete:true,through:AT,sources:[{id:f.records[1].key.id,line:BLUE,at:AT-2000,kind:'text',mutationHash:'f'.repeat(64)}],checks:[BLUE,RED].flatMap(line=>['remoteJid','remoteJidAlt'].map(addressField=>({line,addressField,total:0,read:0})))}}});blocked(await f.adapter.readCurrentAttention(f.input),/NEW_CHANGED_OR_MISSING_SOURCE/);
});
test('preflight uses the same native and attention checks before any group or claim exists',async t=>{
 const f=fixture(t);f.store.db.exec('DROP TABLE collector_groups');const before=f.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),conv=f.store.db.prepare('SELECT * FROM conversations').all();const result=await f.adapter.preflightReviewedManifest(f.manifest);assert.equal(result.guard,'collector-native-preflight-v1');assert.equal(result.complete,true);assert.equal(result.native.bothLinesComplete,true);assert.equal(result.attention.complete,true);assert.equal(result.native.historyHash,result.attention.historyHash);assert.equal(result.native.historyHash,f.basis.historyHash);assert.equal(result.attention.checkedAt,AT);assert.equal(f.count().calls,16);assert.deepEqual(f.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),before);assert.deepEqual(f.store.db.prepare('SELECT * FROM conversations').all(),conv);assert.equal(f.store.db.prepare('SELECT count(*) n FROM outbox').get().n,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM audit').get().n,0);
});
test('ordinary core callbacks still require a real STAGED group after preflight support',async t=>{
 const f=fixture(t);f.store.db.exec('DROP TABLE collector_groups');blocked(await f.adapter.readNativeHistory(f.input),/DURABLE_MANIFEST_REQUIRED/);blocked(await f.adapter.readCurrentAttention(f.input),/DURABLE_MANIFEST_REQUIRED/);assert.equal(f.count().calls,0);
});
test('unregistered or altered preflight manifest cannot inherit the trusted catalogue basis',async t=>{
 const f=fixture(t);f.store.db.exec('DROP TABLE collector_groups');const changed=structuredClone(f.manifest);changed.rows[0].balanceMinor=1;const out=await f.adapter.preflightReviewedManifest(changed);assert.equal(out.complete,false);assert.equal(out.native.bothLinesComplete,false);assert.equal(f.count().calls,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM outbox').get().n,0);
});
test('preflight rejects scope/identity changes, caller authority fields and stale manifests before reads',async t=>{
 for(const change of [m=>m.company='other',m=>m.rows[0].phone='12345@lid',m=>m.reviewedAt=AT-200000,m=>m.bothLinesComplete=true,m=>m.rows[0].originLine='573000000000',m=>m.rows.push({...m.rows[0]})]){const f=fixture(t);f.store.db.exec('DROP TABLE collector_groups');const m=structuredClone(f.manifest);change(m);const r=await f.adapter.preflightReviewedManifest(m);assert.equal(r.complete,false);assert.match(r.reason,/REVIEWED_MANIFEST_BINDING_REQUIRED/);assert.equal(f.count().calls,0)}
});
test('preflight cannot manufacture clean native coverage from an unavailable reviewed basis',async t=>{
 const f=fixture(t,{basisChange:b=>b.coverage.synchronizationVerified=false});f.store.db.exec('DROP TABLE collector_groups');const r=await f.adapter.preflightReviewedManifest(f.manifest);assert.equal(r.complete,false);assert.match(r.reason,/PERTINENT_COVERAGE/);assert.equal(f.count().calls,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM outbox').get().n,0);
});
test('preflight preserves N01/N02/N03 and new human attention blockers without reserving obligations',async t=>{
 const mutation=fixture(t);mutation.store.db.exec('DROP TABLE collector_groups');mutation.records[0].update={status:'DELETED'};assert.match((await mutation.adapter.preflightReviewedManifest(mutation.manifest)).reason,/MUTATED_SOURCE/);
 let slow;slow=fixture(t,{requestChange:({calls})=>{if(calls===1)slow.advance(29000)}});slow.store.db.exec('DROP TABLE collector_groups');assert.match((await slow.adapter.preflightReviewedManifest(slow.manifest)).reason,/READ_TOO_SLOW/);
 let race;race=fixture(t,{attentionChange:()=>{race.records[0].message={conversation:'Changed while attention awaited'};return {complete:true,through:AT,sources:[],checks:[BLUE,RED].flatMap(line=>['remoteJid','remoteJidAlt'].map(addressField=>({line,addressField,total:0,read:0})))}}});race.store.db.exec('DROP TABLE collector_groups');assert.match((await race.adapter.preflightReviewedManifest(race.manifest)).reason,/NEW_CHANGED_OR_MISSING_SOURCE/);
});
test('current-state bundle closes exact scope and uses final native plus attention from one conservative capture',async t=>{
 let f;f=fixture(t,{attentionChange:()=>{f.advance(2000);return {complete:true,through:AT,sources:[],checks:[BLUE,RED].flatMap(line=>['remoteJid','remoteJidAlt'].map(addressField=>({line,addressField,total:0,read:0})))}}});
 const r=await f.adapter.readCurrentState(f.input);assert.deepEqual(Object.keys(r).sort(),'attention,checkedAt,company,companyId,guard,native,originLine,phone,tenantId'.split(',').sort());assert.equal(r.guard,'collector-current-state-v1');assert.equal(r.company,COLLECTION_SCOPE.company);assert.equal(r.tenantId,COLLECTION_SCOPE.tenantId);assert.equal(r.companyId,COLLECTION_SCOPE.companyId);assert.equal(r.phone,PHONE);assert.equal(r.originLine,BLUE);assert.equal(r.native.bothLinesComplete,true);assert.equal(r.attention.complete,true);assert.equal(r.native.historyHash,r.attention.historyHash);assert.equal(r.checkedAt,Math.min(r.native.checkedAt,r.attention.checkedAt));assert.equal(r.checkedAt,AT);assert.equal(r.native.checkedAt,AT+2000);assert.equal(r.attention.coverage.queriedThrough,r.native.coverage.queriedThrough);assert.equal(f.count().calls,16);assert.equal(f.count().owners,8);assert.equal(f.store.db.prepare('SELECT count(*) n FROM outbox').get().n,0);
});
test('current-state bundle preserves the five-second boundary and blocked error capture without rebasing',async t=>{
 for(const elapsed of [5000,5001,29000]){let f;f=fixture(t,{attentionChange:()=>{f.advance(elapsed);return {complete:true,through:AT,sources:[],checks:[BLUE,RED].flatMap(line=>['remoteJid','remoteJidAlt'].map(addressField=>({line,addressField,total:0,read:0})))}}});const r=await f.adapter.readCurrentState(f.input);assert.equal(r.native.bothLinesComplete,elapsed===5000);assert.equal(r.attention.complete,elapsed===5000);assert.equal(r.checkedAt,AT);assert.equal(r.checkedAt,Math.min(r.native.checkedAt,r.attention.checkedAt));if(elapsed>5000){assert.equal(r.native.complete,false);assert.match(r.native.reason,/READ_TOO_SLOW|LIVE_ATTENTION_COVERAGE/);assert.equal(r.native.sends,0);assert.equal(r.attention.sends,0);}}
});
test('current-state bundle rejects caller flags before provider work and cannot manufacture durable authority',async t=>{
 const f=fixture(t),r=await f.adapter.readCurrentState({...f.input,complete:true,native:{bothLinesComplete:true}});assert.equal(r.native.bothLinesComplete,false);assert.equal(r.attention.complete,false);assert.match(r.native.reason,/MANIFEST_INPUT_REQUIRED/);assert.equal(f.count().calls,0);assert.equal(r.checkedAt,AT);
});
for(const learnedLine of [BLUE,RED])for(const fromMe of [false,true])test('cross-line LID detector blocks unknown '+(fromMe?'outgoing':'incoming')+' identity learned on '+learnedLine.slice(-4),async t=>{
 const lid='123456789012345@lid',records=[raw(),raw({id:'EXPLICIT_ALIAS_SOURCE_0001',line:learnedLine,jid:lid,alt:PN})],f=fixture(t,{records});f.records.push(raw({id:'OTHER_LINE_UNKNOWN_LID_0001',line:learnedLine===BLUE?RED:BLUE,jid:lid,fromMe,text:'ya pagué'}));const result=await f.adapter.readNativeHistory(f.input);blocked(result,/PN_IDENTITY_REQUIRED/);assert.equal(f.requests.some(r=>r.phone!==learnedLine&&r.body.where.key.remoteJid===lid),true);assert.equal(f.store.db.prepare('SELECT count(*) n FROM outbox').get().n,0);
});
test('a LID cannot transfer PN identity to another own line through provider aliases or false rows',async t=>{
 const lid='123456789012345@lid';
 for(const other of [raw({id:'OTHER_PN_ALIAS_SOURCE_0001',line:RED,jid:lid,alt:'573000009999@s.whatsapp.net'}),raw({id:'OTHER_PN_ALT_LID_0001',line:RED,jid:'573000009999@s.whatsapp.net',alt:lid}),raw({id:'MUTATED_OTHER_LINE_0001',line:RED,jid:lid,update:{status:'DELETED'}})]){const f=fixture(t,{records:[raw({jid:lid,alt:PN})]});f.records.push(other);blocked(await f.adapter.readNativeHistory(f.input),/PN_IDENTITY_REQUIRED|MUTATED_SOURCE/);assert.equal(f.store.db.prepare('SELECT count(*) n FROM outbox').get().n,0);}
});
test('same LID is usable on each own line only with that exact native explicit PN and reviewed descriptor',async t=>{
 const lid='123456789012345@lid',f=fixture(t,{records:[raw({jid:lid,alt:PN}),raw({id:'RED_EXPLICIT_REVIEWED_PN_0001',line:RED,jid:lid,alt:PN})]}),r=await f.adapter.readNativeHistory(f.input);assert.equal(r.bothLinesComplete,true);assert.equal(r.historyHash,f.basis.historyHash);assert.equal(r.coverage.globalHistoryComplete,false);
 for(const line of [BLUE,RED])for(const field of ['remoteJid','remoteJidAlt'])for(const fromMe of [false,true])assert.ok(f.requests.some(q=>q.phone===line&&q.body.where.key[field]===lid&&q.body.where.key.fromMe===fromMe));assert.equal(f.store.db.prepare('SELECT count(*) n FROM outbox').get().n,0);
});
test('new correct explicit PN on the other own line still requires an exact reviewed line-specific descriptor',async t=>{
 const lid='123456789012345@lid',f=fixture(t,{records:[raw({jid:lid,alt:PN})]});f.records.push(raw({id:'RED_NEW_UNREVIEWED_PN_0001',line:RED,jid:lid,alt:PN}));blocked(await f.adapter.readNativeHistory(f.input),/NEW_CHANGED_OR_MISSING_SOURCE/);
});
test('a hidden other-line LID source arriving during attention invalidates the final current-state bundle',async t=>{
 const lid='123456789012345@lid';let f;f=fixture(t,{records:[raw({jid:lid,alt:PN})],attentionChange:()=>{f.records.push(raw({id:'RED_LATE_UNKNOWN_ALIAS_0001',line:RED,jid:lid,text:'ya pagué'}));return {complete:true,through:AT,sources:[],checks:[BLUE,RED].flatMap(line=>['remoteJid','remoteJidAlt'].map(addressField=>({line,addressField,total:0,read:0})))}}});const r=await f.adapter.readCurrentState(f.input);assert.equal(r.native.bothLinesComplete,false);assert.equal(r.attention.complete,false);assert.match(r.native.reason,/PN_IDENTITY_REQUIRED/);assert.equal(r.checkedAt,AT);assert.equal(f.store.db.prepare('SELECT count(*) n FROM outbox').get().n,0);
});
