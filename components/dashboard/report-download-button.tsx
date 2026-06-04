"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getReporteServiciosFinalizados } from "@/app/(protected)/dashboard/usuarios/asesores/actions";

interface ReportDownloadButtonProps {
  asesorId?: number;
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  filename?: string;
}

export function ReportDownloadButton({
  asesorId,
  label = "Descargar Reporte",
  variant = "outline",
  className,
  size = "default",
  filename = "reporte-servicios",
}: ReportDownloadButtonProps) {
  const [dateRange, setDateRange] = useState({
    start: "",
    end: "",
  });
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleDownload = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        toast.error("No hay sesión activa");
        return;
      }

      if (!dateRange.start || !dateRange.end) {
        toast.error("Seleccione un rango de fechas");
        setLoading(false);
        return;
      }

      const result = await getReporteServiciosFinalizados(token, {
        asesorId,
        fechaInicio: dateRange.start,
        fechaFin: dateRange.end,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      const servicios = result.servicios || [];

      if (servicios.length === 0) {
        toast.info("No se encontraron registros en el rango seleccionado");
        return;
      }

      // Generar Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Servicios Finalizados");

      // Definir columnas
      worksheet.columns = [
        { header: "N° Orden", key: "numeroOrden", width: 15 },
        { header: "Fecha Visita", key: "fechaVisita", width: 15 },
        { header: "Cliente", key: "cliente", width: 30 },
        { header: "Documento", key: "documento", width: 15 },
        { header: "Teléfono", key: "telefono", width: 15 },
        { header: "Dirección", key: "direccion", width: 40 },
        { header: "Tipo Servicio", key: "tipoServicio", width: 20 },
        { header: "Método Pago", key: "metodoPago", width: 15 },
        { header: "Asesor", key: "asesor", width: 25 },
        { header: "Valor Pagado", key: "valorPagado", width: 15 },
      ];

      // Estilo de cabecera
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      // Agregar datos
      servicios.forEach((s) => {
        worksheet.addRow({
          numeroOrden: s.numeroOrden,
          fechaVisita: s.fechaVisita
            ? new Date(s.fechaVisita).toLocaleDateString()
            : "",
          cliente: `${s.cliente?.nombre || ""} ${s.cliente?.apellido || ""}`.trim(),
          documento: s.cliente?.numeroDocumento || "",
          telefono: s.cliente?.telefono || "",
          direccion: s.direccionTexto || "",
          tipoServicio: s.tipoServicio?.nombre || "",
          metodoPago: s.metodoPago?.nombre || "",
          asesor: `${s.creadoPor?.nombre || ""} ${s.creadoPor?.apellido || ""}`.trim(),
          valorPagado: Number(s.valorPagado) || 0,
        });
      });

      // Formato de moneda para la columna de valor
      worksheet.getColumn("valorPagado").numFmt = '"$"#,##0.00';

      // Generar buffer y descargar
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      
      const fileNameStr = `${filename}_${dateRange.start}_${dateRange.end}.xlsx`;
      saveAs(blob, fileNameStr);

      toast.success("Reporte descargado exitosamente");
      setIsOpen(false);
    } catch (error) {
      console.error("Error generating Excel:", error);
      toast.error("Error al generar el archivo Excel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Rango de Fechas</h4>
            <p className="text-sm text-muted-foreground">
              Seleccione el periodo para el reporte.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="grid gap-1">
              <Label htmlFor="start">Desde</Label>
              <Input
                id="start"
                type="date"
                value={dateRange.start}
                onChange={(e) =>
                  setDateRange({ ...dateRange, start: e.target.value })
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="end">Hasta</Label>
              <Input
                id="end"
                type="date"
                value={dateRange.end}
                onChange={(e) =>
                  setDateRange({ ...dateRange, end: e.target.value })
                }
              />
            </div>
            <Button onClick={handleDownload} disabled={loading} className="mt-2">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Descargar Excel
                </>
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
