import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {MARIA_COMPANY,MARIA_TENANT} from '../automation/service-bots/maria-program.mjs';
import {CUSTOMER_DEFERRAL_GUARD,customerDeferralRequested,customerDeferralResumeEvidence} from '../automation/service-bots/customer-deferral.mjs';
import {initializeInactivityFollowup,inactivityCandidate,queueInactivityFollowups,revalidateInactivity,inactivityDeliveryValid} from '../automation/service-bots/inactivity-followup.mjs';

const phone='573000007387',line=BUSINESSES.fumigacion.phones[0],deferral='Gracias, por ahora lo voy a pensar.';
const event=(text,id='DEFERRAL_LOCAL_SOURCE',at=Date.now())=>({id,phone,line,at,kind:'text',fromMe:false,forwarded:false,text});
function config(now){return {company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:now-86400000,inactivityFollowupEnabled:true,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'deferral-local-'+i})),mariaProgram:{enabled:true,url:'https://invalid.example/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:now-86400000,expiresAt:now+86400000}};}
function engineFixture(){
 const now=Date.now(),s=new Store(':memory:','fumigacion',randomBytes(32)),c=config(now),engine=new Engine(s,c);s.importKnowledge(approvedBusinessPriceSchedule());let seq=0;
 const turn=async(text,extra={})=>{const e={...event(text,'DEFERRAL_ENGINE_'+ ++seq,now-60000+seq*1000),...extra};s.enqueue(e);await engine.process(e);const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,state:s.conversation(phone).state,text:row?s.open(row.body):null};};
 return {s,c,turn};
}
test('actual quoted-price deferral receives empathy without repetition, CTA, acceptance or registration',async()=>{
 const f=engineFixture();try{
  const q=await f.turn('Cucarachas en apartamento de una habitación en Itagüí, ¿cuánto cuesta?'),quote=structuredClone(q.state.quotedPrice);assert.equal(quote.priceCop,99000);
  const r=await f.turn(deferral);assert.match(r.text,/pensarlo con calma/);assert.doesNotMatch(r.text,/99[.,]000|continuar|deseas|registr|agend|vigencia/i);assert.deepEqual(r.state.quotedPrice,quote);assert.equal(r.state.customerDeferral.sourceId,r.e.id);assert.equal(r.state.customerDeferral.active,true);assert.equal(r.state.programIntake,undefined);assert.equal(f.s.conversation(phone).hold,0);
  for(const text of ['Hola','Gracias']){const next=await f.turn(text);assert.equal(next.state.customerDeferral.active,true);}
  const resumed=await f.turn('Quiero continuar');assert.equal(resumed.state.customerDeferral.active,false);assert.equal(resumed.state.customerDeferral.sourceId,r.e.id);assert.equal(resumed.state.customerDeferral.resumedBy.sourceId,resumed.e.id);assert.notEqual(resumed.state.quotedPrice.accepted,true);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='OWN_CUSTOMER_DEFERRAL_RESUMED'").get().n,1);
 }finally{f.s.close();}
});
for(const text of ['No quiero el servicio para mi apartamento.','Es para mi apartamento, pero todavía no sé si quiero el servicio.','Me sigue interesando, pero lo voy a pensar.'])test('uncertainty or refusal cannot resume a deferred quote or renew its CTA: '+text,async()=>{
 const f=engineFixture();try{await f.turn('Cucarachas en apartamento de una habitación en Itagüí, ¿cuánto cuesta?');const d=await f.turn(deferral),r=await f.turn(text);assert.equal(r.state.customerDeferral.active,true);assert.equal(r.state.customerDeferral.sourceId,d.e.id);assert.doesNotMatch(r.text||'',/99[.,]000|deseas continuar|cotización tiene/i);assert.notEqual(r.state.quotedPrice.accepted,true);assert.equal(r.state.programIntake,undefined);}finally{f.s.close();}
});
test('new literal facts resume only their own case and a new explicit case has no inherited deferral',async()=>{
 const f=engineFixture();try{await f.turn('Cucarachas en apartamento de una habitación en Itagüí, ¿cuánto cuesta?');const d=await f.turn(deferral),r=await f.turn('Son dos habitaciones.');assert.equal(r.state.customerDeferral.active,false);assert.equal(r.state.customerDeferral.resumedBy.kind,'literal-intake');assert.equal(r.state.customerDeferral.sourceId,d.e.id);assert.notEqual(r.state.quotedPrice?.accepted,true);
  const next=await f.turn('Necesito otro servicio para ratas en una casa de 60 m² en Bello.');assert.notEqual(next.state.caseId,d.state.caseId);assert.equal(next.state.customerDeferral,undefined);
 }finally{f.s.close();}
});
for(const text of ['Tengo un niño con dolor y lo voy a pensar.','Lo voy a pensar y voy a denunciar lo ocurrido.','Lo voy a pensar, pero ya pagué por transferencia.'])test('a deferral does not mask current personal, safety or payment priority: '+text,async()=>{
 const f=engineFixture();try{await f.turn('Cucarachas en apartamento de una habitación en Itagüí, ¿cuánto cuesta?');await f.turn(deferral);const r=await f.turn(text);assert.equal(r.state.customerDeferral.active,true);assert.doesNotMatch(r.text||'',/pensarlo con calma/);assert.ok(f.s.db.prepare("SELECT COUNT(*) n FROM questions").get().n>0);}finally{f.s.close();}
});
for(const [text,extra] of [['Lo voy a pensar, ¿cómo pago?',{}],['Lo voy a pensar, ¿mis mascotas pueden quedarse?',{}],['Mi vecino dijo: lo voy a pensar',{}],['Lo voy a pensar',{forwarded:true}],['Lo voy a pensar',{quotedId:'ANOTHER_SOURCE'}],['¿Sigue vigente la cotización?',{}]])test('questions, exceptions and relayed words do not become deferral or resume authority: '+text+JSON.stringify(extra),()=>{
 const e={...event(text),...extra};assert.equal(customerDeferralRequested(e),false);assert.equal(customerDeferralResumeEvidence(e,{site:'apartamento'}),null);
});

