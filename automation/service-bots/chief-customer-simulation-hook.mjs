import {createHash} from 'node:crypto';
import {SANDRA} from './config.mjs';
import {FUMIGACION_BLUE,operationalLineAllowed} from './line-scope.mjs';
import {canonical,staffPlanningEnabled} from './maria-program.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD,clientRequestedScheduleEnabled} from './client-requested-schedule.mjs';
import {parseChiefCustomerSimulationCommand,startChiefCustomerSimulation,runChiefCustomerSimulationTurn,finishChiefCustomerSimulation,chiefCustomerSimulationStatus,chiefCustomerSimulationDraft,acknowledgeChiefCustomerSimulationOutput,CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,CHIEF_CUSTOMER_PARTS_FIXTURE_LIMITATION} from './chief-customer-simulation.mjs';
import {parseMariaTestOrderCommand,executeMariaTestOrderAccess} from './maria-test-order-access.mjs';

export const CHIEF_CUSTOMER_SIMULATION_HOOK_GUARD='own-literal-native-chief-sandbox-with-verified-internal-delivery-v1';
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(canonical(value))).digest('hex');
function permitted(s,c,source,native){
  return c.company==='fumigacion'&&s.company==='fumigacion'&&c.enabled===false&&c.chiefOnly===true&&c.replyOnlyToChief===true&&source?.phone===SANDRA&&source.line===FUMIGACION_BLUE&&source.fromMe===false&&source.forwarded===false&&source.kind==='text'&&operationalLineAllowed(c,FUMIGACION_BLUE)&&native?.verified===true&&native.sourceId===source.id&&native.phone===SANDRA&&native.line===FUMIGACION_BLUE&&native.at===source.at;
}
function response(state,text,data={},outputs=[]){return {state,text,data,simulationOutputs:outputs,guard:CHIEF_CUSTOMER_SIMULATION_HOOK_GUARD,scope:'chief-only-process-local-synthetic-customer; no-business-or-provider-writes'};}
function sourceProof(source,native){
  // This is a hash of the exact-source verification attestation, not a claim
  // that this helper possesses the complete provider record.
  return {guard:CHIEF_CUSTOMER_SIMULATION_SOURCE_GUARD,verified:true,sourceId:source.id,phone:SANDRA,line:FUMIGACION_BLUE,at:source.at,textHash:digest(source.text),nativeProofHash:digest({verification:native,exactSource:source})};
}
async function acknowledgePrevious(s,t,status,source){
  const incoming=s.db.prepare('SELECT at,received_at FROM events WHERE id=? AND phone=? AND line=? AND from_me=0').get(source.id,SANDRA,FUMIGACION_BLUE);
  for(const output of status.pendingOutputs){
    const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(output.outboxId);
    if(!row||row.phone!==SANDRA||row.line!==FUMIGACION_BLUE||row.internal!==1||s.open(row.body)!==output.text||!['DELIVERED','READ'].includes(row.state)||!row.mid)throw Error('SIMULATION_PREVIOUS_INTERNAL_DELIVERY_UNVERIFIED');
    const meta=s.db.prepare('SELECT value FROM meta WHERE key=?').get('first-delivery:'+row.id),first=meta&&s.open(meta.value);
    if(!first||first.mid!==row.mid||first.line!==FUMIGACION_BLUE||!['DELIVERED','READ'].includes(first.state)||!Number.isSafeInteger(first.verifiedAt)||first.verifiedAt<row.created||!incoming||incoming.at!==source.at||!Number.isSafeInteger(incoming.received_at)||incoming.received_at<first.verifiedAt||source.at<Math.floor(first.verifiedAt/1000)*1000||typeof t.verifyChiefSimulationOutput!=='function')throw Error('SIMULATION_PREVIOUS_INTERNAL_DELIVERY_UNVERIFIED');
    const proof=await t.verifyChiefSimulationOutput(row,output.text,first);
    acknowledgeChiefCustomerSimulationOutput({simulationId:status.simulationId,outputId:output.id,proof});
  }
}

