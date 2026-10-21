import {operationalLineAllowed} from './line-scope.mjs';
import {createHash} from 'node:crypto';

export const EXPLICIT_RETURN_BASELINE_GUARD='own-chief-return-exact-native-mutation-snapshot-v1';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function nativeAttentionMutationHash(record){
 const states=[record.status,record.update?.status,...(Array.isArray(record.MessageUpdate)?record.MessageUpdate.map(v=>v?.status):[])];
 // Receipt-only changes are not staff activity. Preserve mutation multiplicity,
 // bodies and native addressing so a subsequent edit is not the old snapshot.
 const mutations=states.filter(v=>['EDITED','DELETED','REVOKED'].includes(v)).sort();
 return createHash('sha256').update(JSON.stringify(canonical({key:record.key,at:record.messageTimestamp,message:record.message??null,messageType:record.messageType??null,mutations,flags:Object.fromEntries(['isEdited','edited','deleted','isDeleted','revoked','isRevoked'].map(k=>[k,record[k]??false]))}))).digest('hex');
}
export function saveExplicitReturnBaseline(store,config,phone,source,attention){
 const raw=store.db.prepare('SELECT value FROM meta WHERE key=?').get('chief-release:'+phone),release=raw&&store.open(raw.value);
 if(config.company!=='fumigacion'||release?.source!==source.id||!attention?.complete||!Number.isSafeInteger(attention.through)||attention.through>release.at||release.at-attention.through>30000||!Array.isArray(attention.sources)||attention.sources.length>400)throw Error('EXPLICIT_RETURN_BASELINE_UNVERIFIED');
 const sources=attention.sources.filter(v=>v.at+999<source.at&&operationalLineAllowed(config,v.line)&&/^[a-f0-9]{64}$/.test(v.mutationHash??'')).map(({id,line,at,mutationHash})=>({id,line,at,mutationHash}));
 const value={guard:EXPLICIT_RETURN_BASELINE_GUARD,phone,sourceId:source.id,releasedAt:release.at,through:attention.through,sources};
 store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('chief-release-native-baseline:'+phone,store.seal(value));
 store.audit('EXPLICIT_RETURN_NATIVE_BASELINE_SAVED',source.id,{phone,guard:EXPLICIT_RETURN_BASELINE_GUARD,through:attention.through,sources:sources.length});
}

// Read only: a prior explicit chief return can distinguish older native manual
// history from a new takeover. This helper never changes a hold or a marker.
export function priorAttentionRelease(store,config,context,attention){
  if(config.company!=='fumigacion'||store.company!==config.company||context.internal)return null;
  const now=Date.now(),through=attention.through,conversation=store.conversation(context.phone);
  if(!Number.isSafeInteger(through)||through>now||through<config.activatedAt||!conversation||conversation.hold||conversation.line!==context.line||conversation.revision!==context.revision||store.db.prepare("SELECT 1 FROM events WHERE phone=? AND from_me=1 AND state='PENDING'").get(context.phone))return null;
  try{
    const row=store.db.prepare('SELECT value FROM meta WHERE key=?').get('chief-release:'+context.phone);if(!row)return null;
    const release=store.open(row.value);
    if(!release||typeof release!=='object'||Array.isArray(release)||Object.keys(release).some(key=>!['source','at'].includes(key))||typeof release.source!=='string'||!release.source.trim()||release.source.length>200||!Number.isSafeInteger(release.at)||release.at<config.activatedAt||release.at>through||release.at>now||!Number.isSafeInteger(conversation.at)||conversation.at<release.at||conversation.at>now||!Number.isSafeInteger(context.created)||context.created<release.at||context.sourceAt!==undefined&&(!Number.isSafeInteger(context.sourceAt)||context.sourceAt<release.at))return null;
    const baselineRow=store.db.prepare('SELECT value FROM meta WHERE key=?').get('chief-release-native-baseline:'+context.phone),baseline=baselineRow&&store.open(baselineRow.value);
    const validBaseline=baseline?.guard===EXPLICIT_RETURN_BASELINE_GUARD&&baseline.phone===context.phone&&baseline.sourceId===release.source&&baseline.releasedAt===release.at&&Number.isSafeInteger(baseline.through)&&baseline.through<=release.at&&release.at-baseline.through<=30000&&Array.isArray(baseline.sources)&&baseline.sources.length<=400;
    return validBaseline?{...release,nativeBaseline:baseline}:release;
  }catch{return null;}
}
export function nativeSourceBeforeRelease(source,context,release,config,through){
  // Native timestamps have second precision. The whole second must precede
  // the verified return; a source in that same second is still ambiguous.
  const mutationKnown=/^[a-f0-9]{64}$/.test(source.mutationHash??'')&&release?.nativeBaseline?.sources.some(v=>v.id===source.id&&v.line===source.line&&v.at===source.at&&v.mutationHash===source.mutationHash);
  return Boolean(release&&source.line===context.line&&operationalLineAllowed(config,source.line)&&(source.phone===undefined||source.phone===context.phone)&&((source.edited!==true&&source.kind!=='edited-body-unavailable')||mutationKnown)&&typeof source.id==='string'&&source.id&&Number.isSafeInteger(source.at)&&source.at>=config.activatedAt&&source.at<=through&&source.at+999<release.at);
}
export function partitionNativeAttention(store,config,context,attention){
  if(!attention?.complete||!Array.isArray(attention.sources))throw Error('NATIVE_ATTENTION_COVERAGE_REQUIRED');
  const release=priorAttentionRelease(store,config,context,attention),unknown=[],releasedSources=[];
  for(const source of attention.sources){
    if(store.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(source.id,context.phone,source.line))continue;
    if(nativeSourceBeforeRelease(source,context,release,config,attention.through))releasedSources.push(source);else unknown.push(source);
  }
  return {release,unknown,releasedSources};
}
