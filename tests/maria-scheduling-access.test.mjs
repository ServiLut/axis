import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {MARIA_SCHEDULING_URL,installOwnSchedulingAccess,restoreOwnSchedulingAccess,ownSchedulingEnabled,ownSchedulingAccessStatus,ownSchedulingProofAuthorized} from '../automation/service-bots/maria-scheduling-access.mjs';
const sha=text=>createHash('sha256').update(text).digest('hex');
function fixture(){const now=Date.now(),c={company:'fumigacion',enabled:true,authHash:sha('a'.repeat(43)),webhookHash:sha('w'.repeat(43)),mariaProgram:{enabled:true,actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',token:'r'.repeat(43),startsAt:now-3600000,expiresAt:now+86400000},programSupervision:{token:'s'.repeat(43)},retentionNoteAccess:{token:'n'.repeat(43)},retentionProofAccess:{tokenHash:sha('p'.repeat(43))}},s=new Store(':memory:','fumigacion',randomBytes(32)),body={actorId:c.mariaProgram.actorId,url:MARIA_SCHEDULING_URL,token:'x'.repeat(43),proofToken:'y'.repeat(43),startsAt:now-1000,expiresAt:c.mariaProgram.expiresAt};return {now,c,s,body};}

test('separate first-schedule credentials are sealed, restore and expose no token or expanded powers',()=>{const f=fixture();try{
 const status=installOwnSchedulingAccess(f.c,f.s,f.body,f.now);assert.equal(status.enabled,true);assert.equal(status.scope,'FIRST_SCHEDULE_OF_OWN_NEW_ORDER_ONLY');assert.equal(status.otherOrdersEnabled,false);assert.equal(status.reprogrammingEnabled,false);assert.equal(status.paymentsEnabled,false);
 const row=f.s.db.prepare("SELECT value FROM meta WHERE key='maria-own-order-scheduling-access'").get();assert.ok(row);assert.equal(row.value.includes(f.body.token),false);assert.equal(row.value.includes(f.body.proofToken),false);assert.equal(JSON.stringify(status).includes(f.body.token),false);assert.equal(JSON.stringify(status).includes(f.body.proofToken),false);
 const restored={...f.c,ownOrderScheduling:undefined};restoreOwnSchedulingAccess(restored,f.s);assert.equal(ownSchedulingProofAuthorized(restored,'Bearer '+f.body.proofToken,f.now),true);assert.equal(ownSchedulingProofAuthorized(restored,'Bearer '+f.body.token,f.now),false);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
}finally{f.s.close();}});

test('write and proof credentials cannot reuse any current runtime, registration, reading or retention credential',()=>{for(const role of ['token','proofToken']){const f=fixture();try{
 for(const letter of ['a','w','r','s','n','p'])assert.throws(()=>installOwnSchedulingAccess(f.c,f.s,{...f.body,[role]:letter.repeat(43)},f.now),role+':'+letter);
 assert.throws(()=>installOwnSchedulingAccess(f.c,f.s,{...f.body,proofToken:f.body.token},f.now));assert.equal(ownSchedulingAccessStatus(f.c).configured,false);
}finally{f.s.close();}}});

test('wrong actor, endpoint, company, expanded expiry, future start and extra capability fields are rejected',()=>{const f=fixture();try{
 for(const patch of [{actorId:'other'},{url:MARIA_SCHEDULING_URL+'/other'},{expiresAt:f.body.expiresAt+1},{expiresAt:f.body.expiresAt-1},{startsAt:f.c.mariaProgram.startsAt-1},{startsAt:f.now+1},{startsAt:f.body.expiresAt},{operation:'reprogram'},{tenantId:'other'}])assert.throws(()=>installOwnSchedulingAccess(f.c,f.s,{...f.body,...patch},f.now),JSON.stringify(patch));
 assert.throws(()=>installOwnSchedulingAccess({...f.c,company:'servicio-tecnico'},f.s,f.body,f.now));assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key='maria-own-order-scheduling-access'").get().n,0);
}finally{f.s.close();}});

test('expired, not-yet-active, disabled, changed-actor or shortened-parent access cannot authorize native proofs',()=>{const f=fixture();try{
 installOwnSchedulingAccess(f.c,f.s,f.body,f.now);assert.equal(ownSchedulingEnabled(f.c,f.body.startsAt-1),false);assert.equal(ownSchedulingEnabled(f.c,f.body.expiresAt),false);assert.equal(ownSchedulingEnabled(f.c,NaN),false);
 for(const patch of [{enabled:false},{mariaProgram:{...f.c.mariaProgram,enabled:false}},{mariaProgram:{...f.c.mariaProgram,actorId:'other'}},{mariaProgram:{...f.c.mariaProgram,expiresAt:f.body.expiresAt-1}},{mariaProgram:{...f.c.mariaProgram,startsAt:f.body.startsAt+1}}])assert.equal(ownSchedulingProofAuthorized({...f.c,...patch},'Bearer '+f.body.proofToken,f.now),false);
 assert.equal(ownSchedulingProofAuthorized(f.c,'Bearer '+'a'.repeat(43),f.now),false);assert.equal(ownSchedulingProofAuthorized(f.c,null,f.now),false);
}finally{f.s.close();}});

test('foreign store and tampered sealed access cannot install or restore scheduling permissions',()=>{const f=fixture();try{
 f.s.company='servicio-tecnico';assert.throws(()=>installOwnSchedulingAccess(f.c,f.s,f.body,f.now));assert.throws(()=>restoreOwnSchedulingAccess(f.c,f.s));f.s.company='fumigacion';installOwnSchedulingAccess(f.c,f.s,f.body,f.now);
 const row=f.s.db.prepare("SELECT value FROM meta WHERE key='maria-own-order-scheduling-access'").get(),value=f.s.open(row.value);f.s.db.prepare("UPDATE meta SET value=? WHERE key='maria-own-order-scheduling-access'").run(f.s.seal({...value,url:'https://other.example'}));assert.throws(()=>restoreOwnSchedulingAccess({...f.c,ownOrderScheduling:undefined},f.s));
}finally{f.s.close();}});