export async function executeChiefCustomerSimulation(s,c,t,source,plan,native){
  if(!permitted(s,c,source,native))return response('BLOCKED','Sandra, esta prueba sólo está disponible en tu chat verificado, con la atención a clientes detenida.',{reason:'SIMULATION_CHIEF_ONLY_SCOPE_REQUIRED',businessWritten:false});
  const parsed=parseChiefCustomerSimulationCommand(source.text)??parseMariaTestOrderCommand(source.text);
  if(!parsed||plan?.action!=='customer-simulation'||plan.params?.command!==parsed.action)return response('BLOCKED','Sandra, no pude identificar una instrucción literal de la prueba; no la ejecuté.',{reason:'SIMULATION_LITERAL_COMMAND_REQUIRED',businessWritten:false});
  const proof=sourceProof(source,native),status=chiefCustomerSimulationStatus();
  try{
    if(['create','lookup','cleanup'].includes(parsed.action)){
      const mature=parsed.action==='create'?chiefCustomerSimulationDraft({simulationId:status.simulationId}):null;
      if(mature?.testOrderDraft?.initialTestFixtureEligible===false&&mature.testOrderDraft.fixtureLimitation?.code===CHIEF_CUSTOMER_PARTS_FIXTURE_LIMITATION.code)return response('NEEDS_CONTEXT','SIMULACIÓN · '+CHIEF_CUSTOMER_PARTS_FIXTURE_LIMITATION.text,{status:'NOT_ELIGIBLE_FOR_CLOSED_TEST_FIXTURE',fixtureLimitation:CHIEF_CUSTOMER_PARTS_FIXTURE_LIMITATION,businessWritten:false,testBusinessWrites:0});
      const result=await executeMariaTestOrderAccess(s,c,t.fetcher,{action:parsed.action,source,sourceProof:proof,mature,simulationId:status.simulationId??null});
      const calendar=result.receipt?.schedule?.guard===MARIA_CLIENT_SCHEDULE_GUARD&&result.receipt.schedule.verifiedCurrentFields===true;
      const text=result.status==='CLEANED'?'PRUEBA retirada.\n\nLa orden y el cliente quedaron eliminados de forma lógica; la dirección quedó deshabilitada y bloqueada. Se conservó el historial auditable.':result.status==='CREATED'?'PRUEBA registrada y comprobada en Tenaxis.\n\n• Nombre: '+result.receipt.orderSnapshot.customerName+'\n• Dirección: '+result.receipt.orderSnapshot.address+'\n• Municipio: '+result.receipt.orderSnapshot.municipality+'\n• Valor simulado: $'+result.receipt.orderSnapshot.priceCop.toLocaleString('es-CO')+(result.receipt.requestedTiming?'\n• Horario solicitado: '+result.receipt.requestedTiming+(calendar?'':'\n• Horario pendiente de coordinación; sin reserva.'):'')+(calendar?'\n• Estado: PROGRAMADO.\n• Sin técnico, pagos ni despacho.\n• Confirmación comercial: PENDIENTE.\n\nEs un ensayo; no reserva una visita real ni representa una venta o un ingreso.':'\n• Estado: NUEVO.\n• Sin técnico, agenda ni pagos.\n\nEs un ensayo; no representa una venta ni un ingreso.'):'El resultado de la PRUEBA está pendiente de comprobación.\n\nNo repetí la creación ni el retiro. La siguiente consulta usará el mismo ensayo y su recibo.';
      return {...response(['CREATED','CLEANED'].includes(result.status)?'DONE':'NEEDS_CONTEXT',text,result),scope:calendar?'chief-only-closed-PRUEBA-order; client-requested-time-without-technician; ordinary-orders-payments-and-dispatch-disabled':'chief-only-closed-PRUEBA-order; ordinary-orders-payments-and-scheduling-disabled',ordinaryBusinessWrites:0,testBusinessWrites:result.testBusinessWrites};
    }
    if(parsed.action==='start'){
      const result=startChiefCustomerSimulation({source,sourceProof:proof,authorizationId:'native-chief-simulation:'+source.id,...(staffPlanningEnabled(c,source.at)?{workflowMode:'internal-staff-assignment'}:{}),...(clientRequestedScheduleEnabled(c,source.at)?{clientRequestedSchedule:true}:{})});
      return response('DONE',result.text+'\n\nPara participar, escribe: María Ángel, prueba cliente: seguido de tu mensaje como cliente.\nPara terminar: María Ángel, termina prueba cliente.',result);
    }
    if(!['ACTIVE','REVIEW'].includes(status.status))return response('NEEDS_CONTEXT','Sandra, no hay una prueba activa en la memoria de este proceso. Para empezar un ensayo nuevo, escribe: María Ángel, inicia prueba cliente.',{reason:'SIMULATION_NOT_ACTIVE_OR_LOST_AFTER_RESTART',memoryOnly:true,lostOnRestart:true,businessWritten:false});
    if(parsed.action==='finish'){
      const result=finishChiefCustomerSimulation({simulationId:status.simulationId,source,sourceProof:proof});return response('DONE',result.text,result);
    }
    await acknowledgePrevious(s,t,status,source);
    const result=await runChiefCustomerSimulationTurn({simulationId:status.simulationId,source,sourceProof:proof,customerText:parsed.customerText});
    const text=result.outputs.length?result.outputs.map(output=>output.text).join('\n\n'):result.testOrderDraft?.fixtureLimitation?'SIMULACIÓN · '+result.testOrderDraft.fixtureLimitation.text:result.testOrderDraft?'SIMULACIÓN · Datos y confirmación del ensayo recibidos.\n\nEl borrador PRUEBA está preparado. Todavía no se ha creado una orden PRUEBA en Tenaxis.':'SIMULACIÓN · El turno quedó observado. No se produjo una respuesta ni se creó una orden; este punto del ensayo requiere revisión.';
    return response('DONE',text,result,result.outputs);
  }catch(error){
    const previous=error.message==='SIMULATION_PREVIOUS_INTERNAL_DELIVERY_UNVERIFIED';
    const testAccess=['create','lookup','cleanup'].includes(parsed.action);
    return response('NEEDS_CONTEXT',previous?'Sandra, todavía no pude comprobar la entrega exacta de la respuesta anterior del ensayo. No avancé este turno; no reenvié esa respuesta.':testAccess?'Sandra, no pude comprobar el resultado de la PRUEBA con su acceso separado. No afirmaré que se creó o retiró; el mismo ensayo queda pendiente de consulta.':'Sandra, este turno de la simulación quedó pendiente de revisión. No se creó ni se modificó una orden de Tenaxis.',{reason:typeof error.message==='string'&&/^(?:SIMULATION|TEST_ORDER)_[A-Z_]+$/.test(error.message)?error.message:'SIMULATION_RESULT_UNVERIFIED',simulationId:status.simulationId??null,...(testAccess?{ordinaryBusinessWritten:false}:{businessWritten:false}),memoryOnly:!testAccess,lostOnRestart:!testAccess});
  }
}
