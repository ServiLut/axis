import assert from 'node:assert/strict';import {test} from 'node:test';
import {bookingPrompts,bookedMessage,naturalBookingConfirmation,confirmationQuestion,type BookingMessageDetails} from '../lib/psychology-booking-messages';
import type {ReceptionEvent} from '../lib/psychology-reception';import type {Understanding} from '../lib/psychology-ai';
const d:BookingMessageDetails={date:'2026-09-30',start:'17:00',end:'19:00',roomId:'1',roomName:'Consultorio 10',rental:true,amount:'37800',serviceName:'Alquiler de Consultorio',sessionCount:1,serviceId:'49',professionalId:83};
const prompts=bookingPrompts(d,'573001234567');const p={code:'ABCDEF123456',details:{...d,customerPrompt:prompts.customer,professionalPrompt:prompts.professional}};
const e:ReceptionEvent={id:'synthetic-natural-confirm',phone:'573001234567',at:'2026-09-28T22:00:00Z',kind:'text',fromMe:false,text:'sí, resérvame el miércoles'};
const u={intent:'confirm',confidence:.97,date:null,start:null,end:null,roomId:null,serviceId:null,professionalId:null} as Understanding;
test('booking messages expose useful times and prices, never internal codes or database operations',()=>{
 assert.match(prompts.customer,/miércoles,? 30 de septiembre.*5 p\. m\..*7 p\. m\..*37\.800.*Te lo reservo/);
 for(const text of [prompts.customer,prompts.professional,bookedMessage(d),confirmationQuestion(d)])assert.doesNotMatch(text,/Axis|SQL|CONFIRMAR|CITA-|2026-09-30|17:00|propuesta|verificar|[A-F0-9]{12}/);
 assert.match(bookedMessage(d),/Tu reserva quedó/);assert.match(bookingPrompts({...d,rental:false},'34600123456').customer,/hora de Colombia/);
});
test('natural yes confirms only the latest actual booking question, explicit day identifies the offered slot',()=>{
 assert.equal(naturalBookingConfirmation({...e,text:'sí'},u,[p],prompts.customer),p.code);
 assert.equal(naturalBookingConfirmation({...e,text:'sí'},u,[p],'¿Cuántas horas necesitas el sábado?'),null);
 assert.equal(naturalBookingConfirmation(e,u,[p],'¿Cuántas horas necesitas el sábado?'),p.code);
 assert.equal(naturalBookingConfirmation({...e,text:'sí'},u,[p],confirmationQuestion(d)),p.code);
 assert.equal(naturalBookingConfirmation({...e,text:'confirmo el 30/9'},u,[p],''),p.code);
});
test('multiple days, changed time or room, contradictory date, rejection and outgoing messages do not confirm',()=>{
 const second={code:'ABCDEF654321',details:{...d,date:'2026-10-03',start:'10:00',end:'11:00'}};
 for(const text of ['sí el miércoles y el sábado','sí el miércoles 1/10','sí, pero a otra hora','no confirmo','quizás','confirmo el 30/9 y el 3/10'])assert.equal(naturalBookingConfirmation({...e,text},u,[p,second],''),null,text);
 assert.equal(naturalBookingConfirmation(e,{...u,start:'18:00'},[p],''),null);
 assert.equal(naturalBookingConfirmation({...e,text:'sí, el miércoles consultorio 11'},{...u,roomId:'11'},[p],''),null);
 assert.equal(naturalBookingConfirmation({...e,fromMe:true},u,[p],''),null);
 assert.equal(naturalBookingConfirmation({...e,text:'sí'},u,[p,second],prompts.customer),null);
});
test('previous code-based offers remain compatible without asking the person to repeat a code',()=>{
 const legacy={code:p.code,details:{...d}};
 assert.equal(naturalBookingConfirmation(e,u,[legacy],'¿Hasta qué hora el sábado?'),legacy.code);
 assert.equal(naturalBookingConfirmation({...e,text:'sí'},u,[legacy],'Responde CONFIRMAR '+p.code),legacy.code);
});
