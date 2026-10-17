// Finite advisory release gate. Engine + encrypted SQLite :memory: only.
// Every source/contact is synthetic. No model, provider, HTTP or business DB.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSummaryDataFixture } from './fixtures/maria-summary-data-flow.mjs';

const START = Date.parse('2026-10-16T21:20:00.000Z');
const QUOTE = 'Cucarachas en apartamento de dos habitaciones en Itagüí, barrio Santa María.';
const records = [];
const outputDirectory = new URL('../.tmp/maria-confirmation-check-20261017/advisory-matrix/', import.meta.url);
const prepared = f => f.store.db.prepare("SELECT COUNT(*) n FROM meta WHERE key LIKE 'maria-registration:%'").get().n;

after(() => {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL('synthetic-engine-outputs.json', outputDirectory), JSON.stringify({
    kind: 'LOCAL_SYNTHETIC_ADVISORY_RELEASE_MATRIX',
    sourceClock: new Date(START).toISOString(),
    modelCalls: 0, providerCalls: 0, externalDatabaseCalls: 0,
    productionStoresUsed: false,
    passed: records.every(record => record.passed),
    scenarioCount: records.length,
    failures: records.filter(record => !record.passed).map(({ name, failure }) => ({ name, failure })),
    records,
    limits: ['Deterministic Engine behavior only; no customer delivery, production save or appointment is proved.',
      'Prepared registrations remain in the in-memory Store and are destroyed after each scenario.',
      'This is a finite release gate, not proof that every possible conversation is covered.'],
  }, null, 2) + '\n');
  console.log('Synthetic advisory matrix evidence: ' + fileURLToPath(new URL('synthetic-engine-outputs.json', outputDirectory)));
});

function scenario(name, action) {
  test(name, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: START });
    const f = createSummaryDataFixture(at => t.mock.timers.setTime(at));
    f.config.staffPlanning = { enabled: true, mode: 'internal-staff-assignment', startsAt: START - 5000 };
    const record = { name, passed: false, networkAttempts: 0, turns: [] };
    records.push(record);
    t.mock.method(globalThis, 'fetch', () => { record.networkAttempts++; throw Error('Release matrix forbids HTTP'); });
    const turn = async (text, patch = {}) => {
      const event = await f.turn(text, patch);
      const row = f.row(event);
      const reply = f.reply(event) ?? null;
      record.turns.push({ sourceId: event.id, at: new Date(event.at).toISOString(), fromMe: event.fromMe,
        input: text, output: reply, outputState: row?.state ?? null, internal: row?.internal ?? null,
        conversation: structuredClone(f.state(event)), hold: f.store.conversation(event.phone).hold,
        preparedRegistrations: prepared(f) });
      if (row) f.deliver(event);
      return { event, text: reply || '', state: f.state(event), row };
    };
    try {
      await action(f, turn);
      assert.equal(record.networkAttempts, 0);
      record.passed = true;
    } catch (error) {
      record.failure = { message: error.message, code: error.code || null };
      throw error;
    } finally { f.store.close(); }
  });
}

