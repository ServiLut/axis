import {createHash} from 'node:crypto';
import {normalize,questionRecipients} from './config.mjs';
import {BUSINESS_PRICE_HASH,selectBusinessPrice} from './business-prices.mjs';
import {operationalLineAllowed,operationalCoverage} from './line-scope.mjs';

export const MARIA_PROGRAM_GUARD='own-accepted-ordinary-service-literal-fields-and-atomic-receipt-v2';
export const MARIA_PROGRAM_PIPELINE_GUARD='processed-customer-turn-before-registration-v1';
export const MARIA_PROGRAM_LITERAL_FIELDS_GUARD='own-prompted-separate-name-address-and-native-source-v1';
export const MARIA_TENANT='9ffea9df-1e06-4590-acec-0e5cde715ba9';
export const MARIA_COMPANY='35a19d89-15d1-4c32-8353-3471b6d9f0ff';
export const MARIA_PROGRAM_URL='https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration';
const setupKey='maria-program-setup',prefix='maria-registration:';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const iso=v=>new Date(v).toISOString();
const get=(s,key)=>{const row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?s.open(row.value):null;};
const put=(s,key,value)=>s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,s.seal(value));
export function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
export const registrationHash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function validated(body,company){
 if(company!=='fumigacion'||body?.enabled!==true||!uuid.test(body.actorId||'')||typeof body.token!=='string'||! /^[A-Za-z0-9_-]{43,128}$/.test(body.token))throw Error('OWN_PROGRAM_CONFIGURATION_REQUIRED');
 const u=new URL(body.url);if(u.href.replace(/\/$/,'')!==MARIA_PROGRAM_URL)throw Error('OWN_PROGRAM_HTTPS_REQUIRED');
 const startsAt=Date.parse(body.startsAt),expiresAt=Date.parse(body.expiresAt);
 if(!Number.isFinite(startsAt)||!Number.isFinite(expiresAt)||startsAt>=expiresAt)throw Error('OWN_PROGRAM_CUTOFF_REQUIRED');
 return {enabled:true,url:u.href.replace(/\/$/,''),token:body.token,actorId:body.actorId.toLowerCase(),startsAt,expiresAt,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY};
}
export function registrationConfig(env,company){
 if(env.BOT_MARIA_PROGRAM_ENABLED!=='true')return {enabled:false};
 return validated({enabled:true,url:env.BOT_MARIA_PROGRAM_URL,token:env.BOT_MARIA_PROGRAM_TOKEN,actorId:env.BOT_MARIA_PROGRAM_ACTOR_ID,startsAt:env.BOT_MARIA_PROGRAM_STARTS_AT_UTC,expiresAt:env.BOT_MARIA_PROGRAM_EXPIRES_AT_UTC},company);
}
export function programEnabled(c,now=Date.now()){const p=c.mariaProgram;return c.company==='fumigacion'&&c.enabled&&p?.enabled===true&&p.startsAt<=now&&p.expiresAt>now;}
export function restoreProgramSetup(c,s){
 if(c.company!=='fumigacion')return;
 const saved=get(s,setupKey);if(saved)c.mariaProgram=validated({...saved,startsAt:iso(saved.startsAt),expiresAt:iso(saved.expiresAt)},c.company);
}
async function request(c,path,body,fetcher){
 const p=c.mariaProgram;const r=await fetcher(p.url+path,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+p.token,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify(body)});
 if(!r.ok){const error=Error('PROGRAM_REQUEST_REJECTED');error.status=r.status;throw error;}
 const result=await r.json();return result?.success===true&&result.data&&typeof result.data==='object'?result.data:result;
}
function ownScope(c,r){return r?.company==='FUMIGACION'&&r.tenantId===MARIA_TENANT&&r.companyId===MARIA_COMPANY&&r.advisorMembershipId===c.mariaProgram.actorId;}
export async function programFollowupEligible(c,s,transport,phone){
 if(!programEnabled(c)||!/^57[0-9]{10}$/.test(phone))return false;
 try{
  const r=await request(c,'/customer-status',{phone},transport.fetcher);
  return programEnabled(c)&&ownScope(c,r)&&r.phone===phone&&r.complete===true&&r.eligibleForFollowup===true;
 }catch{return false;}
}
export async function installProgramSetup(c,s,body,fetcher){
 if(!body||Object.keys(body).sort().join(',')!=='actorId,enabled,expiresAt,startsAt,token,url')throw Error('PROGRAM_SETUP_FIELDS_REQUIRED');
 const candidate=validated(body,c.company),test={...c,mariaProgram:candidate};
 const status=await request(test,'/status',{},fetcher);
 if(!ownScope(test,status)||status.username!=='maria.angel.bot'||status.enabled!==true||status.businessWritesEnabled!==true||status.registrationKind!=='new-service-pending-scheduling'||status.priceScheduleHash!==BUSINESS_PRICE_HASH||Date.parse(status.startsAt)!==candidate.startsAt||Date.parse(status.expiresAt)!==candidate.expiresAt)throw Error('PROGRAM_SCOPE_NOT_VERIFIED');
 s.tx(()=>{put(s,setupKey,candidate);s.audit('OWN_PROGRAM_SETUP_VERIFIED',MARIA_PROGRAM_GUARD,{actorId:candidate.actorId,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:iso(candidate.startsAt),expiresAt:iso(candidate.expiresAt),testBusinessWritten:false});});c.mariaProgram=candidate;
 return registrationStatus(c,s);
}
export function registrationStatus(c,s){
 const entries=c.company==='fumigacion'?s.db.prepare('SELECT value FROM meta WHERE key LIKE ?').all(prefix+'%').map(r=>s.open(r.value)):[];
 const states=Object.fromEntries(['PENDING','SENDING','UNCERTAIN','SAVED','REVIEW'].map(state=>[state,entries.filter(entry=>entry.status===state).length]));
 const safeReason=reason=>['CASE_CHANGED_BEFORE_WRITE','NATIVE_CONTEXT_NOT_VERIFIED','UNCERTAIN_WRITE_NOT_FOUND','UNCERTAIN_RECEIPT_REQUIRES_REVIEW','OPERATIONAL_LINE_SCOPE_REVIEW'].includes(reason)?reason:'OTHER_REVIEW';
 const reviewed=entries.filter(entry=>entry.status==='REVIEW').sort((a,b)=>(Number(b.reviewAt)||0)-(Number(a.reviewAt)||0));
 const reasons=new Map();for(const entry of reviewed){const reason=safeReason(entry.reason);reasons.set(reason,(reasons.get(reason)||0)+1);}
 const own=c.company==='fumigacion';
 return {guard:own?MARIA_PROGRAM_GUARD:null,pipelineGuard:own?MARIA_PROGRAM_PIPELINE_GUARD:null,literalFieldsGuard:own?MARIA_PROGRAM_LITERAL_FIELDS_GUARD:null,operationalCoverage:operationalCoverage(c),configured:own&&c.mariaProgram?.enabled===true,enabled:programEnabled(c),company:own?'FUMIGACION':'S.TECNICO',tenantId:own&&c.mariaProgram?.enabled?MARIA_TENANT:null,companyId:own&&c.mariaProgram?.enabled?MARIA_COMPANY:null,advisorMembershipId:own?c.mariaProgram?.actorId||null:null,registrationKind:own?'new-service-pending-scheduling':null,prepared:states.PENDING,states,saved:states.SAVED,uncertain:states.UNCERTAIN+states.SENDING,review:states.REVIEW,lastReviewReason:reviewed.length?safeReason(reviewed[0].reason):null,reviewReasons:[...reasons].sort(([a],[b])=>a.localeCompare(b)).map(([reason,count])=>({reason,count})),scheduled:false,paymentsEnabled:false,fullyAutonomous:false};
}
// Only an affirmative from the customer is authority to create an ordinary,
// unscheduled order. Courtesy, a preference or a quoted third-party "yes" alone
// cannot become acceptance. The backend independently applies this same grammar.
export function acceptsOrdinaryQuotation(text){
 if(typeof text!=='string'||text.length>500||/[?¿]|https?:/i.test(text))return false;
 const t=normalize(text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim();
 if(/\b(?:no|pero|siempre|depende|cuando|quizas|tal vez|puede|podria|si se|si hay|si tiene|si es|si queda|si pueden|si manana|refuerzo|garantia|verificacion|revisita|anterior|pague|pago|pagar|transferencia|comprobante|consignacion|descuento|gratis|cancelar|cancela|otro|otra|edificio|apartamentos|casas|colchones|metros|cucarachas|hormigas|roedores|chinches|comejen)\b/.test(t))return false;
 const labels=[...text.matchAll(fieldLabels())];
 if(labels.length){
  const before=text.slice(0,labels[0].index).trim().replace(/[.!¡,;]+$/g,'').trim();
  if(!before||!acceptsOrdinaryQuotation(before))return false;
  const seen=new Set();
  return labels.every((hit,i)=>{
   const key=/direcci[oó]n/i.test(hit[0])?'address':'name',value=fieldValue(text,labels,i);
   if(seen.has(key))return false;seen.add(key);
   return Boolean(key==='name'?literalName(value,true):literalAddress(value,true));
  });
 }
 return /^(?:si|listo|dale|acepto|de acuerdo|confirmo|correcto|esta bien|perfecto|si esta bien|si confirmo|si acepto|todo correcto|si todo correcto|si correcto|listo esta bien|ok|okay)(?: (?:agendame|programame|reservame|agenda el servicio|programa el servicio|quiero el servicio)(?: para)?(?: (?:hoy|manana|pasado manana|el lunes|el martes|el miercoles|el jueves|el viernes|el sabado|el domingo))?(?: (?:en la manana|en la tarde|en la noche|a las? \d{1,2}(?::\d{2})?(?: am| pm)?))?)?(?: (?:por favor|gracias|muchas gracias))*$/.test(t);
}
const confirms=acceptsOrdinaryQuotation;
const fieldLabels=()=>/(?:\b(?:mi nombre(?: completo)?(?: es)?|nombre completo|me llamo|a nombre de)|\b(?:(?:mi|la) direcci[oó]n(?: completa)?(?: es)?|direcci[oó]n(?: completa)?))\s*[: ,]*\s*/giu;
const fieldValue=(text,hits,i)=>text.slice(hits[i].index+hits[i][0].length,hits[i+1]?.index??text.length).trim().replace(/(?:\s+y)?[\s,;.!]*$/u,'').trim();
function explicitFields(text){
 const hits=[...text.matchAll(fieldLabels())],fields={};
 for(let i=0;i<hits.length;i++){
  const hit=hits[i],key=/direcci[oó]n/i.test(hit[0])?'address':'name';
  let value=fieldValue(text,hits,i);
  // A sentence after an explicitly labelled fact is not part of that fact.
  value=value.split(/[;\n]|\.\s+(?=[¿¡\p{L}])/u)[0].trim();
  const parsed=key==='name'?literalName(value,true):literalAddress(value,true);
  if(parsed){if(fields[key]&&fields[key]!==parsed)fields.conflict=true;fields[key]=parsed;}
 }
 return fields;
}
export function literalIntakeTextWithoutRegistrationFields(text){
 if(typeof text!=='string')return text;
 const hits=[...text.matchAll(fieldLabels())],spans=[];
 for(let i=0;i<hits.length;i++){
  const hit=hits[i],start=hit.index+hit[0].length,end=hits[i+1]?.index??text.length,key=/direcci[oó]n/i.test(hit[0])?'address':'name';
  const segment=text.slice(start,end),folded=segment.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const sentence=segment.search(/[;\n]|\.\s+(?=[¿¡\p{L}])/u);
  const semantic=key==='address'?folded.search(/\b(?:pero|ademas|tambien|para|quiero|necesito|fumigar|tratar|refuerzo|garantia|verificacion|inspeccion|todo|toda|entero|entera|zonas? comunes?|sigue|siguen|continua|ya fumig|otra|otro)\b|\ben\s+(?!(?:(?:el|la|un|una)\s+)?(?:barrio|sector|edificio|unidad|conjunto|urbanizacion|apartamento|apto|interior|porteria|torre)\b)/):-1;
  const boundaries=[sentence,semantic].filter(x=>x>=0),boundary=boundaries.length?Math.min(...boundaries):segment.length;
  const value=segment.slice(0,boundary).trim().replace(/(?:\s+y)?[\s,;.!]*$/u,'').trim();
  if(!(key==='name'?literalName(value,true):literalAddress(value,true)))continue;
  const valueAt=segment.indexOf(value);spans.push([hit.index,start+valueAt+value.length]);
 }
 let result=text;for(const [start,end] of spans.reverse())result=result.slice(0,start)+' '+result.slice(end);
 return result.replace(/\s+/g,' ').trim();
}
function literalName(text,prompted){
 const explicit=text.match(/^(?:mi nombre (?:es|completo es)|me llamo|a nombre de|nombre completo)\s*[: ,]*\s+(.+)$/i);
 const name=(explicit?.[1]||(prompted?text:'' )).trim().replace(/[.!]+$/,'').trim();
 if(/[\r\n]/.test(name)||registrationPreface.test(normalize(name))||! /^[\p{L}][\p{L}'’-]*(?:[^\S\r\n]+[\p{L}][\p{L}'’-]*){1,9}$/u.test(name)||/\b(?:quiero|necesito|gracias|servicio|manana|hoy|cucarachas|refuerzo|garantia|no|si|nombre)\b/.test(normalize(name)))return null;return name;
}
function literalAddress(text,prompted){
 const explicit=text.match(/^(?:(?:mi|la) direcci[oó]n(?: completa)?(?: es)?|direcci[oó]n(?: completa)?)\s*[: ,]+(.+)$/i);
 const address=(explicit?.[1]||(prompted?text:'')).trim();
 if(address.length<5||address.length>500||/[\r\n?¿]|https?:|\b(?:cambiar|no se|todavia|no recuerdo|otra direccion)\b/i.test(address))return null;
 const streets=[...address.matchAll(/\b(?:calle|carrera|cra|cr|cl|cll|avenida|av|diagonal|transversal|dg|tv)\b\.?\s*\d/gi)];
 if(streets.length>1)return null;
 if(!/^(?:calle|carrera|cra|cr|cl|cll|avenida|av|diagonal|transversal|dg|tv)\b.*\d.*\d/i.test(address)&&!(/^(?:vereda|finca)\b/i.test(address)&&address.split(/\s+/).length>=4))return null;return address;
}
const registrationPreface=/^(?:(?:aqui|ahi) (?:te |se )?lo (?:mande|envie|mando|envio|comparti)|ya (?:te |se )?lo (?:mande|envie|comparti)|(?:te |se )?lo (?:mande|envie|comparti) (?:arriba|antes)|estos son mis datos)\b/;
function registrationSourcePreface(text){const t=normalize(text),match=t.match(registrationPreface);return Boolean(match&&/^[.!¡, ]*$/.test(t.slice(match[0].length)));}
const correctionFieldReference=text=>/^(?:(?:mi|el) nombre(?: completo)?|(?:mi|la) direccion(?: completa)?|(?:mi|el) apellido|(?:mis|los) datos|(?:ese|este|el) dato|(?:esta|estan|es|son) (?:mal|incorrect[oa]s?|equivocad[oa]s?))[.! ]*$/.test(normalize(text));
function promptedLiteralFields(text,requested,correction=false){
 const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(lines.length<2)return {};
 const values={};
 for(const line of lines){
  if(registrationSourcePreface(line)||correction&&correctionFieldReference(line))continue;
  const labelled=explicitFields(line),name=labelled.name||(requested.includes('name')&&literalName(line,true)),address=labelled.address||(requested.includes('address')&&literalAddress(line,true));
  if(labelled.conflict||(!name&&!address)||(name&&address))return {};
  const key=name?'name':'address',value=name||address;
  if(values[key]&&values[key]!==value)return {};
  values[key]=value;
 }
 return values;
}
function changedAddressScope(text,slots){
 const t=normalize(text),city=normalize(slots.location);
 const cities=['medellin','bello','envigado','itagui','sabaneta','la estrella','copacabana','girardota','bogota','cali','barranquilla','cartagena','rionegro','marinilla','guarne','santa fe de antioquia','sopetran'];
 if(cities.some(x=>new RegExp('\\b'+x+'\\b').test(t)&&x!==city))return true;
 const namedCity=t.match(/\b(?:municipio|ciudad)(?: de)?\s+([^,#.]+)/)?.[1]?.trim();if(namedCity&&namedCity!==city)return true;
 if(/\b(?:todo|toda|entero|entera|completo|completa)\s+(?:(?:el|la|un|una)\s+)?(?:edificio|unidad|conjunto|torre|casa|finca)|\b(?:zonas? comunes?|parqueaderos?|shute?|bodegas?|locales?|restaurante|cafeteria|patio|pisos?|varias propiedades)\b/.test(t))return true;
 if(/\b(?:dos|tres|cuatro|cinco|seis)\s+(?:casas?|apartamentos?|locales?|torres?)\b/.test(t))return true;
 const units=t.match(/\b(?:para|son|necesito|tratar|fumigar|fumigacion de|servicio para)\s+(?:(?:los|las)\s+)?(\d+)\s+(?:casas?|apartamentos?|aptos?|locales?|torres?)\b/);if(units&&Number(units[1])>1)return true;
 const inPlace=t.match(/\ben\s+([\p{L}][\p{L}\s'-]*)/u)?.[1]?.trim();
 if(inPlace&&!inPlace.startsWith(city)&&! /^(?:el |la |los |las )?(?:barrio|conjunto|unidad|edificio|apartamento|apto|interior|portería|porteria|urbanizacion|torre)\b/.test(inPlace)&&!normalize(slots.locationDetails||'').includes(inPlace))return true;
 if(/\b(?:cucarachas|roedores|ratas|ratones|chinches|comejen|avispas|hormigas|metros cuadrados|m2|mts2|habitaciones?|colchones?)\b/.test(t))return true;
 return false;
}
const source=e=>({id:e.id,text:e.text,at:iso(e.at)});
function caseLiteralFields(s,c,state,e){
 const firstId=state.caseId?.startsWith(c.company+':')?state.caseId.slice(c.company.length+1):state.quotedPrice?.sourceId;
 const first=firstId&&s.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(firstId,e.phone,e.line);
 const current=s.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line);
 if(!first||!current)return [];
 // A bounded native case window, never another case or a different line.
 const rows=s.db.prepare('SELECT body FROM events WHERE phone=? AND line=? AND from_me=0 AND rowid>=? AND rowid<=? AND at>=? AND at<=? ORDER BY rowid DESC LIMIT 40').all(e.phone,e.line,first.rowid,current.rowid,Math.max(first.at,c.mariaProgram.startsAt),e.at).reverse();
 return rows.map(row=>s.open(row.body)).filter(turn=>turn.kind==='text'&&!turn.forwarded&&turn.phone===e.phone&&turn.line===e.line&&!/\b(?:psicologos|abogados|miguel angel|servicio tecnico|otra solicitud|otro servicio|otro inmueble)\b/.test(normalize(turn.text))).map(turn=>({...explicitFields(turn.text),source:source(turn)}));
}
function eligibleQuote(s,state,phone,line){
 const q=state.quotedPrice,entry=selectBusinessPrice(state.slots).entry;
 if(!q?.accepted||!entry||entry.id!==q.entryId||entry.priceCop!==q.priceCop||entry.source.scheduleHash!==BUSINESS_PRICE_HASH)return null;
 const row=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(q.sourceId+':reply',phone,line);
 const firstDelivery=row&&get(s,'first-delivery:'+row.id);
 if(!row||row.created<Date.now()-86400000||!firstDelivery||firstDelivery.mid!==row.mid||!s.priceReplyReference(row)||!s.priceReplyStillValid(row)||firstDelivery.verifiedAt<Date.now()-86400000)return null;
 row.firstDeliveryAt=Math.floor(firstDelivery.verifiedAt/1000)*1000;
 return {q,entry,row};
}
export function registrationQuoteReady(s,state,phone,line){return Boolean(eligibleQuote(s,state,phone,line));}
function blockedText(text){return /[?¿]|^no\b|\b(?:refuerzo|garantia|verificacion|visita anterior|ya fumig|certificado|documento|cancel|no quiero|no acepto|pague|pago|pagar|transfer|comprobante|consign|descuento|gratis|otra solicitud|nuevo servicio|otro servicio|otro inmueble)\w*/.test(normalize(text));}
// Called only inside the engine's existing transaction; no network or business write.
export function registrationTurn(s,c,previous,e,decision){
 if(!programEnabled(c)||e.fromMe||e.forwarded||e.kind!=='text'||e.at<c.mariaProgram.startsAt)return null;
 if(!operationalLineAllowed(c,e.line)||c.operationalLineScope&&e.at<Date.parse(c.operationalLineScope.authorizedAt))return null;
 if(c.operationalLineScope&&(typeof s.hasSourcesOutsideLine!=='function'||s.hasSourcesOutsideLine(e.phone,e.line)))return null;
 const state=decision.state,own=eligibleQuote(s,state,e.phone,e.line);
 if(!own||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview||(decision.courtesy&&!confirms(e.text)))return null;
 const prior=state.programIntake||{stage:'name',originalQuoteAcceptanceId:own.q.acceptanceSource};
 if(['pending','review','declined'].includes(prior.stage))return {state,observed:true,observedState:'PROGRAM_REGISTRATION_PENDING'};
 if(prior.stage==='registered')return null;
 const pi={...prior};state.programIntake=pi;
 if(/\b(?:no (?:gracias|quiero|deseo|necesito|me interesa|acepto)|prefiero no|cancela|cancelar)\b/.test(normalize(e.text))){
  pi.stage='declined';pi.preview=null;state.closed=true;state.quotedPrice={...state.quotedPrice,accepted:false};
  return {state,reply:'Entendido. No registraré el servicio. Gracias por avisarme.'};
 }
 if(/^no\b/.test(normalize(e.text))&&['confirm','correction'].includes(prior.stage)){
  pi.stage='correction';pi.requestedFields=['name','address'];pi.preview=null;pi.promptId=e.id+':reply';return {state,reply:'¿Qué dato debemos corregir antes de registrar tu solicitud?'};
 }
 if(blockedText(e.text))return null;
 // Reuse explicitly labelled facts from this native case window. Bare text is
 // interpreted as a field only in reply to our own delivered request for it.
 const prompt=pi.promptId&&s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ')").get(pi.promptId,e.phone,e.line);
 const fields=caseLiteralFields(s,c,state,e);let conflicting=false;
 for(const fact of fields){
  if(fact.conflict)conflicting=true;
  for(const [key,sourceKey] of [['name','nameSource'],['address','addressSource']]){
   const valueKey=key==='name'?'customerName':'address';
   if(fact[key]&&(!pi[valueKey]||Date.parse(fact.source.at)>Date.parse(pi[sourceKey]?.at||0))){
    if(pi[valueKey]&&pi[valueKey]!==fact[key])conflicting=true;
    if(pi[valueKey]!==fact[key]||!pi[sourceKey]){pi[valueKey]=fact[key];pi[sourceKey]=fact.source;}
   }
  }
 }
 const explicit=explicitFields(e.text),requested=pi.requestedFields||(['name','address'].includes(pi.stage)?[pi.stage]:['name','address']);
 const separated=prompt&&!confirms(e.text)?promptedLiteralFields(e.text,requested,pi.stage==='correction'):{};
 const name=explicit.name||separated.name||(!confirms(e.text)&&literalName(e.text,(pi.stage==='name'||pi.stage==='correction'&&!correctionFieldReference(e.text))&&Boolean(prompt))),address=explicit.address||separated.address||literalAddress(e.text,(['address','confirm','correction'].includes(pi.stage)||pi.requestedFields?.includes('address'))&&Boolean(prompt));
 const scopedAddress=address||pi.address;
 if(scopedAddress&&changedAddressScope(scopedAddress,state.slots)){
  pi.stage='review';pi.preview=null;return {state,reviewTopic:'special-quotation',reviewConditions:{kind:'registration-address-scope-changed',caseId:state.caseId},review:'La dirección o su texto añaden un municipio o alcance diferente a la cotización aceptada. No se creó un servicio ni se conservó ese precio para otro alcance.',reviewQuestion:'¿Qué municipio y alcance comprobados corresponden a esta solicitud?',reply:'Los datos que compartiste cambian el alcance de la cotización. Tu solicitud necesita revisión antes de confirmarla.'};
 }
 let changed=Boolean(conflicting||explicit.conflict||pi.customerName!==prior.customerName||pi.address!==prior.address);
 if(name&&name!==pi.customerName){pi.customerName=name;pi.nameSource=source(e);changed=true;}
 if(address&&address!==pi.address){pi.address=address;pi.addressSource=source(e);changed=true;}
 if(!pi.customerName||!pi.address){
  const missing=[...(!pi.customerName?['name']:[]),...(!pi.address?['address']:[])];
  if(pi.promptId&&!prompt&&JSON.stringify(pi.requestedFields||[])===JSON.stringify(missing))return {state,observed:true,observedState:'PROGRAM_FIELDS_DELIVERY_PENDING'};
  pi.stage=!pi.customerName?'name':'address';pi.requestedFields=missing;pi.promptId=e.id+':reply';
  return {state,reply:missing.length===2?'Para registrar tu solicitud, compárteme tu nombre completo y la dirección completa del servicio, incluido apartamento o interior si aplica.':missing[0]==='name'?'Me falta tu nombre completo para registrar la solicitud. ¿Me lo compartes?':'¿Cuál es la dirección completa del servicio, incluido apartamento o interior si aplica?'};
 }
 if(prior.stage==='correction'&&!changed)return {state,reply:'¿Cuál es el dato correcto que debemos cambiar?'};
 // If the customer already supplied both literal facts before accepting the
 // delivered price, the acceptance is sufficient for an unscheduled order.
 // New/corrected facts supplied after acceptance still need a delivered summary.
 const preprovided=confirms(e.text)&&!conflicting&&!explicit.conflict&&!['confirm','correction'].includes(prior.stage)&&Date.parse(pi.nameSource.at)<=e.at&&Date.parse(pi.addressSource.at)<=e.at;
 if(!preprovided&&(prior.stage!=='confirm'||changed)){
  pi.stage='confirm';pi.promptId=e.id+':reply';pi.preview={customerName:pi.customerName,address:pi.address,municipality:state.slots.location,service:state.slots.service,priceCop:own.entry.priceCop};
  return {state,reply:'Registraré el servicio de '+state.slots.service+' por $'+own.entry.priceCop.toLocaleString('es-CO')+' en '+pi.address+', '+state.slots.location+', a nombre de '+pi.customerName+'. ¿Confirmas que estos datos son correctos?'};
 }
 if(!preprovided&&(!prompt||!confirms(e.text)))return {state,observed:true,observedState:'PROGRAM_SUMMARY_CONFIRMATION_PENDING'};
 if(!preprovided&&JSON.stringify(pi.preview)!==JSON.stringify({customerName:pi.customerName,address:pi.address,municipality:state.slots.location,service:state.slots.service,priceCop:own.entry.priceCop}))return {state,observed:true,observedState:'PROGRAM_SUMMARY_REVIEW'};
 const conv=s.conversation(e.phone),allowed=['service','site','location','area','rooms','mattresses','patio','floors','roomScale','siteScale','treatmentScope','affectedFurniture'];
 const slots=Object.fromEntries(allowed.filter(k=>state.slots[k]!=null).map(k=>[k,String(state.slots[k])]));
 const payload={caseId:state.caseId,phone:e.phone,line:e.line,sourceId:e.id,customerName:pi.customerName,address:pi.address,municipality:state.slots.location,locationDetails:String(state.slots.locationDetails||''),slots,
  quote:{entryId:own.entry.id,priceCop:own.entry.priceCop,scheduleHash:BUSINESS_PRICE_HASH,mid:own.row.mid,sourceId:own.q.sourceId,deliveredAt:iso(own.row.firstDeliveryAt),acceptedAt:iso(e.at),acceptanceId:e.id},
  sources:{customerName:pi.nameSource,address:pi.addressSource,acceptance:{...source(e),phone:e.phone,line:e.line,fromMe:false,forwarded:false}}};
 const key=prefix+state.caseId,existing=get(s,key),hash=registrationHash(payload);
 if(existing){if(existing.requestHash!==hash)throw Error('PROGRAM_CASE_ALREADY_RESERVED');return {state,observed:true,observedState:'PROGRAM_REGISTRATION_PENDING'};}
 const summaryOutboxId=preprovided?null:pi.promptId;
 put(s,key,{status:'PENDING',payload,requestHash:hash,revision:conv.revision,summaryOutboxId,confirmationKind:preprovided?'price-accepted-with-prior-literal-facts':'delivered-summary-confirmed',createdAt:Date.now()});pi.stage='pending';pi.acceptanceId=e.id;
 s.audit('OWN_SERVICE_REGISTRATION_PREPARED',e.id,{caseId:state.caseId,requestHash:hash,priceCop:own.entry.priceCop,businessWritten:false,summaryOutboxId});
 return {state,observed:true,observedState:'PROGRAM_REGISTRATION_PENDING'};
}
function receiptValid(c,entry,r){return ownScope(c,r)&&r.createdById===c.mariaProgram.actorId&&r.phone===entry.payload.phone&&r.persisted===true&&uuid.test(r.orderId||'')&&r.caseId===entry.payload.caseId&&r.acceptanceId===entry.payload.quote.acceptanceId&&r.requestHash===entry.requestHash&&r.state==='NUEVO'&&r.scheduled===false&&r.paymentRecorded===false;}
async function nativeMessage(t,c,id,phone,line){
 const l=c.lines.find(x=>x.phone===line);if(!l||typeof t.request!=='function')throw Error('PROGRAM_NATIVE_RECHECK_REQUIRED');
 const response=await t.request(l,'/chat/findMessages/'+encodeURIComponent(l.instance),{where:{key:{id}},offset:10,page:1});
 const matches=(response.messages?.records||[]).filter(r=>r.key?.id===id&&(r.key.remoteJid===phone+'@s.whatsapp.net'||r.key.remoteJidAlt===phone+'@s.whatsapp.net'));
 if(matches.length!==1)throw Error('PROGRAM_NATIVE_SOURCE_NOT_UNIQUE');return matches[0];
}
function nativeText(r){const m=r.message?.ephemeralMessage?.message??r.message??{};return m.conversation??m.extendedTextMessage?.text;}
// A temporary line scope permits only a new, explicit acceptance on that line.
// Earlier literal facts and a delivered price remain reusable in the same case,
// but every original source still has to be stored and rechecked on the blue line.
function registrationOperationalScope(s,c,entry){
 const p=entry.payload;if(!operationalLineAllowed(c,p.line))return false;
 if(!c.operationalLineScope)return true;
 if(typeof s.hasSourcesOutsideLine!=='function'||s.hasSourcesOutsideLine(p.phone,p.line))return false;
 const acceptanceAt=Date.parse(p.sources?.acceptance?.at);
 if(!Number.isFinite(acceptanceAt)||acceptanceAt<Date.parse(c.operationalLineScope.authorizedAt)||p.sources?.acceptance?.line!==p.line)return false;
 return Object.values(p.sources||{}).every(src=>Boolean(s.db.prepare('SELECT 1 FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(src.id,p.phone,p.line)))&&
  Boolean(s.db.prepare('SELECT 1 FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(p.quote.sourceId,p.phone,p.line));
}
const neutralCourtesy=text=>/^(?:gracias|muchas gracias|mil gracias|muy amable|gracias muy amable)[.!¡, ]*$/.test(normalize(text));
function storedCourtesy(s,p,id){
 const row=s.db.prepare("SELECT * FROM events WHERE id=? AND phone=? AND line=? AND from_me=0 AND state NOT IN ('PENDING','PROCESSING')").get(id,p.phone,p.line);
 if(!row)return null;const event=s.open(row.body);
 return event.kind==='text'&&!event.fromMe&&!event.forwarded&&event.at>Date.parse(p.sources.acceptance.at)&&neutralCourtesy(event.text)?event:null;
}
async function verifyNative(s,c,t,entry){
 if(!registrationOperationalScope(s,c,entry))throw Error('OPERATIONAL_LINE_SCOPE_REVIEW');
 const p=entry.payload,own=eligibleQuote(s,s.conversation(p.phone).state,p.phone,p.line);if(!own||own.q.sourceId!==p.quote.sourceId)throw Error('PROGRAM_PRICE_CHANGED');
 await t.verifyLine(p.line);
 const attention=await t.currentAttention(p.phone);if(!attention.complete)throw Error('PROGRAM_ATTENTION_UNVERIFIED');
 const unknown=attention.sources.find(a=>!s.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(a.id,p.phone,a.line));
 if(unknown){s.hold(p.phone,unknown.id);throw Error('PROGRAM_HUMAN_TAKEOVER');}
 const quote=await nativeMessage(t,c,p.quote.mid,p.phone,p.line),deliveries=[[quote,own.row]];
 if(entry.summaryOutboxId){
  const summary=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(entry.summaryOutboxId,p.phone,p.line);
  if(!summary)throw Error('PROGRAM_SUMMARY_DELIVERY_UNVERIFIED');
  deliveries.push([await nativeMessage(t,c,summary.mid,p.phone,p.line),summary]);
 }else if(entry.confirmationKind!=='price-accepted-with-prior-literal-facts'||!confirms(p.sources.acceptance.text)||Date.parse(p.sources.customerName.at)>Date.parse(p.sources.acceptance.at)||Date.parse(p.sources.address.at)>Date.parse(p.sources.acceptance.at))throw Error('PROGRAM_CUSTOMER_CONFIRMATION_UNVERIFIED');
 for(const [r,row] of deliveries)if(r.key.fromMe!==true||nativeText(r)!==s.open(row.body)||![r.status,...(r.MessageUpdate||[]).map(u=>u.status)].some(v=>['DELIVERY_ACK','READ','PLAYED'].includes(v)))throw Error('PROGRAM_NATIVE_DELIVERY_MISMATCH');
 for(const src of Object.values(p.sources)){
  const eventRow=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(src.id,p.phone,p.line);if(!eventRow)throw Error('PROGRAM_SOURCE_SCOPE');
  const event=s.open(eventRow.body),native=await nativeMessage(t,c,src.id,p.phone,p.line),m=native.message?.ephemeralMessage?.message??native.message??{},ctx=m.extendedTextMessage?.contextInfo??native.contextInfo??{};
  if(event.text!==src.text||event.at!==Date.parse(src.at)||event.forwarded||native.key.fromMe!==false||nativeText(native)!==src.text||Number(native.messageTimestamp)*1000!==event.at||ctx.isForwarded||ctx.forwardingScore>0)throw Error('PROGRAM_NATIVE_FACT_MISMATCH');
 }
 if(typeof t.currentCustomerActivity!=='function')throw Error('PROGRAM_CUSTOMER_CONTEXT_UNVERIFIED');
 const at=Date.parse(p.sources.acceptance.at),latest=await t.currentCustomerActivity(p.phone,at);
 if(!latest.complete||!latest.sources.some(r=>r.id===p.quote.acceptanceId&&r.line===p.line&&r.at===at))throw Error('PROGRAM_NEW_CUSTOMER_TURN');
 const subsequent=latest.sources.filter(r=>r.at>at||r.at===at&&r.id!==p.quote.acceptanceId);
 if(subsequent.length>3)throw Error('PROGRAM_NEW_CUSTOMER_TURN');
 for(const item of subsequent){
  const event=storedCourtesy(s,p,item.id);if(!event||item.line!==p.line||item.at!==event.at)throw Error('PROGRAM_NEW_CUSTOMER_TURN');
  const native=await nativeMessage(t,c,item.id,p.phone,p.line),m=native.message?.ephemeralMessage?.message??native.message??{},ctx=m.extendedTextMessage?.contextInfo??native.contextInfo??{};
  if(native.key.fromMe!==false||nativeText(native)!==event.text||Number(native.messageTimestamp)*1000!==event.at||ctx.isForwarded||ctx.forwardingScore>0)throw Error('PROGRAM_NEW_CUSTOMER_TURN');
 }
}
function sameCurrent(s,entry){
 const p=entry.payload,c=s.conversation(p.phone);
 if(!c||c.hold||c.state.caseId!==p.caseId||c.state.programIntake?.stage!=='pending'||c.state.awaitingHumanReview||s.db.prepare("SELECT 1 FROM events WHERE phone=? AND state='PENDING'").get(p.phone))return false;
 if(c.revision===entry.revision)return true;
 const delta=c.revision-entry.revision;if(delta<1||delta>3)return false;
 const newer=s.db.prepare('SELECT id FROM events WHERE phone=? AND from_me=0 AND revision>? AND revision<=?').all(p.phone,entry.revision,c.revision);
 return newer.length===delta&&newer.every(row=>Boolean(storedCourtesy(s,p,row.id)));
}
function awaitsOwnCustomerTurn(s,c,entry){
 const p=entry.payload,conv=s.conversation(p.phone);
 if(!conv||conv.hold||conv.state.caseId!==p.caseId||conv.state.programIntake?.stage!=='pending'||conv.state.awaitingHumanReview)return false;
 // A processed contradiction already requires review. An unresolved own
 // customer source only postpones writing; it cannot renew acceptance.
 const processed=s.db.prepare("SELECT id FROM events WHERE phone=? AND from_me=0 AND revision>? AND revision<=? AND state<>'PENDING'").all(p.phone,entry.revision,conv.revision);
 if(processed.some(row=>!storedCourtesy(s,p,row.id)))return false;
 const phones=c.lines.map(line=>line.phone);
 return Boolean(s.db.prepare("SELECT 1 FROM events WHERE phone=? AND from_me=0 AND state='PENDING' AND line IN (?,?) LIMIT 1").get(p.phone,phones[0],phones[1]));
}
function review(s,c,key,entry,reason,notify=true){s.tx(()=>{
 const p=entry.payload;put(s,key,{...entry,status:'REVIEW',reason,reviewAt:Date.now()});const conv=s.conversation(p.phone);
 if(conv?.state.caseId===p.caseId){conv.state.programIntake={...conv.state.programIntake,stage:'review'};conv.state.awaitingHumanReview=true;s.saveConversation(p.phone,conv.state);}
 s.audit('OWN_SERVICE_REGISTRATION_REVIEW',p.sourceId,{caseId:p.caseId,reason,businessWritten:entry.status==='SAVED'});
 // A new technical exception goes to direction once, with its own persisted question.
 // A takeover itself needs no duplicate notification or customer interruption.
 if(notify&&conv&&!conv.hold&&conv.state.caseId===p.caseId){
  s.questionToRecipients({phone:p.phone,line:p.line,caseId:p.caseId,topic:'program-registration-review',conditions:{caseId:p.caseId,requestHash:entry.requestHash},recipients:questionRecipients(c,'program-registration-review'),source:p.sourceId,text:c.name+': solicitud aceptada del contacto '+p.phone+', precio $'+p.quote.priceCop+'. El guardado necesita revisión ('+reason+'); no se reintentó la escritura. No hay horario ni pago confirmados. ¿Cómo debemos continuar con este registro?'});
  s.queue('program:'+p.caseId+':review',p.phone,p.line,'Gracias. Tu solicitud queda pendiente de confirmación.',false,conv.revision,p.caseId);
 }
});}
function saved(s,c,key,entry,r,routeQuestion){
 s.tx(()=>{
  const p=entry.payload,active=sameCurrent(s,entry)&&registrationOperationalScope(s,c,entry);put(s,key,{...entry,status:'SAVED',receipt:r,savedAt:Date.now()});
  const conv=s.conversation(p.phone);if(conv?.state.caseId===p.caseId){conv.state.programIntake={...conv.state.programIntake,stage:'registered'};conv.state.programServiceId=r.orderId;s.saveConversation(p.phone,conv.state);}
  const authorship=s.caseAuthorship(p.caseId);if(authorship)s.db.prepare('UPDATE case_authorship SET body=? WHERE case_id=?').run(s.seal({...authorship,creatorCreditWritten:true,programServiceId:r.orderId,programCreatorMembershipId:r.advisorMembershipId,programReceiptHash:r.requestHash,serviceCompleted:false}),p.caseId);
  s.audit('OWN_SERVICE_REGISTRATION_SAVED',p.sourceId,{caseId:p.caseId,orderId:r.orderId,createdById:r.advisorMembershipId,requestHash:r.requestHash,scheduled:false,paymentRecorded:false,confirmationSuppressed:!active});
  if(active){const preference=conv.state.slots.preference;s.queue('program:'+p.caseId+':saved',p.phone,p.line,'Tu solicitud de servicio de '+p.slots.service+' por $'+p.quote.priceCop.toLocaleString('es-CO')+' quedó registrada a nombre de '+p.customerName+' en '+p.address+', '+p.municipality+'. El horario aún está pendiente de confirmación.'+(preference?'':' ¿Qué día y franja horaria prefieres?'),false,conv.revision,p.caseId);
   if(preference){
    const question={phone:p.phone,line:p.line,caseId:p.caseId,topic:'disponibilidad-y-tecnico',conditions:{...conv.state.slots,quotedPriceCop:p.quote.priceCop,programServiceId:r.orderId},recipients:questionRecipients(c,'disponibilidad-y-tecnico'),source:p.sourceId,text:c.name+': solicitud ordinaria guardada, servicio '+p.slots.service+' en '+p.municipality+'. Precio aceptado $'+p.quote.priceCop+'. Pendiente de programación. ¿Qué disponibilidad y técnico corresponden a este caso?'};
    try{
     if(typeof routeQuestion!=='function'&&c.tesaOperations?.enabled)throw Error('PROGRAM_OPERATIONAL_ROUTER_REQUIRED');
     const routed=typeof routeQuestion==='function'?routeQuestion(s,c,question):s.questionToRecipients(question);
     if(routed?.then)throw Error('PROGRAM_OPERATIONAL_ROUTER_MUST_BE_SYNC');
     if(routed?.outboxId?.startsWith('tesa-question:'))conv.state.pendingTesaQuestionId=routed.id;
     conv.state.awaitingHumanReview=true;s.saveConversation(p.phone,conv.state);
    }catch{
     // The verified program receipt is durable even if consultation routing
     // fails. This is a scheduling review, never an uncertain business write.
     conv.state.awaitingHumanReview=true;s.saveConversation(p.phone,conv.state);
     s.audit('OWN_SERVICE_SCHEDULING_ROUTE_REVIEW',p.sourceId,{caseId:p.caseId,orderId:r.orderId,businessWritten:true,questionSent:false});
    }
   }
  }
 });
}
export async function drainProgramRegistrations(s,c,t,routeQuestion=null){
 if(!programEnabled(c))return {enabled:false};
 const rows=s.db.prepare('SELECT key,value FROM meta WHERE key LIKE ? ORDER BY key').all(prefix+'%');let persisted=0,reviewed=0,deferred=0;
 for(const row of rows){let entry=s.open(row.value);if(!['PENDING','SENDING','UNCERTAIN'].includes(entry.status))continue;
  if(['SENDING','UNCERTAIN'].includes(entry.status)){
   if(entry.nextReceiptAt>Date.now())continue;
   try{const r=await request(c,'/receipt',{caseId:entry.payload.caseId,acceptanceId:entry.payload.quote.acceptanceId},t.fetcher);if(receiptValid(c,entry,r)){saved(s,c,row.key,entry,r,routeQuestion);persisted++;}else if(ownScope(c,r)&&r.persisted===false){review(s,c,row.key,entry,'UNCERTAIN_WRITE_NOT_FOUND');reviewed++;}else throw Error('PROGRAM_RECEIPT_SCOPE_UNVERIFIED');}
   catch{const failures=(entry.receiptFailures||0)+1;entry={...entry,receiptFailures:failures,nextReceiptAt:Date.now()+60000};put(s,row.key,entry);s.audit('OWN_REGISTRATION_RECEIPT_UNAVAILABLE',entry.payload.sourceId,{caseId:entry.payload.caseId,writeRetried:false});if(failures>=3){review(s,c,row.key,entry,'UNCERTAIN_RECEIPT_REQUIRES_REVIEW');reviewed++;}}continue;
  }
  if(!registrationOperationalScope(s,c,entry)){review(s,c,row.key,entry,'OPERATIONAL_LINE_SCOPE_REVIEW',false);reviewed++;continue;}
  // Fast response flush runs before Engine processes the next input. Leave
  // preparation intact until that authenticated source has been classified.
  if(awaitsOwnCustomerTurn(s,c,entry)){deferred++;continue;}
  if(!sameCurrent(s,entry)){review(s,c,row.key,entry,'CASE_CHANGED_BEFORE_WRITE');reviewed++;continue;}
  try{await verifyNative(s,c,t,entry);if(!registrationOperationalScope(s,c,entry))throw Error('OPERATIONAL_LINE_SCOPE_REVIEW');if(!sameCurrent(s,entry)||!programEnabled(c))throw Error('CASE_CHANGED_BEFORE_WRITE');}catch(error){
   if(error.message==='OPERATIONAL_LINE_SCOPE_REVIEW'||!registrationOperationalScope(s,c,entry)){review(s,c,row.key,entry,'OPERATIONAL_LINE_SCOPE_REVIEW',false);reviewed++;continue;}
   // Ingestion can also occur during the native reads. Do not turn that short
   // unprocessed interval into irreversible review or attempt a business write.
   if(awaitsOwnCustomerTurn(s,c,entry)){deferred++;continue;}
   review(s,c,row.key,entry,'NATIVE_CONTEXT_NOT_VERIFIED');reviewed++;continue;
  }
  s.tx(()=>{entry={...entry,status:'SENDING',attemptedAt:Date.now()};put(s,row.key,entry);s.audit('OWN_SERVICE_REGISTRATION_RESERVED',entry.payload.sourceId,{caseId:entry.payload.caseId,requestHash:entry.requestHash});});
  try{const r=await request(c,'',entry.payload,t.fetcher);if(!receiptValid(c,entry,r))throw Error('PROGRAM_RECEIPT_MISMATCH');saved(s,c,row.key,entry,r,routeQuestion);persisted++;}
  catch{put(s,row.key,{...entry,status:'UNCERTAIN'});s.audit('OWN_REGISTRATION_WRITE_UNCERTAIN',entry.payload.sourceId,{caseId:entry.payload.caseId,writeRetried:false});}
 }
 return {enabled:true,persisted,reviewed,deferred};
}
