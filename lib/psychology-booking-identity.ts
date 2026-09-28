import type {Prisma} from '@/prisma/generated/prisma/client';
import {phoneDigits} from './psychology-reception';

type Tx=Prisma.TransactionClient;
type Professional={id:number;nombre:string|null;apellido:string|null;telefono:string|null};
const localPhone=(phone:string)=>phone.startsWith('57')&&phone.length===12?phone.slice(2):phone;

/** Same scope and phone rules when proposing and when committing a booking; no record migration. */
export async function findBookingCustomer(tx:Tx,phone:string):Promise<{id:number}|null>{
 if(phoneDigits(phone)!==phone)return null;
 const local=localPhone(phone);
 const rows=await tx.$queryRaw<{id:number}[]>`
  SELECT c.id FROM "Cliente" c WHERE c."tenantId"=4 AND c."deletedAt" IS NULL
   AND (c."empresaId"=3 OR (c."empresaId" IS NULL AND EXISTS(
    SELECT 1 FROM "CitasPsicologos" v WHERE v."pacienteId"=c.id AND v."tenantId"=4 AND v."empresaId"=3)))
   AND (regexp_replace(c.telefono,'[^0-9]','','g') IN (${phone},${local})
    OR regexp_replace(COALESCE(c.telefono2,''),'[^0-9]','','g') IN (${phone},${local})) LIMIT 2`;
 return rows.length===1?rows[0]:null;
}

export async function findBookingProfessional(tx:Tx,id:number):Promise<Professional|null>{
 if(!Number.isSafeInteger(id)||id<1)return null;
 const rows=await tx.$queryRaw<Professional[]>`
  SELECT u.id,u.nombre,u.apellido,u.telefono FROM "Usuario" u
  WHERE u.id=${id} AND u."tenantId"=4 AND u.activo=true AND u.rol::text='TECNICO'
   AND (u."empresaId"=3 OR (u."empresaId" IS NULL AND EXISTS(
    SELECT 1 FROM "CitasPsicologos" v WHERE v."psicologoId"=u.id AND v."tenantId"=4 AND v."empresaId"=3))) LIMIT 1`;
 const professional=rows[0];const phone=phoneDigits(professional?.telefono||'');
 if(!professional||!phone)return null;
 const local=localPhone(phone);
 const matches=await tx.$queryRaw<{id:number}[]>`
  SELECT u.id FROM "Usuario" u WHERE u."tenantId"=4 AND u.activo=true AND u.rol::text='TECNICO'
   AND (u."empresaId"=3 OR (u."empresaId" IS NULL AND EXISTS(
    SELECT 1 FROM "CitasPsicologos" v WHERE v."psicologoId"=u.id AND v."tenantId"=4 AND v."empresaId"=3)))
   AND regexp_replace(COALESCE(u.telefono,''),'[^0-9]','','g') IN (${phone},${local}) LIMIT 2`;
 return matches.length===1&&matches[0].id===professional.id?professional:null;
}
