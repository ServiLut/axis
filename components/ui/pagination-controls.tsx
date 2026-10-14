"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  itemsPerPage: number;
}

export function PaginationControls({
  currentPage,
  totalPages,
  totalRecords,
  itemsPerPage,
}: PaginationControlsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useRouter();
  const lastPage = Math.max(1, totalPages);
  const cannotGoBack = totalRecords === 0 || currentPage <= 1;
  const cannotGoForward = totalRecords === 0 || currentPage >= lastPage;

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", pageNumber.toString());
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6 rounded-lg shadow-sm">
      <div className="flex flex-1 justify-between sm:hidden">
        <Button
          variant="outline"
          onClick={() => createPageURL(Math.max(currentPage - 1, 1))}
          disabled={cannotGoBack}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          onClick={() => createPageURL(Math.min(currentPage + 1, totalPages))}
          disabled={cannotGoForward}
        >
          Siguiente
        </Button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-700">
            Mostrando{" "}
            <span className="font-medium">
              {totalRecords === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
            </span>{" "}
            a{" "}
            <span className="font-medium">
              {Math.min(currentPage * itemsPerPage, totalRecords)}
            </span>{" "}
            de <span className="font-medium">{totalRecords}</span> resultados
          </p>
        </div>
        <div>
          <nav
            className="isolate inline-flex -space-x-px rounded-md shadow-sm"
            aria-label="Paginación de resultados"
          >
            <Button
              variant="outline"
              className="rounded-l-md px-2 py-2"
              onClick={() => createPageURL(1)}
              disabled={cannotGoBack}
            >
              <span className="sr-only">Primera</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="px-2 py-2"
              onClick={() => createPageURL(Math.max(currentPage - 1, 1))}
              disabled={cannotGoBack}
            >
              <span className="sr-only">Anterior</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center px-4 border-y border-slate-200 bg-white text-sm font-medium text-slate-700">
              Página {currentPage} de {lastPage}
            </div>
            <Button
              variant="outline"
              className="px-2 py-2"
              onClick={() => createPageURL(Math.min(currentPage + 1, totalPages))}
              disabled={cannotGoForward}
            >
              <span className="sr-only">Siguiente</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="rounded-r-md px-2 py-2"
              onClick={() => createPageURL(totalPages)}
              disabled={cannotGoForward}
            >
              <span className="sr-only">Última</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </div>
    </div>
  );
}
