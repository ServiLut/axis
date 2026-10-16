import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,HILARY} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {drainProgramRegistrations,registrationHash,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {bindTesaQuestionDelivery,acceptTesaQuotedAnswer} from '../automation/service-bots/tesa-operations.mjs';
import {installOwnSchedulingAccess,MARIA_SCHEDULING_URL} from '../automation/service-bots/maria-scheduling-access.mjs';
import {parseOwnTesaSchedulingSlot,prepareOwnSchedulingPlan,ownSchedulingPlan,continueOwnSchedulingOffer,ownSchedulingProof,ownSchedulingReplyStillValid,drainOwnScheduling,MARIA_SCHEDULING_PROOF_GUARD} from '../automation/service-bots/maria-own-order-scheduling.mjs';

const actor='7508385b-536e-4aa2-8137-d734dfc900ef',order='85c47fc8-5314-4f68-a8d6-dde112640f5d',technicianId='29d3c685-cacb-4337-8365-53fe4d830e51';
function fixture({createdAt}={}){
 const now=Date.now(),start=Math.floor((now-30000)/1000)*1000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const line=BUSINESSES.fumigacion.phones[0],phone='573000003456',participants=[...TESA_BOT_PHONES,HILARY];
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-60000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'schedule-isolated-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'a'.repeat(43),actorId:actor,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:now+86400000},tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:line,activatedAt:start-60000,allowedParticipantPhones:[HILARY],verifiedMembership:{owner:line,ownerOpen:true,verifiedAt:now,expiresAt:now+300000,sourceHash:'a'.repeat(64),participantPhones:participants,participantBindings:participants.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}}};
 installOwnSchedulingAccess(c,s,{actorId:actor,url:MARIA_SCHEDULING_URL,token:'x'.repeat(43),proofToken:'y'.repeat(43),startsAt:start-1000,expiresAt:c.mariaProgram.expiresAt});
 const engine=new Engine(s,c);let seq=0,registrationWrites=0,backendMode='success';const schedulingCalls=[];
 const event=(text,patch={})=>({id:'SCHEDULING_NATIVE_'+ ++seq,phone,line,fromMe:false,forwarded:false,kind:'text',at:start+seq*1000,text,...patch});
 const turn=async(text,patch={})=>{const e=event(text,patch);historicalPriceClock.timers.setTime(e.at);s.enqueue(e);await engine.process(e);return e;};
 const row=id=>s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
 const deliver=(id,at=null)=>{const r=row(id);assert.ok(r,id);const mid='MID_'+id.replace(/[^a-zA-Z0-9_]/g,'_');s.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id=?").run(mid,id);s.recordFirstBotReply({...r,mid},mid,c.bot,at??now);s.delivery(mid,line,'DELIVERED');s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('first-delivery:'+id,s.seal({mid,line,state:'DELIVERED',verifiedAt:at??Math.floor(Date.now()/1000)*1000}));return s.open(r.body);};
 const registrationReceipt=p=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actor,createdById:actor,phone:p.phone,persisted:true,orderId:order,caseId:p.caseId,acceptanceId:p.quote.acceptanceId,requestHash:registrationHash(p),state:'NUEVO',scheduled:false,paymentRecorded:false,...(createdAt===null?{}:{createdAt:createdAt??new Date().toISOString()})});
 const entries=()=>s.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'maria-own-scheduling:%'").all().map(r=>({key:r.key,...s.open(r.value)}));
 const updateEntry=patch=>{const e=entries()[0];assert.ok(e);const next={...e,...patch};delete next.key;s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal(next),e.key);return next;};
 const receipt=e=>({persisted:true,actorId:actor,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,schedulingKey:e.schedulingKey,caseId:e.plan.caseId,orderId:e.plan.orderId,registrationRequestHash:e.plan.registrationRequestHash,proposalHash:e.prepared?.proposalHash??'e'.repeat(64),committed:{state:'PROGRAMADO',technicianMembershipId:technicianId,technicianName:e.slot.technicianName,dateBogota:e.slot.dateBogota,startLocal:e.slot.startLocal,endLocal:e.slot.endLocal,startsAtUtc:e.slot.startsAtUtc,endsAtUtc:e.slot.endsAtUtc},currentMatchesCommitted:true});
 const t={verifyLine:async()=>{},currentAttention:async()=>({complete:true,sources:s.db.prepare('SELECT mid id,line FROM outbox WHERE mid IS NOT NULL').all()}),currentCustomerActivity:async(p,at)=>({complete:true,sources:s.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(p,at)}),request:async(_line,_path,body)=>{
  const id=body.where.key.id,source=s.db.prepare('SELECT body FROM events WHERE id=?').get(id),out=s.db.prepare('SELECT * FROM outbox WHERE mid=?').get(id);
  if(source){const e=s.open(source.body);return {messages:{records:[{key:{id,fromMe:e.fromMe,remoteJid:phone+'@s.whatsapp.net'},message:{conversation:e.text,...(e.quotedId?{messageContextInfo:{stanzaId:e.quotedId}}:{})},messageTimestamp:e.at/1000}]}};}
  return {messages:{records:out?[{key:{id,fromMe:true,remoteJid:phone+'@s.whatsapp.net'},message:{conversation:s.open(out.body)},status:'DELIVERY_ACK'}]:[]}};
 },fetcher:async(url,opts)=>{
  const body=JSON.parse(opts.body);
  if(url===c.mariaProgram.url+'/receipt/current-fields'){
   const ledger=s.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+body.caseId),entry=ledger&&s.open(ledger.value);
   return {ok:true,json:async()=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:actor,readOnly:true,available:true,immutableReceipt:entry?.receipt,currentRecords:{order:{createdBy:actor,state:'NUEVO',technicianId:null,scheduledDate:null,startTime:null,endTime:null,updatedAt:'2026-10-15T00:00:00.000Z'}}})};
  }
  if(url.startsWith(c.mariaProgram.url)){registrationWrites++;return {ok:true,json:async()=>registrationReceipt(body)};}
  schedulingCalls.push({route:url.replace(c.ownOrderScheduling.url,''),body});const e=entries()[0];
  if(url.endsWith('/prepare'))return {ok:true,json:async()=>({prepared:true,scheduled:false,proposalHash:'e'.repeat(64),expectedOrderUpdatedAt:'2026-10-15T00:00:00.000Z',technicianMembershipId:technicianId,technicianName:e.slot.technicianName,startsAtUtc:e.slot.startsAtUtc,endsAtUtc:e.slot.endsAtUtc})};
  if(url.endsWith('/commit')&&backendMode==='uncertain')throw Error('ISOLATED_COMMIT_RESULT_UNKNOWN');
  if(backendMode==='missing-receipt'&&url.endsWith('/receipt'))throw Error('ISOLATED_RECEIPT_UNAVAILABLE');
  const r=receipt(e);if(backendMode==='altered-slot')r.committed.startsAtUtc=e.slot.endsAtUtc;return {ok:true,json:async()=>r};
 }};
 const save=async()=>{
  let e=await turn('Tengo cucarachas en apartamento de 42 mts2 en Itagüí. ¿Cuánto cuesta?');deliver(e.id+':reply',e.at);
  e=await turn('Sí, agéndame para mañana en la tarde');deliver(e.id+':reply',e.at);
  e=await turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');deliver(e.id+':reply',e.at);
  e=await turn('Confirmo');await drainProgramRegistrations(s,c,t,routeCaseQuestion);assert.equal(registrationWrites,1);return e;
 };
 const slotText=()=>{const utc=Math.ceil((Date.now()+7200000)/3600000)*3600000,startLocal=new Date(utc-18000000).toISOString(),endLocal=new Date(utc+3600000-18000000).toISOString();return 'técnico: Andrés Correa; fecha: '+startLocal.slice(0,10)+'; inicio: '+startLocal.slice(11,16)+'; fin: '+endLocal.slice(11,16);};
 const qCurrent=()=>s.db.prepare('SELECT q.*,o.mid,o.native_proof,o.state delivery,o.created outbox_created FROM tesa_questions q JOIN tesa_outbox o ON o.id=q.outbox_id ORDER BY q.rowid DESC LIMIT 1').get();
 const verifyRegistered=async()=>{const q=qCurrent();if(!q||q.state!=='ANSWERED'||q.valid_until<=Date.now())return null;return {q,conv:s.conversation(phone),answer:s.open(q.answer)};};
 const offer=async({bridgeNativeId=true,verifier=verifyRegistered}={})=>{
  const q=qCurrent(),out=s.db.prepare('SELECT * FROM tesa_outbox WHERE question_id=?').get(q.id),mid='OWN_SCHEDULE_QUESTION_MID';s.db.prepare("UPDATE tesa_outbox SET state='ACCEPTED',mid=? WHERE id=?").run(mid,out.id);
  bindTesaQuestionDelivery(s,c,{outboxId:out.id,mid,groupJid:TESA_GROUP_JID,senderLine:line,text:s.open(out.body),state:'DELIVERED',at:Date.now(),nativeVerified:true});
  const e={id:'OWN_SCHEDULING_HUMAN_ANSWER',company:'fumigacion',groupJid:TESA_GROUP_JID,line,receivingLine:line,participant:{phone:HILARY,jid:HILARY+'@s.whatsapp.net'},at:Date.now(),kind:'text',text:slotText(),fromMe:false,forwarded:false,quote:{mid,groupJid:TESA_GROUP_JID,participantJid:line+'@s.whatsapp.net'}},accepted=acceptTesaQuotedAnswer(s,c,e);assert.equal(accepted.accepted,true);
  const result=await continueOwnSchedulingOffer(s,c,t,bridgeNativeId?{...accepted,sourceId:e.id}:accepted,{verifyRegistered:verifier});return {result,accepted,answer:e};
 };
 const confirm=async()=>{const e=entries()[0];assert.ok(e);deliver(e.proposalId);return turn('Confirmo',{at:Math.max(Math.floor(Date.now()/1000)*1000,s.conversation(phone).at)+1000});};
 const verifyProof=e=>ownSchedulingProof(s,c,t,{company:'fumigacion',schedulingKey:e.schedulingKey},{verifyRegistered});
 const courtesy=(text='Gracias',patch={})=>turn(text,{at:Math.max(Math.floor(Date.now()/1000)*1000,s.conversation(phone).at)+1000,...patch});
 return {s,c,t,engine,phone,line,turn,event,courtesy,save,offer,confirm,deliver,entries,updateEntry,verifyRegistered,verifyProof,qCurrent,slotText,row,schedulingCalls,setMode:v=>backendMode=v,registrationWrites:()=>registrationWrites};
}

