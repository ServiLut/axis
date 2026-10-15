import { normalize, SANDRA, DIEGO, CURRENT_OPERATOR_ROUTING,TECHNICAL_COORDINATOR,publicTextSafe, internalRecipients,knownInternalRecipient,internalName,questionRecipients } from './config.mjs';
import {selectCommonAnswer,commonQuestionTopics,faqNeedsPersonalReview,faqTopicLabel} from './faq.mjs';
import {chiefStatusTopic,chiefStatusReply} from './chief-status.mjs';
import {chiefReadOnlyTopic,chiefReadOnlyReply} from './chief-readonly.mjs';
import {selectPrice,priceText,quotationInquiry,specialQuotation,currentPriceEntries} from './prices.mjs';
import {adviserReply} from './adviser-tone.mjs';
import {literalIntakeTiming} from './intake-timing.mjs';
import {literalGreetingText,literalGreetingReplyProof} from './literal-reception.mjs';
import {CONVERSATIONAL_AI_GUARD,MIGUEL_CONVERSATIONAL_AI_GUARD,conversationalAiGuard} from './ai-settings.mjs';
import {ownIntent} from './maria-understanding.mjs';
import {ownMiguelIntent,miguelLiteralSlotAllowed} from './miguel-understanding.mjs';
import {literalPaintingRequest} from './technical-scope.mjs';
import {afterServiceKind,afterServiceRequest,afterServiceDecision,explicitNewService,mariaLiteralServiceContext,literalOwnAfterServiceRequest,MARIA_LITERAL_SERVICE_CONTEXT_GUARD,mariaIncidentalPetMention} from './after-service.mjs';
import {programEnabled,registrationQuoteReady,registrationTurn,acceptsOrdinaryQuotation,literalIntakeTextWithoutRegistrationFields,literalProgramPreference,prepareRegisteredTesaContinuation,registeredTesaConfirmation} from './maria-program.mjs';
import {createHash} from 'node:crypto';
import {tesaOperationalTopic} from './tesa-config.mjs';
import {prepareTesaQuestion,initializeTesaStore} from './tesa-operations.mjs';
import {formatMariaTesaQuestion} from './tesa-question-wording.mjs';
import {assertOperationalLineScope,operationalLineAllowed} from './line-scope.mjs';
import {ownQuoteClarification,OWN_QUOTE_CLARIFICATION_GUARD} from './own-quote-clarification.mjs';
import {explicitNewTechnicalCase,technicalIntakeMetaQuestion,technicalIntakeClarificationReply,technicalIntakeLiteralCorrection} from './technical-intake-continuity.mjs';
import {literalIntakeDimensions,MARIA_DIMENSIONS_GUARD} from './intake-dimensions.mjs';
import {parseChiefCommand,enqueueChiefCommand} from './chief-actions.mjs';

export const MARIA_AUTONOMOUS_INTAKE_GUARD='literal-ordinary-intake-without-staff-delegation-v1';
export const MARIA_AFTER_SERVICE_CONTINUITY_GUARD='own-same-case-stored-or-quoted-postservice-context-and-priority-preservation-v2';
export const MARIA_STAGED_GREETING_GUARD='own-pure-greeting-essential-fields-before-property-details-v1';

function rememberIntakeTiming(state,event,company){
 if(company!=='fumigacion'||state.programIntake||state.requestedAfterServiceReview||state.requestedProductInquiry||state.requestedControlReview||state.awaitingHumanReview)return null;
 const timing=literalIntakeTiming(company,event);if(!timing)return null;
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
  if(!config.tesaOperations?.enabled||!tesaOperationalTopic(request.topic,request.conditions)||questionRecipients(config,request.topic,request.conditions).every(phone=>phone===SANDRA))return store.questionToRecipients(request);
  const reference=createHash('sha256').update(config.company+':'+request.caseId).digest('hex').slice(0,12).replace(/[0-9]/g,d=>String.fromCharCode(65+Number(d)));
  const labels={service:'Servicio',location:'Municipio',site:'Inmueble',area:'Área',rooms:'Habitaciones',mattresses:'Colchones',detail:'Falla',preference:'Horario solicitado',question:'Petición literal'};
  const ownCase=store.conversation(request.phone)?.state,source=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND from_me=0').get(request.source,request.phone);
  // Carry a saved receipt's identifiers only into this new operational
  // request. The program module independently validates scope, actor, hash,
  // receipt and current case before it can prepare customer continuity.
  if(config.company==='fumigacion'&&request.topic==='disponibilidad-y-tecnico'&&ownCase?.caseId===request.caseId&&ownCase.programIntake?.stage==='registered'){
    const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+request.caseId),entry=row&&store.open(row.value);
    if(entry?.status==='SAVED'&&entry.receipt?.orderId&&Number.isSafeInteger(entry.payload?.quote?.priceCop))request={...request,conditions:{programServiceId:entry.receipt.orderId,quotedPriceCop:entry.payload.quote.priceCop,...request.conditions}};
  }
  const display={...(ownCase?.caseId===request.caseId?ownCase.slots:{}),...request.conditions};
  if(!display.question&&source)display.question=store.open(source.body).text;
  const facts=Object.entries(display).filter(([key,value])=>labels[key]&&typeof value==='string').map(([key,value])=>labels[key]+': '+groupField(value)).join('; ').slice(0,700);
  const question=request.conditions?.kind==='technical-painting'?'¿Ofrecemos la pintura solicitada y qué alcance está disponible para este caso?':request.conditions?.kind==='reported-existing-schedule'?'¿Cuál es la programación verificada de esta visita?':['cotizacion-verificada','special-quotation','existing-quotation'].includes(request.topic)?'¿Qué cotización corresponde a este caso?':request.topic==='requested-technician-contact'?'¿Qué contacto del técnico está autorizado para este caso?':request.topic==='service-followup'?'¿Cuál es el estado de llegada de este servicio?':request.topic.startsWith('missing-intake:')?'¿Qué dato verificado falta para continuar este caso?':'¿Qué disponibilidad, ruta y técnico corresponden a este caso?';
  const contextFacts=Object.fromEntries(Object.entries(display).filter(([key,value])=>labels[key]&&typeof value==='string').map(([key,value])=>[key,groupField(value)]));
  const text=config.company==='fumigacion'?formatMariaTesaQuestion({bot:config.bot,name:config.name,reference,last4:request.phone.slice(-4),lineLast4:request.line.slice(-4),facts,contextFacts,topic:request.topic,conditions:request.conditions}):config.bot+' · '+config.name+'. Ref '+reference+'; cliente …'+request.phone.slice(-4)+'; línea …'+request.line.slice(-4)+'. '+(facts?facts+'. ':'')+question;
  const result=prepareTesaQuestion(store,config,{...request,text});
  if(config.company==='fumigacion'&&result.created===true)prepareRegisteredTesaContinuation(store,config,request,result);
  return result;
}

