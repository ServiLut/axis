import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDailyOperationalAudit,dailyManagementReportText,dailyOperationalReportText,DAILY_TECHNICIAN_VALUES_GUARD} from '../automation/service-bots/daily-operational-audit.mjs';
import {MARIA_COMPANY,MARIA_TENANT} from '../automation/service-bots/maria-program.mjs';

const DAY='2026-10-16',FROM=Date.parse(DAY+'T05:00:00Z'),NOW=FROM+10*3600000,PHONE='573000009999';
const iso=n=>new Date(n).toISOString();
const technician=(id='TECH_A',extra={})=>({id,displayName:'Técnico '+id,displayNameSource:'current-active-company-technician-user',scheduledServices:0,completedServices:0,...extra});
const order=(id,extra={})=>({id,createdAt:iso(FROM+1000),state:'PROGRAMADO',technicianId:'TECH_A',technicianCatalogVerified:true,quoteValueCop:'129000',deletedAt:null,scheduledAt:iso(FROM+3600000),schedule:{guard:'explicit-calendar-and-bogota-time-preserving-raw-fields-v1',scheduledAt:iso(FROM+3600000),calendarDay:DAY,granularity:'DATETIME',conflict:null,timeKnown:true},classification:{scheduledInDay:true,completedInDay:false,cancelled:false,completionDateUnknown:false},...extra});
const snapshot=(orders,extra={})=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,day:DAY,from:iso(FROM),to:iso(FROM+86400000),checkedAt:iso(NOW),readOnly:true,orders,technicians:[technician()],deletions:[],coverage:{ordersComplete:true,techniciansComplete:true,auditsComplete:true,hardDeletesCovered:false,historicalTechnicianRosterVerified:false,technicianAttendanceVerified:false},...extra});
const pages=()=>[{company:'fumigacion',day:DAY,readOnly:true,afterRow:0,nextRow:0,remaining:0,sources:[],coverage:{journalStartedAt:iso(FROM),suspendedLines:['573126938721']}}];
const evaluate=(orders,extra={})=>evaluateDailyOperationalAudit({day:DAY,journalPages:pages(),now:NOW,programSnapshot:snapshot(orders,extra)});

test('verifies the snapshot against its observed response time, not the earlier command start',()=>{
  const program=snapshot([order('DURING_READ')],{checkedAt:iso(NOW+535)});
  const result=evaluateDailyOperationalAudit({day:DAY,journalPages:pages(),now:NOW,programSnapshot:program,programSnapshotObservedAt:NOW+800});
  assert.equal(result.checkedAt,iso(NOW));
  assert.equal(result.technicianValues.coverage.snapshotTimeVerified,true);
  assert.doesNotMatch(dailyManagementReportText(result),/fecha del corte por verificar/);
  const future=evaluateDailyOperationalAudit({day:DAY,journalPages:pages(),now:NOW,programSnapshot:program,programSnapshotObservedAt:NOW+534});
  assert.equal(future.technicianValues.coverage.snapshotTimeVerified,false);
  assert.match(dailyManagementReportText(future),/fecha del corte por verificar/);
});

test('counts the visit day, never the creation day or another booking, and deduplicates identical order IDs',()=>{
  const current=order('TODAY',{createdAt:'2026-09-01T10:00:00Z'}),futureAt=FROM+86400000;
  const future=order('CREATED_TODAY_VISIT_TOMORROW',{scheduledAt:iso(futureAt),schedule:{...current.schedule,scheduledAt:iso(futureAt),calendarDay:'2026-10-17'}});
  const a=evaluate([current,structuredClone(current),future]);
  assert.equal(a.technicianValues.totals.activeOrders,1);assert.equal(a.technicianValues.totals.knownValueCop,129000);assert.equal(a.technicianValues.coverage.outsideVisitDayOrders,1);
  assert.deepEqual(a.technicianValues.technicians[0].orderIds,['TODAY']);
});

test('shows assignments rather than claiming the entire current catalog attended work',()=>{
  const roster=Array.from({length:30},(_,i)=>technician('TECH_'+i));
  const a=evaluate([order('ASSIGNED',{technicianId:'TECH_0'})],{technicians:roster});
  assert.equal(a.technicianValues.activeCatalogTechnicianCount,30);assert.equal(a.technicianValues.assignedTechnicianCount,1);assert.equal(a.technicianValues.verifiedAssignedTechnicianCount,1);assert.equal(a.technicianValues.technicianAttendanceVerified,false);assert.equal(a.technicianProgress.scheduledStatus,'UNKNOWN');
  assert.match(dailyManagementReportText(a),/Técnicos con órdenes asignadas: 1;/);assert.doesNotMatch(dailyManagementReportText(a),/30 técnicos|30 presentes/);
});

