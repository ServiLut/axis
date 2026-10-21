import {createHash} from 'node:crypto';
import {knownInternalRecipient,normalize} from './config.mjs';

export const MARIA_PENDING_REVIEW_GUARD='own-native-case-pending-quote-consultation-without-new-authority-v2';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pendingStates=new Set(['PENDING','ANSWER_REVIEW','REVIEW']);
const topics=new Set(['service-followup','warranty-review','service-documents','disponibilidad-y-tecnico','cotizacion-verificada','special-quotation','existing-quotation']);
const followupKinds=new Set(['reinforcement','warranty','verification','requested-control','post-service','arrival']);
const norm=text=>normalize(text).replace(/\s+/g,' ').trim();
const sameIdentity=(source,event,caseId)=>source?.caseId===caseId&&source.phone===event.phone&&source.line===event.line;
const direct=source=>source?.kind==='text'&&source.fromMe===false&&!source.forwarded&&typeof source.id==='string'&&source.id.length>0&&Number.isSafeInteger(source.at)&&source.at>0&&typeof source.text==='string'&&source.text.trim().length>0&&source.text.length<=8000;
const nonliteral=text=>/["“”«»]|https?:|www\./i.test(text)||/\b(?:dijo|dice|dijeron|segun|mi vecin[oa]|un tercero|si fuera|en caso de|quizas|tal vez)\b/.test(norm(text));
const priority=text=>/\b(?:cancel\w*|reprogram\w*|reclamo\w*|queja\w*|devolucion\w*|amenaz\w*|abogad\w*|denuncia\w*|dolor\w*|intoxic\w*|vomit\w*|mareo\w*|maread\w*|respir\w*|ingiri\w*|convulsion\w*|alergi\w*|asma|embaraz\w*|bebes?|ninos?|pague|pagos?|comprobante\w*|transfer\w*|consign\w*|abono\w*|segur\w*|riesgo\w*|toxic\w*|veneno\w*|insecticida\w*|plaguicida\w*|quimico\w*|producto\w*|precaucion\w*|reingreso|mascotas?)\b/.test(norm(text));
const instruction=text=>/\b(?:ignora\w*|instrucciones|prompt|finge|asume|actua como|haz de cuenta|responde que|di que|dile que|confirma (?:el descuento|la garantia|el precio|la visita)|no revises|salta\w* (?:la|el) (?:revision|control))\b/.test(norm(text));
const otherCase=text=>/\b(?:otro (?:caso|servicio|cliente)|otra (?:solicitud|persona|direccion)|nuevo servicio|servicio nuevo|mi vecin[oa]|mi (?:mama|madre|papa|padre|herman[oa]))\b/.test(norm(text));
const statusText=text=>norm(text).replace(/[^\p{L}\p{N}¿?¡!,. :;\s]/gu,'').replace(/\s+/g,' ').trim().replace(/^[¿¡\s]+/,'');
const unansweredStatus=text=>/^(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,!. ]*)?(?:(?:aun |todavia )?no (?:recibi|he recibido|hemos recibido|recibimos) (?:una |la |su |tu )?respuesta|(?:necesito|necesitamos|requiero|solicito|me urge) (?:una |la |su |tu )?respuesta)(?: por favor)?[.!? ]*$/.test(statusText(text));
const explicitStatus=text=>/^(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,!. ]*)?(?:(?:sigo|seguimos|estoy|estamos|quedo|quedamos)\s+)?(?:muy\s+)?pendientes?(?: de (?:su|tu|una|la) (?:respuesta|confirmacion))?[.!? ]*$/.test(statusText(text))||/^(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,!. ]*)?(?:y entonces|entonces|me confirmas(?: por ?fa(?:vor)?)?|tienes respuesta|tienen respuesta|hay respuesta|como va(?: mi solicitud| el servicio)?|que (?:paso|pasa)(?: con mi solicitud)?|(?:aun |todavia )?estoy esperando|(?:sigo|seguimos) a la espera(?: de (?:su|tu|una|la) respuesta)?|(?:me )?puedes? responder(?: por favor)?|no me respondes|sigues ahi)[.!? ]*$/.test(statusText(text));
const greeting=text=>/^(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,.!? ]*$/.test(statusText(text));
const numberWord=new Map([['un',1],['una',1],['uno',1],['dos',2],['tres',3],['cuatro',4],['cinco',5],['seis',6],['siete',7],['ocho',8],['nueve',9]]);
const countValue=value=>numberWord.get(value)||Number(value);
const countLabel=count=>['cero','una','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'][count]||String(count);

