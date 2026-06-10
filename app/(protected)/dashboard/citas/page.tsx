"use client";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Trash2,
  Eye,
  EyeOff,
  Edit,
  MoreHorizontal,
  Copy,
  FileText,
  Package,
  CheckCircle,
  Download,
  Lock,
  ClipboardList,
  Calendar,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";

const TIMEZONE = "America/Bogota";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  getCitas,
  deleteCita,
  getCitasStats,
  getCita,
  getFormDataCitas,
  uploadComprobantePagoCita,
  markCitaAsRealizada,
  markCitaAsCancelada,
  toggleCitaPago,
  updateCitaPago,
  getAllCitasForExport,
  getTenantsList,
} from "./actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Image from "next/image";
import type { 
  PaqueteAdquirido, 
  TerapiasPsicologos, 
  Permiso 
} from "@/prisma/generated/prisma/client";
import { EstadoPagoOrden } from "@/prisma/generated/prisma/enums";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useUserRole } from "@/hooks/use-user-role";
import { checkPermission, requestPermission, getMyPermissionStatus } from "@/app/(protected)/dashboard/configuracion/permisos/actions";

type PaqueteCita = PaqueteAdquirido & {
  TerapiasPsicologos: TerapiasPsicologos;
  precioPagado: number;
  sesionesRealizadas?: number | null;
};

// Interfaces adaptadas
interface Cita {
  id: number;
  numeroOrden: string | null;
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
  tecnico: { nombre: string; apellido: string } | null; // Psicólogo
  empresa: { id: number; nombre: string } | null;
  tipoServicio: { id: number; nombre: string } | null;
  creadoPor: { nombre: string; apellido: string } | null;
  estado: string;
  realizada: boolean | null;
  fechaVisita: Date | string | null;
  horaInicio: Date | string | null;
  valorCotizado: number | null;
  observacion: string | null;
  tenantNombre?: string | null;
  createdAt: Date | string;
  comprobantePath?: string | null; // CitasPsicologos field
  metodoPago?: string | null;
  estadoPago?: EstadoPagoOrden | null;
  PaqueteAdquirido?: PaqueteCita | null;
  consultorioNombre?: string | null;
  paqueteNombre?: string | null;
}

interface Stats {
  totalOrdenes: number;
  programadas: number;
  realizadas: number;
  alquiler: number;
  paquetes: number;
  totalMes: number;
  realizadasMes: number;
  alquilerMes: number;
  paquetesMes: number;
}

type EstadoPagoFilter = EstadoPagoOrden | "all";

