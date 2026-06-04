import tecnicos from "@/lib/tecnicos";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Search } from "@/components/ui/search";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { FilterSelect } from "@/components/ui/filter-select";
import { FilterDateRange } from "@/components/ui/filter-date-range";
import { MapPin, Calendar, ClipboardList } from "lucide-react";
import { ServiceActions, type ServiceData } from "@/components/dashboard/serv-tecnico/service-actions";

export default async function ServTecnicoServiciosPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string;
    page?: string;
    empresa?: string;
    municipio?: string;
    tecnico?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  const params = await searchParams;
  const queryTerm = params.query || "";
  const currentPage = Number(params.page) || 1;
  const itemsPerPage = 10;
  const skip = (currentPage - 1) * itemsPerPage;

  // Filtros
  interface ServiceWhere {
    clientes?: {
      OR: Array<{
        nombre?: { contains: string };
        apellido?: { contains: string };
      }>;
    };
    id_empresa?: number;
    id_municipio?: number;
    id_fumigador?: number;
    fecha_visita?: {
      gte?: string;
      lte?: string;
    };
  }
  
  const where: ServiceWhere = {};
  
  if (queryTerm) {
    where.clientes = {
      OR: [
        { nombre: { contains: queryTerm } },
        { apellido: { contains: queryTerm } }
      ]
    };
  }

  if (params.empresa && params.empresa !== 'all') {
    where.id_empresa = Number(params.empresa);
  }
  
  if (params.municipio && params.municipio !== 'all') {
    where.id_municipio = Number(params.municipio);
  }

  if (params.tecnico && params.tecnico !== 'all') {
    where.id_fumigador = Number(params.tecnico);
  }

  if (params.startDate || params.endDate) {
    where.fecha_visita = {};
    if (params.startDate) where.fecha_visita.gte = params.startDate;
    if (params.endDate) where.fecha_visita.lte = params.endDate;
  }

  // Fetch data
  const { data: servicios, total } = await tecnicos.servicios_prestados.findMany({
    orderBy: { id: 'desc' },
    take: itemsPerPage,
    skip: skip,
    where: where
  });

  const totalPages = Math.ceil(Number(total) / itemsPerPage);

  // Fetch filter options
  const { empresas, municipios, tecnicos: tecnicosList } = await tecnicos.servicios_prestados.getFilterOptions();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Servicios Técnicos
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Historial de servicios prestados y gestión (Base de datos Técnicos)
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:flex-nowrap gap-3 items-center">
          <div className="relative w-full md:w-80">
            <Search placeholder="Buscar cliente..." />
          </div>

          <div className="flex flex-wrap md:flex-nowrap gap-2 w-full md:w-auto items-center justify-end">
            <FilterSelect 
                paramName="empresa" 
                placeholder="Empresa" 
                allLabel="Todas las empresas"
                options={(empresas || []).map((e) => ({ value: e.id.toString(), label: e.nombre }))}
                className="w-full md:w-[150px] bg-white"
            />
            
            <FilterSelect 
                paramName="municipio" 
                placeholder="Municipio" 
                allLabel="Todos los municipios"
                options={(municipios || []).map((m) => ({ value: m.id_municipio.toString(), label: m.Nombre }))}
                className="w-full md:w-[150px] bg-white"
            />
            
            <FilterSelect 
                paramName="tecnico" 
                placeholder="Técnico" 
                allLabel="Todos los técnicos"
                options={(tecnicosList || []).map((t) => ({ value: t.id.toString(), label: `${t.nombre} ${t.apellido}` }))}
                className="w-full md:w-[150px] bg-white"
            />

            <FilterDateRange />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          {servicios.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <ClipboardList className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron servicios</p>
              <p className="text-sm">
                Intenta ajustar los filtros
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                    <tr>
                      <th className="px-6 py-4">ID</th>
                      <th className="px-6 py-4">Cliente / Dirección</th>
                      <th className="px-6 py-4">Servicio</th>
                      <th className="px-6 py-4">Técnico</th>
                      <th className="px-6 py-4">Programación</th>
                      <th className="px-6 py-4">Valor</th>
                      <th className="px-6 py-4">Estado Pago</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicios.map((servicio) => (
                      <tr
                        key={servicio.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                         <td className="px-6 py-4 font-medium text-slate-500">
                          #{servicio.id}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900">
                                {servicio.clientes?.nombre} {servicio.clientes?.apellido}
                            </span>
                            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                                {servicio.direccion_servicio ? (
                                    <>
                                        <MapPin className="h-3 w-3" />
                                        <span className="truncate max-w-[200px]" title={servicio.direccion_servicio || ""}>
                                            {servicio.direccion_servicio}
                                        </span>
                                    </>
                                ) : (
                                    <span className="italic">Sin dirección</span>
                                )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-slate-900 font-medium">
                                {servicio.servicios?.servicio}
                            </span>
                            <span className="text-xs text-slate-500">
                                {servicio.empresa?.nombre}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-slate-700">
                            {servicio.perfil_trabajador?.nombre ? (
                                `${servicio.perfil_trabajador.nombre} ${servicio.perfil_trabajador.apellido}`
                            ) : (
                                <span className="text-slate-400 italic">Sin asignar</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-2 text-slate-600">
                                <Calendar className="h-4 w-4 text-slate-400" />
                                {servicio.fecha_visita ? (
                                    <span>
                                        {format(new Date(servicio.fecha_visita), 'dd/MM/yyyy', { locale: es })}
                                    </span>
                                ) : (
                                    <span className="italic text-slate-400">Sin fecha</span>
                                )}
                           </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">
                           {servicio.valor_cotizacion 
                              ? new Intl.NumberFormat("es-CO", {
                                  style: "currency",
                                  currency: "COP",
                                  maximumFractionDigits: 0,
                                }).format(Number(servicio.valor_cotizacion))
                              : "-"}
                        </td>
                        <td className="px-6 py-4">
                            {/* In tecnicos schema we might not have valor_pagado boolean, maybe rely on something else or default to secondary */}
                            <Badge 
                                variant={servicio.valor_pagado ? "default" : "secondary"} 
                                className={servicio.valor_pagado ? "bg-green-600 hover:bg-green-700" : "bg-slate-200 text-slate-600 hover:bg-slate-300"}
                            >
                                {servicio.valor_pagado ? "Pagado" : "Pendiente"}
                            </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <ServiceActions servicio={servicio as unknown as ServiceData} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {Number(total) > 0 && (
                <PaginationControls 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalRecords={Number(total)}
                    itemsPerPage={itemsPerPage}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
