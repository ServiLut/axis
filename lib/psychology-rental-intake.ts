import type {Prisma} from '@/prisma/generated/prisma/client';
import type {Understanding,RentalRequestInput} from './psychology-ai';
import {normalizeText,type ReceptionEvent,type ReceptionState,type ReceptionResult} from './psychology-reception';
import {isRentalBookingRequest,readReceptionIdentity} from './psychology-reception-context';
import {bookingTimes,rentalQuote} from './booking';
import {proposeBooking} from './psychology-bot-booking';
import {friendlyDay,friendlyTime,confirmationQuestion} from './psychology-booking-messages';
import {rememberRoomPreferences,roomChoice} from './psychology-room-preferences';

type Tx=Prisma.TransactionClient;
export type RentalSlot=Omit<RentalRequestInput,'requestIndex'>&{sourceEvent:string;proposalCode?:string;existingCitaId?:string};
export type RentalDraft={requests:RentalSlot[]};
type Room={id:bigint;nombre:string};
const roomKey=(s:string)=>normalizeText(s).replace(/^consultorio\s*/,'').trim();
/** A visible room number is NOT its primary key. */
export function matchRentalRoom(rooms:Room[],label:string|null){
 if(!label)return null;
 const matches=rooms.filter(r=>! /virtual/i.test(r.nombre)&&roomKey(r.nombre)===roomKey(label));
 return matches.length===1?matches[0]:null;
}
export function mergeRentalRequests(previous:RentalSlot[],updates:RentalRequestInput[],sourceEvent:string){
 const slots=previous.map(s=>({...s}));
 for(const update of updates){
  const patch={date:update.date,start:update.start,end:update.end,roomLabel:update.roomLabel};
  if(update.requestIndex===null){
   if(slots.some(s=>s.date===patch.date&&s.start===patch.start&&s.end===patch.end&&roomKey(s.roomLabel||'')===roomKey(patch.roomLabel||'')))continue;
   if(slots.length>=4)throw Error('RENTAL_TOO_MANY');
   slots.push({...patch,sourceEvent});
  }else{
   const old=slots[update.requestIndex];if(!old)throw Error('RENTAL_UPDATE_AMBIGUOUS');
   const next={...old,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==null))};
   if((old.proposalCode||old.existingCitaId)&&['date','start','end','roomLabel'].some(k=>next[k as keyof RentalSlot]!==old[k as keyof RentalSlot]))throw Error('RENTAL_PROPOSAL_CHANGED');
   slots[update.requestIndex]=next;
  }
 }
 return slots;
}
const slotLabel=(s:RentalSlot)=>s.date?`el ${friendlyDay(s.date)}`:'tu reserva';

/** Read-only availability; proposal creation and final confirmation repeat all checks transactionally. */
export async function inspectRentalSlot(tx:Tx,professionalId:number,slot:RentalSlot,rooms:Room[],hourlyPrice:string){
 if(!slot.date||!slot.start||!slot.end)return {kind:'incomplete' as const};
 const when=bookingTimes(slot.date,slot.start,slot.end);
 if(when.inicio.getTime()<=Date.now()||when.inicio.getTime()>Date.now()+90*86400000||slot.start<'07:00'||slot.end>'20:00')return {kind:'invalid' as const};
 const quote=rentalQuote((when.fin.getTime()-when.inicio.getTime())/60000,hourlyPrice);
 const end=new Date(when.inicio.getTime()+quote.minutes*60000);
 if(end.getTime()>new Date(slot.date+'T20:00:00-05:00').getTime())return {kind:'invalid' as const};
 const selected=matchRentalRoom(rooms,slot.roomLabel);
 if(slot.roomLabel&&!selected)return {kind:'unknown-room' as const};
 const missing=await tx.citasPsicologos.count({where:{tenantId:4,realizada:{not:null},fechaCita:when.fecha,AND:[{OR:[{psicologoId:professionalId},{consultorioId:{in:rooms.map(r=>r.id)}}]},{OR:[{horaInicio:null},{horaFin:null}]}]}});
 if(missing)return {kind:'incomplete-agenda' as const};
 const occupied=await tx.citasPsicologos.findMany({where:{tenantId:4,realizada:{not:null},horaInicio:{lt:end},horaFin:{gt:when.inicio},OR:[{psicologoId:professionalId},{consultorioId:{in:rooms.map(r=>r.id)}}]},select:{psicologoId:true,consultorioId:true}});
 if(occupied.some(c=>c.psicologoId===professionalId))return {kind:'professional-busy' as const};
 const free=rooms.filter(r=>!occupied.some(c=>c.consultorioId===r.id));
 return {kind:'checked' as const,selected,free,quote};
}

