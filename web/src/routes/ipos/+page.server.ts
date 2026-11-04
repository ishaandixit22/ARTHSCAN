import { api } from "$lib/server/api";

const VIEWS = ["gmp", "subscription", "listed"];

export async function load({ url }) {
  const view = VIEWS.includes(url.searchParams.get("view") ?? "") ? url.searchParams.get("view")! : "gmp";
  // Reads the dashboard only: it merges NSE's live board with the IPO Guru calendar and never fails on one source.
  const dashboard = await api("/v1/market/ipo-dashboard", { allowError: true }).catch(() => null);
  return { view, dashboard: dashboard?.rows ? dashboard : null };
}
