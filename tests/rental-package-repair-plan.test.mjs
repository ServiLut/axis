import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decimalCents, planRentalPackageRepairs, assertApprovedPlan } from '../scripts/lib/rental-package-prices.mjs';
import { applyRepairPlan, validateApplyOptions } from '../scripts/lib/rental-package-repair.mjs';

const clone = value => structuredClone(value);
function snapshotFixture() {
  const booking = { id: '2708', tenantId: 4, empresaId: 3, pacienteId: null, psicologoId: 84, paqueteId: '2013',
    fechaCita: '2026-10-10T20:00:00.000Z', horaInicio: '2026-10-10T20:00:00.000Z', horaFin: '2026-10-10T21:00:00.000Z',
    valor: '18900.00', realizada: true, estadoPago: 'PENDIENTE', metodoPago: 'transferencia', hasComprobante: false,
    professionalTenant: 4, roomTenant: 4, roomCompany: 3, createdAt: '2026-10-10T17:43:26.988Z', rowHash: 'booking-original' };
  const cancelled = { ...booking, id: '2498', realizada: null, valor: '56700.00', rowHash: 'cancelled-original' };
  const audit = { id: 24707, tenantId: 4, citaId: booking.id, packageId: null, accion: 'CREATE',
    afterPackageId: '2013', afterTenantId: 4, afterEmpresaId: 3, afterPsicologoId: 84, afterPacienteId: null,
    afterValor: '18900', afterFechaCita: booking.fechaCita, afterHoraInicio: booking.horaInicio, afterHoraFin: booking.horaFin,
    beforeHasComprobante: false, afterHasComprobante: false, afterEstadoPago: 'PENDIENTE', financialEvidence: false, rowHash: 'audit-original' };
  return { identity: { tenantId: 4, empresaId: 3, tenantName: 'PSICOLOGOS' }, financialFingerprints: { caja: 'unchanged' },
    packages: [{ package: { id: '2013', tenantId: 4, clienteId: null, usuarioId: 84, catalogoId: '49', sesionesTotales: 1,
      sesionesConsumidas: 1, saldoRestante: 0, precioPagado: '56700.00', estado: 'ACTIVO', fechaVencimiento: null, rowHash: 'pkg-original' },
    catalog: { id: '49', tenantId: 4, empresaId: 3, nombre: 'Alquiler de Consultorio', cantidadSesiones: 1, precioBase: '18900.00', rowHash: 'catalog-original' },
    citas: [cancelled, booking], audits: [audit], payments: [] }] };
}
function documentFor(snapshot) { return { snapshot, selectedCitaIds: ['2708'], plan: planRentalPackageRepairs(snapshot, ['2708']) }; }

test('confirmed one-hour booking detaches at its documented price and preserves cancelled original', () => {
  const snapshot = snapshotFixture(); const before = clone(snapshot); const plan = documentFor(snapshot).plan;
  assert.equal(plan.summary.eligibleBookings, 1); assert.deepEqual(plan.groups[0].mismatchCitaIds, ['2708']);
  assert.equal(plan.groups[0].items[0].contractedPrice, '18900.00'); assert.equal(plan.groups[0].items[0].auditId, 24707);
  assert.deepEqual(plan.groups[0].cancelledCitaIds, ['2498']); assert.deepEqual(snapshot, before);
});

test('historical contract price is restored without substituting the current catalog tariff', () => {
  const snapshot = snapshotFixture(); snapshot.packages[0].catalog.precioBase = '29900.00';
  const group = documentFor(snapshot).plan.groups[0];
  assert.equal(group.status, 'ELIGIBLE'); assert.equal(group.items[0].contractedPrice, '18900.00');
  assert.deepEqual(group.currentTariffDifferenceCitaIds, ['2708']);
});

test('every linked payment, including reversed receipts and receipts of a cancelled booking, blocks automatic repair', () => {
  for (const reversado of [true, false]) {
    const snapshot = snapshotFixture(); snapshot.packages[0].payments = [{ id: '99', citaId: '2498', reversado, rowHash: 'receipt' }];
    assert.ok(documentFor(snapshot).plan.groups[0].reasons.includes('RELATED_PAYMENT_INCLUDING_REVERSED'));
    assert.equal(documentFor(snapshot).plan.summary.eligibleBookings, 0);
  }
});

test('old reconciliation, old proof and package financial audits require human review even if the current booking is pending', () => {
  for (const mutation of [g => { g.citas[0].hasComprobante = true; }, g => { g.citas[0].estadoPago = 'CONCILIADO'; },
    g => { g.audits.push({ id: 8, citaId: '2498', beforeEstadoPago: 'CONCILIADO', accion: 'UPDATE', rowHash: 'old-paid' }); },
    g => { g.audits.push({ id: 9, packageId: '2013', financialEvidence: true, accion: 'CORRECT_PRICE', rowHash: 'old-package' }); }]) {
    const snapshot = snapshotFixture(); mutation(snapshot.packages[0]);
    assert.ok(documentFor(snapshot).plan.groups[0].reasons.includes('HISTORICAL_FINANCIAL_EVIDENCE'));
  }
});