export async function handleRentalIntake(tx:Tx,event:ReceptionEvent,stage:string,state:ReceptionState,u:Understanding):Promise<ReceptionResult|null>{
 if(event.fromMe||event.kind!=='text'||stage==='HUMAN'||['urgent','stop','courtesy'].includes(u.intent))return null;
 if(u.service&&u.service!=='alquiler')return null;
 if(!isRentalBookingRequest(event,state)&&!(u.service==='alquiler'&&u.rentalRequests?.length)&&!u.roomPreferenceChanges?.length)return null;
 const result=(rental:RentalDraft,messages:string[]):ReceptionResult=>({stage:'RENTAL_DETAILS',state:{...state,service:'alquiler',rental},messages});
 const review=(reason:string):ReceptionResult=>({stage:'HUMAN',state:{...state,reason},messages:['Permíteme consultarlo con Sandra para orientarte bien 😊'],handoff:reason});
 if(u.intent==='reject')return review('Cambio o rechazo de alquiler; aclarar cuál horario desea modificar');
 if(u.confidence<.85)return review('Datos de reserva de consultorio ambiguos');
 const identity=await readReceptionIdentity(tx,event.phone);
 if(identity.role!=='professional'||!identity.professionalId)return review('Verificar registro de profesional para alquiler');
 const rooms=(await tx.consultorios.findMany({where:{tenantId:4,empresaId:3},select:{id:true,nombre:true}})).filter((r):r is Room=>!!r.nombre&&! /virtual/i.test(r.nombre));
 if(u.roomPreferenceChanges?.length){
  if(u.confidence<.9)return review('Aclarar preferencia de consultorio antes de recordarla');
  try{state={...state,roomPreferences:rememberRoomPreferences(state.roomPreferences,u.roomPreferenceChanges,rooms,identity.professionalId,event)};}
  catch{return review('Aclarar a quién corresponde la preferencia de consultorio y cuál prefiere');}
 }
 const updates=u.rentalRequests||[];
 const requests=mergeRentalRequests(state.rental?.requests||[],updates,event.id);
 if(u.roomPreferenceChanges?.length&&!updates.length)return result({requests},['Gracias por contármelo 😊 Tendré en cuenta tu preferencia cuando busquemos consultorio.']);
 if(!requests.length)return review('Solicitud de alquiler con horarios sin interpretar');
 const rental={requests};
 // An ambiguous yes must be clarified against the offered booking, not restart unrelated questions.
 if(['confirm','accept'].includes(u.intent)){
  const offered=requests.filter(s=>s.proposalCode&&s.date&&s.start&&s.end&&!s.existingCitaId);
  if(offered.length)return result(rental,[offered.length===1?confirmationQuestion({date:offered[0].date!,start:offered[0].start!,end:offered[0].end!}):'¿Cuál de los horarios deseas confirmar? 😊']);
 }
 const services=await tx.terapiasPsicologos.findMany({where:{tenantId:4,empresaId:3,activo:true,cantidadSesiones:1,nombre:{contains:'alquiler',mode:'insensitive'}},select:{id:true,precioBase:true}});
 if(services.length!==1)return review('Tarifa de alquiler necesita aclaración');
 const messages:string[]=[];let question:string|undefined;
 const ready:{index:number;slot:RentalSlot;roomId:bigint}[]=[];
 for(const [index,slot]of requests.entries()){
  if(slot.proposalCode||slot.existingCitaId)continue;
  // Check an existing booking even when the person omitted duration. Never turn a status question into a duplicate.
  if(slot.date&&slot.start){
   const at=new Date(`${slot.date}T${slot.start}:00-05:00`);
   const existing=await tx.citasPsicologos.findMany({where:{tenantId:4,empresaId:3,psicologoId:identity.professionalId,realizada:{not:null},horaInicio:at},select:{id:true,consultorioId:true,horaFin:true,PaqueteAdquirido:{select:{tenantId:true,TerapiasPsicologos:{select:{tenantId:true,empresaId:true,nombre:true}}}}}});
   if(existing.length>1)return review('Reservas de alquiler duplicadas; revisar antes de confirmar');
   if(existing.length===1){
    const appointment=existing[0],pkg=appointment.PaqueteAdquirido,catalog=pkg?.TerapiasPsicologos;
    // The professional may be attending a patient at this time. That is not their room rental.
    if(pkg?.tenantId!==4||catalog?.tenantId!==4||catalog.empresaId!==3||!/alquiler/i.test(catalog.nombre))return review('Coincide una cita anterior, pero falta verificar que sea un alquiler del profesional');
    const room=rooms.find(r=>r.id===appointment.consultorioId);
    if(!room||!appointment.horaFin||appointment.horaFin.getTime()<=at.getTime())return review('La reserva anterior tiene consultorio u horario incompleto; verificar antes de confirmarla');
    const actualEnd=new Date(appointment.horaFin.getTime()-5*3600000).toISOString().slice(11,16);
    const requestedRoom=matchRentalRoom(rooms,slot.roomLabel);
    let requestedEnd:Date|null=null;
    if(slot.end){
     try{const when=bookingTimes(slot.date,slot.start,slot.end);const quote=rentalQuote((when.fin.getTime()-at.getTime())/60000,String(services[0].precioBase));requestedEnd=new Date(at.getTime()+quote.minutes*60000);}
     catch{return review('Duración solicitada para la reserva anterior necesita aclaración');}
    }
    if((slot.roomLabel&&requestedRoom?.id!==room.id)||(requestedEnd&&requestedEnd.getTime()!==appointment.horaFin.getTime())){
     const requested=`Pidió ${slotLabel(slot)}, desde las ${friendlyTime(slot.start)}${slot.end?' hasta las '+friendlyTime(slot.end):''}${slot.roomLabel?', '+slot.roomLabel:''}.`;
     return review(`Diferencia en reserva existente: ${requested} Ya tiene una reserva de ${friendlyTime(slot.start)} a ${friendlyTime(actualEnd)}, en el ${room.nombre.toLowerCase()}. ¿Conservamos esa reserva o necesita un cambio?`);
    }
    slot.existingCitaId=String(appointment.id);
    messages.push(`Sí 😊 Ya tienes tu reserva para ${slotLabel(slot)}, de ${friendlyTime(slot.start)} a ${friendlyTime(actualEnd)}, en el ${room.nombre.toLowerCase()}.`);
    continue;
   }
  }
  let checked:Awaited<ReturnType<typeof inspectRentalSlot>>;
  try{checked=await inspectRentalSlot(tx,identity.professionalId,slot,rooms,String(services[0].precioBase));}
  catch{return review('Horario o duración del alquiler necesita aclaración');}
  const label=slotLabel(slot);
  if(checked.kind==='incomplete'){
   question??=!slot.date?'Claro 😊 ¿Para qué día necesitas el consultorio?':!slot.start?`¿A qué hora te gustaría reservar ${label}?`:`Para ${label} a las ${friendlyTime(slot.start)}, ¿cuántas horas necesitas?`;
  }else if(checked.kind==='invalid')question??=`¿Puedes confirmar la fecha y duración de ${label}? Reservamos de 7 a. m. a 8 p. m., por horas.`;
  else if(checked.kind==='unknown-room')question??=`¿Cuál consultorio deseas para ${label}? Tenemos ${rooms.map(r=>r.nombre).join(', ')}.`;
  else if(checked.kind==='incomplete-agenda')return review('Agenda de consultorios con horas incompletas; verificar antes de reservar');
  else if(checked.kind==='professional-busy')question??=`Ese horario coincide con otra reserva tuya ${label}. ¿Prefieres que revisemos otro horario?`;
  else if(!checked.selected||!checked.free.some(r=>r.id===checked.selected!.id)){
   const prefix=checked.selected?`El ${checked.selected.nombre.toLowerCase()} está ocupado ${label}, de ${friendlyTime(slot.start!)} a ${friendlyTime(slot.end!)}. `:'';
   question??=checked.free.length?`${prefix}${roomChoice(checked.free,state.roomPreferences,identity.professionalId)}`:`Para ${label}, de ${friendlyTime(slot.start!)} a ${friendlyTime(slot.end!)}, no tenemos consultorios libres. ¿Qué otro horario te sirve?`;
  }else{
   // Avoid a second independent proposal if the same professional already has one outstanding.
   const existing=await tx.$queryRaw<{code:string}[]>`SELECT code FROM "PsicologiaBotProposal" WHERE "customerPhone"=${event.phone} AND status='PENDING' AND "expiresAt">NOW() AND details->>'date'=${slot.date} AND details->>'start'=${slot.start} LIMIT 1`;
   if(existing.length)return review('Existe una propuesta de alquiler pendiente; revisar antes de duplicarla');
   const other=[...requests.filter(s=>s.proposalCode),...ready.map(r=>r.slot)].find(s=>s.date===slot.date&&s.start!<slot.end!&&s.end!>slot.start!);
   if(other){question??=`Los horarios solicitados para ${label} se cruzan. ¿Cuál deseas conservar?`;continue;}
   ready.push({index,slot,roomId:checked.selected.id});
  }
 }
 // All requests are inspected before creating proposals; a later ambiguity cannot strand an unseen proposal.
 for(const {index,slot,roomId}of ready)slot.proposalCode=await proposeBooking(tx,{...event,id:event.id+':rental:'+index},{rawPhone:event.phone,serviceId:String(services[0].id),professionalId:String(identity.professionalId),room:String(roomId),date:slot.date!,start:slot.start!,end:slot.end!},async(_tx,_id,phone,text)=>{if(phone!==event.phone)throw Error('RENTAL_RECIPIENT');messages.push(text);});
 if(question)messages.push(question);
 if(!messages.length&&updates.length===0){
  const pending=requests.filter(s=>s.proposalCode&&s.date&&s.start&&s.end);
  messages.push(pending.length===1?confirmationQuestion({date:pending[0].date!,start:pending[0].start!,end:pending[0].end!}):'¿Cuál de los horarios deseas confirmar? 😊');
 }
 return result(rental,messages);
}
