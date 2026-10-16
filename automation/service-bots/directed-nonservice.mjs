import {createHash} from 'node:crypto';
import {normalize,knownInternalRecipient} from './config.mjs';
import {operationalLineAllowed} from './line-scope.mjs';

export const DIRECTED_NONSERVICE_GUARD='own-direct-person-introduction-and-literal-object-purpose-v1';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=e=>createHash('sha256').update(JSON.stringify(canonical(e))).digest('hex');
const priority=/[?¿]|\b(?:habitacion(?:es)?|cuartos?|colchones?|metros?|fumig\w*|plagas?|cucarachas?|chinches?|roedores?|ratas?|ratones|comejen|termitas?|pulgas?|hormigas?|avispas?|mosquit\w*|cotiz\w*|precio|valor|cuanto|costo|agend\w*|program\w*|servicio\w*|tecnic\w*|garantia\w*|refuerzo\w*|visita\w*|document\w*|certific\w*|factur\w*|pago\w*|pague|pagar|cobr\w*|abono\w*|transfer\w*|devol\w*|comprob\w*|descuent\w*|gratis|cancel\w*|reclam\w*|queja\w*|denunci\w*|danad\w*|dano\w*|perdid\w*|robo|rob\w*|amenaz\w*|veneno\w*|producto\w*|toxic\w*|segur\w*|ninos?|ninas?|bebes?|embaraz\w*|mascotas?|perros?|gatos?|dolor\w*|sintoma\w*|enferm\w*|alerg\w*|asma\w*|segun|dijo|dice|dijeron|vecin\w*|tercer\w*|no|nunca)\b/;
const direct=e=>e?.kind==='text'&&e.fromMe===false&&!e.forwarded&&!e.quotedId&&typeof e.text==='string'&&typeof e.id==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(e.id)&&Number.isSafeInteger(e.at);
const intro=text=>/^(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,.! ]+)?(?:(?:don|senor|sr)\.? )?diego[,.:! ]+(?:soy|me llamo|mi nombre es) \p{L}/u.test(normalize(text).replace(/\s+/g,' ').trim());
const object=text=>/^(?:estos son|estos de las fotos son|son|aqui estan|aca estan|te envio|te mando|te comparto) (?:los |mis |estos )?audifonos(?: (?:jbl|wave|flex))*[.! ]*$/.test(normalize(text).replace(/\s+/g,' ').trim());
const neutral=text=>/^(?:hola|buenos dias|buen dia|buenas tardes|buenas noches|gracias|muchas gracias|ok|listo)[.! ]*$/.test(normalize(text).trim());
const serviceState=s=>Boolean(s.slots?.service||s.slots?.rooms||s.slots?.area||s.slots?.mattresses||s.quotedPrice||s.quotedCasePrice||s.programIntake||s.programServiceId||s.pendingTesaQuestionId||s.requestedAfterServiceReview||s.requestedControlReview||s.requestedDocumentReview||s.requestedProductInquiry||s.technicalServiceRequest||s.awaitingHumanReview||s.customerDeferral?.active);
function sameSource(store,state,event,marker){
 if(marker?.guard!==DIRECTED_NONSERVICE_GUARD||marker.caseId!==state.caseId||marker.phone!==event.phone||marker.line!==event.line||marker.at>=event.at)return false;
 const row=store.db.prepare("SELECT rowid position,body,state FROM events WHERE id=? AND phone=? AND line=? AND from_me=0").get(marker.sourceId,event.phone,event.line);
 if(!row||['PENDING','PROCESSING','UNRESOLVED'].includes(row.state))return false;
 const source=store.open(row.body);if(!direct(source)||source.id!==marker.sourceId||source.at!==marker.at||digest(source)!==marker.sourceHash||!intro(source.text)||priority.test(normalize(source.text)))return false;
 // A later service, uncertainty, media or unrelated turn cannot be hidden by
 // the earlier introduction. This bounded history is wording context only.
 const later=store.db.prepare('SELECT body,state FROM events WHERE phone=? AND from_me=0 AND rowid>? AND id<>? ORDER BY rowid LIMIT 13').all(event.phone,row.position,event.id);
 if(later.length>12)return false;
 return later.every(r=>{const e=store.open(r.body);return !['PENDING','PROCESSING','UNRESOLVED'].includes(r.state)&&direct(e)&&e.line===event.line&&e.at>=source.at&&e.at<=event.at&&!priority.test(normalize(e.text))&&(neutral(e.text)||object(e.text));});
}
/** Source-bound reply proposal only. Does not write, send, release or infer media. */
export function directedNonserviceTurn(store,config,state,event){
 if(store?.company!=='fumigacion'||config?.company!=='fumigacion'||!Array.isArray(config.lines)||!direct(event)||!/^57\d{10}$/.test(event.phone??'')||knownInternalRecipient(event.phone)||!operationalLineAllowed(config,event.line)||event.at<config.activatedAt||!state?.caseId?.startsWith('fumigacion:')||state.closed||state.humanHold||state.doNotContact||state.optOutGlobal||serviceState(state)||priority.test(normalize(event.text)))return null;
 const conv=store.conversation(event.phone);if(conv?.hold||conv?.state?.caseId!==state.caseId&&!(!conv?.state?.caseId&&state.caseId==='fumigacion:'+event.id))return null;
 if(intro(event.text)){
  const marker={guard:DIRECTED_NONSERVICE_GUARD,caseId:state.caseId,phone:event.phone,line:event.line,sourceId:event.id,at:event.at,sourceHash:digest(event)};
  return {state:{...state,lastText:event.text,directedNonservicePurpose:marker},directedNonservice:true,reply:'¿En qué podemos ayudarte?'};
 }
 if(object(event.text)&&sameSource(store,state,event,state.directedNonservicePurpose))return {state:{...state,lastText:event.text},directedNonservice:true,reply:'Recibí tu mensaje sobre los audífonos. ¿En qué podemos ayudarte con ellos?'};
 return null;
}

/** Only an initial image with no textual or verified service context. */
export function unscopedInitialImageReply(store,config,state,event){
 if(store?.company!=='fumigacion'||config?.company!=='fumigacion'||!Array.isArray(config.lines)||event?.kind!=='image'||event.fromMe!==false||event.forwarded||event.quotedId||typeof event.text!=='string'||event.text.trim()||!operationalLineAllowed(config,event.line)||event.at<config.activatedAt||!state?.caseId?.startsWith('fumigacion:')||Object.keys(state.slots||{}).length||state.pendingMediaBurst||state.pendingFaqQuestion||state.closed||state.humanHold||state.doNotContact||state.optOutGlobal||serviceState(state))return null;
 const anchor=store.db.prepare('SELECT rowid position,line FROM events WHERE id=? AND phone=? AND from_me=0').get(state.caseId.slice('fumigacion:'.length),event.phone);
 if(!anchor||anchor.line!==event.line)return null;
 const prior=store.db.prepare('SELECT body,state FROM events WHERE phone=? AND rowid>=? AND id<>? AND at<=? ORDER BY rowid LIMIT 51').all(event.phone,anchor.position,event.id,event.at);
 if(prior.length>50||prior.some(r=>{const e=store.open(r.body);return ['PENDING','PROCESSING','UNRESOLVED'].includes(r.state)||!direct(e)||e.line!==event.line||!neutral(e.text);}))return null;
 return 'Recibí tu imagen. Cuéntame qué necesitas revisar.';
}
