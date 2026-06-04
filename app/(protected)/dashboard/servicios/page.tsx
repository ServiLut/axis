"use client";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Search,
  ClipboardList,
  Calendar,
  CheckCircle,
  Clock,
  Trash2,
  Eye,
  EyeOff,
  MapPin,
  Edit,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
  Copy,
  MessageCircle,
  Car,
  Map as MapIcon,
  FileText,
  ExternalLink,
  Check,
  ChevronsUpDown,
  Lock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

import { useUserRole } from "@/hooks/use-user-role";
import {
  getOrdenesServicio,
  deleteOrdenServicio,
  getOrdenesStats,
  getOrdenServicio,
  getFilterData,
  sendServiceToTechnician,
  getTenantsList,
  getAllOrdenesServicioForExport,
  uploadFacturaElectronica,
  uploadComprobantePago,
  uploadEvidence,
  registrarRefuerzo,
  liquidarOrdenTransferencia,
} from "./actions";
import { getAllCitasForExport } from "../citas/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { municipiosAntioquia } from "@/lib/constants/municipios";
import { checkPermission, requestPermission, getMyPermissionStatus } from "@/app/(protected)/dashboard/configuracion/permisos/actions";
import type { Permiso } from "@/prisma/generated/prisma/client";

interface Geolocalizacion {
  id: number;
  latitud: number | string | null;
  longitud: number | string | null;
  llegada: Date | string;
  salida: Date | string | null;
  fotoLlegada: string | null;
  fotoSalida: string | null;
}

interface OrdenServicio {
  id: number;
  cliente: {
    id: number;
    nombre: string | null;
    apellido: string | null;
    numeroDocumento: string | null;
    tipoDocumento: string | null;
    telefono: string | null;
    correo: string | null;
  };
  servicio: { nombre: string };
  tecnico: { nombre: string; apellido: string } | null;
  empresa: { id: number; nombre: string } | null;
  tipoServicio: { id: number; nombre: string } | null;
  creadoPor: { nombre: string; apellido: string } | null;
  zona: { nombre: string } | null;
  creadoPorId: number | null;
  estadoServicio: { id: number; nombre: string };
  estado: string;
  fechaVisita: Date | string | null;
  horaInicio: Date | string | null;
  valorCotizado: number | null;
  direccionTexto: string;
  numeroOrden: string | null;
  createdAt: Date | string;
  piso: string | null;
  bloque: string | null;
  unidad: string | null;
  barrio: string | null;
  municipio: string | null;
  departamento: string | null;
  observacion: string | null;
  observacionFinal?: string | null;
  linkMaps?: string | null;
  tenantNombre?: string | null;
  horaFin?: Date | string | null;
  nivelInfestacion?: string | null;
  condicionesHigiene?: string | null;
  condicionesLocal?: string | null;
  valorPagado?: number | null;
  valorRepuestos?: number | null;
  valorRepuestosTecnico?: number | null;
  metodoPago?: { id: number; nombre: string } | null;
  vehiculoId?: number | null;
  vehiculo?: {
    id: number;
    placa: string;
    marca: string | null;
    modelo: string | null;
    color: string | null;
    tipo: string | null;
  } | null;
  facturaPath?: string | null;
  facturaElectronica?: string | null;
  comprobantePago?: string | null;
  evidenciaPath?: string | null;
  estadoPago?: string;
  geolocalizaciones?: Geolocalizacion[];
}

interface Empresa {
  id: number;
  nombre: string;
}

interface EstadoServicio {
  id: number;
  nombre: string;
  empresaId?: number | null;
}

interface TipoServicio {
  id: number;
  nombre: string;
  empresaId?: number | null;
}

interface MetodoPago {
  id: number;
  nombre: string;
  empresaId?: number | null;
}

interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
}

interface Stats {
  totalOrdenes: number;
  programadas: number;
  enProceso: number;
  finalizadas: number;
  noConcretados: number;
}

const formatDateUTC = (dateString: Date | string | null) => {
  if (!dateString) return "Sin agendar";
  const date = new Date(dateString);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const displayDate = new Date(year, month, day);
  return format(displayDate, "dd/MM/yyyy", { locale: es });
};

