import {normalize,publicTextSafe} from './config.mjs';

export const TECHNICAL_INTAKE_CONTINUITY_GUARD='own-explicit-technical-new-case-and-intake-clarification-v1';
const clean=text=>typeof text==='string'?normalize(text).replace(/\s+/g,' ').trim():'';
const newTarget=/\b(?:(?:otro|nuevo)\s+(?:servicio|equipo)|(?:servicio|equipo)\s+nuevo)\b/g;
const request=/\b(?:quiero|quisiera|necesito|solicito|requiero|deseo|me gustaria|(?:me )?(?:puedes|podrias|pueden|podrian)\s+(?:agendar|programar|atender|revisar|reparar|cotizar|ayudarme))\b/g;
const uncertain=/\b(?:si tuviera|si hubiera|si quisiera|si necesitara|supongamos|hipotetic\w*|tal vez|quizas|no se si|saber si|saber que|me dijeron|me dijo|mi vecino|mi amigo|el cliente dice)\b/;
const negated=/\b(?:no|nunca|jamas|tampoco)\s+(?:(?:realmente|ahora|todavia)\s+)?(?:quiero|quisiera|necesito|solicito|requiero|deseo|es|se trata|estoy pidiendo)\b/;

export function explicitNewTechnicalCase(text){
 const t=clean(text).replace(/"[^"]*"|“[^”]*”|«[^»]*»|'[^']*'/g,' ');
 if(!t||technicalIntakeMetaQuestion(t))return false;
 if(/[¿?]/.test(t)&&/^[¿ ]*(?:necesito|debo|deberia|tengo que)\b/.test(t))return false;
 for(const target of t.matchAll(newTarget)){
  // A negative failure ("no enfría") is not a negated request. Evaluate
  // only the clause containing this actual new-service/equipment target.
  const before=t.slice(0,target.index),boundary=Math.max(before.lastIndexOf('.'),before.lastIndexOf(';'),before.lastIndexOf('?'),before.lastIndexOf('!'));
  const prefix=before.slice(boundary+1).trim(),clause=prefix+' '+target[0];
  if(uncertain.test(clause)||negated.test(clause)||/\b(?:por que|para que|que incluye|que significa|como funciona|pregunt\w*|saber|te refieres|ya te dije|ya les dije|ya habia dicho)\b/.test(prefix))continue;
  const affirmative=[...prefix.matchAll(request)].at(-1);
  if(affirmative&&prefix.length-affirmative.index<=120)return true;
  if(/^(?:es|se trata de)(?: un)?$/.test(prefix))return true;
  // A labelled answer with an actual equipment description is affirmative,
  // unlike an isolated "otro equipo" or a question about that phrase.
  const after=t.slice(target.index+target[0].length);
  if(!prefix&&/^[ ,:]+(?:una?\s+)?(?:nevera|refrigerador|lavadora|secadora|estufa|lavavajillas|horno|calentador)\b/.test(after))return true;
 }
 return false;
}

