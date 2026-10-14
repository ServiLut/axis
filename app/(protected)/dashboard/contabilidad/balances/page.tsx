"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Scale,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle,
  Wrench
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRole } from "@/hooks/use-user-role";
import { getBalanceGeneral, type BalanceSummary } from "./actions";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function BalancesPage() {
  const { role, loading: roleLoading } = useUserRole();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Date State
  // Default to current month if not in params
  const [startDate, setStartDate] = useState(
    searchParams.get("startDate") || format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(
    searchParams.get("endDate") || format(endOfMonth(new Date()), "yyyy-MM-dd")
  );

  const [balance, setBalance] = useState<BalanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [resultKey, setResultKey] = useState("");
  const requestId = useRef(0);
  const periodKey = `${startDate}:${endDate}`;
  const isAdmin = role === "ADMIN" || role === "SU_ADMIN";

  const updateFilters = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    const params = new URLSearchParams(searchParams);
    if (start) params.set("startDate", start); else params.delete("startDate");
    if (end) params.set("endDate", end); else params.delete("endDate");
    router.replace(`?${params.toString()}`);
  };

  const fetchBalance = useCallback(async () => {
    if (roleLoading || !isAdmin) return;
    const currentRequest = ++requestId.current;
    const key = `${startDate}:${endDate}`;
    setLoading(true);
    setLoadError("");
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Inicia sesión para consultar el resumen.");
      // The server interprets these ISO calendar dates as whole Bogotá days.
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.toISOString().slice(0, 10) !== startDate || end.toISOString().slice(0, 10) !== endDate || start > end) {
        throw new Error("Selecciona un periodo válido: la fecha final debe ser igual o posterior a la inicial.");
      }
      const res = await getBalanceGeneral(token, start, end);
      if (requestId.current !== currentRequest) return;
      if (!res.success) throw new Error(res.error || "No se pudo calcular el resumen.");
      setBalance(res.data);
      setResultKey(key);
    } catch (error) {
      if (requestId.current !== currentRequest) return;
      setBalance(null);
      setResultKey(key);
      setLoadError(error instanceof Error ? error.message : "No se pudo cargar el resumen. Revisa tu conexión e intenta nuevamente.");
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [startDate, endDate, roleLoading, isAdmin]);

  useEffect(() => {
    if (!roleLoading && role !== "ADMIN" && role !== "SU_ADMIN") {
      toast.error("Acceso denegado.");
      router.push("/dashboard");
    }
  }, [role, roleLoading, router]);

  useEffect(() => {
    void fetchBalance();
    return () => { requestId.current += 1; };
  }, [fetchBalance]);

  if (roleLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none bg-white border-b border-slate-200 px-4 sm:px-8 py-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Scale className="h-6 w-6 text-indigo-600" />
              Balance y Conciliación
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Resumen de citas realizadas, pagos al equipo, anticipos y gastos registrados.
            </p>
          </div>
          
          <div className="flex w-full flex-wrap items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200 md:w-auto">
            <div className="flex items-center gap-2 px-2">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-700">Periodo:</span>
            </div>
            <Input
                type="date"
                aria-label="Fecha inicial del resumen"
                value={startDate}
                onChange={(e) => updateFilters(e.target.value, endDate)}
                className="w-32 h-8 text-xs border-slate-200"
            />
            <span className="text-slate-400">-</span>
            <Input
                type="date"
                aria-label="Fecha final del resumen"
                value={endDate}
                onChange={(e) => updateFilters(startDate, e.target.value)}
                className="w-32 h-8 text-xs border-slate-200"
            />
            <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                onClick={fetchBalance}
            >
                Actualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-8 bg-slate-50 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
            
            {loading || resultKey !== periodKey ? (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-32 bg-slate-200 animate-pulse rounded-xl" />
                    ))}
                 </div>
            ) : loadError ? (
                <div role="alert" className="space-y-3 rounded-lg border bg-white p-6 text-center">
                  <p className="text-sm text-slate-700">{loadError}</p>
                  <Button variant="outline" onClick={fetchBalance}>Reintentar</Button>
                </div>
            ) : balance ? (
                <>
                    {balance.isTenant4 && <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
                      Esta vista clasifica las citas realizadas por su estado de pago actual y fecha de atención. Los paquetes se prorratean como estimación; no es un extracto de pagos recibidos durante el periodo.
                      <div className="mt-2">Valor realizado estimado: ${balance.ingresos.valorRealizado?.toLocaleString("es-CO", { maximumFractionDigits: 2 })} · Por conciliar: ${balance.ingresos.valorPorConciliar?.toLocaleString("es-CO", { maximumFractionDigits: 2 })}.</div>
                    </div>}
                    {balance.caja && <div className="mb-5 rounded-lg border bg-white p-4 text-sm"><h2 className="font-semibold">Libro diario · movimientos de dinero registrados</h2>
                      <p className="mt-2">Entradas: ${Number(balance.caja.ingresos).toLocaleString("es-CO")} · Salidas: ${Number(balance.caja.egresos).toLocaleString("es-CO")} · Neto: ${Number(balance.caja.neto).toLocaleString("es-CO")}</p>
                      <p className="mt-2 text-xs text-slate-600">Incluye pagos registrados de citas y paquetes, recepción, devoluciones y movimientos manuales por fecha efectiva. Los estados CONCILIADO anteriores y los egresos históricos sin medio no se convierten automáticamente en dinero. No sumes esta vista con el valor de servicios ni la presentes como saldo bancario: no incluye saldo inicial ni extracto verificado.</p>
                    </div>}
                    {/* Main Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Ingresos Card */}
                        <Card className="border-emerald-100 shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-emerald-600 uppercase tracking-wider">
                                    {balance.isTenant4 ? "Citas marcadas como conciliadas" : "Total Ingresos"}
                                </CardTitle>
                                <TrendingUp className="h-4 w-4 text-emerald-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">
                                    ${balance.ingresos.totalRecaudado.toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-slate-500 mt-1 mb-3">
                                    {balance.ingresos.cantidadServicios} citas y reservas realizadas
                                </p>
                                <div className="space-y-1 pt-3 border-t border-slate-100">
                                    {balance.ingresos.desglosePorMetodo.map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-xs">
                                            <span className="text-slate-600">{item.metodo}</span>
                                            <span className="font-medium text-slate-900">${item.total.toLocaleString("es-CO", { maximumFractionDigits: 2 })}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Egresos Card */}
                        <Card className="border-rose-100 shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-rose-600 uppercase tracking-wider">
                                    Total Egresos
                                </CardTitle>
                                <TrendingDown className="h-4 w-4 text-rose-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">
                                    -${(balance.egresos.totalNominaPagada + balance.egresos.totalAnticipos + (balance.egresos.totalOtrosEgresos || 0)).toLocaleString()}
                                </div>
                                <p className="text-xs text-slate-500 mt-1 flex flex-col gap-0.5">
                                    <span>Nómina: ${balance.egresos.totalNominaPagada.toLocaleString()} ({balance.egresos.cantidadNominas})</span>
                                    <span>Anticipos: ${balance.egresos.totalAnticipos.toLocaleString()} ({balance.egresos.cantidadAnticipos})</span>
                                    {balance.egresos.totalOtrosEgresos > 0 && (
                                        <span>Otros Gastos: ${balance.egresos.totalOtrosEgresos.toLocaleString()} ({balance.egresos.cantidadOtrosEgresos})</span>
                                    )}
                                </p>
                            </CardContent>
                        </Card>

                        {/* Balance Neto Card */}
                        <Card className={`shadow-sm ${balance.neto >= 0 ? 'border-indigo-100 bg-indigo-50/30' : 'border-amber-100 bg-amber-50/30'}`}>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-slate-600 uppercase tracking-wider">
                                    {balance.isTenant4 ? "Diferencia estimada" : "Flujo Neto"}
                                </CardTitle>
                                <Scale className={`h-4 w-4 ${balance.neto >= 0 ? 'text-indigo-600' : 'text-amber-600'}`} />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${balance.neto >= 0 ? 'text-indigo-700' : 'text-amber-700'}`}>
                                    ${balance.neto.toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Ingresos - (Nómina + Anticipos{balance.egresos.totalOtrosEgresos > 0 ? " + Gastos" : ""})
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Secondary Metrics */}
                    {!balance.isTenant4 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <Wrench className="h-4 w-4 text-slate-500" />
                                    Costos de Repuestos
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-500">Valor reportado en servicios:</span>
                                    <span className="text-lg font-bold text-slate-700">${balance.ingresos.totalRepuestos.toLocaleString()}</span>
                                </div>
                                <div className="mt-2 text-xs bg-slate-50 p-2 rounded text-slate-500 border border-slate-100 flex gap-2">
                                    <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                    Este valor está incluido en el &quot;Total Ingresos&quot; si se cobró al cliente, pero representa un costo operativo.
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    )}
                </>
            ) : (
                <div className="text-center py-12">
                    <p className="text-slate-500">Seleccione un rango de fechas y haga clic en Actualizar.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
