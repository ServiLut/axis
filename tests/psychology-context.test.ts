import assert from 'node:assert/strict';import {test} from 'node:test';
import {semanticReception} from '../lib/psychology-semantic-reception';
import {hasContinuation,readReceptionIdentity} from '../lib/psychology-reception-context';
import {pauseForStaff,resumeReception,type ReceptionEvent,type ReceptionState} from '../lib/psychology-reception';
import {chiefHelpMessage} from '../lib/psychology-chief-messages';
import {sanitizeCode} from '../scripts/build-psychology-reception.mjs';
const e:ReceptionEvent={id:'synthetic-context',phone:'573000000010',at:'2026-09-28T21:36:44Z',kind:'text',text:'Hola, como vas?. Si lo tienen',fromMe:false};
const state:ReceptionState={context:{role:'professional',professionalId:25,hasHistory:false,coverage:'recent_only',continuation:true,quotedText:'En la tarde te envío el certificado'}};
test('doctor following up a certificate never receives patient intake even when AI misclassifies greeting',()=>{
 const result=semanticReception(e,'NEW',state,{},'DEPOSIT_20000',{intent:'greeting',confidence:.98} as never);
 assert.equal(result.stage,'HUMAN');assert.match(result.messages[0],/certificado.*listo/);assert.doesNotMatch(result.messages.join(' '),/acompañamiento|terapia|precios/);
 assert.match(chiefHelpMessage(e.phone,result.handoff!),/profesional.*certificado/);
 const urgent=semanticReception({...e,text:'me quiero morir'},'NEW',state,{},'DEPOSIT_20000',null);assert.equal(urgent.handoff,'Atención humana urgente');
});
test('prior conversation and unresolved follow-up never restart sales; genuinely new greetings remain neutral',()=>{
 assert.equal(hasContinuation(e.text),true);
 for(const known of [{...state.context!,role:'unknown' as const},{...state.context!,role:'unknown' as const,continuation:false,hasHistory:true}]){
  const d=semanticReception({...e,text:'hola'},'NEW',{context:known},{},'DEPOSIT_20000',{intent:'greeting',confidence:1} as never);
  assert.ok(!d.messages.join(' ').includes('Luisa Fernanda'));assert.ok(!d.messages.join(' ').includes('acompañamiento'));
 }
 assert.match(semanticReception({...e,text:'hola'},'NEW',{}, {},'DEPOSIT_20000',null).messages[0],/Soy Luisa Fernanda.*en qué podemos ayudarte hoy/);
});
test('quote survives n8n minimization as text, without credentials or quoted media',()=>{
 const message={extendedTextMessage:{text:e.text,contextInfo:{quotedMessage:{conversation:'En la tarde te envío el certificado',imageMessage:{url:'private-media'}},participant:'other-person',secret:'private-key'}}};
 const out=new Function('$json',sanitizeCode)({body:{instance:'psicologos-en-colombia',event:'messages.upsert',sender:'573016818845@s.whatsapp.net',data:{key:{id:e.id,remoteJid:e.phone+'@s.whatsapp.net',fromMe:false},messageTimestamp:Date.parse(e.at)/1000,message}}})[0].json;
 assert.equal(out.event.quotedText,'En la tarde te envío el certificado');assert.doesNotMatch(JSON.stringify(out),/private-media|private-key|other-person/);
});
test('Evolution conversation messages keep root-level reply context and discard transport secrets',()=>{
 const data={key:{id:e.id,remoteJid:'123456789012345@lid',remoteJidAlt:e.phone+'@s.whatsapp.net',fromMe:false},messageTimestamp:Date.parse(e.at)/1000,message:{conversation:'Recuerda que...',messageContextInfo:{messageSecret:'SECRET'}},contextInfo:{stanzaId:'quoted-id',participant:'internal-id',quotedMessage:{conversation:'Pregunta verificable del bot'}}};
 const out=new Function('$json',sanitizeCode)({body:{instance:'psicologos-en-colombia',event:'messages.upsert',sender:'573016818845@s.whatsapp.net',data}})[0].json;
 assert.equal(out.event.quotedText,'Pregunta verificable del bot');assert.equal(out.event.phone,e.phone);assert.doesNotMatch(JSON.stringify(out),/SECRET|internal-id|messageSecret/);
});

