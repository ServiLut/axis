// Every native row, key and delivery below is a local synthetic test fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {Transport} from '../automation/service-bots/transport.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {parseChiefCommand,enqueueChiefCommand,drainChiefActions,reviewChiefActions} from '../automation/service-bots/chief-actions.mjs';
import {chiefCustomerSimulationStatus,finishChiefCustomerSimulation,CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD} from '../automation/service-bots/chief-customer-simulation.mjs';
import {executeChiefCustomerSimulation} from '../automation/service-bots/chief-customer-simulation-hook.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD} from '../automation/service-bots/client-requested-schedule.mjs';
const BLUE='573126944997',RED='573126938721',OTHER='573000001234',now=Date.parse('2026-10-16T22:30:00Z');
const sha=text=>createHash('sha256').update(text).digest('hex');
let sequence=0;
function fixture(t){
  t.mock.timers.enable({apis:['Date'],now});
  const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:false,chiefOnly:true,replyOnlyToChief:true,activatedAt:now-60000,provider:'https://fixture.invalid',lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'fixture-chief-'+i,apiKey:'SYNTHETIC_LOCAL_ONLY_'+i})),operationalLineScope:{company:'fumigacion',version:'authorized-fumigacion-blue-only-v1',authorizationSource:'direct-user-20261009-red-block-24h',authorizedAt:new Date(now-60000).toISOString(),activeLines:[BLUE],suspendedLines:[RED]}};
  const s=new Store(':memory:','fumigacion',randomBytes(32)),engine=new Engine(s,c),records=new Map(),requests=[];
  const mid=()=>'3EB0'+(++sequence).toString(16).toUpperCase().padStart(20,'0');
  const source=(text,patch={})=>{t.mock.timers.tick(1100);return {id:mid(),phone:SANDRA,line:BLUE,at:Math.floor(Date.now()/1000)*1000,kind:'text',fromMe:false,forwarded:false,quotedId:null,text,...patch};};
  const native=e=>({key:{id:e.id,remoteJid:e.phone+'@s.whatsapp.net',fromMe:e.fromMe},messageTimestamp:e.at/1000,message:e.quotedId?{extendedTextMessage:{text:e.text,contextInfo:{stanzaId:e.quotedId}}}:{conversation:e.text}});
  const transport=new Transport(c,async(url,options)=>{
    requests.push({url,method:options.method,body:options.body&&JSON.parse(options.body)});
    assert.equal(/send|connect|restart|logout|qr|openai|registrations/i.test(url),false,url);
    if(url.includes('/instance/fetchInstances'))return {ok:true,json:async()=>[{name:c.lines[0].instance,ownerJid:BLUE+'@s.whatsapp.net',connectionStatus:'open'}]};
    assert.ok(url.endsWith('/chat/findMessages/'+c.lines[0].instance));const id=JSON.parse(options.body).where.key.id,record=records.get(id);return {ok:true,json:async()=>({messages:{total:record?1:0,records:record?[record]:[]}})};
  });
  const dispatch=async(text,patch={},afterEnqueue=()=>{})=>{const e=source(text,patch);records.set(e.id,native(e));s.enqueue(e);afterEnqueue(e);await engine.process(e);const drain=await drainChiefActions(s,c,transport),command=reviewChiefActions(s,c).commands.find(row=>row.sourceId===e.id);return {source:e,drain,command};};
  const deliver=()=>{t.mock.timers.tick(1000);const rows=s.db.prepare("SELECT * FROM outbox WHERE state='READY' AND phone=? AND internal=1 ORDER BY rowid").all(SANDRA);for(const row of rows){const id=mid(),e={id,phone:SANDRA,line:BLUE,at:Math.floor(Date.now()/1000)*1000,fromMe:true,text:s.open(row.body)};s.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id=?").run(id,row.id);s.delivery(id,BLUE,'DELIVERED');records.set(id,{...native(e),status:'DELIVERY_ACK'});}return rows;};
  const close=()=>{const status=chiefCustomerSimulationStatus();if(['ACTIVE','REVIEW'].includes(status.status)){const e=source('María Ángel, termina prueba cliente');finishChiefCustomerSimulation({simulationId:status.simulationId,source:e,sourceProof:{guard:CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,verified:true,sourceId:e.id,phone:SANDRA,line:BLUE,at:e.at,textHash:sha(e.text),nativeProofHash:sha('fixture only '+e.id)}});}s.close();};
  return {c,s,engine,transport,records,requests,source,dispatch,deliver,close};
}
const first='Esto es una PRUEBA. Tengo cucarachas en un apartamento de Itagüí de 2 habitaciones.';
const prefix='María Ángel, prueba cliente: ';

test('literal chief commands preserve the full native source and cannot be selected by an alias, quote, negation or invented plan',async t=>{
  const f=fixture(t);try{
    for(const [text,command] of [['María Ángel, inicia prueba cliente','start'],[prefix+first,'turn'],['María Ángel, termina prueba cliente','finish']])assert.equal(parseChiefCommand(f.source(text),f.c).params.command,command);
    for(const text of ['Inicia prueba cliente','María, inicia prueba cliente','María Ángel, no inicia prueba cliente','María Ángel, si inicia prueba cliente','María Ángel dijo: inicia prueba cliente','«María Ángel, inicia prueba cliente»','María Ángel, inicia prueba cliente y crea una orden'])assert.notEqual(parseChiefCommand(f.source(text),f.c)?.action,'customer-simulation',text);
    const source=f.source('María Ángel, revisa los servicios de hoy en Tenaxis.'),native={verified:true,sourceId:source.id,phone:SANDRA,line:BLUE,at:source.at};
    const fake=await executeChiefCustomerSimulation(f.s,f.c,f.transport,source,{action:'customer-simulation',params:{command:'start'}},native);assert.equal(fake.state,'BLOCKED');assert.equal(chiefCustomerSimulationStatus().status,'NOT_ACTIVE_OR_LOST_AFTER_RESTART');
  }finally{f.close();}
});

test('the real chief ledger and internal stable output IDs surround an isolated full customer draft without changing holds or ordinary business',async t=>{
  const f=fixture(t);try{
    for(const phone of [OTHER,SANDRA]){const prior=f.source('Contexto sintético previo',{phone});f.s.enqueue(prior);f.s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(prior.id);f.s.hold(phone,'SYNTHETIC_STAFF_HOLD');}
    const start=await f.dispatch('María Ángel, inicia prueba cliente');assert.equal(start.command.status,'DONE');f.deliver();
    const steps=[first,'Sí, deseo continuar con la cotización de $129.000.','Nombre: Persona Sintética\nDirección: Calle de Prueba 0 # 0','Confirmo'];let last;
    for(const text of steps){last=await f.dispatch(prefix+text);assert.equal(last.command.status,'DONE',last.command.error);if(last.command.result.simulationOutputs.length){assert.deepEqual(last.command.responseIds,last.command.result.simulationOutputs.map(output=>output.outboxId));assert.ok(last.command.responseIds.every(id=>/^chief-simulation:/.test(id)));}f.deliver();}
    const result=last.command.result.data,envelope=result.testOrderDraft.envelope,payload=envelope.syntheticPayload;
    assert.equal(payload.customerName,'Persona Sintética');assert.equal(payload.address,'Calle de Prueba 0 # 0');assert.equal(payload.quote.priceCop,129000);assert.equal(result.businessWrites,0);assert.equal(result.providerCalls,0);assert.equal(result.modelCalls,0);assert.equal(result.commercialDeliveryVerified,false);
    for(const ref of Object.values(payload.sources)){const map=envelope.sourceMap.find(row=>row.syntheticSourceId===ref.id);assert.equal(map.customerTextHash,sha(ref.text));assert.equal(map.nativeTextHash,envelope.chiefSources.find(row=>row.id===map.chiefSourceId).textHash);assert.notEqual(map.nativeTextHash,map.customerTextHash);}
    assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM conversations WHERE phone=?').get('570000000000').n,0);assert.equal(f.s.conversation(OTHER).hold,1);assert.equal(f.s.conversation(SANDRA).hold,1);assert.equal(f.c.enabled,false);assert.equal(f.c.replyOnlyToChief,true);
    const old=reviewChiefActions(f.s,f.c),outCount=f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;await drainChiefActions(f.s,f.c,f.transport);assert.deepEqual(reviewChiefActions(f.s,f.c),old);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,outCount);
    const end=await f.dispatch('María Ángel, termina prueba cliente');assert.equal(end.command.status,'DONE');assert.match(end.command.result.text,/no se retiró ni se modificó/);assert.equal(chiefCustomerSimulationStatus().status,'NOT_ACTIVE_OR_LOST_AFTER_RESTART');
  }finally{f.close();}
});

