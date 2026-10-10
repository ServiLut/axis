import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {MARIA_TENANT,MARIA_COMPANY,MARIA_PROGRAM_URL,installProgramSetup} from '../automation/service-bots/maria-program.mjs';
import {installProgramSupervision,restoreProgramSupervision,programSupervisionStatus} from '../automation/service-bots/program-supervision.mjs';
import {installRetentionProofAccess,restoreRetentionProofAccess,retentionProofAuthorized} from '../automation/service-bots/retention-proof-access.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
function fixture(){
 const now=Date.now(),c={company:'fumigacion',enabled:true,...BUSINESSES.fumigacion,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'test-own-'+i})),authHash:digest('a'.repeat(43)),webhookHash:digest('w'.repeat(43)),mariaProgram:{enabled:true,url:MARIA_PROGRAM_URL,actorId:'25b2e265-e463-4592-bab1-86b7b1687eae',token:'r'.repeat(43),startsAt:now-3600000,expiresAt:now+86400000}},s=new Store(':memory:',c.company,randomBytes(32));
 const b={actorId:c.mariaProgram.actorId,startsAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),token:'n'.repeat(43)};return {now,c,s,b};
}
test('note access cannot be reused as native proof, even after proof was installed',()=>{
 const {now,c,s,b}=fixture();try{
  c.retentionNoteAccess={token:b.token};assert.throws(()=>installRetentionProofAccess(c,s,b,now));
  delete c.retentionNoteAccess;installRetentionProofAccess(c,s,b,now);assert.equal(retentionProofAuthorized(c,'Bearer '+b.token,now),true);
  c.retentionNoteAccess={token:b.token};assert.equal(retentionProofAuthorized(c,'Bearer '+b.token,now),false);assert.throws(()=>restoreRetentionProofAccess({...c,retentionProofAccess:undefined},s));
 }finally{s.close();}
});
test('note access cannot be reused as the general audit reader, including restored credentials',async()=>{
 const {c,s,b}=fixture();try{
  let calls=0;c.retentionNoteAccess={token:b.token};await assert.rejects(installProgramSupervision(c,s,{...b,url:MARIA_PROGRAM_URL+'/operational-audit'},()=>{calls++;}));assert.equal(calls,0);
  delete c.retentionNoteAccess;await installProgramSupervision(c,s,{...b,url:MARIA_PROGRAM_URL+'/operational-audit'},async()=>({ok:true,json:async()=>({company:'FUMIGACION',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,advisorMembershipId:c.mariaProgram.actorId,readOnly:true,customerNotesWritesEnabled:false,day:new Date(Date.now()-5*3600000).toISOString().slice(0,10)})}));
  c.retentionNoteAccess={token:b.token};assert.equal(programSupervisionStatus(c).enabled,false);assert.throws(()=>restoreProgramSupervision({...c,programSupervision:undefined},s));
 }finally{s.close();}
});
test('registration setup rejects every other runtime grant before any network call',async()=>{
 const {c,s,b}=fixture();try{
  let calls=0;const body={...b,enabled:true,url:MARIA_PROGRAM_URL};
  for(const patch of [{authHash:digest(b.token)},{webhookHash:digest(b.token)},{programSupervision:{token:b.token}},{retentionProofAccess:{tokenHash:digest(b.token)}},{retentionNoteAccess:{token:b.token}}])await assert.rejects(installProgramSetup({...c,...patch},s,body,()=>{calls++;}));
  assert.equal(calls,0);assert.equal(s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key='maria-program-setup'").get().n,0);
 }finally{s.close();}
});
