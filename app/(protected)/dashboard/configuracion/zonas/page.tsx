"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, MapPin, Trash2, Edit, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getZonas, createZona, updateZona, deleteZona } from "./actions";
import { useUserRole } from "@/hooks/use-user-role";

interface Zona {
  id: number;
  nombre: string;
  estado: boolean;
}

export default function ZonasPage() {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { role, loading: roleLoading } = useUserRole();
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingZona, setEditingZona] = useState<Zona | null>(null);
  const [formData, setFormData] = useState({ nombre: "", estado: true });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [zonaToDelete, setZonaToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (!roleLoading && role !== "ADMIN" && role !== "SU_ADMIN") {
      toast.error("Acceso denegado. Solo administradores pueden configurar zonas.");
      router.push("/dashboard");
    }
  }, [role, roleLoading, router]);

  const fetchZonas = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const res = await getZonas(token);
    if (res.error) {
      toast.error(res.error);
      if (res.error === "No autorizado") router.push("/sign-in");
    } else if (res.zonas) {
      setZonas(res.zonas);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (role === "ADMIN" || role === "SU_ADMIN") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchZonas();
    }
  }, [role, fetchZonas]);

  if (roleLoading || (role !== "ADMIN" && role !== "SU_ADMIN")) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleOpenModal = (zona?: Zona) => {
    if (zona) {
      setEditingZona(zona);
      setFormData({ nombre: zona.nombre, estado: zona.estado });
    } else {
      setEditingZona(null);
      setFormData({ nombre: "", estado: true });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const token = localStorage.getItem("token");
    if (!token) return;

    const data = new FormData();
    data.append("nombre", formData.nombre);
    if (formData.estado) data.append("estado", "on");

    let result;
    if (editingZona) {
      result = await updateZona(token, editingZona.id, data);
    } else {
      result = await createZona(token, data);
    }

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setIsModalOpen(false);
      fetchZonas();
    }
    setIsSubmitting(false);
  };

  const handleToggleEstado = async (zona: Zona) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const data = new FormData();
    data.append("nombre", zona.nombre); // Keep current name
    if (!zona.estado) { // If currently NOT active, we want to activate it
      data.append("estado", "on");
    }
    
    toast.promise(updateZona(token, zona.id, data), {
      loading: 'Actualizando estado...',
      success: (result) => {
        if (result.error) throw new Error(result.error);
        fetchZonas();
        return `Zona ${!zona.estado ? 'activada' : 'desactivada'} correctamente`;
      },
      error: (err) => `Error: ${err.message}`
    });
  };

  const handleDeleteClick = (id: number) => {
    setZonaToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!zonaToDelete) return;
    setIsDeleting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await deleteZona(token, zonaToDelete);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setIsDeleteModalOpen(false);
      setZonaToDelete(null);
      fetchZonas();
    }
    setIsDeleting(false);
  };

  const filteredZonas = zonas.filter(z => 
    z.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Zonas</h1>
            <p className="text-sm text-slate-600 mt-1">
              Gestiona las zonas de servicio
            </p>
          </div>
          <Button 
            onClick={() => handleOpenModal()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Zona
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar zona..."
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <div className="max-w-5xl mx-auto">
            {loading ? (
                 <div className="flex items-center justify-center h-64">
                 <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
               </div>
            ) : filteredZonas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
                  <MapPin className="h-12 w-12 mb-3 text-slate-300" />
                  <p className="font-medium">No se encontraron zonas</p>
                  <p className="text-sm">Agrega una nueva zona para comenzar</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                            <tr>
                                <th className="px-6 py-4">Nombre</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredZonas.map((zona) => (
                                <tr key={zona.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        {zona.nombre}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            zona.estado ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
                                        }`}>
                                            {zona.estado ? "Activo" : "Inactivo"}
                                        </span>
                                    </td>
                                                                         <td className="px-6 py-4 text-right">
                                                                            <div className="flex justify-end gap-2">
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className={`hover:bg-slate-200 ${zona.estado ? "text-green-600 hover:text-green-700" : "text-slate-400 hover:text-slate-600"}`}
                                                                                    title={zona.estado ? "Desactivar zona" : "Activar zona"}
                                                                                    onClick={() => handleToggleEstado(zona)}
                                                                                >
                                                                                    <Power className="h-4 w-4" />
                                                                                </Button>
                                                                                <Button 
                                                                                    variant="ghost" 
                                                                                    size="icon" 
                                                                                    className="hover:bg-slate-200"
                                                                                    onClick={() => handleOpenModal(zona)}
                                                                                >
                                                                                    <Edit className="h-4 w-4 text-slate-500" />
                                                                                </Button>
                                                                                <Button 
                                                                                    variant="ghost" 
                                                                                    size="icon" 
                                                                                    className="hover:bg-slate-200 text-red-500 hover:text-red-700"
                                                                                    onClick={() => handleDeleteClick(zona.id)}
                                                                                >
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                </Button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                          </div>
                                    
                                          {/* Create/Edit Modal */}
                                          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader>
                                                    <DialogTitle>{editingZona ? "Editar Zona" : "Nueva Zona"}</DialogTitle>
                                                    <DialogDescription>
                                                        {editingZona ? "Modifica los datos de la zona." : "Ingresa los datos para crear una nueva zona."}
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <form onSubmit={handleSubmit}>
                                                    <div className="grid gap-4 py-4">
                                                        <div className="grid grid-cols-4 items-center gap-4">
                                                            <Label htmlFor="nombre" className="text-right">
                                                                Nombre
                                                            </Label>
                                                            <Input
                                                                id="nombre"
                                                                value={formData.nombre}
                                                                onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                                                                className="col-span-3"
                                                                required
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-4 items-center gap-4">
                                                            <Label htmlFor="estado" className="text-right">
                                                                Estado
                                                            </Label>
                                                            <div className="col-span-3 flex items-center space-x-2">
                                                                <Checkbox 
                                                                    id="estado" 
                                                                    checked={formData.estado}
                                                                    onCheckedChange={(checked) => setFormData({...formData, estado: checked as boolean})}
                                                                />
                                                                <label
                                                                    htmlFor="estado"
                                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                                >
                                                                    Activo
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <DialogFooter>
                                                        <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                                                            Cancelar
                                                        </Button>
                                                        <Button type="submit" disabled={isSubmitting}>
                                                            {isSubmitting ? "Guardando..." : "Guardar"}
                                                        </Button>
                                                    </DialogFooter>
                                                </form>
                                            </DialogContent>
                                          </Dialog>
                                    
                                          {/* Delete Confirmation Modal */}
                                          <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                                            <DialogContent className="sm:max-w-md">
                                              <DialogHeader>
                                                <DialogTitle>¿Estás seguro?</DialogTitle>
                                                <DialogDescription>
                                                  Esta acción eliminará la zona de la lista. Si hay órdenes asociadas, estas mantendrán el registro histórico, pero la zona no podrá seleccionarse en nuevos registros.
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