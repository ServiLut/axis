// Synthetic fixtures only; no patient data, phone numbers, tokens or bank details.
export function botCases() {
  const templates = Object.fromEntries(['servicios', 'individual', 'pareja', 'infantil', 'sexologia', 'familiar', 'oficina', 'neuropsicologia', 'datos'].map(k => [k, {
    approved: true, version: 'TEST-ONLY', text: '*PRUEBA*\nTexto ficticio /' + k + '\n  Formato intacto.\n',
  }]));
  const base = { tenantId: 4, companyId: 3, channelVerified: true, risk: 'cleared', stage: 'NEW', templates };
  const event = { id: 'synthetic-in-2', direction: 'incoming', private: false, kind: 'text' };
  const cases = [];
  const add = (name, context, expected, override = {}) => cases.push({ name, fn: 'receptionDecision', args: [{ ...event, ...override }, { ...base, ...context }], expected });
  add('Saludo Luisa Fernanda', {}, { action: 'GREETING', nextStage: 'IDENTIFY_NEED' });
  add('Bloquear otro tenant', { tenantId: 1 }, { action: 'HUMAN_REVIEW' });
  add('Bloquear otra empresa', { companyId: 9 }, { action: 'HUMAN_REVIEW' });
  add('Canal no comprobado', { channelVerified: false }, { action: 'HUMAN_REVIEW' });
  add('No contestar mensajes salientes', {}, { action: 'IGNORE' }, { direction: 'outgoing' });
  add('No contestar notas internas', {}, { action: 'IGNORE' }, { private: true });
  add('Evento repetido', { persistedEventStatus: 'processed' }, { action: 'IGNORE' });
  add('Evento sin identificador', {}, { action: 'IGNORE' }, { id: '' });
  add('Audio pendiente', {}, { action: 'TRANSCRIPTION_REVIEW', sendPricing: false }, { kind: 'audio' });
  add('Riesgo urgente interrumpe venta', { stage: 'OFFER_SENT', risk: 'urgent' }, { action: 'URGENT_HANDOFF', continueSales: false, acknowledgeImmediately: true });
  add('Triage desconocido exige persona', { risk: undefined }, { action: 'HUMAN_REVIEW', reason: 'TRIAGE_REQUIRED' });
  add('Alertas internas exclusivamente a Sandra', { risk: 'urgent', notificationRecipient: '+570000000000' }, { action: 'URGENT_HANDOFF', notify: { name: 'Sandra Milena Duque', phone: '+573016803926' } });
  add('Conversacion tomada por humano', { stage: 'HUMAN' }, { action: 'HUMAN_REVIEW' });
  add('Comprobante no equivale a pago', {}, { action: 'PAYMENT_EVIDENCE_REVIEW', markPaid: false }, { kind: 'payment_proof' });
  add('Cancelar no borra cita automaticamente', { intent: 'cancel' }, { action: 'HUMAN_REVIEW' });
  add('Menu conserva texto exacto', { stage: 'IDENTIFY_NEED', intent: 'show_services' }, { action: 'QUICK_REPLY', shortcut: 'servicios', text: templates.servicios.text });
  for (const [selection, shortcut] of [['1','individual'], ['2','pareja'], ['3','infantil'], ['4','sexologia'], ['5','familiar']]) {
    add('Menu ' + selection + ' usa /' + shortcut, { stage: 'SERVICE_MENU' }, { action: 'QUICK_REPLY', shortcut, text: templates[shortcut].text, paymentDiscussion: false }, { selection });
  }
  add('Neuropsicologia explicita', { stage: 'IDENTIFY_NEED', explicitService: 'neuropsicologia' }, { action: 'QUICK_REPLY', candidates: ['DANIEL_FELIPE'] });
  add('Certificado requiere texto aprobado a 200000', { stage: 'SERVICE_MENU' }, { action: 'HUMAN_REVIEW', reason: 'CERTIFICATE_200000_TEMPLATE_PENDING' }, { selection: '7' });
  add('Horarios viejos no se envian', { stage: 'SERVICE_MENU' }, { action: 'HUMAN_REVIEW', reason: 'RENTAL_HOURS_CONFLICT' }, { selection: '6' });
  add('Plantilla pendiente no se inventa', { stage: 'SERVICE_MENU', templates: {} }, { action: 'HUMAN_REVIEW' }, { selection: '1' });
  add('Numero tras precio no cambia servicio', { stage: 'OFFER_SENT', intent: 'package_choice' }, { action: 'HUMAN_REVIEW' }, { selection: '1' });
  add('Datos necesitan respuesta nueva', { stage: 'OFFER_SENT', intent: 'continue_booking', offerEventId: event.id }, { action: 'HUMAN_REVIEW', reason: 'WAIT_FOR_NEW_CUSTOMER_MESSAGE' });
  add('Politicas anticipo contradictorias', { stage: 'OFFER_SENT', intent: 'continue_booking', offerEventId: 'synthetic-out-1' }, { action: 'HUMAN_REVIEW', reason: 'CONFLICTING_PAYMENT_POLICY' });
  add('Introduccion antes de /datos', { stage: 'OFFER_SENT', intent: 'continue_booking', offerEventId: 'synthetic-out-1', paymentPolicyApproved: true }, { action: 'QUICK_REPLY', shortcut: 'datos', introduction: 'Por favor, regálame estos datos 😊', text: templates.datos.text });
  add('Alquiler pregunta duracion sin comprobante', { stage: 'OFFER_SENT', service: 'alquiler', intent: 'continue_booking' }, { action: 'RENTAL_DETAILS', demandPaymentProof: false, requireRegisteredProfessional: true });
  add('Datos incompletos no crean cliente', { stage: 'DATA_REQUESTED' }, { action: 'HUMAN_REVIEW' });
  add('Datos completos piden preferencia y modalidad', { stage: 'DATA_REQUESTED', customerDataValidated: true }, { action: 'CUSTOMER_UPSERT_PROPOSAL', nextStage: 'PREFERENCES' });
  add('Dispo requiere sala y profesional', { stage: 'PREFERENCES' }, { action: 'AVAILABILITY_REVIEW', requireRoomCheck: true, requireProfessionalConfirmation: true, promiseAppointment: false });
  add('Esperar al profesional', { stage: 'PROFESSIONAL_CONFIRMATION' }, { action: 'WAIT_FOR_PROFESSIONAL', promiseAppointment: false });
  const booking = { kind: 'rental', professionalId: 901, roomId: '902', modality: 'onsite', start: '2026-10-01T07:00:00-05:00', end: '2026-10-01T08:00:00-05:00', idempotencyKey: 'SYNTHETIC-ONLY-1' };
  const fingerprint = (b) => JSON.stringify([b.kind, b.customerId || null, b.serviceId || null, b.professionalId, b.roomId || null, b.modality, Date.parse(b.start), Date.parse(b.end)]);
  const bookingContext = { ...base, professionalRegistered: true, now: '2026-09-26T14:00:00-05:00',
    patientConfirmedFingerprint: fingerprint(booking), professionalConfirmedFingerprint: fingerprint(booking), availabilityFingerprint: fingerprint(booking) };
  const bookCase = (name, change, ctxChange, expected) => cases.push({ name, fn: 'bookingProposal', args: [{ ...booking, ...change }, { ...bookingContext, ...ctxChange }], expected });
  bookCase('Reserva propuesta con ambas confirmaciones', {}, {}, { action: 'BOOKING_COMMAND_PROPOSAL', markPaid: false, demandPaymentProof: false });
  bookCase('Sin profesional no registra', { professionalId: null }, {}, { action: 'HUMAN_REVIEW' });
  bookCase('Profesional sin alta no registra', {}, { professionalRegistered: false }, { action: 'HUMAN_REVIEW' });
  bookCase('Sala requerida', { roomId: null }, {}, { action: 'HUMAN_REVIEW' });
  bookCase('Hora distinta invalida confirmacion', { start: '2026-10-01T07:15:00-05:00' }, {}, { action: 'HUMAN_REVIEW', reason: 'EXACT_SLOT_CONFIRMATIONS_REQUIRED' });
  bookCase('Sin confirmacion del profesional', {}, { professionalConfirmedFingerprint: null }, { action: 'HUMAN_REVIEW' });
  bookCase('Disponibilidad sin verificar', {}, { availabilityFingerprint: null }, { action: 'HUMAN_REVIEW', reason: 'RECHECK_AVAILABILITY' });
  bookCase('No entrar antes de las siete', { start: '2026-10-01T06:55:00-05:00' }, {}, { action: 'HUMAN_REVIEW', reason: 'OUTSIDE_RENTAL_HOURS' });
  bookCase('No terminar despues de las veinte', { end: '2026-10-01T20:01:00-05:00' }, {}, { action: 'HUMAN_REVIEW', reason: 'OUTSIDE_RENTAL_HOURS' });
  bookCase('Zona horaria obligatoria', { start: '2026-10-01T07:00:00' }, {}, { action: 'HUMAN_REVIEW', reason: 'INVALID_TIME' });
  bookCase('No crear cita pasada', {}, { now: '2026-10-02T14:00:00-05:00' }, { action: 'HUMAN_REVIEW', reason: 'PAST_OR_UNVERIFIED_TIME' });
  bookCase('Riesgo detiene registro', {}, { risk: 'urgent' }, { action: 'HUMAN_REVIEW' });
  for (const [kind, quantity, expected] of [['printing', 1, 800], ['printing', 10, 8000], ['overtime', 0, 0], ['overtime', 1, 4000], ['overtime', 15, 4000], ['overtime', 16, 8000], ['overtime', 30, 8000], ['overtime', 31, 18900]]) {
    cases.push({ name: kind + ' ' + quantity, fn: 'ancillaryCharge', args: [{ kind, quantity, normalRentalPrice: 18900 }], expected });
  }
  return cases;
}
