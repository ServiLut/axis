import {test} from 'node:test';
import assert from 'node:assert/strict';
import {literalIntakeTiming,currentIntakeTimingAcknowledgement,MARIA_INTAKE_TIMING_GUARD} from '../automation/service-bots/intake-timing.mjs';
import {adviserReply} from '../automation/service-bots/adviser-tone.mjs';
const event=text=>({id:'LOCAL_TIMING_SOURCE',at:Date.now(),kind:'text',fromMe:false,forwarded:false,text});
const state=e=>{const timing=literalIntakeTiming('fumigacion',e),key=timing.preference?'preference':'urgency';return {lastText:e.text,lastHandledSourceId:e.id,slots:{[key]:timing[key]},intakeSources:{[key]:timing.source}};};

test('ordinary requested timing survives short spelling variants and retains its current literal source',()=>{
 for(const [text,preference]of [['Para hoy porfavor','hoy'],['Para hoy por favor','hoy'],['Mañana en la tarde','Mañana en la tarde'],['Para pasado mañana en la mañana','pasado mañana en la mañana'],['Lo necesito urgente hoy','hoy'],['Hoy necesito fumigar','Hoy'],['Necesito fumigar mi apartamento. ¿Pueden venir hoy?','hoy'],['¿Tienen disponibilidad hoy?','hoy'],['Sí, para hoy','hoy']]){
  const e=event(text),timing=literalIntakeTiming('fumigacion',e);
  assert.equal(timing?.preference,preference,text);assert.deepEqual(timing.source,{sourceId:e.id,at:e.at,guard:MARIA_INTAKE_TIMING_GUARD,context:'literal-customer-preference-not-confirmed-availability'});
  assert.ok(e.text.includes(timing.preference),text);
 }
});

test('urgency without a day is separate from schedule preference and remains a current-source fact',()=>{
 for(const text of ['Lo necesito urgente','Lo necesito con urgencia','Quiero el servicio lo antes posible']){
  const e=event(text),timing=literalIntakeTiming('fumigacion',e),current=state(e);
  assert.equal(timing.preference,null);assert.ok(timing.urgency);assert.ok(e.text.includes(timing.urgency));assert.equal(timing.source.context,'literal-customer-urgency-not-confirmed-availability');
  assert.equal(current.slots.preference,undefined);assert.equal(currentIntakeTimingAcknowledgement(current),'Entiendo que lo necesitas con urgencia.');
  assert.equal(currentIntakeTimingAcknowledgement({...current,lastHandledSourceId:'LATER_SOURCE'}),null);
 }
});

test('timing rejects denied, conditional, quoted, third-party, previous-service and changed-schedule claims',()=>{
 for(const text of ['No lo necesito hoy','Si mañana pueden, lo necesito','Si, mañana si hay cupo','Tal vez para hoy','Mi vecina lo necesita urgente hoy','Mi mamá lo necesita urgente hoy','Mi amigo dijo: para hoy','"Para hoy"','«Para hoy»','Ya me agendaron para hoy','Ayer fumigaron y necesito refuerzo hoy','Quiero reprogramar para mañana','Cancela la visita de hoy','Estamos esperando que lleguen hoy','Necesito la garantía hoy','Necesito comprar gel para hoy','Para hoy o mañana','Hoy me fumigaron','Para hoy; pagué por transferencia','¿Qué hicieron hoy?','Hoy vi cucarachas; necesito fumigar','Necesito cotizar; hoy vi cucarachas','Lo necesito hoyuelo','https://example.test/para-hoy'])assert.equal(literalIntakeTiming('fumigacion',event(text)),null,text);
 for(const extra of [{fromMe:true},{forwarded:true},{kind:'audio'},{id:''},{at:NaN},{at:-1}])assert.equal(literalIntakeTiming('fumigacion',{...event('Para hoy'),...extra}),null);
 assert.equal(literalIntakeTiming('servicio-tecnico',event('Para hoy')),null);
});

test('ordinary tone acknowledges only timing supplied by the source being answered',()=>{
 const e=event('Para hoy porfavor'),current=state(e),reply='¿Qué plaga deseas tratar o buscas un servicio preventivo?';
 const first=adviserReply('fumigacion',{reply,state:current},{firstReply:true});
 assert.match(first,/^Hola, soy María Ángel\. Gracias por escribirnos 😊 Con gusto te ayudo\.\n\nEntiendo que lo necesitas hoy\./);assert.match(first,/¿Qué plaga/);assert.equal((first.match(/hoy/g)||[]).length,1);
 assert.doesNotMatch(first,/disponible|reservad|agendad|técnico|registrad|confirmad|gratis|garant/i);
 const old={...current,lastHandledSourceId:'LATER_SOURCE'};assert.equal(currentIntakeTimingAcknowledgement(old),null);
 assert.equal(adviserReply('fumigacion',{reply,state:old}),reply);
 const unsourced={...current,intakeSources:{preference:{sourceId:e.id,at:e.at}}};assert.equal(adviserReply('fumigacion',{reply,state:unsourced}),reply);
 const invented={...current,slots:{preference:'mañana'}};assert.equal(adviserReply('fumigacion',{reply,state:invented}),reply);
});

test('timing preserves literal price and keeps personal summaries and reviewed answers exact',()=>{
 const current=state(event('Lo necesito urgente hoy')),price='Con gusto. El servicio tiene un valor de $149.000 COP. ¿Deseas continuar con esta cotización?';
 const rendered=adviserReply('fumigacion',{reply:price,state:current},{firstReply:true});assert.match(rendered,/Entiendo que lo necesitas hoy/);assert.match(rendered,/\$149\.000 COP/);assert.match(rendered,/¿Deseas continuar/);
 assert.equal(adviserReply('fumigacion',{reply:price,state:current},{firstReply:true,approvedAnswer:true}),price);
 const summary='Registraré el servicio por $149.000. ¿Confirmas los datos?';assert.equal(adviserReply('fumigacion',{reply:summary,state:{...current,programIntake:{stage:'confirm'}}},{firstReply:true}),summary);
 assert.equal(adviserReply('servicio-tecnico',{reply:price,state:current},{firstReply:true}),price);
 const reviewed=adviserReply('fumigacion',{reply:'Con gusto. Tu pregunta quedó pendiente de revisión.',review:true,state:current});assert.doesNotMatch(reviewed,/lo necesitas hoy/);
});
