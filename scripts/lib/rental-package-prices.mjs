import { createHash } from 'node:crypto';

export const SCOPE = Object.freeze({ tenantId: 4, empresaId: 3, tenantName: 'PSICOLOGOS' });
export const PLAN_VERSION = 1;
export const decimalCents = value => {
  const text = String(value ?? '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, decimals = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(decimals.padEnd(2, '0'));
};
export const sameMoney = (left, right) => decimalCents(left) !== null && decimalCents(left) === decimalCents(right);
const toMillis = value => value instanceof Date ? value.getTime() : Date.parse(value);
const sameTime = (left, right) => left && right && Number.isFinite(toMillis(left)) && toMillis(left) === toMillis(right);
const publicHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function financialEvidence(cita, audits) {
  if (cita.estadoPago !== 'PENDIENTE') return true;
  if (cita.hasComprobante) return true;
  return audits.some(a => a.citaId === cita.id && (a.beforeHasComprobante || a.afterHasComprobante ||
    a.beforeEstadoPago === 'CONCILIADO' || a.afterEstadoPago === 'CONCILIADO' || a.financialEvidence));
}

// Current tariffs describe diagnostics only. A repair always restores the price
// agreed at booking, evidenced by the original CREATE audit, never today's rate.
export function planRentalPackageRepairs(snapshot, onlyCitas = null) {
  if (snapshot.identity?.tenantId !== SCOPE.tenantId || snapshot.identity?.empresaId !== SCOPE.empresaId ||
      snapshot.identity?.tenantName !== SCOPE.tenantName) throw Error('SCOPE_NOT_VERIFIED');
  const groups = [];
  for (const group of snapshot.packages) {
    const { package: pkg, catalog, citas, audits, payments } = group;
    const active = citas.filter(c => c.realizada !== null);
    const mismatches = active.filter(c => {
      const price = decimalCents(pkg.precioPagado), value = decimalCents(c.valor);
      return price === null || value === null || !Number.isInteger(pkg.sesionesTotales) || pkg.sesionesTotales < 1 ||
        price !== value * BigInt(pkg.sesionesTotales);
    });
    const shared = citas.length > 1;
    const hoursMissing = active.filter(c => !sameTime(c.fechaCita, c.fechaCita) || !c.horaInicio || !c.horaFin ||
      !(Date.parse(c.horaFin) > Date.parse(c.horaInicio)));
    if (!mismatches.length && !shared && !hoursMissing.length) continue;
    if (onlyCitas && !active.some(c => onlyCitas.includes(c.id))) continue;
    const reasons = [];
    if (pkg.tenantId !== 4 || catalog.tenantId !== 4 || catalog.empresaId !== 3 ||
        !/alquiler/i.test(catalog.nombre ?? '') || catalog.cantidadSesiones !== 1 || pkg.sesionesTotales !== 1) reasons.push('PACKAGE_OR_CATALOG_SCOPE');
    if (pkg.estado !== 'ACTIVO' || pkg.sesionesConsumidas !== 1 || pkg.saldoRestante !== 0) reasons.push('PACKAGE_STATE_OR_BALANCE');
    if (!active.length) reasons.push('NO_ACTIVE_BOOKING');
    if (citas.some(c => c.tenantId !== 4 || c.empresaId !== 3)) reasons.push('BOOKING_SCOPE');
    if (pkg.clienteId !== null || !pkg.usuarioId || citas.some(c => c.pacienteId !== null || c.psicologoId !== pkg.usuarioId ||
        c.professionalTenant !== 4 || c.roomTenant !== 4 || c.roomCompany !== 3)) reasons.push('OWNER_OR_ROOM_SCOPE');
    if (payments.length) reasons.push('RELATED_PAYMENT_INCLUDING_REVERSED');
    if (citas.some(c => financialEvidence(c, audits)) || audits.some(a => a.packageId === pkg.id && a.financialEvidence)) reasons.push('HISTORICAL_FINANCIAL_EVIDENCE');
    if (active.length !== 1 && onlyCitas && active.some(c => !onlyCitas.includes(c.id))) reasons.push('PARTIAL_ACTIVE_GROUP_NOT_ALLOWED');
    if (hoursMissing.length) reasons.push('INCOMPLETE_OR_CHANGED_SCHEDULE');
    const items = active.map(cita => {
      const createAudits = audits.filter(a => a.citaId === cita.id && a.accion === 'CREATE');
      const evidence = createAudits.length === 1 ? createAudits[0] : null;
      const valid = evidence && evidence.tenantId === 4 && evidence.afterTenantId === 4 && evidence.afterEmpresaId === 3 &&
        evidence.afterPackageId === pkg.id && evidence.afterPsicologoId === cita.psicologoId &&
        evidence.afterPacienteId === null && sameMoney(evidence.afterValor, cita.valor) &&
        decimalCents(cita.valor) > 0n && sameTime(evidence.afterFechaCita, cita.fechaCita) &&
        sameTime(evidence.afterHoraInicio, cita.horaInicio) && sameTime(evidence.afterHoraFin, cita.horaFin);
      if (!valid) reasons.push(`MISSING_OR_CHANGED_CREATE_EVIDENCE:${cita.id}`);
      return { citaId: cita.id, oldPackageId: pkg.id, contractedPrice: cita.valor, auditId: evidence?.id ?? null,
        professionalId: cita.psicologoId, catalogId: pkg.catalogoId, fechaCompra: cita.createdAt };
    });
    const fingerprint = publicHash({ packageHash: pkg.rowHash, catalogHash: catalog.rowHash,
      citas: citas.map(c => ({ id: c.id, rowHash: c.rowHash })), audits: audits.map(a => ({ id: a.id, rowHash: a.rowHash })),
      payments: payments.map(p => ({ id: p.id, rowHash: p.rowHash })) });
    groups.push({ oldPackageId: pkg.id, status: reasons.length ? 'REVIEW' : 'ELIGIBLE', reasons: [...new Set(reasons)],
      fingerprint, mismatchCitaIds: mismatches.map(c => c.id), shared, cancelledCitaIds: citas.filter(c => c.realizada === null).map(c => c.id),
      missingScheduleCitaIds: hoursMissing.map(c => c.id), items,
      currentTariffDifferenceCitaIds: active.filter(c => {
        const minutes = (Date.parse(c.horaFin) - Date.parse(c.horaInicio)) / 60000;
        return Number.isFinite(minutes) && Number(c.valor) !== Number(catalog.precioBase) * minutes / 60;
      }).map(c => c.id) });
  }
  const eligible = groups.filter(g => g.status === 'ELIGIBLE');
  const plan = { version: PLAN_VERSION, scope: SCOPE, groups, summary: {
    rentalPackages: snapshot.packages.length, rentalBookings: snapshot.packages.reduce((n, g) => n + g.citas.length, 0),
    candidatePackages: groups.length, eligiblePackages: eligible.length, eligibleBookings: eligible.reduce((n, g) => n + g.items.length, 0),
    reviewPackages: groups.filter(g => g.status === 'REVIEW').length,
    mismatchBookings: groups.reduce((n, g) => n + g.mismatchCitaIds.length, 0) } };
  return { ...plan, fingerprint: publicHash(plan) };
}

export function assertApprovedPlan(expected, current) {
  if (expected.version !== PLAN_VERSION || expected.fingerprint !== current.fingerprint ||
      JSON.stringify(expected) !== JSON.stringify(current)) throw Error('STALE_OR_MODIFIED_PLAN');
  if (!expected.groups.some(g => g.status === 'ELIGIBLE')) throw Error('NO_ELIGIBLE_REPAIRS');
}

export function summarizePlan(plan) {
  const reviewCitaIds = plan.groups.filter(g => g.status === 'REVIEW').flatMap(g => g.items.map(i => i.citaId));
  return { ...plan.summary, eligibleCitaIds: plan.groups.filter(g => g.status === 'ELIGIBLE').flatMap(g => g.items.map(i => i.citaId)),
    reviewCitaCount: reviewCitaIds.length, reviewCitaSample: reviewCitaIds.slice(0, 20), fingerprint: plan.fingerprint };
}
