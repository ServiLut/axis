import {createHash} from 'node:crypto';
import {operationalLineAllowed} from './line-scope.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT} from './tesa-config.mjs';
import {mariaTestOrderAccessStatus} from './maria-test-order-access.mjs';

export const CHIEF_TESA_TEST_GUARD='own-explicit-chief-single-paused-tesa-test-no-reservation-v1';
export const CHIEF_TESA_TEST_DELIVERY_GUARD='own-exact-native-single-tesa-test-delivery-v1';
export const CHIEF_TESA_TEST_CYCLE='20261016-TESA-PRUEBA-v1';
export const CHIEF_TESA_TEST_LINE='573126944997';
export const CHIEF_TESA_TEST_CHIEF='573016803926';
export const CHIEF_TESA_TEST_TEXT=[
  '*PRUEBA — NO RESERVAR*','',
  'Equipo, necesitamos comprobar que María Ángel reciba una respuesta clara.','',
  'Caso simulado:',
  '• Servicio: fumigación de prueba en un apartamento.',
  '• Municipio: Itagüí.',
  '• Fecha consultada: sábado 17/oct/2026.',
  '• Preferencia: en la mañana.','',
  '¿Qué técnico y qué franja tendrían disponibilidad para este caso simulado?','',
  'Ejemplo de respuesta: «Técnico: [nombre]. Fecha: 17/oct/2026. Franja: de 9:00 a 10:00 a. m.»','',
  'Por favor, respondan citando este mensaje. No reserven agenda ni envíen personal; es sólo una prueba.',
].join('\n');
const KEY='chief-tesa-test:'+CHIEF_TESA_TEST_CYCLE,BLUE=CHIEF_TESA_TEST_LINE,SANDRA=CHIEF_TESA_TEST_CHIEF;
const MAX_EXPIRY=Date.parse('2026-10-17T13:00:00.000Z'),ID=/^[A-Za-z0-9_-]{8,100}$/;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const chiefTesaTestHash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(canonical(value))).digest('hex');
const hash=chiefTesaTestHash,copy=value=>JSON.parse(JSON.stringify(value));

