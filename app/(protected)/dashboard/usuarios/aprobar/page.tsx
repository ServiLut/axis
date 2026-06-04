"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, XCircle, UserCheck, Search, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getUsuariosPendientes, aprobarUsuario, rechazarUsuario, getEmpresasOptions } from "./actions";
import { useUserRole } from "@/hooks/use-user-role";

interface UsuarioPendiente {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  username: string;
  rol: string | null; // Changed to allow null
  createdAt: Date;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  telefono: string | null;
  empresa: {
    id: number;
    nombre: string;
  } | null;
}

interface Empresa {
  id: number;
  nombre: string;
}

type Rol = "SU_ADMIN" | "ADMIN" | "ASESOR" | "TECNICO";

export default function AprobarUsuariosPage() {
  const router = useRouter();
  const { role, loading: roleLoading } = useUserRole();
  const [usuarios, setUsuarios] = useState<UsuarioPendiente[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Approval Modal State
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UsuarioPendiente | null>(null);
  const [approveFormData, setApproveFormData] = useState<{
    rol: Rol;
    empresaId: string;
  }>({
    rol: "TECNICO",
    empresaId: "null",
  });
  const [isApproving, setIsApproving] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    if (!roleLoading && role !== "ADMIN" && role !== "SU_ADMIN") {
      toast.error("Acceso denegado. Solo administradores pueden aprobar usuarios.");
      router.push("/dashboard");
    }
  }, [role, roleLoading, router]);

  useEffect(() => {
    const fetchUsuarios = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const statusFilter = showRejected ? null : false;
      const [usuariosRes, empresasRes] = await Promise.all([
        getUsuariosPendientes(token, statusFilter),
        getEmpresasOptions(token),
      ]);

      if (usuariosRes.error) {
        toast.error(usuariosRes.error);
      } else if (usuariosRes.usuarios) {
        setUsuarios(usuariosRes.usuarios);
      }

      if (empresasRes.empresas) {
        setEmpresas(empresasRes.empresas);
      }

      setLoading(false);
    };

    if (role === "ADMIN" || role === "SU_ADMIN") {
      fetchUsuarios();
    }
  }, [router, showRejected, role]); // fetchUsuarios is now defined inside

  if (roleLoading || (role !== "ADMIN" && role !== "SU_ADMIN")) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleOpenApproveModal = (usuario: UsuarioPendiente) => {
    setSelectedUser(usuario);
    setApproveFormData({
      rol: (usuario.rol as Rol) || "TECNICO",
      empresaId: usuario.empresa?.id.toString() || "null",
    });
    setIsApproveModalOpen(true);
  };

  const confirmApproval = async () => {
    if (!selectedUser) return;
    setIsApproving(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    // Convert string inputs to correct types
    // Cast 'rol' string to expected enum type if necessary (handled by backend or loose typing here)
    const empresaId = approveFormData.empresaId === "null" ? null : parseInt(approveFormData.empresaId);

    // Casting rol to any to bypass strict client-side enum check if not imported, 
    // assuming backend validates. Or I could import Rol from prisma client if available to client components (usually not).
    // Using string is fine as long as it matches the enum values "ADMIN" | "ASESOR" | "TECNICO".
    const res = await aprobarUsuario(token, selectedUser.id, {
      rol: approveFormData.rol, 
      empresaId: empresaId
    });

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      setUsuarios((prev) => prev.filter((u) => u.id !== selectedUser.id));
      setIsApproveModalOpen(false);
      setSelectedUser(null);
    }
    setIsApproving(false);
  };

  const handleRechazar = async (id: number) => {
    if (!confirm("¿Está seguro de rechazar esta solicitud? El usuario será eliminado.")) return;
    
    setProcessingId(id);
    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await rechazarUsuario(token, id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      setUsuarios((prev) => prev.filter((u) => u.id !== id));
    }
    setProcessingId(null);
  };

  const filteredUsuarios = usuarios.filter(u => 
    u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.apellido.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="h-6 w-6 text-blue-600" />
              Aprobar Usuarios <span className="text-slate-400 font-normal text-lg ml-2">{showRejected ? "(Rechazados)" : "(Pendientes)"}</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Revisa y aprueba las solicitudes de registro {showRejected ? "rechazadas anteriormente" : "pendientes"}.
            </p>
          </div>
          <div className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {showRejected ? "Rechazados" : "Pendientes"}: <span className="font-semibold text-slate-900">{usuarios.length}</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, usuario o correo..."
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button 
            variant="outline"
            onClick={() => setShowRejected(!showRejected)}
            className="w-full sm:w-auto ml-auto sm:ml-0 bg-white"
          >
            {showRejected ? "Ver Pendientes" : "Ver Rechazados/Antiguos"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <div className="max-w-5xl mx-auto">
          {loading ? (
             <div className="flex items-center justify-center h-64">
               <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
             </div>
          ) : filteredUsuarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <Package className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No hay solicitudes pendientes</p>
              <p className="text-sm">No se encontraron usuarios que coincidan con la búsqueda.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                  <tr>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Documento</th>
                    <th className="px-6 py-4">Rol / Empresa</th>
                    <th className="px-6 py-4">Fecha Registro</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsuarios.map((usuario) => (
                    <tr key={usuario.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{usuario.nombre} {usuario.apellido}</span>
                          <span className="text-slate-500 text-xs">@{usuario.username}</span>
                          <span className="text-slate-500 text-xs">{usuario.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {usuario.tipoDocumento && usuario.numeroDocumento ? (
                          <div className="flex flex-col">
                            <span className="font-medium">{usuario.numeroDocumento}</span>
                            <span className="text-xs text-slate-500">{usuario.tipoDocumento}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">No registrado</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 font-normal text-slate-600">
                            {usuario.rol || "No asignado"}
                          </Badge>
                          {usuario.empresa ? (
                            <span className="text-xs text-slate-600 font-medium">{usuario.empresa.nombre}</span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Sin empresa</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {new Date(usuario.createdAt).toLocaleDateString()}
                        <div className="text-xs text-slate-400">
                          {new Date(usuario.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="hover:bg-red-50 text-slate-400 hover:text-red-600"
                            onClick={() => handleRechazar(usuario.id)}
                            disabled={processingId === usuario.id || isApproving}
                            title="Rechazar"
                          >
                            <XCircle className="h-5 w-5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="hover:bg-green-50 text-green-600 hover:text-green-700"
                            onClick={() => handleOpenApproveModal(usuario)}
                            disabled={processingId === usuario.id || isApproving}
                            title="Aprobar"
                          >
                            <CheckCircle className="h-5 w-5" />
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

      {/* Approval Modal */}
      <Dialog open={isApproveModalOpen} onOpenChange={setIsApproveModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Aprobar Usuario</DialogTitle>
            <DialogDescription>
              Asigna un rol y una empresa al usuario antes de aprobarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rol">Rol</Label>
              <Select
                value={approveFormData.rol}
                onValueChange={(value) => setApproveFormData({ ...approveFormData, rol: value as Rol })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SU_ADMIN">Super Administrador</SelectItem>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="ASESOR">Asesor</SelectItem>
                  <SelectItem value="TECNICO">Técnico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="empresa">Empresa (Opcional)</Label>
              <Select
                value={approveFormData.empresaId}
                onValueChange={(value) => setApproveFormData({ ...approveFormData, empresaId: value })}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveModalOpen(false)} disabled={isApproving}>
              Cancelar
            </Button>
            <Button onClick={confirmApproval} disabled={isApproving} className="bg-green-600 hover:bg-green-700">
              {isApproving ? "Aprobando..." : "Confirmar Aprobación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
