"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Home, Users, UserRound, Wallet, MessageCircle, Settings, Activity, ChevronDown, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/use-user-role";
import { getDashboardNavigation, getActiveNavigationHref } from "@/lib/dashboard-navigation";

const menuIcons = { inicio: Home, agenda: CalendarDays, pacientes: Users, equipo: UserRound, pagos: Wallet, mensajeria: MessageCircle, actividad: Activity, configuracion: Settings };
type SidebarProps = React.HTMLAttributes<HTMLDivElement> & { onNavigate?: () => void };

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useUserRole();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loggingOut, setLoggingOut] = useState(false);
  const menuItems = getDashboardNavigation(role);
  const activeHref = getActiveNavigationHref(pathname, menuItems);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const token = localStorage.getItem("token");
      await fetch("/api/sign-out", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      router.replace("/sign-in");
      setLoggingOut(false);
    }
  }

  return (
    <div className={cn("flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground", className)}>
      <Link href="/dashboard" onClick={onNavigate} className="border-b border-sidebar-border px-5 py-5">
        <span className="block text-xl font-bold tracking-tight">Axis</span>
        <span className="mt-1 block text-xs text-sidebar-foreground/70">Psicólogos en Colombia</span>
      </Link>
      <nav aria-label="Menú principal" className="flex-1 space-y-1 overflow-y-auto p-3">
        {menuItems.map((menu) => {
          const Icon = menuIcons[menu.key];
          if (menu.href) {
            const active = activeHref === menu.href;
            return (
              <Button key={menu.key} asChild variant="ghost" className={cn("w-full justify-start", active && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground")}>
                <Link href={menu.href} aria-current={active ? "page" : undefined} onClick={onNavigate}>
                  <Icon className="mr-3 h-4 w-4" aria-hidden="true" />{menu.label}
                </Link>
              </Button>
            );
          }
          const active = menu.items.some((item) => item.href === activeHref);
          const open = expanded[`${menu.key}:${pathname}`] ?? active;
          const panelId = `menu-${menu.key}`;
          return (
            <div key={menu.key}>
              <Button variant="ghost" aria-expanded={open} aria-controls={panelId} className={cn("w-full justify-between", active && "font-semibold text-sidebar-primary")} onClick={() => setExpanded((previous) => ({ ...previous, [`${menu.key}:${pathname}`]: !open }))}>
                <span className="flex items-center"><Icon className="mr-3 h-4 w-4" aria-hidden="true" />{menu.label}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
              </Button>
              <div id={panelId} hidden={!open} className="my-1 ml-5 space-y-1 border-l border-sidebar-border pl-3">
                {menu.items.map((item) => (
                  <Button key={item.href} asChild variant="ghost" className={cn("h-9 w-full justify-start text-sm", activeHref === item.href && "bg-sidebar-accent font-medium text-sidebar-accent-foreground")}>
                    <Link href={item.href} aria-current={activeHref === item.href ? "page" : undefined} onClick={onNavigate}>{item.label}</Link>
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Button variant="ghost" className="w-full justify-start" disabled={loggingOut} onClick={handleLogout}>
          <LogOut className="mr-3 h-4 w-4" aria-hidden="true" />{loggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
        </Button>
      </div>
    </div>
  );
}