test('keeps current states separate and does not turn finalized state into proven physical execution',()=>{
  const a=evaluate([order('P'),order('F',{state:'TECNICO_FINALIZO'}),order('L',{state:'LIQUIDADO'}),order('N',{state:'NUEVO'}),order('O',{state:'EN_CAMINO'})]);
  assert.deepEqual(a.technicianValues.totals.activeStateCounts,{programmed:1,finalized:2,new:1,other:1});
  assert.equal(a.technicianValues.totals.activeOrders,5);assert.equal(a.technicianValues.physicalExecutionVerified,false);assert.equal(a.technicianProgress.completedOrders,0);
  assert.match(dailyManagementReportText(a),/2 finalizados en el sistema/);
});

test('separates cancellation values and logically deleted rows from the active total',()=>{
  const a=evaluate([order('ACTIVE',{quoteValueCop:'100.50'}),order('CANCELLED',{state:'CANCELADO',quoteValueCop:'400',classification:{cancelled:true}}),order('NO_AGREEMENT',{state:'SIN_CONCRETAR',quoteValueCop:'0'}),order('DELETED',{deletedAt:iso(NOW),quoteValueCop:'999999'})]);
  const v=a.technicianValues;assert.equal(v.totals.visitOrders,4);assert.equal(v.totals.activeOrders,1);assert.equal(v.totals.cancelledOrders,2);assert.equal(v.totals.deletedOrders,1);assert.equal(v.totals.knownValueCop,100.5);assert.equal(v.totals.cancelledKnownValueCop,400);assert.equal(v.cancelledValuesIncludedInActiveTotal,false);assert.equal(v.deletedValuesIncludedInActiveTotal,false);
  assert.match(dailyManagementReportText(a),/Fuera del total activo: 1 cancelado; 1 sin concretar\. Valor registrado conjunto: \$400 COP/);assert.match(dailyManagementReportText(a),/TOTAL ACTIVO — 1 servicio — \$100,5 COP/);assert.doesNotMatch(dailyManagementReportText(a),/2 cancelados/);
});

test('preserves explicit zero and sums decimal cents exactly while null or missing values remain unknown',()=>{
  const a=evaluate([order('DECIMAL_A',{quoteValueCop:'0.10'}),order('DECIMAL_B',{quoteValueCop:0.2}),order('ZERO',{quoteValueCop:'0'}),order('NULL',{quoteValueCop:null}),order('ABSENT',{quoteValueCop:undefined})]);
  const t=a.technicianValues.totals;assert.equal(t.knownValueCop,0.3);assert.equal(t.knownValueCount,3);assert.equal(t.unknownValueCount,2);assert.equal(t.valueComplete,false);
  const unknown=evaluate([order('NULL',{quoteValueCop:null})]);assert.equal(unknown.technicianValues.totals.knownValueCop,null);assert.match(dailyManagementReportText(unknown),/SUBTOTAL ACTIVO OBSERVADO — 1 servicio — pendiente \(1 importe sin confirmar\)/);assert.doesNotMatch(dailyManagementReportText(unknown),/TOTAL ACTIVO[^\n]*\$0/);
});

test('rejects malformed amounts, booleans, negatives, exponent strings, locale formatting and excess decimal places',()=>{
  const invalid=[-1,'-1','1,000','COP 100','$100','1e3','1.001',true,false,NaN,Infinity,{},[],9007199254740991];
  const a=evaluate(invalid.map((quoteValueCop,i)=>order('BAD_'+i,{quoteValueCop})));
  assert.equal(a.technicianValues.totals.unknownValueCount,invalid.length);assert.equal(a.technicianValues.totals.knownValueCop,null);
});

test('fails closed on unsafe subtotal overflow rather than publishing a rounded monetary total',()=>{
  const a=evaluate([order('MAX_A',{quoteValueCop:'90071992547409.91'}),order('MAX_B',{quoteValueCop:'0.01'})]);
  assert.equal(a.technicianValues.totals.amountOverflow,true);assert.equal(a.technicianValues.totals.knownValueCop,null);assert.equal(a.technicianValues.coverage.complete,false);assert.match(dailyManagementReportText(a),/suma fuera del límite verificable/);
});

