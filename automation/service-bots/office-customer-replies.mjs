// Direct user, 19 October 2026: complete and order the supplied office replies.
// These are reception texts, not a new price, product protocol or entitlement.
// A concrete answer verified for the case always keeps priority over this copy.
import {createHash} from 'node:crypto';
import {normalize,publicTextSafe} from './config.mjs';
import {officeResponseCatalog,OFFICE_RESPONSE_CATALOG_VERSION} from './office-response-catalog.mjs';

export const OFFICE_CUSTOMER_REPLY_GUARD='own-reviewed-office-reception-by-topic-without-new-policy-v1';
export const OFFICE_CUSTOMER_REPLY_SOURCE=Object.freeze({
 file:'RESPUESTAS_FUMIGACION_OFICINA (1).xlsx',
 sha256:'26d1086c045a62cde5fe480d30c0d2f208557772133558014282577b56f24388',
 authority:'direct-user-chat-20261019-complete-office-quick-replies',
 company:'fumigacion'
});

// The pending fact stays explicit. No variable brackets, universal durations,
// product names, payment accounts, discounts or warranty periods are supplied.
const common=Object.freeze({
 duration:Object.freeze({row:37,text:'La duración depende del área y de lo que se deba tratar. Aún falta confirmar el tiempo estimado para tu servicio. Las indicaciones para regresar al inmueble se confirman por separado.'}),
 treatment:Object.freeze({row:40,text:'El producto y el método dependen de la plaga y las condiciones del lugar. Aún falta confirmar cuáles corresponden a tu caso y sus indicaciones.'}),
 safety:Object.freeze({row:36,text:'El tiempo y las condiciones para regresar dependen del producto y del tratamiento. Aún falta confirmar las indicaciones específicas para tu caso.'}),
 preparation:Object.freeze({row:33,text:'La preparación debe corresponder al tratamiento que se realizará. Aún falta confirmar las indicaciones para tu inmueble y las condiciones que debamos tener presentes.'}),
 cleaning:Object.freeze({row:49,text:'Antes de limpiar las zonas tratadas, necesitamos confirmar qué superficies se intervinieron y las indicaciones del producto aplicado. Aún no tengo confirmado qué puedes limpiar ni cuándo.'}),
 inclusions:Object.freeze({row:43,text:'El alcance y el número de visitas deben quedar claros en tu cotización. Aún falta confirmar qué incluye tu servicio y si una visita adicional tendría costo.'}),
 reinforcement:Object.freeze({row:41,text:'Para revisar una segunda aplicación necesitamos comprobar la primera visita y sus condiciones. Aún falta confirmar si corresponde un refuerzo y qué costo tendría en tu caso.'}),
 warranty:Object.freeze({row:45,text:'La cobertura, el plazo y las condiciones de garantía deben corresponder a tu servicio. Aún falta confirmarlos para tu caso antes de ofrecerte una garantía.'})
});
const special=Object.freeze({
 'payment-instructions':Object.freeze({row:55,text:'Para indicarte cómo pagar, falta confirmar el total de tu servicio y los medios de pago autorizados. Aún no tengo esos datos verificados para compartirte.'}),
 'service-documents':Object.freeze({row:54,text:'Recibí tu solicitud de documentos. Aún falta comprobar cuáles corresponden a tu servicio y confirmar su entrega.'}),
 'requested-technician-contact':Object.freeze({row:32,text:'Recibí tu solicitud de contacto. Aún falta confirmar qué medio está autorizado para atender tus dudas.'})
});
const allCopy=[...Object.values(common),...Object.values(special)];
export const OFFICE_CUSTOMER_REPLY_VERSION=createHash('sha256').update(JSON.stringify({guard:OFFICE_CUSTOMER_REPLY_GUARD,source:OFFICE_CUSTOMER_REPLY_SOURCE,catalog:OFFICE_RESPONSE_CATALOG_VERSION,common,special})).digest('hex');
export const officeReceptionTopics=()=>Object.keys(common);

