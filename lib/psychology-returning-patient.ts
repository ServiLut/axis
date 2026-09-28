import type {Prisma} from '@/prisma/generated/prisma/client';
import {createAuditLog} from './audit';
import {normalizeText,phoneDigits,SANDRA_PHONE,PSYCHOLOGY_PHONE,type ReceptionEvent,type ReceptionState,type ReceptionResult,type IntakeState} from './psychology-reception';
import type {Understanding} from './psychology-ai';
import {handlePatientIntake} from './psychology-patient-intake';

/** Recognize a returning caller without modifying a patient, appointment or payment. */
export async function handleReturningPatient(tx:Prisma.TransactionClient,e:ReceptionEvent,stage:string,state:ReceptionState,u:Understanding):Promise<ReceptionResult|null>{
 if(e.fromMe||e.kind!=='text'||[SANDRA_PHONE,PSYCHOLOGY_PHONE].includes(e.phone)||phoneDigits(e.phone)!==e.phone||!['NEW','NEED','MENU'].includes(stage)||state.service==='alquiler'||u.confidence<0.9||!['accept','preferences','appointment'].includes(u.intent)||u.service)return null;
 const text=normalizeText(e.text);
 if(!/(?:quiero|decido|deseo|quisiera|me gustaria|voy a)\s+(?:continuar|seguir|retomar)/.test(text)||/\bno\s+(?:quiero|deseo|quisiera|voy a)\b/.test(text))return null;
 const review=(reason:string):ReceptionResult=>({stage:'HUMAN',state:{...state,reason},messages:['Claro 😊 Voy a pedir apoyo a Sandra para revisar tu continuidad.'],handoff:reason});
 const localPhone=e.phone.startsWith('57')&&e.phone.length===12?e.phone.slice(2):e.phone;
 const customers=await tx.$queryRaw<{id:number}[]>`
  SELECT c.id FROM "Cliente" c WHERE c."tenantId"=4 AND c."deletedAt" IS NULL AND (c."empresaId"=3 OR c."empresaId" IS NULL)
   AND (regexp_replace(c.telefono,'[^0-9]','','g') IN (${e.phone},${localPhone}) OR regexp_replace(COALESCE(c.telefono2,''),'[^0-9]','','g') IN (${e.phone},${localPhone}))
   AND EXISTS(SELECT 1 FROM "CitasPsicologos" v WHERE v."pacienteId"=c.id AND v."tenantId"=4 AND v."empresaId"=3 AND v.realizada=true AND v."fechaCita"<=NOW()) LIMIT 2`;
 if(customers.length!==1)return review('Continuidad: verificar identidad y registro; teléfono sin coincidencia única con atención previa');
 const visits=await tx.$queryRaw<{id:bigint;professionalId:number|null;professionalName:string|null;professionalActive:boolean;serviceId:bigint|null;serviceName:string|null}[]>`
  SELECT c.id,c."psicologoId" AS "professionalId",u.nombre AS "professionalName",
   COALESCE(u.activo AND u.rol::text='TECNICO' AND u."tenantId"=4 AND (u."empresaId"=3 OR u."empresaId" IS NULL),false) AS "professionalActive",
   s.id AS "serviceId",s.nombre AS "serviceName"
  FROM "CitasPsicologos" c LEFT JOIN "Usuario" u ON u.id=c."psicologoId"
   LEFT JOIN "PaqueteAdquirido" p ON p.id=c."paqueteId" AND p."tenantId"=4 AND p."clienteId"=${customers[0].id}
   LEFT JOIN "TerapiasPsicologos" s ON s.id=p."catalogoId" AND s."tenantId"=4 AND s."empresaId"=3
  WHERE c."pacienteId"=${customers[0].id} AND c."tenantId"=4 AND c."empresaId"=3 AND c.realizada=true AND c."fechaCita"<=NOW()
  ORDER BY c."fechaCita" DESC,c.id DESC LIMIT 1`;
 const last=visits[0];if(!last?.professionalActive||!last.professionalId||!last.serviceId)return review('Continuidad: profesional previo o servicio necesita verificación');
 if(/alquiler|consultorio/.test(normalizeText(last.serviceName||'')))return review('Continuidad: verificar servicio anterior de alquiler antes de coordinar atención');
 const upcoming=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM "CitasPsicologos" WHERE "pacienteId"=${customers[0].id} AND "tenantId"=4 AND "empresaId"=3 AND realizada=false AND COALESCE("horaInicio","fechaCita")>=NOW() LIMIT 1`;
 if(upcoming.length)return review('Continuidad: revisar cita futura existente antes de proponer otra');
 const firstName=normalizeText(last.professionalName||'').split(/\s+/)[0];
 const named=firstName.length>=3&&text.split(/[^\p{L}\p{N}]+/u).includes(firstName);
 // Negation or a requested change must never retain the old professional silently.
 const changing=/\b(?:no|otro|otra|cambiar|cambio|diferente|distinto|distinta)\b/.test(text);
 const same=!changing&&(named||/\b(?:mismo|misma)\s+(?:profesional|psicologo|psicologa)\b/.test(text));
 const intake:IntakeState={draft:{},clientId:customers[0].id,returning:true,priorAppointmentId:String(last.id),priorServiceId:String(last.serviceId),...(same?{professionalId:last.professionalId}:{})};
 if(u.professionalPreference)intake.preference=u.professionalPreference;
 if(u.date)intake.date=u.date;if(u.start)intake.start=u.start;if(u.modality)intake.modality=u.modality;
 await createAuditLog({tenantId:4,accion:'BOT_RETURNING_PATIENT_MATCHED',entidad:'Cliente',entidadId:customers[0].id,detalles:{sourceEvent:e.id,priorAppointmentId:String(last.id),professionalRequested:same?last.professionalId:null,patientChanged:false,appointmentCreated:false},tx});
 // Reuse the same preference collector and final handoff as a confirmed new intake.
 const next=await handlePatientIntake(tx,e,'PREFERENCES',{...state,intake},u);
 if(next?.messages.length&&!next.handoff)next.messages[0]='Claro 😊 '+next.messages[0];
 return next;
}
