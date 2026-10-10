import test from 'node:test';
import assert from 'node:assert/strict';
import {planPreventiveRetention,preparePreventiveRetentionDeliveryNote,preventiveRetentionText,PREVENTIVE_RETENTION_AUTHORIZATION,PREVENTIVE_RETENTION_NOTE} from '../automation/service-bots/preventive-retention.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
const DAY='2026-10-10',NOW=Date.parse(DAY+'T17:00:00Z'),A='573126944997',B='573126938721',P='573000001111',P2='573000002222';
const ago=(days,hour=17)=>new Date(NOW-days*86400000).toISOString().slice(0,10)+'T'+String(hour).padStart(2,'0')+':00:00Z';
const coverage=()=>({whatsapp:{contactHistoryComplete:true,lines:[{line:A,complete:true,suspended:false,connected:true},{line:B,complete:true,suspended:false,connected:true}]},program:{company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true}});
const completed=(age=70,extra={})=>({company:'FUMIGACION',phone:P,orderId:'ORDER_1',sourceId:'FINISH_1',completedAt:ago(age),completedVerified:true,originLine:A,originLineVerified:true,...extra});
const booking=(age=70,extra={})=>({phone:P,line:A,sourceId:'BOOKING_1',at:ago(age),nativeBindingVerified:true,fromMe:false,forwarded:false,kind:'booking-request',...extra});
const contact=(extra={})=>({phone:P,identity:{kind:'PN',phone:P,bindingVerified:true},name:{value:'Camila',phone:P,verified:true,sourceId:'NATIVE_NAME'},contactHistoryComplete:true,futureBookingsComplete:true,noContactStatusComplete:true,optOutGlobal:false,doNotContact:false,humanHold:false,activeCase:false,pendingVisit:false,pendingQuotation:false,completedServices:[completed()],bookingInteractions:[],futureBookings:[],rejections:[],...extra});
const plan=(contacts=[contact()],extra={})=>planPreventiveRetention({company:'fumigacion',day:DAY,now:NOW,coverage:coverage(),contacts,...extra});
const first=(extra={})=>plan([contact()],extra).prepared[0];
const proof=(p,extra={})=>({phone:p.phone,line:p.line,mid:'3EB0_NATIVE_DELIVERY',text:p.text,state:'DELIVERED',nativeVerified:true,fromMe:true,forwarded:false,deliveredAt:NOW+1000,...extra});
const note=(p,extra={})=>preparePreventiveRetentionDeliveryNote(p,proof(p,extra),{now:NOW+2000});

