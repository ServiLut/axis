import { readFileSync } from "node:fs";
import * as dateFnsTz from "date-fns-tz";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aggregateCitasBillingSummary, type CitasBillingSummary } from "./billing-summary";
import { buildCitasWhere, type CitasFilters } from "./filters";

const mocks = {
  verifyToken: vi.fn(), user: vi.fn(), citas: vi.fn(), count: vi.fn(), packages: vi.fn(), raw: vi.fn(),
};

// Run the actual production server module with mocked dependencies and no database
// connection. The summary must not depend on new pricing columns or migrations.
const dependencies: Record<string, unknown> = {
  "@/lib/auth": { verifyToken: mocks.verifyToken },
  "@/lib/prisma": { default: {
    usuario: { findUnique: mocks.user },
    citasPsicologos: { findMany: mocks.citas, count: mocks.count },
    paqueteAdquirido: { findMany: mocks.packages },
    $queryRaw: mocks.raw,
  } },
  "@/lib/psychology": { PSYCHOLOGY_TENANT_ID: 4 },
  "@/prisma/generated/prisma/client": {
    Rol: { ADMIN: "ADMIN", ASESOR: "ASESOR", SU_ADMIN: "SU_ADMIN", TECNICO: "TECNICO" },
    EstadoPagoOrden: { PENDIENTE: "PENDIENTE", CONCILIADO: "CONCILIADO", CONSIGNADO: "CONSIGNADO", EFECTIVO_DECLARADO: "EFECTIVO_DECLARADO" },
    Prisma: {
      Decimal: { isDecimal: () => false },
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join("?"), values }),
      join: (values: unknown[]) => ({ values }),
      empty: { text: "", values: [] },
    },
  },
  "date-fns-tz": dateFnsTz,
  "@/lib/psychology-access": { requireFinanceUser: vi.fn() },
  "@/lib/booking": { bookingTimes: vi.fn() },
  "@/lib/booking-server": { lockAndValidateBooking: vi.fn(), normalizedRental: vi.fn() },
  "@/lib/caja": { cajaAmountInCents: vi.fn() },
  "@/lib/package-payment": { getPackagePaymentState: vi.fn() },
  "@/lib/psychology-appointment-delete": { deletePsychologyAppointment: vi.fn() },
  "@/lib/citas/billing-summary": { aggregateCitasBillingSummary },
  "@/lib/citas/filters": { buildCitasWhere },
  "@/lib/audit": { createAuditLog: vi.fn() },
  "next/cache": { revalidatePath: vi.fn() },
  "@supabase/supabase-js": { createClient: vi.fn() },
};
const source = readFileSync(new URL("../../app/(protected)/dashboard/citas/actions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
}).outputText;
const moduleExports: Record<string, unknown> = {};
new Function("require", "exports", compiled)((name: string) => {
  if (!(name in dependencies)) throw new Error(`Unexpected action dependency: ${name}`);
  return dependencies[name];
}, moduleExports);
const getCitasBillingSummary = moduleExports.getCitasBillingSummary as (
  token: string, filters: CitasFilters,
) => Promise<{ summary: CitasBillingSummary } | { error: string }>;
const getCitas = moduleExports.getCitas as (
  token: string, page: number, limit: number, filters: CitasFilters,
) => Promise<unknown>;