test('only all four literal fields produce a Bogotá interval with correct UTC, never an invented duration',()=>{
 const now=Date.parse('2026-10-15T18:00:00Z'),text='técnico: Andrés Correa; fecha: 2026-10-16; inicio: 09:00; fin: 10:30';
 assert.deepEqual(parseOwnTesaSchedulingSlot(text,{now}),{technicianName:'Andrés Correa',dateBogota:'2026-10-16',startLocal:'09:00',endLocal:'10:30',startsAtUtc:'2026-10-16T14:00:00.000Z',endsAtUtc:'2026-10-16T15:30:00.000Z'});
 for(const value of [text.replace('; fin: 10:30',''),text+'; duración: 90 minutos',text.replace('10:30','08:30'),text.replace('2026-10-16','2026-02-30'),text.replace('09:00','25:00'),text.replace('10:30','24:00'),text.replace('Andrés Correa','Andrés'),text.replace('fecha:','día:'),text+'; fecha: 2026-10-17',text+' si pueden',text.replace('Andrés Correa','Andrés Correa https://example.test')])assert.equal(parseOwnTesaSchedulingSlot(value,{now}),null,value);
 assert.equal(parseOwnTesaSchedulingSlot(text,{now:Date.parse('2026-10-16T14:00Z')}),null);assert.equal(parseOwnTesaSchedulingSlot(text,{now,expiresAt:Date.parse('2026-10-16T15:30Z')}),null);
});

