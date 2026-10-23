import {foreignLineSources,nativeTrialCustomerTurn} from './native-live-trial.mjs';
import { normalize, SANDRA, DIEGO, CURRENT_OPERATOR_ROUTING,TECHNICAL_COORDINATOR,publicTextSafe, internalRecipients,knownInternalRecipient,internalName,questionRecipients } from './config.mjs';
import {selectCommonAnswer,commonQuestionTopics,faqNeedsPersonalReview,faqTopicLabel} from './faq.mjs';
import {chiefStatusTopic,chiefStatusReply} from './chief-status.mjs';
import {chiefReadOnlyTopic,chiefReadOnlyReply} from './chief-readonly.mjs';
import {businessPriceHashAt,selectBusinessPrice} from './business-prices.mjs';
import {directedNonserviceTurn,unscopedInitialImageReply} from './directed-nonservice.mjs';
import {selectPrice,priceText,quotationInquiry,specialQuotation,currentPriceEntries} from './prices.mjs';
import {SERVICE_ACCESS_GUARD,SERVICE_ACCESS_STARTS_AT,serviceAccessOnlyTurn} from './service-access-details.mjs';
import {adviserReply} from './adviser-tone.mjs';
import {selectOfficeReceptionReply,saveOfficeReceptionReference} from './office-customer-replies.mjs';
import {sharedOfficeSelectedReply} from './shared-office-quick-replies.mjs';
import {literalIntakeTiming} from './intake-timing.mjs';
import {literalGreetingText,literalGreetingReplyProof} from './literal-reception.mjs';
import {CONVERSATIONAL_AI_GUARD,MIGUEL_CONVERSATIONAL_AI_GUARD,conversationalAiGuard} from './ai-settings.mjs';
import {ownIntent,mariaLiteralSlotAllowed} from './maria-understanding.mjs';
import {ownMiguelIntent,miguelLiteralSlotAllowed} from './miguel-understanding.mjs';
import {literalPaintingRequest} from './technical-scope.mjs';
import {afterServiceKind,afterServiceRequest,afterServiceDecision,explicitNewService,mariaLiteralServiceContext,literalOwnAfterServiceRequest,MARIA_LITERAL_SERVICE_CONTEXT_GUARD,mariaIncidentalPetMention} from './after-service.mjs';
import {programEnabled,registrationQuoteReady,registrationTurn,registrationRepeatAcknowledgement,acceptsOrdinaryQuotation,acceptsExplicitOrdinaryQuotation,acceptsOwnQuotedAmount,quotationAmountAffirmation,literalIntakeTextWithoutRegistrationFields,literalProgramPreference,calendarProgramPreferenceIssue,prepareRegisteredTesaContinuation,registeredTesaConfirmation,ownRegisteredReceiptForPresentation,ownSavedPendingOperation,queueOwnSavedServiceReview,ownQuoteOutboxId,ownDeliveredQuoteEntry,ordinaryDataInformationTurn,pendingOrdinaryDataInformationTurn,pendingMattressScopeFactsTurn,ordinaryProgramDeferralTurn,ownStaffPlanningReceipt,staffPlanningCustomerTurn} from './maria-program.mjs';
import {prepareMariaUnregisteredTesaPlan,mariaCaseQuoteCustomerTurn} from './maria-tesa-unregistered.mjs';
import {prepareOwnSchedulingPlan,ownSchedulingCustomerTurn} from './maria-own-order-scheduling.mjs';
import {createHash} from 'node:crypto';
import {tesaOperationalTopic} from './tesa-config.mjs';
import {prepareTesaQuestion,initializeTesaStore} from './tesa-operations.mjs';
import {formatMariaTesaQuestion} from './tesa-question-wording.mjs';
import {ownMariaChiefQuestionText,MARIA_CHIEF_QUESTION_WORDING_GUARD} from './chief-question-wording.mjs';
import {assertOperationalLineScope,operationalLineAllowed,operationalLineStartsAt} from './line-scope.mjs';
import {ownQuoteClarification,OWN_QUOTE_CLARIFICATION_GUARD} from './own-quote-clarification.mjs';
import {explicitNewTechnicalCase,technicalIntakeMetaQuestion,technicalIntakeClarificationReply,technicalIntakeLiteralCorrection} from './technical-intake-continuity.mjs';
import {literalIntakeDimensions,MARIA_DIMENSIONS_GUARD} from './intake-dimensions.mjs';
import {parseChiefCommand,enqueueChiefCommand} from './chief-actions.mjs';
import {mariaPendingReviewReply} from './maria-pending-review.mjs';
import {initializeWarrantyResponseEscalation,queueUnansweredWarrantyAlert} from './warranty-response-escalation.mjs';
import {explicitMariaAdviserRequest,queueMariaChiefCustomerAnswer,MARIA_ADVISER_HANDOFF_GUARD} from './maria-adviser-handoff.mjs';
import {literalMariaPartialLocation,literalMariaRoomCount,mariaMediaBurstContinuation,MARIA_BATCH_INTAKE_GUARD} from './maria-batch-intake.mjs';
import {customerDeferralRequested,customerDeferralReply,customerDeferralResumeEvidence,customerDeferralContinues,customerDeferralAcknowledgement,customerDeclinesAfterDeferral,CUSTOMER_DEFERRAL_GUARD} from './customer-deferral.mjs';
import {literalTermiteFurnitureScope,termiteFurnitureMention} from './maria-furniture-scope.mjs';
import {ownCommercialCustomerTurn,COMMERCIAL_OBJECTION_GUARD} from './commercial-objections.mjs';

