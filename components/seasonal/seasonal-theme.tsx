"use client";

import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HalloweenTheme } from "@/components/dashboard/halloween-theme";
import { useChristmas } from "./christmas-provider";

export function SeasonalTheme() {
  const { season, enabled, paused, reducedMotion, toggleTheme, toggleMotion } = useChristmas();
  if (!season) return <HalloweenTheme />;
  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      <Button
        variant="outline" size="sm" className="christmas-toggle shrink-0 gap-2 rounded-full"
        aria-pressed={enabled}
        aria-label={enabled ? "Desactivar temática de Navidad" : "Activar temática de Navidad"}
        title="Navidad · Del 1 de diciembre al 10 de enero"
        onClick={toggleTheme}
      >
        <span aria-hidden="true">🎄</span>
        <span className="hidden sm:inline">Navidad</span>
      </Button>
      {enabled && <Button
        variant="outline" size="icon" className="christmas-toggle size-8 rounded-full"
        aria-pressed={paused}
        aria-label={paused ? "Reanudar animaciones de Navidad" : "Pausar animaciones de Navidad"}
        title={reducedMotion ? "Movimiento reducido según tu dispositivo" : paused ? "Reanudar animaciones" : "Pausar animaciones"}
        disabled={reducedMotion} onClick={toggleMotion}
      >
        {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
      </Button>}
    </div>
  );
}
