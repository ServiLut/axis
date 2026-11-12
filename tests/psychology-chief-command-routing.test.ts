import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {loadServerModule} from './load-server-module';
import * as reception from '../lib/psychology-reception';
import * as commands from '../lib/psychology-chief-commands';
import * as ownership from '../lib/psychology-staff-ownership';
import * as messages from '../lib/psychology-chief-messages';
import * as bookingMessages from '../lib/psychology-booking-messages';
import type * as Automation from '../lib/psychology-automation';
import type * as Preparation from '../lib/psychology-ai-preparation';
import type * as Booking from '../lib/psychology-bot-booking';
import type * as Identity from '../lib/psychology-booking-identity';
import type * as Scheduling from '../lib/psychology-patient-scheduling';

const {SANDRA_PHONE,PSYCHOLOGY_PHONE}=reception;
const customerPhone='573000000010',professionalPhone='573000000020';
const code='ABCDEF123456';
const supportUrl='https://supabase.servilutioncrm.cloud/storage/v1/object/public/comprobantePagoPsicologos/4/fixture.pdf';
const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
const reserve=`RESERVAR ${customerPhone} 1 29 1 ${date} 10:00 11:00`;
const support=`SOPORTE ${code} ${supportUrl}`;
const resume=`REANUDAR ${customerPhone}`;
const priorAt=new Date(Date.now()-60000).toISOString();
type Options={event?:Partial<reception.ReceptionEvent>&{transcript?:string|null};prepared?:boolean;unknown?:boolean;lateStaff?:boolean;heldBooking?:boolean;missingCustomer?:boolean;missingProfessional?:boolean;hold?:reception.ReceptionState['humanHold'];chiefLate?:boolean;natural?:boolean;operatorUnavailable?:boolean};

/** Exercise the public worker through preparation, processOne, its real chief gate
 * and real booking/admin handlers. All persistence and external calls are mocks.
 */
