import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Store} from './store.mjs';
import {Engine} from './engine.mjs';
import {BUSINESSES,SANDRA,normalize} from './config.mjs';
import {approvedBusinessPriceSchedule,BUSINESS_PRICE_HASH,LEGACY_BUSINESS_PRICE_HASH} from './business-prices.mjs';
import {registrationHash,canonical} from './maria-program.mjs';
import {FUMIGACION_BLUE,FUMIGACION_RED,BLUE_ONLY_SCOPE_VERSION,BLUE_ONLY_AUTHORIZATION_SOURCE} from './line-scope.mjs';

export const CHIEF_CUSTOMER_SIMULATION_GUARD='own-native-chief-isolated-customer-engine-without-business-or-transport-v1';
export const CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD='own-exact-native-chief-source-for-customer-simulation-v1';
export const CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD='own-exact-internal-chief-simulation-output-delivery-v1';
export const CHIEF_CUSTOMER_SIMULATION_PHONE='570000000000';
const TEST_ORDER_GUARD='own-chief-authorized-test-order-v1';
const LIFETIME=2*3600000,MAX_TURNS=100;
const idPattern=/^[A-Za-z0-9_-]{8,100}$/,hashPattern=/^[a-f0-9]{64}$/;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(canonical(value))).digest('hex');
const copy=value=>JSON.parse(JSON.stringify(value));
let active=null,lastClosed=null;
// This is intentionally process-local. The chief hook must retain the native
// event and command ledger durably; this module never reads its database.
const seenSources=new Map();

// Parse only this explicit native command syntax. The suffix is preserved
// byte-for-byte; it is separate from the full source authenticated above.
export function parseChiefCustomerSimulationCommand(text){
  if(typeof text!=='string'||text.length>6000)return null;
  const control=/^María Ángel, (inicia|termina) prueba cliente\.?$/iu.exec(text);
  if(control)return {action:control[1].toLowerCase()==='inicia'?'start':'finish'};
  const prefix=/^María Ángel, prueba cliente: /iu.exec(text);
  if(!prefix)return null;
  const customerText=text.slice(prefix[0].length);
  return customerText.trim()?{action:'turn',customerText,customerTextOffset:prefix[0].length}:null;
}

