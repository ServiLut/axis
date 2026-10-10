import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDailyOperationalAudit,bogotaDayWindow,DAILY_OPERATIONAL_AUDIT_GUARD,FUMIGACION_DAILY_TARGET} from '../automation/service-bots/daily-operational-audit.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from '../automation/service-bots/maria-program.mjs';
const DAY='2026-10-09',A='573126944997',B='573126938721',P='573000001111',P2='573000002222',FROM=Date.parse(DAY+'T05:00:00Z'),TO=FROM+86400000,NOW=TO+60000;
const source=(id,extra={})=>({row:1,sourceId:id,phone:P,line:A,instance:'cucaracha-azul',providerAt:FROM+1000,receivedAt:FROM+2000,fromMe:false,kind:'text',identity:'PN',bindingVerified:true,literalText:'Necesito un servicio.',media:null,deleted:false,operationalLine:true,observations:[],...extra});
const page=(sources,extra={})=>({company:'fumigacion',day:DAY,readOnly:true,coverage:{journalStartedAt:new Date(FROM-86400000).toISOString(),activeLines:[A,B],suspendedLines:[],journalReceiptCoverageOnly:true,allWhatsAppTrafficComplete:false},sources,pendingIdentitySources:[],afterRow:0,nextRow:sources.length,remaining:0,...extra});
const program=(extra={})=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,day:DAY,from:new Date(FROM).toISOString(),to:new Date(TO).toISOString(),checkedAt:new Date(NOW).toISOString(),readOnly:true,orders:[],technicians:[],deletions:[],coverage:{ordersComplete:true,techniciansComplete:true,auditsComplete:true,hardDeletesCovered:false,historicalTechnicianRosterVerified:true},...extra});
const evaluate=(sources,programSnapshot=program(),extra={})=>evaluateDailyOperationalAudit({day:DAY,journalPages:[page(sources)],programSnapshot,now:NOW,...extra});
const order=(id,extra={})=>({id,canonicalContacts:[P],contactScopeVerified:true,state:'NUEVO',scheduledAt:null,actualFinishedAt:null,deletedAt:null,technicianId:null,classification:{scheduledInDay:false,completedInDay:false,cancelled:false,completionDateUnknown:false},...extra});

