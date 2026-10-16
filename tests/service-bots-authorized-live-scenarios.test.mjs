import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING,SANDRA,HILARY} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {registrationStatus} from '../automation/service-bots/maria-program.mjs';
import {TESA_GROUP_JID,TESA_GROUP_SUBJECT} from '../automation/service-bots/tesa-config.mjs';
import {initializeTesaStore,prepareTesaQuestion,bindTesaQuestionDelivery,acceptTesaQuotedAnswer,tesaCaseAnswers} from '../automation/service-bots/tesa-operations.mjs';

// Independent literal engine scenarios. Every phone, source, transport proof and
// store here is synthetic. No network, model, live message or business write.
const PHONE='573000007321';
function fixture(){
 const start=Math.floor((Date.now()-120000)/1000)*1000,s=new Store(':memory:','fumigacion',randomBytes(32));
 s.importKnowledge(approvedBusinessPriceSchedule());
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:start-1000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-authorized-'+i})),mariaProgram:{enabled:true,url:'https://invalid.example/integrations/maria-service-registration',token:'local-only-token-no-external-access',actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-1000,expiresAt:start+86400000}};
 const engine=new Engine(s,c);let seq=0;
 const read=e=>{const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');return {e,row,text:row?s.open(row.body):null,state:s.conversation(PHONE).state,eventState:s.db.prepare('SELECT state FROM events WHERE id=?').get(e.id)?.state};};
 const process=async e=>{await engine.process(e);return read(e);};
 const turn=async(text,extra={})=>{const e={id:'ISOLATED_BROAD_'+ ++seq,phone:PHONE,line:c.lines[0].phone,at:start+seq*1000,kind:'text',fromMe:false,forwarded:false,text,...extra};s.enqueue(e);return process(e);};
 const deliver=r=>{assert.ok(r.row,r.e.text);const mid='SYNTHETIC_MID_'+r.e.id;s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.row.id);s.recordFirstBotReply({...r.row,mid},mid,c.bot,r.e.at);s.delivery(mid,r.e.line,'DELIVERED');s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({verifiedAt:r.e.at,mid,line:r.e.line,state:'DELIVERED'}),'first-delivery:'+r.row.id);};
 return {s,c,engine,turn,process,read,deliver};
}
const completeQuote='Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta?';
const noBusiness=f=>{const status=registrationStatus(f.c,f.s);assert.equal(status.saved,0);assert.equal(status.prepared,0);};
const withFixture=fn=>async()=>{const f=fixture();try{await fn(f);}finally{f.s.close();}};