// Match the whole request, including every clause. Topic detection alone is
// insufficient: "duration and do you serve this town?" has another question.
const receptionQuestions=Object.freeze({
 duration:/\b(?:cuanto (?:tiempo )?(?:dura|tarda|se demora)(?: (?:la visita|el servicio|la fumigacion))?|duracion (?:de la visita|del servicio)|cuanto se demoran)\b/g,
 treatment:/\b(?:que (?:productos?|tratamiento) (?:usan|aplican|utilizan)|que (?:aplican|usan|utilizan)|con que (?:fumigan|tratan)|como (?:fumigan|hacen el tratamiento))\b/g,
 safety:/\b(?:(?:cuando|en cuanto tiempo) (?:puedo|podemos) (?:entrar|ingresar|volver|regresar)|cuanto tiempo (?:debo|debemos) (?:estar|permanecer|quedar(?:me|nos)?) (?:fuera|afuera)|cuantas horas (?:fuera|afuera)|(?:es|son) toxic[oa]s?|(?:puedo|podemos) (?:quedarme|quedarnos|permanecer)|tengo que salir)\b/g,
 preparation:/\b(?:que debo hacer antes (?:del servicio|de la fumigacion|de (?:que )?(?:vengan|lleguen|fumiguen))|como (?:debo )?preparar (?:el lugar|el inmueble|la casa|el apartamento)|que preparacion (?:necesita|requiere) (?:el lugar|el inmueble|el servicio))\b/g,
 cleaning:/\b(?:(?:cuando|como) (?:puedo|podemos|debo|debemos) (?:limpiar|lavar|barrer|trapear)|cuando (?:limpiar|lavar|barrer|trapear))\b/g,
 inclusions:/\b(?:que (?:incluye|cubre) (?:el servicio|la fumigacion|la cotizacion))\b/g,
 reinforcement:/\b(?:incluye (?:una |la )?segunda (?:visita|aplicacion)|(?:necesito|quiero) (?:un )?refuerzo|(?:necesito|quiero) (?:una )?segunda (?:visita|aplicacion))\b/g,
 warranty:/\b(?:que garantia (?:tiene|ofrecen|dan)|tiene garantia|cuanto dura la garantia|que cubre la garantia)\b/g
});
function coversWholeReceptionQuestion(question,topics){
 if(!question)return false;
 let rest=question.replace(/^(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,.!\s]*/,'');
 for(const topic of topics)rest=rest.replace(receptionQuestions[topic],' ');
 rest=rest.replace(/\b(?:y|tambien|ademas|por favor|porfa|gracias)\b/g,' ');
 return /^[\s¿?¡!.,;:]*$/.test(rest);
}

