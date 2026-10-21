import {createHash} from 'node:crypto';
import {SANDRA,BUSINESSES,knownInternalRecipient} from './config.mjs';

export const MARIA_WARRANTY_RESPONSE_ESCALATION_GUARD='own-new-customer-unanswered-warranty-one-durable-chief-alert-v1';
const installKey='maria-warranty-response-escalation-installation-v1';
const keyOf=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const id=v=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,160}$/.test(v);
const excerpt=v=>String(v||'').replace(/https?:\/\/\S+|www\.\S+/gi,'[enlace omitido]').replace(/\s+/g,' ').slice(0,500);
function atomic(store,fn){
 // Engine.process already owns BEGIN IMMEDIATE. A savepoint also keeps this
 // bounded operation atomic if an internal caller uses it outside that cycle.
 store.db.exec('SAVEPOINT own_warranty_response_alert');
 try{const result=fn();store.db.exec('RELEASE SAVEPOINT own_warranty_response_alert');return result;}
 catch(error){store.db.exec('ROLLBACK TO SAVEPOINT own_warranty_response_alert');store.db.exec('RELEASE SAVEPOINT own_warranty_response_alert');throw error;}
}

export function initializeWarrantyResponseEscalation(store,config,now=Date.now()){
 if(config.company!=='fumigacion')return null;
 if(store.company!==config.company)throw Error('OWN_WARRANTY_ESCALATION_STORE_REQUIRED');
 const prior=store.db.prepare('SELECT value FROM meta WHERE key=?').get(installKey);if(prior)return store.open(prior.value);
 const value={guard:MARIA_WARRANTY_RESPONSE_ESCALATION_GUARD,installedAt:now,sourceStartsAt:Math.floor(now/1000)*1000};
 store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(installKey,store.seal(value));return value;
}
export function warrantyResponseEscalationStatus(store,config){
 if(config.company!=='fumigacion')return null;
 const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get(installKey),installation=row?store.open(row.value):null;
 return {guard:MARIA_WARRANTY_RESPONSE_ESCALATION_GUARD,configured:Boolean(installation),enabled:Boolean(installation&&config.enabled===true),installation,oncePerCaseSourceAndLine:true,replaysEnabled:false,businessWritesEnabled:false,attempts:store.db.prepare("SELECT state,COUNT(*) AS n FROM outbox WHERE id LIKE 'warranty-response-delay:%' GROUP BY state").all()};
}

// Only the engine calls this after its same-case pending-question check. This
// route never releases a hold, changes the warranty question or replays a source.
export function queueUnansweredWarrantyAlert(store,config,state,event,continuation){
 const installation=initializeWarrantyResponseEscalation(store,config);
 if(!installation||config.enabled!==true||!id(state.caseId)||!id(continuation?.warrantyResponseDelay?.pendingSourceId)||event.kind!=='text'||event.fromMe!==false||event.forwarded||event.quotedId||knownInternalRecipient(event.phone)||!BUSINESSES.fumigacion.phones.includes(event.line))return null;
 const conv=store.conversation(event.phone),row=store.db.prepare('SELECT * FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(event.id,event.phone,event.line);
 const native=row&&store.open(row.body);
 if(!conv||conv.hold||conv.state.caseId!==state.caseId||!row||row.at<installation.sourceStartsAt||row.received_at<installation.installedAt||native.text!==event.text||native.at!==event.at||native.kind!==event.kind)return null;
 const sourceId=continuation.warrantyResponseDelay.pendingSourceId,original=store.db.prepare('SELECT * FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(sourceId,event.phone,event.line);
 if(!original||original.at>row.at)return null;
 const pending=store.db.prepare("SELECT q.*,o.line AS source_line FROM questions q JOIN outbox o ON o.id=q.outbox_id WHERE q.phone=? AND q.case_id=? AND q.recipient=? AND o.line=? AND q.state IN ('PENDING','ANSWER_REVIEW') ORDER BY q.rowid").all(event.phone,state.caseId,SANDRA,event.line).find(q=>store.open(q.body).source===sourceId&&["warranty-review",'revision:'+sourceId].includes(q.topic));
 if(!pending)return null;
 const alertId='warranty-response-delay:'+keyOf(['fumigacion',state.caseId,event.phone,event.line,sourceId])+':v1';
 return atomic(store,()=>{
  const previous=store.db.prepare('SELECT state,mid FROM outbox WHERE id=?').get(alertId);if(previous)return {id:alertId,state:previous.state,created:false};
  const latest=store.conversation(event.phone);if(latest.hold||latest.revision!==conv.revision)return null;
  const media=store.db.prepare('SELECT id,body FROM events WHERE phone=? AND line=? AND from_me=0 AND at>=? AND at<=? ORDER BY at DESC LIMIT 40').all(event.phone,event.line,original.at,event.at).map(r=>({id:r.id,event:store.open(r.body)})).filter(r=>['image','video','audio','document'].includes(r.event.kind)&&!r.event.forwarded).slice(0,3);
  const originalEvent=store.open(original.body),text='María Ángel · garantía sin respuesta. Cliente terminado en '+event.phone.slice(-4)+', línea '+event.line.slice(-4)+'. Solicitud original: '+excerpt(originalEvent.text)+'. El cliente volvió a pedir respuesta: '+excerpt(event.text)+'.'+(media.length?' Archivos recibidos sin interpretar: '+media.map(r=>r.event.kind+' '+r.id).join('; ')+'.':'')+' La garantía sigue pendiente; no hay solución ni visita confirmadas en esta conversación. Revisar el antecedente del servicio y dar una respuesta concreta. Referencia '+sourceId+'.';
  store.queue(alertId,SANDRA,event.line,text,true,0);
  store.audit('OWN_UNANSWERED_WARRANTY_ESCALATED',event.id,{guard:MARIA_WARRANTY_RESPONSE_ESCALATION_GUARD,caseId:state.caseId,sourceId,questionId:pending.id,outboxId:alertId,recipient:SANDRA,line:event.line,sourceAt:event.at,delivered:false,originalQuestionPreserved:true,businessWritten:false,humanHoldReleased:false});
  return {id:alertId,state:'READY',created:true};
 });
}
