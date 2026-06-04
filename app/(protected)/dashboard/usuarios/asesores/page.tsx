"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportDownloadButton } from "@/components/dashboard/report-download-button";
import {
  getAsesores,
  getAsesor,
  deleteAsesor,
  getServiciosFinalizadosPorAsesor,
} from "./actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  User,
  Phone,
  Mail,
  Eye,
  Trash2,
  Edit,
  MoreVertical,
  ClipboardList,
  Filter,
  X,
} from "lucide-react";

interface Asesor {
  id: number;
  nombre: string | null;
  apellido: string | null;
  email: string;
  rol: "SU_ADMIN" | "ADMIN" | "ASESOR" | "TECNICO" | null;
  telefono: string | null;
  createdAt: Date;
}

interface FinishedService {
  id: number;
  numeroOrden: string | null;
  fechaVisita: Date | null;
  direccionTexto: string;
  valorPagado: string;
  cliente: {
    nombre: string | null;
    apellido: string | null;
  } | null;
}

export default function AsesoresPage() {
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAsesor, setSelectedAsesor] = useState<Asesor | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [asesorToDelete, setAsesorToDelete] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for finished services modal
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [finishedServices, setFinishedServices] = useState<FinishedService[]>(
    [],
  );
  const [loadingServices, setLoadingServices] = useState(false);
  const [selectedAsesorName, setSelectedAsesorName] = useState("");
  const [modalDateRange, setModalDateRange] = useState({
    start: "",
    end: "",
  });

  const router = useRouter();

  const kpis = useMemo(() => {
    if (finishedServices.length === 0) return null;

    const totalServices = finishedServices.length;

    const totalRevenue = finishedServices.reduce(
      (acc, curr) => acc + (Number(curr.valorPagado) || 0),
      0,
    );

    const uniqueDays = new Set(
      finishedServices
        .map((s) =>
          s.fechaVisita ? new Date(s.fechaVisita).toDateString() : null,
        )
        .filter(Boolean),
    ).size;

    const averageServicesPerDay =
      uniqueDays > 0 ? totalServices / uniqueDays : 0;

    const averageRevenuePerService =
      totalServices > 0 ? totalRevenue / totalServices : 0;

    return {
      totalServices,
      totalRevenue,
      averageServicesPerDay,
      averageRevenuePerService,
    };
  }, [finishedServices]);

  const fetchAsesores = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const result = await getAsesores(token);

    if (result.error) {
      toast.error(result.error);
      if (result.error === "No autorizado") {
        router.push("/sign-in");
      }
    } else if (result.asesores) {
      setAsesores(result.asesores as unknown as Asesor[]);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAsesores();
  }, [fetchAsesores]);

  const handleViewAsesor = async (id: number) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const result = await getAsesor(token, id);
    if (result.error) {
      toast.error(result.error);
      if (result.error === "No autorizado") {
        router.push("/sign-in");
      }
    } else if (result.asesor) {
      setSelectedAsesor(result.asesor as unknown as Asesor);
      setIsViewModalOpen(true);
    }
  };

  const handleDeleteClick = (id: number) => {
    setAsesorToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!asesorToDelete) return;

    setIsDeleting(true);
    const token = localStorage.getItem("token");
    if (!token) {
      setIsDeleting(false);
      router.push("/sign-in");
      return;
    }

    const result = await deleteAsesor(token, asesorToDelete);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setAsesores(asesores.filter((a) => a.id !== asesorToDelete));
      setIsDeleteModalOpen(false);
      setAsesorToDelete(null);
    }
    setIsDeleting(false);
  };

  const handleViewFinishedServices = async (asesor: Asesor) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    setIsServicesModalOpen(true);
    setLoadingServices(true);
    setSelectedAsesor(asesor);
    setSelectedAsesorName(`${asesor.nombre} ${asesor.apellido}`);
    setFinishedServices([]);
    setModalDateRange({ start: "", end: "" });

    const result = await getServiciosFinalizadosPorAsesor(token, asesor.id);

    if (result.error) {
      toast.error(result.error);
    } else if (result.servicios) {
      setFinishedServices(result.servicios as unknown as FinishedService[]);
    }
    setLoadingServices(false);
  };

  const handleFilterServices = async () => {
    if (!selectedAsesor) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    setLoadingServices(true);

    const filters = {
      fechaInicio: modalDateRange.start || undefined,
      fechaFin: modalDateRange.end || undefined,
    };

    const result = await getServiciosFinalizadosPorAsesor(
      token,
      selectedAsesor.id,
      filters,
    );

    if (result.error) {
      toast.error(result.error);
    } else if (result.servicios) {
      setFinishedServices(result.servicios as unknown as FinishedService[]);
    }
    setLoadingServices(false);
  };

  const handleClearFilters = async () => {
    setModalDateRange({ start: "", end: "" });
    if (selectedAsesor) {
      // Reload without filters
      const token = localStorage.getItem("token");
      if (!token) return;

      setLoadingServices(true);
      const result = await getServiciosFinalizadosPorAsesor(
        token,
        selectedAsesor.id,
      );

      if (result.error) {
        toast.error(result.error);
      } else if (result.servicios) {
        setFinishedServices(result.servicios as unknown as FinishedService[]);
      }
      setLoadingServices(false);
    }
  };

  const filteredAsesores = asesores.filter((asesor) => {
    const search = searchTerm.toLowerCase();
    const fullName =
      `${asesor.nombre || ""} ${asesor.apellido || ""}`.toLowerCase();
    const email = asesor.email?.toLowerCase() || "";
    const telefono = asesor.telefono?.toLowerCase() || "";

    return (
      fullName.includes(search) ||
      email.includes(search) ||
      telefono.includes(search)
    );
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Asesores</h1>
            <p className="text-sm text-slate-600 mt-1">
              Gestiona tu equipo de asesores comerciales
            </p>
          </div>
          <div className="flex gap-2">
            <ReportDownloadButton
              label="Descargar Reporte General"
              filename="reporte_general_asesores"
            />
            <Button
              onClick={() => router.push("/dashboard/usuarios/nuevo")}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Asesor
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, email o teléfono..."
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredAsesores.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <User className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron asesores</p>
              <p className="text-sm">Agrega un nuevo asesor para comenzar</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                  <tr>
                    <th className="px-6 py-4">Asesor</th>
                    <th className="px-6 py-4">Contacto</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAsesores.map((asesor) => (
                    <tr
                      key={asesor.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold shrink-0">
                            {asesor.nombre?.[0]?.toUpperCase()}
                            {asesor.apellido?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">
                              {asesor.nombre} {asesor.apellido}
                            </div>
                            <div className="text-slate-500 text-xs mt-0.5">
                              Registrado el{" "}
                              {new Date(asesor.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[180px]">
                              {asesor.email}
                            </span>
                          </div>
                          {asesor.telefono && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>{asesor.telefono}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {asesor.rol}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4 text-slate-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleViewAsesor(asesor.id)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(
                                  `/dashboard/usuarios/asesores/${asesor.id}/editar`,
                                )
                              }
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleViewFinishedServices(asesor)}
                            >
                              <ClipboardList className="h-4 w-4 mr-2" />
                              Servicios Finalizados
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteClick(asesor.id)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Detalle */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Asesor</DialogTitle>
            <DialogDescription>
              Información completa del asesor
            </DialogDescription>
          </DialogHeader>

          {selectedAsesor && (
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
                      {selectedAsesor.nombre} {selectedAsesor.apellido}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500 block">Rol</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {selectedAsesor.rol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contacto */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider border-b pb-2">
                  Contacto
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-slate-500 block">Email</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <span className="text-base font-medium text-slate-900">
                        {selectedAsesor.email}
                      </span>
                    </div>
                  </div>
                  {selectedAsesor.telefono && (
                    <div>
                      <span className="text-sm text-slate-500 block">
                        Teléfono
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span className="text-base font-medium text-slate-900">
                          {selectedAsesor.telefono}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-400 text-right">
                  Registrado el{" "}
                  {new Date(selectedAsesor.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Eliminación */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Estás seguro?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente
              al asesor.
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

      {/* Modal de Servicios Finalizados */}
      <Dialog open={isServicesModalOpen} onOpenChange={setIsServicesModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between pr-6">
            <div className="space-y-1">
              <DialogTitle>
                Servicios Finalizados de{" "}
                <span className="text-blue-600">{selectedAsesorName}</span>
              </DialogTitle>
              <DialogDescription>
                Lista de todos los servicios marcados como
                &quot;Finalizado&quot; creados por este asesor.
              </DialogDescription>
            </div>
            {selectedAsesor && (
              <ReportDownloadButton
                asesorId={selectedAsesor.id}
                label="Descargar Reporte"
                filename={`reporte_${selectedAsesor.nombre}_${selectedAsesor.apellido}`}
                size="sm"
              />
            )}
          </DialogHeader>

          <div className="px-6 py-4 border-b bg-slate-50/50 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="w-full sm:w-auto">
                <span className="text-sm font-medium text-slate-700 block mb-1.5">
                  Fecha Inicio
                </span>
                <Input
                  type="date"
                  value={modalDateRange.start}
                  onChange={(e) =>
                    setModalDateRange((prev) => ({
                      ...prev,
                      start: e.target.value,
                    }))
                  }
                  className="w-full sm:w-[180px] bg-white"
                />
              </div>
              <div className="w-full sm:w-auto">
                <span className="text-sm font-medium text-slate-700 block mb-1.5">
                  Fecha Fin
                </span>
                <Input
                  type="date"
                  value={modalDateRange.end}
                  onChange={(e) =>
                    setModalDateRange((prev) => ({
                      ...prev,
                      end: e.target.value,
                    }))
                  }
                  className="w-full sm:w-[180px] bg-white"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                <Button
                  onClick={handleFilterServices}
                  className="bg-blue-600 hover:bg-blue-700 flex-1 sm:flex-none"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filtrar
                </Button>
                {(modalDateRange.start || modalDateRange.end) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearFilters}
                    className="text-slate-500 hover:text-slate-700"
                    title="Limpiar filtros"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto -mx-6 px-6 pt-6">
            {loadingServices ? (
              <div className="flex items-center justify-center h-full">
                <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : finishedServices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-50 rounded-lg py-10">
                <ClipboardList className="h-12 w-12 mb-3 text-slate-400" />
                <p className="font-medium">
                  No se encontraron servicios finalizados
                </p>
                <p className="text-sm">
                  Este asesor no tiene servicios completados.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {kpis && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Total Servicios
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {kpis.totalServices}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Total Recaudado
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {new Intl.NumberFormat("es-CO", {
                            style: "currency",
                            currency: "COP",
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          }).format(kpis.totalRevenue)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Promedio Servicios/Día
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {kpis.averageServicesPerDay.toFixed(1)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Promedio Valor/Servicio
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {new Intl.NumberFormat("es-CO", {
                            style: "currency",
                            currency: "COP",
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          }).format(kpis.averageRevenuePerService)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-700 font-medium">
                      <tr>
                        <th className="px-4 py-3">N° Orden</th>
                        <th className="px-4 py-3">Cliente</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3 text-right">Valor Pagado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {finishedServices.map((service) => (
                        <tr key={service.id}>
                          <td className="px-4 py-3 font-mono text-xs">
                            {service.numeroOrden || "N/A"}
                          </td>
                          <td className="px-4 py-3">
                            {service.cliente?.nombre}{" "}
                            {service.cliente?.apellido || ""}
                          </td>
                          <td className="px-4 py-3">
                            {service.fechaVisita
                              ? new Date(
                                  service.fechaVisita,
                                ).toLocaleDateString()
                              : "N/A"}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {new Intl.NumberFormat("es-CO", {
                              style: "currency",
                              currency: "COP",
                              minimumFractionDigits: 0,
                            }).format(Number(service.valorPagado) || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setIsServicesModalOpen(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
