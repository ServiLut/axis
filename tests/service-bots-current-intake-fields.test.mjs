import {mock as historicalPriceClock} from 'node:test';
// Historical quotation fixtures use their original immutable table and clock.
historicalPriceClock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T18:00:00.000Z')});
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,customerDecision} from '../automation/service-bots/engine.mjs';
import {BUSINESSES,CURRENT_OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {CONVERSATIONAL_AI_GUARD} from '../automation/service-bots/ai-settings.mjs';
import {approvedBusinessPriceSchedule,LEGACY_BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {projectCurrentMariaLocationDetails,currentMariaLocationProjection} from '../automation/service-bots/current-location-projection.mjs';
import {MARIA_COMPANY,MARIA_TENANT} from '../automation/service-bots/maria-program.mjs';

function fixture(){
 const at=Math.floor((Date.now()-60000)/1000)*1000,s=new Store(':memory:','fumigacion',randomBytes(32));s.importKnowledge(approvedBusinessPriceSchedule(LEGACY_BUSINESS_PRICE_HASH));
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,activatedAt:at-1000,operatorRouting:CURRENT_OPERATOR_ROUTING,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'current-fields-local-'+i}))};
 const engine=new Engine(s,c),phone='573000007385';let seq=0;
 const turn=async(text,slots={})=>{const e={id:'CURRENT_FIELDS_SOURCE_'+ ++seq,phone,line:c.lines[0].phone,at:at+seq*1000,kind:'text',fromMe:false,forwarded:false,text};historicalPriceClock.timers.setTime(e.at);s.enqueue(e);await engine.process(e,{guard:CONVERSATIONAL_AI_GUARD,company:'FUMIGACION',eventId:e.id,slots});return {e,state:s.conversation(phone).state};};
 const deliver=r=>{const row=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(r.e.id+':reply'),mid='CURRENT_FIELDS_MID_'+r.e.id;assert.ok(row);s.db.prepare("UPDATE outbox SET mid=?,state='ACCEPTED' WHERE id=?").run(mid,row.id);s.recordFirstBotReply({...row,mid},mid,c.bot,r.e.at);s.delivery(mid,r.e.line,'DELIVERED');s.db.prepare('UPDATE meta SET value=? WHERE key=?').run(s.seal({verifiedAt:r.e.at,mid,line:r.e.line,state:'DELIVERED'}),'first-delivery:'+row.id);};
 return {s,c,phone,turn,deliver};
}
const isolated=fn=>async()=>{const f=fixture();try{await fn(f);}finally{f.s.close();}};

test('new size-only AI detail is rejected while correction still removes a proven historical same-source duplicate without changing history',isolated(async f=>{
 await f.turn('Hola, quiero cotizar para un apartamento.');
 const old=await f.turn('Tiene dos habitaciones y queda en Itagüí.',{detail:'dos habitaciones'});
 assert.equal(old.state.slots.detail,undefined);assert.equal(old.state.intakeSources.detail,undefined);assert.equal(old.state.intakeSources.rooms.sourceId,old.e.id);
 const originalBody=f.s.db.prepare('SELECT body FROM events WHERE id=?').get(old.e.id).body;
 // Explicitly model state persisted by the earlier runtime. The current AI
 // admission must not be forced to recreate the defect merely to test cleanup.
 const historical=structuredClone(old.state);historical.slots.detail='dos habitaciones';historical.intakeSources.detail={...historical.intakeSources.rooms,context:'own-ai-literal-fragment',guard:CONVERSATIONAL_AI_GUARD};f.s.saveConversation(f.phone,historical);
 const continuation=await f.turn('Barrio Santa María.');assert.equal(continuation.state.slots.detail,'dos habitaciones');assert.equal(continuation.state.intakeSources.detail.sourceId,old.e.id);await f.turn('Cucarachas');
 const before=f.s.conversation(f.phone).state.slots.locationDetails,corrected=await f.turn('Me equivoqué: es una habitación, no dos.');
 assert.equal(corrected.state.slots.rooms,'una habitación');assert.equal(corrected.state.slots.detail,undefined);assert.equal(corrected.state.intakeSources.detail,undefined);assert.equal(corrected.state.quotedPrice.priceCop,99000);assert.equal(corrected.state.quotedPrice.slots.detail,undefined);
 assert.equal(corrected.state.slots.locationDetails,before);assert.equal(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(old.e.id).body,originalBody);assert.equal(f.s.open(originalBody).text,old.e.text);
 const projection=currentMariaLocationProjection(f.s,corrected.state,corrected.e);assert.equal(projection.review,false);assert.equal(projection.applied,true);assert.doesNotMatch(projection.locationDetails,/dos habitaciones/);assert.match(projection.locationDetails,/Barrio Santa María/);assert.equal(corrected.state.slots.locationDetails,before);
}));

