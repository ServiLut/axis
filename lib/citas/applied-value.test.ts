import { describe, expect, it } from "vitest";

import {
  calculateSerializedPackageUnitPrice,
  calculateSerializedTimeBlockPrice,
  normalizeSerializedMoney,
  resolveSerializedAppliedValue,
} from "./applied-value";

describe("browser-safe money helpers", () => {
  it("normaliza cero y redondea sin Prisma runtime", () => {
    expect(normalizeSerializedMoney(0)).toBe("0.00");
    expect(normalizeSerializedMoney("10.125")).toBe("10.13");
  });

  it("calcula el valor unitario histórico con redondeo a centavos", () => {
    expect(calculateSerializedPackageUnitPrice("100.01", 6)).toBe("16.67");
  });

  it("calcula bloques iniciados y total con aritmética exacta", () => {
    expect(
      calculateSerializedTimeBlockPrice({
        ratePerBlock: "4725.00",
        minutesPerBlock: 15,
        startMinute: 9 * 60,
        endMinute: 10 * 60 + 1,
      }),
    ).toEqual({
      durationMinutes: 61,
      blocks: 5,
      ratePerBlock: "4725.00",
      minutesPerBlock: 15,
      totalPrice: "23625.00",
    });
  });

  it("rechaza horarios y configuraciones inválidas", () => {
    expect(() =>
      calculateSerializedTimeBlockPrice({
        ratePerBlock: "0",
        minutesPerBlock: 0,
        startMinute: 60,
        endMinute: 120,
      }),
    ).toThrow();
    expect(() =>
      calculateSerializedTimeBlockPrice({
        ratePerBlock: "0",
        minutesPerBlock: 15,
        startMinute: 120,
        endMinute: 120,
      }),
    ).toThrow();
  });
});

describe("resolveSerializedAppliedValue", () => {
  it("prioriza el valor aplicado persistido", () => {
    expect(
      resolveSerializedAppliedValue({
        valorAplicado: "127094.40",
        packageSnapshot: { totalPrice: "349800.00", sessions: 3 },
        legacyValue: "349800.00",
      }),
    ).toBe("127094.40");
  });

  it("usa el valor unitario histórico del paquete cuando falta valorAplicado", () => {
    expect(
      resolveSerializedAppliedValue({
        valorAplicado: null,
        packageSnapshot: { totalPrice: "349800.00", sessions: 3 },
        legacyValue: "349800.00",
      }),
    ).toBe("116600.00");
  });

  it("redondea el valor unitario del paquete a centavos", () => {
    expect(
      resolveSerializedAppliedValue({
        valorAplicado: null,
        packageSnapshot: { totalPrice: "100.01", sessions: 6 },
        legacyValue: null,
      }),
    ).toBe("16.67");
  });

  it("usa el valor legacy para una cita sin paquete", () => {
    expect(
      resolveSerializedAppliedValue({
        valorAplicado: null,
        packageSnapshot: null,
        legacyValue: 127094,
      }),
    ).toBe("127094.00");
  });

  it("conserva cero como un valor aplicado válido", () => {
    expect(
      resolveSerializedAppliedValue({
        valorAplicado: 0,
        packageSnapshot: { totalPrice: "349800.00", sessions: 3 },
        legacyValue: "349800.00",
      }),
    ).toBe("0.00");
  });

  it.each([0, -1, 1.5])(
    "no divide un paquete con sesiones inválidas (%s)",
    (sessions) => {
      expect(
        resolveSerializedAppliedValue({
          valorAplicado: null,
          packageSnapshot: { totalPrice: "349800.00", sessions },
          legacyValue: "349800.00",
        }),
      ).toBeNull();
    },
  );
});
