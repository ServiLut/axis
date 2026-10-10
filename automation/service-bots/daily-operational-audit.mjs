import {BUSINESSES,SANDRA,knownInternalRecipient} from './config.mjs';
import {MARIA_COMPANY,MARIA_TENANT} from './maria-program.mjs';

export const DAILY_OPERATIONAL_AUDIT_GUARD='own-daily-received-contact-program-snapshot-and-observed-deletion-v1';
export const FUMIGACION_DAILY_TARGET=Object.freeze({minimumTechnicians:6,servicesPerTechnician:5,totalServices:30,
  authorizationSource:'direct-user-20261010-daily-fumigacion-contact-and-technician-audit'});
const pn=/^57\d{10}$/,sourceId=/^[A-Za-z0-9_-]{1,128}$/;
const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,160}$/.test(v)?v:null;
const dateText=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
const millis=v=>typeof v==='number'&&Number.isSafeInteger(v)?v:typeof v==='string'?Date.parse(v):NaN;
const safeLabel=v=>typeof v==='string'?v.replace(/[\r\n\t]/g,' ').replace(/https?:\/\/\S+|\b\d{7,}\b/g,'').replace(/\s+/g,' ').trim().slice(0,80):'';
const unique=v=>[...new Set(v)];
const bogotaTime=v=>new Date(v).toLocaleString('sv-SE',{timeZone:'America/Bogota',hour12:false});

export function bogotaDayWindow(day){
  if(!dateText(day))throw Error('DAILY_AUDIT_DAY_REQUIRED');
  const from=Date.parse(day+'T05:00:00Z');
  if(!Number.isFinite(from)||new Date(from).toISOString().slice(0,10)!==day)throw Error('DAILY_AUDIT_DAY_REQUIRED');
  return {day,timeZone:'America/Bogota',from:new Date(from).toISOString(),to:new Date(from+86400000).toISOString(),fromMs:from,toMs:from+86400000};
}