test('a new genuine pest detail with additional meaning keeps its exact native source across a room correction',isolated(async f=>{
 const detail='dos habitaciones con focos en la cocina',first=await f.turn('Tengo cucarachas en un apartamento de dos habitaciones con focos en la cocina en Itagüí.',{detail});
 assert.equal(first.state.slots.detail,detail);assert.equal(first.state.intakeSources.detail.sourceId,first.e.id);
 const originalBody=f.s.db.prepare('SELECT body FROM events WHERE id=?').get(first.e.id).body,correction=await f.turn('Corrijo: una habitación.');
 assert.equal(correction.state.slots.rooms,'una habitación');assert.equal(correction.state.slots.detail,detail);assert.equal(correction.state.intakeSources.detail.sourceId,first.e.id);assert.equal(correction.state.intakeSources.detail.at,first.e.at);
 assert.equal(f.s.db.prepare('SELECT body FROM events WHERE id=?').get(first.e.id).body,originalBody);assert.equal(f.s.open(originalBody).text,first.e.text);
}));

for(const [detail,sameSource] of [['dos habitaciones con focos en la cocina',true],['dos habitaciones',false]])test('correction preserves additional or differently sourced details: '+detail+' / '+sameSource,isolated(async f=>{
 const first=await f.turn('Tengo cucarachas en apartamento de dos habitaciones en Itagüí.');
 const conv=f.s.conversation(f.phone);conv.state.slots.detail=detail;conv.state.intakeSources.detail={sourceId:sameSource?first.e.id:'INDEPENDENT_DETAIL_SOURCE',at:first.e.at};f.s.saveConversation(f.phone,conv.state);
 const r=await f.turn('Corrijo: una habitación.');assert.equal(r.state.slots.rooms,'una habitación');assert.equal(r.state.slots.detail,detail);assert.equal(r.state.intakeSources.detail.sourceId,sameSource?first.e.id:'INDEPENDENT_DETAIL_SOURCE');
}));

test('the pure decision preserves its input while removing only a proven obsolete duplicate',()=>{
 const prior={slots:{service:'cucarachas',site:'apartamento',location:'itagui',rooms:'dos habitaciones',detail:'dos habitaciones'},intakeSources:{rooms:{sourceId:'OLD_SIZE_SOURCE',at:1000},detail:{sourceId:'OLD_SIZE_SOURCE',at:1000}},asked:[]},snapshot=structuredClone(prior);
 const e={id:'NEW_SIZE_SOURCE',phone:'573000007385',line:BUSINESSES.fumigacion.phones[0],at:2000,kind:'text',fromMe:false,forwarded:false,text:'Corrijo: una habitación.'};
 const r=customerDecision('fumigacion',prior,e);assert.deepEqual(prior,snapshot);assert.equal(r.state.slots.detail,undefined);assert.equal(r.state.intakeSources.detail,undefined);assert.equal(r.state.slots.rooms,'una habitación');
});

function projectionFixture(text){
 const phone='573000007385',line=BUSINESSES.fumigacion.phones[0],source=(id,at,text)=>({id,phone,line,at,text,kind:'text',fromMe:false,forwarded:false});
 const anchor=source('PROJECTION_ANCHOR',1000,'Quiero cotizar un apartamento.'),old=source('PROJECTION_OLD_SIZE',2000,text),correction=source('PROJECTION_CURRENT_SIZE',3000,'Corrijo: una habitación.'),neighborhood=source('PROJECTION_NEIGHBORHOOD',2500,'Barrio Santa María.');
 const state={caseId:'fumigacion:'+anchor.id,slots:{site:'apartamento',service:'cucarachas',location:'itagui',rooms:'una habitación',locationDetails:text+' | '+neighborhood.text},intakeSources:{rooms:{sourceId:correction.id,at:correction.at}},intakeLocationParts:[{text,sourceId:old.id,at:old.at},{text:neighborhood.text,sourceId:neighborhood.id,at:neighborhood.at}]};
 return {state,context:{phone,line,at:4000,sources:[anchor,old,correction,neighborhood]},old,correction};
}

