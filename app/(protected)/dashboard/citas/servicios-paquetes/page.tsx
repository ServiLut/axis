"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import {
  Edit,
  Eye,
  Package,
  Plus,
  Power,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useUserRole } from "@/hooks/use-user-role";
import { EstadoPaquete } from "@/prisma/generated/prisma/enums";
import { searchClientes } from "../actions";
import {
  cancelPaqueteAdquirido,
  createPaqueteAdquirido,
  createTerapiaPsicologos,
  getManagementOptions,
  getPaquetesAdquiridos,
  getTerapiasPsicologos,
  toggleTerapiaPsicologosActivo,
  updatePaqueteAdquirido,
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

type TerapiaOption = {
  id: number;
  nombre: string;
  categoria: string | null;
  cantidadSesiones: number;
  precioBase: number;
  activo?: boolean | null;
};

type PsicologoOption = {
  id: number;
  nombre: string;
  apellido: string;
  username?: string;
};

type ClienteOption = {
  id: number;
  nombre: string | null;
  apellido: string | null;
  tipoDocumento?: string | null;
  numeroDocumento: string | null;
  telefono: string | null;
};

type TerapiaRow = TerapiaOption & {
  tenantId: number;
  empresaId: number | null;
  descripcion: string | null;
  created_at: string;
  Empresa_TerapiasPsicologos_empresaIdToEmpresa: EmpresaOption | null;
  Empresa_TerapiasPsicologos_tenantIdToEmpresa: TenantOption | null;
  _count: { PaqueteAdquirido: number };
};

type PaqueteRow = {
  id: number;
  tenantId: number;
  clienteId: number | null;
  usuarioId: number | null;
  catalogoId: number;
  sesionesTotales: number;
  sesionesConsumidas: number | null;
  saldoRestante: number;
  fechaCompra: string | null;
  fechaVencimiento: string | null;
  precioPagado: number;
  estado: EstadoPaquete | null;
  TerapiasPsicologos: TerapiaOption;
  Cliente: ClienteOption | null;
  Usuario: PsicologoOption | null;
  Tenant: TenantOption | null;
  _count: { CitasPsicologos: number };
};

type OptionsState = {
  empresas: EmpresaOption[];
  terapias: TerapiaOption[];
  psicologos: PsicologoOption[];
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

type PaqueteFormState = {
  tenantId: string;
  catalogoId: string;
  ownerType: "CLIENTE" | "PSICOLOGO";
  clienteId: string;
  usuarioId: string;
  sesionesTotales: string;
  sesionesConsumidas: string;
  precioPagado: string;
  fechaVencimiento: string;
  estado: EstadoPaquete;
};

const emptyOptions: OptionsState = {
  empresas: [],
  terapias: [],
  psicologos: [],
  tenants: [],
  currentTenantId: null,
};

const formatCurrency = (value: number | null | undefined) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (value: string | null) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const toDateInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const ownerName = (paquete: PaqueteRow) => {
  if (paquete.Cliente) {
    return `${paquete.Cliente.nombre || ""} ${paquete.Cliente.apellido || ""}`.trim();
  }

  if (paquete.Usuario) {
    return `${paquete.Usuario.nombre} ${paquete.Usuario.apellido}`.trim();
  }

  return "Sin titular";
};

const ownerDocument = (paquete: PaqueteRow) => {
  if (paquete.Cliente?.numeroDocumento) {
    return `${paquete.Cliente.tipoDocumento || ""} ${paquete.Cliente.numeroDocumento}`.trim();
  }

  if (paquete.Usuario?.username) return paquete.Usuario.username;
  return "Sin documento";
};

const estadoBadgeClass = (estado: EstadoPaquete | null) => {
  if (estado === EstadoPaquete.ACTIVO) return "bg-green-100 text-green-700";
  if (estado === EstadoPaquete.CANCELADO) return "bg-red-100 text-red-700";
  if (estado === EstadoPaquete.FINALIZADO) return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
};

export default function ServiciosPaquetesPage() {
  const router = useRouter();
  const { role, tenantId, loading: roleLoading } = useUserRole();
  const isSuperAdmin = role === "SU_ADMIN";
  const canManage = role === "ADMIN" || role === "SU_ADMIN";

  const [activeTab, setActiveTab] = useState("terapias");
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<OptionsState>(emptyOptions);
  const [terapias, setTerapias] = useState<TerapiaRow[]>([]);
  const [paquetes, setPaquetes] = useState<PaqueteRow[]>([]);
  const [tenantFilter, setTenantFilter] = useState("all");
  const [terapiaSearch, setTerapiaSearch] = useState("");
  const [paqueteSearch, setPaqueteSearch] = useState("");
  const [terapiaEstado, setTerapiaEstado] = useState("all");
  const [paqueteEstado, setPaqueteEstado] = useState("all");
  const [debouncedTerapiaSearch] = useDebounce(terapiaSearch, 400);
  const [debouncedPaqueteSearch] = useDebounce(paqueteSearch, 400);

  const [isTerapiaModalOpen, setIsTerapiaModalOpen] = useState(false);
  const [editingTerapia, setEditingTerapia] = useState<TerapiaRow | null>(null);
  const [terapiaForm, setTerapiaForm] = useState<TerapiaFormState>({
    tenantId: "",
    nombre: "",
    descripcion: "",
    categoria: "",
    cantidadSesiones: "1",
    precioBase: "0",
    empresaId: "none",
    activo: "true",
  });

  const [isPaqueteModalOpen, setIsPaqueteModalOpen] = useState(false);
  const [editingPaquete, setEditingPaquete] = useState<PaqueteRow | null>(null);
  const [viewingPaquete, setViewingPaquete] = useState<PaqueteRow | null>(null);
  const [paqueteForm, setPaqueteForm] = useState<PaqueteFormState>({
    tenantId: "",
    catalogoId: "",
    ownerType: "CLIENTE",
    clienteId: "",
    usuarioId: "",
    sesionesTotales: "1",
    sesionesConsumidas: "0",
    precioPagado: "0",
    fechaVencimiento: "",
    estado: EstadoPaquete.ACTIVO,
  });

  const [clientOptions, setClientOptions] = useState<ClienteOption[]>([]);
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [debouncedClientSearchTerm] = useDebounce(clientSearchTerm, 450);
  const [isSearchingClients, setIsSearchingClients] = useState(false);

  const [terapiaToDeactivate, setTerapiaToDeactivate] =
    useState<TerapiaRow | null>(null);
  const [paqueteToCancel, setPaqueteToCancel] = useState<PaqueteRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedTenantForOptions = useMemo(() => {
    if (tenantFilter !== "all") return tenantFilter;
    return tenantId?.toString() || "";
  }, [tenantFilter, tenantId]);

  const packageTerapiaOptions = useMemo(() => {
    if (!editingPaquete) return options.terapias;
    const exists = options.terapias.some(
      (terapia) => terapia.id === editingPaquete.TerapiasPsicologos.id,
    );
    return exists
      ? options.terapias
      : [editingPaquete.TerapiasPsicologos, ...options.terapias];
  }, [editingPaquete, options.terapias]);

  const paqueteSaldoPreview = useMemo(() => {
    const total = Number(paqueteForm.sesionesTotales);
    const consumidas = Number(paqueteForm.sesionesConsumidas);
    if (!Number.isFinite(total) || !Number.isFinite(consumidas)) return 0;
    return Math.max(0, total - consumidas);
  }, [paqueteForm.sesionesConsumidas, paqueteForm.sesionesTotales]);

  const refreshOptionsForTenant = useCallback(
    async (targetTenantId?: string) => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const result = await getManagementOptions(
        token,
        targetTenantId || selectedTenantForOptions,
      );

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      if ("empresas" in result) {
        setOptions({
          empresas: (result.empresas as EmpresaOption[]) || [],
          terapias: (result.terapias as TerapiaOption[]) || [],
          psicologos: (result.psicologos as PsicologoOption[]) || [],
          tenants: (result.tenants as TenantOption[]) || [],
          currentTenantId: result.currentTenantId || null,
        });
      }
    },
    [router, selectedTenantForOptions],
  );

  const loadData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    setLoading(true);
    const [terapiasRes, paquetesRes, optionsRes] = await Promise.all([
      getTerapiasPsicologos(token, {
        term: debouncedTerapiaSearch,
        estado: terapiaEstado,
        tenantId: tenantFilter,
      }),
      getPaquetesAdquiridos(token, {
        term: debouncedPaqueteSearch,
        estado: paqueteEstado,
        tenantId: tenantFilter,
      }),
      getManagementOptions(token, selectedTenantForOptions),
    ]);

    if ("error" in terapiasRes && terapiasRes.error) {
      toast.error(terapiasRes.error);
    } else if ("terapias" in terapiasRes) {
      setTerapias((terapiasRes.terapias as TerapiaRow[]) || []);
    }

    if ("error" in paquetesRes && paquetesRes.error) {
      toast.error(paquetesRes.error);
    } else if ("paquetes" in paquetesRes) {
      setPaquetes((paquetesRes.paquetes as PaqueteRow[]) || []);
    }

    if ("error" in optionsRes && optionsRes.error) {
      toast.error(optionsRes.error);
    } else if ("empresas" in optionsRes) {
      setOptions({
        empresas: (optionsRes.empresas as EmpresaOption[]) || [],
        terapias: (optionsRes.terapias as TerapiaOption[]) || [],
        psicologos: (optionsRes.psicologos as PsicologoOption[]) || [],
        tenants: (optionsRes.tenants as TenantOption[]) || [],
        currentTenantId: optionsRes.currentTenantId || null,
      });
    }

    setLoading(false);
  }, [
    debouncedPaqueteSearch,
    debouncedTerapiaSearch,
    paqueteEstado,
    router,
    selectedTenantForOptions,
    tenantFilter,
    terapiaEstado,
  ]);

  useEffect(() => {
    if (!roleLoading && !canManage) {
      toast.error("Acceso denegado. Solo administradores pueden gestionar servicios y paquetes.");
      router.push("/dashboard");
    }
  }, [canManage, roleLoading, router]);

  useEffect(() => {
    if (canManage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [canManage, loadData]);

  useEffect(() => {
    const search = async () => {
      if (paqueteForm.ownerType !== "CLIENTE") return;
      if (debouncedClientSearchTerm.length < 6) return;

      const token = localStorage.getItem("token");
      if (!token) return;

      setIsSearchingClients(true);
      const result = await searchClientes(token, debouncedClientSearchTerm);

      if ("error" in result && result.error) {
        toast.error(result.error);
        setClientOptions([]);
      } else if ("clientes" in result && result.clientes) {
        setClientOptions(result.clientes as ClienteOption[]);
      }

      setIsSearchingClients(false);
    };

    search();
  }, [debouncedClientSearchTerm, paqueteForm.ownerType]);

  const defaultTenantId = () =>
    options.currentTenantId?.toString() || tenantId?.toString() || "";

  const handleOpenTerapiaModal = (terapia?: TerapiaRow) => {
    if (terapia) {
      setEditingTerapia(terapia);
      setTerapiaForm({
        tenantId: terapia.tenantId.toString(),
        nombre: terapia.nombre,
        descripcion: terapia.descripcion || "",
        categoria: terapia.categoria || "",
        cantidadSesiones: terapia.cantidadSesiones.toString(),
        precioBase: terapia.precioBase.toString(),
        empresaId: terapia.empresaId?.toString() || "none",
        activo: terapia.activo === false ? "false" : "true",
      });
      refreshOptionsForTenant(terapia.tenantId.toString());
    } else {
      const tenant = defaultTenantId();
      setEditingTerapia(null);
      setTerapiaForm({
        tenantId: tenant,
        nombre: "",
        descripcion: "",
        categoria: "",
        cantidadSesiones: "1",
        precioBase: "0",
        empresaId: "none",
        activo: "true",
      });
      refreshOptionsForTenant(tenant);
    }
    setIsTerapiaModalOpen(true);
  };

  const handleTerapiaTenantChange = (value: string) => {
    setTerapiaForm((current) => ({ ...current, tenantId: value, empresaId: "none" }));
    refreshOptionsForTenant(value);
  };

  const handleTerapiaSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setIsSubmitting(false);
      router.push("/sign-in");
      return;
    }

    const formData = new FormData();
    formData.set("tenantId", terapiaForm.tenantId);
    formData.set("nombre", terapiaForm.nombre);
    formData.set("descripcion", terapiaForm.descripcion);
    formData.set("categoria", terapiaForm.categoria);
    formData.set("cantidadSesiones", terapiaForm.cantidadSesiones);
    formData.set("precioBase", terapiaForm.precioBase);
    formData.set("empresaId", terapiaForm.empresaId);
    formData.set("activo", terapiaForm.activo);

    const result = editingTerapia
      ? await updateTerapiaPsicologos(token, editingTerapia.id, formData)
      : await createTerapiaPsicologos(token, formData);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setIsTerapiaModalOpen(false);
      await loadData();
    }

    setIsSubmitting(false);
  };

  const toggleTerapia = async (terapia: TerapiaRow, active: boolean) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setIsDeleting(true);
    const result = await toggleTerapiaPsicologosActivo(token, terapia.id, active);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setTerapiaToDeactivate(null);
      await loadData();
    }

    setIsDeleting(false);
  };

  const handleOpenPaqueteModal = (paquete?: PaqueteRow) => {
    if (paquete) {
      const ownerType = paquete.Cliente ? "CLIENTE" : "PSICOLOGO";
      setEditingPaquete(paquete);
      setPaqueteForm({
        tenantId: paquete.tenantId.toString(),
        catalogoId: paquete.catalogoId.toString(),
        ownerType,
        clienteId: paquete.clienteId?.toString() || "",
        usuarioId: paquete.usuarioId?.toString() || "",
        sesionesTotales: paquete.sesionesTotales.toString(),
        sesionesConsumidas: (paquete.sesionesConsumidas || 0).toString(),
        precioPagado: paquete.precioPagado.toString(),
        fechaVencimiento: toDateInput(paquete.fechaVencimiento),
        estado: paquete.estado || EstadoPaquete.ACTIVO,
      });
      if (paquete.Cliente) setClientOptions([paquete.Cliente]);
      refreshOptionsForTenant(paquete.tenantId.toString());
    } else {
      const tenant = defaultTenantId();
      setEditingPaquete(null);
      setClientOptions([]);
      setPaqueteForm({
        tenantId: tenant,
        catalogoId: "",
        ownerType: "CLIENTE",
        clienteId: "",
        usuarioId: "",
        sesionesTotales: "1",
        sesionesConsumidas: "0",
        precioPagado: "0",
        fechaVencimiento: "",
        estado: EstadoPaquete.ACTIVO,
      });
      refreshOptionsForTenant(tenant);
    }
    setClientSearchTerm("");
    setIsPaqueteModalOpen(true);
  };

  const handlePaqueteTenantChange = (value: string) => {
    setPaqueteForm((current) => ({
      ...current,
      tenantId: value,
      catalogoId: "",
      clienteId: "",
      usuarioId: "",
    }));
    setClientOptions([]);
    refreshOptionsForTenant(value);
  };

  const handlePackageCatalogChange = (value: string) => {
    const terapia = packageTerapiaOptions.find(
      (item) => item.id.toString() === value,
    );

    setPaqueteForm((current) => ({
      ...current,
      catalogoId: value,
      sesionesTotales: terapia?.cantidadSesiones.toString() || current.sesionesTotales,
      precioPagado: terapia?.precioBase.toString() || current.precioPagado,
    }));
  };

  const handlePaqueteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setIsSubmitting(false);
      router.push("/sign-in");
      return;
    }

    const formData = new FormData();
    formData.set("tenantId", paqueteForm.tenantId);
    formData.set("catalogoId", paqueteForm.catalogoId);
    formData.set("ownerType", paqueteForm.ownerType);
    formData.set("clienteId", paqueteForm.clienteId);
    formData.set("usuarioId", paqueteForm.usuarioId);
    formData.set("sesionesTotales", paqueteForm.sesionesTotales);
    formData.set("sesionesConsumidas", paqueteForm.sesionesConsumidas);
    formData.set("precioPagado", paqueteForm.precioPagado);
    formData.set("fechaVencimiento", paqueteForm.fechaVencimiento);
    formData.set("estado", paqueteForm.estado);

    const result = editingPaquete
      ? await updatePaqueteAdquirido(token, editingPaquete.id, formData)
      : await createPaqueteAdquirido(token, formData);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setIsPaqueteModalOpen(false);
      await loadData();
    }

    setIsSubmitting(false);
  };

  const cancelPaquete = async () => {
    if (!paqueteToCancel) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setIsDeleting(true);
    const result = await cancelPaqueteAdquirido(token, paqueteToCancel.id);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setPaqueteToCancel(null);
      await loadData();
    }

    setIsDeleting(false);
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
      <div className="flex-none border-b border-slate-200 bg-white px-8 py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Servicios y Paquetes
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Administra el catálogo de atención psicológica y los paquetes activos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenPaqueteModal()}
            >
              <Package className="mr-2 h-4 w-4" />
              Nuevo Paquete
            </Button>
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => handleOpenTerapiaModal()}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Servicio
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-none border-b border-slate-200 bg-slate-50 px-8 py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="terapias">Servicios/Terapias</TabsTrigger>
              <TabsTrigger value="paquetes">Paquetes</TabsTrigger>
            </TabsList>
          </Tabs>

          {isSuperAdmin && (
            <div className="w-full md:w-64">
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Sistema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los sistemas</SelectItem>
                  {options.tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id.toString()}>
                      {tenant.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mx-auto max-w-7xl">
          <TabsContent value="terapias" className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={terapiaSearch}
                  onChange={(event) => setTerapiaSearch(event.target.value)}
                  placeholder="Buscar por servicio, categoría o empresa..."
                  className="bg-white pl-10"
                />
              </div>
              <Select value={terapiaEstado} onValueChange={setTerapiaEstado}>
                <SelectTrigger className="w-full bg-white md:w-48">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="inactive">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
              ) : terapias.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-slate-500">
                  <Package className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="font-medium">No hay servicios registrados</p>
                  <p className="text-sm">Crea un servicio para que aparezca al registrar citas.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-5 py-3">Servicio</th>
                      <th className="px-5 py-3">Sesiones</th>
                      <th className="px-5 py-3">Precio base</th>
                      <th className="px-5 py-3">Empresa</th>
                      <th className="px-5 py-3">Estado</th>
                      <th className="px-5 py-3">Paquetes</th>
                      <th className="px-5 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {terapias.map((terapia) => (
                      <tr key={terapia.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <div className="font-medium text-slate-900">{terapia.nombre}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            {terapia.categoria && <span>{terapia.categoria}</span>}
                            {isSuperAdmin &&
                              terapia.Empresa_TerapiasPsicologos_tenantIdToEmpresa && (
                                <span>
                                  {terapia.Empresa_TerapiasPsicologos_tenantIdToEmpresa.nombre}
                                </span>
                              )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          {terapia.cantidadSesiones}
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-900">
                          {formatCurrency(terapia.precioBase)}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {terapia.Empresa_TerapiasPsicologos_empresaIdToEmpresa?.nombre ||
                            "Sin empresa"}
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
                        <td className="px-5 py-4 text-slate-700">
                          {terapia._count.PaqueteAdquirido}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenTerapiaModal(terapia)}
                              title="Editar servicio"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {terapia.activo === false ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-green-600 hover:text-green-700"
                                onClick={() => toggleTerapia(terapia, true)}
                                title="Reactivar servicio"
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
                                title="Desactivar servicio"
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
          </TabsContent>

          <TabsContent value="paquetes" className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={paqueteSearch}
                  onChange={(event) => setPaqueteSearch(event.target.value)}
                  placeholder="Buscar por titular, documento o servicio..."
                  className="bg-white pl-10"
                />
              </div>
              <Select value={paqueteEstado} onValueChange={setPaqueteEstado}>
                <SelectTrigger className="w-full bg-white md:w-48">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.values(EstadoPaquete).map((estado) => (
                    <SelectItem key={estado} value={estado}>
                      {estado}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
              ) : paquetes.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-slate-500">
                  <Package className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="font-medium">No hay paquetes registrados</p>
                  <p className="text-sm">Crea un paquete para asignarlo a pacientes o psicólogos.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-5 py-3">Titular</th>
                      <th className="px-5 py-3">Servicio</th>
                      <th className="px-5 py-3">Sesiones</th>
                      <th className="px-5 py-3">Precio</th>
                      <th className="px-5 py-3">Estado</th>
                      <th className="px-5 py-3">Vence</th>
                      <th className="px-5 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paquetes.map((paquete) => (
                      <tr key={paquete.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <div className="font-medium text-slate-900">
                            {ownerName(paquete)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {ownerDocument(paquete)}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-medium text-slate-900">
                            {paquete.TerapiasPsicologos.nombre}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {paquete.TerapiasPsicologos.categoria || "Sin categoría"}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Badge className="bg-blue-50 text-blue-700">
                            {paquete.sesionesConsumidas || 0} / {paquete.sesionesTotales}
                          </Badge>
                          <div className="mt-1 text-xs text-slate-500">
                            Restan {paquete.saldoRestante}
                          </div>
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-900">
                          {formatCurrency(paquete.precioPagado)}
                        </td>
                        <td className="px-5 py-4">
                          <Badge className={estadoBadgeClass(paquete.estado)}>
                            {paquete.estado || "SIN ESTADO"}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {formatDate(paquete.fechaVencimiento)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setViewingPaquete(paquete)}
                              title="Ver paquete"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenPaqueteModal(paquete)}
                              title="Editar paquete"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700"
                              disabled={paquete.estado === EstadoPaquete.CANCELADO}
                              onClick={() => setPaqueteToCancel(paquete)}
                              title="Cancelar paquete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isTerapiaModalOpen} onOpenChange={setIsTerapiaModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTerapia ? "Editar Servicio" : "Nuevo Servicio"}
            </DialogTitle>
            <DialogDescription>
              Define el nombre, sesiones y precio base disponible para nuevas citas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTerapiaSubmit} className="space-y-4">
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label>Sistema</Label>
                <Select
                  value={terapiaForm.tenantId}
                  onValueChange={handleTerapiaTenantChange}
                  disabled={Boolean(editingTerapia)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar sistema" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id.toString()}>
                        {tenant.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="terapia-nombre">Nombre</Label>
                <Input
                  id="terapia-nombre"
                  value={terapiaForm.nombre}
                  onChange={(event) =>
                    setTerapiaForm((current) => ({
                      ...current,
                      nombre: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="terapia-categoria">Categoría</Label>
                <Input
                  id="terapia-categoria"
                  value={terapiaForm.categoria}
                  onChange={(event) =>
                    setTerapiaForm((current) => ({
                      ...current,
                      categoria: event.target.value,
                    }))
                  }
                  placeholder="Ej: Terapia individual"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="terapia-sesiones">Cantidad de sesiones</Label>
                <Input
                  id="terapia-sesiones"
                  type="number"
                  min="1"
                  value={terapiaForm.cantidadSesiones}
                  onChange={(event) =>
                    setTerapiaForm((current) => ({
                      ...current,
                      cantidadSesiones: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="terapia-precio">Precio base</Label>
                <Input
                  id="terapia-precio"
                  type="number"
                  min="0"
                  step="0.01"
                  value={terapiaForm.precioBase}
                  onChange={(event) =>
                    setTerapiaForm((current) => ({
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
                  value={terapiaForm.empresaId}
                  onValueChange={(value) =>
                    setTerapiaForm((current) => ({ ...current, empresaId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin empresa</SelectItem>
                    {options.empresas.map((empresa) => (
                      <SelectItem key={empresa.id} value={empresa.id.toString()}>
                        {empresa.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={terapiaForm.activo}
                  onValueChange={(value) =>
                    setTerapiaForm((current) => ({ ...current, activo: value }))
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
              <Label htmlFor="terapia-descripcion">Descripción</Label>
              <Textarea
                id="terapia-descripcion"
                value={terapiaForm.descripcion}
                onChange={(event) =>
                  setTerapiaForm((current) => ({
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
                onClick={() => setIsTerapiaModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPaqueteModalOpen} onOpenChange={setIsPaqueteModalOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingPaquete ? "Editar Paquete" : "Nuevo Paquete"}
            </DialogTitle>
            <DialogDescription>
              Asigna un paquete a un paciente o psicólogo y define su saldo de sesiones.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePaqueteSubmit} className="space-y-4">
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label>Sistema</Label>
                <Select
                  value={paqueteForm.tenantId}
                  onValueChange={handlePaqueteTenantChange}
                  disabled={Boolean(editingPaquete)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar sistema" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id.toString()}>
                        {tenant.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Servicio/Terapia</Label>
                <Select
                  value={paqueteForm.catalogoId}
                  onValueChange={handlePackageCatalogChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar servicio" />
                  </SelectTrigger>
                  <SelectContent>
                    {packageTerapiaOptions.map((terapia) => (
                      <SelectItem key={terapia.id} value={terapia.id.toString()}>
                        {terapia.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de titular</Label>
                <Select
                  value={paqueteForm.ownerType}
                  onValueChange={(value) =>
                    setPaqueteForm((current) => ({
                      ...current,
                      ownerType: value as "CLIENTE" | "PSICOLOGO",
                      clienteId: "",
                      usuarioId: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLIENTE">Paciente</SelectItem>
                    <SelectItem value="PSICOLOGO">Psicólogo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paqueteForm.ownerType === "CLIENTE" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label>Paciente</Label>
                  <Combobox
                    options={clientOptions.map((client) => ({
                      value: client.id.toString(),
                      label: `(${client.numeroDocumento || client.telefono || "S/N"}) ${
                        client.nombre || ""
                      } ${client.apellido || ""}`.trim(),
                    }))}
                    value={paqueteForm.clienteId}
                    onChange={(value) =>
                      setPaqueteForm((current) => ({ ...current, clienteId: value }))
                    }
                    onInputChange={setClientSearchTerm}
                    shouldFilter={false}
                    placeholder="Buscar paciente por documento, nombre o teléfono..."
                    emptyMessage={
                      clientSearchTerm.length < 6
                        ? "Ingrese al menos 6 caracteres..."
                        : isSearchingClients
                          ? "Buscando..."
                          : "No se encontraron pacientes."
                    }
                  />
                </div>
              ) : (
                <div className="space-y-2 md:col-span-2">
                  <Label>Psicólogo</Label>
                  <Select
                    value={paqueteForm.usuarioId}
                    onValueChange={(value) =>
                      setPaqueteForm((current) => ({ ...current, usuarioId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar psicólogo" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.psicologos.map((psicologo) => (
                        <SelectItem key={psicologo.id} value={psicologo.id.toString()}>
                          {psicologo.nombre} {psicologo.apellido}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="paquete-total">Sesiones totales</Label>
                <Input
                  id="paquete-total"
                  type="number"
                  min="1"
                  value={paqueteForm.sesionesTotales}
                  onChange={(event) =>
                    setPaqueteForm((current) => ({
                      ...current,
                      sesionesTotales: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paquete-consumidas">Sesiones consumidas</Label>
                <Input
                  id="paquete-consumidas"
                  type="number"
                  min="0"
                  value={paqueteForm.sesionesConsumidas}
                  onChange={(event) =>
                    setPaqueteForm((current) => ({
                      ...current,
                      sesionesConsumidas: event.target.value,
                    }))
                  }
                  required
                />
                <p className="text-xs text-slate-500">
                  Saldo restante calculado: {paqueteSaldoPreview}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paquete-precio">Precio pagado</Label>
                <Input
                  id="paquete-precio"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paqueteForm.precioPagado}
                  onChange={(event) =>
                    setPaqueteForm((current) => ({
                      ...current,
                      precioPagado: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paquete-vencimiento">Fecha de vencimiento</Label>
                <Input
                  id="paquete-vencimiento"
                  type="date"
                  value={paqueteForm.fechaVencimiento}
                  onChange={(event) =>
                    setPaqueteForm((current) => ({
                      ...current,
                      fechaVencimiento: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={paqueteForm.estado}
                  onValueChange={(value) =>
                    setPaqueteForm((current) => ({
                      ...current,
                      estado: value as EstadoPaquete,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(EstadoPaquete).map((estado) => (
                      <SelectItem key={estado} value={estado}>
                        {estado}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPaqueteModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingPaquete)} onOpenChange={() => setViewingPaquete(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del Paquete</DialogTitle>
          </DialogHeader>
          {viewingPaquete && (
            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Titular
                </span>
                <span className="font-medium text-slate-900">
                  {ownerName(viewingPaquete)}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Documento/Usuario
                </span>
                <span className="font-medium text-slate-900">
                  {ownerDocument(viewingPaquete)}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Servicio
                </span>
                <span className="font-medium text-slate-900">
                  {viewingPaquete.TerapiasPsicologos.nombre}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Estado
                </span>
                <Badge className={estadoBadgeClass(viewingPaquete.estado)}>
                  {viewingPaquete.estado || "SIN ESTADO"}
                </Badge>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Sesiones
                </span>
                <span className="font-medium text-slate-900">
                  {viewingPaquete.sesionesConsumidas || 0} consumidas de{" "}
                  {viewingPaquete.sesionesTotales}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Saldo restante
                </span>
                <span className="font-medium text-slate-900">
                  {viewingPaquete.saldoRestante}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Precio pagado
                </span>
                <span className="font-medium text-slate-900">
                  {formatCurrency(viewingPaquete.precioPagado)}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Citas asociadas
                </span>
                <span className="font-medium text-slate-900">
                  {viewingPaquete._count.CitasPsicologos}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Fecha de compra
                </span>
                <span className="font-medium text-slate-900">
                  {formatDate(viewingPaquete.fechaCompra)}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  Fecha de vencimiento
                </span>
                <span className="font-medium text-slate-900">
                  {formatDate(viewingPaquete.fechaVencimiento)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setViewingPaquete(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(terapiaToDeactivate)}
        onOpenChange={() => setTerapiaToDeactivate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar Servicio</DialogTitle>
            <DialogDescription>
              El servicio dejará de aparecer al registrar nuevas citas, pero el historial
              de citas y paquetes existentes se conservará.
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

      <Dialog open={Boolean(paqueteToCancel)} onOpenChange={() => setPaqueteToCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Paquete</DialogTitle>
            <DialogDescription>
              El paquete quedará en estado CANCELADO y no se podrá usar como paquete activo
              en nuevas citas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPaqueteToCancel(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={cancelPaquete}
              disabled={isDeleting}
            >
              {isDeleting ? "Cancelando..." : "Cancelar Paquete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
