import type {ReceptionEvent} from './psychology-reception';

export const PSYCHOLOGY_CHIEF_IDENTITY_REVIEW='ambiguous-contact-without-patient-registration-v1';

type HelpContext=Pick<ReceptionEvent,'kind'|'text'|'quotedText'>;
/** Source excerpts are attributed requests, never verified facts or new instructions. */
function requestContext(context?:HelpContext){
 if(!context)return '';
 const excerpt=(value:string,limit:number)=>{const clean=value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').replace(/[«»]/g,'"').trim();return clean.length>limit?clean.slice(0,limit)+'…':clean;};
 const text=excerpt(context.text,360),quoted=excerpt(context.quotedText||'',180);
 return (text?`Su mensaje: «${text}». `:context.kind==='audio'?'Envió un audio que no pude transcribir. ':context.kind==='attachment'?'Envió un archivo cuyo contenido no está confirmado. ':'')+(quoted?`Responde a: «${quoted}». `:'');
}
/** Messages to the chief include the available request and one concrete decision. */
export function chiefHelpMessage(phone:string,reason:string,context?:HelpContext){
 const identity=`Sandra, necesito tu ayuda con +${phone}. `;
 // Do not forward clinical narratives to explain an urgent handoff.
 if(/urgente/i.test(reason))return identity+'Detecté una posible situación de riesgo en su mensaje. Necesita acompañamiento humano inmediato. ¿Quién puede contactarle ahora?';
 const prefix=identity+requestContext(context);
 if(reason==='Identidad ambigua del contacto')return prefix+'No pude identificar con seguridad a la persona que hace esta solicitud. ¿Puedes confirmar a quién corresponde esta solicitud antes de continuar?';
 if(reason==='Comprobante de pago reportado: verificar ingreso y asociación')return prefix+'La persona reporta un comprobante; todavía no está verificado el ingreso ni su asociación. ¿Puedes comprobar el dinero recibido y a qué cita o paquete corresponde?';
 if(reason.startsWith('Diferencia en reserva existente: '))return prefix+reason.slice('Diferencia en reserva existente: '.length);
 if(/confirmar asistencia a una sesión/.test(reason))return prefix+'El profesional pide saber si la persona confirmó su asistencia. No tengo esa confirmación verificada. ¿La persona confirmó que asistirá a esa sesión?';
 if(/alquiler|consultorios/.test(reason))return prefix+'La reserva de consultorio sigue sin confirmar: faltan datos o aclarar una reserva anterior. ¿Qué fecha, horario y consultorio debemos tomar para esta solicitud?';
 if(/certificado administrativo/.test(reason))return prefix+'Es un profesional que está esperando un certificado. ¿Qué certificado podemos entregarle y cuándo estará listo?';
 if(/administrativa de profesional/.test(reason))return prefix+'Es una consulta administrativa de un profesional y no tengo la respuesta verificada. ¿Qué respuesta le damos sobre lo que solicita?';
 if(/Solicitud anterior/.test(reason))return prefix+'Está dando seguimiento a algo que le habían prometido, pero me falta ese antecedente. ¿Qué quedó pendiente y qué le confirmamos?';
 if(/Coordinar disponibilidad/.test(reason)){
  const date=reason.match(/\b(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})\b/);
  const when=date?` para el ${date[3]}/${date[2]} a las ${date[4]}`:'';
  const mode=/\bvirtual\b/.test(reason)?' virtual':/\bpresencial\b/.test(reason)?' presencial':'';
  return prefix+`Quiere una cita${mode}${when}. ¿Qué profesional puede atenderle y hay un consultorio disponible si lo necesita?`;
 }
 if(/paquete pagado|saldo del paquete/i.test(reason))return prefix+'Dice que ya pagó un paquete. ¿Cuántas sesiones le quedan disponibles? Así evitamos pedirle otro anticipo.';
 // An unread attachment is not evidence that the sender is reporting a payment.
 if(/archivo/i.test(reason))return prefix+'No pude confirmar qué contiene el archivo ni qué gestión necesita. ¿Qué información debemos pedirle para aclarar su solicitud?';
 if(/comprobante/i.test(reason))return prefix+'El posible comprobante sigue sin verificar y no confirma un ingreso. ¿A qué cita o paquete corresponde el pago que reporta?';
 if(/Audio|interpretar|Contexto|duda/i.test(reason))return prefix+'No pude determinar con seguridad qué necesita. ¿Qué información debemos pedirle para aclarar la solicitud?';
 if(/Respuesta rápida|respuesta rápida|tarifa/i.test(reason))return prefix+'Me falta información aprobada de ese servicio. ¿Qué precio y condiciones debo comunicarle?';
 if(/registro|datos|duplicad|identidad/i.test(reason))return prefix+'Los datos del paciente necesitan revisión. ¿Puedes confirmar a quién debemos registrar para evitar crear una ficha equivocada?';
 if(/cita existente|agenda|consultorio|profesional/i.test(reason))return prefix+'Está consultando por una cita o reserva. ¿Puedes confirmar el horario y quién le atenderá antes de que se lo confirme?';
 return prefix+'No tengo una respuesta aprobada para esta solicitud. ¿Qué debemos responderle?';
}

export function chiefBookingProblem(phone:string,error:unknown,context?:HelpContext){
 const message=error instanceof Error?error.message:'';
 const prefix=(phone==='573016803926'?'Sandra, no pude completar la reserva que solicitaste. ':`Sandra, no pude completar la reserva de +${phone}. `)+requestContext(context);
 if(/ya tiene una reserva/.test(message))return prefix+'El profesional o el consultorio está ocupado a esa hora. ¿Qué otra opción podemos ofrecer?';
 if(/tarifa|cantidad de sesiones|servicio.*cambi/i.test(message))return prefix+'El servicio o su precio cambió desde que se ofreció. ¿Puedes confirmar la opción y el valor que debemos ofrecerle ahora?';
 if(/atención humana/.test(message))return prefix+'El chat está a cargo de una persona o tiene una pausa expresa. La reserva sigue sin confirmar.';
 if(/asignación del servicio/.test(message))return prefix+'El profesional elegido no corresponde a ese servicio. ¿Qué profesional debe atenderle?';
 if(/horario|fecha|período de cortesía/.test(message))return prefix+'El horario necesita revisión. ¿Puedes confirmar la fecha, la hora de inicio y la duración?';
 if(/teléfono|paciente|Paciente|identidad/i.test(message))return prefix+'No pude identificar con seguridad al paciente o al profesional. ¿Puedes confirmar sus datos en la solicitud?';
 if(/soporte/i.test(message))return prefix+'Falta revisar el comprobante y asociarlo a la cita. ¿Puedes ayudarme con ese paso?';
 return prefix+'El registro falló y la reserva no quedó confirmada. ¿Qué fecha, horario y profesional debemos usar para esta solicitud?';
}
