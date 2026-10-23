import {normalize} from './config.mjs';

export const SERVICE_ACCESS_GUARD='own-native-neighborhood-and-residential-access-before-new-registration-v1';
export const SERVICE_ACCESS_STARTS_AT=Date.parse('2026-10-23T17:00:00.000Z');
function direct(e){return e?.kind==='text'&&e.fromMe===false&&!e.forwarded&&!e.quotedId&&typeof e.text==='string'&&e.text.length<=1000&&!/[?¿"“”«»]|https?:|www\./i.test(e.text);}
function part(text){
 const raw=text.trim().replace(/[.!]+$/u,'').trim(),t=normalize(raw);
 if(/^(?:no (?:hay|tiene|tenemos|es|vivo en|pertenece a) (?:una? |ninguna? )?(?:unidad(?: residencial)?|conjunto|edificio)(?: ni (?:unidad|conjunto|edificio))?|(?:es |vivo en una? )?casa independiente)$/u.test(t))return {unit:raw};
 const match=raw.match(/^(?:(?:en|es|queda en|estoy en)\s+(?:(?:el|la)\s+)?)?(barrio|sector|vereda|unidad(?: residencial)?|conjunto(?: residencial)?|edificio|urbanizaci[oó]n)\s*:?\s+(.+)$/iu);
 if(!match)return null;
 const value=match[2].trim();
 if(value.length>100||!/[\p{L}]/u.test(value)||/\b(?:no se|no recuerdo|desconozco|pendiente|por confirmar|quizas|tal vez|quiero|fumigar|tratar|garantia|refuerzo|zonas? comunes?|todo|toda|completo|completa)\b/.test(normalize(value)))return null;
 return {[/^(?:barrio|sector|vereda)$/iu.test(match[1])?'neighborhood':'unit']:raw};
}
export function serviceAccessFacts(e){
 if(!direct(e))return {};
 return Object.assign({},...e.text.split(/[\r\n,;]+/u).map(part).filter(Boolean));
}
// A standalone answer to this own data prompt is an access fact, not a request
// to quote all apartments or common areas in the named residential complex.
export function serviceAccessOnlyTurn(state,e){
 if(state.programIntake?.accessDetailsGuard!==SERVICE_ACCESS_GUARD||!['name','address','details','confirm','correction'].includes(state.programIntake.stage)||!direct(e))return false;
 const pieces=e.text.split(/[\r\n,;]+/u).filter(v=>v.trim());
 return pieces.length>0&&pieces.every(v=>Boolean(part(v)));
}
export function ownServiceAccessDetails(store,state,e){
 const anchorId=state.caseId?.startsWith('fumigacion:')?state.caseId.slice(11):null;
 const anchor=anchorId&&store.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(anchorId,e.phone,e.line);
 if(!anchor)return null;
 const rows=store.db.prepare('SELECT id,at,body FROM events WHERE phone=? AND line=? AND from_me=0 AND rowid>=? AND at>=? AND at<=? ORDER BY rowid DESC LIMIT 201').all(e.phone,e.line,anchor.rowid,anchor.at,e.at);
 if(rows.length>200)return {complete:false,coverageComplete:false,missing:['neighborhood','unit']};
 const facts={};
 for(const row of rows.reverse()){
  const original=store.open(row.body);
  if(original.id!==row.id||original.at!==row.at||original.phone!==e.phone||original.line!==e.line||!direct(original))continue;
  for(const [field,value] of Object.entries(serviceAccessFacts(original)))facts[field]={value,sourceId:original.id,at:original.at,text:original.text};
 }
 const missing=['neighborhood','unit'].filter(field=>!facts[field]);
 return {guard:SERVICE_ACCESS_GUARD,complete:missing.length===0,coverageComplete:true,facts,missing};
}
export function serviceAccessRequests(details){
 return (details?.missing||[]).map(field=>field==='neighborhood'?'El barrio, sector o vereda del servicio.':'El nombre de la unidad, conjunto o edificio; si no hay, dímelo.');
}
export function serviceAccessSummary(details){
 return details?.complete?[details.facts.neighborhood.value,details.facts.unit.value]:[];
}
export function serviceAccessPayload(details,event){
 if(!details?.complete)return null;
 const fact=field=>{const f=details.facts[field];return {value:f.value,source:{id:f.sourceId,text:f.text,at:new Date(f.at).toISOString(),phone:event.phone,line:event.line,fromMe:false,forwarded:false}};};
 return {guard:SERVICE_ACCESS_GUARD,neighborhood:fact('neighborhood'),unit:fact('unit')};
}
