import assert from "node:assert/strict";
import { test } from "node:test";
import { bogotaToday, getBogotaDayRange } from "../lib/bogota-date";
import { clientPhoneVariants, clientWhatsAppUrl, normalizeClientPhone } from "../lib/client-phone";

test("international telephone notation preserves country codes", () => {
  assert.equal(normalizeClientPhone("+1 (202) 555-0123"), "+12025550123");
  assert.equal(normalizeClientPhone("0048 500 600 700"), "+48500600700");
  assert.equal(normalizeClientPhone("3001234567"), "3001234567");
  assert.equal(normalizeClientPhone(""), "");
});

test("invalid phone numbers cannot become WhatsApp links", () => {
  for (const value of ["No Concretado", "++5712345678", "+0123456789", "123", "+1234567890123456", "abc123456789"]) {
    assert.throws(() => normalizeClientPhone(value));
    assert.equal(clientWhatsAppUrl(value), null);
  }
});

test("Colombian local, prefixed and international numbers match legacy duplicates", () => {
  for (const value of ["3001234567", "573001234567", "+57 3001234567"]) {
    const candidates = clientPhoneVariants(value);
    assert.ok(candidates.includes("3001234567"));
    assert.ok(candidates.includes("573001234567"));
    assert.ok(candidates.includes("+573001234567"));
  }
  assert.ok(!clientPhoneVariants("+1 2025550123").includes("2025550123"));
});

test("WhatsApp links do not attach Colombia to international numbers", () => {
  assert.equal(clientWhatsAppUrl("+1 2025550123"), "https://wa.me/12025550123");
  assert.equal(clientWhatsAppUrl("+48 500600700"), "https://wa.me/48500600700");
  assert.equal(clientWhatsAppUrl("3001234567"), "https://wa.me/573001234567");
  assert.equal(clientWhatsAppUrl("+1234567890"), "https://wa.me/1234567890");
});

test("dashboard uses the entire selected Bogotá day regardless of server timezone", () => {
  const { start, end } = getBogotaDayRange("2026-09-23");
  assert.equal(start.toISOString(), "2026-09-23T05:00:00.000Z");
  assert.equal(end.toISOString(), "2026-09-24T05:00:00.000Z");
  assert.equal(bogotaToday(new Date("2026-09-24T04:59:59Z")), "2026-09-23");
  assert.equal(bogotaToday(new Date("2026-09-24T05:00:00Z")), "2026-09-24");
});

test("date ranges handle leap days and year boundaries and reject impossible dates", () => {
  assert.equal(getBogotaDayRange("2024-02-29").end.toISOString(), "2024-03-01T05:00:00.000Z");
  assert.equal(getBogotaDayRange("2026-12-31").end.toISOString(), "2027-01-01T05:00:00.000Z");
  for (const invalid of ["", "2026-02-29", "2026-13-01", "2026-04-31", "23/09/2026", "2026-09-23T12:00:00"]) {
    assert.throws(() => getBogotaDayRange(invalid));
  }
});
