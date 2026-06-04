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
    <div className="min-h-screen flex w-full bg-white dark:bg-stone-950 font-sans">
      {/* === SECCIÓN IZQUIERDA (Formulario) === */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 py-12 sm:px-12 lg:px-16 xl:px-24 z-10 bg-white dark:bg-stone-950">
        <div className="w-full max-w-md space-y-8">
          {/* Header & Logo */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-xl text-stone-900 dark:text-white">
              <div className="p-1.5 bg-[#6440fa] rounded-lg text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              Axis
            </div>
            <h1 className="text-3xl font-bold tracking-tight mt-6 text-stone-900 dark:text-white">
              Bienvenido
            </h1>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Input Username */}
            <div className="space-y-2">
              <Label
                htmlFor="username"
                className="text-stone-700 dark:text-stone-300 font-medium"
              >
                Nombre de usuario<span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 h-5 w-5 text-stone-400" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Tu usuario"
                  className={`pl-11 h-12 rounded-xl border-stone-200 bg-stone-50 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] transition-all dark:bg-stone-900 dark:border-stone-800 dark:focus:bg-stone-900 dark:text-white ${errors.username ? "border-red-500 bg-red-50/50 dark:bg-red-950/10" : ""}`}
                  value={formData.username}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
              </div>
              {errors.username && (
                <p className="text-sm text-red-500 mt-1">{errors.username}</p>
              )}
            </div>

            {/* Input Password */}
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-stone-700 dark:text-stone-300 font-medium"
              >
                Contraseña<span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-5 w-5 text-stone-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className={`pl-11 pr-11 h-12 rounded-xl border-stone-200 bg-stone-50 focus:bg-white focus:ring-2 focus:ring-[#6440fa]/20 focus:border-[#6440fa] transition-all dark:bg-stone-900 dark:border-stone-800 dark:focus:bg-stone-900 dark:text-white ${errors.password ? "border-red-500 bg-red-50/50 dark:bg-red-950/10" : ""}`}
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-red-500 mt-1">{errors.password}</p>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={formData.rememberMe}
                  onCheckedChange={(checked) =>
                    setFormData((p) => ({ ...p, rememberMe: !!checked }))
                  }
                  disabled={isLoading}
                  className="data-[state=checked]:bg-[#6440fa] data-[state=checked]:border-[#6440fa] border-stone-300 rounded"
                />
                <Label
                  htmlFor="rememberMe"
                  className="text-sm text-stone-600 dark:text-stone-400 cursor-pointer select-none"
                >
                  Recordarme
                </Label>
              </div>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-[#6440fa] hover:text-[#5030c9] transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold bg-[#6440fa] hover:bg-[#5030c9] text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-[0.99] transition-all"
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
          <p className="text-center text-sm text-stone-600 dark:text-stone-400">
            ¿Nuevo en nuestra plataforma?{" "}
            <Link
              href="/sign-up"
              className="font-semibold text-[#6440fa] hover:underline transition-colors"
            >
              Crea una cuenta
            </Link>
          </p>
        </div>
      </div>

      {/* === SECCIÓN DERECHA (Banner Púrpura) === */}
      <div className="hidden lg:flex w-1/2 bg-[#6440fa] relative items-center justify-center p-12 overflow-hidden">
        {/* Elemento decorativo de fondo (triángulo sutil) */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-lg text-white space-y-8 mb-20">
          <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight">
            ¡Bienvenido de nuevo!
            <br />
            Accede a tu cuenta.
          </h2>
          <p className="text-lg text-indigo-100/90 max-w-md leading-relaxed">
            Gracias por regresar. Por favor revisa tu bandeja de entrada si
            necesitas verificar tu cuenta para activarla.
          </p>
        </div>

        {/* Tarjeta Flotante Inferior */}
        <div className="absolute bottom-8 right-8 left-8 md:left-auto md:w-[450px] bg-white dark:bg-stone-900 p-6 rounded-2xl shadow-2xl shadow-black/20 flex items-center justify-between backdrop-blur-sm bg-white/95 dark:bg-stone-900/95 border border-white/20">
          <div className="space-y-2">
            <h3 className="font-bold text-lg text-stone-900 dark:text-white flex items-center gap-2">
              Ingresa tus credenciales
              <ArrowUpRight className="h-4 w-4 text-stone-400" />
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Mantente conectado para las últimas actualizaciones.
            </p>
          </div>
          {/* Stack de Avatares (Placeholder) */}
          <div className="flex -space-x-3 rtl:space-x-reverse relative shrink-0">
            <Image
              className="w-10 h-10 border-2 border-white dark:border-stone-900 rounded-full object-cover"
              src="https://i.pravatar.cc/100?img=1"
              alt="Avatar 1"
              width={40}
              height={40}
            />
            <Image
              className="w-10 h-10 border-2 border-white dark:border-stone-900 rounded-full object-cover"
              src="https://i.pravatar.cc/100?img=2"
              alt="Avatar 2"
              width={40}
              height={40}
            />
            <Image
              className="w-10 h-10 border-2 border-white dark:border-stone-900 rounded-full object-cover"
              src="https://i.pravatar.cc/100?img=3"
              alt="Avatar 3"
              width={40}
              height={40}
            />
            <div className="flex items-center justify-center w-10 h-10 border-2 border-white dark:border-stone-900 rounded-full bg-stone-800 text-xs font-medium text-white">
              +3k
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
