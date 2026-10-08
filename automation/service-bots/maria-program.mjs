import {createHash} from 'node:crypto';
import {normalize,questionRecipients} from './config.mjs';
import {BUSINESS_PRICE_HASH,selectBusinessPrice} from './business-prices.mjs';

export const MARIA_PROGRAM_GUARD='own-accepted-new-service-summary-and-atomic-receipt-v1';
export const MARIA_TENANT='9ffea9df-1e06-4590-acec-0e5cde715ba9';
export const MARIA_COMPANY='35a19d89-15d1-4c32-8353-3471b6d9f0ff';
const setupKey='maria-program-setup',prefix='maria-registration:';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const iso=v=>new Date(v).toISOString();
const get=(s,key)=>{const row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?s.open(row.value):null;};
const put=(s,key,value)=>s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,s.seal(value));
export function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
export const registrationHash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function validated(body,company){
 if(company!=='fumigacion'||body?.enabled!==true||!uuid.test(body.actorId||'')||typeof body.token!=='string'||! /^[A-Za-z0-9_-]{40,150}$/.test(body.token))throw Error('OWN_PROGRAM_CONFIGURATION_REQUIRED');
 const u=new URL(body.url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/integrations/maria-service-registration'))throw Error('OWN_PROGRAM_HTTPS_REQUIRED');
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
 return {guard:MARIA_PROGRAM_GUARD,configured:c.company==='fumigacion'&&c.mariaProgram?.enabled===true,enabled:programEnabled(c),company:'FUMIGACION',tenantId:c.mariaProgram?.enabled?MARIA_TENANT:null,companyId:c.mariaProgram?.enabled?MARIA_COMPANY:null,advisorMembershipId:c.mariaProgram?.actorId||null,registrationKind:'new-service-pending-scheduling',saved:entries.filter(r=>r.status==='SAVED').length,uncertain:entries.filter(r=>['UNCERTAIN','SENDING'].includes(r.status)).length,review:entries.filter(r=>r.status==='REVIEW').length,scheduled:false,paymentsEnabled:false,fullyAutonomous:false};
}
const confirms=t=>/^(?:si|listo|dale|acepto|de acuerdo|confirmo|correcto|esta bien|perfecto|si esta bien|si confirmo|si acepto|todo correcto|si todo correcto|si correcto|listo esta bien|ok|okay)$/.test(normalize(t).replace(/[.!¡,]+/g,' ').replace(/\s+/g,' ').trim());
function literalName(text,prompted){
 const explicit=text.match(/^(?:mi nombre (?:es|completo es)|me llamo|a nombre de)\s+(.+)$/i);
 const name=(explicit?.[1]||(prompted?text:'' )).trim().replace(/[.!]+$/,'').trim();
 if(!/^[\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){1,9}$/u.test(name)||/\b(?:quiero|necesito|gracias|servicio|manana|hoy|cucarachas|refuerzo|garantia|no|si|nombre)\b/.test(normalize(name)))return null;return name;
}
function literalAddress(text,prompted){
 const explicit=text.match(/^(?:mi direccion (?:es|completa es)|la direccion es|direccion)\s*[: ,]+(.+)$/i);
 const address=(explicit?.[1]||(prompted?text:'')).trim();
 if(address.length<5||address.length>500||/[?¿]|https?:|\b(?:cambiar|no se|todavia|no recuerdo|otra direccion)\b/i.test(address))return null;
 if(!/\b(?:calle|carrera|cra|cr|cl|cll|avenida|av|diagonal|transversal|dg|tv)\b.*\d.*\d/i.test(address)&&!(/\b(?:vereda|finca)\b/i.test(address)&&address.split(/\s+/).length>=4))return null;return address;
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
 const state=decision.state,own=eligibleQuote(s,state,e.phone,e.line);
 if(!own||state.requestedAfterServiceReview||state.requestedControlReview||state.requestedDocumentReview||decision.courtesy)return null;
 const prior=state.programIntake||{stage:'name',originalQuoteAcceptanceId:own.q.acceptanceSource};
 if(['pending','review','declined'].includes(prior.stage))return {state,observed:true,observedState:'PROGRAM_REGISTRATION_PENDING'};
 if(prior.stage==='registered')return null;
 const pi={...prior};state.programIntake=pi;
 if(/\b(?:no (?:gracias|quiero|deseo|necesito|me interesa|acepto)|prefiero no|cancela|cancelar)\b/.test(normalize(e.text))){
  pi.stage='declined';pi.preview=null;state.closed=true;state.quotedPrice={...state.quotedPrice,accepted:false};
  return {state,reply:'Entendido. No registraré el servicio. Gracias por avisarme.'};
 }
 if(/^no\b/.test(normalize(e.text))&&['confirm','correction'].includes(prior.stage)){
  pi.stage='correction';pi.preview=null;pi.promptId=e.id+':reply';return {state,reply:'¿Qué dato debemos corregir antes de registrar tu solicitud?'};
 }
 if(blockedText(e.text))return null;
 // Name/address are literal replies to this case's own delivered prompt, or explicitly labelled facts.
 const prompt=pi.promptId&&s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ')").get(pi.promptId,e.phone,e.line);
 const name=!confirms(e.text)&&literalName(e.text,pi.stage==='name'&&Boolean(prompt)),address=literalAddress(e.text,(['address','confirm','correction'].includes(pi.stage)&&Boolean(prompt)));
 if(address&&changedAddressScope(address,state.slots)){
  pi.stage='review';pi.preview=null;return {state,reviewTopic:'special-quotation',reviewConditions:{kind:'registration-address-scope-changed',caseId:state.caseId},review:'La dirección o su texto añaden un municipio o alcance diferente a la cotización aceptada. No se creó un servicio ni se conservó ese precio para otro alcance.',reviewQuestion:'¿Qué municipio y alcance comprobados corresponden a esta solicitud?',reply:'Los datos que compartiste cambian el alcance de la cotización. Tu solicitud necesita revisión antes de confirmarla.'};
 }
 let changed=false;
 if(name&&name!==pi.customerName){pi.customerName=name;pi.nameSource=source(e);changed=true;}
 if(address&&address!==pi.address){pi.address=address;pi.addressSource=source(e);changed=true;}
 if(!pi.customerName){pi.stage='name';if(pi.promptId&&!prompt)return {state,observed:true,observedState:'PROGRAM_NAME_DELIVERY_PENDING'};pi.promptId=e.id+':reply';return {state,reply:prompt?'Me falta tu nombre y apellido para registrar la solicitud. ¿Me los compartes?':'Para registrar tu solicitud, ¿cuál es tu nombre completo?'};}
 if(!pi.address){pi.stage='address';if(prior.stage==='address'&&pi.promptId&&!prompt)return {state,observed:true,observedState:'PROGRAM_ADDRESS_DELIVERY_PENDING'};pi.promptId=e.id+':reply';return {state,reply:prompt&&prior.stage==='address'?'Me falta la dirección con calle o carrera y número, incluido apartamento o interior si aplica. ¿Me la compartes?':'¿Cuál es la dirección completa del servicio, incluido apartamento o interior si aplica?'};}
 if(prior.stage==='correction'&&!changed)return {state,reply:'¿Cuál es el dato correcto que debemos cambiar?'};
 if(prior.stage!=='confirm'||changed){
  pi.stage='confirm';pi.promptId=e.id+':reply';pi.preview={customerName:pi.customerName,address:pi.address,municipality:state.slots.location,service:state.slots.service,priceCop:own.entry.priceCop};
  return {state,reply:'Registraré el servicio de '+state.slots.service+' por $'+own.entry.priceCop.toLocaleString('es-CO')+' en '+pi.address+', '+state.slots.location+', a nombre de '+pi.customerName+'. ¿Confirmas que estos datos son correctos?'};
 }
 if(!prompt||!confirms(e.text))return {state,observed:true,observedState:'PROGRAM_SUMMARY_CONFIRMATION_PENDING'};
 if(JSON.stringify(pi.preview)!==JSON.stringify({customerName:pi.customerName,address:pi.address,municipality:state.slots.location,service:state.slots.service,priceCop:own.entry.priceCop}))return {state,observed:true,observedState:'PROGRAM_SUMMARY_REVIEW'};
 const conv=s.conversation(e.phone),allowed=['service','site','location','area','rooms','mattresses','patio','floors','roomScale','siteScale','treatmentScope','affectedFurniture'];
 const slots=Object.fromEntries(allowed.filter(k=>state.slots[k]!=null).map(k=>[k,String(state.slots[k])]));
 const payload={caseId:state.caseId,phone:e.phone,line:e.line,sourceId:e.id,customerName:pi.customerName,address:pi.address,municipality:state.slots.location,locationDetails:String(state.slots.locationDetails||''),slots,
  quote:{entryId:own.entry.id,priceCop:own.entry.priceCop,scheduleHash:BUSINESS_PRICE_HASH,mid:own.row.mid,sourceId:own.q.sourceId,deliveredAt:iso(own.row.firstDeliveryAt),acceptedAt:iso(e.at),acceptanceId:e.id},
  sources:{customerName:pi.nameSource,address:pi.addressSource,acceptance:{...source(e),phone:e.phone,line:e.line,fromMe:false,forwarded:false}}};
 const key=prefix+state.caseId,existing=get(s,key),hash=registrationHash(payload);
 if(existing){if(existing.requestHash!==hash)throw Error('PROGRAM_CASE_ALREADY_RESERVED');return {state,observed:true,observedState:'PROGRAM_REGISTRATION_PENDING'};}
 put(s,key,{status:'PENDING',payload,requestHash:hash,revision:conv.revision,summaryOutboxId:pi.promptId,createdAt:Date.now()});pi.stage='pending';pi.acceptanceId=e.id;
 s.audit('OWN_SERVICE_REGISTRATION_PREPARED',e.id,{caseId:state.caseId,requestHash:hash,priceCop:own.entry.priceCop,businessWritten:false,summaryOutboxId:pi.promptId});
 return {state,observed:true,observedState:'PROGRAM_REGISTRATION_PENDING'};
}
function receiptValid(c,entry,r){return ownScope(c,r)&&r.persisted===true&&uuid.test(r.orderId||'')&&r.caseId===entry.payload.caseId&&r.acceptanceId===entry.payload.quote.acceptanceId&&r.requestHash===entry.requestHash&&r.state==='NUEVO'&&r.scheduled===false&&r.paymentRecorded===false;}
async function nativeMessage(t,c,id,phone,line){
 const l=c.lines.find(x=>x.phone===line);if(!l||typeof t.request!=='function')throw Error('PROGRAM_NATIVE_RECHECK_REQUIRED');
 const response=await t.request(l,'/chat/findMessages/'+encodeURIComponent(l.instance),{where:{key:{id}},offset:10,page:1});
 const matches=(response.messages?.records||[]).filter(r=>r.key?.id===id&&(r.key.remoteJid===phone+'@s.whatsapp.net'||r.key.remoteJidAlt===phone+'@s.whatsapp.net'));
 if(matches.length!==1)throw Error('PROGRAM_NATIVE_SOURCE_NOT_UNIQUE');return matches[0];
}
function nativeText(r){const m=r.message?.ephemeralMessage?.message??r.message??{};return m.conversation??m.extendedTextMessage?.text;}
async function verifyNative(s,c,t,entry){
 const p=entry.payload,own=eligibleQuote(s,s.conversation(p.phone).state,p.phone,p.line);if(!own||own.q.sourceId!==p.quote.sourceId)throw Error('PROGRAM_PRICE_CHANGED');
 await t.verifyLine(p.line);
 const attention=await t.currentAttention(p.phone);if(!attention.complete)throw Error('PROGRAM_ATTENTION_UNVERIFIED');
 const unknown=attention.sources.find(a=>!s.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(a.id,p.phone,a.line));
 if(unknown){s.hold(p.phone,unknown.id);throw Error('PROGRAM_HUMAN_TAKEOVER');}
 const quote=await nativeMessage(t,c,p.quote.mid,p.phone,p.line),summary=s.db.prepare("SELECT * FROM outbox WHERE id=? AND phone=? AND line=? AND state IN ('DELIVERED','READ') AND mid IS NOT NULL").get(entry.summaryOutboxId,p.phone,p.line);
 if(!summary)throw Error('PROGRAM_SUMMARY_DELIVERY_UNVERIFIED');
 const preview=await nativeMessage(t,c,summary.mid,p.phone,p.line);
 for(const [r,row] of [[quote,own.row],[preview,summary]])if(r.key.fromMe!==true||nativeText(r)!==s.open(row.body)||![r.status,...(r.MessageUpdate||[]).map(u=>u.status)].some(v=>['DELIVERY_ACK','READ','PLAYED'].includes(v)))throw Error('PROGRAM_NATIVE_DELIVERY_MISMATCH');
 for(const src of Object.values(p.sources)){
  const eventRow=s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(src.id,p.phone,p.line);if(!eventRow)throw Error('PROGRAM_SOURCE_SCOPE');
  const event=s.open(eventRow.body),native=await nativeMessage(t,c,src.id,p.phone,p.line),m=native.message?.ephemeralMessage?.message??native.message??{},ctx=m.extendedTextMessage?.contextInfo??native.contextInfo??{};
  if(event.text!==src.text||event.at!==Date.parse(src.at)||event.forwarded||native.key.fromMe!==false||nativeText(native)!==src.text||Number(native.messageTimestamp)*1000!==event.at||ctx.isForwarded||ctx.forwardingScore>0)throw Error('PROGRAM_NATIVE_FACT_MISMATCH');
 }
 if(typeof t.currentCustomerActivity!=='function')throw Error('PROGRAM_CUSTOMER_CONTEXT_UNVERIFIED');
 const at=Date.parse(p.sources.acceptance.at),latest=await t.currentCustomerActivity(p.phone,at);
 if(!latest.complete||!latest.sources.some(r=>r.id===p.quote.acceptanceId&&r.line===p.line&&r.at===at)||latest.sources.some(r=>r.at>at||r.at===at&&r.id!==p.quote.acceptanceId))throw Error('PROGRAM_NEW_CUSTOMER_TURN');
}
function sameCurrent(s,entry){const p=entry.payload,c=s.conversation(p.phone);return c&&!c.hold&&c.revision===entry.revision&&c.state.caseId===p.caseId&&c.state.programIntake?.stage==='pending'&&!c.state.awaitingHumanReview&&!s.db.prepare("SELECT 1 FROM events WHERE phone=? AND state='PENDING'").get(p.phone);}
function review(s,c,key,entry,reason){s.tx(()=>{
 const p=entry.payload;put(s,key,{...entry,status:'REVIEW',reason,reviewAt:Date.now()});const conv=s.conversation(p.phone);
 if(conv?.state.caseId===p.caseId){conv.state.programIntake={...conv.state.programIntake,stage:'review'};conv.state.awaitingHumanReview=true;s.saveConversation(p.phone,conv.state);}
 s.audit('OWN_SERVICE_REGISTRATION_REVIEW',p.sourceId,{caseId:p.caseId,reason,businessWritten:entry.status==='SAVED'});
 // A new technical exception goes to direction once, with its own persisted question.
 // A takeover itself needs no duplicate notification or customer interruption.
 if(conv&&!conv.hold&&conv.state.caseId===p.caseId){
  s.questionToRecipients({phone:p.phone,line:p.line,caseId:p.caseId,topic:'program-registration-review',conditions:{caseId:p.caseId,requestHash:entry.requestHash},recipients:questionRecipients(c,'program-registration-review'),source:p.sourceId,text:c.name+': solicitud aceptada del contacto '+p.phone+', precio $'+p.quote.priceCop+'. El guardado necesita revisión ('+reason+'); no se reintentó la escritura. No hay horario ni pago confirmados. ¿Cómo debemos continuar con este registro?'});
  s.queue('program:'+p.caseId+':review',p.phone,p.line,'Gracias. Tu solicitud queda pendiente de confirmación.',false,conv.revision,p.caseId);
 }
});}
function saved(s,c,key,entry,r){
 s.tx(()=>{
  const p=entry.payload,active=sameCurrent(s,entry);put(s,key,{...entry,status:'SAVED',receipt:r,savedAt:Date.now()});
  const conv=s.conversation(p.phone);if(conv?.state.caseId===p.caseId){conv.state.programIntake={...conv.state.programIntake,stage:'registered'};conv.state.programServiceId=r.orderId;s.saveConversation(p.phone,conv.state);}
  const authorship=s.caseAuthorship(p.caseId);if(authorship)s.db.prepare('UPDATE case_authorship SET body=? WHERE case_id=?').run(s.seal({...authorship,creatorCreditWritten:true,programServiceId:r.orderId,programCreatorMembershipId:r.advisorMembershipId,programReceiptHash:r.requestHash,serviceCompleted:false}),p.caseId);
  s.audit('OWN_SERVICE_REGISTRATION_SAVED',p.sourceId,{caseId:p.caseId,orderId:r.orderId,createdById:r.advisorMembershipId,requestHash:r.requestHash,scheduled:false,paymentRecorded:false,confirmationSuppressed:!active});
  if(active){const preference=conv.state.slots.preference;s.queue('program:'+p.caseId+':saved',p.phone,p.line,'Tu solicitud de servicio quedó registrada. El horario aún está pendiente de confirmación.'+(preference?'':' ¿Qué día y franja horaria prefieres?'),false,conv.revision,p.caseId);
   if(preference){s.questionToRecipients({phone:p.phone,line:p.line,caseId:p.caseId,topic:'disponibilidad-y-tecnico',conditions:{...conv.state.slots,quotedPriceCop:p.quote.priceCop,programServiceId:r.orderId},recipients:questionRecipients(c,'disponibilidad-y-tecnico'),source:p.sourceId,text:c.name+': solicitud guardada '+r.orderId+'. Contacto '+p.phone+'. Precio aceptado $'+p.quote.priceCop+'. Preferencia: '+preference+'. Dirección: '+p.address+', '+p.municipality+'. Pendiente de programación. ¿Qué disponibilidad y técnico corresponden a este caso?'});conv.state.awaitingHumanReview=true;s.saveConversation(p.phone,conv.state);}
  }
 });
}
export async function drainProgramRegistrations(s,c,t){
 if(!programEnabled(c))return {enabled:false};
 const rows=s.db.prepare('SELECT key,value FROM meta WHERE key LIKE ? ORDER BY key').all(prefix+'%');let persisted=0,reviewed=0;
 for(const row of rows){let entry=s.open(row.value);if(!['PENDING','SENDING','UNCERTAIN'].includes(entry.status))continue;
  if(['SENDING','UNCERTAIN'].includes(entry.status)){
   if(entry.nextReceiptAt>Date.now())continue;
   try{const r=await request(c,'/receipt',{caseId:entry.payload.caseId,acceptanceId:entry.payload.quote.acceptanceId},t.fetcher);if(receiptValid(c,entry,r)){saved(s,c,row.key,entry,r);persisted++;}else if(ownScope(c,r)&&r.persisted===false){review(s,c,row.key,entry,'UNCERTAIN_WRITE_NOT_FOUND');reviewed++;}else throw Error('PROGRAM_RECEIPT_SCOPE_UNVERIFIED');}
   catch{const failures=(entry.receiptFailures||0)+1;entry={...entry,receiptFailures:failures,nextReceiptAt:Date.now()+60000};put(s,row.key,entry);s.audit('OWN_REGISTRATION_RECEIPT_UNAVAILABLE',entry.payload.sourceId,{caseId:entry.payload.caseId,writeRetried:false});if(failures>=3){review(s,c,row.key,entry,'UNCERTAIN_RECEIPT_REQUIRES_REVIEW');reviewed++;}}continue;
  }
  if(!sameCurrent(s,entry)){review(s,c,row.key,entry,'CASE_CHANGED_BEFORE_WRITE');reviewed++;continue;}
  try{await verifyNative(s,c,t,entry);if(!sameCurrent(s,entry)||!programEnabled(c))throw Error('CASE_CHANGED_BEFORE_WRITE');}catch{review(s,c,row.key,entry,'NATIVE_CONTEXT_NOT_VERIFIED');reviewed++;continue;}
  s.tx(()=>{entry={...entry,status:'SENDING',attemptedAt:Date.now()};put(s,row.key,entry);s.audit('OWN_SERVICE_REGISTRATION_RESERVED',entry.payload.sourceId,{caseId:entry.payload.caseId,requestHash:entry.requestHash});});
  try{const r=await request(c,'',entry.payload,t.fetcher);if(!receiptValid(c,entry,r))throw Error('PROGRAM_RECEIPT_MISMATCH');saved(s,c,row.key,entry,r);persisted++;}
  catch{put(s,row.key,{...entry,status:'UNCERTAIN'});s.audit('OWN_REGISTRATION_WRITE_UNCERTAIN',entry.payload.sourceId,{caseId:entry.payload.caseId,writeRetried:false});}
 }
 return {enabled:true,persisted,reviewed};
}
