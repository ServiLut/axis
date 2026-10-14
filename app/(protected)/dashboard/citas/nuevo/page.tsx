"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  User,
  HeartPulse,
  Calendar,
  DollarSign,
  UserRound,
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
import { rentalQuote } from "@/lib/booking";

type AppointmentMode = "PLANTA" | "ALQUILER" | null;
type ServiceSource = "PACKAGE" | "NEW_THERAPY" | "LEGACY";

export default function NuevoCitaPage() {
  const [saving, setSaving] = useState(false);
  const userSelectedClient = useRef(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [packagesRevision, setPackagesRevision] = useState(0);
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
  const [additionalInput, setAdditionalInput] = useState({ key: "", value: "" });
  const [horaInicio, setHoraInicio] = useState<string>("");
  const [horaFin, setHoraFin] = useState<string>("");

  const rentalKey = horaInicio + "|" + horaFin + "|" + selectedTerapiaId;
  const rentalAdditional = additionalInput.key === rentalKey ? additionalInput.value : "";
  const rentalMinutes = horaInicio && horaFin ? (Number(horaFin.slice(0,2))*60 + Number(horaFin.slice(3))) - (Number(horaInicio.slice(0,2))*60 + Number(horaInicio.slice(3))) : 0;
  const rentalExtraMinutes = rentalMinutes > 0 ? rentalMinutes % 60 : 0;
  const rentalServices = terapias.filter((t) => /alquiler/i.test(t.nombre) && t.cantidadSesiones === 1);
  const rentalService = rentalServices.length === 1 ? rentalServices[0] : undefined;
  const rentalPrice = rentalService ? Number(rentalService.precioBase).toFixed(2) : "";
  const [prevCalcData, setPrevCalcData] = useState({ mode, horaInicio, horaFin, rentalPrice, rentalAdditional });
  if (prevCalcData.mode !== mode || prevCalcData.horaInicio !== horaInicio || prevCalcData.horaFin !== horaFin || prevCalcData.rentalPrice !== rentalPrice || prevCalcData.rentalAdditional !== rentalAdditional) {
    setPrevCalcData({ mode, horaInicio, horaFin, rentalPrice, rentalAdditional });
    if (mode === "ALQUILER" && horaInicio && horaFin) {
      const [hStart, mStart] = horaInicio.split(":").map(Number);
      const [hEnd, mEnd] = horaFin.split(":").map(Number);

      if (
        hStart !== undefined && mStart !== undefined &&
        hEnd !== undefined && mEnd !== undefined
      ) {
        const startTotalMinutes = hStart * 60 + mStart;
        const endTotalMinutes = hEnd * 60 + mEnd;
        const diff = endTotalMinutes - startTotalMinutes;
        try { setValorCita(rentalQuote(diff, rentalPrice, rentalAdditional).amount.toString()); }
        catch { setValorCita(""); }
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
    let current = true;
    userSelectedClient.current = false;
    const fetchPreSelectedClient = async () => {
      if (preSelectedClienteId) {
        const token = localStorage.getItem("token");
        if (!token) return;

        const result = await getCliente(token, Number(preSelectedClienteId));
        if (!current || userSelectedClient.current) return;
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
    void fetchPreSelectedClient().catch(() => {
      if (current && !userSelectedClient.current) toast.error("No se pudo cargar el paciente. Puede buscarlo en el formulario.");
    });
    return () => { current = false; };
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
      userSelectedClient.current = true;
      setMode(newMode);
      if (newMode === "ALQUILER") {
          const rentalPackage = rentalService;
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

  // A failed read must leave a recoverable form instead of a permanent spinner.
  useEffect(() => {
    let current = true;
    const fetchData = async () => {
      setLoadingData(true);
      setLoadError(null);
      const token = localStorage.getItem("token");
      if (!token) { router.push("/sign-in"); return; }
      try {
        const data = await getFormDataCitas(token);
        if (!current) return;
        if (data.error) { setLoadError(data.error); return; }
        setPsicologos((data.tecnicos as Usuario[]) || []);
        setConsultoriosList((data.consultorios as consultorios[]) || []);
        setMetodosPago((data.metodosPago as {id: number, nombre: string}[]) || []);
        setTerapias((data.terapias as TerapiasPsicologos[]) || []);
      } catch {
        if (current) setLoadError("No se pudo cargar el formulario. Revise su conexión e intente nuevamente.");
      } finally {
        if (current) setLoadingData(false);
      }
    };
    void fetchData();
    return () => { current = false; };
  }, [router, loadRevision]);

  // Ignore responses belonging to an earlier search or patient selection.
  useEffect(() => {
    let current = true;
    const search = async () => {
      if (debouncedClientSearchTerm.length < 6) {
        setClientes((previous) => previous.filter((client) => client.id.toString() === selectedClienteId));
        setIsSearchingClients(false);
        return;
      }
      setIsSearchingClients(true);
      const token = localStorage.getItem("token");
      if (!token) { setIsSearchingClients(false); return; }
      try {
        const result = await searchClientes(token, debouncedClientSearchTerm);
        if (!current) return;
        if (result.error) { setClientes((previous) => previous.filter((client) => client.id.toString() === selectedClienteId)); toast.error(result.error); return; }
        if (result.clientes) {
          setClientes((previous) => {
            const selectedClient = previous.find((client) => client.id.toString() === selectedClienteId);
            return selectedClient && !result.clientes!.some((client) => client.id === selectedClient.id)
              ? [selectedClient, ...result.clientes!] : result.clientes!;
          });
        }
      } catch {
        if (current) { setClientes((previous) => previous.filter((client) => client.id.toString() === selectedClienteId)); toast.error("No se pudo buscar el paciente. Intente nuevamente."); }
      } finally {
        if (current) setIsSearchingClients(false);
      }
    };
    void search();
    return () => { current = false; };
  }, [debouncedClientSearchTerm, selectedClienteId]);

  // Package results must always belong to the patient currently selected.
  useEffect(() => {
    let current = true;
    const fetchPackages = async () => {
      setActivePackages([]);
      setSelectedPaqueteId("");
      setPackagesError(null);
      if (mode !== "PLANTA" || !selectedClienteId) { setLoadingPackages(false); return; }
      setLoadingPackages(true);
      const token = localStorage.getItem("token");
      if (!token) { setLoadingPackages(false); return; }
      try {
        const result = await getClientPackages(token, Number(selectedClienteId));
        if (!current) return;
        if (result.error) { setPackagesError(result.error); return; }
        const packages = (result.packages || []) as unknown as (PaqueteAdquirido & { TerapiasPsicologos: TerapiasPsicologos })[];
        setActivePackages(packages);
        setServiceSource(packages.length ? "PACKAGE" : "NEW_THERAPY");
        setSelectedPaqueteId(packages[0]?.id.toString() || "");
      } catch {
        if (current) setPackagesError("No se pudieron consultar los paquetes del paciente.");
      } finally {
        if (current) setLoadingPackages(false);
      }
    };
    void fetchPackages();
    return () => { current = false; };
  }, [selectedClienteId, mode, packagesRevision]);

  const handleClientChange = (clientId: string) => {
    userSelectedClient.current = true;
    setSelectedClienteId(clientId);
    setSelectedPaqueteId("");
    setActivePackages([]);
    setServiceSource("NEW_THERAPY");
    setPackagesError(null);
    setLoadingPackages(Boolean(clientId));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || (mode === "PLANTA" && (loadingPackages || packagesError))) return;
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

    if (mode === "PLANTA" && selectedClienteId) {
      formData.set("cliente", selectedClienteId);
    } else {
      formData.delete("cliente");
    }
    
    if (!selectedPsicologoId) { toast.error("Asigna un profesional a la cita o reserva."); setSaving(false); return; }
    formData.set("tecnico", selectedPsicologoId);
    
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
        
        if (!rentalService) { toast.error("Debe existir un único servicio activo de alquiler por una sesión en el catálogo."); setSaving(false); return; }
        formData.set("terapiaId", rentalService.id.toString());
    }

    try {
      const result = await createCita(token, formData);
      if (result.error) toast.error(result.error);
      else { toast.success(result.message); router.push("/dashboard/citas"); }
    } catch {
      toast.error("No se pudo guardar la cita. Sus datos se conservan para intentar nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingData) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center gap-3 bg-white" role="status"><span className="text-sm text-slate-600">Cargando formulario…</span>
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-slate-700">{loadError}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/citas")}>Volver a citas</Button>
        <Button type="button" onClick={() => setLoadRevision((revision) => revision + 1)}>Reintentar</Button>
      </div>
    </div>
  );

  if (!mode) {
      return (
          <div className="flex flex-col bg-slate-50 h-full overflow-y-auto">
              <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-8 py-4">
                  <div className="flex items-center gap-4 max-w-7xl mx-auto">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push("/dashboard/citas")}
                          className="hover:bg-slate-100" aria-label="Volver"
                        >
                          <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                          <h1 className="text-2xl font-bold text-slate-900">
                            Nueva cita o reserva
                          </h1>
                          <p className="text-sm text-slate-600 mt-0.5">
                            Primero elija qué desea agendar.
                          </p>
                        </div>
                  </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
                      <Card 
                        className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group"
                        onClick={() => handleModeChange("PLANTA")}
                        role="button" tabIndex={0} aria-label="Agendar sesión de psicología"
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault(); handleModeChange("PLANTA");
                          }
                        }}
                      >
                          <CardHeader>
                              <CardTitle className="flex items-center gap-3 text-2xl group-hover:text-blue-600 transition-colors">
                                  <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                                      <UserRound className="h-8 w-8 text-blue-700" />
                                  </div>
                                  Sesión de psicología
                              </CardTitle>
                              <CardDescription className="text-base mt-2">
                                  Atención a un paciente con un psicólogo de nuestro equipo.
                              </CardDescription>
                          </CardHeader>
                          <CardContent>
                              <ul className="list-disc list-inside text-slate-600 space-y-1">
                                  <li>Requiere seleccionar un paciente</li>
                                  <li>Sesión individual o paquete de sesiones</li>
                                  <li>Seleccione el psicólogo y el horario</li>
                              </ul>
                          </CardContent>
                      </Card>

                      <Card 
                        className="cursor-pointer hover:border-green-500 hover:shadow-md transition-all group"
                        onClick={() => handleModeChange("ALQUILER")}
                        role="button" tabIndex={0} aria-label="Reservar consultorio"
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault(); handleModeChange("ALQUILER");
                          }
                        }}
                      >
                          <CardHeader>
                              <CardTitle className="flex items-center gap-3 text-2xl group-hover:text-green-600 transition-colors">
                                  <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                                      <Building2 className="h-8 w-8 text-green-700" />
                                  </div>
                                  Reserva de consultorio
                              </CardTitle>
                              <CardDescription className="text-base mt-2">
                                  Alquiler de un consultorio para un psicólogo externo.
                              </CardDescription>
                          </CardHeader>
                          <CardContent>
                              <ul className="list-disc list-inside text-slate-600 space-y-1">
                                  <li>Seleccione el psicólogo que usará el espacio</li>
                                  <li>Reserve el consultorio y el horario</li>
                                  <li>No requiere registrar un paciente</li>
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
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-8 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleModeChange(null)}
              className="hover:bg-slate-100" aria-label="Volver"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {mode === "PLANTA" ? "Nueva sesión de psicología" : "Nueva reserva de consultorio"}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Complete los datos, el horario y la información del pago.
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

      <div className="flex-1 bg-white px-4 sm:px-8 py-8">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-8">
          {/* Sección: 1. Paciente */}
          {mode === "PLANTA" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    1. Paciente
                  </h2>
                  <p className="text-sm text-slate-600">
                    Busque y seleccione el paciente que recibirá la atención.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label
                    htmlFor="cliente"
                    className="text-sm font-medium text-slate-700"
                  >
                    Paciente <span className="text-red-500">*</span>
                  </Label>
                  <Combobox
                    id="cliente"
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
                  <p className="text-xs text-slate-500">Escriba al menos 6 caracteres del nombre, documento o teléfono. Si es un paciente nuevo, regístrelo en Pacientes antes de agendar.</p>
                </div>
              </div>
            </div>
          )}

          {/* Sección: {mode === "PLANTA" ? "2. Psicólogo y servicio" : "1. Psicólogo y consultorio"} */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-green-50 rounded-lg">
                <HeartPulse className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {mode === "PLANTA" ? "2. Psicólogo y servicio" : "1. Psicólogo y consultorio"}
                </h2>
                <p className="text-sm text-slate-600">
                  Seleccione quién atenderá y dónde se realizará la cita.
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
                  <SelectTrigger id="consultorio" className="h-11">
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
                  Psicólogo asignado <span className="text-red-500">*</span>
                </Label>
                <Combobox
                  id="tecnico"
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
                      <Label className="text-base font-semibold">Servicio para esta sesión</Label>
                      {loadingPackages && <p role="status" className="text-sm text-slate-600">Consultando paquetes del paciente…</p>}
                      {packagesError && <div role="alert" className="space-y-2 text-sm text-amber-800"><p>{packagesError}</p><Button type="button" variant="outline" size="sm" onClick={() => setPackagesRevision((revision) => revision + 1)}>Reintentar consulta</Button></div>}
                      <RadioGroup 
                        disabled={loadingPackages || Boolean(packagesError)}
                        aria-label="Cómo usar el servicio"
                        value={serviceSource} 
                        onValueChange={(val) => handleServiceSourceChange(val as ServiceSource)}
                        className="flex flex-col md:flex-row gap-4 mb-4"
                      >
                          <div className="flex items-center space-x-2">
                              <RadioGroupItem value="NEW_THERAPY" id="r1" />
                              <Label htmlFor="r1">Servicio del catálogo</Label>
                          </div>
                          {activePackages.length > 0 && (
                              <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="PACKAGE" id="r2" />
                                  <Label htmlFor="r2">Usar paquete del paciente ({activePackages.length})</Label>
                              </div>
                          )}
                      </RadioGroup>

                      {serviceSource === "NEW_THERAPY" && (
                          <div className="space-y-2">
                            <Label htmlFor="terapiaId">Servicio de psicología <span className="text-red-500">*</span></Label>
                            <Combobox 
                                id="terapiaId"
                                disabled={loadingPackages || Boolean(packagesError)}
                                options={terapiaOptions}
                                value={selectedTerapiaId} 
                                onChange={handleTerapiaChange}
                                placeholder="Seleccione una terapia del catálogo"
                                emptyMessage="No se encontraron terapias."
                            />
                            <p className="text-xs text-slate-500">
                                Si el servicio incluye varias sesiones, quedarán disponibles en un paquete para el paciente.
                            </p>
                          </div>
                      )}

                      {serviceSource === "PACKAGE" && (
                          <div className="space-y-2">
                            <Label htmlFor="paqueteId">Paquete disponible <span className="text-red-500">*</span></Label>
                            <Select 
                                disabled={loadingPackages || Boolean(packagesError)}
                                value={selectedPaqueteId} 
                                onValueChange={setSelectedPaqueteId}
                            >
                              <SelectTrigger id="paqueteId" className="h-11 bg-white">
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
                Notas de la cita (opcional)
              </Label>
              <Textarea
                id="observacion"
                name="observacion"
                placeholder="Indicaciones para la cita o la reserva"
                rows={3}
                className="min-h-[80px]"
              />
            </div>
          </div>

          {/* Sección: {mode === "PLANTA" ? "3. Fecha y horario" : "2. Fecha y horario"} */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-orange-50 rounded-lg">
                <Calendar className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {mode === "PLANTA" ? "3. Fecha y horario" : "2. Fecha y horario"}
                </h2>
                <p className="text-sm text-slate-600">
                  Indique el inicio y el fin. Horarios de Colombia (Bogotá).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="fechaVisita"
                  className="text-sm font-medium text-slate-700"
                >
                  Fecha <span className="text-red-500">*</span>
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
                  Hora de inicio <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="horaInicio"
                  name="horaInicio"
                  type="time"
                  step={60}
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
                  Hora de fin <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="horaFin"
                  name="horaFin"
                  type="time"
                  step={60}
                  className="h-11"
                  required
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Sección: {mode === "PLANTA" ? "4. Valor y pago" : "3. Valor y pago"} */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-purple-50 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {mode === "PLANTA" ? "4. Valor y pago" : "3. Valor y pago"}
                </h2>
                <p className="text-sm text-slate-600">
                  Revise el valor y elija el método de pago si lo conoce.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(mode === "ALQUILER") && rentalExtraMinutes > 0 && <div className="space-y-2">
                <Label htmlFor="rentalAdicional">Valor de {rentalExtraMinutes} minutos adicionales</Label>
                <Input id="rentalAdicional" name="rentalAdicional" type="number" min="0" max="999999999.99" step="0.01" value={rentalAdditional}
                  onChange={(e) => setAdditionalInput({ key: rentalKey, value: e.target.value })} placeholder="Indica el valor acordado" required />
                <p className="text-sm text-slate-600">Escribe cuánto se cobrará por el tiempo adicional. Usa 0 solo si no se cobra. El total suma las horas completas del catálogo y este valor.</p>
              </div>}
              {(mode === "ALQUILER") && <p className="text-sm text-slate-600">Puedes indicar cualquier hora y minuto, como 4:30, 5:45 o 5:50. Se conserva el intervalo elegido, sin redondearlo a otra hora.</p>}

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
                  readOnly={mode === "ALQUILER"}
                  value={valorCita}
                  onChange={(e) => setValorCita(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="metodoPago"
                  className="text-sm font-medium text-slate-700"
                >
                  Método de pago
                </Label>
                <Select name="metodoPago">
                  <SelectTrigger id="metodoPago" className="h-11">
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
                disabled={saving || (mode === "PLANTA" && (loadingPackages || Boolean(packagesError)))}
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
                    {mode === "PLANTA" ? "Guardar cita" : "Guardar reserva"}
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