test('a new own saved receipt prepares only a new TESA schedule plan without replaying an existing question',async()=>{const f=fixture();try{
 await f.save();const q=f.qCurrent(),plan=ownSchedulingPlan(f.s,f.c,q.id);assert.ok(plan);assert.equal(plan.orderId,order);assert.equal(plan.registrationRequestHash.length,64);
 assert.equal(prepareOwnSchedulingPlan(f.s,f.c,{phone:f.phone,line:f.line,caseId:plan.caseId,topic:'disponibilidad-y-tecnico'},{id:q.id,outboxId:q.outbox_id,created:false}),false);assert.equal(f.schedulingCalls.length,0);
}finally{f.s.close();}});

test('missing, invalid or historical receipt creation time never authorizes first scheduling',async()=>{
 for(const createdAt of [null,'not-a-date','2000-01-01T00:00:00.000Z']){const f=fixture({createdAt});try{await f.save();assert.equal(ownSchedulingPlan(f.s,f.c,f.qCurrent().id),null,createdAt??'missing');assert.equal(f.schedulingCalls.length,0);}finally{f.s.close();}}
});

test('actual accepted TESA source keys can be consumed without inventing a native source identifier',async()=>{const f=fixture();try{await f.save();const {result}=await f.offer({bridgeNativeId:false});assert.equal(result.queued,true);}finally{f.s.close();}});

test('an offered literal interval needs delivered proposal and new direct acceptance before a proof exists',async()=>{const f=fixture();try{
 await f.save();assert.equal((await f.offer()).result.queued,true);const entry=f.entries()[0];assert.equal(entry.status,'OFFERED');assert.match(f.s.open(f.row(entry.proposalId).body),/¿Confirmas esta fecha y franja\?/);assert.equal(f.schedulingCalls.length,0);
 await f.confirm();assert.equal(f.entries()[0].status,'PENDING');const proof=await f.verifyProof(f.entries()[0]);assert.equal(proof.guard,MARIA_SCHEDULING_PROOF_GUARD);assert.equal(proof.orderId,order);assert.equal(proof.proposal.startLocal,f.entries()[0].slot.startLocal);assert.equal(proof.proposal.endLocal,f.entries()[0].slot.endLocal);assert.equal(proof.confirmation.text,'Confirmo');assert.equal(f.schedulingCalls.length,0);
}finally{f.s.close();}});