function originalSource(source,proof){
  const now=Date.now();
  if(!source||source.phone!==SANDRA||source.line!==FUMIGACION_BLUE||source.fromMe!==false||source.forwarded!==false||source.kind!=='text'||!idPattern.test(source.id??'')||typeof source.text!=='string'||!source.text.trim()||source.text.length>6000||!Number.isSafeInteger(source.at)||source.at>now+1000||source.at<now-120000)throw Error('SIMULATION_NATIVE_CHIEF_SOURCE_REQUIRED');
  if(proof?.guard!==CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD||proof.verified!==true||proof.sourceId!==source.id||proof.phone!==SANDRA||proof.line!==FUMIGACION_BLUE||proof.at!==source.at||proof.textHash!==hash(source.text)||!hashPattern.test(proof.nativeProofHash??''))throw Error('SIMULATION_NATIVE_CHIEF_PROOF_REQUIRED');
  const value={id:source.id,phone:source.phone,line:source.line,at:source.at,kind:'text',fromMe:false,forwarded:false,text:source.text,quotedId:source.quotedId??null},digest=hash(value);
  const seen=seenSources.get(source.id);if(seen&&seen.hash!==digest)throw Error('SIMULATION_NATIVE_SOURCE_CONFLICT');
  return {value,hash:digest,proofHash:proof.nativeProofHash};
}
function rememberSource(source,session,action,result){
  seenSources.set(source.value.id,{hash:source.hash,simulationId:session.id,action,result:copy(result)});
  if(seenSources.size>1000)seenSources.delete(seenSources.keys().next().value);
}
function discardSessionMemory(session){
  session.store.close();session.nativeSources.clear();session.syntheticSources.clear();session.outputs.clear();session.nativeOutputMids.clear();session.preparedDraft=null;
  for(const seen of seenSources.values())if(seen.simulationId===session.id){seen.result=null;seen.closed=true;}
}
function expire(){
  if(active&&Date.now()>=active.expiresAt&&!active.busy){const old=active;active=null;discardSessionMemory(old);lastClosed={simulationId:old.id,status:'EXPIRED',closedAt:Date.now(),memoryRetained:false};}
}
function current(id){expire();if(!active||active.id!==id)throw Error('SIMULATION_UNKNOWN_AFTER_RESTART_OR_NOT_STARTED');return active;}
function sourceReceipt(source){return {id:source.value.id,line:FUMIGACION_BLUE,at:new Date(source.value.at).toISOString(),author:SANDRA,textHash:hash(source.value.text),nativeProofHash:source.proofHash,fromMe:false,forwarded:false};}
function simulationConfig(at,expiresAt,workflowMode){
  // Construct from literals. In particular, never spread the live config or
  // pass a token, URL, provider, transport, model, grant or native cache here.
  return {company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:false,replyOnlyToChief:true,activatedAt:at,lines:[{phone:FUMIGACION_BLUE,instance:'simulation-blue-not-a-provider'},{phone:FUMIGACION_RED,instance:'simulation-red-never-used'}],operationalLineScope:{company:'fumigacion',version:BLUE_ONLY_SCOPE_VERSION,authorizationSource:BLUE_ONLY_AUTHORIZATION_SOURCE,activeLines:[FUMIGACION_BLUE],suspendedLines:[FUMIGACION_RED],authorizedAt:new Date(at).toISOString()},conversationalAi:{ready:false},tesaOperations:{enabled:false},mariaProgram:{enabled:true,startsAt:at,expiresAt,actorId:'00000000-0000-4000-8000-000000000000'},...(workflowMode==='internal-staff-assignment'?{staffPlanning:{enabled:true,mode:'internal-staff-assignment',startsAt:at}}:{})};
}
function common(session){return {guard:CHIEF_CUSTOMER_SIMULATION_GUARD,simulationId:session.id,testRunId:session.testRunId,synthetic:true,realRecipient:SANDRA,line:FUMIGACION_BLUE,syntheticCustomerPhone:CHIEF_CUSTOMER_SIMULATION_PHONE,commercialDeliveryVerified:false,ordinaryCustomerAcceptanceVerified:false,businessWrites:0,providerCalls:0,modelCalls:0,memoryOnly:true,lostOnRestart:true,...(session.workflowMode?{workflowMode:session.workflowMode}:{})};}

export function startChiefCustomerSimulation({source,sourceProof,authorizationId,workflowMode}={}){
  if(workflowMode!==undefined&&workflowMode!=='internal-staff-assignment')throw Error('SIMULATION_WORKFLOW_MODE_UNSUPPORTED');
  expire();const checked=originalSource(source,sourceProof),seen=seenSources.get(source.id);
  if(seen){if(seen.closed||!active||active.id!==seen.simulationId)throw Error('SIMULATION_OLD_START_NOT_REPLAYED');if(seen.action!=='start')throw Error('SIMULATION_NATIVE_SOURCE_ALREADY_USED');return {...copy(seen.result),created:false};}
  if(typeof authorizationId!=='string'||!/^[A-Za-z0-9:_-]{8,180}$/.test(authorizationId))throw Error('SIMULATION_EXPLICIT_AUTHORIZATION_REFERENCE_REQUIRED');
  if(source.quotedId)throw Error('SIMULATION_START_MUST_BE_DIRECT');
  if(parseChiefCustomerSimulationCommand(source.text)?.action!=='start')throw Error('SIMULATION_EXPLICIT_START_COMMAND_REQUIRED');
  if(active)throw Error('SIMULATION_ALREADY_ACTIVE');
  const startedAt=Date.now(),id=randomUUID(),expiresAt=startedAt+LIFETIME,store=new Store(':memory:','fumigacion',randomBytes(32));
  try{
    for(const scheduleHash of [LEGACY_BUSINESS_PRICE_HASH,BUSINESS_PRICE_HASH])store.importKnowledge(approvedBusinessPriceSchedule(scheduleHash));
    const config=simulationConfig(source.at,expiresAt,workflowMode),session={id,testRunId:randomUUID(),authorizationId,startedAt,sourceStartedAt:source.at,expiresAt,workflowMode,store,engine:new Engine(store,config),nativeSources:new Map([[source.id,checked]]),syntheticSources:new Map(),outputs:new Map(),nativeOutputMids:new Map(),turns:0,busy:false};
    active=session;
    const result={...common(session),created:true,status:'STARTED',expiresAt:new Date(expiresAt).toISOString(),text:'SIMULACIÓN · Atención como cliente\n\nEl ensayo está iniciado. Los datos, cotizaciones y confirmaciones de este recorrido pertenecen a una prueba; todavía no se ha creado una orden PRUEBA en Tenaxis.'};
    rememberSource(checked,session,'start',result);return result;
  }catch(error){store.close();active=null;throw error;}
}

