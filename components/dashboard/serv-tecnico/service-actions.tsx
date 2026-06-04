"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, MapPin, Calendar, User, Briefcase, Clock, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";

// Define a comprehensive interface for the service data
// Based on what we saw in the page and tecnicos.ts
export interface ServiceData {
  id: number;
  id_servicio: number | null;
  id_cliente: number | null;
  id_empresa: number | null;
  id_fumigador: number | null;
  direccion_servicio: string | null;
  fecha_visita: Date | string | null;
  hora_visita: Date | string | null; // Note: tecnicos schema has hora_visita
  // hora_entrada / hora_salida might be in control_calidad, but let's assume we use what we have or add if available
  hora_entrada?: Date | string | null; 
  hora_salida?: Date | string | null;
  
  valor_cotizacion: number | string | null;
  valor_pagado: number | null; // 0 or 1
  observaciones_tecnico: string | null;
  firma_cliente: string | null;
  
  // Relations mapped in tecnicos.ts
  clientes?: { nombre?: string | null; apellido?: string | null } | null;
  servicios?: { servicio?: string | null } | null;
  empresa?: { nombre?: string | null } | null;
  perfil_trabajador?: { nombre?: string | null; apellido?: string | null } | null;
  municipios?: { Nombre?: string | null } | null;
  barrios?: { Nombre?: string | null } | null;
  metodos_de_pago?: { metodo_pago?: string | null } | null;
  zonas_locativas?: { zona?: string | null } | null;
  estado_inicial_servicio?: { estado?: string | null } | null;
  estado_servicio?: { estado_servicio?: string | null } | null;
  
  // New fields from schema
  numero_orden?: string | null;
  duracion_servicio?: string | null;
  nivel_infestacion?: string | null;
  condiciones_hige?: string | null;
  condiciones_loca?: string | null;
  observacion_cotizacion?: string | null;
  observacion_final?: string | null; // mapped from observations?
  implementos?: string | null;
  que_se_hizo?: string | null;
  repuestos?: string | null;
  valor_repuestos?: number | string | null;
  google_maps?: string | null;
  numero_piso?: string | null;
  bloque_o_torre?: string | null; // mapped from bloque?
  unidad_residencial?: string | null;
  bloque?: string | null;
  piso?: string | null;
  servicio_realizado?: string | null;
  observaciones?: string | null;
  observaciones_llegada?: string | null;
}

