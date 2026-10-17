import {mariaRequestedTiming} from './maria-requested-timing.mjs';

export const MARIA_CLIENT_SCHEDULE_GUARD='own-confirmed-client-time-without-technician-v1';
export function clientRequestedScheduleConfig(env,company,activatedAt){
 const enabled=env.BOT_MARIA_CLIENT_REQUESTED_SCHEDULE_ENABLED;
 if(enabled===undefined||enabled==='false')return {enabled:false};
 const value=env.BOT_MARIA_CLIENT_REQUESTED_SCHEDULE_STARTS_AT,startsAt=Date.parse(value||'');
 if(enabled!=='true'||company!=='fumigacion'||!Number.isSafeInteger(startsAt)||!Number.isSafeInteger(activatedAt)||startsAt<activatedAt||!value?.endsWith('Z'))throw Error('OWN_CLIENT_REQUESTED_SCHEDULE_CONFIGURATION_REQUIRED');
 return Object.freeze({enabled:true,startsAt,guard:MARIA_CLIENT_SCHEDULE_GUARD});
}
export function clientRequestedScheduleEnabled(c,caseAt){
 return c.company==='fumigacion'&&c.clientRequestedSchedule?.enabled===true&&c.clientRequestedSchedule.guard===MARIA_CLIENT_SCHEDULE_GUARD&&Number.isSafeInteger(c.clientRequestedSchedule.startsAt)&&Number.isSafeInteger(caseAt)&&caseAt>=c.clientRequestedSchedule.startsAt&&c.staffPlanning?.enabled===true&&c.staffPlanning.mode==='internal-staff-assignment';
}
export function projectClientRequestedSchedule(preference,sourceAt,acceptedAt=sourceAt){
 const timing=mariaRequestedTiming(preference,sourceAt);
 if(!timing.fechaSolicitada)return {complete:false,missing:'date',literal:preference};
 const requestedDate=timing.fechaSolicitada.toISOString().slice(0,10);
 if(!timing.horaSolicitada)return {complete:false,missing:'time',literal:preference,requestedDate};
 const visitAt=new Date(requestedDate+'T00:00:00-05:00').toISOString(),startAt=new Date(requestedDate+'T'+timing.horaSolicitada+':00-05:00').toISOString();
 if(!Number.isFinite(Date.parse(acceptedAt))||Date.parse(startAt)<Date.parse(acceptedAt))return {complete:false,missing:'future-time',literal:preference};
 return {complete:true,guard:MARIA_CLIENT_SCHEDULE_GUARD,requestedDate,requestedTime:timing.horaSolicitada,visitAt,startAt,endAt:null,technicianId:null,preferenceLiteral:preference};
}
export function clientRequestedScheduleReceiptMatches(payload,receipt){
 if(payload.clientSchedule?.guard!==MARIA_CLIENT_SCHEDULE_GUARD)return false;
 const ref=payload.sources?.preference,projection=ref&&projectClientRequestedSchedule(payload.slots?.preference,ref.at,payload.sources?.acceptance?.at),schedule=receipt?.schedule;
 if(!projection?.complete||receipt.state!=='PROGRAMADO'||receipt.scheduled!==true||receipt.schedulingKind!=='client-requested-without-technician'||!schedule||schedule.verifiedCurrentFields!==true)return false;
 return ['guard','requestedDate','requestedTime','visitAt','startAt','endAt','technicianId','preferenceLiteral'].every(key=>schedule[key]===projection[key])&&schedule.preferenceSourceId===ref.id&&schedule.preferenceSourceAt===ref.at&&schedule.acceptanceId===payload.quote.acceptanceId&&schedule.summaryMid===payload.summaryConfirmation?.mid;
}
