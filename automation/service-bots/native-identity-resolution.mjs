import {createHash} from 'node:crypto';
import {knownInternalRecipient,internalRecipients} from './config.mjs';
import {FUMIGACION_BLUE,operationalLineAllowed} from './line-scope.mjs';

export const NATIVE_IDENTITY_RESOLUTION_GUARD='own-blue-prospective-native-explicit-lid-pair-readonly-v1';
export const NATIVE_IDENTITY_MAX_AGE_MS=120000;
export const NATIVE_IDENTITY_STORED_FINGERPRINT_VERSION='native-key-body-without-delivery-state-v1';
export const NATIVE_IDENTITY_DIAGNOSTIC_CONTENT_KEYS=Object.freeze(['conversation','messageContextInfo','extendedTextMessage','deviceSentMessage','senderKeyDistributionMessage','ephemeralMessage','audioMessage','imageMessage','videoMessage','documentMessage']);
export const NATIVE_IDENTITY_DIAGNOSTIC_CONTENT_PATHS=Object.freeze(['conversation','messageContextInfo','messageContextInfo.deviceListMetadata','messageContextInfo.deviceListMetadataVersion','messageContextInfo.messageSecret','messageContextInfo.deviceListMetadata.senderKeyHash','messageContextInfo.deviceListMetadata.recipientKeyHash','messageContextInfo.deviceListMetadata.senderTimestamp','messageContextInfo.deviceListMetadata.recipientTimestamp','extendedTextMessage','extendedTextMessage.text','extendedTextMessage.contextInfo','deviceSentMessage','deviceSentMessage.message','senderKeyDistributionMessage','ephemeralMessage','ephemeralMessage.message','audioMessage','imageMessage','videoMessage','documentMessage']);
export const NATIVE_IDENTITY_DIAGNOSTIC_SEMANTIC_FIELDS=Object.freeze(['textMatches','kindMatches','quotedIdsMatch','forwardingMatches']);
export const NATIVE_IDENTITY_DIAGNOSTIC_VALUE_TYPES=Object.freeze(['absent','null','array','object','string','number','boolean','other']);
const INSTANCE='cucaracha-azul',PAGE_SIZE=100;
const nativeMid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(value);
const lidJid=value=>typeof value==='string'&&/^\d{5,30}@lid$/.test(value);
const phoneJid=value=>typeof value==='string'&&/^57\d{10}@s\.whatsapp\.net$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))??'null').digest('hex');
export const nativeIdentityEvidenceHash=hash;
export const nativeIdentityResolutionHash=hash;
export const NATIVE_MESSAGE_BYTE_EQUIVALENCE_GUARD='three-demonstrated-message-context-byte-fields-v1';
const bytePaths=[['messageContextInfo','messageSecret'],['messageContextInfo','deviceListMetadata','senderKeyHash'],['messageContextInfo','deviceListMetadata','recipientKeyHash']];
const plainObject=value=>object(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function denseBytes(value){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<1||value.length>512||Reflect.ownKeys(value).length!==value.length+1)return null;
  const bytes=[];for(let index=0;index<value.length;index++){
    const property=Object.getOwnPropertyDescriptor(value,String(index));
    if(!property||!Object.prototype.hasOwnProperty.call(property,'value')||!Number.isInteger(property.value)||property.value<0||property.value>255)return null;
    bytes.push(property.value);
  }
  return bytes;
}
function canonicalByteString(value){
  if(typeof value==='string'){
    if(!value.length||value.length>684||value.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('INVALID_NATIVE_BYTES');
    const bytes=Buffer.from(value,'base64');if(bytes.length<1||bytes.length>512||bytes.toString('base64')!==value)throw Error('INVALID_NATIVE_BYTES');return value;
  }
  if(!plainObject(value))throw Error('INVALID_NATIVE_BYTES');
  const keys=Reflect.ownKeys(value);let bytes;
  if(keys.length===2&&keys.includes('type')&&keys.includes('data')){
    const type=Object.getOwnPropertyDescriptor(value,'type'),data=Object.getOwnPropertyDescriptor(value,'data');
    if(!type||!data||!Object.prototype.hasOwnProperty.call(type,'value')||!Object.prototype.hasOwnProperty.call(data,'value')||type.value!=='Buffer')throw Error('INVALID_NATIVE_BYTES');
    bytes=denseBytes(data.value);
  }else{
    if(keys.length<1||keys.length>512)throw Error('INVALID_NATIVE_BYTES');bytes=[];
    for(let index=0;index<keys.length;index++){
      const property=Object.getOwnPropertyDescriptor(value,String(index));
      if(!property||!Object.prototype.hasOwnProperty.call(property,'value')||!Number.isInteger(property.value)||property.value<0||property.value>255)throw Error('INVALID_NATIVE_BYTES');
      bytes.push(property.value);
    }
    if(keys.some(key=>typeof key!=='string'||!/^0$|^[1-9]\d*$/.test(key)||Number(key)>=keys.length))throw Error('INVALID_NATIVE_BYTES');
  }
  if(!bytes)throw Error('INVALID_NATIVE_BYTES');return Buffer.from(bytes).toString('base64');
}
function messageByteProjection(value,path=[]){
  if(bytePaths.some(parts=>parts.length===path.length&&parts.every((part,index)=>part===path[index])))return canonicalByteString(value);
  if(Array.isArray(value))return value.map((item,index)=>messageByteProjection(item,[...path,String(index)]));
  if(object(value))return Object.fromEntries(Object.keys(value).map(key=>[key,messageByteProjection(value[key],[...path,key])]));
  return value;
}
function jsonDataOnly(value,ancestors=new Set(),depth=0){
  if(value===null||['string','boolean'].includes(typeof value))return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value!=='object'||depth>100||ancestors.has(value)||!Array.isArray(value)&&!plainObject(value))return false;
  const keys=Reflect.ownKeys(value),array=Array.isArray(value);
  if(array&&(Object.getPrototypeOf(value)!==Array.prototype||keys.length!==value.length+1))return false;
  ancestors.add(value);
  for(const key of keys){
    if(array&&key==='length')continue;
    const property=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||array&&(!/^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)||!property||!property.enumerable||!Object.prototype.hasOwnProperty.call(property,'value')||!jsonDataOnly(property.value,ancestors,depth+1)){ancestors.delete(value);return false;}
  }
  ancestors.delete(value);return true;
}
// The original body, raw hashes and proof hashes retain their exact semantics.
// Only these three observed byte encodings receive an equivalence comparison;
// all other message fields, citations and forwarding metadata remain present.
export function nativeMessageBodiesEquivalent(first,second){
  try{
    if(!object(first)||!object(second)||!jsonDataOnly(first)||!jsonDataOnly(second))return false;
    if(hash(first)===hash(second))return true; // Preserve the original exact-body admission.
    return hash(messageByteProjection(first))===hash(messageByteProjection(second));
  }catch{return false;}
}
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
function contentMismatchDiagnostics(callback,native){
  const present=(message,key)=>object(message)&&Object.prototype.hasOwnProperty.call(message,key);
  const presence=message=>({...Object.fromEntries(NATIVE_IDENTITY_DIAGNOSTIC_CONTENT_KEYS.map(key=>[key,present(message,key)])),unlistedContentKeysPresent:object(message)&&Object.keys(message).some(key=>!NATIVE_IDENTITY_DIAGNOSTIC_CONTENT_KEYS.includes(key))});
  const pathValue=(message,path)=>{let value=message;for(const key of path.split('.')){if(!object(value)||!Object.prototype.hasOwnProperty.call(value,key))return {present:false};value=value[key];}return {present:true,value};};
  const core=record=>{const m=content(record)||{};return {text:m.conversation??m.extendedTextMessage?.text??m.imageMessage?.caption??m.videoMessage?.caption??'',kind:m.audioMessage?'audio':m.imageMessage?'image':m.videoMessage?'video':m.documentMessage?'document':'text',quotedIds:[...new Set(contexts(record).map(value=>value.stanzaId).filter(value=>typeof value==='string'&&value.trim()))].sort(),forwarded:forwarded(record)};};
  const a=core(callback),b=core(native);
  const paths=NATIVE_IDENTITY_DIAGNOSTIC_CONTENT_PATHS.filter(path=>hash(pathValue(callback.message,path))!==hash(pathValue(native.message,path))),valueType=value=>!value.present?'absent':value.value===null?'null':Array.isArray(value.value)?'array':object(value.value)?'object':['string','number','boolean'].includes(typeof value.value)?typeof value.value:'other';
  return {contentKeyPresence:{callback:presence(callback.message),native:presence(native.message)},semanticCore:{textMatches:a.text===b.text,kindMatches:a.kind===b.kind,quotedIdsMatch:hash(a.quotedIds)===hash(b.quotedIds),forwardingMatches:a.forwarded===b.forwarded},differingContentPaths:paths,contentPathTypes:paths.map(path=>({path,callbackType:valueType(pathValue(callback.message,path)),nativeType:valueType(pathValue(native.message,path))}))};
}
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
// A new, separately versioned fingerprint preserves the original full hash
// above. Only delivery status progression is excluded; native keys and message
// bodies are never normalized, supplied with a phone, or rewritten.
const immutableRecordHash=record=>hash({id:record.id??null,instanceId:record.instanceId??null,key:record.key,messageTimestamp:timestamp(record),message:record.message,contextInfo:record.contextInfo??null});
const blockedPhone=(config,phone)=>knownInternalRecipient(phone)||internalRecipients(config).includes(phone)||config.lines.some(line=>line.phone===phone);