export function ServiceActions({ servicio }: { servicio: ServiceData }) {
  const [open, setOpen] = useState(false);

  const formatCurrency = (value: number | string | null) => {
    if (value === null || value === undefined) return "-";
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(value));
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "Sin fecha";
    try {
      return format(new Date(date), "PPP", { locale: es });
    } catch {
      return "Fecha inválida";
    }
  };
  
  const formatTime = (time: string | Date | null) => {
     if (!time) return "--:--";
     // If it's a full ISO string, extract time, or if it's 'HH:mm:ss'
     if (typeof time === 'string' && time.includes('T')) {
         try {
             return format(new Date(time), "p", { locale: es });
         } catch {
             return time;
         }
     }
     return String(time);
  };

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={() => setOpen(true)}
        className="h-8 w-8 text-slate-500 hover:text-indigo-600"
        title="Ver detalles"
      >
        <Eye className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              Servicio #{servicio.id}
              <Badge 
                variant={servicio.valor_pagado ? "default" : "secondary"} 
                className={servicio.valor_pagado ? "bg-green-600 hover:bg-green-700 ml-2" : "bg-slate-200 text-slate-600 hover:bg-slate-300 ml-2"}
              >
                 {servicio.valor_pagado ? "Pagado" : "Pendiente de Pago"}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Detalles completos del servicio prestado (Base de datos Técnicos)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            
            {/* Info Principal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-lg space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center">
                        <User className="h-4 w-4 mr-2 text-indigo-500" />
                        Cliente y Ubicación
                    </h3>
                    <div>
                        <p className="font-medium text-slate-800">
                             {servicio.clientes?.nombre} {servicio.clientes?.apellido}
                        </p>
                        <div className="flex flex-col mt-1 text-sm text-slate-500 gap-1">
                            <div className="flex items-start">
                                <MapPin className="h-3.5 w-3.5 mr-1 mt-0.5 shrink-0" />
                                <span>
                                    {servicio.direccion_servicio || "Sin dirección registrada"}
                                    {servicio.municipios?.Nombre && `, ${servicio.municipios.Nombre}`}
                                    {servicio.barrios?.Nombre && `, ${servicio.barrios.Nombre}`}
                                </span>
                            </div>
                            {(servicio.piso || servicio.bloque || servicio.unidad_residencial) && (
                                <div className="pl-5 text-xs">
                                    {servicio.unidad_residencial && <span className="block">Unidad: {servicio.unidad_residencial}</span>}
                                    {servicio.bloque && <span className="block">Torre/Bloque: {servicio.bloque}</span>}
                                    {servicio.piso && <span className="block">Piso/Apto: {servicio.piso}</span>}
                                </div>
                            )}
                            {servicio.google_maps && (
                                <a href={servicio.google_maps} target="_blank" rel="noreferrer" className="pl-5 text-xs text-blue-600 hover:underline">
                                    Ver en Google Maps
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg space-y-3">
                     <h3 className="text-sm font-semibold text-slate-900 flex items-center">
                        <Briefcase className="h-4 w-4 mr-2 text-indigo-500" />
                        Detalles del Servicio
                    </h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Tipo:</span>
                            <span className="font-medium">{servicio.servicios?.servicio || "No especificado"}</span>
                        </div>
                         <div className="flex justify-between">
                            <span className="text-slate-500">Empresa/Especialización:</span>
                            <span className="font-medium">{servicio.empresa?.nombre || "N/A"}</span>
                        </div>
                        {servicio.numero_orden && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Orden de Servicio:</span>
                                <span className="font-medium">{servicio.numero_orden}</span>
                            </div>
                        )}
                        {servicio.zonas_locativas?.zona && (
                             <div className="flex justify-between">
                                <span className="text-slate-500">Zona Locativa:</span>
                                <span className="font-medium">{servicio.zonas_locativas?.zona}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Separator />

             {/* Estado y Condiciones */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {servicio.estado_inicial_servicio?.estado && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                        <span className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Estado Inicial</span>
                        <span className="font-medium text-slate-800">{servicio.estado_inicial_servicio.estado}</span>
                    </div>
                 )}
                 <div className="bg-slate-50 p-3 rounded-lg">
                    <span className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Estado Final</span>
                    <span className="font-medium text-slate-800">{servicio.estado_servicio?.estado_servicio || "-"}</span>
                 </div>
                 {servicio.nivel_infestacion && (
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <span className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Nivel Infestación</span>
                    <span className="font-medium text-slate-800">{servicio.nivel_infestacion}</span>
                 </div>
                 )}
             </div>
             
             {(servicio.condiciones_hige || servicio.condiciones_loca) && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {servicio.condiciones_hige && (
                        <div className="bg-slate-50 p-3 rounded-lg">
                            <span className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Condiciones Higiénicas</span>
                            <span className="font-medium text-slate-800">{servicio.condiciones_hige}</span>
                        </div>
                    )}
                    {servicio.condiciones_loca && (
                        <div className="bg-slate-50 p-3 rounded-lg">
                            <span className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Condiciones Locativas</span>
                            <span className="font-medium text-slate-800">{servicio.condiciones_loca}</span>
                        </div>
                    )}
                 </div>
             )}

            <Separator />

            {/* Programacion y Tecnico */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center">
                        <Calendar className="h-4 w-4 mr-2 text-indigo-500" />
                        Programación
                    </h3>
                    <div className="space-y-2 text-sm border-l-2 border-indigo-100 pl-3">
                        <div>
                            <span className="block text-xs text-slate-500 uppercase tracking-wide">Fecha Visita</span>
                            <span className="font-medium text-slate-700">{formatDate(servicio.fecha_visita)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                             <div>
                                <span className="block text-xs text-slate-500 uppercase tracking-wide flex items-center">
                                    <Clock className="h-3 w-3 mr-1" /> Hora Visita
                                </span>
                                <span className="font-medium text-slate-700">{formatTime(servicio.hora_visita)}</span>
                            </div>
                        </div>
                    </div>
                 </div>

                 <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center">
                        <User className="h-4 w-4 mr-2 text-indigo-500" />
                        Técnico Asignado
                    </h3>
                    <div className="bg-white border border-slate-200 rounded-md p-3">
                         {servicio.perfil_trabajador ? (
                             <p className="font-medium text-slate-700">
                                 {servicio.perfil_trabajador.nombre} {servicio.perfil_trabajador.apellido}
                             </p>
                         ) : (
                             <p className="text-slate-400 italic text-sm">Sin técnico asignado</p>
                         )}
                    </div>
                 </div>
             </div>

            <Separator />

            {/* Detalles Financieros */}
            <div>
                 <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-indigo-500" />
                    Detalles Financieros
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-xs text-slate-500 uppercase tracking-wide block">Valor Cotizado</span>
                        <span className="font-semibold text-slate-900 text-lg">{formatCurrency(servicio.valor_cotizacion)}</span>
                     </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-xs text-slate-500 uppercase tracking-wide block">Valor Repuestos</span>
                        <span className="font-semibold text-slate-900 text-lg">{formatCurrency(servicio.valor_repuestos || 0)}</span>
                     </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-xs text-slate-500 uppercase tracking-wide block">Método de Pago</span>
                        <span className="font-medium text-slate-800">{servicio.metodos_de_pago?.metodo_pago || "No definido"}</span>
                     </div>
                </div>
            </div>

            <Separator />

             {/* Observaciones y Detalles Tecnicos */}
             <div className="space-y-4">
                {(servicio.observaciones || servicio.observaciones_llegada || servicio.observaciones_tecnico) && (
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">Observaciones</h3>
                        <div className="space-y-2">
                             {servicio.observaciones && (
                                <div className="bg-slate-50 text-slate-700 p-3 rounded-md text-sm border border-slate-200">
                                     <span className="font-semibold block mb-1 text-xs uppercase opacity-70">General:</span>
                                    {servicio.observaciones}
                                </div>
                             )}
                              {servicio.observaciones_llegada && (
                                <div className="bg-slate-50 text-slate-700 p-3 rounded-md text-sm border border-slate-200">
                                     <span className="font-semibold block mb-1 text-xs uppercase opacity-70">Llegada:</span>
                                    {servicio.observaciones_llegada}
                                </div>
                             )}
                        </div>
                    </div>
                )}
                
                {servicio.servicio_realizado && (
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">Servicio Realizado / ¿Qué se hizo?</h3>
                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 whitespace-pre-line">
                            {servicio.servicio_realizado}
                        </p>
                    </div>
                )}
                
                {servicio.repuestos && (
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-2">Repuestos</h3>
                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded border border-slate-200">
                            {servicio.repuestos}
                        </p>
                    </div>
                )}
             </div>

             {/* Firma */}
             {servicio.firma_cliente && (
                 <>
                    <Separator />
                    <div>
                         <h3 className="text-sm font-semibold text-slate-900 mb-2">Firma del Cliente</h3>
                         <div className="border border-slate-200 rounded-lg p-2 bg-white flex justify-center">
                             <Image 
                                src={servicio.firma_cliente.startsWith('data:') || servicio.firma_cliente.startsWith('http') 
                                    ? servicio.firma_cliente 
                                    : `data:image/png;base64,${servicio.firma_cliente}`} 
                                alt="Firma cliente" 
                                className="max-h-32 w-auto object-contain"
                                width={400}
                                height={128}
                                unoptimized
                             />
                         </div>
                    </div>
                 </>
             )}

          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
