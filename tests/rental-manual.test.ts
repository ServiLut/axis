import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bookingTimes,rentalQuote} from '../lib/booking';
import {normalizedRental,lockAndValidateBooking} from '../lib/booking-server';
import {loadServerModule} from './load-server-module';

test('each chosen minute is preserved and the operator specifies the additional charge',async()=>{
 const tx:any={terapiasPsicologos:{findFirst:async()=>({nombre:'Alquiler',cantidadSesiones:1,precioBase:18900})}};
 for(const [start,end,extra,hours] of [['16:00','17:50','5000',1],['16:00','17:30','4000',1],['16:30','17:45','2000',1],['16:45','17:30','12000',0],['16:00','16:55','17000',0]] as const){
  const t=bookingTimes('2026-10-02',start,end),mins=(t.fin.getTime()-t.inicio.getTime())/60000;
  assert.deepEqual(rentalQuote(mins,'18900',extra),{hours,minutes:mins,amount:hours*18900+Number(extra)});
  const saved=await normalizedRental(tx,4,1n,t.inicio,t.fin,extra);
  assert.equal(saved?.fin.toISOString(),t.fin.toISOString());assert.equal(saved?.valor,hours*18900+Number(extra));
 }
});
test('missing price is never rounded, prorated or inferred; explicit zero is distinguishable',()=>{
 for(const mins of [1,30,45,55,61,90,110,115]){
  assert.throws(()=>rentalQuote(mins,'18900'),/valor del tiempo adicional/);
  assert.throws(()=>rentalQuote(mins,'18900',''),/valor del tiempo adicional/);
  assert.equal(rentalQuote(mins,'18900','0').amount,Math.floor(mins/60)*18900);
 }
 for(const extra of ['-1','NaN','Infinity','5.555','1000000000','1,500'])assert.throws(()=>rentalQuote(110,'18900',extra));
 assert.equal(rentalQuote(120,'18900').amount,37800);
 assert.throws(()=>rentalQuote(60,'18900','5000'),/no contiene minutos adicionales/);
});
test('actual interval governs collision checks and rental packages keep their restriction',async()=>{
 const t=bookingTimes('2026-10-02','16:30','17:45');let where:any;
 const tx:any={$queryRaw:async()=>[],usuario:{findFirst:async()=>({id:25})},consultorios:{findFirst:async()=>({id:12n})},citasPsicologos:{findFirst:async(q:any)=>{where=q.where;return null;}},terapiasPsicologos:{findFirst:async()=>({nombre:'Alquiler',cantidadSesiones:10,precioBase:18900})}};
 await lockAndValidateBooking(tx,{tenantId:4,psicologoId:25,consultorioId:12n,inicio:t.inicio,fin:t.fin});
 assert.equal(where.horaInicio.lt.toISOString(),t.fin.toISOString());assert.equal(where.horaFin.gt.toISOString(),t.inicio.toISOString());
 await assert.rejects(normalizedRental(tx,4,1n,t.inicio,t.fin,'5000'),/contrato del paquete/);
 tx.citasPsicologos.findFirst=async()=>({id:9n});await assert.rejects(lockAndValidateBooking(tx,{tenantId:4,psicologoId:25,consultorioId:12n,inicio:t.inicio,fin:t.fin}),/ya tiene/);
});

