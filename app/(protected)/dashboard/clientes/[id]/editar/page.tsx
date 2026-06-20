"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { getCliente, updateCliente } from "../../actions";
import { municipiosAntioquia } from "@/lib/constants/municipios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Mail,
  Phone,
  FileText,
  ArrowLeft,
  Save,
  MapPin,
  Plus,
  Trash2,
  Car,
  UploadCloud,
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import imageCompression from "browser-image-compression";

interface Direccion {
  id: number;
  direccion: string;
  barrio: string | null;
  municipio: string | null;
  piso: string | null;
  bloque: string | null;
  unidad: string | null;
  linkMaps?: string | null;
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
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  telefono: string;
  telefono2: string | null;
  correo: string | null;
  direcciones: Direccion[];
  vehiculos: Vehiculo[];
  registroDocumento?: string | null;
  documentoPath?: string | null;
}

export default function EditarClientePage() {
  const { tenantId } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  
  const [documentoFile, setDocumentoFile] = useState<File | null>(null);
  const [registroFile, setRegistroFile] = useState<File | null>(null);
  const [documentoPath, setDocumentoPath] = useState<string | null>(null);
  const [registroDocumento, setRegistroDocumento] = useState<string | null>(null);

  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const municipiosOptions = Array.from(new Set(municipiosAntioquia.map((m) => m.nombre))).map((nombre) => ({
    value: nombre,
    label: nombre,
  }));

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }
      
      const result = await getCliente(token, id);
      if (result.error) {
        toast.error(result.error);
        router.push("/dashboard/clientes");
      } else if (result.cliente) {
        setCliente(result.cliente);
        setDocumentoPath(result.cliente.documentoPath || null);
        setRegistroDocumento(result.cliente.registroDocumento || null);
        
        // --- Process Direcciones ---
        const dirs = result.cliente.direcciones.map((d: Direccion) => ({
          id: d.id, // ID real de la BD
          direccion: d.direccion,
          barrio: d.barrio || "",
          municipio: d.municipio || "",
          piso: d.piso || "",
          bloque: d.bloque || "",
          unidad: d.unidad || "",
          linkMaps: d.linkMaps || "",
        }));
        setDirecciones(dirs);
        
        // --- Process Vehiculos ---
        const vehs = result.cliente.vehiculos.map((v: Vehiculo) => ({
            id: v.id,
            placa: v.placa,
            marca: v.marca || "",
            modelo: v.modelo || "",
            color: v.color || "",
            tipo: v.tipo || "",
        }));
        setVehiculos(vehs);
      }
      setLoading(false);
    };
    
    fetchData();
  }, [id, router]);

  const agregarDireccion = () => {
    setDirecciones([
      ...direcciones,
      {
        id: Date.now(), // ID temporal
        direccion: "",
        barrio: "",
        municipio: "",
        piso: "",
        bloque: "",
        unidad: "",
        linkMaps: "",
      },
    ]);
  };

  const eliminarDireccion = (id: number) => {
    if (direcciones.length === 1) {
      toast.error("Debe registrar al menos una dirección.");
      return;
    }
    setDirecciones(direcciones.filter((d) => d.id !== id));
  };

  const handleDireccionChange = (id: number, field: string, value: string) => {
    setDirecciones(
      direcciones.map((d) => {
        if (d.id === id) {
          if (field === "municipio") {
            return { ...d, [field]: value, barrio: "" };
          }
          return { ...d, [field]: value };
        }
        return d;
      }),
    );
  };

  const agregarVehiculo = () => {
    setVehiculos([
      ...vehiculos,
      {
        id: Date.now(), // Temporal ID for new vehicles
        placa: "",
        marca: "",
        modelo: "",
        color: "",
        tipo: "",
      },
    ]);
  };

  const eliminarVehiculo = (id: number) => {
    if (direcciones.length === 0 && vehiculos.length === 1) {
      toast.error("Debe registrar al menos una dirección o un vehículo.");
      return;
    }
    setVehiculos(vehiculos.filter((v) => v.id !== id));
  };

  const handleVehiculoChange = (id: number, field: string, value: string) => {
    setVehiculos(
      vehiculos.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const token = localStorage.getItem("token");

    if (!token) {
      toast.error("No se encontró sesión activa");
      router.push("/sign-in");
      setSaving(false);
      return;
    }

    const uploadImage = async (file: File, folder: string, bucket: string = "turno"): Promise<string | null> => {
        try {
            const signRes = await fetch("/api/storage/sign-url", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    folder,
                    fileType: file.type,
                    extension: file.name.split('.').pop(),
                    bucket
                })
            });
            
            if (!signRes.ok) throw new Error("Error getting signed URL");
            const { signedUrl, publicUrl } = await signRes.json();

            const uploadRes = await fetch(signedUrl, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": file.type
                }
            });

            if (!uploadRes.ok) throw new Error("Error uploading file");

            return publicUrl;
        } catch (error) {
            console.error("Upload error:", error);
            return null;
        }
    };

    if (tenantId === 4) {
        // Upload Documento de Identidad (documentoPath)
        if (documentoFile) {
            try {
                let fileToUpload = documentoFile;
                if (documentoFile.type.startsWith('image/')) {
                     const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
                     fileToUpload = await imageCompression(documentoFile, options);
                }
                const url = await uploadImage(fileToUpload, "documentos", "clienteDocumentos");
                if (url) formData.append("documentoPath", url);
            } catch (error) {
                console.error("Error uploading documento:", error);
                toast.error("Error al subir el documento de identidad");
                setSaving(false);
                return;
            }
        } else if (documentoPath) {
            // Keep existing if not changed
            formData.append("documentoPath", documentoPath);
        }

        // Upload Registro (registroDocumento)
        if (registroFile) {
            try {
                let fileToUpload = registroFile;
                if (registroFile.type.startsWith('image/')) {
                     const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
                     fileToUpload = await imageCompression(registroFile, options);
                }
                const url = await uploadImage(fileToUpload, "registros", "clienteDocumentos");
                if (url) formData.append("registroDocumento", url);
            } catch (error) {
                console.error("Error uploading registro:", error);
                toast.error("Error al subir el registro");
                setSaving(false);
                return;
            }
        } else if (registroDocumento) {
            // Keep existing if not changed
            formData.append("registroDocumento", registroDocumento);
        }
    }

    if (direcciones.length === 0 && vehiculos.length === 0) {
      toast.error("Debe registrar al menos una dirección o un vehículo.");
      setSaving(false);
      return;
    }
    
    formData.append("direcciones", JSON.stringify(direcciones));
    formData.append("vehiculos", JSON.stringify(vehiculos));

    try {
      const result = await updateCliente(token, id, formData);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message);
        router.push("/dashboard/clientes");
      }
    } catch {
      toast.error("Ocurrió un error inesperado");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
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
              onClick={() => router.push("/dashboard/clientes")}
              className="hover:bg-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Editar Cliente
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Modifique la información del cliente
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard/clientes")}
            disabled={saving}
          >
            Cancelar
          </Button>
        </div>
      </div>

      {/* Contenido del formulario */}
      <div className="flex-1 bg-white px-8 py-8 overflow-y-auto">
        <form
          id="cliente-form"
          onSubmit={handleSubmit}
          className="max-w-5xl mx-auto space-y-8"
        >
          {/* Información Personal */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-blue-50 rounded-lg">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Información Personal
                </h2>
                <p className="text-sm text-slate-600">
                  Datos básicos del cliente
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="nombre"
                  className="text-sm font-medium text-slate-700"
                >
                  Nombre <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nombre"
                  name="nombre"
                  defaultValue={cliente?.nombre || ""}
                  placeholder="Ingrese el nombre"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="apellido"
                  className="text-sm font-medium text-slate-700"
                >
                  Apellido <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="apellido"
                  name="apellido"
                  defaultValue={cliente?.apellido || ""}
                  placeholder="Ingrese el apellido"
                  required
                  className="h-11"
                />
              </div>
            </div>
          </div>

          {/* Documentación */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Documentación
                </h2>
                <p className="text-sm text-slate-600">
                  Documento de identidad del cliente
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className="md:col-span-3 space-y-2">
                <Label
                  htmlFor="tipoDocumento"
                  className="text-sm font-medium text-slate-700"
                >
                  Tipo de Documento <span className="text-red-500">*</span>
                </Label>
                <Select name="tipoDocumento" defaultValue={cliente?.tipoDocumento || ""} required>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Seleccione un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                    <SelectItem value="NIT">NIT</SelectItem>
                    <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                    <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                    <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label
                  htmlFor="numeroDocumento"
                  className="text-sm font-medium text-slate-700"
                >
                  Número de Documento <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="numeroDocumento"
                  name="numeroDocumento"
                  defaultValue={cliente?.numeroDocumento || ""}
                  placeholder="Ej. 1234567890"
                  required
                  className="h-11"
                />
              </div>
            </div>

            {tenantId === 4 && (
                <div className="md:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                    {/* Documento de Identidad Upload */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                            Copia Documento de Identidad
                        </Label>
                        <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-6 hover:bg-slate-50 transition-colors text-center cursor-pointer group">
                            <Input
                                type="file"
                                accept="image/*,.pdf"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={(e) => setDocumentoFile(e.target.files?.[0] || null)}
                            />
                            {documentoFile ? (
                                <div className="flex flex-col items-center justify-center gap-2 text-blue-600">
                                    <FileText className="h-8 w-8" />
                                    <span className="text-xs font-medium truncate max-w-[200px]">{documentoFile.name}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="z-20 hover:bg-blue-100 h-6 px-2 text-xs"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setDocumentoFile(null);
                                        }}
                                    >
                                        Quitar
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-slate-500">
                                    {documentoPath ? (
                                        <>
                                            <FileText className="h-8 w-8 text-green-500 mb-2" />
                                            <span className="text-sm font-medium text-green-600">Documento Actual Cargado</span>
                                            <span className="text-[10px] text-slate-400 mt-1">Clic para reemplazar</span>
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="h-8 w-8 mb-2" />
                                            <span className="text-sm font-medium">Subir Documento</span>
                                            <span className="text-[10px] text-slate-400 mt-1">PDF/IMG</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        {documentoPath && !documentoFile && (
                            <div className="text-right">
                                <a 
                                    href={documentoPath} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline"
                                >
                                    Ver documento actual
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Registro Upload */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                            Registro (RUT / Cámara Comercio)
                        </Label>
                        <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-6 hover:bg-slate-50 transition-colors text-center cursor-pointer group">
                            <Input
                                type="file"
                                accept="image/*,.pdf"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={(e) => setRegistroFile(e.target.files?.[0] || null)}
                            />
                            {registroFile ? (
                                <div className="flex flex-col items-center justify-center gap-2 text-blue-600">
                                    <FileText className="h-8 w-8" />
                                    <span className="text-xs font-medium truncate max-w-[200px]">{registroFile.name}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="z-20 hover:bg-blue-100 h-6 px-2 text-xs"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setRegistroFile(null);
                                        }}
                                    >
                                        Quitar
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-slate-500">
                                    {registroDocumento ? (
                                        <>
                                            <FileText className="h-8 w-8 text-green-500 mb-2" />
                                            <span className="text-sm font-medium text-green-600">Registro Actual Cargado</span>
                                            <span className="text-[10px] text-slate-400 mt-1">Clic para reemplazar</span>
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="h-8 w-8 mb-2" />
                                            <span className="text-sm font-medium">Subir Registro</span>
                                            <span className="text-[10px] text-slate-400 mt-1">PDF/IMG</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        {registroDocumento && !registroFile && (
                            <div className="text-right">
                                <a 
                                    href={registroDocumento} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline"
                                >
                                    Ver registro actual
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            )}
          </div>

          {/* Información de Contacto */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-green-50 rounded-lg">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Información de Contacto
                </h2>
                <p className="text-sm text-slate-600">
                  Medios de comunicación con el cliente
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="telefono"
                  className="text-sm font-medium text-slate-700"
                >
                  Teléfono <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="telefono"
                    name="telefono"
                    type="tel"
                    defaultValue={cliente?.telefono || ""}
                    placeholder="Ej. 3001234567"
                    required
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="telefono2"
                  className="text-sm font-medium text-slate-700"
                >
                  Teléfono 2 <span className="text-slate-400 font-normal">(Opcional)</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="telefono2"
                    name="telefono2"
                    type="tel"
                    defaultValue={cliente?.telefono2 || ""}
                    placeholder="Ej. 3007654321"
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="correo"
                  className="text-sm font-medium text-slate-700"
                >
                  Correo Electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="correo"
                    name="correo"
                    type="email"
                    defaultValue={cliente?.correo || ""}
                    placeholder="Ej. cliente@ejemplo.com"
                    className="h-11 pl-10"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Direcciones */}
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-50 rounded-lg">
                  <MapPin className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Direcciones
                  </h2>
                  <p className="text-sm text-slate-600">
                    Ubicaciones asociadas al cliente
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={agregarDireccion}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar Dirección
              </Button>
            </div>

            <div className="space-y-4">
              {direcciones.map((dir) => {
                const barriosDisponibles =
                  municipiosAntioquia.find((m) => m.nombre === dir.municipio)
                    ?.barrios || [];

                const barriosOptions = Array.from(new Set(barriosDisponibles)).map((b) => ({
                  value: b,
                  label: b,
                }));

                return (
                  <div
                    key={dir.id}
                    className="p-5 bg-slate-50 rounded-lg border border-slate-200 relative"
                  >
                    {direcciones.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => eliminarDireccion(dir.id)}
                        className="absolute top-3 right-3 text-slate-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}

                    <div className="grid grid-cols-1 gap-4 mb-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Dirección Principal{" "}
                          <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          value={dir.direccion}
                          onChange={(e) =>
                            handleDireccionChange(
                              dir.id,
                              "direccion",
                              e.target.value,
                            )
                          }
                          placeholder="Ej. Calle 123 # 45 - 67"
                          required
                          className="bg-white h-11"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Link de Maps
                        </Label>
                        <Input
                          value={dir.linkMaps || ""}
                          onChange={(e) =>
                            handleDireccionChange(
                              dir.id,
                              "linkMaps",
                              e.target.value,
                            )
                          }
                          placeholder="https://maps.google.com/..."
                          className="bg-white h-11"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Municipio
                        </Label>
                        <Combobox
                          options={municipiosOptions}
                          value={dir.municipio ?? undefined}
                          onChange={(value) =>
                            handleDireccionChange(dir.id, "municipio", value)
                          }
                          placeholder="Seleccionar municipio"
                          emptyMessage="Municipio no encontrado"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Barrio
                        </Label>
                        <Combobox
                          options={barriosOptions}
                          value={dir.barrio ?? undefined}
                          onChange={(value) =>
                            handleDireccionChange(dir.id, "barrio", value)
                          }
                          placeholder="Seleccionar barrio"
                          emptyMessage="Barrio no encontrado"
                          disabled={!dir.municipio}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Piso
                        </Label>
                        <Input
                          value={dir.piso || ""}
                          onChange={(e) =>
                            handleDireccionChange(
                              dir.id,
                              "piso",
                              e.target.value,
                            )
                          }
                          placeholder="Ej. 2"
                          className="bg-white h-11"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Bloque / Torre
                        </Label>
                        <Input
                          value={dir.bloque || ""}
                          onChange={(e) =>
                            handleDireccionChange(
                              dir.id,
                              "bloque",
                              e.target.value,
                            )
                          }
                          placeholder="Ej. Torre 1"
                          className="bg-white h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Apto / Unidad
                        </Label>
                        <Input
                          value={dir.unidad || ""}
                          onChange={(e) =>
                            handleDireccionChange(
                              dir.id,
                              "unidad",
                              e.target.value,
                            )
                          }
                          placeholder="Ej. 201"
                          className="bg-white h-11"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vehículos */}
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Car className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Vehículos
                  </h2>
                  <p className="text-sm text-slate-600">
                    Vehículos asociados al cliente
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={agregarVehiculo}
                className="text-purple-600 border-purple-200 hover:bg-purple-50"
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar Vehículo
              </Button>
            </div>

            <div className="space-y-4">
              {vehiculos.map((veh) => (
                <div
                  key={veh.id}
                  className="p-5 bg-slate-50 rounded-lg border border-slate-200 relative"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => eliminarVehiculo(veh.id)}
                    className="absolute top-3 right-3 text-slate-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Placa <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={veh.placa}
                        onChange={(e) =>
                          handleVehiculoChange(veh.id, "placa", e.target.value)
                        }
                        placeholder="Ej. AAA-123"
                        required
                        className="bg-white h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Marca
                      </Label>
                      <Input
                        value={veh.marca || ""}
                        onChange={(e) =>
                          handleVehiculoChange(veh.id, "marca", e.target.value)
                        }
                        placeholder="Ej. Chevrolet"
                        className="bg-white h-11"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Modelo (Año)
                      </Label>
                      <Input
                        value={veh.modelo || ""}
                        onChange={(e) =>
                          handleVehiculoChange(veh.id, "modelo", e.target.value)
                        }
                        placeholder="Ej. 2020"
                        className="bg-white h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Color
                      </Label>
                      <Input
                        value={veh.color || ""}
                        onChange={(e) =>
                          handleVehiculoChange(veh.id, "color", e.target.value)
                        }
                        placeholder="Ej. Rojo"
                        className="bg-white h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Tipo
                      </Label>
                      <Input
                        value={veh.tipo || ""}
                        onChange={(e) =>
                          handleVehiculoChange(veh.id, "tipo", e.target.value)
                        }
                        placeholder="Ej. Automóvil"
                        className="bg-white h-11"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {vehiculos.length === 0 && (
                <div className="text-center py-8 text-slate-500 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg">
                  No hay vehículos registrados para este cliente.
                </div>
              )}
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
                onClick={() => router.push("/dashboard/clientes")}
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
                    Actualizando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Actualizar Cliente
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
