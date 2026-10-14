// Defaults to dry-run. --apply requires the exact reviewed plan and actor/reason.
// This script never updates a receipt, payment, cash movement or historic price.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createAuditClient, readRentalSnapshot, safeFailure } from './lib/rental-package-database.mjs';
import { planRentalPackageRepairs, summarizePlan } from './lib/rental-package-prices.mjs';
import { applyRepairPlan, validateApplyOptions } from './lib/rental-package-repair.mjs';

const args = process.argv.slice(2);
const allowed = ['--apply','--plan=','--only-citas=','--actor-id=','--request-id=','--reason=','--output='];
if (args.some(arg => !allowed.some(prefix => prefix === '--apply' ? arg === prefix : arg.startsWith(prefix)))) throw Error('UNRECOGNIZED_ARGUMENT');
const value = prefix => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const isApply = args.includes('--apply');
const planPath = resolve(value('--plan=') || '.tmp/rental-price-repair-plan.json');
const output = resolve(value('--output=') || '.tmp/rental-price-repair-result.json');
const selectedCitaIds = value('--only-citas=')?.split(',') ?? null;
if (selectedCitaIds && (!selectedCitaIds.length || selectedCitaIds.some(id => !/^[1-9]\d{0,17}$/.test(id)) ||
    new Set(selectedCitaIds).size !== selectedCitaIds.length)) throw Error('INVALID_CITA_SELECTION');
const save = async (path, data, exclusive = false) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: exclusive ? 'wx' : 'w' });
};
const client = createAuditClient();
let committed = false;
try {
  await client.connect();
  if (!isApply) {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = await readRentalSnapshot(client);
    const plan = planRentalPackageRepairs(snapshot, selectedCitaIds);
    await client.query('ROLLBACK');
    await save(planPath, { generatedAt: new Date().toISOString(), selectedCitaIds, snapshot, plan });
    console.log(JSON.stringify({ dryRun: true, planPath, ...summarizePlan(plan) }, null, 2));
  } else {
    if (!value('--plan=')) throw Error('REVIEWED_PLAN_FILE_REQUIRED');
    if (selectedCitaIds) throw Error('SELECTION_COMES_FROM_REVIEWED_PLAN');
    const approved = JSON.parse(await readFile(planPath, 'utf8'));
    const requestId = value('--request-id=');
    const backupPath = resolve(`.tmp/rental-price-repair-backup-${requestId}.json`);
    const options = { actorId: Number(value('--actor-id=')), requestId, reason: value('--reason='),
      backup: data => save(backupPath, data, true) };
    validateApplyOptions(options);
    const result = await applyRepairPlan(client, approved, options);
    committed = result.changed;
    await save(output, { recordedAt: new Date().toISOString(), backupPath, ...result });
    console.log(JSON.stringify({ dryRun: false, output, backupPath, ...result }, null, 2));
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({ ...safeFailure(error), committed,
    message: committed ? 'COMMIT completado. Consulta Auditoria mediante requestId antes de reintentar.' : error.commitOutcomeUnknown ?
      'Resultado de COMMIT desconocido. Consulta Auditoria mediante requestId antes de reintentar.' : 'No se aplicaron cambios.' }));
  process.exitCode = 1;
} finally { await client.end(); }
