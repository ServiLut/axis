"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calculator,
  Calendar,
  CheckCircle,
  FileText,
  Plus,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRole } from "@/hooks/use-user-role";
import {
  getNominas,
  getServiciosPendientes,
  getTecnicos,
  createNomina,
  getNominaById,
  updateNominaEstado,
  updateValorRepuestosTecnico,
  type NominaSummary,
} from "./actions";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { TipoPago } from "@/prisma/generated/prisma/enums";

// Types
interface ServiceData {
    id: number;
    tenantId: number;
    valorPagado: number;
    valorRepuestos: number;
    valorRepuestosTecnico: number;
    fechaVisita: Date | string | null;
    cliente: { nombre: string | null; apellido: string | null };
    servicio: { nombre: string };
    type: "ORDEN" | "CITA";
}

interface AnticipoData {
    id: string;
    monto: number;
    razon: string | null;
    created_at: string;
}

interface NominaDetailView {
    id: number;
    ordenId: number | null;
    citaId?: number | null;
    valorServicio: number;
    orden: {
        servicio: { nombre: string };
        cliente: { nombre: string | null; apellido: string | null };
        valorPagado: number;
        valorRepuestos: number;
        valorCotizado: number | null;
        valorRepuestosTecnico?: number;
    };
}

interface NominaView {
    id: number;
    tenantId: number;
    usuarioId: number;
    usuario: { nombre: string; apellido: string; rol: string | null };
    fechaInicio: Date | string;
    fechaFin: Date | string;
    totalServicios: number;
    totalValorPagado: number;
    totalRepuestos: number;
    baseComisionable: number;
    totalPagar: number;
    estado: "BORRADOR" | "PAGADO" | "ANULADO";
    detalles: NominaDetailView[];
    observaciones?: string | null;
    anticipos?: AnticipoData[];
    serviciosPendientes?: {
        id: number;
        valorPagado: number;
        valorRepuestos: number;
        fechaVisita: Date | string | null;
        cliente: { nombre: string | null; apellido: string | null };
        servicio: { nombre: string };
    }[];
}

