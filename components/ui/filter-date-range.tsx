"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useDebouncedCallback } from "use-debounce";

export function FilterDateRange() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");

  const handleUpdate = useDebouncedCallback((start: string, end: string) => {
    const params = new URLSearchParams(searchParams);
    
    if (start) params.set("startDate", start);
    else params.delete("startDate");

    if (end) params.set("endDate", end);
    else params.delete("endDate");

    params.set("page", "1");
    replace(`${pathname}?${params.toString()}`);
  }, 500);

  useEffect(() => {
    handleUpdate(startDate, endDate);
  }, [startDate, endDate, handleUpdate]);

  return (
    <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-200">
      <span className="text-[10px] text-slate-500 whitespace-nowrap px-1">
        Fechas:
      </span>
      <Input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="w-[130px] border-0 focus-visible:ring-0 h-7 p-1 text-xs"
      />
      <span className="text-slate-300">-</span>
      <Input
        type="date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        className="w-[130px] border-0 focus-visible:ring-0 h-7 p-1 text-xs"
      />
    </div>
  );
}
