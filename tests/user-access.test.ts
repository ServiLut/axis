import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { loadServerModule } from "./load-server-module";
import type * as Auth from "../lib/auth";
import type * as Actions from "../app/(protected)/dashboard/usuarios/accesos/actions";

const secret="unit-test-only-never-production";
const base={userId:149,tenantId:4,tenantName:"PSICOLOGOS",username:"unit-test",nombre:"Test",apellido:"Test",role:"ADMIN",aprobado:true};
function authFixture(){
  const user={activo:true,aprobado:true,tenantId:4,rol:"ADMIN",authVersion:0};
  const module=loadServerModule<typeof Auth>("lib/auth.ts",{
    jsonwebtoken:jwt,"../prisma/generated/prisma/client":{},"./prisma":{usuario:{findUnique:async()=>user}},
  },{JWT_SECRET:secret});
  return {user,module,token:(extra:Record<string,unknown>={})=>jwt.sign({...base,...extra},secret,{expiresIn:"1h"})};
}
test("a suspended account loses access with an otherwise valid JWT",async()=>{
  const f=authFixture(),token=f.token();assert.ok(await f.module.verifyToken(token));
  f.user.activo=false;assert.equal(await f.module.verifyToken(token),null);
});
test("password reset and reactivation cannot revive older tokens",async()=>{
  const f=authFixture(),old=f.token();f.user.authVersion=1;
  assert.equal(await f.module.verifyToken(old),null);
  assert.ok(await f.module.verifyToken(f.token({authVersion:1})));
  f.user.authVersion=2;assert.equal(await f.module.verifyToken(f.token({authVersion:1})),null);
});
test("legacy version zero remains valid only for unchanged active approved accounts",async()=>{
  const f=authFixture();assert.ok(await f.module.verifyToken(f.token()));
  f.user.aprobado=false;assert.equal(await f.module.verifyToken(f.token()),null);
  f.user.aprobado=true;f.user.rol="ASESOR";assert.equal(await f.module.verifyToken(f.token()),null);
  f.user.rol="ADMIN";f.user.tenantId=2;assert.equal(await f.module.verifyToken(f.token()),null);
  assert.equal(await f.module.verifyToken("invalid"),null);
});

function actionsFixture(){
  let state={target:{id:149,tenantId:4,rol:"ADMIN",activo:true,aprobado:true,authVersion:0,password:"old-hash"},audits:[] as Array<Record<string,unknown>>};
  let actor={userId:164,tenantId:4,role:"ADMIN"};let failAudit=false;
  const tx={
    $queryRaw:async()=>[],
    usuario:{
      findFirst:async(q:{where:{id:number;tenantId:number}})=>q.where.tenantId!==4?null:q.where.id===164?{rol:"ADMIN"}:q.where.id===state.target.id?{...state.target}:null,
      count:async()=>1,
      update:async(q:{data:{activo?:boolean;authVersion:{increment:number};password?:string}})=>{Object.assign(state.target,{...q.data,authVersion:state.target.authVersion+q.data.authVersion.increment});return {...state.target}},
    },
  };
  const api=loadServerModule<typeof Actions>("app/(protected)/dashboard/usuarios/accesos/actions.ts",{
    "@/lib/auth":{verifyToken:async()=>actor},
    "@/lib/prisma":{$transaction:async(fn:(t:typeof tx)=>Promise<unknown>)=>{const before=structuredClone(state);try{return await fn(tx)}catch(err){state=before;throw err}},usuario:{findMany:async(q:{where:{tenantId:number}})=>{assert.equal(q.where.tenantId,actor.tenantId);return []}}},
    bcrypt:{hash:async()=>"bcrypt-unit-test-hash"},
    "node:buffer":{Buffer},
    "next/cache":{revalidatePath(){}},
    "@/lib/audit":{createAuditLog:async(q:Record<string,unknown>)=>{if(failAudit)throw Error("Audit failed");const {tx:unused,...safe}=q;state.audits.push(safe)}},
    "@/prisma/generated/prisma/client":{},
  });
  return {api,state:()=>state,actor:(x:typeof actor)=>actor=x,failAudit:()=>failAudit=true};
}
test("suspension and reactivation preserve history and increment revocation version",async()=>{
  const f=actionsFixture();assert.ok("success" in await f.api.setUserAccess("token",149,false,"Salida del equipo"));
  assert.equal(f.state().target.activo,false);assert.equal(f.state().target.authVersion,1);
  assert.ok("success" in await f.api.setUserAccess("token",149,true,"Reactivación autorizada"));
  assert.equal(f.state().target.activo,true);assert.equal(f.state().target.authVersion,2);assert.equal(f.state().audits.length,2);
});
test("password changes use a hash, revoke tokens, keep suspension and audit no password",async()=>{
  const f=actionsFixture();f.state().target.activo=false;
  assert.ok("success" in await f.api.resetUserPassword("token",149,"FixtureOnly42!","FixtureOnly42!"));
  assert.equal(f.state().target.password,"bcrypt-unit-test-hash");assert.equal(f.state().target.authVersion,1);assert.equal(f.state().target.activo,false);
  const audit=JSON.stringify(f.state().audits);assert.equal(audit.includes("FixtureOnly42!"),false);assert.equal(audit.includes("bcrypt-unit-test-hash"),false);
});
test("non-admin, cross-tenant, self and superadmin targets are denied",async()=>{
  const f=actionsFixture();f.actor({userId:164,tenantId:4,role:"ASESOR"});assert.ok("error" in await f.api.setUserAccess("token",149,false,"Valid reason"));
  f.actor({userId:164,tenantId:2,role:"ADMIN"});assert.ok("error" in await f.api.setUserAccess("token",149,false,"Valid reason"));
  f.actor({userId:149,tenantId:4,role:"ADMIN"});assert.ok("error" in await f.api.setUserAccess("token",149,false,"Valid reason"));
  f.actor({userId:164,tenantId:4,role:"ADMIN"});f.state().target.rol="SU_ADMIN";assert.ok("error" in await f.api.setUserAccess("token",149,false,"Valid reason"));
  assert.equal(f.state().target.activo,true);assert.equal(f.state().audits.length,0);
});
test("invalid password and audit failure leave credentials and status unchanged",async()=>{
  const f=actionsFixture();assert.ok("error" in await f.api.resetUserPassword("token",149,"short","short"));
  assert.ok("error" in await f.api.resetUserPassword("token",149,"LongEnough1","Different1"));
  f.failAudit();assert.ok("error" in await f.api.resetUserPassword("token",149,"LongEnough1","LongEnough1"));
  assert.equal(f.state().target.password,"old-hash");assert.equal(f.state().target.authVersion,0);
  assert.ok("error" in await f.api.setUserAccess("token",149,false,"Valid reason"));assert.equal(f.state().target.activo,true);
});
