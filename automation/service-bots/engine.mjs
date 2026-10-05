import { normalize, SANDRA, DIEGO, publicTextSafe, internalRecipients,knownInternalRecipient,internalName,questionRecipients } from './config.mjs';
import {selectCommonAnswer,commonQuestionTopics,faqNeedsPersonalReview,faqTopicLabel} from './faq.mjs';
import {chiefStatusTopic,chiefStatusReply} from './chief-status.mjs';
import {selectPrice,priceText,quotationInquiry,specialQuotation,currentPriceEntries} from './prices.mjs';
import {adviserReply} from './adviser-tone.mjs';

const externalLinks = text => String(text??'').match(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi)||[];
const textWithoutLinks = text => String(text??'').replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi,' ');
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
export function extractSlots(text,company) {
  text=textWithoutLinks(text);
  const t=normalize(text), slots={};
  const pests={cucarachas:/\bcucarachas?\b/,hormigas:/\bhormigas?\b/,ratones:/\b(?:raton|ratones)\b/,ratas:/\bratas?\b/,chinches:/\bchinches?\b/,comején:/\bcomejen(?:es)?\b/,avispas:/\bavispas?\b/,roedores:/\broedores?\b/,mosquitos:/\bmosquitos?\b/,pulgas:/\bpulgas?\b/,zancudos:/\b(?:zancudos?|sancudos?)\b/,'arañas':/\baranas?\b/,moscas:/\bmoscas?\b/,chiripas:/\bchiripas?\b/,prevencion:/\bprevencion\b/,fumigacion:/\bfumigacion\b/};
  const found=company==='fumigacion'?Object.keys(pests).filter(s=>pests[s].test(t)):['nevera','lavadora','secadora','estufa','horno','calentador','aire acondicionado'].filter(s=>t.includes(s));
  const specific=company==='fumigacion'?found.filter(s=>!['prevencion','fumigacion'].includes(s)):found;
  slots.service=(specific.length?specific:found).join(' y ')||undefined;
  const city=['medellin','bello','envigado','itagui','sabaneta','la estrella','copacabana','girardota','rionegro'].find(s=>new RegExp('\\b'+s+'\\b').test(t));
  if(city)slots.location=city;
  if(company==='fumigacion'){
    const municipality=text.match(/\b(?:(?:santa\s+fe|santaf[eé])\s+de\s+antioquia|sopetr[aá]n)\b/i)?.[0];
    if(municipality)slots.location=municipality;
    // A locative answer names a café as the place. Coffee drinks or colors
    // alone do not identify an inmueble, and no restaurant type is inferred.
    const properties={'casa finca':/\bcasas?\s+fincas?\b/,finca:/\bfincas?\b/,apartamento:/\b(?:apartamentos?|aptos?)\b/,casa:/\bcasas?\b/,restaurante:/\brestaurantes?\b/,local:/\blocal(?:es)?\b/,oficina:/\boficinas?\b/,bodega:/\bbodegas?\b/,'cafetería':/\bcafeterias?\b/,'café':/^(?:(?:es|seria)\s+)?en\s+(?:(?:el|un|nuestro|mi)\s+)?cafe\b/};
    slots.site=Object.keys(properties).find(site=>properties[site].test(t));
  }
  if(company==='fumigacion'){
    slots.area=text.match(/\b\d{1,5}(?:[.,]\d{1,2})?\s*(?:m\s*(?:²|2|cuadrados?)|metros?\s*cuadrados?)(?=$|[\s.,;:)])/i)?.[0];
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
export function parseUnderstanding(value,customerText) {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  customerText=textWithoutLinks(customerText);
  const fields=['service','location','site','detail','preference'];const result={};
  for(const key of fields) {
    const v=value.slots?.[key];
    // Extract only literal spans. An inferred price, schedule, diagnosis or instruction has no authority.
    if(typeof v==='string'&&v.length>=2&&v.length<=300&&normalize(customerText).includes(normalize(v)))result[key]=v;
  }
  return result;
}
export function capabilitiesReply(config,phone,verifiedPrices=0) {
  const recipient=phone===SANDRA?'Doña Sandra':internalName(phone);
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
  const t=normalize(text);
  return /\bme (?:hicieron|realizaron|aplicaron) (?:una |la |el |un )?(?:fumigacion|tratamiento)\b/.test(t)&&/\b(?:otra vez|nuevamente|de nuevo|volvieron|vuelven|siguen)\b/.test(t)&&/\b(?:aparec\w*|chinches?|cucarachas?|hormigas?|pulgas?|ratas?|ratones|plagas?)\b/.test(t);
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
function requestedTechnicalContact(text){
  const t=normalize(text);
  return /\b(?:numero|telefono|celular|whatsapp|contacto)\s+(?:de(?:l| la)?\s+)?(?:tecnic[oa]|fumigador[ae]?)\b/.test(t)&&
    /\b(?:podrias?|podrian|puedes?|pueden|compartir|compartes|comparte|comparteme|pasar|pasas|pasa|pasame|enviar|envias|envia|enviame|dame|darme|necesito|quiero|quisiera|cual (?:es|seria))\b/.test(t);
}
function isCustomerQuestion(text){text=textWithoutLinks(text);return /[?¿]/.test(text)||postServiceDocuments(text)||serviceFollowup(text)||paymentInquiry(text)||previousQuotation(text)||postServiceReturn(text)||plannedRevisit(text)||requestedTechnicalContact(text)||commonQuestionTopics(text).length>0||/\b(?:cuanto (?:cuesta|vale|cobran|dura)|cual es (?:el|la)|como funciona|que incluye|me puedes (?:decir|confirmar)|pueden (?:venir|atender)|a que horas? (?:me |nos )?(?:puedes|pueden|podrias) (?:colaborar|atender|ayudar|venir))\b/.test(normalize(text));}
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
function literalIntakeTurn(e){
  const text=normalize(textWithoutLinks(e.text));
  const facts=/\b(?:tengo|mi (?:casa|apartamento)|son \d+|mide)\b/.test(text)||/^(?:hola[, ]+)?es una? (?:casa|apartamento)\b/.test(text);
  return e.kind==='text'&&!e.forwarded&&!unreadLinkOnly(e.text)&&!customerCourtesy(e.text)&&!ambiguousIntake(e.text)&&(!isCustomerQuestion(e.text)||quotationInquiry(e.text)||facts)&&!postServiceDocuments(e.text)&&!serviceFollowup(e.text)&&!postServiceReturn(e.text)&&!plannedRevisit(e.text)&&!paymentInquiry(e.text)&&!previousQuotation(e.text)&&!requestedTechnicalContact(e.text)&&!/\b(?:antes|anterior|cancel\w*|reprogram\w*|reclamo|queja|garantia|pague|pago|abono|comprobante|me dijeron|me dijo|otra solicitud|otro servicio|nuevo servicio|otro equipo)\b/.test(text);
}
function promptedSize(e,state){
  return literalIntakeTurn(e)&&(state.asked?.includes('size')||state.initialIntakeAllRequested)?textWithoutLinks(e.text).match(/\b\d{1,5}(?:[.,]\d{1,2})?\s*metros?(?=[.! ,;]*$)/i)?.[0]:undefined;
}
function retainPromptedLocation(state,e){
  if(!literalIntakeTurn(e)||!(state.asked?.includes('location')||state.initialIntakeAllRequested||state.slots.location||extractSlots(e.text,'fumigacion').location))return;
  const text=textWithoutLinks(e.text).trim(),t=normalize(text);
  if(!text||text.length>240||/^(?:no|quizas|tal vez|posiblemente)\b/.test(t))return;
  // Preserve the sender's location words, including a short answer in a rapid
  // batch. A neighborhood name alone never supplies an inferred municipality.
  if(!/\b(?:villa|barrio|vereda|calle|carrera|unidad|urbanizacion|robledo|medellin|bello|envigado|itagui|sabaneta|santa helena)\b/.test(t)&&!/^manrique[.! ]*$/.test(t))return;
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
  // A URL's query punctuation and path are not the sender's question or intake
  // answer. Preserve the unread reference without fetching or interpreting it.
  if(e.kind==='text'&&unreadLinkOnly(e.text))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},reviewTopic:'unread-link',reviewConditions:{kind:'unread-link',links:externalLinks(e.text)},review:'La persona envió únicamente un enlace. El contenido vinculado no ha sido leído; no consta una pregunta, servicio o dato operativo confirmado.',reviewQuestion:'¿Qué atención necesita este mensaje en este caso?',reply:'Recibí tu mensaje. Queda pendiente de revisión.'};
  if(e.kind==='text'&&customerCourtesy(e.text))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},courtesy:true,reply:'Con gusto. Estamos para servirte.'};
  if(e.kind==='text'&&!e.forwarded&&(state.introduced||state.initialIntakeAllRequested||state.asked?.length)&&/^(?:hola|hola buenas noches|buenos dias|buen dia|buenas tardes|buenas noches)[.!¡, ]*$/.test(normalize(e.text)))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},courtesy:true,greeting:true,reply:/buenas noches/.test(normalize(e.text))?'Buenas noches.':/buenas tardes/.test(normalize(e.text))?'Buenas tardes.':/buen(?:os dias| dia)/.test(normalize(e.text))?'Buen día.':'Hola.'};
  const literalText=textWithoutLinks(e.text).trim(),t=normalize(literalText);const next={...state,slots:{...state.slots,...extractSlots(e.text,company),...parseUnderstanding(analysis,e.text)},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)};
  // Preserve an elliptical answer to our own size prompt literally. Do not invent
  // square metres, convert a linear measurement, or infer size outside that context.
  if(company==='fumigacion'&&!next.slots.area&&!next.slots.rooms&&literalIntakeTurn(e)&&(state.asked?.includes('size')||state.initialIntakeAllRequested)){
    const size=promptedSize(e,state);
    if(size){next.slots.area=size;next.intakeSources={...next.intakeSources,area:{sourceId:e.id,at:e.at,context:'prior-size-question',unitExpanded:false}};}
  }
  if(company==='fumigacion')retainPromptedLocation(next,e);
  if(e.kind==='call')return {state:{...next,lastCallEvent:e.id},observed:true};
  if(e.kind!=='text')return {state:next,review:'El cliente envió '+e.kind+'. El contenido original necesita revisión.',reply:e.kind==='audio'?'Recibí tu audio. Te atenderemos en cuanto revisemos su contenido.':'Recibí el archivo. Revisaremos su contenido para continuar contigo.'};
  if(postServiceDocuments(e.text)&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text))return {state:{...next,slots:{...state.slots}},reviewTopic:'service-documents',reviewConditions:{kind:'reported-post-service-documents',directCustomerReport:!e.forwarded},review:'La persona solicita documentos de un servicio que relata como realizado. El mensaje no acredita registro, ejecución ni existencia o autorización de documentos; hay que contrastar el servicio y revisar qué soportes pueden entregarse.',reviewQuestion:'¿Qué servicio y soportes autorizados comprobados corresponden a esta solicitud?',reply:'Con gusto. Una asesora continuará contigo para revisar los documentos que necesitas.'};
  if(/\b(factura|certificado|seguimiento|posservicio|ya tengo (?:una )?cita|estado de (?:la )?orden)\b/.test(t))return {state:next,review:'El cliente consulta un servicio previo, su estado o un soporte. Hace falta contrastar el registro del programa.',reply:'Gracias. Revisaremos el registro de tu servicio para poder ayudarte.'};
  if(/\b(cancel|reprogram|reclamo|queja|garantia|devolucion|amenaz|abogad|denuncia|dolor|intoxic|embaraz|mascota|bebe|niño|nino)\w*/.test(t))
    return {state:next,review:'El cliente solicita revisar una excepción o situación que necesita atención personal.',reply:'Gracias por contarnos. Revisaremos tu caso para darte una respuesta clara.'};
  if(/\b(pague|pago|comprobante|transfer|consign|abono)\w*/.test(t)&&(!paymentInquiry(e.text)||/\b(?:pague|comprobante|transferencia|consignacion|abono|(?:hice|realice) (?:el |un )?pago)\b/.test(t)))return {state:next,review:'El cliente informa un pago. Hace falta comprobar el ingreso y su asociación al servicio.',reply:'Gracias. Recibí la información del pago; falta verificarlo para poder confirmarte.'};
  if(paymentInquiry(e.text))return {state:next,reviewTopic:'payment-instructions',reviewConditions:{kind:'amount-and-instructions'},review:'La persona pregunta cuánto enviar o cómo pagar. No informa un ingreso recibido; el importe, medio de pago y asociación al caso requieren una fuente verificable.',reviewQuestion:'¿Qué importe y medio de pago verificados corresponden a esta solicitud?',reply:'Con gusto. Aún falta confirmar cuánto debes enviar y el medio de pago.'};
  if(previousQuotation(e.text))return {state:next,reviewTopic:'existing-quotation',reviewConditions:{kind:'previous-quotation'},review:'La persona dice que ya recibió una cotización. Esa afirmación no confirma precio, aceptación ni reserva; hace falta contrastar el antecedente del mismo caso.',reviewQuestion:'¿Qué cotización previa comprobada corresponde a este caso y cuál es la respuesta vigente?',reply:'Entiendo. La cotización anterior aún necesita verificarse para continuar.'};
  if(company==='fumigacion'&&postServiceReturn(e.text))return {state:next,reviewTopic:'service-followup',reviewConditions:{kind:'post-service'},review:'La persona relata reaparición de una plaga tras una fumigación anterior. Hace falta comprobar el antecedente y las condiciones aplicables; no consta una garantía o revisita aprobada.',reviewQuestion:'¿Qué antecedente y condiciones de revisita comprobados corresponden a este caso?',reply:'Entiendo lo que nos cuentas. Tu caso necesita revisión para confirmar cómo continuar.'};
  if(company==='fumigacion'&&plannedRevisit(e.text))return {state:{...next,slots:{...state.slots}},reviewTopic:'service-followup',reviewConditions:{kind:'planned-revisit',directCustomerReport:!e.forwarded},pendingQuestion:questionExcerpt(literalText.slice(literalText.search(/\b(?:necesito|quiero|agend\w*|program\w*|confirm\w*)\b/i))),review:'La persona relata una fumigación anterior y solicita una nueva visita, con preferencias de horario y técnico. La recomendación relatada no acredita reserva, disponibilidad ni precio; hay que contrastar el servicio guardado y sus condiciones.',reviewQuestion:'¿Qué antecedente, disponibilidad, técnico y precio verificados corresponden a esta revisita?',reply:'Gracias por contarnos. Tu solicitud de nueva visita sigue pendiente de confirmación.'};
  if(requestedTechnicalContact(e.text))return {state:{...next,slots:{...state.slots}},reviewTopic:'requested-technician-contact',reviewConditions:{kind:'technician-contact'},review:'La persona solicita un medio de contacto del técnico para hacerle preguntas. No consta aquí un contacto autorizado para compartir; no es una nueva solicitud de cotización.',reviewQuestion:'¿Qué contacto está autorizado para atender sus dudas y qué dato podemos compartirle?',reply:'Entiendo. Aún falta confirmar el contacto que puede atender tus dudas.'};
  if(serviceFollowup(e.text))return {state:{...next,slots:{...state.slots}},reviewTopic:'service-followup',reviewConditions:{kind:'arrival'},review:'La persona pregunta por la llegada del servicio. Hace falta contrastar el antecedente y comprobar el estado actual; no consta aquí una hora verificada.',reviewQuestion:'¿Cuál es el estado actual del servicio y qué respuesta confirmada podemos darle sobre la llegada?',reply:'Entiendo tu preocupación. Aún no tengo una hora de llegada confirmada.'};
  if(/^(gracias|muchas gracias|muy amable|ok|listo)[.! ]*$/.test(t))return {state:next,reply:'Con gusto.'};
  if(/^(?:hola[, ]+)?(?:con|esta|se encuentra)\s+\p{L}+(?:\s+\p{L}+)?[.!? ]*$/u.test(t))return {state:{...next,slots:{...state.slots}},reviewTopic:'requested-person',review:'La persona pidió hablar con alguien específico. Falta conocer el motivo; no consta una solicitud nueva de servicio.',reviewQuestion:'¿Quién puede atender esta solicitud?',reply:'Tu mensaje quedó pendiente de atención.'};
  if(company==='fumigacion'&&specialQuotation(e.text,next.slots))return {state:next,reviewTopic:'special-quotation',reviewConditions:{kind:'special-property'},review:'Cotización especial de edificio, unidad, varias propiedades o zonas comunes; necesita alcance y precio propios, sin aplicar la tarifa de una vivienda.',reviewQuestion:'¿Qué alcance y cotización corresponden a esta solicitud especial?',reply:'Gracias. Una asesora continuará contigo para preparar la cotización de este inmueble.'};
  if(company==='fumigacion'&&normalize(next.slots.service).includes('avispas'))return {state:next,reviewTopic:'special-quotation',reviewConditions:{kind:'wasp-inspection'},review:'La cotización de avispas depende del tamaño y la altura del panal; requiere inspección. No hay una tarifa automática aprobada.',reviewQuestion:'¿Qué inspección y cotización corresponden al tamaño y la altura de este panal?',reply:'Para las avispas, la cotización depende del tamaño y la altura del panal y requiere inspección.'};
  if(!next.slots.detail&&state.asked?.at(-1)==='detail'&&!/[?¿]/.test(literalText)&&t.length>3)next.slots.detail=literalText.slice(0,300);
  if(!next.slots.preference&&state.asked?.includes('preference')&&/\b(hoy|mañana|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}[/:]\d{1,2}|tarde|mañana|noche)\b/.test(t))next.slots.preference=literalText.slice(0,300);
  const mattressService=company==='fumigacion'&&normalize(next.slots.service).includes('chinches');
  const fields=company==='fumigacion'?['service','site',mattressService?'mattresses':'size','location']:['service','detail','location'];
  const missing=fields.find(f=>f==='size'?!next.slots.area&&!next.slots.rooms:f==='location'&&company==='fumigacion'?!next.slots.location&&!next.slots.locationDetails:!next.slots[f]);
  const questions={service:company==='fumigacion'?'¿Qué plaga deseas tratar o buscas un servicio preventivo?':'¿Qué equipo necesitas revisar?',site:'¿En qué tipo de inmueble necesitas el servicio?',size:'¿Cuántas habitaciones o metros cuadrados tiene el lugar?',mattresses:'¿Cuántos colchones están afectados? Cuéntame también si hay chinches en bases de cama u otros muebles.',detail:'¿Qué falla presenta el equipo?',location:'¿En qué municipio y barrio necesitas el servicio?'};
  if(/[?¿]/.test(literalText)&&/\b(eso|lo anterior|lo que (?:me )?(?:dij|coment|indic|explic)|me habian|me hab[ií]as|mismo (?:precio|horario|servicio)|como qued|que qued)\w*/.test(t))
    return {state:next,reviewTopic:'previous-communication',review:'El cliente pregunta por algo comunicado antes. Hay que relacionar su pregunta con el contexto guardado y el servicio correcto antes de contestar.',reply:'Gracias. Revisaremos lo que ya conversamos para responder tu pregunta con claridad.'};
  if(isCustomerQuestion(e.text)&&!(company==='fumigacion'&&quotationInquiry(e.text)&&!ambiguousIntake(e.text)))
    return {state:literalIntakeTurn(e)?next:{...next,slots:{...state.slots}},reviewTopic:!e.forwarded&&quotationInquiry(e.text)?'cotizacion-verificada':'customer-question',review:'La persona hizo una pregunta concreta. Hace falta revisar sus antecedentes y confirmar la respuesta para este servicio.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.'};
  if(missing&&!next.asked.includes(missing)){next.asked.push(missing);return {state:next,reply:questions[missing]};}
  if(missing){
    const names={service:'la plaga o el servicio solicitado',site:'el tipo de inmueble',size:'las habitaciones o metros cuadrados del lugar',mattresses:'los colchones y muebles afectados',detail:'la falla del equipo',location:'el municipio y barrio'};
    return {state:next,reviewTopic:'missing-intake:'+missing,reviewConditions:{missing},review:'Ya preguntamos por '+names[missing]+', pero la respuesta no permite confirmarlo.',reviewQuestion:'¿Qué dato podemos confirmar sobre '+names[missing]+' para esta solicitud?',reply:'Gracias. Revisaremos los detalles que nos compartiste para continuar.'};
  }
  if(company==='fumigacion')return {state:next,question:{topic:'cotizacion-verificada',conditions:next.slots},reply:'Gracias. Recibí los datos de tu solicitud. La cotización sigue pendiente de confirmación.'};
  if(!next.asked.includes('preference')){next.asked.push('preference');return {state:next,reply:'¿Qué día y franja horaria prefieres?'};}
  if(!next.slots.preference)return {state:next,reviewTopic:'missing-intake:preference',reviewConditions:{missing:'preference'},review:'Ya preguntamos por el día y la franja horaria preferidos, pero falta confirmarlos.',reviewQuestion:'¿Qué día y franja horaria prefiere esta persona?',reply:'Gracias. Revisaremos los detalles para continuar con tu solicitud.'};
  return {state:next,question:{topic:'disponibilidad-y-cotizacion',conditions:next.slots},reply:'Gracias. Tu solicitud quedó registrada; falta confirmar disponibilidad y cotización.'};
}

