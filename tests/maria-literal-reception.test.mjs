import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {drain,flushOutbox} from '../automation/service-bots/transport.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {literalGreetingEligible,literalGreetingReplyProof,literalGreetingReplyStillValid,MARIA_LITERAL_RECEPTION_GUARD} from '../automation/service-bots/literal-reception.mjs';
import {BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from '../automation/service-bots/line-scope.mjs';
import {initializeInactivityFollowup} from '../automation/service-bots/inactivity-followup.mjs';

function fixture({company='fumigacion',nativeCheck=false}={}){
 const now=Date.now(),c={company,...BUSINESSES[company],enabled:true,chiefOnly:true,activatedAt:now-20000,historyCheckRequired:nativeCheck,conversationalAi:{ready:true},...(company==='fumigacion'?{responseTargetMs:3000}:{}),lines:BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'local-'+i}))};
 const s=new Store(':memory:',company,randomBytes(32)),engine=new Engine(s,c),calls={understand:0,compose:0,owner:0,history:0,attention:0,sends:0};let seq=0;initializeInactivityFollowup(c,s);
 const t={
  understand:async()=>{calls.understand++;return {};},
  composeReply:async(_row,text)=>{calls.compose++;return text;},
  verifyLine:async()=>{calls.owner++;},
  priorHistory:async()=>{calls.history++;return {cutoff:c.activatedAt,priorOutgoing:false,guardVersion:'canonical-and-alternate-phone-v2'};},
  currentAttention:async()=>{calls.attention++;return {complete:true,sources:[]};},
  send:async()=>{calls.sends++;return 'LOCAL_RECEPTION_SEND_'+calls.sends;}
 };
 const event=(text='Hola',extra={})=>({id:'LOCAL_RECEPTION_'+ ++seq,phone:'573009000011',line:c.lines[0].phone,at:now+seq,fromMe:false,forwarded:false,kind:'text',text,...extra});
 const out=e=>{const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return row&&{...row,text:s.open(row.body)};};
 return {c,s,t,calls,event,out,engine,async prepare(text='Hola'){const e=event(text);s.enqueue(e);await engine.process(e);return {e,row:out(e)};},async run(text='Hola',extra={}){const e=event(text,extra);s.enqueue(e);await drain(s,c,t,engine);return {e,row:out(e)};}};
}

test('each complete literal Maria greeting skips both model methods while native safety checks remain active',async()=>{
 for(const nativeCheck of [false,true])for(const text of ['Hola','Buenos días','Buen día','Buenas tardes','Buenas noches','¡Hola!']){
  const f=fixture({nativeCheck});try{
   const {e,row}=await f.run(text);assert.equal(f.calls.understand,0,text);assert.equal(f.calls.compose,0,text);assert.equal(f.calls.sends,1,text);assert.equal(row.state,'ACCEPTED');
   assert.ok(f.calls.owner>=1);assert.equal(f.calls.history,nativeCheck?1:0);assert.equal(f.calls.attention,nativeCheck?1:0);
   assert.match(row.text,/soy María Ángel\. Gracias por escribirnos 😊 Con gusto te ayudo/);assert.match(row.text,/2\. Qué tipo de inmueble es\./);assert.doesNotMatch(row.text,/habitaciones|\$|reservad|agendad|registrad/i);
   assert.equal(f.s.conversation(e.phone).state.literalGreetingReply.guard,MARIA_LITERAL_RECEPTION_GUARD);
   assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  }finally{f.s.close();}
 }
});

test('the new exact three-field warm greeting works on either own line and rejects altered wording',async()=>{
 for(const line of BUSINESSES.fumigacion.phones){const f=fixture();try{
  const {e,row}=await f.run('Hola',{line});assert.equal(row.line,line);assert.equal(f.calls.sends,1);assert.equal(f.calls.understand,0);assert.equal(f.calls.compose,0);assert.ok(row.text.length<=350);
  const state=f.s.conversation(e.phone).state;assert.ok(literalGreetingReplyProof(f.c,e,state,row.text));
  for(const changed of [row.text.replace('Qué tipo de inmueble es.','Qué tipo de inmueble necesitas confirmar.'),row.text.replace('Gracias por escribirnos 😊','Gracias por escribirnos.'),row.text+' Texto adicional.',row.text.replace('3. El municipio','2. El municipio')])assert.equal(literalGreetingReplyProof(f.c,e,state,changed),null);
 }finally{f.s.close();}}
});