function fixture(){
 const state:any={rows:[],audits:[],price:18900,occupied:false,current:{id:1n,tenantId:4,psicologoId:25,consultorioId:12n,horaInicio:new Date('2026-10-02T21:00Z'),horaFin:new Date('2026-10-02T22:00Z'),valor:18900,estadoPago:'PENDIENTE',realizada:false,paqueteId:1n,PaqueteAdquirido:{catalogoId:1n,sesionesTotales:1}}};
 const tx:any={$queryRaw:async()=>[],usuario:{findFirst:async()=>({id:25})},empresa:{findFirst:async()=>({id:3})},consultorios:{findFirst:async()=>({id:12n})},
  terapiasPsicologos:{findFirst:async()=>({nombre:'Alquiler',cantidadSesiones:1,precioBase:state.price})},
  citasPsicologos:{findFirst:async()=>state.occupied?{id:2n}:null,findUnique:async()=>state.current,count:async()=>1,create:async({data}:any)=>{state.rows.push(data);return {id:2n,...data};},update:async({data}:any)=>{state.rows.push(data);return {id:1n,...data};}},
  paqueteAdquirido:{findFirst:async()=>null,create:async()=>({id:1n}),update:async()=>({id:1n})},$transaction:async(fn:any)=>fn(tx)};
 const api:any=loadServerModule('app/(protected)/dashboard/citas/actions.ts',{
  '@/lib/prisma':tx,'@/lib/auth':{verifyToken:(t:string)=>t==='valid'?{userId:10}:null},'next/cache':{revalidatePath(){}},
  '@/prisma/generated/prisma/client':{Prisma:{Decimal:{isDecimal:()=>false}},Rol:{},EstadoPagoOrden:{}},
  'date-fns-tz':{fromZonedTime:(s:string)=>new Date(s+'-05:00')},'@supabase/supabase-js':{},
  '@/lib/audit':{createAuditLog:async(a:any)=>{state.audits.push(a);}},
  '@/lib/psychology-access':{requireFinanceUser:async(t:string)=>{if(t!=='valid')throw Error('No autorizado');return {id:10,tenantId:4};}},
  '@/lib/package-payment':{getPackagePaymentState:async()=>null},'@/lib/psychology-appointment-delete':{},
 });
 const form=(extra?:string,end='17:50')=>{const f=new FormData();for(const [key,val] of Object.entries({empresa:'3',tecnico:'25',terapiaId:'1',fechaVisita:'2026-10-02',horaInicio:'16:00',horaFin:end,consultorio:'12',consultorioId:'12',valorCotizado:'0'}))f.set(key,val);if(extra!==undefined)f.set('rentalAdicional',extra);return f;};
 return {state,api,form};
}
test('server create persists entered additional plus catalog base and an attributed audit',async()=>{
 const f=fixture();assert.equal((await f.api.createCita('valid',f.form('5000'))).success,true);
 assert.equal(f.state.rows[0].valor,23900);assert.equal(f.state.rows[0].horaFin.toISOString(),'2026-10-02T22:50:00.000Z');
 assert.equal(f.state.audits[0].usuarioId,10);assert.equal(f.state.audits[0].detalles.adicionalAlquiler,'5000');assert.equal(f.state.audits[0].detalles.minutosAdicionales,50);
});
test('server rejects missing price, unauthorized caller and occupied room before save',async()=>{
 for(const kind of ['missing','unauthorized','occupied']){const f=fixture();if(kind==='occupied')f.state.occupied=true;
  assert.ok((await f.api.createCita(kind==='unauthorized'?'invalid':'valid',f.form(kind==='missing'?undefined:'5000'))).error);assert.equal(f.state.rows.length,0);
 }
});
test('edit persists exact minutes and manual additional; saved historic price survives unchanged schedule',async()=>{
 const f=fixture();assert.equal((await f.api.updateCita('valid',1,f.form('5000'))).success,true);
 assert.equal(f.state.rows[0].valor,23900);assert.equal(f.state.rows[0].horaFin.toISOString(),'2026-10-02T22:50:00.000Z');assert.equal(f.state.audits[0].detalles.adicionalAlquiler,'5000');
 const same=fixture();same.state.price=25000;assert.equal((await same.api.updateCita('valid',1,same.form(undefined,'17:00'))).success,true);assert.equal(same.state.rows[0].valor,18900);
});
test('paid or finished rentals cannot be repriced by an additional field',async()=>{
 for(const kind of ['paid','finished']){const f=fixture();if(kind==='paid')f.state.current.estadoPago='CONCILIADO';else f.state.current.realizada=true;
  assert.ok((await f.api.updateCita('valid',1,f.form('5000'))).error);assert.equal(f.state.rows.length,0);
 }
});

test('WhatsApp checks fractional availability but never invents the additional price or creates a proposal',async()=>{
 let proposals=0,availability=0;
 const api:any=loadServerModule('lib/psychology-rental-intake.ts',{
  './psychology-reception':{normalizeText:(v:string)=>v.toLowerCase()},
  './psychology-reception-context':{isRentalBookingRequest:()=>true,readReceptionIdentity:async()=>({role:'professional',professionalId:25})},
  './psychology-bot-booking':{proposeBooking:async()=>{proposals++;return 'never';}},
  './psychology-booking-messages':{friendlyDay:(v:string)=>v,friendlyTime:(v:string)=>v,confirmationQuestion:()=>''},
  './psychology-room-preferences':{roomChoice:()=>'',rememberRoomPreferences:()=>({})},
 });
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const tx:any={terapiasPsicologos:{findMany:async()=>[{id:1n,precioBase:18900}]},consultorios:{findMany:async()=>[{id:12n,nombre:'Consultorio 1'}]},
  citasPsicologos:{count:async()=>0,findMany:async(q:any)=>{if(!(q.where.horaInicio instanceof Date))availability++;return [];}},$queryRaw:async()=>[]};
 const r=await api.handleRentalIntake(tx,{id:'synthetic',phone:'573000000010',kind:'text',text:'De 4:30 a 5:45 en consultorio 1',fromMe:false},'NEW',{},
  {intent:'rental',confidence:1,service:'alquiler',rentalRequests:[{requestIndex:null,date,start:'16:30',end:'17:45',roomLabel:'1'}]});
 assert.equal(availability,1);assert.equal(proposals,0);assert.equal(r.stage,'HUMAN');
 assert.match(r.handoff,/valor de los minutos adicionales/);assert.match(r.messages[0],/todavía no queda reservado/);assert.doesNotMatch(r.messages[0],/Sandra|Axis|37[.,]800/);
});
