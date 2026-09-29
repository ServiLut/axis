import { bogotaToday, getBogotaDayRange } from "./bogota-date";
import { CAJA_METHODS, paymentInputInCents, type CajaMethod } from "./caja";

export type PagoServicioInput = {
  origen: "CITA" | "PAQUETE";
  origenId: string;
  fecha: string;
  solicitudId: string;
  confirmado: boolean;
  historicoRevisado?: boolean;
  lineas: { metodoPago: CajaMethod; monto: string; referencia: string }[];
};

export function validatePagoServicio(input: PagoServicioInput, today = bogotaToday()) {
  if (input.origen !== "CITA" && input.origen !== "PAQUETE") throw new Error("Tipo de servicio inválido.");
  if (!/^[1-9]\d{0,17}$/.test(input.origenId)) throw new Error("Selecciona una cita o un paquete válido.");
  if (input.confirmado !== true) throw new Error("Marca la confirmación de dinero recibido y verifica que este pago no esté registrado antes.");
  getBogotaDayRange(input.fecha);
  if (input.fecha > today) throw new Error("La fecha de cobro no puede ser futura.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.solicitudId))
    throw new Error("Identificador de operación inválido.");
  if (!Array.isArray(input.lineas) || input.lineas.length < 1 || input.lineas.length > 4)
    throw new Error("Indica entre uno y cuatro medios de pago.");
  const lineas = input.lineas.map((linea) => {
    if (!CAJA_METHODS.includes(linea.metodoPago)) throw new Error("Medio de pago inválido.");
    const montoCentavos = paymentInputInCents(linea.monto);
    const referencia = linea.referencia.trim();
    if (referencia.length > 120) throw new Error("Referencia demasiado larga.");
    return { metodoPago: linea.metodoPago, monto: (montoCentavos / 100).toFixed(2), montoCentavos, referencia };
  });
  const totalCentavos = lineas.reduce((sum, line) => sum + line.montoCentavos, 0);
  if (!Number.isSafeInteger(totalCentavos)) throw new Error("El total es demasiado alto.");
  return { ...input, lineas, totalCentavos };
}

export function paymentBalanceError(receivedCents: number, remainingCents: number): string {
  const format = (cents: number) => new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(cents / 100);
  return `Ingresaste ${format(receivedCents)}, pero el saldo por registrar es ${format(remainingCents)}. ` +
    `La diferencia es ${format(receivedCents - remainingCents)}. Comprueba el valor del servicio y los pagos ya registrados antes de guardar.`;
}
