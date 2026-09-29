/** Messages to the chief explain the decision needed, never database/provider diagnostics. */
export function chiefHelpMessage(phone:string,reason:string){
 const prefix=`Sandra, necesito tu ayuda con +${phone}. `;
 if(reason.startsWith('Diferencia en reserva existente: '))return prefix+reason.slice('Diferencia en reserva existente: '.length);
 if(/alquiler|consultorios/.test(reason))return prefix+'Está solicitando reservar un consultorio. Necesito aclarar los datos o una reserva anterior antes de continuar; no la he confirmado. ¿Puedes revisar su último pedido y decirme qué horario y consultorio corresponden?';
 if(/certificado administrativo/.test(reason))return prefix+'Es un profesional que está esperando un certificado. ¿Qué certificado podemos entregarle y cuándo estará listo?';
 if(/administrativa de profesional/.test(reason))return prefix+'Es un profesional que nos consulta por un asunto pendiente. ¿Puedes revisar su último mensaje y aclararme qué debemos responder?';
 if(/Solicitud anterior/.test(reason))return prefix+'Está dando seguimiento a algo que le habían prometido, pero me falta ese antecedente. ¿Qué quedó pendiente y qué le confirmamos?';
 if(/urgente/i.test(reason))return prefix+'Puede estar en una situación de riesgo. Por favor, revisa el chat y acompáñale cuanto antes.';
 if(/Coordinar disponibilidad/.test(reason)){
  const date=reason.match(/\b(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})\b/);
  const when=date?` para el ${date[3]}/${date[2]} a las ${date[4]}`:'';
  const mode=/\bvirtual\b/.test(reason)?' virtual':/\bpresencial\b/.test(reason)?' presencial':'';
  return prefix+`Quiere una cita${mode}${when}. ¿Qué profesional puede atenderle y hay un consultorio disponible si lo necesita?`;
 }
 if(/paquete pagado|saldo del paquete/i.test(reason))return prefix+'Dice que ya pagó un paquete. ¿Cuántas sesiones le quedan disponibles? Así evitamos pedirle otro anticipo.';
 if(/comprobante|archivo/i.test(reason))return prefix+'Envió un archivo o comprobante. ¿Puedes revisarlo y decirme a qué cita corresponde? Todavía no he confirmado el pago.';
 if(/Audio|interpretar|Contexto|duda/i.test(reason))return prefix+'No comprendí bien su solicitud. ¿Puedes revisar su último mensaje y decirme cómo debemos continuar?';
 if(/Respuesta rápida|respuesta rápida|tarifa/i.test(reason))return prefix+'Me falta información aprobada de ese servicio. ¿Qué precio y condiciones debo comunicarle?';
 if(/registro|datos|duplicad|identidad/i.test(reason))return prefix+'Los datos del paciente necesitan revisión. ¿Puedes confirmar a quién debemos registrar para evitar crear una ficha equivocada?';
 if(/cita existente|agenda|consultorio|profesional/i.test(reason))return prefix+'Está consultando por una cita o reserva. ¿Puedes confirmar el horario y quién le atenderá antes de que se lo confirme?';
 return prefix+'Su solicitud necesita una decisión tuya. ¿Puedes revisar el último mensaje y decirme qué debemos hacer?';
}

export function chiefBookingProblem(phone:string,error:unknown){
 const message=error instanceof Error?error.message:'';
 const prefix=phone==='573016803926'?'Sandra, no pude completar la reserva que solicitaste. ':`Sandra, no pude completar la reserva de +${phone}. `;
 if(/ya tiene una reserva/.test(message))return prefix+'El profesional o el consultorio está ocupado a esa hora. ¿Qué otra opción podemos ofrecer?';
 if(/tarifa|cantidad de sesiones|servicio.*cambi/i.test(message))return prefix+'El servicio o su precio cambió desde que se ofreció. ¿Puedes confirmar la opción y el valor que debemos ofrecerle ahora?';
 if(/atención humana/.test(message))return prefix+'El chat está a cargo de una persona o tiene una pausa expresa. La reserva sigue sin confirmar.';
 if(/asignación del servicio/.test(message))return prefix+'El profesional elegido no corresponde a ese servicio. ¿Puedes revisar quién debe atenderlo?';
 if(/horario|fecha|período de cortesía/.test(message))return prefix+'El horario necesita revisión. ¿Puedes confirmar la fecha, la hora de inicio y la duración?';
 if(/teléfono|paciente|Paciente|identidad/i.test(message))return prefix+'No pude identificar con seguridad al paciente o al profesional. ¿Puedes confirmar sus datos en la solicitud?';
 if(/soporte/i.test(message))return prefix+'Falta revisar el comprobante y asociarlo a la cita. ¿Puedes ayudarme con ese paso?';
 return prefix+'Necesito revisar los datos de la solicitud contigo antes de confirmarla.';
}
