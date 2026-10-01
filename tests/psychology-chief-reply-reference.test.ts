import assert from 'node:assert/strict';import {test} from 'node:test';import {PGlite} from '@electric-sql/pglite';
import {readChiefReplyReference} from '../lib/psychology-chatwoot';
import {verifiedChiefQuestion} from '../lib/psychology-staff-ownership';
import {validateReceptionEvent,SANDRA_PHONE,type ReceptionEvent} from '../lib/psychology-reception';
const e:ReceptionEvent={id:'source-event-123',phone:SANDRA_PHONE,fromMe:false,kind:'text',text:'Espero que suene más empático',quotedText:'¿Qué favor necesitas?',at:'2026-10-01T16:56:50Z'};
test('reply reference uses the incoming native source, exact reply ID, recipient and inbox, not duplicate text',async()=>{
 const old=globalThis.fetch,token=process.env.PSICOLOGOS_CHATWOOT_TOKEN;process.env.PSICOLOGOS_CHATWOOT_TOKEN='fixture';
 let detail:any={inbox_id:10,meta:{sender:{phone_number:'+'+SANDRA_PHONE}}};
 const first={id:21495,message_type:1,created_at:1790873643,content:e.quotedText},target={id:21498,message_type:1,created_at:1790873696,content:e.quotedText};
 let source:any={id:21499,message_type:0,created_at:1790873810,source_id:'WAID:'+e.id,content_attributes:{in_reply_to:21498}};
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/messages')?{payload:[first,target,source]}:detail));
 try{
  assert.deepEqual(await readChiefReplyReference(e,4),{conversationId:4,messageId:21498,replyMessageId:21499});
  assert.deepEqual(await readChiefReplyReference(e,4n),{conversationId:4,messageId:21498,replyMessageId:21499});
  for(const patch of [{phone:'573000000001'},{fromMe:true},{kind:'audio' as const}])assert.equal(await readChiefReplyReference({...e,...patch},4),null);
  for(const patch of [{source_id:'WAID:someone-else'},{private:true},{message_type:1},{created_at:1790870000},{content_attributes:{in_reply_to:999}},{inbox_id:9}]){const saved=source;source={...source,...patch};assert.equal(await readChiefReplyReference(e,4),null);source=saved;}
  detail={...detail,inbox_id:9};await assert.rejects(()=>readChiefReplyReference(e,4),/CW_REPLY_SCOPE/);
 }finally{globalThis.fetch=old;if(token===undefined)delete process.env.PSICOLOGOS_CHATWOOT_TOKEN;else process.env.PSICOLOGOS_CHATWOOT_TOKEN=token;}
});
test('short repeated question needs the server-bound outbound ID, with status, time and content rechecked',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "PsicologiaBotOutbox"(id TEXT PRIMARY KEY,"tenantId" INT,phone TEXT,content TEXT,status TEXT,"attemptedAt" TIMESTAMPTZ);`);
  for(const id of ['one','two'])await db.query(`INSERT INTO "PsicologiaBotOutbox" VALUES($1,4,$2,$3,'ACCEPTED','2026-10-01T16:54:00Z')`,[id,SANDRA_PHONE,e.quotedText]);
  const tx={$queryRaw:async(s:TemplateStringsArray,...v:unknown[])=>(await db.query(s.reduce((q,p,i)=>q+(i?'$'+i:'')+p,''),v)).rows};
  assert.equal(await verifiedChiefQuestion(tx as never,e),null);
  assert.equal((await verifiedChiefQuestion(tx as never,{...e,quotedOutboxId:'two'}))?.id,'two');
  for(const patch of [{quotedOutboxId:'missing'},{quotedText:'Otro texto',quotedOutboxId:'two'},{at:'2026-10-01T16:00:00Z',quotedOutboxId:'two'},{phone:'573000000001',quotedOutboxId:'two'}])assert.equal(await verifiedChiefQuestion(tx as never,{...e,...patch}),null);
  await db.query(`UPDATE "PsicologiaBotOutbox" SET status='PENDING' WHERE id='two'`);assert.equal(await verifiedChiefQuestion(tx as never,{...e,quotedOutboxId:'two'}),null);
 }finally{await db.close()}
});
test('webhook cannot inject the internal verified reply reference',()=>{
 const now=Date.parse(e.at);const clean=validateReceptionEvent({...e,quotedOutboxId:'forged'},now,now-1000);assert.ok(clean);assert.equal(clean.quotedOutboxId,undefined);
});
