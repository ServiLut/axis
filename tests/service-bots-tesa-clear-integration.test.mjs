import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,routeCaseQuestion} from '../automation/service-bots/engine.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from '../automation/service-bots/tesa-config.mjs';
import {BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE,FUMIGACION_BLUE,FUMIGACION_RED} from '../automation/service-bots/line-scope.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const adminToken='a'.repeat(43),webhookToken='b'.repeat(43);
function fixture(company='fumigacion'){
 const at=Date.now()-120000,b=BUSINESSES[company],human='573043332213',sender=b.phones[0],members=[...TESA_BOT_PHONES,human];
 const config={company,...b,enabled:true,chiefOnly:true,operatorRouting:CURRENT_OPERATOR_ROUTING,activatedAt:at,authHash:hash(adminToken),webhookHash:hash(webhookToken),lines:b.phones.map((phone,i)=>({phone,instance:'LOCAL_CASE_'+i})),tesaOperations:{enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:sender,activatedAt:at+1000,allowedParticipantPhones:[human],verifiedMembership:{owner:sender,ownerOpen:true,verifiedAt:Date.now(),expiresAt:Date.now()+300000,sourceHash:'a'.repeat(64),participantPhones:members,participantBindings:members.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}},...(company==='fumigacion'?{operationalLineScope:{company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[FUMIGACION_RED],authorizedAt:new Date(at+1000).toISOString()}}:{})};
 const store=new Store(':memory:',company,randomBytes(32)),engine=new Engine(store,config),event={id:'CLEAR_CURRENT_SOURCE',phone:'573000001234',line:sender,fromMe:false,at:Date.now(),kind:'text',text:'Prefiero mañana en la tarde'};
 store.enqueue(event);const caseId=company+':'+event.id;store.saveConversation(event.phone,{slots:{service:'cucarachas',location:'Itagüí',preference:'mañana en la tarde'},asked:[],caseId});
 return {config,store,engine,event,request:{phone:event.phone,line:event.line,source:event.id,caseId,topic:'disponibilidad-y-tecnico',conditions:{service:'cucarachas',location:'Itagüí',preference:'mañana en la tarde'},text:'ignored original private wording'}};
}
test('new FUM case uses numbered useful questions while same request keeps the original question and exact text',()=>{
 const f=fixture();try{const first=routeCaseQuestion(f.store,f.config,f.request),row=f.store.db.prepare('SELECT * FROM tesa_outbox').get(),body=f.store.open(row.body);
  assert.equal(first.created,true);assert.match(body,/\n1\. Disponibilidad:/);assert.match(body,/\n2\. Técnico:/);assert.match(body,/\n3\. Día:/);assert.match(body,/\n4\. Horario:/);assert.match(body,/\[nombre completo en Tenaxis\]/);assert.match(body,/mañana en la tarde/);assert.ok(body.length<=1200);assert.equal(body.includes(f.event.phone),false);
  const next=routeCaseQuestion(f.store,f.config,f.request);assert.equal(next.created,false);assert.equal(next.id,first.id);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,1);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM tesa_outbox').get().body),body);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{f.store.close();}
});
test('Miguel retains the previous single-paragraph case wording and destinations',()=>{
 const f=fixture('servicio-tecnico');try{assert.equal(routeCaseQuestion(f.store,f.config,f.request).created,true);const body=f.store.open(f.store.db.prepare('SELECT body FROM tesa_outbox').get().body);assert.match(body,/¿Qué disponibilidad, ruta y técnico corresponden a este caso\?/);assert.doesNotMatch(body,/\n1\.|Los corchetes/);}finally{f.store.close();}
});
test('the actual FUM routing keeps the literal mattress count in the readable group context',()=>{
 const f=fixture();try{
  const e={...f.event,id:'CLEAR_MATTRESS_COUNT',at:Date.now(),text:'Tengo chinches en seis colchones en un apartamento de Itagüí'};f.store.enqueue(e);
  const slots={service:'chinches',location:'Itagüí',site:'apartamento',mattresses:'seis colchones'};f.store.saveConversation(e.phone,{...f.store.conversation(e.phone).state,slots});
  const result=routeCaseQuestion(f.store,f.config,{...f.request,source:e.id,conditions:slots});assert.equal(result.created,true);
  const text=f.store.open(f.store.db.prepare('SELECT body FROM tesa_outbox').get().body);assert.match(text,/Colchones informados: seis colchones/);assert.match(text,/Servicio indicado: chinches/);assert.equal(f.store.open(f.store.db.prepare('SELECT body FROM events WHERE id=?').get(e.id).body).text,e.text);
 }finally{f.store.close();}
});
test('previous private pending question is not copied or moved to the new group format',()=>{
 const f=fixture();try{f.store.questionToRecipients({...f.request,recipients:['573016803926'],text:'Historical own private question'});const prior=f.store.db.prepare('SELECT * FROM questions').get();const r=routeCaseQuestion(f.store,f.config,f.request);assert.equal(r.created,false);assert.equal(r.privateQuestionPreserved,true);assert.deepEqual(f.store.db.prepare('SELECT * FROM questions').get(),prior);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_outbox').get().n,0);}finally{f.store.close();}
});

const list={key:'current-guidance-fixture-v1',sourceHash:'b'.repeat(64),items:[{title:'Duración de la visita',question:'¿Qué tiempo necesita el técnico para esta clase de visita?',example:'Explicar qué duración se utiliza y cuándo hace falta otro dato.'}]};
async function serverFixture(company='fumigacion'){
 const f=fixture(company);let network=0;const transport={request:async()=>{network++;throw Error('NO_EXTERNAL_REQUEST_IN_ENDPOINT_TEST');},verifyLine:async()=>{network++;throw Error('NO_EXTERNAL_REQUEST_IN_ENDPOINT_TEST');}};
 const server=createBotServer(f.config,f.store,transport,f.engine);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const request=async(route,body,token=adminToken)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {http:response.status,data:await response.json()};};
 return {...f,request,network:()=>network,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));f.store.close();}};
}
test('guidance endpoint requires own admin auth and queues exact fixed-group list only once without sending in the HTTP handler',async()=>{
 const f=await serverFixture();try{
  assert.equal((await f.request('/notify-tesa-guidance',list,webhookToken)).http,401);
  const first=await f.request('/notify-tesa-guidance',list);assert.equal(first.http,202);assert.equal(first.data.queued,true);assert.equal(first.data.state,'READY');
  const duplicate=await f.request('/notify-tesa-guidance',list);assert.equal(duplicate.http,202);assert.equal(duplicate.data.queued,false);assert.equal(duplicate.data.id,first.data.id);
  const status=await f.request('/tesa-guidance-status',{key:list.key});assert.equal(status.http,200);assert.equal(status.data.found,true);assert.equal(status.data.list.state,'READY');assert.equal(status.data.list.deliveryVerified,false);assert.match(status.data.list.text,/1\) Duración/);
  assert.equal(f.network(),0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_questions').get().n,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 }finally{await f.close();}
});
test('guidance endpoint cannot accept a destination override or change a stable key and does not open other company send routes',async()=>{
 const f=await serverFixture();try{
  assert.equal((await f.request('/notify-tesa-guidance',{...list,groupJid:'foreign@g.us'})).http,409);
  assert.equal((await f.request('/notify-tesa-guidance',list)).http,202);
  const conflict=await f.request('/notify-tesa-guidance',{...list,items:[{...list.items[0],question:'¿Qué otro dato falta para la visita?'}]});assert.equal(conflict.http,409);assert.equal(conflict.data.error,'TESA_GUIDANCE_KEY_CONFLICT');
  assert.equal((await f.request('/tesa-guidance-status',{key:list.key,company:'servicio-tecnico'})).http,400);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM tesa_guidance_lists').get().n,1);assert.equal(f.network(),0);
 }finally{await f.close();}
 const g=await serverFixture('servicio-tecnico');try{assert.equal((await g.request('/notify-tesa-guidance',list)).http,403);assert.equal((await g.request('/tesa-guidance-status',{key:list.key})).http,403);assert.equal(g.network(),0);}finally{await g.close();}
});
