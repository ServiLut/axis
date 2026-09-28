import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {readChiefKnowledge,knowledgeSearch} from '../lib/psychology-knowledge';

test('recalls an older relevant chief instruction beyond the last twelve lessons with its source',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "PsicologiaBotKnowledge" (id TEXT,"tenantId" INT,instruction TEXT,"sourceEvent" TEXT,"approvedBy" TEXT,active BOOLEAN,"createdAt" TIMESTAMPTZ)`);
  await db.query(`INSERT INTO "PsicologiaBotKnowledge" VALUES ('old-certificate',4,'El certificado de apoyo emocional cuesta 200000 pesos','chief-original','573016803926',true,'2026-01-01')`);
  for(let i=0;i<40;i++)await db.query(`INSERT INTO "PsicologiaBotKnowledge" VALUES ($1,4,'Las listas se revisan sin duplicados',$2,'573016803926',true,NOW())`,['new-'+i,'event-'+i]);
  await db.query(`INSERT INTO "PsicologiaBotKnowledge" VALUES ('wrong-company',9,'Certificado de apoyo emocional gratis','fake','573016803926',true,NOW()),('disabled',4,'Certificado de apoyo emocional gratis','fake','573016803926',false,NOW()),('other-sender',4,'Certificado de apoyo emocional gratis','fake','573001111111',true,NOW())`);
  const tx={$queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v)).rows};
  const rows=await readChiefKnowledge(tx as never,'Hola, cuál es el precio del certificado?');
  assert.equal(rows[0].id,'old-certificate');assert.equal(rows[0].sourceEvent,'chief-original');assert.equal(rows.length,24);
  assert.ok(!rows.some(r=>['wrong-company','disabled','other-sender'].includes(r.id)));
  const general=await readChiefKnowledge(tx as never,'Hola gracias');assert.equal(general.length,24);
 }finally{await db.close()}
});

test('search input cannot become SQL or unrestricted tsquery syntax',()=>{
 assert.match(knowledgeSearch(`certificado '); DROP TABLE x; -- & ! : *`),/^[a-z |]+$/);
 assert.equal(knowledgeSearch('hola 😊 12345'), '');
 assert.ok(!knowledgeSearch('correo@ejemplo.com 3001234567').includes('3001234567'));
 assert.ok(readFileSync('lib/psychology-ai.ts','utf8').includes('no verifica disponibilidad actual'));
});
