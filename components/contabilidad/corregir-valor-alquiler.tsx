"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { correctRentalPrice, getRentalPriceCorrection, type RentalPriceSnapshot } from "@/app/(protected)/dashboard/citas/price-actions";

const cop = (value: string) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value));

export function CorregirValorAlquiler({ citaId, disabled, onSaved }: { citaId: number; disabled: boolean; onSaved: () => void }) {
  const [snapshot, setSnapshot] = useState<RentalPriceSnapshot | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("token");
    if (token) getRentalPriceCorrection(token, String(citaId)).then(result => {
      if (!active) return;
      if ("snapshot" in result) { setSnapshot(result.snapshot); setValue(result.snapshot.valorCita); }
      else setError(result.error);
    });
    return () => { active = false; };
  }, [citaId]);

  if (!snapshot) return error ? <p className="text-sm text-slate-600">{error}</p> : null;
  return <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
    <h3 className="font-semibold">Corregir un valor ingresado por error</h3>
    <p className="text-sm">Cita: {cop(snapshot.valorCita)} · Paquete: {cop(snapshot.valorPaquete)} · Pago registrado: {cop(snapshot.registrado)}</p>
    <p className="text-sm text-slate-600">La corrección actualiza la cita y su paquete. Conserva el horario, el comprobante y el dinero ya registrado.</p>
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="correction-value">Valor correcto del alquiler</Label>
        <Input id="correction-value" type="number" min="0.01" max="999999999.99" step="0.01" value={value} disabled={saving || disabled}
          onChange={e => { setValue(e.target.value); setConfirmed(false); }} /></div>
      <div className="space-y-1"><Label htmlFor="correction-reason">Motivo de la corrección</Label>
        <Input id="correction-reason" minLength={10} maxLength={240} value={reason} disabled={saving || disabled} onChange={e => setReason(e.target.value)} /></div>
    </div>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving || disabled}
      onChange={e => setConfirmed(e.target.checked)} />Verifiqué que este es el valor acordado para este alquiler.</label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <Button type="button" disabled={saving || disabled || !confirmed || reason.trim().length < 10} onClick={async () => {
      const token = localStorage.getItem("token"); if (!token) return;
      setSaving(true); setError("");
      try {
        const result = await correctRentalPrice(token, { expected: snapshot, valor: value, motivo: reason });
        if ("error" in result) { setError(result.error || "No se pudo guardar la corrección."); return; }
        toast.success(result.changed ? "Valor corregido. El pago existente se conservó." : "El valor ya estaba correcto."); onSaved();
      } catch { setError("No se pudo confirmar el resultado. Actualiza la pantalla antes de reintentar."); }
      finally { setSaving(false); }
    }}>{saving ? "Guardando…" : "Guardar corrección de valor"}</Button>
  </section>;
}
