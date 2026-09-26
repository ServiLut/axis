// Administrative diagnostic. All database work runs inside a READ ONLY transaction.
import { config } from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
config({ path: '.env.psicologos-db-audit.local', quiet: true });
const client = new pg.Client({ connectionString: process.env.POSTGRES_PRISMA_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const identity = await client.query('SELECT t.id AS "tenantId", t.nombre AS tenant, e.id AS "companyId", e.nombre AS company FROM "Tenant" t JOIN "Empresa" e ON e."tenantId"=t.id WHERE t.id=4 AND e.id=3');
  if (identity.rows.length !== 1 || identity.rows[0].tenant !== 'PSICOLOGOS') throw new Error('Scope not verified');
  const rows = await client.query(`SELECT s.id::text,s."tenantId",s."empresaId",s.nombre,s.categoria,s."cantidadSesiones",s."precioBase"::text,s.activo,
    (SELECT count(*)::int FROM "PaqueteAdquirido" p WHERE p."catalogoId"=s.id AND p."tenantId"=4) AS "packagesInPsychology"
    FROM "TerapiasPsicologos" s WHERE s."tenantId"=4 OR EXISTS
    (SELECT 1 FROM "PaqueteAdquirido" p WHERE p."catalogoId"=s.id AND p."tenantId"=4) ORDER BY s.id`);
  const visible = JSON.parse(await readFile('.tmp/catalogo-visible-psicologos.json', 'utf8')).map(r => ({ nombre:r[0], categoria:r[1], sesiones:Number(r[2]), precio:Number(r[3].replace(/[^0-9]/g,'')), activo:r[4]==='Activo' }));
  const visibleOwnership = await client.query(`SELECT s.id::text,s."tenantId",s."empresaId",s.nombre,s.categoria,s."cantidadSesiones",s."precioBase"::text,s.activo,
    (SELECT count(*)::int FROM "PaqueteAdquirido" p WHERE p."catalogoId"=s.id AND p."tenantId"<>4) AS "packagesOutsidePsychology"
    FROM "TerapiasPsicologos" s JOIN jsonb_to_recordset($1::jsonb) AS v(nombre text,categoria text,sesiones int,precio numeric,activo boolean)
    ON s.nombre=v.nombre AND s.categoria=v.categoria AND s."cantidadSesiones"=v.sesiones AND s."precioBase"=v.precio AND s.activo=v.activo
    WHERE s."tenantId"=4 OR (s."tenantId"=1 AND s."empresaId" IS NULL) ORDER BY s.id`, [JSON.stringify(visible)]);
  console.log(JSON.stringify({ identity: identity.rows[0], catalog: rows.rows, visibleOwnership:visibleOwnership.rows }, null, 2));
  await client.query('ROLLBACK');
} catch (error) {
  console.error(JSON.stringify({ error: error.code || error.name, message: 'Diagnóstico no completado; no se modificaron registros.' }));
  process.exitCode = 1;
} finally { await client.end(); }
