import assert from 'node:assert/strict';import {test} from 'node:test';
import {loadServerModule} from './load-server-module';
import type * as Rental from '../lib/psychology-rental-intake';
import {matchRentalRoom,mergeRentalRequests} from '../lib/psychology-rental-intake';
import {semanticReception} from '../lib/psychology-semantic-reception';
import {normalizeText,type ReceptionState,type ReceptionEvent} from '../lib/psychology-reception';
import {isRentalBookingRequest} from '../lib/psychology-reception-context';
import {parseUnderstanding,type Understanding} from '../lib/psychology-ai';
import * as bookingMessages from '../lib/psychology-booking-messages';
import * as roomPreferences from '../lib/psychology-room-preferences';
import {chiefHelpMessage} from '../lib/psychology-chief-messages';
const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10),later=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
const e:ReceptionEvent={id:'synthetic-rental-context',phone:'573001234567',at:new Date().toISOString(),kind:'text',fromMe:false,text:'Hola, reserva consultorio 10 el miércoles de 5 a 7 pm y sábado a las 10 am'};
const state:ReceptionState={context:{role:'professional',professionalId:83,hasHistory:false,continuation:false,coverage:'recent'}};
const u={intent:'preferences',confidence:.96,service:'alquiler',rentalRequests:[{requestIndex:null,date,start:'17:00',end:'19:00',roomLabel:'consultorio 10'},{requestIndex:null,date:later,start:'10:00',end:null,roomLabel:null}]} as Understanding;
function fixture(){
 const flags={role:'professional',occupied:false,professionalBusy:false,incomplete:false,alreadyProposed:false,existingBooking:false};const proposed:Record<string,unknown>[]=[];
 const rooms=[{id:1n,nombre:'Consultorio 10'},{id:10n,nombre:'Consultorio 20'},{id:9n,nombre:'Consultorio 1 (VIRTUAL)'}];
 const existingRecord={id:123n,consultorioId:1n,horaFin:new Date(date+'T19:00:00-05:00') as Date|null,PaqueteAdquirido:{tenantId:4,TerapiasPsicologos:{tenantId:4,empresaId:3,nombre:'Alquiler de Consultorio'}}};
 const api=loadServerModule<typeof Rental>('lib/psychology-rental-intake.ts',{
  './psychology-booking-messages':bookingMessages,
  './psychology-room-preferences':roomPreferences,
  './psychology-reception':{normalizeText},'./psychology-reception-context':{isRentalBookingRequest,readReceptionIdentity:async()=>({role:flags.role,professionalId:83})},
  './psychology-bot-booking':{proposeBooking:async(_tx:unknown,event:ReceptionEvent,input:Record<string,unknown>,queue:Function)=>{proposed.push(input);await queue(null,event.id,e.phone,`Propuesta ${input.date} ${input.start}–${input.end}; CONFIRMAR ABCDEF123456`);return 'ABCDEF123456';}},
 });
 const tx={terapiasPsicologos:{findMany:async()=>[{id:49n,precioBase:'18900.00'}]},consultorios:{findMany:async()=>rooms},citasPsicologos:{count:async()=>flags.incomplete?1:0,findMany:async({where}:{where:{horaInicio:unknown}})=>where.horaInicio instanceof Date?(flags.existingBooking?[existingRecord]:[]):flags.occupied?[{psicologoId:flags.professionalBusy?83:7,consultorioId:1n}]:[]},$queryRaw:async()=>flags.alreadyProposed?[{code:'ABCDEF123456'}]:[]};
 return {api,tx,flags,proposed,rooms,existingRecord};
}
test('specific rental request outranks service sales even with missing AI dates or greeting intent',()=>{
 for(const intent of ['preferences','service','greeting'] as const){
  const d=semanticReception(e,'NEW',state,{oficina:{text:'TARIFA GENERICA',version:'1',approved:true}},'DEPOSIT_20000',{...u,intent,rentalRequests:[]});
  assert.equal(d.stage,'RENTAL_DETAILS');assert.doesNotMatch(d.messages.join(' '),/TARIFA GENERICA|Luisa|precios|continuar con el agendamiento/);
 }
 assert.equal(semanticReception({...e,text:'me quiero morir'},'NEW',state,{},'DEPOSIT_20000',u).handoff,'Atención humana urgente');
 assert.equal(semanticReception(e,'HUMAN',state,{},'DEPOSIT_20000',u).messages.length,0);
});
test('visible room number is resolved against name rather than internal ID',()=>{
 assert.equal(matchRentalRoom([{id:1n,nombre:'Consultorio 10'},{id:10n,nombre:'Consultorio 20'}],'10')?.id,1n);
 assert.equal(matchRentalRoom([{id:9n,nombre:'Consultorio 1 (VIRTUAL)'}],'1'),null);
});
test('two requested dates survive; only missing Saturday duration and room are asked',async()=>{
 const f=fixture();const d=await f.api.handleRentalIntake(f.tx as never,e,'NEW',state,u);
 assert.equal(d?.stage,'RENTAL_DETAILS');assert.equal(d.state.rental?.requests.length,2);assert.equal(f.proposed.length,1);
 assert.equal(f.proposed[0].room,'1');assert.equal(f.proposed[0].start,'17:00');assert.equal(f.proposed[0].end,'19:00');
 assert.match(d.messages.at(-1)!,/hasta qué hora/);assert.doesNotMatch(d.messages.join(' '),/precios|Luisa|Qué día|anticipo|comprobante|Axis|código/);
 assert.equal(d.state.rental?.requests[1].end,null);assert.equal(d.state.rental?.requests[1].roomLabel,null);
});

