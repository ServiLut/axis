import { bogotaToday, getBogotaDayRange } from "./bogota-date";
import { CAJA_METHODS, paymentInputInCents, type CajaMethod } from "./caja";

export type PagoServicioInput = {
  origen: "CITA" | "PAQUETE";
  origenId: string;
  fecha: string;
  solicitudId: string;
  confirmado: boolean;
  historicoRevisado?: boolean;
  abonoConfirmado?: boolean;
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

export function validatePaymentBalance(receivedCents: number, remainingCents: number, partialConfirmed = false) {
  if (!Number.isSafeInteger(receivedCents) || receivedCents <= 0 || !Number.isSafeInteger(remainingCents))
    throw new Error("No pudimos calcular el pago y su saldo. Revisa los valores ingresados.");
  if (remainingCents <= 0) throw new Error("Este servicio ya tiene el valor completo registrado. No registres otro pago.");
  if (receivedCents < remainingCents && !partialConfirmed)
    throw new Error(paymentBalanceError(receivedCents, remainingCents));
  return { saldoCentavos: Math.max(0, remainingCents - receivedCents),
    adicionalCentavos: Math.max(0, receivedCents - remainingCents) };
}

export function paymentBalanceError(receivedCents: number, remainingCents: number): string {
  const format = (cents: number) => new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(cents / 100);
  return `Ingresaste ${format(receivedCents)} y faltan ${format(remainingCents - receivedCents)} para completar el saldo. ` +
    `Corrige el valor o confirma que estás registrando un abono. El servicio seguirá pendiente de pago.`;
}
