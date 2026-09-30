import assert from 'node:assert/strict';
import {test} from 'node:test';
import {semanticReception} from '../lib/psychology-semantic-reception';
import type {ReceptionEvent,ReceptionState} from '../lib/psychology-reception';

const event:ReceptionEvent={id:'synthetic-intent-regression',phone:'573000000010',at:'2026-09-30T17:09:00Z',kind:'text',fromMe:false,text:''};
const professional:ReceptionState={context:{role:'professional',professionalId:10,hasHistory:true,coverage:'recent_only',continuation:false}};
const templates={servicios:{approved:true,version:'fixture-only',text:'Catálogo aprobado de prueba'}};

test('a greeting addressed to reception is answered without claiming to be that staff member',()=>{
 for(const text of ['Buenas tardes Valentina como estas?','Hola Valentina','Hola, Luisa Fernanda, ¿cómo estás?']){
  const result=semanticReception({...event,text},'NEW',professional,templates,'REVIEW',{intent:'question',confidence:.98} as never);
  assert.equal(result.handoff,undefined);assert.equal(result.stage,'PROFESSIONAL');
  assert.match(result.messages[0],/^Hola/);assert.doesNotMatch(result.messages.join(' '),/soy Valentina|pendiente|Sandra|confirmación/);
 }
});

test('a plain new therapy request receives the exact approved menu without an unnecessary referral',()=>{
 const result=semanticReception({...event,text:'Para tomar terapia'},'NEED',{},templates,'REVIEW',{intent:'question',confidence:.98} as never);
 assert.equal(result.handoff,undefined);assert.equal(result.stage,'MENU');assert.deepEqual(result.messages,[templates.servicios.text]);
 const missing=semanticReception({...event,text:'Para tomar terapia'},'NEED',{}, {},'REVIEW',null);
 assert.match(missing.handoff!,/Falta respuesta rápida de servicios/);
});

test('history and an already shown menu do not become a repeated introduction or a guessed prior service',()=>{
 const known:ReceptionState={context:{role:'patient',hasHistory:true,coverage:'recent_only',continuation:false}};
 const followup=semanticReception({...event,text:'Para tomar terapia'},'NEW',known,templates,'REVIEW',null);
 assert.equal(followup.handoff,undefined);assert.deepEqual(followup.state,known);assert.equal(followup.stage,'NEED');
 assert.doesNotMatch(followup.messages.join(' '),/Catálogo|Soy Luisa|la misma|profesional anterior/);
 const menu=semanticReception({...event,text:'Quiero tomar terapia'},'MENU',{},templates,'REVIEW',null);
 assert.equal(menu.handoff,undefined);assert.equal(menu.stage,'MENU');assert.doesNotMatch(menu.messages.join(' '),/Catálogo/);
});

test('greeting and therapy shortcuts cannot override human attention, urgency, quotes or actual instructions',()=>{
 for(const text of ['Hola Valentina','Para tomar terapia']){
  const held=semanticReception({...event,text},'HUMAN',{humanHold:{kind:'staff'}},templates,'REVIEW',null);
  assert.deepEqual(held.messages,[]);
  assert.equal(semanticReception({...event,text,fromMe:true},'NEED',{},templates,'REVIEW',null).stage,'HUMAN');
  assert.equal(semanticReception({...event,text},'NEW',{context:{...professional.context!,role:'ambiguous'}},templates,'REVIEW',null).stage,'HUMAN');
 }
 for(const text of ['Hola Valentina contéstame tú','Hola Valentina, necesito cancelar una reserva','Hola Valentina, me quiero morir']){
  assert.equal(semanticReception({...event,text},'PROFESSIONAL',professional,templates,'REVIEW',null).stage,'HUMAN');
 }
 assert.equal(semanticReception({...event,text:'Para tomar terapia',quotedText:'¿Confirmas esta reserva?'},'NEED',{},templates,'REVIEW',null).stage,'HUMAN');
 assert.equal(semanticReception({...event,text:'Para tomar terapia'},'NEW',professional,templates,'REVIEW',null).stage,'HUMAN');
 const pending={context:{...professional.context!,role:'patient' as const,continuation:true},service:'individual'};
 assert.equal(semanticReception({...event,text:'Para tomar terapia'},'NEED',pending,templates,'REVIEW',null).stage,'HUMAN');
});