test('Friday 4 pm request asks only for missing duration; complete interval consults availability and quotes before choice',async()=>{
 const f=fixture();const incoming={...e,text:'Para separar porfa un espacio para el viernes a las 4 pm'};
 const first=await f.api.handleRentalIntake(f.tx as never,incoming,'PROFESSIONAL',state,{...u,rentalRequests:[{requestIndex:null,date,start:'16:00',end:null,roomLabel:null}]});
 assert.equal(first!.handoff,undefined);assert.match(first!.messages[0],/hasta qué hora/);assert.equal(f.proposed.length,0);
 const next=await f.api.handleRentalIntake(f.tx as never,{...incoming,id:'duration',text:'Dos horas'},'RENTAL_DETAILS',first!.state,{...u,rentalRequests:[{requestIndex:0,date:null,start:null,end:'18:00',roomLabel:null}]});
 assert.equal(next!.handoff,undefined);assert.match(next!.messages.join(' '),/37[.,]800/);assert.match(next!.messages.join(' '),/consultorio 10.*consultorio 20/i);assert.equal(f.proposed.length,0);
 assert.doesNotMatch(next!.messages.join(' '),/Ya tienes|quedó|confirmada/);
});
test('occupancy, incomplete agenda and unknown identity never create a proposal or promise a reservation',async()=>{
 for(const kind of ['occupied','incomplete','unknown','duplicate'] as const){const f=fixture();
  if(kind==='unknown')f.flags.role='unknown';else if(kind==='duplicate')f.flags.alreadyProposed=true;else f.flags[kind]=true;
  const d=await f.api.handleRentalIntake(f.tx as never,e,'NEW',state,u);assert.equal(f.proposed.length,0);
  if(kind==='occupied')assert.match(d!.messages.join(' '),/consultorio 10 está ocupado.*consultorio 20/);
  else assert.equal(d?.stage,'HUMAN');
 }
});
test('slot updates preserve other dates and never silently change an already proposed slot',()=>{
 const old=mergeRentalRequests([],u.rentalRequests!,e.id);old[0].proposalCode='ABCDEF123456';
 const next=mergeRentalRequests(old,[{requestIndex:1,date:null,start:null,end:'11:00',roomLabel:'Consultorio 10'}],'second');
 assert.deepEqual(next[0],old[0]);assert.equal(next[1].end,'11:00');assert.equal(old[1].end,null);
 assert.throws(()=>mergeRentalRequests(old,[{requestIndex:0,date:null,start:'18:00',end:null,roomLabel:null}],'changed'),/PROPOSAL_CHANGED/);
 assert.throws(()=>mergeRentalRequests(old,[{requestIndex:3,date:null,start:null,end:'11:00',roomLabel:null}],'ambiguous'),/AMBIGUOUS/);
});
test('existing appointment is checked before asking duration or proposing a second booking',async()=>{
 const f=fixture();f.flags.existingBooking=true;
 const d=await f.api.handleRentalIntake(f.tx as never,{...e,text:'No estoy segura si tengo reserva mañana en consultorio 10'},'NEW',state,{...u,rentalRequests:[{requestIndex:null,date,start:'18:00',end:null,roomLabel:'10'}]});
 assert.equal(f.proposed.length,0);assert.match(d!.messages.join(' '),/Ya tienes tu reserva/);assert.doesNotMatch(d!.messages.join(' '),/hasta qué hora|anticipo|precios|Axis|No crearé/);
 assert.equal(d!.state.rental!.requests[0].existingCitaId,'123');
});

