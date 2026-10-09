import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {Transport,drain,flushOutbox} from '../automation/service-bots/transport.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {selectPrice,verifyPriceSource} from '../automation/service-bots/prices.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {assertOperationalLineScope,operationalCoverage,operationalHistoryGuard} from '../automation/service-bots/line-scope.mjs';

const customer='573001112233';
function fixture(scoped=true){
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,historyCheckRequired:true,
  provider:'https://own.example',activatedAt:Date.now()-60000,responseTargetMs:3000,
  lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i,apiKey:String(i).repeat(32)}))};
 if(scoped)c.operationalLineScope={version:'authorized-fumigacion-blue-only-v1',company:'fumigacion',
  activeLines:[c.lines[0].phone],suspendedLines:[c.lines[1].phone],authorizedAt:new Date(Date.now()-2000).toISOString(),
  authorizationSource:'direct-user-20261009-red-block-24h',reportedBlockedDurationHours:24};
 const calls=[];
 const t=new Transport(c,async(url,options)=>{
  const line=c.lines.find(l=>url.includes(l.instance));calls.push({url,options,line:line?.phone});
  if(url.includes('/message/'))return {ok:true,json:async()=>({key:{id:'ISOLATED_SENT_'+calls.length}})};
  return {ok:true,json:async()=>url.includes('fetchInstances')?
   [{name:line.instance,ownerJid:line.phone+'@s.whatsapp.net',connectionStatus:line===c.lines[0]?'open':'connecting'}]:{messages:{total:0,records:[]}}};
 });
 return {c,t,calls};
}
const event=(c,patch={})=>({id:'NEW_BLUE_TURN',phone:customer,line:c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',text:'Hola',...patch});

test('without explicit authorization a connecting red line still blocks the two-line history guard',async()=>{
 const {t,calls}=fixture(false);
 await assert.rejects(()=>t.priorHistory(customer),/CHANNEL_NOT_OPEN/);
 assert.equal(calls.length,4);assert.equal(calls.at(-1).line,'573126938721');
});

test('explicit blue-only history checks exact owner and both phone identities without declaring red coverage',async()=>{
 const {c,t,calls}=fixture();const result=await t.priorHistory(customer);
 assert.equal(result.guardVersion,operationalHistoryGuard(c));assert.equal(result.priorOutgoing,false);
 assert.equal(result.checks.length,2);assert.equal(calls.length,3);
 assert.ok(calls.every(call=>call.line===c.lines[0].phone));
 assert.ok(calls.every(call=>call.options.headers.apikey===c.lines[0].apiKey));
 assert.equal(result.coverage.fullCompanyCoverageComplete,false);assert.equal(result.coverage.suspendedLineCoverageComplete,false);
 assert.deepEqual(result.coverage.suspendedLines,[c.lines[1].phone]);assert.match(result.scope,/red-history-not-read/);
});

test('attention and new customer activity cover the authorized blue line only',async()=>{
 const {c,t,calls}=fixture();
 for(const result of [await t.currentAttention(customer),await t.currentCustomerActivity(customer,Date.now()-1000)]){
  assert.equal(result.complete,true);assert.equal(result.checks.length,2);
  assert.equal(result.coverage.fullCompanyCoverageComplete,false);
 }
 assert.equal(calls.length,6);assert.ok(calls.every(call=>call.line===c.lines[0].phone));
});

test('explicit scope never permits red sends or red operational verification',async()=>{
 const {c,t,calls}=fixture();const red=c.lines[1];
 await assert.rejects(()=>t.verifyLine(red.phone),/LINE_SUSPENDED_BY_AUTHORIZED_SCOPE/);
 await assert.rejects(()=>t.send({phone:customer,line:red.phone,internal:false},'Hola.'),/LINE_SUSPENDED_BY_AUTHORIZED_SCOPE/);
 await assert.rejects(()=>t.request(red,'/instance/connect/'+red.instance),/LINE_SUSPENDED_BY_AUTHORIZED_SCOPE/);
 assert.equal(calls.length,0);
 assert.ok(await t.send({phone:customer,line:c.lines[0].phone,internal:false},'Hola.'));
 assert.equal(calls.length,1);assert.equal(calls[0].line,c.lines[0].phone);
});

test('red binding can be verified only for authenticated observation, without OPEN or send permission',async()=>{
 const {c,t,calls}=fixture();const red=c.lines[1];
 const binding=await t.verifyLineBinding(red.phone);
 assert.equal(binding.ownerVerified,true);assert.equal(binding.open,false);
 await t.request(red,'/chat/findMessages/'+red.instance,{where:{key:{id:'STAFF_OBSERVATION'}}});
 await assert.rejects(()=>t.request(red,'/message/sendText/'+red.instance,{number:customer,text:'Never'}),/LINE_SUSPENDED_BY_AUTHORIZED_SCOPE/);
 assert.equal(calls.length,2);assert.ok(calls.every(call=>!call.url.includes('/message/')));
});

test('wrong company, wrong authorization, swapped or missing bindings cannot silently enable blue-only operation',()=>{
 const {c}=fixture();
 for(const changed of [
  {...c,company:'servicio-tecnico'}, {...c,name:'S.TECNICO'}, {...c,lines:[c.lines[0]]},
  {...c,operationalLineScope:{...c.operationalLineScope,authorizationSource:'untrusted-chat'}},
  {...c,operationalLineScope:{...c.operationalLineScope,activeLines:[c.lines[1].phone]}},
  {...c,operationalLineScope:{...c.operationalLineScope,suspendedLines:[c.lines[0].phone]}},
  {...c,operationalLineScope:{...c.operationalLineScope,reportedBlockedDurationHours:12}},
  {...c,operationalLineScope:{...c.operationalLineScope,authorizedAt:'invalid'}}
 ])assert.throws(()=>assertOperationalLineScope(changed),/OPERATIONAL_LINE_SCOPE_REQUIRED/);
 assert.equal(operationalCoverage({...c,operationalLineScope:null}).fullCompanyCoverageComplete,true);
});

test('blue owner mismatch, HTTP error and partial native coverage remain conservative',async()=>{
 const {c}=fixture();
 for(const failure of ['owner','http','coverage']){
  const t=new Transport(c,async(url)=>failure==='http'?{ok:false,status:503}:{ok:true,json:async()=>url.includes('fetchInstances')?
   [{name:c.lines[0].instance,ownerJid:(failure==='owner'?'573009998877':c.lines[0].phone)+'@s.whatsapp.net',connectionStatus:'open'}]:{messages:{total:101,records:[]}}});
  await assert.rejects(()=>t.currentAttention(customer),/CHANNEL_OWNER_MISMATCH|CHANNEL_HTTP_503|ATTENTION_COVERAGE_UNVERIFIED/);
 }
});

test('approved direct price table rechecks only the authorized blue owner; a legacy red source remains blocked',async()=>{
 const {t,c,calls}=fixture();
 const entry=selectPrice({service:'cucarachas',site:'casa',area:'50 m²',location:'medellin'},[approvedBusinessPriceSchedule()]).entry;
 assert.equal(await verifyPriceSource(entry,t),true);assert.equal(calls.length,1);assert.equal(calls[0].line,c.lines[0].phone);
 await assert.rejects(()=>verifyPriceSource({source:{line:c.lines[1].phone}},t),/LINE_SUSPENDED_BY_AUTHORIZED_SCOPE/);
 assert.equal(calls.length,1);
});

test('a new isolated blue turn invalidates the old full-company cache and can reply while red stays disconnected',async()=>{
 const {c,t,calls}=fixture(),s=new Store(':memory:',c.company,randomBytes(32));
 try{
  // This fixture isolates transport; the Store implementation separately
  // checks actual cross-line sources. A previous absent source is not sharing.
  s.hasSourcesOutsideLine=()=>false;
  s.savePriorHistory(customer,{cutoff:c.activatedAt,guardVersion:'canonical-and-alternate-phone-v2',priorOutgoing:false,checks:[]},'OLD_CHECK');
  s.enqueue(event(c));await drain(s,c,t,new Engine(s,c));
  assert.equal(s.priorHistory(customer).guardVersion,operationalHistoryGuard(c));
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='ACCEPTED'").get().n,1);
  assert.ok(calls.every(call=>call.line===c.lines[0].phone));
 }finally{s.close();}
});

test('old queued turns and red turns do not reach the model, provider or migrate to blue',async()=>{
 for(const kind of ['old','red','shared']){
  const {c,t,calls}=fixture(),s=new Store(':memory:',c.company,randomBytes(32));
  try{
   s.hasSourcesOutsideLine=()=>kind==='shared';
   let model=0;t.understand=async()=>{model++;return {};};
   const e=event(c,kind==='old'?{at:Date.parse(c.operationalLineScope.authorizedAt)-1}:kind==='red'?{line:c.lines[1].phone}:{});
   s.enqueue(e);await drain(s,c,t,new Engine(s,c));
   assert.equal(model,0);assert.equal(calls.length,0);
   assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OPERATIONAL_SCOPE_REVIEW');
   assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  }finally{s.close();}
 }
});

test('ready historical and red outputs remain unsent rather than becoming uncertain sends or rewritten routes',async()=>{
 for(const kind of ['old','red','shared']){
  const {c,t,calls}=fixture(),s=new Store(':memory:',c.company,randomBytes(32));
  try{
   s.hasSourcesOutsideLine=()=>kind==='shared';
   s.queue('PENDING_OUTPUT',customer,kind==='red'?c.lines[1].phone:c.lines[0].phone,'Hola.',false,0);
   if(kind==='old')s.db.prepare('UPDATE outbox SET created=?').run(Date.parse(c.operationalLineScope.authorizedAt)-1);
   const before=s.db.prepare('SELECT line,body FROM outbox').get();const result=await flushOutbox(s,c,t);
   const after=s.db.prepare('SELECT line,body,state,mid FROM outbox').get();
   assert.equal(result.uncertain,0);assert.equal(result.accepted,0);assert.equal(calls.length,0);
   assert.equal(after.line,before.line);assert.equal(after.body,before.body);assert.equal(after.mid,null);
   assert.equal(after.state,kind==='red'?'SUSPENDED_LINE_REVIEW':'OPERATIONAL_SCOPE_REVIEW');
  }finally{s.close();}
 }
});

test('a red duplicate arriving during prior-history read blocks model understanding of the blue event',async()=>{
 const {c,t,calls}=fixture(),s=new Store(':memory:',c.company,randomBytes(32));
 try{
  const e=event(c);s.enqueue(e);let model=0;
  t.priorHistory=async()=>{s.enqueue({...e,line:c.lines[1].phone});return {cutoff:c.activatedAt,guardVersion:operationalHistoryGuard(c),priorOutgoing:false,checks:[]};};
  t.understand=async()=>{model++;return {};};
  await drain(s,c,t,new Engine(s,c));
  assert.equal(model,0);assert.equal(calls.length,0);
  assert.equal(s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'OPERATIONAL_SCOPE_REVIEW');
 }finally{s.close();}
});

test('a red duplicate arriving during native attention blocks a ready blue reply before the send reservation',async()=>{
 const {c,t,calls}=fixture(),s=new Store(':memory:',c.company,randomBytes(32));
 try{
  const e=event(c);s.enqueue(e);s.queue('POST_WAIT_REPLY',customer,c.lines[0].phone,'Hola.',false,s.conversation(customer).revision);
  t.currentAttention=async()=>{s.enqueue({...e,line:c.lines[1].phone});return {complete:true,sources:[],checks:[],through:Date.now()};};
  const result=await flushOutbox(s,c,t);
  assert.equal(result.accepted,0);assert.equal(result.uncertain,0);
  assert.ok(calls.every(call=>!call.url.includes('/message/')));
  assert.equal(s.db.prepare('SELECT state FROM outbox WHERE id=?').get('POST_WAIT_REPLY').state,'OPERATIONAL_SCOPE_REVIEW');
 }finally{s.close();}
});