test('complete literal request answers a sourced price without repeating known quote fields',withFixture(async f=>{
 const r=await f.turn(completeQuote);assert.match(r.text,/149\.000/);assert.doesNotMatch(r.text,/qué plaga|tipo de inmueble|cuántas habitaciones|municipio y barrio/i);assert.equal(r.state.quotedPrice.priceCop,149000);noBusiness(f);
}));
test('fragmented literal request retains four source identities and asks only the missing field',withFixture(async f=>{
 await f.turn('Buenas tardes');const pest=await f.turn('Cucarachas');const city=await f.turn('Medellín');const site=await f.turn('Apartamento');const size=await f.turn('60 m²');
 assert.match(size.text,/149\.000/);for(const [key,r] of [['service',pest],['location',city],['site',site],['area',size]])assert.equal(size.state.intakeSources[key].sourceId,r.e.id,key);assert.doesNotMatch(site.text,/qué plaga|municipio|tipo de inmueble/i);noBusiness(f);
}));
for(const [correction,key,value] of [['Me equivoqué, son 42 m²','area','42 m²'],['Corrijo: es en Itagüí','location','itagui'],['No es apartamento, es una casa','site','casa']])test('a quote correction replaces only the corrected field: '+correction,withFixture(async f=>{
 const quote=await f.turn(completeQuote);f.deliver(quote);const r=await f.turn(correction);assert.equal(r.state.slots[key],value);assert.equal(r.state.intakeSources[key].sourceId,r.e.id);assert.equal(r.state.slots.service,'cucarachas');assert.notEqual(r.state.quotedPrice?.accepted,true);noBusiness(f);
}));
test('an explicit pest correction does not keep the negated pest as a second service',withFixture(async f=>{
 const quote=await f.turn(completeQuote);f.deliver(quote);const r=await f.turn('Me equivoqué: no son cucarachas, son hormigas');assert.equal(r.state.slots.service,'hormigas');assert.equal(r.state.intakeSources.service.sourceId,r.e.id);assert.doesNotMatch(r.text||'',/cucarachas y hormigas/);noBusiness(f);
}));
for(const text of ['Gracias','Muchas gracias','Lo voy a pensar','Déjame consultar con mi esposo','Por ahora solo quería saber el precio'])test('nonacceptance never starts registration: '+text,withFixture(async f=>{
 const q=await f.turn(completeQuote);f.deliver(q);const r=await f.turn(text);assert.notEqual(r.state.quotedPrice?.accepted,true);assert.equal(r.state.programIntake,undefined);assert.doesNotMatch(r.text||'',/quedó registrad|quedó agendad|técnico confirmado/i);noBusiness(f);
}));
test('a bare yes after quotation validity is not service acceptance',withFixture(async f=>{
 const first=await f.turn('¿Sigue vigente una cotización anterior?');f.deliver(first);const r=await f.turn('Sí');assert.match(r.text,/cotización sigue vigente/);assert.equal(r.state.quotedPrice,undefined);assert.equal(r.state.programIntake,undefined);noBusiness(f);
}));
for(const preference of ['Para mañana en la tarde','Para hoy por favor','Lo necesito urgente'])test('requested timing is not an agreed appointment: '+preference,withFixture(async f=>{
 const q=await f.turn(completeQuote);f.deliver(q);const r=await f.turn(preference);assert.notEqual(r.state.quotedPrice?.accepted,true);assert.equal(r.state.programIntake,undefined);assert.doesNotMatch(r.text||'',/técnico confirmado|quedó agendad|quedó programad|reservad/i);noBusiness(f);
}));
test('incidental pet presence keeps normal quote intake and a sourced note',withFixture(async f=>{
 const r=await f.turn(completeQuote+' Tengo dos mascotas.');assert.match(r.text,/149\.000/);assert.equal(r.state.receptionNotes.incidentalPets[0].sourceId,r.e.id);assert.doesNotMatch(r.text,/sin riesgo|inofensiv|se pueden quedar/i);noBusiness(f);
}));
test('a pet safety question preserves quote history and does not invent a safety assurance',withFixture(async f=>{
 const q=await f.turn(completeQuote);f.deliver(q);const r=await f.turn('¿Mis mascotas pueden quedarse durante la fumigación?');assert.equal(r.eventState,'REVIEW');assert.equal(r.state.quotedPrice.priceCop,149000);assert.doesNotMatch(r.text||'',/es seguro|sin riesgo|pueden quedarse|inofensiv/i);noBusiness(f);
}));
for(const text of ['No sé cuánto mide','Entre 40 y 80 m²','Son como dos o tres habitaciones'])test('uncertain size cannot become a definite billable size: '+text,withFixture(async f=>{
 await f.turn('Cucarachas en un apartamento de Medellín');const r=await f.turn(text);assert.equal(r.state.quotedPrice,undefined);assert.doesNotMatch(r.text||'',/\$149\.000|\$129\.000/);noBusiness(f);
}));
test('the same native incoming ID cannot create a second reply or reprocess conversation state',withFixture(async f=>{
 const r=await f.turn(completeQuote),before=f.s.conversation(PHONE),count=f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;await f.process(r.e);assert.deepEqual(f.s.conversation(PHONE),before);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,count);noBusiness(f);
}));
test('a human message pauses the customer conversation and later customer facts do not release it',withFixture(async f=>{
 await f.turn(completeQuote);await f.turn('Buenas tardes, te atiende una asesora',{fromMe:true});const r=await f.turn('Mi nombre es Persona Sintética, la dirección es Calle 50 # 42-18');assert.equal(r.row,undefined);assert.equal(f.s.conversation(PHONE).hold,1);noBusiness(f);
}));
test('a new ordinary service request clears old quote scope while preserving historical sources',withFixture(async f=>{
 const q=await f.turn(completeQuote);f.deliver(q);const r=await f.turn('Necesito una nueva cotización para otro servicio: chinches en un colchón de una casa en Itagüí');assert.notEqual(r.state.caseId,q.state.caseId);assert.equal(r.state.slots.service,'chinches');assert.equal(r.state.slots.area,undefined);assert.equal(r.state.quotedPrice.priceCop,99000);assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(q.e.id).body).text,completeQuote);noBusiness(f);
}));
test('an unread audio does not become accepted customer facts or a registered order',withFixture(async f=>{
 const q=await f.turn(completeQuote);f.deliver(q);const r=await f.turn('',{kind:'audio',media:{mime:'audio/ogg'}});assert.match(r.text||'',/contenido aún necesita revisión/);assert.doesNotMatch(r.text||'',/escuché|transcrib|confirmado|quedó registrad|quedó agendad/);assert.notEqual(r.state.quotedPrice?.accepted,true);assert.equal(r.state.programIntake,undefined);assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(r.e.id).body).kind,'audio');noBusiness(f);
}));
test('an unbacked saved marker cannot certify registration or schedule a customer',withFixture(async f=>{
 const r=await f.turn(completeQuote);f.deliver(r);f.s.saveConversation(PHONE,{...r.state,programServiceId:'85c47fc8-5314-4f68-a8d6-dde112640f5d',programIntake:{stage:'registered'}});const result=await f.turn('¿Ya quedó agendado?');assert.doesNotMatch(result.text||'',/ya quedó agendad|técnico confirmado|quedó programad/i);assert.equal(registrationStatus(f.c,f.s).saved,0);
}));