function fixture(text:string,options:Options={}){
 const event={id:'fixture-chief-command',phone:SANDRA_PHONE,kind:'text' as const,text,fromMe:false,at:new Date().toISOString(),...options.event};
 const row={...event,eventAt:new Date(event.at),analysis:options.prepared?{fixture:true}:null,analysisError:null,transcript:options.event?.transcript||null,resumeOf:null};
 const initial:reception.ReceptionState={context:{role:'unknown',hasHistory:true,coverage:'fixture',continuation:false},intake:{draft:{firstName:'Fixture'}},humanHold:options.hold||{kind:'staff',resumeStage:'DATA',since:priorAt},staffMessage:{id:'prior-staff',at:priorAt}};
 const conversations=new Map<string,{stage:string;state:reception.ReceptionState}>([
  [SANDRA_PHONE,{stage:'HUMAN',state:{humanHold:{kind:'staff',since:priorAt},staffMessage:{id:'chief-staff',at:priorAt}}}],
  ...(options.unknown?[]:[[customerPhone,{stage:'HUMAN',state:structuredClone(initial)}] as [string,{stage:string;state:reception.ReceptionState}]]),
 ]);
 const outbox:{id:string;phone:string;content:string}[]=[],audits:any[]=[],writes:string[]=[],scoped:any[]=[],availabilityEvents:reception.ReceptionEvent[]=[];
 let done=false,proposalWrites=0,evidenceWrites=0,transcripts=0,proposalReads=0,confirmationWrites=0,operatorReads=0;
 const unexpected=(name:string)=>()=>{throw Error('Unexpected external call: '+name)};
 const tx:any={
  $queryRaw:async(strings:TemplateStringsArray,...values:any[])=>{
   const sql=strings.join('?').replace(/\s+/g,' ').trim();
   if(sql.startsWith('SELECT id FROM "PsicologiaBotConfig"'))return [{id:4}];
   if(sql.includes('FROM "PsicologiaBotEvent" WHERE status=\'PENDING\''))return done?[]:[{...row}];
   if(sql.includes('SELECT COUNT(*) AS n FROM "PsicologiaBotOutbox"'))return [{n:0n}]; // Capture, never send.
   if(sql.startsWith('SELECT (SELECT COUNT(*)'))return [{pending:1n,uncertain:0n,review:2n}];
   if(sql.startsWith('SELECT stage,state FROM "PsicologiaBotConversation"')){
    const c=conversations.get(values.at(-1));return c?[structuredClone(c)]:[];
   }
   if(sql.startsWith('SELECT h.id FROM "PsicologiaBotEvent" h'))return options.lateStaff?[{id:'later-staff'}]:[];
   if(sql.startsWith('SELECT id FROM "PsicologiaBotEvent" h'))return [];
   if(sql.startsWith('SELECT c.phone FROM "PsicologiaBotConversation" c'))return options.heldBooking?[{phone:customerPhone}]:[];
   if(sql.startsWith('SELECT u.id,u.nombre,u.apellido,u.telefono')){
    assert.match(sql,/u\."tenantId"=4/);assert.match(sql,/u\."empresaId"=3/);
    return options.missingProfessional?[]:[{id:29,nombre:'Fixture',apellido:'Professional',telefono:professionalPhone}];
   }
   if(sql.startsWith('SELECT u.id FROM "Usuario"'))return [{id:29}];
   if(sql.startsWith('SELECT c.id FROM "Cliente"')){
    assert.match(sql,/c\."tenantId"=4/);assert.match(sql,/c\."empresaId"=3/);
    return options.missingCustomer?[]:[{id:11}];
   }
   if(sql.startsWith('SELECT p.code,p.details'))return [{code,details:{date,start:'10:00',end:'11:00',roomId:'1',rental:false,amount:'100000',serviceName:'Terapia individual',sessionCount:1,customerPrompt:'¿Te sirve ese horario?'}}];
   if(sql.startsWith('SELECT content FROM "PsicologiaBotOutbox"'))return [{content:'¿Te sirve ese horario?'}];
   if(sql.startsWith('SELECT r.*,o.content AS question'))return [];
   if(sql.startsWith('SELECT * FROM "PsicologiaBotProposal"')){proposalReads++;return [{code,customerPhone,professionalPhone,status:'PENDING',expiresAt:new Date(Date.now()+3600000),customerConfirmedAt:null,professionalConfirmedAt:null,details:{rental:false}}];}
   if(sql.startsWith('SELECT id FROM storage.objects'))return [{id:'fixture-storage-object'}];
   if(sql.includes('JOIN "PsicologiaBotOutbox" o ON'))return [{...row,transcribed:!!row.transcript,text:row.transcript||row.text}];
   if(sql.startsWith('SELECT EXISTS('))return [{allowed:!options.chiefLate}];
   if(sql.startsWith('SELECT id FROM "PsicologiaBotOutbox"')||sql.startsWith('SELECT id,content FROM "PsicologiaBotOutbox"'))return [];
   throw Error('Unmocked query: '+sql);
  },
  $executeRaw:async(strings:TemplateStringsArray,...values:any[])=>{
   const sql=strings.join('?').replace(/\s+/g,' ').trim();writes.push(sql);
   if(sql.startsWith('UPDATE "PsicologiaBotEvent" SET status=\'DONE\'')){done=true;return 1;}
   if(sql.startsWith('UPDATE "PsicologiaBotEvent" SET transcript=')){transcripts++;return 1;}
   if(sql.startsWith('INSERT INTO "PsicologiaBotOutbox"')){outbox.push({id:values[0],phone:values[1],content:values[2]});return 1;}
   if(sql.startsWith('INSERT INTO "PsicologiaBotProposal"')){proposalWrites++;return 1;}
   if(sql.startsWith('UPDATE "PsicologiaBotProposal" SET "evidencePath"=')){evidenceWrites++;return 1;}
   if(sql.startsWith('UPDATE "PsicologiaBotProposal" SET "customerConfirmedAt"=')||sql.startsWith('UPDATE "PsicologiaBotProposal" SET "professionalConfirmedAt"=')){confirmationWrites++;return 1;}
   if(sql.startsWith('INSERT INTO "PsicologiaBotConversation" ("tenantId",phone,stage,state)')){conversations.set(values[0],{stage:values[1],state:JSON.parse(values[2])});return 1;}
   if(sql.startsWith('UPDATE "PsicologiaBotConversation" SET stage=')){conversations.set(values.at(-1),{stage:values[0],state:JSON.parse(values[1])});return 1;}
   return 1;
  },
  $executeRawUnsafe:async()=>1,
  terapiasPsicologos:{findFirst:async({where}:any)=>{scoped.push(where);assert.equal(where.tenantId,4);assert.equal(where.empresaId,3);return {id:1n,nombre:'Terapia individual',categoria:'Terapia individual',cantidadSesiones:1,precioBase:100000};}},
  consultorios:{findFirst:async({where}:any)=>{scoped.push(where);assert.equal(where.tenantId,4);assert.equal(where.empresaId,3);return {id:1n,nombre:'Consultorio fixture'};}},
  citasPsicologos:{count:async({where}:any)=>{assert.equal(where.tenantId,4);return 0;},create:unexpected('appointment write')},
 };
 const prisma={...tx,$transaction:async(run:any)=>run(tx)};
 const audit={createAuditLog:async(data:any)=>{assert.equal(data.tenantId,4);audits.push(data)}};
 const operator={requireLuisaOperator:async()=>{operatorReads++;if(options.operatorUnavailable)throw Error('LUISA_OPERATOR_NOT_READY');return {id:900,username:'luisa.fernanda.bot'};}};
 const identity=loadServerModule<typeof Identity>('lib/psychology-booking-identity.ts',{'./psychology-reception':reception});
 const booking=loadServerModule<typeof Booking>('lib/psychology-bot-booking.ts',{
  './psychology-reception':reception,'node:crypto':{createHash},'./audit':audit,'./psychology-booking-identity':identity,'./psychology-booking-messages':bookingMessages,
  './booking-server':{normalizedRental:async()=>null,lockAndValidateBooking:async(_tx:any,scope:any)=>{assert.equal(scope.tenantId,4)}},
  './package-payment':{getPackagePaymentState:unexpected('payment lookup')},
  './psychology-bot-operator':operator,
 });
 const scheduling=loadServerModule<typeof Scheduling>('lib/psychology-patient-scheduling.ts',{
  'node:crypto':{createHash},'./psychology-reception':reception,'./psychology-bot-operator':operator,'./psychology-booking-identity':identity,'./psychology-bot-booking':booking,
  './psychology-booking-messages':bookingMessages,'./audit':audit,
 });
 const preparation=loadServerModule<typeof Preparation>('lib/psychology-ai-preparation.ts',{
  './prisma':prisma,'./psychology-reception':reception,'./psychology-chief-commands':commands,'./psychology-staff-ownership':ownership,'./audit':audit,
  './psychology-ai':{aiConfigured:unexpected('AI configuration'),understandPsychologyMessage:unexpected('model'),transcribePsychologyAudio:unexpected('transcription')},
  './psychology-reception-context':{readReceptionIdentity:async()=>({role:'unknown'})},'./psychology-chatwoot':{readPsychologyHistory:unexpected('remote history'),readOwnReplyReference:unexpected('remote reply')},
  './psychology-knowledge':{},'./psychology-staff-observation':{},
 });
 const api=loadServerModule<typeof Automation>('lib/psychology-automation.ts',{
  './prisma':prisma,'./audit':audit,'./psychology-reception':reception,'./psychology-chief-commands':commands,'./psychology-staff-ownership':ownership,
  './psychology-chatwoot':{ensurePsychologyConversation:unexpected('remote conversation'),sendPsychologyMessage:unexpected('WhatsApp send'),verifyPsychologyChannel:unexpected('remote channel')},
  './psychology-bot-booking':booking,'node:crypto':{randomUUID},'./psychology-ai':{parseUnderstanding:()=>options.natural?{intent:'confirm',confidence:1}:null},'./psychology-ai-preparation':preparation,
  './psychology-chief':{runChiefReactivationTask:async()=>{},handleChiefUnderstanding:unexpected('model command')},
  './psychology-semantic-reception':{semanticReception:(_e:any,stage:string,state:any)=>({stage,state,messages:[]})},
  './psychology-patient-intake':{},'./psychology-returning-patient':{},'./psychology-outbox':{},'./psychology-campaign-review':{},
  './psychology-handover':{enqueueIdleChatResumes:async()=>0},'./psychology-chief-messages':messages,'./psychology-reception-context':{},
  './psychology-rental-intake':{},'./psychology-booking-messages':bookingMessages,'./psychology-communication':{},
  './psychology-patient-scheduling':{handlePatientAvailability:async(...args:Parameters<typeof scheduling.handlePatientAvailability>)=>{availabilityEvents.push({...args[1]});return scheduling.handlePatientAvailability(...args);}},
 });
 return {event,row,initial,conversations,outbox,audits,writes,scoped,tx,availabilityEvents,
  get done(){return done},get proposalWrites(){return proposalWrites},get evidenceWrites(){return evidenceWrites},get transcripts(){return transcripts},
  get proposalReads(){return proposalReads},get confirmationWrites(){return confirmationWrites},
  get operatorReads(){return operatorReads},
  run:()=>api.drainPsychologyAutomation({enabled:true,activatedAt:null,templates:{},paymentPolicy:'REVIEW'}),
  runNext:(text:string)=>{done=false;row.id+='-next';row.text=text;row.eventAt=new Date(row.eventAt.getTime()+1000);return api.drainPsychologyAutomation({enabled:true,activatedAt:null,templates:{},paymentPolicy:'REVIEW'});},
 };
}

