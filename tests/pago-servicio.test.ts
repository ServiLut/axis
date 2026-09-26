import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePagoServicio, type PagoServicioInput } from "../lib/pago-servicio";

const base: PagoServicioInput = { origen: "CITA", origenId: "1", fecha: "2026-09-25",
  solicitudId: "12345678-1234-4234-8234-123456789abc", confirmado: true, lineas: [
    { metodoPago: "EFECTIVO", monto: "20000", referencia: "" },
    { metodoPago: "TRANSFERENCIA", monto: "30000.50", referencia: "Banco 123" },
  ] };

test("un cobro dividido conserva los centavos y exige referencia bancaria", () => {
  const result = validatePagoServicio(base, "2026-09-26");
  assert.equal(result.totalCentavos, 5000050);
  assert.deepEqual(result.lineas.map((line) => line.monto), ["20000.00", "30000.50"]);
  assert.throws(() => validatePagoServicio({ ...base, lineas: [{ ...base.lineas[1], referencia: " " }] }, "2026-09-26"));
  assert.throws(() => validatePagoServicio({ ...base, lineas: [{ ...base.lineas[0], monto: "-20" }] }, "2026-09-26"));
  assert.throws(() => validatePagoServicio({ ...base, fecha: "2026-09-27" }, "2026-09-26"));
  assert.throws(() => validatePagoServicio({ ...base, confirmado: false }, "2026-09-26"));
});
