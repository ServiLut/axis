"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Calendar, Clock, Trash2, DollarSign, Briefcase, Coffee, History, Eye, CheckCircle, Download, Pencil, UploadCloud, Camera, Send, Check, X } from "lucide-react"; 
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getTurnos, deleteTurno, createCuentaCobroGroup, getCuentasCobro, getCuentaCobroDetails, getCuentaCobroPdfData, sendCuentaCobro, updateCuentaCobroStatus } from "./actions";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useUserRole } from "@/hooks/use-user-role";
import imageCompression from "browser-image-compression";

interface Usuario {
    nombre: string;
    apellido: string;
}

interface Turno {
  id: number;
  tenantId: number;
  usuarioId: number;
  fecha: Date;
  horaEntrada: Date;
  horaSalida: Date;
  tiempoDescanso: number;
  observaciones: string | null;
  valorTotal: number | null;
  createdAt: Date;
  cuentaCobroId: number | null;
  fotoEntrada: string | null;
  fotoSalida: string | null;
  usuario?: Usuario;
}

interface CuentaCobro {
    id: number;
    tenantId: number;
    usuarioId: number;
    fechaInicio: Date;
    fechaFin: Date;
    valorTotal: number;
    estado: string;
    createdAt: Date;
    _count: {
        turnos: number;
    };
    usuario?: Usuario;
}

