import {SANDRA_PHONE,normalizeText} from './psychology-reception';

/** Last-mile guard for internal process details, including older queued messages. */
export function psychologyCommunicationIssue(phone:string,content:string):string|null {
 if(phone===SANDRA_PHONE)return null; // Authorized internal questions and reports have their own recipient gate.
 const text=normalizeText(content);
 if(/\b(tenant\s*\d*|webhook|payload|api[_ -]?key|token de acceso|n8n|chatwoot|evolution api|axis|sql|outbox)\b/.test(text))return 'INTERNAL_TECHNICAL_DETAIL';
 if(/\b(?:voy|vamos|debo|debemos|estoy|estamos|lo|le|te|hemos)\b.{0,65}\b(?:consultar|consultarlo|preguntar|avisar|avisando|informar|escalar|notificar|pedir apoyo|verificar|revisar)\b.{0,65}\b(?:sandra|coordinadora?|equipo|supervisor|personal|profesional)\b/s.test(text)
   ||/\b(?:consultare|consultaremos|preguntare|avisare|informare|revisare|revisaremos)\b.{0,65}\b(?:sandra|coordinadora?|equipo|profesional)\b/s.test(text))return 'INTERNAL_ROUTING_DETAIL';
 if(/\b(abogados en colombia|crearcoop|control de plagas)\b/.test(text))return 'OTHER_BUSINESS';
 if(/(?:sk-[a-z0-9_-]{20,}|-----begin .*private key-----|bearer\s+[a-z0-9_.-]{16,})/i.test(content))return 'SECRET_PATTERN';
 return null;
}