test('historical two-field literal proofs retain their original exact whitelist',()=>{
 const f=fixture();try{
  const e=f.event('Hola'),state={slots:{},asked:[],caseId:'fumigacion:'+e.id};
  for(const text of ['Hola.','Hola, soy María Ángel. Para cotizarte, cuéntame qué plaga deseas tratar o si buscas prevención; el municipio y barrio o vereda donde necesitas el servicio.','Hola, soy María Ángel.\n\nPara cotizarte, cuéntame:\n1. Qué plaga deseas tratar o si buscas prevención.\n2. El municipio y barrio o vereda donde necesitas el servicio.'])assert.ok(literalGreetingReplyProof(f.c,e,state,text),text);
 }finally{f.s.close();}
});

test('a greeting prefix, media, quotes, forwards and another company cannot use the literal greeting shortcut',async()=>{
 for(const text of ['Hola, necesito fumigar mi apartamento','Buenos días, ¿cuánto vale?','Buenas noches, me fumigaron y siguen las cucarachas','Hola, tengo intoxicación','Hola, requiero cotización para control de [Plaga] en [Municipio]','"Hola"','¿Hola?']){
  const f=fixture();try{const e=f.event(text);assert.equal(literalGreetingEligible(f.c,e,{}),false,text);await f.run(text);assert.equal(f.calls.understand,1,text);assert.equal(f.s.conversation(e.phone).state.literalGreetingReply,undefined,text);}finally{f.s.close();}
 }
 const f=fixture();try{for(const extra of [{kind:'audio'},{forwarded:true},{fromMe:true},{quotedId:'LOCAL_OLDER_SOURCE'}])assert.equal(literalGreetingEligible(f.c,f.event('Hola',extra),{}),false);}finally{f.s.close();}
 const technical=fixture({company:'servicio-tecnico'});try{await technical.run('Hola');assert.equal(technical.calls.understand,1);assert.equal(technical.calls.compose,1);}finally{technical.s.close();}
});

