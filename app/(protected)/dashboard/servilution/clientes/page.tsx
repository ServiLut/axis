import mysql from "@/lib/mysql";
import { Search } from "@/components/ui/search";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { FilterSelect } from "@/components/ui/filter-select";
import { Users, User, Mail, Phone, MapPin, ClipboardList } from "lucide-react";
import { ClientActions } from "./client-actions";

export default async function ServilutionClientesPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string;
    page?: string;
    municipio?: string;
  }>;
}) {
  const params = await searchParams;
  const queryTerm = params.query || "";
  const municipioFilter = params.municipio && params.municipio !== 'all' ? params.municipio : undefined;
  const currentPage = Number(params.page) || 1;
  const itemsPerPage = 10;
  const skip = (currentPage - 1) * itemsPerPage;

  // Construcción del objeto where
  interface ClientWhere {
    OR?: Array<{
      nombre?: { contains: string };
      apellido?: { contains: string };
      numero_de_documento?: { contains: string };
      telefono?: { contains: string };
    }>;
    municipio?: string;
  }
  
  const where: ClientWhere = {};

  if (queryTerm) {
    where.OR = [
      { nombre: { contains: queryTerm } },
      { apellido: { contains: queryTerm } },
      { numero_de_documento: { contains: queryTerm } },
      { telefono: { contains: queryTerm } }
    ];
  }

  if (municipioFilter) {
    where.municipio = municipioFilter;
  }

  // Fetch data
  const { data: clientes, total } = await mysql.clientes.findMany({
    orderBy: {
      Id_cliente: 'desc'
    },
    take: itemsPerPage,
    skip: skip,
    where: Object.keys(where).length > 0 ? where : undefined
  });

  // Fetch filter options
  const { municipios } = await mysql.clientes.getFilterOptions();

  const totalPages = Math.ceil(Number(total) / itemsPerPage);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-slate-900">
                Clientes Servilution
              </h1>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Base de datos histórica de clientes y su información de contacto
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-3 items-center">
          <div className="relative w-full md:w-1/2">
            <Search placeholder="Buscar por nombre, documento o teléfono..." />
          </div>
          <div className="w-full md:w-auto md:ml-auto">
             <FilterSelect 
                paramName="municipio" 
                placeholder="Municipio" 
                allLabel="Todos los municipios"
                options={(municipios || []).map((m) => ({ value: m.id_municipio.toString(), label: m.Nombre }))}
                className="w-full md:w-[200px] bg-white"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          {clientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <ClipboardList className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron clientes</p>
              <p className="text-sm">
                Intenta ajustar tu búsqueda o filtros
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                    <tr>
                      <th className="px-6 py-4 w-20">ID</th>
                      <th className="px-6 py-4">Cliente</th>
                      <th className="px-6 py-4">Contacto</th>
                      <th className="px-6 py-4">Ubicación</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((cliente) => (
                      <tr
                        key={cliente.Id_cliente}
                        className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                      >
                        <td className="px-6 py-4 font-medium text-slate-500">
                          #{cliente.Id_cliente}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                                <User className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900">
                                {cliente.nombre} {cliente.apellido}
                              </span>
                              <span className="text-xs text-slate-500">
                                {cliente.numero_de_documento || "Sin documento"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-slate-600">
                              <Phone className="h-3 w-3 text-slate-400" />
                              <span>{cliente.telefono || "N/A"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Mail className="h-3 w-3 text-slate-400" />
                              <span className="text-xs">{cliente.correo_electronico || "N/A"}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1 text-slate-600">
                            <div className="flex items-start gap-2">
                                <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5" />
                                <span className="text-xs max-w-[250px] leading-relaxed">
                                    {cliente.direccion || "Sin dirección registrada"}
                                </span>
                            </div>
                            {cliente.nombre_municipio && (
                                <span className="text-[10px] font-medium bg-slate-100 px-2 py-0.5 rounded-full w-fit ml-5 text-slate-500">
                                    {cliente.nombre_municipio}
                                </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <ClientActions clienteId={cliente.Id_cliente} />
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