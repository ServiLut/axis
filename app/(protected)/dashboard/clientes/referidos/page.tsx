"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Users, Phone, Calendar, User, Hash, FileSpreadsheet, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getReferidos } from "./actions";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

interface Referido {
  id: string;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  codigo: string | null;
  created_at: Date;
  Usuario: {
    id: number;
    nombre: string;
    apellido: string;
    rol: string;
  } | null;
}

export default function ReferidosPage() {
  const [referidos, setReferidos] = useState<Referido[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const router = useRouter();

  useEffect(() => {
    const fetchReferidos = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const result = await getReferidos(token);

      if (result.error) {
        toast.error(result.error);
        if (result.error === "No autorizado") {
          router.push("/sign-in");
        }
      } else if (result.referidos) {
        setReferidos(result.referidos as unknown as Referido[]);
      }
      setLoading(false);
    };

    fetchReferidos();
  }, [router]);

  const handleExportExcel = async () => {
    const filteredForExport = referidos.filter((referido) => {
      const refDate = new Date(referido.created_at);
      refDate.setHours(0, 0, 0, 0);

      let matchesDate = true;
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        // Ajuste zona horaria si es necesario, pero start y refDate son locales o UTC consistentes
         // Al usar input type=date, devuelve YYYY-MM-DD
         const startParts = startDate.split('-').map(Number);
         const startLocal = new Date(startParts[0], startParts[1] - 1, startParts[2]);
         
         if (refDate < startLocal) matchesDate = false;
      }
      if (endDate) {
         const endParts = endDate.split('-').map(Number);
         const endLocal = new Date(endParts[0], endParts[1] - 1, endParts[2]);
         
         if (refDate > endLocal) matchesDate = false;
      }
      return matchesDate;
    });

    if (filteredForExport.length === 0) {
      toast.error("No hay datos para exportar en el rango seleccionado.");
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Referidos");

      // Definir columnas
      worksheet.columns = [
        { header: "Fecha", key: "fecha", width: 15 },
        { header: "Hora", key: "hora", width: 12 },
        { header: "Nombre Referido", key: "nombre", width: 25 },
        { header: "Apellido Referido", key: "apellido", width: 25 },
        { header: "Teléfono", key: "telefono", width: 20 },
        { header: "Código", key: "codigo", width: 15 },
        { header: "Referido Por (Nombre)", key: "refNombre", width: 25 },
        { header: "Referido Por (Apellido)", key: "refApellido", width: 25 },
        { header: "Rol Referente", key: "refRol", width: 15 },
      ];

      // Estilo del Encabezado
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" }, // Blue-600
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 24;

      // Agregar filas
      filteredForExport.forEach((referido) => {
        const dateObj = new Date(referido.created_at);
        worksheet.addRow({
          fecha: dateObj.toLocaleDateString(),
          hora: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          nombre: referido.nombre,
          apellido: referido.apellido,
          telefono: referido.telefono,
          codigo: referido.codigo,
          refNombre: referido.Usuario?.nombre || "N/A",
          refApellido: referido.Usuario?.apellido || "",
          refRol: referido.Usuario?.rol || "N/A",
        });
      });

      // Bordes para todas las celdas con datos
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          if (rowNumber > 1) { // Datos alineados a la izquierda
             cell.alignment = { vertical: 'middle', horizontal: 'left' };
          }
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const fileName = `referidos_${startDate || "inicio"}_al_${endDate || "fin"}.xlsx`;
      saveAs(blob, fileName);
      toast.success("Excel exportado correctamente");
    } catch (error) {
      console.error("Error exportando excel:", error);
      toast.error("Error al generar el archivo Excel");
    }
  };

  const filteredReferidos = referidos.filter((referido) => {
    const search = searchTerm.toLowerCase();
    const fullName =
      `${referido.nombre || ""} ${referido.apellido || ""}`.toLowerCase();
    const telefono = referido.telefono?.toLowerCase() || "";
    const codigo = referido.codigo?.toLowerCase() || "";
    const referidoPor =
      `${referido.Usuario?.nombre || ""} ${referido.Usuario?.apellido || ""}`.toLowerCase();

    return (
      fullName.includes(search) ||
      telefono.includes(search) ||
      codigo.includes(search) ||
      referidoPor.includes(search)
    );
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Referidos</h1>
            <p className="text-sm text-slate-600 mt-1">
              Listado de personas referidas
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, teléfono, código o referente..."
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto">
             <div className="flex items-center gap-2 bg-white p-1 rounded-md border border-slate-200 w-full sm:w-auto">
                <Calendar className="h-4 w-4 text-slate-400 ml-2" />
                <Input 
                   type="date" 
                   value={startDate}
                   onChange={(e) => setStartDate(e.target.value)}
                   className="border-0 shadow-none focus-visible:ring-0 w-[140px] text-sm"
                   placeholder="Desde"
                />
                <span className="text-slate-300">-</span>
                <Input 
                   type="date" 
                   value={endDate}
                   onChange={(e) => setEndDate(e.target.value)}
                   className="border-0 shadow-none focus-visible:ring-0 w-[140px] text-sm"
                   placeholder="Hasta"
                />
                {(startDate || endDate) && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600 mr-1" onClick={() => { setStartDate(""); setEndDate(""); }}>
                     <X className="h-4 w-4" />
                  </Button>
                )}
             </div>
             <Button 
                onClick={handleExportExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
             >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar Excel
             </Button>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto bg-slate-50 px-8 py-6">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredReferidos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <Users className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron referidos</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                  <tr>
                    <th className="px-6 py-4">Referido</th>
                    <th className="px-6 py-4">Contacto</th>
                    <th className="px-6 py-4">Código</th>
                    <th className="px-6 py-4">Referido Por</th>
                    <th className="px-6 py-4">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReferidos.map((referido) => (
                    <tr
                      key={referido.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold shrink-0">
                            {referido.nombre?.[0]?.toUpperCase()}
                            {referido.apellido?.[0]?.toUpperCase()}
                          </div>
                          <div className="font-medium text-slate-900">
                            {referido.nombre} {referido.apellido}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {referido.telefono && (
                          <a
                            href={`https://wa.me/57${referido.telefono.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-slate-600 hover:text-green-600 transition-colors"
                          >
                            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{referido.telefono}</span>
                          </a>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {referido.codigo && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Hash className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono">{referido.codigo}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {referido.Usuario ? (
                          <div className="flex items-center gap-2 text-slate-600">
                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>
                              {referido.Usuario.nombre}{" "}
                              {referido.Usuario.apellido}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            {new Date(referido.created_at).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-slate-400 ml-5">
                            {new Date(referido.created_at).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
