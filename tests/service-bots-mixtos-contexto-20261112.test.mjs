// Regresiones del 12/11/2026 reportadas por la usuaria: servicios mixtos cotizados
// como uno solo y respuestas repetidas sin usar el contexto. Datos sintéticos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,selectBusinessPrice,mixedServiceParts,verifyBusinessPriceEntry} from '../automation/service-bots/business-prices.mjs';
import {priceReminderText} from '../automation/service-bots/prices.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD} from '../automation/service-bots/client-requested-schedule.mjs';
import {acceptsColloquialQuotation,boundedFollowupText,serviceAreaQuestion} from '../automation/service-bots/maria-bounded-followup.mjs';

function fixture(t,phone){
 const start=Date.parse('2026-11-12T15:10:00.000Z');t.mock.timers.enable({apis:['Date'],now:start});
 const store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-1000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((p,i)=>({phone:p,instance:'local-mix-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'synthetic_local_only_'.padEnd(43,'x'),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-1000,expiresAt:Date.parse('2026-12-07T16:56:52.680Z')},staffPlanning:{enabled:true,mode:'internal-staff-assignment',startsAt:start-1000},clientRequestedSchedule:{enabled:true,guard:MARIA_CLIENT_SCHEDULE_GUARD,startsAt:start-1000}};
 const engine=new Engine(store,config);let n=0;
 const turn=async(text)=>{const event={id:'LOCAL_MIXCTX_'+ ++n,phone,line:config.lines[0].phone,at:start+n*10000,kind:'text',fromMe:false,forwarded:false,text};t.mock.timers.setTime(event.at);store.enqueue(event);await engine.process(event);return event;};
 const deliver=e=>{const r=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');if(!r)return null;const mid='LOCAL_ACK_'+e.id;t.mock.timers.setTime(e.at+1000);store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);store.recordFirstBotReply(r,mid,config.bot,e.at+1000);store.delivery(mid,e.line,'DELIVERED');return store.open(r.body);};
 return {store,engine,turn,deliver,state:e=>store.conversation(e.phone).state};
}
async function talk(t,phone,turns){
 const f=fixture(t,phone),out=[];
 try{for(const text of turns){const e=await f.turn(text);out.push({text,reply:f.deliver(e),state:f.state(e)});}}
 finally{f.store.close();}
 return out;
}
function noConsecutiveRepeat(r){const sent=r.map(x=>x.reply).filter(Boolean);for(let i=1;i<sent.length;i++)assert.notEqual(sent[i],sent[i-1],'mensaje repetido: '+sent[i]);}
const slots={site:'apartamento',location:'medellin',rooms:'2 habitaciones',mattresses:'2 colchones'};

// --- Política de descuentos (usuaria, 12/11/2026): máximo 10 %, siempre lo decide la jefe ---
const SANDRA_PHONE='573016803926';
async function discountLoop(t,phone,{clientAsk,chiefText,clientYes}){
 const f=fixture(t,phone),out={};
 try{
  f.deliver(await f.turn('Cucarachas en un apartamento en Medellín, 2 habitaciones'));
  const ask=await f.turn(clientAsk);out.askReply=f.deliver(ask);
  const q=f.store.db.prepare("SELECT * FROM questions WHERE topic='commercial-discount-review'").get();
  out.question=q&&f.store.open(q.body);out.recipient=q?.recipient;
  if(q&&chiefText){
   const internal=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(q.outbox_id);
   const mid='LOCAL_INTERNAL_ACK_'+q.id;f.store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,internal.id);f.store.delivery(mid,internal.line,'DELIVERED');
   const at=Date.now()+20000;t.mock.timers.setTime(at);
   const chief={id:'LOCAL_CHIEF_'+q.id.slice(-6),phone:SANDRA_PHONE,line:internal.line,at,kind:'text',fromMe:false,forwarded:false,quotedId:mid,text:chiefText};
   f.store.enqueue(chief);await f.engine.process(chief);
   const relay=f.store.db.prepare("SELECT * FROM outbox WHERE id=?").get('chief-case-answer:'+q.id+':v1');
   out.relay=relay&&f.store.open(relay.body);
   if(relay){const rmid='LOCAL_RELAY_'+q.id;f.store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(rmid,relay.id);f.store.delivery(rmid,relay.line,'DELIVERED');}
   if(clientYes){const yes=await f.turn(clientYes);out.yesReply=f.deliver(yes);out.state=f.state(yes);
    out.accepted=f.store.db.prepare("SELECT * FROM questions WHERE topic='commercial-discount-accepted'").get();}
  }
 }finally{f.store.close();}
 return out;
}
test('descuento: la jefe recibe servicio, total, 10 % y total con descuento; al cliente no se promete porcentaje',async t=>{
 const r=await discountLoop(t,'573000006001',{clientAsk:'me haces un descuento?'});
 assert.equal(r.recipient,SANDRA_PHONE);
 assert.match(r.question.text,/Servicio: cucarachas, apartamento, 2 habitaciones, medellin/i);
 assert.match(r.question.text,/Total: \$129\.000\. Descuento máximo \(10 %\): \$12\.900\. Total con descuento: \$116\.100\./);
 assert.match(r.question.text,/¿Autorizas alguna opción.*mantener el valor/);assert.match(r.question.text,/Para el cliente:/);
 assert.match(r.askReply,/consultar con mi jefe/);assert.doesNotMatch(r.askReply,/10|%|116/);
});
test('regateo coloquial también se consulta con la jefe',async t=>{
 const r=await discountLoop(t,'573000006002',{clientAsk:'esta muy caro, me lo dejas en menos?'});
 assert.ok(r.question,'debe crear la consulta a la jefe');
});
test('la decisión de la jefe llega al cliente y su aceptación pasa a una asesora sin registrar el precio de tabla',async t=>{
 const r=await discountLoop(t,'573000006003',{clientAsk:'me haces un descuento?',chiefText:'Para el cliente: Te podemos dejar el servicio en $116.100.',clientYes:'si listo'});
 assert.equal(r.relay,'Te podemos dejar el servicio en $116.100.');
 assert.match(r.yesReply,/asesora para agendar el servicio con el precio acordado/);
 assert.doesNotMatch(r.yesReply,/Tu nombre completo/);
 assert.equal(r.state.awaitingHumanReview,true);assert.notEqual(r.state.quotedPrice.accepted,true);
 assert.ok(r.accepted,'consulta operativa creada');assert.notEqual(r.accepted.recipient,SANDRA_PHONE);
});
// Guion flexible: ['c',texto,{deliver}] cliente, ['j',texto] jefe citando la consulta, ['r'] entregar relevo.
async function discountScript(t,phone,script){
 const f=fixture(t,phone),log=[];let q=null;
 try{
  for(const [kind,text,opts={}] of script){
   q=q||f.store.db.prepare("SELECT * FROM questions WHERE topic='commercial-discount-review'").get();
   if(kind==='c'){const e=await f.turn(text);const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');log.push({text,reply:opts.deliver===false?(row?f.store.open(row.body):null):f.deliver(e),state:f.state(e)});}
   else if(kind==='j'){
    const internal=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(q.outbox_id);const mid='LOCAL_INTERNAL_ACK_'+q.id;
    f.store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,internal.id);f.store.delivery(mid,internal.line,'DELIVERED');
    const at=Date.now()+20000;t.mock.timers.setTime(at);
    const chief={id:'LOCAL_CHIEF_'+log.length+'_'+q.id.slice(-6),phone:SANDRA_PHONE,line:internal.line,at,kind:'text',fromMe:false,forwarded:false,quotedId:mid,text};
    f.store.enqueue(chief);await f.engine.process(chief);
   }else if(kind==='r'){
    const relay=f.store.db.prepare("SELECT * FROM outbox WHERE id=?").get('chief-case-answer:'+q.id+':v1');
    const rmid='LOCAL_RELAY_'+q.id;f.store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(rmid,relay.id);f.store.delivery(rmid,relay.line,'DELIVERED');
   }
  }
  const relay=q&&f.store.db.prepare("SELECT * FROM outbox WHERE id=?").get('chief-case-answer:'+q.id+':v1');
  const accepted=f.store.db.prepare("SELECT * FROM questions WHERE topic='commercial-discount-accepted'").get();
  return {log,relay:relay&&f.store.open(relay.body),accepted:accepted&&{...accepted,text:f.store.open(accepted.body).text},discountQuestion:q&&f.store.db.prepare('SELECT id,state,case_id FROM questions WHERE id=?').get(q.id),prepared:f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n};
 }finally{f.store.close();}
}
const QUOTE='Cucarachas en un apartamento en Medellín, 2 habitaciones';
test('descuento: "¿cuánto es?" después de la decisión de la jefe no vuelve a ofrecer la tabla y el "sí" pasa a la asesora',async t=>{
 const r=await discountScript(t,'573000006010',[['c',QUOTE],['c','me haces un descuento?'],['j','Para el cliente: Te lo dejamos en $116.100.'],['r'],['c','cuanto es?'],['c','si listo']]);
 assert.match(r.log[2].reply,/te confirmó mi jefe/);assert.doesNotMatch(r.log[2].reply,/129\.000/);
 assert.match(r.log[3].reply,/asesora para agendar el servicio con el precio acordado/);
 assert.equal(r.log[3].state.quotedPrice.priceCop,129000);assert.notEqual(r.log[3].state.quotedPrice.accepted,true);assert.equal(r.prepared,0);
});
test('descuento: relevo de la jefe sin entregar o jefe sin responder → la aceptación espera a la asesora, nunca la tabla',async t=>{
 const pending=await discountScript(t,'573000006011',[['c',QUOTE],['c','me haces un descuento?'],['j','Para el cliente: Te lo dejamos en $116.100.'],['c','si listo']]);
 assert.match(pending.log[2].reply,/jefe está revisando tu solicitud de descuento/);assert.equal(pending.prepared,0);
 assert.match(pending.accepted.text,/Respuesta literal de la jefe: «Para el cliente: Te lo dejamos en \$116\.100\.» \(aún no comunicada al cliente\)/);
});
test('descuento: la jefe aún no responde y el cliente menciona el importe → nunca registra la tabla',async t=>{
 const r=await discountScript(t,'573000006012',[['c',QUOTE],['c','me haces un descuento?'],['c','acepto los 129.000']]);
 assert.doesNotMatch(r.log[2].reply??'',/Tu nombre completo/);assert.equal(r.prepared,0);assert.notEqual(r.log[2].state.quotedPrice.accepted,true);
});
test('descuento: la jefe aún no responde y el cliente acepta la cotización → asesora con servicio y estado',async t=>{
 const r=await discountScript(t,'573000006015',[['c',QUOTE],['c','me haces un descuento?'],['c','acepto la cotización']]);
 assert.doesNotMatch(r.log[2].reply??'',/Tu nombre completo/);assert.equal(r.prepared,0);
 assert.match(r.accepted.text,/La jefe aún no ha respondido/);assert.match(r.accepted.text,/Servicio: cucarachas, apartamento, 2 habitaciones, medellin/i);
 assert.match(r.accepted.text,/precio expresamente aprobado por la jefe/);assert.match(r.accepted.text,/esperar la respuesta o aclaración de la jefe; no fijar ni confirmar un precio por cuenta propia/);
 assert.match(r.log[2].reply,/espere la decisión de mi jefe antes de confirmar el valor y agendar/);assert.doesNotMatch(r.accepted.text,/con el precio que corresponda/);
 assert.notEqual(r.accepted.recipient,SANDRA_PHONE);
});
test('descuento: respuesta de la jefe sin «Para el cliente» queda interna y no autoriza la tabla',async t=>{
 const r=await discountScript(t,'573000006013',[['c',QUOTE],['c','me haces un descuento?'],['j','dale el 10'],['c','si listo']]);
 assert.equal(r.relay,undefined);assert.equal(r.prepared,0);
 assert.match(r.log[2].reply,/jefe está revisando/);assert.match(r.accepted.text,/«dale el 10»/);
});
test('descuento con aplazamiento: retomar aceptando el importe pasa a la asesora',async t=>{
 const r=await discountScript(t,'573000006014',[['c',QUOTE],['c','me haces un descuento?'],['c','lo voy a pensar'],['c','acepto los 129.000']]);
 assert.doesNotMatch(r.log[3].reply??'',/Tu nombre completo/);assert.equal(r.prepared,0);
});
// --- Segunda revisión de Codex (12/11): explicación y cambio de alcance con descuento en consulta ---
for(const [i,[label,extra,pattern]] of [['pendiente',[],/mi jefe todavía está revisando/],['comunicada',[['j','Para el cliente: Te lo dejamos en $116.100.'],['r']],/te confirmó mi jefe/]].entries())
 test('descuento '+label+': "que consta" e "incluye la cocina" explican sin reofrecer la tabla',async t=>{
  const r=await discountScript(t,'57300000602'+i,[['c',QUOTE],['c','me haces un descuento?'],...extra,['c','que consta'],['c','incluye la cocina?']]);
  for(const x of r.log.slice(-2)){assert.match(x.reply,/Insecticida líquido/);assert.match(x.reply,pattern);assert.doesNotMatch(x.reply,/129\.000|¿Deseas continuar/);assert.equal(boundedFollowupText(x.reply),true);}
 });
test('descuento y luego cambio de alcance: no publica otra cotización de tabla y la jefe recibe el nuevo alcance',async t=>{
 const r=await discountScript(t,'573000006030',[['c',QUOTE],['c','me haces un descuento?'],['c','en realidad son 3 habitaciones'],['c','si listo']]);
 assert.match(r.log[2].reply,/cambió el servicio, le paso los datos actualizados a mi jefe/);assert.doesNotMatch(r.log[2].reply,/149\.000|Total/);
 assert.notEqual(r.log[2].state.quotedPrice?.priceCop,149000,'no publica una cotización de tabla nueva');
 assert.doesNotMatch(r.log[3].reply??'',/Tu nombre completo/);assert.equal(r.prepared,0);
});
test('cambio de alcance: la decisión de la jefe llega al cliente y su "sí" pasa a la asesora con el texto completo',async t=>{
 const long='Para el cliente: Te dejamos el servicio en $134.100 '+'si agendas esta semana y '.repeat(30)+'pagas al técnico.';
 const f=fixture(t,'573000006031');
 try{
  f.deliver(await f.turn(QUOTE));f.deliver(await f.turn('me haces un descuento?'));f.deliver(await f.turn('en realidad son 3 habitaciones'));
  const q=f.store.db.prepare("SELECT * FROM questions WHERE topic='commercial-discount-scope-change'").get();assert.ok(q,'consulta de cambio de alcance');assert.equal(q.recipient,SANDRA_PHONE);
  assert.match(f.store.open(q.body).text,/Precio de tabla del nuevo alcance: \$149\.000/);
  const internal=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(q.outbox_id);const mid='LOCAL_SCOPE_ACK';f.store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,internal.id);f.store.delivery(mid,internal.line,'DELIVERED');
  const at=Date.now()+20000;t.mock.timers.setTime(at);const chief={id:'LOCAL_CHIEF_SCOPE',phone:SANDRA_PHONE,line:internal.line,at,kind:'text',fromMe:false,forwarded:false,quotedId:mid,text:long};
  f.store.enqueue(chief);await f.engine.process(chief);
  const relay=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('chief-case-answer:'+q.id+':v1');assert.ok(relay,'relevo al cliente');
  const rmid='LOCAL_SCOPE_RELAY';f.store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(rmid,relay.id);f.store.delivery(rmid,relay.line,'DELIVERED');
  const yes=await f.turn('si listo');const reply=f.deliver(yes);
  assert.match(reply,/asesora para agendar el servicio con el precio acordado/);
  const handoff=f.store.db.prepare("SELECT * FROM questions WHERE topic='commercial-discount-accepted'").get();
  assert.ok(f.store.open(handoff.body).text.includes('pagas al técnico.'),'texto completo de la jefe, sin recortes');
 }finally{f.store.close();}
});
test('mismo alcance con descuento: repreguntas antes y después de la respuesta no crean consultas ni pierden el literal comunicado',async t=>{
 const f=fixture(t,'573000006034');
 try{
  for(const text of [QUOTE,'me haces un descuento?','en realidad son 3 habitaciones','cuanto es?'])f.deliver(await f.turn(text));
  const questions=()=>f.store.db.prepare("SELECT * FROM questions WHERE topic='commercial-discount-scope-change'").all();
  assert.equal(questions().length,1);const q=questions()[0],internal=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(q.outbox_id);
  const mid='LOCAL_DEDUP_SCOPE';f.store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,internal.id);f.store.delivery(mid,internal.line,'DELIVERED');
  const at=Date.now()+1000;t.mock.timers.setTime(at);const text='Para el cliente: El nuevo servicio queda en $134.100.';
  const chief={id:'LOCAL_CHIEF_DEDUP_SCOPE',phone:SANDRA_PHONE,line:internal.line,at,kind:'text',fromMe:false,forwarded:false,quotedId:mid,text};f.store.enqueue(chief);await f.engine.process(chief);
  const relay=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get('chief-case-answer:'+q.id+':v1');assert.ok(relay);
  f.store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run('LOCAL_DEDUP_RELAY',relay.id);f.store.delivery('LOCAL_DEDUP_RELAY',relay.line,'DELIVERED');
  for(const message of ['cuanto es?','y entonces cuanto?','si listo'])f.deliver(await f.turn(message));
  assert.equal(questions().length,1);assert.equal(questions()[0].id,q.id);assert.equal(questions()[0].state,'ANSWERED');
  const handoff=f.store.db.prepare("SELECT body FROM questions WHERE topic='commercial-discount-accepted'").get();assert.ok(handoff);const body=f.store.open(handoff.body).text;
  assert.ok(body.includes(text));assert.match(body,/ya comunicada al cliente/);assert.doesNotMatch(body,/La jefe aún no ha respondido/);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 }finally{f.store.close();}
});
test('servicios mixtos se reconocen para recopilar datos, pero no emiten un precio que el backend no puede registrar',()=>{
 for(const [service,parts] of [['cucarachas y chinches','cucarachas'],['chinches y cucarachas','cucarachas'],['cucarachas, chinches','cucarachas'],['ratas y chinches','roedores'],['ratas y ratones y chinches','roedores'],['comejen y chinches','comejen']])assert.equal(mixedServiceParts(service)?.sized,parts,service);
 for(const service of ['cucarachas','chinches','cucarachas y hormigas','cucarachas y ratones','hormigas y chinches','chinches y pulgas'])assert.equal(mixedServiceParts(service),null,service);
 for(const service of ['cucarachas y chinches','chinches y cucarachas','ratas y chinches','ratas y ratones y chinches','comejen y chinches'])assert.equal(selectBusinessPrice({...slots,service}).entry,undefined,service);
 const single=selectBusinessPrice({...slots,service:'cucarachas'}).entry;
 assert.equal(single.priceCop,129000);assert.equal(selectBusinessPrice({...slots,service:'chinches'}).entry.priceCop,200000);
 const unsupported={...single,id:'approved-table-mixto-cucarachas-2-chinches-2',category:'mixto',priceCop:329000,appliesTo:{...slots,service:'cucarachas y chinches'}};
 assert.throws(()=>verifyBusinessPriceEntry(unsupported),/APPROVED_BUSINESS_PRICE_CHANGED/);
 assert.equal(selectBusinessPrice({...slots,service:'cucarachas y chinches',mattresses:undefined}).entry,undefined,'sin colchones no hay precio');
 assert.equal(selectBusinessPrice({...slots,service:'cucarachas y chinches',rooms:undefined}).entry,undefined,'sin tamaño no hay precio');
 assert.equal(selectBusinessPrice({...slots,service:'cucarachas y chinches',affectedFurniture:'sofá'}).entry,undefined,'muebles siguen a revisión');
});
test('mixto paso a paso: pide tamaño y colchones y mantiene la cotización en revisión',async t=>{
 const r=await talk(t,'573000004001',['cucarachas y chinches','Apartamento en Medellín, Laureles','2 habitaciones','2 colchones']);
 noConsecutiveRepeat(r);
 assert.match(r[0].reply,/habitaciones o metros cuadrados/);assert.match(r[0].reply,/colchones/);
 assert.equal(r[3].state.slots.rooms,'2 habitaciones');assert.equal(r[3].state.slots.mattresses,'2 colchones');assert.equal(r[3].state.quotedPrice,undefined);assert.doesNotMatch(r[3].reply??'',/329\.000|Tu nombre completo/);
});
test('mixto en un solo mensaje: no publica un total combinado sin contrato de registro',async t=>{
 const r=await talk(t,'573000004002',['Buenas, tengo cucarachas y chinches en un apartamento de 2 habitaciones en Medellín, Laureles. Son 2 colchones']);
 assert.equal(r[0].state.quotedPrice,undefined);assert.doesNotMatch(r[0].reply??'',/329\.000|Tu nombre completo/);
});
test('segunda plaga después del precio: invalida la cotización simple y el sí no inicia registro',async t=>{
 const r=await talk(t,'573000004003',['Cucarachas','Apartamento','Medellín, Laureles','2 habitaciones','también tengo chinches en 2 colchones','si']);
 assert.equal(r[3].state.quotedPrice.priceCop,129000);
 assert.equal(r[4].state.quotedPrice,undefined);assert.doesNotMatch(r[4].reply??'',/329\.000/);
 assert.doesNotMatch(r[5].reply??'',/Tu nombre completo/);assert.equal(r[5].state.programIntake,undefined);
});
test('mixto con datos y aceptaciones posteriores no prepara ningún registro automático',async t=>{
 const f=fixture(t,'573000004004');
 try{
  for(const text of ['Cucarachas y chinches en un apartamento de 2 habitaciones en Medellín, Laureles, 2 colchones','ok listo','Nombre: Ana Prueba','Dirección: Calle 10 #20-30, Laureles','mañana a las 10 de la mañana','si confirmo','acepto los 329.000']){
   const e=await f.turn(text),reply=f.deliver(e),state=f.state(e);
   assert.notEqual(state.quotedPrice?.accepted,true);assert.equal(state.programIntake,undefined);assert.doesNotMatch(reply??'',/Total: \$329\.000|Tu nombre completo|quedó registrad|quedó confirmad/);
  }
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
 }finally{f.store.close();}
});
test('una plaga nueva durante el registro aceptado conserva la cotización y el borrador, pero impide preparar el servicio simple',async t=>{
 const f=fixture(t,'573000004005');
 try{
  for(const text of [QUOTE,'si','Ana Prueba'])f.deliver(await f.turn(text));
  const before=structuredClone(f.store.conversation('573000004005').state),addition=await f.turn('también tengo chinches en 2 colchones');
  assert.equal(before.programIntake.stage,'address');assert.equal(before.quotedPrice.accepted,true);
  const reply=f.deliver(addition),held=f.state(addition);assert.equal(held.awaitingHumanReview,true);assert.equal(held.programIntake.stage,'review');
  assert.deepEqual(held.quotedPrice,before.quotedPrice);assert.equal(held.programIntake.customerName,before.programIntake.customerName);assert.equal(held.requestedRegistrationScopeReview.sourceId,addition.id);assert.equal(held.requestedRegistrationScopeReview.service,'chinches');assert.equal(held.requestedRegistrationScopeReview.mattresses,'2 colchones');assert.match(reply,/cambia el alcance/);
  for(const text of ['Dirección: Calle 10 #20-30, barrio Laureles, Medellín','mañana a las 10 de la mañana','no hay unidad','si confirmo','si'])f.deliver(await f.turn(text));
  const final=f.store.conversation('573000004005').state;assert.equal(final.awaitingHumanReview,true);assert.equal(final.programIntake.stage,'review');
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n,0);
  assert.ok(f.store.db.prepare("SELECT id FROM questions WHERE topic='special-quotation'").get());
 }finally{f.store.close();}
});
test('descuento y alcance mixto no soportado: un acuse no borra la consulta y la aceptación sigue a revisión',async t=>{
 const r=await discountScript(t,'573000006032',[['c',QUOTE],['c','me haces un descuento?'],['c','también tengo chinches en 2 colchones'],['c','claro gracias'],['c','si listo']]);
 assert.equal(r.prepared,0);assert.ok(r.discountQuestion);assert.equal(r.discountQuestion.case_id,r.log.at(-1).state.caseId);assert.equal(r.log.at(-1).state.awaitingHumanReview,true);
 for(const turn of r.log.slice(2)){assert.notEqual(turn.state.quotedPrice?.accepted,true);assert.equal(turn.state.programIntake,undefined);assert.doesNotMatch(turn.reply??'',/329\.000|Tu nombre completo/);}
});
test('descuento y nuevo alcance soportado: un acuse conserva la consulta y el sí pasa a la asesora sin tabla',async t=>{
 const r=await discountScript(t,'573000006033',[['c',QUOTE],['c','me haces un descuento?'],['c','en realidad son 3 habitaciones'],['c','claro gracias'],['c','si listo']]);
 assert.equal(r.prepared,0);assert.ok(r.accepted);assert.notEqual(r.accepted.recipient,SANDRA_PHONE);assert.match(r.accepted.text,/3 habitaciones/);assert.match(r.accepted.text,/La jefe aún no ha respondido/);
 for(const turn of r.log.slice(2)){assert.notEqual(turn.state.quotedPrice?.accepted,true);assert.equal(turn.state.programIntake,undefined);assert.doesNotMatch(turn.reply??'',/149\.000|Tu nombre completo/);}
});
for(const [i,yes] of ['ok listo','dale de una','sí, perfecto','listo hágale'].entries())test('aceptación coloquial continúa al registro: '+yes,async t=>{
 const r=await talk(t,'57300000401'+i,['Cucarachas en un apartamento en Medellín, 2 habitaciones',yes]);
 assert.match(r[1].reply,/Tu nombre completo/,yes);
});
test('gramática de aceptación coloquial: acepta lo claro y rechaza condiciones',()=>{
 for(const yes of ['ok listo','Dale de una','sí, perfecto','listo hágale','Si señora, agendemos','de una','ok, agendemos por favor'])assert.equal(acceptsColloquialQuotation(yes),true,yes);
 for(const no of ['ok pero muy caro','listo, lo pienso','dale cuando pueda','si pero el lunes no','bueno','gracias','ok?','si es posible mañana','no gracias','listo para el 15',
  'ok gracias','claro','ok perfecto gracias','perfecto','oklisto','super','genial gracias','correcto','ok','claro que me interesa'])assert.equal(acceptsColloquialQuotation(no),false,no);
});
// --- Guardas pedidas en la revisión de Codex (12/11) ---
async function steps(t,phone,list){
 const f=fixture(t,phone),out=[];
 try{for(const s of list){
  if(typeof s==='function'){s(f);continue;}
  const [text,{deliver=true}={}]=Array.isArray(s)?s:[s];
  const e=await f.turn(text);const row=f.store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');
  out.push({text,reply:deliver?f.deliver(e):(row?f.store.open(row.body):null),state:f.state(e)});
 }}finally{f.store.close();}
 return out;
}
const registered=/Tu nombre completo/;
const setState=(phone,patch)=>f=>{const c=f.store.conversation(phone);f.store.saveConversation(phone,{...c.state,...patch});};
// Nota: "ok gracias" / "perfecto gracias" ya los aceptaba la gramática ordinaria
// previa (acceptsOrdinaryQuotation, espejo del backend); este parche no la cambia.
for(const [i,ack] of ['claro gracias','super gracias','genial'].entries())test('acuse ambiguo después de la explicación no acepta: '+ack,async t=>{
 const r=await steps(t,'57300000403'+(i===0?'0':'9'+i),['Cucarachas en un apartamento en Medellín, 2 habitaciones','y eso incluye la cocina?',ack]);
 assert.doesNotMatch(r[2].reply??'',registered);
});
test('cocina con chinches solas no se responde como "toda el área"; mixto lo dice por partes',async t=>{
 const solo=await steps(t,'573000004031',['Chinches en un apartamento en Medellín, 2 colchones','y eso incluye la cocina?']);
 assert.doesNotMatch(solo[1].reply??'',/cubre toda el área/);
});
test('mixto sin cotización soportada: no promete cobertura ni inicia registro por una pregunta sobre la cocina',async t=>{
 const mix=await steps(t,'573000004032',['Buenas, tengo cucarachas y chinches en un apartamento de 2 habitaciones en Medellín, Laureles. Son 2 colchones','incluye la cocina?']);
 assert.doesNotMatch(mix[1].reply??'',/cubre toda el área|329\.000|Tu nombre completo/);assert.equal(mix[1].state.quotedPrice,undefined);assert.equal(mix[1].state.programIntake,undefined);
});
test('disponibilidad dos veces: ambas respuestas son sobre agendar y distintas',async t=>{
 const r=await steps(t,'573000004033',['Cucarachas en un apartamento en Medellín, 2 habitaciones','para cuando tienen disponibilidad?','y que dias pueden venir?']);
 assert.match(r[1].reply,/agend|coordinamos/);assert.match(r[2].reply,/agend|coordinamos/);assert.notEqual(r[1].reply,r[2].reply);
});
test('aceptar tras un recordatorio entregado sí continúa',async t=>{
 const r=await steps(t,'573000004034',['Cucarachas en un apartamento en Medellín, 2 habitaciones','cuanto vale?','ok listo']);
 assert.match(r[2].reply,registered);
});
test('aceptar con el recordatorio aún sin entregar no registra',async t=>{
 const r=await steps(t,'573000004035',['Cucarachas en un apartamento en Medellín, 2 habitaciones',['cuanto vale?',{deliver:false}],['ok listo',{deliver:false}]]);
 assert.doesNotMatch(r[2].reply??'',registered);
});
test('el nuevo alcance mixto sin entregar no se acepta con la entrega del precio anterior',async t=>{
 const r=await steps(t,'573000004036',['Cucarachas en un apartamento en Medellín, 2 habitaciones',['también tengo chinches en 2 colchones',{deliver:false}],['si',{deliver:false}]]);
 assert.equal(r[1].state.quotedPrice,undefined);
 assert.doesNotMatch(r[2].reply??'',registered);
});
test('aplazamiento activo: "ok listo" no lo reanuda',async t=>{
 const r=await steps(t,'573000004037',['Cucarachas en un apartamento en Medellín, 2 habitaciones','lo voy a pensar','ok listo']);
 assert.equal(r[1].state.customerDeferral?.active,true);
 assert.doesNotMatch(r[2].reply??'',registered);
});
test('registro en curso: "ok listo" no confirma ni registra',async t=>{
 const r=await steps(t,'573000004038',['Cucarachas en un apartamento en Medellín, 2 habitaciones','si','ok listo']);
 assert.match(r[1].reply,registered);
 assert.doesNotMatch(r[2].reply??'',/quedó registrad|quedó confirmad|programad/);
 assert.notEqual(r[2].state.programIntake?.stage,'registered');
});
test('revisión activa o cotización sin entregar: "ok listo" no registra',async t=>{
 const held=await steps(t,'573000004039',['Cucarachas en un apartamento en Medellín, 2 habitaciones',setState('573000004039',{awaitingHumanReview:true}),'ok listo']);
 assert.doesNotMatch(held[1].reply??'',registered);
});
test('cotización sin entregar: "ok listo" no registra',async t=>{
 const r=await steps(t,'573000004040',[['Cucarachas en un apartamento en Medellín, 2 habitaciones',{deliver:false}],'ok listo']);
 assert.doesNotMatch(r[1].reply??'',registered);
});
test('preguntar el precio otra vez no repite el mismo mensaje',async t=>{
 const r=await talk(t,'573000004020',['Cucarachas en un apartamento en Medellín, 2 habitaciones','cuanto vale?','y cuanto me sale','cuanto es?']);
 noConsecutiveRepeat(r);
 for(const x of r)assert.match(x.reply,/\$129\.000/);
 assert.equal(r.at(-1).state.quotedPrice.priceCop,129000);
});
test('disponibilidad e "incluye la cocina" después del precio se responden con contexto',async t=>{
 const r=await talk(t,'573000004021',['Cucarachas en un apartamento en Medellín, 2 habitaciones','y eso incluye la cocina?','para cuando tienen disponibilidad?','si']);
 noConsecutiveRepeat(r);
 assert.match(r[1].reply,/^Sí, el servicio cubre toda el área del inmueble, incluida la cocina\./);assert.match(r[1].reply,/Insecticida líquido/);assert.equal(boundedFollowupText(r[1].reply),true);
 assert.match(r[2].reply,/^Con gusto te agendamos/);
 assert.match(r[3].reply,/Tu nombre completo/);
});
test('el patio no se promete como incluido',()=>{
 assert.equal(serviceAreaQuestion('y eso incluye el patio?'),null);
 assert.equal(serviceAreaQuestion('incluye la cocina?'),'cocina');
});
test('mixto sin precio soportado: "que consta" conserva revisión y no presenta una cotización para aceptar',async t=>{
 const r=await talk(t,'573000004022',['Buenas, tengo cucarachas y chinches en un apartamento de 2 habitaciones en Medellín, Laureles. Son 2 colchones','que consta']);
 assert.doesNotMatch(r[1].reply??'',/329\.000|¿Deseas continuar|Tu nombre completo/);assert.equal(r[1].state.quotedPrice,undefined);assert.equal(r[1].state.programIntake,undefined);
 const {entry}=selectBusinessPrice({...slots,service:'cucarachas'});
 assert.match(priceReminderText(entry,'para cuando pueden venir'),/^Con gusto te agendamos/);
 assert.match(priceReminderText(entry,'cuanto es'),/valor sigue siendo \$129\.000/);
});
