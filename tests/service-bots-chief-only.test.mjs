import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {BUSINESSES,SANDRA,DIEGO,validateEvent} from '../automation/service-bots/config.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {Transport,drain} from '../automation/service-bots/transport.mjs';
import {decodeWebhook} from '../automation/service-bots/webhook.mjs';
const config=company=>({company,...BUSINESSES[company],enabled:false,chiefOnly:true,activatedAt:Date.now()-3600000,lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company+'-'+i}))});
const ev=(c,patch={})=>({id:'CHIEF_EVENT_01',phone:SANDRA,line:c.lines[0].phone,fromMe:false,kind:'text',text:c.bot+' que funciones puedes realizar en este momento?',at:Date.now(),quotedId:null,...patch});
test('chief-only ingestion accepts only the two verified internal phones, with bounded recovery',()=>{
 const c=config('fumigacion'),e=ev(c);const body={instance:c.lines[0].instance,owner:e.line,event:{...e,at:new Date(e.at).toISOString()}};
 assert.ok(validateEvent(body,c));assert.ok(validateEvent({...body,event:{...body.event,phone:DIEGO}},c));
 for(const patch of [{phone:'573001112233'},{group:true},{jid:'123@g.us'}])assert.equal(validateEvent({...body,event:{...body.event,...patch}},c),null);
 const older={...body,event:{...body.event,at:new Date(Date.now()-1800000).toISOString()}};
 assert.equal(validateEvent(older,c),null);assert.ok(validateEvent(older,c,Date.now(),true));
 assert.equal(validateEvent({...older,event:{...older.event,fromMe:true}},c,Date.now(),true),null);
});
test('authenticated phone alternative resolves an internal LID; unknown identities and forwards confer no authority',()=>{
 const c=config('fumigacion');const native={instance:c.lines[0].instance,event:'messages.upsert',data:{key:{id:'NATIVE_CHIEF01',fromMe:false,remoteJid:'123456789@lid',remoteJidAlt:SANDRA+'@s.whatsapp.net'},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'María Ángel que puedes hacer?'},contextInfo:{stanzaId:'EXACTQUOTE1'}}};
 assert.equal(decodeWebhook(native,c).events[0].event.phone,SANDRA);assert.equal(decodeWebhook(native,c).events[0].event.quotedId,'EXACTQUOTE1');
 for(const patch of [{remoteJidAlt:undefined},{remoteJid:'123@g.us'},{remoteJidAlt:'573001112233@s.whatsapp.net'},{remoteJid:SANDRA+'@s.whatsapp.net',remoteJidAlt:DIEGO+'@s.whatsapp.net'}])assert.equal(decodeWebhook({...native,data:{...native.data,key:{...native.data.key,...patch}}},c).events.length,0);
 assert.equal(decodeWebhook({...native,data:{...native.data,contextInfo:{isForwarded:true}}},c).events[0].event.forwarded,true);
});
for(const company of Object.keys(BUSINESSES))test(company+': directed capabilities reply under hold preserves every customer gate and deduplicates',async()=>{
 const c=config(company),s=new Store(':memory:',company,randomBytes(32)),engine=new Engine(s,c);try{
  s.enqueue(ev(c,{id:'HUMAN_EVENT_1',fromMe:true,at:Date.now()-10}));s.enqueue(ev(c,{id:'STAFF_CUSTOMER',phone:'573001112233',fromMe:true,at:Date.now()-10}));
  s.hold(SANDRA,'HUMAN_EVENT_1',true);s.hold('573001112233','STAFF_CUSTOMER',true);
  const e=ev(c,{at:Date.now()+1});s.enqueue(e);await engine.process(e);await engine.process(e);
  assert.equal(s.conversation(SANDRA).hold,1);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,1);
  s.queue('OLD_CUSTOMER_REPLY','573001112233',e.line,'Hola',false,0);
  const sent=[];await drain(s,c,{verifyLine:async()=>{},send:async(o,text)=>{sent.push({o,text});return 'OWN_REPLY_001';}},engine);
  assert.equal(sent.length,1);assert.equal(sent[0].o.phone,SANDRA);assert.equal(sent[0].o.internal,1);assert.match(sent[0].text,/aprendizaje/);
  assert.equal(s.db.prepare('SELECT state FROM outbox WHERE id=?').get('OLD_CUSTOMER_REPLY').state,'READY');
  const command=ev(c,{id:'RELEASE_REQUEST1',text:c.bot+', retoma el chat de 573001112233',at:Date.now()+2});s.enqueue(command);await engine.process(command);
  assert.equal(s.conversation('573001112233').hold,1);assert.equal(s.db.prepare('SELECT state FROM chief_requests').get().state,'REVIEW');
 }finally{s.close();}
});
test('forwarded or unaddressed internal text is observed; customer events never generate a reply in learning mode',async()=>{
 const c=config('fumigacion'),s=new Store(':memory:',c.company,randomBytes(32)),engine=new Engine(s,c);try{
  for(const patch of [{id:'FORWARDED001',forwarded:true},{id:'STAFF_CONTEXT1',text:'María Ángel dijo que podía'},{id:'CUSTOMER001',phone:'573001112233'}]){const e=ev(c,patch);s.enqueue(e);await engine.process(e);}
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  const e=ev(c,{id:'DIEGO_QUERY_01',phone:DIEGO});s.enqueue(e);await engine.process(e);assert.equal(s.db.prepare('SELECT phone FROM outbox').get().phone,DIEGO);
 }finally{s.close();}
});
test('transport rejects customer delivery before contacting the provider in chief-only mode',async()=>{
 const c=config('fumigacion');let calls=0;const t=new Transport(c,async()=>{calls++;throw Error('MUST_NOT_CALL');});
 await assert.rejects(()=>t.send({phone:'573001112233',line:c.lines[0].phone,internal:false},'Hola'),/CUSTOMER_GATE_CLOSED/);assert.equal(calls,0);
});
