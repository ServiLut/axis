// All accounts, provider evidence, HTTP responses and database rows are local
// synthetic fixtures. No real backend, provider, credential or model is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Store} from '../automation/service-bots/store.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD,projectClientRequestedSchedule} from '../automation/service-bots/client-requested-schedule.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {drainChiefActions,reviewChiefActions,chiefActionsStatus} from '../automation/service-bots/chief-actions.mjs';
import {BUSINESSES,SANDRA} from '../automation/service-bots/config.mjs';
import {MARIA_TENANT,MARIA_COMPANY,canonical,registrationHash} from '../automation/service-bots/maria-program.mjs';
import {startChiefCustomerSimulation,runChiefCustomerSimulationTurn,acknowledgeChiefCustomerSimulationOutput,finishChiefCustomerSimulation,chiefCustomerSimulationDraft,CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD} from '../automation/service-bots/chief-customer-simulation.mjs';
import {mariaTestOrderAccessConfig,mariaTestOrderAccessStatus,parseMariaTestOrderCommand,executeMariaTestOrderAccess,verifyMariaTestOrderAccess,MARIA_TEST_ORDER_URL} from '../automation/service-bots/maria-test-order-access.mjs';
const BLUE='573126944997',RED='573126938721',clock=Date.parse('2026-10-16T22:10:00Z'),actorId='7508385b-536e-4aa2-8137-d734dfc900ef',ordinaryToken='SYNTHETIC_ORDINARY_ROLE_ONLY_'.padEnd(43,'o'),testToken='SYNTHETIC_SEPARATE_TEST_ONLY_'.padEnd(43,'t'),label='PRUEBA — NO EJECUTAR';
const sha=v=>createHash('sha256').update(v).digest('hex');let sequence=10000;
const grant=()=>({enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:ordinaryToken,actorId,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:clock-3600000,expiresAt:Date.parse('2026-11-07T16:56:52.680Z')});
const env=()=>({BOT_MARIA_TEST_ORDER_ENABLED:'true',BOT_MARIA_TEST_ORDER_TOKEN:testToken,BOT_MARIA_TEST_ORDER_URL:MARIA_TEST_ORDER_URL,BOT_MARIA_TEST_ORDER_STARTS_AT:new Date(clock-60000).toISOString(),BOT_MARIA_TEST_ORDER_EXPIRES_AT:new Date(clock+2*3600000).toISOString()});
function configuration(){const ordinary=grant();return {company:'fumigacion',...BUSINESSES.fumigacion,enabled:false,chiefOnly:true,replyOnlyToChief:true,activatedAt:clock-120000,lines:[{phone:BLUE,instance:'isolated-blue'},{phone:RED,instance:'isolated-red'}],mariaProgram:ordinary,mariaTestOrder:mariaTestOrderAccessConfig(env(),'fumigacion',ordinary),operationalLineScope:{company:'fumigacion',version:'authorized-fumigacion-blue-only-v1',authorizationSource:'direct-user-20261009-red-block-24h',authorizedAt:new Date(clock-120000).toISOString(),activeLines:[BLUE],suspendedLines:[RED]}};}
function status(c){return {guard:'own-chief-authorized-test-order-v1',recordClass:'PRUEBA',testOnly:true,readOnly:true,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId,username:'maria.angel.bot',company:'FUMIGACION',chief:SANDRA,line:BLUE,startsAt:new Date(c.mariaTestOrder.startsAt).toISOString(),expiresAt:new Date(c.mariaTestOrder.expiresAt).toISOString(),supportedScenarios:['cucarachas-2-rooms','cucarachas-2-rooms-requested-timing-v2'],closedFixture:{customerName:'Persona Sintética',address:'Calle de Prueba 0 # 0',municipality:'itagui',locationDetails:'Esto es una PRUEBA. Tengo cucarachas en un apartamento de Itagüí de 2 habitaciones.',fieldsSourceText:'Nombre: Persona Sintética\nDirección: Calle de Prueba 0 # 0',slots:{service:'cucarachas',site:'apartamento',location:'itagui',rooms:'2 habitaciones'}},writeScope:{create:'one-closed-synthetic-test-order',cleanup:'own-created-soft-delete-only',ordinaryRegistration:false,scheduling:c.clientRequestedSchedule?.enabled===true,payments:false,dispatch:false},...(c.clientRequestedSchedule?.enabled===true?{clientRequestedSchedule:{enabled:true,guard:MARIA_CLIENT_SCHEDULE_GUARD,startsAt:new Date(c.clientRequestedSchedule.startsAt).toISOString(),expiresAt:new Date(c.mariaTestOrder.expiresAt).toISOString(),technicianAssignment:false}}:{}),limits:{oneActiveRun:true,ordinarySavedAffected:false,genericReportsExcluded:false}};}
function expectedReceipt(c,e,state='CREATED'){
 const p=e.syntheticPayload,clean=state==='CLEANED';const receipt={guard:e.guard,recordClass:'PRUEBA',ordinaryService:false,ordinaryReceiptWritten:false,testRunId:e.testRunId,requestHash:e.payloadHash,state,persisted:true,readAfterCommit:true,destination:SANDRA,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,createdById:actorId,orderId:'10000000-0000-4000-8000-000000000001',customerId:'10000000-0000-4000-8000-000000000002',addressId:'10000000-0000-4000-8000-000000000003',originalSimulationHash:e.syntheticRequestHash,...(e.scenario==='cucarachas-2-rooms-requested-timing-v2'?{requestedTiming:p.slots.preference,requestedTimingSourceId:p.sources.preference.id}:{}),summaryDeliveryGranularity:p.summaryConfirmation?'same-simulated-MID/native-second-and-first-proof-ms':null,phoneMapping:{syntheticPhone:'570000000000',storedPhone:SANDRA,reason:'Verified chief test account; not an ordinary customer identity'},chiefSourcesHash:registrationHash(e.chiefSources),orderSnapshot:{customerName:p.customerName,phone:SANDRA,address:p.address,municipality:p.municipality,locationDetails:p.locationDetails,priceCop:129000,paidCop:0,state:'NUEVO',label,observation:[label,`Ensayo: ${e.testRunId}`,'Solicitud sintética autorizada por la jefa. NO es aceptación de un cliente ni servicio real.',`Servicio simulado: ${p.slots.service}`,`Inmueble simulado: ${p.slots.site}`,`Habitaciones simuladas: ${p.slots.rooms}`,`Municipio simulado: ${p.municipality}`,`Detalle literal simulado: ${p.locationDetails}`,...(e.scenario==='cucarachas-2-rooms-requested-timing-v2'?[`Horario solicitado simulado: ${p.slots.preference}. Pendiente de coordinación interna; sin reserva.`]:[]),'Sin agenda, técnico, pago, factura ni despacho.'].join('\n'),deletedAt:clean?new Date(Date.now()).toISOString():null,technicianId:null,visitAt:null,...(e.scenario==='cucarachas-2-rooms-requested-timing-v2'?{startTime:null,endTime:null}:{})},addressRemovalKind:clean?'disabled-and-blocked-not-deleted':'not-removed',genericReportsExcluded:false,transientGenericReportImpact:!clean,historicalGenericReportsMayIncludeTest:true,requiresExplicitReportClassification:true,simulatedValueIsRevenue:false,realServiceExecuted:false};
 if(p.clientSchedule){
  const {complete,...schedule}=projectClientRequestedSchedule(p.slots.preference,p.sources.preference.at,p.sources.acceptance.at);
  assert.equal(complete,true);receipt.schedulingKind='client-requested-without-technician';receipt.schedule={...schedule,preferenceSourceId:p.sources.preference.id,preferenceSourceAt:p.sources.preference.at,summaryMid:p.summaryConfirmation.mid,acceptanceId:p.sources.acceptance.id,verifiedCurrentFields:true};
  Object.assign(receipt.orderSnapshot,{state:'PROGRAMADO',visitAt:schedule.visitAt,startTime:schedule.startAt,endTime:null,confirmacionComercial:'PENDIENTE',confirmacionComercialAt:null,confirmacionComercialPorId:null,confirmacionComercialOrigen:null,confirmacionComercialEvidencia:null});
  receipt.orderSnapshot.observation=receipt.orderSnapshot.observation.replace('Pendiente de coordinación interna; sin reserva.','Programado sin técnico; no ejecutar.').replace('Sin agenda, técnico, pago, factura ni despacho.','Sin técnico, pago, factura ni despacho. PRUEBA — NO EJECUTAR.');
 }
 return receipt;
}
async function fixture(t,confirmation='Confirmo',options={}){
 t.mock.timers.enable({apis:['Date'],now:clock});const c=configuration(),s=new Store(':memory:','fumigacion',randomBytes(32)),calls=[];let storedEnvelope=null,remoteState='CREATED',mutate=null,failCreate=false,failCleanup=false;
 if(options.calendar){c.staffPlanning={enabled:true,mode:'internal-staff-assignment',startsAt:clock-120000};c.clientRequestedSchedule={enabled:true,guard:MARIA_CLIENT_SCHEDULE_GUARD,startsAt:c.mariaTestOrder.startsAt};}
 const native=(text,patch={})=>{t.mock.timers.tick(1100);const source={id:'3EB0'+(++sequence).toString(16).toUpperCase().padStart(20,'0'),phone:SANDRA,line:BLUE,at:Date.now(),fromMe:false,forwarded:false,quotedId:null,kind:'text',text,...patch},sourceProof={guard:CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,verified:true,sourceId:source.id,phone:source.phone,line:source.line,at:source.at,textHash:sha(source.text),nativeProofHash:sha('SYNTHETIC_PROOF '+source.id)};s.enqueue(source);s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(source.id);return {source,sourceProof};};
 const started=startChiefCustomerSimulation({...native('María Ángel, inicia prueba cliente'),authorizationId:'explicit-synthetic-chief-test-authorization',...(options.timing?{workflowMode:'internal-staff-assignment'}:{}),...(options.calendar?{clientRequestedSchedule:true}:{})}),id=started.simulationId;
 t.after(()=>{try{finishChiefCustomerSimulation({simulationId:id,...native('María Ángel, termina prueba cliente')});}catch{}});
 const turn=async text=>{const input=native('María Ángel, prueba cliente: '+text),result=await runChiefCustomerSimulationTurn({simulationId:id,...input,customerText:text});for(const output of result.outputs){t.mock.timers.tick(1000);acknowledgeChiefCustomerSimulationOutput({simulationId:id,outputId:output.id,proof:{guard:CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD,verified:true,internal:true,recipient:SANDRA,line:BLUE,outboxId:output.outboxId,mid:'3EB0'+(++sequence).toString(16).toUpperCase().padStart(20,'0'),text:output.text,textHash:output.textHash,state:'DELIVERED',verifiedAt:Date.now(),nativeProofHash:sha('SYNTHETIC_DELIVERY '+output.id)}});}return result;};
 await turn('Esto es una PRUEBA. Tengo cucarachas en un apartamento de Itagüí de 2 habitaciones.');await turn('Sí');await turn(options.timing?'Mi nombre es Persona Sintética y mi dirección es Calle de Prueba 0 # 0':'Nombre: Persona Sintética\nDirección: Calle de Prueba 0 # 0');if(options.timing){await turn('Prefiero mañana a las 9 a. m.');if(options.correction)await turn('Me equivoqué, prefiero mañana a las 10 a. m.');}await turn(confirmation);const mature=chiefCustomerSimulationDraft({simulationId:id});
 const read=()=>{const row=s.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-test-order:%'").get();return row&&s.open(row.value);};
 const fetcher=async(url,options)=>{assert.ok(url.startsWith(MARIA_TEST_ORDER_URL));assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+testToken);const path=url.slice(MARIA_TEST_ORDER_URL.length),body=JSON.parse(options.body);calls.push({path,body});if(path==='/status')return {ok:true,json:async()=>mutate?mutate(status(c),'status'):status(c)};
  if(path===''){assert.equal(read().status,'SENDING');assert.equal(read().createAttempts,1);storedEnvelope=structuredClone(body);if(failCreate)throw Error('SYNTHETIC_TIMEOUT_AFTER_POSSIBLE_COMMIT');}
  else if(path==='/receipt'){assert.deepEqual(body,{testRunId:mature.testRunId,createRequestHash:mature.testOrderDraft.envelope.payloadHash});if(!storedEnvelope)return {ok:false,status:404,json:async()=>({})};}
  else if(path==='/cleanup'){assert.equal(read().status,'CLEANUP_SENDING');assert.equal(read().cleanupAttempts,1);assert.deepEqual(body,{testRunId:mature.testRunId,createRequestHash:mature.testOrderDraft.envelope.payloadHash,source:'chief-authorized-test',chiefSourcesHash:registrationHash(mature.testOrderDraft.envelope.chiefSources)});if(failCleanup)throw Error('SYNTHETIC_CLEANUP_UNCERTAIN');remoteState='CLEANED';}
  else throw Error('UNDECLARED_ENDPOINT');
  let receipt=expectedReceipt(c,storedEnvelope,remoteState);if(mutate)receipt=mutate(receipt,path);return {ok:true,json:async()=>receipt};
 };
 const call=async(action,options={})=>{const phrase={create:'sube',lookup:'consulta',cleanup:'retira'}[action],command=native('María Ángel, '+phrase+' la prueba cliente',options.patch);return executeMariaTestOrderAccess(s,c,options.fetcher??fetcher,{action,...command,mature:options.mature??mature,simulationId:options.noMemory?null:id});};
 const close=()=>{try{finishChiefCustomerSimulation({simulationId:id,...native('María Ángel, termina prueba cliente')});}catch{}s.close();};
 return {c,s,mature,id,native,turn,call,close,calls,read,fetcher,setMutate:fn=>{mutate=fn;},failCreate:value=>{failCreate=value;},failCleanup:value=>{failCleanup=value;},remoteState:value=>{remoteState=value;},loseMemory:()=>finishChiefCustomerSimulation({simulationId:id,...native('María Ángel, termina prueba cliente')})};
}

