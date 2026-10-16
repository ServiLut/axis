import {createHash} from 'node:crypto';
import {knownInternalRecipient,internalRecipients} from './config.mjs';
import {FUMIGACION_BLUE,operationalLineAllowed} from './line-scope.mjs';

export const NATIVE_IDENTITY_RESOLUTION_GUARD='own-blue-prospective-native-explicit-lid-pair-readonly-v1';
export const NATIVE_IDENTITY_MAX_AGE_MS=120000;
const INSTANCE='cucaracha-azul',PAGE_SIZE=100;
const nativeMid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(value);
const lidJid=value=>typeof value==='string'&&/^\d{5,30}@lid$/.test(value);
const phoneJid=value=>typeof value==='string'&&/^57\d{10}@s\.whatsapp\.net$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))??'null').digest('hex');
export const nativeIdentityEvidenceHash=hash;
export const nativeIdentityResolutionHash=hash;
function timestamp(record){
  const value=record?.messageTimestamp;
  if(object(value)&&value.high!==undefined&&value.high!==0)return null;
  const seconds=object(value)?value.low:value;
  if(!['number','string'].includes(typeof seconds)||typeof seconds==='string'&&!/^\d+$/.test(seconds))return null;
  const at=Number(seconds)*1000;return Number.isSafeInteger(at)&&at>0?at:null;
}
function content(record){return record?.message?.ephemeralMessage?.message??record?.message;}
function contexts(record){
  const m=content(record);return [m?.extendedTextMessage?.contextInfo,m?.audioMessage?.contextInfo,m?.imageMessage?.contextInfo,m?.videoMessage?.contextInfo,m?.documentMessage?.contextInfo,m?.messageContextInfo,record?.contextInfo].filter(object);
}
function forwarded(record){return record?.forwarded===true||record?.isForwarded===true||contexts(record).some(value=>value.isForwarded===true||Number(value.forwardingScore)>0);}
function readable(record){
  const m=content(record);if(!object(m))return false;
  const text=m.conversation??m.extendedTextMessage?.text??m.imageMessage?.caption??m.videoMessage?.caption;
  return typeof text==='string'&&text.trim().length>0||['audioMessage','imageMessage','videoMessage','documentMessage'].some(kind=>object(m[kind]));
}
function nativeStates(record){
  const allowed=new Set(['PENDING','SENT','SERVER_ACK','DELIVERY_ACK','READ','PLAYED','ERROR','FAILED','EDITED','DELETED','REVOKED',0,1,2,3,4,5]);
  const states=[];if(record.status!=null){if(!allowed.has(record.status))return {valid:false,states:[]};states.push(record.status);}
  if(record.MessageUpdate!==undefined){
    if(!Array.isArray(record.MessageUpdate)||record.MessageUpdate.length>100)return {valid:false,states:[]};
    for(const update of record.MessageUpdate){
      // Production serializes status-only updates as a nested relation of this
      // exact native parent row. Optional explicit relation fields must agree.
      if(!object(update)||typeof record.id!=='string'||!record.id||!allowed.has(update.status)||Object.keys(update).some(key=>!['status','id','messageId','keyId','messageKeyId','instanceId'].includes(key))||
        update.messageId!==undefined&&update.messageId!==record.id||update.keyId!==undefined&&update.keyId!==record.key?.id||update.messageKeyId!==undefined&&update.messageKeyId!==record.key?.id||update.instanceId!==undefined&&update.instanceId!==record.instanceId)return {valid:false,states:[]};
      states.push(update.status);
    }
  }
  return {valid:true,states};
}
function changed(record){
  const delivery=nativeStates(record),m=content(record);
  return !delivery.valid||delivery.states.some(value=>['ERROR','FAILED','EDITED','DELETED','REVOKED',0].includes(value))||['isEdited','edited','deleted','isDeleted','revoked','isRevoked'].some(key=>record?.[key]!=null&&record[key]!==false)||m?.protocolMessage!=null||m?.editedMessage!=null;
}
function ownRecord(record,line){
  return (!record?.instance||record.instance===line.instance)&&(!record?.instanceName||record.instanceName===line.instance)&&(!record?.line||record.line===line.phone)&&(!record?.owner||record.owner===line.phone);
}
function bindingVerified(binding,line,now){
  const at=Date.parse(binding?.checkedAt);
  return binding?.phone===line.phone&&binding.instance===line.instance&&binding.open===true&&binding.ownerVerified===true&&Number.isFinite(at)&&at>=now-30000&&at<=now+60000;
}
const recordHash=record=>hash({id:record.id??null,instanceId:record.instanceId??null,key:record.key,messageTimestamp:timestamp(record),message:record.message,contextInfo:record.contextInfo??null,status:record.status??null,MessageUpdate:record.MessageUpdate??null});
const blockedPhone=(config,phone)=>knownInternalRecipient(phone)||internalRecipients(config).includes(phone)||config.lines.some(line=>line.phone===phone);

