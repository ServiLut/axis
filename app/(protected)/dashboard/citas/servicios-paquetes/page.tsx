"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import { BookOpen, Edit, Plus, Power, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUserRole } from "@/hooks/use-user-role";
import {
  createTerapiaPsicologos,
  getManagementOptions,
  getTerapiasPsicologos,
  toggleTerapiaPsicologosActivo,
  updateTerapiaPsicologos,
} from "./actions";

type TenantOption = {
  id: number;
  nombre: string;
};

type EmpresaOption = {
  id: number;
  nombre: string;
};

type TerapiaRow = {
  id: number;
  tenantId: number;
  empresaId: number | null;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  cantidadSesiones: number;
  precioBase: number;
  activo: boolean | null;
  Empresa_TerapiasPsicologos_empresaIdToEmpresa: EmpresaOption | null;
  Empresa_TerapiasPsicologos_tenantIdToEmpresa: TenantOption | null;
};

type OptionsState = {
  empresas: EmpresaOption[];
  tenants: TenantOption[];
  currentTenantId: number | null;
};

type TerapiaFormState = {
  tenantId: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  cantidadSesiones: string;
  precioBase: string;
  empresaId: string;
  activo: string;
};

const emptyOptions: OptionsState = {
  empresas: [],
  tenants: [],
  currentTenantId: null,
};

