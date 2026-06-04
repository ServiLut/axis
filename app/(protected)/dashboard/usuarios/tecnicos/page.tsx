"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  Ban,
  CheckCircle,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  getTecnicos,
  getTecnico,
  deleteTecnico,
  toggleTecnicoStatus,
} from "./actions";
import { sendUpdateNotification } from "./update-actions";

interface Tecnico {
  id: number;
  nombre: string | null;
  apellido: string | null;
  email: string;
  rol: "SU_ADMIN" | "ADMIN" | "TECNICO" | "ASESOR" | null;
  telefono: string | null;
  createdAt: Date;
  activo: boolean;
}

export default function TecnicosPage() {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTecnico, setSelectedTecnico] = useState<Tecnico | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [tecnicoToDelete, setTecnicoToDelete] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchTecnicos = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const result = await getTecnicos(token);

      if (result.error) {
        toast.error(result.error);
        if (result.error === "No autorizado") {
          router.push("/sign-in");
        }
      } else if (result.tecnicos) {
        setTecnicos(result.tecnicos);
      }
      setLoading(false);
    };

    fetchTecnicos();
  }, [router]);

  const handleNotifyUpdate = async () => {
    setIsNotifying(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const result = await sendUpdateNotification(token);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
    }
    setIsNotifying(false);
  };

  const handleViewTecnico = async (id: number) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const result = await getTecnico(token, id);
    if (result.error) {
      toast.error(result.error);
      if (result.error === "No autorizado") {
        router.push("/sign-in");
      }
    } else if (result.tecnico) {
      setSelectedTecnico(result.tecnico);
      setIsViewModalOpen(true);
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: boolean) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const result = await toggleTecnicoStatus(token, id, !currentStatus);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setTecnicos(
        tecnicos.map((t) =>
          t.id === id ? { ...t, activo: !currentStatus } : t,
        ),
      );
    }
  };

  const handleDeleteClick = (id: number) => {
    setTecnicoToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!tecnicoToDelete) return;

    setIsDeleting(true);
    const token = localStorage.getItem("token");
    if (!token) {
      setIsDeleting(false);
      router.push("/sign-in");
      return;
    }

    const result = await deleteTecnico(token, tecnicoToDelete);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      // Actualizar la lista localmente
      setTecnicos(tecnicos.filter((t) => t.id !== tecnicoToDelete));
      setIsDeleteModalOpen(false);
      setTecnicoToDelete(null);
    }
    setIsDeleting(false);
  };

  const filteredTecnicos = tecnicos.filter((tecnico) => {
    const search = searchTerm.toLowerCase();
    const fullName =
      `${tecnico.nombre || ""} ${tecnico.apellido || ""}`.toLowerCase();
    const email = tecnico.email?.toLowerCase() || "";
    const telefono = tecnico.telefono?.toLowerCase() || "";

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
            <h1 className="text-2xl font-bold text-slate-900">Técnicos</h1>
            <p className="text-sm text-slate-600 mt-1">
              Gestiona tu equipo de técnicos
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleNotifyUpdate}
              disabled={isNotifying}
              className="border-blue-600 text-blue-600 hover:bg-blue-50"
            >
              <Smartphone className="h-4 w-4 mr-2" />
              {isNotifying ? "Enviando..." : "Notificar Actualización"}
            </Button>
            <Button
              onClick={() => router.push("/dashboard/usuarios/nuevo")} // TODO: Create new tecnico page
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Técnico
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
          ) : filteredTecnicos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <User className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron técnicos</p>
              <p className="text-sm">Agrega un nuevo técnico para comenzar</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                  <tr>
                    <th className="px-6 py-4">Técnico</th>
                    <th className="px-6 py-4">Contacto</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTecnicos.map((tecnico) => (
                    <tr
                      key={tecnico.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-semibold shrink-0">
                            {tecnico.nombre?.[0]?.toUpperCase()}
                            {tecnico.apellido?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">
                              {tecnico.nombre} {tecnico.apellido}
                            </div>
                            <div className="text-slate-500 text-xs mt-0.5">
                              Registrado el{" "}
                              {new Date(tecnico.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[180px]">
                              {tecnico.email}
                            </span>
                          </div>
                          {tecnico.telefono && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>{tecnico.telefono}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {tecnico.rol}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            tecnico.activo
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {tecnico.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-slate-200"
                            >
                              <MoreVertical className="h-4 w-4 text-slate-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={() => handleViewTecnico(tecnico.id)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              <span>Ver detalles</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(
                                  `/dashboard/usuarios/tecnicos/${tecnico.id}/editar`,
                                )
                              }
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Editar</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleToggleStatus(tecnico.id, tecnico.activo)
                              }
                            >
                              {tecnico.activo ? (
                                <>
                                  <Ban className="mr-2 h-4 w-4" />
                                  <span>Desactivar</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  <span>Activar</span>
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDeleteClick(tecnico.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Eliminar</span>
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
            <DialogTitle>Detalles del Técnico</DialogTitle>
            <DialogDescription>
              Información completa del técnico
            </DialogDescription>
          </DialogHeader>

          {selectedTecnico && (
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
                      {selectedTecnico.nombre} {selectedTecnico.apellido}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500 block">Rol</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {selectedTecnico.rol}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-slate-500 block">Estado</span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                        selectedTecnico.activo
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {selectedTecnico.activo ? "Activo" : "Inactivo"}
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
                        {selectedTecnico.email}
                      </span>
                    </div>
                  </div>
                  {selectedTecnico.telefono && (
                    <div>
                      <span className="text-sm text-slate-500 block">
                        Teléfono
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span className="text-base font-medium text-slate-900">
                          {selectedTecnico.telefono}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-400 text-right">
                  Registrado el{" "}
                  {new Date(selectedTecnico.createdAt).toLocaleDateString()}
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
              al técnico.
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
