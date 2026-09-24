export function bogotaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function getBogotaDayRange(date = bogotaToday()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida");
  const calendarDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) {
    throw new Error("Fecha inválida");
  }
  const start = new Date(`${date}T00:00:00-05:00`);
  return { date, start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
