"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Settings,
  Car,
  Bike,
  AlertTriangle,
  CheckCircle,
  Search,
  User,
  Edit,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getTecnicosStatus,
  updatePicoPlacaRulesBatch,
  getPicoPlacaRules,
  updateUsuarioVehiculo,
  type TecnicoPicoPlaca,
} from "./actions";
import { Badge } from "@/components/ui/badge";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export default function PicoPlacaClient() {
  const [loading, setLoading] = useState(true);
  const [tecnicos, setTecnicos] = useState<TecnicoPicoPlaca[]>([]);
  const [todayName, setTodayName] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  // Config Modal State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesMap, setRulesMap] = useState<
    Record<string, { n1: number | null; n2: number | null }>
  >({});

  // Edit Vehicle Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{
    id: number;
    placa: string;
    isMoto: boolean;
  } | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  // Load Data
  const loadData = useCallback(async (showLoading = true) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (showLoading) setLoading(true);
    const result = await getTecnicosStatus(token);
    if (result.error) {
      toast.error(result.error);
    } else if (result.data) {
      setTecnicos(result.data);
      setTodayName(result.today || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData(false);
  }, [loadData]);

  // --- CONFIG RULES HANDLERS ---

  const openConfig = async () => {
    setIsConfigOpen(true);
    const token = localStorage.getItem("token");
    if (token) {
      const res = await getPicoPlacaRules(token);
      if (res.data) {
        const map: Record<string, { n1: number | null; n2: number | null }> =
          {};
        // Initialize with nulls
        DAYS.forEach((d) => (map[d] = { n1: null, n2: null }));
        // Fill with fetched
        res.data.forEach((r) => {
          if (r.dia) map[r.dia] = { n1: r.numeroUno, n2: r.numeroDos };
        });
        setRulesMap(map);
      } else {
        // Init empty if error or empty
        const map: Record<string, { n1: number | null; n2: number | null }> =
          {};
        DAYS.forEach((d) => (map[d] = { n1: null, n2: null }));
        setRulesMap(map);
      }
    }
  };

  const handleRuleChange = (day: string, field: "n1" | "n2", val: string) => {
    const num = val === "" ? null : parseInt(val);
    if (num !== null && (num < 0 || num > 9 || val.length > 1)) return;

    setRulesMap((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: num },
    }));
  };

  const handleSaveAllRules = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setSavingRules(true);
    const payload = Object.entries(rulesMap)
      .filter(([day]) => DAYS.includes(day)) // Only valid days
      .map(([dia, vals]) => ({ dia, n1: vals.n1, n2: vals.n2 }));

    const res = await updatePicoPlacaRulesBatch(token, payload);
    setSavingRules(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Reglas actualizadas correctamente");
      setIsConfigOpen(false);
      loadData();
    }
  };

  // --- EDIT VEHICLE HANDLERS ---

  const handleEditClick = (t: TecnicoPicoPlaca) => {
    setEditingUser({
      id: t.id,
      placa: t.placa || "",
      isMoto: t.moto === true,
    });
    setIsEditOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setSavingUser(true);
    const res = await updateUsuarioVehiculo(
      token,
      editingUser.id,
      editingUser.placa,
      editingUser.isMoto,
    );
    setSavingUser(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Información actualizada");
      setIsEditOpen(false);
      setEditingUser(null);
      loadData();
    }
  };

  const filteredTecnicos = tecnicos.filter((t) => {
    const search = searchTerm.toLowerCase();
    const fullName = `${t.nombre || ""} ${t.apellido || ""}`.toLowerCase();
    const placa = t.placa?.toLowerCase() || "";
    return fullName.includes(search) || placa.includes(search);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Estado de Movilidad
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Verifica Pico y Placa hoy{" "}
              <span className="font-semibold text-primary">({todayName})</span>
            </p>
          </div>

          <Dialog
            open={isConfigOpen}
            onOpenChange={(open) =>
              !open ? setIsConfigOpen(false) : openConfig()
            }
          >
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Settings className="h-4 w-4 mr-2" />
                Configurar Reglas
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Configurar Pico y Placa</DialogTitle>
                <DialogDescription>
                  Asigna los dígitos restringidos para cada día de la semana.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4">
                <div className="grid grid-cols-12 gap-2 text-sm font-medium text-slate-500 mb-2 border-b pb-2">
                  <div className="col-span-4 pl-2">Día</div>
                  <div className="col-span-8 text-center">
                    Dígitos Restringidos
                  </div>
                </div>
                {DAYS.map((day) => (
                  <div
                    key={day}
                    className="grid grid-cols-12 gap-2 items-center"
                  >
                    <div className="col-span-4 pl-2 font-medium text-slate-700">
                      {day}
                    </div>
                    <div className="col-span-8 flex justify-center items-center gap-3">
                      <Input
                        className="w-14 text-center h-8"
                        placeholder="-"
                        type="number"
                        min={0}
                        max={9}
                        value={rulesMap[day]?.n1?.toString() ?? ""}
                        onChange={(e) =>
                          handleRuleChange(day, "n1", e.target.value)
                        }
                      />
                      <span className="text-slate-400">-</span>
                      <Input
                        className="w-14 text-center h-8"
                        placeholder="-"
                        type="number"
                        min={0}
                        max={9}
                        value={rulesMap[day]?.n2?.toString() ?? ""}
                        onChange={(e) =>
                          handleRuleChange(day, "n2", e.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button onClick={handleSaveAllRules} disabled={savingRules}>
                  {savingRules && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por usuario o placa..."
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
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
          ) : filteredTecnicos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg border border-slate-200 border-dashed">
              <User className="h-12 w-12 mb-3 text-slate-300" />
              <p className="font-medium">No se encontraron usuarios</p>
              <p className="text-sm">Intenta ajustar tu búsqueda</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-medium">
                  <tr>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Vehículo / Placa</th>
                    <th className="px-6 py-4">Restricción Hoy</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTecnicos.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold shrink-0">
                            {t.nombre?.[0]?.toUpperCase()}
                            {t.apellido?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">
                              {t.nombre} {t.apellido}
                            </div>
                            <div className="text-slate-500 text-xs mt-0.5">
                              {t.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {t.moto ? (
                            <Bike className="h-4 w-4 text-slate-500" />
                          ) : (
                            <Car className="h-4 w-4 text-slate-500" />
                          )}
                          <span className="font-mono font-medium text-slate-700">
                            {t.placa || (
                              <span className="text-slate-400 italic">
                                Sin placa
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {t.digitosRestringidos}
                      </td>
                      <td className="px-6 py-4">
                        {t.tienePicoPlaca ? (
                          <Badge variant="destructive" className="gap-1 pl-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Restringido
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800 hover:bg-green-200 gap-1 pl-1.5 border-green-200"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Habilitado
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-slate-200 text-slate-500"
                          onClick={() => handleEditClick(t)}
                        >
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Editar Placa</span>
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

      {/* Edit User Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Vehículo</DialogTitle>
            <DialogDescription>
              Actualiza la información del vehículo para el usuario.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="placa" className="text-right">
                  Placa
                </Label>
                <Input
                  id="placa"
                  value={editingUser.placa}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      placa: e.target.value.toUpperCase(),
                    })
                  }
                  className="col-span-3 font-mono uppercase"
                  placeholder="ABC-123"
                  maxLength={6}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="moto" className="text-right">
                  Es Moto
                </Label>
                <div className="flex items-center space-x-2 col-span-3">
                  <Checkbox
                    id="moto"
                    checked={editingUser.isMoto}
                    onCheckedChange={(c) =>
                      setEditingUser({ ...editingUser, isMoto: c === true })
                    }
                  />
                  <label
                    htmlFor="moto"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Marcar si el vehículo es una motocicleta
                  </label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleSaveUser} disabled={savingUser}>
              {savingUser && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