for(const state of ['READY','SENDING','ACCEPTED','UNCERTAIN'])test('a previous '+state+' result is not acknowledged, resent or treated as delivered',async t=>{
  const f=fixture(t);try{
    await f.dispatch('María Ángel, inicia prueba cliente');f.deliver();const q=await f.dispatch(prefix+first),id=q.command.responseIds[0],before=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);f.s.db.prepare('UPDATE outbox SET state=? WHERE id=?').run(state,id);
    const next=await f.dispatch(prefix+'Sí');assert.equal(next.command.status,'NEEDS_CONTEXT');assert.equal(next.command.result.data.reason,'SIMULATION_PREVIOUS_INTERNAL_DELIVERY_UNVERIFIED');assert.equal(chiefCustomerSimulationStatus().turns,1);const after=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);assert.equal(after.body,before.body);assert.equal(after.state,state);assert.equal(after.mid,before.mid);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE id=?').get(id).n,1);
  }finally{f.close();}
});

test('a fresh native reread protects text, recipient, owner, time, delivery status and citation before the memory acknowledges a quote',async t=>{
  const f=fixture(t);try{
    await f.dispatch('María Ángel, inicia prueba cliente');f.deliver();const q=await f.dispatch(prefix+first);f.deliver();const id=q.command.responseIds[0],row=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id),text=f.s.open(row.body),firstDelivery=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('first-delivery:'+id).value),original=structuredClone(f.records.get(row.mid));
    const good=await f.transport.verifyChiefSimulationOutput(row,text,firstDelivery);assert.equal(good.state,'DELIVERED');assert.equal(good.verifiedAt,firstDelivery.verifiedAt);assert.ok(good.checkedAt>=good.verifiedAt);assert.equal(good.recipient,SANDRA);
    const patches=[r=>{r.message.conversation+=' changed';},r=>{r.key.remoteJid=OTHER+'@s.whatsapp.net';},r=>{r.key.remoteJidAlt=OTHER+'@s.whatsapp.net';},r=>{r.key.fromMe=false;},r=>{r.key.id='DIFFERENT_NATIVE_MID';},r=>{r.message.extendedTextMessage={text:'Different body'};},r=>{r.status='SERVER_ACK';},r=>{r.status='DELETED';},r=>{r.isEdited=true;},r=>{r.message.extendedTextMessage={text,contextInfo:{stanzaId:'FIRST_CITATION'}};r.contextInfo={stanzaId:'SECOND_CITATION'};},r=>{r.messageTimestamp-=120;},r=>{r.message={extendedTextMessage:{text,contextInfo:{isForwarded:true}}};},r=>{r.message={extendedTextMessage:{text,contextInfo:{stanzaId:'UNRELATED_NATIVE_QUOTE'}}};}];
    for(const patch of patches){const changed=structuredClone(original);patch(changed);f.records.set(row.mid,changed);await assert.rejects(f.transport.verifyChiefSimulationOutput(row,text,firstDelivery));}f.records.set(row.mid,original);
    for(const patch of [{mid:'WRONG_MID'},{line:RED},{verifiedAt:row.created-1},{verifiedAt:Date.now()+1}])await assert.rejects(f.transport.verifyChiefSimulationOutput(row,text,{...firstDelivery,...patch}));
    assert.equal(chiefCustomerSimulationStatus().acknowledgedOutputs,0);assert.ok(f.requests.every(request=>request.url.includes('/chat/findMessages/')||request.url.includes('/instance/fetchInstances')));
  }finally{f.close();}
});

