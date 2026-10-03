import {createHash} from 'node:crypto';
import {normalize,publicTextSafe,SANDRA} from './config.mjs';

export const FAQ_AUTHORITY='direct-user-20261003-common-questions-duration-products-toxicity';
export const FAQ_TOPICS=['duration','treatment','safety','preparation','cleaning','inclusions','reinforcement','warranty'];
export const faqTopicLabel=topic=>({duration:'la duración de la visita',treatment:'el tratamiento y los productos',safety:'las precauciones y el regreso al inmueble',preparation:'la preparación del lugar',cleaning:'la limpieza posterior',inclusions:'lo que incluye el servicio',reinforcement:'los refuerzos',warranty:'las condiciones de garantía'}[topic]||'esa pregunta');
const patterns={
  duration:/\b(?:cuanto (?:tiempo )?(?:dura|tarda|se demora)|duracion (?:del servicio|de la visita)|tiempo (?:del servicio|de la visita)|cuanto se demoran)\b/,
  treatment:/\b(?:que (?:productos?|tratamiento|aplican|usan|utilizan)|con que (?:fumigan|tratan)|productos? (?:que|utiliz)|como (?:fumigan|hacen el tratamiento))\b/,
  safety:/\b(?:toxic\w*|inofensiv\w*|mascotas?|ninos?|bebes?|alimentos?|volver (?:a|al)|regresar|reingreso|salir (?:de|del)|quedarme|permanecer|ventilar)\b/,
  preparation:/\b(?:preparar|preparacion|antes (?:del servicio|de la fumigacion)|mover (?:los )?muebles|sacar (?:las )?cosas)\b/,
  cleaning:/\b(?:limpiar|limpieza|lavar|barrer|trapear)\b/,
  inclusions:/\b(?:que incluye|que cubre|incluye (?:el|la))\b/,
  reinforcement:/\b(?:refuerzo\w*|segunda (?:visita|aplicacion)|repetir (?:el|la)|otra aplicacion)\b/,
  warranty:/\b(?:garantia\w*|garantiza\w*|volver (?:las|los) (?:cucarachas|hormigas|roedores))\b/,
};
const priorReference=/\b(?:eso|lo anterior|lo que (?:me )?(?:dij\w*|coment\w*|indic\w*|explic\w*)|me habian|me habias|mismo (?:precio|horario|servicio)|como qued\w*|que qued\w*)\b/;
const exception=/\b(?:intoxic\w*|vomit\w*|maread\w*|mareo\w*|ingiri\w*|ingest\w*|convulsion\w*|dificultad (?:para|al) respirar|no (?:puedo|puede) respirar|embaraz\w*|asma|alergic\w*|dolor|reclamo|queja|cancel\w*|reprogram\w*|devolucion|amenaz\w*|pague|transfer\w*|comprobante)\b/;
export const faqNeedsPersonalReview=text=>exception.test(normalize(text));
export function commonQuestionTopics(text){
  const t=normalize(text);
  const asks=/[?¿]/.test(text)||/\b(?:cuanto|que (?:productos?|tratamiento|aplican|usan|incluye|cubre)|con que|como (?:prepar|fumig|hacen)|es toxico|son toxicos|tengo que salir|puedo (?:volver|regresar|limpiar|quedarme|permanecer)|tiene garantia)\b/.test(t);
  if(!asks||priorReference.test(t)||exception.test(t))return [];
  return FAQ_TOPICS.filter(topic=>patterns[topic].test(t)&&!(topic==='duration'&&/\b(?:efecto|proteccion|garantia|veneno|producto)\b/.test(t)&&!/\b(?:visita|servicio|fumigacion)\b/.test(t)));
}

