// A derived display never replaces either original native customer message.
// No I/O, clock substitution, availability, technician or duration inference.
import {mariaRequestedTiming} from './maria-requested-timing.mjs';

export const MARIA_PREFERENCE_PARTS_GUARD='own-client-requested-date-and-time-native-parts-v1';
const SCHEDULE_GUARD='own-confirmed-client-time-without-technician-v1';
const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const uncertain=/[?¿"“”«»<>]|https?:|www\.|\b(?:no|nunca|tampoco|quizas|tal vez|si|cuando|entre|hasta|antes|despues|desde|semana|dijo|dice|dijeron|segun|tercero|vecin[oa]|refuerzo|garantia|reprogram\w*|cancel\w*)\b/;
function ownSource(source){
 if(!source||typeof source.id!=='string'||!/^[-A-Za-z0-9_:.]{1,160}$/.test(source.id)||typeof source.text!=='string'||!source.text.trim()||source.text.length>8000||typeof source.at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(source.at)||!Number.isFinite(Date.parse(source.at))||!/^57\d{10}$/.test(source.phone??'')||!/^57\d{10}$/.test(source.line??'')||source.fromMe!==false||source.forwarded!==false)return false;
 const at=new Date(source.at);
 return at.toISOString().slice(0,19)===source.at.slice(0,19)&&!uncertain.test(normalize(source.text));
}

/** Complete standalone hour, with an explicit meridian or written 24h clock. */
export function nativePreferenceTime(text,sourceAt){
 if(typeof text!=='string'||text.length>8000||uncertain.test(normalize(text)))return null;
 if(sourceAt){const full=mariaRequestedTiming(text,sourceAt);if(full.fechaSolicitada&&full.horaSolicitada)return full.horaSolicitada;}
 let value=normalize(text).replace(/[.!¡,;]+$/g,'').trim();
 value=value.replace(/^(?:(?:la )?hora(?: correcta| solicitada)?|horario)\s*(?::|=|es\b)\s*/,'');
 value=value.replace(/^(?:mejor|mas bien|lo necesito|lo quiero|me sirve|prefiero|que sea)\s+/,'');
 value=value.replace(/^(?:a las?|las?)\s+/,'');
 let match=/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/.exec(value);
 if(match){const h=+match[1],m=+(match[2]??0);if(h<1||h>12||m>59)return null;return String(h%12+(match[3]==='p'?12:0)).padStart(2,'0')+':'+String(m).padStart(2,'0');}
 match=/^(\d{1,2}):(\d{2})(?:\s*(?:h|horas|hrs))?$/.exec(value);
 if(match){if(+match[1]>23||+match[2]>59)return null;return match[1].padStart(2,'0')+':'+match[2];}
 match=/^(\d{1,2})\s*(?:h|horas|hrs)$/.exec(value);
 return match&&+match[1]<=23?match[1].padStart(2,'0')+':00':null;
}

export function nativePreferenceDate(text,sourceAt){
 if(typeof text!=='string'||uncertain.test(normalize(text)))return null;
 const value=normalize(text);
 if(/\b(?:en|por|de) la (?:manana|tarde|noche|madrugada)\b/.test(value))return null;
 const parsed=mariaRequestedTiming(text,sourceAt);
 if((/\b(?:a las?|las?)\s+\d|\b\d{1,2}:\d{2}|\b\d{1,2}\s*[ap]\.?\s*m\b/.test(value))&&!parsed.horaSolicitada)return null;
 return parsed.fechaSolicitada?parsed.fechaSolicitada.toISOString().slice(0,10):null;
}

export function projectNativePreferenceParts(parts,acceptedAt){
 const failure={complete:false,missing:'parts'};
 if(parts?.guard!==MARIA_PREFERENCE_PARTS_GUARD||!ownSource(parts.date)||!ownSource(parts.time)||parts.date.id===parts.time.id||parts.date.phone!==parts.time.phone||parts.date.line!==parts.time.line)return failure;
 const requestedDate=nativePreferenceDate(parts.date.text,parts.date.at),requestedTime=nativePreferenceTime(parts.time.text,parts.time.at);
 if(!requestedDate)return {complete:false,missing:'date'};
 if(!requestedTime)return {complete:false,missing:'time'};
 if(mariaRequestedTiming(parts.date.text,parts.date.at).horaSolicitada&&Date.parse(parts.time.at)<Date.parse(parts.date.at))return failure;
 if(mariaRequestedTiming(parts.time.text,parts.time.at).fechaSolicitada&&Date.parse(parts.date.at)<Date.parse(parts.time.at))return failure;
 const accepted=Date.parse(acceptedAt??'');
 const visitAt=requestedDate+'T05:00:00.000Z',startAt=new Date(requestedDate+'T'+requestedTime+':00.000-05:00').toISOString();
 if(!Number.isFinite(accepted)||Date.parse(parts.date.at)>accepted||Date.parse(parts.time.at)>accepted||Date.parse(startAt)<accepted)return {complete:false,missing:'future-time'};
 const [year,month,day]=requestedDate.split('-'),[hour,minute]=requestedTime.split(':');
 const preferenceLiteral=day+'/'+month+'/'+year+' a las '+((+hour%12)||12)+':'+minute+' '+(+hour<12?'a. m.':'p. m.');
 return {complete:true,guard:SCHEDULE_GUARD,requestedDate,requestedTime,visitAt,startAt,endAt:null,technicianId:null,preferenceLiteral,
  preferenceParts:{guard:MARIA_PREFERENCE_PARTS_GUARD,date:{id:parts.date.id,at:parts.date.at},time:{id:parts.time.id,at:parts.time.at}}};
}
