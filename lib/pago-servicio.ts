import { bogotaToday, getBogotaDayRange } from "./bogota-date";
import { CAJA_METHODS, cajaAmountInCents, type CajaMethod } from "./caja";

export type PagoServicioInput = {
  origen: "CITA" | "PAQUETE";
  origenId: string;
  fecha: string;
  solicitudId: string;
  confirmado: boolean;
  lineas: { metodoPago: CajaMethod; monto: string; referencia: string }[];
};

export function validatePagoServicio(input: PagoServicioInput, today = bogotaToday()) {
  if (input.origen !== "CITA" && input.origen !== "PAQUETE") throw new Error("Tipo de servicio inválido.");
  if (!/^[1-9]\d{0,17}$/.test(input.origenId)) throw new Error("Selecciona una cita o un paquete válido.");
  if (input.confirmado !== true) throw new Error("Confirma que recibiste este dinero y que no corresponde a un cobro anterior.");
  getBogotaDayRange(input.fecha);
  if (input.fecha > today) throw new Error("La fecha de cobro no puede ser futura.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.solicitudId))
    throw new Error("Identificador de operación inválido.");
  if (!Array.isArray(input.lineas) || input.lineas.length < 1 || input.lineas.length > 4)
    throw new Error("Indica entre uno y cuatro medios de pago.");
  const lineas = input.lineas.map((linea) => {
    if (!CAJA_METHODS.includes(linea.metodoPago)) throw new Error("Medio de pago inválido.");
    const montoCentavos = cajaAmountInCents(linea.monto);
    const referencia = linea.referencia.trim();
    if (referencia.length > 120) throw new Error("Referencia demasiado larga.");
    if (linea.metodoPago !== "EFECTIVO" && !referencia) throw new Error("Indica la referencia o comprobante del pago no efectivo.");
    return { metodoPago: linea.metodoPago, monto: (montoCentavos / 100).toFixed(2), montoCentavos, referencia };
  });
  const totalCentavos = lineas.reduce((sum, line) => sum + line.montoCentavos, 0);
  if (!Number.isSafeInteger(totalCentavos)) throw new Error("El total es demasiado alto.");
  return { ...input, lineas, totalCentavos };
}
