import {BUSINESSES,SANDRA,knownInternalRecipient,normalize,publicTextSafe,outboundRecipientAllowed} from './config.mjs';
import {publicEventAllowed,publicResponseWindow} from './public-response-window.mjs';

export const MARIA_ADVISER_HANDOFF_GUARD='own-explicit-adviser-before-registration-and-exact-chief-customer-answer-v1';
const nativeText=e=>e?.kind==='text'&&e.fromMe===false&&!e.forwarded&&!e.quotedId&&typeof e.text==='string'&&e.text.length<=1500;
export function explicitMariaAdviserRequest(e){
 if(!nativeText(e)||/["“”«»]|https?:|www\./i.test(e.text))return false;
 const t=normalize(e.text).replace(/^[¿¡ ]+|[.!? ]+$/g,'').replace(/\s+/g,' ');
 return /^(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,! ]+)?(?:por favor )?(?:(?:un|una) (?:asesor|asesora|persona|humano|humana)|(?:necesito|quiero|quisiera|deseo|puedo|podria) (?:hablar|comunicarme|contactar|ser atendid[oa]) (?:con|por) (?:un|una|el|la) (?:asesor|asesora|persona|humano|humana)|(?:me puedes?|me podrias?|pueden|podrian) (?:pasar|comunicar) (?:con|a) (?:un|una|el|la) (?:asesor|asesora|persona|humano|humana)|(?:que |necesito que |quiero que )?me (?:atienda|responda|contacte|llame) (?:un|una|el|la) (?:asesor|asesora|persona|humano|humana))(?: por favor)?$/.test(t);
}

// A case-specific answer is sent only when Sandra explicitly supplies the
// customer-facing text while replying to the exact delivered own question.
// Other comments remain internal case knowledge, without inferred promises.
export function queueMariaChiefCustomerAnswer(store,config,question,event){
 if(config.company!=='fumigacion'||!config.enabled||event.phone!==SANDRA||event.fromMe!==false||event.forwarded||event.kind!=='text'||!event.quotedId||!['adviser-assistance','warranty-review','service-followup'].includes(question.topic))return null;
 const match=event.text.match(/^\s*(?:para el cliente|respuesta (?:al|para el) cliente)\s*:\s*([\s\S]+)$/iu);
 const text=match?.[1]?.trim();if(!text||text.length>1500||!publicTextSafe(text)||!outboundRecipientAllowed(config,question.phone)||knownInternalRecipient(question.phone))return null;
 const conv=store.conversation(question.phone),source=store.db.prepare('SELECT * FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(event.id,SANDRA,event.line);
 const original=store.db.prepare('SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND internal=1').get(question.outbox_id,SANDRA,event.line);
 const native=source&&store.open(source.body);
 if(!conv||conv.hold||conv.line!==event.line||conv.state.caseId!==question.case_id||!BUSINESSES.fumigacion.phones.includes(event.line)||!source||native.text!==event.text||native.at!==event.at||native.forwarded||native.quotedId!==event.quotedId||!original||original.mid!==event.quotedId||!['DELIVERED','READ'].includes(original.state)||event.at<original.created||publicResponseWindow(config).active&&!publicEventAllowed(config,source))return null;
 const id='chief-case-answer:'+question.id+':v1',prior=store.db.prepare('SELECT state,mid FROM outbox WHERE id=?').get(id);
 if(prior)return {id,state:prior.state,created:false};
 store.queue(id,question.phone,event.line,text,false,conv.revision,question.case_id);
 store.audit('OWN_CHIEF_CUSTOMER_ANSWER_QUEUED',event.id,{guard:MARIA_ADVISER_HANDOFF_GUARD,questionId:question.id,caseId:question.case_id,line:event.line,sourceId:event.id,outboxId:id,recipient:question.phone,businessWritten:false,humanHoldReleased:false,deliveryVerified:false});
 return {id,state:'READY',created:true};
}
