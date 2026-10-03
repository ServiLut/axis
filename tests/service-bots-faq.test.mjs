import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {FAQ_AUTHORITY,commonQuestionTopics,selectCommonAnswer} from '../automation/service-bots/faq.mjs';
import {createBotServer} from '../automation/service-bots/server.mjs';
import {drain} from '../automation/service-bots/transport.mjs';

// Fictional isolated sources and wording; none are imported or sent in production.
function document(entries,patch={}){
  const originalText='Texto de referencia ficticio de una prueba aislada.';
  return {company:'fumigacion',kind:'approved_customer_answers',at:new Date().toISOString(),authorizationSource:FAQ_AUTHORITY,
    source:{nativeVerified:true,sender:'573043332213',line:'573126938721',id:'FICTITIOUS_SOURCE',questionMid:'FICTITIOUS_QUESTION',at:new Date().toISOString(),originalText,bodyHash:createHash('sha256').update(originalText).digest('hex')},
    approval:{reviewed:true,source:FAQ_AUTHORITY,at:new Date().toISOString()},
    entries:entries.map(e=>({id:'duration-home',topics:['duration'],text:'La visita de este ejemplo dura entre treinta y cuarenta minutos.',appliesTo:{services:['cucarachas'],sites:['apartamento']},reviewAfter:new Date(Date.now()+86400000).toISOString(),...e})),...patch};
}
function fixture(company='fumigacion'){
  const s=new Store(':memory:',company,randomBytes(32)),c={company,...BUSINESSES[company],enabled:true,chiefOnly:true,lines:BUSINESSES[company].phones.map(phone=>({phone}))},engine=new Engine(s,c);
  let at=Date.now(),id=0;
  const process=async(text,patch={})=>{const e={id:'FAQ_EVENT_'+(++id),phone:'573001112233',line:c.phones[0],kind:'text',fromMe:false,at:++at,text,...patch};s.enqueue(e);await engine.process(e);return e;};
  const seed=()=>{const e={id:'FAQ_CONTEXT_SEED',phone:'573001112233',line:c.phones[0],kind:'text',fromMe:false,at:at++,text:'apartamento con cucarachas'};s.enqueue(e);s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(e.id);s.saveConversation(e.phone,{caseId:'fumigacion:case-test',slots:{service:'cucarachas',site:'apartamento',area:'66 m²',location:'medellin'},asked:['service','site','size','location'],introduced:true,lastHandledSourceId:e.id});};
  return {s,c,engine,process,seed};
}
test('recognizes actual common questions, distinguishes visit from safety and preserves exceptions',()=>{
  assert.deepEqual(commonQuestionTopics('¿Cuánto dura la visita?'),['duration']);
  assert.deepEqual(commonQuestionTopics('¿Qué productos aplican y cuándo puedo regresar?'),['treatment','safety']);
  assert.deepEqual(commonQuestionTopics('Es tóxico'),['safety']);
  assert.deepEqual(commonQuestionTopics('Tengo cucarachas en un apartamento'),[]);
  assert.deepEqual(commonQuestionTopics('¿Eso dura lo mismo que me dijeron antes?'),[]);
  assert.deepEqual(commonQuestionTopics('Mi perro vomita. ¿Es tóxico?'),[]);
  assert.deepEqual(commonQuestionTopics('Estoy embarazada, ¿puedo quedarme?'),[]);
  assert.deepEqual(commonQuestionTopics('¿Cuánto dura el efecto?'),[]);
  assert.deepEqual(commonQuestionTopics('¿Cuánto dura la garantía?'),['warranty']);
});
test('reference imports and staff observations cannot become executable customer answers',()=>{
  const f=fixture();try{
    f.s.importKnowledge({company:'fumigacion',kind:'reference',source:'STAFF_EXAMPLE',at:new Date().toISOString(),entries:[{text:'La visita dura veinte minutos.'}]});
    assert.deepEqual(f.s.approvedCustomerAnswers(),[]);
    assert.throws(()=>f.s.importKnowledge(document([{}],{authorizationSource:'staff said'})),/FAQ_AUTHORITY/);
    const d=document([{}]);d.source.nativeVerified=false;assert.throws(()=>f.s.importKnowledge(d),/VERIFIED_SOURCE/);
    const unreviewed=document([{}]);unreviewed.approval.reviewed=false;assert.throws(()=>f.s.importKnowledge(unreviewed),/FAQ_REVIEW/);
  }finally{f.s.close();}
});
test('applicability and exact approved wording; never extrapolate between pests, properties or cases',()=>{
  const d=document([{}]),q='¿Cuánto dura la visita?';
  assert.equal(selectCommonAnswer(q,{service:'cucarachas',site:'apartamento'},[d],'case').answer,d.entries[0].text);
  assert.equal(selectCommonAnswer(q,{service:'ratas',site:'apartamento'},[d],'case').answer,undefined);
  assert.equal(selectCommonAnswer(q,{service:'cucarachas y hormigas',site:'apartamento'},[d],'case').answer,undefined);
  assert.equal(selectCommonAnswer(q,{service:'cucarachas',site:'bodega'},[d],'case').answer,undefined);
  d.entries[0].appliesTo.caseId='only-this-case';
  assert.equal(selectCommonAnswer(q,{service:'cucarachas',site:'apartamento'},[d],'another-case').answer,undefined);
});
test('all requested topics need verified answers; partial, conflicting, expired or withdrawn answers do not send',()=>{
  const q='¿Cuánto dura y qué productos usan?',context={service:'cucarachas',site:'apartamento'};
  const partial=document([{}]);assert.equal(selectCommonAnswer(q,context,[partial],'case').answer,undefined);
  assert.equal(selectCommonAnswer('¿Cuánto dura y cuánto cuesta?',context,[partial],'case').answer,undefined);
  const complete=document([{}, {id:'treatment-home',topics:['treatment'],text:'En este ejemplo se aplica el tratamiento aprobado para ese caso.'}]);
  assert.equal(selectCommonAnswer(q,context,[complete],'case').answer,complete.entries.map(e=>e.text).join('\n\n'));
  const conflict=document([{}, {id:'another-duration',text:'Otra duración distinta del mismo ejemplo.'}]);
  assert.equal(selectCommonAnswer('¿Cuánto dura?',context,[conflict],'case').reason,'AMBIGUOUS_ANSWER');
  const expired=document([{}]);expired.entries[0].reviewAfter=new Date(Date.now()+2).toISOString();
  assert.equal(selectCommonAnswer('¿Cuánto dura?',context,[expired],'case',Date.now()+100).answer,undefined);
  const withdrawn=document([{enabled:false}]);assert.equal(selectCommonAnswer('¿Cuánto dura?',context,[withdrawn],'case').answer,undefined);
});

