"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { getAuditoria, getAuditFilterOptions, getAuditoriaForExport } from "./actions";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { FilterDateRange } from "@/components/ui/filter-date-range";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Eye, FileJson, Download, X, Filter } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// --- Types ---
interface AuditLogDetails {
  antes?: Record<string, unknown>;
  despues?: Record<string, unknown>;
  descripcion?: string;
  archivo?: string;
  url?: string;
  [key: string]: unknown;
}

interface AuditLog {
  id: number;
  createdAt: string | Date;
  usuarioId?: number | null;
  Usuario?: {
    nombre: string;
    apellido: string;
    username: string;
  } | null;
  accion: string;
  entidad: string;
  entidadId: string;
  detalles?: AuditLogDetails;
}

interface FilterOptions {
  usuarios: { id: number; nombre: string; apellido: string; username: string }[];
  entidades: string[];
}

type ReferencesMap = Record<string, Record<string, string>>;

// --- Helper Functions ---
const fieldLabels: Record<string, string> = {
  usuarioId: "ID Usuario",
  clienteId: "ID Cliente",
  tecnicoId: "ID Técnico",
  servicioId: "ID Servicio",
  tipoServicioId: "ID Tipo Servicio",
  estadoServicioId: "ID Estado",
  empresaId: "ID Empresa",
  tenantId: "ID Sistema",
  metodoPagoId: "ID Método Pago",
  zonaId: "ID Zona",
  direccionId: "ID Dirección",
  vehiculoId: "ID Vehículo",
  creadoPorId: "ID Creador",
  ordenPadreId: "ID Orden Padre",
  nombre: "Nombre",
  apellido: "Apellido",
  telefono: "Teléfono",
  telefono2: "Teléfono 2",
  correo: "Correo",
  direccion: "Dirección",
  municipio: "Municipio",
  barrio: "Barrio",
  piso: "Piso",
  bloque: "Bloque",
  unidad: "Unidad",
  placa: "Placa",
  marca: "Marca",
  modelo: "Modelo",
  color: "Color",
  tipo: "Tipo",
  activo: "Activo",
  estado: "Estado",
  observacion: "Observación",
  valorCotizado: "Valor Cotizado",
  valorPagado: "Valor Pagado",
  valorRepuestos: "Valor Repuestos",
  fechaVisita: "Fecha Visita",
  horaInicio: "Hora Inicio",
  horaFin: "Hora Fin",
};

const formatValue = (key: string, value: unknown, references?: ReferencesMap): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  
  // Try to resolve reference
  if (references && references[key] && (typeof value === 'number' || typeof value === 'string')) {
    const resolved = references[key][String(value)];
    if (resolved) {
      return `${value} (${resolved})`;
    }
  }

  // Format Dates for specific fields
  const dateFields = ["fechaVisita", "horaInicio", "horaFin", "createdAt", "updatedAt", "deletedAt", "fecha"];
  if (dateFields.includes(key) && (value instanceof Date || (typeof value === "string" && value.length > 5 && !isNaN(Date.parse(value))))) {
    try {
      const date = value instanceof Date ? value : new Date(value);
      if (key === "horaInicio" || key === "horaFin") {
        return format(date, "hh:mm a", { locale: es }); // e.g. 10:30 AM
      }
      if (key === "fechaVisita" || key === "fecha") {
        return format(date, "PPP 'a las' hh:mm a", { locale: es }); // e.g. 15 de enero de 2024 a las 10:30 AM
      }
      return format(date, "PP hh:mm a", { locale: es }); // e.g. 15 ene. 2024 10:30 AM
    } catch (e) {
      console.error("Error formatting date in audit:", e);
    }
  }

  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return format(value, "PP p", { locale: es });
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

