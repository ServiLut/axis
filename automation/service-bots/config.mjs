import { createHash, timingSafeEqual } from 'node:crypto';

export const BUSINESSES = Object.freeze({
  fumigacion: { name: 'FUMIGACION', bot: 'María Ángel', phones: ['573126944997','573126938721'] },
  'servicio-tecnico': { name: 'S.TECNICO', bot: 'Miguel Ángel', phones: ['573022691941','573137689392'] },
});
export const SANDRA = '573016803926';
export const DIEGO = '573233350137';
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
  if(env.BOT_ENABLED==='true'&&!Number.isFinite(Date.parse(env.BOT_ACTIVATED_AT||'')))throw new Error('ACTIVATION_CUTOFF_REQUIRED');
  return { company, ...business, lines, database, encryptionKey: Buffer.from(env.BOT_DATA_KEY,'hex'),
    authHash: env.BOT_AUTH_TOKEN_HASH, webhookHash:env.BOT_WEBHOOK_TOKEN_HASH, provider: provider.href.replace(/\/$/,''),
    enabled: env.BOT_ENABLED === 'true', activatedAt: Date.parse(env.BOT_ACTIVATED_AT || ''),
    port: Number(env.PORT || 8080), programContextUrl: env.BOT_PROGRAM_CONTEXT_URL || null,
    programToken: env.BOT_PROGRAM_READ_TOKEN || null, expectedProgramCompanyId: env.BOT_PROGRAM_COMPANY_ID || null,
    aiUrl: env.BOT_UNDERSTANDING_URL || null, aiToken: env.BOT_UNDERSTANDING_TOKEN || null };
}

export function authorized(header, hash) {
  if (!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header || '')) return false;
  const actual = createHash('sha256').update(header.slice(7)).digest();
  return /^[a-f0-9]{64}$/.test(hash || '') && timingSafeEqual(actual,Buffer.from(hash,'hex'));
}

export function validateEvent(body, config, now = Date.now()) {
  const line = config.lines.find(l=>l.instance===body.instance && l.phone===body.owner);
  const event = body.event;
  if (!line || !event || !config.enabled || !Number.isFinite(config.activatedAt)) return null;
  const at = Date.parse(event.at);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(event.id || '') || !/^57\d{10}$/.test(event.phone || '') ||
      typeof event.fromMe !== 'boolean' || !Number.isFinite(at) || at < config.activatedAt || at > now+60000 || at < now-600000 ||
      !['text','audio','image','document','video','call'].includes(event.kind) || typeof event.text !== 'string' || event.text.length > 6000 ||
      event.group === true || /@g\.us$/.test(event.jid || '')) return null;
  return { id:event.id, phone:event.phone, at, line:line.phone, kind:event.kind, fromMe:event.fromMe,
    text:event.text, quotedId:typeof event.quotedId==='string'?event.quotedId.slice(0,120):null };
}

export function publicTextSafe(text) {
  return typeof text==='string' && text.length>0 && text.length<1500 &&
    !/(api.?key|bearer\s|contrase[nñ]a|token\s*[:=]|destinatario interno|voy a (?:preguntar|informar) (?:a )?(?:diego|sandra)|https?:\/\/)/i.test(text);
}