scenario('01 complete service: preserves supplied facts and prepares only after fresh summary confirmation', async (f, turn) => {
  const quote = await turn(QUOTE);
  assert.match(quote.text, /129\.000/);
  assert.doesNotMatch(quote.text, /qué plaga|tipo de inmueble|cuántas habitaciones|municipio y barrio/i);
  const accepted = await turn('Sí, acepto esa cotización');
  assert.equal(accepted.state.quotedPrice.accepted, true);
  assert.match(accepted.text, /nombre completo/);
  assert.doesNotMatch(accepted.text, /129\.000|Deseas continuar/i);
  const facts = await turn('Nombre: Laura Gómez\nDirección: Calle 50 # 42-18 apartamento 301');
  assert.doesNotMatch(facts.text, /nombre completo|dirección completa/);
  const timing = await turn('Horario: mañana a las 10 am');
  assert.match(timing.text, /¿Confirmas que estos datos son correctos/);
  assert.match(timing.text, /Laura Gómez|Calle 50 # 42-18|mañana a las 10 am/);
  assert.equal(prepared(f), 0);
  const final = await turn('Sí, confirmo que los datos son correctos.');
  const entry = f.entry(final.event);
  assert.ok(entry);
  assert.equal(entry.status, 'PENDING');
  assert.equal(entry.payload.customerName, 'Laura Gómez');
  assert.equal(entry.payload.address, 'Calle 50 # 42-18 apartamento 301');
  assert.equal(entry.payload.quote.priceCop, 129000);
  assert.equal(entry.payload.sources.acceptance.id, final.event.id);
  assert.equal(entry.payload.sources.preference.id, timing.event.id);
  assert.equal(entry.payload.slots.preference, 'mañana a las 10 am');
  assert.equal('tecnicoId' in entry.payload, false);
});

scenario('02 fragmented quotation: asks only missing information and keeps all previously supplied facts', async (f, turn) => {
  await turn('Buenas tardes');
  await turn('Cucarachas');
  await turn('Itagüí, barrio Santa María');
  const site = await turn('Apartamento');
  assert.doesNotMatch(site.text, /qué plaga|municipio y barrio|tipo de inmueble/i);
  const size = await turn('Dos habitaciones');
  assert.match(size.text, /129\.000/);
  assert.doesNotMatch(size.text, /cuántas habitaciones|qué plaga|municipio y barrio|tipo de inmueble/i);
  assert.equal(prepared(f), 0);
});

scenario('03 corrected customer data: new summary and confirmation are required before any prepared registration', async (f, turn) => {
  await turn(QUOTE);
  await turn('Sí, acepto el servicio');
  await turn('Nombre: Laura Gómez\nDirección: Calle 50 # 42-18 apartamento 301');
  await turn('Mañana a las 10 am');
  const correction = await turn('Dirección: Calle 51 # 43-20 apartamento 402');
  assert.match(correction.text, /Calle 51 # 43-20 apartamento 402/);
  assert.doesNotMatch(correction.text, /Calle 50 # 42-18/);
  assert.match(correction.text, /¿Confirmas que estos datos son correctos/);
  assert.equal(prepared(f), 0);
  const final = await turn('Sí, confirmo que los datos son correctos.');
  assert.equal(f.entry(final.event)?.payload.address, 'Calle 51 # 43-20 apartamento 402');
});

scenario('04 indecision: respects postponement and does not treat courtesy as acceptance', async (f, turn) => {
  await turn(QUOTE);
  const deferred = await turn('Gracias, por ahora lo voy a pensar.');
  assert.match(deferred.text, /calma|pensarlo/);
  await turn('Listo, gracias.');
  assert.equal(f.state(deferred.event).customerDeferral.active, true);
  assert.notEqual(f.state(deferred.event).quotedPrice.accepted, true);
  assert.equal(prepared(f), 0);
});

scenario('05 price objection: addresses the objection without invented discount, repricing or premature intake', async (f, turn) => {
  await turn(QUOTE);
  const objection = await turn('Se me hace caro. ¿Tienen algún descuento?');
  assert.equal(objection.state.quotedPrice.priceCop, 129000);
  assert.notEqual(objection.state.quotedPrice.accepted, true);
  assert.doesNotMatch(objection.text, /te (?:dejo|bajo|ofrezco).*\$|descuento de|nombre completo|dirección completa|último cupo/i);
  assert.match(objection.text, /precio|valor|presupuesto|descuento|costo/i, 'The response should explain or acknowledge the actual price concern.');
  assert.doesNotMatch(objection.text, /Recibí tu pregunta\. Aún no tengo una respuesta confirmada/i, 'A generic pending acknowledgement does not address this ordinary objection.');
  assert.equal(prepared(f), 0);
});

scenario('06 refusal and no-contact request: stops pursuing quotation and collecting customer data', async (f, turn) => {
  await turn(QUOTE);
  const refusal = await turn('No gracias, no quiero el servicio. No me escriban más.');
  assert.notEqual(refusal.state.quotedPrice?.accepted, true);
  assert.doesNotMatch(refusal.text, /Deseas continuar|Para cotizarte|nombre completo|dirección completa|129\.000/i);
  assert.ok(refusal.state.closed || refusal.state.customerDeferral?.active || refusal.state.contactDeclined || refusal.state.doNotContact,
    'The explicit refusal/no-contact request needs a persistent exclusion, not only an acknowledgement.');
  assert.equal(prepared(f), 0);
});

scenario('07 warranty for an earlier service: preserves prior-service context and does not promise approval or create a new sale', async (f, turn) => {
  const first = await turn('Ya me fumigaron hace ocho días y siguen las cucarachas. Solicito la garantía del servicio.');
  assert.match(first.text, /garantía|solicitud|caso|revisi/i);
  assert.doesNotMatch(first.text, /gratis|sin costo|garantía (?:aprobada|cubierta)|\$|Deseas continuar/i);
  const next = await turn('Es un apartamento de dos habitaciones en Itagüí, barrio Santa María.');
  assert.ok(next.state.requestedAfterServiceReview);
  assert.doesNotMatch(next.text, /129\.000|Deseas continuar|nombre completo|nueva cotización/i);
  assert.equal(prepared(f), 0);
});

scenario('08 reinforcement: new details do not erase the earlier-service request or invent free attendance', async (f, turn) => {
  const first = await turn('Necesito un refuerzo de la fumigación que me hicieron.');
  const sourceId = first.state.requestedAfterServiceReview?.sourceId;
  assert.ok(sourceId);
  const next = await turn('Cucarachas en apartamento de dos habitaciones en Itagüí.');
  assert.equal(next.state.requestedAfterServiceReview.sourceId, sourceId);
  assert.doesNotMatch(next.text, /gratis|sin costo|129\.000|Deseas continuar|ya.*(?:agendad|programad)/i);
  assert.equal(prepared(f), 0);
});

scenario('09 narrated profanity: recognizes the pest request and does not treat the customer as insulting staff', async (f, turn) => {
  const narrated = await turn('Esas hijueputas cucarachas no me dejan dormir. Necesito fumigar un apartamento de dos habitaciones en Itagüí, barrio Santa María.');
  assert.match(narrated.text, /129\.000/);
  assert.doesNotMatch(narrated.text, /respeto|insult|groser|hijueputa|no puedo atender/i);
  assert.equal(f.store.conversation(narrated.event.phone).hold, 0);
  assert.equal(prepared(f), 0);
});

scenario('10 directed profanity: remains respectful and does not pursue a sale after explicit rejection', async (f, turn) => {
  await turn(QUOTE);
  const directed = await turn('Usted es una hijueputa. No quiero el servicio. No me vuelvan a escribir.');
  assert.doesNotMatch(directed.text, /hijueputa|idiota|cáll|te equivocas|129\.000|Deseas continuar|nombre completo|dirección completa/i);
  assert.notEqual(directed.state.quotedPrice?.accepted, true);
  assert.equal(prepared(f), 0);
});

scenario('11 courtesy: warm structured greeting and thanks do not open a sale or repeat the intake', async (f, turn) => {
  const hello = await turn('Buenas tardes');
  assert.match(hello.text, /Buenas tardes, soy María Ángel\./);
  assert.match(hello.text, /\n1\. /);
  assert.match(hello.text, /\n2\. /);
  const thanks = await turn('Muchas gracias');
  assert.match(thanks.text, /gusto|servirte|gracias/i);
  assert.doesNotMatch(thanks.text, /qué plaga|municipio|129\.000|nombre completo/i);
  assert.equal(prepared(f), 0);
});

scenario('12 human takeover: preserves hold and queues no new customer reply or registration', async (f, turn) => {
  await turn(QUOTE);
  await turn('Buenas tardes, te atiende una asesora.', { fromMe: true });
  const before = f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n;
  const customer = await turn('Sí, acepto el servicio. Nombre: Laura Gómez. Dirección: Calle 50 # 42-18. Mañana a las 10 am.');
  assert.equal(f.store.conversation(customer.event.phone).hold, 1);
  assert.equal(customer.row, undefined);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE internal=0').get().n, before);
  assert.equal(prepared(f), 0);
});
