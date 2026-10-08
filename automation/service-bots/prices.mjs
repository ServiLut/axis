import {createHash} from 'node:crypto';
import {normalize} from './config.mjs';
import {validateBusinessPriceSchedule,selectBusinessPrice,verifyBusinessPriceEntry} from './business-prices.mjs';
import {specialPropertyScope} from './property-scope.mjs';

export const PRICE_AUTHORITY='direct-user-chat-20261005-common-quotes-special-cases-and-human-priority';
const fields=new Set(['service','site','location','locationDetails','area','rooms','roomScale','siteScale','treatmentScope','floors','patio']);
const counts={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
export function numericCount(value){const t=normalize(value).match(/^(\d{1,4}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)(?:er|ro|do|to)?\b/);return t?(counts[t[1]]??Number(t[1])):null;}
export function quotationInquiry(text){
 const t=normalize(text);
 return !/\b(?:garantia|productos?|segur\w*|toxic\w*|pago|pague|abono|cuenta|refuerzo|descuento|ya me|me cotizaron)\b/.test(t)&&/\b(?:cotiz\w*|precio|valor|cuanto (?:(?:me|nos|les) )?(?:cuesta|vale|cobran)|costo)\b/.test(t);
}
export function specialQuotation(text,slots={}){
 return specialPropertyScope(text,slots);
}
export function validatePriceCatalog(doc,company){
 if(doc.kind==='approved_price_schedule')return validateBusinessPriceSchedule(doc,company);
 if(company!=='fumigacion'||doc.company!==company||doc.kind!=='approved_price_catalog'||doc.authorizationSource!==PRICE_AUTHORITY||doc.approval?.source!==PRICE_AUTHORITY||doc.approval.reviewed!==true||!Number.isFinite(Date.parse(doc.at))||!Array.isArray(doc.entries)||doc.entries.length<1||doc.entries.length>25)throw Error('PRICE_CATALOG_AUTHORITY_REQUIRED');
 const ids=new Set();
 for(const e of doc.entries){
  if(!/^[a-z0-9-]{3,100}$/.test(e.id)||ids.has(e.id)||!Number.isSafeInteger(e.priceCop)||e.priceCop<1000||e.priceCop>5000000||e.currency!=='COP'||typeof e.active!=='boolean'||e.scope!=='ordinary-service-exact-reviewed-conditions'||e.discount===true||e.revisit===true)throw Error('PRICE_ENTRY_REQUIRED');
  ids.add(e.id);
  if(!e.appliesTo||Object.entries(e.appliesTo).some(([k,v])=>!fields.has(k)||typeof v!=='string'||!v.trim()||v.length>300)||!['service','site','location'].every(k=>e.appliesTo[k])||(!e.appliesTo.area&&!e.appliesTo.rooms))throw Error('PRICE_EXACT_SCOPE_REQUIRED');
  if(specialQuotation(Object.values(e.appliesTo).join(' '),e.appliesTo)||normalize(e.appliesTo.service).includes('chinches'))throw Error('SPECIAL_QUOTATION_REQUIRES_REVIEW');
  const s=e.source;
  if(s?.nativeVerified!==true||!['573126944997','573126938721'].includes(s.line)||!/^[A-Za-z0-9_-]{6,100}$/.test(s.quoteId)||!Number.isFinite(Date.parse(s.at))||!/^[a-f0-9]{64}$/.test(s.quoteHash)||!Array.isArray(s.context)||!s.context.length||s.context.length>20||s.context.some(x=>!/^[A-Za-z0-9_-]{6,100}$/.test(x.id)||!/^[a-f0-9]{64}$/.test(x.bodyHash)||!Number.isFinite(Date.parse(x.at))))throw Error('PRICE_NATIVE_SOURCE_REQUIRED');
 }
 return doc;
}
function fieldEqual(key,expected,actual){
 if(!actual)return false;
 if(key==='rooms'||key==='floors')return numericCount(expected)===numericCount(actual)&&numericCount(actual)!==null;
 if(key==='area')return normalize(expected).replace(/\s+/g,'').replace(/m(?:etroscuadrados|2|²)/,'m²')===normalize(actual).replace(/\s+/g,'').replace(/m(?:etroscuadrados|2|²)/,'m²');
 if(key==='locationDetails'){
  const words=v=>' '+normalize(v).replace(/[^\p{L}\d ]/gu,' ').replace(/\s+/g,' ').trim()+' ';
  return !/\b(?:no en|no es|antes|anterior|otro municipio)\b/.test(normalize(actual))&&words(actual).includes(words(expected));
 }
 return normalize(expected)===normalize(actual);
}
export function currentPriceEntries(catalogs){
 const entries=new Map();
 for(const d of catalogs){validatePriceCatalog(d,'fumigacion');if(d.kind==='approved_price_catalog')for(const e of d.entries)entries.set(e.id,e);}
 return [...entries.values()].filter(e=>e.active);
}
export function selectPrice(slots,catalogs,preferredId=null){
 // A price already issued for this case keeps its own reviewed source. A new
 // general table must not silently reprice it or redistribute pending work.
 if(preferredId&&!preferredId.startsWith('approved-table-')){
  const previous=selectPrice(slots,catalogs.filter(d=>d.kind==='approved_price_catalog'));
  if(previous.entry&&previous.entry.id===preferredId)return previous;
  const exact=currentPriceEntries(catalogs).find(e=>e.id===preferredId&&Object.entries(e.appliesTo).every(([k,v])=>fieldEqual(k,v,slots[k])));
  if(exact&&previous.entry&&previous.entry.priceCop===exact.priceCop)return {entry:exact,sourceIds:previous.sourceIds};
  return {reason:'PRIOR_CASE_PRICE_REQUIRES_REVIEW'};
 }
 const approved=catalogs.find(d=>d.kind==='approved_price_schedule');
 if(approved){validateBusinessPriceSchedule(approved,'fumigacion');const selected=selectBusinessPrice(slots);if(selected.entry)return selected;}
 const matches=currentPriceEntries(catalogs).filter(e=>Object.entries(e.appliesTo).every(([k,v])=>fieldEqual(k,v,slots[k]))&&
  // An extra area or count, size qualification, floor or treatment scope cannot
  // be dropped to force a historical quote to fit a different property.
  ['area','rooms','roomScale','siteScale','floors','treatmentScope','patio'].every(k=>!slots[k]||e.appliesTo[k]&&fieldEqual(k,e.appliesTo[k],slots[k])));
 if(!matches.length)return {reason:'NO_REVIEWED_PRICE_FOR_EXACT_CONDITIONS'};
 if(new Set(matches.map(e=>e.priceCop)).size!==1)return {reason:'CONFLICTING_REVIEWED_PRICES'};
 return {entry:matches[0],sourceIds:matches.map(e=>e.source.quoteId)};
}
export function priceText(entry){return 'Con gusto. '+(entry.category==='chinches'?'El tratamiento de '+entry.mattresses+' '+(entry.mattresses===1?'colchón':'colchones'):'El servicio')+' tiene un valor de $'+new Intl.NumberFormat('es-CO').format(entry.priceCop)+' COP. ¿Deseas continuar con esta cotización?';}
export function priceBodyHash(text){return createHash('sha256').update(text).digest('hex');}
export async function verifyPriceSource(entry,transport){
 if(entry?.source?.type==='direct_user_approved_schedule'){
  if(transport.config.company!=='fumigacion')throw Error('PRICE_OWN_LINE_REQUIRED');
  verifyBusinessPriceEntry(entry);
  for(const line of transport.config.lines)await transport.verifyLine(line.phone);
  return true;
 }
 const line=transport.config.lines.find(l=>l.phone===entry.source.line);if(!line||transport.config.company!=='fumigacion')throw Error('PRICE_OWN_LINE_REQUIRED');
 await transport.verifyLine(line.phone);
 const records=[];
 for(const source of [{id:entry.source.quoteId,at:entry.source.at,bodyHash:entry.source.quoteHash},...entry.source.context]){
  const found=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{id:source.id}},offset:10,page:1});
  const own=(found.messages?.records??[]).filter(r=>r.key?.id===source.id);
  if(own.length!==1)throw Error('PRICE_SOURCE_NOT_UNIQUE');
  const r=own[0],m=r.message?.ephemeralMessage?.message??r.message??{},text=m.conversation??m.extendedTextMessage?.text??'';
  if(!text||priceBodyHash(text)!==source.bodyHash||new Date(Number(r.messageTimestamp)*1000).toISOString()!==source.at)throw Error('PRICE_SOURCE_CHANGED');
  records.push(r);
 }
 const quote=records[0];
 const phone=[quote.key.remoteJid,quote.key.remoteJidAlt].find(j=>/^57\d{10}@s\.whatsapp\.net$/.test(j??''));
 if(!phone||['573016803926','573233350137','573043332213'].map(p=>p+'@s.whatsapp.net').includes(phone)||quote.key.fromMe!==true||!records.slice(1).every(r=>r.key.fromMe===false&&(r.key.remoteJid===phone||r.key.remoteJidAlt===phone)&&Number(r.messageTimestamp)<=Number(quote.messageTimestamp)))throw Error('PRICE_CONTACT_CONTEXT_MISMATCH');
 const m=quote.message?.ephemeralMessage?.message??quote.message??{},text=m.conversation??m.extendedTextMessage?.text??'';
 const amounts=[...text.matchAll(/(?:\$\s*|(?:tan solo|valor|costo)[^\d]{0,25})(\d{2,3}(?:[.,]\d{3})+|\d{5,7})/gi)].map(x=>Number(x[1].replace(/\D/g,'')));
 if(!amounts.includes(entry.priceCop))throw Error('PRICE_AMOUNT_NOT_IN_NATIVE_SOURCE');
 // Verify that the selected conditions really occur in the native customer
 // sources. A real price message alone does not authorize invented scope.
 const {extractSlots}=await import('./engine.mjs');
 const scope={},texts=[];
 for(const row of records.slice(1)){
  const value=row.message?.ephemeralMessage?.message??row.message??{};
  if(value.extendedTextMessage?.contextInfo?.isForwarded||value.extendedTextMessage?.contextInfo?.forwardingScore>0)throw Error('PRICE_FORWARDED_CONTEXT');
  const body=value.conversation??value.extendedTextMessage?.text??'';
  Object.assign(scope,extractSlots(body,'fumigacion'));texts.push(body);
 }
 scope.locationDetails=texts.join(' | ');
 if(!Object.entries(entry.appliesTo).every(([key,value])=>fieldEqual(key,value,scope[key])))throw Error('PRICE_SCOPE_NOT_IN_NATIVE_SOURCE');
 return true;
}
