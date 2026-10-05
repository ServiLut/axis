import { NextRequest, NextResponse } from 'next/server';
import { authorizePsychologyIntegration } from '@/lib/psychology-integration-auth';
import { automationConfig, enqueuePsychologyEvent, drainPsychologyAutomation } from '@/lib/psychology-automation';
import { validateReceptionEvent, PSYCHOLOGY_INSTANCE, PSYCHOLOGY_PHONE } from '@/lib/psychology-reception';
import {aiConfigured} from '@/lib/psychology-ai';
import prisma from '@/lib/prisma';
import {parseChiefNotification,enqueueChiefNotification} from '@/lib/psychology-chief-notifications';
import {psychologyChannelHealth} from '@/lib/psychology-chatwoot';
import {PSYCHOLOGY_COMMUNICATION_GUARD} from '@/lib/psychology-communication';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store, private'}});
export async function POST(request:NextRequest) {
  const auth=authorizePsychologyIntegration(request.headers.get('authorization'),{
    enabled:process.env.PSICOLOGOS_AUTOMATION_ENABLED,tokenHash:process.env.PSICOLOGOS_AUTOMATION_TOKEN_HASH,
  });
  if(auth!==200)return json({error:'Automatización no autorizada o no habilitada'},auth);
  try {
    if(Number(request.headers.get('content-length')||0)>16000)return json({error:'Cuerpo demasiado grande'},413);
    const text=await request.text();if(text.length>16000)return json({error:'Cuerpo demasiado grande'},413);
    const body=JSON.parse(text);
    const config=await automationConfig();
    if(body.action==='channel-health')return json({tenantId:4,companyId:3,system:'PSICOLOGOS',enabled:config.enabled,channel:await psychologyChannelHealth()});
    if(body.action==='ignore')return json({accepted:false,reason:'unsupported-event'},202);
    if(body.action==='status')return json({tenantId:4,companyId:3,enabled:config.enabled,paymentPolicy:config.paymentPolicy,mode:'administrative-reception-with-human-review',capabilities:{chiefGreeting:'name-then-greeting',chiefOpening:'warm-scoped-single-turn',chiefCourtesy:'brief-without-task-or-release',chiefReplyReference:'provider-id-and-outbox',campaignScope:'stored-pending-when-unsupported',chiefAnswerContext:'verified-answer-retry-once',reportedReceipt:'verify-income-and-association',bookingStorage:'persist-before-confirmation-idempotent',ordinaryAgendaUpdates:'nightly-only',eventPreparation:'same-event-only',chiefMissingAnalysis:'silent-pending',communication:'external-privacy-guard',communicationGuard:PSYCHOLOGY_COMMUNICATION_GUARD,chiefAiDirectedTurn:'verified-single-turn',chiefNotifications:'durable-supervisor-outbox',chiefAudioRelease:'persisted-transcript',staffIdleMinutes:null,staffHandover:'explicit-chief-release',chiefStaffHandover:'explicit-chief-self-release',chiefAddressing:'direct-or-verified-bot-reply',chiefDirectedTurn:'without-global-release',staffEventOrdering:'latest-event-kept',staffObservation:'same-chat-context-without-reply',observationOutput:'reply-and-question-cleared',outboundSafety:'staff-rechecked-before-send',contactContext:'verified-professional-and-quoted-followup',rentalIntake:'verified-availability-quote-before-choice',rentalContinuation:'same-day-incomplete-and-literal-room-alternatives-v1',rentalCapacity:'source-preserved-human-review-before-proposal-v1',conversationTone:'warm-natural-booking-questions',bookingConfirmation:'natural-scoped-single-proposal',roomPreferences:'explicit-sourced-professional-choice',greeting:'compound-role-aware',socialCourtesy:'standalone-context-preserved',chiefQuestions:'source-request-and-specific-question',attachmentQuestions:'unknown-file-not-payment',audioTranscription:aiConfigured(),chiefNaturalLanguage:aiConfigured(),newContacts:true,patientRegistration:aiConfigured()?'confirmed-data':'human-review',returningPatient:aiConfigured()?'verified-record-preferences':'human-review',history:'recent-staff-and-bot',campaign:{audiences:['clients','professionals'],hours:'08:00-19:00 America/Bogota',minimumIntervalSeconds:60,contextReview:true,dailyRefresh:true,externalList:'awaiting-source-review'},booking:'confirmed-proposals',bookingIdentity:'verified-phone-and-history',bookingSafety:'human-specialty-catalog-rechecked',learning:'relevant-chief-instructions-with-sources',payments:'reviewed-evidence'}});
    if(!config.enabled||!config.activatedAt)return json({error:'Recepción pausada'},503);
    if(body.action==='notify-chief'){
      const notice=parseChiefNotification(body);
      if(!notice)return json({error:'Notificación inválida o destinatario fuera del ámbito'},400);
      const result=await prisma.$transaction(tx=>enqueueChiefNotification(tx,notice));
      return result.conflict?json({error:'La clave ya pertenece a otra notificación'},409):json(result,202);
    }
    if(body.action==='drain')return json(await drainPsychologyAutomation(config));
    if(body.action!=='event'||body.instance!==PSYCHOLOGY_INSTANCE||body.owner!==PSYCHOLOGY_PHONE)return json({error:'Evento fuera del ámbito'},400);
    const event=validateReceptionEvent(body.event,Date.now(),config.activatedAt.getTime());
    if(!event)return json({accepted:false,reason:'unsupported-or-stale-event'},202);
    return json(await enqueuePsychologyEvent(event),202);
  } catch { return json({error:'Procesamiento pendiente; revisión de la integración requerida'},503); }
}
