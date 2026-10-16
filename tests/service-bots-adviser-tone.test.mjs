import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {drain} from '../automation/service-bots/transport.mjs';
import {BUSINESSES,OPERATOR_ROUTING,SANDRA,publicTextSafe} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {adviserReply} from '../automation/service-bots/adviser-tone.mjs';
const phone='573001112233';
function fixture(){
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING,historyCheckRequired:true,activatedAt:Date.now()-10000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i}))};
 const s=new Store(':memory:','fumigacion',randomBytes(32)),engine=new Engine(s,c);let seq=0;
 s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const t={config:c,verifyLine:async()=>{},priorHistory:async()=>({cutoff:c.activatedAt,priorOutgoing:false}),currentAttention:async()=>({complete:true,sources:[]}),understand:async()=>({}),send:async()=> 'ISOLATED'+(++seq)};
 const process=async(id,text,extra={})=>{s.enqueue({id,text,phone,line:c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',...extra});await drain(s,c,t,engine);};
 const reply=id=>{const r=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id+':reply');return r&&{...r,text:s.open(r.body)};};
 return {c,s,t,process,reply};
}
test('a warm first intake preserves facts and later questions do not repeat the welcome',async()=>{
 const f=fixture();try{
  await f.process('ADVISER001','Tengo cucarachas en Medellín');
  assert.match(f.reply('ADVISER001').text,/^Hola, soy María Ángel\./);assert.match(f.reply('ADVISER001').text,/tipo de inmueble/);assert.doesNotMatch(f.reply('ADVISER001').text,/qué plaga|municipio/i);
  await f.process('ADVISER002','Apartamento');assert.match(f.reply('ADVISER002').text,/habitaciones o metros cuadrados/);assert.doesNotMatch(f.reply('ADVISER002').text,/Con gusto te ayudo|tipo de inmueble|qué plaga|municipio/i);
 }finally{f.s.close();}
});
test('warm price invitation keeps the standard price and adds no promises or pressure',async()=>{
 const f=fixture();try{
  await f.process('ADVISER003','Tengo cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta?');const reply=f.reply('ADVISER003').text;
  assert.match(reply,/Con gusto/);assert.match(reply,/\$149\.000 COP/);assert.match(reply,/¿Deseas continuar/);assert.equal((reply.match(/¿/g)||[]).length,1);
  assert.doesNotMatch(reply,/garantiz|inofensiv|seguro para|erradic|último cupo|descuento|reserva|Sandra|Diego|Hilary/i);assert.equal(publicTextSafe(reply),true);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
 }finally{f.s.close();}
});
test('accepted delivered quote advances to preference without promising an appointment',async()=>{
 const f=fixture();try{
  await f.process('ADVISER004','Ratas en casa de 3 habitaciones en Medellín');f.s.delivery(f.reply('ADVISER004').mid,f.c.lines[0].phone,'DELIVERED');
  await f.process('ADVISER005','Sí, por favor');assert.match(f.reply('ADVISER005').text,/día y franja/);
  await f.process('ADVISER006','Mañana en la tarde');const text=f.reply('ADVISER006').text;
  assert.match(text,/Aún no tengo confirmad.*horario/);assert.doesNotMatch(text,/Con gusto|reservad|servicio confirmad|agendado|Diego|Hilary|Sandra|asesora continuará/i);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,2);
  await f.process('ADVISER007','Mañana en la tarde');assert.equal(f.reply('ADVISER007'),undefined);
 }finally{f.s.close();}
});
test('personal exception stays in review without inventing safety or sending an automatic quote',async()=>{
 const f=fixture();try{
  await f.process('ADVISER008','Tengo cucarachas en un apartamento de 60 m² en Medellín y una mascota. ¿Es seguro?');const reply=f.reply('ADVISER008').text;
  assert.doesNotMatch(reply,/\$|inofensiv|sin riesgo|puede quedarse|garantiz/i);assert.equal(publicTextSafe(reply),true);
  assert.equal(f.s.db.prepare('SELECT recipient FROM questions').get().recipient,SANDRA);
 }finally{f.s.close();}
});
test('documents receive a helpful acknowledgement and preserve the pending question without repeated intake',async()=>{
 const f=fixture();try{
  await f.process('ADVISER009','Ya nos fumigaron y necesito los documentos del servicio.');const text=f.reply('ADVISER009').text;
  assert.match(text,/documentos/);assert.match(text,/no tengo confirmado su envío/);assert.doesNotMatch(text,/Con gusto|plaga|inmueble|habitaciones|municipio|enviados|listos/i);
  await f.process('ADVISER010','Necesito el certificado');assert.equal(f.reply('ADVISER010'),undefined);
 }finally{f.s.close();}
});

