import {BUSINESSES,knownInternalRecipient} from './config.mjs';
import {ownQuoteOutboxId} from './maria-program.mjs';
export const MARIA_WORKFLOW_REVIEW_GUARD='own-source-bound-quotation-registration-and-adviser-workflow-readonly-v2';
const attentionActions=new Set(['HUMAN_TAKEOVER','EXPLICIT_RELEASE','NATIVE_PRIOR_ATTENTION_BLOCKED_REPLY','NATIVE_ATTENTION_UNVERIFIED','NATIVE_PRE_RELEASE_ATTENTION_PRESERVED','STAFF_TAKEOVER_AT_INGESTION']);
function attentionDiagnostics(store,phone){
 const r=store.db.prepare('SELECT value FROM meta WHERE key=?').get('chief-release:'+phone),release=r&&store.open(r.value),recent=[];
 // Existing admin review, bounded to the same verified contact. Never return
 // message bodies or decrypted audit details belonging to another contact.
 for(const row of store.db.prepare('SELECT at,action,source,detail FROM audit ORDER BY id DESC LIMIT 1000').all()){
  if(!attentionActions.has(row.action))continue;
  const d=store.open(row.detail),source=store.db.prepare('SELECT phone FROM events WHERE id=?').get(row.source),out=store.db.prepare('SELECT phone FROM outbox WHERE id=?').get(row.source);
  if(d.phone!==phone&&source?.phone!==phone&&out?.phone!==phone)continue;
  const safe={at:row.at,action:row.action,sourceId:row.source};
  for(const k of ['reasonCode','line','outboxId','attemptedSend','humanHoldChanged','releaseSource','releasedAt'])if(['string','number','boolean'].includes(typeof d[k]))safe[k]=d[k];
  recent.push(safe);if(recent.length===12)break;
 }
 return {release:release?{sourceId:release.source,at:release.at}:null,recent,coverage:'last-1000-local-audits; at-most-12-related-records; no-complete-history-claim'};
}
export function reviewMariaWorkflow(store,config,body){
 if(config.company!=='fumigacion'||store.company!=='fumigacion')throw Error('OWN_WORKFLOW_SCOPE_REQUIRED');
 if(!body||Object.keys(body).sort().join(',')!=='company,contacts,line'||body.company!=='fumigacion'||!BUSINESSES.fumigacion.phones.includes(body.line)||!Array.isArray(body.contacts)||!body.contacts.length||body.contacts.length>4||body.contacts.some(v=>!v||Object.keys(v).sort().join(',')!=='phone,sourceId'||!/^57\d{10}$/.test(v.phone)||knownInternalRecipient(v.phone)||!/^[A-Za-z0-9_-]{8,100}$/.test(v.sourceId)))throw Error('OWN_WORKFLOW_SOURCE_SCOPE_REQUIRED');
 const results=body.contacts.map(({phone,sourceId})=>{
  const row=store.db.prepare('SELECT * FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(sourceId,phone,body.line),event=row&&store.open(row.body);
  if(!event||event.id!==row.id||event.phone!==row.phone||event.line!==row.line||event.at!==row.at||event.fromMe!==false)return {sourceId,found:false};
  const c=store.conversation(phone),s=c?.state;
  if(!c||c.line!==body.line)return {sourceId,found:true,currentLineMatches:false};
  const q=store.db.prepare('SELECT q.id,q.topic,q.state,q.body,o.line,o.state delivery,o.mid FROM questions q LEFT JOIN outbox o ON o.id=q.outbox_id WHERE q.phone=? AND q.case_id=? ORDER BY q.rowid').all(phone,s.caseId).map(r=>({id:r.id,topic:r.topic,state:r.state,sourceId:store.open(r.body).source,line:r.line,delivery:r.delivery,mid:r.mid}));
  const quoteId=s.quotedPrice&&ownQuoteOutboxId(store,s,phone,body.line),quote=quoteId&&store.db.prepare('SELECT id,line,state,mid FROM outbox WHERE id=? AND phone=? AND line=? AND internal=0').get(quoteId,phone,body.line);
  const saved=store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+s.caseId),entry=saved&&store.open(saved.value);
  return {sourceId,found:true,currentLineMatches:true,localHumanHold:Boolean(c.hold),localRevision:c.revision,caseId:s.caseId,sourceProcessingState:row.state,lastHandledSourceId:s.lastHandledSourceId??null,awaitingHumanReview:Boolean(s.awaitingHumanReview),closed:Boolean(s.closed),attention:attentionDiagnostics(store,phone),afterService:s.requestedAfterServiceReview?{kind:s.requestedAfterServiceReview.kind,sourceId:s.requestedAfterServiceReview.sourceId,activeKind:s.requestedAfterServiceReview.warrantySource?.kind||s.requestedAfterServiceReview.activeRequest?.kind}:null,adviserRequest:s.requestedHumanAssistance??null,quotation:{present:Boolean(s.quotedPrice),accepted:Boolean(s.quotedPrice?.accepted),sourceId:s.quotedPrice?.sourceId??null,outbox:quote?{...quote}:null},registration:{stage:s.programIntake?.stage??null,hasName:Boolean(s.programIntake?.customerName),hasAddress:Boolean(s.programIntake?.address),hasRequestedTiming:Boolean(s.slots?.preference),requestedFields:s.programIntake?.requestedFields??[],entryState:entry?.status??null,reviewReason:entry?.reason??null},pendingKinds:q.filter(v=>['PENDING','ANSWER_REVIEW','LEGACY_PENDING'].includes(v.state)).map(v=>v.topic),questions:q,fullNativeHistoryVerified:false,contactPermissionGranted:false};
 });
 return {guard:MARIA_WORKFLOW_REVIEW_GUARD,company:'FUMIGACION',readOnly:true,checkedAt:new Date().toISOString(),results};
}
