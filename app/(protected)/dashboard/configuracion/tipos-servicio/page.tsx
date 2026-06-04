"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Tag, Trash2, Edit, Power } from "lucide-react"; 
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTiposServicio, createTipoServicio, updateTipoServicio, deleteTipoServicio, getEmpresasOptions } from "./actions";
import { useUserRole } from "@/hooks/use-user-role";

interface Empresa {
  id: number;
  nombre: string;
}

interface TipoServicio {
  id: number;
  nombre: string;
  activo: boolean;
  Empresa: {
    id: number;
    nombre: string;
  } | null;
  _count: {
    ordenes: number;
  };
}

export default function TiposServicioPage() {
  const [tipos, setTipos] = useState<TipoServicio[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { role, loading: roleLoading } = useUserRole();
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTipo, setEditingTipo] = useState<TipoServicio | null>(null);
  const [formData, setFormData] = useState<{
    nombre: string;
    activo: boolean;
    empresaId: string;
  }>({ 
    nombre: "", 
    activo: true,
    empresaId: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tipoToDelete, setTipoToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (!roleLoading && role !== "ADMIN" && role !== "SU_ADMIN") {
      toast.error("Acceso denegado. Solo administradores pueden configurar tipos de servicio.");
      router.push("/dashboard");
    }
  }, [role, roleLoading, router]);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const [tiposRes, empresasRes] = await Promise.all([
      getTiposServicio(token),
      getEmpresasOptions(token)
    ]);

    if (tiposRes.error) {
      toast.error(tiposRes.error);
      if (tiposRes.error === "No autorizado") router.push("/sign-in");
    } else if (tiposRes.tiposServicio) {
      setTipos(tiposRes.tiposServicio);
    }

    if (empresasRes.empresas) {
      setEmpresas(empresasRes.empresas);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (role === "ADMIN" || role === "SU_ADMIN") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchData();
    }
  }, [role, fetchData]);

  if (roleLoading || (role !== "ADMIN" && role !== "SU_ADMIN")) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleOpenModal = (tipo?: TipoServicio) => {
    if (tipo) {
      setEditingTipo(tipo);
      setFormData({ 
        nombre: tipo.nombre, 
        activo: tipo.activo,
        empresaId: tipo.Empresa?.id.toString() || ""
      });
    } else {
      setEditingTipo(null);
      setFormData({ nombre: "", activo: true, empresaId: "" });
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
    if (formData.activo) data.append("activo", "on");
    if (formData.empresaId) data.append("empresaId", formData.empresaId);

    let result;
    if (editingTipo) {
      result = await updateTipoServicio(token, editingTipo.id, data);
    } else {
      result = await createTipoServicio(token, data);
    }

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setIsModalOpen(false);
      fetchData(); // Refresh list
    }
    setIsSubmitting(false);
  };

  const handleToggleActive = async (tipo: TipoServicio) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const data = new FormData();
    data.append("nombre", tipo.nombre);
    if (!tipo.activo) { 
      data.append("activo", "on");
    }
    
    if (tipo.Empresa?.id) {
      data.append("empresaId", tipo.Empresa.id.toString());
    }

    toast.promise(updateTipoServicio(token, tipo.id, data), {
      loading: 'Actualizando estado...',
      success: (result) => {
        if (result.error) throw new Error(result.error);
        fetchData();
        return `Tipo de servicio ${!tipo.activo ? 'activado' : 'desactivado'} correctamente`;
      },
      error: (err) => `Error: ${err.message}`
    });
  };

  const handleDeleteClick = (id: number) => {
    setTipoToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!tipoToDelete) return;
    setIsDeleting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await deleteTipoServicio(token, tipoToDelete);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setIsDeleteModalOpen(false);
      setTipoToDelete(null);
      fetchData(); // Refresh list
    }
    setIsDeleting(false);
  };

  const filteredTipos = tipos.filter(t => 
    t.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.Empresa?.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => a.id - b.id);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tipos de Servicio</h1>
            <p className="text-sm text-slate-600 mt-1">
              Gestiona los tipos de servicio disponibles
            </p>
          </div>
          <Button 
            onClick={() => handleOpenModal()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Tipo
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar tipo o empresa..."
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
            ) : filteredTipos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
                  <Tag className="h-12 w-12 mb-3 text-slate-300" />
                  <p className="font-medium">No se encontraron tipos de servicio</p>
                  <p className="text-sm">Agrega un nuevo tipo para comenzar</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                            <tr>
                                <th className="px-6 py-4">Nombre</th>
                                <th className="px-6 py-4">Empresa</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredTipos.map((tipo) => (
                                <tr key={tipo.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        {tipo.nombre}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {tipo.Empresa ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                                                    {tipo.Empresa.nombre}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 italic text-xs">Sin asignar</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            tipo.activo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                                        }`}>
                                            {tipo.activo ? "Activo" : "Inactivo"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={`hover:bg-slate-200 ${tipo.activo ? "text-green-600 hover:text-green-700" : "text-slate-400 hover:text-slate-600"}`}
                                                title={tipo.activo ? "Desactivar tipo" : "Activar tipo"}
                                                onClick={() => handleToggleActive(tipo)}
                                            >
                                                <Power className="h-4 w-4" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="hover:bg-slate-200"
                                                onClick={() => handleOpenModal(tipo)}
                                            >
                                                <Edit className="h-4 w-4 text-slate-500" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="hover:bg-slate-200 text-red-500 hover:text-red-700"
                                                onClick={() => handleDeleteClick(tipo.id)}
                                                disabled={tipo._count.ordenes > 0}
                                                title={tipo._count.ordenes > 0 ? "No se puede eliminar porque tiene órdenes asociadas" : "Eliminar"}
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
                <DialogTitle>{editingTipo ? "Editar Tipo de Servicio" : "Nuevo Tipo de Servicio"}</DialogTitle>
                <DialogDescription>
                    {editingTipo ? "Modifica los datos del tipo de servicio." : "Ingresa los datos para crear un nuevo tipo de servicio."}
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
                        <Label htmlFor="empresa" className="text-right">
                            Empresa
                        </Label>
                        <div className="col-span-3">
                            <Select 
                                value={formData.empresaId} 
                                onValueChange={(val) => setFormData({...formData, empresaId: val})}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccione una empresa" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="null">Ninguna</SelectItem>
                                    {empresas.map((emp) => (
                                        <SelectItem key={emp.id} value={emp.id.toString()}>
                                            {emp.nombre}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="activo" className="text-right">
                            Estado
                        </Label>
                        <div className="col-span-3 flex items-center space-x-2">
                            <Checkbox 
                                id="activo" 
                                checked={formData.activo}
                                onCheckedChange={(checked) => setFormData({...formData, activo: checked as boolean})}
                            />
                            <label
                                htmlFor="activo"
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
              Esta acción eliminará el tipo de servicio permanentemente. No podrás deshacer esta acción.
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
