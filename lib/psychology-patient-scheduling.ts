import {createHash} from 'node:crypto';
import type {Prisma} from '@/prisma/generated/prisma/client';
import {normalizeText,phoneDigits,type ReceptionEvent,type ReceptionState,type ReceptionResult,type IntakeState} from './psychology-reception';
import type {Understanding} from './psychology-ai';
import {requireLuisaOperator} from './psychology-bot-operator';
import {findBookingCustomer,findBookingProfessional} from './psychology-booking-identity';
import {validateBookingSpecialty,proposeBooking} from './psychology-bot-booking';
import {bookingTimes} from './booking';
import {friendlyDay,friendlyTime} from './psychology-booking-messages';
import {createAuditLog} from './audit';

type Tx=Prisma.TransactionClient;
export type SchedulingQueue=(tx:Tx,id:string,phone:string,text:string)=>Promise<void>;
type Service={id:bigint;nombre:string;categoria:string|null;cantidadSesiones:number;precioBase:unknown};
type Offered={id:string;label:string};
type RequestDetails={customerId:number;professionalId:number;serviceId:string;serviceName:string;date:string;start:string;end?:string;modality:string;room?:string;amount:string;sessionCount:number};
type Request={id:string;customerPhone:string;professionalPhone:string;details:RequestDetails;status:string;sourceEvent:string;questionOutboxId:string;availabilityEvent:string|null;expiresAt:Date;proposalCode:string|null};
export const PATIENT_SCHEDULING_GUARD='native-professional-availability-patient-choice-and-own-user-v1';
const categories:Record<string,string>={individual:'terapia individual',pareja:'terapia de pareja',infantil:'terapia infantil',familiar:'terapia familiar',sexologia:'terapia de sexologia',neuropsicologia:'neuropsicologia',certificado:'apoyo emocional mascotas'};
const money=(n:unknown)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n));
const literalChoice=(text:string,offers:Offered[])=>{
 const s=normalizeText(text).replace(/[.!?¿¡]/g,'').trim();
 const n=/^(?:opcion |la |el |numero )?(\d{1,2})$/.exec(s);
 if(n)return offers[Number(n[1])-1]?.id??null;
 const matches=offers.filter(o=>normalizeText(o.label)===s||s===normalizeText('con '+o.label));
 return matches.length===1?matches[0].id:null;
};
async function ownsOffer(tx:Tx,event:ReceptionEvent,outboxId:string|undefined){
 if(!outboxId)return false;
 const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PsicologiaBotOutbox" WHERE "tenantId"=4 AND id=${outboxId} AND phone=${event.phone} AND status='ACCEPTED' AND "attemptedAt"<=${new Date(event.at)} LIMIT 1`;
 return rows.length===1;
}
async function availableChats(tx:Tx,phones:string[]){
 for(const phone of phones){
  const held=await tx.$queryRaw<{phone:string}[]>`SELECT phone FROM "PsicologiaBotConversation" WHERE "tenantId"=4 AND phone=${phone} AND (stage='HUMAN' OR state->'humanHold' IS NOT NULL) LIMIT 1`;
  const staff=await tx.$queryRaw<{id:string}[]>`SELECT e.id FROM "PsicologiaBotEvent" e WHERE e."tenantId"=4 AND e.phone=${phone} AND e."fromMe"=true AND e.status='PENDING'
   AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" o WHERE o."tenantId"=4 AND o.phone=e.phone AND o.content=e.text AND o.status IN ('SENDING','ACCEPTED','UNCERTAIN') AND o."createdAt">NOW()-INTERVAL '15 minutes') LIMIT 1`;
  if(held.length||staff.length)return false;
 }
 return true;
}

