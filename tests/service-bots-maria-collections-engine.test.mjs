import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA,DIEGO,CURRENT_OPERATOR_ROUTING,validateEvent} from '../automation/service-bots/config.mjs';
import {createMariaCollectionsContext} from '../automation/service-bots/maria-collections-context.mjs';
import {COLLECTION_SCOPE,COLLECTOR_GUARD,digest,groupKey,obligationKey} from '../automation/service-bots/maria-collections.mjs';
import {FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED} from '../automation/service-bots/line-scope.mjs';

const PHONE='573000001234',OTHER='573000004321',AT=Date.parse('2026-11-12T20:00:00.000Z'),ORDER='00000000-0000-4000-8000-000000000001';
function fixture(t,{line=BLUE,context=true,company='fumigacion',enabled=true}={}){
 const config={company,...BUSINESSES[company],operatorRouting:CURRENT_OPERATOR_ROUTING,enabled,chiefOnly:true,activatedAt:AT-60000,lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:company==='fumigacion'?(i?'cucaracha-roja':'cucaracha-azul'):'fixture-'+i}))};
 const store=new Store(':memory:',company,randomBytes(32));t.after(()=>store.close());
 const ctx=context?createMariaCollectionsContext({store,enabled:true,now:()=>AT+60000}):null;
 const engine=context?new Engine(store,config,{collectionsContext:ctx}):new Engine(store,config);
 return {store,config,ctx,engine,line};
}
function collection(f,{state='ACCEPTED',mid='COLLECTION_OWN_MID_0001'}={}){
 const row={obligationId:ORDER,phone:PHONE,originLine:f.line},key=groupKey(COLLECTION_SCOPE,[row]),text='Hola, revisemos el saldo del servicio. Si ya pagaste, cuéntanos para revisarlo.';
 const stateBefore={caseId:'fixture:already-quoted',slots:{service:'cucarachas',property:'casa',city:'Medellín',area:60},asked:['service'],quotedPrice:{entryId:'synthetic-price-entry',price:129000,accepted:false,slots:{service:'cucarachas',property:'casa',area:60}},programIntake:{stage:'acceptance'},introduced:true,lastHandledSourceId:'PREVIOUS_SOURCE_0001'};
 f.store.db.prepare('INSERT INTO conversations(phone,line,revision,at,body) VALUES(?,?,7,?,?)').run(PHONE,f.line,AT-1000,f.store.seal(stateBefore));
 f.store.db.prepare('INSERT INTO outbox(id,phone,line,body,internal,revision,state,created,updated,case_id) VALUES(?,?,?,?,0,7,?,?,?,?)').run(key,PHONE,f.line,f.store.seal(text),'COLLECTOR_STAGED',AT,AT,stateBefore.caseId);
 const input={guard:COLLECTOR_GUARD,groupKey:key,attemptId:'attempt:engine-fixture',outboxId:key,phone:PHONE,line:f.line,orderIds:[ORDER],obligationKeys:[obligationKey(COLLECTION_SCOPE,ORDER)],textHash:digest(text),text,attemptAt:AT,manifestHash:digest({fixture:'engine'})};
 f.store.tx(()=>{const receipt=f.ctx.registerAttempt(input);f.ctx.assertAttempt({...input,contextId:receipt.contextId});f.store.db.prepare("UPDATE outbox SET state='SENDING' WHERE id=?").run(key);if(mid){f.store.db.prepare('UPDATE outbox SET state=?,mid=? WHERE id=?').run(state,mid,key);f.ctx.attachMid({...receipt,mid})}});
 return {input,stateBefore};
}
function event(f,{id='COLLECTION_CUSTOMER_REPLY_0001',phone=PHONE,line=f.line,text='ok listo',kind='text',quotedId='COLLECTION_OWN_MID_0001',fromMe=false,at=AT+1000,...other}={}){
 const source=validateEvent({owner:line,instance:f.config.lines.find(l=>l.phone===line).instance,event:{id,phone,at:new Date(at).toISOString(),kind,text,fromMe,quotedId,...other}}, {...f.config,enabled:true},AT+60000);
 assert.ok(source);f.store.enqueue(source);return source;
}
const processing=(f,e)=>f.store.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state;
const bodies=f=>f.store.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE);
const counts=f=>Object.fromEntries(['outbox','questions'].map(table=>[table,f.store.db.prepare('SELECT count(*) n FROM '+table).get().n]));