export default function ServiciosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { role, userId, loading: roleLoading } = useUserRole();

  // Logic to block delete
  const blockedUserIds = process.env.NEXT_PUBLIC_USER_ID_BLOCK_DELETE?.split(",").map(id => id.trim()) || [];
  const isBlockedToDelete = userId ? blockedUserIds.includes(userId.toString()) : false;

  // Permission State
  const [canDownloadExcel, setCanDownloadExcel] = useState(false);
  const [excelPermissionStatus, setExcelPermissionStatus] = useState<Permiso | null>(null);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [requestMotivo, setRequestMotivo] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);

  useEffect(() => {
    const checkExcelPermission = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        
        const [check, status] = await Promise.all([
            checkPermission(token, "DESCARGAR_EXCEL"),
            getMyPermissionStatus(token, "DESCARGAR_EXCEL")
        ]);

        setCanDownloadExcel(check.allowed);
        setExcelPermissionStatus(status.permiso ?? null);
    };
    checkExcelPermission();
  }, []);

  const handleRequestExcelPermission = () => {
    setRequestMotivo("");
    setIsRequestDialogOpen(true);
  };

  const submitPermissionRequest = async () => {
    if (!requestMotivo.trim()) {
        toast.error("Por favor ingrese un motivo");
        return;
    }

    setSendingRequest(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await requestPermission(token, "DESCARGAR_EXCEL", undefined, requestMotivo);
    
    if (res.error) {
        toast.error(res.error);
    } else if (res.message) {
        toast.success(res.message);
        setIsRequestDialogOpen(false);
        const status = await getMyPermissionStatus(token, "DESCARGAR_EXCEL");
        setExcelPermissionStatus(status.permiso ?? null);
    }
    setSendingRequest(false);
  };

  const [showKPIs, setShowKPIs] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem("showKPIs");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem("showKPIs", showKPIs.toString());
  }, [showKPIs]);

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingOrdenId, setUploadingOrdenId] = useState<number | null>(null);
  const [uploadingType, setUploadingType] = useState<"factura" | "comprobante" | "evidencia" | null>(null);
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);

  // Export states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportTenantId, setExportTenantId] = useState("all");
  const [tenants, setTenants] = useState<{ id: number; nombre: string }[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Filter states initialized from URL params
  const [searchTerm, setSearchTerm] = useState(searchParams.get("term") || "");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchParams.get("term") || "");
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>(searchParams.get("empresa") || "all");
  const [selectedTipoServicio, setSelectedTipoServicio] = useState<string>(searchParams.get("tipo") || "all");
  const [selectedCreador, setSelectedCreador] = useState<string>(searchParams.get("creador") || "all");
  const [selectedTecnico, setSelectedTecnico] = useState<string>(searchParams.get("tecnico") || "all");
  const [selectedMetodoPago, setSelectedMetodoPago] = useState<string>(searchParams.get("pago") || "all");
  
  const initialEstado = searchParams.get("estado");
  const [selectedEstado, setSelectedEstado] = useState<string[]>(
    initialEstado && initialEstado !== "all" ? initialEstado.split(",") : []
  );
  
  const [selectedMunicipio, setSelectedMunicipio] = useState<string>(searchParams.get("municipio") || "all");
  const [startDate, setStartDate] = useState<string>(searchParams.get("start") || "");
  const [endDate, setEndDate] = useState<string>(searchParams.get("end") || "");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const itemsPerPage = 10;
  
  const [isRestored, setIsRestored] = useState(false);
  const hasRestored = useRef(false);

  // Restore filters from session storage on mount if URL params are empty
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    const hasFiltersInUrl = 
      searchParams.has("term") || 
      searchParams.has("empresa") || 
      searchParams.has("tipo") || 
      searchParams.has("creador") || 
      searchParams.has("tecnico") || 
      searchParams.has("pago") || 
      searchParams.has("estado") || 
      searchParams.has("municipio") || 
      searchParams.has("start") || 
      searchParams.has("end") || 
      searchParams.has("page");

    if (!hasFiltersInUrl) {
      const savedFilters = sessionStorage.getItem("serviciosFilters");
      if (savedFilters) {
        const params = new URLSearchParams(savedFilters);
        
        if (params.get("term")) setSearchTerm(params.get("term")!);
        if (params.get("empresa")) setSelectedEmpresa(params.get("empresa")!);
        if (params.get("tipo")) setSelectedTipoServicio(params.get("tipo")!);
        if (params.get("creador")) setSelectedCreador(params.get("creador")!);
        if (params.get("tecnico")) setSelectedTecnico(params.get("tecnico")!);
        if (params.get("pago")) setSelectedMetodoPago(params.get("pago")!);
        if (params.get("estado")) setSelectedEstado(params.get("estado")!.split(","));
        if (params.get("municipio")) setSelectedMunicipio(params.get("municipio")!);
        if (params.get("start")) setStartDate(params.get("start")!);
        if (params.get("end")) setEndDate(params.get("end")!);
        if (params.get("page")) setCurrentPage(Number(params.get("page")));
      }
    }
    setIsRestored(true);
  }, [searchParams]); // Run on mount, but guarded by ref

  // Sync state to URL and Session Storage
  useEffect(() => {
    if (!isRestored) return;

    const params = new URLSearchParams();
    
    if (debouncedSearchTerm) params.set("term", debouncedSearchTerm);
    if (selectedEmpresa && selectedEmpresa !== "all") params.set("empresa", selectedEmpresa);
    if (selectedTipoServicio && selectedTipoServicio !== "all") params.set("tipo", selectedTipoServicio);
    if (selectedCreador && selectedCreador !== "all") params.set("creador", selectedCreador);
    if (selectedTecnico && selectedTecnico !== "all") params.set("tecnico", selectedTecnico);
    if (selectedMetodoPago && selectedMetodoPago !== "all") params.set("pago", selectedMetodoPago);
    if (selectedEstado.length > 0) params.set("estado", selectedEstado.join(","));
    if (selectedMunicipio && selectedMunicipio !== "all") params.set("municipio", selectedMunicipio);
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);
    if (currentPage > 1) params.set("page", currentPage.toString());

    const queryString = params.toString();
    router.replace(`${pathname}?${queryString}`);
    
    // Save to session storage
    if (queryString) {
      sessionStorage.setItem("serviciosFilters", queryString);
    } else {
      sessionStorage.removeItem("serviciosFilters");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearchTerm,
    selectedEmpresa,
    selectedTipoServicio,
    selectedCreador,
    selectedTecnico,
    selectedMetodoPago,
    selectedEstado,
    selectedMunicipio,
    startDate,
    endDate,
    currentPage,
    isRestored,
  ]);

  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedOrden, setSelectedOrden] = useState<OrdenServicio | null>(
    null,
  );
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isGeoModalOpen, setIsGeoModalOpen] = useState(false);
  const [ordenToDelete, setOrdenToDelete] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reinforcement Modal State
  const [isReinforcementModalOpen, setIsReinforcementModalOpen] = useState(false);
  const [selectedOrdenForReinforcement, setSelectedOrdenForReinforcement] = useState<OrdenServicio | null>(null);
  const [newRefuerzoDate, setNewRefuerzoDate] = useState("");
  const [newRefuerzoAmount, setNewRefuerzoAmount] = useState("");
  const [processingReinforcement, setProcessingReinforcement] = useState(false);

  // Liquidation Modal State
  const [isLiquidationModalOpen, setIsLiquidationModalOpen] = useState(false);
  const [selectedOrdenForLiquidation, setSelectedOrdenForLiquidation] = useState<OrdenServicio | null>(null);
  const [liquidationDate, setLiquidationDate] = useState("");
  const [liquidationAmount, setLiquidationAmount] = useState("");
  const [liquidationBank, setLiquidationBank] = useState("");
  const [liquidationRef, setLiquidationRef] = useState("");
  const [liquidationObs, setLiquidationObs] = useState("");
  const [liquidationFile, setLiquidationFile] = useState<File | null>(null);
  const [isLiquidating, setIsLiquidating] = useState(false);

  const handleOpenLiquidation = (orden: OrdenServicio) => {
    setSelectedOrdenForLiquidation(orden);
    // Default date: today
    setLiquidationDate(new Date().toISOString().split("T")[0]);
    // Default amount: valorPagado or valorCotizado
    setLiquidationAmount((orden.valorPagado || orden.valorCotizado || 0).toString());
    setLiquidationBank("");
    setLiquidationRef("");
    setLiquidationObs("");
    setLiquidationFile(null);
    setIsLiquidationModalOpen(true);
  };

  const handleConfirmLiquidation = async () => {
    if (!selectedOrdenForLiquidation || !liquidationDate || !liquidationAmount || !liquidationBank || !liquidationRef) {
      toast.error("Por favor complete todos los campos obligatorios");
      return;
    }

    setIsLiquidating(true);
    const token = localStorage.getItem("token");
    if (!token) {
        setIsLiquidating(false);
        return;
    }

    let comprobantePath: string | undefined;
    if (liquidationFile) {
        const formData = new FormData();
        formData.append("file", liquidationFile);
        const uploadRes = await uploadComprobantePago(token, selectedOrdenForLiquidation.id, formData);
        if (uploadRes.error) {
            toast.error(uploadRes.error);
            setIsLiquidating(false);
            return;
        }
        comprobantePath = uploadRes.path;
    }

    const res = await liquidarOrdenTransferencia(
      token,
      selectedOrdenForLiquidation.id,
      {
        fechaTransaccion: new Date(liquidationDate),
        monto: Number(liquidationAmount),
        banco: liquidationBank,
        referencia: liquidationRef,
        observacion: liquidationObs,
        comprobantePath: comprobantePath
      }
    );

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(res.message || "Orden liquidada exitosamente");
      setIsLiquidationModalOpen(false);
      fetchOrders();
    }
    setIsLiquidating(false);
  };

  const handleOpenReinforcement = (orden: OrdenServicio) => {
    setSelectedOrdenForReinforcement(orden);
    // Default date: tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = "08"; // Default 8 AM
    const minutes = "00";
    setNewRefuerzoDate(`${year}-${month}-${day}T${hours}:${minutes}`);
    
    // Calculate suggested amount: 50% if > 100k, else 50k
    const valorOriginal = Number(orden.valorPagado) || 0;
    const montoCalculado = valorOriginal > 100000 ? valorOriginal / 2 : 50000;
    setNewRefuerzoAmount(montoCalculado.toString());

    setIsReinforcementModalOpen(true);
  };

  const handleConfirmReinforcement = async () => {
    if (!selectedOrdenForReinforcement || !newRefuerzoDate) {
      toast.error("Por favor complete los campos requeridos");
      return;
    }

    setProcessingReinforcement(true);
    const token = localStorage.getItem("token");
    if (!token) {
        setProcessingReinforcement(false);
        return;
    }

    // Create date object
    const dateObj = new Date(newRefuerzoDate);

    // Validate 31 days limit
    if (selectedOrdenForReinforcement.fechaVisita) {
        const originalDate = new Date(selectedOrdenForReinforcement.fechaVisita);
        const daysDiff = differenceInDays(dateObj, originalDate);
        if (daysDiff >= 31) {
            toast.error("El refuerzo no puede asignarse después de 31 días del servicio original.");
            setProcessingReinforcement(false);
            return;
        }
    }
    
    const res = await registrarRefuerzo(
      token,
      selectedOrdenForReinforcement.id,
      dateObj,
      Number(newRefuerzoAmount) || 0,
      17
    );

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(res.message || "Refuerzo asignado exitosamente");
      setIsReinforcementModalOpen(false);
      fetchOrders(); // Refresh list
    }
    setProcessingReinforcement(false);
  };

  // Filter options states
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [tiposServicios, setTiposServicios] = useState<TipoServicio[]>([]);
  const [estadosServicio, setEstadosServicio] = useState<EstadoServicio[]>([]);
  const [creadores, setCreadores] = useState<Usuario[]>([]);
  const [tecnicos, setTecnicos] = useState<Usuario[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Reset page when filters change
  useEffect(() => {
     
    setCurrentPage(1);
  }, [
    debouncedSearchTerm,
    selectedEmpresa,
    selectedTipoServicio,
    selectedCreador,
    selectedTecnico,
    selectedMetodoPago,
    selectedEstado,
    selectedMunicipio,
    startDate,
    endDate,
  ]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setSelectedEmpresa("all");
    setSelectedTipoServicio("all");
    setSelectedCreador("all");
    setSelectedTecnico("all");
    setSelectedMetodoPago("all");
    setSelectedEstado([]);
    setSelectedMunicipio("all");
    setStartDate("");
    setEndDate("");
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const filters = {
      term: debouncedSearchTerm,
      empresaId: selectedEmpresa,
      tipoServicioId: selectedTipoServicio,
      creadorId: selectedCreador,
      tecnicoId: selectedTecnico,
      metodoPagoId: selectedMetodoPago,
      estado: selectedEstado.length > 0 ? selectedEstado.join(",") : "all",
      municipio: selectedMunicipio,
      startDate,
      endDate,
    };

    const result = await getOrdenesServicio(
      token,
      currentPage,
      itemsPerPage,
      filters,
    );

    if (result.error) {
      toast.error(result.error);
      if (result.error === "No autorizado") router.push("/sign-in");
    } else if (result.ordenes) {
      setOrdenes(result.ordenes as unknown as OrdenServicio[]);
      setTotalPages(result.totalPages || 1);
      setTotalRecords(result.total || 0);
    }
    setLoading(false);
  }, [
    router,
    currentPage,
    debouncedSearchTerm,
    selectedEmpresa,
    selectedTipoServicio,
    selectedCreador,
    selectedTecnico,
    selectedMetodoPago,
    selectedEstado,
    selectedMunicipio,
    startDate,
    endDate,
  ]);

  const fetchAuxData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Cargar estadísticas
    const statsRes = await getOrdenesStats(token);
    if (statsRes.stats) {
      setStats(statsRes.stats);
    }

    // Cargar filtros (secuencialmente para evitar sobrecarga paralela)
    const filterDataRes = await getFilterData(token);
    if (filterDataRes && !filterDataRes.error) {
      setEmpresas(filterDataRes.empresas || []);
      setTiposServicios(filterDataRes.tiposServicios || []);
      setEstadosServicio(filterDataRes.estadosServicio || []);
      setCreadores(filterDataRes.creadores || []);
      setTecnicos(filterDataRes.tecnicos || []);
      setMetodosPago(filterDataRes.metodosPago || []);
    }
  }, []);

  // Fetch Orders on change
  useEffect(() => {
     
    fetchOrders();
  }, [fetchOrders]);

  // Fetch Aux Data only once
  useEffect(() => {
     
    fetchAuxData();
  }, [fetchAuxData]);

  // Load tenants for SU_ADMIN export
  useEffect(() => {
    if (role === "SU_ADMIN" && isExportModalOpen && tenants.length === 0) {
      const loadTenants = async () => {
        const token = localStorage.getItem("token");
        if (token) {
          const res = await getTenantsList(token);
          if (res.tenants) setTenants(res.tenants);
        }
      };
      loadTenants();
    }
  }, [role, isExportModalOpen, tenants.length]);

  const handleViewOrden = async (id: number) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await getOrdenServicio(token, id);
    if (result.error) {
      toast.error(result.error);
    } else if (result.orden) {
      setSelectedOrden(result.orden as unknown as OrdenServicio);
      setIsViewModalOpen(true);
    }
  };

  const handleCloseViewModal = (open: boolean) => {
    setIsViewModalOpen(open);
    if (!open) {
      setSelectedOrden(null);
    }
  };

  const handleViewGeo = async (id: number) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await getOrdenServicio(token, id);
    if (result.error) {
      toast.error(result.error);
    } else if (result.orden) {
      setSelectedOrden(result.orden as unknown as OrdenServicio);
      setIsGeoModalOpen(true);
    }
  };

  const handleCloseGeoModal = (open: boolean) => {
    setIsGeoModalOpen(open);
    if (!open) {
      setSelectedOrden(null);
    }
  };

  const handleCopyOrden = (orden: OrdenServicio) => {
    const info = [
      `*Cliente:* ${orden.cliente.nombre} ${orden.cliente.apellido}`,
      `*Servicio:* ${orden.servicio.nombre}`,
      `*Tipo de Servicio:* ${orden.tipoServicio?.nombre || "N/A"}`,
      `*Fecha Visita:* ${formatDateUTC(orden.fechaVisita)}`,
      `*Hora:* ${
        orden.horaInicio
          ? new Date(orden.horaInicio).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          : "--:--"
      }`,
      `*Dirección:* ${orden.direccionTexto}`,
      orden.linkMaps && orden.linkMaps !== "No Concretado" ? `*Link Maps:* ${orden.linkMaps}` : null,
      `*Municipio:* ${orden.municipio || "N/A"}`,
      `*Barrio:* ${orden.barrio || "N/A"}`,
      `*Detalles:* ${
        [
          orden.bloque && `Bloque: ${orden.bloque}`,
          orden.piso && `Piso: ${orden.piso}`,
          orden.unidad && `Unidad: ${orden.unidad}`,
        ]
          .filter(Boolean)
          .join(" - ") || "N/A"
      }`,
      `*Valor Cotizado:* ${
        orden.valorCotizado
          ? new Intl.NumberFormat("es-CO", {
              style: "currency",
              currency: "COP",
              maximumFractionDigits: 0,
            }).format(orden.valorCotizado)
          : "$ 0"
      }`,
      `*Observaciones:* ${orden.observacion || "Sin observaciones"}`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(info);
    toast.success("Información copiada al portapapeles");
  };

  const handleSendToTechnician = async (orden: OrdenServicio) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("No autorizado");
      return;
    }

    const info = [
      `*Cliente:* ${orden.cliente.nombre} ${orden.cliente.apellido}`,
      `*Servicio:* ${orden.servicio.nombre}`,
      `*Tipo de Servicio:* ${orden.tipoServicio?.nombre || "N/A"}`,
      `*Fecha Visita:* ${formatDateUTC(orden.fechaVisita)}`,
      `*Hora:* ${
        orden.horaInicio
          ? new Date(orden.horaInicio).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          : "--:--"
      }`,
      `*Dirección:* ${orden.direccionTexto}`,
      orden.linkMaps && orden.linkMaps !== "No Concretado" ? `*Link Maps:* ${orden.linkMaps}` : null,
      `*Municipio:* ${orden.municipio || "N/A"}`,
      `*Barrio:* ${orden.barrio || "N/A"}`,
      `*Detalles:* ${
        [
          orden.bloque && `Bloque: ${orden.bloque}`,
          orden.piso && `Piso: ${orden.piso}`,
          orden.unidad && `Unidad: ${orden.unidad}`,
        ]
          .filter(Boolean)
          .join(" - ") || "N/A"
      }`,
      `*Valor Cotizado:* ${
        orden.valorCotizado
          ? new Intl.NumberFormat("es-CO", {
              style: "currency",
              currency: "COP",
              maximumFractionDigits: 0,
            }).format(orden.valorCotizado)
          : "$ 0"
      }`,
      `*Observaciones:* ${orden.observacion || "Sin observaciones"}`,
    ].filter(Boolean).join("\n");

    const toastId = toast.loading("Enviando información...");

    const result = await sendServiceToTechnician(token, orden.id, info);

    if (result.error) {
      toast.error(result.error, { id: toastId });
    } else {
      toast.success(result.message, { id: toastId });
    }
  };

  const handleNotifyClient = (orden: OrdenServicio) => {
    if (!orden.cliente.telefono) {
      toast.error("El cliente no tiene número de teléfono registrado");
      return;
    }

    // Limpiar el número de teléfono (dejar solo dígitos)
    let phone = orden.cliente.telefono.replace(/\D/g, "");

    // Asumir código de país Colombia (57) si no lo tiene y tiene 10 dígitos (celular)
    if (phone.length === 10) {
      phone = `57${phone}`;
    }

    const fecha = formatDateUTC(orden.fechaVisita);

    const hora = orden.horaInicio
      ? new Date(orden.horaInicio).toLocaleTimeString("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "Hora por definir";

    const tecnicoNombre = orden.tecnico
      ? `${orden.tecnico.nombre} ${orden.tecnico.apellido}`
      : "Por asignar";

    const empresaNombre = orden.empresa?.nombre || "Nuestra Empresa";

    const message = `Hola *${orden.cliente.nombre} ${orden.cliente.apellido}*, le saludamos de *${empresaNombre}*.

Le recordamos su servicio de *${orden.servicio.nombre}* programado para:
📅 *Fecha:* ${fecha}
⏰ *Hora:* ${hora}
📍 *Dirección:* ${orden.direccionTexto}
👨‍🔧 *Técnico:* ${tecnicoNombre}

Cualquier inquietud, estamos atentos.`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingOrdenId || !uploadingType) return;

    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("No autorizado");
      return;
    }

    const toastId = toast.loading(
      uploadingType === "factura" 
        ? "Subiendo factura..." 
        : uploadingType === "comprobante" 
        ? "Subiendo comprobante..." 
        : "Subiendo evidencia..."
    );
    const formData = new FormData();
    formData.append("file", file);

    let result;
    if (uploadingType === "factura") {
      result = await uploadFacturaElectronica(token, uploadingOrdenId, formData);
    } else if (uploadingType === "comprobante") {
      result = await uploadComprobantePago(token, uploadingOrdenId, formData);
    } else {
      result = await uploadEvidence(token, uploadingOrdenId, formData);
    }

    if (result.error) {
      toast.error(result.error, { id: toastId });
    } else {
      toast.success(result.message, { id: toastId });
      fetchOrders();
    }

    // Reset
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadingOrdenId(null);
    setUploadingType(null);
  };

  const triggerFileUpload = (ordenId: number, type: "factura" | "comprobante" | "evidencia") => {
    setUploadingOrdenId(ordenId);
    setUploadingType(type);
    setTimeout(() => {
        fileInputRef.current?.click();
    }, 0);
  };

  const handleDeleteClick = (id: number) => {
    setOrdenToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!ordenToDelete) return;

    setIsDeleting(true);
    const token = localStorage.getItem("token");
    if (!token) {
      setIsDeleting(false);
      return;
    }

    const orderToDeleteObj = ordenes.find((o) => o.id === ordenToDelete);

    const result = await deleteOrdenServicio(token, ordenToDelete);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      // Actualizar lista localmente para mejor UX
      setOrdenes((prev) => prev.filter((o) => o.id !== ordenToDelete));
      setTotalRecords((prev) => Math.max(0, prev - 1));

      // Update stats locally
      if (orderToDeleteObj && stats) {
        setStats((prevStats) => {
          if (!prevStats) return null;
          const newStats = { ...prevStats };
          newStats.totalOrdenes = Math.max(0, newStats.totalOrdenes - 1);

          if (orderToDeleteObj.estado === "PROGRAMADO") {
            newStats.programadas = Math.max(0, newStats.programadas - 1);
          } else if (orderToDeleteObj.estado === "EN_PROCESO") {
            newStats.enProceso = Math.max(0, newStats.enProceso - 1);
          } else if (orderToDeleteObj.estado === "SERVICIO_LISTO") {
            newStats.finalizadas = Math.max(0, newStats.finalizadas - 1);
          }

          if (orderToDeleteObj.tipoServicio?.nombre === "NO CONCRETADO") {
            newStats.noConcretados = Math.max(0, newStats.noConcretados - 1);
          }

          return newStats;
        });
      }

      setIsDeleteModalOpen(false);
      setOrdenToDelete(null);
    }
    setIsDeleting(false);
  };

  const filteredTiposServicios = tiposServicios.filter(
    (tipo) =>
      selectedEmpresa === "all" ||
      !tipo.empresaId ||
      tipo.empresaId.toString() === selectedEmpresa,
  );

  const handleEmpresaChange = (value: string) => {
    setSelectedEmpresa(value);
    setSelectedTipoServicio("all"); // Reset service type when company changes
  };

  const generateAndDownloadExcel = async (
    dataToExport: OrdenServicio[],
    filenamePrefix: string,
    citasToExport?: unknown[],
  ) => {
    if (dataToExport.length === 0 && (!citasToExport || citasToExport.length === 0)) {
      toast.error("No hay datos para exportar");
      return;
    }

    const workbook = new ExcelJS.Workbook();

    if (dataToExport.length > 0) {
      const worksheet = workbook.addWorksheet("Servicios");

      // Define columns
      const columns: Partial<ExcelJS.Column>[] = [
        { header: "Nro. Orden", key: "nroOrden", width: 15 },
        { header: "Estado", key: "estado", width: 15 },
        { header: "Fecha Creación", key: "fechaCreacion", width: 20 },
        { header: "Empresa", key: "empresa", width: 20 },
        { header: "Cliente", key: "cliente", width: 25 },
        { header: "Documento Cliente", key: "documentoCliente", width: 20 },
        { header: "Teléfono Cliente", key: "telefonoCliente", width: 15 },
        { header: "Correo Cliente", key: "correoCliente", width: 25 },
        { header: "Servicio", key: "servicio", width: 20 },
        { header: "Tipo Servicio", key: "tipoServicio", width: 20 },
        { header: "Zona", key: "zona", width: 15 },
        { header: "Técnico (Fumigador)", key: "tecnico", width: 25 },
        { header: "Creado Por", key: "creadoPor", width: 20 },
        { header: "Dirección", key: "direccion", width: 30 },
        { header: "Link Maps", key: "linkMaps", width: 30 },
        { header: "Municipio", key: "municipio", width: 15 },
        { header: "Departamento", key: "departamento", width: 15 },
        { header: "Barrio", key: "barrio", width: 15 },
        { header: "Unidad", key: "unidad", width: 10 },
        { header: "Bloque", key: "bloque", width: 10 },
        { header: "Piso", key: "piso", width: 10 },
        { header: "Fecha Visita", key: "fechaVisita", width: 15 },
        { header: "Hora Visita", key: "horaVisita", width: 15 },
        { header: "Valor Cotizado", key: "valorCotizado", width: 15 },
        { header: "Valor Cobrado", key: "valorPagado", width: 15 },
        { header: "Método de Pago", key: "metodoPago", width: 20 },
        { header: "Observaciones", key: "observaciones", width: 30 },
        { header: "Observación Final", key: "observacionFinal", width: 30 },
      ];

      // Add Tenant column if it exists in data (for SU_ADMIN exports)
      if (dataToExport.some((d) => d.tenantNombre)) {
        columns.splice(3, 0, {
          header: "Sistema (Tenant)",
          key: "tenantNombre",
          width: 20,
        });
      }

      worksheet.columns = columns;

      // Add rows
      dataToExport.forEach((orden) => {
        worksheet.addRow({
          nroOrden: orden.numeroOrden || `INT-${orden.id}`,
          estado: orden.estado,
          fechaCreacion: new Date(orden.createdAt).toLocaleString("es-CO"),
          tenantNombre: orden.tenantNombre || "",
          empresa: orden.empresa?.nombre || "N/A",
          cliente:
            `${orden.cliente.nombre || ""} ${orden.cliente.apellido || ""}`.trim(),
          documentoCliente:
            `${orden.cliente.tipoDocumento || ""} ${orden.cliente.numeroDocumento || ""}`.trim(),
          telefonoCliente: orden.cliente.telefono || "N/A",
          correoCliente: orden.cliente.correo || "N/A",
          servicio: orden.servicio.nombre,
          tipoServicio: orden.tipoServicio?.nombre || "N/A",
          zona: orden.zona?.nombre || "N/A",
          tecnico: orden.tecnico
            ? `${orden.tecnico.nombre} ${orden.tecnico.apellido}`
            : "Sin asignar",
          creadoPor: orden.creadoPor
            ? `${orden.creadoPor.nombre} ${orden.creadoPor.apellido}`
            : "Sistema",
          direccion: orden.direccionTexto,
          linkMaps: orden.linkMaps || "",
          municipio: orden.municipio || "",
          departamento: orden.departamento || "",
          barrio: orden.barrio || "",
          unidad: orden.unidad || "",
          bloque: orden.bloque || "",
          piso: orden.piso || "",
          fechaVisita: formatDateUTC(orden.fechaVisita),
          horaVisita: orden.horaInicio
            ? new Date(orden.horaInicio).toLocaleTimeString("es-CO", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "",
          valorCotizado: orden.valorCotizado || 0,
          valorPagado: orden.valorPagado || 0,
          metodoPago: orden.metodoPago?.nombre || "N/A",
          observaciones: orden.observacion || "",
          observacionFinal: orden.observacionFinal || "",
        });
      });

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "4F81BD" }, // Blue color
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Style data rows (borders)
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
            cell.alignment = { vertical: "middle", wrapText: true };
          });
        }
      });
    }

    // Add Citas worksheet if provided
    if (citasToExport && citasToExport.length > 0) {
      const worksheetCitas = workbook.addWorksheet("Citas (Psicología)");

      interface CitaExport {
        id: number;
        numeroOrden: string;
        tenantNombre?: string;
        cliente: { nombre: string; apellido: string; tipoDocumento: string; numeroDocumento: string; telefono: string; correo: string };
        servicio: { nombre: string };
        paqueteNombre?: string;
        consultorioNombre?: string;
        fechaVisita: string | Date;
        horaInicio: string | Date;
        tecnico?: { nombre: string; apellido: string };
        realizada: boolean;
        valorCotizado: number;
        observacion?: string;
        creadoPor?: { nombre: string; apellido: string };
      }

      const citas = citasToExport as CitaExport[];

      const columnsCitas: Partial<ExcelJS.Column>[] = [
        { header: "Nro. Cita", key: "nroCita", width: 15 },
        { header: "Paciente", key: "paciente", width: 25 },
        { header: "Documento", key: "documento", width: 20 },
        { header: "Teléfono", key: "telefono", width: 15 },
        { header: "Correo", key: "correo", width: 25 },
        { header: "Servicio", key: "servicio", width: 25 },
        { header: "Paquete", key: "paquete", width: 25 },
        { header: "Consultorio", key: "consultorio", width: 20 },
        { header: "Fecha", key: "fecha", width: 15 },
        { header: "Hora", key: "hora", width: 15 },
        { header: "Psicólogo", key: "psicologo", width: 25 },
        { header: "Estado", key: "estado", width: 15 },
        { header: "Realizada", key: "realizada", width: 12 },
        { header: "Valor", key: "valor", width: 15 },
        { header: "Observaciones", key: "observaciones", width: 30 },
        { header: "Creado Por", key: "creadoPor", width: 25 },
      ];

      // Add Tenant column if it exists
      if (citas.some((d) => d.tenantNombre)) {
        columnsCitas.splice(1, 0, {
          header: "Sistema (Tenant)",
          key: "tenantNombre",
          width: 20,
        });
      }

      worksheetCitas.columns = columnsCitas;

      const TIMEZONE = "America/Bogota";
      const formatDateBogota = (dateString: Date | string | null) => {
        if (!dateString) return "Sin agendar";
        try {
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return "Fecha inválida";
          const zonedDate = toZonedTime(date, TIMEZONE);
          return format(zonedDate, "dd/MM/yyyy", { locale: es });
        } catch {
          return "Error fecha";
        }
      };

      const formatTimeBogota = (dateString: Date | string | null) => {
        if (!dateString) return "--:--";
        try {
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return "--:--";
          const zonedDate = toZonedTime(date, TIMEZONE);
          return format(zonedDate, "hh:mm a", { locale: es });
        } catch {
          return "--:--";
        }
      };

      citas.forEach((cita) => {
        worksheetCitas.addRow({
          nroCita: cita.numeroOrden || `CITA-${cita.id}`,
          tenantNombre: cita.tenantNombre || "",
          paciente: `${cita.cliente?.nombre || ""} ${cita.cliente?.apellido || ""}`.trim(),
          documento: `${cita.cliente?.tipoDocumento || ""} ${cita.cliente?.numeroDocumento || ""}`.trim(),
          telefono: cita.cliente?.telefono || "N/A",
          correo: cita.cliente?.correo || "N/A",
          servicio: cita.servicio.nombre,
          paquete: cita.paqueteNombre || "N/A",
          consultorio: cita.consultorioNombre || "N/A",
          fecha: formatDateBogota(cita.fechaVisita),
          hora: formatTimeBogota(cita.horaInicio),
          psicologo: cita.tecnico ? `${cita.tecnico.nombre} ${cita.tecnico.apellido}` : "Sin asignar",
          estado: cita.realizada ? "Realizada" : "Programada",
          realizada: cita.realizada ? "SÍ" : "NO",
          valor: cita.valorCotizado || 0,
          observaciones: cita.observacion || "",
          creadoPor: cita.creadoPor ? `${cita.creadoPor.nombre} ${cita.creadoPor.apellido}` : "Sistema",
        });
      });

      // Style header row
      const headerRowCitas = worksheetCitas.getRow(1);
      headerRowCitas.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "4F81BD" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Style data rows
      worksheetCitas.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
            cell.alignment = { vertical: "middle", wrapText: true };
          });
        }
      });
    }

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(
      blob,
      `${filenamePrefix}_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const handleExportExcel = async () => {
    if (roleLoading) {
      toast.info("Verificando permisos...");
      return;
    }

    if (role !== "SU_ADMIN" && !canDownloadExcel) {
        if (excelPermissionStatus?.estado === "PENDIENTE") {
             toast.info("Ya hay una solicitud pendiente para exportar Excel.");
        } else {
             handleRequestExcelPermission();
        }
        return;
    }

    if (role === "SU_ADMIN") {
      setIsExportModalOpen(true);
    } else {
      setIsExporting(true);
      const token = localStorage.getItem("token");
      if (!token) {
        setIsExporting(false);
        return;
      }

      const filters = {
        term: debouncedSearchTerm,
        empresaId: selectedEmpresa,
        tipoServicioId: selectedTipoServicio,
        creadorId: selectedCreador,
        tecnicoId: selectedTecnico,
        metodoPagoId: selectedMetodoPago,
        estado: selectedEstado.length > 0 ? selectedEstado.join(",") : "all",
        municipio: selectedMunicipio,
        startDate,
        endDate,
      };

      const res = await getAllOrdenesServicioForExport(token, filters);

      if (res.error) {
        toast.error(res.error);
      } else if (res.ordenes) {
        await generateAndDownloadExcel(
          res.ordenes as unknown as OrdenServicio[],
          "Reporte_Servicios"
        );
      }
      setIsExporting(false);
    }
  };

  const handleConfirmExport = async () => {
    setIsExporting(true);
    const token = localStorage.getItem("token");
    if (!token) {
      setIsExporting(false);
      return;
    }

    const [res, resCitas] = await Promise.all([
      getAllOrdenesServicioForExport(token, {
        startDate: exportStartDate,
        endDate: exportEndDate,
        tenantId: exportTenantId,
      }),
      (exportTenantId === "all" || exportTenantId === "4")
        ? getAllCitasForExport(token, {
            startDate: exportStartDate,
            endDate: exportEndDate,
            tenantId: exportTenantId === "all" ? "all" : "4",
          })
        : Promise.resolve({ ordenes: [], error: undefined as string | undefined })
    ]);

    if (res.error) {
      toast.error(res.error);
    } else {
      if (resCitas.error) {
        toast.error("Aviso: No se pudieron cargar las citas de psicología");
      }
      await generateAndDownloadExcel(
        (res.ordenes || []) as unknown as OrdenServicio[],
        "Reporte_General_Servicios",
        resCitas.ordenes
      );
      setIsExportModalOpen(false);
    }
    setIsExporting(false);
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "SERVICIO_NUEVO":
        return <Badge variant="secondary">Nuevo</Badge>;
      case "PROGRAMADO":
        return (
          <Badge className="bg-blue-500 hover:bg-blue-600">Programado</Badge>
        );
      case "EN_PROCESO":
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600">
            En Proceso
          </Badge>
        );
      case "SERVICIO_LISTO":
        return (
          <Badge className="bg-green-500 hover:bg-green-600">Finalizado</Badge>
        );
      case "CANCELADO":
        return (
          <Badge className="font-white bg-red-600 font-black">Cancelado</Badge>
        );
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Órdenes de Servicio
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Gestiona los servicios programados y realizados
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowKPIs(!showKPIs)}
              className="gap-2"
              title={showKPIs ? "Ocultar indicadores" : "Mostrar indicadores"}
            >
              {showKPIs ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {showKPIs ? "Ocultar KPIs" : "Mostrar KPIs"}
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={handleExportExcel}
              className="gap-2"
              disabled={roleLoading || isExporting}
            >
              {roleLoading || isExporting ? (
                <div className="h-4 w-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              ) : (!canDownloadExcel && role !== "SU_ADMIN") ? (
                <Lock className="h-4 w-4 text-orange-500" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {(!canDownloadExcel && role !== "SU_ADMIN" && excelPermissionStatus?.estado === "PENDIENTE") ? "Solicitud Pendiente" : "Exportar Excel"}
            </Button>
            <Button
              onClick={() => router.push("/dashboard/servicios/nuevo")}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Orden
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      {stats && showKPIs && (
        <div className="flex-none px-8 py-6 bg-slate-50 border-b border-slate-200 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="max-w-7xl mx-auto grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Órdenes
                </CardTitle>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalOrdenes}</div>
                <p className="text-xs text-muted-foreground">
                  Registradas en el sistema
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Programadas
                </CardTitle>
                <Calendar className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {stats.programadas}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pendientes de visita
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  En Proceso
                </CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {stats.enProceso}
                </div>
                <p className="text-xs text-muted-foreground">
                  Ejecutándose actualmente
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Finalizadas
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {stats.finalizadas}
                </div>
                <p className="text-xs text-muted-foreground">
                  Servicios completados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  No Concretados
                </CardTitle>
                <Trash2 className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {stats.noConcretados}
                </div>
                <p className="text-xs text-muted-foreground">
                  Servicios no realizados
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          
          {/* Fila 1: Búsqueda y Filtros Principales */}
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className="relative w-full md:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar cliente..."
                className="pl-10 bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap md:flex-nowrap gap-2 w-full md:w-auto items-center justify-end">
              <Select value={selectedEmpresa} onValueChange={handleEmpresaChange}>
                <SelectTrigger className="w-full md:w-[200px] bg-white text-xs">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las empresas</SelectItem>
                  {empresas.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedTipoServicio}
                onValueChange={setSelectedTipoServicio}
                disabled={
                  selectedEmpresa === "all" &&
                  filteredTiposServicios.length === tiposServicios.length
                }
              >
                <SelectTrigger className="w-full md:w-[180px] bg-white text-xs">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {filteredTiposServicios.map((tipo) => (
                    <SelectItem key={tipo.id} value={tipo.id.toString()}>
                      {tipo.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fila 2: Filtros Secundarios y Fechas */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedCreador} onValueChange={setSelectedCreador}>
              <SelectTrigger className="w-full md:w-[150px] bg-white text-xs">
                <SelectValue placeholder="Creador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los creadores</SelectItem>
                {creadores.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.nombre} {user.apellido}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedTecnico} onValueChange={setSelectedTecnico}>
              <SelectTrigger className="w-full md:w-[150px] bg-white text-xs">
                <SelectValue placeholder="Técnico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los técnicos</SelectItem>
                <SelectItem value="unassigned">No Concretado</SelectItem>
                {tecnicos.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.nombre} {user.apellido}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Combobox
              options={[
                { value: "all", label: "Todos los municipios" },
                ...Array.from(
                  new Set(municipiosAntioquia.map((m) => m.nombre)),
                ).map((nombre) => ({
                  value: nombre,
                  label: nombre,
                })),
              ]}
              value={selectedMunicipio}
              onChange={setSelectedMunicipio}
              placeholder="Municipio"
              className="text-xs transition-all duration-500 w-full md:w-[150px]"
            />

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full md:w-[150px] justify-between text-xs bg-white font-normal"
                >
                  {selectedEstado.length > 0
                    ? `${selectedEstado.length} seleccionado${
                        selectedEstado.length > 1 ? "s" : ""
                      }`
                    : "Estados"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar estado..." />
                  <CommandList>
                    <CommandEmpty>No encontrado.</CommandEmpty>
                    <CommandGroup>
                      {estadosServicio.map((estado) => {
                        const isSelected = selectedEstado.includes(
                          estado.id.toString()
                        );
                        return (
                          <CommandItem
                            key={estado.id}
                            value={estado.nombre}
                            onSelect={() => {
                              setSelectedEstado((prev) => {
                                const idStr = estado.id.toString();
                                if (prev.includes(idStr)) {
                                  return prev.filter((item) => item !== idStr);
                                } else {
                                  return [...prev, idStr];
                                }
                              });
                            }}
                          >
                            <div
                              className={cn(
                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                isSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "opacity-50 [&_svg]:invisible"
                              )}
                            >
                              <Check className={cn("h-4 w-4")} />
                            </div>
                            <span>{estado.nombre}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                    {selectedEstado.length > 0 && (
                      <>
                        <CommandSeparator />
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => setSelectedEstado([])}
                            className="justify-center text-center"
                          >
                            Limpiar filtros
                          </CommandItem>
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Select value={selectedMetodoPago} onValueChange={setSelectedMetodoPago}>
              <SelectTrigger className="w-full md:w-[200px] bg-white text-xs">
                <SelectValue placeholder="Medio de Pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los medios de pago</SelectItem>
                {metodosPago.map((mp) => (
                  <SelectItem key={mp.id} value={mp.id.toString()}>
                    {mp.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-200 ml-auto">
              <span className="text-[10px] text-slate-500 whitespace-nowrap px-1">
                Fechas:
              </span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[130px] border-0 focus-visible:ring-0 h-7 p-1 text-xs"
              />
              <span className="text-slate-300">-</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[130px] border-0 focus-visible:ring-0 h-7 p-1 text-xs"
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-slate-500 hover:text-red-600 hover:bg-red-50 h-8 px-2 ml-auto md:ml-0"
              title="Borrar filtros"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Borrar
            </Button>
          </div>

        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-hidden bg-slate-50 px-8 py-6 flex flex-col">
        <div className="max-w-7xl mx-auto w-full h-full flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : ordenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <ClipboardList className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron órdenes</p>
              <p className="text-sm">
                Intenta ajustar los filtros o crea una nueva orden
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex-1 overflow-auto relative">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-4">Cliente / Dirección</th>
                      <th className="px-6 py-4">Servicio</th>
                      <th className="px-6 py-4">Programación</th>
                      <th className="px-6 py-4">Tipo Servicio</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenes.map((orden) => (
                      <tr
                        key={orden.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900">
                              {orden.cliente.nombre} {orden.cliente.apellido}
                            </span>
                            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[200px]">
                                {orden.direccionTexto}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-slate-900 font-medium">
                              {orden.servicio.nombre}
                            </span>
                            <span className="text-xs text-slate-500">
                              {orden.empresa?.nombre}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col text-slate-600">
                            {orden.fechaVisita ? (
                              <>
                                <span>
                                  {formatDateUTC(orden.fechaVisita)}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {orden.horaInicio
                                    ? new Date(
                                        orden.horaInicio,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })
                                    : "--:--"}
                                </span>
                              </>
                            ) : (
                              <span className="italic text-slate-400">
                                Sin agendar
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-slate-900 font-medium">
                            {orden.tipoServicio?.nombre || "N/A"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(orden.estado)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Abrir menú</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => handleViewOrden(orden.id)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Ver detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleViewGeo(orden.id)}
                              >
                                <MapIcon className="mr-2 h-4 w-4" />
                                Ver Geolocalización
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(
                                    `/dashboard/servicios/${orden.id}/editar`,
                                  )
                                }
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCopyOrden(orden)}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copiar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleNotifyClient(orden)}
                              >
                                <MessageCircle className="mr-2 h-4 w-4 text-blue-600" />
                                Notificar al Cliente
                              </DropdownMenuItem>
                              {orden.facturaElectronica ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      window.open(orden.facturaElectronica!, "_blank")
                                    }
                                  >
                                    <FileText className="mr-2 h-4 w-4 text-green-600" />
                                    Ver Factura/Orden
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => triggerFileUpload(orden.id, "factura")}
                                  >
                                    <Edit className="mr-2 h-4 w-4 text-orange-600" />
                                    Actualizar Factura
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => triggerFileUpload(orden.id, "factura")}
                                >
                                  <FileText className="mr-2 h-4 w-4 text-purple-600" />
                                  Subir Factura/Orden
                                </DropdownMenuItem>
                              )}
                              {orden.comprobantePago ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      window.open(orden.comprobantePago!, "_blank")
                                    }
                                  >
                                    <FileText className="mr-2 h-4 w-4 text-blue-600" />
                                    Ver Comprobante
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => triggerFileUpload(orden.id, "comprobante")}
                                  >
                                    <Edit className="mr-2 h-4 w-4 text-orange-600" />
                                    Actualizar Comprobante
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => triggerFileUpload(orden.id, "comprobante")}
                                >
                                  <FileText className="mr-2 h-4 w-4 text-teal-600" />
                                  Subir Comprobante
                                </DropdownMenuItem>
                              )}
                              {orden.evidenciaPath ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedOrden(orden);
                                      setIsEvidenceModalOpen(true);
                                    }}
                                  >
                                    <Eye className="mr-2 h-4 w-4 text-blue-600" />
                                    Ver Evidencia
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => triggerFileUpload(orden.id, "evidencia")}
                                  >
                                    <Edit className="mr-2 h-4 w-4 text-orange-600" />
                                    Actualizar Evidencia
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => triggerFileUpload(orden.id, "evidencia")}
                                >
                                  <FileText className="mr-2 h-4 w-4 text-indigo-600" />
                                  Subir Evidencia
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleSendToTechnician(orden)}
                              >
                                <MessageCircle className="mr-2 h-4 w-4 text-green-600" />
                                Enviar al Técnico
                              </DropdownMenuItem>
                              {[2, 5, 7, 8].includes(orden.metodoPago?.id || 0) && orden.estadoPago !== "CONCILIADO" && (
                                <DropdownMenuItem
                                  onClick={() => handleOpenLiquidation(orden)}
                                >
                                  <CheckCircle className="mr-2 h-4 w-4 text-emerald-600" />
                                  Liquidar
                                </DropdownMenuItem>
                              )}
                              {orden.fechaVisita && differenceInDays(new Date(), new Date(orden.fechaVisita)) < 31 && (
                                <DropdownMenuItem
                                  onClick={() => handleOpenReinforcement(orden)}
                                >
                                  <RefreshCw className="mr-2 h-4 w-4 text-blue-600" />
                                  Asignar Refuerzo
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {!isBlockedToDelete && (
                                <DropdownMenuItem
                                  onClick={() => handleDeleteClick(orden.id)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6 rounded-lg shadow-sm">
                  <div className="flex flex-1 justify-between sm:hidden">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                      }
                      disabled={currentPage === 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Siguiente
                    </Button>
                  </div>
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-slate-700">
                        Mostrando{" "}
                        <span className="font-medium">
                          {(currentPage - 1) * itemsPerPage + 1}
                        </span>{" "}
                        a{" "}
                        <span className="font-medium">
                          {Math.min(currentPage * itemsPerPage, totalRecords)}
                        </span>{" "}
                        de <span className="font-medium">{totalRecords}</span>{" "}
                        resultados
                      </p>
                    </div>
                    <div>
                      <nav
                        className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                        aria-label="Pagination"
                      >
                        <Button
                          variant="outline"
                          className="rounded-l-md px-2 py-2"
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                        >
                          <span className="sr-only">Primera</span>
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          className="px-2 py-2"
                          onClick={() =>
                            setCurrentPage((prev) => Math.max(prev - 1, 1))
                          }
                          disabled={currentPage === 1}
                        >
                          <span className="sr-only">Anterior</span>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center px-4 border-y border-slate-200 bg-white text-sm font-medium text-slate-700">
                          Página {currentPage} de {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          className="px-2 py-2"
                          onClick={() =>
                            setCurrentPage((prev) =>
                              Math.min(prev + 1, totalPages),
                            )
                          }
                          disabled={currentPage === totalPages}
                        >
                          <span className="sr-only">Siguiente</span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-r-md px-2 py-2"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          <span className="sr-only">Última</span>
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de Detalle Completo */}
      <Dialog open={isGeoModalOpen} onOpenChange={handleCloseGeoModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Geolocalización del Servicio</DialogTitle>
            <DialogDescription>
              Registro de visitas y ubicación del técnico
            </DialogDescription>
          </DialogHeader>

          {selectedOrden && (
            <div className="space-y-6 mt-2">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <MapPin className="h-4 w-4" />
                <span>{selectedOrden.direccionTexto}</span>
              </div>

              {!selectedOrden.geolocalizaciones ||
              selectedOrden.geolocalizaciones.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <MapIcon className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-slate-500 font-medium">
                    No hay registros de geolocalización
                  </p>
                  <p className="text-xs text-slate-400">
                    El técnico aún no ha iniciado el servicio o no ha registrado
                    su ubicación.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {selectedOrden.geolocalizaciones.map((geo, index) => (
                    <Card key={geo.id} className="overflow-hidden">
                      <CardHeader className="bg-slate-50 py-3 border-b">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-sm font-medium">
                            Visita #{index + 1}
                          </CardTitle>
                          <span className="text-xs text-slate-500">
                            {new Date(geo.llegada).toLocaleDateString()}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Tiempos y Coordenadas */}
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                                <span className="text-xs text-green-600 block mb-1 font-medium">
                                  Llegada
                                </span>
                                <span className="text-sm font-bold text-slate-700">
                                  {new Date(geo.llegada).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true,
                                  })}
                                </span>
                              </div>
                              <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                <span className="text-xs text-red-600 block mb-1 font-medium">
                                  Salida
                                </span>
                                <span className="text-sm font-bold text-slate-700">
                                  {geo.salida
                                    ? new Date(geo.salida).toLocaleTimeString(
                                        [],
                                        {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: true,
                                        },
                                      )
                                    : "--:--"}
                                </span>
                              </div>
                            </div>

                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                              <span className="text-xs text-slate-500 block mb-1">
                                Coordenadas
                              </span>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-slate-700">
                                  {geo.latitud && geo.longitud
                                    ? `${Number(geo.latitud).toFixed(6)}, ${Number(geo.longitud).toFixed(6)}`
                                    : "No registradas"}
                                </span>
                                {geo.latitud && geo.longitud && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() =>
                                      window.open(
                                        `https://www.google.com/maps/search/?api=1&query=${geo.latitud},${geo.longitud}`,
                                        "_blank",
                                      )
                                    }
                                  >
                                    <MapIcon className="h-3 w-3" />
                                    Ver en Mapa
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Fotos */}
                          <div className="space-y-2">
                            <span className="text-xs font-medium text-slate-500 block">
                              Evidencia Fotográfica
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              {geo.fotoLlegada ? (
                                <div className="group relative aspect-square bg-slate-100 rounded-md overflow-hidden border border-slate-200">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={geo.fotoLlegada}
                                    alt="Llegada"
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="h-8 text-xs"
                                      onClick={() =>
                                        window.open(geo.fotoLlegada!, "_blank")
                                      }
                                    >
                                      Ver Llegada
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="aspect-square bg-slate-50 rounded-md border border-slate-200 border-dashed flex flex-col items-center justify-center text-slate-400">
                                  <span className="text-xs">Sin foto llegada</span>
                                </div>
                              )}

                              {geo.fotoSalida ? (
                                <div className="group relative aspect-square bg-slate-100 rounded-md overflow-hidden border border-slate-200">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={geo.fotoSalida}
                                    alt="Salida"
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="h-8 text-xs"
                                      onClick={() =>
                                        window.open(geo.fotoSalida!, "_blank")
                                      }
                                    >
                                      Ver Salida
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="aspect-square bg-slate-50 rounded-md border border-slate-200 border-dashed flex flex-col items-center justify-center text-slate-400">
                                  <span className="text-xs">Sin foto salida</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Detalle Completo */}
      <Dialog open={isViewModalOpen} onOpenChange={handleCloseViewModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle Completo de Orden</DialogTitle>
            <DialogDescription>
              Información detallada del servicio registrado
            </DialogDescription>
          </DialogHeader>

          {selectedOrden && (
            <div className="space-y-6 mt-2">
              {/* 1. Información General */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                  Información General
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-xs text-slate-500 block">
                      ID Servicio
                    </span>
                    <span className="font-medium">#{selectedOrden.id}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Número Orden
                    </span>
                    <span className="font-medium">
                      {selectedOrden.numeroOrden || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Estado Actual
                    </span>
                    <div className="mt-0.5">
                      {getStatusBadge(selectedOrden.estado)}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Fecha Creación
                    </span>
                    <span className="font-medium text-sm">
                      {new Date(selectedOrden.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Creado Por
                    </span>
                    <span className="font-medium text-sm">
                      {selectedOrden.creadoPor
                        ? `${selectedOrden.creadoPor.nombre} ${selectedOrden.creadoPor.apellido}`
                        : "Sistema"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Cliente y Contacto */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                  Cliente y Contacto
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="col-span-1 md:col-span-2">
                    <span className="text-xs text-slate-500 block">
                      Nombre Completo
                    </span>
                    <span className="font-medium text-base">
                      {selectedOrden.cliente?.nombre}{" "}
                      {selectedOrden.cliente?.apellido}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Documento
                    </span>
                    <span className="font-medium">
                      {selectedOrden.cliente?.tipoDocumento}{" "}
                      {selectedOrden.cliente?.numeroDocumento}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Teléfono
                    </span>
                    <span className="font-medium">
                      {selectedOrden.cliente?.telefono}
                    </span>
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <span className="text-xs text-slate-500 block">
                      Correo Electrónico
                    </span>
                    <span className="font-medium text-sm">
                      {selectedOrden.cliente?.correo || "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Ubicación del Servicio */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                  Ubicación del Servicio
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <span className="text-xs text-slate-500 block">
                      {selectedOrden.vehiculoId && !selectedOrden.municipio
                        ? "Vehículo"
                        : "Dirección Principal"}
                    </span>
                    <span className="font-medium text-base flex items-center gap-2">
                      {selectedOrden.vehiculoId && !selectedOrden.municipio ? (
                        <Car className="h-4 w-4 text-purple-500" />
                      ) : (
                        <MapPin className="h-4 w-4 text-blue-500" />
                      )}
                      {selectedOrden.direccionTexto}
                    </span>
                    {selectedOrden.linkMaps && selectedOrden.linkMaps !== "No Concretado" && (
                      <div className="mt-2">
                        <a 
                          href={selectedOrden.linkMaps.startsWith('http') ? selectedOrden.linkMaps : `https://${selectedOrden.linkMaps}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Ver en Google Maps
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Detalles de la Dirección */}
                  {selectedOrden.municipio && (
                    <>
                      <div>
                        <span className="text-xs text-slate-500 block">
                          Municipio / Depto
                        </span>
                        <span className="font-medium">
                          {selectedOrden.municipio || "N/A"}
                          {selectedOrden.departamento &&
                            `, ${selectedOrden.departamento}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">
                          Zona
                        </span>
                        <span className="font-medium">
                          {selectedOrden.zona?.nombre || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">
                          Barrio
                        </span>
                        <span className="font-medium">
                          {selectedOrden.barrio || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">
                          Detalles Interior
                        </span>
                        <span className="text-sm font-medium">
                          {[
                            selectedOrden.bloque &&
                              `Bloque: ${selectedOrden.bloque}`,
                            selectedOrden.piso && `Piso: ${selectedOrden.piso}`,
                            selectedOrden.unidad &&
                              `Unidad: ${selectedOrden.unidad}`,
                          ]
                            .filter(Boolean)
                            .join(" - ") || "Sin detalles"}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Detalles del Vehículo */}
                  {selectedOrden.vehiculoId && selectedOrden.vehiculo && (
                    <>
                      {selectedOrden.municipio && (
                        <div className="md:col-span-2 border-t pt-2 mt-2">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Información del Vehículo
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-slate-500 block">
                          Placa / Marca / Modelo
                        </span>
                        <span className="font-medium">
                          {selectedOrden.vehiculo.placa}{" "}
                          {selectedOrden.vehiculo.marca && ` - ${selectedOrden.vehiculo.marca}`}
                          {selectedOrden.vehiculo.modelo && ` - ${selectedOrden.vehiculo.modelo}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">
                          Color / Tipo
                        </span>
                        <span className="font-medium">
                          {selectedOrden.vehiculo.color || "N/A"}{" "}
                          {selectedOrden.vehiculo.tipo &&
                            `- ${selectedOrden.vehiculo.tipo}`}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 4. Detalle del Servicio */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                  Detalle del Servicio
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Empresa
                    </span>
                    <span className="font-medium">
                      {selectedOrden.empresa?.nombre || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Tipo de Servicio
                    </span>
                    <span className="font-medium">
                      {selectedOrden.tipoServicio?.nombre || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Servicio Específico
                    </span>
                    <span className="font-medium">
                      {selectedOrden.servicio?.nombre || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Técnico Asignado
                    </span>
                    <span className="font-medium">
                      {selectedOrden.tecnico ? (
                        `${selectedOrden.tecnico.nombre} ${selectedOrden.tecnico.apellido}`
                      ) : (
                        <span className="text-orange-500 italic">
                          Sin asignar
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Programación */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                  Programación
                </h3>
                <div className="grid grid-cols-3 gap-4 bg-blue-50 p-3 rounded-lg">
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Fecha de Visita
                    </span>
                    <span className="font-medium">
                      {formatDateUTC(selectedOrden.fechaVisita)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Hora Inicio
                    </span>
                    <span className="font-medium">
                      {selectedOrden.horaInicio
                        ? new Date(selectedOrden.horaInicio).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            },
                          )
                        : "--:--"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Hora Fin
                    </span>
                    <span className="font-medium">
                      {selectedOrden.horaFin
                        ? new Date(selectedOrden.horaFin).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            },
                          )
                        : "--:--"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 6. Condiciones y Observaciones */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                  Estado y Observaciones
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Nivel Infestación
                    </span>
                    <span className="font-medium">
                      {selectedOrden.nivelInfestacion || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Cond. Higiene
                    </span>
                    <span className="font-medium">
                      {selectedOrden.condicionesHigiene || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Cond. Local
                    </span>
                    <span className="font-medium">
                      {selectedOrden.condicionesLocal || "N/A"}
                    </span>
                  </div>
                  <div className="col-span-1 md:col-span-3">
                    <span className="text-xs text-slate-500 block mb-1">
                      Observaciones Generales
                    </span>
                    <p className="text-sm bg-slate-50 p-3 rounded-md border border-slate-100 min-h-[60px]">
                      {selectedOrden.observacion ||
                        "Sin observaciones registradas."}
                    </p>
                  </div>
                  <div className="col-span-1 md:col-span-3">
                    <span className="text-xs text-slate-500 block mb-1">
                      Observación Final
                    </span>
                    <p className="text-sm bg-slate-50 p-3 rounded-md border border-slate-100 min-h-[60px]">
                      {selectedOrden.observacionFinal ||
                        "Sin observación final registrada."}
                    </p>
                  </div>
                </div>
              </div>

              {/* 7. Información Financiera */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                  Información Financiera
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Valor Cotizado
                    </span>
                    <span className="font-bold text-slate-900">
                      {selectedOrden.valorCotizado
                        ? new Intl.NumberFormat("es-CO", {
                            style: "currency",
                            currency: "COP",
                          }).format(selectedOrden.valorCotizado)
                        : "$ 0"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Valor Repuestos
                    </span>
                    <span className="font-medium">
                      {selectedOrden.valorRepuestos
                        ? new Intl.NumberFormat("es-CO", {
                            style: "currency",
                            currency: "COP",
                          }).format(selectedOrden.valorRepuestos)
                        : "$ 0"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Valor Pagado
                    </span>
                    <span className="font-medium text-green-600">
                      {selectedOrden.valorPagado
                        ? new Intl.NumberFormat("es-CO", {
                            style: "currency",
                            currency: "COP",
                          }).format(selectedOrden.valorPagado)
                        : "$ 0"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Método de Pago
                    </span>
                    <span className="font-medium">
                      {selectedOrden.metodoPago?.nombre || "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 8. Factura / Evidencia */}
              {selectedOrden.facturaPath && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                    Factura del Servicio
                  </h3>
                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex justify-center p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedOrden.facturaPath}
                      alt="Evidencia del servicio"
                      className="max-w-full h-auto max-h-[500px] object-contain rounded"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() =>
                        window.open(selectedOrden.facturaPath!, "_blank")
                      }
                    >
                      <Download className="h-4 w-4" />
                      Ver original
                    </Button>
                  </div>
                </div>
              )}

              {/* 9. Factura/Orden */}
              {selectedOrden.facturaElectronica && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                    Factura/Orden
                  </h3>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() =>
                        window.open(selectedOrden.facturaElectronica!, "_blank")
                      }
                    >
                      <FileText className="h-4 w-4" />
                      Ver Factura/Orden
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Exportación SU_ADMIN */}
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar Reporte General</DialogTitle>
            <DialogDescription>
              Selecciona el rango de fechas y el sistema para generar el
              reporte.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="startDate" className="text-sm font-medium">
                Fecha Inicio
              </label>
              <Input
                id="startDate"
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="endDate" className="text-sm font-medium">
                Fecha Fin
              </label>
              <Input
                id="endDate"
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="tenant" className="text-sm font-medium">
                Sistema (Tenant)
              </label>
              <Select value={exportTenantId} onValueChange={setExportTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sistema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los sistemas</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id.toString()}>
                      {tenant.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsExportModalOpen(false)}
              disabled={isExporting}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Descargar Excel
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Eliminación */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Estás seguro?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente
              la orden de servicio.
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

      {/* Modal de Evidencia */}
      <Dialog open={isEvidenceModalOpen} onOpenChange={(open) => {
        setIsEvidenceModalOpen(open);
        if (!open) setSelectedOrden(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Evidencia del Servicio</DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-slate-50 rounded-lg min-h-[200px]">
            {selectedOrden?.evidenciaPath ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedOrden.evidenciaPath.split(',').map((url, index) => (
                  <div key={index} className="relative group aspect-square bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={url.trim()} 
                      alt={`Evidencia ${index + 1}`} 
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(url.trim(), "_blank")}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Ver original
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-500">No hay evidencia para mostrar.</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-start">
             {selectedOrden?.evidenciaPath && selectedOrden.evidenciaPath.split(',').length === 1 && (
               <Button onClick={() => window.open(selectedOrden.evidenciaPath!, "_blank")} variant="outline" className="w-full sm:w-auto">
                 <ExternalLink className="w-4 h-4 mr-2" />
                 Abrir en nueva pestaña
               </Button>
             )}
             <Button variant="ghost" onClick={() => setIsEvidenceModalOpen(false)} className="w-full sm:w-auto">
               Cerrar
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Input de archivos oculto para subidas */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
      />

      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Solicitar Permiso de Exportación</DialogTitle>
                <DialogDescription>
                    La descarga de reportes requiere autorización administrativa. Por favor indique el motivo.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
                <Label>Motivo de la solicitud</Label>
                <Textarea 
                    placeholder="Ej. Auditoría mensual, reporte de ventas..." 
                    value={requestMotivo}
                    onChange={(e) => setRequestMotivo(e.target.value)}
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsRequestDialogOpen(false)}>Cancelar</Button>
                <Button onClick={submitPermissionRequest} disabled={sendingRequest}>
                    {sendingRequest ? "Enviando..." : "Enviar Solicitud"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReinforcementModalOpen} onOpenChange={setIsReinforcementModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Asignar Refuerzo</DialogTitle>
            <DialogDescription>
              Crear orden de refuerzo para {selectedOrdenForReinforcement?.cliente.nombre} {selectedOrdenForReinforcement?.cliente.apellido}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="refuerzo-date" className="text-right">
                Fecha
              </Label>
              <Input
                id="refuerzo-date"
                type="datetime-local"
                className="col-span-3"
                value={newRefuerzoDate}
                onChange={(e) => setNewRefuerzoDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="refuerzo-amount" className="text-right">
                Monto
              </Label>
              <Input
                id="refuerzo-amount"
                type="number"
                placeholder="0.00"
                className="col-span-3"
                value={newRefuerzoAmount}
                onChange={(e) => setNewRefuerzoAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReinforcementModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmReinforcement} disabled={processingReinforcement}>
              {processingReinforcement ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLiquidationModalOpen} onOpenChange={setIsLiquidationModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Liquidar Transferencia</DialogTitle>
            <DialogDescription>
              Confirme los datos de la transferencia bancaria recibida.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="liq-date" className="text-right">
                Fecha Transacción
              </Label>
              <Input
                id="liq-date"
                type="date"
                className="col-span-3"
                value={liquidationDate}
                onChange={(e) => setLiquidationDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="liq-amount" className="text-right">
                Monto
              </Label>
              <Input
                id="liq-amount"
                type="number"
                placeholder="0.00"
                className="col-span-3"
                value={liquidationAmount}
                onChange={(e) => setLiquidationAmount(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="liq-bank" className="text-right">
                Banco Origen
              </Label>
              <Input
                id="liq-bank"
                placeholder="Ej. Bancolombia, Nequi..."
                className="col-span-3"
                value={liquidationBank}
                onChange={(e) => setLiquidationBank(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="liq-ref" className="text-right">
                Referencia
              </Label>
              <Input
                id="liq-ref"
                placeholder="Nro. Comprobante"
                className="col-span-3"
                value={liquidationRef}
                onChange={(e) => setLiquidationRef(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="liq-file" className="text-right">
                Comprobante
              </Label>
              <Input
                id="liq-file"
                type="file"
                accept="image/*,.pdf"
                className="col-span-3 text-xs"
                onChange={(e) => setLiquidationFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="liq-obs" className="text-right">
                Observación
              </Label>
              <Textarea
                id="liq-obs"
                placeholder="Detalles adicionales..."
                className="col-span-3"
                value={liquidationObs}
                onChange={(e) => setLiquidationObs(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLiquidationModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmLiquidation} disabled={isLiquidating} className="bg-emerald-600 hover:bg-emerald-700">
              {isLiquidating ? "Liquidando..." : "Confirmar Liquidación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