function inactivityFixture(){
 const now=Math.floor(Date.now()/1000)*1000,at=now-21*60000,c=config(now),s=new Store(':memory:','fumigacion',randomBytes(32)),e=event('Necesito una cotización','DEFERRAL_IDLE_SOURCE',at),caseId='fumigacion:'+e.id;
 s.enqueue(e);s.db.prepare("UPDATE events SET state='DONE',received_at=? WHERE id=?").run(at+10,e.id);s.saveConversation(phone,{caseId,lastHandledSourceId:e.id,slots:{},asked:['service'],quotedPrice:{accepted:false}});s.savePriorHistory(phone,{cutoff:c.activatedAt,priorOutgoing:false},e.id);
 s.queue(e.id+':reply',phone,line,'¿Para qué plaga necesitas el servicio?',false,s.conversation(phone).revision,caseId);const out=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');s.recordFirstBotReply(out,'DEFERRAL_IDLE_MID',c.bot,at+500);s.db.prepare("UPDATE outbox SET mid='DEFERRAL_IDLE_MID',state='ACCEPTED',created=?,updated=? WHERE id=?").run(at+100,at+500,out.id);s.delivery('DEFERRAL_IDLE_MID',line,'DELIVERED');s.db.prepare('UPDATE outbox SET updated=? WHERE id=?').run(at+600,out.id);
 let reads=0;const t={currentCustomerActivity:async()=>{reads++;return {complete:true,sources:[{id:e.id,line,at:e.at}]};},fetcher:async(url,options)=>{reads++;return {ok:true,json:async()=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:c.mariaProgram.actorId,phone:JSON.parse(options.body).phone,complete:true,eligibleForFollowup:true})};}};
 initializeInactivityFollowup(c,s,now);return {now,at,c,s,e,caseId,t,reads:()=>reads};
}
test('a historical deferral without a marker blocks a new followup before native or program reads',async()=>{
 const f=inactivityFixture();try{assert.ok(inactivityCandidate(f.c,f.s,phone,f.now));f.s.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.s.seal({...f.e,text:deferral}),f.e.id);assert.equal(inactivityCandidate(f.c,f.s,phone,f.now),null);assert.equal((await queueInactivityFollowups(f.s,f.c,f.t,f.now)).queued,0);assert.equal(f.reads(),0);}finally{f.s.close();}
});
test('active deferral blocks revalidation and an already queued followup without changing revision or hold',async()=>{
 const f=inactivityFixture();try{const candidate=inactivityCandidate(f.c,f.s,phone,f.now);assert.ok(candidate);assert.equal((await queueInactivityFollowups(f.s,f.c,f.t,f.now)).queued,1);const row=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(candidate.id),before=f.s.conversation(phone),reads=f.reads();
  f.s.saveConversation(phone,{...before.state,customerDeferral:{guard:CUSTOMER_DEFERRAL_GUARD,active:true,caseId:f.caseId,line,sourceId:f.e.id,at:f.e.at}});assert.equal(f.s.conversation(phone).revision,before.revision);assert.equal(await revalidateInactivity(f.s,f.c,f.t,candidate,f.now),false);assert.equal(await inactivityDeliveryValid(f.s,f.c,f.t,row),false);assert.equal(f.reads(),reads);assert.equal(f.s.conversation(phone).hold,0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM inactivity_followups').get().n,1);
 }finally{f.s.close();}
});
test('verified later resumption permits the case candidate while preserving earlier deferral and refusals remain excluded',()=>{
 for(const refused of [false,true]){const f=inactivityFixture();try{
  const old={...f.e,at:f.at-2000,text:deferral};f.s.db.prepare('UPDATE events SET body=?,at=? WHERE id=?').run(f.s.seal(old),old.at,old.id);
  const resume=event('Quiero continuar','DEFERRAL_RESUME_SOURCE',f.at-1000),latest=event('Gracias','DEFERRAL_COURTESY_SOURCE',f.at);for(const e of [resume,latest]){f.s.enqueue(e);f.s.db.prepare("UPDATE events SET state='DONE',received_at=? WHERE id=?").run(e.at+10,e.id);}
  if(refused){const rejected=event('No gracias','DEFERRAL_REFUSAL_SOURCE',f.at-1500);f.s.enqueue(rejected);f.s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(rejected.id);}
  f.s.saveConversation(phone,{...f.s.conversation(phone).state,lastHandledSourceId:latest.id,customerDeferral:{guard:CUSTOMER_DEFERRAL_GUARD,active:false,caseId:f.caseId,line,sourceId:old.id,at:old.at,resumedBy:customerDeferralResumeEvidence(resume)}});
  assert.equal(Boolean(inactivityCandidate(f.c,f.s,phone,f.now)),!refused);
 }finally{f.s.close();}}
});
