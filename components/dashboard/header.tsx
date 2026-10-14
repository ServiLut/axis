"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDashboardPageLabel } from "@/lib/dashboard-navigation";
import { Menu, UserCircle } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { HalloweenTheme } from "@/components/dashboard/halloween-theme";
import { HalloweenScene } from "@/components/seasonal/halloween-scene";

interface HeaderProps {
  onMenuClick: () => void;
  showMenuButtonOnDesktop?: boolean;
}

export function Header({ onMenuClick, showMenuButtonOnDesktop = false }: HeaderProps) {
  const { userFullName, role } = useUserRole();
  const pathname = usePathname();

  return (
    <header className="axis-header sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 px-4 shadow-sm md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className={`mr-2 ${showMenuButtonOnDesktop ? "" : "md:hidden"}`}
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Abrir o cerrar menú</span>
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
        <span className="truncate text-sm sm:text-base" title={getDashboardPageLabel(pathname, role)}>{getDashboardPageLabel(pathname, role)}</span>
        <div className="hidden shrink-0 sm:block"><HalloweenScene variant="panel" /></div>
      </div>
      <div className="ml-auto flex shrink-0 items-center space-x-2 sm:space-x-4">
        <HalloweenTheme />
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground md:inline-block">
            {userFullName}
          </span>
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link href="/dashboard/configuracion/perfil">
              <UserCircle className="h-6 w-6" />
              <span className="sr-only">Ver mi perfil</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
