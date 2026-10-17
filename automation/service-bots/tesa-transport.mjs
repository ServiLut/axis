import {createHash} from 'node:crypto';
import {getTesaConfig} from './tesa-config.mjs';
import {decodeTesaGroupWebhook,validateTesaGroupEvent} from './tesa-webhook.mjs';
import {observeTesaGroupEvent,acceptTesaQuotedAnswer,bindTesaQuestionDelivery,tesaOutboxScopeSafe} from './tesa-operations.mjs';
import {operationalCoverage} from './line-scope.mjs';
import {registrationHash,MARIA_PROGRAM_OPERATIONAL_CONTINUATION_GUARD} from './maria-program.mjs';
import {publicTextSafe,normalize,chiefReplyRestrictionActive} from './config.mjs';
import {continueMariaUnregisteredTesaCustomer,mariaUnregisteredTesaReplyStillValid} from './maria-tesa-unregistered.mjs';
import {continueOwnSchedulingOffer,ownSchedulingPlan,ownSchedulingProof,ownSchedulingReplyStillValid} from './maria-own-order-scheduling.mjs';
import {routeCaseQuestion} from './engine.mjs';
import {verifyStoredNativeIdentitySource} from './native-identity-resolution.mjs';
import {partitionNativeAttention} from './explicit-return-attention.mjs';
import {publicResponseWindow,publicResponseSqlCutoff,publicTesaOutboxAllowed} from './public-response-window.mjs';

