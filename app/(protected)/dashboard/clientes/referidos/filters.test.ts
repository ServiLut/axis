import assert from "node:assert/strict";
import { test } from "node:test";
import { filterReferrals } from "./filters";

const record = (id: number, created_at: string, nombre: string | null = "Ana") => ({
  id,
  nombre,
  apellido: "Pérez",
  telefono: "3001234567",
  codigo: "PSI-123",
  created_at,
  Usuario: { nombre: "Luisa", apellido: "Gómez" },
});
const records = [
  record(1, "2026-10-14T04:59:59.999Z"),
  record(2, "2026-10-14T05:00:00.000Z"),
  record(3, "2026-10-15T04:59:59.999Z"),
  record(4, "2026-10-14T12:00:00.000Z", "Pedro"),
  record(5, "2026-10-15T05:00:00.000Z"),
];

test("referral date filters combine with search and include the whole Bogotá day", () => {
  const result = filterReferrals(records, "  ANA PÉREZ  ", "2026-10-14", "2026-10-14");
  assert.equal(result.error, null);
  assert.deepEqual(result.rows.map(({ id }) => id), [2, 3]);
});

test("referrals remain searchable by code, phone or referrer with nullable fields", () => {
  for (const term of [" psi-123 ", "3001234567", " LUISA GÓMEZ "]) {
    assert.equal(filterReferrals(records, term, "", "").rows.length, records.length);
  }
  assert.deepEqual(filterReferrals([{ ...records[0], nombre: null, apellido: null, telefono: null, codigo: null, Usuario: null }], "Ana", "", "").rows, []);
});

test("invalid or reversed referral dates return a visible error and no export rows", () => {
  for (const [start, end] of [["2026-02-30", ""], ["", "no-es-fecha"], ["2026-10-15", "2026-10-14"]]) {
    const result = filterReferrals(records, "", start, end);
    assert.ok(result.error);
    assert.deepEqual(result.rows, []);
  }
});

test("referral date bounds work separately and clearing filters restores every record", () => {
  assert.deepEqual(filterReferrals(records, "", "2026-10-15", "").rows.map(({ id }) => id), [5]);
  assert.deepEqual(filterReferrals(records, "", "", "2026-10-13").rows.map(({ id }) => id), [1]);
  assert.deepEqual(filterReferrals(records, "", "", "").rows, records);
});
