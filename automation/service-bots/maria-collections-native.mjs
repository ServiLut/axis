import {createHash} from 'node:crypto';
import {knownInternalRecipient} from './config.mjs';
import {MARIA_TENANT,MARIA_COMPANY} from './maria-program.mjs';
import {FUMIGACION_BLUE,FUMIGACION_RED,operationalLineAllowed} from './line-scope.mjs';
import {COLLECTION_SCOPE,groupKey as collectionGroupKey} from './maria-collections.mjs';

export const MARIA_COLLECTIONS_NATIVE_GUARD='own-reviewed-pertinent-collection-native-v1';
export const MARIA_COLLECTIONS_NATIVE_BASIS='collector-native-reviewed-basis-v1';
const LINES=[FUMIGACION_BLUE,FUMIGACION_RED],INSTANCES={[FUMIGACION_BLUE]:'cucaracha-azul',[FUMIGACION_RED]:'cucaracha-roja'};
const SCOPE={company:'fumigacion',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY};
const PN=/^57\d{10}$/,SOURCE=/^[A-Za-z0-9_-]{8,100}$/,HASH=/^[a-f0-9]{64}$/,ID=/^[A-Za-z0-9:_-]{1,160}$/;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const same=(a,b)=>hash(a)===hash(b);
const exact=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.split(',').sort().join(',');
const fail=reason=>{throw Error('COLLECTOR_NATIVE_'+reason)};
const fresh=(at,now,max=120000)=>Number.isSafeInteger(at)&&at>=0&&at<=now&&now-at<=max;
const own=v=>v?.company===SCOPE.company&&v.tenantId===SCOPE.tenantId&&v.companyId===SCOPE.companyId;
const sourceAt=r=>Number(typeof r?.messageTimestamp==='object'?r.messageTimestamp?.low:r?.messageTimestamp)*1000;
const ack=new Set(['PENDING','SERVER_ACK','DELIVERY_ACK','READ',1,2,3,4]);
const mutations=new Set(['EDITED','DELETED','REVOKED','ERROR','FAILED',0]);
const ackUpdateFields=new Set(['id','keyId','messageId','instanceId','status','createdAt','updatedAt','messageTimestamp']);
const sorted=rows=>[...rows].sort((a,b)=>a.line.localeCompare(b.line)||a.at-b.at||a.id.localeCompare(b.id));

/** Public pure projection for the private host review. It returns hashes, never
 * native bodies, attachment locators, display names, accounts or credentials.
 * Delivery ACKs alone do not alter immutable content; mutation markers do. */
export function mariaCollectionsNativeSource(record,phone,line){
 const key=record?.key,pn=phone+'@s.whatsapp.net',at=sourceAt(record),addresses=[key?.remoteJid,key?.remoteJidAlt].filter(v=>v!=null&&v!=='');
 if(!PN.test(phone??'')||knownInternalRecipient(phone)||LINES.includes(phone)||!LINES.includes(line)||!SOURCE.test(key?.id??'')||typeof key.fromMe!=='boolean'||key.participant!=null&&key.participant!==''||record.group===true||record.isGroup===true||!Number.isSafeInteger(at)||at<0||typeof record.messageTimestamp==='object'&&record.messageTimestamp.high!=null&&record.messageTimestamp.high!==0||!addresses.includes(pn)||addresses.some(a=>typeof a!=='string'||!/^57\d{10}@s\.whatsapp\.net$|^\d{5,30}@lid$/.test(a)||a.endsWith('@s.whatsapp.net')&&a!==pn))fail('PN_IDENTITY_REQUIRED');
 const updates=record.MessageUpdate??[];if(!Array.isArray(updates)||updates.some(u=>!u||typeof u!=='object'))fail('MUTATION_FORMAT_REQUIRED');
 if(['update','editedMessage','protocolMessage','protocolType','messageUpdate'].some(k=>record[k]!=null&&record[k]!==false))fail('MUTATED_SOURCE_REVIEW');
 for(const update of updates)if(ack.has(update.status)&&Object.entries(update).some(([k,v])=>!ackUpdateFields.has(k)||k!=='status'&&v!=null&&!['string','number','boolean'].includes(typeof v)))fail('MUTATED_SOURCE_REVIEW');
 const marker={status:ack.has(record.status)?null:record.status??null,updates:updates.filter(u=>!ack.has(u.status)),flags:Object.fromEntries(['isEdited','edited','deleted','isDeleted','revoked','isRevoked'].filter(k=>record[k]!=null&&record[k]!==false).map(k=>[k,record[k]]))};
 const m=record.message?.ephemeralMessage?.message??record.message??{},media=Boolean(m.audioMessage||m.imageMessage||m.videoMessage||m.documentMessage||m.stickerMessage);
 const contexts=[m.extendedTextMessage?.contextInfo,m.audioMessage?.contextInfo,m.imageMessage?.contextInfo,m.videoMessage?.contextInfo,m.documentMessage?.contextInfo,m.messageContextInfo,record.contextInfo].filter(Boolean);
 if([record.status,...updates.map(u=>u.status)].some(s=>mutations.has(s))||updates.some(u=>['message','editedMessage','protocolMessage','update','deleted','revoked','isEdited'].some(k=>u[k]!=null&&u[k]!==false))||Object.keys(marker.flags).length||m.protocolMessage||m.editedMessage)fail('MUTATED_SOURCE_REVIEW');
 if(contexts.some(c=>c.isForwarded===true||Number(c.forwardingScore)>0))fail('FORWARDED_SOURCE_REVIEW');
 const text=m.conversation??m.extendedTextMessage?.text;
 if(!media&&(typeof text!=='string'||!text.trim()))fail('CONTENT_UNAVAILABLE');
 const contentHash=hash({key,at,message:record.message??null,messageType:record.messageType??null,mutation:marker});
 return {line,id:key.id,at,fromMe:key.fromMe,contentHash,media};
}
export const mariaCollectionsNativeHistoryHash=sources=>hash(sorted(sources));

