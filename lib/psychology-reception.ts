/** Restricted administrative assistant; free clinical narratives are handed to a person. */
export const PSYCHOLOGY_PHONE = '573016818845';
export const SANDRA_PHONE = '573016803926';
export const PSYCHOLOGY_INSTANCE = 'psicologos-en-colombia';
export const normalizeText = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function phoneDigits(value: string): string | null {
  const digits = value.replace(/[+\s().-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits;
}
export type ReceptionEvent = { id: string; phone: string; at: string; kind: 'text'|'audio'|'attachment'; text: string; fromMe: boolean; quotedText?:string };
export function validateReceptionEvent(input: unknown, now: number, activatedAt: number): ReceptionEvent | null {
  if (!input || typeof input !== 'object') return null;
  const e = input as Record<string, unknown>;
  if (typeof e.id !== 'string' || !/^[A-Za-z0-9_:-]{5,160}$/.test(e.id) || typeof e.phone !== 'string' || phoneDigits(e.phone) !== e.phone) return null;
  if (typeof e.at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(e.at)) return null;
  const time = Date.parse(e.at);
  if (!Number.isFinite(time) || time < activatedAt || time < now - 3600000 || time > now + 120000) return null;
  if (!['text','audio','attachment'].includes(String(e.kind)) || typeof e.fromMe !== 'boolean' || typeof e.text !== 'string' || e.text.length > 8000) return null;
  if(e.quotedText!==undefined&&(typeof e.quotedText!=='string'||e.quotedText.length>1800))return null;
  return { id: e.id, phone: e.phone, at: e.at, kind: e.kind as ReceptionEvent['kind'], text: e.text, fromMe: e.fromMe, ...(e.quotedText?{quotedText:e.quotedText as string}:{}) };
}
export type ReceptionTemplates = Record<string, { text: string; approved: boolean; version: string }>;
export type PatientDraft={firstName?:string;lastName?:string;documentType?:string;document?:string;email?:string;address?:string};
export type IntakeState={draft:PatientDraft;summaryEvent?:string;clientId?:number;preference?:'male'|'female'|'either';professionalId?:number;returning?:boolean;priorAppointmentId?:string;priorServiceId?:string;date?:string;start?:string;modality?:'virtual'|'presencial';clarifications?:number};
export type ReceptionState = { rental?:import('./psychology-rental-intake').RentalDraft; context?:import('./psychology-reception-context').ReceptionContext; service?: string; servicesOffered?:string[]; offeredAt?: string; reason?: string; alerted?: boolean; clarifications?:number; intake?:IntakeState; humanHold?:{kind:'staff'|'manual'|'review'|'urgent'|'optout';resumeStage?:string;since?:string}; resumedFrom?:string };
export type ReceptionResult = { stage: string; state: ReceptionState; messages: string[]; handoff?: string };
export function pauseForStaff(stage:string,state:ReceptionState,at:string):ReceptionResult{
  if(state.humanHold&&state.humanHold.kind!=='staff')return {stage:'HUMAN',state,messages:[]};
  if(stage==='HUMAN'&&state.reason!=='Atención de una persona'&&!state.humanHold)return {stage:'HUMAN',state:{...state,humanHold:{kind:'review',since:at}},messages:[]};
  return {stage:'HUMAN',state:{...state,reason:'Atención de una persona',humanHold:{kind:'staff',since:at,resumeStage:stage==='HUMAN'?state.humanHold?.resumeStage||'NEED':stage}},messages:[]};
}
export function resumeReception(state:ReceptionState):{stage:string;state:ReceptionState}{
  const previous=state.humanHold?.resumeStage;
  const stage=previous&&['NEED','MENU','OFFER','PAYMENT_FORMAT','DATA','PREFERENCES','DETAILS','RENTAL_DETAILS'].includes(previous)?previous:previous==='DATA_CONFIRM'?'DATA':'NEED';
  const next={...state};delete next.humanHold;delete next.reason;delete next.alerted;delete next.clarifications;
  return {stage,state:next};
}
export function isFastGreeting(event:ReceptionEvent,stage:string):boolean{
  return stage==='NEW'&&!event.fromMe&&event.kind==='text'&&![SANDRA_PHONE,PSYCHOLOGY_PHONE].includes(event.phone)&&/^(hola[!.\s😊]*|buenos dias|buenas tardes|buenas noches|buenas|informacion|info)$/.test(normalizeText(event.text));
}
const menu: Record<string,string> = { '1':'individual','2':'pareja','3':'infantil','4':'sexologia','5':'familiar','6':'alquiler','7':'certificado','8':'profesional','9':'empresarial' };
const shortcuts: Record<string,string> = { alquiler:'oficina',individual:'individual',pareja:'pareja',infantil:'infantil',sexologia:'sexologia',familiar:'familiar',neuropsicologia:'neuropsicologia',certificado:'certificado' };
const label: Record<string,string> = { individual:'terapia individual',pareja:'terapia de pareja',infantil:'terapia infantil',sexologia:'sexología',familiar:'terapia familiar',alquiler:'alquiler de consultorio',neuropsicologia:'neuropsicología',certificado:'certificado de apoyo emocional' };
function explicitService(text: string) {
  const cleaned = normalizeText(text).replace(/[¿?¡!.,]/g,'');
  // Deliberately limited grammar: a narrative containing a service word is not triaged as safe.
  const match = /^(?:(?:hola )?(?:quiero|necesito|busco|informacion(?: de| sobre)?|precio(?: de)?|terapia|consulta)(?: una?| para| de)? )?(individual|pareja|infantil|sexologia|familiar|alquiler(?: de consultorio)?|neuropsicologia|certificado(?: de apoyo emocional)?)$/.exec(cleaned);
  return match?.[1].replace(' de consultorio','').replace(' de apoyo emocional','');
}
function template(templates: ReceptionTemplates, key: string): string | null {
  const t = templates[key]; return t?.approved && t.version && t.text?.trim() ? t.text : null;
}
export function decideReception(event: ReceptionEvent, stage: string, state: ReceptionState, templates: ReceptionTemplates, paymentPolicy: string): ReceptionResult {
  const result = (next: string, messages: string[], extra: Partial<ReceptionState> = {}): ReceptionResult => ({ stage:next,state:{...state,...extra},messages });
  const handoff = (reason: string, acknowledgement = 'Gracias por contarnos. Voy a pedir apoyo a nuestra coordinadora para orientarte con cuidado.'): ReceptionResult => ({...result('HUMAN',stage==='HUMAN'?[]:[acknowledgement],{reason,humanHold:{kind:reason==='Atención humana urgente'?'urgent':'review',resumeStage:stage,since:event.at}}),handoff:reason});
  if (event.fromMe) return pauseForStaff(stage,state,event.at);
  const text=normalizeText(event.text);
  // This flags some emergencies; absence never classifies a clinical narrative as low risk.
  if (/suicid|matarme|quitarme la vida|me quiero morir|me corte|me estoy cortando|sobredosis|no quiero vivir/.test(text)) return handoff('Atención humana urgente','Siento que estés pasando por esto. Tu seguridad es lo primero. ¿Estás a salvo y hay alguien de confianza contigo? Si te has lesionado o estás en peligro inmediato, llama al 123 o acude a urgencias. Estoy avisando a nuestra coordinadora para acompañarte.');
  if (stage==='HUMAN') return result(stage,[]);
  if (event.kind==='audio') return handoff('Audio pendiente de transcripción','Recibí tu audio 😊 Lo revisaré con nuestra coordinadora para responderte bien.');
  if (event.kind==='attachment') return handoff('Archivo o comprobante pendiente de revisión','Recibí tu archivo 😊 Vamos a revisarlo y te confirmaremos.');
  if (/^(?:no|no gracias|parar|stop|no me escriban|no me escribas)$/.test(text)) return result('HUMAN',['Entendido, respetamos tu decisión. Aquí estaremos cuando nos necesites.'],{reason:'No contactar',humanHold:{kind:'optout',since:event.at}});
  if (stage==='NEW' && /^(hola[!.\s😊]*|buenos dias|buenas tardes|buenas noches|buenas|informacion|info)$/.test(text)) return result('NEED',['Hola 😊 ¿Cómo estás? Soy Luisa Fernanda de *Psicólogos en Colombia*. Cuéntame, ¿en qué podemos ayudarte hoy?']);
  if (['NEW','NEED','MENU'].includes(stage)) {
    if (/^\/?servicios?$|^que servicios (tienen|ofrecen)$|^no se$|^menu$/.test(text)) {
      const t=template(templates,'servicios');return t?result('MENU',[t]):handoff('Falta respuesta rápida de servicios');
    }
    const service=(stage==='MENU'?menu[text]:null)||explicitService(text);
    if (!service) return handoff('Caso o solicitud requiere orientación humana');
    const t=template(templates,shortcuts[service]);
    if (!t) return handoff(`Respuesta rápida pendiente: ${service}`);
    return result('OFFER',[t,`Estos son nuestros precios para ${label[service]}. ¿Deseas continuar con el agendamiento?`],{service,offeredAt:event.id});
  }
  if(stage==='OFFER' && /^(si|si gracias|claro|de acuerdo|quiero agendar|agendemos|continuar|listo|vale|ok)[.!\s😊]*$/.test(text)) {
    if(state.service==='alquiler') return result('DETAILS',['Claro 😊 ¿Qué día, a qué hora y por cuánto tiempo necesitas el consultorio?']);
    if(paymentPolicy==='REVIEW') return handoff('Confirmar condiciones de reserva antes de solicitar pago','Claro 😊 Nuestra coordinadora te ayudará a confirmar las condiciones de tu reserva.');
    if(paymentPolicy==='DEPOSIT_20000') return result('PAYMENT_FORMAT',['¿Deseas una sesión suelta, comprar un paquete o usar un paquete que ya pagaste?']);
    const t=template(templates,'datos');return t?result('DATA',['Por favor, regálame estos datos 😊',t]):handoff('Falta respuesta rápida de datos');
  }
  if(stage==='PAYMENT_FORMAT'&&paymentPolicy==='DEPOSIT_20000') {
    if(/ya (pague|pagado|tengo)|paquete (pagado|vigente)|usar (mi|un) paquete/.test(text))return handoff('Verificar saldo del paquete pagado; no pedir nuevo anticipo','Si tu paquete ya está pagado, no necesitas otro anticipo 😊 Revisaremos las sesiones disponibles.');
    const single=/^(una?|1) (sola )?sesion(?: suelta)?$|^sesion suelta$|^individual$|^1$/.test(text);
    const pack=/^(?:comprar |un |el )?paquete(?: de (?:3|5|7|10) sesiones)?$|^(3|5|7|10) sesiones$/.test(text);
    if(single||pack) {
      const rule=template(templates,single?'reserva_sesion':'reserva_paquete');
      const data=template(templates,'datos');
      if(rule&&data)return result('DATA',[rule,'Por favor, regálame estos datos 😊',data]);
    }
    return handoff('Aclarar modalidad de compra antes de solicitar pago');
  }
  if(stage==='DATA') return handoff('Validar datos y registro del paciente','Gracias 😊 ¿Prefieres psicólogo o psicóloga? ¿Qué días y horarios te quedan mejor, y presencial o virtual?');
  if(stage==='DETAILS') return handoff('Verificar registro, consultorio y confirmación del profesional','Gracias 😊 Revisaremos la disponibilidad del consultorio y te confirmaremos.');
  return handoff('Pregunta o preferencia requiere revisión');
}
