import {createHash} from 'node:crypto';
import {authorized} from './config.mjs';

export const RETENTION_PROOF_ACCESS_GUARD='own-expiring-readonly-native-retention-proof-access-v1';
const metaKey='own-retention-proof-access';
const digest=v=>createHash('sha256').update(v).digest('hex');
function validated(c,b){
 const p=c.mariaProgram;
 if(c.company!=='fumigacion'||p?.enabled!==true||!b||Object.keys(b).sort().join(',')!=='actorId,expiresAt,startsAt,token'||b.actorId!==p.actorId||! /^[A-Za-z0-9_-]{43,128}$/.test(b.token??'')||b.token===p.token||b.token===c.programSupervision?.token||[c.authHash,c.webhookHash].includes(digest(b.token??'')))throw Error('OWN_SEPARATE_RETENTION_PROOF_ACCESS_REQUIRED');
 const startsAt=Date.parse(b.startsAt),expiresAt=Date.parse(b.expiresAt);
 if(!Number.isFinite(startsAt)||!Number.isFinite(expiresAt)||startsAt<p.startsAt||expiresAt>p.expiresAt||startsAt>=expiresAt)throw Error('OWN_RETENTION_PROOF_CUTOFF_REQUIRED');
 return {actorId:b.actorId,tokenHash:digest(b.token),startsAt,expiresAt};
}
export function restoreRetentionProofAccess(c,s){
 if(s.company!==c.company)throw Error('OWN_RETENTION_PROOF_STORE_REQUIRED');
 const row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey);if(!row)return;
 const b=s.open(row.value),p=c.mariaProgram;
 if(c.company!=='fumigacion'||p?.enabled!==true||b.actorId!==p.actorId||! /^[a-f0-9]{64}$/.test(b.tokenHash??'')||[c.authHash,c.webhookHash,digest(p.token),c.programSupervision?.token?digest(c.programSupervision.token):null].includes(b.tokenHash)||!Number.isFinite(b.startsAt)||!Number.isFinite(b.expiresAt)||b.startsAt<p.startsAt||b.expiresAt>p.expiresAt||b.startsAt>=b.expiresAt)throw Error('OWN_STORED_RETENTION_PROOF_ACCESS_REQUIRED');
 c.retentionProofAccess=b;
}
export function retentionProofAccessStatus(c,now=Date.now()){
 const b=c.retentionProofAccess,p=c.mariaProgram;
 const current=Boolean(c.company==='fumigacion'&&p?.enabled===true&&b&&b.actorId===p.actorId&&/^[a-f0-9]{64}$/.test(b.tokenHash??'')&&
  Number.isFinite(b.startsAt)&&Number.isFinite(b.expiresAt)&&Number.isFinite(p.startsAt)&&Number.isFinite(p.expiresAt)&&
  b.startsAt>=p.startsAt&&b.expiresAt<=p.expiresAt&&b.startsAt<b.expiresAt&&
  ![c.authHash,c.webhookHash,typeof p.token==='string'?digest(p.token):null,c.programSupervision?.token?digest(c.programSupervision.token):null].includes(b.tokenHash));
 return {guard:RETENTION_PROOF_ACCESS_GUARD,configured:Boolean(b),enabled:Boolean(current&&Number.isFinite(now)&&b.startsAt<=now&&now<b.expiresAt),actorId:b?.actorId??null,expiresAt:b&&Number.isFinite(b.expiresAt)?new Date(b.expiresAt).toISOString():null,readOnly:true,customerNotesWritesEnabled:false,customerMessagesEnabled:false};
}
export function retentionProofAuthorized(c,header,now=Date.now()){
 return retentionProofAccessStatus(c,now).enabled&&authorized(header,c.retentionProofAccess.tokenHash);
}
export function installRetentionProofAccess(c,s,b,now=Date.now()){
 if(s.company!==c.company)throw Error('OWN_RETENTION_PROOF_STORE_REQUIRED');
 const access=validated(c,b);
 if(access.startsAt>now||access.expiresAt<=now)throw Error('OWN_RETENTION_PROOF_CUTOFF_REQUIRED');
 s.tx(()=>{s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(metaKey,s.seal(access));s.audit('OWN_READONLY_RETENTION_PROOF_ACCESS_CONFIGURED',RETENTION_PROOF_ACCESS_GUARD,{actorId:access.actorId,startsAt:access.startsAt,expiresAt:access.expiresAt,readOnly:true,businessWrites:0,customerMessages:0});});
 c.retentionProofAccess=access;return retentionProofAccessStatus(c,now);
}