test('the sandbox cannot open if customer attention is on, chief-only routing is absent, or the native source is unverified',async t=>{
  const f=fixture(t);try{
    const source=f.source('María Ángel, inicia prueba cliente'),plan=parseChiefCommand(source,f.c),native={verified:true,sourceId:source.id,phone:SANDRA,line:BLUE,at:source.at};
    for(const patch of [{enabled:true},{chiefOnly:false},{replyOnlyToChief:false},{company:'servicio-tecnico'}])assert.equal((await executeChiefCustomerSimulation(f.s,{...f.c,...patch},f.transport,source,plan,native)).state,'BLOCKED');
    for(const patch of [{verified:false},{sourceId:'ANOTHER_SOURCE'},{phone:OTHER},{line:RED}])assert.equal((await executeChiefCustomerSimulation(f.s,f.c,f.transport,source,plan,{...native,...patch})).state,'BLOCKED');
    assert.equal(chiefCustomerSimulationStatus().status,'NOT_ACTIVE_OR_LOST_AFTER_RESTART');assert.equal(f.requests.length,0);
  }finally{f.close();}
});

test('native delivery rereads reject a changed owner or ambiguous MID and accept only a literal PN or its explicit native alternate',async t=>{
  const f=fixture(t);try{
    await f.dispatch('María Ángel, inicia prueba cliente');f.deliver();const q=await f.dispatch(prefix+first);f.deliver();const id=q.command.responseIds[0],row=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id),text=f.s.open(row.body),firstDelivery=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('first-delivery:'+id).value),record=f.records.get(row.mid);
    record.key.remoteJid='123456789@lid';record.key.remoteJidAlt=SANDRA+'@s.whatsapp.net';record.status='SENT';record.MessageUpdate=[{status:'DELIVERY_ACK'},{status:'READ'}];assert.equal((await f.transport.verifyChiefSimulationOutput(row,text,firstDelivery)).state,'READ');
    delete record.key.remoteJidAlt;await assert.rejects(f.transport.verifyChiefSimulationOutput(row,text,firstDelivery));record.key.remoteJidAlt=SANDRA+'@s.whatsapp.net';
    const original=f.transport.fetcher;
    for(const mode of ['wrong-owner-before','wrong-owner-after','duplicate-mid']){let owners=0;f.transport.fetcher=async(url,options)=>{const response=await original(url,options),data=await response.json();if(url.includes('/instance/fetchInstances')){owners++;if(mode==='wrong-owner-before'||mode==='wrong-owner-after'&&owners===2)data[0].ownerJid=OTHER+'@s.whatsapp.net';}else if(mode==='duplicate-mid'){data.messages.total=2;data.messages.records.push(structuredClone(data.messages.records[0]));}return {ok:true,json:async()=>data};};await assert.rejects(f.transport.verifyChiefSimulationOutput(row,text,firstDelivery),mode);}
    f.transport.fetcher=original;assert.equal(chiefCustomerSimulationStatus().acknowledgedOutputs,0);
  }finally{f.close();}
});

