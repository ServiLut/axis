import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const policy = (await readFile(new URL('lib/psychology-bot-policy.mjs', root), 'utf8')).replace(/^export /gm, '');
const fixtures = (await readFile(new URL('tests/fixtures/psychology-bot-cases.mjs', root), 'utf8')).replace(/^export /gm, '');
const jsCode = policy + '\n' + fixtures + `
const functions = { receptionDecision, bookingProposal, ancillaryCharge };
return botCases().map(scenario => {
  const actual = functions[scenario.fn](...scenario.args);
  const passed = typeof scenario.expected === 'object'
    ? Object.entries(scenario.expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value))
    : actual === scenario.expected;
  if (!passed) throw new Error('FAILED: ' + scenario.name);
  return { json: { test: scenario.name, result: 'PASS', version: POLICY_VERSION, mode: 'SYNTHETIC_ONLY', sentMessages: 0, databaseWrites: 0 } };
});
`;
const workflow = {
  name: 'Psicólogos | Luisa Fernanda - pruebas de reglas (sin envíos)', active: false,
  nodes: [
    { id: 'manual-tests', name: 'Pruebas manuales', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [240, 320], parameters: {} },
    { id: 'policy-tests', name: 'Validar reglas con casos ficticios', type: 'n8n-nodes-base.code', typeVersion: 2, position: [520, 320], parameters: { mode: 'runOnceForAllItems', jsCode } },
    { id: 'test-scope-note', name: 'Alcance y pendientes', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [200, 0], parameters: { width: 680, height: 240, content: '## Luisa Fernanda · pruebas de reglas\nSólo casos ficticios. NO envía WhatsApp, NO agenda, NO registra pagos.\nComprueba tenant/empresa, respuestas exactas, pasos de recepción, confirmación profesional y tarifas.\nPendiente: canal WhatsApp verificado, credenciales, API idempotente de Axis, catálogo aprobado y pruebas integrales.\nEl triage es una entrada revisada: estas reglas no clasifican riesgo clínico ni sustituyen atención humana.' } },
  ], connections: { 'Pruebas manuales': { main: [[{ node: 'Validar reglas con casos ficticios', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1', timezone: 'America/Bogota', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all', executionTimeout: 60 },
  pinData: {}, tags: [],
};
await mkdir(new URL('automation/n8n/', root), { recursive: true });
const output = new URL('automation/n8n/psicologos-luisa-pruebas.json', root);
await writeFile(output, JSON.stringify(workflow, null, 2) + '\n');
console.log(fileURLToPath(output));
