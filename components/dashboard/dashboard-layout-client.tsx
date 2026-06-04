"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { useUserRole } from "@/hooks/use-user-role";
import { useActivityMonitor } from "@/hooks/use-activity-monitor";
import { toast } from "sonner";

export function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { role, userId, loading } = useUserRole();
  const { isIdle, showReconnected } = useActivityMonitor(userId);

  const isMensajeria = pathname === "/dashboard/mensajeria";

  useEffect(() => {
    if (!loading) {
      if (!role) {
        router.push("/sign-in");
      } else if (role !== "ADMIN" && role !== "ASESOR" && role !== "SU_ADMIN") {
        toast.error("No tienes permisos para acceder al dashboard");
        router.push("/sign-in");
      }
    }
  }, [loading, role, router]);

  useEffect(() => {
    const validateSession = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const res = await fetch("/api/auth/validate", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const data = await res.json();
          // Avoid toast loop or duplicate
          if (data.message === "User not approved" || data.message === "User inactive") {
             toast.error("Tu cuenta ha sido desactivada o desaprobada.");
          } else {
             // specific cases or generic
             // toast.error("Sesión inválida.");
          }
          
          localStorage.removeItem("token");
          router.push("/sign-in");
        }
      } catch (error) {
        console.error("Error validating session:", error);
      }
    };

    validateSession();
  }, [pathname, router]);

  // Evitar renderizar el contenido hasta confirmar autenticación y rol
  if (
    loading ||
    !role ||
    (role !== "ADMIN" && role !== "ASESOR" && role !== "SU_ADMIN")
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50 dark:bg-stone-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50 dark:bg-stone-950">
      {isIdle && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center bg-yellow-500/90 py-1 text-xs font-medium text-white backdrop-blur-sm transition-all animate-in slide-in-from-top">
          Modo inactivo - Actividad detenida
        </div>
      )}
      {showReconnected && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center bg-green-500/90 py-1 text-xs font-medium text-white backdrop-blur-sm transition-all animate-in slide-in-from-top fade-out duration-500">
          Actividad retomada - Estado Activo
        </div>
      )}
      {/* Sidebar - Desktop: static (flex item), Mobile: fixed off-canvas */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-stone-200 bg-stone-100 transition-transform duration-200 ease-in-out dark:border-stone-800 dark:bg-stone-900 ${
          isMensajeria
            ? isSidebarOpen
              ? "translate-x-0 shadow-xl"
              : "-translate-x-full"
            : `md:static md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`
        }`}
      >
        <Sidebar className="h-full overflow-y-auto" />
      </aside>

      {/* Mobile Overlay (or Desktop Overlay when in Mensajeria mode) */}
      {isSidebarOpen && (
        <div
          className={`fixed inset-0 z-30 bg-black/50 ${isMensajeria ? "" : "md:hidden"}`}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Wrapper */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
          showMenuButtonOnDesktop={isMensajeria}
        />
        {/* Content Area */}
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
