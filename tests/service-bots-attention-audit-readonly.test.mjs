import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {initializeIntakeJournal,recordIntakeWebhook,recordIntakeBinding} from '../automation/service-bots/intake-journal.mjs';
import {CONTACT_ATTENTION_READONLY_GUARD,reviewContactAttention} from '../automation/service-bots/attention-audit-readonly.mjs';

const BLUE='573126944997',RED='573126938721',PHONE='573000001111',NOW=Date.parse('2026-10-17T16:00:00Z');
const fixture=(company='fumigacion')=>{
  const c={company,...BUSINESSES[company],enabled:false,chiefOnly:true,replyOnlyToChief:true,activatedAt:NOW-86400000,lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company==='fumigacion'?['cucaracha-azul','cucaracha-roja'][i]:'synthetic-technical-'+i}))};
  const s=new Store(':memory:',company,randomBytes(32));initializeIntakeJournal(s,c,{now:NOW-86400000});return {s,c};
};
const body=(phone=PHONE,sourceId='SOURCE_INCOMING_001')=>({company:'fumigacion',line:BLUE,contacts:[{phone,sourceId}]});
function seed(f,{phone=PHONE,id='SOURCE_INCOMING_001',at=NOW,fromMe=false,text='Necesito cotizar un servicio.',line=BLUE,pending=false,journal=true,enqueue=true}={}){
  const e={id,phone,line,at,fromMe,kind:'text',text},native={event:'messages.upsert',instance:line===BLUE?'cucaracha-azul':'cucaracha-roja',data:{key:{id,remoteJid:phone+'@s.whatsapp.net',fromMe},messageTimestamp:at/1000,message:{conversation:text}}};
  if(journal)recordIntakeWebhook(f.s,f.c,native,{authenticated:true,bindingPending:pending,verifiedBinding:pending?undefined:{ownerVerified:true,open:true,phone:line,instance:native.instance},receivedAt:at+100});
  if(enqueue){f.s.enqueue(e);f.s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(id);}
  return {e,native};
}
const snapshot=s=>Object.fromEntries(s.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,JSON.stringify(s.db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all())]));
const withFixture=(fn,company)=>{const f=fixture(company);try{return fn(f);}finally{f.s.close();}};