test('staff hold preserves progress; manual/clinical pauses remain protected',()=>{
 const old:ReceptionState={service:'individual',intake:{draft:{firstName:'Prueba'},clientId:1}};
 const paused=pauseForStaff('PREFERENCES',old,e.at);assert.equal(paused.state.humanHold?.resumeStage,'PREFERENCES');
 assert.equal(resumeReception(paused.state).stage,'PREFERENCES');assert.deepEqual(resumeReception(paused.state).state.intake,old.intake);
 for(const kind of ['manual','review','urgent','optout'] as const){const protectedState={...old,humanHold:{kind,since:e.at}};assert.deepEqual(pauseForStaff('HUMAN',protectedState,e.at).state,protectedState);}
});
test('professional identity uses tenant and company evidence, never display name',async()=>{
 let sql='';let rows:{id:number}[]=[{id:25}];
 const tx={$queryRaw:async(strings:TemplateStringsArray)=>{sql=strings.join('?');return rows;}};
 assert.deepEqual(await readReceptionIdentity(tx as never,e.phone),{role:'professional',professionalId:25});assert.match(sql,/tenantId"=4/);assert.match(sql,/empresaId"=3/);assert.match(sql,/TECNICO/);
 rows=[{id:25},{id:26}];assert.equal((await readReceptionIdentity(tx as never,e.phone)).role,'ambiguous');
});

test('standalone social questions and thanks do not ask Sandra or reset reception progress',()=>{
 const social:ReceptionState={context:{...state.context!,continuation:false,quotedText:undefined},service:'alquiler',rental:{requests:[]},clarifications:1};
 for(const text of ['Con cómo estás ?','¿Cómo estás?','Hola, ¿cómo vas?','Bien, gracias. ¿Y tú?','Muchas gracias','Listo, gracias']){
  for(const stage of ['PROFESSIONAL','OFFER','RENTAL_DETAILS','DATA','PREFERENCES']){
   const d=semanticReception({...e,text},stage,social,{},'DEPOSIT_20000',{intent:'question',confidence:.99} as never);
   assert.equal(d.stage,stage);assert.equal(d.handoff,undefined);assert.deepEqual(d.state,social);
   assert.equal(d.messages.length,1);assert.doesNotMatch(d.messages[0],/Sandra|consultarlo|revisar|\?/);
  }
 }
 for(const context of [undefined,{role:'unknown' as const,hasHistory:true,coverage:'recent_only',continuation:false}]){
  const d=semanticReception({...e,text:'¿Cómo estás?'},'NEED',{context},{},'DEPOSIT_20000',null);
  assert.equal(d.stage,'NEED');assert.equal(d.handoff,undefined);assert.match(d.messages[0],/Gracias por preguntar/);
 }
});

test('courtesy recognition preserves human attention, urgency, quotes and administrative questions',()=>{
 const social:ReceptionState={context:{...state.context!,continuation:false,quotedText:undefined}};
 const question={intent:'question',confidence:.99} as never;
 for(const kind of ['staff','manual','review','urgent','optout'] as const){
  const held={...social,humanHold:{kind,since:e.at}};
  const d=semanticReception({...e,text:'Con cómo estás ?'},'HUMAN',held,{},'DEPOSIT_20000',question);
  assert.deepEqual(d.messages,[]);assert.equal(d.handoff,undefined);assert.deepEqual(d.state,held);
 }
 assert.equal(semanticReception({...e,text:'¿Cómo estás?',fromMe:true},'NEED',social,{},'DEPOSIT_20000',question).stage,'HUMAN');
 for(const text of ['¿Cómo estás? Me quiero morir','¿Cómo estás? ¿Ya está el certificado?','¿Cómo estás? Necesito confirmar si asistió a la sesión','¿Cómo estás? ¿Cuánto debo?']){
  assert.equal(semanticReception({...e,text},'PROFESSIONAL',social,{},'DEPOSIT_20000',question).stage,'HUMAN');
 }
 assert.equal(semanticReception({...e,text:'¿Cómo estás?'},'PROFESSIONAL',social,{},'DEPOSIT_20000',{intent:'urgent',confidence:1} as never).handoff,'Atención humana urgente');
 assert.match(semanticReception({...e,text:'¿Cómo estás?'},'PROFESSIONAL',state,{},'DEPOSIT_20000',question).handoff!,/certificado/);
 for(const text of ['¿Cómo estás?','Gracias']){
  assert.equal(semanticReception({...e,text,quotedText:'¿Confirmas la cita?'},'PROFESSIONAL',social,{},'DEPOSIT_20000',question).stage,'HUMAN');
  assert.equal(semanticReception({...e,text},'NEW',{context:{...social.context!,role:'ambiguous'}},{},'DEPOSIT_20000',question).stage,'HUMAN');
 }
 assert.equal(semanticReception({...e,text:'¿Cómo estás?',kind:'audio'},'PROFESSIONAL',social,{},'DEPOSIT_20000',question).stage,'HUMAN');
 const request=semanticReception({...e,text:'¿Cómo estás? Necesito alquilar consultorio'},'NEED',social,{oficina:{approved:true,version:'synthetic',text:'Información aprobada de alquiler'}},'DEPOSIT_20000',{intent:'service',confidence:.99,service:'alquiler'} as never);
 assert.equal(request.stage,'OFFER');assert.match(request.messages[0],/Información aprobada/);
});
