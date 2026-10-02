import type {Prisma} from '@/prisma/generated/prisma/client';
import {createAuditLog} from './audit';
import {phoneDigits,SANDRA_PHONE,PSYCHOLOGY_PHONE,type ReceptionEvent} from './psychology-reception';
import type {Understanding} from './psychology-ai';
import {campaignCandidates} from './psychology-campaign-candidates';
type Tx=Prisma.TransactionClient;
type Queue=(tx:Tx,id:string,phone:string,content:string)=>Promise<void>;

/** Requested parameters remain evidence; they never grant recipient consent. */
export function campaignRequestedScope(text:string){
 const s=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const words:Record<string,number>={un:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12};
 const month=/\b(\d+|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce) meses?\b/.exec(s);
 const goal=/\b(\d{1,4})\s+(?:mensajes|clientes|pacientes)\b/.exec(s);
 return {inactiveMonths:month?words[month[1]]??Number(month[1]):null,messageGoal:goal?Number(goal[1]):null,criterion:/sin (?:hablar|conversar|contacto)|no (?:le |les |nos )?(?:hemos |han |he )?(?:hablado|escrito|contactado)/.test(s)?'contact' as const:'service' as const};
}

/** Interpretation proposes an action. Identity and permitted operations are enforced here. */
export function chiefAction(event:ReceptionEvent,u:Understanding){
 if(event.fromMe||event.phone!==SANDRA_PHONE||u.confidence<0.9||u.instructionUncertainty?.trim())return null;
 // A direct instruction may be phrased as a concern or question. Only remembering
 // that instruction tolerates this intent mismatch; sends and commands still require admin.
 if(u.intent!=='admin'&&!(u.intent==='question'&&u.adminAction==='learn'&&u.instruction?.trim()))return null;
 if(u.intent==='question')return {type:'learn',instruction:u.instruction!.trim()} as const;
 const phone=u.targetPhone?phoneDigits(u.targetPhone):null;
 if(u.adminAction==='status')return {type:'command',text:'ESTADO BOT'} as const;
 if(['pause','resume'].includes(u.adminAction||'')&&phone&&![SANDRA_PHONE,PSYCHOLOGY_PHONE].includes(phone))return {type:'command',text:`${u.adminAction==='pause'?'PAUSAR':'REANUDAR'} ${phone}`} as const;
 const text=event.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(u.adminAction==='reactivate'||(campaignRequestedScope(text).inactiveMonths!==null&&/clientes|pacientes|psicologos/.test(text)&&/escrib|mensaje|reactiva|envi/.test(text)))return {type:'reactivate'} as const;
 if(u.adminAction==='learn'&&u.instruction?.trim())return {type:'learn',instruction:u.instruction.trim()} as const;
 // Do not turn an inferred paraphrase into an outbound message on behalf of the chief.
 if(u.adminAction==='send'&&phone&&phone!==PSYCHOLOGY_PHONE&&u.instruction?.trim()&&event.text.includes(u.instruction.trim()))return {type:'send',phone,text:u.instruction.trim()} as const;
 return null;
}

function chiefClarification(u:Understanding|null){
 const question=u?.question?.trim();
 if(question&&!/qu[eé] debo hacer exactamente|aclares la acci[oó]n|si aplica.{0,20}n[uú]mero|quieres.{0,24}(?:guarde|guardar)|confirmas.{0,24}(?:guarde|guardar)/i.test(question))return question.slice(0,400);
 const uncertain=u?.instructionUncertainty?.trim();
 if(uncertain)return `Sandra, no me quedó clara esta parte: «${uncertain.slice(0,180)}». ¿Me la aclaras?`;
 if(u?.adminAction==='learn'&&u.instruction?.trim())return `Sandra, entendí: «${u.instruction.trim().slice(0,220)}». ¿Es correcto?`;
 if(u?.adminAction==='send')return 'Sandra, ¿a qué número y con qué texto quieres que envíe el mensaje?';
 if(u?.adminAction==='pause'||u?.adminAction==='resume')return 'Sandra, ¿cuál es el número del chat al que te refieres?';
 return 'Sandra, esta parte no me quedó clara. ¿Me la puedes explicar con otras palabras?';
}

