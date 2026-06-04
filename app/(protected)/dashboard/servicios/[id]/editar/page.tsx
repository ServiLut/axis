"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  User,
  Wrench,
  Calendar,
  DollarSign,
  Plus,
  Lock,
  Unlock,
  Clock,
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
import { getFormData, updateOrdenServicio, addDireccionToCliente, getOrdenServicio } from "../../actions";
import { getCliente } from "../../../clientes/actions";
import { checkPermission, requestPermission, getMyPermissionStatus } from "@/app/(protected)/dashboard/configuracion/permisos/actions";
import type { Permiso } from "@/prisma/generated/prisma/client";

interface Direccion {
  id: number;
  direccion: string;
  municipio: string | null;
  barrio: string | null;
  piso: string | null;
  bloque: string | null;
  unidad: string | null;
}

interface Vehiculo {
  id: number;
  placa: string;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  tipo: string | null;
}

interface Cliente {
  id: number;
  nombre: string | null;
  apellido: string | null;
  numeroDocumento: string | null;
  direcciones: Direccion[];
  vehiculos: Vehiculo[];
}

interface TipoServicio {
  id: number;
  nombre: string;
  empresaId: number | null;
}

interface ServicioItem {
  id: number;
  nombre: string;
  empresaId: number | null;
}

interface Tecnico {
  id: number;
  nombre: string;
  apellido: string;
  empresaId: number | null;
}

interface Empresa {
  id: number;
  nombre: string;
}

interface Zona {
  id: number;
  nombre: string;
}

interface MetodoPago {
  id: number;
  nombre: string;
}

interface EstadoServicio {
  id: number;
  nombre: string;
  empresaId: number | null;
}

interface OrdenData {
  tipoServicioId?: number | null;
  servicioId?: number | null;
  tecnicoId?: number | null;
  zonaId?: number | null;
  observacion?: string | null;
  observacionFinal?: string | null;
  linkMaps?: string | null;
  fechaVisita?: string | Date | null;
  horaInicio?: string | Date | null;
  valorCotizado?: number | null;
  valorPagado?: number | null;
  valorRepuestos?: number | null;
  metodoPagoId?: number | null;
  estado?: string;
  estadoServicioId?: number;
  clienteId: number;
  empresaId?: number | null;
  direccionId?: number | null;
  vehiculoId?: number | null;
}

