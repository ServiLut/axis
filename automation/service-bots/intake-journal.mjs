import {createHash} from 'node:crypto';
import {BUSINESSES} from './config.mjs';
import {operationalCoverage,operationalLineAllowed} from './line-scope.mjs';

export const INTAKE_JOURNAL_GUARD='own-authenticated-native-private-intake-encrypted-append-only-v1';
const marker='intake-journal:started-v1';
const hash=v=>createHash('sha256').update(v).digest('hex');
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const day=at=>new Date(at-5*3600000).toISOString().slice(0,10);
const phone=j=>/^\d{6,15}@s\.whatsapp\.net$/.test(j??'')?j.split('@')[0]:null;
const exists=store=>Boolean(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='intake_journal'").get());
function ownScope(store,config){
 if(!BUSINESSES[config.company]||store.company!==config.company||!Array.isArray(config.lines)||!config.lines.length||config.lines.some(l=>!BUSINESSES[config.company].phones.includes(l.phone)||typeof l.instance!=='string'))throw Error('INTAKE_JOURNAL_OWN_SCOPE_REQUIRED');
}
export function initializeIntakeJournal(store,config,{now=Date.now()}={}){
 ownScope(store,config);
 store.db.exec(`CREATE TABLE IF NOT EXISTS intake_journal(
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,entry_key TEXT UNIQUE NOT NULL,source_key TEXT NOT NULL,
  original INTEGER NOT NULL,operation TEXT NOT NULL,received_at INTEGER NOT NULL,provider_at INTEGER,
  line TEXT NOT NULL,instance TEXT NOT NULL,received_day TEXT NOT NULL,body TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS intake_journal_day ON intake_journal(received_day,row_id);
  CREATE INDEX IF NOT EXISTS intake_journal_source ON intake_journal(source_key,row_id);
  CREATE UNIQUE INDEX IF NOT EXISTS intake_journal_original ON intake_journal(source_key) WHERE original=1;
  CREATE TRIGGER IF NOT EXISTS intake_journal_no_update BEFORE UPDATE ON intake_journal BEGIN SELECT RAISE(ABORT,'INTAKE_JOURNAL_APPEND_ONLY'); END;
  CREATE TRIGGER IF NOT EXISTS intake_journal_no_delete BEFORE DELETE ON intake_journal BEGIN SELECT RAISE(ABORT,'INTAKE_JOURNAL_APPEND_ONLY'); END;`);
 store.db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').run(marker,store.seal({company:config.company,startedAt:now,guard:INTAKE_JOURNAL_GUARD}));
}
const timestamp=v=>{const n=Number(v&&typeof v==='object'?v.low:v);return v!==undefined&&v!==null&&Number.isFinite(n)&&n>0&&n<32503680000?n*1000:null;};
function content(raw){
 let m=raw.message??raw.update?.message??{};
 for(let i=0;i<4;i++){const next=m.ephemeralMessage?.message??m.viewOnceMessage?.message??m.viewOnceMessageV2?.message;if(!next)break;m=next;}
 for(const kind of ['audio','image','video','document','sticker']){const x=m[kind+'Message'];if(!x)continue;
  const descriptor={kind,originalRead:false};
  for(const key of ['mimetype','fileName','fileLength','seconds','width','height','caption'])if(typeof x[key]==='string'||typeof x[key]==='number')descriptor[key]=x[key];
  return {kind,literalText:typeof x.caption==='string'?x.caption:null,media:descriptor,protocol:m.protocolMessage??null};
 }
 for(const [field,kind,allowed] of [['locationMessage','location',['name','address','degreesLatitude','degreesLongitude']],['liveLocationMessage','live-location',['caption','degreesLatitude','degreesLongitude']],['contactMessage','contact',['displayName']],['contactsArrayMessage','contacts',[]],['buttonsResponseMessage','button-response',['selectedDisplayText','selectedButtonId']],['listResponseMessage','list-response',['title','description']],['pollCreationMessage','poll',['name']],['interactiveResponseMessage','interactive-response',[]]])if(m[field]){
  const descriptor={kind,originalRead:false};for(const k of allowed)if(typeof m[field][k]==='string'||typeof m[field][k]==='number')descriptor[k]=m[field][k];
  return {kind,literalText:descriptor.selectedDisplayText??descriptor.caption??null,media:descriptor,protocol:null};
 }
 const literalText=typeof m.conversation==='string'?m.conversation:typeof m.extendedTextMessage?.text==='string'?m.extendedTextMessage.text:typeof m.reactionMessage?.text==='string'?m.reactionMessage.text:null;
 return {kind:m.protocolMessage?'protocol':m.reactionMessage?'reaction':literalText!==null?'text':typeof raw.messageType==='string'?raw.messageType.slice(0,60):'unknown',literalText,media:null,protocol:m.protocolMessage??null};
}
function identity(key){
 const a=phone(key.remoteJid),b=phone(key.remoteJidAlt);
 if(a&&b&&a!==b)return {phone:null,identity:'PN_CONFLICT'};
 if(a||b)return {phone:a??b,identity:'PN'};
 return {phone:null,identity:[key.remoteJid,key.remoteJidAlt].some(j=>/^\d{5,30}@lid$/.test(j??''))?'LID_PENDING':'UNKNOWN_ADDRESS'};
}
function providerRows(body){
 const data=Array.isArray(body.data)?body.data:[body.data];
 return data.flatMap(v=>v?.keys?.length?v.keys.map(key=>({key,messageTimestamp:v.messageTimestamp,update:v.update})):v?.messages?.length?v.messages: v?[v]:[]);
}

// The caller authenticates the webhook and selects an exact own configured
// instance. Pending originals append before native awaits; proof or failure
// subsequently appends through recordIntakeBinding. No fetch or decoding.
export function recordIntakeWebhook(store,config,body,{authenticated=false,verifiedBinding,bindingPending=false,receivedAt=Date.now()}={}){
 ownScope(store,config);
 const line=config.lines.find(l=>l.instance===body.instance);
 if(!authenticated||!line||(!bindingPending&&(verifiedBinding?.ownerVerified!==true||verifiedBinding.phone!==line.phone||verifiedBinding.instance!==line.instance))||!Number.isFinite(receivedAt))throw Error('INTAKE_JOURNAL_VERIFIED_INGRESS_REQUIRED');
 if(!exists(store))throw Error('INTAKE_JOURNAL_NOT_INITIALIZED');
 const event=String(body.event??'').toLowerCase().replaceAll('_','.');
 if(!['messages.upsert','messages.update','messages.delete'].includes(event))return {recorded:0,duplicates:0,excludedGroups:0,unsupportedEvent:true};
 const result={recorded:0,duplicates:0,excludedGroups:0,unlinkedObservations:0};
 return store.tx(()=>{
  for(const raw of providerRows(body)){
   const nativeKey=raw.key??{id:raw.keyId??raw.id,remoteJid:raw.remoteJid,remoteJidAlt:raw.remoteJidAlt,fromMe:raw.fromMe};
   const parsed=content(raw),revoked=parsed.protocol&&(parsed.protocol.type===0||parsed.protocol.type==='REVOKE');
   const key=revoked&&parsed.protocol.key?parsed.protocol.key:nativeKey;
   if([nativeKey.remoteJid,nativeKey.remoteJidAlt,key.remoteJid,key.remoteJidAlt].some(j=>j?.endsWith('@g.us')||j?.endsWith('@broadcast'))){result.excludedGroups++;continue;}
   if(typeof key.id!=='string'||!key.id.trim()||key.id.length>200)continue;
   const sourceKey=hash(stable([config.company,line.phone,line.instance,key.id]));
   const prior=store.db.prepare('SELECT row_id,body FROM intake_journal WHERE source_key=? AND original=1').get(sourceKey),original=prior?store.open(prior.body):null;
   let operation=event==='messages.delete'||revoked||raw.update?.status==='DELETED'||raw.status==='DELETED'?'delete':event==='messages.update'?'update':'upsert';
   const direct=identity(key),linkedIdentity=direct.identity==='UNKNOWN_ADDRESS'&&original?{phone:original.phone,identity:original.identity}:direct;
   const fromMe=typeof key.fromMe==='boolean'?key.fromMe:original?.fromMe??null;
   const providerAt=timestamp(raw.messageTimestamp??raw.update?.messageTimestamp);
   const status=raw.update?.status??raw.status??null;
   const value={company:config.company,sourceId:key.id,line:line.phone,instance:line.instance,operation,providerAt,receivedAt,fromMe,...linkedIdentity,
    identitySource:linkedIdentity!==direct?'linked-native-original':'native-key',nativeKey:{id:key.id,remoteJid:key.remoteJid??null,remoteJidAlt:key.remoteJidAlt??null,fromMe:typeof key.fromMe==='boolean'?key.fromMe:null},
    kind:parsed.kind,literalText:parsed.literalText,media:parsed.media,status,originalRow:prior?.row_id??null,bindingState:bindingPending?'PENDING':'VERIFIED',nativeOwnerOpen:verifiedBinding?.open===true,operationalLineAtReceipt:operationalLineAllowed(config,line.phone),originalMediaRead:false};
   // Reception time and delivery status cannot turn a duplicate upsert into
   // a new inbound message. A changed upsert appends a revision instead.
   const fingerprint=hash(stable({...value,receivedAt:undefined,status:operation==='upsert'?undefined:status,originalRow:undefined,identitySource:undefined,bindingState:undefined,nativeOwnerOpen:undefined,operationalLineAtReceipt:undefined}));
   if(operation==='upsert'&&original){
    if(original.fingerprint===fingerprint){result.duplicates++;continue;}
    operation='upsert-revision';value.operation=operation;
   }
   const entryKey=hash(stable([sourceKey,operation,fingerprint]));
   if(store.db.prepare('SELECT 1 FROM intake_journal WHERE entry_key=?').get(entryKey)){result.duplicates++;continue;}
   value.fingerprint=fingerprint;
   store.db.prepare('INSERT INTO intake_journal(entry_key,source_key,original,operation,received_at,provider_at,line,instance,received_day,body) VALUES(?,?,?,?,?,?,?,?,?,?)').run(entryKey,sourceKey,Number(operation==='upsert'),operation,receivedAt,providerAt,line.phone,line.instance,day(receivedAt),store.seal(value));
   if(operation!=='upsert'&&!prior)result.unlinkedObservations++;
   result.recorded++;
  }
  return result;
 });
}

export function recordIntakeBinding(store,config,body,{authenticated=false,verifiedBinding,error=null,receivedAt=Date.now()}={}){
 ownScope(store,config);const line=config.lines.find(l=>l.instance===body.instance);
 if(!authenticated||!line||!exists(store)||!Number.isFinite(receivedAt))throw Error('INTAKE_JOURNAL_VERIFIED_INGRESS_REQUIRED');
 const verified=verifiedBinding?.ownerVerified===true&&verifiedBinding.phone===line.phone&&verifiedBinding.instance===line.instance;
 const operation=verified?'binding-verified':'binding-failed';
 return store.tx(()=>{let recorded=0;for(const raw of providerRows(body)){
  const parsed=content(raw),revoke=parsed.protocol&&(parsed.protocol.type===0||parsed.protocol.type==='REVOKE'),key=revoke&&parsed.protocol.key?parsed.protocol.key:raw.key??{id:raw.keyId??raw.id};
  if(typeof key.id!=='string')continue;const sourceKey=hash(stable([config.company,line.phone,line.instance,key.id]));
  const source=store.db.prepare('SELECT row_id FROM intake_journal WHERE source_key=? ORDER BY row_id LIMIT 1').get(sourceKey);if(!source)continue;
  const entryKey=hash(stable([sourceKey,operation,receivedAt]));if(store.db.prepare('SELECT 1 FROM intake_journal WHERE entry_key=?').get(entryKey))continue;
  const candidate=String(error?.message??error??'NATIVE_BINDING_FAILED'),reason=/^[A-Z0-9_]{1,100}$/.test(candidate)?candidate:'NATIVE_BINDING_FAILED';
  const value={company:config.company,sourceId:key.id,line:line.phone,instance:line.instance,originalRow:source.row_id,operation,receivedAt,providerAt:null,bindingState:verified?'VERIFIED':'FAILED',nativeOwnerOpen:verified?verifiedBinding.open===true:null,reason:verified?null:reason};
  store.db.prepare('INSERT INTO intake_journal(entry_key,source_key,original,operation,received_at,provider_at,line,instance,received_day,body) VALUES(?,?,?,?,?,?,?,?,?,?)').run(entryKey,sourceKey,0,operation,receivedAt,null,line.phone,line.instance,day(receivedAt),store.seal(value));recorded++;
 }return {recorded,verified};});
}

export function recordIntakeIngressGap(store,config,{kind,receivedAt=Date.now(),payloadHash=null,byteLength=null}={}){
 ownScope(store,config);
 if(!exists(store)||!['PAYLOAD_TOO_LARGE','INVALID_JSON'].includes(kind)||!Number.isFinite(receivedAt)||payloadHash!==null&&!/^[a-f0-9]{64}$/.test(payloadHash))throw Error('INTAKE_JOURNAL_GAP_REQUIRED');
 const value={company:config.company,operation:'ingress-gap',kind,receivedAt,payloadHash,byteLength,hashOfBoundedPrefix:true,contactKnown:false},entryKey=hash(stable(value));
 return store.db.prepare('INSERT OR IGNORE INTO intake_journal(entry_key,source_key,original,operation,received_at,provider_at,line,instance,received_day,body) VALUES(?,?,?,?,?,?,?,?,?,?)').run(entryKey,entryKey,0,'ingress-gap',receivedAt,null,'','',day(receivedAt),store.seal(value)).changes;
}

export function intakeJournalStatus(store,config,{includeTotals=true}={}){
 ownScope(store,config);
 const start=store.db.prepare('SELECT value FROM meta WHERE key=?').get(marker),started=start?store.open(start.value).startedAt:null;
 const stats=exists(store)?store.db.prepare(includeTotals?'SELECT COUNT(*) entries,SUM(original) originals,MAX(received_at) latest FROM intake_journal':'SELECT received_at latest FROM intake_journal ORDER BY row_id DESC LIMIT 1').get()??{}:{};
 return {guard:INTAKE_JOURNAL_GUARD,enabled:started!==null,journalStartedAt:started,installedFrom:started,entries:includeTotals?stats.entries??0:null,originals:includeTotals?stats.originals??0:null,latestReceivedAt:stats.latest??null,readOnlyJournalAudit:true,historicalCoverageComplete:false,allWhatsAppTrafficComplete:false,providerAcknowledgementCoverage:false,providerDeletionCoverageComplete:false,originalMediaRead:false,appendOnlyApplication:true,administratorStorageImmutability:false};
}

export function intakeAudit(store,config,{company=config.company,day:requestedDay,includeStaff=false,includeOutgoing=false,afterRow=0,limit=200}={}){
 ownScope(store,config);
 if(company!==config.company||!/^\d{4}-\d{2}-\d{2}$/.test(requestedDay??'')||new Date(requestedDay+'T00:00:00Z').toISOString().slice(0,10)!==requestedDay||!Number.isSafeInteger(afterRow)||afterRow<0||!Number.isSafeInteger(limit)||limit<1||limit>500||typeof includeStaff!=='boolean'||typeof includeOutgoing!=='boolean')throw Error('INTAKE_AUDIT_SCOPED_DAY_REQUIRED');
 const status=intakeJournalStatus(store,config,{includeTotals:false}),present=exists(store),columns='row_id,source_key,original,operation,received_at,received_day,body';
 const decode=r=>({...r,value:store.open(r.body)});
 const originals=present?store.db.prepare('SELECT '+columns+' FROM intake_journal WHERE received_day=? AND original=1 ORDER BY row_id').all(requestedDay).map(decode):[];
 const todayObservations=present?store.db.prepare('SELECT '+columns+' FROM intake_journal WHERE received_day=? AND original=0 ORDER BY row_id').all(requestedDay).map(decode):[];
 const originalBySource=new Map(originals.map(r=>[r.source_key,r])),observationByRow=new Map(todayObservations.map(r=>[r.row_id,r]));
 const selectKeys=(keys,predicate)=>{const result=[];for(let i=0;i<keys.length;i+=200){const batch=keys.slice(i,i+200);result.push(...store.db.prepare('SELECT '+columns+' FROM intake_journal WHERE source_key IN ('+batch.map(()=>'?').join(',')+') AND '+predicate+' ORDER BY row_id').all(...batch).map(decode));}return result;};
 if(present){for(const r of selectKeys([...new Set(todayObservations.filter(r=>r.operation!=='ingress-gap').map(r=>r.source_key))].filter(k=>!originalBySource.has(k)),'original=1'))originalBySource.set(r.source_key,r);
  for(const r of selectKeys([...originalBySource.keys()],'original=0'))observationByRow.set(r.row_id,r);}
 const observationsBySource=new Map(),verifiedKeys=new Set(),failedKeys=new Set(),deletedKeys=new Set();
 for(const r of [...observationByRow.values()].sort((a,b)=>a.row_id-b.row_id)){const list=observationsBySource.get(r.source_key)??[];list.push(r);observationsBySource.set(r.source_key,list);if(r.operation==='binding-verified')verifiedKeys.add(r.source_key);if(r.operation==='binding-failed')failedKeys.add(r.source_key);if(r.operation==='delete')deletedKeys.add(r.source_key);}
 const staffPhones=new Set([...Object.values(BUSINESSES).flatMap(v=>v.phones),'573016803926','573233350137','573043332213',...(config.intakeJournalStaffPhones??[])]);
 const isStaff=r=>r.value.phone&&staffPhones.has(r.value.phone);
 const verifiedSource=r=>r.value.bindingState==='VERIFIED'||verifiedKeys.has(r.source_key);
 const eligible=originals.filter(r=>(includeOutgoing||r.value.fromMe!==true)&&(includeStaff||!isStaff(r)));
 const sourceView=r=>{const v=r.value,bindingVerified=verifiedSource(r),observations=(observationsBySource.get(r.source_key)??[]).map(x=>({row:x.row_id,operation:x.operation,receivedAt:x.received_at,providerAt:x.value.providerAt,status:x.value.status??null}));
  return {row:r.row_id,sourceId:v.sourceId,phone:bindingVerified?v.phone:null,nativeClaimedPhone:bindingVerified?null:v.phone,bindingVerified,bindingState:bindingVerified?'VERIFIED':failedKeys.has(r.source_key)?'FAILED':'PENDING',line:v.line,instance:v.instance,providerAt:v.providerAt,receivedAt:v.receivedAt,providerDay:v.providerAt?day(v.providerAt):null,fromMe:v.fromMe,kind:v.kind,systemMessage:v.kind==='protocol',serviceContentEligible:['text','audio','image','video','document'].includes(v.kind),identity:v.identity,literalText:v.literalText,media:v.media,deleted:deletedKeys.has(r.source_key),operationalLine:operationalLineAllowed(config,v.line),observations};};
 const sources=eligible.filter(r=>r.row_id>afterRow).slice(0,limit).map(sourceView);
 const linkedPriorDaySources=[...originalBySource.values()].filter(r=>r.received_day!==requestedDay&&(includeOutgoing||r.value.fromMe!==true)&&(includeStaff||!isStaff(r))).map(sourceView);
 const chats=new Map();for(const r of eligible){const v=r.value;if(!v.phone||v.fromMe!==false||!verifiedSource(r))continue;const k=v.line+':'+v.phone,prior=chats.get(k);if(prior){prior.messageCount++;prior.lastReceivedAt=Math.max(prior.lastReceivedAt,r.received_at);}else chats.set(k,{phone:v.phone,line:v.line,instance:v.instance,messageCount:1,firstReceivedAt:r.received_at,lastReceivedAt:r.received_at,operationalLine:operationalLineAllowed(config,v.line)});}
 const incoming=eligible.filter(r=>r.value.fromMe===false),known=incoming.filter(r=>r.value.phone&&verifiedSource(r)),ids=new Set(originals.map(r=>r.source_key));
 const updates=[...observationByRow.values()].filter(r=>ids.has(r.source_key)||r.received_day===requestedDay);
 const nextRow=sources.at(-1)?.row??afterRow;
 const contacts=[...chats.values()].map(c=>({...c,firstAt:c.firstReceivedAt,lastAt:c.lastReceivedAt}));
 const lines=config.lines.map(l=>{const rs=incoming.filter(r=>r.value.line===l.phone);return {phone:l.phone,instance:l.instance,receivedContacts:contacts.filter(c=>c.line===l.phone).length,receivedMessages:rs.length,verifiedPhoneMessages:rs.filter(r=>r.value.phone&&verifiedSource(r)).length,unverifiedBindingMessages:rs.filter(r=>!verifiedSource(r)).length,pendingIdentityMessages:rs.filter(r=>r.value.phone===null).length,operationalLine:operationalLineAllowed(config,l.phone)};});
 return {company:config.company,readOnly:true,privateAdministrativeResponse:true,guard:INTAKE_JOURNAL_GUARD,day:requestedDay,timeZone:'America/Bogota',dayBasis:'first-authenticated-runtime-received-at',
  coverage:{...status,...operationalCoverage(config),fullCompanyCoverageComplete:false,journalReceiptCoverageOnly:true,providerHistoryRead:false,bodyLiteralOnly:true,providerSyncProven:false},
  aggregates:{originalPrivateIncomingMessages:incoming.length,knownPhoneIncomingMessages:known.length,uniqueKnownPhoneLineChats:chats.size,pendingLidIncomingMessages:incoming.filter(r=>r.value.identity==='LID_PENDING').length,unverifiedBindingIncomingMessages:incoming.filter(r=>!verifiedSource(r)).length,unidentifiedIncomingMessages:incoming.filter(r=>r.value.phone===null).length,unknownDirectionOriginals:eligible.filter(r=>r.value.fromMe===null).length,deletedOriginalMessages:eligible.filter(r=>deletedKeys.has(r.source_key)).length,updateObservations:updates.filter(r=>r.operation!=='ingress-gap'&&!r.operation.startsWith('binding-')).length,ingressGaps:todayObservations.filter(r=>r.operation==='ingress-gap').map(r=>({kind:r.value.kind,receivedAt:r.received_at,payloadHash:r.value.payloadHash,contactKnown:false})),staffOriginalMessagesExcluded:includeStaff?0:originals.filter(isStaff).length,outgoingOriginalMessagesExcluded:includeOutgoing?0:originals.filter(r=>r.value.fromMe===true).length},
  sources,linkedPriorDaySources,chats:contacts,contacts,lines,pendingIdentitySources:sources.filter(r=>r.phone===null||r.fromMe===null),suspendedObservationChats:contacts.filter(c=>!c.operationalLine),
  unlinkedObservations:updates.filter(r=>r.operation!=='ingress-gap'&&!originalBySource.has(r.source_key)).map(r=>({row:r.row_id,operation:r.operation,sourceId:r.value.sourceId,line:r.value.line,receivedAt:r.received_at})),
  afterRow,nextRow,remaining:eligible.filter(r=>r.row_id>nextRow).length,limit,phoneInferred:false,serviceSaved:false,
  limits:['Only authenticated webhooks received after journal installation are recorded; missing delivery, disconnected channels and prior history remain uncovered.','Native PN/explicit alternate only. Unlinked LID, conflicts and unknown direction remain separately unresolved.','Original media content is not opened or interpreted.','Originals survive observed provider updates/deletions; this cannot prove that every deletion was delivered by the provider.','Application append-only guards do not prevent a server/database administrator from changing storage.']};
}