function journalSources(pages,day,window,now){
  if(!Array.isArray(pages)||!pages.length||pages.length>200)throw Error('OWN_INTAKE_JOURNAL_PAGES_REQUIRED');
  const sources=new Map(),conflicted=new Set(),excluded={ownOutgoing:0,knownInternal:0,foreignLine:0,outsideDay:0,unverifiedPhone:0,invalid:0,groups:0,systemMessages:0};
  const pending=[],unlinkedDeletions=[],priorDayDeletions=new Map(),pageCoverage=[];let paginationComplete=true,expectedAfterRow=0,previousRemaining=null;
  for(const page of pages){
    if(page?.company!=='fumigacion'||page.day!==day||page.readOnly!==true||!Array.isArray(page.sources))throw Error('OWN_INTAKE_JOURNAL_SCOPE_REQUIRED');
    const validPage=Number.isSafeInteger(page.afterRow)&&page.afterRow===expectedAfterRow&&Number.isSafeInteger(page.nextRow)&&page.nextRow>=page.afterRow&&Number.isSafeInteger(page.remaining)&&page.remaining>=0&&previousRemaining!==0;
    if(!validPage)paginationComplete=false;
    expectedAfterRow=page.nextRow;previousRemaining=page.remaining;
    pageCoverage.push(page.coverage??{});
    for(const source of page.sources){
      const line=source.line,received=millis(source.receivedAt);
      if(!BUSINESSES.fumigacion.phones.includes(line)){excluded.foreignLine++;continue;}
      if(!Number.isFinite(received)||received<window.fromMs||received>=window.toMs||received>now){excluded.outsideDay++;continue;}
      if(source.identity==='GROUP'||source.group===true){excluded.groups++;continue;}
      if(source.systemMessage===true){excluded.systemMessages++;continue;}
      if(source.fromMe!==false){excluded.ownOutgoing++;continue;}
      if(source.phone&&knownInternalRecipient(source.phone)){excluded.knownInternal++;continue;}
      if(source.identity!=='PN'||source.bindingVerified!==true||!pn.test(source.phone??'')){excluded.unverifiedPhone++;pending.push({sourceId:safeId(source.sourceId),line,identity:source.identity??'UNKNOWN_ADDRESS',receivedAt:new Date(received).toISOString(),deletionObserved:(source.observations??[]).some(o=>o.operation==='delete')});continue;}
      if(!sourceId.test(source.sourceId??'')){excluded.invalid++;continue;}
      const key=line+':'+source.sourceId,previous=sources.get(key);
      if(conflicted.has(key)||previous&&previous.phone!==source.phone){excluded.unverifiedPhone++;sources.delete(key);conflicted.add(key);pending.push({sourceId:source.sourceId,line,identity:'PN_CONFLICT',receivedAt:new Date(received).toISOString(),deletionObserved:false});continue;}
      const observations=unique([...(previous?.observations??[]),...(source.observations??[])].map(o=>JSON.stringify(o))).map(o=>JSON.parse(o));
      sources.set(key,{...source,receivedAt:received,observations});
    }
    for(const item of page.pendingIdentitySources??[]){
      if(!BUSINESSES.fumigacion.phones.includes(item.line))continue;
      const received=millis(item.receivedAt);if(Number.isFinite(received)&&received>=window.fromMs&&received<window.toMs&&received<=now)pending.push({sourceId:safeId(item.sourceId),line:item.line,identity:item.identity??'UNKNOWN_ADDRESS',receivedAt:new Date(received).toISOString(),deletionObserved:(item.observations??[]).some(o=>o.operation==='delete')});
    }
    for(const item of page.unlinkedObservations??[]){
      const received=millis(item.receivedAt);if(item.operation==='delete'&&BUSINESSES.fumigacion.phones.includes(item.line)&&Number.isFinite(received)&&received>=window.fromMs&&received<window.toMs&&received<=now)unlinkedDeletions.push({sourceId:safeId(item.sourceId),line:item.line,receivedAt:new Date(received).toISOString(),contactAttributed:false});
    }
    // A deletion received today can refer to an original received yesterday.
    // Keep the original identity without counting it as today's new intake.
    for(const source of page.linkedPriorDaySources??[]){
      const received=millis(source.receivedAt),line=source.line;
      if(!BUSINESSES.fumigacion.phones.includes(line)||!sourceId.test(source.sourceId??'')||!Number.isFinite(received)||received>=window.fromMs||source.fromMe!==false||source.systemMessage===true||source.identity==='GROUP'||source.group===true||knownInternalRecipient(source.phone))continue;
      const observations=(source.observations??[]).filter(o=>o.operation==='delete'&&Number.isFinite(millis(o.receivedAt))&&millis(o.receivedAt)>=window.fromMs&&millis(o.receivedAt)<window.toMs&&millis(o.receivedAt)<=now);
      if(!observations.length)continue;
      const phone=source.identity==='PN'&&source.bindingVerified===true&&pn.test(source.phone??'')?source.phone:null,key=line+':'+source.sourceId,old=priorDayDeletions.get(key);
      const times=unique([...(old?.deletionReceivedAt??[]),...observations.map(o=>new Date(millis(o.receivedAt)).toISOString())]).sort();
      priorDayDeletions.set(key,{sourceId:source.sourceId,line,phone:old&&(old.phone!==phone||old.identityConflict)?null:phone,identityVerified:old&&(old.phone!==phone||old.identityConflict)?false:phone!==null,identityConflict:old?.identityConflict===true||!!old&&old.phone!==phone,originalReceivedAt:new Date(received).toISOString(),deletionReceivedAt:times,contactCountedInToday:false,absenceIsDeletionProof:false});
    }
  }
  paginationComplete=paginationComplete&&previousRemaining===0;
  const suspended=unique(pageCoverage.flatMap(c=>c.suspendedLines??c.operationalCoverage?.suspendedLines??[])).filter(p=>BUSINESSES.fumigacion.phones.includes(p));
  const starts=pageCoverage.map(c=>millis(c.journalStartedAt)).filter(Number.isFinite);
  return {sources:[...sources.values()],pending:unique(pending.map(p=>JSON.stringify(p))).map(p=>JSON.parse(p)),unlinkedDeletions:unique(unlinkedDeletions.map(p=>JSON.stringify(p))).map(p=>JSON.parse(p)),priorDayDeletions:[...priorDayDeletions.values()],excluded,
    coverage:{paginationComplete,journalOnly:true,totalWhatsAppVerified:false,originalMediaRead:false,suspendedLines:suspended,
      journalStartedAt:starts.length?new Date(Math.min(...starts)).toISOString():null,
      wholeDayReceiptCoverage:paginationComplete&&starts.length===pages.length&&Math.max(...starts)<=window.fromMs,
      fullBothLineCoverage:false}};
}

