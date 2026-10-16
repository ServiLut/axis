// All accounts, provider evidence, HTTP responses and database rows are local
// synthetic fixtures. No real backend, provider, credential or model is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
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
function status(c){return {guard:'own-chief-authorized-test-order-v1',recordClass:'PRUEBA',testOnly:true,readOnly:true,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,actorId,username:'maria.angel.bot',company:'FUMIGACION',chief:SANDRA,line:BLUE,startsAt:new Date(c.mariaTestOrder.startsAt).toISOString(),expiresAt:new Date(c.mariaTestOrder.expiresAt).toISOString(),closedFixture:{customerName:'Persona Sintética',address:'Calle de Prueba 0 # 0',municipality:'itagui',locationDetails:'Esto es una PRUEBA. Tengo cucarachas en un apartamento de Itagüí de 2 habitaciones.',fieldsSourceText:'Nombre: Persona Sintética\nDirección: Calle de Prueba 0 # 0',slots:{service:'cucarachas',site:'apartamento',location:'itagui',rooms:'2 habitaciones'}},writeScope:{create:'one-closed-synthetic-test-order',cleanup:'own-created-soft-delete-only',ordinaryRegistration:false,scheduling:false,payments:false,dispatch:false},limits:{oneActiveRun:true,ordinarySavedAffected:false,genericReportsExcluded:false}};}
function expectedReceipt(c,e,state='CREATED'){
 const p=e.syntheticPayload,clean=state==='CLEANED';return {guard:e.guard,recordClass:'PRUEBA',ordinaryService:false,ordinaryReceiptWritten:false,testRunId:e.testRunId,requestHash:e.payloadHash,state,persisted:true,readAfterCommit:true,destination:SANDRA,tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,createdById:actorId,orderId:'10000000-0000-4000-8000-000000000001',customerId:'10000000-0000-4000-8000-000000000002',addressId:'10000000-0000-4000-8000-000000000003',originalSimulationHash:e.syntheticRequestHash,summaryDeliveryGranularity:p.summaryConfirmation?'same-simulated-MID/native-second-and-first-proof-ms':null,phoneMapping:{syntheticPhone:'570000000000',storedPhone:SANDRA,reason:'Verified chief test account; not an ordinary customer identity'},chiefSourcesHash:registrationHash(e.chiefSources),orderSnapshot:{customerName:p.customerName,phone:SANDRA,address:p.address,municipality:p.municipality,locationDetails:p.locationDetails,priceCop:129000,paidCop:0,state:'NUEVO',label,observation:[label,`Ensayo: ${e.testRunId}`,'Solicitud sintética autorizada por la jefa. NO es aceptación de un cliente ni servicio real.',`Servicio simulado: ${p.slots.service}`,`Inmueble simulado: ${p.slots.site}`,`Habitaciones simuladas: ${p.slots.rooms}`,`Municipio simulado: ${p.municipality}`,`Detalle literal simulado: ${p.locationDetails}`,'Sin agenda, técnico, pago, factura ni despacho.'].join('\n'),deletedAt:clean?new Date(Date.now()).toISOString():null,technicianId:null,visitAt:null},addressRemovalKind:clean?'disabled-and-blocked-not-deleted':'not-removed',genericReportsExcluded:false,transientGenericReportImpact:!clean,historicalGenericReportsMayIncludeTest:true,requiresExplicitReportClassification:true,simulatedValueIsRevenue:false,realServiceExecuted:false};
}
async function fixture(t,confirmation='Confirmo'){
 t.mock.timers.enable({apis:['Date'],now:clock});const c=configuration(),s=new Store(':memory:','fumigacion',randomBytes(32)),calls=[];let storedEnvelope=null,remoteState='CREATED',mutate=null,failCreate=false,failCleanup=false;
 const native=(text,patch={})=>{t.mock.timers.tick(1100);const source={id:'3EB0'+(++sequence).toString(16).toUpperCase().padStart(20,'0'),phone:SANDRA,line:BLUE,at:Date.now(),fromMe:false,forwarded:false,quotedId:null,kind:'text',text,...patch},sourceProof={guard:CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,verified:true,sourceId:source.id,phone:source.phone,line:source.line,at:source.at,textHash:sha(source.text),nativeProofHash:sha('SYNTHETIC_PROOF '+source.id)};s.enqueue(source);s.db.prepare("UPDATE events SET state='DONE' WHERE id=?").run(source.id);return {source,sourceProof};};
 const started=startChiefCustomerSimulation({...native('María Ángel, inicia prueba cliente'),authorizationId:'explicit-synthetic-chief-test-authorization'}),id=started.simulationId;
 const turn=async text=>{const input=native('María Ángel, prueba cliente: '+text),result=await runChiefCustomerSimulationTurn({simulationId:id,...input,customerText:text});for(const output of result.outputs){t.mock.timers.tick(1000);acknowledgeChiefCustomerSimulationOutput({simulationId:id,outputId:output.id,proof:{guard:CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD,verified:true,internal:true,recipient:SANDRA,line:BLUE,outboxId:output.outboxId,mid:'3EB0'+(++sequence).toString(16).toUpperCase().padStart(20,'0'),text:output.text,textHash:output.textHash,state:'DELIVERED',verifiedAt:Date.now(),nativeProofHash:sha('SYNTHETIC_DELIVERY '+output.id)}});}return result;};
 await turn('Esto es una PRUEBA. Tengo cucarachas en un apartamento de Itagüí de 2 habitaciones.');await turn('Sí');await turn('Nombre: Persona Sintética\nDirección: Calle de Prueba 0 # 0');await turn(confirmation);const mature=chiefCustomerSimulationDraft({simulationId:id});
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
