import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES,configFromEnv} from '../automation/service-bots/config.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {initializeIntakeJournal,recordIntakeWebhook,recordIntakeBinding,recordIntakeIngressGap,intakeAudit,intakeJournalStatus} from '../automation/service-bots/intake-journal.mjs';
const at=Date.parse('2026-10-10T14:00:00Z'),customer='573001112233';
const adminToken='a'.repeat(43),ingressToken='w'.repeat(43);
const config=(company='fumigacion')=>({company,...BUSINESSES[company],enabled:true,lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company+'-'+i}))});
const payload=(c,id='JOURNAL_NATIVE_001',patch={})=>({instance:c.lines[0].instance,event:'messages.upsert',data:{key:{id,remoteJid:customer+'@s.whatsapp.net',fromMe:false,...patch},messageTimestamp:at/1000,message:{conversation:'Quiero fumigar mi apartamento'}}});
const binding=(c,index=0)=>({phone:c.lines[index].phone,instance:c.lines[index].instance,ownerVerified:true,open:true});
const fixture=(company='fumigacion')=>{const c=config(company),s=new Store(':memory:',company,randomBytes(32));initializeIntakeJournal(s,c,{now:at-1000});return {c,s};};
const put=(s,c,b,patch={})=>recordIntakeWebhook(s,c,b,{authenticated:true,verifiedBinding:binding(c),receivedAt:at,...patch});
const audit=(s,c,patch={})=>intakeAudit(s,c,{company:c.company,day:'2026-10-10',...patch});