const metaPatterns=[
 /\b(?:por que|para que|como asi)\b.{0,100}\b(?:pregunt\w*|pides|piden|pediste|pidieron|solicit\w*)\b/,
 /\b(?:me|nos)\s+(?:vuelves?|vuelven|estas|estan)\s+(?:a\s+)?(?:pregunt\w*|pedir|pidiendo)\b/,
 /\b(?:ya|antes|anteriormente)\s+(?:(?:te|les|le)\s+)?(?:lo\s+)?(?:dije|dijimos|habia dicho|habiamos dicho|conte|contamos|explique|envie|indique|respondi)\b/,
 /\b(?:te|les|le)\s+(?:acabo de|volvi a|he)\s+(?:decir|explicar|indicar)\b/,
 /\b(?:sigues?|siguen|vuelves?|vuelven)\s+(?:a\s+)?(?:pregunt\w*|pedir)\b/,
 /\b(?:pregunt\w*|pides|pediste|piden|solicit\w*)\b.{0,100}\b(?:otra vez|de nuevo|nuevamente|lo mismo)\b/,
 /\b(?:que|cual|a que)\b.{0,40}\b(?:equipo|falla|horario)\b.{0,60}\b(?:te refieres|estas hablando|hablas|me estas preguntando)\b/,
 /\b(?:no me entiendes|no entendiste|no comprendes|eso ya lo dije|me repites|estas repitiendo)\b/
];
const fieldPatterns={
 service:/\b(?:equipo|aparato|nevera|refrigerador|lavadora|secadora|estufa|lavavajillas|horno|calentador)\b/,
 detail:/\b(?:falla|averia|dano|problema|que (?:tiene|le pasa)|no (?:enfria|enciende|centrifuga|funciona|calienta)|hace ruido|gotea|bota agua)\b/,
 preference:/\b(?:horario|hora|dia|fecha|franja|preferencia|manana|tarde|noche|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/
};
const literalCorrection=/\b(?:mi equipo|el equipo|mi aparato|la falla|el problema|la averia|mi preferencia|el horario|mi horario)\s+(?:es|era)\b|\b(?:es|era|son)\s+(?:una?\s+)?(?:nevera|refrigerador|lavadora|secadora|estufa|lavavajillas|horno|calentador)\b.{0,100}\b(?:no|en vez de|sino)\b/;
export function technicalIntakeLiteralCorrection(text){return literalCorrection.test(clean(text));}

export function technicalIntakeMetaQuestion(text){
 const t=clean(text);
 if(!t||!metaPatterns.some(pattern=>pattern.test(t)))return null;
 // These need their existing operational/exception routes, rather than a
 // factual interpretation of an earlier outgoing message by this helper.
 if(/\b(?:pague|pago|comprobante|transferencia|consignacion|abono|garantia|factura|certificado|precio|cotizacion|cancel\w*|reprogram\w*|vinieron|repararon|arreglaron|cita|contacto|telefono|numero del tecnico)\b|\b(?:me confirmaron|ya (?:esta|quedo) (?:confirmad\w*|programad\w*|agendad\w*))\b/.test(t))return null;
 // Explicit corrections remain in the normal literal-intake route; a
 // memory complaint must not freeze a formerly supplied, now wrong slot.
 if(technicalIntakeLiteralCorrection(t))return null;
 // If the complaint explains why the question repeats, its target before
 // "si ya / cuando ya" outranks the subsequently repeated intake facts.
 const target=t.split(/\b(?:si (?:ya )?(?:te |les |le )?|cuando ya |aunque ya )(?=dije|habia|he |te |les |le )/)[0];
 let fields=Object.entries(fieldPatterns).filter(([,pattern])=>pattern.test(target)).map(([field])=>field);
 if(!fields.length&&target!==t)fields=Object.entries(fieldPatterns).filter(([,pattern])=>pattern.test(t)).map(([field])=>field);
 return {kind:'technical-intake-clarification',field:fields.length===1?fields[0]:null,fields,guard:TECHNICAL_INTAKE_CONTINUITY_GUARD};
}

function literal(value){
 if(typeof value!=='string'||!value.trim()||value.length>300||!publicTextSafe(value)||/[\r\n]/.test(value)||/\b[^\s@]+@[^\s@]+\.[^\s@]+\b|\+?\b\d[\d ().-]{7,}\d\b/.test(value))return null;
 return value.trim();
}
export function technicalIntakeClarificationReply(question,slots={}){
 if(question?.kind!=='technical-intake-clarification'||question.guard!==TECHNICAL_INTAKE_CONTINUITY_GUARD)return null;
 const selected=question.field?[question.field]:question.fields?.length?question.fields:['service','detail','preference'];
 const fragments=[];
 for(const field of selected){
  const value=literal(slots[field]);if(!value)continue;
  if(field==='service')fragments.push('Seguimos con el equipo que me indicaste: '+value+'.');
  if(field==='detail')fragments.push('Conservo la falla que me indicaste: '+value+'.');
  if(field==='preference')fragments.push('Conservo tu preferencia: '+value+'.');
 }
 return fragments.length?fragments.join(' '):'Gracias por aclararlo. ¿Qué dato de tu solicitud quieres que aclaremos?';
}
