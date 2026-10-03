import { SANDRA, DIEGO, publicTextSafe, normalize } from './config.mjs';

export class Transport {
  constructor(config, fetcher=fetch){this.config=config;this.fetcher=fetcher;}
  async request(line,path,body) {
    if(!this.config.lines.includes(line)||!line.apiKey)throw new Error('INSTANCE_ACCESS_REQUIRED');
    const response=await this.fetcher(this.config.provider+path,{method:body?'POST':'GET',headers:{apikey:line.apiKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('CHANNEL_HTTP_'+response.status); return response.json();
  }
  async verifyLine(phone) {
    const line=this.config.lines.find(l=>l.phone===phone);if(!line)throw new Error('LINE_OUTSIDE_COMPANY');
    const data=await this.request(line,'/instance/fetchInstances?instanceName='+encodeURIComponent(line.instance));
    const scope=Array.isArray(data)?data:[data];
    const own=scope.filter(x=>(x.name??x.instance?.instanceName??x.instanceName)===line.instance);
    if(scope.length!==1||own.length!==1||own[0].ownerJid?.split('@')[0]!==phone)throw new Error('CHANNEL_OWNER_MISMATCH');
    if(String(own[0].connectionStatus).toLowerCase()!=='open')throw new Error('CHANNEL_NOT_OPEN');
    return {phone,instance:line.instance,open:true,ownerVerified:true,checkedAt:new Date().toISOString()};
  }
  async send(row,text) {
    if(!row.internal&&!this.config.enabled)throw new Error('CUSTOMER_GATE_CLOSED');
    if(row.internal&&![SANDRA,DIEGO].includes(row.phone))throw new Error('INTERNAL_RECIPIENT_MISMATCH');
    if(!row.internal&&!publicTextSafe(text))throw new Error('EXTERNAL_TEXT_REJECTED');
    if(!/^57\d{10}$/.test(row.phone))throw new Error('GROUP_OR_INVALID_RECIPIENT');
    const line=this.config.lines.find(l=>l.phone===row.line);if(!line)throw new Error('LINE_OUTSIDE_COMPANY');
    const result=await this.request(line,'/message/sendText/'+encodeURIComponent(line.instance),{number:row.phone,text,linkPreview:false});
    if(!result.key?.id)throw new Error('SEND_WITHOUT_RECEIPT');return result.key.id;
  }
  async priorHistory(phone) {
    const c=this.config;
    if(!/^57\d{10}$/.test(phone)||!Number.isFinite(c.activatedAt))throw new Error('HISTORY_SCOPE_REQUIRED');
    const checks=[];
    for(const line of c.lines){
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
    return {cutoff:c.activatedAt,checkedAt:Date.now(),guardVersion:'canonical-and-alternate-phone-v2',priorOutgoing:checks.some(x=>x.total>0),checks,scope:'own-two-lines-and-explicit-phone-alternatives; metadata-only; historical-author-unattributed'};
  }
  async currentAttention(phone) {
    const c=this.config;if(!/^57\d{10}$/.test(phone)||!Number.isFinite(c.activatedAt))throw new Error('ATTENTION_SCOPE_REQUIRED');
    const through=Date.now(),sources=new Map(),checks=[];
    for(const line of c.lines){
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
            if(written||media)sources.set(line.phone+':'+key.id,{id:key.id,line:line.phone,at,kind:media?'media':'text'});
          }
          if(read===expectedTotal)break;
          if(!result.records.length||page===2||read>expectedTotal)throw new Error('ATTENTION_COVERAGE_UNVERIFIED');
        }
        checks.push({line:line.phone,addressField,total:expectedTotal,read});
      }
    }
    return {sources:[...sources.values()],checks,through,complete:true,scope:'own-two-lines-and-explicit-phone-alternatives; written-or-media-outgoing'};
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
  async understand(event,context,knowledge) {
    const c=this.config;if(!c.aiUrl||!c.aiToken||event.kind!=='text')return {};
    const url=new URL(c.aiUrl);if(url.protocol!=='https:'||url.username||url.password)throw new Error('AI_HTTPS_REQUIRED');
    const r=await this.fetcher(url,{method:'POST',headers:{Authorization:'Bearer '+c.aiToken,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(25000),body:JSON.stringify({company:c.name,task:'extract-literal-intake-slots-only',event:{id:event.id,text:event.text},context,knowledge})});
    if(!r.ok)throw new Error('AI_UNAVAILABLE'); const result=await r.json();
    if(result.eventId!==event.id||result.company!==c.name)throw new Error('AI_CONTEXT_MISMATCH');return result;
  }
}

export async function drain(store,config,transport,engine) {
  if(!config.enabled&&!config.chiefOnly)return {enabled:false};
  const pending=store.db.prepare("SELECT body FROM events WHERE state='PENDING' AND (?=1 OR phone IN (?,?)) ORDER BY from_me DESC,at,rowid LIMIT 30").all(Number(config.enabled),SANDRA,DIEGO);
  for(const row of pending) {
    const e=store.open(row.body); let analysis={};
    if(config.historyCheckRequired&&!e.fromMe&&![SANDRA,DIEGO].includes(e.phone)){
      const checked=store.priorHistory(e.phone);
      if(checked?.cutoff!==config.activatedAt||(transport instanceof Transport&&checked.guardVersion!=='canonical-and-alternate-phone-v2')){
        try{store.savePriorHistory(e.phone,await transport.priorHistory(e.phone),e.id);}
        catch{store.audit('PRIOR_HISTORY_UNVERIFIED',e.id);store.db.prepare("UPDATE events SET state='HISTORY_REVIEW' WHERE id=? AND state='PENDING'").run(e.id);continue;}
      }
    }
    if(!e.fromMe&&![SANDRA,DIEGO].includes(e.phone)&&!store.conversation(e.phone)?.hold){
      // Customer history remains in its company. Observations are explicitly untrusted reference, never policy.
      const knowledge=store.db.prepare('SELECT body FROM knowledge ORDER BY imported DESC LIMIT 10').all().map(k=>store.open(k.body));
      const newCase=/\b(?:otra solicitud|nuevo servicio|otro servicio|otro equipo)\b/.test(normalize(e.text));
      const caseAnswers=store.db.prepare("SELECT body,answer,source_id,answer_at,valid_until FROM questions WHERE phone=? AND case_id=? AND state='ANSWERED' AND valid_until>?").all(e.phone,newCase?'':store.conversation(e.phone)?.state.caseId||'',Date.now()).map(q=>({question:store.open(q.body),answer:store.open(q.answer),source:q.source_id,at:q.answer_at,validUntil:q.valid_until,scope:'same-company-and-case-only; recheck before scheduling'}));
      const conversationHistory=store.conversationContext(e.phone,e.at,20,e.id);
      store.audit('CONVERSATION_CONTEXT_CHECKED',e.id,{caseId:conversationHistory.caseId,turns:conversationHistory.turns.length,storedCoverageComplete:conversationHistory.completeStoredHistory,fullWhatsAppHistoryRead:false,originalMediaRead:false});
      try{analysis=await transport.understand(e,{...(newCase?{slots:{},asked:[]}:store.conversation(e.phone)?.state),requestedNewCase:newCase,caseAnswers,conversationHistory},knowledge);}catch{store.audit('AI_UNAVAILABLE',e.id);}
    }
    await engine.process(e,analysis);
  }
  let accepted=0,suppressed=0,uncertain=0;
  const out=store.db.prepare("SELECT * FROM outbox WHERE state='READY' AND (?=1 OR (internal=1 AND phone IN (?,?))) ORDER BY created,rowid LIMIT 20").all(Number(config.enabled),SANDRA,DIEGO);
  for(const o of out) {
    if(!config.enabled&&!(config.chiefOnly&&o.internal&&[SANDRA,DIEGO].includes(o.phone)))continue;
    if(o.created<Date.now()-600000){store.db.prepare("UPDATE outbox SET state='EXPIRED_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);suppressed++;continue;}
    // Reject before any delivery attempt; this is a review, never an uncertain send.
    const text=store.open(o.body);
    if(!o.internal&&!publicTextSafe(text)){
      store.db.prepare("UPDATE outbox SET state='COMMUNICATION_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);
      store.hold(o.phone,'communication-review');store.audit('EXTERNAL_TEXT_REJECTED',o.id);suppressed++;continue;
    }
    // Revalidate channel identity before each attempt. A disconnected channel leaves READY without attempting delivery.
    try{await transport.verifyLine(o.line);}catch{store.audit('CHANNEL_CHECK_FAILED',o.id);continue;}
    if(!o.internal&&config.historyCheckRequired&&typeof transport.currentAttention==='function'){
      try{
        const attention=await transport.currentAttention(o.phone);
        if(!attention.complete)throw new Error('ATTENTION_COVERAGE_UNVERIFIED');
        const unknown=attention.sources.find(source=>!store.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(source.id,o.phone,source.line));
        if(unknown){
          store.hold(o.phone,unknown.id,true);
          store.audit('NATIVE_PRIOR_ATTENTION_BLOCKED_REPLY',unknown.id,{phone:o.phone,line:unknown.line,at:unknown.at,outboxId:o.id,authorUnverified:true,firstBotEvidencePreserved:true});suppressed++;continue;
        }
        store.audit('NATIVE_ATTENTION_CHECKED',o.id,{through:attention.through,checks:attention.checks,knownOutgoing:attention.sources.length});
      }catch{
        store.db.prepare("UPDATE outbox SET state='ATTENTION_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);
        store.hold(o.phone,'attention-review:'+o.id,true);store.audit('NATIVE_ATTENTION_UNVERIFIED',o.id,{attemptedSend:false});suppressed++;continue;
      }
    }
    const staffPending=store.db.prepare("SELECT id FROM events WHERE phone=? AND from_me=1 AND state='PENDING'").get(o.phone);
    if(staffPending)continue;
    const conv=store.conversation(o.phone);
    if(!o.internal&&(conv?.hold||conv?.revision!==o.revision)){
      store.db.prepare("UPDATE outbox SET state='SUPPRESSED_HUMAN',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);suppressed++;continue;
    }
    if(!store.db.prepare("UPDATE outbox SET state='SENDING',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes)continue;
    try {
      const mid=await transport.send(o,text);
      store.tx(()=>{
        const sentAt=Date.now();
        store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED',updated=? WHERE id=?").run(mid,sentAt,o.id);
        store.recordFirstBotReply(o,mid,config.bot,sentAt);
      });accepted++;
    } catch {store.db.prepare("UPDATE outbox SET state='UNCERTAIN',updated=? WHERE id=?").run(Date.now(),o.id);uncertain++;}
  }
  return {processed:pending.length,accepted,suppressed,uncertain};
}
