import { randomUUID } from 'node:crypto';
import { assertApprovedPlan, planRentalPackageRepairs } from './rental-package-prices.mjs';
import { verifyScope, readRentalSnapshot, moneyFingerprints } from './rental-package-database.mjs';

export const REPAIR_SOURCE = 'scripts/repair-rental-package-prices.mjs';
export function validateApplyOptions(options) {
  if (!Number.isSafeInteger(options.actorId) || options.actorId < 1) throw Error('AUTHORIZED_ACTOR_REQUIRED');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.requestId ?? '')) throw Error('REQUEST_UUID_REQUIRED');
  if (typeof options.reason !== 'string' || options.reason.trim().length < 10 || options.reason.trim().length > 240) throw Error('DOCUMENTED_REASON_REQUIRED');
  if (typeof options.backup !== 'function') throw Error('BACKUP_REQUIRED');
}

// The parent caller must review the dry-run file before passing it here.
// All money-table fingerprints are compared within this transaction, not with a
// historic audit: legitimate receipts received in the interim must remain intact.
export async function applyRepairPlan(client, approved, options, dependencies = {}) {
  validateApplyOptions(options);
  const deps = { verifyScope, readRentalSnapshot, moneyFingerprints, ...dependencies };
  const reason = options.reason.trim();
  let commitAttempted = false;
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await deps.verifyScope(client, true);
    const actor = await client.query('SELECT id,"tenantId",rol,activo,aprobado FROM "Usuario" WHERE id=$1 FOR SHARE', [options.actorId]);
    if (actor.rows.length !== 1 || actor.rows[0].tenantId !== 4 || !['ADMIN','SU_ADMIN'].includes(actor.rows[0].rol) ||
        !actor.rows[0].activo || !actor.rows[0].aprobado) throw Error('AUTHORIZED_ACTOR_REQUIRED');
    const previous = await client.query(`SELECT id,metadata,detalles FROM "Auditoria" WHERE "tenantId"=4
      AND metadata->>'requestId'=$1 AND metadata->>'source'=$2 ORDER BY id`, [options.requestId, REPAIR_SOURCE]);
    if (previous.rows.length) {
      if (previous.rows.some(a => a.metadata.planFingerprint !== approved.plan.fingerprint || a.metadata.reason !== reason)) throw Error('REQUEST_UUID_ALREADY_USED');
      await client.query('ROLLBACK');
      return { changed: false, alreadyApplied: true, requestId: options.requestId, auditIds: previous.rows.map(a => a.id) };
    }
    const ids = approved.plan.groups.filter(g => g.status === 'ELIGIBLE').map(g => g.oldPackageId);
    const snapshot = await deps.readRentalSnapshot(client, { lockPackageIds: ids });
    const current = planRentalPackageRepairs(snapshot, approved.selectedCitaIds ?? null);
    assertApprovedPlan(approved.plan, current);
    const financialBefore = await deps.moneyFingerprints(client);
    await options.backup({ capturedAt: new Date().toISOString(), requestId: options.requestId, reason, snapshot,
      approvedPlan: approved.plan, financialBefore });
    const changes = [];
    const auditIds = [];
    const addAudit = async (accion, entidad, entidadId, before, after, extra = {}) => {
      const result = await client.query(`INSERT INTO "Auditoria" ("tenantId","usuarioId",accion,entidad,"entidadId",detalles,metadata)
        VALUES (4,$1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING id`, [options.actorId, accion, entidad, String(entidadId),
        JSON.stringify({ descripcion: 'Reparación de vínculo de alquiler: conservar el precio contratado y retirar paquete reutilizado',
          motivo: reason, antes: before, despues: after, cajaModificada: false, pagosModificados: false,
          horarioModificado: false, precioOriginalModificado: false, ...extra }),
        JSON.stringify({ source: REPAIR_SOURCE, requestId: options.requestId, planFingerprint: approved.plan.fingerprint, reason })]);
      if (result.rows.length !== 1) throw Error('REQUIRED_AUDIT_FAILED');
      auditIds.push(result.rows[0].id);
    };
    for (const group of current.groups.filter(g => g.status === 'ELIGIBLE')) {
      const original = snapshot.packages.find(p => p.package.id === group.oldPackageId);
      for (const item of group.items) {
        const cita = original.citas.find(c => c.id === item.citaId);
        const created = await client.query(`INSERT INTO "PaqueteAdquirido" ("tenantId","clienteId","catalogoId","sesionesTotales",
          "sesionesConsumidas","saldoRestante","fechaCompra","fechaVencimiento","precioPagado",estado,"usuarioId")
          VALUES (4,NULL,$1,1,1,0,$2,$3,$4,'ACTIVO',$5)
          RETURNING id::text,"tenantId","clienteId","catalogoId"::text,"sesionesTotales","sesionesConsumidas","saldoRestante",
          "fechaCompra","fechaVencimiento","precioPagado"::text,estado,"usuarioId"`,
          [item.catalogId, item.fechaCompra, original.package.fechaVencimiento, item.contractedPrice, item.professionalId]);
        if (created.rows.length !== 1) throw Error('PACKAGE_CREATE_FAILED');
        const newPackage = created.rows[0];
        await addAudit('REPAIR_RENTAL_PACKAGE_CREATE', 'PaqueteAdquirido', newPackage.id, null, newPackage,
          { originalPackageId: group.oldPackageId, citaId: cita.id, originalCreateAuditId: item.auditId });
        const relink = await client.query(`UPDATE "CitasPsicologos" c SET "paqueteId"=$1
          WHERE c.id=$2 AND c."tenantId"=4 AND c."empresaId"=3 AND c."paqueteId"=$3 AND md5(to_jsonb(c)::text)=$4
          RETURNING c.id::text,c."paqueteId"::text,c.valor::text,c."estadoPago",c."metodoPago",c.realizada`,
          [newPackage.id, cita.id, group.oldPackageId, cita.rowHash]);
        if (relink.rows.length !== 1) throw Error('CONCURRENT_BOOKING_CHANGE');
        await addAudit('REPAIR_RENTAL_PACKAGE_LINK', 'Cita', cita.id,
          { paqueteId: group.oldPackageId, valor: cita.valor, estadoPago: cita.estadoPago, metodoPago: cita.metodoPago, realizada: cita.realizada },
          relink.rows[0], { originalCreateAuditId: item.auditId, packagePrice: item.contractedPrice });
        changes.push({ citaId: cita.id, oldPackageId: group.oldPackageId, newPackageId: newPackage.id, value: item.contractedPrice });
      }
      const remaining = await client.query('SELECT id::text,realizada FROM "CitasPsicologos" WHERE "paqueteId"=$1 ORDER BY id', [group.oldPackageId]);
      if (remaining.rows.some(c => c.realizada !== null)) throw Error('UNEXPECTED_ACTIVE_BOOKING_REMAINING');
      const retired = await client.query(`UPDATE "PaqueteAdquirido" p SET estado='CANCELADO',"sesionesConsumidas"=0,"saldoRestante"=1
        WHERE p.id=$1 AND p."tenantId"=4 AND md5(to_jsonb(p)::text)=$2
        RETURNING id::text,estado,"sesionesConsumidas","saldoRestante","precioPagado"::text`, [group.oldPackageId, original.package.rowHash]);
      if (retired.rows.length !== 1) throw Error('CONCURRENT_PACKAGE_CHANGE');
      await addAudit('REPAIR_RENTAL_PACKAGE_RETIRE', 'PaqueteAdquirido', group.oldPackageId,
        { estado: original.package.estado, sesionesConsumidas: original.package.sesionesConsumidas,
          saldoRestante: original.package.saldoRestante, precioPagado: original.package.precioPagado },
        retired.rows[0], { cancelledBookingsPreserved: remaining.rows.map(c => c.id) });
    }
    const financialAfter = await deps.moneyFingerprints(client);
    if (JSON.stringify(financialBefore) !== JSON.stringify(financialAfter)) throw Error('FINANCIAL_TABLES_CHANGED');
    // One final audit makes the before/after receipt proof durable, even if the
    // local report cannot be saved after COMMIT. It also provides idempotency.
    await addAudit('REPAIR_RENTAL_PACKAGE_FINANCIAL_CHECK', 'Tenant', 4, financialBefore, financialAfter,
      { repairId: randomUUID(), changes });
    commitAttempted = true;
    await client.query('COMMIT');
    return { changed: true, requestId: options.requestId, changes, auditIds, financialBefore, financialAfter };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (commitAttempted && error && typeof error === 'object') error.commitOutcomeUnknown = true;
    throw error;
  }
}