test('literal private originals are encrypted and media retains only unread descriptors',()=>{
 const {s,c}=fixture();try{put(s,c,payload(c));const media=payload(c,'MEDIA_NATIVE_001');media.data.message={imageMessage:{caption:'Foto del equipo',mimetype:'image/jpeg',url:'https://private.example/media',mediaKey:'private-key',directPath:'/secret/path'}};put(s,c,media);
 const persisted=s.db.prepare('SELECT body FROM intake_journal WHERE original=1').all();assert.ok(persisted.every(r=>!r.body.includes(customer)&&!r.body.includes('apartamento')));
 const a=audit(s,c);assert.equal(a.aggregates.originalPrivateIncomingMessages,2);assert.equal(a.contacts[0].messageCount,2);assert.equal(a.sources[0].literalText,'Quiero fumigar mi apartamento');assert.equal(a.sources[1].media.originalRead,false);assert.ok(!JSON.stringify(a).includes('private-key'));assert.ok(!JSON.stringify(a).includes('private.example'));assert.equal(a.coverage.allWhatsAppTrafficComplete,false);
 }finally{s.close();}
});
test('durable duplicate detection survives reopen, delivery changes and changed upsert revisions',()=>{
 const folder=mkdtempSync(join(tmpdir(),'own-intake-journal-')),path=join(folder,'bot.sqlite'),key=randomBytes(32),c=config();let s;
 try{s=new Store(path,c.company,key);initializeIntakeJournal(s,c,{now:at-1000});const p=payload(c);assert.equal(put(s,c,p).recorded,1);s.close();s=new Store(path,c.company,key);initializeIntakeJournal(s,c,{now:at});p.data.status='READ';assert.equal(put(s,c,p,{receivedAt:at+10000}).duplicates,1);
 p.data.message.conversation='Mi dirección corregida';assert.equal(put(s,c,p,{receivedAt:at+20000}).recorded,1);assert.equal(put(s,c,p,{receivedAt:at+30000}).duplicates,1);const a=audit(s,c);assert.equal(a.sources.length,1);assert.equal(a.sources[0].literalText,'Quiero fumigar mi apartamento');assert.equal(a.sources[0].observations[0].operation,'upsert-revision');assert.equal(a.coverage.journalStartedAt,at-1000);
 }finally{s?.close();assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep));rmSync(folder,{recursive:true});}
});
test('observed updates and deletions link to original and cannot remove or overwrite its body',()=>{
 const {s,c}=fixture();try{const p=payload(c);put(s,c,p);const first=s.db.prepare('SELECT body FROM intake_journal WHERE original=1').get().body;
 put(s,c,{instance:p.instance,event:'messages.update',data:{keyId:p.data.key.id,update:{status:'READ'}}});put(s,c,{instance:p.instance,event:'messages.delete',data:{keys:[{id:p.data.key.id}]}});
 const a=audit(s,c);assert.equal(a.sources.length,1);assert.equal(a.sources[0].deleted,true);assert.equal(a.aggregates.deletedOriginalMessages,1);assert.equal(a.sources[0].phone,customer);assert.equal(s.db.prepare('SELECT body FROM intake_journal WHERE original=1').get().body,first);
 assert.throws(()=>s.db.exec('DELETE FROM intake_journal'),/APPEND_ONLY/);assert.throws(()=>s.db.exec("UPDATE intake_journal SET body='replacement'"),/APPEND_ONLY/);
 }finally{s.close();}
});
test('unknown LID and conflicting PN are separate; canonical phone comes only from native exact alternative',()=>{
 const {s,c}=fixture('servicio-tecnico');try{put(s,c,payload(c,'LID_PENDING_NATIVE',{remoteJid:'123456789123@lid'}));put(s,c,payload(c,'LID_EXACT_ALT_NATIVE',{remoteJid:'223456789123@lid',remoteJidAlt:customer+'@s.whatsapp.net'}));put(s,c,payload(c,'PN_CONFLICT_NATIVE',{remoteJidAlt:'573009998877@s.whatsapp.net'}));
 const a=audit(s,c);assert.equal(a.contacts.length,1);assert.equal(a.aggregates.pendingLidIncomingMessages,1);assert.equal(a.pendingIdentitySources.length,2);assert.equal(a.sources[0].phone,null);assert.equal(a.sources[2].identity,'PN_CONFLICT');assert.equal(a.phoneInferred,false);
 }finally{s.close();}
});
test('group/staff/outgoing exclusions are explicit and staff filtering is configurable',()=>{
 const {s,c}=fixture();try{c.intakeJournalStaffPhones=[customer];put(s,c,payload(c));put(s,c,payload(c,'OWN_OUTGOING_NATIVE',{fromMe:true,remoteJid:'573009998877@s.whatsapp.net'}));const group=payload(c,'GROUP_NATIVE',{remoteJid:'123456789@g.us'});assert.equal(put(s,c,group).excludedGroups,1);
 assert.equal(audit(s,c).sources.length,0);assert.equal(audit(s,c).aggregates.staffOriginalMessagesExcluded,1);assert.equal(audit(s,c).aggregates.outgoingOriginalMessagesExcluded,1);assert.equal(audit(s,c,{includeStaff:true,includeOutgoing:true}).sources.length,2);
 }finally{s.close();}
});
test('scope rejects other company, instance and unverified native owner binding',()=>{
 const {s,c}=fixture();try{assert.throws(()=>put(s,{...c,company:'servicio-tecnico'},payload(c)),/OWN_SCOPE/);assert.throws(()=>put(s,c,{...payload(c),instance:'other-instance'}),/VERIFIED_INGRESS/);assert.throws(()=>put(s,c,payload(c),{verifiedBinding:{...binding(c),phone:'573022691941'}}),/VERIFIED_INGRESS/);assert.throws(()=>audit(s,c,{company:'servicio-tecnico'}),/SCOPED_DAY/);assert.equal(intakeJournalStatus(s,c).originals,0);
 }finally{s.close();}
});
test('authenticated original survives binding failure and becomes verified only after separate native proof',()=>{
 const {s,c}=fixture();try{const p=payload(c);put(s,c,p,{verifiedBinding:undefined,bindingPending:true});const body=s.db.prepare('SELECT body FROM intake_journal WHERE original=1').get().body;recordIntakeBinding(s,c,p,{authenticated:true,error:Error('CHANNEL_NOT_OPEN'),receivedAt:at});
 let a=audit(s,c);assert.equal(a.sources[0].bindingState,'FAILED');assert.equal(a.sources[0].phone,null);assert.equal(a.sources[0].nativeClaimedPhone,customer);assert.equal(a.contacts.length,0);
 assert.equal(put(s,c,p,{bindingPending:true,verifiedBinding:undefined,receivedAt:at+1000}).duplicates,1);recordIntakeBinding(s,c,p,{authenticated:true,verifiedBinding:binding(c),receivedAt:at+1000});a=audit(s,c);assert.equal(a.sources[0].bindingVerified,true);assert.equal(a.contacts[0].phone,customer);assert.equal(s.db.prepare('SELECT body FROM intake_journal WHERE original=1').get().body,body);
 }finally{s.close();}
});
test('both own lines, Bogota receipt boundary and non-service private message kinds remain explicit',()=>{
 const {s,c}=fixture();try{const p=payload(c);p.data.message={locationMessage:{degreesLatitude:6.2,degreesLongitude:-75.5}};put(s,c,p,{receivedAt:Date.parse('2026-10-10T04:59:59Z')});p.instance=c.lines[1].instance;p.data.message={reactionMessage:{text:'👍'}};put(s,c,p,{verifiedBinding:binding(c,1),receivedAt:Date.parse('2026-10-10T05:00:00Z')});
 assert.equal(audit(s,c,{day:'2026-10-09'}).sources[0].kind,'location');const a=audit(s,c);assert.equal(a.sources[0].kind,'reaction');assert.equal(a.sources[0].serviceContentEligible,false);assert.equal(a.sources[0].line,c.lines[1].phone);assert.equal(a.sources[0].providerDay,'2026-10-10');assert.equal(a.lines[1].receivedContacts,1);
 }finally{s.close();}
});
test('pagination is read-only and unlinked deletion or safe ingress gaps do not invent contacts',()=>{
 const {s,c}=fixture();try{put(s,c,payload(c,'FIRST_NATIVE_001'));put(s,c,payload(c,'SECOND_NATIVE_001'));put(s,c,{instance:c.lines[0].instance,event:'messages.delete',data:{keyId:'UNKNOWN_DELETED_001'}});recordIntakeIngressGap(s,c,{kind:'INVALID_JSON',receivedAt:at,payloadHash:'a'.repeat(64),byteLength:20});const before=s.db.prepare('SELECT COUNT(*) n FROM intake_journal').get().n;
 const a=audit(s,c,{limit:1}),b=audit(s,c,{limit:1,afterRow:a.nextRow});assert.equal(a.remaining,1);assert.equal(b.remaining,0);assert.notEqual(a.sources[0].sourceId,b.sources[0].sourceId);assert.equal(a.unlinkedObservations.length,1);assert.equal(a.aggregates.ingressGaps[0].contactKnown,false);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM intake_journal').get().n,before);
 }finally{s.close();}
});
test('today update of a prior-day MID retains linked original without recounting old incoming or decrypting unrelated history',()=>{
 const {s,c}=fixture();try{
  for(let n=2;n<82;n++)put(s,c,payload(c,'UNRELATED_HISTORY_'+n),{receivedAt:at-n*86400000});
  const p=payload(c,'PREVIOUS_DAY_UPDATED');p.data.messageTimestamp=(at-86400000)/1000;put(s,c,p,{receivedAt:at-86400000});
  put(s,c,{instance:p.instance,event:'messages.update',data:{keyId:p.data.key.id,update:{status:'READ'}}});put(s,c,{instance:p.instance,event:'messages.delete',data:{keyId:p.data.key.id}});
  let decrypts=0;const open=s.open.bind(s);s.open=value=>{decrypts++;return open(value);};const today=audit(s,c);
  assert.equal(today.aggregates.originalPrivateIncomingMessages,0);assert.equal(today.sources.length,0);assert.equal(today.linkedPriorDaySources.length,1);assert.equal(today.linkedPriorDaySources[0].sourceId,p.data.key.id);assert.equal(today.linkedPriorDaySources[0].literalText,'Quiero fumigar mi apartamento');assert.equal(today.linkedPriorDaySources[0].deleted,true);assert.equal(today.unlinkedObservations.length,0);assert.ok(decrypts<12,'unrelated encrypted history must not be read');
  const yesterday=audit(s,c,{day:'2026-10-09'});assert.equal(yesterday.sources.length,1);assert.equal(yesterday.sources[0].deleted,true);assert.equal(yesterday.sources[0].observations.length,2);
 }finally{s.close();}
});
test('binding failures keep diagnostic codes without preserving error URLs or tokens',()=>{
 const {s,c}=fixture();try{const p=payload(c);put(s,c,p,{bindingPending:true,verifiedBinding:undefined});recordIntakeBinding(s,c,p,{authenticated:true,error:Error('fetch https://secret.example?token=private-token'),receivedAt:at});const row=s.db.prepare("SELECT body FROM intake_journal WHERE operation='binding-failed'").get();const value=s.open(row.body);assert.equal(value.reason,'NATIVE_BINDING_FAILED');assert.ok(!JSON.stringify(value).includes('private-token'));
 }finally{s.close();}
});

