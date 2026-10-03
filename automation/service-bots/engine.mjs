import { normalize, SANDRA, DIEGO, publicTextSafe } from './config.mjs';

function directed(text,name) {
  const t=normalize(text), n=normalize(name);
  const aliases=n==='maria angel'?'maria angel|mariangel':n;
  return new RegExp('^[¿¡ ]*(?:(?:hola|buenos dias|buenas tardes|buenas noches)[, :]+)?(?:'+aliases+'|bot)(?:[, :¿?!]|$)').test(t)&&!new RegExp('^(?:'+aliases+'|bot)\\s+(?:dijo|dice|respondio|comento|me dijo|le dijo)\\b').test(t);
}
export function extractSlots(text,company) {
  const t=normalize(text), slots={};
  const services=company==='fumigacion'?['cucarachas','hormigas','ratones','ratas','chinches','mosquitos','pulgas','prevencion','fumigacion']:['nevera','lavadora','secadora','estufa','horno','calentador','aire acondicionado'];
  slots.service=services.find(s=>t.includes(s));
  const city=['medellin','bello','envigado','itagui','sabaneta','la estrella','copacabana','girardota','rionegro'].find(s=>new RegExp('\\b'+s+'\\b').test(t));
  if(city)slots.location=city;
  if(company==='fumigacion')slots.site=['apartamento','casa','restaurante','local','oficina','bodega'].find(s=>new RegExp('\\b'+s+'\\b').test(t));
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
  return recipient+', por ahora soy '+config.bot+' y sigo en aprendizaje. Puedo revisar chats, guardar aclaraciones verificadas y consultar dudas contigo'+(phone===SANDRA?' o con Diego.':' o con Sandra.')+' Todavía no tengo consulta automática del programa y no atiendo clientes, confirmo horarios, creo servicios ni registro pagos.';
}
export function customerDecision(company,state,e,analysis={}) {
  const t=normalize(e.text);const next={...state,slots:{...state.slots,...extractSlots(e.text,company),...parseUnderstanding(analysis,e.text)},asked:[...(state.asked||[])],lastText:e.text.slice(0,900)};
  if(e.kind==='call')return {state:{...next,lastCallEvent:e.id},observed:true};
  if(e.kind!=='text')return {state:next,review:'El cliente envió '+e.kind+'. El contenido original necesita revisión.',reply:e.kind==='audio'?'Recibí tu audio. Te atenderemos en cuanto revisemos su contenido.':'Recibí el archivo. Revisaremos su contenido para continuar contigo.'};
  if(/\b(factura|certificado|seguimiento|posservicio|ya tengo (?:una )?cita|estado de (?:la )?orden)\b/.test(t))return {state:next,review:'El cliente consulta un servicio previo, su estado o un soporte. Hace falta contrastar el registro del programa.',reply:'Gracias. Revisaremos el registro de tu servicio para poder ayudarte.'};
  if(/\b(cancel|reprogram|reclamo|queja|garantia|devolucion|amenaz|abogad|denuncia|dolor|intoxic|embaraz|mascota|bebe|niño|nino)\w*/.test(t))
    return {state:next,review:'El cliente solicita revisar una excepción o situación que necesita atención personal.',reply:'Gracias por contarnos. Revisaremos tu caso para darte una respuesta clara.'};
  if(/\b(pague|pago|comprobante|transfer|consign|abono)\w*/.test(t))return {state:next,review:'El cliente informa un pago. Hace falta comprobar el ingreso y su asociación al servicio.',reply:'Gracias. Recibí la información del pago; falta verificarlo para poder confirmarte.'};
  if(/^(gracias|muchas gracias|muy amable|ok|listo)[.! ]*$/.test(t))return {state:next,reply:'Con gusto.'};
  if(!next.slots.detail&&state.asked?.at(-1)==='detail'&&!/[?¿]/.test(e.text)&&t.length>3)next.slots.detail=e.text.slice(0,300);
  if(!next.slots.preference&&state.asked?.includes('preference')&&/\b(hoy|mañana|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}[/:]\d{1,2}|tarde|mañana|noche)\b/.test(t))next.slots.preference=e.text.slice(0,300);
  const fields=company==='fumigacion'?['service','site','location']:['service','detail','location'];
  const missing=fields.find(f=>!next.slots[f]);
  const questions={service:company==='fumigacion'?'¿Qué plaga deseas tratar o buscas un servicio preventivo?':'¿Qué equipo necesitas revisar?',site:'¿En qué tipo de inmueble necesitas el servicio?',detail:'¿Qué falla presenta el equipo?',location:'¿En qué municipio y barrio necesitas el servicio?'};
  if(missing&&!next.asked.includes(missing)){next.asked.push(missing);return {state:next,reply:questions[missing]};}
  if(missing)return {state:next,review:'Falta '+missing+'. La pregunta ya se hizo; la nueva respuesta no permitió verificar ese dato.',reply:'Gracias. Revisaremos los detalles que nos compartiste para continuar.'};
  if(!next.asked.includes('preference')){next.asked.push('preference');return {state:next,reply:'¿Qué día y franja horaria prefieres?'};}
  if(!next.slots.preference)return {state:next,review:'Falta una fecha o franja preferida verificable. Ya se preguntó; no repetir la consulta al cliente.',reply:'Gracias. Revisaremos los detalles para continuar con tu solicitud.'};
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
        s.hold(e.phone,e.id,true);finish('STAFF_TAKEOVER');return;
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
          if(/^(?:estas (?:ahi|presente|funcionando|disponible)|me escuchas|puedes responder|sigues ahi)$/.test(body)){
            s.queue(e.id+':presence',e.phone,e.line,'Sí, '+(e.phone===SANDRA?'Sandra':'Diego')+'. '+(c.enabled?'Soy '+c.bot+'. Estoy aquí para ayudarte.':'Recibí tu mensaje. Sigo en aprendizaje y puedo atenderte por aquí.'),true,0);finish('CHIEF_PRESENCE');return;
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
      const caseState=newCase?{slots:{},asked:[],caseId:c.company+':'+e.id}:conv.state;
      caseState.caseId ||= reportedOrder || c.company+':'+e.id;
      const decision=customerDecision(c.company,caseState,e,analysis);
      if(/^\s*(?:hola|buenos dias|buenas tardes|buenas noches)[!. ]*$/i.test(normalize(e.text))&&!conv.state.introduced){
        decision.reply='Hola, soy '+c.bot+'. '+decision.reply;decision.state.introduced=true;
      }
      s.saveConversation(e.phone,decision.state);
      const labels={service:'Servicio',location:'Ubicación',site:'Inmueble',detail:'Falla informada',preference:'Preferencia'};
      const context=Object.entries(decision.state.slots).map(([k,v])=>(labels[k]||k)+': '+v).join('; ').slice(0,650);
      if(decision.review)s.question({phone:e.phone,line:e.line,caseId:caseState.caseId,topic:'revision:'+e.id,conditions:{event:e.id},recipient:SANDRA,source:e.id,
        text:c.name+': contacto terminado en '+e.phone.slice(-4)+'. '+decision.review+(context?' Contexto registrado: '+context+'.':'')+' ¿Cómo debemos continuar en este caso?'});
      if(decision.question){
        const slots=decision.question.conditions;
        const summary=Object.entries(slots).map(([k,v])=>(labels[k]||k)+': '+v).join('; ');
        s.question({phone:e.phone,line:e.line,caseId:caseState.caseId,topic:decision.question.topic,conditions:slots,recipient:DIEGO,source:e.id,
          text:c.name+': solicitud del contacto terminado en '+e.phone.slice(-4)+'. '+summary+'. Aún no hay técnico, horario ni precio confirmados. ¿Qué técnico, horario disponible y cotización corresponden a este caso?'});
      }
      if(decision.reply){if(!publicTextSafe(decision.reply))throw new Error('EXTERNAL_TEXT_REJECTED');s.queue(e.id+':reply',e.phone,e.line,decision.reply,false,conv.revision);}
      finish(decision.observed?'OBSERVED_CALL':decision.review?'REVIEW':decision.question?'WAITING_COORDINATOR':'DONE');
    });
  }
}
