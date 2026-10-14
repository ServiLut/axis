"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useDebouncedCallback } from "use-debounce";
import { createDateRangeState, planDateRangeUpdate, syncDateRangeState } from "./filter-date-range-state";

export function FilterDateRange() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const url = `${pathname}?${searchParams.toString()}`;
  const [dateRange, setDateRange] = useState(() => createDateRangeState(url));
  if (dateRange.url !== url) {
    setDateRange(syncDateRangeState(dateRange, url));
  }

  const handleUpdate = useDebouncedCallback((start: string, end: string, revision: number) => {
    const update = planDateRangeUpdate(dateRange, start, end, revision);
    if (!update) return;
    setDateRange(update.state);
    replace(update.url);
  }, 500);

  useEffect(() => {
    handleUpdate.cancel();
  }, [dateRange.revision, handleUpdate]);

  useEffect(() => {
    const handleHistory = () => {
      handleUpdate.cancel();
      setDateRange((current) => createDateRangeState(current.url, current.revision + 1));
    };
    window.addEventListener("popstate", handleHistory);
    return () => {
      window.removeEventListener("popstate", handleHistory);
      handleUpdate.cancel();
    };
  }, [handleUpdate]);

  const handleChange = (field: "startDate" | "endDate", value: string) => {
    const next = { ...dateRange, [field]: value };
    setDateRange(next);
    handleUpdate(next.startDate, next.endDate, next.revision);
  };

  return (
    <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-200">
      <span className="text-[10px] text-slate-500 whitespace-nowrap px-1">
        Fechas:
      </span>
      <Input
        type="date"
        aria-label="Desde"
        value={dateRange.startDate}
        onChange={(e) => handleChange("startDate", e.target.value)}
        className="w-[130px] border-0 focus-visible:ring-0 h-7 p-1 text-xs"
      />
      <span className="text-slate-300">-</span>
      <Input
        type="date"
        aria-label="Hasta"
        value={dateRange.endDate}
        onChange={(e) => handleChange("endDate", e.target.value)}
        className="w-[130px] border-0 focus-visible:ring-0 h-7 p-1 text-xs"
      />
    </div>
  );
}
