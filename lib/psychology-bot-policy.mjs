/**
 * Deterministic reception policy, v1. Produces proposals, NEVER sends or writes.
 * Context must come from authenticated server state, not customer messages or an LLM.
 * Risk is an upstream triage result; this module is NOT a clinical classifier.
 */
export const POLICY_VERSION = '2026-09-26.2';
// User-confirmed on 26 Sep: Evelin no longer works here. Administrative alerts
// and reports have ONE recipient; conversations cannot override this destination.
export const OPERATIONS_CONTACT = Object.freeze({ name: 'Sandra Milena Duque', phone: '+573016803926' });
const services = {
  '1': 'individual', '2': 'pareja', '3': 'infantil', '4': 'sexologia',
  '5': 'familiar', '6': 'alquiler', '7': 'certificado',
  '8': 'acompanamiento_profesional', '9': 'empresarial',
};
const shortcuts = {
  individual: 'individual', pareja: 'pareja', infantil: 'infantil',
  sexologia: 'sexologia', familiar: 'familiar', alquiler: 'oficina',
  neuropsicologia: 'neuropsicologia',
};
const reply = (action, detail = {}) => ({ version: POLICY_VERSION, action, ...detail });
const human = (reason) => reply('HUMAN_REVIEW', { reason, notify: OPERATIONS_CONTACT });
const inScope = (c) => c?.tenantId === 4 && c?.companyId === 3;

export function professionalsFor(service) {
  if (service === 'neuropsicologia') return ['DANIEL_FELIPE'];
  if (service === 'sexologia') return ['DIANA_MARCELA'];
  if (service === 'certificado') return ['DEICY_ACEVEDO'];
  if (['individual', 'familiar', 'infantil'].includes(service)) return ['DIXON_OBRAIAN', 'DEICY_ACEVEDO'];
  return []; // Pair therapy assignment must be verified; never infer a clinician ID.
}

function templateProposal(shortcut, context, detail = {}) {
  const template = context.templates?.[shortcut];
  if (!template?.approved || typeof template.text !== 'string' || !template.text.trim() || !template.version) {
    return human('QUICK_REPLY_NOT_APPROVED:' + shortcut);
  }
  // Copies the approved text without rewording, interpolating or generating prices.
  return reply('QUICK_REPLY', { shortcut, text: template.text, templateVersion: template.version, ...detail });
}

export function receptionDecision(event, context) {
  if (!inScope(context) || context.channelVerified !== true) return human('UNVERIFIED_SCOPE_OR_CHANNEL');
  if (event?.direction !== 'incoming' || event.private === true) return reply('IGNORE');
  if (!event.id || context.persistedEventStatus === 'processed') return reply('IGNORE');
  if (event.kind === 'audio' && context.transcriptVerified !== true) {
    return reply('TRANSCRIPTION_REVIEW', { nextStage: context.stage, sendPricing: false });
  }
  // Never infer low risk from a keyword blacklist. Unknown triage goes to a person.
  if (context.risk === 'urgent') return reply('URGENT_HANDOFF', {
    continueSales: false,
    notify: OPERATIONS_CONTACT,
    acknowledgeImmediately: true,
    reason: 'Urgent human support and reviewed immediate-safety response; do not wait silently for management.',
  });
  if (context.risk !== 'cleared') return human('TRIAGE_REQUIRED');
  if (context.stage === 'HUMAN') return human('HUMAN_OWNS_CONVERSATION');
  if (event.kind === 'payment_proof') return reply('PAYMENT_EVIDENCE_REVIEW', {
    markPaid: false, nextStage: context.stage, notify: OPERATIONS_CONTACT,
  });
  // Intent is classified upstream and reviewed when ambiguous. It is not trusted for permissions.
  if (context.intent === 'cancel' || context.intent === 'reschedule') return human('CHANGE_REQUIRES_VALIDATED_BOOKING');
  if (context.stage === 'NEW') return reply('GREETING', {
    text: 'Hola 😊 ¿Cómo estás? Hablas con Luisa Fernanda de *Psicólogos en Colombia*. Cuéntame, ¿qué acompañamiento estás buscando?',
    nextStage: 'IDENTIFY_NEED',
  });
  if (context.stage === 'IDENTIFY_NEED' && context.intent === 'show_services') {
    return templateProposal('servicios', context, { nextStage: 'SERVICE_MENU' });
  }
  if (['IDENTIFY_NEED', 'SERVICE_MENU'].includes(context.stage)) {
    const service = context.stage === 'SERVICE_MENU' ? services[event.selection] || context.explicitService : context.explicitService;
    if (!service) return human('SERVICE_UNCLEAR');
    if (service === 'certificado') return human('CERTIFICATE_200000_TEMPLATE_PENDING');
    if (service === 'alquiler' && context.rentalTemplateHours !== '07:00-20:00') return human('RENTAL_HOURS_CONFLICT');
    const shortcut = shortcuts[service];
    if (!shortcut) return human('SERVICE_NEEDS_PERSON');
    return templateProposal(shortcut, context, { service, nextStage: 'OFFER_SENT',
      candidates: professionalsFor(service), followUp: 'Estos son nuestros precios para ' + ({
        individual: 'terapia individual', pareja: 'terapia de pareja', infantil: 'terapia infantil',
        familiar: 'terapia familiar', sexologia: 'sexología', neuropsicologia: 'neuropsicología', alquiler: 'alquiler de consultorio',
      })[service] + '.', paymentDiscussion: false });
  }
  if (context.stage === 'OFFER_SENT') {
    if (context.intent !== 'continue_booking') return human('WAIT_FOR_CUSTOMER_CHOICE');
    if (context.service === 'alquiler') return reply('RENTAL_DETAILS', {
      text: 'Claro 😊 ¿Qué día, a qué hora y por cuánto tiempo necesitas el consultorio?',
      nextStage: 'RENTAL_DETAILS', requireRegisteredProfessional: true, demandPaymentProof: false,
    });
    if (!context.offerEventId || event.id === context.offerEventId) return human('WAIT_FOR_NEW_CUSTOMER_MESSAGE');
    if (!context.paymentPolicyApproved) return human('CONFLICTING_PAYMENT_POLICY');
    return templateProposal('datos', context, {
      introduction: 'Por favor, regálame estos datos 😊', nextStage: 'DATA_REQUESTED',
    });
  }
  if (context.stage === 'DATA_REQUESTED') {
    if (context.customerDataValidated !== true) return human('INCOMPLETE_OR_UNVERIFIED_DATA');
    return reply('CUSTOMER_UPSERT_PROPOSAL', { nextStage: 'PREFERENCES',
      text: '¿Prefieres psicólogo o psicóloga? ¿Qué días y horarios te quedan mejor, y presencial o virtual?',
    });
  }
  if (context.stage === 'PREFERENCES' || context.stage === 'RENTAL_DETAILS') {
    return reply('AVAILABILITY_REVIEW', { nextStage: 'PROFESSIONAL_CONFIRMATION',
      requireRoomCheck: true, requireProfessionalConfirmation: true, promiseAppointment: false,
    });
  }
  if (context.stage === 'PROFESSIONAL_CONFIRMATION') return reply('WAIT_FOR_PROFESSIONAL', { promiseAppointment: false });
  return human('UNKNOWN_OR_AMBIGUOUS_STATE');
}