/**
 * Inspect an original authenticated callback and one native cache page only.
 * This never adds a fabricated remoteJidAlt, mutates the callback, replays a
 * previous event, releases attention, sends, or writes business/config data.
 * The caller must persist startedAt once and store these proofs separately.
 */
export async function resolveOwnBlueNativeIdentity(config,transport,originalBody,{startedAt,now=Date.now(),authenticated=false}={}){
  const result={guard:NATIVE_IDENTITY_RESOLUTION_GUARD,resolutions:[],unresolved:[],originalBodyHash:hash(originalBody),originalBodyPreserved:true,readOnly:true,historicalCoverageComplete:false};
  const fail=(sourceId,reason)=>result.unresolved.push({sourceId:typeof sourceId==='string'?sourceId:null,reason});
  let line;
  try{line=config?.lines?.find(value=>value.phone===FUMIGACION_BLUE&&value.instance===INSTANCE);
    if(!authenticated||config?.company!=='fumigacion'||config.enabled!==true||!line||transport?.config!==config||!Number.isSafeInteger(config.activatedAt)||!Number.isSafeInteger(startedAt)||startedAt<config.activatedAt||!Number.isSafeInteger(now)||startedAt>now||!operationalLineAllowed(config,FUMIGACION_BLUE)||originalBody?.instance!==INSTANCE||originalBody?.event!=='messages.upsert')throw Error('scope');
  }catch{fail(null,'OWN_BLUE_AUTHENTICATED_PROSPECTIVE_SCOPE_REQUIRED');return result;}
  const data=Array.isArray(originalBody.data)?originalBody.data:[originalBody.data];
  if(!data.length||data.length>20){fail(null,'NATIVE_CALLBACK_BATCH_LIMIT');return result;}
  const pendingCandidates=[],callbackSources=new Map(),callbackConflicts=new Set();
  for(const record of data){
    const key=record?.key,at=timestamp(record);
    // PN callbacks retain their established decoder path. This fallback only
    // admits an external incoming private LID with no direct native PN yet.
    if(!lidJid(key?.remoteJid)||phoneJid(key?.remoteJidAlt))continue;
    if(!object(record)||!nativeMid(key?.id)||key.fromMe!==false||key.remoteJidAlt!=null&&key.remoteJidAlt!==''||!ownRecord(record,line)||forwarded(record)||changed(record)||!readable(record)){fail(key?.id,'CURRENT_PRIVATE_NATIVE_SOURCE_REQUIRED');continue;}
    if(at===null||at<startedAt||at<config.activatedAt||at>now||now-at>NATIVE_IDENTITY_MAX_AGE_MS){fail(key.id,'CURRENT_PROSPECTIVE_NATIVE_SOURCE_REQUIRED');continue;}
    const fingerprint=hash(record);
    if(callbackSources.has(key.id)){if(callbackSources.get(key.id)!==fingerprint)callbackConflicts.add(key.id);continue;}
    callbackSources.set(key.id,fingerprint);pendingCandidates.push({record,key,at});
  }
  const candidates=pendingCandidates.filter(value=>!callbackConflicts.has(value.key.id));for(const id of callbackConflicts)fail(id,'CURRENT_CALLBACK_SOURCE_CONFLICT');
  if(!candidates.length)return result;
  let binding;
  try{binding=await transport.verifyLine(line.phone);if(!bindingVerified(binding,line,now))throw Error('binding');}
  catch{for(const value of candidates)fail(value.key.id,'OWN_BLUE_NATIVE_OWNER_UNVERIFIED');return result;}
  const latestByLid=new Map();for(const value of candidates)latestByLid.set(value.key.remoteJid,Math.max(latestByLid.get(value.key.remoteJid)||0,value.at));
  const pages=new Map();
  for(const candidate of candidates){
    const {record,key,at}=candidate,cacheKey=key.remoteJid;let page=pages.get(cacheKey);
    if(!page){
      try{
        const response=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{remoteJid:key.remoteJid},messageTimestamp:{gte:new Date(config.activatedAt).toISOString(),lte:new Date(latestByLid.get(cacheKey)).toISOString()}},offset:PAGE_SIZE,page:1});
        const value=response?.messages;
        if(!object(value)||!Number.isSafeInteger(value.total)||value.total<0||!Array.isArray(value.records)||value.records.length>PAGE_SIZE||value.total>PAGE_SIZE||value.records.length!==value.total)throw Error('shape');
        page={records:value.records,total:value.total};
      }catch{page={reason:'NATIVE_PAIR_PAGE_UNVERIFIED'};}
      pages.set(cacheKey,page);
    }
    if(page.reason){fail(key.id,page.reason);continue;}
    const rows=page.records.filter(value=>value?.key?.remoteJid===key.remoteJid);
    const exact=rows.filter(value=>value?.key?.id===key.id);
    if(exact.length!==1||exact[0].key.fromMe!==false||timestamp(exact[0])!==at||!ownRecord(exact[0],line)||forwarded(exact[0])||changed(exact[0])||exact[0].key.remoteJidAlt!=null&&exact[0].key.remoteJidAlt!==''&&!phoneJid(exact[0].key.remoteJidAlt)||hash(exact[0].message)!==hash(record.message)||hash(exact[0].contextInfo??null)!==hash(record.contextInfo??null)){
      fail(key.id,'EXACT_CURRENT_NATIVE_SOURCE_UNVERIFIED');continue;
    }
    const pairs=[],seenNativeSources=new Map(),rawPhones=new Set();let conflict=false;
    for(const value of rows){
      const nativeKey=value?.key,pairAt=timestamp(value);
      if(nativeMid(nativeKey?.id)&&pairAt!==null&&pairAt>=config.activatedAt&&pairAt<=at&&ownRecord(value,line)){
        const sourceHash=recordHash(value);if(seenNativeSources.has(nativeKey.id)&&seenNativeSources.get(nativeKey.id)!==sourceHash)conflict=true;seenNativeSources.set(nativeKey.id,sourceHash);
      }
      if(!phoneJid(nativeKey?.remoteJidAlt))continue;
      if(pairAt!==null&&pairAt>=config.activatedAt&&pairAt<=at&&ownRecord(value,line)){const phone=nativeKey.remoteJidAlt.split('@')[0];rawPhones.add(phone);if(blockedPhone(config,phone))conflict=true;}
      if(!nativeMid(nativeKey.id)||typeof nativeKey.fromMe!=='boolean'||!ownRecord(value,line)||pairAt===null||pairAt<config.activatedAt||pairAt>at||forwarded(value)||changed(value)||!readable(value))continue;
      if(nativeKey.fromMe&&!nativeStates(value).states.some(state=>['DELIVERY_ACK','READ',3,4].includes(state)))continue;
      const phone=nativeKey.remoteJidAlt.split('@')[0];
      if(blockedPhone(config,phone)){conflict=true;break;}
      pairs.push({id:nativeKey.id,at:pairAt,fromMe:nativeKey.fromMe,phone,sourceHash:recordHash(value)});
    }
    const phones=[...new Set(pairs.map(value=>value.phone))];
    if(conflict||phones.length>1||rawPhones.size>1){fail(key.id,'CONFLICTING_OR_INTERNAL_NATIVE_PHONE_PAIR');continue;}
    if(phones.length!==1){fail(key.id,'EXPLICIT_NATIVE_PHONE_PAIR_UNAVAILABLE');continue;}
    // Conflicting copies of one pair MID cannot be silently deduplicated.
    const sourceIds=new Map();
    for(const pair of pairs){if(sourceIds.has(pair.id)&&sourceIds.get(pair.id)!==pair.sourceHash)conflict=true;sourceIds.set(pair.id,pair.sourceHash);}
    if(conflict){fail(key.id,'NATIVE_PAIR_SOURCE_CONFLICT');continue;}
    const pairSources=[...new Map(pairs.map(value=>[value.id,{id:value.id,at:value.at,fromMe:value.fromMe,sourceHash:value.sourceHash}])).values()];
    const proof={guard:NATIVE_IDENTITY_RESOLUTION_GUARD,line:line.phone,instance:line.instance,sourceId:key.id,phone:phones[0],lid:key.remoteJid,sourceAt:at,sourceHash:recordHash(exact[0]),callbackHash:hash(record),pairSources,owner:{phone:binding.phone,instance:binding.instance,open:true,ownerVerified:true},checkedAt:now,startsAt:startedAt,boundedPage:{page:1,limit:PAGE_SIZE,returned:page.records.length,matchingLid:rows.length},historicalCoverageComplete:false,phoneInferred:false,originalKeyPreserved:true};
    proof.proofHash=hash(proof);
    result.resolutions.push({sourceId:key.id,phone:phones[0],lid:key.remoteJid,line:line.phone,instance:line.instance,proof});
  }
  try{const after=await transport.verifyLine(line.phone);if(!bindingVerified(after,line,now))throw Error('binding');}
  catch{for(const value of result.resolutions)fail(value.sourceId,'OWN_BLUE_NATIVE_OWNER_CHANGED');result.resolutions=[];}
  return result;
}
