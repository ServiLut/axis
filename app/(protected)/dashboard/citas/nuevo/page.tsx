"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  User,
  Wrench,
  Calendar,
  DollarSign,
  Briefcase,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useDebounce } from "use-debounce";
import { getFormDataCitas, createCita, searchClientes, getClientPackages } from "../actions";
import { getCliente } from "../../clientes/actions";
import type {
  Cliente,
  Usuario,
  consultorios,
  TerapiasPsicologos,
  PaqueteAdquirido,
} from "@/prisma/generated/prisma/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type AppointmentMode = "PLANTA" | "ALQUILER" | null;
type ServiceSource = "PACKAGE" | "NEW_THERAPY" | "LEGACY";

export default function NuevoCitaPage() {
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [mode, setMode] = useState<AppointmentMode>(null);
  
  // Data State
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [psicologos, setPsicologos] = useState<Usuario[]>([]);
  const [consultoriosList, setConsultoriosList] = useState<consultorios[]>([]);
  const [metodosPago, setMetodosPago] = useState<{id: number, nombre: string}[]>([]);
  const [terapias, setTerapias] = useState<TerapiasPsicologos[]>([]);

  // Client Search State
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [debouncedClientSearchTerm] = useDebounce(clientSearchTerm, 500);

  // Selection State
  const [selectedClienteId, setSelectedClienteId] = useState<string>("");
  const [selectedPsicologoId, setSelectedPsicologoId] = useState<string>("");
  const [activePackages, setActivePackages] = useState<(PaqueteAdquirido & { TerapiasPsicologos: TerapiasPsicologos })[]>([]);
  const [serviceSource, setServiceSource] = useState<ServiceSource>("NEW_THERAPY");
  const [selectedPaqueteId, setSelectedPaqueteId] = useState<string>("");
  const [selectedTerapiaId, setSelectedTerapiaId] = useState<string>("");
  const [valorCita, setValorCita] = useState<string>("");
  const [horaInicio, setHoraInicio] = useState<string>("");
  const [horaFin, setHoraFin] = useState<string>("");

  // Auto-calculate Rental Price based on time fractions (State adjustment during render)
  const [prevCalcData, setPrevCalcData] = useState({ mode, horaInicio, horaFin });
  if (prevCalcData.mode !== mode || prevCalcData.horaInicio !== horaInicio || prevCalcData.horaFin !== horaFin) {
    setPrevCalcData({ mode, horaInicio, horaFin });
    if (mode === "ALQUILER" && horaInicio && horaFin) {
      const [hStart, mStart] = horaInicio.split(":").map(Number);
      const [hEnd, mEnd] = horaFin.split(":").map(Number);

      if (
        hStart !== undefined && mStart !== undefined &&
        hEnd !== undefined && mEnd !== undefined
      ) {
        const startTotalMinutes = hStart * 60 + mStart;
        const endTotalMinutes = hEnd * 60 + mEnd;
        let diff = endTotalMinutes - startTotalMinutes;
        if (diff < 0) diff += 24 * 60; // Midnight crossing
        if (diff > 0) {
          const fractions = Math.ceil(diff / 15);
          const total = fractions * 4725;
          setValorCita(total.toString());
        }
      }
    }
  }

  // Default Empresa ID 3 as requested
  const DEFAULT_EMPRESA_ID = "3";

  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedClienteId = searchParams.get("clienteId");

  // Handle pre-selected client from URL
  useEffect(() => {
    const fetchPreSelectedClient = async () => {
      if (preSelectedClienteId) {
        const token = localStorage.getItem("token");
        if (!token) return;

        const result = await getCliente(token, Number(preSelectedClienteId));
        if (result.cliente) {
            const client = result.cliente as unknown as Cliente;
            setClientes(prev => {
                if (prev.some(c => c.id === client.id)) return prev;
                return [client, ...prev];
            });
            setSelectedClienteId(client.id.toString());
            setMode("PLANTA");
        }
      }
    };
    fetchPreSelectedClient();
  }, [preSelectedClienteId]);

  // Handle therapy selection and price update
  const handleTerapiaChange = (val: string) => {
      setSelectedTerapiaId(val);
      if (serviceSource === "NEW_THERAPY") {
          const therapy = terapias.find(t => t.id.toString() === val);
          if (therapy && therapy.precioBase) {
            setValorCita(therapy.precioBase.toString());
          }
      }
  };

  const handleModeChange = (newMode: AppointmentMode) => {
      setMode(newMode);
      if (newMode === "ALQUILER") {
          const rentalPackage = terapias.find(t => t.id.toString() === "49");
          if (rentalPackage && rentalPackage.precioBase) {
              setValorCita(rentalPackage.precioBase.toString());
          }
      } else {
          setValorCita(""); // Reset or keep previous? Reset is safer.
      }
  };

  // Handle service source change and price reset
  const handleServiceSourceChange = (val: ServiceSource) => {
      setServiceSource(val);
      if (val === "PACKAGE") {
          setValorCita("0");
          if (!selectedPaqueteId && activePackages.length > 0) {
              setSelectedPaqueteId(activePackages[0].id.toString());
          }
      } else if (val === "NEW_THERAPY") {
          setSelectedPaqueteId("");
          if (selectedTerapiaId) {
            const therapy = terapias.find(t => t.id.toString() === selectedTerapiaId);
            if (therapy && therapy.precioBase) {
              setValorCita(therapy.precioBase.toString());
            }
          }
      }
  };

  // Filter psychologists: specifically tenantId 4 and role TECNICO as requested
  const filteredPsicologos = psicologos.filter(p => 
    p.tenantId === 4 && p.rol === "TECNICO"
  );

  // Prepare client options for Combobox
  const clientOptions = clientes.map(c => ({
    value: c.id.toString(),
    label: `(${c.numeroDocumento || c.telefono || 'S/N'}) ${c.nombre || ''} ${c.apellido || ''}`.trim()
  }));

  const terapiaOptions = terapias.map(t => ({
    value: t.id.toString(),
    label: `${t.nombre} - Sesiones: ${t.cantidadSesiones}`,
    category: t.categoria || undefined
  }));

  const psicologoOptions = filteredPsicologos.map(p => ({
    value: p.id.toString(),
    label: `${p.nombre} ${p.apellido}`
  }));

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const data = await getFormDataCitas(token);
      
      if (data.error) {
        toast.error(data.error);
        return;
      }

      setPsicologos((data.tecnicos as Usuario[]) || []);
      setConsultoriosList((data.consultorios as consultorios[]) || []);
      setMetodosPago((data.metodosPago as {id: number, nombre: string}[]) || []);
      setTerapias((data.terapias as TerapiasPsicologos[]) || []);
      
      setLoadingData(false);
    };

    fetchData();
  }, [router]);

  // Debounced client search
  useEffect(() => {
    const search = async () => {
      if (debouncedClientSearchTerm.length < 6) {
        if (selectedClienteId) {
            setClientes(prev => {
                const selectedClient = prev.find(c => c.id.toString() === selectedClienteId);
                return selectedClient ? [selectedClient] : [];
            });
        } else {
            setClientes([]);
        }
        return;
      }

      setIsSearchingClients(true);
      const token = localStorage.getItem("token");
      if (!token) {
        setIsSearchingClients(false);
        return;
      };

      const result = await searchClientes(token, debouncedClientSearchTerm);
      
      if (result.error) {
        toast.error(result.error);
        setClientes([]);
      } else if (result.clientes) {
        setClientes(prev => {
            const selectedClient = prev.find(c => c.id.toString() === selectedClienteId);
            if (selectedClient && !result.clientes!.some((c: Cliente) => c.id === selectedClient.id)) {
                return [selectedClient, ...result.clientes!];
            }
            return result.clientes!;
        });
      }
      setIsSearchingClients(false);
    };

    search();
  }, [debouncedClientSearchTerm, selectedClienteId]);

  // Fetch packages when client changes
  useEffect(() => {
      const fetchPackages = async () => {
          if (!selectedClienteId) {
              setActivePackages([]);
              return;
          }
          
          const token = localStorage.getItem("token");
          if (!token) return;

          const res = await getClientPackages(token, Number(selectedClienteId));
          if (res.packages) {
              const packages = res.packages as unknown as (PaqueteAdquirido & { TerapiasPsicologos: TerapiasPsicologos })[];
              setActivePackages(packages);
              // Auto-select source if packages exist
              if (packages.length > 0) {
                  setServiceSource("PACKAGE");
                  setSelectedPaqueteId(packages[0].id.toString());
              } else {
                  setServiceSource("NEW_THERAPY");
                  setSelectedPaqueteId("");
              }
          }
      };
      
      if (mode === "PLANTA") {
        fetchPackages();
      }
  }, [selectedClienteId, mode]);

  const handleClientChange = (clientId: string) => {
      setSelectedClienteId(clientId);
      setSelectedPaqueteId("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    
    const formData = new FormData(event.currentTarget);
    const token = localStorage.getItem("token");

    if (!token) {
      toast.error("No se encontró sesión activa");
      setSaving(false);
      return;
    }

    if (mode === "PLANTA" && !selectedClienteId) {
        toast.error("Debe seleccionar un paciente para citas de planta");
        setSaving(false);
        return;
    }

    if (selectedClienteId) {
      formData.set("cliente", selectedClienteId);
    }
    
    if (selectedPsicologoId) {
      formData.set("tecnico", selectedPsicologoId);
    }
    
    // Force default empresa
    formData.set("empresa", DEFAULT_EMPRESA_ID);

    // Specific logic for Planta:
    if (mode === "PLANTA") {
        if (serviceSource === "PACKAGE") {
            if (!selectedPaqueteId) {
                toast.error("Debe seleccionar un paquete activo");
                setSaving(false);
                return;
            }
            formData.set("paqueteId", selectedPaqueteId);
        } else if (serviceSource === "NEW_THERAPY") {
             if (!selectedTerapiaId) {
                toast.error("Debe seleccionar una terapia");
                setSaving(false);
                return;
            }
            formData.set("terapiaId", selectedTerapiaId);
        }
    } else if (mode === "ALQUILER") {
        const tecnicoId = formData.get("tecnico");
        if (!tecnicoId) {
             toast.error("Debe asignar un psicólogo para el alquiler");
             setSaving(false);
             return;
        }
        
        // Auto-select "Alquiler de consultorio" package (ID 49)
        formData.set("terapiaId", "49");
    }

    const result = await createCita(token, formData);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      router.push("/dashboard/citas");
    }
    setSaving(false);
  }

  if (loadingData) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center bg-white">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!mode) {
      return (
          <div className="flex flex-col bg-slate-50 h-full overflow-y-auto">
              <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4">
                  <div className="flex items-center gap-4 max-w-7xl mx-auto">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push("/dashboard/citas")}
                          className="hover:bg-slate-100"
                        >
                          <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                          <h1 className="text-2xl font-bold text-slate-900">
                            Nueva Cita - Selección de Tipo
                          </h1>
                          <p className="text-sm text-slate-600 mt-0.5">
                            ¿Qué tipo de cita deseas agendar?
                          </p>
                        </div>
                  </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
                      <Card 
                        className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group"
                        onClick={() => handleModeChange("PLANTA")}
                      >
                          <CardHeader>
                              <CardTitle className="flex items-center gap-3 text-2xl group-hover:text-blue-600 transition-colors">
                                  <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                                      <Briefcase className="h-8 w-8 text-blue-700" />
                                  </div>
                                  Cita de Planta
                              </CardTitle>
                              <CardDescription className="text-base mt-2">
                                  Servicio estándar para pacientes registrados.
                              </CardDescription>
                          </CardHeader>
                          <CardContent>
                              <ul className="list-disc list-inside text-slate-600 space-y-1">
                                  <li>Requiere seleccionar un paciente</li>
                                  <li>Uso de Paquetes o Nuevas Terapias</li>
                                  <li>Asignación de psicólogo</li>
                              </ul>
                          </CardContent>
                      </Card>

                      <Card 
                        className="cursor-pointer hover:border-green-500 hover:shadow-md transition-all group"
                        onClick={() => handleModeChange("ALQUILER")}
                      >
                          <CardHeader>
                              <CardTitle className="flex items-center gap-3 text-2xl group-hover:text-green-600 transition-colors">
                                  <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                                      <Building2 className="h-8 w-8 text-green-700" />
                                  </div>
                                  Alquiler de Espacio
                              </CardTitle>
                              <CardDescription className="text-base mt-2">
                                  Renta de consultorio por horas.
                              </CardDescription>
                          </CardHeader>
                          <CardContent>
                              <ul className="list-disc list-inside text-slate-600 space-y-1">
                                  <li>Uso de Servicios Genéricos</li>
                                  <li>Bloqueo de consultorio</li>
                                  <li>Sin registro de paciente</li>
                              </ul>
                          </CardContent>
                      </Card>
                  </div>
              </div>
          </div>
      )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleModeChange(null)}
              className="hover:bg-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {mode === "PLANTA" ? "Registrar Cita de Planta" : "Registrar Alquiler"}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Complete los detalles del servicio
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/citas")}
            disabled={saving}
          >
            Cancelar
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-white px-8 py-8">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-8">
          {/* Sección: Información del Paciente */}
          {mode === "PLANTA" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Información del Paciente
                  </h2>
                  <p className="text-sm text-slate-600">
                    Seleccione el paciente (Obligatorio)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label
                    htmlFor="cliente"
                    className="text-sm font-medium text-slate-700"
                  >
                    Buscar Paciente <span className="text-red-500">*</span>
                  </Label>
                  <Combobox
                    options={clientOptions}
                    value={selectedClienteId}
                    onChange={handleClientChange}
                    onInputChange={setClientSearchTerm}
                    placeholder="Buscar por nombre, documento o teléfono..."
                    emptyMessage={
                      clientSearchTerm.length < 6 
                        ? "Ingrese al menos 6 caracteres..." 
                        : isSearchingClients 
                          ? "Buscando..." 
                          : "No se encontraron pacientes."
                    }
                    shouldFilter={false}
                  />
                  <input type="hidden" name="cliente" value={selectedClienteId} />
                </div>
              </div>
            </div>
          )}

          {/* Sección: Detalles de la Cita */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-green-50 rounded-lg">
                <Wrench className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Detalles de la Cita
                </h2>
                <p className="text-sm text-slate-600">
                  Configure el servicio y el profesional
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="consultorio"
                  className="text-sm font-medium text-slate-700"
                >
                  Consultorio
                </Label>
                <Select name="consultorio">
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Seleccione un consultorio" />
                  </SelectTrigger>
                  <SelectContent>
                    {consultoriosList.map((cons) => (
                      <SelectItem key={cons.id.toString()} value={cons.id.toString()}>
                        {cons.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label
                  htmlFor="tecnico"
                  className="text-sm font-medium text-slate-700"
                >
                  Psicólogo Asignado
                </Label>
                <Combobox
                  options={psicologoOptions}
                  value={selectedPsicologoId}
                  onChange={setSelectedPsicologoId}
                  placeholder="Buscar psicólogo..."
                  emptyMessage="No se encontraron psicólogos."
                />
                <input type="hidden" name="tecnico" value={selectedPsicologoId} />
              </div>

              {/* Conditional Rendering based on Mode */}
              {mode === "PLANTA" ? (
                  <div className="md:col-span-2 space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <Label className="text-base font-semibold">Tipo de Atención</Label>
                      <RadioGroup 
                        value={serviceSource} 
                        onValueChange={(val) => handleServiceSourceChange(val as ServiceSource)}
                        className="flex flex-col md:flex-row gap-4 mb-4"
                      >
                          <div className="flex items-center space-x-2">
                              <RadioGroupItem value="NEW_THERAPY" id="r1" />
                              <Label htmlFor="r1">Nuevo Servicio / Tratamiento</Label>
                          </div>
                          {activePackages.length > 0 && (
                              <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="PACKAGE" id="r2" />
                                  <Label htmlFor="r2">Usar Paquete Activo ({activePackages.length})</Label>
                              </div>
                          )}
                      </RadioGroup>

                      {serviceSource === "NEW_THERAPY" && (
                          <div className="space-y-2">
                            <Label htmlFor="terapiaId">Seleccionar Terapia / Servicio <span className="text-red-500">*</span></Label>
                            <Combobox 
                                options={terapiaOptions}
                                value={selectedTerapiaId} 
                                onChange={handleTerapiaChange}
                                placeholder="Seleccione una terapia del catálogo"
                                emptyMessage="No se encontraron terapias."
                            />
                            <p className="text-xs text-slate-500">
                                Esto creará un nuevo registro de paquete para el paciente.
                            </p>
                          </div>
                      )}

                      {serviceSource === "PACKAGE" && (
                          <div className="space-y-2">
                            <Label htmlFor="paqueteId">Seleccionar Paquete <span className="text-red-500">*</span></Label>
                            <Select 
                                value={selectedPaqueteId} 
                                onValueChange={setSelectedPaqueteId}
                            >
                              <SelectTrigger className="h-11 bg-white">
                                <SelectValue placeholder="Seleccione un paquete activo" />
                              </SelectTrigger>
                              <SelectContent>
                                {activePackages.map((pkg) => (
                                  <SelectItem key={pkg.id.toString()} value={pkg.id.toString()}>
                                    {pkg.TerapiasPsicologos.nombre} - Restan: {pkg.saldoRestante} sesiones
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                      )}
                  </div>
              ) : (
                  <div className="md:col-span-2 p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center gap-3">
                          <Building2 className="h-6 w-6 text-green-700" />
                          <div>
                              <h3 className="font-medium text-green-900">Alquiler de Consultorio</h3>
                              <p className="text-sm text-green-700">
                                  Se registrará automáticamente el paquete de alquiler estándar.
                              </p>
                          </div>
                      </div>
                  </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label
                htmlFor="observacion"
                className="text-sm font-medium text-slate-700"
              >
                Observaciones
              </Label>
              <Textarea
                id="observacion"
                name="observacion"
                placeholder="Notas adicionales sobre la cita"
                rows={3}
                className="min-h-[80px]"
              />
            </div>
          </div>

          {/* Sección: Fecha y Horario */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-orange-50 rounded-lg">
                <Calendar className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Fecha y Horario
                </h2>
                <p className="text-sm text-slate-600">
                  Agende el día y la hora de la cita
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="fechaVisita"
                  className="text-sm font-medium text-slate-700"
                >
                  Fecha de la Cita <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fechaVisita"
                  name="fechaVisita"
                  type="date"
                  className="h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="horaInicio"
                  className="text-sm font-medium text-slate-700"
                >
                  Hora de Inicio <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="horaInicio"
                  name="horaInicio"
                  type="time"
                  className="h-11"
                  required
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="horaFin"
                  className="text-sm font-medium text-slate-700"
                >
                  Hora de Fin <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="horaFin"
                  name="horaFin"
                  type="time"
                  className="h-11"
                  required
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Sección: Información de Pago */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-purple-50 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Información de Pago
                </h2>
                <p className="text-sm text-slate-600">
                  Detalles financieros de la cita
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="valorCotizado"
                  className="text-sm font-medium text-slate-700"
                >
                  Valor de la Cita
                </Label>
                <Input
                  id="valorCotizado"
                  name="valorCotizado"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="h-11"
                  value={valorCita}
                  onChange={(e) => setValorCita(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="metodoPago"
                  className="text-sm font-medium text-slate-700"
                >
                  Método de Pago
                </Label>
                <Select name="metodoPago">
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Seleccione un método" />
                  </SelectTrigger>
                  <SelectContent>
                    {metodosPago.map((mp) => (
                      <SelectItem key={mp.id} value={mp.nombre}>
                        {mp.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t-2 border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-red-500">*</span>
              <span>Campos obligatorios</span>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/citas")}
                disabled={saving}
                className="min-w-[100px]"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 min-w-[160px]"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Registrar Cita
                  </span>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