/** The interpreter cannot invent duration: only an exact professional's quoted native reply can supply it. */
export function availabilityEnd(text:string,start:string,end:string|null){
 const s=normalizeText(text);
 if(!/\b(si|confirmo|disponible|puedo atender|tengo disponibilidad)\b/.test(s)||/\b(no|pero|quizas|cambiar|otra|otro|depende|o)\b/.test(s))return null;
 const durations=[...s.matchAll(/\b(\d{1,3}|una?|dos)\s*(horas?|minutos?|min)\b/g)];
 if(durations.length===1){
  const m=durations[0],n=({un:1,una:1,dos:2} as Record<string,number>)[m[1]]??Number(m[1]);
  const minutes=m[2].startsWith('hora')?n*60:n;
  if(minutes<15||minutes>240)return null;
  const [h,k]=start.split(':').map(Number),total=h*60+k+minutes;if(total>=24*60)return null;
  const computed=String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
  return end&&end!==computed?null:computed;
 }
 if(end&&/\b(?:hasta|termina|finaliza)\b/.test(s)){
  const [h,m]=end.split(':').map(Number);
  const times=[...s.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?\b/g)];
  if(times.some(t=>Number(t[1])===h&&Number(t[2]||0)===m||Number(t[1])===h%12&&Number(t[2]||0)===m))return end;
 }
 return null;
}

