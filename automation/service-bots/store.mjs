import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
      CREATE TABLE IF NOT EXISTS knowledge(id TEXT PRIMARY KEY,kind TEXT,body TEXT,hash TEXT,imported INTEGER);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at INTEGER,action TEXT,source TEXT,detail TEXT);
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);`);
    if(!this.db.prepare('PRAGMA table_info(events)').all().some(c=>c.name==='revision'))this.db.exec('ALTER TABLE events ADD COLUMN revision INTEGER DEFAULT 0');
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
      this.db.prepare('INSERT INTO events(id,phone,at,line,from_me,body,revision) VALUES(?,?,?,?,?,?,?)').run(e.id,e.phone,e.at,e.line,Number(e.fromMe),this.seal(e),revision);
      this.db.prepare('INSERT INTO event_sources VALUES(?,?)').run(e.id,e.line);
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
    if(!value)this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('chief-release:'+phone,this.seal({source,at:Date.now()}));
    this.audit(value?'HUMAN_TAKEOVER':'EXPLICIT_RELEASE',source,{phone});
  }
  queue(id,phone,line,text,internal,revision) {
    const r=this.db.prepare('SELECT body FROM outbox WHERE id=?').get(id);
    if(r){if(this.open(r.body)!==text)throw new Error('OUTBOX_ID_CONFLICT');return false;}
    this.db.prepare('INSERT INTO outbox(id,phone,line,body,internal,revision,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(id,phone,line,this.seal(text),Number(internal),revision,Date.now(),Date.now());return true;
  }
  question({phone,line,caseId,topic,conditions,recipient,text,source}) {
    const hash=createHash('sha256').update(JSON.stringify(conditions)).digest('hex');
    const id=createHash('sha256').update(JSON.stringify([this.company,caseId,topic,hash,recipient])).digest('hex');
    const old=this.db.prepare('SELECT * FROM questions WHERE id=?').get(id);
    if(old)return {id,state:old.state,answer:old.answer&&this.open(old.answer),sourceId:old.source_id,valid:old.state==='ANSWERED'&&(!old.valid_until||old.valid_until>Date.now()),created:false};
    const legacy=this.db.prepare("SELECT id,state FROM questions WHERE case_id=? AND state='LEGACY_PENDING'").get(caseId);
    if(legacy)return {...legacy,created:false,valid:false};
    const outboxId='question:'+id;
    this.db.prepare('INSERT INTO questions(id,phone,case_id,topic,conditions_hash,recipient,body,outbox_id) VALUES(?,?,?,?,?,?,?,?)').run(id,phone,caseId,topic,hash,recipient,this.seal({text,conditions,source}),outboxId);
    this.queue(outboxId,recipient,line,text,true,0); this.audit('INTERNAL_QUESTION',source,{id,caseId,topic});
    return {id,state:'PENDING',created:true};
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
    if(!['instructions','historical_observations','reference'].includes(document.kind)||!document.source||!document.at||!Array.isArray(document.entries))throw new Error('KNOWLEDGE_SOURCE_REQUIRED');
    // Importing observations never converts them into operational policy.
    const hash=createHash('sha256').update(JSON.stringify(document)).digest('hex');
    this.db.prepare('INSERT OR IGNORE INTO knowledge VALUES(?,?,?,?,?)').run(hash,document.kind,this.seal(document),hash,Date.now());
    this.audit('KNOWLEDGE_IMPORTED',document.source,{hash,kind:document.kind,count:document.entries.length});return {hash,kind:document.kind,count:document.entries.length};
  }
  close(){this.db.close();}
}