export function selectOfficeReceptionReply(company,decision,{approvedAnswer=false}={}){
 if(company!=='fumigacion'||approvedAnswer||!decision?.review||!decision.reply||decision.observed||decision.courtesy||decision.specificCustomerQuestionReply||decision.literalServiceContext||decision.registrationInformation||decision.state?.programIntake?.stage==='registered')return null;
 let choices;
 if(decision.reviewTopic==='common-question'){
  const topics=decision.reviewConditions?.topics;
  if(!Array.isArray(topics)||!topics.length||topics.length>Object.keys(common).length||new Set(topics).size!==topics.length||topics.some(topic=>!Object.hasOwn(common,topic)))return null;
  // A reception note cannot silently answer only one part of a mixed request.
  const question=normalize(decision.pendingQuestion||decision.reviewConditions?.question||'');
  if(/\b(?:precio|cuesta|cuestan|vale|tarifa|descuento|pagar|tarjeta|horario|disponibilidad|tecnico|agendar|factura|certificado|cancel\w*|reprogram\w*|pague|comprobante|intoxic\w*|vomit\w*|embaraz\w*|asma|alergi\w*|dolor|amenaz\w*)\b/.test(question))return null;
  if(!coversWholeReceptionQuestion(question,topics))return null;
  choices=topics.map(topic=>({id:topic,...common[topic]}));
 }else if(Object.hasOwn(special,decision.reviewTopic)){
  // Keep first-person complaints, payments received and concrete file/case
  // details in their existing specialised paths rather than flattening them.
  if(decision.state?.requestedAfterServiceReview||decision.state?.requestedDocumentReview||decision.pendingQuestion&&/\b(?:pague|comprobante|intoxic\w*|vomit\w*|queja|reclamo|devolucion)\b/.test(normalize(decision.pendingQuestion)))return null;
  choices=[{id:decision.reviewTopic,...special[decision.reviewTopic]}];
 }else return null;
 const text=choices.map(choice=>choice.text).join('\n\n');
 if(!publicTextSafe(text)||/\[[^\]]+\]/.test(text))return null;
 const routes=choices.map(choice=>officeResponseCatalog.find(entry=>entry.row===choice.row));
 if(routes.some(entry=>!entry||entry.sourceSha!==OFFICE_CUSTOMER_REPLY_SOURCE.sha256))return null;
 return Object.freeze({guard:OFFICE_CUSTOMER_REPLY_GUARD,version:OFFICE_CUSTOMER_REPLY_VERSION,text,ids:choices.map(choice=>choice.id),catalogIds:routes.map(entry=>entry.id),ranges:choices.map(choice=>'RESPUESTAS!C'+choice.row+':D'+choice.row),reviewPreserved:true});
}

export function officeReceptionCopyIsCurrent(selection,text){
 if(selection?.guard!==OFFICE_CUSTOMER_REPLY_GUARD||selection.version!==OFFICE_CUSTOMER_REPLY_VERSION||selection.text!==text||!publicTextSafe(text)||!Array.isArray(selection.ids)||!selection.ids.length||new Set(selection.ids).size!==selection.ids.length)return false;
 const choices=selection.ids.map(id=>Object.hasOwn(common,id)?common[id]:Object.hasOwn(special,id)?special[id]:null);
 return choices.every(Boolean)&&choices.map(choice=>choice.text).join('\n\n')===text;
}

const hash=value=>createHash('sha256').update(value).digest('hex');
function sourceFingerprint(event){return hash(JSON.stringify([event.id,event.phone,event.line,event.at,event.kind,event.fromMe,Boolean(event.forwarded),event.quotedId??null,event.text]));}
export function saveOfficeReceptionReference(store,event,caseId,selection){
 if(!officeReceptionCopyIsCurrent(selection,selection?.text)||event?.fromMe!==false||event.kind!=='text'||!caseId?.startsWith('fumigacion:'))throw Error('OFFICE_RECEPTION_REFERENCE_REQUIRED');
 const reference={...selection,caseId,phone:event.phone,line:event.line,sourceId:event.id,sourceHash:sourceFingerprint(event)};
 store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('office-reception:'+event.id+':reply',store.seal(reference));
}
export function officeReceptionReplyStillValid(store,row){
 const link=store.db.prepare('SELECT value FROM meta WHERE key=?').get('office-reception:'+row.id);
 if(!link)return true; // Compatibility: never reinterpret or rewrite old replies.
 try{
  const reference=store.open(link.value);
  if(store.company!=='fumigacion'||row.internal||reference.phone!==row.phone||reference.line!==row.line||reference.caseId!==row.case_id||row.id!==reference.sourceId+':reply'||!officeReceptionCopyIsCurrent(reference,store.open(row.body)))return false;
  const current=store.conversation(row.phone);
  if(current.hold||current.revision!==row.revision||current.state.caseId!==row.case_id)return false;
  const source=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(reference.sourceId,row.phone,row.line);
  return Boolean(source&&sourceFingerprint(store.open(source.body))===reference.sourceHash);
 }catch{return false;}
}

// Keep the selectable copy inventory immutable and separate from workbook
// entries that require live quote/order/product/payment evidence.
export function officeReceptionCopyCount(){return allCopy.length;}