/**
 * Inspect an original authenticated callback and one native cache page only.
 * This never adds a fabricated remoteJidAlt, mutates the callback, replays a
 * previous event, releases attention, sends, or writes business/config data.
 * The caller must persist startedAt once and store these proofs separately.
 */
export async function resolveOwnBlueNativeIdentity(config,transport,originalBody,{startedAt,now=Date.now(),authenticated=false}={}){
  const result={guard:NATIVE_IDENTITY_RESOLUTION_GUARD,resolutions:[],unresolved:[],originalBodyHash:hash(originalBody),originalBodyPreserved:true,readOnly:true,historicalCoverageComplete:false};
  const fail=(sourceId,reason,diagnostics)=>result.unresolved.push({sourceId:typeof sourceId==='string'?sourceId:null,reason,...(diagnostics?{diagnostics}:{})});
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
    const diagnostics={exactMatches:exact.length,nativePageContainsSource:page.records.some(value=>value?.key?.id===key.id),sourceBodyMatches:exact.length===1&&hash(exact[0].message)===hash(record.message),sourceContextMatches:exact.length===1&&hash(exact[0].contextInfo??null)===hash(record.contextInfo??null),nativeChanged:exact.some(value=>changed(value)),...(exact.length===1?contentMismatchDiagnostics(record,exact[0]):{})};
    if(exact.length!==1||exact[0].key.fromMe!==false||timestamp(exact[0])!==at||!ownRecord(exact[0],line)||forwarded(exact[0])||changed(exact[0])||exact[0].key.remoteJidAlt!=null&&exact[0].key.remoteJidAlt!==''&&!phoneJid(exact[0].key.remoteJidAlt)||!nativeMessageBodiesEquivalent(exact[0].message,record.message)||hash(exact[0].contextInfo??null)!==hash(record.contextInfo??null)){
      fail(key.id,'EXACT_CURRENT_NATIVE_SOURCE_UNVERIFIED',diagnostics);continue;
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
      pairs.push({id:nativeKey.id,at:pairAt,fromMe:nativeKey.fromMe,phone,sourceHash:recordHash(value),immutableHash:immutableRecordHash(value)});
    }
    const phones=[...new Set(pairs.map(value=>value.phone))];
    if(conflict||phones.length>1||rawPhones.size>1){fail(key.id,'CONFLICTING_OR_INTERNAL_NATIVE_PHONE_PAIR');continue;}
    if(phones.length!==1){fail(key.id,'EXPLICIT_NATIVE_PHONE_PAIR_UNAVAILABLE');continue;}
    // Conflicting copies of one pair MID cannot be silently deduplicated.
    const sourceIds=new Map();
    for(const pair of pairs){if(sourceIds.has(pair.id)&&sourceIds.get(pair.id)!==pair.sourceHash)conflict=true;sourceIds.set(pair.id,pair.sourceHash);}
    if(conflict){fail(key.id,'NATIVE_PAIR_SOURCE_CONFLICT');continue;}
    const pairSources=[...new Map(pairs.map(value=>[value.id,{id:value.id,at:value.at,fromMe:value.fromMe,sourceHash:value.sourceHash,immutableHash:value.immutableHash}])).values()];
    const proof={guard:NATIVE_IDENTITY_RESOLUTION_GUARD,line:line.phone,instance:line.instance,sourceId:key.id,phone:phones[0],lid:key.remoteJid,sourceAt:at,sourceHash:recordHash(exact[0]),callbackHash:hash(record),messageBodyComparisonGuard:NATIVE_MESSAGE_BYTE_EQUIVALENCE_GUARD,rawMessageBodiesEqual:hash(exact[0].message)===hash(record.message),immutableFingerprintVersion:NATIVE_IDENTITY_STORED_FINGERPRINT_VERSION,sourceImmutableHash:immutableRecordHash(exact[0]),pairSources,owner:{phone:binding.phone,instance:binding.instance,open:true,ownerVerified:true},checkedAt:now,startsAt:startedAt,boundedPage:{page:1,limit:PAGE_SIZE,returned:page.records.length,matchingLid:rows.length},historicalCoverageComplete:false,phoneInferred:false,originalKeyPreserved:true};
    proof.proofHash=hash(proof);
    result.resolutions.push({sourceId:key.id,phone:phones[0],lid:key.remoteJid,line:line.phone,instance:line.instance,proof});
  }
  try{const after=await transport.verifyLine(line.phone);if(!bindingVerified(after,line,now))throw Error('binding');}
  catch{for(const value of result.resolutions)fail(value.sourceId,'OWN_BLUE_NATIVE_OWNER_CHANGED');result.resolutions=[];}
  return result;
}