describe("getCitasBillingSummary database contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyToken.mockReturnValue({ userId: 9, tenantId: 4, aprobado: true });
    mocks.user.mockResolvedValue({ tenantId: 4, rol: "SU_ADMIN", activo: true, aprobado: true });
    mocks.citas.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.packages.mockResolvedValue([]);
    mocks.raw.mockResolvedValue([]);
  });

  it("queries every matching non-canceled appointment with the same date and active filters", async () => {
    await getCitasBillingSummary("token", {
      tenantId: "99", psicologoId: "2", consultorioId: "3", paqueteId: "7", estadoPago: "PENDIENTE",
      startDate: "2026-10-14", endDate: "2026-10-14", term: "Ana",
    });
    const query = mocks.citas.mock.calls[0][0];
    expect(query).not.toHaveProperty("skip");
    expect(query).not.toHaveProperty("take");
    expect(query.where).toMatchObject({
      tenantId: 4, psicologoId: 2, consultorioId: 3n,
      PaqueteAdquirido: { tenantId: 4, catalogoId: 7n },
      fechaCita: { gte: new Date("2026-10-14T05:00:00Z"), lt: new Date("2026-10-15T05:00:00Z") },
    });
    expect(query.where.OR).toHaveLength(3);
    expect(query.where.AND).toEqual([
      { OR: [{ estadoPago: "PENDIENTE" }, { estadoPago: null }] },
      { OR: [{ realizada: false }, { realizada: true }] },
    ]);
  });

  it("matches the production table historical unit value then recorded appointment value, scoped to tenant 4", async () => {
    mocks.citas.mockResolvedValue([
      { id: 1n, paqueteId: 50n, valor: "80000.00" },
      { id: 2n, paqueteId: 50n, valor: "80000.00" },
      { id: 3n, paqueteId: null, valor: "18000.50" },
      { id: 4n, paqueteId: null, valor: null },
    ]);
    mocks.packages.mockResolvedValue([{ id: 50n, precioPagado: "240000.00", sesionesTotales: 6 }]);

    expect(await getCitasBillingSummary("token", {})).toEqual({
      summary: { total: "98000.50", citas: 4, sinValor: 1 },
    });
    expect(mocks.packages).toHaveBeenCalledWith({
      where: { id: { in: [50n] }, tenantId: 4 },
      select: { id: true, precioPagado: true, sesionesTotales: true },
    });
    expect(mocks.raw).not.toHaveBeenCalled();
  });

  it("shares the table filters and adds only the confirmed cancellation exclusion", async () => {
    const filters: CitasFilters = { term: "Ana Duque", psicologoId: "2", estadoCita: "realizada", estadoPago: "CONCILIADO", startDate: "2026-10-01", endDate: "2026-10-14" };
    await getCitas("token", 3, 10, filters);
    const listQuery = mocks.citas.mock.calls[0][0];
    await getCitasBillingSummary("token", filters);
    const summaryQuery = mocks.citas.mock.calls[1][0];
    expect(listQuery).toMatchObject({ skip: 20, take: 10 });
    expect(summaryQuery.where).toEqual({
      ...listQuery.where,
      AND: [...listQuery.where.AND, { OR: [{ realizada: false }, { realizada: true }] }],
    });
  });

  it("reports incomplete amounts in the returned summary instead of turning them into zero", async () => {
    mocks.citas.mockResolvedValue([
      { id: 1n, paqueteId: null, valor: "invalid" },
      { id: 2n, paqueteId: null, valor: null },
    ]);
    expect(await getCitasBillingSummary("token", {})).toEqual({ summary: { total: "0.00", citas: 2, sinValor: 2 } });
  });

  it("does not truncate a result larger than the existing 10000-record export limit", async () => {
    mocks.citas.mockResolvedValue(Array.from({ length: 10001 }, (_, index) => ({
      id: BigInt(index + 1), paqueteId: null, valor: "0.01",
    })));
    expect(await getCitasBillingSummary("token", {})).toEqual({ summary: { total: "100.01", citas: 10001, sinValor: 0 } });
    expect(mocks.raw).not.toHaveBeenCalled();
  });

  it("batches historical packages without losing records or crossing tenant scope", async () => {
    mocks.citas.mockResolvedValue(Array.from({ length: 1001 }, (_, index) => ({
      id: BigInt(index + 1), paqueteId: BigInt(index + 1), valor: "0.00",
    })));
    mocks.packages.mockImplementation(async (query: { where: { id: { in: bigint[] } } }) =>
      query.where.id.in.map((id) => ({ id, precioPagado: "10.00", sesionesTotales: 2 })),
    );
    expect(await getCitasBillingSummary("token", {})).toEqual({ summary: { total: "5005.00", citas: 1001, sinValor: 0 } });
    expect(mocks.packages).toHaveBeenCalledTimes(2);
    expect(mocks.packages.mock.calls.every(([query]) => query.where.tenantId === 4)).toBe(true);
  });

  it("returns a read error instead of a misleading zero when the financial query fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.citas.mockRejectedValue(new Error("Database unavailable"));
      expect(await getCitasBillingSummary("token", {})).toEqual({ error: "No se pudo calcular el total del periodo. Intente nuevamente." });
    } finally {
      log.mockRestore();
    }
  });

  it("does not use a package absent from the tenant-scoped package result", async () => {
    mocks.citas.mockResolvedValue([{ id: 1n, paqueteId: 77n, valor: "7000.00" }]);
    expect(await getCitasBillingSummary("token", {})).toEqual({ summary: { total: "7000.00", citas: 1, sinValor: 0 } });
    expect(mocks.packages.mock.calls[0][0].where).toEqual({ id: { in: [77n] }, tenantId: 4 });
  });

  it.each([
    { tenantId: 99, rol: "SU_ADMIN", activo: true, aprobado: true },
    { tenantId: 4, rol: "TECNICO", activo: true, aprobado: true },
    { tenantId: 4, rol: "ADMIN", activo: false, aprobado: true },
    { tenantId: 4, rol: "ADMIN", activo: true, aprobado: false },
    null,
  ])("rejects a missing, historical, inactive, unapproved or unauthorized database user", async (user) => {
    mocks.user.mockResolvedValue(user);
    expect(await getCitasBillingSummary("token", {})).toEqual({ error: "No autorizado" });
    expect(mocks.citas).not.toHaveBeenCalled();
    expect(mocks.raw).not.toHaveBeenCalled();
    expect(mocks.packages).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "ASESOR", "SU_ADMIN"])("permits approved active psychology role %s", async (rol) => {
    mocks.user.mockResolvedValue({ tenantId: 4, rol, activo: true, aprobado: true });
    expect(await getCitasBillingSummary("token", {})).toEqual({ summary: { total: "0.00", citas: 0, sinValor: 0 } });
  });

  it("rejects an invalid token before any database operation", async () => {
    mocks.verifyToken.mockReturnValue(null);
    expect(await getCitasBillingSummary("invalid", {})).toEqual({ error: "No autorizado" });
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it("rejects invalid or inverted dates before reading financial records", async () => {
    expect(await getCitasBillingSummary("token", { startDate: "2026-10-15", endDate: "2026-10-14" }))
      .toEqual({ error: "La fecha de fin debe ser igual o posterior a la fecha de inicio." });
    expect(mocks.citas).not.toHaveBeenCalled();
  });
});
