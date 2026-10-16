import {operationalLineAllowed} from './line-scope.mjs';

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
    return release;
  }catch{return null;}
}
export function nativeSourceBeforeRelease(source,context,release,config,through){
  // Native timestamps have second precision. The whole second must precede
  // the verified return; a source in that same second is still ambiguous.
  return Boolean(release&&source.line===context.line&&operationalLineAllowed(config,source.line)&&(source.phone===undefined||source.phone===context.phone)&&source.edited!==true&&source.kind!=='edited-body-unavailable'&&typeof source.id==='string'&&source.id&&Number.isSafeInteger(source.at)&&source.at>=config.activatedAt&&source.at<=through&&source.at+999<release.at);
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