test('forwarded, wrong-case, undelivered or earlier-than-delivery acceptance cannot reserve a schedule',async()=>{
 for(const variant of ['forwarded','case','undelivered','early-ack','hold']){const f=fixture();try{
  await f.save();await f.offer();const entry=f.entries()[0];if(variant!=='undelivered')f.deliver(entry.proposalId);
  if(variant==='early-ack'){const key='first-delivery:'+entry.proposalId,proof=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value);f.s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.s.seal({...proof,verifiedAt:Date.now()+60000}),key);}
  if(variant==='case')f.s.saveConversation(f.phone,{...f.s.conversation(f.phone).state,caseId:'fumigacion:OTHER'});
  if(variant==='hold')f.s.hold(f.phone,'SYNTHETIC_HUMAN',true);
  await f.turn('Confirmo',{at:Math.floor(Date.now()/1000)*1000+1000,...(variant==='forwarded'?{forwarded:true}:{})});assert.equal(f.entries()[0].status,'OFFERED',variant);assert.equal(f.schedulingCalls.length,0);if(variant==='hold')assert.equal(f.s.conversation(f.phone).hold,1);
 }finally{f.s.close();}}
});

test('proof requires exact small request, current commercial fields and complete native attention',async()=>{
 for(const variant of ['extra-body','commercial-change','unknown-staff','incomplete-activity','edited-confirmation']){const f=fixture();try{
  await f.save();await f.offer();await f.confirm();const e=f.entries()[0];
  if(variant==='commercial-change')f.s.saveConversation(f.phone,{...f.s.conversation(f.phone).state,slots:{...f.s.conversation(f.phone).state.slots,address:'Otra dirección'}});
  if(variant==='unknown-staff')f.t.currentAttention=async()=>({complete:true,sources:[{id:'UNKNOWN_STAFF',line:f.line}]});
  if(variant==='incomplete-activity')f.t.currentCustomerActivity=async()=>({complete:false,sources:[]});
  if(variant==='edited-confirmation'){const orig=f.t.request;f.t.request=async(...args)=>{const result=await orig(...args);if(args[2].where.key.id===e.confirmation.id)result.messages.records[0].isEdited=true;return result;};}
  const body={company:'fumigacion',schedulingKey:e.schedulingKey,...(variant==='extra-body'?{orderId:order}:{})};await assert.rejects(ownSchedulingProof(f.s,f.c,f.t,body,{verifyRegistered:f.verifyRegistered}));assert.equal(f.schedulingCalls.length,0);
 }finally{f.s.close();}}
});

test('native confirmation or proposal edits during later attention/activity awaits stop proof issuance',async()=>{
 for(const variant of ['confirmation','proposal']){const f=fixture();try{
  await f.save();await f.offer();await f.confirm();const entry=f.entries()[0],proposal=f.row(entry.proposalId),originalRequest=f.t.request,originalActivity=f.t.currentCustomerActivity;let edited=false;
  f.t.request=async(...args)=>{const result=await originalRequest(...args),id=args[2].where.key.id;if(edited&&id===(variant==='confirmation'?entry.confirmation.id:proposal.mid))result.messages.records[0].isEdited=true;return result;};
  f.t.currentCustomerActivity=async(...args)=>{const result=await originalActivity(...args);edited=true;return result;};
  await assert.rejects(f.verifyProof(entry),variant);assert.equal(f.schedulingCalls.length,0);
 }finally{f.s.close();}}
});

test('drain writes once with expected-order CAS and retains the original registration receipt',async()=>{const f=fixture();try{
 await f.save();await f.offer();await f.confirm();const key='maria-registration:'+f.entries()[0].plan.caseId,before=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value);
 await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,'SAVED');assert.deepEqual(f.schedulingCalls.map(c=>c.route),['/prepare','/commit']);assert.equal(f.schedulingCalls[1].body.proposalHash,'e'.repeat(64));assert.equal(f.schedulingCalls[1].body.expectedOrderUpdatedAt,'2026-10-15T00:00:00.000Z');assert.deepEqual(f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value),before);assert.equal(f.registrationWrites(),1);
}finally{f.s.close();}});

test('uncertain commit is never repeated and only receipt recovery may establish success',async()=>{const f=fixture();try{
 await f.save();await f.offer();await f.confirm();f.setMode('uncertain');await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,'UNCERTAIN');f.updateEntry({nextReceiptAt:0});f.setMode('success');await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,'SAVED');assert.deepEqual(f.schedulingCalls.map(c=>c.route),['/prepare','/commit','/receipt']);assert.equal(f.registrationWrites(),1);
}finally{f.s.close();}});

test('false or absent proof validation prevents every backend prepare or commit',async()=>{for(const invalid of [async()=>false,async()=>undefined]){const f=fixture();try{await f.save();await f.offer();await f.confirm();await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:invalid});assert.equal(f.schedulingCalls.length,0);assert.notEqual(f.entries()[0].status,'SAVED');}finally{f.s.close();}}});

