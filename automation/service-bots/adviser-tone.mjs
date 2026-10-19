// Direct user approval, 05/10/2026: warm, useful advice for María only.
// This changes reviewed reception wording, never the price, scope or authority.
import {currentIntakeTimingAcknowledgement} from './intake-timing.mjs';
import {officeReceptionRequestValues,formatOfficeReceptionRequests,officeReceptionDeclineText} from './office-reception-snippets.mjs';
import {selectOfficeReceptionReply} from './office-customer-replies.mjs';
export const ADVISER_TONE_GUARD='identified-maria-reception-and-current-requested-timing-v3';
const ordinaryIntakeQuestions=new Set([
 'Para cotizarte, me falta:\n1. Qué plaga deseas tratar o si buscas prevención.\n2. En qué barrio o vereda necesitas el servicio.',
 '¿Qué plaga deseas tratar o buscas un servicio preventivo?',
 'Cuéntame qué plaga necesitas tratar o si buscas un servicio preventivo.',
 '¿En qué tipo de inmueble necesitas el servicio?',
 'Cuéntame si necesitas el servicio en una casa, apartamento u otro tipo de inmueble.',
 '¿Cuántas habitaciones o metros cuadrados tiene el lugar?',
 'Para completar la cotización, ¿cuántas habitaciones o metros cuadrados tiene el lugar?',
 '¿Cuántos colchones están afectados? Cuéntame también si hay chinches en bases de cama u otros muebles.',
 '¿En qué municipio y barrio necesitas el servicio?',
 '¿Me indicas el municipio y barrio donde necesitas el servicio?',
 '¿En qué municipio necesitas el servicio? Ya conservé la ubicación que me indicaste.',
 'Me falta confirmar el municipio para cotizarte; ya conservé la ubicación que me indicaste.'
]);
// This classifies only the deterministic intake wording, not customer text or
// an approved answer. The composer uses it for new plans; existing reservations
// continue to use their original text, source and hash without being rewritten.
export function mariaOrdinaryIntakeReply(text){
 if(typeof text!=='string')return false;
 const body=text.replace(/^(?:Hola|Buen día|Buenas tardes|Buenas noches), soy María Ángel\.\s+/,'').replace(/^Entiendo que lo necesitas [^\n.!?]+\.\s+/,'').replace(/^Te ayudo con la cotización\. /,'');
 if(ordinaryIntakeQuestions.has(body))return true;
 const title='Para cotizarte, cuéntame';
 if(!body.startsWith(title))return false;
 const rest=body.slice(title.length);
 if(rest.startsWith(':\n')){
  const items=rest.slice(2).split('\n');
  return items.length>1&&items.every((line,i)=>line.startsWith((i+1)+'. ')&&officeReceptionRequestValues().some(value=>line.slice(String(i+1).length+2)===value[0].toUpperCase()+value.slice(1)+'.'));
 }
 return officeReceptionRequestValues().some(value=>rest===' '+value+'.');
}
const reviewedWording=new Map([
 ['Gracias. Una asesora continuará contigo para preparar la cotización de este inmueble.','La cotización de este inmueble aún necesita confirmación.'],
 ['Gracias. Una asesora continuará contigo para preparar la cotización de tu solicitud.','Tu cotización aún necesita confirmación.'],
 ['Gracias. Una asesora continuará contigo para completar la cotización.','Tu cotización aún necesita confirmación.'],
 ['Gracias. Una asesora continuará contigo para confirmar el horario del servicio.','El horario del servicio aún no está confirmado.'],
 ['Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.','Recibí tu pregunta. Aún no tengo una respuesta confirmada para tu caso.'],
 ['Con gusto. Tu pregunta quedó pendiente de revisión.','Recibí tu pregunta. Aún no tengo una respuesta confirmada para tu caso.'],
 ['Tu mensaje quedó pendiente de atención.','Tu solicitud de hablar con esa persona aún está pendiente de respuesta.'],
 ['Recibí tu audio. Te atenderemos en cuanto revisemos su contenido.','Recibí tu audio. Su contenido aún está pendiente de revisión.'],
 ['Recibí el archivo. Revisaremos su contenido para continuar contigo.','Recibí el archivo. Su contenido aún está pendiente de revisión.'],
 ['Con gusto. Una asesora continuará contigo para revisar los documentos que necesitas.','Recibí tu solicitud de documentos. Aún no tengo confirmado su envío.'],
 ['Con gusto. Revisaremos tu solicitud de documentos.','Recibí tu solicitud de documentos. Aún no tengo confirmado su envío.'],
 ['Con gusto. Revisaremos qué documentos podemos entregarte.','Aún necesito confirmar qué documentos podemos entregarte.'],
 ['Con gusto. Tu solicitud de garantía quedó pendiente de revisión.','Entiendo tu solicitud de garantía. Aún no tengo una respuesta confirmada para este caso.'],
 ['Tu solicitud de garantía sigue pendiente de revisión.','Tu solicitud de garantía sigue pendiente de respuesta.'],
 ['Con gusto. Tu solicitud de refuerzo quedó pendiente de revisión.','Recibí tu solicitud de refuerzo. Aún falta confirmar cómo atenderla.'],
 ['Con gusto. Tu solicitud de verificación quedó pendiente de revisión.','Recibí tu solicitud de verificación del servicio. Aún falta confirmar cómo atenderla.'],
 ['Entiendo. Aún no tengo una hora de llegada confirmada.','Entiendo que necesitas saber la hora de llegada. Aún no tengo una hora confirmada.'],
 ['Entiendo tu preocupación. Aún no tengo una hora de llegada confirmada.','Entiendo que necesitas saber la hora de llegada. Aún no tengo una hora confirmada.']
]);

