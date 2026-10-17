// Process-local presentation/Engine tests only. No provider, model or live DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,publicTextSafe} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {adviserReply,mariaOrdinaryIntakeReply} from '../automation/service-bots/adviser-tone.mjs';
import {OFFICE_RECEPTION_REFERENCE,OFFICE_RECEPTION_GUARD,officeReceptionRequestValues,formatOfficeReceptionRequests,officeReceptionDeclineText} from '../automation/service-bots/office-reception-snippets.mjs';

const pest='Qué plaga deseas tratar o si buscas prevención.',location='El municipio y barrio o vereda donde necesitas el servicio.';
const firstBody=items=>'Para ayudarte con la cotización, cuéntame:\n'+items.map(item=>'• '+item).join('\n');
const decline='Con mucho gusto. Gracias por tenernos en cuenta. Si más adelante necesitas orientación, aquí puedes escribirnos.';

test('the exact workbook reference identifies a narrow communication subset without importing pending policy or a FAQ document',()=>{
 assert.equal(OFFICE_RECEPTION_REFERENCE.sourceSha256,'26d1086c045a62cde5fe480d30c0d2f208557772133558014282577b56f24388');
 assert.equal(OFFICE_RECEPTION_REFERENCE.kind,'communication-reference-subset');
 assert.equal(OFFICE_RECEPTION_REFERENCE.importedAsApprovedCustomerAnswers,false);
 assert.equal(OFFICE_RECEPTION_REFERENCE.policyDecisionsAdopted,0);
 assert.deepEqual(OFFICE_RECEPTION_REFERENCE.selections.map(item=>item.range),['RESPUESTAS!C5:D5','RESPUESTAS!C6:D7','RESPUESTAS!C31:D31','RESPUESTAS!C61:D61']);
 assert.equal(Object.isFrozen(OFFICE_RECEPTION_REFERENCE),true);assert.equal(Object.isFrozen(OFFICE_RECEPTION_REFERENCE.selections),true);
 assert.match(OFFICE_RECEPTION_GUARD,/deterministic-reception/);
 assert.doesNotMatch(JSON.stringify(OFFICE_RECEPTION_REFERENCE),/approved_customer_answers|garantía aprobada|\/datos|PENDIENTES!/);
});

test('two selected missing fields retain the existing clear numbered text and greeting proof-compatible layout',()=>{
 const expected='Para cotizarte, cuéntame:\n1. Qué plaga deseas tratar o si buscas prevención.\n2. El municipio y barrio o vereda donde necesitas el servicio.';
 assert.equal(formatOfficeReceptionRequests([pest,location]),expected);
 const text=adviserReply('fumigacion',{reply:firstBody([pest,location]),state:{slots:{}}},{firstReply:true});
 assert.equal(text,'Hola, soy María Ángel.\n\n'+expected);assert.equal(mariaOrdinaryIntakeReply(text),true);
 assert.doesNotMatch(text,/inmueble|habitaciones|servicio confirmado|técnico|source|Excel|RESPUESTAS/);
});

test('one selected missing field stays brief and does not acquire an unrelated second question',()=>{
 const expected='Para cotizarte, cuéntame el municipio y barrio o vereda donde necesitas el servicio.';
 assert.equal(formatOfficeReceptionRequests([location]),expected);
 const text=adviserReply('fumigacion',{reply:firstBody([location]),state:{slots:{service:'cucarachas',site:'apartamento',rooms:'dos habitaciones'}}},{firstReply:true});
 assert.equal(text,'Hola, soy María Ángel.\n\n'+expected);assert.equal(mariaOrdinaryIntakeReply(text),true);
 assert.doesNotMatch(text,/plaga|inmueble|habitaciones|ya tengo|ya conservé|2\./);
});

for(const items of [null,[],[pest,pest],['Producto sin riesgo.'],['Tu nombre y documento.'],[pest,'El técnico ya va.'],[{text:pest}]])test('an unknown, duplicate or non-intake request does not get a reference-backed formatting selection: '+JSON.stringify(items),()=>{
 assert.equal(formatOfficeReceptionRequests(items),null);
});

test('the returned request-label inventory is a detached copy, not mutable runtime authority',()=>{
 const before=officeReceptionRequestValues();const copy=officeReceptionRequestValues();copy.splice(0,copy.length,'Una garantía nueva.');
 assert.deepEqual(officeReceptionRequestValues(),before);
 assert.equal(formatOfficeReceptionRequests([pest]),'Para cotizarte, cuéntame qué plaga deseas tratar o si buscas prevención.');
});

function engineFixture(){
 const at=Date.now()-60000,store=new Store(':memory:','fumigacion',randomBytes(32));
 store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:at-10000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'office-reference-unused-'+i}))};
 const engine=new Engine(store,config);let sequence=0;
 const turn=async(text)=>{
  const event={id:'OFFICE_REFERENCE_'+ ++sequence,phone:'573000007385',line:config.lines[0].phone,at:at+sequence*1000,kind:'text',fromMe:false,forwarded:false,text};
  store.enqueue(event);await engine.process(event);const row=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(event.id+':reply');
  return {text:row?store.open(row.body):null,state:store.conversation(event.phone).state};
 };
 return {store,turn};
}

test('the actual Engine does not ask again for property and rooms already supplied in the first message',async()=>{
 const f=engineFixture();try{
  const result=await f.turn('Hola, quiero fumigar un apartamento de dos habitaciones.');
  assert.equal(result.state.slots.site,'apartamento');assert.equal(result.state.slots.rooms,'dos habitaciones');
  assert.match(result.text,/\n1\. Qué plaga/);assert.match(result.text,/\n2\. El municipio/);
  assert.doesNotMatch(result.text,/tipo de inmueble|habitaciones|indicas que|necesitas atención|ya tengo/i);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(f.store.approvedCustomerAnswers().length,0);
 }finally{f.store.close();}
});