test('owner, room, tenant, one-session package and complete schedule guards cannot be bypassed', () => {
  for (const mutation of [g => { g.package.tenantId = 2; }, g => { g.catalog.empresaId = 8; },
    g => { g.package.usuarioId = 99; }, g => { g.citas[0].tenantId = 2; }, g => { g.citas[1].pacienteId = 99; },
    g => { g.citas[1].roomTenant = 2; }, g => { g.package.sesionesTotales = 2; }, g => { g.package.saldoRestante = 1; },
    g => { g.citas[1].horaFin = null; }, g => { g.citas[1].horaFin = g.citas[1].horaInicio; }]) {
    const snapshot = snapshotFixture(); mutation(snapshot.packages[0]); assert.equal(documentFor(snapshot).plan.summary.eligibleBookings, 0);
  }
  const snapshot = snapshotFixture(); snapshot.identity.tenantId = 2;
  assert.throws(() => documentFor(snapshot), /SCOPE/);
});

test('missing or multiple CREATE records and changed contract values, package links or schedule require review', () => {
  for (const mutation of [g => { g.audits = []; }, g => { g.audits.push({ ...g.audits[0], id: 999 }); },
    g => { g.audits[0].afterValor = '99900'; }, g => { g.audits[0].afterPackageId = '999'; },
    g => { g.audits[0].afterHoraFin = '2026-10-10T22:00:00.000Z'; }]) {
    const snapshot = snapshotFixture(); mutation(snapshot.packages[0]);
    assert.ok(documentFor(snapshot).plan.groups[0].reasons.some(r => r.startsWith('MISSING_OR_CHANGED_CREATE_EVIDENCE')));
  }
});

test('approved plan fingerprints capture changes in exact target rows and receipt evidence', () => {
  const snapshot = snapshotFixture(); const approved = documentFor(snapshot).plan;
  assertApprovedPlan(approved, documentFor(clone(snapshot)).plan);
  snapshot.packages[0].citas[1].rowHash = 'changed-observation-or-proof';
  assert.throws(() => assertApprovedPlan(approved, documentFor(snapshot).plan), /STALE/);
  const tampered = clone(approved); tampered.groups[0].items[0].contractedPrice = '1';
  assert.throws(() => assertApprovedPlan(tampered, approved), /STALE/);
});

test('decimal comparisons are exact and reject malformed or fractional cent amounts', () => {
  assert.equal(decimalCents('56700.00'), 5670000n); assert.equal(decimalCents('18900'), 1890000n);
  assert.equal(decimalCents('9999999999999999.99'), 999999999999999999n);
  for (const value of ['-18900', '18,900', '1.001', 'NaN', '', null]) assert.equal(decimalCents(value), null);
});

function engineFixture() {
  const snapshot = snapshotFixture(); const approved = documentFor(clone(snapshot));
  let state = { packagePrice: '56700.00', packageState: 'ACTIVO', packageConsumed: 1, packageBalance: 0,
    bookingPackage: '2013', bookingPrice: '18900.00', bookingPayment: 'PENDIENTE', cancelledPackage: '2013',
    packages: [], audits: [], financialWrites: 0 };
  let backupState, beforeTransaction;
  const flags = { changedBeforeRead: false, receiptBeforeRead: false, concurrentRelink: false, auditFailure: false,
    financialChange: false, backupFailure: false, invalidActor: false };
  let moneyReads = 0;
  const client = { query: async (sql, values = []) => {
    if (sql.startsWith('BEGIN')) { beforeTransaction = clone(state); return { rows: [] }; }
    if (sql === 'ROLLBACK') { if (beforeTransaction) state = clone(beforeTransaction); return { rows: [] }; }
    if (sql === 'COMMIT') { beforeTransaction = null; return { rows: [] }; }
    if (sql.startsWith('SELECT id,"tenantId",rol')) return { rows: [{ id: 10, tenantId: flags.invalidActor ? 2 : 4, rol: 'ADMIN', activo: true, aprobado: true }] };
    if (sql.startsWith('SELECT id,metadata,detalles')) return { rows: state.audits };
    if (sql.startsWith('INSERT INTO "PaqueteAdquirido"')) {
      const row = { id: String(3000 + state.packages.length), tenantId: 4, clienteId: null, catalogoId: values[0],
        sesionesTotales: 1, sesionesConsumidas: 1, saldoRestante: 0, fechaCompra: values[1], fechaVencimiento: values[2],
        precioPagado: values[3], estado: 'ACTIVO', usuarioId: values[4] };
      state.packages.push(row); return { rows: [row] };
    }
    if (sql.startsWith('INSERT INTO "Auditoria"')) {
      if (flags.auditFailure) throw Error('AUDIT_INSERT_FAILED');
      const row = { id: state.audits.length + 1, accion: values[1], entidad: values[2], entidadId: values[3],
        detalles: JSON.parse(values[4]), metadata: JSON.parse(values[5]) };
      state.audits.push(row); return { rows: [{ id: row.id }] };
    }
    if (sql.startsWith('UPDATE "CitasPsicologos"')) {
      assert.match(sql, /"paqueteId"=\$3 AND md5\(to_jsonb\(c\)::text\)=\$4/);
      assert.deepEqual(values.slice(1), ['2708','2013','booking-original']);
      if (flags.concurrentRelink) return { rows: [] };
      state.bookingPackage = values[0]; return { rows: [{ id: '2708', paqueteId: values[0], valor: state.bookingPrice,
        estadoPago: state.bookingPayment, metodoPago: 'transferencia', realizada: true }] };
    }
    if (sql.startsWith('SELECT id::text,realizada')) return { rows: [{ id: '2498', realizada: null }] };
    if (sql.startsWith('UPDATE "PaqueteAdquirido"')) {
      assert.match(sql, /md5\(to_jsonb\(p\)::text\)=\$2/); assert.deepEqual(values, ['2013','pkg-original']);
      state.packageState = 'CANCELADO'; state.packageConsumed = 0; state.packageBalance = 1;
      return { rows: [{ id: '2013', estado: 'CANCELADO', sesionesConsumidas: 0, saldoRestante: 1, precioPagado: state.packagePrice }] };
    }
    throw Error('UNEXPECTED_SQL');
  } };
  const dependencies = { verifyScope: async (_client, lock) => { assert.equal(lock, true); },
    readRentalSnapshot: async (_client, options) => {
      assert.deepEqual(options.lockPackageIds, ['2013']); const current = clone(snapshot);
      if (flags.changedBeforeRead) current.packages[0].citas[1].rowHash = 'concurrent-change';
      if (flags.receiptBeforeRead) current.packages[0].payments.push({ id: '999', reversado: false, rowHash: 'new-payment' });
      return current;
    }, moneyFingerprints: async () => { moneyReads++; return { rows: 126,
      hash: flags.financialChange && moneyReads > 1 ? 'changed' : 'stable', ingresos: '5971200.00', egresos: '0' }; } };
  const options = { actorId: 10, requestId: '032580d5-9992-4e44-8f90-444444444444', reason: 'Precio contratado confirmado: 18.900 por una hora',
    backup: async data => { if (flags.backupFailure) throw Error('BACKUP_FAILED'); backupState = clone(data); } };
  return { client, dependencies, options, approved, flags, state: () => clone(state), backup: () => backupState,
    run: () => applyRepairPlan(client, approved, options, dependencies) };
}

