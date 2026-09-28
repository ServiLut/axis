import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {campaignCandidates} from '../lib/psychology-campaign-candidates';
import {claimPsychologyOutbox} from '../lib/psychology-outbox';
import {campaignFixture,sqlTx} from './psychology-campaign-fixture';

async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE "Cliente"(id INT PRIMARY KEY,"tenantId" INT,"empresaId" INT,telefono TEXT,"deletedAt" TIMESTAMPTZ);
 CREATE TABLE "CitasPsicologos"(id BIGINT PRIMARY KEY,"tenantId" INT,"empresaId" INT,"pacienteId" INT,realizada BOOLEAN,"horaFin" TIMESTAMPTZ,"horaInicio" TIMESTAMPTZ,"fechaCita" TIMESTAMPTZ);`);
 for(const f of ['automation','autonomy'])await db.exec(readFileSync('docs/sql/2026-09-28-psychology-'+f+'.sql','utf8'));
 await campaignFixture(db);return db;
}
test('campaign recovers legacy patients only with scoped service history; rentals are purchases not provider work',async()=>{
 const db=await fixture();try{
  await db.exec(`INSERT INTO "Cliente" VALUES(1,4,NULL,'3001111101',NULL),(2,4,2,'3001111102',NULL),(3,4,NULL,'3001111103',NULL),(4,4,NULL,'3001111104',NULL);
   INSERT INTO "Usuario" VALUES(1,4,NULL,true,'TECNICO','3001111111'),(2,4,NULL,true,'TECNICO','3001111112'),(3,4,3,true,'TECNICO','3001111113');
   INSERT INTO "TerapiasPsicologos" VALUES(1,4,3,'Alquiler de Consultorio'),(2,4,3,'Terapia individual');
   INSERT INTO "PaqueteAdquirido" VALUES(1,4,NULL,1,1,'ACTIVO',NOW()-INTERVAL '9 months'),(2,4,4,NULL,2,'ACTIVO',NOW()-INTERVAL '1 month'),(3,4,NULL,3,1,'ACTIVO',NOW()-INTERVAL '9 months');
   INSERT INTO "CitasPsicologos"(id,"tenantId","empresaId","pacienteId","psicologoId","paqueteId",realizada,"fechaCita") VALUES
    (1,4,3,1,2,NULL,true,NOW()-INTERVAL '8 months'),(2,4,3,2,2,NULL,true,NOW()-INTERVAL '8 months'),
    (3,4,2,3,2,NULL,true,NOW()-INTERVAL '8 months'),(4,4,3,4,2,NULL,true,NOW()-INTERVAL '8 months'),
    (5,4,3,NULL,1,1,true,NOW()-INTERVAL '8 months'),(6,4,3,4,1,NULL,true,NOW()-INTERVAL '1 month'),
    (7,4,3,NULL,3,3,true,NOW()-INTERVAL '8 months');
   INSERT INTO "CargoRecepcion" VALUES(1,4,3,NOW()-INTERVAL '1 day',false);`);
  const result=await campaignCandidates(sqlTx(db) as never,'test-source',new Date().toISOString(),true);
  assert.deepEqual(result.map(c=>c.audience+':'+c.id).sort(),['client:1','professional:1']);
  assert.ok(result.every(c=>c.marketing===false));
  const clients=await campaignCandidates(sqlTx(db) as never,'test-source',new Date().toISOString(),false);assert.deepEqual(clients.map(c=>c.audience+':'+c.id),['client:1']);
 }finally{await db.close()}
});

test('outbound campaign has a shared 60 second gate, midnight reception stays available, revoked permission cancels',async()=>{
 const db=await fixture();try{
  // Override database clock only in this isolated database for deterministic hour boundaries.
  await db.exec(`CREATE FUNCTION public.clock_timestamp() RETURNS TIMESTAMPTZ LANGUAGE SQL AS $$ SELECT '2026-09-28T18:00:00Z'::timestamptz $$;
   SET search_path=public,pg_catalog;
   INSERT INTO "PsicologiaBotConversation"(phone) VALUES('573016803926');
   INSERT INTO "PsicologiaBotEvent"(id,phone,"eventAt",kind) VALUES('source','573016803926',NOW(),'text');
   INSERT INTO "PsicologiaBotContactPermission"(phone,marketing,"sourceEvent") VALUES('573001111111',true,'source'),('573001111112',true,'source');
   INSERT INTO "PsicologiaBotOutbox"(id,phone,content) VALUES('source:reactivate:1','573001111111','a'),('source:reactivate:2','573001111112','b'),('source:reactivate:3','573001111113','c');`);
  const claim=()=>db.transaction(async d=>claimPsychologyOutbox(sqlTx(d) as never));
  const parallel=await Promise.all([claim(),claim()]);assert.equal(parallel.filter(Boolean).length,1);
  assert.equal((await db.query<{status:string}>(`SELECT status FROM "PsicologiaBotOutbox" WHERE id='source:reactivate:3'`)).rows[0].status,'CANCELLED');
  await db.exec(`UPDATE "PsicologiaBotOutbox" SET status='ACCEPTED' WHERE status='SENDING';
   CREATE OR REPLACE FUNCTION public.clock_timestamp() RETURNS TIMESTAMPTZ LANGUAGE SQL AS $$ SELECT '2026-09-28T18:00:59Z'::timestamptz $$;`);
  assert.equal(await claim(),null);
  await db.exec(`CREATE OR REPLACE FUNCTION public.clock_timestamp() RETURNS TIMESTAMPTZ LANGUAGE SQL AS $$ SELECT '2026-09-28T18:01:00Z'::timestamptz $$;`);
  assert.ok(await claim());
  await db.exec(`UPDATE "PsicologiaBotOutbox" SET status='PENDING';UPDATE "PsicologiaBotConfig" SET "marketingNextAt"=NULL;
   CREATE OR REPLACE FUNCTION public.clock_timestamp() RETURNS TIMESTAMPTZ LANGUAGE SQL AS $$ SELECT '2026-09-29T00:00:00Z'::timestamptz $$;
   INSERT INTO "PsicologiaBotOutbox"(id,phone,content) VALUES('reply','573001111114','reply24h');`);
  assert.equal((await claim())?.id,'reply');assert.equal(await claim(),null);
  await db.exec(`CREATE OR REPLACE FUNCTION public.clock_timestamp() RETURNS TIMESTAMPTZ LANGUAGE SQL AS $$ SELECT '2026-09-29T12:59:59Z'::timestamptz $$;`);assert.equal(await claim(),null);
  await db.exec(`CREATE OR REPLACE FUNCTION public.clock_timestamp() RETURNS TIMESTAMPTZ LANGUAGE SQL AS $$ SELECT '2026-09-29T13:00:00Z'::timestamptz $$;`);assert.ok(await claim());
 }finally{await db.close()}
});