function literalFacts(text){
 const t=norm(text),facts={};
 // Counts remain the customer's report. Never turn a reported intervention
 // into proof of a completed visit, entitlement or a program record.
 for(const clause of t.split(/[.!?;\r\n]/)){
  if(/\b(?:no|nunca|sin|si|quizas|tal vez|en caso de|dijo|dice|segun)\b/.test(clause))continue;
  const performed=/\b(?:(?:me|nos)\s+(?:(?:han|habian|ha)\s+)?(?:hecho|realizado|aplicado|hicieron|realizaron|aplicaron)|llevo|llevamos|he recibido|hemos recibido|he realizado|hemos realizado)\b/.test(clause);
  const fum=performed&&clause.match(/\b(un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|[1-9])\s+fumigacion(?:es)?\b/);
  const ref=performed&&clause.match(/\b(un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|[1-9])\s+refuerzos?\b/);
  if(fum)facts.fumigations=countValue(fum[1]);
  if(ref)facts.reinforcements=countValue(ref[1]);
  if(/\bcucarachas?\b/.test(clause)&&/\b(?:siguen|continuan|persisten|saliendo|salen|aun hay|todavia hay|mismo problema|(?:aun |todavia )?(?:seguimos|sigo|continuamos|continuo) con|no se (?:han )?(?:ido|acabado))\b/.test(clause))facts.persistingCockroaches=true;
 }
 if(/\b(?:necesito|necesitamos|quiero|queremos|requiero|solicito|quisiera|podrian|pueden|podemos|podria|puedes|por favor)\b/.test(t)&&/\b(?:refuerzos?|visita|servicio|garantia|verificacion|control)\b[^.!?;]{0,65}\bhoy\b|\bhoy\b[^.!?;]{0,65}\b(?:refuerzos?|visita|servicio|garantia|verificacion|control)\b/.test(t)&&!(/\b(?:no|nunca|si|quizas|tal vez|en caso de)\b/.test(t)))facts.todayRequested=true;
 if(/\b(?:descuento|descuentico|descuentito|rebaja)\b/.test(t)&&!/\b(?:no|nunca|sin|si|quizas|tal vez|en caso de)\b/.test(t))facts.discountRequested=true;
 const data=[];
 if(/\b(?:nombre(?: completo)?\s*[:=]|me llamo\b)/.test(t))data.push('nombre');
 if(/\b(?:direccion\s*[:=]|mi direccion es\b|calle\s+\d|carrera\s+\d)/.test(t))data.push('dirección');
 if(/\b(?:telefono|celular|correo)\s*[:=]/.test(t))data.push('contacto');
 if(/\b(?:municipio|barrio|vereda)\s*[:=]|\b(?:estoy|vivo|es) en (?:medellin|itagui|bello|envigado|sabaneta|copacabana|girardota|la estrella)\b/.test(t))data.push('ubicación');
 if(/\b\d{1,5}\s*(?:m2|mts2|metros cuadrados|habitaciones?|cuartos?)\b/.test(t))data.push('tamaño del inmueble');
 if(data.length)facts.receivedData=data;
 return facts;
}

function kindFor(state,pending){
 const reference=state.requestedAfterServiceReview;
 const kind=pending.caseKind||reference?.warrantySource?.kind||reference?.activeRequest?.kind||reference?.kind||(state.requestedControlReview?'requested-control':null);
 return followupKinds.has(kind)?kind:null;
}