export function adviserReply(company,decision,{firstReply=false,approvedAnswer=false}={}) {
 const text=decision.reply;
 if(company!=='fumigacion'||!text||approvedAnswer)return text;
 const office=selectOfficeReceptionReply(company,decision,{approvedAnswer});
 if(office)return office.text;
 // Personal summaries and persisted receipt confirmations retain their exact
 // deterministic facts. Tone does not change a registration contract.
 if(decision.state?.programIntake||/^(?:Registraré el servicio|Tu solicitud quedó registrada|Registré tu solicitud|Tu servicio quedó registrado)\b/.test(text))return text;
 const decline=officeReceptionDeclineText(decision);
 if(decline)return decline;
 const timing=!decision.review&&!decision.question&&!decision.courtesy&&!decision.observed?currentIntakeTimingAcknowledgement(decision.state):null;
 const render=reply=>{
  if(!timing||reply.includes(timing))return reply;
  const intro=reply.match(/^((?:Hola|Buen día|Buenas tardes|Buenas noches), soy María Ángel\.\s+)/);
  const rest=(intro?reply.slice(intro[0].length):reply).replace(/^Con gusto\. /,'');
  return (intro?.[0]||'')+timing+(reply.includes('\n')?'\n\n':' ')+rest;
 };
 const greeting=text.match(/^(Hola, soy María Ángel\. )/);
 const body=greeting?text.slice(greeting[0].length):text;
 const social=String(decision.state?.lastText||'').trim();
 const ownGreeting=/^buenas tardes[.! ]*$/i.test(social)?'Buenas tardes, soy María Ángel. ':/^buenas noches[.! ]*$/i.test(social)?'Buenas noches, soy María Ángel. ':/^(?:buenos días|buenos dias|buen día|buen dia)[.! ]*$/i.test(social)?'Buen día, soy María Ángel. ':'Hola, soy María Ángel. ';
 const prefix=greeting||firstReply&&!decision.courtesy?ownGreeting:'';
 const reviewed=reviewedWording.get(body);
 if(reviewed)return render(prefix+reviewed);
 if((firstReply||greeting)&&!decision.review&&!decision.question&&!decision.courtesy&&!decision.observed&&body.startsWith('Para ayudarte con la cotización, cuéntame:\n')){
  const lines=body.slice('Para ayudarte con la cotización, cuéntame:\n'.length).split('\n');
  const requestText=lines.every(line=>line.startsWith('• '))?formatOfficeReceptionRequests(lines.map(line=>line.slice(2))):null;
  if(requestText){
   const greetingPrefix=prefix?prefix.trimEnd()+'\n\n':'';
   return render(greetingPrefix+requestText);
  }
 }
 // Only the first intake question gets an invitation. Later questions stay brief.
 if(firstReply&&!decision.review&&!decision.question&&!decision.courtesy&&!decision.observed&&
    (/^¿/.test(body)||/^Para ayudarte con la cotización, cuéntame:/.test(body)))
  return render(prefix+'Te ayudo con la cotización. '+body);
 return render(prefix+body);
}