test('ordinary customers remain observed while Sandra uses the isolated trial, and loss of memory requires a new explicit start',async t=>{
  const f=fixture(t);try{
    const absent=await f.dispatch(prefix+first);assert.equal(absent.command.status,'NEEDS_CONTEXT');assert.match(absent.command.result.text,/no hay una prueba activa/);
    await f.dispatch('María Ángel, inicia prueba cliente');const customer=f.source(first,{phone:OTHER});f.s.enqueue(customer);await f.engine.process(customer);assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(customer.id).state,'OBSERVED_ANALYSIS_ONLY');assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE phone=?').get(OTHER).n,0);
    await f.dispatch('María Ángel, termina prueba cliente');const next=await f.dispatch(prefix+'Sí');assert.equal(next.command.status,'NEEDS_CONTEXT');assert.equal(chiefCustomerSimulationStatus().turns,undefined);
  }finally{f.close();}
});

for(const afterAck of [true,false])test('same-second native customer time requires a stored receipt ordering '+(afterAck?'after':'before')+' the internal acknowledgement',async t=>{
  const f=fixture(t);try{
    await f.dispatch('María Ángel, inicia prueba cliente');f.deliver();const q=await f.dispatch(prefix+first);f.deliver();const proof=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('first-delivery:'+q.command.responseIds[0]).value),nativeAt=Math.floor(proof.verifiedAt/1000)*1000;
    assert.ok(nativeAt<proof.verifiedAt);
    const result=await f.dispatch(prefix+'Sí',{at:nativeAt},event=>{if(!afterAck)f.s.db.prepare('UPDATE events SET received_at=? WHERE id=?').run(proof.verifiedAt-1,event.id);});
    assert.equal(result.command.status,afterAck?'DONE':'NEEDS_CONTEXT');assert.equal(chiefCustomerSimulationStatus().turns,afterAck?2:1);
    const event=f.s.db.prepare('SELECT at FROM events WHERE id=?').get(result.source.id);assert.equal(event.at,nativeAt);
  }finally{f.close();}
});

