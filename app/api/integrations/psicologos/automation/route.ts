import { NextRequest, NextResponse } from 'next/server';
import { authorizePsychologyIntegration } from '@/lib/psychology-integration-auth';
import { automationConfig, enqueuePsychologyEvent, drainPsychologyAutomation } from '@/lib/psychology-automation';
import { validateReceptionEvent, PSYCHOLOGY_INSTANCE, PSYCHOLOGY_PHONE } from '@/lib/psychology-reception';
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
    if(body.action==='status')return json({tenantId:4,companyId:3,enabled:config.enabled,paymentPolicy:config.paymentPolicy,mode:'administrative-reception-with-human-review'});
    if(!config.enabled||!config.activatedAt)return json({error:'Recepción pausada'},503);
    if(body.action==='drain')return json(await drainPsychologyAutomation(config));
    if(body.action!=='event'||body.instance!==PSYCHOLOGY_INSTANCE||body.owner!==PSYCHOLOGY_PHONE)return json({error:'Evento fuera del ámbito'},400);
    const event=validateReceptionEvent(body.event,Date.now(),config.activatedAt.getTime());
    if(!event)return json({accepted:false,reason:'unsupported-or-stale-event'},202);
    return json(await enqueuePsychologyEvent(event),202);
  } catch { return json({error:'Procesamiento pendiente; revisión de la integración requerida'},503); }
}
