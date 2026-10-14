"use client";

import { useId } from "react";
import { CircleDollarSign, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BillingSummaryCardProps {
  summary: { total: string; citas: number; sinValor: number } | null;
  loading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  onRetry: () => void;
}

function formatExactCop(value: string): string | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;

  const [, sign, whole, fraction = ""] = match;
  const groupedWhole = BigInt(whole).toLocaleString("es-CO");
  return `${sign}$ ${groupedWhole},${fraction.padEnd(2, "0")} COP`;
}

function periodLabel(startDate: string, endDate: string): string {
  const formatDate = (date: string) =>
    date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");

  if (startDate && endDate) {
    if (startDate === endDate) {
      const todayParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const today = ["year", "month", "day"]
        .map((part) => todayParts.find(({ type }) => type === part)?.value)
        .join("-");
      return startDate === today ? "Hoy" : formatDate(startDate);
    }
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }
  if (startDate) return `Desde ${formatDate(startDate)}`;
  if (endDate) return `Hasta ${formatDate(endDate)}`;
  return "Todas las fechas";
}

export function BillingSummaryCard({
  summary,
  loading,
  error,
  startDate,
  endDate,
  onRetry,
}: BillingSummaryCardProps) {
  const headingId = useId();
  const total = summary ? formatExactCop(summary.total) : null;
  const displayError = error || (summary && total === null ? "No se pudo calcular el total." : null);

  return (
    <Card
      role="region"
      aria-labelledby={headingId}
      aria-busy={loading}
      className="h-full min-w-0 gap-2 border-emerald-200 bg-emerald-50/40 py-0"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 p-4 pb-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm font-medium leading-snug">
            <h2 id={headingId}>Facturado en el periodo</h2>
          </CardTitle>
          <p className="text-xs text-slate-600">{periodLabel(startDate, endDate)}</p>
        </div>
        <CircleDollarSign aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600" />
      </CardHeader>
      <CardContent aria-live="polite" aria-atomic="true" className="space-y-2 px-4 pb-4">
        {loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
            Calculando total…
          </p>
        ) : displayError ? (
          <div className="space-y-2">
            <p className="break-words text-sm text-slate-700">{displayError}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        ) : summary && total !== null ? (
          <>
            {summary.sinValor > 0 && <p className="text-xs font-medium text-amber-700">Subtotal conocido</p>}
            <p className="break-words text-xl font-bold tabular-nums leading-tight text-emerald-700">
              {total}
            </p>
            <p className="text-xs text-slate-600">{summary.citas} citas y reservas · Excluye canceladas</p>
            {summary.sinValor > 0 && (
              <p className="text-xs font-medium text-amber-700">
                {summary.sinValor} {summary.sinValor === 1 ? "registro sin valor" : "registros sin valor"}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600">Sin información del periodo.</p>
        )}
        <p className="text-[10px] leading-relaxed text-slate-500">
          Según la fecha de la cita · Respeta los filtros · Incluye pagos pendientes
        </p>
      </CardContent>
    </Card>
  );
}