test('a different room or duration in an existing rental requires clarification instead of claiming success',async()=>{
 for(const change of ['room','duration'] as const){
  const f=fixture();f.flags.existingBooking=true;
  if(change==='room')f.existingRecord.consultorioId=10n;
  else f.existingRecord.horaFin=new Date(date+'T18:00:00-05:00');
  const d=await f.api.handleRentalIntake(f.tx as never,e,'NEW',state,{...u,rentalRequests:[u.rentalRequests![0]]});
  assert.equal(d!.stage,'HUMAN');assert.equal(f.proposed.length,0);assert.equal(d!.state.rental?.requests[0]?.existingCitaId,undefined);
  assert.doesNotMatch(d!.messages.join(' '),/Ya tienes|quedó|confirmada/);
  assert.match(d!.handoff!,/^Diferencia en reserva existente:/);
  const chief=chiefHelpMessage(e.phone,d!.handoff!);assert.match(chief,/Pidió.*Ya tiene.*Conservamos/s);
  assert.doesNotMatch(chief,/Axis|CITA-|CONFIRMAR|Diferencia en reserva existente/);
 }
});

test('patient appointments, unverified service scope and incomplete reservations cannot be called room rentals',async()=>{
 for(const change of ['therapy','company','catalogTenant','packageTenant','room','end'] as const){
  const f=fixture();f.flags.existingBooking=true;const catalog=f.existingRecord.PaqueteAdquirido.TerapiasPsicologos;
  if(change==='therapy')catalog.nombre='Individual';
  if(change==='company')catalog.empresaId=9;
  if(change==='catalogTenant')catalog.tenantId=9;
  if(change==='packageTenant')f.existingRecord.PaqueteAdquirido.tenantId=9;
  if(change==='room')f.existingRecord.consultorioId=999n;
  if(change==='end')f.existingRecord.horaFin=null;
  const d=await f.api.handleRentalIntake(f.tx as never,e,'NEW',state,{...u,rentalRequests:[u.rentalRequests![0]]});
  assert.equal(d!.stage,'HUMAN');assert.equal(f.proposed.length,0);assert.doesNotMatch(d!.messages.join(' '),/Ya tienes|quedó/);
 }
});