const formatDateBogota = (dateString: Date | string | null, formatStr: string = "dd/MM/yyyy") => {
  if (!dateString) return "Sin agendar";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Fecha inválida";
    const zonedDate = toZonedTime(date, TIMEZONE);
    return format(zonedDate, formatStr, { locale: es });
  } catch (error) {
    console.error("Error formatting date:", error);
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

const getSesionesRealizadas = (paquete?: PaqueteCita | null) => {
  if (!paquete) return 0;

  const realizadas = paquete.sesionesRealizadas ?? 0;

  return Math.max(0, Math.min(paquete.sesionesTotales, realizadas));
};

const getSesionesBadgeClass = (paquete: PaqueteCita) => {
  const sesionesRealizadas = getSesionesRealizadas(paquete);

  return sesionesRealizadas >= paquete.sesionesTotales
    ? "bg-green-100 text-green-700"
    : "bg-blue-50 text-blue-700";
};

export default function CitasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { role, loading: roleLoading } = useUserRole();

  // Permission State
  const [canDownloadExcel, setCanDownloadExcel] = useState(false);
  const [excelPermissionStatus, setExcelPermissionStatus] = useState<Permiso | null>(null);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [requestMotivo, setRequestMotivo] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);

  const [showKPIs, setShowKPIs] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem("showKPIs_citas");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem("showKPIs_citas", showKPIs.toString());
  }, [showKPIs]);

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCitaId, setUploadingCitaId] = useState<number | null>(null);

  // Export states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportTenantId, setExportTenantId] = useState("all");
  const [tenants, setTenants] = useState<{ id: number; nombre: string }[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const termParam = searchParams.get("term");

  const getInitialFilters = () => {
    const defaultFilters = {
      term: "",
      psicologo: "all",
      consultorio: "all",
      paquete: "all",
      estadoPago: "all" as EstadoPagoFilter,
      start: "",
      end: "",
    };

    if (typeof window === "undefined") return defaultFilters;
    
    const saved = localStorage.getItem("citasFilters");
    let parsed = { ...defaultFilters };
    
    if (saved) {
      try {
        parsed = { ...parsed, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Error parsing filters", e);
      }
    }

    if (termParam) {
      parsed.term = termParam;
    }

    return parsed;
  };

  const initialFilters = getInitialFilters();

  // Filter states
  const [searchTerm, setSearchTerm] = useState(initialFilters.term);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialFilters.term);
  const [selectedPsicologo, setSelectedPsicologo] = useState(initialFilters.psicologo);
  const [selectedConsultorio, setSelectedConsultorio] = useState(initialFilters.consultorio);
  const [selectedPaquete, setSelectedPaquete] = useState(initialFilters.paquete);
  const [selectedEstadoPago, setSelectedEstadoPago] = useState<EstadoPagoFilter>(initialFilters.estadoPago);
  const [startDate, setStartDate] = useState(initialFilters.start);
  const [endDate, setEndDate] = useState(initialFilters.end);

  const currentPage = Number(searchParams.get("page")) || 1;
  const itemsPerPage = 10;

  const [citas, setCitas] = useState<Cita[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [isRestored, setIsRestored] = useState(false);

  // Aux Data
  const [psicologos, setPsicologos] = useState<{id: number, nombre: string, apellido: string}[]>([]);
  const [consultorios, setConsultorios] = useState<{id: number, nombre: string}[]>([]);
  const [terapias, setTerapias] = useState<{id: number, nombre: string}[]>([]);
  const [metodosPago, setMetodosPago] = useState<{id: number, nombre: string}[]>([]);

  // Modals
  const [selectedCita, setSelectedCita] = useState<Cita | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentCita, setPaymentCita] = useState<Cita | null>(null);
  const [newMetodoPago, setNewMetodoPago] = useState("");
  const [newEstadoPago, setNewEstadoPago] = useState<EstadoPagoOrden>(EstadoPagoOrden.PENDIENTE);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
  const [citaToDelete, setCitaToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync termParam if it changes after mount
  const [prevTermParam, setPrevTermParam] = useState(termParam);
  if (termParam !== prevTermParam) {
    setPrevTermParam(termParam);
    if (termParam) {
      setSearchTerm(termParam);
      setDebouncedSearchTerm(termParam);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsRestored(true);
  }, []);

  // Save filters to localStorage on change
  useEffect(() => {
    if (!isRestored) return;
    const filters = {
      term: debouncedSearchTerm,
      psicologo: selectedPsicologo,
      consultorio: selectedConsultorio,
      paquete: selectedPaquete,
      estadoPago: selectedEstadoPago,
      start: startDate,
      end: endDate,
    };
    localStorage.setItem("citasFilters", JSON.stringify(filters));
  }, [debouncedSearchTerm, selectedPsicologo, selectedConsultorio, selectedPaquete, selectedEstadoPago, startDate, endDate, isRestored]);

  // Sync URL (Pagination only)
  useEffect(() => {
    const params = new URLSearchParams();
    if (currentPage > 1) {
      params.set("page", currentPage.toString());
    }
    router.replace(`${pathname}?${params.toString()}`);
  }, [currentPage, pathname, router]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setSelectedPsicologo("all");
    setSelectedConsultorio("all");
    setSelectedPaquete("all");
    setSelectedEstadoPago("all");
    setStartDate("");
    setEndDate("");

    localStorage.removeItem("citasFilters");
    router.replace(pathname); // Clears page param too
  };

  const fetchCitasData = useCallback(async () => {
    if (!isRestored) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const filters = {
      term: debouncedSearchTerm,
      psicologoId: selectedPsicologo,
      consultorioId: selectedConsultorio,
      paqueteId: selectedPaquete,
      estadoPago: selectedEstadoPago,
      startDate,
      endDate,
    };

    const result = await getCitas(token, currentPage, itemsPerPage, filters);
    if (result.error) {
      toast.error(result.error);
    } else if (result.ordenes) {
      setCitas(result.ordenes as unknown as Cita[]);
      setTotalPages(result.totalPages || 1);
      setTotalRecords(result.total || 0);
    }
    setLoading(false);
  }, [currentPage, debouncedSearchTerm, selectedPsicologo, selectedConsultorio, selectedPaquete, selectedEstadoPago, startDate, endDate, router, isRestored]);

  const fetchAux = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const statsRes = await getCitasStats(token);
    if (statsRes.stats) setStats(statsRes.stats);

    const formRes = await getFormDataCitas(token);
    if (formRes && !formRes.error) {
      setPsicologos((formRes.tecnicos as { id: number; nombre: string; apellido: string }[]) || []); // tecnicos are psicologos here
      setConsultorios(formRes.consultorios as {id: number, nombre: string}[] || []);
      setTerapias(formRes.terapias as {id: number, nombre: string}[] || []);
      setMetodosPago((formRes.metodosPago as { id: number; nombre: string }[]) || []);
    }
  }, []);

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

  const generateAndDownloadExcel = async (
    dataToExport: Cita[],
    filenamePrefix: string,
  ) => {
    if (dataToExport.length === 0) {
      toast.error("No hay datos para exportar");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Citas");

    // Define columns
    const columns: Partial<ExcelJS.Column>[] = [
      { header: "Nro. Cita", key: "nroCita", width: 15 },
      { header: "Paciente", key: "paciente", width: 25 },
      { header: "Documento", key: "documento", width: 20 },
      { header: "Teléfono", key: "telefono", width: 15 },
      { header: "Correo", key: "correo", width: 25 },
      { header: "Paquete", key: "paquete", width: 25 },
      { header: "Valor x Sesión", key: "valorSesion", width: 15 },
      { header: "Sesiones Realizadas", key: "sesionesRealizadas", width: 18 },
      { header: "Consultorio", key: "consultorio", width: 20 },
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "Hora", key: "hora", width: 15 },
      { header: "Psicólogo", key: "psicologo", width: 25 },
      { header: "Estado", key: "estado", width: 15 },
      { header: "Realizada", key: "realizada", width: 12 },
      { header: "Método Pago", key: "metodoPago", width: 15 },
      { header: "Estado Pago", key: "estadoPago", width: 15 },
      { header: "Valor", key: "valor", width: 15 },
      { header: "Observaciones", key: "observaciones", width: 30 },
      { header: "Creado Por", key: "creadoPor", width: 25 },
    ];

    // Add Tenant column if it exists in data (for SU_ADMIN exports)
    if (dataToExport.some((d) => d.tenantNombre)) {
      columns.splice(1, 0, {
        header: "Sistema (Tenant)",
        key: "tenantNombre",
        width: 20,
      });
    }

    worksheet.columns = columns;

    // Add rows
    dataToExport.forEach((cita) => {
      worksheet.addRow({
        nroCita: cita.numeroOrden || `CITA-${cita.id}`,
        tenantNombre: cita.tenantNombre || "",
        paciente: `${cita.cliente?.nombre || ""} ${cita.cliente?.apellido || ""}`.trim(),
        documento: `${cita.cliente?.tipoDocumento || ""} ${cita.cliente?.numeroDocumento || ""}`.trim(),
        telefono: cita.cliente?.telefono || "N/A",
        correo: cita.cliente?.correo || "N/A",
        paquete: cita.paqueteNombre || "N/A",
        valorSesion: cita.PaqueteAdquirido ? (cita.PaqueteAdquirido.precioPagado / cita.PaqueteAdquirido.sesionesTotales) : 0,
        sesionesRealizadas: cita.PaqueteAdquirido ? `${getSesionesRealizadas(cita.PaqueteAdquirido)} / ${cita.PaqueteAdquirido.sesionesTotales}` : "N/A",
        consultorio: cita.consultorioNombre || "N/A",
        fecha: formatDateBogota(cita.fechaVisita),
        hora: formatTimeBogota(cita.horaInicio),
        psicologo: cita.tecnico ? `${cita.tecnico.nombre} ${cita.tecnico.apellido}` : "Sin asignar",
        estado: cita.realizada ? "Realizada" : "Programada",
        realizada: cita.realizada ? "SÍ" : "NO",
        metodoPago: cita.metodoPago || "N/A",
        estadoPago: cita.estadoPago || "PENDIENTE",
        valor: cita.valorCotizado || 0,
        observaciones: cita.observacion || "",
        creadoPor: cita.creadoPor ? `${cita.creadoPor.nombre} ${cita.creadoPor.apellido}` : "Sistema",
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
        psicologoId: selectedPsicologo,
        consultorioId: selectedConsultorio,
        paqueteId: selectedPaquete,
        estadoPago: selectedEstadoPago,
        startDate,
        endDate,
      };

      const res = await getAllCitasForExport(token, filters);

      if (res.error) {
        toast.error(res.error);
      } else if (res.ordenes) {
        await generateAndDownloadExcel(
          res.ordenes as unknown as Cita[],
          "Reporte_Citas"
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

    const res = await getAllCitasForExport(token, {
      startDate: exportStartDate,
      endDate: exportEndDate,
      tenantId: exportTenantId,
      estadoPago: selectedEstadoPago,
    });

    if (res.error) {
      toast.error(res.error);
    } else if (res.ordenes) {
      await generateAndDownloadExcel(
        res.ordenes as unknown as Cita[],
        "Reporte_General_Citas",
      );
      setIsExportModalOpen(false);
    }
    setIsExporting(false);
  };

  useEffect(() => { 
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCitasData(); 
  }, [fetchCitasData]);
  useEffect(() => { 
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAux(); 
  }, [fetchAux]);

  const handleDeleteClick = (id: number) => {
    setCitaToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!citaToDelete) return;
    setIsDeleting(true);
    const token = localStorage.getItem("token");
    if (token) {
      const res = await deleteCita(token, citaToDelete);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
        fetchCitasData();
        fetchAux(); // update stats
      }
    }
    setIsDeleting(false);
    setIsDeleteModalOpen(false);
  };

  const handleViewCita = async (id: number) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const res = await getCita(token, id);
    if (res.orden) {
      setSelectedCita(res.orden as unknown as Cita);
      setIsViewModalOpen(true);
    } else {
      toast.error(res.error);
    }
  };

  const handleEditPayment = (cita: Cita) => {
      setPaymentCita(cita);
      setNewMetodoPago(cita.metodoPago || "");
      setNewEstadoPago(cita.estadoPago || EstadoPagoOrden.PENDIENTE);
      setIsPaymentModalOpen(true);
  };

  const handleUpdatePayment = async () => {
      if (!paymentCita) return;
      setIsUpdatingPayment(true);
      const token = localStorage.getItem("token");
      if (token) {
          const res = await updateCitaPago(token, paymentCita.id, newMetodoPago, newEstadoPago);
          if (res.error) {
              toast.error(res.error);
          } else {
              toast.success(res.message);
              fetchCitasData();
              setIsPaymentModalOpen(false);
          }
      }
      setIsUpdatingPayment(false);
  };

  const handleMarkAsRealizada = async (id: number) => {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      const res = await markCitaAsRealizada(token, id);
      if (res.error) {
          toast.error(res.error);
      } else {
          toast.success(res.message);
          fetchCitasData();
      }
  };

  const handleMarkAsCancelada = async (id: number) => {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      const res = await markCitaAsCancelada(token, id);
      if (res.error) {
          toast.error(res.error);
      } else {
          toast.success(res.message);
          fetchCitasData();
          fetchAux(); // Update stats
      }
  };

  const handleTogglePago = async (id: number) => {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      const res = await toggleCitaPago(token, id);
      if (res.error) {
          toast.error(res.error);
      } else {
          toast.success(res.message);
          fetchCitasData();
      }
  };

  const handleCopy = (cita: Cita) => {
    const text = `Cita: ${cita.servicio.nombre}\nCliente: ${cita.cliente.nombre} ${cita.cliente.apellido}\nFecha: ${formatDateBogota(cita.fechaVisita)}`;
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !uploadingCitaId) return;
      const token = localStorage.getItem("token");
      if (!token) return;

      const formData = new FormData();
      formData.append("file", file);
      
      toast.promise(uploadComprobantePagoCita(token, uploadingCitaId, formData), {
          loading: "Subiendo...",
          success: () => {
            fetchCitasData();
            return "Comprobante subido";
          },
          error: "Error al subir"
      });
      setUploadingCitaId(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Gestión de Citas</h1>
            <p className="text-sm text-slate-600 mt-1">Administra las citas de psicología</p>
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
            <Button onClick={() => router.push("/dashboard/citas/nuevo")} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" /> Nueva Cita
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && showKPIs && (
        <div className="flex-none px-8 py-6 bg-slate-50 border-b border-slate-200 animate-in fade-in slide-in-from-top-2 duration-300">
           <div className="max-w-7xl mx-auto grid gap-4 grid-cols-2 md:grid-cols-5">
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                      <CardTitle className="text-sm font-medium">Total Citas</CardTitle>
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                      <div className="text-2xl font-bold">{stats.totalOrdenes}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs font-semibold text-slate-900">{stats.totalMes}</span>
                        <span className="text-[10px] text-muted-foreground">este mes</span>
                      </div>
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                      <CardTitle className="text-sm font-medium">Programadas</CardTitle>
                      <Calendar className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                      <div className="text-2xl font-bold text-blue-600">{stats.programadas}</div>
                      <p className="text-xs text-muted-foreground">Pendientes de realizar</p>
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                      <CardTitle className="text-sm font-medium">Realizadas</CardTitle>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                      <div className="text-2xl font-bold text-green-600">{stats.realizadas}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs font-semibold text-green-700">{stats.realizadasMes}</span>
                        <span className="text-[10px] text-muted-foreground">este mes</span>
                      </div>
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                      <CardTitle className="text-sm font-medium">Alquiler</CardTitle>
                      <Users className="h-4 w-4 text-purple-500" />
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                      <div className="text-2xl font-bold text-purple-600">{stats.alquiler}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs font-semibold text-purple-700">{stats.alquilerMes}</span>
                        <span className="text-[10px] text-muted-foreground">este mes</span>
                      </div>
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                      <CardTitle className="text-sm font-medium">Paquetes</CardTitle>
                      <Package className="h-4 w-4 text-orange-500" />
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                      <div className="text-2xl font-bold text-orange-600">{stats.paquetes}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs font-semibold text-orange-700">{stats.paquetesMes}</span>
                        <span className="text-[10px] text-muted-foreground">este mes</span>
                      </div>
                  </CardContent>
              </Card>
           </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-3 items-center">
           <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Buscar paciente..." className="pl-10 bg-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
           </div>
           
           <div className="flex items-center gap-2">
             <span className="text-xs font-medium text-slate-500">Psicólogo:</span>
             <Combobox
               options={[
                 { value: "all", label: "Todos los psicólogos" },
                 ...psicologos.map((p) => ({
                   value: p.id.toString(),
                   label: `${p.nombre} ${p.apellido}`,
                 })),
               ]}
               value={selectedPsicologo}
               onChange={(val) => setSelectedPsicologo(val || "all")}
               placeholder="Filtrar por psicólogo"
               className="w-[200px]"
             />
           </div>
           
           <div className="flex items-center gap-2">
             <span className="text-xs font-medium text-slate-500">Paquete:</span>
             <Select value={selectedPaquete} onValueChange={setSelectedPaquete}>
               <SelectTrigger className="w-[160px] bg-white">
                 <SelectValue placeholder="Paquete" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">Todos</SelectItem>
                 {terapias.map((t) => (
                   <SelectItem key={t.id} value={t.id.toString()}>
                     {t.nombre}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
           
           <div className="flex items-center gap-2">
             <span className="text-xs font-medium text-slate-500">Consultorio:</span>
             <Select value={selectedConsultorio} onValueChange={setSelectedConsultorio}>
               <SelectTrigger className="w-[160px] bg-white">
                 <SelectValue placeholder="Consultorio" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">Todos</SelectItem>
                 {consultorios.map((c) => (
                   <SelectItem key={c.id} value={c.id.toString()}>
                     {c.nombre}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>

           <div className="flex items-center gap-2">
             <span className="text-xs font-medium text-slate-500">Estado pago:</span>
             <Select value={selectedEstadoPago} onValueChange={(value) => setSelectedEstadoPago(value as EstadoPagoFilter)}>
               <SelectTrigger className="w-[180px] bg-white">
                 <SelectValue placeholder="Estado pago" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">Todos</SelectItem>
                 <SelectItem value={EstadoPagoOrden.PENDIENTE}>Pendiente</SelectItem>
                 <SelectItem value={EstadoPagoOrden.EFECTIVO_DECLARADO}>Efectivo declarado</SelectItem>
                 <SelectItem value={EstadoPagoOrden.CONSIGNADO}>Consignado</SelectItem>
                 <SelectItem value={EstadoPagoOrden.CONCILIADO}>Conciliado</SelectItem>
               </SelectContent>
             </Select>
           </div>

           <div className="flex items-center gap-2">
             <span className="text-xs font-medium text-slate-500">Fecha:</span>
             <div className="flex items-center gap-1 bg-white p-1 rounded border shadow-sm">
                <Input type="date" className="h-8 w-32 border-0 text-xs focus-visible:ring-0" value={startDate} onChange={e => setStartDate(e.target.value)} />
                <span className="text-slate-400">-</span>
                <Input type="date" className="h-8 w-32 border-0 text-xs focus-visible:ring-0" value={endDate} onChange={e => setEndDate(e.target.value)} />
             </div>
           </div>

           <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters} 
              className="text-slate-500 hover:text-red-600 hover:bg-red-50 h-8 px-2 ml-auto md:ml-0"
              title="Borrar filtros"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Borrar
            </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <div className="max-w-7xl mx-auto">
           {loading ? (
             <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
           ) : citas.length === 0 ? (
             <div className="text-center p-10 text-slate-500">No se encontraron citas</div>
           ) : (
             <div className="bg-white rounded-lg border shadow-sm">
               <table className="w-full text-sm text-left">
                 <thead className="bg-slate-50 font-medium border-b">
                   <tr>
                     <th className="px-6 py-4">Paciente</th>
                     <th className="px-6 py-4">Paquete</th>
                     <th className="px-6 py-4">Valor x Sesión</th>
                     <th className="px-6 py-4 text-center">Sesiones Real.</th>
                     <th className="px-6 py-4">Consultorio</th>
                     <th className="px-6 py-4">Fecha</th>
                     <th className="px-6 py-4">Psicólogo</th>
                     <th className="px-6 py-4">Estado</th>
                     <th className="px-6 py-4">Pago</th>
                     <th className="px-6 py-4 text-right">Acciones</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y">
                   {citas.map(cita => (
                     <tr key={cita.id} className={`hover:bg-slate-50 ${cita.realizada === true ? "bg-green-50/50" : cita.realizada === null ? "bg-slate-50/80 opacity-60" : ""}`}>
                       <td className="px-6 py-4 font-medium">
                           {cita.cliente?.nombre || 'Paciente'} {cita.cliente?.apellido || 'Externo'}
                       </td>
                       <td className="px-6 py-4 font-medium text-blue-600">{cita.paqueteNombre || 'N/A'}</td>
                       <td className="px-6 py-4 font-semibold text-slate-700">
                          {cita.PaqueteAdquirido ? (
                            new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(cita.PaqueteAdquirido.precioPagado / cita.PaqueteAdquirido.sesionesTotales)
                          ) : 'N/A'}
                       </td>
                       <td className="px-6 py-4 text-center">
                          {cita.PaqueteAdquirido ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${getSesionesBadgeClass(cita.PaqueteAdquirido)}`}>
                               {getSesionesRealizadas(cita.PaqueteAdquirido)} / {cita.PaqueteAdquirido.sesionesTotales}
                            </span>
                          ) : 'N/A'}
                       </td>
                       <td className="px-6 py-4">{cita.consultorioNombre || 'N/A'}</td>
                       <td className="px-6 py-4">
                         {formatDateBogota(cita.fechaVisita)}
                         <div className="text-xs text-slate-500">
                           {formatTimeBogota(cita.horaInicio)}
                         </div>
                       </td>
                       <td className="px-6 py-4">{cita.tecnico ? `${cita.tecnico.nombre} ${cita.tecnico.apellido}` : <span className="text-orange-500">Sin asignar</span>}</td>
                       <td className="px-6 py-4">
                           {cita.realizada === true ? (
                               <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                   Realizada
                               </span>
                           ) : cita.realizada === false ? (
                               <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                   Programada
                               </span>
                           ) : (
                               <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                   Cancelada
                               </span>
                           )}
                       </td>
                       <td className="px-6 py-4">
                           <div 
                             className="flex flex-col gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors group relative"
                             onClick={() => handleEditPayment(cita)}
                             title="Click para editar pago"
                           >
                               <div className="flex items-center justify-between">
                                 <span className="text-xs text-slate-600">{cita.metodoPago || 'No especificado'}</span>
                                 <Edit className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                               </div>
                               {cita.estadoPago === EstadoPagoOrden.CONCILIADO ? (
                                   <span className="inline-flex items-center w-fit px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
                                       CONCILIADO
                                   </span>
                               ) : cita.estadoPago === EstadoPagoOrden.CONSIGNADO ? (
                                   <span className="inline-flex items-center w-fit px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                                       CONSIGNADO
                                   </span>
                               ) : cita.estadoPago === EstadoPagoOrden.EFECTIVO_DECLARADO ? (
                                   <span className="inline-flex items-center w-fit px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                                       EFECTIVO
                                   </span>
                               ) : (
                                   <span className="inline-flex items-center w-fit px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                                       PENDIENTE
                                   </span>
                               )}
                           </div>
                       </td>
                       <td className="px-6 py-4 text-right">
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                             <DropdownMenuItem onClick={() => handleViewCita(cita.id)}><Eye className="mr-2 h-4 w-4" /> Ver detalle</DropdownMenuItem>
                             <DropdownMenuItem onClick={() => router.push(`/dashboard/citas/${cita.id}/editar`)}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                             {cita.realizada === false && (
                                 <DropdownMenuItem onClick={() => handleMarkAsRealizada(cita.id)} className="text-green-600">
                                     <CheckCircle className="mr-2 h-4 w-4" /> Marcar Realizada
                                 </DropdownMenuItem>
                             )}
                             {cita.realizada === false && (
                                 <DropdownMenuItem onClick={() => handleMarkAsCancelada(cita.id)} className="text-orange-600">
                                     <EyeOff className="mr-2 h-4 w-4" /> Marcar como Cancelada
                                 </DropdownMenuItem>
                             )}
                             <DropdownMenuItem onClick={() => handleTogglePago(cita.id)} className={cita.estadoPago === EstadoPagoOrden.CONCILIADO ? "text-orange-600" : "text-green-600"}>
                                 <CheckCircle className="mr-2 h-4 w-4" /> 
                                 {cita.estadoPago === EstadoPagoOrden.CONCILIADO ? "Marcar como Pendiente" : "Marcar como Conciliado"}
                             </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => handleCopy(cita)}><Copy className="mr-2 h-4 w-4" /> Copiar info</DropdownMenuItem>
                             <DropdownMenuItem onClick={() => {
                                setUploadingCitaId(cita.id);
                                fileInputRef.current?.click();
                             }}>
                                <FileText className="mr-2 h-4 w-4 text-purple-600" /> 
                                {cita.comprobantePath ? "Cambiar Comprobante" : "Subir Comprobante"}
                             </DropdownMenuItem>
                             <DropdownMenuSeparator />
                             <DropdownMenuItem onClick={() => handleDeleteClick(cita.id)} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" /> Eliminar</DropdownMenuItem>
                           </DropdownMenuContent>
                         </DropdownMenu>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           )}
           <div className="mt-4">
             <PaginationControls
               currentPage={currentPage}
               totalPages={totalPages}
               totalRecords={totalRecords}
               itemsPerPage={itemsPerPage}
             />
           </div>
        </div>
      </div>

      {/* Delete Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Cita</DialogTitle>
            <DialogDescription>¿Estás seguro de eliminar esta cita? Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle de Cita</DialogTitle>
          </DialogHeader>
          {selectedCita && (
            <div className="space-y-6">
               {/* Información del Paciente */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4">
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Paciente</span>
                    <span className="font-medium text-lg">{selectedCita.cliente?.nombre || 'N/A'} {selectedCita.cliente?.apellido || ''}</span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Documento</span>
                    <span className="font-medium">{selectedCita.cliente?.tipoDocumento} {selectedCita.cliente?.numeroDocumento || 'N/A'}</span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Teléfono</span>
                    <span className="font-medium">{selectedCita.cliente?.telefono || 'N/A'}</span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Correo</span>
                    <span className="font-medium">{selectedCita.cliente?.correo || 'N/A'}</span>
                 </div>
               </div>

               {/* Información del Servicio */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4">
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Servicio</span>
                    <span className="font-medium">{selectedCita.servicio.nombre}</span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Tipo de Servicio</span>
                    <span className="font-medium">{selectedCita.tipoServicio?.nombre || 'N/A'}</span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Profesional</span>
                    <span className="font-medium">{selectedCita.tecnico?.nombre || 'Sin asignar'} {selectedCita.tecnico?.apellido || ''}</span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Empresa</span>
                    <span className="font-medium">{selectedCita.empresa?.nombre || 'N/A'}</span>
                 </div>
               </div>
               
               {/* Package Information if available */}
               {selectedCita.PaqueteAdquirido && (
                   <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-4">
                       <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2 mb-2">
                           <Package className="h-4 w-4" /> Información del Paquete
                       </h3>
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                           <div>
                               <span className="text-xs text-blue-500 block uppercase tracking-wider">Terapia</span>
                               <span className="font-medium text-blue-900">{selectedCita.PaqueteAdquirido.TerapiasPsicologos.nombre}</span>
                           </div>
                           <div>
                               <span className="text-xs text-blue-500 block uppercase tracking-wider">Sesiones Totales</span>
                               <span className="font-medium text-blue-900">{selectedCita.PaqueteAdquirido.sesionesTotales}</span>
                           </div>
                           <div>
                               <span className="text-xs text-blue-500 block uppercase tracking-wider">Sesiones Realizadas</span>
                               <span className="font-medium text-blue-900">
                                   {getSesionesRealizadas(selectedCita.PaqueteAdquirido)} / {selectedCita.PaqueteAdquirido.sesionesTotales}
                               </span>
                           </div>
                           <div>
                               <span className="text-xs text-blue-500 block uppercase tracking-wider">Saldo Restante</span>
                               <span className="font-medium text-blue-900">{selectedCita.PaqueteAdquirido.saldoRestante}</span>
                           </div>
                           <div>
                               <span className="text-xs text-blue-500 block uppercase tracking-wider">Valor Pagado</span>
                               <span className="font-medium text-blue-900">
                                   {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(selectedCita.PaqueteAdquirido.precioPagado)}
                               </span>
                           </div>
                           <div>
                               <span className="text-xs text-blue-500 block uppercase tracking-wider">Valor x Sesión</span>
                               <span className="font-medium text-blue-900">
                                   {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(selectedCita.PaqueteAdquirido.precioPagado / selectedCita.PaqueteAdquirido.sesionesTotales)}
                               </span>
                           </div>
                           <div>
                               <span className="text-xs text-blue-500 block uppercase tracking-wider">Estado</span>
                               <span className="font-medium text-blue-900">{selectedCita.PaqueteAdquirido.estado}</span>
                           </div>
                       </div>
                   </div>
               )}

               {/* Fecha y Valor */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Fecha</span>
                    <span className="font-medium">{formatDateBogota(selectedCita.fechaVisita)}</span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Hora Inicio</span>
                    <span className="font-medium">{formatTimeBogota(selectedCita.horaInicio)}</span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Método de Pago</span>
                    <span className="font-medium">{selectedCita.metodoPago || 'No especificado'}</span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Estado de Pago</span>
                    <span className={`font-bold ${selectedCita.estadoPago !== EstadoPagoOrden.PENDIENTE ? 'text-green-600' : 'text-red-600'}`}>
                        {selectedCita.estadoPago || 'PENDIENTE'}
                    </span>
                 </div>
                 <div>
                    <span className="text-xs text-slate-500 block uppercase tracking-wider">Valor de esta Cita</span>
                    <span className="font-medium text-green-600">
                        {selectedCita.valorCotizado !== null 
                            ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(selectedCita.valorCotizado) 
                            : 'N/A'}
                    </span>
                 </div>
               </div>

               {/* Observaciones */}
               <div>
                  <span className="text-xs text-slate-500 block uppercase tracking-wider mb-1">Observaciones</span>
                  <p className="bg-slate-50 p-3 rounded-md text-sm border border-slate-100">
                    {selectedCita.observacion || 'Sin observaciones registradas.'}
                  </p>
               </div>

               {/* Comprobante de Pago */}
               {selectedCita.comprobantePath && (
                   <div className="pt-2">
                       <span className="text-xs text-slate-500 block uppercase tracking-wider mb-2">Comprobante de Pago</span>
                       <div className="border rounded-lg overflow-hidden bg-slate-50 flex items-center justify-center relative min-h-[200px]">
                           {/* Assuming it's an image for preview, or providing a link for docs */}
                           {selectedCita.comprobantePath.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                               <Image 
                                 src={selectedCita.comprobantePath} 
                                 alt="Comprobante de pago" 
                                 width={400} 
                                 height={300} 
                                 className="object-contain max-h-[400px] w-auto"
                                 unoptimized
                               />
                           ) : (
                               <div className="p-6 text-center">
                                   <FileText className="h-12 w-12 text-slate-400 mx-auto mb-2" />
                                   <p className="text-sm text-slate-600 mb-3">Documento adjunto disponible</p>
                                   <Button asChild variant="outline" size="sm">
                                       <a href={selectedCita.comprobantePath} target="_blank" rel="noopener noreferrer">
                                           Ver Documento
                                       </a>
                                   </Button>
                               </div>
                           )}
                       </div>
                   </div>
               )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Permission Request Modal */}
      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Permiso de Exportación</DialogTitle>
            <DialogDescription>
              Para descargar el archivo Excel, debes solicitar permiso a un administrador.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="motivo">Motivo de la solicitud</Label>
            <Input
              id="motivo"
              placeholder="Ej: Reporte mensual de gestión"
              value={requestMotivo}
              onChange={(e) => setRequestMotivo(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRequestDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitPermissionRequest} disabled={sendingRequest}>
              {sendingRequest ? "Enviando..." : "Enviar Solicitud"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Pago</DialogTitle>
            <DialogDescription>
              Actualiza el método y estado de pago de la cita.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="metodo-pago">Método de Pago</Label>
              <Select value={newMetodoPago} onValueChange={setNewMetodoPago}>
                <SelectTrigger id="metodo-pago">
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  {metodosPago.map((m) => (
                    <SelectItem key={m.id} value={m.nombre}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="estado-pago">Estado de Pago</Label>
              <Select value={newEstadoPago} onValueChange={(v) => setNewEstadoPago(v as EstadoPagoOrden)}>
                <SelectTrigger id="estado-pago">
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EstadoPagoOrden.PENDIENTE}>PENDIENTE</SelectItem>
                  <SelectItem value={EstadoPagoOrden.EFECTIVO_DECLARADO}>EFECTIVO DECLARADO</SelectItem>
                  <SelectItem value={EstadoPagoOrden.CONSIGNADO}>CONSIGNADO</SelectItem>
                  <SelectItem value={EstadoPagoOrden.CONCILIADO}>CONCILIADO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdatePayment} disabled={isUpdatingPayment}>
              {isUpdatingPayment ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SU_ADMIN Export Modal */}
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar Reporte General de Citas</DialogTitle>
            <DialogDescription>
              Selecciona los filtros para generar el archivo Excel de todos los sistemas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="export-start">Fecha Inicio</Label>
                <Input
                  id="export-start"
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="export-end">Fecha Fin</Label>
                <Input
                  id="export-end"
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="export-tenant">Sistema (Tenant)</Label>
              <Select value={exportTenantId} onValueChange={setExportTenantId}>
                <SelectTrigger id="export-tenant">
                  <SelectValue placeholder="Seleccionar sistema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los sistemas</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmExport} disabled={isExporting}>
              {isExporting ? "Generando..." : "Descargar Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
    </div>
  );
}
