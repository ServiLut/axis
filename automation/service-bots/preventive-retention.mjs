import {createHash} from 'node:crypto';
import {BUSINESSES,knownInternalRecipient} from './config.mjs';
import {MARIA_COMPANY,MARIA_TENANT} from './maria-program.mjs';
import {bogotaDayWindow} from './daily-operational-audit.mjs';

export const PREVENTIVE_RETENTION_GUARD='own-60-90-bogota-days-crossed-contact-origin-and-delivery-before-note-v1';
export const PREVENTIVE_RETENTION_NOTE='Mensaje de seguimiento 2-3 meses enviado';
export const PREVENTIVE_RETENTION_AUTHORIZATION=Object.freeze({company:'fumigacion',channel:'whatsapp',
  source:'direct-user-20261010-fumigacion-preventive-retention-60-90-days',minimumDays:60,maximumDays:90});
const pn=/^57\d{10}$/,id=/^[A-Za-z0-9:_-]{1,160}$/;
const millis=v=>typeof v==='number'&&Number.isSafeInteger(v)?v:typeof v==='string'?Date.parse(v):NaN;
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const validId=v=>typeof v==='string'&&id.test(v);
const originLine=l=>BUSINESSES.fumigacion.phones.includes(l);
const calendarDay=t=>new Date(t).toLocaleDateString('sv-SE',{timeZone:'America/Bogota'});
const dayNumber=t=>Date.parse(calendarDay(t)+'T05:00:00Z')/86400000;
const consentMatches=a=>a?.company==='fumigacion'&&a.channel==='whatsapp'&&a.source===PREVENTIVE_RETENTION_AUTHORIZATION.source&&a.minimumDays===60&&a.maximumDays===90;
const exclusion=(phone,state,reason,extra={})=>({phone,state,reason,...extra});
const retentionKey=(phone,kind,anchorId)=>'preventive-retention-fumigacion-'+hash('fumigacion|'+phone+'|'+kind+'|'+anchorId).slice(0,40)+'-v1';

function checkedCoverage(coverage){
  const program=coverage?.program;
  if(program&&(program.company!=='FUMIGACION'||program.tenantId!==MARIA_TENANT||program.companyId!==MARIA_COMPANY))throw Error('RETENTION_OWN_PROGRAM_SCOPE_REQUIRED');
  const lines=coverage?.whatsapp?.lines??[];
  if(!Array.isArray(lines)||lines.some(l=>!originLine(l.line)))throw Error('RETENTION_OWN_WHATSAPP_LINES_REQUIRED');
  return {lines,complete:program?.contactHistoryComplete===true&&program?.futureBookingsComplete===true&&program?.noContactStatusComplete===true&&
    coverage?.whatsapp?.contactHistoryComplete===true&&BUSINESSES.fumigacion.phones.every(phone=>lines.filter(l=>l.line===phone).length===1&&lines.find(l=>l.line===phone).complete===true&&lines.find(l=>l.line===phone).suspended!==true)};
}

function completedAnchor(s,phone,now){
  const at=millis(s.completedAt);
  if(s.completedVerified!==true||s.company!=='FUMIGACION'||s.phone!==phone||!validId(s.orderId)||!validId(s.sourceId)||!Number.isFinite(at)||at>now)return null;
  return {kind:'completed-service',id:s.sourceId,orderId:s.orderId,at,line:s.originLine,originLineVerified:s.originLineVerified===true};
}
function bookingAnchor(s,phone,now){
  const at=millis(s.at);
  if(s.nativeBindingVerified!==true||s.phone!==phone||s.fromMe!==false||s.forwarded===true||!originLine(s.line)||!validId(s.sourceId)||!['booking-request','booking-confirmation','reschedule-request'].includes(s.kind)||!Number.isFinite(at)||at>now)return null;
  return {kind:'booking-interaction',id:s.sourceId,at,line:s.line,originLineVerified:true};
}
function verifiedName(contact){
  const name=contact.name;
  if(name?.verified!==true||name.phone!==contact.phone||!validId(name.sourceId)||typeof name.value!=='string')return null;
  const clean=name.value.trim().replace(/\s+/g,' ');
  return clean.length<=80&&/^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '-][A-Za-zÀ-ÖØ-öø-ÿ]+){0,5}$/.test(clean)?clean:null;
}
export function preventiveRetentionText(contact,{sourceAnchorKind,ageDays}={}){
  const name=verifiedName(contact),greeting=name?'Hola, '+name+'.':'Hola.';
  const months=Number.isInteger(ageDays)&&ageDays>=60&&ageDays<=90?Math.round(ageDays/30):null;
  const reference=months&&sourceAnchorKind==='completed-service'?' Han pasado aproximadamente '+months+' meses desde tu último servicio registrado.':months&&sourceAnchorKind==='booking-interaction'?' Han pasado aproximadamente '+months+' meses desde tu última consulta de agendamiento.':'';
  return greeting+reference+' Queremos ayudarte a mantener el control de plagas en tu espacio. ¿Te interesa coordinar un mantenimiento preventivo?';
}
function nativeRefusal(s,phone,now){
  return s?.nativeBindingVerified===true&&s.phone===phone&&s.fromMe===false&&s.forwarded!==true&&originLine(s.line)&&validId(s.sourceId)&&['refusal','do-not-contact'].includes(s.kind)&&Number.isFinite(millis(s.at))&&millis(s.at)<=now;
}

