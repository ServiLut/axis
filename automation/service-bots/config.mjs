import { createHash, timingSafeEqual } from 'node:crypto';
import {aiConfiguration} from './ai-settings.mjs';
import {registrationConfig} from './maria-program.mjs';
import {tesaConfiguration} from './tesa-config.mjs';

export const BUSINESSES = Object.freeze({
  fumigacion: { name: 'FUMIGACION', bot: 'María Ángel', phones: ['573126944997','573126938721'] },
  'servicio-tecnico': { name: 'S.TECNICO', bot: 'Miguel Ángel', phones: ['573022691941','573137689392'] },
});
export const SANDRA = '573016803926';
export const DIEGO = '573233350137';
export const HILARY = '573043332213';
export const OPERATOR_ROUTING = 'diego-hilary-20261005';
export const CURRENT_OPERATOR_ROUTING = 'hilary-and-fumigacion-blue-20261008';
export const TECHNICAL_COORDINATOR = '573126944997';
const ownServiceLines = Object.values(BUSINESSES).flatMap(business=>business.phones);
export const knownInternalRecipient = phone => [SANDRA,DIEGO,HILARY,...ownServiceLines].includes(phone);
export const operatorRoutingActive = config => [OPERATOR_ROUTING,CURRENT_OPERATOR_ROUTING].includes(config.operatorRouting);
// Diego is retained only to recognize an exact delivered historical question.
// The engine/transport guards for the current route block new dialogue/sends to him.
export const internalRecipients = config => [SANDRA,DIEGO,
  ...(config.company==='fumigacion'&&operatorRoutingActive(config)?[HILARY]:[]),
  ...(config.company==='servicio-tecnico'&&config.operatorRouting===CURRENT_OPERATOR_ROUTING?[TECHNICAL_COORDINATOR]:[])];
export const internalName = phone => phone===SANDRA?'Sandra':phone===HILARY?'Hilary':phone===DIEGO?'Diego':phone===TECHNICAL_COORDINATOR?'Coordinación':'Personal';
export function questionRecipients(config,topic,conditions={}) {
  const operational=['cotizacion-verificada','special-quotation','disponibilidad-y-cotizacion','disponibilidad-y-tecnico','service-followup','requested-technician-contact','existing-quotation'];
  if(!operatorRoutingActive(config)||!operational.includes(topic)&&!topic.startsWith('missing-intake:'))return [SANDRA];
  if(config.operatorRouting===CURRENT_OPERATOR_ROUTING){
    if(!BUSINESSES[config.company])return [SANDRA];
    if(topic.startsWith('missing-intake:')&&!['service','site','size','mattresses','detail','location','preference'].includes(topic.slice('missing-intake:'.length)))return [SANDRA];
    // Arrival is operational. Post-service/control/guarantee or unknown kinds keep direction review.
    if(topic==='service-followup'&&conditions?.kind!=='arrival')return [SANDRA];
    return config.company==='fumigacion'?[HILARY]:[TECHNICAL_COORDINATOR];
  }
  return config.company==='fumigacion'?[DIEGO,HILARY]:[DIEGO];
}
export const digits = value => String(value ?? '').replace(/\D/g, '');
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

