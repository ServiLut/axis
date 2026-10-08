import {getTesaConfig,TESA_GROUP_JID,TESA_GROUP_SUBJECT,TESA_BOT_PHONES} from './tesa-config.mjs';
export {TESA_GROUP_JID,TESA_GROUP_SUBJECT} from './tesa-config.mjs';
const pnJidPattern = /^57\d{10}@s\.whatsapp\.net$/;
const lidPattern = /^\d{5,30}@lid$/;
const nativeIdPattern = /^[A-Za-z0-9_-]{8,100}$/;

function participantIdentity(jid, altJid, tesa) {
  if (!pnJidPattern.test(jid || '') && !lidPattern.test(jid || '')) return null;
  if (altJid !== undefined && altJid !== null && !pnJidPattern.test(altJid) && !lidPattern.test(altJid)) return null;
  const bindings = tesa.verifiedMembership.participantBindings;
  const resolve = value => pnJidPattern.test(value || '') ?
    (tesa.verifiedMembership.participantPhones.includes(value.split('@')[0]) ? value.split('@')[0] : undefined) :
    bindings.find(binding => binding.jid === value)?.phone;
  const primary = resolve(jid), alternative = altJid ? resolve(altJid) : undefined;
  // A LID must occur in the verified native metadata; a phone alternative cannot establish a new binding.
  if (lidPattern.test(jid) && !bindings.some(binding => binding.jid === jid) ||
      altJid && lidPattern.test(altJid) && !bindings.some(binding => binding.jid === altJid)) return null;
  if (altJid && (primary === undefined || alternative === undefined || primary !== alternative)) return null;
  if (primary === undefined) return null;
  return {phone:primary,jid,altJid:altJid || null,canonicalJid:primary ? primary+'@s.whatsapp.net' : null};
}

function quoteFromContexts(contexts, tesa) {
  const quoted = contexts.filter(context => typeof context.stanzaId === 'string' && context.stanzaId.trim());
  if (!quoted.length || quoted.some(context => !nativeIdPattern.test(context.stanzaId))) return null;
  const mids = new Set(quoted.map(context => context.stanzaId));
  if (mids.size !== 1) return null;
  const authors = [], nativeAuthors = [];
  for (const context of quoted) {
    if (context.remoteJid !== undefined && context.remoteJid !== TESA_GROUP_JID) return null;
    const identity = participantIdentity(context.participant,context.participantAlt,tesa);
    if (!identity?.phone) return null;
    authors.push(identity.canonicalJid);nativeAuthors.push(identity.jid);
  }
  if (new Set(authors).size !== 1) return null;
  return {mid:quoted[0].stanzaId,groupJid:TESA_GROUP_JID,participantJid:authors[0],
    participantPhone:authors[0].split('@')[0],nativeParticipantJid:nativeAuthors[0]};
}

function mediaMetadata(content, kind, id) {
  if (kind === 'text') return null;
  const source = content[kind+'Message'] || {};
  const rawSize = source.fileLength?.low ?? source.fileLength;
  const size = rawSize === null || rawSize === undefined ? NaN : Number(rawSize);
  const hash = typeof source.fileSha256 === 'string' && /^[A-Za-z0-9+/=_-]{32,128}$/.test(source.fileSha256) ? source.fileSha256 : null;
  return {nativeId:id,mime:typeof source.mimetype === 'string' ? source.mimetype.slice(0,200) : null,
    fileName:typeof source.fileName === 'string' ? source.fileName.slice(0,256) : null,
    sizeBytes:Number.isSafeInteger(size) && size >= 0 ? size : null,sha256:hash,originalContentRead:false};
}