export class Engine {
  constructor(store,config){this.store=store;this.config=config;}
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
      const newerOnLine=internal&&s.db.prepare('SELECT 1 FROM events WHERE phone=? AND line=? AND from_me=0 AND (at>? OR (at=? AND revision>?)) LIMIT 1').get(e.phone,e.line,e.at,e.at,row.revision);
      if(internal?newerOnLine:(e.at<conv.at||row.revision<conv.revision)){finish('OBSERVED_SUPERSEDED');return;}
      if(!c.enabled&&(!c.chiefOnly||!internal)){finish('OBSERVED_ANALYSIS_ONLY');return;}
      if(internal){
        if(e.forwarded){finish('OBSERVED_FORWARDED');return;}
        const quoted=e.quotedId&&s.db.prepare("SELECT q.*,o.state AS delivery FROM questions q JOIN outbox o ON (o.id=q.outbox_id OR EXISTS(SELECT 1 FROM question_routes r WHERE r.question_id=q.id AND r.outbox_id=o.id AND r.recipient=o.phone AND r.line=o.line)) WHERE o.phone=? AND o.line=? AND o.mid=? AND o.internal=1 AND o.state IN ('DELIVERED','READ')").get(e.phone,e.line,e.quotedId);
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
          s.queue(e.id+':answer-ack',e.phone,e.line,'Gracias. Guardé tu aclaración para esta solicitud.',true,0);finish('CASE_ANSWER');return;
        }
        const ownQuote=e.quotedId&&s.db.prepare("SELECT id FROM outbox WHERE phone=? AND line=? AND mid=? AND internal=1 AND state IN ('DELIVERED','READ')").get(e.phone,e.line,e.quotedId);
        const shortStatus=e.kind==='text'&&shortNameStatus(e.text,c.bot);
        if(e.kind==='text'&&(directed(e.text,c.bot)||ownQuote||shortStatus)){
          const body=(shortStatus||normalize(e.text).replace(/^[¿¡ ]*(?:(?:hola|buenos dias|buenas tardes|buenas noches)[, :]+)?(?:maria angel|mariangel|miguel angel|bot)[, :¿?!]*/,'' )).replace(/[¿?!.]+$/,'').trim();
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
          const target=/retoma (?:el )?chat (?:de )?(?:\+)?(57\d{10})\b/.exec(normalize(e.text));
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
      const reportedOrder=/\borden\s*(?:n[ºo°.]?\s*)?([a-f0-9]{8})\b/i.exec(e.text)?.[1]?.toUpperCase();
      const newCase=/\b(?:otra solicitud|nuevo servicio|otro servicio|otro equipo)\b/.test(normalize(e.text));
      const caseState=newCase?{slots:{},asked:[],introduced:conv.state.introduced,caseId:c.company+':'+e.id}:conv.state;
      caseState.caseId ||= reportedOrder || c.company+':'+e.id;
      let pendingQuestion=null,documentRequest=null;
      if(!newCase){
        const firstSource=caseState.caseId.startsWith(c.company+':')?caseState.caseId.slice(c.company.length+1):null;
        const turns=s.customerTurnBatch(e.phone,e.id,caseState.lastHandledSourceId||firstSource);
        documentRequest=turns.filter(turn=>turn.kind==='text'&&postServiceDocuments(turn.text)).at(-1)||null;
        caseState.intakeSources={...caseState.intakeSources};
        for(const turn of turns.filter(literalIntakeTurn)){
          const fields=extractSlots(turn.text,c.company);
          const contextualSize=c.company==='fumigacion'&&!fields.area?promptedSize(turn,caseState):undefined;
          if(contextualSize)fields.area=contextualSize;
          for(const [field,value]of Object.entries(fields)){
            caseState.slots[field]=value;caseState.intakeSources[field]={sourceId:turn.id,at:turn.at,...(field==='area'&&contextualSize?{context:'prior-size-question',unitExpanded:false}:{})};
          }
          if(c.company==='fumigacion')retainPromptedLocation(caseState,turn);
        }
        if(literalIntakeTurn(e)&&Object.keys(extractSlots(e.text,c.company)).length)pendingQuestion=turns.filter(turn=>turn.id!==e.id&&turn.kind==='text'&&!turn.forwarded&&isCustomerQuestion(turn.text)).at(-1)||null;
      }
      if(caseState.awaitingHumanReview){
        if(literalIntakeTurn(e)){Object.assign(caseState.slots,extractSlots(e.text,c.company));retainPromptedLocation(caseState,e);}
        caseState.lastHandledSourceId=e.id;s.saveConversation(e.phone,caseState);finish('OBSERVED_REVIEW');return;
      }
      const priorFaq=caseState.pendingFaqQuestion;
      const faqQuestion=pendingQuestion|| (priorFaq&&literalIntakeTurn(e)?priorFaq:e);
      const documentSource=e.kind==='text'&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text)?(postServiceDocuments(e.text)?e:documentRequest):null;
      const faq=c.company==='fumigacion'&&!documentSource&&e.kind==='text'&&!e.forwarded&&!unreadLinkOnly(e.text)&&!faqNeedsPersonalReview(e.text)&&!paymentInquiry(e.text)&&!previousQuotation(e.text)&&!postServiceReturn(e.text)&&!plannedRevisit(e.text)&&faqQuestion.kind==='text'?selectCommonAnswer(textWithoutLinks(faqQuestion.text),caseState.slots,s.approvedCustomerAnswers(),caseState.caseId):null;
      let decision;
      if(documentSource){
        decision=customerDecision(c.company,caseState,{...e,text:documentSource.text,forwarded:documentSource.forwarded},analysis);
        decision.reviewSource=documentSource.id;decision.pendingQuestion=documentSource.text;decision.state.lastText=e.text;
      }else if(faq?.answer){
        decision={state:{...caseState,lastText:e.text,pendingFaqQuestion:null},reply:faq.answer};
        s.audit('APPROVED_CUSTOMER_ANSWER_SELECTED',e.id,{caseId:caseState.caseId,topics:faq.topics,answers:faq.answerIds,sources:faq.sourceIds,originalQuestion:faqQuestion.id});
      }else if(faq?.missing?.some(x=>x==='service'||x==='site')&&!faq.missing.includes('verifiedProducts')){
        const field=faq.missing.includes('service')?'service':'site';
        decision={state:{...caseState,lastText:e.text,pendingFaqQuestion:{id:faqQuestion.id,text:faqQuestion.text,kind:'text'}},reply:field==='service'?'¿Para qué plaga necesitas el servicio?':'¿En qué tipo de inmueble necesitas el servicio?'};
      }else decision=pendingQuestion&&!quotationInquiry(pendingQuestion.text)?{state:{...caseState,lastText:e.text},reviewTopic:'customer-question',reviewConditions:{question:normalize(pendingQuestion.text),caseId:caseState.caseId},reviewSource:pendingQuestion.id,pendingQuestion:pendingQuestion.text,review:'Hay una pregunta pendiente en esta misma secuencia; el mensaje siguiente aporta datos, pero no sustituye esa pregunta.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.'}:customerDecision(c.company,caseState,e,analysis);
      if(pendingQuestion&&decision.review){decision.reviewSource=pendingQuestion.id;decision.pendingQuestion=pendingQuestion.text;}
      let selectedPrice=null;
      const currentQuote=caseState.quotedPrice;
      const priceNow=currentQuote&&selectPrice(decision.state.slots,s.approvedPriceCatalogs(),currentQuote.entryId).entry;
      const continuingQuote=c.company==='fumigacion'&&currentQuote&&priceNow?.id===currentQuote.entryId&&priceNow.priceCop===currentQuote.priceCop&&
        !decision.review&&!decision.courtesy&&!specialQuotation(e.text,decision.state.slots)&&
        (currentQuote.accepted||/^(?:si(?:[, ]+por favor)?|listo|dale|de acuerdo|acepto|quiero continuar|quiero agendar|deseo agendar)[.! ]*$/.test(normalize(e.text)));
      if(continuingQuote){
        const delivered=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ')").get(currentQuote.sourceId+':reply',e.phone,e.line);
        if(delivered&&s.priceReplyStillValid(delivered)){
          decision.state.quotedPrice={...currentQuote,accepted:true,acceptanceSource:e.id};
          const preference=/\b(?:hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|tarde|noche|\d{1,2}[/:]\d{1,2})\b/.test(normalize(e.text))?textWithoutLinks(e.text).slice(0,300):decision.state.slots.preference;
          if(preference){
            decision.state.slots.preference=preference;
            decision={state:decision.state,question:{topic:'disponibilidad-y-tecnico',conditions:{...decision.state.slots,quotedPriceCop:currentQuote.priceCop,priceSource:priceNow.source.quoteId}},reply:'Gracias. Una asesora continuará contigo para confirmar el horario del servicio.'};
          }else if(!decision.state.asked.includes('preference')){
            decision.state.asked.push('preference');decision={state:decision.state,reply:'¿Qué día y franja horaria prefieres para el servicio?'};
          }else decision={state:decision.state,reviewTopic:'missing-intake:preference',reviewConditions:{missing:'preference'},review:'La persona aceptó la cotización verificada, pero falta una preferencia de horario clara.',reviewQuestion:'¿Qué día y franja horaria prefiere esta persona?',reply:'Gracias. Una asesora continuará contigo para confirmar el horario del servicio.'};
        }else decision={state:decision.state,observed:true,observedState:'QUOTATION_DELIVERY_REVIEW'};
      }
      if(c.company==='fumigacion'&&(decision.question?.topic==='cotizacion-verificada'||decision.reviewTopic==='customer-question'&&quotationInquiry(e.text))){
        const selection=selectPrice(decision.state.slots,s.approvedPriceCatalogs());
        if(selection.entry&&!e.forwarded&&!ambiguousIntake(e.text)&&!specialQuotation(e.text,decision.state.slots)){
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
      decision.state.lastHandledSourceId=e.id;
      if(/^[¡! ]*(?:hola\b|buenos dias\b|buen dia\b|buenas tardes\b|buenas noches\b)/.test(normalize(e.text))&&!conv.state.introduced&&decision.reply){
        if(c.company==='fumigacion'&&!selectedPrice&&!quotationInquiry(e.text)&&!decision.courtesy&&!decision.review&&!decision.question&&!decision.observed){
          const missing=decision.state.slots,requests=[];
          if(!missing.service)requests.push('Qué plaga deseas tratar o si buscas prevención.');
          if(normalize(missing.service).includes('chinches')){
            if(!missing.site)requests.push('Qué tipo de inmueble es.');
            if(!missing.mattresses)requests.push('Cuántos colchones están afectados y si también hay chinches en bases de cama u otros muebles.');
          }else if(!missing.site||!missing.area&&!missing.rooms)requests.push(!missing.site&&!missing.area&&!missing.rooms?'Qué tipo de inmueble es y cuántas habitaciones o metros cuadrados tiene.':!missing.site?'Qué tipo de inmueble es.':'Cuántas habitaciones o metros cuadrados tiene.');
          if(!missing.location&&!missing.locationDetails)requests.push('El municipio y barrio o vereda donde necesitas el servicio.');
          if(requests.length){decision.reply='Para ayudarte con la cotización, cuéntame:\n'+requests.map(x=>'• '+x).join('\n');decision.state.initialIntakeAllRequested=true;}
        }
        decision.reply='Hola, soy '+c.bot+'. '+decision.reply;decision.state.introduced=true;
      }
      s.saveConversation(e.phone,decision.state);
      const labels={service:'Servicio',location:'Municipio confirmado por el texto',locationDetails:'Ubicación indicada',site:'Inmueble',area:'Área informada',rooms:'Habitaciones informadas',mattresses:'Colchones afectados',roomScale:'Tamaño de las habitaciones',siteScale:'Tamaño del inmueble indicado',floors:'Pisos informados',patio:'Patio informado',treatmentScope:'Alcance informado',detail:'Falla informada',preference:'Preferencia'};
      const context=Object.entries(decision.state.slots).map(([k,v])=>(labels[k]||k)+': '+questionExcerpt(String(v))).join('; ').slice(0,650);
      if(decision.review){
        if(decision.reviewTopic==='service-documents'||c.company==='fumigacion'&&decision.reviewTopic==='special-quotation'){decision.state.awaitingHumanReview=true;s.saveConversation(e.phone,decision.state);}
        const history=s.conversationContext(e.phone,e.at,20,e.id);
        s.audit('CONVERSATION_CONTEXT_REVIEW',e.id,{caseId:caseState.caseId,turns:history.turns.length,storedCoverageComplete:history.completeStoredHistory,fullWhatsAppHistoryRead:false,originalMediaRead:false});
        const request=s.questionToRecipients({phone:e.phone,line:e.line,caseId:caseState.caseId,topic:decision.reviewTopic||'revision:'+e.id,conditions:decision.reviewConditions|| (decision.reviewTopic?{question:normalize(e.text),caseId:caseState.caseId}:{event:e.id,caseId:caseState.caseId}),recipients:questionRecipients(c,decision.reviewTopic||'revision:'+e.id),source:decision.reviewSource||e.id,
          text:c.name+': contacto terminado en '+e.phone.slice(-4)+'. '+decision.review+(decision.pendingQuestion?' Pregunta pendiente: '+questionExcerpt(decision.pendingQuestion)+'.':'')+' Mensaje actual: '+questionExcerpt(e.text)+(context?' Datos de esta solicitud: '+context+'.':'')+' '+(decision.reviewQuestion||'¿Cómo debemos continuar en este caso?')});
        if(!request.created&&(decision.reviewTopic?.startsWith('missing-intake:')||['cotizacion-verificada','common-question','service-documents','service-followup','requested-technician-contact','payment-instructions','existing-quotation','unread-link'].includes(decision.reviewTopic))){
          decision.reply=null;
          s.audit('PENDING_CLARIFICATION_REUSED',e.id,{caseId:caseState.caseId,questionId:request.id,topic:decision.reviewTopic,newOutboundCreated:false});
        }
      }
      if(decision.question){
        const slots=decision.question.conditions;
        const summary=Object.entries(slots).map(([k,v])=>(labels[k]||k)+': '+questionExcerpt(String(v))).join('; ');
        const quoteOnly=decision.question.topic==='cotizacion-verificada';
        const request=s.questionToRecipients({phone:e.phone,line:e.line,caseId:caseState.caseId,topic:decision.question.topic,conditions:slots,recipients:questionRecipients(c,decision.question.topic),source:pendingQuestion?.id||e.id,
          text:c.name+': solicitud del contacto terminado en '+e.phone.slice(-4)+'. '+summary+(quoteOnly?'. Falta confirmar el precio y la respuesta aplicable. ¿Qué cotización y texto vigente corresponden a esta solicitud?':decision.question.topic==='disponibilidad-y-tecnico'?'. La cotización fue entregada y aceptada; no hay reserva guardada ni horario o técnico confirmados. ¿Qué disponibilidad y técnico corresponden a este caso?':'. Aún no hay técnico, horario ni precio confirmados. ¿Qué técnico, horario disponible y cotización corresponden a este caso?')});
        if(!request.created)decision.reply=null;
        else if(c.company==='fumigacion'){
          decision.reply=decision.question.topic==='disponibilidad-y-tecnico'?'Gracias. Una asesora continuará contigo para confirmar el horario del servicio.':'Gracias. Una asesora continuará contigo para completar la cotización.';
          decision.state.awaitingHumanReview=true;s.saveConversation(e.phone,decision.state);
        }
      }
      if(decision.reply){
        decision.reply=adviserReply(c.company,decision,{firstReply:!conv.state.lastHandledSourceId&&!decision.state.pendingFaqQuestion,approvedAnswer:Boolean(faq?.answer)});
        if(!publicTextSafe(decision.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
        s.queue(e.id+':reply',e.phone,e.line,decision.reply,false,conv.revision,decision.courtesy?null:caseState.caseId);
        if(faq?.answer)s.saveApprovedReplyReference(e.id+':reply',{question:faqQuestion.text,context:caseState.slots,caseId:caseState.caseId,answer:faq.answer,finalText:decision.reply,answerIds:faq.answerIds,sourceIds:faq.sourceIds});
        if(selectedPrice)s.savePriceReplyReference(e.id+':reply',{entryId:selectedPrice.id,priceCop:selectedPrice.priceCop,context:{...decision.state.slots},finalText:decision.reply});
      }
      finish(decision.observed?decision.observedState||'OBSERVED_CALL':decision.review?'REVIEW':decision.question?'WAITING_COORDINATOR':'DONE');
    });
  }
}