export async function handleChiefUnderstanding(tx:Tx,e:ReceptionEvent,u:Understanding|null,queue:Queue,command:(tx:Tx,e:ReceptionEvent)=>Promise<void>){
 if(e.fromMe||e.phone!==SANDRA_PHONE)return false;
 // An absent analysis cannot establish that the sender's explanation was unclear.
 if(!u)return false;
 const ack=(message:string)=>queue(tx,e.id+':chief-result',SANDRA_PHONE,message);
 const normalized=e.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if((!u?.adminAction||u.adminAction==='none')&&/era para otra persona|mensaje equivocado|me confundi/.test(normalized)){
  await ack('Entendido, Sandra 😊 Gracias por aclararlo. Ese mensaje no lo aplicaré a Psicólogos en Colombia.');return true;
 }
 if(/fumigaci|control de plagas|reparacion de electrodomesticos/.test(normalized)){
  await ack('Sandra, este canal corresponde a *Psicólogos en Colombia*. La instrucción menciona otro negocio, así que no inicié esa tarea. ¿Querías enviarla a otro equipo?');return true;
 }
 // An unresolved fragment blocks every interpretation-driven action, including
 // the clarification and campaign shortcuts below. Preserve the source for review.
 if(u?.instructionUncertainty?.trim()){await ack(chiefClarification(u));return true;}
 // A standalone social turn is already understood; it neither asks for an
 // administrative action nor changes ownership or a pending task.
 if(u.intent==='courtesy'&&(!u.adminAction||u.adminAction==='none')&&!u.instruction?.trim()&&!u.question?.trim()){
  await ack('Con mucho gusto, Sandra 😊');return true;
 }
 // Announcing a future list is neither an instruction to send now nor marketing consent.
 if(/(?:voy a|vamos a|te mandare|te enviare|te pasare).*(?:lista|listado|listadito|base de datos)/.test(normalized)&&/clientes|pacientes|psicologos|profesionales/.test(normalized)){
  const request={sourceEvent:e.id,status:'WAITING_LIST',clients:/clientes|pacientes/.test(normalized),professionals:/psicologos|profesionales/.test(normalized),receivedAt:e.at};
  await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET state=jsonb_set(state,'{pendingContactList}',${JSON.stringify(request)}::jsonb,true),"updatedAt"=NOW() WHERE phone=${SANDRA_PHONE}`;
  await createAuditLog({tenantId:4,accion:'BOT_CONTACT_LIST_EXPECTED',entidad:'WhatsApp',entidadId:e.id,detalles:{...request,contactPermissionGranted:false,recipientsCreated:0},tx});
  await queue(tx,e.id+':chief-list',SANDRA_PHONE,'Claro, Sandra 😊 Envíame las listas de clientes y psicólogos. Revisaré teléfonos y duplicados; si falta algún dato para contactarles, te lo consultaré.');
  return true;
 }
 const stateRows=await tx.$queryRaw<{state:{reactivationTask?:ReactivationTask;pendingContactList?:{status:string}}}[]>`SELECT state FROM "PsicologiaBotConversation" WHERE phone=${SANDRA_PHONE}`;
 const pending=stateRows[0]?.state.reactivationTask;
 if(/explicate|no entendi|no entiendo|mas clar[ao]|hazme la pregunta|a que te refieres|aclarame/.test(normalized)){
  const clarify=(message:string)=>queue(tx,e.id+':chief-clarification',SANDRA_PHONE,message);
  if(u?.adminAction==='learn'&&u.confidence>=0.9&&u.instruction?.trim()){
   await tx.$executeRaw`INSERT INTO "PsicologiaBotKnowledge" (id,instruction,"sourceEvent","approvedBy") VALUES (${e.id+':knowledge'},${u.instruction.trim()},${e.id},${SANDRA_PHONE}) ON CONFLICT DO NOTHING`;
   await createAuditLog({tenantId:4,accion:'BOT_CHIEF_CLARIFICATION',entidad:'PsicologiaBotKnowledge',entidadId:e.id,detalles:{sourceEvent:e.id,actorPhone:SANDRA_PHONE,instruction:u.instruction.trim()},tx});
  }
  if(stateRows[0]?.state.pendingContactList?.status==='WAITING_LIST')await clarify('Perdón, Sandra 😊 Me refería a las listas que vas a enviarme. Revisaré quién ya está registrado; a los clientes nuevos les pediré los datos necesarios y su confirmación para registrarlos sin duplicar.');
  else if(pending?.status==='WAITING_PERMISSION')await clarify('Me refiero al permiso de los clientes para recibir invitaciones por WhatsApp. Aún no está registrado en el bot. ¿Dónde podemos consultar esa autorización: formulario, documento o conversación?');
  else if(pending?.status==='NEEDS_CRITERION')await clarify('Me refiero a cómo elegir los clientes: ¿miramos la fecha de su última cita en Axis o la fecha de la última conversación en WhatsApp? Son datos distintos.');
  else{
   const prior=await tx.$queryRaw<{text:string}[]>`SELECT COALESCE(transcript,text) AS text FROM "PsicologiaBotEvent" WHERE phone=${SANDRA_PHONE} AND "fromMe"=false AND id<>${e.id} AND "eventAt"<=${new Date(e.at)} ORDER BY "eventAt" DESC LIMIT 3`;
   await clarify(prior.some(p=>/fumigaci|control de plagas/i.test(p.text))?'Perdón, Sandra. Mi pregunta fue poco clara. El audio anterior hablaba de fumigación y aquí gestiono Psicólogos en Colombia. No inicié esa tarea.':'Perdón, Sandra. Para enviar un mensaje a una persona necesito su número y el texto que deseas enviarle. Si hablas de otra tarea, dime cuál y reviso su estado.');
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
 if(!action){await ack(chiefClarification(u));return true;}
 if(action.type==='command'){await command(tx,{...e,text:action.text});return true;}
 if(action.type==='learn'){
  await tx.$executeRaw`INSERT INTO "PsicologiaBotKnowledge" (id,instruction,"sourceEvent","approvedBy") VALUES (${e.id+':knowledge'},${action.instruction},${e.id},${SANDRA_PHONE}) ON CONFLICT DO NOTHING`;
  await createAuditLog({tenantId:4,accion:'BOT_CHIEF_INSTRUCTION',entidad:'PsicologiaBotKnowledge',entidadId:e.id,detalles:{sourceEvent:e.id,actorPhone:SANDRA_PHONE,instruction:action.instruction},tx});
  await ack('Gracias por explicármelo, Sandra 😊 Dejé anotada tu indicación. Si para aplicarla falta algún dato, te lo consultaré.');return true;
 }
 if(action.type==='send'){
  await queue(tx,e.id+':chief-send',action.phone,action.text);
  await createAuditLog({tenantId:4,accion:'BOT_CHIEF_SEND_QUEUED',entidad:'WhatsApp',entidadId:action.phone,detalles:{sourceEvent:e.id,actorPhone:SANDRA_PHONE},tx});
  await ack('Dejé tu mensaje en la cola de envío a +'+action.phone+'. Si el envío falla, quedará pendiente de revisión.');return true;
 }
 const requestedScope=campaignRequestedScope(e.text);
 // Existing execution uses six-month service history and a 20/day ceiling. A new
 // scope must not silently fall back to those values or reuse its candidate IDs.
 if((requestedScope.inactiveMonths!==null&&requestedScope.inactiveMonths!==6)||(requestedScope.messageGoal!==null&&requestedScope.messageGoal>20)){
  const task:ReactivationTask={sourceEvent:e.id,criterion:requestedScope.criterion,daily:/diari|dia siguiente|cada dia|todos los dias/.test(normalized),includeProfessionals:/psicologo|profesional/.test(normalized),status:requestedScope.criterion==='contact'?'NEEDS_HISTORY':'PAUSED',asOf:e.at,lastRunDate:null,candidateIds:null,requestedScope,requestedText:e.text,previousSourceEvent:pending?.sourceEvent};
  await saveTask(tx,task);
  if(pending?.sourceEvent)await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED',"lastError"='CAMPAIGN_SCOPE_CHANGED' WHERE "tenantId"=4 AND status='PENDING' AND id LIKE ${pending.sourceEvent+':reactivate:%'}`;
  await tx.$executeRaw`UPDATE "PsicologiaBotKnowledge" SET active=false WHERE "sourceEvent"=${e.id}`;
  await createAuditLog({tenantId:4,accion:'BOT_CAMPAIGN_REQUEST_PENDING',entidad:'WhatsApp',entidadId:e.id,detalles:{sourceEvent:e.id,task,recipientsQueued:0,contactPermissionGranted:false},tx});
  await ack(`Sandra, dejé anotada tu solicitud${requestedScope.messageGoal?` con la meta de ${requestedScope.messageGoal} mensajes`:''}. ${requestedScope.criterion==='contact'?'Sigue pendiente verificar el historial de conversación y las autorizaciones de los contactos antes de empezar.':'Los envíos quedan pendientes de revisar ese alcance y las autorizaciones de los contactos.'}`);
  return true;
 }
 const criterion=/sin (?:hablar|conversar)|sin contacto|sin (?:hablar|contactar) con/.test(normalized)?'contact':'service';
 const task:ReactivationTask={sourceEvent:e.id,criterion,daily:/diari|dia siguiente|cada dia|todos los dias/.test(normalized),includeProfessionals:/psicologo|profesional/.test(normalized),status:criterion==='contact'?'NEEDS_CRITERION':'ACTIVE',asOf:new Date().toISOString(),lastRunDate:null,candidateIds:null};
 await saveTask(tx,task);
 // A campaign request is an operational task, not a general instruction for every patient.
 await tx.$executeRaw`UPDATE "PsicologiaBotKnowledge" SET active=false WHERE "sourceEvent"=${e.id}`;
 await createAuditLog({tenantId:4,accion:'BOT_CAMPAIGN_REQUEST',entidad:'WhatsApp',entidadId:e.id,detalles:{sourceEvent:e.id,task},tx});
 await queue(tx,e.id+':campaign-request',SANDRA_PHONE,criterion==='contact'?'Entendí la tarea diaria 😊 Antes de empezar: ¿son clientes con seis meses sin cita o sin conversar por WhatsApp? Axis permite comprobar las citas; todavía no tengo todo el historial de WhatsApp.':`Registré la tarea 😊 Revisaré clientes${task.includeProfessionals?' y psicólogos':''} con más de seis meses sin servicio. Los envíos habilitados saldrán de 8 a. m. a 7 p. m., separados por al menos un minuto; la recepción de mensajes sigue las 24 horas.`);
 return true;
}