test('a receipt with a different committed time cannot become a successful schedule',async()=>{const f=fixture();try{await f.save();await f.offer();await f.confirm();f.setMode('altered-slot');await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.notEqual(f.entries()[0].status,'SAVED');assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'maria-schedule-saved:%'").get().n,0);}finally{f.s.close();}});

const replyValid=(f,out)=>ownSchedulingReplyStillValid(f.s,f.c,f.t,out,{verifyRegistered:f.verifyRegistered});
const proofHash=p=>{const {checkedAt,expiresAt,...stable}=p;return registrationHash(stable);};

test('a completed native courtesy preserves one READY proposal without changing its text, facts or acceptance',async()=>{const f=fixture();try{
 await f.save();await f.offer();const before=f.entries()[0],out=f.row(before.proposalId),text=f.s.open(out.body);
 const e=await f.courtesy();assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'DONE');
 assert.equal(await replyValid(f,out),true);assert.equal(out.revision,f.s.conversation(f.phone).revision);assert.equal(f.row(out.id).revision,out.revision);assert.equal(f.s.open(f.row(out.id).body),text);assert.equal(f.entries()[0].revision,before.revision);assert.equal(f.entries()[0].confirmation,undefined);assert.equal(f.schedulingCalls.length,0);
 assert.equal(await replyValid(f,out),true);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'maria-schedule-proposal:%'").get().n,1);
}finally{f.s.close();}});

test('pending and PROCESSING courtesy classification defer a READY proposal and a confirmed schedule without review or backend calls',async()=>{
 for(const phase of ['proposal','confirmed'])for(const state of ['PENDING','PROCESSING']){const f=fixture();try{
  await f.save();await f.offer();if(phase==='confirmed')await f.confirm();const before=f.entries()[0],out=f.row(before.proposalId),e=f.event('Gracias',{at:f.s.conversation(f.phone).at+1000});f.s.enqueue(e);f.s.db.prepare('UPDATE events SET state=? WHERE id=?').run(state,e.id);
  if(phase==='proposal')assert.equal(await replyValid(f,out),null);
  await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,before.status);assert.equal(f.entries()[0].proofLocked,undefined);assert.equal(f.schedulingCalls.length,0);assert.equal(f.row(out.id).revision,out.revision);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'chief-report:maria-scheduling:%'").get().n,0);
  f.s.db.prepare("UPDATE events SET state='PENDING' WHERE id=?").run(e.id);await f.engine.process(e);assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'DONE');
  if(phase==='proposal')assert.equal(await replyValid(f,out),true);else{await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,'SAVED');assert.deepEqual(f.schedulingCalls.map(x=>x.route),['/prepare','/commit']);}
 }finally{f.s.close();}}
});

test('three native DONE courtesies after confirmation preserve the original acceptance and freeze one proof before prepare/commit',async()=>{const f=fixture();try{
 await f.save();await f.offer();await f.confirm();const original=f.entries()[0];
 for(const text of ['Gracias','Muchas gracias','Gracias'])await f.courtesy(text);
 const proofs=[];await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:async entry=>{const p=await f.verifyProof(entry);proofs.push(p);return p;}});
 const saved=f.entries()[0];assert.equal(saved.status,'SAVED');assert.equal(saved.confirmationSourceRevision,original.confirmationRevision);assert.equal(saved.confirmationRevision,original.confirmationRevision+3);assert.deepEqual(saved.confirmation,original.confirmation);assert.equal(saved.proofLocked,true);assert.equal(proofs.length,2);assert.equal(proofHash(proofs[0]),proofHash(proofs[1]));assert.equal(saved.proofHash,proofHash(proofs[0]));assert.deepEqual(f.schedulingCalls.map(x=>x.route),['/prepare','/commit']);
}finally{f.s.close();}});

test('the courtesy allowance is not renewed when an earlier READY send check advanced its revision',async()=>{const f=fixture();try{
 await f.save();await f.offer();const entry=f.entries()[0],out=f.row(entry.proposalId);
 for(let i=0;i<3;i++){await f.courtesy();assert.equal(await replyValid(f,out),true);}
 await f.courtesy();assert.equal(await replyValid(f,out),false);assert.equal(out.revision,entry.revision+3);assert.equal(f.entries()[0].revision,entry.revision);assert.equal(f.schedulingCalls.length,0);
}finally{f.s.close();}});

test('new facts, media, citations, forwards, non-DONE rows, other lines and changed cases never qualify as neutral courtesies',async()=>{
 for(const variant of ['fact','media','quote','forward','not-done','other-line','other-case','hold']){const f=fixture();try{
  await f.save();await f.offer();await f.confirm();const entry=f.entries()[0],e=await f.courtesy(variant==='fact'?'Gracias, la dirección cambió':'Gracias',variant==='media'?{kind:'audio'}:variant==='quote'?{quotedId:'ANOTHER_NATIVE_MID'}:variant==='forward'?{forwarded:true}:variant==='other-line'?{line:f.c.lines[1].phone}:{});
  if(variant==='not-done')f.s.db.prepare("UPDATE events SET state='REVIEW' WHERE id=?").run(e.id);
  if(variant==='other-case')f.s.saveConversation(f.phone,{...f.s.conversation(f.phone).state,caseId:'fumigacion:DIFFERENT'});
  if(variant==='hold')f.s.hold(f.phone,'VERIFIED_STAFF',true);
  await assert.rejects(f.verifyProof(entry),variant);await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.notEqual(f.entries()[0].status,'SAVED',variant);assert.equal(f.schedulingCalls.length,0,variant);if(variant==='hold')assert.equal(f.s.conversation(f.phone).hold,1);
 }finally{f.s.close();}}
});

