"use client";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Search,
  User,
  FileText,
  Phone,
  Mail,
  MapPin,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  Users,
  Building2,
  Map,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Car,
  MoreVertical,
  Briefcase,
  ExternalLink,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  getClientes,
  getCliente,
  deleteCliente,
  getClientesStats,
  getClienteServicios,
  getAllClientesForExport,
} from "./actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Combobox } from "@/components/ui/combobox";
import { municipiosAntioquia } from "@/lib/constants/municipios";
import { useUserRole } from "@/hooks/use-user-role";

interface Cliente {
  id: number;
  nombre: string | null;
  apellido: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  telefono: string;
  telefono2: string | null;
  correo: string | null;
  createdAt: Date;
  registroDocumento: string | null;
  documentoPath: string | null;
  direcciones: {
    direccion: string;
    municipio: string | null;
    barrio: string | null;
    piso: string | null;
    bloque: string | null;
    unidad: string | null;
    linkMaps: string | null;
  }[];
  vehiculos: {
    placa: string;
    marca: string | null;
    modelo: string | null;
    color: string | null;
    tipo: string | null;
  }[];
  PaqueteAdquirido?: {
    id: number;
    saldoRestante: number;
    sesionesTotales: number;
    TerapiasPsicologos: {
      nombre: string;
    };
  }[];
}

interface ClienteServicio {
  id: number;
  numeroOrden: string | null;
  fechaVisita: Date | null;
  valorPagado: number;
  valorCotizado: number;
  valorRepuestos: number;
  servicio: {
    nombre: string;
  };
  estadoServicio: {
    nombre: string;
  };
  tecnico: {
    nombre: string;
    apellido: string;
  } | null;
  vehiculo: {
    placa: string;
  } | null;
}

interface Stats {
  totalClientes: number;
  municipios: { nombre: string; cantidad: number }[];
  barrios: { nombre: string; cantidad: number }[];
}

