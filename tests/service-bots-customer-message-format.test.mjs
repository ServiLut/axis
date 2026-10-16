import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {aiConfiguration} from '../automation/service-bots/ai-settings.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {adviserReply,mariaOrdinaryIntakeReply} from '../automation/service-bots/adviser-tone.mjs';
import {composeOwnReply,MARIA_CONVERSATION_GUARD,ownReplyTextAllowed} from '../automation/service-bots/conversational-ai.mjs';
import {literalGreetingReplyProof,literalGreetingReplyStillValid} from '../automation/service-bots/literal-reception.mjs';

const phone='573009000011';
function fixture({attack=false}={}){
 const start=Date.now()-60000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:start,operatorRouting:OPERATOR_ROUTING,
  lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-format-'+i})),
  conversationalAi:aiConfiguration({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_AI_MODEL:'isolated-format-model',BOT_OPENAI_API_KEY:'isolated-key',BOT_AI_MONTHLY_CALL_LIMIT:'40',BOT_AI_ENABLED_FROM:new Date(start).toISOString()},'fumigacion')};
 const engine=new Engine(s,c),requests=[];let n=0;
 const fetcher=async(_url,options)=>{
  const request=JSON.parse(options.body),input=JSON.parse(request.input);requests.push(input);
  const plan={opening:'none',acknowledgements:attack?['field:site']:input.replyContract.verifiedLiteralFacts.slice(0,2).map(f=>f.id),nextStep:'step:0',factualAnchors:input.replyContract.factualAnchors};
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(plan)}]}],usage:{input_tokens:10,output_tokens:10}})};
 };
 const turn=async text=>{
  const e={id:'FORMAT'+ ++n,phone,line:c.lines[0].phone,at:start+1000+n*1000,kind:'text',fromMe:false,forwarded:false,text};s.enqueue(e);await engine.process(e);
  const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply'),original=row?s.open(row.body):null;
  const composed=row?await composeOwnReply(c,s,fetcher,row,original):null;
  return {e,row,original,composed,state:s.conversation(phone).state};
 };
 return {s,c,engine,turn,fetcher,requests};
}

test('the reported apartment quotation opens once then lists only the three missing facts without echoes',async()=>{
 const f=fixture();try{
  const r=await f.turn('Buenas tardes, qué precio tiene el servicio de fumigación para un apartamento');
  assert.equal(r.composed,'Hola, soy María Ángel.\n\nPara cotizarte, cuéntame:\n1. Qué plaga deseas tratar o si buscas prevención.\n2. Cuántas habitaciones o metros cuadrados tiene.\n3. El municipio y barrio o vereda donde necesitas el servicio.');
  assert.doesNotMatch(r.composed,/Me indicas|El inmueble|tipo de inmueble|Con gusto|;|\$|registrad|agendad/i);
  assert.equal((r.composed.match(/soy María Ángel/g)||[]).length,1);
  assert.equal(r.state.slots.site,'apartamento');assert.equal(r.state.intakeSources.site.sourceId,r.e.id);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,0);
  assert.deepEqual(f.requests[0].replyContract.verifiedLiteralFacts,[]);
  assert.equal(ownReplyTextAllowed(f.c,f.s,r.row,r.original,r.composed),true);
 }finally{f.s.close();}
});

test('a first question with only the municipality missing does not repeat the known pest, property or size',async()=>{
 const f=fixture();try{
  const r=await f.turn('Hola, necesito fumigar cucarachas en un apartamento de 60 m², ¿cuánto cuesta?');
  assert.match(r.composed,/^Hola, soy María Ángel\.\n\n/);assert.match(r.composed,/municipio y barrio o vereda/);
  assert.doesNotMatch(r.composed,/Me indicas|El inmueble|qué plaga|tipo de inmueble|habitaciones o metros cuadrados|1\.|;/i);
  assert.equal(r.state.slots.service,'cucarachas');assert.equal(r.state.slots.site,'apartamento');assert.equal(r.state.slots.area,'60 m²');
 }finally{f.s.close();}
});

test('a later property answer is retained and followed by the size question without a new greeting or literal echo',async()=>{
 const f=fixture();try{
  await f.turn('Tengo cucarachas en Medellín');const r=await f.turn('Apartamento');
  assert.match(r.composed,/habitaciones o metros cuadrados/);
  assert.doesNotMatch(r.composed,/Me indicas|El inmueble|apartamento|Hola|soy María|municipio|qué plaga/i);
  assert.equal(r.state.slots.site,'apartamento');assert.equal(r.state.slots.location,'medellin');assert.equal(r.state.intakeSources.site.sourceId,r.e.id);
  assert.deepEqual(f.requests.at(-1).replyContract.verifiedLiteralFacts,[]);
 }finally{f.s.close();}
});

