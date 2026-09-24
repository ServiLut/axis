import { bogotaToday, getBogotaDayRange } from "./bogota-date";

export const CAJA_METHODS = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"] as const;
export type CajaMethod = typeof CAJA_METHODS[number];
export type CajaType = "INGRESO" | "EGRESO";
export type CajaInput = {
  fecha: string;
  tipo: CajaType;
  metodoPago: CajaMethod;
  monto: string;
  concepto: string;
  referencia: string;
  solicitudId: string;
};
export type CajaMovement = Omit<CajaInput, "solicitudId"> & {
  id: string;
  creadoPor: string;
  createdAt: string;
};

export function cajaAmountInCents(value: string): number {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Ingresa un valor positivo con máximo dos decimales, sin separadores de miles.");
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents <= 0) throw new Error("El valor debe ser mayor que cero.");
  return cents;
}

export function validateCajaInput(input: CajaInput, today = bogotaToday()): CajaInput {
  getBogotaDayRange(input.fecha);
  if (input.fecha > today) throw new Error("El movimiento no puede tener una fecha futura.");
  if (input.tipo !== "INGRESO" && input.tipo !== "EGRESO") throw new Error("Tipo de movimiento inválido.");
  if (!CAJA_METHODS.includes(input.metodoPago)) throw new Error("Medio de pago inválido.");
  const cents = cajaAmountInCents(input.monto);
  const concepto = input.concepto.trim();
  const referencia = input.referencia.trim();
  if (concepto.length < 3 || concepto.length > 240) throw new Error("El concepto debe tener entre 3 y 240 caracteres.");
  if (referencia.length > 120) throw new Error("La referencia no puede superar 120 caracteres.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.solicitudId)) {
    throw new Error("Identificador de registro inválido. Recarga la página.");
  }
  return { ...input, concepto, referencia, monto: (cents / 100).toFixed(2) };
}

export function summarizeCaja(movements: CajaMovement[]) {
  const methods = CAJA_METHODS.map((metodoPago) => ({ metodoPago, ingresos: 0, egresos: 0, neto: 0 }));
  for (const movement of movements) {
    const method = methods.find((m) => m.metodoPago === movement.metodoPago);
    if (!method) throw new Error("Medio de pago desconocido.");
    const cents = cajaAmountInCents(movement.monto);
    if (movement.tipo === "INGRESO") method.ingresos += cents;
    else if (movement.tipo === "EGRESO") method.egresos += cents;
    else throw new Error("Tipo de movimiento desconocido.");
    if (!Number.isSafeInteger(method.ingresos) || !Number.isSafeInteger(method.egresos)) {
      throw new Error("El total excede el rango permitido.");
    }
    method.neto = method.ingresos - method.egresos;
  }
  const ingresos = methods.reduce((total, m) => total + m.ingresos, 0);
  const egresos = methods.reduce((total, m) => total + m.egresos, 0);
  if (!Number.isSafeInteger(ingresos) || !Number.isSafeInteger(egresos)) throw new Error("Total fuera de rango.");
  return { ingresos, egresos, neto: ingresos - egresos, methods };
}
