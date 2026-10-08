import {internalRecipients} from './config.mjs';
import {createHash} from 'node:crypto';
export const PRIVATE_IDENTITY_GUARD='native-private-phone-mapping-observed-without-guessing-v1';
const identityPrefix='private-native-identity:';
const identityKey=(line,id)=>identityPrefix+createHash('sha256').update(line+':'+id).digest('hex');
// An unmapped LID cannot identify a customer or a chief. Preserve the reception
// gap as encrypted metadata instead of silently counting the request as handled.
export function observePrivateIdentity(store,body,config,parsed,now=Date.now()){
  if(config.company!=='fumigacion'||body.event!=='messages.upsert')return 0;
  const line=config.lines.find(l=>l.instance===body.instance);if(!line)return 0;
  let observed=0;
  store.tx(()=>{
    for(const value of parsed.events){
      const key=identityKey(line.phone,value.event.id),prior=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
      if(prior){const saved=store.open(prior.value);if(saved.state==='UNRESOLVED')store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(store.seal({...saved,state:'RESOLVED_NATIVE',resolvedAt:now}),key);}
    }
    for(const d of Array.isArray(body.data)?body.data:[body.data]){
      const k=d?.key;if(!/^\d{5,30}@lid$/.test(k?.remoteJid||'')||typeof k.fromMe!=='boolean'||!/^[A-Za-z0-9_-]{8,100}$/.test(k.id||'')||/^57\d{10}@s\.whatsapp\.net$/.test(k.remoteJidAlt||''))continue;
      const at=Number(typeof d.messageTimestamp==='object'?d.messageTimestamp.low:d.messageTimestamp)*1000;
      if(!Number.isFinite(at)||at<config.activatedAt||at>now+60000)continue;
      const m=d.message?.ephemeralMessage?.message??d.message??{},text=m.conversation??m.extendedTextMessage?.text??m.imageMessage?.caption??m.videoMessage?.caption??'';
      if(!(typeof text==='string'&&text.trim())&&!['audioMessage','imageMessage','videoMessage','documentMessage'].some(kind=>m[kind]))continue;
      const key=identityKey(line.phone,k.id);if(store.db.prepare('SELECT 1 FROM meta WHERE key=?').get(key))continue;
      store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,store.seal({sourceId:k.id,line:line.phone,lid:k.remoteJid,at,fromMe:k.fromMe,state:'UNRESOLVED',observedAt:now,reason:'NATIVE_PHONE_MAPPING_UNAVAILABLE'}));
      store.audit('PRIVATE_NATIVE_IDENTITY_UNRESOLVED',k.id,{line:line.phone,fromMe:k.fromMe,reason:'NATIVE_PHONE_MAPPING_UNAVAILABLE',customerEventQueued:false,phoneInferred:false});observed++;
    }
  });return observed;
}
export function privateIdentityStatus(store,config){
  const rows=config.company==='fumigacion'?store.db.prepare('SELECT value FROM meta WHERE key LIKE ?').all(identityPrefix+'%').map(row=>store.open(row.value)):[];
  const pending=rows.filter(row=>row.state==='UNRESOLVED');
  return {guard:PRIVATE_IDENTITY_GUARD,unresolvedSources:pending.length,unresolvedIncomingSources:pending.filter(row=>row.fromMe===false).length,resolvedSources:rows.filter(row=>row.state==='RESOLVED_NATIVE').length,lastObservedAt:rows.length?new Date(Math.max(...rows.map(row=>row.observedAt))).toISOString():null,historicalCoverageComplete:false,phoneInferred:false};
}
export function decodeWebhook(body,config) {
  const line=config.lines.find(l=>l.instance===body.instance);if(!line)return {events:[],deliveries:[]};
  const events=[],deliveries=[];const data=Array.isArray(body.data)?body.data:[body.data];
  if(body.event==='messages.upsert')for(const d of data){
    const key=d?.key;let jid=key?.remoteJid;
    // The own authenticated provider may supply an explicit direct phone alternative.
    // Authority still comes from validateEvent's exact internal roles, never a LID or name.
    if(/^\d+@lid$/.test(jid||'')&&/^57\d{10}@s\.whatsapp\.net$/.test(key.remoteJidAlt||'')&&(config.enabled||internalRecipients(config).map(p=>p+'@s.whatsapp.net').includes(key.remoteJidAlt)))jid=key.remoteJidAlt;
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