export default function EditarServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const ordenId = Number(resolvedParams.id);

  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  
  // Data State
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tiposServicios, setTiposServicios] = useState<TipoServicio[]>([]);
  const [servicios, setServicios] = useState<ServicioItem[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);
  const [estadosServicio, setEstadosServicio] = useState<EstadoServicio[]>([]);

  // Selection State
  const [selectedClienteId, setSelectedClienteId] = useState<string>("");
  const [clientAddresses, setClientAddresses] = useState<Direccion[]>([]);
  const [clientVehicles, setClientVehicles] = useState<Vehiculo[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>("");
  
  // Form specific state for edit
  const [ordenData, setOrdenData] = useState<OrdenData | null>(null);

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

  // Permission State
  const [canEditPrice, setCanEditPrice] = useState(false);
  const [canEditType, setCanEditType] = useState(false);
  const [pricePermissionStatus, setPricePermissionStatus] = useState<Permiso | null>(null);
  const [typePermissionStatus, setTypePermissionStatus] = useState<Permiso | null>(null);
  
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [requestType, setRequestType] = useState<"EDITAR_VALOR_COTIZADO" | "EDITAR_TIPO_SERVICIO" | null>(null);
  const [requestMotivo, setRequestMotivo] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);

  const prevClientIdRef = useRef(selectedClienteId);
  const router = useRouter();

  // Check permissions
  useEffect(() => {
    const checkPermissions = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      const [priceCheck, typeCheck, priceStatus, typeStatus] = await Promise.all([
        checkPermission(token, "EDITAR_VALOR_COTIZADO", ordenId.toString()),
        checkPermission(token, "EDITAR_TIPO_SERVICIO", ordenId.toString()),
        getMyPermissionStatus(token, "EDITAR_VALOR_COTIZADO", ordenId.toString()),
        getMyPermissionStatus(token, "EDITAR_TIPO_SERVICIO", ordenId.toString())
      ]);

      setCanEditPrice(priceCheck.allowed);
      setCanEditType(typeCheck.allowed);
      setPricePermissionStatus(priceStatus.permiso ?? null);
      setTypePermissionStatus(typeStatus.permiso ?? null);
    };

    if (ordenId) {
      checkPermissions();
    }
  }, [ordenId]);

  const handleRequestPermissionClick = (tipo: "EDITAR_VALOR_COTIZADO" | "EDITAR_TIPO_SERVICIO") => {
    setRequestType(tipo);
    setRequestMotivo("");
    setIsRequestDialogOpen(true);
  };

  const submitPermissionRequest = async () => {
    if (!requestType) return;
    if (!requestMotivo.trim()) {
        toast.error("Por favor ingrese un motivo");
        return;
    }

    setSendingRequest(true);
    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await requestPermission(token, requestType, ordenId.toString(), requestMotivo);
    
    if (res.error) {
        toast.error(res.error);
    } else if (res.message) {
        toast.success(res.message);
        setIsRequestDialogOpen(false);
        // Refresh status
        if (requestType === "EDITAR_VALOR_COTIZADO") {
            const status = await getMyPermissionStatus(token, "EDITAR_VALOR_COTIZADO", ordenId.toString());
            setPricePermissionStatus(status.permiso ?? null);
        } else {
            const status = await getMyPermissionStatus(token, "EDITAR_TIPO_SERVICIO", ordenId.toString());
            setTypePermissionStatus(status.permiso ?? null);
        }
    }
    setSendingRequest(false);
  };

  // Filter services based on selected company
  const filteredServicios = servicios.filter(s => 
    !s.empresaId || (selectedEmpresaId && s.empresaId.toString() === selectedEmpresaId)
  );

  // Filter service types based on selected company
  const filteredTiposServicios = tiposServicios.filter(t => 
    !t.empresaId || (selectedEmpresaId && t.empresaId.toString() === selectedEmpresaId)
  );

  // Filter technicians based on selected company
  const filteredTecnicos = tecnicos.filter(t => 
    !t.empresaId || (selectedEmpresaId && t.empresaId.toString() === selectedEmpresaId)
  );

  // States are filtered by tenant in the backend. 
  // We show all states available for the tenant as requested.
  const filteredEstados = estadosServicio;

  // Prepare client options for Combobox
  const clientOptions = clientes.map(c => ({
    value: c.id.toString(),
    label: `(${c.numeroDocumento || 'S/N'}) ${c.nombre || ''} ${c.apellido || ''}`.trim()
  }));

  const municipiosOptions = Array.from(new Set(municipiosAntioquia.map((m) => m.nombre))).map((nombre) => ({
    value: nombre,
    label: nombre,
  }));

  const barriosOptions = newAddress.municipio 
    ? Array.from(new Set(municipiosAntioquia.find(m => m.nombre === newAddress.municipio)?.barrios || [])).map(b => ({ value: b, label: b }))
    : [];

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      const [formDataRes, ordenRes] = await Promise.all([
        getFormData(token),
        getOrdenServicio(token, ordenId)
      ]);
      
      if (formDataRes.error) {
        toast.error(formDataRes.error);
        return;
      }

      if (ordenRes.error || !ordenRes.orden) {
        toast.error(ordenRes.error || "Error cargando orden");
        router.push("/dashboard/servicios");
        return;
      }

      setClientes((formDataRes.clientes as Cliente[]) || []);
      setTiposServicios(formDataRes.tiposServicios || []);
      setServicios(formDataRes.servicios || []);
      setTecnicos(formDataRes.tecnicos || []);
      setEmpresas(formDataRes.empresas || []);
      setZonas(formDataRes.zonas || []);
      setMetodosPago(formDataRes.metodosPago || []);
      setEstadosServicio(formDataRes.estadosServicio || []);
      
      // Load order data
      const order = ordenRes.orden as unknown as (OrdenData & { 
        cliente: Cliente; 
        direccionId?: number | null;
        vehiculoId?: number | null;
        empresaId?: number | null;
      });
      setOrdenData(order);
      setSelectedClienteId(order.clienteId.toString());
      setSelectedEmpresaId(order.empresaId?.toString() || "");
      
      // Add current client to list so Combobox displays it correctly
      // We need to fetch address/vehicles for this client since they might not be fully populated in the 'orden.cliente' object
      // Actually, looking at getOrdenServicio in actions.ts, it includes 'cliente: true' but NOT 'direcciones' or 'vehiculos' nested in cliente.
      // However, we can construct a partial client or ideally we should fetch full client details.
      // But wait! getOrdenServicio DOES NOT include nested relations for cliente.
      // We should probably rely on the fact that we can't edit the client, so we just need enough info for the label.
      // BUT for addresses and vehicles logic below, we DO need them.
      
      // Let's check if we can reconstruct it from what we have or if we need to fetch it.
      // Since we can't easily fetch just one client with current actions (searchClientes requires term),
      // let's manually construct the client object with the data available in the order relation.
      // NOTE: The 'direcciones' and 'vehiculos' are crucial for the dropdowns below. 
      // Since getOrdenServicio includes 'direccion' and 'vehiculo' relations of the ORDER, but not ALL addresses of the client.
      // We might have a problem if we want to change address to another one of the SAME client.
      // For now, let's at least make the client name appear.
      // To properly fix the address/vehicle dropdowns, we would need to fetch that client's details.
      // Since we don't have a specific 'getCliente' action exposed here, and 'searchClientes' is for list...
      // Actually, let's try to search for this specific client using their document number to get full details including addresses.
      
      // Use getCliente to reliably fetch the client and their addresses by ID
      if (order.clienteId) {
         try {
             const clientRes = await getCliente(token, order.clienteId);
             if (clientRes.cliente) {
                 setClientes([clientRes.cliente as unknown as Cliente]);
             } else {
                 // Fallback if client not found (unlikely)
                 setClientes([{ ...order.cliente, direcciones: [], vehiculos: [] } as unknown as Cliente]); 
             }
         } catch (e) {
             console.error("Error fetching client details", e);
             setClientes([{ ...order.cliente, direcciones: [], vehiculos: [] } as unknown as Cliente]);
         }
      } else {
          // Absolute fallback
           setClientes([{ ...order.cliente, direcciones: [], vehiculos: [] } as unknown as Cliente]);
      }

      setSelectedAddressId(order.direccionId?.toString() || "");
      setSelectedVehicleId(order.vehiculoId?.toString() || "");

      setLoadingData(false);
    };

    fetchData();
  }, [router, ordenId]);

  // Import searchClientes at the top of the file!
  // Wait, I need to add the import to the existing imports.
  // The 'replace' tool works on text blocks. I will do this in two steps or ensure import is there.
  // 'searchClientes' is already imported in the original file? Let me check the file content provided previously.
  // Yes, 'getFormData, updateOrdenServicio, addDireccionToCliente, getOrdenServicio' are imported. 'searchClientes' is NOT.
  // I must add 'searchClientes' to the import list first.


  // Update addresses and vehicles when client changes
  useEffect(() => {
    if (selectedClienteId && clientes.length > 0) {
      const client = clientes.find(c => c.id.toString() === selectedClienteId);
      
      const newAddresses = client?.direcciones || [];
      const newVehicles = client?.vehiculos || [];

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClientAddresses(newAddresses);
       
      setClientVehicles(newVehicles);
      
      // Only reset selection if the client actually changed
      if (prevClientIdRef.current && prevClientIdRef.current !== selectedClienteId) {
         
        setSelectedAddressId("");
         
        setSelectedVehicleId("");
      }
      prevClientIdRef.current = selectedClienteId;
    } else if (!selectedClienteId) {
       
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
      
      setClientes(clientes.map(c => 
        c.id.toString() === selectedClienteId 
          ? { ...c, direcciones: updatedAddresses } 
          : c
      ));

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

    // Append client ID since Combobox doesn't work like a native select inside form
    if (selectedClienteId) {
      formData.set("cliente", selectedClienteId);
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

    // Clear valorRepuestos if empresa 2 is not selected
    if (selectedEmpresaId !== "2") {
        formData.delete("valorRepuestos");
    }

    const result = await updateOrdenServicio(token, ordenId, formData);

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
                Editar Orden de Servicio #{ordenId}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Modifique los detalles del servicio
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
                  Datos del cliente y ubicación
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="cliente"
                  className="text-sm font-medium text-slate-700"
                >
                  Cliente <span className="text-red-500">*</span>
                </Label>
                <Combobox
                  options={clientOptions}
                  value={selectedClienteId}
                  onChange={() => {}} // It's disabled, so this won't be called
                  disabled={true}
                  placeholder="Buscar cliente..."
                  emptyMessage="No se encontraron clientes."
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
                      onValueChange={setSelectedVehicleId}
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
                <div className="flex justify-between items-center">
                    <Label
                    htmlFor="tipoServicio"
                    className="text-sm font-medium text-slate-700"
                    >
                    Tipo de Servicio <span className="text-red-500">*</span>
                    </Label>
                    {!canEditType && (
                        <div className="flex items-center gap-2">
                            {typePermissionStatus?.estado === "PENDIENTE" ? (
                                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Solicitado
                                </span>
                            ) : (
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 text-xs text-blue-600 hover:text-blue-800 px-2"
                                    onClick={() => handleRequestPermissionClick("EDITAR_TIPO_SERVICIO")}
                                >
                                    <Lock className="h-3 w-3 mr-1" /> Solicitar Edición
                                </Button>
                            )}
                        </div>
                    )}
                    {canEditType && (
                         <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Unlock className="h-3 w-3" /> Editando
                        </span>
                    )}
                </div>
                <Select name="tipoServicio" required disabled={!selectedEmpresaId || !canEditType} defaultValue={ordenData?.tipoServicioId?.toString()}>
                  <SelectTrigger className={`h-11 ${!canEditType ? "bg-slate-50" : ""}`}>
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
                {!canEditType && ordenData?.tipoServicioId && (
                    <input type="hidden" name="tipoServicio" value={ordenData.tipoServicioId.toString()} />
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="servicio"
                  className="text-sm font-medium text-slate-700"
                >
                  Servicio Específico <span className="text-red-500">*</span>
                </Label>
                <Select name="servicio" required disabled={!selectedEmpresaId} defaultValue={ordenData?.servicioId?.toString()}>
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
                <Select name="tecnico" disabled={!selectedEmpresaId} defaultValue={ordenData?.tecnicoId?.toString()}>
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
                <Select name="zona" defaultValue={ordenData?.zonaId?.toString()}>
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
                defaultValue={ordenData?.observacion || ""}
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
                defaultValue={ordenData?.observacionFinal || ""}
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
                  defaultValue={ordenData?.fechaVisita ? new Date(ordenData.fechaVisita).toISOString().split('T')[0] : ""}
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="horaInicio"
                  className="text-sm font-medium text-slate-700"
                >
                  Hora de Inicio Estimada (24h)
                </Label>
                <Input
                  id="horaInicio"
                  name="horaInicio"
                  type="time"
                  className="h-11"
                  defaultValue={ordenData?.horaInicio ? new Date(ordenData.horaInicio).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}) : ""}
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
                <div className="flex justify-between items-center">
                    <Label
                    htmlFor="valorCotizado"
                    className="text-sm font-medium text-slate-700"
                    >
                    Valor Cotizado
                    </Label>
                    {!canEditPrice && (
                        <div className="flex items-center gap-2">
                            {pricePermissionStatus?.estado === "PENDIENTE" ? (
                                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Solicitado
                                </span>
                            ) : (
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 text-xs text-blue-600 hover:text-blue-800 px-2"
                                    onClick={() => handleRequestPermissionClick("EDITAR_VALOR_COTIZADO")}
                                >
                                    <Lock className="h-3 w-3 mr-1" /> Solicitar Edición
                                </Button>
                            )}
                        </div>
                    )}
                    {canEditPrice && (
                         <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Unlock className="h-3 w-3" /> Editando
                        </span>
                    )}
                </div>
                <Input
                  id="valorCotizado"
                  name="valorCotizado"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className={`h-11 ${!canEditPrice ? "bg-slate-50 text-slate-500" : ""}`}
                  defaultValue={ordenData?.valorCotizado || ""}
                  readOnly={!canEditPrice}
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
                  defaultValue={ordenData?.valorPagado || ""}
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
                    placeholder="0.00"
                    className="h-11"
                    defaultValue={ordenData?.valorRepuestos || 0}
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
                <Select name="metodoPago" defaultValue={ordenData?.metodoPagoId?.toString()}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Seleccione un método" />
                  </SelectTrigger>
                  <SelectContent>
                    {metodosPago.map((mp) => (
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
                <Select name="estado" defaultValue={ordenData?.estadoServicioId?.toString()}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Seleccione un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredEstados.length > 0 ? (
                      filteredEstados.map((estado) => (
                        <SelectItem key={estado.id} value={estado.id.toString()}>
                          {estado.nombre}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-slate-500 text-center">No hay estados disponibles</div>
                    )}
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
                    Actualizar Orden
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Solicitar Permiso de Edición</DialogTitle>
                <DialogDescription>
                    Esta acción requiere autorización. Por favor indique el motivo de la modificación.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
                <Label>Motivo de la solicitud</Label>
                <Textarea 
                    placeholder="Ej. Error en digitación inicial..." 
                    value={requestMotivo}
                    onChange={(e) => setRequestMotivo(e.target.value)}
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsRequestDialogOpen(false)}>Cancelar</Button>
                <Button onClick={submitPermissionRequest} disabled={sendingRequest}>
                    {sendingRequest ? "Enviando..." : "Enviar Solicitud"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
