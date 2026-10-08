import {createHash} from 'node:crypto';
import {getTesaConfig} from './tesa-config.mjs';
import {decodeTesaGroupWebhook} from './tesa-webhook.mjs';
import {observeTesaGroupEvent,acceptTesaQuotedAnswer,bindTesaQuestionDelivery} from './tesa-operations.mjs';

const nativeText=r=>{const m=r.message?.ephemeralMessage?.message??r.message??{};return m.conversation??m.extendedTextMessage?.text??null;};
const phoneJid=j=>/^57\d{10}@s\.whatsapp\.net$/.test(j??'')?j.split('@')[0]:null;

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
      const conversation=store.conversation(answer.customerPhone);
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
  if(!config.tesaOperations?.enabled)return {enabled:false,accepted:0,uncertain:0};
  let t;try{t=await refreshTesaMembership(config,transport);}catch{return {enabled:true,membershipReview:true,accepted:0,uncertain:0};}
  if(!t)return {enabled:true,membershipReview:true,accepted:0,uncertain:0};
  let accepted=0,uncertain=0;
  const deliveries=store.db.prepare("SELECT * FROM tesa_outbox WHERE state='ACCEPTED' AND mid IS NOT NULL AND created>? ORDER BY created LIMIT 10").all(Date.now()-86400000);
  for(const o of deliveries){
    const key='tesa-native-check:'+o.id,prior=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
    if(prior&&Date.now()-store.open(prior.value).at<60000)continue;
    store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,store.seal({at:Date.now()}));
    try{await verifyTesaNativeDelivery(store,config,transport,o);}catch{store.audit('TESA_NATIVE_DELIVERY_REVIEW',o.id,{attemptedSend:false});}
  }
  const ready=store.db.prepare("SELECT * FROM tesa_outbox WHERE state='READY' ORDER BY created LIMIT 5").all();
  for(const o of ready){
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
    if(o.company!==config.company||o.group_jid!==t.groupJid||o.sender_line!==t.senderLine||!config.lines.some(l=>l.phone===o.source_line))throw Error('TESA_OUTBOX_SCOPE_MISMATCH');
    if(!store.db.prepare("UPDATE tesa_outbox SET state='SENDING',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes)continue;
    try{
      const latest=store.conversation(o.customer_phone);
      if(latest?.hold||latest?.state.caseId!==o.case_id){store.db.prepare("UPDATE tesa_outbox SET state='ATTENTION_REVIEW',updated=? WHERE id=? AND state='SENDING'").run(Date.now(),o.id);continue;}
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
  return {enabled:true,accepted,uncertain};
}
