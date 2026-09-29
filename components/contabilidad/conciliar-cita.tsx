"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, ExternalLink, FileUp, Loader2 } from "lucide-react";
import { CobrosServicios } from "./cobros-servicios";
import { uploadComprobantePagoCita } from "@/app/(protected)/dashboard/citas/actions";
import { bogotaToday } from "@/lib/bogota-date";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function ConciliarCita({ citaId, comprobante, onSaved, onCancel }: {
  citaId: number; comprobante?: string | null; onSaved: () => void; onCancel: () => void;
}) {
  const [fecha, setFecha] = useState(bogotaToday);
  const [revision, setRevision] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState(comprobante || "");
  const [uploadError, setUploadError] = useState("");

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white">1</span>
        <div><h3 className="font-semibold text-teal-950">Registra el pago</h3><p className="text-xs text-teal-800">Solo el dinero que ya comprobaste.</p></div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cita-fecha-cobro" className="flex items-center gap-1.5 text-xs text-teal-900"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />Fecha en que recibiste el dinero</Label>
        <Input id="cita-fecha-cobro" type="date" value={fecha} max={bogotaToday()} disabled={saving} className="bg-white"
          onChange={e => { if (e.target.value && e.target.validity.valid) setFecha(e.target.value); }} />
      </div>
    </div>
    <CobrosServicios key={citaId} citaId={String(citaId)} fecha={fecha} revision={revision} soloCita
      onCancel={onCancel} onSavingChange={setSaving} onSaved={() => { setRevision(r => r + 1); onSaved(); }} />
    <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-800">2</span>
        <div><h3 className="font-semibold text-slate-900">Conserva el comprobante</h3><p className="text-xs text-slate-600">Puedes adjuntarlo antes o después de registrar el pago.</p></div>
      </div>
      <div className="space-y-2 rounded-lg border border-dashed border-violet-200 bg-white p-3">
        <Label htmlFor="cita-comprobante" className="flex items-center gap-2 text-slate-700"><FileUp className="h-4 w-4 text-violet-600" aria-hidden="true" />PDF o imagen · máximo 8 MB</Label>
        <Input id="cita-comprobante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploading || saving}
          aria-describedby={uploadError ? "cita-upload-error" : undefined}
          onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
            setUploading(true); setUploadError("");
            try {
              const token = localStorage.getItem("token"); if (!token) throw Error("Inicia sesión.");
              if (file.size > 8 * 1024 * 1024) throw Error("El comprobante debe pesar máximo 8 MB.");
              const form = new FormData(); form.append("file", file);
              const result = await uploadComprobantePagoCita(token, citaId, form);
              if ("error" in result) throw Error(result.error);
              setUrl(result.url); toast.success("Comprobante guardado."); onSaved();
            } catch (error) {
              setUploadError(error instanceof Error ? error.message : "No se pudo subir el comprobante. Selecciónalo de nuevo para reintentar.");
            } finally { setUploading(false); }
          }} />
        {uploading && <p role="status" className="flex items-center gap-2 text-sm text-violet-800"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Guardando tu comprobante…</p>}
        {uploadError && <p id="cita-upload-error" role="alert" className="text-sm text-red-700">{uploadError}</p>}
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-teal-800 underline underline-offset-4"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Ver comprobante guardado<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">Adjuntar un archivo guarda el soporte. El saldo cambia al registrar el pago; la imagen por sí sola no confirma un abono bancario.</p>
    </section>
  </div>;
}