export function configFromEnv(env = process.env) {
  const company = env.BOT_COMPANY;
  if (!BUSINESSES[company]) throw new Error('COMPANY_REQUIRED');
  const business = BUSINESSES[company];
  const lines = JSON.parse(env.BOT_LINES_JSON || '[]');
  if (lines.length !== 2 || new Set(lines.map(l=>l.phone)).size !== 2 || new Set(lines.map(l=>l.instance)).size !== 2 ||
      lines.some(l=>!business.phones.includes(l.phone) || !/^[a-z0-9][a-z0-9_-]{1,80}$/i.test(l.instance) ||
      ['abogados','psicologos-en-colombia'].includes(l.instance))) throw new Error('OWN_LINES_REQUIRED');
  if (!/^[a-f0-9]{64}$/.test(env.BOT_AUTH_TOKEN_HASH || '') || !/^[a-f0-9]{64}$/.test(env.BOT_WEBHOOK_TOKEN_HASH || '') ||
      env.BOT_AUTH_TOKEN_HASH===env.BOT_WEBHOOK_TOKEN_HASH || !/^[a-f0-9]{64}$/.test(env.BOT_DATA_KEY || '')) throw new Error('DEDICATED_KEYS_REQUIRED');
  const database = env.BOT_DATABASE_PATH;
  if (!database || !database.replaceAll('\\','/').includes('/'+company+'/')) throw new Error('SEPARATE_DATABASE_REQUIRED');
  const provider = new URL(env.BOT_EVOLUTION_URL);
  if (provider.protocol !== 'https:' || provider.username || provider.password || provider.search || provider.hash) throw new Error('PROVIDER_HTTPS_REQUIRED');
  // Evolution instance keys restrict the provider itself, not just our local filter.
  // A shared/global key must never be installed in either business runtime.
  if (env.BOT_EVOLUTION_TOKEN || lines.some(l=>!/^[A-Za-z0-9_-]{24,128}$/.test(l.apiKey || '')) ||
      new Set(lines.map(l=>l.apiKey)).size !== 2) throw new Error('DEDICATED_INSTANCE_ACCESS_REQUIRED');
  if((env.BOT_ENABLED==='true'||env.BOT_CHIEF_ONLY==='true')&&!Number.isFinite(Date.parse(env.BOT_ACTIVATED_AT||'')))throw new Error('ACTIVATION_CUTOFF_REQUIRED');
  if(env.BOT_ENABLED==='true'&&env.BOT_PRIOR_HISTORY_CHECK!=='true')throw new Error('PRIOR_HISTORY_GUARD_REQUIRED');
  if(env.BOT_OPERATIONAL_ROUTING&&!['sandra',OPERATOR_ROUTING,CURRENT_OPERATOR_ROUTING].includes(env.BOT_OPERATIONAL_ROUTING))throw Error('OPERATOR_ROUTING_REQUIRED');
  return { operatorRouting:env.BOT_OPERATIONAL_ROUTING||'sandra',company, ...business, lines, database, encryptionKey: Buffer.from(env.BOT_DATA_KEY,'hex'),
    authHash: env.BOT_AUTH_TOKEN_HASH, webhookHash:env.BOT_WEBHOOK_TOKEN_HASH, provider: provider.href.replace(/\/$/,''),
    enabled: env.BOT_ENABLED === 'true', chiefOnly:env.BOT_CHIEF_ONLY==='true', activatedAt: Date.parse(env.BOT_ACTIVATED_AT || ''),
    historyCheckRequired:env.BOT_PRIOR_HISTORY_CHECK==='true',
    port: Number(env.PORT || 8080), programContextUrl: env.BOT_PROGRAM_CONTEXT_URL || null,
    programToken: env.BOT_PROGRAM_READ_TOKEN || null, expectedProgramCompanyId: env.BOT_PROGRAM_COMPANY_ID || null,
    aiUrl: env.BOT_UNDERSTANDING_URL || null, aiToken: env.BOT_UNDERSTANDING_TOKEN || null,
    responseTargetMs:company==='fumigacion'?3000:null,
    inactivityFollowupEnabled:company==='fumigacion'&&env.BOT_CUSTOMER_INACTIVITY_FOLLOWUP==='true',
    tesaOperations:tesaConfiguration(env,company,lines,Date.parse(env.BOT_ACTIVATED_AT || '')),
    mariaProgram:registrationConfig(env,company),
    conversationalAi:aiConfiguration(env,company) };
}

export function authorized(header, hash) {
  if (!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header || '')) return false;
  const actual = createHash('sha256').update(header.slice(7)).digest();
  return /^[a-f0-9]{64}$/.test(hash || '') && timingSafeEqual(actual,Buffer.from(hash,'hex'));
}

export function validateEvent(body, config, now = Date.now(), recoverChief = false) {
  const line = config.lines.find(l=>l.instance===body.instance && l.phone===body.owner);
  const event = body.event;
  const internal=event&&internalRecipients(config).includes(event.phone);
  if (!line || !event || (!config.enabled&&!(config.chiefOnly&&internal)) || !Number.isFinite(config.activatedAt)) return null;
  const at = Date.parse(event.at);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(event.id || '') || !/^57\d{10}$/.test(event.phone || '') ||
      typeof event.fromMe !== 'boolean' || !Number.isFinite(at) || at < config.activatedAt || at > now+60000 || at < now-(recoverChief&&internal&&!event.fromMe?86400000:600000) ||
      !['text','audio','image','document','video','call'].includes(event.kind) || typeof event.text !== 'string' || event.text.length > 6000 ||
      event.group === true || /@g\.us$/.test(event.jid || '')) return null;
  return { id:event.id, phone:event.phone, at, line:line.phone, kind:event.kind, fromMe:event.fromMe,
    text:event.text, forwarded:event.forwarded===true, quotedId:typeof event.quotedId==='string'?event.quotedId.slice(0,120):null };
}

export function publicTextSafe(text) {
  if(typeof text!=='string'||!text.trim()||text.length>=1500)return false;
  const value=normalize(text);
  const routing=/\b(?:voy|vamos|debo|debemos|estoy|estamos|necesito|necesitamos|lo|le|te|ya|hemos)\b.{0,65}\b(?:consult\w*|pregunt\w*|avis\w*|inform\w*|escal\w*|notific\w*|pedir apoyo|verific\w*|revis\w*)\b.{0,65}\b(?:diego|hilary|sandra|coordinador\w*|equipo|supervisor|personal)\b/s;
  const directRouting=/\b(?:consultare|consultaremos|preguntare|avisare|informare|verificare|verificaremos|revisare|revisaremos)\b.{0,65}\b(?:diego|hilary|sandra|coordinador\w*|equipo|supervisor|personal)\b/s;
  const mediaWork=/\b(?:estoy|estamos|voy a|vamos a|procedere a|procederemos a)\s+(?:transcrib\w*|proces\w*|convert\w*|analiz\w*|escuch\w*)\b.{0,65}\b(?:audio|mensaje de voz|archivo|adjunto|documento)\b/s;
  const transcription=/\b(?:transcribo|transcribimos|transcribire|transcribiremos|transcripcion|transcribiendo)\b.{0,65}\b(?:audio|mensaje de voz)\b/s;
  return !routing.test(value)&&!directRouting.test(value)&&!mediaWork.test(value)&&!transcription.test(value)&&
    !/(api.?key|bearer\s|contrase[nñ]a|token\s*[:=]|destinatario interno|webhook|payload|outbox|chatwoot|n8n|https?:\/\/)/i.test(text);
}
