// Pure calendar projection mirrored from the Tenaxis API. No I/O or model.
// Reviewed TypeScript SHA-256: f2654a49e6e552f535326fa483a6fff828c261892f6d404d3f122b4285ed8cf6
// Pure mirror of the runtime projection. The originals remain immutable.
import { mariaNaturalRequestedTiming as mariaRequestedTiming, mariaContextualHour } from './maria-requested-timing.mjs';
const MARIA_CLIENT_SCHEDULE_GUARD='own-confirmed-client-time-without-technician-v1';
export const MARIA_PREFERENCE_PARTS_GUARD = 'own-client-requested-date-and-time-native-parts-v1';
const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const uncertain = /[?¿"“”«»<>]|https?:|www\.|\b(?:no|nunca|tampoco|quizas|tal vez|si|cuando|entre|hasta|antes|despues|desde|dijo|dice|dijeron|segun|tercero|vecin[oa]|refuerzo|garantia|reprogram\w*|cancel\w*)\b/;
function ownSource(source) {
    if (!source || typeof source.id !== 'string' || !/^[-A-Za-z0-9_:.]{1,160}$/.test(source.id) ||
        typeof source.text !== 'string' || !source.text.trim() || source.text.length > 8000 ||
        typeof source.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(source.at) ||
        !Number.isFinite(Date.parse(source.at)) || !/^57\d{10}$/.test(source.phone ?? '') ||
        !/^57\d{10}$/.test(source.line ?? '') || source.fromMe !== false || source.forwarded !== false)
        return false;
    const at = new Date(source.at);
    return at.toISOString().slice(0, 19) === source.at.slice(0, 19) && !uncertain.test(normalize(source.text));
}
/** A complete standalone clock; no range, condition or relayed statement. */
export function nativePreferenceTime(text, sourceAt, requestedDate) {
    if (typeof text !== 'string' || text.length > 8000 || uncertain.test(normalize(text)))
        return null;
    if (sourceAt) {
        const full = mariaRequestedTiming(text, sourceAt);
        if (full.fechaSolicitada && full.horaSolicitada)
            return full.horaSolicitada;
    }
    if (sourceAt && requestedDate) {
        const inferred = mariaContextualHour(text, sourceAt, requestedDate);
        if (inferred)
            return inferred;
    }
    let value = normalize(text).replace(/[.!¡,;]+$/g, '').trim();
    value = value.replace(/^(?:(?:la )?hora(?: correcta| solicitada)?|horario)\s*(?::|=|es\b)\s*/, '');
    value = value.replace(/^(?:mejor|mas bien|lo necesito|lo quiero|me sirve|prefiero|que sea)\s+/, '');
    value = value.replace(/^(?:a las?|las?)\s+/, '');
    // A whole direct phrase with an explicit meridian, never a narrated clock.
    // "12 de la mañana/tarde" needs clarification; retain exact 12 am/pm below.
    const wordHours = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
    let match = /^(\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?::(\d{2}))?\s+de la (manana|tarde)$/.exec(value);
    if (match) {
        const h = wordHours[match[1]] ?? +match[1], m = +(match[2] ?? 0);
        if (h < 1 || h > 11 || m > 59 || (match[2] && !/^\d/.test(match[1])))
            return null;
        return String(h + (match[3] === 'tarde' ? 12 : 0)).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/.exec(value);
    if (match) {
        const h = +match[1], m = +(match[2] ?? 0);
        if (h < 1 || h > 12 || m > 59)
            return null;
        return String(h % 12 + (match[3] === 'p' ? 12 : 0)).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    match = /^(\d{1,2}):(\d{2})(?:\s*(?:h|horas|hrs))?$/.exec(value);
    if (match) {
        if (+match[1] > 23 || +match[2] > 59)
            return null;
        return match[1].padStart(2, '0') + ':' + match[2];
    }
    match = /^(\d{1,2})\s*(?:h|horas|hrs)$/.exec(value);
    return match && +match[1] <= 23 ? match[1].padStart(2, '0') + ':00' : null;
}
export function nativePreferenceDate(text, sourceAt) {
    if (typeof text !== 'string' || uncertain.test(normalize(text)))
        return null;
    const value = normalize(text);
    const parsed = mariaRequestedTiming(text, sourceAt);
    return parsed.fechaSolicitada ? parsed.fechaSolicitada.toISOString().slice(0, 10) : null;
}
export function projectNativePreferenceParts(parts, acceptedAt) {
    const failure = { complete: false, missing: 'parts' };
    if (parts?.guard !== MARIA_PREFERENCE_PARTS_GUARD || !ownSource(parts.date) || !ownSource(parts.time) ||
        parts.date.id === parts.time.id || parts.date.phone !== parts.time.phone || parts.date.line !== parts.time.line)
        return failure;
    const requestedDate = nativePreferenceDate(parts.date.text, parts.date.at), requestedTime = nativePreferenceTime(parts.time.text, parts.time.at, requestedDate ?? undefined);
    if (!requestedDate)
        return { complete: false, missing: 'date' };
    if (!requestedTime)
        return { complete: false, missing: 'time' };
    const dayText = normalize(parts.date.text), period = dayText.match(/\b(?:en|por|de) la (manana|tarde|noche|madrugada)\b/)?.[1], bareClock = dayText.match(/\ba las? (\d{1,2})(?![\d:]|\s*[ap]\.?\s*m)\b/)?.[1];
    const inferredHour = Number(requestedTime.slice(0, 2));
    if (period && ((period === 'manana' || period === 'madrugada') ? inferredHour >= 12 : inferredHour < 12) || bareClock && Number(bareClock) % 12 !== inferredHour % 12)
        return { complete: false, missing: 'time' };
    if (mariaRequestedTiming(parts.date.text, parts.date.at).horaSolicitada && Date.parse(parts.time.at) < Date.parse(parts.date.at))
        return failure;
    if (mariaRequestedTiming(parts.time.text, parts.time.at).fechaSolicitada && Date.parse(parts.date.at) < Date.parse(parts.time.at))
        return failure;
    const accepted = Date.parse(acceptedAt ?? ''), visitAt = requestedDate + 'T05:00:00.000Z', startAt = new Date(requestedDate + 'T' + requestedTime + ':00.000-05:00').toISOString();
    if (!Number.isFinite(accepted) || Date.parse(parts.date.at) > accepted || Date.parse(parts.time.at) > accepted ||
        Date.parse(startAt) < accepted)
        return { complete: false, missing: 'future-time' };
    const [year, month, day] = requestedDate.split('-'), [hour, minute] = requestedTime.split(':');
    const preferenceLiteral = day + '/' + month + '/' + year + ' a las ' + ((+hour % 12) || 12) + ':' + minute + ' ' + (+hour < 12 ? 'a. m.' : 'p. m.');
    return { complete: true, guard: MARIA_CLIENT_SCHEDULE_GUARD, requestedDate, requestedTime, visitAt, startAt,
        endAt: null, technicianId: null, preferenceLiteral,
        preferenceParts: { guard: MARIA_PREFERENCE_PARTS_GUARD,
            date: { id: parts.date.id, at: parts.date.at }, time: { id: parts.time.id, at: parts.time.at } } };
}
