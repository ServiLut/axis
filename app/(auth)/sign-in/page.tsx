"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Lock,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  User,
  ArrowUpRight,
} from "lucide-react";

export default function SignInPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    rememberMe: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.username.trim()) {
      newErrors.username = "El usuario es requerido";
    }

    if (!formData.password) newErrors.password = "La contraseña es requerida";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al iniciar sesión");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      toast.success("¡Bienvenido de nuevo!");

      // Redirigir basado en el estado de aprobación
      if (data.user.aprobado) {
        router.push("/dashboard");
      } else {
        router.push("/verificacion");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Credenciales incorrectas";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex lg:flex-row-reverse w-full bg-white font-sans overflow-hidden">
      {/* Contenedor principal: lg:flex-row-reverse invierte el orden para colocar el formulario a la derecha y el banner a la izquierda en pantallas grandes */}
      
      {/* === SECCIÓN IZQUIERDA (Formulario - renderizado visualmente a la derecha) === */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 py-12 sm:px-12 lg:px-16 xl:px-24 z-10 bg-white">
        {/* Contenido del formulario: Se anima deslizándose desde la izquierda de manera sutil (slide-in-from-left-8) para crear un efecto cruzado sin revelar el fondo */}
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-left-8 duration-1000 ease-out">
          {/* Header & Logo */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 font-bold text-2xl text-slate-900 tracking-tight">
              <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl text-white shadow-lg shadow-indigo-500/30 ring-1 ring-black/10">
                <ShieldCheck className="h-6 w-6" />
              </div>
              Axis
            </div>
            <div className="pt-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                Bienvenido de nuevo
              </h1>
              <p className="text-slate-500 mt-2 text-[15px]">
                Ingresa tus credenciales para acceder a tu cuenta.
              </p>
            </div>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-6 pt-4">
            {/* Input Username */}
            <div className="space-y-2">
              <Label
                htmlFor="username"
                className="text-[13px] uppercase tracking-wider text-slate-500 font-bold"
              >
                Nombre de usuario<span className="text-red-500 ml-1">*</span>
              </Label>
              <div className="relative group">
                <User className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Tu usuario"
                  className={`pl-12 h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all text-[15px] font-medium text-slate-900 ${errors.username ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                  value={formData.username}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
              </div>
              {errors.username && (
                <p className="text-sm text-red-500 mt-1 font-medium">
                  {errors.username}
                </p>
              )}
            </div>

            {/* Input Password */}
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
                  className={`pl-12 pr-12 h-12 rounded-xl bg-white border-slate-200 shadow-sm hover:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all text-[15px] tracking-widest font-medium text-slate-900 ${errors.password ? "border-red-500 focus:ring-red-500/15 focus:border-red-500" : ""}`}
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={isLoading}
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

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2.5">
                <Checkbox
                  id="rememberMe"
                  checked={formData.rememberMe}
                  onCheckedChange={(checked) =>
                    setFormData((p) => ({ ...p, rememberMe: !!checked }))
                  }
                  disabled={isLoading}
                  className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 border-slate-300 rounded shadow-sm"
                />
                <Label
                  htmlFor="rememberMe"
                  className="text-[14px] text-slate-600 cursor-pointer select-none font-semibold hover:text-slate-900 transition-colors"
                >
                  Recordarme
                </Label>
              </div>
              <Link
                href="/forgot-password"
                className="text-[14px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 mt-4 text-[15px] font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl shadow-[0_8px_20px_rgba(79,70,229,0.25)] hover:shadow-[0_10px_25px_rgba(79,70,229,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 border border-indigo-500/50"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                "Iniciar Sesión"
              )}
            </Button>
          </form>

          {/* Sign Up Link */}
          <p className="text-center text-[15px] text-slate-500 mt-8 font-medium">
            ¿Nuevo en nuestra plataforma?<br />
            <Link
              href="/sign-up"
              className="font-bold text-indigo-600 hover:text-indigo-700 transition-colors inline-block mt-1"
            >
              Crea una cuenta
            </Link>
          </p>
        </div>
      </div>

      {/* === SECCIÓN DERECHA (Banner Oscuro/Glassmorphism) === */}
      <div className="hidden lg:flex w-1/2 bg-[#0f0a1f] relative items-center justify-center p-12 overflow-hidden">
        {/* Elementos decorativos de fondo */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.1)_0%,transparent_50%)]"></div>
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[128px] mix-blend-screen pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[128px] mix-blend-screen pointer-events-none"></div>
        </div>

        {/* Patrón de puntos sutil */}
        <div
          className="absolute inset-0 z-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(#fff 1.5px, transparent 1.5px)",
            backgroundSize: "32px 32px",
          }}
        ></div>

        {/* Contenido del Banner: Se anima deslizándose desde la derecha para completar la transición cruzada */}
        <div className="relative z-10 w-full max-w-lg text-white space-y-8 mb-20 animate-in fade-in slide-in-from-right-8 duration-1000 ease-out">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 text-sm font-medium backdrop-blur-md border border-white/10 text-indigo-200 shadow-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-300"></span>
            </span>
            Plataforma Profesional de Gestión
          </div>
          <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight text-white drop-shadow-lg">
            ¡Bienvenido de nuevo!
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">
              Accede a tu cuenta.
            </span>
          </h2>
          <p className="text-lg text-indigo-100/80 max-w-md leading-relaxed font-light">
            Gracias por regresar. Por favor revisa tu bandeja de entrada si
            necesitas verificar tu cuenta para activarla.
          </p>
        </div>

        {/* Tarjeta Flotante Inferior (Glassmorphism Premium) */}
        <div className="absolute bottom-12 right-12 md:left-auto md:w-[450px] bg-gradient-to-br from-white/10 to-white/5 p-6 rounded-2xl shadow-[0_0_50px_rgba(99,102,241,0.15)] flex items-center justify-between backdrop-blur-xl border border-white/20 z-10 overflow-hidden group hover:scale-[1.02] transition-transform duration-500 animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out">
          {/* Brillo interno suave */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

          <div className="space-y-2 relative z-10">
            <h3 className="font-bold text-lg text-white flex items-center gap-2 drop-shadow-sm">
              Ingresa tus credenciales
              <ArrowUpRight className="h-4 w-4 text-indigo-300" />
            </h3>
            <p className="text-sm text-indigo-200/80 font-light">
              Mantente conectado para las últimas actualizaciones.
            </p>
          </div>
          {/* Stack de Avatares */}
          <div className="flex -space-x-3 rtl:space-x-reverse relative shrink-0 z-10">
            <Image
              className="w-11 h-11 border-2 border-[#1a1432] rounded-full object-cover shadow-lg"
              src="https://i.pravatar.cc/100?img=1"
              alt="Avatar 1"
              width={44}
              height={44}
            />
            <Image
              className="w-11 h-11 border-2 border-[#1a1432] rounded-full object-cover shadow-lg"
              src="https://i.pravatar.cc/100?img=2"
              alt="Avatar 2"
              width={44}
              height={44}
            />
            <Image
              className="w-11 h-11 border-2 border-[#1a1432] rounded-full object-cover shadow-lg"
              src="https://i.pravatar.cc/100?img=3"
              alt="Avatar 3"
              width={44}
              height={44}
            />
            <div className="flex items-center justify-center w-11 h-11 border-2 border-[#1a1432] rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-xs font-bold text-white shadow-lg">
              +3k
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
