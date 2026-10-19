import {internalRecipients,knownInternalRecipient} from './config.mjs';
import {createHash} from 'node:crypto';
import {FUMIGACION_BLUE,operationalLineAllowed} from './line-scope.mjs';
import {NATIVE_IDENTITY_RESOLUTION_GUARD,NATIVE_IDENTITY_MAX_AGE_MS,nativeIdentityResolutionHash,nativeIdentityOperationalLine,nativeIdentityStartedAt} from './native-identity-resolution.mjs';
export const PRIVATE_IDENTITY_GUARD='native-private-phone-mapping-observed-without-guessing-v1';
const identityPrefix='private-native-identity:';
const identityKey=(line,id)=>identityPrefix+createHash('sha256').update(line+':'+id).digest('hex');
const cacheStartKey='private-native-cache-pair-start:v1',cacheProofPrefix='private-native-cache-pair-proof:';
const cacheProofKey=(line,id)=>cacheProofPrefix+createHash('sha256').update(line+':'+id).digest('hex');
const readMeta=(store,key)=>{const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?store.open(row.value):null;};
const nativeAt=raw=>Number(typeof raw?.messageTimestamp==='object'?raw.messageTimestamp.low:raw?.messageTimestamp)*1000;
const ownBlue=config=>config.company==='fumigacion'&&config.lines.some(line=>line.phone===FUMIGACION_BLUE&&line.instance==='cucaracha-azul')&&operationalLineAllowed(config,FUMIGACION_BLUE);
const ownCacheLine=(config,body)=>{try{return nativeIdentityOperationalLine(config,body?.instance);}catch{return null;}};

