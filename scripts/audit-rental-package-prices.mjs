// Read-only administrative audit. No database writes are available in this CLI.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createAuditClient, readRentalSnapshot, safeFailure } from './lib/rental-package-database.mjs';
import { planRentalPackageRepairs, summarizePlan } from './lib/rental-package-prices.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !arg.startsWith('--output='))) throw Error('ONLY_OUTPUT_ARGUMENT_ALLOWED');
const output = resolve(args.find(arg => arg.startsWith('--output='))?.slice(9) || '.tmp/rental-pricing-audit.json');
const client = createAuditClient();
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = await readRentalSnapshot(client);
  const plan = planRentalPackageRepairs(snapshot);
  await client.query('ROLLBACK');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ snapshot, plan }, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ readOnly: true, output, ...summarizePlan(plan), financialFingerprints: snapshot.financialFingerprints }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({ ...safeFailure(error), readOnly: true }));
  process.exitCode = 1;
} finally { await client.end(); }