test('bare and named chief RESERVAR/SOPORTE/REANUDAR reach their real handlers through processOne',async()=>{
 for(const prefix of ['', 'Luisa, ', 'Hola, Luisa Fernanda, ', 'Bot ']){
  const booking=fixture(prefix+reserve);assert.equal((await booking.run()).processed,1);assert.equal(booking.proposalWrites,1);assert.equal(booking.evidenceWrites,0);assert.equal(booking.done,true);assert.equal(booking.row.text,prefix+reserve);
  assert.equal(booking.conversations.get(SANDRA_PHONE)?.stage,'HUMAN');assert.ok(!booking.audits.some(a=>a.accion==='BOT_CHIEF_NOT_ADDRESSED'));
  assert.ok(booking.outbox.some(o=>o.phone===customerPhone));assert.ok(booking.outbox.some(o=>o.phone===professionalPhone));
  const evidence=fixture(prefix+support);await evidence.run();assert.equal(evidence.evidenceWrites,1);assert.equal(evidence.proposalWrites,0);
  const mode=fixture(prefix+resume);await mode.run();const c=mode.conversations.get(customerPhone)!;
  assert.equal(c.stage,'DATA');assert.equal(c.state.staffReleasedAt,mode.event.at);assert.deepEqual(c.state.intake,mode.initial.intake);assert.deepEqual(c.state.context,mode.initial.context);assert.equal(c.state.staffMessage,undefined);
  assert.ok(mode.audits.some(a=>a.accion==='BOT_CONVERSATION_MODE'));assert.equal(mode.conversations.get(SANDRA_PHONE)?.stage,'HUMAN');
 }
});