export default function ClientesPage() {
  const { tenantId, userId } = useUserRole();
  const [clientes, setClientes] = useState<Cliente[]>([]);

  // Logic to block delete
  const blockedUserIds =
    process.env.NEXT_PUBLIC_USER_ID_BLOCK_DELETE?.split(",").map((id) =>
      id.trim(),
    ) || [];
  const isBlockedToDelete = userId
    ? blockedUserIds.includes(userId.toString())
    : false;
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Search & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyNoServices, setShowOnlyNoServices] = useState(false);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedMunicipio, setSelectedMunicipio] = useState("all");
  const [barrioFilter, setBarrioFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const itemsPerPage = 10;

  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [clientServices, setClientServices] = useState<ClienteServicio[]>([]);
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const router = useRouter();

  const handleExportExcel = async () => {
    setIsExporting(true);
    const token = localStorage.getItem("token");
    if (!token) {
      setIsExporting(false);
      return;
    }

    const result = await getAllClientesForExport(
      token,
      debouncedSearchTerm,
      showOnlyNoServices,
      {
        municipio: selectedMunicipio,
        barrio: barrioFilter,
        startDate,
        endDate,
      },
    );

    if (result.error) {
      toast.error(result.error);
      setIsExporting(false);
      return;
    }

    const clientesParaExportar = result.clientes as Cliente[];

    if (!clientesParaExportar || clientesParaExportar.length === 0) {
      toast.error("No hay clientes para exportar");
      setIsExporting(false);
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Clientes");

    const columns = [
      { header: "Nombre", key: "nombre", width: 20 },
      { header: "Apellido", key: "apellido", width: 20 },
      { header: "Tipo Documento", key: "tipoDocumento", width: 15 },
      { header: "Número Documento", key: "numeroDocumento", width: 20 },
      { header: "Teléfono", key: "telefono", width: 15 },
      { header: "Teléfono 2", key: "telefono2", width: 15 },
      { header: "Correo", key: "correo", width: 25 },
      { header: "Fecha Registro", key: "createdAt", width: 20 },
      { header: "Direcciones", key: "direcciones", width: 50 },
      { header: "Vehículos", key: "vehiculos", width: 50 },
    ];

    if (tenantId === 4) {
      columns.splice(
        8,
        0,
        { header: "Paquete", key: "paquete", width: 25 },
        { header: "Sesiones Restantes", key: "sesiones", width: 15 },
      );
    }

    worksheet.columns = columns;

    clientesParaExportar.forEach((cliente: Cliente) => {
      const rowData: Record<string, unknown> = {
        nombre: cliente.nombre || "",
        apellido: cliente.apellido || "",
        tipoDocumento: cliente.tipoDocumento || "",
        numeroDocumento: cliente.numeroDocumento || "",
        telefono: cliente.telefono || "",
        telefono2: cliente.telefono2 || "",
        correo: cliente.correo || "",
        createdAt: new Date(cliente.createdAt).toLocaleString(),
        direcciones: cliente.direcciones
          .map((d) => `${d.direccion} (${d.municipio || ""})`)
          .join(" | "),
        vehiculos: cliente.vehiculos
          .map((v) => `${v.placa} ${v.marca || ""} ${v.modelo || ""}`)
          .join(" | "),
      };

      if (tenantId === 4 && cliente.PaqueteAdquirido?.[0]) {
        rowData.paquete = cliente.PaqueteAdquirido[0].TerapiasPsicologos.nombre;
        rowData.sesiones = `${cliente.PaqueteAdquirido[0].saldoRestante} / ${cliente.PaqueteAdquirido[0].sesionesTotales}`;
      }

      worksheet.addRow(rowData);
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "F2F2F2" },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, `clientes_${new Date().toISOString().split("T")[0]}.xlsx`);
    setIsExporting(false);
  };

  const [showKPIs, setShowKPIs] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showKPIs_clientes");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem("showKPIs_clientes", showKPIs.toString());
  }, [showKPIs]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset page on search
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Initial Stats Load
  useEffect(() => {
    const fetchStats = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      const statsRes = await getClientesStats(token);
      if (statsRes.stats) {
        setStats(statsRes.stats);
      }
    };
    fetchStats();
  }, [refreshTrigger]); // Reload stats on refresh too

  // Fetch clients on page/search/refresh change
  useEffect(() => {
    const fetchClientes = async () => {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const result = await getClientes(
        token,
        currentPage,
        itemsPerPage,
        debouncedSearchTerm,
        showOnlyNoServices,
        {
          municipio: selectedMunicipio,
          barrio: barrioFilter,
          startDate,
          endDate,
        },
      );

      if (result.error) {
        toast.error(result.error);
        if (result.error === "No autorizado") {
          router.push("/sign-in");
        }
      } else if (result.clientes) {
        setClientes(result.clientes as Cliente[]);
        setTotalPages(result.totalPages || 1);
        setTotalRecords(result.total || 0);
      }

      setLoading(false);
    };

    fetchClientes();
  }, [
    router,
    currentPage,
    debouncedSearchTerm,
    refreshTrigger,
    showOnlyNoServices,
    selectedMunicipio,
    barrioFilter,
    startDate,
    endDate,
  ]);

  const handleViewCliente = async (id: number) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await getCliente(token, id);
    if (result.error) {
      toast.error(result.error);
    } else if (result.cliente) {
      setSelectedCliente(result.cliente);
      setIsViewModalOpen(true);
    }
  };

  const handleViewServices = async (cliente: Cliente) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await getClienteServicios(token, cliente.id);
    if (result.error) {
      toast.error(result.error);
    } else if (result.servicios) {
      setSelectedCliente(cliente);
      setClientServices(result.servicios);
      setIsServicesModalOpen(true);
    }
  };

  const handleDeleteClick = (id: number) => {
    setClientToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!clientToDelete) return;

    setIsDeleting(true);
    const token = localStorage.getItem("token");
    if (!token) {
      setIsDeleting(false);
      return;
    }

    const result = await deleteCliente(token, clientToDelete);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      // Actualizar la lista localmente
      setRefreshTrigger((prev) => prev + 1); // Trigger refresh
      // Also update stats if needed or just decrement locally
      if (stats) {
        setStats({
          ...stats,
          totalClientes: Math.max(0, stats.totalClientes - 1),
        });
      }
      setIsDeleteModalOpen(false);
      setClientToDelete(null);
    }
    setIsDeleting(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
            <p className="text-sm text-slate-600 mt-1">
              Gestiona tu base de datos de clientes
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowKPIs(!showKPIs)}
              className="gap-2"
              title={showKPIs ? "Ocultar indicadores" : "Mostrar indicadores"}
            >
              {showKPIs ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {showKPIs ? "Ocultar KPIs" : "Mostrar KPIs"}
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={handleExportExcel}
              className="gap-2"
              disabled={isExporting}
            >
              {isExporting ? (
                <div className="h-4 w-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Exportar Excel</span>
            </Button>
            <Button
              onClick={() => router.push("/dashboard/clientes/nuevo")}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Cliente
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      {stats && showKPIs && (
        <div className="flex-none px-8 py-6 bg-slate-50 border-b border-slate-200 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="max-w-7xl mx-auto grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Clientes
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalClientes}</div>
                <p className="text-xs text-muted-foreground">
                  Registrados en el sistema
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Municipios Frecuentes
                </CardTitle>
                <Map className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.municipios.length > 0 ? (
                    stats.municipios.slice(0, 3).map((m, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="truncate text-muted-foreground">
                          {m.nombre}
                        </span>
                        <span className="font-bold">{m.cantidad}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Sin datos registrados
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Barrios Frecuentes
                </CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.barrios.length > 0 ? (
                    stats.barrios.slice(0, 3).map((b, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="truncate text-muted-foreground">
                          {b.nombre}
                        </span>
                        <span className="font-bold">{b.cantidad}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Sin datos registrados
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar cliente..."
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Combobox
            options={[
              { value: "all", label: "Todos los municipios" },
              ...Array.from(
                new Set(municipiosAntioquia.map((m) => m.nombre)),
              ).map((nombre) => ({
                value: nombre,
                label: nombre,
              })),
            ]}
            value={selectedMunicipio}
            onChange={setSelectedMunicipio}
            placeholder="Municipio"
            className="w-full md:w-[180px]"
          />

          <Input
            placeholder="Filtrar por barrio..."
            value={barrioFilter}
            onChange={(e) => setBarrioFilter(e.target.value)}
            className="w-full md:w-[180px] bg-white"
          />

          <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-200">
            <span className="text-[10px] text-slate-500 whitespace-nowrap px-1">
              Registro:
            </span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[130px] border-0 focus-visible:ring-0 h-7 p-1 text-xs"
            />
            <span className="text-slate-300">-</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[130px] border-0 focus-visible:ring-0 h-7 p-1 text-xs"
            />
          </div>

          <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm">
            <Checkbox
              id="no-services"
              checked={showOnlyNoServices}
              onCheckedChange={(checked) => {
                setShowOnlyNoServices(checked as boolean);
                setCurrentPage(1);
              }}
            />
            <Label
              htmlFor="no-services"
              className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer whitespace-nowrap"
            >
              Sin servicios
            </Label>
          </div>

          {(searchTerm ||
            selectedMunicipio !== "all" ||
            barrioFilter ||
            startDate ||
            endDate ||
            showOnlyNoServices) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setSelectedMunicipio("all");
                setBarrioFilter("");
                setStartDate("");
                setEndDate("");
                setShowOnlyNoServices(false);
              }}
              className="text-slate-500 hover:text-red-600 hover:bg-red-50 h-8 px-2"
              title="Borrar filtros"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Borrar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          {loading ? (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                  <tr>
                    <th className="px-6 py-4">Cliente</th>
                    {tenantId === 4 && (
                      <>
                        <th className="px-6 py-4">Paquete</th>
                        <th className="px-6 py-4">Sesiones</th>
                      </>
                    )}
                    <th className="px-6 py-4">Documento</th>
                    <th className="px-6 py-4">Contacto</th>
                    <th className="px-6 py-4">Ubicación</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </td>
                      {tenantId === 4 && (
                        <>
                          <td className="px-6 py-4">
                            <Skeleton className="h-4 w-24" />
                          </td>
                          <td className="px-6 py-4">
                            <Skeleton className="h-6 w-12" />
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-4 rounded-full" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <Skeleton className="h-4 w-4" />
                          <Skeleton className="h-8 w-40" />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Skeleton className="h-8 w-8 rounded-md ml-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : clientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <User className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron clientes</p>
              <p className="text-sm">Agrega un nuevo cliente para comenzar</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                    <tr>
                      <th className="px-6 py-4">Cliente</th>
                      {tenantId === 4 && (
                        <>
                          <th className="px-6 py-4">Paquete</th>
                          <th className="px-6 py-4">Sesiones</th>
                        </>
                      )}
                      <th className="px-6 py-4">Documento</th>
                      <th className="px-6 py-4">Contacto</th>
                      <th className="px-6 py-4">Ubicación</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientes.map((cliente) => (
                      <tr
                        key={cliente.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold shrink-0">
                              {cliente.nombre?.[0]?.toUpperCase()}
                              {cliente.apellido?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">
                                {cliente.nombre} {cliente.apellido}
                              </div>
                              <div className="text-slate-500 text-xs mt-0.5">
                                Registrado el{" "}
                                {new Date(
                                  cliente.createdAt,
                                ).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </td>
                        {tenantId === 4 && (
                          <>
                            <td className="px-6 py-4">
                              {cliente.PaqueteAdquirido?.[0] ? (
                                <span className="font-medium text-blue-600">
                                  {
                                    cliente.PaqueteAdquirido[0]
                                      .TerapiasPsicologos.nombre
                                  }
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">
                                  Sin paquete activo
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {cliente.PaqueteAdquirido?.[0] ? (
                                <Badge
                                  variant={
                                    cliente.PaqueteAdquirido[0].saldoRestante <=
                                    1
                                      ? "destructive"
                                      : "secondary"
                                  }
                                >
                                  {cliente.PaqueteAdquirido[0].saldoRestante} /{" "}
                                  {cliente.PaqueteAdquirido[0].sesionesTotales}
                                </Badge>
                              ) : (
                                "-"
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-slate-600">
                            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900">
                                {cliente.numeroDocumento}
                              </span>
                              <span className="text-xs text-slate-500">
                                {cliente.tipoDocumento}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-slate-600">
                              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>{cliente.telefono}</span>
                            </div>
                            {cliente.telefono2 &&
                              cliente.telefono2 !== "No Concretado" && (
                                <div className="flex items-center gap-2 text-slate-600">
                                  <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span>{cliente.telefono2}</span>
                                </div>
                              )}
                            {cliente.correo && (
                              <div className="flex items-center gap-2 text-slate-600">
                                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[180px]">
                                  {cliente.correo}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {cliente.direcciones[0] ? (
                            <div className="flex items-start gap-2 text-slate-600 max-w-[200px]">
                              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2 text-sm">
                                {cliente.direcciones[0].direccion}
                                {cliente.direcciones[0].municipio &&
                                  `, ${cliente.direcciones[0].municipio}`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">
                              Sin dirección
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Abrir menú</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleViewCliente(cliente.id)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Ver detalles
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleViewServices(cliente)}
                              >
                                <Briefcase className="mr-2 h-4 w-4" />
                                Servicios
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(
                                    `/dashboard/clientes/${cliente.id}/editar`,
                                  )
                                }
                              >
                                Editar
                                <Edit className="mr-2 h-4 w-4" />
                              </DropdownMenuItem>
                              {!isBlockedToDelete && (
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => handleDeleteClick(cliente.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6 rounded-lg shadow-sm">
                  <div className="flex flex-1 justify-between sm:hidden">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                      }
                      disabled={currentPage === 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Siguiente
                    </Button>
                  </div>
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-slate-700">
                        Mostrando{" "}
                        <span className="font-medium">
                          {(currentPage - 1) * itemsPerPage + 1}
                        </span>{" "}
                        a{" "}
                        <span className="font-medium">
                          {Math.min(currentPage * itemsPerPage, totalRecords)}
                        </span>{" "}
                        de <span className="font-medium">{totalRecords}</span>{" "}
                        resultados
                      </p>
                    </div>
                    <div>
                      <nav
                        className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                        aria-label="Pagination"
                      >
                        <Button
                          variant="outline"
                          className="rounded-l-md px-2 py-2"
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                        >
                          <span className="sr-only">Primera</span>
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          className="px-2 py-2"
                          onClick={() =>
                            setCurrentPage((prev) => Math.max(prev - 1, 1))
                          }
                          disabled={currentPage === 1}
                        >
                          <span className="sr-only">Anterior</span>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center px-4 border-y border-slate-200 bg-white text-sm font-medium text-slate-700">
                          Página {currentPage} de {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          className="px-2 py-2"
                          onClick={() =>
                            setCurrentPage((prev) =>
                              Math.min(prev + 1, totalPages),
                            )
                          }
                          disabled={currentPage === totalPages}
                        >
                          <span className="sr-only">Siguiente</span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-r-md px-2 py-2"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          <span className="sr-only">Última</span>
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de Servicios */}
      <Dialog open={isServicesModalOpen} onOpenChange={setIsServicesModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de Servicios</DialogTitle>
            <DialogDescription>
              Servicios realizados para {selectedCliente?.nombre}{" "}
              {selectedCliente?.apellido}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {clientServices.length > 0 ? (
              <div className="rounded-md border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b font-medium text-slate-500">
                    <tr>
                      <th className="px-4 py-3">No. Orden</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Servicio</th>
                      <th className="px-4 py-3">Técnico</th>
                      <th className="px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientServices.map((servicio) => (
                      <tr key={servicio.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">
                          {servicio.numeroOrden || "N/A"}
                        </td>
                        <td className="px-4 py-3">
                          {servicio.fechaVisita
                            ? new Date(
                                servicio.fechaVisita,
                              ).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {servicio.servicio?.nombre}
                        </td>
                        <td className="px-4 py-3">
                          {servicio.tecnico
                            ? `${servicio.tecnico.nombre} ${servicio.tecnico.apellido}`
                            : "Sin asignar"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              servicio.estadoServicio?.nombre === "Terminado"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {servicio.estadoServicio?.nombre}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500 border rounded-md border-dashed">
                <Briefcase className="h-10 w-10 mb-2 opacity-50" />
                <p>
                  No se encontraron servicios registrados para este cliente.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalle */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Cliente</DialogTitle>
            <DialogDescription>
              Información completa registrada en el sistema
            </DialogDescription>
          </DialogHeader>

          {selectedCliente && (
            <div className="space-y-6 mt-4">
              {/* Información Personal */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider border-b pb-2">
                  Información Personal
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-slate-500 block">
                      Nombre Completo
                    </span>
                    <span className="text-base font-medium text-slate-900">
                      {selectedCliente.nombre} {selectedCliente.apellido}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500 block">
                      Documento
                    </span>
                    <span className="text-base font-medium text-slate-900">
                      {selectedCliente.tipoDocumento}:{" "}
                      {selectedCliente.numeroDocumento}
                    </span>
                  </div>
                </div>
              </div>

              {/* Documentos */}
              {tenantId === 4 &&
                (selectedCliente.documentoPath ||
                  selectedCliente.registroDocumento) && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider border-b pb-2">
                      Documentos
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedCliente.documentoPath &&
                        selectedCliente.documentoPath !== "No Concretado" && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <a
                              href={selectedCliente.documentoPath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline font-medium"
                            >
                              Ver Documento de Identidad
                            </a>
                          </div>
                        )}
                      {selectedCliente.registroDocumento &&
                        selectedCliente.registroDocumento !==
                          "No Concretado" && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <a
                              href={selectedCliente.registroDocumento}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline font-medium"
                            >
                              Ver Registro (RUT/Cámara)
                            </a>
                          </div>
                        )}
                    </div>
                  </div>
                )}

              {/* Contacto */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider border-b pb-2">
                  Contacto
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-slate-500 block">
                      Teléfonos
                    </span>
                    <div className="space-y-1 mt-1">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span className="text-base font-medium text-slate-900">
                          {selectedCliente.telefono}
                        </span>
                      </div>
                      {selectedCliente.telefono2 &&
                        selectedCliente.telefono2 !== "No Concretado" && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-slate-400" />
                            <span className="text-base font-medium text-slate-900">
                              {selectedCliente.telefono2}
                            </span>
                          </div>
                        )}
                    </div>
                  </div>
                  {selectedCliente.correo && (
                    <div>
                      <span className="text-sm text-slate-500 block">
                        Correo Electrónico
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <Mail className="h-4 w-4 text-slate-400" />
                        <span className="text-base font-medium text-slate-900">
                          {selectedCliente.correo}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Direcciones */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider border-b pb-2">
                  Direcciones Registradas ({selectedCliente.direcciones.length})
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {selectedCliente.direcciones.map((direccion, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50 p-4 rounded-lg border border-slate-100"
                    >
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">
                            {direccion.direccion}
                          </p>
                          <div className="text-sm text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                            {direccion.municipio && (
                              <span>{direccion.municipio}</span>
                            )}
                            {direccion.barrio && (
                              <span>Barrio: {direccion.barrio}</span>
                            )}
                          </div>
                          {(direccion.bloque ||
                            direccion.unidad ||
                            direccion.piso) && (
                            <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 mt-1">
                              {direccion.bloque && (
                                <span>Bloque: {direccion.bloque}</span>
                              )}
                              {direccion.piso && (
                                <span>Piso: {direccion.piso}</span>
                              )}
                              {direccion.unidad && (
                                <span>Unidad: {direccion.unidad}</span>
                              )}
                            </div>
                          )}
                          {direccion.linkMaps &&
                            direccion.linkMaps !== "No Concretado" && (
                              <div className="mt-2">
                                <a
                                  href={
                                    direccion.linkMaps.startsWith("http")
                                      ? direccion.linkMaps
                                      : `https://${direccion.linkMaps}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Ver en Google Maps
                                </a>
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vehículos */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider border-b pb-2">
                  Vehículos Registrados ({selectedCliente.vehiculos.length})
                </h3>
                {selectedCliente.vehiculos.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {selectedCliente.vehiculos.map((vehiculo, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-50 p-4 rounded-lg border border-slate-100"
                      >
                        <div className="flex items-start gap-3">
                          <Car className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="font-medium text-slate-900">
                              Placa: {vehiculo.placa}
                            </p>
                            <div className="text-sm text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                              {vehiculo.marca && (
                                <span>Marca: {vehiculo.marca}</span>
                              )}
                              {vehiculo.modelo && (
                                <span>Modelo: {vehiculo.modelo}</span>
                              )}
                              {vehiculo.color && (
                                <span>Color: {vehiculo.color}</span>
                              )}
                              {vehiculo.tipo && (
                                <span>Tipo: {vehiculo.tipo}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 italic">
                    No hay vehículos registrados.
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-400 text-right">
                  Registrado el{" "}
                  {new Date(selectedCliente.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button
              onClick={() => {
                if (selectedCliente) {
                  router.push(
                    `/dashboard/clientes/nuevo?fixClientId=${selectedCliente.id}`,
                  );
                }
              }}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
            >
              <MapPin className="mr-2 h-4 w-4" />
              Registrar Direcciones
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Eliminación */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Estás seguro?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente
              al cliente y todas sus direcciones asociadas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
