import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {validateApprovedAnswers,selectCommonAnswer} from './faq.mjs';
import {validatePriceCatalog,selectPrice} from './prices.mjs';
import {supersededBusinessPriceSchedule} from './business-prices.mjs';

export class Store {
  constructor(path, company, key) {
    if(path!==':memory:') mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.company=company; this.key=key; this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS scope(company TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,phone TEXT,at INTEGER,line TEXT,from_me INTEGER,body TEXT,state TEXT DEFAULT 'PENDING',revision INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS event_sources(event_id TEXT,line TEXT,PRIMARY KEY(event_id,line),FOREIGN KEY(event_id) REFERENCES events(id));
      CREATE TABLE IF NOT EXISTS conversations(phone TEXT PRIMARY KEY,hold INTEGER DEFAULT 0,revision INTEGER DEFAULT 0,at INTEGER DEFAULT 0,line TEXT,body TEXT);
      CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,phone TEXT,line TEXT,body TEXT,internal INTEGER,revision INTEGER,state TEXT DEFAULT 'READY',mid TEXT,created INTEGER,updated INTEGER);
      CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,phone TEXT,case_id TEXT,topic TEXT,conditions_hash TEXT,recipient TEXT,body TEXT,answer TEXT,source_id TEXT,answer_at INTEGER,valid_until INTEGER,state TEXT DEFAULT 'PENDING',outbox_id TEXT UNIQUE);
      CREATE UNIQUE INDEX IF NOT EXISTS question_once ON questions(case_id,topic,conditions_hash,recipient);
      CREATE TABLE IF NOT EXISTS question_routes(question_id TEXT,recipient TEXT,line TEXT,outbox_id TEXT UNIQUE,PRIMARY KEY(question_id,recipient),FOREIGN KEY(question_id) REFERENCES questions(id),FOREIGN KEY(outbox_id) REFERENCES outbox(id));
      CREATE TABLE IF NOT EXISTS knowledge(id TEXT PRIMARY KEY,kind TEXT,body TEXT,hash TEXT,imported INTEGER);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at INTEGER,action TEXT,source TEXT,detail TEXT);
      CREATE TABLE IF NOT EXISTS case_authorship(case_id TEXT PRIMARY KEY,phone TEXT,first_outbox TEXT UNIQUE,state TEXT,body TEXT);
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);`);
    if(!this.db.prepare('PRAGMA table_info(events)').all().some(c=>c.name==='revision'))this.db.exec('ALTER TABLE events ADD COLUMN revision INTEGER DEFAULT 0');
    if(!this.db.prepare('PRAGMA table_info(outbox)').all().some(c=>c.name==='case_id'))this.db.exec('ALTER TABLE outbox ADD COLUMN case_id TEXT');
    if(!this.db.prepare('PRAGMA table_info(events)').all().some(c=>c.name==='received_at'))this.db.exec('ALTER TABLE events ADD COLUMN received_at INTEGER');
    const scope=this.db.prepare('SELECT company FROM scope').get();
    if(scope&&scope.company!==company)throw new Error('DATABASE_SCOPE_MISMATCH');
    this.db.prepare('INSERT OR IGNORE INTO scope VALUES(?)').run(company);
    const marker=this.db.prepare("SELECT value FROM meta WHERE key='key_check'").get();
    if(marker&&this.open(marker.value)!==company)throw new Error('KEY_SCOPE_MISMATCH');
    if(!marker)this.db.prepare("INSERT INTO meta VALUES('key_check',?)").run(this.seal(company));
    this.db.prepare("UPDATE outbox SET state='UNCERTAIN',updated=? WHERE state='SENDING'").run(Date.now());
  }
  seal(value) {
    const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',this.key,iv);
    const content=Buffer.concat([cipher.update(JSON.stringify({company:this.company,value}),'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),content]).toString('base64');
  }
  open(value) {
    const b=Buffer.from(value,'base64'); const cipher=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));
    cipher.setAuthTag(b.subarray(12,28)); const data=JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());
    if(data.company!==this.company)throw new Error('ENCRYPTED_SCOPE_MISMATCH'); return data.value;
  }
  tx(fn) { this.db.exec('BEGIN IMMEDIATE');try {const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;} }
  audit(action,source,detail={}) {this.db.prepare('INSERT INTO audit(at,action,source,detail) VALUES(?,?,?,?)').run(Date.now(),action,source,this.seal(detail));}
  enqueue(e) {
    return this.tx(()=>{
      const existing=this.db.prepare('SELECT body FROM events WHERE id=?').get(e.id);
      if(existing){const before=this.open(existing.body);if(JSON.stringify({...before,line:null})!==JSON.stringify({...e,line:null}))throw new Error('EVENT_ID_CONFLICT');this.db.prepare('INSERT OR IGNORE INTO event_sources VALUES(?,?)').run(e.id,e.line);return {duplicate:true};}
      this.db.prepare('INSERT OR IGNORE INTO conversations(phone,line,body) VALUES(?,?,?)').run(e.phone,e.line,this.seal({slots:{},asked:[],lastText:''}));
      if(!e.fromMe)this.db.prepare('UPDATE conversations SET revision=revision+CASE WHEN ?>=at THEN 1 ELSE 0 END,at=MAX(at,?),line=CASE WHEN ?>=at THEN ? ELSE line END WHERE phone=?').run(e.at,e.at,e.at,e.line,e.phone);
      const revision=this.conversation(e.phone).revision;
      this.db.prepare('INSERT INTO events(id,phone,at,line,from_me,body,revision,received_at) VALUES(?,?,?,?,?,?,?,?)').run(e.id,e.phone,e.at,e.line,Number(e.fromMe),this.seal(e),revision,Date.now());
      this.db.prepare('INSERT INTO event_sources VALUES(?,?)').run(e.id,e.line);
      if(e.fromMe&&!this.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(e.id,e.phone,e.line)&&!this.db.prepare("SELECT 1 FROM outbox WHERE phone=? AND state='SENDING'").get(e.phone)){
        // Freeze the customer's prepared replies as soon as authenticated staff
        // activity is received, before the next worker cycle. Exact bot echoes
        // and the short unresolved send-receipt window are handled separately.
        this.noteStaffIntervention(e);this.hold(e.phone,e.id,true);
        this.audit('STAFF_TAKEOVER_AT_INGESTION',e.id,{line:e.line});
      }
      return {duplicate:false};
    });
  }
  conversation(phone) {
    const r=this.db.prepare('SELECT * FROM conversations WHERE phone=?').get(phone);return r?{...r,state:this.open(r.body)}:null;
  }
  saveConversation(phone,state) {this.db.prepare('UPDATE conversations SET body=? WHERE phone=?').run(this.seal(state),phone);}
  priorHistory(phone) {
    const row=this.db.prepare('SELECT value FROM meta WHERE key=?').get('prior-history:'+phone);
    return row?this.open(row.value):null;
  }
  savePriorHistory(phone,check,source) {
    this.tx(()=>{
      this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('prior-history:'+phone,this.seal(check));
      // Historical outgoing author is not assumed to be a bot or staff member.
      // Preserve attention for review; only a subsequent explicit chief release lifts it.
      const release=this.db.prepare('SELECT value FROM meta WHERE key=?').get('chief-release:'+phone);
      const releasedAfterCutoff=release&&this.open(release.value).at>=check.cutoff;
      if(check.priorOutgoing&&!releasedAfterCutoff)this.hold(phone,source,true,false);
      this.audit('PRIOR_HISTORY_CHECKED',source,{phone,...check});
    });
  }
  hold(phone,source,value=true,invalidatePending=true) {
    this.db.prepare('UPDATE conversations SET hold=?,revision=revision+? WHERE phone=?').run(Number(value),Number(invalidatePending),phone);
    if(value)this.db.prepare("UPDATE outbox SET state='SUPPRESSED_HUMAN',updated=? WHERE phone=? AND internal=0 AND state='READY'").run(Date.now(),phone);
    if(!value){
      this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('chief-release:'+phone,this.seal({source,at:Date.now()}));
      const conv=this.conversation(phone);if(conv?.state.awaitingHumanReview)this.saveConversation(phone,{...conv.state,awaitingHumanReview:false});
    }
    this.audit(value?'HUMAN_TAKEOVER':'EXPLICIT_RELEASE',source,{phone});
  }
  queue(id,phone,line,text,internal,revision,caseId=null) {
    const r=this.db.prepare('SELECT body FROM outbox WHERE id=?').get(id);
    if(r){if(this.open(r.body)!==text)throw new Error('OUTBOX_ID_CONFLICT');return false;}
    this.db.prepare('INSERT INTO outbox(id,phone,line,body,internal,revision,created,updated,case_id) VALUES(?,?,?,?,?,?,?,?,?)').run(id,phone,line,this.seal(text),Number(internal),revision,Date.now(),Date.now(),internal?null:caseId);return true;
  }
  caseAuthorship(caseId) {
    const row=this.db.prepare('SELECT state,body FROM case_authorship WHERE case_id=?').get(caseId);
    return row?{state:row.state,...this.open(row.body)}:null;
  }
  recordFirstBotReply(row,mid,bot,sentAt) {
    if(row.internal||!row.case_id||this.caseAuthorship(row.case_id))return;
    // An earlier reply from the previous software remains the actual first source.
    // Do not relabel a continuation as a first reply after an upgrade.
    const firstSource=row.case_id.startsWith(this.company+':')?row.case_id.slice(this.company.length+1):null;
    const legacy=firstSource&&this.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND internal=0 AND case_id IS NULL AND mid IS NOT NULL AND state IN ('ACCEPTED','DELIVERED','READ')").get(firstSource+':reply',row.phone);
    if(legacy){
      const record={company:this.company,caseId:row.case_id,phone:row.phone,bot,firstOutboxId:legacy.id,firstProviderMessageId:legacy.mid,line:legacy.line,sentAt:null,recordedAt:legacy.created,firstReplyEligible:false,priorOutgoing:null,priorStaffSource:null,priorReadByStaff:'UNVERIFIED',attentionOrderingReview:'LEGACY_FIRST_REPLY_ORDER_UNVERIFIED',deliveryState:legacy.state,creatorCreditWritten:false,programServiceId:null,serviceCompleted:false};
      this.db.prepare('INSERT OR IGNORE INTO case_authorship VALUES(?,?,?,?,?)').run(row.case_id,row.phone,legacy.id,'FIRST_REPLY_REVIEW',this.seal(record));
      this.audit('LEGACY_FIRST_BOT_REPLY_PRESERVED',legacy.id,{caseId:row.case_id,continuationOutboxId:row.id,deliveryState:legacy.state,creatorCreditWritten:false});
      return;
    }
    const history=this.priorHistory(row.phone);
    const priorStaff=this.db.prepare("SELECT e.id FROM events e WHERE e.phone=? AND e.from_me=1 AND e.at<=? AND NOT EXISTS(SELECT 1 FROM outbox o WHERE o.mid=e.id AND o.phone=e.phone AND o.line=e.line) LIMIT 1").get(row.phone,sentAt);
    // Absence of an outgoing message does not identify who read a chat.
    // Preserve actual first-reply evidence; never manufacture program creator credit.
    const firstReplyEligible=Boolean(history&&history.priorOutgoing===false&&!priorStaff);
    const record={company:this.company,caseId:row.case_id,phone:row.phone,bot,firstOutboxId:row.id,firstProviderMessageId:mid,line:row.line,sentAt,firstReplyEligible,priorOutgoing:history?.priorOutgoing??null,priorStaffSource:priorStaff?.id??null,priorReadByStaff:'UNVERIFIED',creatorCreditWritten:false,programServiceId:null,serviceCompleted:false};
    this.db.prepare('INSERT OR IGNORE INTO case_authorship VALUES(?,?,?,?,?)').run(row.case_id,row.phone,row.id,'DELIVERY_PENDING',this.seal(record));
    this.audit('FIRST_BOT_REPLY_RECORDED',row.id,{caseId:row.case_id,firstReplyEligible,deliveryVerified:false,creatorCreditWritten:false});
  }
  noteStaffIntervention(e) {
    for(const row of this.db.prepare("SELECT case_id FROM case_authorship WHERE phone=? AND state IN ('DELIVERY_PENDING','BOT_FIRST_REPLY_VERIFIED')").all(e.phone)){
      const attribution=this.caseAuthorship(row.case_id);
      if(e.at>attribution.sentAt)continue;
      const {state,...record}=attribution;
      record.firstReplyEligible=false;record.priorStaffSource=e.id;
      record.attentionOrderingReview=e.at+1000<=record.sentAt?'EARLIER_STAFF_SOURCE_RECEIVED_LATE':'SAME_SECOND_ORDER_UNVERIFIED';
      this.db.prepare('UPDATE case_authorship SET state=?,body=? WHERE case_id=?').run('FIRST_REPLY_REVIEW',this.seal(record),row.case_id);
      this.audit('FIRST_REPLY_ORDER_REVIEW',e.id,{caseId:row.case_id,firstBotOutboxPreserved:record.firstOutboxId,reason:record.attentionOrderingReview,creatorCreditWritten:false});
    }
  }
  delivery(mid,line,state) {
    return this.tx(()=>{
      const row=this.db.prepare('SELECT * FROM outbox WHERE mid=? AND line=?').get(mid,line);
      if(!row||!['DELIVERED','READ'].includes(state)||!['SENDING','ACCEPTED','DELIVERED','READ'].includes(row.state))return 0;
      if(row.state==='READ'||row.state===state)return 0;
      this.db.prepare('UPDATE outbox SET state=?,updated=? WHERE id=?').run(state,Date.now(),row.id);
      const attribution=row.case_id&&this.caseAuthorship(row.case_id);
      if(attribution&&attribution.firstOutboxId===row.id&&attribution.state==='DELIVERY_PENDING'){
        const {state:oldState,...record}=attribution;
        record.deliveryVerifiedAt=Date.now();record.deliveryState=state;
        this.db.prepare('UPDATE case_authorship SET state=?,body=? WHERE case_id=?').run(record.firstReplyEligible?'BOT_FIRST_REPLY_VERIFIED':'FIRST_REPLY_REVIEW',this.seal(record),row.case_id);
        this.audit('FIRST_BOT_REPLY_DELIVERY_VERIFIED',row.id,{caseId:row.case_id,firstReplyEligible:record.firstReplyEligible,priorReadByStaff:'UNVERIFIED',creatorCreditWritten:false});
      }
      return 1;
    });
  }
  conversationContext(phone,at,limit=20,sourceId=null) {
    if(!Number.isSafeInteger(limit)||limit<1||limit>40)throw new Error('CONTEXT_LIMIT_REQUIRED');
    const conv=this.conversation(phone);
    const source=sourceId&&this.db.prepare('SELECT rowid,received_at FROM events WHERE id=? AND phone=?').get(sourceId,phone);
    if(sourceId&&!source)throw new Error('CONTEXT_SOURCE_SCOPE_REQUIRED');
    const throughRow=source?.rowid??Number.MAX_SAFE_INTEGER,throughTime=source?.received_at??at;
    const events=this.db.prepare('SELECT id,line,at,from_me,body,state FROM events WHERE phone=? AND at<=? AND rowid<=? ORDER BY at DESC,rowid DESC LIMIT ?').all(phone,at,throughRow,limit);
    const replies=this.db.prepare("SELECT id,line,body,mid,state,created,case_id FROM outbox WHERE phone=? AND internal=0 AND created<=? AND state IN ('ACCEPTED','DELIVERED','READ') ORDER BY created DESC,rowid DESC LIMIT ?").all(phone,throughTime,limit);
    const own=new Set(replies.filter(r=>r.mid).map(r=>r.line+':'+r.mid));
    const turns=events.filter(e=>!(e.from_me&&own.has(e.line+':'+e.id))).map(e=>({sourceId:e.id,line:e.line,at:e.at,role:e.from_me?'outbound-author-unverified':'customer',kind:this.open(e.body).kind,text:this.open(e.body).text,processingState:e.state}));
    turns.push(...replies.map(r=>({sourceId:r.id,providerMessageId:r.mid,line:r.line,at:r.created,role:'bot',text:this.open(r.body),delivery:r.state,caseId:r.case_id??null})));
    turns.sort((a,b)=>a.at-b.at||a.sourceId.localeCompare(b.sourceId));
    const totalEvents=this.db.prepare('SELECT COUNT(*) n FROM events WHERE phone=? AND at<=? AND rowid<=?').get(phone,at,throughRow).n;
    const totalReplies=this.db.prepare("SELECT COUNT(*) n FROM outbox WHERE phone=? AND internal=0 AND created<=? AND state IN ('ACCEPTED','DELIVERED','READ')").get(phone,throughTime).n;
    return {company:this.company,phone,caseId:conv?.state.caseId??null,scope:'same-company-contact; previous-case-boundaries-may-be-unverified',turns,completeStoredHistory:totalEvents<=limit&&totalReplies<=limit,fullWhatsAppHistoryRead:false,mediaOriginalsIncluded:false,referencesAreUntrusted:true};
  }
  customerTurnBatch(phone,sourceId,previousSourceId){
    const current=this.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND from_me=0').get(sourceId,phone);
    if(!current)throw new Error('CUSTOMER_SOURCE_SCOPE_REQUIRED');
    const previous=previousSourceId&&this.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND from_me=0').get(previousSourceId,phone);
    if(!previous||previous.rowid>=current.rowid)return this.db.prepare("SELECT body FROM events WHERE phone=? AND from_me=0 AND rowid<=? AND at BETWEEN ? AND ? AND state IN ('PENDING','OBSERVED_SUPERSEDED') ORDER BY at,rowid LIMIT 40").all(phone,current.rowid,current.at-600000,current.at).map(r=>this.open(r.body));
    return this.db.prepare("SELECT body FROM events WHERE phone=? AND from_me=0 AND rowid>? AND rowid<=? AND at<=? AND state IN ('PENDING','OBSERVED_SUPERSEDED') ORDER BY at,rowid LIMIT 40").all(phone,previous.rowid,current.rowid,current.at).map(r=>this.open(r.body));
  }
  question({phone,line,caseId,topic,conditions,recipient,text,source}) {
    if(topic.startsWith('missing-intake:')||['cotizacion-verificada','special-quotation','disponibilidad-y-cotizacion','disponibilidad-y-tecnico','service-documents','service-followup','requested-technician-contact','payment-instructions','existing-quotation'].includes(topic)){
      // Further details are retained in the conversation. A pending question for
      // the same case must not be sent again because its details or route changed.
      const pending=this.db.prepare("SELECT id,state FROM questions WHERE phone=? AND case_id=? AND topic=? AND state IN ('PENDING','ANSWER_REVIEW') ORDER BY rowid LIMIT 1").get(phone,caseId,topic);
      if(pending){this.audit('PENDING_CASE_QUESTION_REUSED',source,{caseId,topic,questionId:pending.id,newOutboundCreated:false});return {...pending,created:false,valid:false};}
    }
    const hash=createHash('sha256').update(JSON.stringify(conditions)).digest('hex');
    const id=createHash('sha256').update(JSON.stringify([this.company,caseId,topic,hash,recipient])).digest('hex');
    const old=this.db.prepare('SELECT * FROM questions WHERE id=?').get(id);
    if(old)return {id,state:old.state,answer:old.answer&&this.open(old.answer),sourceId:old.source_id,valid:old.state==='ANSWERED'&&(!old.valid_until||old.valid_until>Date.now()),created:false};
    const alreadyPending=this.db.prepare("SELECT id,state FROM questions WHERE phone=? AND case_id=? AND topic=? AND conditions_hash=? AND state IN ('PENDING','ANSWER_REVIEW')").get(phone,caseId,topic,hash);
    if(alreadyPending)return {...alreadyPending,created:false,valid:false};
    if(topic.startsWith('missing-intake:')){
      const field=topic.slice('missing-intake:'.length);
      if(!['service','site','size','mattresses','detail','location','preference'].includes(field))throw new Error('INTAKE_FIELD_REQUIRED');
      const pending=this.db.prepare("SELECT q.*,o.state delivery FROM questions q JOIN outbox o ON o.id=q.outbox_id WHERE q.case_id=? AND q.phone=? AND q.recipient=? AND q.state IN ('PENDING','ANSWER_REVIEW') AND o.state IN ('READY','SENDING','UNCERTAIN','ACCEPTED','DELIVERED','READ')").all(caseId,phone,recipient);
      const legacy=pending.find(q=>q.topic===topic||(q.topic.startsWith('revision:')&&this.open(q.body).text.includes('contacto terminado en '+phone.slice(-4)+'. Falta '+field+'. La pregunta ya se hizo;')));
      if(legacy)return {id:legacy.id,state:legacy.state,created:false,valid:false};
    }
    const legacy=this.db.prepare("SELECT id,state FROM questions WHERE case_id=? AND state='LEGACY_PENDING'").get(caseId);
    if(legacy)return {...legacy,created:false,valid:false};
    const outboxId='question:'+id;
    this.db.prepare('INSERT INTO questions(id,phone,case_id,topic,conditions_hash,recipient,body,outbox_id) VALUES(?,?,?,?,?,?,?,?)').run(id,phone,caseId,topic,hash,recipient,this.seal({text,conditions,source}),outboxId);
    this.queue(outboxId,recipient,line,text,true,0); this.audit('INTERNAL_QUESTION',source,{id,caseId,topic});
    return {id,state:'PENDING',created:true};
  }
  questionToRecipients({recipients,...request}) {
    if(!Array.isArray(recipients)||!recipients.length||recipients.length>2||new Set(recipients).size!==recipients.length||recipients.some(p=>!/^57\d{10}$/.test(p)))throw Error('QUESTION_RECIPIENTS_REQUIRED');
    // question() checks existing case/topic pending records before considering the
    // new route. Only a question first created now gets a second delivery.
    const result=this.question({...request,recipient:recipients[0]});
    if(!result.created)return result;
    for(const recipient of recipients.slice(1)){
      const outboxId='question:'+result.id+':'+recipient;
      this.queue(outboxId,recipient,request.line,request.text,true,0);
      this.db.prepare('INSERT INTO question_routes VALUES(?,?,?,?)').run(result.id,recipient,request.line,outboxId);
    }
    this.audit('OPERATOR_QUESTION_ROUTED',request.source,{question:result.id,caseId:request.caseId,topic:request.topic,recipients,existingPendingResent:false});
    return result;
  }
  importPendingQuestions(document) {
    if(document.company!==this.company||!Array.isArray(document.entries)||!document.source)throw new Error('LEGACY_SCOPE_REQUIRED');
    let imported=0;
    for(const e of document.entries){
      if(!e.id||!e.caseId||!e.recipient||!e.topic||!e.askedAt||e.answered===true)throw new Error('LEGACY_PENDING_REQUIRED');
      imported+=this.db.prepare("INSERT OR IGNORE INTO questions(id,phone,case_id,topic,conditions_hash,recipient,body,state,outbox_id) VALUES(?,'',?,?,?, ?,?,'LEGACY_PENDING',NULL)")
        .run('legacy:'+e.id,e.caseId,e.topic,'legacy',e.recipient,this.seal({...e,source:document.source})).changes;
    }
    this.audit('LEGACY_PENDING_IMPORTED',document.source,{count:imported,outboundCreated:0});return {imported,outboundCreated:0};
  }
  importKnowledge(document) {
    if(document.company!==this.company)throw new Error('KNOWLEDGE_SCOPE_MISMATCH');
    if(document.kind==='approved_customer_answers')validateApprovedAnswers(document,this.company);
    if(['approved_price_catalog','approved_price_schedule'].includes(document.kind))validatePriceCatalog(document,this.company);
    if(!['instructions','historical_observations','reference','approved_customer_answers','approved_price_catalog','approved_price_schedule'].includes(document.kind)||!document.source||!document.at||!Array.isArray(document.entries))throw new Error('KNOWLEDGE_SOURCE_REQUIRED');
    // Importing observations never converts them into operational policy.
    const hash=createHash('sha256').update(JSON.stringify(document)).digest('hex');
    this.db.prepare('INSERT OR IGNORE INTO knowledge VALUES(?,?,?,?,?)').run(hash,document.kind,this.seal(document),hash,Date.now());
    this.audit('KNOWLEDGE_IMPORTED',typeof document.source==='string'?document.source:document.source.id,{hash,kind:document.kind,count:document.entries.length});return {hash,kind:document.kind,count:document.entries.length};
  }
  approvedCustomerAnswers(){
    return this.db.prepare("SELECT body FROM knowledge WHERE kind='approved_customer_answers' ORDER BY imported,rowid").all().map(row=>this.open(row.body));
  }
  approvedPriceCatalogs(){return this.db.prepare("SELECT body FROM knowledge WHERE kind IN ('approved_price_catalog','approved_price_schedule') ORDER BY imported,rowid").all().map(row=>this.open(row.body)).filter(doc=>!supersededBusinessPriceSchedule(doc));}
  savePriceReplyReference(outboxId,reference){this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('price-reply:'+outboxId,this.seal(reference));}
  priceReplyReference(row){const r=this.db.prepare('SELECT value FROM meta WHERE key=?').get('price-reply:'+row.id);return r?this.open(r.value):null;}
  priceReplyStillValid(row){
    const ref=this.priceReplyReference(row);if(!ref)return true;
    const selected=selectPrice(ref.context,this.approvedPriceCatalogs(),ref.entryId);return selected.entry?.id===ref.entryId&&selected.entry.priceCop===ref.priceCop&&this.open(row.body)===ref.finalText;
  }
  saveApprovedReplyReference(outboxId,reference){
    this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('approved-reply:'+outboxId,this.seal(reference));
  }
  approvedReplyStillValid(row){
    const link=this.db.prepare('SELECT value FROM meta WHERE key=?').get('approved-reply:'+row.id);
    if(!link)return true;
    try{
      const reference=this.open(link.value),current=selectCommonAnswer(reference.question,reference.context,this.approvedCustomerAnswers(),reference.caseId);
      return current?.answer===reference.answer&&this.open(row.body)===reference.finalText;
    }catch{return false;}
  }
  close(){this.db.close();}
}