const formatCurrency = (value: number | null | undefined) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function TerapiasTratamientosPage() {
  const router = useRouter();
  const { role, tenantId, loading: roleLoading } = useUserRole();
  const canManage = role === "ADMIN" || role === "SU_ADMIN";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const requestId = useRef(0);
  const [options, setOptions] = useState<OptionsState>(emptyOptions);
  const [terapias, setTerapias] = useState<TerapiaRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoriaFilter, setCategoríaFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [debouncedSearchTerm] = useDebounce(searchTerm, 400);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTerapia, setEditingTerapia] = useState<TerapiaRow | null>(null);
  const [formData, setFormData] = useState<TerapiaFormState>({
    tenantId: "",
    nombre: "",
    descripcion: "",
    categoria: "Terapia",
    cantidadSesiones: "1",
    precioBase: "0",
    empresaId: "none",
    activo: "true",
  });
  const [terapiaToDeactivate, setTerapiaToDeactivate] =
    useState<TerapiaRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedTenantForOptions = tenantId?.toString() || "";

  const defaultTenantId = () =>
    options.currentTenantId?.toString() || tenantId?.toString() || "";

  const categorias = useMemo(
    () =>
      Array.from(
        new Set(
          terapias
            .map((terapia) => terapia.categoria?.trim())
            .filter((categoria): categoria is string => Boolean(categoria)),
        ),
      ).sort((a, b) => a.localeCompare(b, "es")),
    [terapias],
  );

  const categoriaSeleccionada =
    categoriaFilter !== "all" && categorias.includes(categoriaFilter)
      ? categoriaFilter
      : "all";

  const terapiasFiltradas = useMemo(
    () =>
      categoriaSeleccionada === "all"
        ? terapias
        : terapias.filter(
            (terapia) =>
              (terapia.categoria?.trim() || "Sin categoría") ===
              categoriaSeleccionada,
          ),
    [categoriaSeleccionada, terapias],
  );

  const invalidateRequests = useCallback(() => { requestId.current++; }, []);

  const loadData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const token = localStorage.getItem("token");
    if (!token) { router.push("/sign-in"); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const [terapiasRes, optionsRes] = await Promise.all([
        getTerapiasPsicologos(token, {
          term: debouncedSearchTerm,
          estado: estadoFilter,
          tenantId: selectedTenantForOptions,
        }),
        getManagementOptions(token, selectedTenantForOptions),
      ]);
      if (currentRequest !== requestId.current) return;
      const readError = ("error" in terapiasRes && terapiasRes.error) || ("error" in optionsRes && optionsRes.error);
      if (readError) { setLoadError(readError); return; }
      if ("terapias" in terapiasRes) setTerapias((terapiasRes.terapias as TerapiaRow[]) || []);
      if ("empresas" in optionsRes) setOptions({
        empresas: (optionsRes.empresas as EmpresaOption[]) || [],
        tenants: (optionsRes.tenants as TenantOption[]) || [],
        currentTenantId: optionsRes.currentTenantId || null,
      });
    } catch {
      if (currentRequest === requestId.current) setLoadError("No se pudo cargar el catálogo. Revise su conexión e intente nuevamente.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [debouncedSearchTerm, estadoFilter, router, selectedTenantForOptions]);

  const refreshOptionsForTenant = useCallback(
    async (targetTenantId?: string) => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      try {
        const result = await getManagementOptions(token, targetTenantId || selectedTenantForOptions);
        if ("error" in result && result.error) { toast.error(result.error); return; }
        if ("empresas" in result) setOptions({
          empresas: (result.empresas as EmpresaOption[]) || [],
          tenants: (result.tenants as TenantOption[]) || [],
          currentTenantId: result.currentTenantId || null,
        });
      } catch {
        toast.error("No se pudieron actualizar las opciones del catálogo. Intente nuevamente.");
      }
    },
    [router, selectedTenantForOptions],
  );

  useEffect(() => {
    if (!roleLoading && !canManage) {
      toast.error(
        "Acceso denegado. Solo administradores pueden gestionar terapias y tratamientos.",
      );
      router.push("/dashboard");
    }
  }, [canManage, roleLoading, router]);

  useEffect(() => {
    if (canManage) {
      void loadData();
    }
    return () => { invalidateRequests(); };
  }, [canManage, loadData, invalidateRequests, loadRevision]);

  const handleOpenModal = (
    terapia?: TerapiaRow,
    defaultCategoría: "Terapia" | "Tratamiento" = "Terapia",
  ) => {
    if (terapia) {
      setEditingTerapia(terapia);
      setFormData({
        tenantId: terapia.tenantId.toString(),
        nombre: terapia.nombre,
        descripcion: terapia.descripcion || "",
        categoria: terapia.categoria || defaultCategoría,
        cantidadSesiones: terapia.cantidadSesiones.toString(),
        precioBase: terapia.precioBase.toString(),
        empresaId: terapia.empresaId?.toString() || "none",
        activo: terapia.activo === false ? "false" : "true",
      });
      refreshOptionsForTenant(terapia.tenantId.toString());
    } else {
      const tenant = defaultTenantId();
      setEditingTerapia(null);
      setFormData({
        tenantId: tenant,
        nombre: "",
        descripcion: "",
        categoria: defaultCategoría,
        cantidadSesiones: "1",
        precioBase: "0",
        empresaId: "none",
        activo: "true",
      });
      refreshOptionsForTenant(tenant);
    }

    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setIsSubmitting(false);
      router.push("/sign-in");
      return;
    }

    const payload = new FormData();
    payload.set("tenantId", formData.tenantId);
    payload.set("nombre", formData.nombre);
    payload.set("descripcion", formData.descripcion);
    payload.set("categoria", formData.categoria);
    payload.set("cantidadSesiones", formData.cantidadSesiones);
    payload.set("precioBase", formData.precioBase);
    payload.set("empresaId", formData.empresaId);
    payload.set("activo", formData.activo);

    try {
      const result = editingTerapia
        ? await updateTerapiaPsicologos(token, editingTerapia.id, payload)
        : await createTerapiaPsicologos(token, payload);
      if ("error" in result) toast.error(result.error);
      else { toast.success(result.message); setIsModalOpen(false); setLoadRevision((revision) => revision + 1); }
    } catch {
      toast.error("No se pudo guardar el servicio. Sus cambios se conservan para intentar nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTerapia = async (terapia: TerapiaRow, active: boolean) => {
    if (isDeleting) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    setIsDeleting(true);
    try {
      const result = await toggleTerapiaPsicologosActivo(token, terapia.id, active);
      if ("error" in result) toast.error(result.error);
      else { toast.success(result.message); setTerapiaToDeactivate(null); setLoadRevision((revision) => revision + 1); }
    } catch {
      toast.error("No se pudo cambiar el estado del servicio. Intente nuevamente.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (roleLoading || !canManage) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-none border-b border-slate-200 bg-white px-4 sm:px-8 py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Servicios y paquetes
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Gestiona las terapias y tratamientos del centro psicológico,
              configurando categorías, sesiones, tarifas y disponibilidad.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tenantId === 4 && process.env.NEXT_PUBLIC_RECEPCION_ENABLED === "true" && <Button variant="outline" onClick={() => router.push("/dashboard/recepcion")}>
              Impresiones y adicionales
            </Button>}
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenModal(undefined, "Terapia")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo servicio
            </Button>
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => handleOpenModal(undefined, "Tratamiento")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo tratamiento
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-none border-b border-slate-200 bg-slate-50 px-4 sm:px-8 py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Buscar servicio" placeholder="Nombre del servicio o categoría"
              className="bg-white pl-10"
            />
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <Select
              value={categoriaSeleccionada}
              onValueChange={setCategoríaFilter}
            >
              <SelectTrigger className="w-full bg-white md:w-56">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categorias.map((categoria) => (
                  <SelectItem key={categoria} value={categoria}>
                    {categoria}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger className="w-full bg-white md:w-48">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>

          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 px-4 sm:px-8 py-6">
        <div className="mx-auto max-w-7xl">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              </div>
            ) : loadError ? (
              <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-slate-700">
                <p>{loadError}</p>
                <Button type="button" variant="outline" onClick={() => { void loadData(); }}>Reintentar</Button>
              </div>
            ) : terapiasFiltradas.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-slate-500">
                <BookOpen className="mb-3 h-10 w-10 text-slate-300" />
                <p className="font-medium">
                  {debouncedSearchTerm || estadoFilter !== "all" || categoriaSeleccionada !== "all" ? "No hay servicios que coincidan con los filtros" : "No hay terapias ni tratamientos registrados"}
                </p>
                <p className="text-sm">
                  {debouncedSearchTerm || estadoFilter !== "all" || categoriaSeleccionada !== "all" ? "Cambie la búsqueda o los filtros para ver otros servicios." : "Crea un registro para que aparezca en el catálogo de citas."}
                </p>
              </div>
            ) : (
              <table className="w-full text-center text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-5 py-3">Nombre</th>
                    <th className="px-5 py-3">Categoría</th>
                    <th className="px-5 py-3 text-center">
                      Cantidad de Sesiones
                    </th>
                    <th className="px-5 py-3">Precio total (COP)</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {terapiasFiltradas.map((terapia) => (
                    <tr key={terapia.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">
                          {terapia.nombre}
                        </div>

                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {terapia.categoria || "Sin categoría"}
                      </td>
                      <td className="px-5 py-4 text-center text-slate-700">
                        {terapia.cantidadSesiones}
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {formatCurrency(terapia.precioBase)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          className={
                            terapia.activo === false
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }
                        >
                          {terapia.activo === false ? "Inactivo" : "Activo"}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenModal(terapia)}
                            title="Editar terapia o tratamiento"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {terapia.activo === false ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-green-600 hover:text-green-700"
                              disabled={isDeleting}
                              onClick={() => toggleTerapia(terapia, true)}
                              title="Reactivar terapia o tratamiento"
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => setTerapiaToDeactivate(terapia)}
                              title="Desactivar terapia o tratamiento"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTerapia
                ? "Editar servicio"
                : "Nuevo servicio o Tratamiento"}
            </DialogTitle>
            <DialogDescription>
              Defina un nombre fácil de identificar, las sesiones incluidas y el precio total del servicio.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">


            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre del servicio *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      nombre: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoría</Label>
                <Input
                  id="categoria"
                  value={formData.categoria}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      categoria: event.target.value,
                    }))
                  }
                  placeholder="Terapia o Tratamiento"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cantidadSesiones">Sesiones incluidas</Label>
                <Input
                  id="cantidadSesiones"
                  type="number"
                  min="1"
                  value={formData.cantidadSesiones}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      cantidadSesiones: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="precioBase">Precio total (COP)</Label>
                <Input
                  id="precioBase"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.precioBase}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      precioBase: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Select
                  value={formData.empresaId}
                  onValueChange={(value) =>
                    setFormData((current) => ({ ...current, empresaId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin empresa</SelectItem>
                    {options.empresas.map((empresa) => (
                      <SelectItem
                        key={empresa.id}
                        value={empresa.id.toString()}
                      >
                        {empresa.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={formData.activo}
                  onValueChange={(value) =>
                    setFormData((current) => ({ ...current, activo: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Activo</SelectItem>
                    <SelectItem value="false">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción (opcional)</Label>
              <Textarea
                id="descripcion"
                value={formData.descripcion}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    descripcion: event.target.value,
                  }))
                }
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar servicio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(terapiaToDeactivate)}
        onOpenChange={() => setTerapiaToDeactivate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar Terapia o Tratamiento</DialogTitle>
            <DialogDescription>
              El registro dejará de aparecer al registrar nuevas citas, pero el
              historial existente se conservará.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTerapiaToDeactivate(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting || !terapiaToDeactivate}
              onClick={() =>
                terapiaToDeactivate && toggleTerapia(terapiaToDeactivate, false)
              }
            >
              {isDeleting ? "Desactivando..." : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