// --- Components ---
function ObjectDiff({ detalles, accion, references }: { detalles: AuditLogDetails | undefined; accion: string; references?: ReferencesMap }) {
  const isCreate = accion === "CREATE";
  const isDelete = accion === "DELETE";
  const isUpload = accion === "UPLOAD_FILE";

  const { antes, despues } = detalles || {};

  if (isUpload && detalles) {
    const oldArchivo = (antes && typeof antes.archivo === 'string') ? antes.archivo : null;
    return (
      <div className="bg-purple-50 p-4 rounded-md border border-purple-200">
        <h5 className="font-semibold text-purple-700 mb-2">Detalles del Archivo</h5>
        <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
          <span className="font-medium text-purple-800">Archivo:</span>
          <span className="text-purple-900 font-mono">{detalles.archivo || "Desconocido"}</span>
          <span className="font-medium text-purple-800">URL Nueva:</span>
          <a href={detalles.url as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">
            {detalles.url as string || "Sin URL"}
          </a>
          {oldArchivo && (
            <>
              <span className="font-medium text-red-700">Reemplaza a:</span>
              <a href={oldArchivo} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline truncate block">
                {oldArchivo}
              </a>
            </>
          )}
          {detalles.descripcion && (
             <>
               <span className="font-medium text-purple-800">Nota:</span>
               <span className="text-purple-900">{detalles.descripcion as string}</span>
             </>
          )}
        </div>
      </div>
    );
  }

  if (isCreate) {
    const keys = Object.keys(despues || {});
    if (keys.length === 0) return <p className="text-muted-foreground text-sm italic">Sin datos registrados.</p>;
    return (
      <div className="border rounded-md overflow-hidden text-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-green-50/50">
              <TableHead className="w-[200px] text-green-700">Campo</TableHead>
              <TableHead className="text-green-700">Valor Inicial</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key}>
                <TableCell className="font-medium text-green-800">
                  <div className="flex flex-col">
                    <span>{fieldLabels[key] || key}</span>
                    {fieldLabels[key] && <span className="text-[10px] opacity-50 font-mono">{key}</span>}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-pre-wrap text-green-800">
                  {formatValue(key, despues?.[key], references)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (isDelete) {
    const keys = Object.keys(antes || {});
    if (keys.length === 0) return <p className="text-muted-foreground text-sm italic">Sin datos registrados.</p>;
    return (
      <div className="border rounded-md overflow-hidden text-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-red-50/50">
              <TableHead className="w-[200px] text-red-700">Campo</TableHead>
              <TableHead className="text-red-700">Valor Eliminado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key}>
                <TableCell className="font-medium text-red-800">
                  <div className="flex flex-col">
                    <span>{fieldLabels[key] || key}</span>
                    {fieldLabels[key] && <span className="text-[10px] opacity-50 font-mono">{key}</span>}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-pre-wrap text-red-800">
                  {formatValue(key, antes?.[key], references)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const allKeys = Array.from(new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})]));
  const changedKeys = allKeys.filter(key => {
      return JSON.stringify(antes?.[key]) !== JSON.stringify(despues?.[key]);
  });

  if (changedKeys.length === 0) {
      return <p className="text-muted-foreground text-sm italic">No se detectaron cambios en los campos principales.</p>;
  }

  return (
    <div className="border rounded-md overflow-hidden text-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[150px]">Campo</TableHead>
            <TableHead className="text-red-600">Valor Anterior</TableHead>
            <TableHead className="text-green-600">Valor Nuevo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changedKeys.map((key) => (
            <TableRow key={key}>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <span className="text-slate-700">{fieldLabels[key] || key}</span>
                  {fieldLabels[key] && <span className="text-[10px] text-slate-400 font-mono">{key}</span>}
                </div>
              </TableCell>
              <TableCell className="bg-red-50/50 text-red-700 font-mono text-xs whitespace-pre-wrap">
                {formatValue(key, antes?.[key], references)}
              </TableCell>
              <TableCell className="bg-green-50/50 text-green-700 font-mono text-xs whitespace-pre-wrap">
                {formatValue(key, despues?.[key], references)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AuditoriaPage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  
  const page = Number(searchParams.get("page")) || 1;
  const ITEMS_PER_PAGE = 20;

  // Filter States (Synced with URL)
  const currentAccion = searchParams.get("accion") || "all";
  const currentEntidad = searchParams.get("entidad") || "all";
  const currentUsuario = searchParams.get("usuarioId") || "all";
  const currentEntidadId = searchParams.get("entidadId") || "";
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ usuarios: [], entidades: [] });
  const [references, setReferences] = useState<ReferencesMap>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Load Filter Options (Users, Entities)
  useEffect(() => {
    const loadOptions = async () => {
      const token = localStorage.getItem("token");
      if (token) {
        const data = await getAuditFilterOptions(token);
        if (data && !data.error) {
          setFilterOptions({
            usuarios: data.usuarios || [],
            entidades: data.entidades || []
          });
        }
      }
    };
    loadOptions();
  }, []);

  // Fetch Logs
  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (token) {
        const filtros = {
          accion: currentAccion !== "all" ? currentAccion : undefined,
          entidad: currentEntidad !== "all" ? currentEntidad : undefined,
          usuarioId: currentUsuario !== "all" ? Number(currentUsuario) : undefined,
          entidadId: currentEntidadId || undefined,
          fechaInicio: startDate || undefined,
          fechaFin: endDate || undefined,
        };

        const result = await getAuditoria(token, page, ITEMS_PER_PAGE, filtros);
        if (isMounted && result.logs) {
            setLogs(result.logs as unknown as AuditLog[]);
            setTotalPages(result.totalPages || 1);
            setTotal(result.total || 0);
            if (result.references) {
              setReferences(result.references);
            }
        }
      }
      if (isMounted) setLoading(false);
    };
    fetchLogs();
    return () => { isMounted = false; };
  }, [page, currentAccion, currentEntidad, currentUsuario, currentEntidadId, startDate, endDate]);

  // Filter Handlers
  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1");
    replace(`${pathname}?${params.toString()}`);
  };

  const clearFilters = () => {
    replace(pathname);
  };

  const handleExport = async () => {
    setExporting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const filtros = {
        accion: currentAccion,
        entidad: currentEntidad,
        usuarioId: currentUsuario !== "all" ? Number(currentUsuario) : undefined,
        entidadId: currentEntidadId || undefined,
        fechaInicio: startDate || undefined,
        fechaFin: endDate || undefined,
    };

    try {
        const result = await getAuditoriaForExport(token, filtros);
        if (result.error || !result.logs) {
            toast.error("Error al exportar datos");
            setExporting(false);
            return;
        }

        // Generate Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Auditoría");

        worksheet.columns = [
            { header: "ID Log", key: "id", width: 10 },
            { header: "Fecha", key: "createdAt", width: 25 },
            { header: "ID Usuario", key: "usuarioId", width: 15 },
            { header: "Usuario", key: "usuario", width: 30 },
            { header: "Acción", key: "accion", width: 15 },
            { header: "Entidad", key: "entidad", width: 20 },
            { header: "ID Entidad", key: "entidadId", width: 15 },
            { header: "Detalles", key: "detalles", width: 50 },
        ];

        result.logs.forEach(log => {
            const usuarioStr = log.Usuario ? `${log.Usuario.nombre} ${log.Usuario.apellido} (${log.Usuario.username})` : "Sistema";
            worksheet.addRow({
                id: log.id,
                createdAt: format(new Date(log.createdAt), "PPpp", { locale: es }),
                usuarioId: log.usuarioId || "Sistema",
                usuario: usuarioStr,
                accion: log.accion,
                entidad: log.entidad,
                entidadId: log.entidadId,
                detalles: log.detalles // Raw JSON string for now, simplifies export
            });
        });

        // Style Header
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6E6E6' }
        };

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        saveAs(blob, `Auditoria_Axis_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);
        toast.success("Exportación completada");

    } catch (e) {
        console.error(e);
        toast.error("Error generando archivo Excel");
    } finally {
        setExporting(false);
    }
  };

  const getActionBadge = (accion: string) => {
    switch (accion) {
      case "CREATE": return <Badge className="bg-green-100 text-green-800 border-green-200">Creación</Badge>;
      case "UPDATE": return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Actualización</Badge>;
      case "DELETE": return <Badge className="bg-red-100 text-red-800 border-red-200">Eliminación</Badge>;
      case "UPLOAD_FILE": return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Archivo</Badge>;
      default: return <Badge variant="outline">{accion}</Badge>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/30">
      <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Auditoría de Sistema</h1>
            <p className="text-muted-foreground">
              Monitoreo y trazabilidad detallada de todas las acciones realizadas.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
              <Button 
                variant="outline" 
                onClick={handleExport} 
                disabled={exporting}
                className="w-full md:w-auto shadow-sm"
              >
                  <Download className="mr-2 h-4 w-4" />
                  {exporting ? "Generando..." : "Exportar Excel"}
              </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <Card className="bg-white shadow-sm border-slate-200">
          <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 mr-2">
                      <Filter className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Filtros:</span>
                  </div>
                  
                  <div className="flex-1 flex flex-wrap items-center gap-3 min-w-0">
                    <FilterDateRange />

                    <Select value={currentAccion} onValueChange={(val) => handleFilterChange("accion", val)}>
                        <SelectTrigger className="w-[140px] h-9 text-xs bg-white border-slate-200">
                            <SelectValue placeholder="Acción" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las acciones</SelectItem>
                            <SelectItem value="CREATE">Creación</SelectItem>
                            <SelectItem value="UPDATE">Actualización</SelectItem>
                            <SelectItem value="DELETE">Eliminación</SelectItem>
                            <SelectItem value="UPLOAD_FILE">Archivos</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={currentEntidad} onValueChange={(val) => handleFilterChange("entidad", val)}>
                        <SelectTrigger className="w-[160px] h-9 text-xs bg-white border-slate-200">
                            <SelectValue placeholder="Entidad" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las entidades</SelectItem>
                            {filterOptions.entidades.map(ent => (
                                <SelectItem key={ent} value={ent}>{ent}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={currentUsuario} onValueChange={(val) => handleFilterChange("usuarioId", val)}>
                        <SelectTrigger className="w-[180px] h-9 text-xs bg-white border-slate-200">
                            <SelectValue placeholder="Usuario" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los usuarios</SelectItem>
                            {filterOptions.usuarios.map(usr => (
                                <SelectItem key={usr.id} value={usr.id.toString()}>
                                    {usr.nombre} {usr.apellido}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Input 
                        placeholder="ID Entidad..." 
                        className="w-[100px] h-9 text-xs bg-white border-slate-200" 
                        value={currentEntidadId}
                        onChange={(e) => handleFilterChange("entidadId", e.target.value)}
                    />

                    {(currentAccion !== "all" || currentEntidad !== "all" || currentUsuario !== "all" || currentEntidadId || startDate || endDate) && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-3 text-slate-500 hover:text-red-600 hover:bg-red-50">
                            <X className="mr-1.5 h-3.5 w-3.5" />
                            Limpiar
                        </Button>
                    )}
                  </div>
              </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 overflow-hidden">
          <CardHeader className="bg-white border-b border-slate-100 py-4">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-indigo-500" />
              Registros Encontrados ({total})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative w-full overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="w-[180px]">Fecha y Hora</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Entidad</TableHead>
                    <TableHead>ID Entidad</TableHead>
                    <TableHead className="text-right px-6">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-20 text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm font-medium animate-pulse">Cargando registros...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-20 text-slate-500 bg-slate-50/20">
                        <div className="flex flex-col items-center gap-1">
                          <Filter className="h-8 w-8 text-slate-200 mb-2" />
                          <span className="text-lg font-medium text-slate-400">Sin resultados</span>
                          <span className="text-sm text-slate-400">Intenta ajustar los filtros de búsqueda</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                        <TableCell className="font-medium text-xs text-slate-600 pl-6">
                          {format(new Date(log.createdAt), "PP p", { locale: es })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.Usuario ? (
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-700">{log.Usuario.nombre} {log.Usuario.apellido}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground font-mono">@{log.Usuario.username}</span>
                                <span className="text-[10px] text-slate-300">•</span>
                                <span className="text-[10px] text-indigo-500 font-bold">ID: {log.usuarioId || "N/A"}</span>
                              </div>
                            </div>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Sistema</Badge>
                          )}
                        </TableCell>
                        <TableCell>{getActionBadge(log.accion)}</TableCell>
                        <TableCell className="text-xs font-medium text-slate-600">{log.entidad}</TableCell>
                        <TableCell className="text-xs font-mono text-slate-500">#{log.entidadId}</TableCell>
                        <TableCell className="text-right pr-6">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="hover:bg-indigo-50 hover:text-indigo-600 rounded-full h-8 w-8 transition-all">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                              <DialogHeader className="border-b pb-4">
                                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                  <FileJson className="h-5 w-5 text-indigo-500" />
                                  Detalles de Auditoría #{log.id}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-6 py-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="p-5 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Información General</h4>
                                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                                      <span className="text-slate-500">Acción:</span>
                                      <span className="font-medium">{getActionBadge(log.accion)}</span>
                                      <span className="text-slate-500">Entidad:</span>
                                      <span className="font-medium text-slate-700">{log.entidad}</span>
                                      <span className="text-slate-500">ID del Registro:</span>
                                      <span className="font-mono font-bold text-indigo-600">#{log.entidadId}</span>
                                      <span className="text-slate-500">Fecha y Hora:</span>
                                      <span className="font-medium text-slate-700">{format(new Date(log.createdAt), "PPPPpppp", { locale: es })}</span>
                                    </div>
                                  </div>
                                  <div className="p-5 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Responsable</h4>
                                    {log.Usuario ? (
                                      <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                          {log.Usuario.nombre[0]}{log.Usuario.apellido[0]}
                                        </div>
                                        <div className="flex flex-col">
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-700">{log.Usuario.nombre} {log.Usuario.apellido}</span>
                                            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 font-bold">ID: {log.usuarioId}</span>
                                          </div>
                                          <span className="text-xs text-slate-500 font-mono">@{log.Usuario.username}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 text-slate-500 italic text-sm">
                                        <Badge variant="outline">Proceso Automático</Badge>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {log.detalles && (
                                  <div className="space-y-4 pt-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                                      <div className="h-4 w-1 bg-indigo-500 rounded-full" />
                                      Contenido del Cambio
                                    </h4>
                                    
                                    <div className="bg-white rounded-xl">
                                      <ObjectDiff 
                                        detalles={log.detalles} 
                                        accion={log.accion}
                                        references={references}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="p-4 bg-slate-50/50 border-t border-slate-100">
              <PaginationControls
                currentPage={page}
                totalPages={totalPages}
                totalRecords={total}
                itemsPerPage={ITEMS_PER_PAGE}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
