import {foreignLineSources,nativeTrialBinding,nativeTrialCustomerTurn,nativeTrialAttentionStartsAt,nativeTrialPhoneBinding} from './native-live-trial.mjs';
import {createHash} from 'node:crypto';
import {officeReceptionReplyStillValid} from './office-customer-replies.mjs';
import {explicitNewService} from './after-service.mjs';
import {explicitNewTechnicalCase,technicalIntakeMetaQuestion} from './technical-intake-continuity.mjs';
import { SANDRA, DIEGO, HILARY, CURRENT_OPERATOR_ROUTING, publicTextSafe, normalize,internalRecipients,knownInternalRecipient,chiefReplyRestrictionActive,outboundRecipientAllowed } from './config.mjs';
import {parseChiefDocument} from './chief-document.mjs';
import {selectPrice,verifyPriceSource} from './prices.mjs';
import {understandOwnCustomer,composeOwnReply,ownReplyTextAllowed,probeOwnAi} from './conversational-ai.mjs';
import {drainProgramRegistrations,acceptsOrdinaryQuotation,savedServiceReviewStillValid} from './maria-program.mjs';
import {routeCaseQuestion} from './engine.mjs';
import {initializeInactivityFollowup,queueInactivityFollowups,inactivityDeliveryValid,recordResponseTiming,recordDeliveryTiming} from './inactivity-followup.mjs';
import {tesaCaseAnswers} from './tesa-operations.mjs';
import {drainTesaGroup,tesaCustomerReplyStillValid,unregisteredTesaReplyValid,schedulingReplyValid,schedulingProofForBackend,refreshTesaMembership} from './tesa-transport.mjs';
import {chiefTesaTestSendEntry,chiefTesaTestHash,CHIEF_TESA_TEST_DELIVERY_GUARD} from './chief-tesa-test.mjs';
import {drainOwnScheduling} from './maria-own-order-scheduling.mjs';
import {drainTesaGuidanceLists} from './tesa-guidance-list.mjs';
import {assertOperationalLineScope,operationalLines,operationalLineAllowed,operationalLineStartsAt,operationalHistoryGuard,operationalCoverage,FUMIGACION_BLUE,FUMIGACION_RED,DUAL_LINE_SCOPE_VERSION} from './line-scope.mjs';
import {drainChiefActions} from './chief-actions.mjs';
import {decodeWebhook} from './webhook.mjs';
import {validateEvent} from './config.mjs';
import {literalGreetingEligible,literalGreetingReplyStillValid} from './literal-reception.mjs';
import {priorAttentionRelease,nativeSourceBeforeRelease,nativeAttentionMutationHash} from './explicit-return-attention.mjs';
import {listStoredNativeIdentitySources,verifyStoredNativeIdentitySource} from './native-identity-resolution.mjs';
import {publicEventAllowed,publicOutboxAllowed,publicOperationAllowed,publicResponseSqlCutoff,publicLineSqlFilter} from './public-response-window.mjs';

export const MARIA_HISTORY_PROTOCOL_GUARD='own-preactivation-synchronization-only-complete-history-v1';
export const READ_SUPERVISION_GUARD='own-blue-empty-read-receipts-without-human-authorship-v1';
export const MARIA_ATTENTION_FAILURE_GUARD='own-fum-native-attention-failure-blocks-output-without-human-hold-v1';

