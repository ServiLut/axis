import {explicitNewService} from './after-service.mjs';
import { SANDRA, DIEGO, HILARY, CURRENT_OPERATOR_ROUTING, publicTextSafe, normalize,internalRecipients,knownInternalRecipient } from './config.mjs';
import {parseChiefDocument} from './chief-document.mjs';
import {selectPrice,verifyPriceSource} from './prices.mjs';
import {understandOwnCustomer,composeOwnReply,replyCandidates,probeOwnAi} from './conversational-ai.mjs';
import {drainProgramRegistrations,acceptsOrdinaryQuotation} from './maria-program.mjs';
import {routeCaseQuestion} from './engine.mjs';
import {initializeInactivityFollowup,queueInactivityFollowups,inactivityDeliveryValid,recordResponseTiming} from './inactivity-followup.mjs';
import {tesaCaseAnswers} from './tesa-operations.mjs';
import {drainTesaGroup} from './tesa-transport.mjs';
import {assertOperationalLineScope,operationalLines,operationalLineAllowed,operationalHistoryGuard,operationalCoverage} from './line-scope.mjs';

export class Transport {
  constructor(config, fetcher=fetch){this.config=config;this.fetcher=fetcher;}
  async request(line,path,body) {
    if(!this.config.lines.includes(line)||!line.apiKey)throw new Error('INSTANCE_ACCESS_REQUIRED');
    if(!operationalLineAllowed(this.config,line.phone)){
      // A suspended line may still supply authenticated staff evidence. These
      // exact provider routes are reads, never sending or reconnecting.
      const bindingRead=!body&&path==='/instance/fetchInstances?instanceName='+encodeURIComponent(line.instance);
      const messageRead=body&&path==='/chat/findMessages/'+encodeURIComponent(line.instance);
      if(!bindingRead&&!messageRead)throw Error('LINE_SUSPENDED_BY_AUTHORIZED_SCOPE');
    }
    const response=await this.fetcher(this.config.provider+path,{method:body?'POST':'GET',headers:{apikey:line.apiKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('CHANNEL_HTTP_'+response.status); return response.json();
  }
  async verifyLineBinding(phone) {
    const line=this.config.lines.find(l=>l.phone===phone);if(!line)throw new Error('LINE_OUTSIDE_COMPANY');
    const data=await this.request(line,'/instance/fetchInstances?instanceName='+encodeURIComponent(line.instance));
    const scope=Array.isArray(data)?data:[data];
    const own=scope.filter(x=>(x.name??x.instance?.instanceName??x.instanceName)===line.instance);
    if(scope.length!==1||own.length!==1||own[0].ownerJid?.split('@')[0]!==phone)throw new Error('CHANNEL_OWNER_MISMATCH');
    return {phone,instance:line.instance,open:String(own[0].connectionStatus).toLowerCase()==='open',ownerVerified:true,checkedAt:new Date().toISOString()};
  }
  async verifyLine(phone) {
    if(!this.config.lines.some(line=>line.phone===phone))throw new Error('LINE_OUTSIDE_COMPANY');
    if(!operationalLineAllowed(this.config,phone))throw Error('LINE_SUSPENDED_BY_AUTHORIZED_SCOPE');
    const binding=await this.verifyLineBinding(phone);
    if(!binding.open)throw new Error('CHANNEL_NOT_OPEN');
    return binding;
  }
  async send(row,text) {
    if(!row.internal&&!this.config.enabled)throw new Error('CUSTOMER_GATE_CLOSED');
    if(row.internal&&!internalRecipients(this.config).includes(row.phone))throw new Error('INTERNAL_RECIPIENT_MISMATCH');
    if(!row.internal&&knownInternalRecipient(row.phone))throw new Error('INTERNAL_ROLE_REQUIRED');
    if(!row.internal&&!publicTextSafe(text))throw new Error('EXTERNAL_TEXT_REJECTED');
    if(!/^57\d{10}$/.test(row.phone))throw new Error('GROUP_OR_INVALID_RECIPIENT');
    const line=this.config.lines.find(l=>l.phone===row.line);if(!line)throw new Error('LINE_OUTSIDE_COMPANY');
    if(typeof text==='object'){
      if(!row.internal||row.phone!==SANDRA||text?.kind!=='chief_document')throw Error('CHIEF_DOCUMENT_SCOPE_REQUIRED');
      const doc=parseChiefDocument({...text,key:'stored-document',sourceHash:text.sha256});
      const sent=await this.request(line,'/message/sendMedia/'+encodeURIComponent(line.instance),{number:SANDRA,mediatype:'document',mimetype:doc.mimetype,fileName:doc.fileName,media:doc.mediaBase64,caption:doc.caption});
      if(!sent.key?.id)throw Error('SEND_WITHOUT_RECEIPT');return sent.key.id;
    }
    const result=await this.request(line,'/message/sendText/'+encodeURIComponent(line.instance),{number:row.phone,text,linkPreview:false});
    if(!result.key?.id)throw new Error('SEND_WITHOUT_RECEIPT');return result.key.id;
  }
  async priorHistory(phone) {
    const c=this.config;
    if(!/^57\d{10}$/.test(phone)||!Number.isFinite(c.activatedAt))throw new Error('HISTORY_SCOPE_REQUIRED');
    const checks=[];
    for(const line of operationalLines(c)){
      await this.verifyLine(line.phone);
      for(const addressField of ['remoteJid','remoteJidAlt']){
      const data=await this.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{
        where:{key:{[addressField]:phone+'@s.whatsapp.net',fromMe:true},messageTimestamp:{gte:'2000-01-01T00:00:00.000Z',lte:new Date(c.activatedAt-1).toISOString()}},offset:1,page:1
      });
      const value=data?.messages;
      if(!value||!Number.isSafeInteger(value.total)||value.total<0||!Array.isArray(value.records)||
        (value.total===0&&value.records.length!==0)||(value.total>0&&value.records.length!==1))throw new Error('HISTORY_RESULT_UNVERIFIED');
      const r=value.records[0];
      if(r&&(r.key?.[addressField]!==phone+'@s.whatsapp.net'||!/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(r.key.remoteJid||'')||r.key.fromMe!==true||!r.key.id||!Number.isFinite(Number(r.messageTimestamp))||Number(r.messageTimestamp)*1000>=c.activatedAt))throw new Error('HISTORY_RESULT_OUTSIDE_SCOPE');
      checks.push({line:line.phone,instance:line.instance,addressField,total:value.total,lastSourceId:r?.key.id??null,lastAt:r?Number(r.messageTimestamp)*1000:null});
      }
    }
    return {cutoff:c.activatedAt,checkedAt:Date.now(),guardVersion:operationalHistoryGuard(c),priorOutgoing:checks.some(x=>x.total>0),checks,coverage:operationalCoverage(c),scope:assertOperationalLineScope(c)?'authorized-own-blue-line-and-explicit-phone-alternatives; red-history-not-read; metadata-only; historical-author-unattributed':'own-two-lines-and-explicit-phone-alternatives; metadata-only; historical-author-unattributed'};
  }
  async currentAttention(phone) {
    const c=this.config;if(!/^57\d{10}$/.test(phone)||!Number.isFinite(c.activatedAt))throw new Error('ATTENTION_SCOPE_REQUIRED');
    const through=Date.now(),sources=new Map(),checks=[];
    for(const line of operationalLines(c)){
      await this.verifyLine(line.phone);
      for(const addressField of ['remoteJid','remoteJidAlt']){
        let expectedTotal=null,read=0;
        for(let page=1;page<=2;page++){
          const data=await this.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{[addressField]:phone+'@s.whatsapp.net',fromMe:true},messageTimestamp:{gte:new Date(c.activatedAt).toISOString(),lte:new Date(through).toISOString()}},offset:50,page});
          const result=data.messages;
          if(!result||!Number.isSafeInteger(result.total)||result.total<0||result.total>100||!Array.isArray(result.records)||result.records.length>50||(expectedTotal!==null&&expectedTotal!==result.total))throw new Error('ATTENTION_COVERAGE_UNVERIFIED');
          expectedTotal=result.total;read+=result.records.length;
          for(const r of result.records){
            const key=r.key,at=Number(r.messageTimestamp)*1000;
            if(key?.[addressField]!==phone+'@s.whatsapp.net'||key.fromMe!==true||!key.id||!/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(key.remoteJid||'')||!Number.isFinite(at)||at<c.activatedAt||at>through)throw new Error('ATTENTION_SOURCE_OUTSIDE_SCOPE');
            const message=r.message?.ephemeralMessage?.message??r.message??{};
            const text=message.conversation??message.extendedTextMessage?.text??'';
            const written=typeof text==='string'&&text.trim().length>0;
            const media=Boolean(message.audioMessage||message.imageMessage||message.videoMessage||message.documentMessage);
            // An authenticated outgoing edit with an unavailable body remains
            // attention evidence. Read/delivery updates alone are not authorship.
            const edited=Array.isArray(r.MessageUpdate)&&r.MessageUpdate.some(u=>u.status==='EDITED');
            if(written||media||edited)sources.set(line.phone+':'+key.id,{id:key.id,line:line.phone,at,kind:media?'media':written?'text':'edited-body-unavailable'});
          }
          if(read===expectedTotal)break;
          if(!result.records.length||page===2||read>expectedTotal)throw new Error('ATTENTION_COVERAGE_UNVERIFIED');
        }
        checks.push({line:line.phone,addressField,total:expectedTotal,read});
      }
    }
    return {sources:[...sources.values()],checks,through,complete:true,coverage:operationalCoverage(c),scope:assertOperationalLineScope(c)?'authorized-own-blue-line-and-explicit-phone-alternatives; red-attention-not-read; written-or-media-outgoing':'own-two-lines-and-explicit-phone-alternatives; written-or-media-outgoing'};
  }
  async programContext(phone) {
    const c=this.config;
    if(!c.programContextUrl||!c.programToken||!c.expectedProgramCompanyId)return {verified:false,reason:'OWN_PROGRAM_NOT_CONNECTED'};
    const url=new URL(c.programContextUrl);if(url.protocol!=='https:'||url.username||url.password)throw new Error('PROGRAM_HTTPS_REQUIRED');
    url.searchParams.set('phone',phone);
    const r=await this.fetcher(url,{headers:{Authorization:'Bearer '+c.programToken},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error('PROGRAM_UNAVAILABLE'); const result=await r.json();
    if(result.system!==c.name||String(result.companyId)!==c.expectedProgramCompanyId||result.phone!==phone)throw new Error('PROGRAM_SCOPE_MISMATCH');
    return {...result,verified:true};
  }
  async currentCustomerActivity(phone,since){
    const c=this.config;
    if(c.company!=='fumigacion'||!/^57\d{10}$/.test(phone)||!Number.isFinite(since)||since<c.activatedAt)throw Error('INACTIVITY_SOURCE_SCOPE_REQUIRED');
    const through=Date.now(),sources=new Map(),checks=[];
    for(const line of operationalLines(c)){
      await this.verifyLine(line.phone);
      for(const addressField of ['remoteJid','remoteJidAlt']){
        let total=null,read=0;
        for(let page=1;page<=2;page++){
          const data=await this.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{[addressField]:phone+'@s.whatsapp.net',fromMe:false},messageTimestamp:{gte:new Date(since).toISOString(),lte:new Date(through).toISOString()}},offset:50,page});
          const result=data.messages;
          if(!result||!Number.isSafeInteger(result.total)||result.total<0||result.total>100||!Array.isArray(result.records)||result.records.length>50||(total!==null&&total!==result.total))throw Error('INACTIVITY_NATIVE_COVERAGE_UNVERIFIED');
          total=result.total;read+=result.records.length;
          for(const record of result.records){
            const key=record.key,at=Number(record.messageTimestamp)*1000;
            if(key?.[addressField]!==phone+'@s.whatsapp.net'||key.fromMe!==false||!key.id||!/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(key.remoteJid||'')||!Number.isFinite(at)||at<since||at>through)throw Error('INACTIVITY_NATIVE_SOURCE_UNVERIFIED');
            sources.set(line.phone+':'+key.id,{id:key.id,line:line.phone,at});
          }
          if(read===total)break;
          if(!result.records.length||read>total||page===2)throw Error('INACTIVITY_NATIVE_COVERAGE_UNVERIFIED');
        }
        checks.push({line:line.phone,addressField,total,read});
      }
    }
    return {complete:true,through,sources:[...sources.values()],checks,coverage:operationalCoverage(c),scope:assertOperationalLineScope(c)?'authorized-own-blue-line-and-explicit-phone-alternatives; red-customer-activity-not-read':'own-two-lines-and-explicit-phone-alternatives'};
  }
  async understand(event,context,knowledge,store) {
    const c=this.config;
    if(c.conversationalAi?.provider)return understandOwnCustomer(c,store,this.fetcher,event,context);
    if(!c.aiUrl||!c.aiToken||event.kind!=='text')return {};
    const url=new URL(c.aiUrl);if(url.protocol!=='https:'||url.username||url.password)throw new Error('AI_HTTPS_REQUIRED');
    const r=await this.fetcher(url,{method:'POST',headers:{Authorization:'Bearer '+c.aiToken,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(25000),body:JSON.stringify({company:c.name,task:'extract-literal-intake-slots-only',event:{id:event.id,text:event.text},context,knowledge})});
    if(!r.ok)throw new Error('AI_UNAVAILABLE'); const result=await r.json();
    if(result.eventId!==event.id||result.company!==c.name)throw new Error('AI_CONTEXT_MISMATCH');return result;
  }
  async composeReply(row,text,store){return composeOwnReply(this.config,store,this.fetcher,row,text);}
  async aiHealth(store){return probeOwnAi(this.config,store,this.fetcher);}
}