test('conflicting reused IDs are excluded from counts and amounts with a visible partial-coverage limit',()=>{
  const first=order('COLLISION',{quoteValueCop:'100'}),other={...first,technicianId:'TECH_B',quoteValueCop:'500'};
  const a=evaluate([first,other,first,order('VALID',{quoteValueCop:'20'})],{technicians:[technician(),technician('TECH_B')]});
  assert.deepEqual(a.technicianValues.coverage.conflictingOrderIds,['COLLISION']);assert.equal(a.technicianValues.totals.activeOrders,1);assert.equal(a.technicianValues.totals.knownValueCop,20);assert.equal(a.technicianValues.coverage.complete,false);assert.match(dailyManagementReportText(a),/1 identificador contradictorio/);
  assert.match(dailyManagementReportText(a),/SUBTOTAL ACTIVO OBSERVADO — 1 servicio — \$20 COP/);assert.doesNotMatch(dailyManagementReportText(a),/^\*?TOTAL ACTIVO/m);
});

test('keeps unassigned visits apart without assigning them to a technician by name or target',()=>{
  const a=evaluate([order('ASSIGNED'),order('NO_TECH',{technicianId:null,technicianCatalogVerified:false,quoteValueCop:'50'})]);
  assert.equal(a.technicianValues.assignedTechnicianCount,1);assert.equal(a.technicianValues.unassigned.activeOrders,1);assert.equal(a.technicianValues.unassigned.knownValueCop,50);assert.equal(a.technicianValues.totals.knownValueCop,129050);assert.match(dailyManagementReportText(a),/\*Sin técnico asignado\*\n• Servicios activos: 1 · Valor registrado: \$50 COP/);
});

test('an invalid technician identifier is an unresolved assignment, never an unassigned service or a fabricated technician',()=>{
  const a=evaluate([order('INVALID',{technicianId:'not a valid id',quoteValueCop:'50'}),order('ABSENT',{technicianId:null,quoteValueCop:'20'})]);
  assert.equal(a.technicianValues.assignedTechnicianCount,0);assert.equal(a.technicianValues.invalidAssignment.activeOrders,1);assert.equal(a.technicianValues.unassigned.activeOrders,1);assert.equal(a.technicianValues.totals.knownValueCop,70);assert.equal(a.technicianValues.coverage.complete,false);assert.match(dailyManagementReportText(a),/\*Asignación con identificador inválido\*\n• Servicios activos: 1 · Valor registrado: \$50 COP/);
});

test('counts a verified date-only visit without inventing an appointment hour and excludes contradictory calendars',()=>{
  const dayOnly=order('DATE_ONLY',{scheduledAt:iso(FROM),schedule:{...order('x').schedule,scheduledAt:iso(FROM),granularity:'DATE_ONLY',timeKnown:false}});
  const conflict=order('CONFLICT',{schedule:{...order('x').schedule,granularity:'CONFLICT',conflict:'CALENDAR_MISMATCH'}});
  const mismatch=order('MISMATCH',{schedule:{...order('x').schedule,calendarDay:'2026-10-15'}});
  const a=evaluate([dayOnly,conflict,mismatch]);assert.equal(a.technicianValues.totals.activeOrders,1);assert.equal(a.technicianValues.coverage.unknownVisitDayOrders,2);assert.equal(a.technicianValues.coverage.dateOnlyVisitOrders,1);assert.match(dailyManagementReportText(a),/sin hora confirmada: 1/);
});

test('the Bogota visit day includes its exact start and excludes its next midnight even across UTC dates',()=>{
  const at=(id,time,day)=>order(id,{scheduledAt:time,schedule:{...order('x').schedule,scheduledAt:time,calendarDay:day}});
  const a=evaluate([at('BEGIN','2026-10-16T05:00:00Z',DAY),at('LATE','2026-10-17T04:59:59Z',DAY),at('END','2026-10-17T05:00:00Z','2026-10-17')]);
  assert.equal(a.technicianValues.totals.activeOrders,2);assert.equal(a.technicianValues.coverage.outsideVisitDayOrders,1);
});

test('does not present an unverified or conflicting catalog name as verified technician identity',()=>{
  const a=evaluate([order('BAD_CATALOG',{technicianCatalogVerified:false})]);assert.equal(a.technicianValues.verifiedAssignedTechnicianCount,0);assert.equal(a.technicianValues.technicians[0].name,'Asignación de técnico por verificar');assert.equal(a.technicianValues.coverage.complete,false);
  const b=evaluate([order('SAME_ID')],{technicians:[technician(),technician('TECH_A',{displayName:'Nombre distinto'})]});assert.equal(b.technicianValues.verifiedAssignedTechnicianCount,0);assert.deepEqual(b.technicianValues.coverage.catalogConflictingIds,['TECH_A']);
});