test('the actual Engine retains known pest/property/rooms and requests only the missing municipality',async()=>{
 const f=engineFixture();try{
  const result=await f.turn('Buenas tardes, tengo cucarachas en un apartamento de dos habitaciones.');
  assert.equal(result.state.slots.service,'cucarachas');assert.equal(result.state.slots.site,'apartamento');assert.equal(result.state.slots.rooms,'dos habitaciones');
  assert.match(result.text,/Para cotizarte, cuéntame el municipio y barrio o vereda/);
  assert.doesNotMatch(result.text,/qué plaga|tipo de inmueble|cuántas habitaciones|ya tengo/i);assert.equal(publicTextSafe(result.text),true);
 }finally{f.store.close();}
});

test('the selected short mattress request is formatted without reintroducing explicitly excluded furniture',async()=>{
 const item='Cuántos colchones están afectados.';
 const text=adviserReply('fumigacion',{reply:firstBody([item]),state:{slots:{service:'chinches',site:'apartamento',location:'itagui'}}},{firstReply:true});
 assert.equal(text,'Hola, soy María Ángel.\n\nPara cotizarte, cuéntame cuántos colchones están afectados.');
 assert.equal(mariaOrdinaryIntakeReply(text),true);assert.doesNotMatch(text,/muebles|habitaciones|metros|Te ayudo con|•/);
 const f=engineFixture();try{
  const result=await f.turn('Buenas tardes, quiero cotizar chinches en un apartamento de Itagüí. No hay otros muebles afectados.');
  assert.equal(result.state.slots.service,'chinches');assert.equal(result.state.slots.site,'apartamento');assert.equal(result.state.slots.location,'itagui');
  assert.match(result.text,/Para cotizarte, cuéntame cuántos colchones están afectados\./);
  assert.doesNotMatch(result.text,/bases de cama|otros muebles|habitaciones|metros|Te ayudo con|•/);
 }finally{f.store.close();}
});

test('undetected customer data never becomes a false acknowledgement or a filled slot through the formatter',async()=>{
 const f=engineFixture();try{
  const result=await f.turn('Hola, quiero cotizar, todavía no sé qué plaga es.');
  assert.equal(Boolean(result.state.slots.site),false);assert.equal(Boolean(result.state.slots.rooms),false);assert.equal(Boolean(result.state.slots.location),false);
  assert.doesNotMatch(result.text,/ya tengo|ya conservé|recibí tu nombre|tu dirección|horario solicitado/i);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.store.close();}
});

test('only the existing closed deterministic decline selects the warm workbook closure without pressure',()=>{
 const decision={reply:'Entendido, gracias por avisarme.',courtesy:true,state:{closed:true,slots:{service:'cucarachas'}}};
 const before=structuredClone(decision);assert.equal(officeReceptionDeclineText(decision),decline);assert.equal(adviserReply('fumigacion',decision),decline);
 assert.deepEqual(decision,before);assert.doesNotMatch(decline,/[?¿]|continuar|cupos?|descuento|recordatorio|garantía|eliminad/i);assert.equal(publicTextSafe(decline),true);
 for(const patch of [{courtesy:false},{state:{closed:false}},{review:true},{question:{}},{observed:true},{reply:'Con gusto.'}])assert.equal(officeReceptionDeclineText({...decision,...patch}),null);
});

test('an actual deferral and explicit service decline closes courteously without a new intake question or accepted quotation',async()=>{
 const f=engineFixture();try{
  await f.turn('Cucarachas en apartamento de dos habitaciones en Itagüí.');
  const deferred=await f.turn('Gracias, por ahora lo voy a pensar.');assert.equal(deferred.state.customerDeferral.active,true);
  const result=await f.turn('No quiero el servicio.');
  assert.equal(result.state.closed,true);assert.notEqual(result.state.quotedPrice.accepted,true);assert.equal(result.text,decline);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.store.close();}
});

test('approved text, personal registration data/summary/receipt, other companies and review results keep their exact bytes',()=>{
 const approved=firstBody([pest,location]);assert.equal(adviserReply('fumigacion',{reply:approved},{firstReply:true,approvedAnswer:true}),approved);
 for(const stage of ['name','address','details','confirm','registered']){
  const reply=stage==='registered'?'Tu solicitud quedó aceptada y registrada.\n\n• Horario solicitado: mañana a las 9 am':stage==='confirm'?'Revisa los datos de tu solicitud:\n\n• Nombre: Persona Sintética\n• Horario solicitado: mañana a las 9 am\n\n¿Confirmas que estos datos son correctos?':'Para registrar tu solicitud, compárteme:\n1. Tu nombre completo.\n2. La dirección completa del servicio.';
  assert.equal(adviserReply('fumigacion',{reply,state:{programIntake:{stage}}},{firstReply:true}),reply);
 }
 assert.equal(adviserReply('servicio-tecnico',{reply:firstBody([pest,location])},{firstReply:true}),firstBody([pest,location]));
 const pending='Con gusto. Tu solicitud de garantía quedó pendiente de revisión.';assert.doesNotMatch(adviserReply('fumigacion',{reply:pending,review:true}),/garantía aprobada|garantizamos|gratis|asignado/);
 assert.equal(adviserReply('fumigacion',{reply:'Entendido, gracias por avisarme.',courtesy:true,state:{closed:true}},{approvedAnswer:true}),'Entendido, gracias por avisarme.');
});
