"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  User,
  Calendar,
  DollarSign,
  Info,
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
import { getFormDataCitas, getCita, updateCita, getConsultorios } from "../../actions";
import type {
  Usuario,
  Empresa,
  Servicio,
  Cliente
} from "@/prisma/generated/prisma/client";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TIMEZONE = "America/Bogota";

interface Cita {
  id: number;
  cliente: Cliente | null;
  servicio: Servicio | { nombre: string }; // Handle mapped service object
  empresa: Empresa | null;
  tecnico: Usuario | null;
  fechaVisita: string | Date | null;
  horaInicio: string | Date | null;
  horaFin: string | Date | null;
  valorCotizado: number | null;
  metodoPago: string | null;
  observacion: string | null;
  consultorioId: number | null;
}

export default function EditarCitaPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Form Data
  const [psicologos, setPsicologos] = useState<Usuario[]>([]);
  const [metodosPago, setMetodosPago] = useState<{id: number, nombre: string}[]>([]);
  const [terapias, setTerapias] = useState<{id: number, nombre: string}[]>([]);
  const [consultorios, setConsultorios] = useState<{id: number, nombre: string}[]>([]);

  // Cita State
  const [cita, setCita] = useState<Cita | null>(null);
  
  // Editable Fields
  const [selectedPsicologoId, setSelectedPsicologoId] = useState<string>("");
  const [selectedTerapiaId, setSelectedTerapiaId] = useState<string>("");
  const [selectedConsultorioId, setSelectedConsultorioId] = useState<string>("");
  const [fechaVisita, setFechaVisita] = useState<string>("");
  const [horaInicio, setHoraInicio] = useState<string>("");
  const [horaFin, setHoraFin] = useState<string>("");
  const [valorCita, setValorCita] = useState<string>("");
  const [selectedMetodoPago, setSelectedMetodoPago] = useState<string>("");
  const [observacion, setObservacion] = useState<string>("");

  // Auto-calculate Rental Price based on time fractions (State adjustment during render)
  const [prevCalcData, setPrevCalcData] = useState({ 
    isRental: false, 
    horaInicio: "", 
    horaFin: "" 
  });
  
  const currentIsRental = cita?.servicio?.nombre?.toLowerCase().includes("alquiler") || selectedTerapiaId === "49";

  if (
    prevCalcData.isRental !== currentIsRental || 
    prevCalcData.horaInicio !== horaInicio || 
    prevCalcData.horaFin !== horaFin
  ) {
    setPrevCalcData({ isRental: currentIsRental, horaInicio, horaFin });
    if (currentIsRental && horaInicio && horaFin) {
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

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/sign-in");
        return;
      }

      setLoadingData(true);

      // Load Form Data and Cita in parallel
      const [formDataRes, citaRes, consultoriosRes] = await Promise.all([
        getFormDataCitas(token),
        getCita(token, id),
        getConsultorios(token)
      ]);
      
      if (formDataRes.error) {
        toast.error(formDataRes.error);
      } else {
        setPsicologos((formDataRes.tecnicos as Usuario[]) || []);
        setMetodosPago((formDataRes.metodosPago as {id: number, nombre: string}[]) || []);
        setTerapias((formDataRes.terapias as {id: number, nombre: string}[]) || []);
        // Consultorios handled separately now to ensure it's fetched
      }

      if (consultoriosRes.error) {
        console.error(consultoriosRes.error);
      } else {
        setConsultorios((consultoriosRes.consultorios as {id: number, nombre: string}[]) || []);
      }

      if (citaRes.error) {
        toast.error(citaRes.error);
        router.push("/dashboard/citas");
        return;
      } else if (citaRes.orden) {
        const cRaw = citaRes.orden as unknown as Record<string, unknown>;
        
        const mappedCita: Cita = {
            id: Number(cRaw.id),
            cliente: cRaw.cliente as Cliente | null,
            servicio: cRaw.servicio as Servicio | { nombre: string },
            empresa: cRaw.empresa as Empresa | null,
            tecnico: cRaw.tecnico as Usuario | null,
            fechaVisita: cRaw.fechaVisita as string | null,
            horaInicio: cRaw.horaInicio as string | null,
            horaFin: cRaw.horaFin as string | null,
            valorCotizado: cRaw.valorCotizado as number | null,
            metodoPago: cRaw.metodoPago as string | null,
            observacion: cRaw.observacion as string | null,
            consultorioId: cRaw.consultorioId ? Number(cRaw.consultorioId) : null,
        };

        setCita(mappedCita);
        
        // Populate state
        if (mappedCita.tecnico) setSelectedPsicologoId(mappedCita.tecnico.id.toString());
        if (mappedCita.consultorioId) setSelectedConsultorioId(mappedCita.consultorioId.toString());
        
        if (mappedCita.fechaVisita) {
           const date = new Date(mappedCita.fechaVisita);
           if (!isNaN(date.getTime())) {
               const zonedDate = toZonedTime(date, TIMEZONE);
               setFechaVisita(format(zonedDate, "yyyy-MM-dd"));
           }
        }

        if (mappedCita.horaInicio) {
            const date = new Date(mappedCita.horaInicio);
            if (!isNaN(date.getTime())) {
                const zonedDate = toZonedTime(date, TIMEZONE);
                setHoraInicio(format(zonedDate, "HH:mm"));
            }
        }

        if (mappedCita.horaFin) {
            const date = new Date(mappedCita.horaFin);
            if (!isNaN(date.getTime())) {
                const zonedDate = toZonedTime(date, TIMEZONE);
                setHoraFin(format(zonedDate, "HH:mm"));
            }
        }

        setValorCita(mappedCita.valorCotizado ? mappedCita.valorCotizado.toString() : "");
        setSelectedMetodoPago(mappedCita.metodoPago || "");
        setObservacion(mappedCita.observacion || "");
      }
      
      setLoadingData(false);
    };

    fetchData();
  }, [id, router]);


  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    
    const formData = new FormData();
    const token = localStorage.getItem("token");

    if (!token) {
      toast.error("No se encontró sesión activa");
      setSaving(false);
      return;
    }

    if (selectedPsicologoId) formData.set("tecnico", selectedPsicologoId);
    if (selectedTerapiaId) formData.set("terapiaId", selectedTerapiaId);
    if (selectedConsultorioId) formData.set("consultorioId", selectedConsultorioId);
    formData.set("fechaVisita", fechaVisita);
    formData.set("horaInicio", horaInicio);
    formData.set("horaFin", horaFin);
    formData.set("valorCotizado", valorCita);
    if (selectedMetodoPago) formData.set("metodoPago", selectedMetodoPago);
    formData.set("observacion", observacion);

    const result = await updateCita(token, id, formData);

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

  if (!cita) return null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
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
                Editar Cita #{cita.id}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Modifique los detalles de la programación
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
          
          {/* Read-Only Information */}
          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 space-y-4">
             <div className="flex items-center gap-2 mb-2">
                 <Info className="h-5 w-5 text-blue-600" />
                 <h3 className="font-semibold text-slate-900">Información del Servicio</h3>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                 <div>
                     <span className="text-slate-500 block">Paciente</span>
                     <span className="font-medium text-slate-900">{cita.cliente?.nombre || 'N/A'} {cita.cliente?.apellido || ''}</span>
                 </div>
                 <div>
                     <span className="text-slate-500 block">Documento</span>
                     <span className="font-medium text-slate-900">{cita.cliente?.numeroDocumento || 'N/A'}</span>
                 </div>
                 <div>
                     <span className="text-slate-500 block">Servicio / Terapia</span>
                     <span className="font-medium text-slate-900">{cita.servicio?.nombre || 'N/A'}</span>
                 </div>
                 <div>
                     <span className="text-slate-500 block">Empresa</span>
                     <span className="font-medium text-slate-900">{cita.empresa?.nombre || 'N/A'}</span>
                 </div>
             </div>
          </div>

          {/* Sección: Detalles Programación */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
              <div className="p-2 bg-blue-50 rounded-lg">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Asignación y Notas
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="tecnico"
                  className="text-sm font-medium text-slate-700"
                >
                  Psicólogo Asignado
                </Label>
                <Select value={selectedPsicologoId} onValueChange={setSelectedPsicologoId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Seleccione un psicólogo" />
                  </SelectTrigger>
                  <SelectContent>
                    {psicologos.map((psic) => (
                      <SelectItem key={psic.id} value={psic.id.toString()}>
                        {psic.nombre} {psic.apellido}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="consultorio"
                  className="text-sm font-medium text-slate-700"
                >
                  Consultorio
                </Label>
                <Select value={selectedConsultorioId} onValueChange={setSelectedConsultorioId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Seleccione un consultorio" />
                  </SelectTrigger>
                  <SelectContent>
                    {consultorios.map((cons) => (
                      <SelectItem key={cons.id} value={cons.id.toString()}>
                        {cons.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {consultorios.length === 0 && (
                   <p className="text-xs text-amber-600 mt-1">No hay consultorios registrados.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="terapia"
                  className="text-sm font-medium text-slate-700"
                >
                  Cambiar Paquete (Opcional)
                </Label>
                <Select value={selectedTerapiaId} onValueChange={setSelectedTerapiaId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Seleccione para cambiar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {terapias.map((terapia) => (
                      <SelectItem key={terapia.id} value={terapia.id.toString()}>
                        {terapia.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="md:col-span-3 space-y-2">
                <Label
                  htmlFor="observacion"
                  className="text-sm font-medium text-slate-700"
                >
                  Observaciones
                </Label>
                <Textarea
                  id="observacion"
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder="Notas adicionales sobre la cita"
                  rows={3}
                  className="min-h-[80px]"
                />
              </div>
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
                  type="date"
                  className="h-11"
                  required
                  value={fechaVisita}
                  onChange={(e) => setFechaVisita(e.target.value)}
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
                <Select value={selectedMetodoPago} onValueChange={setSelectedMetodoPago}>
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
                    Actualizando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Guardar Cambios
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