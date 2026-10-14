const bogotaCalendar = new Intl.DateTimeFormat("en", {
  timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
});

function localDate(date: Date) {
  if (!Number.isFinite(date.getTime())) return null;
  const parts = bogotaCalendar.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

// January belongs to the season that started the preceding December.
export function getChristmasSeasonYear(date = new Date()): number | null {
  const local = localDate(date);
  if (!local) return null;
  if (local.month === 12) return local.year;
  if (local.month === 1 && local.day <= 10) return local.year - 1;
  return null;
}

export function getNextChristmasBoundary(date = new Date()): number | null {
  const local = localDate(date);
  if (!local) return null;
  const season = getChristmasSeasonYear(date);
  // Bogota is UTC-05:00; January 11 at midnight is the exclusive end.
  return Date.parse(season === null
    ? `${local.year}-12-01T00:00:00-05:00`
    : `${season + 1}-01-11T00:00:00-05:00`);
}
