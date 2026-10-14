import assert from "node:assert/strict";
import { test } from "node:test";
import { getChristmasSeasonYear, getNextChristmasBoundary } from "../lib/christmas-calendar";

const cases: [string, number | null][] = [
  ["2026-10-14T17:00:00Z", null],
  ["2026-11-30T23:59:59-05:00", null],
  ["2026-12-01T04:59:59.999Z", null],
  ["2026-12-01T05:00:00.000Z", 2026],
  ["2026-12-24T23:59:59-05:00", 2026],
  ["2026-12-31T23:59:59-05:00", 2026],
  ["2027-01-01T00:00:00-05:00", 2026],
  ["2027-01-10T23:59:59.999-05:00", 2026],
  ["2027-01-11T05:00:00.000Z", null],
  ["2027-01-31T17:00:00Z", null],
  ["2027-06-15T17:00:00Z", null],
  ["2027-12-01T00:00:00-05:00", 2027],
  ["2028-01-10T23:59:59-05:00", 2027],
  ["2028-01-11T00:00:00-05:00", null],
  ["2028-02-29T17:00:00Z", null],
];

for (const [instant, expected] of cases) {
  test(`Christmas season at ${instant} uses the Colombian calendar`, () => {
    assert.equal(getChristmasSeasonYear(new Date(instant)), expected);
  });
}

test("December and January share their preferences; the next Christmas gets a new key", () => {
  assert.equal(getChristmasSeasonYear(new Date("2026-12-01T05:00:00Z")), getChristmasSeasonYear(new Date("2027-01-10T20:00:00Z")));
  assert.notEqual(getChristmasSeasonYear(new Date("2026-12-01T05:00:00Z")), getChristmasSeasonYear(new Date("2027-12-01T05:00:00Z")));
});

test("the next transition is precisely midnight in Bogota", () => {
  assert.equal(getNextChristmasBoundary(new Date("2026-10-14T12:00:00Z")), Date.parse("2026-12-01T05:00:00Z"));
  assert.equal(getNextChristmasBoundary(new Date("2026-12-01T04:59:59.999Z")), Date.parse("2026-12-01T05:00:00Z"));
  assert.equal(getNextChristmasBoundary(new Date("2026-12-01T05:00:00Z")), Date.parse("2027-01-11T05:00:00Z"));
  assert.equal(getNextChristmasBoundary(new Date("2027-01-11T05:00:00Z")), Date.parse("2027-12-01T05:00:00Z"));
});

test("invalid dates never activate a seasonal decoration", () => {
  assert.equal(getChristmasSeasonYear(new Date(NaN)), null);
  assert.equal(getNextChristmasBoundary(new Date(NaN)), null);
});
