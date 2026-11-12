import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {Store} from '../automation/service-bots/store.mjs';
import {createMariaCollectionsContext,isMariaCollectionsContext,MARIA_COLLECTIONS_CONTEXT_GUARD} from '../automation/service-bots/maria-collections-context.mjs';
import {digest,obligationKey,groupKey,COLLECTION_SCOPE,COLLECTOR_GUARD} from '../automation/service-bots/maria-collections.mjs';
import {FUMIGACION_BLUE as BLUE,FUMIGACION_RED as RED} from '../automation/service-bots/line-scope.mjs';

const PHONE='573000001234',OTHER='573000004321',NOW=Date.parse('2026-11-12T20:00:00.000Z');
const ORDER='00000000-0000-4000-8000-000000000001';
function fixture(t,{path=':memory:',key=randomBytes(32),enabled=true}={}){
 const s=new Store(path,'fumigacion',key);let at=NOW;
 const context=createMariaCollectionsContext({store:s,enabled,now:()=>at});
 t.after(()=>{if(s.db.isOpen)s.db.close()});
 return {s,context,key,tick:(n=1000)=>at+=n};
}
function stage(f,{phone=PHONE,line=BLUE,orderIds=[ORDER],suffix='1'}={}){
 const rows=orderIds.map(obligationId=>({obligationId,phone,originLine:line})).sort((a,b)=>a.obligationId.localeCompare(b.obligationId));
 const group=groupKey(COLLECTION_SCOPE,rows),text='Hola, revisemos el saldo del servicio. Si ya pagaste, cuéntanos para revisarlo.';
 f.s.db.prepare('INSERT OR IGNORE INTO conversations(phone,line,revision,at,body) VALUES(?,?,7,?,?)').run(phone,line,NOW-1000,f.s.seal({caseId:'fixture:'+phone,slots:{service:'cucarachas'},asked:[],quote:{price:123000},accepted:false}));
 f.s.db.prepare('INSERT INTO outbox(id,phone,line,body,internal,revision,state,created,updated,case_id) VALUES(?,?,?,?,0,7,?,?,?,?)').run(group,phone,line,f.s.seal(text),'COLLECTOR_STAGED',NOW,NOW,'fixture:'+phone);
 return {guard:COLLECTOR_GUARD,groupKey:group,attemptId:'attempt:'+suffix,outboxId:group,phone,line,orderIds:rows.map(r=>r.obligationId),obligationKeys:rows.map(r=>obligationKey(COLLECTION_SCOPE,r.obligationId)),textHash:digest(text),text,attemptAt:NOW,manifestHash:digest({fixture:suffix})};
}
function reserve(f,a,{mid='OWN_COLLECTION_MID_0001',state='ACCEPTED'}={}){
 let receipt;
 f.s.tx(()=>{receipt=f.context.registerAttempt(a);assert.deepEqual(f.context.assertAttempt({...a,contextId:receipt.contextId}),receipt);f.s.db.prepare("UPDATE outbox SET state='SENDING' WHERE id=?").run(a.outboxId)});
 if(mid)f.s.tx(()=>{f.s.db.prepare('UPDATE outbox SET state=?,mid=? WHERE id=?').run(state,mid,a.outboxId);const linked=f.context.attachMid({contextId:receipt.contextId,attemptId:a.attemptId,outboxId:a.outboxId,mid});assert.equal(linked.mid,mid);assert.equal(linked.deliveryVerified,false)});
 return receipt;
}
function incoming(f,{id='CUSTOMER_REPLY_0001',phone=PHONE,line=BLUE,text='ok listo',kind='text',quotedId=null,at=NOW+1000,...rest}={}){
 const e={id,phone,line,text,kind,quotedId,at,fromMe:false,forwarded:false,...rest};f.s.enqueue(e);f.tick(1000);return e;
}
const tableCount=s=>s.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'maria_collection_%'").get().n;