test('native identities, body contexts and edits are checked for confirmation, proposal and courtesy originals',async()=>{
 for(const target of ['confirmation','proposal','courtesy'])for(const variant of ['conflicting-PN','hidden-forward','conflicting-quotes','conflicting-body','edited']){const f=fixture();try{
  await f.save();await f.offer();await f.confirm();const courtesy=target==='courtesy'?await f.courtesy():null,entry=f.entries()[0],mid=target==='confirmation'?entry.confirmation.id:target==='proposal'?f.row(entry.proposalId).mid:courtesy.id,base=f.t.request;
  f.t.request=async(...args)=>{const value=await base(...args);if(args[2].where.key.id!==mid)return value;const row=value.messages.records[0],m=row.message;
   if(variant==='conflicting-PN'){row.key.remoteJid='573000009999@s.whatsapp.net';row.key.remoteJidAlt=f.phone+'@s.whatsapp.net';}
   if(variant==='hidden-forward'){m.extendedTextMessage={text:m.conversation,contextInfo:{}};m.messageContextInfo={isForwarded:true,forwardingScore:1};}
   if(variant==='conflicting-quotes'){m.extendedTextMessage={text:m.conversation,contextInfo:{stanzaId:'NATIVE_QUOTE_1'}};m.messageContextInfo={stanzaId:'NATIVE_QUOTE_2'};}
   if(variant==='conflicting-body')m.extendedTextMessage={text:'Otro contenido',contextInfo:{}};
   if(variant==='edited')row.isEdited=true;return value;};
  await assert.rejects(f.verifyProof(entry),target+':'+variant);assert.equal(f.schedulingCalls.length,0);
 }finally{f.s.close();}}
});

test('a new courtesy arriving during proof reads defers before prepare and is checked after Engine classification',async()=>{const f=fixture();try{
 await f.save();await f.offer();await f.confirm();const base=f.t.currentAttention;let e;
 f.t.currentAttention=async(...args)=>{const result=await base(...args);if(!e){e=f.event('Gracias',{at:f.s.conversation(f.phone).at+1000});f.s.enqueue(e);}return result;};
 await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,'PENDING');assert.equal(f.entries()[0].proofLocked,undefined);assert.equal(f.schedulingCalls.length,0);
 await f.engine.process(e);await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,'SAVED');assert.deepEqual(f.schedulingCalls.map(x=>x.route),['/prepare','/commit']);
}finally{f.s.close();}});

test('a courtesy after prepare starts cannot rewrite the frozen proof or cause commit',async()=>{
 for(const classified of [false,true]){const f=fixture();try{
  await f.save();await f.offer();await f.confirm();const base=f.t.fetcher;
  f.t.fetcher=async(url,opts)=>{const value=await base(url,opts);if(url.endsWith('/prepare')){if(classified)await f.courtesy();else f.s.enqueue(f.event('Gracias',{at:f.s.conversation(f.phone).at+1000}));}return value;};
  await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});const entry=f.entries()[0];assert.equal(entry.status,'REVIEW');assert.equal(entry.proofLocked,true);assert.match(entry.proofHash,/^[a-f0-9]{64}$/);assert.deepEqual(f.schedulingCalls.map(x=>x.route),['/prepare']);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'maria-schedule-saved:%'").get().n,0);
 }finally{f.s.close();}}
});

test('a transient read leaves proposal and saved confirmation READY for exact revalidation without a new key or write',async()=>{
 for(const phase of ['proposal','saved']){const f=fixture();try{
  await f.save();await f.offer();if(phase==='saved'){await f.confirm();await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});}
  const entry=f.entries()[0],id=phase==='saved'?'maria-schedule-saved:'+entry.schedulingKey:entry.proposalId,out=f.row(id),text=f.s.open(out.body),base=f.t.fetcher,calls=f.schedulingCalls.length;f.t.fetcher=async()=>{throw Error('SYNTHETIC_READ_TIMEOUT');};
  assert.equal(await replyValid(f,out),null);assert.equal(f.row(id).state,'READY');assert.equal(f.s.open(f.row(id).body),text);assert.equal(f.schedulingCalls.length,calls);f.t.fetcher=base;assert.equal(await replyValid(f,out),true);assert.equal(f.row(id).state,'READY');assert.equal(f.registrationWrites(),1);
 }finally{f.s.close();}}
});

test('the final offer recheck uses its latest verified snapshot rather than overwriting a later courtesy state',async()=>{const f=fixture();try{
 await f.save();let reads=0,courtesy;
 const {result}=await f.offer({verifier:async()=>{if(++reads===2)courtesy=await f.courtesy();return f.verifyRegistered();}});
 assert.equal(result.queued,true);const entry=f.entries()[0],out=f.row(entry.proposalId),conv=f.s.conversation(f.phone);assert.equal(entry.revision,conv.revision);assert.equal(out.revision,conv.revision);assert.equal(conv.state.lastHandledSourceId,courtesy.id);assert.equal(await replyValid(f,out),true);assert.equal(f.schedulingCalls.length,0);
}finally{f.s.close();}});