export async function drain(store,config,transport,engine) {
  if(!config.enabled&&!config.chiefOnly)return {enabled:false};
  initializeInactivityFollowup(config,store);
  const fastMaria=config.company==='fumigacion'&&config.responseTargetMs===3000;
  const before=fastMaria?await flushOutbox(store,config,transport):{accepted:0,suppressed:0,uncertain:0};
  const pending=store.db.prepare("SELECT body,revision FROM events WHERE state='PENDING' AND (?=1 OR phone IN (?,?,?)) ORDER BY from_me DESC,at,rowid LIMIT ?").all(Number(config.enabled),SANDRA,DIEGO,HILARY,fastMaria?1:30);
  for(const row of pending) {
    const e=store.open(row.body); let analysis={};
    const lineScope=assertOperationalLineScope(config);
    if(lineScope&&!e.fromMe&&!knownInternalRecipient(e.phone)&&
      (e.at<Date.parse(lineScope.authorizedAt)||
        !operationalLineAllowed(config,e.line)||
        typeof store.hasSourcesOutsideLine!=='function'||store.hasSourcesOutsideLine(e.phone,e.line))){
      store.db.prepare("UPDATE events SET state='OPERATIONAL_SCOPE_REVIEW' WHERE id=? AND state='PENDING'").run(e.id);
      store.audit('OPERATIONAL_SCOPE_EVENT_BLOCKED',e.id,{line:e.line,coverage:operationalCoverage(config),replayed:false,migrated:false});continue;
    }
    if(!e.fromMe&&!operationalLineAllowed(config,e.line)){
      store.db.prepare("UPDATE events SET state='SUSPENDED_LINE_REVIEW' WHERE id=? AND state='PENDING'").run(e.id);
      store.audit('SUSPENDED_LINE_EVENT_BLOCKED',e.id,{line:e.line,coverage:operationalCoverage(config),replayed:false,migrated:false});continue;
    }
    const conversation=store.conversation(e.phone),superseded=!e.fromMe&&!knownInternalRecipient(e.phone)&&(e.at<conversation?.at||row.revision<conversation?.revision);
    if(superseded){await engine.process(e);continue;}
    if(config.historyCheckRequired&&!e.fromMe&&!knownInternalRecipient(e.phone)){
      const checked=store.priorHistory(e.phone);
      if(checked?.cutoff!==config.activatedAt||((transport instanceof Transport||assertOperationalLineScope(config))&&checked.guardVersion!==operationalHistoryGuard(config))){
        try{store.savePriorHistory(e.phone,await transport.priorHistory(e.phone),e.id);}
        catch{store.audit('PRIOR_HISTORY_UNVERIFIED',e.id);store.db.prepare("UPDATE events SET state='HISTORY_REVIEW' WHERE id=? AND state='PENDING'").run(e.id);continue;}
      }
    }
    if(lineScope&&!e.fromMe&&!knownInternalRecipient(e.phone)&&
      (typeof store.hasSourcesOutsideLine!=='function'||store.hasSourcesOutsideLine(e.phone,e.line))){
      store.db.prepare("UPDATE events SET state='OPERATIONAL_SCOPE_REVIEW' WHERE id=? AND state='PENDING'").run(e.id);
      store.audit('OPERATIONAL_SCOPE_CHANGED_BEFORE_MODEL',e.id,{line:e.line,coverage:operationalCoverage(config),replayed:false,migrated:false});continue;
    }
    const newCase=config.company==='fumigacion'?explicitNewService(e.text):/\b(?:otra solicitud|nuevo servicio|otro servicio|otro equipo)\b/.test(normalize(e.text));
    const intakeStage=store.conversation(e.phone)?.state.programIntake?.stage;
    const ownQuotationAcceptance=config.company==='fumigacion'&&Boolean(conversation?.state.quotedPrice)&&acceptsOrdinaryQuotation(e.text);
    if(!e.fromMe&&!knownInternalRecipient(e.phone)&&!store.conversation(e.phone)?.hold&&(!store.conversation(e.phone)?.state.awaitingHumanReview||newCase)&&!ownQuotationAcceptance&&!['name','address','details','confirm','correction','pending'].includes(intakeStage)){
      // Customer history remains in its company. Observations are explicitly untrusted reference, never policy.
      const knowledge=store.db.prepare('SELECT body FROM knowledge ORDER BY imported DESC LIMIT 10').all().map(k=>store.open(k.body));
      const caseId=newCase?'':store.conversation(e.phone)?.state.caseId||'';
      const caseAnswers=store.db.prepare("SELECT body,answer,source_id,answer_at,valid_until FROM questions WHERE phone=? AND case_id=? AND state='ANSWERED' AND valid_until>?").all(e.phone,caseId,Date.now()).map(q=>({question:store.open(q.body).text,answer:store.open(q.answer),source:q.source_id,at:q.answer_at,validUntil:q.valid_until,scope:'same-company-and-case-only; recheck before scheduling'})).concat(tesaCaseAnswers(store,config,{caseId,customerPhone:e.phone}));
      const conversationHistory=store.conversationContext(e.phone,e.at,20,e.id);
      store.audit('CONVERSATION_CONTEXT_CHECKED',e.id,{caseId:conversationHistory.caseId,turns:conversationHistory.turns.length,storedCoverageComplete:conversationHistory.completeStoredHistory,fullWhatsAppHistoryRead:false,originalMediaRead:false});
      // A completed registration can receive a new post-service concern after
      // an express human return. It still needs semantic understanding, but
      // names, addresses and registration payloads are not model context.
      const semanticState=intakeStage==='registered'?{slots:conversation?.state.slots,asked:conversation?.state.asked,requestedAfterServiceReview:conversation?.state.requestedAfterServiceReview,lastText:null}:conversation?.state;
      try{analysis=await transport.understand(e,{...(newCase?{slots:{},asked:[]}:semanticState),requestedNewCase:newCase,caseAnswers,...(intakeStage==='registered'?{}:{conversationHistory})},knowledge,store);}catch{store.audit('AI_UNAVAILABLE',e.id);}
    }
    await engine.process(e,analysis);
  }
  const after=await flushOutbox(store,config,transport);
  // Active reception takes precedence over inactivity scans. A fresh reply is
  // delivered before any optional native-history read for another open case.
  const followup=pending.length?{enabled:Boolean(config.inactivityFollowupEnabled),queued:0,deferredForActiveReception:true}:await queueInactivityFollowups(store,config,transport);
  const followed=followup.queued?await flushOutbox(store,config,transport):{accepted:0,suppressed:0,uncertain:0};
  const groupOperations=await drainTesaGroup(store,config,transport);
  return {processed:pending.length,accepted:before.accepted+after.accepted+followed.accepted,suppressed:before.suppressed+after.suppressed+followed.suppressed,uncertain:before.uncertain+after.uncertain+followed.uncertain,followup,groupOperations};
}

