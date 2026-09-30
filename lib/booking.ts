import { getBogotaDayRange } from "./bogota-date";
import { cajaAmountInCents } from "./caja";

export function bookingTimes(date: string, start: string, end: string) {
  const day = getBogotaDayRange(date);
  if (![start, end].every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error("Indica horas válidas de inicio y fin.");
  const inicio = new Date(`${date}T${start}:00-05:00`), fin = new Date(`${date}T${end}:00-05:00`);
  if (fin <= inicio) throw new Error("La hora de fin debe ser posterior al inicio, dentro del mismo día.");
  return { fecha: day.start, inicio, fin };
}
export function rentalQuote(minutes: number, hourlyPrice: string, additionalAmount?: string | null) {
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) throw new Error("Duración de reserva inválida.");
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  let extra = 0;
  if (remainder) {
    if (additionalAmount == null || additionalAmount.trim() === "") throw new Error("Indica el valor del tiempo adicional antes de confirmar el alquiler.");
    const entered = additionalAmount.trim();
    extra = /^0(?:\.0{1,2})?$/.test(entered) ? 0 : cajaAmountInCents(entered);
  } else if (additionalAmount != null && additionalAmount.trim() !== "" && !/^0(?:\.0{1,2})?$/.test(additionalAmount.trim())) {
    throw new Error("El horario no contiene minutos adicionales; revisa el valor ingresado.");
  }
  const cents = cajaAmountInCents(hourlyPrice) * hours + extra;
  if (!Number.isSafeInteger(cents) || cents > 99999999999) throw new Error("El valor supera el máximo permitido.");
  return { hours, minutes, amount: cents / 100 };
}