function captureOutputs(session,source){
  const outputs=[];
  for(const row of session.store.db.prepare("SELECT * FROM outbox WHERE state='READY' ORDER BY rowid").all()){
    if([...session.outputs.values()].some(output=>output.memoryOutboxId===row.id))continue;
    const originalText=session.store.open(row.body);if(typeof originalText!=='string')throw Error('SIMULATION_TEXT_OUTPUT_REQUIRED');
    const outputId='SIM_OUTPUT_'+hash({simulationId:session.id,id:row.id,text:originalText}).slice(0,48),kind=row.internal?'internal-question':'customer-reply';
    const text='SIMULACIÓN · '+(row.internal?'Consulta interna de prueba; no enviada a TESA':'Respuesta como cliente')+'\n\n'+originalText;
    const outboxId='chief-simulation:'+session.id+':'+outputId;
    const output={id:outputId,outboxId,simulationId:session.id,sourceId:source.value.id,kind,text,textHash:hash(text),recipient:SANDRA,line:FUMIGACION_BLUE,internal:true,synthetic:true,commercialDeliveryVerified:false,simulatedDeliveryAcknowledged:false};
    session.outputs.set(outputId,{...output,memoryOutboxId:row.id,memoryCreatedAt:row.created,memoryText:originalText,proof:null});outputs.push(output);
  }
  return outputs;
}
function registrationDraft(session){
  if(session.preparedDraft)return copy(session.preparedDraft);
  const entries=session.store.db.prepare("SELECT value FROM meta WHERE key LIKE 'maria-registration:%'").all().map(row=>session.store.open(row.value));
  if(!entries.length)return null;
  if(entries.length!==1||entries[0].status!=='PENDING'||entries[0].requestHash!==registrationHash(entries[0].payload))throw Error('SIMULATION_SINGLE_DRAFT_SCOPE_REQUIRED');
  const payload=entries[0].payload;if(payload.phone!==CHIEF_CUSTOMER_SIMULATION_PHONE||payload.line!==FUMIGACION_BLUE)throw Error('SIMULATION_SYNTHETIC_PHONE_REQUIRED');
  const nativeId=id=>{const ref=session.syntheticSources.get(id);if(!ref)throw Error('SIMULATION_DRAFT_SOURCE_MAP_REQUIRED');return ref.value.id;};
  const fieldSourceMap={customerName:nativeId(payload.sources.customerName.id),address:nativeId(payload.sources.address.id),acceptance:nativeId(payload.sources.acceptance.id),quote:nativeId(payload.quote.sourceId)};
  if(Object.hasOwn(payload.sources,'preference'))fieldSourceMap.preference=nativeId(payload.sources.preference.id);
  for(const id of [payload.sourceId,payload.quote.acceptanceId,...Object.values(payload.sources).map(ref=>ref.id).filter(Boolean)])nativeId(id);
  const sourceMap=[...session.syntheticSources].map(([syntheticSourceId,source])=>({syntheticSourceId,chiefSourceId:source.value.id,nativeTextHash:hash(source.value.text),customerTextHash:source.customerTextHash,customerTextOffset:source.customerTextOffset})),chiefSources=[...session.nativeSources.values()].map(sourceReceipt);
  const simulatedDeliveries=[...session.outputs.values()].filter(output=>output.proof).map(output=>({synthetic:true,mid:output.syntheticMid,at:new Date(Math.floor(output.proof.verifiedAt/1000)*1000).toISOString(),state:'DELIVERED'}));
  const eligible=!Object.hasOwn(payload.sources,'preference')&&normalize(payload.slots.service)==='cucarachas'&&normalize(payload.slots.site)==='apartamento'&&/^2\b/.test(normalize(payload.slots.rooms))&&normalize(payload.municipality)==='itagui'&&payload.quote.priceCop===129000&&payload.quote.scheduleHash===BUSINESS_PRICE_HASH&&chiefSources.length<=20&&sourceMap.length<=20&&simulatedDeliveries.length<=10;
  const draft={guard:TEST_ORDER_GUARD,testRunId:session.testRunId,source:'chief-authorized-test',simulationId:session.id,synthetic:true,scenario:'cucarachas-2-rooms',syntheticPayload:copy(payload),syntheticRequestHash:registrationHash(payload),chiefSources,sourceMap,simulatedDeliveries};
  session.preparedDraft={initialTestFixtureEligible:eligible,envelope:{...draft,payloadHash:hash(draft)},fieldSourceMap,realInternalReceipts:[...session.outputs.values()].filter(output=>output.proof).map(output=>({outputId:output.id,realInternalReceipt:copy(output.proof),commercialDeliveryVerified:false}))};
  return copy(session.preparedDraft);
}