export default function NominaContabilidadPage() {
  const { role, loading: roleLoading } = useUserRole();
  const router = useRouter();

  // State
  const [nominas, setNominas] = useState<NominaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State (Create)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [tecnicos, setTecnicos] = useState<{ id: number; nombre: string; apellido: string }[]>([]);

  // View Modal State
  const [viewNomina, setViewNomina] = useState<NominaView | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [updatingEstado, setUpdatingEstado] = useState(false);

  // Form State
  const [selectedTecnico, setSelectedTecnico] = useState<string>("");
  const [fechaInicio, setFechaInicio] = useState<string>("");
  const [fechaFin, setFechaFin] = useState<string>("");
  const [ivaPercentage, setIvaPercentage] = useState<number>(0);
  const [selectedServices, setSelectedServices] = useState<Record<number, boolean>>({});
  
  // Calculation State
  const [calculating, setCalculating] = useState(false);
  const [rawData, setRawData] = useState<{
      config: { tipo: TipoPago | null; valorParticipacion: number | null; salarioBase: number | null } | null;
      servicios: ServiceData[];
      anticipos: AnticipoData[];
  } | null>(null);

  const previewData = useMemo(() => {
      if (!rawData) return null;
      const { config, servicios, anticipos } = rawData;

      const includedServices = servicios.filter(s => selectedServices[s.id]);
      const excludedServices = servicios.filter(s => !selectedServices[s.id]);

      let totalPagar = 0;
      let totalDeuda = 0;
      
      const divisor = 1 + (ivaPercentage / 100);
      const isTenant4 = servicios.length > 0 && servicios[0].tenantId === 4;

      // Helper to calculate payment for a service
      const calculateServicePayment = (s: ServiceData) => {
          if (config?.tipo === "SALARIO_FIJO") return 0;
          if (config?.tipo === "PORCENTAJE") {
              let base = s.valorPagado - (isTenant4 ? 0 : s.valorRepuestos);
              base = base / divisor;
              const commission = base * ((config.valorParticipacion || 0) / 100);
              return commission + (s.valorRepuestosTecnico || 0);
          }
          return 0;
      };

      // Calculate totals for INCLUDED services
      const totalServicios = includedServices.length;
      const totalValorPagado = includedServices.reduce((acc, s) => acc + s.valorPagado, 0);
      const totalRepuestos = isTenant4 ? 0 : includedServices.reduce((acc, s) => acc + s.valorRepuestos, 0);
      
      const totalAnticipos = anticipos.reduce((acc, a) => acc + a.monto, 0);

      // Base Comisionable (only for included)
      const baseGlobal = (totalValorPagado - totalRepuestos) / divisor;
      const baseComisionable = baseGlobal;

      // Details for handleSave (only included)
      const detalles = includedServices.map(s => ({
          id: s.id, // ID for createNomina
          type: s.type,
          ordenId: s.type === 'ORDEN' ? s.id : null, // Legacy field if needed locally
          valorServicio: calculateServicePayment(s),
          data: s
      }));

      // Calculate Total Pagar
      if (config?.tipo === "SALARIO_FIJO") {
          totalPagar = config.salarioBase || 0;
      } else {
          totalPagar = detalles.reduce((acc, d) => acc + d.valorServicio, 0);
      }
      totalPagar = totalPagar - totalAnticipos;

      // Calculate Debt (Excluded services)
      totalDeuda = excludedServices.reduce((acc, s) => acc + calculateServicePayment(s), 0);

      // List for UI (All services with status)
      const uiServices = servicios.map(s => ({
          ...s,
          selected: !!selectedServices[s.id],
          potentialPayment: calculateServicePayment(s)
      }));

      return {
          config,
          servicios: includedServices, // For handleSave (tenantId check)
          anticipos,
          detalles, // For handleSave
          uiServices, // For Table Render
          isTenant4,
          totales: {
              totalServicios,
              totalValorPagado,
              totalRepuestos,
              baseComisionable,
              totalPagar,
              totalAnticipos,
              totalDeuda,
              porcentajeAplicado: config?.tipo === "PORCENTAJE" ? config.valorParticipacion : null,
              salarioFijo: config?.tipo === "SALARIO_FIJO" ? config.salarioBase : null,
              ivaAplicado: ivaPercentage > 0
          }
      };
  }, [rawData, ivaPercentage, selectedServices]);

  const fetchNominas = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const res = await getNominas(token);
    if (res.success) {
      setNominas(res.data);
    } else {
      toast.error(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!roleLoading && role !== "ADMIN" && role !== "SU_ADMIN") {
      toast.error("Acceso denegado.");
      router.push("/dashboard");
    }
  }, [role, roleLoading, router]);

  useEffect(() => {
    const load = async () => {
        await fetchNominas();
    };
    load();
  }, [fetchNominas]);

  const handleOpenModal = async () => {
    setIsModalOpen(true);
    setStep(1);
    setRawData(null);
    setFechaInicio("");
    setFechaFin("");
    setSelectedTecnico("");
    setIvaPercentage(0);
    
    const token = localStorage.getItem("token");
    if (token) {
        const res = await getTecnicos(token);
        if (res.success) {
            setTecnicos(res.data);
        } else {
             toast.error(res.error);
        }
    }
  };

  const handleCalculate = async () => {
    if (!selectedTecnico || !fechaInicio || !fechaFin) {
        toast.error("Complete todos los campos");
        return;
    }

    setCalculating(true);
    const token = localStorage.getItem("token");
    if (token) {
        const res = await getServiciosPendientes(
            token, 
            parseInt(selectedTecnico), 
            fechaInicio, 
            fechaFin
        );

        if (res.success) {
            if (!res.configPago && res.configPago !== undefined) {
                 toast.warning("El usuario no tiene configuración de pagos.");
            }
            
            const initialSelection: Record<number, boolean> = {};
            res.data.forEach((s) => {
                initialSelection[s.id] = true;
            });
            setSelectedServices(initialSelection);

            setRawData({
                config: res.configPago,
                servicios: res.data,
                anticipos: res.anticipos || []
            });
            setStep(2);
        } else {
            toast.error(res.error);
        }
    }
    setCalculating(false);
  };

  const handleSave = async () => {
      if (!previewData) return;
      
      const token = localStorage.getItem("token");
      if (!token) return;

      const payload = {
          usuarioId: parseInt(selectedTecnico),
          tenantId: previewData.servicios[0]?.tenantId, // Tomar del primer servicio o del usuario
          fechaInicio,
          fechaFin,
          ...previewData.totales,
          detalles: previewData.detalles.map(d => ({
              id: d.id,
              type: d.type,
              valorServicio: d.valorServicio
          }))
      };

      const res = await createNomina(token, payload);
      if (res.success) {
          toast.success("Nómina creada exitosamente");
          setIsModalOpen(false);
          fetchNominas();
      } else {
          toast.error(res.error || "Error al guardar");
      }
  };

  const handleUpdateRepuestoTecnico = async (ordenId: number, valor: number) => {
      if (rawData) {
          const updatedServices = rawData.servicios.map(s => 
              s.id === ordenId ? { ...s, valorRepuestosTecnico: valor } : s
          );
          setRawData({ ...rawData, servicios: updatedServices });
      }

      const token = localStorage.getItem("token");
      if (token) {
          const res = await updateValorRepuestosTecnico(token, ordenId, valor);
          if (!res.success) {
              toast.error("Error al actualizar repuesto");
          }
      }
  };

  const handleViewNomina = async (id: number) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    
    const res = await getNominaById(token, id);
    if (res.success) {
        setViewNomina(res.data as unknown as NominaView);
        setIsViewModalOpen(true);
    } else {
        toast.error(res.error || "Error al cargar detalles");
    }
  };

  const handleUpdateEstado = async (id: number, nuevoEstado: "PAGADO" | "ANULADO") => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setUpdatingEstado(true);
    const res = await updateNominaEstado(token, id, nuevoEstado);
    if (res.success) {
        toast.success(`Nómina marcada como ${nuevoEstado}`);
        // Actualizar vista local
        setViewNomina((prev) => prev ? { ...prev, estado: nuevoEstado } : null);
        fetchNominas();
    } else {
        toast.error(res.error || "Error al actualizar");
    }
    setUpdatingEstado(false);
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
              <Calculator className="h-6 w-6 text-indigo-600" />
              Nómina y Pagos
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Historial de pagos y generación de nuevos cortes.
            </p>
          </div>
          <Button onClick={handleOpenModal} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Nómina
          </Button>
        </div>
      </div>
      
      <div className="flex-1 p-8 bg-slate-50 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {nominas.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-dashed border-slate-300">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-slate-900">No hay nóminas registradas</h3>
                <p className="text-slate-500 max-w-sm mx-auto mt-1">
                    Comienza generando el primer corte de pago para tus técnicos.
                </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Técnico</TableHead>
                            <TableHead>Periodo</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Total Pagado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {nominas.map((nomina) => (
                            <TableRow key={nomina.id}>
                                <TableCell className="font-medium">#{nomina.id}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium text-slate-900">
                                            {nomina.usuario.nombre} {nomina.usuario.apellido}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center text-sm text-slate-600">
                                        <Calendar className="h-3 w-3 mr-1" />
                                        {format(new Date(nomina.fechaInicio), "dd MMM")} - {format(new Date(nomina.fechaFin), "dd MMM yyyy", { locale: es })}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={nomina.estado === "PAGADO" ? "default" : "secondary"} className={
                                        nomina.estado === "PAGADO" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" :
                                        nomina.estado === "BORRADOR" ? "bg-amber-100 text-amber-700 hover:bg-amber-100" : ""
                                    }>
                                        {nomina.estado}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right font-bold text-slate-900">
                                    ${nomina.totalPagar.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => handleViewNomina(nomina.id)}>
                                        <Eye className="h-4 w-4 text-slate-500" />
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

      {/* Modal Nueva Nómina */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>Generar Nueva Nómina</DialogTitle>
                <DialogDescription>
                    {step === 1 ? "Selecciona el técnico y el periodo a liquidar." : "Revisa el detalle antes de guardar."}
                </DialogDescription>
            </DialogHeader>

            {step === 1 && (
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Técnico</Label>
                        <Select value={selectedTecnico} onValueChange={setSelectedTecnico}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar técnico..." />
                            </SelectTrigger>
                            <SelectContent>
                                {tecnicos.map(t => (
                                    <SelectItem key={t.id} value={t.id.toString()}>
                                        {t.nombre} {t.apellido}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Fecha Inicio</Label>
                            <Input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Fecha Fin</Label>
                            <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
                        </div>
                    </div>
                </div>
            )}

            {step === 2 && previewData && (
                <div className="space-y-6 py-4">
                    <div className="w-1/3 space-y-2">
                         <Label htmlFor="ivaInput" className="text-sm font-semibold text-slate-700">Porcentaje IVA (%)</Label>
                         <Input 
                            id="ivaInput" 
                            type="number" 
                            min="0" 
                            max="100" 
                            value={ivaPercentage} 
                            onChange={(e) => setIvaPercentage(Number(e.target.value))} 
                            placeholder="0"
                         />
                         <p className="text-xs text-slate-500">Ingresa el % para descontar del recaudo antes de comisión.</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card className="bg-slate-50 border-slate-200">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-500">Recaudo Total</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-slate-700">
                                    ${previewData.totales.totalValorPagado.toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>
                        
                        {!previewData.isTenant4 && (
                        <Card className="bg-slate-50 border-slate-200">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-500">Total Repuestos</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-rose-600">
                                    -${previewData.totales.totalRepuestos.toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>
                        )}

                        <Card className="bg-slate-50 border-slate-200">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-500">Base Comisionable</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-slate-700">
                                    ${Math.round(previewData.totales.baseComisionable).toLocaleString()}
                                </div>
                                {previewData.totales.ivaAplicado && (
                                    <div className="text-[10px] text-indigo-600 font-medium">Sin IVA (19%)</div>
                                )}
                            </CardContent>
                        </Card>

                         <Card className="bg-slate-50 border-slate-200">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-500">Anticipos</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-rose-600">
                                    -${(previewData.totales.totalAnticipos || 0).toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-indigo-600 border-indigo-700">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-indigo-100">Total a Pagar</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-white">
                                    ${Math.round(previewData.totales.totalPagar).toLocaleString()}
                                </div>
                                <div className="text-[10px] text-indigo-200 font-medium">
                                    {previewData.config?.tipo === "PORCENTAJE" ? `${previewData.config.valorParticipacion}% comisión` : "Salario Fijo"}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border rounded-md overflow-hidden">
                            <div className="bg-slate-50 px-4 py-2 border-b font-medium text-sm flex justify-between items-center">
                                <span className="font-semibold text-slate-700">Detalle de Servicios</span>
                                <Badge variant="outline" className="bg-white">{previewData.servicios.length} encontrados</Badge>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                <Table>
                                    <TableHeader className="bg-white">
                                        <TableRow>
                                            <TableHead className="w-[50px]"></TableHead>
                                            <TableHead className="h-10">Servicio</TableHead>
                                            {!previewData.isTenant4 && <TableHead className="h-10 text-center text-xs w-[80px]">Rep. x Téc.</TableHead>}
                                            <TableHead className="h-10 text-right">Cobrado</TableHead>
                                            <TableHead className="h-10 text-right">Pago Téc.</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewData.uiServices.map((s) => (
                                            <TableRow key={s.id} className={!s.selected ? "opacity-50 bg-slate-50" : ""}>
                                                <TableCell className="py-3">
                                                    <Checkbox 
                                                        checked={s.selected}
                                                        onCheckedChange={(checked) => {
                                                            setSelectedServices(prev => ({ ...prev, [s.id]: !!checked }));
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <div className="text-sm font-medium text-slate-900">{s.servicio.nombre}</div>
                                                    <div className="text-xs text-slate-500">
                                                        {s.fechaVisita ? format(new Date(s.fechaVisita), "dd/MM/yyyy") : "N/A"}
                                                    </div>
                                                </TableCell>
                                                {!previewData.isTenant4 && (
                                                <TableCell className="py-3 text-center">
                                                    {s.valorRepuestos > 0 && (
                                                        <Input 
                                                            type="number"
                                                            className="h-8 w-20 text-right text-xs"
                                                            value={s.valorRepuestosTecnico}
                                                            onChange={(e) => handleUpdateRepuestoTecnico(s.id, Number(e.target.value))}
                                                            max={s.valorRepuestos}
                                                            min={0}
                                                        />
                                                    )}
                                                </TableCell>
                                                )}
                                                <TableCell className="text-right py-3 text-sm">
                                                    ${s.valorPagado.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right py-3 text-sm font-bold text-indigo-700">
                                                    {s.selected ? `$${s.potentialPayment.toLocaleString()}` : <span className="text-slate-400 line-through">${s.potentialPayment.toLocaleString()}</span>}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                         <div className="border rounded-md overflow-hidden">
                            <div className="bg-slate-50 px-4 py-2 border-b font-medium text-sm flex justify-between items-center">
                                <span className="font-semibold text-slate-700">Detalle de Anticipos</span>
                                <Badge variant="outline" className="bg-white">{previewData.anticipos.length} encontrados</Badge>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                <Table>
                                    <TableHeader className="bg-white">
                                        <TableRow>
                                            <TableHead className="h-10">Fecha</TableHead>
                                            <TableHead className="h-10">Razón</TableHead>
                                            <TableHead className="h-10 text-right">Monto</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewData.anticipos.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center text-slate-500 py-4">No hay anticipos en este periodo</TableCell>
                                            </TableRow>
                                        ) : (
                                            previewData.anticipos.map((a, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="py-3 text-sm text-slate-600">
                                                        {format(new Date(a.created_at), "dd/MM/yyyy")}
                                                    </TableCell>
                                                    <TableCell className="py-3 text-sm font-medium text-slate-900">
                                                        {a.razon || "-"}
                                                    </TableCell>
                                                    <TableCell className="text-right py-3 text-sm font-bold text-rose-600">
                                                        -${a.monto.toLocaleString()}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <DialogFooter>
                {step === 1 ? (
                    <Button onClick={handleCalculate} disabled={calculating}>
                        {calculating ? "Calculando..." : "Calcular Nómina"}
                    </Button>
                ) : (
                    <div className="flex w-full justify-between">
                        <Button variant="ghost" onClick={() => setStep(1)}>Atrás</Button>
                        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirmar y Crear
                        </Button>
                    </div>
                )}
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ver Detalle de Nómina */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                    Detalle de Nómina #{viewNomina?.id}
                    <Badge variant={viewNomina?.estado === "PAGADO" ? "default" : "secondary"} className={
                        viewNomina?.estado === "PAGADO" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" :
                        viewNomina?.estado === "BORRADOR" ? "bg-amber-100 text-amber-700 hover:bg-amber-100" : 
                        viewNomina?.estado === "ANULADO" ? "bg-rose-100 text-rose-700 hover:bg-rose-100" : ""
                    }>
                        {viewNomina?.estado}
                    </Badge>
                </DialogTitle>
                <DialogDescription>
                    Resumen financiero y listado de servicios liquidados.
                </DialogDescription>
            </DialogHeader>

            {viewNomina && (
                <div className="space-y-6 py-4">
                    <div className="flex justify-between items-start border-b pb-4">
                        <div>
                            <div className="text-base font-semibold text-slate-900">
                                {viewNomina.usuario.nombre} {viewNomina.usuario.apellido}
                            </div>
                            <div className="text-sm text-slate-500">{viewNomina.usuario.rol}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Periodo de Liquidación</div>
                            <div className="text-sm font-medium">
                                {format(new Date(viewNomina.fechaInicio), "dd MMMM", { locale: es })} — {format(new Date(viewNomina.fechaFin), "dd MMMM yyyy", { locale: es })}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card className="bg-slate-50 border-slate-200">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-500">Recaudo</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-slate-700">
                                    ${viewNomina.totalValorPagado.toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-50 border-slate-200">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-500">Repuestos</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-rose-600">
                                    -${viewNomina.totalRepuestos.toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-50 border-slate-200">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-500">Base</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-slate-700">
                                    ${viewNomina.baseComisionable.toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>
                        
                        {/* Como no guardamos el total de anticipos en la DB, lo calculamos al vuelo o mostramos si existe en la data recibida */}
                        <Card className="bg-slate-50 border-slate-200">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-500">Anticipos</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-rose-600">
                                    -${viewNomina.anticipos ? viewNomina.anticipos.reduce((acc, a) => acc + a.monto, 0).toLocaleString() : "0"}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-indigo-600 border-indigo-700">
                            <CardHeader className="pb-1 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-indigo-100">Pago Total</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="text-xl font-bold text-white">
                                    ${viewNomina.totalPagar.toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Pending Services Summary Card if exists */}
                    {viewNomina.serviciosPendientes && viewNomina.serviciosPendientes.length > 0 && (
                         <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
                            <div>
                                <h4 className="font-semibold text-amber-800 flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Servicios Pendientes / Excluidos
                                </h4>
                                <p className="text-sm text-amber-600 mt-1">
                                    Servicios finalizados en este periodo que no fueron incluidos en el pago.
                                </p>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-amber-700">
                                    {viewNomina.serviciosPendientes.length}
                                </div>
                                <div className="text-xs text-amber-600 font-medium uppercase">Servicios</div>
                            </div>
                         </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border rounded-md overflow-hidden">
                             <div className="bg-slate-50 px-4 py-2 border-b font-medium text-sm flex justify-between items-center">
                                <span className="font-semibold text-slate-700">Detalle de Servicios Pagados</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead className="h-10">Servicio</TableHead>
                                            <TableHead className="h-10 text-right">Valor Total</TableHead>
                                            <TableHead className="h-10 text-right">Valor Liquidado</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {viewNomina.detalles.map((d) => (
                                            <TableRow key={d.id}>
                                                <TableCell className="py-3">
                                                    <div className="text-sm font-medium text-slate-900">{d.orden.servicio.nombre}</div>
                                                    <div className="text-xs text-slate-500">
                                                        #{d.ordenId || d.citaId || d.id}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right py-3 text-sm font-medium">
                                                    ${d.orden.valorPagado.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right py-3 text-sm font-bold text-indigo-700">
                                                    ${d.valorServicio.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="border rounded-md overflow-hidden">
                                <div className="bg-slate-50 px-4 py-2 border-b font-medium text-sm flex justify-between items-center">
                                    <span className="font-semibold text-slate-700">Anticipos Descontados</span>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    <Table>
                                        <TableHeader className="bg-white">
                                            <TableRow>
                                                <TableHead className="h-10">Fecha</TableHead>
                                                <TableHead className="h-10">Razón</TableHead>
                                                <TableHead className="h-10 text-right">Monto</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {!viewNomina.anticipos || viewNomina.anticipos.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={3} className="text-center text-slate-500 py-4">No hay anticipos en este periodo</TableCell>
                                                </TableRow>
                                            ) : (
                                                viewNomina.anticipos.map((a, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell className="py-3 text-sm text-slate-600">
                                                            {format(new Date(a.created_at), "dd/MM/yyyy")}
                                                        </TableCell>
                                                        <TableCell className="py-3 text-sm font-medium text-slate-900">
                                                            {a.razon || "-"}
                                                        </TableCell>
                                                        <TableCell className="text-right py-3 text-sm font-bold text-rose-600">
                                                            -${a.monto.toLocaleString()}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                            
                            {viewNomina.serviciosPendientes && viewNomina.serviciosPendientes.length > 0 && (
                                <div className="border rounded-md overflow-hidden border-amber-200">
                                    <div className="bg-amber-50 px-4 py-2 border-b border-amber-200 font-medium text-sm flex justify-between items-center">
                                        <span className="font-semibold text-amber-800">Servicios Pendientes de Pago</span>
                                        <Badge variant="secondary" className="bg-white text-amber-700 border-amber-200">
                                            {viewNomina.serviciosPendientes.length}
                                        </Badge>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto bg-amber-50/30">
                                        <Table>
                                            <TableHeader className="bg-amber-50/50">
                                                <TableRow>
                                                    <TableHead className="h-10 text-amber-900">Servicio</TableHead>
                                                    <TableHead className="h-10 text-right text-amber-900">Fecha</TableHead>
                                                    <TableHead className="h-10 text-right text-amber-900">Valor Cobrado</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {viewNomina.serviciosPendientes.map((s) => (
                                                    <TableRow key={s.id} className="hover:bg-amber-50">
                                                        <TableCell className="py-3">
                                                            <div className="text-sm font-medium text-slate-900">{s.servicio.nombre}</div>
                                                            <div className="text-xs text-slate-500">#{s.id}</div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-3 text-sm text-slate-600">
                                                            {s.fechaVisita ? format(new Date(s.fechaVisita), "dd/MM/yyyy") : "N/A"}
                                                        </TableCell>
                                                        <TableCell className="text-right py-3 text-sm font-medium text-slate-900">
                                                            ${s.valorPagado.toLocaleString()}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <DialogFooter className="flex justify-between items-center w-full">
                <div className="flex gap-2">
                    {viewNomina?.estado === "BORRADOR" && (
                        <>
                            <Button 
                                variant="outline" 
                                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                                onClick={() => handleUpdateEstado(viewNomina.id, "ANULADO")}
                                disabled={updatingEstado}
                            >
                                Anular
                            </Button>
                            <Button 
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => handleUpdateEstado(viewNomina.id, "PAGADO")}
                                disabled={updatingEstado}
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Marcar como Pagado
                            </Button>
                        </>
                    )}
                </div>
                <Button variant="ghost" onClick={() => setIsViewModalOpen(false)}>Cerrar</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}