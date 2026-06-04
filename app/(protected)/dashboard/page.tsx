"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  DollarSign, 
  Calendar, 
  CheckCircle, 
  Clock, 
  Activity, 
  TrendingUp,
  Briefcase
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDashboardStats, getUnpaidServicesDetails } from "./actions";
import { toast } from "sonner";

interface DashboardStats {
  serviciosAgendadosHoy: number;
  serviciosRealizadosHoy: number;
  serviciosEnProcesoHoy: number;
  serviciosEnProcesoTotal: number;
  serviciosRealizadosTotal: number;
  serviciosTotalesHistorico: number;
  ingresosHoy: number;
  ingresosTotal: number;
  sinCobrarHoy: number;
  sinCobrarTotal: number;
  serviciosCanceladosTotal: number;
  tasaCancelacionTotal: number;
  serviciosFinalizadosTotal: number;
  serviciosCanceladosHoy: number;
  serviciosFinalizadosHoy: number;
  tasaCancelacionHoy: number;
  topServicios: { nombre: string; cantidad: number }[];
}

interface UnpaidService {
  id: number;
  numeroOrden: string | null;
  fechaVisita: Date | null;
  cliente: {
    nombre: string | null;
    apellido: string | null;
    empresa: { nombre: string } | null;
  };
  servicio: { nombre: string };
  metodoPago: { nombre: string } | null;
  estadoServicio: { nombre: string };
  total: number;
  pagado: number;
  pendiente: number;
}