const externalLinks = text => String(text??'').match(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi)||[];
const textWithoutLinks = text => String(text??'').replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi,' ').replace(/\[\s*(?:plaga|empresa\s*\/\s*hogar|municipio|barrio|tipo de inmueble)\s*\]/gi,' ');
const unreadLinkOnly = text => externalLinks(text).length>0&&!textWithoutLinks(text).trim();

function directed(text,name) {
  const t=normalize(text), n=normalize(name);
  const aliases=n==='maria angel'?'maria angel|mariangel':n;
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
    if(/\b(?:si|quizas|tal vez|posiblemente|en caso de|mi vecin[oa]|su vecin[oa]|un tercero)\b/.test(clause))continue;
    for(const match of clause.matchAll(/\b(?:medellin|bello|envigado|itagui|sabaneta|la estrella|copacabana|girardota|rionegro|(?:santa fe|santafe) de antioquia|sopetran)\b/g)){
      const prefix=clause.slice(0,match.index),suffix=clause.slice(match.index+match[0].length);
      if(/\b(?:no|nunca|sin)\b(?:\s+\p{L}+){0,6}\s*$/u.test(prefix)||/^\s+no\b/.test(suffix))continue;
      found.push(match[0]);
    }
  }
  const distinct=[...new Set(found)];
  if(distinct.length!==1)return undefined;
  // Preserve the existing literal source of the two external municipalities.
  return /sopetran|antioquia/.test(distinct[0])?String(text).match(/\b(?:(?:santa\s+fe|santaf[eé])\s+de\s+antioquia|sopetr[aá]n)\b/i)?.[0]:distinct[0];
}
export function extractSlots(text,company) {
  if(company==='servicio-tecnico'&&technicalIntakeMetaQuestion(text))return {};
  text=textWithoutLinks(company==='fumigacion'?literalIntakeTextWithoutRegistrationFields(text):text);
  const t=normalize(text), slots={};
  const pests={cucarachas:/\bcucarachas?\b/,hormigas:/\bhormigas?\b/,ratones:/\b(?:raton|ratones)\b/,ratas:/\bratas?\b/,chinches:/\bchinches?\b/,comején:/\bcomejen(?:es)?\b/,avispas:/\bavispas?\b/,roedores:/\broedores?\b/,mosquitos:/\bmosquitos?\b/,pulgas:/\bpulgas?\b/,zancudos:/\b(?:zancudos?|sancudos?)\b/,'arañas':/\baranas?\b/,moscas:/\bmoscas?\b/,chiripas:/\bchiripas?\b/,prevencion:/\bprevencion\b/,fumigacion:/\bfumigacion\b/};
  const found=company==='fumigacion'?Object.keys(pests).filter(s=>pests[s].test(t)):['nevera','lavadora','secadora','estufa','horno','calentador','aire acondicionado'].filter(s=>t.includes(s)&&miguelLiteralSlotAllowed('service',s,text));
  const specific=company==='fumigacion'?found.filter(s=>!['prevencion','fumigacion'].includes(s)):found;
  slots.service=(specific.length?specific:found).join(' y ')||undefined;
  const city=company==='fumigacion'?ordinaryLiteralMunicipality(text):['medellin','bello','envigado','itagui','sabaneta','la estrella','copacabana','girardota','rionegro'].find(s=>new RegExp('\\b'+s+'\\b').test(t)&&miguelLiteralSlotAllowed('location',s,text));
  if(city)slots.location=city;
  if(company==='fumigacion'){
    // A locative answer names a café as the place. Coffee drinks or colors
    // alone do not identify an inmueble, and no restaurant type is inferred.
    const properties={'casa finca':/\bcasas?\s+fincas?\b/,finca:/\bfincas?\b/,apartamento:/\b(?:apartamentos?|aptos?)\b/,casa:/\bcasas?\b/,restaurante:/\brestaurantes?\b/,local:/\blocal(?:es)?\b/,oficina:/\boficinas?\b/,bodega:/\bbodegas?\b/,'cafetería':/\bcafeterias?\b/,'café':/^(?:(?:es|seria)\s+)?en\s+(?:(?:el|un|nuestro|mi)\s+)?cafe\b/};
    slots.site=Object.keys(properties).find(site=>properties[site].test(t));
  }
  if(company==='fumigacion'){
    // An explicit square exponent is required for mt/mts abbreviations. Keep
    // the literal source; bare metres remain ambiguous for automatic pricing.
    slots.area=text.match(/\b\d{1,5}(?:[.,]\d{1,2})?\s*(?:m(?:ts?)?\s*(?:²|2)|m(?:ts?)?\.?\s*cuadrados?|metros?\s*cuadrados?)(?=$|[\s.,;:)])/i)?.[0];
    slots.dimensions=literalIntakeDimensions(text)?.literal;
    slots.mattresses=text.match(/\b(?:\d{1,3}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+colch[oó](?:n|nes)\b/i)?.[0];
    slots.affectedFurniture=/\b(?:bases? de cama|sofas?|muebles?)\b/.test(t)?'muebles mencionados; alcance por verificar':undefined;
    slots.roomScale=/\b(?:habitaciones?|cuartos?|piezas?)\s*\(?\s*pequen[oa]s?\b/.test(t)?'pequeños':/\b(?:habitaciones?|cuartos?|piezas?)\s*\(?\s*grandes?\b/.test(t)?'grandes':undefined;
    slots.siteScale=/\b(?:apartamento|apto|casa|local)\s+pequen[oa]\b/.test(t)?'pequeño':/\b(?:apartamento|apto|casa|local)\s+grande\b/.test(t)?'grande':undefined;
    slots.floors=text.match(/\b\d{1,2}(?:er|ro|do|to)?\s+(?:pisos?|niveles?)\b/i)?.[0];
    slots.patio=/\b(?:no (?:tiene|hay|tenemos)|sin) patio\b/.test(t)?'sin patio':/\bpatio\b/.test(t)?'patio':undefined;
    slots.treatmentScope=/\b(?:solo|solamente)\s+(?:el )?interior\b/.test(t)?'solo interior':/\b(?:solo|solamente)\s+(?:en )?(?:la )?cocina\b/.test(t)?'solo cocina':undefined;
    slots.rooms=text.match(/\b\d{1,3}\s*(?:habitaci[oó]n(?:es)?|cuartos?)\b/i)?.[0];
    // Keep an explicit written count as the source said it. Do not normalize it
    // into a digit, choose a count from a range, or adopt a negated description.
    if(!slots.rooms){
      const room=text.match(/\b(?:una?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:habitaci[oó]n(?:es)?|cuartos?)\b/i);
      const prefix=room?normalize(text.slice(0,room.index)).trim():'';
      if(room&&!/\b(?:no|sin|entre|o|y)(?:\s+(?:tiene|tenemos|son|hay|cuenta|con|una?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)){0,4}$/.test(prefix))slots.rooms=room[0];
    }
    // "Piezas" describes rooms only with an explicit property in this text;
    // an equipment part or an unrelated count must not become the home's size.
    if(!slots.rooms&&slots.site)slots.rooms=text.match(/\b\d{1,3}\s*piezas?\b(?!\s+(?:de|del|para|repuestos?|motor|maquina)\b)/i)?.[0];
  }
  return Object.fromEntries(Object.entries(slots).filter(([,v])=>v));
}
function literalFields(state,e,company){
  const fields=extractSlots(e.text,company);
  // A price followup naming the generic procedure does not replace the pest
  // already supplied in this case ("cuánto vale la fumigación").
  if(company==='fumigacion'&&fields.service==='fumigacion'&&state.slots.service&&!['fumigacion','prevencion'].includes(normalize(state.slots.service))&&quotationInquiry(e.text))delete fields.service;
  if(company==='fumigacion'&&fields.service&&state.slots.service&&/^(?:y|tambien|ademas)(?:\s+|[, :])/.test(normalize(e.text)))
    fields.service=[...new Set((state.slots.service+' y '+fields.service).split(' y '))].join(' y ');
  return fields;
}
function rememberFields(state,e,company,fields=literalFields(state,e,company)){
  state.intakeSources={...state.intakeSources};
  for(const [field,value]of Object.entries(fields)){
    const prior=state.intakeSources[field];
    const additive=company==='fumigacion'&&field==='service'&&/^(?:y|tambien|ademas)(?:\s+|[, :])/.test(normalize(e.text));
    const sources=additive?(prior?.sources|| (prior?.sourceId?[{sourceId:prior.sourceId,at:prior.at}]:[])):[];
    const all=[...sources,{sourceId:e.id,at:e.at}];
    state.slots[field]=value;
    state.intakeSources[field]={sourceId:e.id,at:e.at,...(field==='service'?{sources:[...new Map(all.map(s=>[s.sourceId,s])).values()]}:{})};
  }
}
export function parseUnderstanding(value,customerText,company='fumigacion') {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  customerText=textWithoutLinks(company==='fumigacion'?literalIntakeTextWithoutRegistrationFields(customerText):customerText);
  const fields=['service','location','site','detail','preference'];const result={};
  for(const key of fields) {
    const v=value.slots?.[key];
    // Extract only literal spans. An inferred price, schedule, diagnosis or instruction has no authority.
    if(typeof v==='string'&&v.length>=2&&v.length<=300&&!/[\[\]]/.test(v)&&normalize(customerText).includes(normalize(v)))result[key]=v;
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
  if(e.kind==='text'&&!e.forwarded&&(state.introduced||state.initialIntakeAllRequested||state.asked?.length)&&literalGreetingText(e.text))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},courtesy:true,greeting:true,reply:/buenas noches/.test(normalize(e.text))?'Buenas noches.':/buenas tardes/.test(normalize(e.text))?'Buenas tardes.':/buen(?:os dias| dia)/.test(normalize(e.text))?'Buen día.':'Hola.'};
  const currentLiteralContext=company==='fumigacion'&&mariaLiteralServiceContext(e);
  if(currentLiteralContext&&!contextNeedsPersonalPriority(e.text,e))return {...mariaLiteralContextDecision(state,e,currentLiteralContext),literalServiceContext:true};
  const literalText=textWithoutLinks(company==='fumigacion'?literalIntakeTextWithoutRegistrationFields(e.text):e.text).trim(),t=normalize(literalText);
  const literal=literalFields(state,e,company),existing={...state.slots,...literal};
  if(company==='fumigacion'&&!literalIntakeTurn(e)){delete literal.dimensions;delete existing.dimensions;if(state.slots.dimensions)existing.dimensions=state.slots.dimensions;}
  let understood=parseUnderstanding(analysis,e.text,company);
  const directOwnAi=[CONVERSATIONAL_AI_GUARD,MIGUEL_CONVERSATIONAL_AI_GUARD].includes(analysis?.guard);
  if(directOwnAi){
    // Direct AI may fill a missing literal field, never replace native facts.
    // Its result belongs to this exact incoming source, not another case/turn.
    const allowed=company==='fumigacion'?literalIntakeTurn(e):['new-service','clarification'].includes(ownMiguelIntent(analysis,e)?.kind)&&e.kind==='text'&&!e.forwarded&&!e.fromMe&&!unreadLinkOnly(e.text)&&!paymentInquiry(e.text)&&!postServiceDocuments(e.text)&&!serviceFollowup(e.text);
    if(analysis.guard!==conversationalAiGuard(company)||analysis.eventId!==e.id||analysis.company!==(company==='fumigacion'?'FUMIGACION':'S.TECNICO')||!allowed)understood={};
    else understood=Object.fromEntries(Object.entries(understood).filter(([k,v])=>!existing[k]&&(company!=='fumigacion'||k!=='location'||ordinaryLiteralMunicipality(v)&&normalize(ordinaryLiteralMunicipality(v))===normalize(literal.location))));
  }
  const next={...state,slots:{...existing,...understood},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)};
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
  if(/^(gracias|muchas gracias|muy amable|ok|listo)[.! ]*$/.test(t))return {state:next,reply:'Con gusto.'};
  if(company==='servicio-tecnico'&&!e.forwarded){
    const painting=state.technicalPaintingRequest||literalPaintingRequest(e);
    if(painting)return {state:{...next,technicalPaintingRequest:painting},reviewTopic:'special-quotation',reviewConditions:{kind:'technical-painting',requestSource:painting.sourceId},reviewSource:painting.sourceId,review:'La persona solicita pintura de una nevera. No consta que ofrezcamos ese trabajo; hay que confirmar el alcance y disponibilidad antes de preguntar por una avería o por horario.',reviewQuestion:'¿Ofrecemos el servicio de pintura solicitado y qué respuesta comprobada corresponde a este caso?',reply:'Con gusto. Aún falta confirmar si ofrecemos el servicio de pintura que necesitas.'};
  }
  if(/^(?:hola[, ]+)?(?:con|esta|se encuentra)\s+\p{L}+(?:\s+\p{L}+)?[.!? ]*$/u.test(t))return {state:{...next,slots:{...state.slots}},reviewTopic:'requested-person',review:'La persona pidió hablar con alguien específico. Falta conocer el motivo; no consta una solicitud nueva de servicio.',reviewQuestion:'¿Quién puede atender esta solicitud?',reply:'Tu mensaje quedó pendiente de atención.'};
  if(company==='fumigacion'&&specialQuotation(literalText,next.slots))return {state:next,reviewTopic:'special-quotation',reviewConditions:{kind:'special-property'},review:'Cotización especial de edificio, unidad, varias propiedades o zonas comunes; necesita alcance y precio propios, sin aplicar la tarifa de una vivienda.',reviewQuestion:'¿Qué alcance y cotización corresponden a esta solicitud especial?',reply:'Gracias. Una asesora continuará contigo para preparar la cotización de este inmueble.'};
  if(company==='fumigacion'&&normalize(next.slots.service).includes('avispas'))return {state:next,reviewTopic:'special-quotation',reviewConditions:{kind:'wasp-inspection'},review:'La cotización de avispas depende del tamaño y la altura del panal; requiere inspección. No hay una tarifa automática aprobada.',reviewQuestion:'¿Qué inspección y cotización corresponden al tamaño y la altura de este panal?',reply:'Para las avispas, la cotización depende del tamaño y la altura del panal y requiere inspección.'};
  if(!next.slots.detail&&state.asked?.at(-1)==='detail'&&!/[?¿]/.test(literalText)&&t.length>3&&!(company==='servicio-tecnico'&&technicalIntakeLiteralCorrection(e.text)))next.slots.detail=literalText.slice(0,300);
  if(!next.slots.preference&&state.asked?.includes('preference')&&/\b(hoy|mañana|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}[/:]\d{1,2}|tarde|mañana|noche)\b/.test(t))next.slots.preference=literalText.slice(0,300);
  if(ordinaryAvailability&&!intakeTiming?.preference){
    const preference=literalText.match(/\b(?:hoy|mañana|manana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b[^.!?]*/i)?.[0];
    if(preference){next.slots.preference=preference;next.intakeSources={...next.intakeSources,preference:{sourceId:e.id,at:e.at,context:'literal-request-not-confirmed-availability'}};}
  }
  const mattressService=company==='fumigacion'&&normalize(next.slots.service).includes('chinches');
  const dimensions=company==='fumigacion'&&literalIntakeDimensions(next.slots.dimensions);
  const nonResidentialDimensions=dimensions?.explicitMetricUnits&&!['casa','apartamento'].includes(normalize(next.slots.site));
  const fields=company==='fumigacion'?['service','site',mattressService?'mattresses':'size','location']:['service','detail','location'];
  const missing=fields.find(f=>f==='size'?!next.slots.area&&!next.slots.rooms&&!nonResidentialDimensions:!next.slots[f]||company==='fumigacion'&&f==='service'&&normalize(next.slots.service)==='fumigacion');
  const questions={service:company==='fumigacion'?'¿Qué plaga deseas tratar o buscas un servicio preventivo?':'¿Qué equipo necesitas revisar?',site:'¿En qué tipo de inmueble necesitas el servicio?',size:'¿Cuántas habitaciones o metros cuadrados tiene el lugar?',mattresses:'¿Cuántos colchones están afectados? Cuéntame también si hay chinches en bases de cama u otros muebles.',detail:'¿Qué falla presenta el equipo?',location:'¿En qué municipio y barrio necesitas el servicio?'};
  if(/[?¿]/.test(literalText)&&/\b(eso|lo anterior|lo que (?:me )?(?:dij|coment|indic|explic)|me habian|me hab[ií]as|mismo (?:precio|horario|servicio)|como qued|que qued)\w*/.test(t))
    return {state:next,reviewTopic:'previous-communication',review:'El cliente pregunta por algo comunicado antes. Hay que relacionar su pregunta con el contexto guardado y el servicio correcto antes de contestar.',reply:'Gracias. Revisaremos lo que ya conversamos para responder tu pregunta con claridad.'};
  if(isCustomerQuestion(e.text)&&!(company==='fumigacion'&&(quotationInquiry(e.text)||ordinaryAvailability)&&!ambiguousIntake(e.text)))
    return {state:literalIntakeTurn(e,company)?next:{...next,slots:{...state.slots}},reviewTopic:!e.forwarded&&quotationInquiry(e.text)?'cotizacion-verificada':'customer-question',review:'La persona hizo una pregunta concreta. Hace falta revisar sus antecedentes y confirmar la respuesta para este servicio.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.'};
  if(missing==='size'&&dimensions)return {state:next,dimensionsClarification:true,reply:dimensions.explicitMetricUnits?'Conservé las medidas '+dimensions.literal+'. ¿Cuántos metros cuadrados en total necesitas tratar?':'Conservé las medidas '+dimensions.literal+'. ¿Son largo por ancho en metros y corresponden al espacio que necesitas tratar?'};
  if(!missing&&nonResidentialDimensions)return {state:next,reviewTopic:'special-quotation',reviewConditions:{kind:'literal-special-property-dimensions',guard:MARIA_DIMENSIONS_GUARD},review:'La persona indicó un inmueble no residencial y sus dimensiones literales. No se calculó superficie ni hay precio aprobado; necesita alcance y cotización propios del mismo caso.',reviewQuestion:'¿Qué alcance y cotización propios corresponden a este inmueble y las medidas indicadas?',reply:'Conservé las medidas '+dimensions.literal+'. La cotización de este inmueble necesita verificar su alcance.'};
  if(missing&&!next.asked.includes(missing)){next.asked.push(missing);return {state:next,reply:company==='fumigacion'&&missing==='location'&&next.slots.locationDetails?'¿En qué municipio necesitas el servicio? Ya conservé la ubicación que me indicaste.':questions[missing]};}
  if(missing){
    if(company==='fumigacion')return {state:next,reply:missing==='location'&&next.slots.locationDetails?'Me falta confirmar el municipio para cotizarte; ya conservé la ubicación que me indicaste.':missing==='mattresses'?'Para cotizar esa cama, confirma cuántos colchones están afectados y si también hay chinches en la base u otros muebles.':questions[missing]};
    const names={service:'la plaga o el servicio solicitado',site:'el tipo de inmueble',size:'las habitaciones o metros cuadrados del lugar',mattresses:'los colchones y muebles afectados',detail:'la falla del equipo',location:'el municipio y barrio'};
    return {state:next,reviewTopic:'missing-intake:'+missing,reviewConditions:{missing},review:'Ya preguntamos por '+names[missing]+', pero la respuesta no permite confirmarlo.',reviewQuestion:'¿Qué dato podemos confirmar sobre '+names[missing]+' para esta solicitud?',reply:'Gracias. Revisaremos los detalles que nos compartiste para continuar.'};
  }
  if(company==='fumigacion')return {state:next,question:{topic:'cotizacion-verificada',conditions:next.slots},reply:'Gracias. Recibí los datos de tu solicitud. La cotización sigue pendiente de confirmación.'};
  if(!next.slots.preference&&!next.asked.includes('preference')){next.asked.push('preference');return {state:next,reply:'¿Qué día y franja horaria prefieres?'};}
  if(!next.slots.preference)return {state:next,reviewTopic:'missing-intake:preference',reviewConditions:{missing:'preference'},review:'Ya preguntamos por el día y la franja horaria preferidos, pero falta confirmarlos.',reviewQuestion:'¿Qué día y franja horaria prefiere esta persona?',reply:'Gracias. Revisaremos los detalles para continuar con tu solicitud.'};
  return {state:next,question:{topic:'disponibilidad-y-cotizacion',conditions:next.slots},reply:'Gracias. Recibí tu solicitud; falta confirmar disponibilidad y cotización.'};
}