const historyStart=Date.parse('2000-01-01T00:00:00.000Z');
const historyObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const receiptStates=new Set(['DELIVERY_ACK','READ',3,4]);
const receiptFlags=['isEdited','edited','deleted','isDeleted','revoked','isRevoked'];
const receiptFields=new Set(['id','instanceId','key','messageTimestamp','message','status','update','MessageUpdate','messageType','pushName','source','contextInfo',...receiptFlags]);
function emptyReceiptBody(message){
  if(message==null)return true;
  if(!historyObject(message))return false;
  return Object.entries(message).every(([key,value])=>key==='conversation'?typeof value==='string'&&!value.trim():key==='extendedTextMessage'&&historyObject(value)&&Object.keys(value).length===1&&typeof value.text==='string'&&!value.text.trim());
}
function isolatedReadReceipt(config,line,record){
  // This exception proves only empty acknowledgement metadata. Any original
  // media, protocol, unknown body, mutation marker or unrecognized status stays
  // on the existing conservative path; a receipt never releases a stored hold.
  const approvedRed=config.company==='fumigacion'&&line.phone===FUMIGACION_RED&&line.instance==='cucaracha-roja'&&assertOperationalLineScope(config)?.version===DUAL_LINE_SCOPE_VERSION&&operationalLineAllowed(config,line.phone);
  if(config.company!=='fumigacion'||line.phone!==FUMIGACION_BLUE&&!approvedRed||!historyObject(record)||Object.keys(record).some(key=>!receiptFields.has(key))||!emptyReceiptBody(record.message)||record.messageType!=null||receiptFlags.some(key=>record[key]!=null&&record[key]!==false))return false;
  if(['id','instanceId','pushName','source'].some(key=>record[key]!=null&&typeof record[key]!=='string'))return false;
  if(record.contextInfo!=null&&(!historyObject(record.contextInfo)||Object.keys(record.contextInfo).length))return false;
  const states=[];
  if(record.status!=null)states.push(record.status);
  if(record.update!=null){if(!historyObject(record.update)||Object.keys(record.update).some(key=>key!=='status')||record.update.status==null)return false;states.push(record.update.status);}
  if(record.MessageUpdate!=null){
    if(!Array.isArray(record.MessageUpdate)||record.MessageUpdate.some(update=>!historyObject(update)||Object.keys(update).length!==1||update.status==null))return false;
    states.push(...record.MessageUpdate.map(update=>update.status));
  }
  return states.length>0&&states.every(state=>receiptStates.has(state));
}
function outgoingMutation(record){
  const states=[record.status,record.update?.status,...(Array.isArray(record.MessageUpdate)?record.MessageUpdate.map(update=>update?.status):[])];
  const message=record.message?.ephemeralMessage?.message??record.message??{},protocol=message.protocolMessage;
  return {edited:record.isEdited===true||record.edited===true||states.includes('EDITED'),
    deleted:record.deleted===true||record.isDeleted===true||record.revoked===true||record.isRevoked===true||states.some(state=>state==='DELETED'||state==='REVOKED')||protocol?.type===0||protocol?.type==='REVOKE'};
}
function isolatedHistorySynchronization(record){
  const message=record.message,protocol=message?.protocolMessage;
  if(!historyObject(message)||Object.keys(message).length!==1||!historyObject(protocol)||Object.keys(protocol).length!==1||protocol.type!=='HISTORY_SYNC_NOTIFICATION')return false;
  // Only the demonstrated, content-free packet qualifies. Wrappers, edits,
  // revocations and unknown metadata remain positive attention evidence.
  if(record.messageType!=null&&record.messageType!=='protocolMessage'||record.status!=null||record.update!=null)return false;
  if(record.MessageUpdate!==undefined&&(!Array.isArray(record.MessageUpdate)||record.MessageUpdate.length))return false;
  return !['isEdited','edited','deleted','isDeleted','revoked','isRevoked'].some(key=>record[key]!=null&&record[key]!==false);
}
function canonicalHistoryValue(value){
  if(Array.isArray(value))return value.map(canonicalHistoryValue);
  if(historyObject(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalHistoryValue(value[key])]));
  return value;
}
function historySourceHash(record){
  const source={key:record.key,messageTimestamp:Number(record.messageTimestamp),message:record.message??null};
  for(const key of ['messageType','status','update','MessageUpdate','isEdited','edited','deleted','isDeleted','revoked','isRevoked'])source[key]=record[key]??null;
  return createHash('sha256').update(JSON.stringify(canonicalHistoryValue(source))).digest('hex');
}
function rememberHistorySource(sources,line,record){
  const key=line.phone+':'+record.key.id,hash=historySourceHash(record),previous=sources.get(key);
  if(previous&&previous!==hash)throw Error('HISTORY_RESULT_UNVERIFIED');
  sources.set(key,hash);return hash;
}
async function knownNativeLidWindow(transport,store,phone,since,through,{outgoing=false}={}){
  if(!store)return {sources:[],checks:[]};
  const c=transport.config,sources=[],checks=[];
  if(store.company!==c.company)throw Error('STORED_NATIVE_IDENTITY_SCOPE_REQUIRED');
  for(const line of operationalLines(c)){
    const anchors=listStoredNativeIdentitySources(store,c,{phone,line:line.phone,since:nativeTrialAttentionStartsAt(c,phone),through});
    const lids=[...new Set(anchors.map(source=>source.lid))];
    for(const lid of lids){
      const anchor=anchors.find(source=>source.lid===lid);
      if(!await verifyStoredNativeIdentitySource(store,c,transport,{id:anchor.id,phone,line:line.phone,at:anchor.at,fromMe:false,forwarded:false}))throw Error('STORED_NATIVE_IDENTITY_ANCHOR_UNVERIFIED');
      const seen=new Set();let total=null,read=0;
      for(let page=1;page<=2;page++){
        const data=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{remoteJid:lid,fromMe:outgoing},messageTimestamp:{gte:new Date(since).toISOString(),lte:new Date(through).toISOString()}},offset:50,page}),value=data?.messages;
        if(!value||!Number.isSafeInteger(value.total)||value.total<0||value.total>100||!Array.isArray(value.records)||value.records.length>50||total!==null&&total!==value.total)throw Error('STORED_NATIVE_LID_COVERAGE_UNVERIFIED');
        total=value.total;read+=value.records.length;
        for(const record of value.records){
          const key=record?.key;if(key?.remoteJid!==lid)continue; // Native OR overfetch never confers identity.
          if(typeof key.fromMe!=='boolean')throw Error('STORED_NATIVE_LID_SOURCE_UNVERIFIED');
          if(key.fromMe!==outgoing)continue;
          if(!/^[A-Za-z0-9_-]{8,100}$/.test(key.id||'')||seen.has(key.id))throw Error('STORED_NATIVE_LID_SOURCE_UNVERIFIED');
          seen.add(key.id);const pn=phone+'@s.whatsapp.net';
          if(key.remoteJidAlt!=null&&key.remoteJidAlt!==''&&key.remoteJidAlt!==pn)throw Error('STORED_NATIVE_LID_IDENTITY_CONFLICT');
          if(outgoing&&record.messageTimestamp==null&&isolatedReadReceipt(c,line,record))continue;
          const at=Number(typeof record.messageTimestamp==='object'?record.messageTimestamp?.low:record.messageTimestamp)*1000;
          if(!Number.isSafeInteger(at)||at<since||at>through)throw Error('STORED_NATIVE_LID_SOURCE_UNVERIFIED');
          if(!outgoing&&key.remoteJidAlt!==pn&&!await verifyStoredNativeIdentitySource(store,c,transport,{id:key.id,phone,line:line.phone,at,fromMe:false,forwarded:false},record))throw Error('STORED_NATIVE_LID_UNPROCESSED_SOURCE');
          if(outgoing){
            const m=record.message?.ephemeralMessage?.message??record.message??{},text=m.conversation??m.extendedTextMessage?.text??'',written=typeof text==='string'&&text.trim(),media=Boolean(m.audioMessage||m.imageMessage||m.videoMessage||m.documentMessage),{edited,deleted}=outgoingMutation(record);
            if(written||media||edited||deleted)sources.push({id:key.id,line:line.phone,at,kind:media?'media':written?'text':edited?'edited-body-unavailable':'deleted-body-unavailable',mutationHash:nativeAttentionMutationHash(record),...(edited?{edited:true}:{}),...(deleted?{deleted:true}:{})});
          }else sources.push({id:key.id,line:line.phone,at});
        }
        if(read===total)break;
        if(!value.records.length||read>total||page===2)throw Error('STORED_NATIVE_LID_COVERAGE_UNVERIFIED');
      }
      checks.push({line:line.phone,addressField:'stored-native-lid',lidHash:createHash('sha256').update(lid).digest('hex'),anchorSourceId:anchor.id,total,read});
      await transport.verifyLine(line.phone);
    }
  }
  return {sources,checks};
}
function protocolHistorySourceInScope(record,addressField,phone,cutoff,receiptOnly=false){
  const key=record?.key,pn=phone+'@s.whatsapp.net',at=Number(record?.messageTimestamp)*1000;
  const ownAddress=value=>value===pn||/^\d+@lid$/.test(value??'');
  return historyObject(record)&&historyObject(key)&&key[addressField]===pn&&key.fromMe===true&&typeof key.id==='string'&&key.id.length>0&&
    ownAddress(key.remoteJid)&&(key.remoteJidAlt==null||ownAddress(key.remoteJidAlt))&&
    (receiptOnly&&record.messageTimestamp==null||['string','number'].includes(typeof record.messageTimestamp)&&Number.isFinite(at)&&at>=historyStart&&at<cutoff);
}
async function verifiedProtocolHistory(transport,line,addressField,phone,initial,sources){
  const c=transport.config,total=initial.total,first=initial.records[0];
  const inScope=record=>protocolHistorySourceInScope(record,addressField,phone,c.activatedAt,isolatedReadReceipt(c,line,record));
  if(c.company!=='fumigacion'||total>100||!inScope(first))throw Error('HISTORY_RESULT_UNVERIFIED');
  const anchorHash=historySourceHash(first),seen=new Set(),sourceHashes=[],attentionSources=[];let read=0,protocolCount=0,readReceiptCount=0;
  for(let page=1;page<=2;page++){
    const data=await transport.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{
      where:{key:{[addressField]:phone+'@s.whatsapp.net',fromMe:true},messageTimestamp:{gte:'2000-01-01T00:00:00.000Z',lte:new Date(c.activatedAt-1).toISOString()}},offset:50,page
    });
    const value=data?.messages;
    if(!value||value.total!==total||!Array.isArray(value.records)||value.records.length!==Math.min(50,total-read))throw Error('HISTORY_RESULT_UNVERIFIED');
    if(page===1&&(value.records[0]?.key?.id!==first.key.id||historySourceHash(value.records[0])!==anchorHash))throw Error('HISTORY_RESULT_UNVERIFIED');
    for(const record of value.records){
      if(!inScope(record)||seen.has(record.key.id))throw Error('HISTORY_RESULT_UNVERIFIED');
      seen.add(record.key.id);const sourceHash=rememberHistorySource(sources,line,record);sourceHashes.push(sourceHash);read++;
      if(isolatedHistorySynchronization(record))protocolCount++;
      else if(isolatedReadReceipt(c,line,record))readReceiptCount++;
      else attentionSources.push({id:record.key.id,at:Number(record.messageTimestamp)*1000,sourceHash});
    }
    if(read===total)return {...(protocolCount?{protocolGuard:MARIA_HISTORY_PROTOCOL_GUARD}:{}),...(readReceiptCount?{readSupervisionGuard:READ_SUPERVISION_GUARD,readReceiptCount}:{}),complete:true,read,protocolCount,attentionOutgoing:protocolCount+readReceiptCount!==total,attentionSources,
      firstSourceHash:anchorHash,sourcesHash:createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex')};
  }
  throw Error('HISTORY_RESULT_UNVERIFIED');
}