test('the separate access is OFF by default and rejects a foreign scope, reused token, URL, expiry or ambiguous switch',()=>{
 const p=grant();assert.deepEqual(mariaTestOrderAccessConfig({},'fumigacion',p),{enabled:false});for(const patch of [{BOT_MARIA_TEST_ORDER_ENABLED:'yes'},{BOT_MARIA_TEST_ORDER_TOKEN:ordinaryToken},{BOT_MARIA_TEST_ORDER_URL:'https://example.invalid/create'},{BOT_MARIA_TEST_ORDER_EXPIRES_AT:'2026-11-08T00:00:00.000Z'},{BOT_MARIA_TEST_ORDER_STARTS_AT:'2026-10-01T00:00:00.000Z'},{BOT_MARIA_TEST_ORDER_STARTS_AT:'bad'},{BOT_PROGRAM_READ_TOKEN:testToken}])assert.throws(()=>mariaTestOrderAccessConfig({...env(),...patch},'fumigacion',p));assert.throws(()=>mariaTestOrderAccessConfig(env(),'servicio-tecnico',p));assert.throws(()=>mariaTestOrderAccessConfig(env(),'fumigacion',{...p,enabled:false}));
 for(const text of ['María, sube la prueba cliente','María Ángel, no sube la prueba cliente','María Ángel, sube la prueba cliente y agenda','«María Ángel, sube la prueba cliente»'])assert.equal(parseMariaTestOrderCommand(text),null);assert.equal(parseMariaTestOrderCommand('María Ángel, sube la prueba cliente').action,'create');
});

