import {SANDRA,DIEGO} from './config.mjs';
export function decodeWebhook(body,config) {
  const line=config.lines.find(l=>l.instance===body.instance);if(!line)return {events:[],deliveries:[]};
  const events=[],deliveries=[];const data=Array.isArray(body.data)?body.data:[body.data];
  if(body.event==='messages.upsert')for(const d of data){
    const key=d?.key;let jid=key?.remoteJid;
    // Accept only the authenticated provider's explicit phone alternative for the two verified internal contacts.
    // A bare LID, group participant or display name never supplies authority.
    if(/^\d+@lid$/.test(jid||'')&&[SANDRA,DIEGO].map(p=>p+'@s.whatsapp.net').includes(key.remoteJidAlt))jid=key.remoteJidAlt;
    if(/^57\d{10}@s\.whatsapp\.net$/.test(jid||'')&&key.remoteJidAlt?.endsWith('@s.whatsapp.net')&&key.remoteJidAlt!==jid)continue;
    // A LID, display name or participant in a group is insufficient to resolve a direct sender.
    if(!/^57\d{10}@s\.whatsapp\.net$/.test(jid||'')||!key.id||typeof key.fromMe!=='boolean')continue;
    const m=d.message||{};let content=m;
    if(m.ephemeralMessage?.message)content=m.ephemeralMessage.message;
    const kind=content.audioMessage?'audio':content.imageMessage?'image':content.videoMessage?'video':content.documentMessage?'document':'text';
    const text=content.conversation??content.extendedTextMessage?.text??content.imageMessage?.caption??content.videoMessage?.caption??'';
    const context=content.extendedTextMessage?.contextInfo??content.audioMessage?.contextInfo??content.imageMessage?.contextInfo??content.messageContextInfo??d.contextInfo;
    const timestamp=typeof d.messageTimestamp==='object'?Number(d.messageTimestamp.low):Number(d.messageTimestamp);
    if(!Number.isFinite(timestamp)||typeof text!=='string')continue;
    events.push({instance:line.instance,owner:line.phone,event:{id:key.id,phone:jid.split('@')[0],at:new Date(timestamp*1000).toISOString(),kind,text,fromMe:key.fromMe,forwarded:context?.isForwarded===true||Number(context?.forwardingScore)>0,quotedId:context?.stanzaId??null}});
  }
  if(body.event==='messages.update')for(const d of data){
    const mid=d?.key?.id??d?.keyId;const status=d?.update?.status??d?.status;
    const state=({DELIVERY_ACK:'DELIVERED',READ:'READ',3:'DELIVERED',4:'READ'})[status];
    if(mid&&state)deliveries.push({instance:line.instance,owner:line.phone,mid,state});
  }
  return {events,deliveries};
}
