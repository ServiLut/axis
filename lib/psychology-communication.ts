import {SANDRA_PHONE,normalizeText} from './psychology-reception';
export const PSYCHOLOGY_COMMUNICATION_GUARD='private-routing-and-media-work-v2';

/** Last-mile guard for internal process details, including older queued messages. */
export function psychologyCommunicationIssue(phone:string,content:string):string|null {
 if(phone===SANDRA_PHONE)return null; // Authorized internal questions and reports have their own recipient gate.
 const text=normalizeText(content);
 if(/\b(tenant\s*\d*|webhook|payload|api[_ -]?key|token de acceso|n8n|chatwoot|evolution api|axis|sql|outbox)\b/.test(text))return 'INTERNAL_TECHNICAL_DETAIL';
 if(/\b(?:voy|vamos|debo|debemos|estoy|estamos|necesito|necesitamos|lo|le|te|ya|hemos)\b.{0,65}\b(?:consult\w*|pregunt\w*|avis\w*|inform\w*|escal\w*|notific\w*|pedir apoyo|verific\w*|revis\w*)\b.{0,65}\b(?:diego|sandra|coordinador\w*|equipo|supervisor|personal|profesional)\b/s.test(text)
   ||/\b(?:consultare|consultaremos|preguntare|avisare|informare|verificare|verificaremos|revisare|revisaremos)\b.{0,65}\b(?:diego|sandra|coordinador\w*|equipo|supervisor|personal|profesional)\b/s.test(text))return 'INTERNAL_ROUTING_DETAIL';
 if(/\b(?:estoy|estamos|voy a|vamos a|procedere a|procederemos a)\s+(?:transcrib\w*|proces\w*|convert\w*|analiz\w*|escuch\w*)\b.{0,65}\b(?:audio|mensaje de voz|archivo|adjunto|documento)\b/s.test(text)
   ||/\b(?:transcribo|transcribimos|transcribire|transcribiremos|transcripcion|transcribiendo)\b.{0,65}\b(?:audio|mensaje de voz)\b/s.test(text))return 'INTERNAL_MEDIA_PROCESS';
 if(/\b(abogados en colombia|crearcoop|control de plagas)\b/.test(text))return 'OTHER_BUSINESS';
 if(/(?:sk-[a-z0-9_-]{20,}|-----begin .*private key-----|bearer\s+[a-z0-9_.-]{16,})/i.test(content))return 'SECRET_PATTERN';
 return null;
}
