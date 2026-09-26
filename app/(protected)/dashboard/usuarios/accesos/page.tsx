"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, Ban, CheckCircle2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getUserAccess, resetUserPassword, setUserAccess } from "./actions";

type Account = { id: number; nombre: string; apellido: string; username: string; rol: string | null; activo: boolean; aprobado: boolean | null };
export default function UserAccessPage() {
  const [users,setUsers]=useState<Account[]>([]),[currentId,setCurrentId]=useState<number>();
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [search,setSearch]=useState(""),[state,setState]=useState("all");
  const [target,setTarget]=useState<Account|null>(null),[mode,setMode]=useState<"password"|"status">("status");
  const [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[reason,setReason]=useState("");
  const [saving,setSaving]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);
    const result=await getUserAccess(localStorage.getItem("token")||"");
    if("error" in result){setError(result.error||"No se pudieron cargar los usuarios.");setUsers([]);}
    else{setError("");setUsers(result.users);setCurrentId(result.currentUserId);}
    setLoading(false);
  },[]);
  useEffect(()=>{void load()},[load]);
  const visible=useMemo(()=>users.filter(u=>(state==="all"||(state==="active")===u.activo)&&`${u.nombre} ${u.apellido} ${u.username}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))),[users,search,state]);
  const open=(user:Account,next:"password"|"status")=>{setTarget(user);setMode(next);setPassword("");setConfirmation("");setReason("")};
  const close=()=>{if(!saving){setTarget(null);setPassword("");setConfirmation("");setReason("")}};
  const submit=async()=>{
    if(!target)return;
    setSaving(true);
    try{
      const token=localStorage.getItem("token")||"";
      const result=mode==="password"?await resetUserPassword(token,target.id,password,confirmation):await setUserAccess(token,target.id,!target.activo,reason);
      if("error" in result)toast.error(result.error);
      else{toast.success(result.message);setTarget(null);setPassword("");setConfirmation("");setReason("");await load()}
    }catch{toast.error("No se pudo confirmar el cambio. Actualiza la lista antes de volver a intentarlo.")}
    finally{setSaving(false)}
  };
  return <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-50 p-3 text-blue-700"><ShieldCheck className="h-6 w-6"/></div><div><h1 className="text-2xl font-bold">Usuarios y accesos</h1><p className="mt-1 text-sm text-slate-600">Administra las cuentas del sistema actual. Los cambios quedan registrados en auditoría.</p></div></div>
    <div className="flex flex-wrap gap-3 text-sm"><span className="rounded-lg bg-emerald-50 px-4 py-2 text-emerald-800">{users.filter(u=>u.activo).length} activos</span><span className="rounded-lg bg-amber-50 px-4 py-2 text-amber-900">{users.filter(u=>!u.activo).length} suspendidos</span></div>
    <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><Input aria-label="Buscar usuario" placeholder="Buscar nombre o usuario" value={search} onChange={e=>setSearch(e.target.value)} className="pl-9"/></div><select aria-label="Estado del usuario" value={state} onChange={e=>setState(e.target.value)} className="rounded-md border bg-white px-3 py-2 text-sm"><option value="all">Todos los estados</option><option value="active">Activos</option><option value="suspended">Suspendidos</option></select><Button variant="outline" onClick={()=>void load()} disabled={loading}>Actualizar</Button></div>
    {error?<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>:<div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-4">Persona / usuario</th><th className="p-4">Rol</th><th className="p-4">Estado</th><th className="p-4">Acciones</th></tr></thead><tbody>{loading?<tr><td colSpan={4} className="p-8 text-center">Cargando usuarios…</td></tr>:visible.length?visible.map(u=><tr key={u.id} className="border-t"><td className="p-4"><div className="font-medium">{u.nombre} {u.apellido}{u.id===currentId&&<span className="ml-2 text-xs text-blue-700">Tu cuenta</span>}</div><div className="mt-1 text-xs text-slate-500">{u.username} · ID {u.id}</div></td><td className="p-4">{u.rol==="TECNICO"?"Profesional / técnico":u.rol==="ADMIN"?"Administrador":u.rol==="SU_ADMIN"?"Superadministrador":"Asesor"}</td><td className="p-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${u.activo?"bg-emerald-50 text-emerald-800":"bg-amber-50 text-amber-900"}`}>{u.activo?"Activo":"Suspendido"}</span>{!u.aprobado&&<div className="mt-2 text-xs text-slate-500">Pendiente de aprobación</div>}</td><td className="p-4"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={u.id===currentId} onClick={()=>open(u,"password")} aria-label={`Cambiar contraseña de ${u.username}`}><KeyRound className="mr-2 h-4 w-4"/>Contraseña</Button><Button size="sm" variant="outline" disabled={u.id===currentId} onClick={()=>open(u,"status")} aria-label={`${u.activo?"Suspender":"Reactivar"} ${u.username}`} className={u.activo?"text-amber-800":"text-emerald-800"}>{u.activo?<Ban className="mr-2 h-4 w-4"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>}{u.activo?"Suspender":"Reactivar"}</Button></div></td></tr>):<tr><td colSpan={4} className="p-8 text-center text-slate-500">No hay usuarios con ese filtro.</td></tr>}</tbody></table></div>}
    <p className="text-xs text-slate-500">Suspender conserva las citas, pagos e historial. Cambiar la contraseña no reactiva una cuenta suspendida. Para tu propia contraseña utiliza Configuración → Perfil.</p>
    <Dialog open={!!target} onOpenChange={open=>{if(!open)close()}}><DialogContent><DialogHeader><DialogTitle>{mode==="password"?"Cambiar contraseña":target?.activo?"Suspender usuario":"Reactivar usuario"}</DialogTitle><DialogDescription>{target?.nombre} {target?.apellido} · {target?.username}</DialogDescription></DialogHeader>
      <form onSubmit={e=>{e.preventDefault();void submit()}} className="space-y-4">
      {mode==="password"?<><label className="block text-sm">Nueva contraseña<Input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="block text-sm">Confirmar nueva contraseña<Input type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><p className="text-sm text-slate-600">Mínimo 8 caracteres. Se revocan los accesos anteriores; la persona deberá iniciar sesión otra vez.</p></>:<><p className="text-sm text-slate-600">{target?.activo?"Se bloqueará el acceso. Sus citas, pagos e historial se conservarán.":"Podrá iniciar sesión de nuevo si también tiene la aprobación requerida. Sus accesos anteriores no se recuperan."}</p><label className="block text-sm">Motivo<Input required minLength={5} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo del cambio"/></label></>}
      <DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving?"Guardando…":mode==="password"?"Cambiar contraseña":target?.activo?"Confirmar suspensión":"Confirmar reactivación"}</Button></DialogFooter></form>
    </DialogContent></Dialog>
  </main>;
}