test('PAUSAR, policy and status share the exact command route, including the supported vocative',async()=>{
 for(const prefix of ['', 'Luisa, ']){
  const pause=fixture(prefix+`PAUSAR ${customerPhone}`);await pause.run();assert.equal(pause.conversations.get(customerPhone)?.state.humanHold?.kind,'manual');
  const policy=fixture(prefix+'POLITICA PAGO REVISAR');await policy.run();assert.ok(policy.audits.some(a=>a.accion==='BOT_POLICY_APPROVED'));
  for(const command of ['ESTADO BOT','AYUDA BOT']){const status=fixture(prefix+command);await status.run();assert.ok(status.outbox.some(o=>o.id.endsWith(':status')));}
 }
});

test('chief CONFIRMAR reaches the booking handler but cannot confirm for either other participant',async()=>{
 for(const prefix of ['', 'Luisa, ']){
  const f=fixture(prefix+'CONFIRMAR '+code);await f.run();assert.equal(f.proposalReads,1);assert.equal(f.confirmationWrites,0);assert.equal(f.proposalWrites,0);assert.equal(f.evidenceWrites,0);assert.equal(f.outbox.length,0);assert.equal(f.done,true);
 }
});

test('an already authorized natural chief confirmation keeps its existing route and original source',async()=>{
 const f=fixture('Luisa, sí',{prepared:true,natural:true});await f.run();assert.equal(f.proposalReads,1);assert.equal(f.confirmationWrites,0);assert.equal(f.row.text,'Luisa, sí');assert.equal(f.done,true);
 assert.equal(f.availabilityEvents[0]?.text,'CONFIRMAR '+code);
});

test('current operator identity guard remains necessary when a chief reservation reaches the handler',async()=>{
 const f=fixture('Luisa, '+reserve,{operatorUnavailable:true});await f.run();assert.equal(f.operatorReads,1);assert.equal(f.proposalWrites,0);assert.equal(f.evidenceWrites,0);assert.ok(f.outbox.some(o=>o.id.endsWith(':booking-review')));
});

