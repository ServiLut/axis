"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bogotaToday } from "@/lib/bogota-date";
import { CAJA_METHODS, summarizeCaja, validateCajaInput, type CajaInput, type CajaMovement } from "@/lib/caja";
import { createCajaMovement, getCajaMovements } from "@/app/(protected)/dashboard/contabilidad/caja/actions";
import { toast } from "sonner";

const methodLabels = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta", OTRO: "Otro" };
const currency = (cents: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(cents / 100);
const emptyForm = { tipo: "INGRESO" as CajaInput["tipo"], metodoPago: "EFECTIVO" as CajaInput["metodoPago"], monto: "", concepto: "", referencia: "" };
const selectClass = "h-11 w-full rounded-md border border-input bg-white px-3 text-sm";

export function CajaDiaria() {
  const [fecha, setFecha] = useState(() => bogotaToday());
  const [movements, setMovements] = useState<CajaMovement[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Inicia sesión para consultar la caja.");
        const result = await getCajaMovements(token, fecha);
        if (cancelled) return;
        if (result.error) throw new Error(result.error);
        setMovements(result.movements || []);
      } catch (cause) {
        if (!cancelled) {
          setMovements([]);
          setError(cause instanceof Error ? cause.message : "No se pudo cargar la caja.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [fecha, revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Inicia sesión para registrar movimientos.");
      requestId.current ||= crypto.randomUUID();
      const input = validateCajaInput({ ...form, fecha, solicitudId: requestId.current });
      const result = await createCajaMovement(token, input);
      if (result.error) throw new Error(result.error);
      toast.success("Movimiento registrado.");
      requestId.current = null;
      setForm(emptyForm);
      setRevision((value) => value + 1);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "No se pudo confirmar el registro. Reintenta con los mismos datos.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const summary = summarizeCaja(movements);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Caja diaria</h1>
          <p className="mt-2 text-sm text-slate-600">{process.env.NEXT_PUBLIC_RECEPCION_ENABLED === "true"
            ? "Los pagos y devoluciones de impresiones y adicionales aparecen automáticamente. Registra aquí otros movimientos una sola vez. Los pagos base de citas conservan su circuito actual."
            : "Registra ingresos y gastos manuales. Este registro es independiente de los cobros de citas."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="caja-fecha">Día de los movimientos</Label>
          <Input id="caja-fecha" type="date" value={fecha} max={bogotaToday()} disabled={saving} className="w-auto bg-white"
            onChange={(e) => { if (e.target.value && e.target.validity.valid) setFecha(e.target.value); }} />
          <Button variant="outline" disabled={saving} onClick={() => setRevision((value) => value + 1)}>Actualizar</Button>
        </div>

        {loading ? <p role="status">Cargando movimientos…</p> : error ? (
          <p role="alert" className="text-red-700">{error}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {[["Ingresos del día", summary.ingresos], ["Egresos del día", summary.egresos], ["Neto del día", summary.neto]].map(([label, amount]) => (
                <div key={label} className="rounded-lg border bg-white p-5"><p className="text-sm text-slate-600">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{currency(Number(amount))}</p></div>
              ))}
            </div>
            <p className="text-xs text-slate-500">El neto corresponde a ingresos menos egresos de este día. No incluye saldo inicial ni movimientos de otros días.</p>
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-left text-sm">
                <caption className="p-3 text-left font-semibold">Totales por medio de pago</caption>
                <thead className="bg-slate-100"><tr><th scope="col" className="p-3">Medio</th><th scope="col" className="p-3 text-right">Ingresos</th><th scope="col" className="p-3 text-right">Egresos</th><th scope="col" className="p-3 text-right">Neto</th></tr></thead>
                <tbody>{summary.methods.map((method) => <tr key={method.metodoPago} className="border-t">
                  <th scope="row" className="p-3 font-medium">{methodLabels[method.metodoPago]}</th>
                  <td className="p-3 text-right tabular-nums">{currency(method.ingresos)}</td><td className="p-3 text-right tabular-nums">{currency(method.egresos)}</td><td className="p-3 text-right tabular-nums">{currency(method.neto)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>
        )}

        <form onSubmit={save} className="rounded-lg border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Nuevo movimiento</h2>
          <fieldset disabled={saving || loading || Boolean(error)} className="grid gap-4 md:grid-cols-3 disabled:opacity-60">
            <div className="space-y-2"><Label htmlFor="caja-tipo">Tipo</Label>
              <select id="caja-tipo" className={selectClass} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as CajaInput["tipo"] })}>
                <option value="INGRESO">Ingreso</option><option value="EGRESO">Egreso</option>
              </select></div>
            <div className="space-y-2"><Label htmlFor="caja-metodo">Medio de pago</Label>
              <select id="caja-metodo" className={selectClass} value={form.metodoPago} onChange={(e) => setForm({ ...form, metodoPago: e.target.value as CajaInput["metodoPago"] })}>
                {CAJA_METHODS.map((method) => <option value={method} key={method}>{methodLabels[method]}</option>)}
              </select></div>
            <div className="space-y-2"><Label htmlFor="caja-monto">Valor en pesos colombianos</Label>
              <Input id="caja-monto" type="number" min="0.01" max="999999999.99" step="0.01" required placeholder="Ej. 25000" value={form.monto}
                className="h-11" onChange={(e) => setForm({ ...form, monto: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="caja-concepto">Concepto</Label>
              <Input id="caja-concepto" required minLength={3} maxLength={240} placeholder="Ej. Compra de papelería" value={form.concepto}
                className="h-11" onChange={(e) => setForm({ ...form, concepto: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="caja-referencia">Referencia o comprobante (opcional)</Label>
              <Input id="caja-referencia" maxLength={120} placeholder="Ej. Factura 123" value={form.referencia}
                className="h-11" onChange={(e) => setForm({ ...form, referencia: e.target.value })} /></div>
            <div className="md:col-span-3"><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Registrar movimiento"}</Button></div>
          </fieldset>
        </form>

        {!loading && !error && <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <caption className="p-3 text-left font-semibold">Movimientos del {fecha}</caption>
            <thead className="bg-slate-100"><tr>{["Tipo", "Concepto", "Medio", "Valor", "Referencia", "Registrado por"].map((title) => <th scope="col" key={title} className="p-3">{title}</th>)}</tr></thead>
            <tbody>{movements.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-slate-500">No hay movimientos registrados para esta fecha.</td></tr> : movements.map((movement) => <tr key={movement.id} className="border-t">
              <td className="p-3">{movement.tipo === "INGRESO" ? "Ingreso" : "Egreso"}</td><td className="max-w-xs break-words p-3">{movement.concepto}</td>
              <td className="p-3">{methodLabels[movement.metodoPago]}</td><td className="whitespace-nowrap p-3 tabular-nums">{currency(Math.round(Number(movement.monto) * 100))}</td>
              <td className="p-3">{movement.referencia || "—"}</td><td className="p-3">{movement.creadoPor}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}
