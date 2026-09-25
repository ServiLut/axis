import { bogotaToday, getBogotaDayRange } from "./bogota-date";
import { CAJA_METHODS, cajaAmountInCents, type CajaMethod } from "./caja";

export const RECEPCION_CODES = ["IMPRESION", "EXTRA_CORTO", "EXTRA_MEDIO", "EXTRA_HORA"] as const;
export type ReceptionCode = typeof RECEPCION_CODES[number];
export type ReceptionService = { codigo: ReceptionCode; nombre: string; precio: string | null; unidad: string };
export type CargoInput = {
  solicitudId: string; fecha: string; profesionalId: number; citaId?: string;
  tipo: "IMPRESION" | "TIEMPO_EXTRA"; cantidad: number; minutosExtra?: number; nota: string;
};
export type PagoInput = {
  solicitudId: string; fecha: string; metodoPago: CajaMethod; referencia: string;
  aplicaciones: { cargoId: string; monto: string }[];
};
export type CargoRow = {
  id: string; fecha: string; profesionalId: number; profesional: string; citaId: string | null;
  codigo: ReceptionCode; concepto: string; cantidad: number; precioUnitario: string; total: string;
  minutosExtra: number | null; nota: string; anulado: boolean; pagado: string;
};
export type PagoRow = { id: string; fecha: string; monto: string; metodoPago: string; referencia: string; reversado: boolean; cargos: string };

export function requireRequestId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Identificador de operación inválido.");
  return value.toLowerCase();
}
export function requireId(value: string) {
  if (!/^[1-9]\d{0,17}$/.test(value)) throw new Error("Identificador inválido.");
  return value;
}
export function requireOperationDate(value: string, today = bogotaToday()) {
  getBogotaDayRange(value);
  if (value > today) throw new Error("No se pueden registrar operaciones futuras.");
  return value;
}
export function requireReason(value: string) {
  const reason = value.trim();
  if (reason.length < 5 || reason.length > 240) throw new Error("Indica un motivo de 5 a 240 caracteres.");
  return reason;
}
export const pesos = (cents: number) => {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 99999999999) throw new Error("Importe fuera de rango.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
};
export function quoteCargo(input: CargoInput, services: ReceptionService[], today = bogotaToday()) {
  const solicitudId = requireRequestId(input.solicitudId);
  const fecha = requireOperationDate(input.fecha, today);
  if (!Number.isSafeInteger(input.profesionalId) || input.profesionalId < 1) throw new Error("Selecciona un profesional registrado.");
  const citaId = input.citaId ? requireId(input.citaId) : null;
  const nota = input.nota.trim();
  if (nota.length > 240) throw new Error("La observación no puede superar 240 caracteres.");
  let codigo: ReceptionCode;
  let cantidad: number;
  let minutosExtra: number | null = null;
  if (input.tipo === "IMPRESION") {
    if (!Number.isSafeInteger(input.cantidad) || input.cantidad < 1 || input.cantidad > 10000) throw new Error("Ingresa de 1 a 10.000 hojas enteras.");
    codigo = "IMPRESION";
    cantidad = input.cantidad;
  } else if (input.tipo === "TIEMPO_EXTRA") {
    if (!citaId) throw new Error("El tiempo extra debe estar vinculado a una reserva.");
    const minutes = input.minutosExtra;
    if (!Number.isSafeInteger(minutes) || !minutes || minutes < 1 || minutes > 2147483647) throw new Error("Registra los minutos de exceso como un número entero positivo válido.");
    codigo = minutes <= 15 ? "EXTRA_CORTO" : minutes <= 30 ? "EXTRA_MEDIO" : "EXTRA_HORA";
    cantidad = 1;
    minutosExtra = minutes;
    if (nota.length < 5) throw new Error("Indica cómo verificaste la hora de entrega del consultorio.");
  } else throw new Error("Servicio inválido.");
  const service = services.find((item) => item.codigo === codigo);
  if (!service?.precio) throw new Error("La tarifa de este adicional está pendiente de confirmación por administración.");
  const unit = cajaAmountInCents(service.precio);
  const total = pesos(unit * cantidad);
  return { solicitudId, fecha, profesionalId: input.profesionalId, citaId, codigo, cantidad, minutosExtra,
    nota, concepto: service.nombre, precioUnitario: pesos(unit), total };
}
export function validateReceptionPayment(input: PagoInput, today = bogotaToday()) {
  const solicitudId = requireRequestId(input.solicitudId);
  const fecha = requireOperationDate(input.fecha, today);
  if (!CAJA_METHODS.includes(input.metodoPago)) throw new Error("Medio de pago inválido.");
  const referencia = input.referencia.trim();
  if (referencia.length < 3 || referencia.length > 120) throw new Error("Indica el recibo o referencia del pago, de 3 a 120 caracteres.");
  if (!Array.isArray(input.aplicaciones) || input.aplicaciones.length < 1 || input.aplicaciones.length > 50) throw new Error("Selecciona de 1 a 50 cargos del mismo profesional.");
  const aplicaciones = input.aplicaciones.map((item) => ({ cargoId: requireId(item.cargoId), monto: pesos(cajaAmountInCents(item.monto)) }))
    .sort((a, b) => BigInt(a.cargoId) < BigInt(b.cargoId) ? -1 : 1);
  if (new Set(aplicaciones.map((item) => item.cargoId)).size !== aplicaciones.length) throw new Error("Un cargo no puede aparecer dos veces en el mismo pago.");
  const total = pesos(aplicaciones.reduce((sum, item) => sum + cajaAmountInCents(item.monto), 0));
  return { solicitudId, fecha, metodoPago: input.metodoPago, referencia, aplicaciones, total };
}
export function receptionSummary(cargos: CargoRow[]) {
  let ventas = 0, aplicado = 0;
  for (const cargo of cargos.filter((item) => !item.anulado)) {
    ventas += cajaAmountInCents(cargo.total);
    aplicado += cargo.pagado === "0.00" || Number(cargo.pagado) === 0 ? 0 : cajaAmountInCents(cargo.pagado);
  }
  pesos(ventas); pesos(aplicado);
  if (aplicado > ventas) throw new Error("Existen aplicaciones superiores a los cargos.");
  return { ventas, aplicado, pendiente: ventas - aplicado };
}