test('a cancellation after delivered proposal records one durable source, one minimized alert and no business change',async()=>{const f=fixture();try{
 await f.save();await f.offer();const offered=f.entries()[0];f.deliver(offered.proposalId);const e=await f.courtesy('Cancela mi servicio');
 const entry=f.entries()[0],conv=f.s.conversation(f.phone),alerts=f.s.db.prepare("SELECT * FROM outbox WHERE id LIKE 'chief-report:maria-scheduling:%'").all();assert.equal(entry.status,'REVIEW');assert.equal(entry.reason,'CUSTOMER_CANCELLATION_REQUEST');assert.equal(entry.reviewSource.id,e.id);assert.equal(conv.state.requestedProgramCancellationReview.firstSourceId,e.id);assert.equal(alerts.length,1);assert.equal(alerts[0].internal,1);assert.match(f.s.open(alerts[0].body),/cliente pidió cancelar/);assert.doesNotMatch(f.s.open(alerts[0].body),new RegExp(f.phone));assert.equal(await replyValid(f,alerts[0]),true);
 await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.schedulingCalls.length,0);assert.equal(f.registrationWrites(),1);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'chief-report:maria-scheduling:%'").get().n,1);assert.equal(f.s.conversation(f.phone).hold,0);
}finally{f.s.close();}});

test('an equivalent canonical technician name is displayed from its verified receipt while literal source and membership stay fixed',async()=>{const f=fixture();try{
 await f.save();await f.offer();await f.confirm();const literal=f.entries()[0].slot.technicianName,base=f.t.fetcher;
 f.t.fetcher=async(...args)=>{const response=await base(...args);if(!args[0].startsWith(f.c.ownOrderScheduling.url))return response;const value=await response.json();if(value.technicianName)value.technicianName='ANDRES CORREA';if(value.committed)value.committed.technicianName='ANDRES CORREA';return {...response,json:async()=>value};};
 await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});const entry=f.entries()[0],out=f.row('maria-schedule-saved:'+entry.schedulingKey);assert.equal(entry.status,'SAVED');assert.equal(entry.slot.technicianName,literal);assert.equal(entry.prepared.technicianMembershipId,technicianId);assert.equal(entry.receipt.committed.technicianMembershipId,technicianId);assert.match(f.s.open(out.body),/ANDRES CORREA/);assert.equal(await replyValid(f,out),true);
}finally{f.s.close();}});

test('a completed courtesy arriving during the final reply reads defers without advancing the outbox until it is natively rechecked',async()=>{const f=fixture();try{
 await f.save();await f.offer();const entry=f.entries()[0],out=f.row(entry.proposalId),base=f.t.fetcher;let arrived=false;
 f.t.fetcher=async(...args)=>{const value=await base(...args);if(args[0].endsWith('/receipt/current-fields')&&!arrived){arrived=true;await f.courtesy();}return value;};
 assert.equal(await replyValid(f,out),null);assert.equal(f.row(out.id).state,'READY');assert.equal(f.row(out.id).revision,entry.revision);assert.equal(out.revision,entry.revision);assert.equal(await replyValid(f,out),true);assert.equal(out.revision,entry.revision+1);assert.equal(f.schedulingCalls.length,0);
}finally{f.s.close();}});

test('a saved confirmation remains receipt-backed while a later courtesy is classified and its READY revision is rechecked',async()=>{const f=fixture();try{
 await f.save();await f.offer();await f.confirm();await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});const entry=f.entries()[0],out=f.row('maria-schedule-saved:'+entry.schedulingKey),hash=entry.proofHash,e=f.event('Gracias',{at:f.s.conversation(f.phone).at+1000});f.s.enqueue(e);
 assert.equal(await replyValid(f,out),null);assert.equal(f.row(out.id).revision,out.revision);await f.engine.process(e);assert.equal(await replyValid(f,out),true);assert.equal(out.revision,f.s.conversation(f.phone).revision);assert.equal(f.entries()[0].proofHash,hash);assert.equal(f.entries()[0].confirmationRevision,entry.confirmationRevision);assert.deepEqual(f.schedulingCalls.map(x=>x.route),['/prepare','/commit','/receipt']);
}finally{f.s.close();}});

test('a new fact first waits for classification, then cannot be converted to a courtesy or trigger prepare',async()=>{const f=fixture();try{
 await f.save();await f.offer();await f.confirm();const e=f.event('Gracias, prefiero otra fecha',{at:f.s.conversation(f.phone).at+1000});f.s.enqueue(e);
 await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,'PENDING');assert.equal(f.schedulingCalls.length,0);await f.engine.process(e);await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,'REVIEW');assert.equal(f.schedulingCalls.length,0);
}finally{f.s.close();}});

