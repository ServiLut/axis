"use client";

import { useEffect, useState } from "react";
import { getUserRanking, getUserDetails } from "./actions";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import {
  Trophy,
  Medal,
  Award,
  Search,
  Mail,
  Crown,
  Eye,
  Percent,
  Users,
  CheckCircle,
  UserPlus,
  DollarSign,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { FileSpreadsheet } from "lucide-react";

interface RankingItem {
  userId: number;
  nombre: string;
  apellido: string;
  rol: "ADMIN" | "SU_ADMIN" | "ASESOR" | "TECNICO" | null;
  email: string;
  cantidadServicios: number;
  totalLiquidado: number;
}

interface ServiceDetail {
  id: number;
  numeroOrden: string | null;
  fechaVisita: Date | null;
  cliente: string;
  estado: string;
  valorPagado: number;
  tipo: string;
}

interface UserKPI {
  totalServicios: number;
  clientesEfectivos: number;
  porcentajeEfectividad: number;
  totalClientesCreados: number;
  recaudoNuevo: number;
  recaudoRefuerzo: number;
}

export default function RankingPage() {
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Date Filter State
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<RankingItem | null>(null);
  const [userServices, setUserServices] = useState<ServiceDetail[]>([]);
  const [userKPI, setUserKPI] = useState<UserKPI | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    const fetchRanking = async () => {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        toast.error("No autorizado");
        setLoading(false);
        return;
      }

      const result = await getUserRanking(token, dateRange.from, dateRange.to);
      if (result.error) {
        toast.error(result.error);
      } else if (result.ranking) {
        setRanking(result.ranking);
      }
      setLoading(false);
    };

    fetchRanking();
  }, [dateRange]);

  const setToday = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    setDateRange({ from: today, to: today });
  };

  const setYesterday = () => {
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    setDateRange({ from: yesterday, to: yesterday });
  };

  const handleDownloadRankingExcel = async () => {
    if (ranking.length === 0) {
      toast.error("No hay datos para descargar");
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Ranking Usuarios");

      worksheet.columns = [
        { header: "Puesto", key: "puesto", width: 10 },
        { header: "Nombre", key: "nombre", width: 20 },
        { header: "Apellido", key: "apellido", width: 20 },
        { header: "Rol", key: "rol", width: 15 },
        { header: "Email", key: "email", width: 30 },
        { header: "Servicios Creados", key: "cantidadServicios", width: 20 },
        { header: "Total Liquidado", key: "totalLiquidado", width: 20 },
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      ranking.forEach((user, index) => {
        worksheet.addRow({
          puesto: index + 1,
          nombre: user.nombre,
          apellido: user.apellido,
          rol: user.rol,
          email: user.email,
          cantidadServicios: user.cantidadServicios,
          totalLiquidado: user.totalLiquidado,
        });
      });

      worksheet.getColumn("totalLiquidado").numFmt = '"$"#,##0';

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(
        blob,
        `ranking_usuarios_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Ranking descargado correctamente");
    } catch (error) {
      console.error("Error al generar Excel del ranking:", error);
      toast.error("Error al generar el archivo Excel");
    }
  };

  const handleDownloadExcel = async () => {
    if (!selectedUser || userServices.length === 0) {
      toast.error("No hay datos para descargar");
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Servicios");

      worksheet.columns = [
        { header: "N° Orden", key: "numeroOrden", width: 15 },
        { header: "Fecha Visita", key: "fechaVisita", width: 15 },
        { header: "Cliente", key: "cliente", width: 30 },
        { header: "Estado", key: "estado", width: 15 },
        { header: "Tipo", key: "tipo", width: 20 },
        { header: "Valor Pagado", key: "valorPagado", width: 15 },
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      userServices.forEach((s) => {
        worksheet.addRow({
          numeroOrden: s.numeroOrden || "N/A",
          fechaVisita: s.fechaVisita
            ? new Date(s.fechaVisita).toLocaleDateString()
            : "N/A",
          cliente: s.cliente,
          estado: s.estado,
          tipo: s.tipo,
          valorPagado: s.valorPagado,
        });
      });

      worksheet.getColumn("valorPagado").numFmt = '"$"#,##0';

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(
        blob,
        `servicios_${selectedUser.nombre}_${selectedUser.apellido}_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Excel descargado correctamente");
    } catch (error) {
      console.error("Error al generar Excel:", error);
      toast.error("Error al generar el archivo Excel");
    }
  };

  const handleViewDetails = async (user: RankingItem) => {
    setSelectedUser(user);
    setIsModalOpen(true);
    setLoadingDetails(true);
    setUserServices([]);
    setUserKPI(null);

    const token = localStorage.getItem("token");
    if (token) {
      const result = await getUserDetails(
        token,
        user.userId,
        dateRange.from,
        dateRange.to,
      );
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.services) setUserServices(result.services);
        if (result.kpi) setUserKPI(result.kpi);
      }
    }
    setLoadingDetails(false);
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-slate-400" />;
      case 2:
        return <Award className="h-5 w-5 text-amber-700" />;
      default:
        return (
          <span className="text-slate-500 font-bold w-5 text-center text-sm">
            {index + 1}
          </span>
        );
    }
  };

  const getRankBadgeColor = (index: number) => {
    switch (index) {
      case 0:
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case 1:
        return "bg-slate-100 text-slate-700 border-slate-200";
      case 2:
        return "bg-amber-50 text-amber-800 border-amber-200";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Liquidado":
      case "Finalizado":
        return "bg-green-100 text-green-800 border-green-200";
      case "Cancelado":
      case "No Concretado":
        return "bg-red-100 text-red-800 border-red-200";
      case "En Proceso":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const filteredRanking = ranking.filter((item) => {
    const search = searchTerm.toLowerCase();
    const fullName =
      `${item.nombre || ""} ${item.apellido || ""}`.toLowerCase();
    const email = item.email?.toLowerCase() || "";
    return fullName.includes(search) || email.includes(search);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Ranking de Usuarios
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Top de asesores y administradores por servicios creados
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nombre o email..."
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-200">
              <Button
                variant="ghost"
                size="sm"
                onClick={setToday}
                className={cn(
                  "h-8 text-xs px-3 hover:bg-slate-100",
                  dateRange.from === format(new Date(), "yyyy-MM-dd") &&
                    dateRange.to === format(new Date(), "yyyy-MM-dd") &&
                    "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800",
                )}
              >
                Hoy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={setYesterday}
                className={cn(
                  "h-8 text-xs px-3 hover:bg-slate-100",
                  dateRange.from === format(subDays(new Date(), 1), "yyyy-MM-dd") &&
                    dateRange.to === format(subDays(new Date(), 1), "yyyy-MM-dd") &&
                    "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800",
                )}
              >
                Ayer
              </Button>
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-200">
              <Calendar className="h-3.5 w-3.5 text-slate-400 ml-1" />
              <Input
                type="date"
                value={dateRange.from}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, from: e.target.value }))
                }
                className="w-[130px] border-0 focus-visible:ring-0 h-8 p-1 text-xs"
              />
              <span className="text-slate-300">-</span>
              <Input
                type="date"
                value={dateRange.to}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, to: e.target.value }))
                }
                className="w-[130px] border-0 focus-visible:ring-0 h-8 p-1 text-xs"
              />
              {(dateRange.from || dateRange.to) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDateRange({ from: "", to: "" })}
                  className="h-6 w-6 text-slate-400 hover:text-slate-600"
                >
                  <span className="text-xs">×</span>
                </Button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadRankingExcel}
              className="gap-2 h-10 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Descargar Excel</span>
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
          ) : filteredRanking.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <Trophy className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron resultados</p>
              <p className="text-sm">Intenta ajustar tu búsqueda</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                  <tr>
                    <th className="px-6 py-4 w-[100px] text-center">Puesto</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4 text-right">Servicios</th>
                    <th className="px-6 py-4 text-right">Total Recaudado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRanking.map((item, index) => (
                    <tr
                      key={item.userId}
                      className={cn(
                        "hover:bg-slate-50 transition-colors",
                        index < 3 ? "bg-slate-50/50" : "",
                      )}
                    >
                      <td className="px-6 py-4">
                        <div
                          className={cn(
                            "flex items-center justify-center w-10 h-10 rounded-full mx-auto border",
                            getRankBadgeColor(index),
                          )}
                        >
                          {getRankIcon(index)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold shrink-0 border border-slate-200">
                            {item.nombre?.[0]?.toUpperCase()}
                            {item.apellido?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 flex items-center gap-2">
                              {item.nombre} {item.apellido}
                              {index === 0 && (
                                <Crown className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-0.5">
                              <Mail className="h-3 w-3" />
                              {item.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                            item.rol === "SU_ADMIN" &&
                              "bg-purple-50 text-purple-700 border-purple-200",
                            item.rol === "ADMIN" &&
                              "bg-blue-50 text-blue-700 border-blue-200",
                            item.rol === "ASESOR" &&
                              "bg-emerald-50 text-emerald-700 border-emerald-200",
                            item.rol === "TECNICO" &&
                              "bg-slate-100 text-slate-700 border-slate-200",
                          )}
                        >
                          {item.rol}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-bold text-slate-900 text-base">
                          {item.cantidadServicios}
                        </div>
                        <div className="text-xs text-slate-500">creados</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-medium text-slate-900">
                          {formatCurrency(item.totalLiquidado)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDetails(item)}
                          className="hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Detalles del Usuario</DialogTitle>
                <DialogDescription>
                  Estadísticas y desglose de servicios para{" "}
                  <span className="font-medium text-slate-900">
                    {selectedUser?.nombre} {selectedUser?.apellido}
                  </span>
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadExcel}
                className="gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Descargar Excel
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 -mr-2">
            {loadingDetails ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-6 py-4">
                {/* KPI Section */}
                {userKPI && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Total Clientes Creados
                        </CardTitle>
                        <UserPlus className="h-4 w-4 text-purple-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {userKPI.totalClientesCreados}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Total Servicios Creados
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {userKPI.totalServicios}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Servicios Liquidados
                        </CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {userKPI.clientesEfectivos}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Recaudo Servicios Nuevos
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-emerald-600" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {formatCurrency(userKPI.recaudoNuevo)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Recaudo Servicios Refuerzo
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-blue-600" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {formatCurrency(userKPI.recaudoRefuerzo)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          Porcentaje de Efectividad
                        </CardTitle>
                        <Percent className="h-4 w-4 text-blue-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2">
                          <div className="text-2xl font-bold">
                            {userKPI.porcentajeEfectividad.toFixed(1)}%
                          </div>
                          <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{
                                width: `${userKPI.porcentajeEfectividad}%`,
                              }}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Porcentaje de servicios liquidados
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Services Table */}
                <div className="rounded-md border">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-700 font-medium">
                      <tr>
                        <th className="px-4 py-3">Orden</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Cliente</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3 text-right">Valor Pagado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userServices.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="text-center py-8 text-slate-500"
                          >
                            No se encontraron servicios asociados.
                          </td>
                        </tr>
                      ) : (
                        userServices.map((service) => (
                          <tr key={service.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono text-xs">
                              {service.numeroOrden || "N/A"}
                            </td>
                            <td className="px-4 py-3">
                              {service.fechaVisita
                                ? new Date(
                                    service.fechaVisita,
                                  ).toLocaleDateString()
                                : "N/A"}
                            </td>
                            <td className="px-4 py-3">{service.cliente}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-normal",
                                  getStatusBadge(service.estado),
                                )}
                              >
                                {service.estado}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatCurrency(service.valorPagado)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
