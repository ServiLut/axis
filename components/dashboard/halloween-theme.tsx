"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function HalloweenTheme() {
  const [enabled, setEnabled] = useState(false);
  const [season, setSeason] = useState<string | null>(null);

  useEffect(() => {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: "America/Bogota", month: "2-digit", year: "numeric",
    }).formatToParts(new Date());
    if (parts.find((part) => part.type === "month")?.value !== "10") return;
    const key = `axis-halloween-${parts.find((part) => part.type === "year")?.value}`;
    let active = true;
    try { active = localStorage.getItem(key) !== "off"; } catch { /* Storage is optional. */ }
    setSeason(key);
    setEnabled(active);
    document.documentElement.toggleAttribute("data-halloween", active);
    return () => document.documentElement.removeAttribute("data-halloween");
  }, []);

  if (!season) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="halloween-toggle shrink-0 gap-2 rounded-full"
      aria-pressed={enabled}
      aria-label={enabled ? "Desactivar temática de Halloween" : "Activar temática de Halloween"}
      title={enabled ? "Volver al aspecto habitual" : "Activar Halloween"}
      onClick={() => {
        const active = !enabled;
        setEnabled(active);
        document.documentElement.toggleAttribute("data-halloween", active);
        try { localStorage.setItem(season, active ? "on" : "off"); } catch { /* Storage is optional. */ }
      }}
    >
      <span aria-hidden="true">🎃</span>
      <span className="hidden sm:inline">Halloween</span>
    </Button>
  );
}
