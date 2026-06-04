"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getSessionEvents } from "./actions"; 
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, Search as SearchIcon, FileSpreadsheet } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { toast } from "sonner";

interface SessionData {
  id: number;
  fechaInicio: string | null;
  fechaFin: string | null;
  currentSessionActive: boolean; 
  tiempoInactivo: number;
  usuario: {
    nombre: string;
    apellido: string;
    username: string;
    rol?: string;
  };
  eventos: {
    tipo: string;
    createdAt: string;
  }[];
  status?: "ONLINE" | "OFFLINE";
}

export default function ActividadPage() {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const loadData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No autorizado");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/monitor/report?date=${selectedDate}&t=${Date.now()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}: ${res.statusText}`);
      }

      const result = await res.json();
      if (result.success && result.data) {
        setSessions(result.data);
        setError(null);
      } else {
        setError("Error al procesar datos");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;
    const query = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.usuario.nombre.toLowerCase().includes(query) ||
        s.usuario.apellido.toLowerCase().includes(query) ||
        s.usuario.username.toLowerCase().includes(query) ||
        (s.usuario.rol && s.usuario.rol.toLowerCase().includes(query))
    );
  }, [sessions, searchQuery]);

  const handleExportExcel = async () => {
    if (filteredSessions.length === 0) {
      toast.error("No hay datos para exportar");
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Reporte Actividad");

      worksheet.columns = [
        { header: "Usuario", key: "nombre", width: 30 },
        { header: "Username", key: "username", width: 20 },
        { header: "Rol", key: "rol", width: 15 },
        { header: "Inicio Sesión", key: "inicio", width: 20 },
        { header: "Fin Sesión", key: "fin", width: 20 },
        { header: "Estado", key: "estado", width: 15 },
        { header: "Tiempo Inactivo (min)", key: "inactivo", width: 20 },
        { header: "Último Evento", key: "ultimoEvento", width: 25 },
        { header: "Hora Último Evento", key: "horaEvento", width: 20 },
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      filteredSessions.forEach((session) => {
        let statusText = "Offline";
        
        if (session.status !== "OFFLINE" && session.fechaInicio) {
          if (!session.currentSessionActive) {
            statusText = "Finalizada";
          } else {
             const lastEvent = session.eventos[0];
             const lastEventTime = lastEvent ? new Date(lastEvent.createdAt) : new Date(session.fechaInicio);
             const mins = differenceInMinutes(new Date(), lastEventTime);
             
             if (lastEvent?.tipo === "INACTIVIDAD_INICIO" || lastEvent?.tipo === "FOCO_PERDIDO" || mins >= 5) {
                statusText = "Ausente";
             } else {
                statusText = "Activo";
             }
          }
        }

        worksheet.addRow({
          nombre: `${session.usuario.nombre} ${session.usuario.apellido}`,
          username: session.usuario.username,
          rol: session.usuario.rol || "-",
          inicio: session.fechaInicio ? format(new Date(session.fechaInicio), "yyyy-MM-dd HH:mm") : "-",
          fin: session.fechaFin ? format(new Date(session.fechaFin), "yyyy-MM-dd HH:mm") : "-",
          estado: statusText,
          inactivo: session.tiempoInactivo,
          ultimoEvento: session.eventos[0]?.tipo || "-",
          horaEvento: session.eventos[0] ? format(new Date(session.eventos[0].createdAt), "HH:mm:ss") : "-",
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, `reporte_actividad_${selectedDate}.xlsx`);
      toast.success("Reporte descargado correctamente");
    } catch (error) {
      console.error("Error exporting excel:", error);
      toast.error("Error al generar el archivo Excel");
    }
  };

  const getStatusBadge = (session: SessionData) => {
    if (session.status === "OFFLINE" || !session.fechaInicio) {
       return <Badge variant="outline" className="text-muted-foreground">Offline</Badge>;
    }

    if (!session.currentSessionActive) {
      return <Badge variant="outline">Finalizada</Badge>;
    }

    const lastEvent = session.eventos[0];
    
    if (lastEvent) {
      if (lastEvent.tipo === "INACTIVIDAD_INICIO" || lastEvent.tipo === "FOCO_PERDIDO") {
         const minutesSinceEvent = differenceInMinutes(new Date(), new Date(lastEvent.createdAt));
         return <Badge variant="secondary" className="bg-yellow-200 text-yellow-800 hover:bg-yellow-300">Ausente ({minutesSinceEvent}m)</Badge>;
      }
    }

    const lastEventTime = lastEvent
      ? new Date(lastEvent.createdAt)
      : new Date(session.fechaInicio);
    
    const minutesSinceLastEvent = differenceInMinutes(new Date(), lastEventTime);

    if (minutesSinceLastEvent < 5) {
      return <Badge className="bg-green-500 hover:bg-green-600">Activo</Badge>;
    } else {
      return <Badge variant="secondary" className="bg-yellow-200 text-yellow-800 hover:bg-yellow-300">Ausente ({minutesSinceLastEvent}m)</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 space-y-6">
      <div className="flex-none flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Monitoreo de Actividad</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Input
            type="date"
            className="w-full sm:w-[150px]"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <div className="relative w-full sm:w-[250px]">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuario..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button onClick={handleExportExcel} variant="outline" className="shrink-0">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={() => { setLoading(true); loadData(); }} variant="default" className="shrink-0" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex-none p-4 bg-red-50 text-red-600 rounded-md border border-red-200">
          {error}
        </div>
      )}

      <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
        <CardHeader className="flex-none">
          <CardTitle>Estado de Usuarios ({format(parseISO(selectedDate), "d 'de' MMMM", { locale: es })})</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-0 relative">
          {loading && filteredSessions.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSessions.length === 0 ? (
             <div className="text-center py-8 text-muted-foreground">
               {sessions.length === 0 ? "No hay registros para esta fecha." : "No se encontraron usuarios con ese filtro."}
             </div>
          ) : (
            <div className="w-full relative">
              <table className="w-full text-sm text-left caption-bottom">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Usuario</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Inicio Sesión</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Fin Sesión</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Estado</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Tiempo Inactivo</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Último Evento</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Detalle</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {filteredSessions.map((session) => (
                    <tr key={session.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle font-medium">
                        <div className="flex flex-col">
                          <span>{session.usuario.nombre} {session.usuario.apellido}</span>
                          <span className="text-xs text-muted-foreground">@{session.usuario.username} {session.usuario.rol && `• ${session.usuario.rol}`}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        {session.fechaInicio ? format(new Date(session.fechaInicio), "HH:mm", { locale: es }) : "--:--"}
                      </td>
                      <td className="p-4 align-middle">
                        {session.fechaFin ? format(new Date(session.fechaFin), "HH:mm", { locale: es }) : "--:--"}
                      </td>
                      <td className="p-4 align-middle">
                        {getStatusBadge(session)}
                      </td>
                      <td className="p-4 align-middle">
                        <span className="font-mono">{session.tiempoInactivo > 0 ? `${session.tiempoInactivo} min` : "-"}</span>
                      </td>
                      <td className="p-4 align-middle">
                        {session.eventos && session.eventos[0] ? (
                           <div className="flex flex-col text-sm">
                             <span className="font-medium">{session.eventos[0].tipo}</span>
                             <span className="text-xs text-muted-foreground">
                               hace {differenceInMinutes(new Date(), new Date(session.eventos[0].createdAt))} min
                             </span>
                           </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        {session.id > 0 && (
                          <EventsModal sessionId={session.id} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface EventLog {
  id: number;
  tipo: string;
  ruta: string | null;
  descripcion: string | null;
  createdAt: Date;
}

function EventsModal({ sessionId }: { sessionId: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchEvents = useCallback(async (pageToLoad: number) => {
    setLoading(true);
    const res = await getSessionEvents(sessionId, pageToLoad, 50);
    if (res.success && res.data) {
      const newEvents = res.data as unknown as EventLog[];
      setEvents((prev) => (pageToLoad === 1 ? newEvents : [...prev, ...newEvents]));
      
      if (typeof res.total === 'number') {
         setHasMore((pageToLoad * 50) < res.total);
      } else {
         setHasMore(newEvents.length === 50);
      }
      setPage(pageToLoad + 1);
    }
    setLoading(false);
  }, [sessionId]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setEvents([]);
      setPage(1);
      setHasMore(true);
      fetchEvents(1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Ver Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Historial Completo (Sesión #{sessionId})</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-2">
          {events.length === 0 && loading ? (
             <div className="flex justify-center py-8">
               <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
             </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Detalles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(event.createdAt), "HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {event.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-blue-500 max-w-[150px] truncate" title={event.ruta || undefined}>
                      {event.ruta}
                    </TableCell>
                     <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={event.descripcion || undefined}>
                      {event.descripcion}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {hasMore && (
            <div className="py-4 flex justify-center">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchEvents(page)} 
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Cargar más
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}