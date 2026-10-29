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
import { marketOpen } from "../lib/market-hours.js";

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

export type BreadthShow = "advances" | "declines" | "unchanged" | "highs" | "lows";
type LiveStock = { symbol: string; name: string; sector: string; ltp: number; change_pct: number; volume: number | null; turnover: number;
  vol_ratio: number | null; high_52w: number | null; low_52w: number | null };
let stockCache: { at: number; open: boolean; status: Status; stocks: LiveStock[]; asOf: string | null } | null = null;

/** Every live stock joined to its end-of-day reference; empty outside the trading session. */
async function liveStocks(env: Env, snapshot: () => Promise<{ status: Status; rows: LiveRow[] }>) {
  if (stockCache && Date.now() - stockCache.at < SNAPSHOT_TTL_MS) return stockCache;
  const open = await marketOpen(env);
  // Outside the session the feed's previous close has rolled to today's close, so
  // every change reads 0%: the site shows NSE's closing figures instead.
  const [{ status, rows }, ref] = open ? await Promise.all([snapshot(), reference(env)]) : [{ status: { state: "closed", message: "Market closed", lastTickAt: null }, rows: [] }, await reference(env)];
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
  stockCache = { at: Date.now(), open, status, stocks, asOf: ref.values().next().value?.as_of ?? null };
  return stockCache;
}

const BREADTH: Record<BreadthShow, { pick: (s: LiveStock) => boolean; by: (a: LiveStock, b: LiveStock) => number }> = {
  advances: { pick: (s) => s.change_pct > 0, by: (a, b) => b.change_pct - a.change_pct },
  declines: { pick: (s) => s.change_pct < 0, by: (a, b) => a.change_pct - b.change_pct },
  unchanged: { pick: (s) => s.change_pct === 0, by: (a, b) => b.turnover - a.turnover },
  highs: { pick: (s) => !!s.high_52w && s.ltp > s.high_52w, by: (a, b) => b.change_pct - a.change_pct },
  lows: { pick: (s) => !!s.low_52w && s.ltp < s.low_52w, by: (a, b) => a.change_pct - b.change_pct },
};

/** The live stocks in one breadth bucket, for the breadth page during the session. */
export async function liveBreadth(env: Env, snapshot: () => Promise<{ status: Status; rows: LiveRow[] }>, show: BreadthShow) {
  const { open, status, stocks } = await liveStocks(env, snapshot);
  const counts = Object.fromEntries((Object.keys(BREADTH) as BreadthShow[]).map((k) => [k, stocks.filter(BREADTH[k].pick).length]));
  return { session: open ? "open" : "closed", status, universe: stocks.length, counts, show, stocks: stocks.filter(BREADTH[show].pick).sort(BREADTH[show].by) };
}

export async function liveMarket(env: Env, snapshot: () => Promise<{ status: Status; rows: LiveRow[] }>) {
  if (snapCache && Date.now() - snapCache.at < SNAPSHOT_TTL_MS) return snapCache.body;
  const { open, status, stocks, asOf } = await liveStocks(env, snapshot);
  // ₹1 crore of turnover keeps penny-stock noise out, as on the end-of-day lists.
  const liquid = stocks.filter((s) => s.turnover >= 1e7);
  const top = <T,>(xs: T[], by: (x: T) => number, n = 50) => [...xs].sort((a, b) => by(b) - by(a)).slice(0, n);

  const sectors = new Map<string, number[]>();
  for (const s of stocks) if (s.turnover >= 1e6) sectors.set(s.sector, [...(sectors.get(s.sector) ?? []), s.change_pct]);

  const body = {
    status,
    session: open ? "open" : "closed",
    eod_as_of: asOf,
    universe: "Ordinary shares on NSE: main board (EQ, BE, BZ) and SME (SM, ST); ETFs excluded",
    stocks: stocks.length,
    breadth: {
      advances: stocks.filter(BREADTH.advances.pick).length,
      declines: stocks.filter(BREADTH.declines.pick).length,
      unchanged: stocks.filter(BREADTH.unchanged.pick).length,
      at_52w_high: stocks.filter(BREADTH.highs.pick).length,
      at_52w_low: stocks.filter(BREADTH.lows.pick).length,
      turnover_cr: Math.round(stocks.reduce((a, s) => a + s.turnover, 0) / 1e7),
    },
    movers: {
      gainers: top(liquid, (s) => s.change_pct),
      losers: top(liquid, (s) => -s.change_pct),
      active: top(liquid, (s) => s.turnover),
    },
    signals: {
      volume_spike: top(liquid.filter((s) => (s.vol_ratio ?? 0) >= 3), (s) => s.vol_ratio ?? 0, 100),
      breakout_high: top(liquid.filter(BREADTH.highs.pick), (s) => s.turnover, 100),
      breakout_low: top(liquid.filter(BREADTH.lows.pick), (s) => s.turnover, 100),
    },
    sectors: [...sectors].map(([sector, xs]) => ({ sector, stocks: xs.length, median_change: median(xs) })),
  };
  snapCache = { at: Date.now(), body };
  return body;
}
