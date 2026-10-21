// Pure calendar projection mirrored from the Tenaxis API. No I/O or model.
// Reviewed TypeScript SHA-256: 706a9940368ded382821d7055f6e6c1e7ea0c45e72eec7c1ab57e33435605f50
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
/** Conversational calendar, always anchored to the original Bogotá message. */
export function mariaNaturalRequestedTiming(preference, sourceAt) {
    const empty = { fechaSolicitada: null, horaSolicitada: null, horarioSolicitado: preference?.trim() ? preference : null };
    if (!preference || preference.length > 500 || !sourceAt || !Number.isFinite(Date.parse(sourceAt)))
        return empty;
    let text = normalized(preference);
    if (/[?¿"“”«»<>]|https?:|\b(?:o|entre|hasta|no|nunca|tampoco|antes|despues|desde|si|quizas|dijo|dice|segun|tal vez)\b/.test(text))
        return empty;
    const local = new Date(Date.parse(sourceAt) - 5 * 3600000), today = calendar(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
    if (!today)
        return empty;
    // A two digit written year belongs to this century, not to the server date.
    text = text.replace(/\b(\d{1,2}[/.]\d{1,2})[/.](\d{2})\b/g, (_m, date, year) => date + '/' + (2000 + Number(year)));
    const nextWeek = new RegExp(`\\b(?:(?:el|este|proximo)\\s+)?(${weekdays.join('|')})\\s+(?:de\\s+)?(?:la\\s+)?(?:proxima|otra|siguiente)\\s+semana\\b|\\b(${weekdays.join('|')})\\s+(?:de\\s+)?la\\s+semana\\s+que\\s+viene\\b`, 'g');
    text = text.replace(nextWeek, (_m, a, b) => {
        const weekday = weekdays.indexOf(a || b), monday = today.getTime() - ((today.getUTCDay() + 6) % 7) * dayMs;
        const target = new Date(monday + (7 + (weekday + 6) % 7) * dayMs);
        return `${target.getUTCDate()}/${target.getUTCMonth() + 1}/${target.getUTCFullYear()}`;
    });
    if (/\bsemana\b/.test(text))
        return empty; // A week without a day is not a booking.
    const wordHours = { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
    text = text.replace(/\b(una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(?:de|en|por)\s+la\s+(manana|tarde|noche|madrugada)\b/g, (_m, h, period) => wordHours[h] + ' ' + (period === 'manana' || period === 'madrugada' ? 'am' : 'pm'));
    text = text.replace(/\b(\d{1,2})(?::(\d{2}))?\s+(?:de|en|por)\s+la\s+(manana|tarde|noche|madrugada)\b/g, (_m, h, m, period) => h + (m ? ':' + m : '') + ' ' + (period === 'manana' || period === 'madrugada' ? 'am' : 'pm'));
    text = text.replace(/\b(?:a(?:l| las?)?\s+)?mediodia\b/g, '12 pm').replace(/\b(?:a(?: la| las?)?\s+)?medianoche\b/g, '12 am');
    // Plain weekday on the current day can mean today; the future-time check is
    // still applied below and the absolute interpretation is shown to the client.
    text = text.replace(new RegExp(`\\b(?:el\\s+)?(${weekdays[today.getUTCDay()]})\\b`, 'g'), (m) => /\b(?:este|proximo)\s*$/.test(text.slice(0, text.indexOf(m))) ? m : 'hoy');
    let parsed = mariaRequestedTiming(text, sourceAt);
    if (parsed.fechaSolicitada && !parsed.horaSolicitada) {
        const bare = /\ba las?\s+(\d{1,2})(?![\d:]|\s*[ap]\.?\s*m)(?:\s*(?:por favor|gracias|muchas gracias))?[.! ]*$/i.exec(text);
        if (bare) {
            const clock = mariaContextualHour(bare[1], sourceAt, parsed.fechaSolicitada.toISOString().slice(0, 10));
            if (clock) {
                text = text.slice(0, bare.index) + 'a las ' + clock + ' horas';
                parsed = mariaRequestedTiming(text, sourceAt);
            }
        }
    }
    return { ...parsed, horarioSolicitado: preference };
}
/** Infer only a single possible future clock, never an invented work schedule. */
export function mariaContextualHour(text, sourceAt, requestedDate) {
    const match = /^(?:a las?\s+)?(\d{1,2})[.! ]*$/.exec(normalized(text));
    if (!match || !/^\d{4}-\d\d-\d\d$/.test(requestedDate) || !Number.isFinite(Date.parse(sourceAt)))
        return null;
    const h = Number(match[1]);
    if (h > 23)
        return null;
    const hours = h === 0 || h > 12 ? [h] : h === 12 ? [0, 12] : [h, h + 12];
    const possible = hours.filter(hour => Date.parse(requestedDate + 'T' + String(hour).padStart(2, '0') + ':00:00-05:00') >= Date.parse(sourceAt));
    return possible.length === 1 ? String(possible[0]).padStart(2, '0') + ':00' : null;
}
