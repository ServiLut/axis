import type {Prisma} from '@/prisma/generated/prisma/client';
import {createAuditLog} from './audit';
import {phoneDigits,SANDRA_PHONE,PSYCHOLOGY_PHONE,type ReceptionEvent} from './psychology-reception';
import type {Understanding} from './psychology-ai';
type Tx=Prisma.TransactionClient;
type Queue=(tx:Tx,id:string,phone:string,content:string)=>Promise<void>;

/** Interpretation proposes an action. Identity and permitted operations are enforced here. */
export function chiefAction(event:ReceptionEvent,u:Understanding){
 if(event.fromMe||event.phone!==SANDRA_PHONE||u.intent!=='admin'||u.confidence<0.9)return null;
 const phone=u.targetPhone?phoneDigits(u.targetPhone):null;
 if(u.adminAction==='status')return {type:'command',text:'ESTADO BOT'} as const;
 if(['pause','resume'].includes(u.adminAction||'')&&phone&&![SANDRA_PHONE,PSYCHOLOGY_PHONE].includes(phone))return {type:'command',text:`${u.adminAction==='pause'?'PAUSAR':'REANUDAR'} ${phone}`} as const;
 const text=event.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(u.adminAction==='reactivate'||(/(?:seis|6) meses/.test(text)&&/clientes|pacientes/.test(text)&&/escrib|mensaje|reactiva/.test(text)))return {type:'reactivate'} as const;
 if(u.adminAction==='learn'&&u.instruction?.trim())return {type:'learn',instruction:u.instruction.trim()} as const;
 // Do not turn an inferred paraphrase into an outbound message on behalf of the chief.
 if(u.adminAction==='send'&&phone&&phone!==PSYCHOLOGY_PHONE&&u.instruction?.trim()&&event.text.includes(u.instruction.trim()))return {type:'send',phone,text:u.instruction.trim()} as const;
 return null;
}