for(const text of ['Casa o apartamento en Medellín, tengo cucarachas, 60 m²','No es casa ni apartamento, todavía no sé el inmueble. Cucarachas en Medellín, 60 m²','Puede ser en Medellín o en Itagüí. Cucarachas en apartamento de 60 m²'])test('contradictory property or municipality asks clarification without a firm quote: '+text,withFixture(async f=>{
 const r=await f.turn(text);assert.equal(r.state.quotedPrice,undefined);assert.doesNotMatch(r.text||'',/\$\d/);noBusiness(f);
}));
for(const size of ['40 o 80 m²','Entre 40 y 80 metros cuadrados','No sé si son 40 m² o 80 m²','De 40 a 80 m²','60-80 m²'])test('a size alternative or range cannot select one endpoint: '+size,withFixture(async f=>{
 await f.turn('Cucarachas en un apartamento de Medellín');const r=await f.turn(size);assert.equal(r.state.quotedPrice,undefined);assert.doesNotMatch(r.text||'',/\$\d/);noBusiness(f);
}));
for(const text of ['Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta? Tengo mascotas.','Tengo cucarachas en apartamento de 60 m² en Medellín. ¿Qué precio tiene? Hay mascotas.','Hola, tengo mascotas. ¿Cuánto cuesta fumigar cucarachas en un apartamento de 60 m² en Medellín?'])test('commercial question and incidental pets survive ordinary sentence order: '+text,withFixture(async f=>{
 const r=await f.turn(text);assert.match(r.text,/149\.000/);assert.equal(r.state.receptionNotes.incidentalPets[0].sourceId,r.e.id);assert.doesNotMatch(r.text,/sin riesgo|inofensiv|pueden quedarse/i);noBusiness(f);
}));
test('clearly supplied complete name and address remain separate literal registration fields',withFixture(async f=>{
 const q=await f.turn(completeQuote);f.deliver(q);const accept=await f.turn('Sí, quiero el servicio');f.deliver(accept);const r=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');assert.match(r.text,/149\.000/);assert.match(r.text,/Persona Sintética/);assert.match(r.text,/Calle 50 # 42-18 apartamento 301/);assert.match(r.text,/confirm/i);assert.equal(r.state.programIntake.stage,'confirm');assert.equal(registrationStatus(f.c,f.s).saved,0);assert.equal(registrationStatus(f.c,f.s).prepared,0);
}));
test('a later name correction needs another real confirmation and preserves the previous raw source',withFixture(async f=>{
 const q=await f.turn(completeQuote);f.deliver(q);const a=await f.turn('Sí');f.deliver(a);const facts=await f.turn('Nombre: Persona Sintética\nDirección: Calle 50 # 42-18 apartamento 301');f.deliver(facts);const r=await f.turn('Corrijo el nombre: Valentina Prueba Integral');assert.notEqual(r.state.programIntake.stage,'registered');assert.equal(registrationStatus(f.c,f.s).saved,0);assert.equal(registrationStatus(f.c,f.s).prepared,0);assert.equal(f.s.open(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(facts.e.id).body).text,facts.e.text);assert.match(r.text||'',/confirm|nombre/i);
}));

