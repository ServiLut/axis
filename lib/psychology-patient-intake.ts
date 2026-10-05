import type {Prisma} from '@/prisma/generated/prisma/client';
import {createAuditLog} from './audit';
import {normalizeText,phoneDigits,SANDRA_PHONE,PSYCHOLOGY_PHONE,type ReceptionEvent,type ReceptionState,type ReceptionResult,type PatientDraft,type IntakeState} from './psychology-reception';
import type {Understanding} from './psychology-ai';
import {requireLuisaOperator} from './psychology-bot-operator';
import {schedulePatient,type SchedulingQueue} from './psychology-patient-scheduling';

const fields=['firstName','lastName','documentType','document','email','address'] as const;
const questions:Record<typeof fields[number],string>={firstName:'¿Cuáles son los nombres del paciente?',lastName:'¿Cuáles son sus apellidos?',documentType:'¿El documento es cédula, tarjeta de identidad, cédula de extranjería o pasaporte?',document:'¿Cuál es el número de documento?',email:'¿Cuál es el correo electrónico de contacto?',address:'¿Cuál es la dirección de contacto?'};
function clean(key:typeof fields[number],value:string){
 const v=value.trim().replace(/\s+/g,' ');
 if(key==='firstName'||key==='lastName')return /^[\p{L}\p{M} '\-]{1,100}$/u.test(v)?v:null;
 if(key==='documentType')return /^(CC|TI|CE|PA)$/.test(v)?v:null;
 if(key==='document')return /^[A-Za-z0-9. -]{3,30}$/.test(v)?v.replace(/[. -]/g,'').toUpperCase():null;
 if(key==='email')return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254?v.toLowerCase():null;
 return v.length>=4&&v.length<=300&&!/[<>\x00-\x1f]/.test(v)?v:null;
}
function accepted(text:string){return /^(si|si correcto|si esta bien|si estan bien|correcto|correctos|confirmo|confirmo mis datos|todo (esta )?correcto|estan bien|de acuerdo|asi es)[.!\s😊]*$/.test(normalizeText(text));}

/** Drafts never write patient records until the sender confirms the displayed summary. */
export async function handlePatientIntake(tx:Prisma.TransactionClient,event:ReceptionEvent,stage:string,state:ReceptionState,u:Understanding,queue?:SchedulingQueue):Promise<ReceptionResult|null>{
 if(event.fromMe||[SANDRA_PHONE,PSYCHOLOGY_PHONE].includes(event.phone)||phoneDigits(event.phone)!==event.phone||event.kind!=='text'||!['DATA','DATA_CONFIRM','PREFERENCES'].includes(stage)||state.service==='alquiler'||['urgent','stop'].includes(u.intent))return null;
 const intake:IntakeState={...state.intake,draft:{...state.intake?.draft}};
 const result=(next:string,messages:string[]):ReceptionResult=>({stage:next,state:{...state,intake},messages});
 const review=(reason:string):ReceptionResult=>({...result('HUMAN',['Aún no puedo confirmar el registro. Gracias por tu paciencia.']),handoff:reason});
 if(u.confidence<0.9){
  intake.clarifications=(intake.clarifications||0)+1;
  return intake.clarifications>=2?review('Datos de registro ambiguos tras solicitar aclaración'):result(stage,['Quiero registrar la información correctamente 😊 ¿Me aclaras ese último dato?']);
 }
 intake.clarifications=0;
 if(u.professionalPreference){intake.preference=u.professionalPreference;delete intake.professionalId;}
 if(intake.professionalId&&u.professionalId&&u.professionalId!==intake.professionalId)return review('Cambio del profesional solicitado: verificar preferencia antes de coordinar');
 if(u.date)intake.date=u.date;
 if(u.start)intake.start=u.start;
 if(u.modality)intake.modality=u.modality;
 if(stage==='PREFERENCES')return preferences();
 let changed=false;
 for(const key of fields){
  if(u[key]!==null){
   const value=clean(key,u[key]);
   if(!value)return result('DATA',[questions[key]]);
   if(intake.draft[key]!==value){intake.draft[key]=value;changed=true;}
  }
 }
 const missing=fields.find(key=>!intake.draft[key]);
 if(missing){delete intake.summaryEvent;return result('DATA',[questions[missing]]);}
 const draft=intake.draft as Required<PatientDraft>;
 if(stage==='DATA_CONFIRM'&&!changed&&intake.summaryEvent&&['accept','confirm'].includes(u.intent)&&(u.explicitConsent||accepted(event.text))){
  const summary=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PsicologiaBotOutbox" WHERE id=${intake.summaryEvent+':reply:0'} AND phone=${event.phone} AND status='ACCEPTED' AND "createdAt"<=${new Date(event.at)} LIMIT 1`;
  if(!summary.length)return result('DATA_CONFIRM',['Primero revisa el resumen de tus datos y luego confírmame si está correcto, por favor 😊']);
  // Match both document and phone, including historical formatting, without exposing any record.
  const existing=await tx.$queryRaw<{id:number;inScope:boolean;nombre:string|null;apellido:string|null;numeroDocumento:string|null;tipoDocumento:string|null;telefono:string;telefono2:string|null}[]>`
   SELECT c.id,c.nombre,c.apellido,c."numeroDocumento",c."tipoDocumento",c.telefono,c.telefono2,
    (c."empresaId"=3 OR (c."empresaId" IS NULL AND EXISTS(SELECT 1 FROM "CitasPsicologos" v WHERE v."pacienteId"=c.id AND v."tenantId"=4 AND v."empresaId"=3))) AS "inScope" FROM "Cliente" c
   WHERE "tenantId"=4 AND "deletedAt" IS NULL AND (
    upper(regexp_replace(COALESCE("numeroDocumento",''),'[. -]','','g'))=${draft.document}
    OR regexp_replace(telefono,'[^0-9]','','g') IN (${event.phone},${event.phone.startsWith('57')?event.phone.slice(2):event.phone})
    OR regexp_replace(COALESCE(telefono2,''),'[^0-9]','','g') IN (${event.phone},${event.phone.startsWith('57')?event.phone.slice(2):event.phone})) LIMIT 3`;
  if(existing.length>1)return review('Varios registros coinciden con el teléfono o documento; evitar duplicado');
  const operator=await requireLuisaOperator(tx);
  let created=false;
  if(existing[0]){
   const c=existing[0];
   if(!c.inScope)return review('Registro existente sin empresa de Psicólogos verificada; evitar duplicado');
   if(normalizeText(c.nombre||'')!==normalizeText(draft.firstName)||normalizeText(c.apellido||'')!==normalizeText(draft.lastName)||clean('document',c.numeroDocumento||'')!==draft.document||c.tipoDocumento!==draft.documentType||![phoneDigits(c.telefono),phoneDigits(c.telefono2||'')].includes(event.phone))return review('Documento, titular o teléfono requiere verificar identidad; registro preservado');
   intake.clientId=c.id;
  }else{
   const customer=await tx.cliente.create({data:{tenantId:4,empresaId:3,nombre:draft.firstName,apellido:draft.lastName,numeroDocumento:draft.document,tipoDocumento:draft.documentType,telefono:event.phone,correo:draft.email,direcciones:{create:{tenantId:4,direccion:draft.address}}}});
   intake.clientId=customer.id;created=true;
  }
  await createAuditLog({tenantId:4,usuarioId:operator.id,accion:created?'BOT_CLIENT_CREATED':'BOT_CLIENT_MATCHED',entidad:'Cliente',entidadId:intake.clientId,detalles:{sourceEvent:event.id,summaryEvent:intake.summaryEvent,confirmationBySender:true,scope:'tenant4/company3'},tx});
  delete intake.summaryEvent;
  const next=await preferences();next.messages.unshift(created?'Tu registro quedó guardado 😊':'Identificamos tu registro 😊');return next;
 }
 if(stage==='DATA_CONFIRM'&&u.intent==='reject'&&!changed){delete intake.summaryEvent;return result('DATA',['Claro 😊 ¿Qué dato debo corregir?']);}
 intake.summaryEvent=event.id;
 return result('DATA_CONFIRM',[
  `Confírmame estos datos 😊\nPaciente: ${draft.firstName} ${draft.lastName}\n${draft.documentType}: ${draft.document}\nCorreo: ${draft.email}\nDirección: ${draft.address}\nContacto: +${event.phone} (este chat).\n¿Están correctos para el registro?`,
 ]);

 async function preferences():Promise<ReceptionResult>{
  if(!intake.clientId)return review('Falta identificar el registro antes de agendar');
  if(!intake.preference&&!intake.professionalId)return result('PREFERENCES',['¿Te sentirías más a gusto con un psicólogo o una psicóloga, o no tienes preferencia?']);
  if(!intake.modality)return result('PREFERENCES',['¿Prefieres atención presencial o virtual?']);
  if(!intake.date||!intake.start)return result('PREFERENCES',['¿Qué fecha y hora te quedan mejor? Si tienes varias opciones, cuéntame 😊']);
  const time=new Date(intake.date+'T'+intake.start+':00-05:00').getTime();
  if(!Number.isFinite(time)||time<=Date.now()||time>Date.now()+90*86400000){delete intake.date;delete intake.start;return result('PREFERENCES',['¿Me confirmas la fecha y la hora, por favor? Podemos coordinar citas para los próximos tres meses 😊']);}
  if(queue)return schedulePatient(tx,event,state,intake,u,queue);
  const d=result('HUMAN',['Gracias. El horario solicitado está pendiente de confirmación; la cita aún no está reservada.']);
  d.handoff=`Coordinar disponibilidad: cliente Axis ${intake.clientId}, ${intake.date} ${intake.start}, ${intake.modality}, ${intake.professionalId?'profesional solicitado Axis '+intake.professionalId:'preferencia '+(intake.preference==='male'?'psicólogo':intake.preference==='female'?'psicóloga':'indiferente')}. Datos ya registrados${intake.returning?'; revisar continuidad, tarifa y saldo del paquete antes de cobrar; servicio anterior '+intake.priorServiceId:''}`;
  return d;
 }
}
