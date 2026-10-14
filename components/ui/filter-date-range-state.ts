export type DateRangeState = {
  url: string;
  startDate: string;
  endDate: string;
  pendingUrls: string[];
  revision: number;
};

const readUrl = (url: string) => new URL(url, "https://axis.local");

export function createDateRangeState(url: string, revision = 0): DateRangeState {
  const params = readUrl(url).searchParams;
  return { url, startDate: params.get("startDate") || "", endDate: params.get("endDate") || "", pendingUrls: [], revision };
}

export function syncDateRangeState(state: DateRangeState, url: string): DateRangeState {
  if (url === state.url) return state;
  const ownUpdate = state.pendingUrls.indexOf(url);
  if (ownUpdate !== -1) {
    // An older navigation acknowledgement must not overwrite a newer input edit.
    return { ...state, url, pendingUrls: state.pendingUrls.slice(ownUpdate + 1) };
  }
  const incoming = createDateRangeState(url, state.revision + 1);
  const previous = createDateRangeState(state.url);
  const incomingUrl = readUrl(url);
  if (incomingUrl.search && incomingUrl.pathname === readUrl(state.url).pathname && incoming.startDate === previous.startDate && incoming.endDate === previous.endDate) {
    // Another filter can change while a date edit is still waiting for debounce.
    return { ...state, url };
  }
  return incoming;
}

export function planDateRangeUpdate(state: DateRangeState, startDate: string, endDate: string, revision: number): { state: DateRangeState; url: string } | null {
  if (revision !== state.revision || startDate !== state.startDate || endDate !== state.endDate) return null;
  const current = readUrl(state.url);
  const params = current.searchParams;
  if ((params.get("startDate") || "") === startDate && (params.get("endDate") || "") === endDate) return null;
  if (startDate) params.set("startDate", startDate); else params.delete("startDate");
  if (endDate) params.set("endDate", endDate); else params.delete("endDate");
  params.set("page", "1");
  const url = `${current.pathname}?${params.toString()}`;
  return { url, state: { ...state, pendingUrls: [...state.pendingUrls, url] } };
}
