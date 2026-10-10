import {MARIA_COMPANY,MARIA_TENANT,MARIA_PROGRAM_URL} from './maria-program.mjs';
import {intakeAudit} from './intake-journal.mjs';
import {evaluateDailyOperationalAudit,bogotaDayWindow} from './daily-operational-audit.mjs';

export const PROGRAM_SUPERVISION_GUARD='own-fumigacion-readonly-daily-program-cross-and-separate-access-v1';
const key='maria-operational-audit-setup';
const get=(s)=>{const r=s.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return r?s.open(r.value):null;};
function validated(c,b){
 const p=c.mariaProgram;
 if(c.company!=='fumigacion'||p?.enabled!==true||!b||Object.keys(b).sort().join(',')!=='actorId,expiresAt,startsAt,token,url'||b.actorId!==p.actorId||b.url!==MARIA_PROGRAM_URL+'/operational-audit'||! /^[A-Za-z0-9_-]{43,128}$/.test(b.token??'')||b.token===p.token)throw Error('OWN_SEPARATE_AUDIT_ACCESS_REQUIRED');
 const startsAt=Date.parse(b.startsAt),expiresAt=Date.parse(b.expiresAt);
 if(!Number.isFinite(startsAt)||!Number.isFinite(expiresAt)||startsAt< p.startsAt||expiresAt>p.expiresAt||startsAt>=expiresAt)throw Error('OWN_AUDIT_CUTOFF_REQUIRED');
 return {...b,startsAt,expiresAt};
}
export function restoreProgramSupervision(c,s){const b=get(s);if(b)c.programSupervision=validated(c,{...b,startsAt:new Date(b.startsAt).toISOString(),expiresAt:new Date(b.expiresAt).toISOString()});}
function ready(c,now=Date.now()){const p=c.programSupervision;return c.company==='fumigacion'&&p&&p.startsAt<=now&&p.expiresAt>now;}
export function programSupervisionStatus(c){return {guard:PROGRAM_SUPERVISION_GUARD,configured:Boolean(c.programSupervision),enabled:Boolean(ready(c)),readOnly:true,tenantId:c.programSupervision?MARIA_TENANT:null,companyId:c.programSupervision?MARIA_COMPANY:null,actorId:c.programSupervision?.actorId??null,expiresAt:c.programSupervision?new Date(c.programSupervision.expiresAt).toISOString():null,customerNotesWritesEnabled:false,retentionSendingEnabled:false};}
async function request(c,fetcher,path,body){
 if(!ready(c))throw Error('OWN_PROGRAM_SUPERVISION_NOT_CONNECTED');
 const r=await fetcher(c.programSupervision.url+path,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+c.programSupervision.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('OWN_PROGRAM_AUDIT_HTTP_REJECTED');
 const raw=await r.json(),data=raw?.success===true?raw.data:raw;
 if(!ready(c)||data?.company!=='FUMIGACION'||data.tenantId!==MARIA_TENANT||data.companyId!==MARIA_COMPANY||data.advisorMembershipId!==c.programSupervision.actorId||data.readOnly!==true)throw Error('OWN_PROGRAM_AUDIT_SCOPE_REQUIRED');
 return data;
}
export async function installProgramSupervision(c,s,body,fetcher){
 const candidate=validated(c,body),temporary={...c,programSupervision:candidate};
 if(!ready(temporary))throw Error('OWN_AUDIT_CUTOFF_REQUIRED');
 const today=new Date(Date.now()-5*3600000).toISOString().slice(0,10),proof=await request(temporary,fetcher,'',{day:today});
 if(proof.day!==today||proof.customerNotesWritesEnabled!==false)throw Error('OWN_PROGRAM_AUDIT_SCOPE_REQUIRED');
 s.tx(()=>{s.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,s.seal(candidate));s.audit('OWN_PROGRAM_SUPERVISION_SETUP_VERIFIED',PROGRAM_SUPERVISION_GUARD,{tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId:candidate.actorId,startsAt:candidate.startsAt,expiresAt:candidate.expiresAt,readOnly:true,businessWrites:0});});
 c.programSupervision=candidate;return programSupervisionStatus(c);
}
export async function dailyProgramCross(c,s,fetcher,{company,day},now=Date.now()){
 if(company!=='fumigacion'||c.company!==company||s.company!==company)throw Error('OWN_DAILY_PROGRAM_CROSS_REQUIRED');
 bogotaDayWindow(day);
 const pages=[];let afterRow=0;
 for(let i=0;i<200;i++){const page=intakeAudit(s,c,{day,afterRow,limit:500});pages.push(page);if(!page.remaining)break;if(page.nextRow<=afterRow)throw Error('OWN_JOURNAL_PAGINATION_REQUIRED');afterRow=page.nextRow;}
 let snapshot=null,programReviewReason=null;
 if(ready(c)){try{const candidate=await request(c,fetcher,'',{day}),period=bogotaDayWindow(day);if(candidate.day!==day||candidate.from!==period.from||candidate.to!==period.to||!Array.isArray(candidate.orders)||!Array.isArray(candidate.technicians)||!Array.isArray(candidate.deletions))throw Error('OWN_PROGRAM_AUDIT_DAY_REQUIRED');snapshot=candidate;}catch{snapshot=null;programReviewReason='PROGRAM_READ_NOT_VERIFIED';}}
 else programReviewReason='SEPARATE_PROGRAM_AUDIT_ACCESS_REQUIRED';
 if(snapshot){
  const phones=[...new Set(pages.flatMap(p=>p.contacts.map(c=>c.phone)))],searched=[],byId=new Map(snapshot.orders.map(o=>[o.id,o]));let complete=true,noncanonicalCovered=true;
  for(let i=0;i<phones.length;i+=50){const batch=phones.slice(i,i+50);try{
   const found=await request(c,fetcher,'/contact-audit',{phones:batch});
   if(!Array.isArray(found.searchedContacts)||!Array.isArray(found.orders)||found.searchedContacts.length!==batch.length||found.searchedContacts.some(r=>!batch.includes(r.phone))||new Set(found.searchedContacts.map(r=>r.phone)).size!==batch.length)throw Error('OWN_CONTACT_AUDIT_SCOPE_REQUIRED');
   complete&&=found.coverage?.contactSearchComplete===true;
   noncanonicalCovered&&=found.coverage?.noncanonicalPhoneFieldsCovered===true;
   searched.push(...found.searchedContacts);
   for(const order of found.orders)if(!byId.has(order.id))byId.set(order.id,order);
  }catch{complete=false;noncanonicalCovered=false;programReviewReason='COMPLETE_CONTACT_SEARCH_NOT_VERIFIED';}}
  snapshot={...snapshot,orders:[...byId.values()],searchedContacts:searched,coverage:{...snapshot.coverage,contactSearchComplete:complete&&noncanonicalCovered,normalizedPnSearchComplete:complete,noncanonicalPhoneFieldsCovered:noncanonicalCovered}};
 }
 const report=evaluateDailyOperationalAudit({company,day,journalPages:pages,programSnapshot:snapshot,now});
 return {...report,programSupervision:programSupervisionStatus(c),programReviewReason};
}
export async function readRetentionCandidates(c,fetcher,body){
 if(!body||Object.keys(body).some(k=>!['asOfDay','cursor','limit'].includes(k)))throw Error('OWN_RETENTION_READ_FIELDS_REQUIRED');
 bogotaDayWindow(body.asOfDay);
 return request(c,fetcher,'/retention-candidates',body);
}
