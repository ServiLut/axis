// Direct user approval, 05/10/2026: warm, useful advice for María only.
// This changes reviewed reception wording, never the price, scope or authority.
import {currentIntakeTimingAcknowledgement} from './intake-timing.mjs';
export const ADVISER_TONE_GUARD='identified-maria-reception-and-current-requested-timing-v3';
const initialRequests=new Map([
 ['Qué plaga deseas tratar o si buscas prevención.','qué plaga deseas tratar o si buscas prevención'],
 ['Qué tipo de inmueble es y cuántas habitaciones o metros cuadrados tiene.','qué tipo de inmueble es y cuántas habitaciones o metros cuadrados tiene'],
 ['Qué tipo de inmueble es.','qué tipo de inmueble es'],
 ['Cuántas habitaciones o metros cuadrados tiene.','cuántas habitaciones o metros cuadrados tiene'],
 ['Cuántos colchones están afectados y si también hay chinches en bases de cama u otros muebles.','cuántos colchones están afectados y si también hay chinches en bases de cama u otros muebles'],
 ['El municipio y barrio o vereda donde necesitas el servicio.','el municipio y barrio o vereda donde necesitas el servicio'],
 ['El municipio donde necesitas el servicio; ya conservé la ubicación indicada.','el municipio donde necesitas el servicio']
]);
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
 // Personal summaries and persisted receipt confirmations retain their exact
 // deterministic facts. Tone does not change a registration contract.
 if(decision.state?.programIntake||/^(?:Registraré el servicio|Tu solicitud quedó registrada|Registré tu solicitud|Tu servicio quedó registrado)\b/.test(text))return text;
 const timing=!decision.review&&!decision.question&&!decision.courtesy&&!decision.observed?currentIntakeTimingAcknowledgement(decision.state):null;
 const render=reply=>{
  if(!timing||reply.includes(timing))return reply;
  const intro=reply.match(/^((?:Hola|Buen día|Buenas tardes|Buenas noches), soy María Ángel\. )/);
  const rest=(intro?reply.slice(intro[0].length):reply).replace(/^Con gusto\. /,'');
  return (intro?.[0]||'')+timing+' '+rest;
 };
 const greeting=text.match(/^(Hola, soy María Ángel\. )/);
 const body=greeting?text.slice(greeting[0].length):text;
 const social=String(decision.state?.lastText||'').trim();
 const ownGreeting=/^buenas tardes[.! ]*$/i.test(social)?'Buenas tardes, soy María Ángel. ':/^buenas noches[.! ]*$/i.test(social)?'Buenas noches, soy María Ángel. ':/^(?:buenos días|buenos dias|buen día|buen dia)[.! ]*$/i.test(social)?'Buen día, soy María Ángel. ':'Hola, soy María Ángel. ';
 const prefix=greeting||firstReply&&!decision.courtesy?ownGreeting:'';
 const reviewed=reviewedWording.get(body);
 if(reviewed)return render(prefix+reviewed);
 if((firstReply||greeting)&&!decision.review&&!decision.question&&!decision.courtesy&&!decision.observed&&body.startsWith('Para ayudarte con la cotización, cuéntame:\n')){
  const requests=body.slice('Para ayudarte con la cotización, cuéntame:\n'.length).split('\n').map(line=>line.startsWith('• ')?initialRequests.get(line.slice(2)):null);
  if(requests.length&&requests.every(Boolean))return render(prefix+'Para cotizarte, cuéntame '+requests.join('; ')+'.');
 }
 // Only the first intake question gets an invitation. Later questions stay brief.
 if(firstReply&&!decision.review&&!decision.question&&!decision.courtesy&&!decision.observed&&
    (/^¿/.test(body)||/^Para ayudarte con la cotización, cuéntame:/.test(body)))
  return render(prefix+'Te ayudo con la cotización. '+body);
 return render(prefix+body);
}