/** Preparation only. No model, WhatsApp, note or order operation is performed.
 * Cross-line and program coverage must belong to the same verified company.
 * Explicit authorization covers this WhatsApp contact; an old email campaign
 * is not a substitute for that authorization or a current no-contact check. */
export function planPreventiveRetention({company='fumigacion',day,now=Date.now(),coverage,contacts,history=[],authorization=PREVENTIVE_RETENTION_AUTHORIZATION}){
  if(company!=='fumigacion')throw Error('RETENTION_FUMIGACION_SCOPE_REQUIRED');
  if(!consentMatches(authorization))throw Error('OWN_WHATSAPP_RETENTION_AUTHORIZATION_REQUIRED');
  if(!Number.isFinite(now))throw Error('RETENTION_TIME_REQUIRED');
  bogotaDayWindow(day);if(day!==calendarDay(now))throw Error('RETENTION_CURRENT_BOGOTA_DAY_REQUIRED');
  if(!Array.isArray(contacts)||!Array.isArray(history))throw Error('RETENTION_OWN_CONTACT_EVIDENCE_REQUIRED');
  if(history.some(h=>h.company!=='fumigacion'))throw Error('RETENTION_OWN_ATTEMPT_HISTORY_REQUIRED');
  const crossed=checkedCoverage(coverage),byPhone=new Map(),conflicts=new Set(),prepared=[],deferred=[],excluded=[];
  for(const contact of contacts){
    if(typeof contact?.phone!=='string'||!pn.test(contact.phone)||knownInternalRecipient(contact.phone)){excluded.push(exclusion(null,'EXCLUDED','NON_CUSTOMER_OR_UNVERIFIED_PHONE'));continue;}
    const old=byPhone.get(contact.phone);
    if(old&&JSON.stringify(old)!==JSON.stringify(contact)){conflicts.add(contact.phone);continue;}byPhone.set(contact.phone,contact);
  }
  for(const contact of [...byPhone.values()].sort((a,b)=>a.phone.localeCompare(b.phone))){
    const phone=contact.phone;
    if(conflicts.has(phone)){deferred.push(exclusion(phone,'DEFERRED','CONFLICTING_CONTACT_SNAPSHOTS'));continue;}
    if(contact.identity?.bindingVerified!==true||contact.identity.phone!==phone||contact.identity.kind!=='PN'){deferred.push(exclusion(phone,'DEFERRED','NATIVE_PHONE_IDENTITY_UNVERIFIED'));continue;}
    if(contact.optOutGlobal===true||contact.doNotContact===true||(contact.rejections??[]).some(r=>nativeRefusal(r,phone,now))){excluded.push(exclusion(phone,'EXCLUDED','CURRENT_NO_CONTACT_OR_EXPLICIT_REFUSAL'));continue;}
    if((contact.rejections??[]).length&&(contact.rejections??[]).some(r=>!nativeRefusal(r,phone,now))){deferred.push(exclusion(phone,'DEFERRED','REFUSAL_SOURCE_REQUIRES_REVIEW'));continue;}
    if(contact.humanHold===true){deferred.push(exclusion(phone,'DEFERRED','HUMAN_ATTENTION_PRESERVED'));continue;}
    if(contact.activeCase===true||contact.pendingVisit===true||contact.pendingQuotation===true){deferred.push(exclusion(phone,'DEFERRED','CURRENT_CASE_IN_PROGRESS'));continue;}
    if(contact.contactHistoryComplete!==true||contact.futureBookingsComplete!==true||contact.noContactStatusComplete!==true){deferred.push(exclusion(phone,'DEFERRED','CONTACT_HISTORY_OR_CURRENT_STATUS_INCOMPLETE'));continue;}
    const future=contact.futureBookings??[];
    if(!Array.isArray(future))throw Error('RETENTION_FUTURE_BOOKINGS_ARRAY_REQUIRED');
    if(future.some(b=>b.phone!==phone||b.company!=='FUMIGACION'||b.scopeVerified!==true)){deferred.push(exclusion(phone,'DEFERRED','CURRENT_BOOKING_SOURCE_UNVERIFIED'));continue;}
    const knownStates=['NUEVO','PROGRAMADO','CONFIRMADO','ASIGNADO','EN_PROCESO','EN_CURSO','REALIZADO','FINALIZADO','COMPLETADO','CANCELADO','ANULADO','NEW','SCHEDULED','CONFIRMED','ASSIGNED','IN_PROGRESS','COMPLETED','FINISHED','CANCELLED','CANCELED'],cancelledStates=['CANCELADO','ANULADO','CANCELLED','CANCELED'];
    if(future.some(b=>!knownStates.includes(b.state)||!Number.isFinite(millis(b.scheduledAt))||typeof b.cancelled!=='boolean'||b.cancelled!==cancelledStates.includes(b.state))){deferred.push(exclusion(phone,'DEFERRED','BOOKING_STATE_OR_DATE_UNKNOWN'));continue;}
    // Any non-cancelled future order blocks reactivation, including NUEVO.
    if(future.some(b=>b.cancelled!==true&&millis(b.scheduledAt)>=now)){excluded.push(exclusion(phone,'EXCLUDED','FUTURE_BOOKING_EXISTS'));continue;}
    const completed=contact.completedServices??[],booking=contact.bookingInteractions??[];
    if(!Array.isArray(completed)||!Array.isArray(booking))throw Error('RETENTION_ANCHOR_ARRAYS_REQUIRED');
    // An unverified scheduling record may hide a more recent interaction.
    // Keep the contact for review rather than falling back to an older date.
    if(completed.some(s=>!completedAnchor(s,phone,now))||booking.some(s=>!bookingAnchor(s,phone,now))){deferred.push(exclusion(phone,'DEFERRED','SERVICE_OR_BOOKING_SOURCE_UNVERIFIED'));continue;}
    const anchors=[...completed.map(s=>completedAnchor(s,phone,now)),...booking.map(s=>bookingAnchor(s,phone,now))].filter(Boolean).sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
    const anchor=anchors[0];if(!anchor){deferred.push(exclusion(phone,'DEFERRED','VERIFIED_PREVIOUS_SERVICE_OR_BOOKING_REQUIRED'));continue;}
    const ageDays=Math.round(dayNumber(now)-dayNumber(anchor.at));
    if(ageDays<60||ageDays>90){excluded.push(exclusion(phone,'EXCLUDED',ageDays<60?'MORE_RECENT_SERVICE_OR_BOOKING':'OUTSIDE_60_90_DAY_WINDOW',{ageDays,sourceAnchorId:anchor.id}));continue;}
    if(!originLine(anchor.line)||anchor.originLineVerified!==true){deferred.push(exclusion(phone,'DEFERRED','ORIGIN_LINE_UNVERIFIED',{ageDays,sourceAnchorId:anchor.id}));continue;}
    const lineState=crossed.lines.find(l=>l.line===anchor.line);
    if(lineState?.suspended===true||lineState?.connected!==true){deferred.push(exclusion(phone,'DEFERRED','ORIGIN_LINE_UNAVAILABLE_NO_MIGRATION',{ageDays,line:anchor.line,sourceAnchorId:anchor.id}));continue;}
    if(!crossed.complete){deferred.push(exclusion(phone,'DEFERRED','BOTH_WHATSAPP_LINES_AND_PROGRAM_COVERAGE_REQUIRED',{ageDays,line:anchor.line,sourceAnchorId:anchor.id}));continue;}
    const dedupKey=retentionKey(phone,anchor.kind,anchor.id);
    const existing=history.filter(h=>h.company==='fumigacion'&&h.phone===phone&&(h.dedupKey===dedupKey||h.sourceAnchorId===anchor.id));
    if(existing.length){deferred.push(exclusion(phone,'DEFERRED','EXISTING_ATTEMPT_PRESERVED',{ageDays,line:anchor.line,sourceAnchorId:anchor.id,dedupKey,existingStates:[...new Set(existing.map(h=>h.state))]}));continue;}
    const text=preventiveRetentionText(contact,{sourceAnchorKind:anchor.kind,ageDays});
    prepared.push({guard:PREVENTIVE_RETENTION_GUARD,company:'fumigacion',phone,line:anchor.line,day,preparedAt:new Date(now).toISOString(),ageDays,sourceAnchorId:anchor.id,sourceAnchorKind:anchor.kind,sourceAnchorAt:new Date(anchor.at).toISOString(),dedupKey,text,textHash:hash(text),authorizationSource:authorization.source,noteText:PREVENTIVE_RETENTION_NOTE,noteEligible:false,requiresActualNativeDelivery:true,availabilityUsed:false,appointmentOrServicePromised:false,businessWrites:0,sends:0});
  }
  return {guard:PREVENTIVE_RETENTION_GUARD,company:'fumigacion',day,checkedAt:new Date(now).toISOString(),authorizationSource:authorization.source,window:{minimumDays:60,maximumDays:90,timeZone:'America/Bogota'},crossedCoverageComplete:crossed.complete,prepared,deferred,excluded,readOnly:true,sends:0,programNotesWritten:0,ordersCreated:0,paymentsWritten:0};
}

