import { api } from "$lib/server/api";

export async function load() {
  const [summary, gainers, losers, active, sectors, foBan, city, valuations] = await Promise.all([
    api("/v1/market/summary"),
    api("/v1/market/movers?kind=gainers&limit=8"),
    api("/v1/market/movers?kind=losers&limit=8"),
    api("/v1/market/movers?kind=active&limit=8"),
    api("/v1/sectors"),
    api("/v1/market/fo-ban?days=1"),
    // The hero's 3D city: the Nifty 100, by sector. The page still loads without it.
    api("/v1/market/heatmap?period=1d&index=nifty100", { allowError: true }).catch(() => null),
    // Index closes for the front page's index strip.
    api("/v1/market/valuations", { allowError: true }).catch(() => null),
  ]);
  const WANT = ["Nifty 50", "Nifty Bank", "Nifty Midcap 100", "Nifty Smallcap 100", "Nifty IT", "India VIX"];
  const all = (valuations?.indices ?? []) as { index_name: string; close: number | null; change_pct: number | null; pe: number | null }[];
  const indices = WANT.map((n) => all.find((i) => i.index_name === n)).filter((i): i is (typeof all)[number] => !!i);
  const cityStocks = ((city?.sectors ?? []) as { stocks?: any[] }[]).flatMap((g) =>
    (g.stocks ?? []).map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector, change: s.change, close: s.close, turnover: s.turnover ?? 0 })),
  );
  return { summary, gainers: gainers.results, losers: losers.results, active: active.results, sectors: sectors.sectors, foBan: foBan.latest, cityStocks, indices, indicesAsOf: valuations?.as_of ?? null };
}