function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-[60px] mb-1" />
        <Skeleton className="h-3 w-[120px]" />
      </CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Section: Resumen de Hoy Skeleton */}
      <div>
        <Skeleton className="h-7 w-48 mb-4" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Section: Estadísticas Globales Skeleton */}
      <div>
        <Skeleton className="h-7 w-48 mb-4" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Section: Top Servicios Skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center">
                   <div className="w-full space-y-2">
                     <div className="flex items-center justify-between">
                       <Skeleton className="h-4 w-[150px]" />
                       <Skeleton className="h-4 w-[30px]" />
                     </div>
                     <Skeleton className="h-2 w-full" />
                   </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* Accesos Rápidos Skeleton */}
        <Card className="col-span-3">
           <CardHeader>
             <Skeleton className="h-6 w-32" />
           </CardHeader>
           <CardContent>
             <div className="grid grid-cols-2 gap-4">
               {Array.from({ length: 4 }).map((_, i) => (
                 <Skeleton key={i} className="h-24 w-full rounded-lg" />
               ))}
             </div>
           </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [unpaidModal, setUnpaidModal] = useState<{
    isOpen: boolean;
    type: 'today' | 'total';
    loading: boolean;
    data: UnpaidService[];
  }>({
    isOpen: false,
    type: 'today',
    loading: false,
    data: [],
  });
  
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const result = await getDashboardStats(token);
      if (result.error) {
        toast.error(result.error);
        if (result.error === "No autorizado") router.push("/sign-in");
      } else if (result.stats) {
        setStats(result.stats);
      }
      setLoading(false);
    };

    fetchData();
  }, [router]);

  const handleOpenUnpaidModal = async (type: 'today' | 'total') => {
    setUnpaidModal(prev => ({ ...prev, isOpen: true, type, loading: true, data: [] }));
    
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/sign-in");
      return;
    }

    const result = await getUnpaidServicesDetails(token, type);
    
    if (result.error) {
      toast.error(result.error);
      setUnpaidModal(prev => ({ ...prev, isOpen: false, loading: false }));
    } else if (result.services) {
      setUnpaidModal(prev => ({ 
        ...prev, 
        loading: false, 
        data: result.services as UnpaidService[] 
      }));
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="flex-1 space-y-4 p-8 pt-6 bg-slate-50 overflow-y-auto h-full">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h2>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : stats && (
        <div className="space-y-8">
          {/* Section: Resumen de Hoy */}
          <div>
            <h3 className="text-lg font-medium text-slate-600 mb-4">Resumen de Hoy</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Servicios Agendados
                  </CardTitle>
                  <Calendar className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.serviciosAgendadosHoy}</div>
                  <p className="text-xs text-muted-foreground">
                    Para el día de hoy
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    En Proceso (Hoy)
                  </CardTitle>
                  <Clock className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.serviciosEnProcesoHoy}</div>
                  <p className="text-xs text-muted-foreground">
                    Actualmente en ejecución
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Realizados Hoy
                  </CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.serviciosRealizadosHoy}</div>
                  <p className="text-xs text-muted-foreground">
                    Completados exitosamente
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Ingresos Hoy
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(stats.ingresosHoy)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total recaudado hoy
                  </p>
                </CardContent>
              </Card>

              <Card className="border-amber-100">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Pendientes Liquidar (Hoy)
                  </CardTitle>
                  <Clock className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">
                    {stats.serviciosFinalizadosHoy}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Terminados por liquidar hoy
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-100">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Cancelados Hoy
                  </CardTitle>
                  <Activity className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {stats.serviciosCanceladosHoy}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No concretados hoy
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Tasa Cancelación Hoy
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-700">
                    {stats.tasaCancelacionHoy.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    % sobre agendados hoy
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:bg-slate-50 transition-colors border-red-200"
                onClick={() => handleOpenUnpaidModal('today')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Sin Cobrar Hoy
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-500">
                    {formatCurrency(stats.sinCobrarHoy)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pendiente de cobro hoy (Click para ver detalle)
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Section: Estadísticas Globales */}
          <div>
             <h3 className="text-lg font-medium text-slate-600 mb-4">Estadísticas Globales</h3>
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
               <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    En Proceso (Total)
                  </CardTitle>
                  <Activity className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.serviciosEnProcesoTotal}</div>
                  <p className="text-xs text-muted-foreground">
                    Total órdenes activas
                  </p>
                </CardContent>
              </Card>

              <Card className="border-amber-100">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Pendientes Liquidar
                  </CardTitle>
                  <Clock className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">
                    {stats.serviciosFinalizadosTotal}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Trabajo terminado (por facturar)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Realizados (Histórico)
                  </CardTitle>
                  <CheckCircle className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.serviciosRealizadosTotal}</div>
                  <p className="text-xs text-muted-foreground">
                    Total servicios liquidados
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Servicios Totales
                  </CardTitle>
                  <Briefcase className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.serviciosTotalesHistorico}</div>
                  <p className="text-xs text-muted-foreground">
                    Histórico de órdenes
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Ingresos Totales
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-700" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-700">
                    {formatCurrency(stats.ingresosTotal)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total histórico recaudado
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:bg-slate-50 transition-colors border-red-200"
                onClick={() => handleOpenUnpaidModal('total')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Sin Cobrar Totales
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(stats.sinCobrarTotal)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pendiente de cobro histórico (Click para ver detalle)
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-100">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Cancelados (Total)
                  </CardTitle>
                  <Activity className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {stats.serviciosCanceladosTotal}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cancelados o No Concretados
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Tasa de Cancelación
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-700">
                    {stats.tasaCancelacionTotal.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    % sobre el total histórico
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Section: Top Servicios */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>Servicios Más Solicitados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.topServicios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay datos suficientes aún.</p>
                  ) : (
                    stats.topServicios.map((servicio, index) => (
                      <div key={index} className="flex items-center">
                        <div className="w-full space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium leading-none">
                              {servicio.nombre}
                            </p>
                            <span className="text-sm font-bold text-muted-foreground">
                              {servicio.cantidad}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full" 
                              style={{ 
                                width: `${(servicio.cantidad / Math.max(...stats.topServicios.map(s => s.cantidad))) * 100}%` 
                              }} 
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
            
            {/* Placeholder for future charts or notifications */}
            <Card className="col-span-3">
               <CardHeader>
                 <CardTitle>Accesos Rápidos</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="grid grid-cols-2 gap-4">
                    <button 
                      className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-left transition-colors"
                      onClick={() => router.push('/dashboard/servicios/nuevo')}
                    >
                       <span className="block font-semibold text-slate-700">Nueva Orden</span>
                       <span className="text-xs text-slate-500">Registrar servicio</span>
                    </button>
                    <button 
                      className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-left transition-colors"
                      onClick={() => router.push('/dashboard/clientes/nuevo')}
                    >
                       <span className="block font-semibold text-slate-700">Nuevo Cliente</span>
                       <span className="text-xs text-slate-500">Registrar cliente</span>
                    </button>
                    <button 
                      className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-left transition-colors"
                      onClick={() => router.push('/dashboard/servicios/programacion')}
                    >
                       <span className="block font-semibold text-slate-700">Agenda</span>
                       <span className="text-xs text-slate-500">Ver programación</span>
                    </button>
                    <button 
                      className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-left transition-colors"
                      onClick={() => router.push('/dashboard/usuarios/tecnicos')}
                    >
                       <span className="block font-semibold text-slate-700">Técnicos</span>
                       <span className="text-xs text-slate-500">Gestionar equipo</span>
                    </button>
                 </div>
               </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog 
        open={unpaidModal.isOpen} 
        onOpenChange={(open) => setUnpaidModal(prev => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {unpaidModal.type === 'today' ? 'Servicios Sin Cobrar - Hoy' : 'Servicios Sin Cobrar - Histórico'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpaidModal.loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : unpaidModal.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center h-24">
                        No hay servicios pendientes de cobro en esta categoría.
                      </TableCell>
                    </TableRow>
                  ) : (
                    unpaidModal.data.map((item) => (
                      <TableRow key={item.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/dashboard/servicios/${item.id}/editar`)}>
                        <TableCell className="font-medium">{item.numeroOrden || item.id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{item.cliente.nombre} {item.cliente.apellido}</span>
                            <span className="text-xs text-muted-foreground">{item.cliente.empresa?.nombre || 'Particular'}</span>
                          </div>
                        </TableCell>
                        <TableCell>{item.servicio.nombre}</TableCell>
                        <TableCell>{item.metodoPago?.nombre || 'N/A'}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            ['Finalizado', 'Liquidado'].includes(item.estadoServicio.nombre) ? 'bg-green-100 text-green-700' :
                            item.estadoServicio.nombre === 'En Proceso' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {item.estadoServicio.nombre}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(item.pagado)}</TableCell>
                        <TableCell className="text-right text-red-600 font-bold">{formatCurrency(item.pendiente)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}