import {normalize} from './config.mjs';
import {createHash} from 'node:crypto';

export const CUSTOMER_DEFERRAL_GUARD='own-direct-customer-will-consider-without-acceptance-or-reminder-v1';
const textHash=text=>createHash('sha256').update(text).digest('hex');
function direct(event){return event?.kind==='text'&&event.fromMe===false&&!event.forwarded&&!event.quotedId&&typeof event.text==='string'&&event.text.length<=600&&!/[?¿"“”«»<>]|https?:|www\./i.test(event.text)&&!/\b(?:vecin[oa]|dijo|dicen|segun|otra persona|tercero|pago|pague|comprobante|intoxic|embaraz|bebe|mascota|garantia|refuerzo|cancel)\w*/.test(normalize(event.text));}

/** A direct deferral supplies neither acceptance nor a request to be nudged. */
export function customerDeferralRequested(event){
 if(event?.kind!=='text'||event.fromMe!==false||event.forwarded||event.quotedId||typeof event.text!=='string'||event.text.length>240||/[?¿"“”«»<>]|https?:|www\./i.test(event.text))return false;
 const text=normalize(event.text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim();
 return /^(?:(?:muchas gracias|mil gracias|gracias) )?(?:(?:por ahora|por el momento|de momento) )?(?:lo voy a pensar|voy a pensarlo|lo pensare|dejame pensarlo|prefiero pensarlo|quiero pensarlo)(?: (?:y )?(?:te aviso|luego te aviso|despues te aviso|muchas gracias|gracias)){0,2}$/.test(text);
}

/** Literal facts are supplied by the existing source-scoped intake parser. */
export function customerDeferralResumeEvidence(event,literal={}){
 if(!direct(event)||customerDeferralRequested(event))return null;
 const t=normalize(event.text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim();
 if(/^(?:(?:si|ahora|ya) )?(?:quiero|deseo|necesito) (?:continuar|seguir|tomar el servicio|el servicio|contratar el servicio)(?: (?:con la cotizacion|con el servicio|por favor|gracias))?$/.test(t))return {kind:'explicit-request',sourceId:event.id,at:event.at,line:event.line,textHash:textHash(event.text)};
 if(/\b(?:no|nunca|todavia|aun|quizas|tal vez|si|cuando|pero|pensar|pensarlo|pensare)\b/.test(t))return null;
 // Name/address are supplied only by the registration caller after it verifies
 // the exact own delivered data prompt. They resume conversation, not consent.
 const fields=Object.entries(literal).filter(([field,value])=>['service','site','location','rooms','area','mattresses','name','address'].includes(field)&&typeof value==='string'&&normalize(event.text).includes(normalize(value)));
 return fields.length?{kind:'literal-intake',sourceId:event.id,at:event.at,line:event.line,textHash:textHash(event.text),fields:Object.fromEntries(fields)}:null;
}

export function customerDeferralContinues(event){return direct(event)&&/\b(?:(?:todavia|aun) no se si (?:quiero|voy a|debo)|lo voy a pensar|voy a pensarlo|prefiero pensarlo|lo pensare)\b/.test(normalize(event.text));}
export function customerDeclinesAfterDeferral(event){
 if(!direct(event))return false;
 const t=normalize(event.text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim();
 return /^(?:(?:muchas gracias|gracias) )?no (?:quiero|deseo|necesito|me interesa) (?:(?:tomar|contratar) )?(?:(?:el|este|ese|un) )?servicio(?: para (?:mi |el |este )?(?:casa|apartamento|inmueble))?$/.test(t);
}

/** A historical deferral stays excluded until its own later resume is proven. */
export function customerDeferralStillBlocks(state,turns){
 const deferred=turns.filter(customerDeferralRequested).at(-1);if(!deferred)return false;
 const marker=state.customerDeferral,resume=marker?.resumedBy,current=resume&&turns.find(turn=>turn.id===resume.sourceId);
 if(marker?.guard!==CUSTOMER_DEFERRAL_GUARD||marker.active!==false||marker.caseId!==state.caseId||marker.sourceId!==deferred.id||marker.at!==deferred.at||marker.line!==deferred.line||!current||current.phone!==deferred.phone||current.line!==deferred.line||current.at!==resume.at||current.at<=deferred.at||resume.line!==current.line||resume.textHash!==textHash(current.text))return true;
 const proof=customerDeferralResumeEvidence(current,resume.kind==='literal-intake'?resume.fields:{});
 return !proof||proof.kind!==resume.kind||proof.textHash!==resume.textHash;
}
