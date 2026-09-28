import type {Prisma} from '@/prisma/generated/prisma/client';

/** Caller holds this transaction until both the claim and rate-limit slot are committed. */
export async function claimPsychologyOutbox(tx:Prisma.TransactionClient){
 await tx.$queryRaw`SELECT id FROM "PsicologiaBotConfig" WHERE id=4 FOR UPDATE`;
 // Revoked permissions must also stop already queued promotional messages.
 await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" o SET status='CANCELLED',"lastError"='CONTACT_PERMISSION_REVOKED'
  WHERE status='PENDING' AND id LIKE '%:reactivate:%' AND NOT EXISTS(
   SELECT 1 FROM "PsicologiaBotContactPermission" p WHERE p.phone=o.phone AND p.marketing=true AND p."optedOut"=false)`;
 const items=await tx.$queryRaw<{id:string;phone:string;content:string}[]>`
  UPDATE "PsicologiaBotOutbox" SET status='SENDING',"attemptedAt"=clock_timestamp()
  WHERE id=(SELECT o.id FROM "PsicologiaBotOutbox" o WHERE o.status='PENDING'
   AND (o.id NOT LIKE '%:reactivate:%' OR (
    EXTRACT(HOUR FROM clock_timestamp() AT TIME ZONE 'America/Bogota')>=8
    AND EXTRACT(HOUR FROM clock_timestamp() AT TIME ZONE 'America/Bogota')<19
    AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotConfig" WHERE id=4 AND "marketingNextAt">clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" WHERE id LIKE '%:reactivate:%' AND status='SENDING')))
   AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" p WHERE p.phone=o.phone AND p.status IN ('SENDING','UNCERTAIN'))
   ORDER BY (o.id LIKE '%:reactivate:%'),o."createdAt",o.id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,phone,content`;
 if(items[0]?.id.includes(':reactivate:'))await tx.$executeRaw`UPDATE "PsicologiaBotConfig" SET "marketingNextAt"=clock_timestamp()+INTERVAL '60 seconds' WHERE id=4`;
 return items[0]??null;
}
