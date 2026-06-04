"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, Wallet, AlertCircle, CheckCircle } from "lucide-react";
import { 
  getTechniciansFinancialStatus, 
  getConsignacionHistory, 
  getDeclaracionHistory, 
  TechnicianFinancialStatus, 
  ConsignacionHistoryItem, 
  DeclaracionHistoryItem 
} from "./actions";
import { ConsignationModal } from "@/components/contabilidad/recaudo/consignation-modal";
import { ConsignacionHistoryTable, DeclaracionHistoryTable } from "@/components/contabilidad/recaudo/history-tables";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function RecaudoPage() {
  const [loading, setLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianFinancialStatus[]>([]);
  const [consignaciones, setConsignaciones] = useState<ConsignacionHistoryItem[]>([]);
  const [declaraciones, setDeclaraciones] = useState<DeclaracionHistoryItem[]>([]);
  
  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<{id: number, nombre: string} | null>(null);

  const loadFinancialData = async () => {
    const token = localStorage.getItem("token");
    if (token) {
      // Load all data in parallel
      const [techRes, consigRes, decRes] = await Promise.all([
        getTechniciansFinancialStatus(token),
        getConsignacionHistory(token),
        getDeclaracionHistory(token)
      ]);

      if (techRes.data) setTechnicians(techRes.data);
      else if (techRes.error) toast.error(techRes.error);

      if (consigRes.data) setConsignaciones(consigRes.data);
      if (decRes.data) setDeclaraciones(decRes.data);
    }
  };

  useEffect(() => {
    let ignore = false;

    const init = async () => {
      await loadFinancialData();
      if (!ignore) {
        setLoading(false);
      }
    };

    init();
    
    return () => {
      ignore = true;
    };
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    await loadFinancialData();
    setLoading(false);
  };

  const handleOpenModal = (tech: TechnicianFinancialStatus) => {
    setSelectedTechnician({
        id: tech.id,
        nombre: `${tech.nombre} ${tech.apellido}`
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedTechnician(null);
    handleRefresh(); // Refresh data after closing (potential update)
  };

  const totalCartera = technicians.reduce((sum, t) => sum + t.saldoPendiente, 0);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Gestión de Recaudo (Efectivo)</h1>
            <p className="text-sm text-slate-600 mt-1">
              Control de saldos, historial de consignaciones y declaraciones de efectivo.
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
            
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cartera Total en Calle</CardTitle>
                        <Wallet className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-700">
                            ${totalCartera.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">Suma de saldos pendientes de todos los técnicos</p>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Técnicos con Saldo</CardTitle>
                        <AlertCircle className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-700">
                            {technicians.filter(t => t.saldoPendiente > 0).length}
                        </div>
                        <p className="text-xs text-muted-foreground">Usuarios con dinero pendiente por legalizar</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs & Tables */}
            <Tabs defaultValue="balance" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="balance">Estado Financiero</TabsTrigger>
                    <TabsTrigger value="consignaciones">Historial Consignaciones</TabsTrigger>
                    <TabsTrigger value="declaraciones">Declaraciones Efectivo</TabsTrigger>
                </TabsList>

                <TabsContent value="balance">
                    <Card className="border-slate-200 shadow-sm">
                        <div className="rounded-md">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="w-[300px]">Técnico</TableHead>
                                        <TableHead>Saldo Pendiente</TableHead>
                                        <TableHead>Órdenes</TableHead>
                                        <TableHead>Última Transferencia</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acción</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center">
                                                <div className="flex justify-center items-center">
                                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400 mr-2" />
                                                    <span className="text-slate-500">Cargando información financiera...</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : technicians.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                                                No se encontraron técnicos activos.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        technicians.map((tech) => (
                                            <TableRow key={tech.id}>
                                                <TableCell className="font-medium">
                                                    {tech.nombre} {tech.apellido}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`font-bold ${tech.saldoPendiente > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                        ${tech.saldoPendiente.toLocaleString()}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    {tech.ordenesPendientesCount > 0 ? (
                                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                            {tech.ordenesPendientesCount} pendientes
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-slate-400 text-sm">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-600">
                                                    {tech.ultimaTransferencia 
                                                        ? format(new Date(tech.ultimaTransferencia), "d MMM yyyy", { locale: es })
                                                        : "Nunca"
                                                    }
                                                </TableCell>
                                                <TableCell>
                                                    {tech.diasSinTransferir > 15 && tech.saldoPendiente > 0 ? (
                                                        <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
                                                            {tech.diasSinTransferir} días sin transf.
                                                        </Badge>
                                                    ) : tech.saldoPendiente === 0 ? (
                                                        <div className="flex items-center text-green-600 text-sm">
                                                            <CheckCircle className="h-3 w-3 mr-1" /> Al día
                                                        </div>
                                                    ) : (
                                                        <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                                                            Normal ({tech.diasSinTransferir} días)
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button 
                                                        size="sm" 
                                                        className="bg-blue-600 hover:bg-blue-700"
                                                        onClick={() => handleOpenModal(tech)}
                                                        disabled={tech.saldoPendiente <= 0}
                                                    >
                                                        Registrar Consignación
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="consignaciones">
                    <ConsignacionHistoryTable data={consignaciones} onRefresh={handleRefresh} />
                </TabsContent>

                <TabsContent value="declaraciones">
                    <DeclaracionHistoryTable data={declaraciones} onRefresh={handleRefresh} />
                </TabsContent>
            </Tabs>
        </div>
      </div>

      {modalOpen && selectedTechnician && (
        <ConsignationModal 
          key={selectedTechnician.id}
          isOpen={modalOpen}
          onClose={handleCloseModal}
          tecnicoId={selectedTechnician.id}
          tecnicoNombre={selectedTechnician.nombre}
        />
      )}
    </div>
  );
}
