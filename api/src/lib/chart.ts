// Chart candles, the session's quote and the long-history figures, all from Dhan. Same cache and
// token path as lib/dhan.ts: a hit costs Dhan nothing, and only known symbols reach it.

import type { Env } from "../env.js";
import { cached, dhanPost, fail, type Fail, instrument } from "./dhan.js";
import {
  beta, type Candle, dailyCandles, type Day, extremes, monthlyCandles, returns, rollUpIntraday, seasonality, technicals, volumeAnalysis, weeklyCandles,
} from "./price-stats.js";

const IST_MS = 5.5 * 3600_000;
const DAY_MS = 86400_000;
const istDate = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);

// What Dhan serves each intraday size from, and how much one load covers. It allows at most 90
// days a call and five years back; older stretches load as the reader scrolls left.
const INTRADAY: Record<string, { base: string; span: number; days: number }> = {
  "1": { base: "1", span: 1, days: 10 },
  "3": { base: "1", span: 3, days: 20 },
  "5": { base: "5", span: 5, days: 30 },
  "15": { base: "15", span: 15, days: 60 },
  "30": { base: "15", span: 30, days: 90 },
  "60": { base: "60", span: 60, days: 90 },
};
const LONG = new Set(["D", "W", "M"]);
export const isTimeframe = (tf: string) => tf in INTRADAY || LONG.has(tf);
const INTRADAY_LIMIT_DAYS = 5 * 365;
const NIFTY_50_ID = "13";
// Dhan answers daily candles from the listing date, whatever earlier date it is asked for.
const HISTORY_FROM = "1995-01-01";
const LIVE_TTL_S = 60;
const PAST_TTL_S = 6 * 3600;
const DAILY_TTL_S = 15 * 60;
const QUOTE_TTL_S = 15;
const INDEX_TTL_S = 6 * 3600;

type DhanSeries = { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[]; timestamp: number[] };
const hasRows = (d: unknown): d is DhanSeries => Array.isArray((d as DhanSeries)?.timestamp) && (d as DhanSeries).timestamp.length > 0;

function toDays(c: DhanSeries): Day[] {
  return c.timestamp.map((t, i) => ({ date: istDate(t * 1000), open: c.open[i], high: c.high[i], low: c.low[i], close: c.close[i], volume: Math.round(c.volume?.[i] ?? 0) }));
}

async function dailyHistory(env: Env, symbol: string) {
  return cached(`daily/${symbol}`, DAILY_TTL_S, async () => {
    const inst = await instrument(env, symbol);
    if (!inst) return fail(404, `No Dhan instrument for ${symbol}`);
    const r = await dhanPost(env, "/charts/historical", {
      securityId: inst.id, exchangeSegment: inst.segment, instrument: "EQUITY", expiryCode: 0, oi: false,
      fromDate: HISTORY_FROM, toDate: istDate(Date.now() + DAY_MS),
    }, "daily candles");
    if (!r.ok) return r;
    if (!hasRows(r.data)) return fail(404, `Dhan has no daily candles for ${symbol}`);
    return { ok: true as const, days: toDays(r.data) };
  });
}

const niftyHistory = (env: Env) => cached("daily-index/nifty50", INDEX_TTL_S, async () => {
  const r = await dhanPost(env, "/charts/historical", {
    securityId: NIFTY_50_ID, exchangeSegment: "IDX_I", instrument: "INDEX", expiryCode: 0, oi: false,
    fromDate: istDate(Date.now() - 400 * DAY_MS), toDate: istDate(Date.now() + DAY_MS),
  }, "index candles");
  if (!r.ok) return r;
  if (!hasRows(r.data)) return fail(502, "Dhan has no index candles");
  return { ok: true as const, days: toDays(r.data).map((d) => ({ date: d.date, close: d.close })) };
});

// ── The session's quote ────────────────────────────────────────────

type RawQuote = {
  last_price?: number; last_trade_time?: string; volume?: number; average_price?: number; net_change?: number;
  upper_circuit_limit?: number; lower_circuit_limit?: number;
  ohlc?: { open?: number; high?: number; low?: number; close?: number };
};

/** Open, high, low, volume, average price and circuit limits for one stock. `date` is the session it last traded, if any. */
export function quote(env: Env, symbol: string) {
  return cached(`quote/${symbol}`, QUOTE_TTL_S, async () => {
    const inst = await instrument(env, symbol);
    if (!inst) return fail(404, `No Dhan instrument for ${symbol}`);
    // Dhan allows one quote request a second across the account, and opening a page asks more than once,
    // so a refusal is usually only a collision. Without this the chart loses today's candle.
    let r = await dhanPost(env, "/marketfeed/quote", { [inst.segment]: [Number(inst.id)] }, "quote");
    for (let tries = 0; !r.ok && tries < 2; tries++) {
      await new Promise((done) => setTimeout(done, 1100 + Math.random() * 400));
      r = await dhanPost(env, "/marketfeed/quote", { [inst.segment]: [Number(inst.id)] }, "quote");
    }
    if (!r.ok) return r;
    const q = (r.data?.data?.[inst.segment]?.[inst.id] ?? null) as RawQuote | null;
    if (!q) return fail(502, "Dhan returned no quote");
    const stamp = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(q.last_trade_time ?? "");
    const traded = stamp && stamp[4] !== "00:00:00";
    const date = traded ? `${stamp[3]}-${stamp[2]}-${stamp[1]}` : null;
    // After NSE's close, ohlc.close becomes today's close and net_change 0, so the day's change would read
    // as nothing. The session before this one in the daily history is the real previous close.
    let prevClose = q.ohlc?.close || null;
    let change = q.net_change ?? null;
    if (date && prevClose != null && prevClose === q.last_price) {
      const hist = await dailyHistory(env, symbol);
      const before = hist.ok ? hist.days.filter((d) => d.date < date).at(-1) : null;
      if (before?.close) {
        prevClose = before.close;
        change = Math.round((q.last_price - before.close) * 100) / 100;
      }
    }
    return {
      ok: true as const, symbol, fetched_at: new Date().toISOString(),
      date,
      ltp: q.last_price ?? null, change,
      open: q.ohlc?.open || null, high: q.ohlc?.high || null, low: q.ohlc?.low || null, prev_close: prevClose,
      volume: q.volume ?? null, vwap: q.average_price || null,
      value: q.volume && q.average_price ? Math.round(q.volume * q.average_price) : null,
      upper_circuit: q.upper_circuit_limit || null, lower_circuit: q.lower_circuit_limit || null,
    };
  });
}

