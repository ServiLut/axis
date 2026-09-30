import prisma from './prisma';
import type { Prisma } from '@/prisma/generated/prisma/client';
import { createAuditLog } from './audit';
import { pauseForStaff,resumeReception,phoneDigits, SANDRA_PHONE, type ReceptionEvent, type ReceptionTemplates, type ReceptionState } from './psychology-reception';
import { ensurePsychologyConversation, sendPsychologyMessage, verifyPsychologyChannel } from './psychology-chatwoot';
import { handleBookingMessage } from './psychology-bot-booking';
import {randomUUID} from 'node:crypto';
import {parseUnderstanding,type Understanding} from './psychology-ai';
import {prepareNextPsychologyEvent} from './psychology-ai-preparation';
import {handleChiefUnderstanding,runChiefReactivationTask} from './psychology-chief';
import {semanticReception} from './psychology-semantic-reception';
import {handlePatientIntake} from './psychology-patient-intake';
import {handleReturningPatient} from './psychology-returning-patient';
import {claimPsychologyOutbox} from './psychology-outbox';
import {reviewCampaignContext} from './psychology-campaign-review';
import {enqueueIdleChatResumes,idleChatSources,idleResumeDecision,idleReplyStillCurrent} from './psychology-handover';
import {chiefHelpMessage,chiefBookingProblem} from './psychology-chief-messages';
import {contextReception} from './psychology-reception-context';
import {handleRentalIntake} from './psychology-rental-intake';
import {naturalBookingConfirmation,type ConfirmableProposal} from './psychology-booking-messages';
import {recordPsychologyStaffTakeover,psychologyStaffSendAllowed,chiefStaffDecision,chiefMessageAddressesBot} from './psychology-staff-ownership';
import {psychologyCommunicationIssue} from './psychology-communication';

