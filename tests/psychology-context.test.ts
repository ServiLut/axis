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
 assert.equal(result.stage,'HUMAN');assert.match(result.messages[0],/certificado pendiente/);assert.doesNotMatch(result.messages.join(' '),/acompañamiento|terapia|precios/);
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
