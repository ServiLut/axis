"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle,
  Clock,
  History,
  ShieldAlert,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import {
  getPendingPermissions,
  approvePermission,
  rejectPermission,
  getPermissionHistory,
} from "./actions";

// Types matching the Prisma return
interface PermisoWithUser {
  id: number;
  usuario: {
    nombre: string;
    apellido: string;
    email: string;
    rol: string | null;
  };
  admin?: {
    nombre: string;
    apellido: string;
  } | null;
  tipo: string;
  entidadId: string | null;
  motivo: string | null;
  fechaSolicitud: Date | string;
  fechaAprobacion?: Date | string | null;
  fechaExpiracion?: Date | string | null;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO" | "EXPIRADO";
}

export default function PermisosPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("pendientes");
  const [pendingPermissions, setPendingPermissions] = useState<
    PermisoWithUser[]
  >([]);
  const [historyPermissions, setHistoryPermissions] = useState<
    PermisoWithUser[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Approval Dialog State
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [selectedPermiso, setSelectedPermiso] =
    useState<PermisoWithUser | null>(null);
  const [duration, setDuration] = useState("60"); // Minutes
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      if (activeTab === "pendientes") {
        const res = await getPendingPermissions(token);
        if (!ignore) {
          if (res.error) {
            toast.error(res.error);
          } else {
            setPendingPermissions(res.permisos as unknown as PermisoWithUser[]);
          }
          setLoading(false);
        }
      } else {
        const res = await getPermissionHistory(token);
        if (!ignore) {
          if (res.error) {
            toast.error(res.error);
          } else {
            setHistoryPermissions(res.permisos as unknown as PermisoWithUser[]);
          }
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, [activeTab, router]);

  const handleTabChange = (value: string) => {
    setLoading(true);
    setActiveTab(value);
  };

  // Keep fetchPermissions for manual triggers (approval/rejection)
  const fetchPermissions = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    if (activeTab === "pendientes") {
      const res = await getPendingPermissions(token);
      if (res.error) {
        toast.error(res.error);
      } else {
        setPendingPermissions(res.permisos as unknown as PermisoWithUser[]);
      }
    } else {
      const res = await getPermissionHistory(token);
      if (res.error) {
        toast.error(res.error);
      } else {
        setHistoryPermissions(res.permisos as unknown as PermisoWithUser[]);
      }
    }
    setLoading(false);
  }, [activeTab, router]);

  const handleApproveClick = (permiso: PermisoWithUser) => {
    setSelectedPermiso(permiso);
    setIsApproveDialogOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!selectedPermiso) return;
    setProcessing(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await approvePermission(
      token,
      selectedPermiso.id,
      parseInt(duration),
    );

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      setIsApproveDialogOpen(false);
      // Trigger fetch manually to update list
      setLoading(true);
      fetchPermissions(); 
    }
    setProcessing(false);
  };

  const handleReject = async (id: number) => {
    if (!confirm("¿Estás seguro de rechazar esta solicitud?")) return;

    setProcessing(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await rejectPermission(token, id);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      // Trigger fetch manually to update list
      setLoading(true);
      fetchPermissions(); 
    }
    setProcessing(false);
  };

  const getPermissionLabel = (tipo: string) => {
    switch (tipo) {
      case "EDITAR_VALOR_COTIZADO":
        return "Editar Valor Cotizado";
      case "EDITAR_TIPO_SERVICIO":
        return "Editar Tipo de Servicio";
      case "DESCARGAR_EXCEL":
        return "Descargar Excel";
      default:
        return tipo;
    }
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "PENDIENTE":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-700 border-yellow-200"
          >
            Pendiente
          </Badge>
        );
      case "APROBADO":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            Aprobado
          </Badge>
        );
      case "RECHAZADO":
        return (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-200"
          >
            Rechazado
          </Badge>
        );
      case "EXPIRADO":
        return (
          <Badge
            variant="outline"
            className="bg-slate-50 text-slate-700 border-slate-200"
          >
            Expirado
          </Badge>
        );
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ShieldAlert className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Control de Permisos
            </h1>
          </div>
          <p className="text-sm text-slate-600 ml-11">
            Gestione solicitudes de acceso temporal para acciones sensibles.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-5xl mx-auto">
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="bg-white border border-slate-200 mb-6 w-full sm:w-auto">
              <TabsTrigger
                value="pendientes"
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                Pendientes
                {pendingPermissions.length > 0 && (
                  <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px]">
                    {pendingPermissions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="historial"
                className="flex items-center gap-2"
              >
                <History className="h-4 w-4" />
                Historial
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pendientes" className="space-y-4">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : pendingPermissions.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border border-slate-200 border-dashed">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-slate-900">
                    Todo al día
                  </h3>
                  <p className="text-slate-500">
                    No hay solicitudes pendientes.
                  </p>
                </div>
              ) : (
                pendingPermissions.map((permiso) => (
                  <Card
                    key={permiso.id}
                    className="overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <CardHeader className="bg-white border-b border-slate-100 pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            {getPermissionLabel(permiso.tipo)}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Solicitado por{" "}
                            <span className="font-medium text-slate-900">
                              {permiso.usuario.nombre}{" "}
                              {permiso.usuario.apellido}
                            </span>{" "}
                            •{" "}
                            {new Date(permiso.fechaSolicitud).toLocaleString()}
                          </CardDescription>
                        </div>
                        {getStatusBadge(permiso.estado)}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="bg-slate-50 p-3 rounded-md border border-slate-100">
                          <span className="text-xs font-medium text-slate-500 block mb-1">
                            Motivo
                          </span>
                          <p className="text-sm text-slate-700">
                            {permiso.motivo || "Sin motivo especificado"}
                          </p>
                        </div>
                        {permiso.entidadId && (
                          <div className="bg-slate-50 p-3 rounded-md border border-slate-100">
                            <span className="text-xs font-medium text-slate-500 block mb-1">
                              ID Entidad (Servicio)
                            </span>
                            <p className="text-sm font-mono text-slate-700">
                              #{permiso.entidadId}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => handleReject(permiso.id)}
                          disabled={processing}
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Rechazar
                        </Button>
                        <Button
                          onClick={() => handleApproveClick(permiso)}
                          disabled={processing}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Aprobar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="historial" className="space-y-4">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : historyPermissions.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border border-slate-200 border-dashed">
                  <History className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">
                    No hay historial de permisos.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-700 font-medium border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Solicitante</th>
                        <th className="px-4 py-3">Acción</th>
                        <th className="px-4 py-3">Motivo</th>
                        <th className="px-4 py-3">Aprobado/Rechazado Por</th>
                        <th className="px-4 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyPermissions.map((permiso) => (
                        <tr key={permiso.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-500">
                            {new Date(
                              permiso.fechaSolicitud,
                            ).toLocaleDateString()}
                            <br />
                            <span className="text-xs">
                              {new Date(
                                permiso.fechaSolicitud,
                              ).toLocaleTimeString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {permiso.usuario.nombre} {permiso.usuario.apellido}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-700">
                              {getPermissionLabel(permiso.tipo)}
                            </span>
                            {permiso.entidadId && (
                              <span className="block text-xs text-slate-400">
                                ID: {permiso.entidadId}
                              </span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3 text-slate-600 max-w-[200px] truncate"
                            title={permiso.motivo || ""}
                          >
                            {permiso.motivo || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {permiso.admin
                              ? `${permiso.admin.nombre} ${permiso.admin.apellido}`
                              : "-"}
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(permiso.estado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Aprobar Permiso</DialogTitle>
            <DialogDescription>
              Configure la duración del permiso temporal para &quot;
              {selectedPermiso && getPermissionLabel(selectedPermiso.tipo)}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="duration" className="text-right">
                Duración
              </Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Seleccione duración" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 Minutos</SelectItem>
                  <SelectItem value="30">30 Minutos</SelectItem>
                  <SelectItem value="60">1 Hora</SelectItem>
                  <SelectItem value="120">2 Horas</SelectItem>
                  <SelectItem value="240">4 Horas</SelectItem>
                  <SelectItem value="1440">24 Horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsApproveDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmApprove} disabled={processing}>
              {processing ? "Procesando..." : "Confirmar Aprobación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
