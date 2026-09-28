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
const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10),later=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
const e:ReceptionEvent={id:'synthetic-rental-context',phone:'573001234567',at:new Date().toISOString(),kind:'text',fromMe:false,text:'Hola, reserva consultorio 10 el miércoles de 5 a 7 pm y sábado a las 10 am'};
const state:ReceptionState={context:{role:'professional',professionalId:83,hasHistory:false,continuation:false,coverage:'recent'}};
const u={intent:'preferences',confidence:.96,service:'alquiler',rentalRequests:[{requestIndex:null,date,start:'17:00',end:'19:00',roomLabel:'consultorio 10'},{requestIndex:null,date:later,start:'10:00',end:null,roomLabel:null}]} as Understanding;
function fixture(){
 const flags={role:'professional',occupied:false,professionalBusy:false,incomplete:false,alreadyProposed:false,existingBooking:false};const proposed:Record<string,unknown>[]=[];
 const rooms=[{id:1n,nombre:'Consultorio 10'},{id:10n,nombre:'Consultorio 20'},{id:9n,nombre:'Consultorio 1 (VIRTUAL)'}];
 const api=loadServerModule<typeof Rental>('lib/psychology-rental-intake.ts',{
  './psychology-booking-messages':bookingMessages,
  './psychology-room-preferences':roomPreferences,
  './psychology-reception':{normalizeText},'./psychology-reception-context':{isRentalBookingRequest,readReceptionIdentity:async()=>({role:flags.role,professionalId:83})},
  './psychology-bot-booking':{proposeBooking:async(_tx:unknown,event:ReceptionEvent,input:Record<string,unknown>,queue:Function)=>{proposed.push(input);await queue(null,event.id,e.phone,`Propuesta ${input.date} ${input.start}–${input.end}; CONFIRMAR ABCDEF123456`);return 'ABCDEF123456';}},
 });
 const tx={terapiasPsicologos:{findMany:async()=>[{id:49n,precioBase:'18900.00'}]},consultorios:{findMany:async()=>rooms},citasPsicologos:{count:async()=>flags.incomplete?1:0,findMany:async({where}:{where:{horaInicio:unknown}})=>where.horaInicio instanceof Date?(flags.existingBooking?[{id:123n,consultorioId:1n,horaFin:null}]:[]):flags.occupied?[{psicologoId:flags.professionalBusy?83:7,consultorioId:1n}]:[]},$queryRaw:async()=>flags.alreadyProposed?[{code:'ABCDEF123456'}]:[]};
 return {api,tx,flags,proposed,rooms};
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
 assert.match(d.messages.at(-1)!,/cuántas horas/);assert.doesNotMatch(d.messages.join(' '),/precios|Luisa|Qué día|anticipo|comprobante|Axis|código/);
 assert.equal(d.state.rental?.requests[1].end,null);assert.equal(d.state.rental?.requests[1].roomLabel,null);
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
test('read-only availability computes 2-hour quote, blocks overlap and invalid duration',async()=>{
 const f=fixture(),slot=mergeRentalRequests([],u.rentalRequests!,e.id)[0];
 const r=await f.api.inspectRentalSlot(f.tx as never,83,slot,f.rooms,'18900.00');assert.equal(r.kind,'checked');if(r.kind==='checked')assert.equal(r.quote.amount,37800);
 f.flags.occupied=true;f.flags.professionalBusy=true;assert.equal((await f.api.inspectRentalSlot(f.tx as never,83,slot,f.rooms,'18900.00')).kind,'professional-busy');
 assert.equal((await f.api.inspectRentalSlot(f.tx as never,83,{...slot,end:'21:00'},f.rooms,'18900.00')).kind,'invalid');
 await assert.rejects(()=>f.api.inspectRentalSlot(f.tx as never,83,{...slot,end:'18:17'},f.rooms,'18900.00'));
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
