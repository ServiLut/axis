import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as policy from '../lib/psychology-bot-policy.mjs';
import { botCases } from './fixtures/psychology-bot-cases.mjs';

for (const scenario of botCases()) {
  test(scenario.name, () => {
    const actual = policy[scenario.fn](...scenario.args);
    if (typeof scenario.expected !== 'object') assert.equal(actual, scenario.expected);
    else for (const [key, value] of Object.entries(scenario.expected)) assert.deepEqual(actual[key], value, key);
  });
}
test('No cantidades fraccionarias o negativas', () => {
  for (const quantity of [-1, 0.5, NaN, Infinity]) assert.throws(() => policy.ancillaryCharge({ kind: 'printing', quantity }));
  assert.throws(() => policy.ancillaryCharge({ kind: 'overtime', quantity: 31 }));
});
test('Especialidades exclusivas', () => {
  assert.deepEqual(policy.professionalsFor('sexologia'), ['DIANA_MARCELA']);
  assert.deepEqual(policy.professionalsFor('certificado'), ['DEICY_ACEVEDO']);
  assert.deepEqual(policy.professionalsFor('infantil'), ['DIXON_OBRAIAN', 'DEICY_ACEVEDO']);
});
