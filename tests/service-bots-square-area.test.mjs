import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../automation/service-bots/store.mjs';
import {Engine,extractSlots} from '../automation/service-bots/engine.mjs';
import {drain} from '../automation/service-bots/transport.mjs';
import {BUSINESSES,OPERATOR_ROUTING} from '../automation/service-bots/config.mjs';
import {approvedBusinessPriceSchedule,BUSINESS_PRICE_HASH} from '../automation/service-bots/business-prices.mjs';
import {selectPrice} from '../automation/service-bots/prices.mjs';

function fixture(){
 const c={company:'fumigacion',...BUSINESSES.fumigacion,enabled:true,chiefOnly:true,operatorRouting:OPERATOR_ROUTING,historyCheckRequired:true,activatedAt:Date.now()-10000,lines:BUSINESSES.fumigacion.phones.map((phone,i)=>({phone,instance:'isolated-'+i}))};
 const s=new Store(':memory:','fumigacion',randomBytes(32)),engine=new Engine(s,c);let seq=0;
 s.importKnowledge(approvedBusinessPriceSchedule());
 const t={config:c,verifyLine:async()=>{},priorHistory:async()=>({cutoff:c.activatedAt,priorOutgoing:false}),currentAttention:async()=>({complete:true,sources:[]}),understand:async()=>({}),send:async()=> 'ISOLATED'+(++seq)};
 const process=async(id,text,extra={})=>{const e={id,text,phone:'573001112233',line:c.lines[0].phone,at:Date.now(),fromMe:false,kind:'text',...extra};s.enqueue(e);await drain(s,c,t,engine);return e;};
 const reply=id=>{const r=s.db.prepare('SELECT * FROM outbox WHERE id=?').get(id+':reply');return r&&s.open(r.body);};
 return {s,c,process,reply};
}

test('square metre abbreviation after own size prompt is retained and an unverified municipality is requested before quoting',async()=>{
 const f=fixture();try{
  await f.process('AREA_INITIAL01','Hola, requiero una cotización técnica para control de [Plaga] en un [Empresa/Hogar] ubicado en [Municipio].');
  await f.process('AREA_PROPERTY02','Una fumigación de cucarachas para un apartamento en el edificio Alameda Itagüía');
  assert.match(f.reply('AREA_PROPERTY02'),/habitaciones o metros cuadrados/);
  await f.process('AREA_SIZE003','42 mts2');
  let state=f.s.conversation('573001112233').state;
  assert.equal(state.slots.area,'42 mts2');
  assert.equal(state.intakeSources.area.sourceId,'AREA_SIZE003');
  assert.equal(state.slots.location,undefined);
  assert.match(f.reply('AREA_SIZE003'),/municipio y barrio/);
  assert.doesNotMatch(f.reply('AREA_SIZE003'),/revisaremos|habitaciones|\$/i);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  await f.process('AREA_CITY004','Itagüí');
  state=f.s.conversation('573001112233').state;
  assert.equal(state.slots.area,'42 mts2');
  assert.equal(state.slots.location,'itagui');
  assert.match(f.reply('AREA_CITY004'),/129\.000 COP/);
  assert.equal(state.quotedPrice.priceCop,129000);
  assert.equal(f.s.db.prepare('SELECT COUNT(*) n FROM questions').get().n,0);
  assert.doesNotMatch(f.reply('AREA_CITY004'),/reservad|programad|confirmad.*horario/i);
 }finally{f.s.close();}
});

test('explicit mt2 and mts2 variants use the unchanged approved area band while preserving the literal source',()=>{
 for(const literal of ['42 mts2','42 mts²','42 mt2','42 mt²','42 MTS2','42 m 2','42,5 mts2','42.5 mts²']){
  const slots={...extractSlots('Cucarachas en apartamento en Medellín de '+literal,'fumigacion')};
  assert.equal(slots.area,literal);
  const entry=selectPrice(slots,[approvedBusinessPriceSchedule()]).entry;
  assert.equal(entry?.priceCop,129000);
  assert.equal(entry.appliesTo.area,literal);
  assert.equal(entry.source.scheduleHash,BUSINESS_PRICE_HASH);
 }
});

test('linear units, ranges, cubic units, conflicting rooms and special properties do not gain an automatic square-area price',()=>{
 for(const literal of ['42 mts','42 mt','42 metros','42 mts3','entre 42 y 50 mts2','42 mts2 de tubería']){
  const slots={service:'cucarachas',site:'apartamento',location:'medellin',area:literal};
  assert.equal(selectPrice(slots,[approvedBusinessPriceSchedule()]).entry,undefined);
 }
 for(const literal of ['42 mts','42 mt','42 mts3'])assert.equal(extractSlots(literal,'fumigacion').area,undefined);
 const good={service:'cucarachas',site:'apartamento',location:'medellin',area:'42 mts2'};
 for(const patch of [{rooms:'3 habitaciones'},{site:'edificio'},{locationDetails:'dos apartamentos en Medellín'},{location:'itagüía'},{service:'cucarachas y hormigas'}])assert.equal(selectPrice({...good,...patch},[approvedBusinessPriceSchedule()]).entry,undefined);
 assert.equal(extractSlots('42 mts2','servicio-tecnico').area,undefined);
});

test('new square units do not release a human hold or authorize a forwarded quotation',async()=>{
 const f=fixture();try{
  await f.process('AREA_STAFF01','Una asesora está atendiendo',{fromMe:true});
  await f.process('AREA_HELD002','Cucarachas en apartamento en Medellín de 42 mts2');
  assert.equal(f.reply('AREA_HELD002'),undefined);
  assert.equal(f.s.conversation('573001112233').hold,1);
 }finally{f.s.close();}
 const g=fixture();try{
  await g.process('AREA_FORWARD01','Cucarachas en apartamento en Medellín de 42 mts2, ¿cuánto cuesta?',{forwarded:true});
  assert.doesNotMatch(g.reply('AREA_FORWARD01')??'',/129\.000/);
 }finally{g.s.close();}
});
