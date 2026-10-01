import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {campaignRequestedScope,chiefAction,handleChiefUnderstanding,runChiefReactivationTask} from '../lib/psychology-chief';
import {parseUnderstanding,understandingSchema,type Understanding} from '../lib/psychology-ai';
import {SANDRA_PHONE,type ReceptionEvent} from '../lib/psychology-reception';
import {sqlTx} from './psychology-campaign-fixture';
const text='Luisa buenos días, hoy tratemos de enviar de ocho de la mañana a siete de la noche aunque sea 250 mensajes de clientes que lleven más de cuatro meses que no le hemos hablado';
const event:ReceptionEvent={id:'scope-source',phone:SANDRA_PHONE,kind:'text',text,fromMe:false,at:'2026-10-01T11:55:30Z'};
const base=Object.fromEntries(Object.keys(understandingSchema.properties).map(k=>[k,null]));
const understanding=(patch:Partial<Understanding>={}):Understanding=>parseUnderstanding({...base,intent:'admin',confidence:.99,explicitConsent:false,additionalServices:[],rentalRequests:[],roomPreferenceChanges:[],...patch});

test('a requested four-month conversation interval and message goal never become six-month service history',()=>{
 assert.deepEqual(campaignRequestedScope(text),{inactiveMonths:4,messageGoal:250,criterion:'contact'});
 assert.deepEqual(chiefAction(event,understanding({adminAction:'learn',instruction:'Record this campaign'})),{type:'reactivate'});
 for(const patch of [{phone:'573000000010'},{fromMe:true}])assert.equal(chiefAction({...event,...patch},understanding({adminAction:'reactivate'})),null);
 assert.equal(chiefAction(event,understanding({adminAction:'reactivate',confidence:.8})),null);
 assert.equal(chiefAction(event,understanding({adminAction:'reactivate',instructionUncertainty:'unclear'})),null);
 assert.deepEqual(campaignRequestedScope('clientes con 6 meses sin servicio'),{inactiveMonths:6,messageGoal:null,criterion:'service'});
});

test('unsupported requested scope persists before acknowledgement, pauses old pending campaign and never grants permission or releases staff',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "CitasPsicologos"(id BIGINT PRIMARY KEY);CREATE TABLE "Cliente"(id INT PRIMARY KEY)');
  for(const suffix of ['automation','autonomy'])await db.exec(readFileSync('docs/sql/2026-09-28-psychology-'+suffix+'.sql','utf8'));
  const prior={sourceEvent:'prior',criterion:'service',status:'WAITING_PERMISSION',daily:true,lastRunDate:null,candidateIds:[1]};
  const state={reactivationTask:prior,humanHold:{kind:'staff'},staffMessage:{id:'staff',at:'2026-09-30T21:00:00Z'}};
  await db.query('INSERT INTO "PsicologiaBotConversation"(phone,stage,state) VALUES($1,\'HUMAN\',$2)',[SANDRA_PHONE,JSON.stringify(state)]);
  await db.query('INSERT INTO "PsicologiaBotOutbox"(id,phone,content,status) VALUES(\'prior:reactivate:client:1\',\'573000000010\',\'old\',\'PENDING\'),(\'prior:reactivate:client:2\',\'573000000011\',\'old\',\'ACCEPTED\')');
  const tx=sqlTx(db) as never,messages:string[]=[];
  await handleChiefUnderstanding(tx,event,understanding({adminAction:'reactivate'}),async(_,id,phone,content)=>{
   assert.equal(id,event.id+':chief-result');assert.equal(phone,SANDRA_PHONE);
   const row=(await db.query<{state:typeof state&{reactivationTask:{requestedText:string}}}>('SELECT state FROM "PsicologiaBotConversation" WHERE phone=$1',[SANDRA_PHONE])).rows[0];
   assert.equal(row.state.reactivationTask.requestedText,text);messages.push(content);
  },async()=>{throw Error('No command')});
  const row=(await db.query<{stage:string;state:Record<string,any>}>('SELECT stage,state FROM "PsicologiaBotConversation" WHERE phone=$1',[SANDRA_PHONE])).rows[0];
  assert.equal(row.stage,'HUMAN');assert.deepEqual(row.state.humanHold,state.humanHold);assert.deepEqual(row.state.staffMessage,state.staffMessage);
  assert.equal(row.state.reactivationTask.status,'NEEDS_HISTORY');assert.equal(row.state.reactivationTask.criterion,'contact');
  assert.equal(row.state.reactivationTask.daily,false);assert.equal(row.state.reactivationTask.sourceEvent,event.id);
  assert.equal(row.state.reactivationTask.previousSourceEvent,'prior');assert.equal(row.state.reactivationTask.candidateIds,null);
  assert.deepEqual(row.state.reactivationTask.requestedScope,{inactiveMonths:4,messageGoal:250,criterion:'contact'});
  assert.match(messages[0],/250 mensajes/);assert.doesNotMatch(messages[0],/seis meses|[?¿]|envié|enviados/);
  assert.deepEqual((await db.query('SELECT status FROM "PsicologiaBotOutbox" ORDER BY id')).rows.map((r:any)=>r.status),['CANCELLED','ACCEPTED']);
  assert.equal((await db.query('SELECT * FROM "PsicologiaBotContactPermission"')).rows.length,0);
  await runChiefReactivationTask(tx,async()=>{throw Error('Pending scope must not send')});
 }finally{await db.close()}
});
