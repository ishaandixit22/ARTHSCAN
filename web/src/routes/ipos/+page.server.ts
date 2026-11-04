import { api } from "$lib/server/api";

// Which tab is showing lives in the page, so moving between tabs doesn't fetch the board again.
export async function load() {
  // Reads the dashboard only: it merges NSE's live board with the IPO Guru calendar and never fails on one source.
  const dashboard = await api("/v1/market/ipo-dashboard", { allowError: true }).catch(() => null);
  return { dashboard: dashboard?.rows ? dashboard : null };
}
