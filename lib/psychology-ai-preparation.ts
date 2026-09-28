import prisma from './prisma';
import {aiConfigured,transcribePsychologyAudio,understandPsychologyMessage} from './psychology-ai';
import {SANDRA_PHONE,type ReceptionEvent} from './psychology-reception';

/** No network call while a database transaction or row lock is held. */
export async function prepareNextPsychologyEvent(){
 if(!aiConfigured())return;
 const rows=await prisma.$queryRaw<(ReceptionEvent&{eventAt:Date;analysis:unknown;transcript:string|null;analysisError:string|null})[]>`
  SELECT id,phone,"eventAt",kind,text,"fromMe",analysis,transcript,"analysisError" FROM "PsicologiaBotEvent" WHERE status='PENDING' ORDER BY "receivedAt",id LIMIT 1`;
 const row=rows[0];if(!row||row.fromMe||row.analysis||row.analysisError||row.kind==='attachment')return;
 if(row.kind==='text'&&/^(RESERVAR|CONFIRMAR|SOPORTE|PAUSAR|REANUDAR|POLITICA PAGO)\s|^(ESTADO BOT|AYUDA BOT)$/i.test(row.text.trim()))return;
 const event={...row,at:row.eventAt.toISOString()};
 try{
  if(row.kind==='audio'){
   event.text=row.transcript||await transcribePsychologyAudio(row.id);
   if(event.text.length>8000)throw Error('AUDIO_TOO_LONG');
   await prisma.$executeRaw`UPDATE "PsicologiaBotEvent" SET transcript=${event.text} WHERE id=${row.id} AND status='PENDING'`;
   event.kind='text';
  }
  const conversations=await prisma.$queryRaw<{stage:string;state:unknown}[]>`SELECT stage,state FROM "PsicologiaBotConversation" WHERE phone=${row.phone}`;
  const history=await prisma.$queryRaw<{direction:string;text:string}[]>`
   SELECT direction,text FROM (
    SELECT 'inbound' AS direction,COALESCE(transcript,text) AS text,"receivedAt" AS at FROM "PsicologiaBotEvent" WHERE phone=${row.phone} AND id<>${row.id} AND "eventAt"<=${row.eventAt} AND "fromMe"=false
    UNION ALL SELECT 'outbound',content,"createdAt" FROM "PsicologiaBotOutbox" WHERE phone=${row.phone} AND status='ACCEPTED' AND "createdAt"<=${row.eventAt}
   ) context ORDER BY at DESC LIMIT 8`;
  const knowledge=await prisma.$queryRaw<{instruction:string}[]>`SELECT instruction FROM "PsicologiaBotKnowledge" WHERE "tenantId"=4 AND active=true AND "approvedBy"=${SANDRA_PHONE} ORDER BY "createdAt" DESC LIMIT 12`;
  const catalog=await prisma.terapiasPsicologos.findMany({where:{tenantId:4,empresaId:3,activo:true},select:{id:true,nombre:true,cantidadSesiones:true,precioBase:true}});
  const result=await understandPsychologyMessage(event,{...conversations[0],history:history.reverse().map(h=>({...h,text:h.text.slice(0,1800)})),chiefInstructions:knowledge.map(k=>k.instruction),catalog:catalog.map(s=>({...s,id:String(s.id),precioBase:String(s.precioBase)}))});
  await prisma.$executeRaw`UPDATE "PsicologiaBotEvent" SET analysis=${JSON.stringify(result)}::jsonb WHERE id=${row.id} AND status='PENDING'`;
 }catch(error){
  const code=error instanceof Error&&/^(AI|AUDIO)_[A-Z0-9_]+$/.test(error.message)?error.message:'AI_UNAVAILABLE';
  await prisma.$executeRaw`UPDATE "PsicologiaBotEvent" SET "analysisError"=${code} WHERE id=${row.id} AND status='PENDING'`;
 }
}