/** Daily rows with today's session laid over the last one, since the charts API can lag the quote. */
async function dailyWithToday(env: Env, symbol: string) {
  const hist = await dailyHistory(env, symbol);
  if (!hist.ok) return hist;
  const q = await quote(env, symbol);
  const days = hist.days;
  if (!q.ok || !q.date || !q.ltp || !q.open || !q.high || !q.low) return { ok: true as const, days };
  const today: Day = { date: q.date, open: q.open, high: q.high, low: q.low, close: q.ltp, volume: q.volume ?? 0 };
  const last = days[days.length - 1];
  if (last?.date === q.date) return { ok: true as const, days: [...days.slice(0, -1), today] };
  if (!last || last.date < q.date) return { ok: true as const, days: [...days, today] };
  return { ok: true as const, days };
}

// ── Candles for the chart ──────────────────────────────────────────

/**
 * Candles for one timeframe, oldest first, as [ms, open, high, low, close, volume]. Daily and longer
 * come whole. Intraday comes one stretch at a time: pass `before` (ms) for the stretch older than it.
 */
export async function chartCandles(env: Env, symbol: string, tf: string, before?: number): Promise<{ ok: true; symbol: string; tf: string; candles: Candle[]; more: boolean } | Fail> {
  if (LONG.has(tf)) {
    const r = await dailyWithToday(env, symbol);
    if (!r.ok) return r;
    const candles = tf === "D" ? dailyCandles(r.days) : tf === "W" ? weeklyCandles(r.days) : monthlyCandles(r.days);
    return { ok: true, symbol, tf, candles, more: false };
  }

  const spec = INTRADAY[tf];
  const end = before ?? Date.now() + DAY_MS;
  const start = end - spec.days * DAY_MS;
  const toDate = istDate(end), fromDate = istDate(start);
  return cached(`intraday/${symbol}/${tf}/${before ? toDate : "now"}`, before ? PAST_TTL_S : LIVE_TTL_S, async () => {
    const inst = await instrument(env, symbol);
    if (!inst) return fail(404, `No Dhan instrument for ${symbol}`);
    const r = await dhanPost(env, "/charts/intraday", {
      securityId: inst.id, exchangeSegment: inst.segment, instrument: "EQUITY", interval: spec.base, oi: false,
      fromDate: `${fromDate} 09:15:00`, toDate: `${toDate} ${before ? "09:15:00" : "23:59:00"}`,
    }, "candles");
    if (!r.ok) return r;
    const bars: Candle[] = hasRows(r.data)
      ? r.data.timestamp.map((t: number, i: number) => [t, r.data.open[i], r.data.high[i], r.data.low[i], r.data.close[i], Math.round(r.data.volume?.[i] ?? 0)] as Candle)
      : [];
    const rolled = spec.span === Number(spec.base) ? bars : rollUpIntraday(bars, spec.span);
    const candles = rolled.map(([t, o, h, l, c, v]): Candle => [t * 1000, o, h, l, c, v]);
    const reachable = start > Date.now() - INTRADAY_LIMIT_DAYS * DAY_MS;
    return { ok: true as const, symbol, tf, candles, more: reachable && candles.length > 0 };
  });
}

// ── Long-history figures for the stock page ────────────────────────

/** Returns, seasonality, all-time extremes, beta, volume and technicals, worked out from the daily history. */
export async function priceStats(env: Env, symbol: string) {
  return cached(`stats/${symbol}`, 3600, async () => {
    const hist = await dailyWithToday(env, symbol);
    if (!hist.ok) return hist;
    const { days } = hist;
    const nifty = await niftyHistory(env);
    // NSE's file gives delivery percentages; Dhan and the BSE-only tables have none.
    const delivery = new Map<string, number | null>();
    if (!symbol.startsWith("BSE-")) {
      const { results } = await env.DB.prepare("SELECT date, deliv_pct FROM daily_prices WHERE symbol = ? ORDER BY date DESC LIMIT 25").bind(symbol).all<{ date: string; deliv_pct: number | null }>();
      for (const row of results) delivery.set(row.date, row.deliv_pct);
    }
    return {
      ok: true as const, symbol, as_of: days[days.length - 1].date,
      returns: returns(days), extremes: extremes(days), seasonality: seasonality(days),
      beta: nifty.ok ? beta(days, nifty.days) : null,
      volume: volumeAnalysis(days, delivery), technicals: technicals(days),
    };
  });
}