function pendingText(topic,kind){
 if(topic==='service-documents')return 'Tu solicitud de documentos sigue pendiente de revisión. Aún no tengo confirmada su entrega.';
 if(['cotizacion-verificada','special-quotation','existing-quotation'].includes(topic))return 'Estoy consultando el valor y qué incluye el servicio para darte la cotización.';
 if(topic==='disponibilidad-y-tecnico')return 'Aún no tengo confirmados el horario ni el técnico para la visita.';
 if(kind==='arrival')return 'Aún no tengo una hora de llegada confirmada para esta visita.';
 if(kind==='warranty')return 'Tu solicitud de garantía sigue pendiente de revisión. Aún no tengo confirmadas la cobertura de garantía ni una visita.';
 if(kind==='post-service')return 'Aún falta verificar el antecedente del servicio y cómo atender lo que nos cuentas. No tengo una nueva visita confirmada.';
 const label={reinforcement:'refuerzo',verification:'verificación','requested-control':'control'}[kind];
 return label?'Tu solicitud de '+label+' sigue pendiente de revisión. Aún no tengo confirmadas las condiciones ni el horario de la visita.':null;
}

function pendingCostVisitQuestion(event){
 if(event.quotedId)return null;
 const t=norm(event.text);
 if(!/[?¿]/.test(event.text)&&!/^(?:y )?entonces\b|^(?:quisiera|necesito|quiero) saber\b|^me confirm(?:as|an)\b/.test(t))return null;
 const cost=/\b(?:gratis|gratuit[oa]|sin costo|sin cobro|sin pagar|costos?|costaria|cuesta|cobran|cobrarian|debo pagar|tengo que pagar|hay que pagar)\b/.test(t);
 const timing=t.match(/\b(?:pasado manana|manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2} de [a-z]+(?: de \d{4})?)\b(?:\s+a las?\s+\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?)?/)?.[0];
 const visitMention=/\b(?:vendria|vendrian|vendra|vendran|viene|vienen|venir|visita|visitarnos|fecha|horario|cuando)\b/.test(t);
 const visit=Boolean(visitMention&&(cost||timing)||cost&&timing);
 return cost||visit?{cost,visit,...(visit&&timing?{timing}:{})}:null;
}
function ownPendingExperienceConcern(event){
 if(event.quotedId||event.text.length>600)return false;
 const t=norm(event.text);
 if(/\b(?:matar|golpear|agredir|disparar|quemar|romper|destruir|lastimar|hacer(?:les)? dano|hacer dano|si|cuando)\b/.test(t))return false;
 const feeling=/\b(?:estoy|estamos|me siento|nos sentimos)\s+(?:muy\s+)?(?:molest[oa]s?|decepcionad[oa]s?|frustrad[oa]s?|desesperad[oa]s?|inconforme[s]?)\b/.test(t);
 const help=/\b(?:necesito|necesitamos|quiero|queremos|quisiera|solicito|requiero)\b[^.!?;]{0,45}\b(?:ayud\w*|solucion\w*|atiend\w*|atencion)\b/.test(t);
 const experience=/\b(?:esto|este servicio|la experiencia|mi experiencia)\b[^.!?;]{0,35}\b(?:porqueria|pesim[oa]|mal[oa]|terrible|decepcionante|desastre)\b|\bcomo quedo (?:el|mi) servicio\b/.test(t);
 return feeling&&(help||experience);
}

/**
 * Explain a known pending request on a NEW direct customer turn. The engine
 * supplies native sources selected inside this exact current case; this helper
 * does no I/O, changes no state and grants no review/hold/business authority.
 *
 * pending: {caseId,phone,line,sourceId,topic,state,caseKind?}
 * sources: native events plus their caller-verified caseId binding, including
 * the current event. lastReply is the previously returned marker, if any.
 */