export async function runChiefCustomerSimulationTurn({simulationId,source,sourceProof,customerText}={}){
  const session=current(simulationId),checked=originalSource(source,sourceProof),seen=seenSources.get(source.id);
  const parsed=parseChiefCustomerSimulationCommand(source.text);
  if(parsed?.action!=='turn'||customerText!==parsed.customerText)throw Error('SIMULATION_LITERAL_CUSTOMER_TEXT_REQUIRED');
  if(seen){if(seen.simulationId!==session.id||seen.action!=='turn')throw Error('SIMULATION_NATIVE_SOURCE_ALREADY_USED');return {...copy(seen.result),created:false};}
  if(session.busy)throw Error('SIMULATION_BUSY');if(session.faulted)throw Error('SIMULATION_REVIEW_AFTER_PROCESSING_FAILURE');if(session.turns>=MAX_TURNS)throw Error('SIMULATION_TURN_LIMIT');
  if(source.at<session.sourceStartedAt)throw Error('SIMULATION_OLD_SOURCE_NOT_REPLAYED');
  let quotedId=null;
  if(source.quotedId){const output=session.nativeOutputMids.get(source.quotedId);if(!output?.proof)throw Error('SIMULATION_UNLINKED_REPLY');quotedId=output.syntheticMid;}
  const syntheticId='SIM_'+hash({simulationId:session.id,sourceId:source.id}),event={id:syntheticId,phone:CHIEF_CUSTOMER_SIMULATION_PHONE,line:FUMIGACION_BLUE,at:source.at,kind:'text',fromMe:false,forwarded:false,quotedId,text:customerText,simulation:true};
  session.busy=true;
  try{
    session.nativeSources.set(source.id,checked);session.syntheticSources.set(syntheticId,{...checked,customerTextHash:hash(customerText),customerTextOffset:parsed.customerTextOffset});session.store.enqueue(event);await session.engine.process(event);session.turns++;
    const outputs=captureOutputs(session,checked),draft=registrationDraft(session),state=session.store.conversation(CHIEF_CUSTOMER_SIMULATION_PHONE).state;
    const result={...common(session),created:true,status:draft?'DRAFT_PREPARED':'IN_PROGRESS',sourceId:source.id,syntheticSourceId:syntheticId,processingState:session.store.db.prepare('SELECT state FROM events WHERE id=?').get(syntheticId).state,outputs,phase:state.programIntake?.stage??(state.quotedPrice?'quotation':'intake'),testOrderDraft:draft};
    rememberSource(checked,session,'turn',result);return copy(result);
  }catch(error){session.faulted=true;rememberSource(checked,session,'failed',{...common(session),status:'REVIEW',error:'SIMULATION_PROCESSING_UNCERTAIN'});throw error;}finally{session.busy=false;}
}

