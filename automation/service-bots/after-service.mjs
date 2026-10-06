import {normalize} from './config.mjs';
import {semanticFollowup} from './maria-understanding.mjs';

export const AFTER_SERVICE_GUARD='literal-followup-kind-and-first-source-before-new-intake-v1';
const plain=text=>normalize(String(text??'').replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi,' '));
const newService=/\b(?:otra solicitud|nuevo servicio|servicio nuevo|otro servicio|nueva fumigacion|fumigacion nueva)\b/g;
function affirmed(text,pattern){
  return [...text.matchAll(pattern)].some(m=>{
    const clause=text.slice(0,m.index).split(/[.!?;,]|\b(?:pero|sino|y)\b/).at(-1);
    // A denied request is not a new case. Keep negation across its request verb.
    return !/\b(?:no|nunca|sin)\b(?:\s+\p{L}+){0,6}\s*$/u.test(clause);
  });
}
export function afterServiceKind(text){
  const t=plain(text);
  const reinforcement=affirmed(t,/\brefuerzos?\b/g)&&!/\b(?:que es|en que consiste|que significa|requiere|incluye|incluido|tiene|hay|ofrecen)\b[^.!?]*\brefuerzo\b/.test(t);
  const verification=affirmed(t,/\b(?:verificacion|verificar|verifiquen|verificaci[oó]n)\b/g)&&
    !/\b(?:precio|cotizacion|pago|transferencia|comprobante|datos|direccion|identidad|disponibilidad)\b/.test(t)&&
    (/^(?:por favor\s+)?verificacion[.!? ]*$/.test(t)||/\b(?:servicio|tratamiento|fumigacion|visita|control de plagas)\b/.test(t));
  const warranty=affirmed(t,/\bgarantia\b/g)&&
    (/^(?:por favor\s+)?garantia[.!? ]*$/.test(t)||/\b(?:solicito|solicitar|necesito|requiero|reclamar|aplicar|hacer efectiva|es por|por la)\b[^.!?]*\bgarantia\b/.test(t));
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