test('location projection retains exact independent access restrictions and neighborhood while omitting the superseded size',()=>{
 const f=projectionFixture('Tiene dos habitaciones y queda en Itagüí; entrada por portería, no usar el ascensor.'),before=structuredClone(f),p=projectCurrentMariaLocationDetails(f.state,f.context);
 assert.equal(p.review,false);assert.equal(p.applied,true);assert.doesNotMatch(p.locationDetails,/dos habitaciones/);assert.match(p.locationDetails,/entrada por portería, no usar el ascensor\./);assert.match(p.locationDetails,/Barrio Santa María/);assert.equal(p.omissions[0].sourceId,f.old.id);assert.equal(p.omissions[0].currentSourceId,f.correction.id);assert.deepEqual(f,before);
});
test('an inseparable access restriction mixed with superseded size requires review instead of being hidden',()=>{
 const f=projectionFixture('La entrada de las dos habitaciones requiere llave de portería.'),p=projectCurrentMariaLocationDetails(f.state,f.context);assert.equal(p.review,true);assert.equal(p.reason,'MIXED_CURRENT_LOCATION_REQUIRES_CLARIFICATION');assert.equal(p.locationDetails,f.state.slots.locationDetails);
});
for(const kind of ['missing-current-source','wrong-phone','changed-source','future-source'])test('projection requires exact current and original source bindings: '+kind,()=>{
 const f=projectionFixture('Tiene dos habitaciones y queda en Itagüí.');
 if(kind==='missing-current-source')f.context.sources=f.context.sources.filter(source=>source.id!==f.correction.id);
 if(kind==='wrong-phone')f.correction.phone='573000007386';
 if(kind==='changed-source')f.old.text='Tiene tres habitaciones y queda en Itagüí.';
 if(kind==='future-source')f.correction.at=5000;
 const p=projectCurrentMariaLocationDetails(f.state,f.context);assert.equal(p.review,true);assert.equal(p.locationDetails,f.state.slots.locationDetails);
});
test('unrelated unchanged location details retain the existing DTO contract',()=>{
 const state={slots:{rooms:'dos habitaciones',locationDetails:'Entrada por portería. Barrio Santa María.'}},before=structuredClone(state),p=projectCurrentMariaLocationDetails(state);
 assert.equal(p.review,false);assert.equal(p.applied,false);assert.equal(p.locationDetails,state.slots.locationDetails);assert.deepEqual(state,before);
});

test('final accepted DTO uses current size and projected location, preserving literal name and address sources and zero writes',isolated(async f=>{
 const now=Date.now();f.c.mariaProgram={enabled:true,url:'https://invalid.example/integrations/maria-service-registration',token:'a'.repeat(43),actorId:'7508385b-536e-4aa2-8137-d734dfc900ef',tenantId:MARIA_TENANT,companyId:MARIA_COMPANY,startsAt:now-86400000,expiresAt:now+86400000};
 await f.turn('Hola, quiero cotizar para un apartamento.');await f.turn('Tiene dos habitaciones y queda en Itagüí.',{detail:'dos habitaciones'});await f.turn('Barrio Santa María.');await f.turn('Cucarachas');
 const corrected=await f.turn('Me equivoqué: es una habitación, no dos.');f.deliver(corrected);
 const accepted=await f.turn('Sí, quiero el servicio');f.deliver(accepted);
 const facts=await f.turn('Nombre: Valentina Prueba Integral\nDirección: Calle 50 # 42-18 apartamento 301 barrio Santa María');f.deliver(facts);
 const final=await f.turn('Confirmo'),entry=f.s.open(f.s.db.prepare('SELECT value FROM meta WHERE key=?').get('maria-registration:'+final.state.caseId).value),p=entry.payload;
 assert.equal(entry.status,'PENDING');assert.equal(p.slots.rooms,'una habitación');assert.equal(p.quote.priceCop,99000);assert.equal(p.slots.detail,undefined);assert.doesNotMatch(p.locationDetails,/dos habitaciones/);assert.match(p.locationDetails,/Barrio Santa María/);
 assert.equal(p.customerName,'Valentina Prueba Integral');assert.equal(p.address,'Calle 50 # 42-18 apartamento 301 barrio Santa María');assert.equal(p.sources.customerName.id,facts.e.id);assert.equal(p.sources.address.id,facts.e.id);assert.equal(p.sources.address.text,facts.e.text);
 assert.match(final.state.slots.locationDetails,/Tiene dos habitaciones/);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='OWN_SERVICE_REGISTRATION_SAVED'").get().n,0);assert.equal(f.s.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='OWN_CURRENT_LOCATION_PROJECTED'").get().n,1);
 if(process.env.MARIA_SYNTHETIC_CURRENT_LOCATION_DTO)writeFileSync(process.env.MARIA_SYNTHETIC_CURRENT_LOCATION_DTO,JSON.stringify(p,null,2)+'\n');
}));