test('transaction repairs only the package link, retains original price/history/payment and audits exact before/after money hashes', async () => {
  const f = engineFixture(); const result = await f.run(); const state = f.state();
  assert.equal(result.changed, true); assert.equal(state.bookingPackage, '3000'); assert.equal(state.bookingPrice, '18900.00');
  assert.equal(state.packagePrice, '56700.00'); assert.equal(state.cancelledPackage, '2013'); assert.equal(state.bookingPayment, 'PENDIENTE');
  assert.equal(state.packageState, 'CANCELADO'); assert.equal(state.packageConsumed, 0); assert.equal(state.packageBalance, 1);
  assert.equal(state.packages[0].fechaCompra, '2026-10-10T17:43:26.988Z'); assert.equal(state.packages[0].precioPagado, '18900.00');
  assert.equal(state.financialWrites, 0); assert.equal(state.audits.length, 4); assert.ok(f.backup());
  assert.deepEqual(result.financialBefore, result.financialAfter);
});

test('new receipts and concurrent exact-row changes invalidate the reviewed plan before any writes', async () => {
  for (const key of ['changedBeforeRead','receiptBeforeRead','invalidActor']) {
    const f = engineFixture(); const initial = f.state(); f.flags[key] = true;
    await assert.rejects(f.run(), /STALE|AUTHORIZED/); assert.deepEqual(f.state(), initial); assert.equal(f.backup(), undefined);
  }
});

test('required backup failure, failed audit, failed relink and unexpected money mutation roll back every package/cita change', async () => {
  for (const key of ['backupFailure','auditFailure','concurrentRelink','financialChange']) {
    const f = engineFixture(); const initial = f.state(); f.flags[key] = true;
    await assert.rejects(f.run(), /BACKUP|AUDIT|CONCURRENT|FINANCIAL/); assert.deepEqual(f.state(), initial);
  }
});

test('successful request retry is idempotent while reusing the UUID with a different approved reason is rejected', async () => {
  const f = engineFixture(); await f.run(); const once = f.state();
  const result = await f.run(); assert.equal(result.alreadyApplied, true); assert.equal(result.changed, false); assert.deepEqual(f.state(), once);
  f.options.reason = 'Otra solicitud distinta'; await assert.rejects(f.run(), /REQUEST_UUID_ALREADY_USED/); assert.deepEqual(f.state(), once);
});

test('applying needs an authorized actor, documented reason, request UUID and backup callback', () => {
  const f = engineFixture(); validateApplyOptions(f.options);
  for (const replacement of [{ actorId: 0 }, { reason: '' }, { requestId: 'unsafe/path' }, { backup: undefined }]) {
    assert.throws(() => validateApplyOptions({ ...f.options, ...replacement }), /REQUIRED/);
  }
});
