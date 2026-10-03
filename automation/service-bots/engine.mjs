import { normalize, SANDRA, DIEGO, publicTextSafe } from './config.mjs';
import {selectCommonAnswer,commonQuestionTopics,faqNeedsPersonalReview,faqTopicLabel} from './faq.mjs';
import {chiefStatusTopic,chiefStatusReply} from './chief-status.mjs';

function directed(text,name) {
  const t=normalize(text), n=normalize(name);
  const aliases=n==='maria angel'?'maria angel|mariangel':n;
  return new RegExp('^[¿¡ ]*(?:(?:hola|buenos dias|buenas tardes|buenas noches)[, :]+)?(?:'+aliases+'|bot)(?:[, :¿?!]|$)').test(t)&&!new RegExp('^(?:'+aliases+'|bot)\\s+(?:dijo|dice|respondio|comento|me dijo|le dijo)\\b').test(t);
}
export function extractSlots(text,company) {
  const t=normalize(text), slots={};
  const services=company==='fumigacion'?['cucarachas','hormigas','ratones','ratas','chinches','mosquitos','pulgas','prevencion','fumigacion']:['nevera','lavadora','secadora','estufa','horno','calentador','aire acondicionado'];
  const found=services.filter(s=>t.includes(s));
  const specific=company==='fumigacion'?found.filter(s=>!['prevencion','fumigacion'].includes(s)):found;
  slots.service=(specific.length?specific:found).join(' y ')||undefined;
  const city=['medellin','bello','envigado','itagui','sabaneta','la estrella','copacabana','girardota','rionegro'].find(s=>new RegExp('\\b'+s+'\\b').test(t));
  if(city)slots.location=city;
  if(company==='fumigacion')slots.site=['apartamento','casa','restaurante','local','oficina','bodega'].find(s=>new RegExp('\\b'+s+'\\b').test(t));
  if(company==='fumigacion'){
    slots.area=text.match(/\b\d{1,5}(?:[.,]\d{1,2})?\s*(?:m\s*(?:²|2|cuadrados?)|metros?\s*cuadrados?)(?=$|[\s.,;:)])/i)?.[0];
    slots.rooms=text.match(/\b\d{1,3}\s*(?:habitaciones?|cuartos?)\b/i)?.[0];
  }
  return Object.fromEntries(Object.entries(slots).filter(([,v])=>v));
}
export function parseUnderstanding(value,customerText) {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const fields=['service','location','site','detail','preference'];const result={};
  for(const key of fields) {
    const v=value.slots?.[key];
    // Extract only literal spans. An inferred price, schedule, diagnosis or instruction has no authority.
    if(typeof v==='string'&&v.length>=2&&v.length<=300&&normalize(customerText).includes(normalize(v)))result[key]=v;
  }
  return result;
}
export function capabilitiesReply(config,phone) {
  const recipient=phone===SANDRA?'Doña Sandra':'Diego';
  if(config.enabled)return recipient+', soy '+config.bot+'. Puedo recibir solicitudes, preguntar los datos que faltan y guardar cada solicitud para revisión. La cotización, el horario y el técnico siguen pendientes de confirmación para cada caso. Todavía no creo servicios en el programa ni registro pagos.';
  return recipient+', por ahora soy '+config.bot+' y sigo en aprendizaje. Puedo revisar chats, guardar aclaraciones verificadas y consultar las confirmaciones con Sandra. Todavía no tengo consulta automática del programa y no atiendo clientes, confirmo horarios, creo servicios ni registro pagos.';
}
function questionExcerpt(text) {
  if(/\b(?:bearer|api[ _-]?key|token|contrase[nñ]a|clave|c[oó]digo de acceso)\b/i.test(text)||/\b\d{16,}\b/.test(text))return '[Contiene un dato reservado: revisar el mensaje original del mismo caso.]';
  return text.slice(0,350);
}
function isCustomerQuestion(text){return /[?¿]/.test(text)||commonQuestionTopics(text).length>0||/\b(?:cuanto (?:cuesta|vale|cobran|dura)|cual es (?:el|la)|como funciona|que incluye|me puedes (?:decir|confirmar)|pueden (?:venir|atender))\b/.test(normalize(text));}
function customerCourtesy(text){
  const value=normalize(text).replace(/\s+/g,' ');
  if(/[?¿\d]/.test(value)||!/^(?:(?:hola|buenos dias|buen dia|buenas tardes|buenas noches)[,.! ]+)?(?:(?:muchas|muchisimas|mil)\s+)?gracias\b/.test(value))return false;
  // Only affirmative gratitude vocabulary qualifies. A request, complaint, uncertainty,
  // payment or safety concern must continue through the ordinary review/intake path.
  const words=value.replace(/[^\p{L} ]/gu,' ').split(/\s+/).filter(Boolean);
  const permitted=new Set('hola buenos buen buenas dia dias tardes noches muchas muchisimas mil gracias por el la los las su tu sus tus servicio servicios de fumigacion control plagas atencion ayuda excelente amable muy bueno buena todo toda todos todas personal empresa equipo dios bendiga bendiciones a y al les nos ustedes recibido recibida'.split(' '));
  return words.every(word=>permitted.has(word));
}
function literalIntakeTurn(e){return e.kind==='text'&&!e.forwarded&&!customerCourtesy(e.text)&&!isCustomerQuestion(e.text)&&!/\b(?:antes|anterior|cancel\w*|reprogram\w*|reclamo|queja|garantia|pague|pago|abono|comprobante|me dijeron|me dijo|otra solicitud|otro servicio|nuevo servicio|otro equipo)\b/.test(normalize(e.text));}
export function customerDecision(company,state,e,analysis={}) {
  if(e.kind==='text'&&customerCourtesy(e.text))return {state:{...state,slots:{...state.slots},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)},courtesy:true,reply:'Con gusto. Estamos para servirte.'};
  const t=normalize(e.text);const next={...state,slots:{...state.slots,...extractSlots(e.text,company),...parseUnderstanding(analysis,e.text)},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)};
  if(company==='fumigacion'&&literalIntakeTurn(e)&&(state.asked?.at(-1)==='location'||state.initialIntakeAllRequested)&&e.text.length<=240&&/\b(?:villa|barrio|vereda|calle|carrera|unidad|urbanizacion|robledo|medellin|bello|envigado|itagui|sabaneta|santa helena)\b/.test(t))next.slots.locationDetails=e.text;
  if(e.kind==='call')return {state:{...next,lastCallEvent:e.id},observed:true};
  if(e.kind!=='text')return {state:next,review:'El cliente envió '+e.kind+'. El contenido original necesita revisión.',reply:e.kind==='audio'?'Recibí tu audio. Te atenderemos en cuanto revisemos su contenido.':'Recibí el archivo. Revisaremos su contenido para continuar contigo.'};
  if(/\b(factura|certificado|seguimiento|posservicio|ya tengo (?:una )?cita|estado de (?:la )?orden)\b/.test(t))return {state:next,review:'El cliente consulta un servicio previo, su estado o un soporte. Hace falta contrastar el registro del programa.',reply:'Gracias. Revisaremos el registro de tu servicio para poder ayudarte.'};
  if(/\b(cancel|reprogram|reclamo|queja|garantia|devolucion|amenaz|abogad|denuncia|dolor|intoxic|embaraz|mascota|bebe|niño|nino)\w*/.test(t))
    return {state:next,review:'El cliente solicita revisar una excepción o situación que necesita atención personal.',reply:'Gracias por contarnos. Revisaremos tu caso para darte una respuesta clara.'};
  if(/\b(pague|pago|comprobante|transfer|consign|abono)\w*/.test(t))return {state:next,review:'El cliente informa un pago. Hace falta comprobar el ingreso y su asociación al servicio.',reply:'Gracias. Recibí la información del pago; falta verificarlo para poder confirmarte.'};
  if(/^(gracias|muchas gracias|muy amable|ok|listo)[.! ]*$/.test(t))return {state:next,reply:'Con gusto.'};
  if(/^(?:hola[, ]+)?(?:con|esta|se encuentra)\s+\p{L}+(?:\s+\p{L}+)?[.!? ]*$/u.test(t))return {state:{...next,slots:{...state.slots}},reviewTopic:'requested-person',review:'La persona pidió hablar con alguien específico. Falta conocer el motivo; no consta una solicitud nueva de servicio.',reviewQuestion:'¿Quién puede atender esta solicitud?',reply:'Tu mensaje quedó pendiente de atención.'};
  if(!next.slots.detail&&state.asked?.at(-1)==='detail'&&!/[?¿]/.test(e.text)&&t.length>3)next.slots.detail=e.text.slice(0,300);
  if(!next.slots.preference&&state.asked?.includes('preference')&&/\b(hoy|mañana|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}[/:]\d{1,2}|tarde|mañana|noche)\b/.test(t))next.slots.preference=e.text.slice(0,300);
  const fields=company==='fumigacion'?['service','site','size','location']:['service','detail','location'];
  const missing=fields.find(f=>f==='size'?!next.slots.area&&!next.slots.rooms:f==='location'&&company==='fumigacion'?!next.slots.location&&!next.slots.locationDetails:!next.slots[f]);
  const questions={service:company==='fumigacion'?'¿Qué plaga deseas tratar o buscas un servicio preventivo?':'¿Qué equipo necesitas revisar?',site:'¿En qué tipo de inmueble necesitas el servicio?',size:'¿Cuántas habitaciones o metros cuadrados tiene el lugar?',detail:'¿Qué falla presenta el equipo?',location:'¿En qué municipio y barrio necesitas el servicio?'};
  if(/[?¿]/.test(e.text)&&/\b(eso|lo anterior|lo que (?:me )?(?:dij|coment|indic|explic)|me habian|me hab[ií]as|mismo (?:precio|horario|servicio)|como qued|que qued)\w*/.test(t))
    return {state:next,reviewTopic:'previous-communication',review:'El cliente pregunta por algo comunicado antes. Hay que relacionar su pregunta con el contexto guardado y el servicio correcto antes de contestar.',reply:'Gracias. Revisaremos lo que ya conversamos para responder tu pregunta con claridad.'};
  if(isCustomerQuestion(e.text))
    return {state:{...next,slots:{...state.slots}},reviewTopic:'customer-question',review:'La persona hizo una pregunta concreta. Hace falta revisar sus antecedentes y confirmar la respuesta para este servicio.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.'};
  if(missing&&!next.asked.includes(missing)){next.asked.push(missing);return {state:next,reply:questions[missing]};}
  if(missing){
    const names={service:'la plaga o el servicio solicitado',site:'el tipo de inmueble',size:'las habitaciones o metros cuadrados del lugar',detail:'la falla del equipo',location:'el municipio y barrio'};
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
      const internal=[SANDRA,DIEGO].includes(e.phone);
      const newerOnLine=internal&&s.db.prepare('SELECT 1 FROM events WHERE phone=? AND line=? AND from_me=0 AND (at>? OR (at=? AND revision>?)) LIMIT 1').get(e.phone,e.line,e.at,e.at,row.revision);
      if(internal?newerOnLine:(e.at<conv.at||row.revision<conv.revision)){finish('OBSERVED_SUPERSEDED');return;}
      if(!c.enabled&&(!c.chiefOnly||!internal)){finish('OBSERVED_ANALYSIS_ONLY');return;}
      if(internal){
        if(e.forwarded){finish('OBSERVED_FORWARDED');return;}
        const quoted=e.quotedId&&s.db.prepare("SELECT q.*,o.state AS delivery FROM questions q JOIN outbox o ON o.id=q.outbox_id WHERE q.recipient=? AND o.mid=? AND o.state IN ('DELIVERED','READ')").get(e.phone,e.quotedId);
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
        if(e.kind==='text'&&(directed(e.text,c.bot)||ownQuote)){
          const body=normalize(e.text).replace(/^[¿¡ ]*(?:(?:hola|buenos dias|buenas tardes|buenas noches)[, :]+)?(?:maria angel|mariangel|miguel angel|bot)[, :¿?!]*/,'').replace(/[¿?!.]+$/,'').trim();
          if(/^(?:que (?:funciones )?puedes (?:hacer|realizar)(?: en este momento)?|que sabes hacer|como puedes ayudarme)$/.test(body)){
            s.queue(e.id+':capabilities',e.phone,e.line,capabilitiesReply(c,e.phone),true,0);finish('CHIEF_CAPABILITIES');return;
          }
          const statusTopic=chiefStatusTopic(body);
          if(statusTopic){
            s.queue(e.id+(statusTopic==='presence'?':presence':':status'),e.phone,e.line,chiefStatusReply(s,c,e.phone,statusTopic,body),true,0);finish(statusTopic==='presence'?'CHIEF_PRESENCE':'CHIEF_STATUS');return;
          }
          if(e.phone!==SANDRA){s.audit('COORDINATOR_DIRECTED_PENDING_REVIEW',e.id,{kind:e.kind});s.queue(e.id+':review-ack',e.phone,e.line,'Diego, tu consulta quedó guardada para revisión; todavía no he ejecutado cambios.',true,0);finish('COORDINATOR_REVIEW');return;}
          if(new RegExp('^(?:(?:hola|buenos dias|buenas tardes|buenas noches)[, :]+)?(?:'+normalize(c.bot)+'|bot)[, :]+[¿ ]*(?:hola|estas ahi|estas presente|me escuchas|estas disponible|puedes responder|sigues ahi)[?!. ]*$').test(normalize(e.text))){
            s.queue(e.id+':presence',SANDRA,e.line,'Sí, Sandra. Soy '+c.bot+'. Estoy aquí para ayudarte.',true,0);finish('CHIEF_PRESENCE');return;
          }
          const target=/retoma (?:el )?chat (?:de )?(?:\+)?(57\d{10})\b/.exec(normalize(e.text));
          if(c.enabled&&target&&target[1]!==SANDRA&&target[1]!==DIEGO&&s.conversation(target[1])){
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
      let pendingQuestion=null;
      if(!newCase){
        const firstSource=caseState.caseId.startsWith(c.company+':')?caseState.caseId.slice(c.company.length+1):null;
        const turns=s.customerTurnBatch(e.phone,e.id,caseState.lastHandledSourceId||firstSource);
        caseState.intakeSources={...caseState.intakeSources};
        for(const turn of turns.filter(literalIntakeTurn))for(const [field,value]of Object.entries(extractSlots(turn.text,c.company))){
          caseState.slots[field]=value;caseState.intakeSources[field]={sourceId:turn.id,at:turn.at};
        }
        if(literalIntakeTurn(e)&&Object.keys(extractSlots(e.text,c.company)).length)pendingQuestion=turns.filter(turn=>turn.id!==e.id&&turn.kind==='text'&&!turn.forwarded&&isCustomerQuestion(turn.text)).at(-1)||null;
      }
      const priorFaq=caseState.pendingFaqQuestion;
      const faqQuestion=pendingQuestion|| (priorFaq&&literalIntakeTurn(e)?priorFaq:e);
      const faq=c.company==='fumigacion'&&e.kind==='text'&&!e.forwarded&&!faqNeedsPersonalReview(e.text)&&faqQuestion.kind==='text'?selectCommonAnswer(faqQuestion.text,caseState.slots,s.approvedCustomerAnswers(),caseState.caseId):null;
      let decision;
      if(faq?.answer){
        decision={state:{...caseState,lastText:e.text,pendingFaqQuestion:null},reply:faq.answer};
        s.audit('APPROVED_CUSTOMER_ANSWER_SELECTED',e.id,{caseId:caseState.caseId,topics:faq.topics,answers:faq.answerIds,sources:faq.sourceIds,originalQuestion:faqQuestion.id});
      }else if(faq?.missing?.some(x=>x==='service'||x==='site')&&!faq.missing.includes('verifiedProducts')){
        const field=faq.missing.includes('service')?'service':'site';
        decision={state:{...caseState,lastText:e.text,pendingFaqQuestion:{id:faqQuestion.id,text:faqQuestion.text,kind:'text'}},reply:field==='service'?'¿Para qué plaga necesitas el servicio?':'¿En qué tipo de inmueble necesitas el servicio?'};
      }else decision=pendingQuestion?{state:{...caseState,lastText:e.text},reviewTopic:'customer-question',reviewConditions:{question:normalize(pendingQuestion.text),caseId:caseState.caseId},reviewSource:pendingQuestion.id,pendingQuestion:pendingQuestion.text,review:'Hay una pregunta pendiente en esta misma secuencia; el mensaje siguiente aporta datos, pero no sustituye esa pregunta.',reviewQuestion:'¿Qué respuesta verificada corresponde a esta pregunta?',reply:'Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.'}:customerDecision(c.company,caseState,e,analysis);
      if(faq&&!faq.answer&&decision.review){
        decision.reviewTopic='common-question';decision.reviewConditions={question:normalize(faqQuestion.text),topics:faq.topics,caseId:caseState.caseId};decision.reviewSource=faqQuestion.id;
        const subjects=faq.topics.map(faqTopicLabel).join(' y ');
        decision.pendingQuestion=faqQuestion.text;decision.review='Falta una respuesta comprobada sobre '+subjects+' para este servicio.';
        decision.reviewQuestion='¿Qué debemos explicarle sobre '+subjects+' en este caso?';
      }
      decision.state.lastHandledSourceId=e.id;
      if(/^[¡! ]*(?:hola\b|buenos dias\b|buen dia\b|buenas tardes\b|buenas noches\b)/.test(normalize(e.text))&&!conv.state.introduced&&decision.reply){
        if(c.company==='fumigacion'&&!decision.courtesy&&!decision.review&&!decision.question&&!decision.observed){
          const missing=decision.state.slots,requests=[];
          if(!missing.service)requests.push('Qué plaga deseas tratar o si buscas prevención.');
          if(!missing.site||!missing.area&&!missing.rooms)requests.push(!missing.site&&!missing.area&&!missing.rooms?'Qué tipo de inmueble es y cuántas habitaciones o metros cuadrados tiene.':!missing.site?'Qué tipo de inmueble es.':'Cuántas habitaciones o metros cuadrados tiene.');
          if(!missing.location&&!missing.locationDetails)requests.push('El municipio y barrio o vereda donde necesitas el servicio.');
          if(requests.length){decision.reply='Para ayudarte con la cotización, cuéntame:\n'+requests.map(x=>'• '+x).join('\n');decision.state.initialIntakeAllRequested=true;}
        }
        decision.reply='Hola, soy '+c.bot+'. '+decision.reply;decision.state.introduced=true;
      }
      s.saveConversation(e.phone,decision.state);
      const labels={service:'Servicio',location:'Municipio confirmado por el texto',locationDetails:'Ubicación indicada',site:'Inmueble',area:'Área informada',rooms:'Habitaciones informadas',detail:'Falla informada',preference:'Preferencia'};
      const context=Object.entries(decision.state.slots).map(([k,v])=>(labels[k]||k)+': '+questionExcerpt(String(v))).join('; ').slice(0,650);
      if(decision.review){
        const history=s.conversationContext(e.phone,e.at,20,e.id);
        s.audit('CONVERSATION_CONTEXT_REVIEW',e.id,{caseId:caseState.caseId,turns:history.turns.length,storedCoverageComplete:history.completeStoredHistory,fullWhatsAppHistoryRead:false,originalMediaRead:false});
        const request=s.question({phone:e.phone,line:e.line,caseId:caseState.caseId,topic:decision.reviewTopic||'revision:'+e.id,conditions:decision.reviewConditions|| (decision.reviewTopic?{question:normalize(e.text),caseId:caseState.caseId}:{event:e.id,caseId:caseState.caseId}),recipient:SANDRA,source:decision.reviewSource||e.id,
          text:c.name+': contacto terminado en '+e.phone.slice(-4)+'. '+decision.review+(decision.pendingQuestion?' Pregunta pendiente: '+questionExcerpt(decision.pendingQuestion)+'.':'')+' Mensaje actual: '+questionExcerpt(e.text)+(context?' Datos de esta solicitud: '+context+'.':'')+' '+(decision.reviewQuestion||'¿Cómo debemos continuar en este caso?')});
        if(!request.created&&(decision.reviewTopic?.startsWith('missing-intake:')||decision.reviewTopic==='common-question')){
          decision.reply=null;
          s.audit('PENDING_CLARIFICATION_REUSED',e.id,{caseId:caseState.caseId,questionId:request.id,topic:decision.reviewTopic,newOutboundCreated:false});
        }
      }
      if(decision.question){
        const slots=decision.question.conditions;
        const summary=Object.entries(slots).map(([k,v])=>(labels[k]||k)+': '+questionExcerpt(String(v))).join('; ');
        const quoteOnly=decision.question.topic==='cotizacion-verificada';
        const request=s.question({phone:e.phone,line:e.line,caseId:caseState.caseId,topic:decision.question.topic,conditions:slots,recipient:SANDRA,source:e.id,
          text:c.name+': solicitud del contacto terminado en '+e.phone.slice(-4)+'. '+summary+(quoteOnly?'. Falta confirmar el precio y la respuesta aplicable. ¿Qué cotización y texto vigente corresponden a esta solicitud?':'. Aún no hay técnico, horario ni precio confirmados. ¿Qué técnico, horario disponible y cotización corresponden a este caso?')});
        if(quoteOnly&&!request.created)decision.reply=null;
      }
      if(decision.reply){
        if(!publicTextSafe(decision.reply))throw new Error('EXTERNAL_TEXT_REJECTED');
        s.queue(e.id+':reply',e.phone,e.line,decision.reply,false,conv.revision,decision.courtesy?null:caseState.caseId);
        if(faq?.answer)s.saveApprovedReplyReference(e.id+':reply',{question:faqQuestion.text,context:caseState.slots,caseId:caseState.caseId,answer:faq.answer,finalText:decision.reply,answerIds:faq.answerIds,sourceIds:faq.sourceIds});
      }
      finish(decision.observed?'OBSERVED_CALL':decision.review?'REVIEW':decision.question?'WAITING_COORDINATOR':'DONE');
    });
  }
}