/** Patient selects a current service and named registered professional; an empty calendar is not availability. */
export async function schedulePatient(tx:Tx,event:ReceptionEvent,state:ReceptionState,intake:IntakeState,u:Understanding,queue:SchedulingQueue):Promise<ReceptionResult>{
 const result=(messages:string[]):ReceptionResult=>({stage:'PREFERENCES',state:{...state,intake},messages});
 const review=(reason:string):ReceptionResult=>({...result(['Tu solicitud sigue pendiente de confirmación. Gracias por tu paciencia.']),stage:'HUMAN',handoff:reason});
 const operator=await requireLuisaOperator(tx);
 if(!await availableChats(tx,[event.phone]))return result([]);
 if((await findBookingCustomer(tx,event.phone))?.id!==intake.clientId)return review('Identidad del paciente no coincide con el registro confirmado');
 const open=await tx.$queryRaw<Request[]>`SELECT r.* FROM "PsicologiaBotAppointmentRequest" r WHERE r."tenantId"=4 AND r."customerPhone"=${event.phone} AND (r.status IN ('WAIT_PROFESSIONAL','AVAILABLE','READY') OR (r.status='PROPOSED' AND EXISTS(SELECT 1 FROM "PsicologiaBotProposal" p WHERE p.code=r."proposalCode" AND p.status='PENDING' AND p."expiresAt">NOW()))) ORDER BY r."createdAt" DESC LIMIT 1 FOR UPDATE`;
 const pending=open[0];
 if(pending){
  if(pending.status==='PROPOSED')return result([]);
  if(pending.expiresAt<=new Date()){await tx.$executeRaw`UPDATE "PsicologiaBotAppointmentRequest" SET status='EXPIRED' WHERE id=${pending.id}`;return review('La solicitud de disponibilidad venció; no reciclar una confirmación antigua');}
  if(!await availableChats(tx,[pending.professionalPhone]))return review('Profesional en atención humana; conservar la solicitud sin enviar otra consulta');
  if(pending.status==='WAIT_PROFESSIONAL')return result([]);
   if((u.date&&u.date!==pending.details.date)||(u.start&&u.start!==pending.details.start)||(u.modality&&u.modality!==pending.details.modality)||(u.professionalId&&u.professionalId!==pending.details.professionalId))return review('Cambio de una solicitud pendiente; verificar antes de sustituirla');
  const d=pending.details;
  if(d.modality==='virtual')d.room='VIRTUAL';
  else{
   if(!d.end)return review('Falta duración respaldada por el profesional');
   const when=bookingTimes(d.date,d.start,d.end);
   const rooms=await tx.consultorios.findMany({where:{tenantId:4,empresaId:3},select:{id:true,nombre:true}});
   const physical=rooms.filter(r=>r.nombre&&!/virtual/i.test(r.nombre));
   const occupied=await tx.citasPsicologos.findMany({where:{tenantId:4,realizada:{not:null},horaInicio:{lt:when.fin},horaFin:{gt:when.inicio}},select:{consultorioId:true}});
   const incomplete=await tx.citasPsicologos.count({where:{tenantId:4,empresaId:3,realizada:{not:null},fechaCita:when.fecha,OR:[{horaInicio:null},{horaFin:null}]}});
   if(incomplete)return review('Agenda del día con horarios incompletos; no afirmar disponibilidad');
   const free=physical.filter(r=>!occupied.some(c=>c.consultorioId===r.id)).map(r=>({id:String(r.id),label:r.nombre!}));
   if(!free.length)return review('No hay consultorio libre para el intervalo confirmado');
   const chosen=await ownsOffer(tx,event,intake.scheduleOffer?.outboxId)?literalChoice(event.text,intake.scheduleOffer?.kind==='room'?intake.scheduleOffer.choices:[]):null;
   if(chosen&&free.some(r=>r.id===chosen))d.room=chosen;
   else{
    const text=`Para ${friendlyDay(d.date)}, de ${friendlyTime(d.start)} a ${friendlyTime(d.end)}, tenemos ${free.map((r,i)=>`${i+1}. ${r.label}`).join('; ')}. ¿Cuál prefieres?`;
    const id=event.id+':schedule-room';intake.scheduleOffer={kind:'room',choices:free,outboxId:id};await queue(tx,id,event.phone,text);return result([]);
   }
  }
  if(!d.end||!d.room)return review('Propuesta sin intervalo o modalidad completos');
  pending.details=d;
  await tx.$executeRaw`UPDATE "PsicologiaBotAppointmentRequest" SET details=${JSON.stringify(d)}::jsonb,status='READY' WHERE id=${pending.id}`;
  const code=await proposeBooking(tx,event,{rawPhone:event.phone,serviceId:d.serviceId,professionalId:String(d.professionalId),room:d.room,date:d.date,start:d.start,end:d.end},queue,{requestId:pending.id});
  await tx.$executeRaw`UPDATE "PsicologiaBotAppointmentRequest" SET status='PROPOSED',"proposalCode"=${code} WHERE id=${pending.id}`;
  intake.appointmentRequestId=pending.id;delete intake.scheduleOffer;return result([]);
 }
 const catalog=await tx.terapiasPsicologos.findMany({where:{tenantId:4,empresaId:3,activo:true},orderBy:{id:'asc'}}) as Service[];
 const prior=intake.returning?catalog.find(s=>String(s.id)===intake.priorServiceId):null;
 const category=categories[state.service||'']||(prior?normalizeText(prior.categoria||''):'');if(!Object.values(categories).includes(category))return review('Servicio solicitado sin catálogo operativo verificado');
 const services=catalog.filter(s=>normalizeText(s.categoria||'')===category);
 if(!services.length)return review('No hay servicio activo coincidente en el catálogo propio');
 if(!intake.serviceId){
  const choices=services.map(s=>({id:String(s.id),label:s.nombre}));
  const chosen=await ownsOffer(tx,event,intake.scheduleOffer?.outboxId)?literalChoice(event.text,intake.scheduleOffer?.kind==='service'?intake.scheduleOffer.choices:[]):null;
  // An explicit service name is safe only when exactly one current catalog row matches it.
  const literal=literalChoice(event.text,choices.filter(c=>normalizeText(c.label)===normalizeText(event.text)));
  if(chosen||literal)intake.serviceId=chosen||literal!;
  else{
   const id=event.id+':schedule-service';intake.scheduleOffer={kind:'service',choices,outboxId:id};
   await queue(tx,id,event.phone,`${services.map((s,i)=>`${i+1}. ${s.nombre}: ${money(s.precioBase)}`).join('\n')}\n¿Cuál opción deseas agendar?`);return result([]);
  }
 }
 const service=services.find(s=>String(s.id)===intake.serviceId);if(!service)return review('El servicio elegido cambió de catálogo');
 if(!intake.professionalId){
  const rows=await tx.usuario.findMany({where:{tenantId:4,activo:true,aprobado:true,rol:'TECNICO',OR:[{empresaId:3},{empresaId:null,CitasPsicologos_CitasPsicologos_psicologoIdToUsuario:{some:{tenantId:4,empresaId:3}}}]},select:{id:true,nombre:true,apellido:true},orderBy:{id:'asc'}});
  const choices:Offered[]=[];
  for(const row of rows){
   try{validateBookingSpecialty(service.categoria,row.id,false);}catch{continue;}
   if(!await findBookingProfessional(tx,row.id))continue;
   choices.push({id:String(row.id),label:`${row.nombre||''} ${row.apellido||''}`.trim()});if(choices.length===6)break;
  }
  if(!choices.length)return review('No hay profesional registrado y verificado para este servicio');
  const chosen=await ownsOffer(tx,event,intake.scheduleOffer?.outboxId)?literalChoice(event.text,intake.scheduleOffer?.kind==='professional'?intake.scheduleOffer.choices:[]):null;
  if(chosen&&choices.some(p=>p.id===chosen))intake.professionalId=Number(chosen);
  else{
   const id=event.id+':schedule-professional';intake.scheduleOffer={kind:'professional',choices,outboxId:id};
   await queue(tx,id,event.phone,`${choices.map((p,i)=>`${i+1}. ${p.label}`).join('\n')}\nPara respetar tu preferencia, ¿con qué profesional deseas agendar?`);return result([]);
  }
 }
 const professional=await findBookingProfessional(tx,intake.professionalId);if(!professional?.telefono)return review('Profesional solicitado sin teléfono propio verificado');
 validateBookingSpecialty(service.categoria,professional.id,false);
 const professionalPhone=phoneDigits(professional.telefono)!;
 if(!await availableChats(tx,[professionalPhone]))return review('Profesional bajo atención humana; no intervenir ni cambiar su disponibilidad');
 if(!intake.date||!intake.start||!intake.modality)return review('Solicitud incompleta antes de consultar disponibilidad');
 const duplicates=await tx.citasPsicologos.count({where:{tenantId:4,empresaId:3,pacienteId:intake.clientId,realizada:false,OR:[{horaInicio:{gte:new Date()}},{horaInicio:null,fechaCita:{gte:new Date()}}]}});
 if(duplicates)return review('El paciente tiene una cita programada; verificar antes de duplicarla');
 const id=createHash('sha256').update(event.id+':patient-availability').digest('hex').slice(0,24),questionId='patient-request:'+id+':availability';
 const d:RequestDetails={customerId:intake.clientId!,professionalId:professional.id,serviceId:String(service.id),serviceName:service.nombre,date:intake.date,start:intake.start,modality:intake.modality,amount:String(service.precioBase),sessionCount:service.cantidadSesiones};
 const expires=new Date(Math.min(new Date(d.date+'T'+d.start+':00-05:00').getTime(),Date.now()+24*3600000));
 await tx.$executeRaw`INSERT INTO "PsicologiaBotAppointmentRequest" (id,"customerPhone","professionalPhone",details,"sourceEvent","questionOutboxId","expiresAt") VALUES (${id},${event.phone},${professionalPhone},${JSON.stringify(d)}::jsonb,${event.id},${questionId},${expires})`;
 await queue(tx,questionId,professionalPhone,`Hola. ¿Puedes atender ${service.nombre.toLowerCase()} ${friendlyDay(d.date)} a las ${friendlyTime(d.start)}, ${d.modality==='virtual'?'en modalidad virtual':'presencial'}? Si tienes disponibilidad, dime hasta qué hora sería la sesión.`);
 await queue(tx,event.id+':schedule-pending',event.phone,'Gracias 😊 Tu horario está pendiente de confirmación; la cita aún no está reservada.');
 await createAuditLog({tenantId:4,usuarioId:operator.id,accion:'BOT_AVAILABILITY_REQUESTED',entidad:'CitaSolicitud',entidadId:id,detalles:{sourceEvent:event.id,serviceId:d.serviceId,professionalId:d.professionalId,professionalChoice:true,availabilityInferred:false},tx});
 intake.appointmentRequestId=id;delete intake.scheduleOffer;return result([]);
}

