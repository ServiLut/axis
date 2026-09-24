"use client";

import { Input } from "@/components/ui/input";
import { useState } from "react";

export function InternationalPhoneInput({
  name,
  defaultValue,
  required = false,
}: {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue === "No Concretado" ? "" : defaultValue || "");
  return (
    <div className="space-y-2">
      <Input
        id={name}
        name={name}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+57 3001234567"
        required={required}
        className="h-11"
        aria-describedby={`${name}-help`}
      />
      <p id={`${name}-help`} className="text-xs text-slate-500">
        Incluye el indicativo: +57 Colombia, +1 EE. UU./Canadá, +48 Polonia u otro país.
      </p>
    </div>
  );
}
