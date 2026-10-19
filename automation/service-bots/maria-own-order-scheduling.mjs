import {createHash,randomUUID} from 'node:crypto';
import {normalize,publicTextSafe,SANDRA} from './config.mjs';
import {registrationHash,ownRegisteredReceiptForPresentation,MARIA_COMPANY,MARIA_TENANT} from './maria-program.mjs';
import {ownSchedulingEnabled,ownSchedulingAccessStatus} from './maria-scheduling-access.mjs';
import {verifyStoredNativeIdentitySource} from './native-identity-resolution.mjs';
import {partitionNativeAttention} from './explicit-return-attention.mjs';
import {FUMIGACION_BLUE} from './line-scope.mjs';
import {publicResponseWindow,publicOperationAllowed,publicEventAllowed,publicTesaOutboxAllowed} from './public-response-window.mjs';

export const MARIA_OWN_SCHEDULING_GUARD='own-new-receipt-native-tesa-explicit-slot-customer-confirmed-first-schedule-v1';
export const MARIA_SCHEDULING_PROOF_GUARD='maria-own-order-scheduling-proof-v1';
const prefix='maria-own-scheduling:',planPrefix='maria-own-scheduling-plan:',proposalPrefix='maria-schedule-proposal:',chiefPrefix='chief-report:maria-scheduling:';
const get=(s,k)=>{const r=s.db.prepare('SELECT value FROM meta WHERE key=?').get(k);return r?s.open(r.value):null;};
const put=(s,k,v)=>s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,s.seal(v));
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const sameDay=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
const plainYes=text=>/^(?:si|confirmo|si confirmo|acepto|si acepto|de acuerdo|correcto|todo correcto|esta bien|perfecto)(?: gracias| por favor)?$/.test(normalize(text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim());
const pureCourtesy=text=>typeof text==='string'&&text.length<=80&&/^(?:gracias|muchas gracias|mil gracias|muy amable|gracias muy amable)$/.test(normalize(text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim());
const sameTechnicianName=(left,right)=>typeof left==='string'&&typeof right==='string'&&normalize(left).replace(/\s+/g,' ')===normalize(right).replace(/\s+/g,' ');
const pendingClassification=(s,phone)=>Boolean(s.db.prepare("SELECT 1 FROM events WHERE phone=? AND state IN ('PENDING','PROCESSING')").get(phone));
const stableProofHash=proof=>{const {checkedAt,expiresAt,...stable}=proof;return registrationHash(stable);};
function schedulingWindowAllowed(s,c,entry,now=Date.now()){
 // The separate first-schedule/TESA contract remains blue-only. Ordinary
 // client-requested scheduling uses its own registration contract instead.
 if(entry?.plan?.line!==FUMIGACION_BLUE)return false;
 if(!publicResponseWindow(c).active)return true;
 const p=entry?.plan;if(!p||!publicOperationAllowed(c,{line:p.line,sourceAt:Date.parse(p.registrationCreatedAt),createdAt:p.createdAt},now)||
  !publicOperationAllowed(c,{line:p.line,sourceAt:entry.customerAt??p.createdAt,createdAt:entry.createdAt??p.createdAt},now))return false;
 const anchorId=p.caseId?.startsWith('fumigacion:')?p.caseId.slice('fumigacion:'.length):null;
 const anchor=anchorId&&s.db.prepare('SELECT line,at,received_at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(anchorId,p.phone,p.line);
 const question=s.db.prepare('SELECT * FROM tesa_outbox WHERE question_id=?').get(p.questionId);
 if(!anchor||!publicEventAllowed(c,anchor,now)||!question||!publicTesaOutboxAllowed(s,c,question,now))return false;
 if(entry.confirmation){const source=s.db.prepare('SELECT line,at,received_at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(entry.confirmation.id,p.phone,p.line);if(!source||source.at!==entry.confirmation.at||!publicEventAllowed(c,source,now))return false;}
 return true;
}

/** A technical interval is always literal and explicit. Never invent a duration. */
export function parseOwnTesaSchedulingSlot(text,{now=Date.now(),expiresAt=Infinity}={}){
 if(typeof text!=='string'||text.length>700||!publicTextSafe(text)||/[¿?<>«»“”]|https?:|www\.|\b(?:57)?3\d{9}\b|\b(?:creo|quizas|posiblemente|tal vez|garantia|gratis|pago|pagado|descuento|ignora|confirmale|dile|envia|depende)\b/i.test(normalize(text)))return null;
 const parts=text.trim().split(/[;\r\n]+/).map(v=>v.trim()).filter(Boolean),fields={};
 if(parts.length!==4)return null;
 const labels={tecnico:'technicianName',fecha:'dateBogota',inicio:'startLocal',fin:'endLocal'};
 for(const part of parts){const m=part.match(/^([^:]+):\s*(.+)$/u),key=m&&labels[normalize(m[1])];if(!key||fields[key])return null;fields[key]=m[2].trim();}
 if(!/^[\p{L}][\p{L} .'-]{2,79}\s[\p{L} .'-]{1,79}$/u.test(fields.technicianName||'')||!/^20\d{2}-\d{2}-\d{2}$/.test(fields.dateBogota||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.startLocal||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.endLocal||''))return null;
 const startsAt=Date.parse(fields.dateBogota+'T'+fields.startLocal+':00-05:00'),endsAt=Date.parse(fields.dateBogota+'T'+fields.endLocal+':00-05:00');
 if(!Number.isFinite(startsAt)||!Number.isFinite(endsAt)||sameDay(startsAt)!==fields.dateBogota||sameDay(endsAt)!==fields.dateBogota||startsAt<=now||endsAt<=startsAt||endsAt>=expiresAt)return null;
 return {...fields,startsAtUtc:new Date(startsAt).toISOString(),endsAtUtc:new Date(endsAt).toISOString()};
}
export function prepareOwnSchedulingPlan(s,c,request,result){
 if(!ownSchedulingEnabled(c)||request?.line!==FUMIGACION_BLUE||!result?.created||!result.outboxId?.startsWith('tesa-question:')||request.topic!=='disponibilidad-y-tecnico')return false;
 const entry=ownRegisteredReceiptForPresentation(s,c,request),conv=s.conversation(request.phone),q=s.db.prepare('SELECT * FROM tesa_questions WHERE id=? AND company=?').get(result.id,c.company);
 if(!entry||!q||q.state!=='PENDING'||q.source_line!==request.line||!Number.isFinite(Date.parse(entry.receipt.createdAt))||Date.parse(entry.receipt.createdAt)<c.ownOrderScheduling.startsAt||get(s,planPrefix+q.id))return false;
 const plan={guard:MARIA_OWN_SCHEDULING_GUARD,questionId:q.id,caseId:request.caseId,phone:request.phone,line:request.line,actorId:c.mariaProgram.actorId,registrationAcceptanceId:entry.payload.quote.acceptanceId,registrationRequestHash:entry.requestHash,orderId:entry.receipt.orderId,slotsHash:registrationHash(conv.state.slots),createdAt:Date.now(),registrationCreatedAt:entry.receipt.createdAt};
 if(!schedulingWindowAllowed(s,c,{plan}))return false;
 put(s,planPrefix+q.id,plan);return true;
}
export function ownSchedulingPlan(s,c,qid){const plan=ownSchedulingEnabled(c)?get(s,planPrefix+qid):null;return plan&&schedulingWindowAllowed(s,c,{plan})?plan:null;}
function caseCurrent(s,c,entry){
 const p=entry?.plan;if(!ownSchedulingEnabled(c)||p?.guard!==MARIA_OWN_SCHEDULING_GUARD)return null;
 if(!schedulingWindowAllowed(s,c,entry))return null;
 const conv=s.conversation(p.phone),own=ownRegisteredReceiptForPresentation(s,c,{phone:p.phone,line:p.line,caseId:p.caseId});
 if(!conv||conv.hold||conv.state.closed||!own||own.receipt.orderId!==p.orderId||own.requestHash!==p.registrationRequestHash||registrationHash(conv.state.slots)!==p.slotsHash||conv.state.requestedProgramCancellationReview||conv.state.requestedAfterServiceReview||conv.state.requestedControlReview||conv.state.requestedDocumentReview)return null;
 return {conv,own};
}
function localCurrent(s,c,entry){const current=caseCurrent(s,c,entry);return current&&!pendingClassification(s,entry.plan.phone)?current:null;}
// A completed courtesy can preserve a case; it can never change an acceptance,
// carry a new fact or renew the finite allowance by moving its original anchor.
function courtesyEvents(s,p,revision,at,through){
 const delta=through-revision;if(!Number.isSafeInteger(delta)||delta<0||delta>3)return null;
 const anchor=s.db.prepare('SELECT rowid FROM events WHERE phone=? AND from_me=0 AND revision=? AND at=? ORDER BY rowid DESC LIMIT 1').get(p.phone,revision,at);
 if(!anchor)return null;
 const rows=s.db.prepare('SELECT id,line,at,state,revision,body FROM events WHERE phone=? AND from_me=0 AND rowid>? AND revision<=? ORDER BY rowid').all(p.phone,anchor.rowid,through);
 if(rows.length!==delta)return null;
 const events=rows.map(r=>s.open(r.body));
 if(!rows.every((r,i)=>r.state==='DONE'&&r.revision===revision+i+1&&r.line===p.line&&r.at>=at&&events[i].id===r.id&&events[i].phone===p.phone&&events[i].line===p.line&&events[i].at===r.at&&events[i].kind==='text'&&events[i].fromMe===false&&!events[i].forwarded&&!events[i].quotedId&&pureCourtesy(events[i].text)))return null;
 return events;
}
function courtesyCurrent(s,c,entry,{revision,at}){
 const current=localCurrent(s,c,entry);if(!current)return null;
 const events=courtesyEvents(s,entry.plan,revision,at,current.conv.revision);
 if(!events||current.conv.at!==(events.at(-1)?.at??at))return null;
 return {...current,events,revision:current.conv.revision,at:current.conv.at};
}
async function verifyCourtesies(s,c,t,entry,events){for(const event of events)await nativeCustomer(s,c,t,{...event,phone:entry.plan.phone,line:entry.plan.line,quotedId:null});}
function confirmationCourtesyContext(s,c,entry){
 const revision=entry.confirmationSourceRevision??entry.confirmationRevision,at=entry.confirmation.at;
 const current=courtesyCurrent(s,c,entry,{revision,at});if(!current)return null;
 const before=courtesyEvents(s,entry.plan,entry.revision,entry.customerAt,revision-1);
 if(!before||before.length+current.events.length>3)return null;
 return {...current,events:[...before,...current.events],anchor:{revision,at}};
}
export async function continueOwnSchedulingOffer(s,c,t,accepted,{verifyRegistered}={}){
 const plan=ownSchedulingPlan(s,c,accepted.questionId);if(!plan)return {prepared:false,queued:false};
 if(typeof verifyRegistered!=='function')return {prepared:true,queued:false};
 if(caseCurrent(s,c,{plan})&&pendingClassification(s,plan.phone))return {prepared:true,queued:false,nativeReadPending:true};
 const current=await verifyRegistered();if(!current)return {prepared:true,queued:false,...(caseCurrent(s,c,{plan})&&pendingClassification(s,plan.phone)?{nativeReadPending:true}:{})};
 const slot=parseOwnTesaSchedulingSlot(current.answer.text,{expiresAt:c.ownOrderScheduling.expiresAt});
 if(!slot){s.audit('OWN_SCHEDULING_EXPLICIT_SLOT_REQUIRED',accepted.id,{questionId:plan.questionId,caseId:plan.caseId,scheduled:false,businessWritten:false});return {prepared:true,queued:false,missingExplicitSlot:true};}
 if(!localCurrent(s,c,{plan})||current.answer.sourceKey!==accepted.id)return {prepared:true,queued:false};
 const existing=get(s,planPrefix+plan.questionId+':offer');if(existing)return {prepared:true,queued:false};
 const date=slot.dateBogota.split('-').reverse().join('/'),text='El equipo propone la visita para el '+date+', de '+slot.startLocal+' a '+slot.endLocal+' (hora de Colombia), con '+slot.technicianName+'. La disponibilidad se verificará al guardar la programación. ¿Confirmas esta fecha y franja?';
 let fields;try{fields=await currentOrderFields(c,t,plan);}catch{return {prepared:true,queued:false,nativeReadPending:true};}
 if(!fields)return {prepared:true,queued:false};
 if(!localCurrent(s,c,{plan}))return {prepared:true,queued:false,...(caseCurrent(s,c,{plan})&&pendingClassification(s,plan.phone)?{nativeReadPending:true}:{})};
 const rechecked=await verifyRegistered();if(!rechecked||rechecked.answer.sourceId!==current.answer.sourceId||rechecked.answer.text!==current.answer.text||!localCurrent(s,c,{plan}))return {prepared:true,queued:false,...(caseCurrent(s,c,{plan})&&(pendingClassification(s,plan.phone)||courtesyCurrent(s,c,{plan},{revision:current.conv.revision,at:current.conv.at})?.revision>current.conv.revision)?{nativeReadPending:true}:{})};
 const id=proposalPrefix+plan.questionId,key=randomUUID(),entry={guard:MARIA_OWN_SCHEDULING_GUARD,schedulingKey:key,status:'OFFERED',plan,slot,answerId:current.answer.sourceId,answerText:current.answer.text,proposalId:id,proposalText:text,orderUpdatedAt:fields.orderUpdatedAt,createdAt:Date.now(),revision:rechecked.conv.revision,customerAt:rechecked.conv.at};
 if(!publicTextSafe(text))return {prepared:true,queued:false};
 return s.tx(()=>{if(!localCurrent(s,c,entry)||s.conversation(plan.phone).revision!==entry.revision||get(s,planPrefix+plan.questionId+':offer'))return {prepared:true,queued:false};put(s,prefix+key,entry);put(s,planPrefix+plan.questionId+':offer',{schedulingKey:key});const queued=s.queue(id,plan.phone,plan.line,text,false,rechecked.conv.revision,plan.caseId);s.saveConversation(plan.phone,{...rechecked.conv.state,awaitingHumanReview:false,pendingTesaQuestionId:null,verifiedTesaAnswerSource:entry.answerId,pendingOwnScheduling:{schedulingKey:key,proposalId:id,status:'OFFERED'}});s.audit('OWN_SCHEDULING_OPTION_PREPARED',entry.answerId,{schedulingKey:key,caseId:plan.caseId,questionId:plan.questionId,scheduled:false,businessWritten:false});return {prepared:true,queued};});
}
async function currentOrderFields(c,t,p){
 const r=await t.fetcher(c.mariaProgram.url+'/receipt/current-fields',{method:'POST',headers:{authorization:'Bearer '+c.mariaProgram.token,'content-type':'application/json'},body:JSON.stringify({caseId:p.caseId,acceptanceId:p.registrationAcceptanceId}),signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!r.ok)return null;const raw=await r.json(),d=raw?.success===true?raw.data:raw,order=d?.currentRecords?.order;
 if(d?.company!=='FUMIGACION'||d.tenantId!==MARIA_TENANT||d.companyId!==MARIA_COMPANY||d.advisorMembershipId!==c.mariaProgram.actorId||d.readOnly!==true||d.available!==true||d.immutableReceipt?.orderId!==p.orderId||d.immutableReceipt?.requestHash!==p.registrationRequestHash||order?.createdBy!==c.mariaProgram.actorId||order.state!=='NUEVO'||order.technicianId||order.scheduledDate||order.startTime||order.endTime||!Number.isFinite(Date.parse(order.updatedAt)))return null;
 return {orderUpdatedAt:order.updatedAt};
}
export function ownSchedulingCustomerTurn(s,c,state,event){
 const key=state.pendingOwnScheduling?.schedulingKey,entry=key&&get(s,prefix+key);if(!entry||entry.status!=='OFFERED'||!ownSchedulingEnabled(c))return null;
 if(!schedulingWindowAllowed(s,c,entry))return null;
 const p=entry.plan,conv=s.conversation(event.phone);if(!conv||conv.hold||state.caseId!==p.caseId||event.phone!==p.phone||event.line!==p.line||event.fromMe||event.forwarded||event.kind!=='text')return null;
 const nativeRow=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(event.id,p.phone,p.line),native=nativeRow&&s.open(nativeRow.body);
 if(!native||native.text!==event.text||native.at!==event.at||event.quotedId&&event.quotedId!==s.db.prepare('SELECT mid FROM outbox WHERE id=?').get(entry.proposalId)?.mid)return null;
 const out=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(entry.proposalId,p.phone,p.line,p.caseId),delivery=get(s,'first-delivery:'+entry.proposalId);
 if(!out||s.open(out.body)!==entry.proposalText||!delivery||delivery.mid!==out.mid||delivery.line!==p.line||!['DELIVERED','READ'].includes(delivery.state)||event.at<Math.floor(delivery.verifiedAt/1000)*1000)return null;
 const rows=s.db.prepare('SELECT body,state FROM events WHERE phone=? AND from_me=0 AND revision>? AND revision<=? ORDER BY revision').all(p.phone,out.revision,conv.revision),texts=rows.map(r=>s.open(r.body));
 if(texts.length<1||texts.length>4||texts.at(-1)?.id!==event.id||texts.some((e,i)=>e.line!==p.line||e.forwarded||e.kind!=='text'||e.id!==event.id&&(rows[i].state!=='DONE'||e.quotedId||!pureCourtesy(e.text))))return null;
 if(!plainYes(event.text)){
  if(/^(?:no|no gracias|no confirmo|no acepto)[.! ]*$/.test(normalize(event.text))||/\b(?:cambia|cambiar|otro dia|otra hora|prefiero|mejor|cancel)\w*/.test(normalize(event.text))){const cancellation=/\bcancel\w*/.test(normalize(event.text));entry.status='REVIEW';entry.reason=cancellation?'CUSTOMER_CANCELLATION_REQUEST':'CUSTOMER_SLOT_NOT_ACCEPTED';entry.reviewSource={id:event.id,text:event.text,at:event.at};put(s,prefix+key,entry);state.awaitingHumanReview=true;state.pendingOwnScheduling={...state.pendingOwnScheduling,status:'REVIEW'};if(cancellation)state.requestedProgramCancellationReview={guard:MARIA_OWN_SCHEDULING_GUARD,schedulingKey:key,firstSourceId:event.id,orderId:p.orderId,state:'REQUEST'};s.queue(chiefPrefix+key+':'+SANDRA,SANDRA,p.line,chiefReviewText(entry),true,0);s.audit('OWN_SCHEDULING_OPTION_NOT_ACCEPTED',event.id,{schedulingKey:key,businessWritten:false});return {state,reply:cancellation?'Recibí tu solicitud de cancelación. La orden todavía no está cancelada y requiere revisión.':'La programación no quedó confirmada. Recibí tu solicitud de revisar esa opción.'};}
  return null;
 }
 entry.status='PENDING';entry.confirmation={id:event.id,text:event.text,at:event.at,quotedId:event.quotedId??null,fromMe:false,forwarded:false};entry.confirmationSourceRevision=conv.revision;entry.confirmationRevision=conv.revision;put(s,prefix+key,entry);state.pendingOwnScheduling={...state.pendingOwnScheduling,status:'PENDING'};s.audit('OWN_SCHEDULING_CUSTOMER_CONFIRMED_OPTION',event.id,{schedulingKey:key,caseId:p.caseId,scheduled:false,businessWritten:false});return {state,reply:'Recibí tu confirmación. Voy a verificar y guardar la programación; todavía no está confirmada en la agenda.'};
}
async function nativeCustomer(s,c,t,expected,{outgoing=false,mid=null}={}){
 const line=c.lines.find(l=>l.phone===expected.line);if(!line)throw Error('SCHEDULING_LINE_REQUIRED');
 const data=await t.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{id:mid||expected.id}},offset:10,page:1});
 const found=(data.messages?.records??[]).filter(r=>r.key?.id===(mid||expected.id));
 if(found.length!==1)throw Error('SCHEDULING_NATIVE_UNIQUE_REQUIRED');
 const r=found[0],primary=r.key.remoteJid,alt=r.key.remoteJidAlt,pn=expected.phone+'@s.whatsapp.net';
 const direct=!(primary!==pn&&!( /^\d+@lid$/.test(primary??'')&&alt===pn)||alt?.endsWith('@s.whatsapp.net')&&alt!==pn);
 if(!direct&&(outgoing||!await verifyStoredNativeIdentitySource(s,c,t,{...expected,fromMe:false,forwarded:false},r)))throw Error('SCHEDULING_NATIVE_IDENTITY_REQUIRED');
 const m=r.message?.ephemeralMessage?.message??r.message??{},contexts=[m.extendedTextMessage?.contextInfo,m.messageContextInfo,r.contextInfo].filter(x=>x&&typeof x==='object'),citations=[...new Set(contexts.map(x=>x.stanzaId).filter(x=>typeof x==='string'&&x.trim()))],text=m.conversation??m.extendedTextMessage?.text;
 if(r.key.fromMe!==outgoing||text!==expected.text||typeof m.conversation==='string'&&typeof m.extendedTextMessage?.text==='string'&&m.conversation!==m.extendedTextMessage.text||contexts.some(x=>x.isForwarded===true||Number(x.forwardingScore)>0)||citations.length>1||m.editedMessage||m.protocolMessage||r.message?.protocolMessage||r.deleted||r.isEdited||[r.status,...(r.MessageUpdate??[]).map(u=>u.status)].some(v=>['EDITED','DELETED','REVOKED'].includes(v)))throw Error('SCHEDULING_NATIVE_BODY_REQUIRED');
 const timestamp=typeof r.messageTimestamp==='object'?Number(r.messageTimestamp.low):Number(r.messageTimestamp);
 if(!outgoing&&(timestamp*1000!==expected.at||(citations[0]??null)!==(expected.quotedId??null)))throw Error('SCHEDULING_NATIVE_CONFIRMATION_REQUIRED');
 if(outgoing&&![r.status,...(r.MessageUpdate??[]).map(u=>u.status)].some(v=>['DELIVERY_ACK','READ','PLAYED'].includes(v)))throw Error('SCHEDULING_NATIVE_DELIVERY_REQUIRED');return r;
}
export async function ownSchedulingProof(s,c,t,body,{verifyRegistered}={}){
 if(!ownSchedulingEnabled(c)||!body||Object.keys(body).sort().join(',')!=='company,schedulingKey'||body.company!=='fumigacion'||!/^[a-f0-9-]{36}$/.test(body.schedulingKey??''))throw Error('OWN_SCHEDULING_PROOF_SCOPE_REQUIRED');
 const entry=get(s,prefix+body.schedulingKey);if(!entry||!['PENDING','SENDING'].includes(entry.status)||!entry.confirmation)throw Error('OWN_SCHEDULING_CURRENT_INTENT_REQUIRED');
 const p=entry.plan;if(pendingClassification(s,p.phone))throw Error('OWN_SCHEDULING_CLASSIFICATION_PENDING');
 const current=confirmationCourtesyContext(s,c,entry);if(!current||entry.proofLocked&&current.revision!==entry.confirmationRevision||current.conv.state.pendingOwnScheduling?.schedulingKey!==entry.schedulingKey||typeof verifyRegistered!=='function')throw Error('OWN_SCHEDULING_CURRENT_CASE_REQUIRED');
 const proofRevision=current.revision,unchanged=()=>{const now=confirmationCourtesyContext(s,c,entry);return now&&now.revision===proofRevision&&now.at===current.at&&registrationHash(now.events)===registrationHash(current.events);};
 const verified=await verifyRegistered(entry);if(!verified||verified.answer.sourceId!==entry.answerId||verified.answer.text!==entry.answerText)throw Error('OWN_SCHEDULING_CURRENT_TESA_REQUIRED');
 const slot=parseOwnTesaSchedulingSlot(entry.answerText,{expiresAt:c.ownOrderScheduling.expiresAt});if(!slot||registrationHash(slot)!==registrationHash(entry.slot))throw Error('OWN_SCHEDULING_LITERAL_SLOT_REQUIRED');
 const out=s.db.prepare("SELECT * FROM outbox WHERE id=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(entry.proposalId),delivery=get(s,'first-delivery:'+entry.proposalId);if(!out||s.open(out.body)!==entry.proposalText||!delivery||delivery.mid!==out.mid||delivery.line!==p.line||entry.confirmation.at<Math.floor(delivery.verifiedAt/1000)*1000)throw Error('OWN_SCHEDULING_PROPOSAL_REQUIRED');
 await nativeCustomer(s,c,t,{...entry.confirmation,phone:p.phone,line:p.line});await nativeCustomer(s,c,t,{id:out.id,text:entry.proposalText,phone:p.phone,line:p.line},{outgoing:true,mid:out.mid});
 await verifyCourtesies(s,c,t,entry,current.events);
 const attention=await t.currentAttention(p.phone,{store:s}),classified=partitionNativeAttention(s,c,{phone:p.phone,line:p.line,revision:proofRevision,created:entry.createdAt,sourceAt:entry.confirmation.at},attention);if(classified.unknown.length)throw Error('OWN_SCHEDULING_HUMAN_ATTENTION_REVIEW');
 if(classified.releasedSources.length)s.audit('OWN_SCHEDULING_PRE_RETURN_ATTENTION_PRESERVED',entry.confirmation.id,{sources:classified.releasedSources,releaseSource:classified.release.source,holdReleased:false,authorUnverified:true,businessWritten:false});
 const activity=await t.currentCustomerActivity(p.phone,entry.confirmation.at,{store:s});if(!activity.complete||!activity.sources.length||activity.sources.some(v=>!s.db.prepare('SELECT 1 FROM events WHERE id=? AND phone=? AND line=? AND from_me=0 AND at=? AND revision<=?').get(v.id,p.phone,p.line,v.at,proofRevision)))throw Error('OWN_SCHEDULING_LATEST_ACTIVITY_REQUIRED');
 const again=await verifyRegistered(entry);if(!again||again.answer.sourceId!==entry.answerId||again.answer.text!==entry.answerText||!unchanged())throw Error(pendingClassification(s,p.phone)?'OWN_SCHEDULING_CLASSIFICATION_PENDING':'OWN_SCHEDULING_PROOF_CHANGED');
 await nativeCustomer(s,c,t,{...entry.confirmation,phone:p.phone,line:p.line});await nativeCustomer(s,c,t,{id:out.id,text:entry.proposalText,phone:p.phone,line:p.line},{outgoing:true,mid:out.mid});
 await verifyCourtesies(s,c,t,entry,current.events);
 if(!unchanged())throw Error(pendingClassification(s,p.phone)?'OWN_SCHEDULING_CLASSIFICATION_PENDING':'OWN_SCHEDULING_PROOF_CHANGED');
 const q=again.q,qBody=s.open(q.body),answer=again.answer,checkedAt=Date.now();
 const qProof=q.native_proof&&s.open(q.native_proof),proofKey=prefix+entry.schedulingKey+':question-delivery',first=get(s,proofKey);
 if(!first){if(!qProof?.nativeVerified||qProof.mid!==q.mid||!Number.isSafeInteger(qProof.at))throw Error('OWN_SCHEDULING_QUESTION_DELIVERY_REQUIRED');put(s,proofKey,{mid:q.mid,at:qProof.at});}
 else if(first.mid!==q.mid)throw Error('OWN_SCHEDULING_QUESTION_CHANGED');
 return {guard:MARIA_SCHEDULING_PROOF_GUARD,company:'FUMIGACION',schedulingKey:entry.schedulingKey,caseId:p.caseId,registrationAcceptanceId:p.registrationAcceptanceId,registrationRequestHash:p.registrationRequestHash,orderId:p.orderId,phone:p.phone,line:p.line,question:{id:q.id,mid:q.mid,text:qBody.text,textHash:sha(qBody.text),sourceId:qBody.source,conditionsHash:q.conditions_hash,deliveredAt:first?.at??qProof.at},answer:{id:answer.sourceId,text:answer.text,at:answer.at,participantPhone:answer.participant.phone,questionMid:answer.questionMid,nativeHash:registrationHash({id:answer.sourceId,text:answer.text,at:answer.at,participantPhone:answer.participant.phone,questionMid:answer.questionMid})},proposal:{id:out.id,mid:out.mid,text:entry.proposalText,textHash:sha(entry.proposalText),deliveredAt:Math.floor(delivery.verifiedAt/1000)*1000,technicianName:slot.technicianName,dateBogota:slot.dateBogota,startLocal:slot.startLocal,endLocal:slot.endLocal,orderUpdatedAt:entry.orderUpdatedAt},confirmation:entry.confirmation,context:{revision:proofRevision,ownerEpoch:proofRevision,hold:false,pendingSources:0,coverageComplete:true},checkedAt,expiresAt:Math.min(checkedAt+60000,c.ownOrderScheduling.expiresAt,Date.parse(slot.startsAtUtc))};
}
export async function ownSchedulingReplyStillValid(s,c,t,outbox,verifiers={}){
 try{return await schedulingReplyCurrent(s,c,t,outbox,verifiers);}catch{s.audit('OWN_SCHEDULING_REPLY_READ_PENDING',outbox?.id,{sendReserved:false,businessWritten:false});return null;}
}
async function schedulingReplyCurrent(s,c,t,outbox,{verifyRegistered}={}){
 if(outbox?.id?.startsWith(chiefPrefix)){const key=outbox.id.slice(chiefPrefix.length).split(':')[0],entry=get(s,prefix+key);return Boolean(ownSchedulingEnabled(c)&&entry?.guard===MARIA_OWN_SCHEDULING_GUARD&&entry.status==='REVIEW'&&entry.plan.actorId===c.mariaProgram.actorId&&outbox.phone===SANDRA&&outbox.line===entry.plan.line&&outbox.internal===1&&s.open(outbox.body)===chiefReviewText(entry));}
 if(!outbox?.id?.startsWith(proposalPrefix)&&!outbox?.id?.startsWith('maria-schedule-saved:')&&!outbox?.id?.startsWith('maria-schedule-review:'))return true;
 let entry;
 if(outbox.id.startsWith(proposalPrefix)){const ref=get(s,planPrefix+outbox.id.slice(proposalPrefix.length)+':offer');entry=ref&&get(s,prefix+ref.schedulingKey);}
 else entry=get(s,prefix+outbox.id.slice(outbox.id.startsWith('maria-schedule-saved:')?'maria-schedule-saved:'.length:'maria-schedule-review:'.length));
 if(!entry||!ownSchedulingEnabled(c)||outbox.phone!==entry.plan.phone||outbox.line!==entry.plan.line||outbox.case_id!==entry.plan.caseId)return false;
 if(!caseCurrent(s,c,entry))return false;
 if(pendingClassification(s,entry.plan.phone))return null;
 if(outbox.id.startsWith('maria-schedule-review:'))return Boolean(localCurrent(s,c,entry)?.conv.revision===outbox.revision&&entry.status==='REVIEW'&&s.open(outbox.body)==='No pude confirmar la programación en la agenda. El horario y el técnico siguen pendientes de revisión.');
 const isSaved=outbox.id.startsWith('maria-schedule-saved:'),contextNow=()=>isSaved?confirmationCourtesyContext(s,c,entry):courtesyCurrent(s,c,entry,{revision:entry.revision,at:entry.customerAt}),context=contextNow();
 if(!context||outbox.revision>context.revision)return false;
 await verifyCourtesies(s,c,t,entry,context.events);
 if(isSaved){
  if(entry.status!=='SAVED'||!receiptMatches(entry,entry.receipt)||s.open(outbox.body)!==savedText(entry))return false;
  if(!receiptMatches(entry,await backend(c,t,'/receipt',{schedulingKey:entry.schedulingKey})))return false;
 }else{
  if(entry.status!=='OFFERED'||Date.parse(entry.slot.startsAtUtc)<=Date.now()||s.open(outbox.body)!==entry.proposalText||typeof verifyRegistered!=='function')return false;
  const verified=await verifyRegistered(entry);if(!verified||verified.answer.sourceId!==entry.answerId||verified.answer.text!==entry.answerText)return pendingClassification(s,entry.plan.phone)||contextNow()?.revision>context.revision?null:false;
  const fields=await currentOrderFields(c,t,entry.plan);if(fields?.orderUpdatedAt!==entry.orderUpdatedAt)return false;
  const last=await verifyRegistered(entry);if(!last||last.answer.sourceId!==entry.answerId||last.answer.text!==entry.answerText)return pendingClassification(s,entry.plan.phone)||contextNow()?.revision>context.revision?null:false;
 }
 await verifyCourtesies(s,c,t,entry,context.events);
 if(pendingClassification(s,entry.plan.phone))return null;
 return s.tx(()=>{
  const latest=contextNow(),stored=get(s,prefix+entry.schedulingKey),row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(outbox.id);
  if(!latest||registrationHash(stored)!==registrationHash(entry)||!row||row.state!=='READY'||row.revision!==outbox.revision||row.phone!==outbox.phone||row.line!==outbox.line||row.case_id!==outbox.case_id||s.open(row.body)!==s.open(outbox.body))return false;
  if(latest.revision!==context.revision||latest.at!==context.at||registrationHash(latest.events)!==registrationHash(context.events))return null;
  if(row.revision!==latest.revision){
   if(!s.db.prepare("UPDATE outbox SET revision=? WHERE id=? AND state='READY' AND revision=?").run(latest.revision,row.id,row.revision).changes)return false;
   outbox.revision=latest.revision;s.audit('OWN_SCHEDULING_NATIVE_COURTESY_RECHECKED',outbox.id,{caseId:entry.plan.caseId,sourceIds:latest.events.map(e=>e.id),acceptanceChanged:false,proofChanged:false});
  }
  return true;
 });
}
async function backend(c,t,route,body,windowCheck=null){if(windowCheck&&!windowCheck())throw Error('OWN_SCHEDULING_PUBLIC_WINDOW_REQUIRED');const r=await t.fetcher(c.ownOrderScheduling.url+route,{method:'POST',headers:{authorization:'Bearer '+c.ownOrderScheduling.token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});const result=await r.json();if(!r.ok)throw Error('OWN_SCHEDULING_BACKEND_REVIEW');return result?.success===true&&result.data?result.data:result;}
function receiptMatches(entry,r){return r?.persisted===true&&r.schedulingKey===entry.schedulingKey&&r.caseId===entry.plan.caseId&&r.orderId===entry.plan.orderId&&r.registrationRequestHash===entry.plan.registrationRequestHash&&r.proposalHash===entry.prepared?.proposalHash&&r.tenantId===MARIA_TENANT&&r.companyId===MARIA_COMPANY&&r.actorId===entry.plan.actorId&&r.committed?.state==='PROGRAMADO'&&r.currentMatchesCommitted===true&&r.committed.technicianMembershipId===entry.prepared?.technicianMembershipId&&sameTechnicianName(r.committed.technicianName,entry.slot.technicianName)&&r.committed.dateBogota===entry.slot.dateBogota&&r.committed.startsAtUtc===entry.slot.startsAtUtc&&r.committed.endsAtUtc===entry.slot.endsAtUtc;}
function validProof(entry,p,revision=entry.confirmationRevision){return p?.guard===MARIA_SCHEDULING_PROOF_GUARD&&p.company==='FUMIGACION'&&p.schedulingKey===entry.schedulingKey&&p.caseId===entry.plan.caseId&&p.orderId===entry.plan.orderId&&p.registrationRequestHash===entry.plan.registrationRequestHash&&p.proposal?.orderUpdatedAt===entry.orderUpdatedAt&&p.context?.revision===revision&&p.context.hold===false&&p.expiresAt>Date.now();}
function savedText(entry){return 'Tu visita quedó programada para el '+entry.slot.dateBogota.split('-').reverse().join('/')+', de '+entry.slot.startLocal+' a '+entry.slot.endLocal+' (hora de Colombia), con '+(entry.receipt?.committed?.technicianName||entry.slot.technicianName)+'.';}
function chiefReviewText(entry){return 'María Ángel: la programación del servicio propio del contacto terminado en '+entry.plan.phone.slice(-4)+' requiere revisión. El resultado no está comprobado en la agenda. Motivo: '+({PREPARE_REVIEW:'no se verificaron técnico, agenda o datos actuales',CASE_CHANGED:'el caso cambió antes de guardar',UNCERTAIN_RECEIPT:'el resultado de la programación sigue sin comprobarse',RECEIPT_REVIEW:'el recibo o la agenda actual no coinciden',CUSTOMER_CANCELLATION_REQUEST:'el cliente pidió cancelar; la orden no se ha cancelado',CUSTOMER_SLOT_NOT_ACCEPTED:'el cliente no aceptó la opción o pidió otro horario; falta coordinar una nueva propuesta'}[entry.reason]||'no se completó la verificación')+'.';}
function review(s,c,entry,reason){entry.status='REVIEW';entry.reason=reason;put(s,prefix+entry.schedulingKey,entry);s.audit('OWN_SCHEDULING_REVIEW',entry.confirmation?.id??entry.answerId,{schedulingKey:entry.schedulingKey,caseId:entry.plan.caseId,reason,writeRetried:false});const conv=s.conversation(entry.plan.phone);if(conv&&!conv.hold&&conv.state.caseId===entry.plan.caseId)s.queue('maria-schedule-review:'+entry.schedulingKey,entry.plan.phone,entry.plan.line,'No pude confirmar la programación en la agenda. El horario y el técnico siguen pendientes de revisión.',false,conv.revision,entry.plan.caseId);s.queue(chiefPrefix+entry.schedulingKey+':'+SANDRA,SANDRA,entry.plan.line,chiefReviewText(entry),true,0);}
function saved(s,c,entry,r){entry.status='SAVED';entry.receipt=r;put(s,prefix+entry.schedulingKey,entry);const current=caseCurrent(s,c,entry);if(current){s.saveConversation(entry.plan.phone,{...current.conv.state,pendingOwnScheduling:{...current.conv.state.pendingOwnScheduling,status:'SAVED'}});s.queue('maria-schedule-saved:'+entry.schedulingKey,entry.plan.phone,entry.plan.line,savedText(entry),false,entry.confirmationRevision,entry.plan.caseId);}s.audit('OWN_FIRST_SERVICE_SCHEDULED',entry.confirmation.id,{schedulingKey:entry.schedulingKey,caseId:entry.plan.caseId,orderId:entry.plan.orderId,persisted:true});}
export async function drainOwnScheduling(s,c,t,{verifyProof}={}){
 if(!ownSchedulingEnabled(c))return {enabled:false,processed:0};let processed=0;
 for(const row of s.db.prepare('SELECT key,value FROM meta WHERE key LIKE ? ORDER BY key').all(prefix+'%')){
  let entry=s.open(row.value);if(!['PENDING','SENDING','UNCERTAIN'].includes(entry.status))continue;if(entry.nextReceiptAt>Date.now())continue;
  if(!schedulingWindowAllowed(s,c,entry))continue;
  if(entry.status!=='PENDING'){try{const r=await backend(c,t,'/receipt',{schedulingKey:entry.schedulingKey});if(receiptMatches(entry,r))saved(s,c,entry,r);else review(s,c,entry,'RECEIPT_REVIEW');}catch{entry.nextReceiptAt=Date.now()+60000;entry.receiptFailures=(entry.receiptFailures||0)+1;put(s,row.key,entry);if(entry.receiptFailures>=3)review(s,c,entry,'UNCERTAIN_RECEIPT');}processed++;continue;}
  if(!entry.proofLocked&&caseCurrent(s,c,entry)&&pendingClassification(s,entry.plan.phone))continue;
  if(!localCurrent(s,c,entry)){review(s,c,entry,'CASE_CHANGED');continue;}
  try{
   if(typeof verifyProof!=='function')throw Error('PROOF_REQUIRED');
   const proof=await verifyProof(entry),current=confirmationCourtesyContext(s,c,entry);
   if(!schedulingWindowAllowed(s,c,entry))continue;
   if(!current||entry.proofLocked&&current.revision!==entry.confirmationRevision||!validProof(entry,proof,current.revision))throw Error('PROOF_REQUIRED');
   if(entry.proofLocked&&entry.proofHash!==stableProofHash(proof))throw Error('CASE_CHANGED');
   // Freeze the exact native context before the first prepare attempt. A later
   // courtesy cannot rewrite the proof or be silently adopted before commit.
   entry.confirmationRevision=current.revision;entry.proofLocked=true;entry.proofHash=stableProofHash(proof);put(s,row.key,entry);
   const p=entry.plan,prepared=await backend(c,t,'/prepare',{caseId:p.caseId,acceptanceId:p.registrationAcceptanceId,schedulingKey:entry.schedulingKey},()=>schedulingWindowAllowed(s,c,entry));
   if(!schedulingWindowAllowed(s,c,entry))continue;
   if(!prepared?.prepared||prepared.scheduled!==false||! /^[a-f0-9]{64}$/.test(prepared.proposalHash??'')||prepared.expectedOrderUpdatedAt!==entry.orderUpdatedAt||!sameTechnicianName(prepared.technicianName,entry.slot.technicianName)||prepared.startsAtUtc!==entry.slot.startsAtUtc||prepared.endsAtUtc!==entry.slot.endsAtUtc||typeof prepared.technicianMembershipId!=='string')throw Error('PREPARE_REQUIRED');
   entry.prepared=prepared;
   if(!localCurrent(s,c,entry)||s.conversation(p.phone).revision!==entry.confirmationRevision)throw Error('CASE_CHANGED');
   const last=await verifyProof(entry);
   if(!schedulingWindowAllowed(s,c,entry))continue;
   if(!validProof(entry,last)||stableProofHash(last)!==entry.proofHash||!localCurrent(s,c,entry)||s.conversation(p.phone).revision!==entry.confirmationRevision)throw Error('CASE_CHANGED');
  }
  catch(error){
   if(!schedulingWindowAllowed(s,c,entry))continue;
   const still=caseCurrent(s,c,entry),courtesy=still&&!entry.proofLocked&&confirmationCourtesyContext(s,c,entry);
   if(still&&!entry.proofLocked&&(pendingClassification(s,entry.plan.phone)||error.message==='OWN_SCHEDULING_PROOF_CHANGED'&&courtesy&&courtesy.revision!==entry.confirmationRevision))continue;
   review(s,c,entry,'PREPARE_REVIEW');continue;
  }
  if(!schedulingWindowAllowed(s,c,entry))continue;
  entry.status='SENDING';entry.attemptedAt=Date.now();put(s,row.key,entry);
  try{const r=await backend(c,t,'/commit',{caseId:entry.plan.caseId,acceptanceId:entry.plan.registrationAcceptanceId,schedulingKey:entry.schedulingKey,proposalHash:entry.prepared.proposalHash,expectedOrderUpdatedAt:entry.prepared.expectedOrderUpdatedAt},()=>schedulingWindowAllowed(s,c,entry));if(!receiptMatches(entry,r))throw Error('RECEIPT_REQUIRED');saved(s,c,entry,r);}
  catch{entry.status='UNCERTAIN';entry.nextReceiptAt=Date.now()+60000;put(s,row.key,entry);s.audit('OWN_SCHEDULING_COMMIT_UNCERTAIN',entry.confirmation.id,{schedulingKey:entry.schedulingKey,writeRetried:false});}processed++;
 }
 return {enabled:true,processed};
}
export function ownSchedulingStatus(s,c){const states={};for(const r of s.db.prepare('SELECT value FROM meta WHERE key LIKE ?').all(prefix+'%')){const e=s.open(r.value);if(e.guard===MARIA_OWN_SCHEDULING_GUARD&&['OFFERED','PENDING','SENDING','UNCERTAIN','SAVED','REVIEW'].includes(e.status))states[e.status]=(states[e.status]||0)+1;}return {...ownSchedulingAccessStatus(c),guard:MARIA_OWN_SCHEDULING_GUARD,states};}