export class Engine {
  constructor(store,config){this.store=store;this.config=config;initializeTesaStore(store);}
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
      const internal=internalRecipients(c).includes(e.phone);
      if(knownInternalRecipient(e.phone)&&!internal){finish('OBSERVED_INTERNAL_OUTSIDE_SCOPE');return;}
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
      if(conv.hold){finish('OBSERVED_HUMAN');return;}
      const lineScope=assertOperationalLineScope(c);
      if(lineScope&&(!operationalLineAllowed(c,e.line)||e.at<Date.parse(lineScope.authorizedAt)||s.hasSourcesOutsideLine(e.phone,e.line))){
        finish('OBSERVED_TEMPORARY_LINE_SCOPE');return;
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
      if(!newCase&&c.company==='fumigacion'&&productInquiry&&!caseState.requestedProductInquiry)caseState.requestedProductInquiry={sourceId:productInquiry.id,at:productInquiry.at,question:productInquiry.text.slice(0,300)};
      if(!newCase&&c.company==='fumigacion'&&e.kind==='text'&&!e.forwarded&&!e.fromMe&&!caseState.requestedAfterServiceReview){
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
          rememberIntakeTiming(caseState,turn,c.company);
        }
        if(literalIntakeTurn(e,c.company)&&Object.keys(extractSlots(e.text,c.company)).length)pendingQuestion=turns.filter(turn=>turn.id!==e.id&&turn.kind==='text'&&!turn.forwarded&&isCustomerQuestion(turn.text)).at(-1)||null;
      }
      if(caseState.awaitingHumanReview){
        if(literalIntakeTurn(e,c.company)){rememberFields(caseState,e,c.company);retainPromptedLocation(caseState,e);}
        caseState.lastHandledSourceId=e.id;s.saveConversation(e.phone,caseState);finish('OBSERVED_REVIEW');return;
      }
      const priorFaq=caseState.pendingFaqQuestion;
      const quoteClarification=ownQuoteClarification(s,c,caseState,e);
      const faqQuestion=pendingQuestion|| (priorFaq&&literalIntakeTurn(e,c.company)?priorFaq:e);
      const documentSource=e.kind==='text'&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text)?(postServiceDocuments(e.text)?e:documentRequest):null;
      const controlSource=c.company==='fumigacion'&&e.kind==='text'&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text)?(requestedControl(e.text)?e:controlRequest):null;
      const followupSource=c.company==='fumigacion'&&e.kind==='text'&&!faqNeedsPersonalReview(e.text.replace(/garant[ií]a/gi,''))&&!paymentInquiry(e.text)&&!/\b(?:pague|pago|comprobante|transfer|consign|abono)\w*/.test(normalize(e.text))?(afterServiceRequest(e,analysis)?e:followupRequest):null;
      const currentContext=c.company==='fumigacion'&&mariaLiteralServiceContext(e);
      const literalContextSource=c.company==='fumigacion'&&e.kind==='text'&&!contextNeedsPersonalPriority(e.text,e)?(currentContext?.documentDetail&&literalContextRequest?literalContextRequest:currentContext?e:literalContextRequest):null;
      const faqClassificationText=mariaIncidentalPetMention(faqQuestion)?.classificationText??faqQuestion.text;
      const faq=c.company==='fumigacion'&&!documentSource&&!controlSource&&!followupSource&&!caseState.requestedAfterServiceReview&&!caseState.requestedControlReview&&e.kind==='text'&&!e.forwarded&&!unreadLinkOnly(e.text)&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text)&&!previousQuotation(e.text)&&!postServiceReturn(e.text)&&!plannedRevisit(e.text)&&faqQuestion.kind==='text'?selectCommonAnswer(textWithoutLinks(faqClassificationText),caseState.slots,s.approvedCustomerAnswers(),caseState.caseId):null;
      let decision;
      const productClarification=c.company==='fumigacion'&&caseState.requestedProductInquiry&&literalIntakeTurn(e)&&!contextNeedsPersonalPriority(e.text,e)&&(Object.keys(extractSlots(e.text,c.company)).length||/^(?:solo|solamente|unicamente) (?:el )?producto[.! ]*$/.test(normalize(e.text)));
      if(productClarification){
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
      }else if(faq?.answer){
        decision={state:{...caseState,lastText:e.text,pendingFaqQuestion:null},reply:faq.answer};
        s.audit('APPROVED_CUSTOMER_ANSWER_SELECTED',e.id,{caseId:caseState.caseId,topics:faq.topics,answers:faq.answerIds,sources:faq.sourceIds,originalQuestion:faqQuestion.id});
      }else if(faq?.missing?.some(x=>x==='service'||x==='site')&&!faq.missing.includes('verifiedProducts')){
        const field=faq.missing.includes('service')?'service':'site';
        decision={state:{...caseState,lastText:e.text,pendingFaqQuestion:{id:faqQuestion.id,text:faqQuestion.text,kind:'text'}},reply:field==='service'?'¿Para qué plaga necesitas el servicio?':'¿En qué tipo de inmueble necesitas el servicio?'};
      }else decision=pendingQuestion&&!caseState.requestedAfterServiceReview&&!quotationInquiry(pendingQuestion.text)?{state:{...caseState,lastText:e.text},reviewTopic:'customer-question',reviewConditions:{question:normalize(pendingQuestion.text),caseId:caseState.caseId},reviewSource:pendingQuestion.id,pendingQuestion:pendingQuestion.text,review:'Hay una pregunta pendiente en esta misma secuencia; el mensaje siguiente aporta datos, pero no sustituye esa pregunta.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.'}:customerDecision(c.company,caseState,e,analysis);
      if(pendingQuestion&&decision.review&&!decision.state.requestedAfterServiceReview){decision.reviewSource=pendingQuestion.id;decision.pendingQuestion=pendingQuestion.text;}
      let selectedPrice=quoteClarification?.entry||null;
      const currentQuote=caseState.quotedPrice;
      const priceNow=currentQuote&&selectPrice(decision.state.slots,s.approvedPriceCatalogs(),currentQuote.entryId).entry;
      const incidentalPetNote=c.company==='fumigacion'&&mariaIncidentalPetMention(e);
      const pureIncidentalPetNote=incidentalPetNote&&!normalize(incidentalPetNote.classificationText).replace(/[.!¡,;\s]+/g,'');
      if(pureIncidentalPetNote&&currentQuote&&priceNow?.id===currentQuote.entryId&&priceNow.priceCop===currentQuote.priceCop&&priceNow.source?.type==='direct_user_approved_schedule'&&!caseState.requestedAfterServiceReview&&!caseState.requestedControlReview&&!caseState.requestedDocumentReview&&!decision.review&&(!decision.question||decision.question.topic==='cotizacion-verificada')){
        const delivered=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ')").get(currentQuote.sourceId+':reply',e.phone,e.line);
        if(delivered&&s.priceReplyStillValid(delivered))decision={state:decision.state,incidentalPetNote:true,reply:'Anoté: '+incidentalPetNote.text+'.'};
      }
      const naturalAcceptance=acceptsOrdinaryQuotation(e.text);
      const continuingQuote=!decision.quoteClarification&&!decision.literalServiceContext&&!decision.observed&&c.company==='fumigacion'&&currentQuote&&priceNow?.id===currentQuote.entryId&&priceNow.priceCop===currentQuote.priceCop&&
        ((!decision.review&&!decision.courtesy)||(naturalAcceptance&&(decision.courtesy||decision.reviewTopic==='customer-question')))&&!specialQuotation(textWithoutLinks(literalIntakeTextWithoutRegistrationFields(e.text)),decision.state.slots)&&
        (currentQuote.accepted||naturalAcceptance);
      if(continuingQuote){
        const delivered=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ')").get(currentQuote.sourceId+':reply',e.phone,e.line);
        if(delivered&&s.priceReplyStillValid(delivered)){
          decision.state.quotedPrice={...currentQuote,accepted:true,acceptanceSource:currentQuote.acceptanceSource||e.id,acceptedAt:currentQuote.acceptedAt||e.at};
          const literalPreference=literalProgramPreference(e.text);
          const preference=literalPreference||decision.state.slots.preference;
          const operationalConfirmation=registeredTesaConfirmation(s,c,decision.state,e);
          if(literalPreference)decision.state.intakeSources={...decision.state.intakeSources,preference:{sourceId:e.id,at:e.at,context:'literal-customer-preference-pending-coordination'}};
          if(operationalConfirmation)decision=operationalConfirmation;
          else if(programEnabled(c)&&priceNow.source?.type==='direct_user_approved_schedule'&&decision.state.programIntake?.stage!=='registered'&&registrationQuoteReady(s,decision.state,e.phone,e.line)){
            if(preference)decision.state.slots.preference=preference;
            decision={state:decision.state};
          }else if(preference){
            decision.state.slots.preference=preference;
            decision={state:decision.state,question:{topic:'disponibilidad-y-tecnico',conditions:{...decision.state.slots,quotedPriceCop:currentQuote.priceCop,priceSource:priceNow.source.quoteId,...(decision.state.programServiceId?{programServiceId:decision.state.programServiceId}:{})}},reply:'Gracias. Una asesora continuará contigo para confirmar el horario del servicio.'};
          }else if(!decision.state.asked.includes('preference')){
            decision.state.asked.push('preference');decision={state:decision.state,reply:'¿Qué día y franja horaria prefieres para el servicio?'};
          }else decision={state:decision.state,reviewTopic:'missing-intake:preference',reviewConditions:{missing:'preference'},review:'La persona aceptó la cotización verificada, pero falta una preferencia de horario clara.',reviewQuestion:'¿Qué día y franja horaria prefiere esta persona?',reply:'Gracias. Una asesora continuará contigo para confirmar el horario del servicio.'};
        }else decision={state:decision.state,observed:true,observedState:'QUOTATION_DELIVERY_REVIEW'};
      }
      if(c.company==='fumigacion'&&(decision.question?.topic==='cotizacion-verificada'||decision.reviewTopic==='customer-question'&&quotationInquiry(e.text))){
        const selection=selectPrice(decision.state.slots,s.approvedPriceCatalogs());
        if(selection.entry&&!e.forwarded&&!ambiguousIntake(e.text)&&!specialQuotation(textWithoutLinks(literalIntakeTextWithoutRegistrationFields(e.text)),decision.state.slots)){
          selectedPrice=selection.entry;
          decision={state:{...decision.state,quotedPrice:{entryId:selectedPrice.id,priceCop:selectedPrice.priceCop,slots:{...decision.state.slots},sourceId:e.id}},reply:priceText(selectedPrice)};
          s.audit('REVIEWED_PRICE_SELECTED',e.id,{entryId:selectedPrice.id,priceCop:selectedPrice.priceCop,quoteSources:selection.sourceIds,caseId:caseState.caseId,businessWritten:false});
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
      const registration=decision.quoteClarification||decision.literalServiceContext?null:registrationTurn(s,c,caseState,e,literalProgramStage?{...decision,state:{...decision.state,slots:{...caseState.slots,...(decision.state.slots.preference?{preference:decision.state.slots.preference}:{})}}}:decision);
      if(registration)decision=registration;
      decision.state.lastHandledSourceId=e.id;
      if(/^[¡! ]*(?:hola\b|buenos dias\b|buen dia\b|buenas tardes\b|buenas noches\b)/.test(normalize(e.text))&&!conv.state.introduced&&decision.reply){
        if(c.company==='fumigacion'&&!selectedPrice&&!decision.courtesy&&!decision.review&&!decision.question&&!decision.observed){
          const missing=decision.state.slots,requests=[];
          const pureGreeting=literalGreetingText(e.text);
          const staged=pureGreeting&&(!missing.service||normalize(missing.service)==='fumigacion'||!missing.location);
          if(!missing.service||normalize(missing.service)==='fumigacion')requests.push('Qué plaga deseas tratar o si buscas prevención.');
          if(!staged&&normalize(missing.service).includes('chinches')){
            if(!missing.site)requests.push('Qué tipo de inmueble es.');
            if(!missing.mattresses)requests.push('Cuántos colchones están afectados y si también hay chinches en bases de cama u otros muebles.');
          }else if(!staged&&(!missing.site||!missing.area&&!missing.rooms))requests.push(!missing.site&&!missing.area&&!missing.rooms?'Qué tipo de inmueble es y cuántas habitaciones o metros cuadrados tiene.':!missing.site?'Qué tipo de inmueble es.':'Cuántas habitaciones o metros cuadrados tiene.');
          if(!missing.location)requests.push(missing.locationDetails?'El municipio donde necesitas el servicio; ya conservé la ubicación indicada.':'El municipio y barrio o vereda donde necesitas el servicio.');
          if(requests.length){
            decision.reply='Para ayudarte con la cotización, cuéntame:\n'+requests.map(x=>'• '+x).join('\n');
            decision.state.initialIntakeAllRequested=!staged;
            const requested=staged?['service','location'].filter(field=>!missing[field]||field==='service'&&normalize(missing.service)==='fumigacion'):['service','site',normalize(missing.service).includes('chinches')?'mattresses':'size','location'].filter(field=>field==='size'?!missing.area&&!missing.rooms:!missing[field]);
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
        if(request.created&&request.outboxId?.startsWith('tesa-question:')){decision.state.pendingTesaQuestionId=request.id;s.saveConversation(e.phone,decision.state);}
        if(!request.created&&(decision.reviewTopic?.startsWith('missing-intake:')||c.company==='fumigacion'&&decision.reviewTopic==='disponibilidad-y-tecnico'&&decision.reviewConditions?.kind==='reported-existing-schedule'||c.company==='servicio-tecnico'&&['customer-question','special-quotation'].includes(decision.reviewTopic)||['cotizacion-verificada','common-question','service-documents','service-followup','warranty-review','requested-technician-contact','payment-instructions','existing-quotation','unread-link'].includes(decision.reviewTopic))){
          decision.reply=inheritedPending&&(e.quotedId===restored.sourceId||restored.restoredFromStoredSource?.sourceId===e.id)?'Tu solicitud de garantía sigue pendiente de revisión.':null;
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
          decision.reply=decision.question.topic==='disponibilidad-y-tecnico'?'Gracias. Una asesora continuará contigo para confirmar el horario del servicio.':'Gracias. Una asesora continuará contigo para completar la cotización.';
          decision.state.awaitingHumanReview=true;s.saveConversation(e.phone,decision.state);
        }
      }
      if(decision.reply){
        decision.reply=adviserReply(c.company,decision,{firstReply:!conv.state.lastHandledSourceId&&!decision.state.pendingFaqQuestion,approvedAnswer:Boolean(faq?.answer)});
        if(!decision.review&&!decision.question&&!selectedPrice&&!faq?.answer){
          const proof=literalGreetingReplyProof(c,e,decision.state,decision.reply);
          if(proof){decision.state.literalGreetingReply=proof;s.saveConversation(e.phone,decision.state);}
        }
        if(!publicTextSafe(decision.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
        s.queue(e.id+':reply',e.phone,e.line,decision.reply,false,conv.revision,decision.courtesy?null:caseState.caseId);
        if(faq?.answer)s.saveApprovedReplyReference(e.id+':reply',{question:faqQuestion.text,context:caseState.slots,caseId:caseState.caseId,answer:faq.answer,finalText:decision.reply,answerIds:faq.answerIds,sourceIds:faq.sourceIds});
        if(selectedPrice)s.savePriceReplyReference(e.id+':reply',{entryId:selectedPrice.id,priceCop:selectedPrice.priceCop,context:{...decision.state.slots},finalText:decision.reply});
      }
      finish(decision.observed?decision.observedState||'OBSERVED_CALL':decision.review?'REVIEW':decision.question?'WAITING_COORDINATOR':'DONE');
    });
  }
}
