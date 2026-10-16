import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {aiConfiguration} from '../automation/service-bots/ai-settings.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {mariaOrdinaryIntakeReply} from '../automation/service-bots/adviser-tone.mjs';
import {composeOwnReply,MARIA_CONVERSATION_GUARD} from '../automation/service-bots/conversational-ai.mjs';

const phone='573000006221',list='Para cotizarte, me falta:\n1. Qué plaga deseas tratar o si buscas prevención.\n2. En qué barrio o vereda necesitas el servicio.';
function fixture(mode='normal'){
 const start=Date.now()-60000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:start,operatorRouting:OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((line,i)=>({phone:line,instance:'isolated-missing-pest-'+i})),conversationalAi:aiConfiguration({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_AI_MODEL:'isolated-format-model',BOT_OPENAI_API_KEY:'isolated-key',BOT_AI_MONTHLY_CALL_LIMIT:'40',BOT_AI_ENABLED_FROM:new Date(start).toISOString()},'fumigacion')};
 const engine=new Engine(s,c),requests=[];let sequence=0;
 const fetcher=async(_url,options)=>{const input=JSON.parse(JSON.parse(options.body).input);requests.push(input);if(mode==='failed-provider')throw Error('ISOLATED_MODEL_FAILURE');const plan={opening:'none',acknowledgements:mode==='unapproved-fact'?['field:location']:mode==='quote-unapproved-fact'?['field:service']:input.replyContract.verifiedLiteralFacts.slice(0,2).map(f=>f.id),nextStep:'step:0',factualAnchors:input.replyContract.factualAnchors};return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(plan)}]}],usage:{input_tokens:10,output_tokens:10}})};};
 const turn=async text=>{const e={id:'MISSING_PEST_LIST_'+ ++sequence,phone,line:c.lines[0].phone,at:start+sequence*1000,kind:'text',fromMe:false,forwarded:false,text};historicalPriceClock.timers.setTime(e.at);s.enqueue(e);await engine.process(e);const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply'),original=row?s.open(row.body):null;return {e,row,original,state:s.conversation(phone).state,composed:row?await composeOwnReply(c,s,fetcher,row,original):null};};
 return {s,c,turn,fetcher,requests};
}

test('only the exact deterministic missing-pest and neighborhood list is classified as clear intake',()=>{
 assert.equal(mariaOrdinaryIntakeReply(list),true);assert.equal(mariaOrdinaryIntakeReply('Buenas tardes, soy María Ángel.\n\n'+list),true);assert.equal(mariaOrdinaryIntakeReply('Entiendo que lo necesitas hoy.\n\n'+list),true);
 for(const text of [list+'\n3. Confirma una reserva.',list+' Precio $129.000.',list.replace('2.','3.'),list.replace('En qué barrio','Qué horario'),list.replace('\n2.',' 2.'),'Para cotizarte, me falta:\n1. Qué plaga deseas tratar o si buscas prevención.','Tu solicitud quedó registrada.','¿El producto es seguro para mi gato?'])assert.equal(mariaOrdinaryIntakeReply(text),false,text);
});

for(const mode of ['normal','unapproved-fact','failed-provider'])test('the supplied rooms and municipality stay retained while '+mode+' composition asks only the two missing facts without an echo',async()=>{
 const f=fixture(mode);try{
  await f.turn('Buenas tardes, ¿qué precio tiene fumigar un apartamento?');const r=await f.turn('Tiene dos habitaciones y queda en Itagüí.');
  assert.equal(r.original,list);assert.equal(r.composed,list);assert.deepEqual(f.requests.at(-1).replyContract.verifiedLiteralFacts,[]);assert.equal(r.state.slots.location,'itagui');assert.ok(r.state.slots.rooms);assert.equal(r.state.intakeSources.location.sourceId,r.e.id);assert.equal(r.state.intakeSources.rooms.sourceId,r.e.id);
  assert.doesNotMatch(r.composed,/La ubicación|Ya tengo|Me indicas|dos habitaciones|itagui|Hola|soy María|hora|agendad|registrad|\$/i);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,0);
  if(mode!=='normal')assert.ok(f.s.db.prepare("SELECT 1 FROM audit WHERE action='AI_CONTEXTUAL_REPLY_FALLBACK'").get());
 }finally{f.s.close();}
});

