"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  User,
  Wrench,
  Calendar,
  DollarSign,
  Plus,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { municipiosAntioquia } from "@/lib/constants/municipios";
import { useDebounce } from "use-debounce";
import { getFormData, createOrdenServicio, addDireccionToCliente, addVehiculoToCliente, searchClientes } from "../actions";
import { getCliente } from "../../clientes/actions";
import type {
  Cliente,
  TipoServicio,
  Servicio,
  Usuario,
  Empresa,
  Zona,
  MetodoPago,
  EstadoServicio,
  Direccion,
  Vehiculo,
} from "@/prisma/generated/prisma/client";

type ExtendedCliente = Cliente & {
  direcciones: Direccion[];
  vehiculos: Vehiculo[];
};

type SimpleUsuario = Pick<Usuario, "id" | "nombre" | "apellido" | "empresaId" | "placa" | "moto">;

export default function NuevoServicioPage() {
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  
  // Data State
  const [clientes, setClientes] = useState<ExtendedCliente[]>([]);
  const [tiposServicios, setTiposServicios] = useState<TipoServicio[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [tecnicos, setTecnicos] = useState<SimpleUsuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);
  const [estadosServicio, setEstadosServicio] = useState<EstadoServicio[]>([]);

  // Client Search State
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [debouncedClientSearchTerm] = useDebounce(clientSearchTerm, 500);

  // Selection State
  const [selectedClienteId, setSelectedClienteId] = useState<string>("");
  const [clientAddresses, setClientAddresses] = useState<Direccion[]>([]);
  const [clientVehicles, setClientVehicles] = useState<Vehiculo[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>("");

  // New Address State
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    direccion: "",
    municipio: "",
    barrio: "",
    piso: "",
    bloque: "",
    unidad: "",
    linkMaps: ""
  });

  // New Vehicle State
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    placa: "",
    marca: "",
    modelo: "",
    color: "",
    tipo: ""
  });

  const prevClientIdRef = useRef(selectedClienteId);

  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedClienteId = searchParams.get("clienteId");

  // Filter services based on selected company
  const filteredServicios = servicios.filter(s => 
    !s.empresaId || (selectedEmpresaId && s.empresaId.toString() === selectedEmpresaId)
  );

  // Filter service types based on selected company
  const filteredTiposServicios = tiposServicios.filter(t => 
    (!t.empresaId || (selectedEmpresaId && t.empresaId.toString() === selectedEmpresaId)) && t.id !== 3
  );

  // Filter technicians based on selected company
  const filteredTecnicos = tecnicos.filter(t => 
    !t.empresaId || (selectedEmpresaId && t.empresaId.toString() === selectedEmpresaId)
  );

  // States are filtered by tenant in the backend.
  // We show all states available for the tenant as requested.
  const filteredEstadosServicio = estadosServicio;

  // Filter payment methods based on selected company
  const filteredMetodosPago = metodosPago.filter(m => 
    !m.empresaId || (selectedEmpresaId && m.empresaId.toString() === selectedEmpresaId)
  );

  // Prepare client options for Combobox
  const clientOptions = clientes.map(c => ({
    value: c.id.toString(),
    label: `(${c.numeroDocumento || c.telefono || 'S/N'}) ${c.nombre || ''} ${c.apellido || ''}`.trim()
  }));

  const municipiosOptions = Array.from(new Set(municipiosAntioquia.map((m) => m.nombre))).map((nombre) => ({
    value: nombre,
    label: nombre,
  }));

  const barriosOptions = newAddress.municipio 
    ? Array.from(new Set(municipiosAntioquia.find(m => m.nombre === newAddress.municipio)?.barrios || [])).map(b => ({ value: b, label: b }))
    : [];

  // Handle pre-selected client from URL
  useEffect(() => {
    const fetchPreSelectedClient = async () => {
      if (preSelectedClienteId) {
        const token = localStorage.getItem("token");
        if (!token) return;

        const result = await getCliente(token, Number(preSelectedClienteId));
        if (result.cliente) {
            const client = result.cliente as unknown as ExtendedCliente; // Casting to match state type
            setClientes(prev => {
                // Prevent duplicates
                if (prev.some(c => c.id === client.id)) return prev;
                return [client, ...prev];
            });
            setSelectedClienteId(client.id.toString());
        }
      }
    };
    fetchPreSelectedClient();
  }, [preSelectedClienteId]);

  // Initial data fetch (without clients)
  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const data = await getFormData(token);
      
      if (data.error) {
        toast.error(data.error);
        return;
      }

      setTiposServicios(data.tiposServicios || []);
      setServicios(data.servicios || []);
      setTecnicos(data.tecnicos || []);
      setEmpresas(data.empresas || []);
      setZonas(data.zonas || []);
      setMetodosPago(data.metodosPago || []);
      setEstadosServicio(data.estadosServicio || []);
      
      setLoadingData(false);
    };

    fetchData();
  }, [router]);

  // Debounced client search
  useEffect(() => {
    const search = async () => {
      // Do not search if the term is too short
      if (debouncedClientSearchTerm.length < 6) {
        // If there's a selected client, keep it in the list, otherwise clear it.
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
            // Ensure the currently selected client is always present in the options
            const selectedClient = prev.find(c => c.id.toString() === selectedClienteId);
            if (selectedClient && !result.clientes!.some((c: ExtendedCliente) => c.id === selectedClient.id)) {
                return [selectedClient, ...result.clientes!];
            }
            return result.clientes!;
        });
      }
      setIsSearchingClients(false);
    };

    search();
  }, [debouncedClientSearchTerm, selectedClienteId]);


  const handleClientChange = (clientId: string) => {
      setSelectedClienteId(clientId);
      // Ensure the selected client is in the `clientes` state so it can be found later
      // This is crucial if the user selects a client, then searches for something else.
      const client = clientes.find(c => c.id.toString() === clientId);
      if (client && !clientes.some(c => c.id === client.id)) {
          setClientes(prev => [client, ...prev]);
      }
  }

  // Update addresses and vehicles when client changes
  useEffect(() => {
    if (selectedClienteId) {
      const client = clientes.find(c => c.id.toString() === selectedClienteId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClientAddresses(client?.direcciones || []);
       
      setClientVehicles(client?.vehiculos || []);
      
      if (prevClientIdRef.current !== selectedClienteId) {
         
        setSelectedAddressId("");
         
        setSelectedVehicleId("");
        prevClientIdRef.current = selectedClienteId;
      }
    } else {
       
      setClientAddresses([]);
       
      setClientVehicles([]);
       
      setSelectedAddressId("");
       
      setSelectedVehicleId("");
      prevClientIdRef.current = "";
    }
  }, [selectedClienteId, clientes]);

  const handleAddressSelect = (value: string) => {
    if (value === "nueva_direccion") {
      setIsAddressModalOpen(true);
    } else {
      setSelectedAddressId(value);
    }
  };

  const handleSaveAddress = async () => {
    if (!newAddress.direccion) {
      toast.error("La dirección es obligatoria");
      return;
    }

    setSavingAddress(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await addDireccionToCliente(token, Number(selectedClienteId), newAddress);

    if (result.error) {
      toast.error(result.error);
    } else if (result.direccion) {
      toast.success("Dirección agregada exitosamente");
      const updatedAddresses = [...clientAddresses, result.direccion];
      setClientAddresses(updatedAddresses);
      
      setClientes(prevClientes => {
          return prevClientes.map(c => 
            c.id.toString() === selectedClienteId 
              ? { ...c, direcciones: updatedAddresses } 
              : c
          );
      });

      setSelectedAddressId(result.direccion.id.toString());
      setIsAddressModalOpen(false);
      setNewAddress({
        direccion: "",
        municipio: "",
        barrio: "",
        piso: "",
        bloque: "",
        unidad: "",
        linkMaps: ""
      });
    }
    setSavingAddress(false);
  };

  const handleSaveVehicle = async () => {
    if (!newVehicle.placa) {
      toast.error("La placa es obligatoria");
      return;
    }

    setSavingVehicle(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const result = await addVehiculoToCliente(token, Number(selectedClienteId), newVehicle);

    if (result.error) {
      toast.error(result.error);
    } else if (result.vehiculo) {
      toast.success("Vehículo agregado exitosamente");
      const updatedVehicles = [...clientVehicles, result.vehiculo];
      setClientVehicles(updatedVehicles);
      
      setClientes(prevClientes => {
          return prevClientes.map(c => 
            c.id.toString() === selectedClienteId 
              ? { ...c, vehiculos: updatedVehicles } 
              : c
          );
      });

      setSelectedVehicleId(result.vehiculo.id.toString());
      setIsVehicleModalOpen(false);
      setNewVehicle({
        placa: "",
        marca: "",
        modelo: "",
        color: "",
        tipo: ""
      });
    }
    setSavingVehicle(false);
  };

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

    if (selectedClienteId) {
      formData.set("cliente", selectedClienteId);
    } else {
        toast.error("Debe seleccionar un cliente");
        setSaving(false);
        return;
    }
    
    if (selectedAddressId) {
        formData.set("direccionCliente", selectedAddressId);
    }
    
    if (selectedVehicleId) {
        formData.set("vehiculoCliente", selectedVehicleId);
    }

    if (!selectedAddressId && !selectedVehicleId) {
        toast.error("Debe seleccionar una dirección o un vehículo");
        setSaving(false);
        return;
    }

    if (selectedEmpresaId !== "2") {
        formData.delete("valorRepuestos");
    }

    const result = await createOrdenServicio(token, formData);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      router.push("/dashboard/servicios");
    }
    setSaving(false);
  }

  if (loadingData) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header fijo */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/dashboard/servicios")}
              className="hover:bg-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Crear Nueva Orden de Servicio
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Registre los detalles de un nuevo servicio
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/servicios")}
            disabled={saving}
          >
            Cancelar
          </Button>
        </div>
      </div>

      {/* Contenido del formulario */}
      <div className="flex-1 bg-white px-8 py-8 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-8">
          {/* Sección: Información del Cliente */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-blue-50 rounded-lg">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Información del Cliente
                </h2>
                <p className="text-sm text-slate-600">
                  Seleccione el cliente para esta orden de servicio
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="cliente"
                  className="text-sm font-medium text-slate-700"
                >
                  Buscar Cliente (min. 6 carácteres) <span className="text-red-500">*</span>
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
                        : "No se encontraron clientes. Afine su búsqueda."
                  }
                  shouldFilter={false}
                />
                <input type="hidden" name="cliente" value={selectedClienteId} />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="direccionCliente"
                    className="text-sm font-medium text-slate-700"
                  >
                    Dirección del Cliente
                  </Label>
                  <Select
                      key={selectedAddressId}
                      name="direccionCliente"
                      value={selectedAddressId}
                      onValueChange={handleAddressSelect}
                      disabled={!selectedClienteId}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder={selectedClienteId ? "Seleccione una dirección" : "Seleccione un cliente primero"} />
                    </SelectTrigger>
                    <SelectContent>
                      {clientAddresses.length > 0 ? (
                        clientAddresses.map((addr) => (
                          <SelectItem key={addr.id} value={addr.id.toString()}>
                            {addr.direccion} {addr.municipio ? `(${addr.municipio})` : ''}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-slate-500 text-center">No hay direcciones registradas</div>
                      )}
                      <SelectItem value="nueva_direccion" className="text-blue-600 font-medium border-t mt-1 pt-1">
                          <span className="flex items-center gap-2">
                              <Plus className="h-4 w-4" /> Agregar nueva dirección
                          </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="vehiculoCliente"
                    className="text-sm font-medium text-slate-700"
                  >
                    Vehículo del Cliente
                  </Label>
                  <Select
                      key={selectedVehicleId}
                      name="vehiculoCliente"
                      value={selectedVehicleId}
                      onValueChange={(value) => {
                        if (value === "nuevo_vehiculo") {
                          setIsVehicleModalOpen(true);
                        } else {
                          setSelectedVehicleId(value);
                        }
                      }}
                      disabled={!selectedClienteId}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder={selectedClienteId ? "Seleccione un vehículo" : "Seleccione un cliente primero"} />
                    </SelectTrigger>
                    <SelectContent>
                      {clientVehicles.length > 0 ? (
                        clientVehicles.map((veh) => (
                          <SelectItem key={veh.id} value={veh.id.toString()}>
                            {veh.placa} {veh.marca ? `- ${veh.marca}` : ''}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-slate-500 text-center">No hay vehículos registrados</div>
                      )}
                      <SelectItem value="nuevo_vehiculo" className="text-blue-600 font-medium border-t mt-1 pt-1">
                          <span className="flex items-center gap-2">
                              <Plus className="h-4 w-4" /> Agregar nuevo vehículo
                          </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Sección: Detalles del Servicio */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-green-50 rounded-lg">
                <Wrench className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Detalles del Servicio
                </h2>
                <p className="text-sm text-slate-600">
                  Configure el tipo y las características del servicio
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="empresa"
                  className="text-sm font-medium text-slate-700"
                >
                  Empresa Asociada
                </Label>
                <Select 
                  name="empresa" 
                  onValueChange={setSelectedEmpresaId}
                  value={selectedEmpresaId}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Seleccione una empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="tipoServicio"
                  className="text-sm font-medium text-slate-700"
                >
                  Tipo de Servicio <span className="text-red-500">*</span>
                </Label>
                <Select name="tipoServicio" required disabled={!selectedEmpresaId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={selectedEmpresaId ? "Seleccione el tipo" : "Seleccione una empresa primero"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTiposServicios.map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id.toString()}>
                        {tipo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="servicio"
                  className="text-sm font-medium text-slate-700"
                >
                  Servicio Específico <span className="text-red-500">*</span>
                </Label>
                <Select name="servicio" required disabled={!selectedEmpresaId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={selectedEmpresaId ? "Seleccione un servicio" : "Seleccione una empresa primero"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredServicios.map((serv) => (
                      <SelectItem key={serv.id} value={serv.id.toString()}>
                        {serv.nombre}
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
                  Técnico Asignado
                </Label>
                <Select name="tecnico" disabled={!selectedEmpresaId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={selectedEmpresaId ? "Seleccione un técnico" : "Seleccione una empresa primero"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTecnicos.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id.toString()}>
                        {tech.nombre} {tech.apellido}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="zona"
                  className="text-sm font-medium text-slate-700"
                >
                  Zona
                </Label>
                <Select name="zona">
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Seleccione una zona" />
                  </SelectTrigger>
                  <SelectContent>
                    {zonas.map((z) => (
                      <SelectItem key={z.id} value={z.id.toString()}>
                        {z.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                placeholder="Notas adicionales sobre el servicio"
                rows={3}
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="observacionFinal"
                className="text-sm font-medium text-slate-700"
              >
                Observación Final
              </Label>
              <Textarea
                id="observacionFinal"
                name="observacionFinal"
                placeholder="Observaciones finales del servicio"
                rows={3}
                className="min-h-[80px]"
              />
            </div>
          </div>

          {/* Sección: Fechas y Horarios */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-orange-50 rounded-lg">
                <Calendar className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Fechas y Horarios
                </h2>
                <p className="text-sm text-slate-600">
                  Agende la visita del servicio
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="fechaVisita"
                  className="text-sm font-medium text-slate-700"
                >
                  Fecha de Visita
                </Label>
                <Input
                  id="fechaVisita"
                  name="fechaVisita"
                  type="date"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="horaInicio"
                  className="text-sm font-medium text-slate-700"
                >
                  Hora de Inicio Estimada (12h)
                </Label>
                <Input
                  id="horaInicio"
                  name="horaInicio"
                  type="time"
                  className="h-11"
                />
              </div>
            </div>
          </div>

          {/* Sección: Información de Pago y Estado */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-purple-50 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Pago y Estado
                </h2>
                <p className="text-sm text-slate-600">
                  Detalles financieros y estado de la orden
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="valorCotizado"
                  className="text-sm font-medium text-slate-700"
                >
                  Valor Cotizado
                </Label>
                <Input
                  id="valorCotizado"
                  name="valorCotizado"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="valorPagado"
                  className="text-sm font-medium text-slate-700"
                >
                  Valor Pagado
                </Label>
                <Input
                  id="valorPagado"
                  name="valorPagado"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="h-11"
                />
              </div>

              {selectedEmpresaId === "2" && (
                <div className="space-y-2">
                  <Label
                    htmlFor="valorRepuestos"
                    className="text-sm font-medium text-slate-700"
                  >
                    Valor Repuestos
                  </Label>
                  <Input
                    id="valorRepuestos"
                    name="valorRepuestos"
                    type="number"
                    step="0.01"
                    defaultValue={0}
                    placeholder="0.00"
                    className="h-11"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label
                  htmlFor="metodoPago"
                  className="text-sm font-medium text-slate-700"
                >
                  Método de Pago
                </Label>
                <Select name="metodoPago" disabled={!selectedEmpresaId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={selectedEmpresaId ? "Seleccione un método" : "Seleccione una empresa primero"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredMetodosPago.map((mp) => (
                      <SelectItem key={mp.id} value={mp.id.toString()}>
                        {mp.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="estado"
                  className="text-sm font-medium text-slate-700"
                >
                  Estado del Servicio
                </Label>
                <Select name="estado" disabled={!selectedEmpresaId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={selectedEmpresaId ? "Seleccione un estado" : "Seleccione una empresa primero"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredEstadosServicio.map((estado) => (
                      <SelectItem key={estado.id} value={estado.id.toString()}>
                        {estado.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-between pt-6 border-t-2 border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-red-500">*</span>
              <span>Campos obligatorios</span>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/servicios")}
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
                    Crear Orden
                  </span>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>

      <Dialog open={isAddressModalOpen} onOpenChange={setIsAddressModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Agregar Nueva Dirección</DialogTitle>
            <DialogDescription>
              Registre una nueva dirección para el cliente seleccionado
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Dirección Principal <span className="text-red-500">*</span>
              </Label>
              <Input
                value={newAddress.direccion}
                onChange={(e) => setNewAddress({...newAddress, direccion: e.target.value})}
                placeholder="Ej. Calle 123 # 45 - 67"
                className="bg-white h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Link de Maps
              </Label>
              <Input
                value={newAddress.linkMaps}
                onChange={(e) => setNewAddress({...newAddress, linkMaps: e.target.value})}
                placeholder="https://maps.google.com/..."
                className="bg-white h-11"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Municipio
                </Label>
                <Combobox
                  options={municipiosOptions}
                  value={newAddress.municipio}
                  onChange={(value) => setNewAddress({...newAddress, municipio: value, barrio: ""})}
                  placeholder="Seleccionar..."
                  emptyMessage="Municipio no encontrado"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Barrio
                </Label>
                <Combobox
                  options={barriosOptions}
                  value={newAddress.barrio}
                  onChange={(value) => setNewAddress({...newAddress, barrio: value})}
                  placeholder="Seleccionar..."
                  emptyMessage="Barrio no encontrado"
                  disabled={!newAddress.municipio}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Piso
                </Label>
                <Input
                  value={newAddress.piso}
                  onChange={(e) => setNewAddress({...newAddress, piso: e.target.value})}
                  placeholder="Ej. 2"
                  className="bg-white h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Bloque / Torre
                </Label>
                <Input
                  value={newAddress.bloque}
                  onChange={(e) => setNewAddress({...newAddress, bloque: e.target.value})}
                  placeholder="Ej. Torre 1"
                  className="bg-white h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Apto / Unidad
                </Label>
                <Input
                  value={newAddress.unidad}
                  onChange={(e) => setNewAddress({...newAddress, unidad: e.target.value})}
                  placeholder="Ej. 201"
                  className="bg-white h-11"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddressModalOpen(false)}
              disabled={savingAddress}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveAddress}
              disabled={savingAddress}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {savingAddress ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Guardando...
                </span>
              ) : (
                "Guardar Dirección"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isVehicleModalOpen} onOpenChange={setIsVehicleModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Agregar Nuevo Vehículo</DialogTitle>
            <DialogDescription>
              Registre un nuevo vehículo para el cliente seleccionado
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Placa <span className="text-red-500">*</span>
              </Label>
              <Input
                value={newVehicle.placa}
                onChange={(e) => setNewVehicle({...newVehicle, placa: e.target.value})}
                placeholder="Ej. ABC-123"
                className="bg-white h-11"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Marca
                </Label>
                <Input
                  value={newVehicle.marca}
                  onChange={(e) => setNewVehicle({...newVehicle, marca: e.target.value})}
                  placeholder="Ej. Toyota"
                  className="bg-white h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Modelo
                </Label>
                <Input
                  value={newVehicle.modelo}
                  onChange={(e) => setNewVehicle({...newVehicle, modelo: e.target.value})}
                  placeholder="Ej. Corolla"
                  className="bg-white h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Color
                </Label>
                <Input
                  value={newVehicle.color}
                  onChange={(e) => setNewVehicle({...newVehicle, color: e.target.value})}
                  placeholder="Ej. Blanco"
                  className="bg-white h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Tipo
                </Label>
                <Input
                  value={newVehicle.tipo}
                  onChange={(e) => setNewVehicle({...newVehicle, tipo: e.target.value})}
                  placeholder="Ej. Sedan"
                  className="bg-white h-11"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsVehicleModalOpen(false)}
              disabled={savingVehicle}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveVehicle}
              disabled={savingVehicle}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {savingVehicle ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Guardando...
                </span>
              ) : (
                "Guardar Vehículo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
