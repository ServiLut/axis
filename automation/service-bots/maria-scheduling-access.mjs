import {createHash} from 'node:crypto';
import {authorized} from './config.mjs';

export const MARIA_SCHEDULING_ACCESS_GUARD='own-expiring-first-schedule-only-and-separate-native-proof-v1';
export const MARIA_SCHEDULING_URL='https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-own-order-scheduling';
const key='maria-own-order-scheduling-access',sha=v=>createHash('sha256').update(v).digest('hex');
const keys='actorId,expiresAt,proofToken,startsAt,token,url';
const forbiddenHashes=c=>[c.authHash,c.webhookHash,c.mariaProgram?.token?sha(c.mariaProgram.token):null,c.programSupervision?.token?sha(c.programSupervision.token):null,c.retentionNoteAccess?.token?sha(c.retentionNoteAccess.token):null,c.retentionProofAccess?.tokenHash].filter(Boolean);
function checked(c,b){
 const p=c.mariaProgram;
 if(c.company!=='fumigacion'||p?.enabled!==true||!b||Object.keys(b).sort().join(',')!==keys||b.actorId!==p.actorId||b.url!==MARIA_SCHEDULING_URL||!Number.isSafeInteger(b.startsAt)||!Number.isSafeInteger(b.expiresAt)||b.startsAt<p.startsAt||b.expiresAt!==p.expiresAt||b.startsAt>=b.expiresAt||! /^[A-Za-z0-9_-]{43,128}$/.test(b.token??'')||! /^[a-f0-9]{64}$/.test(b.proofToken??'')||forbiddenHashes(c).includes(sha(b.token))||forbiddenHashes(c).includes(b.proofToken)||sha(b.token)===b.proofToken)throw Error('OWN_SEPARATE_FIRST_SCHEDULING_ACCESS_REQUIRED');
 return {...b};
}
export function restoreOwnSchedulingAccess(c,s){
 if(s.company!==c.company)throw Error('OWN_SCHEDULING_STORE_REQUIRED');
 const row=s.db.prepare('SELECT value FROM meta WHERE key=?').get(key);if(!row)return;
 c.ownOrderScheduling=checked(c,s.open(row.value));
}
export function ownSchedulingEnabled(c,now=Date.now()){
 try{const b=checked(c,c.ownOrderScheduling);return c.enabled===true&&Number.isSafeInteger(now)&&b.startsAt<=now&&now<b.expiresAt;}catch{return false;}
}
export function ownSchedulingAccessStatus(c,now=Date.now()){
 const b=c.ownOrderScheduling;return {guard:MARIA_SCHEDULING_ACCESS_GUARD,configured:Boolean(b),enabled:ownSchedulingEnabled(c,now),scope:'FIRST_SCHEDULE_OF_OWN_NEW_ORDER_ONLY',actorId:b?.actorId??null,startsAt:Number.isSafeInteger(b?.startsAt)?new Date(b.startsAt).toISOString():null,expiresAt:Number.isSafeInteger(b?.expiresAt)?new Date(b.expiresAt).toISOString():null,otherOrdersEnabled:false,reprogrammingEnabled:false,paymentsEnabled:false};
}
export function installOwnSchedulingAccess(c,s,b,now=Date.now()){
 if(s.company!==c.company||!b||Object.keys(b).sort().join(',')!==keys||typeof b.proofToken!=='string'||! /^[A-Za-z0-9_-]{43,128}$/.test(b.proofToken))throw Error('OWN_SCHEDULING_SETUP_REQUIRED');
 const value=checked(c,{...b,proofToken:sha(b.proofToken)});
 if(value.startsAt>now||value.expiresAt<=now)throw Error('OWN_SCHEDULING_WINDOW_REQUIRED');
 s.tx(()=>{s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,s.seal(value));s.audit('OWN_FIRST_SCHEDULING_ACCESS_CONFIGURED',MARIA_SCHEDULING_ACCESS_GUARD,{actorId:value.actorId,startsAt:value.startsAt,expiresAt:value.expiresAt,scope:'FIRST_SCHEDULE_OF_OWN_NEW_ORDER_ONLY',businessWrites:0});});c.ownOrderScheduling=value;return ownSchedulingAccessStatus(c,now);
}
export function ownSchedulingProofAuthorized(c,header,now=Date.now()){return ownSchedulingEnabled(c,now)&&authorized(header,c.ownOrderScheduling.proofToken);}
