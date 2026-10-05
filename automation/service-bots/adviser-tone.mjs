// Direct user approval, 05/10/2026: warm, useful advice for María only.
// This changes reviewed reception wording, never the price, scope or authority.
export const ADVISER_TONE_GUARD='warm-scoped-reception-and-factual-next-step-v1';
const reviewedWording=new Map([
 ['Gracias. Una asesora continuará contigo para preparar la cotización de este inmueble.','Con gusto. Una asesora continuará contigo para preparar una cotización acorde con este inmueble.'],
 ['Gracias. Una asesora continuará contigo para preparar la cotización de tu solicitud.','Con gusto. Una asesora continuará contigo para preparar una cotización acorde con tu solicitud.'],
 ['Gracias. Una asesora continuará contigo para completar la cotización.','Con gusto. Una asesora continuará contigo para completar la cotización de tu solicitud.'],
 ['Gracias. Una asesora continuará contigo para confirmar el horario del servicio.','Con gusto. Una asesora continuará contigo para confirmar la disponibilidad. El horario aún no está confirmado.'],
 ['Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.','Gracias por tu pregunta. La respuesta para tu caso aún necesita confirmación.'],
 ['Tu mensaje quedó pendiente de atención.','Con gusto. Tu solicitud de hablar con esa persona quedó pendiente de atención.'],
 ['Recibí tu audio. Te atenderemos en cuanto revisemos su contenido.','Gracias por tu audio. Tu solicitud queda pendiente de revisión.'],
 ['Recibí el archivo. Revisaremos su contenido para continuar contigo.','Gracias por enviarlo. Tu archivo queda pendiente de revisión.'],
 ['Entiendo. Aún no tengo una hora de llegada confirmada.','Entiendo que necesitas saber la hora de llegada. Aún no tengo una hora confirmada.'],
 ['Entiendo tu preocupación. Aún no tengo una hora de llegada confirmada.','Entiendo que necesitas saber la hora de llegada. Aún no tengo una hora confirmada.']
]);

export function adviserReply(company,decision,{firstReply=false,approvedAnswer=false}={}) {
 const text=decision.reply;
 if(company!=='fumigacion'||!text||approvedAnswer)return text;
 const greeting=text.match(/^(Hola, soy María Ángel\. )/);
 const body=greeting?text.slice(greeting[0].length):text;
 const reviewed=reviewedWording.get(body);
 if(reviewed)return (greeting?.[0]||'')+reviewed;
 // Only the first intake question gets an invitation. Later questions stay brief.
 if(firstReply&&!decision.review&&!decision.question&&!decision.courtesy&&!decision.observed&&
    (/^¿/.test(body)||/^Para ayudarte con la cotización, cuéntame:/.test(body)))
  return (greeting?.[0]||'')+'Con gusto te ayudo. '+body;
 return text;
}
