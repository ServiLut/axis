"use client";

import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";
import { useHalloween } from "@/components/seasonal/halloween-provider";

export function HalloweenTheme() {
  const { season, enabled, paused, reducedMotion, toggleTheme, toggleMotion } = useHalloween();

  if (!season) return null;

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="halloween-toggle shrink-0 gap-2 rounded-full"
        aria-pressed={enabled}
        aria-label={enabled ? "Desactivar temática de Halloween" : "Activar temática de Halloween"}
        title={enabled ? "Volver al aspecto habitual" : "Activar Halloween"}
        onClick={toggleTheme}
      >
        <span aria-hidden="true">🎃</span>
        <span className="hidden sm:inline">Halloween</span>
      </Button>
      {enabled && (
        <Button
          variant="outline"
          size="icon"
          className="halloween-toggle size-8 rounded-full"
          aria-label={paused ? "Reanudar animaciones de Halloween" : "Pausar animaciones de Halloween"}
          aria-pressed={paused}
          title={reducedMotion ? "Movimiento reducido según tu dispositivo" : paused ? "Reanudar animaciones" : "Pausar animaciones"}
          disabled={reducedMotion}
          onClick={toggleMotion}
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </Button>
      )}
    </div>
  );
}
