"use client";
import {useState} from 'react';
import {CobrosServicios} from './cobros-servicios';
import {uploadComprobantePagoCita} from '@/app/(protected)/dashboard/citas/actions';
import {bogotaToday} from '@/lib/bogota-date';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {toast} from 'sonner';

export function ConciliarCita({citaId,comprobante,onSaved}:{citaId:number;comprobante?:string|null;onSaved:()=>void}){
 const [fecha,setFecha]=useState(bogotaToday);const [revision,setRevision]=useState(0);
 const [uploading,setUploading]=useState(false);const [url,setUrl]=useState(comprobante||'');
 return <div className="space-y-4">
  <p className="text-sm">Registra el importe recibido y su medio de pago. Al completar el valor, la cita queda <strong>CONCILIADA</strong> y el ingreso aparece en el libro diario. Los paquetes se registran una sola vez.</p>
  <div className="space-y-2"><Label htmlFor="cita-comprobante">Comprobante (PDF o imagen, máximo 8 MB)</Label>
   <Input id="cita-comprobante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploading} onChange={async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    setUploading(true);
    try{const token=localStorage.getItem('token');if(!token)throw Error('Inicia sesión.');
     if(file.size>8*1024*1024)throw Error('El comprobante debe pesar máximo 8 MB.');
     const form=new FormData();form.append('file',file);const result=await uploadComprobantePagoCita(token,citaId,form);
     if('error' in result)throw Error(result.error);setUrl(result.url);toast.success('Comprobante guardado.');onSaved();
    }catch(error){toast.error(error instanceof Error?error.message:'No se pudo subir el comprobante.');}finally{setUploading(false)}
   }}/>
   {uploading&&<p role="status">Subiendo comprobante…</p>}
   {url&&<a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 underline">Ver comprobante guardado</a>}
   <p className="text-xs text-slate-600">Adjuntar el comprobante conserva el soporte; confirma el dinero recibido en el formulario inferior.</p>
  </div>
  <div><Label htmlFor="cita-fecha-cobro">Fecha en que se recibió el dinero</Label><Input id="cita-fecha-cobro" type="date" value={fecha} max={bogotaToday()} onChange={e=>setFecha(e.target.value)}/></div>
  <CobrosServicios key={citaId} citaId={String(citaId)} fecha={fecha} revision={revision} soloCita onSaved={()=>{setRevision(r=>r+1);onSaved()}}/>
 </div>;
}