test('same contact in both lines is one daily contact with two original lines and deduplicated source observations',()=>{
  const src=source('SOURCE_1'),audit=evaluate([src,{...src},source('SOURCE_2',{line:B})]);
  assert.equal(audit.contactsCount,1);assert.equal(audit.incomingMessages,2);assert.deepEqual(audit.contacts[0].lines,[B,A].sort());assert.deepEqual(audit.lines.map(l=>l.incomingMessageCount),[1,1]);
  assert.equal(audit.dedupKey,'daily-endday-fumigacion-20261009-sandra-v1');assert.equal(audit.sends,0);assert.equal(audit.businessWrites,0);assert.equal(audit.coverage.totalWhatsAppVerified,false);assert.equal(audit.guard,DAILY_OPERATIONAL_AUDIT_GUARD);
});
test('outgoing, known internal, groups and foreign lines are not private inbound customer contacts',()=>{
  const audit=evaluate([source('STAFF',{fromMe:true}),source('CHIEF',{phone:'573016803926'}),source('GROUP',{group:true,phone:null,identity:'GROUP'}),source('OTHER_COMPANY',{line:'573022691941'}),source('CUSTOMER')]);
  assert.equal(audit.contactsCount,1);assert.equal(audit.incomingMessages,1);assert.equal(audit.excluded.ownOutgoing,1);assert.equal(audit.excluded.knownInternal,1);assert.equal(audit.excluded.groups,1);assert.equal(audit.excluded.foreignLine,1);
});
test('Bogota receipt-day boundaries are exact; provider timestamps do not silently move the receipt day',()=>{
  const audit=evaluate([source('START',{receivedAt:FROM,providerAt:FROM-1000}),source('BEFORE',{receivedAt:FROM-1}),source('END',{receivedAt:TO}),source('LAST',{receivedAt:TO-1})]);
  assert.equal(audit.incomingMessages,2);assert.equal(audit.contacts[0].firstReceivedAt,new Date(FROM).toISOString());assert.equal(audit.dayComplete,true);assert.equal(audit.coverage.wholeDayReceiptCoverage,true);
  assert.equal(bogotaDayWindow('2026-10-09').from,'2026-10-09T05:00:00.000Z');assert.throws(()=>bogotaDayWindow('2026-02-30'),/DAY_REQUIRED/);
});
test('a claimed PN without verified binding and LID/conflicting alternate phone remain unattributed',()=>{
  const entries=[source('PN_PENDING',{bindingVerified:false}),source('LID',{phone:null,identity:'LID_PENDING'}),source('COLLISION'),source('COLLISION',{phone:P2}),source('COLLISION')];
  const audit=evaluate(entries);assert.equal(audit.contactsCount,0);assert.equal(audit.pendingIdentityCount,3);assert.equal(audit.pendingIdentitySources.find(s=>s.sourceId==='COLLISION').identity,'PN_CONFLICT');assert.doesNotMatch(audit.reportText,new RegExp(P));
});
test('pagination gaps, a newly installed journal and suspended red retain partial traffic coverage',()=>{
  const audit=evaluateDailyOperationalAudit({day:DAY,journalPages:[page([source('PRIVATE')],{remaining:3,coverage:{journalStartedAt:new Date(FROM+60000).toISOString(),suspendedLines:[B]}})],programSnapshot:program(),now:TO-1000});
  assert.equal(audit.dayComplete,false);assert.equal(audit.coverage.paginationComplete,false);assert.equal(audit.coverage.wholeDayReceiptCoverage,false);assert.equal(audit.coverage.fullBothLineCoverage,false);assert.equal(audit.lines[1].suspended,true);assert.match(audit.reportText,/Corte provisional/);assert.match(audit.reportText,/Línea suspendida/);
});
test('daily program absence is not a complete contact search or proof of an omitted service',()=>{
  const audit=evaluate([source('INBOUND')]);assert.equal(audit.contacts[0].comparison,'NOT_LOCATED_IN_DAILY_SNAPSHOT');assert.equal(audit.contacts[0].completeContactSearch,false);assert.equal(audit.contacts[0].missingServiceVerified,false);assert.equal(audit.unmatchedContactsAreMissingServices,false);assert.match(audit.reportText,/búsqueda histórica pendiente/);
  const pending=evaluate([source('INBOUND')],null);assert.equal(pending.contacts[0].comparison,'UNVERIFIED_PROGRAM_SEARCH');assert.match(pending.reportText,/cruce con programa pendiente/);
});
test('only a complete same-phone program search can say no record, still without inventing acceptance',()=>{
  const audited=program({coverage:{ordersComplete:true,techniciansComplete:true,auditsComplete:true,contactSearchComplete:true},searchedContacts:[{phone:P,complete:true,orderIds:[]}]});
  const audit=evaluate([source('SEARCHED')],audited);assert.equal(audit.contacts[0].comparison,'NO_RECORD_AFTER_COMPLETE_CONTACT_SEARCH');assert.equal(audit.contacts[0].missingServiceVerified,false);assert.equal(audit.contacts[0].serviceAcceptanceVerified,false);
});
test('shared order and alternate stored phone preserve exact joins without counting the service twice or merging people',()=>{
  const tech={id:'TECH_1',displayName:'Operador uno',scheduledServices:1,completedServices:0},o=order('ORDER_1',{canonicalContacts:[P,P2],technicianId:tech.id,scheduledAt:new Date(FROM+3600000).toISOString(),classification:{scheduledInDay:true}});
  const audit=evaluate([source('CONTACT_1'),source('CONTACT_2',{phone:P2,line:B})],program({orders:[o],technicians:[tech]}));
  assert.equal(audit.contactsCount,2);assert.equal(audit.contacts[0].comparison,'MATCHED_PROGRAM_METADATA');assert.equal(audit.contacts[1].comparison,'MATCHED_PROGRAM_METADATA');assert.equal(audit.technicianProgress.scheduledOrders,1);assert.equal(audit.contacts[0].newSaleInferred,false);
  const ambiguous=evaluate([source('CONTACT')],program({orders:[{...o,contactScopeVerified:false}]}));assert.equal(ambiguous.contacts[0].comparison,'AMBIGUOUS_PROGRAM_IDENTITY');assert.equal(ambiguous.contacts[0].matches.length,0);
});
test('previous service/refuerzo and cancellations are not automatically new sales or new service writes',()=>{
  const audit=evaluate([source('REFUERZO',{literalText:'Necesito refuerzo de la fumigación anterior.'})],program({orders:[order('OLD_SERVICE',{serviceKind:'REFUERZO',state:'CANCELADO',classification:{cancelled:true}})]}));
  assert.equal(audit.contacts[0].matches[0].serviceKind,'REFUERZO');assert.equal(audit.contacts[0].matches[0].cancelled,true);assert.equal(audit.contacts[0].storedTrafficIsNewSale,false);assert.equal(audit.contacts[0].newSaleInferred,false);assert.equal(audit.businessWrites,0);assert.equal(audit.paymentsInferred,false);
});
test('linked deletes are observed; unlinked deletes and snapshot absence do not accuse a person or fabricate a phone',()=>{
  const linked=source('DELETED',{deleted:true,observations:[{operation:'delete',receivedAt:FROM+5000}]}),pending=source('UNLINKED_DELETE',{phone:null,identity:'LID_PENDING',bindingVerified:false,observations:[{operation:'delete',receivedAt:FROM+6000}]}),unproven=source('UNPROVEN',{deleted:true});
  const audit=evaluate([linked,pending,unproven],program({orders:[order('ORDER_DELETED',{deletedAt:new Date(FROM+7000).toISOString()})],deletions:[{orderId:'ORDER_DELETED',deletedAt:new Date(FROM+7000).toISOString(),source:'order-soft-delete'},{orderId:'NO_CONTACT',deletedAt:new Date(FROM+8000).toISOString(),source:'order-soft-delete'}]}));
  assert.equal(audit.contacts[0].whatsappDeletionObserved,true);assert.deepEqual(audit.contacts[0].whatsappDeletedSourceIds,['DELETED']);assert.equal(audit.contacts[0].unverifiedDeletionMetadata,1);assert.equal(audit.contacts[0].programDeletionObserved,true);assert.equal(audit.contacts[0].absenceIsDeletionProof,false);assert.equal(audit.unlinkedProgramDeletions.length,1);assert.equal(audit.pendingIdentitySources[0].deletionObserved,true);assert.doesNotMatch(audit.reportText,/robo|culpa|fraude|incumpli[oó]/i);
});
test('six by five goal separates scheduled and program completion, rejects cancelled and duplicate orders',()=>{
  const technicians=Array.from({length:6},(_,i)=>({id:'TECH_'+i,displayName:'Operador '+i,scheduledServices:5,completedServices:5})),orders=technicians.flatMap(t=>Array.from({length:5},(_,i)=>order(t.id+'_ORDER_'+i,{technicianId:t.id,scheduledAt:new Date(FROM+100000).toISOString(),actualFinishedAt:new Date(FROM+200000).toISOString(),classification:{scheduledInDay:true,completedInDay:true,cancelled:false,completionDateUnknown:false}})));
  const audit=evaluate([],program({orders,technicians}));assert.equal(audit.technicianProgress.scheduledStatus,'MET_IN_PROGRAM_RECORDS');assert.equal(audit.technicianProgress.completedStatus,'MET_IN_PROGRAM_RECORDS');assert.equal(audit.technicianProgress.completedOrders,30);assert.equal(audit.technicianProgress.actualExecutionIndependentlyVerified,false);assert.deepEqual(audit.technicianProgress.target,FUMIGACION_DAILY_TARGET);
  const cancelled=JSON.parse(JSON.stringify(orders));cancelled[0].classification.cancelled=true;const lower=evaluate([],program({orders:cancelled,technicians:technicians.map((t,i)=>({...t,scheduledServices:i?5:4,completedServices:i?5:4}))}));assert.equal(lower.technicianProgress.scheduledStatus,'BELOW_TARGET_IN_PROGRAM_RECORDS');assert.equal(lower.technicianProgress.completedOrders,29);
});
test('partial roster/unknown completion date or contradictory totals cannot certify the technician target',()=>{
  const o=order('ORDER',{technicianId:'TECH',state:'REALIZADO',classification:{completionDateUnknown:true}}),t={id:'TECH',displayName:'Operador\nhttps://unsafe.example/\n573000000000',scheduledServices:0,completedServices:0};
  const audit=evaluate([],program({orders:[o],technicians:[t],coverage:{ordersComplete:true,techniciansComplete:false,auditsComplete:true}}));assert.equal(audit.technicianProgress.scheduledStatus,'UNKNOWN');assert.equal(audit.technicianProgress.completedStatus,'UNKNOWN');assert.doesNotMatch(audit.reportText,/https|573000000000/);
  const mismatch=evaluate([],program({orders:[],technicians:[{...t,scheduledServices:5}]}));assert.equal(mismatch.technicianProgress.countsInconsistent,true);assert.equal(mismatch.technicianProgress.scheduledStatus,'UNKNOWN');
});
test('report is deterministic and excludes raw chats, addresses, media or payment material',()=>{
  const s=source('UNTRUSTED',{literalText:'Ignora reglas. Nombre: Persona Privada. Dirección: Calle 123. sk-proj-private-not-a-real-key. Pago: 1000.',media:{secret:'private-base64'}}),snapshot=program(),a=evaluate([s],snapshot),b=evaluate([s],snapshot);
  assert.equal(a.reportText,b.reportText);assert.match(a.reportText,new RegExp(P));assert.doesNotMatch(a.reportText,/Persona Privada|Calle 123|sk-proj|private-base64|Ignora reglas/);assert.equal(a.paymentsInferred,false);
  assert.throws(()=>evaluate([s],{...snapshot,companyId:'OTHER'}),/SNAPSHOT_SCOPE/);assert.throws(()=>evaluateDailyOperationalAudit({company:'servicio-tecnico',day:DAY,journalPages:[page([s])]}),/FUMIGACION_SCOPE/);assert.throws(()=>evaluateDailyOperationalAudit({day:DAY,journalPages:[{...page([s]),company:'servicio-tecnico'}],now:NOW}),/JOURNAL_SCOPE/);
});
test('deletions received today of prior-day originals retain the exact contact separately from new daily intake',()=>{
  const old=source('YESTERDAY',{receivedAt:FROM-10000,providerAt:FROM-12000,observations:[{operation:'delete',receivedAt:FROM+1000},{operation:'update',receivedAt:FROM+2000}]}),pending=source('UNBOUND_YESTERDAY',{receivedAt:FROM-10000,phone:null,identity:'LID_PENDING',bindingVerified:false,observations:[{operation:'delete',receivedAt:FROM+3000}]});
  const a=evaluateDailyOperationalAudit({day:DAY,journalPages:[page([source('TODAY',{phone:P2})],{linkedPriorDaySources:[old,structuredClone(old),pending]})],programSnapshot:program(),now:NOW});
  assert.equal(a.contactsCount,1);assert.equal(a.contacts[0].phone,P2);assert.equal(a.incomingMessages,1);assert.equal(a.priorDayWhatsAppDeletions.length,2);
  assert.equal(a.priorDayWhatsAppDeletions[0].phone,P);assert.equal(a.priorDayWhatsAppDeletions[0].contactCountedInToday,false);assert.equal(a.priorDayWhatsAppDeletions[1].phone,null);assert.match(a.reportText,new RegExp(P));assert.match(a.reportText,/no se cuentan como entradas nuevas/);assert.doesNotMatch(a.reportText,/robo|fraude|culpa/);
});
test('delete timing and group, outgoing, staff or system originals do not become private prior-day deletion contacts',()=>{
  const old=source('OLD',{receivedAt:FROM-1000,observations:[{operation:'delete',receivedAt:FROM-1},{operation:'delete',receivedAt:TO}]}),today=source('CURRENT',{observations:[{operation:'delete',receivedAt:TO+1000}]});
  const prior=[old,...[{fromMe:true},{phone:'573016803926'},{systemMessage:true},{group:true},{line:'573022691941'}].map((extra,i)=>source('IGNORED_'+i,{receivedAt:FROM-1000,observations:[{operation:'delete',receivedAt:FROM+1000}],...extra}))];
  const a=evaluateDailyOperationalAudit({day:DAY,journalPages:[page([today,source('PROTOCOL',{systemMessage:true})],{linkedPriorDaySources:prior,unlinkedObservations:[{operation:'delete',sourceId:'NO_ORIGINAL',line:A,receivedAt:FROM+1000}]})],now:NOW});
  assert.equal(a.contactsCount,1);assert.equal(a.contacts[0].whatsappDeletionObserved,false);assert.equal(a.priorDayWhatsAppDeletions.length,0);assert.equal(a.unlinkedWhatsAppDeletions.length,1);assert.equal(a.excluded.systemMessages,1);
});
test('conflicting phone identities on a deleted prior-day source remain unattributed through later duplicate rows',()=>{
  const old=source('OLD',{receivedAt:FROM-1000,observations:[{operation:'delete',receivedAt:FROM+1000}]}),a=evaluateDailyOperationalAudit({day:DAY,journalPages:[page([],{linkedPriorDaySources:[old,{...old,phone:P2},old]})],now:NOW});
  assert.equal(a.priorDayWhatsAppDeletions.length,1);assert.equal(a.priorDayWhatsAppDeletions[0].phone,null);assert.equal(a.priorDayWhatsAppDeletions[0].identityVerified,false);assert.doesNotMatch(a.reportText,new RegExp(P+'|'+P2));
});
test('a terminal page cannot certify complete pagination when the first page or intermediate chain is missing',()=>{
  const first=page([source('FIRST')],{afterRow:0,nextRow:500,remaining:500}),terminal=page([source('TERMINAL')],{afterRow:1000,nextRow:1500,remaining:0});
  const missing=evaluateDailyOperationalAudit({day:DAY,journalPages:[first,terminal],now:NOW});assert.equal(missing.coverage.paginationComplete,false);assert.equal(missing.coverage.wholeDayReceiptCoverage,false);
  const isolated=evaluateDailyOperationalAudit({day:DAY,journalPages:[terminal],now:NOW});assert.equal(isolated.coverage.paginationComplete,false);
  const good=evaluateDailyOperationalAudit({day:DAY,journalPages:[first,{...terminal,afterRow:500}],now:NOW});assert.equal(good.coverage.paginationComplete,true);
  const noMarker=evaluateDailyOperationalAudit({day:DAY,journalPages:[{...page([]),afterRow:undefined}],now:NOW});assert.equal(noMarker.coverage.paginationComplete,false);
});
test('historical technician roster needs positive evidence; missing or false flags leave target unknown',()=>{
  for(const flag of [undefined,false]){
    const a=evaluate([],program({coverage:{ordersComplete:true,techniciansComplete:true,auditsComplete:true,historicalTechnicianRosterVerified:flag}}));
    assert.equal(a.technicianProgress.historicalRosterUnverified,true);assert.equal(a.technicianProgress.technicianCoverageComplete,false);assert.equal(a.technicianProgress.scheduledStatus,'UNKNOWN');
  }
});
test('conflicting reuse of five order IDs across six technicians cannot certify thirty services',()=>{
  const technicians=Array.from({length:6},(_,i)=>({id:'TECH_'+i,displayName:'Operador '+i,scheduledServices:5,completedServices:5})),orders=technicians.flatMap(t=>Array.from({length:5},(_,i)=>order('SAME_ORDER_'+i,{technicianId:t.id,scheduledAt:new Date(FROM+1000).toISOString(),actualFinishedAt:new Date(FROM+2000).toISOString(),classification:{scheduledInDay:true,completedInDay:true,cancelled:false,completionDateUnknown:false}})));
  const a=evaluate([],program({orders,technicians}));assert.equal(a.technicianProgress.completedOrders,5);assert.equal(a.technicianProgress.countsInconsistent,true);assert.equal(a.technicianProgress.scheduledStatus,'UNKNOWN');assert.equal(a.technicianProgress.completedStatus,'UNKNOWN');
});
test('a stale snapshot taken before the day ended, or a future timestamp, cannot certify the closed-day goal',()=>{
  for(const checkedAt of [new Date(TO-1).toISOString(),new Date(NOW+1).toISOString(),null]){
    const a=evaluate([],program({checkedAt}));assert.equal(a.technicianProgress.snapshotThroughDayEnd,false);assert.equal(a.technicianProgress.scheduledStatus,'UNKNOWN');assert.equal(a.technicianProgress.completedStatus,'UNKNOWN');
  }
});
test('ambiguous phone search keeps a no-match unresolved even when a query has returned all its rows',()=>{
  const snapshot=program({coverage:{ordersComplete:true,techniciansComplete:true,auditsComplete:true,contactSearchComplete:true,historicalTechnicianRosterVerified:true},searchedContacts:[{phone:P,complete:true,identityAmbiguous:true,orderIds:[]}]});
  const a=evaluate([source('CONTACT')],snapshot);assert.equal(a.contacts[0].comparison,'AMBIGUOUS_PROGRAM_IDENTITY');assert.equal(a.contacts[0].completeContactSearch,false);assert.equal(a.contacts[0].missingServiceVerified,false);
});
