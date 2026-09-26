// One-time repair of catalog rows visually verified in the PSICOLOGOS UI.
// Defaults to a dry run. --apply requires the matching diagnostic and no foreign usage.
import { config } from 'dotenv';
import pg from 'pg';
import { readFile, writeFile } from 'node:fs/promises';
config({ path: '.env.psicologos-db-audit.local', quiet: true });
const apply = process.argv.includes('--apply');
const diagnostic = JSON.parse(await readFile('.tmp/catalogo-diagnostico.json', 'utf8'));
const expected = diagnostic.visibleOwnership;
if (diagnostic.identity.tenantId !== 4 || diagnostic.identity.companyId !== 3 || expected.length !== 50) throw Error('Diagnostic scope incomplete');
const source = expected.filter(r => r.tenantId === 1 && r.empresaId === null);
if (source.length !== 48 || source.some(r => r.packagesOutsidePsychology !== 0)) throw Error('Unexpected source or foreign references');
const ids = source.map(r => r.id);
if (new Set(ids).size !== 48) throw Error('Duplicate source rows');
const client = new pg.Client({ connectionString: process.env.POSTGRES_PRISMA_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
let committed = false;
try {
  await client.connect();
  await client.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN READ ONLY');
  const company = await client.query('SELECT e.nombre FROM "Empresa" e JOIN "Tenant" t ON t.id=e."tenantId" WHERE e.id=3 AND e."tenantId"=4 AND e.estado=true AND t.nombre=$1', ['PSICOLOGOS']);
  if (company.rowCount !== 1 || company.rows[0].nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase() !== 'psicologos en colombia') throw Error('Company not verified');
  if (apply) {
    await client.query('SET LOCAL lock_timeout = \'5s\'');
    await client.query('SELECT id FROM "Tenant" WHERE id=4 FOR UPDATE');
    await client.query('LOCK TABLE "PaqueteAdquirido" IN SHARE MODE');
  }
  const current = await client.query('SELECT s.*,s.id::text AS id,s."precioBase"::text AS "precioBase" FROM "TerapiasPsicologos" s WHERE s.id=ANY($1::bigint[]) ORDER BY s.id' + (apply ? ' FOR UPDATE' : ''), [ids]);
  if (current.rowCount !== 48) throw Error('Missing catalog records');
  for (const row of current.rows) {
    const old = source.find(s => s.id === row.id);
    if (!old || ['tenantId','empresaId','nombre','categoria','cantidadSesiones','precioBase','activo'].some(k => old[k] !== row[k])) throw Error('Catalog changed since review');
  }
  const foreign = await client.query('SELECT count(*)::int AS count FROM "PaqueteAdquirido" WHERE "catalogoId"=ANY($1::bigint[]) AND "tenantId"<>4', [ids]);
  if (foreign.rows[0].count !== 0) throw Error('Catalog used by another system');
  if (!apply) {
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ mode:'dry-run',valid:true,rows:48,foreignPackages:0,changes:['tenantId:1->4','empresaId:null->3'],pricesChanged:false,historyChanged:false }));
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const backup = `.tmp/catalogo-antes-reparacion-${stamp}.json`;
    await writeFile(backup,JSON.stringify({ scope:{tenantId:4,companyId:3},rows:current.rows },null,2)+'\n',{flag:'wx'});
    const changed = await client.query('UPDATE "TerapiasPsicologos" SET "tenantId"=4,"empresaId"=3 WHERE id=ANY($1::bigint[]) AND "tenantId"=1 AND "empresaId" IS NULL RETURNING id::text', [ids]);
    if (changed.rowCount !== 48) throw Error('Incomplete update');
    for (const row of current.rows) {
      await client.query('INSERT INTO "Auditoria" ("tenantId",accion,entidad,"entidadId",detalles,metadata,"createdAt") VALUES (4,$1,$2,$3,$4::jsonb,$5::jsonb,NOW())',
        ['CATALOG_SCOPE_REPAIR','TerapiaPsicologos',row.id,JSON.stringify({ antes:row,despues:{...row,tenantId:4,empresaId:3} }),JSON.stringify({ actor:'Codex',reason:'Catálogo comprobado en PSICOLOGOS; sin uso de paquetes fuera del tenant 4',authorization:'Solicitud de completar integración de producción 2026-09-26' })]);
    }
    await client.query('COMMIT'); committed=true;
    console.log(JSON.stringify({ mode:'applied',rows:48,backup,pricesChanged:false,historyChanged:false,auditRecords:48 }));
  }
} catch (error) {
  if (!committed) await client.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({ error:error.code || error.message,committed }));process.exitCode=1;
} finally { await client.end(); }