for(const correction of [false,true])test('closed staff fixture preserves the '+(correction?'fresh corrected 10 a.m.':'literal 9 a.m.')+' preference, never an appointment, then cleans once',async t=>{
 const f=await fixture(t,'Sí, confirmo que los datos son correctos.',{timing:true,correction});try{
  const envelope=f.mature.testOrderDraft.envelope,p=envelope.syntheticPayload;
  assert.equal(envelope.scenario,'cucarachas-2-rooms-requested-timing-v2');assert.equal(f.mature.testOrderDraft.initialTestFixtureEligible,true);
  assert.equal(p.slots.preference,correction?'mañana a las 10 a. m.':'mañana a las 9 a. m.');
  assert.equal(p.sources.customerName.text,'Mi nombre es Persona Sintética y mi dirección es Calle de Prueba 0 # 0');
  assert.match(p.summaryConfirmation.text,new RegExp(correction?'10 a\\. m\\.':'9 a\\. m\\.'));
  const r=await f.call('create');assert.equal(r.status,'CREATED');assert.equal(r.receipt.requestedTiming,p.slots.preference);assert.equal(r.receipt.requestedTimingSourceId,p.sources.preference.id);
  assert.equal(r.receipt.orderSnapshot.state,'NUEVO');for(const field of ['technicianId','visitAt','startTime','endTime'])assert.equal(r.receipt.orderSnapshot[field],null);
  assert.match(r.receipt.orderSnapshot.observation,/Pendiente de coordinación interna; sin reserva/);
  assert.equal((await f.call('cleanup')).status,'CLEANED');assert.equal(f.calls.filter(x=>x.path==='').length,1);assert.equal(f.calls.filter(x=>x.path==='/cleanup').length,1);
  if(process.env.MARIA_CHIEF_SIMULATION_FIXTURE_DIR){mkdirSync(process.env.MARIA_CHIEF_SIMULATION_FIXTURE_DIR,{recursive:true});writeFileSync(join(process.env.MARIA_CHIEF_SIMULATION_FIXTURE_DIR,correction?'chief-requested-timing-corrected-envelope-synthetic.json':'chief-requested-timing-envelope-synthetic.json'),JSON.stringify(envelope,null,2)+'\n');}
 }finally{f.close();}
});