export class Transport {
  constructor(config, fetcher=fetch){this.config=config;this.fetcher=fetcher;}
  async request(line,path,body) {
    if(!this.config.lines.includes(line)||!line.apiKey)throw new Error('INSTANCE_ACCESS_REQUIRED');
    if(path.startsWith('/message/')&&!outboundRecipientAllowed(this.config,body?.number))throw Error('CHIEF_ONLY_DELIVERY_RESTRICTION');
    if(!operationalLineAllowed(this.config,line.phone)){
      // A suspended line may still supply authenticated staff evidence. These
      // exact provider routes are reads, never sending or reconnecting.
      const bindingRead=!body&&path==='/instance/fetchInstances?instanceName='+encodeURIComponent(line.instance);
      const messageRead=body&&path==='/chat/findMessages/'+encodeURIComponent(line.instance);
      if(!bindingRead&&!messageRead)throw Error('LINE_SUSPENDED_BY_AUTHORIZED_SCOPE');
    }
    const response=await this.fetcher(this.config.provider+path,{method:body?'POST':'GET',headers:{apikey:line.apiKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('CHANNEL_HTTP_'+response.status); return response.json();
  }
  async verifyLineBinding(phone) {
    const line=this.config.lines.find(l=>l.phone===phone);if(!line)throw new Error('LINE_OUTSIDE_COMPANY');
    const data=await this.request(line,'/instance/fetchInstances?instanceName='+encodeURIComponent(line.instance));
    const scope=Array.isArray(data)?data:[data];
    const own=scope.filter(x=>(x.name??x.instance?.instanceName??x.instanceName)===line.instance);
    if(scope.length!==1||own.length!==1||own[0].ownerJid?.split('@')[0]!==phone)throw new Error('CHANNEL_OWNER_MISMATCH');
    return {phone,instance:line.instance,open:String(own[0].connectionStatus).toLowerCase()==='open',ownerVerified:true,checkedAt:new Date().toISOString()};
  }
  async verifyLine(phone) {
    if(!this.config.lines.some(line=>line.phone===phone))throw new Error('LINE_OUTSIDE_COMPANY');
    if(!operationalLineAllowed(this.config,phone))throw Error('LINE_SUSPENDED_BY_AUTHORIZED_SCOPE');
    const binding=await this.verifyLineBinding(phone);
    if(!binding.open)throw new Error('CHANNEL_NOT_OPEN');
    return binding;
  }
  async verifyChiefCommandSource(source){
    const c=this.config;
    if(c.company!=='fumigacion'||source?.phone!==SANDRA||source.fromMe!==false||source.forwarded||source.kind!=='text'||!operationalLineAllowed(c,source.line))throw Error('CHIEF_NATIVE_SOURCE_UNVERIFIED');
    const line=c.lines.find(l=>l.phone===source.line);if(!line)throw Error('CHIEF_NATIVE_SOURCE_UNVERIFIED');
    await this.verifyLine(source.line);
    const response=await this.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{id:source.id}},offset:2,page:1});
    const records=response?.messages?.records;
    if(response?.messages?.total!==1||!Array.isArray(records)||records.length!==1)throw Error('CHIEF_NATIVE_SOURCE_UNVERIFIED');
    const decoded=decodeWebhook({instance:line.instance,event:'messages.upsert',data:records},c);
    if(decoded.events.length!==1)throw Error('CHIEF_NATIVE_SOURCE_UNVERIFIED');
    const checked=validateEvent(decoded.events[0],c);
    if(checked.id!==source.id||checked.phone!==SANDRA||checked.line!==source.line||checked.fromMe!==false||checked.forwarded||checked.kind!==source.kind||checked.text!==source.text||checked.at!==source.at||(checked.quotedId??null)!==(source.quotedId??null))throw Error('CHIEF_NATIVE_SOURCE_UNVERIFIED');
    return {verified:true,sourceId:checked.id,phone:checked.phone,line:checked.line,at:checked.at};
  }
  async verifyChiefSimulationOutput(row,text,first){
    const c=this.config,blue='573126944997',digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(canonicalHistoryValue(value))).digest('hex');
    if(c.company!=='fumigacion'||c.enabled!==false||c.chiefOnly!==true||c.replyOnlyToChief!==true||row?.phone!==SANDRA||row.line!==blue||row.internal!==1||!/^chief-simulation:[a-f0-9-]{36}:SIM_OUTPUT_[a-f0-9]{48}$/.test(row.id??'')||!['DELIVERED','READ'].includes(row.state)||typeof text!=='string'||!text.startsWith('SIMULACIÓN · ')||!row.mid||first?.mid!==row.mid||first.line!==blue||!['DELIVERED','READ'].includes(first.state)||!Number.isSafeInteger(first.verifiedAt)||first.verifiedAt<row.created||first.verifiedAt>Date.now())throw Error('SIMULATION_EXACT_INTERNAL_DELIVERY_REQUIRED');
    const line=c.lines.find(l=>l.phone===blue);if(!line||!operationalLineAllowed(c,blue))throw Error('SIMULATION_EXACT_INTERNAL_DELIVERY_REQUIRED');
    await this.verifyLine(blue);
    const raw=await this.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{id:row.mid}},offset:2,page:1}),records=raw?.messages?.records;
    if(raw?.messages?.total!==1||!Array.isArray(records)||records.length!==1)throw Error('SIMULATION_EXACT_INTERNAL_DELIVERY_REQUIRED');
    const record=records[0],decoded=decodeWebhook({instance:line.instance,event:'messages.upsert',data:records},c),event=decoded.events.length===1?validateEvent(decoded.events[0],c):null;
    const m=record?.message?.ephemeralMessage?.message??record?.message??{},contexts=[m.extendedTextMessage?.contextInfo,m.messageContextInfo,record.contextInfo].filter(value=>value&&typeof value==='object'),states=[record?.status,record?.update?.status,...(record?.MessageUpdate??[]).map(update=>update.status)],state=states.some(status=>status==='READ'||status===4)?'READ':states.some(status=>status==='DELIVERY_ACK'||status===3)?'DELIVERED':null;
    if(!event||event.id!==row.mid||event.phone!==SANDRA||event.line!==blue||event.fromMe!==true||event.forwarded||event.quotedId||event.kind!=='text'||event.text!==text||typeof m.conversation==='string'&&typeof m.extendedTextMessage?.text==='string'&&m.conversation!==m.extendedTextMessage.text||contexts.some(value=>typeof value.stanzaId==='string'&&value.stanzaId.trim())||!state||event.at+999<row.created||event.at>first.verifiedAt||m.protocolMessage||m.editedMessage||record.message?.protocolMessage||['isEdited','edited','deleted','isDeleted','revoked','isRevoked'].some(key=>record[key]!=null&&record[key]!==false)||states.some(value=>['EDITED','DELETED','REVOKED'].includes(value)))throw Error('SIMULATION_EXACT_INTERNAL_DELIVERY_REQUIRED');
    await this.verifyLine(blue);
    return {guard:'own-exact-internal-chief-simulation-output-delivery-v1',verified:true,internal:true,recipient:SANDRA,line:blue,outboxId:row.id,mid:row.mid,text,textHash:digest(text),state,verifiedAt:first.verifiedAt,checkedAt:Date.now(),nativeProofHash:digest({record,firstDelivery:first,outboxId:row.id})};
  }
  async sendChiefTesaTest(store,cycleId){
    const c=this.config,initial=chiefTesaTestSendEntry(store,c,cycleId),line=c.lines.find(value=>value.phone===initial.line);
    let mid=null;
    try{
      if(!line?.apiKey)throw Error('CHIEF_TESA_TEST_INSTANCE_ACCESS_REQUIRED');
      const membership=await refreshTesaMembership(c,this,{force:true});
      if(!membership||membership.senderLine!==initial.line||membership.groupJid!==initial.groupJid||membership.groupSubject!==initial.groupSubject)throw Error('CHIEF_TESA_TEST_GROUP_UNVERIFIED');
      const native=await this.verifyChiefCommandSource(initial.source);
      if(native?.verified!==true||native.sourceId!==initial.source.id||native.phone!==initial.source.phone||native.line!==initial.line||native.at!==initial.source.at)throw Error('CHIEF_TESA_TEST_SOURCE_UNVERIFIED');
      if(chiefTesaTestHash(chiefTesaTestSendEntry(store,c,cycleId))!==chiefTesaTestHash(initial)||Date.now()-initial.source.at>120000)throw Error('CHIEF_TESA_TEST_SNAPSHOT_CHANGED');
      // This is the sole, fixed-body exception. Generic /message routes and
      // every ordinary/customer/group queue keep the Sandra-only restriction.
      const response=await this.fetcher(c.provider+'/message/sendText/'+encodeURIComponent(line.instance),{method:'POST',headers:{apikey:line.apiKey,'Content-Type':'application/json'},body:JSON.stringify({number:initial.groupJid,text:initial.text,linkPreview:false}),redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response?.ok)throw Error('CHIEF_TESA_TEST_SEND_UNCERTAIN');
      const sent=await response.json();
      if(typeof sent?.key?.id==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(sent.key.id))mid=sent.key.id;
      if(!mid||sent.key.remoteJid!==initial.groupJid||sent.key.fromMe!==true)throw Error('CHIEF_TESA_TEST_SEND_UNCERTAIN');
      const after=await refreshTesaMembership(c,this,{force:true});
      if(!after||after.senderLine!==initial.line||after.groupJid!==initial.groupJid||after.groupSubject!==initial.groupSubject||chiefTesaTestHash(chiefTesaTestSendEntry(store,c,cycleId))!==chiefTesaTestHash(initial))throw Error('CHIEF_TESA_TEST_SNAPSHOT_CHANGED');
      return {mid,line:initial.line,groupJid:initial.groupJid,textHash:initial.textHash,deliveryVerified:false,responseHash:chiefTesaTestHash(sent)};
    }catch(error){if(mid)error.mid=mid;throw error;}
  }
  async verifyChiefTesaTestDelivery(store,cycleId){
    const c=this.config,initial=chiefTesaTestSendEntry(store,c,cycleId,{lookup:true}),line=c.lines.find(value=>value.phone===initial.line);
    if(!line?.apiKey)throw Error('CHIEF_TESA_TEST_INSTANCE_ACCESS_REQUIRED');
    const before=await refreshTesaMembership(c,this,{force:true});
    if(!before||before.senderLine!==initial.line||before.groupJid!==initial.groupJid||before.groupSubject!==initial.groupSubject)throw Error('CHIEF_TESA_TEST_GROUP_UNVERIFIED');
    const key=initial.mid?{id:initial.mid}:{remoteJid:initial.groupJid,fromMe:true};
    const raw=await this.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key,...(!initial.mid?{messageTimestamp:{gte:new Date(Math.floor(initial.sendStartedAt/1000)*1000).toISOString(),lte:new Date().toISOString()}}:{})},offset:initial.mid?2:100,page:1}),messages=raw?.messages;
    if(!messages||!Number.isSafeInteger(messages.total)||messages.total<0||messages.total>(initial.mid?1:100)||!Array.isArray(messages.records)||messages.records.length!==messages.total)throw Error('CHIEF_TESA_TEST_NATIVE_COVERAGE_UNVERIFIED');
    const matches=[],seen=new Set();
    for(const record of messages.records){
      if(record?.key?.remoteJid!==initial.groupJid||record.key.fromMe!==true)continue;
      const id=record.key.id,m=record.message?.ephemeralMessage?.message??record.message??{},text=m.conversation??m.extendedTextMessage?.text;
      if(initial.mid&&id!==initial.mid)throw Error('CHIEF_TESA_TEST_NATIVE_SOURCE_UNVERIFIED');
      if(text!==initial.text)continue;
      const at=Number(typeof record.messageTimestamp==='object'?record.messageTimestamp.low:record.messageTimestamp)*1000;
      const contexts=[m.extendedTextMessage?.contextInfo,m.messageContextInfo,record.contextInfo].filter(value=>value&&typeof value==='object');
      if(!/^[A-Za-z0-9_-]{8,100}$/.test(id??'')||seen.has(id)||!Number.isSafeInteger(at)||at+999<initial.sendStartedAt||at>Date.now()||typeof m.conversation==='string'&&typeof m.extendedTextMessage?.text==='string'&&m.conversation!==m.extendedTextMessage.text||contexts.some(value=>value.isForwarded||Number(value.forwardingScore)>0||value.stanzaId)||[record.key.participant,record.key.participantAlt].some(value=>/^57\d{10}@s\.whatsapp\.net$/.test(value??'')&&value!==initial.line+'@s.whatsapp.net')||m.protocolMessage||m.editedMessage||record.message?.protocolMessage||['isEdited','edited','deleted','isDeleted','revoked','isRevoked'].some(k=>record[k]!=null&&record[k]!==false)||record.MessageUpdate!=null&&!Array.isArray(record.MessageUpdate))throw Error('CHIEF_TESA_TEST_NATIVE_SOURCE_UNVERIFIED');
      const allowedStates=new Set(['PENDING','SENT','SERVER_ACK','DELIVERY_ACK','READ','PLAYED','ERROR','FAILED','EDITED','DELETED','REVOKED',0,1,2,3,4,5]);
      if(record.update!=null||record.status!=null&&!allowedStates.has(record.status)||(record.MessageUpdate??[]).length>100||(record.MessageUpdate??[]).some(update=>!historyObject(update)||typeof record.id!=='string'||!record.id||!allowedStates.has(update.status)||Object.keys(update).some(key=>!['status','id','messageId','keyId','messageKeyId','instanceId'].includes(key))||update.messageId!==undefined&&update.messageId!==record.id||update.instanceId!==undefined&&update.instanceId!==record.instanceId||update.keyId!==undefined&&update.keyId!==record.key.id||update.messageKeyId!==undefined&&update.messageKeyId!==record.key.id))throw Error('CHIEF_TESA_TEST_NATIVE_SOURCE_UNVERIFIED');
      seen.add(id);
      const states=[record.status,...(record.MessageUpdate??[]).map(update=>update.status)];
      if(states.some(value=>['ERROR','FAILED','EDITED','DELETED','REVOKED',0].includes(value)))throw Error('CHIEF_TESA_TEST_NATIVE_SOURCE_UNVERIFIED');
      const state=states.some(value=>value==='READ'||value===4)?'READ':states.some(value=>value==='DELIVERY_ACK'||value===3)?'DELIVERED':null;
      matches.push({record,mid:id,at,state});
    }
    if(matches.length>1)throw Error('CHIEF_TESA_TEST_NATIVE_AMBIGUOUS');
    const after=await refreshTesaMembership(c,this,{force:true});
    if(!after||after.senderLine!==initial.line||after.groupJid!==initial.groupJid||after.groupSubject!==initial.groupSubject||chiefTesaTestHash(chiefTesaTestSendEntry(store,c,cycleId,{lookup:true}))!==chiefTesaTestHash(initial))throw Error('CHIEF_TESA_TEST_SNAPSHOT_CHANGED');
    const exact=matches[0];if(!exact?.state)return {verified:false,pending:true,cycleId,mid:exact?.mid??initial.mid,deliveryVerified:false};
    return {guard:CHIEF_TESA_TEST_DELIVERY_GUARD,verified:true,cycleId,line:initial.line,groupJid:initial.groupJid,groupSubject:initial.groupSubject,mid:exact.mid,text:initial.text,textHash:initial.textHash,state:exact.state,at:exact.at,checkedAt:Date.now(),nativeProofHash:chiefTesaTestHash({record:exact.record,beforeMembership:before.verifiedMembership.sourceHash,afterMembership:after.verifiedMembership.sourceHash})};
  }
  async send(row,text) {
    if(!outboundRecipientAllowed(this.config,row?.phone))throw Error('CHIEF_ONLY_DELIVERY_RESTRICTION');
    if(!publicOperationAllowed(this.config,{line:row?.line,sourceAt:row?.created,createdAt:row?.created}))throw Error('PUBLIC_RESPONSE_WINDOW_REQUIRED');
    if(!row.internal&&!this.config.enabled)throw new Error('CUSTOMER_GATE_CLOSED');
    if(row.internal&&!internalRecipients(this.config).includes(row.phone))throw new Error('INTERNAL_RECIPIENT_MISMATCH');
    if(!row.internal&&knownInternalRecipient(row.phone)&&!nativeTrialBinding(this.config,row.phone,row.line,row.created))throw new Error('INTERNAL_ROLE_REQUIRED');
    if(!row.internal&&!publicTextSafe(text))throw new Error('EXTERNAL_TEXT_REJECTED');
    if(!/^57\d{10}$/.test(row.phone))throw new Error('GROUP_OR_INVALID_RECIPIENT');
    const line=this.config.lines.find(l=>l.phone===row.line);if(!line)throw new Error('LINE_OUTSIDE_COMPANY');
    if(typeof text==='object'){
      if(!row.internal||row.phone!==SANDRA||text?.kind!=='chief_document')throw Error('CHIEF_DOCUMENT_SCOPE_REQUIRED');
      const doc=parseChiefDocument({...text,key:'stored-document',sourceHash:text.sha256});
      const sent=await this.request(line,'/message/sendMedia/'+encodeURIComponent(line.instance),{number:SANDRA,mediatype:'document',mimetype:doc.mimetype,fileName:doc.fileName,media:doc.mediaBase64,caption:doc.caption});
      if(!sent.key?.id)throw Error('SEND_WITHOUT_RECEIPT');return sent.key.id;
    }
    const result=await this.request(line,'/message/sendText/'+encodeURIComponent(line.instance),{number:row.phone,text,linkPreview:false});
    if(!result.key?.id)throw new Error('SEND_WITHOUT_RECEIPT');return result.key.id;
  }
  async priorHistory(phone) {
    const c=this.config;
    if(!/^57\d{10}$/.test(phone)||!Number.isFinite(c.activatedAt))throw new Error('HISTORY_SCOPE_REQUIRED');
    const checks=[],sources=new Map();
    for(const line of operationalLines(c)){
      await this.verifyLine(line.phone);
      for(const addressField of ['remoteJid','remoteJidAlt']){
      const data=await this.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{
        where:{key:{[addressField]:phone+'@s.whatsapp.net',fromMe:true},messageTimestamp:{gte:'2000-01-01T00:00:00.000Z',lte:new Date(c.activatedAt-1).toISOString()}},offset:1,page:1
      });
      const value=data?.messages;
      if(!value||!Number.isSafeInteger(value.total)||value.total<0||!Array.isArray(value.records)||
        (value.total===0&&value.records.length!==0)||(value.total>0&&value.records.length!==1))throw new Error('HISTORY_RESULT_UNVERIFIED');
      const r=value.records[0];
       const receiptOnly=r&&isolatedReadReceipt(c,line,r),missingReceiptTime=receiptOnly&&r.messageTimestamp==null;
       if(r&&(r.key?.[addressField]!==phone+'@s.whatsapp.net'||!/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(r.key.remoteJid||'')||r.key.fromMe!==true||!r.key.id||!missingReceiptTime&&(!Number.isFinite(Number(r.messageTimestamp))||Number(r.messageTimestamp)*1000>=c.activatedAt)))throw new Error('HISTORY_RESULT_OUTSIDE_SCOPE');
      if(c.company==='fumigacion'&&r)rememberHistorySource(sources,line,r);
       const protocolReview=c.company==='fumigacion'&&r&&(isolatedHistorySynchronization(r)||receiptOnly)?await verifiedProtocolHistory(this,line,addressField,phone,value,sources):{};
      checks.push({line:line.phone,instance:line.instance,addressField,total:value.total,lastSourceId:r?.key.id??null,lastAt:r?Number(r.messageTimestamp)*1000:null,...protocolReview});
      }
    }
    return {cutoff:c.activatedAt,checkedAt:Date.now(),guardVersion:operationalHistoryGuard(c),priorOutgoing:checks.some(x=>x.attentionOutgoing??(x.total>0)),checks,coverage:operationalCoverage(c),scope:assertOperationalLineScope(c)&&assertOperationalLineScope(c).version!==DUAL_LINE_SCOPE_VERSION?'authorized-own-blue-line-and-explicit-phone-alternatives; red-history-not-read; metadata-only; historical-author-unattributed':'own-two-lines-and-explicit-phone-alternatives; metadata-only; historical-author-unattributed',
      ...(c.company==='fumigacion'&&checks.some(x=>x.protocolGuard===MARIA_HISTORY_PROTOCOL_GUARD||x.readSupervisionGuard===READ_SUPERVISION_GUARD)?{classificationScope:checks.some(x=>x.readSupervisionGuard===READ_SUPERVISION_GUARD)?'explicit-native-synchronization-or-empty-acknowledgement-packets-and-outgoing-attention; no-complete-chat-history':'explicit-native-synchronization-packets-and-outgoing-attention; no-complete-chat-history'}:{})};
  }
  async currentAttention(phone,{store=null}={}) {
    const c=this.config;if(!/^57\d{10}$/.test(phone)||!Number.isFinite(c.activatedAt))throw new Error('ATTENTION_SCOPE_REQUIRED');
    const since=nativeTrialAttentionStartsAt(c,phone);
    const through=Date.now(),sources=new Map(),checks=[];
    for(const line of operationalLines(c)){
      await this.verifyLine(line.phone);
      for(const addressField of ['remoteJid','remoteJidAlt']){
        let expectedTotal=null,read=0;
        for(let page=1;page<=2;page++){
          const data=await this.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{[addressField]:phone+'@s.whatsapp.net',fromMe:true},messageTimestamp:{gte:new Date(since).toISOString(),lte:new Date(through).toISOString()}},offset:50,page});
          const result=data.messages;
          if(!result||!Number.isSafeInteger(result.total)||result.total<0||result.total>100||!Array.isArray(result.records)||result.records.length>50||(expectedTotal!==null&&expectedTotal!==result.total))throw new Error('ATTENTION_COVERAGE_UNVERIFIED');
          expectedTotal=result.total;read+=result.records.length;
          for(const r of result.records){
            const key=r.key,pn=phone+'@s.whatsapp.net',ownAddress=value=>value===pn||/^\d{5,30}@lid$/.test(value??'');
            if(key?.[addressField]!==pn||key.fromMe!==true||!key.id||!ownAddress(key.remoteJid)||key.remoteJidAlt!=null&&key.remoteJidAlt!==''&&!ownAddress(key.remoteJidAlt))throw new Error('ATTENTION_SOURCE_OUTSIDE_SCOPE');
            if(r.messageTimestamp==null&&isolatedReadReceipt(c,line,r))continue;
            const at=Number(r.messageTimestamp)*1000;
            if(!Number.isFinite(at)||at<since||at>through)throw new Error('ATTENTION_SOURCE_OUTSIDE_SCOPE');
            const message=r.message?.ephemeralMessage?.message??r.message??{};
            const text=message.conversation??message.extendedTextMessage?.text??'';
            const written=typeof text==='string'&&text.trim().length>0;
            const media=Boolean(message.audioMessage||message.imageMessage||message.videoMessage||message.documentMessage);
            // An authenticated outgoing edit with an unavailable body remains
            // attention evidence. Read/delivery updates alone are not authorship.
            const {edited,deleted}=outgoingMutation(r);
            if(written||media||edited||deleted)sources.set(line.phone+':'+key.id,{id:key.id,line:line.phone,at,kind:media?'media':written?'text':edited?'edited-body-unavailable':'deleted-body-unavailable',mutationHash:nativeAttentionMutationHash(r),...(edited?{edited:true}:{}),...(deleted?{deleted:true}:{})});
          }
          if(read===expectedTotal)break;
          if(!result.records.length||page===2||read>expectedTotal)throw new Error('ATTENTION_COVERAGE_UNVERIFIED');
        }
        checks.push({line:line.phone,addressField,total:expectedTotal,read});
      }
    }
    const lids=await knownNativeLidWindow(this,store,phone,since,through,{outgoing:true});for(const source of lids.sources){const old=sources.get(source.line+':'+source.id);if(old&&old.at!==source.at)throw Error('ATTENTION_SOURCE_CONFLICT');sources.set(source.line+':'+source.id,source);}checks.push(...lids.checks);
    return {sources:[...sources.values()],checks,through,complete:true,coverage:operationalCoverage(c),scope:nativeTrialPhoneBinding(c,phone)?'fresh-native-test-only; prior-history-preserved-not-certified':assertOperationalLineScope(c)?'authorized-own-blue-line-and-explicit-phone-alternatives; red-attention-not-read; written-or-media-outgoing':'own-two-lines-and-explicit-phone-alternatives; written-or-media-outgoing'};
  }
  async programContext(phone) {
    const c=this.config;
    if(!c.programContextUrl||!c.programToken||!c.expectedProgramCompanyId)return {verified:false,reason:'OWN_PROGRAM_NOT_CONNECTED'};
    const url=new URL(c.programContextUrl);if(url.protocol!=='https:'||url.username||url.password)throw new Error('PROGRAM_HTTPS_REQUIRED');
    url.searchParams.set('phone',phone);
    const r=await this.fetcher(url,{headers:{Authorization:'Bearer '+c.programToken},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error('PROGRAM_UNAVAILABLE'); const result=await r.json();
    if(result.system!==c.name||String(result.companyId)!==c.expectedProgramCompanyId||result.phone!==phone)throw new Error('PROGRAM_SCOPE_MISMATCH');
    return {...result,verified:true};
  }
  async currentCustomerActivity(phone,since,{store=null}={}){
    const c=this.config;
    if(c.company!=='fumigacion'||!/^57\d{10}$/.test(phone)||!Number.isFinite(since)||since<c.activatedAt)throw Error('INACTIVITY_SOURCE_SCOPE_REQUIRED');
    const through=Date.now(),sources=new Map(),checks=[];
    for(const line of operationalLines(c)){
      await this.verifyLine(line.phone);
      for(const addressField of ['remoteJid','remoteJidAlt']){
        let total=null,read=0;
        for(let page=1;page<=2;page++){
          const data=await this.request(line,'/chat/findMessages/'+encodeURIComponent(line.instance),{where:{key:{[addressField]:phone+'@s.whatsapp.net',fromMe:false},messageTimestamp:{gte:new Date(since).toISOString(),lte:new Date(through).toISOString()}},offset:50,page});
          const result=data.messages;
          if(!result||!Number.isSafeInteger(result.total)||result.total<0||result.total>100||!Array.isArray(result.records)||result.records.length>50||(total!==null&&total!==result.total))throw Error('INACTIVITY_NATIVE_COVERAGE_UNVERIFIED');
          total=result.total;read+=result.records.length;
          for(const record of result.records){
            const key=record.key,at=Number(record.messageTimestamp)*1000;
            if(key?.[addressField]!==phone+'@s.whatsapp.net'||key.fromMe!==false||!key.id||!/^57\d{10}@s\.whatsapp\.net$|^\d+@lid$/.test(key.remoteJid||'')||!Number.isFinite(at)||at<since||at>through)throw Error('INACTIVITY_NATIVE_SOURCE_UNVERIFIED');
            sources.set(line.phone+':'+key.id,{id:key.id,line:line.phone,at});
          }
          if(read===total)break;
          if(!result.records.length||read>total||page===2)throw Error('INACTIVITY_NATIVE_COVERAGE_UNVERIFIED');
        }
        checks.push({line:line.phone,addressField,total,read});
      }
    }
    const lids=await knownNativeLidWindow(this,store,phone,since,through);for(const source of lids.sources){const old=sources.get(source.line+':'+source.id);if(old&&old.at!==source.at)throw Error('INACTIVITY_NATIVE_SOURCE_CONFLICT');sources.set(source.line+':'+source.id,source);}checks.push(...lids.checks);
    return {complete:true,through,sources:[...sources.values()],checks,coverage:operationalCoverage(c),scope:assertOperationalLineScope(c)?'authorized-own-blue-line-and-explicit-phone-alternatives; red-customer-activity-not-read':'own-two-lines-and-explicit-phone-alternatives'};
  }
  async understand(event,context,knowledge,store) {
    const c=this.config;
    if(c.conversationalAi?.provider)return understandOwnCustomer(c,store,this.fetcher,event,context);
    if(!c.aiUrl||!c.aiToken||event.kind!=='text')return {};
    const url=new URL(c.aiUrl);if(url.protocol!=='https:'||url.username||url.password)throw new Error('AI_HTTPS_REQUIRED');
    const r=await this.fetcher(url,{method:'POST',headers:{Authorization:'Bearer '+c.aiToken,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(25000),body:JSON.stringify({company:c.name,task:'extract-literal-intake-slots-only',event:{id:event.id,text:event.text},context,knowledge})});
    if(!r.ok)throw new Error('AI_UNAVAILABLE'); const result=await r.json();
    if(result.eventId!==event.id||result.company!==c.name)throw new Error('AI_CONTEXT_MISMATCH');return result;
  }
  async composeReply(row,text,store){return composeOwnReply(this.config,store,this.fetcher,row,text);}
  async aiHealth(store){return probeOwnAi(this.config,store,this.fetcher);}
}

export async function drain(store,config,transport,engine) {
  if(!config.enabled&&!config.chiefOnly)return {enabled:false};
  initializeInactivityFollowup(config,store);
  const fastMaria=config.company==='fumigacion'&&config.responseTargetMs===3000;
  const before=fastMaria?await flushOutbox(store,config,transport):{accepted:0,suppressed:0,uncertain:0};
  const publicCut=publicResponseSqlCutoff(config);
  const eventFilter=publicLineSqlFilter(config,{lineColumn:'line',sourceAtColumn:'at',createdAtColumn:'received_at'});
  const pending=store.db.prepare("SELECT body,revision,line,at,received_at FROM events WHERE state='PENDING' AND (?=1 OR phone IN (?,?,?)) AND (?=0 OR phone=?) AND (?<0 OR (at>=? AND received_at>=?)) AND ("+eventFilter.sql+") ORDER BY from_me DESC,at,rowid LIMIT ?").all(Number(config.enabled),SANDRA,DIEGO,HILARY,Number(chiefReplyRestrictionActive(config)),SANDRA,publicCut,publicCut,publicCut,...eventFilter.params,fastMaria?1:30);
  for(const row of pending) {
    if(!publicEventAllowed(config,row))continue;
    const e=store.open(row.body); let analysis={};
    const lineScope=assertOperationalLineScope(config);
    if(lineScope&&!e.fromMe&&(!knownInternalRecipient(e.phone)||nativeTrialCustomerTurn(config,e))&&
      (e.at<operationalLineStartsAt(config,e.line)||
        !operationalLineAllowed(config,e.line)||
        typeof store.hasSourcesOutsideLine!=='function'||foreignLineSources(store,config,e.phone,e.line))){
      store.db.prepare("UPDATE events SET state='OPERATIONAL_SCOPE_REVIEW' WHERE id=? AND state='PENDING'").run(e.id);
      store.audit('OPERATIONAL_SCOPE_EVENT_BLOCKED',e.id,{line:e.line,coverage:operationalCoverage(config),replayed:false,migrated:false});continue;
    }
    if(!e.fromMe&&!operationalLineAllowed(config,e.line)){
      store.db.prepare("UPDATE events SET state='SUSPENDED_LINE_REVIEW' WHERE id=? AND state='PENDING'").run(e.id);
      store.audit('SUSPENDED_LINE_EVENT_BLOCKED',e.id,{line:e.line,coverage:operationalCoverage(config),replayed:false,migrated:false});continue;
    }
    const conversation=store.conversation(e.phone),superseded=!e.fromMe&&(!knownInternalRecipient(e.phone)||nativeTrialCustomerTurn(config,e))&&(e.at<conversation?.at||row.revision<conversation?.revision);
    if(superseded){await engine.process(e);continue;}
    if(config.historyCheckRequired&&!e.fromMe&&!nativeTrialCustomerTurn(config,e)&&!knownInternalRecipient(e.phone)){
      const checked=store.priorHistory(e.phone);
      if(checked?.cutoff!==config.activatedAt||((transport instanceof Transport||assertOperationalLineScope(config))&&checked.guardVersion!==operationalHistoryGuard(config))){
        try{store.savePriorHistory(e.phone,await transport.priorHistory(e.phone),e.id);}
        catch{store.audit('PRIOR_HISTORY_UNVERIFIED',e.id);store.db.prepare("UPDATE events SET state='HISTORY_REVIEW' WHERE id=? AND state='PENDING'").run(e.id);continue;}
      }
    }
    if(lineScope&&!e.fromMe&&(!knownInternalRecipient(e.phone)||nativeTrialCustomerTurn(config,e))&&
      (typeof store.hasSourcesOutsideLine!=='function'||foreignLineSources(store,config,e.phone,e.line))){
      store.db.prepare("UPDATE events SET state='OPERATIONAL_SCOPE_REVIEW' WHERE id=? AND state='PENDING'").run(e.id);
      store.audit('OPERATIONAL_SCOPE_CHANGED_BEFORE_MODEL',e.id,{line:e.line,coverage:operationalCoverage(config),replayed:false,migrated:false});continue;
    }
    if(!publicEventAllowed(config,row))continue;
    const newCase=config.company==='fumigacion'?explicitNewService(e.text):explicitNewTechnicalCase(e.text);
    const intakeStage=store.conversation(e.phone)?.state.programIntake?.stage;
    const ownQuotationAcceptance=config.company==='fumigacion'&&Boolean(conversation?.state.quotedPrice)&&acceptsOrdinaryQuotation(e.text);
    if(!e.fromMe&&(!knownInternalRecipient(e.phone)||nativeTrialCustomerTurn(config,e))&&!store.conversation(e.phone)?.hold&&(!store.conversation(e.phone)?.state.awaitingHumanReview||newCase)&&!ownQuotationAcceptance&&!literalGreetingEligible(config,e,conversation?.state)&&!(config.company==='servicio-tecnico'&&technicalIntakeMetaQuestion(e.text))&&!['name','address','details','confirm','correction','pending'].includes(intakeStage)){
      // Customer history remains in its company. Observations are explicitly untrusted reference, never policy.
      const knowledge=store.db.prepare('SELECT body FROM knowledge ORDER BY imported DESC LIMIT 10').all().map(k=>store.open(k.body));
      const caseId=newCase?'':store.conversation(e.phone)?.state.caseId||'';
      const caseAnswers=store.db.prepare("SELECT body,answer,source_id,answer_at,valid_until FROM questions WHERE phone=? AND case_id=? AND state='ANSWERED' AND valid_until>?").all(e.phone,caseId,Date.now()).map(q=>({question:store.open(q.body).text,answer:store.open(q.answer),source:q.source_id,at:q.answer_at,validUntil:q.valid_until,scope:'same-company-and-case-only; recheck before scheduling'})).concat(tesaCaseAnswers(store,config,{caseId,customerPhone:e.phone}));
      const conversationHistory=store.conversationContext(e.phone,e.at,20,e.id);
      store.audit('CONVERSATION_CONTEXT_CHECKED',e.id,{caseId:conversationHistory.caseId,turns:conversationHistory.turns.length,storedCoverageComplete:conversationHistory.completeStoredHistory,fullWhatsAppHistoryRead:false,originalMediaRead:false});
      // A completed registration can receive a new post-service concern after
      // an express human return. It still needs semantic understanding, but
      // names, addresses and registration payloads are not model context.
      const semanticState=intakeStage==='registered'?{slots:conversation?.state.slots,asked:conversation?.state.asked,requestedAfterServiceReview:conversation?.state.requestedAfterServiceReview,lastText:null}:conversation?.state;
      try{analysis=await transport.understand(e,{...(newCase?{slots:{},asked:[]}:semanticState),requestedNewCase:newCase,caseAnswers,...(intakeStage==='registered'?{}:{conversationHistory})},knowledge,store);}catch{store.audit('AI_UNAVAILABLE',e.id);}
    }
    if(!publicEventAllowed(config,row))continue;
    await engine.process(e,analysis);
  }
  const after=await flushOutbox(store,config,transport);
  // Deliver active client replies before the chief's potentially slower reads.
  // The durable consumer runs outside the Engine transaction and uses the
  // existing authenticated outbox for its checked results.
  const chiefActions=await drainChiefActions(store,config,transport);
  const chiefResults=chiefActions.processed?await flushOutbox(store,config,transport):{accepted:0,suppressed:0,uncertain:0};
  // Active reception takes precedence over inactivity scans. A fresh reply is
  // delivered before any optional native-history read for another open case.
  const followup=pending.length?{enabled:Boolean(config.inactivityFollowupEnabled),queued:0,deferredForActiveReception:true}:await queueInactivityFollowups(store,config,transport);
  const followed=followup.queued?await flushOutbox(store,config,transport):{accepted:0,suppressed:0,uncertain:0};
  const groupOperations=await drainTesaGroup(store,config,transport);
  const guidanceLists=config.company==='fumigacion'?(pending.length?{deferredForActiveReception:true}:await drainTesaGuidanceLists(store,config,transport)):null;
  return {processed:pending.length,accepted:before.accepted+after.accepted+followed.accepted+chiefResults.accepted,suppressed:before.suppressed+after.suppressed+followed.suppressed+chiefResults.suppressed,uncertain:before.uncertain+after.uncertain+followed.uncertain+chiefResults.uncertain,followup,groupOperations,chiefActions,...(guidanceLists?{guidanceLists}:{})};
}

export async function flushOutbox(store,config,transport){
  await drainProgramRegistrations(store,config,transport,routeCaseQuestion);
  await drainOwnScheduling(store,config,transport,{verifyProof:entry=>schedulingProofForBackend(store,config,transport,{company:'fumigacion',schedulingKey:entry.schedulingKey})});
  let accepted=0,suppressed=0,uncertain=0;
  const checkOwnSavedReview=(outbox,text)=>{
    if(!outbox.id.startsWith('chief-report:maria-saved-'))return true;
    try{if(savedServiceReviewStillValid(store,config,outbox,text)===true)return true;}catch{}
    if(store.db.prepare("UPDATE outbox SET state='OWN_SAVED_REVIEW_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),outbox.id).changes){
      store.audit('OWN_SAVED_SERVICE_REVIEW_BEFORE_SEND_BLOCKED',outbox.id,{attemptedSend:false,contextOrBodyChanged:true,humanAttentionPreserved:true,resent:false});suppressed++;
    }
    return false;
  };
  const checkTesaContinuation=async outbox=>{
    if(!outbox.id.startsWith('tesa-continuation:')&&!outbox.id.startsWith('tesa-unregistered:')&&!outbox.id.startsWith('maria-schedule-')&&!outbox.id.startsWith('chief-report:maria-scheduling:'))return true;
    try{
      const valid=outbox.id.startsWith('tesa-unregistered:')?await unregisteredTesaReplyValid(store,config,transport,outbox):(outbox.id.startsWith('maria-schedule-')||outbox.id.startsWith('chief-report:maria-scheduling:'))?await schedulingReplyValid(store,config,transport,outbox):await tesaCustomerReplyStillValid(store,config,transport,outbox);
      if(valid===true)return true;
      // A pending verified courtesy waits for ordinary Engine processing. It
      // neither changes the case nor proves a reason for permanent review.
      if(valid===null)return false;
    }catch{}
    store.db.prepare("UPDATE outbox SET state='TESA_ANSWER_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),outbox.id);
    store.audit('TESA_CONTINUATION_BEFORE_SEND_REVIEW',outbox.id,{attemptedSend:false,humanAttentionPreserved:true});suppressed++;return false;
  };
  const publicCut=publicResponseSqlCutoff(config);
  const queueFilter=publicLineSqlFilter(config,{lineColumn:'outbox.line',sourceAtColumn:'outbox.created',createdAtColumn:'outbox.created'});
  const sourceFilter=publicLineSqlFilter(config,{lineColumn:'e.line',sourceAtColumn:'e.at',createdAtColumn:'e.received_at'});
  const exactSource=sourceFilter.sql==='1'?'1':"(internal=1 OR EXISTS(SELECT 1 FROM events e WHERE e.phone=outbox.phone AND e.line=outbox.line AND e.from_me=0 AND ((outbox.id LIKE '%:reply' AND e.id=substr(outbox.id,1,length(outbox.id)-6)) OR (outbox.id NOT LIKE '%:reply' AND e.revision=outbox.revision)) AND e.at<=outbox.created AND ("+sourceFilter.sql+")))";
  const out=store.db.prepare("SELECT * FROM outbox WHERE state='READY' AND (?=1 OR (internal=1 AND phone IN (?,?,?))) AND (?=0 OR phone=?) AND (?<0 OR (created>=? AND (internal=1 OR EXISTS(SELECT 1 FROM events e WHERE e.phone=outbox.phone AND e.line=outbox.line AND e.from_me=0 AND e.revision=outbox.revision AND e.at>=? AND e.received_at>=? AND e.at<=outbox.created)))) AND ("+queueFilter.sql+") AND ("+exactSource+") ORDER BY created,rowid LIMIT 20").all(Number(config.enabled),SANDRA,DIEGO,HILARY,Number(chiefReplyRestrictionActive(config)),SANDRA,publicCut,publicCut,publicCut,publicCut,...queueFilter.params,...(sourceFilter.sql==='1'?[]:sourceFilter.params));
  for(const o of out) {
    // Keep blocked rows exactly as recorded; this restriction is not a send
    // failure, a recipient migration, a hold or permission to replay later.
    if(!outboundRecipientAllowed(config,o.phone))continue;
    if(!publicOutboxAllowed(store,config,o))continue;
    const lineScope=assertOperationalLineScope(config);
    if(lineScope&&(o.created<operationalLineStartsAt(config,o.line)||
      (!o.internal&&(typeof store.hasSourcesOutsideLine!=='function'||foreignLineSources(store,config,o.phone,o.line))))){
      if(store.db.prepare("UPDATE outbox SET state='OPERATIONAL_SCOPE_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes){
        store.audit('OPERATIONAL_SCOPE_OUTBOX_BLOCKED',o.id,{line:o.line,coverage:operationalCoverage(config),attemptedSend:false,migrated:false});suppressed++;
      }
      continue;
    }
    if(!operationalLineAllowed(config,o.line)){
      if(store.db.prepare("UPDATE outbox SET state='SUSPENDED_LINE_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes){
        store.audit('SUSPENDED_LINE_OUTBOX_BLOCKED',o.id,{line:o.line,coverage:operationalCoverage(config),attemptedSend:false,migrated:false});suppressed++;
      }
      continue;
    }
    if(o.internal&&o.phone===DIEGO&&config.operatorRouting===CURRENT_OPERATOR_ROUTING){
      // The current direct instruction retires Diego as an outgoing recipient.
      // Preserve the original question, recipient and encrypted body; never
      // redirect a historical pending question or touch prior send outcomes.
      if(store.db.prepare("UPDATE outbox SET state='RECIPIENT_RETIRED_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes){
        store.audit('INTERNAL_RECIPIENT_RETIRED_BEFORE_SEND',o.id,{company:config.name,recipient:DIEGO,operatorRouting:CURRENT_OPERATOR_ROUTING,caseId:o.case_id,attemptedSend:false,redirected:false});suppressed++;
      }
      continue;
    }
    if(config.company==='fumigacion')recordResponseTiming(store,o);
    if(!config.enabled&&!(config.chiefOnly&&o.internal&&internalRecipients(config).includes(o.phone)))continue;
    if(o.created<Date.now()-600000){store.db.prepare("UPDATE outbox SET state='EXPIRED_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);suppressed++;continue;}
    // Reject before any delivery attempt; this is a review, never an uncertain send.
    let text=store.open(o.body);
    if(!checkOwnSavedReview(o,text))continue;
    if(!o.internal&&!publicTextSafe(text)){
      store.db.prepare("UPDATE outbox SET state='COMMUNICATION_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);
      store.hold(o.phone,'communication-review');store.audit('EXTERNAL_TEXT_REJECTED',o.id);suppressed++;continue;
    }
    // The original currentAttention implementation verifies every own line,
    // including this outgoing line, before reading both address forms. Reuse
    // that mandatory check instead of checking the same owner twice. Other
    // transports, internal replies and routes without native attention retain
    // their separate channel check.
    const ownerCheckedByNativeAttention=!o.internal&&config.historyCheckRequired&&transport instanceof Transport&&transport.config===config&&transport.currentAttention===Transport.prototype.currentAttention&&transport.verifyLine===Transport.prototype.verifyLine&&transport.verifyLineBinding===Transport.prototype.verifyLineBinding&&transport.request===Transport.prototype.request&&operationalLineAllowed(config,o.line);
    if(!ownerCheckedByNativeAttention){try{await transport.verifyLine(o.line);}catch{store.audit('CHANNEL_CHECK_FAILED',o.id);continue;}}
    if(!await checkTesaContinuation(o))continue;
    // The latency target controls worker scheduling; it must not silently turn
    // off Maria's contextual reply planner. Provider failures retain her useful
    // deterministic next step, and every await still rechecks human attention.
    if(!o.internal&&!o.id.startsWith('tesa-unregistered:')&&!o.id.startsWith('maria-schedule-')&&!literalGreetingReplyStillValid(config,store,o,text)&&(config.company==='fumigacion'||config.responseTargetMs!==3000)&&config.conversationalAi?.ready&&typeof transport.composeReply==='function'&&store.approvedReplyStillValid(o)&&store.priceReplyStillValid(o)){
      try{
        const composed=await transport.composeReply(o,text,store);
        if(!ownReplyTextAllowed(config,store,o,text,composed))throw Error('AI_REPLY_NOT_APPROVED');
        if(composed!==text)store.tx(()=>{
          const current=store.conversation(o.phone);
          if(current?.hold||current?.revision!==o.revision)return;
          const body=store.seal(composed);
          if(!store.db.prepare("UPDATE outbox SET body=? WHERE id=? AND state='READY'").run(body,o.id).changes)return;
          const ref=store.priceReplyReference(o);
          if(ref)store.savePriceReplyReference(o.id,{...ref,finalText:composed});
          store.audit('AI_APPROVED_WORDING_SELECTED',o.id,{originalText:text,finalText:composed,caseId:o.case_id,priceCop:ref?.priceCop||null,claimsGenerated:false,contextualPlan:config.company==='fumigacion'});
          o.body=body;text=composed;
        });
      }catch{store.audit('AI_WORDING_FALLBACK',o.id,{deterministicReplyRetained:true});}
    }
    // Native attention, staff ingestion, current prices and answer references
    // are checked after every model await and before the delivery reservation.
    if(!o.internal&&config.historyCheckRequired&&typeof transport.currentAttention==='function'){
      try{
        const attention=await transport.currentAttention(o.phone,{store});
        if(!attention.complete)throw new Error('ATTENTION_COVERAGE_UNVERIFIED');
        const release=priorAttentionRelease(store,config,o,attention),releasedSources=[];
        const unknown=attention.sources.find(source=>{
          if(store.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=?').get(source.id,o.phone,source.line))return false;
          if(nativeSourceBeforeRelease(source,o,release,config,attention.through)){releasedSources.push(source);return false;}
          return true;
        });
        if(releasedSources.length)store.audit('NATIVE_PRE_RELEASE_ATTENTION_PRESERVED',o.id,{phone:o.phone,line:o.line,releaseSource:release.source,releasedAt:release.at,sources:releasedSources,authorUnverified:true,explicitReturnAlreadyStored:true,holdReleased:false,firstBotEvidencePreserved:true});
        if(unknown){
          store.hold(o.phone,unknown.id,true);
          store.audit('NATIVE_PRIOR_ATTENTION_BLOCKED_REPLY',unknown.id,{phone:o.phone,line:unknown.line,at:unknown.at,outboxId:o.id,authorUnverified:true,firstBotEvidencePreserved:true});suppressed++;continue;
        }
        store.audit('NATIVE_ATTENTION_CHECKED',o.id,{through:attention.through,checks:attention.checks,knownOutgoing:attention.sources.length-releasedSources.length,releasedHistoricalOutgoing:releasedSources.length,coverage:attention.coverage??operationalCoverage(config)});
      }catch(error){
        store.db.prepare("UPDATE outbox SET state='ATTENTION_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);
        const reasonCode=/^[A-Z][A-Z0-9_]{0,99}$/.test(error?.message??'')?error.message:'ATTENTION_CHECK_FAILED';
        // Failed verification blocks this output, without claiming a person took
        // over. Only a new source may prepare another reply and revalidate it;
        // old review rows and any existing human hold remain unchanged.
        if(config.company!=='fumigacion')store.hold(o.phone,'attention-review:'+o.id,true);
        store.audit('NATIVE_ATTENTION_UNVERIFIED',o.id,{attemptedSend:false,reasonCode,...(config.company==='fumigacion'?{guard:MARIA_ATTENTION_FAILURE_GUARD,humanHoldChanged:false,reviewedOutboxRetried:false}:{})});suppressed++;continue;
      }
    }
    const staffPending=store.db.prepare("SELECT id FROM events WHERE phone=? AND from_me=1 AND state='PENDING'").get(o.phone);
    if(staffPending)continue;
    if(!o.internal&&o.id.startsWith('inactivity:')){
      try{if(!await inactivityDeliveryValid(store,config,transport,o))throw Error('INACTIVITY_STATE_CHANGED');}
      catch{store.db.prepare("UPDATE outbox SET state='INACTIVITY_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);store.audit('INACTIVITY_BEFORE_SEND_REVIEW',o.id,{attemptedSend:false});suppressed++;continue;}
    }
    const conv=store.conversation(o.phone);
    if(!o.internal&&(conv?.hold||conv?.revision!==o.revision)){
      store.db.prepare("UPDATE outbox SET state='SUPPRESSED_HUMAN',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);suppressed++;continue;
    }
    if(!o.internal&&!officeReceptionReplyStillValid(store,o)){
      store.db.prepare("UPDATE outbox SET state='OFFICE_RECEPTION_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);
      store.audit('OFFICE_RECEPTION_RECHECK_FAILED',o.id,{attemptedSend:false});suppressed++;continue;
    }
    if(!o.internal&&!store.approvedReplyStillValid(o)){
      store.db.prepare("UPDATE outbox SET state='APPROVED_ANSWER_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);
      store.audit('APPROVED_ANSWER_RECHECK_FAILED',o.id,{attemptedSend:false});suppressed++;continue;
    }
    if(!o.internal&&store.priceReplyReference(o)){
      try{
        if(!store.priceReplyStillValid(o))throw Error('PRICE_REVIEW');
        const ref=store.priceReplyReference(o),version=store.priceReplyVersion(o),entry=selectPrice(ref.context,store.approvedPriceCatalogs(),ref.entryId,version??{}).entry;
        await verifyPriceSource(entry,transport,version??{});
        // Source verification awaits the provider. Staff may intervene during
        // that read; recheck the persisted hold and revision afterwards.
        const latest=store.conversation(o.phone);
        if(latest.hold||latest.revision!==o.revision)continue;
      }catch{
        store.db.prepare("UPDATE outbox SET state='PRICE_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id);store.audit('PRICE_SOURCE_RECHECK_FAILED',o.id,{attemptedSend:false});suppressed++;continue;
      }
    }
    if(!publicOutboxAllowed(store,config,o))continue;
    if(lineScope&&(o.created<operationalLineStartsAt(config,o.line)||!operationalLineAllowed(config,o.line)||
      (!o.internal&&(typeof store.hasSourcesOutsideLine!=='function'||foreignLineSources(store,config,o.phone,o.line))))){
      if(store.db.prepare("UPDATE outbox SET state='OPERATIONAL_SCOPE_REVIEW',updated=? WHERE id=? AND state='READY'").run(Date.now(),o.id).changes){
        store.audit('OPERATIONAL_SCOPE_CHANGED_BEFORE_SEND',o.id,{line:o.line,coverage:operationalCoverage(config),attemptedSend:false,migrated:false});suppressed++;
      }
      continue;
    }
    // The quoted human answer may change during a channel/model/price await.
    // Recheck its exact native proof and customer attention before reserving.
    if(!await checkTesaContinuation(o))continue;
    if(!checkOwnSavedReview(o,text))continue;
    if(!outboundRecipientAllowed(config,o.phone))continue;
    if(!publicOutboxAllowed(store,config,o))continue;
    const latest=store.conversation(o.phone);
    if(!o.internal&&(latest?.hold||latest?.revision!==o.revision))continue;
    const sendStartedAt=Date.now();
    if(!store.db.prepare("UPDATE outbox SET state='SENDING',updated=? WHERE id=? AND state='READY'").run(sendStartedAt,o.id).changes)continue;
    let acceptedMid=null;
    try {
      const mid=await transport.send(o,text);
      store.tx(()=>{
        const sentAt=Date.now();
        store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED',updated=? WHERE id=?").run(mid,sentAt,o.id);
        store.recordFirstBotReply(o,mid,config.bot,sentAt);
        if(config.company==='fumigacion')recordResponseTiming(store,o,sentAt);
      });accepted++;acceptedMid=mid;
    } catch {store.db.prepare("UPDATE outbox SET state='UNCERTAIN',updated=? WHERE id=?").run(Date.now(),o.id);uncertain++;}
    // Bookkeeping after a successful commit must never turn that accepted
    // send into UNCERTAIN or authorize a retry. No startup sweep adopts ACKs.
    if(config.company==='fumigacion'&&acceptedMid){
      try{for(const receipt of store.reconcileEarlyDelivery(o.id,acceptedMid,o.line,sendStartedAt))recordDeliveryTiming(store,acceptedMid,o.line,receipt.state,receipt.observedAt);}
      catch{store.audit('EARLY_DELIVERY_RECONCILIATION_REVIEW',o.id,{line:o.line,acceptedSendPreserved:true,retried:false});}
    }
  }
  return {accepted,suppressed,uncertain};
}