export const MARIA_AUTONOMOUS_INTAKE_GUARD='literal-ordinary-intake-without-staff-delegation-v1';
export const MARIA_AFTER_SERVICE_CONTINUITY_GUARD='own-same-case-stored-or-quoted-postservice-context-and-priority-preservation-v2';
export const MARIA_STAGED_GREETING_GUARD='own-first-intake-includes-property-before-size-v2';
export const MARIA_SAVED_PENDING_CUSTOMER_GUARD='own-saved-pending-operation-direct-status-and-cancellation-request-v1';
export const MARIA_PENDING_CONVERSATION_GUARD='own-pending-question-does-not-silence-current-customer-v1';
export const MARIA_PEST_IDENTITY_GUARD='literal-pest-negation-and-contrast-before-generic-description-v2';
function genericPestDescription(value){return /^(?:plagas?|(?:control|tratamiento|manejo)(?: de)?(?: la| las)? plagas?|(?:servicio de )?(?:fumigacion|fumigar))$/.test(normalize(value));}
// Presentation only: decide whether to ask for a neighborhood alongside the
// missing pest. This never fills a slot, confirms a location, or gates a price.
function ordinaryNeighborhoodAlreadyProvided(state){
 const city=normalize(state.slots.location),parts=state.intakeLocationParts?.map(part=>part.text)||[state.slots.locationDetails];
 return parts.some(value=>{
  const text=normalize(value);if(!text||/[?¿]/.test(text)||/\b(?:no se|no recuerdo|desconozco|desconocid[oa]|sin confirmar|mismo barrio)\b/.test(text))return false;
  const residual=(city?text.split(city).join(' '):text).replace(/\b(?:en|el|la|los|las|del|de|municipio|ciudad|barrio|sector|vereda|urbanizacion|corregimiento|estoy|queda|ubicado|ubicada|es)\b/g,' ').replace(/[^\p{L}]+/gu,' ').trim();
  if(!residual)return false;
  if(/\b(?:barrio|sector|vereda|urbanizacion|corregimiento)\s+\p{L}/u.test(text))return true;
  // A municipality-only reply is not a neighborhood. A retained short native
  // location fragment may supply the latter; an entire intake message may not.
  return text.length<=120&&text.split(/\s+/).length<=8&&!/\d|\b(?:tengo|tiene|son|quiero|necesito|fumigar|fumigacion|plagas?|control|tratamiento|apartamento|casa|local|habitaciones?|metros?|cucarachas?|hormigas?|chinches?|roedores?|comejen|precio|cuesta|servicio)\b/.test(text);
 });
}
function missingPestReply(state){
 if(state.slots.location&&!ordinaryNeighborhoodAlreadyProvided(state))return 'Para cotizarte, me falta:\n1. Qué plaga deseas tratar o si buscas prevención.\n2. En qué barrio o vereda necesitas el servicio.';
 return '¿Qué plaga deseas tratar o buscas un servicio preventivo?';
}
function ownCaseAnchor(store,config,state,event){
 if(config.company!=='fumigacion'||!state.caseId?.startsWith('fumigacion:'))return null;
 const row=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(state.caseId.slice(11),event.phone,event.line);
 return row?store.open(row.body):null;
}
function ownDeliveredClarification(store,state,event,id,text){
 const own=store.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND internal=0 AND case_id=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(id,event.phone,event.line,state.caseId);
 const row=own&&store.db.prepare('SELECT value FROM meta WHERE key=?').get('first-delivery:'+own.id),proof=row&&store.open(row.value);
 return Boolean(own&&store.open(own.body)===text&&proof?.mid===own.mid&&proof.line===event.line&&['DELIVERED','READ'].includes(proof.state)&&Number.isSafeInteger(proof.verifiedAt)&&event.at>=Math.floor(proof.verifiedAt/1000)*1000);
}
function promptedBareBatchSize(store,config,state,event){
 if(config.company!=='fumigacion'||event.kind!=='text'||event.fromMe||event.forwarded||event.quotedId||state.programIntake||state.quotedPrice||state.slots.rooms||state.slots.area||state.pendingFaqQuestion||state.pendingTesaQuestionId||state.awaitingHumanReview||state.requestedAfterServiceReview||state.requestedProductInquiry||state.requestedControlReview||!state.slots.site||!state.slots.service||genericPestDescription(state.slots.service)||normalize(state.slots.service)==='chinches'||!state.asked?.includes('size'))return null;
 const lines=event.text.trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean),number=lines[0]?.match(/^([1-9]\d{0,2}|un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)[.! ]*$/iu)?.[1];
 if(!number||lines.length<2||lines.length>3||lines.slice(1).some(line=>!/^\p{L}[\p{L} .'-]{1,80}$/u.test(line)))return null;
 const place=lines.slice(1).join(' ');
 if(!ordinaryLiteralMunicipality(place)||/\b(?:no|si|quizas|dijo|dice|vecin[oa]|amig[oa]|nombre|servicio|plaga|habitaciones?|metros?|colchones?|manana|hoy|ayer)\b/.test(normalize(place)))return null;
 const promptId=state.lastHandledSourceId+':reply',row=store.db.prepare('SELECT body FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND internal=0').get(promptId,event.phone,event.line,state.caseId),text=row&&store.open(row.body);
 if(typeof text!=='string'||!/cuántas habitaciones o metros cuadrados/iu.test(text)||!ownDeliveredClarification(store,state,event,promptId,text))return null;
 // The number is never a room/mattress count or a computed surface. Asking
 // for the complete value plus unit gives the next turn its own literal proof.
 return {clarification:'¿Ese '+number+' corresponde a habitaciones o a metros cuadrados? Escríbeme la cantidad con su unidad, por ejemplo: «'+number+' habitaciones».',source:{sourceId:event.id,at:event.at,guard:MARIA_BATCH_INTAKE_GUARD,context:'own-delivered-batch-bare-size-unit-needs-clarification'}};
}
function rememberAdditionalLiteralFields(store,config,state,event){
 const caseSource=ownCaseAnchor(store,config,state,event);if(!caseSource)return;
  rememberFurnitureExclusion(store,config,state,event,caseSource);
 if(!state.programIntake&&normalize(state.slots.service)==='chinches'&&!state.slots.mattresses&&event.kind==='text'&&!event.fromMe&&!event.forwarded&&!event.quotedId&&/^(?:[1-9]\d?|un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)[.! ]*$/iu.test(event.text.trim())){
  const promptId=state.lastHandledSourceId+':reply',row=store.db.prepare('SELECT body FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND internal=0').get(promptId,event.phone,event.line,state.caseId),text=row&&store.open(row.body);
  if(typeof text==='string'&&/cuántos colchones/iu.test(text)&&ownDeliveredClarification(store,state,event,promptId,text))state.pendingMattressCountClarification={caseId:state.caseId,phone:event.phone,line:event.line,sourceId:event.id,at:event.at,literal:event.text.trim(),promptId,unitInferred:false};
 }
 const pest=state.pendingPestClarification;
 if(pest?.guard===MARIA_BATCH_INTAKE_GUARD&&pest.caseId===state.caseId&&pest.phone===event.phone&&pest.line===event.line&&state.pendingMediaBurst?.sourceIds?.includes(state.lastHandledSourceId)&&event.kind==='text'&&!event.forwarded&&!event.quotedId&&event.at>pest.at&&event.at-pest.at<=600000&&/^(?:s[ií]|correcto|exacto|as[ií] es)[.! ]*$/iu.test(event.text.trim())&&(!state.slots.service||genericPestDescription(state.slots.service))){
  const raw=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(pest.literalSourceId,event.phone,event.line);
  const native=raw&&store.open(raw.body);
  if(native?.kind==='text'&&!native.forwarded&&!native.quotedId&&native.at>=caseSource.at&&native.at<=pest.at&&/^comeje[.! ]*$/iu.test(native.text.trim())&&ownDeliveredClarification(store,state,event,pest.promptId,pest.text)){
   state.slots.service='comején';state.intakeSources={...state.intakeSources,service:{sourceId:event.id,at:event.at,guard:MARIA_BATCH_INTAKE_GUARD,context:'own-delivered-explicit-pest-clarification-two-native-sources',sources:[{sourceId:native.id,at:native.at},{sourceId:event.id,at:event.at}]}};
   delete state.pendingPestClarification;
  }
 }
 // A new textual answer consumes this clarification opportunity, including
 // a denial or correction. A later attachment cannot revive an old question.
 if(pest&&state.pendingPestClarification&&event.kind==='text'&&event.at>pest.at)delete state.pendingPestClarification;
 const location=literalMariaPartialLocation({company:config.company,state,event,caseSource});
 if(location&&!state.slots.location){
  const previous=state.intakeLocationParts||[],part={text:location.locationDetails,sourceId:event.id,at:event.at};
  const parts=[...previous.filter(p=>normalize(p.text)!==normalize(part.text)),part].slice(-3);
  state.intakeLocationParts=parts;state.slots.locationDetails=parts.map(p=>p.text).join(' | ');
  state.intakeSources={...state.intakeSources,locationDetails:{...location.source,sources:parts.map(({sourceId,at})=>({sourceId,at})),sourceCoverageComplete:true,municipalityInferred:false}};
 }
 const prior=state.pendingSizeClarification;
 if(prior?.numberText&&prior.sourceId===state.lastHandledSourceId&&event.kind==='text'&&!event.forwarded&&!event.quotedId&&event.at>prior.at&&event.at-prior.at<=600000&&/^(?:habitaciones?|alcobas?|cuartos?)[.! ]*$/.test(normalize(event.text))){
  const original=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(prior.sourceId,event.phone,event.line);
  const native=original&&store.open(original.body),confirmed=native&&literalMariaRoomCount({company:config.company,event:native,state,caseSource});
  if(ownDeliveredClarification(store,state,event,prior.sourceId+':reply',prior.text)&&confirmed?.clarification&&native.at===prior.at&&native.text.match(/\b([1-9]\d{0,2}|un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)[.! ]*$/iu)?.[1]===prior.numberText){
   state.slots.rooms=prior.numberText+' '+event.text.trim().replace(/[.! ]+$/,'');
   state.intakeSources={...state.intakeSources,rooms:{sourceId:event.id,at:event.at,guard:MARIA_BATCH_INTAKE_GUARD,context:'own-delivered-unit-clarification-two-native-fragments',sources:[{sourceId:native.id,at:native.at},{sourceId:event.id,at:event.at}],unitExpanded:false}};
   delete state.pendingSizeClarification;return;
  }
 }
 if(prior&&state.pendingSizeClarification&&event.kind==='text'&&event.id!==prior.sourceId&&event.at>prior.at)delete state.pendingSizeClarification;
 const rooms=literalMariaRoomCount({company:config.company,state,event,caseSource})||promptedBareBatchSize(store,config,state,event);
 if(rooms?.rooms){state.slots.rooms=rooms.rooms;state.intakeSources={...state.intakeSources,rooms:rooms.source};delete state.pendingSizeClarification;}
 else if(rooms?.clarification)state.pendingSizeClarification={...rooms.source,text:rooms.clarification,numberText:event.text.match(/\b([1-9]\d{0,2}|un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)[.! ]*$/iu)?.[1]};
}

function pendingCustomerReview(store,config,state,event,{pending=null}={}){
 if(config.company!=='fumigacion'||state.programIntake&&!state.requestedHumanAssistance||!state.caseId?.startsWith('fumigacion:')||store.conversation(event.phone)?.hold)return null;
 const first=store.db.prepare('SELECT rowid,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(state.caseId.slice(11),event.phone,event.line);
 const current=store.db.prepare('SELECT rowid,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(event.id,event.phone,event.line);
 if(!first||!current||current.rowid<first.rowid)return null;
 const actual=store.open(current.body);if(actual.text!==event.text||actual.at!==event.at||actual.kind!==event.kind||actual.forwarded!==event.forwarded)return null;
 if(!pending){
  const knownTopics=['service-followup','warranty-review','adviser-assistance','service-documents','disponibilidad-y-tecnico','cotizacion-verificada','special-quotation','existing-quotation'];
  const candidates=[...store.db.prepare("SELECT q.* FROM questions q JOIN outbox o ON o.id=q.outbox_id WHERE q.phone=? AND q.case_id=? AND o.line=? AND q.state IN ('PENDING','ANSWER_REVIEW') ORDER BY q.rowid DESC LIMIT 100").all(event.phone,state.caseId,event.line),...store.db.prepare("SELECT * FROM tesa_questions WHERE company='fumigacion' AND customer_phone=? AND case_id=? AND source_line=? AND state IN ('PENDING','ANSWER_REVIEW') ORDER BY rowid DESC LIMIT 100").all(event.phone,state.caseId,event.line)];
  const eligible=candidates.map(q=>({q,body:store.open(q.body)})).filter(({q,body})=>knownTopics.includes(q.topic)||q.topic==='revision:'+body.source&&state.requestedAfterServiceReview?.sourceId===body.source).map(candidate=>({...candidate,source:store.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(candidate.body.source,event.phone,event.line)})).filter(x=>x.source&&x.source.rowid>=first.rowid&&x.source.rowid<=current.rowid).sort((a,b)=>b.source.rowid-a.source.rowid);
  const selected=eligible.find(x=>x.q.id===state.pendingTesaQuestionId)||eligible[0];if(!selected)return null;
  const {q,body}=selected;
  const originalFollowup=state.requestedAfterServiceReview;
  const legacyFollowup=q.topic==='revision:'+body.source&&originalFollowup?.sourceId===body.source;
  pending={caseId:state.caseId,phone:event.phone,line:event.line,sourceId:body.source,topic:legacyFollowup?'service-followup':q.topic,state:q.state,caseKind:body.conditions?.kind||originalFollowup?.kind};
 }
 const sources=store.db.prepare('SELECT body FROM events WHERE phone=? AND line=? AND from_me=0 AND rowid>=? AND rowid<=? AND at<=? ORDER BY rowid DESC LIMIT 256').all(event.phone,event.line,first.rowid,current.rowid,event.at).reverse().map(r=>({...store.open(r.body),caseId:state.caseId}));
 const result=mariaPendingReviewReply({company:config.company,state,event,hold:false,sources,pending,lastReply:state.pendingReviewReply});
 if(result?.warrantyResponseDelay)queueUnansweredWarrantyAlert(store,config,state,event,result);
 return result;
}

// These exact whole-message requests are meaningful only after an independently
// verified own receipt and a still-pending operational consultation. They do not
// grant a general cancellation classifier, schedule, business write or replay.
function ownPendingCustomerKind(e){
 if(e.kind!=='text'||e.fromMe!==false||e.forwarded||e.quotedId||typeof e.text!=='string'||e.text.length>200||/["“”«»]|https?:|www\./i.test(e.text))return null;
 const t=normalize(e.text).replace(/^[¿¡\s]+|[?!.¡\s]+$/g,'').replace(/\s+/g,' ').trim();
 if(/^(?:y entonces|entonces|ya hay horario|ya tienen horario|ya hay una hora|cuando seria(?: el servicio)?|como va(?: mi solicitud| el servicio)?|que paso con(?: mi solicitud| el horario)|que horario(?: hay| tienen))$/.test(t))return 'status';
 if(/[¿?]/.test(e.text))return null;
 const service='(?:(?:el|mi|este|la|esta) )?(?:servicio|solicitud|fumigacion|visita)';
 return new RegExp('^(?:por favor )?(?:cancelalo|cancelelo|cancelenlo|(?:(?:quiero|necesito|solicito|deseo) cancelar|cancela|cancele|cancelen|cancelar) '+service+'|(?:ya )?no (?:quiero|necesito|deseo) '+service+')(?: por favor)?$').test(t)?'cancellation-request':null;
}
function ownSavedPendingCustomerTurn(s,c,state,e){
 const kind=ownPendingCustomerKind(e);if(!kind)return null;
 const own=ownSavedPendingOperation(s,c,state,e);if(!own)return null;
 const {entry}=own,key='maria-saved-cancellation-request:'+state.caseId+':'+entry.requestHash;
 const prior=s.db.prepare('SELECT value FROM meta WHERE key=?').get(key),existing=prior&&s.open(prior.value);
 const requested=existing?.guard===MARIA_SAVED_PENDING_CUSTOMER_GUARD&&existing.state==='REQUEST'&&existing.orderId===entry.receipt.orderId&&existing.receiptHash===entry.requestHash;
 if(kind==='cancellation-request'){
  // Keep each native source intact without issuing another equivalent alert
  // for the same still-pending case and immutable receipt.
  const marker=requested?existing:{guard:MARIA_SAVED_PENDING_CUSTOMER_GUARD,state:'REQUEST',caseId:state.caseId,phone:e.phone,line:e.line,orderId:entry.receipt.orderId,receiptHash:entry.requestHash,createdAt:Date.now(),sources:[]};
  if(!marker.sources.some(source=>source.id===e.id))marker.sources.push({id:e.id,text:e.text,at:e.at,phone:e.phone,line:e.line});
  const alert=queueOwnSavedServiceReview(s,c,entry,{motive:'cancellation-request',sourceId:marker.sources[0].id,text:'María Ángel · solicitud de cancelación. El cliente terminado en '+e.phone.slice(-4)+' pidió cancelar su servicio registrado, orden '+entry.receipt.orderId.slice(0,8).toUpperCase()+'. Precio registrado $'+entry.payload.quote.priceCop.toLocaleString('es-CO')+'. Solicitud literal: '+marker.sources[0].text+'. No he cancelado la orden ni modificado pagos. ¿Cómo debemos atender esta solicitud?'});
  if(alert?.id)marker.alertId=alert.id;
  s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,s.seal(marker));
  state.requestedProgramCancellationReview={guard:MARIA_SAVED_PENDING_CUSTOMER_GUARD,key,firstSourceId:marker.sources[0].id,orderId:entry.receipt.orderId,state:'REQUEST'};
  s.audit('OWN_SAVED_ORDER_CANCELLATION_REQUESTED',e.id,{guard:MARIA_SAVED_PENDING_CUSTOMER_GUARD,caseId:state.caseId,orderId:entry.receipt.orderId,firstSourceId:marker.sources[0].id,additionalSource:marker.sources.length>1,businessWritten:false,cancelled:false,humanHoldReleased:false});
 }else s.audit('OWN_SAVED_ORDER_PENDING_STATUS_ACKNOWLEDGED',e.id,{guard:MARIA_SAVED_PENDING_CUSTOMER_GUARD,caseId:state.caseId,orderId:entry.receipt.orderId,scheduled:false,newOperationalQuestion:false,businessWritten:false});
 const reply=kind==='cancellation-request'||requested?'Recibí tu solicitud de cancelación. Aún no tengo confirmada la cancelación; tu solicitud está pendiente de revisión.':'Aún no tengo confirmado el horario del servicio.';
 return {state,reply};
}

function rememberIntakeTiming(state,event,company){
 if(company!=='fumigacion'||state.programIntake||state.requestedAfterServiceReview||state.requestedProductInquiry||state.requestedControlReview||state.awaitingHumanReview)return null;
 const timing=literalIntakeTiming(company,event);if(!timing||timing.preference&&!mariaLiteralSlotAllowed('preference',timing.preference,event.text,event.at))return null;
 const key=timing.preference?'preference':'urgency';
 state.slots={...state.slots,[key]:timing[key]};
 state.intakeSources={...state.intakeSources,[key]:timing.source};
 return timing;
}

function ownCaseLiteralSources(store,config,state,event,sourceId=null){
 if(config.company!=='fumigacion'||!state.caseId?.startsWith(config.company+':'))return [];
 const first=store.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(state.caseId.slice(config.company.length+1),event.phone,event.line);
 const current=store.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(event.id,event.phone,event.line);
 if(!first||!current)return [];
 const rows=[];
 if(sourceId)rows.push(...store.db.prepare('SELECT rowid,id,at,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').all(sourceId,event.phone,event.line));
 else{
  let cursor=first.rowid-1;
  const pageQuery=store.db.prepare('SELECT rowid,id,at,body FROM events WHERE phone=? AND line=? AND from_me=0 AND rowid>? AND rowid<? ORDER BY rowid LIMIT 128');
  while(rows.length<=4096){
   const page=pageQuery.all(event.phone,event.line,cursor,current.rowid);if(!page.length)break;rows.push(...page);cursor=page.at(-1).rowid;if(page.length<128)break;
  }
  if(rows.length>4096){state.storedContextCoverageIncomplete={guard:MARIA_AFTER_SERVICE_CONTINUITY_GUARD,sourceId:event.id,firstSourceId:state.caseId.slice(config.company.length+1),maximumOwnRows:4096,observedOwnRows:rows.length,...(state.storedContextCoverageIncomplete?.notifiedSourceId?{notifiedSourceId:state.storedContextCoverageIncomplete.notifiedSourceId}:{})};rows.length=4096;}
 }
 const sources=[];
 for(const row of rows){
  if(row.rowid<first.rowid||row.rowid>current.rowid)continue;
  const source=store.open(row.body);
  if(source.id!==row.id||source.at!==row.at||source.phone!==event.phone||source.line!==event.line||source.fromMe!==false||source.forwarded||source.kind!=='text'||source.at<first.at||source.at>event.at||sourceId&&source.id!==sourceId)continue;
  sources.push(source);
 }
 return sources;
}
function ownCaseLiteralFollowup(store,config,state,event,sourceId=null){
 for(const source of ownCaseLiteralSources(store,config,state,event,sourceId)){
  const reference=literalOwnAfterServiceRequest(source);if(!reference)continue;
  const related=store.db.prepare('SELECT state,body FROM questions WHERE phone=? AND case_id=?').all(event.phone,state.caseId).filter(q=>store.open(q.body).source===source.id);
  if(related.length&&!related.some(q=>['PENDING','ANSWER_REVIEW'].includes(q.state)))continue;
  return {reference,source};
 }
 return null;
}
function ownCaseProductInquiry(store,config,state,event){return ownCaseLiteralSources(store,config,state,event).find(source=>mariaLiteralServiceContext(source)?.kind==='product-commercial-question')||null;}
function explicitServiceAfterProduct(text){const t=normalize(text);return !/[?¿"“”]/.test(text)&&!/\b(?:no|nunca|si|quizas|tal vez|en caso de)\b/.test(t)&&/^(?:quiero|necesito|requiero|deseo|busco) (?:fumigar|una fumigacion|un servicio de (?:fumigacion|control)|un control de plagas)\b/.test(t);}
function literalOwnNewService(source){return source.kind==='text'&&!source.fromMe&&!source.forwarded&&!/["“”]|\b(?:dijo|dice|segun|mi vecin[oa]|un tercero)\b/.test(normalize(source.text))&&explicitNewService(source.text)&&!afterServiceRequest(source);}

const groupField=value=>String(value??'').replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+/g,'[referencia reservada]').replace(/\b(?:57)?3\d{9}\b/g,'[teléfono reservado]').replace(/\b(?:calle|carrera|avenida|transversal|diagonal|cl|cra|cr|kr|av|trv|tv|dg)\.?\s*\d[^;\n]*|#\s*\d[^;\n]*/gi,'[dirección reservada]').replace(/\b\d{6,}\b/g,'[referencia reservada]').slice(0,130);
export function routeCaseQuestion(store,config,request){
  if(!config.tesaOperations?.enabled||!tesaOperationalTopic(request.topic,request.conditions)||questionRecipients(config,request.topic,request.conditions).every(phone=>phone===SANDRA)){
    const text=config.company==='fumigacion'?ownMariaChiefQuestionText(store,config,request,extractSlots):null;
    const result=store.questionToRecipients(text?{...request,text}:request);
    if(text&&result.created)store.audit('OWN_CHIEF_QUESTION_PRESENTED',request.source,{guard:MARIA_CHIEF_QUESTION_WORDING_GUARD,caseId:request.caseId,topic:request.topic,originalRequestText:request.text,sourceId:request.source,presentationOnly:true});
    return result;
  }
  const reference=createHash('sha256').update(config.company+':'+request.caseId).digest('hex').slice(0,12).replace(/[0-9]/g,d=>String.fromCharCode(65+Number(d)));
  const labels={service:'Servicio',location:'Municipio',locationDetails:'Ubicación indicada',site:'Inmueble',area:'Área',rooms:'Habitaciones',mattresses:'Colchones',detail:'Falla',preference:'Horario solicitado',question:'Petición literal',dimensions:'Dimensiones literales',roomScale:'Tamaño de habitaciones',siteScale:'Tamaño del inmueble',floors:'Pisos informados',patio:'Patio informado',treatmentScope:'Alcance informado'};
  const ownCase=store.conversation(request.phone)?.state,source=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND from_me=0').get(request.source,request.phone);
  let presentationStage=['cotizacion-verificada','special-quotation','existing-quotation'].includes(request.topic)?'quote-needed':request.conditions?.kind==='reported-existing-schedule'?'reported-existing-schedule':undefined;
  // Carry a saved receipt's identifiers only into this new operational
  // request. The program module independently validates scope, actor, hash,
  // receipt and current case before it can prepare customer continuity.
  if(config.company==='fumigacion'&&request.topic==='disponibilidad-y-tecnico'&&ownCase?.caseId===request.caseId&&ownCase.programIntake?.stage==='registered'){
    const entry=ownRegisteredReceiptForPresentation(store,config,request);
    if(entry?.status==='SAVED'&&entry.receipt?.orderId&&Number.isSafeInteger(entry.payload?.quote?.priceCop)){request={...request,conditions:{programServiceId:entry.receipt.orderId,quotedPriceCop:entry.payload.quote.priceCop,...request.conditions}};presentationStage='saved-awaiting-schedule';}
  }
  if(!presentationStage&&config.company==='fumigacion'&&request.topic==='disponibilidad-y-tecnico'&&ownCase?.caseId===request.caseId&&ownCase.quotedPrice?.accepted&&registrationQuoteReady(store,ownCase,request.phone,request.line))presentationStage='accepted-unregistered';
  const display={...(ownCase?.caseId===request.caseId?ownCase.slots:{}),...request.conditions};
  // Present only the literal location item of a numbered intake, without
  // changing its source, stored slots or quotation scope. The complete native
  // event remains available; pests and property have their own named fields.
  if(config.company==='fumigacion'&&typeof display.locationDetails==='string'){
    const numbered=/^1[.)]\s/.test(display.locationDetails.trim());
    const parts=display.locationDetails.split(numbered?/\r?\n|\s+(?=\d{1,2}[.)]\s)/:/\r?\n/).map(part=>part.trim().replace(/^\d{1,2}[.)]\s*/,''));
    const locations=parts.filter(part=>ordinaryLiteralMunicipality(part)===normalize(display.location));
    if(parts.length>1&&locations.length===1)display.locationDetails=locations[0];
  }
  if(!display.question&&source)display.question=store.open(source.body).text;
  const facts=Object.entries(display).filter(([key,value])=>labels[key]&&typeof value==='string').map(([key,value])=>labels[key]+': '+groupField(value)).join('; ').slice(0,700);
  const question=request.conditions?.kind==='technical-painting'?'¿Ofrecemos la pintura solicitada y qué alcance está disponible para este caso?':request.conditions?.kind==='reported-existing-schedule'?'¿Cuál es la programación verificada de esta visita?':['cotizacion-verificada','special-quotation','existing-quotation'].includes(request.topic)?'¿Qué cotización corresponde a este caso?':request.topic==='requested-technician-contact'?'¿Qué contacto del técnico está autorizado para este caso?':request.topic==='service-followup'?'¿Cuál es el estado de llegada de este servicio?':request.topic.startsWith('missing-intake:')?'¿Qué dato verificado falta para continuar este caso?':'¿Qué disponibilidad, ruta y técnico corresponden a este caso?';
  const contextFacts=Object.fromEntries(Object.entries(display).filter(([key,value])=>labels[key]&&typeof value==='string').map(([key,value])=>[key,groupField(value)]));
  const text=config.company==='fumigacion'?formatMariaTesaQuestion({bot:config.bot,name:config.name,reference,last4:request.phone.slice(-4),lineLast4:request.line.slice(-4),facts,contextFacts,topic:request.topic,conditions:request.conditions,presentationStage}):config.bot+' · '+config.name+'. Ref '+reference+'; cliente …'+request.phone.slice(-4)+'; línea …'+request.line.slice(-4)+'. '+(facts?facts+'. ':'')+question;
  const result=prepareTesaQuestion(store,config,{...request,text});
  if(config.company==='fumigacion'&&result.created===true&&!ownStaffPlanningReceipt(store,config,request)){prepareRegisteredTesaContinuation(store,config,request,result);prepareMariaUnregisteredTesaPlan(store,config,request,result);prepareOwnSchedulingPlan(store,config,request,result);}
  return result;
}

const externalLinks = text => String(text??'').match(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi)||[];
const textWithoutLinks = text => String(text??'').replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi,' ').replace(/\[\s*(?:plaga|empresa\s*\/\s*hogar|municipio|barrio|tipo de inmueble)\s*\]/gi,' ');
const unreadLinkOnly = text => externalLinks(text).length>0&&!textWithoutLinks(text).trim();

function directed(text,name) {
  const t=normalize(text), n=normalize(name);
  const aliases=n==='maria angel'?'maria angel|marian angel|mariangel':n;
  return new RegExp('^[¿¡ ]*(?:(?:hola|buenos dias|buenas tardes|buenas noches)[, :]+)?(?:'+aliases+'|bot)(?:[, :¿?!]|$)').test(t)&&!new RegExp('^(?:'+aliases+'|bot)\\s+(?:dijo|dice|respondio|comento|me dijo|le dijo)\\b').test(t);
}
function shortNameStatus(text,name){
  const short=normalize(name).split(' ')[0];
  const match=normalize(text).match(new RegExp('^[¿¡ ]*(?:(?:hola|buenos dias|buenas tardes|buenas noches)[, :]+)?'+short+'[, :¿?!]+(.+)$'));
  return match&&chiefStatusTopic(match[1])?match[1]:null;
}
function ordinaryLiteralMunicipality(text){
  const t=normalize(text),found=[];
  for(const clause of t.split(/[.!?;,]|\b(?:pero|sino)\b/)){
    for(const match of clause.matchAll(/\b(?:medellin|bello|envigado|itagui|sabaneta|la estrella|copacabana|girardota|rionegro|(?:santa fe|santafe) de antioquia|sopetran)\b/g)){
      const prefix=clause.slice(0,match.index),suffix=clause.slice(match.index+match[0].length);
      if(/\b(?:si|quizas|tal vez|posiblemente|en caso de|mi vecin[oa]|su vecin[oa]|un tercero|no se)\b(?:\s+\p{L}+){0,7}\s*$/u.test(prefix))continue;
      if(/\b(?:no|nunca|sin)\b(?:\s+\p{L}+){0,6}\s*$/u.test(prefix)||/^\s+no\b/.test(suffix))continue;
      found.push(match[0]);
    }
  }
  const distinct=[...new Set(found)];
  if(distinct.length!==1)return undefined;
  // Preserve the existing literal source of the two external municipalities.
  return /sopetran|antioquia/.test(distinct[0])?String(text).match(/\b(?:(?:santa\s+fe|santaf[eé])\s+de\s+antioquia|sopetr[aá]n)\b/i)?.[0]:distinct[0];
}
function coordinatedFurnitureExclusion(raw){
 if(/[?¿"“”«»]/.test(raw))return false;
 const clause=normalize(raw).trim().replace(/[.!;,\r\n]+$/g,'').trim();
 // A complete negative coordination only: a later positive, a question or an
 // uncertain/reporting prefix cannot be dropped to make this pattern fit.
 const item='(?:(?:los|las|el|la|un|una|unos|unas) )?(?:otr[oa]s? )?(?:camas?|bases?(?: de)? (?:la )?camas?|basecamas?|sofas?|muebles?)';
 return new RegExp('^(?:no (?:hay|tengo|tenemos|veo|vemos)|sin) '+item+'(?: ni '+item+'){1,5}(?: (?:afectad[oa]s?|con chinches?))?$').test(clause);
}
function literalAffectedFurniture(text){
  // Keep interrogative punctuation with its own clause: a question about an
  // exclusion is not the customer's statement that no extra furniture exists.
  const clauses=normalize(text).split(/(?<=[.!?;,\r\n])|\bpero\b/);
  for(const rawClause of clauses){if(coordinatedFurnitureExclusion(rawClause))continue;const clause=rawClause.trim().replace(/[.!?;,\r\n]+$/g,'');for(const match of clause.matchAll(/\b(?:bases?(?: de)? (?:la )?camas?|basecamas?|sofas?|muebles?)\b/g)){
    const before=clause.slice(0,match.index),after=clause.slice(match.index+match[0].length);
    // A stated exclusion is not extra affected furniture. Uncertainty ("no sé
    // si...") and scope/price questions remain unresolved furniture scope.
    const excludedBefore=/\b(?:sin|ningun[oa]?s?)\s+(?:chinches?\s+(?:en\s+)?)?(?:(?:la|las|el|los|un|una|unos|unas)\s+)?(?:otr[oa]s?\s+)?$/.test(before)||/\bno\s+(?:(?:hay|tengo|tenemos|tiene|tienen|presenta|presentan|veo|vemos|es|necesito tratar|quiero tratar|deseo tratar)\s+)?(?:chinches?\s+)?(?:(?:en|de)\s+)?(?:(?:la|las|el|los|un|una|unos|unas)\s+)?(?:otr[oa]s?\s+)?$/.test(before);
    const excludedAfter=/^\s+no\s+(?:tiene[n]?\s+chinches?|presenta[n]?\s+chinches?|est[a-z]*\s+afectad[oa]s?)(?:\b|$)/.test(after)||/^\s+no\s*$/.test(after);
    const uncertain=/[?¿"“”«»]/.test(rawClause)||/\b(?:si|cuando|en caso|quizas|tal vez|no se|segun|dijo|dice|dijeron|supongamos|podria|puede ser|no es cierto que|no dije que)\b/.test(clause)||excludedBefore&&/^\s+(?:sin|no|libres? de|que\s+(?:(?:aun|todavia)\s+)?no)\b/.test(after);
    if(uncertain||!excludedBefore&&!excludedAfter)return 'muebles mencionados; alcance por verificar';
  }}
}
const furnitureExclusionGuard='own-same-case-native-furniture-exclusion-for-question-wording-v1';
const furnitureSourceHash=source=>createHash('sha256').update(JSON.stringify([source.id,source.phone,source.line,source.at,source.kind,source.text,source.fromMe,Boolean(source.forwarded),source.quotedId??null])).digest('hex');
function explicitFurnitureExclusion(text){
 if(literalAffectedFurniture(text))return false;
 return normalize(text).split(/(?<=[.!?;,\r\n])/).some(raw=>{
  if(coordinatedFurnitureExclusion(raw))return true;
  if(/[?¿"“”«»]/.test(raw))return false;const clause=raw.trim().replace(/[.!;,]+$/g,'').trim();
  return /^(?:no (?:hay|tengo|tenemos|tiene|tienen|veo|vemos) (?:chinches en )?(?:(?:los|las|el|la) )?(?:otr[oa]s? )?muebles(?: (?:afectados|con chinches))?|sin (?:otr[oa]s? )?muebles(?: (?:afectados|con chinches))?|(?:(?:los|las) )?(?:otr[oa]s? )?muebles no (?:tienen|presentan) chinches)$/.test(clause);
 });
}
function rememberFurnitureExclusion(store,config,state,event,anchor){
 // This marker controls a repeated question only. It never clears furniture
 // scope, fills a pricing/DTO slot, or authorizes a quotation or registration.
 if(config.company!=='fumigacion'||event.fromMe!==false||!Number.isSafeInteger(event.at)||anchor.phone!==event.phone||anchor.line!==event.line||event.at<anchor.at)return;
 const marker=state.mattressFurnitureExclusion,service=extractSlots(event.text||'',config.company).service||state.slots.service;
 const relevant=/\b(?:bases?(?: de)? (?:la )?camas?|basecamas?|sofas?|muebles?)\b/.test(normalize(event.text));
 if(marker){
  if(marker.active!==true)return;
  const row=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(marker.sourceId,event.phone,event.line),original=row&&store.open(row.body);
  const bound=marker.guard===furnitureExclusionGuard&&marker.caseId===state.caseId&&marker.phone===event.phone&&marker.line===event.line&&marker.service==='chinches'&&original?.kind==='text'&&!original.fromMe&&!original.forwarded&&!original.quotedId&&original.at===marker.at&&original.at>=anchor.at&&original.at<=event.at&&furnitureSourceHash(original)===marker.sourceHash&&explicitFurnitureExclusion(original.text);
  const contradicted=normalize(service)!=='chinches'||event.kind!=='text'||relevant&&(Boolean(event.forwarded||event.quotedId)||Boolean(literalAffectedFurniture(event.text)));
  if(!bound||contradicted){state.mattressFurnitureExclusion={...marker,active:false,invalidatedBy:{sourceId:event.id,at:event.at,reason:!bound?'source-binding-unverified':'later-furniture-scope-unverified'}};return;}
  if(event.forwarded||event.quotedId)return;
  state.mattressFurnitureExclusion={...marker,checkedSourceId:event.id,checkedAt:event.at};return;
 }
 if(event.kind!=='text'||event.forwarded||event.quotedId||normalize(service)!=='chinches'||!explicitFurnitureExclusion(event.text))return;
 const row=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(event.id,event.phone,event.line),original=row&&store.open(row.body);
 if(!original||furnitureSourceHash(original)!==furnitureSourceHash(event))return;
 state.mattressFurnitureExclusion={guard:furnitureExclusionGuard,caseId:state.caseId,phone:event.phone,line:event.line,service:'chinches',sourceId:event.id,at:event.at,sourceHash:furnitureSourceHash(original),active:true,checkedSourceId:event.id,checkedAt:event.at};
}
function furnitureExclusionForPresentation(state,event){
 const marker=state.mattressFurnitureExclusion;
 return !event.forwarded&&!event.quotedId&&marker?.guard===furnitureExclusionGuard&&marker.active===true&&marker.caseId===state.caseId&&marker.phone===event.phone&&marker.line===event.line&&marker.checkedSourceId===event.id&&marker.checkedAt===event.at&&normalize(state.slots.service)==='chinches'&&!state.slots.affectedFurniture;
}
const ordinaryPestPatterns={cucarachas:/\bcucarachas?\b/,hormigas:/\bhormigas?\b/,ratones:/\b(?:raton|ratones)\b/,ratas:/\bratas?\b/,chinches:/\bchinches?\b/,comején:/\bcomejen(?:es)?\b/,avispas:/\bavispas?\b/,roedores:/\broedores?\b/,mosquitos:/\bmosquitos?\b/,pulgas:/\bpulgas?\b/,zancudos:/\b(?:zancudos?|sancudos?)\b/,'arañas':/\baranas?\b/,moscas:/\bmoscas?\b/,chiripas:/\bchiripas?\b/,prevencion:/\bprevencion\b/,fumigacion:/\bfumigacion\b/};
const ordinaryPropertyPatterns={'casa finca':/\bcasas?\s+fincas?\b/,finca:/\bfincas?\b/,apartamento:/\b(?:apartamentos?|aptos?)\b/,casa:/\bcasas?\b/,restaurante:/\brestaurantes?\b/,local:/\blocal(?:es)?\b/,oficina:/\boficinas?\b/,bodega:/\bbodegas?\b/,'cafetería':/\bcafeterias?\b/,'café':/^(?:(?:es|seria)\s+)?en\s+(?:(?:el|un|nuestro|mi)\s+)?cafe\b/};
const literalAreaPattern=/\b\d{1,5}(?:[.,]\d{1,2})?\s*(?:m(?:ts?)?\s*[2²]|m(?:ts?)?\.?\s*cuadrados?|metros?\s*cuadrados?)(?=$|[\s.,;:)])/iu;
const literalMattressPattern=/\b(?:\d{1,3}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+colch[oó](?:n|nes)\b/iu;
const literalRoomPattern=/\b(?:\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(?:habitaci[oó]n(?:es)?|cuartos?)\b/iu;
function affirmedIntakeMatches(text,pattern,{property=false}={}){
  const matches=[];
  // A decimal separator and the period in "mts. cuadrados" belong to the
  // literal measure, rather than ending a sentence or changing its value.
  const protectedText=String(text).replace(/\b(?:mts?|m)\.(?=\s*cuadrados?)/giu,match=>match.replace('.','\uE000'));
  for(const part of protectedText.split(/(?<!\d)[.,]|[.,](?!\d)|[!?;\r\n]|\b(?:pero|sino|si\s+no\s+que(?=\s+para\b))\b/iu)){
    const clause=part.replace(/\uE000/g,'.');
    const flags=pattern.flags.replace('g','');
    for(const match of clause.matchAll(new RegExp(pattern.source,flags+(flags.includes('i')?'':'i')+'g'))){
      const before=normalize(clause.slice(0,match.index))+' ',after=normalize(clause.slice(match.index+match[0].length));
      const negated=/\b(?:no|nunca|sin|ni)\s+(?:(?:son?|es|hay|tengo|tenemos|tienen?|veo|vemos|presentan?|quiero(?: tratar)?|necesito(?: tratar)?)\s+)?(?:(?:ni|un|una|unos|unas|el|la|los|las|en|de|del|para|muchos?|muchas?|ningunos?|ningunas?)\s+)*$/.test(before)||/^no$/.test(after);
      const uncertain=/^si\s+no\b/.test(normalize(clause))||/\b(?:si|quizas|tal vez|posiblemente|puede ser|podria ser|no se)\b(?:\s+\p{L}+){0,6}\s*$/u.test(before);
      // A reported visit at somebody else's property is context, not the
      // customer's current billable inmueble. Keep the original message.
      const foreignProperty=property&&/^(?:de (?:ella|el|ellos|ellas)|de (?:mi|la|una|su) (?:vecin[oa]|amig[oa]|conocid[oa]|mama|madre|papa|padre|herman[oa]))\b/.test(after);
      if(negated||uncertain||foreignProperty)continue;
      matches.push(match[0]);
    }
  }
  return matches;
}
function literalPropertyKinds(text){
  const t=normalize(text),sites=Object.keys(ordinaryPropertyPatterns).filter(site=>affirmedIntakeMatches(t,ordinaryPropertyPatterns[site],{property:true}).length);
  return sites.includes('casa finca')?['casa finca']:sites;
}
function literalQuoteFieldConflicts(text){
  const t=normalize(text),conflicts=[];
  // A range or alternative describes an unresolved quantity. Selecting its
  // first/last endpoint would invent the customer's billable scope.
  const number='(?:\\d{1,5}(?:[.,]\\d{1,2})?|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';
  const ranged=new RegExp('\\b'+number+'\\s*(?:(?:m(?:ts?)?\\s*[2²]|metros?\\s*cuadrados?)\\s*)?(?:o|a|y|[-–/])\\s*'+number+'\\s*(?:m(?:ts?)?\\s*[2²]|m(?:ts?)?\\.?\\s*cuadrados?|metros?\\s*cuadrados?|habitaciones?|cuartos?|colchones?)(?=$|[\\s.,;:)])','u');
  if(ranged.test(t)||/\bno se\b[^.!?;]{0,40}\b(?:cuant[oa]s?|miden?|medida|area|tamano)\b/.test(t))conflicts.push('area','rooms','mattresses','dimensions');
  const areas=affirmedIntakeMatches(text,literalAreaPattern);
  if(new Set(areas.map(normalize)).size>1)conflicts.push('area','rooms','dimensions');
  for(const [field,pattern]of [['area',literalAreaPattern],['rooms',literalRoomPattern],['mattresses',literalMattressPattern]])if(pattern.test(text)&&!affirmedIntakeMatches(text,pattern).length)conflicts.push(field,...(field==='area'||field==='rooms'?['area','rooms','dimensions']:[]));
  const sites=literalPropertyKinds(text);
  if(sites.length>1||!sites.length&&Object.values(ordinaryPropertyPatterns).some(pattern=>pattern.test(t)))conflicts.push('site');
  const services=Object.keys(ordinaryPestPatterns).filter(service=>affirmedIntakeMatches(t,ordinaryPestPatterns[service]).length);
  if(!services.length&&Object.values(ordinaryPestPatterns).some(pattern=>pattern.test(t)))conflicts.push('service');
  return [...new Set(conflicts)];
}
export function extractSlots(text,company) {
  if(company==='servicio-tecnico'&&technicalIntakeMetaQuestion(text))return {};
  text=textWithoutLinks(company==='fumigacion'?literalIntakeTextWithoutRegistrationFields(text):text);
  const t=normalize(text), slots={};
  const pests=ordinaryPestPatterns;
  const found=company==='fumigacion'?Object.keys(pests).filter(s=>affirmedIntakeMatches(t,pests[s]).length):['nevera','lavadora','secadora','estufa','horno','calentador','aire acondicionado'].filter(s=>t.includes(s)&&miguelLiteralSlotAllowed('service',s,text));
  const specific=company==='fumigacion'?found.filter(s=>!['prevencion','fumigacion'].includes(s)):found;
  slots.service=(specific.length?specific:found).join(' y ')||undefined;
  const city=company==='fumigacion'?ordinaryLiteralMunicipality(text):['medellin','bello','envigado','itagui','sabaneta','la estrella','copacabana','girardota','rionegro'].find(s=>new RegExp('\\b'+s+'\\b').test(t)&&miguelLiteralSlotAllowed('location',s,text));
  if(city)slots.location=city;
  if(company==='fumigacion'){
    // A locative answer names a café as the place. Coffee drinks or colors
    // alone do not identify an inmueble, and no restaurant type is inferred.
    const distinct=literalPropertyKinds(text);
    slots.site=distinct.length===1?distinct[0]:undefined;
  }
  if(company==='fumigacion'){
    // An explicit square exponent is required for mt/mts abbreviations. Keep
    // the literal source; bare metres remain ambiguous for automatic pricing.
    slots.area=affirmedIntakeMatches(text,literalAreaPattern)[0];
    slots.dimensions=literalIntakeDimensions(text)?.literal;
    slots.mattresses=affirmedIntakeMatches(text,literalMattressPattern)[0];
    slots.affectedFurniture=literalAffectedFurniture(text);
    slots.roomScale=/\b(?:habitaciones?|cuartos?|piezas?)\s*\(?\s*pequen[oa]s?\b/.test(t)?'pequeños':/\b(?:habitaciones?|cuartos?|piezas?)\s*\(?\s*grandes?\b/.test(t)?'grandes':undefined;
    slots.siteScale=/\b(?:apartamento|apto|casa|local)\s+pequen[oa]\b/.test(t)?'pequeño':/\b(?:apartamento|apto|casa|local)\s+grande\b/.test(t)?'grande':undefined;
    const floorPattern=/\b(?:\d{1,2}(?:er|ro|do|to)?|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:pisos?|niveles?)\b/iu;
    const floors=affirmedIntakeMatches(text,floorPattern),floorMentions=[...text.matchAll(new RegExp(floorPattern.source,'giu'))];
    // A literal written count must reach the consultation as written. Do not
    // select an endpoint from an alternative or treat a floor as an address.
    const floorRange=text.match(/\b(?:\d{1,2}|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(?:o|a|[-–/])\s*(?:\d{1,2}|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:pisos?|niveles?)\b/iu)?.[0];
    const uncertainFloor=floorMentions.length&&/\b(?:quizas|tal vez|posiblemente|no se|si fuera|si son)\b/.test(t);
    const floorSpan=floorMentions.length?text.slice(floorMentions[0].index,floorMentions.at(-1).index+floorMentions.at(-1)[0].length):'';
    // Preserve unresolved scope instead of erasing it and accidentally making
    // a multi-floor home eligible for the ordinary table. No endpoint of a
    // range is treated as a confirmed count.
    slots.floors=floorRange||new Set(floors.map(normalize)).size>1?floorRange||floorSpan:uncertainFloor?'Pisos por aclarar: '+text.trim():floors[0];
    slots.patio=/\b(?:no (?:tiene|hay|tenemos)|sin) patio\b/.test(t)?'sin patio':/\bpatio\b/.test(t)?'patio':undefined;
    slots.treatmentScope=/\b(?:solo|solamente)\s+(?:el )?interior\b/.test(t)?'solo interior':/\b(?:solo|solamente)\s+(?:en )?(?:la )?cocina\b/.test(t)?'solo cocina':undefined;
    slots.rooms=affirmedIntakeMatches(text,literalRoomPattern)[0];
    // Keep an explicit written count as the source said it. Do not normalize it
    // into a digit, choose a count from a range, or adopt a negated description.
    // "Piezas" describes rooms only with an explicit property in this text;
    // an equipment part or an unrelated count must not become the home's size.
    if(!slots.rooms&&slots.site)slots.rooms=text.match(/\b\d{1,3}\s*piezas?\b(?!\s+(?:de|del|para|repuestos?|motor|maquina)\b)/i)?.[0];
  }
  if(company==='fumigacion')for(const field of literalQuoteFieldConflicts(text))delete slots[field];
  return Object.fromEntries(Object.entries(slots).filter(([,v])=>v));
}
function literalFields(state,e,company){
  const fields=extractSlots(e.text,company);
  // A price followup naming the generic procedure does not replace the pest
  // already supplied in this case ("cuánto vale la fumigación").
  if(company==='fumigacion'&&genericPestDescription(fields.service)&&state.slots.service&&!genericPestDescription(state.slots.service)&&normalize(state.slots.service)!=='prevencion'&&quotationInquiry(e.text))delete fields.service;
  if(company==='fumigacion'&&fields.service&&state.slots.service&&/^(?:y|tambien|ademas)(?:\s+|[, :])/.test(normalize(e.text)))
    fields.service=[...new Set((state.slots.service+' y '+fields.service).split(' y '))].join(' y ');
  return fields;
}
function discardSupersededSizeDuplicate(state,previous,fields,conflicts=[]){
  const detail=previous.slots.detail,source=previous.intakeSources?.detail,current=state.intakeSources?.detail;
  if(!detail||!source?.sourceId||!Number.isSafeInteger(source.at)||state.slots.detail!==detail||current?.sourceId!==source.sourceId||current?.at!==source.at)return;
  for(const field of ['rooms','area','mattresses','dimensions']){
    const old=previous.slots[field],prior=previous.intakeSources?.[field];
    if(old!==detail||prior?.sourceId!==source.sourceId||prior?.at!==source.at)continue;
    if(!conflicts.includes(field)&&(!fields[field]||fields[field]===old))continue;
    // This exact same-source copy is obsolete, not a new technician finding.
    // Extra details and original native events remain unchanged.
    delete state.slots.detail;state.intakeSources={...state.intakeSources};delete state.intakeSources.detail;return;
  }
}
function rememberFields(state,e,company,fields=literalFields(state,e,company)){
  state.intakeSources={...state.intakeSources};
  if(company==='fumigacion'){
    const conflicts=literalQuoteFieldConflicts(e.text);
    discardSupersededSizeDuplicate(state,state,fields,conflicts);
    // A new contradictory quantity invalidates the old ordinary quote. Keep
    // all raw events; never turn the rejected endpoint into a field source.
    for(const field of conflicts){delete state.slots[field];delete state.intakeSources[field];}
    if(conflicts.length&&!state.programIntake)delete state.quotedPrice;
  }
  for(const [field,value]of Object.entries(fields)){
    const prior=state.intakeSources[field];
    if(company==='fumigacion'&&!state.programIntake&&['service','site','location','area','rooms','mattresses','affectedFurniture','floors','patio','treatmentScope'].includes(field)&&state.slots[field]&&state.slots[field]!==value)delete state.quotedPrice;
    const additive=company==='fumigacion'&&field==='service'&&/^(?:y|tambien|ademas)(?:\s+|[, :])/.test(normalize(e.text));
    const sources=additive?(prior?.sources|| (prior?.sourceId?[{sourceId:prior.sourceId,at:prior.at}]:[])):[];
    const all=[...sources,{sourceId:e.id,at:e.at}];
    state.slots[field]=value;
    state.intakeSources[field]={sourceId:e.id,at:e.at,...(field==='service'?{sources:[...new Map(all.map(s=>[s.sourceId,s])).values()]}:{})};
  }
}
export function parseUnderstanding(value,customerText,company='fumigacion',at=Date.now()) {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  customerText=textWithoutLinks(company==='fumigacion'?literalIntakeTextWithoutRegistrationFields(customerText):customerText);
  const fields=['service','location','site','detail','preference'];const result={};
  for(const key of fields) {
    const v=value.slots?.[key];
    // Extract only literal spans. An inferred price, schedule, diagnosis or instruction has no authority.
    if(typeof v==='string'&&v.length>=2&&v.length<=300&&!/[\[\]]/.test(v)&&normalize(customerText).includes(normalize(v))&&(company!=='fumigacion'||mariaLiteralSlotAllowed(key,v,customerText,at)))result[key]=v;
  }
  return result;
}
export function capabilitiesReply(config,phone,verifiedPrices=0) {
  const recipient=phone===SANDRA?'Doña Sandra':internalName(phone);
  if(programEnabled(config))return recipient+', soy '+config.bot+'. Puedo recibir y cotizar solicitudes ordinarias con la tabla aprobada y registrar el servicio aceptado a mi nombre cuando tenga los datos completos. Consulto al equipo por técnico, disponibilidad y hora. No registro pagos ni concedo garantías.';
  if(config.enabled&&config.company==='fumigacion'&&verifiedPrices)return recipient+', soy '+config.bot+'. Puedo recibir solicitudes, conservar lo que ya me indicaron y cotizar cuando el servicio coincide con una tarifa verificada. Los inmuebles especiales, horarios y técnicos necesitan confirmación. Todavía no creo servicios en el programa ni registro pagos.';
  if(config.enabled)return recipient+', soy '+config.bot+'. Puedo recibir solicitudes, preguntar los datos que faltan y guardar cada solicitud para revisión. La cotización, el horario y el técnico siguen pendientes de confirmación para cada caso. Todavía no creo servicios en el programa ni registro pagos.';
  return recipient+', por ahora soy '+config.bot+' y sigo en aprendizaje. Puedo revisar chats, guardar aclaraciones verificadas y consultar las confirmaciones con Sandra. Todavía no tengo consulta automática del programa y no atiendo clientes, confirmo horarios, creo servicios ni registro pagos.';
}
function questionExcerpt(text) {
  if(/\b(?:bearer|api[ _-]?key|token|contrase[nñ]a|clave|c[oó]digo de acceso)\b/i.test(text)||/\b\d{16,}\b/.test(text))return '[Contiene un dato reservado: revisar el mensaje original del mismo caso.]';
  return text.slice(0,350);
}
function serviceFollowup(text){return /\b(?:quedaron de venir|quedaron (?:en )?venir|a que hora (?:llega\w*|viene\w*)|(?:cuando|en cuanto tiempo) (?:llega\w*|viene\w*)|(?:no han|no ha|aun no han|todavia no han) (?:llegado|venido))\b/.test(normalize(text));}
function paymentInquiry(text){
  const t=normalize(text);
  if(/\b(?:fotos?|imagenes?|documentos?|datos|medidas|piezas)\b/.test(t))return false;
  return /\bcuanto(?: dinero)?\s+(?:(?:te|les?)\s+(?:mando|envio|pago|transfiero)|(?:debo|puedo|tengo que)\s+(?:enviar(?:te|les)?|mandar(?:te|les)?|pagar(?:te|les)?|transferir(?:te|les)?))\b/.test(t)||/\b(?:como (?:te|les?) (?:pago|transfiero)|a que cuenta (?:pago|transfiero|consigno))\b/.test(t);
}
function previousQuotation(text){return /\b(?:ya (?:lo |la )?cotiz[eo]|ya (?:me )?cotizaron|ya tengo (?:la |una )?cotizacion|me cotizaron (?:este|el|ese) servicio)\b/.test(normalize(text));}
const QUOTATION_VALIDITY_GUARD='own-native-same-case-quotation-validity-reference-without-price-or-acceptance-v1';
function quotationValidityRequest(text){
  const t=normalize(textWithoutLinks(text));
  if(/\b(?:no|nunca)\s+(?:tengo|recibi|he recibido|me enviaron|me hicieron|me cotizaron)\b[^.!?;]{0,45}\bcotizacion\b/.test(t))return false;
  if(/\b(?:necesito|quiero|solicito|enviame|me envias)\b[^.!?;]{0,40}\b(?:una|nueva) cotizacion\b/.test(t)&&!/\b(?:anterior|previa|aun|todavia|sigue|vigencia|validez)\b/.test(t))return false;
  return /\bcotizacion\b[^.!?;]{0,120}\b(?:vigente|vigencia|validez|vencida|vencio)\b|\b(?:vigente|vigencia|validez|vencida|vencio)\b[^.!?;]{0,120}\bcotizacion\b/.test(t);
}
function quotationValidityContinuation(text){
  const t=normalize(text).replace(/[^\p{L} ]/gu,' ').replace(/\s+/g,' ').trim(),words=t.split(' ');
  const allowed=new Set('es era seria para confirmar saber consultar mirar verificar averiguar preguntar conocer si aun todavia sigue esta vigente vigencia validez o ya no entonces gracias por favor queria quiero necesito saberlo'.split(' '));
  return /^(?:si|correcto|eso|exacto)$/.test(t)||/\b(?:vigente|vigencia|validez)\b/.test(t)&&words.every(word=>allowed.has(word));
}
function mariaQuotationValidityTurn(state,event,verifiedOwnEntry=null){
  if(event.kind!=='text'||event.fromMe||event.forwarded||event.quotedId||contextNeedsPersonalPriority(event.text,event)||explicitNewService(event.text))return null;
  const current=quotationValidityRequest(event.text),prior=state.requestedQuotationValidity;
  // Provider timestamps have second granularity. The retained handled-source
  // order plus a distinct, unseen ID permits an equal-second acknowledgement;
  // it grants no price, acceptance, booking or replay authority.
  const same=prior?.guard===QUOTATION_VALIDITY_GUARD&&prior.caseId===state.caseId&&prior.phone===event.phone&&prior.line===event.line&&state.lastHandledSourceId===prior.lastSourceId&&event.id!==prior.sourceId&&event.id!==prior.lastSourceId&&!prior.sourceIds?.includes(event.id)&&Number.isSafeInteger(prior.at)&&Number.isSafeInteger(prior.lastAt)&&event.at>=prior.lastAt&&event.at-prior.at<=86400000;
  const continuation=same&&quotationValidityContinuation(event.text);
  const reference=same&&!current&&!continuation&&!isCustomerQuestion(event.text)&&!explicitNewService(event.text)&&event.text.length<=120&&(/\b(?:cotizacion|referencia|codigo|numero)\s*[:#-]?\s*[a-z0-9-]{3,40}\b/i.test(normalize(event.text))||/^\s*[a-z]{0,8}[-#]?\d{3,8}[a-z0-9-]{0,16}\s*$/i.test(event.text));
  if(!current&&!continuation&&!reference)return null;
  const bound=typeof state.caseId==='string'&&state.caseId.startsWith('fumigacion:')&&/^[A-Za-z0-9_-]{8,100}$/.test(event.id||'')&&/^57\d{10}$/.test(event.phone||'')&&/^57\d{10}$/.test(event.line||'')&&Number.isSafeInteger(event.at);
  const marker=bound?{...(same?prior:{guard:QUOTATION_VALIDITY_GUARD,caseId:state.caseId,phone:event.phone,line:event.line,sourceId:event.id,at:event.at}),lastSourceId:event.id,lastAt:event.at,sourceIds:[...(same?prior.sourceIds||[prior.sourceId]:[]),event.id].slice(-64),...(reference?{referenceSourceId:event.id}:{})}:null;
  const next={...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:event.text,...(marker?{requestedQuotationValidity:marker}:{})};
  const reply=verifiedOwnEntry?'Conservo la cotización que te envié en este chat por $'+verifiedOwnEntry.priceCop.toLocaleString('es-CO')+' COP. Su vigencia para este caso aún necesita confirmación.':reference?'Recibí la referencia de la cotización. Aún falta confirmar su vigencia para tu caso.':'Entiendo que quieres saber si tu cotización sigue vigente. ¿Me compartes el número de la cotización o una captura donde se vea el valor y el servicio cotizado?';
  return {state:next,quotationValidity:true,literalServiceContext:true,specificCustomerQuestionReply:reply,reply,...(reference||verifiedOwnEntry?{reviewTopic:'existing-quotation',reviewConditions:{kind:'quotation-validity',sourceId:marker?.sourceId||event.id,...(reference?{referenceSourceId:event.id}:{}),ownQuoteVerified:Boolean(verifiedOwnEntry)},review:'La persona pide confirmar la vigencia de una cotización anterior. La referencia o el precio propio entregado no prueban vigencia, nueva aceptación, reserva ni programación.',reviewQuestion:'¿Sigue vigente esa cotización para este mismo caso y con qué alcance comprobado?'}:{})};
}
function ownQuotationValidityEntry(store,state,event){
  const quote=state.quotedPrice;
  if(!quote||!state.caseId?.startsWith('fumigacion:'))return null;
  return ownDeliveredQuoteEntry(store,state,event.phone,event.line)?.entry||null;
}
function mattressRoomScopeQuestion(state,event){
  if(event.kind!=='text'||event.fromMe||event.forwarded||state.requestedAfterServiceReview||state.requestedControlReview||contextNeedsPersonalPriority(event.text,event))return false;
  const t=normalize(textWithoutLinks(event.text));
  return normalize(state.slots?.service).includes('chinches')&&/\bcolch(?:on|ones)\b/.test(t)&&/\bhabitacion(?:es)?\b/.test(t)&&/\b(?:solo|solamente|tambien|toda|incluye|cub[ar]\w*|hacen|tratan|aplican|aplica)\b/.test(t)&&isCustomerQuestion(event.text);
}
const MATTRESS_ROOM_SCOPE_REPLY='Quieres saber si el servicio cubre solo el colchón o también la habitación. Ese alcance aún debe confirmarse para tu caso.';
function acceptedMattressAdditionalScopeQuestion(state,event){
 if(event.kind!=='text'||event.fromMe||event.forwarded||event.quotedId||!state.quotedPrice?.accepted||!['name','address','details','confirm','correction'].includes(state.programIntake?.stage)||normalize(state.slots?.service)!=='chinches'||contextNeedsPersonalPriority(event.text,event))return false;
 const t=normalize(event.text);
 return /\b(?:muebles?|toma\s*corrientes?|enchufes?|bases? de cama)\b/.test(t)&&/\b(?:cuanto (?:cuesta|vale|cobran)|que incluye|incluye|tambien (?:tratan|hacen|fumigan)|cubre)\b/.test(t)&&!/["“”«»]|https?:|\b(?:dijo|dice|segun|vecin[oa]|tercero)\b/.test(t);
}
function postServiceDocuments(text){
  const t=normalize(textWithoutLinks(text));
  if(!/\b(?:documentos?|soportes?|fichas de seguridad|certificados?|permisos?|arl)\b/.test(t))return false;
  if(!/\b(?:solicitar|solicito|solicitando|necesito|requiero|requiriendo|requiere|requeridos|enviar|enviarme|entregar|pedir)\b/.test(t))return false;
  const prior=/\b(?:(?:posterior(?:es)?|despues|tras) (?:a |de |del |la |el )*(?:prestacion del servicio|servicio|fumigacion|reparacion|visita)|(?:me|nos) (?:hicieron|realizaron|prestaron|aplicaron) (?:una |la |el |un )?(?:fumigacion|tratamiento|servicio|reparacion)|(?:me|nos) fumigaron|(?:servicio|reparacion|fumigacion|visita) realizad[oa])\b/;
  if(/\b(?:no|nunca) (?:me|nos) (?:hicieron|realizaron|prestaron|aplicaron|fumigaron)\b/.test(t))return false;
  return prior.test(t);
}
function postServiceReturn(text){
  const t=normalize(textWithoutLinks(text));
  if(/\b(?:no|nunca) (?:(?:me|nos) )?(?:hicieron|realizaron|aplicaron|fumigaron)\b/.test(t))return false;
  const treatment='(?:fumigacion|tratamiento|control de plagas)';
  const direct=new RegExp('\\b(?:me|nos) (?:hicieron|realizaron|aplicaron) (?:una |la |el |un )?'+treatment+'\\b').test(t)||/\b(?:me|nos) fumigaron\b/.test(t);
  const ownPlace=new RegExp('\\b(?:hicieron|realizaron|aplicaron) (?:una |la |el |un )?'+treatment+'\\b[^.!?]*\\b(?:mi|nuestro|nuestra) (?:apto|apartamento|casa|vivienda|negocio|local)\\b').test(t);
  const problem=/\b(?:otra vez|nuevamente|de nuevo|volvieron|vuelven|siguen)\b/.test(t)||/\b(?:salen|salieron|aparecen|aparecieron|hay|tengo|tenemos)\s+mas\b/.test(t);
  return (direct||ownPlace)&&problem&&/\b(?:aparec\w*|chinches?|cucarachas?|hormigas?|pulgas?|ratas?|ratones|plagas?)\b/.test(t);
}
function plannedRevisit(text){
  const t=normalize(textWithoutLinks(text));
  // A reported prior visit plus a requested return is a followup, even without
  // recurrent pests or question marks. It does not establish a saved service,
  // an approved recommendation, availability, a technician or a price.
  const prior='(?:(?:me|nos) (?:hicieron|realizaron|aplicaron) (?:una |la |el |un )?(?:fumigacion|tratamiento)|(?:me|nos) visito (?:el |un )?tecnic[oa] de fumigacion)';
  if(new RegExp('\\b(?:no|nunca) '+prior+'\\b').test(t))return false;
  return new RegExp('\\b'+prior+'\\b').test(t)&&/\b(?:nueva|otra|segunda|proxima) visita\b|\brevisita\b/.test(t)&&/\b(?:agend\w*|program\w*|confirm\w*|necesito|quiero)\b/.test(t);
}
function requestedControl(text){
  const t=normalize(textWithoutLinks(text));
  if(/\b(?:no|nunca) (?:necesito |quiero |solicito )?(?:una )?visita de control\b|\b(?:nuevo servicio|otra solicitud|fumigacion nueva)\b/.test(t))return false;
  return /\bvisita de control\b|\bcontrol (?:de|a los) \d{1,3} dias?\b/.test(t);
}
function requestedTechnicalContact(text){
  const t=normalize(text);
  return /\b(?:numero|telefono|celular|whatsapp|contacto)\s+(?:de(?:l| la)?\s+)?(?:tecnic[oa]|fumigador[ae]?)\b/.test(t)&&
    /\b(?:podrias?|podrian|puedes?|pueden|compartir|compartes|comparte|comparteme|pasar|pasas|pasa|pasame|enviar|envias|envia|enviame|dame|darme|necesito|quiero|quisiera|cual (?:es|seria))\b/.test(t);
}
function isCustomerQuestion(text){text=textWithoutLinks(text);return /[?¿]/.test(text)||postServiceDocuments(text)||serviceFollowup(text)||paymentInquiry(text)||previousQuotation(text)||postServiceReturn(text)||plannedRevisit(text)||requestedTechnicalContact(text)||commonQuestionTopics(text).length>0||/\b(?:cuanto (?:cuesta|vale|cobran|dura)|cual es (?:el|la)|como funciona|que incluye|me puedes (?:decir|confirmar)|pueden (?:venir|atender)|a que horas? (?:me |nos )?(?:puedes|pueden|podrias) (?:colaborar|atender|ayudar|venir))\b/.test(normalize(text));}
function ordinaryAvailabilityRequest(text){
  const t=normalize(textWithoutLinks(text));
  return !faqNeedsPersonalReview(text)&&!commonQuestionTopics(text).length&&!paymentInquiry(text)&&!previousQuotation(text)&&!serviceFollowup(text)&&!postServiceReturn(text)&&!plannedRevisit(text)&&!afterServiceKind(text)&&
    /\b(?:pueden (?:venir|atender|fumigar)|tienen disponibilidad|(?:puedo|quiero|quisiera|necesito) (?:agendar|programar)|a que hora (?:pueden|podrian) (?:venir|atender|fumigar))\b/.test(t);
}
function customerCourtesy(text){
  const value=normalize(text).replace(/\s+/g,' ');
  if(/^muy amable[.! ]*$/.test(value))return true;
  if(/[?¿\d]/.test(value)||!/^(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,.! ]+)?(?:(?:muchas|muchisimas|mil)\s+)?gracias\b/.test(value))return false;
  // Only affirmative gratitude vocabulary qualifies. A request, complaint, uncertainty,
  // payment or safety concern must continue through the ordinary review/intake path.
  const words=value.replace(/[^\p{L} ]/gu,' ').split(/\s+/).filter(Boolean);
  const permitted=new Set('hola buenos buen buenas dia dias tardes noches muchas muchisimas mil gracias por el la los las su tu sus tus servicio servicios de fumigacion control plagas atencion ayuda excelente amable muy bueno buena todo toda todos todas personal empresa equipo dios bendiga bendiciones a y al les nos ustedes recibido recibida'.split(' '));
  return words.every(word=>permitted.has(word));
}
function ambiguousIntake(text){return /\b(?:casa o apartamento|apartamento o casa|si (?:es|fuera)|es para una? (?:casa|apartamento))\b/.test(normalize(text))&&isCustomerQuestion(text);}
function literalIntakeTurn(e,company='fumigacion'){
  const text=normalize(textWithoutLinks(e.text));
  const facts=/\b(?:tengo|mi (?:casa|apartamento)|son \d+|mide)\b/.test(text)||/^(?:hola[, ]+)?es una? (?:casa|apartamento)\b/.test(text);
  return e.kind==='text'&&!e.forwarded&&!(company==='fumigacion'&&mariaLiteralServiceContext(e))&&!unreadLinkOnly(e.text)&&!customerCourtesy(e.text)&&!ambiguousIntake(e.text)&&!afterServiceKind(e.text)&&(!isCustomerQuestion(e.text)||quotationInquiry(e.text)||facts)&&!postServiceDocuments(e.text)&&!serviceFollowup(e.text)&&!postServiceReturn(e.text)&&!plannedRevisit(e.text)&&!paymentInquiry(e.text)&&!previousQuotation(e.text)&&!requestedTechnicalContact(e.text)&&!/\b(?:antes|anterior|cancel\w*|reprogram\w*|reclamo|queja|garantia|pague|pago|abono|comprobante|me dijeron|me dijo|otra solicitud|otro servicio|nuevo servicio|otro equipo)\b/.test(text);
}
function contextNeedsPersonalPriority(text,event=null){
 const incidental=event?.text===text&&mariaIncidentalPetMention(event);
 const t=normalize(incidental?.classificationText??text);
 return faqNeedsPersonalReview(text)||paymentInquiry(text)||/\b(?:cancel|reprogram|reclamo|queja|devolucion|amenaz|abogad|denuncia|dolor|intoxic|embaraz|mascota|bebe|niño|nino|pague|pago|comprobante|transfer|consign|abono)\w*/.test(t);
}
function mariaLiteralContextDecision(state,e,context){
 const preserved={...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)};
 const conditions={kind:context.kind,directCustomerReport:true,guard:context.guard};
 if(context.kind==='context-reference')return {state:preserved,observed:true,observedState:'OBSERVED_NONASSERTED_SERVICE_CONTEXT'};
 if(context.kind==='supplier-offer')return directed(e.text,'María Ángel')?{state:preserved,courtesy:true,reply:'Gracias por compartir tu propuesta.'}:{state:preserved,observed:true,observedState:'OBSERVED_SUPPLIER_OFFER'};
 if(context.kind==='documents-request')return {state:preserved,reviewTopic:'service-documents',reviewConditions:conditions,review:'La persona solicita documentos o informa que no los recibió. Su mensaje no acredita prestación del servicio, existencia, emisión, autorización ni entrega de esos documentos; hay que contrastar el antecedente y los soportes autorizados del mismo caso.',reviewQuestion:'¿Qué solicitud y documentos autorizados comprobados corresponden a este caso?',reply:'Con gusto. Revisaremos tu solicitud de documentos.'};
 if(context.kind==='existing-quotation-reference')return {state:preserved,reviewTopic:'existing-quotation',reviewConditions:conditions,review:'La persona hace referencia a una cotización anterior o a un añadido para esa misma solicitud. No consta aquí su precio, alcance, aceptación ni reserva; hace falta contrastar la cotización propia del mismo caso.',reviewQuestion:'¿Qué cotización previa y alcance adicional verificados corresponden al mismo caso?',reply:'Conservé tu referencia a la cotización anterior. Necesitamos verificar su alcance para continuar.'};
 if(context.kind==='product-commercial-question')preserved.requestedProductInquiry={sourceId:e.id,at:e.at,question:e.text.slice(0,300)};
 if(context.kind==='arrival')return {state:preserved,reviewTopic:'service-followup',reviewConditions:conditions,review:'La persona informa que está esperando la llegada. Hace falta contrastar el antecedente y comprobar el estado actual; no consta una hora de llegada verificada.',reviewQuestion:'¿Cuál es el estado comprobado de esta visita y la hora de llegada?',reply:'Entiendo que estás esperando la visita. Aún no tengo una hora de llegada confirmada.'};
 if(context.kind==='reported-existing-schedule')return {state:preserved,reviewTopic:'disponibilidad-y-tecnico',reviewConditions:conditions,review:'La persona relata que ya la agendaron. Su mensaje no acredita registro, horario, técnico ni ejecución; hay que comprobar la programación del mismo caso sin abrir otra cotización o reserva.',reviewQuestion:'¿Qué programación, horario y técnico comprobados corresponden a esta visita?',reply:'Entiendo que ya te indicaron una programación. Revisaremos los datos de esa visita.'};
 if(context.kind==='supplier-decision')return {state:preserved,reviewTopic:'supplier-offer',reviewConditions:conditions,review:'La persona presenta una propuesta comercial y pide una decisión explícita. No consta aceptación, acuerdo, compra ni autorización; hace falta revisar la propuesta en su propio ámbito.',reviewQuestion:'¿Qué respuesta autorizada corresponde a esta propuesta comercial?',reply:'Gracias por compartir tu propuesta. Su aceptación aún necesita revisión.'};
 return {state:preserved,reviewTopic:'customer-question',reviewConditions:conditions,review:context.kind==='documents-capability'?'La persona pregunta por los documentos que podemos entregar. No relata ni acredita un servicio previo; hace falta una respuesta institucional comprobada.':'La persona consulta compra o venta de productos. No está solicitando una fumigación; hace falta comprobar si ese producto se comercializa y cuál es la respuesta autorizada, sin adoptar catálogos, precios ni recomendaciones del remitente.',reviewQuestion:'¿Qué respuesta propia verificada corresponde a esta consulta?',reply:context.kind==='documents-capability'?'Con gusto. Revisaremos qué documentos podemos entregarte.':'Recibí tu consulta sobre el producto. Falta confirmar si lo comercializamos.'};
}
function promptedSize(e,state){
  return literalIntakeTurn(e)&&(state.asked?.includes('size')||state.initialIntakeAllRequested)?textWithoutLinks(e.text).match(/\b\d{1,5}(?:[.,]\d{1,2})?\s*metros?(?=[.! ,;]*$)/i)?.[0]:undefined;
}
function retainPromptedLocation(state,e){
  if(!literalIntakeTurn(e)||!(state.asked?.includes('location')||state.initialIntakeAllRequested||state.slots.location||extractSlots(e.text,'fumigacion').location))return;
  const text=textWithoutLinks(literalIntakeTextWithoutRegistrationFields(e.text)).trim(),t=normalize(text);
  if(!text||text.length>240||/^(?:no|quizas|tal vez|posiblemente)\b/.test(t))return;
  // Preserve the sender's location words, including a short answer in a rapid
  // batch. A neighborhood name alone never supplies an inferred municipality.
  if(!/\b(?:villa|barrio|vereda|calle|carrera|unidad|urbanizacion|robledo|medellin|bello|envigado|itagui|sabaneta|santa helena)\b/.test(t)&&!/^(?:manrique|enciso|altos de cala(?:zans|sanz))[.! ]*$/.test(t))return;
  const previous=state.intakeLocationParts|| (state.slots.locationDetails?[{text:state.slots.locationDetails,sourceId:null,at:null}]:[]);
  const part={text,sourceId:e.id??null,at:Number.isSafeInteger(e.at)?e.at:null};
  const parts=[...previous.filter(p=>normalize(p.text)!==t),part].slice(-3);
  state.intakeLocationParts=parts;
  state.slots.locationDetails=parts.map(p=>p.text).join(' | ');
  state.intakeSources={...state.intakeSources,locationDetails:{sourceId:part.sourceId,at:part.at,
    sources:parts.filter(p=>p.sourceId&&p.at!==null).map(({sourceId,at})=>({sourceId,at})),
    sourceCoverageComplete:parts.every(p=>p.sourceId&&p.at!==null),municipalityInferred:false}};
}
export function customerDecision(company,state,e,analysis={}) {
  if(company==='fumigacion'&&e.kind==='text'&&e.fromMe===false&&!e.forwarded&&!e.quotedId&&e.at>=SERVICE_ACCESS_STARTS_AT&&state.programIntake&&['name','address','details','confirm','correction'].includes(state.programIntake.stage)&&!state.awaitingHumanReview&&!state.closed)state={...state,programIntake:{...state.programIntake,accessDetailsGuard:SERVICE_ACCESS_GUARD}};
  if(company==='fumigacion'&&!state.awaitingHumanReview&&!state.closed&&!state.customerDeferral?.active&&serviceAccessOnlyTurn(state,e))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text},serviceAccessFacts:true};
  const technicalMeta=company==='servicio-tecnico'&&e.kind==='text'&&!e.forwarded&&!e.fromMe&&!state.requestedTechnicalReview&&!state.technicalPaintingRequest&&technicalIntakeMetaQuestion(e.text);
  if(technicalMeta)return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},technicalIntakeClarification:true,reply:technicalIntakeClarificationReply(technicalMeta,state.slots)};
  // A URL's query punctuation and path are not the sender's question or intake
  // answer. Preserve the unread reference without fetching or interpreting it.
  if(e.kind==='text'&&unreadLinkOnly(e.text))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},reviewTopic:'unread-link',reviewConditions:{kind:'unread-link',links:externalLinks(e.text)},review:'La persona envió únicamente un enlace. El contenido vinculado no ha sido leído; no consta una pregunta, servicio o dato operativo confirmado.',reviewQuestion:'¿Qué atención necesita este mensaje en este caso?',reply:'Recibí tu mensaje. Queda pendiente de revisión.'};
  if(e.kind==='text'&&customerCourtesy(e.text))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},courtesy:true,reply:'Con gusto. Estamos para servirte.'};
  // A complete social greeting is decided from the current literal source,
  // before a cached semantic label can create an operational question. Extra
  // words, media and forwarded messages keep their normal guarded route.
  const socialSource=normalize(e.text);
  const ordinarySocial=/^[¡ ]*(?:hola[,!. ]+)?(?:(?:buenos dias|buen dia|buenas tardes|buenas noches)[,!. ]+)?[¿¡ ]*como esta(?:s|n)?[?!.,! ]*$/.test(socialSource);
  const existingSocial=/^(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,!. ]+)?[¿¡ ]*como esta(?:s|n)?[?!.,! ]*$/.test(socialSource);
  if(e.kind==='text'&&!e.forwarded&&(company==='fumigacion'?ordinarySocial:company==='servicio-tecnico'&&existingSocial))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},courtesy:true,socialGreeting:true,reply:'Gracias por preguntar. Estoy aquí para ayudarte.'};
  if(e.kind==='text'&&!e.forwarded&&(state.introduced||state.initialIntakeAllRequested||state.asked?.length||company==='fumigacion'&&state.customerDeferral?.active)&&literalGreetingText(e.text))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},courtesy:true,greeting:true,reply:/buenas noches/.test(normalize(e.text))?'Buenas noches.':/buenas tardes/.test(normalize(e.text))?'Buenas tardes.':/buen(?:os dias| dia)/.test(normalize(e.text))?'Buen día.':'Hola.'};
  const validity=company==='fumigacion'&&mariaQuotationValidityTurn(state,e);
  if(validity)return validity;
  const currentLiteralContext=company==='fumigacion'&&mariaLiteralServiceContext(e);
  if(currentLiteralContext&&!contextNeedsPersonalPriority(e.text,e))return {...mariaLiteralContextDecision(state,e,currentLiteralContext),literalServiceContext:true};
  const literalText=textWithoutLinks(company==='fumigacion'?literalIntakeTextWithoutRegistrationFields(e.text):e.text).trim(),t=normalize(literalText);
  if(company==='fumigacion'&&acceptedMattressAdditionalScopeQuestion(state,e)){
    const reply='La cotización que te envié corresponde al tratamiento de colchones. Aún falta confirmar el valor y el alcance para muebles, tomacorrientes u otras zonas que mencionas. Revisaremos esa pregunta antes de confirmar el servicio.';
    return {state:{...state,slots:{...state.slots},lastText:e.text,awaitingHumanReview:true,requestedMattressScopeReview:{caseId:state.caseId,phone:e.phone,line:e.line,sourceId:e.id,at:e.at,text:e.text,quoteSourceId:state.quotedPrice.sourceId}},literalServiceContext:true,mattressScopeClarification:true,specificCustomerQuestionReply:reply,reviewTopic:'customer-question',reviewConditions:{kind:'accepted-mattress-additional-scope',caseId:state.caseId},review:'La persona aceptó el precio de un colchón y después pregunta por el valor y alcance de muebles, tomacorrientes u otras zonas. El precio aceptado no acredita que esos elementos estén incluidos. Debe resolverse esa pregunta antes de confirmar un servicio.',reviewQuestion:'¿Qué alcance y valor aprobados corresponden a los muebles, tomacorrientes y demás elementos que menciona?',reply};
  }
  const literal=literalFields(state,e,company),existing={...state.slots,...literal};
  if(company==='fumigacion'&&!literalIntakeTurn(e)){delete literal.dimensions;delete existing.dimensions;if(state.slots.dimensions)existing.dimensions=state.slots.dimensions;}
  let understood=parseUnderstanding(analysis,e.text,company,e.at);
  const directOwnAi=[CONVERSATIONAL_AI_GUARD,MIGUEL_CONVERSATIONAL_AI_GUARD].includes(analysis?.guard);
  if(directOwnAi){
    // Direct AI may fill a missing literal field, never replace native facts.
    // Its result belongs to this exact incoming source, not another case/turn.
    const allowed=company==='fumigacion'?literalIntakeTurn(e):['new-service','clarification'].includes(ownMiguelIntent(analysis,e)?.kind)&&e.kind==='text'&&!e.forwarded&&!e.fromMe&&!unreadLinkOnly(e.text)&&!paymentInquiry(e.text)&&!postServiceDocuments(e.text)&&!serviceFollowup(e.text);
    if(analysis.guard!==conversationalAiGuard(company)||analysis.eventId!==e.id||analysis.company!==(company==='fumigacion'?'FUMIGACION':'S.TECNICO')||!allowed)understood={};
    else understood=Object.fromEntries(Object.entries(understood).filter(([k,v])=>!existing[k]&&(company!=='fumigacion'||k!=='location'||ordinaryLiteralMunicipality(v)&&normalize(ordinaryLiteralMunicipality(v))===normalize(literal.location))));
  }
  const next={...state,slots:{...existing,...understood},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)};
  if(company==='fumigacion'&&!state.programIntake&&normalize(state.slots.service)==='chinches'&&!e.forwarded&&!e.quotedId&&/^no he visto (?:el|un|ningun) chinche[.! ]*$/.test(t)){
    const reply='Gracias por aclararlo. Aún necesitamos confirmar qué plaga está causando el problema. Conservé lo que nos contaste sobre la cama o cuna; revisaremos el caso antes de cotizar.';
    return {state:{...next,awaitingHumanReview:true},literalServiceContext:true,specificCustomerQuestionReply:reply,reviewTopic:'cotizacion-verificada',reviewConditions:{kind:'bedbug-identification-unverified',caseId:state.caseId},review:'La persona aclara que no ha visto el chinche. La persona afectada, la cama o la cuna no prueban una plaga identificada ni un número de colchones. Debe aclararse la identificación y el alcance sin repetir la misma pregunta.',reviewQuestion:'¿Qué identificación de la plaga y alcance pueden confirmarse con estos datos?',reply};
  }
  if(company==='fumigacion'&&state.pendingMattressCountClarification?.sourceId&&state.pendingMattressCountClarification.sourceId===e.id){
    const reply='Conservé tu respuesta «'+state.pendingMattressCountClarification.literal+'». ¿Te refieres a esa cantidad de colchones, o a la cama o estructura de la cuna?';
    return {state:next,mattressCountClarification:true,reply};
  }
  if(company==='fumigacion')discardSupersededSizeDuplicate(next,state,literal,literalQuoteFieldConflicts(e.text));
  if(company==='fumigacion'&&state.customerDeferral?.guard===CUSTOMER_DEFERRAL_GUARD&&state.customerDeferral.active===true&&state.customerDeferral.caseId===state.caseId&&state.customerDeferral.line===e.line&&e.at>state.customerDeferral.at&&!contextNeedsPersonalPriority(e.text,e)){
    if(customerDeclinesAfterDeferral(e))return {state:{...next,closed:true},courtesy:true,reply:'Entendido, gracias por avisarme.'};
    if(customerDeferralContinues(e))return {state:next,courtesy:true,customerDeferred:true,reply:customerDeferralReply(e)};
    if(customerDeferralAcknowledgement(e))return {state:{...next,slots:{...state.slots}},courtesy:true,customerDeferred:true,reply:'De acuerdo. Puedes pensarlo con calma; aquí estoy si surge alguna duda.'};
  }
  if(company==='fumigacion'&&state.customerDeferral?.guard===CUSTOMER_DEFERRAL_GUARD&&state.customerDeferral.active===true&&state.customerDeferral.caseId===state.caseId&&state.customerDeferral.line===e.line&&e.at>state.customerDeferral.at&&literalIntakeTurn(e,company)&&!contextNeedsPersonalPriority(e.text,e)){
    const resumedBy=customerDeferralResumeEvidence(e,literal);if(resumedBy)next.customerDeferral={...state.customerDeferral,active:false,resumedBy};
  }
  // An exception may take priority over a warranty/followup route, but must
  // not erase the customer's existing-service context for later turns.
  const preservedFollowup=company==='fumigacion'&&afterServiceDecision(state,next,e,analysis);
  if(preservedFollowup)next.requestedAfterServiceReview=preservedFollowup.state.requestedAfterServiceReview;
  if(directOwnAi&&Object.keys(understood).length)next.intakeSources={...next.intakeSources,...Object.fromEntries(Object.keys(understood).map(k=>[k,{sourceId:e.id,at:e.at,context:'own-ai-literal-fragment',guard:conversationalAiGuard(company)}]))};
  if(company==='fumigacion'&&literalIntakeTurn(e))rememberFields(next,e,company);
  const intakeTiming=rememberIntakeTiming(next,e,company);
  // Preserve an elliptical answer to our own size prompt literally. Do not invent
  // square metres, convert a linear measurement, or infer size outside that context.
  if(company==='fumigacion'&&!next.slots.area&&!next.slots.rooms&&literalIntakeTurn(e)&&(state.asked?.includes('size')||state.initialIntakeAllRequested)){
    const size=promptedSize(e,state);
    if(size){next.slots.area=size;next.intakeSources={...next.intakeSources,area:{sourceId:e.id,at:e.at,context:'prior-size-question',unitExpanded:false}};}
  }
  if(company==='fumigacion')retainPromptedLocation(next,e);
  if(company==='fumigacion'&&state.requestedProductInquiry&&!next.requestedAfterServiceReview&&literalIntakeTurn(e)&&!contextNeedsPersonalPriority(e.text,e)&&(Object.keys(literal).length||/^(?:solo|solamente|unicamente) (?:el )?producto[.! ]*$/.test(t))){
    if(/^(?:solo|solamente|unicamente) (?:el )?producto[.! ]*$/.test(t))return {...mariaLiteralContextDecision(next,{...e,id:state.requestedProductInquiry.sourceId,at:state.requestedProductInquiry.at,text:state.requestedProductInquiry.question},{kind:'product-commercial-question',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD}),reviewSource:state.requestedProductInquiry.sourceId};
    const asked=state.productPurposeClarification;
    next.productPurposeClarification=asked||{sourceId:e.id,productSourceId:state.requestedProductInquiry.sourceId,at:e.at};
    return {state:next,productPurposeClarification:true,reply:asked?(next.slots.dimensions?'Conservé las medidas '+next.slots.dimensions+'. Aún falta aclarar si buscas el servicio o información sobre el producto.':'Conservé los datos. Aún falta aclarar si buscas el servicio o información sobre el producto.'):'¿Buscas un servicio de control de plagas o información sobre el producto?'};
  }
  if(e.kind==='call')return {state:{...next,lastCallEvent:e.id},observed:true};
  if(company==='fumigacion'&&e.kind!=='text'&&preservedFollowup){
    const mediaName={image:'la imagen',video:'el video',audio:'el audio',document:'el documento'}[e.kind]||'el archivo';
    const active=next.requestedAfterServiceReview.warrantySource||next.requestedAfterServiceReview.activeRequest||next.requestedAfterServiceReview;
    const label={warranty:'garantía',reinforcement:'refuerzo',verification:'verificación','post-service':'servicio anterior','ambiguous-followup':'solicitud'}[active.kind]||'servicio anterior';
    const reply='Recibí '+mediaName+' para la revisión de tu '+label+'. Conservo lo que ya nos contaste; su contenido aún necesita revisión.';
    return {...preservedFollowup,afterServiceMediaContinuation:true,specificCustomerQuestionReply:reply,reply};
  }
  if(e.kind!=='text')return {state:next,review:'El cliente envió '+e.kind+'. El contenido original necesita revisión.',reply:e.kind==='audio'?'Recibí tu audio. Te atenderemos en cuanto revisemos su contenido.':'Recibí el archivo. Revisaremos su contenido para continuar contigo.'};
  if(postServiceDocuments(e.text)&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text))return {state:{...next,slots:{...state.slots}},reviewTopic:'service-documents',reviewConditions:{kind:'reported-post-service-documents',directCustomerReport:!e.forwarded},review:'La persona solicita documentos de un servicio que relata como realizado. El mensaje no acredita registro, ejecución ni existencia o autorización de documentos; hay que contrastar el servicio y revisar qué soportes pueden entregarse.',reviewQuestion:'¿Qué servicio y soportes autorizados comprobados corresponden a esta solicitud?',reply:'Con gusto. Una asesora continuará contigo para revisar los documentos que necesitas.'};
  if((company!=='fumigacion'&&/\b(?:factura|certificado)\b/.test(t)||/\b(?:seguimiento|posservicio|ya tengo (?:una )?cita|estado de (?:la )?orden)\b/.test(t))&&(company!=='fumigacion'||!contextNeedsPersonalPriority(e.text,e)))return {state:next,review:'El cliente consulta un servicio previo, su estado o un soporte. Hace falta contrastar el registro del programa.',reply:'Gracias. Revisaremos el registro de tu servicio para poder ayudarte.'};
  if(company==='servicio-tecnico'){
    const intent=ownMiguelIntent(analysis,e);
    if(['warranty-claim','post-service'].includes(intent?.kind)||state.requestedTechnicalReview){
      const request=state.requestedTechnicalReview||{kind:intent.kind,sourceId:e.id,at:e.at};
      return {state:{...next,slots:{...state.slots},requestedTechnicalReview:request},reviewSource:request.sourceId,reviewTopic:request.kind==='warranty-claim'?'warranty-review':'service-followup',reviewConditions:{kind:'technical-post-service',directCustomerReport:true},review:'La persona consulta una reparación anterior. Hay que comprobar el antecedente del mismo caso; su mensaje no acredita garantía, nueva reparación, técnico, horario o pago.',reviewQuestion:'¿Qué antecedente y condiciones comprobadas corresponden a esta reparación?',reply:'Con gusto. Tu solicitud sobre la reparación anterior quedó pendiente de revisión.'};
    }
  }
  const warrantyClaim=company==='fumigacion'&&['warranty','ambiguous-followup'].includes(afterServiceRequest(e,analysis)?.kind);
  const incidentalPets=company==='fumigacion'&&mariaIncidentalPetMention(e);
  if(incidentalPets&&next.caseId?.startsWith('fumigacion:')){
    const note={guard:incidentalPets.guard,sourceId:incidentalPets.sourceId,at:incidentalPets.at,text:incidentalPets.text};
    next.receptionNotes={...next.receptionNotes,incidentalPets:[...(next.receptionNotes?.incidentalPets||[]).filter(item=>item.sourceId!==e.id),note].slice(-8)};
    if(!state.slots.detail&&normalize(next.slots.detail)===normalize(incidentalPets.text)){
      delete next.slots.detail;next.intakeSources={...next.intakeSources};delete next.intakeSources.detail;
    }
  }
  const personalPriorityText=normalize(incidentalPets?.classificationText??literalText);
  if(/\b(cancel|reprogram|reclamo|queja|devolucion|amenaz|abogad|denuncia|dolor|intoxic|embaraz|mascota|bebe|niño|nino)\w*/.test(personalPriorityText)||/\bgarantia\w*/.test(t)&&!warrantyClaim)
    return {state:next,review:'El cliente solicita revisar una excepción o situación que necesita atención personal.',reply:'Gracias por contarnos. Revisaremos tu caso para darte una respuesta clara.'};
  if(/\b(pague|pago|comprobante|transfer|consign|abono)\w*/.test(t)&&(!paymentInquiry(e.text)||/\b(?:pague|comprobante|transferencia|consignacion|abono|(?:hice|realice) (?:el |un )?pago)\b/.test(t)))return {state:next,review:'El cliente informa un pago. Hace falta comprobar el ingreso y su asociación al servicio.',reply:'Gracias. Recibí la información del pago; falta verificarlo para poder confirmarte.'};
  if(paymentInquiry(e.text))return {state:next,reviewTopic:'payment-instructions',reviewConditions:{kind:'amount-and-instructions'},review:'La persona pregunta cuánto enviar o cómo pagar. No informa un ingreso recibido; el importe, medio de pago y asociación al caso requieren una fuente verificable.',reviewQuestion:'¿Qué importe y medio de pago verificados corresponden a esta solicitud?',reply:'Con gusto. Aún falta confirmar cuánto debes enviar y el medio de pago.'};
  if(previousQuotation(e.text))return {state:next,reviewTopic:'existing-quotation',reviewConditions:{kind:'previous-quotation'},review:'La persona dice que ya recibió una cotización. Esa afirmación no confirma precio, aceptación ni reserva; hace falta contrastar el antecedente del mismo caso.',reviewQuestion:'¿Qué cotización previa comprobada corresponde a este caso y cuál es la respuesta vigente?',reply:'Entiendo. La cotización anterior aún necesita verificarse para continuar.'};
  if(company==='fumigacion'&&mattressRoomScopeQuestion(state,e))return {state:{...next,slots:{...state.slots}},literalServiceContext:true,mattressScopeClarification:true,specificCustomerQuestionReply:MATTRESS_ROOM_SCOPE_REPLY,reviewTopic:'customer-question',reviewConditions:{kind:'mattress-room-scope',caseId:state.caseId},review:'La persona pregunta si el tratamiento cubre solo el colchón o también la habitación. No consta aquí un alcance adicional aprobado; hay que confirmar qué incluye esta cotización, sin afirmar cobertura de la habitación ni un precio global.',reviewQuestion:'¿El alcance confirmado es solo el colchón o incluye algún tratamiento de la habitación y en qué condiciones?',reply:MATTRESS_ROOM_SCOPE_REPLY};
  if(company==='servicio-tecnico'){
    const intent=ownMiguelIntent(analysis,e);
    if(intent?.kind==='arrival')return {state:{...next,slots:{...state.slots}},reviewTopic:'service-followup',reviewConditions:{kind:'arrival'},review:'La persona pregunta por la llegada de un servicio anterior; falta comprobar su estado actual.',reviewQuestion:'¿Cuál es el estado actual y la hora de llegada comprobada de este caso?',reply:'Entiendo que necesitas saber la hora de llegada. Aún no tengo una hora confirmada.'};
    if(intent?.kind==='painting-scope'&&/\b(?:pintar|repintar|pintura|pintan|repintado)\b/.test(t)&&!e.forwarded){
      const painting=state.technicalPaintingRequest||{sourceId:e.id,at:e.at,text:e.text.slice(0,300)};
      return {state:{...next,technicalPaintingRequest:painting},reviewTopic:'special-quotation',reviewSource:painting.sourceId,reviewConditions:{kind:'technical-painting',requestSource:painting.sourceId},review:'La persona consulta pintura de un equipo. Hace falta confirmar que ofrecemos ese trabajo y su alcance antes de preguntar por una avería o un horario.',reviewQuestion:'¿Ofrecemos la pintura solicitada y qué alcance está disponible?',reply:'Con gusto. Aún falta confirmar si ofrecemos el servicio de pintura que necesitas.'};
    }
    if(intent?.kind==='general-question')return {state:{...next,slots:{...state.slots}},reviewTopic:'customer-question',reviewConditions:{kind:'technical-general-question',question:normalize(e.text)},review:'La persona consulta una condición o capacidad del servicio. Hace falta una respuesta propia verificada; no es aceptación ni una reparación nueva.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Gracias por tu pregunta. Aún falta confirmar la respuesta para tu caso.'};
  }
  const followup=company==='fumigacion'&&afterServiceDecision(state,next,e,analysis);
  if(followup)return followup;
  const ordinaryAvailability=company==='fumigacion'&&ordinaryAvailabilityRequest(e.text);
  // A semantic label cannot erase a literal intake answer or turn an ordinary
  // availability request into a generic approval question.
  const ordinaryLiteralAnswer=literalIntakeTurn(e,company)&&(Object.keys(literal).length||next.intakeSources?.locationDetails?.sourceId===e.id);
  if(company==='fumigacion'&&ownIntent(analysis,e)?.kind==='general-question'&&!ordinaryLiteralAnswer&&!ordinaryAvailability&&!intakeTiming)return {state:{...next,slots:{...state.slots}},reviewTopic:'customer-question',reviewConditions:{kind:'general-question'},review:'La persona consulta condiciones generales. Falta una respuesta aprobada aplicable; no es una nueva cotización ni una garantía concedida.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Con gusto. Tu pregunta quedó pendiente de revisión.'};
  if(company==='fumigacion'&&(requestedControl(e.text)||state.requestedControlReview)){
    const reference=state.requestedControlReview||{sourceId:e.id,at:e.at,directCustomerReport:!e.forwarded};
    return {state:{...next,requestedControlReview:reference},reviewTopic:'service-followup',reviewConditions:{kind:'requested-control',directCustomerReport:reference.directCustomerReport},reviewSource:reference.sourceId,review:'La persona solicita una visita de control. Debe comprobarse el antecedente y el alcance; la solicitud no acredita un servicio anterior, intervalo aprobado, garantía, reserva ni precio.',reviewQuestion:'¿Qué antecedente y condiciones verificadas corresponden a esta solicitud de control?',reply:'Con gusto. Tu solicitud de control sigue pendiente de confirmación.'};
  }
  if(company==='fumigacion'&&postServiceReturn(e.text))return {state:next,reviewTopic:'service-followup',reviewConditions:{kind:'post-service'},review:'La persona relata un problema con plagas y un tratamiento anterior. Hace falta comprobar el antecedente y aclarar lo ocurrido; el relato no acredita ejecución, garantía, revisita ni precio aprobado.',reviewQuestion:'¿Qué antecedente y condiciones de revisita comprobados corresponden a este caso?',reply:'Entiendo lo que nos cuentas. Tu caso necesita revisión para confirmar cómo continuar.'};
  if(company==='fumigacion'&&plannedRevisit(e.text))return {state:{...next,slots:{...state.slots}},reviewTopic:'service-followup',reviewConditions:{kind:'planned-revisit',directCustomerReport:!e.forwarded},pendingQuestion:questionExcerpt(literalText.slice(literalText.search(/\b(?:necesito|quiero|agend\w*|program\w*|confirm\w*)\b/i))),review:'La persona relata una fumigación anterior y solicita una nueva visita, con preferencias de horario y técnico. La recomendación relatada no acredita reserva, disponibilidad ni precio; hay que contrastar el servicio guardado y sus condiciones.',reviewQuestion:'¿Qué antecedente, disponibilidad, técnico y precio verificados corresponden a esta revisita?',reply:'Gracias por contarnos. Tu solicitud de nueva visita sigue pendiente de confirmación.'};
  if(requestedTechnicalContact(e.text))return {state:{...next,slots:{...state.slots}},reviewTopic:'requested-technician-contact',reviewConditions:{kind:'technician-contact'},review:'La persona solicita un medio de contacto del técnico para hacerle preguntas. No consta aquí un contacto autorizado para compartir; no es una nueva solicitud de cotización.',reviewQuestion:'¿Qué contacto está autorizado para atender sus dudas y qué dato podemos compartirle?',reply:'Entiendo. Aún falta confirmar el contacto que puede atender tus dudas.'};
  if(serviceFollowup(e.text))return {state:{...next,slots:{...state.slots}},reviewTopic:'service-followup',reviewConditions:{kind:'arrival'},review:'La persona pregunta por la llegada del servicio. Hace falta contrastar el antecedente y comprobar el estado actual; no consta aquí una hora verificada.',reviewQuestion:'¿Cuál es el estado actual del servicio y qué respuesta confirmada podemos darle sobre la llegada?',reply:'Entiendo tu preocupación. Aún no tengo una hora de llegada confirmada.'};
  if(company==='fumigacion'&&state.quotedPrice&&!state.quotedPrice.accepted&&!state.programIntake&&customerDeferralRequested(e))return {state:{...next,customerDeferral:{guard:CUSTOMER_DEFERRAL_GUARD,active:true,caseId:state.caseId,line:e.line,sourceId:e.id,at:e.at}},courtesy:true,customerDeferred:true,reply:customerDeferralReply(e)};
  if(/^(gracias|muchas gracias|muy amable|ok|listo)[.! ]*$/.test(t))return {state:next,reply:'Con gusto.'};
  if(company==='servicio-tecnico'&&!e.forwarded){
    const painting=state.technicalPaintingRequest||literalPaintingRequest(e);
    if(painting)return {state:{...next,technicalPaintingRequest:painting},reviewTopic:'special-quotation',reviewConditions:{kind:'technical-painting',requestSource:painting.sourceId},reviewSource:painting.sourceId,review:'La persona solicita pintura de una nevera. No consta que ofrezcamos ese trabajo; hay que confirmar el alcance y disponibilidad antes de preguntar por una avería o por horario.',reviewQuestion:'¿Ofrecemos el servicio de pintura solicitado y qué respuesta comprobada corresponde a este caso?',reply:'Con gusto. Aún falta confirmar si ofrecemos el servicio de pintura que necesitas.'};
  }
  if(/^(?:hola[, ]+)?(?:con|esta|se encuentra)\s+\p{L}+(?:\s+\p{L}+)?[.!? ]*$/u.test(t))return {state:{...next,slots:{...state.slots}},reviewTopic:'requested-person',review:'La persona pidió hablar con alguien específico. Falta conocer el motivo; no consta una solicitud nueva de servicio.',reviewQuestion:'¿Quién puede atender esta solicitud?',reply:'Tu mensaje quedó pendiente de atención.'};
  if(company==='fumigacion'&&genericPestDescription(next.slots.service)){
    if(!next.asked.includes('service'))next.asked.push('service');
    return {state:next,pestIdentityClarification:true,reply:missingPestReply(next)};
  }
  const furnitureScope=company==='fumigacion'&&literalIntakeTurn(e)&&!contextNeedsPersonalPriority(e.text,e)&&!specialQuotation(literalText,next.slots)&&normalize(next.slots.service)==='comejen'&&literalTermiteFurnitureScope(e);
  if(furnitureScope){
    const mixed=furnitureScope.kind==='mixed-furniture-property';
    next.slots.treatmentScope=furnitureScope.literalScope;
    next.intakeSources={...next.intakeSources,treatmentScope:{sourceId:e.id,at:e.at,guard:furnitureScope.guard,context:'literal-furniture-item-not-whole-property'}};
    const subject=mixed?(furnitureScope.plural?'los muebles':'el mueble')+' y la parte del inmueble que indicas':furnitureScope.plural?'esos muebles':'ese mueble';
    const reply='Para tratar el comején en '+subject+', necesitamos confirmar el valor y qué incluye el tratamiento.';
    return {state:next,specificCustomerQuestionReply:reply,reviewTopic:'special-quotation',reviewConditions:{kind:'literal-termite-furniture',guard:furnitureScope.guard,requestSource:e.id,treatmentScope:next.slots.treatmentScope,scopeKind:furnitureScope.kind},reviewSource:e.id,review:'La persona solicita tratar comején en '+next.slots.treatmentScope+'. Hace falta confirmar el valor total y el alcance para los elementos indicados.',reviewQuestion:'¿Qué valor total y alcance podemos confirmar para los elementos indicados, o qué dato concreto falta para cotizar?',reply};
  }
  if(company==='fumigacion'&&specialQuotation(literalText,next.slots))return {state:next,reviewTopic:'special-quotation',reviewConditions:{kind:'special-property'},review:'Cotización especial de edificio, unidad, varias propiedades o zonas comunes; necesita alcance y precio propios, sin aplicar la tarifa de una vivienda.',reviewQuestion:'¿Qué alcance y cotización corresponden a esta solicitud especial?',reply:'Gracias. La cotización de este inmueble requiere confirmar su alcance y precio.'};
  if(company==='fumigacion'&&termiteFurnitureMention(e))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},literalServiceContext:true,reviewTopic:'customer-question',reviewConditions:{kind:'termite-furniture-scope-unconfirmed',directCustomerReport:!e.forwarded&&!e.quotedId},review:'El mensaje menciona comején y muebles, pero no permite afirmar un alcance actual de tratamiento. Hace falta aclarar a qué solicitud se refiere antes de cotizar.',reviewQuestion:'¿Qué solicitud y alcance actuales comprobados corresponden a este mensaje?',reply:'Para responderte bien, necesito aclarar qué deseas cotizar en este caso.'};
  if(company==='fumigacion'&&normalize(next.slots.service).includes('avispas'))return {state:next,reviewTopic:'special-quotation',reviewConditions:{kind:'wasp-inspection'},review:'La cotización de avispas depende del tamaño y la altura del panal; requiere inspección. No hay una tarifa automática aprobada.',reviewQuestion:'¿Qué inspección y cotización corresponden al tamaño y la altura de este panal?',reply:'Para las avispas, la cotización depende del tamaño y la altura del panal y requiere inspección.'};
  if(!next.slots.detail&&state.asked?.at(-1)==='detail'&&!/[?¿]/.test(literalText)&&t.length>3&&!(company==='servicio-tecnico'&&technicalIntakeLiteralCorrection(e.text))&&(company!=='fumigacion'||mariaLiteralSlotAllowed('detail',literalText,e.text,e.at)))next.slots.detail=literalText.slice(0,300);
  if(!next.slots.preference&&state.asked?.includes('preference')&&/\b(hoy|mañana|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}[/:]\d{1,2}|tarde|mañana|noche)\b/.test(t)&&(company!=='fumigacion'||mariaLiteralSlotAllowed('preference',literalText,e.text,e.at)))next.slots.preference=literalText.slice(0,300);
  if(ordinaryAvailability&&!intakeTiming?.preference){
    const preference=literalText.match(/\b(?:hoy|mañana|manana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b[^.!?]*/i)?.[0];
    if(preference&&mariaLiteralSlotAllowed('preference',preference,e.text,e.at)){next.slots.preference=preference;next.intakeSources={...next.intakeSources,preference:{sourceId:e.id,at:e.at,context:'literal-request-not-confirmed-availability'}};}
  }
  const mattressService=company==='fumigacion'&&normalize(next.slots.service).includes('chinches');
  const dimensions=company==='fumigacion'&&literalIntakeDimensions(next.slots.dimensions);
  const nonResidentialDimensions=dimensions?.explicitMetricUnits&&!['casa','apartamento'].includes(normalize(next.slots.site));
  const fields=company==='fumigacion'?['service','site',mattressService?'mattresses':'size','location']:['service','detail','location'];
  const missing=fields.find(f=>f==='size'?!next.slots.area&&!next.slots.rooms&&!nonResidentialDimensions:!next.slots[f]||company==='fumigacion'&&f==='service'&&genericPestDescription(next.slots.service));
  const questions={service:company==='fumigacion'?missingPestReply(next):'¿Qué equipo necesitas revisar?',site:'¿En qué tipo de inmueble necesitas el servicio?',size:'¿Cuántas habitaciones o metros cuadrados tiene el lugar?',mattresses:furnitureExclusionForPresentation(next,e)?'¿Cuántos colchones están afectados?':'¿Cuántos colchones están afectados? Cuéntame también si hay chinches en bases de cama u otros muebles.',detail:'¿Qué falla presenta el equipo?',location:'¿En qué municipio y barrio necesitas el servicio?'};
  if(/[?¿]/.test(literalText)&&/\b(eso|lo anterior|lo que (?:me )?(?:dij|coment|indic|explic)|me habian|me hab[ií]as|mismo (?:precio|horario|servicio)|como qued|que qued)\w*/.test(t))
    return {state:next,reviewTopic:'previous-communication',review:'El cliente pregunta por algo comunicado antes. Hay que relacionar su pregunta con el contexto guardado y el servicio correcto antes de contestar.',reply:'Gracias. Revisaremos lo que ya conversamos para responder tu pregunta con claridad.'};
  if(isCustomerQuestion(e.text)&&!(company==='fumigacion'&&(quotationInquiry(e.text)||ordinaryAvailability)&&!ambiguousIntake(e.text)))
    return {state:literalIntakeTurn(e,company)?next:{...next,slots:{...state.slots}},reviewTopic:!e.forwarded&&quotationInquiry(e.text)?'cotizacion-verificada':'customer-question',review:'La persona hizo una pregunta concreta. Hace falta revisar sus antecedentes y confirmar la respuesta para este servicio.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.'};
  if(missing==='size'&&dimensions)return {state:next,dimensionsClarification:true,reply:dimensions.explicitMetricUnits?'Conservé las medidas '+dimensions.literal+'. ¿Cuántos metros cuadrados en total necesitas tratar?':'Conservé las medidas '+dimensions.literal+'. ¿Son largo por ancho en metros y corresponden al espacio que necesitas tratar?'};
  if(!missing&&nonResidentialDimensions)return {state:next,reviewTopic:'special-quotation',reviewConditions:{kind:'literal-special-property-dimensions',guard:MARIA_DIMENSIONS_GUARD},review:'La persona indicó un inmueble no residencial y sus dimensiones literales. No se calculó superficie ni hay precio aprobado; necesita alcance y cotización propios del mismo caso.',reviewQuestion:'¿Qué alcance y cotización propios corresponden a este inmueble y las medidas indicadas?',reply:'Conservé las medidas '+dimensions.literal+'. La cotización de este inmueble necesita verificar su alcance.'};
  if(missing&&!next.asked.includes(missing)){next.asked.push(missing);return {state:next,reply:company==='fumigacion'&&missing==='location'&&next.slots.locationDetails?'¿En qué municipio necesitas el servicio? Ya conservé la ubicación que me indicaste.':questions[missing]};}
  if(missing){
    if(company==='fumigacion'&&missing==='mattresses'&&/^(?:un[ao]?|[1-9]\d?)\s+(?:cuna|cama)[.! ]*$/.test(t))return {state:next,reply:'Para esa cama o cuna, ¿cuántos colchones necesitas tratar? Confirma también si te refieres a la estructura.'};
    if(company==='fumigacion')return {state:next,reply:missing==='location'&&next.slots.locationDetails?'Me falta confirmar el municipio para cotizarte; ya conservé la ubicación que me indicaste.':missing==='mattresses'&&!furnitureExclusionForPresentation(next,e)?'Para cotizar esa cama, confirma cuántos colchones están afectados y si también hay chinches en la base u otros muebles.':questions[missing]};
    const names={service:'la plaga o el servicio solicitado',site:'el tipo de inmueble',size:'las habitaciones o metros cuadrados del lugar',mattresses:'los colchones y muebles afectados',detail:'la falla del equipo',location:'el municipio y barrio'};
    return {state:next,reviewTopic:'missing-intake:'+missing,reviewConditions:{missing},review:'Ya preguntamos por '+names[missing]+', pero la respuesta no permite confirmarlo.',reviewQuestion:'¿Qué dato podemos confirmar sobre '+names[missing]+' para esta solicitud?',reply:'Gracias. Revisaremos los detalles que nos compartiste para continuar.'};
  }
  if(company==='fumigacion')return {state:next,question:{topic:'cotizacion-verificada',conditions:next.slots},reply:'Gracias. Recibí los datos de tu solicitud. La cotización sigue pendiente de confirmación.'};
  if(!next.slots.preference&&!next.asked.includes('preference')){next.asked.push('preference');return {state:next,reply:'¿Qué día y franja horaria prefieres?'};}
  if(!next.slots.preference)return {state:next,reviewTopic:'missing-intake:preference',reviewConditions:{missing:'preference'},review:'Ya preguntamos por el día y la franja horaria preferidos, pero falta confirmarlos.',reviewQuestion:'¿Qué día y franja horaria prefiere esta persona?',reply:'Gracias. Revisaremos los detalles para continuar con tu solicitud.'};
  return {state:next,question:{topic:'disponibilidad-y-cotizacion',conditions:next.slots},reply:'Gracias. Recibí tu solicitud; falta confirmar disponibilidad y cotización.'};
}