test('only current direct text executes; quoted context remains unchanged and cannot execute by itself',async()=>{
 const quote=`Ejemplo anterior: ${reserve}`;
 const direct=fixture('Luisa, '+reserve,{event:{quotedText:quote}});await direct.run();assert.equal(direct.proposalWrites,1);assert.equal(direct.row.quotedText,quote);assert.equal(direct.row.text,'Luisa, '+reserve);
 for(const text of ['Sí','Gracias','Luisa, revisa este ejemplo',`"${reserve}"`,`> ${reserve}`,`Sandra dijo: ${resume}`,`Ejemplo: ${support}`,`Luisa dijo ${resume}`,`Luisa, "${resume}"`]){
  const f=fixture(text,{prepared:true,event:{quotedText:reserve}});await f.run();assert.equal(f.proposalWrites,0,text);assert.equal(f.evidenceWrites,0,text);assert.equal(f.conversations.get(customerPhone)?.stage,'HUMAN',text);assert.ok(!f.audits.some(a=>a.accion==='BOT_CONVERSATION_MODE'),text);
 }
});

test('other senders, outbound staff, malformed payloads and untranscribed audio cannot become chief commands',async()=>{
 for(const event of [{phone:customerPhone},{fromMe:true},{kind:'audio' as const,transcript:null}]){
  for(const command of [reserve,support,resume]){
   const f=fixture(command,{prepared:true,event});await f.run();assert.equal(f.proposalWrites,0);assert.equal(f.evidenceWrites,0);assert.ok(!f.audits.some(a=>a.accion==='BOT_CONVERSATION_MODE'));
  }
 }
 for(const command of [`RESERVAR ${customerPhone} 1`, `Luisa, RESERVAR ${customerPhone} 1`, `SOPORTE ${code} http://example.com/fixture`, `REANUDAR ${customerPhone} por favor`, 'POLITICA PAGO CUALQUIERA']){
  const f=fixture(command,{prepared:true});await f.run();assert.equal(f.proposalWrites,0);assert.equal(f.evidenceWrites,0);assert.ok(!f.audits.some(a=>a.accion==='BOT_CONVERSATION_MODE'||a.accion==='BOT_POLICY_APPROVED'));
 }
});

test('persisted audio transcript can carry the same exact command; source text is preserved',async()=>{
 const f=fixture('',{event:{kind:'audio',transcript:'Luisa, '+reserve}});await f.run();assert.equal(f.proposalWrites,1);assert.equal(f.transcripts,1);assert.equal(f.row.text,'');assert.equal(f.row.transcript,'Luisa, '+reserve);
});

test('self, unknown and newer human ownership cannot be released by REANUDAR',async()=>{
 for(const phone of [SANDRA_PHONE,PSYCHOLOGY_PHONE]){
  const f=fixture('Luisa, REANUDAR '+phone);await f.run();assert.ok(!f.audits.some(a=>a.accion==='BOT_CONVERSATION_MODE'));assert.ok(!f.outbox.some(o=>o.id.endsWith(':admin')));
 }
 for(const options of [{unknown:true},{lateStaff:true},{hold:{kind:'manual' as const,since:new Date(Date.now()+60000).toISOString()}},{hold:{kind:'urgent' as const}},{hold:{kind:'optout' as const}}]){
  const f=fixture(resume,options);await f.run();assert.ok(!f.audits.some(a=>a.accion==='BOT_CONVERSATION_MODE'));assert.ok(!f.outbox.some(o=>o.id.endsWith(':admin')));assert.equal(f.conversations.get(customerPhone)?.stage,options.unknown?undefined:'HUMAN');
 }
});

test('PAUSAR followed by REANUDAR cannot erase urgent or optout protections',async()=>{
 for(const kind of ['urgent','optout'] as const){
  const f=fixture(`PAUSAR ${customerPhone}`,{hold:{kind,since:priorAt,resumeStage:'DATA'}});await f.run();
  assert.equal(f.conversations.get(customerPhone)?.state.humanHold?.kind,kind);assert.deepEqual(f.conversations.get(customerPhone)?.state,f.initial);
  await f.runNext(resume);assert.equal(f.conversations.get(customerPhone)?.stage,'HUMAN');assert.deepEqual(f.conversations.get(customerPhone)?.state,f.initial);
  assert.ok(!f.audits.some(a=>a.accion==='BOT_CONVERSATION_MODE'));assert.ok(!f.outbox.some(o=>o.id.endsWith(':admin')));
 }
});