test('paused own-blue audit reports only the local hold and bounded metadata, without content or phone echoes',()=>withFixture(f=>{
  seed(f);f.s.saveConversation(PHONE,{caseId:'CASE_SYNTHETIC_001',slots:{name:'Sensitive name',address:'Sensitive address'},lastText:'Secret text'});f.s.hold(PHONE,'STAFF_SYNTHETIC_001',true);
  const before=snapshot(f.s),result=reviewContactAttention(f.s,f.c,body());
  assert.equal(result.guard,CONTACT_ATTENTION_READONLY_GUARD);assert.equal(result.readOnly,true);assert.equal(result.coverageComplete,false);
  assert.deepEqual(result.results,[{found:true,hold:true,revision:2,currentLine:BLUE,caseId:'CASE_SYNTHETIC_001',lastSourceId:'SOURCE_INCOMING_001',at:NOW}]);
  assert.deepEqual(snapshot(f.s),before);assert.doesNotMatch(JSON.stringify(result),/Sensitive|Secret|573000001111|FREE|eligible|slots|lastText/);
}));
test('hold false is only an observed local value and does not claim complete coverage or permission',()=>withFixture(f=>{
  seed(f);const result=reviewContactAttention(f.s,f.c,body());assert.equal(result.results[0].hold,false);assert.equal(result.results[0].revision,1);assert.equal(result.coverageComplete,false);assert.equal(result.results[0].caseId,null);assert.equal(f.c.enabled,false);assert.equal(f.c.replyOnlyToChief,true);
}));
test('one to four contacts preserve input order and the real current revisions',()=>withFixture(f=>{
  const contacts=Array.from({length:4},(_,i)=>({phone:'57300000111'+i,sourceId:'SOURCE_FOUR_00'+i}));
  for(const [i,c] of contacts.entries()){seed(f,{phone:c.phone,id:c.sourceId,at:NOW+i*1000});if(i%2)f.s.hold(c.phone,'STAFF_FOUR_00'+i,true);}
  const result=reviewContactAttention(f.s,f.c,{...body(),contacts});assert.deepEqual(result.results.map(r=>r.hold),[false,true,false,true]);assert.deepEqual(result.results.map(r=>r.revision),[1,2,1,2]);
}));
test('absent conversation or absent native journal identity remains unknown',()=>withFixture(f=>{
  const absent=reviewContactAttention(f.s,f.c,body()).results[0];assert.deepEqual(absent,{found:false,hold:null,revision:null,currentLine:null,caseId:null,lastSourceId:null,at:null});
  seed(f,{journal:false});const result=reviewContactAttention(f.s,f.c,body()).results[0];assert.equal(result.found,true);for(const k of ['hold','revision','currentLine','caseId','lastSourceId','at'])assert.equal(result[k],null,k);
}));
test('a source saved only in the journal does not invent a conversation',()=>withFixture(f=>{
  seed(f,{enqueue:false});assert.equal(reviewContactAttention(f.s,f.c,body()).results[0].found,false);
}));
test('a native receipt pending binding becomes observable only after its existing binding proof',()=>withFixture(f=>{
  const {native}=seed(f,{pending:true});assert.equal(reviewContactAttention(f.s,f.c,body()).results[0].hold,null);
  recordIntakeBinding(f.s,f.c,native,{authenticated:true,verifiedBinding:{ownerVerified:true,open:true,phone:BLUE,instance:'cucaracha-azul'},receivedAt:NOW+200});
  const before=snapshot(f.s);assert.equal(reviewContactAttention(f.s,f.c,body()).results[0].hold,false);assert.deepEqual(snapshot(f.s),before);
}));
test('an edited/deleted native source or failed binding is not accepted as current text identity',()=>{
  for(const mode of ['edit','delete','failed'])withFixture(f=>{
    const {native}=seed(f);
    if(mode==='failed')recordIntakeBinding(f.s,f.c,native,{authenticated:true,error:new Error('NATIVE_BINDING_FAILED'),receivedAt:NOW+200});
    else recordIntakeWebhook(f.s,f.c,{...native,event:mode==='edit'?'messages.update':'messages.delete',data:{...native.data,update:{status:mode==='edit'?'EDITED':'DELETED'},message:{conversation:'Changed text'}}},{authenticated:true,verifiedBinding:{ownerVerified:true,phone:BLUE,instance:'cucaracha-azul'},receivedAt:NOW+200});
    assert.equal(reviewContactAttention(f.s,f.c,body()).results[0].hold,null,mode);
  });
});
test('source must be the exact own incoming text and encrypted row metadata must agree',()=>{
  for(const patch of [{phone:'573000002222'},{line:RED},{fromMe:true},{kind:'audio'},{text:'Changed text'},{at:NOW+1},{id:'DIFFERENT_SOURCE_ID'}])withFixture(f=>{
    const {e}=seed(f);f.s.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.s.seal({...e,...patch}),e.id);
    assert.equal(reviewContactAttention(f.s,f.c,body()).results[0].hold,null,JSON.stringify(patch));
  });
});
test('outgoing reference, contradictory conversation line, corrupt ciphertext or invalid hold remain unknown',()=>{
  for(const mode of ['outgoing','red-current-line','corrupt','invalid-hold'])withFixture(f=>{
    seed(f,{fromMe:mode==='outgoing'});
    if(mode==='red-current-line')f.s.db.prepare('UPDATE conversations SET line=? WHERE phone=?').run(RED,PHONE);
    if(mode==='corrupt')f.s.db.prepare('UPDATE events SET body=? WHERE id=?').run('not-encrypted','SOURCE_INCOMING_001');
    if(mode==='invalid-hold')f.s.db.prepare('UPDATE conversations SET hold=2 WHERE phone=?').run(PHONE);
    assert.equal(reviewContactAttention(f.s,f.c,body()).results[0].hold,null,mode);
  });
});
test('a LID without a stored direct native PN journal identity does not borrow a written phone',()=>withFixture(f=>{
  const {e}=seed(f,{journal:false}),native={event:'messages.upsert',instance:'cucaracha-azul',data:{key:{id:e.id,remoteJid:'123456789012345@lid',fromMe:false},messageTimestamp:NOW/1000,message:{conversation:e.text+' '+PHONE}}};
  recordIntakeWebhook(f.s,f.c,native,{authenticated:true,verifiedBinding:{ownerVerified:true,phone:BLUE,instance:'cucaracha-azul'},receivedAt:NOW+100});assert.equal(reviewContactAttention(f.s,f.c,body()).results[0].hold,null);
}));
test('latest stored source metadata is read without confusing the old reference with current attention',()=>withFixture(f=>{
  seed(f);seed(f,{id:'STAFF_LATEST_SOURCE',at:NOW+1000,fromMe:true,text:'The human is responding.'});const before=snapshot(f.s),result=reviewContactAttention(f.s,f.c,body()).results[0];
  assert.equal(result.hold,true);assert.equal(result.lastSourceId,'STAFF_LATEST_SOURCE');assert.equal(result.at,NOW+1000);assert.deepEqual(snapshot(f.s),before);
}));
test('closed schema rejects other company/line, over four, duplicates, malformed numbers and arbitrary fields',()=>withFixture(f=>{
  const contact=body().contacts[0],invalid=[null,[],{}, {...body(),company:'servicio-tecnico'},{...body(),line:RED},{...body(),contacts:[]},{...body(),contacts:Array.from({length:5},(_,i)=>({phone:'57300000111'+i,sourceId:'SOURCE_OVER_00'+i}))},{...body(),contacts:[contact,contact]},{...body(),contacts:[contact,{...contact,phone:'573000002222'}]},{...body(),contacts:[{...contact,phone:SANDRA}]},{...body(),contacts:[{...contact,phone:Number(PHONE)}]},{...body(),contacts:[{...contact,phone:'+'+PHONE}]},{...body(),contacts:[{...contact,phone:PHONE+'@s.whatsapp.net'}]},{...body(),contacts:[{...contact,sourceId:123456789}]},{...body(),contacts:[{...contact,text:'Untrusted'}]},{...body(),contacts:[{...contact,sourceId:'short'}]},{...body(),allowSend:true}];
  const before=snapshot(f.s);for(const value of invalid)assert.throws(()=>reviewContactAttention(f.s,f.c,value),/CLOSED_SOURCE_SCOPE_REQUIRED/);assert.deepEqual(snapshot(f.s),before);
}));
test('foreign store/configuration and foreign configured lines are rejected before reading contact data',()=>withFixture(f=>{
  assert.throws(()=>reviewContactAttention(f.s,{...f.c,company:'servicio-tecnico'},body()),/OWN_FUMIGACION_REQUIRED/);
  assert.throws(()=>reviewContactAttention(f.s,{...f.c,lines:[{phone:BLUE,instance:'wrong'}]},body()),/OWN_FUMIGACION_REQUIRED/);
  assert.throws(()=>reviewContactAttention(f.s,{...f.c,lines:[...f.c.lines,{phone:'573022691941',instance:'technical'}]},body()),/OWN_FUMIGACION_REQUIRED/);
  const other=fixture('servicio-tecnico');try{assert.throws(()=>reviewContactAttention(other.s,f.c,body()),/OWN_FUMIGACION_REQUIRED/);}finally{other.s.close();}
}));
test('missing journal table leaves identity unknown and does not create a table',()=>{
  const f=fixture();f.s.close();const s=new Store(':memory:','fumigacion',randomBytes(32));
  try{const e={id:'SOURCE_INCOMING_001',phone:PHONE,line:BLUE,at:NOW,kind:'text',fromMe:false,text:'Hola'};s.enqueue(e);const before=snapshot(s);assert.equal(reviewContactAttention(s,f.c,body()).results[0].hold,null);assert.deepEqual(snapshot(s),before);}finally{s.close();}
});
test('HTTP route uses own admin auth while customers remain paused, with no transport or state mutations',async()=>{
  const f=fixture(),admin='synthetic-attention-admin-token-'+'a'.repeat(32),webhook='synthetic-attention-webhook-token-'+'b'.repeat(32);f.c.authHash=createHash('sha256').update(admin).digest('hex');f.c.webhookHash=createHash('sha256').update(webhook).digest('hex');
  let transportCalls=0;const transport=new Proxy({},{get:()=>()=>{transportCalls++;throw Error('NO_NETWORK_OR_SEND');}}),server=createBotServer(f.c,f.s,transport,{});seed(f);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/review-contact-attention';
  const request=(value,token=admin,method='POST')=>fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(value)}:{})});
  try{
    const before=snapshot(f.s);assert.equal((await request(body(),webhook)).status,401);assert.equal((await request(body(),'invalid')).status,401);assert.equal((await request(undefined,admin,'GET')).status,405);
    assert.equal((await request({...body(),line:RED})).status,400);const response=await request(body());assert.equal(response.status,200);assert.equal((await response.json()).results[0].hold,false);assert.deepEqual(snapshot(f.s),before);assert.equal(transportCalls,0);assert.equal(f.c.enabled,false);assert.equal(f.c.replyOnlyToChief,true);
  }finally{await new Promise(resolve=>server.close(resolve));f.s.close();}
});
