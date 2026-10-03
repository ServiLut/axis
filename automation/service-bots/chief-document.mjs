import {createHash} from 'node:crypto';
import {SANDRA} from './config.mjs';

export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function parseChiefDocument(body){
  if(!/^[a-z0-9_-]{8,100}$/.test(body.key||'')||!/^[a-f0-9]{64}$/.test(body.sourceHash||'')||!/^[a-f0-9]{64}$/.test(body.sha256||'')||
    !/^[A-Za-z0-9_-]{1,100}\.xlsx$/.test(body.fileName||'')||typeof body.mediaBase64!=='string'||body.mediaBase64.length>700000||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.mediaBase64)||
    typeof body.caption!=='string'||!body.caption.trim()||body.caption.length>900||/bearer\s|api.?key|contrase[nñ]a|token\s*[:=]/i.test(body.caption))throw Error('VERIFIED_CHIEF_DOCUMENT_REQUIRED');
  const bytes=Buffer.from(body.mediaBase64,'base64');
  if(bytes.length<100||bytes.length>512000||bytes.subarray(0,4).toString('hex')!=='504b0304'||createHash('sha256').update(bytes).digest('hex')!==body.sha256)throw Error('DOCUMENT_HASH_OR_SIZE_MISMATCH');
  return {kind:'chief_document',fileName:body.fileName,mimetype:XLSX_MIME,mediaBase64:body.mediaBase64,sha256:body.sha256,caption:body.caption};
}
export function queueChiefDocument(store,body,line){
  const document=parseChiefDocument(body),id='chief-document:'+body.key+':'+SANDRA;
  return store.tx(()=>{
    const old=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
    if(old){if(old.phone!==SANDRA||old.line!==line||!old.internal||JSON.stringify(store.open(old.body))!==JSON.stringify(document))throw Error('CHIEF_DOCUMENT_ID_CONFLICT');return {queued:false,id,delivery:{state:old.state,mid:old.mid}};}
    store.queue(id,SANDRA,line,document,true,0);
    store.audit('USER_AUTHORIZED_CHIEF_DOCUMENT',id,{sourceHash:body.sourceHash,sha256:body.sha256,fileName:document.fileName,line});
    return {queued:true,id,delivery:{state:'READY',mid:null}};
  });
}
