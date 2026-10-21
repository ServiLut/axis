export const NATIVE_LIVE_TRIAL_GUARD='own-expiring-native-two-line-trial-and-isolated-program-record-v1';
export const NATIVE_TRIAL_ADDRESS='Calle de Prueba 0 # 0, PRUEBA NO EJECUTAR';
const BLUE='573126944997',RED='573126938721',CHIEF='573016803926';
const lines=[BLUE,RED],uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function nativeTrialConfig(env,company,ordinary){
 const raw=env.BOT_NATIVE_LIVE_TRIAL_JSON;if(!raw)return null;
 const p=JSON.parse(raw),keys='bindings,expiresAt,id,source,startsAt,version';
 if(company!=='fumigacion'||!ordinary?.enabled||Object.keys(p).sort().join(',')!==keys||p.version!==1||!uuid.test(p.id??'')||p.source!=='direct-user-own-two-line-e2e-20261021'||!Array.isArray(p.bindings)||p.bindings.length!==2||new Set(p.bindings.map(b=>b.phone)).size!==2)throw Error('OWN_NATIVE_TRIAL_PROFILE_REQUIRED');
 const startsAt=Date.parse(p.startsAt),expiresAt=Date.parse(p.expiresAt);
 if(!Number.isSafeInteger(startsAt)||!Number.isSafeInteger(expiresAt)||expiresAt<=startsAt||expiresAt-startsAt>2*3600000||expiresAt>ordinary.expiresAt||startsAt<ordinary.startsAt)throw Error('OWN_NATIVE_TRIAL_WINDOW_REQUIRED');
 for(const line of lines){const b=p.bindings.find(x=>x.line===line);if(!b||Object.keys(b).sort().join(',')!=='line,phone'||!/^57\d{10}$/.test(b.phone)||['573126944997','573126938721','573022691941','573137689392','573152819233','573016818845'].includes(b.phone))throw Error('OWN_NATIVE_TRIAL_BINDING_REQUIRED');}
 return Object.freeze({...p,startsAt,expiresAt,guard:NATIVE_LIVE_TRIAL_GUARD});
}
export function nativeTrialBinding(c,phone,line,at=Date.now()){
 const p=c.nativeLiveTrial,now=Date.now();
 return c.company==='fumigacion'&&c.enabled&&p?.guard===NATIVE_LIVE_TRIAL_GUARD&&now>=p.startsAt&&now<p.expiresAt&&Number.isSafeInteger(at)&&at>=p.startsAt&&at<p.expiresAt?p.bindings.find(b=>b.phone===phone&&b.line===line)??null:null;
}
export function nativeTrialCustomerTurn(c,e){
 return !e.fromMe&&!e.forwarded&&!e.quotedId&&Boolean(nativeTrialBinding(c,e.phone,e.line,e.at))&&!(e.phone===CHIEF&&/^(?:mar[ií]an?\s*[aá]ngel|mari[aá]ngel|bot)[,:\s]/i.test(e.text??''));
}
export function nativeTrialForeignHistoryAllowed(s,c,phone,line){
 if(!nativeTrialBinding(c,phone,line)||!s?.db)return false;
 const cut=c.nativeLiveTrial.startsAt;
 // The exception observes, rather than deletes, old shared history. A new
 // source on the other line invalidates this isolated trial.
 for(const row of s.db.prepare('SELECT body FROM events WHERE phone=? AND (line IS NULL OR line<>?) AND at>=?').all(phone,line,cut)){
  const e=s.open(row.body);if(e.fromMe&&s.db.prepare('SELECT 1 FROM outbox WHERE mid=? AND phone=? AND line=? AND internal=1').get(e.id,phone,e.line))continue;
  if(phone!==CHIEF||e.fromMe||e.forwarded||!/^mar[ií]an?\s*[aá]ngel[, :]/i.test(e.text??''))return false;
 }
 if(s.db.prepare('SELECT 1 FROM outbox WHERE phone=? AND internal=0 AND (line IS NULL OR line<>?) AND created>=? LIMIT 1').get(phone,line,cut))return false;
 return true;
}
export function foreignLineSources(s,c,phone,line){return s.hasSourcesOutsideLine(phone,line)&&!nativeTrialForeignHistoryAllowed(s,c,phone,line);}
export function nativeTrialPayload(c,p){
 const binding=nativeTrialBinding(c,p?.phone,p?.line,Date.parse(p?.sources?.acceptance?.at)),profile=c.nativeLiveTrial;
 if(!binding)return null;
 const name=p.line===BLUE?'Persona Sintética Prueba Azul':'Persona Sintética Prueba Roja';
 if(p.customerName!==name||p.address!==NATIVE_TRIAL_ADDRESS||p.municipality!=='itagui'||p.slots?.service!=='cucarachas'||p.slots?.site!=='apartamento'||!/^2(?: habitaciones)?$/.test(String(p.slots?.rooms))||p.quote?.priceCop!==129000||!p.clientSchedule||!p.summaryConfirmation)throw Error('OWN_NATIVE_TRIAL_CLOSED_FIXTURE_REQUIRED');
 const sources=[...Object.values(p.sources??{}),...(p.preferenceParts?[p.preferenceParts.date,p.preferenceParts.time]:[])].filter(Boolean);
 if(!sources.length||sources.some(s=>('phone' in s&&(s.phone!==p.phone||s.line!==p.line))||!Number.isFinite(Date.parse(s.at))||Date.parse(s.at)<profile.startsAt||Date.parse(s.at)>=profile.expiresAt)||[p.quote.deliveredAt,p.summaryConfirmation.deliveredAt].some(at=>!Number.isFinite(Date.parse(at))||Date.parse(at)<profile.startsAt||Date.parse(at)>=profile.expiresAt))throw Error('OWN_NATIVE_TRIAL_FRESH_SOURCES_REQUIRED');
 return {profileId:profile.id,request:p};
}
export function nativeTrialStatus(c){const p=c.nativeLiveTrial;return {guard:NATIVE_LIVE_TRIAL_GUARD,configured:Boolean(p),enabled:Boolean(p&&Date.now()>=p.startsAt&&Date.now()<p.expiresAt),profileId:p?.id??null,startsAt:p?new Date(p.startsAt).toISOString():null,expiresAt:p?new Date(p.expiresAt).toISOString():null,recordClass:'PRUEBA',ordinaryCustomerHistoryChanged:false,maximumRecords:2,technicianAssignment:false,payments:false};}