const cacheProofPrefix='private-native-cache-pair-proof:';
const metaSuffix=id=>createHash('sha256').update(FUMIGACION_BLUE+':'+id).digest('hex');
const readStoredMeta=(store,key)=>{const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?store.open(row.value):null;};
const hashString=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function storedScope(store,config,phone,line){
  return store?.company==='fumigacion'&&config?.company==='fumigacion'&&config.enabled===true&&
    /^57\d{10}$/.test(phone??'')&&!blockedPhone(config,phone)&&line===FUMIGACION_BLUE&&
    Number.isSafeInteger(config.activatedAt)&&operationalLineAllowed(config,line)&&
    config.lines.some(value=>value.phone===line&&value.instance===INSTANCE);
}
function processedProof(store,config,expected,now){
  if(!object(expected)||!nativeMid(expected.id)||!storedScope(store,config,expected.phone,expected.line))return null;
  const row=store.db.prepare('SELECT id,phone,line,at,from_me,state,body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(expected.id,expected.phone,expected.line);
  if(!row||!row.state||['PENDING','PROCESSING'].includes(row.state))return null;
  const event=store.open(row.body);
  if(!object(event)||event.id!==row.id||event.phone!==row.phone||event.line!==row.line||event.at!==row.at||event.fromMe!==false||event.forwarded!==false||!Number.isSafeInteger(event.at)||event.at>now||typeof event.text!=='string')return null;
  for(const key of ['kind','text','at','fromMe','forwarded'])if(expected[key]!==undefined&&expected[key]!==event[key])return null;
  if(expected.quotedId!==undefined&&(expected.quotedId??null)!==(event.quotedId??null))return null;
  const start=readStoredMeta(store,'private-native-cache-pair-start:v1');
  const value=readStoredMeta(store,cacheProofPrefix+metaSuffix(row.id));
  const identity=readStoredMeta(store,'private-native-identity:'+metaSuffix(row.id));
  if(!object(start)||start.guard!==NATIVE_IDENTITY_RESOLUTION_GUARD||start.line!==FUMIGACION_BLUE||start.instance!==INSTANCE||start.historicalReplayEnabled!==false||!Number.isSafeInteger(start.startedAt)||start.startedAt<config.activatedAt||start.startedAt>event.at||
    !object(value)||value.guard!==NATIVE_IDENTITY_RESOLUTION_GUARD||value.state!=='RESOLVED_NATIVE_CACHE_PAIR'||value.company!==config.company||value.sourceId!==row.id||value.phone!==row.phone||value.line!==row.line||value.instance!==INSTANCE||!lidJid(value.lid)||value.firstInstalledAt!==start.startedAt||value.originalCarriedPhone!==false||value.authority!=='external-customer-only'||value.historicalReplayEnabled!==false||
    !object(identity)||identity.sourceId!==row.id||identity.line!==row.line||identity.phone!==row.phone||identity.lid!==value.lid||identity.at!==event.at||identity.fromMe!==false||identity.state!=='RESOLVED_NATIVE_CACHE_PAIR'||identity.guard!==NATIVE_IDENTITY_RESOLUTION_GUARD||identity.originalCarriedPhone!==false)return null;
  const proof=value.proof;if(!object(proof))return null;
  const comparisonGuardPresent=Object.prototype.hasOwnProperty.call(proof,'messageBodyComparisonGuard'),rawEqualityPresent=Object.prototype.hasOwnProperty.call(proof,'rawMessageBodiesEqual');
  // Prior exact-body proofs remain unchanged. New comparison metadata is
  // closed and must be present as a pair; its flag never replaces native reads.
  if(comparisonGuardPresent!==rawEqualityPresent||comparisonGuardPresent&&(proof.messageBodyComparisonGuard!==NATIVE_MESSAGE_BYTE_EQUIVALENCE_GUARD||typeof proof.rawMessageBodiesEqual!=='boolean'))return null;
  const {proofHash,...unsigned}=proof;
  if(!hashString(proofHash)||hash(unsigned)!==proofHash||identity.proofHash!==proofHash||proof.guard!==NATIVE_IDENTITY_RESOLUTION_GUARD||proof.immutableFingerprintVersion!==NATIVE_IDENTITY_STORED_FINGERPRINT_VERSION||!hashString(proof.sourceImmutableHash)||!hashString(proof.sourceHash)||!hashString(proof.callbackHash)||value.callbackHash!==proof.callbackHash||!hashString(value.originalBodyHash)||proof.sourceId!==row.id||proof.phone!==row.phone||proof.line!==row.line||proof.instance!==INSTANCE||proof.lid!==value.lid||proof.sourceAt!==event.at||proof.startsAt!==start.startedAt||
    !Number.isSafeInteger(proof.checkedAt)||proof.checkedAt<event.at||proof.checkedAt-event.at>NATIVE_IDENTITY_MAX_AGE_MS||!Number.isSafeInteger(value.recordedAt)||value.recordedAt<proof.checkedAt||value.recordedAt-event.at>NATIVE_IDENTITY_MAX_AGE_MS||value.recordedAt>now||
    proof.owner?.phone!==FUMIGACION_BLUE||proof.owner.instance!==INSTANCE||proof.owner.open!==true||proof.owner.ownerVerified!==true||proof.phoneInferred!==false||proof.originalKeyPreserved!==true||proof.historicalCoverageComplete!==false||
    !Array.isArray(proof.pairSources)||!proof.pairSources.length||proof.pairSources.length>PAGE_SIZE||new Set(proof.pairSources.map(pair=>pair.id)).size!==proof.pairSources.length||proof.pairSources.some(pair=>!object(pair)||!nativeMid(pair.id)||!Number.isSafeInteger(pair.at)||pair.at<config.activatedAt||pair.at>event.at||typeof pair.fromMe!=='boolean'||!hashString(pair.sourceHash)||!hashString(pair.immutableHash)))return null;
  return {row,event,value,proof};
}

/** Pure enumeration of proofs whose already-processed event still matches.
 * This is not a PN lookup for new LIDs and never promotes unresolved history.
 */
export function listStoredNativeIdentitySources(store,config,{phone,line,since=config?.activatedAt,through=Date.now()}={}){
  try{
    if(!storedScope(store,config,phone,line)||!Number.isSafeInteger(since)||!Number.isSafeInteger(through)||since<config.activatedAt||through<since||through>Date.now())return [];
    const result=[],seen=new Set();
    // Enumerate provenance as well as events. A missing/corrupt event or proof
    // must not hide a previously resolved LID and turn a partial PN query into
    // apparent complete coverage. Unresolved observations are not promoted.
    const artifacts=store.db.prepare('SELECT key,value FROM meta WHERE key LIKE ? OR key LIKE ?').all(cacheProofPrefix+'%','private-native-identity:%');
    for(const artifact of artifacts){
      const value=store.open(artifact.value),proofArtifact=artifact.key.startsWith(cacheProofPrefix);
      if(!proofArtifact&&value?.state!=='RESOLVED_NATIVE_CACHE_PAIR')continue;
      if(!object(value)||!/^57\d{10}$/.test(value.phone??'')||!nativeMid(value.sourceId))throw Error('invalid');
      if(value.phone!==phone)continue;
      const prefix=proofArtifact?cacheProofPrefix:'private-native-identity:';
      if(value.line!==line||artifact.key!==prefix+metaSuffix(value.sourceId))throw Error('scope');
      if(seen.has(value.sourceId))continue;seen.add(value.sourceId);
      const saved=processedProof(store,config,{id:value.sourceId,phone,line},through);if(!saved)throw Error('invalid');
      if(saved.event.at>=since&&saved.event.at<=through)result.push({id:value.sourceId,phone,line,lid:saved.value.lid,at:saved.event.at,proofHash:saved.proof.proofHash});
    }
    return result.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  }catch{throw Error('STORED_NATIVE_IDENTITY_COVERAGE_UNVERIFIED');}
}

function sameEventBody(record,event){
  const m=content(record),kind=m?.audioMessage?'audio':m?.imageMessage?'image':m?.videoMessage?'video':m?.documentMessage?'document':'text';
  const text=m?.conversation??m?.extendedTextMessage?.text??m?.imageMessage?.caption??m?.videoMessage?.caption??'';
  const citations=[...new Set(contexts(record).map(ctx=>ctx.stanzaId).filter(id=>typeof id==='string'&&id.trim()))];
  return kind===event.kind&&text===event.text&&timestamp(record)===event.at&&record.key?.fromMe===false&&!forwarded(record)&&!changed(record)&&citations.length<=1&&(citations[0]??null)===(event.quotedId??null)&&
    !(typeof m?.conversation==='string'&&typeof m?.extendedTextMessage?.text==='string'&&m.conversation!==m.extendedTextMessage.text);
}

/** Recheck an already processed source and its immutable identity proof.
 * Deliberately distinct from prospective ingress: old facts may be re-read,
 * but no missing/old proof is created and no event is queued or replayed.
 */
export async function verifyStoredNativeIdentitySource(store,config,transport,expected,nativeRecord){
  try{
    const now=Date.now();if(transport?.config!==config||typeof transport.verifyLine!=='function'||typeof transport.request!=='function')return null;
    const saved=processedProof(store,config,expected,now);if(!saved)return null;
    const {event,proof,value}=saved,line=config.lines.find(item=>item.phone===FUMIGACION_BLUE&&item.instance===INSTANCE);
    const before=await transport.verifyLine(FUMIGACION_BLUE);if(!bindingVerified(before,line,Date.now()))return null;
    const direct=await transport.request(line,'/chat/findMessages/'+INSTANCE,{where:{key:{id:event.id}},offset:10,page:1});
    const records=direct?.messages?.records;if(!Array.isArray(records)||records.length>10)return null;
    const matches=records.filter(row=>row?.key?.id===event.id);if(matches.length!==1)return null;
    const record=matches[0],pn=event.phone+'@s.whatsapp.net';
    if(record.key.remoteJid!==proof.lid||record.key.remoteJidAlt!=null&&record.key.remoteJidAlt!==''&&record.key.remoteJidAlt!==pn||!ownRecord(record,line)||!sameEventBody(record,event)||immutableRecordHash(record)!==proof.sourceImmutableHash||
      nativeRecord!==undefined&&(!object(nativeRecord)||nativeRecord.key?.id!==event.id||!sameEventBody(nativeRecord,event)||immutableRecordHash(nativeRecord)!==proof.sourceImmutableHash))return null;
    const response=await transport.request(line,'/chat/findMessages/'+INSTANCE,{where:{key:{remoteJid:proof.lid},messageTimestamp:{gte:new Date(config.activatedAt).toISOString(),lte:new Date(event.at).toISOString()}},offset:PAGE_SIZE,page:1});
    const page=response?.messages;if(!object(page)||!Number.isSafeInteger(page.total)||page.total<1||page.total>PAGE_SIZE||!Array.isArray(page.records)||page.records.length!==page.total)return null;
    const rows=page.records.filter(row=>row?.key?.remoteJid===proof.lid);
    if(rows.some(row=>phoneJid(row.key?.remoteJidAlt)&&row.key.remoteJidAlt!==pn))return null;
    const current=rows.filter(row=>row.key.id===event.id);if(current.length!==1||!sameEventBody(current[0],event)||immutableRecordHash(current[0])!==proof.sourceImmutableHash)return null;
    for(const pair of proof.pairSources){
      const found=rows.filter(row=>row.key?.id===pair.id);if(found.length!==1)return null;const row=found[0];
      if(row.key.remoteJidAlt!==pn||row.key.fromMe!==pair.fromMe||timestamp(row)!==pair.at||!ownRecord(row,line)||forwarded(row)||changed(row)||!readable(row)||immutableRecordHash(row)!==pair.immutableHash||pair.fromMe&&!nativeStates(row).states.some(state=>['DELIVERY_ACK','READ',3,4].includes(state)))return null;
    }
    const after=await transport.verifyLine(FUMIGACION_BLUE);if(!bindingVerified(after,line,Date.now()))return null;
    const latest=processedProof(store,config,expected,Date.now());
    if(!latest||latest.proof.proofHash!==proof.proofHash||hash(latest.event)!==hash(event)||latest.value.lid!==value.lid)return null;
    return {verified:true,readOnly:true,sourceId:event.id,phone:event.phone,line:event.line,lid:proof.lid,proofHash:proof.proofHash,record};
  }catch{return null;}
}
