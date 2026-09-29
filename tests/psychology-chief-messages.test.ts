import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chiefHelpMessage,chiefBookingProblem} from '../lib/psychology-chief-messages';
import {semanticReception} from '../lib/psychology-semantic-reception';
import type {ReceptionEvent,ReceptionState} from '../lib/psychology-reception';

const event:ReceptionEvent={id:'test-chief-context',phone:'573000000010',at:'2026-09-29T15:44:28Z',kind:'text',fromMe:false,text:'¿Podrías confirmarme la sesión con Prueba para desplazarme al consultorio?'};
const state:ReceptionState={context:{role:'professional',professionalId:29,hasHistory:true,coverage:'recent_only',continuation:false}};
test('professional attendance question keeps its meaning even if AI treats it as rental or greeting',()=>{
 for(const intent of ['question','greeting','preferences']){
  const result=semanticReception(event,'NEW',state,{},'DEPOSIT_20000',{intent,confidence:.96,service:'alquiler'} as never);
  assert.equal(result.stage,'HUMAN');assert.match(result.handoff!,/confirmar asistencia/);
  assert.match(result.messages[0],/antes de que te desplaces/);assert.doesNotMatch(result.messages[0],/qué consultorio|precios|confirmada[.!]$/);
  const notice=chiefHelpMessage(event.phone,result.handoff!,event);
  assert.ok(notice.includes(event.text));assert.match(notice,/No tengo esa confirmación verificada/);
  assert.match(notice,/¿La persona confirmó que asistirá a esa sesión\?/);
  assert.doesNotMatch(notice,/revisar|revisa el chat|último mensaje|qué debemos hacer/);
 }
});
test('a staff-held chat stays silent and an actual rental request is not attendance',()=>{
 assert.deepEqual(semanticReception(event,'HUMAN',state,{},'REVIEW',null).messages,[]);
 const rental=semanticReception({...event,text:'Necesito reservar el consultorio mañana de 3 a 4 pm'},'NEW',state,{},'REVIEW',null);
 assert.equal(rental.stage,'RENTAL_DETAILS');assert.equal(rental.handoff,undefined);
});
test('unknown requests include the actual question and its quoted antecedent without asserting either',()=>{
 const context={kind:'text' as const,text:'¿Y ese trámite cuánto demora?',quotedText:'Te ayudamos con el certificado'};
 const notice=chiefHelpMessage(event.phone,'Caso o solicitud requiere orientación humana',context);
 assert.match(notice,/Su mensaje: «¿Y ese trámite cuánto demora\?». Responde a: «Te ayudamos con el certificado»/);
 assert.match(notice,/No tengo una respuesta aprobada/);assert.doesNotMatch(notice,/revisar el último mensaje/);
 assert.ok(chiefHelpMessage(event.phone,'Contexto insuficiente',{kind:'text',text:'a'.repeat(8000)}).length<700);
});
test('unavailable audio and urgent context never invent transcripts or forward clinical narratives',()=>{
 assert.match(chiefHelpMessage(event.phone,'Audio pendiente',{kind:'audio',text:''}),/audio que no pude transcribir/);
 const urgent=chiefHelpMessage(event.phone,'Atención humana urgente',{kind:'text',text:'PRIVATE CLINICAL TEXT'});
 assert.doesNotMatch(urgent,/PRIVATE CLINICAL/);assert.match(urgent,/contactarle ahora/);
});
test('booking failure explains the concrete problem and original request, never raw diagnostics',()=>{
 const notice=chiefBookingProblem(event.phone,new Error('ya tiene una reserva'),{kind:'text',text:'Reserva para el martes de 2 a 3'});
 assert.match(notice,/martes de 2 a 3/);assert.match(notice,/ocupado a esa hora/);assert.match(notice,/¿Qué otra opción/);
 assert.doesNotMatch(chiefBookingProblem(event.phone,new Error('SQL secret-provider-token'),event),/SQL|secret-provider-token/);
});
