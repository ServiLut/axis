import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {Transport,drain} from '../automation/service-bots/transport.mjs';
import {parseChiefCommand,enqueueChiefCommand} from '../automation/service-bots/chief-actions.mjs';

function config(){const now=Date.now();return {company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:now-60000,provider:'https://synthetic.invalid',lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'chief-native-'+i,apiKey:'synthetic_instance_key_not_real_'+i})),operationalLineScope:{company:'fumigacion',version:'authorized-fumigacion-blue-only-v1',authorizationSource:'direct-user-20261009-red-block-24h',authorizedAt:new Date(now-60000).toISOString(),activeLines:[BUSINESSES.fumigacion.phones[0]],suspendedLines:[BUSINESSES.fumigacion.phones[1]],reportedBlockedDurationHours:24}};}
const chiefSource=c=>({id:'SYNTHETIC_NATIVE_CHIEF_SOURCE',phone:SANDRA,line:c.lines[0].phone,at:Math.floor(Date.now()/1000)*1000,kind:'text',fromMe:false,forwarded:false,quotedId:null,text:'María Ángel, dime cuántos chats han entrado hoy de las dos líneas de WhatsApp.'});
function nativeSource(source){return {key:{id:source.id,remoteJid:SANDRA+'@s.whatsapp.net',fromMe:false},messageTimestamp:source.at/1000,message:{conversation:source.text}};}
function nativeTransport(c,source,patch={}){const calls=[],record=nativeSource(source);if(patch.record)patch.record(record);const fetcher=async(url,options)=>{calls.push({url,method:options.method,body:options.body&&JSON.parse(options.body)});if(url.includes('/instance/fetchInstances'))return {ok:true,json:async()=>[{name:c.lines[0].instance,ownerJid:(patch.foreignOwner?'573000009999':c.lines[0].phone)+'@s.whatsapp.net',connectionStatus:'open'}]};assert.ok(url.endsWith('/chat/findMessages/'+c.lines[0].instance));return {ok:true,json:async()=>({messages:{total:patch.total??1,records:patch.duplicate?[record,record]:[record]}})};};return {t:new Transport(c,fetcher),calls};}

test('chief source verification uses only the exact native MID and owner; an explicit native alternate is resolved without name or body guessing',async()=>{
 const c=config(),source=chiefSource(c),f=nativeTransport(c,source,{record:record=>{record.key.remoteJid='123456789@lid';record.key.remoteJidAlt=SANDRA+'@s.whatsapp.net';}});
 assert.deepEqual(await f.t.verifyChiefCommandSource(source),{verified:true,sourceId:source.id,phone:SANDRA,line:source.line,at:source.at});
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].method,'GET');assert.deepEqual(f.calls[1].body,{where:{key:{id:source.id}},offset:2,page:1});assert.ok(f.calls.every(call=>!/send|restart|logout|connect|qr/i.test(call.url)));
});

test('a foreign owner, ambiguous native result or any sender/body/time/forward/citation mismatch cannot authorize a chief command',async()=>{
 const c=config(),source=chiefSource(c);
 const variants=[{foreignOwner:true},{total:2},{duplicate:true},{record:r=>{r.key.remoteJid='123456789@lid';}},{record:r=>{r.key.remoteJidAlt='573000009999@s.whatsapp.net';}},{record:r=>{r.key.fromMe=true;}},{record:r=>{r.message.conversation='María Ángel, otra instrucción.';}},{record:r=>{r.messageTimestamp-=1;}},{record:r=>{r.contextInfo={isForwarded:true};}},{record:r=>{r.contextInfo={stanzaId:'UNRELATED_NATIVE_CITATION'};}}];
 for(const patch of variants){const f=nativeTransport(c,source,patch);await assert.rejects(()=>f.t.verifyChiefCommandSource(source));assert.ok(f.calls.length<=2);}
 const suspended=nativeTransport(c,source);await assert.rejects(()=>suspended.t.verifyChiefCommandSource({...source,line:c.lines[1].phone}));assert.equal(suspended.calls.length,0);
});

test('a ready client reply is flushed before a potentially slower chief read and the internal result retains ACCEPTED as unproven delivery',async()=>{
 const c={...config(),responseTargetMs:3000},s=new Store(':memory:',c.company,randomBytes(32)),engine=new Engine(s,c),customer='573000001234',order=[];
 try{
  const initial={id:'SYNTHETIC_READY_CUSTOMER_SOURCE',phone:customer,line:c.lines[0].phone,at:Date.now()-1000,kind:'text',fromMe:false,forwarded:false,text:'Hola'};s.enqueue(initial);s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(initial.id);const conversation=s.conversation(customer);s.queue('SYNTHETIC_READY_CUSTOMER_REPLY',customer,c.lines[0].phone,'Hola, puedo ayudarte con tu consulta.',false,conversation.revision);
  const source=chiefSource(c);s.enqueue(source);s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(source.id);enqueueChiefCommand(s,c,source,parseChiefCommand(source,c));
  const t={verifyLine:async()=>{},verifyChiefCommandSource:async e=>{order.push('chief-source-read');return {verified:true,sourceId:e.id,phone:SANDRA,line:e.line,at:e.at};},send:async row=>{order.push(row.internal?'chief-result-send':'client-reply-send');return 'SYNTHETIC_SENT_'+row.id.replace(/[^A-Za-z0-9]/g,'_').slice(-50);},fetcher:async()=>{throw Error('PROGRAM_NETWORK_FORBIDDEN');}};
  const result=await drain(s,c,t,engine);assert.ok(order.indexOf('client-reply-send')>=0);assert.ok(order.indexOf('client-reply-send')<order.indexOf('chief-source-read'));assert.ok(order.indexOf('chief-source-read')<order.indexOf('chief-result-send'));assert.equal(result.chiefActions.completed,1);const out=s.db.prepare('SELECT state,mid FROM outbox WHERE internal=1 AND phone=?').all(SANDRA);assert.equal(out.length,1);assert.equal(out[0].state,'ACCEPTED');assert.ok(out[0].mid);assert.equal(s.conversation(customer).hold,0);
 }finally{s.close();}
});