export function validateApprovedAnswers(document,company){
  const source=document.source,approval=document.approval;
  if(company!=='fumigacion'||document.company!==company||document.kind!=='approved_customer_answers'||document.authorizationSource!==FAQ_AUTHORITY)throw Error('FAQ_AUTHORITY_REQUIRED');
  if(!source||source.nativeVerified!==true||!['573043332213',SANDRA].includes(source.sender)||!['573126944997','573126938721'].includes(source.line)||!/^[A-Za-z0-9_-]{8,100}$/.test(source.id||'')||!/^[A-Za-z0-9_-]{8,100}$/.test(source.questionMid||'')||!Number.isFinite(Date.parse(source.at))||typeof source.originalText!=='string'||!source.originalText.trim()||source.bodyHash!==createHash('sha256').update(source.originalText).digest('hex'))throw Error('FAQ_VERIFIED_SOURCE_REQUIRED');
  if(!approval||approval.reviewed!==true||approval.source!==FAQ_AUTHORITY||!Number.isFinite(Date.parse(approval.at))||Date.parse(approval.at)<Date.parse(source.at)||!Array.isArray(document.entries)||!document.entries.length||document.entries.length>25)throw Error('FAQ_REVIEW_REQUIRED');
  for(const entry of document.entries){
    if(!/^[a-z0-9_-]{3,100}$/.test(entry.id||'')||!Array.isArray(entry.topics)||!entry.topics.length||new Set(entry.topics).size!==entry.topics.length||entry.topics.some(t=>!FAQ_TOPICS.includes(t))||!publicTextSafe(entry.text))throw Error('FAQ_TEXT_AND_TOPICS_REQUIRED');
    const bounds=entry.appliesTo;
    if(!bounds||!['services','sites'].every(k=>Array.isArray(bounds[k])&&bounds[k].length&&bounds[k].every(x=>typeof x==='string'&&x.trim())))throw Error('FAQ_APPLICABILITY_REQUIRED');
    if(!Number.isFinite(Date.parse(entry.reviewAfter||''))||Date.parse(entry.reviewAfter)<=Date.parse(approval.at))throw Error('FAQ_REVIEW_DATE_REQUIRED');
    if(/\b(?:no es toxic\w*|no son toxic\w*|inofensiv\w*|100\s*%?\s*segur\w*|sin (?:ningun )?riesgo|elimina (?:todas|el cien)|garanti\w*.{0,20}de por vida)\b/.test(normalize(entry.text)))throw Error('FAQ_ABSOLUTE_PROMISE_REJECTED');
    if(entry.topics.includes('safety')){
      if(!Array.isArray(bounds.products)||!bounds.products.length||bounds.products.includes('all')||!Array.isArray(entry.safetySources)||!entry.safetySources.length||entry.safetySources.some(s=>!bounds.products.includes(s.product)||!s.sourceId||!/^[a-f0-9]{64}$/.test(s.sha256||'')||s.originalRead!==true))throw Error('FAQ_PRODUCT_SAFETY_SOURCE_REQUIRED');
      if(bounds.products.some(product=>!entry.safetySources.some(s=>s.product===product)))throw Error('FAQ_PRODUCT_SAFETY_SOURCE_REQUIRED');
    }
  }
  return true;
}

export function selectCommonAnswer(text,context,documents,caseId,now=Date.now()){
  const topics=commonQuestionTopics(text);
  if(!topics.length)return null;
  if(/\b(?:precio|cuesta|cuestan|vale|tarifa|descuento|pagar|tarjeta|horario|disponibilidad|tecnico|agendar|factura|certificado)\b/.test(normalize(text)))return {topics,reason:'ADDITIONAL_UNVERIFIED_REQUEST'};
  const latest=new Map();
  for(const document of documents){
    validateApprovedAnswers(document,'fumigacion');
    if(Date.parse(document.approval.at)>now)continue;
    for(const entry of document.entries){
      const old=latest.get(entry.id);
      if(!old||Date.parse(old.document.approval.at)<Date.parse(document.approval.at))latest.set(entry.id,{entry,document});
      else if(Date.parse(old.document.approval.at)===Date.parse(document.approval.at)&&JSON.stringify(old.entry)!==JSON.stringify(entry))return {topics,reason:'CONFLICTING_APPROVAL'};
    }
  }
  const active=[...latest.values()].filter(({entry})=>entry.enabled!==false&&Date.parse(entry.reviewAfter)>now&&(!entry.appliesTo.caseId||entry.appliesTo.caseId===caseId));
  const requestedServices=String(context.service||'').split(/\s+y\s+/).filter(Boolean).map(normalize),site=normalize(context.site||'');
  const products=Array.isArray(context.verifiedProducts)?context.verifiedProducts:[];
  const answered=[],missing=new Set();
  for(const topic of topics){
    const candidates=active.filter(({entry})=>entry.topics.includes(topic));
    const matches=candidates.filter(({entry})=>{
      const b=entry.appliesTo,services=b.services.map(normalize),sites=b.sites.map(normalize);
      if(!services.includes('all')&&!requestedServices.length){missing.add('service');return false;}
      if(!sites.includes('all')&&!site){missing.add('site');return false;}
      if(!services.includes('all')&&requestedServices.some(s=>!services.includes(s)))return false;
      if(!sites.includes('all')&&!sites.includes(site))return false;
      if(b.products?.length&&(!products.length||products.some(p=>!b.products.includes(p)))){missing.add('verifiedProducts');return false;}
      return true;
    });
    if(matches.length!==1)return {topics,reason:matches.length?'AMBIGUOUS_ANSWER':'UNVERIFIED_OR_OUTSIDE_SCOPE',missing:[...missing]};
    answered.push(matches[0]);
  }
  const unique=[...new Map(answered.map(x=>[x.entry.id,x])).values()];
  const answer=unique.map(x=>x.entry.text).join('\n\n');
  if(!publicTextSafe(answer))return {topics,reason:'COMBINED_TEXT_REJECTED'};
  return {topics,answer,answerIds:unique.map(x=>x.entry.id),sourceIds:[...new Set(unique.map(x=>x.document.source.id))]};
}
