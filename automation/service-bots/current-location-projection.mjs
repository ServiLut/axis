import {createHash} from 'node:crypto';
import {normalize} from './config.mjs';

export const CURRENT_LOCATION_PROJECTION_GUARD='own-source-current-location-with-superseded-size-separated-v1';
const hash=text=>createHash('sha256').update(text).digest('hex');
const numbers={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
const count='(?:\\d{1,3}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';
const units={rooms:'(?:habitaci[oó]n(?:es)?|cuartos?|alcobas?|piezas?)',mattresses:'(?:colch[oó]n|colchones)',area:'(?:m(?:ts?)?\\.?\\s*(?:2|²|cuadrados?)|metros?\\s*cuadrados?)'};
function value(field,text){
 const pattern=field==='area'?'(\\d{1,5}(?:[.,]\\d{1,2})?)\\s*'+units.area:'('+count+')\\s*'+units[field];
 const match=normalize(text).match(new RegExp('^'+pattern+'$','u'));return match?(numbers[match[1]]??Number(match[1].replace(',','.'))):null;
}
function mentions(text){
 const found=[];for(const field of Object.keys(units)){
  const pattern=field==='area'?'\\d{1,5}(?:[.,]\\d{1,2})?\\s*'+units.area:count+'\\s*'+units[field];
  for(const match of text.matchAll(new RegExp('\\b'+pattern+'(?=$|[^\\p{L}\\d])','giu')))found.push({field,literal:match[0],value:value(field,match[0]),start:match.index,end:match.index+match[0].length});
 }return found;
}
function native(source,phone,line,at,anchor){return source?.kind==='text'&&source.fromMe===false&&!source.forwarded&&!source.quotedId&&source.phone===phone&&source.line===line&&Number.isSafeInteger(source.at)&&source.at>=anchor.at&&source.at<=at&&typeof source.text==='string';}
function pureSizingClause(text,conflicts,city){
 let remaining=normalize(text);for(const conflict of conflicts)remaining=remaining.replace(normalize(conflict.literal),' ');
 if(city)remaining=remaining.split(normalize(city)).join(' ');
 return !remaining.replace(/\b(?:tiene|tengo|son|es|el|la|un|una|mi|del|de|en|al|apartamento|casa|inmueble|lugar|mide|area|superficie|total|cuenta|con|queda|ubicado|ubicada|esta)\b/g,' ').replace(/[^\p{L}\d]+/gu,' ').trim();
}
const COUNT_SPAN_GUARD='own-delivered-accepted-current-mattress-quantity-span-v1';
function literalCurrentMattressCorrection(text,current,old){
 if(/[¿?"“”]/.test(text))return false;
 const t=normalize(text).replace(/[.!]+$/g,'').trim(),canonical=normalize(current),previous=normalize(old).replace(/\s+colchon(?:es)?$/u,'');
 const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('^(?:(?:corrijo|correccion|me equivoque|en realidad)\\s*[:,]?\\s*)?(?:(?:es|son)\\s+)?'+escape(canonical)+'(?:\\s*[,;]?\\s+no\\s+'+escape(previous)+'(?:\\s+colchon(?:es)?)?)?$','u').test(t);
}
function currentCountSpan(part,clauses,conflicts,state,source,quotation,{phone,line,at}){
 // This alternative is only for the demonstrated mattress correction. The
 // existing whole pure-size clause path below remains unchanged.
 if(conflicts.length!==1||conflicts[0].field!=='mattresses'||mentions(part.text).filter(hit=>hit.field==='mattresses').length!==1||!literalCurrentMattressCorrection(conflicts[0].currentText,conflicts[0].currentValue,conflicts[0].literal))return null;
 const conflict=conflicts[0],clause=clauses.find(text=>text.includes(conflict.literal));
 if(!clause||part.text.indexOf(clause)!==part.text.lastIndexOf(clause))return null;
 // Never take a number out of a restriction, address, uncertainty or a quoted
 // person's statement. A later separate clause is retained, not classified.
 if(/[¿?"“”]|\b(?:no|sin|ni|nunca|si|cuando|pero|aunque|quizas|tal vez|creo|duda|dijo|dice|dijeron|dicen|segun|vecin[oa]|tercero|barrio|sector|calle|carrera|cra|avenida|diagonal|transversal|interior|torre|piso|porteria|entrada|acceso|ingreso|llave|ascensor|escalera|puerta|horario|contacto|telefono|direccion|restric\w*|salida|cita|timbre|usar|dejar|pasar|requiere|debe|puede|evitar)\b|\b(?:apartamento|apto)\s+\d/.test(normalize(clause)))return null;
 if(!quotation||quotation.guard!==COUNT_SPAN_GUARD||quotation.caseId!==state.caseId||quotation.phone!==phone||quotation.line!==line||['service','site','location','mattresses'].some(field=>quotation.slots[field]!==state.slots[field])||quotation.sourceAt<conflict.currentAt||quotation.deliveredAt<quotation.sourceAt||quotation.acceptedAt<Math.floor(quotation.deliveredAt/1000)*1000||quotation.acceptedAt>at)return null;
 // The otherwise impure word must be this quotation's own literal service,
 // not a new permissive list of pests or arbitrary free-text instructions.
 const service=normalize(state.slots.service),servicePattern=new RegExp('\\b'+service.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','gu');
 if(!service||!servicePattern.test(normalize(clause))||!pureSizingClause(normalize(clause).replace(servicePattern,' '),[conflict],state.slots.location))return null;
 const start=conflict.start,end=conflict.end;
 if(part.text.slice(start,end)!==conflict.literal)return null;
 const before=part.text.slice(0,start),preposition=before.match(/\ben[ \t]+$/iu),spanStart=preposition?preposition.index:start,spanEnd=end+(part.text.slice(end).match(/^[ \t]+/)?.[0].length||0);
 const removed=part.text.slice(spanStart,spanEnd),projected=part.text.slice(0,spanStart)+part.text.slice(spanEnd),sourceOffset=source.text.indexOf(part.text);
 if(!projected.trim()||sourceOffset<0||source.text.indexOf(part.text,sourceOffset+1)!==-1)return null;
 return {text:projected,omission:{sourceId:source.id,at:source.at,sourceHash:hash(source.text),fragmentHash:hash(removed),field:conflict.field,previousLiteral:conflict.literal,currentValue:conflict.currentValue,currentSourceId:conflict.currentSourceId,currentSourceHash:conflict.currentSourceHash,guard:COUNT_SPAN_GUARD,start:sourceOffset+spanStart,end:sourceOffset+spanEnd,removed,quoteOutboxId:quotation.outboxId,quoteMid:quotation.mid,quoteTextHash:quotation.textHash,quoteSourceId:quotation.sourceId,quoteDeliveredAt:quotation.deliveredAt,quoteAcceptanceSourceId:quotation.acceptanceSourceId,quotePriceCop:quotation.priceCop},retained:[[0,spanStart],[spanEnd,part.text.length]].filter(([a,b])=>a<b).map(([a,b])=>({sourceId:source.id,at:source.at,sourceHash:hash(source.text),start:sourceOffset+a,end:sourceOffset+b,fragmentHash:hash(part.text.slice(a,b))}))};
}

/**
 * A projection of literal source spans for new DTOs, not a rewrite of history.
 * Only a native old size with a later, sourced current value can be separated.
 * Other clauses, including access instructions, remain exact original spans.
 */
export function projectCurrentMariaLocationDetails(state,{phone,line,at,sources=[],quotation=null}={}){
 const original=String(state?.slots?.locationDetails||''),result={guard:CURRENT_LOCATION_PROJECTION_GUARD,locationDetails:original,applied:false,review:false,omissions:[],retained:[]};
 const potential=mentions(original).filter(item=>value(item.field,state?.slots?.[item.field])!==null&&item.value!==value(item.field,state.slots[item.field]));
 if(!potential.length)return result;
 const anchorId=state.caseId?.startsWith('fumigacion:')?state.caseId.slice(11):null,anchor=sources.find(source=>source.id===anchorId);
 const reject=reason=>({...result,review:true,reason});
 if(!anchor||!Number.isSafeInteger(at)||!/^57\d{10}$/.test(phone||'')||!/^57\d{10}$/.test(line||'')||!native(anchor,phone,line,at,anchor))return reject('LOCATION_SOURCE_SCOPE_UNVERIFIED');
 const parts=state.intakeLocationParts;
 if(!Array.isArray(parts)||!parts.length||parts.length>3||parts.map(part=>part.text).join(' | ')!==original)return reject('LOCATION_PARTS_UNVERIFIED');
 const byId=new Map();for(const source of sources){const prior=byId.get(source?.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(source))return reject('LOCATION_SOURCE_CONFLICT');byId.set(source?.id,source);}
 const projected=[];
 for(const part of parts){
  const source=byId.get(part.sourceId);
  if(!source||!native(source,phone,line,at,anchor)||source.at!==part.at||source.text.trim()!==part.text)return reject('LOCATION_PART_SOURCE_UNVERIFIED');
  const conflicts=mentions(part.text).filter(item=>value(item.field,state.slots[item.field])!==null&&item.value!==value(item.field,state.slots[item.field]));
  if(!conflicts.length){projected.push(part.text);result.retained.push({sourceId:source.id,at:source.at,sourceHash:hash(source.text),fragmentHash:hash(part.text)});continue;}
  for(const conflict of conflicts){
   const ref=state.intakeSources?.[conflict.field],current=ref&&byId.get(ref.sourceId),canonical=state.slots[conflict.field];
   if(!current||!native(current,phone,line,at,anchor)||current.at!==ref.at||current.at<=source.at||!normalize(current.text).includes(normalize(canonical)))return reject('CURRENT_SIZE_SOURCE_UNVERIFIED');
   conflict.currentSourceId=current.id;conflict.currentSourceHash=hash(current.text);conflict.currentValue=canonical;conflict.currentAt=current.at;conflict.currentText=current.text;
  }
  // Split only explicit independent written clauses. No inferred rewrite or
  // replacement number is inserted into the customer's old location words.
  const clauses=part.text.split(/\s*;\s*|\r?\n+|\s+y\s+|(?<=[.!?])\s+(?=\p{L})/iu).map(clause=>clause.trim()).filter(Boolean);
  if(clauses.some(clause=>{const stale=conflicts.filter(conflict=>normalize(clause).includes(normalize(conflict.literal)));return stale.length&&!pureSizingClause(clause,stale,state.slots.location);})){
   const span=currentCountSpan(part,clauses,conflicts,state,source,quotation,{phone,line,at});
   if(!span)return reject('MIXED_CURRENT_LOCATION_REQUIRES_CLARIFICATION');
   projected.push(span.text);result.omissions.push(span.omission);result.retained.push(...span.retained);continue;
  }
  for(const clause of clauses){
   const stale=conflicts.filter(conflict=>normalize(clause).includes(normalize(conflict.literal)));
   if(!stale.length){projected.push(clause);result.retained.push({sourceId:source.id,at:source.at,sourceHash:hash(source.text),fragmentHash:hash(clause)});continue;}
   if(!pureSizingClause(clause,stale,state.slots.location))return reject('MIXED_CURRENT_LOCATION_REQUIRES_CLARIFICATION');
   for(const conflict of stale)result.omissions.push({sourceId:source.id,at:source.at,sourceHash:hash(source.text),fragmentHash:hash(clause),field:conflict.field,previousLiteral:conflict.literal,currentValue:conflict.currentValue,currentSourceId:conflict.currentSourceId,currentSourceHash:conflict.currentSourceHash});
  }
 }
 return {...result,locationDetails:projected.join(' | '),applied:true};
}

function ownCurrentQuotation(store,state,event){
 const q=state.quotedPrice;
 if(!q?.accepted||q.replyId||!q.entryId?.startsWith('approved-table-')||!q.sourceId||!q.acceptanceSource||!Number.isSafeInteger(q.priceCop)||q.priceCop<=0)return null;
 const row=store.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND internal=0 AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(q.sourceId+':reply',event.phone,event.line,state.caseId);
 if(!row)return null;
 const ref=store.priceReplyReference(row),version=store.priceReplyVersion(row);
 if(!ref||ref.entryId!==q.entryId||ref.priceCop!==q.priceCop||JSON.stringify(ref.context)!==JSON.stringify(q.slots)||!version?.deliveryVerified||version.clarification||version.scheduleHash!==q.scheduleHash||version.sourceAt!==q.issuedAt||!store.priceReplyStillValid(row))return null;
 const read=id=>{const saved=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(id,event.phone,event.line);return saved&&store.open(saved.body);},source=read(q.sourceId),acceptance=read(q.acceptanceSource),saved=store.db.prepare('SELECT value FROM meta WHERE key=?').get('first-delivery:'+row.id),proof=saved&&store.open(saved.value),anchor=read(state.caseId.slice(11));
 if(!anchor||!source||!acceptance||!native(source,event.phone,event.line,event.at,anchor)||!native(acceptance,event.phone,event.line,event.at,anchor)||source.id!==q.sourceId||acceptance.id!==q.acceptanceSource||source.at!==q.issuedAt||acceptance.at!==q.acceptedAt||row.created<source.at||proof?.mid!==row.mid||proof.line!==row.line||!['DELIVERED','READ'].includes(proof.state)||!Number.isSafeInteger(proof.verifiedAt)||proof.verifiedAt<row.created||proof.verifiedAt>event.at||acceptance.at<Math.floor(proof.verifiedAt/1000)*1000)return null;
 return {guard:COUNT_SPAN_GUARD,caseId:state.caseId,phone:event.phone,line:event.line,slots:q.slots,priceCop:q.priceCop,sourceId:source.id,sourceAt:source.at,acceptedAt:acceptance.at,acceptanceSourceId:acceptance.id,outboxId:row.id,mid:row.mid,deliveredAt:proof.verifiedAt,textHash:hash(store.open(row.body))};
}

/** Read only the finite original sources referenced by this own current case. */
export function currentMariaLocationProjection(store,state,event){
 const ids=new Set([state.caseId?.startsWith('fumigacion:')?state.caseId.slice(11):null,...(state.intakeLocationParts||[]).map(part=>part.sourceId),...['rooms','area','mattresses'].map(field=>state.intakeSources?.[field]?.sourceId)]);
 const sources=[...ids].filter(id=>typeof id==='string').map(id=>{const row=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(id,event.phone,event.line);return row&&store.open(row.body);}).filter(Boolean);
 return projectCurrentMariaLocationDetails(state,{phone:event.phone,line:event.line,at:event.at,sources,quotation:ownCurrentQuotation(store,state,event)});
}