export async function handleChiefUnderstanding(tx:Tx,e:ReceptionEvent,u:Understanding|null,queue:Queue,command:(tx:Tx,e:ReceptionEvent)=>Promise<void>){
 if(e.fromMe||e.phone!==SANDRA_PHONE)return false;
 const ack=(message:string)=>queue(tx,e.id+':chief-result',SANDRA_PHONE,message);
 const normalized=e.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if((!u?.adminAction||u.adminAction==='none')&&/era para otra persona|mensaje equivocado|me confundi/.test(normalized)){
  await ack('Entendido, Sandra 😊 Gracias por aclararlo. Ese mensaje no lo aplicaré a Psicólogos en Colombia.');return true;
 }
 if(/fumigaci|control de plagas|reparacion de electrodomesticos/.test(normalized)){
  await ack('Sandra, este canal corresponde a *Psicólogos en Colombia*. La instrucción menciona otro negocio, así que no inicié esa tarea. ¿Querías enviarla a otro equipo?');return true;
 }
 const stateRows=await tx.$queryRaw<{state:{reactivationTask?:ReactivationTask}}[]>`SELECT state FROM "PsicologiaBotConversation" WHERE phone=${SANDRA_PHONE}`;
 const pending=stateRows[0]?.state.reactivationTask;
 if(/explicate|no entendi|no entiendo (la|tu) pregunta/.test(normalized)){
  if(pending?.status==='NEEDS_CRITERION')await ack('Me refiero a cómo elegir los clientes: ¿miramos la fecha de su última cita en Axis o la fecha de la última conversación en WhatsApp? Son datos distintos.');
  else{
   const prior=await tx.$queryRaw<{text:string}[]>`SELECT COALESCE(transcript,text) AS text FROM "PsicologiaBotEvent" WHERE phone=${SANDRA_PHONE} AND "fromMe"=false AND id<>${e.id} AND "eventAt"<=${new Date(e.at)} ORDER BY "eventAt" DESC LIMIT 3`;
   await ack(prior.some(p=>/fumigaci|control de plagas/i.test(p.text))?'Perdón, Sandra. Mi pregunta fue poco clara. El audio anterior hablaba de fumigación y aquí gestiono Psicólogos en Colombia. No inicié esa tarea.':'Perdón, Sandra. Necesito saber qué acción quieres que haga y sobre qué cliente o registro. Si es un envío individual, indícame el número y el mensaje.');
  }return true;
 }
 if(pending&&/(?:cancela|deten|pausa).*(?:campana|reactivacion|envios)/.test(normalized)){
  await saveTask(tx,{...pending,status:'PAUSED'});
  await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED' WHERE status='PENDING' AND id LIKE ${pending.sourceEvent+':reactivate:%'}`;
  await createAuditLog({tenantId:4,accion:'BOT_CAMPAIGN_PAUSED',entidad:'WhatsApp',entidadId:pending.sourceEvent,detalles:{sourceEvent:e.id},tx});
  await ack('Pausé la campaña y cancelé los mensajes que aún estaban en cola.');return true;
 }
 if(pending?.status==='NEEDS_CRITERION'){
  if(/sin (?:tomar |tener )?(?:cita|consulta|terapia)|ultima (?:cita|consulta)|(?:por|segun|las) citas/.test(normalized)){
   await saveTask(tx,{...pending,criterion:'service',status:'ACTIVE'});
   await queue(tx,e.id+':campaign-clarified',SANDRA_PHONE,'Entendido 😊 Usaré la última cita realizada en Axis. Revisaré los contactos habilitados y te informaré el avance.');return true;
  }
  if(/sin (?:hablar|conversar|contacto)|whatsapp/.test(normalized)){
   await saveTask(tx,{...pending,status:'NEEDS_HISTORY'});
   await ack('Para medir seis meses sin hablar necesito un historial completo de WhatsApp; la última cita no demuestra eso. ¿Dónde podemos consultar ese historial? La campaña sigue pendiente.');return true;
  }
 }
 const action=u?chiefAction(e,u):null;
 if(!action){await ack(u?.question?.slice(0,400)||'Sandra, necesito que me aclares la acción y, si aplica, el número de la persona. ¿Qué debo hacer exactamente?');return true;}
 if(action.type==='command'){await command(tx,{...e,text:action.text});return true;}
 if(action.type==='learn'){
  await tx.$executeRaw`INSERT INTO "PsicologiaBotKnowledge" (id,instruction,"sourceEvent","approvedBy") VALUES (${e.id+':knowledge'},${action.instruction},${e.id},${SANDRA_PHONE}) ON CONFLICT DO NOTHING`;
  await createAuditLog({tenantId:4,accion:'BOT_CHIEF_INSTRUCTION',entidad:'PsicologiaBotKnowledge',entidadId:e.id,detalles:{sourceEvent:e.id,actorPhone:SANDRA_PHONE,instruction:action.instruction},tx});
  await ack('Anoté tu instrucción para las próximas conversaciones. Si entra en conflicto con una tarifa, disponibilidad o regla vigente, te pediré aclaración antes de aplicarla.');return true;
 }
 if(action.type==='send'){
  await queue(tx,e.id+':chief-send',action.phone,action.text);
  await createAuditLog({tenantId:4,accion:'BOT_CHIEF_SEND_QUEUED',entidad:'WhatsApp',entidadId:action.phone,detalles:{sourceEvent:e.id,actorPhone:SANDRA_PHONE},tx});
  await ack('Dejé tu mensaje en la cola de envío a +'+action.phone+'. Si el envío falla, quedará pendiente de revisión.');return true;
 }
 const criterion=/sin (?:hablar|conversar)|sin contacto|sin (?:hablar|contactar) con/.test(normalized)?'contact':'service';
 const task:ReactivationTask={sourceEvent:e.id,criterion,daily:/diari|dia siguiente|cada dia|todos los dias/.test(normalized),status:criterion==='contact'?'NEEDS_CRITERION':'ACTIVE',asOf:new Date().toISOString(),lastRunDate:null,candidateIds:null};
 await saveTask(tx,task);
 // A campaign request is an operational task, not a general instruction for every patient.
 await tx.$executeRaw`UPDATE "PsicologiaBotKnowledge" SET active=false WHERE "sourceEvent"=${e.id}`;
 await createAuditLog({tenantId:4,accion:'BOT_CAMPAIGN_REQUEST',entidad:'WhatsApp',entidadId:e.id,detalles:{sourceEvent:e.id,task},tx});
 await queue(tx,e.id+':campaign-request',SANDRA_PHONE,criterion==='contact'?'Entendí la tarea diaria 😊 Antes de empezar: ¿son clientes con seis meses sin cita o sin conversar por WhatsApp? Axis permite comprobar las citas; todavía no tengo todo el historial de WhatsApp.':'Registré la tarea de reactivación 😊 Revisaré clientes con más de seis meses sin cita realizada y te informaré el avance y cualquier dato pendiente.');
 return true;
}