/** Same calculation as reception; pure integer COP, no writes. */
export function ancillaryCharge({ kind, quantity, normalRentalPrice }) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Invalid quantity');
  if (kind === 'printing') {
    const amount = quantity * 800;
    if (!Number.isSafeInteger(amount)) throw new Error('Invalid total');
    return amount;
  }
  if (kind !== 'overtime') throw new Error('Unknown charge');
  if (quantity === 0) return 0;
  if (quantity <= 15) return 4000;
  if (quantity <= 30) return 8000;
  if (!Number.isSafeInteger(normalRentalPrice) || normalRentalPrice <= 0) throw new Error('Rental price required');
  return normalRentalPrice;
}

/** Validation for a proposed API command; backend MUST recheck under its DB transaction. */
export function bookingProposal(input, context) {
  if (!inScope(context) || context.channelVerified !== true) return human('UNVERIFIED_SCOPE_OR_CHANNEL');
  if (context.risk !== 'cleared' || context.humanHold) return human('HUMAN_REVIEW_REQUIRED');
  if (!input || !['patient', 'rental'].includes(input.kind)) return human('BOOKING_KIND_REQUIRED');
  if (!input.idempotencyKey || !Number.isSafeInteger(input.professionalId) || input.professionalId <= 0) return human('PROFESSIONAL_OR_KEY_REQUIRED');
  if (input.kind === 'patient' && (!Number.isSafeInteger(input.customerId) || input.customerId <= 0 || !input.serviceId)) return human('REGISTERED_CUSTOMER_AND_SERVICE_REQUIRED');
  if (input.kind === 'rental' && (!context.professionalRegistered || !input.roomId)) return human('REGISTERED_PROFESSIONAL_AND_ROOM_REQUIRED');
  if (!['onsite', 'online'].includes(input.modality) || (input.modality === 'onsite' && !input.roomId) || (input.kind === 'rental' && input.modality !== 'onsite')) return human('ROOM_OR_MODALITY_REQUIRED');
  const start = Date.parse(input.start);
  const end = Date.parse(input.end);
  // Explicit timezone prevents host/browser timezone affecting reservations.
  if (![input.start, input.end].every((s) => typeof s === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(s)) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return human('INVALID_TIME');
  const now = Date.parse(context.now);
  if (!Number.isFinite(now) || start <= now) return human('PAST_OR_UNVERIFIED_TIME');
  const localStart = new Date(start - 5 * 3600000);
  const localEnd = new Date(end - 5 * 3600000);
  const startMinute = localStart.getUTCHours() * 60 + localStart.getUTCMinutes();
  const endMinute = localEnd.getUTCHours() * 60 + localEnd.getUTCMinutes();
  if (input.kind === 'rental' && (localStart.toISOString().slice(0, 10) !== localEnd.toISOString().slice(0, 10) || startMinute < 420 || endMinute > 1200 || endMinute <= startMinute || localStart.getUTCSeconds() || localEnd.getUTCSeconds() || localStart.getUTCMilliseconds() || localEnd.getUTCMilliseconds())) return human('OUTSIDE_RENTAL_HOURS');
  const fingerprint = JSON.stringify([input.kind, input.customerId || null, input.serviceId || null, input.professionalId, input.roomId || null, input.modality, start, end]);
  if (context.patientConfirmedFingerprint !== fingerprint || context.professionalConfirmedFingerprint !== fingerprint) return human('EXACT_SLOT_CONFIRMATIONS_REQUIRED');
  if (context.availabilityFingerprint !== fingerprint) return human('RECHECK_AVAILABILITY');
  return reply('BOOKING_COMMAND_PROPOSAL', { tenantId: 4, companyId: 3, fingerprint,
    idempotencyKey: input.idempotencyKey, mustRecheckInTransaction: true, markPaid: false,
    demandPaymentProof: input.kind === 'patient',
  });
}
