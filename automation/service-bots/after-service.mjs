import {normalize} from './config.mjs';
import {semanticFollowup} from './maria-understanding.mjs';

export const AFTER_SERVICE_GUARD='literal-followup-kind-and-first-source-before-new-intake-v1';
export const MARIA_LITERAL_SERVICE_CONTEXT_GUARD='own-affirmed-documents-arrival-schedule-and-product-context-before-intake-v1';
export const MARIA_INCIDENTAL_PETS_GUARD='own-current-incidental-pet-presence-without-safety-claims-v1';
function onlyCommercialPetContext(raw){
  // Inspect every sentence, including an unpunctuated explanation request.
  // A price question elsewhere cannot authorize dropping an additional query
  // about "las/ellos" or what the customer may do with the animals.
  const clauses=raw.match(/[^.!?;\r\n]+(?:[.!?;\r\n]+|$)/gu)||[];
  for(const clause of clauses){
    const t=normalize(clause);
    const reference=/\b(?:las|los|les|ellas|ellos|se)\s+(?:(?:las|los|les)\s+)?(?:pued\w*|deb\w*|dej\w*|qued\w*|sac\w*|llev\w*|manten\w*|retir\w*)\b/.test(t);
    const asks=/[¿?]/.test(clause)||/\b(?:(?:quisiera|quiero|necesito|me gustaria) saber|me preocupa|puedo|podria|debo|debemos|es posible|tengo que|tenemos que|explic\w*|orient\w*|recomiend\w*|aconsej\w*)\b/.test(t)||/^(?:\s*(?:y|pero)\s+)?\s*(?:como|cuando|donde|por que|cuanto|que (?:hago|debemos|cuesta|precio|datos|valor|costo))\b/.test(t)||/\b(?:y|pero|ademas)\s+(?:que|como|cuando|donde|cual|cuanto|por que)\b/.test(t)||reference;
    if(!asks)continue;
    const question=t.replace(/^[¿\s]+/u,'');
    // One identifiable commercial inquiry must lead the whole question. The
    // remainder may describe its scope, never introduce another request.
    const commercial=question.match(/^(?:(?:por favor|hola)[, ]+)?(?:(?:cuanto|que) (?:(?:me|nos) )?(?:cuesta|cuestan|vale|valen|costaria|valdria)|cual (?:es|seria) (?:el )?(?:precio|valor|costo)|que (?:precio|valor|costo) (?:tiene|tendria|manejan)|(?:me |nos )?(?:pueden|podrian|puedes|podrias) (?:cotizar(?:me|nos)?|(?:informar|decir)(?:me|nos)? (?:el )?(?:precio|valor|costo))|que (?:datos|informacion) (?:necesitan|requieren))\b/);
    if(!commercial||reference)return false;
    const rest=question.slice(commercial[0].length);
    if(/\b(?:que|como|cuando|donde|cual|cuanto|por que|pued\w*|podri\w*|deb\w*|quier\w*|quisier\w*|necesit\w*|saber|explic\w*|orient\w*|recomiend\w*|aconsej\w*|dentro|adentro|afuera|dej\w*|ellas|ellos|descuento|rebaja)\b/.test(rest))return false;
  }
  return true;
}
export function mariaIncidentalPetMention(e){
  if(e?.kind!=='text'||e.fromMe!==false||e.forwarded||e.quotedId||typeof e.id!=='string'||!e.id||!Number.isSafeInteger(e.at)||e.at<=0||typeof e.text!=='string')return null;
  const raw=e.text,t=normalize(raw);
  if(raw.length>8000||/["“”«»]|https?:|www\./i.test(raw)||/\b(?:no|nunca|sin|si|quizas|tal vez|en caso de|dijo|dice|dijeron|segun|vecin[oa]|un tercero)\b/.test(t))return null;
  // Presence is an intake note, never a safety answer. Any real request about
  // products, exposure, precautions or health keeps its existing review path.
  if(/\b(?:segur\w*|riesgo\w*|peligro\w*|toxic\w*|inofensiv\w*|producto\w*|quimic\w*|veneno\w*|insecticida\w*|plaguicida\w*|rodenticida\w*|afect\w*|dano\w*|salud|intoxic\w*|vomit\w*|mareo\w*|maread\w*|respir\w*|ingiri\w*|ingest\w*|convulsion\w*|alergic\w*|asma|dolor|enferm\w*|murio|lamio|comio|embaraz\w*|ninos?|bebes?|salir|salgan?|sacar|retirar|qued\w*|permanecer|volver|regresar|reingreso|ventilar|precaucion\w*|cuidado\w*|proteger\w*|exposicion)\b/.test(t))return null;
  const mentions=[...raw.matchAll(/\b(?:hay|tengo|tenemos)\s+(?:(?:una?|dos|tres|cuatro|cinco|varias?|algunas?|\d{1,2})\s+)?mascotas?\b/giu)];
  if(mentions.length!==1)return null;
  const mention=mentions[0],start=mention.index,end=start+mention[0].length;
  const before=raw.slice(0,start).split(/[.!?;\r\n]/).at(-1),after=raw.slice(end).split(/[.!;\r\n]/)[0];
  if(/[¿?]/.test(before)||/[¿?]/.test(after))return null;
  if(!onlyCommercialPetContext(raw))return null;
  return {guard:MARIA_INCIDENTAL_PETS_GUARD,sourceId:e.id,at:e.at,text:mention[0],classificationText:raw.slice(0,start)+' '+raw.slice(end)};
}
const plain=text=>normalize(String(text??'').replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi,' '));
const newService=/\b(?:otra solicitud|nuevo servicio|servicio nuevo|otro servicio|nueva fumigacion|fumigacion nueva)\b/g;
function affirmed(text,pattern){
  return [...text.matchAll(pattern)].some(m=>{
    const clause=text.slice(0,m.index).split(/[.!?;,]|\b(?:pero|sino|y)\b/).at(-1);
    // A denied request is not a new case. Keep negation across its request verb.
    return !/\b(?:no|nunca|sin)\b(?:\s+\p{L}+){0,6}\s*$/u.test(clause)&&! /\b(?:si|quizas|tal vez|en caso de)\b/.test(clause);
  });
}
const documentWords='(?:facturas?|certificados?|documentos?|soportes?|fichas (?:tecnicas|de seguridad)|permisos?|arl)';
const productWords='(?:geles?|gel|insecticidas?|plaguicidas?|rodenticidas?|productos?|insumos?|venenos?)';
function literalAffirmed(text,pattern){
  return [...text.matchAll(pattern)].some(match=>{
    const clause=text.slice(0,match.index).split(/[.!?;,]|\b(?:pero|sino)\b/).at(-1);
    return !/\b(?:no|nunca|sin|si|quizas|tal vez|en caso de)\b/.test(clause);
  });
}
// These are the sender's current requests/claims, never proof that a service,
// document, schedule, product sale or supplier agreement exists.
export function mariaLiteralServiceContext(e){
  if(e?.kind!=='text'||e.fromMe||e.forwarded)return null;
  const t=plain(e.text);
  const documents=new RegExp('\\b'+documentWords+'\\b').test(t);
  const productMention=new RegExp('\\b'+productWords+'\\b').test(t);
  const contextMention=documents||/\b(?:esperando (?:su|la) llegada|esperando (?:al|a la|el|la) (?:tecnico|tecnica|fumigador|fumigadora)|agendaron|programaron|programad[oa] (?:la |el )?(?:fumigacion|visita|servicio)|entonces (?:la|mi|nuestra) cita (?:es |queda )?para)\b/.test(t)||productMention&&/\b(?:comprar|adquirir|ofrecemos|ofrezco|vendemos|vendo|venden)\b/.test(t);
  const ordinaryNewRequest=literalAffirmed(t,/\b(?:quiero|necesito|requiero|busco|deseo|quisiera)\b[^.!?;,]{0,65}\b(?:fumigar|fumigacion nueva|nueva fumigacion|un servicio nuevo|una fumigacion)\b/g);
  const quoted=/\b(?:dijo|dice|comento|comentaron|segun|mi vecin[oa]|su vecin[oa]|un tercero)\b|["“”]/.test(t);
  const reference=()=>contextMention&&!ordinaryNewRequest?{kind:'context-reference',documentDetail:documents&&!quoted&&!/\b(?:no|nunca|sin|si|quizas|tal vez|en caso de)\b/.test(t),guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD}:null;
  if(quoted)return reference();
  const previousQuotation=literalAffirmed(t,/\b(?:(?:para )?(?:solicitar|contratar|pedir|tomar) (?:el|un|ese) servicio (?:de acuerdo (?:a|con)|segun) (?:la )?cotizacion (?:realizada|recibida|enviada)|(?:servicio )?preventivo como me lo enviaste en la cotizacion|(?:para )?(?:recordarte|recordarles|recordar) la solicitud que hice)\b/g);
  if(previousQuotation&&/\bcotizacion\b/.test(t))return {kind:'existing-quotation-reference',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD};
  if(documents){
    const prospective=/\b(?:antes de|antes del|para cotizar|si (?:los |les )?contrato|si (?:contratara|contratase|fuera)|en caso de contratar|(?:no|nunca) (?:me|nos) fumigaron)\b/.test(t);
    const request=literalAffirmed(t,new RegExp('\\b(?:necesito|requiero|solicito|solicitar|(?:de )?enviarme|enviame|envienme|enviarnos|mandame|mandenme|entreguenme|quiero recibir|(?:me|nos) (?:envian|envia|mandan|manda|entregan|entrega)|(?:me|nos) (?:puedes?|podrias?|pueden) (?:enviar|mandar|entregar))\\b[^.!?;,]{0,80}\\b'+documentWords+'\\b','g'));
    const requestedStatus=literalAffirmed(t,new RegExp('\\b(?:(?:depronto|de pronto) )?ya (?:me|nos) (?:tienes|tienen)\\b[^.!?;,]{0,40}\\b'+documentWords+'\\b','g'));
    const pending=literalAffirmed(t,new RegExp('\\b(?:(?:no|aun no|todavia no)\\s+(?:(?:me|nos)\\s+)?(?:(?:han|ha)\\s+)?(?:mandado|enviado|entregado|mandan|mandaron|envian|enviaron|entregan|entregaron)|(?:me|nos) faltan)\\b[^.!?;,]{0,70}\\b'+documentWords+'\\b','g'));
    const nominalPending=literalAffirmed(t,new RegExp('\\b(?:tengo|tenemos) pendientes?\\b[^.!?;,]{0,60}\\b'+documentWords+'\\b|\\b(?:siguen|sigue|estan|esta) pendientes?\\b','g'));
    const purpose=literalAffirmed(t,new RegExp('\\b(?:solo|solamente|unicamente) (?:es |seria )?para (?:el |la |un |una )?'+documentWords+'\\b','g'));
    if(purpose)return {kind:'documents-capability',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD};
    if(!prospective&&(request||requestedStatus||pending||nominalPending||new RegExp('^(?:por favor )?'+documentWords+'[.! ]*$').test(t)))return {kind:'documents-request',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD};
    if(/[?¿]/.test(e.text)||prospective&&request||/\b(?:entregan|emiten|dan|incluyen|ofrecen)\b/.test(t))return {kind:'documents-capability',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD};
  }
  if(literalAffirmed(t,/\b(?:estoy|estamos|sigo|seguimos) esperando (?:(?:su|la) llegada|(?:al|a la|el|la) (?:tecnico|tecnica|fumigador|fumigadora)|que llegue (?:el|la) (?:tecnico|tecnica|fumigador|fumigadora))\b/g))return {kind:'arrival',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD};
  const statedAppointment=/^entonces (?:la|mi|nuestra) cita (?:es |queda )?para\b/.test(t)&&!/\b(?:no|nunca|sin|si|quizas|tal vez|en caso de)\b/.test(t);
  if(statedAppointment||literalAffirmed(t,/\b(?:(?:ya )?(?:me|nos) (?:agendaron|programaron)|ya tengo programad[oa] (?:la |el |una |un )?(?:fumigacion|servicio|visita))\b/g))return {kind:'reported-existing-schedule',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD};
  if(productMention){
    if(/^veneno [\p{L}\d ]{1,60} (?:tiene|tienen)[?!. ]*$/u.test(t)&&!/["“”]/.test(e.text)&&!/\b(?:no|nunca|sin|si|quizas|tal vez|en caso de)\b/.test(t))return {kind:'product-commercial-question',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD};
    const offer=literalAffirmed(t,/\b(?:les ofrecemos|les ofrezco|ofrecemos|ofrezco|vendemos|vendo|comercializamos|somos proveedores|soy proveedor)\b/g);
    if(offer)return {kind:literalAffirmed(t,/\b(?:necesito|requiero|solicito)\b[^.!?;,]{0,60}\b(?:confirmacion|decision|respuesta|aprobar|aceptar)\b/g)?'supplier-decision':'supplier-offer',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD};
    if(literalAffirmed(t,/\b(?:(?:necesito|quiero|quisiera|requiero) (?:comprar|adquirir)|venden|comercializan|puedo comprar|pueden venderme)\b/g))return {kind:'product-commercial-question',guard:MARIA_LITERAL_SERVICE_CONTEXT_GUARD};
  }
  return reference();
}
export function afterServiceKind(text){
  const t=plain(text);
  const reinforcement=affirmed(t,/\brefuerzos?\b/g)&&!/\b(?:que es|en que consiste|que significa|requiere|incluye|incluido|tiene|hay|ofrecen)\b[^.!?]*\brefuerzo\b/.test(t);
  const verification=affirmed(t,/\b(?:verificacion|verificar|verifiquen|verificaci[oó]n)\b/g)&&
    !/\b(?:precio|cotizacion|pago|transferencia|comprobante|datos|direccion|identidad|disponibilidad)\b/.test(t)&&
    (/^(?:por favor\s+)?verificacion[.!? ]*$/.test(t)||/\b(?:servicio|tratamiento|fumigacion|visita|control de plagas)\b/.test(t));
  const warranty=affirmed(t,/\bgarantia\b/g)&&
    (/^(?:por favor\s+)?garantia[.!? ]*$/.test(t)||/\b(?:solicito|solicitamos|solicitar|necesito|necesitamos|requiero|requerimos|pedimos|reclamamos|reclamar|aplicar|hacer efectiva|es por|por la)\b[^.!?]*\bgarantia\b/.test(t));
  const kinds=[reinforcement&&'reinforcement',verification&&'verification',warranty&&'warranty'].filter(Boolean);
  if(!kinds.length)return null;
  if(affirmed(t,newService))return 'ambiguous-followup';
  return warranty?'warranty':reinforcement?'reinforcement':'verification';
}
export function explicitNewService(text){return affirmed(plain(text),newService)&&!afterServiceKind(text);}
export function afterServiceRequest(e,analysis={}){
  if(e.kind!=='text')return null;
  const kind=afterServiceKind(e.text);
  if(kind)return {kind,sourceId:e.id,at:e.at,directCustomerReport:!e.forwarded};
  const semantic=semanticFollowup(analysis,e);
  return semantic&&affirmed(plain(e.text),newService)?{...semantic,kind:'ambiguous-followup'}:semantic;
}
export function literalOwnAfterServiceRequest(e){
 if(e?.kind!=='text'||e.fromMe!==false||e.forwarded||typeof e.text!=='string'||/["“”]/.test(e.text)||/\b(?:dijo|dice|comento|comentaron|segun|mi vecin[oa]|su vecin[oa]|un tercero)\b/.test(plain(e.text)))return null;
 const kind=afterServiceKind(e.text);
 return kind&&kind!=='ambiguous-followup'?{kind,sourceId:e.id,at:e.at,directCustomerReport:true}:null;
}
export function afterServiceDecision(state,next,e,analysis={}){
  const current=afterServiceRequest(e,analysis),prior=state.requestedAfterServiceReview;
  if(!current&&!prior)return null;
  // Keep the first source; a new warranty claim adds its own source and route
  // rather than replacing an earlier operational request or its recipient.
  const reference=prior?{...prior}:current;
  if(current&&current.kind!==reference.kind){
    reference.additionalSources=[...(reference.additionalSources||[]).filter(s=>s.sourceId!==current.sourceId),current].slice(-8);
    if(reference.activeRequest?.kind!==current.kind)reference.activeRequest=current;
    if(current.kind==='warranty')reference.warrantySource||=current;
  }
  const active=reference.warrantySource||reference.activeRequest||reference;
  const labels={reinforcement:'refuerzo',verification:'verificación',warranty:'garantía','post-service':'seguimiento del servicio anterior','ambiguous-followup':'servicio nuevo y seguimiento'};
  const label=labels[active.kind],warranty=active.kind==='warranty',ambiguous=active.kind==='ambiguous-followup';
  return {state:{...next,requestedAfterServiceReview:reference},reviewSource:active.sourceId,
    reviewTopic:warranty||ambiguous?'warranty-review':'service-followup',
    reviewConditions:{kind:active.kind,directCustomerReport:active.directCustomerReport},
    review:'La persona solicita '+label+'. Hay que comprobar el antecedente y el alcance del mismo caso. La solicitud no acredita servicio realizado, cobertura de garantía, gratuidad, precio, horario, técnico ni reserva.'+(ambiguous?' Hay que aclarar cuál de las solicitudes necesita atender.':''),
    reviewQuestion:ambiguous?'¿Qué solicitud y antecedente corresponden a este caso?':'¿Qué antecedente y condiciones verificadas corresponden a esta solicitud de '+label+'?',
    reply:ambiguous?'Gracias. Revisaremos tu solicitud para confirmar cómo continuar.':'Con gusto. Tu solicitud de '+label+' quedó pendiente de revisión.'};
}