test('recomputed hashes cannot turn a changed preference, summary, actor, phone or extra appointment fields into the closed timing fixture',async t=>{
 const f=await fixture(t,'Sí, confirmo que los datos son correctos.',{timing:true});try{
  const variants=[e=>{e.syntheticPayload.slots.preference='mañana a las 10 a. m.';},e=>{e.syntheticPayload.sources.preference.text='Una respuesta sin horario';},e=>{e.syntheticPayload.summaryConfirmation.text+=' modificación';},e=>{e.syntheticPayload.summaryConfirmation.deliveredAt=new Date(Date.parse(e.syntheticPayload.sources.preference.at)-1000).toISOString();},e=>{e.syntheticPayload.customerName='Otra Persona';},e=>{e.syntheticPayload.address='Calle 10 # 20';},e=>{e.syntheticPayload.phone='573000009999';},e=>{e.syntheticPayload.quote.priceCop=1;},e=>{e.syntheticPayload.slots.tecnicoId='10000000-0000-4000-8000-000000000001';},e=>{e.syntheticPayload.slots.valorPagado=1;},e=>{e.chiefSources[0].author='573000009999';}];
  for(const change of variants){const mature=structuredClone(f.mature),e=mature.testOrderDraft.envelope;change(e);e.syntheticRequestHash=registrationHash(e.syntheticPayload);const {payloadHash,...body}=e;e.payloadHash=registrationHash(body);await assert.rejects(f.call('create',{mature}),/MATURE_CLOSED_SIMULATION_REQUIRED/);}
  assert.equal(f.calls.length,0);assert.equal(f.read(),undefined);
 }finally{f.close();}
});

test('the timing receipt must preserve requestedTiming and show empty date, start, end and technician',async t=>{
 const f=await fixture(t,'Sí, confirmo que los datos son correctos.',{timing:true});try{
  await f.call('create');for(const field of ['requestedTiming','requestedTimingSourceId','startTime','endTime']){f.setMutate((r,path)=>{if(path==='/receipt'){if(field.startsWith('requested'))r[field]='WRONG';else r.orderSnapshot[field]='09:00';}return r;});await assert.rejects(f.call('lookup'),/EXACT_RECEIPT_REQUIRED/);}
  assert.equal(f.calls.filter(x=>x.path==='').length,1);
 }finally{f.close();}
});

for(const confirmation of ['Confirmo','Sí, confirmo que los datos son correctos'])test('a mature '+confirmation+' flow uses a durable once-only test ledger and exact receipt, then an explicit soft cleanup',async t=>{
 const f=await fixture(t,confirmation);try{
  assert.equal(mariaTestOrderAccessStatus(f.c).enabled,true);assert.doesNotMatch(JSON.stringify(mariaTestOrderAccessStatus(f.c)),/SYNTHETIC_SEPARATE|token/);
  const result=await f.call('create');assert.equal(result.status,'CREATED');assert.equal(result.testBusinessWrites,'PRUEBA_PERSISTED_VERIFIED');assert.equal(result.ordinaryBusinessWrites,0);assert.equal(f.read().createAttempts,1);assert.deepEqual(f.calls.find(c=>c.path==='').body,f.mature.testOrderDraft.envelope);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
  const repeat=await f.call('create');assert.equal(repeat.status,'CREATED');assert.equal(repeat.testBusinessWrites,'NO_WRITE_REQUESTED');assert.equal(f.calls.filter(c=>c.path==='').length,1);
  const removed=await f.call('cleanup');assert.equal(removed.status,'CLEANED');assert.equal(removed.testBusinessWrites,'PRUEBA_CLEANUP_VERIFIED');assert.equal(removed.receipt.addressRemovalKind,'disabled-and-blocked-not-deleted');assert.equal(f.read().cleanupAttempts,1);await f.call('cleanup');assert.equal(f.calls.filter(c=>c.path==='/cleanup').length,1);
 }finally{f.close();}
});

test('uncertain creation is never posted again and a new native query uses exactly the same run and hash',async t=>{
 const f=await fixture(t);try{f.failCreate(true);const result=await f.call('create');assert.equal(result.status,'UNCERTAIN');assert.equal(result.testBusinessWrites,'POSSIBLE_UNVERIFIED');assert.equal(f.read().status,'UNCERTAIN');const sameHash=f.read().createRequestHash;f.failCreate(false);const query=await f.call('lookup');assert.equal(query.status,'CREATED');assert.equal(f.read().createRequestHash,sameHash);await f.call('create');assert.equal(f.calls.filter(c=>c.path==='').length,1);}finally{f.close();}
});

test('uncertain cleanup is checked without posting a second deletion request',async t=>{
 const f=await fixture(t);try{await f.call('create');f.failCleanup(true);const result=await f.call('cleanup');assert.equal(result.status,'CLEANUP_UNCERTAIN');assert.equal(f.read().cleanupAttempts,1);const again=await f.call('cleanup');assert.equal(again.status,'CLEANUP_UNCERTAIN');assert.equal(again.cleanupNotRetried,true);assert.equal(f.calls.filter(c=>c.path==='/cleanup').length,1);f.remoteState('CLEANED');assert.equal((await f.call('lookup')).status,'CLEANED');}finally{f.close();}
});

test('the durable single run can be read and cleaned after simulation memory closes without reconstructing customer messages',async t=>{
 const f=await fixture(t);try{await f.call('create');f.loseMemory();const lookup=await f.call('lookup',{noMemory:true});assert.equal(lookup.status,'CREATED');const cleanup=await f.call('cleanup',{noMemory:true});assert.equal(cleanup.status,'CLEANED');assert.equal(f.calls.filter(c=>c.path==='').length,1);}finally{f.close();}
});

