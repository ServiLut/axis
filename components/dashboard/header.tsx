"use client";

import { Button } from "@/components/ui/button";
import { Menu, UserCircle } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";

interface HeaderProps {
  onMenuClick: () => void;
  showMenuButtonOnDesktop?: boolean;
}

export function Header({ onMenuClick, showMenuButtonOnDesktop = false }: HeaderProps) {
  const { userFullName, tenantName } = useUserRole();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 px-4 shadow-sm md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className={`mr-2 ${showMenuButtonOnDesktop ? "" : "md:hidden"}`}
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle Menu</span>
      </Button>
      <div className="flex items-center gap-2 font-semibold">
        <span className="hidden md:inline-block">Panel de Control</span>
      </div>
      <div className="ml-auto flex items-center space-x-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground md:inline-block">
            {userFullName} {tenantName && <span className="ml-1 opacity-70">({tenantName})</span>}
          </span>
          <Button variant="ghost" size="icon" className="rounded-full">
            <UserCircle className="h-6 w-6" />
            <span className="sr-only">User menu</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
