import assert from "node:assert/strict";
import { test } from "node:test";
import { cajaAmountInCents, summarizeCaja, validateCajaInput, type CajaInput, type CajaMovement } from "../lib/caja";

const base: CajaInput = { fecha: "2026-09-23", tipo: "INGRESO", metodoPago: "EFECTIVO", monto: "100.10", concepto: "Ingreso manual", referencia: "", solicitudId: "12345678-1234-4234-8234-123456789abc" };
const movement = (patch: Partial<CajaInput>): CajaMovement => ({ ...base, ...patch, id: "1", creadoPor: "Usuario de prueba", createdAt: "2026-09-24T12:00:00Z" });

test("cash totals are exact in cents and payment methods stay separate", () => {
  const totals = summarizeCaja([
    movement({ monto: "0.10" }), movement({ monto: "0.20" }),
    movement({ tipo: "EGRESO", monto: "0.15" }),
    movement({ metodoPago: "TRANSFERENCIA", monto: "50000" }),
    movement({ metodoPago: "TARJETA", tipo: "EGRESO", monto: "10000" }),
  ]);
  assert.equal(totals.methods.find((m) => m.metodoPago === "EFECTIVO")?.neto, 15);
  assert.equal(totals.ingresos, 5000030);
  assert.equal(totals.egresos, 1000015);
  assert.equal(totals.neto, 4000015);
  assert.equal(summarizeCaja([]).neto, 0);
});

test("cash validates amount, type, payment method, date and request ID before writing", () => {
  for (const amount of ["0", "-1", "NaN", "1e3", "12.345", "1,000", "1000000000", "Infinity", ""]) {
    assert.throws(() => cajaAmountInCents(amount));
  }
  assert.equal(cajaAmountInCents("999999999.99"), 99999999999);
  assert.equal(validateCajaInput({ ...base, concepto: "  Papelería  ", monto: "15.5" }, "2026-09-24").monto, "15.50");
  for (const patch of [
    { fecha: "2026-09-25" }, { fecha: "2026-02-30" }, { tipo: "AJUSTE" },
    { metodoPago: "INVALIDO" }, { concepto: "  " }, { referencia: "a".repeat(121) },
    { solicitudId: "malformed" },
  ]) {
    assert.throws(() => validateCajaInput({ ...base, ...patch } as CajaInput, "2026-09-24"));
  }
});
