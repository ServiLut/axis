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
  for(const match of text.matchAll(new RegExp('\\b'+pattern+'(?=$|[^\\p{L}\\d])','giu')))found.push({field,literal:match[0],value:value(field,match[0])});
 }return found;
}
function native(source,phone,line,at,anchor){return source?.kind==='text'&&source.fromMe===false&&!source.forwarded&&!source.quotedId&&source.phone===phone&&source.line===line&&Number.isSafeInteger(source.at)&&source.at>=anchor.at&&source.at<=at&&typeof source.text==='string';}
function pureSizingClause(text,conflicts,city){
 let remaining=normalize(text);for(const conflict of conflicts)remaining=remaining.replace(normalize(conflict.literal),' ');
 if(city)remaining=remaining.split(normalize(city)).join(' ');
 return !remaining.replace(/\b(?:tiene|tengo|son|es|el|la|un|una|mi|del|de|en|al|apartamento|casa|inmueble|lugar|mide|area|superficie|total|cuenta|con|queda|ubicado|ubicada|esta)\b/g,' ').replace(/[^\p{L}\d]+/gu,' ').trim();
}

/**
 * A projection of literal source spans for new DTOs, not a rewrite of history.
 * Only a native old size with a later, sourced current value can be separated.
 * Other clauses, including access instructions, remain exact original spans.
 */
export function projectCurrentMariaLocationDetails(state,{phone,line,at,sources=[]}={}){
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
   conflict.currentSourceId=current.id;conflict.currentSourceHash=hash(current.text);conflict.currentValue=canonical;
  }
  // Split only explicit independent written clauses. No inferred rewrite or
  // replacement number is inserted into the customer's old location words.
  const clauses=part.text.split(/\s*;\s*|\r?\n+|\s+y\s+|(?<=[.!?])\s+(?=\p{L})/iu).map(clause=>clause.trim()).filter(Boolean);
  for(const clause of clauses){
   const stale=conflicts.filter(conflict=>normalize(clause).includes(normalize(conflict.literal)));
   if(!stale.length){projected.push(clause);result.retained.push({sourceId:source.id,at:source.at,sourceHash:hash(source.text),fragmentHash:hash(clause)});continue;}
   if(!pureSizingClause(clause,stale,state.slots.location))return reject('MIXED_CURRENT_LOCATION_REQUIRES_CLARIFICATION');
   for(const conflict of stale)result.omissions.push({sourceId:source.id,at:source.at,sourceHash:hash(source.text),fragmentHash:hash(clause),field:conflict.field,previousLiteral:conflict.literal,currentValue:conflict.currentValue,currentSourceId:conflict.currentSourceId,currentSourceHash:conflict.currentSourceHash});
  }
 }
 return {...result,locationDetails:projected.join(' | '),applied:true};
}

/** Read only the finite original sources referenced by this own current case. */
export function currentMariaLocationProjection(store,state,event){
 const ids=new Set([state.caseId?.startsWith('fumigacion:')?state.caseId.slice(11):null,...(state.intakeLocationParts||[]).map(part=>part.sourceId),...['rooms','area','mattresses'].map(field=>state.intakeSources?.[field]?.sourceId)]);
 const sources=[...ids].filter(id=>typeof id==='string').map(id=>{const row=store.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(id,event.phone,event.line);return row&&store.open(row.body);}).filter(Boolean);
 return projectCurrentMariaLocationDetails(state,{phone:event.phone,line:event.line,at:event.at,sources});
}
