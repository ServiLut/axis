import test from 'node:test';
import assert from 'node:assert/strict';
import {createSummaryDataFixture} from './fixtures/maria-summary-data-flow.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {createMariaCollectionsContext} from '../automation/service-bots/maria-collections-context.mjs';
import {COLLECTOR_GUARD,COLLECTION_SCOPE,groupKey,obligationKey,digest} from '../automation/service-bots/maria-collections.mjs';
import {validateEvent} from '../automation/service-bots/config.mjs';
import {FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED} from '../automation/service-bots/line-scope.mjs';

const START=Date.parse('2026-11-12T21:20:00.000Z'),PHONE='573000007384',ORDER='00000000-0000-4000-8000-000000000001',MID='CROSS_BLUE_COLLECTION_MID_0001';
const using=async(t,fn)=>{t.mock.timers.enable({apis:['Date'],now:START});const f=createSummaryDataFixture(at=>t.mock.timers.setTime(at),{start:START});f.config.mariaProgram.expiresAt=Date.parse('2026-12-07T16:56:52.680Z');try{await fn(f,at=>t.mock.timers.setTime(at))}finally{f.store.close()}};
function priorCollection(f,origin){
 const c=createMariaCollectionsContext({store:f.store,enabled:true}),row={obligationId:ORDER,phone:PHONE,originLine:origin},key=groupKey(COLLECTION_SCOPE,[row]),text='Hola, revisemos el saldo de un servicio anterior. Si ya pagaste, compártenos la información.';
 f.store.db.prepare('INSERT INTO conversations(phone,line,revision,at,body) VALUES(?,?,7,?,?)').run(PHONE,origin,START-1000,f.store.seal({caseId:'synthetic:prior-obligation',slots:{},asked:[]}));f.store.db.prepare('INSERT INTO outbox(id,phone,line,body,internal,revision,state,created,updated,case_id) VALUES(?,?,?,?,0,7,?,?,?,?)').run(key,PHONE,origin,f.store.seal(text),'COLLECTOR_STAGED',START,START,'synthetic:prior-obligation');
 const input={guard:COLLECTOR_GUARD,groupKey:key,outboxId:key,attemptId:'cross-line:synthetic-attempt',phone:PHONE,line:origin,orderIds:[ORDER],obligationKeys:[obligationKey(COLLECTION_SCOPE,ORDER)],text,textHash:digest(text),attemptAt:START,manifestHash:digest({source:'synthetic-prior-reviewed-manifest'})};
 f.store.tx(()=>{const r=c.registerAttempt(input);c.assertAttempt({...input,contextId:r.contextId});f.store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id=?").run(MID,key);c.attachMid({...r,mid:MID})});return c;
}
async function activeOtherLineQuote(f,line){
 const e=await f.turn('Quiero cotizar un servicio nuevo para cucarachas en un apartamento de dos habitaciones en Itagüí, barrio Santa María.',{line});assert.match(f.deliver(e),/129\.000/);assert.notEqual(f.state(e).quotedPrice.accepted,true);return e;
}
function customer(f,setTime,{line,text='ok listo',kind='text',quotedId=null,forwarded=false}={}){
 const at=START+20000;setTime(at);const source=validateEvent({instance:f.config.lines.find(l=>l.phone===line).instance,owner:line,event:{id:'CROSS_LINE_COLLECTION_CUSTOMER_0001',phone:PHONE,at:new Date(at).toISOString(),fromMe:false,kind,text,quotedId,forwarded}},f.config,at);assert.ok(source);f.store.enqueue(source);return source;
}
const counts=f=>Object.fromEntries(['outbox','questions','tesa_questions'].map(table=>[table,f.store.db.prepare('SELECT count(*) n FROM '+table).get().n]));

test('control: the valid delivered ordinary quote can still accept ok listo when no collection context is injected',t=>using(t,async f=>{
 await activeOtherLineQuote(f,RED);const e=await f.turn('ok listo',{line:RED});assert.equal(f.state(e).quotedPrice.accepted,true);assert.ok(f.state(e).programIntake);
}));
for(const origin of [BLUE,RED])for(const [text,kind,quote]of [['ok listo','text',null],['¿cuánto es?','text',null],['ya pagué','text',MID],['','image',null]])test('collection from '+origin.slice(-4)+' preserves the other line quote on '+JSON.stringify(text||kind),t=>using(t,async(f,setTime)=>{
 const ctx=priorCollection(f,origin),incomingLine=origin===BLUE?RED:BLUE;await activeOtherLineQuote(f,incomingLine);const e=customer(f,setTime,{line:incomingLine,text,kind,quotedId:quote}),before=f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),beforeCounts=counts(f),engine=new Engine(f.store,f.config,{collectionsContext:ctx});await engine.process(e,{intent:'acceptance',slots:{service:'chinches'}});
 assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'COLLECTION_REPLY_REVIEW');assert.deepEqual(f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),before);assert.deepEqual(counts(f),beforeCounts);assert.notEqual(f.state(e).quotedPrice.accepted,true);assert.equal(f.entry(e),undefined);const reply=f.store.open(f.store.db.prepare('SELECT body FROM maria_collection_replies WHERE source_id=?').get(e.id).body);assert.equal(reply.correlation,'CROSS_LINE_UNCONFIRMED_COLLECTION_CONTEXT');assert.equal(reply.line,incomingLine);assert.deepEqual(reply.contextOriginLines,[origin]);assert.deepEqual(reply.orderIds,[]);assert.deepEqual(reply.obligationKeys,[]);assert.equal(reply.quotedCollectionMidVerified,false);assert.equal(reply.obligationAssociationVerified,false);assert.equal(reply.paymentVerified,false);assert.equal(ctx.hasReviewBlock({phone:PHONE,line:origin}),true);assert.equal(ctx.hasReviewBlock({phone:PHONE,line:incomingLine}),true);assert.equal(f.store.db.prepare('SELECT line FROM outbox WHERE mid=?').get(MID).line,origin);
}));
test('cross-line review does not release human hold or re-enable paused public responses',t=>using(t,async(f,setTime)=>{
 const ctx=priorCollection(f,BLUE);await activeOtherLineQuote(f,RED);f.store.hold(PHONE,'CROSS_LINE_HUMAN_SOURCE_0001',true);const e=customer(f,setTime,{line:RED,text:'ya pagué'}),before=f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),beforeCounts=counts(f);f.config.enabled=false;await new Engine(f.store,f.config,{collectionsContext:ctx}).process(e);assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'COLLECTION_REPLY_REVIEW');assert.deepEqual(f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),before);assert.equal(f.store.conversation(PHONE).hold,1);assert.deepEqual(counts(f),beforeCounts);
}));
test('cross-line body mutation cannot become a quote acceptance or a verified payment',t=>using(t,async(f,setTime)=>{
 const ctx=priorCollection(f,BLUE);await activeOtherLineQuote(f,RED);const e=customer(f,setTime,{line:RED,text:'ya pagué'}),before=f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),n=counts(f);await new Engine(f.store,f.config,{collectionsContext:ctx}).process({...e,text:'ok listo'});assert.equal(f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'REVIEW');assert.deepEqual(f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),before);assert.deepEqual(counts(f),n);assert.equal(f.store.db.prepare('SELECT count(*) n FROM maria_collection_replies').get().n,0);
}));