type ReactivationTask={sourceEvent:string;criterion:'contact'|'service';daily:boolean;status:'NEEDS_CRITERION'|'NEEDS_HISTORY'|'ACTIVE'|'WAITING_PERMISSION'|'PAUSED'|'QUEUED';asOf:string;lastRunDate:string|null;candidateIds:number[]|null};
async function saveTask(tx:Tx,task:ReactivationTask){
 await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET state=jsonb_set(state,'{reactivationTask}',${JSON.stringify(task)}::jsonb,true),"updatedAt"=NOW() WHERE phone=${SANDRA_PHONE}`;
}
export async function runChiefReactivationTask(tx:Tx,queue:Queue){
 const rows=await tx.$queryRaw<{state:{reactivationTask?:ReactivationTask}}[]>`SELECT state FROM "PsicologiaBotConversation" WHERE phone=${SANDRA_PHONE} FOR UPDATE`;
 const task=rows[0]?.state.reactivationTask;if(!task||!['ACTIVE','WAITING_PERMISSION'].includes(task.status)||task.criterion!=='service')return;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'America/Bogota'}).format(new Date()));
 if(task.lastRunDate===today||hour<7||hour>=20)return;
 const source=await tx.$queryRaw<(ReceptionEvent&{eventAt:Date})[]>`SELECT id,phone,text,kind,"fromMe","eventAt" FROM "PsicologiaBotEvent" WHERE id=${task.sourceEvent} AND phone=${SANDRA_PHONE} AND "fromMe"=false`;
 if(!source[0])throw Error('CAMPAIGN_SOURCE_INVALID');
 const e={...source[0],at:source[0].eventAt.toISOString()};
 const result=await executeReactivationBatch(tx,e,queue,task.asOf,task.candidateIds,today);
 await saveTask(tx,{...task,candidateIds:task.candidateIds??result.ids,lastRunDate:today,status:result.remaining>0?(task.daily?'ACTIVE':'PAUSED'):result.missingPermission>0?'WAITING_PERMISSION':'QUEUED'});
}

export async function executeReactivationBatch(tx:Tx,e:ReceptionEvent,queue:Queue,asOf=new Date().toISOString(),candidateIds:number[]|null=null,day='manual'){
 if(e.phone!==SANDRA_PHONE||e.fromMe)throw Error('CAMPAIGN_ACTOR');
 const ack=(message:string)=>queue(tx,e.id+':campaign-progress:'+day,SANDRA_PHONE,message);
 // A past appointment alone does not establish permission for a new marketing message.
 const candidates=await tx.$queryRaw<{id:number;phone:string;lastCompletedAt:Date;marketing:boolean;optedOut:boolean;recent:boolean}[]>`
  WITH last_visit AS (SELECT "pacienteId",MAX(COALESCE("horaFin","fechaCita")) AS last_seen FROM "CitasPsicologos"
    WHERE "tenantId"=4 AND "empresaId"=3 AND realizada=true AND COALESCE("horaFin","fechaCita")<=NOW() GROUP BY "pacienteId"),
  patients AS (SELECT c.id,CASE WHEN length(regexp_replace(c.telefono,'[^0-9]','','g'))=10 THEN '57'||regexp_replace(c.telefono,'[^0-9]','','g') ELSE regexp_replace(c.telefono,'[^0-9]','','g') END AS phone,l.last_seen
    FROM "Cliente" c JOIN last_visit l ON l."pacienteId"=c.id WHERE c."tenantId"=4 AND c."empresaId"=3 AND c."deletedAt" IS NULL
    AND l.last_seen < ((${new Date(asOf)}::timestamptz AT TIME ZONE 'America/Bogota')-INTERVAL '6 months') AT TIME ZONE 'America/Bogota'
    AND NOT EXISTS(SELECT 1 FROM "CitasPsicologos" f WHERE f."pacienteId"=c.id AND f."tenantId"=4 AND f."empresaId"=3 AND f.realizada=false AND COALESCE(f."horaInicio",f."fechaCita")>=NOW()))
  SELECT p.id,p.phone,p.last_seen AS "lastCompletedAt",COALESCE(k.marketing,false) AS marketing,COALESCE(k."optedOut",false) AS "optedOut",
    EXISTS(SELECT 1 FROM "PsicologiaBotOutreach" o WHERE o.phone=p.phone AND (o."createdAt">NOW()-INTERVAL '30 days' OR o."sourceEvent"=${e.id})) AS recent
  FROM patients p LEFT JOIN "PsicologiaBotContactPermission" k ON k.phone=p.phone
  WHERE p.phone ~ '^[1-9][0-9]{7,14}$' ORDER BY p.last_seen,p.id`;
 const scoped=candidateIds?candidates.filter(c=>candidateIds.includes(c.id)):candidates;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'America/Bogota'}).format(new Date()));
 const eligible=scoped.filter(c=>c.marketing&&!c.optedOut&&!c.recent&&![SANDRA_PHONE,PSYCHOLOGY_PHONE].includes(c.phone));
 const unique=eligible.filter((c,i,a)=>a.findIndex(p=>p.phone===c.phone)===i);
 const missingPermission=scoped.filter(c=>!c.marketing&&!c.optedOut&&!c.recent).length;
 if(hour<7||hour>=20)return {ids:scoped.map(c=>c.id),remaining:unique.length,missingPermission};
 const todayCount=await tx.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM "PsicologiaBotOutreach" WHERE ("createdAt" AT TIME ZONE 'America/Bogota')::date=(NOW() AT TIME ZONE 'America/Bogota')::date`;
 const capacity=Math.max(0,20-Number(todayCount[0].n));
 let queued=0;
 for(const c of unique.slice(0,capacity)){
  const count=await tx.$executeRaw`INSERT INTO "PsicologiaBotOutreach" (id,phone,"clientId","sourceEvent","lastCompletedAt") VALUES (${e.id+':'+c.id},${c.phone},${c.id},${e.id},${c.lastCompletedAt}) ON CONFLICT DO NOTHING`;
  if(!count)continue;
  await queue(tx,e.id+':reactivate:'+c.id,c.phone,'Hola 😊 En *Psicólogos en Colombia* esperamos que estés bien. Aquí estamos si deseas agendar un espacio de acompañamiento. ¿Te gustaría conocer la disponibilidad? Si prefieres no recibir estos mensajes, nos dices.');queued++;
 }
 await createAuditLog({tenantId:4,accion:'BOT_REACTIVATION_REQUEST',entidad:'WhatsApp',entidadId:e.id,detalles:{sourceEvent:e.id,candidates:candidates.length,eligible:unique.length,queued,remaining:Math.max(0,unique.length-queued),scope:'tenant4/company3',bankDataAccessed:false},tx});
 if(missingPermission)await queue(tx,e.id+':campaign-permission',SANDRA_PHONE,'Hay '+missingPermission+' registros sin autorización promocional documentada. ¿Dónde podemos verificarla? Esos contactos quedan pendientes.');
 if(queued||day==='manual')await ack(`Sandra, revisé ${scoped.length} registros con más de seis meses sin cita realizada. Dejé ${queued} mensajes en cola.${unique.length>queued?' Quedan '+(unique.length-queued)+' elegibles para otro lote.':''}`);
 return {ids:scoped.map(c=>c.id),remaining:unique.length-queued,missingPermission};
}
