"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  Plus,
  Edit,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserRole } from "@/hooks/use-user-role";
import {
  getEgresos,
  getUsuarios,
  createEgreso,
  updateEgreso,
  deleteEgreso,
} from "./actions";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Egreso {
  id: string;
  userId: number | null;
  titulo: string | null;
  monto: number | null;
  razon: string | null;
  created_at: string;
  Usuario: {
    nombre: string;
    apellido: string;
  } | null;
}

export default function EgresosPage() {
  const { role, loading: roleLoading } = useUserRole();
  const router = useRouter();

  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: number; nombre: string; apellido: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingEgreso, setEditingEgreso] = useState<Egreso | null>(null);
  const [deletingEgresoId, setDeletingEgresoId] = useState<string | null>(null);

  // Form State
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [titulo, setTitulo] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [razon, setRazon] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const fetchEgresos = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const res = await getEgresos(token);
    if (res.success) {
      setEgresos(res.data);
    } else {
      toast.error(res.error || "Error al cargar egresos");
    }
    setLoading(false);
  }, []);

  const fetchUsuarios = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const res = await getUsuarios(token);
    if (res.success) {
      setUsuarios(res.data);
    } else {
      // Handle error silently or log
    }
  }, []);

  useEffect(() => {
    if (!roleLoading && role !== "ADMIN" && role !== "SU_ADMIN" && role !== "ASESOR") {
      toast.error("Acceso denegado.");
      router.push("/dashboard");
    }
  }, [role, roleLoading, router]);

  useEffect(() => {
    const loadData = async () => {
      await fetchEgresos();
      await fetchUsuarios();
    };
    loadData();
  }, [fetchEgresos, fetchUsuarios]);

  const handleOpenCreateModal = () => {
    setEditingEgreso(null);
    setSelectedUser("no-user");
    setTitulo("");
    setMonto("");
    setRazon("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (egreso: Egreso) => {
    setEditingEgreso(egreso);
    setSelectedUser(egreso.userId?.toString() || "no-user");
    setTitulo(egreso.titulo || "");
    setMonto(egreso.monto?.toString() || "");
    setRazon(egreso.razon || "");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!monto || !razon || !titulo) {
      toast.error("Complete los campos requeridos (Título, Monto, Razón)");
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const data = {
      userId: selectedUser && selectedUser !== "no-user" ? parseInt(selectedUser) : undefined,
      monto: parseFloat(monto),
      titulo,
      razon,
    };

    let res;
    if (editingEgreso) {
      res = await updateEgreso(token, editingEgreso.id, data);
    } else {
      res = await createEgreso(token, data);
    }

    if (res.success) {
      toast.success(editingEgreso ? "Egreso actualizado" : "Egreso creado");
      setIsModalOpen(false);
      fetchEgresos();
    } else {
      toast.error(res.error || "Error al guardar");
    }
    setSubmitting(false);
  };

  const handleOpenDeleteModal = (id: string) => {
    setDeletingEgresoId(id);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingEgresoId) return;

    setSubmitting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await deleteEgreso(token, deletingEgresoId);
    if (res.success) {
      toast.success("Egreso eliminado");
      setIsDeleteModalOpen(false);
      fetchEgresos();
    } else {
      toast.error(res.error || "Error al eliminar");
    }
    setSubmitting(false);
  };

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="h-6 w-6 text-indigo-600" />
              Gestión de Egresos
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Registro y control de gastos y salidas de dinero.
            </p>
          </div>
          <Button onClick={handleOpenCreateModal} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4 mr-2" />
            Registrar Egreso
          </Button>
        </div>
      </div>

      <div className="flex-1 p-8 bg-slate-50 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {egresos.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-dashed border-slate-300">
              <Wallet className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-900">No hay egresos registrados</h3>
              <p className="text-slate-500 max-w-sm mx-auto mt-1">
                Registra los gastos operativos o administrativos de la empresa.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Responsable / Usuario</TableHead>
                    <TableHead>Descripción / Razón</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {egresos.map((egreso) => (
                    <TableRow key={egreso.id}>
                      <TableCell className="text-sm text-slate-600">
                        <div className="flex items-center">
                          <Calendar className="h-3 w-3 mr-2 text-slate-400" />
                          {format(new Date(egreso.created_at), "dd/MM/yyyy", { locale: es })}
                        </div>
                      </TableCell>
                       <TableCell className="font-medium text-slate-900">
                        {egreso.titulo || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center text-slate-600">
                          {egreso.Usuario ? (
                             <>
                                <User className="h-3 w-3 mr-2 text-slate-400" />
                                {egreso.Usuario.nombre} {egreso.Usuario.apellido}
                             </>
                          ) : (
                            <span className="text-slate-400 italic">No asignado</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 max-w-xs truncate">
                        {egreso.razon || "-"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        ${(egreso.monto || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(egreso)}
                          >
                            <Edit className="h-4 w-4 text-slate-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDeleteModal(egreso.id)}
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Crear/Editar Egreso */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingEgreso ? "Editar Egreso" : "Registrar Nuevo Egreso"}</DialogTitle>
            <DialogDescription>
              Ingrese los detalles del gasto o salida de dinero.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
                <Label htmlFor="titulo">Título</Label>
                <Input
                    id="titulo"
                    placeholder="Ej. Compra de insumos, Pago servicios..."
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="usuario">Responsable (Opcional)</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar usuario..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-user">-- Ninguno --</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.nombre} {u.apellido}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="monto">Monto</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                <Input
                  id="monto"
                  type="number"
                  placeholder="0"
                  className="pl-7"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="razon">Descripción / Razón</Label>
              <Input
                id="razon"
                placeholder="Detalle del gasto..."
                value={razon}
                onChange={(e) => setRazon(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {submitting ? "Guardando..." : "Guardar Egreso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Eliminación */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Eliminar Egreso</DialogTitle>
            <DialogDescription>
              ¿Está seguro de que desea eliminar este registro? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