test('staff takeover, observed prior outgoing and incomplete native attention still prevent delivery',async()=>{
 for(const mode of ['hold','prior-staff','native-staff','incomplete-attention']){
  const f=fixture({nativeCheck:true});try{
   const probe=f.event();
   if(mode==='hold'){const staff=f.event('Atiendo personalmente',{fromMe:true});f.s.enqueue(staff);await f.engine.process(staff);}
   if(mode==='prior-staff')f.t.priorHistory=async()=>{f.calls.history++;return {cutoff:f.c.activatedAt,priorOutgoing:true,guardVersion:'canonical-and-alternate-phone-v2'};};
   if(mode==='native-staff')f.t.currentAttention=async()=>{f.calls.attention++;return {complete:true,sources:[{id:'LOCAL_NATIVE_STAFF',line:probe.line,at:probe.at}]};};
   if(mode==='incomplete-attention')f.t.currentAttention=async()=>{f.calls.attention++;return {complete:false,sources:[]};};
   const {row}=await f.run();assert.equal(f.calls.understand,0,mode);assert.equal(f.calls.compose,0,mode);assert.equal(f.calls.sends,0,mode);assert.equal(f.s.conversation(probe.phone).hold,mode==='incomplete-attention'?0:1,mode);
   if(mode==='incomplete-attention'){assert.equal(row.state,'ATTENTION_REVIEW');assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='HUMAN_TAKEOVER'").get().n,0);}
  }finally{f.s.close();}
 }
});

test('a failed owner check and the suspended red line still prevent greeting sends',async()=>{
 const owner=fixture();try{owner.t.verifyLine=async()=>{owner.calls.owner++;throw Error('LOCAL_OWNER_MISMATCH');};await owner.run();assert.equal(owner.calls.sends,0);assert.equal(owner.calls.understand,0);assert.equal(owner.calls.compose,0);assert.equal(owner.calls.owner,1);}finally{owner.s.close();}
 const scoped=fixture();try{
  scoped.c.operationalLineScope={company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[scoped.c.lines[0].phone],suspendedLines:[scoped.c.lines[1].phone],authorizedAt:new Date(scoped.c.activatedAt+1000).toISOString()};
  await scoped.run('Hola',{line:scoped.c.lines[1].phone});assert.equal(scoped.calls.understand,0);assert.equal(scoped.calls.compose,0);assert.equal(scoped.calls.sends,0);assert.equal(scoped.calls.owner,0);
 }finally{scoped.s.close();}
});

test('facts, quotation, pending review and registration state are excluded from context-free reception',async()=>{
 const f=fixture();try{
  for(const state of [{slots:{service:'cucarachas'}},{quotedPrice:{sourceId:'LOCAL_QUOTE'}},{programIntake:{stage:'name'}},{pendingFaqQuestion:{id:'LOCAL_QUESTION'}},{pendingTesaQuestionId:'LOCAL_PENDING'},{awaitingHumanReview:true},{requestedAfterServiceReview:{kind:'warranty'}},{requestedProductInquiry:{sourceId:'LOCAL_PRODUCT'}},{requestedControlReview:{sourceId:'LOCAL_CONTROL'}}])assert.equal(literalGreetingEligible(f.c,f.event(),state),false,JSON.stringify(state));
  const seed=f.event('Tengo cucarachas');f.s.enqueue(seed);await f.engine.process(seed);const before=f.s.conversation(seed.phone).state;
  f.s.db.prepare("UPDATE outbox SET state='ACCEPTED',mid='LOCAL_SEED_REPLY' WHERE id=?").run(seed.id+':reply');
  const quote={entryId:'LOCAL_PENDING_PRICE',priceCop:149000,sourceId:seed.id,accepted:false};f.s.saveConversation(seed.phone,{...before,quotedPrice:quote});
  await f.run();assert.equal(f.calls.understand,1);assert.equal(f.calls.compose,1);assert.deepEqual(f.s.conversation(seed.phone).state.quotedPrice,quote);assert.equal(f.s.conversation(seed.phone).state.literalGreetingReply,undefined);
 }finally{f.s.close();}
});

test('source text edits and case changes invalidate a prepared literal greeting proof',async()=>{
 for(const mutation of ['source-text','case']){
  const f=fixture();try{
   const {e,row}=await f.prepare();assert.equal(literalGreetingReplyStillValid(f.c,f.s,row,row.text),true);
   if(mutation==='source-text')f.s.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.s.seal({...e,text:'Buenas noches'}),e.id);
   else f.s.saveConversation(e.phone,{...f.s.conversation(e.phone).state,caseId:'fumigacion:LOCAL_DIFFERENT_CASE'});
   assert.equal(literalGreetingReplyStillValid(f.c,f.s,row,row.text),false,mutation);
  }finally{f.s.close();}
 }
});

test('outgoing hash, state mutation, source identity, revision and holds invalidate the shortcut',async()=>{
 for(const mutation of ['text-hash','state','source-id','source-kind','revision','hold']){
  const f=fixture();try{
   const {e,row}=await f.prepare();assert.equal(literalGreetingReplyStillValid(f.c,f.s,row,row.text),true);let text=row.text;
   if(mutation==='text-hash')text+=' Texto distinto.';
   if(mutation==='state')f.s.saveConversation(e.phone,{...f.s.conversation(e.phone).state,slots:{location:'medellin'}});
   if(mutation==='source-id')f.s.saveConversation(e.phone,{...f.s.conversation(e.phone).state,lastHandledSourceId:'LOCAL_DIFFERENT_SOURCE'});
   if(mutation==='source-kind')f.s.db.prepare('UPDATE events SET body=? WHERE id=?').run(f.s.seal({...e,kind:'audio'}),e.id);
   if(mutation==='revision')f.s.enqueue(f.event('Cucarachas'));
   if(mutation==='hold')f.s.hold(e.phone,'LOCAL_HUMAN_AFTER_PREPARATION',true);
   assert.equal(literalGreetingReplyStillValid(f.c,f.s,row,text),false,mutation);
  }finally{f.s.close();}
 }
});

test('native staff activity after preparation suppresses a fast reply without opening either model method',async()=>{
 const f=fixture({nativeCheck:true});try{
  const {e}=await f.prepare();f.t.currentAttention=async()=>{f.calls.attention++;return {complete:true,sources:[{id:'LOCAL_LATE_STAFF',line:e.line,at:e.at+1}]};};
  await flushOutbox(f.s,f.c,f.t);assert.equal(f.calls.understand,0);assert.equal(f.calls.compose,0);assert.equal(f.calls.sends,0);assert.equal(f.s.conversation(e.phone).hold,1);
 }finally{f.s.close();}
});