test('an approved response is rechecked at delivery and cannot send after its review date expires',async()=>{
  const f=fixture(),originalNow=Date.now;let sends=0;try{
    f.s.importKnowledge(document([{}]));f.seed();const e=await f.process('¿Cuánto dura la visita?');
    const transport={verifyLine:async()=>{Date.now=()=>originalNow()+2*86400000;},send:async()=>{sends++;return 'SHOULD_NOT_SEND';}};
    await drain(f.s,f.c,transport,f.engine);
    assert.equal(sends,0);
    assert.equal(f.s.db.prepare('SELECT state FROM outbox WHERE id=?').get(e.id+':reply').state,'APPROVED_ANSWER_REVIEW');
    assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='UNCERTAIN'").get().n,0);
  }finally{Date.now=originalNow;f.s.close();}
});
test('safety needs actually read product sources and a verified product match; rejects absolute safety promises',()=>{
  const f=fixture();try{
    const unsafe=document([{topics:['safety'],text:'No es tóxico. Es inofensivo.'}]);
    assert.throws(()=>f.s.importKnowledge(unsafe),/ABSOLUTE_PROMISE/);
    const missing=document([{topics:['safety'],text:'Sigue las indicaciones de seguridad de este producto.'}]);
    assert.throws(()=>f.s.importKnowledge(missing),/PRODUCT_SAFETY_SOURCE/);
    const d=document([{topics:['safety'],text:'Sigue las indicaciones de seguridad de este producto.',appliesTo:{services:['cucarachas'],sites:['apartamento'],products:['PRODUCT_TEST']},safetySources:[{product:'PRODUCT_TEST',sourceId:'LABEL_TEST',sha256:'a'.repeat(64),originalRead:true}]}]);
    f.s.importKnowledge(d);
    assert.equal(selectCommonAnswer('¿Es tóxico?',{service:'cucarachas',site:'apartamento'},[d],'case').answer,undefined);
    assert.equal(selectCommonAnswer('¿Es tóxico?',{service:'cucarachas',site:'apartamento',verifiedProducts:['OTHER_PRODUCT']},[d],'case').answer,undefined);
    assert.equal(selectCommonAnswer('¿Es tóxico?',{service:'cucarachas',site:'apartamento',verifiedProducts:['PRODUCT_TEST']},[d],'case').answer,d.entries[0].text);
  }finally{f.s.close();}
});
test('approved answers do not cross companies and unsafe or private text cannot be imported',()=>{
  const f=fixture('servicio-tecnico');try{assert.throws(()=>f.s.importKnowledge(document([{}],{company:'servicio-tecnico'})),/FAQ_AUTHORITY/);}finally{f.s.close();}
  const other=fixture();try{assert.throws(()=>other.s.importKnowledge(document([{text:'Voy a consultar a Sandra por la API token: SECRET.'}])),/FAQ_TEXT/);}finally{other.s.close();}
});
test('a verified matching answer replaces generic fallback while preserving all case data and next intake',async()=>{
  const f=fixture();try{
    f.s.importKnowledge(document([{}]));f.seed();const before=f.s.conversation('573001112233').state;
    const e=await f.process('¿Cuánto dura la visita?');
    assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(e.id+':reply').body),f.s.approvedCustomerAnswers()[0].entries[0].text);
    assert.deepEqual(f.s.conversation(e.phone).state.slots,before.slots);
    assert.deepEqual(f.s.conversation(e.phone).state.asked,before.asked);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM case_authorship').get().n,0);
  }finally{f.s.close();}
});
test('if applicable wording exists, ask the one missing context field and answer the original question after the reply',async()=>{
  const f=fixture();try{
    f.s.importKnowledge(document([{appliesTo:{services:['cucarachas'],sites:['all']}}]));
    const q=await f.process('¿Cuánto dura la visita?');
    assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(q.id+':reply').body),'¿Para qué plaga necesitas el servicio?');
    const response=await f.process('Cucarachas');
    assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM outbox WHERE id=?').get(response.id+':reply').body),f.s.approvedCustomerAnswers()[0].entries[0].text);
    assert.equal(f.s.conversation(response.phone).state.pendingFaqQuestion,null);
    assert.equal(f.s.conversation(response.phone).state.slots.service,'cucarachas');
  }finally{f.s.close();}
});
test('no verified answer: one internal question and no repeated generic public reply',async()=>{
  const f=fixture();try{
    f.seed();await f.process('¿Cuánto dura la visita?');await f.process('¿Cuánto dura la visita?');
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n,1);
  }finally{f.s.close();}
});
test('staff hold, paused runtime, previous-message reference, and symptoms retain review even with approved answers',async()=>{
  for(const mode of ['hold','paused','previous','symptoms']){
    const f=fixture();try{
      f.s.importKnowledge(document([{}]));f.seed();
      if(mode==='hold')f.s.hold('573001112233','STAFF_TEST',true);
      if(mode==='paused')f.c.enabled=false;
      const text=mode==='previous'?'¿Lo que me dijeron antes cuánto dura?':mode==='symptoms'?'Tengo mareo. ¿Cuánto dura la visita?':'¿Cuánto dura la visita?';
      await f.process(text);
      const replies=f.s.db.prepare('SELECT body FROM outbox WHERE internal=0').all().map(row=>f.s.open(row.body));
      assert.ok(!replies.includes(f.s.approvedCustomerAnswers()[0].entries[0].text));
      if(mode==='hold'||mode==='paused')assert.deepEqual(replies,[]);
    }finally{f.s.close();}
  }
});