export default function CuentaCobroPage() {
  const { role } = useUserRole();
  const isAdmin = role === "ADMIN" || role === "SU_ADMIN";
  
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cuentas, setCuentas] = useState<CuentaCobro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [currentTurno, setCurrentTurno] = useState<Turno | null>(null);
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    horaEntrada: "",
    horaSalida: "",
    tiempoDescanso: "0",
    observaciones: ""
  });
  const [fotoLlegada, setFotoLlegada] = useState<File | null>(null);
  const [fotoSalida, setFotoSalida] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [turnoToDelete, setTurnoToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Close Period states
  const [isClosePeriodModalOpen, setIsClosePeriodModalOpen] = useState(false);
  const [isClosingPeriod, setIsClosingPeriod] = useState(false);

  // History Details states
  const [selectedCuentaTurnos, setSelectedCuentaTurnos] = useState<Turno[]>([]);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // PDF state
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Send state
  const [isSending, setIsSending] = useState(false);
  
  // Update Status state
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<number | null>(null);

  const router = useRouter();

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const [resTurnos, resCuentas] = await Promise.all([
        getTurnos(token),
        getCuentasCobro(token)
    ]);

    if (resTurnos.error) toast.error(resTurnos.error);
    if (resCuentas.error) toast.error(resCuentas.error);

    if (resTurnos.turnos) setTurnos(resTurnos.turnos as Turno[]);
    if (resCuentas.cuentas) setCuentas(resCuentas.cuentas as CuentaCobro[]);
    
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = (turno?: Turno) => {
    setFotoLlegada(null);
    setFotoSalida(null);
    if (turno) {
        setEditingId(turno.id);
        setCurrentTurno(turno);
        const fecha = formatInTimeZone(new Date(turno.fecha), "UTC", "yyyy-MM-dd", { locale: es });
        const horaEntrada = formatInTimeZone(new Date(turno.horaEntrada), "UTC", "HH:mm");
        const horaSalida = formatInTimeZone(new Date(turno.horaSalida), "UTC", "HH:mm");
        
        setFormData({
            fecha,
            horaEntrada,
            horaSalida,
            tiempoDescanso: turno.tiempoDescanso.toString(),
            observaciones: turno.observaciones || ""
        });
    } else {
        setEditingId(null);
        setCurrentTurno(null);
        setFormData({
            fecha: new Date().toISOString().split('T')[0],
            horaEntrada: "",
            horaSalida: "",
            tiempoDescanso: "0",
            observaciones: ""
        });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const token = localStorage.getItem("token");
    if (!token) {
        setIsSubmitting(false);
        return;
    }

    const uploadImage = async (file: File, folder: string): Promise<string | null> => {
        try {
            const signRes = await fetch("/api/storage/sign-url", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    folder,
                    fileType: file.type,
                    extension: file.name.split('.').pop(),
                    bucket: "turno"
                })
            });
            
            if (!signRes.ok) throw new Error("Error getting signed URL");
            const { signedUrl, publicUrl } = await signRes.json();

            const uploadRes = await fetch(signedUrl, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": file.type
                }
            });

            if (!uploadRes.ok) throw new Error("Error uploading file");

            return publicUrl;
        } catch (error) {
            console.error("Upload error:", error);
            return null;
        }
    };

    const data = new FormData();
    data.append("fecha", formData.fecha);
    data.append("horaEntrada", formData.horaEntrada);
    data.append("horaSalida", formData.horaSalida);
    data.append("tiempoDescanso", formData.tiempoDescanso);
    data.append("observaciones", formData.observaciones);

    try {
        const options = {
            maxSizeMB: 0.8,
            maxWidthOrHeight: 1200,
            useWebWorker: true,
        };

        if (fotoLlegada) {
            try {
                const compressedFile = await imageCompression(fotoLlegada, options);
                const url = await uploadImage(compressedFile, "fotoEntrada");
                if (url) data.append("fotoEntradaUrl", url);
            } catch (error) {
                console.error("Error processing fotoLlegada:", error);
                toast.error("Error al procesar foto de llegada");
                setIsSubmitting(false);
                return;
            }
        }

        if (fotoSalida) {
            try {
                 const compressedFile = await imageCompression(fotoSalida, options);
                 const url = await uploadImage(compressedFile, "fotoSalida");
                 if (url) data.append("fotoSalidaUrl", url);
            } catch (error) {
                console.error("Error processing fotoSalida:", error);
                toast.error("Error al procesar foto de salida");
                setIsSubmitting(false);
                return;
            }
        }
    } catch (error) {
        console.error("Compression/Upload error:", error);
        setIsSubmitting(false);
        return;
    }

    try {
        let response;
        if (editingId) {
             response = await fetch(`/api/turnos/${editingId}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: data
            });
        } else {
             response = await fetch("/api/turnos", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: data
            });
        }

        const resData = await response.json();

        if (!response.ok) {
            toast.error(resData.message || "Error al guardar el turno");
        } else {
            toast.success(resData.message || "Turno guardado exitosamente");
            setIsModalOpen(false);
            fetchData();
        }
    } catch (error) {
        console.error(error);
        toast.error("Error de conexión");
    }

    setIsSubmitting(false);
  };

  const handleDeleteClick = (id: number) => {
    setTurnoToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!turnoToDelete) return;
    setIsDeleting(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await deleteTurno(token, turnoToDelete);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setIsDeleteModalOpen(false);
      setTurnoToDelete(null);
      fetchData();
    }
    setIsDeleting(false);
  };

  const handleClosePeriod = async () => {
    setIsClosingPeriod(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await createCuentaCobroGroup(token);
    if (result.error) {
        toast.error(result.error);
    } else {
        toast.success(result.message);
        setIsClosePeriodModalOpen(false);
        fetchData();
    }
    setIsClosingPeriod(false);
  };

  const handleViewDetails = async (id: number) => {
      setIsDetailsModalOpen(true);
      setLoadingDetails(true);
      
      const token = localStorage.getItem("token");
      if (token) {
          const res = await getCuentaCobroDetails(token, id);
          if (res.turnos) {
              setSelectedCuentaTurnos(res.turnos as Turno[]);
          } else {
              toast.error("Error cargando detalles");
          }
      }
      setLoadingDetails(false);
  };

  const handleDownloadPdf = async (id: number) => {
    setIsGeneratingPdf(true);
    const token = localStorage.getItem("token");
    if(!token) return;

    try {
        const res = await getCuentaCobroPdfData(token, id);
        
        if(res.error || !res.cuenta) {
            toast.error(res.error || "Error al generar PDF");
            setIsGeneratingPdf(false);
            return;
        }

        const { cuenta } = res;
        const usuario = cuenta.usuario;
        const cuentaPago = usuario?.CuentasPago?.[0];

        const doc = new jsPDF();
        
        // --- CONSTANTS ---
        const primaryColor = [30, 58, 138]; // Blue 900
        const secondaryColor = [100, 116, 139]; // Slate 500
        const accentColor = [22, 163, 74]; // Green 600
        const lightBg = [248, 250, 252]; // Slate 50
        const borderColor = [226, 232, 240]; // Slate 200

        // --- HEADER ---
        // Blue Top Bar
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, 210, 40, 'F');

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.setTextColor(255, 255, 255);
        doc.text("CUENTA DE COBRO", 14, 20);

        // Document ID (Simulated with Date)
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(203, 213, 225); // Slate 300
        doc.text(`Generado: ${formatInTimeZone(new Date(), "UTC", "PPP", { locale: es })}`, 14, 30);

        // Period Box (Right Header)
        doc.setFontSize(10);
        doc.text("PERIODO LIQUIDADO", 196, 18, { align: "right" });
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(
            `${formatInTimeZone(new Date(cuenta.fechaInicio), "UTC", "d MMM", { locale: es })} - ${formatInTimeZone(new Date(cuenta.fechaFin), "UTC", "d MMM yyyy", { locale: es })}`,
            196, 
            25, 
            { align: "right" }
        );

        // --- INFO SECTION ---
        const yPos = 55;
        
        // Left Column: Contractor
        doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
        doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
        doc.roundedRect(14, yPos, 85, 45, 2, 2, 'FD');

        doc.setFontSize(10);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont("helvetica", "bold");
        doc.text("INFORMACIÓN DEL CONTRATISTA", 19, yPos + 8);
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85); // Slate 700
        doc.setFontSize(10);
        
        doc.text("Nombre:", 19, yPos + 18);
        doc.setFont("helvetica", "bold");
        doc.text(`${usuario?.nombre || ''} ${usuario?.apellido || ''}`, 50, yPos + 18);
        
        doc.setFont("helvetica", "normal");
        doc.text("Documento:", 19, yPos + 26);
        doc.setFont("helvetica", "bold");
        doc.text(usuario?.numeroDocumento || 'N/A', 50, yPos + 26);

        doc.setFont("helvetica", "normal");
        doc.text("Teléfono:", 19, yPos + 34);
        doc.setFont("helvetica", "bold");
        doc.text(usuario?.telefono || 'N/A', 50, yPos + 34);

        // Right Column: Bank Info
        doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
        doc.roundedRect(111, yPos, 85, 45, 2, 2, 'FD');

        doc.setFontSize(10);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont("helvetica", "bold");
        doc.text("DATOS BANCARIOS", 116, yPos + 8);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        
        doc.text("Banco:", 116, yPos + 18);
        doc.setFont("helvetica", "bold");
        doc.text(cuentaPago?.banco || 'N/A', 145, yPos + 18);

        doc.setFont("helvetica", "normal");
        doc.text("Tipo:", 116, yPos + 26);
        doc.setFont("helvetica", "bold");
        doc.text(cuentaPago?.tipoCuenta || 'N/A', 145, yPos + 26);

        doc.setFont("helvetica", "normal");
        doc.text("Cuenta:", 116, yPos + 34);
        doc.setFont("helvetica", "bold");
        doc.text(cuentaPago?.numeroCuenta || 'N/A', 145, yPos + 34);

        // --- TABLE ---
        const tableData = cuenta.turnos.map((t: Turno) => {
            const fecha = new Date(t.fecha);
            const entrada = new Date(t.horaEntrada);
            const salida = new Date(t.horaSalida);
            const diffMs = salida.getTime() - entrada.getTime();
            const horasTrabajadas = ((diffMs / (1000 * 60 * 60)) - (t.tiempoDescanso / 60)).toFixed(2);

            return [
                formatInTimeZone(fecha, "UTC", "yyyy-MM-dd", { locale: es }),
                `${formatInTimeZone(entrada, "UTC", "HH:mm")} - ${formatInTimeZone(salida, "UTC", "HH:mm")}`,
                t.tiempoDescanso + " min",
                `${horasTrabajadas} hrs`,
                `$${(t.valorTotal || 0).toLocaleString()}`,
                t.observaciones || '-'
            ];
        });

        autoTable(doc, {
            startY: 110,
            head: [['Fecha', 'Horario', 'Descanso', 'Horas', 'Valor', 'Observaciones']],
            body: tableData,
            theme: 'striped',
            styles: {
                overflow: 'linebreak',
                cellPadding: 3,
                fontSize: 9
            },
            headStyles: { 
                fillColor: primaryColor as [number, number, number], 
                textColor: 255, 
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle'
            },
            bodyStyles: { 
                textColor: 51,
                halign: 'center',
                valign: 'middle'
            },
            columnStyles: {
                0: { cellWidth: 25 },
                1: { cellWidth: 35 },
                2: { cellWidth: 20 },
                3: { cellWidth: 20 },
                4: { cellWidth: 30, fontStyle: 'bold', halign: 'right' },
                5: { cellWidth: 'auto', halign: 'left' }
            },
            alternateRowStyles: {
                fillColor: [241, 245, 249]
            },
            margin: { top: 110, bottom: 20, left: 14, right: 14 }
        });

        // --- TOTALS & SIGNATURE ---
        let finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
        const pageHeight = doc.internal.pageSize.height;
        
        // Check if totals box fits, if not add page
        if (finalY + 40 > pageHeight) {
            doc.addPage();
            finalY = 20;
        }

        // Total Box
        const boxX = 130;
        const boxWidth = 66;
        const boxHeight = 25;

        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(boxX, finalY, boxWidth, 8, 'F'); // Header
        
        doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
        doc.setFillColor(255, 255, 255);
        doc.rect(boxX, finalY + 8, boxWidth, boxHeight - 8, 'FD'); // Body

        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text("TOTAL A PAGAR", boxX + boxWidth/2, finalY + 5.5, { align: 'center' });

        doc.setFontSize(14);
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.text(`$${cuenta.valorTotal.toLocaleString()}`, boxX + boxWidth/2, finalY + 19, { align: 'center' });

        // Summary Left
        doc.setFontSize(10);
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.setFont("helvetica", "normal");
        doc.text(`Total Días Laborados: ${cuenta.turnos.length}`, 14, finalY + 6);
        doc.text(`Nota: Documento generado automáticamente por Axis.`, 14, finalY + 14);

        // Signature Line
        // Position signature relative to totals, but ensure it's not too low
        let signatureY = finalY + 50;
        
        // If signature doesn't fit, add new page
        if (signatureY + 30 > pageHeight) {
            doc.addPage();
            signatureY = 40;
        }

        doc.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.line(14, signatureY, 84, signatureY);
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.text("Firma del Contratista", 14, signatureY + 6);
        doc.text(`C.C. ${usuario?.numeroDocumento || '________________'}`, 14, signatureY + 12);

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // Slate 400
        doc.text("Axis Software - Gestión Inteligente", 105, pageHeight - 10, { align: 'center' });

        // Save
        doc.save(`Cuenta_Cobro_${usuario?.nombre || 'Usuario'}_${formatInTimeZone(new Date(cuenta.fechaInicio), "UTC", "yyyy-MM-dd")}.pdf`);

    } catch (error) {
        console.error(error);
        toast.error("Ocurrió un error al generar el PDF");
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  const handleSendCuentaCobro = async (id: number) => {
    setIsSending(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await sendCuentaCobro(token, id);
    if (result.error) {
        toast.error(result.error);
    } else {
        toast.success(result.message);
        fetchData();
    }
    setIsSending(false);
  };

  const handleUpdateStatus = async (id: number, status: "PAGADA" | "RECHAZADA") => {
    setIsUpdatingStatus(id);
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await updateCuentaCobroStatus(token, id, status);
    if (result.error) {
        toast.error(result.error);
    } else {
        toast.success(result.message);
        fetchData();
    }
    setIsUpdatingStatus(null);
  };

  const filteredTurnos = turnos.filter(t => 
    (t.observaciones?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
    format(t.fecha, "yyyy-MM-dd").includes(searchTerm)
  );

  const stats = filteredTurnos.reduce(
    (acc, t) => {
      acc.days += 1;
      
      const entrada = new Date(t.horaEntrada);
      const salida = new Date(t.horaSalida);
      let diffMs = salida.getTime() - entrada.getTime();
      if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000;
      
      const durationHrs = diffMs / (1000 * 60 * 60);
      const breakHrs = t.tiempoDescanso / 60;
      const netHrs = durationHrs - breakHrs;
      
      acc.hours += netHrs > 0 ? netHrs : 0;
      acc.breakMinutes += t.tiempoDescanso;
      acc.money += t.valorTotal || 0;
      return acc;
    },
    { days: 0, hours: 0, breakMinutes: 0, money: 0 }
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cuenta de Cobro</h1>
            <p className="text-sm text-slate-600 mt-1">
              Registro de actividades y horas laboradas
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
          <div className="max-w-5xl mx-auto">
              <Tabs defaultValue="actual" className="w-full">
                  <TabsList className={`grid w-full mb-6 ${isAdmin ? 'grid-cols-3 max-w-[600px]' : 'grid-cols-2 max-w-[400px]'}`}>
                      <TabsTrigger value="actual">Periodo Actual</TabsTrigger>
                      {isAdmin && <TabsTrigger value="pendientes">Pagos Pendientes</TabsTrigger>}
                      <TabsTrigger value="historial">Historial</TabsTrigger>
                  </TabsList>

                  <TabsContent value="actual" className="space-y-6">
                      {/* Actions Bar */}
                      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                          <div className="relative max-w-md w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                            placeholder="Buscar por fecha u observación..."
                            className="pl-10 bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            {filteredTurnos.length > 0 && (
                                <Button 
                                    variant="outline"
                                    onClick={() => setIsClosePeriodModalOpen(true)}
                                    className="border-green-600 text-green-700 hover:bg-green-50"
                                >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Cerrar Periodo
                                </Button>
                            )}
                            <Button 
                                onClick={() => handleOpenModal()}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Registrar Turno
                            </Button>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Días Laborados</CardTitle>
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.days}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Horas (Netas)</CardTitle>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.hours.toFixed(1)}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Descanso</CardTitle>
                                <Coffee className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.breakMinutes} min</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Generado</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">${stats.money.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                        ) : filteredTurnos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
                            <Calendar className="h-12 w-12 mb-3 text-slate-300" />
                            <p className="font-medium">No se encontraron registros activos</p>
                            <p className="text-sm">Registra tu primer turno o revisa el historial</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs uppercase tracking-wider font-semibold">
                                            <tr>
                                                <th className="px-6 py-3">Fecha</th>
                                                <th className="px-6 py-3">Horario</th>
                                                <th className="px-6 py-3 text-center">Evidencias</th>
                                                <th className="px-6 py-3 text-center">Descanso</th>
                                                <th className="px-6 py-3 text-right">Valor Generado</th>
                                                <th className="px-6 py-3">Observaciones</th>
                                                <th className="px-6 py-3 text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredTurnos.map((turno) => {
                                                const fecha = new Date(turno.fecha);
                                                const entrada = new Date(turno.horaEntrada);
                                                const salida = new Date(turno.horaSalida);
                                                
                                                // Calculate duration hours
                                                const diffMs = salida.getTime() - entrada.getTime();
                                                
                                                return (
                                                <tr key={turno.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="font-medium text-slate-900">
                                                            {formatInTimeZone(fecha, "UTC", "eee, d MMM", { locale: es })}
                                                        </div>
                                                        <div className="text-xs text-slate-500 uppercase">
                                                            {formatInTimeZone(fecha, "UTC", "yyyy", { locale: es })}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-2 text-slate-700">
                                                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                            <span>
                                                                {formatInTimeZone(entrada, "UTC", "HH:mm")} - {formatInTimeZone(salida, "UTC", "HH:mm")}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs font-medium text-slate-400 mt-0.5 ml-5">
                                                            {((diffMs / (1000 * 60 * 60)) - (turno.tiempoDescanso / 60)).toFixed(2)} hrs netas
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex justify-center gap-1.5">
                                                            {turno.fotoEntrada ? (
                                                                <a href={turno.fotoEntrada} target="_blank" rel="noopener noreferrer" title="Ver foto entrada">
                                                                    <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                                                                        <Camera size={14} />
                                                                    </div>
                                                                </a>
                                                            ) : null}
                                                            {turno.fotoSalida ? (
                                                                <a href={turno.fotoSalida} target="_blank" rel="noopener noreferrer" title="Ver foto salida">
                                                                    <div className="p-1.5 rounded-md bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors">
                                                                        <Camera size={14} />
                                                                    </div>
                                                                </a>
                                                            ) : null}
                                                            {!turno.fotoEntrada && !turno.fotoSalida && (
                                                                <span className="text-slate-300">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-slate-600">
                                                        {turno.tiempoDescanso > 0 ? (
                                                            <Badge variant="secondary" className="font-normal bg-slate-100">
                                                                {turno.tiempoDescanso}m
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-slate-300">0</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                                                        ${(turno.valorTotal || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <p className="text-slate-500 max-w-[180px] truncate text-xs italic" title={turno.observaciones || ""}>
                                                            {turno.observaciones || "Sin observaciones"}
                                                        </p>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-1">
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                                                onClick={() => handleOpenModal(turno)}
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                onClick={() => handleDeleteClick(turno.id)}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )})}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                  </TabsContent>

                  {isAdmin && (
                  <TabsContent value="pendientes">
                    {loading ? (
                         <div className="flex items-center justify-center h-64">
                            <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                         </div>
                    ) : cuentas.filter(c => c.estado === 'PENDIENTE').length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
                            <CheckCircle className="h-12 w-12 mb-3 text-green-500" />
                            <p className="font-medium">¡Estás al día!</p>
                            <p className="text-sm">No tienes pagos pendientes por procesar</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs uppercase tracking-wider font-semibold">
                                        <tr>
                                            <th className="px-6 py-3">Periodo</th>
                                            <th className="px-6 py-3">Generado</th>
                                            <th className="px-6 py-3 text-center">Días</th>
                                            <th className="px-6 py-3 text-right">Valor Total</th>
                                            <th className="px-6 py-3 text-center">Estado</th>
                                            <th className="px-6 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {cuentas.filter(c => c.estado === 'PENDIENTE').map((cuenta) => (
                                            <tr key={cuenta.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="h-4 w-4 text-blue-500" />
                                                        <span className="font-semibold text-slate-900">
                                                            {formatInTimeZone(new Date(cuenta.fechaInicio), "UTC", "d MMM", { locale: es })} - {formatInTimeZone(new Date(cuenta.fechaFin), "UTC", "d MMM yyyy", { locale: es })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-slate-500 text-xs uppercase">
                                                    {format(new Date(cuenta.createdAt), "d MMM yyyy, HH:mm", { locale: es })}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <Badge variant="outline" className="font-medium bg-slate-50">
                                                        {cuenta._count.turnos}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold text-slate-900">
                                                    ${cuenta.valorTotal.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-yellow-100 text-yellow-700">
                                                        PENDIENTE
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                                                            onClick={() => handleViewDetails(cuenta.id)}
                                                            title="Ver detalles"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                            onClick={() => handleDownloadPdf(cuenta.id)}
                                                            disabled={isGeneratingPdf}
                                                            title="Descargar PDF"
                                                        >
                                                            {isGeneratingPdf ? (
                                                                <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                                                            ) : (
                                                                <Download className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon"
                                                            onClick={() => handleUpdateStatus(cuenta.id, "PAGADA")}
                                                            disabled={isUpdatingStatus === cuenta.id}
                                                            title="Aceptar y Marcar como Pagada"
                                                            className="h-8 w-8 text-slate-400 hover:text-green-600 hover:bg-green-50"
                                                        >
                                                            {isUpdatingStatus === cuenta.id ? (
                                                                <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                                                            ) : (
                                                                <Check className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon"
                                                            onClick={() => handleUpdateStatus(cuenta.id, "RECHAZADA")}
                                                            disabled={isUpdatingStatus === cuenta.id}
                                                            title="Rechazar Cuenta de Cobro"
                                                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                        >
                                                            {isUpdatingStatus === cuenta.id ? (
                                                                <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                                                            ) : (
                                                                <X className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                  </TabsContent>
                  )}

                  <TabsContent value="historial">
                    {loading ? (
                         <div className="flex items-center justify-center h-64">
                         <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                     </div>
                    ) : cuentas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
                            <History className="h-12 w-12 mb-3 text-slate-300" />
                            <p className="font-medium">No hay historial disponible</p>
                            <p className="text-sm">Cierra un periodo para generar un registro histórico</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs uppercase tracking-wider font-semibold">
                                        <tr>
                                            <th className="px-6 py-3">Periodo</th>
                                            <th className="px-6 py-3">Generado</th>
                                            <th className="px-6 py-3 text-center">Días</th>
                                            <th className="px-6 py-3 text-right">Valor Total</th>
                                            <th className="px-6 py-3 text-center">Estado</th>
                                            <th className="px-6 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {cuentas.map((cuenta) => (
                                            <tr key={cuenta.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="h-4 w-4 text-blue-500" />
                                                        <span className="font-semibold text-slate-900">
                                                            {formatInTimeZone(new Date(cuenta.fechaInicio), "UTC", "d MMM", { locale: es })} - {formatInTimeZone(new Date(cuenta.fechaFin), "UTC", "d MMM yyyy", { locale: es })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-slate-500 text-xs uppercase">
                                                    {format(new Date(cuenta.createdAt), "d MMM yyyy, HH:mm", { locale: es })}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <Badge variant="outline" className="font-medium bg-slate-50">
                                                        {cuenta._count.turnos}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold text-slate-900">
                                                    ${cuenta.valorTotal.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                        cuenta.estado === 'PAGADA' ? 'bg-green-100 text-green-700' : 
                                                        cuenta.estado === 'RECHAZADA' ? 'bg-red-100 text-red-700' : 
                                                        'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {cuenta.estado}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                                                            onClick={() => handleViewDetails(cuenta.id)}
                                                            title="Ver detalles"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                            onClick={() => handleDownloadPdf(cuenta.id)}
                                                            disabled={isGeneratingPdf}
                                                            title="Descargar PDF"
                                                        >
                                                            {isGeneratingPdf ? (
                                                                <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                                                            ) : (
                                                                <Download className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                        {cuenta.estado === 'GENERADA' && (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon"
                                                                onClick={() => handleSendCuentaCobro(cuenta.id)}
                                                                disabled={isSending}
                                                                title="Enviar Cuenta de Cobro"
                                                                className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                                            >
                                                                {isSending ? (
                                                                     <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                                                                ) : (
                                                                    <Send className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                  </TabsContent>
              </Tabs>
          </div>
      </div>

      {/* Create Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>{editingId ? "Editar Turno" : "Registrar Turno"}</DialogTitle>
                <DialogDescription>
                    {editingId ? "Modifica los detalles del turno seleccionado." : "Ingresa los detalles de tu jornada laboral."}
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="fecha" className="text-right">
                            Fecha
                        </Label>
                        <Input
                            id="fecha"
                            type="date"
                            value={formData.fecha}
                            onChange={(e) => setFormData({...formData, fecha: e.target.value})}
                            className="col-span-3"
                            required
                        />
                    </div>
                    
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="horaEntrada" className="text-right">
                            Entrada
                        </Label>
                        <Input
                            id="horaEntrada"
                            type="time"
                            value={formData.horaEntrada}
                            onChange={(e) => setFormData({...formData, horaEntrada: e.target.value})}
                            className="col-span-3"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="horaSalida" className="text-right">
                            Salida
                        </Label>
                        <Input
                            id="horaSalida"
                            type="time"
                            value={formData.horaSalida}
                            onChange={(e) => setFormData({...formData, horaSalida: e.target.value})}
                            className="col-span-3"
                            required
                        />
                    </div>

                    {/* Foto Llegada Upload */}
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label className="text-right pt-2">
                            Foto Llegada
                        </Label>
                        <div className="col-span-3">
                            <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors text-center cursor-pointer group">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    onChange={(e) => setFotoLlegada(e.target.files?.[0] || null)}
                                />
                                {fotoLlegada ? (
                                    <div className="relative aspect-video w-full rounded-md overflow-hidden bg-slate-100">
                                         <Image 
                                            src={URL.createObjectURL(fotoLlegada)} 
                                            alt="Preview" 
                                            fill 
                                            className="object-cover" 
                                            unoptimized 
                                         />
                                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                                             Cambiar foto
                                         </div>
                                    </div>
                                ) : currentTurno?.fotoEntrada ? (
                                    <div className="relative aspect-video w-full rounded-md overflow-hidden bg-slate-100">
                                         <Image 
                                            src={currentTurno.fotoEntrada} 
                                            alt="Current" 
                                            fill 
                                            className="object-cover" 
                                            unoptimized 
                                         />
                                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                                             Clic para cambiar
                                         </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-4 text-slate-400 group-hover:text-slate-500">
                                        <UploadCloud className="h-8 w-8 mb-2" />
                                        <span className="text-xs font-medium">Clic para subir foto</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Foto Salida Upload */}
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label className="text-right pt-2">
                            Foto Salida
                        </Label>
                        <div className="col-span-3">
                             <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors text-center cursor-pointer group">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    onChange={(e) => setFotoSalida(e.target.files?.[0] || null)}
                                />
                                {fotoSalida ? (
                                    <div className="relative aspect-video w-full rounded-md overflow-hidden bg-slate-100">
                                         <Image 
                                            src={URL.createObjectURL(fotoSalida)} 
                                            alt="Preview" 
                                            fill 
                                            className="object-cover" 
                                            unoptimized 
                                         />
                                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                                             Cambiar foto
                                         </div>
                                    </div>
                                ) : currentTurno?.fotoSalida ? (
                                    <div className="relative aspect-video w-full rounded-md overflow-hidden bg-slate-100">
                                         <Image 
                                            src={currentTurno.fotoSalida} 
                                            alt="Current" 
                                            fill 
                                            className="object-cover" 
                                            unoptimized 
                                         />
                                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                                             Clic para cambiar
                                         </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-4 text-slate-400 group-hover:text-slate-500">
                                        <UploadCloud className="h-8 w-8 mb-2" />
                                        <span className="text-xs font-medium">Clic para subir foto</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="tiempoDescanso" className="text-right">
                            Descanso (min)
                        </Label>
                        <Input
                            id="tiempoDescanso"
                            type="number"
                            min="0"
                            value={formData.tiempoDescanso}
                            onChange={(e) => setFormData({...formData, tiempoDescanso: e.target.value})}
                            className="col-span-3"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label htmlFor="observaciones" className="text-right pt-2">
                            Observaciones
                        </Label>
                        <Textarea
                            id="observaciones"
                            value={formData.observaciones}
                            onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
                            className="col-span-3"
                            placeholder="Notas opcionales..."
                        />
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
              Esta acción eliminará el registro permanentemente.
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

      {/* Close Period Confirmation Modal */}
      <Dialog open={isClosePeriodModalOpen} onOpenChange={setIsClosePeriodModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar Periodo Actual</DialogTitle>
            <DialogDescription>
              ¿Deseas agrupar todos los turnos actuales en una cuenta de cobro? Los registros se moverán al historial y la tabla actual quedará vacía para el nuevo mes/periodo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsClosePeriodModalOpen(false)}
              disabled={isClosingPeriod}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-green-600 hover:bg-green-700"
              onClick={handleClosePeriod}
              disabled={isClosingPeriod}
            >
              {isClosingPeriod ? "Procesando..." : "Confirmar Cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historical Details Modal */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                  <DialogTitle>Detalle de Cuenta de Cobro</DialogTitle>
                  <DialogDescription>
                      Registros incluidos en este periodo.
                  </DialogDescription>
              </DialogHeader>
              
              {loadingDetails ? (
                  <div className="flex items-center justify-center py-12">
                      <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
              ) : (
                <div className="mt-4">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 font-medium border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3">Usuario</th>
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Horario</th>
                                <th className="px-4 py-3 text-center">Evidencias</th>
                                <th className="px-4 py-3">Descanso</th>
                                <th className="px-4 py-3">Generado</th>
                                <th className="px-4 py-3">Observaciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {selectedCuentaTurnos.map((turno) => {
                                const fecha = new Date(turno.fecha);
                                const entrada = new Date(turno.horaEntrada);
                                const salida = new Date(turno.horaSalida);
                                const diffMs = salida.getTime() - entrada.getTime();
                                
                                return (
                                <tr key={turno.id}>
                                    <td className="px-4 py-3 text-slate-900">
                                        {turno.usuario ? `${turno.usuario.nombre} ${turno.usuario.apellido}` : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-900">{formatInTimeZone(fecha, "UTC", "PPP", { locale: es })}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <div className="flex flex-col text-xs">
                                            <span>{formatInTimeZone(entrada, "UTC", "p", { locale: es })} - {formatInTimeZone(salida, "UTC", "p", { locale: es })}</span>
                                            <span className="font-medium mt-0.5 text-slate-500">
                                                {((diffMs / (1000 * 60 * 60)) - (turno.tiempoDescanso / 60)).toFixed(2)} hrs
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-center gap-2">
                                            {turno.fotoEntrada ? (
                                                <a href={turno.fotoEntrada} target="_blank" rel="noopener noreferrer">
                                                    <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors">
                                                        <Camera size={12} className="text-blue-500" /> 
                                                        Entrada
                                                    </Badge>
                                                </a>
                                            ) : null}
                                            {turno.fotoSalida ? (
                                                <a href={turno.fotoSalida} target="_blank" rel="noopener noreferrer">
                                                    <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 transition-colors">
                                                        <Camera size={12} className="text-orange-500" />
                                                        Salida
                                                    </Badge>
                                                </a>
                                            ) : null}
                                            {!turno.fotoEntrada && !turno.fotoSalida && (
                                                <span className="text-slate-400 text-xs">-</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">{turno.tiempoDescanso} min</td>
                                    <td className="px-4 py-3 font-medium text-green-700">${(turno.valorTotal || 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{turno.observaciones || "-"}</td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
              )}
          </DialogContent>
      </Dialog>
    </div>
  );
}
