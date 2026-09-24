"use client";

import { useId, useState } from "react";
import { municipiosAntioquia } from "@/lib/constants/municipios";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const municipalities = Array.from(new Set(municipiosAntioquia.map((m) => m.nombre)))
  .map((nombre) => ({ value: nombre, label: nombre }));

export function ClientLocationFields({ municipality, neighborhood, onChange }: {
  municipality: string | null;
  neighborhood: string | null;
  onChange: (field: string, value: string) => void;
}) {
  const id = useId();
  const [externalOverride, setExternalOverride] = useState<boolean | null>(null);
  const external = externalOverride ?? Boolean(
    municipality && municipality !== "No Concretado" &&
    !municipalities.some((m) => m.value === municipality),
  );
  const neighborhoods = Array.from(new Set(municipiosAntioquia.find((m) => m.nombre === municipality)?.barrios || []))
    .map((nombre) => ({ value: nombre, label: nombre }));

  return (
    <>
      <div className="space-y-2 md:col-span-5">
        <Label htmlFor={`${id}-location`}>Ubicación del cliente</Label>
        <select
          id={`${id}-location`}
          value={external ? "external" : "local"}
          onChange={(e) => setExternalOverride(e.target.value === "external")}
          className="block h-11 w-full rounded-md border border-input bg-white px-3 text-sm md:max-w-sm"
        >
          <option value="local">Antioquia, Colombia</option>
          <option value="external">Otra ciudad o país</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-city`}>{external ? <>Ciudad y país <span className="text-red-500">*</span></> : "Municipio"}</Label>
        {external ? (
          <Input id={`${id}-city`} value={municipality || ""} required
            placeholder="Ej. Varsovia, Polonia" className="bg-white h-11"
            onChange={(e) => onChange("municipio", e.target.value)} />
        ) : (
          <Combobox options={municipalities} value={municipality || ""}
            onChange={(value) => onChange("municipio", value)}
            placeholder="Seleccionar municipio" emptyMessage="Municipio no encontrado" />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-neighborhood`}>{external ? "Barrio o zona (opcional)" : "Barrio"}</Label>
        {external ? (
          <Input id={`${id}-neighborhood`} value={neighborhood || ""}
            className="bg-white h-11" placeholder="Barrio o zona"
            onChange={(e) => onChange("barrio", e.target.value)} />
        ) : (
          <Combobox options={neighborhoods} value={neighborhood || ""}
            onChange={(value) => onChange("barrio", value)}
            placeholder="Seleccionar barrio" emptyMessage="Barrio no encontrado"
            disabled={!municipality} />
        )}
      </div>
    </>
  );
}