for(const order of ['day-first','hour-first'])test('separate native timing remains a sourced conversational draft and never advertises or submits the unsupported closed PRUEBA: '+order,async t=>{
 const f=fixture(t);try{
  f.c.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:now-1000};
  f.c.clientRequestedSchedule={enabled:true,startsAt:now-1000,guard:MARIA_CLIENT_SCHEDULE_GUARD};
  await f.dispatch('María Ángel, inicia prueba cliente');f.deliver();
  const times=order==='day-first'?['El sábado 24 de octubre','A las diez de la mañana']:['A las diez de la mañana','El sábado 24 de octubre'];
  const sources=new Map();let final;
  for(const text of [first,'Sí, acepto esa cotización','Mi nombre es Persona Sintética y mi dirección es Calle de Prueba 0 # 0',...times,'Sí']){
   final=await f.dispatch(prefix+text);assert.equal(final.command.status,'DONE');sources.set(text,final.source);f.deliver();
  }
  const d=final.command.result.data.testOrderDraft,p=d.envelope.syntheticPayload;
  assert.equal(d.initialTestFixtureEligible,false);assert.equal(d.fixtureLimitation.code,'TEST_FIXTURE_SEPARATE_TIMING_SOURCES_UNSUPPORTED');
  assert.match(final.command.result.text,/día y la hora.*por separado/);assert.match(final.command.result.text,/permiso de PRUEBA.*no admite/);assert.match(final.command.result.text,/No se ha creado una orden/);
  assert.ok(p.preferenceParts);assert.equal(p.sources.preference,undefined);
  for(const [part,text]of [['date','El sábado 24 de octubre'],['time','A las diez de la mañana']]){
   assert.equal(p.preferenceParts[part].text,text);assert.equal(d.fieldSourceMap.preferenceParts[part],sources.get(text).id);
   const mapping=d.envelope.sourceMap.find(row=>row.syntheticSourceId===p.preferenceParts[part].id);assert.equal(mapping.chiefSourceId,sources.get(text).id);assert.equal(mapping.customerTextHash,sha(text));
  }
  const before=f.requests.length,attempt=await f.dispatch('María Ángel, sube la prueba cliente');
  assert.equal(attempt.command.status,'NEEDS_CONTEXT');assert.equal(attempt.command.result.data.status,'NOT_ELIGIBLE_FOR_CLOSED_TEST_FIXTURE');
  assert.match(attempt.command.result.text,/permiso de PRUEBA.*no admite/);assert.equal(attempt.command.result.data.testBusinessWrites,0);
  assert.ok(f.requests.slice(before).every(request=>request.url.includes('/chat/findMessages/')||request.url.includes('/instance/fetchInstances')));
  assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-test-order:%'").get().n,0);
  assert.equal(f.c.enabled,false);assert.equal(f.c.replyOnlyToChief,true);
 }finally{f.close();}
});
