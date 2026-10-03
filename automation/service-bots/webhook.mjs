import {SANDRA,DIEGO} from './config.mjs';
export function decodeWebhook(body,config) {
  const line=config.lines.find(l=>l.instance===body.instance);if(!line)return {events:[],deliveries:[]};
  const events=[],deliveries=[];const data=Array.isArray(body.data)?body.data:[body.data];
  if(body.event==='messages.upsert')for(const d of data){
    const key=d?.key;let jid=key?.remoteJid;
    // The own authenticated provider may supply an explicit direct phone alternative.
    // Authority still comes from validateEvent's exact internal roles, never a LID or name.
    if(/^\d+@lid$/.test(jid||'')&&/^57\d{10}@s\.whatsapp\.net$/.test(key.remoteJidAlt||'')&&(config.enabled||[SANDRA,DIEGO].map(p=>p+'@s.whatsapp.net').includes(key.remoteJidAlt)))jid=key.remoteJidAlt;
    if(/^57\d{10}@s\.whatsapp\.net$/.test(jid||'')&&key.remoteJidAlt?.endsWith('@s.whatsapp.net')&&key.remoteJidAlt!==jid)continue;
    // A LID, display name or participant in a group is insufficient to resolve a direct sender.
    if(!/^57\d{10}@s\.whatsapp\.net$/.test(jid||'')||!key.id||typeof key.fromMe!=='boolean')continue;
    const m=d.message||{};let content=m;
    if(m.ephemeralMessage?.message)content=m.ephemeralMessage.message;
    const kind=content.audioMessage?'audio':content.imageMessage?'image':content.videoMessage?'video':content.documentMessage?'document':'text';
    const text=content.conversation??content.extendedTextMessage?.text??content.imageMessage?.caption??content.videoMessage?.caption??'';
    // A receipt, synchronization stub or protocol update is not a staff message.
    if(kind==='text'&&(typeof text!=='string'||!text.trim()))continue;
    const contexts=[content.extendedTextMessage?.contextInfo,content.audioMessage?.contextInfo,content.imageMessage?.contextInfo,content.videoMessage?.contextInfo,content.documentMessage?.contextInfo,content.messageContextInfo,d.contextInfo].filter(x=>x&&typeof x==='object');
    // A conversation may carry an unrelated messageContextInfo while the provider
    // stores its actual reply citation separately. Conflicting citations grant no authority.
    const citations=[...new Set(contexts.map(x=>x.stanzaId).filter(x=>typeof x==='string'&&x.trim()))];
    const timestamp=typeof d.messageTimestamp==='object'?Number(d.messageTimestamp.low):Number(d.messageTimestamp);
    if(!Number.isFinite(timestamp)||typeof text!=='string')continue;
    events.push({instance:line.instance,owner:line.phone,event:{id:key.id,phone:jid.split('@')[0],at:new Date(timestamp*1000).toISOString(),kind,text,fromMe:key.fromMe,forwarded:contexts.some(x=>x.isForwarded===true||Number(x.forwardingScore)>0),quotedId:citations.length===1?citations[0]:null}});
  }
  if(body.event==='messages.update')for(const d of data){
    const mid=d?.key?.id??d?.keyId;const status=d?.update?.status??d?.status;
    const state=({DELIVERY_ACK:'DELIVERED',READ:'READ',3:'DELIVERED',4:'READ'})[status];
    if(mid&&state)deliveries.push({instance:line.instance,owner:line.phone,mid,state});
  }
  return {events,deliveries};
}
