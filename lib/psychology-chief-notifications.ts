import type {Prisma} from '@/prisma/generated/prisma/client';
import {SANDRA_PHONE} from './psychology-reception';

type Tx=Prisma.TransactionClient;
type Notification={id:string;content:string};
export function parseChiefNotification(input:unknown):Notification|null{
 if(!input||typeof input!=='object')return null;
 const v=input as Record<string,unknown>;
 if(typeof v.key!=='string'||! /^[a-z0-9][a-z0-9:._-]{5,119}$/.test(v.key))return null;
 if(typeof v.content!=='string'||!v.content.trim()||v.content.length>6000)return null;
 // This endpoint is deliberately fixed to the verified chief, never an arbitrary contact.
 if(v.phone!==undefined&&v.phone!==SANDRA_PHONE)return null;
 return {id:'supervisor:'+v.key,content:v.content.trim()};
}

/** Register before transport so the normal sender and echo detector share the same record. */
export async function enqueueChiefNotification(tx:Tx,notice:Notification){
 const inserted=await tx.$executeRaw`INSERT INTO "PsicologiaBotOutbox" (id,phone,content)
  VALUES (${notice.id},${SANDRA_PHONE},${notice.content}) ON CONFLICT DO NOTHING`;
 const row=(await tx.$queryRaw<{status:string;messageId:bigint|null;content:string;phone:string}[]>`
  SELECT status,"messageId",content,phone FROM "PsicologiaBotOutbox" WHERE "tenantId"=4 AND id=${notice.id}`)[0];
 if(!row||row.phone!==SANDRA_PHONE||row.content!==notice.content)return {conflict:true as const};
 return {conflict:false as const,duplicate:inserted===0,id:notice.id,status:row.status,messageId:row.messageId===null?null:String(row.messageId)};
}
