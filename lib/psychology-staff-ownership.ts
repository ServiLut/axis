import type {Prisma} from '@/prisma/generated/prisma/client';
import {pauseForStaff,SANDRA_PHONE,type ReceptionEvent,type ReceptionState} from './psychology-reception';

type Tx=Prisma.TransactionClient;

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
 if(!event.fromMe||event.phone===SANDRA_PHONE||await isPsychologyBotEcho(tx,event))return false;
 const c=(await tx.$queryRaw<{stage:string;state:ReceptionState}[]>`SELECT stage,state FROM "PsicologiaBotConversation" WHERE "tenantId"=4 AND phone=${event.phone} FOR UPDATE`)[0];
 if(!c)return false;
 if(c.state.staffReleasedAt&&Date.parse(c.state.staffReleasedAt)>=Date.parse(event.at))return false;
 const next=pauseForStaff(c.stage,c.state,event.at);
 next.state.staffMessage={id:event.id,at:event.at};
 await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET stage=${next.stage},state=${JSON.stringify(next.state)}::jsonb,"updatedAt"=NOW() WHERE "tenantId"=4 AND phone=${event.phone}`;
 await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED',"lastError"='STAFF_TAKEOVER' WHERE "tenantId"=4 AND phone=${event.phone} AND status='PENDING'`;
 return true;
}

/** Gate every customer output, not just an idle continuation or a campaign. */
export async function psychologyStaffSendAllowed(tx:Tx,id:string,phone:string){
 const rows=await tx.$queryRaw<{allowed:boolean}[]>`SELECT EXISTS(
  SELECT 1 FROM "PsicologiaBotOutbox" o WHERE o.id=${id} AND o.phone=${phone} AND o."tenantId"=4 AND o.status='SENDING'
   AND (${phone}=${SANDRA_PHONE} OR (
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
