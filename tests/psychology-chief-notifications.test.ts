import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {parseChiefNotification,enqueueChiefNotification} from '../lib/psychology-chief-notifications';
import {recordPsychologyStaffTakeover,psychologyStaffSendAllowed,chiefMessageAddressesBot} from '../lib/psychology-staff-ownership';
import {sqlTx} from './psychology-campaign-fixture';

test('chief notices reject arbitrary destinations and require bounded stable identity/content',()=>{
 for(const v of [null,{}, {key:'valid-1',content:''},{key:'x',content:'Hi'}, {key:'valid-1',content:'Hi',phone:'573000000010'}, {key:'valid-1',content:'x'.repeat(6001)}])assert.equal(parseChiefNotification(v),null);
 assert.deepEqual(parseChiefNotification({key:'night:2026-09-30',content:' Resumen '}),{id:'supervisor:night:2026-09-30',content:'Resumen'});
});

test('direct chief orders and unique quoted bot questions authorize one turn without releasing the shared chat',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "CitasPsicologos"(id BIGINT PRIMARY KEY)');
  await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
  await db.exec('ALTER TABLE "PsicologiaBotEvent" ADD COLUMN "quotedText" TEXT');
  const tx=sqlTx(db) as never,phone='573016803926';
  const quote='Sandra, el importe recibido supera el valor esperado. ¿Cómo registramos esa diferencia?';
  await db.query('INSERT INTO "PsicologiaBotConversation"(phone,stage,state) VALUES($1,\'HUMAN\',$2::jsonb)',[phone,JSON.stringify({humanHold:{kind:'staff',since:'2026-09-29T12:00:00Z'},staffMessage:{id:'human',at:'2026-09-29T12:00:00Z'}})]);
  await db.query('INSERT INTO "PsicologiaBotOutbox"(id,phone,content,status,"attemptedAt") VALUES(\'supervisor:question\',$1,$2,\'ACCEPTED\',\'2026-09-29T13:00:00Z\')',[phone,quote]);
  const event={id:'answer',phone,at:'2026-09-30T15:00:00Z',kind:'text' as const,text:'Se redondeó voluntariamente.',quotedText:quote,fromMe:false};
  assert.equal(await chiefMessageAddressesBot(tx,event),true);
  assert.equal(await chiefMessageAddressesBot(tx,{...event,phone:'573000000010'}),false);
  assert.equal(await chiefMessageAddressesBot(tx,{...event,quotedText:'Una pregunta ajena a los mensajes verificados del bot en este chat.'}),false);
  assert.equal(await chiefMessageAddressesBot(tx,{...event,quotedText:quote.slice(0,20)}),false);
  assert.equal(await chiefMessageAddressesBot(tx,{...event,quotedText:undefined,text:'Luisa Fernanda, revisa la diferencia'}),true);
  await db.query('INSERT INTO "PsicologiaBotEvent"(id,phone,"eventAt",kind,text,"quotedText") VALUES($1,$2,$3,\'text\',$4,$5)',[event.id,phone,event.at,event.text,quote]);
  await db.query('INSERT INTO "PsicologiaBotOutbox"(id,phone,content,status) VALUES(\'answer:reply\',$1,\'Entendido\',\'SENDING\')',[phone]);
  assert.equal(await psychologyStaffSendAllowed(tx,'answer:reply',phone),true);
  assert.equal((await db.query<{stage:string}>('SELECT stage FROM "PsicologiaBotConversation" WHERE phone=$1',[phone])).rows[0].stage,'HUMAN');
  await recordPsychologyStaffTakeover(tx,{...event,id:'new-human',at:'2026-09-30T15:01:00Z',text:'Lo reviso personalmente',fromMe:true});
  assert.equal(await psychologyStaffSendAllowed(tx,'answer:reply',phone),false);
 }finally{await db.close();}
});

test('a supervisor report sends once, does not take human ownership and cannot replace a prior payload',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "CitasPsicologos"(id BIGINT PRIMARY KEY)');
  await db.exec(readFileSync('docs/sql/2026-09-28-psychology-automation.sql','utf8'));
  const tx=sqlTx(db) as never,phone='573016803926';
  await db.query('INSERT INTO "PsicologiaBotConversation"(phone) VALUES($1)',[phone]);
  const notice=parseChiefNotification({key:'night:2026-09-30',content:'Resumen verificado'})!;
  assert.equal((await enqueueChiefNotification(tx,notice)).conflict,false);
  assert.equal((await enqueueChiefNotification(tx,notice)).duplicate,true);
  assert.deepEqual(await enqueueChiefNotification(tx,{...notice,content:'Cifras diferentes'}),{conflict:true});
  await db.query('UPDATE "PsicologiaBotOutbox" SET status=\'SENDING\',"attemptedAt"=NOW() WHERE id=$1',[notice.id]);
  assert.equal(await psychologyStaffSendAllowed(tx,notice.id,phone),true);
  assert.equal(await recordPsychologyStaffTakeover(tx,{id:'report-echo',phone,at:new Date().toISOString(),kind:'text',text:notice.content,fromMe:true}),false);
  assert.equal((await db.query<{stage:string}>('SELECT stage FROM "PsicologiaBotConversation" WHERE phone=$1',[phone])).rows[0].stage,'NEW');
  await db.query('UPDATE "PsicologiaBotOutbox" SET status=\'UNCERTAIN\' WHERE id=$1',[notice.id]);
  assert.equal((await enqueueChiefNotification(tx,notice)).status,'UNCERTAIN');
  assert.equal((await db.query<{n:number}>('SELECT COUNT(*)::int n FROM "PsicologiaBotOutbox"')).rows[0].n,1);
 }finally{await db.close();}
});
