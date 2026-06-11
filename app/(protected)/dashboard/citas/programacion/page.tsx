"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCitasByDateRange, moveCita } from "./actions";
import { getFormDataCitas } from "../actions";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CitaProgramacion {
  id: number;
  numeroOrden: string | null;
  fechaVisita: Date | string | null;
  horaInicio: Date | string | null;
  horaFin: Date | string | null;
  direccionTexto: string;
  municipio: string | null;
  barrio: string | null;
  estado: string;
  realizada: boolean;
  cliente: {
    nombre: string | null;
    apellido: string | null;
    numeroDocumento: string | null;
  };
  tecnico: { nombre: string; apellido: string } | null;
  servicio: { nombre: string };
  tipoServicio: { nombre: string; id: number } | null;
  empresa: { nombre: string } | null;
  consultorioId?: number | string | null;
  consultorio?: { id: number; nombre: string } | null;
}

interface Tecnico {
  id: number;
  nombre: string;
  apellido: string;
}

interface Consultorio {
  id: number; // BigInt serialized as number
  nombre: string;
}

export default function ProgramacionCitasPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [now, setNow] = useState(new Date());
  // viewMode removed, always "day" + "consultorios"
  const [ordenes, setOrdenes] = useState<CitaProgramacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [consultorios, setConsultorios] = useState<Consultorio[]>([]);
  const [selectedTecnicoId, setSelectedTecnicoId] = useState<string>("all");

  // Assign Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedCita, setSelectedCita] = useState<CitaProgramacion | null>(
    null,
  );
  const [assignConsultorioId, setAssignConsultorioId] = useState<string>("");
  const [assignStartTime, setAssignStartTime] = useState<string>("");
  const [assignEndTime, setAssignEndTime] = useState<string>("");

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const result = await getFormDataCitas(token);
    if (result.tecnicos) {
      setTecnicos(result.tecnicos as Tecnico[]);
    }
    if (result.consultorios) {
      setConsultorios(result.consultorios as Consultorio[]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const tecnicoId =
      selectedTecnicoId === "all" ? undefined : Number(selectedTecnicoId);

    // Format local date to YYYY-MM-DD
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const result = await getCitasByDateRange(token, dateStr, tecnicoId);
    if (result.error) {
      toast.error(result.error);
    } else if (result.ordenes) {
      setOrdenes(result.ordenes as unknown as CitaProgramacion[]);
    }
    setLoading(false);
  }, [currentDate, selectedTecnicoId, router]);

  useEffect(() => {
    const timer = setTimeout(() => fetchOrdenes(), 0);
    return () => clearTimeout(timer);
  }, [fetchOrdenes]);

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const [year, month, day] = e.target.value.split("-").map(Number);
      const newDate = new Date(year, month - 1, day);
      setCurrentDate(newDate);
    }
  };

  const getStatusColor = (orden: CitaProgramacion) => {
    const { horaFin, realizada } = orden;

    if (realizada === true) {
      return "bg-green-100 text-green-700 border-green-200";
    }

    if (realizada === null) {
      return "bg-slate-100 text-slate-400 border-slate-200";
    }

    // Check if overdue
    if (horaFin) {
      const endTime = new Date(horaFin);
      if (now > endTime) {
        return "bg-red-100 text-red-700 border-red-200";
      }
    }

    return "bg-blue-100 text-blue-700 border-blue-200";
  };

  const getStatusText = (orden: CitaProgramacion) => {
    if (orden.realizada === true) return "REALIZADA";
    if (orden.realizada === null) return "CANCELADA";
    if (orden.horaFin && new Date(orden.horaFin) < now) return "ATRASADA";
    return "PROGRAMADA";
  };

  // Group orders by Consultorio ID
  const ordersByConsultorio = useMemo(() => {
    const groups: Record<string, CitaProgramacion[]> = {};
    ordenes.forEach((orden) => {
      // If no consultorio, maybe put in a "Sin Asignar" group or ignore?
      // Assuming 0 or "0" for unassigned if needed, but lets use ID string
      const cId = orden.consultorioId
        ? orden.consultorioId.toString()
        : "unassigned";
      if (!groups[cId]) groups[cId] = [];
      groups[cId].push(orden);
    });
    return groups;
  }, [ordenes]);

  // Constants for Time Grid
  const GRID_START = 6; // Start at 6 AM
  const GRID_END = 20; // End at 8 PM

  const HOURS = Array.from(
    { length: GRID_END - GRID_START + 1 },
    (_, i) => i + GRID_START,
  );
  const CELL_HEIGHT = 100; // px per hour - increased for better visibility

  const getEventStyle = (orden: CitaProgramacion) => {
    if (!orden.horaInicio)
      return { top: 0, height: CELL_HEIGHT, position: "relative" as const };

    const start = new Date(orden.horaInicio);
    const end = orden.horaFin
      ? new Date(orden.horaFin)
      : new Date(start.getTime() + 60 * 60 * 1000); // Default 1h

    const startHour = start.getHours();
    const startMin = start.getMinutes();

    const startMinutesFromBase = (startHour - GRID_START) * 60 + startMin;
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

    const top = (startMinutesFromBase / 60) * CELL_HEIGHT;
    const height = (durationMinutes / 60) * CELL_HEIGHT;

    return {
      top: `${Math.max(0, top)}px`,
      height: `${Math.max(40, height)}px`, // Min height
      position: "absolute" as const,
      left: "4px",
      right: "4px",
      zIndex: 10,
    };
  };

  const handleOpenAssignModal = (cita: CitaProgramacion) => {
    setSelectedCita(cita);
    setAssignConsultorioId(cita.consultorioId?.toString() || "");

    // Set default times from cita or defaults
    if (cita.horaInicio) {
      const start = new Date(cita.horaInicio);
      const h = String(start.getHours()).padStart(2, "0");
      const m = String(start.getMinutes()).padStart(2, "0");
      setAssignStartTime(`${h}:${m}`);
    } else {
      setAssignStartTime("08:00");
    }

    if (cita.horaFin) {
      const end = new Date(cita.horaFin);
      const h = String(end.getHours()).padStart(2, "0");
      const m = String(end.getMinutes()).padStart(2, "0");
      setAssignEndTime(`${h}:${m}`);
    } else {
      setAssignEndTime("09:00");
    }

    setIsAssignModalOpen(true);
  };

  const handleAssignSubmit = async () => {
    if (
      !selectedCita ||
      !assignConsultorioId ||
      !assignStartTime ||
      !assignEndTime
    ) {
      toast.error("Por favor complete todos los campos");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const startIso = `${dateStr}T${assignStartTime}:00`;
    const endIso = `${dateStr}T${assignEndTime}:00`;

    const promise = moveCita(
      token,
      selectedCita.id,
      Number(assignConsultorioId),
      startIso,
      endIso,
    );

    toast.promise(promise, {
      loading: "Asignando cita...",
      success: "Cita asignada correctamente",
      error: "Error al asignar cita",
    });

    await promise;
    setIsAssignModalOpen(false);
    fetchOrdenes();
  };

  const unassignedOrders = ordersByConsultorio["unassigned"] || [];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Programación de Consultorios
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Agenda diaria por consultorio
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full sm:w-[200px]">
              <Combobox
                options={[
                  { value: "all", label: "Todos los psicólogos" },
                  ...tecnicos.map((tecnico) => ({
                    value: tecnico.id.toString(),
                    label: `${tecnico.nombre} ${tecnico.apellido}`,
                  })),
                ]}
                value={selectedTecnicoId}
                onChange={(val) => setSelectedTecnicoId(val || "all")}
                placeholder="Filtrar por psicólogo"
                className="w-full bg-white"
              />
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

              <div className="relative">
                <Input
                  type="date"
                  value={currentDate.toISOString().split("T")[0]}
                  onChange={handleDateChange}
                  className="h-8 w-[140px] text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 p-1 pl-8 text-center font-medium cursor-pointer"
                />
                <CalendarDays className="h-4 w-4 absolute left-2 top-2 text-slate-500 pointer-events-none" />
              </div>

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

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-7xl mx-auto h-full flex flex-col gap-6">
          {/* Unassigned Orders Section */}
          <div
            className={cn(
              "flex-none border rounded-lg p-4 transition-colors",
              unassignedOrders.length > 0
                ? "bg-orange-50 border-orange-200"
                : "bg-slate-50 border-slate-200 border-dashed",
            )}
          >
            <h3
              className={cn(
                "text-sm font-semibold mb-3 flex items-center gap-2",
                unassignedOrders.length > 0
                  ? "text-orange-800"
                  : "text-slate-500",
              )}
            >
              {unassignedOrders.length > 0 && (
                <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
              )}
              Citas Sin Consultorio Asignado ({unassignedOrders.length})
            </h3>

            {unassignedOrders.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 min-h-[100px]">
                {unassignedOrders.map((orden) => (
                  <div
                    key={orden.id}
                    className="min-w-[280px] bg-white rounded-md border border-orange-100 shadow-sm p-3 flex flex-col gap-2 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", getStatusColor(orden))}
                      >
                        {getStatusText(orden)}
                      </Badge>
                      <span className="text-xs font-bold text-slate-700">
                        {orden.horaInicio
                          ? new Date(orden.horaInicio).toLocaleTimeString(
                              "es-CO",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              },
                            )
                          : "Sin hora"}
                      </span>
                    </div>
                    <div>
                      <div
                        className="font-semibold text-sm truncate text-slate-800"
                        title={`${orden.cliente?.nombre} ${orden.cliente?.apellido}`}
                      >
                        {orden.cliente?.nombre} {orden.cliente?.apellido}
                      </div>
                      <div
                        className="text-xs text-slate-500 truncate"
                        title={orden.servicio.nombre}
                      >
                        {orden.servicio.nombre}
                      </div>
                    </div>
                    <div className="mt-auto pt-2 flex items-center justify-between border-t border-slate-50">
                      <span className="text-xs text-slate-400 font-medium">
                        {orden.tecnico?.nombre || "Sin psicólogo"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2"
                        onClick={() => handleOpenAssignModal(orden)}
                      >
                        Asignar Consultorio
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-20 flex items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-md">
                No hay citas sin asignar
              </div>
            )}
          </div>

          {/* Mobile View - List */}
          <div className="md:hidden space-y-4">
            {/* Simple list view for mobile for now, prioritized by time */}
            {loading ? (
              <div className="p-4 text-center text-slate-500">Cargando...</div>
            ) : ordenes.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-white rounded-lg border">
                No hay citas programadas para este día.
              </div>
            ) : (
              <div className="space-y-3">
                {ordenes.map((orden) => (
                  <div
                    key={orden.id}
                    className={cn(
                      "bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-2",
                      getStatusColor(orden),
                    )}
                  >
                    <div className="flex justify-between items-center font-bold text-slate-800">
                      <div className="flex flex-col">
                        <span>
                          {orden.horaInicio
                            ? new Date(orden.horaInicio).toLocaleTimeString(
                                "es-CO",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                },
                              )
                            : "--:--"}
                        </span>
                        <span className="text-xs font-normal text-slate-500">
                          {orden.consultorio?.nombre || "Sin consultorio"}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-bold",
                          getStatusColor(orden),
                        )}
                      >
                        {getStatusText(orden)}
                      </Badge>
                    </div>
                    <div className="font-medium">
                      {orden.cliente?.nombre} {orden.cliente?.apellido}
                    </div>
                    <div className="text-sm text-slate-600">
                      {orden.servicio.nombre}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {orden.tecnico?.nombre} {orden.tecnico?.apellido}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop View - Grid */}
          <div className="hidden md:flex flex-col flex-1 min-h-0 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden relative">
            {loading && (
              <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-[1px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}

            <div className="flex border-b border-slate-200 flex-none bg-slate-50">
              <div className="w-20 flex-none border-r border-slate-200 bg-slate-100" />
              <div
                className="flex-1 grid divide-x divide-slate-200"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, consultorios.length)}, minmax(0, 1fr))`,
                }}
              >
                {consultorios.length === 0 ? (
                  <div className="p-3 text-center text-sm text-slate-500 italic">
                    No hay consultorios configurados
                  </div>
                ) : (
                  consultorios.map((consultorio) => (
                    <div key={consultorio.id} className="py-3 text-center px-2">
                      <span
                        className="block text-sm font-bold text-slate-700 truncate"
                        title={consultorio.nombre}
                      >
                        {consultorio.nombre}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
              <div className="flex min-h-full">
                {/* Time Column */}
                <div className="w-20 flex-none border-r border-slate-200 bg-slate-50 select-none">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="border-b border-slate-100 text-right pr-2 text-xs text-slate-400 font-medium flex items-center justify-end"
                      style={{ height: CELL_HEIGHT }}
                    >
                      <span className="-mt-[50%]">
                        {new Date(0, 0, 0, hour, 0)
                          .toLocaleTimeString("es-CO", {
                            hour: "numeric",
                            hour12: true,
                          })
                          .replace(":00", "")}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Grid */}
                <div
                  className="flex-1 grid divide-x divide-slate-200 relative bg-white"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, consultorios.length)}, minmax(0, 1fr))`,
                  }}
                >
                  {/* Horizontal Lines */}
                  <div className="absolute inset-0 pointer-events-none z-0 flex flex-col w-full">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="border-b border-slate-100 w-full"
                        style={{ height: CELL_HEIGHT }}
                      />
                    ))}
                  </div>

                  {consultorios.map((consultorio) => {
                    const cId = consultorio.id.toString();
                    const consultorioOrdenes = ordersByConsultorio[cId] || [];

                    return (
                      <div
                        key={cId}
                        className="relative h-full z-10 hover:bg-slate-50/50 transition-colors"
                      >
                        {consultorioOrdenes.map((orden) => (
                          <Popover key={orden.id}>
                            <PopoverTrigger asChild>
                              <div
                                className={cn(
                                  "absolute inset-x-1 rounded-md border text-[10px] p-2 cursor-pointer hover:shadow-lg hover:scale-[1.02] hover:z-50 transition-all overflow-hidden flex flex-col gap-0.5",
                                  getStatusColor(orden),
                                )}
                                style={getEventStyle(orden)}
                              >
                                <div className="flex justify-between items-start gap-1">
                                  <div className="font-bold truncate text-xs flex-1">
                                    {orden.cliente?.nombre || "Paciente"}{" "}
                                    {orden.cliente?.apellido || ""}
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] h-4 px-1 bg-white/50 border-0"
                                  >
                                    {getStatusText(orden)}
                                  </Badge>
                                </div>
                                <div className="truncate opacity-90 font-medium">
                                  {orden.servicio.nombre}
                                </div>
                                <div className="flex items-center gap-1 opacity-75 truncate mt-auto">
                                  <Clock className="h-3 w-3" />
                                  {orden.horaInicio
                                    ? new Date(
                                        orden.horaInicio,
                                      ).toLocaleTimeString("es-CO", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })
                                    : "--"}
                                </div>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-80 p-0 overflow-hidden shadow-xl"
                              align="center"
                              side="right"
                            >
                              <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
                                <span className="font-semibold text-sm">
                                  Detalle de Cita
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs",
                                    getStatusColor(orden),
                                  )}
                                >
                                  {getStatusText(orden)}
                                </Badge>
                              </div>
                              <div className="p-4 space-y-3">
                                <div>
                                  <div className="text-xs text-slate-500 uppercase font-semibold">
                                    Paciente
                                  </div>
                                  <div className="font-medium text-sm">
                                    {orden.cliente?.nombre || "N/A"}{" "}
                                    {orden.cliente?.apellido || ""}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {orden.cliente?.numeroDocumento}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-500 uppercase font-semibold">
                                    Servicio
                                  </div>
                                  <div className="font-medium text-sm">
                                    {orden.servicio.nombre}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <div className="text-xs text-slate-500 uppercase font-semibold">
                                      Horario
                                    </div>
                                    <div className="font-medium text-sm flex items-center gap-1">
                                      {orden.horaInicio
                                        ? new Date(
                                            orden.horaInicio,
                                          ).toLocaleTimeString("es-CO", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                          })
                                        : "--"}{" "}
                                      -
                                      {orden.horaFin
                                        ? new Date(
                                            orden.horaFin,
                                          ).toLocaleTimeString("es-CO", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                          })
                                        : "--"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-slate-500 uppercase font-semibold">
                                      Consultorio
                                    </div>
                                    <div className="font-medium text-sm">
                                      {orden.consultorio?.nombre ||
                                        "Sin asignar"}
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <div className="text-xs text-slate-500 uppercase font-semibold">
                                    Psicólogo
                                  </div>
                                  <div className="font-medium text-sm">
                                    {orden.tecnico?.nombre}{" "}
                                    {orden.tecnico?.apellido}
                                  </div>
                                </div>

                                <div className="pt-2 flex justify-end border-t mt-2 gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenAssignModal(orden)}
                                  >
                                    Reasignar
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      localStorage.removeItem("citasFilters");
                                      const searchTerm =
                                        orden.id?.toString() || "";
                                      router.push(
                                        `/dashboard/citas?term=${encodeURIComponent(searchTerm)}`,
                                      );
                                    }}
                                  >
                                    Ver Gestión
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

      <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Consultorio y Horario</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="consultorio">Consultorio</Label>
              <Select
                value={assignConsultorioId}
                onValueChange={setAssignConsultorioId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un consultorio" />
                </SelectTrigger>
                <SelectContent>
                  {consultorios.map((consultorio) => (
                    <SelectItem
                      key={consultorio.id}
                      value={consultorio.id.toString()}
                    >
                      {consultorio.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startTime">Hora Inicio</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={assignStartTime}
                  onChange={(e) => setAssignStartTime(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endTime">Hora Fin</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={assignEndTime}
                  onChange={(e) => setAssignEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAssignModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleAssignSubmit}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
