import {normalize,publicTextSafe} from './config.mjs';

export const MARIA_BATCH_INTAKE_GUARD='own-native-batch-partial-location-and-single-media-continuation-v1';
const blue='573126944997',mediaKinds=new Set(['image','audio','document','video']);
const negated=/\b(?:no|nunca|jamas|sin|si|quizas|tal vez|posiblemente|supongamos|hipotetic\w*|en caso de|hubiera|tuviera|dijo|dice|dijeron|segun|ajeno|tercero|otra persona|vecin[oa]|amig[oa])\b/;
const instruction=/\b(?:ignora|ignore|instruccion\w*|sistema|prompt|token|contrasena|clave|api|actua|responde|obedece|olvida|debes|deberias|escribe|envia|enviar|manda|mandar|copia|pega|simula|inventa|registra|registrar|crea|crear|cotiza|cotizar|precio|pago|pague|transferencia|comprobante|costo|cuesta|vale|gratis|descuento|garantia|cancel\w*|reprogram\w*)\b/;
const systemInstruction=/\b(?:ignora|ignore|instruccion\w*|sistema|prompt|token|contrasena|clave|api|actua|obedece|olvida|debes|deberias|simula|inventa)\b/;
const foreign=/\b(?:mi|el|la|su|un|una)\s+(?:vecin[oa]|amig[oa]|client[ae]?|mama|madre|papa|padre|herman[oa]|tecnic[oa])\b/;
function native(e,kind=null){return !!e&&typeof e.id==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(e.id)&&e.fromMe===false&&e.forwarded!==true&&!e.quotedId&&e.line===blue&&/^57\d{10}$/.test(e.phone??'')&&Number.isSafeInteger(e.at)&&e.at>0&&typeof e.text==='string'&&e.text.length<=8000&&(!kind||e.kind===kind);}
function scoped(company,state,event,caseSource){
 // The caller provides original events read from its own authenticated store.
 // A fabricated source.caseId is never treated as provenance: bind the state
 // to the real first event ID and compare phone, line, time and direction.
 return company==='fumigacion'&&native(event)&&native(caseSource)&&state?.caseId==='fumigacion:'+caseSource.id&&caseSource.phone===event.phone&&caseSource.line===event.line&&caseSource.at<=event.at;
}
function safe(text,max=180){return typeof text==='string'&&text.trim()&&text.length<=max&&publicTextSafe(text)&&!/["“”«»<>]|https?:|www\.|@|\b\d[\d ().-]{7,}\d\b/iu.test(text);}
function source(event,context){return {sourceId:event.id,at:event.at,guard:MARIA_BATCH_INTAKE_GUARD,context};}
function ordinary(state){return !state?.programIntake&&!state?.requestedAfterServiceReview&&!state?.requestedProductInquiry&&!state?.requestedControlReview;}

/** A short answer preserves only the sender's words, never a municipality. */
export function literalMariaPartialLocation({company,event,state={},prompt=null,caseSource}={}){
 if(!scoped(company,state,event,caseSource)||event.kind!=='text'||!ordinary(state)||!(prompt?.field==='location'||state.asked?.includes('location')||state.initialIntakeAllRequested))return null;
 const raw=event.text.trim(),t=normalize(raw);
 if(!safe(raw,120)||/[?¿\d]/u.test(raw)||negated.test(t)||instruction.test(t)||foreign.test(t))return null;
 if(/\b(?:nombre|apellido|documento|cedula|telefono|celular|correo|direccion|calle|carrera|diagonal|transversal|avenida|apto|apartamento|interior|piso|bloque|torre|soy|llamo|gracias|hola|bien|buenos|buenas|servicio|fumigacion|plaga|cucaracha\w*|chinche\w*|comejen|habitacion\w*|alcoba\w*|bano\w*|metros?|manana|hoy|ayer|confirmo|confirmado|listo|perfecto|quiero|necesito|pueden|podrian|horario|tecnico)\b/.test(t))return null;
 const parts=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!parts.length||parts.length>3||parts.some(x=>!/^\p{L}[\p{L} .'-]{1,50}$/u.test(x)||x.split(/\s+/).length>5))return null;
 // Unlabelled short location replies are accepted only at the location prompt.
 // They remain partial even if the spelling resembles a known municipality.
 if(parts.length===1&&!/^(?:barrio|sector|vereda|urbanizacion|urbanización)\b/iu.test(parts[0])&&prompt?.field!=='location'&&state.asked?.at(-1)!=='location')return null;
 return {locationDetails:raw,municipality:null,partial:true,source:source(event,'literal-prompted-partial-location-no-municipality-inferred')};
}

/** Explicit room units stay literal; bathrooms never become extra rooms. */
export function literalMariaRoomCount({company,event,state={},prompt=null,caseSource}={}){
 if(!scoped(company,state,event,caseSource)||event.kind!=='text'||!ordinary(state))return null;
 const raw=event.text.trim(),t=normalize(raw);
 if(!safe(raw,180)||/[?¿]/u.test(raw)||negated.test(t)||instruction.test(t)||foreign.test(t))return null;
 const num='(?:[1-9]\\d{0,2}|una?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)',unit='(?:habitacion(?:es)?|habitaci[oó]n(?:es)?|alcobas?|cuartos?)';
 const found=[...raw.matchAll(new RegExp('\\b('+num+'\\s*'+unit+')(?=\\b|'+num+'\\s*ba[nñ]os?)','giu'))];
 if(found.length===1){
  const match=found[0],before=normalize(raw.slice(0,match.index));
  if(/\b(?:entre|o|y)\s*$/.test(before)||/\b(?:o|entre)\b/.test(t))return null;
  const remainder=raw.slice(0,match.index)+' '+raw.slice(match.index+match[0].length);
  // These are literal property-size clauses, not arbitrary surrounding prose.
  if(!/^(?:(?:mi|el|la|un|una)\s+(?:casa|apartamento|inmueble|vivienda)\s+)?(?:(?:es|tiene|tengo|son|hay|cuenta con)\s*)?[\s,;.!]*(?:(?:y|con|mas|más)\s+)?(?:(?:un[oa]?|dos|tres|cuatro|cinco|\d{1,2})\s*ba[nñ]os?)?[\s,;.!]*$/iu.test(remainder.trim()))return null;
  return {rooms:match[0],literal:match[0],unitExpanded:false,calculatedArea:false,source:source(event,'literal-explicit-room-unit-bathrooms-excluded')};
 }
 if(!found.length&&(prompt?.field==='size'||state.asked?.at(-1)==='size')&&new RegExp('^(?:son|tiene|tengo)\\s+('+num+')[.! ]*$','iu').test(raw))return {clarification:'¿Te refieres a habitaciones o a metros cuadrados?',unitExpanded:false,calculatedArea:false,source:source(event,'literal-size-number-unit-needs-clarification')};
 return null;
}

function sameNativeText(sourceEvent,event,caseSource){return native(sourceEvent,'text')&&sourceEvent.phone===event.phone&&sourceEvent.line===event.line&&sourceEvent.at>=caseSource.at&&sourceEvent.at<=event.at;}
function provenField(field,state,sources,event,caseSource){
 const value=state.slots?.[field],ref=state.intakeSources?.[field];if(!safe(value,120)||!ref?.sourceId||!Number.isSafeInteger(ref.at))return null;
 if(field==='locationDetails'&&Array.isArray(state.intakeLocationParts)&&state.intakeLocationParts.length&&state.intakeLocationParts.length<=3){
  const parts=state.intakeLocationParts;
  if(parts.map(p=>p.text).join(' | ')===value&&parts.every(p=>safe(p.text,120)&&sources.some(s=>sameNativeText(s,event,caseSource)&&s.id===p.sourceId&&s.at===p.at&&s.text.trim()===p.text&&!negated.test(normalize(s.text))&&!systemInstruction.test(normalize(s.text))&&!foreign.test(normalize(s.text)))))return value.trim();
 }
 const candidate=sources.find(x=>x.id===ref.sourceId&&x.at===ref.at&&sameNativeText(x,event,caseSource));
 // A legitimate quote request may already carry facts ("quiero cotizar para
 // cucarachas en mi apartamento"). It is not a system instruction, and must
 // not make the subsequent attachment acknowledgement forget those facts.
 if(!candidate||!normalize(candidate.text).includes(normalize(value))||negated.test(normalize(candidate.text))||systemInstruction.test(normalize(candidate.text))||foreign.test(normalize(candidate.text)))return null;
 return value.trim();
}
function markerValid(m,state,event,caseSource){return m?.guard===MARIA_BATCH_INTAKE_GUARD&&m.caseId===state.caseId&&m.phone===event.phone&&m.line===event.line&&Number.isSafeInteger(m.acknowledgedAt)&&m.acknowledgedAt>=caseSource.at&&m.acknowledgedAt<=event.at&&Number.isSafeInteger(m.lastSourceAt)&&m.lastSourceAt>=m.acknowledgedAt&&m.lastSourceAt<=event.at&&Number.isSafeInteger(m.burstStartedAt)&&m.burstStartedAt>=caseSource.at&&m.burstStartedAt<=m.acknowledgedAt&&typeof m.firstSourceId==='string'&&Array.isArray(m.sourceIds)&&m.sourceIds.includes(m.firstSourceId)&&m.sourceIds.length>0&&m.sourceIds.every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(x));}
function consistentSources(sources){const seen=new Map();for(const e of sources){if(!e||typeof e.id!=='string')continue;const raw=JSON.stringify([e.phone,e.line,e.at,e.kind,e.text,e.fromMe,Boolean(e.forwarded),e.quotedId??null]);if(seen.has(e.id)&&seen.get(e.id)!==raw)return false;seen.set(e.id,raw);}return true;}

/** Pure response/marker proposal. It never reads a photo or dispatches a job. */
export function mariaMediaBurstContinuation({company,event,state={},sources=[],priorMarker=null,caseSource,humanHold=false}={}){
 if(!scoped(company,state,event,caseSource)||!mediaKinds.has(event.kind)||!ordinary(state)||humanHold||state.humanHold||state.humanTakeover||!Array.isArray(sources)||sources.length>4096||!consistentSources(sources))return null;
 const valid=sources.filter(s=>sameNativeText(s,event,caseSource));
 const burst=valid.filter(s=>event.at-s.at<=90000),ids=[...new Set([...burst.map(s=>s.id),event.id])];
 if(markerValid(priorMarker,state,event,caseSource)&&event.at-priorMarker.burstStartedAt<=90000){
  return {reply:null,suppressed:true,marker:{...priorMarker,lastSourceAt:event.at,sourceIds:[priorMarker.firstSourceId,...[...new Set([...priorMarker.sourceIds,...ids])].filter(id=>id!==priorMarker.firstSourceId).slice(-63)]},acknowledgedFields:[],missing:null,interpretedMedia:false,quoted:false,registered:false};
 }
 const fields={};for(const f of ['service','site','locationDetails','location','rooms','area']){const value=provenField(f,state,valid,event,caseSource);if(value)fields[f]=value;}
 const conflictingFields=[];
 if(state.siteConflict||state.intakeConflicts?.site||burst.some(s=>/\b(?:casa o apartamento|apartamento o casa)\b/.test(normalize(s.text)))){delete fields.site;conflictingFields.push('site');}
 const service=fields.service&&!/^(?:fumigacion|plaga|plagas|control de plagas?)$/.test(normalize(fields.service))?fields.service:null;
 const typo=!service&&burst.find(s=>/^comeje[.! ]*$/iu.test(s.text.trim()));
 const missing=typo?'pest-clarification':!service?'service':!fields.site?'site':!fields.location?'location':!fields.rooms&&!fields.area?'size':null;
 const acknowledgedFields=[];const sentences=['Gracias por la información.'];
 if(service){sentences.push('Conservo la plaga que indicaste: '+service+'.');acknowledgedFields.push('service');}
 if(fields.site){sentences.push('También indicaste '+fields.site+'.');acknowledgedFields.push('site');}
 if(fields.locationDetails||fields.location){sentences.push('Conservo la ubicación que enviaste: '+(fields.locationDetails||fields.location)+'.');acknowledgedFields.push(fields.locationDetails?'locationDetails':'location');}
 if(fields.rooms||fields.area){sentences.push('Conservo el dato de '+(fields.rooms||fields.area)+'.');acknowledgedFields.push(fields.rooms?'rooms':'area');}
 sentences.push('Recibí el archivo; su contenido aún necesita revisión.');
 const next={service:'¿Qué plaga deseas tratar?',site:'¿Es una casa, un apartamento u otro tipo de inmueble?',location:'¿En qué municipio necesitas el servicio?',size:'¿Cuántas habitaciones o metros cuadrados tiene el lugar?','pest-clarification':'¿Te refieres a comején?'}[missing];if(next)sentences.push(next);
 const marker={guard:MARIA_BATCH_INTAKE_GUARD,caseId:state.caseId,phone:event.phone,line:event.line,firstSourceId:event.id,burstStartedAt:event.at,acknowledgedAt:event.at,lastSourceAt:event.at,sourceIds:ids.slice(-64)};
 return {reply:sentences.join(' '),suppressed:false,marker,acknowledgedFields,conflictingFields,missing,clarificationSourceId:typo?.id??null,interpretedMedia:false,quoted:false,registered:false};
}
