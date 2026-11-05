import {createHash} from 'node:crypto';
import {knownInternalRecipient} from './config.mjs';
export const MEMORY_RESET_GUARD='own-explicit-user-test-memory-boundary-v1';
const lines=['573126944997','573126938721'];
const key=phone=>'conversation-memory-boundary:'+phone;
const hash=v=>createHash('sha256').update(v).digest('hex');
export function conversationMemoryBoundary(store,phone){
 const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key(phone));if(!row)return null;
 const b=store.open(row.value);
 if(store.company!=='fumigacion'||b.guard!==MEMORY_RESET_GUARD||b.phone!==phone||JSON.stringify(b.lines)!==JSON.stringify(lines)||!Number.isSafeInteger(b.at)||b.at<0||!Number.isSafeInteger(b.revision)||b.revision<1||!Number.isSafeInteger(b.afterEventRow)||b.afterEventRow<0||!Number.isSafeInteger(b.afterOutboxRow)||b.afterOutboxRow<0||typeof b.source!=='string'||!/^direct-user-memory-reset-[a-z0-9-]{12,140}$/.test(b.source))throw Error('MEMORY_BOUNDARY_SCOPE');
 return b;
}
export function assertMemoryCaseCurrent(store,phone,caseId){
 const b=conversationMemoryBoundary(store,phone);if(!b)return;
 if(typeof caseId!=='string'||!caseId.startsWith('fumigacion:'))throw Error('MEMORY_RESET_STALE_CASE');
 const source=store.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND from_me=0').get(caseId.slice(11),phone);
 if(!source||source.rowid<=b.afterEventRow||source.at<Math.floor(b.at/1000)*1000)throw Error('MEMORY_RESET_STALE_CASE');
}
// Private maintenance primitive. No HTTP route exposes this operation.
// Human authorization is required separately; no history, receipt or business row is deleted.
export function resetUserTestMemory(store,{phone,source,expectedRevision,releaseHumanHold=false},now=Date.now()){
 if(typeof releaseHumanHold!=='boolean'||store.company!=='fumigacion'||store.db.prepare('SELECT company FROM scope').get()?.company!==store.company||!/^57\d{10}$/.test(phone??'')||knownInternalRecipient(phone)||lines.includes(phone)||!/^direct-user-memory-reset-[a-z0-9-]{12,140}$/.test(source??'')||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!Number.isSafeInteger(now)||now<0)throw Error('MEMORY_RESET_SCOPE');
 return store.tx(()=>{
  const c=store.db.prepare('SELECT * FROM conversations WHERE phone=?').get(phone);
  if(!c||c.revision!==expectedRevision||c.at>now||c.hold&&!releaseHumanHold)throw Error('MEMORY_RESET_PRECONDITION');
  const backupKey='conversation-memory-backup:'+phone+':'+source;
  if(store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(backupKey))throw Error('MEMORY_RESET_ALREADY_APPLIED');
  if(store.db.prepare("SELECT 1 FROM events WHERE phone=? AND state='PENDING'").get(phone))throw Error('MEMORY_RESET_PENDING_SOURCE');
  const table=n=>Boolean(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n));
  const questions=store.db.prepare('SELECT id,state,outbox_id FROM questions WHERE phone=?').all(phone);
  const routeIds=store.db.prepare('SELECT r.outbox_id FROM question_routes r JOIN questions q ON q.id=r.question_id WHERE q.phone=?').all(phone).map(r=>r.outbox_id);
  const ids=[...new Set([...questions.map(q=>q.outbox_id),...routeIds].filter(Boolean))];
  const outputs=store.db.prepare('SELECT id,state,updated FROM outbox WHERE phone=?').all(phone);
  for(const id of ids){const o=store.db.prepare('SELECT id,state,updated FROM outbox WHERE id=?').get(id);if(o&&!outputs.some(x=>x.id===id))outputs.push(o);}
  const tesa=table('tesa_outbox')?store.db.prepare('SELECT id,state,updated FROM tesa_outbox WHERE company=? AND customer_phone=?').all(store.company,phone):[];
  if([...outputs,...tesa].some(o=>o.state==='SENDING'))throw Error('MEMORY_RESET_SEND_IN_FLIGHT');
  const prior=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key(phone));
  const tesaQuestions=table('tesa_questions')?store.db.prepare('SELECT id,state FROM tesa_questions WHERE company=? AND customer_phone=?').all(store.company,phone):[];
  const boundary={guard:MEMORY_RESET_GUARD,phone,lines:[...lines],at:now,source,revision:c.revision+1,afterEventRow:store.db.prepare('SELECT COALESCE(MAX(rowid),0) n FROM events').get().n,afterOutboxRow:store.db.prepare('SELECT COALESCE(MAX(rowid),0) n FROM outbox').get().n};
  const suppressed=outputs.filter(x=>x.state==='READY'),suppressedTesa=tesa.filter(x=>x.state==='READY'),cancelled=questions.filter(x=>['PENDING','LEGACY_PENDING','ANSWER_REVIEW'].includes(x.state)),cancelledTesa=tesaQuestions.filter(x=>['PENDING','LEGACY_PENDING','ANSWER_REVIEW'].includes(x.state));
  const release=store.db.prepare('SELECT value FROM meta WHERE key=?').get('chief-release:'+phone);
  const backup={guard:MEMORY_RESET_GUARD,conversation:c,priorBoundary:prior?.value??null,priorRelease:release?.value??null,suppressed,suppressedTesa,cancelled,cancelledTesa,boundary};
  const cipher=store.seal(backup);if(JSON.stringify(store.open(cipher))!==JSON.stringify(backup))throw Error('MEMORY_BACKUP_NOT_VERIFIED');
  store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(backupKey,cipher);
  for(const o of suppressed)store.db.prepare("UPDATE outbox SET state='SUPPRESSED_MEMORY_RESET',updated=? WHERE id=? AND state='READY'").run(now,o.id);
  for(const o of suppressedTesa)store.db.prepare("UPDATE tesa_outbox SET state='SUPPRESSED_MEMORY_RESET',updated=? WHERE id=? AND state='READY'").run(now,o.id);
  for(const q of cancelled)store.db.prepare("UPDATE questions SET state='CANCELLED_MEMORY_RESET' WHERE id=?").run(q.id);
  for(const q of cancelledTesa)store.db.prepare("UPDATE tesa_questions SET state='CANCELLED_MEMORY_RESET' WHERE id=?").run(q.id);
  store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key(phone),store.seal(boundary));
  store.db.prepare('UPDATE conversations SET body=?,revision=revision+1,hold=? WHERE phone=?').run(store.seal({slots:{},asked:[],lastText:''}),releaseHumanHold?0:c.hold,phone);
  if(releaseHumanHold){store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('chief-release:'+phone,store.seal({source,at:now}));store.audit('EXPLICIT_RELEASE',source,{phone,reason:'DIRECT_USER_PERSONAL_TEST_MEMORY_RESET',lines:[...lines],otherHoldsChanged:false});}
  store.audit('CONVERSATION_TEST_MEMORY_RESET',source,{phone,guard:MEMORY_RESET_GUARD,oldCaseHash:hash(store.open(c.body).caseId??''),revision:c.revision+1,suppressed:suppressed.length+suppressedTesa.length,cancelledQuestions:cancelled.length+cancelledTesa.length,nativeMessagesDeleted:0,businessWrites:0,backupKey});
  return {guard:MEMORY_RESET_GUARD,phoneLast4:phone.slice(-4),lines:[...lines],resetAt:now,revision:c.revision+1,activeStateClean:true,backupVerified:true,suppressed:suppressed.length+suppressedTesa.length,cancelledQuestions:cancelled.length+cancelledTesa.length,humanHoldReleased:releaseHumanHold,nativeMessagesDeleted:0,businessWrites:0};
 });
}
