import { error } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { indexBySlug } from "$lib/indices";

export type Constituent = {
  symbol: string; name: string; isin: string | null; sector: string; close: number | null; change_pct: number | null; turnover: number | null;
  shares: number | null; iwf: number | null; mcap_cr: number | null; ff_mcap_cr: number | null; weight: number | null;
};

export async function load({ params }) {
  const info = indexBySlug(params.slug);
  if (!info) error(404, "No such index page.");
  const name = encodeURIComponent(info.name);
  const [history, members, etfs] = await Promise.all([
    // Every stored close: the 1W to Max charts, the day's numbers, 52-week range and valuation.
    api(`/v1/market/valuations?index=${name}&days=5000`, { allowError: true }).catch(() => null),
    info.heatmap ? api(`/v1/market/index-constituents?index=${info.heatmap}`, { allowError: true }).catch(() => null) : null,
    info.etfs.length ? api(`/v1/quotes?symbols=${info.etfs.map((e) => e.symbol).join(",")}`, { allowError: true }).catch(() => null) : null,
  ]);
  type Day = { date: string; open: number | null; high: number | null; low: number | null; close: number | null; change_pct: number | null; pe: number | null; pb: number | null; div_yield: number | null };
  const days = ((history?.history ?? []) as Day[]).filter((d) => d.close != null);
  const constituents = (members?.constituents ?? []) as Constituent[];
  const quotes = new Map(((etfs?.quotes ?? []) as any[]).map((q) => [q.symbol, q]));
  const etfRows = info.etfs.flatMap((e) => {
    const q = quotes.get(e.symbol);
    return q ? [{ ...e, isin: q.isin as string | null, close: q.close as number | null, change_pct: q.change_pct as number | null, turnover: q.turnover as number | null }] : [];
  });
  return {
    info, days, peRange: history?.pe_range ?? null,
    constituents, constituentsAsOf: (members?.as_of ?? null) as string | null, weighted: (members?.weighted ?? 0) as number,
    etfs: etfRows,
  };
}
