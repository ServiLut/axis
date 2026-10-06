import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {aiConfiguration,aiStatus,CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {minimizeAiText,understandOwnCustomer,composeOwnReply,replyCandidates,probeOwnAi} from '../automation/service-bots/conversational-ai.mjs';
import {BUSINESSES,OPERATOR_ROUTING,SANDRA,configFromEnv} from '../automation/service-bots/config.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {Transport,drain} from '../automation/service-bots/transport.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';

const phone='573001112233',slots=()=>({service:null,site:null,location:null,detail:null,preference:null});
const setup=extra=>({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_AI_MODEL:'isolated-model',BOT_OPENAI_API_KEY:'isolated-own-key',BOT_AI_MONTHLY_CALL_LIMIT:'20',BOT_AI_ENABLED_FROM:new Date(Date.now()-10000).toISOString(),...extra});
function fixture({limit=20,handler}={}){
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING,historyCheckRequired:true,activatedAt:Date.now()-20000,
  lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i})),conversationalAi:aiConfiguration(setup({BOT_AI_MONTHLY_CALL_LIMIT:String(limit)}),'fumigacion')};
 const s=new Store(':memory:','fumigacion',randomBytes(32)),engine=new Engine(s,c),requests=[],sent=[];
 s.importKnowledge(approvedBusinessPriceSchedule());
 const fetcher=async(url,options)=>{
  const body=JSON.parse(options.body);requests.push({url,options,body});
  const input=JSON.parse(body.input),value=handler?await handler(body,input,s,c):body.text.format.name==='maria_literal_slots'?{slots:slots()}:{choice:1};
  if(value instanceof Error)throw value;
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:25,output_tokens:10}})};
 };
 const t=new Transport(c,fetcher);
 t.verifyLine=async()=>({verified:true});t.priorHistory=async()=>({cutoff:c.activatedAt,priorOutgoing:false,guardVersion:'canonical-and-alternate-phone-v2'});
 t.currentAttention=async()=>({complete:true,sources:[]});t.send=async(row,text)=>{sent.push({row,text});return 'ISOLATED'+sent.length;};
 const run=async(id,text,extra={})=>{s.enqueue({id,text,phone,line:c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',...extra});await drain(s,c,t,engine);};
 const reply=id=>{const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id+':reply');return row&&{...row,text:s.open(row.body)};};
 return {c,s,t,engine,fetcher,requests,sent,run,reply};
}

test('own explicit configuration requires a model, scope, bounded usage and a new activation cut',()=>{
 assert.equal(aiConfiguration({},'fumigacion').ready,false);
 const partial=aiConfiguration({BOT_AI_PROVIDER:'openai'},'fumigacion');assert.equal(partial.ready,false);assert.equal(partial.missing.length,5);
 for(const change of [{BOT_AI_SCOPE:'PSICOLOGOS'},{BOT_AI_MODEL:''},{BOT_OPENAI_API_KEY:''},{BOT_AI_MONTHLY_CALL_LIMIT:'0'},{BOT_AI_MONTHLY_CALL_LIMIT:'1.5'},{BOT_AI_ENABLED_FROM:'bad'}])assert.equal(aiConfiguration(setup(change),'fumigacion').ready,false);
 assert.throws(()=>aiConfiguration(setup(),'servicio-tecnico'),/SCOPE/);
 assert.throws(()=>aiConfiguration(setup({BOT_AI_PROVIDER:'untrusted'}),'fumigacion'),/UNSUPPORTED/);
 const publicStatus=aiStatus({company:'fumigacion',conversationalAi:aiConfiguration(setup(),'fumigacion')});
 assert.equal(publicStatus.configured,true);assert.equal(publicStatus.trainedModel,false);assert.equal(JSON.stringify(publicStatus).includes('isolated-own-key'),false);
});

test('existing runtime defaults keep both companies without AI and own configuration stays isolated',()=>{
 for(const company of ['fumigacion','servicio-tecnico']){
  const env={BOT_COMPANY:company,BOT_LINES_JSON:JSON.stringify(BUSINESSES[company].phones.map((phone,i)=>({phone,instance:'own-'+i,apiKey:String(i).repeat(32)}))),
   BOT_AUTH_TOKEN_HASH:'a'.repeat(64),BOT_WEBHOOK_TOKEN_HASH:'c'.repeat(64),BOT_DATA_KEY:'b'.repeat(64),BOT_DATABASE_PATH:'/data/'+company+'/bot.sqlite',BOT_EVOLUTION_URL:'https://own.example'};
  const config=configFromEnv(env);assert.equal(config.conversationalAi.ready,false);
  if(company==='fumigacion')assert.equal(configFromEnv({...env,...setup()}).conversationalAi.ready,true);
 }
});

test('provider request uses structured Responses, disables response storage and excludes raw histories and other knowledge',async()=>{
 const f=fixture({handler:()=>({slots:{...slots(),location:'Medellín',detail:'inventado'}})});
 try{
  const event={id:'AI_LITERAL01',phone,line:f.c.lines[0].phone,kind:'text',fromMe:false,at:Date.now(),text:'Estoy en Medellín. Correo personal@example.com, teléfono +57 300 111 2233'};
  const result=await understandOwnCustomer(f.c,f.s,f.fetcher,event,{slots:{site:'apartamento',locationDetails:'calle 123 número 456',staff:'OTHER-COMPANY-SECRET'},asked:['size'],caseAnswers:[{answer:'UNTRUSTED-ANSWER'}],conversationHistory:{turns:['OTHER-HISTORY']}});
  assert.equal(result.slots.location,'Medellín');assert.equal(result.slots.detail,undefined);assert.equal(result.guard,CONVERSATIONAL_AI_GUARD);
  const r=f.requests[0];assert.equal(r.url,'https://api.openai.com/v1/responses');assert.equal(r.body.store,false);assert.equal(r.body.text.format.strict,true);assert.equal(r.options.redirect,'error');
  const input=r.body.input;for(const forbidden of ['personal@example.com','573001112233','300 111 2233','OTHER-HISTORY','OTHER-COMPANY-SECRET','UNTRUSTED-ANSWER','calle 123'])assert.equal(input.includes(forbidden),false);
  assert.equal(r.options.headers.Authorization,'Bearer isolated-own-key');assert.equal(input.includes(event.id),false);
 }finally{f.s.close();}
});

test('extraction never replaces current literal pest combinations or prior case facts',()=>{
 const e={id:'AI_FACT001',at:Date.now(),kind:'text',text:'Cucarachas y hormigas en apartamento en Medellín',fromMe:false};
 const analysis={guard:CONVERSATIONAL_AI_GUARD,company:'FUMIGACION',eventId:e.id,slots:{service:'Cucarachas',site:'apartamento',location:'Medellín'}};
 const d=customerDecision('fumigacion',{slots:{},asked:[]},e,analysis);
 assert.equal(d.state.slots.service,'cucarachas y hormigas');
 const later={...e,id:'AI_FACT002',text:'Mañana en la tarde'};
 const next=customerDecision('fumigacion',{slots:{site:'casa'},asked:['preference']},later,{...analysis,eventId:later.id,slots:{preference:later.text}});
 assert.equal(next.state.slots.site,'casa');assert.equal(next.state.intakeSources.preference.sourceId,later.id);
 const mismatch=customerDecision('fumigacion',{slots:{},asked:[]},later,{...analysis,slots:{preference:later.text}});
 assert.equal(mismatch.state.slots.preference,undefined);
});

test('old events, staff, internal numbers, forwards, media and negated or hypothetical sources make no model calls',async()=>{
 const f=fixture();try{
  const e={id:'AI_SKIP001',phone,line:f.c.lines[0].phone,kind:'text',text:'Mi apartamento',at:Date.now(),fromMe:false};
  for(const change of [{at:f.c.conversationalAi.enabledFrom-1},{fromMe:true},{phone:SANDRA},{forwarded:true},{kind:'audio'},{line:'other-line'},{text:'No tengo apartamento'},{text:'Si tuviera cucarachas'},{text:'Mi vecino tiene cucarachas'}])assert.deepEqual(await understandOwnCustomer(f.c,f.s,f.fetcher,{...e,...change},{}),{});
  f.s.enqueue(e);f.s.hold(phone,'ISOLATED-HUMAN');assert.deepEqual(await understandOwnCustomer(f.c,f.s,f.fetcher,e,{}),{});assert.equal(f.requests.length,0);
 }finally{f.s.close();}
});

test('monthly usage and event deduplication bound calls; failed attempts are never automatically retried',async()=>{
 const f=fixture({limit:1});try{
  const e={id:'AI_LIMIT01',phone,line:f.c.lines[0].phone,kind:'text',text:'Medellín',at:Date.now(),fromMe:false};
  await understandOwnCustomer(f.c,f.s,f.fetcher,e,{});await understandOwnCustomer(f.c,f.s,f.fetcher,e,{});assert.equal(f.requests.length,1);
  await assert.rejects(understandOwnCustomer(f.c,f.s,f.fetcher,{...e,id:'AI_LIMIT02'},{}),/MONTHLY_CALL_LIMIT/);assert.equal(f.requests.length,1);
 }finally{f.s.close();}
 const failed=fixture({handler:()=>Error('isolated network failure')});try{
  const e={id:'AI_FAILED1',phone,line:failed.c.lines[0].phone,kind:'text',text:'Medellín',at:Date.now(),fromMe:false};
  await assert.rejects(understandOwnCustomer(failed.c,failed.s,failed.fetcher,e,{}));
  await assert.rejects(understandOwnCustomer(failed.c,failed.s,failed.fetcher,e,{}),/ALREADY_RESERVED/);assert.equal(failed.requests.length,1);
 }finally{failed.s.close();}
});

test('AI selects a reviewed next question while keeping the same case and supplied fields',async()=>{
 const f=fixture();try{
  await f.run('AI_CONT001','Tengo cucarachas en Medellín');await f.run('AI_CONT002','Apartamento');
  const row=f.reply('AI_CONT002');assert.equal(row.text,'Para completar la cotización, ¿cuántas habitaciones o metros cuadrados tiene el lugar?');
  assert.equal(f.s.conversation(phone).state.slots.site,'apartamento');assert.doesNotMatch(row.text,/plaga|municipio|Hola/);assert.equal(row.state,'ACCEPTED');
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.s.close();}
});

test('own quote retains 99,000 per mattress and validated price references after style selection',async()=>{
 const f=fixture();try{
  await f.run('AI_PRICE01','Chinches en dos colchones de un apartamento en Medellín, ¿cuánto cuesta?');
  const row=f.reply('AI_PRICE01');assert.match(row.text,/\$198\.000 COP/);assert.match(row.text,/^Con gusto te ayudo/);
  assert.equal(f.s.priceReplyReference(row).priceCop,198000);assert.equal(f.s.priceReplyStillValid(row),true);
  assert.doesNotMatch(row.text,/garantiz|inofensiv|reservad|confirmado|100\.000|70\.000/i);
 }finally{f.s.close();}
});

test('arbitrary generated claims, invalid schemas and unavailable AI retain the deterministic reply',async()=>{
 for(const value of [{choice:400,reply:'Precio inventado, reserva confirmada'},{choice:-1},Error('isolated network failure')]){
  const f=fixture({handler:body=>body.text.format.name==='maria_literal_slots'?{slots:slots()}:value});try{
   await f.run('AI_BAD0001','Cucarachas en Medellín');await f.run('AI_BAD0002','Apartamento');
   assert.equal(f.reply('AI_BAD0002').text,'¿Cuántas habitaciones o metros cuadrados tiene el lugar?');assert.equal(f.reply('AI_BAD0002').state,'ACCEPTED');
  }finally{f.s.close();}
 }
});

test('staff ingestion during model processing suppresses the reply and preserves human attention',async()=>{
 let intervene=false;const f=fixture({handler:(body,input,s,c)=>{
  if(body.text.format.name==='maria_literal_slots')return {slots:slots()};
  if(intervene)s.enqueue({id:'AI_STAFF01',phone,line:c.lines[0].phone,fromMe:true,kind:'text',text:'Personal atendiendo',at:Date.now()});
  return {choice:1};
 }});try{
  await f.run('AI_RACE001','Cucarachas en Medellín');intervene=true;const sent=f.sent.length;await f.run('AI_RACE002','Apartamento');
  assert.equal(f.reply('AI_RACE002').state,'SUPPRESSED_HUMAN');assert.equal(f.s.conversation(phone).hold,1);assert.equal(f.sent.length,sent);
 }finally{f.s.close();}
});

test('native staff activity observed after model processing blocks delivery',async()=>{
 const f=fixture();try{
  await f.run('AI_NATIVE1','Cucarachas en Medellín');const sent=f.sent.length;
  f.t.currentAttention=async()=>({complete:true,sources:[{id:'NATIVE_HUMAN',line:f.c.lines[0].phone,at:Date.now()}]});
  await f.run('AI_NATIVE2','Apartamento');assert.equal(f.s.conversation(phone).hold,1);assert.equal(f.sent.length,sent);
 }finally{f.s.close();}
});

test('a verified FAQ remains literal and never requests a stylistic model call',async()=>{
 const f=fixture();try{
  const e={id:'AI_FAQ0001',phone,line:f.c.lines[0].phone,kind:'text',text:'¿En qué municipio?',at:Date.now(),fromMe:false};f.s.enqueue(e);
  const conv=f.s.conversation(phone);f.s.saveConversation(phone,{...conv.state,caseId:'fumigacion:'+e.id});
  f.s.queue(e.id+':reply',phone,e.line,'¿En qué municipio y barrio necesitas el servicio?',false,conv.revision,'fumigacion:'+e.id);
  f.s.saveApprovedReplyReference(e.id+':reply',{finalText:'¿En qué municipio y barrio necesitas el servicio?'});
  const row=f.s.db.prepare('SELECT * FROM outbox').get();
  assert.equal(await composeOwnReply(f.c,f.s,f.fetcher,row,f.s.open(row.body)),f.s.open(row.body));assert.equal(f.requests.length,0);
 }finally{f.s.close();}
});

test('isolated own health is deduplicated, bounded and creates no business or customer traffic',async()=>{
 const f=fixture({handler:()=>({choice:0})});try{
  const result=await probeOwnAi(f.c,f.s,f.fetcher);const repeated=await probeOwnAi(f.c,f.s,f.fetcher);
  assert.equal(result.connectionVerifiedAt,repeated.connectionVerifiedAt);assert.equal(result.customerTrafficVerified,false);assert.equal(f.requests.length,1);
  for(const table of ['events','outbox','conversations','questions'])assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 }finally{f.s.close();}
});

test('privacy minimization preserves ordinary area facts and price candidates never change amounts',()=>{
 const text=minimizeAiText('Apartamento de 60 m², dos habitaciones, calle 12 número 30. Correo privado@example.com');
 assert.match(text,/60 m²/);assert.doesNotMatch(text,/calle 12|privado@example/);
 const quote='Con gusto. La cotización es $99.000 COP por un colchón. ¿Deseas continuar?';
 for(const candidate of replyCandidates(quote))assert.match(candidate,/\$99\.000 COP/);
 assert.deepEqual(replyCandidates('Bearer secreto'),[]);
});