function ownProgram(snapshot,day,window){
  if(snapshot==null)return {available:false,orders:[],technicians:[],deletions:[],coverage:{ordersComplete:false,techniciansComplete:false,auditsComplete:false,hardDeletesCovered:false,contactSearchComplete:false}};
  if(snapshot.company!=='FUMIGACION'||snapshot.tenantId!==MARIA_TENANT||snapshot.companyId!==MARIA_COMPANY||snapshot.day!==day||snapshot.readOnly!==true||millis(snapshot.from)!==window.fromMs||millis(snapshot.to??snapshot.toExclusive)!==window.toMs)throw Error('OWN_PROGRAM_DAILY_SNAPSHOT_SCOPE_REQUIRED');
  if(!Array.isArray(snapshot.orders)||!Array.isArray(snapshot.technicians)||!Array.isArray(snapshot.deletions))throw Error('OWN_PROGRAM_DAILY_SNAPSHOT_REQUIRED');
  return {...snapshot,available:true,coverage:{...snapshot.coverage,ordersComplete:snapshot.coverage?.ordersComplete===true,techniciansComplete:snapshot.coverage?.techniciansComplete===true,auditsComplete:snapshot.coverage?.auditsComplete===true,hardDeletesCovered:snapshot.coverage?.hardDeletesCovered===true,contactSearchComplete:snapshot.coverage?.contactSearchComplete===true}};
}

function programMatches(program,phone){
  const matches=[],ambiguous=[];
  for(const order of program.orders){
    if(!safeId(order.id))continue;
    const contacts=order.canonicalContacts;
    if(!Array.isArray(contacts)||!contacts.includes(phone))continue;
    if(order.contactScopeVerified!==true||contacts.some(p=>!pn.test(p))){ambiguous.push(order.id);continue;}
    matches.push({id:order.id,createdById:safeId(order.createdById),technicianId:safeId(order.technicianId),state:safeLabel(order.state),scheduledAt:Number.isFinite(millis(order.scheduledAt))?new Date(millis(order.scheduledAt)).toISOString():null,actualFinishedAt:Number.isFinite(millis(order.actualFinishedAt))?new Date(millis(order.actualFinishedAt)).toISOString():null,cancelled:order.classification?.cancelled===true,deletedAt:Number.isFinite(millis(order.deletedAt))?new Date(millis(order.deletedAt)).toISOString():null,serviceKind:safeLabel(order.serviceKind??order.registrationKind)||'UNVERIFIED'});
  }
  const search=(program.searchedContacts??[]).filter(s=>s.phone===phone&&s.complete===true);
  const searchIdentityAmbiguous=search.some(s=>s.identityAmbiguous===true),fullSearch=program.coverage?.contactSearchComplete===true&&search.length===1&&search[0].identityAmbiguous!==true&&Array.isArray(search[0].orderIds)&&search[0].orderIds.every(safeId);
  let comparison='UNVERIFIED_PROGRAM_SEARCH';
  if(matches.length)comparison='MATCHED_PROGRAM_METADATA';
  else if(ambiguous.length||searchIdentityAmbiguous)comparison='AMBIGUOUS_PROGRAM_IDENTITY';
  else if(fullSearch&&search[0].orderIds.length===0)comparison='NO_RECORD_AFTER_COMPLETE_CONTACT_SEARCH';
  else if(program.available)comparison='NOT_LOCATED_IN_DAILY_SNAPSHOT';
  return {comparison,matches,ambiguousOrderIds:ambiguous,searchIdentityAmbiguous,completeContactSearch:fullSearch,missingServiceVerified:false,newSaleInferred:false};
}