test('unverified metadata prevents the write while keeping the prepared immutable ledger',async t=>{
 const f=await fixture(t);try{f.setMutate((value,path)=>path==='status'?{...value,companyId:'FOREIGN'}:value);await assert.rejects(f.call('create'),/REMOTE_SCOPE_UNVERIFIED/);assert.equal(f.read().status,'PREPARED');assert.equal(f.read().createAttempts,0);assert.equal(f.calls.filter(c=>c.path==='').length,0);}finally{f.close();}
});

test('wrong actor, fields, phone mapping or an ordinary receipt cannot certify a persisted test result',async t=>{
 const f=await fixture(t);try{f.setMutate((value,path)=>path===''?{...value,ordinaryReceiptWritten:true}:value);const result=await f.call('create');assert.equal(result.status,'UNCERTAIN');assert.equal(f.read().status,'UNCERTAIN');for(const field of ['createdById','customerName','address','phone','priceCop','technicianId','mapping']){f.setMutate((value,path)=>{if(path!=='/receipt')return value;if(field==='createdById')value.createdById='10000000-0000-4000-8000-000000000099';else if(field==='mapping')value.phoneMapping.storedPhone='573000009999';else value.orderSnapshot[field]=field==='priceCop'?1:'WRONG';return value;});await assert.rejects(f.call('lookup'),/EXACT_RECEIPT_REQUIRED/);}assert.equal(f.calls.filter(c=>c.path==='').length,1);}finally{f.close();}
});

test('pause, role expiry, missing native source, another sender or a quoted command do not attempt a test write',async t=>{
 const f=await fixture(t);try{
  for(const patch of [{enabled:true},{chiefOnly:false},{replyOnlyToChief:false},{company:'servicio-tecnico'}]){const saved={...f.c};Object.assign(f.c,patch);await assert.rejects(f.call('create'));Object.assign(f.c,saved);}
  for(const patch of [{phone:'573000009999'},{line:RED},{fromMe:true},{forwarded:true},{quotedId:'ANOTHER_MESSAGE'}])await assert.rejects(f.call('create',{patch}),/NATIVE_CHIEF_COMMAND_REQUIRED/);
  const original=f.c.mariaTestOrder;f.c.mariaTestOrder={...original,expiresAt:Date.now()};await assert.rejects(f.call('create'),/ACCESS_DISABLED_OR_EXPIRED/);f.c.mariaTestOrder=original;assert.equal(f.calls.length,0);assert.equal(f.read(),undefined);
 }finally{f.close();}
});

test('the current grant cannot reinterpret earlier simulation sources or changed literal fields as an eligible test',async t=>{
 const f=await fixture(t);try{for(const change of [draft=>{draft.testOrderDraft.envelope.syntheticPayload.customerName='Another person';},draft=>{draft.pendingOutputs=1;},draft=>{draft.commercialDeliveryVerified=true;},draft=>{draft.testOrderDraft.envelope.chiefSources[0].at='2026-10-01T00:00:00.000Z';}]){const draft=structuredClone(f.mature);change(draft);await assert.rejects(f.call('create',{mature:draft}),/MATURE_CLOSED_SIMULATION_REQUIRED/);}assert.equal(f.calls.length,0);}finally{f.close();}
});

test('a delayed old lookup cannot overwrite a newer verified cleanup',async t=>{
 const f=await fixture(t);try{
  await f.call('create');let release,entered;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const lagged=async(url,options)=>{const result=await f.fetcher(url,options);if(url.endsWith('/receipt')){entered();await gate;}return result;};
  const pending=f.call('lookup',{fetcher:lagged});await started;assert.equal((await f.call('cleanup')).status,'CLEANED');release();await assert.rejects(pending,/COMPARE_AND_SWAP_REQUIRED/);assert.equal(f.read().status,'CLEANED');assert.equal(f.calls.filter(c=>c.path==='').length,1);assert.equal(f.calls.filter(c=>c.path==='/cleanup').length,1);
 }finally{f.close();}
});

test('a configuration change during the write preserves uncertainty and a later fresh lookup does not create twice',async t=>{
 const f=await fixture(t);try{
  const changed=async(url,options)=>{const result=await f.fetcher(url,options);if(url===MARIA_TEST_ORDER_URL)f.c.enabled=true;return result;};
  const first=await f.call('create',{fetcher:changed});assert.equal(first.status,'UNCERTAIN');assert.equal(first.testBusinessWrites,'POSSIBLE_UNVERIFIED');assert.equal(first.writeAttempted,true);f.c.enabled=false;
  assert.equal((await f.call('lookup')).status,'CREATED');assert.equal(f.read().createAttempts,1);assert.equal(f.calls.filter(c=>c.path==='').length,1);
 }finally{f.c.enabled=false;f.close();}
});