test('two-argument Engine keeps collection default OFF with no context tables',t=>{
 const f=fixture(t,{context:false});assert.equal(f.engine.collectionsContext,null);assert.equal(f.store.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'maria_collection_%'").get().n,0);
});
test('Engine rejects a fake adapter, another Store, or a disabled adapter',t=>{
 const a=fixture(t),b=fixture(t);assert.throws(()=>new Engine(a.store,a.config,{collectionsContext:{...a.ctx}}),/INSTANCE_REQUIRED/);assert.throws(()=>new Engine(a.store,a.config,{collectionsContext:b.ctx}),/INSTANCE_REQUIRED/);assert.throws(()=>new Engine(a.store,a.config,{collectionsContext:createMariaCollectionsContext({store:a.store})}),/INSTANCE_REQUIRED/);
});
for(const line of [BLUE,RED])for(const [text,kind] of [['ok listo','text'],['¿cuánto es?','text'],['ya pagué','text'],['no debo nada','text'],['pagaré mañana','text'],['','image'],['','document'],['','audio']])test('Engine consumes '+line.slice(-4)+' '+JSON.stringify(text||kind)+' without quote acceptance or new work',async t=>{
 const f=fixture(t,{line});collection(f);const e=event(f,{text,kind}),before=bodies(f),n=counts(f);await f.engine.process(e,{slots:{service:'chinches'},intent:'acceptance'});assert.equal(processing(f,e),'COLLECTION_REPLY_REVIEW');assert.deepEqual(bodies(f),before);assert.deepEqual(counts(f),n);assert.equal(f.ctx.hasReviewBlock({phone:PHONE,line}),true);const audit=f.store.db.prepare("SELECT detail FROM audit WHERE action='OWN_COLLECTION_REPLY_REVIEW'").get();const result=f.store.open(audit.detail);assert.equal(result.quoteAcceptancePermitted,false);assert.equal(result.paymentVerified,false);assert.equal(result.customerReplyQueued,false);assert.equal(result.businessWritten,false);assert.equal(result.correlation,'EXACT_OWN_COLLECTION_MID');
});
test('held collection reply is persisted before the old hold observer without touching the hold or creating a question',async t=>{
 const f=fixture(t);collection(f);f.store.hold(PHONE,'STAFF_SOURCE_0001',true);const e=event(f,{text:'ya pagué'}),before=bodies(f),n=counts(f);await f.engine.process(e);assert.equal(processing(f,e),'COLLECTION_REPLY_REVIEW');assert.deepEqual(bodies(f),before);assert.deepEqual(counts(f),n);assert.equal(f.store.open(f.store.db.prepare("SELECT detail FROM audit WHERE action='OWN_COLLECTION_REPLY_REVIEW'").get().detail).humanAttentionPreserved,true);
});
test('an older turn superseded by a later turn is still consumed as collection evidence',async t=>{
 const f=fixture(t);collection(f);const earlier=event(f,{text:'ya pagué',id:'EARLIER_COLLECTION_REPLY_0001'});event(f,{id:'LATER_COLLECTION_REPLY_0001',text:'envié el soporte',at:AT+2000});const before=bodies(f),n=counts(f);await f.engine.process(earlier);assert.equal(processing(f,earlier),'COLLECTION_REPLY_REVIEW');assert.deepEqual(bodies(f),before);assert.deepEqual(counts(f),n);
});
test('paused public responses retain the explicit durable consumer and create no outgoing reply',async t=>{
 const f=fixture(t,{enabled:false});collection(f);const e=event(f,{text:'ya pagué'}),n=counts(f);await f.engine.process(e);assert.equal(processing(f,e),'COLLECTION_REPLY_REVIEW');assert.deepEqual(counts(f),n);
});
test('new ordinary case and explicit request remain preserved for separation after a collection',async t=>{
 const f=fixture(t);collection(f);const state={caseId:'fixture:new-case',slots:{service:'chinches'},quotedPrice:{accepted:false,price:150000},programIntake:{stage:'review'},awaitingHumanReview:true};f.store.db.prepare('UPDATE conversations SET body=? WHERE phone=?').run(f.store.seal(state),PHONE);const e=event(f,{text:'quiero otra fumigación',quotedId:null}),before=bodies(f);await f.engine.process(e);assert.equal(processing(f,e),'COLLECTION_REPLY_REVIEW');assert.deepEqual(bodies(f),before);
});
test('same source processed again does not create a second audit, question, or reply',async t=>{
 const f=fixture(t);collection(f);const e=event(f);await f.engine.process(e);await f.engine.process(e);assert.equal(f.store.db.prepare("SELECT count(*) n FROM audit WHERE action='OWN_COLLECTION_REPLY_REVIEW'").get().n,1);assert.equal(f.store.db.prepare('SELECT count(*) n FROM maria_collection_replies').get().n,1);assert.equal(counts(f).questions,0);
});
test('unknown MID after durable SENDING is reviewed without inventing delivery or resending',async t=>{
 const f=fixture(t);collection(f,{mid:null});const e=event(f,{text:'ok listo',quotedId:null}),n=counts(f);await f.engine.process(e);assert.equal(processing(f,e),'COLLECTION_REPLY_REVIEW');assert.deepEqual(counts(f),n);assert.equal(f.store.db.prepare('SELECT state,mid FROM outbox').get().state,'SENDING');assert.equal(f.store.db.prepare('SELECT mid FROM maria_collection_contexts').get().mid,null);
});
test('source mismatch fails into generic REVIEW rather than pending or ordinary quote registration',async t=>{
 const f=fixture(t);collection(f);const e=event(f);const n=counts(f),before=bodies(f);await f.engine.process({...e,text:'changed source'});assert.equal(processing(f,e),'REVIEW');assert.deepEqual(counts(f),n);assert.deepEqual(bodies(f),before);assert.equal(f.store.db.prepare("SELECT count(*) n FROM audit WHERE action='OWN_COLLECTION_REPLY_SOURCE_REVIEW'").get().n,1);
});
test('outbox association changes fail closed into REVIEW, never ordinary intake',async t=>{
 const f=fixture(t);collection(f);const e=event(f),before=bodies(f),n=counts(f);f.store.db.prepare('UPDATE outbox SET body=?').run(f.store.seal('changed collection text'));await f.engine.process(e);assert.equal(processing(f,e),'REVIEW');assert.deepEqual(bodies(f),before);assert.deepEqual(counts(f),n);
});
test('exact own outgoing echo and human staff retain their original routes before collection handling',async t=>{
 const f=fixture(t);collection(f);const own=event(f,{id:'COLLECTION_OWN_MID_0001',fromMe:true,text:'own message'});await f.engine.process(own);assert.equal(processing(f,own),'BOT_ECHO');const staff=event(f,{id:'STAFF_COLLECTION_SOURCE_0001',fromMe:true,text:'Ya estamos revisando'});await f.engine.process(staff);assert.equal(processing(f,staff),'STAFF_TAKEOVER');assert.equal(f.store.conversation(PHONE).hold,1);assert.equal(f.store.db.prepare('SELECT count(*) n FROM maria_collection_replies').get().n,0);
});
test('internal and known-outside-scope recipients never enter the customer collection consumer',async t=>{
 const f=fixture(t);collection(f);for(const [id,phone] of [['COLLECTION_INTERNAL_SOURCE_0001',DIEGO],['COLLECTION_CHIEF_SOURCE_0001',SANDRA]]){const e=event(f,{id,phone,text:'ok listo'});await f.engine.process(e);assert.notEqual(processing(f,e),'COLLECTION_REPLY_REVIEW')}assert.equal(f.store.db.prepare('SELECT count(*) n FROM maria_collection_replies').get().n,0);
});
test('a different customer cannot adopt the MID; same canonical PN on the other own line is held without order association',async t=>{
 const f=fixture(t);collection(f);const other=event(f,{id:'COLLECTION_OTHER_PERSON_0001',phone:OTHER,text:'Hola'});await f.engine.process(other);assert.notEqual(processing(f,other),'COLLECTION_REPLY_REVIEW');assert.equal(f.store.db.prepare('SELECT count(*) n FROM maria_collection_replies').get().n,0);const cross=event(f,{id:'COLLECTION_OTHER_LINE_0001',line:RED,text:'Hola'});await f.engine.process(cross);assert.equal(processing(f,cross),'COLLECTION_REPLY_REVIEW');const r=f.store.open(f.store.db.prepare('SELECT body FROM maria_collection_replies WHERE source_id=?').get(cross.id).body);assert.equal(r.correlation,'CROSS_LINE_UNCONFIRMED_COLLECTION_CONTEXT');assert.deepEqual(r.orderIds,[]);assert.deepEqual(r.obligationKeys,[]);
});
test('without any association the same adapter preserves normal greeting behavior exactly',async t=>{
 const a=fixture(t,{context:false}),b=fixture(t),ea=event(a,{text:'Hola',quotedId:null}),eb=event(b,{text:'Hola',quotedId:null});await a.engine.process(ea);await b.engine.process(eb);assert.equal(processing(a,ea),processing(b,eb));const rows=f=>f.store.db.prepare('SELECT phone,line,body,internal,state FROM outbox ORDER BY id').all().map(r=>({...r,body:f.store.open(r.body)}));assert.deepEqual(rows(a),rows(b));assert.equal(b.store.db.prepare('SELECT count(*) n FROM maria_collection_replies').get().n,0);
});
