// Regresiones de las conversaciones reales del 4/11/2026 (capturas de las asesoras).
// María repetía la misma pregunta con "140", "3", "5" + "colchones" y repetía el
// precio cuando el cliente preguntaba "que consta". Datos 100 % sintéticos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {MARIA_CLIENT_SCHEDULE_GUARD} from '../automation/service-bots/client-requested-schedule.mjs';
import {boundedFollowupText,serviceContentQuestion} from '../automation/service-bots/maria-bounded-followup.mjs';
import {mariaOrdinaryIntakeReply} from '../automation/service-bots/adviser-tone.mjs';

function fixture(t,phone){
 const start=Date.parse('2026-11-04T23:10:00.000Z');t.mock.timers.enable({apis:['Date'],now:start});
 const store=new Store(':memory:','fumigacion',randomBytes(32));store.importKnowledge(approvedBusinessPriceSchedule());
 const config={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:start-1000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((p,i)=>({phone:p,instance:'local-loop-'+i})),mariaProgram:{enabled:true,url:'https://tenaxis-backend-0zeuja.servilutioncrm.cloud/integrations/maria-service-registration',token:'synthetic_local_only_'.padEnd(43,'x'),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',startsAt:start-1000,expiresAt:Date.parse('2026-12-07T16:56:52.680Z')},staffPlanning:{enabled:true,mode:'internal-staff-assignment',startsAt:start-1000},clientRequestedSchedule:{enabled:true,guard:MARIA_CLIENT_SCHEDULE_GUARD,startsAt:start-1000}};
 const engine=new Engine(store,config);let n=0,lastMid=null;
 const turn=async(text,quoted=false)=>{const event={id:'LOCAL_LOOP_'+ ++n,phone,line:config.lines[0].phone,at:start+n*10000,kind:'text',fromMe:false,forwarded:false,text,...(quoted&&lastMid?{quotedId:lastMid}:{})};t.mock.timers.setTime(event.at);store.enqueue(event);await engine.process(event);return event;};
 const deliver=e=>{const r=store.db.prepare('SELECT * FROM outbox WHERE id=?').get(e.id+':reply');if(!r)return null;const mid='LOCAL_ACK_'+e.id;t.mock.timers.setTime(e.at+1000);store.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,r.id);store.recordFirstBotReply(r,mid,config.bot,e.at+1000);store.delivery(mid,e.line,'DELIVERED');lastMid=mid;return store.open(r.body);};
 return {store,turn,deliver,state:e=>store.conversation(e.phone).state};
}
async function talk(t,phone,turns){
 const f=fixture(t,phone),replies=[];
 try{for(const [text,quoted] of turns){const e=await f.turn(text,quoted);replies.push({text,reply:f.deliver(e),state:f.state(e)});}}
 finally{f.store.close();}
 return replies;
}
function noConsecutiveRepeat(replies){
 const sent=replies.map(r=>r.reply).filter(Boolean);
 for(let i=1;i<sent.length;i++)assert.notEqual(sent[i],sent[i-1],'María repitió el mismo mensaje seguido: '+sent[i]);
}

test('captura de tamaño: "140" y "3" reciben confirmaciones distintas, nunca la misma pregunta en bucle',async t=>{
 const r=await talk(t,'573000001401',[['Hola, buenas noches'],['Hormigas y cucarachas'],['Apartamento'],['Laureles'],['140',true],['3']]);
 noConsecutiveRepeat(r);
 assert.match(r[4].reply,/«140 metros cuadrados»/);
 assert.match(r[5].reply,/«3 habitaciones»/);
 assert.equal(r.filter(x=>x.reply==='¿Cuántas habitaciones o metros cuadrados tiene el lugar?').length,1);
});
test('el cliente que sigue el ejemplo recibe el precio aprobado y "¿qué incluye?" explica el servicio',async t=>{
 const r=await talk(t,'573000001404',[['Hola, buenas noches'],['Cucarachas'],['Apartamento'],['Medellín, Laureles'],['140',true],['140 metros cuadrados'],['¿Qué incluye?'],['si']]);
 noConsecutiveRepeat(r);
 assert.match(r[5].reply,/\$189\.000 COP/);
 assert.match(r[6].reply,/Insecticida líquido/);assert.match(r[6].reply,/\$189\.000 COP\. ¿Deseas continuar con esta cotización\?$/);
 assert.notEqual(r[6].reply,r[5].reply);
 assert.match(r[7].reply,/Tu nombre completo/);
});
test('captura de chinches: "5" + "colchones" y "que consta" ya no repiten pregunta ni precio',async t=>{
 const r=await talk(t,'573000001403',[['Hola, tengo chinches en las camas'],['Casa'],['Medellín, Belén'],['5',true],['colchones'],['5 bases y 5 colchones'],['que consta',true],['si']]);
 noConsecutiveRepeat(r);
 assert.match(r[3].reply,/«5 colchones»/);
 assert.match(r[4].reply,/en un solo mensaje/);
 assert.match(r[5].reply,/\$500\.000 COP/);
 assert.match(r[6].reply,/Vaporización en colchones/);assert.match(r[6].reply,/base de la cama/);assert.match(r[6].reply,/\$500\.000 COP\. ¿Deseas continuar/);
 assert.match(r[7].reply,/Tu nombre completo/);
});
test('respuestas que no sirven: dos redacciones distintas y luego revisión, sin bucle',async t=>{
 const r=await talk(t,'573000001406',[['Cucarachas en una casa en Bello'],['No sé cuánto mide'],['No tengo ese dato'],['Ni idea'],['jmm'],['tampoco sé']]);
 noConsecutiveRepeat(r);
 for(const x of r.slice(1,4)){assert.match(x.reply,/habitaciones o metros cuadrados/);assert.doesNotMatch(x.reply,/\d/);}
 assert.match(r[4].reply,/Revisaremos/,'agotadas tres aclaraciones pasa a revisión del equipo');
 assert.equal(r[5].reply,null,'después de pasar a revisión no vuelve a preguntar');
 const size=r.slice(1).filter(x=>/habitaciones o metros cuadrados/.test(x.reply??''));assert.ok(size.length<=3,'como máximo tres aclaraciones de tamaño después de la pregunta inicial');
});
// --- Guardas pedidas en la revisión de Codex (5/11/2026) ---
async function quoted(t,phone,{deliverQuote=true}={}){
 const f=fixture(t,phone);
 for(const text of ['Hola, tengo chinches en las camas','Casa','Medellín, Belén','5 colchones']){const e=await f.turn(text);if(text!=='5 colchones'||deliverQuote)f.deliver(e);}
 return f;
}
const explained=/Vaporización en colchones/;
test('la explicación exige una cotización entregada y vigente',async t=>{
 const f=await quoted(t,'573000001410',{deliverQuote:false});
 try{const e=await f.turn('que consta');assert.doesNotMatch(f.deliver(e)??'',explained);}finally{f.store.close();}
});
test('la explicación no se usa si el alcance cambió después del precio',async t=>{
 const f=await quoted(t,'573000001411');
 try{
  const conv=f.store.conversation('573000001411');f.store.saveConversation('573000001411',{...conv.state,slots:{...conv.state.slots,mattresses:'6 colchones'}});
  const e=await f.turn('que consta');assert.doesNotMatch(f.deliver(e)??'',explained);
 }finally{f.store.close();}
});
test('la explicación no interrumpe un aplazamiento activo',async t=>{
 const f=await quoted(t,'573000001412');
 try{
  const conv=f.store.conversation('573000001412');f.store.saveConversation('573000001412',{...conv.state,customerDeferral:{active:true}});
  const e=await f.turn('que consta');assert.doesNotMatch(f.deliver(e)??'',explained);
 }finally{f.store.close();}
});
for(const [i,text] of ['Qué incluye, pero dejémoslo para después','Qué incluye cambiar a diez colchones'].entries())test('mensaje mixto no activa la explicación: '+text,async t=>{
 const f=await quoted(t,'57300000142'+i);
 try{const e=await f.turn(text);assert.doesNotMatch(f.deliver(e)??'',explained,text);}finally{f.store.close();}
});
test('aceptar citando la explicación continúa al registro sin nueva cotización',async t=>{
 const f=await quoted(t,'573000001413');
 try{
  const q=await f.turn('que consta');assert.match(f.deliver(q),explained);
  const yes=await f.turn('si',true);assert.match(f.deliver(yes)??'',/Tu nombre completo|nombre/);
  assert.equal(f.state(yes).quotedPrice.priceCop,500000);
 }finally{f.store.close();}
});
test('"una cama" repetido comparte el límite: sin repetición seguida y luego revisión',async t=>{
 const r=await talk(t,'573000001414',[['Hola, tengo chinches en las camas'],['Casa'],['Medellín, Belén'],['1 cama'],['1 cama'],['1 cama'],['1 cama'],['1 cama']]);
 noConsecutiveRepeat(r);
 const clarifications=r.slice(3).filter(x=>x.reply&&!/Revisaremos/.test(x.reply));assert.ok(clarifications.length<=3,'máximo tres aclaraciones');
 assert.ok(r.slice(3).some(x=>/Revisaremos/.test(x.reply??'')),'termina en revisión');
});
test('al agotar el límite: una revisión missing-intake, sin hold y sin preguntas duplicadas',async t=>{
 const f=fixture(t,'573000001415');
 try{
  for(const text of ['Cucarachas en una casa en Bello','No sé cuánto mide','No tengo ese dato','Ni idea','jmm','tampoco sé'])f.deliver(await f.turn(text));
  const questions=f.store.db.prepare('SELECT * FROM questions').all();
  assert.equal(questions.length,1,'una sola pregunta interna');
  assert.equal(questions[0].topic,'missing-intake:size');
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM outbox WHERE internal=1").get().n<=1,true);
  assert.equal(f.store.db.prepare('SELECT hold FROM conversations WHERE phone=?').get('573000001415').hold,0,'sin hold de asesora');
 }finally{f.store.close();}
});
test('los textos nuevos se envían tal cual y "qué consta" se reconoce',()=>{
 for(const text of ['¿Son 140 metros cuadrados? Escríbemelo así: «140 metros cuadrados». Si prefieres darme habitaciones, escríbeme por ejemplo «3 habitaciones».','Para cotizarte necesito el tamaño aproximado: ¿cuántas habitaciones o metros cuadrados tiene el lugar? Por ejemplo: «dos habitaciones».'])
  {assert.equal(boundedFollowupText(text),true);assert.equal(mariaOrdinaryIntakeReply(text),true);}
 for(const t of ['que consta','q incluye','en que consiste','como es el proceso','que le aplican'])assert.equal(serviceContentQuestion(t),true,t);
 for(const t of ['que incluye el servicio?','que consta eso','en que consiste el tratamiento por favor'])assert.equal(serviceContentQuestion(t),true,t);
 for(const t of ['que consta en la factura que me enviaron la semana pasada por el servicio anterior y por que me cobraron dos veces el mismo valor sin avisarme','hola','cuanto vale','que incluye, pero dejemoslo para despues','que incluye cambiar a diez colchones'])assert.equal(serviceContentQuestion(t),false,t);
});
