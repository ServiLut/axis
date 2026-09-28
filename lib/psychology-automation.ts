import prisma from './prisma';
import type { Prisma } from '@/prisma/generated/prisma/client';
import { createAuditLog } from './audit';
import { decideReception, phoneDigits, SANDRA_PHONE, type ReceptionEvent, type ReceptionTemplates, type ReceptionState } from './psychology-reception';
import { ensurePsychologyConversation, sendPsychologyMessage, verifyPsychologyChannel } from './psychology-chatwoot';
import { handleBookingMessage } from './psychology-bot-booking';
import {randomUUID} from 'node:crypto';
import {parseUnderstanding,type Understanding} from './psychology-ai';
import {prepareNextPsychologyEvent} from './psychology-ai-preparation';
import {handleChiefUnderstanding} from './psychology-chief';
import {semanticReception} from './psychology-semantic-reception';

type Tx=Prisma.TransactionClient;
export type AutomationConfig={ enabled:boolean; activatedAt:Date|null; templates:ReceptionTemplates; paymentPolicy:string };
export async function automationConfig():Promise<AutomationConfig> {
  const rows=await prisma.$queryRaw<AutomationConfig[]>`SELECT enabled,"activatedAt",templates,"paymentPolicy" FROM "PsicologiaBotConfig" WHERE id=4`;
  const company=await prisma.empresa.findFirst({where:{id:3,tenantId:4,estado:true},include:{tenant:true}});
  const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  if(!company||normalize(company.nombre)!=='PSICOLOGOS EN COLOMBIA'||normalize(company.tenant.nombre)!=='PSICOLOGOS'||!rows[0]) throw new Error('BOT_SCOPE');
  return rows[0];
}
export async function enqueuePsychologyEvent(event:ReceptionEvent) {
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`INSERT INTO "PsicologiaBotConversation" (phone) VALUES (${event.phone}) ON CONFLICT DO NOTHING`;
    const count=await tx.$executeRaw`INSERT INTO "PsicologiaBotEvent" (id,phone,"eventAt",kind,text,"fromMe")
      VALUES (${event.id},${event.phone},${new Date(event.at)},${event.kind},${event.text},${event.fromMe}) ON CONFLICT DO NOTHING`;
    return {accepted:true,duplicate:count===0};
  });
}
export async function queuePsychologyMessage(tx:Tx,id:string,phone:string,content:string) {
  await tx.$executeRaw`INSERT INTO "PsicologiaBotOutbox" (id,phone,content) VALUES (${id},${phone},${content}) ON CONFLICT DO NOTHING`;
}
async function adminMessage(tx:Tx,e:ReceptionEvent) {
  const policy=/^POLITICA PAGO (COMPLETO|MITAD CITA|ABONO 20000|REVISAR)$/i.exec(e.text.trim());
  if(policy) {
    const value=({COMPLETO:'FULL','MITAD CITA':'HALF_SESSION_FULL_PACKAGE','ABONO 20000':'DEPOSIT_20000',REVISAR:'REVIEW'} as Record<string,string>)[policy[1].toUpperCase()];
    await tx.$executeRaw`UPDATE "PsicologiaBotConfig" SET "paymentPolicy"=${value} WHERE id=4`;
    await createAuditLog({tenantId:4,accion:'BOT_POLICY_APPROVED',entidad:'PsicologiaBotConfig',entidadId:'4',detalles:{policy:value,sourceEvent:e.id,actor:'Sandra verificada por canal'},tx});
    await queuePsychologyMessage(tx,e.id+':policy',SANDRA_PHONE,'Aclaración registrada. Revisaremos que las respuestas rápidas coincidan antes de comunicar condiciones de pago.');
    return;
  }
  const command=/^(PAUSAR|REANUDAR)\s+(\+?[1-9][\d\s-]{7,20})$/i.exec(e.text.trim());
  if(command) {
    const phone=phoneDigits(command[2]);if(!phone||phone===SANDRA_PHONE)return;
    const stage=command[1].toUpperCase()==='PAUSAR'?'HUMAN':'NEW';
    await tx.$executeRaw`INSERT INTO "PsicologiaBotConversation" (phone,stage) VALUES (${phone},${stage})
      ON CONFLICT (phone) DO UPDATE SET stage=EXCLUDED.stage,state='{}',"updatedAt"=NOW()`;
    if(stage==='HUMAN')await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED' WHERE phone=${phone} AND status='PENDING'`;
    await queuePsychologyMessage(tx,e.id+':admin',SANDRA_PHONE,`${stage==='HUMAN'?'Atención automática pausada':'Atención automática habilitada para el próximo mensaje'}: +${phone}.`);
    await createAuditLog({tenantId:4,accion:'BOT_CONVERSATION_MODE',entidad:'WhatsApp',entidadId:phone,detalles:{stage,sourceEvent:e.id,actor:'Sandra verificada por canal'},tx});
  } else if(/^(ESTADO BOT|AYUDA BOT)$/i.test(e.text.trim())) {
    const rows=await tx.$queryRaw<{pending:bigint;uncertain:bigint;review:bigint}[]>`
      SELECT (SELECT COUNT(*) FROM "PsicologiaBotEvent" WHERE status='PENDING') AS pending,
      (SELECT COUNT(*) FROM "PsicologiaBotOutbox" WHERE status='UNCERTAIN') AS uncertain,
      (SELECT COUNT(*) FROM "PsicologiaBotConversation" WHERE stage='HUMAN') AS review`;
    await queuePsychologyMessage(tx,e.id+':status',SANDRA_PHONE,`Estado de recepción: ${rows[0].pending} eventos pendientes, ${rows[0].review} conversaciones con atención humana y ${rows[0].uncertain} envíos por verificar.\nPara tomar un chat: PAUSAR seguido del número. Para devolverlo al bot: REANUDAR seguido del número.`);
  }
}
async function processOne(config:AutomationConfig) {
  return prisma.$transaction(async tx=>{
    // All workers lock in the same order. Serialize state transitions, including sender echoes.
    await tx.$queryRaw`SELECT id FROM "PsicologiaBotConfig" WHERE id=4 FOR UPDATE`;
    const rows=await tx.$queryRaw<(ReceptionEvent&{eventAt:Date;analysis:unknown;transcript:string|null;analysisError:string|null})[]>`SELECT id,phone,"eventAt",kind,text,"fromMe",analysis,transcript,"analysisError" FROM "PsicologiaBotEvent" WHERE status='PENDING' ORDER BY "receivedAt",id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    const row=rows[0];if(!row)return false;
    const e:ReceptionEvent={...row,at:row.eventAt.toISOString(),...(row.kind==='audio'&&row.transcript?{kind:'text',text:row.transcript}:{})};
    let understanding:Understanding|null=null;
    if(row.analysis){try{understanding=parseUnderstanding(row.analysis)}catch{ /* Invalid model output has no authority. */ }}
    if(!e.fromMe&&understanding?.intent==='confirm'&&understanding.confidence>=0.9){
      const proposals=await tx.$queryRaw<{code:string;details:{date:string;start:string;end:string;serviceId:string;roomId:string|null;professionalId:number}}[]>`SELECT code,details FROM "PsicologiaBotProposal" WHERE status='PENDING' AND "expiresAt">NOW() AND ("customerPhone"=${e.phone} OR "professionalPhone"=${e.phone}) LIMIT 2`;
      const last=await tx.$queryRaw<{content:string}[]>`SELECT content FROM "PsicologiaBotOutbox" WHERE phone=${e.phone} AND status='ACCEPTED' ORDER BY "createdAt" DESC,id DESC LIMIT 1`;
      const unchanged=proposals.length===1&&(['date','start','end','serviceId','roomId','professionalId'] as const).every(key=>understanding![key]===null||understanding![key]===proposals[0].details[key]);
      if(unchanged&&last[0]?.content.includes('CONFIRMAR '+proposals[0].code))e.text='CONFIRMAR '+proposals[0].code;
    }
    let bookingHandled=false;
    if(!e.fromMe&&e.kind==='text'&&/^(RESERVAR|CONFIRMAR|SOPORTE)\s/i.test(e.text)) {
      await tx.$executeRawUnsafe('SAVEPOINT bot_booking');
      try {bookingHandled=await handleBookingMessage(tx,e,queuePsychologyMessage);}
      catch {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT bot_booking');
        bookingHandled=true;
        await queuePsychologyMessage(tx,e.id+':booking-review',SANDRA_PHONE,'No se pudo completar una propuesta de reserva. Revisa registro del paciente, profesional, horario, tarifa y soporte. No se confirmó una cita. Referencia de revisión: '+e.id);
        await createAuditLog({tenantId:4,accion:'BOT_BOOKING_REVIEW',entidad:'WhatsAppEvento',entidadId:e.id,detalles:{requiresReview:true,appointmentConfirmed:false},tx});
      }
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT bot_booking');
    }
    if(bookingHandled) { /* Confirmation/proposal handled without entering the sales conversation. */ }
    else if(e.phone===SANDRA_PHONE) {
      if(!e.fromMe){
        if(/^(ESTADO BOT|AYUDA BOT)$|^(PAUSAR|REANUDAR|POLITICA PAGO)\s/i.test(e.text.trim()))await adminMessage(tx,e);
        else if(row.analysisError)await queuePsychologyMessage(tx,e.id+':ai-error',SANDRA_PHONE,'Sandra, falló la interpretación de este mensaje. '+(row.kind==='audio'?'No pude transcribir el audio. ¿Me lo escribes, por favor?':'Puedes usar ESTADO BOT, PAUSAR o REANUDAR seguido del número mientras se revisa la conexión.'));
        else await handleChiefUnderstanding(tx,e,understanding,queuePsychologyMessage,adminMessage);
      }
    }
    else {
      const echo=e.fromMe?await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PsicologiaBotOutbox" WHERE phone=${e.phone} AND content=${e.text} AND status IN ('SENDING','ACCEPTED','UNCERTAIN') AND "createdAt">NOW()-INTERVAL '15 minutes' LIMIT 1`:[];
      if(!echo.length) {
        const conversations=await tx.$queryRaw<{stage:string;state:ReceptionState}[]>`SELECT stage,state FROM "PsicologiaBotConversation" WHERE phone=${e.phone} FOR UPDATE`;
        const c=conversations[0];
        // A human reply received while the model was working takes precedence.
        const humanLater=!e.fromMe?await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PsicologiaBotEvent" h WHERE phone=${e.phone} AND "fromMe"=true AND "receivedAt">(SELECT "receivedAt" FROM "PsicologiaBotEvent" WHERE id=${e.id}) AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" o WHERE o.phone=h.phone AND o.content=h.text AND o.status IN ('SENDING','ACCEPTED','UNCERTAIN')) LIMIT 1`:[];
        const decision=humanLater.length?{stage:'HUMAN',state:{...c.state,reason:'Atención de una persona'},messages:[],handoff:undefined}:semanticReception(e,c.stage,c.state,config.templates,config.paymentPolicy,understanding);
        if(row.analysisError&&c.stage!=='HUMAN'&&!humanLater.length){decision.handoff='No fue posible interpretar el mensaje: '+row.analysisError;decision.stage='HUMAN';decision.messages=[row.kind==='audio'?'No pude escuchar bien tu audio 😊 ¿Me escribes lo que necesitas, por favor?':'Estoy pidiendo apoyo a nuestra coordinadora para responderte bien.'];}
        if(understanding?.intent==='stop'||decision.state.reason==='No contactar')await tx.$executeRaw`INSERT INTO "PsicologiaBotContactPermission" (phone,"optedOut","sourceEvent") VALUES (${e.phone},true,${e.id}) ON CONFLICT(phone) DO UPDATE SET "optedOut"=true,marketing=false,"sourceEvent"=EXCLUDED."sourceEvent","updatedAt"=NOW()`;
        if(e.fromMe||understanding?.intent==='stop'||decision.state.reason==='No contactar')await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED' WHERE phone=${e.phone} AND status='PENDING'`;
        for(const [i,content] of decision.messages.entries())await queuePsychologyMessage(tx,e.id+':reply:'+i,e.phone,content);
        if(decision.handoff&&(!c.state.alerted||decision.handoff==='Atención humana urgente')) {
          await queuePsychologyMessage(tx,e.id+':handoff',SANDRA_PHONE,`Recepción Psicólogos: +${e.phone} requiere apoyo. ${decision.handoff}. Revisa el chat antes de responder.\nhttps://chatwoot.servilutioncrm.cloud/app/accounts/2/dashboard`);
          decision.state.alerted=true;
        }
        await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET stage=${decision.stage},state=${JSON.stringify(decision.state)}::jsonb,"updatedAt"=NOW() WHERE phone=${e.phone}`;
      }
    }
    await tx.$executeRaw`UPDATE "PsicologiaBotEvent" SET status='DONE',"processedAt"=NOW() WHERE id=${e.id}`;
    return true;
  },{timeout:15000});
}
export async function drainPsychologyAutomation(config:AutomationConfig) {
  if(!config.enabled)return {enabled:false,processed:0,accepted:0};
  let processed=0,accepted=0;
  const token=randomUUID();
  const lease=await prisma.$executeRaw`UPDATE "PsicologiaBotConfig" SET "aiLeaseToken"=${token},"aiLeaseUntil"=NOW()+INTERVAL '4 minutes' WHERE id=4 AND ("aiLeaseUntil" IS NULL OR "aiLeaseUntil"<NOW())`;
  if(lease){
    const started=Date.now();
    try{for(let i=0;i<3&&Date.now()-started<20000;i++){await prepareNextPsychologyEvent();if(!await processOne(config))break;processed++;}}
    finally{await prisma.$executeRaw`UPDATE "PsicologiaBotConfig" SET "aiLeaseToken"=NULL,"aiLeaseUntil"=NULL WHERE id=4 AND "aiLeaseToken"=${token}`;}
  }
  const pending=await prisma.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM "PsicologiaBotOutbox" WHERE status='PENDING'`;
  // Never replay a request after a timeout: it may already have reached WhatsApp.
  await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='UNCERTAIN',"lastError"='WORKER_INTERRUPTED' WHERE status='SENDING' AND "attemptedAt"<NOW()-INTERVAL '5 minutes'`;
  if(Number(pending[0].n)===0)return {enabled:true,processed,accepted};
  await verifyPsychologyChannel();
  for(let i=0;i<8;i++) {
    const claimed=await prisma.$queryRaw<{id:string;phone:string;content:string}[]>`
      UPDATE "PsicologiaBotOutbox" SET status='SENDING',"attemptedAt"=NOW()
      WHERE id=(SELECT o.id FROM "PsicologiaBotOutbox" o WHERE o.status='PENDING'
        AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" p WHERE p.phone=o.phone AND p.status IN ('SENDING','UNCERTAIN'))
        ORDER BY o."createdAt",o.id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,phone,content`;
    const item=claimed[0];if(!item)break;
    let sending=false;
    try {
      const conversation=await ensurePsychologyConversation(item.phone);
      await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET "conversationId"=${conversation.id} WHERE id=${item.id}`;
      sending=true;
      const msg=await sendPsychologyMessage(conversation.id,item.content);
      if(!Number.isSafeInteger(msg.id))throw new Error('CW_RESPONSE_UNVERIFIED');
      await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='ACCEPTED',"messageId"=${msg.id},"lastError"=NULL WHERE id=${item.id}`;
      accepted++;
    } catch {
      await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='UNCERTAIN',"lastError"=${sending?'DELIVERY_REVIEW':'RECIPIENT_REVIEW'} WHERE id=${item.id}`;
      // Fail visibly in the scheduler without exposing message text, numbers, keys or provider bodies.
      throw new Error('OUTBOX_REVIEW_REQUIRED');
    }
  }
  return {enabled:true,processed,accepted};
}
