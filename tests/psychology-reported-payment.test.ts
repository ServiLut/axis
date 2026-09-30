import assert from 'node:assert/strict';
import {test} from 'node:test';
import {semanticReception} from '../lib/psychology-semantic-reception';
import {chiefHelpMessage} from '../lib/psychology-chief-messages';
import type {ReceptionEvent,ReceptionState} from '../lib/psychology-reception';

const e:ReceptionEvent={id:'synthetic-reported-proof',phone:'573000000001',at:'2026-09-30T22:00:00Z',kind:'text',text:'',fromMe:false};
test('reported proof has a specific acknowledgement and verification request even if the model misses the intent',()=>{
 for(const role of ['unknown','patient','professional'] as const){
  const state:ReceptionState={service:'alquiler',context:{role,hasHistory:true,coverage:'recent_only',continuation:false}};
  for(const text of ['Hola! Te envío comprobante del pago','Adjunto el comprobante del paquete','Buenas tardes, les comparto el soporte de transferencia']){
   const result=semanticReception({...e,text},'NEW',state,{},'REVIEW',{intent:'unknown',confidence:.98} as never);
   assert.match(result.handoff!,/^Comprobante de pago reportado/);assert.equal(result.stage,'HUMAN');
   assert.match(result.messages[0],/pago sigue pendiente de verificación/);
   assert.doesNotMatch(result.messages[0],/pago recibido|pago confirmado|Sandra|programa|ya registr|ya reserv/);
   const notice=chiefHelpMessage(e.phone,result.handoff!,{...e,text});
   assert.match(notice,/comprobar el dinero recibido y a qué cita o paquete corresponde/);
   assert.doesNotMatch(notice,/Qué debemos responder|No tengo una respuesta/);
   assert.equal(result.state.service,'alquiler');
  }
 }
});
test('negations, promises, questions and unknown files are not assertions of receipt or payment',()=>{
 for(const text of ['No te envío el comprobante del pago','¿Te envío comprobante del pago?','Te voy a enviar comprobante del pago','Mi hermana envía comprobante del pago','Comprobante','No he pagado']){
  const result=semanticReception({...e,text},'NEED',{}, {},'REVIEW',null);
  assert.notEqual(result.handoff,'Comprobante de pago reportado: verificar ingreso y asociación');
 }
 const file=semanticReception({...e,kind:'attachment',text:''},'NEED',{}, {},'REVIEW',null);
 assert.doesNotMatch(file.messages.join(' '),/pago/);
});
test('reported proof preserves human ownership, ambiguity and urgent handling',()=>{
 const proof={...e,text:'Hola! Te envío comprobante del pago'};
 for(const kind of ['staff','manual','review','urgent','optout'] as const){
  const held=semanticReception(proof,'HUMAN',{humanHold:{kind}}, {},'REVIEW',null);
  assert.deepEqual(held.messages,[]);assert.equal(held.handoff,undefined);
 }
 assert.match(semanticReception(proof,'NEW',{context:{role:'ambiguous',hasHistory:true,coverage:'recent_only',continuation:false}}, {},'REVIEW',null).handoff!,/Identidad ambigua/);
 assert.equal(semanticReception(proof,'NEW',{}, {},'REVIEW',{intent:'urgent',confidence:1} as never).handoff,'Atención humana urgente');
 assert.notEqual(semanticReception({...proof,quotedText:'Mensaje desconocido'},'NEW',{}, {},'REVIEW',null).handoff,'Comprobante de pago reportado: verificar ingreso y asociación');
});
