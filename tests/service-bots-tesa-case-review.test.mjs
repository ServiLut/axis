import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {TESA_GROUP_JID} from '../automation/service-bots/tesa-config.mjs';
import {initializeTesaStore,reviewTesaCase,TESA_CASE_REVIEW_GUARD} from '../automation/service-bots/tesa-operations.mjs';

const BLUE='573126944997',RED='573126938721',PHONE='573000001111',OTHER='573000002222',CASE='fumigacion:573000001111:CASE_SOURCE_001';
const ADMIN='synthetic-tesa-review-admin-'+'a'.repeat(40),WEBHOOK='synthetic-tesa-review-webhook-'+'w'.repeat(40);
const hash=text=>createHash('sha256').update(text).digest('hex');
function fixture(company='fumigacion',initialize=true){
 const config={company,...BUSINESSES[company],enabled:false,activatedAt:Date.now()-86400000,responseTargetMs:10000,
   authHash:hash(ADMIN),webhookHash:hash(WEBHOOK),lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'synthetic-'+company+'-'+i}))};
 const store=new Store(':memory:',company,randomBytes(32));if(initialize)initializeTesaStore(store);return {store,config};
}
const request=patch=>({company:'fumigacion',phone:PHONE,line:BLUE,caseId:CASE,afterCursor:0,limit:25,...patch});
const snapshot=store=>Object.fromEntries(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,JSON.stringify(store.db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all())]));
function seed(f,{id='QUESTION_REVIEW_001',phone=PHONE,line=BLUE,caseId=CASE,company='fumigacion',answered=false,expired=false,proof=true,conditions={service:'Cucarachas, arañas y hormigas',site:'casa',rooms:'2 habitaciones',area:'menos de 70 m²',floors:'dos pisos',location:'Medellín, San Antonio de Prado'},questionPatch={},answerPatch={}}={}){
 const outboxId='tesa-question:'+id,mid='TESA_REVIEW_MID_'+id,at=Date.now()-1000,text='Equipo TESA: casa de dos pisos, dos habitaciones y menos de 70 m² en San Antonio de Prado. ¿Qué valor total corresponde a las tres plagas?',source='CUSTOMER_SOURCE_'+id;
 const question={text,conditions,source,caseId,customerPhone:phone,sourceLine:line,groupJid:TESA_GROUP_JID,senderLine:BLUE,...questionPatch};
 const answer=answered?{text:'Para este caso el valor total es $149.000 e incluye las tres plagas indicadas.',participant:{phone:'573043332213',jid:'573043332213@s.whatsapp.net'},sourceId:'ANSWER_SOURCE_'+id,sourceKey:'STORED_EVENT_'+id,questionMid:mid,caseId,customerPhone:phone,groupJid:TESA_GROUP_JID,receivingLine:BLUE,at,membershipProof:{sourceHash:'sensitive-membership-hash',token:'never-export-this'},...answerPatch}:null;
 f.store.db.prepare('INSERT INTO tesa_questions(id,company,case_id,customer_phone,topic,conditions_hash,group_jid,source_line,sender_line,body,answer,source_id,answer_at,valid_until,state,outbox_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,company,caseId,phone,'cotizacion-verificada',hash(id),TESA_GROUP_JID,line,BLUE,f.store.seal(question),answer?f.store.seal(answer):null,answer?.sourceId??null,answer?at:null,answer?(expired?at-1:at+1800000):null,answer?'ANSWERED':'PENDING',outboxId);
 const nativeProof={outboxId,mid,groupJid:TESA_GROUP_JID,senderLine:BLUE,text,state:'DELIVERED',at,nativeVerified:true,company,authToken:'never-export-native-token'};
 f.store.db.prepare('INSERT INTO tesa_outbox(id,question_id,company,customer_phone,case_id,group_jid,source_line,sender_line,body,text_hash,state,mid,created,updated,native_proof) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(outboxId,id,company,phone,caseId,TESA_GROUP_JID,line,BLUE,f.store.seal(text),hash(text),'DELIVERED',mid,at,at,proof?f.store.seal(nativeProof):null);
 return {id,outboxId,mid,at,text,source,question,answer};
}

test('exact own case returns stored question, assigned answer and receipt metadata without exporting proof secrets',()=>{
 const f=fixture();try{
   const data=seed(f,{answered:true,conditions:{service:'cucarachas',sourceHash:'do-not-export-hash',nested:{authorization:'do-not-export-authorization',site:'casa'}}}),before=snapshot(f.store);
   const result=reviewTesaCase(f.store,f.config,request()),q=result.results[0];
   assert.equal(result.guard,TESA_CASE_REVIEW_GUARD);assert.equal(result.readOnly,true);assert.deepEqual(result.scope,{phone:PHONE,line:BLUE,caseId:CASE});
   assert.equal(result.total,1);assert.equal(result.selectionComplete,true);assert.equal(result.nativeHistoryComplete,false);assert.equal(result.sends,0);assert.equal(result.businessWrites,0);assert.equal(result.humanHoldsModified,false);
   assert.equal(q.id,data.id);assert.equal(q.topic,'cotizacion-verificada');assert.equal(q.sourceId,data.source);assert.equal(q.text,data.text);assert.equal(q.state,'ANSWERED');
   assert.deepEqual(q.conditions,{service:'cucarachas',nested:{site:'casa'}});assert.equal(q.answer.text,data.answer.text);assert.equal(q.answer.sourceId,data.answer.sourceId);assert.equal(q.answer.sourceKey,data.answer.sourceKey);assert.equal(q.answer.at,data.at);assert.equal(q.answer.validNow,true);assert.ok(q.answer.validUntil>Date.now());
   assert.deepEqual(q.outbox.storedNativeProof,{exists:true,readable:true,recordedNativeVerified:true,storedScopeMatches:true});assert.equal(q.outbox.textMatchesQuestion,true);assert.equal(q.outbox.mid,data.mid);assert.equal(q.outbox.state,'DELIVERED');
   assert.doesNotMatch(JSON.stringify(result),/never-export|sensitive-membership|do-not-export|authToken|sourceHash|membershipProof/);assert.deepEqual(snapshot(f.store),before);
 }finally{f.store.close();}
});
test('expired assigned answers remain visible with their original TTL and invalid-now flag',()=>{
 const f=fixture();try{const row=seed(f,{answered:true,expired:true});const value=reviewTesaCase(f.store,f.config,request()).results[0];assert.equal(value.answer.text,row.answer.text);assert.equal(value.answer.validNow,false);assert.equal(value.answer.validUntil,row.at-1);assert.equal(value.state,'ANSWERED');}finally{f.store.close();}
});
test('pending question without a stored native proof does not claim delivery verification',()=>{
 const f=fixture();try{seed(f,{proof:false});const value=reviewTesaCase(f.store,f.config,request()).results[0];assert.equal(value.answer,null);assert.deepEqual(value.outbox.storedNativeProof,{exists:false,readable:false,recordedNativeVerified:false,storedScopeMatches:false});}finally{f.store.close();}
});
test('different encrypted outbox text cannot be presented as an exact stored proof for the question',()=>{
 const f=fixture();try{seed(f);f.store.db.prepare('UPDATE tesa_outbox SET body=?').run(f.store.seal('Different body preserved for review.'));const before=snapshot(f.store),value=reviewTesaCase(f.store,f.config,request()).results[0];assert.equal(value.outbox.textMatchesQuestion,false);assert.equal(value.outbox.storedNativeProof.storedScopeMatches,false);assert.deepEqual(snapshot(f.store),before);}finally{f.store.close();}
});
test('pagination returns at most 25 distinct local questions and clearly preserves its exact selection',()=>{
 const f=fixture();try{
   for(let i=0;i<30;i++)seed(f,{id:'PAGINATED_'+i});const before=snapshot(f.store),first=reviewTesaCase(f.store,f.config,request());
   assert.equal(first.results.length,25);assert.equal(first.total,30);assert.equal(first.remaining,5);assert.equal(first.hasMore,true);assert.equal(first.selectionComplete,false);
   const last=reviewTesaCase(f.store,f.config,request({afterCursor:first.nextCursor}));assert.equal(last.results.length,5);assert.equal(last.total,30);assert.equal(last.remaining,0);assert.equal(last.hasMore,false);assert.equal(last.selectionComplete,true);
   assert.equal(new Set([...first.results,...last.results].map(row=>row.id)).size,30);assert.deepEqual(reviewTesaCase(f.store,f.config,request()),first);assert.deepEqual(snapshot(f.store),before);
 }finally{f.store.close();}
});
test('foreign company, other phone, other line and other case rows are never unsealed or joined',()=>{
 const f=fixture();try{
   seed(f);seed(f,{id:'OTHER_LINE',line:RED});seed(f,{id:'OTHER_PHONE',phone:OTHER});seed(f,{id:'OTHER_CASE',caseId:'OTHER_CASE'});seed(f,{id:'FOREIGN_COMPANY',company:'servicio-tecnico'});
   const open=f.store.open.bind(f.store),seen=[];f.store.open=value=>{const body=open(value);seen.push(body);return body;};
   const before=snapshot(f.store),own=reviewTesaCase(f.store,f.config,request());assert.equal(own.total,1);assert.equal(own.results.length,1);assert.equal(own.results[0].id,'QUESTION_REVIEW_001');assert.equal(seen.some(body=>String(body.source).includes('OTHER_')||String(body.source).includes('FOREIGN_')),false);
   assert.equal(reviewTesaCase(f.store,f.config,request({phone:'573000009999'})).total,0);assert.equal(reviewTesaCase(f.store,f.config,request({caseId:'ABSENT_CASE'})).total,0);assert.deepEqual(snapshot(f.store),before);
 }finally{f.store.close();}
});
test('cross scoped encrypted question or assigned answer is rejected without exposing its text',()=>{
 for(const patch of [{questionPatch:{customerPhone:OTHER}},{questionPatch:{sourceLine:RED}},{questionPatch:{caseId:'OTHER_CASE'}},{answered:true,answerPatch:{caseId:'OTHER_CASE'}}]){
   const f=fixture();try{seed(f,patch);const before=snapshot(f.store);assert.throws(()=>reviewTesaCase(f.store,f.config,request()),/STORED_SCOPE_CONFLICT/);assert.deepEqual(snapshot(f.store),before);}finally{f.store.close();}
 }
});
test('a foreign outbox relationship is not decrypted and cannot become a native proof or answer',()=>{
 const f=fixture();try{seed(f);f.store.db.prepare('UPDATE tesa_outbox SET source_line=?,body=?,native_proof=?').run(RED,'foreign-ciphertext-must-not-open','foreign-proof-must-not-open');const before=snapshot(f.store);const result=reviewTesaCase(f.store,f.config,request());assert.equal(result.results[0].outbox,null);assert.equal(result.results[0].answer,null);assert.deepEqual(snapshot(f.store),before);}finally{f.store.close();}
});
test('closed request rejects malformed identity, arbitrary fields and pagination outside 1 to 25',()=>{
 const f=fixture();try{
   const invalid=[null,[],{},request({company:'servicio-tecnico'}),request({phone:Number(PHONE)}),request({phone:'+'+PHONE}),request({phone:PHONE+'@s.whatsapp.net'}),request({phone:'3000001111'}),request({line:'573022691941'}),request({caseId:''}),request({caseId:' '+CASE}),request({caseId:'x'.repeat(161)}),request({afterCursor:-1}),request({afterCursor:0.5}),request({afterCursor:undefined}),request({limit:0}),request({limit:26}),request({limit:undefined}),request({allowSend:true})];
   const before=snapshot(f.store);for(const body of invalid)assert.throws(()=>reviewTesaCase(f.store,f.config,body),/EXACT_SCOPE_REQUIRED/);assert.deepEqual(snapshot(f.store),before);
 }finally{f.store.close();}
});
test('foreign configuration/store is rejected and absent tables remain absent',()=>{
 const f=fixture('fumigacion',false),other=fixture('servicio-tecnico');try{
   const before=snapshot(f.store),value=reviewTesaCase(f.store,f.config,request());assert.equal(value.tablesInitialized,false);assert.equal(value.total,0);assert.equal(value.selectionComplete,true);assert.equal(value.nativeHistoryComplete,false);assert.deepEqual(snapshot(f.store),before);
   assert.throws(()=>reviewTesaCase(other.store,f.config,request()),/OWN_FUM_REQUIRED/);assert.throws(()=>reviewTesaCase(f.store,other.config,request()),/OWN_FUM_REQUIRED/);assert.throws(()=>reviewTesaCase(f.store,{...f.config,lines:[...f.config.lines,{phone:'573022691941'}]},request()),/OWN_FUM_REQUIRED/);
 }finally{f.store.close();other.store.close();}
});
test('HTTP uses admin authentication, exact own scopes and no transport or mutations',async()=>{
 const f=fixture();let transportCalls=0;const transport=new Proxy({},{get:()=>()=>{transportCalls++;throw Error('NO_NATIVE_OR_BUSINESS_IO');}}),server=createBotServer(f.config,f.store,transport,{});seed(f,{answered:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/tesa-case-review';
 const send=(body,token=ADMIN,method='POST')=>fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 try{
   const before=snapshot(f.store);assert.equal((await send(request(),WEBHOOK)).status,401);assert.equal((await send(request(),'invalid')).status,401);assert.equal((await send(undefined,ADMIN,'GET')).status,405);assert.equal((await send(request({company:'servicio-tecnico'}))).status,400);assert.equal((await send(request({line:'573022691941'}))).status,400);
   for(const patch of [{caseId:'OTHER_CASE'},{phone:OTHER},{line:RED}]){const response=await send(request(patch));assert.equal(response.status,200);assert.equal((await response.json()).results.length,0);}
   const response=await send(request());assert.equal(response.status,200);assert.equal((await response.json()).results[0].answer.validNow,true);assert.equal(transportCalls,0);assert.deepEqual(snapshot(f.store),before);
 }finally{await new Promise(resolve=>server.close(resolve));f.store.close();}
});
test('HTTP rejects the route in another business before exposing its local data',async()=>{
 const f=fixture('servicio-tecnico'),server=createBotServer(f.config,f.store,{},{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const before=snapshot(f.store),response=await fetch('http://127.0.0.1:'+server.address().port+'/tesa-case-review',{method:'POST',headers:{Authorization:'Bearer '+ADMIN,'Content-Type':'application/json'},body:JSON.stringify(request())});assert.equal(response.status,403);assert.deepEqual(snapshot(f.store),before);}finally{await new Promise(resolve=>server.close(resolve));f.store.close();}
});