const nativeText=r=>{const m=r.message?.ephemeralMessage?.message??r.message??{};return m.conversation??m.extendedTextMessage?.text??null;};
const phoneJid=j=>/^57\d{10}@s\.whatsapp\.net$/.test(j??'')?j.split('@')[0]:null;
const getMeta=(s,key)=>{const row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?s.open(row.value):null;};
const putMeta=(s,key,value)=>s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,s.seal(value));
function publicQuestionAllowed(s,c,id){
 if(!publicResponseWindow(c).active)return true;
 const row=s.db.prepare('SELECT * FROM tesa_outbox WHERE question_id=?').get(id);
 return Boolean(row&&publicTesaOutboxAllowed(s,c,row));
}
const continuationPrefix='tesa-continuation:';
const bogotaDay=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
const neutralCourtesy=text=>/^(?:gracias|muchas gracias|mil gracias|muy amable|gracias muy amable)$/.test(normalize(text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim());
function pendingContinuationCourtesy(s,plan){
 const rows=s.db.prepare("SELECT line,body FROM events WHERE phone=? AND from_me=0 AND state IN ('PENDING','PROCESSING')").all(plan.phone);
 return rows.length>0&&rows.length<=3&&rows.every(row=>{const event=s.open(row.body);return row.line===plan.line&&event.kind==='text'&&!event.forwarded&&!event.fromMe&&event.at>=plan.customerAt&&neutralCourtesy(event.text);});
}
function continuationCourtesies(s,plan,conv){
 const delta=conv.revision-plan.revision;if(delta===0)return conv.at===plan.customerAt?[]:null;
 if(delta<0||delta>3)return null;
 const rows=s.db.prepare('SELECT line,body,state,revision FROM events WHERE phone=? AND from_me=0 AND revision>? AND revision<=? ORDER BY revision').all(plan.phone,plan.revision,conv.revision);
 if(rows.length!==delta)return null;
 const events=rows.map(row=>s.open(row.body));
 return rows.every((row,i)=>row.line===plan.line&&!['PENDING','PROCESSING'].includes(row.state)&&events[i].kind==='text'&&!events[i].forwarded&&!events[i].fromMe&&events[i].at>=plan.customerAt&&neutralCourtesy(events[i].text))?events:null;
}

function currentContinuation(s,c,plan,questionId){
 if(c.company!=='fumigacion'||!c.enabled||plan?.guard!==MARIA_PROGRAM_OPERATIONAL_CONTINUATION_GUARD||plan.questionId!==questionId)return null;
 if(!publicQuestionAllowed(s,c,questionId))return null;
 const q=s.db.prepare('SELECT q.*,o.state delivery,o.mid,o.native_proof,o.created outbox_created FROM tesa_questions q JOIN tesa_outbox o ON o.id=q.outbox_id WHERE q.id=? AND q.company=?').get(questionId,c.company),conv=s.conversation(plan.phone),entry=getMeta(s,'maria-registration:'+plan.caseId);
 if(!q||q.state!=='ANSWERED'||q.valid_until<=Date.now()||!['DELIVERED','READ'].includes(q.delivery)||q.topic!=='disponibilidad-y-tecnico'||q.customer_phone!==plan.phone||q.case_id!==plan.caseId||q.source_line!==plan.line||!conv||conv.hold||conv.state.caseId!==plan.caseId||conv.state.closed||conv.state.programIntake?.stage!=='registered'||conv.state.programServiceId!==plan.orderId||registrationHash(conv.state.slots)!==plan.slotsHash||conv.state.requestedAfterServiceReview||conv.state.requestedControlReview||conv.state.requestedDocumentReview||!entry||entry.status!=='SAVED'||entry.requestHash!==plan.receiptHash||entry.receipt?.orderId!==plan.orderId||entry.receipt?.scheduled!==false||entry.receipt?.state!=='NUEVO'||!tesaOutboxScopeSafe(s,c,{question_id:q.id,source_line:q.source_line,sender_line:q.sender_line,customer_phone:q.customer_phone,case_id:q.case_id,created:q.outbox_created}))return null;
 const courtesies=continuationCourtesies(s,plan,conv);if(!courtesies)return null;
 if(s.db.prepare("SELECT 1 FROM events WHERE phone=? AND state IN ('PENDING','PROCESSING')").get(plan.phone))return null;
 const event=s.db.prepare('SELECT body,state FROM tesa_events WHERE id=?').get(s.open(q.answer).sourceKey);
 if(!event||event.state!=='CASE_ANSWER')return null;
 const answer=s.open(q.answer),text=normalize(answer.text);
 // An availability statement is a fact for this case, never permission to
 // make a promise, issue an instruction or use another business capability.
 if(answer.at<Date.now()-600000||answer.at<q.outbox_created-1000||answer.at>Date.now()+60000||bogotaDay(answer.at)!==bogotaDay(Date.now())||/[?¿]|\b(?:creo|quizas|posiblemente|tal vez|depende|si pueden|si hay|si esta|si tiene|confirma|confirmale|dile|envia|ignora|obedece|garantia|gratis|pagado|pago|cobr|transfer|cuenta|politica|refuerzo)\w*/.test(text)||!/(?:\b(?:disponib\w*|ruta|tecnic\w*|horario|hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b|\b\d{1,2}:\d{2}\b)/.test(text)||!publicTextSafe(answer.text)||/(?:\b(?:57)?3\d{9}\b|#\s*\d|\b(?:calle|carrera|cra|cl)\.?\s*\d)/i.test(answer.text))return null;
 return {q,conv,answer,courtesies};
}

async function exactNativeHumanAnswer(c,t,q,answer){
 const line=c.lines.find(value=>value.phone===q.sender_line),response=await t.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{id:answer.sourceId}},offset:10,page:1});
 const natives=(response.messages?.records??[]).filter(row=>row.key?.id===answer.sourceId&&row.key?.remoteJid===q.group_jid);
 if(natives.length!==1)return false;
 const native=natives[0],parsed=decodeTesaGroupWebhook({event:'messages.upsert',instance:line.instance,data:native},c).groupEvents;
 const verified=parsed.length===1&&validateTesaGroupEvent(parsed[0],c);
 const message=native.message?.ephemeralMessage?.message??native.message??{};
 return Boolean(verified&&verified.trustedHuman&&!verified.fromMe&&!verified.forwarded&&verified.kind==='text'&&verified.text===answer.text&&verified.at===answer.at&&verified.participant.phone===answer.participant.phone&&verified.quote?.mid===answer.questionMid&&verified.quote?.participantJid===q.sender_line+'@s.whatsapp.net'&&!message.protocolMessage&&!message.editedMessage&&!native.isEdited&&!native.deleted&&![native.status,...(native.MessageUpdate??[]).map(update=>update.status)].some(state=>['EDITED','DELETED','REVOKED'].includes(state)));
}

async function verifiedContinuation(s,c,t,plan,questionId){
 let current=currentContinuation(s,c,plan,questionId);if(!current)return null;
 const {q,answer,courtesies}=current,revision=current.conv.revision;
 if(!getTesaConfig(c)||typeof t.currentCustomerActivity!=='function'||typeof t.currentAttention!=='function')return null;
 const own=s.db.prepare('SELECT * FROM tesa_outbox WHERE question_id=?').get(questionId);
 if(!await verifyTesaNativeDelivery(s,c,t,own)||!await exactNativeHumanAnswer(c,t,q,answer))return null;
 const attention=await t.currentAttention(plan.phone,{store:s});if(!attention.complete)return null;
 const classified=partitionNativeAttention(s,c,{phone:plan.phone,line:plan.line,revision:current.conv.revision,created:plan.preparedAt,sourceAt:plan.customerAt},attention),unknown=classified.unknown[0];
 if(classified.releasedSources.length)s.audit('TESA_PRE_RETURN_ATTENTION_PRESERVED',questionId,{sources:classified.releasedSources,releaseSource:classified.release.source,holdReleased:false,authorUnverified:true,businessWritten:false});
 if(unknown){s.hold(plan.phone,unknown.id);return null;}
 const activity=await t.currentCustomerActivity(plan.phone,plan.customerAt,{store:s});
 if(!activity.complete||!activity.sources.length||activity.sources.some(item=>{const row=s.db.prepare('SELECT line,at,revision FROM events WHERE id=? AND phone=? AND from_me=0').get(item.id,plan.phone);return !row||row.line!==plan.line||row.at!==item.at||row.revision>revision;}))return null;
 for(const event of courtesies){
  const ownLine=c.lines.find(value=>value.phone===plan.line),data=await t.request(ownLine,'/chat/findMessages/'+encodeURIComponent(ownLine.instance),{where:{key:{id:event.id}},offset:10,page:1}),matches=[];
  for(const row of (data.messages?.records??[]).filter(row=>row.key?.id===event.id)){
   const pn=plan.phone+'@s.whatsapp.net',primary=row.key.remoteJid,alt=row.key.remoteJidAlt,direct=(primary===pn||/^\d+@lid$/.test(primary??'')&&alt===pn)&&!(alt?.endsWith('@s.whatsapp.net')&&alt!==pn);
   if(direct||await verifyStoredNativeIdentitySource(s,c,t,event,row))matches.push(row);
  }
  if(matches.length!==1)return null;const row=matches[0],message=row.message?.ephemeralMessage?.message??row.message??{},contexts=[message.extendedTextMessage?.contextInfo,message.messageContextInfo,row.contextInfo].filter(Boolean);
  if(row.key.fromMe!==false||nativeText(row)!==event.text||Number(row.messageTimestamp)*1000!==event.at||contexts.some(context=>context.isForwarded||Number(context.forwardingScore)>0))return null;
 }
 // Attention/activity/courtesy reads can yield while the native human body is
 // edited without a webhook. Re-read that exact source after every such await;
 // only synchronous persisted checks remain before the send reservation.
 if(!await exactNativeHumanAnswer(c,t,q,answer))return null;
 current=currentContinuation(s,c,plan,questionId);return current&&current.conv.revision===revision&&current.q.mid===q.mid&&current.answer.sourceId===answer.sourceId&&current.answer.text===answer.text?current:null;
}

const unregisteredVerifiers={verifyQuestionDelivery:verifyTesaNativeDelivery,verifyHumanAnswer:exactNativeHumanAnswer};
export async function unregisteredTesaReplyValid(s,c,t,outbox){return mariaUnregisteredTesaReplyStillValid(s,c,t,outbox,unregisteredVerifiers);}
export async function verifySchedulingTesaAnswer(s,c,t,entry){
 const registered=getMeta(s,'tesa-continuation-plan:'+entry.plan.questionId),conv=s.conversation(entry.plan.phone);
 if(!registered||registered.orderId!==entry.plan.orderId||registered.receiptHash!==entry.plan.registrationRequestHash||registered.caseId!==entry.plan.caseId||registered.phone!==entry.plan.phone||registered.line!==entry.plan.line||!conv||conv.hold)return null;
 return verifiedContinuation(s,c,t,{...registered,revision:conv.revision,customerAt:conv.at},registered.questionId);
}
export async function schedulingProofForBackend(s,c,t,body){return ownSchedulingProof(s,c,t,body,{verifyRegistered:entry=>verifySchedulingTesaAnswer(s,c,t,entry)});}
export async function schedulingReplyValid(s,c,t,outbox){return ownSchedulingReplyStillValid(s,c,t,outbox,{verifyRegistered:entry=>verifySchedulingTesaAnswer(s,c,t,entry)});}

// Transport calls this before composition and once more immediately before
// reserving a send. Another reply/edit, takeover or new customer fact stops it.
export async function tesaCustomerReplyStillValid(s,c,t,outbox){
 if(!outbox?.id?.startsWith(continuationPrefix))return true;
 const questionId=outbox.id.slice(continuationPrefix.length),ref=getMeta(s,'tesa-continuation-reply:'+outbox.id);
 if(!ref||ref.text!==s.open(outbox.body)||ref.questionId!==questionId||ref.revision!==outbox.revision)return false;
 // Wait for Engine to classify an authenticated courtesy already in the queue.
 // Null is a deferral, not approval to send and not irreversible review.
 if(pendingContinuationCourtesy(s,ref.plan))return null;
 const revisionBefore=s.conversation(ref.plan.phone)?.revision;
 const current=await verifiedContinuation(s,c,t,ref.plan,questionId);
 if(!current&&(pendingContinuationCourtesy(s,ref.plan)||s.conversation(ref.plan.phone)?.revision!==revisionBefore&&currentContinuation(s,c,ref.plan,questionId)?.courtesies.length))return null;
 if(!current||current.answer.sourceId!==ref.sourceId||current.answer.text!==ref.answerText||current.conv.state.verifiedTesaAnswerSource!==ref.sourceId||current.conv.state.awaitingHumanReview)return false;
 if(current.conv.revision!==outbox.revision){
  const revised=s.tx(()=>{
   const latest=currentContinuation(s,c,ref.plan,questionId);if(!latest||latest.conv.revision!==current.conv.revision||latest.answer.sourceId!==ref.sourceId)return false;
   if(!s.db.prepare("UPDATE outbox SET revision=? WHERE id=? AND state='READY' AND revision=?").run(latest.conv.revision,outbox.id,outbox.revision).changes)return false;
   putMeta(s,'tesa-continuation-reply:'+outbox.id,{...ref,revision:latest.conv.revision});outbox.revision=latest.conv.revision;
   s.audit('TESA_NEUTRAL_CUSTOMER_COURTESY_RECHECKED',outbox.id,{caseId:ref.plan.caseId,questionId,sourceIds:latest.courtesies.map(event=>event.id),acceptanceRenewed:false,receiptChanged:false,customerReplyDuplicated:false});return true;
  });if(!revised)return false;
 }
 return true;
}

async function continueRegisteredCustomer(s,c,t,accepted){
 if(!publicQuestionAllowed(s,c,accepted.questionId))return {prepared:false,queued:false,prospectiveWindowBlocked:true};
 const plan=getMeta(s,'tesa-continuation-plan:'+accepted.questionId);if(!plan)return {prepared:false,queued:false};
 if(ownSchedulingPlan(s,c,accepted.questionId)){
  let outcome;try{outcome=await continueOwnSchedulingOffer(s,c,t,accepted,{verifyRegistered:()=>verifiedContinuation(s,c,t,plan,accepted.questionId)});}catch{outcome={prepared:true,queued:false,nativeReadPending:true};}
  const retryKey='tesa-continuation-read:'+accepted.questionId;
  if(outcome.nativeReadPending){putMeta(s,retryKey,{...accepted,state:'PENDING_NATIVE_READ',nextAt:Date.now()+60000});return outcome;}
  s.db.prepare('DELETE FROM meta WHERE key=?').run(retryKey);
  if(outcome.missingExplicitSlot){
   const q=s.db.prepare('SELECT * FROM tesa_questions WHERE id=?').get(accepted.questionId),conv=s.conversation(plan.phone),body=q&&s.open(q.body),once='maria-scheduling-clarification:'+accepted.questionId;
   if(q?.state==='ANSWERED'&&conv&&!conv.hold&&conv.state.caseId===plan.caseId&&conv.state.pendingTesaQuestionId===q.id&&!body.conditions?.schedulingClarificationOf&&!getMeta(s,once)){
    const result=routeCaseQuestion(s,c,{phone:plan.phone,line:plan.line,caseId:plan.caseId,topic:'disponibilidad-y-tecnico',source:body.source,conditions:{...body.conditions,schedulingClarificationOf:q.id},text:'Faltan datos explícitos para programar la solicitud. ¿Qué técnico, fecha y hora de inicio y fin están disponibles?'});
    putMeta(s,once,{questionId:result.id,created:result.created===true,sourceId:accepted.id});
    if(result.created){s.saveConversation(plan.phone,{...conv.state,awaitingHumanReview:true,pendingTesaQuestionId:result.id});s.audit('OWN_SCHEDULING_SLOT_CLARIFICATION_PREPARED',accepted.id,{questionId:result.id,originalQuestionId:q.id,businessWritten:false});}
   }
  }
  return outcome;
 }
 let current;const revisionBefore=s.conversation(plan.phone)?.revision;
 try{current=await verifiedContinuation(s,c,t,plan,accepted.questionId);}catch{
  // No send has been reserved. Keep a retry for this new, explicitly prepared
  // question only; a duplicate webhook or a historical answer is not replayed.
  putMeta(s,'tesa-continuation-read:'+accepted.questionId,{questionId:accepted.questionId,caseId:accepted.caseId,customerPhone:accepted.customerPhone,id:accepted.id,state:'PENDING_NATIVE_READ',nextAt:Date.now()+60000});
  s.audit('TESA_CUSTOMER_CONTINUITY_NATIVE_READ_PENDING',accepted.id,{caseId:accepted.caseId,questionId:accepted.questionId,customerReplyQueued:false,businessWritten:false});return {prepared:true,queued:false};
 }
 s.db.prepare('DELETE FROM meta WHERE key=?').run('tesa-continuation-read:'+accepted.questionId);
 if(!current){
  if(pendingContinuationCourtesy(s,plan)||s.conversation(plan.phone)?.revision!==revisionBefore&&currentContinuation(s,c,plan,accepted.questionId)?.courtesies.length){putMeta(s,'tesa-continuation-read:'+accepted.questionId,{questionId:accepted.questionId,caseId:accepted.caseId,customerPhone:accepted.customerPhone,id:accepted.id,state:'PENDING_NATIVE_READ',nextAt:Date.now()+1000});s.audit('TESA_CUSTOMER_COURTESY_CLASSIFICATION_PENDING',accepted.id,{caseId:accepted.caseId,questionId:accepted.questionId,customerReplyQueued:false});return {prepared:true,queued:false};}
  s.audit('TESA_CUSTOMER_CONTINUITY_REVIEW',accepted.id,{caseId:accepted.caseId,questionId:accepted.questionId,customerReplyQueued:false,businessWritten:false});return {prepared:true,queued:false};
 }
 const {answer}=current,text='Para tu solicitud registrada, la disponibilidad informada es: «'+answer.text+'». Esta disponibilidad todavía requiere confirmación en la agenda.';
 if(!publicTextSafe(text))return {prepared:true,queued:false};
 return s.tx(()=>{
  const latest=currentContinuation(s,c,plan,accepted.questionId);if(!latest||latest.conv.state.pendingTesaQuestionId!==accepted.questionId)return {prepared:true,queued:false};
  const id=continuationPrefix+accepted.questionId;
  putMeta(s,'tesa-continuation-reply:'+id,{questionId:accepted.questionId,sourceId:answer.sourceId,answerText:answer.text,text,revision:latest.conv.revision,plan});
  const queued=s.queue(id,plan.phone,plan.line,text,false,latest.conv.revision,plan.caseId);
  s.saveConversation(plan.phone,{...latest.conv.state,awaitingHumanReview:false,pendingTesaQuestionId:null,verifiedTesaAnswerSource:answer.sourceId});
  s.audit('TESA_OWN_OPERATIONAL_WAIT_FINISHED',answer.sourceId,{caseId:plan.caseId,questionId:accepted.questionId,humanHoldReleased:false,customerReplyQueued:queued,scheduled:false,businessWritten:false});
  return {prepared:true,queued};
 });
}

// Refresh only the already authorized group and its own sending instance.
// Native membership supplies identity, never policy or permission to write business data.
export async function refreshTesaMembership(config,transport,{force=false,now=Date.now()}={}){
  const t=config.tesaOperations;if(!t?.enabled)return null;
  if(!force&&t.lastMembershipFailureAt&&now-t.lastMembershipFailureAt<60000)throw Error('TESA_MEMBERSHIP_RETRY_PENDING');
  const current=getTesaConfig(config,now);
  if(!force&&current&&now-current.verifiedMembership.verifiedAt<300000)return current;
  const line=config.lines.find(l=>l.phone===t.senderLine);if(!line)throw Error('TESA_OWN_SENDER_REQUIRED');
  try{
    await transport.verifyLine(line.phone);
    const group=await transport.request(line,'/group/findGroupInfos/'+encodeURIComponent(line.instance)+'?groupJid='+encodeURIComponent(t.groupJid));
    if(group.id!==t.groupJid||group.subject!==t.groupSubject||!Array.isArray(group.participants)||group.participants.length!==group.size)throw Error('TESA_NATIVE_GROUP_MISMATCH');
    const bindings=group.participants.map(p=>{
      const direct=phoneJid(p.id),alt=phoneJid(p.phoneNumber);
      if(direct&&alt&&direct!==alt)throw Error('TESA_PARTICIPANT_CONFLICT');
      const phone=direct??alt;
      if(!/^(?:57\d{10}@s\.whatsapp\.net|\d+@lid)$/.test(p.id??''))throw Error('TESA_PARTICIPANT_INVALID');
      return {jid:p.id,phone};
    });
    const phones=[...new Set(bindings.map(b=>b.phone).filter(Boolean))];
    if(!phones.includes(line.phone))throw Error('TESA_OWN_MEMBERSHIP_REQUIRED');
    config.tesaOperations={...t,lastMembershipFailureAt:null,allowedParticipantPhones:t.allowedParticipantPhones.filter(p=>phones.includes(p)),verifiedMembership:{owner:line.phone,ownerOpen:true,verifiedAt:now,expiresAt:now+300000,
      sourceHash:createHash('sha256').update(JSON.stringify(group)).digest('hex'),participantPhones:phones,participantBindings:bindings}};
    const verified=getTesaConfig(config,now);if(!verified)throw Error('TESA_MEMBERSHIP_CONFIG_INVALID');return verified;
  }catch(error){config.tesaOperations={...t,lastMembershipFailureAt:now,verifiedMembership:{...t.verifiedMembership,expiresAt:now-1}};throw error;}
}

export async function verifyTesaNativeDelivery(store,config,transport,outbox,{now=Date.now()}={}){
  const t=await refreshTesaMembership(config,transport);
  if(!t||!outbox?.mid||outbox.group_jid!==t.groupJid||outbox.sender_line!==t.senderLine)return false;
  const line=config.lines.find(l=>l.phone===outbox.sender_line);
  const data=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{id:outbox.mid}},offset:10,page:1});
  const exact=(data.messages?.records??[]).filter(r=>r.key?.id===outbox.mid&&r.key?.remoteJid===t.groupJid&&r.key?.fromMe===true&&nativeText(r)===store.open(outbox.body));
  if(exact.length!==1)return false;
  const r=exact[0],states=[r.status,...(r.MessageUpdate??[]).map(u=>u.status)];
  const state=states.some(s=>['READ','PLAYED'].includes(s))?'READ':states.includes('DELIVERY_ACK')?'DELIVERED':null;
  if(!state)return false;
  return bindTesaQuestionDelivery(store,config,{outboxId:outbox.id,mid:outbox.mid,groupJid:t.groupJid,senderLine:t.senderLine,text:nativeText(r),state,at:now,nativeVerified:true});
}

