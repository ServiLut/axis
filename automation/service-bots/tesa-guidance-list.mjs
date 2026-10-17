import {createHash} from 'node:crypto';
import {normalize,chiefReplyRestrictionActive} from './config.mjs';
import {FUMIGACION_BLUE,assertOperationalLineScope,operationalLineAllowed} from './line-scope.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT,getTesaConfig} from './tesa-config.mjs';
import {refreshTesaMembership} from './tesa-transport.mjs';
import {publicOperationAllowed,publicResponseSqlCutoff} from './public-response-window.mjs';

export const TESA_GUIDANCE_LIST_GUARD='own-fum-blue-general-guidance-list-exact-delivery-without-case-adoption-v1';
const table='tesa_guidance_lists',running=new WeakSet(),sha=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Error('TESA_GUIDANCE_'+code);};
function ownScope(store,config){
  if(store?.company!=='fumigacion'||config?.company!=='fumigacion'||config.enabled!==true)fail('OWN_ENABLED_FUM_REQUIRED');
  let scope;try{scope=assertOperationalLineScope(config);}catch{fail('EXACT_BLUE_GROUP_REQUIRED');}
  const t=config.tesaOperations;
  const line=config.lines?.find(l=>l.phone===FUMIGACION_BLUE);
  if(!scope||!line||typeof line.instance!=='string'||!line.instance||!operationalLineAllowed(config,FUMIGACION_BLUE)||
    !t?.enabled||t.groupJid!==TESA_GROUP_JID||t.groupSubject!==TESA_GROUP_SUBJECT||t.senderLine!==FUMIGACION_BLUE)fail('EXACT_BLUE_GROUP_REQUIRED');
  return {line,instance:line.instance,apiKey:line.apiKey,provider:config.provider,activatedAt:config.activatedAt,scope:JSON.stringify(scope)};
}
function unchanged(store,config,binding,{membership=true}={}){
  const now=ownScope(store,config);
  if(now.line!==binding.line||now.instance!==binding.instance||now.apiKey!==binding.apiKey||now.provider!==binding.provider||
    now.activatedAt!==binding.activatedAt||now.scope!==binding.scope)fail('BINDING_CHANGED');
  if(membership){
    const t=getTesaConfig(config);
    if(!t||t.senderLine!==FUMIGACION_BLUE||t.groupJid!==TESA_GROUP_JID||t.verifiedMembership.verifiedAt<Date.now()-300000)fail('CURRENT_MEMBERSHIP_REQUIRED');
  }
}
function initialize(store){
  store.db.exec('CREATE TABLE IF NOT EXISTS '+table+'('+
    'id TEXT PRIMARY KEY,company TEXT NOT NULL CHECK(company=\'fumigacion\'),list_key TEXT NOT NULL,source_hash TEXT NOT NULL,'+
    'request_hash TEXT NOT NULL,text_hash TEXT NOT NULL,dedupe_hash TEXT NOT NULL UNIQUE,body TEXT NOT NULL,'+
    'state TEXT NOT NULL CHECK(state IN (\'READY\',\'SENDING\',\'ACCEPTED\',\'UNCERTAIN\',\'DELIVERED\',\'READ\')),'+
    'mid TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,checked_at INTEGER NOT NULL DEFAULT 0,native_proof TEXT,UNIQUE(company,list_key));'+
    'CREATE UNIQUE INDEX IF NOT EXISTS tesa_guidance_native_mid ON '+table+'(company,mid) WHERE mid IS NOT NULL;');
}
const closed=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
function safeField(value,max){
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max||/[\u0000-\u001f\u007f]/u.test(value))return false;
  const t=normalize(value);
  // General examples use no personal identifiers or numeric business facts.
  // This deliberately excludes dates, prices and actual customer examples.
  if(/[\p{N}@]/u.test(value)||/:\/\//.test(value)||/\b(?:https?|www|bearer|api.?key|token|clave|credencial\w*|contrasena|password|secret|sk[-_])\b/.test(t)||
    /\b[\p{L}\d-]+(?:\s*\.\s*[\p{L}\d-]+)+\b/u.test(value)||
    /\b(?:calle|carrera|kra|cra|cll|diagonal|transversal|avenida|direccion|correo|telefono|celular|cedula|documento de identidad)\b/.test(t)||
    /\b(?:pag\w*|abon\w*|banc\w*|transfer\w*|consign\w*|financier\w*|cuentas?|precio\w*|tarifa\w*|cotiza\w*|cost[oa]\w*|valor\w*|dinero|pesos|descuent\w*|factur\w*|cobr\w*|recaud\w*|reembols\w*|saldo\w*|deuda\w*|comprobante\w*|tarjeta\w*|efectivo|moneda\w*)\b/.test(t)||
    /[$€£]|(?:\p{Lu}\p{Ll}{2,})\s+(?:\p{Lu}\p{Ll}{2,})(?:\s+\p{Lu}\p{Ll}{2,})?/u.test(value))return false;
  return true;
}
function payload(body){
  if(!closed(body,['key','sourceHash','items'])||typeof body.key!=='string'||typeof body.sourceHash!=='string'||
    !/^[a-z0-9_-]{8,100}$/.test(body.key)||!/^[a-f0-9]{64}$/.test(body.sourceHash)||
    !Array.isArray(body.items)||body.items.length<1||body.items.length>6)fail('CLOSED_LIST_REQUIRED');
  const items=body.items.map(item=>{
    if(!closed(item,['title','question','example'])||!safeField(item.title,80)||!safeField(item.question,350)||!safeField(item.example,250))fail('GENERAL_MINIMIZED_ITEMS_REQUIRED');
    return {title:item.title,question:item.question,example:item.example};
  });
  if(new Set(items.map(item=>normalize(item.title))).size!==items.length)fail('DISTINCT_ITEMS_REQUIRED');
  const text=['María · FUMIGACIÓN · dudas para aclarar',
    'Consulta general. Los ejemplos son hipotéticos y no corresponden a clientes.',
    ...items.map((item,i)=>(i+1)+') '+item.title+'\nDuda: '+item.question+'\nEjemplo sencillo: '+item.example),
    'Respondan citando este mensaje y con el número de cada punto. Si algo no está definido, indiquen qué falta.'].join('\n\n');
  if(text.length>5000)fail('TEXT_TOO_LONG');
  const textHash=sha(text),requestHash=sha(JSON.stringify({sourceHash:body.sourceHash,items,text}));
  return {key:body.key,sourceHash:body.sourceHash,items,text,textHash,requestHash,dedupeHash:sha(body.sourceHash+'\n'+text)};
}
function exactStored(store,row){
  const saved=store.open(row.body),valid=payload({key:row.list_key,sourceHash:row.source_hash,items:saved.items});
  if(saved.guard!==TESA_GUIDANCE_LIST_GUARD||saved.text!==valid.text||saved.groupJid!==TESA_GROUP_JID||saved.senderLine!==FUMIGACION_BLUE||
    valid.requestHash!==row.request_hash||valid.textHash!==row.text_hash||valid.dedupeHash!==row.dedupe_hash)fail('STORED_HASH_CONFLICT');
  return saved;
}
const result=(row,queued=false)=>({guard:TESA_GUIDANCE_LIST_GUARD,queued,id:row.id,key:row.list_key,state:row.state,mid:row.mid,
  sourceHash:row.source_hash,textHash:row.text_hash,requestHash:row.request_hash,caseBound:false,automaticAnswerAdoption:false,businessWrites:0});