test('a pure greeting retains its exact source proof with the newly readable two-item list',async()=>{
 const f=fixture();try{
  const r=await f.turn('Buenas tardes');
  assert.match(r.original,/^Buenas tardes, soy María Ángel\.\n\nPara cotizarte, cuéntame:\n1\. Qué plaga/);
  assert.match(r.original,/\n2\. El municipio/);assert.doesNotMatch(r.original,/tipo de inmueble|habitaciones|metros cuadrados/);
  const proof=literalGreetingReplyProof(f.c,r.e,r.state,r.original);assert.ok(proof);
  assert.equal(literalGreetingReplyStillValid(f.c,f.s,r.row,r.original),true);
  assert.equal(literalGreetingReplyProof(f.c,r.e,r.state,r.original.replace('1.','99.')),null);
  assert.equal(literalGreetingReplyProof(f.c,r.e,r.state,r.original+' Precio $129.000.'),null);
  assert.equal(literalGreetingReplyProof(f.c,r.e,r.state,r.original.replace('\n2.','\n3.')),null);
 }finally{f.s.close();}
});

test('a current timing acknowledgement stays after the greeting and before the readable missing-data list',async()=>{
 const f=fixture();try{
  const r=await f.turn('Hola, necesito fumigación para hoy en un apartamento');
  assert.match(r.composed,/^Hola, soy María Ángel\.\n\nEntiendo que lo necesitas hoy\.\n\nPara cotizarte, cuéntame:\n1\./);
  assert.doesNotMatch(r.composed,/Me indicas|El inmueble|disponible|agendad|reservad|tipo de inmueble/);
  assert.equal(r.state.slots.preference,'hoy');assert.equal(r.state.intakeSources.preference.sourceId,r.e.id);
 }finally{f.s.close();}
});

test('invalid model acknowledgement IDs fall back to the same clear intake without reintroducing an echo',async()=>{
 const f=fixture({attack:true});try{
  const r=await f.turn('Buenas tardes, qué precio tiene el servicio de fumigación para un apartamento');
  assert.equal(r.composed,r.original);assert.doesNotMatch(r.composed,/Me indicas|El inmueble/);
  assert.ok(f.s.db.prepare("SELECT 1 FROM audit WHERE action='AI_CONTEXTUAL_REPLY_FALLBACK'").get());
 }finally{f.s.close();}
});

test('already-reserved historical wording is reused exactly without rewriting its old order or making another model call',async()=>{
 const f=fixture();try{
  const e={id:'FORMAT_HISTORIC',phone,line:f.c.lines[0].phone,at:Date.now(),kind:'text',fromMe:false,forwarded:false,text:'Apartamento'};f.s.enqueue(e);
  const caseId='fumigacion:'+e.id,conv=f.s.conversation(phone);
  f.s.saveConversation(phone,{...conv.state,caseId,slots:{site:'apartamento'},asked:['size'],intakeSources:{site:{sourceId:e.id,at:e.at}},lastHandledSourceId:e.id});
  const original='¿Cuántas habitaciones o metros cuadrados tiene el lugar?',oldFinal='El inmueble que me indicas es un apartamento. '+original;
  f.s.queue(e.id+':reply',phone,e.line,original,false,conv.revision,caseId);const row=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
  const reserved={guard:MARIA_CONVERSATION_GUARD,caseId,revision:row.revision,originalText:original,finalText:oldFinal,contractHash:'previous-reserved-hash'};
  f.s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('maria-reply-wording:'+row.id,f.s.seal(reserved));
  assert.equal(await composeOwnReply(f.c,f.s,f.fetcher,row,original),oldFinal);assert.equal(f.requests.length,0);
  assert.deepEqual(f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-reply-wording:'+row.id).value),reserved);
  assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(row.id).body),original);
 }finally{f.s.close();}
});

test('approved prices keep their exact reference and are not converted into an intake list',async()=>{
 const f=fixture();try{
  const r=await f.turn('Hola, tengo cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta?');
  assert.match(r.composed,/^Hola, soy María Ángel\./);assert.match(r.composed,/\$149\.000 COP/);
  assert.doesNotMatch(r.composed,/\n1\.|Me indicas|El inmueble/);assert.equal(f.s.priceReplyStillValid(r.row),true);
  assert.equal(f.s.priceReplyReference(r.row).priceCop,149000);
 }finally{f.s.close();}
});

test('approved answers, registration summaries, other bots and human holds keep their existing boundaries',async()=>{
 for(const text of ['Texto de respuesta aprobado con precio literal $129.000.','Registraré el servicio por $129.000. ¿Confirmas estos datos?','Tu solicitud quedó registrada.']){
  assert.equal(adviserReply('fumigacion',{reply:text,state:{programIntake:{stage:'confirm'}}},{firstReply:true}),text);
  assert.equal(adviserReply('fumigacion',{reply:text},{firstReply:true,approvedAnswer:true}),text);
 }
 const technical='¿Qué equipo necesitas revisar?';assert.equal(adviserReply('servicio-tecnico',{reply:technical},{firstReply:true}),technical);
 assert.equal(mariaOrdinaryIntakeReply('¿El producto es seguro para mi gato?'),false);
 assert.equal(mariaOrdinaryIntakeReply('Tu solicitud quedó registrada.'),false);
 const f=fixture();try{await f.turn('Cucarachas en Medellín');f.s.hold(phone,'ISOLATED_HUMAN');const calls=f.requests.length,r=await f.turn('Hola, necesito fumigar un apartamento');assert.equal(r.row,undefined);assert.equal(f.requests.length,calls);assert.equal(f.s.conversation(phone).hold,1);}finally{f.s.close();}
});