export function validateTesaGroupEvent(event, config, now = Date.now()) {
  const tesa = getTesaConfig(config,now);
  const line = config?.lines?.find(value => value.phone === event?.receivingLine &&
    tesa?.verifiedMembership.participantPhones.includes(value.phone));
  if (!tesa || !event || event.company !== config.company || event.groupJid !== TESA_GROUP_JID ||
      !line || event.line !== line.phone ||
      !nativeIdPattern.test(event.id || '') || typeof event.fromMe !== 'boolean' ||
      !['text','audio','image','document','video'].includes(event.kind) || typeof event.text !== 'string' || event.text.length > 6000 ||
      event.kind === 'text' && !event.text.trim()) return null;
  const at = typeof event.at === 'number' ? event.at : Date.parse(event.at || '');
  if (!Number.isFinite(at) || at < tesa.activatedAt || at < config.activatedAt || at < now-600000 || at > now+60000) return null;
  const participant = participantIdentity(event.participant?.jid,event.participant?.altJid,tesa);
  if (!participant || event.participant?.phone !== undefined && event.participant.phone !== participant.phone) return null;
  let quote = null;
  if (event.quote) {
    const sourceJid = event.quote.nativeParticipantJid || event.quote.participantJid;
    const identity = participantIdentity(sourceJid,event.quote.nativeParticipantAltJid,tesa);
    if (nativeIdPattern.test(event.quote.mid || '') && event.quote.groupJid === TESA_GROUP_JID && identity?.phone &&
        event.quote.participantJid === identity.canonicalJid) quote = {mid:event.quote.mid,groupJid:TESA_GROUP_JID,
          participantJid:identity.canonicalJid,participantPhone:identity.phone,nativeParticipantJid:identity.jid};
  }
  const forwarded = event.forwarded === true;
  const trustedHuman = !event.fromMe && !forwarded && participant.phone !== null &&
    !TESA_BOT_PHONES.includes(participant.phone) && tesa.allowedParticipantPhones.includes(participant.phone);
  return {id:event.id,company:config.company,groupJid:TESA_GROUP_JID,receivingLine:line.phone,line:line.phone,
    participant,at,kind:event.kind,text:event.text,fromMe:event.fromMe,forwarded,quote,trustedHuman,
    media:mediaMetadata({[event.kind+'Message']:{mimetype:event.media?.mime,fileName:event.media?.fileName,
      fileLength:event.media?.sizeBytes,fileSha256:event.media?.sha256}},event.kind,event.id)};
}

export function decodeTesaGroupWebhook(body, config, now = Date.now()) {
  const groupEvents = [], groupDeliveries = [], tesa = getTesaConfig(config,now);
  const line = config?.lines?.find(value => value.instance === body?.instance &&
    tesa?.verifiedMembership.participantPhones.includes(value.phone));
  if (!tesa || !line) return {groupEvents,groupDeliveries};
  const data = Array.isArray(body.data) ? body.data : [body.data];
  if (body.event === 'messages.upsert') for (const row of data) {
    const key = row?.key;
    if (key?.remoteJid !== TESA_GROUP_JID || typeof key.fromMe !== 'boolean' || !nativeIdPattern.test(key.id || '')) continue;
    const participant = participantIdentity(key.participant,key.participantAlt,tesa);
    if (!participant) continue;
    let content = row.message || {};
    if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
    const kind = content.audioMessage ? 'audio' : content.imageMessage ? 'image' : content.videoMessage ? 'video' : content.documentMessage ? 'document' : 'text';
    const text = content.conversation ?? content.extendedTextMessage?.text ?? content.imageMessage?.caption ?? content.videoMessage?.caption ?? '';
    const contexts = [content.extendedTextMessage?.contextInfo,content.audioMessage?.contextInfo,content.imageMessage?.contextInfo,
      content.videoMessage?.contextInfo,content.documentMessage?.contextInfo,content.messageContextInfo,row.contextInfo].filter(value => value && typeof value === 'object');
    const seconds = typeof row.messageTimestamp === 'object' ? Number(row.messageTimestamp?.low) : Number(row.messageTimestamp);
    if (!Number.isFinite(seconds) || !Number.isFinite(seconds*1000)) continue;
    const normalized = validateTesaGroupEvent({id:key.id,company:config.company,groupJid:TESA_GROUP_JID,receivingLine:line.phone,line:line.phone,
      participant,at:seconds*1000,kind,text,fromMe:key.fromMe,forwarded:contexts.some(value => value.isForwarded === true || Number(value.forwardingScore)>0),
      quote:quoteFromContexts(contexts,tesa),media:mediaMetadata(content,kind,key.id)},config,now);
    if (normalized) groupEvents.push(normalized);
  }
  if (body.event === 'messages.update') for (const row of data) {
    const key = row?.key;
    if (key?.remoteJid !== TESA_GROUP_JID || !nativeIdPattern.test(key.id || '')) continue;
    const status = row?.update?.status ?? row?.status;
    const state = ({DELIVERY_ACK:'DELIVERED',READ:'READ',3:'DELIVERED',4:'READ'})[status];
    if (state) groupDeliveries.push({company:config.company,groupJid:TESA_GROUP_JID,receivingLine:line.phone,line:line.phone,mid:key.id,state,
      receiptScope:'group-status-without-all-member-proof'});
  }
  return {groupEvents,groupDeliveries};
}
