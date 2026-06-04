"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  XCircle,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function VerificacionPage() {
  const router = useRouter();
  const [status] = useState<"pending" | "rejected" | "loading">(
    () => {
      if (typeof window !== "undefined") {
        const userStr = localStorage.getItem("user");
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            return user.aprobado === null ? "rejected" : "pending";
          } catch {
            return "pending";
          }
        }
      }
      return "loading";
    }
  );

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.push("/sign-in");
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/sign-in");
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-stone-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6440fa]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full bg-white dark:bg-stone-950 font-sans">
      {/* === SECCIÓN IZQUIERDA (Contenido) === */}
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
          </div>

          <div className="flex flex-col items-center text-center space-y-6 pt-4">
            {status === "rejected" ? (
              <div className="space-y-4">
                <div className="mx-auto w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-6">
                  <XCircle className="h-12 w-12 text-red-500" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-white">
                  Solicitud Rechazada
                </h1>
                <p className="text-stone-500 dark:text-stone-400 text-lg leading-relaxed">
                  Lo sentimos, tu solicitud de registro ha sido revisada y no
                  fue aprobada en este momento.
                </p>
                <div className="p-4 bg-stone-50 dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800">
                  <p className="text-sm text-stone-600 dark:text-stone-400 font-medium">
                    Si crees que esto es un error, por favor contacta al
                    administrador del sistema.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                  <Clock className="h-12 w-12 text-blue-500" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-white">
                  Verificación Pendiente
                </h1>
                <p className="text-stone-500 dark:text-stone-400 text-lg leading-relaxed">
                  Tu cuenta ha sido creada exitosamente. Para mantener la
                  seguridad, un administrador revisará y aprobará tu cuenta en
                  las próximas 24 horas.
                </p>
                <div className="p-4 bg-stone-50 dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800">
                  <p className="text-sm text-stone-600 dark:text-stone-400 font-medium">
                    Recibirás una notificación una vez tu cuenta esté activa.
                  </p>
                </div>
              </div>
            )}

            <Button
              className="w-full h-12 text-base font-semibold bg-[#6440fa] hover:bg-[#5030c9] text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-[0.99] transition-all mt-8"
              onClick={handleLogout}
            >
              Volver al Inicio de Sesión
            </Button>
          </div>
        </div>
      </div>

      {/* === SECCIÓN DERECHA (Banner Púrpura) === */}
      <div className="hidden lg:flex w-1/2 bg-[#6440fa] relative items-center justify-center p-12 overflow-hidden">
        {/* Elemento decorativo de fondo (triángulo sutil) */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-lg text-white space-y-8 mb-20">
          <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight">
            Tu seguridad es <br /> nuestra prioridad.
          </h2>
          <p className="text-lg text-indigo-100/90 max-w-md leading-relaxed">
            Nuestro proceso de verificación garantiza que solo personal
            autorizado tenga acceso a la plataforma, manteniendo la integridad
            de tus datos.
          </p>
        </div>

        {/* Tarjeta Flotante Inferior */}
        <div className="absolute bottom-8 right-8 left-8 md:left-auto md:w-[450px] bg-white dark:bg-stone-900 p-6 rounded-2xl shadow-2xl shadow-black/20 flex items-center justify-between backdrop-blur-sm bg-white/95 dark:bg-stone-900/95 border border-white/20">
          <div className="space-y-2">
            <h3 className="font-bold text-lg text-stone-900 dark:text-white flex items-center gap-2">
              Estado de Cuenta
              <ArrowUpRight className="h-4 w-4 text-stone-400" />
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {status === "rejected"
                ? "Acceso denegado temporalmente."
                : "En proceso de revisión por administración."}
            </p>
          </div>
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800">
            <ShieldCheck className="h-6 w-6 text-[#6440fa]" />
          </div>
        </div>
      </div>
    </div>
  );
}
