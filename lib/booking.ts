import { getBogotaDayRange } from "./bogota-date";
import { cajaAmountInCents } from "./caja";

export function bookingTimes(date: string, start: string, end: string) {
  const day = getBogotaDayRange(date);
  if (![start, end].every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error("Indica horas válidas de inicio y fin.");
  const inicio = new Date(`${date}T${start}:00-05:00`), fin = new Date(`${date}T${end}:00-05:00`);
  if (fin <= inicio) throw new Error("La hora de fin debe ser posterior al inicio, dentro del mismo día.");
  return { fecha: day.start, inicio, fin };
}
export function rentalQuote(minutes: number, hourlyPrice: string) {
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) throw new Error("Duración de reserva inválida.");
  // A 55-minute session still reserves the 5-minute courtesy period.
  if (minutes % 60 !== 0 && minutes % 60 !== 55) throw new Error("Reserva horas completas (55 minutos y 5 de cortesía). Registra el exceso real en Recepción, como adicional.");
  const hours = Math.ceil(minutes / 60);
  const cents = cajaAmountInCents(hourlyPrice) * hours;
  if (!Number.isSafeInteger(cents) || cents > 99999999999) throw new Error("El valor supera el máximo permitido.");
  return { hours, minutes: hours * 60, amount: cents / 100 };
}
