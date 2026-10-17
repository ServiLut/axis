import {createHash} from 'node:crypto';
import {normalize,questionRecipients,SANDRA} from './config.mjs';
import {BUSINESS_PRICE_HASH,LEGACY_BUSINESS_PRICE_HASH,BUSINESS_PRICE_CUTOVER_AT,businessPriceHashAt,selectBusinessPrice} from './business-prices.mjs';
import {selectPrice} from './prices.mjs';
import {operationalLineAllowed,operationalCoverage} from './line-scope.mjs';
import {getTesaConfig} from './tesa-config.mjs';
import {mariaIncidentalPetMention,explicitNewService,afterServiceRequest} from './after-service.mjs';
import {verifyStoredNativeIdentitySource} from './native-identity-resolution.mjs';
import {partitionNativeAttention} from './explicit-return-attention.mjs';
import {currentMariaLocationProjection} from './current-location-projection.mjs';
import {MARIA_BATCH_INTAKE_GUARD} from './maria-batch-intake.mjs';
import {CUSTOMER_DEFERRAL_GUARD,customerDeferralRequested,customerDeferralResumeEvidence,customerDeclinesAfterDeferral} from './customer-deferral.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD,clientRequestedScheduleEnabled,projectClientRequestedSchedule,clientRequestedScheduleReceiptMatches} from './client-requested-schedule.mjs';

