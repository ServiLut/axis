import type {Prisma} from '@/prisma/generated/prisma/client';
import {SANDRA_PHONE,PSYCHOLOGY_PHONE,resumeReception,type ReceptionState} from './psychology-reception';
import type {Understanding} from './psychology-ai';

type Tx=Prisma.TransactionClient;
type IdleSource={id:string;phone:string;eventAt:Date;kind:string;text:string;transcript:string|null;quotedText:string|null;state:ReceptionState};
export async function idleChatSources(tx:Tx,minutes=15,sourceId:string|null=null){
 if(!Number.isInteger(minutes)||minutes<1||minutes>240)throw Error('IDLE_INTERVAL_INVALID');
 return tx.$queryRaw<IdleSource[]>`
  SELECT e.id,e.phone,e."eventAt",e.kind,e.text,e.transcript,e."quotedText",c.state
  FROM "PsicologiaBotConversation" c
  JOIN LATERAL (SELECT * FROM "PsicologiaBotEvent" m WHERE m.phone=c.phone AND m."resumeOf" IS NULL ORDER BY m."eventAt" DESC,m."receivedAt" DESC,m.id DESC LIMIT 1) e ON true
  WHERE c."tenantId"=4 AND c.stage='HUMAN' AND c.phone NOT IN (${SANDRA_PHONE},${PSYCHOLOGY_PHONE})
   AND (c.state->'humanHold'->>'kind'='staff' OR (c.state->'humanHold' IS NULL AND c.state->>'reason'='Atención de una persona' AND COALESCE((c.state->>'alerted')::boolean,false)=false))
   AND e.status='DONE' AND e."fromMe"=false AND e.kind IN ('text','audio') AND e."analysisError" IS NULL
   AND e."eventAt"<=NOW()-(${minutes}*INTERVAL '1 minute') AND e."eventAt">NOW()-INTERVAL '24 hours'
   AND e.text !~* '^(RESERVAR|CONFIRMAR|SOPORTE|PAUSAR|REANUDAR)\\s'
   AND COALESCE(e.analysis->>'intent','') NOT IN ('urgent','stop','courtesy')
   AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotContactPermission" p WHERE p.phone=e.phone AND p."optedOut"=true)
   AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" o WHERE o.phone=e.phone AND o.status IN ('PENDING','SENDING','ACCEPTED','UNCERTAIN') AND o."createdAt">=e."eventAt")
   AND ((${sourceId}::text IS NOT NULL AND e.id=${sourceId}) OR (${sourceId}::text IS NULL AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotEvent" r WHERE r."resumeOf"=e.id)))
  ORDER BY e."eventAt" LIMIT 2`;
}

/** Original DONE events are immutable; a unique internal continuation can be processed once. */
export async function enqueueIdleChatResumes(tx:Tx,minutes=15){
 const candidates=await idleChatSources(tx,minutes);let n=0;
 for(const e of candidates)n+=await tx.$executeRaw`
  INSERT INTO "PsicologiaBotEvent" (id,phone,"eventAt",kind,text,"fromMe",transcript,"resumeOf","quotedText")
  VALUES (${'idle-resume:'+e.id},${e.phone},${e.eventAt},${e.kind},${e.text},false,${e.transcript},${e.id},${e.quotedText}) ON CONFLICT DO NOTHING`;
 return n;
}

export function idleResumeDecision(state:ReceptionState,u:Understanding|null,sourceId:string){
 if(!u||u.confidence<0.9||['unknown','courtesy','stop','urgent','admin','confirm'].includes(u.intent))return null;
 const resumed=resumeReception(state);
 return {...resumed,state:{...resumed.state,resumedFrom:sourceId}};
}

export async function idleReplyStillCurrent(tx:Tx,id:string,phone:string){
 if(!id.startsWith('idle-resume:')||!id.includes(':reply:'))return true;
 const eventId=id.split(':reply:')[0];
 const rows=await tx.$queryRaw<{allowed:boolean}[]>`SELECT EXISTS(SELECT 1 FROM "PsicologiaBotEvent" r JOIN "PsicologiaBotConversation" c ON c.phone=r.phone
  WHERE r.id=${eventId} AND r.phone=${phone} AND r."resumeOf" IS NOT NULL
   AND COALESCE(c.state->'humanHold'->>'kind','') NOT IN ('manual','staff','urgent','optout')
   AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotEvent" m WHERE m.phone=r.phone AND m.id<>r.id AND m."resumeOf" IS NULL AND m."receivedAt">r."receivedAt"
    AND NOT (m."fromMe"=true AND EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" o WHERE o.phone=m.phone AND o.content=m.text AND o.status IN ('SENDING','ACCEPTED','UNCERTAIN'))))) AS allowed`;
 return rows[0]?.allowed===true;
}
