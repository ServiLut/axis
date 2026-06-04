"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Building2, Trash2, Edit, Package, User, Power } from "lucide-react"; 
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
import { getEmpresas, createEmpresa, updateEmpresa, deleteEmpresa, getEmpresaServices, getEmpresaUsers } from "./actions";
import { useUserRole } from "@/hooks/use-user-role";

interface Empresa {
  id: number;
  nombre: string;
  estado: boolean | null;
  _count: {
    servicios: number;
    usuarios: number;
    ordenesServicio: number;
  };
}

interface Service {
  id: number;
  nombre: string;
  activo: boolean;
}

interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  username: string;
  rol: string | null;
}

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { role, loading: roleLoading } = useUserRole();
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [formData, setFormData] = useState({ nombre: "", estado: true });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [empresaToDelete, setEmpresaToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // View Services states
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [selectedEmpresaForServices, setSelectedEmpresaForServices] = useState<Empresa | null>(null);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  // View Users states
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [selectedEmpresaForUsers, setSelectedEmpresaForUsers] = useState<Empresa | null>(null);
  const [usersList, setUsersList] = useState<Usuario[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const router = useRouter();

  useEffect(() => {
    if (!roleLoading && role !== "ADMIN" && role !== "SU_ADMIN") {
      toast.error("Acceso denegado. Solo administradores pueden configurar empresas.");
      router.push("/dashboard");
    }
  }, [role, roleLoading, router]);

  useEffect(() => {
    const fetchEmpresas = async () => {
      if (role !== "ADMIN" && role !== "SU_ADMIN") return;

      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const res = await getEmpresas(token);
      if (res.error) {
        toast.error(res.error);
        if (res.error === "No autorizado") router.push("/sign-in");
      } else if (res.empresas) {
        setEmpresas(res.empresas);
      }
      setLoading(false);
    };

    fetchEmpresas();
  }, [role, router, refreshTrigger]);

  if (roleLoading || (role !== "ADMIN" && role !== "SU_ADMIN")) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleOpenModal = (empresa?: Empresa) => {
    if (empresa) {
      setEditingEmpresa(empresa);
      setFormData({ nombre: empresa.nombre, estado: empresa.estado ?? false });
    } else {
      setEditingEmpresa(null);
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
    if (editingEmpresa) {
      result = await updateEmpresa(token, editingEmpresa.id, data);
    } else {
      result = await createEmpresa(token, data);
    }

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setIsModalOpen(false);
      setRefreshTrigger(prev => prev + 1);
    }
    setIsSubmitting(false);
  };

  const handleToggleEstado = async (empresa: Empresa) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const data = new FormData();
    data.append("nombre", empresa.nombre);
    if (!empresa.estado) {
      data.append("estado", "on");
    }

    toast.promise(updateEmpresa(token, empresa.id, data), {
      loading: 'Actualizando estado...',
      success: (result) => {
        if (result.error) throw new Error(result.error);
        setRefreshTrigger(prev => prev + 1);
        return `Empresa ${!empresa.estado ? 'activada' : 'desactivada'} correctamente`;
      },
      error: (err) => `Error: ${err.message}`
    });
  };

  const handleDeleteClick = (id: number) => {
    setEmpresaToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!empresaToDelete) return;
    setIsDeleting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await deleteEmpresa(token, empresaToDelete);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setIsDeleteModalOpen(false);
      setEmpresaToDelete(null);
      setRefreshTrigger(prev => prev + 1);
    }
    setIsDeleting(false);
  };

  const handleViewServices = async (empresa: Empresa) => {
    setSelectedEmpresaForServices(empresa);
    setIsServicesModalOpen(true);
    setLoadingServices(true);
    setServicesList([]);

    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await getEmpresaServices(token, empresa.id);
    if (res.error) {
      toast.error(res.error);
    } else if (res.servicios) {
      setServicesList(res.servicios);
    }
    setLoadingServices(false);
  };

  const handleViewUsers = async (empresa: Empresa) => {
    setSelectedEmpresaForUsers(empresa);
    setIsUsersModalOpen(true);
    setLoadingUsers(true);
    setUsersList([]);

    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await getEmpresaUsers(token, empresa.id);
    if (res.error) {
      toast.error(res.error);
    } else if (res.usuarios) {
      setUsersList(res.usuarios);
    }
    setLoadingUsers(false);
  };

  const filteredEmpresas = empresas.filter(e => 
    e.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Empresas</h1>
            <p className="text-sm text-slate-600 mt-1">
              Gestiona las empresas del sistema
            </p>
          </div>
          <Button 
            onClick={() => handleOpenModal()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Empresa
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar empresa..."
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
            ) : filteredEmpresas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
                  <Building2 className="h-12 w-12 mb-3 text-slate-300" />
                  <p className="font-medium">No se encontraron empresas</p>
                  <p className="text-sm">Agrega una nueva empresa para comenzar</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                            <tr>
                                <th className="px-6 py-4">Nombre</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4">Registros Asociados</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredEmpresas.map((empresa) => {
                                const totalAsociados = empresa._count.servicios + empresa._count.usuarios + empresa._count.ordenesServicio;
                                return (
                                <tr key={empresa.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        {empresa.nombre}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            empresa.estado ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
                                        }`}>
                                            {empresa.estado ? "Activo" : "Inactivo"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2 items-center">
                                            {empresa._count.servicios > 0 && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-md h-auto hover:bg-blue-200"
                                                    onClick={() => handleViewServices(empresa)}
                                                >
                                                    <Package className="h-3 w-3 mr-1" />
                                                    {empresa._count.servicios} Servicios
                                                </Button>
                                            )}
                                            {empresa._count.usuarios > 0 && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-md h-auto hover:bg-purple-200"
                                                    onClick={() => handleViewUsers(empresa)}
                                                >
                                                    <User className="h-3 w-3 mr-1" />
                                                    {empresa._count.usuarios} Usuarios
                                                </Button>
                                            )}
                                        </div>
                                        {totalAsociados === 0 && <span className="text-xs text-slate-400">Sin registros</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={`hover:bg-slate-200 ${empresa.estado ? "text-green-600 hover:text-green-700" : "text-slate-400 hover:text-slate-600"}`}
                                                title={empresa.estado ? "Desactivar empresa" : "Activar empresa"}
                                                onClick={() => handleToggleEstado(empresa)}
                                            >
                                                <Power className="h-4 w-4" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="hover:bg-slate-200"
                                                onClick={() => handleOpenModal(empresa)}
                                            >
                                                <Edit className="h-4 w-4 text-slate-500" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="hover:bg-slate-200 text-red-500 hover:text-red-700"
                                                onClick={() => handleDeleteClick(empresa.id)}
                                                disabled={totalAsociados > 0}
                                                title={totalAsociados > 0 ? "No se puede eliminar porque tiene registros asociados" : "Eliminar empresa"}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            )})}
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
                <DialogTitle>{editingEmpresa ? "Editar Empresa" : "Nueva Empresa"}</DialogTitle>
                <DialogDescription>
                    {editingEmpresa ? "Modifica los datos de la empresa." : "Ingresa el nombre de la nueva empresa."}
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
              Esta acción eliminará la empresa permanentemente. No podrás deshacer esta acción.
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

      {/* Services List Modal */}
      <Dialog open={isServicesModalOpen} onOpenChange={setIsServicesModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Servicios de {selectedEmpresaForServices?.nombre}</DialogTitle>
            <DialogDescription>
              Listado de servicios activos asociados a esta empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto py-4">
            {loadingServices ? (
                 <div className="flex items-center justify-center py-8">
                 <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
               </div>
            ) : servicesList.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No hay servicios asociados.</p>
            ) : (
                <ul className="space-y-2">
                    {servicesList.map(service => (
                        <li key={service.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <span className="text-sm font-medium text-slate-700">{service.nombre}</span>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Activo</span>
                        </li>
                    ))}
                </ul>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsServicesModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Users List Modal */}
      <Dialog open={isUsersModalOpen} onOpenChange={setIsUsersModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Usuarios de {selectedEmpresaForUsers?.nombre}</DialogTitle>
            <DialogDescription>
              Listado de usuarios activos asociados a esta empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto py-4">
            {loadingUsers ? (
                 <div className="flex items-center justify-center py-8">
                 <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
               </div>
            ) : usersList.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No hay usuarios asociados.</p>
            ) : (
                <ul className="space-y-2">
                    {usersList.map(user => (
                        <li key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div>
                                <div className="text-sm font-medium text-slate-900">{user.nombre} {user.apellido}</div>
                                <div className="text-xs text-slate-500">@{user.username}</div>
                            </div>
                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-md font-medium border border-slate-200">
                                {user.rol}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsUsersModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
