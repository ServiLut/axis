import {normalizeText,type ReceptionEvent} from './psychology-reception';
import type {Understanding} from './psychology-ai';
export type BookingMessageDetails={date:string;start:string;end:string;roomId:string|null;roomName?:string;rental:boolean;amount:string;serviceName:string;sessionCount:number;customerPrompt?:string;professionalPrompt?:string;serviceId?:string;professionalId?:number};
export function friendlyDay(date:string){return new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00-05:00'));}
export function friendlyTime(time:string){const [h,m]=time.split(':').map(Number);return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''} ${h<12?'a. m.':'p. m.'}`;}
const amount=(value:string)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value));
const room=(d:BookingMessageDetails)=>d.roomName?'el '+d.roomName.toLowerCase():d.roomId?'el consultorio':'modalidad virtual';
export function bookingPrompts(d:BookingMessageDetails,phone:string){
 const when=`el ${friendlyDay(d.date)}, de ${friendlyTime(d.start)} a ${friendlyTime(d.end)}`;
 const zone=phone.startsWith('57')?'':' (hora de Colombia)';
 const customer=d.rental?`Está disponible ${room(d)} ${when} 😊 El valor es ${amount(d.amount)}. ¿Te lo reservo?`:`Podemos coordinar tu ${d.serviceName.toLowerCase()} ${when}${zone} 😊 El valor es ${amount(d.amount)}${d.sessionCount>1?' por el paquete':''}. ¿Te sirve ese horario?`;
 return {customer,professional:`Hola 😊 ¿Tienes disponibilidad para ${d.serviceName.toLowerCase()} ${when}${d.roomName?', en '+room(d):''}?`};
}
export function bookedMessage(d:BookingMessageDetails){return `Listo 😊 Tu ${d.rental?'reserva':'cita'} quedó para el ${friendlyDay(d.date)}, de ${friendlyTime(d.start)} a ${friendlyTime(d.end)}${d.roomName?', en '+room(d):d.roomId?'':', en modalidad virtual'}.`;}
export function confirmationQuestion(d:Pick<BookingMessageDetails,'date'|'start'|'end'>){return `¿Te reservo el ${friendlyDay(d.date)}, de ${friendlyTime(d.start)} a ${friendlyTime(d.end)}?`;}
export type ConfirmableProposal={code:string;details:BookingMessageDetails};
/** A plain yes refers only to the latest booking question. An explicit day can select one of several proposals. */
export function naturalBookingConfirmation(event:ReceptionEvent,u:Understanding,proposals:ConfirmableProposal[],lastMessage:string){
 if(event.fromMe||u.confidence<.9||!['confirm','accept'].includes(u.intent)||!proposals.length)return null;
 const text=normalizeText(event.text);
 if(/\b(no|pero|cambiar|cambiemos|mejor|otro|otra|cancelar|tal vez|quizas)\b/.test(text))return null;
 const candidates=proposals.filter(p=>(['date','start','end','serviceId','professionalId'] as const).every(k=>u[k]===null||u[k]===undefined||u[k]===p.details[k])&&(!u.roomId||u.roomId===p.details.roomId||normalizeText(p.details.roomName||'').replace(/^consultorio\s*/,'')===u.roomId));
 const days=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
 const explicitDay=days.filter(d=>new RegExp('\\b'+d+'\\b').test(text));
 const dates=text.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g)||[];
 if(explicitDay.length>1||dates.length>1)return null;
 const explicitDate=dates.length===1;
 if(explicitDay.length||explicitDate){
  const matches=candidates.filter(p=>{
   const d=p.details.date,day=normalizeText(friendlyDay(d));const [,m,n]=d.split('-');
   const dateMatches=text.includes(d)||new RegExp('\\b0?'+Number(n)+'\\/0?'+Number(m)+'(?:\\/'+d.slice(0,4)+')?\\b').test(text);
   return (!explicitDay.length||day.startsWith(explicitDay[0]))&&(!explicitDate||dateMatches);
  });
  return matches.length===1?matches[0].code:null;
 }
 if(candidates.length!==1)return null;
 const p=candidates[0];
 return lastMessage===p.details.customerPrompt||lastMessage===p.details.professionalPrompt||lastMessage===confirmationQuestion(p.details)||lastMessage.includes('CONFIRMAR '+p.code)?p.code:null;
}
