"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAJA_METHODS, type CajaMethod } from "@/lib/caja";
import { validatePagoServicio, type PagoServicioInput } from "@/lib/pago-servicio";
import { devolverPagoServicio, getPagosServicioDelDia, getPendientesPsicologia, registrarPagoServicio } from "@/app/(protected)/dashboard/contabilidad/caja/pagos-actions";
import { toast } from "sonner";
import { bogotaToday } from "@/lib/bogota-date";

type Item = { origen: "CITA" | "PAQUETE"; id: string; fecha: string; persona: string; valor: string;
  registrado: string; estado: string; situacion: "PENDIENTE" | "SIN_LIBRO" | "REVISAR_LEGADO" };
type Paid = { id: string; origen: string; origenId: string; monto: string; metodoPago: string; referencia: string; reversado: boolean };
const labels: Record<CajaMethod,string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta", OTRO: "Otro" };
const format = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const newLine = () => ({ metodoPago: "EFECTIVO" as CajaMethod, monto: "", referencia: "" });

export function CobrosServicios({ fecha, revision, onSaved }: { fecha: string; revision: number; onSaved: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState({ total: 0, vencidos: 0, sinLibro: 0, legado: 0,
    valorVencido: "0.00", valorSinLibro: "0.00" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagos, setPagos] = useState<Paid[]>([]);
  const [admin, setAdmin] = useState(false);
  const [refundId, setRefundId] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundDate, setRefundDate] = useState(() => bogotaToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [lines, setLines] = useState([newLine()]);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Inicia sesión para consultar saldos.");
        const [result, paidResult] = await Promise.all([getPendientesPsicologia(token, fecha), getPagosServicioDelDia(token, fecha)]);
        if (cancelled) return;
        if ("error" in result) throw new Error(result.error);
        if ("error" in paidResult) throw new Error(paidResult.error);
        setItems(result.items);
        setSummary(result.summary);
        setPagos(paidResult.pagos);
        setAdmin(paidResult.admin);
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudieron consultar saldos."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [fecha, revision]);

  async function loadMore() {
    if (loadingMore || items.length >= summary.total) return;
    setLoadingMore(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Inicia sesión.");
      const result = await getPendientesPsicologia(token,fecha,items.length);
      if ("error" in result) throw new Error(result.error);
      setItems((before) => [...before,...result.items]);
      setSummary(result.summary);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo cargar la siguiente página."); }
    finally { setLoadingMore(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Inicia sesión para registrar pagos.");
      requestId.current ||= crypto.randomUUID();
      const input: PagoServicioInput = { origen: selected.origen, origenId: selected.id, fecha,
        solicitudId: requestId.current, confirmado: confirmed, lineas: lines };
      const validated = validatePagoServicio(input);
      const remaining = Math.round((Number(selected.valor) - Number(selected.registrado)) * 100);
      if (validated.totalCentavos > remaining) throw new Error("La suma supera el saldo mostrado. Actualiza el libro.");
      const result = await registrarPagoServicio(token, input);
      if ("error" in result) throw new Error(result.error);
      toast.success("Pago registrado en el libro con su medio y fecha.");
      requestId.current = null; setSelected(null); setLines([newLine()]); setConfirmed(false); onSaved();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo registrar el pago."); }
    finally { setSaving(false); }
  }

  async function refund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!refundId || saving) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Inicia sesión.");
      const result = await devolverPagoServicio(token, refundId, refundDate, refundReason, crypto.randomUUID());
      if ("error" in result) throw new Error(result.error);
      toast.success("Devolución registrada en el libro. Confirma por separado la salida bancaria o de caja.");
      setRefundId(""); setRefundReason(""); onSaved();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo registrar la devolución."); }
    finally { setSaving(false); }
  }

  return <section className="space-y-4 rounded-lg border bg-white p-5">
    <div><h2 className="text-lg font-semibold">Consultas y paquetes pendientes</h2>
      <p className="text-sm text-slate-600">El rojo indica una cita o compra anterior sin el valor completo registrado en este libro. Comprueba recibos y banco antes de cobrar: el estado heredado no demuestra una deuda.</p></div>
    {loading ? <p role="status">Revisando saldos…</p> : error ? <p role="alert" className="text-red-700">{error}</p> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900"><strong>{summary.vencidos}</strong> registros anteriores sin pago completo en libro · {format(Number(summary.valorVencido))} por revisar</p>
        <p className="rounded-md border bg-slate-50 p-3"><strong>{summary.total}</strong> registros con saldo sin asiento · {summary.sinLibro} marcados como cobrados sin asiento ({format(Number(summary.valorSinLibro))})</p>
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"><strong>{summary.legado}</strong> estados históricos para verificar</p>
      </div>
      <p className="text-xs text-slate-500">Se muestran {items.length} de {summary.total} registros; carga más para revisar toda la lista. Un pago de paquete se registra una vez en el paquete; sus sesiones no se vuelven a sumar como ingreso.</p>
      <div className="max-h-80 overflow-auto rounded-md border">
        <table className="w-full min-w-[650px] text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr>
          <th className="p-2">Fecha</th><th className="p-2">Origen</th><th className="p-2">Cliente</th><th className="p-2 text-right">Saldo sin registrar</th><th className="p-2">Revisión</th>
        </tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={5} className="p-4 text-slate-600">No hay pendientes en el rango consultado.</td></tr> : items.map((item) =>
          <tr key={`${item.origen}-${item.id}`} className={`border-t ${item.situacion === "SIN_LIBRO" || item.fecha < fecha && item.situacion === "PENDIENTE" ? "bg-red-50" : ""}`}>
            <td className="p-2">{item.fecha}</td><td className="p-2">{item.origen === "CITA" ? "Cita" : "Paquete"} #{item.id}</td>
            <td className="p-2">{item.persona || "Sin nombre"}</td><td className="p-2 text-right tabular-nums">{format(Number(item.valor) - Number(item.registrado))}</td>
            <td className="p-2">{item.situacion === "REVISAR_LEGADO" ? <span className="text-amber-800">Estado anterior: verificar soporte</span> :
              item.situacion === "SIN_LIBRO" ? <span className="font-semibold text-red-800">Marcada como cobrada sin ingreso en libro: revisar</span> :
              <Button size="sm" variant="outline" onClick={() => { setSelected(item); setLines([newLine()]); setConfirmed(false); requestId.current = null; }}>Registrar pago</Button>}</td>
          </tr>)}</tbody></table>
      </div>
      {items.length < summary.total && <Button type="button" variant="outline" disabled={loadingMore} onClick={loadMore}>
        {loadingMore ? "Cargando…" : "Cargar 200 registros más"}</Button>}
    </>}
    {selected && <form onSubmit={save} className="space-y-4 rounded-md border border-blue-200 bg-blue-50 p-4">
      <div><h3 className="font-semibold">Cobro de {selected.origen === "CITA" ? "cita" : "paquete"} #{selected.id}</h3>
        <p className="text-sm">Saldo mostrado: {format(Number(selected.valor) - Number(selected.registrado))}. Fecha del dinero recibido: {fecha}.</p></div>
      {lines.map((line, index) => <div className="grid gap-3 sm:grid-cols-3" key={index}>
        <div><Label htmlFor={`pago-metodo-${index}`}>Medio {index + 1}</Label><select id={`pago-metodo-${index}`} className="h-10 w-full rounded-md border bg-white px-2"
          value={line.metodoPago} onChange={(event) => { const copy=[...lines]; copy[index]={...line,metodoPago:event.target.value as CajaMethod}; setLines(copy); requestId.current=null; }}>
          {CAJA_METHODS.map((method) => <option key={method} value={method}>{labels[method]}</option>)}</select></div>
        <div><Label htmlFor={`pago-monto-${index}`}>Valor recibido</Label><Input id={`pago-monto-${index}`} type="number" min="0.01" step="0.01" required value={line.monto}
          onChange={(event) => { const copy=[...lines]; copy[index]={...line,monto:event.target.value}; setLines(copy); requestId.current=null; }} /></div>
        <div><Label htmlFor={`pago-referencia-${index}`}>Referencia del pago</Label><Input id={`pago-referencia-${index}`} value={line.referencia} maxLength={120}
          placeholder={line.metodoPago === "EFECTIVO" ? "Opcional en efectivo" : "Obligatoria"}
          onChange={(event) => { const copy=[...lines]; copy[index]={...line,referencia:event.target.value}; setLines(copy); requestId.current=null; }} /></div>
      </div>)}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={confirmed}
        onChange={(event) => { setConfirmed(event.target.checked); requestId.current=null; }} />
        Confirmo que recibí este dinero y revisé recibos, caja y banco para evitar registrar de nuevo un pago anterior.</label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={lines.length >= 4 || saving} onClick={() => setLines([...lines,newLine()])}>+ Otro medio</Button>
        {lines.length > 1 && <Button type="button" variant="outline" disabled={saving} onClick={() => setLines(lines.slice(0,-1))}>Quitar último</Button>}
        <Button type="submit" disabled={saving}>{saving ? "Registrando…" : "Confirmar dinero recibido"}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => { setSelected(null); requestId.current=null; }}>Cancelar</Button></div>
    </form>}
    {!loading && !error && <div className="space-y-2"><h3 className="font-semibold">Pagos de citas y paquetes registrados el {fecha}</h3>
      <div className="max-h-56 overflow-auto rounded-md border"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-100"><tr>
        <th className="p-2">Pago</th><th className="p-2">Origen</th><th className="p-2">Medio</th><th className="p-2 text-right">Valor</th><th className="p-2">Estado</th>
      </tr></thead><tbody>{pagos.length ? pagos.map((pago) => <tr key={pago.id} className="border-t"><td className="p-2">#{pago.id}</td>
        <td className="p-2">{pago.origen} #{pago.origenId}</td><td className="p-2">{labels[pago.metodoPago as CajaMethod] || pago.metodoPago}</td>
        <td className="p-2 text-right">{format(Number(pago.monto))}</td><td className="p-2">{pago.reversado ? "Devuelto" : admin ?
          <Button type="button" size="sm" variant="outline" onClick={() => { setRefundId(pago.id); setRefundReason(""); setRefundDate(bogotaToday()); }}>Registrar devolución</Button> : "Registrado"}</td>
      </tr>) : <tr><td colSpan={5} className="p-3 text-slate-500">No hay pagos de citas o paquetes registrados este día.</td></tr>}</tbody></table></div>
      {refundId && <form onSubmit={refund} className="flex flex-wrap items-end gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
        <div className="min-w-64 flex-1"><Label htmlFor="refund-reason">Motivo de la devolución efectuada del pago #{refundId}</Label>
          <Input id="refund-reason" required minLength={5} maxLength={180} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} /></div>
        <div><Label htmlFor="refund-date">Fecha del dinero devuelto</Label><Input id="refund-date" type="date" required max={bogotaToday()} value={refundDate} onChange={(e) => setRefundDate(e.target.value)} /></div>
        <Button disabled={saving} type="submit">Confirmar devolución realizada</Button>
        <Button type="button" variant="ghost" onClick={() => setRefundId("")}>Cancelar</Button>
        <p className="w-full text-xs text-amber-900">Este registro no envía dinero. Úsalo solamente después de efectuar la devolución en el mismo medio.</p>
      </form>}
    </div>}
  </section>;
}
