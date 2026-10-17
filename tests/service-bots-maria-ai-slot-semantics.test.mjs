// Exact synthetic Luna output captured in live-luna-current/checkpoint-private.json.
// Replay only: the provider below is a local function; no model or network call.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {aiConfiguration,CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {understandOwnCustomer} from '../automation/service-bots/conversational-ai.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {Store} from '../automation/service-bots/store.mjs';
import {BUSINESSES} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule} from '../automation/service-bots/business-prices.mjs';
import {MARIA_UNDERSTANDING_GUARD,mariaLiteralSlotAllowed} from '../automation/service-bots/maria-understanding.mjs';

const AT=Date.parse('2026-10-17T18:49:27.000Z');
const text='Buenas tardes, quiero cotizar cucarachas en un apartamento de dos habitaciones en Itagüí, barrio Santa María.';
const savedOutput='{"slots":{"service":"cucarachas","location":"Itagüí","site":"apartamento","detail":"dos habitaciones","preference":"barrio Santa María"},"intent":{"kind":"new-service","evidence":"quiero cotizar"}}';
const event=(value,id='SYNTHETIC_SLOT_SEMANTIC_01')=>({id,phone:'573000005555',line:'573126944997',at:AT,fromMe:false,forwarded:false,kind:'text',text:value});
function fixture(){
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,activatedAt:AT-60000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'synthetic-slot-'+i})),conversationalAi:aiConfiguration({BOT_AI_PROVIDER:'openai',BOT_AI_SCOPE:'FUMIGACION',BOT_AI_MODEL:'synthetic-replay-only',BOT_OPENAI_API_KEY:'not-a-real-key',BOT_AI_MONTHLY_CALL_LIMIT:'20',BOT_AI_ENABLED_FROM:new Date(AT-60000).toISOString()},'fumigacion')};
 const s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule());return {c,s,engine:new Engine(s,c)};
}
test('recorded exact Luna neighborhood preference and room-count detail never enter current state, quote snapshot or timing sources',async t=>{
 t.mock.timers.enable({apis:['Date'],now:AT});t.mock.method(globalThis,'fetch',()=>{throw Error('NO_NETWORK');});const f=fixture();
 try{const e=event(text);f.s.enqueue(e);let calls=0;const analysis=await understandOwnCustomer(f.c,f.s,async()=>{calls++;return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:savedOutput}]}]})};},e,{slots:{},asked:[]});
  assert.equal(calls,1);assert.equal(analysis.slots.preference,undefined);assert.equal(analysis.slots.detail,undefined);await f.engine.process(e,analysis);
  const state=f.s.conversation(e.phone).state;assert.equal(state.slots.preference,undefined);assert.equal(state.slots.detail,undefined);assert.equal(state.quotedPrice.slots.preference,undefined);assert.equal(state.intakeSources.preference,undefined);assert.equal(state.slots.rooms,'dos habitaciones');assert.equal(state.slots.location,'itagui');assert.equal(state.slots.locationDetails,text);
 }finally{f.s.close();}
});
test('the Engine independently refuses the same mislabeled slots even when a caller bypasses understandOwnCustomer',()=>{
 const e=event(text),analysis={...JSON.parse(savedOutput),company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD};
 const d=customerDecision('fumigacion',{slots:{},asked:[]},e,analysis);assert.equal(d.state.slots.preference,undefined);assert.equal(d.state.slots.detail,undefined);assert.equal(d.state.slots.rooms,'dos habitaciones');
});
for(const [source,value]of[
 ['Mañana en la tarde','Mañana en la tarde'],['Lo necesito mañana a las 10 am','mañana a las 10 am'],
 ['El sábado 24 de octubre a las 10 am','El sábado 24 de octubre a las 10 am'],['Horario: 24/10/2026 a las 10 am','24/10/2026 a las 10 am'],
 ['En la tarde','En la tarde'],['Me sirve a las diez de la mañana','diez de la mañana'],['A las dos de la tarde','A las dos de la tarde'],
 ['Necesito fumigar el apartamento mañana','mañana'],['Lo necesito para mañana en el barrio Santa María','mañana'],
])test('a source-supported literal requested time remains timing, never confirmed availability: '+source,()=>{
 assert.equal(mariaLiteralSlotAllowed('preference',value,source,AT),true);
 const e=event(source),analysis={company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,slots:{preference:value}};
 const d=customerDecision('fumigacion',{slots:{service:'cucarachas'},asked:['preference']},e,analysis);assert.ok(d.state.slots.preference);assert.equal(d.state.slots.confirmedSchedule,undefined);
});
for(const [source,value]of[
 [text,'barrio Santa María'],[text,'apartamento'],[text,'dos habitaciones'],['Barrio Santa María','Barrio Santa María'],
 ['Necesito fumigar en la vereda Mañana','Mañana'],['Me encuentro en el barrio El Domingo','Domingo'],
 ['No lo necesito mañana','mañana'],['Si pueden mañana, les aviso','mañana'],['Mi vecina dijo que mañana','mañana'],
 ['Para mañana o el lunes','mañana'],['Lo necesito mañana o pasado mañana','mañana'],['El lunes 24 de octubre','El lunes 24 de octubre'],
 ['31 de noviembre','31 de noviembre'],['A las 10','A las 10'],['A las 25:00','A las 25:00'],['Estoy en el apartamento 10:30','10:30'],
])test('a neighborhood, property, denial, alternative or impossible value never becomes a model schedule: '+source,()=>{
 assert.equal(mariaLiteralSlotAllowed('preference',value,source,AT),false);
 const e=event(source),analysis={company:'FUMIGACION',eventId:e.id,guard:CONVERSATIONAL_AI_GUARD,semanticGuard:MARIA_UNDERSTANDING_GUARD,slots:{preference:value}};
 const d=customerDecision('fumigacion',{slots:{service:'cucarachas'},asked:['preference']},e,analysis);assert.equal(d.state.slots.preference,undefined);
});
for(const value of ['dos habitaciones','50 metros cuadrados','2 colchones','un piso','barrio Santa María','apartamento'])test('property data remain outside failure detail: '+value,()=>assert.equal(mariaLiteralSlotAllowed('detail',value,value,AT),false));
test('actual literal pest detail is preserved without changing other companies',()=>{
 assert.equal(mariaLiteralSlotAllowed('detail','aparecen cucarachas en la cocina','aparecen cucarachas en la cocina',AT),true);
 const e=event('La nevera no enfría'),d=customerDecision('servicio-tecnico',{slots:{},asked:[]},e,{slots:{service:'nevera',detail:'no enfría'}});assert.equal(d.state.slots.detail,'no enfría');
});