function technicianProgress(program,window,dayComplete,target,now){
  const rows=program.technicians.filter(t=>safeId(t.id)),seen=new Set(),technicians=[];let inconsistent=false;
  const orderEvidence=new Map();
  for(const order of program.orders){if(!safeId(order.id))continue;const previous=orderEvidence.get(order.id),evidence=JSON.stringify(order);if(previous&&previous!==evidence)inconsistent=true;else orderEvidence.set(order.id,evidence);}
  for(const row of rows){
    if(seen.has(row.id)){inconsistent=true;continue;}seen.add(row.id);
    const ownOrders=program.orders.filter(o=>o.technicianId===row.id&&safeId(o.id)),active=ownOrders.filter(o=>o.classification?.cancelled!==true&&o.deletedAt==null),scheduled=active.filter(o=>o.classification?.scheduledInDay===true&&millis(o.scheduledAt)>=window.fromMs&&millis(o.scheduledAt)<window.toMs),completed=active.filter(o=>o.classification?.completedInDay===true&&millis(o.actualFinishedAt)>=window.fromMs&&millis(o.actualFinishedAt)<window.toMs&&millis(o.actualFinishedAt)<=now);
    if(active.some(o=>o.classification?.completedInDay===true&&millis(o.actualFinishedAt)>now))inconsistent=true;
    const scheduledCount=unique(scheduled.map(o=>o.id)).length,completedCount=unique(completed.map(o=>o.id)).length;
    if(Number.isSafeInteger(row.scheduledServices)&&row.scheduledServices!==scheduledCount||Number.isSafeInteger(row.completedServices)&&row.completedServices!==completedCount)inconsistent=true;
    technicians.push({id:row.id,name:safeLabel(row.displayName)||'Técnico sin nombre verificado',scheduledInProgram:scheduledCount,completedInProgram:completedCount,scheduledOrderIds:unique(scheduled.map(o=>o.id)),completedOrderIds:unique(completed.map(o=>o.id)),remainingScheduledToTarget:Math.max(0,target.servicesPerTechnician-scheduledCount),remainingCompletedToTarget:Math.max(0,target.servicesPerTechnician-completedCount),actualExecutionIndependentlyVerified:false});
  }
  const snapshotAt=millis(program.checkedAt),snapshotThroughDayEnd=Number.isFinite(snapshotAt)&&snapshotAt>=window.toMs&&snapshotAt<=now;
  const unknownCompletion=program.orders.some(o=>o.classification?.completionDateUnknown===true),historicalRosterUnverified=program.coverage.historicalTechnicianRosterVerified!==true&&new Date(now).toLocaleDateString('sv-SE',{timeZone:'America/Bogota'})!==window.day,complete=program.available&&program.coverage.ordersComplete&&program.coverage.techniciansComplete&&dayComplete&&snapshotThroughDayEnd&&!inconsistent&&!historicalRosterUnverified;
  const scheduledMet=technicians.filter(t=>t.scheduledInProgram>=target.servicesPerTechnician).length,completedMet=technicians.filter(t=>t.completedInProgram>=target.servicesPerTechnician).length;
  const status=(n,complete)=>complete?(n>=target.minimumTechnicians?'MET_IN_PROGRAM_RECORDS':'BELOW_TARGET_IN_PROGRAM_RECORDS'):'UNKNOWN';
  return {target,technicians,technicianCoverageComplete:complete,snapshotThroughDayEnd,countsInconsistent:inconsistent,historicalRosterUnverified,completionDateUnknown:unknownCompletion,scheduledTechniciansMeetingTarget:scheduledMet,completedTechniciansMeetingTarget:completedMet,scheduledStatus:status(scheduledMet,complete),completedStatus:status(completedMet,complete&&!unknownCompletion),scheduledOrders:unique(technicians.flatMap(t=>t.scheduledOrderIds)).length,completedOrders:unique(technicians.flatMap(t=>t.completedOrderIds)).length,paymentOrBankVerified:false,actualExecutionIndependentlyVerified:false};
}

/** Pure comparison only. Journal entries retain their native identity and receipt
 * day. A daily order snapshot is not a complete contact-history search, and a
 * matching chat is never authority to create, charge, cancel or delete an order. */
