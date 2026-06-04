"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, DollarSign, Percent, Settings2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getUsuariosNomina, saveConfiguracionNomina, type NominaFormData } from "./actions";
import { useUserRole } from "@/hooks/use-user-role";

interface UsuarioNomina {
  id: number;
  nombre: string;
  email: string;
  rol: string | null;
  empresaName: string;
  configuracion: {
    tipo: "PORCENTAJE" | "SALARIO_FIJO" | null;
    valorParticipacion: number | null;
    salarioBase: number | null;
  } | null;
}

export default function NominaPage() {
  const [usuarios, setUsuarios] = useState<UsuarioNomina[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { role, loading: roleLoading } = useUserRole();

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UsuarioNomina | null>(null);
  const [formData, setFormData] = useState<Partial<NominaFormData>>({
    tipo: "PORCENTAJE",
    valorParticipacion: 40,
    salarioBase: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const router = useRouter();

  useEffect(() => {
    if (!roleLoading && role !== "ADMIN" && role !== "SU_ADMIN") {
      toast.error("Acceso denegado. Solo administradores pueden configurar nómina.");
      router.push("/dashboard");
    }
  }, [role, roleLoading, router]);

  useEffect(() => {
    const fetchUsuarios = async () => {
      if (role !== "ADMIN" && role !== "SU_ADMIN") return;

      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const res = await getUsuariosNomina(token);
      if (res.error) {
        toast.error(res.error);
        if (res.error === "No autorizado") router.push("/sign-in");
      } else if (res.data) {
        setUsuarios(res.data);
      }
      setLoading(false);
    };

    fetchUsuarios();
  }, [role, router, refreshTrigger]);

  const handleEdit = (usuario: UsuarioNomina) => {
    setEditingUser(usuario);
    const config = usuario.configuracion;
    setFormData({
      usuarioId: usuario.id,
      tipo: config?.tipo || "PORCENTAJE",
      valorParticipacion: config?.valorParticipacion ?? 40,
      salarioBase: config?.salarioBase ?? 0,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    setIsSubmitting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    // Preparar payload asegurando tipos correctos
    const payload: NominaFormData = {
        usuarioId: editingUser.id,
        tipo: formData.tipo as "PORCENTAJE" | "SALARIO_FIJO",
        valorParticipacion: Number(formData.valorParticipacion),
        salarioBase: Number(formData.salarioBase),
    };

    const result = await saveConfiguracionNomina(token, payload);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Configuración actualizada correctamente");
      setIsModalOpen(false);
      setRefreshTrigger(prev => prev + 1);
    }
    setIsSubmitting(false);
  };

  const filteredUsers = usuarios.filter(u => 
    u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (roleLoading || (role !== "ADMIN" && role !== "SU_ADMIN")) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-indigo-600" />
            Configuración de Pagos
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Gestiona el modelo de pago (Porcentaje vs Salario Fijo) para técnicos y asesores.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar usuario..."
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
               <div className="h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
             </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <Settings2 className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron usuarios</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Modelo de Pago</TableHead>
                    <TableHead>Valor Configurado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                            <span className="text-slate-900">{user.nombre}</span>
                            <span className="text-xs text-slate-500">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-700">{user.empresaName}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-50">
                            {user.rol}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.configuracion?.tipo === "PORCENTAJE" ? (
                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-indigo-200">
                                <Percent className="w-3 h-3 mr-1" /> Porcentaje
                            </Badge>
                        ) : user.configuracion?.tipo === "SALARIO_FIJO" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
                                <DollarSign className="w-3 h-3 mr-1" /> Salario Fijo
                            </Badge>
                        ) : (
                            <span className="text-slate-400 text-sm italic">No configurado</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.configuracion?.tipo === "PORCENTAJE" && (
                            <span className="font-medium text-slate-700">
                                {user.configuracion.valorParticipacion}%
                            </span>
                        )}
                         {user.configuracion?.tipo === "SALARIO_FIJO" && (
                            <span className="font-medium text-slate-700">
                                ${user.configuracion.salarioBase?.toLocaleString()}
                            </span>
                        )}
                         {!user.configuracion?.tipo && (
                             <span className="text-slate-400">-</span>
                         )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(user)}
                          className="hover:bg-slate-100"
                        >
                          <Edit className="h-4 w-4 text-slate-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Configurar Pago: {editingUser?.nombre}</DialogTitle>
                <DialogDescription>
                    Define cómo se calcularán los pagos para este usuario.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
                <div className="space-y-2">
                    <Label>Tipo de Pago</Label>
                    <Select 
                        value={formData.tipo} 
                        onValueChange={(val) => setFormData(prev => ({ ...prev, tipo: val as "PORCENTAJE" | "SALARIO_FIJO" }))}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="PORCENTAJE">Porcentaje de Ganancias</SelectItem>
                            <SelectItem value="SALARIO_FIJO">Salario Fijo</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {formData.tipo === "PORCENTAJE" && (
                    <div className="space-y-2">
                        <Label>Porcentaje de Participación (%)</Label>
                        <div className="relative">
                            <Input 
                                type="number" 
                                min="0" 
                                max="100"
                                step="0.1"
                                value={formData.valorParticipacion}
                                onChange={(e) => setFormData(prev => ({ ...prev, valorParticipacion: e.target.value === "" ? 0 : parseFloat(e.target.value) }))}
                                required
                            />
                            <Percent className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                        </div>
                        <p className="text-xs text-slate-500">
                            Porcentaje que recibe el técnico por cada servicio.
                        </p>
                    </div>
                )}

                {formData.tipo === "SALARIO_FIJO" && (
                    <div className="space-y-2">
                        <Label>Salario Base ($)</Label>
                        <div className="relative">
                            <Input 
                                type="number" 
                                min="0"
                                value={formData.salarioBase}
                                onChange={(e) => setFormData(prev => ({ ...prev, salarioBase: e.target.value === "" ? 0 : parseFloat(e.target.value) }))}
                                required
                            />
                            <DollarSign className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                        </div>
                         <p className="text-xs text-slate-500">
                            Valor fijo mensual o diario según acuerdo.
                        </p>
                    </div>
                )}
                
                <DialogFooter className="mt-4">
                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Guardando..." : "Guardar Configuración"}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
