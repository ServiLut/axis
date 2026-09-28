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
 if(u.adminAction==='reactivate')return {type:'reactivate'} as const;
 if(u.adminAction==='learn'&&u.instruction?.trim())return {type:'learn',instruction:u.instruction.trim()} as const;
 // Do not turn an inferred paraphrase into an outbound message on behalf of the chief.
 if(u.adminAction==='send'&&phone&&phone!==PSYCHOLOGY_PHONE&&u.instruction?.trim()&&event.text.includes(u.instruction.trim()))return {type:'send',phone,text:u.instruction.trim()} as const;
 return null;
}

export async function handleChiefUnderstanding(tx:Tx,e:ReceptionEvent,u:Understanding|null,queue:Queue,command:(tx:Tx,e:ReceptionEvent)=>Promise<void>){
 if(e.fromMe||e.phone!==SANDRA_PHONE)return false;
 const action=u?chiefAction(e,u):null;
 const ack=(message:string)=>queue(tx,e.id+':chief-result',SANDRA_PHONE,message);
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
 // A past appointment alone does not establish permission for a new marketing message.
 const candidates=await tx.$queryRaw<{id:number;phone:string;lastCompletedAt:Date;marketing:boolean;optedOut:boolean;recent:boolean}[]>`
  WITH last_visit AS (SELECT "pacienteId",MAX(COALESCE("horaFin","fechaCita")) AS last_seen FROM "CitasPsicologos"
    WHERE "tenantId"=4 AND "empresaId"=3 AND realizada=true AND COALESCE("horaFin","fechaCita")<=NOW() GROUP BY "pacienteId"),
  patients AS (SELECT c.id,CASE WHEN length(regexp_replace(c.telefono,'[^0-9]','','g'))=10 THEN '57'||regexp_replace(c.telefono,'[^0-9]','','g') ELSE regexp_replace(c.telefono,'[^0-9]','','g') END AS phone,l.last_seen
    FROM "Cliente" c JOIN last_visit l ON l."pacienteId"=c.id WHERE c."tenantId"=4 AND c."empresaId"=3 AND c."deletedAt" IS NULL
    AND l.last_seen < ((NOW() AT TIME ZONE 'America/Bogota')-INTERVAL '6 months') AT TIME ZONE 'America/Bogota'
    AND NOT EXISTS(SELECT 1 FROM "CitasPsicologos" f WHERE f."pacienteId"=c.id AND f."tenantId"=4 AND f."empresaId"=3 AND f.realizada=false AND COALESCE(f."horaInicio",f."fechaCita")>=NOW()))
  SELECT p.id,p.phone,p.last_seen AS "lastCompletedAt",COALESCE(k.marketing,false) AS marketing,COALESCE(k."optedOut",false) AS "optedOut",
    EXISTS(SELECT 1 FROM "PsicologiaBotOutreach" o WHERE o.phone=p.phone AND o."createdAt">NOW()-INTERVAL '30 days') AS recent
  FROM patients p LEFT JOIN "PsicologiaBotContactPermission" k ON k.phone=p.phone
  WHERE p.phone ~ '^[1-9][0-9]{7,14}$' ORDER BY p.last_seen,p.id LIMIT 500`;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'America/Bogota'}).format(new Date()));
 const eligible=candidates.filter(c=>c.marketing&&!c.optedOut&&!c.recent&&![SANDRA_PHONE,PSYCHOLOGY_PHONE].includes(c.phone));
 const unique=eligible.filter((c,i,a)=>a.findIndex(p=>p.phone===c.phone)===i);
 if(hour<7||hour>=20){await ack(`Encontré ${candidates.length} registros con más de seis meses sin cita realizada; ${unique.length} tienen autorización de contacto registrada y cumplen los filtros. Estamos fuera del horario de 7 a. m. a 8 p. m.; no inicié envíos.`);return true;}
 let queued=0;
 for(const c of unique.slice(0,20)){
  const count=await tx.$executeRaw`INSERT INTO "PsicologiaBotOutreach" (id,phone,"clientId","sourceEvent","lastCompletedAt") VALUES (${e.id+':'+c.id},${c.phone},${c.id},${e.id},${c.lastCompletedAt}) ON CONFLICT DO NOTHING`;
  if(!count)continue;
  await queue(tx,e.id+':reactivate:'+c.id,c.phone,'Hola 😊 En *Psicólogos en Colombia* esperamos que estés bien. Aquí estamos si deseas agendar un espacio de acompañamiento. ¿Te gustaría conocer la disponibilidad? Si prefieres no recibir estos mensajes, nos dices.');queued++;
 }
 await createAuditLog({tenantId:4,accion:'BOT_REACTIVATION_REQUEST',entidad:'WhatsApp',entidadId:e.id,detalles:{sourceEvent:e.id,candidates:candidates.length,eligible:unique.length,queued,remaining:Math.max(0,unique.length-queued),scope:'tenant4/company3',bankDataAccessed:false},tx});
 await ack(`Sandra, revisé ${candidates.length} registros con más de seis meses sin cita realizada. Dejé ${queued} mensajes en cola, sin repetir contactos de los últimos 30 días.${unique.length>queued?' Quedan '+(unique.length-queued)+' elegibles para otro lote.':''}${candidates.some(c=>!c.marketing&&!c.optedOut)?' Hay registros sin autorización promocional documentada. ¿Dónde podemos verificarla?':''}`);
 return true;
}
