import pg from 'pg';
import { config } from 'dotenv';
import { SCOPE } from './rental-package-prices.mjs';

export function createAuditClient() {
  config({ path: '.env.psicologos-db-audit.local', quiet: true });
  const raw = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
  if (!raw) throw Error('DATABASE_CONNECTION_NOT_CONFIGURED');
  const url = new URL(raw);
  url.searchParams.delete('sslmode');
  const ssl = process.env.DB_CA_CERT ? { rejectUnauthorized: true, ca: process.env.DB_CA_CERT } :
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
  return new pg.Client({ connectionString: url.toString(), ssl, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
}

export async function verifyScope(client, lock = false) {
  const tenant = await client.query(`SELECT id, nombre FROM "Tenant" WHERE id=4 ${lock ? 'FOR UPDATE' : ''}`);
  const company = await client.query('SELECT id,"tenantId" FROM "Empresa" WHERE id=3');
  if (tenant.rows.length !== 1 || tenant.rows[0].nombre !== SCOPE.tenantName ||
      company.rows.length !== 1 || company.rows[0].tenantId !== 4) throw Error('SCOPE_NOT_VERIFIED');
  return { tenantId: 4, empresaId: 3, tenantName: tenant.rows[0].nombre };
}

export async function moneyFingerprints(client) {
  const results = {};
  // Full rows contribute to each hash; only counts/hash/aggregate totals leave DB.
  for (const table of ['MovimientoCaja', 'PagoServicioPsicologia', 'CargoRecepcion', 'PagoRecepcion']) {
    const result = await client.query(`SELECT count(*)::int AS rows,
      md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY id),'')) AS fingerprint
      FROM "${table}" t WHERE "tenantId"=4`);
    results[table] = result.rows[0];
  }
  const applications = await client.query(`SELECT count(*)::int AS rows,
    md5(COALESCE(string_agg(to_jsonb(a)::text, E'\\n' ORDER BY a."pagoId",a."cargoId"),'')) AS fingerprint
    FROM "AplicacionPagoRecepcion" a WHERE EXISTS (SELECT 1 FROM "PagoRecepcion" p WHERE p.id=a."pagoId" AND p."tenantId"=4)
    OR EXISTS (SELECT 1 FROM "CargoRecepcion" c WHERE c.id=a."cargoId" AND c."tenantId"=4)`);
  results.AplicacionPagoRecepcion = applications.rows[0];
  const totals = await client.query(`SELECT COALESCE(SUM(monto) FILTER(WHERE tipo='INGRESO'),0)::text AS ingresos,
    COALESCE(SUM(monto) FILTER(WHERE tipo='EGRESO'),0)::text AS egresos FROM "MovimientoCaja" WHERE "tenantId"=4`);
  results.cajaTotals = totals.rows[0];
  return results;
}

export async function readRentalSnapshot(client, { lockPackageIds = [] } = {}) {
  const identity = await verifyScope(client);
  if (lockPackageIds.length) {
    await client.query('SELECT id FROM "PaqueteAdquirido" WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE', [lockPackageIds]);
    await client.query('SELECT id FROM "CitasPsicologos" WHERE "paqueteId"=ANY($1::bigint[]) ORDER BY id FOR UPDATE', [lockPackageIds]);
  }
  const packages = await client.query(`SELECT p.id::text,p."tenantId",p."clienteId",p."usuarioId",p."catalogoId"::text,
    p."sesionesTotales",p."sesionesConsumidas",p."saldoRestante",p."precioPagado"::text,p.estado,p."fechaCompra",p."fechaVencimiento",p.created_at,
    md5(to_jsonb(p)::text) AS "rowHash",s."tenantId" AS "catalogTenant",s."empresaId" AS "catalogCompany",s.nombre,
    s.categoria,s."cantidadSesiones",s."precioBase"::text,md5(to_jsonb(s)::text) AS "catalogHash"
    FROM "PaqueteAdquirido" p JOIN "TerapiasPsicologos" s ON s.id=p."catalogoId"
    WHERE (p."tenantId"=4 OR EXISTS(SELECT 1 FROM "CitasPsicologos" c WHERE c."paqueteId"=p.id AND c."tenantId"=4))
    AND (s.nombre ILIKE '%alquiler%' OR s.categoria ILIKE '%alquiler%') ORDER BY p.id`);
  const ids = packages.rows.map(p => p.id);
  const citas = await client.query(`SELECT c.id::text,c."tenantId",c."empresaId",c."paqueteId"::text,c."pacienteId",c."psicologoId",
    c."consultorioId"::text,c."fechaCita",c."horaInicio",c."horaFin",c.valor::text,c.realizada,c."estadoPago",c."metodoPago",c."createdAt",
    COALESCE(c."comprobantePath",'')<>'' AS "hasComprobante",u."tenantId" AS "professionalTenant",
    r."tenantId" AS "roomTenant",r."empresaId" AS "roomCompany",md5(to_jsonb(c)::text) AS "rowHash"
    FROM "CitasPsicologos" c LEFT JOIN "Usuario" u ON u.id=c."psicologoId" LEFT JOIN consultorios r ON r.id=c."consultorioId"
    WHERE c."paqueteId"=ANY($1::bigint[]) ORDER BY c.id`, [ids]);
  const citaIds = citas.rows.map(c => c.id);
  const audits = await client.query(`SELECT id, "tenantId", "usuarioId", accion, entidad,
    CASE WHEN entidad='Cita' THEN "entidadId" END AS "citaId",
    CASE WHEN entidad IN ('Paquete','PaqueteAdquirido') THEN "entidadId" END AS "packageId", "createdAt",
    detalles->'despues'->>'valor' AS "afterValor", detalles->'despues'->>'paqueteId' AS "afterPackageId",
    detalles->'despues'->>'fechaCita' AS "afterFechaCita", detalles->'despues'->>'horaInicio' AS "afterHoraInicio", detalles->'despues'->>'horaFin' AS "afterHoraFin",
    (detalles->'despues'->>'tenantId')::int AS "afterTenantId", (detalles->'despues'->>'empresaId')::int AS "afterEmpresaId",
    (detalles->'despues'->>'psicologoId')::int AS "afterPsicologoId", (detalles->'despues'->>'pacienteId')::int AS "afterPacienteId",
    detalles->'antes'->>'estadoPago' AS "beforeEstadoPago", detalles->'despues'->>'estadoPago' AS "afterEstadoPago",
    COALESCE(detalles->'antes'->>'comprobantePath',detalles->'antes'->>'archivo','')<>'' AS "beforeHasComprobante",
    COALESCE(detalles->'despues'->>'comprobantePath',detalles->'despues'->>'archivo','')<>'' AS "afterHasComprobante",
    (accion ~* '(upload|pago|payment|price|cobro|concilia)' OR entidad ILIKE '%pago%' OR
      (detalles->'antes'->>'valor' IS NOT NULL AND detalles->'despues'->>'valor' IS NOT NULL AND
        detalles->'antes'->>'valor' <> detalles->'despues'->>'valor') OR
      COALESCE(detalles->>'descripcion','') ~* '(conciliad|comprobante|pago registrado|pago de servicio)') AS "financialEvidence",
    md5(to_jsonb(a)::text) AS "rowHash"
    FROM "Auditoria" a WHERE "tenantId"=4 AND ((entidad='Cita' AND "entidadId"=ANY($1::text[])) OR
      (entidad IN ('Paquete','PaqueteAdquirido') AND "entidadId"=ANY($2::text[]))) ORDER BY id`, [citaIds, ids]);
  const payments = await client.query(`SELECT id::text,"tenantId","paqueteId"::text,"citaId"::text,monto::text,reversado,"movimientoCajaId"::text,
    md5(to_jsonb(p)::text) AS "rowHash" FROM "PagoServicioPsicologia" p
    WHERE "paqueteId"=ANY($1::bigint[]) OR "citaId"=ANY($2::bigint[]) ORDER BY id`, [ids, citaIds]);
  const byPackage = packages.rows.map(row => {
    const { catalogTenant, catalogCompany, nombre, categoria, cantidadSesiones, precioBase, catalogHash, ...pkg } = row;
    const groupCitas = citas.rows.filter(c => c.paqueteId === row.id), groupIds = new Set(groupCitas.map(c => c.id));
    return { package: pkg, catalog: { id: row.catalogoId, tenantId: catalogTenant, empresaId: catalogCompany, nombre,
      categoria, cantidadSesiones, precioBase, rowHash: catalogHash }, citas: groupCitas,
      audits: audits.rows.filter(a => groupIds.has(a.citaId) || a.packageId === row.id), payments: payments.rows.filter(p => p.paqueteId === row.id || groupIds.has(p.citaId)) };
  });
  return { capturedAt: new Date().toISOString(), identity, packages: byPackage, financialFingerprints: await moneyFingerprints(client) };
}

export function safeFailure(error) {
  // Never print pg error detail, query text, connection URL or request payload.
  return { error: /^\w+$/.test(error?.message ?? '') ? error.message : 'OPERATION_FAILED', code: error?.code ?? null };
}