export class Engine {
  constructor(store,config){this.store=store;this.config=config;initializeTesaStore(store);initializeWarrantyResponseEscalation(store,config);}
  async process(e,analysis={}) {
    const s=this.store,c=this.config;
    return s.tx(()=>{
      const row=s.db.prepare('SELECT state,revision FROM events WHERE id=?').get(e.id);
      if(!row||row.state!=='PENDING')return;
      const finish=state=>s.db.prepare('UPDATE events SET state=? WHERE id=?').run(state,e.id);
      if(e.fromMe){
        const own=s.db.prepare("SELECT id FROM outbox WHERE mid=? AND phone=? AND line=? AND state IN ('ACCEPTED','DELIVERED','READ')").get(e.id,e.phone,e.line);
        if(own){finish('BOT_ECHO');return;}
        // A provider echo can arrive before the send request returns. Resolve by exact returned ID on the next cycle.
        if(s.db.prepare("SELECT id FROM outbox WHERE phone=? AND state='SENDING'").get(e.phone))return;
        s.noteStaffIntervention(e);s.hold(e.phone,e.id,true);finish('STAFF_TAKEOVER');return;
      }
      const conv=s.conversation(e.phone);
      const trialCustomer=nativeTrialCustomerTurn(c,e);
      const internal=internalRecipients(c).includes(e.phone)&&!trialCustomer;
      if(knownInternalRecipient(e.phone)&&!internal&&!trialCustomer){finish('OBSERVED_INTERNAL_OUTSIDE_SCOPE');return;}
      const ownChiefQuote=internal&&e.quotedId&&s.db.prepare("SELECT id FROM outbox WHERE phone=? AND line=? AND mid=? AND internal=1 AND state IN ('DELIVERED','READ')").get(e.phone,e.line,e.quotedId);
      const chiefPlan=internal&&parseChiefCommand(e,c,{quotedOwn:Boolean(ownChiefQuote)});
      const ownCaseQuestion=chiefPlan?.action==='unsupported'&&ownChiefQuote&&s.db.prepare("SELECT 1 FROM questions q JOIN outbox o ON (o.id=q.outbox_id OR EXISTS(SELECT 1 FROM question_routes r WHERE r.question_id=q.id AND r.outbox_id=o.id AND r.recipient=o.phone AND r.line=o.line)) WHERE o.phone=? AND o.line=? AND o.mid=? AND o.internal=1 AND o.state IN ('DELIVERED','READ') AND q.state IN ('PENDING','ANSWERED','ANSWER_REVIEW')").get(e.phone,e.line,e.quotedId);
      // Independent directed orders are not collapsed into the latest chat
      // turn. Only this bounded chief dispatcher may bypass supersession.
      const newChiefCommand=chiefPlan&&(chiefPlan.action!=='unsupported'||chiefPlan.sourceReadIntent||chiefPlan.directed&&!ownCaseQuestion);
      const newerOnLine=internal&&s.db.prepare('SELECT 1 FROM events WHERE phone=? AND line=? AND from_me=0 AND (at>? OR (at=? AND revision>?)) LIMIT 1').get(e.phone,e.line,e.at,e.at,row.revision);
      if(internal?newerOnLine&&!newChiefCommand:(e.at<conv.at||row.revision<conv.revision)){finish('OBSERVED_SUPERSEDED');return;}
      if(!c.enabled&&(!c.chiefOnly||!internal)){finish('OBSERVED_ANALYSIS_ONLY');return;}
      if(internal){
        if(e.forwarded){finish('OBSERVED_FORWARDED');return;}
        // A literal direct read order takes precedence over an answer to a
        // quoted case question. Ordinary quoted answers retain their route.
        if(newChiefCommand){enqueueChiefCommand(s,c,e,chiefPlan);finish('CHIEF_COMMAND_QUEUED');return;}
        const quoted=e.quotedId&&s.db.prepare("SELECT q.*,o.state AS delivery FROM questions q JOIN outbox o ON (o.id=q.outbox_id OR EXISTS(SELECT 1 FROM question_routes r WHERE r.question_id=q.id AND r.outbox_id=o.id AND r.recipient=o.phone AND r.line=o.line)) WHERE o.phone=? AND o.line=? AND o.mid=? AND o.internal=1 AND o.state IN ('DELIVERED','READ')").get(e.phone,e.line,e.quotedId);
        // The former coordinator can answer only an exact delivered question.
        // Additional sources keep the existing review branch. The technical
        // route observes uncited messages from the other business line to
        // prevent cross-bot status/ack loops.
        const exactQuestionAnswerOnly=c.operatorRouting===CURRENT_OPERATOR_ROUTING&&(e.phone===DIEGO||(c.company==='servicio-tecnico'&&e.phone===TECHNICAL_COORDINATOR));
        if(exactQuestionAnswerOnly&&!(quoted&&['PENDING','ANSWERED','ANSWER_REVIEW'].includes(quoted.state)&&e.kind==='text'&&e.text.trim())){finish('OBSERVED_INTERNAL');return;}
        if(quoted&&e.kind==='text'&&e.text.trim()&&['ANSWERED','ANSWER_REVIEW'].includes(quoted.state)){
          // Preserve the first source. A further operator response cannot silently
          // replace it or generalize it into a price/schedule rule.
          s.audit('CASE_ANSWER_ADDITIONAL_SOURCE_REVIEW',e.id,{question:quoted.id,caseId:quoted.case_id,recipient:e.phone,text:e.text,priorSource:quoted.source_id});
          s.db.prepare("UPDATE questions SET state='ANSWER_REVIEW' WHERE id=?").run(quoted.id);
          finish('ANSWER_REVIEW');return;
        }
        if(quoted&&e.kind==='text'&&e.text.trim()&&quoted.state==='PENDING'){
          if(/^(si|no|ok|listo|vale|perfecto|gracias)[.! ]*$/.test(normalize(e.text))){
            s.db.prepare("UPDATE questions SET answer=?,source_id=?,answer_at=?,state='ANSWER_REVIEW' WHERE id=? AND state='PENDING'").run(s.seal(e.text),e.id,e.at,quoted.id);
            s.audit('CASE_ANSWER_CLARITY_PENDING',e.id,{question:quoted.id,caseId:quoted.case_id});finish('ANSWER_REVIEW');return;
          }
          // Only a verified answer to an exact delivered question becomes case knowledge. No automatic business execution.
          s.db.prepare("UPDATE questions SET answer=?,source_id=?,answer_at=?,valid_until=?,state='ANSWERED' WHERE id=? AND state='PENDING'").run(s.seal(e.text),e.id,e.at,e.at+1800000,quoted.id);
          s.audit('CASE_ANSWER_LEARNED',e.id,{question:quoted.id,caseId:quoted.case_id,role:e.phone===SANDRA?'chief':'coordinator'});
          queueMariaChiefCustomerAnswer(s,c,quoted,e);
          if(!(c.operatorRouting===CURRENT_OPERATOR_ROUTING&&e.phone===DIEGO))s.queue(e.id+':answer-ack',e.phone,e.line,'Gracias. Guardé tu aclaración para esta solicitud.',true,0);finish('CASE_ANSWER');return;
        }
        const ownQuote=e.quotedId&&s.db.prepare("SELECT id FROM outbox WHERE phone=? AND line=? AND mid=? AND internal=1 AND state IN ('DELIVERED','READ')").get(e.phone,e.line,e.quotedId);
        const shortStatus=e.kind==='text'&&shortNameStatus(e.text,c.bot);
        if(e.kind==='text'&&(directed(e.text,c.bot)||ownQuote||shortStatus)){
          const body=(shortStatus||normalize(e.text).replace(/^[¿¡ ]*(?:(?:hola|buenos dias|buenas tardes|buenas noches)[, :]+)?(?:maria angel|mariangel|miguel angel|bot)[, :¿?!]*/,'' )).replace(/[¿?!.]+$/,'').trim();
          const readOnlyTopic=e.phone===SANDRA&&chiefReadOnlyTopic(body);
          const readOnlyReply=readOnlyTopic&&chiefReadOnlyReply(s,c,e.phone,readOnlyTopic,body);
          if(readOnlyReply){s.queue(e.id+':readonly',SANDRA,e.line,readOnlyReply,true,0);finish('CHIEF_READONLY');return;}
          if(/^(?:que (?:funciones )?puedes (?:hacer|realizar)(?: en este momento)?|que sabes hacer|como puedes ayudarme)$/.test(body)){
            s.queue(e.id+':capabilities',e.phone,e.line,capabilitiesReply(c,e.phone,currentPriceEntries(s.approvedPriceCatalogs()).length),true,0);finish('CHIEF_CAPABILITIES');return;
          }
          const statusTopic=chiefStatusTopic(body);
          if(statusTopic){
            s.queue(e.id+(statusTopic==='presence'?':presence':':status'),e.phone,e.line,chiefStatusReply(s,c,e.phone,statusTopic,body),true,0);finish(statusTopic==='presence'?'CHIEF_PRESENCE':'CHIEF_STATUS');return;
          }
          if(e.phone!==SANDRA){s.audit('COORDINATOR_DIRECTED_PENDING_REVIEW',e.id,{kind:e.kind});s.queue(e.id+':review-ack',e.phone,e.line,internalName(e.phone)+', tu consulta quedó guardada para revisión; todavía no he ejecutado cambios.',true,0);finish('COORDINATOR_REVIEW');return;}
          if(new RegExp('^(?:(?:hola|buenos dias|buenas tardes|buenas noches)[, :]+)?(?:'+normalize(c.bot)+'|bot)[, :]+[¿ ]*(?:hola|estas ahi|estas presente|me escuchas|estas disponible|puedes responder|sigues ahi)[?!. ]*$').test(normalize(e.text))){
            s.queue(e.id+':presence',SANDRA,e.line,'Sí, Sandra. Soy '+c.bot+'. Estoy aquí para ayudarte.',true,0);finish('CHIEF_PRESENCE');return;
          }
          const target=c.company==='fumigacion'?null:/retoma (?:el )?chat (?:de )?(?:\+)?(57\d{10})\b/.exec(normalize(e.text));
          if(c.enabled&&target&&!knownInternalRecipient(target[1])&&s.conversation(target[1])){
            s.hold(target[1],e.id,false);s.queue(e.id+':release',SANDRA,e.line,'El chat quedó devuelto al bot para el próximo mensaje.',true,0);finish('EXPLICIT_RELEASE');return;
          }
          if(/^(?:maria angel|miguel angel|bot)[, :]+(?:gracias|muchas gracias)[.! ]*$/.test(normalize(e.text))){s.queue(e.id+':courtesy',SANDRA,e.line,'Con gusto, Sandra.',true,0);finish('CHIEF_COURTESY');return;}
          s.db.exec('CREATE TABLE IF NOT EXISTS chief_requests(id TEXT PRIMARY KEY,phone TEXT,line TEXT,body TEXT,at INTEGER,state TEXT)');
          s.db.prepare('INSERT OR IGNORE INTO chief_requests VALUES(?,?,?,?,?,?)').run(e.id,e.phone,e.line,s.seal(e.text),e.at,'REVIEW');
          s.audit('CHIEF_DIRECTED_PENDING_REVIEW',e.id,{kind:e.kind});
          s.queue(e.id+':review-ack',SANDRA,e.line,c.enabled?'Doña Sandra, guardé tu solicitud para revisión. Todavía no he ejecutado cambios.':'Doña Sandra, guardé tu solicitud para revisarla en esta etapa de aprendizaje. Aún no he ejecutado cambios ni enviado mensajes a clientes.',true,0);finish('CHIEF_REVIEW');return;
        }
        finish('OBSERVED_INTERNAL');return;
      }
      if(conv.hold){
        // Observe a direct current stop-contact instruction without answering,
        // altering the human hold or changing its intake/payment facts.
        const scope=assertOperationalLineScope(c);
        if(!scope||operationalLineAllowed(c,e.line)&&e.at>=operationalLineStartsAt(c,e.line)&&!foreignLineSources(s,c,e.phone,e.line)){
          const noContact=ownCommercialCustomerTurn(s,c,conv.state,e,{noContactOnly:true});
          if(noContact){s.saveConversation(e.phone,noContact.state);s.audit('OWN_NO_CONTACT_OBSERVED_UNDER_HUMAN_HOLD',e.id,{guard:COMMERCIAL_OBJECTION_GUARD,caseId:noContact.state.caseId,businessWritten:false,humanHoldReleased:false,customerReplyQueued:false});}
        }
        finish('OBSERVED_HUMAN');return;
      }
      const lineScope=assertOperationalLineScope(c);
      if(lineScope&&(!operationalLineAllowed(c,e.line)||e.at<operationalLineStartsAt(c,e.line)||foreignLineSources(s,c,e.phone,e.line))){
        finish('OBSERVED_TEMPORARY_LINE_SCOPE');return;
      }
      const commercialTurn=ownCommercialCustomerTurn(s,c,conv.state,e,{newCase:literalOwnNewService(e),personalPriority:contextNeedsPersonalPriority(e.text,e)||Boolean(afterServiceRequest(e,analysis))});
      if(commercialTurn){
        commercialTurn.state.lastHandledSourceId=e.id;commercialTurn.state.lastText=e.text;
        s.saveConversation(e.phone,commercialTurn.state);
        if(commercialTurn.question)s.questionToRecipients({phone:e.phone,line:e.line,caseId:commercialTurn.state.caseId,topic:commercialTurn.question.topic,conditions:commercialTurn.question.conditions,recipients:[SANDRA],source:e.id,text:commercialTurn.question.text});
        if(commercialTurn.reply){
          if(!publicTextSafe(commercialTurn.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
          s.queue(e.id+':reply',e.phone,e.line,commercialTurn.reply,false,conv.revision,commercialTurn.state.caseId);
          if(commercialTurn.quotationReference)s.savePriceReplyReference(e.id+':reply',commercialTurn.quotationReference);
        }
        s.audit('OWN_COMMERCIAL_CUSTOMER_TURN',e.id,{guard:COMMERCIAL_OBJECTION_GUARD,kind:commercialTurn.kind,caseId:commercialTurn.state.caseId,quotationSourceId:commercialTurn.state.commercialPriceObjection?.quotationSourceId||null,discountApproved:false,businessWritten:false,humanHoldReleased:false});
        finish(commercialTurn.kind==='price-objection'?'OWN_PRICE_OBJECTION':'OWN_COMMERCIAL_REFUSAL');return;
      }
      const reportedOrder=/\borden\s*(?:n[ºo°.]?\s*)?([a-f0-9]{8})\b/i.exec(e.text)?.[1]?.toUpperCase();
      const productInquiry=c.company==='fumigacion'&&(conv.state.requestedProductInquiry||ownCaseProductInquiry(s,c,conv.state,e));
      const pendingBatch=c.company==='fumigacion'?s.customerTurnBatch(e.phone,e.id,conv.state.lastHandledSourceId):[];
      const batchNewSource=pendingBatch.filter(source=>source.phone===e.phone&&source.line===e.line&&literalOwnNewService(source)&&(source.id!==e.id||!afterServiceRequest(e,analysis))).at(-1);
      const currentNewCase=c.company==='fumigacion'?(literalOwnNewService(e)||productInquiry&&e.kind==='text'&&!e.forwarded&&explicitServiceAfterProduct(e.text))&&!afterServiceRequest(e,analysis):explicitNewTechnicalCase(e.text);
      const newCase=currentNewCase||Boolean(batchNewSource);
      const newCaseSource=currentNewCase?e:batchNewSource;
      const caseState=newCase?{slots:{},asked:[],introduced:conv.state.introduced,caseId:c.company+':'+newCaseSource.id}:conv.state;
      const initialSource=!newCase&&!caseState.caseId&&c.company==='fumigacion'?pendingBatch.find(source=>source.line===e.line&&!source.fromMe&&!source.forwarded&&source.kind==='text'&&literalIntakeTextWithoutRegistrationFields(source.text).trim()&&(!/^(?:(?:mi|el) )?(?:nombre(?: completo)?|direccion|correo|telefono|documento|cedula)\s*(?::|=|es\b)/.test(normalize(source.text))||Object.keys(extractSlots(source.text,c.company)).length))?.id:null;
      caseState.caseId ||= reportedOrder || c.company+':'+(initialSource||e.id);
      if(c.company==='fumigacion'&&explicitMariaAdviserRequest(e)){
        const request=routeCaseQuestion(s,c,{phone:e.phone,line:e.line,caseId:caseState.caseId,topic:'adviser-assistance',conditions:{kind:'customer-requested-adviser'},recipients:[SANDRA],source:e.id,text:'El cliente solicita expresamente atención de una persona. Contactar al cliente y revisar su solicitud, conservando los datos, la cotización y el horario ya aportados.'});
        const previous=caseState.requestedHumanAssistance;
        const replyNeeded=!previous||previous.questionId!==request.id||e.at-previous.lastAcknowledgedAt>=60000;
        caseState.requestedHumanAssistance={guard:MARIA_ADVISER_HANDOFF_GUARD,questionId:request.id,sourceId:previous?.sourceId||e.id,line:e.line,at:previous?.at||e.at,lastAcknowledgedAt:replyNeeded?e.at:previous.lastAcknowledgedAt};
        caseState.awaitingHumanReview=true;caseState.lastHandledSourceId=e.id;caseState.lastText=e.text;s.saveConversation(e.phone,caseState);
        if(replyNeeded)s.queue(e.id+':reply',e.phone,e.line,'Claro. Voy a pedir que un asesor te atienda; conservaré la información que ya nos compartiste.',false,conv.revision,caseState.caseId);
        s.audit('OWN_EXPLICIT_ADVISER_REQUEST_ROUTED',e.id,{guard:MARIA_ADVISER_HANDOFF_GUARD,questionId:request.id,caseId:caseState.caseId,internalQuestionCreated:request.created,recipient:SANDRA,businessWritten:false,humanHoldReleased:false});
        finish('ADVISER_REQUEST_ROUTED');return;
      }
      if(!newCase&&c.company==='fumigacion'&&productInquiry&&!caseState.requestedProductInquiry)caseState.requestedProductInquiry={sourceId:productInquiry.id,at:productInquiry.at,question:productInquiry.text.slice(0,300)};
      if(!newCase&&c.company==='fumigacion'&&['text','image','video','audio','document'].includes(e.kind)&&!e.forwarded&&!e.fromMe&&!caseState.requestedAfterServiceReview){
        const recovered=ownCaseLiteralFollowup(s,c,caseState,e,e.quotedId||null);
        if(recovered){
          const marker=e.quotedId?{restoredFromQuotedSource:{sourceId:e.id,quotedId:recovered.source.id,at:e.at}}:{restoredFromStoredSource:{sourceId:e.id,originalId:recovered.source.id,at:e.at}};
          caseState.requestedAfterServiceReview={...recovered.reference,...marker};
          s.audit(e.quotedId?'OWN_QUOTED_AFTER_SERVICE_CONTEXT_RESTORED':'OWN_STORED_AFTER_SERVICE_CONTEXT_RESTORED',e.id,{guard:MARIA_AFTER_SERVICE_CONTINUITY_GUARD,caseId:caseState.caseId,sourceId:recovered.source.id,line:e.line,originalEventReplayed:false,businessWritten:false});
        }
      }
      if(c.company==='fumigacion'&&caseState.storedContextCoverageIncomplete)s.audit('OWN_STORED_CONTEXT_COVERAGE_INCOMPLETE',e.id,{...caseState.storedContextCoverageIncomplete,caseId:caseState.caseId,ordinaryIntakeBlocked:true,knownFollowupPreserved:Boolean(caseState.requestedAfterServiceReview),businessWritten:false,originalEventReplayed:false});
      if(c.company==='fumigacion'&&caseState.storedContextCoverageIncomplete&&!caseState.requestedAfterServiceReview&&!newCase){
        const coverage=caseState.storedContextCoverageIncomplete;
        if(!coverage.notifiedSourceId&&!e.forwarded&&e.kind==='text'){s.queue(e.id+':reply',e.phone,e.line,'Necesito revisar el contexto anterior de este caso para continuar.',false,row.revision,caseState.caseId);coverage.notifiedSourceId=e.id;}
        caseState.lastHandledSourceId=e.id;s.saveConversation(e.phone,caseState);finish('OBSERVED_STORED_CONTEXT_COVERAGE_REVIEW');return;
      }
      if(c.company==='fumigacion'&&e.kind==='text'&&!e.forwarded&&/^[¿?\s]+$/.test(e.text)&&/[¿?]/.test(e.text)){
        // A punctuation-only followup supplies no new question or intake fact.
        // Preserve pending work on this own line without choosing its meaning,
        // creating another route, or sending another acknowledgement.
        const pending=s.db.prepare("SELECT q.id,q.state FROM questions q JOIN outbox o ON o.id=q.outbox_id WHERE q.phone=? AND q.case_id=? AND o.line=? AND q.state IN ('PENDING','ANSWER_REVIEW') AND o.state IN ('READY','SENDING','UNCERTAIN','ACCEPTED','DELIVERED','READ') ORDER BY q.rowid").all(e.phone,caseState.caseId,e.line);
        if(pending.length){
          caseState.lastHandledSourceId=e.id;s.saveConversation(e.phone,caseState);
          s.audit('PENDING_PUNCTUATION_FOLLOWUP_OBSERVED',e.id,{caseId:caseState.caseId,questionIds:pending.map(q=>q.id),newOutboundCreated:false});
          finish('OBSERVED_PENDING_FOLLOWUP');return;
        }
      }
      let pendingQuestion=null,documentRequest=null,controlRequest=null,followupRequest=null,literalContextRequest=null;
      if(!newCase||newCaseSource.id!==e.id){
        const firstSource=caseState.caseId.startsWith(c.company+':')?caseState.caseId.slice(c.company.length+1):null;
        const turns=newCase?pendingBatch.slice(pendingBatch.findIndex(source=>source.id===newCaseSource.id)):s.customerTurnBatch(e.phone,e.id,caseState.lastHandledSourceId||(initialSource?null:firstSource));
        if(c.company==='fumigacion')literalContextRequest=turns.filter(turn=>{const context=mariaLiteralServiceContext(turn);return context&&context.kind!=='context-reference'&&!contextNeedsPersonalPriority(turn.text,turn);}).at(-1)||null;
        documentRequest=turns.filter(turn=>turn.kind==='text'&&postServiceDocuments(turn.text)).at(-1)||null;
        if(c.company==='fumigacion')controlRequest=turns.filter(turn=>turn.kind==='text'&&requestedControl(turn.text)).at(-1)||null;
        if(c.company==='fumigacion')followupRequest=turns.find(turn=>ownCaseLiteralFollowup(s,c,caseState,e,turn.id))||null;
        caseState.intakeSources={...caseState.intakeSources};
        for(const turn of turns.filter(turn=>literalIntakeTurn(turn,c.company)&&!['name','address','details','confirm'].includes(caseState.programIntake?.stage)&&!(c.company==='fumigacion'&&caseState.programIntake?.stage==='correction'))){
          const fields=literalFields(caseState,turn,c.company);
          const contextualSize=c.company==='fumigacion'&&!fields.area?promptedSize(turn,caseState):undefined;
          if(contextualSize)fields.area=contextualSize;
          rememberFields(caseState,turn,c.company,fields);
          if(contextualSize)Object.assign(caseState.intakeSources.area,{context:'prior-size-question',unitExpanded:false});
          if(c.company==='fumigacion')retainPromptedLocation(caseState,turn);
          rememberAdditionalLiteralFields(s,c,caseState,turn);
          rememberIntakeTiming(caseState,turn,c.company);
        }
        if(literalIntakeTurn(e,c.company)&&Object.keys(extractSlots(e.text,c.company)).length)pendingQuestion=turns.filter(turn=>turn.id!==e.id&&turn.kind==='text'&&!turn.forwarded&&isCustomerQuestion(turn.text)).at(-1)||null;
      }
      rememberAdditionalLiteralFields(s,c,caseState,e);
      const programDeferral=ordinaryProgramDeferralTurn(s,c,caseState,e);
      if(programDeferral){
        s.audit(programDeferral.resumed?'OWN_CUSTOMER_DEFERRAL_RESUMED':'OWN_PROGRAM_CUSTOMER_DEFERRAL',e.id,{caseId:caseState.caseId,kind:programDeferral.kind,sourceId:e.id,acceptedByMarker:false,businessWritten:false,humanHoldReleased:false});
        if(!programDeferral.resumed){
          caseState.lastHandledSourceId=e.id;caseState.lastText=e.text;s.saveConversation(e.phone,caseState);
          if(!publicTextSafe(programDeferral.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
          s.queue(e.id+':reply',e.phone,e.line,programDeferral.reply,false,conv.revision,caseState.caseId);
          finish('OWN_PROGRAM_CUSTOMER_DEFERRAL');return;
        }
      }
      const caseQuoteTurn=mariaCaseQuoteCustomerTurn(s,c,caseState,e);
      const schedulingTurn=ownSchedulingCustomerTurn(s,c,caseState,e);
      if(schedulingTurn){schedulingTurn.state.lastHandledSourceId=e.id;schedulingTurn.state.lastText=e.text;s.saveConversation(e.phone,schedulingTurn.state);s.queue(e.id+':reply',e.phone,e.line,schedulingTurn.reply,false,conv.revision,caseState.caseId);finish('OWN_SCHEDULING_CUSTOMER_TURN');return;}
      if(c.company==='fumigacion'&&!e.forwarded&&['image','audio','document','video'].includes(e.kind)){
        const caseSource=ownCaseAnchor(s,c,caseState,e);
        let media=mariaMediaBurstContinuation({company:c.company,event:e,state:caseState,caseSource,sources:ownCaseLiteralSources(s,c,caseState,e),priorMarker:caseState.pendingMediaBurst,humanHold:Boolean(conv.hold)});
        const neutralImageReply=unscopedInitialImageReply(s,c,caseState,e);
        if(media&&!media.suppressed&&neutralImageReply)media={...media,reply:neutralImageReply};
        if(media){
          caseState.pendingMediaBurst=media.marker;caseState.lastHandledSourceId=e.id;caseState.lastText=e.text;
          s.saveConversation(e.phone,caseState);
          if(!media.suppressed){
            if(media.clarificationSourceId)caseState.pendingPestClarification={guard:MARIA_BATCH_INTAKE_GUARD,caseId:caseState.caseId,phone:e.phone,line:e.line,at:e.at,literalSourceId:media.clarificationSourceId,promptId:e.id+':reply',text:media.reply};
            routeCaseQuestion(s,c,{phone:e.phone,line:e.line,caseId:caseState.caseId,topic:'media-content-review',conditions:{kind:'unread-media',cycleSourceId:media.marker.firstSourceId},recipients:[SANDRA],source:media.marker.firstSourceId,
              text:'María Ángel · revisión de archivo. Contacto terminado en '+e.phone.slice(-4)+'. El cliente envió '+({image:'una imagen',audio:'un audio',document:'un documento',video:'un video'}[e.kind])+' para su solicitud. '+Object.entries(caseState.slots).filter(([k])=>['service','site','location','locationDetails','rooms','area','dimensions'].includes(k)).map(([k,v])=>({service:'Plaga indicada',site:'Tipo de inmueble',location:'Municipio',locationDetails:'Ubicación indicada',rooms:'Habitaciones',area:'Área informada',dimensions:'Medidas indicadas'}[k])+': '+questionExcerpt(v)).join('; ')+'. El archivo todavía no se ha revisado. ¿Qué dato aporta sobre la plaga o el lugar que debemos tener en cuenta para atender este caso?'});
            if(!publicTextSafe(media.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
            s.queue(e.id+':reply',e.phone,e.line,media.reply,false,conv.revision,caseState.caseId);
          }
          s.saveConversation(e.phone,caseState);
          s.audit('OWN_MEDIA_BATCH_CONTINUED',e.id,{guard:MARIA_BATCH_INTAKE_GUARD,caseId:caseState.caseId,suppressed:media.suppressed,sourceIds:media.marker.sourceIds,acknowledgedFields:media.acknowledgedFields,missing:media.missing,interpretedMedia:false,businessWritten:false,humanHoldReleased:false});
          finish(media.suppressed?'OBSERVED_MEDIA_BURST':'MEDIA_CONTEXT_CONTINUED');return;
        }
      }
      const staffStatus=staffPlanningCustomerTurn(s,c,caseState,e,{status:ownPendingCustomerKind(e)==='status'});
      if(staffStatus){staffStatus.state.lastHandledSourceId=e.id;staffStatus.state.lastText=e.text;s.saveConversation(e.phone,staffStatus.state);if(staffStatus.reply)s.queue(e.id+':reply',e.phone,e.line,staffStatus.reply,false,conv.revision,caseState.caseId);finish(staffStatus.observedState||'OWN_REGISTERED_CUSTOMER_TURN');return;}
      if(caseState.awaitingHumanReview&&!caseQuoteTurn){
        const scopeFacts=pendingMattressScopeFactsTurn(s,c,caseState,e);
        if(scopeFacts){
          scopeFacts.state.lastHandledSourceId=e.id;scopeFacts.state.lastText=e.text;s.saveConversation(e.phone,scopeFacts.state);
          if(!publicTextSafe(scopeFacts.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
          s.queue(e.id+':reply',e.phone,e.line,scopeFacts.reply,false,conv.revision,caseState.caseId);
          s.audit('OWN_PENDING_MATTRESS_SCOPE_FACTS_RECEIVED',e.id,{caseId:caseState.caseId,scopeSourceId:caseState.requestedMattressScopeReview.sourceId,businessWritten:false,reviewPreserved:true});
          finish('PENDING_MATTRESS_SCOPE_FACTS');return;
        }
        const information=pendingOrdinaryDataInformationTurn(s,c,caseState,e);
        if(information){
          caseState.lastHandledSourceId=e.id;caseState.lastText=e.text;s.saveConversation(e.phone,caseState);
          if(!publicTextSafe(information.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
          s.queue(e.id+':reply',e.phone,e.line,information.reply,false,conv.revision,caseState.caseId);
          s.audit('OWN_PENDING_REGISTRATION_INFORMATION',e.id,{caseId:caseState.caseId,questionId:information.questionId,topic:information.topic,accepted:false,businessWritten:false,humanHoldReleased:false,reviewPreserved:true});
          finish('PENDING_REGISTRATION_INFORMATION');return;
        }
        const pendingTurn=ownSavedPendingCustomerTurn(s,c,caseState,e);
        if(pendingTurn){
          pendingTurn.state.lastHandledSourceId=e.id;pendingTurn.state.lastText=e.text;s.saveConversation(e.phone,pendingTurn.state);
          if(!publicTextSafe(pendingTurn.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
          s.queue(e.id+':reply',e.phone,e.line,pendingTurn.reply,false,conv.revision,caseState.caseId);
          finish(ownPendingCustomerKind(e)==='cancellation-request'?'OWN_SAVED_CANCELLATION_REQUEST':'OWN_SAVED_PENDING_STATUS');return;
        }
        const validity=c.company==='fumigacion'&&mariaQuotationValidityTurn(caseState,e,ownQuotationValidityEntry(s,caseState,e));
        const scope=c.company==='fumigacion'&&mattressRoomScopeQuestion(caseState,e);
        if(validity||scope){
          const next=validity?.state||{...caseState,slots:{...caseState.slots}},reply=validity?.reply||MATTRESS_ROOM_SCOPE_REPLY;
          next.lastHandledSourceId=e.id;next.lastText=e.text;s.saveConversation(e.phone,next);
          if(!publicTextSafe(reply))throw new Error('EXTERNAL_TEXT_REJECTED');
          s.queue(e.id+':reply',e.phone,e.line,reply,false,conv.revision,caseState.caseId);
          s.audit('OWN_PENDING_CONCRETE_QUESTION_ACKNOWLEDGED',e.id,{caseId:caseState.caseId,kind:validity?'quotation-validity':'mattress-room-scope',newInternalQuestion:false,businessWritten:false,humanHoldReleased:false});
          finish('PENDING_CUSTOMER_CONCRETE_QUESTION');return;
        }
        if(literalIntakeTurn(e,c.company)){rememberFields(caseState,e,c.company);retainPromptedLocation(caseState,e);}
        const continuation=pendingCustomerReview(s,c,caseState,e);
        if(continuation){
          if(continuation.marker)caseState.pendingReviewReply=continuation.marker;
          caseState.lastHandledSourceId=e.id;caseState.lastText=e.text;s.saveConversation(e.phone,caseState);
          if(continuation.reply){if(!publicTextSafe(continuation.reply))throw new Error('EXTERNAL_TEXT_REJECTED');s.queue(e.id+':reply',e.phone,e.line,continuation.reply,false,conv.revision,caseState.caseId);}
          s.audit('OWN_PENDING_CUSTOMER_CONTINUED',e.id,{guard:MARIA_PENDING_CONVERSATION_GUARD,caseId:caseState.caseId,reason:continuation.reason,sourceReferences:continuation.sourceReferences,newInternalQuestion:false,humanHoldReleased:false});
          finish('PENDING_CUSTOMER_CONTINUED');return;
        }
        caseState.lastHandledSourceId=e.id;s.saveConversation(e.phone,caseState);finish('OBSERVED_REVIEW');return;
      }
      const priorFaq=caseState.pendingFaqQuestion;
      const quoteClarification=ownQuoteClarification(s,c,caseState,e);
      const quotationValidity=c.company==='fumigacion'&&mariaQuotationValidityTurn(caseState,e,ownQuotationValidityEntry(s,caseState,e));
      const faqQuestion=pendingQuestion|| (priorFaq&&literalIntakeTurn(e,c.company)?priorFaq:e);
      const documentSource=e.kind==='text'&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text)?(postServiceDocuments(e.text)?e:documentRequest):null;
      const controlSource=c.company==='fumigacion'&&e.kind==='text'&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text)?(requestedControl(e.text)?e:controlRequest):null;
      const followupSource=c.company==='fumigacion'&&e.kind==='text'&&!faqNeedsPersonalReview(e.text.replace(/garant[ií]a/gi,''))&&!paymentInquiry(e.text)&&!/\b(?:pague|pago|comprobante|transfer|consign|abono)\w*/.test(normalize(e.text))?(afterServiceRequest(e,analysis)?e:followupRequest):null;
      const currentContext=c.company==='fumigacion'&&mariaLiteralServiceContext(e);
      const literalContextSource=c.company==='fumigacion'&&e.kind==='text'&&!contextNeedsPersonalPriority(e.text,e)?(currentContext?.documentDetail&&literalContextRequest?literalContextRequest:currentContext?e:literalContextRequest):null;
      const faqClassificationText=mariaIncidentalPetMention(faqQuestion)?.classificationText??faqQuestion.text;
      let faq=c.company==='fumigacion'&&!documentSource&&!controlSource&&!followupSource&&!caseState.requestedAfterServiceReview&&!caseState.requestedControlReview&&e.kind==='text'&&!e.forwarded&&!unreadLinkOnly(e.text)&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text)&&!previousQuotation(e.text)&&!postServiceReturn(e.text)&&!plannedRevisit(e.text)&&faqQuestion.kind==='text'?selectCommonAnswer(textWithoutLinks(faqClassificationText),caseState.slots,s.approvedCustomerAnswers(),caseState.caseId):null;
      // An approved informational fragment cannot dispose of consent, client
      // data or a requested time in the same native message. Keep that whole
      // question on its ordinary review path; never trim it into intake facts.
      if(faq?.answer&&/\b(?:acepto|confirmo|agendame|programame|reservame|registrar|registra|pago|pagar|pague|abono|comprobante|transfer\w*|consign\w*|horario|disponibilidad|fecha|hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|me llamo|mi nombre|datos son correctos)\b|\b(?:nombre|direccion)\s*:|\ba las?\s+\d/.test(normalize(faqQuestion.text)))faq={topics:faq.topics,reason:'ADDITIONAL_UNVERIFIED_REQUEST'};
      let decision;
      const directedPurpose=directedNonserviceTurn(s,c,caseState,e);
      const productClarification=c.company==='fumigacion'&&caseState.requestedProductInquiry&&literalIntakeTurn(e)&&!contextNeedsPersonalPriority(e.text,e)&&(Object.keys(extractSlots(e.text,c.company)).length||/^(?:solo|solamente|unicamente) (?:el )?producto[.! ]*$/.test(normalize(e.text)));
      if(quotationValidity){
        decision=quotationValidity;
      }else if(caseQuoteTurn){
        decision=caseQuoteTurn;
      }else if(caseState.pendingSizeClarification?.sourceId===e.id){
        decision={state:caseState,sizeUnitClarification:true,reply:caseState.pendingSizeClarification.text};
      }else if(productClarification){
        decision=customerDecision(c.company,caseState,e,analysis);
      }else if(literalContextSource){
        decision=customerDecision(c.company,caseState,{...e,id:literalContextSource.id,at:literalContextSource.at,text:literalContextSource.text,forwarded:literalContextSource.forwarded},analysis);
        if(decision.review)decision.reviewSource=literalContextSource.id;
        decision.state.lastText=e.text;
      }else if(quoteClarification){
        decision=quoteClarification.decision;
        s.audit('OWN_QUOTATION_CLARIFICATION',e.id,{guard:OWN_QUOTE_CLARIFICATION_GUARD,caseId:caseState.caseId,quotationSource:quoteClarification.quotationSource,quotationMid:quoteClarification.quotationMid,entryId:quoteClarification.entry.id,priceCop:quoteClarification.entry.priceCop,businessWritten:false});
      }else if(documentSource){
        decision=customerDecision(c.company,caseState,{...e,text:documentSource.text,forwarded:documentSource.forwarded},analysis);
        decision.reviewSource=documentSource.id;decision.pendingQuestion=documentSource.text;decision.state.lastText=e.text;
      }else if(followupSource){
        decision=customerDecision(c.company,caseState,{...e,id:followupSource.id,at:followupSource.at,text:followupSource.text,forwarded:followupSource.forwarded},analysis);
        decision.state.lastText=e.text;
      }else if(controlSource){
        decision=customerDecision(c.company,caseState,{...e,id:controlSource.id,at:controlSource.at,text:controlSource.text,forwarded:controlSource.forwarded},analysis);
        decision.reviewSource=controlSource.id;decision.state.lastText=e.text;
      }else if(directedPurpose&&!pendingQuestion&&!priorFaq){
        decision=directedPurpose;
      }else if(c.company==='fumigacion'&&termiteFurnitureMention(e)){
        // The item is explicit even if no whole-property type was supplied.
        // Keep the normal customer decision priorities before its review.
        decision=customerDecision(c.company,caseState,e,analysis);
      }else if(faq?.answer){
        decision={state:{...caseState,lastText:e.text,pendingFaqQuestion:null},reply:faq.answer};
        s.audit('APPROVED_CUSTOMER_ANSWER_SELECTED',e.id,{caseId:caseState.caseId,topics:faq.topics,answers:faq.answerIds,sources:faq.sourceIds,originalQuestion:faqQuestion.id});
      }else if(faq?.missing?.some(x=>x==='service'||x==='site')&&!faq.missing.includes('verifiedProducts')){
        const field=faq.missing.includes('service')?'service':'site';
        decision={state:{...caseState,lastText:e.text,pendingFaqQuestion:{id:faqQuestion.id,text:faqQuestion.text,kind:'text'}},reply:field==='service'?'¿Para qué plaga necesitas el servicio?':'¿En qué tipo de inmueble necesitas el servicio?'};
      }else decision=pendingQuestion&&!caseState.requestedAfterServiceReview&&!quotationInquiry(pendingQuestion.text)?{state:{...caseState,lastText:e.text},reviewTopic:'customer-question',reviewConditions:{question:normalize(pendingQuestion.text),caseId:caseState.caseId},reviewSource:pendingQuestion.id,pendingQuestion:pendingQuestion.text,review:'Hay una pregunta pendiente en esta misma secuencia; el mensaje siguiente aporta datos, pero no sustituye esa pregunta.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.'}:customerDecision(c.company,caseState,e,analysis);
      if(pendingQuestion&&decision.review&&!decision.state.requestedAfterServiceReview){decision.reviewSource=pendingQuestion.id;decision.pendingQuestion=pendingQuestion.text;}
      const informationalFaq=Boolean(faq?.answer&&decision.reply===faq.answer&&!decision.review&&!decision.question);
      let selectedPrice=quoteClarification?.entry||null;
      const currentQuote=caseState.quotedPrice;
      const priceNow=currentQuote&&ownDeliveredQuoteEntry(s,caseState,e.phone,e.line,decision.state.slots)?.entry;
      const incidentalPetNote=c.company==='fumigacion'&&mariaIncidentalPetMention(e);
      const pureIncidentalPetNote=incidentalPetNote&&!normalize(incidentalPetNote.classificationText).replace(/[.!¡,;\s]+/g,'');
      if(pureIncidentalPetNote&&currentQuote&&priceNow?.id===currentQuote.entryId&&priceNow.priceCop===currentQuote.priceCop&&priceNow.source?.type==='direct_user_approved_schedule'&&!caseState.requestedAfterServiceReview&&!caseState.requestedControlReview&&!caseState.requestedDocumentReview&&!decision.review&&(!decision.question||decision.question.topic==='cotizacion-verificada')){
        const delivered=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND state IN ('DELIVERED','READ')").get(ownQuoteOutboxId(s,decision.state,e.phone,e.line),e.phone,e.line,caseState.caseId);
        if(delivered&&s.priceReplyStillValid(delivered))decision={state:decision.state,incidentalPetNote:true,reply:'Anoté: '+incidentalPetNote.text+'.'};
      }
      const amountAcceptance=e.kind==='text'&&e.fromMe===false&&!e.forwarded&&!e.quotedId&&priceNow&&acceptsOwnQuotedAmount(e.text,priceNow.priceCop,e.at);
      const deferral=caseState.customerDeferral;
      if(amountAcceptance&&deferral?.guard===CUSTOMER_DEFERRAL_GUARD&&deferral.active===true&&deferral.caseId===caseState.caseId&&deferral.line===e.line&&e.at>deferral.at&&!caseState.awaitingHumanReview&&!decision.literalServiceContext&&!decision.quoteClarification&&(!decision.review||decision.reviewTopic==='customer-question')&&!contextNeedsPersonalPriority(e.text,e)){
        // The current own delivered quote, not a bare affirmative or a marker,
        // supplies the expected amount. This resumes the ordinary guarded
        // intake path; it does not confirm a summary or authorize a reminder.
        decision={state:{...decision.state,customerDeferral:{...deferral,active:false,resumedBy:{kind:'verified-own-quotation-acceptance',sourceId:e.id,at:e.at,line:e.line,textHash:createHash('sha256').update(e.text).digest('hex'),quotationSourceId:currentQuote.sourceId,entryId:priceNow.id,priceCop:priceNow.priceCop}}}};
      }
      const explicitQuotationAcceptance=e.kind==='text'&&e.fromMe===false&&!e.forwarded&&!e.quotedId&&!caseState.programIntake&&!currentQuote?.accepted&&acceptsExplicitOrdinaryQuotation(e.text);
      const naturalAcceptance=acceptsOrdinaryQuotation(e.text)||Boolean(amountAcceptance)||explicitQuotationAcceptance;
      const timingIssue=c.company==='fumigacion'&&e.kind==='text'&&!e.fromMe&&!e.forwarded&&!e.quotedId&&currentQuote?.accepted&&caseState.programIntake?.customerName&&caseState.programIntake?.address&&['name','address','details','confirm','correction'].includes(caseState.programIntake.stage)&&!caseState.awaitingHumanReview&&!contextNeedsPersonalPriority(e.text,e)&&calendarProgramPreferenceIssue(e.text,e.at);
      if(timingIssue){
        const slots={...caseState.slots},intakeSources={...caseState.intakeSources};delete slots.preference;delete intakeSources.preference;
        const explanation=timingIssue==='weekday-mismatch'?'El día de la semana no coincide con esa fecha.':timingIssue==='past-date'?'La fecha u hora que indicas ya pasó.':timingIssue==='invalid-time'?'La hora indicada no es válida.':'Esa fecha no existe en el calendario.';
        decision={state:{...caseState,lastText:e.text,slots,intakeSources,programIntake:{...caseState.programIntake,stage:'details',requestedFields:['preference'],preview:null,promptId:e.id+':reply'}},invalidRequestedTiming:true,reply:explanation+' ¿Qué fecha y hora válidas prefieres?'};
      }
      // An affirmative amount without the quotation's delivery proof cannot
      // grant consent or silently issue a replacement quotation either.
      const unverifiedAmountAttempt=currentQuote&&!priceNow&&e.kind==='text'&&e.fromMe===false&&!e.forwarded&&!e.quotedId&&quotationAmountAffirmation(e.text,e.at)!==null;
      const continuingQuote=!ownStaffPlanningReceipt(s,c,{phone:e.phone,line:e.line,caseId:caseState.caseId})&&!decision.serviceAccessFacts&&!informationalFaq&&!decision.invalidRequestedTiming&&!decision.state.customerDeferral?.active&&!decision.quoteClarification&&!decision.literalServiceContext&&!decision.observed&&c.company==='fumigacion'&&currentQuote&&priceNow?.id===currentQuote.entryId&&priceNow.priceCop===currentQuote.priceCop&&
        ((!decision.review&&!decision.courtesy)||(naturalAcceptance&&(decision.courtesy||decision.reviewTopic==='customer-question')))&&!specialQuotation(textWithoutLinks(literalIntakeTextWithoutRegistrationFields(e.text)),decision.state.slots)&&
        (currentQuote.accepted||naturalAcceptance);
      if(continuingQuote){
        const delivered=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND state IN ('DELIVERED','READ')").get(ownQuoteOutboxId(s,decision.state,e.phone,e.line),e.phone,e.line,caseState.caseId);
        if(delivered&&s.priceReplyStillValid(delivered)){
          decision.state.quotedPrice={...currentQuote,accepted:true,acceptanceSource:currentQuote.acceptanceSource||e.id,acceptedAt:currentQuote.acceptedAt||e.at};
          const literalPreference=!e.forwarded&&!e.quotedId&&literalProgramPreference(e.text,e.at);
          const preference=literalPreference||decision.state.slots.preference;
          const operationalConfirmation=registeredTesaConfirmation(s,c,decision.state,e);
          if(literalPreference)decision.state.intakeSources={...decision.state.intakeSources,preference:{sourceId:e.id,at:e.at,context:'literal-customer-preference-pending-coordination'}};
          const staffTurn=staffPlanningCustomerTurn(s,c,decision.state,e);
          if(staffTurn)decision=staffTurn;
          else if(operationalConfirmation)decision=operationalConfirmation;
          else if(programEnabled(c)&&priceNow.source?.type==='direct_user_approved_schedule'&&decision.state.programIntake?.stage!=='registered'&&registrationQuoteReady(s,decision.state,e.phone,e.line)){
            if(preference)decision.state.slots.preference=preference;
            decision={state:decision.state};
          }else if(preference){
            decision.state.slots.preference=preference;
            decision={state:decision.state,question:{topic:'disponibilidad-y-tecnico',conditions:{...decision.state.slots,quotedPriceCop:currentQuote.priceCop,priceSource:priceNow.source.quoteId,...(decision.state.programServiceId?{programServiceId:decision.state.programServiceId}:{})}},reply:'Aún no tengo confirmado el horario del servicio.'};
          }else if(!decision.state.asked.includes('preference')){
            decision.state.asked.push('preference');decision={state:decision.state,reply:'¿Qué día y franja horaria prefieres para el servicio?'};
          }else decision={state:decision.state,reviewTopic:'missing-intake:preference',reviewConditions:{missing:'preference'},review:'La persona aceptó la cotización verificada, pero falta una preferencia de horario clara.',reviewQuestion:'¿Qué día y franja horaria prefiere esta persona?',reply:'Aún no tengo confirmado el horario del servicio.'};
        }else decision={state:decision.state,observed:true,observedState:'QUOTATION_DELIVERY_REVIEW'};
      }
      // A stored status without its complete original delivery proof cannot
      // grant acceptance, nor silently issue today's replacement price.
      if(c.company==='fumigacion'&&(naturalAcceptance||unverifiedAmountAttempt)&&currentQuote&&!priceNow&&!e.fromMe&&!e.forwarded&&!e.quotedId&&e.kind==='text'&&!caseState.customerDeferral?.active&&!caseState.awaitingHumanReview&&!decision.review&&!decision.literalServiceContext&&!decision.quoteClarification&&(!decision.question||decision.question.topic==='cotizacion-verificada')&&!contextNeedsPersonalPriority(e.text,e)){
        const original=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND internal=0 AND case_id=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(ownQuoteOutboxId(s,caseState,e.phone,e.line),e.phone,e.line,caseState.caseId);
        if(original&&currentQuote.entryId?.startsWith('approved-table-')&&s.priceReplyReference(original)){
          selectedPrice=null;decision={state:decision.state,quoteEvidenceReview:true,reply:'Antes de continuar, necesito verificar la cotización que te envié.'};
          s.audit('OWN_QUOTE_ACCEPTANCE_EVIDENCE_INCOMPLETE',e.id,{caseId:caseState.caseId,quotationOutboxId:original.id,firstDeliveryPresent:Boolean(s.db.prepare('SELECT 1 FROM meta WHERE key=?').get('first-delivery:'+original.id)),accepted:false,replacementQuoteIssued:false,businessWritten:false});
        }
      }
      if(c.company==='fumigacion'&&(naturalAcceptance||unverifiedAmountAttempt)&&currentQuote&&!priceNow&&!e.fromMe&&!e.forwarded&&!e.quotedId&&e.kind==='text'&&!caseState.customerDeferral?.active&&!caseState.awaitingHumanReview&&!decision.review&&!decision.literalServiceContext&&!decision.quoteClarification&&(!decision.question||decision.question.topic==='cotizacion-verificada')&&!contextNeedsPersonalPriority(e.text,e)){
        const uncertain=s.db.prepare("SELECT state FROM outbox WHERE id=? AND phone=? AND line=? AND internal=0 AND case_id=? AND state IN ('READY','SENDING','ACCEPTED','UNCERTAIN')").get(ownQuoteOutboxId(s,caseState,e.phone,e.line),e.phone,e.line,caseState.caseId);
        if(uncertain){selectedPrice=null;decision={state:decision.state,observed:true,observedState:'QUOTATION_DELIVERY_REVIEW'};}
      }
      const ordinaryInformation=ordinaryDataInformationTurn(s,c,decision.state,e);
      if(ordinaryInformation){selectedPrice=null;decision=ordinaryInformation;}
      if(c.company==='fumigacion'&&(!faq||faq.answer)&&!decision.mattressScopeClarification&&!decision.state.customerDeferral?.active&&!decision.registrationInformation&&!(currentQuote&&(naturalAcceptance||unverifiedAmountAttempt))&&(decision.question?.topic==='cotizacion-verificada'||decision.reviewTopic==='customer-question'&&quotationInquiry(e.text))){
        const selection=selectPrice(decision.state.slots,s.approvedPriceCatalogs(),null,{scheduleHash:businessPriceHashAt(e.at),issuedAt:e.at});
        if(selection.entry&&!e.forwarded&&!ambiguousIntake(e.text)&&!termiteFurnitureMention(e)&&!specialQuotation(textWithoutLinks(literalIntakeTextWithoutRegistrationFields(e.text)),decision.state.slots)){
          selectedPrice=selection.entry;
          decision={state:{...decision.state,quotedPrice:{entryId:selectedPrice.id,priceCop:selectedPrice.priceCop,slots:{...decision.state.slots},sourceId:e.id,...(selectedPrice.source?.scheduleHash?{scheduleHash:selectedPrice.source.scheduleHash,issuedAt:e.at}:{})}},reply:priceText(selectedPrice)};
          s.audit('REVIEWED_PRICE_SELECTED',e.id,{entryId:selectedPrice.id,priceCop:selectedPrice.priceCop,quoteSources:selection.sourceIds,caseId:caseState.caseId,businessWritten:false});
        }else if(!selection.entry&&decision.question?.topic==='cotizacion-verificada'){
          const table=selectBusinessPrice(decision.state.slots,{scheduleHash:businessPriceHashAt(e.at)});
          decision.question={...decision.question,conditions:{...decision.question.conditions,quotationGapReason:table.reason||'REVIEWED_CASE_PRICE_REQUIRED'}};
        }
      }
      if(faq&&!faq.answer&&decision.review){
        decision.reviewTopic='common-question';decision.reviewConditions={question:normalize(faqQuestion.text),topics:faq.topics,caseId:caseState.caseId};decision.reviewSource=faqQuestion.id;
        const subjects=faq.topics.map(faqTopicLabel).join(' y ');
        decision.pendingQuestion=faqQuestion.text;decision.review='Falta una respuesta comprobada sobre '+subjects+' para este servicio.';
        decision.reviewQuestion='¿Qué debemos explicarle sobre '+subjects+' en este caso?';
      }
      // Replies to a name/address/summary prompt are not new pest/property
      // descriptions. In particular a street number before "apartamento"
      // must not become a quantity of apartments for quotation scope.
      const literalProgramStage=['name','address','details','confirm','correction'].includes(caseState.programIntake?.stage);
      const priorProgramPrompt=caseState.programIntake?.promptId,repeatProgramAcknowledgement=registrationRepeatAcknowledgement(caseState,e);
      const registration=informationalFaq||decision.invalidRequestedTiming||decision.quoteClarification||decision.literalServiceContext||decision.quoteEvidenceReview||decision.directedNonservice?null:registrationTurn(s,c,caseState,e,literalProgramStage?{...decision,state:{...decision.state,slots:{...caseState.slots,...(decision.state.slots.preference?{preference:decision.state.slots.preference}:{})}}}:decision,{literalSlots:extractSlots});
      if(registration){
        if(registration.reply&&repeatProgramAcknowledgement&&priorProgramPrompt&&['name','address','details','correction'].includes(registration.state.programIntake?.stage)){
          const priorPrompt=s.db.prepare("SELECT body FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND internal=0 AND state IN ('DELIVERED','READ')").get(priorProgramPrompt,e.phone,e.line,caseState.caseId);
          if(priorPrompt&&s.open(priorPrompt.body)===registration.reply){registration.state.programIntake.promptId=priorProgramPrompt;registration.reply=null;registration.observed=true;registration.observedState='PROGRAM_FIELDS_ALREADY_REQUESTED';}
        }
        if(decision.serviceAccessFacts)s.audit('OWN_SERVICE_ACCESS_COLLECTION',e.id,{observedState:registration.observedState??null,hasReply:Boolean(registration.reply),businessWritten:false});decision=registration;
      }
       if(caseState.customerDeferral?.active===true&&decision.state.customerDeferral?.active===false&&decision.state.customerDeferral.resumedBy?.sourceId===e.id)s.audit('OWN_CUSTOMER_DEFERRAL_RESUMED',e.id,{caseId:caseState.caseId,deferralSourceId:caseState.customerDeferral.sourceId,resumeSourceId:e.id,kind:decision.state.customerDeferral.resumedBy.kind,humanHoldReleased:false,acceptanceGrantedByMarker:false});
      decision.state.lastHandledSourceId=e.id;
      const freshReception=c.company==='fumigacion'&&newCase&&newCaseSource.id===e.id&&literalOwnNewService(e);
      const firstGreeting=/^[¡! ]*(?:hola\b|buenos dias\b|buen dia\b|buenas tardes\b|buenas noches\b)/.test(normalize(e.text))&&(!conv.state.introduced||freshReception)&&decision.reply;
      const firstOrdinaryIntake=c.company==='fumigacion'&&(!conv.state.introduced||freshReception)&&(!conv.state.lastHandledSourceId||firstGreeting||freshReception)&&decision.reply&&!decision.state.programIntake&&!decision.state.pendingFaqQuestion&&!decision.directedNonservice&&!selectedPrice&&!faq?.answer&&!decision.courtesy&&!decision.review&&!decision.question&&!decision.observed;
      if(firstGreeting||firstOrdinaryIntake){
        if(firstOrdinaryIntake){
          const missing=decision.state.slots,requests=[];
          const pureGreeting=literalGreetingText(e.text);
          const staged=pureGreeting&&(!missing.service||genericPestDescription(missing.service)||!missing.location);
          if(!missing.service||genericPestDescription(missing.service))requests.push('Qué plaga deseas tratar o si buscas prevención.');
          if(staged){
            if(!missing.site)requests.push('Qué tipo de inmueble es.');
          }else if(normalize(missing.service).includes('chinches')){
            if(!missing.site)requests.push('Qué tipo de inmueble es.');
            if(!missing.mattresses)requests.push(furnitureExclusionForPresentation(decision.state,e)?'Cuántos colchones están afectados.':'Cuántos colchones están afectados y si también hay chinches en bases de cama u otros muebles.');
          }else if(!staged&&(!missing.site||!missing.area&&!missing.rooms))requests.push(!missing.site&&!missing.area&&!missing.rooms?'Qué tipo de inmueble es y cuántas habitaciones o metros cuadrados tiene.':!missing.site?'Qué tipo de inmueble es.':'Cuántas habitaciones o metros cuadrados tiene.');
          if(!missing.location)requests.push(missing.locationDetails?'El municipio donde necesitas el servicio; ya conservé la ubicación indicada.':'El municipio y barrio o vereda donde necesitas el servicio.');
          if(requests.length){
            decision.reply='Para ayudarte con la cotización, cuéntame:\n'+requests.map(x=>'• '+x).join('\n');
            decision.state.initialIntakeAllRequested=!staged||Boolean(missing.area||missing.rooms);
            const requested=staged?['service','site','location'].filter(field=>!missing[field]||field==='service'&&genericPestDescription(missing.service)):['service','site',normalize(missing.service).includes('chinches')?'mattresses':'size','location'].filter(field=>field==='size'?!missing.area&&!missing.rooms:!missing[field]||field==='service'&&genericPestDescription(missing.service));
            decision.state.initialIntakeRequestedFields=requested;
            decision.state.asked=[...new Set([...decision.state.asked,...requested])];
          }
        }
        decision.reply='Hola, soy '+c.bot+'. '+decision.reply;decision.state.introduced=true;
      }
      s.saveConversation(e.phone,decision.state);
      const labels={service:'Servicio',location:'Municipio confirmado por el texto',locationDetails:'Ubicación indicada',site:'Inmueble',area:'Área informada',dimensions:'Dimensiones literales; superficie no calculada',rooms:'Habitaciones informadas',mattresses:'Colchones afectados',roomScale:'Tamaño de las habitaciones',siteScale:'Tamaño del inmueble indicado',floors:'Pisos informados',patio:'Patio informado',treatmentScope:'Alcance informado',detail:'Falla informada',preference:'Preferencia'};
      const context=Object.entries(decision.state.slots).map(([k,v])=>(labels[k]||k)+': '+questionExcerpt(String(v))).join('; ').slice(0,650);
      if(decision.review){
        const restored=decision.state.requestedAfterServiceReview;
        let inheritedPending=null;
        if(c.company==='fumigacion'&&restored&&(restored.restoredFromQuotedSource?.quotedId===restored.sourceId||restored.restoredFromStoredSource?.originalId===restored.sourceId)&&decision.reviewTopic==='warranty-review'&&decision.reviewSource===restored.sourceId){
          const candidates=s.db.prepare("SELECT q.id,q.state,q.body FROM questions q JOIN outbox o ON o.id=q.outbox_id WHERE q.phone=? AND q.case_id=? AND q.recipient=? AND q.topic=? AND o.line=? AND q.state IN ('PENDING','ANSWER_REVIEW') AND o.state IN ('READY','SENDING','UNCERTAIN','ACCEPTED','DELIVERED','READ') ORDER BY q.rowid").all(e.phone,caseState.caseId,SANDRA,'revision:'+restored.sourceId,e.line);
          inheritedPending=candidates.find(q=>s.open(q.body).source===restored.sourceId)||null;
        }
        if(decision.reviewTopic==='service-documents'||c.company==='fumigacion'&&decision.reviewTopic==='special-quotation'){decision.state.awaitingHumanReview=true;s.saveConversation(e.phone,decision.state);}
        const history=s.conversationContext(e.phone,e.at,20,e.id);
        s.audit('CONVERSATION_CONTEXT_REVIEW',e.id,{caseId:caseState.caseId,turns:history.turns.length,storedCoverageComplete:history.completeStoredHistory,fullWhatsAppHistoryRead:false,originalMediaRead:false});
        const request=inheritedPending?{id:inheritedPending.id,state:inheritedPending.state,created:false,valid:false}:routeCaseQuestion(s,c,{phone:e.phone,line:e.line,caseId:caseState.caseId,topic:decision.reviewTopic||'revision:'+e.id,conditions:decision.reviewConditions|| (decision.reviewTopic?{question:normalize(e.text),caseId:caseState.caseId}:{event:e.id,caseId:caseState.caseId}),recipients:questionRecipients(c,decision.reviewTopic||'revision:'+e.id,decision.reviewConditions||{}),source:decision.reviewSource||e.id,
          text:c.name+': contacto terminado en '+e.phone.slice(-4)+'. '+decision.review+(decision.pendingQuestion?' Pregunta pendiente: '+questionExcerpt(decision.pendingQuestion)+'.':'')+' Mensaje actual: '+questionExcerpt(e.text)+(context?' Datos de esta solicitud: '+context+'.':'')+' '+(decision.reviewQuestion||'¿Cómo debemos continuar en este caso?')});
        if(request.created&&c.company==='fumigacion'&&decision.reviewTopic==='warranty-review'&&decision.reviewConditions?.kind==='warranty'){
          decision.specificCustomerQuestionReply='Lamento el inconveniente. Voy a pedir que un asesor revise tu solicitud de garantía. Conservé lo que ya nos contaste.';
          decision.reply=decision.specificCustomerQuestionReply;
        }
        if(request.created&&request.outboxId?.startsWith('tesa-question:')){decision.state.pendingTesaQuestionId=request.id;s.saveConversation(e.phone,decision.state);}
        if(!request.created&&(decision.reviewTopic?.startsWith('missing-intake:')||c.company==='fumigacion'&&decision.reviewTopic==='disponibilidad-y-tecnico'&&decision.reviewConditions?.kind==='reported-existing-schedule'||c.company==='servicio-tecnico'&&['customer-question','special-quotation'].includes(decision.reviewTopic)||['cotizacion-verificada','common-question','service-documents','service-followup','warranty-review','requested-technician-contact','payment-instructions','existing-quotation','unread-link'].includes(decision.reviewTopic))){
          decision.reply=decision.afterServiceMediaContinuation?decision.specificCustomerQuestionReply:inheritedPending&&(e.quotedId===restored.sourceId||restored.restoredFromStoredSource?.sourceId===e.id)?'Tu solicitud de garantía sigue pendiente de revisión.':null;
          s.audit('PENDING_CLARIFICATION_REUSED',e.id,{caseId:caseState.caseId,questionId:request.id,topic:decision.reviewTopic,newOutboundCreated:false});
        }
      }
      if(decision.question){
        const slots=decision.question.conditions;
        const summary=Object.entries(slots).map(([k,v])=>(labels[k]||k)+': '+questionExcerpt(String(v))).join('; ');
        const quoteOnly=decision.question.topic==='cotizacion-verificada';
        const request=routeCaseQuestion(s,c,{phone:e.phone,line:e.line,caseId:caseState.caseId,topic:decision.question.topic,conditions:slots,recipients:questionRecipients(c,decision.question.topic),source:pendingQuestion?.id||e.id,
          text:c.name+': solicitud del contacto terminado en '+e.phone.slice(-4)+'. '+summary+(quoteOnly?'. Falta confirmar el precio y la respuesta aplicable. ¿Qué cotización y texto vigente corresponden a esta solicitud?':decision.question.topic==='disponibilidad-y-tecnico'?(decision.state.programServiceId?'. La solicitud está guardada en el programa a nombre de María; no hay horario o técnico confirmados. ¿Qué disponibilidad y técnico corresponden a este caso?':'. La cotización fue entregada y aceptada; no hay reserva guardada ni horario o técnico confirmados. ¿Qué disponibilidad y técnico corresponden a este caso?'):'. Aún no hay técnico, horario ni precio confirmados. ¿Qué técnico, horario disponible y cotización corresponden a este caso?')});
        if(request.created&&request.outboxId?.startsWith('tesa-question:')){decision.state.pendingTesaQuestionId=request.id;s.saveConversation(e.phone,decision.state);}
        if(!request.created){
          decision.reply=null;
          if(c.company==='fumigacion'&&decision.state.programIntake?.stage==='registered'&&decision.question.topic==='disponibilidad-y-tecnico'&&request.id&&['ANSWERED','ANSWER_REVIEW'].includes(request.state)&&!request.valid){
            decision.reply='Necesito verificar nuevamente la disponibilidad para continuar.';
            decision.state.awaitingHumanReview=true;s.saveConversation(e.phone,decision.state);
            s.audit('OWN_SAVED_ORDER_OPERATIONAL_ANSWER_REVIEW',e.id,{caseId:caseState.caseId,questionId:request.id,answerState:request.state,newQuestionCreated:false,businessWritten:false,humanHoldReleased:false});
          }
        }
        else if(c.company==='fumigacion'){
          decision.reply=decision.question.topic==='disponibilidad-y-tecnico'?'Aún no tengo confirmado el horario del servicio.':'Tu cotización aún necesita confirmación.';
          decision.state.awaitingHumanReview=true;s.saveConversation(e.phone,decision.state);
        }
      }
      if(c.company==='fumigacion'&&(decision.review||decision.question)&&decision.state.programIntake?.stage!=='registered'){
        const continuation=pendingCustomerReview(s,c,decision.state,e);
        if(continuation){
          decision.reply=continuation.reply;
          if(continuation.marker)decision.state.pendingReviewReply=continuation.marker;
          s.saveConversation(e.phone,decision.state);
          s.audit('OWN_PENDING_CUSTOMER_CONTINUED',e.id,{guard:MARIA_PENDING_CONVERSATION_GUARD,caseId:caseState.caseId,reason:continuation.reason,sourceReferences:continuation.sourceReferences,newInternalQuestion:false,humanHoldReleased:false});
        }
      }
      // Preserve the concrete literal doubt after the generic pending-review
      // formatter. This adds no internal question or case/business authority.
      if(decision.specificCustomerQuestionReply&&decision.reply!==null)decision.reply=decision.specificCustomerQuestionReply;
      if(decision.reply){
        const office=selectOfficeReceptionReply(c.company,decision,{approvedAnswer:Boolean(faq?.answer)});
        decision.reply=adviserReply(c.company,decision,{firstReply:(!conv.state.lastHandledSourceId||freshReception)&&!decision.state.pendingFaqQuestion,approvedAnswer:Boolean(faq?.answer)});
        const sharedOffice=sharedOfficeSelectedReply(c.company,decision,decision.reply,{approvedAnswer:Boolean(faq?.answer)});
        if(sharedOffice)decision.reply=sharedOffice.text;
        if(!decision.review&&!decision.question&&!selectedPrice&&!faq?.answer){
          const proof=literalGreetingReplyProof(c,e,decision.state,decision.reply);
          if(proof){decision.state.literalGreetingReply=proof;s.saveConversation(e.phone,decision.state);}
        }
        if(!publicTextSafe(decision.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
        s.queue(e.id+':reply',e.phone,e.line,decision.reply,false,conv.revision,decision.courtesy?null:caseState.caseId);
        if(sharedOffice)s.audit('SHARED_QUICK_REPLY_SELECTED',e.id,{guard:sharedOffice.guard,version:sharedOffice.version,referenceIds:sharedOffice.ids,caseId:caseState.caseId,line:e.line,adapted:true,delivered:false,businessWritten:false});
        if(office&&decision.reply===office.text){
          saveOfficeReceptionReference(s,e,caseState.caseId,office);
          s.audit('OWN_OFFICE_RECEPTION_SELECTED',e.id,{guard:office.guard,version:office.version,catalogIds:office.catalogIds,ranges:office.ranges,reviewPreserved:true,businessWritten:false});
        }
        if(faq?.answer)s.saveApprovedReplyReference(e.id+':reply',{question:faqQuestion.text,context:caseState.slots,caseId:caseState.caseId,answer:faq.answer,finalText:decision.reply,answerIds:faq.answerIds,sourceIds:faq.sourceIds});
        if(selectedPrice)s.savePriceReplyReference(e.id+':reply',quoteClarification?.quotationReference?{...quoteClarification.quotationReference,finalText:decision.reply}:{entryId:selectedPrice.id,priceCop:selectedPrice.priceCop,context:{...decision.state.slots},finalText:decision.reply,...(selectedPrice.source?.scheduleHash?{scheduleHash:selectedPrice.source.scheduleHash,issuedAt:e.at}:{})});
      }
      finish(decision.observed?decision.observedState||'OBSERVED_CALL':decision.review?'REVIEW':decision.question?'WAITING_COORDINATOR':'DONE');
    });
  }
}
