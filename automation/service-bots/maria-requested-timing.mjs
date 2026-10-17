// Pure calendar projection mirrored from the Tenaxis API. No I/O or model.
// Reviewed TypeScript SHA-256: 9231eddce04075e92d97ac2e14e9e891eb938014b2020acf228d89c89eaf814a
const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
];
const weekdays = [
    'domingo',
    'lunes',
    'martes',
    'miercoles',
    'jueves',
    'viernes',
    'sabado',
];
const dayMs = 86400000;
const normalized = (text) => text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
function calendar(year, month, day) {
    if (year < 1900 ||
        year > 9999 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31)
        return null;
    const value = new Date(Date.UTC(year, month - 1, day));
    return value.getUTCFullYear() === year &&
        value.getUTCMonth() === month - 1 &&
        value.getUTCDate() === day
        ? value
        : null;
}
/**
 * Pure projection of ALREADY verified preference/source fields. Its caller must
 * retain the ordinary/native source and acceptance checks. The origin is the
 * source event, never the server clock. DATE is stored as UTC midnight solely
 * to represent a calendar day; it is not a UTC or Bogotá appointment instant.
 */
export function mariaRequestedTiming(preference, sourceAt) {
    const result = {
        fechaSolicitada: null,
        horaSolicitada: null,
        horarioSolicitado: preference?.trim() ? preference : null,
    };
    if (!result.horarioSolicitado ||
        result.horarioSolicitado.length > 500 ||
        typeof sourceAt !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(sourceAt))
        return result;
    const origin = new Date(sourceAt);
    if (!Number.isFinite(origin.getTime()) ||
        origin.toISOString().slice(0, 19) !== sourceAt.slice(0, 19))
        return result;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(origin);
    const part = (kind) => Number(parts.find((p) => p.type === kind)?.value);
    const today = calendar(part('year'), part('month'), part('day'));
    if (!today)
        return result;
    const text = normalized(result.horarioSolicitado);
    // Alternatives and ranges cannot be collapsed into a single requested slot.
    if (/\b(?:o|entre|hasta|semana|no|tampoco|antes|despues|desde|si|podria|podrian|quizas|tal\s+vez)\b/.test(text))
        return result;
    // Consume complete numeric date tokens; a partial/malformed year cannot be
    // ignored while accepting its day/month prefix with the event's year.
    if ([...text.matchAll(/\b\d+(?:[/.]\d+)+\b/g)].some(([token]) => !/^\d{1,2}[/.]\d{1,2}(?:[/.]\d{4})?$/.test(token)))
        return result;
    const dates = [];
    let invalid = false;
    let remaining = text;
    const add = (year, month, day) => {
        const date = calendar(year, month, day);
        if (date)
            dates.push(date);
        else
            invalid = true;
        return ' ';
    };
    remaining = remaining.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (_all, y, m, d) => add(+y, +m, +d));
    remaining = remaining.replace(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?\b/g, (_all, d, m, y) => add(y ? +y : part('year'), +m, +d));
    const monthPattern = months.join('|') + '|setiembre';
    remaining = remaining.replace(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${monthPattern})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`, 'g'), (_all, d, m, y, offset) => {
        const tail = remaining.slice(offset + _all.length);
        const suffix = /^\s+(?:de\s+)?(\d+)\b/.exec(tail);
        if (!y && suffix && !/^\s*(?:[ap]\.?\s*m\.?|:\d{2})\b/.test(tail.slice(suffix[0].length)))
            invalid = true;
        return add(y ? +y : part('year'), m === 'setiembre' ? 9 : months.indexOf(m) + 1, +d);
    });
    if (/\b\d+\s*[-–]\s*\d+\b|\b\d{1,2}(?::\d{2})?\s+(?:a|y)\s+(?:las\s+)?\d{1,2}\b/.test(remaining))
        return result;
    // In "hoy en la mañana", mañana is a time of day, not another day.
    remaining = remaining.replace(/\b(?:en|por|de)\s+la\s+(?:manana|tarde|noche|madrugada)\b/g, ' ');
    remaining = remaining.replace(/\b(pasado\s+manana|hoy|manana)\b/g, (_all, relative) => {
        const delta = relative === 'hoy' ? 0 : relative === 'manana' ? 1 : 2;
        dates.push(new Date(today.getTime() + delta * dayMs));
        return ' ';
    });
    const namedDays = [
        ...remaining.matchAll(new RegExp(`\\b(?:(este|proximo)\\s+)?(${weekdays.join('|')})\\b`, 'g')),
    ];
    if (namedDays.length > 1)
        return result;
    if (dates.length) {
        if (dates.some((date) => date.getTime() !== dates[0].getTime()))
            return result;
        if (namedDays.length &&
            weekdays.indexOf(namedDays[0][2]) !== dates[0].getUTCDay())
            return result;
    }
    else if (namedDays.length) {
        const [, qualifier, name] = namedDays[0];
        let delta = (weekdays.indexOf(name) - today.getUTCDay() + 7) % 7;
        if (qualifier === 'proximo' && delta === 0)
            delta = 7;
        else if (!qualifier && delta === 0)
            return result;
        // "Este lunes" must be in the present Monday-Sunday week, not next week.
        if (qualifier === 'este' &&
            (weekdays.indexOf(name) + 6) % 7 < (today.getUTCDay() + 6) % 7)
            return result;
        dates.push(new Date(today.getTime() + delta * dayMs));
    }
    if (invalid || !dates.length || dates[0] < today)
        return result;
    const times = [];
    remaining = remaining.replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?(?![a-z])/g, (_all, hour, minute, meridiem) => {
        const h = +hour, m = minute ? +minute : 0;
        if (h < 1 || h > 12 || m > 59)
            invalid = true;
        else
            times.push(String((h % 12) + (meridiem === 'p' ? 12 : 0)).padStart(2, '0') +
                ':' +
                String(m).padStart(2, '0'));
        return ' ';
    });
    // A colon denotes a written 24-hour clock; explicit "horas" also works.
    remaining = remaining.replace(/\b(\d{1,2}):(\d{2})(?:\s*(?:h|horas|hrs))?\b/g, (_all, hour, minute) => {
        if (+hour > 23 || +minute > 59)
            invalid = true;
        else
            times.push(hour.padStart(2, '0') + ':' + minute);
        return ' ';
    });
    remaining = remaining.replace(/\b(\d{1,2})\s*(?:h|horas|hrs)\b/g, (_all, hour) => {
        if (+hour > 23)
            invalid = true;
        else
            times.push(hour.padStart(2, '0') + ':00');
        return ' ';
    });
    if (invalid || times.length > 1)
        return result;
    const time = times[0] ?? null;
    if (dates[0].getTime() === today.getTime() && time) {
        const [hour, minute] = time.split(':').map(Number);
        if (hour * 60 + minute < part('hour') * 60 + part('minute'))
            return result;
    }
    result.fechaSolicitada = dates[0];
    result.horaSolicitada = time;
    return result;
}