// This installation cutoff is durable and never advances on a restart. It is
// not a cursor or permission to recover any previously unidentified message.
export function initializePrivateNativeCachePair(store,config,now=Date.now()){
  if(store.company!==config.company||!ownBlue(config)||!Number.isSafeInteger(now)||now<config.activatedAt)return null;
  store.db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').run(cacheStartKey,store.seal({guard:NATIVE_IDENTITY_RESOLUTION_GUARD,startedAt:now,line:FUMIGACION_BLUE,instance:'cucaracha-azul',historicalReplayEnabled:false}));
  const saved=readMeta(store,cacheStartKey);
  return saved?.guard===NATIVE_IDENTITY_RESOLUTION_GUARD&&saved.line===FUMIGACION_BLUE&&saved.instance==='cucaracha-azul'&&saved.historicalReplayEnabled===false&&Number.isSafeInteger(saved.startedAt)&&saved.startedAt>=config.activatedAt?saved.startedAt:null;
}
export function prospectivePrivateNativeCacheBody(store,config,body,{startedAt,now=Date.now()}={}){
  const line=ownCacheLine(config,body);
  if(store.company!==config.company||!line||config.enabled!==true||body?.event!=='messages.upsert'||!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(now)||startedAt<config.activatedAt||startedAt>now)return null;
  startedAt=nativeIdentityStartedAt(config,line,startedAt);
  const rows=(Array.isArray(body.data)?body.data:[body.data]).filter(raw=>{
    const key=raw?.key,at=nativeAt(raw);
    return key?.fromMe===false&&/^\d{5,30}@lid$/.test(key.remoteJid||'')&&(key.remoteJidAlt==null||key.remoteJidAlt==='')&&/^[A-Za-z0-9_-]{8,100}$/.test(key.id||'')&&Number.isSafeInteger(at)&&at>=startedAt&&at<=now&&now-at<=NATIVE_IDENTITY_MAX_AGE_MS&&!store.db.prepare('SELECT 1 FROM events WHERE id=?').get(key.id)&&!readMeta(store,identityKey(line.phone,key.id));
  });
  return rows.length?{...body,data:rows}:null;
}
function cacheProofForRaw(store,config,body,raw){
  const line=ownCacheLine(config,body);
  if(store.company!==config.company||!line||config.enabled!==true||body?.event!=='messages.upsert'||raw?.key?.fromMe!==false||!/^\d{5,30}@lid$/.test(raw.key.remoteJid||'')||raw.key.remoteJidAlt!=null&&raw.key.remoteJidAlt!=='')return null;
  const value=readMeta(store,cacheProofKey(line.phone,raw.key.id)),start=readMeta(store,cacheStartKey),proof=value?.proof;
  const {proofHash,...unsigned}=proof||{},startedAt=nativeIdentityStartedAt(config,line,start?.startedAt);
  return start?.guard===NATIVE_IDENTITY_RESOLUTION_GUARD&&start.line===FUMIGACION_BLUE&&start.instance==='cucaracha-azul'&&start.historicalReplayEnabled===false&&Number.isSafeInteger(start.startedAt)&&start.startedAt>=config.activatedAt&&Number.isSafeInteger(startedAt)&&
    value?.guard===NATIVE_IDENTITY_RESOLUTION_GUARD&&value.state==='RESOLVED_NATIVE_CACHE_PAIR'&&value.company===config.company&&value.line===line.phone&&value.instance===body.instance&&value.sourceId===raw.key.id&&value.lid===raw.key.remoteJid&&value.callbackHash===nativeIdentityResolutionHash(raw)&&value.firstInstalledAt===startedAt&&
    proofHash===nativeIdentityResolutionHash(unsigned)&&proof.guard===NATIVE_IDENTITY_RESOLUTION_GUARD&&proof.line===line.phone&&proof.instance===line.instance&&proof.sourceId===raw.key.id&&proof.lid===raw.key.remoteJid&&proof.phone===value.phone&&proof.callbackHash===value.callbackHash&&proof.startsAt===startedAt&&proof.sourceAt===nativeAt(raw)&&proof.owner?.phone===line.phone&&proof.owner.instance===line.instance&&proof.owner.open===true&&proof.owner.ownerVerified===true&&
    /^57\d{10}$/.test(value.phone||'')&&!knownInternalRecipient(value.phone)&&!internalRecipients(config).includes(value.phone)&&!config.lines.some(line=>line.phone===value.phone)?value:null;
}
// Proofs are encrypted and inserted once, separately from the immutable raw
// journal. No native key or original identity claim is rewritten.
export function recordPrivateNativeCachePairs(store,config,body,result,{startedAt,now=Date.now()}={}){
  const line=ownCacheLine(config,body);
  if(store.company!==config.company||!line||config.enabled!==true||body?.event!=='messages.upsert'||!Number.isSafeInteger(startedAt)||startedAt<config.activatedAt||!Number.isSafeInteger(now)||startedAt>now||result?.guard!==NATIVE_IDENTITY_RESOLUTION_GUARD||result.originalBodyPreserved!==true||result.originalBodyHash!==nativeIdentityResolutionHash(body))return {recorded:0};
  startedAt=nativeIdentityStartedAt(config,line,startedAt);
  const rows=Array.isArray(body.data)?body.data:[body.data];let recorded=0;
  store.tx(()=>{for(const resolution of result.resolutions||[]){
    const raw=rows.find(value=>value?.key?.id===resolution.sourceId),proof=resolution.proof;
    if(!raw||raw.key.fromMe!==false||raw.key.remoteJid!==resolution.lid||raw.key.remoteJidAlt!=null&&raw.key.remoteJidAlt!==''||resolution.line!==line.phone||resolution.instance!==body.instance||!/^57\d{10}$/.test(resolution.phone||'')||knownInternalRecipient(resolution.phone)||internalRecipients(config).includes(resolution.phone)||config.lines.some(line=>line.phone===resolution.phone))continue;
    const {proofHash,...unsigned}=proof||{},at=nativeAt(raw);
    if(proof?.guard!==NATIVE_IDENTITY_RESOLUTION_GUARD||proofHash!==nativeIdentityResolutionHash(unsigned)||proof.sourceId!==raw.key.id||proof.phone!==resolution.phone||proof.lid!==resolution.lid||proof.line!==resolution.line||proof.instance!==resolution.instance||proof.sourceAt!==at||proof.callbackHash!==nativeIdentityResolutionHash(raw)||proof.startsAt!==startedAt||at<startedAt||at>now||now-at>NATIVE_IDENTITY_MAX_AGE_MS||proof.owner?.phone!==line.phone||proof.owner.instance!==body.instance||proof.owner.open!==true||proof.owner.ownerVerified!==true||!Array.isArray(proof.pairSources)||!proof.pairSources.length)continue;
    if(store.db.prepare('SELECT 1 FROM events WHERE id=?').get(raw.key.id)||readMeta(store,identityKey(line.phone,raw.key.id)))continue;
    const key=cacheProofKey(line.phone,raw.key.id),existing=readMeta(store,key);
    if(existing){if(existing.callbackHash!==proof.callbackHash||existing.phone!==resolution.phone)throw Error('PRIVATE_NATIVE_IDENTITY_PROOF_CONFLICT');continue;}
    const value={guard:NATIVE_IDENTITY_RESOLUTION_GUARD,state:'RESOLVED_NATIVE_CACHE_PAIR',company:config.company,sourceId:raw.key.id,line:resolution.line,instance:resolution.instance,lid:resolution.lid,phone:resolution.phone,callbackHash:proof.callbackHash,originalBodyHash:result.originalBodyHash,proof,recordedAt:now,firstInstalledAt:startedAt,originalCarriedPhone:false,authority:'external-customer-only',historicalReplayEnabled:false};
    store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,store.seal(value));
    store.audit('PRIVATE_NATIVE_IDENTITY_CACHE_PAIR_VERIFIED',raw.key.id,{guard:NATIVE_IDENTITY_RESOLUTION_GUARD,line:resolution.line,instance:resolution.instance,proofHash,originalCarriedPhone:false,historicalReplayEnabled:false,authority:'external-customer-only'});recorded++;
  }});return {recorded};
}
export function decodePrivateNativeCachePairs(store,config,body,{now=Date.now()}={}){
  const line=ownCacheLine(config,body);if(!line)return [];
  return (Array.isArray(body.data)?body.data:[body.data]).flatMap(raw=>{
    const proof=cacheProofForRaw(store,config,body,raw);if(!proof)return [];
    const at=nativeAt(raw);if(at<proof.firstInstalledAt||at>now||now-at>NATIVE_IDENTITY_MAX_AGE_MS)return [];
    const value=decodePrivateSource(raw,line,proof.phone);return value?[{...value,identityProvenance:{guard:NATIVE_IDENTITY_RESOLUTION_GUARD,state:proof.state,originalCarriedPhone:false,proofHash:proof.proof.proofHash}}]:[];
  });
}
// An unmapped LID cannot identify a customer or a chief. Preserve the reception
// gap as encrypted metadata instead of silently counting the request as handled.
export function observePrivateIdentity(store,body,config,parsed,now=Date.now()){
  if(config.company!=='fumigacion'||body.event!=='messages.upsert')return 0;
  const line=config.lines.find(l=>l.instance===body.instance);if(!line)return 0;
  let observed=0;
  store.tx(()=>{
    for(const value of parsed.events){
      if(value.identityProvenance?.guard===NATIVE_IDENTITY_RESOLUTION_GUARD)continue;
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
      const cacheProof=cacheProofForRaw(store,config,body,d);
      if(cacheProof){store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,store.seal({sourceId:k.id,line:line.phone,lid:k.remoteJid,phone:cacheProof.phone,at,fromMe:false,state:'RESOLVED_NATIVE_CACHE_PAIR',observedAt:now,resolvedAt:cacheProof.recordedAt,guard:NATIVE_IDENTITY_RESOLUTION_GUARD,proofHash:cacheProof.proof.proofHash,originalCarriedPhone:false}));continue;}
      store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,store.seal({sourceId:k.id,line:line.phone,lid:k.remoteJid,at,fromMe:k.fromMe,state:'UNRESOLVED',observedAt:now,reason:'NATIVE_PHONE_MAPPING_UNAVAILABLE'}));
      store.audit('PRIVATE_NATIVE_IDENTITY_UNRESOLVED',k.id,{line:line.phone,fromMe:k.fromMe,reason:'NATIVE_PHONE_MAPPING_UNAVAILABLE',customerEventQueued:false,phoneInferred:false});observed++;
    }
  });return observed;
}
export function privateIdentityStatus(store,config){
  const rows=config.company==='fumigacion'?store.db.prepare('SELECT value FROM meta WHERE key LIKE ?').all(identityPrefix+'%').map(row=>store.open(row.value)):[];
  const pending=rows.filter(row=>row.state==='UNRESOLVED');
  const cacheStart=config.company==='fumigacion'?readMeta(store,cacheStartKey):null;
  return {guard:PRIVATE_IDENTITY_GUARD,unresolvedSources:pending.length,unresolvedIncomingSources:pending.filter(row=>row.fromMe===false).length,resolvedSources:rows.filter(row=>['RESOLVED_NATIVE','RESOLVED_NATIVE_CACHE_PAIR'].includes(row.state)).length,resolvedNativeCachePairSources:rows.filter(row=>row.state==='RESOLVED_NATIVE_CACHE_PAIR').length,nativeCachePairGuard:cacheStart?.guard??null,nativeCachePairInstalledAt:cacheStart?new Date(cacheStart.startedAt).toISOString():null,lastObservedAt:rows.length?new Date(Math.max(...rows.map(row=>row.observedAt))).toISOString():null,historicalCoverageComplete:false,phoneInferred:false,historicalReplayEnabled:false};
}
function decodePrivateSource(d,line,phone){
  const key=d?.key,m=d.message||{};let content=m;
  if(m.ephemeralMessage?.message)content=m.ephemeralMessage.message;
  const kind=content.audioMessage?'audio':content.imageMessage?'image':content.videoMessage?'video':content.documentMessage?'document':'text';
  const text=content.conversation??content.extendedTextMessage?.text??content.imageMessage?.caption??content.videoMessage?.caption??'';
  if(kind==='text'&&(typeof text!=='string'||!text.trim()))return null;
  const contexts=[content.extendedTextMessage?.contextInfo,content.audioMessage?.contextInfo,content.imageMessage?.contextInfo,content.videoMessage?.contextInfo,content.documentMessage?.contextInfo,content.messageContextInfo,d.contextInfo].filter(x=>x&&typeof x==='object');
  const citations=[...new Set(contexts.map(x=>x.stanzaId).filter(x=>typeof x==='string'&&x.trim()))];
  const timestamp=typeof d.messageTimestamp==='object'?Number(d.messageTimestamp.low):Number(d.messageTimestamp);
  if(!Number.isFinite(timestamp)||typeof text!=='string')return null;
  return {instance:line.instance,owner:line.phone,event:{id:key.id,phone,at:new Date(timestamp*1000).toISOString(),kind,text,fromMe:key.fromMe,forwarded:contexts.some(x=>x.isForwarded===true||Number(x.forwardingScore)>0),quotedId:citations.length===1?citations[0]:null}};
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
    const value=decodePrivateSource(d,line,jid.split('@')[0]);if(value)events.push(value);
  }
  if(body.event==='messages.update')for(const d of data){
    const mid=d?.key?.id??d?.keyId;const status=d?.update?.status??d?.status;
    const state=({DELIVERY_ACK:'DELIVERED',READ:'READ',3:'DELIVERED',4:'READ'})[status];
    if(mid&&state)deliveries.push({instance:line.instance,owner:line.phone,mid,state});
  }
  return {events,deliveries};
}
