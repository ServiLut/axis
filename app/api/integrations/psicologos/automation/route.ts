import { NextRequest, NextResponse } from 'next/server';
import { authorizePsychologyIntegration } from '@/lib/psychology-integration-auth';
import { automationConfig, enqueuePsychologyEvent, drainPsychologyAutomation } from '@/lib/psychology-automation';
import { validateReceptionEvent, PSYCHOLOGY_INSTANCE, PSYCHOLOGY_PHONE } from '@/lib/psychology-reception';
import {aiConfigured} from '@/lib/psychology-ai';
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
    if(body.action==='ignore')return json({accepted:false,reason:'unsupported-event'},202);
    if(body.action==='status')return json({tenantId:4,companyId:3,enabled:config.enabled,paymentPolicy:config.paymentPolicy,mode:'administrative-reception-with-human-review',capabilities:{staffIdleMinutes:null,staffHandover:'explicit-chief-release',chiefStaffHandover:'explicit-chief-self-release',chiefAddressing:'explicit-luisa-or-bot-only',staffEventOrdering:'latest-event-kept',staffObservation:'same-chat-context-without-reply',observationOutput:'reply-and-question-cleared',outboundSafety:'staff-rechecked-before-send',contactContext:'verified-professional-and-quoted-followup',rentalIntake:'multiple-slots-verified-room-name',conversationTone:'warm-natural-booking-questions',bookingConfirmation:'natural-scoped-single-proposal',roomPreferences:'explicit-sourced-professional-choice',greeting:'neutral-context-checked',chiefQuestions:'source-request-and-specific-question',attachmentQuestions:'unknown-file-not-payment',audioTranscription:aiConfigured(),chiefNaturalLanguage:aiConfigured(),newContacts:true,patientRegistration:aiConfigured()?'confirmed-data':'human-review',returningPatient:aiConfigured()?'verified-record-preferences':'human-review',history:'recent-staff-and-bot',campaign:{audiences:['clients','professionals'],hours:'08:00-19:00 America/Bogota',minimumIntervalSeconds:60,contextReview:true,dailyRefresh:true,externalList:'awaiting-source-review'},booking:'confirmed-proposals',bookingIdentity:'verified-phone-and-history',bookingSafety:'human-specialty-catalog-rechecked',learning:'relevant-chief-instructions-with-sources',payments:'reviewed-evidence'}});
    if(!config.enabled||!config.activatedAt)return json({error:'Recepción pausada'},503);
    if(body.action==='drain')return json(await drainPsychologyAutomation(config));
    if(body.action!=='event'||body.instance!==PSYCHOLOGY_INSTANCE||body.owner!==PSYCHOLOGY_PHONE)return json({error:'Evento fuera del ámbito'},400);
    const event=validateReceptionEvent(body.event,Date.now(),config.activatedAt.getTime());
    if(!event)return json({accepted:false,reason:'unsupported-or-stale-event'},202);
    return json(await enqueuePsychologyEvent(event),202);
  } catch { return json({error:'Procesamiento pendiente; revisión de la integración requerida'},503); }
}
