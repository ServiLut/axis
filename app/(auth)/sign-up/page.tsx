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
    <div className="min-h-screen flex w-full bg-white dark:bg-stone-950 font-sans">
      {/* === SECCIÓN IZQUIERDA (Formulario) === */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-8 py-12 sm:px-12 lg:px-16 xl:px-24 z-10 bg-white dark:bg-stone-950 overflow-y-auto">
        <div className="w-full max-w-md space-y-6">
          {/* Header Branding */}
          <div className="space-y-2 mb-8">
            <div className="flex items-center gap-2 font-bold text-xl text-stone-900 dark:text-white mb-6">
              <div className="p-1.5 bg-[#6440fa] rounded-lg text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              Axis
            </div>

            {/* Barra de Progreso */}
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
                {step === 1 ? "Crea tu cuenta" : "Datos personales"}
              </h1>
              <span className="text-xs font-medium text-[#6440fa] bg-[#6440fa]/10 px-2 py-1 rounded-full">
                Paso {step} de 2
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="h-1.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6440fa] transition-all duration-500 ease-in-out"
                style={{ width: step === 1 ? "50%" : "100%" }}
              />
            </div>
            <p className="text-stone-500 dark:text-stone-400 text-sm">
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
                  <Label htmlFor="username">Usuario</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 h-5 w-5 text-stone-400" />
                    <Input
                      id="username"
                      placeholder="juanperez"
                      className={`pl-11 h-12 rounded-xl bg-stone-50 border-stone-200 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] transition-all dark:bg-stone-900 dark:border-stone-800 ${errors.username ? "border-red-500 bg-red-50/50" : ""}`}
                      value={formData.username}
                      onChange={handleInputChange}
                    />
                  </div>
                  {errors.username && (
                    <p className="text-xs text-red-500 ml-1">
                      {errors.username}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-stone-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="juan@ejemplo.com"
                      className={`pl-11 h-12 rounded-xl bg-stone-50 border-stone-200 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] transition-all dark:bg-stone-900 dark:border-stone-800 ${errors.email ? "border-red-500 bg-red-50/50" : ""}`}
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-500 ml-1">{errors.email}</p>
                  )}
                </div>

                {/* Passwords Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 h-5 w-5 text-stone-400" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        className={`pl-11 h-12 rounded-xl bg-stone-50 border-stone-200 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] dark:bg-stone-900 dark:border-stone-800 ${errors.password ? "border-red-500 bg-red-50/50" : ""}`}
                        value={formData.password}
                        onChange={handleInputChange}
                      />
                    </div>
                    {errors.password && (
                      <p className="text-xs text-red-500 ml-1">
                        {errors.password}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 h-5 w-5 text-stone-400" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        className={`pl-11 h-12 rounded-xl bg-stone-50 border-stone-200 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] dark:bg-stone-900 dark:border-stone-800 ${errors.confirmPassword ? "border-red-500 bg-red-50/50" : ""}`}
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                      />
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-xs text-red-500 ml-1">
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  onClick={nextStep}
                  className="w-full h-12 text-base font-semibold bg-[#6440fa] hover:bg-[#5030c9] text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-[0.99] transition-all"
                >
                  Continuar
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <p className="text-center text-sm text-stone-500 mt-6">
                  ¿Ya tienes cuenta?{" "}
                  <Link
                    href="/sign-in"
                    className="font-semibold text-[#6440fa] hover:underline"
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
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    placeholder="Juan"
                    className={`h-12 rounded-xl bg-stone-50 border-stone-200 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] dark:bg-stone-900 dark:border-stone-800 ${errors.nombre ? "border-red-500" : ""}`}
                    value={formData.nombre}
                    onChange={handleInputChange}
                  />
                  {errors.nombre && (
                    <p className="text-xs text-red-500 ml-1">{errors.nombre}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input
                    id="apellido"
                    placeholder="Pérez"
                    className={`h-12 rounded-xl bg-stone-50 border-stone-200 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] dark:bg-stone-900 dark:border-stone-800 ${errors.apellido ? "border-red-500" : ""}`}
                    value={formData.apellido}
                    onChange={handleInputChange}
                  />
                  {errors.apellido && (
                    <p className="text-xs text-red-500 ml-1">
                      {errors.apellido}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipoDocumento">Tipo de Documento</Label>
                <Select
                  onValueChange={handleSelectChange}
                  value={formData.tipoDocumento}
                >
                  <SelectTrigger
                    className={`w-full h-12 rounded-xl bg-stone-50 border-stone-200 focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] dark:bg-stone-900 dark:border-stone-800 ${errors.tipoDocumento ? "border-red-500" : ""}`}
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
                  <p className="text-xs text-red-500 ml-1">
                    {errors.tipoDocumento}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="numeroDocumento">Número de Documento</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3.5 top-3.5 h-5 w-5 text-stone-400" />
                  <Input
                    id="numeroDocumento"
                    placeholder="1234567890"
                    className={`pl-11 h-12 rounded-xl bg-stone-50 border-stone-200 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] dark:bg-stone-900 dark:border-stone-800 ${errors.numeroDocumento ? "border-red-500" : ""}`}
                    value={formData.numeroDocumento}
                    onChange={handleInputChange}
                  />
                </div>
                {errors.numeroDocumento && (
                  <p className="text-xs text-red-500 ml-1">
                    {errors.numeroDocumento}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono / Celular</Label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 h-5 w-5 text-stone-400" />
                  <Input
                    id="telefono"
                    placeholder="+57 300 123 4567"
                    className={`pl-11 h-12 rounded-xl bg-stone-50 border-stone-200 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] dark:bg-stone-900 dark:border-stone-800 ${errors.telefono ? "border-red-500" : ""}`}
                    value={formData.telefono}
                    onChange={handleInputChange}
                  />
                </div>
                {errors.telefono && (
                  <p className="text-xs text-red-500 ml-1">{errors.telefono}</p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={isLoading}
                  className="h-12 w-1/3 rounded-xl border-stone-200 hover:bg-stone-50 text-stone-600"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Atrás
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="h-12 w-2/3 rounded-xl bg-[#6440fa] hover:bg-[#5030c9] text-white shadow-lg shadow-indigo-500/20"
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

      {/* === SECCIÓN DERECHA (Banner Púrpura) === */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#6440fa] relative items-center justify-center p-12 overflow-hidden">
        {/* Decoración de fondo */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-black/10 rounded-full blur-3xl pointer-events-none translate-y-1/3 -translate-x-1/4" />

        <div className="relative z-10 w-full max-w-lg text-white space-y-8 mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-sm font-medium backdrop-blur-md border border-white/10 text-indigo-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-200 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            Únete a más de 10,000 usuarios
          </div>
          <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight">
            Comienza tu viaje <br /> con nosotros hoy.
          </h2>
          <p className="text-lg text-indigo-100/90 max-w-md leading-relaxed">
            Crea una cuenta en segundos y accede a herramientas exclusivas
            diseñadas para potenciar tu productividad y gestión.
          </p>

          {/* Feature List Sutil */}
          <ul className="space-y-4 pt-4">
            {[
              "Acceso ilimitado al panel de control",
              "Soporte prioritario 24/7",
              "Seguridad de datos nivel empresarial",
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-indigo-100">
                <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                </div>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Floating Card Decorative */}
        <div className="absolute bottom-12 right-12 bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center gap-4 max-w-xs transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500">
          <div className="h-10 w-10 bg-green-400 rounded-full flex items-center justify-center shadow-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Registro Seguro</p>
            <p className="text-indigo-100 text-xs">
              Tus datos están protegidos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