test('OFF default creates no collection table or effect; explicit enable is required',t=>{
 const s=new Store(':memory:','fumigacion',randomBytes(32));t.after(()=>s.db.close());
 const c=createMariaCollectionsContext({store:s});assert.equal(c.enabled,false);assert.equal(c.store,s);assert.equal(tableCount(s),0);
 assert.deepEqual(c.inspectIncoming({}),{consumed:false,reason:'COLLECTION_CONTEXT_DISABLED'});assert.equal(c.hasReviewBlock({}),false);assert.throws(()=>c.registerAttempt({}),/DISABLED/);assert.equal(tableCount(s),0);
});
test('another company or an expanded configuration cannot construct this scoped adapter',t=>{
 const s=new Store(':memory:','servicio-tecnico',randomBytes(32));t.after(()=>s.db.close());
 assert.throws(()=>createMariaCollectionsContext({store:s,enabled:true}),/OWN_STORE_REQUIRED/);
 assert.throws(()=>createMariaCollectionsContext({store:{company:'fumigacion',seal(){},open(){},tx(){}},enabled:'true'}),/CONFIG_REQUIRED/);
});
test('only a real enabled adapter from this factory brands the same existing Store',t=>{
 const f=fixture(t),other=fixture(t),off=createMariaCollectionsContext({store:f.s});assert.equal(f.context.guard,MARIA_COLLECTIONS_CONTEXT_GUARD);assert.equal(isMariaCollectionsContext(f.context,f.s),true);assert.equal(isMariaCollectionsContext(f.context,other.s),false);assert.equal(isMariaCollectionsContext({...f.context},f.s),false);assert.equal(isMariaCollectionsContext(off,f.s),false);assert.equal(isMariaCollectionsContext(null,f.s),false);
});
test('registration and durable assertion occur synchronously in the caller reservation transaction',t=>{
 const f=fixture(t),a=stage(f);assert.throws(()=>f.context.registerAttempt(a),/TRANSACTION_REQUIRED/);
 f.s.tx(()=>{const r=f.context.registerAttempt(a);assert.equal(typeof r?.then,'undefined');assert.equal(r.contextId.includes('collection-context:'),true);assert.deepEqual(f.context.registerAttempt(a),r);assert.deepEqual(f.context.assertAttempt({...a,contextId:r.contextId}),r)});
 assert.equal(f.s.db.prepare('SELECT state FROM outbox').get().state,'COLLECTOR_STAGED');
});
test('reservation rollback also rolls back all collection context and obligation rows',t=>{
 const f=fixture(t),a=stage(f);assert.throws(()=>f.s.tx(()=>{f.context.registerAttempt(a);throw Error('fixture rollback')}),/fixture rollback/);
 assert.equal(f.s.db.prepare('SELECT count(*) n FROM maria_collection_contexts').get().n,0);assert.equal(f.s.db.prepare('SELECT count(*) n FROM maria_collection_context_obligations').get().n,0);
});
for(const [label,change] of [
 ['guard',a=>a.guard='other'],['phone',a=>a.phone=OTHER],['line',a=>a.line=RED],['order',a=>a.orderIds=['other']],['obligation',a=>a.obligationKeys=['other']],['text',a=>a.text+='!'],['hash',a=>a.textHash='0'.repeat(64)],['future',a=>a.attemptAt=NOW+1],['extra authority',a=>a.scope={company:'other'}],['internal PN',a=>a.phone='573016803926'],['LID',a=>a.phone='123456789@lid']
])test('closed attempt binding rejects '+label,t=>{const f=fixture(t),a=stage(f);change(a);assert.throws(()=>f.s.tx(()=>f.context.registerAttempt(a)),/COLLECTION_CONTEXT_/);assert.equal(f.s.db.prepare('SELECT count(*) n FROM maria_collection_contexts').get().n,0)});
test('held or changed attention cannot be registered and no hold is released',t=>{
 const f=fixture(t),a=stage(f);f.s.db.prepare('UPDATE conversations SET hold=1').run();assert.throws(()=>f.s.tx(()=>f.context.registerAttempt(a)),/ATTENTION_CHANGED/);assert.equal(f.s.conversation(PHONE).hold,1);
 f.s.db.prepare('UPDATE conversations SET hold=0,revision=8').run();assert.throws(()=>f.s.tx(()=>f.context.registerAttempt(a)),/ATTENTION_CHANGED/);
});
test('assertion detects durable body or child binding tampering before SENDING',t=>{
 const f=fixture(t),a=stage(f);f.s.tx(()=>{const r=f.context.registerAttempt(a);f.s.db.prepare('DELETE FROM maria_collection_context_obligations').run();assert.throws(()=>f.context.assertAttempt({...a,contextId:r.contextId}),/DURABLE_OBLIGATIONS_CHANGED/)});
});
test('an actual MID can attach only after exact own outbox ACCEPTED, never as delivery or payment proof',t=>{
 const f=fixture(t),a=stage(f);let r;f.s.tx(()=>{r=f.context.registerAttempt(a);assert.throws(()=>f.context.attachMid({...r,mid:'OWN_COLLECTION_MID_0001'}),/OUTBOX_ASSOCIATION_REQUIRED/)});
 f.s.tx(()=>{f.s.db.prepare("UPDATE outbox SET state='ACCEPTED',mid='OWN_COLLECTION_MID_0001' WHERE id=?").run(a.outboxId);assert.throws(()=>f.context.attachMid({...r,mid:'WRONG_COLLECTION_MID_0001'}),/OUTBOX_ASSOCIATION_REQUIRED/);assert.equal(f.context.attachMid({...r,mid:'OWN_COLLECTION_MID_0001'}).deliveryVerified,false);assert.throws(()=>f.context.attachMid({...r,mid:'OTHER_COLLECTION_MID_0001'}),/MID_ASSOCIATION_REQUIRED/)});
});
for(const [text,kind] of [['ok listo','ACKNOWLEDGEMENT'],['¿cuánto es?','AMOUNT_OR_PAYMENT_QUESTION'],['ya pagué','PAYMENT_REPORTED'],['le entregué el dinero al técnico','PAYMENT_REPORTED'],['no debo ese dinero','DISPUTE'],['pagaré mañana','PAYMENT_PROMISE_OR_DEFERRAL'],['no me contacten','CONTACT_DECLINED']])test('collection reply '+JSON.stringify(text)+' is consumed for review, not quotation or payment',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const e=incoming(f,{text,quotedId:'OWN_COLLECTION_MID_0001'}),before=f.s.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),outboxes=f.s.db.prepare('SELECT count(*) n FROM outbox').get().n;
 const r=f.context.inspectIncoming(e);assert.equal(r.replyKind,kind);assert.equal(r.correlation,'EXACT_OWN_COLLECTION_MID');assert.equal(r.consumed,true);assert.equal(r.requiresHumanReview,true);assert.equal(r.quoteAcceptancePermitted,false);assert.equal(r.orderRegistrationPermitted,false);assert.equal(r.paymentVerified,false);assert.equal(r.automaticReplyPermitted,false);assert.equal(f.context.hasReviewBlock(a),true);
 assert.deepEqual(f.s.db.prepare('SELECT body,hold FROM conversations WHERE phone=?').get(PHONE),before);assert.equal(f.s.db.prepare('SELECT count(*) n FROM outbox').get().n,outboxes);assert.equal(f.s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id).state,'PENDING');
});
for(const kind of ['audio','image','document','video'])test(kind+' support stays unread, consumed and blocked without claiming payment',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const r=f.context.inspectIncoming(incoming(f,{kind,text:'',quotedId:'OWN_COLLECTION_MID_0001'}));assert.equal(r.replyKind,'PAYMENT_EVIDENCE_UNREAD');assert.equal(r.paymentVerified,false);assert.equal(r.blockFurtherCollection,true);
});
test('an unquoted ambiguous yes or a new-service request in active collection context requires human separation',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);for(const [n,text] of ['sí','quiero cotizar otra fumigación'].entries()){const r=f.context.inspectIncoming(incoming(f,{id:'NEW_SERVICE_REPLY_000'+n,text}));assert.equal(r.consumed,true);assert.equal(r.correlation,'UNIQUE_OWN_COLLECTION_CONTEXT');assert.equal(r.quoteAcceptancePermitted,false)}
});
test('same source is idempotent and an altered caller or source cannot be adopted',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const e=incoming(f),r=f.context.inspectIncoming(e);assert.deepEqual(f.context.inspectIncoming(e),{...r,duplicate:true});assert.equal(f.s.db.prepare('SELECT count(*) n FROM maria_collection_replies').get().n,1);assert.throws(()=>f.context.inspectIncoming({...e,text:'quoted acceptance'}),/PERSISTED_CUSTOMER_SOURCE_REQUIRED/);
});
test('source must already be persisted under exact PN/line; no supplied quote or LID creates identity',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const e=incoming(f);assert.throws(()=>f.context.inspectIncoming({...e,id:'NOT_PERSISTED_0001'}),/PERSISTED_CUSTOMER_SOURCE_REQUIRED/);assert.equal(f.context.inspectIncoming({...e,phone:'123456789012@lid'}).consumed,false);assert.equal(f.context.inspectIncoming({...e,jid:'12345@lid'}).consumed,false);assert.equal(f.context.inspectIncoming({...e,group:true}).consumed,false);assert.equal(f.context.inspectIncoming({...e,fromMe:true}).consumed,false);
});
test('other PN or internal recipient cannot cite a collection MID into its own context',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);for(const [n,change] of [{phone:OTHER},{phone:'573016803926'}].entries()){const r=f.context.inspectIncoming(incoming(f,{id:'WRONG_IDENTITY_000'+n,quotedId:'OWN_COLLECTION_MID_0001',...change}));assert.equal(r.consumed,false)}
 assert.equal(f.s.db.prepare('SELECT count(*) n FROM maria_collection_replies').get().n,0);
});
test('same canonical PN on the other own line is consumed without confirming an obligation or MID',t=>{
 const f=fixture(t),a=stage(f),r=reserve(f,a),e=incoming(f,{line:RED,text:'ya pagué',quotedId:'OWN_COLLECTION_MID_0001'}),before=f.s.db.prepare('SELECT body,hold FROM conversations').get(),reply=f.context.inspectIncoming(e);assert.equal(reply.consumed,true);assert.equal(reply.correlation,'CROSS_LINE_UNCONFIRMED_COLLECTION_CONTEXT');assert.equal(reply.line,RED);assert.deepEqual(reply.contextOriginLines,[BLUE]);assert.deepEqual(reply.contextIds,[r.contextId]);assert.deepEqual(reply.orderIds,[]);assert.deepEqual(reply.obligationKeys,[]);assert.equal(reply.obligationAssociationVerified,false);assert.equal(reply.quotedCollectionMidVerified,false);assert.equal(reply.paymentVerified,false);assert.equal(f.context.hasReviewBlock({phone:PHONE,line:BLUE}),true);assert.equal(f.context.hasReviewBlock({phone:PHONE,line:RED}),true);assert.equal(f.s.db.prepare('SELECT line FROM maria_collection_contexts').get().line,BLUE);assert.equal(f.s.db.prepare('SELECT line FROM maria_collection_replies').get().line,RED);assert.deepEqual(f.s.db.prepare('SELECT body,hold FROM conversations').get(),before);
});
for(const state of ['SENDING','UNCERTAIN','ACCEPTED','DELIVERED','READ'])test('cross-line conservative review preserves active '+state+' without changing it',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a,{mid:state==='SENDING'||state==='UNCERTAIN'?null:'OWN_COLLECTION_MID_0001',state:state==='SENDING'||state==='UNCERTAIN'?'ACCEPTED':state});f.s.db.prepare('UPDATE outbox SET state=?').run(state);const e=incoming(f,{line:RED,text:'ok listo'}),reply=f.context.inspectIncoming(e);assert.equal(reply.correlation,'CROSS_LINE_UNCONFIRMED_COLLECTION_CONTEXT');assert.equal(f.s.db.prepare('SELECT state FROM outbox').get().state,state);assert.equal(reply.orderRegistrationPermitted,false);
});
test('cross-line does not promote a PN written in text, LID, unregistered line or prior message',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);for(const [n,change]of [{phone:OTHER,text:'Ya pagué '+PHONE},{phone:'123456789012345@lid'},{line:'573000009999'},{at:NOW-2000}].entries()){const e=incoming(f,{id:'CROSS_NOT_IDENTITY_000'+n,line:RED,...change});assert.equal(f.context.inspectIncoming(e).consumed,false)}
});
test('cross-line forwarded text stays source review and altered persisted bodies fail closed',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const e=incoming(f,{line:RED,forwarded:true,text:'ya pagué'}),reply=f.context.inspectIncoming(e);assert.equal(reply.replyKind,'SOURCE_REVIEW');assert.equal(reply.obligationAssociationVerified,false);assert.throws(()=>f.context.inspectIncoming({...e,text:'changed'}),/PERSISTED_CUSTOMER_SOURCE_REQUIRED/);
});
test('malformed cross-line caller input cannot manufacture a collection association',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const e=incoming(f,{line:RED});for(const patch of [{text:null},{id:'bad'},{at:NaN},{fromMe:true},{group:true},{jid:'12345@g.us'},{phone:'not-a-native-PN'}])assert.equal(f.context.inspectIncoming({...e,...patch}).consumed,false);assert.equal(f.s.db.prepare('SELECT count(*) n FROM maria_collection_replies').get().n,0);
});
test('quoted MID of another PN is not a match even with an active collection on this PN',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const b=stage(f,{phone:OTHER,orderIds:['00000000-0000-4000-8000-000000000002'],suffix:'2'});reserve(f,b,{mid:'OTHER_PERSON_COLLECTION_MID'});const r=f.context.inspectIncoming(incoming(f,{quotedId:'OTHER_PERSON_COLLECTION_MID'}));assert.equal(r.correlation,'OTHER_CITATION_REQUIRES_SEPARATION');assert.deepEqual(r.orderIds,[ORDER]);
});
test('a row merely STAGED has no inbound collection association; attempt must be durable first',t=>{
 const f=fixture(t);stage(f);const r=f.context.inspectIncoming(incoming(f));assert.equal(r.consumed,false);
});
test('SENDING receipt window and UNCERTAIN retain review context without inventing a MID or delivery',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a,{mid:null});for(const [n,state] of ['SENDING','UNCERTAIN'].entries()){f.s.db.prepare('UPDATE outbox SET state=?').run(state);const r=f.context.inspectIncoming(incoming(f,{id:'UNCONFIRMED_REPLY_000'+n}));assert.equal(r.consumed,true);assert.equal(r.correlation,'AMBIGUOUS_OR_UNCONFIRMED_COLLECTION_CONTEXT');assert.equal(r.deliveryVerified,false);assert.equal(f.s.db.prepare('SELECT mid FROM maria_collection_contexts').get().mid,null)}
});
test('new human hold and a new case after collection are preserved, including exact old MID citations',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);f.s.db.prepare('UPDATE conversations SET hold=1,body=? WHERE phone=?').run(f.s.seal({caseId:'fixture:NEW_CASE',humanHold:true,slots:{service:'chinches'},accepted:false}),PHONE);const e=incoming(f,{quotedId:'OWN_COLLECTION_MID_0001'}),before=f.s.db.prepare('SELECT body,hold FROM conversations').get(),r=f.context.inspectIncoming(e);assert.equal(r.attentionChanged,true);assert.equal(r.humanAttentionPreserved,true);assert.equal(r.consumed,true);assert.deepEqual(f.s.db.prepare('SELECT body,hold FROM conversations').get(),before);
});
test('several outstanding obligations remain ambiguous without citation; exact own MID selects only its group',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const b=stage(f,{orderIds:['00000000-0000-4000-8000-000000000002'],suffix:'2'});reserve(f,b,{mid:'SECOND_COLLECTION_MID_0002'});const r=f.context.inspectIncoming(incoming(f));assert.equal(r.contextIds.length,2);assert.equal(r.correlation,'AMBIGUOUS_OR_UNCONFIRMED_COLLECTION_CONTEXT');const exact=f.context.inspectIncoming(incoming(f,{id:'EXACT_SECOND_REPLY_0001',quotedId:'SECOND_COLLECTION_MID_0002'}));assert.deepEqual(exact.orderIds,b.orderIds);
});
test('a previously unquoted reply blocks a new reservation even for another obligation or line',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);f.context.inspectIncoming(incoming(f));const b=stage(f,{orderIds:['00000000-0000-4000-8000-000000000002'],suffix:'2'});f.s.db.prepare('UPDATE outbox SET revision=(SELECT revision FROM conversations WHERE phone=?) WHERE id=?').run(PHONE,b.outboxId);assert.throws(()=>f.s.tx(()=>f.context.registerAttempt(b)),/REVIEW_BLOCK_PRESERVED/);assert.equal(f.context.hasReviewBlock({phone:PHONE,line:RED}),true);
});
test('old customer turns before the attempt do not become collection replies',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const e=incoming(f,{at:NOW-2000,quotedId:'OWN_COLLECTION_MID_0001'});assert.equal(f.context.inspectIncoming(e).consumed,false);
});
test('changed outbox body or an ambiguous source line fails closed',t=>{
 const f=fixture(t),a=stage(f);reserve(f,a);const e=incoming(f);f.s.db.prepare('UPDATE outbox SET body=?').run(f.s.seal('altered'));assert.throws(()=>f.context.inspectIncoming(e),/OUTBOX_ASSOCIATION_REQUIRED/);f.s.db.prepare('UPDATE outbox SET body=?').run(f.s.seal(a.text));f.s.db.prepare('INSERT INTO event_sources VALUES(?,?)').run(e.id,RED);assert.throws(()=>f.context.inspectIncoming(e),/AMBIGUOUS_SOURCE_LINE/);
});
test('durable encrypted context and reply survive restart with same Store key; SENDING stays uncertain',t=>{
 const dir=mkdtempSync(join(tmpdir(),'maria-context-')),path=join(dir,'ledger.sqlite'),key=randomBytes(32);let second;t.after(()=>{if(second?.s.db.isOpen)second.s.db.close();const p=resolve(dir);assert.equal(p.startsWith(resolve(tmpdir())+sep),true);rmSync(p,{recursive:true,force:true})});
 const f=fixture(t,{path,key}),a=stage(f);reserve(f,a);const e=incoming(f,{text:'ya pagué',quotedId:'OWN_COLLECTION_MID_0001'}),r=f.context.inspectIncoming(e);f.s.db.close();second=fixture(t,{path,key});assert.deepEqual(second.context.inspectIncoming(e),{...r,duplicate:true});assert.equal(second.context.hasReviewBlock(a),true);assert.equal(second.s.db.prepare('SELECT mid FROM maria_collection_contexts').get().mid,'OWN_COLLECTION_MID_0001');const body=second.s.db.prepare('SELECT body FROM maria_collection_contexts').get().body;assert.equal(body.includes(a.text),false);assert.equal(readFileSync(path).includes(Buffer.from(a.text)),false);
});
test('restart after uncertain send retains context and never releases hold or schedules a retry',t=>{
 const dir=mkdtempSync(join(tmpdir(),'maria-context-')),path=join(dir,'ledger.sqlite'),key=randomBytes(32);let second;t.after(()=>{if(second?.s.db.isOpen)second.s.db.close();const p=resolve(dir);assert.equal(p.startsWith(resolve(tmpdir())+sep),true);rmSync(p,{recursive:true,force:true})});const f=fixture(t,{path,key}),a=stage(f);reserve(f,a,{mid:null});f.s.db.close();second=fixture(t,{path,key});assert.equal(second.s.db.prepare('SELECT state FROM outbox').get().state,'UNCERTAIN');const r=second.context.inspectIncoming(incoming(second));assert.equal(r.consumed,true);assert.equal(r.deliveryVerified,false);assert.equal(second.s.db.prepare('SELECT state FROM outbox').get().state,'UNCERTAIN');
});