test('a 55-minute request is not silently rounded to an existing one-hour booking',async()=>{
 const f=fixture();f.flags.existingBooking=true;
 const d=await f.api.handleRentalIntake(f.tx as never,e,'NEW',state,{...u,rentalRequests:[{requestIndex:null,date,start:'18:00',end:'18:55',roomLabel:'10'}]});
 assert.equal(d!.stage,'HUMAN');assert.equal(f.proposed.length,0);
 assert.match(d!.handoff!,/Diferencia en reserva existente/);
});
test('read-only availability computes 2-hour quote, blocks overlap and invalid duration',async()=>{
 const f=fixture(),slot=mergeRentalRequests([],u.rentalRequests!,e.id)[0];
 const r=await f.api.inspectRentalSlot(f.tx as never,83,slot,f.rooms,'18900.00');assert.equal(r.kind,'checked');if(r.kind==='checked')assert.equal(r.quote?.amount,37800);
 f.flags.occupied=true;f.flags.professionalBusy=true;assert.equal((await f.api.inspectRentalSlot(f.tx as never,83,slot,f.rooms,'18900.00')).kind,'professional-busy');
 assert.equal((await f.api.inspectRentalSlot(f.tx as never,83,{...slot,end:'21:00'},f.rooms,'18900.00')).kind,'invalid');
 f.flags.occupied=false;f.flags.professionalBusy=false;
 const fractional=await f.api.inspectRentalSlot(f.tx as never,83,{...slot,end:'18:17'},f.rooms,'18900.00');
 assert.equal(fractional.kind,'checked');if(fractional.kind==='checked')assert.equal(fractional.quote,null);
 assert.equal(f.proposed.length,0);
});
test('rental structured extraction rejects invalid slots and accepts previous event format',()=>{
 const base={intent:'preferences',confidence:.96,service:'alquiler',additionalServices:[],explicitConsent:false};
 const keys=['serviceId','purchase','firstName','lastName','documentType','document','email','address','professionalPreference','professionalId','roomId','date','start','end','modality','question','reply','adminAction','targetPhone','instruction'];
 const valid={...Object.fromEntries(keys.map(k=>[k,null])),...base};assert.deepEqual(parseUnderstanding(valid).rentalRequests,[]);
 assert.throws(()=>parseUnderstanding({...valid,rentalRequests:[{requestIndex:0,date,start:'25:00',end:null,roomLabel:'10'}]}),/RENTAL_INVALID/);
});
test('remembered preferences are scoped, offered only when free, and never silently assigned',async()=>{
 const f=fixture();const first=await f.api.handleRentalIntake(f.tx as never,{...e,text:'Prefiero el consultorio 10'},'NEW',state,{...u,rentalRequests:[],roomPreferenceChanges:[{roomLabel:'10',preference:'prefer',quote:'Prefiero el consultorio 10'}]});
 assert.equal(first!.state.roomPreferences!.professionalId,83);assert.equal(first!.state.roomPreferences!.entries[0].sourceEvent,e.id);assert.equal(f.proposed.length,0);
 const next=await f.api.handleRentalIntake(f.tx as never,e,'RENTAL_DETAILS',first!.state,{...u,rentalRequests:[{requestIndex:null,date,start:'17:00',end:'19:00',roomLabel:null}]});
 assert.match(next!.messages.join(' '),/consultorio 10.*que prefieres.*Cuál/);assert.equal(f.proposed.length,0);
});
test('an ambiguous confirmation asks which offered booking, without restarting the other missing details',async()=>{
 const f=fixture();const requests=mergeRentalRequests([],u.rentalRequests!,e.id);requests[0].proposalCode='ABCDEF123456';
 const d=await f.api.handleRentalIntake(f.tx as never,{...e,text:'Confirmar'},'RENTAL_DETAILS',{...state,rental:{requests}},{...u,intent:'confirm',rentalRequests:[]});
 assert.equal(d!.messages.length,1);assert.match(d!.messages[0],/Te reservo/);assert.doesNotMatch(d!.messages[0],/cuántas horas|CONFIRMAR|ABCDEF/);assert.equal(f.proposed.length,0);
});

test('literal same-day alternatives complete the pending slot without a second missing start',()=>{
 const first=mergeRentalRequests([],[{requestIndex:null,date,start:null,end:null,roomLabel:null}],'initial');
 const second=mergeRentalRequests(first,[
  {requestIndex:null,date,start:'09:00',end:null,roomLabel:'consultorio 7'},
  {requestIndex:null,date,start:'09:00',end:null,roomLabel:'consultorio 10'},
 ],'followup','Podría ser para el sábado a las 9 de la mañana, en el consultorio 7 o el 10.');
 assert.equal(second.length,1);assert.equal(second[0].start,'09:00');assert.equal(second[0].end,null);assert.equal(second[0].roomLabel,null);
 assert.deepEqual(second[0].roomAlternatives,['consultorio 7','consultorio 10']);assert.equal(second[0].sourceEvent,'initial');assert.equal(second[0].lastUpdatedFrom,'followup');
 assert.equal(first[0].start,null);
});

