import type {Prisma} from '@/prisma/generated/prisma/client';
import type {Understanding,RentalRequestInput} from './psychology-ai';
import {normalizeText,type ReceptionEvent,type ReceptionState,type ReceptionResult} from './psychology-reception';
import {isRentalBookingRequest,readReceptionIdentity} from './psychology-reception-context';
import {bookingTimes,rentalQuote} from './booking';
import {proposeBooking} from './psychology-bot-booking';

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
const slotLabel=(s:RentalSlot)=>s.date?new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',weekday:'long',day:'numeric',month:'numeric'}).format(new Date(s.date+'T12:00:00-05:00')):'la reserva';

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
 if(!isRentalBookingRequest(event,state)&&!(u.service==='alquiler'&&u.rentalRequests?.length))return null;
 const result=(rental:RentalDraft,messages:string[]):ReceptionResult=>({stage:'RENTAL_DETAILS',state:{...state,service:'alquiler',rental},messages});
 const review=(reason:string):ReceptionResult=>({stage:'HUMAN',state:{...state,reason},messages:['Voy a revisar esta reserva con Sandra para darte una respuesta correcta.'],handoff:reason});
 if(u.intent==='reject')return review('Cambio o rechazo de alquiler; aclarar cuál horario desea modificar');
 if(u.confidence<.85)return review('Datos de reserva de consultorio ambiguos');
 const identity=await readReceptionIdentity(tx,event.phone);
 if(identity.role!=='professional'||!identity.professionalId)return review('Verificar registro de profesional para alquiler');
 const updates=u.rentalRequests||[];
 const requests=mergeRentalRequests(state.rental?.requests||[],updates,event.id);
 if(!requests.length)return review('Solicitud de alquiler con horarios sin interpretar');
 const rental={requests};
 const services=await tx.terapiasPsicologos.findMany({where:{tenantId:4,empresaId:3,activo:true,cantidadSesiones:1,nombre:{contains:'alquiler',mode:'insensitive'}},select:{id:true,precioBase:true}});
 if(services.length!==1)return review('Tarifa de alquiler necesita aclaración');
 const rooms=(await tx.consultorios.findMany({where:{tenantId:4,empresaId:3},select:{id:true,nombre:true}})).filter((r):r is Room=>!!r.nombre&&! /virtual/i.test(r.nombre));
 const messages:string[]=[];let question:string|undefined;
 const ready:{index:number;slot:RentalSlot;roomId:bigint}[]=[];
 for(const [index,slot]of requests.entries()){
  if(slot.proposalCode||slot.existingCitaId)continue;
  // Check an existing booking even when the person omitted duration. Never turn a status question into a duplicate.
  if(slot.date&&slot.start){
   const at=new Date(`${slot.date}T${slot.start}:00-05:00`);
   const existing=await tx.citasPsicologos.findMany({where:{tenantId:4,empresaId:3,psicologoId:identity.professionalId,realizada:{not:null},horaInicio:at},select:{id:true,consultorioId:true,horaFin:true}});
   if(existing.length>1)return review('Reservas de alquiler duplicadas; revisar antes de confirmar');
   if(existing.length===1){
    const room=rooms.find(r=>r.id===existing[0].consultorioId);
    slot.existingCitaId=String(existing[0].id);
    messages.push(`En Axis ya aparece una reserva tuya para ${slotLabel(slot)} a las ${slot.start}${room?', '+room.nombre:''}. No crearé otra para ese horario.`);
    continue;
   }
  }
  let checked:Awaited<ReturnType<typeof inspectRentalSlot>>;
  try{checked=await inspectRentalSlot(tx,identity.professionalId,slot,rooms,String(services[0].precioBase));}
  catch{return review('Horario o duración del alquiler necesita aclaración');}
  const label=slotLabel(slot);
  if(checked.kind==='incomplete'){
   const missing=[!slot.date?'qué día':null,!slot.start?'a qué hora empieza':null,!slot.end?'hasta qué hora lo necesitas':null,!slot.roomLabel?'en qué consultorio':null].filter(Boolean);
   question??=`Para ${label}${slot.start?' a las '+slot.start:''}, ¿${missing.join(' y ')}?`;
  }else if(checked.kind==='invalid')question??=`¿Puedes confirmar la fecha y duración de ${label}? Reservamos de 7 a. m. a 8 p. m., por horas.`;
  else if(checked.kind==='unknown-room')question??=`¿Cuál consultorio deseas para ${label}? Tenemos ${rooms.map(r=>r.nombre).join(', ')}.`;
  else if(checked.kind==='incomplete-agenda')return review('Agenda de consultorios con horas incompletas; verificar antes de reservar');
  else if(checked.kind==='professional-busy')question??=`Ya tienes una reserva que se cruza con ${label}, ${slot.start}–${slot.end}. ¿Qué otro horario te sirve?`;
  else if(!checked.selected||!checked.free.some(r=>r.id===checked.selected!.id)){
   const prefix=checked.selected?`${checked.selected.nombre} está ocupado para ${label}, ${slot.start}–${slot.end}. `:'';
   question??=checked.free.length?`${prefix}Están disponibles ${checked.free.map(r=>r.nombre).join(', ')}. ¿Cuál prefieres?`:`Para ${label}, ${slot.start}–${slot.end}, no encontré consultorios libres. ¿Qué otro horario te sirve?`;
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
 if(!messages.length&&updates.length===0)messages.push('La propuesta está pendiente de tu confirmación 😊 Responde con el código del horario que deseas reservar.');
 return result(rental,messages);
}
