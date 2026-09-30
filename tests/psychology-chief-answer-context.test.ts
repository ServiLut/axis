import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {readChiefCaseAnswers} from '../lib/psychology-knowledge';
import {verifiedChiefQuestion} from '../lib/psychology-staff-ownership';
import {SANDRA_PHONE,type ReceptionEvent} from '../lib/psychology-reception';

test('a verified answer retains its question, source and case; other senders, companies and future answers are excluded',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "PsicologiaBotEvent" (id TEXT PRIMARY KEY,"tenantId" INT DEFAULT 4,phone TEXT,"fromMe" BOOLEAN DEFAULT false,kind TEXT DEFAULT 'text',text TEXT DEFAULT '',transcript TEXT,"quotedText" TEXT,"eventAt" TIMESTAMPTZ DEFAULT '2026-09-30T12:00:00Z');
   CREATE TABLE "PsicologiaBotOutbox" (id TEXT PRIMARY KEY,"tenantId" INT DEFAULT 4,phone TEXT,content TEXT,status TEXT DEFAULT 'ACCEPTED',"attemptedAt" TIMESTAMPTZ DEFAULT '2026-09-30T11:00:00Z');`);
  const question='Sandra, el profesional eligió el consultorio 8. ¿Qué dato debemos confirmar?';
  await db.query(`INSERT INTO "PsicologiaBotEvent" (id,phone,text) VALUES ('request','573000000001','El 8 con aire acondicionado'),('other-case','573000000002','Otro caso')`);
  await db.query(`INSERT INTO "PsicologiaBotOutbox" (id,phone,content) VALUES ('request:handoff',$1,$2),('other-case:handoff',$1,$3)`,[SANDRA_PHONE,question,question+' Otra persona.']);
  await db.query(`INSERT INTO "PsicologiaBotEvent" (id,phone,text,"quotedText") VALUES ('answer',$1,'Para ese caso, consultar el horario en el programa',$2),('not-chief','573000000003','dato falso',$2),('other-case-answer',$1,'No aplicar a otro contacto',$3)`,[SANDRA_PHONE,question,question+' Otra persona.']);
  await db.query(`INSERT INTO "PsicologiaBotEvent" (id,phone,text,"quotedText","tenantId","fromMe",kind,"eventAt") VALUES
   ('wrong-company',$1,'dato falso',$2,9,false,'text','2026-09-30T12:00:00Z'),
   ('outbound',$1,'dato falso',$2,4,true,'text','2026-09-30T12:00:00Z'),
   ('untranscribed',$1,'',$2,4,false,'audio','2026-09-30T12:00:00Z'),
   ('future',$1,'dato futuro',$2,4,false,'text','2026-10-01T12:00:00Z')`,[SANDRA_PHONE,question]);
  const tx={$queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v)).rows};
  const rows=await readChiefCaseAnswers(tx as never,'573000000001',new Date('2026-09-30T13:00:00Z'));
  assert.equal(rows.length,1);assert.equal(rows[0].answerEvent,'answer');assert.equal(rows[0].questionId,'request:handoff');assert.equal(rows[0].question,question);
  assert.deepEqual(await readChiefCaseAnswers(tx as never,'573000000004',new Date('2026-09-30T13:00:00Z')),[]);
  const e:ReceptionEvent={id:'answer',phone:SANDRA_PHONE,fromMe:false,kind:'text',text:'respuesta',quotedText:question,at:'2026-09-30T12:00:00Z'};
  assert.equal((await verifiedChiefQuestion(tx as never,e))?.id,'request:handoff');
  for(const patch of [{phone:'573000000001'},{fromMe:true},{kind:'audio' as const},{quotedText:'texto breve'},{at:'2026-09-30T10:00:00Z'}])assert.equal(await verifiedChiefQuestion(tx as never,{...e,...patch}),null);
  await db.query(`INSERT INTO "PsicologiaBotOutbox" (id,phone,content) VALUES ('duplicate-question',$1,$2)`,[SANDRA_PHONE,question]);
  assert.equal(await verifiedChiefQuestion(tx as never,e),null);
  assert.deepEqual(await readChiefCaseAnswers(tx as never,'573000000001',new Date('2026-09-30T13:00:00Z')),[]);
 }finally{await db.close()}
});