test('without literal alternatives, distinct dates, times and rooms are not consolidated',()=>{
 const first=mergeRentalRequests([],[{requestIndex:null,date,start:'09:00',end:null,roomLabel:'consultorio 7'}],'initial');
 for(const patch of [
  {date:later,start:'09:00',end:null,roomLabel:'consultorio 7'},
  {date,start:'10:00',end:null,roomLabel:'consultorio 7'},
  {date,start:'09:00',end:null,roomLabel:'consultorio 10'},
 ]){
  const next=mergeRentalRequests(first,[{requestIndex:null,...patch}],'separate','Necesito dos consultorios, el 7 y el 10.');
  assert.equal(next.length,2);assert.equal(next[0].start,'09:00');assert.equal(next[0].roomLabel,'consultorio 7');
 }
});

test('a provided hour completes one unfinished same-day request and asks only the end',async()=>{
 const f=fixture();const incoming={...e,text:'Podría ser para el sábado a las 9 de la mañana'};
 const old=mergeRentalRequests([],[{requestIndex:null,date,start:null,end:null,roomLabel:null}],'initial');
 const d=await f.api.handleRentalIntake(f.tx as never,incoming,'RENTAL_DETAILS',{...state,rental:{requests:old}},
  {...u,rentalRequests:[{requestIndex:null,date,start:'09:00',end:null,roomLabel:null}]});
 assert.equal(d!.stage,'RENTAL_DETAILS');assert.equal(d!.state.rental!.requests.length,1);assert.equal(d!.state.rental!.requests[0].start,'09:00');
 assert.match(d!.messages.join(' '),/hasta qué hora/);assert.doesNotMatch(d!.messages.join(' '),/A qué hora te gustaría/);assert.equal(f.proposed.length,0);
});

test('meeting capacity is reviewed before any quote or proposal and preserves supplied requirements',async()=>{
 const f=fixture();const incoming={...e,text:'Necesito el sábado uno de los espacios para una reunión con ocho personas. ¿Sí se podría?'};
 const d=await f.api.handleRentalIntake(f.tx as never,incoming,'PROFESSIONAL',state,
  {...u,rentalRequests:[{requestIndex:null,date,start:null,end:null,roomLabel:null}]});
 assert.equal(d!.stage,'HUMAN');assert.equal(d!.state.rental!.requests[0].date,date);
 assert.deepEqual({...d!.state.rental!.requirements},{people:8,chairs:false,sourceEvent:e.id});
 assert.match(d!.handoff!,/Reunión de 8 personas.*capacidad.*no están verificadas.*Podemos ofrecer/s);
 assert.doesNotMatch(d!.messages.join(' '),/A qué hora|Sandra|equipo|Axis|confirmada|reservada/);assert.equal(f.proposed.length,0);
});

test('chair inquiry with the observed alternative extraction keeps 09:00 and remains human review',async()=>{
 const f=fixture();const old=mergeRentalRequests([],[{requestIndex:null,date,start:null,end:null,roomLabel:null}],'initial');
 const incoming={...e,text:'Podría ser para el sábado a las 9 de la mañana, normalmente la hemos hecho ahí en el consultorio 7 o el 10. Quería saber si había suficientes sillas para la reunión.'};
 const d=await f.api.handleRentalIntake(f.tx as never,incoming,'RENTAL_DETAILS',{...state,rental:{requests:old}},
  {...u,rentalRequests:[{requestIndex:null,date,start:'09:00',end:null,roomLabel:'consultorio 7'},{requestIndex:null,date,start:'09:00',end:null,roomLabel:'consultorio 10'}]});
 assert.equal(d!.stage,'HUMAN');assert.equal(d!.state.rental!.requests.length,1);assert.equal(d!.state.rental!.requests[0].start,'09:00');
 assert.deepEqual(d!.state.rental!.requests[0].roomAlternatives,['consultorio 7','consultorio 10']);assert.equal(d!.state.rental!.requirements!.chairs,true);
 assert.match(d!.handoff!,/9.*consultorio 7 o consultorio 10.*sillas/s);assert.doesNotMatch(d!.messages.join(' '),/A qué hora|confirmada|reservada/);assert.equal(f.proposed.length,0);
});

