// Chart candles, the session's quote and the long-history figures, all from Dhan. Same cache and
// token path as lib/dhan.ts: a hit costs Dhan nothing, and only known symbols reach it.

import type { Env } from "../env.js";
import { cached, dhanPost, fail, type Fail, instrument } from "./dhan.js";
import { inSessionHours, istClock } from "./market-hours.js";
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
    if (!inst) return storedHistory(env, symbol, fail(404, `No Dhan instrument for ${symbol}`));
    const r = await dhanPost(env, "/charts/historical", {
      securityId: inst.id, exchangeSegment: inst.segment, instrument: "EQUITY", expiryCode: 0, oi: false,
      fromDate: HISTORY_FROM, toDate: istDate(Date.now() + DAY_MS),
    }, "daily candles");
    // Dhan has no candles for suspended, trade-for-trade and renamed stocks; our own stored sessions still cover them.
    if (!r.ok) return storedHistory(env, symbol, r);
    if (!hasRows(r.data)) return storedHistory(env, symbol, fail(404, `Dhan has no daily candles for ${symbol}`));
    return { ok: true as const, days: toDays(r.data) };
  });
}

/** The sessions we store ourselves (split-adjusted for NSE), when Dhan can't give the history. `why` is returned if there are none. */
async function storedHistory(env: Env, symbol: string, why: Fail): Promise<{ ok: true; days: Day[] } | Fail> {
  const bse = symbol.startsWith("BSE-");
  const { results } = await env.DB.prepare(bse
    ? "SELECT date, open, high, low, close, volume FROM bse_daily_prices WHERE symbol = ? ORDER BY date"
    : "SELECT date, open * adj AS open, high * adj AS high, low * adj AS low, close * adj AS close, CAST(volume / adj AS INTEGER) AS volume FROM daily_prices WHERE symbol = ? ORDER BY date")
    .bind(bse ? symbol.slice(4) : symbol).all<Day>().catch(() => ({ results: [] as Day[] }));
  const days = results.filter((d) => d.close != null).map((d) => ({ ...d, open: d.open ?? d.close, high: d.high ?? d.close, low: d.low ?? d.close, volume: d.volume ?? 0 }));
  return days.length >= 2 ? { ok: true as const, days } : why;
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

type Quote = Awaited<ReturnType<typeof restQuote>>;
type FeedQuote = { ltp: number; prevClose: number | null; change: number | null; open: number | null; high: number | null; low: number | null; volume: number | null; atp: number | null; ltt: number | null };
// The live feed's tick is current if it traded this recently; otherwise ask Dhan's quote API.
const FEED_FRESH_S = 5 * 60;
const CIRCUIT_TTL_S = 6 * 3600;

/**
 * Open, high, low, volume, average price and circuit limits for one stock. `date` is the session it last traded, if any.
 * During the session an NSE stock's figures come from the live feed, which already holds every tick in
 * memory: no Dhan call, and none of the quote API's one-a-second limit. Circuit limits are set once a
 * day, so they come from a quote API answer kept for hours.
 */
export async function quote(env: Env, symbol: string): Promise<Quote> {
  if (!symbol.startsWith("BSE-") && env.LIVE_FEED && inSessionHours()) {
    const live = await feedQuote(env, symbol).catch(() => null);
    if (live) {
      const limits = await cached(`circuits/${symbol}`, CIRCUIT_TTL_S, () => restQuote(env, symbol));
      return {
        ok: true as const, symbol, fetched_at: new Date().toISOString(),
        date: live.ltt ? istDate(live.ltt * 1000) : null,
        ltp: live.ltp, change: live.change,
        open: live.open, high: live.high, low: live.low, prev_close: live.prevClose,
        volume: live.volume, vwap: live.atp,
        value: live.volume && live.atp ? Math.round(live.volume * live.atp) : null,
        upper_circuit: limits.ok ? limits.upper_circuit : null, lower_circuit: limits.ok ? limits.lower_circuit : null,
      };
    }
  }
  return restQuote(env, symbol);
}

async function feedQuote(env: Env, symbol: string): Promise<FeedQuote | null> {
  const stub = env.LIVE_FEED!.get(env.LIVE_FEED!.idFromName("dhan"));
  const res = await stub.fetch(new Request(`https://live/snapshot?symbols=${encodeURIComponent(symbol)}`));
  if (!res.ok) return null;
  const body = (await res.json()) as { status?: { state?: string }; quotes?: Record<string, FeedQuote> };
  const q = body.quotes?.[symbol];
  if (body.status?.state !== "live" || !q?.ltp || !q.ltt || Date.now() / 1000 - q.ltt > FEED_FRESH_S) return null;
  return q;
}

function restQuote(env: Env, symbol: string) {
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
async function computeStats(env: Env, symbol: string, withToday: boolean) {
  const hist = withToday ? await dailyWithToday(env, symbol) : await dailyHistory(env, symbol);
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
}

type StatsRow = { as_of: string | null; computed_at: number | null; body: string | null; latest: string | null };

/** The stored figures and the last session we hold for the stock, in one query. */
function statsRow(env: Env, symbol: string) {
  const bse = symbol.startsWith("BSE-");
  return env.DB.prepare(`SELECT p.as_of, p.computed_at, p.body,
      (SELECT MAX(date) FROM ${bse ? "bse_daily_prices" : "daily_prices"} WHERE symbol = ?) AS latest
    FROM (SELECT 1) LEFT JOIN price_stats p ON p.symbol = ?`)
    .bind(bse ? symbol.slice(4) : symbol, symbol).first<StatsRow>();
}

// The evening refresh stores the session (with NSE's delivery figures) by about 18:30 IST, 13:00 UTC.
const SESSION_STORED_UTC = "13:00:00";

/**
 * Whether stored figures still cover the last session. Figures worked out after the close but before
 * our evening load are kept until that load lands, then worked out once more to pick up its delivery figures.
 */
function current(row: StatsRow | null, now = Date.now()) {
  if (!row?.as_of || row.computed_at == null) return false;
  if (!row.latest) return now / 1000 - row.computed_at < 86400;
  if (row.as_of > row.latest) return true;
  if (row.as_of < row.latest) return false;
  return row.computed_at >= Date.parse(`${row.latest}T${SESSION_STORED_UTC}Z`) / 1000;
}

async function storeStats(env: Env, symbol: string, out: { as_of: string }) {
  await env.DB.prepare("INSERT INTO price_stats (symbol, as_of, body, computed_at) VALUES (?, ?, ?, ?) ON CONFLICT(symbol) DO UPDATE SET as_of = excluded.as_of, body = excluded.body, computed_at = excluded.computed_at")
    .bind(symbol, out.as_of, JSON.stringify(out), Math.floor(Date.now() / 1000)).run();
}

/**
 * The long-history figures for the stock page, from price_stats when they cover the last session.
 * Otherwise they are worked out (one Dhan history call) and, outside market hours, stored. During the
 * session the stored figures run to the previous close; the live quote carries today's move.
 * `stored`: the stored row only, whatever its age, never Dhan (for the server-rendered page).
 */
export async function priceStats(env: Env, symbol: string, opts: { stored?: boolean } = {}) {
  const row = await statsRow(env, symbol).catch(() => null);
  if (row?.body && (opts.stored || current(row))) return JSON.parse(row.body) as Awaited<ReturnType<typeof computeStats>>;
  if (opts.stored) return fail(404, `No stored figures for ${symbol} yet`);
  return cached(`stats/${symbol}`, 3600, async () => {
    const open = inSessionHours();
    const out = await computeStats(env, symbol, open);
    if (out.ok && !open) await storeStats(env, symbol, out).catch(() => {});
    // Dhan's history can be briefly unavailable; yesterday's figures beat none.
    if (!out.ok && row?.body) return JSON.parse(row.body) as typeof out;
    return out;
  });
}

// Intraday screens call Dhan every 5 minutes from 08:30 to 16:25 IST and share its rate limit, so the fill stays out of that window.
const FILL_QUIET_FROM = 8 * 60 + 15, FILL_QUIET_TO = 16 * 60 + 30;

/**
 * One batch of the overnight figures fill: every stock whose stored figures miss its last session,
 * NSE by turnover first, then BSE-only. One Dhan history call each, one after another (Dhan's data
 * limit is 5 a second). About 90 batches a night cover all 5,700 stocks.
 */
export async function fillPriceStats(env: Env, opts: { max?: number; now?: number } = {}) {
  const now = opts.now ?? Date.now();
  const clock = istClock(now);
  const weekday = clock.weekday >= 1 && clock.weekday <= 5;
  if (weekday && clock.minutes >= FILL_QUIET_FROM && clock.minutes < FILL_QUIET_TO) return { asked: 0, stored: 0, failed: 0, skipped: "market hours" as string | null };
  const max = opts.max ?? 70;
  const stamp = `|| 'T${SESSION_STORED_UTC}Z'`;
  // A row is due when it misses the last stored session, or was worked out before that session was stored.
  const due = (latest: string) => `(p.symbol IS NULL OR p.as_of < ${latest} OR (p.as_of = ${latest} AND p.computed_at < CAST(strftime('%s', ${latest} ${stamp}) AS INTEGER)))`;
  const { results: nse } = await env.DB.prepare(`
    SELECT m.symbol, m.as_of AS latest FROM stock_metrics m LEFT JOIN price_stats p ON p.symbol = m.symbol
    WHERE m.as_of >= date((SELECT MAX(as_of) FROM stock_metrics), '-14 days') AND ${due("m.as_of")}
    ORDER BY (p.symbol IS NULL) DESC, COALESCE(m.turnover, 0) DESC LIMIT ?`).bind(max).all<{ symbol: string; latest: string }>();
  const bse = nse.length < max ? (await env.DB.prepare(`
    SELECT 'BSE-' || b.symbol AS symbol, b.latest FROM (
      SELECT s.symbol, s.median_turnover, (SELECT MAX(date) FROM bse_daily_prices d WHERE d.symbol = s.symbol) AS latest FROM bse_stocks s
    ) b LEFT JOIN price_stats p ON p.symbol = 'BSE-' || b.symbol
    WHERE b.latest IS NOT NULL AND ${due("b.latest")}
    ORDER BY (p.symbol IS NULL) DESC, COALESCE(b.median_turnover, 0) DESC LIMIT ?`).bind(max - nse.length).all<{ symbol: string; latest: string }>()).results : [];

  let asked = 0, stored = 0, failed = 0, skipped: string | null = null;
  for (const { symbol, latest } of [...nse, ...bse]) {
    asked++;
    const out = await computeStats(env, symbol, false).catch(() => null);
    if (out?.ok) {
      await storeStats(env, symbol, out);
      stored++;
    } else {
      failed++;
      // Rate-limited: leave the rest for the next batch rather than spend the limit on refusals.
      if (!out || out.status === 429 || out.upstream === 429) {
        skipped = out ? "Dhan rate limit" : "Dhan did not answer";
        break;
      }
      // No history to work from (Dhan has none and we store too little): note it for this session, so it
      // doesn't head the queue every batch. The page answers the same failure either way.
      await storeStats(env, symbol, { ...out, as_of: latest }).catch(() => {});
    }
  }
  return { asked, stored, failed, skipped };
}