type Tx=Prisma.TransactionClient;
export type AutomationConfig={ enabled:boolean; activatedAt:Date|null; templates:ReceptionTemplates; paymentPolicy:string;staffIdleMinutes?:number };
export async function automationConfig():Promise<AutomationConfig> {
  const rows=await prisma.$queryRaw<AutomationConfig[]>`SELECT enabled,"activatedAt",templates,"paymentPolicy","staffIdleMinutes" FROM "PsicologiaBotConfig" WHERE id=4`;
  const company=await prisma.empresa.findFirst({where:{id:3,tenantId:4,estado:true},include:{tenant:true}});
  const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  if(!company||normalize(company.nombre)!=='PSICOLOGOS EN COLOMBIA'||normalize(company.tenant.nombre)!=='PSICOLOGOS'||!rows[0]) throw new Error('BOT_SCOPE');
  return rows[0];
}
export async function enqueuePsychologyEvent(event:ReceptionEvent) {
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "PsicologiaBotConfig" WHERE id=4 FOR UPDATE`;
    await tx.$executeRaw`INSERT INTO "PsicologiaBotConversation" (phone) VALUES (${event.phone}) ON CONFLICT DO NOTHING`;
    const count=await tx.$executeRaw`INSERT INTO "PsicologiaBotEvent" (id,phone,"eventAt",kind,text,"fromMe","quotedText")
      VALUES (${event.id},${event.phone},${new Date(event.at)},${event.kind},${event.text},${event.fromMe},${event.quotedText||null}) ON CONFLICT DO NOTHING`;
    if(count)await recordPsychologyStaffTakeover(tx,event);
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
    const previous=(await tx.$queryRaw<{stage:string;state:ReceptionState}[]>`SELECT stage,state FROM "PsicologiaBotConversation" WHERE phone=${phone} FOR UPDATE`)[0];
    const pause=command[1].toUpperCase()==='PAUSAR';
    const next=pause?{stage:'HUMAN',state:{...previous?.state,reason:'Pausa solicitada por Sandra',humanHold:{kind:'manual' as const,resumeStage:previous?.state.humanHold?.resumeStage||previous?.stage||'NEED',since:e.at}}}:{...resumeReception(previous?.state||{})};
    if(!pause){next.state.resumedFrom=e.id;next.state.staffReleasedAt=e.at;}
    const {stage,state}=next;
    await tx.$executeRaw`INSERT INTO "PsicologiaBotConversation" (phone,stage,state) VALUES (${phone},${stage},${JSON.stringify(state)}::jsonb)
      ON CONFLICT (phone) DO UPDATE SET stage=EXCLUDED.stage,state=EXCLUDED.state,"updatedAt"=NOW()`;
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
    const rows=await tx.$queryRaw<(ReceptionEvent&{eventAt:Date;analysis:unknown;transcript:string|null;analysisError:string|null;resumeOf:string|null})[]>`SELECT id,phone,"eventAt",kind,text,"fromMe","quotedText",analysis,transcript,"analysisError","resumeOf" FROM "PsicologiaBotEvent" WHERE status='PENDING' ORDER BY "receivedAt",id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    const row=rows[0];if(!row)return false;
    const e:ReceptionEvent={...row,at:row.eventAt.toISOString(),...(row.kind==='audio'&&row.transcript?{kind:'text',text:row.transcript}:{})};
    const chiefContext={kind:e.kind,text:e.text,quotedText:e.quotedText};
    let understanding:Understanding|null=null;
    if(row.analysis){try{understanding=parseUnderstanding(row.analysis)}catch{ /* Invalid model output has no authority. */ }}
    if(e.fromMe){
      // Also catches pre-deployment queued staff messages. Echoes do not take ownership.
      await recordPsychologyStaffTakeover(tx,e);
      await tx.$executeRaw`UPDATE "PsicologiaBotEvent" SET status='DONE',"processedAt"=NOW() WHERE id=${e.id}`;
      return true;
    }
    if(e.phone===SANDRA_PHONE){
      if(!await chiefMessageAddressesBot(tx,e)){
        await createAuditLog({tenantId:4,accion:'BOT_CHIEF_NOT_ADDRESSED',entidad:'WhatsAppEvento',entidadId:e.id,detalles:{sourceEvent:e.id,instructionsExecuted:false,replySent:false},tx});
        await tx.$executeRaw`UPDATE "PsicologiaBotEvent" SET status='DONE',"processedAt"=NOW() WHERE id=${e.id}`;
        return true;
      }
      const chief=(await tx.$queryRaw<{stage:string;state:ReceptionState}[]>`SELECT stage,state FROM "PsicologiaBotConversation" WHERE "tenantId"=4 AND phone=${SANDRA_PHONE} FOR UPDATE`)[0];
      // Ordinary messages to the staff must not become bot instructions or extra questions.
      // e is text only after a persisted audio transcription exists. Do not discard it here.
      const ownership=chief&&chiefStaffDecision(e,chief.stage,chief.state);
      if(ownership?.action==='release'){
          await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET stage=${ownership.stage},state=${JSON.stringify(ownership.state)}::jsonb,"updatedAt"=NOW() WHERE "tenantId"=4 AND phone=${SANDRA_PHONE}`;
          await queuePsychologyMessage(tx,e.id+':chief-resume',SANDRA_PHONE,'Claro, Sandra. Retomo este chat desde tu próximo mensaje.');
        await createAuditLog({tenantId:4,accion:'BOT_CHIEF_CHAT_RELEASED',entidad:'WhatsAppEvento',entidadId:e.id,detalles:{sourceEvent:e.id,released:true,instructionsExecuted:false},tx});
        await tx.$executeRaw`UPDATE "PsicologiaBotEvent" SET status='DONE',"processedAt"=NOW() WHERE id=${e.id}`;
        return true;
      }
      // A directly addressed request (or verified reply to our question) authorizes this turn only.
      // Keep shared-chat ownership intact; fresh staff messages still cancel/gate its output.
      if(ownership)await createAuditLog({tenantId:4,accion:'BOT_CHIEF_DIRECTED_TURN',entidad:'WhatsAppEvento',entidadId:e.id,detalles:{sourceEvent:e.id,chatReleased:false},tx});
    }
    if(row.resumeOf){
      const candidate=(await idleChatSources(tx,config.staffIdleMinutes??15,row.resumeOf))[0];
      const resumed=!row.analysisError&&candidate?idleResumeDecision(candidate.state,understanding,row.resumeOf):null;
      if(!resumed){
        await tx.$executeRaw`UPDATE "PsicologiaBotEvent" SET status='DONE',"processedAt"=NOW() WHERE id=${e.id}`;
        await createAuditLog({tenantId:4,accion:'BOT_IDLE_REVIEW',entidad:'WhatsAppEvento',entidadId:e.id,detalles:{sourceEvent:row.resumeOf,resumed:false,contextRequired:!!row.analysisError},tx});
        return true;
      }
      await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET stage=${resumed.stage},state=${JSON.stringify(resumed.state)}::jsonb,"updatedAt"=NOW() WHERE phone=${e.phone}`;
      await createAuditLog({tenantId:4,accion:'BOT_IDLE_RESUMED',entidad:'WhatsAppEvento',entidadId:e.id,detalles:{sourceEvent:row.resumeOf,idleMinutes:config.staffIdleMinutes??15,contextRechecked:true},tx});
    }
    if(!e.fromMe&&understanding&&['confirm','accept'].includes(understanding.intent)&&understanding.confidence>=0.9){
      const proposals=await tx.$queryRaw<ConfirmableProposal[]>`
        SELECT p.code,p.details||jsonb_build_object('roomName',r.nombre) AS details FROM "PsicologiaBotProposal" p
        LEFT JOIN consultorios r ON r.id::text=p.details->>'roomId' AND r."tenantId"=4 AND r."empresaId"=3
        WHERE p.status='PENDING' AND p."expiresAt">NOW() AND (p."customerPhone"=${e.phone} OR p."professionalPhone"=${e.phone})
        AND EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" o WHERE o.phone=${e.phone} AND o.status='ACCEPTED'
          AND o."attemptedAt"<=${new Date(e.at)} AND (o.content=p.details->>'customerPrompt' OR o.content=p.details->>'professionalPrompt' OR position('CONFIRMAR '||p.code in o.content)>0))
        AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotConversation" c WHERE c.phone=${e.phone} AND c.stage='HUMAN') LIMIT 8`;
      const last=await tx.$queryRaw<{content:string}[]>`SELECT content FROM "PsicologiaBotOutbox" WHERE phone=${e.phone} AND status='ACCEPTED' AND "attemptedAt"<=${new Date(e.at)} ORDER BY "createdAt" DESC,id DESC LIMIT 1`;
      const code=naturalBookingConfirmation(e,understanding,proposals,last[0]?.content||'');
      if(code)e.text='CONFIRMAR '+code;
    }
    let bookingHandled=false;
    if(!e.fromMe&&e.kind==='text'&&/^(RESERVAR|CONFIRMAR|SOPORTE)\s/i.test(e.text)) {
      await tx.$executeRawUnsafe('SAVEPOINT bot_booking');
      try {bookingHandled=await handleBookingMessage(tx,e,queuePsychologyMessage);}
      catch (error) {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT bot_booking');
        bookingHandled=true;
        await queuePsychologyMessage(tx,e.id+':booking-review',SANDRA_PHONE,chiefBookingProblem(e.phone,error,chiefContext));
        await createAuditLog({tenantId:4,accion:'BOT_BOOKING_REVIEW',entidad:'WhatsAppEvento',entidadId:e.id,detalles:{requiresReview:true,appointmentConfirmed:false},tx});
      }
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT bot_booking');
    }
    if(bookingHandled) { /* Confirmation/proposal handled without entering the sales conversation. */ }
    else if(e.phone===SANDRA_PHONE) {
      if(!e.fromMe){
        if(/^(ESTADO BOT|AYUDA BOT)$|^(PAUSAR|REANUDAR|POLITICA PAGO)\s/i.test(e.text.trim()))await adminMessage(tx,e);
        else if(row.analysisError){
          await tx.$executeRaw`UPDATE "PsicologiaBotConversation" SET state=state||${JSON.stringify({pendingInterpretationEvent:e.id})}::jsonb WHERE phone=${SANDRA_PHONE}`;
          await queuePsychologyMessage(tx,e.id+':ai-error',SANDRA_PHONE,row.kind==='audio'&&!row.transcript?'Sandra, no pude escuchar el audio. ¿Puedes enviarlo de nuevo o escribirme lo que necesitas?':'Sandra, recibí tu mensaje, pero tuve un problema al procesarlo. La solicitud quedó pendiente de revisión; no necesitas repetirla.');
        }
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
        let decision=humanLater.length?pauseForStaff(c.stage,c.state,e.at):semanticReception(e,c.stage,c.state,config.templates,config.paymentPolicy,understanding);
        if(!humanLater.length&&!row.analysisError&&understanding&&decision.handoff!=='Atención humana urgente'&&!contextReception(e,c.stage,c.state)){
          await tx.$executeRawUnsafe('SAVEPOINT bot_intake');
          try{decision=await handleRentalIntake(tx,e,c.stage,c.state,understanding)??await handleReturningPatient(tx,e,c.stage,c.state,understanding)??await handlePatientIntake(tx,e,c.stage,c.state,understanding)??decision;}
          catch{
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT bot_intake');
            decision={stage:'HUMAN',state:{...c.state,reason:'Registro pendiente de revisión'},messages:['No pude completar el registro. Voy a pedir apoyo a Sandra para continuar 😊'],handoff:'Revisar registro de paciente; operación revertida'};
            await createAuditLog({tenantId:4,accion:'BOT_INTAKE_REVIEW',entidad:'WhatsAppEvento',entidadId:e.id,detalles:{patientChanged:false},tx});
          }
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT bot_intake');
        }
        if(row.analysisError&&c.stage!=='HUMAN'&&!humanLater.length){decision.handoff='No fue posible interpretar el mensaje: '+row.analysisError;decision.stage='HUMAN';decision.messages=[row.kind==='audio'?'No pude escuchar bien tu audio 😊 ¿Me escribes lo que necesitas, por favor?':'Estoy pidiendo apoyo a nuestra coordinadora para responderte bien.'];}
        if(decision.handoff)decision.state.humanHold={kind:decision.handoff==='Atención humana urgente'?'urgent':'review',resumeStage:c.stage,since:e.at};
        if(understanding?.intent==='stop'||decision.state.reason==='No contactar')await tx.$executeRaw`INSERT INTO "PsicologiaBotContactPermission" (phone,"optedOut","sourceEvent") VALUES (${e.phone},true,${e.id}) ON CONFLICT(phone) DO UPDATE SET "optedOut"=true,marketing=false,"sourceEvent"=EXCLUDED."sourceEvent","updatedAt"=NOW()`;
        if(e.fromMe||understanding?.intent==='stop'||decision.state.reason==='No contactar')await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED' WHERE phone=${e.phone} AND status='PENDING'`;
        for(const [i,content] of decision.messages.entries())await queuePsychologyMessage(tx,e.id+':reply:'+i,e.phone,content);
        if(decision.handoff&&(!c.state.alerted||decision.handoff==='Atención humana urgente')) {
          await queuePsychologyMessage(tx,e.id+':handoff',SANDRA_PHONE,chiefHelpMessage(e.phone,decision.handoff,chiefContext));
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
    try{
      await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "PsicologiaBotConfig" WHERE id=4 FOR UPDATE`;await enqueueIdleChatResumes(tx,config.staffIdleMinutes??15)},{timeout:15000});
      for(let i=0;i<3&&Date.now()-started<20000;i++){await prepareNextPsychologyEvent();if(!await processOne(config))break;processed++;}
      await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "PsicologiaBotConfig" WHERE id=4 FOR UPDATE`;await runChiefReactivationTask(tx,queuePsychologyMessage)},{timeout:15000});
    }
    finally{await prisma.$executeRaw`UPDATE "PsicologiaBotConfig" SET "aiLeaseToken"=NULL,"aiLeaseUntil"=NULL WHERE id=4 AND "aiLeaseToken"=${token}`;}
  }
  const pending=await prisma.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM "PsicologiaBotOutbox" WHERE status='PENDING'`;
  // Never replay a request after a timeout: it may already have reached WhatsApp.
  await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='UNCERTAIN',"lastError"='WORKER_INTERRUPTED' WHERE status='SENDING' AND "attemptedAt"<NOW()-INTERVAL '5 minutes'`;
  if(Number(pending[0].n)===0)return {enabled:true,processed,accepted};
  await verifyPsychologyChannel();
  for(let i=0;i<8;i++) {
    const item=await prisma.$transaction(tx=>claimPsychologyOutbox(tx));if(!item)break;
    let sending=false;
    try {
      const communicationIssue=psychologyCommunicationIssue(item.phone,item.content);
      if(communicationIssue){
        await prisma.$transaction(async tx=>{
          await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED',"lastError"=${communicationIssue} WHERE id=${item.id} AND status='SENDING'`;
          await queuePsychologyMessage(tx,'communication-review:'+item.id,SANDRA_PHONE,`Sandra, quedó pendiente una respuesta a +${item.phone} porque mencionaba información interna. No se envió. ¿Qué respuesta breve prefieres que reciba esa persona?`);
          await createAuditLog({tenantId:4,accion:'BOT_COMMUNICATION_BLOCKED',entidad:'PsicologiaBotOutbox',entidadId:item.id,detalles:{reason:communicationIssue,sent:false},tx});
        });continue;
      }
      if(item.id.includes(':reactivate:')){
        try{
          const review=await reviewCampaignContext(prisma,item);
          await createAuditLog({tenantId:4,accion:'BOT_CAMPAIGN_CONTEXT_REVIEWED',entidad:'PsicologiaBotOutbox',entidadId:item.id,detalles:review});
        }catch{
          await prisma.$transaction(async tx=>{
            await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED',"lastError"='CAMPAIGN_CONTEXT_REVIEW' WHERE id=${item.id}`;
            await queuePsychologyMessage(tx,'campaign-context-review:'+item.id.replace(':reactivate:',':recipient:'),SANDRA_PHONE,`Sandra, dejé pendiente la invitación a +${item.phone}: necesito revisar el contexto anterior o una solicitud sin resolver. No envié la invitación.`);
            await createAuditLog({tenantId:4,accion:'BOT_CAMPAIGN_CONTEXT_PENDING',entidad:'PsicologiaBotOutbox',entidadId:item.id,detalles:{sent:false,requiresReview:true},tx});
          });continue;
        }
      }
      const conversation=await ensurePsychologyConversation(item.phone);
      await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET "conversationId"=${conversation.id} WHERE id=${item.id}`;
      if(item.id.includes(':reactivate:')){
        // Context/media lookups take time. Recheck the clock and stop requests immediately before sending.
        const gate=await prisma.$queryRaw<{allowed:boolean;inHours:boolean}[]>`
          SELECT EXISTS(SELECT 1 FROM "PsicologiaBotContactPermission" p WHERE p.phone=${item.phone} AND p.marketing=true AND p."optedOut"=false)
           AND NOT EXISTS(SELECT 1 FROM "PsicologiaBotConversation" WHERE phone=${item.phone} AND stage='HUMAN')
           AND EXISTS(SELECT 1 FROM "PsicologiaBotOutbox" WHERE id=${item.id} AND status='SENDING') AS allowed,
           EXTRACT(HOUR FROM clock_timestamp() AT TIME ZONE 'America/Bogota')>=8 AND EXTRACT(HOUR FROM clock_timestamp() AT TIME ZONE 'America/Bogota')<19 AS "inHours"`;
        if(!gate[0]?.allowed||!gate[0]?.inHours){
          await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status=${gate[0]?.allowed?'PENDING':'CANCELLED'},"lastError"='CAMPAIGN_RECHECK' WHERE id=${item.id} AND status='SENDING'`;
          continue;
        }
      }
      if(!await idleReplyStillCurrent(prisma,item.id,item.phone)){
        await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED',"lastError"='IDLE_CONTEXT_CHANGED' WHERE id=${item.id} AND status='SENDING'`;
        continue;
      }
      if(!await psychologyStaffSendAllowed(prisma,item.id,item.phone)){
        await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='CANCELLED',"lastError"='STAFF_TAKEOVER' WHERE id=${item.id} AND status='SENDING'`;
        continue;
      }
      sending=true;
      const msg=await sendPsychologyMessage(conversation.id,item.content);
      if(!Number.isSafeInteger(msg.id))throw new Error('CW_RESPONSE_UNVERIFIED');
      await prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM "PsicologiaBotConfig" WHERE id=4 FOR UPDATE`;
        await tx.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='ACCEPTED',"messageId"=${msg.id},"lastError"=NULL WHERE id=${item.id}`;
        if(item.id.includes(':reactivate:'))await tx.$executeRaw`UPDATE "PsicologiaBotConfig" SET "marketingNextAt"=clock_timestamp()+INTERVAL '60 seconds' WHERE id=4`;
      });
      accepted++;
    } catch {
      await prisma.$executeRaw`UPDATE "PsicologiaBotOutbox" SET status='UNCERTAIN',"lastError"=${sending?'DELIVERY_REVIEW':'RECIPIENT_REVIEW'} WHERE id=${item.id}`;
      // Fail visibly in the scheduler without exposing message text, numbers, keys or provider bodies.
      throw new Error('OUTBOX_REVIEW_REQUIRED');
    }
  }
  return {enabled:true,processed,accepted};
}