export async function flushOutbox(store,config,transport){
  await drainProgramRegistrations(store,config,transport,routeCaseQuestion);
  let accepted=0,suppressed=0,uncertain=0;
  const out=store.db.prepare("SELECT * FROM outbox WHERE state='READY' AND (?=1 OR (internal=1 AND phone IN (?,?,?))) ORDER BY created,rowid LIMIT 20").all(Number(config.enabled),SANDRA,DIEGO,HILARY);
  for(const o of out) {
    const lineScope=assertOperationalLineScope(config);
    if(lineScope&&(o.created<Date.parse(lineScope.authorizedAt)||
      (!o.internal&&(typeof store.hasSourcesOutsideLine!=='function'||store.hasSourcesOutsideLine(o.phone,o.line))))){
      if(store.db.prepare("UPDATE outbox SET state='OPERATIONAL_SCOPE_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes){
        store.audit('OPERATIONAL_SCOPE_OUTBOX_BLOCKED',o.id,{line:o.line,coverage:operationalCoverage(config),attemptedSend:false,migrated:false});suppressed++;
      }
      continue;
    }
    if(!operationalLineAllowed(config,o.line)){
      if(store.db.prepare("UPDATE outbox SET state='SUSPENDED_LINE_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes){
        store.audit('SUSPENDED_LINE_OUTBOX_BLOCKED',o.id,{line:o.line,coverage:operationalCoverage(config),attemptedSend:false,migrated:false});suppressed++;
      }
      continue;
    }
    if(o.internal&&o.phone===DIEGO&&config.operatorRouting===CURRENT_OPERATOR_ROUTING){
      // The current direct instruction retires Diego as an outgoing recipient.
      // Preserve the original question, recipient and encrypted body; never
      // redirect a historical pending question or touch prior send outcomes.
      if(store.db.prepare("UPDATE outbox SET state='RECIPIENT_RETIRED_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes){
        store.audit('INTERNAL_RECIPIENT_RETIRED_BEFORE_SEND',o.id,{company:config.name,recipient:DIEGO,operatorRouting:CURRENT_OPERATOR_ROUTING,caseId:o.case_id,attemptedSend:false,redirected:false});suppressed++;
      }
      continue;
    }
    if(config.company==='fumigacion')recordResponseTiming(store,o);
    if(!config.enabled&&!(config.chiefOnly&&o.internal&&internalRecipients(config).includes(o.phone)))continue;
    if(o.created<Date.now()-600000){store.db.prepare("UPDATE outbox SET state='EXPIRED_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);suppressed++;continue;}
    // Reject before any delivery attempt; this is a review, never an uncertain send.
    let text=store.open(o.body);
    if(!o.internal&&!publicTextSafe(text)){
      store.db.prepare("UPDATE outbox SET state='COMMUNICATION_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);
      store.hold(o.phone,'communication-review');store.audit('EXTERNAL_TEXT_REJECTED',o.id);suppressed++;continue;
    }
    // The original currentAttention implementation verifies every own line,
    // including this outgoing line, before reading both address forms. Reuse
    // that mandatory check instead of checking the same owner twice. Other
    // transports, internal replies and routes without native attention retain
    // their separate channel check.
    const ownerCheckedByNativeAttention=!o.internal&&config.historyCheckRequired&&transport instanceof Transport&&transport.config===config&&transport.currentAttention===Transport.prototype.currentAttention&&transport.verifyLine===Transport.prototype.verifyLine&&transport.verifyLineBinding===Transport.prototype.verifyLineBinding&&transport.request===Transport.prototype.request&&operationalLineAllowed(config,o.line);
    if(!ownerCheckedByNativeAttention){try{await transport.verifyLine(o.line);}catch{store.audit('CHANNEL_CHECK_FAILED',o.id);continue;}}
    if(!o.internal&&config.company==='fumigacion'&&config.responseTargetMs!==3000&&config.conversationalAi?.ready&&typeof transport.composeReply==='function'&&store.approvedReplyStillValid(o)&&store.priceReplyStillValid(o)){
      try{
        const composed=await transport.composeReply(o,text,store);
        if(!replyCandidates(text).includes(composed))throw Error('AI_REPLY_NOT_APPROVED');
        if(composed!==text)store.tx(()=>{
          const current=store.conversation(o.phone);
          if(current?.hold||current?.revision!==o.revision)return;
          const body=store.seal(composed);
          if(!store.db.prepare("UPDATE outbox SET body=? WHERE id=? AND state='READY'").run(body,o.id).changes)return;
          const ref=store.priceReplyReference(o);
          if(ref)store.savePriceReplyReference(o.id,{...ref,finalText:composed});
          store.audit('AI_APPROVED_WORDING_SELECTED',o.id,{originalText:text,finalText:composed,caseId:o.case_id,priceCop:ref?.priceCop||null,claimsGenerated:false});
          o.body=body;text=composed;
        });
      }catch{store.audit('AI_WORDING_FALLBACK',o.id,{deterministicReplyRetained:true});}
    }
    // Native attention, staff ingestion, current prices and answer references
    // are checked after every model await and before the delivery reservation.
    if(!o.internal&&config.historyCheckRequired&&typeof transport.currentAttention==='function'){
      try{
        const attention=await transport.currentAttention(o.phone);
        if(!attention.complete)throw new Error('ATTENTION_COVERAGE_UNVERIFIED');
        const unknown=attention.sources.find(source=>!store.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(source.id,o.phone,source.line));
        if(unknown){
          store.hold(o.phone,unknown.id,true);
          store.audit('NATIVE_PRIOR_ATTENTION_BLOCKED_REPLY',unknown.id,{phone:o.phone,line:unknown.line,at:unknown.at,outboxId:o.id,authorUnverified:true,firstBotEvidencePreserved:true});suppressed++;continue;
        }
        store.audit('NATIVE_ATTENTION_CHECKED',o.id,{through:attention.through,checks:attention.checks,knownOutgoing:attention.sources.length,coverage:attention.coverage??operationalCoverage(config)});
      }catch{
        store.db.prepare("UPDATE outbox SET state='ATTENTION_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);
        store.hold(o.phone,'attention-review:'+o.id,true);store.audit('NATIVE_ATTENTION_UNVERIFIED',o.id,{attemptedSend:false});suppressed++;continue;
      }
    }
    const staffPending=store.db.prepare("SELECT id FROM events WHERE phone=? AND from_me=1 AND state='PENDING'").get(o.phone);
    if(staffPending)continue;
    if(!o.internal&&o.id.startsWith('inactivity:')){
      try{if(!await inactivityDeliveryValid(store,config,transport,o))throw Error('INACTIVITY_STATE_CHANGED');}
      catch{store.db.prepare("UPDATE outbox SET state='INACTIVITY_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);store.audit('INACTIVITY_BEFORE_SEND_REVIEW',o.id,{attemptedSend:false});suppressed++;continue;}
    }
    const conv=store.conversation(o.phone);
    if(!o.internal&&(conv?.hold||conv?.revision!==o.revision)){
      store.db.prepare("UPDATE outbox SET state='SUPPRESSED_HUMAN',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);suppressed++;continue;
    }
    if(!o.internal&&!store.approvedReplyStillValid(o)){
      store.db.prepare("UPDATE outbox SET state='APPROVED_ANSWER_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);
      store.audit('APPROVED_ANSWER_RECHECK_FAILED',o.id,{attemptedSend:false});suppressed++;continue;
    }
    if(!o.internal&&store.priceReplyReference(o)){
      try{
        if(!store.priceReplyStillValid(o))throw Error('PRICE_REVIEW');
        const ref=store.priceReplyReference(o),entry=selectPrice(ref.context,store.approvedPriceCatalogs(),ref.entryId).entry;
        await verifyPriceSource(entry,transport);
        // Source verification awaits the provider. Staff may intervene during
        // that read; recheck the persisted hold and revision afterwards.
        const latest=store.conversation(o.phone);
        if(latest.hold||latest.revision!==o.revision)continue;
      }catch{
        store.db.prepare("UPDATE outbox SET state='PRICE_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);store.audit('PRICE_SOURCE_RECHECK_FAILED',o.id,{attemptedSend:false});suppressed++;continue;
      }
    }
    if(lineScope&&(o.created<Date.parse(lineScope.authorizedAt)||!operationalLineAllowed(config,o.line)||
      (!o.internal&&(typeof store.hasSourcesOutsideLine!=='function'||store.hasSourcesOutsideLine(o.phone,o.line))))){
      if(store.db.prepare("UPDATE outbox SET state='OPERATIONAL_SCOPE_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes){
        store.audit('OPERATIONAL_SCOPE_CHANGED_BEFORE_SEND',o.id,{line:o.line,coverage:operationalCoverage(config),attemptedSend:false,migrated:false});suppressed++;
      }
      continue;
    }
    if(!store.db.prepare("UPDATE outbox SET state='SENDING',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes)continue;
    try {
      const mid=await transport.send(o,text);
      store.tx(()=>{
        const sentAt=Date.now();
        store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED',updated=? WHERE id=?").run(mid,sentAt,o.id);
        store.recordFirstBotReply(o,mid,config.bot,sentAt);
        if(config.company==='fumigacion')recordResponseTiming(store,o,sentAt);
      });accepted++;
    } catch {store.db.prepare("UPDATE outbox SET state='UNCERTAIN',updated=? WHERE id=?").run(Date.now(),o.id);uncertain++;}
  }
  return {accepted,suppressed,uncertain};
}