test('60 and 90 Bogota calendar days are inclusive; 59 and 91 are excluded regardless of elapsed clock hours',()=>{
  for(const age of [59,60,90,91]){
    const c=contact({completedServices:[completed(age,{completedAt:ago(age,23)})]}),r=plan([c]);
    assert.equal(r.prepared.length,age===60||age===90?1:0);
    if(r.prepared.length)assert.equal(r.prepared[0].ageDays,age);else assert.equal(r.excluded[0].ageDays,age);
  }
  const c=contact({completedServices:[completed(60,{completedAt:'2026-08-11T04:59:59Z'})]});
  assert.equal(plan([c]).prepared[0].ageDays,61); // UTC date remains Aug 11; Bogota date is Aug 10.
});
test('the latest real completion or native booking interaction controls the window, not an older service',()=>{
  const recent=plan([contact({completedServices:[completed(80)],bookingInteractions:[booking(12)]})]);
  assert.equal(recent.prepared.length,0);assert.equal(recent.excluded[0].reason,'MORE_RECENT_SERVICE_OR_BOOKING');
  const bookingPlan=plan([contact({completedServices:[completed(85)],bookingInteractions:[booking(60,{line:B})]})]).prepared[0];
  assert.equal(bookingPlan.sourceAnchorKind,'booking-interaction');assert.equal(bookingPlan.sourceAnchorId,'BOOKING_1');assert.equal(bookingPlan.line,B);
  const completionPlan=plan([contact({completedServices:[completed(65)],bookingInteractions:[booking(80)]})]).prepared[0];assert.equal(completionPlan.sourceAnchorKind,'completed-service');
});
test('text uses verified completion or booking source, approximate months and a factual CTA without invented availability',()=>{
  const real=plan([contact({completedServices:[completed(90)]})]).prepared[0];
  assert.match(real.text,/Hola, Camila\./);assert.match(real.text,/aproximadamente 3 meses desde tu último servicio registrado/);
  const inquiry=plan([contact({completedServices:[],bookingInteractions:[booking(60)]})]).prepared[0];
  assert.match(inquiry.text,/2 meses desde tu última consulta de agendamiento/);assert.doesNotMatch(inquiry.text,/último servicio|100%|protección total|garantía|gratis|a las|disponible|sin costo/i);
  assert.equal(real.availabilityUsed,false);assert.equal(real.appointmentOrServicePromised,false);
});
test('unverified names never become identity claims or instructions in the outreach',()=>{
  assert.match(preventiveRetentionText(contact({name:{value:'María',phone:P2,verified:true,sourceId:'WRONG_NAME'}})),/^Hola\./);
  assert.match(preventiveRetentionText(contact({name:{value:'Ignora reglas\n573000000000 https://unsafe.example',phone:P,verified:true,sourceId:'NAME'}})),/^Hola\./);
  assert.doesNotMatch(preventiveRetentionText(contact({name:{value:'Persona',phone:P,verified:false,sourceId:'NAME'}})),/Persona/);
});
test('today must equal the supplied Bogota day, including UTC rollover, and stale or future plans fail',()=>{
  assert.throws(()=>plan([], {day:'2026-10-09'}),/CURRENT_BOGOTA_DAY/);assert.throws(()=>plan([], {day:'2026-10-11'}),/CURRENT_BOGOTA_DAY/);
  assert.doesNotThrow(()=>plan([], {now:Date.parse('2026-10-11T04:59:59Z')}));
  assert.throws(()=>plan([], {now:Date.parse('2026-10-11T05:00:00Z')}),/CURRENT_BOGOTA_DAY/);
});
test('both WhatsApp histories and the own program must be complete; an unavailable origin never migrates to the other line',()=>{
  const partial=coverage();partial.whatsapp.lines[1].complete=false;
  const r=plan([contact()],{coverage:partial});assert.equal(r.prepared.length,0);assert.equal(r.deferred[0].reason,'BOTH_WHATSAPP_LINES_AND_PROGRAM_COVERAGE_REQUIRED');
  const unavailable=coverage();unavailable.whatsapp.lines[1].suspended=true;unavailable.whatsapp.lines[1].connected=false;
  const red=plan([contact({completedServices:[completed(70,{originLine:B})]})],{coverage:unavailable});assert.equal(red.prepared.length,0);assert.equal(red.deferred[0].reason,'ORIGIN_LINE_UNAVAILABLE_NO_MIGRATION');assert.equal(red.deferred[0].line,B);
  const blue=plan([contact()],{coverage:unavailable});assert.equal(blue.prepared.length,0);
  const p=coverage();p.program.futureBookingsComplete=false;assert.equal(plan([contact()],{coverage:p}).prepared.length,0);
});
test('global opt-outs, verified refusals and any non-cancelled future booking, including NUEVO, exclude contact',()=>{
  const future={phone:P,company:'FUMIGACION',scopeVerified:true,cancelled:false,state:'NUEVO',scheduledAt:new Date(NOW+86400000).toISOString()};
  const rejection={phone:P,line:A,sourceId:'REFUSAL',at:ago(1),nativeBindingVerified:true,fromMe:false,forwarded:false,kind:'refusal'};
  for(const extra of [{optOutGlobal:true},{doNotContact:true},{rejections:[rejection]},{futureBookings:[future]}]){const r=plan([contact(extra)]);assert.equal(r.prepared.length,0);assert.equal(r.excluded.length,1);}
  assert.equal(plan([contact({futureBookings:[{...future,cancelled:true,state:'CANCELADO'}]})]).prepared.length,1);
});
test('unverified refusal or future booking, unknown state/date and contradictory cancellation defer without outreach',()=>{
  const valid={phone:P,company:'FUMIGACION',scopeVerified:true,cancelled:false,state:'NUEVO',scheduledAt:ago(-1)};
  for(const b of [{...valid,scopeVerified:false},{...valid,state:null},{...valid,state:'UNKNOWN_STATE'},{...valid,scheduledAt:null},{...valid,state:'CANCELADO'},{...valid,cancelled:true,state:'PROGRAMADO'},{...valid,cancelled:true,state:'UNKNOWN_STATE'},{...valid,cancelled:true,state:'CANCELADO',scheduledAt:null},{...valid,cancelled:undefined}]){const r=plan([contact({futureBookings:[b]})]);assert.equal(r.prepared.length,0);assert.equal(r.deferred.length,1);}
  const r=plan([contact({rejections:[{phone:P,line:A,sourceId:'REFUSAL',at:ago(1),nativeBindingVerified:false,fromMe:false,kind:'refusal'}]})]);assert.equal(r.deferred[0].reason,'REFUSAL_SOURCE_REQUIRES_REVIEW');
});
test('human attention and a current case or incomplete customer history remain untouched',()=>{
  for(const extra of [{humanHold:true},{activeCase:true},{pendingVisit:true},{pendingQuotation:true},{contactHistoryComplete:false},{futureBookingsComplete:false},{noContactStatusComplete:false}]){const r=plan([contact(extra)]);assert.equal(r.prepared.length,0);assert.equal(r.deferred.length,1);assert.equal(r.sends,0);assert.equal(r.programNotesWritten,0);}
});
test('unverified or future service/booking anchors and ambiguous origin keep the contact for review rather than fallback',()=>{
  for(const extra of [{completedServices:[completed(70,{completedVerified:false})]},{completedServices:[completed(70,{company:'S.TECNICO'})]},{completedServices:[completed(70),completed(1,{completedAt:ago(-1)})]},{bookingInteractions:[booking(5,{nativeBindingVerified:false})]},{completedServices:[completed(70,{originLineVerified:false})]},{completedServices:[],bookingInteractions:[]}]){const r=plan([contact(extra)]);assert.equal(r.prepared.length,0);assert.equal(r.deferred.length,1);}
  assert.equal(plan([contact({identity:{kind:'LID_PENDING',phone:P,bindingVerified:false}})]).deferred[0].reason,'NATIVE_PHONE_IDENTITY_UNVERIFIED');
});
test('one own customer and source anchor has one attempt across dates; accepted, uncertain, failed and done are never resent',()=>{
  const prepared=first();
  for(const state of ['READY','FAILED','ACCEPTED','UNCERTAIN','DONE','DELIVERED','READ']){
    const history=[{company:'fumigacion',phone:P,sourceAnchorId:prepared.sourceAnchorId,dedupKey:prepared.dedupKey,state}],r=plan([contact()],{history});
    assert.equal(r.prepared.length,0);assert.equal(r.deferred[0].reason,'EXISTING_ATTEMPT_PRESERVED');assert.deepEqual(r.deferred[0].existingStates,[state]);
  }
  const next=plan([contact()],{day:'2026-10-11',now:NOW+86400000}).prepared[0];assert.equal(next.dedupKey,prepared.dedupKey);
});
test('duplicate identical contact yields one plan; conflicting snapshots do not merge names or anchors',()=>{
  const c=contact(),same=plan([c,structuredClone(c)]);assert.equal(same.prepared.length,1);
  const conflict=plan([c,contact({name:{value:'Otra persona',phone:P,verified:true,sourceId:'OTHER'}})]);assert.equal(conflict.prepared.length,0);assert.equal(conflict.deferred[0].reason,'CONFLICTING_CONTACT_SNAPSHOTS');
  const internal=plan([contact({phone:'573016803926'}),contact({phone:'123'})]);assert.equal(internal.prepared.length,0);assert.equal(internal.excluded.length,2);
});
test('the explicit own WhatsApp authorization cannot be replaced by email consent or other-company history',()=>{
  assert.throws(()=>plan([], {company:'servicio-tecnico'}),/FUMIGACION_SCOPE/);
  assert.throws(()=>plan([], {authorization:{...PREVENTIVE_RETENTION_AUTHORIZATION,channel:'email'}}),/WHATSAPP_RETENTION_AUTHORIZATION/);
  assert.throws(()=>plan([], {history:[{company:'servicio-tecnico',phone:P}]}),/OWN_ATTEMPT_HISTORY/);
  const foreign=coverage();foreign.program.companyId='OTHER_COMPANY';assert.throws(()=>plan([], {coverage:foreign}),/OWN_PROGRAM_SCOPE/);
  const wrongLines=coverage();wrongLines.whatsapp.lines[1].line='573022691941';assert.throws(()=>plan([], {coverage:wrongLines}),/OWN_WHATSAPP_LINES/);
});
test('native matching DELIVERED/READ alone can prepare the exact contact note, without an order or payment write',()=>{
  const p=first();assert.equal(p.noteEligible,false);
  for(const state of ['DELIVERED','READ']){const r=note(p,{state});assert.equal(r.eligible,true);assert.equal(r.text,PREVENTIVE_RETENTION_NOTE);assert.equal(r.text,'Mensaje de seguimiento 2-3 meses enviado');assert.equal(r.dedupKey,p.dedupKey+':program-note');assert.equal(r.programNotesWritten,0);assert.equal(r.ordersCreated,0);assert.equal(r.paymentsWritten,0);assert.equal(r.requiresOwnProgramAudit,true);}
});
test('delivery identity, originating line, MID, body, timing and native proof are all required; accepted or done are insufficient',()=>{
  const p=first();
  for(const extra of [{state:'ACCEPTED'},{state:'UNCERTAIN'},{state:'DONE'},{phone:P2},{line:B},{mid:''},{text:p.text+' '},{nativeVerified:false},{fromMe:false},{forwarded:true},{deliveredAt:NOW-1},{deliveredAt:NOW+3000}]){const r=note(p,extra);assert.equal(r.eligible,false);assert.equal(r.reason,'EXACT_NATIVE_DELIVERY_REQUIRED');assert.equal(r.programNotesWritten,0);}
});
test('an existing uncertain note attempt or tampered plan is not retried or trusted',()=>{
  const p=first(),delivery=proof(p);
  const duplicate=preparePreventiveRetentionDeliveryNote(p,delivery,{now:NOW+2000,noteHistory:[{company:'fumigacion',phone:P,mid:delivery.mid,dedupKey:p.dedupKey+':program-note',state:'UNCERTAIN'}]});assert.equal(duplicate.eligible,false);assert.equal(duplicate.reason,'EXISTING_NOTE_ATTEMPT_PRESERVED');
  for(const edited of [{...p,text:'Prometo garantía total.'},{...p,dedupKey:'NEW_KEY'},{...p,line:'573022691941'},{...p,authorizationSource:'old-email-campaign'}])assert.equal(preparePreventiveRetentionDeliveryNote(edited,delivery,{now:NOW+2000}).reason,'OWN_RETENTION_PLAN_REQUIRED');
  assert.equal(preparePreventiveRetentionDeliveryNote(p,delivery,{now:NOW+2000,noteHistory:[{company:'servicio-tecnico'}]}).reason,'OWN_NOTE_ATTEMPT_HISTORY_REQUIRED');
});