for(const text of ['Entre 40 y 80 m²','40 o 80 m²','No sé si es casa o apartamento','No es apartamento','No son cucarachas'])test('a later contradiction invalidates an earlier ordinary quote rather than silently retaining it: '+text,withFixture(async f=>{
 const q=await f.turn(completeQuote);f.deliver(q);const r=await f.turn(text);assert.equal(r.state.quotedPrice,undefined);assert.doesNotMatch(r.text||'',/\$\d|registrad|agendad/);assert.equal(r.state.programIntake,undefined);noBusiness(f);
}));
for(const [text,key,value]of [['No son 60 m², son 42 m²','area','42 m²'],['No son tres habitaciones, son dos habitaciones','rooms','dos habitaciones'],['No es un colchón, son dos colchones','mattresses','dos colchones'],['La medida es 42,5 m²','area','42,5 m²'],['La medida es 42.5 m²','area','42.5 m²']])test('rejected counts and decimal punctuation preserve only the asserted literal measure: '+text,()=>{
 assert.equal(extractSlots(text,'fumigacion')[key],value);
});
test('uncertainty about size or availability does not erase known pest and property',()=>{
 const unknownSize=extractSlots('Tengo cucarachas en un apartamento de no sé cuántos metros','fumigacion');assert.equal(unknownSize.service,'cucarachas');assert.equal(unknownSize.site,'apartamento');assert.equal(unknownSize.area,undefined);
 const unknownAgenda=extractSlots('Tengo cucarachas en apartamento de 40 m² en Medellín y no sé si tienen agenda','fumigacion');assert.equal(unknownAgenda.service,'cucarachas');assert.equal(unknownAgenda.site,'apartamento');assert.equal(unknownAgenda.area,'40 m²');assert.equal(unknownAgenda.location,'medellin');
 assert.equal(extractSlots('No son 60 m² sino 42 m²','fumigacion').area,'42 m²');
});
test('a denied patio or uncertain pest quantity does not deny the named property or pest',()=>{
 assert.equal(extractSlots('Mi apartamento no tiene patio. Hay cucarachas en Medellín, son 60 m²','fumigacion').site,'apartamento');
 assert.equal(extractSlots('Cucarachas no sé cuántas hay, es un apartamento en Medellín','fumigacion').service,'cucarachas');
});

function tesaFixture(){
 const f=fixture(),now=Date.now(),human='573012993828',members=[...f.c.phones,SANDRA,HILARY,human];initializeTesaStore(f.s);
 f.c.tesaOperations={enabled:true,groupJid:TESA_GROUP_JID,groupSubject:TESA_GROUP_SUBJECT,senderLine:f.c.lines[0].phone,activatedAt:now-30000,allowedParticipantPhones:[human],verifiedMembership:{owner:f.c.lines[0].phone,ownerOpen:true,verifiedAt:now-1000,expiresAt:now+240000,sourceHash:'a'.repeat(64),participantPhones:members,participantBindings:members.map(phone=>({jid:phone+'@s.whatsapp.net',phone}))}};
 const source={id:'ISOLATED_TESA_CUSTOMER',phone:PHONE,line:f.c.lines[0].phone,at:now-1000,kind:'text',text:'Cucarachas en Itagüí, prefiero mañana en la tarde',fromMe:false};f.s.enqueue(source);
 const request={phone:PHONE,line:source.line,caseId:'CASE_ISOLATED_TESA',topic:'disponibilidad-y-tecnico',conditions:{service:'cucarachas',location:'Itagüí',preference:'mañana en la tarde'},source:source.id,text:'Equipo TESA · ref LOCAL · cliente 7321. ¿Qué técnico y horario corresponden a este caso?'};
 const q=prepareTesaQuestion(f.s,f.c,request);assert.equal(q.created,true);const row=f.s.db.prepare('SELECT * FROM tesa_outbox WHERE id=?').get(q.outboxId),mid='ISOLATED_DELIVERED_QUESTION';f.s.db.prepare("UPDATE tesa_outbox SET state='ACCEPTED',mid=? WHERE id=?").run(mid,row.id);bindTesaQuestionDelivery(f.s,f.c,{outboxId:row.id,mid,groupJid:TESA_GROUP_JID,senderLine:row.sender_line,text:f.s.open(row.body),state:'DELIVERED',at:now,nativeVerified:true});
 const answer={id:'ISOLATED_TESA_ANSWER',company:'fumigacion',groupJid:TESA_GROUP_JID,receivingLine:row.sender_line,line:row.sender_line,participant:{phone:human,jid:human+'@s.whatsapp.net',altJid:null},at:now+1000,kind:'text',text:'Para este caso puede ir el técnico mañana a las tres.',fromMe:false,forwarded:false,quote:{mid,groupJid:TESA_GROUP_JID,participantJid:row.sender_line+'@s.whatsapp.net'},media:null};
 return {...f,request,answer};
}
for(const mutation of ['none','unquoted','wrong-mid','forwarded','own-bot','media'])test('TESA source validity is case bound: '+mutation,()=>{
 const f=tesaFixture();try{const e=structuredClone(f.answer);if(mutation==='unquoted')e.quote=null;if(mutation==='wrong-mid')e.quote.mid='OTHER_CASE';if(mutation==='forwarded')e.forwarded=true;if(mutation==='own-bot')e.participant={phone:f.c.lines[0].phone,jid:f.c.lines[0].phone+'@s.whatsapp.net'};if(mutation==='media')e.kind='audio';const result=acceptTesaQuotedAnswer(f.s,f.c,e);assert.equal(result.accepted,mutation==='none');assert.equal(tesaCaseAnswers(f.s,f.c,{caseId:f.request.caseId,customerPhone:PHONE}).length,mutation==='none'?1:0);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(registrationStatus(f.c,f.s).saved,0);}finally{f.s.close();}
});
