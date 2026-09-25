"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Printer, Clock3, Wallet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bogotaToday } from "@/lib/bogota-date";
import { CAJA_METHODS, type CajaMethod } from "@/lib/caja";
import { receptionSummary, type CargoInput, type PagoInput, type ReceptionCode } from "@/lib/recepcion";
import { getReceptionData, createReceptionCharge, recordReceptionPayment, cancelReceptionCharge,
  refundReceptionPayment, updateReceptionRate } from "@/app/(protected)/dashboard/recepcion/actions";

type Data = Exclude<Awaited<ReturnType<typeof getReceptionData>>, { error: string }>;
const money = (value: string | number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
const time = (iso: string) => iso ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "—";
const selectStyle = "h-11 w-full rounded-md border bg-white px-3 text-sm";
const methods: Record<CajaMethod, string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta", OTRO: "Otro" };
function token() { const value = localStorage.getItem("token"); if (!value) throw new Error("Inicia sesión."); return value; }
type Operation = { kind: "cargo"; input: CargoInput } | { kind: "pago"; input: PagoInput };

export function Recepcion() {
  const [fecha, setFecha] = useState(bogotaToday);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState<CargoInput["tipo"]>("IMPRESION");
  const [profesionalId, setProfesionalId] = useState("");
  const [citaId, setCitaId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [minutos, setMinutos] = useState("1");
  const [nota, setNota] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [metodo, setMetodo] = useState<CajaMethod>("EFECTIVO");
  const [referencia, setReferencia] = useState("");
  const [fechaPago, setFechaPago] = useState(bogotaToday);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<Operation | null>(null);
  const [adjustment, setAdjustment] = useState<{ kind: "anular" | "devolver"; id: string; reason: string; fecha: string; requestId: string } | null>(null);
  const [rateCode, setRateCode] = useState<ReceptionCode>("EXTRA_CORTO");
  const [rate, setRate] = useState("");
  const [rateReason, setRateReason] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    Promise.resolve().then(() => getReceptionData(token(), fecha)).then((result) => {
      if (!active) return;
      if ("error" in result) { setError(result.error); setData(null); }
      else setData(result);
    }).catch(() => { if (active) { setError("No se pudo cargar recepción. Reintenta."); setData(null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fecha, revision]);

  async function run(operation: Operation) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setPending(operation);
    try {
      const result = operation.kind === "cargo" ? await createReceptionCharge(token(), operation.input) : await recordReceptionPayment(token(), operation.input);
      if ("error" in result) {
        // The server responded after rolling back: correction may reuse the same request ID.
        toast.error(result.error); setPending(null); return;
      }
      setPending(null); setRevision((v) => v + 1);
      if (operation.kind === "cargo") { setCantidad("1"); setNota(""); toast.success(`Cargo ${result.id} registrado. Sigue pendiente de pago.`); }
      else { setSelected({}); setReferencia(""); setConfirmed(false); toast.success(`Pago ${result.id} registrado en caja una sola vez.`); }
    } catch { toast.error("Respuesta interrumpida. Reintenta la misma operación con el botón de abajo."); }
    finally { setBusy(false); inFlight.current = false; }
  }
  function saveCargo(e: FormEvent) {
    e.preventDefault();
    void run({ kind: "cargo", input: { solicitudId: crypto.randomUUID(), fecha, profesionalId: Number(profesionalId), citaId,
      tipo, cantidad: Number(cantidad), ...(tipo === "TIEMPO_EXTRA" ? { minutosExtra: Number(minutos) } : {}), nota } });
  }
  function savePago(e: FormEvent) {
    e.preventDefault(); if (!confirmed) return;
    void run({ kind: "pago", input: { solicitudId: crypto.randomUUID(), fecha: fechaPago, metodoPago: metodo, referencia,
      aplicaciones: Object.entries(selected).map(([cargoId, monto]) => ({ cargoId, monto })) } });
  }
  async function adjust(e: FormEvent) {
    e.preventDefault(); if (!adjustment || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const result = adjustment.kind === "anular" ? await cancelReceptionCharge(token(), adjustment.id, adjustment.reason)
        : await refundReceptionPayment(token(), adjustment.id, adjustment.fecha, adjustment.reason, adjustment.requestId);
      if ("error" in result) throw new Error(result.error);
      toast.success("Corrección registrada con trazabilidad."); setAdjustment(null); setRevision((v) => v + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Reintenta la misma corrección."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function saveRate(e: FormEvent) {
    e.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const result = await updateReceptionRate(token(), rateCode, rate, rateReason);
      if ("error" in result) throw new Error(result.error);
      toast.success("Tarifa actualizada para nuevos cargos."); setRate(""); setRateReason(""); setRevision((v) => v + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo confirmar la tarifa."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const summary = receptionSummary(data?.cargos || []);
  const professionalReservations = data?.reservas.filter((r) => r.profesionalId === Number(profesionalId)) || [];
  const serviceCode = tipo === "IMPRESION" ? "IMPRESION" : Number(minutos) <= 15 ? "EXTRA_CORTO" : Number(minutos) <= 30 ? "EXTRA_MEDIO" : "EXTRA_HORA";
  const service = data?.catalogo.find((s) => s.codigo === serviceCode);
  const selectedOwner = data?.cargos.find((c) => selected[c.id] !== undefined)?.profesionalId;
  const frozen = busy || loading || !!error || !!pending;

  return <main className="h-full overflow-y-auto bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Recepción · Psicología</h1>
      <p className="mt-1 text-sm text-slate-600">Impresiones y adicionales, con sus cargos y pagos separados.</p></div>
      <Button variant="outline" asChild><Link href="/dashboard/contabilidad/caja"><Wallet className="mr-2 h-4 w-4" />Libro diario</Link></Button></header>
    <div className="flex flex-wrap items-end gap-3"><div><Label htmlFor="recepcion-fecha">Fecha de los cargos</Label>
      <Input id="recepcion-fecha" type="date" value={fecha} disabled={busy || !!pending} onChange={(e) => { setFecha(e.target.value); setSelected({}); setCitaId(""); }} /></div>
      <Button variant="outline" disabled={busy || !!pending} onClick={() => setRevision((v) => v + 1)}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
      <p className="text-xs text-slate-500">Para cobrar un cargo anterior, selecciona su fecha. El pago conserva su propia fecha.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {loading && <p role="status">Cargando recepción…</p>}
    {pending && !busy && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      La respuesta quedó pendiente. Reintenta la misma operación para consultar o completar el registro sin duplicarlo.
      <Button className="ml-3" onClick={() => void run(pending)}>Reintentar operación</Button></div>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-3">{[["Cargos vigentes del día", summary.ventas], ["Pagos aplicados a esos cargos", summary.aplicado], ["Saldo pendiente", summary.pendiente]].map(([label, value]) =>
        <section className="rounded-xl border bg-white p-5" key={label}><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{money(Number(value) / 100)}</p></section>)}</div>
      <form onSubmit={saveCargo} className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Registrar servicio</h2>
        <fieldset disabled={frozen} className="space-y-4"><div className="flex flex-wrap gap-2">
          <Button type="button" variant={tipo === "IMPRESION" ? "default" : "outline"} onClick={() => setTipo("IMPRESION")}><Printer className="mr-2 h-4 w-4" />Impresiones</Button>
          <Button type="button" variant={tipo === "TIEMPO_EXTRA" ? "default" : "outline"} onClick={() => setTipo("TIEMPO_EXTRA")}><Clock3 className="mr-2 h-4 w-4" />Tiempo extra</Button></div>
          <div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label htmlFor="recepcion-profesional">Profesional</Label>
            <select id="recepcion-profesional" className={selectStyle} required value={profesionalId} onChange={(e) => { setProfesionalId(e.target.value); setCitaId(""); }}>
              <option value="">Seleccionar profesional</option>{data.profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="recepcion-reserva">Reserva {tipo === "IMPRESION" ? "(opcional)" : "de alquiler"}</Label>
              <select id="recepcion-reserva" className={selectStyle} value={citaId} required={tipo === "TIEMPO_EXTRA"} onChange={(e) => setCitaId(e.target.value)}>
                <option value="">Seleccionar reserva</option>{professionalReservations.map((r) => <option key={r.id} value={r.id}>CITA-{r.id} · {time(r.inicio)}–{time(r.fin)} · {r.consultorio}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="recepcion-cantidad">{tipo === "IMPRESION" ? "Cantidad de hojas" : "Minutos después del fin reservado"}</Label>
              <Input id="recepcion-cantidad" type="number" min="1" max={tipo === "IMPRESION" ? 10000 : 2147483647} step="1" required value={tipo === "IMPRESION" ? cantidad : minutos}
                onChange={(e) => tipo === "IMPRESION" ? setCantidad(e.target.value) : setMinutos(e.target.value)} /></div></div>
          {tipo === "TIEMPO_EXTRA" && <p className="text-sm text-slate-600">Los 5 minutos de cortesía están dentro de la hora. Exceso: 1–15 minutos, {money(data.catalogo.find((s) => s.codigo === "EXTRA_CORTO")?.precio || 0)}; 16–30 minutos, {money(data.catalogo.find((s) => s.codigo === "EXTRA_MEDIO")?.precio || 0)}; más de 30 minutos, tarifa normal del alquiler. Se cobra un solo tramo. Registra la entrega real del consultorio.</p>}
          <div className="space-y-2"><Label htmlFor="recepcion-nota">{tipo === "IMPRESION" ? "Observación (opcional)" : "Verificación de entrega: hora y responsable"}</Label>
            <Input id="recepcion-nota" maxLength={240} required={tipo === "TIEMPO_EXTRA"} minLength={tipo === "TIEMPO_EXTRA" ? 5 : undefined} value={nota} onChange={(e) => setNota(e.target.value)} /></div>
          <div className="flex flex-wrap items-center gap-4"><strong>{service?.precio ? `Total: ${money(Number(service.precio) * (tipo === "IMPRESION" ? Number(cantidad || 0) : 1))}` : "Tarifa pendiente de confirmación"}</strong>
            <Button type="submit" disabled={!service?.precio}>Registrar cargo</Button><span className="text-xs text-slate-500">Registrar el cargo no significa que esté pagado.</span></div>
        </fieldset></form>

      <section className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><caption className="p-4 text-left font-semibold">Cargos del {fecha}</caption>
        <thead className="bg-slate-100"><tr>{["Cobrar", "Profesional / reserva", "Servicio", "Cantidad", "Total", "Saldo", "Estado"].map((h) => <th key={h} className="p-3" scope="col">{h}</th>)}</tr></thead>
        <tbody>{!data.cargos.length && <tr><td colSpan={7} className="p-6 text-center">Todavía no hay cargos para esta fecha.</td></tr>}
          {data.cargos.map((c) => { const balance = Math.round((Number(c.total) - Number(c.pagado)) * 100) / 100;
            return <tr key={c.id} className="border-t"><td className="p-3"><input type="checkbox" aria-label={`Cobrar cargo ${c.id}`} checked={selected[c.id] !== undefined}
              disabled={frozen || c.anulado || balance <= 0 || (selectedOwner !== undefined && selectedOwner !== c.profesionalId)} onChange={(e) => {
                setSelected((prev) => { const next = { ...prev }; if (e.target.checked) next[c.id] = balance.toFixed(2); else delete next[c.id]; return next; }); setConfirmed(false);
              }} /></td><td className="p-3">{c.profesional}<div className="text-xs text-slate-500">Cargo {c.id}{c.citaId ? ` · CITA-${c.citaId}` : ""}</div></td>
              <td className="p-3">{c.concepto}<div className="max-w-xs text-xs text-slate-500">{c.nota}</div></td><td className="p-3">{c.cantidad}</td>
              <td className="p-3 tabular-nums">{money(c.total)}</td><td className="p-3 tabular-nums">{c.anulado ? "—" : money(balance)}</td><td className="p-3">
                {c.anulado ? "Anulado" : balance === 0 ? "Pagado" : Number(c.pagado) > 0 ? "Abono" : "Pendiente"}
                {data.admin && !c.anulado && Number(c.pagado) === 0 && <Button size="sm" variant="ghost" disabled={frozen} onClick={() => setAdjustment({ kind: "anular", id: c.id, reason: "", fecha: bogotaToday(), requestId: crypto.randomUUID() })}>Anular</Button>}</td></tr>;
          })}</tbody></table></section>

      {!!Object.keys(selected).length && <form onSubmit={savePago} className="space-y-4 rounded-xl border border-emerald-200 bg-white p-5"><h2 className="text-lg font-semibold">Registrar pago recibido</h2>
        <p className="text-sm text-slate-600">Incluye solo los cargos seleccionados. El alquiler base y las consultas conservan su registro de pago en Citas.</p>
        <fieldset disabled={frozen} className="space-y-4"><div className="grid gap-3 md:grid-cols-3">{Object.entries(selected).map(([id, amount]) => <div key={id}><Label htmlFor={`abono-${id}`}>Abono al cargo {id}</Label>
          <Input id={`abono-${id}`} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => { setSelected({ ...selected, [id]: e.target.value }); setConfirmed(false); }} /></div>)}</div>
          <div className="grid gap-3 md:grid-cols-3"><div><Label htmlFor="recepcion-pago-fecha">Fecha real del pago</Label><Input id="recepcion-pago-fecha" type="date" required max={bogotaToday()} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} /></div>
            <div><Label htmlFor="recepcion-metodo">Medio</Label><select id="recepcion-metodo" className={selectStyle} value={metodo} onChange={(e) => setMetodo(e.target.value as CajaMethod)}>{CAJA_METHODS.map((m) => <option key={m} value={m}>{methods[m]}</option>)}</select></div>
            <div><Label htmlFor="recepcion-referencia">Recibo / referencia única</Label><Input id="recepcion-referencia" required minLength={3} maxLength={120} value={referencia} onChange={(e) => setReferencia(e.target.value)} /></div></div>
          <p className="font-semibold">Total recibido: {money(Object.values(selected).reduce((sum, v) => sum + Math.round(Number(v || 0) * 100), 0) / 100)}</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} required onChange={(e) => setConfirmed(e.target.checked)} />Confirmé la recepción del dinero. Una imagen de transferencia por sí sola no confirma el abono.</label>
          <Button type="submit" disabled={!confirmed}>Guardar pago y movimiento de caja</Button>
        </fieldset></form>}

      <section className="overflow-x-auto rounded-xl border bg-white"><h2 className="p-4 font-semibold">Pagos de recepción registrados el {fecha}</h2><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{["Pago / cargos", "Medio", "Referencia", "Valor", "Estado"].map((h) => <th key={h} className="p-3" scope="col">{h}</th>)}</tr></thead>
        <tbody>{!data.pagos.length && <tr><td colSpan={5} className="p-6 text-center">Sin pagos registrados para esta fecha.</td></tr>}{data.pagos.map((p) => <tr key={p.id} className="border-t"><td className="p-3">Pago {p.id}<div className="text-xs">Cargos {p.cargos}</div></td><td className="p-3">{p.metodoPago}</td><td className="p-3">{p.referencia}</td><td className="p-3">{money(p.monto)}</td><td className="p-3">{p.reversado ? "Devuelto" : "Registrado"}
          {data.admin && !p.reversado && <Button variant="ghost" size="sm" disabled={frozen} onClick={() => setAdjustment({ kind: "devolver", id: p.id, reason: "", fecha: bogotaToday(), requestId: crypto.randomUUID() })}>Registrar devolución</Button>}</td></tr>)}</tbody></table></section>
      {adjustment && <form onSubmit={adjust} className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-semibold">{adjustment.kind === "anular" ? "Anular cargo sin pago" : "Registrar devolución total ya efectuada"} #{adjustment.id}</h2>
        {adjustment.kind === "devolver" && <p className="text-sm">Se registrará la devolución completa por el mismo medio del pago y se reabrirá el saldo de sus cargos.</p>}
        <fieldset disabled={frozen}><Label htmlFor="ajuste-motivo">Motivo y soporte</Label><Input id="ajuste-motivo" required minLength={5} maxLength={240} value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })} />
          {adjustment.kind === "devolver" && <><Label htmlFor="ajuste-fecha">Fecha de devolución</Label><Input id="ajuste-fecha" type="date" max={bogotaToday()} required value={adjustment.fecha} onChange={(e) => setAdjustment({ ...adjustment, fecha: e.target.value })} /></>}
          <div className="mt-3 flex gap-3"><Button type="submit">Confirmar registro</Button><Button type="button" variant="outline" onClick={() => setAdjustment(null)}>Volver</Button></div></fieldset></form>}
      <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-semibold">Servicios y tarifas de recepción</h2>
        <ul className="space-y-2 text-sm">{data.catalogo.map((s) => <li key={s.codigo} className="flex justify-between gap-4"><span>{s.nombre} · {s.unidad}</span><strong>{s.precio ? money(s.precio) : "Pendiente de confirmar"}</strong></li>)}</ul>
        {data.admin && <details><summary className="cursor-pointer text-sm font-medium">Configurar tarifa para nuevos cargos</summary><form onSubmit={saveRate} className="mt-3"><fieldset disabled={frozen} className="grid gap-3 md:grid-cols-3">
          <div><Label htmlFor="tarifa-servicio">Servicio</Label><select id="tarifa-servicio" className={selectStyle} value={rateCode} onChange={(e) => setRateCode(e.target.value as ReceptionCode)}>{data.catalogo.filter((s) => s.codigo !== "EXTRA_HORA").map((s) => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}</select></div>
          <div><Label htmlFor="tarifa-precio">Precio en pesos</Label><Input id="tarifa-precio" type="number" step="0.01" min="0.01" required value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <div><Label htmlFor="tarifa-motivo">Motivo / autorización</Label><Input id="tarifa-motivo" required minLength={5} maxLength={240} value={rateReason} onChange={(e) => setRateReason(e.target.value)} /></div>
          <Button type="submit">Guardar tarifa</Button><p className="text-xs text-slate-500 md:col-span-2">Los cargos anteriores conservan el precio aplicado. Los cambios quedan auditados.</p></fieldset></form></details>}
      </section>
    </>}
  </div></main>;
}
