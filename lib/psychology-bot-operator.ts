import {randomBytes} from 'node:crypto';
import bcrypt from 'bcrypt';
import type {Prisma} from '@/prisma/generated/prisma/client';
import {createAuditLog} from './audit';

export const LUISA_USERNAME='luisa.fernanda.bot';
export const LUISA_AUTHORIZATION='direct-user-20261005-own-user-and-routine-booking';
export const LUISA_OPERATOR_GUARD='own-service-user-scoped-writes-and-audit-v1';
type Tx=Prisma.TransactionClient;
export type LuisaOperator={id:number;username:string;role:string};
export function isLuisaServiceUser(username:unknown){return username===LUISA_USERNAME;}

/** No shared staff credentials, interactive login, payment entry or cross-company authority. */
export async function readLuisaOperator(tx:Tx):Promise<LuisaOperator|null>{
 const rows=await tx.$queryRaw<LuisaOperator[]>`SELECT u.id,u.username,u.rol::text AS role
  FROM "PsicologiaBotOperator" o JOIN "Usuario" u ON u.id=o."usuarioId"
  WHERE o.id=4 AND o.enabled=true AND o."authorization"=${LUISA_AUTHORIZATION}
   AND u."tenantId"=4 AND u."empresaId"=3 AND u.username=${LUISA_USERNAME}
   AND u.email='luisa.fernanda.bot@automation.invalid' AND u.activo=true AND u.aprobado=true AND u.rol::text='ASESOR'`;
 return rows.length===1?rows[0]:null;
}
export async function requireLuisaOperator(tx:Tx){
 const operator=await readLuisaOperator(tx);if(!operator)throw Error('LUISA_OPERATOR_NOT_READY');return operator;
}
export async function provisionLuisaOperator(tx:Tx){
 await tx.$queryRaw`SELECT id FROM "PsicologiaBotConfig" WHERE id=4 FOR UPDATE`;
 const existing=await readLuisaOperator(tx);if(existing)return {created:false,operator:existing};
 const bound=await tx.$queryRaw<{id:number}[]>`SELECT id FROM "PsicologiaBotOperator" WHERE id=4`;
 if(bound.length)throw Error('LUISA_OPERATOR_REQUIRES_REVIEW');
 const collision=await tx.usuario.findFirst({where:{OR:[{username:LUISA_USERNAME},{email:'luisa.fernanda.bot@automation.invalid'}]},select:{id:true}});
 if(collision)throw Error('LUISA_IDENTITY_COLLISION');
 // .invalid is a technical identifier, not an invented or provisioned email inbox.
 // The random secret is never returned or saved in clear text. Only the own integration can act.
 const password=await bcrypt.hash(randomBytes(48).toString('base64url'),12);
 const user=await tx.usuario.create({data:{tenantId:4,empresaId:3,username:LUISA_USERNAME,email:'luisa.fernanda.bot@automation.invalid',password,nombre:'Luisa Fernanda',apellido:'Asistente virtual',rol:'ASESOR',activo:true,aprobado:true}});
 await tx.$executeRaw`INSERT INTO "PsicologiaBotOperator" (id,"usuarioId","authorization") VALUES (4,${user.id},${LUISA_AUTHORIZATION})`;
 await createAuditLog({tenantId:4,usuarioId:user.id,accion:'BOT_OPERATOR_CREATED',entidad:'Usuario',entidadId:user.id,detalles:{authorization:LUISA_AUTHORIZATION,companyId:3,username:LUISA_USERNAME,interactiveLogin:false,permissions:['confirmed-patient-registration','confirmed-appointment-creation'],financialWrites:false,marketing:false},tx});
 return {created:true,operator:await requireLuisaOperator(tx)};
}