export function evaluateDailyOperationalAudit({company='fumigacion',day,journalPages,programSnapshot=null,now=Date.now(),target=FUMIGACION_DAILY_TARGET}){
  if(company!=='fumigacion')throw Error('DAILY_FUMIGACION_SCOPE_REQUIRED');
  if(!Number.isFinite(now))throw Error('DAILY_AUDIT_TIME_REQUIRED');
  if(target?.minimumTechnicians!==6||target?.servicesPerTechnician!==5||target?.totalServices!==30||typeof target.authorizationSource!=='string')throw Error('AUTHORIZED_DAILY_TARGET_REQUIRED');
  const window=bogotaDayWindow(day);if(now<window.fromMs)throw Error('FUTURE_DAILY_AUDIT_NOT_ALLOWED');
  const journal=journalSources(journalPages,day,window,now),program=ownProgram(programSnapshot,day,window),contactsMap=new Map();
  for(const source of journal.sources){
    if(!contactsMap.has(source.phone))contactsMap.set(source.phone,{phone:source.phone,sources:[]});contactsMap.get(source.phone).sources.push(source);
  }
  const contacts=[...contactsMap.values()].sort((a,b)=>a.phone.localeCompare(b.phone)).map(c=>{
    c.sources.sort((a,b)=>a.receivedAt-b.receivedAt||a.sourceId.localeCompare(b.sourceId));
    const deletions=c.sources.filter(s=>(s.observations??[]).some(o=>o.operation==='delete'&&Number.isFinite(millis(o.receivedAt))&&millis(o.receivedAt)>=window.fromMs&&millis(o.receivedAt)<window.toMs&&millis(o.receivedAt)<=now));
    const last=c.sources.at(-1),matched=programMatches(program,c.phone),linkedOrderIds=new Set(matched.matches.map(o=>o.id));
    const programDeletions=program.deletions.filter(d=>linkedOrderIds.has(d.orderId)&&d.source==='order-soft-delete'&&Number.isFinite(millis(d.deletedAt)));
    return {phone:c.phone,lines:unique(c.sources.map(s=>s.line)).sort(),incomingMessages:c.sources.length,sourceIds:c.sources.map(s=>s.sourceId),firstReceivedAt:new Date(c.sources[0].receivedAt).toISOString(),lastReceivedAt:new Date(last.receivedAt).toISOString(),lastProviderAt:Number.isFinite(millis(last.providerAt))?new Date(millis(last.providerAt)).toISOString():null,lastMessageKind:safeLabel(last.kind)||'unknown',
      perLine:BUSINESSES.fumigacion.phones.filter(line=>c.sources.some(s=>s.line===line)).map(line=>({line,incomingMessages:c.sources.filter(s=>s.line===line).length})),
      whatsappDeletionObserved:deletions.length>0,whatsappDeletedSourceIds:deletions.map(s=>s.sourceId),absenceIsDeletionProof:false,
      programDeletionObserved:programDeletions.length>0,programDeletedOrderIds:unique(programDeletions.map(d=>d.orderId)),unverifiedDeletionMetadata:c.sources.filter(s=>s.deleted===true&&!deletions.includes(s)).length,
      ...matched,customerIntentVerified:false,serviceAcceptanceVerified:false,storedTrafficIsNewSale:false};
  });
  const dayComplete=now>=window.toMs,progress=technicianProgress(program,window,dayComplete,target,now);
  const linkedDeletedIds=new Set(contacts.flatMap(c=>c.programDeletedOrderIds)),unlinkedProgramDeletions=program.deletions.filter(d=>!linkedDeletedIds.has(d.orderId));
  const result={guard:DAILY_OPERATIONAL_AUDIT_GUARD,company:'FUMIGACION',day,timeZone:'America/Bogota',from:window.from,to:window.to,checkedAt:new Date(now).toISOString(),dayComplete,recipient:SANDRA,
    dedupKey:'daily-endday-fumigacion-'+day.replace(/-/g,'')+'-sandra-v1',contacts,contactsCount:contacts.length,
    incomingMessages:contacts.reduce((n,c)=>n+c.incomingMessages,0),lines:BUSINESSES.fumigacion.phones.map(line=>({line,incomingContactCount:contacts.filter(c=>c.lines.includes(line)).length,incomingMessageCount:contacts.reduce((n,c)=>n+(c.perLine.find(p=>p.line===line)?.incomingMessages??0),0),suspended:journal.coverage.suspendedLines.includes(line)})),
    pendingIdentitySources:journal.pending,pendingIdentityCount:journal.pending.length,unlinkedWhatsAppDeletions:journal.unlinkedDeletions,priorDayWhatsAppDeletions:journal.priorDayDeletions,excluded:journal.excluded,coverage:{...journal.coverage,programAvailable:program.available,program:program.coverage,dayComplete},technicianProgress:progress,
    unlinkedProgramDeletions:unlinkedProgramDeletions.map(d=>({orderId:safeId(d.orderId),deletedAt:Number.isFinite(millis(d.deletedAt))?new Date(millis(d.deletedAt)).toISOString():null,source:safeLabel(d.source)})),
    readOnly:true,businessWrites:0,sends:0,paymentsInferred:false,unmatchedContactsAreMissingServices:false};
  result.reportText=dailyOperationalReportText(result);return result;
}

