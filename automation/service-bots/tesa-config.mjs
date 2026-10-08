export const TESA_GROUP_JID = '573137689392-1545079045@g.us';
export const TESA_GROUP_SUBJECT = 'GRUPO SERVICIOS TESA';
export const TESA_OPERATIONS_GUARD = 'own-group-native-participant-and-quoted-case-operations-v1';
export const TESA_MAX_MEMBERSHIP_TTL_MS = 86400000;
export const TESA_BOT_PHONES = Object.freeze(['573126944997','573126938721','573022691941','573137689392']);
const ownPhones = Object.freeze({fumigacion:TESA_BOT_PHONES.slice(0,2),'servicio-tecnico':TESA_BOT_PHONES.slice(2)});
const phonePattern = /^57\d{10}$/;
const pnJidPattern = /^57\d{10}@s\.whatsapp\.net$/;
const lidPattern = /^\d{5,30}@lid$/;
const time = value => typeof value === 'number' ? value : Date.parse(value || '');

function normalizedTesa(raw, company, lines, privateCutoff, now, allowExpired) {
  if (!raw || raw.enabled !== true || !ownPhones[company] || !Array.isArray(lines)) return null;
  const line = lines.find(value => value.phone === raw.senderLine && ownPhones[company].includes(value.phone));
  const activatedAt = time(raw.activatedAt), membership = raw.verifiedMembership;
  if (!line || raw.groupJid !== TESA_GROUP_JID || raw.groupSubject !== TESA_GROUP_SUBJECT ||
      !Number.isFinite(activatedAt) || !Number.isFinite(privateCutoff) || activatedAt < privateCutoff || activatedAt > now+60000 ||
      !membership || membership.owner !== line.phone || membership.ownerOpen !== true ||
      !/^[a-f0-9]{64}$/.test(membership.sourceHash || '')) return null;
  if (membership.groupJid !== undefined && membership.groupJid !== TESA_GROUP_JID ||
      membership.groupSubject !== undefined && membership.groupSubject !== TESA_GROUP_SUBJECT) return null;
  const verifiedAt = time(membership.verifiedAt), expiresAt = time(membership.expiresAt);
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt) || verifiedAt > now+60000 ||
      expiresAt <= verifiedAt || expiresAt-verifiedAt > TESA_MAX_MEMBERSHIP_TTL_MS ||
      !allowExpired && expiresAt <= now) return null;
  const bindings = membership.participantBindings, phones = membership.participantPhones, allowed = raw.allowedParticipantPhones;
  if (!Array.isArray(bindings) || bindings.length < 1 || bindings.length > 100 ||
      !Array.isArray(phones) || phones.length < 1 || phones.length > 100 ||
      new Set(phones).size !== phones.length || phones.some(phone => !phonePattern.test(phone)) || !phones.includes(line.phone) ||
      !Array.isArray(allowed) || allowed.length < 1 || allowed.length > 100 || new Set(allowed).size !== allowed.length ||
      allowed.some(phone => !phonePattern.test(phone) || !phones.includes(phone) || TESA_BOT_PHONES.includes(phone))) return null;
  const seenJids = new Set(), seenPhones = new Set();
  for (const binding of bindings) {
    if (!binding || typeof binding.jid !== 'string' || !pnJidPattern.test(binding.jid) && !lidPattern.test(binding.jid) || seenJids.has(binding.jid)) return null;
    seenJids.add(binding.jid);
    if (binding.phone === null && lidPattern.test(binding.jid)) continue;
    if (!phonePattern.test(binding.phone || '') || !phones.includes(binding.phone) || seenPhones.has(binding.phone) ||
        pnJidPattern.test(binding.jid) && binding.jid !== binding.phone+'@s.whatsapp.net') return null;
    seenPhones.add(binding.phone);
  }
  if (seenPhones.size !== phones.length || phones.some(phone => !seenPhones.has(phone))) return null;
  return {...raw, activatedAt, verifiedMembership:{...membership,verifiedAt,expiresAt,
    participantPhones:[...phones],participantBindings:bindings.map(binding => ({jid:binding.jid,phone:binding.phone}))},
    allowedParticipantPhones:[...allowed]};
}

// Metadata is supplied by the own verified setup/transport, never by a webhook body.
// Expired bootstrap is retained so the transport can refresh it without reopening a private route.
export function tesaConfiguration(env, company, lines, privateCutoff, now = Date.now()) {
  if (env.BOT_TESA_OPERATIONS_ENABLED !== 'true') return {enabled:false,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,
    senderLine:null,activatedAt:null,verifiedMembership:null,allowedParticipantPhones:[]};
  let metadata;
  try { metadata = JSON.parse(env.BOT_TESA_VERIFIED_METADATA_JSON || 'null'); } catch { throw Error('TESA_VERIFIED_METADATA_REQUIRED'); }
  const raw = {...metadata,enabled:true,activatedAt:env.BOT_TESA_ACTIVATED_AT};
  const result = normalizedTesa(raw,company,lines,privateCutoff,now,true);
  if (!result) throw Error('TESA_VERIFIED_METADATA_REQUIRED');
  return result;
}

export function getTesaConfig(config, now = Date.now()) {
  return normalizedTesa(config?.tesaOperations,config?.company,config?.lines,config?.activatedAt,now,false);
}
export const tesaMembershipReady = (config, now = Date.now()) => getTesaConfig(config,now) !== null;

export function tesaOperationalTopic(topic, conditions = {}) {
  if (typeof topic !== 'string') return false;
  if (topic === 'service-followup') return conditions?.kind === 'arrival';
  if (topic.startsWith('missing-intake:')) return ['service','site','size','mattresses','detail','location','preference'].includes(topic.slice('missing-intake:'.length));
  return ['cotizacion-verificada','special-quotation','disponibilidad-y-cotizacion','disponibilidad-y-tecnico',
    'requested-technician-contact','existing-quotation'].includes(topic);
}
