import { api } from "$lib/server/api";

export async function load() {
  const [summary, gainers, losers, active, sectors, foBan] = await Promise.all([
    api("/v1/market/summary"),
    api("/v1/market/movers?kind=gainers&limit=8"),
    api("/v1/market/movers?kind=losers&limit=8"),
    api("/v1/market/movers?kind=active&limit=8"),
    api("/v1/sectors"),
    api("/v1/market/fo-ban?days=1"),
  ]);
  return { summary, gainers: gainers.results, losers: losers.results, active: active.results, sectors: sectors.sectors, foBan: foBan.latest };
}