/** A source bound to one own sent question supplies availability, never a general instruction. */
export async function handlePatientAvailability(tx:Tx,event:ReceptionEvent,u:Understanding|null,queue:SchedulingQueue):Promise<boolean>{
 if(event.fromMe||event.kind!=='text'||!u||u.confidence<.9)return false;
 const rows=await tx.$queryRaw<(Request&{question:string})[]>`SELECT r.*,o.content AS question FROM "PsicologiaBotAppointmentRequest" r JOIN "PsicologiaBotOutbox" o ON o.id=r."questionOutboxId" AND o."tenantId"=4 AND o.phone=r."professionalPhone"
  WHERE r."tenantId"=4 AND r."professionalPhone"=${event.phone} AND r.status='WAIT_PROFESSIONAL' AND r."expiresAt">NOW() AND o.status='ACCEPTED' AND o."attemptedAt"<=${new Date(event.at)} ORDER BY r."createdAt" DESC LIMIT 2 FOR UPDATE OF r`;
 const matches=rows.filter(r=>event.quotedOutboxId===r.questionOutboxId);
 if(matches.length!==1)return false;
 const r=matches[0],d=r.details;
 if(!await availableChats(tx,[event.phone,r.customerPhone]))return true;
 const professional=await findBookingProfessional(tx,d.professionalId);if(phoneDigits(professional?.telefono||'')!==event.phone)return true;
 const operator=await requireLuisaOperator(tx);
 const end=availabilityEnd(event.text,d.start,u.end);
 if(!end||(u.date&&u.date!==d.date)||(u.start&&u.start!==d.start)){
  await tx.$executeRaw`UPDATE "PsicologiaBotAppointmentRequest" SET status='REVIEW',"availabilityEvent"=${event.id} WHERE id=${r.id}`;
  await queue(tx,'patient-request:'+r.id+':review','573016803926',`Solicitud de ${d.serviceName}, ${friendlyDay(d.date)} a las ${friendlyTime(d.start)}. La respuesta del profesional no confirmó un intervalo único. ¿Qué horario y duración deben utilizarse para este caso?`);
  await createAuditLog({tenantId:4,usuarioId:operator.id,accion:'BOT_AVAILABILITY_REVIEW',entidad:'CitaSolicitud',entidadId:r.id,detalles:{sourceEvent:event.id,questionOutboxId:r.questionOutboxId,appointmentCreated:false},tx});return true;
 }
 const when=bookingTimes(d.date,d.start,end);if(when.inicio<=new Date()||when.fin<=when.inicio||(when.fin.getTime()-when.inicio.getTime())>240*60000)throw Error('Respuesta de disponibilidad fuera del intervalo válido');
 d.end=end;
 await tx.$executeRaw`UPDATE "PsicologiaBotAppointmentRequest" SET status='AVAILABLE',details=${JSON.stringify(d)}::jsonb,"availabilityEvent"=${event.id} WHERE id=${r.id}`;
 await createAuditLog({tenantId:4,usuarioId:operator.id,accion:'BOT_AVAILABILITY_VERIFIED',entidad:'CitaSolicitud',entidadId:r.id,detalles:{sourceEvent:event.id,questionOutboxId:r.questionOutboxId,professionalId:d.professionalId,appointmentCreated:false},tx});
 const conversation=await tx.$queryRaw<{state:ReceptionState;stage:string}[]>`SELECT state,stage FROM "PsicologiaBotConversation" WHERE "tenantId"=4 AND phone=${r.customerPhone} FOR UPDATE`;
 if(conversation[0]?.stage!=='PREFERENCES'||conversation[0].state.intake?.appointmentRequestId!==r.id)return true;
 const patientEvent:ReceptionEvent={...event,id:event.id+':patient-next',phone:r.customerPhone,text:''};
 const quiet={...u,date:null,start:null,end:null,professionalId:null};
 const next=await schedulePatient(tx,patientEvent,conversation[0].state,conversation[0].state.intake!,quiet,queue);
 await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET state=${JSON.stringify(next.state)}::jsonb,stage=${next.stage},"updatedAt"=NOW() WHERE "tenantId"=4 AND phone=${r.customerPhone}`;
 if(next.handoff)await queue(tx,'patient-request:'+r.id+':continuation-review','573016803926',`Solicitud de ${d.serviceName}, ${friendlyDay(d.date)}: ${next.handoff}. La cita sigue pendiente.`);
 return true;
}
