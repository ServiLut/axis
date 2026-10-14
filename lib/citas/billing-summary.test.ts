import { describe, expect, it } from "vitest";
import { aggregateCitasBillingSummary } from "./billing-summary";

const amount = (valorAplicado: string | null) => ({ valorAplicado, packageSnapshot: null, legacyValue: null });

describe("appointment billing summary", () => {
  it("sums cents exactly and serializes the complete result", () => {
    const summary = aggregateCitasBillingSummary([amount("0.10"), amount("0.20"), amount("99.99")]);
    expect(summary).toEqual({ total: "100.29", citas: 3, sinValor: 0 });
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  it("uses the recorded applied value before a package or legacy value", () => {
    expect(aggregateCitasBillingSummary([{
      valorAplicado: "12500.00",
      packageSnapshot: { totalPrice: "360000.00", sessions: 6 },
      legacyValue: "90000.00",
    }]).total).toBe("12500.00");
  });

  it("counts the unit value of prepaid sessions and the rental, not each full package", () => {
    const prepaidSession = { valorAplicado: null, packageSnapshot: { totalPrice: "300000.00", sessions: 6 }, legacyValue: "300000.00" };
    expect(aggregateCitasBillingSummary([prepaidSession, prepaidSession, amount("40000.00")]))
      .toEqual({ total: "140000.00", citas: 3, sinValor: 0 });
  });

  it("falls back to the legacy appointment value when there is no recorded snapshot", () => {
    expect(aggregateCitasBillingSummary([{ valorAplicado: null, packageSnapshot: null, legacyValue: "27000.50" }]).total)
      .toBe("27000.50");
  });

  it("keeps a legitimate zero value and distinguishes missing values", () => {
    expect(aggregateCitasBillingSummary([amount("0.00"), amount(null)]))
      .toEqual({ total: "0.00", citas: 2, sinValor: 1 });
  });

  it("reports invalid recorded values instead of inventing a fallback amount", () => {
    expect(aggregateCitasBillingSummary([
      { valorAplicado: "invalid", packageSnapshot: { totalPrice: "80000", sessions: 2 }, legacyValue: "70000" },
      amount("-1"), amount("NaN"), amount("100.00"),
    ])).toEqual({ total: "100.00", citas: 4, sinValor: 3 });
  });

  it("reports invalid package snapshots without aborting the remaining total", () => {
    expect(aggregateCitasBillingSummary([
      { valorAplicado: null, packageSnapshot: { totalPrice: "40000.00", sessions: 0 }, legacyValue: null },
      amount("51000.25"),
    ])).toEqual({ total: "51000.25", citas: 2, sinValor: 1 });
  });

  it("handles a large complete dataset and amounts beyond float precision", () => {
    const appointments = Array.from({ length: 10001 }, () => amount("0.01"));
    appointments.push(amount("9007199254740993.99"));
    expect(aggregateCitasBillingSummary(appointments))
      .toEqual({ total: "9007199254741094.00", citas: 10002, sinValor: 0 });
  });

  it("returns a complete zero summary for no appointments", () => {
    expect(aggregateCitasBillingSummary([])).toEqual({ total: "0.00", citas: 0, sinValor: 0 });
  });
});
