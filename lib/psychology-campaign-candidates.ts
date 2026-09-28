import type {Prisma} from '@/prisma/generated/prisma/client';
export type CampaignCandidate={id:number;audience:'client'|'professional';phone:string;lastCompletedAt:Date;marketing:boolean;optedOut:boolean;recent:boolean};

/** Legacy NULL company is accepted only with an actual purchase/visit in company 3. */
export async function campaignCandidates(tx:Prisma.TransactionClient,sourceEvent:string,asOf:string,includeProfessionals:boolean){
 return tx.$queryRaw<CampaignCandidate[]>`
  WITH packages AS (
   SELECT p.* FROM "PaqueteAdquirido" p JOIN "TerapiasPsicologos" s ON s.id=p."catalogoId"
   WHERE p."tenantId"=4 AND s."tenantId"=4 AND s."empresaId"=3 AND COALESCE(p.estado::text,'') NOT IN ('CANCELADO','ANULADO')
  ), services AS (
   SELECT 'client' AS audience,c."pacienteId" AS id,GREATEST(c."horaFin",c."fechaCita") AS at
   FROM "CitasPsicologos" c WHERE c."tenantId"=4 AND c."empresaId"=3 AND c.realizada=true AND c."pacienteId" IS NOT NULL
   UNION ALL SELECT 'client',p."clienteId",p."fechaCompra" FROM packages p WHERE p."clienteId" IS NOT NULL
   UNION ALL SELECT 'professional',c."psicologoId",GREATEST(c."horaFin",c."fechaCita")
   FROM "CitasPsicologos" c JOIN packages p ON p.id=c."paqueteId"
   JOIN "TerapiasPsicologos" s ON s.id=p."catalogoId"
   WHERE c."tenantId"=4 AND c."empresaId"=3 AND c.realizada=true AND c."pacienteId" IS NULL
    AND p."clienteId" IS NULL AND p."usuarioId"=c."psicologoId" AND s.nombre ILIKE '%alquiler%'
   UNION ALL SELECT 'professional',p."usuarioId",p."fechaCompra" FROM packages p WHERE p."clienteId" IS NULL AND p."usuarioId" IS NOT NULL
   UNION ALL SELECT 'professional',r."profesionalId",r.fecha FROM "CargoRecepcion" r
    WHERE r."tenantId"=4 AND r.anulado=false AND EXISTS(SELECT 1 FROM "CitasPsicologos" c WHERE c."psicologoId"=r."profesionalId" AND c."tenantId"=4 AND c."empresaId"=3)
  ), last_service AS (
   SELECT audience,id,MAX(at) AS last_seen FROM services WHERE at<=NOW() GROUP BY audience,id
  ), recipients AS (
   SELECT c.id,'client' AS audience,c.telefono FROM "Cliente" c
    WHERE c."tenantId"=4 AND (c."empresaId"=3 OR c."empresaId" IS NULL) AND c."deletedAt" IS NULL
   UNION ALL SELECT u.id,'professional',u.telefono FROM "Usuario" u
    WHERE ${includeProfessionals} AND u."tenantId"=4 AND (u."empresaId"=3 OR u."empresaId" IS NULL) AND u.activo=true AND u.rol::text='TECNICO'
  ), candidates AS (
   SELECT r.id,r.audience,CASE WHEN length(regexp_replace(r.telefono,'[^0-9]','','g'))=10 THEN '57'||regexp_replace(r.telefono,'[^0-9]','','g') ELSE regexp_replace(r.telefono,'[^0-9]','','g') END AS phone,l.last_seen
   FROM recipients r JOIN last_service l ON l.id=r.id AND l.audience=r.audience
   WHERE l.last_seen < ((${new Date(asOf)}::timestamptz AT TIME ZONE 'America/Bogota')-INTERVAL '6 months') AT TIME ZONE 'America/Bogota'
    AND NOT EXISTS(SELECT 1 FROM "CitasPsicologos" f WHERE f."tenantId"=4 AND f."empresaId"=3 AND f.realizada=false AND COALESCE(f."horaInicio",f."fechaCita")>=NOW()
     AND ((r.audience='client' AND f."pacienteId"=r.id) OR (r.audience='professional' AND f."psicologoId"=r.id)))
  )
  SELECT p.id,p.audience,p.phone,p.last_seen AS "lastCompletedAt",COALESCE(k.marketing,false) AS marketing,COALESCE(k."optedOut",false) AS "optedOut",
   EXISTS(SELECT 1 FROM "PsicologiaBotOutreach" o WHERE o.phone=p.phone AND (o."createdAt">NOW()-INTERVAL '30 days' OR o."sourceEvent"=${sourceEvent})) AS recent
  FROM candidates p LEFT JOIN "PsicologiaBotContactPermission" k ON k.phone=p.phone
  WHERE p.phone ~ '^[1-9][0-9]{7,14}$' ORDER BY p.last_seen,p.audience,p.id`;
}