test('an existing wording reservation with the old echoes remains byte-for-byte unchanged without another model call',async()=>{
 const f=fixture();try{
  const e={id:'MISSING_PEST_RESERVED',phone,line:f.c.lines[0].phone,at:Date.now(),kind:'text',fromMe:false,forwarded:false,text:'Tiene dos habitaciones y queda en Itagüí.'};f.s.enqueue(e);const conv=f.s.conversation(phone),caseId='fumigacion:'+e.id;
  f.s.saveConversation(phone,{...conv.state,caseId,slots:{site:'apartamento',location:'itagui',rooms:'dos habitaciones'},asked:['service'],intakeSources:{location:{sourceId:e.id,at:e.at},rooms:{sourceId:e.id,at:e.at}},lastHandledSourceId:e.id});f.s.queue(e.id+':reply',phone,e.line,list,false,conv.revision,caseId);
  const row=f.s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply'),oldFinal='La ubicación que me indicas es itagui. Ya tengo el dato de dos habitaciones. '+list,saved={guard:MARIA_CONVERSATION_GUARD,caseId,revision:row.revision,originalText:list,finalText:oldFinal,contractHash:'immutable-prior-reservation'};
  f.s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('maria-reply-wording:'+row.id,f.s.seal(saved));const encryptedBefore=f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-reply-wording:'+row.id).value;
  assert.equal(await composeOwnReply(f.c,f.s,f.fetcher,row,list),oldFinal);assert.equal(f.requests.length,0);assert.equal(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-reply-wording:'+row.id).value,encryptedBefore);assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(row.id).body),list);
 }finally{f.s.close();}
});

for(const mode of ['normal','quote-unapproved-fact','failed-provider'])test('a verified quotation after fragmented intake keeps price and continuation without a fact preface: '+mode,async()=>{
 const f=fixture(mode);try{
  await f.turn('Buenas tardes, ¿qué precio tiene fumigar un apartamento?');await f.turn('Tiene dos habitaciones y queda en Itagüí.');await f.turn('Barrio San Pío');const r=await f.turn('Son cucarachas.');
  assert.equal(r.composed,r.original);assert.match(r.composed,/\$129\.000 COP/);assert.match(r.composed,/¿Deseas continuar con esta cotización\?/);assert.doesNotMatch(r.composed,/Me indicas|El inmueble|La ubicación|Ya tengo|Hola|soy María|registrad|agendad|reservad/i);assert.deepEqual(f.requests.at(-1).replyContract.verifiedLiteralFacts,[]);assert.ok(f.requests.at(-1).replyContract.factualAnchors.includes('runtime-quotation-price-and-scope'));
  assert.equal(f.s.priceReplyReference(r.row).priceCop,129000);assert.equal(f.s.priceReplyStillValid(r.row),true);assert.equal(r.state.quotedPrice.priceCop,129000);assert.notEqual(r.state.quotedPrice.accepted,true);assert.equal(r.state.programIntake,undefined);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 }finally{f.s.close();}
});

test('a previously reserved quotation with a literal pest echo remains unchanged and approved answers skip composition',async()=>{
 const f=fixture();try{
  await f.turn('Apartamento de dos habitaciones en Itagüí');const r=await f.turn('Cucarachas'),key='maria-reply-wording:'+r.row.id,oldFinal='Me indicas que necesitas atención para cucarachas. '+r.original,reserved={guard:MARIA_CONVERSATION_GUARD,caseId:r.row.case_id,revision:r.row.revision,originalText:r.original,finalText:oldFinal,contractHash:'immutable-previous-price-reservation'};
  f.s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(f.s.seal(reserved),key);const before=f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value,calls=f.requests.length;
  assert.equal(await composeOwnReply(f.c,f.s,f.fetcher,r.row,r.original),oldFinal);assert.equal(f.requests.length,calls);assert.equal(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get(key).value,before);
  f.s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('approved-reply:'+r.row.id,f.s.seal({source:'ISOLATED_APPROVED_SOURCE'}));assert.equal(await composeOwnReply(f.c,f.s,f.fetcher,r.row,r.original),r.original);assert.equal(f.requests.length,calls);
 }finally{f.s.close();}
});
