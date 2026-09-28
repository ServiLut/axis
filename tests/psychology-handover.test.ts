import assert from 'node:assert/strict';import {test} from 'node:test';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
import {idleChatSources,enqueueIdleChatResumes,idleReplyStillCurrent} from '../lib/psychology-handover';
test('15 minute staff handover: only waiting incoming message; protected holds, opt-outs, duplicates and new replies excluded',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "CitasPsicologos"(id BIGINT PRIMARY KEY);`);
 await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
 await db.exec(`ALTER TABLE "PsicologiaBotEvent" ADD analysis JSONB,ADD transcript TEXT,ADD "analysisError" TEXT;CREATE TABLE "PsicologiaBotContactPermission"(phone TEXT,"optedOut" BOOLEAN);`);
 await db.exec(readFileSync('docs/sql/2026-09-28-psychology-handover.sql','utf8'));await db.exec(readFileSync('docs/sql/2026-09-28-psychology-handover.sql','utf8'));
 const exec=async(s:TemplateStringsArray,...p:unknown[])=>db.query(s.reduce((a,b,i)=>a+(i?'$'+i:'')+b,''),p);
 const tx={$queryRaw:async(s:TemplateStringsArray,...p:unknown[])=>(await exec(s,...p)).rows,$executeRaw:async(s:TemplateStringsArray,...p:unknown[])=>(await exec(s,...p)).affectedRows} as never;
 await db.exec(`INSERT INTO "PsicologiaBotConversation"(phone,stage,state) VALUES ('573000000010','HUMAN','{"reason":"Atención de una persona","humanHold":{"kind":"staff","resumeStage":"OFFER"}}');
 INSERT INTO "PsicologiaBotEvent"(id,phone,"eventAt",kind,text,status,analysis) VALUES ('original','573000000010',NOW()-INTERVAL '14 minutes','text','Quiero individual','DONE','{"intent":"service"}');`);
 assert.equal((await idleChatSources(tx)).length,0);
 await db.exec(`UPDATE "PsicologiaBotEvent" SET "eventAt"=NOW()-INTERVAL '16 minutes' WHERE id='original'`);assert.equal((await idleChatSources(tx)).length,1);
 for(const kind of ['manual','urgent','review','optout']){await db.query(`UPDATE "PsicologiaBotConversation" SET state=jsonb_set(state,'{humanHold,kind}',$1::jsonb)`,[JSON.stringify(kind)]);assert.equal((await idleChatSources(tx)).length,0)}
 await db.exec(`UPDATE "PsicologiaBotConversation" SET state=jsonb_set(state,'{humanHold,kind}','"staff"');INSERT INTO "PsicologiaBotContactPermission" VALUES('573000000010',true)`);assert.equal((await idleChatSources(tx)).length,0);await db.exec('DELETE FROM "PsicologiaBotContactPermission"');
 assert.equal(await enqueueIdleChatResumes(tx),1);assert.equal(await enqueueIdleChatResumes(tx),0);assert.equal((await idleChatSources(tx,15,'original')).length,1);
 await db.exec(`UPDATE "PsicologiaBotConversation" SET stage='OFFER',state='{}';`);assert.equal(await idleReplyStillCurrent(tx,'idle-resume:original:reply:0','573000000010'),true);
 await db.exec(`INSERT INTO "PsicologiaBotEvent"(id,phone,"eventAt",kind,text,"fromMe","receivedAt") VALUES ('staff-later','573000000010',NOW(),'text','Ya te respondí',true,NOW()+INTERVAL '1 second')`);
 assert.equal(await idleReplyStillCurrent(tx,'idle-resume:original:reply:0','573000000010'),false);
 await db.exec(`UPDATE "PsicologiaBotConversation" SET stage='HUMAN',state='{"humanHold":{"kind":"staff"}}'`);assert.equal((await idleChatSources(tx)).length,0);
 }finally{await db.close()}
});