test('multiple compatible unfinished requests are reviewed without guessing which to update',async()=>{
 const f=fixture();const old=[
  {date,start:null,end:null,roomLabel:'consultorio 7',sourceEvent:'one'},
  {date,start:null,end:null,roomLabel:'consultorio 10',sourceEvent:'two'},
 ];
 const d=await f.api.handleRentalIntake(f.tx as never,{...e,text:'El sábado a las 9'},'RENTAL_DETAILS',{...state,rental:{requests:old}},
  {...u,rentalRequests:[{requestIndex:null,date,start:'09:00',end:null,roomLabel:null}]});
 assert.equal(d!.stage,'HUMAN');assert.equal(f.proposed.length,0);assert.deepEqual(d!.state.rental!.requests,old);
});

test('same-day filling never mutates an already proposed slot and human hold stays silent',async()=>{
 const old=mergeRentalRequests([],[{requestIndex:null,date,start:null,end:null,roomLabel:null}],'initial');old[0].proposalCode='EXISTING';
 const next=mergeRentalRequests(old,[{requestIndex:null,date,start:'09:00',end:null,roomLabel:null}],'new');
 assert.equal(next.length,2);assert.equal(next[0].start,null);assert.equal(next[0].proposalCode,'EXISTING');
 const f=fixture();const d=await f.api.handleRentalIntake(f.tx as never,{...e,text:'El sábado a las 9 para ocho personas'},'HUMAN',{...state,rental:{requests:old}},u);
 assert.equal(d,null);assert.equal(f.proposed.length,0);assert.equal(old[0].start,null);
});

test('a room preference alone cannot erase unresolved meeting capacity or bypass its review',async()=>{
 const f=fixture();const requests=mergeRentalRequests([],[{requestIndex:null,date,start:'09:00',end:null,roomLabel:null}],'initial');
 const requirements={people:8,chairs:true,sourceEvent:'capacity'};
 const d=await f.api.handleRentalIntake(f.tx as never,{...e,text:'Prefiero el consultorio 10'},'RENTAL_DETAILS',{...state,rental:{requests,requirements}},
  {...u,rentalRequests:[],roomPreferenceChanges:[{roomLabel:'10',preference:'prefer',quote:'Prefiero el consultorio 10'}]});
 assert.equal(d!.stage,'HUMAN');assert.deepEqual({...d!.state.rental!.requirements},requirements);assert.match(d!.handoff!,/8 personas.*sillas/s);assert.equal(f.proposed.length,0);
});

test('literal one-hour follow-up completes the stored start when the model omits the end',async()=>{
 const f=fixture(),requests=mergeRentalRequests([],[{requestIndex:null,date,start:'18:00',end:null,roomLabel:null}],'start');
 const d=await f.api.handleRentalIntake(f.tx as never,{...e,id:'duration-literal',text:'Una hora'},'RENTAL_DETAILS',{...state,rental:{requests}},
  {...u,intent:'question',rentalRequests:[{requestIndex:0,date,start:'18:00',end:null,roomLabel:null}]});
 assert.equal(d!.state.rental!.requests[0].end,'19:00');
 assert.match(d!.messages.join(' '),/18[.,]900.*consultorio 10/s);assert.doesNotMatch(d!.messages.join(' '),/hasta qué hora/);
 assert.equal(requests[0].end,null);assert.equal(f.proposed.length,0);
});