test('native explicit Chief upload, lookup and cleanup use only internal replies and audit test writes separately from ordinary registration',async t=>{
 const f=await fixture(t);try{
  const engine=new Engine(f.s,f.c),transport={fetcher:f.fetcher,verifyChiefCommandSource:async source=>({verified:true,sourceId:source.id,phone:SANDRA,line:BLUE,at:source.at})};
  const dispatch=async text=>{const {source}=f.native(text);f.s.db.prepare("UPDATE events SET state='PENDING' WHERE id=?").run(source.id);await engine.process(source);await drainChiefActions(f.s,f.c,transport);return reviewChiefActions(f.s,f.c).commands.find(row=>row.sourceId===source.id);};
  const created=await dispatch('María Ángel, sube la prueba cliente');assert.equal(created.status,'DONE');assert.equal(created.result.testBusinessWrites,'PRUEBA_PERSISTED_VERIFIED');assert.match(created.result.text,/PRUEBA registrada/);assert.equal(created.result.scope,'chief-only-closed-PRUEBA-order; ordinary-orders-payments-and-scheduling-disabled');assert.equal(created.result.data.receipt.orderSnapshot.customerName,'Persona Sintética');
  const query=await dispatch('María Ángel, consulta la prueba cliente');assert.equal(query.result.testBusinessWrites,'NO_WRITE_REQUESTED');
  const cleanup=await dispatch('María Ángel, retira la prueba cliente');assert.equal(cleanup.result.testBusinessWrites,'PRUEBA_CLEANUP_VERIFIED');assert.match(cleanup.result.text,/forma lógica/);assert.match(cleanup.result.text,/dirección quedó deshabilitada y bloqueada/);assert.equal(f.calls.filter(c=>c.path==='').length,1);assert.equal(f.calls.filter(c=>c.path==='/cleanup').length,1);
  const audit=f.s.db.prepare("SELECT detail FROM audit WHERE action='CHIEF_COMMAND_RESULT' AND source=?").get(created.sourceId),record=f.s.open(audit.detail);assert.deepEqual(record.businessWrites,{ordinary:0,test:'PRUEBA_PERSISTED_VERIFIED'});assert.equal(record.testBusinessWrites,'PRUEBA_PERSISTED_VERIFIED');
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0 OR phone<>?').get(SANDRA).n,0);const state=chiefActionsStatus(f.s,f.c);assert.equal(state.businessWritesEnabled,false);assert.equal(state.ordinaryBusinessWritesEnabled,false);assert.equal(state.testBusinessWritesEnabled,true);assert.deepEqual(state.testOrderAccess,mariaTestOrderAccessStatus(f.c));assert.equal(state.testOrderAccess.startsAt,new Date(f.c.mariaTestOrder.startsAt).toISOString());assert.equal(state.testOrderAccess.expiresAt,new Date(f.c.mariaTestOrder.expiresAt).toISOString());assert.equal(state.testOrderAccess.automaticCreationRetry,false);assert.doesNotMatch(JSON.stringify(state),/SYNTHETIC_SEPARATE|SYNTHETIC_ORDINARY|"token"|"url"/);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 }finally{f.close();}
});

for(const confirmation of ['Sí','Correcto','Listo','Sí, esos datos están correctos.'])test('optional closed calendar uses the real Engine v4 '+confirmation+' draft, exact Bogotá time, no technician and one audited cleanup',async t=>{
 const f=await fixture(t,confirmation,{timing:true,calendar:true,correction:true});try{
  const e=f.mature.testOrderDraft.envelope,p=e.syntheticPayload,originalHash=e.payloadHash;
  assert.equal(f.mature.testOrderDraft.initialTestFixtureEligible,true);assert.deepEqual(p.clientSchedule,{guard:MARIA_CLIENT_SCHEDULE_GUARD});
  assert.equal(e.scenario,'cucarachas-2-rooms-requested-timing-v2');assert.equal(p.preferenceParts,undefined);
  assert.equal(p.slots.preference,'mañana a las 10 a. m.');assert.match(p.summaryConfirmation.text,/• Horario solicitado: 17\/10\/2026 a las 10:00 a\. m\./);assert.doesNotMatch(p.summaryConfirmation.text,/Registraré|sin técnico|equipo interno/);assert.doesNotMatch(p.summaryConfirmation.text,/pendiente de coordinación/);
  const status=mariaTestOrderAccessStatus(f.c);assert.deepEqual(status.clientRequestedSchedule,{enabled:true,guard:MARIA_CLIENT_SCHEDULE_GUARD,startsAt:new Date(f.c.clientRequestedSchedule.startsAt).toISOString(),expiresAt:new Date(f.c.mariaTestOrder.expiresAt).toISOString(),technicianAssignment:false});assert.doesNotMatch(status.scope,/no-scheduling/);
  const created=await f.call('create'),r=created.receipt,o=r.orderSnapshot;
  assert.equal(created.status,'CREATED');assert.equal(o.state,'PROGRAMADO');assert.equal(o.visitAt,'2026-10-17T05:00:00.000Z');assert.equal(o.startTime,'2026-10-17T15:00:00.000Z');assert.equal(o.endTime,null);assert.equal(o.technicianId,null);assert.equal(o.paidCop,0);
  assert.equal(o.confirmacionComercial,'PENDIENTE');for(const k of ['confirmacionComercialAt','confirmacionComercialPorId','confirmacionComercialOrigen','confirmacionComercialEvidencia'])assert.equal(o[k],null);
  assert.match(o.observation,/Programado sin técnico; no ejecutar/);assert.match(o.observation,/Sin técnico, pago, factura ni despacho\. PRUEBA — NO EJECUTAR/);assert.doesNotMatch(o.observation,/Sin agenda/);
  assert.equal(r.schedule.preferenceSourceId,p.sources.preference.id);assert.equal(r.schedule.preferenceSourceAt,p.sources.preference.at);assert.equal(r.schedule.summaryMid,p.summaryConfirmation.mid);assert.equal(r.schedule.acceptanceId,p.sources.acceptance.id);assert.equal(r.schedule.verifiedCurrentFields,true);
  assert.equal(r.genericReportsExcluded,false);assert.equal(r.requiresExplicitReportClassification,true);assert.equal(r.simulatedValueIsRevenue,false);assert.equal(r.realServiceExecuted,false);assert.equal(r.ordinaryReceiptWritten,false);
  assert.equal(f.read().createRequestHash,originalHash);assert.deepEqual(f.calls.find(x=>x.path==='').body,e);
  assert.equal((await f.call('lookup')).status,'CREATED');assert.equal((await f.call('cleanup')).status,'CLEANED');assert.equal((await f.call('cleanup')).status,'CLEANED');assert.equal(f.read().createRequestHash,originalHash);
  assert.equal(f.calls.filter(x=>x.path==='').length,1);assert.equal(f.calls.filter(x=>x.path==='/cleanup').length,1);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 }finally{f.close();}
});

test('calendar opt-in cannot outlive its separate grant or reuse pre-cutover sources, and disabled capability closes before preparing or fetching',async t=>{
 const f=await fixture(t,'Sí',{timing:true,calendar:true});try{
  const saved=f.c.clientRequestedSchedule,staff=f.c.staffPlanning;
  for(const change of [()=>{f.c.clientRequestedSchedule={enabled:false};},()=>{f.c.clientRequestedSchedule={...saved,guard:'OTHER'};},()=>{f.c.staffPlanning={...staff,enabled:false};},()=>{f.c.staffPlanning={...staff,mode:'assign-technician'};},()=>{f.c.clientRequestedSchedule={...saved,startsAt:f.c.mariaTestOrder.startsAt-1};},()=>{f.c.clientRequestedSchedule={...saved,startsAt:f.c.mariaTestOrder.expiresAt};}]){
   f.c.clientRequestedSchedule=saved;f.c.staffPlanning=staff;change();await assert.rejects(f.call('create'),/TEST_ORDER_CLIENT_SCHEDULE_/);assert.equal(f.read(),undefined);assert.equal(f.calls.length,0);
  }
  f.c.staffPlanning=staff;f.c.clientRequestedSchedule={...saved,startsAt:Date.parse(f.mature.testOrderDraft.envelope.chiefSources[1].at)};
  await assert.rejects(f.call('create'),/BEFORE_CUTOVER/);assert.equal(f.read(),undefined);assert.equal(f.calls.length,0);
  f.c.clientRequestedSchedule=saved;f.c.mariaTestOrder={...f.c.mariaTestOrder,expiresAt:Date.now()-1};assert.equal(mariaTestOrderAccessStatus(f.c).enabled,false);await assert.rejects(f.call('create'),/ACCESS_DISABLED_OR_EXPIRED/);assert.equal(f.calls.length,0);
 }finally{f.close();}
});

test('scheduled PRUEBA metadata requires the exact capability, cutoff, expiry, no assignment and report classification',async t=>{
 const f=await fixture(t,'Sí',{timing:true,calendar:true});try{
  for(const mutate of [r=>{r.writeScope.scheduling=false;},r=>{r.clientRequestedSchedule.guard='OTHER';},r=>{r.clientRequestedSchedule.startsAt=new Date(f.c.clientRequestedSchedule.startsAt-1).toISOString();},r=>{r.clientRequestedSchedule.expiresAt=new Date(f.c.mariaTestOrder.expiresAt+1).toISOString();},r=>{r.clientRequestedSchedule.technicianAssignment=true;},r=>{r.limits.genericReportsExcluded=true;}]){
   f.setMutate((r,path)=>{if(path==='status')mutate(r);return r;});await assert.rejects(f.call('create'),/REMOTE_SCOPE_UNVERIFIED/);assert.equal(f.read().status,'PREPARED');assert.equal(f.read().createAttempts,0);
  }
  assert.equal(f.calls.filter(x=>x.path==='').length,0);
 }finally{f.close();}
});

test('a capability disabled while metadata is awaited cannot post a scheduled PRUEBA',async t=>{
 const f=await fixture(t,'Sí',{timing:true,calendar:true});try{
  f.setMutate((r,path)=>{if(path==='status')f.c.clientRequestedSchedule={enabled:false};return r;});await assert.rejects(f.call('create'),/CLIENT_SCHEDULE_DISABLED/);assert.equal(f.read().status,'PREPARED');assert.equal(f.read().createAttempts,0);assert.equal(f.calls.filter(x=>x.path==='').length,0);
 }finally{f.close();}
});

test('recomputed hashes cannot widen the closed calendar, substitute an old summary, accept a condition or introduce separate timing sources',async t=>{
 const f=await fixture(t,'Sí, esos datos están correctos.',{timing:true,calendar:true});try{
  const variants=[e=>{e.syntheticPayload.sources.preference.phone='573000001234';},e=>{e.syntheticPayload.sources.preference.line=RED;},e=>{e.syntheticPayload.sources.preference.fromMe=true;},e=>{e.syntheticPayload.sources.preference.forwarded=true;},e=>{e.syntheticPayload.clientSchedule.guard='OTHER';},e=>{e.syntheticPayload.clientSchedule.technicianId=actorId;},e=>{e.syntheticPayload.preferenceParts={date:e.syntheticPayload.sources.preference,time:e.syntheticPayload.sources.preference};},e=>{e.syntheticPayload.summaryConfirmation.text=e.syntheticPayload.summaryConfirmation.text.replace('• Horario solicitado: ','• Preferencia solicitada: ').replace('Registraré el servicio en este horario, sin técnico asignado.','El horario sigue pendiente de coordinación.');e.syntheticPayload.summaryConfirmation.textSha256=sha(e.syntheticPayload.summaryConfirmation.text);},e=>{e.syntheticPayload.sources.acceptance.text='Sí, pero sólo si tiene garantía.';},e=>{e.syntheticPayload.sources.acceptance.text='¿Esos datos están correctos?';},e=>{e.syntheticPayload.slots.preference='mañana a las 25 a. m.';e.syntheticPayload.sources.preference.text='Prefiero mañana a las 25 a. m.';},e=>{e.syntheticPayload.slots.preference='mañana entre 9 y 10 a. m.';e.syntheticPayload.sources.preference.text='Prefiero mañana entre 9 y 10 a. m.';},e=>{e.syntheticPayload.fechaVisita='2026-10-17T05:00:00.000Z';},e=>{e.scenario='cucarachas-2-rooms';}];
  for(const mutate of variants){const m=structuredClone(f.mature),e=m.testOrderDraft.envelope;mutate(e);e.syntheticRequestHash=registrationHash(e.syntheticPayload);const {payloadHash,...body}=e;e.payloadHash=registrationHash(body);await assert.rejects(f.call('create',{mature:m}),/MATURE_CLOSED_SIMULATION_REQUIRED/);assert.equal(f.read(),undefined);}
  assert.equal(f.calls.length,0);
 }finally{f.close();}
});

test('scheduled readback rejects changed agenda, sources, summary, commercial confirmation, money and generic-report claims',async t=>{
 const f=await fixture(t,'Sí',{timing:true,calendar:true});try{
  await f.call('create');const variants=[r=>{delete r.schedule;},r=>{r.schedule.requestedDate='2026-10-18';},r=>{r.schedule.requestedTime='10:00';},r=>{r.schedule.preferenceSourceId='OTHER';},r=>{r.schedule.preferenceSourceAt='2026-10-16T00:00:00.000Z';},r=>{r.schedule.summaryMid='OTHER';},r=>{r.schedule.acceptanceId='OTHER';},r=>{r.schedule.verifiedCurrentFields=false;},r=>{r.schedule.endAt='2026-10-17T15:00:00.000Z';},r=>{r.schedule.unknown=true;},r=>{r.orderSnapshot.state='NUEVO';},r=>{r.orderSnapshot.visitAt='2026-10-18T05:00:00.000Z';},r=>{r.orderSnapshot.startTime='2026-10-17T15:00:00.000Z';},r=>{r.orderSnapshot.endTime='2026-10-17T15:00:00.000Z';},r=>{r.orderSnapshot.technicianId=actorId;},r=>{r.orderSnapshot.confirmacionComercial='CONFIRMADO';},...['confirmacionComercialAt','confirmacionComercialPorId','confirmacionComercialOrigen','confirmacionComercialEvidencia'].map(k=>r=>{r.orderSnapshot[k]='OTHER';}),r=>{delete r.orderSnapshot.confirmacionComercial;},r=>{r.orderSnapshot.paidCop=1;},r=>{r.orderSnapshot.priceCop=1;},r=>{r.genericReportsExcluded=true;},r=>{r.realServiceExecuted=true;},r=>{r.orderSnapshot.observation=r.orderSnapshot.observation.replace('Programado sin técnico; no ejecutar.','Confirmado por el cliente');}];
  for(const mutate of variants){f.setMutate((r,path)=>{if(path==='/receipt')mutate(r);return r;});await assert.rejects(f.call('lookup'),/EXACT_RECEIPT_REQUIRED/);assert.equal(f.read().status,'CREATED');}
  assert.equal(f.calls.filter(x=>x.path==='').length,1);assert.equal(f.calls.filter(x=>x.path==='/cleanup').length,0);
 }finally{f.close();}
});

test('uncertain scheduled creation remains once-only, can be resolved with capability OFF, and is cleaned without mutating its original schedule',async t=>{
 const f=await fixture(t,'Sí',{timing:true,calendar:true});try{
  const hash=f.mature.testOrderDraft.envelope.payloadHash;f.failCreate(true);assert.equal((await f.call('create')).status,'UNCERTAIN');assert.equal(f.read().createAttempts,1);
  f.failCreate(false);f.c.clientRequestedSchedule={enabled:false};assert.equal((await f.call('create')).status,'CREATED');assert.equal(f.calls.filter(x=>x.path==='').length,1);assert.equal(f.read().createRequestHash,hash);
  f.failCleanup(true);assert.equal((await f.call('cleanup')).status,'CLEANUP_UNCERTAIN');assert.equal((await f.call('cleanup')).cleanupNotRetried,true);assert.equal(f.calls.filter(x=>x.path==='/cleanup').length,1);
  f.remoteState('CLEANED');const read=await f.call('lookup');assert.equal(read.status,'CLEANED');assert.equal(read.receipt.orderSnapshot.state,'PROGRAMADO');assert.equal(read.receipt.orderSnapshot.startTime,'2026-10-17T14:00:00.000Z');assert.equal(read.receipt.orderSnapshot.technicianId,null);assert.equal(f.read().createRequestHash,hash);
 }finally{f.close();}
});

test('native Chief scheduled-test result presents the verified schedule and PRUEBA classification while other clients stay paused',async t=>{
 const f=await fixture(t,'Sí, esos datos están correctos.',{timing:true,calendar:true});try{
  const engine=new Engine(f.s,f.c),transport={fetcher:f.fetcher,verifyChiefCommandSource:async source=>({verified:true,sourceId:source.id,phone:SANDRA,line:BLUE,at:source.at})};
  const dispatch=async text=>{const {source}=f.native(text);f.s.db.prepare("UPDATE events SET state='PENDING' WHERE id=?").run(source.id);await engine.process(source);await drainChiefActions(f.s,f.c,transport);return reviewChiefActions(f.s,f.c).commands.find(row=>row.sourceId===source.id);};
  const created=await dispatch('María Ángel, sube la prueba cliente');assert.equal(created.status,'DONE');assert.match(created.result.text,/Estado: PROGRAMADO/);assert.match(created.result.text,/Horario solicitado: mañana a las 9 a\. m\./);assert.match(created.result.text,/Sin técnico, pagos ni despacho/);assert.match(created.result.text,/Confirmación comercial: PENDIENTE/);assert.match(created.result.text,/no reserva una visita real/);assert.doesNotMatch(created.result.text,/Estado: NUEVO|Sin técnico, agenda|pendiente de coordinación/);
  assert.equal(created.result.scope,'chief-only-closed-PRUEBA-order; client-requested-time-without-technician; ordinary-orders-payments-and-dispatch-disabled');assert.equal(created.result.data.receipt.genericReportsExcluded,false);
  const stranger=f.native('Quiero contratar una fumigación',{phone:'573000001234'}).source;await engine.process(stranger);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0 OR phone<>?').get(SANDRA).n,0);
  const removed=await dispatch('María Ángel, retira la prueba cliente');assert.equal(removed.result.data.status,'CLEANED');assert.match(removed.result.text,/forma lógica/);assert.equal(f.calls.filter(x=>x.path==='').length,1);assert.equal(f.calls.filter(x=>x.path==='/cleanup').length,1);
 }finally{f.close();}
});