type ReactivationTask={sourceEvent:string;criterion:'contact'|'service';daily:boolean;includeProfessionals?:boolean;status:'NEEDS_CRITERION'|'NEEDS_HISTORY'|'ACTIVE'|'WAITING_PERMISSION'|'PAUSED'|'QUEUED';asOf:string;lastRunDate:string|null;candidateIds:(number|string)[]|null;requestedScope?:ReturnType<typeof campaignRequestedScope>;requestedText?:string;previousSourceEvent?:string};
async function saveTask(tx:Tx,task:ReactivationTask){
 await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET state=jsonb_set(state,'{reactivationTask}',${JSON.stringify(task)}::jsonb,true),"updatedAt"=NOW() WHERE phone=${SANDRA_PHONE}`;
}
export async function runChiefReactivationTask(tx:Tx,queue:Queue){
 const rows=await tx.$queryRaw<{state:{reactivationTask?:ReactivationTask}}[]>`SELECT state FROM "PsicologiaBotConversation" WHERE phone=${SANDRA_PHONE} FOR UPDATE`;
 const task=rows[0]?.state.reactivationTask;if(!task||!['ACTIVE','WAITING_PERMISSION'].includes(task.status)||task.criterion!=='service')return;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'America/Bogota'}).format(new Date()));
 if(task.lastRunDate===today||hour<8||hour>=19)return;
 const source=await tx.$queryRaw<(ReceptionEvent&{eventAt:Date})[]>`SELECT id,phone,text,kind,"fromMe","eventAt" FROM "PsicologiaBotEvent" WHERE id=${task.sourceEvent} AND phone=${SANDRA_PHONE} AND "fromMe"=false`;
 if(!source[0])throw Error('CAMPAIGN_SOURCE_INVALID');
 const e={...source[0],at:source[0].eventAt.toISOString()};
 const cutoff=task.daily?new Date().toISOString():task.asOf;
 const result=await executeReactivationBatch(tx,e,queue,cutoff,task.daily?null:task.candidateIds,today,task.includeProfessionals??false,task.lastRunDate===null);
 await saveTask(tx,{...task,candidateIds:task.daily?result.ids:task.candidateIds??result.ids,lastRunDate:today,status:result.missingPermission>0?'WAITING_PERMISSION':task.daily?'ACTIVE':result.remaining>0?'PAUSED':'QUEUED'});
}

export async function executeReactivationBatch(tx:Tx,e:ReceptionEvent,queue:Queue,asOf=new Date().toISOString(),candidateIds:(number|string)[]|null=null,day='manual',includeProfessionals=false,reportFirst=true){
 if(e.phone!==SANDRA_PHONE||e.fromMe)throw Error('CAMPAIGN_ACTOR');
 const ack=(message:string)=>queue(tx,e.id+':campaign-progress:'+day,SANDRA_PHONE,message);
 // A past appointment alone does not establish permission for a new marketing message.
 const candidates=await campaignCandidates(tx,e.id,asOf,includeProfessionals);
 const key=(c:typeof candidates[number])=>c.audience+':'+c.id;
 const scoped=candidateIds?candidates.filter(c=>candidateIds.includes(key(c))||(c.audience==='client'&&candidateIds.includes(c.id))):candidates;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'America/Bogota'}).format(new Date()));
 const eligible=scoped.filter(c=>c.marketing&&!c.optedOut&&!c.recent&&![SANDRA_PHONE,PSYCHOLOGY_PHONE].includes(c.phone));
 const unique=eligible.filter((c,i,a)=>a.findIndex(p=>p.phone===c.phone)===i);
 const missingPermission=scoped.filter(c=>!c.marketing&&!c.optedOut&&!c.recent).length;
 if(hour<8||hour>=19)return {ids:scoped.map(key),remaining:unique.length,missingPermission};
 const todayCount=await tx.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM "PsicologiaBotOutreach" WHERE ("createdAt" AT TIME ZONE 'America/Bogota')::date=(NOW() AT TIME ZONE 'America/Bogota')::date`;
 const capacity=Math.max(0,20-Number(todayCount[0].n));
 let queued=0;
 for(const c of unique.slice(0,capacity)){
  const count=await tx.$executeRaw`INSERT INTO "PsicologiaBotOutreach" (id,phone,"clientId","professionalId","sourceEvent","lastCompletedAt") VALUES (${e.id+':'+key(c)},${c.phone},${c.audience==='client'?c.id:null},${c.audience==='professional'?c.id:null},${e.id},${c.lastCompletedAt}) ON CONFLICT DO NOTHING`;
  if(!count)continue;
  await queue(tx,e.id+':reactivate:'+key(c),c.phone,c.audience==='professional'?'Hola 😊 En *Psicólogos en Colombia* esperamos que estés bien. Tenemos consultorios de 7 a. m. a 8 p. m. ¿Te compartimos disponibilidad? Si prefieres no recibir estos mensajes, nos dices.':'Hola 😊 En *Psicólogos en Colombia* esperamos que estés bien. Será un gusto recibirte nuevamente. ¿Te compartimos disponibilidad? Si prefieres no recibir estos mensajes, nos dices.');queued++;
 }
 await createAuditLog({tenantId:4,accion:'BOT_REACTIVATION_REQUEST',entidad:'WhatsApp',entidadId:e.id,detalles:{sourceEvent:e.id,candidates:candidates.length,eligible:unique.length,queued,remaining:Math.max(0,unique.length-queued),scope:'tenant4/company3',bankDataAccessed:false},tx});
 if(missingPermission)await queue(tx,e.id+':campaign-permission',SANDRA_PHONE,'Hay '+missingPermission+' registros sin autorización promocional documentada. ¿Dónde podemos verificarla? Esos contactos quedan pendientes.');
 if(queued||day==='manual'||reportFirst)await ack(`Sandra, identifiqué ${scoped.filter(c=>c.audience==='client').length} clientes y ${scoped.filter(c=>c.audience==='professional').length} psicólogos con más de seis meses sin servicio registrado. Dejé ${queued} mensajes en cola, sujetos a revisión del contexto antes del envío.${unique.length>queued?' Quedan '+(unique.length-queued)+' elegibles para otro lote.':''}`);
 return {ids:scoped.map(key),remaining:unique.length-queued,missingPermission};
}