/**
 * Read-only adapter. No constructor I/O, endpoint, token, writes or scheduler.
 * resolveReviewedBasis is a trusted HOST closure over reviewed immutable facts,
 * never a request-body callback/flag or an automatic mirror of these reads.
 * Its closed contract is documented in the private implementation note.
 * Provider pagination alone never establishes sync, identity completeness,
 * prior restrictions, contact permission, or financial/payment reconciliation.
 */
export function createMariaCollectionsNative(config,store,transport,{resolveReviewedBasis,now=Date.now}={}){
 const scoped=()=>{
  if(config?.company!=='fumigacion'||store?.company!=='fumigacion'||transport?.config!==config||typeof transport.verifyLine!=='function'||typeof transport.request!=='function'||typeof transport.currentAttention!=='function'||typeof resolveReviewedBasis!=='function'||typeof now!=='function'||!Array.isArray(config.lines)||config.lines.length!==2||LINES.some(p=>!config.lines.some(l=>l.phone===p&&l.instance===INSTANCES[p])||!operationalLineAllowed(config,p)))fail('OWN_DUAL_RUNTIME_REQUIRED');
 };
 scoped();let lastCheck=null;
 const clock=()=>{const at=now();if(!Number.isSafeInteger(at)||at<0)fail('CLOCK_REQUIRED');return at};
 const manifestRequest=manifest=>{
  scoped();const at=clock(),rows=manifest?.rows,phone=rows?.[0]?.phone,originLine=rows?.[0]?.originLine;
  // Financial row parsing/authority stays in the existing core and the host's
  // pinned catalogue resolver. This shared native binding gate admits no flags
  // and binds the entire immutable manifest, not only its phone or amount.
  if(!exact(manifest,'company,companyId,expiresAt,manifestId,reviewedAt,rows,sourceHash,tenantId,version')||manifest.version!=='collector-finite-manifest-v1'||!own(manifest)||!ID.test(manifest.manifestId??'')||!HASH.test(manifest.sourceHash??'')||!fresh(manifest.reviewedAt,at)||!Number.isSafeInteger(manifest.expiresAt)||manifest.expiresAt<=at||manifest.expiresAt>manifest.reviewedAt+120000||!Array.isArray(rows)||rows.length<1||rows.length>25||!PN.test(phone??'')||knownInternalRecipient(phone)||LINES.includes(phone)||!LINES.includes(originLine)||rows.some(r=>!ID.test(r?.obligationId??'')||!ID.test(r?.clientId??'')||r.phone!==phone||r.originLine!==originLine||r.clientId!==rows[0].clientId)||new Set(rows.map(r=>r.obligationId)).size!==rows.length)fail('REVIEWED_MANIFEST_BINDING_REQUIRED');
  return {key:collectionGroupKey(COLLECTION_SCOPE,rows),manifest:structuredClone(manifest),manifestHash:hash(manifest),phone,originLine};
 };
 const loadInput=input=>{
  scoped();if(!exact(input,'company,tenantId,companyId,lines,rows,key')||!own(input)||!same(input.lines,LINES)||!Array.isArray(input.rows)||!input.rows.length||input.rows.length>25||typeof input.key!=='string')fail('MANIFEST_INPUT_REQUIRED');
  const table=store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='collector_groups'").get();if(!table)fail('DURABLE_MANIFEST_REQUIRED');
  const row=store.db.prepare('SELECT state,body FROM collector_groups WHERE group_key=?').get(input.key),value=row&&store.open(row.body),manifest=value?.manifest;
  if(row?.state!=='STAGED'||!own(manifest)||!same(input.rows,manifest.rows)||value.manifestHash!==hash(manifest))fail('DURABLE_MANIFEST_REQUIRED');
  const req=manifestRequest(manifest);if(input.key!==req.key)fail('DURABLE_MANIFEST_REQUIRED');return req;
 };
 const local=req=>{
  const c=store.conversation(req.phone),s=c?.state;
  if(!c||c.hold!==0||!Number.isSafeInteger(c.revision)||c.line!==req.originLine||!s||typeof s!=='object')fail('LOCAL_ATTENTION_OR_HOLD');
  const flags=['humanHold','awaitingHumanReview','doNotContact','optOutGlobal','contactDeclined','closed'];if(flags.some(k=>s[k]!==undefined&&s[k]!==false)||s.commercialRefusal?.kind==='no-contact')fail('LOCAL_ATTENTION_OR_OPTOUT');
  for(const line of LINES){const suffix=createHash('sha256').update(req.phone+':'+line).digest('hex');if(store.db.prepare('SELECT 1 FROM meta WHERE key=?').get('commercial-optout:fumigacion:'+suffix))fail('DURABLE_OPTOUT');}
  if(store.db.prepare("SELECT 1 FROM events WHERE phone=? AND state IN ('PENDING','PROCESSING','REVIEW','HISTORY_REVIEW','ANSWER_REVIEW','WAITING_COORDINATOR','COLLECTION_REPLY_REVIEW') LIMIT 1").get(req.phone))fail('LOCAL_PENDING_SOURCE');
  if(store.db.prepare("SELECT 1 FROM questions WHERE phone=? AND state IN ('PENDING','LEGACY_PENDING','ANSWER_REVIEW') LIMIT 1").get(req.phone))fail('LOCAL_PENDING_REVIEW');
  if(store.db.prepare("SELECT 1 FROM outbox WHERE phone=? AND internal=0 AND id<>? AND state IN ('READY','COLLECTOR_STAGED','FOLLOWUP_STAGED','RETENTION_STAGED','SENDING','ACCEPTED','UNCERTAIN') LIMIT 1").get(req.phone,req.key))fail('LOCAL_OTHER_ATTEMPT');
  const replies=store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='maria_collection_replies'").get();if(replies&&store.db.prepare('SELECT 1 FROM maria_collection_replies WHERE phone=? LIMIT 1').get(req.phone))fail('DURABLE_REPLY_REVIEW');
  return hash([c.line,c.hold,c.revision,c.at,s]);
 };
 const owners=async()=>{for(const phone of LINES){const binding=await transport.verifyLine(phone);if(binding?.phone!==phone||binding.instance!==INSTANCES[phone]||binding.ownerVerified!==true||binding.open!==true)fail('EXACT_OPEN_OWNER_REQUIRED')}};
 const basisFor=async req=>{
  const b=structuredClone(await resolveReviewedBasis(structuredClone(req))),at=clock();
  if(!exact(b,'guard,company,tenantId,companyId,manifestHash,phone,originLine,reviewedAt,expiresAt,reviewSourceHash,coverage,sources,historyHash,mediaReviews,findings,permittedContactWindow,basisHash')||b.guard!==MARIA_COLLECTIONS_NATIVE_BASIS||!own(b)||b.manifestHash!==req.manifestHash||b.phone!==req.phone||b.originLine!==req.originLine||!fresh(b.reviewedAt,at)||!Number.isSafeInteger(b.expiresAt)||b.expiresAt<=at||b.expiresAt>b.reviewedAt+120000||!HASH.test(b.reviewSourceHash??''))fail('TRUSTED_REVIEWED_BASIS_REQUIRED');
  const {basisHash,...unsigned}=b;if(!HASH.test(basisHash??'')||basisHash!==hash(unsigned))fail('REVIEWED_BASIS_HASH_REQUIRED');
  const c=b.coverage;
  if(!exact(c,'kind,from,through,lines,sourceHash,populationVerified,synchronizationVerified,priorRestrictionsReviewed,identityCoverageVerified')||c.kind!=='predetermined-obligation-pertinent-native-window-v1'||!Number.isSafeInteger(c.from)||c.from<0||!Number.isSafeInteger(c.through)||c.through<c.from||c.through>b.reviewedAt||!same(c.lines,LINES)||!HASH.test(c.sourceHash??'')||c.populationVerified!==true||c.synchronizationVerified!==true||c.priorRestrictionsReviewed!==true||c.identityCoverageVerified!==true)fail('PERTINENT_COVERAGE_EVIDENCE_REQUIRED');
  if(!Array.isArray(b.sources)||b.sources.length<1||b.sources.length>4000||b.sources.some(s=>!exact(s,'line,id,at,fromMe,contentHash,media')||!LINES.includes(s.line)||!SOURCE.test(s.id??'')||!Number.isSafeInteger(s.at)||s.at<c.from||s.at>c.through||typeof s.fromMe!=='boolean'||!HASH.test(s.contentHash??'')||typeof s.media!=='boolean')||new Set(b.sources.map(s=>s.line+':'+s.id)).size!==b.sources.length||b.historyHash!==mariaCollectionsNativeHistoryHash(b.sources)||!b.sources.some(s=>s.line===req.originLine&&s.fromMe===false))fail('REVIEWED_SOURCES_REQUIRED');
  const f=b.findings;
  if(!exact(f,'sourceHistoryHash,semanticReviewComplete,originalLineVerified,contactPermissionVerified,contactDeferralClear,pendingPaymentClaim,optOut,humanHold,contactPurpose')||f.sourceHistoryHash!==b.historyHash||f.semanticReviewComplete!==true||f.originalLineVerified!==true||f.contactPermissionVerified!==true||f.contactDeferralClear!==true||f.pendingPaymentClaim!==false||f.optOut!==false||f.humanHold!==false||f.contactPurpose!=='own-pending-obligation')fail('PAYMENT_PERMISSION_OR_SEMANTIC_REVIEW');
  const media=b.sources.filter(s=>s.media),m=b.mediaReviews;
  if(!Array.isArray(m)||m.length!==media.length||m.some(r=>!exact(r,'line,id,contentHash,originalHash,reviewHash')||!HASH.test(r.originalHash??'')||!HASH.test(r.reviewHash??'')||!media.some(s=>s.line===r.line&&s.id===r.id&&s.contentHash===r.contentHash))||new Set(m.map(r=>r.line+':'+r.id)).size!==m.length)fail('ORIGINAL_MEDIA_REVIEW_REQUIRED');
  const w=b.permittedContactWindow;if(!exact(w,'timezone,from,to,sourceHash')||w.timezone!=='America/Bogota'||!Number.isSafeInteger(w.from)||!Number.isSafeInteger(w.to)||w.from>at||at>=w.to||!HASH.test(w.sourceHash??''))fail('REVIEWED_CONTACT_WINDOW_REQUIRED');
  return b;
 };
 const readSources=async(req,basis)=>{
   const through=clock(),sources=new Map(),checks=[],pn=req.phone+'@s.whatsapp.net',aliases=new Set(),lineAliases=new Map(LINES.map(p=>[p,new Set()]));
   const readQuery=async(phone,field,address,fromMe)=>{
     const line=config.lines.find(l=>l.phone===phone);let total=null,read=0;const seen=new Set();
    for(let page=1;page<=20;page++){
     const result=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{[field]:address,fromMe},messageTimestamp:{gte:new Date(basis.coverage.from).toISOString(),lte:new Date(through).toISOString()}},offset:100,page}),value=result?.messages;
     if(!value||!Number.isSafeInteger(value.total)||value.total<0||value.total>2000||!Array.isArray(value.records)||value.records.length>100||total!==null&&total!==value.total)fail('PAGINATION_UNVERIFIED');
     total=value.total;read+=value.records.length;
     for(const raw of value.records){
      const d=mariaCollectionsNativeSource(raw,req.phone,phone);
      if(raw.key[field]!==address||d.fromMe!==fromMe||d.at<basis.coverage.from||d.at>through||seen.has(d.id))fail('SOURCE_FILTER_OR_RANGE_REQUIRED');seen.add(d.id);
      const key=phone+':'+d.id,old=sources.get(key);if(old&&!same(old,d))fail('SOURCE_VARIANT_OR_MUTATION');sources.set(key,d);if(sources.size>4000)fail('SOURCE_LIMIT_REVIEW');
       for(const lid of [raw.key.remoteJid,raw.key.remoteJidAlt].filter(a=>/^\d{5,30}@lid$/.test(a??''))){const ownAliases=lineAliases.get(phone);if(!ownAliases.has(lid)&&ownAliases.size>=8||!aliases.has(lid)&&aliases.size>=16)fail('LID_COVERAGE_LIMIT');ownAliases.add(lid);aliases.add(lid);}
     }
     if(read===total)break;if(read>total||!value.records.length||page===20)fail('PAGINATION_UNVERIFIED');
    }
     checks.push({line:phone,addressField:field,addressKind:address===pn?field:'explicit-native-lid',fromMe,total,read,closed:read===total});
   };
   for(const phone of LINES)for(const field of ['remoteJid','remoteJidAlt'])for(const fromMe of [false,true])await readQuery(phone,field,pn,fromMe);
   // A discovered LID is a detector, never a transferable PN binding. Query it
   // on both own lines and in both fields; every returned row must itself prove
   // this exact PN through the unchanged native projection above. LID-only,
   // another PN, a mutation or a newly unreviewed descriptor blocks the proof.
   for(const address of aliases)for(const phone of LINES)for(const field of ['remoteJid','remoteJidAlt'])for(const fromMe of [false,true])await readQuery(phone,field,address,fromMe);
  const descriptors=sorted([...sources.values()]);if(!same(descriptors,sorted(basis.sources)))fail('NEW_CHANGED_OR_MISSING_SOURCE');
  return {descriptors,checks,through};
 };
 const reason=e=>/^COLLECTOR_NATIVE_[A-Z_]+$/.test(e?.message??'')?e.message:'COLLECTOR_NATIVE_READ_UNAVAILABLE';
 const blocked=(kind,e)=>{const value={guard:kind==='native'?'collector-native-cross-v1':'collector-current-attention-v1',...SCOPE,complete:false,bothLinesComplete:false,checkedAt:clock(),reason:reason(e),readOnly:true,businessWrites:false,sends:0};lastCheck={...value};return value};
 const runNative=async loadRequest=>{
  const snapshotStartedAt=clock(),req=loadRequest(),before=local(req),basis=await basisFor(req);await owners();const live=await readSources(req,basis);await owners();const afterBasis=await basisFor(req);
  if(!same(basis,afterBasis)||loadRequest().manifestHash!==req.manifestHash||local(req)!==before)fail('BASIS_MANIFEST_OR_ATTENTION_CHANGED');
  const checkedAt=Math.min(snapshotStartedAt,live.through);if(!fresh(checkedAt,clock(),5000))fail('READ_TOO_SLOW');
  const proof={guard:'collector-native-cross-v1',...SCOPE,phone:req.phone,originLine:req.originLine,ownerPhone:req.originLine,instance:INSTANCES[req.originLine],identityVerified:true,originalLineVerified:true,bothLinesComplete:true,mediaReviewComplete:true,pendingPaymentClaim:false,optOut:false,humanHold:false,contactPermissionVerified:true,contactDeferralClear:true,contactPurpose:'own-pending-obligation',checkedAt,historyHash:basis.historyHash,coveredLines:[...LINES],coverage:{kind:basis.coverage.kind,from:basis.coverage.from,reviewedThrough:basis.coverage.through,snapshotStartedAt,queriedThrough:live.through,sourceHash:basis.coverage.sourceHash,basisHash:basis.basisHash,completeForReviewedPertinentScope:true,globalHistoryComplete:false,paginationChecks:live.checks},readOnly:true,businessWrites:false,sends:0};
  return {proof,req,basis,localHash:before};
 };
 async function readNativeHistory(input){try{const {proof}=await runNative(()=>loadInput(input));lastCheck={guard:proof.guard,checkedAt:proof.checkedAt,completeForReviewedPertinentScope:true,globalHistoryComplete:false};return proof}catch(e){return blocked('native',e)}}
 const runAttention=async loadRequest=>{
   const {proof,req,basis,localHash}=await runNative(loadRequest),attention=await transport.currentAttention(req.phone,{store}),at=clock();
   if(attention?.complete!==true||!fresh(attention.through,at,5000)||!Array.isArray(attention.sources)||attention.sources.length>4000||!Array.isArray(attention.checks)||LINES.some(line=>['remoteJid','remoteJidAlt'].some(field=>!attention.checks.some(c=>c.line===line&&c.addressField===field&&Number.isSafeInteger(c.total)&&c.total>=0&&c.total===c.read))))fail('LIVE_ATTENTION_COVERAGE_REQUIRED');
   if(attention.sources.some(s=>!SOURCE.test(s.id??'')||!LINES.includes(s.line)||!Number.isSafeInteger(s.at)||!basis.sources.some(d=>d.line===s.line&&d.id===s.id&&d.at===s.at&&d.fromMe===true)||s.edited===true||s.deleted===true))fail('NEW_OR_UNREVIEWED_HUMAN_ATTENTION');
   // A same-MID body can change while Transport.currentAttention is awaiting.
   // Re-read immutable sources last; id/time alone or an ignored mutationHash
   // cannot establish unchanged content or refresh the original capture time.
   const final=await runNative(loadRequest);
   if(local(req)!==localHash||!same(basis,final.basis)||final.proof.historyHash!==proof.historyHash)fail('BASIS_MANIFEST_OR_ATTENTION_CHANGED');
   const checkedAt=Math.min(proof.checkedAt,attention.through,final.proof.checkedAt);if(!fresh(checkedAt,clock(),5000))fail('READ_TOO_SLOW');
   const result={guard:'collector-current-attention-v1',...SCOPE,phone:req.phone,line:req.originLine,ownerPhone:req.originLine,instance:INSTANCES[req.originLine],complete:true,lineAllowed:true,ownerVerified:true,channelOpen:true,humanHold:false,optOut:false,paidClaim:false,contactAllowedNow:true,permittedContactWindow:structuredClone(basis.permittedContactWindow),checkedAt,historyHash:proof.historyHash,coverage:{completeForReviewedPertinentScope:true,globalHistoryComplete:false,snapshotStartedAt:proof.coverage.snapshotStartedAt,queriedThrough:final.proof.coverage.queriedThrough,attentionThrough:attention.through,sourceHash:basis.coverage.sourceHash,basisHash:basis.basisHash},readOnly:true,businessWrites:false,sends:0};return {attention:result,native:final.proof};
 };
 async function readCurrentAttention(input){try{const {attention}=await runAttention(()=>loadInput(input));lastCheck={guard:attention.guard,checkedAt:attention.checkedAt,completeForReviewedPertinentScope:true,globalHistoryComplete:false};return attention}catch(e){return blocked('attention',e)}}
  async function readCurrentState(input){
   const startedAt=clock();
   try{const req=loadInput(input),{attention,native}=await runAttention(()=>loadInput(input)),checkedAt=Math.min(native.checkedAt,attention.checkedAt);lastCheck={guard:'collector-current-state-v1',checkedAt,completeForReviewedPertinentScope:true,globalHistoryComplete:false};return {guard:'collector-current-state-v1',...SCOPE,phone:req.phone,originLine:req.originLine,checkedAt,native,attention};}
   catch(e){const native={...blocked('native',e),checkedAt:startedAt},attention={...blocked('attention',e),checkedAt:startedAt};lastCheck={guard:'collector-current-state-v1',checkedAt:startedAt,completeForReviewedPertinentScope:false,globalHistoryComplete:false,reason:native.reason};return {guard:'collector-current-state-v1',...SCOPE,phone:input?.rows?.[0]?.phone??null,originLine:input?.rows?.[0]?.originLine??null,checkedAt:Math.min(native.checkedAt,attention.checkedAt),native,attention};}
  }
 async function preflightReviewedManifest(manifest){
  try{
   // No group, obligation claim, staged outbox or fake transaction is created.
   // The host resolver must already have catalogued/pinned this entire hash;
   // an unregistered manifest cannot acquire authority from this operation.
   const result=await runAttention(()=>manifestRequest(manifest));lastCheck={guard:'collector-native-preflight-v1',checkedAt:result.attention.checkedAt,completeForReviewedPertinentScope:true,globalHistoryComplete:false};return {guard:'collector-native-preflight-v1',complete:true,...result,readOnly:true,businessWrites:false,sends:0};
  }catch(e){const native=blocked('native',e),attention=blocked('attention',e);return {guard:'collector-native-preflight-v1',complete:false,reason:native.reason,native,attention,readOnly:true,businessWrites:false,sends:0}}
 }
 return Object.freeze({guard:MARIA_COLLECTIONS_NATIVE_GUARD,readNativeHistory,readCurrentAttention,readCurrentState,preflightReviewedManifest,status:()=>lastCheck&&structuredClone(lastCheck)});
}
