"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAJA_METHODS, type CajaMethod } from "@/lib/caja";
import { validatePagoServicio, type PagoServicioInput } from "@/lib/pago-servicio";
import { devolverPagoServicio, getCobroDesdeCita, getPagosServicioDelDia, getPendientesPsicologia, registrarPagoServicio } from "@/app/(protected)/dashboard/contabilidad/caja/pagos-actions";
import { toast } from "sonner";
import { bogotaToday } from "@/lib/bogota-date";
import { AlertCircle, CheckCircle2, Loader2, Wallet, RefreshCw } from "lucide-react";

type Item = { origen: "CITA" | "PAQUETE"; id: string; fecha: string; persona: string; valor: string;
  registrado: string; estado: string; situacion: "PENDIENTE" | "SIN_LIBRO" | "REVISAR_LEGADO" };
type Paid = { id: string; origen: string; origenId: string; monto: string; metodoPago: string; referencia: string; reversado: boolean };
const labels: Record<CajaMethod,string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta", OTRO: "Otro" };
const format = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const newLine = () => ({ metodoPago: "EFECTIVO" as CajaMethod, monto: "", referencia: "" });

export function CobrosServicios({ fecha, revision, onSaved, citaId, soloCita=false, onCancel, onSavingChange }: {
  fecha: string; revision: number; onSaved: () => void; citaId?: string; soloCita?:boolean;
  onCancel?: () => void; onSavingChange?: (saving: boolean) => void;
}) {
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
  const [historicoRevisado,setHistoricoRevisado]=useState(false);
  const [saving, setSaving] = useState(false);
  const requestId = useRef<string | null>(null);
  const [targetNotice, setTargetNotice] = useState("");
  const [targetError, setTargetError] = useState("");
  const [retry, setRetry] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const submitting = useRef(false);
  const paymentForm = useRef<HTMLFormElement>(null);
  useEffect(()=>{setHistoricoRevisado(false);},[selected?.id,selected?.origen]);
  useEffect(()=>{if(selected && !soloCita)paymentForm.current?.focus();},[selected?.id,selected?.origen,soloCita]);

  useEffect(() => {
    let cancelled = false;
    setSelected(null); setLines([newLine()]); setConfirmed(false); requestId.current=null; setSaveError("");
    if (!citaId) { setResolving(false); setTargetError(""); setTargetNotice(""); return; }
    setResolving(true); setTargetError(""); setTargetNotice("");
    async function resolveTarget() {
      try {
        const token=localStorage.getItem("token");
        if (!token) throw new Error("Inicia sesión para consultar el cobro de esta cita.");
        const result=await getCobroDesdeCita(token,citaId!);
        if (cancelled) return;
        if ("error" in result) throw new Error(result.error);
        if ("notice" in result) { setTargetNotice(result.notice); return; }
        setSelected(result.item);
        setTargetNotice(result.item.origen === "PAQUETE" ? "Este saldo pertenece al paquete completo. Sus sesiones no se cobran de nuevo." : "Puedes registrar el pago completo o un abono.");
      } catch(cause) { if (!cancelled) { setTargetNotice(""); setTargetError(cause instanceof Error ? cause.message : "No se pudo consultar el cobro seleccionado."); } }
      finally { if (!cancelled) setResolving(false); }
    }
    void resolveTarget();
    return () => { cancelled=true; };
  }, [citaId,revision,retry]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if(soloCita){setLoading(false);return;}
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
  }, [fecha, revision,soloCita]);

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
    if (!selected || submitting.current) return;
    submitting.current=true; setSaving(true); onSavingChange?.(true); setSaveError(""); setSavedNotice("");
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Inicia sesión para registrar pagos.");
      requestId.current ||= crypto.randomUUID();
      const input: PagoServicioInput = { origen: selected.origen, origenId: selected.id, fecha,
        solicitudId: requestId.current, confirmado: confirmed, lineas: lines, historicoRevisado };
      const validated = validatePagoServicio(input);
      const remaining = Math.round((Number(selected.valor) - Number(selected.registrado)) * 100);
      if (validated.totalCentavos > remaining) throw new Error("La suma supera el saldo mostrado. Actualiza el libro.");
      const result = await registrarPagoServicio(token, input);
      if ("error" in result) throw new Error(result.error);
      const notice=validated.totalCentavos===remaining ? "Pago guardado. El valor completo quedó registrado en el libro." : "Abono guardado. Ya actualizamos el saldo que falta registrar.";
      toast.success(notice); setSavedNotice(notice);
      requestId.current = null; setSelected(null); setLines([newLine()]); setConfirmed(false); onSaved();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "No pudimos confirmar el guardado. Conservamos los datos: reintenta con el mismo pago."); }
    finally { submitting.current=false; setSaving(false); onSavingChange?.(false); }
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

  return <section className={soloCita ? "space-y-4" : "space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"}>
    {savedNotice && <p role="status" className="flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{savedNotice}</p>}
    {resolving && <p role="status" className="flex items-center gap-2 rounded-xl bg-slate-50 p-5 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Estamos consultando el saldo…</p>}
    {targetNotice && <p role="status" className="text-sm leading-relaxed text-slate-600">{targetNotice}</p>}
    {targetError && <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4"><p role="alert" className="flex items-start gap-2 text-sm text-amber-950"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{targetError}</p><Button type="button" variant="outline" size="sm" onClick={()=>setRetry(r=>r+1)}><RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Volver a consultar</Button></div>}
    {selected && <form ref={paymentForm} tabIndex={-1} aria-label="Registro del pago seleccionado" onSubmit={save} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700 sm:p-5">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-teal-50 p-2.5 text-teal-700"><Wallet className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-xs font-medium text-slate-500">{selected.origen === "CITA" ? "Cita" : "Paquete"} #{selected.id}{citaId && selected.origen === "PAQUETE" ? ` · Cita #${citaId}` : ""}</p><h3 className="mt-1 font-semibold text-slate-900">{selected.persona || "Servicio seleccionado"}</h3></div></div>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:gap-4 sm:p-4">
        <div><p className="text-slate-500">Valor total</p><p className="mt-1 break-words font-semibold tabular-nums text-slate-900 sm:text-base">{format(Number(selected.valor))}</p></div>
        <div><p className="text-slate-500">Ya registrado</p><p className="mt-1 break-words font-semibold tabular-nums text-slate-900 sm:text-base">{format(Number(selected.registrado))}</p></div>
        <div><p className="font-medium text-teal-800">Por registrar</p><p className="mt-1 break-words font-bold tabular-nums text-teal-800 sm:text-lg">{format(Number(selected.valor)-Number(selected.registrado))}</p></div>
      </div>
      <fieldset disabled={saving} className="space-y-4 disabled:opacity-60">
      {lines.map((line, index) => <div className="grid gap-3 sm:grid-cols-3" key={index}>
        <div><Label htmlFor={`pago-metodo-${index}`}>Medio {index + 1}</Label><select id={`pago-metodo-${index}`} className="h-10 w-full rounded-md border bg-white px-2"
          value={line.metodoPago} onChange={(event) => { const copy=[...lines]; copy[index]={...line,metodoPago:event.target.value as CajaMethod}; setLines(copy); requestId.current=null; }}>
          {CAJA_METHODS.map((method) => <option key={method} value={method}>{labels[method]}</option>)}</select></div>
        <div><Label htmlFor={`pago-monto-${index}`}>Valor recibido</Label><Input id={`pago-monto-${index}`} type="number" min="0.01" step="0.01" required placeholder="Ej. 18900" value={line.monto}
          onChange={(event) => { const copy=[...lines]; copy[index]={...line,monto:event.target.value}; setLines(copy); requestId.current=null; }} /></div>
        <div><Label htmlFor={`pago-referencia-${index}`}>Referencia del pago</Label><Input id={`pago-referencia-${index}`} value={line.referencia} maxLength={120}
          placeholder={line.metodoPago === "EFECTIVO" && selected.situacion==='PENDIENTE' ? "Opcional en efectivo" : "Obligatoria"}
          onChange={(event) => { const copy=[...lines]; copy[index]={...line,referencia:event.target.value}; setLines(copy); requestId.current=null; }} /></div>
      </div>)}
      {selected.situacion!=='PENDIENTE'&&<label className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm"><input type="checkbox" required checked={historicoRevisado} onChange={e=>{setHistoricoRevisado(e.target.checked);requestId.current=null;}}/>Revisé este pago anterior: comprobé el dinero y que no existe ya en el libro diario. Estoy registrándolo en la fecha real en que se recibió, sin cobrar de nuevo.</label>}
      <label className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/50 p-3 text-sm leading-relaxed text-slate-700"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-teal-700" required checked={confirmed}
        onChange={(event) => { setConfirmed(event.target.checked); requestId.current=null; }} />
        Confirmo que recibí este dinero y revisé recibos, caja y banco para evitar registrar de nuevo un pago anterior.</label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={lines.length >= 4 || saving} onClick={() => {setLines([...lines,newLine()]);requestId.current=null;}}>+ Otro medio de pago</Button>
        {lines.length > 1 && <Button type="button" variant="outline" disabled={saving} onClick={() => {setLines(lines.slice(0,-1));requestId.current=null;}}>Quitar último</Button>}
      </div>
      </fieldset>
      {saveError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="ghost" disabled={saving} onClick={() => {
          if(onCancel){onCancel();return;}
          if(!soloCita)setSelected(null);
          setLines([newLine()]);setConfirmed(false);setSaveError("");requestId.current=null;
        }}>{soloCita && !onCancel ? "Limpiar valores" : "Cancelar"}</Button>
        <Button type="submit" className="bg-teal-700 text-white hover:bg-teal-800" disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Guardando pago…</> : <><CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />Guardar pago</>}</Button>
      </div>
    </form>}
    {soloCita && !selected && !resolving && !targetError && onCancel && <div className="flex justify-end"><Button type="button" variant="outline" onClick={onCancel}>Listo, cerrar</Button></div>}
    {!soloCita&&<><div><h2 className="text-lg font-semibold">Consultas y paquetes pendientes</h2>
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
          <th className="p-2">Fecha</th><th className="p-2">Origen</th><th className="p-2">Paciente / profesional</th><th className="p-2 text-right">Saldo sin registrar</th><th className="p-2">Revisión</th>
        </tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={5} className="p-4 text-slate-600">No hay pendientes en el rango consultado.</td></tr> : items.map((item) =>
          <tr key={`${item.origen}-${item.id}`} className={`border-t ${item.situacion === "SIN_LIBRO" || item.fecha < fecha && item.situacion === "PENDIENTE" ? "bg-red-50" : ""}`}>
            <td className="p-2">{item.fecha}</td><td className="p-2">{item.origen === "CITA" ? "Cita" : "Paquete"} #{item.id}</td>
            <td className="p-2">{item.persona || "Sin nombre"}</td><td className="p-2 text-right tabular-nums">{format(Number(item.valor) - Number(item.registrado))}</td>
            <td className="space-y-2 p-2">{item.situacion === "REVISAR_LEGADO" ? <p className="text-amber-800">Estado anterior: verificar soporte</p> :
              item.situacion === "SIN_LIBRO" ? <p className="font-semibold text-amber-800">Marcada como cobrada sin ingreso en libro: revisar</p> : null}
              <Button size="sm" variant="outline" onClick={() => { setSelected(item); setHistoricoRevisado(false); setTargetNotice(""); setTargetError(""); setSaveError(""); setSavedNotice(""); setLines([newLine()]); setConfirmed(false); requestId.current = null; }}>{item.situacion==='PENDIENTE'?'Registrar pago':'Revisar pago anterior'}</Button></td>
          </tr>)}</tbody></table>
      </div>
      {items.length < summary.total && <Button type="button" variant="outline" disabled={loadingMore} onClick={loadMore}>
        {loadingMore ? "Cargando…" : "Cargar 200 registros más"}</Button>}
    </>}
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
    </div>}</>}
  </section>;
}
