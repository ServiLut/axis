// Synthetic in-memory doubles only. No HTTP, model, production data or grants.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {Transport,drain,flushOutbox} from '../automation/service-bots/transport.mjs';
import {initializeInactivityFollowup,queueInactivityFollowups,inactivityCandidate} from '../automation/service-bots/inactivity-followup.mjs';
import {DUAL_LINE_SCOPE_VERSION,DUAL_LINE_AUTHORIZATION_SOURCE,FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED,operationalHistoryGuard} from '../automation/service-bots/line-scope.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';

const NOW=Date.parse('2026-10-19T20:00:00.000Z'),PHONE='573000009991',PN=PHONE+'@s.whatsapp.net';
function fixture(t){
 t.mock.method(Date,'now',()=>NOW);
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:Date.parse('2026-10-03T14:23:58.495Z'),publicResponseStartsAt:Date.parse('2026-10-17T20:20:36.716Z'),provider:'https://synthetic.invalid',
  lines:[{phone:BLUE,instance:'cucaracha-azul',apiKey:'a'.repeat(32)},{phone:RED,instance:'cucaracha-roja',apiKey:'b'.repeat(32)}],
  operationalLineScope:{company:'fumigacion',version:DUAL_LINE_SCOPE_VERSION,authorizationSource:DUAL_LINE_AUTHORIZATION_SOURCE,activeLines:[BLUE,RED],suspendedLines:[],authorizedAt:'2026-10-09T21:43:05.250Z',lineStartsAt:{[BLUE]:'2026-10-09T21:43:05.250Z',[RED]:new Date(NOW-3000).toISOString()}}};
 const store=new Store(':memory:','fumigacion',randomBytes(32));initializeInactivityFollowup(config,store);t.after(()=>store.close());
 return {config,store,engine:new Engine(store,config),redCut:NOW-3000};
}
function event(id,line,at=NOW-1000,phone=PHONE,text='Hola'){return {id,phone,line,at,kind:'text',text,fromMe:false,forwarded:false};}
function enqueue(f,e){f.store.enqueue(e);f.store.db.prepare('UPDATE events SET received_at=? WHERE id=?').run(Math.max(e.at+1,NOW-100),e.id);return e;}
function prepare(f,e,id=e.id+':reply'){
 enqueue(f,e);f.store.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(e.id);
 f.store.queue(id,e.phone,e.line,'Hola, puedo ayudarte.',false,f.store.conversation(e.phone).revision,'fumigacion:'+e.id);
 return f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
}
const double=sent=>({verifyLine:async()=>{},send:async(row,text)=>{sent.push({id:row.id,line:row.line,text});return 'SYNTHETIC_MID_'+sent.length;}});
function native(f,records=[]){
 const calls=[];
 const transport=new Transport(f.config,async(url,options)=>{
  const line=f.config.lines.find(line=>url.includes(line.instance));assert.ok(line);calls.push({line:line.phone,url,body:options.body&&JSON.parse(options.body)});
  if(url.includes('/instance/fetchInstances'))return {ok:true,json:async()=>[{name:line.instance,ownerJid:line.phone+'@s.whatsapp.net',connectionStatus:'open'}]};
  if(url.includes('/message/'))return {ok:true,json:async()=>({key:{id:'SYNTHETIC_SENT_'+calls.length}})};
  assert.match(url,/\/chat\/findMessages\//);const q=JSON.parse(options.body),historic=Date.parse(q.where.messageTimestamp?.gte)<f.config.activatedAt;
  const matches=records.filter(r=>r.line===line.phone&&Boolean(r.historic)===historic&&Object.entries(q.where.key).every(([k,v])=>r.record.key[k]===v)).map(r=>r.record);
  return {ok:true,json:async()=>({messages:{total:matches.length,records:structuredClone(matches.slice((q.page-1)*q.offset,q.page*q.offset))}})};
 });
 return {transport,calls};
}

test('old red PENDING rows do not consume the fast LIMIT before fresh blue and red events',async t=>{
 const f=fixture(t);f.config.responseTargetMs=3000;
 for(let i=0;i<35;i++)enqueue(f,event('SYNTHETIC_OLD_RED_'+i,RED,f.redCut-1,'57300000'+String(i).padStart(4,'0')));
 const before=f.store.db.prepare('SELECT * FROM events ORDER BY rowid').all();
 const blue=enqueue(f,event('SYNTHETIC_NEW_BLUE',BLUE,NOW-1000,'573000008881')),red=enqueue(f,event('SYNTHETIC_NEW_RED',RED,NOW-500,'573000008882')),sent=[];
 for(let i=0;i<2;i++)await drain(f.store,f.config,double(sent),f.engine);
 assert.deepEqual(sent.map(x=>x.line),[BLUE,RED]);
 assert.deepEqual(f.store.db.prepare('SELECT * FROM events WHERE id NOT IN (?,?) ORDER BY rowid').all(blue.id,red.id),before);
});

test('freshly queued replies to old red sources cannot starve valid outputs or borrow a newer revision',async t=>{
 const f=fixture(t);
 for(let i=0;i<25;i++){
  const phone='57300000'+String(i).padStart(4,'0'),old=enqueue(f,event('SYNTHETIC_OLD_QUEUE_'+i,RED,f.redCut-1,phone));
  enqueue(f,event('SYNTHETIC_NEW_SIBLING_'+i,RED,NOW-1000,phone));f.store.db.prepare("UPDATE events SET state='DONE' WHERE phone=?").run(phone);
  f.store.queue(old.id+':reply',phone,RED,'Conservar sin enviar.',false,f.store.conversation(phone).revision,'fumigacion:'+old.id);
 }
 const before=f.store.db.prepare('SELECT * FROM outbox ORDER BY rowid').all(),blue=prepare(f,event('SYNTHETIC_VALID_BLUE',BLUE,NOW-800,'573000008883')),red=prepare(f,event('SYNTHETIC_VALID_RED',RED,NOW-700,'573000008884')),sent=[];
 await flushOutbox(f.store,f.config,double(sent));assert.deepEqual(sent.map(x=>x.id),[blue.id,red.id]);
 assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox WHERE id NOT IN (?,?) ORDER BY rowid').all(blue.id,red.id),before);
});

for(const phase of ['owner','attention'])test('advancing the red cutoff during '+phase+' await leaves READY untouched',async t=>{
 const f=fixture(t),out=prepare(f,event('SYNTHETIC_CUT_RECHECK',RED)),sent=[],transport=double(sent);
 const advance=()=>{f.config.operationalLineScope.lineStartsAt[RED]=new Date(NOW+1000).toISOString();};
 if(phase==='owner')transport.verifyLine=async()=>advance();
 else{f.config.historyCheckRequired=true;transport.currentAttention=async()=>{advance();return {complete:true,sources:[],checks:[]};};}
 await flushOutbox(f.store,f.config,transport);assert.deepEqual(sent,[]);assert.deepEqual(f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(out.id),out);
});

test('a source that becomes old during understanding is not passed to Engine',async t=>{
 const f=fixture(t),e=enqueue(f,event('SYNTHETIC_UNDERSTANDING_CUT',RED,NOW-1000,PHONE,'Necesito tratar cucarachas.')),before=f.store.db.prepare('SELECT * FROM events WHERE id=?').get(e.id);let understood=0,processed=0;
 await drain(f.store,f.config,{...double([]),understand:async()=>{understood++;f.config.operationalLineScope.lineStartsAt[RED]=new Date(NOW+1000).toISOString();return {};}},{process:async()=>{processed++;}});
 assert.equal(understood,1);assert.equal(processed,0);assert.deepEqual(f.store.db.prepare('SELECT * FROM events WHERE id=?').get(e.id),before);
});

test('the dual history version replaces a blue-only cache and reads both exact owners and addresses',async t=>{
 const f=fixture(t);f.config.historyCheckRequired=true;enqueue(f,event('SYNTHETIC_NEW_DUAL_HISTORY',RED));
 f.store.savePriorHistory(PHONE,{cutoff:f.config.activatedAt,priorOutgoing:false,checks:[{line:BLUE,total:0}],guardVersion:'authorized-fumigacion-blue-only-canonical-and-alternate-phone-v1'},'SYNTHETIC_NEW_DUAL_HISTORY');
 const n=native(f);await drain(f.store,f.config,n.transport,f.engine);
 assert.equal(f.store.priorHistory(PHONE).guardVersion,operationalHistoryGuard(f.config));
 for(const line of [BLUE,RED])for(const address of ['remoteJid','remoteJidAlt'])assert.ok(n.calls.some(c=>c.line===line&&c.body?.offset===1&&c.body.where.key[address]===PN));
 assert.equal(f.store.conversation(PHONE).hold,0);
});

test('empty red READ metadata is ignored only in the exact dual profile without releasing old holds',async t=>{
 const f=fixture(t),record={key:{id:'SYNTHETIC_RED_READ',remoteJid:PN,fromMe:true},status:'READ'},n=native(f,[{line:RED,record}]);
 const attention=await n.transport.currentAttention(PHONE,{store:f.store});assert.equal(attention.complete,true);assert.deepEqual(attention.sources,[]);
 prepare(f,event('SYNTHETIC_EXISTING_CONVERSATION',RED));f.store.hold(PHONE,'SYNTHETIC_EXISTING_STAFF',true);await n.transport.currentAttention(PHONE,{store:f.store});assert.equal(f.store.conversation(PHONE).hold,1);
 f.config.operationalLineScope=null;await assert.rejects(()=>n.transport.currentAttention(PHONE),/ATTENTION_SOURCE_OUTSIDE_SCOPE/);
});

test('empty READ with an explicit PN alternative has identical strict behavior on both active lines',async t=>{
 const f=fixture(t);
 for(const line of [BLUE,RED]){
  const record={key:{id:'SYNTHETIC_ALT_READ_'+line,remoteJid:'123456789000991@lid',remoteJidAlt:PN,fromMe:true},MessageUpdate:[{status:'READ'}]};
  const n=native(f,[{line,record}]),attention=await n.transport.currentAttention(PHONE,{store:f.store});assert.equal(attention.complete,true);assert.deepEqual(attention.sources,[]);
  record.key.remoteJidAlt='573000009992@s.whatsapp.net';record.key.remoteJid=PN;
  await assert.rejects(()=>n.transport.currentAttention(PHONE,{store:f.store}),/ATTENTION_SOURCE_OUTSIDE_SCOPE/);
 }
});

test('human attention observed during an awaited owner check suppresses red without releasing or sending',async t=>{
 const f=fixture(t),out=prepare(f,event('SYNTHETIC_RED_OWNER_HOLD',RED)),sent=[];
 await flushOutbox(f.store,f.config,{...double(sent),verifyLine:async()=>{f.store.hold(PHONE,'SYNTHETIC_STAFF_DURING_OWNER',true);}});
 assert.deepEqual(sent,[]);assert.equal(f.store.conversation(PHONE).hold,1);assert.equal(f.store.db.prepare('SELECT state FROM outbox WHERE id=?').get(out.id).state,'SUPPRESSED_HUMAN');
});

test('red acknowledgements need full prior-history coverage and retain historical real human text',async t=>{
 const f=fixture(t),read={key:{id:'SYNTHETIC_RED_HISTORY_READ',remoteJid:PN,fromMe:true},status:'READ'},n=native(f,[{line:RED,historic:true,record:read}]);
 let history=await n.transport.priorHistory(PHONE);assert.equal(history.priorOutgoing,false);assert.ok(history.checks.some(c=>c.line===RED&&c.readReceiptCount===1&&c.complete));
 const human={key:{id:'SYNTHETIC_RED_HISTORY_HUMAN',remoteJid:PN,fromMe:true},messageTimestamp:(f.config.activatedAt-1000)/1000,message:{conversation:'Yo atiendo este chat.'}};
 const real=native(f,[{line:RED,historic:true,record:read},{line:RED,historic:true,record:human}]);history=await real.transport.priorHistory(PHONE);assert.equal(history.priorOutgoing,true);
});

for(const patch of [{status:'EDITED'},{message:{conversation:'Mensaje real'}},{message:{imageMessage:{}}},{key:{id:'SYNTHETIC_BAD_ALT',remoteJid:PN,remoteJidAlt:'573000009992@s.whatsapp.net',fromMe:true}}])test('red READ never masks uncertain body, mutation or contradictory identity '+JSON.stringify(patch),async t=>{
 const f=fixture(t),record={key:{id:'SYNTHETIC_UNCERTAIN_RED',remoteJid:PN,fromMe:true},status:'READ',...patch},n=native(f,[{line:RED,record}]);await assert.rejects(()=>n.transport.currentAttention(PHONE,{store:f.store}),/ATTENTION_SOURCE_OUTSIDE_SCOPE/);
});

test('a genuine older red outgoing still holds a fresh red response and UNCERTAIN stays intact',async t=>{
 const f=fixture(t);f.config.historyCheckRequired=true;const out=prepare(f,event('SYNTHETIC_HELD_RED_REPLY',RED));
 f.store.queue('SYNTHETIC_PRIOR_UNCERTAIN',PHONE,RED,'Resultado anterior.',false,out.revision);f.store.db.prepare("UPDATE outbox SET state='UNCERTAIN',mid='SYNTHETIC_UNCERTAIN_MID' WHERE id='SYNTHETIC_PRIOR_UNCERTAIN'").run();const prior=f.store.db.prepare("SELECT * FROM outbox WHERE id='SYNTHETIC_PRIOR_UNCERTAIN'").get();
 const record={key:{id:'SYNTHETIC_STAFF_BEFORE_RED_CUT',remoteJid:PN,fromMe:true},status:'READ',messageTimestamp:(f.redCut-1000)/1000,message:{conversation:'Atiendo personalmente.'}},n=native(f,[{line:RED,record}]);await flushOutbox(f.store,f.config,n.transport);
 assert.equal(f.store.conversation(PHONE).hold,1);assert.equal(n.calls.filter(c=>c.url.includes('/message/')).length,0);assert.deepEqual(f.store.db.prepare("SELECT * FROM outbox WHERE id='SYNTHETIC_PRIOR_UNCERTAIN'").get(),prior);
});

test('old red conversations do not consume the inactivity LIMIT before fresh eligible cases',async t=>{
 const f=fixture(t);f.config.operationalLineScope.lineStartsAt[RED]=new Date(NOW-30*60000).toISOString();f.config.inactivityFollowupEnabled=true;
 f.config.mariaProgram={enabled:true,url:'https://synthetic.invalid/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:f.config.activatedAt,expiresAt:NOW+86400000};
 const sources=new Map();
 function openCase(phone,line,at){
  const e=enqueue(f,event('SYNTHETIC_IDLE_'+phone,line,at,phone,'Necesito una cotización'));sources.set(phone,e);f.store.db.prepare("UPDATE events SET state='DONE',received_at=? WHERE id=?").run(at+10,e.id);
  const caseId='fumigacion:'+e.id;f.store.saveConversation(phone,{caseId,lastHandledSourceId:e.id,slots:{},asked:['service']});f.store.savePriorHistory(phone,{cutoff:f.config.activatedAt,priorOutgoing:false,checks:[{line,total:0}],guardVersion:operationalHistoryGuard(f.config)},e.id);
  f.store.queue(e.id+':reply',phone,line,'¿Para qué plaga necesitas el servicio?',false,f.store.conversation(phone).revision,caseId);const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply'),mid='MID_'+e.id;f.store.recordFirstBotReply(row,mid,f.config.bot,at+500);
  f.store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED',created=?,updated=? WHERE id=?").run(mid,at+100,at+500,row.id);f.store.delivery(mid,line,'DELIVERED');f.store.db.prepare('UPDATE outbox SET updated=? WHERE id=?').run(at+600,row.id);
 }
 for(let i=0;i<25;i++)openCase('57300000'+String(i).padStart(4,'0'),RED,NOW-31*60000);
 openCase('573000008885',BLUE,NOW-23*60000);openCase('573000008886',RED,NOW-21*60000);
 const transport={currentCustomerActivity:async phone=>({complete:true,sources:[{id:sources.get(phone).id,line:sources.get(phone).line,at:sources.get(phone).at}]}),fetcher:async(_url,options)=>({ok:true,json:async()=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:f.config.mariaProgram.actorId,phone:JSON.parse(options.body).phone,complete:true,eligibleForFollowup:true})})};
 assert.equal(inactivityCandidate(f.config,f.store,'573000000000',NOW),null);
 assert.equal((await queueInactivityFollowups(f.store,f.config,transport,NOW)).queued,1);assert.equal((await queueInactivityFollowups(f.store,f.config,transport,NOW)).queued,1);
 const queued=f.store.db.prepare('SELECT body FROM inactivity_followups').all().map(r=>f.store.open(r.body));assert.deepEqual(queued.map(x=>x.line),[BLUE,RED]);assert.equal(queued.length,2);
});
