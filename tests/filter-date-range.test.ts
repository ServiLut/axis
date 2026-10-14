import assert from "node:assert/strict";
import { test } from "node:test";
import { createDateRangeState, planDateRangeUpdate, syncDateRangeState } from "../components/ui/filter-date-range-state";

const initialUrl = "/dashboard/monitoreo/auditoria?startDate=2026-10-14&endDate=2026-10-15&page=5&accion=CREATE";

test("initial date values do not write to the URL or reset the current page", () => {
  const state = createDateRangeState(initialUrl);
  assert.equal(state.startDate, "2026-10-14");
  assert.equal(state.endDate, "2026-10-15");
  assert.equal(planDateRangeUpdate(state, state.startDate, state.endDate, state.revision), null);
  assert.equal(new URL(state.url, "https://axis.local").searchParams.get("page"), "5");
});

test("an edited date pair resets the page once and preserves unrelated filters", () => {
  const draft = { ...createDateRangeState(initialUrl), startDate: "2026-10-13", endDate: "2026-10-16" };
  const update = planDateRangeUpdate(draft, draft.startDate, draft.endDate, draft.revision);
  assert.ok(update);
  const params = new URL(update.url, "https://axis.local").searchParams;
  assert.equal(params.get("startDate"), "2026-10-13");
  assert.equal(params.get("endDate"), "2026-10-16");
  assert.equal(params.get("accion"), "CREATE");
  assert.equal(params.get("page"), "1");
  const acknowledged = syncDateRangeState(update.state, update.url);
  assert.equal(planDateRangeUpdate(acknowledged, acknowledged.startDate, acknowledged.endDate, acknowledged.revision), null);
});

test("external Clear empties both dates and invalidates a queued local edit without a page reset", () => {
  const draft = { ...createDateRangeState(initialUrl), startDate: "2026-10-12" };
  const cleared = syncDateRangeState(draft, "/dashboard/monitoreo/auditoria?");
  assert.equal(cleared.startDate, "");
  assert.equal(cleared.endDate, "");
  assert.deepEqual(cleared.pendingUrls, []);
  assert.equal(planDateRangeUpdate(cleared, draft.startDate, draft.endDate, draft.revision), null);
  assert.equal(planDateRangeUpdate(cleared, "", "", cleared.revision), null);
  assert.equal(new URL(cleared.url, "https://axis.local").searchParams.has("page"), false);
});

test("Clear before the first debounce cancels draft dates that have never reached the URL", () => {
  const draft = { ...createDateRangeState("/dashboard/monitoreo/auditoria?accion=CREATE"), startDate: "2026-10-15" };
  const cleared = syncDateRangeState(draft, "/dashboard/monitoreo/auditoria?");
  assert.equal(cleared.startDate, "");
  assert.equal(cleared.endDate, "");
  assert.equal(planDateRangeUpdate(cleared, draft.startDate, draft.endDate, draft.revision), null);
  assert.equal(planDateRangeUpdate(cleared, "", "", cleared.revision), null);
});

test("Back and Forward synchronize date values while preserving each URL page", () => {
  const forwardUrl = "/dashboard/monitoreo/auditoria?startDate=2026-10-01&endDate=2026-10-02&page=8";
  const forward = syncDateRangeState(createDateRangeState(initialUrl), forwardUrl);
  assert.equal(forward.startDate, "2026-10-01");
  assert.equal(forward.endDate, "2026-10-02");
  assert.equal(forward.url, forwardUrl);
  const back = syncDateRangeState(forward, initialUrl);
  assert.equal(back.startDate, "2026-10-14");
  assert.equal(back.endDate, "2026-10-15");
  assert.equal(back.url, initialUrl);
  assert.equal(planDateRangeUpdate(back, back.startDate, back.endDate, back.revision), null);
});

test("an older own URL acknowledgement does not erase the latest pending date edit", () => {
  const draftA = { ...createDateRangeState(initialUrl), startDate: "2026-10-13" };
  const updateA = planDateRangeUpdate(draftA, draftA.startDate, draftA.endDate, draftA.revision);
  assert.ok(updateA);
  const draftB = { ...updateA.state, endDate: "2026-10-17" };
  const afterA = syncDateRangeState(draftB, updateA.url);
  assert.equal(afterA.endDate, "2026-10-17");
  assert.equal(afterA.revision, draftB.revision);
  const updateB = planDateRangeUpdate(afterA, afterA.startDate, afterA.endDate, afterA.revision);
  assert.ok(updateB);
  const afterB = syncDateRangeState(updateB.state, updateB.url);
  assert.equal(afterB.startDate, "2026-10-13");
  assert.equal(afterB.endDate, "2026-10-17");
  assert.equal(planDateRangeUpdate(afterB, afterB.startDate, afterB.endDate, afterB.revision), null);
});

test("another filter URL change preserves a pending date edit and is included in its eventual update", () => {
  const draft = { ...createDateRangeState(initialUrl), startDate: "2026-10-13" };
  const otherFilterUrl = initialUrl.replace("accion=CREATE", "accion=UPDATE");
  const synced = syncDateRangeState(draft, otherFilterUrl);
  assert.equal(synced.startDate, draft.startDate);
  const update = planDateRangeUpdate(synced, synced.startDate, synced.endDate, draft.revision);
  assert.ok(update);
  assert.equal(new URL(update.url, "https://axis.local").searchParams.get("accion"), "UPDATE");
});

test("history navigation discards pending own acknowledgements before applying the historical URL", () => {
  const draftA = { ...createDateRangeState(initialUrl), startDate: "2026-10-13" };
  const updateA = planDateRangeUpdate(draftA, draftA.startDate, draftA.endDate, draftA.revision);
  assert.ok(updateA);
  const historyReset = createDateRangeState(updateA.state.url, updateA.state.revision + 1);
  const historical = syncDateRangeState(historyReset, updateA.url);
  assert.equal(historical.startDate, "2026-10-13");
  assert.equal(historical.endDate, "2026-10-15");
  assert.equal(planDateRangeUpdate(historical, draftA.startDate, draftA.endDate, draftA.revision), null);
});