export function mariaPendingReviewReply({company,state,event,hold=false,sources=[],pending,lastReply=null}={}){
 if(company!=='fumigacion'||!state?.caseId||hold||state.humanHold||state.closed||state.doNotContact||state.optOutGlobal||!direct(event)||knownInternalRecipient(event.phone)||!/^[1-9]\d{9,14}$/.test(event.phone||'')||!/^[1-9]\d{9,14}$/.test(event.line||''))return null;
 if(!pending||!pendingStates.has(pending.state)||!topics.has(pending.topic)||pending.caseId!==state.caseId||pending.phone!==event.phone||pending.line!==event.line||typeof pending.sourceId!=='string'||!Array.isArray(sources)||sources.length>256)return null;
 const current=sources.find(source=>source.id===event.id&&sameIdentity(source,event,state.caseId)&&direct(source)&&source.at===event.at&&source.text===event.text);
 const original=sources.find(source=>source.id===pending.sourceId&&sameIdentity(source,event,state.caseId)&&direct(source)&&source.at<=event.at);
 if(!current||!original||nonliteral(event.text)||priority(event.text)||instruction(event.text)||otherCase(event.text)||nonliteral(original.text)||priority(original.text)||instruction(original.text)||otherCase(original.text))return null;
 if(event.quotedId&&!sources.some(source=>sameIdentity(source,event,state.caseId)&&direct(source)&&(source.id===event.quotedId||source.mid===event.quotedId)))return null;
 const kind=kindFor(state,pending),factualPending=pending.caseKind==='wasp-inspection'?'Para las avispas, la cotización depende del tamaño y la altura del panal y requiere inspección. Aún no tengo un precio confirmado.':pendingText(pending.topic,kind);
 if(!factualPending)return null;
 const facts=literalFacts(event.text),unanswered=unansweredStatus(event.text),isStatus=explicitStatus(event.text)||unanswered||greeting(event.text);
 if(['service-followup','warranty-review'].includes(pending.topic)&&['reinforcement','warranty','verification','requested-control','post-service'].includes(kind)){
  const question=pendingCostVisitQuestion(event);if(question)facts.pendingQuestions=question;
 }
 if(['service-followup','warranty-review'].includes(pending.topic)&&followupKinds.has(kind)&&ownPendingExperienceConcern(event))facts.customerConcern=true;
 const labels={service:'plaga indicada',site:'tipo de inmueble',location:'municipio',locationDetails:'ubicación',rooms:'tamaño del inmueble',area:'tamaño del inmueble',dimensions:'medidas',preference:'preferencia de horario'};
 if(!/\b(?:no|nunca|sin|si|quizas|tal vez|en caso de)\b/.test(norm(event.text))){
  const supplied=Object.entries(labels).filter(([key])=>state.intakeSources?.[key]?.sourceId===event.id&&state.intakeSources[key].at===event.at&&typeof state.slots?.[key]==='string'&&norm(event.text).includes(norm(state.slots[key]))).map(([,label])=>label);
  if(supplied.length)facts.receivedData=[...new Set([...(facts.receivedData||[]),...supplied])];
 }
 if(!isStatus&&!Object.keys(facts).length)return null;
 const prior=lastReply||state.pendingReviewReply;
 if(prior?.guard===MARIA_PENDING_REVIEW_GUARD&&prior.caseId===state.caseId&&prior.phone===event.phone&&prior.line===event.line&&prior.sourceId===event.id)return null;
 const aspectScope=hash({topic:pending.topic,pendingSourceId:pending.sourceId,pendingState:pending.state,kind});
 const previousAspects=prior?.guard===MARIA_PENDING_REVIEW_GUARD&&prior.caseId===state.caseId&&prior.phone===event.phone&&prior.line===event.line&&prior.questionAspectScope===aspectScope&&Number.isSafeInteger(prior.questionAspectAt)&&event.at>=prior.questionAspectAt&&event.at-prior.questionAspectAt<60000&&Array.isArray(prior.questionAspectKeys)?prior.questionAspectKeys.filter(key=>typeof key==='string').slice(-16):[];
 const question=facts.pendingQuestions;
 const currentAspects=[...(question?[...(question.cost?['cost']:[]),...(question.visit?[question.timing?'visit:'+question.timing:'visit']:[])]:[]),...(facts.customerConcern?['customer-concern']:[])];
 const aspectSeen=key=>previousAspects.includes(key)||key==='visit'&&previousAspects.some(value=>value.startsWith('visit:'));
 // Within the same short conversation burst, a rephrasing does not create a
 // new aspect. New dates or a newly raised cost doubt still receive an answer.
 if(currentAspects.length&&currentAspects.every(aspectSeen)&&Object.keys(facts).length===1&&!isStatus)return null;
 const fingerprint=hash({topic:pending.topic,pendingSourceId:pending.sourceId,pendingState:pending.state,kind,facts});
 if(prior?.guard===MARIA_PENDING_REVIEW_GUARD&&prior.caseId===state.caseId&&prior.phone===event.phone&&prior.line===event.line&&prior.factsHash===fingerprint&&Number.isSafeInteger(prior.at)&&event.at>=prior.at&&event.at-prior.at<60000&&(!isStatus||prior.reason==='pending-status'))return null;
 const parts=[];
 if(unanswered&&kind==='warranty')parts.push('Lamento que sigas esperando una respuesta. Conservo tu solicitud de garantía y lo que ya nos contaste.');
 if(greeting(event.text)||/^hola\b/.test(norm(event.text)))parts.push('Hola.');
 if(facts.persistingCockroaches)parts.push('Lamento que el problema con las cucarachas continúe.');
 else if(facts.customerConcern)parts.push('Lamento la experiencia que nos cuentas.');
 if(facts.fumigations||facts.reinforcements){
  const reports=[];
  if(facts.fumigations)reports.push(countLabel(facts.fumigations)+' fumigaci'+(facts.fumigations===1?'ón':'ones'));
  if(facts.reinforcements)reports.push((facts.reinforcements===1?'un':countLabel(facts.reinforcements))+' refuerzo'+(facts.reinforcements===1?'':'s'));
  parts.push('Me indicas que ya llevas '+reports.join(' y ')+'.');
 }
 if(facts.receivedData?.length)parts.push('Gracias por la información.');
 if(facts.todayRequested&&facts.discountRequested)parts.push('Recibí tu solicitud de una visita para hoy y de un descuento. Aún no están confirmados ni la visita para hoy ni el descuento.');
 else if(facts.todayRequested)parts.push('Recibí tu solicitud de una visita para hoy. Aún no tengo confirmada la disponibilidad para hoy.');
 else if(facts.discountRequested)parts.push('Recibí tu solicitud de descuento. Aún no tengo un descuento autorizado para este caso.');
 if(question?.cost&&question.visit)parts.push('Aún no están confirmados el costo ni la visita'+(question.timing?' para esa fecha':'')+'.');
 else if(question?.cost)parts.push('Aún no tengo un costo confirmado para esta revisión.');
 else if(question?.visit)parts.push('Aún no tengo confirmadas la visita ni su fecha.');
 // The unresolved fact is explicit even when the internal question is reused.
 // A customer's follow-up never creates another internal question here.
 parts.push(unanswered&&kind==='warranty'?'Aún no tengo una solución ni una visita confirmadas para tu caso.':question?factualPending.split('. ')[0].replace(/\.$/,'')+'.':factualPending);
 const reply=parts.join(' '),reason=isStatus?'pending-status':question?'pending-cost-visit-question':facts.customerConcern?'pending-customer-concern':facts.persistingCockroaches?'pending-postservice-concern':facts.todayRequested||facts.discountRequested?'pending-additional-request':'pending-new-literal-information';
 const sourceReferences=[...new Map([original,current].map(source=>[source.id,{sourceId:source.id,at:source.at,phone:source.phone,line:source.line,caseId:state.caseId}])).values()];
 const questionAspectKeys=[...new Set([...previousAspects,...currentAspects])].slice(-16);
 const marker={guard:MARIA_PENDING_REVIEW_GUARD,caseId:state.caseId,phone:event.phone,line:event.line,sourceId:event.id,at:event.at,reason,factsHash:fingerprint,replyHash:hash(reply),...(questionAspectKeys.length?{questionAspectScope:aspectScope,questionAspectAt:previousAspects.length?prior.questionAspectAt:event.at,questionAspectKeys}:{})};
 return {guard:MARIA_PENDING_REVIEW_GUARD,reply,reason,sourceReferences,marker,...(unanswered&&kind==='warranty'?{warrantyResponseDelay:{pendingSourceId:pending.sourceId}}:{}),newInternalQuestion:false,businessWritten:false,humanHoldReleased:false};
}