/** Returns an exact note proposal only after a native, matching delivery proof.
 * The caller still uses its own authenticated program adapter and durable
 * idempotency record; this function never performs the note write itself. */
export function preparePreventiveRetentionDeliveryNote(plan,proof,{now=Date.now(),noteHistory=[]}={}){
  const no=reason=>({eligible:false,reason,programNotesWritten:0,ordersCreated:0,paymentsWritten:0});
  if(plan?.guard!==PREVENTIVE_RETENTION_GUARD||plan.company!=='fumigacion'||!pn.test(plan.phone??'')||!originLine(plan.line)||!validId(plan.sourceAnchorId)||!['completed-service','booking-interaction'].includes(plan.sourceAnchorKind)||plan.dedupKey!==retentionKey(plan.phone,plan.sourceAnchorKind,plan.sourceAnchorId)||plan.authorizationSource!==PREVENTIVE_RETENTION_AUTHORIZATION.source||plan.textHash!==hash(plan.text??''))return no('OWN_RETENTION_PLAN_REQUIRED');
  if(!Number.isFinite(now)||!Array.isArray(noteHistory))return no('NOTE_TIME_OR_HISTORY_REQUIRED');
  if(noteHistory.some(h=>h.company!=='fumigacion'))return no('OWN_NOTE_ATTEMPT_HISTORY_REQUIRED');
  const deliveredAt=millis(proof?.deliveredAt),preparedAt=millis(plan.preparedAt);
  if(proof?.nativeVerified!==true||proof.fromMe!==true||proof.forwarded===true||!['DELIVERED','READ'].includes(proof.state)||proof.phone!==plan.phone||proof.line!==plan.line||proof.text!==plan.text||!validId(proof.mid)||!Number.isFinite(deliveredAt)||!Number.isFinite(preparedAt)||deliveredAt<preparedAt||deliveredAt>now)return no('EXACT_NATIVE_DELIVERY_REQUIRED');
  const dedupKey=plan.dedupKey+':program-note';
  if(noteHistory.some(h=>h.company==='fumigacion'&&(h.dedupKey===dedupKey||h.phone===plan.phone&&h.mid===proof.mid)))return no('EXISTING_NOTE_ATTEMPT_PRESERVED');
  return {eligible:true,company:'fumigacion',phone:plan.phone,line:plan.line,mid:proof.mid,text:PREVENTIVE_RETENTION_NOTE,deliveredAt:new Date(deliveredAt).toISOString(),sourceAnchorId:plan.sourceAnchorId,dedupKey,authorizationSource:plan.authorizationSource,operation:'append-contact-note-after-real-delivery',requiresOwnProgramAudit:true,programNotesWritten:0,ordersCreated:0,paymentsWritten:0};
}