test('a verified staff hold during the last courtesy read preserves attention and never advances the READY proposal',async()=>{const f=fixture();try{
 await f.save();await f.offer();const entry=f.entries()[0],out=f.row(entry.proposalId),e=await f.courtesy(),base=f.t.request;let reads=0;
 f.t.request=async(...args)=>{const value=await base(...args);if(args[2].where.key.id===e.id&&++reads===2)f.s.hold(f.phone,'VERIFIED_STAFF_DURING_NATIVE_READ',true);return value;};
 assert.equal(await replyValid(f,out),false);assert.equal(f.row(out.id).revision,entry.revision);assert.equal(f.s.conversation(f.phone).hold,1);assert.equal(f.schedulingCalls.length,0);
}finally{f.s.close();}});

test('three courtesies cover the whole proposal and confirmation rather than granting a new allowance after acceptance',async()=>{
 for(const after of [2,3]){const f=fixture();try{
  await f.save();await f.offer();await f.courtesy();const out=f.row(f.entries()[0].proposalId);assert.equal(await replyValid(f,out),true);await f.confirm();for(let i=0;i<after;i++)await f.courtesy();
  await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,after===2?'SAVED':'REVIEW');assert.deepEqual(f.schedulingCalls.map(x=>x.route),after===2?['/prepare','/commit']:[]);
 }finally{f.s.close();}}
});

test('technician name normalization permits only exact canonical tokens and never another person or membership',async()=>{
 for(const name of ['  ANDRES   CORREA  ','ANDRES CORREAL']){const f=fixture();try{
  await f.save();await f.offer();await f.confirm();const base=f.t.fetcher;
  f.t.fetcher=async(...args)=>{const response=await base(...args);if(!args[0].startsWith(f.c.ownOrderScheduling.url))return response;const value=await response.json();if(value.technicianName)value.technicianName=name;if(value.committed)value.committed.technicianName=name;return {...response,json:async()=>value};};
  await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,name.includes('CORREAL')?'REVIEW':'SAVED');assert.deepEqual(f.schedulingCalls.map(x=>x.route),name.includes('CORREAL')?['/prepare']:['/prepare','/commit']);
 }finally{f.s.close();}}
});

test('the backend proof callback sees the same frozen native revision and semantic hash as both runtime checks',async()=>{const f=fixture();try{
 await f.save();await f.offer();await f.confirm();await f.courtesy();const base=f.t.fetcher,hashes=[];
 f.t.fetcher=async(...args)=>{if(args[0].endsWith('/prepare')){const locked=f.entries()[0];assert.equal(locked.proofLocked,true);const callback=await f.verifyProof(locked);assert.equal(callback.context.revision,locked.confirmationRevision);hashes.push(proofHash(callback));assert.equal(proofHash(callback),locked.proofHash);}return base(...args);};
 await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:async e=>{const p=await f.verifyProof(e);hashes.push(proofHash(p));return p;}});assert.equal(f.entries()[0].status,'SAVED');assert.equal(hashes.length,3);assert.equal(new Set(hashes).size,1);assert.deepEqual(f.schedulingCalls.map(x=>x.route),['/prepare','/commit']);
}finally{f.s.close();}});

test('a courtesy arriving with a definite commit receipt does not lose the saved confirmation or authorize sending before classification',async()=>{const f=fixture();try{
 await f.save();await f.offer();await f.confirm();const base=f.t.fetcher;let e;
 f.t.fetcher=async(...args)=>{const value=await base(...args);if(args[0].endsWith('/commit')){e=f.event('Gracias',{at:f.s.conversation(f.phone).at+1000});f.s.enqueue(e);}return value;};
 await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});const entry=f.entries()[0],out=f.row('maria-schedule-saved:'+entry.schedulingKey);assert.equal(entry.status,'SAVED');assert.ok(out);assert.equal(await replyValid(f,out),null);assert.equal(out.revision,entry.confirmationRevision);await f.engine.process(e);assert.equal(await replyValid(f,out),true);assert.deepEqual(f.schedulingCalls.map(x=>x.route),['/prepare','/commit','/receipt']);assert.equal(f.registrationWrites(),1);
}finally{f.s.close();}});

test('a mismatched receipt actor, business scope, registration hash or technician membership cannot confirm scheduling',async()=>{
 for(const variant of ['actor','company','registration','technician']){const f=fixture();try{
  await f.save();await f.offer();await f.confirm();const base=f.t.fetcher;
  f.t.fetcher=async(...args)=>{const response=await base(...args);if(!args[0].endsWith('/commit'))return response;const value=await response.json();if(variant==='actor')value.actorId='ANOTHER_ACTOR';if(variant==='company')value.companyId='ANOTHER_COMPANY';if(variant==='registration')value.registrationRequestHash='0'.repeat(64);if(variant==='technician')value.committed.technicianMembershipId='ANOTHER_TECHNICIAN';return {...response,json:async()=>value};};
  await drainOwnScheduling(f.s,f.c,f.t,{verifyProof:f.verifyProof});assert.equal(f.entries()[0].status,'UNCERTAIN');assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE id LIKE 'maria-schedule-saved:%'").get().n,0);assert.deepEqual(f.schedulingCalls.map(x=>x.route),['/prepare','/commit']);
 }finally{f.s.close();}}
});
