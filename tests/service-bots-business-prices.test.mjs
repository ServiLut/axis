import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots} from '../automation/service-bots/engine.mjs';
import {drain} from '../automation/service-bots/transport.mjs';
import {BUSINESSES,OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {selectPrice,verifyPriceSource,priceText,PRICE_AUTHORITY} from '../automation/service-bots/prices.mjs';
import {approvedBusinessPriceSchedule,validateBusinessPriceSchedule,BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';

const phone='573001112233';
const scope={site:'apartamento',location:'medellin'};
function fixture(){
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING,historyCheckRequired:true,activatedAt:Date.now()-10000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'own-'+i}))};
 const s=new Store(':memory:','fumigacion',randomBytes(32)),engine=new Engine(s,c);let seq=0;
 s.importKnowledge(approvedBusinessPriceSchedule());
 const t={config:c,verifyLine:async()=>{},priorHistory:async()=>({cutoff:c.activatedAt,priorOutgoing:false}),currentAttention:async()=>({complete:true,sources:[]}),understand:async()=>({}),send:async()=> 'ISOLATED'+(++seq)};
 const process=async(id,text,extra={})=>{const e={id,text,phone,line:c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',...extra};s.enqueue(e);await drain(s,c,t,engine);};
 const reply=id=>{const r=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id+':reply');return r&&{...r,text:s.open(r.body)};};
 return {c,s,t,process,reply};
}
for(const row of approvedBusinessPriceSchedule().entries){
 test('approved row '+row.rooms+' uses standard prices at both area boundaries and only matching rooms',()=>{
  for(const service of ['cucarachas','ratas','comején'])for(const area of [row.minM2,row.maxM2]){
   const e=selectPrice({...scope,service,area:area+' m²',rooms:row.rooms+' habitaciones'},[approvedBusinessPriceSchedule()]).entry;
   assert.equal(e.priceCop,(service==='ratas'?row.roedores:row.cucarachas)+(service==='comején'?50000:0));
   assert.notEqual(e.priceCop,service==='ratas'?row.roedoresMinimum:row.cucarachasMinimum);
  }
 });
}
test('a direct schedule has exact reviewed contents and cannot be changed or imported into ST',()=>{
 const d=approvedBusinessPriceSchedule();assert.equal(validateBusinessPriceSchedule(d,'fumigacion'),d);
 for(const alter of [x=>x.entries[0].cucarachas=89000,x=>x.chinchesPerMattressCop=100000,x=>x.automaticDiscounts=true,x=>x.materials.audio='a'.repeat(64)]){
  const changed=structuredClone(d);alter(changed);assert.throws(()=>validateBusinessPriceSchedule(changed,'fumigacion'));
 }
 const st=new Store(':memory:','servicio-tecnico',randomBytes(32));try{assert.throws(()=>st.importKnowledge(d));assert.equal(st.approvedPriceCatalogs().length,0);}finally{st.close();}
});
test('ordinary selection refuses conflicting sizes, units, extra scope, out of range, mixed pests and special sites',()=>{
 const good={...scope,service:'cucarachas',area:'60 m²'};
 for(const patch of [{rooms:'2 habitaciones'},{area:'60 metros'},{area:'40.5 m²'},{area:'201 m²'},{rooms:'7 habitaciones',area:undefined},{service:'cucarachas y hormigas'},{site:'edificio'},{location:'sopetrán'},{floors:'2 pisos'},{patio:'patio'},{roomScale:'grandes'},{locationDetails:'dos casas en Medellín'}])assert.equal(selectPrice({...good,...patch},[approvedBusinessPriceSchedule()]).entry,undefined);
 assert.equal(selectPrice({...good,service:'avispas'},[approvedBusinessPriceSchedule()]).entry,undefined);
});
test('chinches uses 70000 for each confirmed mattress and reviews unspecified furniture or volume discount',()=>{
 for(let n=1;n<=5;n++){const e=selectPrice({...scope,service:'chinches',mattresses:n+' '+(n===1?'colchón':'colchones')},[approvedBusinessPriceSchedule()]).entry;assert.equal(e.priceCop,n*70000);assert.match(priceText(e),/tratamiento de/);}
 for(const patch of [{mattresses:'6 colchones'},{mattresses:'10 colchones'},{mattresses:'2 colchones',affectedFurniture:'base de cama'},{mattresses:'entre 2 y 3 colchones'}])assert.equal(selectPrice({...scope,service:'chinches',...patch},[approvedBusinessPriceSchedule()]).entry,undefined);
 assert.equal(extractSlots('Tengo chinches en un colchón','fumigacion').mattresses,'un colchón');
});
test('receives the complete source, quotes the approved table and asks no repeated intake or internal quote',async()=>{
 const f=fixture();try{await f.process('TABLEQUOTE01','Tengo cucarachas en un apartamento de 60 m² en Medellín. ¿Cuánto cuesta?');assert.match(f.reply('TABLEQUOTE01').text,/149\.000 COP/);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);assert.equal(f.s.conversation(phone).state.slots.area,'60 m²');}finally{f.s.close();}
});
test('the single mattress and comejen paths use their scoped new prices without assuming a reservation',async()=>{
 for(const [text,amount] of [['Chinches en un colchón en apartamento de Medellín',70000],['Comején en casa de 2 habitaciones en Bello',179000]]){
  const f=fixture();try{await f.process('NEWPEST001',text);assert.ok(f.reply('NEWPEST001').text.includes(new Intl.NumberFormat('es-CO').format(amount)));assert.doesNotMatch(f.reply('NEWPEST001').text,/reservad|confirmad|programad/i);}finally{f.s.close();}
 }
});
test('avispas goes once to inspection and never receives a room or fixed price questionnaire',async()=>{
 const f=fixture();try{await f.process('WASPNEST01','Tengo avispas en casa en Medellín');assert.match(f.reply('WASPNEST01').text,/tamaño y la altura.*inspección/);assert.doesNotMatch(f.reply('WASPNEST01').text,/\$|habitaciones|metros/);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,2);await f.process('WASPNEST02','El panal está a cuatro metros');assert.equal(f.reply('WASPNEST02'),undefined);}finally{f.s.close();}
});
test('acceptance uses a delivered own quote, preserves the price and consults Diego and Hilary without booking',async()=>{
 const f=fixture();try{await f.process('ACCEPTABLE01','Ratas en casa de 3 habitaciones en Medellín');f.s.delivery(f.reply('ACCEPTABLE01').mid,f.c.lines[0].phone,'DELIVERED');await f.process('ACCEPTABLE02','Sí, por favor');assert.match(f.reply('ACCEPTABLE02').text,/día y franja/);await f.process('ACCEPTABLE03','Mañana en la tarde');assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=1').get().n,2);assert.doesNotMatch(f.reply('ACCEPTABLE03').text,/reservad|servicio confirmad/);}finally{f.s.close();}
});
test('a human hold suppresses quotes and source verification rejects changed prices or a different company',async()=>{
 const f=fixture();try{await f.process('STAFFPRICE01','Asesora atendiendo',{fromMe:true});await f.process('HELDPRICE01','Cucarachas en casa de 2 habitaciones en Medellín');assert.equal(f.reply('HELDPRICE01'),undefined);const e=selectPrice({...scope,service:'cucarachas',rooms:'2 habitaciones'},f.s.approvedPriceCatalogs()).entry;assert.equal(await verifyPriceSource(e,f.t),true);await assert.rejects(()=>verifyPriceSource({...e,priceCop:119000},f.t));await assert.rejects(()=>verifyPriceSource(e,{config:{company:'servicio-tecnico'}}));}finally{f.s.close();}
});
test('a forwarded or hypothetical price source cannot force a new quote',async()=>{
 for(const [text,extra]of [['Si fuera una casa de 2 habitaciones en Medellín con cucarachas, ¿cuánto cuesta?',{}],['Cucarachas en apartamento de 60 m² en Medellín, ¿cuánto cuesta?',{forwarded:true}]]){const f=fixture();try{await f.process('UNCLEAR001',text,extra);assert.doesNotMatch(f.reply('UNCLEAR001')?.text||'',/\$129\.000|\$149\.000/);}finally{f.s.close();}}
});
test('the approved schedule survives encrypted persistence and deduplicated reimport',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maria-price-')),file=path.join(dir,'bot.sqlite'),key=randomBytes(32),doc=approvedBusinessPriceSchedule();
 let s=new Store(file,'fumigacion',key);try{s.importKnowledge(doc);s.importKnowledge(doc);assert.equal(s.approvedPriceCatalogs().length,1);s.close();s=new Store(file,'fumigacion',key);const e=selectPrice({...scope,service:'cucarachas',rooms:'1 habitación'},s.approvedPriceCatalogs()).entry;assert.equal(e.priceCop,99000);assert.equal(e.source.scheduleHash,BUSINESS_PRICE_HASH);}finally{s.close();if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir()))throw Error('TEMP_PATH_OUTSIDE_TARGET');fs.rmSync(dir,{recursive:true,force:true});}
});
test('a previously issued case quote keeps its source rather than being silently repriced by the new table',()=>{
 const slots={...scope,service:'cucarachas',area:'60 m²'};
 const doc={company:'fumigacion',kind:'approved_price_catalog',source:PRICE_AUTHORITY,authorizationSource:PRICE_AUTHORITY,at:'2026-10-05',approval:{source:PRICE_AUTHORITY,reviewed:true},entries:[{id:'prior-case-native-price',priceCop:125000,currency:'COP',active:true,scope:'ordinary-service-exact-reviewed-conditions',appliesTo:slots,source:{nativeVerified:true,line:'573126944997',quoteId:'PREVIOUS01',at:'2026-10-05',quoteHash:'a'.repeat(64),context:[{id:'CONTEXT01',at:'2026-10-05',bodyHash:'b'.repeat(64)}]}}]};
 const catalogs=[doc,approvedBusinessPriceSchedule()];
 assert.equal(selectPrice(slots,catalogs).entry.priceCop,149000);
 assert.equal(selectPrice(slots,catalogs,'prior-case-native-price').entry.priceCop,125000);
 assert.equal(selectPrice({...slots,area:'70 m²'},catalogs,'prior-case-native-price').entry,undefined);
});
