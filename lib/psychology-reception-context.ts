import type {Prisma} from '@/prisma/generated/prisma/client';
import {normalizeText,phoneDigits,type ReceptionEvent,type ReceptionState,type ReceptionResult} from './psychology-reception';

export type ReceptionContext={role:'professional'|'patient'|'unknown'|'ambiguous';professionalId?:number;hasHistory:boolean;coverage:string;continuation:boolean;quotedText?:string};
/** Role comes from the verified tenant, never the display name or an AI guess. */
export async function readReceptionIdentity(tx:Prisma.TransactionClient,phone:string){
 if(phoneDigits(phone)!==phone)throw Error('AI_IDENTITY_INVALID');
 const local=phone.startsWith('57')&&phone.length===12?phone.slice(2):phone;
 const matches=await tx.$queryRaw<{id:number}[]>`SELECT u.id FROM "Usuario" u WHERE u."tenantId"=4 AND u.rol::text='TECNICO' AND u.activo=true
  AND (u."empresaId"=3 OR (u."empresaId" IS NULL AND EXISTS(SELECT 1 FROM "CitasPsicologos" c WHERE c."tenantId"=4 AND c."empresaId"=3 AND c."psicologoId"=u.id)))
  AND regexp_replace(COALESCE(u.telefono,''),'[^0-9]','','g') IN (${phone},${local}) LIMIT 2`;
 if(matches.length>1)return {role:'ambiguous' as const};
 if(matches.length===1)return {role:'professional' as const,professionalId:matches[0].id};
 return {role:'unknown' as const};
}
export function hasContinuation(text:string){
 return /\b(si lo tienen|lo tienen|quedaron|me iban|estaba hablando|me dijeron|me enviaron|me envias|lo pendiente|el certificado|la certificacion|te habia|ya hablamos)\b/.test(normalizeText(text));
}
export function isRentalBookingRequest(event:ReceptionEvent,state:ReceptionState){
 const t=normalizeText(event.text);
 return event.kind==='text'&&!event.fromMe&&(!!state.rental||((/consultorio|alquil|espacio/.test(t)||state.service==='alquiler')&&/reserv|agend|separ|lunes|martes|miercoles|jueves|viernes|sabado|domingo|mañana|\d{1,2}\s*(?:am|pm|horas|:)/.test(t)));
}
/** Only whole social phrases qualify; a greeting inside a request is not a courtesy. */
function socialCourtesy(event:ReceptionEvent):string|null{
 if(event.kind!=='text')return null;
 const text=normalizeText(event.text).replace(/[¿?¡!.,]/g,' ').replace(/\s+/g,' ').trim();
 if(/^(?:(?:hola|buenos dias|buenas tardes|buenas noches) )?(?:con )?(?:como estas|como estan|como vas|como te va|que tal|todo bien)(?: y tu)?$/.test(text)||/^(?:muy )?bien(?: gracias)? y tu$/.test(text))return 'Gracias por preguntar 😊 Estoy aquí para ayudarte.';
 if(/^(?:muchas gracias|muchisimas gracias|gracias|gracias por todo|ok gracias|listo gracias)$/.test(text))return 'Con mucho gusto 😊';
 return null;
}
/** Preserve administrative context, while answering a standalone courtesy without escalation. */
export function contextReception(event:ReceptionEvent,stage:string,state:ReceptionState):ReceptionResult|null{
 const c=state.context;if(event.fromMe||stage==='HUMAN')return null;
 const text=normalizeText(event.text);
 const review=(reason:string,message:string):ReceptionResult=>({stage:'HUMAN',state:{...state,reason},messages:[message],handoff:reason});
 const courtesy=!c?.continuation&&!c?.quotedText&&!event.quotedText?socialCourtesy(event):null;
 const answerCourtesy=():ReceptionResult=>({stage:stage==='NEW'?(c?.role==='professional'?'PROFESSIONAL':'NEED'):stage,state,messages:[courtesy!]});
 if(c?.role==='ambiguous')return review('Identidad ambigua del contacto','Permíteme consultarlo con Sandra para orientarte bien.');
 if(c?.role==='professional'){
  if(/\b(terapia|consulta|sesion)\b/.test(text)&&/\b(para mi|como paciente|para mi hijo|para mi hija|para mi pareja)\b/.test(text))return null;
  if(/certificad|certificacion|carta laboral/.test(text+' '+normalizeText(c.quotedText||'')))return review('Profesional consulta certificado administrativo pendiente','Gracias por recordárnoslo. Voy a consultar con Sandra cómo va el certificado pendiente.');
  if(/confirm|asisti/.test(text)&&/\b(sesion|cita|paciente|asistencia)\b/.test(text)&&!/\b(reservar|agendar|separar|alquilar)\b/.test(text))return review('Profesional pide confirmar asistencia a una sesión',/desplazar|salir|viaj|irme/.test(text)?'Voy a consultar si la sesión está confirmada antes de que te desplaces.':'Voy a consultar si la persona confirmó su asistencia a la sesión.');
  if(courtesy)return answerCourtesy();
  if(/consultorio|alquiler|reservar (?:un )?espacio/.test(text)||isRentalBookingRequest(event,state))return null;
  if(/^(hola[!.\s😊]*|buenos dias|buenas tardes|buenas noches|buenas)$/.test(text)&&!c.continuation)return {stage:'PROFESSIONAL',state,messages:['Hola 😊 ¿Cómo estás? ¿En qué podemos ayudarte hoy?']};
  return review('Consulta administrativa de profesional; revisar conversación previa','Gracias por escribirnos 😊 Permíteme consultarlo con Sandra.');
 }
 if(c?.continuation)return review('Solicitud anterior sin resolver; revisar contexto','Gracias por recordárnoslo. Voy a revisar lo que quedó pendiente con Sandra.');
 if(courtesy)return answerCourtesy();
 if(c?.hasHistory&&stage==='NEW'&&/^(hola[!.\s😊]*|buenos dias|buenas tardes|buenas noches|buenas)$/.test(text))return {stage:'NEED',state,messages:['Hola 😊 ¿En qué podemos ayudarte con lo que venían conversando?']};
 return null;
}
