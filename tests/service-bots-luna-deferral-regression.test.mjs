import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {Transport,drain} from '../automation/service-bots/transport.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {ownReplyTextAllowed} from '../automation/service-bots/conversational-ai.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {MARIA_PROGRAM_URL,MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
import {CUSTOMER_DEFERRAL_GUARD,customerDeferralRequested,customerDeferralResumeEvidence} from '../automation/service-bots/customer-deferral.mjs';
import {queueInactivityFollowups} from '../automation/service-bots/inactivity-followup.mjs';

const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/luna-customer-deferral-20261017.json',import.meta.url),'utf8'));
const exact='Me interesa, pero prefiero pensarlo con calma y después les aviso.';
const source=text=>({id:'SYNTHETIC_LITERAL_DEFERRAL',phone:'573000007387',line:BUSINESSES.fumigacion.phones[0],at:Date.now(),kind:'text',fromMe:false,forwarded:false,text});
for(const text of [exact,'Voy a pensarlo con calma y después te aviso.','Gracias, necesito consultarlo con mi pareja y luego les aviso.',
 'Me sigue interesando, pero quiero consultarlo primero con mi familia.','Prefiero consultarlo antes, gracias.','Después les aviso.','Les aviso más tarde.',
 'Me interesa, pero por ahora lo voy a pensar.','Lo consultaré con mi esposo y les aviso después.'])test('first-person postponement is not acceptance or a global optout: '+text,()=>{
 const e=source(text);assert.equal(customerDeferralRequested(e),true);assert.equal(customerDeferralResumeEvidence(e,{site:'apartamento'}),null);
});
for(const [text,patch] of [['Me interesa, pero no me escriban más.',{}],['Prefiero pensarlo, cancela el servicio.',{}],['Prefiero pensarlo, inútiles.',{}],
 ['Me interesa, pero quiero saber si la garantía cubre refuerzo.',{}],['Me interesa, pero ya pagué y necesito un comprobante.',{}],['Me interesa, pero mi vecino dijo que lo va a pensar.',{}],
 [exact,{forwarded:true}],[exact,{quotedId:'ANOTHER_NATIVE_MID'}],['¿Puedo consultarlo y avisarles después?',{}],['Sí, acepto el servicio.',{}]])test('postponement grammar cannot mask another instruction, exception or authority: '+text+JSON.stringify(patch),()=>{
 assert.equal(customerDeferralRequested({...source(text),...patch}),false);
});

test('Transport replays the exact captured Luna misunderstanding while local postponement stops the stale quotation planner',async t=>{
 const start=Date.parse('2026-10-17T18:49:00.000Z');t.mock.timers.enable({apis:['Date'],now:start});let networkAttempts=0;t.mock.method(globalThis,'fetch',()=>{networkAttempts++;throw Error('NO_REAL_NETWORK');});
 const s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:start-60000,publicResponseStartsAt:start-60000,historyCheckRequired:true,responseTargetMs:3000,operatorRouting:CURRENT_OPERATOR_ROUTING,inactivityFollowupEnabled:true,
  lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'captured-luna-deferral-'+i})),conversationalAi:{provider:'openai',ready:true,key:'synthetic_not_a_secret_or_live_key',model:'gpt-6-luna',scope:'FUMIGACION',enabledFrom:start-60000,monthlyCallLimit:10000},
  staffPlanning:{enabled:true,mode:'internal-staff-assignment',startsAt:start-60000},mariaProgram:{enabled:true,url:MARIA_PROGRAM_URL,token:'synthetic_registration_token_not_for_network',actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:start-60000,expiresAt:Date.parse('2026-11-07T16:56:52.680Z')}};
 const calls=[],sent=[],engine=new Engine(s,c),transport=new Transport(c,async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses','no backend or provider endpoint is available');const body=JSON.parse(opts.body),input=JSON.parse(body.input),schema=body.text?.format?.name;
  const answer=captured.answers.find(a=>a.schema===schema&&a.customerText===input.customerText);assert.ok(answer,'exact captured response exists for '+schema+'/'+input.customerText);calls.push({schema,text:input.customerText,answer:answer.structuredOutput,contract:input.replyContract});
  return {ok:true,status:200,json:async()=>({status:'completed',id:'OFFLINE_'+answer.responseId,usage:answer.usage,output:[{content:[{type:'output_text',text:JSON.stringify(answer.structuredOutput)}]}]})};
 });
 transport.verifyLine=async()=>({ownerVerified:true,open:true});transport.priorHistory=async()=>({cutoff:c.activatedAt,priorOutgoing:false,guardVersion:'canonical-and-alternate-phone-v2'});
 transport.currentAttention=async phone=>({complete:true,through:Date.now(),sources:s.db.prepare('SELECT mid id,line FROM outbox WHERE phone=? AND mid IS NOT NULL').all(phone),checks:[]});
 transport.currentCustomerActivity=async(phone,at)=>({complete:true,sources:s.db.prepare('SELECT id,line,at FROM events WHERE phone=? AND from_me=0 AND at>=?').all(phone,at)});
 transport.request=async()=>{throw Error('NO_NATIVE_HISTORY_READ_NEEDED');};transport.send=async(row,text)=>{sent.push({id:row.id,text});return 'OFFLINE_CAPTURED_REPLY_'+sent.length;};
 let seq=0;const turn=async text=>{const e={...source(text),id:'CAPTURED_LUNA_REPLAY_'+ ++seq,at:start+seq*5000};t.mock.timers.setTime(e.at);s.enqueue(e);await drain(s,c,transport,engine);for(const row of s.db.prepare("SELECT * FROM outbox WHERE state='ACCEPTED'").all())s.delivery(row.mid,row.line,'DELIVERED');const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,text:row?s.open(row.body):null,state:s.conversation(e.phone).state};};
 try{
  assert.equal(captured.model,'gpt-6-luna');const quote=await turn(captured.answers[0].customerText);assert.match(quote.text,/129\.000/);
  const objection=await turn(captured.answers[2].customerText);assert.match(objection.text,/presupuesto|precio/);const priorQuote=structuredClone(objection.state.quotedPrice);
  const result=await turn(exact);assert.match(result.text,/pensarlo con calma/);assert.doesNotMatch(result.text,/129\.000|Deseas continuar|qué presupuesto|agend|registr|garant/i);
  assert.equal(result.state.customerDeferral.guard,CUSTOMER_DEFERRAL_GUARD);assert.equal(result.state.customerDeferral.active,true);assert.equal(result.state.customerDeferral.sourceId,result.e.id);assert.deepEqual(result.state.quotedPrice,priorQuote);assert.notEqual(result.state.quotedPrice.accepted,true);assert.equal(result.state.programIntake,undefined);assert.notEqual(result.state.doNotContact,true);assert.notEqual(result.state.closed,true);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'commercial-optout:%' OR key LIKE 'maria-registration:%'").get().n,0);assert.equal(s.conversation(result.e.phone).hold,0);
  const wrongUnderstanding=calls.find(call=>call.schema==='maria_literal_slots'&&call.text===exact);assert.deepEqual(wrongUnderstanding?.answer,captured.answers[4].structuredOutput);assert.equal(wrongUnderstanding.answer.slots.preference,'prefiero pensarlo con calma y después les aviso');
  const planner=calls.find(call=>call.schema==='maria_contextual_reply'&&call.text===exact);assert.equal(planner,undefined,'the deterministic deferral does not offer the old quotation plan to Luna');
  const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(result.e.id+':reply');assert.equal(ownReplyTextAllowed(c,s,row,result.text,'Con gusto. El servicio tiene un valor de $129.000 COP. ¿Deseas continuar con esta cotización?'),false);
  const count=calls.length;t.mock.timers.setTime(start+30*60000);assert.equal((await queueInactivityFollowups(s,c,transport,Date.now())).queued,0);assert.equal(calls.length,count);assert.equal(networkAttempts,0);assert.equal(c.conversationalAi.scope,'FUMIGACION');
 }finally{s.close();}
});
