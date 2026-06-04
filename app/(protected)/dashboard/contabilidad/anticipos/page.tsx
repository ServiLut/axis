"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  Plus,
  Edit,
  Trash2,
  DollarSign,
  User,
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
  getAnticipos,
  getTecnicos,
  createAnticipo,
  updateAnticipo,
  deleteAnticipo,
} from "./actions";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Anticipo {
  id: string;
  usuarioId: number | null;
  monto: number | null;
  razon: string | null;
  created_at: string;
  Usuario: {
    nombre: string;
    apellido: string;
  } | null;
}

export default function AnticiposPage() {
  const { role, loading: roleLoading } = useUserRole();
  const router = useRouter();

  const [anticipos, setAnticipos] = useState<Anticipo[]>([]);
  const [tecnicos, setTecnicos] = useState<{ id: number; nombre: string; apellido: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingAnticipo, setEditingAnticipo] = useState<Anticipo | null>(null);
  const [deletingAnticipoId, setDeletingAnticipoId] = useState<string | null>(null);

  // Form State
  const [selectedTecnico, setSelectedTecnico] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [razon, setRazon] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const fetchAnticipos = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const res = await getAnticipos(token);
    if (res.success) {
      setAnticipos(res.data);
    } else {
      toast.error(res.error || "Error al cargar anticipos");
    }
    setLoading(false);
  }, []);

  const fetchTecnicos = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const res = await getTecnicos(token);
    if (res.success) {
      setTecnicos(res.data);
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
      await fetchAnticipos();
      await fetchTecnicos();
    };
    loadData();
  }, [fetchAnticipos, fetchTecnicos]);

  const handleOpenCreateModal = () => {
    setEditingAnticipo(null);
    setSelectedTecnico("");
    setMonto("");
    setRazon("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (anticipo: Anticipo) => {
    setEditingAnticipo(anticipo);
    setSelectedTecnico(anticipo.usuarioId?.toString() || "");
    setMonto(anticipo.monto?.toString() || "");
    setRazon(anticipo.razon || "");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedTecnico || !monto || !razon) {
      toast.error("Complete todos los campos");
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const data = {
      usuarioId: parseInt(selectedTecnico),
      monto: parseFloat(monto),
      razon,
    };

    let res;
    if (editingAnticipo) {
      res = await updateAnticipo(token, editingAnticipo.id, data);
    } else {
      res = await createAnticipo(token, data);
    }

    if (res.success) {
      toast.success(editingAnticipo ? "Anticipo actualizado" : "Anticipo creado");
      setIsModalOpen(false);
      fetchAnticipos();
    } else {
      toast.error(res.error || "Error al guardar");
    }
    setSubmitting(false);
  };

  const handleOpenDeleteModal = (id: string) => {
    setDeletingAnticipoId(id);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingAnticipoId) return;

    setSubmitting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await deleteAnticipo(token, deletingAnticipoId);
    if (res.success) {
      toast.success("Anticipo eliminado");
      setIsDeleteModalOpen(false);
      fetchAnticipos();
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
              <DollarSign className="h-6 w-6 text-indigo-600" />
              Anticipos
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Gestión de adelantos y préstamos a técnicos.
            </p>
          </div>
          <Button onClick={handleOpenCreateModal} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4 mr-2" />
            Registrar Anticipo
          </Button>
        </div>
      </div>

      <div className="flex-1 p-8 bg-slate-50 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {anticipos.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-dashed border-slate-300">
              <DollarSign className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-900">No hay anticipos registrados</h3>
              <p className="text-slate-500 max-w-sm mx-auto mt-1">
                Registra los adelantos de dinero realizados al equipo de trabajo.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Razón / Concepto</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anticipos.map((anticipo) => (
                    <TableRow key={anticipo.id}>
                      <TableCell className="text-sm text-slate-600">
                        <div className="flex items-center">
                          <Calendar className="h-3 w-3 mr-2 text-slate-400" />
                          {format(new Date(anticipo.created_at), "dd/MM/yyyy", { locale: es })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center font-medium text-slate-900">
                          <User className="h-3 w-3 mr-2 text-slate-400" />
                          {anticipo.Usuario ? (
                            <>{anticipo.Usuario.nombre} {anticipo.Usuario.apellido}</>
                          ) : (
                            <span className="text-slate-400">Usuario eliminado</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 max-w-xs truncate">
                        {anticipo.razon || "-"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        ${(anticipo.monto || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(anticipo)}
                          >
                            <Edit className="h-4 w-4 text-slate-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDeleteModal(anticipo.id)}
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

      {/* Modal Crear/Editar Anticipo */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingAnticipo ? "Editar Anticipo" : "Registrar Nuevo Anticipo"}</DialogTitle>
            <DialogDescription>
              Ingrese los detalles del anticipo entregado al técnico.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tecnico">Técnico</Label>
              <Select value={selectedTecnico} onValueChange={setSelectedTecnico}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar técnico..." />
                </SelectTrigger>
                <SelectContent>
                  {tecnicos.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.nombre} {t.apellido}
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
              <Label htmlFor="razon">Razón / Concepto</Label>
              <Input
                id="razon"
                placeholder="Ej. Adelanto de nómina, Préstamo..."
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
              {submitting ? "Guardando..." : "Guardar Anticipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Eliminación */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Eliminar Anticipo</DialogTitle>
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