test('Maria identifies a first ordinary reply once and later precise questions do not add a new introduction',async()=>{
 const f=fixture();try{
  await f.process('TONE_IDENT_FIRST','Cucarachas en Medellín');
  assert.equal((f.reply('TONE_IDENT_FIRST').text.match(/soy María Ángel/g)||[]).length,1);
  await f.process('TONE_IDENT_NEXT','Casa');
  const later=f.reply('TONE_IDENT_NEXT').text;
  assert.match(later,/habitaciones o metros cuadrados/);assert.doesNotMatch(later,/Hola|María Ángel|Con gusto|municipio|plaga/i);
 }finally{f.s.close();}
});

test('pending states describe the known result without internal storage, staff routing or invented completion',()=>{
 const sources=['Recibí tu pregunta. Tu solicitud sigue pendiente de confirmación.','Con gusto. Revisaremos tu solicitud de documentos.','Con gusto. Tu solicitud de garantía quedó pendiente de revisión.','Gracias. Una asesora continuará contigo para confirmar el horario del servicio.'];
 for(const reply of sources){const rendered=adviserReply('fumigacion',{reply});assert.match(rendered,/pendiente|aún/i);assert.doesNotMatch(rendered,/guardad|ticket|equipo|asesora continuará|Sandra|Diego|Hilary|garantía aprobada|enviado|reservado|programado/i);}
});

test('literal personal registration summaries and approved answers remain exact despite first-reply styling',()=>{
 const summary='Registraré el servicio de cucarachas por $129.000 en Calle Sintética, a nombre de Persona Sintética. ¿Confirmas que estos datos son correctos?';
 assert.equal(adviserReply('fumigacion',{reply:summary,state:{programIntake:{stage:'confirm'}}},{firstReply:true}),summary);
 const receipt='Tu solicitud quedó registrada. El horario sigue pendiente.';
 assert.equal(adviserReply('fumigacion',{reply:receipt,state:{programIntake:{stage:'registered'}}},{firstReply:true}),receipt);
 const approved='Texto aprobado con precio literal $129.000 y su alcance.';
 assert.equal(adviserReply('fumigacion',{reply:approved},{firstReply:true,approvedAnswer:true}),approved);
});

test('a pending reinforcement keeps its unverified conditions rather than claiming only the appointment time is missing',()=>{
 const reply=adviserReply('fumigacion',{reply:'Con gusto. Tu solicitud de refuerzo quedó pendiente de revisión.'});
 assert.match(reply,/solicitud de refuerzo/);assert.match(reply,/falta confirmar cómo atenderla/);
 assert.doesNotMatch(reply,/horario|aprobado|gratis|elegible|pago|agendado|registrado/i);
});

test('a pure greeting identifies Maria then lists only pest and municipality clearly',async()=>{
 const f=fixture();try{
  await f.process('TONE_PURE_GREETING','Buenas tardes');const reply=f.reply('TONE_PURE_GREETING').text;
  assert.match(reply,/^Buenas tardes, soy María Ángel\./);assert.match(reply,/plaga.*prevención/);assert.match(reply,/municipio y barrio o vereda/);
  assert.match(reply,/soy María Ángel\.\n\nPara cotizarte, cuéntame:\n1\. Qué plaga/);assert.match(reply,/\n2\. El municipio/);
  assert.doesNotMatch(reply,/tipo de inmueble|habitaciones|metros cuadrados|•|Con gusto|Sandra|Diego|asesora|guardad|ticket/i);
  const state=f.s.conversation(phone).state;assert.equal(state.initialIntakeAllRequested,false);assert.deepEqual(state.initialIntakeRequestedFields,['service','location']);assert.deepEqual(state.asked,['service','location']);
 }finally{f.s.close();}
});
test('staff takeover suppresses even a warmly phrased approved price',async()=>{
 const f=fixture();try{
  await f.process('ADVISER011','Asesora atendiendo',{fromMe:true});await f.process('ADVISER012','Cucarachas en un apartamento de 60 m² en Medellín');
  assert.equal(f.reply('ADVISER012'),undefined);assert.equal(f.s.conversation(phone).hold,1);
 }finally{f.s.close();}
});
test('approved answers, other company wording and suppressed replies remain intact',()=>{
 const d={reply:'Texto literal con fuente aprobada.',review:true};assert.equal(adviserReply('fumigacion',d,{firstReply:true,approvedAnswer:true}),d.reply);
 assert.equal(adviserReply('servicio-tecnico',{reply:'¿Qué equipo necesitas revisar?'},{firstReply:true}),'¿Qué equipo necesitas revisar?');
 assert.equal(adviserReply('fumigacion',{reply:null},{firstReply:true}),null);
 const pending=adviserReply('fumigacion',{reply:'Gracias. Una asesora continuará contigo para confirmar el horario del servicio.'});
 assert.doesNotMatch(pending,/indicarnos tu preferencia|tienes una reserva|horario confirmado/);
});
