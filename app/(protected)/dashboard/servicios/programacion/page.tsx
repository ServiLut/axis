"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getOrdenesByDateRange } from "./actions";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTecnicos } from "../../usuarios/tecnicos/actions";

interface OrdenServicio {
  id: number;
  numeroOrden: string | null;
  fechaVisita: Date | string | null;
  horaInicio: Date | string | null;
  horaFin: Date | string | null;
  direccionTexto: string;
  municipio: string | null;
  barrio: string | null;
  estado: string;
  cliente: { nombre: string | null; apellido: string | null; numeroDocumento: string | null };
  tecnico: { nombre: string; apellido: string } | null;
  servicio: { nombre: string };
  tipoServicio: { nombre: string; id: number } | null;
  empresa: { nombre: string } | null;
  zona: { nombre: string } | null;
}

interface Tecnico {
  id: number;
  nombre: string;
  apellido: string;
}

export default function ProgramacionPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [selectedTecnicoId, setSelectedTecnicoId] = useState<string>("all");

  // Helper to get date range based on view mode
  const getDateRange = useCallback((date: Date, mode: "week" | "day") => {
    if (mode === "day") {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    const start = new Date(date);
    const dayOfWeek = start.getDay(); // 0 is Sunday
    const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // adjust when day is sunday
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }, []);

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => getDateRange(currentDate, viewMode),
    [currentDate, viewMode, getDateRange],
  );

  const fetchTecnicos = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const result = await getTecnicos(token);
    if (result.tecnicos) {
      setTecnicos(result.tecnicos);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTecnicos();
  }, [fetchTecnicos]);

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const tecnicoId = selectedTecnicoId === "all" ? undefined : Number(selectedTecnicoId);

    const result = await getOrdenesByDateRange(token, rangeStart, rangeEnd, tecnicoId);
    if (result.error) {
      toast.error(result.error);
    } else if (result.ordenes) {
      setOrdenes(result.ordenes as unknown as OrdenServicio[]);
    }
    setLoading(false);
  }, [router, rangeStart, rangeEnd, selectedTecnicoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrdenes();
  }, [fetchOrdenes]);

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") {
      newDate.setDate(currentDate.getDate() - 7);
    } else {
      newDate.setDate(currentDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") {
      newDate.setDate(currentDate.getDate() + 7);
    } else {
      newDate.setDate(currentDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      // Create date from input value (YYYY-MM-DD)
      // Append time to ensure local timezone is handled correctly or use split
      const [year, month, day] = e.target.value.split('-').map(Number);
      const newDate = new Date(year, month - 1, day);
      setCurrentDate(newDate);
    }
  };

  // Generate days for the header
  const displayedDays = useMemo(() => {
    const days = [];
    const day = new Date(rangeStart);
    const count = viewMode === "week" ? 7 : 1;
    for (let i = 0; i < count; i++) {
      days.push(new Date(day));
      day.setDate(day.getDate() + 1);
    }
    return days;
  }, [rangeStart, viewMode]);

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case "PROGRAMADO":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "EN_PROCESO":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "SERVICIO_LISTO":
        return "bg-green-100 text-green-700 border-green-200";
      case "CANCELADO":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  // Group orders by date (string key YYYY-MM-DD)
  const ordersByDate = useMemo(() => {
    const groups: Record<string, OrdenServicio[]> = {};
    ordenes.forEach((orden) => {
      if (!orden.fechaVisita) return;
      const dateKey = new Date(orden.fechaVisita).toISOString().split("T")[0];
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(orden);
    });
    return groups;
  }, [ordenes]);

  // Constants for Time Grid
  const START_HOUR = 0;
  const END_HOUR = 23;
  const HOURS = Array.from(
    { length: END_HOUR - START_HOUR + 1 },
    (_, i) => i + START_HOUR,
  );
  const CELL_HEIGHT = 80; // px per hour

  const getEventStyle = (orden: OrdenServicio) => {
    if (!orden.horaInicio)
      return { top: 0, height: CELL_HEIGHT, position: "relative" as const };

    const start = new Date(orden.horaInicio);
    const end = orden.horaFin
      ? new Date(orden.horaFin)
      : new Date(start.getTime() + 60 * 60 * 1000); // Default 1h

    const startHour = start.getHours();
    const startMin = start.getMinutes();

    const startMinutesFromBase = (startHour - START_HOUR) * 60 + startMin;
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

    const top = (startMinutesFromBase / 60) * CELL_HEIGHT;
    const height = (durationMinutes / 60) * CELL_HEIGHT;

    return {
      top: `${Math.max(0, top)}px`,
      height: `${Math.max(30, height)}px`, // Min height for visibility
      position: "absolute" as const,
      left: "2px",
      right: "2px",
      zIndex: 10,
    };
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Programación de Servicios
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Organización semanal de visitas y servicios
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full sm:w-[160px]">
              <Select
                value={viewMode}
                onValueChange={(v: "week" | "day") => setViewMode(v)}
              >
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Vista" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="day">Día</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-[200px]">
              <Select
                value={selectedTecnicoId}
                onValueChange={setSelectedTecnicoId}
              >
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Filtrar por técnico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los técnicos</SelectItem>
                  {tecnicos.map((tecnico) => (
                    <SelectItem key={tecnico.id} value={tecnico.id.toString()}>
                      {tecnico.nombre} {tecnico.apellido}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrev}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToday}
                className="h-8 px-3 font-medium text-sm"
              >
                Hoy
              </Button>
              <div className="h-4 w-[1px] bg-slate-300 mx-1" />
              
              {viewMode === "day" ? (
                 <Input 
                   type="date"
                   value={currentDate.toISOString().split("T")[0]} 
                   onChange={handleDateChange}
                   className="h-8 w-[140px] text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 p-1 text-center font-medium"
                 />
              ) : (
                <span className="text-sm font-medium px-2 min-w-[140px] text-center">
                  {rangeStart.toLocaleDateString("es-CO", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  -{" "}
                  {rangeEnd.toLocaleDateString("es-CO", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          {/* MOBILE VIEW (List) */}
          <div className="md:hidden space-y-4">
            {loading
              ? // Skeleton loading state for mobile
                Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg border p-4 space-y-3"
                  >
                    <div className="h-6 w-1/3 bg-slate-100 rounded animate-pulse" />
                    <div className="h-20 bg-slate-100 rounded animate-pulse" />
                    <div className="h-20 bg-slate-100 rounded animate-pulse" />
                  </div>
                ))
              : displayedDays.map((day, index) => {
                  const dateKey = day.toISOString().split("T")[0];
                  const dayOrdenes = ordersByDate[dateKey] || [];
                  const isToday =
                    new Date().toDateString() === day.toDateString();

                  return (
                    <div
                      key={index}
                      className={cn(
                        "bg-white rounded-lg border p-4",
                        isToday && "border-blue-300 ring-1 ring-blue-100",
                      )}
                    >
                      <h3 className="font-bold text-slate-700 mb-3 flex items-center justify-between">
                        <span>
                          {day.toLocaleDateString("es-CO", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </span>
                        {isToday && (
                          <Badge
                            variant="secondary"
                            className="bg-blue-100 text-blue-700"
                          >
                            Hoy
                          </Badge>
                        )}
                      </h3>

                      {dayOrdenes.length === 0 ? (
                        <div className="text-slate-400 text-sm italic py-2 text-center bg-slate-50 rounded-md">
                          Sin servicios
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {dayOrdenes.map((orden) => (
                            <div
                              key={orden.id}
                              className={cn(
                                "p-3 rounded-md border text-sm",
                                getStatusColor(orden.estado),
                              )}
                            >
                              <div className="font-bold flex justify-between">
                                <span>
                                  {orden.horaInicio
                                    ? new Date(orden.horaInicio)
                                        .toLocaleTimeString("es-CO", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: true,
                                        })
                                        .replace("a. m.", "a.m.")
                                        .replace("p. m.", "p.m.")
                                    : "--:--"}
                                </span>
                                <span className="opacity-75">
                                  {orden.servicio.nombre}
                                </span>
                              </div>
                              <div className="mt-1 font-medium">
                                {orden.cliente.nombre} {orden.cliente.apellido}
                              </div>
                              <div className="text-xs opacity-80 mt-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {orden.barrio ||
                                  orden.municipio ||
                                  "Sin ubicación"}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
          </div>

          {/* DESKTOP VIEW (Time Grid) */}
          <div className="hidden md:flex flex-col h-full bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden relative">
            {loading && (
              <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-[1px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}

            {/* Grid Header */}
            <div className="flex border-b border-slate-200 flex-none bg-slate-50">
              <div className="w-24 flex-none border-r border-slate-200 bg-slate-100" />{" "}
              {/* Time Axis Header */}
              <div
                className={cn(
                  "flex-1 grid divide-x divide-slate-200",
                  viewMode === "day" ? "grid-cols-1" : "grid-cols-7",
                )}
              >
                {displayedDays.map((day, index) => {
                  const isToday =
                    new Date().toDateString() === day.toDateString();
                  return (
                    <div
                      key={index}
                      className={cn(
                        "py-3 text-center",
                        isToday ? "bg-blue-50/50" : "",
                      )}
                    >
                      <span className="block text-xs font-semibold text-slate-500 uppercase">
                        {day.toLocaleDateString("es-CO", { weekday: "short" })}
                      </span>
                      <div
                        className={cn(
                          "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold mt-1 transition-colors",
                          isToday
                            ? "bg-blue-600 text-white"
                            : "text-slate-900 group-hover:bg-slate-200",
                        )}
                      >
                        {day.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grid Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
              <div className="flex min-h-full">
                {/* Time Column */}
                <div className="w-24 flex-none border-r border-slate-200 bg-slate-50 select-none">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="border-b border-slate-100 text-right pr-3 text-xs text-slate-400 font-medium flex items-center justify-end"
                      style={{ height: CELL_HEIGHT }}
                    >
                      <span>
                        {new Date(0, 0, 0, hour, 0)
                          .toLocaleTimeString("es-CO", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })
                          .replace("a. m.", "a.m.")
                          .replace("p. m.", "p.m.")}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Days Columns */}
                <div
                  className={cn(
                    "flex-1 grid divide-x divide-slate-200 relative bg-white",
                    viewMode === "day" ? "grid-cols-1" : "grid-cols-7",
                  )}
                >
                  {/* Background Lines (Absolute to grid) */}
                  <div className="absolute inset-0 pointer-events-none z-0 flex flex-col">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="border-b border-slate-100"
                        style={{ height: CELL_HEIGHT }}
                      />
                    ))}
                  </div>

                  {/* Day Columns Content */}
                  {displayedDays.map((day, index) => {
                    const dateKey = day.toISOString().split("T")[0];
                    const dayOrdenes = ordersByDate[dateKey] || [];
                    const isToday =
                      new Date().toDateString() === day.toDateString();

                    return (
                      <div
                        key={index}
                        className={cn(
                          "relative h-full z-10",
                          isToday && "bg-blue-50/10",
                        )}
                      >
                        {dayOrdenes.map((orden) => (
                          <Popover key={orden.id}>
                            <PopoverTrigger asChild>
                              <div
                                className={cn(
                                  "absolute inset-x-1 rounded-md border text-[10px] p-1.5 cursor-pointer hover:shadow-md hover:z-20 transition-all overflow-hidden flex flex-col gap-0.5",
                                  getStatusColor(orden.estado),
                                )}
                                style={getEventStyle(orden)}
                              >
                                <div className="font-bold truncate">
                                  {orden.cliente.nombre}{" "}
                                  {orden.cliente.apellido}
                                </div>
                                <div className="truncate opacity-80">
                                  {orden.servicio.nombre}
                                </div>
                                <div className="flex items-center gap-1 opacity-70 truncate">
                                  <MapPin className="h-2 w-2" />
                                  {orden.barrio || orden.municipio}
                                </div>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-80 p-0 overflow-hidden"
                              align="start"
                              side="right"
                            >
                              <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
                                <span className="font-semibold text-sm">
                                  Detalle del Servicio
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {orden.estado}
                                </Badge>
                              </div>
                              <div className="p-4 space-y-3">
                                <div>
                                  <div className="text-xs text-slate-500">
                                    Cliente
                                  </div>
                                  <div className="font-medium text-sm">
                                    {orden.cliente.nombre}{" "}
                                    {orden.cliente.apellido}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-500">
                                    Servicio
                                  </div>
                                  <div className="font-medium text-sm">
                                    {orden.servicio.nombre}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <div className="text-xs text-slate-500">
                                      Hora
                                    </div>
                                    <div className="font-medium text-sm flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {orden.horaInicio
                                        ? new Date(orden.horaInicio)
                                            .toLocaleTimeString("es-CO", {
                                              hour: "2-digit",
                                              minute: "2-digit",
                                              hour12: true,
                                            })
                                            .replace("a. m.", "a.m.")
                                            .replace("p. m.", "p.m.")
                                        : "--"}{" "}
                                      -
                                      {orden.horaFin
                                        ? new Date(orden.horaFin)
                                            .toLocaleTimeString("es-CO", {
                                              hour: "2-digit",
                                              minute: "2-digit",
                                              hour12: true,
                                            })
                                            .replace("a. m.", "a.m.")
                                            .replace("p. m.", "p.m.")
                                        : "--"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-slate-500">
                                      Técnico
                                    </div>
                                    <div className="font-medium text-sm">
                                      {orden.tecnico?.nombre || "Sin asignar"}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-500">
                                    Dirección
                                  </div>
                                  <div className="font-medium text-sm flex items-start gap-1">
                                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                                    <span className="text-xs leading-tight">
                                      {orden.direccionTexto}
                                    </span>
                                  </div>
                                  {(orden.barrio || orden.municipio) && (
                                    <div className="text-xs text-slate-400 ml-4 mt-0.5">
                                      {orden.barrio}, {orden.municipio}
                                    </div>
                                  )}
                                </div>
                                <div className="pt-2 flex justify-end">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      sessionStorage.removeItem("serviciosFilters");
                                      const searchTerm = 
                                        orden.numeroOrden || 
                                        orden.cliente.numeroDocumento || 
                                        orden.cliente.apellido || 
                                        "";
                                      router.push(
                                        `/dashboard/servicios?term=${encodeURIComponent(searchTerm)}`
                                      );
                                    }}
                                  >
                                    Ver Completo
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
