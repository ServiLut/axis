import { describe, expect, it } from "vitest";
import { buildCitasWhere, getCitasDateFilter } from "./filters";

describe("shared appointment filters", () => {
  it("uses Colombia midnight and includes the entire final day", () => {
    expect(getCitasDateFilter("2026-10-14", "2026-10-14")).toEqual({
      gte: new Date("2026-10-14T05:00:00.000Z"),
      lt: new Date("2026-10-15T05:00:00.000Z"),
    });
  });

  it("handles leap days and calendar month rollover", () => {
    expect(getCitasDateFilter(undefined, "2028-02-29").lt).toEqual(new Date("2028-03-01T05:00:00Z"));
    expect(getCitasDateFilter("2026-12-31", "2026-12-31").lt).toEqual(new Date("2027-01-01T05:00:00Z"));
  });

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "14/10/2026", "not-a-date"])(
    "rejects invalid date %s", (date) => expect(() => getCitasDateFilter(date)).toThrow("fecha válida"),
  );

  it("rejects an inverted date range", () => {
    expect(() => getCitasDateFilter("2026-10-15", "2026-10-14")).toThrow("fecha de fin");
  });

  it("supports one-sided ranges without silently adding an unrelated bound", () => {
    expect(getCitasDateFilter("2026-10-14")).toEqual({ gte: new Date("2026-10-14T05:00:00Z") });
    expect(getCitasDateFilter(undefined, "2026-10-14")).toEqual({ lt: new Date("2026-10-15T05:00:00Z") });
  });

  it("preserves all table filters while preventing other tenant selection", () => {
    const where = buildCitasWhere({
      tenantId: "99", empresaId: "3", psicologoId: "5", consultorioId: "8", paqueteId: "9",
      estadoCita: "realizada", estadoPago: "CONCILIADO",
      startDate: "2026-10-01", endDate: "2026-10-14",
    });
    expect(where).toMatchObject({
      tenantId: 4, empresaId: 3, psicologoId: 5, consultorioId: 8n,
      PaqueteAdquirido: { tenantId: 4, catalogoId: 9n }, realizada: true,
      AND: [{ estadoPago: "CONCILIADO" }],
      fechaCita: { gte: new Date("2026-10-01T05:00:00Z"), lt: new Date("2026-10-15T05:00:00Z") },
    });
  });

  it("combines patient search, pending payment and exclusion of canceled appointments", () => {
    const where = buildCitasWhere({ term: "Ana Duque", estadoPago: "PENDIENTE" }, { excludeCanceladas: true });
    expect(where.OR).toHaveLength(3);
    expect(where.OR?.[0]).toMatchObject({ Cliente: { AND: [
      { OR: [{ nombre: { contains: "Ana" } }, { apellido: { contains: "Ana" } }] },
      { OR: [{ nombre: { contains: "Duque" } }, { apellido: { contains: "Duque" } }] },
    ] } });
    expect(where.AND).toEqual([
      { OR: [{ estadoPago: "PENDIENTE" }, { estadoPago: null }] },
      { OR: [{ realizada: false }, { realizada: true }] },
    ]);
  });

  it("keeps both scheduled and realized appointments in the value summary", () => {
    expect(buildCitasWhere({}, { excludeCanceladas: true }).AND).toEqual([
      { OR: [{ realizada: false }, { realizada: true }] },
    ]);
  });

  it("does not reintroduce canceled rows when the active filter selects them", () => {
    const where = buildCitasWhere({ estadoCita: "cancelada" }, { excludeCanceladas: true });
    expect(where.realizada).toBeNull();
    expect(where.AND).toEqual([{ OR: [{ realizada: false }, { realizada: true }] }]);
  });

  it("preserves numeric appointment search alongside patient fields", () => {
    expect(buildCitasWhere({ term: "123" }).OR?.[3]).toEqual({ id: 123n });
  });
});
