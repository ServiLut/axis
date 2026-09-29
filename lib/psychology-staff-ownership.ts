import type {Prisma} from '@/prisma/generated/prisma/client';
import {pauseForStaff,resumeReception,SANDRA_PHONE,type ReceptionEvent,type ReceptionState} from './psychology-reception';

type Tx=Prisma.TransactionClient;

/** Only an explicit direct instruction releases the chief's own shared-account chat. */
export function chiefStaffDecision(event:ReceptionEvent,stage:string,state:ReceptionState){
 if(event.fromMe||event.phone!==SANDRA_PHONE||stage!=='HUMAN')return null;
 const text=event.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[¿?¡!,.;:]/g,' ').replace(/\s+/g,' ').trim();
 const explicit=event.kind==='text'&&(
  /^(?:luisa(?: fernanda)?|bot) (?:por favor )?(?:retoma|reanuda|vuelve a atender) (?:tu )?(?:este chat|nuestro chat|la atencion de este chat)(?: por favor)?$/.test(text)
  ||new RegExp('^reanudar \\+?'+SANDRA_PHONE+'$').test(text));
 const staffAt=state.staffMessage?.at||state.humanHold?.since;
 if(!explicit||(staffAt&&Date.parse(event.at)<=Date.parse(staffAt)))return {action:'observe' as const};
 const next=resumeReception(state);
 next.state.resumedFrom=event.id;next.state.staffReleasedAt=event.at;
 return {action:'release' as const,...next};
}

/** A short transport correlation, never an unbounded match against old replies. */
export async function isPsychologyBotEcho(tx:Tx,event:ReceptionEvent){
 if(!event.fromMe||event.kind!=='text'||!event.text.trim())return false;
 const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PsicologiaBotOutbox"
  WHERE "tenantId"=4 AND phone=${event.phone} AND content=${event.text}
   AND status IN ('SENDING','ACCEPTED','UNCERTAIN') AND "attemptedAt" IS NOT NULL
   AND ABS(EXTRACT(EPOCH FROM ${new Date(event.at)}::timestamptz-"attemptedAt"))<=120 LIMIT 1`;
 return rows.length>0;
}

/** Apply at ingestion, before slow model work. Caller holds the config lock. */
export async function recordPsychologyStaffTakeover(tx:Tx,event:ReceptionEvent){
 if(!event.fromMe||await isPsychologyBotEcho(tx,event))return false;
 const c=(await tx.$queryRaw<{stage:string;state:ReceptionState}[]>`SELECT stage,state FROM "PsicologiaBotConversation" WHERE "tenantId"=4 AND phone=${event.phone} FOR UPDATE`)[0];
 if(!c)return false;
 if(c.state.staffReleasedAt&&Date.parse(c.state.staffReleasedAt)>=Date.parse(event.at))return false;
 const next=pauseForStaff(c.stage,c.state,event.at);
 next.state.staffMessage={id:event.id,at:event.at};
 await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET stage=${next.stage},state=${JSON.stringify(next.state)}::jsonb,"updatedAt"=NOW() WHERE "tenantId"=4 AND phone=${event.phone}`;
 // Preserve independently requested reports and alerts from other chats to the chief.
 await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" o SET status='CANCELLED',"lastError"='STAFF_TAKEOVER' WHERE o."tenantId"=4 AND o.phone=${event.phone} AND o.status='PENDING'
  AND (o.phone<>${SANDRA_PHONE} OR EXISTS(SELECT 1 FROM "PsicologiaBotEvent" e WHERE e."tenantId"=4 AND e.phone=${SANDRA_PHONE} AND e."fromMe"=false AND left(o.id,length(e.id)+1)=e.id||':'))`;
 return true;
}

/** Gate conversational output to every contact, including the chief; preserve independent alerts/reports. */
export async function psychologyStaffSendAllowed(tx:Tx,id:string,phone:string){
 const rows=await tx.$queryRaw<{allowed:boolean}[]>`SELECT EXISTS(
  SELECT 1 FROM "PsicologiaBotOutbox" o WHERE o.id=${id} AND o.phone=${phone} AND o."tenantId"=4 AND o.status='SENDING'
   AND ((${phone}=${SANDRA_PHONE} AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotEvent" e WHERE e."tenantId"=4 AND e.phone=${SANDRA_PHONE} AND e."fromMe"=false AND left(o.id,length(e.id)+1)=e.id||':')) OR (
    NOT EXISTS(SELECT 1 FROM "PsicologiaBotConversation" c WHERE c.phone=o.phone AND c."tenantId"=4
      AND (c.state->'staffMessage' IS NOT NULL OR c.state->'humanHold'->>'kind' IN ('staff','manual')
       OR (c.stage='HUMAN' AND c.state->>'reason'='Atención de una persona')
       OR o."createdAt"<=NULLIF(c.state->>'staffReleasedAt','')::timestamptz))
    AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotEvent" h WHERE h.phone=o.phone AND h."tenantId"=4 AND h."fromMe"=true
      AND h."receivedAt">=o."createdAt"
      AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" b WHERE b.phone=h.phone AND b."tenantId"=4
       AND h.kind='text' AND h.text<>'' AND b.content=h.text AND b.status IN ('SENDING','ACCEPTED','UNCERTAIN')
       AND b."attemptedAt" IS NOT NULL AND ABS(EXTRACT(EPOCH FROM h."eventAt"-b."attemptedAt"))<=120))
   ))) AS allowed`;
 return rows[0]?.allowed===true;
}
