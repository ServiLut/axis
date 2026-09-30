import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePaymentBalance, validatePagoServicio, type PagoServicioInput } from "../lib/pago-servicio";

const base: PagoServicioInput = { origen: "CITA", origenId: "1", fecha: "2026-09-25",
  solicitudId: "12345678-1234-4234-8234-123456789abc", confirmado: true, lineas: [
    { metodoPago: "EFECTIVO", monto: "20000", referencia: "" },
    { metodoPago: "TRANSFERENCIA", monto: "30000.50", referencia: "Banco 123" },
  ] };

test("valores mayores cubren el saldo y valores menores requieren reconocer el abono", () => {
  assert.deepEqual(validatePaymentBalance(3780000, 1890000), { saldoCentavos: 0, adicionalCentavos: 1890000 });
  assert.deepEqual(validatePaymentBalance(2840000, 2835000), { saldoCentavos: 0, adicionalCentavos: 5000 });
  assert.deepEqual(validatePaymentBalance(1890000, 1890000), { saldoCentavos: 0, adicionalCentavos: 0 });
  assert.throws(() => validatePaymentBalance(1889900, 1890000), /abono/);
  assert.deepEqual(validatePaymentBalance(1889900, 1890000, true), { saldoCentavos: 100, adicionalCentavos: 0 });
  assert.throws(() => validatePaymentBalance(100, 0, true), /ya tiene/);
  assert.throws(() => validatePaymentBalance(100, -100, true), /ya tiene/);
});

test("un cobro dividido conserva los centavos y admite referencia opcional", () => {
  const result = validatePagoServicio(base, "2026-09-26");
  assert.equal(result.totalCentavos, 5000050);
  assert.deepEqual(result.lineas.map((line) => line.monto), ["20000.00", "30000.50"]);
  for(const metodoPago of ["EFECTIVO","TRANSFERENCIA","TARJETA","OTRO"] as const) {
    const empty=validatePagoServicio({ ...base, historicoRevisado:true, lineas: [{ ...base.lineas[1],metodoPago,referencia: " " }] }, "2026-09-26");
    assert.equal(empty.lineas[0].referencia, "");assert.equal(empty.totalCentavos,3000050);
  }
  assert.throws(() => validatePagoServicio({ ...base, lineas: [{ ...base.lineas[0], monto: "-20" }] }, "2026-09-26"));
  assert.throws(() => validatePagoServicio({ ...base, fecha: "2026-09-27" }, "2026-09-26"));
  assert.throws(() => validatePagoServicio({ ...base, confirmado: false }, "2026-09-26"));
});

test("el pago interpreta miles colombianos y conserva decimales sin cambiar su escala", () => {
  for (const [entered, saved] of [
    ["28.400", "28400.00"], ["28400", "28400.00"], [" 28.400 ", "28400.00"],
    ["28.400,50", "28400.50"], ["28400,5", "28400.50"], ["28400.50", "28400.50"],
    ["1.000.000", "1000000.00"], ["999.999.999,99", "999999999.99"],
    ["0,01", "0.01"], ["0.10", "0.10"], ["28.40", "28.40"],
  ]) {
    const result = validatePagoServicio({ ...base, lineas: [{ metodoPago: "TRANSFERENCIA", monto: entered, referencia: "3192463011" }] }, "2026-09-26");
    assert.equal(result.lineas[0].monto, saved, entered);
    assert.equal(result.lineas[0].referencia, "3192463011");
  }
  for (const monto of ["", "0", "-28.400", "28.40.0", "28,400", "28.400,501", "1.2345", "0.100", "1,000.00", "1e3", "$28.400", "1.000.000.000", "28 400"]) {
    assert.throws(() => validatePagoServicio({ ...base, lineas: [{ ...base.lineas[0], monto }] }, "2026-09-26"), monto);
  }
});
