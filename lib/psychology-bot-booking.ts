import { createHash } from 'node:crypto';
import type { Prisma } from '@/prisma/generated/prisma/client';
import { bookingTimes } from './booking';
import { lockAndValidateBooking, normalizedRental } from './booking-server';
import { createAuditLog } from './audit';
import { getPackagePaymentState } from './package-payment';
import { phoneDigits, SANDRA_PHONE, type ReceptionEvent } from './psychology-reception';
import {findBookingCustomer,findBookingProfessional} from './psychology-booking-identity';
import {bookingPrompts,bookedMessage,type BookingMessageDetails} from './psychology-booking-messages';
import {requireLuisaOperator} from './psychology-bot-operator';
type Tx=Prisma.TransactionClient;
type Queue=(tx:Tx,id:string,phone:string,text:string)=>Promise<void>;
type Details=BookingMessageDetails&{customerId:number|null;professionalId:number;serviceId:string;professionalName:string};
type Proposal={code:string;customerPhone:string;professionalPhone:string;details:Details;customerConfirmedAt:Date|null;professionalConfirmedAt:Date|null;evidencePath:string|null;evidenceApprovedAt:Date|null;expiresAt:Date;citaId:bigint|null;status:string};

/** IDs verified in company 3; these are operational assignments, not inferred clinical credentials. */
export function validateBookingSpecialty(category:string|null,professionalId:number,rental:boolean){
  if(rental)return;
  const c=(category||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const neuro=c==='neuropsicologia',sexology=c==='terapia de sexologia',certificate=c==='apoyo emocional mascotas';
  if((neuro&&professionalId!==28)||(!neuro&&professionalId===28)||(sexology&&professionalId!==82)||(!sexology&&professionalId===82)||(certificate&&professionalId!==24)){
    throw Error('La asignación del servicio requiere el profesional autorizado; consulta a Sandra.');
  }
}

async function assertBookingChatsAvailable(tx:Tx,customerPhone:string,professionalPhone:string){
  const held=await tx.$queryRaw<{phone:string}[]>`
    SELECT c.phone FROM "PsicologiaBotConversation" c
    WHERE c.phone IN (${customerPhone},${professionalPhone}) AND (
      c.stage='HUMAN' OR EXISTS(
        SELECT 1 FROM "PsicologiaBotEvent" e WHERE e.phone=c.phone AND e."fromMe"=true AND e.status='PENDING'
          AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" o WHERE o.phone=e.phone AND o.content=e.text
            AND o.status IN ('SENDING','ACCEPTED','UNCERTAIN') AND o."createdAt">NOW()-INTERVAL '15 minutes')
      )) LIMIT 1`;
  if(held.length)throw Error('Conversación bajo atención humana: revisar y reanudar antes de confirmar una reserva automática.');
}

export type BookingRequest={rawPhone:string;serviceId:string;professionalId:string;room:string;date:string;start:string;end:string};
/** Only the chief or the verified professional requesting their own rental can propose. */
export async function proposeBooking(tx:Tx,event:ReceptionEvent,{rawPhone,serviceId,professionalId,room,date,start,end}:BookingRequest,queue:Queue,autonomous?:{requestId:string}):Promise<string>{
    const customerPhone=phoneDigits(rawPhone);if(!customerPhone)throw Error('Número inválido');
    const when=bookingTimes(date,start,end);
    if(when.inicio.getTime()<=Date.now()||when.inicio.getTime()>Date.now()+90*86400000)throw Error('La fecha debe estar en los próximos 90 días.');
    const service=await tx.terapiasPsicologos.findFirst({where:{id:BigInt(serviceId),tenantId:4,empresaId:3,activo:true}});
    const professional=await findBookingProfessional(tx,Number(professionalId));
    if(!service||!professional?.telefono)throw Error('Servicio o profesional no verificado en Psicólogos.');
    const professionalPhone=phoneDigits(professional.telefono);if(!professionalPhone)throw Error('Teléfono del profesional inválido.');
    const rental=/alquiler/i.test(service.nombre);
    let requestSource:string|null=null;
    if(autonomous){
      const verified=await tx.$queryRaw<{sourceEvent:string}[]>`SELECT r."sourceEvent" FROM "PsicologiaBotAppointmentRequest" r
       JOIN "PsicologiaBotEvent" e ON e.id=r."availabilityEvent" AND e."tenantId"=4 AND e.phone=r."professionalPhone" AND e."fromMe"=false
       WHERE r.id=${autonomous.requestId} AND r."tenantId"=4 AND r."companyId"=3 AND r.status='READY' AND r."expiresAt">NOW()
        AND r."customerPhone"=${customerPhone} AND r."professionalPhone"=${professionalPhone}
        AND r.details->>'serviceId'=${serviceId} AND r.details->>'professionalId'=${professionalId}
        AND r.details->>'date'=${date} AND r.details->>'start'=${start} AND r.details->>'end'=${end} AND r.details->>'room'=${room} LIMIT 1 FOR UPDATE OF r`;
      if(verified.length!==1||rental||event.phone!==customerPhone)throw Error('Solicitud autónoma sin fuente y alcance verificados.');requestSource=verified[0].sourceEvent;
    }
    if(event.fromMe||(!requestSource&&event.phone!==SANDRA_PHONE&&(!rental||customerPhone!==event.phone||professionalPhone!==event.phone)))throw Error('Propuesta fuera de la identidad autorizada.');
    const operator=await requireLuisaOperator(tx);
    validateBookingSpecialty(service.categoria,professional.id,rental);
    await assertBookingChatsAvailable(tx,customerPhone,professionalPhone);
    const roomId=room.toUpperCase()==='VIRTUAL'?null:BigInt(room);
    const selectedRoom=roomId?await tx.consultorios.findFirst({where:{id:roomId,tenantId:4,empresaId:3}}):null;
    if(roomId&&!selectedRoom)throw Error('Consultorio no verificado.');
    if(rental&&(customerPhone!==professionalPhone||!roomId||start<'07:00'||end>'20:00'))throw Error('Alquiler: profesional registrado, consultorio y horario 07:00–20:00.');
    const customer=rental?null:await findBookingCustomer(tx,customerPhone);
    if(!rental&&!customer)throw Error('Registra o verifica el paciente en Axis; el teléfono no identifica un registro único.');
    const quote=await normalizedRental(tx,4,service.id,when.inicio,when.fin);
    const finalEnd=quote?new Date(quote.fin.getTime()-5*3600000).toISOString().slice(11,16):end;
    if(rental&&finalEnd>'20:00')throw Error('El período de cortesía excede el cierre de las 20:00.');
    await lockAndValidateBooking(tx,{tenantId:4,psicologoId:professional.id,consultorioId:roomId,inicio:when.inicio,fin:quote?.fin??when.fin});
    const missing=await tx.citasPsicologos.count({where:{tenantId:4,realizada:{not:null},fechaCita:when.fecha,AND:[{OR:[{psicologoId:professional.id},...(roomId?[{consultorioId:roomId}]:[])]},{OR:[{horaInicio:null},{horaFin:null}]}]}});
    if(missing)throw Error('Hay citas con horario incompleto. Revisa la agenda antes de proponer.');
    const details:Details={customerId:customer?.id??null,professionalId:professional.id,roomId:roomId?.toString()??null,serviceId:service.id.toString(),date,start,end:finalEnd,rental,serviceName:service.nombre,sessionCount:service.cantidadSesiones,amount:String(quote?.valor??service.precioBase),professionalName:`${professional.nombre||''} ${professional.apellido||''}`.trim()};
    details.roomName=selectedRoom?.nombre||undefined;
    const prompts=bookingPrompts(details,customerPhone);details.customerPrompt=prompts.customer;details.professionalPrompt=prompts.professional;
    const code=createHash('sha256').update(event.id).digest('hex').slice(0,12).toUpperCase();
    const expiresAt=new Date(Math.min(when.inicio.getTime(),Date.now()+24*3600000));
    await tx.$executeRaw`INSERT INTO "PsicologiaBotProposal" (code,"customerPhone","professionalPhone",details,"expiresAt") VALUES (${code},${customerPhone},${professionalPhone},${JSON.stringify(details)}::jsonb,${expiresAt}) ON CONFLICT DO NOTHING`;
    await queue(tx,event.id+':proposal-customer',customerPhone,prompts.customer);
    if(customerPhone!==professionalPhone)await queue(tx,event.id+':proposal-professional',professionalPhone,prompts.professional);
    if(event.phone===SANDRA_PHONE)await queue(tx,event.id+':proposal-chief',SANDRA_PHONE,'El horario quedó pendiente de confirmación.');
    await createAuditLog({tenantId:4,usuarioId:operator.id,accion:'BOT_PROPOSAL',entidad:'CitaPropuesta',entidadId:code,detalles:{sourceEvent:event.id,requestSource,appointmentRequest:autonomous?.requestId??null,details},tx});
    return code;
}

/** Chief's structured request proposes a slot. It does NOT bypass either person's confirmation. */
export async function handleBookingMessage(tx:Tx,event:ReceptionEvent,queue:Queue):Promise<boolean> {
  const propose=/^RESERVAR\s+(\+?\d{8,15})\s+(\d+)\s+(\d+)\s+(\d+|VIRTUAL)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})$/i.exec(event.text.trim());
  if(propose&&event.phone===SANDRA_PHONE) {
    const [,rawPhone,serviceId,professionalId,room,date,start,end]=propose;
    await proposeBooking(tx,event,{rawPhone,serviceId,professionalId,room,date,start,end},queue);
    return true;
  }
  const confirm=/^CONFIRMAR\s+([A-F0-9]{12})$/i.exec(event.text.trim());
  const support=/^SOPORTE\s+([A-F0-9]{12})\s+(https:\/\/\S+)$/i.exec(event.text.trim());
  if(!confirm&&!(support&&event.phone===SANDRA_PHONE))return false;
  const code=(confirm?.[1]??support![1]).toUpperCase();
  const rows=await tx.$queryRaw<Proposal[]>`SELECT * FROM "PsicologiaBotProposal" WHERE code=${code} FOR UPDATE`;
  const p=rows[0];if(!p)return true;
  if(p.status!=='PENDING'||p.expiresAt<=new Date())return true;
  if(confirm&&![p.customerPhone,p.professionalPhone].includes(event.phone))return true;
  await assertBookingChatsAvailable(tx,p.customerPhone,p.professionalPhone);
  if(confirm) {
    if(event.phone===p.customerPhone){p.customerConfirmedAt=new Date();await tx.$executeRaw`UPDATE "PsicologiaBotProposal" SET "customerConfirmedAt"=NOW() WHERE code=${code}`;}
    if(event.phone===p.professionalPhone){p.professionalConfirmedAt=new Date();await tx.$executeRaw`UPDATE "PsicologiaBotProposal" SET "professionalConfirmedAt"=NOW() WHERE code=${code}`;}
    if(!(p.customerConfirmedAt&&p.professionalConfirmedAt))await queue(tx,event.id+':confirmation',event.phone,'Gracias 😊 Te aviso en cuanto tengamos todo confirmado.');
  } else {
    const url=new URL(support![2]);
    const prefix='/storage/v1/object/public/comprobantePagoPsicologos/4/';
    if(url.origin!=='https://supabase.servilutioncrm.cloud'||!url.pathname.startsWith(prefix)||url.search||url.hash)throw Error('Sube primero el soporte a Axis y usa su enlace de comprobante del sistema PSICOLOGOS.');
    const name=decodeURIComponent(url.pathname.slice('/storage/v1/object/public/comprobantePagoPsicologos/'.length));
    const objects=await tx.$queryRaw<{id:string}[]>`SELECT id FROM storage.objects WHERE bucket_id='comprobantePagoPsicologos' AND name=${name} LIMIT 1`;
    if(objects.length!==1)throw Error('El soporte no existe en el almacenamiento de Psicólogos.');
    p.evidencePath=url.href;p.evidenceApprovedAt=new Date();
    await tx.$executeRaw`UPDATE "PsicologiaBotProposal" SET "evidencePath"=${url.href},"evidenceApprovedAt"=NOW() WHERE code=${code}`;
    await createAuditLog({tenantId:4,accion:'BOT_EVIDENCE_APPROVED',entidad:'CitaPropuesta',entidadId:code,detalles:{sourceEvent:event.id,bankVerified:false,path:url.href},tx});
  }
  if(!p.customerConfirmedAt||!p.professionalConfirmedAt)return true;
  if(!p.details.rental&&!p.evidenceApprovedAt) {
    const activePackage=await tx.paqueteAdquirido.findFirst({where:{tenantId:4,clienteId:p.details.customerId,catalogoId:BigInt(p.details.serviceId),estado:'ACTIVO',saldoRestante:{gt:0},OR:[{fechaVencimiento:null},{fechaVencimiento:{gte:bookingTimes(p.details.date,p.details.start,p.details.end).fecha}}]},orderBy:[{fechaCompra:'asc'},{id:'asc'}]});
    const paid=activePackage?await getPackagePaymentState(tx,4,activePackage.id):null;
    if(paid?.estadoPago==='CONCILIADO'){await finalizeBooking(tx,p,event,queue);return true;}
    await queue(tx,'proposal:'+code+':payment-review',SANDRA_PHONE,`La propuesta ${code} tiene ambas confirmaciones. Falta revisar y asociar el comprobante. No se ha registrado pago ni cita.`);
    return true;
  }
  await finalizeBooking(tx,p,event,queue);
  return true;
}
async function finalizeBooking(tx:Tx,p:Proposal,event:ReceptionEvent,queue:Queue) {
  const operator=await requireLuisaOperator(tx);
  const d=p.details;
  const when=bookingTimes(d.date,d.start,d.end);
  // Revalidate all authoritative records in the same transaction that creates the appointment.
  const professional=await findBookingProfessional(tx,d.professionalId);
  const service=await tx.terapiasPsicologos.findFirst({where:{id:BigInt(d.serviceId),tenantId:4,empresaId:3,activo:true}});
  if(!professional?.telefono||phoneDigits(professional.telefono)!==p.professionalPhone||!service)throw Error('Profesional o servicio cambió: requiere nueva propuesta.');
  validateBookingSpecialty(service.categoria,professional.id,d.rental);
  if(service.nombre!==d.serviceName||service.cantidadSesiones!==d.sessionCount||/alquiler/i.test(service.nombre)!==d.rental)throw Error('El servicio o la cantidad de sesiones cambió: requiere nueva propuesta.');
  const quote=await normalizedRental(tx,4,service.id,when.inicio,when.fin);
  if(String(quote?.valor??service.precioBase)!==d.amount)throw Error('La tarifa cambió: requiere nueva propuesta.');
  if(d.customerId&&(await findBookingCustomer(tx,p.customerPhone))?.id!==d.customerId)throw Error('Paciente o teléfono no verificado; requiere revisar identidad.');
  if(d.roomId&&!await tx.consultorios.findFirst({where:{id:BigInt(d.roomId),tenantId:4,empresaId:3}}))throw Error('Consultorio cambió de ámbito.');
  await lockAndValidateBooking(tx,{tenantId:4,psicologoId:d.professionalId,consultorioId:d.roomId?BigInt(d.roomId):null,inicio:when.inicio,fin:when.fin});
  const missing=await tx.citasPsicologos.count({where:{tenantId:4,realizada:{not:null},fechaCita:when.fecha,AND:[{OR:[{psicologoId:d.professionalId},...(d.roomId?[{consultorioId:BigInt(d.roomId)}]:[])]},{OR:[{horaInicio:null},{horaFin:null}]}]}});
  if(missing)throw Error('La agenda tiene horarios incompletos.');
  const owner=d.customerId?{clienteId:d.customerId}:{clienteId:null,usuarioId:d.professionalId};
  let pkg=await tx.paqueteAdquirido.findFirst({where:{tenantId:4,catalogoId:service.id,...owner,estado:'ACTIVO',saldoRestante:{gt:0},OR:[{fechaVencimiento:null},{fechaVencimiento:{gte:when.fecha}}]},orderBy:[{fechaCompra:'asc'},{id:'asc'}]});
  let value=Number(d.amount);
  if(pkg) {
    const consumed=await tx.paqueteAdquirido.updateMany({where:{id:pkg.id,tenantId:4,saldoRestante:{gt:0}},data:{saldoRestante:{decrement:1},sesionesConsumidas:{increment:1}}});
    if(consumed.count!==1)throw Error('Saldo de paquete cambió.');
    value=0; // A subsequent package session must not generate the package price again.
  } else {
    pkg=await tx.paqueteAdquirido.create({data:{tenantId:4,...owner,catalogoId:service.id,sesionesTotales:service.cantidadSesiones,sesionesConsumidas:1,saldoRestante:Math.max(0,service.cantidadSesiones-1),fechaCompra:new Date(),precioPagado:value,estado:'ACTIVO'}});
  }
  const payment=await getPackagePaymentState(tx,4,pkg.id);
  const cita=await tx.citasPsicologos.create({data:{tenantId:4,empresaId:3,creadoPorId:operator.id,pacienteId:d.customerId,psicologoId:d.professionalId,consultorioId:d.roomId?BigInt(d.roomId):null,fechaCita:when.fecha,horaInicio:when.inicio,horaFin:when.fin,valor:value,paqueteId:pkg.id,comprobantePath:p.evidencePath,observacion:`Recepción WhatsApp; propuesta ${p.code}. Soporte sujeto a verificación bancaria.`,...(payment??{})}});
  await tx.$executeRaw`UPDATE "PsicologiaBotProposal" SET status='BOOKED',"citaId"=${cita.id} WHERE code=${p.code}`;
  await createAuditLog({tenantId:4,usuarioId:operator.id,accion:'CREATE',entidad:'Cita',entidadId:cita.id.toString(),detalles:{origin:'WhatsApp',proposal:p.code,sourceEvent:event.id,patientConfirmed:true,professionalConfirmed:true,bankVerified:false,packageId:pkg.id.toString(),value},tx});
  const content=bookedMessage(d);
  await queue(tx,'proposal:'+p.code+':booked-customer',p.customerPhone,content);
  if(p.customerPhone!==p.professionalPhone)await queue(tx,'proposal:'+p.code+':booked-professional',p.professionalPhone,bookedMessage(d));
  // Ordinary agenda changes are available in the nightly report; no extra chief notification.
}