test('an unchanged PM clarification does not repeat the checked price and room choice',async()=>{
 const f=fixture(),request={requestIndex:null,date,start:'18:00',end:'19:00',roomLabel:null};
 const first=await f.api.handleRentalIntake(f.tx as never,{...e,id:'range',text:'6:00 a 7:00'},'PROFESSIONAL',state,{...u,rentalRequests:[request]});
 assert.equal(first!.messages.length,2);
 const next=await f.api.handleRentalIntake(f.tx as never,{...e,id:'meridiem',text:'PM'},'RENTAL_DETAILS',first!.state,{...u,rentalRequests:[request]});
 assert.equal(next!.state.rental!.requests.length,1);assert.equal(next!.messages.length,0);assert.equal(f.proposed.length,0);
});

test('a changed availability result is shown even after an identical PM clarification',async()=>{
 const f=fixture(),request={requestIndex:null,date,start:'18:00',end:'19:00',roomLabel:null};
 const first=await f.api.handleRentalIntake(f.tx as never,{...e,text:'6:00 a 7:00'},'PROFESSIONAL',state,{...u,rentalRequests:[request]});
 f.flags.occupied=true;
 const next=await f.api.handleRentalIntake(f.tx as never,{...e,id:'meridiem',text:'PM'},'RENTAL_DETAILS',first!.state,{...u,rentalRequests:[request]});
 assert.equal(next!.messages.length,2);assert.match(next!.messages[1],/consultorio 20/);assert.doesNotMatch(next!.messages[1],/consultorio 10/);
});

test('literal duration must match extracted end and a unique pending slot',async()=>{
 for(const variant of ['contradiction','multiple'] as const){
  const f=fixture(),requests=mergeRentalRequests([],[{requestIndex:null,date,start:'18:00',end:null,roomLabel:null}],'start');
  if(variant==='multiple')requests.push({date:later,start:'10:00',end:null,roomLabel:null,sourceEvent:'other'});
  const d=await f.api.handleRentalIntake(f.tx as never,{...e,text:'Una hora'},'RENTAL_DETAILS',{...state,rental:{requests}},
   {...u,rentalRequests:variant==='contradiction'?[{requestIndex:0,date,start:'18:00',end:'20:00',roomLabel:null}]:[]});
  assert.equal(d!.stage,'HUMAN');assert.equal(f.proposed.length,0);assert.equal(requests[0].end,null);
 }
});

test('literal minutes preserve extra-time review and do not wrap after midnight',async()=>{
 const f=fixture(),requests=mergeRentalRequests([],[{requestIndex:null,date,start:'18:00',end:null,roomLabel:'10'}],'start');
 const d=await f.api.handleRentalIntake(f.tx as never,{...e,text:'55 minutos'},'RENTAL_DETAILS',{...state,rental:{requests}},{...u,rentalRequests:[]});
 assert.equal(d!.stage,'HUMAN');assert.equal(d!.state.rental!.requests[0].end,'18:55');assert.match(d!.handoff!,/minutos adicionales/);assert.equal(f.proposed.length,0);
 const late=await f.api.handleRentalIntake(f.tx as never,{...e,text:'8 horas'},'RENTAL_DETAILS',{...state,rental:{requests}},{...u,rentalRequests:[]});
 assert.equal(late!.stage,'HUMAN');assert.equal(f.proposed.length,0);
});

test('tentative duration is not literal authority and staff or HUMAN stays silent',async()=>{
 const f=fixture(),requests=mergeRentalRequests([],[{requestIndex:null,date,start:'18:00',end:null,roomLabel:null}],'start');
 const old={...state,rental:{requests}};
 const d=await f.api.handleRentalIntake(f.tx as never,{...e,text:'Quizás una hora'},'RENTAL_DETAILS',old,{...u,rentalRequests:[]});
 assert.equal(d!.state.rental!.requests[0].end,null);assert.match(d!.messages.join(' '),/hasta qué hora/);
 for(const event of [{...e,text:'Una hora',fromMe:true},{...e,text:'Una hora'}]){
  assert.equal(await f.api.handleRentalIntake(f.tx as never,event,event.fromMe?'RENTAL_DETAILS':'HUMAN',old,{...u,rentalRequests:[]}),null);
 }
 assert.equal(requests[0].end,null);assert.equal(f.proposed.length,0);
});
