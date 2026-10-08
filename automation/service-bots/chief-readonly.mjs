import {BUSINESSES,SANDRA,normalize} from './config.mjs';

export const CHIEF_READ_ONLY_GUARD='own-whatsapp-call-observations-without-native-total-v1';

// The engine verifies the directed Sandra turn. This parser recognizes only a
// complete read request; extra destinations, other periods and commands fail.
export function chiefReadOnlyTopic(body){
 if(typeof body!=='string'||body.length>6000)return null;
 const text=normalize(body).replace(/\s+/g,' ').replace(/^[¿¡]+|[?!.]+$/g,'').trim();
 const prefix='(?:(?:necesito|quiero) (?:que me digas|saber)|dime|me dices|puedes decirme|me puedes decir|podrias decirme|me gustaria saber)';
 const quantity='(?:cuantas llamadas|(?:el )?(?:numero|conteo|cantidad) de llamadas)';
 const direction='(?:entrado|salido|entrantes|salientes|recibidas|realizadas)';
 const activity='(?:han (?:entrado|salido)(?: y (?:entrado|salido))?|'+direction+'(?: y '+direction+')?(?: (?:hay|hubo|tienes|se han registrado))?|se han (?:recibido|realizado|registrado)|has (?:recibido|realizado)(?: y (?:recibido|realizado))?|hay|hubo|tienes)';
 const scope='(?:de|en|por) (?:(?:(?:las (?:dos|2)|ambas|tus dos|mis dos) lineas)(?: de whatsapp)?|las lineas de whatsapp|whatsapp)';
 const request=new RegExp('^(?:por favor[ ,]+)?(?:'+prefix+' )?'+quantity+'(?: '+activity+')?(?: hoy)? '+scope+'(?: hoy)?(?:[, ]+por favor)?$');
 return request.test(text)?'whatsapp-call-records':null;
}

function ownLines(store,config){
 const business=BUSINESSES[store.company],lines=config.lines?.map(line=>line.phone);
 if(!business||config.company!==store.company||lines?.length!==2||new Set(lines).size!==2||lines.some(phone=>!business.phones.includes(phone)))throw Error('CHIEF_READ_ONLY_DATABASE_SCOPE_REQUIRED');
 return lines;
}

export function whatsAppCallActivity(store,config,now=Date.now()){
 if(!Number.isFinite(now))throw Error('CHIEF_READ_ONLY_TIME_REQUIRED');
 const phones=ownLines(store,config),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),from=Date.parse(date+'T05:00:00Z');
 const rows=store.db.prepare('SELECT e.id,e.line,e.body,s.line AS source_line FROM events e LEFT JOIN event_sources s ON s.event_id=e.id WHERE e.at>=? AND e.at<=?').all(from,now);
 const total=new Set(),perLine=new Map(phones.map(phone=>[phone,new Set()])),unread=new Set();
 for(const row of rows){
  // A source attached to a foreign primary line cannot transfer its scope.
  if(!perLine.has(row.line))continue;
  let event;try{event=store.open(row.body);}catch{unread.add(row.id);continue;}
  if(event?.id!==row.id||event?.line!==row.line){unread.add(row.id);continue;}
  if(event.kind!=='call')continue;
  total.add(row.id);perLine.get(row.line).add(row.id);
  if(perLine.has(row.source_line))perLine.get(row.source_line).add(row.id);
 }
 const lines=phones.map(phone=>({phone,observedCallRecords:perLine.get(phone).size})),lineObservations=lines.reduce((sum,line)=>sum+line.observedCallRecords,0);
 return {guard:CHIEF_READ_ONLY_GUARD,company:store.company,checkedAt:new Date(now).toISOString(),scope:'today-America/Bogota',date,from:new Date(from).toISOString(),to:new Date(now).toISOString(),coverage:'partial-stored-event-observations',observedCallRecords:total.size,lines,duplicateLineObservations:lineObservations-total.size,unreadStoredRecords:unread.size,nativeCallIdentifiersVerified:false,inboundOutboundVerified:false,answeredCallsVerified:false,durationVerified:false,totalCallsVerified:false,fromMeDirectionUsed:false};
}

export function chiefReadOnlyReply(store,config,phone,topic,text,now=Date.now()){
 if(phone!==SANDRA||topic!=='whatsapp-call-records'||chiefReadOnlyTopic(text)!==topic)return null;
 const activity=whatsAppCallActivity(store,config,now),ends=activity.lines.map(line=>line.phone.slice(-4));
 if(!activity.observedCallRecords)return 'Sandra, hoy no tengo historial de llamadas suficiente para confirmar los totales de mis dos líneas ('+ends.join(' y ')+'). No puedo afirmar que hayan sido cero ni separar entrantes y salientes, llamadas contestadas o duración.';
 const perLine=activity.lines.map(line=>'línea '+line.phone.slice(-4)+': '+line.observedCallRecords).join('; ');
 let reply='Sandra, hoy tengo '+activity.observedCallRecords+' registros de llamadas observados ('+perLine+').';
 if(activity.duplicateLineObservations)reply+=' Los registros que aparecen en ambas líneas se cuentan una sola vez en el total.';
 return reply+' El historial es parcial: no confirma el total real ni permite separar entrantes y salientes, saber cuántas fueron contestadas o su duración.';
}