export function dailyOperationalReportText(audit){
  if(audit?.guard!==DAILY_OPERATIONAL_AUDIT_GUARD||audit.company!=='FUMIGACION'||audit.recipient!==SANDRA)throw Error('OWN_DAILY_AUDIT_REPORT_REQUIRED');
  const parts=['Sandra, revisión de Fumigación del '+audit.day+' (Colombia).'+(audit.dayComplete?'':' Corte provisional.'),
    'Contactos privados entrantes observados: '+audit.contactsCount+'; mensajes: '+audit.incomingMessages+'.'];
  for(const line of audit.lines)parts.push('Línea '+line.line+': '+line.incomingContactCount+' contactos, '+line.incomingMessageCount+' mensajes.'+(line.suspended?' Línea suspendida; cobertura parcial.':''));
  parts.push('El conteo del registro recibido es parcial frente al historial completo de WhatsApp. No representa clientes nuevos ni servicios aceptados.');
  if(audit.pendingIdentityCount)parts.push('Fuentes sin teléfono inequívoco: '+audit.pendingIdentityCount+'; no se atribuyen a clientes.');
  for(const contact of audit.contacts){
    const orders=contact.matches.map(o=>o.id).join(', ')||'sin coincidencia en la consulta disponible',deletion=contact.whatsappDeletionObserved?'eliminación de mensaje observada':'sin eliminación de mensaje observada';
    let comparison=contact.comparison==='NO_RECORD_AFTER_COMPLETE_CONTACT_SEARCH'?'sin registro tras búsqueda completa por teléfono':contact.comparison==='AMBIGUOUS_PROGRAM_IDENTITY'?'identidad ambigua en el programa':contact.comparison==='MATCHED_PROGRAM_METADATA'?'órdenes '+orders:contact.comparison==='NOT_LOCATED_IN_DAILY_SNAPSHOT'?'sin coincidencia en el listado diario; búsqueda histórica pendiente':'cruce con programa pendiente';
    parts.push(contact.phone+' | líneas '+contact.lines.join('/')+' | '+contact.incomingMessages+' mensajes | último recibido '+bogotaTime(Date.parse(contact.lastReceivedAt))+' | '+comparison+' | '+deletion+(contact.programDeletionObserved?'; eliminación de orden observada: '+contact.programDeletedOrderIds.join(', '):'')+'.');
  }
  if(audit.unlinkedProgramDeletions.length)parts.push('Eliminaciones de orden observadas sin contacto vinculado inequívocamente: '+audit.unlinkedProgramDeletions.length+'.');
  if(audit.unlinkedWhatsAppDeletions.length)parts.push('Observaciones de eliminación de WhatsApp sin mensaje original vinculado: '+audit.unlinkedWhatsAppDeletions.length+'.');
  if(audit.priorDayWhatsAppDeletions.length){
    parts.push('Eliminaciones recibidas hoy de mensajes de días anteriores; no se cuentan como entradas nuevas de hoy:');
    for(const deletion of audit.priorDayWhatsAppDeletions)parts.push((deletion.identityVerified?deletion.phone:'teléfono sin vínculo inequívoco')+' | línea '+deletion.line+' | original recibido '+bogotaTime(Date.parse(deletion.originalReceivedAt))+' | eliminación recibida '+deletion.deletionReceivedAt.map(t=>bogotaTime(Date.parse(t))).join(', ')+'.');
  }
  parts.push('La ausencia de mensajes u órdenes no demuestra eliminación ni un servicio omitido.');
  const progress=audit.technicianProgress;parts.push('Meta solicitada: 6 técnicos con 5 servicios cada uno (30).');
  for(const technician of progress.technicians)parts.push(technician.name+': '+technician.scheduledInProgram+' programados y '+technician.completedInProgram+' realizados según los registros fechados del programa.');
  parts.push(progress.scheduledStatus==='UNKNOWN'?'Meta de programación: cobertura pendiente.':'Meta de programación: '+(progress.scheduledStatus==='MET_IN_PROGRAM_RECORDS'?'alcanzada en registros.':'aún no alcanzada en registros.'));
  parts.push(progress.completedStatus==='UNKNOWN'?'Meta de realización: cobertura o fechas pendientes.':'Meta de realización: '+(progress.completedStatus==='MET_IN_PROGRAM_RECORDS'?'alcanzada en registros.':'aún no alcanzada en registros.'));
  parts.push('Los estados del programa no confirman por sí solos ejecución real, recaudo bancario o responsabilidad de una persona.','María Ángel');
  return parts.join('\n');
}