export async function ingestTesaWebhook(store,config,transport,body){
  if(!config.tesaOperations?.enabled)return {observed:0,duplicates:0,caseAnswers:0};
  const values=Array.isArray(body?.data)?body.data:[body?.data];
  if(!values.some(v=>v?.key?.remoteJid===config.tesaOperations.groupJid))return {observed:0,duplicates:0,caseAnswers:0};
  // A failed membership read must not let an incoming group payload grant identity.
  try{await refreshTesaMembership(config,transport);}catch{return {observed:0,duplicates:0,caseAnswers:0,membershipReview:true};}
  const parsed=decodeTesaGroupWebhook(body,config),events=parsed.groupEvents??[];
  let observed=0,duplicates=0,caseAnswers=0;
  for(const event of events){
    const result=observeTesaGroupEvent(store,config,event);if(!result?.observed)continue;
    observed++;if(result.duplicate)duplicates++;
    if(event.quote?.mid){
      const own=store.db.prepare('SELECT * FROM tesa_outbox WHERE mid=? AND company=? AND group_jid=? AND sender_line=?').get(event.quote.mid,config.company,event.groupJid,event.receivingLine);
      if(own&&['ACCEPTED','DELIVERED','READ'].includes(own.state)){
        try{await verifyTesaNativeDelivery(store,config,transport,own);}catch{}
      }
    }
    const answer=acceptTesaQuotedAnswer(store,config,event);
    if(answer?.accepted){
      caseAnswers++;
      // Preserve the native historical answer without turning reopening into
      // a continuation, a scheduling offer or a release of an older wait.
      if(!publicQuestionAllowed(store,config,answer.questionId))continue;
      const unregistered=await continueMariaUnregisteredTesaCustomer(store,config,transport,answer,unregisteredVerifiers);
      if(unregistered.prepared){
        if(unregistered.nativeReadPending)putMeta(store,'maria-unregistered-read:'+answer.questionId,{...answer,nextAt:Date.now()+60000});
        continue;
      }
      const continuation=await continueRegisteredCustomer(store,config,transport,answer);
      if(continuation.prepared)continue;
      const conversation=store.conversation(answer.customerPhone);
      if(config.company==='fumigacion'&&conversation?.state.programIntake?.stage==='registered'){
        store.audit('TESA_HISTORICAL_CONTINUITY_PRESERVED',event.id,{caseId:answer.caseId,questionId:answer.questionId,customerReplyQueued:false,humanHoldReleased:false});continue;
      }
      if(conversation&&!conversation.hold&&conversation.state.caseId===answer.caseId&&conversation.state.pendingTesaQuestionId===answer.questionId){
        // This finishes only the bot's own operational wait. A staff hold is never released.
        store.saveConversation(answer.customerPhone,{...conversation.state,awaitingHumanReview:false,pendingTesaQuestionId:null,verifiedTesaAnswerSource:event.id});
        store.audit('TESA_OWN_OPERATIONAL_WAIT_FINISHED',event.id,{caseId:answer.caseId,questionId:answer.questionId,humanHoldReleased:false,customerReplyQueued:false});
      }
    }
  }
  for(const delivery of parsed.groupDeliveries??[]){
    const own=store.db.prepare("SELECT * FROM tesa_outbox WHERE mid=? AND company=? AND group_jid=? AND sender_line=? AND state IN ('ACCEPTED','DELIVERED','READ')").get(delivery.mid,config.company,delivery.groupJid,delivery.receivingLine);
    if(own)try{await verifyTesaNativeDelivery(store,config,transport,own);}catch{}
  }
  return {observed,duplicates,caseAnswers};
}