test('a second REANUDAR with a different event ID preserves the already active stage, draft and release source',async()=>{
 const f=fixture(resume);await f.run();const first=structuredClone(f.conversations.get(customerPhone)!);
 assert.equal(first.stage,'DATA');assert.equal(first.state.resumedFrom,f.event.id);assert.deepEqual(first.state.intake,f.initial.intake);assert.deepEqual(first.state.context,f.initial.context);
 const changes=f.writes.filter(sql=>sql.startsWith('INSERT INTO "PsicologiaBotConversation"')).length;
 await f.runNext(resume);assert.notEqual(f.row.id,f.event.id);assert.deepEqual(f.conversations.get(customerPhone),first);
 assert.equal(f.writes.filter(sql=>sql.startsWith('INSERT INTO "PsicologiaBotConversation"')).length,changes);
 assert.equal(f.audits.filter(a=>a.accion==='BOT_CONVERSATION_MODE').length,1);assert.equal(f.outbox.filter(o=>o.id.endsWith(':admin')).length,1);
});

test('REANUDAR leaves active chats untouched even with an inconsistent hold; HUMAN legacy chats remain resumable',async()=>{
 const active=fixture(resume);const inconsistent={stage:'DATA',state:structuredClone(active.initial)};
 active.conversations.set(customerPhone,inconsistent);await active.run();assert.deepEqual(active.conversations.get(customerPhone),inconsistent);
 assert.ok(!active.audits.some(a=>a.accion==='BOT_CONVERSATION_MODE'));assert.ok(!active.outbox.some(o=>o.id.endsWith(':admin')));
 assert.ok(!active.writes.some(sql=>sql.startsWith('INSERT INTO "PsicologiaBotConversation"')));
 for(const hold of [undefined,{kind:'manual' as const,resumeStage:'PREFERENCES',since:priorAt}]){
  const legacy=fixture(resume);const state={...legacy.initial,reason:'Atención de una persona',humanHold:hold};
  legacy.conversations.set(customerPhone,{stage:'HUMAN',state});await legacy.run();const resumed=legacy.conversations.get(customerPhone)!;
  assert.equal(resumed.stage,hold?'PREFERENCES':'NEED');assert.equal(resumed.state.resumedFrom,legacy.event.id);assert.deepEqual(resumed.state.intake,legacy.initial.intake);assert.deepEqual(resumed.state.context,legacy.initial.context);
  assert.equal(legacy.audits.filter(a=>a.accion==='BOT_CONVERSATION_MODE').length,1);assert.equal(legacy.outbox.filter(o=>o.id.endsWith(':admin')).length,1);
 }
});

test('booking identity, human hold and evidence checks still run; review preserves original text and quote',async()=>{
 for(const options of [{missingCustomer:true},{missingProfessional:true},{heldBooking:true}]){
  const f=fixture('Luisa, '+reserve,{...options,event:{quotedText:'Antecedente exacto'}});await f.run();assert.equal(f.proposalWrites,0);assert.equal(f.evidenceWrites,0);
  const review=f.outbox.find(o=>o.id.endsWith(':booking-review'))!;assert.ok(review);assert.ok(review.content.includes('Luisa, '+reserve));assert.ok(review.content.includes('Antecedente exacto'));
 }
 const f=fixture(`Luisa, SOPORTE ${code} https://example.com/fixture.pdf`);await f.run();assert.equal(f.evidenceWrites,0);assert.ok(f.outbox.some(o=>o.id.endsWith(':booking-review')));
});

test('chief command replies pass the same send gate and a newer staff intervention still blocks them',async()=>{
 for(const chiefLate of [false,true]){
  const f=fixture(resume,{chiefLate});await f.run();const reply=f.outbox.find(o=>o.id.endsWith(':admin'))!;assert.ok(reply);
  assert.equal(await ownership.psychologyStaffSendAllowed(f.tx,reply.id,SANDRA_PHONE),!chiefLate);assert.equal(f.conversations.get(SANDRA_PHONE)?.stage,'HUMAN');
 }
});
