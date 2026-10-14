import type { EstadoPagoOrden, Prisma } from "../../prisma/generated/prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { PSYCHOLOGY_TENANT_ID } from "../psychology";

export type EstadoCitaFilter = "all" | "programada" | "realizada" | "cancelada";

export type CitasFilters = {
  term?: string;
  empresaId?: string;
  psicologoId?: string;
  consultorioId?: string;
  paqueteId?: string;
  estadoCita?: EstadoCitaFilter;
  estadoPago?: EstadoPagoOrden | "all";
  startDate?: string;
  endDate?: string;
  tenantId?: string;
};

const parseDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Seleccione una fecha válida en el formato año-mes-día.");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Seleccione una fecha válida.");
  }
  return date;
};

export function getCitasDateFilter(startDate?: string, endDate?: string) {
  const start = startDate ? parseDate(startDate) : undefined;
  const end = endDate ? parseDate(endDate) : undefined;
  if (start && end && start > end) {
    throw new Error("La fecha de fin debe ser igual o posterior a la fecha de inicio.");
  }
  const filter: { gte?: Date; lt?: Date } = {};
  if (startDate) filter.gte = fromZonedTime(`${startDate}T00:00:00`, "America/Bogota");
  if (end) {
    const nextDay = new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    filter.lt = fromZonedTime(`${nextDay}T00:00:00`, "America/Bogota");
  }
  return filter;
}

const selectedId = (value?: string) => Boolean(value && value !== "all");

/** Shared by the appointment list and its complete, non-paginated summary. */
export function buildCitasWhere(
  filters: CitasFilters,
  { excludeCanceladas = false }: { excludeCanceladas?: boolean } = {},
): Prisma.CitasPsicologosWhereInput {
  const where: Prisma.CitasPsicologosWhereInput = { tenantId: PSYCHOLOGY_TENANT_ID };
  const andFilters: Prisma.CitasPsicologosWhereInput[] = [];

  if (filters.term) {
    const term = filters.term;
    const searchWords = term.split(/\s+/).filter((word) => word.length > 0);
    where.OR = [
      {
        Cliente: {
          AND: searchWords.map((word) => ({
            OR: [
              { nombre: { contains: word, mode: "insensitive" } },
              { apellido: { contains: word, mode: "insensitive" } },
            ],
          })),
        },
      },
      { Cliente: { numeroDocumento: { contains: term, mode: "insensitive" } } },
      { Cliente: { telefono: { contains: term, mode: "insensitive" } } },
    ];
    if (/^\d+$/.test(term)) where.OR.push({ id: BigInt(term) });
  }

  if (selectedId(filters.empresaId)) where.empresaId = Number(filters.empresaId);
  if (selectedId(filters.psicologoId)) where.psicologoId = Number(filters.psicologoId);
  if (selectedId(filters.consultorioId)) where.consultorioId = BigInt(filters.consultorioId!);
  if (selectedId(filters.paqueteId)) {
    where.PaqueteAdquirido = {
      catalogoId: BigInt(filters.paqueteId!),
      tenantId: PSYCHOLOGY_TENANT_ID,
    };
  }

  if (filters.estadoCita === "programada") where.realizada = false;
  if (filters.estadoCita === "realizada") where.realizada = true;
  if (filters.estadoCita === "cancelada") where.realizada = null;

  if (filters.estadoPago === "PENDIENTE") {
    andFilters.push({ OR: [{ estadoPago: "PENDIENTE" }, { estadoPago: null }] });
  } else if (
    filters.estadoPago && filters.estadoPago !== "all" &&
    ["EFECTIVO_DECLARADO", "CONSIGNADO", "CONCILIADO"].includes(filters.estadoPago)
  ) {
    andFilters.push({ estadoPago: filters.estadoPago });
  }

  if (excludeCanceladas) {
    andFilters.push({ OR: [{ realizada: false }, { realizada: true }] });
  }
  if (andFilters.length) where.AND = andFilters;
  if (filters.startDate || filters.endDate) {
    where.fechaCita = getCitasDateFilter(filters.startDate, filters.endDate);
  }

  return where;
}
