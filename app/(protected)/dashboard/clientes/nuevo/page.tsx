"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  createCliente,
  getClientForMigration,
  getServilutionClientForMigration,
} from "./actions";
import { updateCliente } from "../actions";
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
  Info,
  UploadCloud,
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import imageCompression from "browser-image-compression";
import { InternationalPhoneInput } from "@/components/clientes/international-phone-input";
import { ClientLocationFields } from "@/components/clientes/location-fields";
import { normalizeClientPhone } from "@/lib/client-phone";

const showClientDocumentUploads = false;

const optionalValue = (value: string | null | undefined) => {
  if (!value || ["no concretado", "noconcretado@noconcretado.com"].includes(value.trim().toLowerCase())) return "";
  return value;
};

export default function AnadirClientePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fixClientId = searchParams.get("fixClientId");
  const migrateClientId = searchParams.get("migrateClientId");

  const { tenantId } = useUserRole();
  const [documentoFile, setDocumentoFile] = useState<File | null>(null);
  const [registroFile, setRegistroFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(
    !!fixClientId || !!migrateClientId,
  );
  const [direcciones, setDirecciones] = useState<{
    id: number;
    direccion: string;
    barrio: string;
    municipio: string;
    piso: string;
    bloque: string;
    unidad: string;
    linkMaps: string;
  }[]>([]);
  const [vehiculos, setVehiculos] = useState<
    {
      id: number;
      placa: string;
      marca: string;
      modelo: string;
      color: string;
      tipo: string;
    }[]
  >([]);

  // Form states for pre-filling
  const [initialData, setInitialData] = useState<{
    nombre: string;
    apellido: string;
    tipoDocumento: string;
    numeroDocumento: string;
    telefono: string;
    telefono2: string;
    correo: string;
  } | null>(null);

  useEffect(() => {
    if (!fixClientId && !migrateClientId) return;

    const fetchData = async () => {
      setIsFetching(true);
      const token = localStorage.getItem("token");
      if (!token) return;

      let res;
      if (fixClientId) {
        res = await getClientForMigration(token, Number(fixClientId));
      } else if (migrateClientId) {
        res = await getServilutionClientForMigration(
          token,
          Number(migrateClientId),
        );
      }

      if (!res) {
        setIsFetching(false);
        return;
      }

      if (res.error) {
        if ("existingClientId" in res && res.existingClientId) {
          toast.warning(
            "Este paciente ya ha sido migrado. Redirigiendo a edición...",
          );
          // Redirect to the edit page of the EXISTING client to prevent duplicates
          // We use setTimeout to ensure the toast is visible before redirecting
          setTimeout(() => {
            router.push(`/dashboard/clientes/${res.existingClientId}/editar`);
          }, 1500);
          return;
        }
        toast.error(res.error);
        router.push("/dashboard/clientes");
        return;
      }

      if ("cliente" in res && res.cliente) {
        setInitialData({
          nombre: optionalValue(res.cliente.nombre),
          apellido: optionalValue(res.cliente.apellido),
          tipoDocumento: optionalValue(res.cliente.tipoDocumento),
          numeroDocumento: optionalValue(res.cliente.numeroDocumento),
          telefono: res.cliente.telefono || "",
          telefono2: optionalValue(res.cliente.telefono2),
          correo: optionalValue(res.cliente.correo),
        });

        const mergedDirecciones = [];

        interface ClientData {
          direccion?: string;
          nombre_barrio?: string;
          nombre_municipio?: string;
          numero_piso?: string;
          bloque?: string;
          unidad_residencial?: string;
          linkMaps?: string;
          direcciones?: Array<{
            id: number;
            direccion: string;
            barrio?: string | null;
            municipio?: string | null;
            piso?: string | null;
            bloque?: string | null;
            unidad?: string | null;
            linkMaps?: string | null;
          }>;
          vehiculos?: Array<{
            id: number;
            placa: string;
            marca?: string | null;
            modelo?: string | null;
            color?: string | null;
            tipo?: string | null;
          }>;
        }

        const clientData = res.cliente as ClientData;

        // Add existing addresses if present (Postgres format)
        if (clientData.direcciones && Array.isArray(clientData.direcciones)) {
          mergedDirecciones.push(
            ...clientData.direcciones.map((d) => ({
              id: d.id,
              direccion: d.direccion,
              barrio: d.barrio || "",
              municipio: d.municipio || "",
              piso: d.piso || "",
              bloque: d.bloque || "",
              unidad: d.unidad || "",
              linkMaps: d.linkMaps || "",
            })),
          );
        } else if (clientData.direccion) {
          // Add primary address from MySQL (flat format)
          mergedDirecciones.push({
            id: Date.now(),
            direccion: clientData.direccion,
            barrio: clientData.nombre_barrio || "",
            municipio: clientData.nombre_municipio || "",
            piso: clientData.numero_piso || "",
            bloque: clientData.bloque || "",
            unidad: clientData.unidad_residencial || "",
            linkMaps: "",
          });
        }

        // Add hidden addresses as new entries
        if (res.hiddenDirecciones && res.hiddenDirecciones.length > 0) {
          toast.info(
            `Se encontraron ${res.hiddenDirecciones.length} direcciones adicionales del historial.`,
          );

          interface HiddenDireccion {
            direccion: string;
            barrio?: string;
            municipio?: string;
            piso?: string;
            bloque?: string;
            unidad?: string;
            linkMaps?: string;
          }

          (res.hiddenDirecciones as HiddenDireccion[]).forEach((d) => {
            mergedDirecciones.push({
              id: Date.now() + Math.random(),
              direccion: d.direccion,
              barrio: d.barrio || "",
              municipio: d.municipio || "",
              piso: d.piso || "",
              bloque: d.bloque || "",
              unidad: d.unidad || "",
              linkMaps: d.linkMaps || "",
            });
          });
        }

        if (mergedDirecciones.length > 0) {
          setDirecciones(mergedDirecciones);
        }

        // Vehiculos logic (only for Postgres currently)
        if (clientData.vehiculos && clientData.vehiculos.length > 0) {
          setVehiculos(
            clientData.vehiculos.map((v) => ({
              id: v.id,
              placa: v.placa,
              marca: v.marca || "",
              modelo: v.modelo || "",
              color: v.color || "",
              tipo: v.tipo || "",
            })),
          );
        }
      }
      setIsFetching(false);
    };

    fetchData();
  }, [fixClientId, migrateClientId, router]);

  const municipiosOptions = Array.from(
    new Set(municipiosAntioquia.map((m) => m.nombre)),
  ).map((nombre) => ({
    value: nombre,
    label: nombre,
  }));

  const agregarDireccion = () => {
    setDirecciones([
      ...direcciones,
      {
        id: Date.now(),
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
    setDirecciones(direcciones.filter((d) => d.id !== id));
  };

  const handleDireccionChange = (id: number, field: string, value: string) => {
    setDirecciones(
      direcciones.map((d) => {
        if (d.id === id) {
          // Si cambia el municipio, limpiar el barrio
          if (field === "municipio") {
            return { ...d, [field]: value, barrio: "" };
          }
          return { ...d, [field]: value };
        }
        return d;
      }),
    );
  };


  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scheduleAfterSave = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-next") === "cita";
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const token = localStorage.getItem("token");

    const uploadImage = async (
      file: File,
      folder: string,
      bucket: string = "turno",
    ): Promise<string | null> => {
      try {
        const signRes = await fetch("/api/storage/sign-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            folder,
            fileType: file.type,
            extension: file.name.split(".").pop(),
            bucket,
          }),
        });

        if (!signRes.ok) throw new Error("Error getting signed URL");
        const { signedUrl, publicUrl } = await signRes.json();

        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!uploadRes.ok) throw new Error("Error uploading file");

        return publicUrl;
      } catch (error) {
        console.error("Upload error:", error);
        return null;
      }
    };

    const telefono = formData.get("telefono") as string;

    if (tenantId === 4) {
      try {
        formData.set("telefono", normalizeClientPhone(telefono));
        formData.set("telefono2", normalizeClientPhone(String(formData.get("telefono2") || "")));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Teléfono inválido");
        setLoading(false);
        return;
      }
    } else if (!/^\d+$/.test(telefono)) {
      toast.error("El teléfono solo debe contener números sin espacios");
      setLoading(false);
      return;
    }

    if (!token) {
      toast.error("No se encontró sesión activa");
      router.push("/sign-in");
      setLoading(false);
      return;
    }

    if (tenantId === 4) {
      // Upload Documento de Identidad (documentoPath)
      if (documentoFile) {
        try {
          let fileToUpload = documentoFile;
          if (documentoFile.type.startsWith("image/")) {
            const options = {
              maxSizeMB: 1,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            };
            fileToUpload = await imageCompression(documentoFile, options);
          }
          const url = await uploadImage(
            fileToUpload,
            "documentos",
            "clienteDocumentos",
          );
          if (url) formData.append("documentoPath", url);
        } catch (error) {
          console.error("Error uploading documento:", error);
          toast.error("Error al subir el documento de identidad");
          setLoading(false);
          return;
        }
      }

      // Upload Registro (registroDocumento)
      if (registroFile) {
        try {
          let fileToUpload = registroFile;
          if (registroFile.type.startsWith("image/")) {
            const options = {
              maxSizeMB: 1,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            };
            fileToUpload = await imageCompression(registroFile, options);
          }
          // Note: Storing URL in registroDocumento field as per requirement inference
          const url = await uploadImage(
            fileToUpload,
            "registros",
            "clienteDocumentos",
          );
          if (url) formData.append("registroDocumento", url);
        } catch (error) {
          console.error("Error uploading registro:", error);
          toast.error("Error al subir el registro");
          setLoading(false);
          return;
        }
      }
    }

    // Agregar las direcciones y vehiculos al FormData como un JSON string
    formData.append("direcciones", JSON.stringify(direcciones));
    formData.append("vehiculos", JSON.stringify(vehiculos));

    try {
      let result;
      if (fixClientId) {
        result = await updateCliente(token, Number(fixClientId), formData);
      } else {
        result = await createCliente(token, formData);
      }

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.message);
        // Redirect to new service/appointment page with the client selected
        if (result.clienteId && scheduleAfterSave) {
          router.push(`/dashboard/citas/nuevo?clienteId=${result.clienteId}`);
        } else {
          router.push("/dashboard/clientes");
        }
      }
    } catch {
      toast.error("Ocurrió un error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (isFetching) {
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
              aria-label="Volver a pacientes"
              onClick={() => router.push("/dashboard/clientes")}
              className="hover:bg-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {fixClientId
                  ? "Completar datos del paciente"
                  : migrateClientId
                    ? "Importar paciente"
                    : "Nuevo paciente"}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                {fixClientId || migrateClientId
                  ? "Complete la información y verifique las direcciones recuperadas del historial"
                  : "Complete la información para registrar un nuevo paciente"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido del formulario */}
      <div className="flex-1 bg-white px-8 py-8 overflow-y-auto">
        {/* Nota Informativa */}
        <div className="max-w-5xl mx-auto mb-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 shadow-sm">
            <Info className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800 leading-relaxed">
              Los campos con <span className="text-red-500 font-bold">*</span> son obligatorios.
              Puedes guardar el paciente o guardar y continuar a su cita.
            </p>
          </div>
        </div>

        <form
          id="cliente-form"
          onSubmit={handleSubmit}
          className="max-w-5xl mx-auto space-y-8"
        >
          {/* Datos del paciente */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-blue-50 rounded-lg">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Datos del paciente
                </h2>
                <p className="text-sm text-slate-600">
                  Datos básicos del paciente
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="nombre"
                  className="text-sm font-medium text-slate-700"
                >
                  Nombre (opcional)
                </Label>
                <Input
                  id="nombre"
                  name="nombre"
                  defaultValue={initialData?.nombre}
                  placeholder="Ingrese el nombre"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="apellido"
                  className="text-sm font-medium text-slate-700"
                >
                  Apellido (opcional)
                </Label>
                <Input
                  id="apellido"
                  name="apellido"
                  defaultValue={initialData?.apellido}
                  placeholder="Ingrese el apellido"
                  className="h-11"
                />
              </div>
            </div>
          </div>

          {/* Identificación */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Identificación
                </h2>
                <p className="text-sm text-slate-600">
                  Documento de identidad del paciente
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className="md:col-span-3 space-y-2">
                <Label
                  htmlFor="tipoDocumento"
                  className="text-sm font-medium text-slate-700"
                >
                  Tipo de documento (opcional)
                </Label>
                <Select
                  name="tipoDocumento"
                  defaultValue={initialData?.tipoDocumento}
                >
                  <SelectTrigger id="tipoDocumento" className="h-11 w-full">
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
                  Número de documento (opcional)
                </Label>
                <Input
                  id="numeroDocumento"
                  name="numeroDocumento"
                  defaultValue={initialData?.numeroDocumento}
                  placeholder="Ej. 1234567890"
                  className="h-11"
                />
              </div>
            </div>

            {tenantId === 4 && showClientDocumentUploads && (
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
                      onChange={(e) =>
                        setDocumentoFile(e.target.files?.[0] || null)
                      }
                    />
                    {documentoFile ? (
                      <div className="flex flex-col items-center justify-center gap-2 text-blue-600">
                        <FileText className="h-8 w-8" />
                        <span className="text-xs font-medium truncate max-w-[200px]">
                          {documentoFile.name}
                        </span>
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
                        <UploadCloud className="h-8 w-8 mb-2" />
                        <span className="text-sm font-medium">
                          Subir Documento
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1">
                          PDF/IMG
                        </span>
                      </div>
                    )}
                  </div>
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
                      onChange={(e) =>
                        setRegistroFile(e.target.files?.[0] || null)
                      }
                    />
                    {registroFile ? (
                      <div className="flex flex-col items-center justify-center gap-2 text-blue-600">
                        <FileText className="h-8 w-8" />
                        <span className="text-xs font-medium truncate max-w-[200px]">
                          {registroFile.name}
                        </span>
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
                        <UploadCloud className="h-8 w-8 mb-2" />
                        <span className="text-sm font-medium">
                          Subir Registro
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1">
                          PDF/IMG
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contacto */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-green-50 rounded-lg">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Contacto
                </h2>
                <p className="text-sm text-slate-600">
                  Medios de comunicación con el paciente
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
                {tenantId === 4 ? (
                  <InternationalPhoneInput name="telefono" defaultValue={initialData?.telefono} required />
                ) : (<div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="telefono"
                    name="telefono"
                    type="tel"
                    defaultValue={initialData?.telefono}
                    placeholder="Ej. 3001234567"
                    required
                    className="h-11 pl-10"
                    onInput={(e) => {
                      e.currentTarget.value = e.currentTarget.value.replace(
                        /\D/g,
                        "",
                      );
                    }}
                    inputMode="numeric"
                  />
                </div>)}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="telefono2"
                  className="text-sm font-medium text-slate-700"
                >
                  Teléfono adicional{" "}
                  <span className="text-slate-400 font-normal">(Opcional)</span>
                </Label>
                {tenantId === 4 ? (
                  <InternationalPhoneInput name="telefono2" defaultValue={initialData?.telefono2} />
                ) : (<div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="telefono2"
                    name="telefono2"
                    type="tel"
                    defaultValue={initialData?.telefono2}
                    placeholder="Ej. 3007654321"
                    className="h-11 pl-10"
                    onInput={(e) => {
                      e.currentTarget.value = e.currentTarget.value.replace(
                        /\D/g,
                        "",
                      );
                    }}
                    inputMode="numeric"
                  />
                </div>)}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="correo"
                  className="text-sm font-medium text-slate-700"
                >
                  Correo electrónico (opcional)
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="correo"
                    name="correo"
                    type="email"
                    defaultValue={initialData?.correo}
                    placeholder="Ej. paciente@ejemplo.com"
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
                    Direcciones (opcional)
                  </h2>
                  <p className="text-sm text-slate-600">
                    Agrega una dirección solo si la necesitas para el contacto.
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

                const barriosOptions = Array.from(
                  new Set(barriosDisponibles),
                ).map((b) => ({
                  value: b,
                  label: b,
                }));

                return (
                  <div
                    key={dir.id}
                    className="p-5 bg-slate-50 rounded-lg border border-slate-200 relative"
                  >
                    {direcciones.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar dirección"
                        onClick={() => eliminarDireccion(dir.id)}
                        className="absolute top-3 right-3 text-slate-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}

                    <div className="grid grid-cols-1 gap-4 mb-4">
                      <div className="space-y-2">
                        <Label htmlFor={`direccion-${dir.id}-direccion`} className="text-sm font-medium text-slate-700">
                          Dirección{" "}
                          <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id={`direccion-${dir.id}-direccion`}
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
                        <Label htmlFor={`direccion-${dir.id}-linkMaps`} className="text-sm font-medium text-slate-700">
                          Enlace de Google Maps (opcional)
                        </Label>
                        <Input
                          id={`direccion-${dir.id}-linkMaps`}
                          value={dir.linkMaps}
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
                      {tenantId === 4 ? (
                        <ClientLocationFields municipality={dir.municipio} neighborhood={dir.barrio}
                          onChange={(field, value) => handleDireccionChange(dir.id, field, value)} />
                      ) : (<>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Municipio
                        </Label>
                        <Combobox
                          options={municipiosOptions}
                          value={dir.municipio}
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
                          value={dir.barrio}
                          onChange={(value) =>
                            handleDireccionChange(dir.id, "barrio", value)
                          }
                          placeholder="Seleccionar barrio"
                          emptyMessage="Barrio no encontrado"
                          disabled={!dir.municipio}
                        />
                      </div>
                      </>)}

                      <div className="space-y-2">
                        <Label htmlFor={`direccion-${dir.id}-piso`} className="text-sm font-medium text-slate-700">
                          Apartamento / Piso (opcional)
                        </Label>
                        <Input
                          id={`direccion-${dir.id}-piso`}
                          value={dir.piso}
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
                        <Label htmlFor={`direccion-${dir.id}-bloque`} className="text-sm font-medium text-slate-700">
                          Bloque / Torre (opcional)
                        </Label>
                        <Input
                          id={`direccion-${dir.id}-bloque`}
                          value={dir.bloque}
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
                        <Label htmlFor={`direccion-${dir.id}-unidad`} className="text-sm font-medium text-slate-700">
                          Unidad / Edificio (opcional)
                        </Label>
                        <Input
                          id={`direccion-${dir.id}-unidad`}
                          value={dir.unidad}
                          onChange={(e) =>
                            handleDireccionChange(
                              dir.id,
                              "unidad",
                              e.target.value,
                            )
                          }
                          placeholder="Ej. Zamora"
                          className="bg-white h-11"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-6 border-t-2 border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-red-500">*</span>
              <span>Campos obligatorios</span>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/clientes")}
                disabled={loading}
                className="min-w-[100px]"
              >
                Cancelar
              </Button>
              <Button type="submit" variant="outline" disabled={loading}>
                {loading ? "Guardando..." : "Guardar paciente"}
              </Button>
              <Button
                type="submit"
                data-next="cita"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 min-w-[160px]"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Guardar y agendar cita
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