async function serverFixture(run){
 const env={BOT_COMPANY:'fumigacion',BOT_LINES_JSON:JSON.stringify(config().lines.map((l,i)=>({...l,apiKey:String(i).repeat(32)}))),BOT_AUTH_TOKEN_HASH:createHash('sha256').update(adminToken).digest('hex'),BOT_WEBHOOK_TOKEN_HASH:createHash('sha256').update(ingressToken).digest('hex'),BOT_DATA_KEY:'b'.repeat(64),BOT_DATABASE_PATH:'/data/fumigacion/bot.sqlite',BOT_EVOLUTION_URL:'https://fake.invalid',BOT_ENABLED:'false',BOT_ACTIVATED_AT:new Date(Date.now()-3600000).toISOString()},c=configFromEnv(env),s=new Store(':memory:',c.company,randomBytes(32));
 let verify=async p=>binding(c,c.lines.findIndex(l=>l.phone===p));const t={verifyLine:p=>verify(p),verifyLineBinding:p=>verify(p)},server=createBotServer(c,s,t,{});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,auth=ingressToken,raw=false)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:raw?body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
 try{await run({s,c,post,setVerify:v=>{verify=v;}});}finally{await new Promise(r=>server.close(r));s.close();}
}
test('HTTP journal precedes native await, survives failed check, and admin endpoint has own auth',async()=>serverFixture(async({s,c,post,setVerify})=>{
 let entered,release;const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});setVerify(async()=>{entered();await gate;throw Error('CHANNEL_NOT_OPEN');});const p=payload(c);p.data.messageTimestamp=Math.floor(Date.now()/1000);const response=post('/webhook',p);await started;assert.equal(intakeJournalStatus(s,c).originals,1);release();assert.equal((await response).status,503);
 assert.equal((await post('/intake-audit',{company:c.company,day:new Date(Date.now()-5*3600000).toISOString().slice(0,10)})).status,401);const r=await post('/intake-audit',{company:c.company,day:new Date(Date.now()-5*3600000).toISOString().slice(0,10)},adminToken);assert.equal(r.status,200);const a=await r.json();assert.equal(a.sources[0].bindingState,'FAILED');assert.equal(a.contacts.length,0);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}));
test('HTTP invalid/oversized authenticated payloads retain safe gap and unauthenticated input creates none',async()=>serverFixture(async({s,post})=>{
 assert.equal((await post('/webhook','{broken','bad-auth',true)).status,401);assert.equal(intakeJournalStatus(s,config()).entries,0);assert.equal((await post('/webhook','{broken',ingressToken,true)).status,400);assert.equal((await post('/webhook','x'.repeat(20001),ingressToken,true)).status,413);assert.equal(intakeJournalStatus(s,config()).originals,0);assert.equal(intakeJournalStatus(s,config()).entries,2);
}));
