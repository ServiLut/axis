import prisma from './prisma';
import {aiConfigured,transcribePsychologyAudio,understandPsychologyMessage} from './psychology-ai';
import {isFastGreeting,type ReceptionEvent,type ReceptionState} from './psychology-reception';
import {readReceptionIdentity,hasContinuation} from './psychology-reception-context';
import {readPsychologyHistory} from './psychology-chatwoot';
import {readChiefKnowledge} from './psychology-knowledge';
import {classifyReceptionHistory,staffObservation,type BotHistoryReference} from './psychology-staff-observation';
import {chiefMessageAddressesBot,chiefPresenceQuestion} from './psychology-staff-ownership';
import {SANDRA_PHONE} from './psychology-reception';

/** No network call while a database transaction or row lock is held. */
export async function prepareNextPsychologyEvent(){
 const rows=await prisma.$queryRaw<(ReceptionEvent&{eventAt:Date;analysis:unknown;transcript:string|null;analysisError:string|null;resumeOf:string|null})[]>`
  SELECT id,phone,"eventAt",kind,text,"fromMe",analysis,transcript,"analysisError","resumeOf","quotedText" FROM "PsicologiaBotEvent" WHERE status='PENDING' ORDER BY "receivedAt",id LIMIT 1`;
 const row=rows[0];if(!row)return null;
 if(row.fromMe||row.analysis||row.analysisError||row.kind==='attachment')return row.id;
 if(row.kind==='text'&&/^(RESERVAR|CONFIRMAR|SOPORTE|PAUSAR|REANUDAR|POLITICA PAGO)\s|^(ESTADO BOT|AYUDA BOT)$/i.test(row.text.trim()))return row.id;
 if(row.kind==='text'&&/suicid|matarme|quitarme la vida|me quiero morir|me corte|me estoy cortando|sobredosis|no quiero vivir/i.test(row.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'')))return row.id;
 const event={...row,at:row.eventAt.toISOString()};
 try{
  const conversations=await prisma.$queryRaw<{stage:string;state:ReceptionState}[]>`SELECT stage,state FROM "PsicologiaBotConversation" WHERE phone=${row.phone}`;
  const identity=await readReceptionIdentity(prisma,row.phone);
  if(row.kind==='audio'){
   event.text=row.transcript||await transcribePsychologyAudio(row.resumeOf||row.id);
   if(event.text.length>8000)throw Error('AUDIO_TOO_LONG');
   await prisma.$executeRaw`UPDATE "PsicologiaBotEvent" SET transcript=${event.text} WHERE id=${row.id} AND status='PENDING'`;
   event.kind='text';
  }
  const chiefDirectedTurn=row.phone===SANDRA_PHONE&&await chiefMessageAddressesBot(prisma,event);
  if(row.phone===SANDRA_PHONE&&!chiefDirectedTurn)return row.id;
  if(chiefPresenceQuestion(event))return row.id;
  const contextAt=row.resumeOf?new Date():row.eventAt;
  const sourceId=row.resumeOf||row.id;
  const history=await prisma.$queryRaw<{direction:string;text:string;at:Date;source:string}[]>`
   SELECT direction,text,at,source FROM (
    SELECT CASE WHEN "fromMe" THEN 'outbound_staff_or_bot' ELSE 'inbound' END AS direction,COALESCE(transcript,text) AS text,"eventAt" AS at,id AS source FROM "PsicologiaBotEvent" WHERE phone=${row.phone} AND id<>${row.id} AND id<>${sourceId} AND "resumeOf" IS NULL AND "eventAt"<=${contextAt}
    UNION ALL SELECT 'outbound',content,"createdAt",id FROM "PsicologiaBotOutbox" WHERE phone=${row.phone} AND status='ACCEPTED' AND "createdAt"<=${contextAt}
   ) context ORDER BY at DESC LIMIT 20`;
  const remote=await readPsychologyHistory(row.phone,contextAt,sourceId);
  if(row.resumeOf&&(remote.coverage==='no_chatwoot_contact'||remote.messages.some(h=>Date.parse(h.at)>row.eventAt.getTime())))throw Error('AI_RESUME_CONTEXT_CHANGED');
  const sent=await prisma.$queryRaw<BotHistoryReference[]>`SELECT id,content,"messageId"::text AS "messageId","attemptedAt" FROM "PsicologiaBotOutbox" WHERE "tenantId"=4 AND phone=${row.phone} AND status IN ('SENDING','ACCEPTED','UNCERTAIN') ORDER BY "createdAt" DESC LIMIT 80`;
  const context=classifyReceptionHistory([...history.map(h=>({...h,at:h.at.toISOString(),text:h.text.slice(0,1800)})),...remote.messages],sent)
   .sort((a,b)=>a.at.localeCompare(b.at))
   .filter((h,i,a)=>!a.slice(i+1).some(other=>other.source===h.source||(other.text===h.text&&other.direction.startsWith('outbound')===h.direction.startsWith('outbound')&&Math.abs(Date.parse(other.at)-Date.parse(h.at))<60000)))
   .slice(-30);
  if(row.resumeOf&&(!context.length||context.some(h=>h.text.startsWith('[Archivo o audio previo sin transcripción'))))throw Error('AI_RESUME_CONTEXT_REQUIRED');
  const knowledge=await readChiefKnowledge(prisma,event.text+' '+(conversations[0]?.state.service||''));
  const receptionContext={...identity,hasHistory:context.length>0,coverage:remote.coverage,continuation:hasContinuation(event.text)||(!!row.quotedText&&conversations[0]?.stage==='NEW'),quotedText:row.quotedText||undefined};
  await prisma.$executeRaw`UPDATE "PsicologiaBotConversation" SET state=state||${JSON.stringify({context:receptionContext})}::jsonb WHERE phone=${row.phone}`;
  if(!row.resumeOf&&identity.role==='unknown'&&!receptionContext.hasHistory&&!receptionContext.continuation&&isFastGreeting(event,conversations[0]?.stage))return row.id;
  if(!aiConfigured())throw Error('AI_UNAVAILABLE');
  const catalog=await prisma.terapiasPsicologos.findMany({where:{tenantId:4,empresaId:3,activo:true},select:{id:true,nombre:true,cantidadSesiones:true,precioBase:true}});
  const result=await understandPsychologyMessage(event,{...conversations[0],chiefDirectedTurn,verifiedContact:receptionContext,quotedMessage:row.quotedText||null,resumingAfterStaffIdle:!!row.resumeOf,history:context,staffObservation:staffObservation(context,conversations[0]?.stage),historyCoverage:remote.coverage,chiefInstructions:knowledge.map(k=>k.instruction),chiefKnowledgeSources:knowledge.map(k=>({id:k.id,sourceEvent:k.sourceEvent,approvedAt:k.createdAt.toISOString()})),catalog:catalog.map(s=>({...s,id:String(s.id),precioBase:String(s.precioBase)}))});
  await prisma.$executeRaw`UPDATE "PsicologiaBotEvent" SET analysis=${JSON.stringify(result)}::jsonb WHERE id=${row.id} AND status='PENDING'`;
 }catch(error){
  const code=error instanceof Error&&/^(AI|AUDIO)_[A-Z0-9_]+$/.test(error.message)?error.message:'AI_UNAVAILABLE';
  await prisma.$executeRaw`UPDATE "PsicologiaBotEvent" SET "analysisError"=${code} WHERE id=${row.id} AND status='PENDING'`;
 }
 return row.id;
}