test('management text is compact and excludes customer inventories while the unchanged default closing report preserves them',()=>{
  const o=order('SAFE',{canonicalContacts:[PHONE],contactScopeVerified:true});
  const journal=pages();journal[0].sources=[{sourceId:'SOURCE_CUSTOMER',line:'573126944997',phone:PHONE,fromMe:false,identity:'PN',bindingVerified:true,receivedAt:FROM+1000,literalText:'Dirección Calle 123, pago secreto',media:{private:'raw'}}];journal[0].nextRow=1;
  const a=evaluateDailyOperationalAudit({day:DAY,journalPages:journal,programSnapshot:snapshot([o]),now:NOW});
  const text=dailyManagementReportText(a);assert.doesNotMatch(text,new RegExp(PHONE+'|SOURCE_CUSTOMER|Calle 123|pago secreto|raw'));assert.match(dailyOperationalReportText(a),new RegExp(PHONE));assert.equal(a.reportText,dailyOperationalReportText(a));assert.match(text,/cotizaciones guardadas/);assert.match(text,/no son facturas emitidas/);assert.match(text,/no prueban asistencia/);assert.ok(text.length<2000);
  assert.match(text,/\*Técnico TECH_A\*\n• Servicios activos:/);assert.match(text,/nuevos\.\n\n\*TOTAL ACTIVO/);assert.equal((text.match(/TOTAL ACTIVO —/g)??[]).length,2);assert.doesNotMatch(text,/valor\(es\)|pendiente\(s\)|Técnico — servicios/);
});

test('the pure aggregation preserves its input, read scope, target guards and all business-write prohibitions',()=>{
  const p=snapshot([order('PURE')]),before=structuredClone(p);const a=evaluateDailyOperationalAudit({day:DAY,journalPages:pages(),programSnapshot:p,now:NOW});
  assert.deepEqual(p,before);assert.equal(a.technicianValues.guard,DAILY_TECHNICIAN_VALUES_GUARD);assert.equal(a.businessWrites,0);assert.equal(a.sends,0);assert.equal(a.technicianValues.bankReceiptsVerified,false);assert.equal(a.technicianValues.invoiceIssuedVerified,false);assert.equal(a.technicianValues.businessWrites,0);assert.equal(a.technicianProgress.scheduledStatus,'UNKNOWN');
  assert.throws(()=>evaluateDailyOperationalAudit({day:DAY,journalPages:pages(),programSnapshot:{...p,companyId:'FOREIGN'},now:NOW}),/SCOPE/);
  assert.throws(()=>dailyManagementReportText({...a,recipient:PHONE}),/OWN_DAILY/);
});

test('partial rows, an unavailable snapshot and future cut timestamps remain explicitly pending',()=>{
  const a=evaluate([order('ONLY_PART')],{coverage:{ordersComplete:false}});assert.equal(a.technicianValues.coverage.complete,false);assert.match(dailyManagementReportText(a),/faltan filas del programa/);
  const future=evaluate([order('FUTURE_SNAPSHOT')],{checkedAt:iso(NOW+1)});assert.equal(future.technicianValues.coverage.snapshotTimeVerified,false);assert.match(dailyManagementReportText(future),/fecha del corte por verificar/);
  const absent=evaluateDailyOperationalAudit({day:DAY,journalPages:pages(),now:NOW});assert.equal(absent.technicianValues.available,false);assert.match(dailyManagementReportText(absent),/No pude comprobar los datos de Tenaxis/);assert.doesNotMatch(dailyManagementReportText(absent),/TOTAL ACTIVO.*\$0/);
});

test('a source integrity conflict cannot become a complete financial total or a verified six-by-five goal',()=>{
  const roster=Array.from({length:6},(_,i)=>technician('TECH_'+i,{scheduledServices:5,completedServices:5}));
  const orders=roster.flatMap(t=>Array.from({length:5},(_,i)=>order(t.id+'_'+i,{technicianId:t.id,state:'TECNICO_FINALIZO',actualFinishedAt:iso(FROM+7200000),classification:{scheduledInDay:true,completedInDay:true,cancelled:false}})));
  const at=FROM+86400000+1000;
  const a=evaluateDailyOperationalAudit({day:DAY,journalPages:pages(),programSnapshot:snapshot(orders,{technicians:roster,checkedAt:iso(at),coverage:{ordersComplete:true,techniciansComplete:true,historicalTechnicianRosterVerified:true,integrityConflicts:true}}),now:at});
  assert.equal(a.technicianValues.coverage.sourceIntegrityConflicts,true);assert.equal(a.technicianValues.coverage.complete,false);assert.equal(a.technicianProgress.scheduledStatus,'UNKNOWN');assert.equal(a.technicianProgress.completedStatus,'UNKNOWN');assert.match(dailyManagementReportText(a),/programa señala inconsistencias/);
});
