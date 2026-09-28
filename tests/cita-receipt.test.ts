import assert from 'node:assert/strict';import {test} from 'node:test';import {loadServerModule} from './load-server-module';
import type * as Actions from '../app/(protected)/dashboard/citas/actions';
test('receipt checks scope and size before storage; failed storage never reports success or changes payment',async()=>{
 let exists=true,storageError=false,uploads=0,writes=0,audits=0;let data:unknown;
 const storage={upload:async()=>{uploads++;return {error:storageError?{name:'StorageError'}:null}},getPublicUrl:()=>({data:{publicUrl:'https://example.invalid/receipt.pdf'}})};
 const tx={citasPsicologos:{updateMany:async(q:unknown)=>{writes++;data=q;return {count:1}}}};
 const prisma={citasPsicologos:{findFirst:async({where}:any)=>{assert.equal(where.tenantId,4);assert.equal(where.empresaId,3);return exists?{comprobantePath:'previous'}:null}},$transaction:async(fn:any)=>fn(tx)};
 const action=loadServerModule<typeof Actions>('app/(protected)/dashboard/citas/actions.ts',{
  '@/lib/prisma':prisma,'@/lib/auth':{verifyToken:(t:string)=>t==='valid'?{userId:10}:null},'next/cache':{revalidatePath(){}},
  '@/prisma/generated/prisma/client':{Prisma:{},Rol:{},EstadoPagoOrden:{}},'date-fns-tz':{},'@supabase/supabase-js':{createClient:()=>({storage:{from:()=>storage}})},
  '@/lib/audit':{createAuditLog:async()=>{audits++}},'@/lib/psychology-access':{requireFinanceUser:async()=>({tenantId:4,id:10})},
  '@/lib/booking':{},'@/lib/booking-server':{},'@/lib/caja':{},'@/lib/package-payment':{},
 });
 const form=(size=100,type='application/pdf')=>{const f=new FormData();f.set('file',new File([new Uint8Array(size)],'receipt.pdf',{type}));return f};
 assert.ok('error' in await action.uploadComprobantePagoCita('invalid',1,form()));
 exists=false;assert.ok('error' in await action.uploadComprobantePagoCita('valid',1,form()));assert.equal(uploads,0);exists=true;
 assert.ok('error' in await action.uploadComprobantePagoCita('valid',1,form(8*1024*1024+1)));assert.ok('error' in await action.uploadComprobantePagoCita('valid',1,form(100,'text/html')));assert.equal(uploads,0);
 storageError=true;assert.ok('error' in await action.uploadComprobantePagoCita('valid',1,form()));assert.equal(writes,0);
 storageError=false;assert.ok('success' in await action.uploadComprobantePagoCita('valid',1,form(2*1024*1024)));assert.equal(writes,1);assert.equal(audits,1);assert.doesNotMatch(JSON.stringify(data,(_,v)=>typeof v==='bigint'?String(v):v),/estadoPago|metodoPago|monto/);
});
