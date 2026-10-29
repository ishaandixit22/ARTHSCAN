import { api, ext } from "$lib/server/api";

const TABS = ["active", "upcoming", "closed", "listed"];

export async function load({ url }) {
  const tab = TABS.includes(url.searchParams.get("tab") ?? "") ? url.searchParams.get("tab")! : "active";
  // NSE's live board never blocks the page: if it is down the tabs fall back to the provider list.
  const [board, ipo] = await Promise.all([api("/v1/market/ipo-board", { allowError: true }).catch(() => null), ext<Record<string, any[]>>("/ipo")]);

  // The price journey for recently listed issues: where each trades now, from our own price data.
  let now: Record<string, number> = {};
  if (tab === "listed") {
    const symbols = [...(ipo.data?.listed ?? [])].sort((a, b) => (b.listing_date ?? "").localeCompare(a.listing_date ?? "")).slice(0, 60).map((r) => r.symbol).filter(Boolean);
    const q = symbols.length ? await api<{ quotes: any[] }>("/v1/quotes", { body: { symbols }, allowError: true }).catch(() => null) : null;
    now = Object.fromEntries((q?.quotes ?? []).filter((x) => x.close != null).map((x) => [x.symbol, x.close]));
  }
  return { tab, board: board?.open ? board : null, ipo, now };
}