export function acknowledgeChiefCustomerSimulationOutput({simulationId,outputId,proof}={}){
  const session=current(simulationId);if(session.busy)throw Error('SIMULATION_BUSY');
  const output=session.outputs.get(outputId);
  if(!output||proof?.guard!==CHIEF_CUSTOMER_SIMULATION_DELIVERY_GUARD||proof.verified!==true||proof.internal!==true||proof.recipient!==SANDRA||proof.line!==FUMIGACION_BLUE||proof.outboxId!==output.outboxId||!idPattern.test(proof.mid??'')||/^SIM_/i.test(proof.mid)||proof.text!==output.text||proof.textHash!==output.textHash||!['DELIVERED','READ'].includes(proof.state)||!Number.isSafeInteger(proof.verifiedAt)||proof.verifiedAt<output.memoryCreatedAt||proof.verifiedAt>Date.now()||!hashPattern.test(proof.nativeProofHash??''))throw Error('SIMULATION_EXACT_INTERNAL_DELIVERY_REQUIRED');
  if(output.proof){if(output.proof.mid!==proof.mid||output.proof.textHash!==proof.textHash||output.proof.outboxId!==proof.outboxId)throw Error('SIMULATION_DELIVERY_SOURCE_CONFLICT');return {...common(session),outputId,acknowledged:true,created:false,simulatedDelivery:true};}
  const mid='SIM_'+hash({simulationId:session.id,outputId}),row=session.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(output.memoryOutboxId);
  if(!row||row.state!=='READY'||session.store.open(row.body)!==output.memoryText)throw Error('SIMULATION_MEMORY_OUTPUT_CHANGED');
  session.store.db.prepare("UPDATE outbox SET state='ACCEPTED',mid=? WHERE id=? AND state='READY'").run(mid,row.id);
  session.store.delivery(mid,FUMIGACION_BLUE,'DELIVERED');
  session.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(session.store.seal({verifiedAt:proof.verifiedAt,mid,line:FUMIGACION_BLUE,state:'DELIVERED',simulation:true,commercialDeliveryVerified:false}),'first-delivery:'+row.id);
  output.proof=copy(proof);output.syntheticMid=mid;output.simulatedDeliveryAcknowledged=true;session.nativeOutputMids.set(proof.mid,output);
  return {...common(session),outputId,acknowledged:true,created:true,simulatedDelivery:true};
}

export function chiefCustomerSimulationStatus({simulationId}={}){
  expire();if(!active||simulationId&&active.id!==simulationId)return {guard:CHIEF_CUSTOMER_SIMULATION_GUARD,status:simulationId&&lastClosed?.simulationId===simulationId?lastClosed.status:'NOT_ACTIVE_OR_LOST_AFTER_RESTART',memoryOnly:true,lostOnRestart:true,memoryRetained:false};
  return {...common(active),status:active.faulted?'REVIEW':'ACTIVE',startedAt:new Date(active.startedAt).toISOString(),expiresAt:new Date(active.expiresAt).toISOString(),turns:active.turns,outputs:active.outputs.size,acknowledgedOutputs:[...active.outputs.values()].filter(output=>output.proof).length,busy:active.busy,pendingOutputs:[...active.outputs.values()].filter(output=>!output.proof).map(({memoryOutboxId,memoryCreatedAt,memoryText,proof,syntheticMid,...output})=>copy(output))};
}
export function chiefCustomerSimulationDraft({simulationId}={}){
  const session=current(simulationId);if(session.busy||session.faulted||!session.preparedDraft)throw Error('SIMULATION_MATURE_DRAFT_REQUIRED');
  return {...common(session),pendingOutputs:[...session.outputs.values()].filter(output=>!output.proof).length,testOrderDraft:copy(session.preparedDraft)};
}
export function finishChiefCustomerSimulation({simulationId,source,sourceProof}={}){
  const session=current(simulationId),checked=originalSource(source,sourceProof);if(session.busy)throw Error('SIMULATION_BUSY');
  if(source.quotedId||parseChiefCustomerSimulationCommand(source.text)?.action!=='finish')throw Error('SIMULATION_EXPLICIT_FINISH_COMMAND_REQUIRED');
  const seen=seenSources.get(source.id);if(seen)throw Error('SIMULATION_NATIVE_SOURCE_ALREADY_USED');
  const result={...common(session),status:'FINISHED',memoryRetained:false,text:'SIMULACIÓN finalizada. Se cerró únicamente la memoria del ensayo; no se retiró ni se modificó ninguna orden de Tenaxis.'};
  rememberSource(checked,session,'finish',result);discardSessionMemory(session);active=null;lastClosed={simulationId:session.id,status:'FINISHED',closedAt:Date.now(),memoryRetained:false};return result;
}