test('authenticated FAQ import verifies native sender, exact content, antecedent and delivered own question',async()=>{
  const f=fixture(),token='x'.repeat(44),sourceAt=Math.floor(Date.now()/1000)*1000;
  f.c.enabled=false;f.c.authHash=createHash('sha256').update(token).digest('hex');
  const d=document([{}]);d.source.at=new Date(sourceAt).toISOString();
  const jid=d.source.sender+'@s.whatsapp.net';
  const answer={key:{id:d.source.id,remoteJid:jid,fromMe:false},message:{extendedTextMessage:{text:d.source.originalText,contextInfo:{stanzaId:d.source.questionMid}}},messageTimestamp:sourceAt/1000};
  const question={key:{id:d.source.questionMid,remoteJid:jid,fromMe:true},messageTimestamp:sourceAt/1000-100,status:'DELIVERY_ACK'};
  const transport={verifyLine:async()=>{},request:async(line,path,body)=>({messages:{records:[body.where.key.id===d.source.id?answer:question]}})};
  const server=createBotServer(f.c,f.s,transport,f.engine);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const post=()=>fetch('http://127.0.0.1:'+server.address().port+'/knowledge',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(d)});
  try{
    answer.key.fromMe=true;assert.notEqual((await post()).status,200);assert.equal(f.s.approvedCustomerAnswers().length,0);
    answer.key.fromMe=false;answer.message.extendedTextMessage.text='Texto diferente';assert.notEqual((await post()).status,200);
    answer.message.extendedTextMessage.text=d.source.originalText;question.status='SERVER_ACK';assert.notEqual((await post()).status,200);
    question.status='DELIVERY_ACK';delete answer.message.extendedTextMessage.contextInfo.stanzaId;assert.notEqual((await post()).status,200);
    answer.message.extendedTextMessage.contextInfo.stanzaId=d.source.questionMid;
    assert.equal((await post()).status,200);assert.equal((await post()).status,200);
    assert.equal(f.s.approvedCustomerAnswers().length,1);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM events').get().n,0);
    assert.equal(f.c.enabled,false);
  }finally{await new Promise(resolve=>server.close(resolve));f.s.close();}
});