export function queueTesaGuidanceList(store,config,body){
  ownScope(store,config);const p=payload(body);initialize(store);
  return store.tx(()=>{
    const prior=store.db.prepare('SELECT * FROM '+table+' WHERE company=? AND list_key=?').get('fumigacion',p.key);
    if(prior){exactStored(store,prior);if(prior.request_hash!==p.requestHash)fail('KEY_CONFLICT');return result(prior);}
    const duplicate=store.db.prepare('SELECT * FROM '+table+' WHERE dedupe_hash=?').get(p.dedupeHash);
    if(duplicate){exactStored(store,duplicate);return {...result(duplicate),deduplicated:true};}
    const id='tesa-guidance:'+sha(p.key),now=Date.now();
    const saved={guard:TESA_GUIDANCE_LIST_GUARD,items:p.items,text:p.text,groupJid:TESA_GROUP_JID,senderLine:FUMIGACION_BLUE};
    store.db.prepare('INSERT INTO '+table+'(id,company,list_key,source_hash,request_hash,text_hash,dedupe_hash,body,state,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,'fumigacion',p.key,p.sourceHash,p.requestHash,p.textHash,p.dedupeHash,store.seal(saved),'READY',now,now);
    store.audit('TESA_GENERAL_GUIDANCE_LIST_QUEUED',id,{guard:TESA_GUIDANCE_LIST_GUARD,sourceHash:p.sourceHash,textHash:p.textHash,itemCount:p.items.length,
      groupJid:TESA_GROUP_JID,senderLine:FUMIGACION_BLUE,caseBound:false,historicalCasesMigrated:false});
    return result(store.db.prepare('SELECT * FROM '+table+' WHERE id=?').get(id),true);
  });
}
export function guidanceListStatus(store,config,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='key')||
    options.key!==undefined&&(typeof options.key!=='string'||!/^[a-z0-9_-]{8,100}$/.test(options.key)))fail('STATUS_KEY_REQUIRED');
  let enabled=false;try{ownScope(store,config);enabled=true;}catch{}
  if(store?.company!=='fumigacion'||config?.company!=='fumigacion')return {guard:TESA_GUIDANCE_LIST_GUARD,enabled:false,states:{},caseBound:false,automaticAnswerAdoption:false};
  initialize(store);
  const states=Object.fromEntries(store.db.prepare('SELECT state,COUNT(*) n FROM '+table+' GROUP BY state').all().map(r=>[r.state,r.n]));
  const row=options.key&&store.db.prepare('SELECT * FROM '+table+' WHERE company=? AND list_key=?').get('fumigacion',options.key);
  return {guard:TESA_GUIDANCE_LIST_GUARD,enabled,groupJid:TESA_GROUP_JID,senderLine:FUMIGACION_BLUE,states,
    ...(options.key?{found:Boolean(row),list:row?{...result(row),text:exactStored(store,row).text,deliveryVerified:['DELIVERED','READ'].includes(row.state)}:null}:{}),
    caseBound:false,automaticAnswerAdoption:false,businessWritesEnabled:false,humanHoldsModified:false};
}
async function preflight(store,config,transport,binding){
  unchanged(store,config,binding,{membership:false});
  await refreshTesaMembership(config,transport,{force:true});
  unchanged(store,config,binding);
  const proof=await transport.verifyLine(FUMIGACION_BLUE);
  unchanged(store,config,binding);
  if(proof?.phone!==FUMIGACION_BLUE||proof.instance!==binding.instance||proof.ownerVerified!==true||proof.open!==true)fail('EXACT_OPEN_OWNER_REQUIRED');
}
function nativeText(row){
  let m=row.message;
  const control=node=>!node||typeof node!=='object'||Array.isArray(node)||
    ['protocolMessage','editedMessage','revokedMessage'].some(k=>Object.hasOwn(node,k))||
    [node.isEdited,node.isDeleted,node.deleted,node.revoked].some(v=>v===true);
  for(let i=0;i<4;i++){
    if(control(m))return null;
    if(m.ephemeralMessage?.message){
      if(Object.hasOwn(m,'conversation')||Object.hasOwn(m,'extendedTextMessage')||control(m.ephemeralMessage))return null;
      m=m.ephemeralMessage.message;
    }else break;
  }
  if(control(m)||m.extendedTextMessage&&control(m.extendedTextMessage))return null;
  const values=[m.conversation,m.extendedTextMessage?.text].filter(v=>typeof v==='string');
  return values.length===1?values[0]:null;
}
async function delivery(store,config,transport,binding,row){
  const saved=exactStored(store,row);
  const found=await transport.request(binding.line,'/chat/findMessages/'+encodeURIComponent(binding.instance),{where:{key:{id:row.mid}},offset:10,page:1});
  unchanged(store,config,binding);
  const candidates=(found?.messages?.records??[]).filter(r=>r.key?.id===row.mid);
  if(candidates.length!==1)return false;
  const r=candidates[0],at=Number(r.messageTimestamp)*1000;
  const authors=[r.key.participant,r.key.participantAlt,r.authorJid].filter(v=>v!==undefined&&v!==null&&v!=='');
  if(r.key.remoteJid!==TESA_GROUP_JID||r.key.fromMe!==true||authors.some(jid=>jid!==FUMIGACION_BLUE+'@s.whatsapp.net')||
    nativeText(r)!==saved.text||!Number.isFinite(at)||at<row.created-1000||at>Date.now()+60000)return false;
  const statuses=[r.status,...(Array.isArray(r.MessageUpdate)?r.MessageUpdate.map(u=>u.status):[])];
  if([r.isEdited,r.isDeleted,r.deleted,r.revoked,r.key.isEdited,r.key.isDeleted].some(v=>v===true)||
    r.message?.editedMessage||r.message?.revokedMessage||statuses.some(s=>['EDITED','DELETED','REVOKED'].includes(String(s).toUpperCase())))return false;
  const state=statuses.includes('READ')?'READ':statuses.includes('DELIVERY_ACK')?'DELIVERED':null;
  if(!state)return false;
  const proof={guard:TESA_GUIDANCE_LIST_GUARD,company:'fumigacion',groupJid:TESA_GROUP_JID,senderLine:FUMIGACION_BLUE,mid:row.mid,
    textHash:row.text_hash,sourceHash:row.source_hash,authorJid:FUMIGACION_BLUE+'@s.whatsapp.net',nativeHash:sha(JSON.stringify(r)),state,checkedAt:Date.now()};
  return store.tx(()=>{
    unchanged(store,config,binding);exactStored(store,store.db.prepare('SELECT * FROM '+table+' WHERE id=?').get(row.id));
    if(row.state===state)return false;
    const changed=store.db.prepare('UPDATE '+table+' SET state=?,native_proof=?,updated=? WHERE id=? AND mid=? AND state IN (\'ACCEPTED\',\'DELIVERED\')')
      .run(state,store.seal(proof),Date.now(),row.id,row.mid).changes;
    if(changed)store.audit('TESA_GENERAL_GUIDANCE_NATIVE_DELIVERY',row.id,{state,mid:row.mid,textHash:row.text_hash,allMembersRead:false});
    return Boolean(changed);
  });
}
export async function drainTesaGuidanceLists(store,config,transport){
  if(chiefReplyRestrictionActive(config))return {enabled:false,restrictedToChief:true,accepted:0,uncertain:0,delivered:0};
  let binding;try{binding=ownScope(store,config);}catch{return {enabled:false,accepted:0,uncertain:0,delivered:0};}
  if(running.has(store))return {enabled:true,busy:true,accepted:0,uncertain:0,delivered:0};
  initialize(store);running.add(store);
  let accepted=0,uncertain=0,delivered=0,preflightBlocked=0;
  try{
    // An abandoned reservation is never retried after a restart or interruption.
    uncertain+=store.db.prepare('UPDATE '+table+' SET state=\'UNCERTAIN\',updated=? WHERE state=\'SENDING\'').run(Date.now()).changes;
    const checks=store.db.prepare('SELECT * FROM '+table+' WHERE state IN (\'ACCEPTED\',\'DELIVERED\') AND checked_at<=? ORDER BY checked_at,created LIMIT 3').all(Date.now()-60000);
    const publicCut=publicResponseSqlCutoff(config);
    const ready=store.db.prepare('SELECT * FROM '+table+' WHERE state=\'READY\' AND checked_at<=? AND (?<0 OR created>=?) ORDER BY created LIMIT 1').all(Date.now()-60000,publicCut,publicCut);
    const rows=[...checks,...ready];
    for(const row of rows){
      try{exactStored(store,row);await preflight(store,config,transport,binding);}catch{
        store.db.prepare('UPDATE '+table+' SET checked_at=? WHERE id=?').run(Date.now(),row.id);preflightBlocked++;continue;
      }
      if(chiefReplyRestrictionActive(config))break;
      if(row.state!=='READY'){
        try{if(await delivery(store,config,transport,binding,row))delivered++;}catch{}
        finally{store.db.prepare('UPDATE '+table+' SET checked_at=? WHERE id=?').run(Date.now(),row.id);}
        continue;
      }
      if(!publicOperationAllowed(config,{sourceAt:row.created,createdAt:row.created}))continue;
      unchanged(store,config,binding);
      if(!store.db.prepare('UPDATE '+table+' SET state=\'SENDING\',updated=? WHERE id=? AND state=\'READY\'').run(Date.now(),row.id).changes)continue;
      try{
        const saved=exactStored(store,row);unchanged(store,config,binding);
        const sent=await transport.request(binding.line,'/message/sendText/'+encodeURIComponent(binding.instance),{number:TESA_GROUP_JID,text:saved.text,linkPreview:false});
        unchanged(store,config,binding);
        if(typeof sent?.key?.id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(sent.key.id)||sent.key.remoteJid!==TESA_GROUP_JID)fail('EXACT_SEND_RECEIPT_REQUIRED');
        if(!store.db.prepare('UPDATE '+table+' SET state=\'ACCEPTED\',mid=?,updated=? WHERE id=? AND state=\'SENDING\'').run(sent.key.id,Date.now(),row.id).changes)fail('RESERVATION_CHANGED');
        store.audit('TESA_GENERAL_GUIDANCE_ACCEPTED',row.id,{mid:sent.key.id,textHash:row.text_hash,deliveryVerified:false,caseBound:false});accepted++;
      }catch{
        uncertain+=store.db.prepare('UPDATE '+table+' SET state=\'UNCERTAIN\',updated=? WHERE id=? AND state=\'SENDING\'').run(Date.now(),row.id).changes;
      }
    }
    return {enabled:true,accepted,uncertain,delivered,preflightBlocked,automaticResendUncertain:false};
  }finally{running.delete(store);}
}
