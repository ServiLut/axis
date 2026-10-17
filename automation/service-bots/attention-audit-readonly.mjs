import {createHash} from 'node:crypto';
import {BUSINESSES,knownInternalRecipient} from './config.mjs';
import {FUMIGACION_BLUE} from './line-scope.mjs';

export const CONTACT_ATTENTION_READONLY_GUARD='own-blue-source-bound-local-attention-readonly-v1';
const SOURCE=/^[A-Za-z0-9_-]{8,100}$/;
const PHONE=/^57\d{10}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,expected)=>object(value)&&Object.keys(value).sort().join(',')===expected;
const unknown=found=>({found,hold:null,revision:null,currentLine:null,caseId:null,lastSourceId:null,at:null});
const sourceKey=sourceId=>createHash('sha256').update(JSON.stringify(['fumigacion',FUMIGACION_BLUE,'cucaracha-azul',sourceId])).digest('hex');

function deliveryMetadataOnly(original,value,originalRow){
  if(!original||!['DELIVERY_ACK','READ',3,4,'3','4'].includes(value.status)||value.originalRow!==originalRow||
    value.phone!==original.phone||value.identity!=='PN'||value.fromMe!==false||
    value.providerAt!==null&&value.providerAt!==original.providerAt||value.media!==null||
    !['PENDING','VERIFIED'].includes(value.bindingState))return false;
  const absentContent=value.kind==='unknown'&&value.literalText===null;
  const unchangedText=value.kind==='text'&&value.literalText===original.literalText;
  if(!absentContent&&!unchangedText)return false;
  const native=value.nativeKey;
  if(!object(native)||native.id!==original.sourceId||native.fromMe!==null&&native.fromMe!==false)return false;
  const originalAddresses=[original.nativeKey?.remoteJid,original.nativeKey?.remoteJidAlt].filter(address=>typeof address==='string'&&address);
  return [native.remoteJid,native.remoteJidAlt].every(address=>address===null||originalAddresses.includes(address));
}

function validateScope(store,config,body){
  if(config?.company!=='fumigacion'||store?.company!=='fumigacion'||!Array.isArray(config.lines)||
    !config.lines.some(line=>line.phone===FUMIGACION_BLUE&&line.instance==='cucaracha-azul')||
    config.lines.some(line=>!BUSINESSES.fumigacion.phones.includes(line.phone)))throw Error('CONTACT_ATTENTION_OWN_FUMIGACION_REQUIRED');
  if(!keys(body,'company,contacts,line')||body.company!=='fumigacion'||body.line!==FUMIGACION_BLUE||
    !Array.isArray(body.contacts)||body.contacts.length<1||body.contacts.length>4||
    body.contacts.some(contact=>!keys(contact,'phone,sourceId')||typeof contact.phone!=='string'||!PHONE.test(contact.phone)||knownInternalRecipient(contact.phone)||typeof contact.sourceId!=='string'||!SOURCE.test(contact.sourceId))||
    new Set(body.contacts.map(contact=>contact.phone)).size!==body.contacts.length||
    new Set(body.contacts.map(contact=>contact.sourceId)).size!==body.contacts.length)throw Error('CONTACT_ATTENTION_CLOSED_SOURCE_SCOPE_REQUIRED');
}

// Read a previously authenticated native receipt and its binding proof. An
// admin-injected event alone cannot certify the source's phone identity.
// Missing identity, edits, deletion or an unavailable journal remain unknown.
function storedNativeSourceMatches(store,event){
  if(!store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='intake_journal'").get())return false;
  const rows=store.db.prepare('SELECT row_id,original,operation,line,instance,body FROM intake_journal WHERE source_key=? ORDER BY row_id LIMIT 101').all(sourceKey(event.id));
  if(!rows.length||rows.length>100)return false;
  let original=null,originalRow=null,bound=false;
  for(const row of rows){
    const value=store.open(row.body);
    if(row.line!==FUMIGACION_BLUE||row.instance!=='cucaracha-azul'||value.company!=='fumigacion'||value.sourceId!==event.id||value.line!==row.line||value.instance!==row.instance||value.operation!==row.operation)return false;
    if(row.original===1){
      if(original||row.operation!=='upsert')return false;
      original=value;originalRow=row.row_id;bound=value.bindingState==='VERIFIED';
    }else if(row.operation==='binding-verified')bound=value.bindingState==='VERIFIED';
    else if(row.operation==='update'&&deliveryMetadataOnly(original,value,originalRow))continue;
    else return false;
  }
  if(!original||!bound||original.identity!=='PN'||original.phone!==event.phone||original.fromMe!==false||original.kind!=='text'||original.literalText!==event.text||original.providerAt!==event.at)return false;
  const native=original.nativeKey,addresses=[native?.remoteJid,native?.remoteJidAlt].filter(address=>address!=null&&address!=='');
  if(native?.id!==event.id||native.fromMe!==false||!addresses.length||!addresses.includes(event.phone+'@s.whatsapp.net'))return false;
  return addresses.every(address=>address===event.phone+'@s.whatsapp.net'||/^\d{5,30}@lid$/.test(address));
}

function contactObservation(store,{phone,sourceId}){
  const conversation=store.db.prepare('SELECT phone,hold,revision,at,line,body FROM conversations WHERE phone=?').get(phone);
  const result=unknown(Boolean(conversation));
  if(!conversation||conversation.line!==FUMIGACION_BLUE||![0,1].includes(conversation.hold)||!Number.isSafeInteger(conversation.revision)||conversation.revision<0)return result;
  try{
    const row=store.db.prepare('SELECT id,phone,line,from_me,at,body FROM events WHERE id=?').get(sourceId);
    if(!row||row.id!==sourceId||row.phone!==phone||row.line!==FUMIGACION_BLUE||row.from_me!==0)return result;
    const event=store.open(row.body);
    if(event.id!==row.id||event.phone!==row.phone||event.line!==row.line||event.fromMe!==false||event.kind!=='text'||typeof event.text!=='string'||!event.text.trim()||event.text.length>6000||event.at!==row.at||!Number.isSafeInteger(event.at)||event.at<0||!storedNativeSourceMatches(store,event))return result;
    const latest=store.db.prepare('SELECT id,phone,line,from_me,at,body FROM events WHERE phone=? ORDER BY at DESC,rowid DESC LIMIT 1').get(phone);
    if(!latest||latest.line!==FUMIGACION_BLUE||!SOURCE.test(latest.id)||![0,1].includes(latest.from_me)||!Number.isSafeInteger(latest.at)||latest.at<event.at)return result;
    const last=store.open(latest.body),state=store.open(conversation.body);
    if(last.id!==latest.id||last.phone!==phone||last.line!==latest.line||last.at!==latest.at||last.fromMe!==Boolean(latest.from_me)||!object(state))return result;
    const caseId=typeof state.caseId==='string'&&SOURCE.test(state.caseId)?state.caseId:null;
    return {found:true,hold:conversation.hold===1,revision:conversation.revision,currentLine:conversation.line,caseId,lastSourceId:latest.id,at:latest.at};
  }catch{return result;}
}

export function reviewContactAttention(store,config,body){
  validateScope(store,config,body);
  // The order matches the closed input list. Do not echo phone numbers or
  // decrypt conversation content into this response. A false local hold is
  // only an observation; it never certifies FREE or eligibility to contact.
  return {guard:CONTACT_ATTENTION_READONLY_GUARD,readOnly:true,coverageComplete:false,results:body.contacts.map(contact=>contactObservation(store,contact))};
}
