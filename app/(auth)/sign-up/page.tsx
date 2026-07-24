"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
  User,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  CreditCard,
  Eye,
  EyeOff,
} from "lucide-react";

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    nombre: "",
    apellido: "",
    tipoDocumento: "",
    numeroDocumento: "",
    telefono: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, tipoDocumento: value }));
    if (errors.tipoDocumento)
      setErrors((prev) => ({ ...prev, tipoDocumento: "" }));
  };

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.username) newErrors.username = "Requerido";
    if (!formData.email) newErrors.email = "Requerido";
    else if (!/\S+@\S+\.\S+/.test(formData.email))
      newErrors.email = "Correo inválido";

    if (!formData.password) newErrors.password = "Requerido";
    else if (formData.password.length < 6)
      newErrors.password = "Mínimo 6 caracteres";

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "No coinciden";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.nombre) newErrors.nombre = "Requerido";
    if (!formData.apellido) newErrors.apellido = "Requerido";
    if (!formData.tipoDocumento) newErrors.tipoDocumento = "Requerido";
    if (!formData.numeroDocumento) newErrors.numeroDocumento = "Requerido";
    if (formData.telefono && formData.telefono.length < 7)
      newErrors.telefono = "Inválido";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep1()) setStep(step + 1);
  };

  const prevStep = () => setStep(step - 1);

  const handleSubmit = async () => {
    if (!validateStep2()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al registrarse");
      }

      localStorage.setItem("user", JSON.stringify(data.user));

      toast.success("Cuenta creada exitosamente");
      router.push("/verificacion");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error al registrarse";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-white font-sans overflow-hidden relative">
      <Link 
        href="/"
        className="absolute top-8 left-8 z-50 group flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] font-bold text-slate-700 transition-all duration-300"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-300 shadow-md group-hover:bg-gradient-to-br group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white group-hover:border-transparent group-hover:shadow-indigo-500/30 group-hover:-translate-x-1 transition-all duration-300">
          <ArrowLeft className="w-4 h-4 text-slate-700 group-hover:text-white transition-transform duration-300" />
        </div>
        <span className="mt-[2px] bg-clip-text text-slate-700 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-indigo-600 group-hover:to-violet-600 transition-all duration-300">Volver</span>
      </Link>

      {/* Contenedor principal sin flex-row-reverse, por lo que el formulario se mantiene a la izquierda de forma nativa */}
      {/* === SECCIÓN IZQUIERDA (Formulario) === */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-8 py-12 sm:px-12 lg:px-16 xl:px-24 z-10 bg-white overflow-y-auto">
        {/* Contenido del formulario: Se anima deslizándose desde la derecha (slide-in-from-right-8) para lograr un efecto de cruce con la página de Iniciar Sesión */}
        <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-right-8 duration-1000 ease-out">
          {/* Header Branding */}
          <div className="space-y-4 mb-8">
            <Link href="/" className="flex items-center gap-3 font-bold text-2xl text-slate-900 tracking-tight mb-6 hover:opacity-80 transition-opacity w-fit">
              <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl text-white shadow-lg shadow-indigo-500/30 ring-1 ring-black/10">
                <ShieldCheck className="h-6 w-6" />
              </div>
              Axis
            </Link>

            {/* Barra de Progreso */}
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                {step === 1 ? "Crea tu cuenta" : "Datos personales"}
              </h1>
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 uppercase tracking-wider">
                Paso {step} de 2
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-indigo-600 to-violet-600 transition-all duration-500 ease-in-out"
                style={{ width: step === 1 ? "50%" : "100%" }}
              />
            </div>
            <p className="text-slate-500 text-[15px] pt-1">
              {step === 1
                ? "Ingresa tus credenciales para comenzar."
                : "Casi terminamos, necesitamos algunos detalles más."}
            </p>
          </div>

          {/* === PASO 1: CUENTA === */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="space-y-4">
                {/* Username & Email */}
                <div className="space-y-2">
                  <Label
                    htmlFor="username"
                    className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
                  >
                    Usuario<span className="text-red-500 ml-1">*</span>
                  </Label>
                  <div className="relative group">
                    <User className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                    <Input
                      id="username"
                      placeholder="juanperez"
                      className={`pl-12 h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all text-[15px] font-medium text-slate-900 ${errors.username ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                      value={formData.username}
                      onChange={handleInputChange}
                    />
                  </div>
                  {errors.username && (
                    <p className="text-sm text-red-500 mt-1 font-medium">
                      {errors.username}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
                  >
                    Correo Electrónico
                    <span className="text-red-500 ml-1">*</span>
                  </Label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="juan@ejemplo.com"
                      className={`pl-12 h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all text-[15px] font-medium text-slate-900 ${errors.email ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-red-500 mt-1 font-medium">
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Passwords Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
                    >
                      Contraseña<span className="text-red-500 ml-1">*</span>
                    </Label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className={`pl-12 pr-12 h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all tracking-widest text-[15px] font-medium text-slate-900 ${errors.password ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                        value={formData.password}
                        onChange={handleInputChange}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-3.5 text-slate-400 hover:text-indigo-600 focus:outline-none transition-colors"
                      >
                        {showPassword ? ( 
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-sm text-red-500 mt-1 font-medium">
                        {errors.password}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="confirmPassword"
                      className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
                    >
                      Confirmar<span className="text-red-500 ml-1">*</span>
                    </Label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className={`pl-12 pr-12 h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all tracking-widest text-[15px] font-medium text-slate-900 ${errors.confirmPassword ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-3.5 text-slate-400 hover:text-indigo-600 focus:outline-none transition-colors"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-sm text-red-500 mt-1 font-medium">
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  onClick={nextStep}
                  className="w-full h-12 text-[15px] font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl shadow-[0_8px_20px_rgba(79,70,229,0.25)] hover:shadow-[0_10px_25px_rgba(79,70,229,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 border border-indigo-500/50"
                >
                  Continuar
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <p className="text-center text-[15px] text-slate-500 mt-6 font-medium">
                  ¿Ya tienes cuenta?<br />
                  <Link
                    href="/sign-in"
                    className="font-bold text-indigo-600 hover:text-indigo-700 transition-colors inline-block mt-1"
                  >
                    Inicia Sesión
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* === PASO 2: DATOS PERSONALES === */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="nombre"
                    className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
                  >
                    Nombre<span className="text-red-500 ml-1">*</span>
                  </Label>
                  <Input
                    id="nombre"
                    placeholder="Juan"
                    className={`h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all text-[15px] font-medium text-slate-900 ${errors.nombre ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                    value={formData.nombre}
                    onChange={handleInputChange}
                  />
                  {errors.nombre && (
                    <p className="text-sm text-red-500 mt-1 font-medium">
                      {errors.nombre}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="apellido"
                    className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
                  >
                    Apellido<span className="text-red-500 ml-1">*</span>
                  </Label>
                  <Input
                    id="apellido"
                    placeholder="Pérez"
                    className={`h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all text-[15px] font-medium text-slate-900 ${errors.apellido ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                    value={formData.apellido}
                    onChange={handleInputChange}
                  />
                  {errors.apellido && (
                    <p className="text-sm text-red-500 mt-1 font-medium">
                      {errors.apellido}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="tipoDocumento"
                  className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
                >
                  Tipo de Documento<span className="text-red-500 ml-1">*</span>
                </Label>
                <Select
                  onValueChange={handleSelectChange}
                  value={formData.tipoDocumento}
                >
                  <SelectTrigger
                    className={`w-full h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all text-[15px] font-medium text-slate-900 ${errors.tipoDocumento ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                  >
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                    <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                    <SelectItem value="NIT">NIT</SelectItem>
                    <SelectItem value="PAS">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
                {errors.tipoDocumento && (
                  <p className="text-sm text-red-500 mt-1 font-medium">
                    {errors.tipoDocumento}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="numeroDocumento"
                  className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
                >
                  Número de Documento
                  <span className="text-red-500 ml-1">*</span>
                </Label>
                <div className="relative group">
                  <CreditCard className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <Input
                    id="numeroDocumento"
                    placeholder="1234567890"
                    className={`pl-12 h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all text-[15px] font-medium text-slate-900 ${errors.numeroDocumento ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                    value={formData.numeroDocumento}
                    onChange={handleInputChange}
                  />
                </div>
                {errors.numeroDocumento && (
                  <p className="text-sm text-red-500 mt-1 font-medium">
                    {errors.numeroDocumento}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="telefono"
                  className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
                >
                  Teléfono / Celular<span className="text-red-500 ml-1">*</span>
                </Label>
                <div className="relative group">
                  <Phone className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <Input
                    id="telefono"
                    placeholder="+57 300 123 4567"
                    className={`pl-12 h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all text-[15px] font-medium text-slate-900 ${errors.telefono ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                    value={formData.telefono}
                    onChange={handleInputChange}
                  />
                </div>
                {errors.telefono && (
                  <p className="text-sm text-red-500 mt-1 font-medium">
                    {errors.telefono}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={isLoading}
                  className="h-12 w-1/3 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold shadow-sm hover:shadow transition-all"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Atrás
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="h-12 w-2/3 text-[15px] font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl shadow-[0_8px_20px_rgba(79,70,229,0.25)] hover:shadow-[0_10px_25px_rgba(79,70,229,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 border border-indigo-500/50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />{" "}
                      Registrando...
                    </>
                  ) : (
                    <>
                      Finalizar Registro{" "}
                      <CheckCircle2 className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === SECCIÓN DERECHA (Banner Oscuro/Glassmorphism) === */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0f0a1f] relative items-center justify-center p-12 overflow-hidden">
        {/* Elementos decorativos de fondo */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.1)_0%,transparent_50%)]"></div>
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[128px] mix-blend-screen pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[128px] mix-blend-screen pointer-events-none translate-y-1/3 -translate-x-1/4"></div>
        </div>

        {/* Patrón de puntos sutil */}
        <div
          className="absolute inset-0 z-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(#fff 1.5px, transparent 1.5px)",
            backgroundSize: "32px 32px",
          }}
        ></div>

        {/* Contenido del Banner: Se anima deslizándose desde la izquierda, cruzándose visualmente con el formulario */}
        <div className="relative z-10 w-full max-w-lg text-white space-y-8 mb-20 animate-in fade-in slide-in-from-left-8 duration-1000 ease-out">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 text-sm font-medium backdrop-blur-md border border-white/10 text-indigo-200 shadow-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-300"></span>
            </span>
            Únete a más de 10,000 usuarios
          </div>
          <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight text-white drop-shadow-lg">
            Comienza tu viaje <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">
              con nosotros hoy.
            </span>
          </h2>
          <p className="text-lg text-indigo-100/80 max-w-md leading-relaxed font-light">
            Crea una cuenta en segundos y accede a herramientas exclusivas
            diseñadas para potenciar tu productividad y gestión.
          </p>

          {/* Feature List Premium */}
          <ul className="space-y-5 pt-6">
            {[
              "Acceso ilimitado al panel de control",
              "Soporte prioritario 24/7",
              "Seguridad de datos nivel empresarial",
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-4 group transition-all duration-300 hover:translate-x-2 cursor-default"
              >
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.4)] group-hover:shadow-[0_0_25px_rgba(168,85,247,0.6)] group-hover:scale-110 transition-all duration-300 shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </div>
                <span className="text-[15px] font-medium text-indigo-50/90 group-hover:text-white transition-colors duration-300">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Floating Card Decorative (Glassmorphism Premium) */}
        <div className="absolute bottom-12 right-12 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 p-5 rounded-2xl flex items-center gap-4 max-w-xs transform rotate-[-2deg] hover:rotate-0 hover:scale-[1.02] transition-all duration-500 shadow-[0_0_50px_rgba(99,102,241,0.15)] z-10 group overflow-hidden">
          {/* Brillo interno suave */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

          <div className="h-12 w-12 bg-indigo-500/20 border border-indigo-500/30 rounded-full flex items-center justify-center shadow-inner shrink-0 relative z-10">
            <ShieldCheck className="h-6 w-6 text-indigo-300" />
          </div>
          <div className="relative z-10">
            <p className="text-white font-bold text-[15px] drop-shadow-sm leading-tight">
              Registro Seguro
            </p>
            <p className="text-indigo-200/80 text-xs mt-0.5 font-light">
              Tus datos están 100% protegidos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