export function parseChiefTesaTestCommand(text){
  if(typeof text!=='string'||text.length>200)return null;
  if(/^María Ángel, envía la pregunta PRUEBA a TESA\.?$/iu.test(text??''))return {action:'send'};
  if(/^María Ángel, consulta la pregunta PRUEBA de TESA\.?$/iu.test(text??''))return {action:'lookup'};
  return null;
}
function permission(c,now=Date.now()){
  const p=c?.chiefTesaTest,t=c?.tesaOperations,grant=c?.mariaTestOrder;
  // Membership may have expired in memory. The dedicated transport refreshes
  // the already configured own group before and after every native operation.
  if(c?.company!=='fumigacion'||c.enabled!==false||c.chiefOnly!==true||c.replyOnlyToChief!==true||p?.enabled!==true||p.cycleId!==CHIEF_TESA_TEST_CYCLE||!Number.isSafeInteger(p.startsAt)||!Number.isSafeInteger(p.expiresAt)||p.startsAt<c.activatedAt||p.startsAt>now||p.expiresAt<=now||p.expiresAt<=p.startsAt||p.expiresAt>MAX_EXPIRY||grant?.enabled!==true||p.startsAt!==grant.startsAt||p.expiresAt!==grant.expiresAt||mariaTestOrderAccessStatus(c).enabled!==true||!Array.isArray(c.lines)||!c.lines.some(line=>line.phone===BLUE)||!operationalLineAllowed(c,BLUE)||t?.enabled!==true||t.senderLine!==BLUE||t.groupJid!==TESA_GROUP_JID||t.groupSubject!==TESA_GROUP_SUBJECT)throw Error('CHIEF_TESA_TEST_EXPLICIT_LIMITED_ACCESS_REQUIRED');
  return p;
}
function sourceStored(s,source){
  const row=source&&s.db.prepare('SELECT body FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(source.id,SANDRA,BLUE);
  return row&&hash(s.open(row.body))===hash(source);
}
function authority(s,c,source,native,action){
  const p=permission(c),now=Date.now();
  if(s.company!=='fumigacion'||source?.phone!==SANDRA||source.line!==BLUE||source.kind!=='text'||source.fromMe!==false||source.forwarded!==false||source.quotedId||!ID.test(source.id??'')||!Number.isSafeInteger(source.at)||source.at<p.startsAt||source.at>now+1000||source.at<now-120000||parseChiefTesaTestCommand(source.text)?.action!==action||!sourceStored(s,source)||native?.verified!==true||native.sourceId!==source.id||native.phone!==SANDRA||native.line!==BLUE||native.at!==source.at)throw Error('CHIEF_TESA_TEST_NATIVE_DIRECT_COMMAND_REQUIRED');
  return {source:copy(source),sourceHash:hash(source),nativeAttestationHash:hash({source,native}),verifiedAt:now};
}
function validEntry(s,c,e){
  const p=permission(c);
  if(s.company!=='fumigacion'||e?.guard!==CHIEF_TESA_TEST_GUARD||e.cycleId!==CHIEF_TESA_TEST_CYCLE||e.line!==BLUE||e.groupJid!==TESA_GROUP_JID||e.groupSubject!==TESA_GROUP_SUBJECT||e.text!==CHIEF_TESA_TEST_TEXT||e.textHash!==hash(CHIEF_TESA_TEST_TEXT)||e.sourceHash!==hash(e.source)||!/^[a-f0-9]{64}$/.test(e.nativeAttestationHash??'')||e.source?.phone!==SANDRA||e.source.line!==BLUE||e.source.fromMe!==false||e.source.forwarded!==false||e.source.quotedId||e.source.kind!=='text'||parseChiefTesaTestCommand(e.source.text)?.action!=='send'||!sourceStored(s,e.source)||!Number.isSafeInteger(e.source.at)||e.source.at<p.startsAt||!Number.isSafeInteger(e.createdAt)||e.createdAt<e.source.at-1000||!Number.isSafeInteger(e.updatedAt)||!['PREPARED','SENDING','ACCEPTED','UNCERTAIN','DELIVERED','READ'].includes(e.status)||![0,1].includes(e.sendAttempts)||e.sendAttempts===0&&e.status!=='PREPARED'||e.sendAttempts===1&&!Number.isSafeInteger(e.sendStartedAt)||e.mid!==null&&!ID.test(e.mid??''))throw Error('CHIEF_TESA_TEST_LEDGER_INTEGRITY_REQUIRED');
  return e;
}
function read(s,c){const row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(KEY);return row?{raw:row.value,entry:validEntry(s,c,s.open(row.value))}:null;}
function cas(s,c,before,update){return s.tx(()=>{const current=read(s,c);if(!current||hash(current.entry)!==hash(before))return null;const next=validEntry(s,c,{...current.entry,...update,updatedAt:Date.now()}),changed=s.db.prepare('UPDATE meta SET value=? WHERE key=? AND value=?').run(s.seal(next),KEY,current.raw);return changed.changes?next:null;});}
function view(e,extra={}){return {guard:CHIEF_TESA_TEST_GUARD,cycleId:CHIEF_TESA_TEST_CYCLE,status:e?.status??'NOT_PREPARED',mid:e?.mid??null,sendAttempts:e?.sendAttempts??0,deliveryVerified:['DELIVERED','READ'].includes(e?.status),resendAllowed:false,ordinaryMessagesEnabled:false,businessWrites:0,reservationCreated:false,...extra};}
export function chiefTesaTestStatus(s,c){try{permission(c);return {...view(read(s,c)?.entry),enabled:true};}catch{return {...view(null),enabled:false};}}
export function chiefTesaTestSendEntry(s,c,cycleId,{lookup=false}={}){
  if(cycleId!==CHIEF_TESA_TEST_CYCLE)throw Error('CHIEF_TESA_TEST_SINGLE_CYCLE_REQUIRED');
  const e=read(s,c)?.entry;
  if(!e||e.sendAttempts!==1||!lookup&&e.status!=='SENDING')throw Error('CHIEF_TESA_TEST_RESERVED_SOURCE_REQUIRED');
  return copy(e);
}
function prepare(s,c,checked){
  const existing=read(s,c);if(existing)return existing.entry;
  return s.tx(()=>{const prior=read(s,c);if(prior)return prior.entry;const now=Date.now(),entry=validEntry(s,c,{guard:CHIEF_TESA_TEST_GUARD,cycleId:CHIEF_TESA_TEST_CYCLE,line:BLUE,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,text:CHIEF_TESA_TEST_TEXT,textHash:hash(CHIEF_TESA_TEST_TEXT),...checked,status:'PREPARED',sendAttempts:0,mid:null,createdAt:now,updatedAt:now});s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(KEY,s.seal(entry));s.audit('CHIEF_TESA_TEST_PREPARED',checked.source.id,{cycleId:entry.cycleId,textHash:entry.textHash,guard:CHIEF_TESA_TEST_GUARD,businessWrites:0,reservationCreated:false});return entry;});
}
function uncertain(s,c,e,mid=null){
  const next=cas(s,c,e,{status:'UNCERTAIN',mid:ID.test(mid??'')?mid:e.mid});
  s.audit('CHIEF_TESA_TEST_UNCERTAIN',e.source.id,{cycleId:e.cycleId,mid:next?.mid??null,resend:false,businessWrites:0});
  return view(next??e,{status:'UNCERTAIN',deliveryVerified:false,lookupOnly:true});
}
export async function executeChiefTesaTest(s,c,t,{source,native,action}={}){
  const checked=authority(s,c,source,native,action);
  if(action==='send'){
    const e=prepare(s,c,checked);
    if(e.sendAttempts||e.status!=='PREPARED')return view(e,{lookupOnly:true,existingCyclePreserved:true});
    if(typeof t.sendChiefTesaTest!=='function')throw Error('CHIEF_TESA_TEST_OWN_TRANSPORT_REQUIRED');
    const reserved=cas(s,c,e,{status:'SENDING',sendAttempts:1,sendStartedAt:Date.now()});
    if(!reserved)throw Error('CHIEF_TESA_TEST_COMPARE_AND_SWAP_REQUIRED');
    s.audit('CHIEF_TESA_TEST_SEND_ATTEMPT',source.id,{cycleId:reserved.cycleId,textHash:reserved.textHash,businessWrites:0});
    try{
      const result=await t.sendChiefTesaTest(s,CHIEF_TESA_TEST_CYCLE);
      if(!result||!ID.test(result.mid??'')||result.line!==BLUE||result.groupJid!==TESA_GROUP_JID||result.textHash!==reserved.textHash)throw Error('CHIEF_TESA_TEST_SEND_RECEIPT_UNVERIFIED');
      const accepted=cas(s,c,reserved,{status:'ACCEPTED',mid:result.mid,acceptance:copy(result)});
      if(!accepted)throw Error('CHIEF_TESA_TEST_COMPARE_AND_SWAP_REQUIRED');
      return view(accepted,{deliveryVerified:false,lookupOnly:true});
    }catch(error){return uncertain(s,c,reserved,error.mid);}
  }
  if(action!=='lookup')throw Error('CHIEF_TESA_TEST_LITERAL_COMMAND_REQUIRED');
  const e=read(s,c)?.entry;if(!e)return view(null);
  if(!e.sendAttempts)return view(e,{lookupOnly:true});
  if(typeof t.verifyChiefTesaTestDelivery!=='function')throw Error('CHIEF_TESA_TEST_OWN_TRANSPORT_REQUIRED');
  const proof=await t.verifyChiefTesaTestDelivery(s,CHIEF_TESA_TEST_CYCLE);
  if(!proof?.verified)return view(e,{lookupOnly:true,deliveryVerified:false});
  if(proof.guard!==CHIEF_TESA_TEST_DELIVERY_GUARD||proof.cycleId!==e.cycleId||proof.line!==BLUE||proof.groupJid!==TESA_GROUP_JID||proof.groupSubject!==TESA_GROUP_SUBJECT||!ID.test(proof.mid??'')||e.mid&&proof.mid!==e.mid||proof.text!==e.text||proof.textHash!==e.textHash||!['DELIVERED','READ'].includes(proof.state)||!Number.isSafeInteger(proof.at)||proof.at+999<e.sendStartedAt||proof.at>Date.now()||typeof proof.nativeProofHash!=='string'||!/^[a-f0-9]{64}$/.test(proof.nativeProofHash))throw Error('CHIEF_TESA_TEST_DELIVERY_UNVERIFIED');
  const delivered=cas(s,c,e,{status:e.status==='READ'?'READ':proof.state,mid:proof.mid,deliveryProof:copy(proof)});
  if(!delivered)throw Error('CHIEF_TESA_TEST_COMPARE_AND_SWAP_REQUIRED');
  s.audit('CHIEF_TESA_TEST_DELIVERY_VERIFIED',source.id,{cycleId:e.cycleId,mid:proof.mid,state:delivered.status,businessWrites:0,answerAdoptedAsPolicy:false});
  return view(delivered,{lookupOnly:true});
}
