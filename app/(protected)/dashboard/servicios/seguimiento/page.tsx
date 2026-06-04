"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { 
  Phone, 
  MapPin, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Clock,
  AlertCircle
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterDateRange } from "@/components/ui/filter-date-range";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { 
  getSugerenciasRefuerzo, 
  getSeguimientoTrimestral, 
  rechazarSeguimiento, 
  registrarRefuerzo,
  type SugerenciaOrden
} from "./actions";

export default function SeguimientoPage() {
  const searchParams = useSearchParams();
  const [ordenesRefuerzo, setOrdenesRefuerzo] = useState<SugerenciaOrden[]>([]);
  const [ordenes3Meses, setOrdenes3Meses] = useState<SugerenciaOrden[]>([]);
  const [loadingRefuerzo, setLoadingRefuerzo] = useState(false);
  const [loading3Meses, setLoading3Meses] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"PENDIENTE" | "RECHAZADO" | "TODOS">("PENDIENTE");
  
  // Modal state
  const [selectedOrder, setSelectedOrder] = useState<SugerenciaOrden | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [processing, setProcessing] = useState(false);

  const loadSugerenciasRefuerzo = async () => {
    setLoadingRefuerzo(true);
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("No autorizado");
      setLoadingRefuerzo(false);
      return;
    }
    
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;

    const res = await getSugerenciasRefuerzo(token, {
      fechaInicio: startDate,
      fechaFin: endDate,
      estado: statusFilter
    });

    if (res.error) {
      toast.error(res.error);
    } else if (res.ordenes) {
      setOrdenesRefuerzo(res.ordenes);
    }
    setLoadingRefuerzo(false);
  };

  const load3Months = async () => {
    setLoading3Meses(true);
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("No autorizado");
      setLoading3Meses(false);
      return;
    }

    const res = await getSeguimientoTrimestral(token, {
      estado: statusFilter
    });
    
    if (res.error) {
      toast.error(res.error);
    } else if (res.ordenes) {
      setOrdenes3Meses(res.ordenes);
    }
    setLoading3Meses(false);
  };

  useEffect(() => {
    loadSugerenciasRefuerzo();
    load3Months();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, statusFilter]);

  const handleRechazar = async (ordenId: number, type: 'refuerzo' | '3') => {
    if (!confirm("¿Está seguro de descartar esta sugerencia?")) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await rechazarSeguimiento(token, ordenId);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Sugerencia descartada");
      // Remove from list
      if (type === 'refuerzo') {
        setOrdenesRefuerzo(prev => prev.filter(o => o.id !== ordenId));
      } else {
        setOrdenes3Meses(prev => prev.filter(o => o.id !== ordenId));
      }
    }
  };

  const openRegistrarModal = (orden: SugerenciaOrden) => {
    setSelectedOrder(orden);
    // Default values: Date = Tomorrow, Amount = 0 or generic
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Format for datetime-local: YYYY-MM-DDTHH:mm
    const year = tomorrow.getFullYear();
    const month = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
    const day = tomorrow.getDate().toString().padStart(2, '0');
    const hours = tomorrow.getHours().toString().padStart(2, '0');
    const minutes = tomorrow.getMinutes().toString().padStart(2, '0');
    
    setNewDate(`${year}-${month}-${day}T${hours}:${minutes}`);

    // Calculate suggested amount: 50% of value, min 50,000 if value < 100,000
    const serviceValue = orden.valorCotizado ? Number(orden.valorCotizado) : 0;
    let suggestedAmount = serviceValue * 0.5;
    if (serviceValue > 0 && serviceValue < 100000) {
      suggestedAmount = 50000;
    }
    
    setNewAmount(suggestedAmount > 0 ? suggestedAmount.toString() : "");
    setIsModalOpen(true);
  };

  const handleConfirmRegistrar = async () => {
    if (!selectedOrder || !newDate || !newAmount) {
      toast.error("Complete todos los campos");
      return;
    }

    setProcessing(true);
    const token = localStorage.getItem("token");
    if (!token) {
      setProcessing(false);
      return;
    }

    const res = await registrarRefuerzo(
      token, 
      selectedOrder.id, 
      new Date(`${newDate}:00Z`),
      parseFloat(newAmount)
    );

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Refuerzo registrado exitosamente");
      setIsModalOpen(false);
      // Remove from lists
      setOrdenesRefuerzo(prev => prev.filter(o => o.id !== selectedOrder.id));
      setOrdenes3Meses(prev => prev.filter(o => o.id !== selectedOrder.id));
    }
    setProcessing(false);
  };

  const formatDateUTC = (dateString: Date | null) => {
    if (!dateString) return { date: "S/F", time: null };
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    
    const displayDate = new Date(year, month, day);
    
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return { 
      date: format(displayDate, "dd MMM yyyy", { locale: es }), 
      time: timeStr !== "00:00" ? timeStr : null 
    };
  };

  const renderTable = (ordenes: SugerenciaOrden[], type: 'refuerzo' | '3') => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Orden Original</TableHead>
            <TableHead>Fecha Visita</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Servicio</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                No se encontraron resultados con los filtros seleccionados.
              </TableCell>
            </TableRow>
          ) : (
            ordenes.map((orden) => {
               const dateTime = formatDateUTC(orden.fechaVisita);
               return (
              <TableRow key={orden.id}>
                <TableCell className="font-medium">#{orden.numeroOrden ?? orden.id}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{dateTime.date}</span>
                    {dateTime.time && (
                      <span className="text-xs text-slate-500">{dateTime.time}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{orden.cliente.nombre} {orden.cliente.apellido}</span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {orden.cliente.telefono}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{orden.servicio.nombre}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm text-slate-600">
                    <MapPin className="h-3 w-3" />
                    {orden.direccion?.direccion || "Sin dirección"}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleRechazar(orden.id, type)}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Rechazar
                    </Button>
                    <Button 
                      size="sm" 
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => openRegistrarModal(orden)}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Registrar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}) 
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Seguimiento de Servicios
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Monitoreo y trazabilidad de los servicios en tiempo real
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Filtros:</span>
              <FilterDateRange />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Estado:</span>
              <Select 
                value={statusFilter} 
                onValueChange={(val) => setStatusFilter(val as "PENDIENTE" | "RECHAZADO" | "TODOS")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDIENTE">Pendientes</SelectItem>
                  <SelectItem value="RECHAZADO">Rechazados</SelectItem>
                  <SelectItem value="TODOS">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Section Refuerzo (7/14 Days) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-500" />
                  Sugerencias de Refuerzo (7/14 días)
                </CardTitle>
                <CardDescription>
                  Servicios realizados hace 7 o 14 días que podrían requerir refuerzo.
                </CardDescription>
              </div>
              <Button onClick={loadSugerenciasRefuerzo} disabled={loadingRefuerzo} variant="outline">
                {loadingRefuerzo ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Cargar Sugerencias
              </Button>
            </CardHeader>
            <CardContent>
              {renderTable(ordenesRefuerzo, 'refuerzo')}
            </CardContent>
          </Card>

          {/* Section 3 Months */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Seguimiento Trimestral
                </CardTitle>
                <CardDescription>
                  Clientes atendidos hace 3 meses sin refuerzos registrados.
                </CardDescription>
              </div>
              <Button onClick={load3Months} disabled={loading3Meses} variant="outline">
                {loading3Meses ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Cargar Seguimiento
              </Button>
            </CardHeader>
            <CardContent>
              {renderTable(ordenes3Meses, '3')}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Register Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Registrar Refuerzo</DialogTitle>
            <DialogDescription>
              Crear nueva orden de refuerzo para {selectedOrder?.cliente.nombre} {selectedOrder?.cliente.apellido}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date" className="text-right">
                Fecha
              </Label>
              <Input
                id="date"
                type="datetime-local"
                className="col-span-3"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="amount" className="text-right">
                Monto
              </Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                className="col-span-3"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmRegistrar} disabled={processing}>
              {processing ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}