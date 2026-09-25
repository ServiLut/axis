import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteCargo, validateReceptionPayment, receptionSummary, type CargoInput, type ReceptionService } from "../lib/recepcion";
import { bookingTimes, rentalQuote } from "../lib/booking";

const id = "00000000-0000-4000-8000-000000000001";
const services: ReceptionService[] = [
  { codigo: "IMPRESION", nombre: "Impresión", unidad: "hoja", precio: "800.00" },
  { codigo: "EXTRA_CORTO", nombre: "1–15", unidad: "adicional", precio: "4000.00" },
  { codigo: "EXTRA_MEDIO", nombre: "16–30", unidad: "adicional", precio: "8000.00" },
  { codigo: "EXTRA_HORA", nombre: "31–60", unidad: "hora", precio: "18900.00" },
];
const input: CargoInput = { solicitudId: id, fecha: "2026-09-25", profesionalId: 20, tipo: "IMPRESION", cantidad: 1, nota: "" };

test("printing multiplies positive integer sheets at the authorized 800 pesos rate", () => {
  for (const [quantity, total] of [[1, "800.00"], [2, "1600.00"], [3, "2400.00"], [10, "8000.00"]] as const) {
    assert.equal(quoteCargo({ ...input, cantidad: quantity }, services, input.fecha).total, total);
  }
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 10001]) assert.throws(() => quoteCargo({ ...input, cantidad: quantity }, services, input.fecha));
});
test("overtime uses the latest 15/30 minute rule, not the superseded hour-at-15 policy", () => {
  for (const [minutes, expected] of [[1, "4000.00"], [14, "4000.00"], [15, "4000.00"], [16, "8000.00"], [30, "8000.00"], [31, "18900.00"], [60, "18900.00"]] as const) {
    const quote = quoteCargo({ ...input, tipo: "TIEMPO_EXTRA", citaId: "1", minutosExtra: minutes, nota: "Salida validada por recepción" }, services, input.fecha);
    assert.equal(quote.total, expected); assert.equal(quote.cantidad, 1);
  }
  for (const minutes of [0, -1, 1.5, 61, Infinity]) assert.throws(() => quoteCargo({ ...input, tipo: "TIEMPO_EXTRA", citaId: "1", minutosExtra: minutes, nota: "Revisado" }, services, input.fecha));
  assert.throws(() => quoteCargo({ ...input, tipo: "TIEMPO_EXTRA", minutosExtra: 1 }, services, input.fecha));
  assert.throws(() => quoteCargo({ ...input, tipo: "TIEMPO_EXTRA", citaId: "1", minutosExtra: 31, nota: "Revisado" }, services.filter((s) => s.codigo !== "EXTRA_HORA"), input.fecha));
});
test("payment allocations add exactly and reject duplicate charges, invalid dates and missing references", () => {
  const payment = { solicitudId: id, fecha: input.fecha, metodoPago: "EFECTIVO" as const, referencia: "REC-001", aplicaciones: [{ cargoId: "1", monto: "0.10" }, { cargoId: "2", monto: "0.20" }] };
  assert.equal(validateReceptionPayment(payment, input.fecha).total, "0.30");
  assert.throws(() => validateReceptionPayment({ ...payment, aplicaciones: [payment.aplicaciones[0], payment.aplicaciones[0]] }, input.fecha));
  assert.throws(() => validateReceptionPayment({ ...payment, referencia: "" }, input.fecha));
  assert.throws(() => validateReceptionPayment({ ...payment, fecha: "2026-02-30" }, input.fecha));
  assert.throws(() => validateReceptionPayment({ ...payment, fecha: "2026-09-26" }, input.fecha));
  assert.deepEqual(receptionSummary([]), { ventas: 0, aplicado: 0, pendiente: 0 });
});
test("rental booking reserves the courtesy period and uses the catalog rate", () => {
  assert.deepEqual(rentalQuote(55, "18900.00"), { hours: 1, minutes: 60, amount: 18900 });
  assert.equal(rentalQuote(60, "20000.00").amount, 20000);
  assert.equal(rentalQuote(115, "18900.00").amount, 37800);
  assert.equal(rentalQuote(120, "18900.00").amount, 37800);
  for (const minutes of [0, -5, 30, 61, 75, 90]) assert.throws(() => rentalQuote(minutes, "18900.00"));
  assert.equal(bookingTimes("2026-09-25", "10:00", "11:00").inicio.toISOString(), "2026-09-25T15:00:00.000Z");
  for (const date of ["2026-02-30", "bad"]) assert.throws(() => bookingTimes(date, "10:00", "11:00"));
  assert.throws(() => bookingTimes(input.fecha, "11:00", "10:00"));
});
