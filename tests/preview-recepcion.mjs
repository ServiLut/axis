// Isolated UI preview. Never connects to the production CRM or a database.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const root = process.cwd(), out = resolve(root, '.tmp/reception-preview');
await mkdir(out, { recursive: true });
const fixtures = `
import { quoteCargo, validateReceptionPayment } from '@/lib/recepcion';
const catalogo=[{codigo:'IMPRESION',nombre:'Impresión por hoja',unidad:'hoja',precio:'800.00'},
 {codigo:'EXTRA_CORTO',nombre:'Tiempo extra: 1 a 15 minutos',unidad:'adicional',precio:'4000.00'},
 {codigo:'EXTRA_MEDIO',nombre:'Tiempo extra: 16 a 30 minutos',unidad:'adicional',precio:'8000.00'},
 {codigo:'EXTRA_HORA',nombre:'Tiempo extra: más de 30 minutos',unidad:'reserva normal',precio:'18900.00'}];
const cargos=[],pagos=[],movements=[];
export const getReceptionData=async(_,fecha)=>({catalogo,profesionales:[{id:20,nombre:'Profesional',apellido:'de prueba'}],
 reservas:[{id:'900',profesionalId:20,inicio:fecha+'T01:00:00-05:00',fin:fecha+'T02:00:00-05:00',consultorio:'Consultorio de prueba'}],
 cargos:cargos.filter(c=>c.fecha===fecha),pagos:pagos.filter(p=>p.fecha===fecha),admin:true});
export const createReceptionCharge=async(_,input)=>{
 try{const old=cargos.find(c=>c.solicitudId===input.solicitudId);if(old)return {success:true,id:old.id};
 const q=quoteCargo(input,catalogo);const id=String(cargos.length+1);
 cargos.push({...q,id,profesional:'Profesional de prueba',anulado:false,pagado:'0.00'});return {success:true,id};
 }catch(e){return {error:e.message};}};
export const recordReceptionPayment=async(_,input)=>{
 try{const d=validateReceptionPayment(input); const old=pagos.find(p=>p.solicitudId===d.solicitudId);if(old)return {success:true,id:old.id};
 for(const a of d.aplicaciones){const c=cargos.find(c=>c.id===a.cargoId);if(!c||c.anulado||Number(a.monto)>Number(c.total)-Number(c.pagado))return {error:'Saldo inválido'};}
 for(const a of d.aplicaciones){const c=cargos.find(c=>c.id===a.cargoId);c.pagado=(Number(c.pagado)+Number(a.monto)).toFixed(2);}
 const id=String(pagos.length+1);pagos.push({...d,id,monto:d.total,reversado:false,cargos:d.aplicaciones.map(a=>a.cargoId).join(', ')});
 movements.push({id:String(movements.length+1),fecha:d.fecha,tipo:'INGRESO',metodoPago:d.metodoPago,monto:d.total,concepto:'Pago de recepción (prueba)',referencia:d.referencia,creadoPor:'Prueba local',createdAt:new Date().toISOString()});
 return {success:true,id};}catch(e){return {error:e.message};}};
export const cancelReceptionCharge=async(_,id)=>{const c=cargos.find(c=>c.id===id);if(!c||Number(c.pagado)!==0)return {error:'No se puede anular'};c.anulado=true;return {success:true};};
export const refundReceptionPayment=async(_,id,fecha)=>{const p=pagos.find(p=>p.id===id);if(!p)return {error:'Pago no encontrado'};if(p.reversado)return {success:true};
 p.reversado=true;for(const a of p.aplicaciones){const c=cargos.find(c=>c.id===a.cargoId);c.pagado=(Number(c.pagado)-Number(a.monto)).toFixed(2);}
 movements.push({id:String(movements.length+1),fecha,tipo:'EGRESO',metodoPago:p.metodoPago,monto:p.monto,concepto:'Devolución de prueba',referencia:'REV-'+id,creadoPor:'Prueba local',createdAt:new Date().toISOString()});return {success:true};};
export const updateReceptionRate=async(_,code,price)=>{catalogo.find(s=>s.codigo===code).precio=price;return {success:true};};
export const getCajaMovements=async(_,fecha)=>({movements:movements.filter(m=>m.fecha===fecha)});
export const createCajaMovement=async()=>({error:'La vista de prueba solo registra pagos de recepción.'});
`;
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {Toaster} from 'sonner';
import {Recepcion} from './components/contabilidad/recepcion';import {CajaDiaria} from './components/contabilidad/caja-diaria';
localStorage.setItem('token','local-fixture-invalid-on-production');
function Preview(){const [cash,setCash]=React.useState(false);return <><nav className="flex gap-3 p-3 bg-amber-100"><strong>PRUEBA LOCAL · DATOS FICTICIOS · SIN BD</strong><button onClick={()=>setCash(false)}>Recepción</button><button onClick={()=>setCash(true)}>Libro diario de prueba</button></nav>{cash?<CajaDiaria/>:<Recepcion/>}<Toaster/></>}
createRoot(document.getElementById('root')).render(<Preview/>);`,resolveDir:root,loader:'tsx'},bundle:true,format:'esm',jsx:'automatic',outfile:resolve(out,'bundle.js'),
 define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_RECEPCION_ENABLED':'"true"'}, plugins:[{name:'local-ui-fixtures',setup(b){
   b.onResolve({filter:/(actions$|^next\/link$)/},a=>({path:a.path==='next/link'?a.path:'shared-reception-fixtures',namespace:'fixtures'}));
   b.onLoad({filter:/.*/,namespace:'fixtures'},a=>({contents:a.path==='next/link'?`export default function Link({children}){return children;}`:fixtures,resolveDir:root,loader:'jsx'}));
 }}]});
const css=await postcss([tailwind({base:root})]).process(await readFile(resolve(root,'app/globals.css'),'utf8'),{from:resolve(root,'app/globals.css')});
await writeFile(resolve(out,'styles.css'),css.css);
const html='<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba local · Recepción PSICOLOGOS</title><link rel="stylesheet" href="/styles.css"><body style="font-family:Arial,sans-serif"><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>';
if(!process.argv.includes('--build-only')) createServer(async(req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 const name=path==='/bundle.js'?'bundle.js':path==='/styles.css'?'styles.css':null;
 if(!name){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(resolve(out,name)));
}).listen(4175,'127.0.0.1',()=>console.log('UI preview without production access: http://127.0.0.1:4175'));
