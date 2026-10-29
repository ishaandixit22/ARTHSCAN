// Market-wide views computed from live prices: breadth, gainers/losers/most
// active, sector moves, and the signals that are meaningful intraday (volume
// spikes against the 20-day average, new 52-week highs/lows). Everything else
// — RSI, MACD, moving-average crosses — is defined on closing prices and stays
// on the end-of-day tables.
//
// Live rows come from the LiveFeed Durable Object's /all snapshot; the
// per-stock reference (sector, 20-day average volume, 52-week range) is the
// latest end-of-day stock_metrics, cached per isolate.

import type { Env } from "../env.js";

type Ref = {
  symbol: string; name: string; sector: string; avg_volume_20d: number | null;
  high_52w: number | null; low_52w: number | null; close: number | null; as_of: string;
};
type LiveRow = [symbol: string, ltp: number, changePct: number | null, volume: number | null, atp: number | null];
type Status = { state: string; message: string; lastTickAt: number | null };

const REF_TTL_MS = 10 * 60_000;
const SNAPSHOT_TTL_MS = 5_000;
let refCache: { at: number; bySymbol: Map<string, Ref> } | null = null;
let snapCache: { at: number; body: unknown } | null = null;

async function reference(env: Env): Promise<Map<string, Ref>> {
  if (refCache && Date.now() - refCache.at < REF_TTL_MS) return refCache.bySymbol;
  // Ordinary shares only (no ETFs), as the end-of-day movers.
  const { results } = await env.DB.prepare(`
    SELECT s.symbol, s.name, COALESCE(s.sector, 'Other') AS sector, m.avg_volume_20d, m.high_52w, m.low_52w, m.close, m.as_of
    FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
    WHERE COALESCE(s.instrument_type, 'ES') = 'ES' AND m.as_of = (SELECT MAX(as_of) FROM stock_metrics)`).all<Ref>();
  refCache = { at: Date.now(), bySymbol: new Map(results.map((r) => [r.symbol, r])) };
  return refCache.bySymbol;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  return Math.round(v[Math.floor(v.length / 2)] * 100) / 100;
};

export async function liveMarket(env: Env, snapshot: () => Promise<{ status: Status; rows: LiveRow[] }>) {
  if (snapCache && Date.now() - snapCache.at < SNAPSHOT_TTL_MS) return snapCache.body;
  const [{ status, rows }, ref] = await Promise.all([snapshot(), reference(env)]);

  const stocks = rows.flatMap(([symbol, ltp, changePct, volume, atp]) => {
    const r = ref.get(symbol);
    if (!r || changePct === null) return [];
    const turnover = volume && (atp || ltp) ? volume * (atp || ltp) : 0;
    return [{
      symbol, name: r.name, sector: r.sector, ltp, change_pct: changePct, volume, turnover: Math.round(turnover),
      vol_ratio: volume && r.avg_volume_20d ? Math.round((volume / r.avg_volume_20d) * 100) / 100 : null,
      high_52w: r.high_52w, low_52w: r.low_52w,
    }];
  });
  // ₹1 crore of turnover keeps penny-stock noise out, as on the end-of-day lists.
  const liquid = stocks.filter((s) => s.turnover >= 1e7);
  const top = <T,>(xs: T[], by: (x: T) => number, n = 50) => [...xs].sort((a, b) => by(b) - by(a)).slice(0, n);

  const sectors = new Map<string, number[]>();
  for (const s of stocks) if (s.turnover >= 1e6) sectors.set(s.sector, [...(sectors.get(s.sector) ?? []), s.change_pct]);

  const body = {
    status,
    eod_as_of: ref.values().next().value?.as_of ?? null,
    stocks: stocks.length,
    breadth: {
      advances: stocks.filter((s) => s.change_pct > 0).length,
      declines: stocks.filter((s) => s.change_pct < 0).length,
      unchanged: stocks.filter((s) => s.change_pct === 0).length,
      at_52w_high: stocks.filter((s) => s.high_52w && s.ltp > s.high_52w).length,
      at_52w_low: stocks.filter((s) => s.low_52w && s.ltp < s.low_52w).length,
      turnover_cr: Math.round(stocks.reduce((a, s) => a + s.turnover, 0) / 1e7),
    },
    movers: {
      gainers: top(liquid, (s) => s.change_pct),
      losers: top(liquid, (s) => -s.change_pct),
      active: top(liquid, (s) => s.turnover),
    },
    signals: {
      volume_spike: top(liquid.filter((s) => (s.vol_ratio ?? 0) >= 3), (s) => s.vol_ratio ?? 0, 100),
      breakout_high: top(liquid.filter((s) => s.high_52w && s.ltp > s.high_52w), (s) => s.turnover, 100),
      breakout_low: top(liquid.filter((s) => s.low_52w && s.ltp < s.low_52w), (s) => s.turnover, 100),
    },
    sectors: [...sectors].map(([sector, xs]) => ({ sector, stocks: xs.length, median_change: median(xs) })),
  };
  snapCache = { at: Date.now(), body };
  return body;
}
