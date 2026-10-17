import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {mariaPendingReviewReply,MARIA_PENDING_REVIEW_GUARD} from '../automation/service-bots/maria-pending-review.mjs';

const concern='Estoy muy molesta, esto ha sido una porquería y necesito que me ayuden.';
function fixture(text=concern){
 const phone='573000007390',line=BUSINESSES.fumigacion.phones[0],caseId='fumigacion:SYNTHETIC_PENDING_WARRANTY';
 const original={id:'SYNTHETIC_PENDING_WARRANTY',phone,line,caseId,at:1000,kind:'text',fromMe:false,forwarded:false,text:'Solicito la garantía de la fumigación.'},event={id:'SYNTHETIC_NEW_CONCERN',phone,line,at:2000,kind:'text',fromMe:false,forwarded:false,text};
 return {company:'fumigacion',state:{caseId,awaitingHumanReview:true,slots:{},requestedAfterServiceReview:{kind:'warranty',sourceId:original.id,at:original.at}},event,pending:{caseId,phone,line,sourceId:original.id,topic:'warranty-review',state:'PENDING'},sources:[original,{...event,caseId}]};
}
for(const text of [concern,'Estoy muy decepcionado y necesito una solución.','Me siento frustrada con cómo quedó el servicio.','Estoy inconforme, mi experiencia fue terrible.'])test('a new direct pending customer concern receives bounded empathy: '+text,()=>{
 const input=fixture(text),before=structuredClone(input),result=mariaPendingReviewReply(input);assert.ok(result);assert.match(result.reply,/Lamento la experiencia que nos cuentas/);assert.match(result.reply,/garantía sigue pendiente de revisión/);assert.doesNotMatch(result.reply,/gratis|sin costo|culpa|negligencia|iremos|vendremos|programad|garantía aprobada|servicio ejecutado/i);assert.equal(result.reason,'pending-customer-concern');assert.equal(result.newInternalQuestion,false);assert.equal(result.businessWritten,false);assert.equal(result.humanHoldReleased,false);assert.deepEqual(input,before);
});
for(const text of ['Ustedes son unos inútiles.','Estoy muy molesta.','Estoy molesta, voy a poner una denuncia y necesito ayuda.','Estoy muy molesta, los voy a matar y necesito ayuda.','Estoy desesperada, tengo dolor y necesito ayuda.','Estoy molesta, ya pagué y necesito ayuda.','Mi vecina dijo: estoy muy molesta y necesito ayuda.','Estoy molesta y quiero un servicio nuevo.'])test('empathy helper does not mask another priority or manufacture context: '+text,()=>assert.equal(mariaPendingReviewReply(fixture(text)),null));
test('held, quoted, forwarded or different-case concerns cannot enter the pending empathy path',()=>{
 for(const mutate of [f=>f.hold=true,f=>f.event.quotedId=f.sources[0].id,f=>f.event.forwarded=true,f=>f.pending.caseId='OTHER',f=>f.company='servicio-tecnico']){const input=fixture();mutate(input);input.sources[1]={...input.event,caseId:input.state.caseId};assert.equal(mariaPendingReviewReply(input),null);}
});
test('equivalent concerns within one minute are one aspect; a later original turn can ask again',()=>{
 const input=fixture(),first=mariaPendingReviewReply(input);assert.ok(first);assert.equal(mariaPendingReviewReply({...input,lastReply:first.marker}),null);
 const next=fixture('Estoy decepcionada y necesito que me ayuden.');next.event.id='SYNTHETIC_SECOND_CONCERN';next.event.at=3000;next.sources[1]={...next.event,caseId:next.state.caseId};assert.equal(mariaPendingReviewReply({...next,lastReply:first.marker}),null);
 next.event.at=first.marker.at+60001;next.sources[1]={...next.event,caseId:next.state.caseId};assert.ok(mariaPendingReviewReply({...next,lastReply:first.marker}));
});
test('real Engine follows warranty, property/date, free-visit question and the exact new complaint without ignoring it',async t=>{
 const start=Date.parse('2026-10-17T19:00:00.000Z');t.mock.timers.enable({apis:['Date'],now:start});let network=0;t.mock.method(globalThis,'fetch',()=>{network++;throw Error('NO_NETWORK');});
 const s=new Store(':memory:','fumigacion',randomBytes(32)),c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'pending-concern-local-'+i}))},engine=new Engine(s,c);let seq=0;
 const turn=async(text,{at,fromMe=false}={})=>{const e={id:'SYNTHETIC_PENDING_EXPERIENCE_'+ ++seq,phone:'573000007390',line:c.lines[0].phone,kind:'text',fromMe,forwarded:false,at:at??start+seq*5000,text};t.mock.timers.setTime(e.at);s.enqueue(e);await engine.process(e);const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,text:row?s.open(row.body):null,state:s.conversation(e.phone).state};};
 try{
  const first=await turn('Solicito la garantía de la fumigación.');const pending=s.db.prepare('SELECT * FROM questions').all();assert.equal(pending.length,1);assert.equal(pending[0].recipient,SANDRA);
  await turn('El servicio fue el lunes. Es un apartamento de dos habitaciones en Itagüí.');const visit=await turn('¿Vendrían gratis mañana?');assert.match(visit.text,/no están confirmados el costo ni la visita/);
  const result=await turn(concern);assert.ok(result.text,'a direct own request for help must receive the pending reply');assert.match(result.text,/Lamento la experiencia que nos cuentas/);assert.match(result.text,/garantía sigue pendiente/);assert.equal(result.state.pendingReviewReply.guard,MARIA_PENDING_REVIEW_GUARD);assert.equal(result.state.pendingReviewReply.sourceId,result.e.id);assert.equal(result.state.requestedAfterServiceReview.sourceId,first.e.id);assert.deepEqual(s.db.prepare('SELECT * FROM questions').all(),pending);assert.equal(s.conversation(first.e.phone).hold,0);
  const duplicate=await turn(concern);assert.equal(duplicate.text,null);assert.deepEqual(s.db.prepare('SELECT * FROM questions').all(),pending);assert.equal(s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);assert.equal(network,0);
  await turn('Yo continúo atendiendo al cliente.',{fromMe:true});const held=await turn('Estoy muy molesta y necesito ayuda.');assert.equal(held.text,null);assert.equal(s.conversation(first.e.phone).hold,1);assert.deepEqual(s.db.prepare('SELECT * FROM questions').all(),pending);
 }finally{s.close();}
});