export const MARIA_PROGRAM_GUARD='own-accepted-ordinary-service-literal-fields-and-atomic-receipt-v2';
export const MARIA_PROGRAM_PIPELINE_GUARD='processed-customer-turn-before-registration-v1';
export const MARIA_PROGRAM_FORM_BATCH_GUARD='own-native-prompt-batch-facts-ordered-acceptance-v1';
export const MARIA_PROGRAM_LITERAL_FIELDS_GUARD='own-prompted-separate-name-address-standard-labels-and-native-source-v2';
export const MARIA_PROGRAM_OPERATIONAL_CONTINUATION_GUARD='own-saved-order-new-quoted-operation-and-customer-continuity-v1';
export const MARIA_PROGRAM_OPERATIONAL_CONFIRMATION_GUARD='own-saved-delivered-operation-pure-confirmation-without-repeat-v1';
export const MARIA_PROGRAM_TIMED_ACCEPTANCE_GUARD='own-literal-timed-acceptance-before-conditional-v1';
export const MARIA_PROGRAM_REQUESTED_TIMING_GUARD='own-literal-preference-source-and-pending-coordination-v1';
export const MARIA_PROGRAM_PET_PRESENCE_GUARD='own-confirmed-native-incidental-pet-observation-v1';
export const MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD='own-saved-service-durable-scheduling-exception-without-resend-v1';
export const MARIA_STAFF_PLANNING_GUARD='own-prospective-accepted-request-literal-preference-staff-assignment-v1';
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
export function staffPlanningConfig(env,company,activatedAt){
 if(env.BOT_MARIA_STAFF_PLANNING_ENABLED===undefined||env.BOT_MARIA_STAFF_PLANNING_ENABLED==='false')return {enabled:false};
 const startsAt=Date.parse(env.BOT_MARIA_STAFF_PLANNING_STARTS_AT_UTC||'');
 if(env.BOT_MARIA_STAFF_PLANNING_ENABLED!=='true'||company!=='fumigacion'||!Number.isSafeInteger(startsAt)||!Number.isSafeInteger(activatedAt)||startsAt<activatedAt||!/Z$/.test(env.BOT_MARIA_STAFF_PLANNING_STARTS_AT_UTC||''))throw Error('OWN_STAFF_PLANNING_CONFIGURATION_REQUIRED');
 return Object.freeze({enabled:true,mode:'internal-staff-assignment',startsAt});
}
export function staffPlanningEnabled(c,at=Date.now()){return c.company==='fumigacion'&&c.staffPlanning?.enabled===true&&c.staffPlanning.mode==='internal-staff-assignment'&&Number.isSafeInteger(c.staffPlanning.startsAt)&&at>=c.staffPlanning.startsAt;}
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
 const hash=typeof body.token==='string'?createHash('sha256').update(body.token).digest('hex'):null;
 if(hash&&[c.authHash,c.webhookHash,c.retentionProofAccess?.tokenHash,...[c.programSupervision?.token,c.retentionNoteAccess?.token].filter(x=>typeof x==='string').map(x=>createHash('sha256').update(x).digest('hex'))].includes(hash))throw Error('OWN_SEPARATE_PROGRAM_ACCESS_REQUIRED');
 const candidate=validated(body,c.company),test={...c,mariaProgram:candidate};
 const status=await request(test,'/status',{},fetcher);
 const priceVersionVerified=status.configuredPriceScheduleHash!==undefined?status.configuredPriceScheduleHash===BUSINESS_PRICE_HASH&&status.legacyPriceScheduleHash===LEGACY_BUSINESS_PRICE_HASH&&status.priceScheduleEffectiveAt===BUSINESS_PRICE_CUTOVER_AT&&status.priceScheduleHash===businessPriceHashAt(Date.now()):status.priceScheduleHash===BUSINESS_PRICE_HASH&&status.priceScheduleHash===businessPriceHashAt(Date.now());
 if(!ownScope(test,status)||status.username!=='maria.angel.bot'||status.enabled!==true||status.businessWritesEnabled!==true||status.registrationKind!=='new-service-pending-scheduling'||!priceVersionVerified||Date.parse(status.startsAt)!==candidate.startsAt||Date.parse(status.expiresAt)!==candidate.expiresAt)throw Error('PROGRAM_SCOPE_NOT_VERIFIED');
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
 const clientRequestedSchedule={configured:own&&c.clientRequestedSchedule?.enabled===true,enabled:programEnabled(c)&&clientRequestedScheduleEnabled(c,Date.now()),guard:own?MARIA_CLIENT_SCHEDULE_GUARD:null,startsAt:own&&Number.isSafeInteger(c.clientRequestedSchedule?.startsAt)?iso(c.clientRequestedSchedule.startsAt):null,expiresAt:own&&Number.isSafeInteger(c.mariaProgram?.expiresAt)?iso(c.mariaProgram.expiresAt):null,technicianAssignment:false};
 return {guard:own?MARIA_PROGRAM_GUARD:null,pipelineGuard:own?MARIA_PROGRAM_PIPELINE_GUARD:null,formBatchGuard:own?MARIA_PROGRAM_FORM_BATCH_GUARD:null,literalFieldsGuard:own?MARIA_PROGRAM_LITERAL_FIELDS_GUARD:null,acceptanceTimingGuard:own?MARIA_PROGRAM_TIMED_ACCEPTANCE_GUARD:null,requestedTimingGuard:own?MARIA_PROGRAM_REQUESTED_TIMING_GUARD:null,petPresenceGuard:own?MARIA_PROGRAM_PET_PRESENCE_GUARD:null,schedulingReviewGuard:own?MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD:null,operationalCoverage:operationalCoverage(c),configured:own&&c.mariaProgram?.enabled===true,enabled:programEnabled(c),company:own?'FUMIGACION':'S.TECNICO',tenantId:own&&c.mariaProgram?.enabled?MARIA_TENANT:null,companyId:own&&c.mariaProgram?.enabled?MARIA_COMPANY:null,advisorMembershipId:own?c.mariaProgram?.actorId||null:null,registrationKind:own?'new-service-pending-scheduling':null,prepared:states.PENDING,states,saved:states.SAVED,uncertain:states.UNCERTAIN+states.SENDING,review:states.REVIEW,lastReviewReason:reviewed.length?safeReason(reviewed[0].reason):null,reviewReasons:[...reasons].sort(([a],[b])=>a.localeCompare(b)).map(([reason,count])=>({reason,count})),scheduled:false,clientRequestedSchedule,paymentsEnabled:false,fullyAutonomous:false};
}
// Only an affirmative from the customer is authority to create an ordinary,
// unscheduled order. Courtesy, a preference or a quoted third-party "yes" alone
// cannot become acceptance. The backend independently applies this same grammar.
export function acceptsOrdinaryQuotation(text){
 if(typeof text!=='string'||text.length>500||/[?¿]|https?:/i.test(text))return false;
 const t=normalize(text).replace(/\bporfavor\b/g,'por favor').replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim();
 const labels=[...text.matchAll(fieldLabels())];
 if(labels.some(hit=>/^\s*(?:(?:yo\s+)?soy\b|horario\s*:)/iu.test(hit[0])))return false;
 const prefix=(labels.length?text.slice(0,labels[0].index):text).trim().replace(/[.!¡,;]+$/g,'').trim();
 const temporalPrefix=normalize(prefix).replace(/\bporfavor\b/g,'por favor').replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim();
 // A date alone is a preference, not consent. Only an accented or punctuated
 // affirmative followed by a complete literal preference extends the grammar;
 // unpunctuated "Si mañana..." keeps its conditional/ambiguous meaning.
 const literalTimedYes=/^(?:sí(?=[\s,.!;])|si\s*[,.;!])/iu.test(prefix)&&/^si(?: para)? (?:hoy|manana|pasado manana|(?:el )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))(?: (?:(?:en|por) la (?:manana|tarde|noche)|a las? \d{1,2}(?::\d{2})?(?: am| pm)?))?(?: (?:por favor|gracias|muchas gracias))*$/.test(temporalPrefix);
 if(/\b(?:no|pero|siempre|depende|cuando|quizas|tal vez|puede|podria|si se|si hay|si tiene|si es|si queda|si pueden|refuerzo|garantia|verificacion|revisita|anterior|pague|pago|pagar|transferencia|comprobante|consignacion|descuento|gratis|cancelar|cancela|otro|otra|edificio|apartamentos|casas|colchones|metros|cucarachas|hormigas|roedores|chinches|comejen)\b/.test(t)||!literalTimedYes&&/\bsi manana\b/.test(t))return false;
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
 return literalTimedYes||/^(?:si|listo|dale|acepto|de acuerdo|confirmo|correcto|esta bien|perfecto|si esta bien|si confirmo|si acepto|todo correcto|si todo correcto|si correcto|listo esta bien|ok|okay)(?: (?:agendame|programame|reservame|agenda el servicio|programa el servicio|quiero el servicio)(?: para)?(?: (?:hoy|manana|pasado manana|el lunes|el martes|el miercoles|el jueves|el viernes|el sabado|el domingo))?(?: (?:en la manana|en la tarde|en la noche|a las? \d{1,2}(?::\d{2})?(?: am| pm)?))?)?(?: (?:por favor|gracias|muchas gracias))*$/.test(t);
}
// Price-stage only. These whole-message statements accept the exact current
// own quote; they do not confirm later names, addresses or requested times.
// Keep them separate from the backend's ordinary/final acceptance grammar.
export function acceptsExplicitOrdinaryQuotation(text){
 if(typeof text!=='string'||text.length>200||/[?¿"“”«»<>]|https?:|www\./i.test(text))return false;
 const raw=text.trim();
 if(/^si\b/iu.test(raw)&&!/^(?:sí(?=[\s,.!;])|si\s*[,.;!])/iu.test(raw))return false;
 const t=normalize(raw).replace(/\bporfavor\b/g,'por favor').replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim();
 return /^(?:si )?acepto (?:(?:esa|esta|la) cotizacion|el servicio)(?: (?:por favor|gracias|muchas gracias))*$/.test(t);
}
// Only the engine's independently verified own delivered quotation may supply
// the expected amount. This opens data collection, never summary confirmation.
function ownQuotationAmountHeader(text){
 const amount='([1-9]\\d{0,2}(?:\\.\\d{3})+|[1-9]\\d{3,7})';
 const match=text.trim().match(new RegExp('^(?:(?:sí|si)[, ]+)?acepto (?:(?:la|esta) cotizaci[oó]n de |el (?:valor|precio)(?: de)? |los? )?(?:\\$\\s*'+amount+'(?:\\s*cop)?|'+amount+'\\s+cop)(?:[.!](?:\\s+|$)|$)([\\s\\S]*)$','iu'));
 return match?{amount:Number((match[1]||match[2]).replace(/\./g,'')),tail:match[3]}:null;
}
const withoutFieldJoiners=text=>text.replace(/^(?:[\s.!;,]+|y\b)+/iu,'').trim();
export function quotationAmountAffirmation(text,at=Date.now()){
 if(typeof text!=='string'||text.length>1200||/[?¿"“”]|https?:/i.test(text))return null;
 const t=normalize(text).trim(),amount='([1-9]\\d{0,2}(?:\\.\\d{3})+|[1-9]\\d{3,7})';
 const match=t.match(new RegExp('^(?:(?:si[, ]+)?(?:deseo|quiero) continuar con (?:la|esta) cotizacion|(?:si[, ]+)?acepto (?:la|esta) cotizacion) de (?:\\$\\s*'+amount+'(?:\\s*cop)?|'+amount+'\\s+cop)[.!]?$'));
 if(match)return Number((match[1]||match[2]).replace(/\./g,''));
 // A closed own-price affirmation may carry literal facts in the same turn.
 // It opens intake only: the delivered current quote still supplies the amount,
 // and a new delivered summary and later confirmation remain mandatory.
 const header=ownQuotationAmountHeader(text);if(!header)return null;
 if(!header.tail.trim())return header.amount;
 // Inspect the original tail before projecting address/name spans. An address
 // parser can retain a comma suffix; it must not hide a later refusal, condition,
 // third-party claim or changed price inside an otherwise valid street address.
 if(/\b(?:no|pero|si|solo|solamente|siempre|depende|cuando|quizas|tal vez|podria|puede|gratis|garantia|refuerzo|descuento|pago|pagar|transferencia|comprobante|cancelar|cancela|dijo|dice|segun|tercero|vecin[oa]|asesor[ae]?|otro|otra|precio|valor|cuesta|costaria|cobren|cobrar|cobro|pesos|cop|usd)\b|\$\s*\d/.test(normalize(header.tail)))return null;
 const fields=explicitFields(header.tail);if(fields.conflict)return null;
 const remainder=withoutFieldJoiners(literalIntakeTextWithoutRegistrationFields(header.tail));
 if(!remainder)return fields.name||fields.address?header.amount:null;
 return literalProgramPreference(remainder,at)!==null?header.amount:null;
}
export function acceptsOwnQuotedAmount(text,priceCop,at=Date.now()){
 return Number.isSafeInteger(priceCop)&&priceCop>0&&priceCop<=10000000&&quotationAmountAffirmation(text,at)===priceCop;
}
export const MARIA_SUMMARY_DATA_CONFIRMATION_GUARD='own-delivered-summary-data-confirmation-v1';
// Data agreement is scoped to a delivered current summary. It is deliberately
// separate from price acceptance, and never admits extra test/price/date text.
export function confirmsOrdinarySummaryData(text){
 if(typeof text!=='string'||text.length>200||/[?¿]|https?:/i.test(text))return false;
 const raw=text.trim(),affirmative=raw.match(/^(?:sí(?=[\s,.!;])|si\s*[,.;!])[\s,.!;]*/iu);
 const t=normalize(affirmative?raw.slice(affirmative[0].length):raw).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim();
 return /^(?:confirmo que )?(?:(?:todos )?(?:los|mis)) datos (?:son correctos|estan correctos|estan bien)(?: (?:gracias|muchas gracias|por favor))*$/.test(t);
}
const confirms=text=>acceptsOrdinaryQuotation(text)||confirmsOrdinarySummaryData(text);
function legacyOrdinarySummaryText(preview){
 return 'Registraré el servicio de '+preview.service+' por $'+preview.priceCop.toLocaleString('es-CO')+' en '+preview.address+', '+preview.municipality+', a nombre de '+preview.customerName+'.'+(preview.preference?' Preferencia solicitada: '+preview.preference+'. El horario sigue pendiente de coordinación.':'')+(preview.petPresence?' Presencia de mascotas informada: '+preview.petPresence+'.':'')+' ¿Confirmas que estos datos son correctos?';
}
function previousOrdinarySummaryText(preview){
 return ['Revisa los datos de tu solicitud:','','• Servicio: '+preview.service,'• Valor: $'+preview.priceCop.toLocaleString('es-CO'),'• Nombre: '+preview.customerName,'• Dirección: '+preview.address,'• Municipio: '+preview.municipality,...(preview.preference?['• Preferencia solicitada: '+preview.preference]:[]),...(preview.petPresence?['• Mascotas informadas: '+preview.petPresence]:[]),'','El horario sigue pendiente de coordinación.','','¿Confirmas que estos datos son correctos?'].join('\n');
}
function ordinarySummaryText(preview){
 return ['Revisa los datos de tu solicitud:','','• Servicio: '+preview.service,...(preview.site?['• Inmueble informado: '+preview.site]:[]),...(preview.mattresses?['• Colchones informados: '+preview.mattresses]:[]),...(preview.rooms?['• Habitaciones informadas: '+preview.rooms]:[]),...(preview.area?['• Área informada: '+preview.area]:[]),'• Valor: $'+preview.priceCop.toLocaleString('es-CO'),'• Nombre: '+preview.customerName,'• Dirección: '+preview.address,'• Municipio: '+preview.municipality,...(preview.preference?[(preview.clientSchedule?'• Horario solicitado: ':'• Preferencia solicitada: ')+preview.preference]:[]),...(preview.petPresence?['• Mascotas informadas: '+preview.petPresence]:[]),'',preview.clientSchedule?'Registraré el servicio en este horario, sin técnico asignado.':'El horario sigue pendiente de coordinación.','','¿Confirmas que estos datos son correctos?'].join('\n');
}
function ownSummarySourceProjection(s,state,e,anchor,original,ref,field,value,literalSlots){
 const direct=source=>source?.kind==='text'&&source.fromMe===false&&!source.forwarded&&!source.quotedId&&source.phone===e.phone&&source.line===e.line&&source.at>=anchor.at&&source.at<=e.at&&!/["“”]|\b(?:dijo|dice|comento|comentaron|segun|mi vecin[oa]|su vecin[oa]|un tercero)\b/.test(normalize(source.text));
 if(!direct(original))return false;
 if(literalSlots(original.text,'fumigacion')?.[field]===value)return true;
 // Reuse the existing two-source room-unit clarification literally. A unit
 // reply alone is not a room count and cannot become a general fallback.
 if(field!=='rooms'||ref?.guard!==MARIA_BATCH_INTAKE_GUARD||ref.context!=='own-delivered-unit-clarification-two-native-fragments'||ref.unitExpanded!==false||!Array.isArray(ref.sources)||ref.sources.length!==2||ref.sources[1].sourceId!==original.id||ref.sources[1].at!==original.at)return false;
 const firstRef=ref.sources[0],firstRow=s.db.prepare('SELECT rowid,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(firstRef.sourceId,e.phone,e.line),first=firstRow&&s.open(firstRow.body);
 if(!direct(first)||first.at!==firstRef.at||firstRow.rowid<anchor.rowid||first.at>=original.at||original.at-first.at>600000)return false;
 const prompt=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND internal=0 AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(first.id+':reply',e.phone,e.line,state.caseId),proof=prompt&&get(s,'first-delivery:'+prompt.id);
 if(!prompt||s.open(prompt.body)!=='¿Te refieres a habitaciones o a metros cuadrados?'||proof?.mid!==prompt.mid||proof.line!==e.line||!['DELIVERED','READ'].includes(proof.state)||!Number.isSafeInteger(proof.verifiedAt)||proof.verifiedAt<prompt.created||original.at<Math.floor(proof.verifiedAt/1000)*1000)return false;
 return literalSlots(first.text+' '+original.text,'fumigacion')?.rooms===value;
}
function ownSummaryScope(s,state,e,own,literalSlots){
 if(typeof literalSlots!=='function')return null;
 const anchor=s.db.prepare('SELECT rowid,at,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(state.caseId.slice(11),e.phone,e.line),scope={};if(!anchor)return null;
 const reference=s.priceReplyReference(own.row),snapshot=reference?.context,originalAnchor=s.open(anchor.body),scopeFields=['site','mattresses','rooms','area'];
 if(!snapshot||reference.entryId!==own.entry.id||reference.priceCop!==own.entry.priceCop)return null;
 // An explicit new-case anchor is already quoted from its own immutable
 // snapshot, but the existing Engine does not persist intakeSources when
 // that first message says "otro servicio nuevo". Recover only that complete
 // own anchor; never fill a partially missing or invalid field reference.
 const anchorRecovery=!scopeFields.some(field=>Object.hasOwn(state.intakeSources||{},field))&&own.q.sourceId===originalAnchor.id&&originalAnchor.id===state.caseId.slice(11)&&originalAnchor.phone===e.phone&&originalAnchor.line===e.line&&originalAnchor.kind==='text'&&originalAnchor.fromMe===false&&!originalAnchor.forwarded&&!originalAnchor.quotedId&&originalAnchor.at===own.q.issuedAt&&originalAnchor.at<=e.at&&!/["“”]|\b(?:dijo|dice|segun|mi vecin[oa]|un tercero)\b/.test(normalize(originalAnchor.text))&&explicitNewService(originalAnchor.text)&&!afterServiceRequest(originalAnchor);
 for(const field of ['site','mattresses','rooms','area']){
  if(state.slots[field]==null)continue;
  const value=String(state.slots[field]),ref=state.intakeSources?.[field],row=ref?.sourceId&&s.db.prepare('SELECT rowid,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(ref.sourceId,e.phone,e.line),original=row&&s.open(row.body);
  // Use the Engine's existing literal projection and the exact value used by
  // this own quotation. Never infer a missing field or transform its spelling.
  if(!value||value.length>250||String(snapshot[field])!==value||own.q.slots&&String(own.q.slots[field])!==value)return null;
  if(!ref&&anchorRecovery){if(!ownSummarySourceProjection(s,state,e,anchor,originalAnchor,null,field,value,literalSlots))return null;}
  else if(!original||original.id!==ref?.sourceId||original.phone!==e.phone||original.line!==e.line||original.kind!=='text'||original.fromMe!==false||original.forwarded||original.quotedId||original.at!==ref.at||row.rowid<anchor.rowid||original.at<anchor.at||original.at>e.at||!ownSummarySourceProjection(s,state,e,anchor,original,ref,field,value,literalSlots))return null;
  scope[field]=value;
 }
 return scope;
}
function ownSummaryDataProof(s,state,e,prompt,preview){
 if(!prompt||e.quotedId||e.forwarded||e.fromMe||e.kind!=='text'||prompt.phone!==e.phone||prompt.line!==e.line||prompt.case_id!==state.caseId||prompt.internal!==0||!['DELIVERED','READ'].includes(prompt.state)||typeof prompt.mid!=='string'||prompt.mid===state.quotedPrice?.mid||![ordinarySummaryText(preview),previousOrdinarySummaryText(preview),legacyOrdinarySummaryText(preview)].includes(s.open(prompt.body)))return null;
 const proof=get(s,'first-delivery:'+prompt.id),promptSourceId=prompt.id?.endsWith(':reply')?prompt.id.slice(0,-6):null;
 const origin=promptSourceId&&s.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(promptSourceId,e.phone,e.line),current=s.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line);
 if(!origin||!current||origin.rowid>=current.rowid||origin.at>e.at||proof?.mid!==prompt.mid||proof.line!==e.line||!['DELIVERED','READ'].includes(proof.state)||!Number.isSafeInteger(proof.verifiedAt)||proof.verifiedAt<prompt.created||proof.verifiedAt>Date.now()+5000||e.at<Math.floor(proof.verifiedAt/1000)*1000)return null;
 const text=s.open(prompt.body);
 return {guard:MARIA_SUMMARY_DATA_CONFIRMATION_GUARD,caseId:state.caseId,phone:e.phone,line:e.line,mid:prompt.mid,text,textSha256:createHash('sha256').update(text).digest('hex'),deliveredAt:iso(proof.verifiedAt),state:proof.state};
}
const fieldLabels=()=>/(?:^|(?<=[.;\n]))\s*(?:yo\s+)?soy(?=\s+\p{L})\s+|\bhorario\s*:\s*|(?:\b(?:mi nombre(?: completo)?(?: es)?|nombre completo|nombre(?=\s*:)|me llamo|a nombre de)|\b(?:(?:mi|la) direcci[oó]n(?: completa)?(?: es)?|direcci[oó]n(?: completa)?))\s*[: ,]*\s*/giu;
const fieldValue=(text,hits,i)=>text.slice(hits[i].index+hits[i][0].length,hits[i+1]?.index??text.length).trim().replace(/(?:\s+y)?[\s,;.!]*$/u,'').trim();
function explicitFields(text){
 const hits=[...text.matchAll(fieldLabels())],fields={};
 for(let i=0;i<hits.length;i++){
  if(/^\s*horario\s*:/iu.test(hits[i][0]))continue;
  const hit=hits[i],key=/direcci[oó]n/i.test(hit[0])?'address':'name';
  if(key==='name'&&relayedNameSource(text.slice(0,hit.index)))continue;
  let value=fieldValue(text,hits,i);
  // A sentence after an explicitly labelled fact is not part of that fact.
  value=value.split(/[;\n]|\.\s+(?=[¿¡\p{L}])/u)[0].trim();
  if(/^\s*(?:yo\s+)?soy\b/iu.test(hit[0])&&/^(?:de|del|el|la|un|una)\b|\b(?:segun|tercero|vecin[oa])\b/.test(normalize(value)))continue;
  const parsed=key==='name'?literalName(value,true):literalAddress(value,true);
  if(parsed){if(fields[key]&&fields[key]!==parsed){fields.conflict=true;fields.conflictFields=[...new Set([...(fields.conflictFields||[]),key])];}fields[key]=parsed;}
 }
 return fields;
}
export function literalIntakeTextWithoutRegistrationFields(text){
 if(typeof text!=='string')return text;
 const hits=[...text.matchAll(fieldLabels())],spans=[];
 for(let i=0;i<hits.length;i++){
  const hit=hits[i],start=hit.index+hit[0].length,end=hits[i+1]?.index??text.length,key=/direcci[oó]n/i.test(hit[0])?'address':'name';
  if(/^\s*horario\s*:/iu.test(hit[0]))continue;
  const segment=text.slice(start,end),folded=segment.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const sentence=segment.search(/[;\n]|\.\s+(?=[¿¡\p{L}])/u);
  const semantic=key==='address'?folded.search(/\b(?:pero|ademas|tambien|para|quiero|necesito|fumigar|tratar|refuerzo|garantia|verificacion|inspeccion|todo|toda|entero|entera|zonas? comunes?|sigue|siguen|continua|ya fumig|otra|otro)\b|\ben\s+(?!(?:(?:el|la|un|una)\s+)?(?:barrio|sector|edificio|unidad|conjunto|urbanizacion|apartamento|apto|interior|porteria|torre)\b)/):-1;
  const boundaries=[sentence,semantic].filter(x=>x>=0),boundary=boundaries.length?Math.min(...boundaries):segment.length;
  const value=segment.slice(0,boundary).trim().replace(/(?:\s+y)?[\s,;.!]*$/u,'').trim();
  if(/^\s*(?:yo\s+)?soy\b/iu.test(hit[0])&&/^(?:de|del|el|la|un|una)\b|\b(?:segun|tercero|vecin[oa])\b/.test(normalize(value)))continue;
  if(!(key==='name'?literalName(value,true):literalAddress(value,true)))continue;
  const valueAt=segment.indexOf(value);spans.push([hit.index,start+valueAt+value.length]);
 }
 let result=text;for(const [start,end] of spans.reverse())result=result.slice(0,start)+' '+result.slice(end);
 return result.replace(/\s+/g,' ').trim();
}
const calendarWeekdays=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const calendarMonths=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const calendarDay='(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)';
const calendarDate='(?:el\\s+)?(?:'+calendarDay+'\\s+)?(?:\\d{1,2}\\s+de\\s+[\\p{L}]+(?:\\s+(?:de|del)\\s+\\d{4})?|\\d{1,2}/\\d{1,2}(?:/\\d{4})?)';
const calendarTime='(?:\\s+(?:a las?\\s+\\d{1,2}(?::\\d{2})?(?:\\s*[ap]\\.?\\s*m\\.?)?|(?:en|por) la (?:mañana|manana|tarde|noche)))?';
const calendarWhole=new RegExp('^(?:(?:me equivoqu[eé]|corrijo)[, ]+)?(?:(?:para|prefiero|preferir[ií]a|quiero|quisiera|lo necesito|lo quiero|ser[ií]a|puede ser|me queda bien|me sirve)\\s+)?('+calendarDate+calendarTime+')(?:[,;.!]?\\s+(?:por favor|gracias|muchas gracias))*[.!]?$','iu');
function timingProjection(text){
 const projected=literalIntakeTextWithoutRegistrationFields(text).trim(),header=ownQuotationAmountHeader(projected);
 return withoutFieldJoiners(header?header.tail:projected).replace(/^horario\s*:\s*/iu,'');
}
function calendarPreference(raw,at){
 const match=raw.match(calendarWhole);if(!match)return null;
 const value=match[1].trim().replace(/(?<![ap]\.\s?m)[.!]+$/i,'');
 const folded=normalize(value).replace(/\b([ap])\.\s*m\.?/g,'$1m');
 const parts=folded.match(/^(?:el )?(?:(domingo|lunes|martes|miercoles|jueves|viernes|sabado) )?(?:(\d{1,2}) de ([a-z]+)(?: (?:de|del) (\d{4}))?|(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?)(.*)$/);
 if(!parts||!Number.isSafeInteger(at)||at<=0)return {issue:'invalid-date'};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 const year=Number(parts[4]||parts[7]||today.slice(0,4)),month=parts[3]?calendarMonths.indexOf(parts[3])+1:Number(parts[6]),day=Number(parts[2]||parts[5]);
 const date=new Date(Date.UTC(year,month-1,day));
 if(year<2000||year>2099||month<1||month>12||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return {issue:'invalid-date'};
 if(parts[1]&&calendarWeekdays[date.getUTCDay()]!==parts[1])return {issue:'weekday-mismatch'};
 const requested=date.toISOString().slice(0,10);if(requested<today)return {issue:'past-date'};
 const clock=parts[8]?.trim().match(/^a las? (\d{1,2})(?::(\d{2}))?(?:\s*([ap])m\.?)?$/);
 if(clock){
  const hour=Number(clock[1]),minute=Number(clock[2]||0),meridiem=clock[3];
  if(minute>59||meridiem&&(hour<1||hour>12)||!meridiem&&hour>23)return {issue:'invalid-time'};
  const localHour=meridiem?(hour%12+(meridiem==='p'?12:0)):hour;
  if(requested===today&&Date.UTC(year,month-1,day,localHour+5,minute)<at)return {issue:'past-date'};
 }
 return {value};
}
export function calendarProgramPreferenceIssue(text,at=Date.now()){
 if(typeof text!=='string'||text.length>8000||/[?¿"“”«»<>]|https?:|www\./i.test(text))return null;
 return calendarPreference(timingProjection(text),at)?.issue??null;
}
export function literalProgramPreference(text,at=Date.now()){
 if(typeof text!=='string')return null;
 const raw=timingProjection(text),calendar=calendarPreference(raw,at);
 if(calendar)return calendar.issue?null:calendar.value;
 if(/^(?:en|por) la (?:mañana|manana|tarde|noche)[.! ]*$/i.test(raw))return raw.replace(/[.! ]+$/g,'');
 const folded=normalize(raw).replace(/\bporfavor\b/g,'por favor').replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim();
 const standalone=/^(?:(?:me equivoque|corrijo) )?(?:(?:para|el|prefiero|preferiria|quiero|quisiera|lo necesito|lo quiero|seria|puede ser|me queda bien|me sirve) )?(?:hoy|manana|pasado manana|(?:el )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))(?: (?:(?:en|por) la (?:manana|tarde|noche)|a las? \d{1,2}(?::\d{2})?(?: a ?m| p ?m)?))?(?: (?:por favor|gracias|muchas gracias))*$/.test(folded);
 if(!standalone&&!acceptsOrdinaryQuotation(raw))return null;
 // Keep punctuation in a. m./p. m. as literal source text, rather than cutting
 // a time at the first abbreviation dot. Full grammar above rejects extra prose.
 const value=raw.match(/\b(?:hoy|pasado mañana|pasado manana|mañana|manana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b[\s\S]*/i)?.[0]?.trim().replace(/[, ]+$/g,'').replace(/(?<![ap]\.\s?m)[.!]+$/i,'');
 return value&&value.length<=300?value:null;
}
function literalName(text,prompted){
 const explicit=text.match(/^(?:mi nombre (?:es|completo es)|me llamo|a nombre de|nombre completo|(?:yo )?soy)\s*[: ,]*\s+(.+)$/i);
 const name=(explicit?.[1]||(prompted?text:'' )).trim().replace(/[.!]+$/,'').trim();
 if(/^(?:en|por) la (?:manana|tarde|noche)$/.test(normalize(name)))return null;
 if(/[\r\n]/.test(name)||/^(?:yo )?soy\b/i.test(text)&&/^(?:de|del|el|la|un|una)\b/.test(normalize(name))||registrationPreface.test(normalize(name))||relayedNameSource(name)||! /^[\p{L}][\p{L}'’-]*(?:[^\S\r\n]+[\p{L}][\p{L}'’-]*){1,9}$/u.test(name)||/\b(?:quiero|necesito|gracias|servicio|manana|hoy|cucarachas|refuerzo|garantia|no|si|nombre|descuento|gratis|dijo|dice|anonimo|cliente|empresa)\b/.test(normalize(name)))return null;return name;
}
const relayedNameSource=text=>/(?:\b(?:el|la|mi|su)\s+(?:tecnic[oa]|asesor[ae]?|vecin[oa])\b|\b(?:un tercero|otra persona|me dijo|me dice)\b)/.test(normalize(text));
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
const directNameCorrection=text=>/^(?:corrijo|rectifico)\s+(?:(?:mi|el)\s+)?nombre(?: completo)?\s*:\s*[\p{L}'’ -]{1,160}[.! ]*$/iu.test(text.trim());
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
 if(/\b(?:todo|toda|entero|entera|completo|completa)\s+(?:(?:el|la|un|una)\s+)?(?:edificio|unidad|conjunto|torre|casa|finca)|\b(?:zonas? comunes?|parqueaderos?|shute?|bodegas?|locales?|restaurante|cafeteria|patio|varias propiedades)\b/.test(t))return true;
 // A singular floor/interior label belongs to the address. An explicit request
 // to treat floors or a multi-floor scope still needs its own quotation review.
 if(/\b(?:todos? (?:los )?|varios |dos |tres |cuatro |\d+ )pisos\b|\b(?:fumigar|tratar|servicio para|fumigacion de)\b[^.!?;]{0,45}\bpisos?\b/.test(t))return true;
 if(/\b(?:dos|tres|cuatro|cinco|seis)\s+(?:casas?|apartamentos?|locales?|torres?)\b/.test(t))return true;
 const units=t.match(/\b(?:para|son|necesito|tratar|fumigar|fumigacion de|servicio para)\s+(?:(?:los|las)\s+)?(\d+)\s+(?:casas?|apartamentos?|aptos?|locales?|torres?)\b/);if(units&&Number(units[1])>1)return true;
 const inPlace=t.match(/\ben\s+([\p{L}][\p{L}\s'-]*)/u)?.[1]?.trim();
 if(inPlace&&!inPlace.startsWith(city)&&! /^(?:el |la |los |las )?(?:barrio|conjunto|unidad|edificio|apartamento|apto|interior|portería|porteria|urbanizacion|torre)\b/.test(inPlace)&&!normalize(slots.locationDetails||'').includes(inPlace))return true;
 if(/\b(?:cucarachas|roedores|ratas|ratones|chinches|comejen|avispas|hormigas|metros cuadrados|m2|mts2|habitaciones?|colchones?)\b/.test(t))return true;
 return false;
}
const source=e=>({id:e.id,text:e.text,at:iso(e.at)});
function confirmedPetMention(event){
 const mention=mariaIncidentalPetMention(event);
 // The new registration contract is narrower than the historical intake
 // classifier. An unpunctuated safety/return question is never a presence-only
 // observation that can be written into an ordinary new order.
 return mention&&!/\b(?:protej\w*|volver\w*|regres\w*)\b|,\s*(?:como|cuando|donde|que|por que)\b/.test(normalize(event.text))?mention:null;
}
function exactLiteralFieldSource(event,facts){
 const raw=event.text.trim().replace(/[.!]+$/,'').trim();
 // Only a complete, already parsed standalone fact may have an animal word
 // in its surname or building name. Presence and mixed safety clauses are
 // never names or address-only exemptions.
 if(/\b(?:hay|tengo|tenemos|me equivoque|corrijo|correccion|rectifico)\b|[?¿]/.test(normalize(raw)))return false;
 return facts.some(fact=>fact.source?.id===event.id&&fact.source.text===event.text&&Date.parse(fact.source.at)===event.at&&typeof fact.value==='string'&&raw===fact.value.trim().replace(/[.!]+$/,'').trim()&&(fact.kind==='name'?literalName(raw,true):literalAddress(raw,true))===fact.value);
}
function incompatiblePetContinuation(event,mention,facts){
 if(event.kind!=='text'||typeof event.text!=='string')return false;
 const raw=normalize(event.text);
 if(!mention&&/\b(?:hay|tengo|tenemos)\s+(?:(?:una?|dos|tres|cuatro|cinco|varias?|algunas?|\d{1,2})\s+)?(?:mascotas?|perros?|gatos?|animales?)\b/.test(raw))return true;
 // Inspect an action about the animals before any address/name exemption:
 // the address parser may accept a trailing unpunctuated safety request.
 if(/\b(?:las|los|les|ellas|ellos)\s+(?:(?:las|los|les)\s+)?(?:pued\w*|deb\w*|dej\w*|qued\w*|sac\w*|llev\w*|manten\w*|retir\w*)\b|\b(?:pued\w*|deb\w*|dej\w*|retir\w*)(?:las|los)\b/.test(raw))return true;
 if(exactLiteralFieldSource(event,facts))return false;
 const text=normalize(literalIntakeTextWithoutRegistrationFields(event.text)),fields=explicitFields(event.text);
 // A bounded name correction without an animal reference does not correct a
 // prior pet observation. An invalid name still needs its own clarification.
 if(directNameCorrection(event.text)&&!/\b(?:mascotas?|perros?|gatos?|animales?|ellas|ellos)\b/.test(raw))return false;
 const correction=/\b(?:me equivoque|corrijo|correccion|rectifico|en realidad|no (?:son|eran?))\b/.test(text)&&!fields.name&&!fields.address;
 const petReference=/\b(?:mascotas?|perros?|gatos?|animales?)\b|\b(?:las|los|les|ellas|ellos)\s+(?:(?:las|los|les)\s+)?(?:pued\w*|deb\w*|dej\w*|qued\w*|sac\w*|llev\w*|manten\w*|retir\w*)\b|\b(?:pued\w*|deb\w*|dej\w*|retir\w*)(?:las|los)\b/.test(text);
 // A later denied, corrected or safety-related observation is not permission
 // to silently reuse the earlier affirmative. Preserve it for review instead
 // of inferring a new number, animal, precaution or absence of animals.
 return correction||petReference&&!mention;
}
function casePetPresence(s,c,state,e,literalFacts=[]){
 const notes=state.receptionNotes?.incidentalPets??[];
 if(!Array.isArray(notes))throw Error('PROGRAM_PET_SOURCE_UNVERIFIED');
 const firstId=state.caseId?.startsWith(c.company+':')?state.caseId.slice(c.company.length+1):null;
 const first=firstId&&s.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(firstId,e.phone,e.line);
 const current=s.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line);
 if(!first||!current){if(notes.length)throw Error('PROGRAM_PET_SOURCE_UNVERIFIED');return null;}
 let latest=null;
 for(const reference of notes){
  const row=reference?.sourceId&&s.db.prepare('SELECT rowid,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(reference.sourceId,e.phone,e.line);
  if(!row||row.rowid<first.rowid||row.rowid>current.rowid)throw Error('PROGRAM_PET_SOURCE_UNVERIFIED');
  const native=s.open(row.body),mention=confirmedPetMention(native);
  if(!mention||native.id!==reference.sourceId||native.phone!==e.phone||native.line!==e.line||native.at!==reference.at||native.at<Math.max(first.at,c.mariaProgram.startsAt)||native.at>e.at||mention.guard!==reference.guard||mention.text!==reference.text||mention.text.length>100)throw Error('PROGRAM_PET_SOURCE_UNVERIFIED');
  if(!latest||row.rowid>latest.position)latest={value:mention.text,source:source(native),position:row.rowid};
 }
 // Earlier sources in a rapid facts batch may be superseded before the
 // conversational turn can retain its note. Read their original encrypted
 // events within this exact case window, never import another case or line.
 const rows=s.db.prepare('SELECT rowid,id,at,body FROM events WHERE phone=? AND line=? AND from_me=0 AND rowid>=? AND rowid<=? AND at>=? AND at<=? ORDER BY rowid').all(e.phone,e.line,first.rowid,current.rowid,Math.max(first.at,c.mariaProgram.startsAt),e.at);
 const knownFields=[{kind:'name',value:state.programIntake?.customerName,source:state.programIntake?.nameSource},{kind:'address',value:state.programIntake?.address,source:state.programIntake?.addressSource},...literalFacts];
 let chronological=null;
 for(const row of rows){
  const native=s.open(row.body),mention=confirmedPetMention(native);
  if(native.id!==row.id||native.at!==row.at||native.phone!==e.phone||native.line!==e.line)continue;
  if(chronological&&incompatiblePetContinuation(native,mention,knownFields))throw Error('PROGRAM_PET_SOURCE_CONTRADICTED');
  if(!mention||mention.text.length>100)continue;
  chronological={value:mention.text,source:source(native),position:row.rowid};
  if(!latest||row.rowid>latest.position)latest={value:mention.text,source:source(native),position:row.rowid};
 }
 return latest;
}
function casePreferenceSource(s,c,state,e){
 const value=state.slots.preference,reference=state.intakeSources?.preference;
 if(typeof value!=='string'||!value.trim()||value.length>300||/[\r\n]/.test(value)||!reference?.sourceId)return null;
 const firstId=state.caseId?.startsWith(c.company+':')?state.caseId.slice(c.company.length+1):state.quotedPrice?.sourceId;
 const first=firstId&&s.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(firstId,e.phone,e.line);
 const current=s.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line);
 const row=s.db.prepare('SELECT rowid,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(reference.sourceId,e.phone,e.line);
 if(!first||!current||!row||row.rowid<first.rowid||row.rowid>current.rowid)return null;
 const native=s.open(row.body);
 if(native.id!==reference.sourceId||native.phone!==e.phone||native.line!==e.line||native.fromMe||native.forwarded||native.kind!=='text'||native.at!==reference.at||native.at<c.mariaProgram.startsAt||native.at<first.at||native.at>e.at||typeof native.text!=='string'||native.text.length>8000||!normalize(native.text).includes(normalize(value)))return null;
 if(calendarProgramPreferenceIssue(value,native.at)||calendarPreference(value,native.at)&&native.quotedId)return null;
 return {value,source:source(native)};
}
function staffPlanningForCase(s,c,state,e){
 if(!staffPlanningEnabled(c,e.at))return null;
 const row=state.caseId?.startsWith('fumigacion:')&&s.db.prepare('SELECT id,at,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(state.caseId.slice(11),e.phone,e.line);
 if(row&&row.at<c.staffPlanning.startsAt)return null;
 const original=row&&s.open(row.body);
 if(!original||original.id!==row.id||original.at!==row.at||original.phone!==e.phone||original.line!==e.line||original.fromMe!==false||original.forwarded||original.quotedId||original.at>e.at)return {invalid:true};
 return {guard:MARIA_STAFF_PLANNING_GUARD,mode:'internal-staff-assignment',startsAt:c.staffPlanning.startsAt,caseId:state.caseId,phone:e.phone,line:e.line,caseSourceId:original.id,caseSourceAt:original.at};
}
function staffPlanningRecord(s,entry){
 const p=entry?.payload,m=entry?.staffPlanning;
 if(!p||!m||m.guard!==MARIA_STAFF_PLANNING_GUARD||m.mode!=='internal-staff-assignment'||!Number.isSafeInteger(m.startsAt)||m.caseId!==p.caseId||m.phone!==p.phone||m.line!==p.line||p.caseId!=='fumigacion:'+m.caseSourceId||m.caseSourceAt<m.startsAt||typeof p.slots?.preference!=='string'||!p.slots.preference||p.slots.preference!==m.requestedTiming||p.sources?.preference?.id!==m.preferenceSourceId||entry.requestHash!==registrationHash(p))return null;
 const row=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(m.caseSourceId,p.phone,p.line),original=row&&s.open(row.body),pref=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(m.preferenceSourceId,p.phone,p.line),native=pref&&s.open(pref.body);
 if(!original||original.id!==m.caseSourceId||original.phone!==p.phone||original.line!==p.line||original.at!==m.caseSourceAt||original.fromMe!==false||original.forwarded||original.quotedId||!native||native.id!==m.preferenceSourceId||native.phone!==p.phone||native.line!==p.line||native.fromMe!==false||native.forwarded||native.kind!=='text'||native.text!==p.sources.preference.text||iso(native.at)!==p.sources.preference.at||native.at<m.caseSourceAt||native.at>Date.parse(p.sources.acceptance.at)||!normalize(native.text).includes(normalize(m.requestedTiming)))return null;
 return m;
}
function staffPlanningSavedText(entry){
 const p=entry.payload;
 if(p.clientSchedule?.guard===MARIA_CLIENT_SCHEDULE_GUARD&&clientRequestedScheduleReceiptMatches(p,entry.receipt))return ['Tu servicio quedó confirmado y programado.','','• Servicio: '+p.slots.service,'• Valor aceptado: $'+p.quote.priceCop.toLocaleString('es-CO'),'• Nombre: '+p.customerName,'• Dirección: '+p.address,'• Municipio: '+p.municipality,'• Horario: '+p.slots.preference,'','El equipo interno se encargará de asignar el técnico y la ruta.'].join('\n');
 return ['Tu solicitud quedó aceptada y registrada.','','• Servicio: '+p.slots.service,'• Valor aceptado: $'+p.quote.priceCop.toLocaleString('es-CO'),'• Nombre: '+p.customerName,'• Dirección: '+p.address,'• Municipio: '+p.municipality,'• Horario solicitado: '+p.slots.preference,'','El equipo interno se encargará de asignar el técnico y la ruta. Este registro conserva el horario solicitado; la disponibilidad se confirma por separado.'].join('\n');
}
export function ownStaffPlanningReceipt(s,c,request){const entry=ownRegisteredReceiptForPresentation(s,c,request);return entry&&staffPlanningRecord(s,entry)?entry:null;}
export function staffPlanningCustomerTurn(s,c,state,e,{status=false}={}){
 if(state.awaitingHumanReview||state.closed||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview||state.requestedProductInquiry||state.requestedProgramCancellationReview||e.kind!=='text'||e.fromMe||e.forwarded||e.quotedId)return null;
 const entry=ownStaffPlanningReceipt(s,c,{phone:e.phone,line:e.line,caseId:state.caseId});if(!entry)return null;
 const nativeRow=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line),native=nativeRow&&s.open(nativeRow.body);if(!native||native.text!==e.text||native.at!==e.at||native.forwarded||native.quotedId||native.kind!=='text')return null;
 const preference=literalProgramPreference(e.text,e.at);
 if(!status&&!preference&&!acceptsOrdinaryQuotation(e.text))return null;
 if(preference&&normalize(preference)!==normalize(entry.payload.slots.preference)){
  const alert=queueOwnSavedServiceReview(s,c,entry,{motive:'scheduling-unconfirmed',sourceId:e.id,text:'María Ángel · cambio de horario solicitado. El contacto terminado en '+e.phone.slice(-4)+' indicó una preferencia distinta para su solicitud registrada. Preferencia original: '+entry.payload.slots.preference+'. Nueva petición literal: '+e.text+'. No modifiqué la orden ni confirmé disponibilidad. ¿Cómo debemos atender este cambio?'});
  if(alert?.queued)state.awaitingHumanReview=true;
  return {state,reply:'Recibí tu nueva preferencia de horario. La solicitud sigue registrada; el cambio y su disponibilidad necesitan revisión del equipo interno.'};
 }
 return {state,reply:staffPlanningSavedText(entry)};
}
function caseLiteralFields(s,c,state,e){
 const firstId=state.caseId?.startsWith(c.company+':')?state.caseId.slice(c.company.length+1):state.quotedPrice?.sourceId;
 const first=firstId&&s.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(firstId,e.phone,e.line);
 const current=s.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line);
 if(!first||!current)return [];
 // A bounded native case window, never another case or a different line.
 const rows=s.db.prepare('SELECT rowid,body FROM events WHERE phone=? AND line=? AND from_me=0 AND rowid>=? AND rowid<=? AND at>=? AND at<=? ORDER BY rowid DESC LIMIT 40').all(e.phone,e.line,first.rowid,current.rowid,Math.max(first.at,c.mariaProgram.startsAt),e.at).reverse();
 return rows.map(row=>({turn:s.open(row.body),position:row.rowid})).filter(({turn})=>turn.kind==='text'&&!turn.forwarded&&turn.phone===e.phone&&turn.line===e.line&&!/\b(?:psicologos|abogados|miguel angel|servicio tecnico|otra solicitud|otro servicio|otro inmueble)\b/.test(normalize(turn.text))).map(({turn,position})=>({...explicitFields(turn.text),source:source(turn),position}));
}
function promptedBatchFields(s,c,previous,e,pi,prompt){
 if(!prompt||!['name','address','correction'].includes(pi.stage)||typeof s.customerTurnBatch!=='function')return [];
 const promptSource=prompt.id?.endsWith(':reply')&&s.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(prompt.id.slice(0,-6),e.phone,e.line);
 if(!promptSource)return [];
 const requested=pi.requestedFields||[pi.stage],batch=s.customerTurnBatch(e.phone,e.id,previous.lastHandledSourceId),facts=[],values={};
 for(const turn of batch){
  const position=s.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(turn.id,e.phone,e.line)?.rowid;
  if(!position||position<=promptSource.rowid)continue;
  if(turn.phone!==e.phone||turn.line!==e.line||turn.fromMe||turn.forwarded||turn.kind!=='text'||turn.at<c.mariaProgram.startsAt)return [];
  if(confirms(turn.text)||mariaIncidentalPetMention(turn)||neutralCourtesy(turn.text)||/^(?:hola|hola buenas noches|buenos dias|buen dia|buenas tardes|buenas noches)[.!¡, ]*$/.test(normalize(turn.text))||/^[¡ ]*(?:hola[,!. ]+)?(?:(?:buenos dias|buen dia|buenas tardes|buenas noches)[,!. ]+)?[¿¡ ]*como esta(?:s|n)?[?!.,! ]*$/.test(normalize(turn.text))||registrationSourcePreface(turn.text)||literalProgramPreference(turn.text,turn.at)||pi.stage==='correction'&&correctionFieldReference(turn.text))continue;
  if(blockedText(turn.text))return [];
  const explicit=explicitFields(turn.text),separated=promptedLiteralFields(turn.text,requested,pi.stage==='correction');
  const name=explicit.name||separated.name||(requested.includes('name')&&literalName(turn.text,true)),address=explicit.address||separated.address||(requested.includes('address')&&literalAddress(turn.text,true));
  if(!name&&!address||name&&address&&!explicit.name&&!separated.name)return [];
  const fact={...explicit,...(name?{name}:{}),...(address?{address}:{}),source:source(turn),position};
  for(const key of ['name','address'])if(fact[key]){if(values[key]&&values[key]!==fact[key])fact.conflictFields=[...new Set([...(fact.conflictFields||[]),key])];values[key]=fact[key];}
  facts.push(fact);
 }
 return facts;
}
function sourcePosition(s,e,reference){return reference?.id?s.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(reference.id,e.phone,e.line)?.rowid||0:0;}
export function ownQuoteOutboxId(s,state,phone,line){
 const q=state.quotedPrice;if(!q)return null;if(!q.replyId)return q.sourceId+':reply';
 if(!/^tesa-unregistered:[a-zA-Z0-9:_-]+$/.test(q.replyId))return null;
 const ref=get(s,'maria-tesa-unregistered-reply:'+q.replyId);
 return ref?.guard==='own-prospective-native-tesa-closed-unregistered-answer-v1'&&ref.ordinaryPrice===true&&ref.plan?.caseId===state.caseId&&ref.plan.phone===phone&&ref.plan.line===line&&ref.plan.sourceId===q.sourceId&&ref.entryId===q.entryId?q.replyId:null;
}
// The outbox and its immutable first-delivery proof determine the price version.
// A state/caller hash cannot select a historical tariff on its own.
export function ownDeliveredQuoteEntry(s,state,phone,line,slots=state.slots){
 const q=state.quotedPrice;if(!q)return null;
 const row=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND internal=0 AND case_id=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(ownQuoteOutboxId(s,state,phone,line),phone,line,state.caseId);
 if(!row||!s.priceReplyReference(row)||!s.priceReplyStillValid(row))return null;
 const table=q.entryId?.startsWith('approved-table-'),version=table?s.priceReplyVersion(row):null;
 if(table&&(!version?.deliveryVerified||version.clarification||q.scheduleHash!==undefined&&q.scheduleHash!==version.scheduleHash||q.issuedAt!==undefined&&q.issuedAt!==version.sourceAt))return null;
 const entry=selectPrice(slots,s.approvedPriceCatalogs(),q.entryId,version||{}).entry;
 return entry&&entry.id===q.entryId&&entry.priceCop===q.priceCop?{q,entry,row,version}:null;
}
function eligibleQuote(s,state,phone,line){
 const own=ownDeliveredQuoteEntry(s,state,phone,line);if(!own?.q.accepted||own.entry.source?.type!=='direct_user_approved_schedule')return null;
 const {row}=own,firstDelivery=get(s,'first-delivery:'+row.id);
 if(row.created<Date.now()-86400000||!firstDelivery||firstDelivery.mid!==row.mid||firstDelivery.verifiedAt<Date.now()-86400000)return null;
 row.firstDeliveryAt=Math.floor(firstDelivery.verifiedAt/1000)*1000;
 return own;
}
export function registrationQuoteReady(s,state,phone,line){return Boolean(eligibleQuote(s,state,phone,line));}
export function ordinaryRegistrationDataQuestion(text){
 const t=normalize(text).replace(/^[¿?\s]+|[¿?!.\s]+$/g,'').replace(/\s+/g,' ');
 return /^(?:por favor[, ]+)?que (?:datos|informacion) (?:necesitas|necesitan|te envio|te mando|debo enviar|tengo que enviar|te debo enviar|me pides)(?: para (?:agendar|programar|registrar|continuar)(?: (?:el servicio|la solicitud|con el servicio))?)?(?: por favor)?$/.test(t);
}
// A customer's pause during data collection is neither a cancellation nor a
// new permission to write. Keep the original accepted quote and sourced facts.
export function ordinaryProgramDeferralTurn(s,c,state,e){
 if(!programEnabled(c)||!state.programIntake||!state.caseId?.startsWith('fumigacion:')||state.closed||!Number.isSafeInteger(e.at)||e.at<c.mariaProgram.startsAt||!operationalLineAllowed(c,e.line)||c.operationalLineScope&&(e.at<Date.parse(c.operationalLineScope.authorizedAt)||typeof s.hasSourcesOutsideLine!=='function'||s.hasSourcesOutsideLine(e.phone,e.line)))return null;
 const pi=state.programIntake,marker=state.customerDeferral,requested=customerDeferralRequested(e),active=marker?.guard===CUSTOMER_DEFERRAL_GUARD&&marker.active===true&&marker.caseId===state.caseId&&marker.line===e.line&&e.at>marker.at;
 if(!requested&&!active)return null;
 const conv=s.conversation(e.phone),row=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line),native=row&&s.open(row.body),anchor=s.db.prepare('SELECT at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(state.caseId.slice(11),e.phone,e.line);
 if(!conv||conv.hold||conv.state.caseId!==state.caseId||!anchor||anchor.at>e.at||native?.id!==e.id||native.phone!==e.phone||native.line!==e.line||native.at!==e.at||native.text!==e.text||native.kind!==e.kind||native.fromMe!==false||native.forwarded||native.quotedId)return null;
 if(['pending','review','registered'].includes(pi.stage)){
  if(!requested)return null;
  const entry=get(s,prefix+state.caseId),p=entry?.payload;
  if(!p||entry.requestHash!==registrationHash(p)||p.caseId!==state.caseId||p.phone!==e.phone||p.line!==e.line)return null;
  const saved=pi.stage==='registered'&&ownRegisteredReceiptForPresentation(s,c,{phone:e.phone,line:e.line,caseId:state.caseId});
  return {state,kind:'post-registration-status',reply:saved?'Tu solicitud ya está registrada. Antes de aplazarla, necesitamos revisar su estado; no he modificado ni cancelado el servicio.':'El registro de tu solicitud está pendiente de verificación. No tengo confirmada una cancelación ni un cambio.'};
 }
 if(!['name','address','details','confirm','correction'].includes(pi.stage))return null;
 if(requested){
  state.customerDeferral={guard:CUSTOMER_DEFERRAL_GUARD,active:true,caseId:state.caseId,line:e.line,sourceId:e.id,at:e.at,registrationStage:pi.stage,...(marker?.sourceId&&marker.sourceId!==e.id?{previousSources:[...(marker.previousSources||[]),{sourceId:marker.sourceId,at:marker.at}].slice(-10)}:{})};
  return {state,kind:'collection-deferred',reply:'Claro, puedes pensarlo con calma. Si te surge alguna duda, aquí estoy.'};
 }
 if(e.kind!=='text'||e.fromMe||e.forwarded||e.quotedId)return null;
 let resumedBy=customerDeferralResumeEvidence(e),resumedFields=null;
 if(!resumedBy){
  const prompt=pi.promptId&&s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND internal=0 AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(pi.promptId,e.phone,e.line,state.caseId),proof=prompt&&get(s,'first-delivery:'+prompt.id);
  if(prompt&&proof?.mid===prompt.mid&&proof.line===e.line&&['DELIVERED','READ'].includes(proof.state)&&Number.isSafeInteger(proof.verifiedAt)&&e.at>=Math.floor(proof.verifiedAt/1000)*1000){
   const fields=explicitFields(e.text),wanted=pi.requestedFields||(['name','address'].includes(pi.stage)?[pi.stage]:['name','address']),literal={};
   if(!fields.conflict){if(wanted.includes('name'))literal.name=fields.name||literalName(e.text,true);if(wanted.includes('address'))literal.address=fields.address||literalAddress(e.text,true);}
   resumedBy=customerDeferralResumeEvidence(e,literal);if(resumedBy)resumedFields=literal;
  }
 }
 if(resumedBy){
  state.customerDeferral={...marker,active:false,resumedBy};
  // A resumed summary must be delivered again before a NEW confirmation. The
  // old prompt/preview remain in original outbox/history, never replayed.
  state.programIntake={...pi,promptId:null,preview:null,
   ...(resumedFields?.name?{customerName:resumedFields.name,nameSource:source(e)}:{}),
   ...(resumedFields?.address?{address:resumedFields.address,addressSource:source(e)}:{})};
  return {state,kind:'collection-resumed',resumed:true,resumedBy};
 }
 if(customerDeclinesAfterDeferral(e)||/[?¿]|\b(?:pague|pago|pagar|comprobante|transfer|consign|abono|refuerzo|garantia|cancel|reprogram|queja|reclamo|denuncia|dolor|intoxic|embaraz|mascota|bebe|nino|producto|segur|toxic|veneno|precaucion|documento|certificado)\w*/.test(normalize(e.text)))return null;
 return {state,kind:'collection-still-deferred',reply:'Tu solicitud sigue pendiente. Puedes retomarla cuando decidas continuar.'};
}
// A pending technical/price consultation does not prevent answering what data
// will be needed. This path grants no acceptance, registration or schedule and
// deliberately leaves both the review and its original consultation intact.
export function pendingOrdinaryDataInformationTurn(s,c,state,e){
 if(!programEnabled(c)||!state.awaitingHumanReview||state.programIntake||!state.caseId?.startsWith('fumigacion:')||!Number.isSafeInteger(e.at)||e.at<c.mariaProgram.startsAt||!operationalLineAllowed(c,e.line)||c.operationalLineScope&&(e.at<Date.parse(c.operationalLineScope.authorizedAt)||typeof s.hasSourcesOutsideLine!=='function'||s.hasSourcesOutsideLine(e.phone,e.line)))return null;
 if(e.kind!=='text'||e.fromMe!==false||e.forwarded||e.quotedId||!ordinaryRegistrationDataQuestion(e.text)||state.closed||state.customerDeferral?.active||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview||state.requestedProductInquiry||state.pendingFaqQuestion||Object.keys(state).some(k=>k.startsWith('requestedPayment')&&state[k]))return null;
 const conv=s.conversation(e.phone);if(!conv||conv.hold||conv.state.caseId!==state.caseId)return null;
 const first=s.db.prepare('SELECT rowid,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(state.caseId.slice(11),e.phone,e.line),current=s.db.prepare('SELECT rowid,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line);
 if(!first||!current||first.rowid>current.rowid)return null;
 const native=s.open(current.body),anchor=s.open(first.body);
 if(native.id!==e.id||native.phone!==e.phone||native.line!==e.line||native.fromMe!==false||native.text!==e.text||native.at!==e.at||native.kind!=='text'||native.forwarded||native.quotedId||anchor.kind!=='text'||anchor.fromMe!==false||anchor.phone!==e.phone||anchor.line!==e.line||anchor.forwarded||anchor.quotedId||anchor.at<c.mariaProgram.startsAt||anchor.at>e.at)return null;
 const topics=new Set(['cotizacion-verificada','special-quotation','disponibilidad-y-tecnico']);
 const questions=[...s.db.prepare("SELECT q.* FROM questions q JOIN outbox o ON o.id=q.outbox_id WHERE q.phone=? AND q.case_id=? AND o.line=? AND q.state IN ('PENDING','ANSWER_REVIEW') ORDER BY q.rowid DESC LIMIT 100").all(e.phone,state.caseId,e.line),...s.db.prepare("SELECT * FROM tesa_questions WHERE company='fumigacion' AND customer_phone=? AND case_id=? AND source_line=? AND state IN ('PENDING','ANSWER_REVIEW') ORDER BY rowid DESC LIMIT 100").all(e.phone,state.caseId,e.line)];
 const eligible=questions.filter(q=>topics.has(q.topic)).flatMap(q=>{
  const body=s.open(q.body),row=s.db.prepare('SELECT rowid,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(body.source,e.phone,e.line);if(!row||row.rowid<first.rowid||row.rowid>current.rowid)return [];
  const source=s.open(row.body);return source.id===body.source&&source.fromMe===false&&source.phone===e.phone&&source.line===e.line&&source.kind==='text'&&!source.forwarded&&!source.quotedId&&source.at>=anchor.at&&source.at<=e.at?[q]:[];
 });
 const pending=eligible.find(q=>q.id===state.pendingTesaQuestionId)||eligible[0];if(!pending)return null;
 const latest={};for(const fact of caseLiteralFields(s,c,state,e)){
  const row=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(fact.source.id,e.phone,e.line),original=row&&s.open(row.body);if(!original||original.quotedId)continue;
  for(const key of ['name','address'])if(fact[key])latest[key]=fact.conflictFields?.includes(key)?null:fact[key];
 }
 const missing=[...(!latest.name?['Tu nombre completo.']:[]),...(!latest.address?['La dirección completa, incluido apartamento o interior si aplica.']:[]),...(!state.slots.location?['El municipio del servicio.']:[]),...(!state.slots.preference?['Qué día y franja horaria prefieres.']:[])];
 const reply=(missing.length?'Para preparar tu solicitud, me faltan:\n'+missing.map((item,i)=>(i+1)+'. '+item).join('\n'):'Ya tengo esos datos para preparar tu solicitud.')+'\n\n'+(pending.topic==='disponibilidad-y-tecnico'?'El horario y el técnico siguen pendientes de confirmación.':'El precio y el horario siguen pendientes de confirmación.');
 return {state,reply,questionId:pending.id,topic:pending.topic};
}
export function ordinaryDataInformationTurn(s,c,state,e){
 if(!programEnabled(c)||e.at<c.mariaProgram.startsAt||!operationalLineAllowed(c,e.line)||c.operationalLineScope&&e.at<Date.parse(c.operationalLineScope.authorizedAt)||c.operationalLineScope&&(typeof s.hasSourcesOutsideLine!=='function'||s.hasSourcesOutsideLine(e.phone,e.line)))return null;
 if(e.quotedId||e.kind!=='text'||e.fromMe||e.forwarded||state.closed||state.awaitingHumanReview||state.customerDeferral?.active||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview||state.requestedProductInquiry||state.pendingFaqQuestion||Object.keys(state).some(k=>k.startsWith('requestedPayment')&&state[k])||['pending','review','registered','declined'].includes(state.programIntake?.stage))return null;
 const conversation=s.conversation(e.phone);if(!conversation||conversation.hold||conversation.state.caseId!==state.caseId)return null;
 const question=ordinaryRegistrationDataQuestion(e.text),previous=state.registrationInformationRequest;
 if(!question&&!previous)return null;
 const own=ownDeliveredQuoteEntry(s,state,e.phone,e.line);
 if(!own||own.entry.source?.type!=='direct_user_approved_schedule'||own.row.created<Date.now()-86400000||own.row.created>e.at)return null;
 if(previous&&previous.quoteOutboxId!==own.row.id)return null;
 const latest={};for(const fact of caseLiteralFields(s,c,state,e))for(const field of ['name','address'])if(fact[field]&&!fact.conflictFields?.includes(field))latest[field]={value:fact[field],source:fact.source};
 const pi=state.programIntake||{},data={...(previous||{}),quoteOutboxId:own.row.id,customerName:pi.customerName||previous?.customerName||latest.name?.value,nameSource:pi.nameSource||previous?.nameSource||latest.name?.source,address:pi.address||previous?.address||latest.address?.value,addressSource:pi.addressSource||previous?.addressSource||latest.address?.source};
 if(!question){
  // Information requests never accept a price. Keep pre-acceptance facts in a
  // separate sourced record, not in the registration state machine.
  if(own.q.accepted||confirms(e.text)||blockedText(e.text))return null;
  const prompt=previous?.promptId&&s.db.prepare("SELECT id FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(previous.promptId,e.phone,e.line,state.caseId);
  if(!prompt)return null;
  const requested=[...(!data.customerName?['name']:[]),...(!data.address?['address']:[])],explicit=explicitFields(e.text),separated=promptedLiteralFields(e.text,requested);
  if(explicit.conflict)return null;
  const name=explicit.name||separated.name,address=explicit.address||separated.address,preference=literalProgramPreference(e.text,e.at);
  if(!name&&!address&&!preference)return null;
  if(name){data.customerName=name;data.nameSource=source(e);}if(address){data.address=address;data.addressSource=source(e);}
 }
 const missing=[...(!data.customerName?['Tu nombre completo.']:[]),...(!data.address?['La dirección completa, incluido apartamento o interior si aplica.']:[]),...(!state.slots.location?['El municipio del servicio.']:[]),...(!state.slots.preference?['Qué día y franja horaria prefieres.']:[])];
 state.registrationInformationRequest={...data,sourceId:previous?.sourceId||e.id,at:previous?.at||e.at,promptId:e.id+':reply'};
 const reply=missing.length?'Para preparar tu solicitud, me faltan:\n'+missing.map((item,i)=>(i+1)+'. '+item).join('\n')+'\n\nEl horario queda pendiente de confirmación.':'Ya tengo los datos necesarios. El horario queda pendiente de confirmación.';
 return {state,registrationInformation:true,reply:reply+(!question&&!own.q.accepted?'\n\n¿Aceptas la cotización para continuar?':'')};
}
function blockedText(text){return /[?¿]|^no\b|\b(?:refuerzo|garantia|verificacion|visita anterior|ya fumig|certificado|documento|cancel|no quiero|no acepto|pague|pago|pagar|transfer|comprobante|consign|descuento|gratis|otra solicitud|nuevo servicio|otro servicio|otro inmueble)\w*/.test(normalize(text));}
// Called only inside the engine's existing transaction; no network or business write.
export function registrationTurn(s,c,previous,e,decision,{literalSlots=null}={}){
 if(!programEnabled(c)||e.fromMe||e.forwarded||e.kind!=='text'||e.at<c.mariaProgram.startsAt)return null;
 if(!operationalLineAllowed(c,e.line)||c.operationalLineScope&&e.at<Date.parse(c.operationalLineScope.authorizedAt))return null;
 if(c.operationalLineScope&&(typeof s.hasSourcesOutsideLine!=='function'||s.hasSourcesOutsideLine(e.phone,e.line)))return null;
 const state=decision.state;
 if(state.customerDeferral?.guard===CUSTOMER_DEFERRAL_GUARD&&state.customerDeferral.active===true)return null;
 const information=ordinaryDataInformationTurn(s,c,state,e);if(information)return information;
 const priorQuote=state.programIntake&&s.db.prepare('SELECT case_id FROM outbox WHERE id=? AND phone=? AND line=?').get(ownQuoteOutboxId(s,state,e.phone,e.line),e.phone,e.line);
 if(priorQuote&&priorQuote.case_id!==state.caseId){
  state.programIntake={...state.programIntake,stage:'review',preview:null};
  return {state,reviewTopic:'program-registration-review',reviewConditions:{kind:'quote-case-changed',caseId:state.caseId},review:'Los datos y la cotización no pertenecen a la misma solicitud vigente. No se creó un servicio.',reviewQuestion:'¿Qué solicitud y cotización verificadas corresponden a estos datos?',reply:'Necesito verificar que la cotización y los datos correspondan a la misma solicitud antes de registrarla.'};
 }
 const own=eligibleQuote(s,state,e.phone,e.line);
 if(!own||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview)return null;
 const info=state.registrationInformationRequest;
 const prior=state.programIntake||{stage:'name',originalQuoteAcceptanceId:own.q.acceptanceSource,...(info?.quoteOutboxId===own.row.id?{customerName:info.customerName,nameSource:info.nameSource,address:info.address,addressSource:info.addressSource}:{})};
 if(['pending','review','declined'].includes(prior.stage))return {state,observed:true,observedState:'PROGRAM_REGISTRATION_PENDING'};
 if(prior.stage==='registered')return null;
 const pi={...prior},prompt=pi.promptId&&s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ')").get(pi.promptId,e.phone,e.line),batchFields=promptedBatchFields(s,c,previous,e,pi,prompt);
 if(decision.courtesy&&!confirms(e.text)&&!batchFields.some(fact=>fact.name||fact.address))return null;
 state.programIntake=pi;
 const candidateRequested=pi.requestedFields||(['name','address'].includes(pi.stage)?[pi.stage]:['name','address']),candidateExplicit=explicitFields(e.text),candidateSeparated=prompt&&!confirms(e.text)?promptedLiteralFields(e.text,candidateRequested,pi.stage==='correction'):{};
 const candidateName=candidateExplicit.name||candidateSeparated.name||(!confirms(e.text)&&!mariaIncidentalPetMention(e)&&literalName(e.text,(pi.stage==='name'||pi.stage==='correction'&&!correctionFieldReference(e.text))&&Boolean(prompt)));
 const candidateAddress=candidateExplicit.address||candidateSeparated.address||literalAddress(e.text,(['address','confirm','correction'].includes(pi.stage)||pi.requestedFields?.includes('address'))&&Boolean(prompt));
 if(directNameCorrection(e.text)&&!candidateName&&!blockedText(e.text)){
  pi.stage='correction';pi.requestedFields=['name'];pi.preview=null;pi.promptId=e.id+':reply';pi.pendingNameCorrectionSource=source(e);
  return {state,reply:'Necesito tu nombre completo correcto para actualizar la solicitud. ¿Me lo compartes?'};
 }
 const petFieldFacts=[...batchFields.flatMap(fact=>['name','address'].filter(kind=>fact[kind]&&!fact.conflictFields?.includes(kind)).map(kind=>({kind,value:fact[kind],source:fact.source}))),...(!candidateExplicit.conflict?[{kind:'name',value:candidateName,source:source(e)},{kind:'address',value:candidateAddress,source:source(e)}]:[])];
 let petPresence;
 try{petPresence=casePetPresence(s,c,state,e,petFieldFacts);}catch{
  pi.stage='review';pi.preview=null;
  return {state,reviewTopic:'program-registration-review',reviewConditions:{kind:'pet-source-unverified',caseId:state.caseId},review:'La observación de mascotas no coincide con una fuente literal vigente y verificable de este caso y esta línea. Hay un dato pendiente de aclaración; no se creó un servicio.',reviewQuestion:'¿Qué observación literal y fuente verificadas corresponden a esta solicitud?',reply:'Hay un dato de tu solicitud que necesita verificarse antes de registrarla.'};
 }
 if(/\b(?:no (?:gracias|quiero|deseo|necesito|me interesa|acepto)|prefiero no|cancela|cancelar)\b/.test(normalize(e.text))){
  pi.stage='declined';pi.preview=null;state.closed=true;state.quotedPrice={...state.quotedPrice,accepted:false};
  return {state,reply:'Entendido. No registraré el servicio. Gracias por avisarme.'};
 }
 if(/^no\b/.test(normalize(e.text))&&['confirm','correction'].includes(prior.stage)){
  pi.stage='correction';pi.requestedFields=['name','address'];pi.preview=null;pi.promptId=e.id+':reply';return {state,reply:'¿Qué dato debemos corregir antes de registrar tu solicitud?'};
 }
 if(blockedText(e.text)&&!(decision.courtesy&&batchFields.some(fact=>fact.name||fact.address)))return null;
 // Reuse explicitly labelled facts from this native case window. Bare text is
 // interpreted as a field only in reply to our own delivered request for it.
 const fields=[...caseLiteralFields(s,c,state,e),...batchFields].sort((a,b)=>a.position-b.position),latest={};let conflicting=false;
 for(const fact of fields)for(const key of ['name','address'])if(fact[key])latest[key]=fact;
 const unresolved=new Set();
 for(const [key,sourceKey] of [['name','nameSource'],['address','addressSource']]){
  const fact=latest[key],valueKey=key==='name'?'customerName':'address',position=sourcePosition(s,e,pi[sourceKey]);
  if(!fact||fact.position<position)continue;
  if(fact.conflictFields?.includes(key)){delete pi[valueKey];delete pi[sourceKey];unresolved.add(key);conflicting=true;continue;}
  if(!pi[valueKey]||fact.position>position){if(pi[valueKey]&&pi[valueKey]!==fact[key])conflicting=true;pi[valueKey]=fact[key];pi[sourceKey]=fact.source;}
 }
 const explicit=explicitFields(e.text),requested=pi.requestedFields||(['name','address'].includes(pi.stage)?[pi.stage]:['name','address']);
 const separated=prompt&&!confirms(e.text)?promptedLiteralFields(e.text,requested,pi.stage==='correction'):{};
 const name=!unresolved.has('name')&&(explicit.name||separated.name||(!confirms(e.text)&&!mariaIncidentalPetMention(e)&&literalName(e.text,(pi.stage==='name'||pi.stage==='correction'&&!correctionFieldReference(e.text))&&Boolean(prompt)))),address=!unresolved.has('address')&&(explicit.address||separated.address||literalAddress(e.text,(['address','confirm','correction'].includes(pi.stage)||pi.requestedFields?.includes('address'))&&Boolean(prompt)));
 const scopedAddress=address||pi.address;
 if(scopedAddress&&changedAddressScope(scopedAddress,state.slots)){
  pi.stage='review';pi.preview=null;return {state,reviewTopic:'special-quotation',reviewConditions:{kind:'registration-address-scope-changed',caseId:state.caseId},review:'La dirección o su texto añaden un municipio o alcance diferente a la cotización aceptada. No se creó un servicio ni se conservó ese precio para otro alcance.',reviewQuestion:'¿Qué municipio y alcance comprobados corresponden a esta solicitud?',reply:'Los datos que compartiste cambian el alcance de la cotización. Tu solicitud necesita revisión antes de confirmarla.'};
 }
 let changed=Boolean(conflicting||explicit.conflict||pi.customerName!==prior.customerName||pi.address!==prior.address);
 if(name&&name!==pi.customerName){pi.customerName=name;pi.nameSource=source(e);changed=true;}
 if(address&&address!==pi.address){pi.address=address;pi.addressSource=source(e);changed=true;}
 if(pi.pendingNameCorrectionSource){
  const correctionPosition=sourcePosition(s,e,pi.pendingNameCorrectionSource);
  if(name||sourcePosition(s,e,pi.nameSource)>correctionPosition){
   if(name){pi.customerName=name;pi.nameSource=source(e);}delete pi.pendingNameCorrectionSource;changed=true;
  }else{
   pi.stage='correction';pi.requestedFields=['name'];pi.preview=null;pi.promptId=e.id+':reply';
   return {state,reply:'Necesito tu nombre completo correcto para actualizar la solicitud. ¿Me lo compartes?'};
  }
 }
 const planning=staffPlanningForCase(s,c,state,e);
 if(planning?.invalid)return {state,observed:true,observedState:'STAFF_PLANNING_CASE_SOURCE_UNVERIFIED'};
 const clientCalendarIntake=Boolean(planning&&clientRequestedScheduleEnabled(c,planning.caseSourceAt));
 if(!pi.customerName||!pi.address){
  const missing=[...(!pi.customerName?['name']:[]),...(!pi.address?['address']:[])];
  if(pi.promptId&&!prompt&&JSON.stringify(pi.requestedFields||[])===JSON.stringify(missing))return {state,observed:true,observedState:'PROGRAM_FIELDS_DELIVERY_PENDING'};
  pi.stage=!pi.customerName?'name':'address';pi.requestedFields=missing;pi.promptId=e.id+':reply';
  const requests=[...(!pi.customerName?['Tu nombre completo.']:[]),...(!pi.address?['La dirección completa del servicio, incluido apartamento o interior si aplica.']:[]),...(!state.slots.preference?[clientCalendarIntake?'Qué día y a qué hora necesitas el servicio (a. m. o p. m.).':'Qué día y franja horaria prefieres.']:[])];
  return {state,reply:'Para registrar tu solicitud, compárteme:\n'+requests.map((item,i)=>(i+1)+'. '+item).join('\n')+(!state.slots.preference?(clientCalendarIntake?'\n\nCon esos datos prepararé tu confirmación.':'\n\nEl horario queda pendiente de confirmación.'):'')};
 }
 if(prior.stage==='correction'&&!changed)return {state,reply:'¿Cuál es el dato correcto que debemos cambiar?'};
 // If the customer already supplied both literal facts before accepting the
 // delivered price, the acceptance is sufficient for an unscheduled order.
 // New/corrected facts supplied after acceptance still need a delivered summary.
 const originalAcceptance=own.q.acceptanceSource&&s.db.prepare('SELECT rowid,at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(own.q.acceptanceSource,e.phone,e.line);
 const preprovided=!planning&&!info&&acceptsOrdinaryQuotation(e.text)&&!conflicting&&!explicit.conflict&&!['confirm','correction'].includes(prior.stage)&&originalAcceptance&&sourcePosition(s,e,pi.nameSource)<=originalAcceptance.rowid&&sourcePosition(s,e,pi.addressSource)<=originalAcceptance.rowid&&Date.parse(pi.nameSource.at)<=originalAcceptance.at&&Date.parse(pi.addressSource.at)<=originalAcceptance.at&&(!petPresence||petPresence.position<=originalAcceptance.rowid&&Date.parse(petPresence.source.at)<=originalAcceptance.at);
 const preference=casePreferenceSource(s,c,state,e);
 if(planning&&!preference){pi.stage='details';pi.requestedFields=['preference'];pi.preview=null;pi.promptId=e.id+':reply';return {state,reply:clientCalendarIntake?'¿Qué día y a qué hora necesitas el servicio? Indícame si es a. m. o p. m.':'¿Qué día y franja horaria prefieres para el servicio? Lo guardaré como horario solicitado; el equipo interno se encargará de asignar el técnico y la ruta.'};}
 const clientSchedule=Boolean(planning&&clientRequestedScheduleEnabled(c,planning.caseSourceAt)&&preference&&Date.parse(preference.source.at)>=c.clientRequestedSchedule.startsAt);
 if(clientSchedule){
  const requested=projectClientRequestedSchedule(preference.value,preference.source.at,iso(e.at));
  if(!requested.complete){
   pi.stage='details';pi.requestedFields=['preference'];pi.preview=null;pi.promptId=e.id+':reply';
   const missing=requested.missing==='date'?'Necesito la fecha exacta para programarlo.':requested.missing==='future-time'?'Ese horario ya pasó. Necesito una fecha y hora nuevas.':'Ya tengo el día que indicaste. Me falta la hora exacta, con a. m. o p. m.';
   return {state,reply:missing+' Escríbeme el día y la hora juntos, por ejemplo: «mañana a las 10 a. m.». Conservaré los demás datos que ya me compartiste.'};
  }
 }
 const basePreview={customerName:pi.customerName,address:pi.address,municipality:state.slots.location,service:state.slots.service,priceCop:own.entry.priceCop,...(preference?{preference:preference.value}:{}),...(clientSchedule?{clientSchedule:true}:{}),...(petPresence?{petPresence:petPresence.value,petPresenceSource:petPresence.source}:{})};
 const priorSummary=pi.promptId&&s.db.prepare('SELECT created FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND internal=0').get(pi.promptId,e.phone,e.line,state.caseId);
 const legacyPreview=prior.stage==='confirm'&&priorSummary&&own.row.created<=priorSummary.created&&JSON.stringify(pi.preview)===JSON.stringify(basePreview);
 const scope=legacyPreview?{}:ownSummaryScope(s,state,e,own,literalSlots);
 if(!scope)return {state,observed:true,observedState:'PROGRAM_SUMMARY_SCOPE_SOURCE_UNVERIFIED'};
 const preview={...basePreview,...scope};
 if(!preprovided&&(prior.stage!=='confirm'||changed||JSON.stringify(pi.preview)!==JSON.stringify(preview))){
  pi.stage='confirm';pi.promptId=e.id+':reply';pi.preview=preview;
  return {state,reply:ordinarySummaryText(preview)};
 }
 if(!preprovided&&(!prompt||!confirms(e.text)))return {state,observed:true,observedState:'PROGRAM_SUMMARY_CONFIRMATION_PENDING'};
 if(!preprovided&&JSON.stringify(pi.preview)!==JSON.stringify(preview))return {state,observed:true,observedState:'PROGRAM_SUMMARY_REVIEW'};
 const summaryConfirmation=(confirmsOrdinarySummaryData(e.text)||clientSchedule&&confirms(e.text))?ownSummaryDataProof(s,state,e,prompt,preview):null;
 if((confirmsOrdinarySummaryData(e.text)||clientSchedule)&&!summaryConfirmation)return {state,observed:true,observedState:'PROGRAM_SUMMARY_CONFIRMATION_PENDING'};
 const conv=s.conversation(e.phone),allowed=['service','site','location','area','rooms','mattresses','patio','floors','roomScale','siteScale','treatmentScope','affectedFurniture'];
 const slots=Object.fromEntries(allowed.filter(k=>state.slots[k]!=null).map(k=>[k,String(state.slots[k])]));
 if(preference)slots.preference=preference.value;
 const locationProjection=currentMariaLocationProjection(s,state,e);
 if(locationProjection.review){
  pi.stage='review';pi.preview=null;s.audit('OWN_CURRENT_LOCATION_PROJECTION_REVIEW',e.id,{caseId:state.caseId,reason:locationProjection.reason,originalHistoryPreserved:true,businessWritten:false});
  return {state,reviewTopic:'program-registration-review',reviewConditions:{kind:'current-location-details-unverified',caseId:state.caseId},review:'Una indicación del inmueble mezcla datos anteriores corregidos y otros detalles que no pueden separarse con certeza. Se conservaron las fuentes originales y no se creó un servicio.',reviewQuestion:'¿Qué indicaciones actuales de ubicación y acceso corresponden a esta solicitud, sin los datos de tamaño ya corregidos?',reply:'Antes de registrar tu solicitud, necesito aclarar las indicaciones actuales de ubicación y acceso.'};
 }
 if(locationProjection.applied)s.audit('OWN_CURRENT_LOCATION_PROJECTED',e.id,{caseId:state.caseId,guard:locationProjection.guard,omissions:locationProjection.omissions,retained:locationProjection.retained,originalHistoryPreserved:true,businessWritten:false});
 const payload={caseId:state.caseId,phone:e.phone,line:e.line,sourceId:e.id,customerName:pi.customerName,address:pi.address,municipality:state.slots.location,locationDetails:locationProjection.locationDetails,slots,...(clientSchedule?{clientSchedule:{guard:MARIA_CLIENT_SCHEDULE_GUARD}}:{}),...(petPresence?{petPresence:petPresence.value}:{}),...(summaryConfirmation?{summaryConfirmation}:{}),
  quote:{entryId:own.entry.id,priceCop:own.entry.priceCop,scheduleHash:own.entry.source.scheduleHash,mid:own.row.mid,sourceId:own.q.sourceId,deliveredAt:iso(own.row.firstDeliveryAt),acceptedAt:iso(e.at),acceptanceId:e.id},
  sources:{customerName:pi.nameSource,address:pi.addressSource,...(preference?{preference:preference.source}:{}),...(petPresence?{petPresence:petPresence.source}:{}),acceptance:{...source(e),phone:e.phone,line:e.line,fromMe:false,forwarded:false}}};
 const key=prefix+state.caseId,existing=get(s,key),hash=registrationHash(payload);
 if(existing){if(existing.requestHash!==hash)throw Error('PROGRAM_CASE_ALREADY_RESERVED');return {state,observed:true,observedState:'PROGRAM_REGISTRATION_PENDING'};}
 const summaryOutboxId=preprovided?null:pi.promptId;
 put(s,key,{status:'PENDING',payload,requestHash:hash,revision:conv.revision,summaryOutboxId,confirmationKind:preprovided?'price-accepted-with-prior-literal-facts':'delivered-summary-confirmed',...(planning?{staffPlanning:{...planning,requestedTiming:preference.value,preferenceSourceId:preference.source.id}}:{}),createdAt:Date.now()});pi.stage='pending';pi.acceptanceId=e.id;
 s.audit('OWN_SERVICE_REGISTRATION_PREPARED',e.id,{caseId:state.caseId,requestHash:hash,priceCop:own.entry.priceCop,businessWritten:false,summaryOutboxId});
 return {state,observed:true,observedState:'PROGRAM_REGISTRATION_PENDING'};
}
function receiptValid(c,entry,r){return ownScope(c,r)&&r.createdById===c.mariaProgram.actorId&&r.phone===entry.payload.phone&&r.persisted===true&&uuid.test(r.orderId||'')&&r.caseId===entry.payload.caseId&&r.acceptanceId===entry.payload.quote.acceptanceId&&r.requestHash===entry.requestHash&&(entry.payload.clientSchedule?clientRequestedScheduleReceiptMatches(entry.payload,r):r.state==='NUEVO'&&r.scheduled===false)&&r.paymentRecorded===false;}
export function ownRegisteredReceiptForPresentation(s,c,{phone,line,caseId}){
 if(!programEnabled(c))return null;
 const conv=s.conversation(phone),entry=get(s,prefix+caseId),p=entry?.payload;
 if(!conv||conv.hold||conv.state.caseId!==caseId||conv.state.programIntake?.stage!=='registered'||entry?.status!=='SAVED'||!p||p.phone!==phone||p.line!==line||p.caseId!==caseId||entry.requestHash!==registrationHash(p)||!receiptValid(c,entry,entry.receipt)||conv.state.programServiceId!==entry.receipt.orderId||!registrationOperationalScope(s,c,entry))return null;
 return entry;
}
// Only the creation of a new operational question may prepare continuity.
// Existing questions never acquire this marker after an upgrade or rerouting.
export function prepareRegisteredTesaContinuation(s,c,request,result){
 if(c.company!=='fumigacion'||!result?.created||!result.outboxId?.startsWith('tesa-question:')||request.topic!=='disponibilidad-y-tecnico')return false;
 const conv=s.conversation(request.phone),entry=get(s,prefix+request.caseId),q=s.db.prepare('SELECT * FROM tesa_questions WHERE id=? AND company=?').get(result.id,c.company);
 if(!conv||conv.hold||conv.state.caseId!==request.caseId||conv.state.programIntake?.stage!=='registered'||!entry||entry.status!=='SAVED'||!receiptValid(c,entry,entry.receipt)||conv.state.programServiceId!==entry.receipt.orderId||!q||q.state!=='PENDING'||q.source_line!==request.line)return false;
 const body=s.open(q.body);
 if(body.conditions?.programServiceId!==entry.receipt.orderId||body.conditions?.quotedPriceCop!==entry.payload.quote.priceCop)return false;
 const key='tesa-continuation-plan:'+result.id;
 if(get(s,key))return false;
 put(s,key,{guard:MARIA_PROGRAM_OPERATIONAL_CONTINUATION_GUARD,questionId:result.id,caseId:request.caseId,phone:request.phone,line:request.line,revision:conv.revision,customerAt:conv.at,slotsHash:registrationHash(conv.state.slots),orderId:entry.receipt.orderId,receiptHash:entry.requestHash,preparedAt:Date.now()});
 s.audit('OWN_SAVED_ORDER_OPERATIONAL_CONTINUITY_PREPARED',request.source,{caseId:request.caseId,questionId:result.id,orderId:entry.receipt.orderId,scheduled:false,paymentsEnabled:false,historicalQuestionAdopted:false});
 return true;
}
// A delivered operational statement may receive a plain customer acceptance.
// Acknowledge that turn without claiming that availability has been scheduled
// or repeating the question. Only a prospectively prepared own continuation
// can qualify; old questions never acquire a continuation marker here.
export function registeredTesaConfirmation(s,c,state,e){
 const plain=text=>/^(?:si|listo|dale|acepto|de acuerdo|confirmo|correcto|esta bien|perfecto|si esta bien|si confirmo|si acepto|todo correcto|si todo correcto|si correcto|listo esta bien|ok|okay)(?: (?:por favor|gracias|muchas gracias))*$/.test(normalize(text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim());
 const tesa=getTesaConfig(c);
 if(!programEnabled(c)||!tesa||e.kind!=='text'||e.fromMe||e.forwarded||!plain(e.text)||state.programIntake?.stage!=='registered'||state.awaitingHumanReview||state.closed||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview)return null;
 const conv=s.conversation(e.phone),entry=get(s,prefix+state.caseId),own=eligibleQuote(s,state,e.phone,e.line);
 if(!conv||conv.hold||conv.state.caseId!==state.caseId||!entry||entry.status!=='SAVED'||entry.requestHash!==registrationHash(entry.payload)||!receiptValid(c,entry,entry.receipt)||!registrationOperationalScope(s,c,entry)||entry.payload.line!==e.line||state.programServiceId!==entry.receipt.orderId||!own||own.q.sourceId!==entry.payload.quote.sourceId||own.entry.priceCop!==entry.payload.quote.priceCop)return null;
 const q=s.db.prepare("SELECT q.*,o.state delivery,o.mid question_mid FROM tesa_questions q JOIN tesa_outbox o ON o.id=q.outbox_id WHERE q.company=? AND q.case_id=? AND q.customer_phone=? AND q.source_id=? AND q.topic='disponibilidad-y-tecnico' AND q.source_line=?").get(c.company,state.caseId,e.phone,state.verifiedTesaAnswerSource||'',e.line);
 if(!q||q.state!=='ANSWERED'||q.valid_until<=Date.now()||q.group_jid!==tesa.groupJid||q.sender_line!==tesa.senderLine||!['DELIVERED','READ'].includes(q.delivery))return null;
 const id='tesa-continuation:'+q.id,plan=get(s,'tesa-continuation-plan:'+q.id),ref=get(s,'tesa-continuation-reply:'+id),out=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND case_id=? AND internal=0 AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(id,e.phone,e.line,state.caseId),answer=q.answer&&s.open(q.answer);
 if(!plan||plan.guard!==MARIA_PROGRAM_OPERATIONAL_CONTINUATION_GUARD||plan.questionId!==q.id||plan.caseId!==state.caseId||plan.phone!==e.phone||plan.line!==e.line||plan.orderId!==entry.receipt.orderId||plan.receiptHash!==entry.requestHash||plan.slotsHash!==registrationHash(state.slots)||!ref||registrationHash(ref.plan)!==registrationHash(plan)||ref.questionId!==q.id||ref.sourceId!==q.source_id||ref.answerText!==answer?.text||answer?.sourceId!==q.source_id||answer.questionMid!==q.question_mid||!out||out.revision!==ref.revision||s.open(out.body)!==ref.text||e.quotedId&&e.quotedId!==out.mid||e.at<Math.floor(out.updated/1000)*1000||e.at<answer.at||e.at>Date.now()+60000)return null;
 const delivery=get(s,'first-delivery:'+id),source=s.db.prepare("SELECT body FROM tesa_events WHERE id=? AND state='CASE_ANSWER'").get(answer.sourceKey),observed=source&&s.open(source.body);
 const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
 if(!delivery||delivery.mid!==out.mid||delivery.line!==e.line||!['DELIVERED','READ'].includes(delivery.state)||e.at<Math.floor(delivery.verifiedAt/1000)*1000||observed?.text!==answer.text||observed.id!==q.source_id||observed.quote?.mid!==q.question_mid||observed.participantKey!==answer.participant?.phone||!tesa.allowedParticipantPhones.includes(answer.participant?.phone)||answer.at<Date.now()-600000||day(answer.at)!==day(Date.now()))return null;
 const delta=conv.revision-out.revision;
 if(delta<1||delta>4||s.db.prepare("SELECT 1 FROM events WHERE phone=? AND id<>? AND state IN ('PENDING','PROCESSING')").get(e.phone,e.id))return null;
 const turns=s.db.prepare('SELECT id,line,at,body,state FROM events WHERE phone=? AND from_me=0 AND revision>? AND revision<=? ORDER BY revision').all(e.phone,out.revision,conv.revision);
 if(turns.length!==delta||turns.at(-1)?.id!==e.id||turns.some(row=>{const turn=s.open(row.body);return row.line!==e.line||turn.fromMe||turn.forwarded||turn.kind!=='text'||turn.at!==row.at||turn.at<plan.customerAt||!(plain(turn.text)||neutralCourtesy(turn.text))||row.id!==e.id&&['PENDING','PROCESSING'].includes(row.state);}))return null;
 const current=s.open(turns.at(-1).body);if(current.id!==e.id||current.phone!==e.phone||current.line!==e.line||current.at!==e.at||current.text!==e.text||current.quotedId!==e.quotedId)return null;
 s.audit('OWN_SAVED_ORDER_CUSTOMER_CONFIRMATION_OBSERVED',e.id,{guard:MARIA_PROGRAM_OPERATIONAL_CONFIRMATION_GUARD,caseId:state.caseId,questionId:q.id,answerSource:q.source_id,orderId:entry.receipt.orderId,acceptanceRenewed:false,scheduled:false,businessWritten:false,newQuestionCreated:false,humanHoldReleased:false});
 return {state,reply:'Recibí tu confirmación para el servicio.'};
}
async function nativeMessage(s,t,c,id,phone,line){
 const l=c.lines.find(x=>x.phone===line);if(!l||typeof t.request!=='function')throw Error('PROGRAM_NATIVE_RECHECK_REQUIRED');
 const response=await t.request(l,'/chat/findMessages/'+encodeURIComponent(l.instance),{where:{key:{id}},offset:10,page:1});
 const matches=[];
 for(const native of (response.messages?.records||[]).filter(r=>r.key?.id===id)){
  const pn=phone+'@s.whatsapp.net',primary=native.key.remoteJid,alt=native.key.remoteJidAlt;
  if((primary===pn||/^\d+@lid$/.test(primary??'')&&alt===pn)&&!(alt?.endsWith('@s.whatsapp.net')&&alt!==pn)){matches.push(native);continue;}
  const stored=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(id,phone,line),expected=stored&&s.open(stored.body);
  if(expected&&await verifyStoredNativeIdentitySource(s,c,t,expected,native))matches.push(native);
 }
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
const neutralCourtesy=text=>/^(?:gracias|muchas gracias|mil gracias|muy amable|gracias muy amable)$/.test(normalize(text).replace(/[.!¡,;]+/g,' ').replace(/\s+/g,' ').trim());
function storedCourtesy(s,p,id){
 const row=s.db.prepare("SELECT * FROM events WHERE id=? AND phone=? AND line=? AND from_me=0 AND state NOT IN ('PENDING','PROCESSING')").get(id,p.phone,p.line);
 if(!row)return null;const event=s.open(row.body);
 return event.kind==='text'&&!event.fromMe&&!event.forwarded&&event.at>Date.parse(p.sources.acceptance.at)&&neutralCourtesy(event.text)?event:null;
}
async function verifyNative(s,c,t,entry){
 if(!registrationOperationalScope(s,c,entry))throw Error('OPERATIONAL_LINE_SCOPE_REVIEW');
 const p=entry.payload,state=s.conversation(p.phone).state,own=eligibleQuote(s,state,p.phone,p.line);if(!own||own.q.sourceId!==p.quote.sourceId)throw Error('PROGRAM_PRICE_CHANGED');
 const acceptanceRow=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(p.quote.acceptanceId,p.phone,p.line);
 const petPresence=acceptanceRow&&casePetPresence(s,c,state,s.open(acceptanceRow.body));
 if(!acceptanceRow||petPresence?.value!==p.petPresence||JSON.stringify(petPresence?.source)!==JSON.stringify(p.sources.petPresence))throw Error('PROGRAM_PET_SOURCE_UNVERIFIED');
 await t.verifyLine(p.line);
 const attention=await t.currentAttention(p.phone,{store:s});if(!attention.complete)throw Error('PROGRAM_ATTENTION_UNVERIFIED');
 const classified=partitionNativeAttention(s,c,{phone:p.phone,line:p.line,revision:s.conversation(p.phone).revision,created:entry.createdAt,sourceAt:Date.parse(p.sources.acceptance.at)},attention),unknown=classified.unknown[0];
 if(classified.releasedSources.length)s.audit('OWN_REGISTRATION_PRE_RETURN_ATTENTION_PRESERVED',p.quote.acceptanceId,{sources:classified.releasedSources,releaseSource:classified.release.source,holdReleased:false,authorUnverified:true,businessWritten:false});
 if(unknown){s.hold(p.phone,unknown.id);throw Error('PROGRAM_HUMAN_TAKEOVER');}
 const quote=await nativeMessage(s,t,c,p.quote.mid,p.phone,p.line),deliveries=[[quote,own.row]];
 if(entry.summaryOutboxId){
  const summary=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(entry.summaryOutboxId,p.phone,p.line);
  if(!summary)throw Error('PROGRAM_SUMMARY_DELIVERY_UNVERIFIED');
  deliveries.push([await nativeMessage(s,t,c,summary.mid,p.phone,p.line),summary]);
  if(confirmsOrdinarySummaryData(p.sources.acceptance.text)){
   const event=s.open(acceptanceRow.body),preview={customerName:p.customerName,address:p.address,municipality:p.municipality,service:p.slots.service,priceCop:p.quote.priceCop,...Object.fromEntries(['site','mattresses','rooms','area'].filter(field=>p.slots[field]!=null).map(field=>[field,String(p.slots[field])])),...(p.slots.preference?{preference:p.slots.preference}:{}),...(p.clientSchedule?{clientSchedule:true}:{}),...(p.petPresence?{petPresence:p.petPresence}:{})};
   if(JSON.stringify(ownSummaryDataProof(s,state,event,summary,preview))!==JSON.stringify(p.summaryConfirmation))throw Error('PROGRAM_SUMMARY_DELIVERY_UNVERIFIED');
  }
 }else if(entry.confirmationKind!=='price-accepted-with-prior-literal-facts'||!acceptsOrdinaryQuotation(p.sources.acceptance.text)||Date.parse(p.sources.customerName.at)>Date.parse(p.sources.acceptance.at)||Date.parse(p.sources.address.at)>Date.parse(p.sources.acceptance.at))throw Error('PROGRAM_CUSTOMER_CONFIRMATION_UNVERIFIED');
 for(const [r,row] of deliveries)if(r.key.fromMe!==true||nativeText(r)!==s.open(row.body)||![r.status,...(r.MessageUpdate||[]).map(u=>u.status)].some(v=>['DELIVERY_ACK','READ','PLAYED'].includes(v)))throw Error('PROGRAM_NATIVE_DELIVERY_MISMATCH');
 for(const src of Object.values(p.sources)){
  const eventRow=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(src.id,p.phone,p.line);if(!eventRow)throw Error('PROGRAM_SOURCE_SCOPE');
  const event=s.open(eventRow.body),native=await nativeMessage(s,t,c,src.id,p.phone,p.line),m=native.message?.ephemeralMessage?.message??native.message??{},ctx=m.extendedTextMessage?.contextInfo??native.contextInfo??{};
  if(event.text!==src.text||event.at!==Date.parse(src.at)||event.forwarded||native.key.fromMe!==false||nativeText(native)!==src.text||Number(native.messageTimestamp)*1000!==event.at||ctx.isForwarded||ctx.forwardingScore>0||src===p.sources.petPresence&&(event.quotedId||ctx.stanzaId||confirmedPetMention(event)?.text!==p.petPresence))throw Error('PROGRAM_NATIVE_FACT_MISMATCH');
 }
 if(typeof t.currentCustomerActivity!=='function')throw Error('PROGRAM_CUSTOMER_CONTEXT_UNVERIFIED');
 const at=Date.parse(p.sources.acceptance.at),latest=await t.currentCustomerActivity(p.phone,at,{store:s});
 if(!latest.complete||!latest.sources.some(r=>r.id===p.quote.acceptanceId&&r.line===p.line&&r.at===at))throw Error('PROGRAM_NEW_CUSTOMER_TURN');
 const acceptancePosition=s.db.prepare('SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(p.quote.acceptanceId,p.phone,p.line)?.rowid;
 const verifiedFacts=new Set(Object.values(p.sources).filter(src=>src.id!==p.quote.acceptanceId&&Date.parse(src.at)===at).map(src=>src.id));
 const subsequent=latest.sources.filter(r=>{
  if(r.at!==at)return r.at>at;
  if(r.id===p.quote.acceptanceId)return false;
  // WhatsApp timestamps have second precision. Only an already rechecked fact
  // ingested before this exact acceptance may share its second without being
  // a new turn; unknown, later, forwarded or other-line sources still block.
  const prior=r.line===p.line&&verifiedFacts.has(r.id)&&s.db.prepare("SELECT rowid FROM events WHERE id=? AND phone=? AND line=? AND from_me=0 AND at=? AND state NOT IN ('PENDING','PROCESSING')").get(r.id,p.phone,p.line,at);
  return !prior||!acceptancePosition||prior.rowid>=acceptancePosition;
 });
 if(subsequent.length>3)throw Error('PROGRAM_NEW_CUSTOMER_TURN');
 for(const item of subsequent){
  const event=storedCourtesy(s,p,item.id);if(!event||item.line!==p.line||item.at!==event.at)throw Error('PROGRAM_NEW_CUSTOMER_TURN');
  const native=await nativeMessage(s,t,c,item.id,p.phone,p.line),m=native.message?.ephemeralMessage?.message??native.message??{},ctx=m.extendedTextMessage?.contextInfo??native.contextInfo??{};
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
const schedulingPrefix='maria-scheduling-review:';
function persistedSchedulingQuestion(s,c,p,preferredId=null){
 const candidates=[];
 if(s.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tesa_questions'").get()){
  const rows=s.db.prepare("SELECT q.*,o.state delivery,o.mid FROM tesa_questions q LEFT JOIN tesa_outbox o ON o.id=q.outbox_id WHERE q.company=? AND q.case_id=? AND q.customer_phone=? AND q.source_line=? AND q.topic='disponibilidad-y-tecnico' AND q.state IN ('PENDING','ANSWERED','ANSWER_REVIEW') ORDER BY q.rowid").all(c.company,p.caseId,p.phone,p.line);
  for(const q of rows)candidates.push({kind:'tesa',id:q.id,state:q.state,outboxId:q.outbox_id,delivery:q.delivery??null,mid:q.mid??null,recipient:null});
 }
 const privateRows=s.db.prepare("SELECT q.*,o.line delivery_line,o.state delivery,o.mid FROM questions q LEFT JOIN outbox o ON o.id=q.outbox_id WHERE q.case_id=? AND (q.phone=? OR q.state='LEGACY_PENDING' AND (q.phone IS NULL OR q.phone='')) AND (q.topic='disponibilidad-y-tecnico' OR q.state='LEGACY_PENDING') AND q.state IN ('PENDING','ANSWERED','ANSWER_REVIEW','LEGACY_PENDING') ORDER BY q.rowid").all(p.caseId,p.phone);
 for(const q of privateRows)if(q.delivery_line===p.line||q.state==='LEGACY_PENDING'&&!q.outbox_id)candidates.push({kind:'private',id:q.id,state:q.state,outboxId:q.outbox_id,delivery:q.delivery??null,mid:q.mid??null,recipient:q.recipient});
 return candidates.find(q=>q.id===preferredId)||candidates[0]||null;
}
function schedulingMarkerKey(p,requestHash){return schedulingPrefix+registrationHash({caseId:p.caseId,requestHash});}
export function ownSavedPendingOperation(s,c,state,e){
 if(!programEnabled(c)||e?.kind!=='text'||e.fromMe||e.forwarded||!operationalLineAllowed(c,e.line)||e.at<c.mariaProgram.startsAt||!state?.caseId||state.programIntake?.stage!=='registered'||!state.awaitingHumanReview||state.closed||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview||state.requestedProductInquiry||state.pendingFaqQuestion||state.verifiedTesaAnswerSource||Object.keys(state).some(key=>key.startsWith('requestedPayment')&&state[key]))return null;
 const entry=get(s,prefix+state.caseId),conv=s.conversation(e.phone),p=entry?.payload;
 if(!entry||entry.status!=='SAVED'||entry.requestHash!==registrationHash(p)||!receiptValid(c,entry,entry.receipt)||!conv||conv.hold||conv.state.caseId!==state.caseId||p.phone!==e.phone||p.line!==e.line||state.programServiceId!==entry.receipt.orderId||!registrationOperationalScope(s,c,entry))return null;
 const marker=get(s,schedulingMarkerKey(p,entry.requestHash)),pending=persistedSchedulingQuestion(s,c,p);
 if(!(marker?.guard===MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD&&marker.caseId===p.caseId&&marker.requestHash===entry.requestHash)&&!pending||pending?.state==='ANSWERED')return null;
 const row=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(e.id,e.phone,e.line),native=row&&s.open(row.body);
 if(!native||native.text!==e.text||native.at!==e.at||native.id!==e.id||native.phone!==e.phone||native.line!==e.line||native.quotedId!==e.quotedId||native.fromMe||native.forwarded)return null;
 return {entry,marker};
}
export function queueOwnSavedServiceReview(s,c,entry,{motive,text,sourceId}={}){
 const p=entry?.payload,conv=p&&s.conversation(p.phone);
 if(!programEnabled(c)||!p||entry.status!=='SAVED'||entry.requestHash!==registrationHash(p)||!receiptValid(c,entry,entry.receipt)||!conv||conv.hold||conv.state.closed||conv.state.caseId!==p.caseId||conv.state.programServiceId!==entry.receipt.orderId||!registrationOperationalScope(s,c,entry)||!['scheduling-unconfirmed','cancellation-request'].includes(motive)||typeof text!=='string'||!text.trim()||text.length>1600||/bearer\s|api.?key|contrase[nñ]a|token\s*[:=]/i.test(text))return {queued:false,status:'SAVED_REVIEW_SCOPE_REJECTED'};
 const digest=registrationHash({company:c.company,caseId:p.caseId,requestHash:entry.requestHash,motive}),id='chief-report:maria-saved-'+digest+':'+SANDRA,key='maria-saved-review-alert:'+digest,prior=get(s,key),out=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
 if(out){
  if(out.phone!==SANDRA||out.line!==p.line||!out.internal)return {queued:false,status:'SAVED_REVIEW_ALERT_CONFLICT',id};
  return {queued:false,status:'EXISTING_ALERT_PRESERVED',id,state:out.state,mid:out.mid??null};
 }
 if(prior)return {queued:false,status:'DURABLE_ALERT_ATTEMPT_PRESERVED',id,state:prior.status??null,mid:null};
 const ledger={guard:MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD,caseId:p.caseId,requestHash:entry.requestHash,orderId:entry.receipt.orderId,motive,sourceId:sourceId||p.sourceId,recipient:SANDRA,line:p.line,textHash:registrationHash(text),outboxId:id,createdAt:Date.now(),attempts:1,status:'RESERVED'};
 put(s,key,ledger);
 try{
  const added=s.queue(id,SANDRA,p.line,text,true,0),queued=s.db.prepare('SELECT state,mid FROM outbox WHERE id=?').get(id);
  if(!queued)throw Error('SAVED_REVIEW_ALERT_NOT_PERSISTED');
  put(s,key,{...ledger,status:queued.state});s.audit('OWN_SAVED_SERVICE_REVIEW_QUEUED',sourceId||p.sourceId,{guard:ledger.guard,caseId:p.caseId,orderId:ledger.orderId,motive,outboxId:id,recipient:SANDRA,sourceHash:ledger.textHash,businessWriteRetried:false});
  return {queued:Boolean(added),status:added?'ALERT_PREPARED':'EXISTING_ALERT_PRESERVED',id,state:queued.state,mid:queued.mid??null};
 }catch{put(s,key,{...ledger,status:'PREPARATION_FAILED'});return {queued:false,status:'ALERT_PREPARATION_FAILED',id,state:null,mid:null};}
}
function ownSavedCancellationRequest(s,c,entry){
 const p=entry.payload,conv=s.conversation(p.phone),ref=conv?.state.requestedProgramCancellationReview,key='maria-saved-cancellation-request:'+p.caseId+':'+entry.requestHash,marker=get(s,key),guard='own-saved-pending-operation-direct-status-and-cancellation-request-v1';
 if(ref?.guard!==guard||ref.key!==key||ref.state!=='REQUEST'||ref.orderId!==entry.receipt.orderId||marker?.guard!==guard||marker.state!=='REQUEST'||marker.caseId!==p.caseId||marker.phone!==p.phone||marker.line!==p.line||marker.orderId!==entry.receipt.orderId||marker.receiptHash!==entry.requestHash||!Array.isArray(marker.sources)||!marker.sources.length)return null;
 const first=marker.sources[0],row=first?.id&&s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(first.id,p.phone,p.line),native=row&&s.open(row.body);
 if(ref.firstSourceId!==first?.id||!native||native.id!==first.id||native.text!==first.text||native.at!==first.at||native.phone!==p.phone||native.line!==p.line||first.phone!==p.phone||first.line!==p.line||native.kind!=='text'||native.fromMe||native.forwarded||native.quotedId||native.at<c.mariaProgram.startsAt||native.at<Date.parse(p.quote.acceptedAt)||/[¿?"“”«»]|https?:|www\./i.test(native.text))return null;
 const text=normalize(native.text).replace(/^[¿¡\s]+|[?!.¡\s]+$/g,'').replace(/\s+/g,' ').trim(),service='(?:(?:el|mi|este|la|esta) )?(?:servicio|solicitud|fumigacion|visita)';
 if(!new RegExp('^(?:por favor )?(?:cancelalo|cancelelo|cancelenlo|(?:(?:quiero|necesito|solicito|deseo) cancelar|cancela|cancele|cancelen|cancelar) '+service+'|(?:ya )?no (?:quiero|necesito|deseo) '+service+')(?: por favor)?$').test(text))return null;
 return {key,marker,source:first};
}
// Read-only, local revalidation for this new kind of internal alert. The
// transport repeats it after its final await and before reserving a send.
// Existing uncertain/accepted deliveries are never recovered by this guard.
export function savedServiceReviewStillValid(s,c,row,text){
 try{
  const match=/^chief-report:maria-saved-([a-f0-9]{64}):573016803926$/.exec(row?.id||'');
  if(!match||!programEnabled(c)||row.state!=='READY'||row.internal!==1||row.phone!==SANDRA||typeof text!=='string')return false;
  const ledger=get(s,'maria-saved-review-alert:'+match[1]),current=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(row.id);
  if(ledger?.guard!==MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD||ledger.status!=='READY'||ledger.outboxId!==row.id||ledger.recipient!==SANDRA||ledger.line!==row.line||ledger.attempts!==1||!Number.isFinite(ledger.createdAt)||ledger.createdAt>Date.now()||!['scheduling-unconfirmed','cancellation-request'].includes(ledger.motive)||ledger.textHash!==registrationHash(text)||!current||current.state!=='READY'||current.phone!==SANDRA||current.line!==row.line||current.internal!==1||s.open(current.body)!==text||s.open(row.body)!==text)return false;
  const entry=get(s,prefix+ledger.caseId),p=entry?.payload,conv=p&&s.conversation(p.phone);
  if(!entry||entry.status!=='SAVED'||entry.requestHash!==ledger.requestHash||entry.requestHash!==registrationHash(p)||!receiptValid(c,entry,entry.receipt)||entry.receipt.orderId!==ledger.orderId||p.line!==row.line||!registrationOperationalScope(s,c,entry)||!conv||conv.hold||conv.state.closed||conv.state.caseId!==p.caseId||conv.state.programIntake?.stage!=='registered'||conv.state.programServiceId!==ledger.orderId||!conv.state.awaitingHumanReview)return false;
  if(registrationHash({company:c.company,caseId:p.caseId,requestHash:entry.requestHash,motive:ledger.motive})!==match[1])return false;
  const pendingStaff=s.db.prepare("SELECT id,line,body FROM events WHERE phone=? AND from_me=1 AND state IN ('PENDING','PROCESSING')").all(p.phone);
  for(const staff of pendingStaff){
   const echo=s.db.prepare("SELECT body FROM outbox WHERE mid=? AND phone=? AND line=? AND state IN ('ACCEPTED','DELIVERED','READ')").get(staff.id,p.phone,staff.line),native=s.open(staff.body);
   if(!echo||native.id!==staff.id||native.phone!==p.phone||native.line!==staff.line||native.fromMe!==true||native.kind!=='text'||native.text!==s.open(echo.body))return false;
  }
  const cancellation=ownSavedCancellationRequest(s,c,entry);
  if(ledger.motive==='cancellation-request')return Boolean(cancellation&&cancellation.source.id===ledger.sourceId&&cancellation.marker.alertId===row.id);
  if(ledger.sourceId!==p.sourceId)return false;
  if(cancellation||conv.state.verifiedTesaAnswerSource||conv.state.requestedAfterServiceReview||conv.state.requestedControlReview||conv.state.requestedDocumentReview)return false;
  const marker=get(s,schedulingMarkerKey(p,entry.requestHash));
  if(marker?.guard!==MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD||marker.caseId!==p.caseId||marker.phone!==p.phone||marker.line!==p.line||marker.requestHash!==entry.requestHash||marker.orderId!==entry.receipt.orderId||marker.exceptionOutboxId!==row.id||!['DIRECTION_REVIEW_PREPARED','EXISTING_DIRECTION_REVIEW_PRESERVED'].includes(marker.status))return false;
  const linked=persistedSchedulingQuestion(s,c,p,marker.linkedQuestion?.id);
  return linked?.state!=='ANSWERED';
 }catch{return false;}
}
function queueSchedulingException(s,c,entry,marker,reason){
 const p=entry.payload,conv=s.conversation(p.phone);
 if(!conv||conv.hold||conv.state.closed||conv.state.caseId!==p.caseId||conv.state.programServiceId!==entry.receipt.orderId||!registrationOperationalScope(s,c,entry))return {...marker,status:'REVIEW_SUPPRESSED',reason};
 const recipients=questionRecipients(c,'program-registration-review');
 if(recipients.length!==1||recipients[0]!==SANDRA)return {...marker,status:'DIRECTION_ROUTE_UNVERIFIED',reason};
 const result=queueOwnSavedServiceReview(s,c,entry,{motive:'scheduling-unconfirmed',sourceId:p.sourceId,text:c.bot+' · FUMIGACIÓN. La solicitud '+entry.receipt.orderId.slice(0,8).toUpperCase()+' (cliente …'+p.phone.slice(-4)+', línea …'+p.line.slice(-4)+') quedó registrada. Aún no tengo confirmado el horario del servicio y falta coordinar técnico y disponibilidad. ¿Quién puede coordinar esta solicitud?'});
 return {...marker,status:result.status==='ALERT_PREPARED'?'DIRECTION_REVIEW_PREPARED':['EXISTING_ALERT_PRESERVED','DURABLE_ALERT_ATTEMPT_PRESERVED'].includes(result.status)?'EXISTING_DIRECTION_REVIEW_PRESERVED':'DIRECTION_REVIEW_PREPARATION_FAILED',reason,exceptionOutboxId:result.id??null,exceptionDelivery:result.state??null,escalatedAt:Date.now()};
}
function recordSavedSchedulingRoute(s,c,entry,routed,error=null){
 const p=entry.payload,key=schedulingMarkerKey(p,entry.requestHash),prior=get(s,key);
 if(prior)return prior;
 const linked=persistedSchedulingQuestion(s,c,p,routed?.id),installation=get(s,'inactivity-followup-installation-v1'),waitMs=installation?.minimumInactiveMs===20*60000?installation.minimumInactiveMs:20*60000;
 let marker={guard:MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD,caseId:p.caseId,phone:p.phone,line:p.line,requestHash:entry.requestHash,orderId:entry.receipt.orderId,acceptanceId:p.quote.acceptanceId,createdAt:Date.now(),waitMs,status:'WAITING_FOR_COORDINATION',linkedQuestion:linked,routeState:typeof routed?.state==='string'?routed.state:error?'ROUTER_FAILED':'NOT_PREPARED'};
 if(!linked||linked.state==='LEGACY_PENDING')marker=queueSchedulingException(s,c,entry,marker,error?'ROUTER_FAILED':'NO_PERSISTED_OPERATIONAL_QUESTION');
 put(s,key,marker);s.audit('OWN_SERVICE_SCHEDULING_ROUTE_RECORDED',p.sourceId,{guard:marker.guard,caseId:p.caseId,orderId:entry.receipt.orderId,status:marker.status,linkedQuestionId:linked?.id??null,exceptionQuestionId:marker.exceptionQuestionId??null,businessWritten:true,operationalQuestionRetried:false});
 return marker;
}
function reviewSavedSchedulingRoutes(s,c){
 const now=Date.now(),rows=s.db.prepare('SELECT key,value FROM meta WHERE key LIKE ?').all(schedulingPrefix+'%');let escalated=0;
 for(const row of rows){const marker=s.open(row.value);
  if(marker.guard!==MARIA_PROGRAM_SCHEDULING_REVIEW_GUARD||marker.status!=='WAITING_FOR_COORDINATION'||!Number.isFinite(marker.createdAt)||marker.createdAt>now||marker.waitMs!==20*60000||now-marker.createdAt<marker.waitMs)continue;
  const entry=get(s,prefix+marker.caseId),p=entry?.payload,conv=p&&s.conversation(p.phone);
  if(!entry||entry.status!=='SAVED'||entry.requestHash!==registrationHash(p)||!receiptValid(c,entry,entry.receipt)||entry.requestHash!==marker.requestHash||entry.receipt.orderId!==marker.orderId||p.phone!==marker.phone||p.line!==marker.line||p.quote.acceptanceId!==marker.acceptanceId||!registrationOperationalScope(s,c,entry)||!conv||conv.hold||conv.state.closed||conv.state.caseId!==p.caseId||conv.state.programServiceId!==marker.orderId||conv.state.programIntake?.stage!=='registered'||!conv.state.awaitingHumanReview)continue;
  const cancellation=ownSavedCancellationRequest(s,c,entry);
  if(cancellation){put(s,row.key,{...marker,status:'CANCELLATION_REVIEW',cancellationMarkerKey:cancellation.key,checkedAt:now});continue;}
  const linked=persistedSchedulingQuestion(s,c,p,marker.linkedQuestion?.id);
  if(linked&&linked.id!==marker.linkedQuestion?.id)continue;
  if(linked?.state==='ANSWERED'){put(s,row.key,{...marker,status:'ANSWER_OBSERVED',checkedAt:now,linkedQuestion:linked});continue;}
  if(linked?.kind==='private'&&linked.recipient===SANDRA){put(s,row.key,{...marker,status:'EXISTING_DIRECTION_REVIEW_PRESERVED',checkedAt:now,linkedQuestion:linked});continue;}
  const updated=queueSchedulingException(s,c,entry,{...marker,linkedQuestion:linked},'SCHEDULING_UNCONFIRMED_AFTER_20_MINUTES');put(s,row.key,updated);
  s.audit('OWN_SERVICE_SCHEDULING_WAIT_REVIEW',p.sourceId,{guard:marker.guard,caseId:p.caseId,orderId:marker.orderId,status:updated.status,exceptionQuestionId:updated.exceptionQuestionId??null,businessWritten:true,operationalQuestionRetried:false});escalated++;
 }
 return escalated;
}
function saved(s,c,key,entry,r,routeQuestion){
 s.tx(()=>{
  const p=entry.payload,planning=staffPlanningRecord(s,entry),active=sameCurrent(s,entry)&&registrationOperationalScope(s,c,entry)&&(!entry.staffPlanning||Boolean(planning));put(s,key,{...entry,status:'SAVED',receipt:r,savedAt:Date.now()});
  const conv=s.conversation(p.phone);if(conv?.state.caseId===p.caseId){conv.state.programIntake={...conv.state.programIntake,stage:'registered'};conv.state.programServiceId=r.orderId;if(planning)conv.state.staffAssignment={guard:MARIA_STAFF_PLANNING_GUARD,status:'PENDING_INTERNAL_ASSIGNMENT',orderId:r.orderId,receiptHash:entry.requestHash,requestedTiming:planning.requestedTiming,preferenceSourceId:planning.preferenceSourceId};s.saveConversation(p.phone,conv.state);}
  const authorship=s.caseAuthorship(p.caseId);if(authorship)s.db.prepare('UPDATE case_authorship SET body=? WHERE case_id=?').run(s.seal({...authorship,creatorCreditWritten:true,programServiceId:r.orderId,programCreatorMembershipId:r.advisorMembershipId,programReceiptHash:r.requestHash,serviceCompleted:false}),p.caseId);
  s.audit('OWN_SERVICE_REGISTRATION_SAVED',p.sourceId,{caseId:p.caseId,orderId:r.orderId,createdById:r.advisorMembershipId,requestHash:r.requestHash,scheduled:r.scheduled===true,paymentRecorded:false,confirmationSuppressed:!active});
  if(active&&planning){s.queue('program:'+p.caseId+':saved',p.phone,p.line,staffPlanningSavedText({...entry,receipt:r}),false,conv.revision,p.caseId);s.audit('OWN_ACCEPTED_REQUEST_PENDING_STAFF_ASSIGNMENT',p.sourceId,{guard:MARIA_STAFF_PLANNING_GUARD,caseId:p.caseId,orderId:r.orderId,preferenceSourceId:planning.preferenceSourceId,scheduled:r.scheduled===true,assignmentRequested:true,newTesaQuestion:false});}
  else if(active&&!entry.staffPlanning){const preference=conv.state.slots.preference;s.queue('program:'+p.caseId+':saved',p.phone,p.line,'Tu solicitud de servicio de '+p.slots.service+' por $'+p.quote.priceCop.toLocaleString('es-CO')+' quedó registrada a nombre de '+p.customerName+' en '+p.address+', '+p.municipality+'. El horario aún está pendiente de confirmación.'+(preference?'':' ¿Qué día y franja horaria prefieres?'),false,conv.revision,p.caseId);
   if(preference){
    const question={phone:p.phone,line:p.line,caseId:p.caseId,topic:'disponibilidad-y-tecnico',conditions:{...conv.state.slots,quotedPriceCop:p.quote.priceCop,priceSource:selectBusinessPrice(p.slots,{scheduleHash:p.quote.scheduleHash}).entry?.source.quoteId,programServiceId:r.orderId},recipients:questionRecipients(c,'disponibilidad-y-tecnico'),source:p.sourceId,text:c.name+': solicitud ordinaria guardada, servicio '+p.slots.service+' en '+p.municipality+'. Precio aceptado $'+p.quote.priceCop+'. Pendiente de programación. ¿Qué disponibilidad y técnico corresponden a este caso?'};
    let routed=null,routeError=null;
    try{
     if(typeof routeQuestion!=='function'&&c.tesaOperations?.enabled)throw Error('PROGRAM_OPERATIONAL_ROUTER_REQUIRED');
     routed=typeof routeQuestion==='function'?routeQuestion(s,c,question):s.questionToRecipients(question);
     if(routed?.then)throw Error('PROGRAM_OPERATIONAL_ROUTER_MUST_BE_SYNC');
     const linked=persistedSchedulingQuestion(s,c,p,routed?.id);
     if(linked?.kind==='tesa'&&linked.id===routed?.id&&routed?.created){prepareRegisteredTesaContinuation(s,c,question,{...routed,outboxId:linked.outboxId});conv.state.pendingTesaQuestionId=linked.id;}
    }catch(error){
     routeError=error;
     // The verified program receipt is durable even if consultation routing
     // fails. This is a scheduling review, never an uncertain business write.
     s.audit('OWN_SERVICE_SCHEDULING_ROUTE_REVIEW',p.sourceId,{caseId:p.caseId,orderId:r.orderId,businessWritten:true,questionSent:false});
    }
    conv.state.awaitingHumanReview=true;s.saveConversation(p.phone,conv.state);
    const marker=recordSavedSchedulingRoute(s,c,{...entry,status:'SAVED',receipt:r},routed,routeError);
    if(marker.status!=='WAITING_FOR_COORDINATION'){
     const confirmation=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state='READY'").get('program:'+p.caseId+':saved',p.phone,p.line);
     if(confirmation)s.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(s.seal(s.open(confirmation.body).replace('El horario aún está pendiente de confirmación.','Aún no tengo confirmado el horario del servicio.')),confirmation.id);
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
  if(entry.staffPlanning&&!staffPlanningRecord(s,entry)){review(s,c,row.key,entry,'STAFF_PLANNING_SOURCE_UNVERIFIED');reviewed++;continue;}
  if(entry.payload.clientSchedule&&!clientRequestedScheduleEnabled(c,entry.staffPlanning?.caseSourceAt)){review(s,c,row.key,entry,'CLIENT_REQUESTED_SCHEDULE_DISABLED');reviewed++;continue;}
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
 const schedulingEscalated=reviewSavedSchedulingRoutes(s,c);
 return {enabled:true,persisted,reviewed,deferred,schedulingEscalated};
}