export async function drainTesaGroup(store,config,transport){
  if(chiefReplyRestrictionActive(config))return {enabled:false,restrictedToChief:true,accepted:0,uncertain:0};
  if(!config.tesaOperations?.enabled)return {enabled:false,accepted:0,uncertain:0};
  let t;try{t=await refreshTesaMembership(config,transport);}catch{return {enabled:true,membershipReview:true,accepted:0,uncertain:0};}
  if(!t)return {enabled:true,membershipReview:true,accepted:0,uncertain:0};
  let accepted=0,uncertain=0,scopeReviewed=0;
  const scopedReady=o=>{
    if(tesaOutboxScopeSafe(store,config,o))return true;
    if(store.db.prepare("UPDATE tesa_outbox SET state='OPERATIONAL_SCOPE_REVIEW',updated=? WHERE id=? AND state IN ('READY','SENDING')").run(Date.now(),o.id).changes){
      store.audit('TESA_OPERATIONAL_SCOPE_BEFORE_SEND_REVIEW',o.id,{caseId:o.case_id,sourceLine:o.source_line,senderLine:o.sender_line,coverage:operationalCoverage(config),attemptedSend:false,migrated:false});scopeReviewed++;
    }
    return false;
  };
  const deliveries=store.db.prepare("SELECT * FROM tesa_outbox WHERE state='ACCEPTED' AND mid IS NOT NULL AND created>? ORDER BY created LIMIT 10").all(Date.now()-86400000);
  for(const o of deliveries){
    const key='tesa-native-check:'+o.id,prior=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
    if(prior&&Date.now()-store.open(prior.value).at<60000)continue;
    store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,store.seal({at:Date.now()}));
    try{await verifyTesaNativeDelivery(store,config,transport,o);}catch{store.audit('TESA_NATIVE_DELIVERY_REVIEW',o.id,{attemptedSend:false});}
  }
  const publicCut=publicResponseSqlCutoff(config);
  const ready=store.db.prepare("SELECT * FROM tesa_outbox WHERE state='READY' AND (?<0 OR created>=?) ORDER BY created LIMIT 5").all(publicCut,publicCut);
  for(const o of ready){
    if(!publicTesaOutboxAllowed(store,config,o))continue;
    if(!scopedReady(o))continue;
    const conv=store.conversation(o.customer_phone);
    // A takeover between preparing the question and sending it also stops group questions.
    if(!config.enabled||!conv||conv.hold||conv.state.caseId!==o.case_id){
      store.db.prepare("UPDATE tesa_outbox SET state='ATTENTION_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);continue;
    }
    try{
      t=await refreshTesaMembership(config,transport,{force:!getTesaConfig(config)||config.tesaOperations.verifiedMembership.expiresAt-Date.now()<30000});
      if(!t)continue;
      await transport.verifyLine(t.senderLine);
      t=getTesaConfig(config);if(!t)continue;
    }catch{store.audit('TESA_MEMBERSHIP_BEFORE_SEND_REVIEW',o.id,{attemptedSend:false});continue;}
    if(chiefReplyRestrictionActive(config))continue;
    if(!publicTesaOutboxAllowed(store,config,o))continue;
    if(!scopedReady(o))continue;
    if(o.company!==config.company||o.group_jid!==t.groupJid||o.sender_line!==t.senderLine||!config.lines.some(l=>l.phone===o.source_line))throw Error('TESA_OUTBOX_SCOPE_MISMATCH');
    if(!store.db.prepare("UPDATE tesa_outbox SET state='SENDING',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes)continue;
    try{
      const latest=store.conversation(o.customer_phone);
      if(latest?.hold||latest?.state.caseId!==o.case_id){store.db.prepare("UPDATE tesa_outbox SET state='ATTENTION_REVIEW',updated=? WHERE id=? AND state='SENDING'").run(Date.now(),o.id);continue;}
      if(!scopedReady(o))continue;
      const line=config.lines.find(l=>l.phone===t.senderLine),text=store.open(o.body);
      const sent=await transport.request(line,'/message/sendText/'+encodeURIComponent(line.instance),{number:t.groupJid,text,linkPreview:false});
      if(typeof sent.key?.id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(sent.key.id)||sent.key.remoteJid&&sent.key.remoteJid!==t.groupJid)throw Error('TESA_SEND_WITHOUT_EXACT_RECEIPT');
      store.db.prepare("UPDATE tesa_outbox SET mid=?,state='ACCEPTED',updated=? WHERE id=? AND state='SENDING'").run(sent.key.id,Date.now(),o.id);
      store.audit('TESA_GROUP_QUESTION_ACCEPTED',o.id,{groupJid:t.groupJid,sourceLine:o.source_line,senderLine:t.senderLine,caseId:o.case_id,deliveryVerified:false});accepted++;
    }catch(error){
      store.db.prepare("UPDATE tesa_outbox SET state='UNCERTAIN',updated=? WHERE id=? AND state='SENDING'").run(Date.now(),o.id);
      store.audit('TESA_GROUP_SEND_UNCERTAIN',o.id,{cause:/^[A-Z_0-9]+$/.test(error.message??'')?error.message:'SEND_RESULT_UNCERTAIN',resend:false});uncertain++;
    }
  }
  const pendingContinuity=store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'tesa-continuation-read:%' ORDER BY key").all().filter(row=>publicQuestionAllowed(store,config,store.open(row.value).questionId)).slice(0,3);
  for(const row of pendingContinuity){const pending=store.open(row.value);if(pending.state==='PENDING_NATIVE_READ'&&pending.nextAt<=Date.now())await continueRegisteredCustomer(store,config,transport,pending);}
  for(const row of store.db.prepare("SELECT key,value FROM meta WHERE key LIKE 'maria-unregistered-read:%' ORDER BY key").all().filter(row=>publicQuestionAllowed(store,config,store.open(row.value).questionId)).slice(0,3)){
    const pending=store.open(row.value);if(pending.nextAt>Date.now())continue;
    const result=await continueMariaUnregisteredTesaCustomer(store,config,transport,pending,unregisteredVerifiers);
    if(result.nativeReadPending)putMeta(store,row.key,{...pending,nextAt:Date.now()+60000});else store.db.prepare('DELETE FROM meta WHERE key=?').run(row.key);
  }
  return {enabled:true,accepted,uncertain,scopeReviewed};
}
