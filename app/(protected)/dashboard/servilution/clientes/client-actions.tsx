"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  MapPin,
  Calendar,
  ClipboardList,
  User,
  Phone,
  Mail,
  Clock,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { getClienteDetails } from "./actions";

interface ClientActionsProps {
  clienteId: number;
}

interface ClienteDetail {
  Id_cliente: number;
  nombre: string | null;
  apellido: string | null;
  numero_de_documento: string | null;
  telefono: string | null;
  segundo_tel: string | null;
  correo_electronico: string | null;
  direccion: string | null;
  nombre_municipio?: string;
  nombre_barrio?: string;
}

interface ServicioHistory {
  id: number;
  fecha_visita: string | Date | null;
  hora_visita: string | Date | null;
  valor_pagado: number | boolean | null;
  valor_cotizacion: number | string | null;
  direccion_servicio: string | null;
  servicios?: { servicio: string | null };
  empresa?: { nombre: string | null };
  perfil_trabajador?: { nombre: string | null; apellido: string | null };
  observaciones?: string | null;
  observacion_cotizacion?: string | null;
  observacion_final?: string | null;
}

export function ClientActions({ clienteId }: ClientActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<{
    cliente: ClienteDetail;
    servicios: ServicioHistory[];
  } | null>(null);
  const router = useRouter();

  const handleOpen = async () => {
    setIsOpen(true);
    if (!data) {
      setIsLoading(true);
      const result = await getClienteDetails(clienteId);
      if ("error" in result && result.error) {
        toast.error(result.error);
        setIsOpen(false);
      } else if ("cliente" in result && result.cliente) {
        setData(
          result as { cliente: ClienteDetail; servicios: ServicioHistory[] },
        );
      }
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-slate-100"
        title="Ver historial y detalles"
      >
        <Eye className="h-4 w-4" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] h-[90vh] flex flex-col p-0 overflow-hidden gap-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <DialogHeader className="sr-only">
                <DialogTitle>Cargando información del cliente</DialogTitle>
                <DialogDescription>Por favor espere...</DialogDescription>
              </DialogHeader>
              <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Cargando información...</p>
            </div>
          ) : data && data.cliente ? (
            <>
              <div className="flex-none p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <User className="h-5 w-5 text-blue-600" />
                    {data.cliente.nombre} {data.cliente.apellido}
                  </DialogTitle>
                  <DialogDescription>
                    ID: #{data.cliente.Id_cliente} •{" "}
                    {data.cliente.numero_de_documento || "Sin documento"}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-100 shadow-sm">
                    <Phone className="h-4 w-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase">
                        Teléfono
                      </p>
                      <p className="text-sm font-medium text-slate-900">
                        {data.cliente.telefono || "N/A"}
                      </p>
                      {data.cliente.segundo_tel && (
                        <p className="text-xs text-slate-500">
                          {data.cliente.segundo_tel}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-100 shadow-sm">
                    <Mail className="h-4 w-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase">
                        Correo
                      </p>
                      <p className="text-sm font-medium text-slate-900 break-all">
                        {data.cliente.correo_electronico || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-100 shadow-sm">
                    <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase">
                        Ubicación
                      </p>
                      <p className="text-sm font-medium text-slate-900 leading-tight mb-1">
                        {data.cliente.direccion || "Sin dirección"}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {data.cliente.nombre_municipio && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5"
                          >
                            {data.cliente.nombre_municipio}
                          </Badge>
                        )}
                        {data.cliente.nombre_barrio && (
                          <Badge variant="outline" className="text-[10px] h-5">
                            {data.cliente.nombre_barrio}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 flex flex-col bg-white">
                <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between flex-none">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-blue-600" />
                    Historial de Servicios
                  </h3>
                  <Badge variant="secondary">
                    {data.servicios.length} Registros
                  </Badge>
                </div>

                <ScrollArea className="flex-1 h-full">
                  <div className="p-6">
                    {data.servicios.length === 0 ? (
                      <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                        <p>No hay servicios registrados para este cliente.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {data.servicios.map((servicio) => (
                          <div
                            key={servicio.id}
                            className="group flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-md transition-all bg-white"
                          >
                            {/* Fecha y Estado */}
                            <div className="sm:w-32 flex-none flex flex-col gap-2 border-b sm:border-b-0 sm:border-r border-slate-100 pb-3 sm:pb-0 sm:pr-4">
                              <div className="flex items-center gap-2 text-slate-700 font-medium">
                                <Calendar className="h-4 w-4 text-blue-500" />
                                {servicio.fecha_visita
                                  ? format(
                                      new Date(servicio.fecha_visita),
                                      "dd MMM yyyy",
                                      { locale: es },
                                    )
                                  : "Sin fecha"}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Clock className="h-3 w-3" />
                                {servicio.hora_visita
                                  ? new Date(
                                      servicio.hora_visita,
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "--:--"}
                              </div>
                              <Badge
                                className={
                                  servicio.valor_pagado
                                    ? "bg-green-100 text-green-700 hover:bg-green-100 w-fit"
                                    : "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 w-fit"
                                }
                                variant="secondary"
                              >
                                {servicio.valor_pagado ? "Pagado" : "Pendiente"}
                              </Badge>
                            </div>

                            {/* Detalles */}
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                              <div>
                                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                  Servicio
                                </span>
                                <p className="font-medium text-slate-900">
                                  {servicio.servicios?.servicio ||
                                    "Servicio General"}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                  Empresa
                                </span>
                                <p className="text-sm text-slate-700">
                                  {servicio.empresa?.nombre || "-"}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                  Técnico
                                </span>
                                <p className="text-sm text-slate-700">
                                  {servicio.perfil_trabajador?.nombre ? (
                                    `${servicio.perfil_trabajador.nombre} ${servicio.perfil_trabajador.apellido}`
                                  ) : (
                                    <span className="text-slate-400 italic">
                                      No asignado
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                                  Valor Cotizado
                                </span>
                                <p className="text-sm font-semibold text-slate-900">
                                  {servicio.valor_cotizacion
                                    ? new Intl.NumberFormat("es-CO", {
                                        style: "currency",
                                        currency: "COP",
                                        maximumFractionDigits: 0,
                                      }).format(
                                        Number(servicio.valor_cotizacion),
                                      )
                                    : "$ 0"}
                                </p>
                              </div>

                              {servicio.direccion_servicio && (
                                <div className="sm:col-span-2 pt-2 border-t border-slate-50 mt-1">
                                  <div className="flex items-start gap-1.5">
                                    <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5" />
                                    <p className="text-xs text-slate-600">
                                      {servicio.direccion_servicio}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {(servicio.observaciones ||
                                servicio.observacion_cotizacion ||
                                servicio.observacion_final) && (
                                <div className="sm:col-span-2 pt-2 border-t border-slate-50 mt-1 space-y-2">
                                  {servicio.observaciones && (
                                    <div>
                                      <span className="text-xs font-semibold text-slate-700 block">
                                        Observaciones:
                                      </span>
                                      <p className="text-xs text-slate-600 leading-relaxed">
                                        {servicio.observaciones}
                                      </p>
                                    </div>
                                  )}
                                  {servicio.observacion_cotizacion && (
                                    <div>
                                      <span className="text-xs font-semibold text-slate-700 block">
                                        Obs. Cotización:
                                      </span>
                                      <p className="text-xs text-slate-600 leading-relaxed">
                                        {servicio.observacion_cotizacion}
                                      </p>
                                    </div>
                                  )}
                                  {servicio.observacion_final && (
                                    <div>
                                      <span className="text-xs font-semibold text-slate-700 block">
                                        Obs. Final:
                                      </span>
                                      <p className="text-xs text-slate-600 leading-relaxed">
                                        {servicio.observacion_final}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <DialogFooter className="flex-none p-4 bg-slate-50 border-t border-slate-200">
                <Button
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                  onClick={() =>
                    router.push(
                      `/dashboard/clientes/nuevo?migrateClientId=${data.cliente.Id_cliente}`,
                    )
                  }
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Registrar Direcciones
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="p-6 text-center text-slate-500">
              No se pudo cargar la información.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
