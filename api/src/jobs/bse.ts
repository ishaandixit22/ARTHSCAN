// Daily prices for stocks listed only on BSE, from Dhan. They stay in their own tables (see
// migration 0016), so this can't affect the NSE pipeline or anything built on it.
//
//   fillBseHistory  a year of daily candles, a batch every ten minutes; reloaded monthly, because
//                   Dhan's charts are adjusted for splits and bonuses and the evening rows are not.
//   refreshBse      the day's prices each evening, from the quote API: up to 1,000 stocks a call.
//                   The day's close is provisional: without a post-close trade, Dhan's last price is
//                   the last trade, not BSE's close. The next session's quote carries the official
//                   close as its previous close, so each run corrects the session before.

import type { Env } from "../env.js";
import { dhanPost } from "../lib/dhan.js";

const DAY = 86400;
const IST_MS = 5.5 * 3600_000;
const HISTORY_BATCH = 100;
const HISTORY_DAYS = 400;
const RELOAD_DAYS = 30;
// Charts allow 5 calls a second and quotes 1, shared with the live site, so leave it room.
const CHART_GAP_MS = 285;
const QUOTE_GAP_MS = 1100;
const QUOTE_CHUNK = 1000;
const GIVE_UP_AFTER = 5;
// On an ex-date the previous close can be restated for the split or bonus. That isn't a correction,
// so a bigger gap is left for the monthly chart reload, which adjusts the whole history.
const MAX_CLOSE_FIX = 0.1;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const istDate = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);

async function savePrices(env: Env, rows: unknown[][]) {
  const sel = Array.from({ length: 9 }, (_, i) => `json_extract(value, '$[${i}]')`).join(", ");
  for (let i = 0; i < rows.length; i += 150) {
    await env.DB.prepare(`INSERT OR REPLACE INTO bse_daily_prices (symbol, date, open, high, low, close, prev_close, volume, turnover)
      SELECT ${sel} FROM json_each(?)`).bind(JSON.stringify(rows.slice(i, i + 150))).run();
  }
}

/** Sets each stock's last session before the given date to its official close. Returns the rows changed. */
async function correctCloses(env: Env, fixes: unknown[][]) {
  let changed = 0;
  for (let i = 0; i < fixes.length; i += 150) {
    const r = await env.DB.prepare(`UPDATE bse_daily_prices AS p SET close = f.close
      FROM (SELECT json_extract(value, '$[0]') AS symbol, json_extract(value, '$[1]') AS date, json_extract(value, '$[2]') AS close FROM json_each(?)) AS f
      WHERE p.symbol = f.symbol AND p.close <> f.close AND ABS(p.close - f.close) <= p.close * ?
        AND p.date = (SELECT MAX(x.date) FROM bse_daily_prices AS x WHERE x.symbol = f.symbol AND x.date < f.date)`)
      .bind(JSON.stringify(fixes.slice(i, i + 150)), MAX_CLOSE_FIX).run();
    changed += r.meta.changes ?? 0;
  }
  return changed;
}

/** One batch of chart loads: stocks never loaded (busiest first), then those loaded longest ago. Stops if Dhan keeps failing. */
export async function fillBseHistory(env: Env, opts: { batch?: number; gapMs?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const { results: queue } = await env.DB.prepare(`SELECT symbol, dhan_security_id AS id FROM bse_stocks
    WHERE (history_at IS NULL OR history_at < ?) AND (history_failed_at IS NULL OR history_failed_at < ?)
    ORDER BY history_at IS NOT NULL, COALESCE(history_at, 0), median_turnover DESC LIMIT ?`)
    .bind(now - RELOAD_DAYS * DAY, now - DAY, opts.batch ?? HISTORY_BATCH).all<{ symbol: string; id: string }>();

  let loaded = 0, failed = 0, inARow = 0;
  for (const { symbol, id } of queue) {
    await sleep(opts.gapMs ?? CHART_GAP_MS);
    const r = await dhanPost(env, "/charts/historical", {
      securityId: id, exchangeSegment: "BSE_EQ", instrument: "EQUITY", expiryCode: 0, oi: false,
      fromDate: istDate(Date.now() - HISTORY_DAYS * DAY * 1000), toDate: istDate(Date.now() + DAY * 1000),
    }, "BSE chart");
    const c = r.ok ? (r.data as Record<string, number[]>) : null;
    if (!c?.close?.length) {
      failed++;
      await env.DB.prepare("UPDATE bse_stocks SET history_failed_at = ? WHERE symbol = ?").bind(now, symbol).run();
      if (++inARow >= GIVE_UP_AFTER) break;
      continue;
    }
    inARow = 0;
    await savePrices(env, c.close.map((close, i) => [symbol, istDate(c.timestamp[i] * 1000), c.open[i], c.high[i], c.low[i], close,
      i ? c.close[i - 1] : null, c.volume[i], c.volume[i] * close]));
    await env.DB.prepare("UPDATE bse_stocks SET history_at = ?, history_failed_at = NULL WHERE symbol = ?").bind(now, symbol).run();
    loaded++;
  }
  return { asked: loaded + failed, loaded, failed };
}

type Quote = { last_price: number; last_trade_time: string; volume: number; average_price: number; ohlc: { open: number; high: number; low: number; close: number } };

const tradeTime = (q: Quote) => /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(q.last_trade_time ?? "");

/**
 * A row for the day the stock last traded, or null if it hasn't traded. Dhan stamps a stock with no
 * trade yet at midnight, and its ohlc.close is the previous session's close, so last_price is the
 * close for now, until the next session's quote corrects it.
 */
export function quoteRow(symbol: string, q: Quote): unknown[] | null {
  const m = tradeTime(q);
  if (!m || m[4] === "00:00:00" || !(q.last_price > 0)) return null;
  return [symbol, `${m[3]}-${m[2]}-${m[1]}`, q.ohlc?.open ?? null, q.ohlc?.high ?? null, q.ohlc?.low ?? null, q.last_price,
    q.ohlc?.close ?? null, q.volume ?? null, q.volume && q.average_price ? q.volume * q.average_price : null];
}

/** The official close of the session before this quote's date. Stocks with no trade yet carry it too. */
export function closeFix(symbol: string, q: Quote): unknown[] | null {
  const m = tradeTime(q);
  return m && q.ohlc?.close > 0 ? [symbol, `${m[3]}-${m[2]}-${m[1]}`, q.ohlc.close] : null;
}

/** The latest session's prices for every BSE-only stock. Safe to repeat: the same day's row is replaced. */
export async function refreshBse(env: Env, opts: { gapMs?: number } = {}) {
  const { results: stocks } = await env.DB.prepare("SELECT symbol, dhan_security_id AS id FROM bse_stocks").all<{ symbol: string; id: string }>();
  const symbolOf = new Map(stocks.map((s) => [s.id, s.symbol]));
  let saved = 0, corrected = 0, failedCalls = 0;
  for (let i = 0; i < stocks.length; i += QUOTE_CHUNK) {
    if (i) await sleep(opts.gapMs ?? QUOTE_GAP_MS);
    const r = await dhanPost(env, "/marketfeed/quote", { BSE_EQ: stocks.slice(i, i + QUOTE_CHUNK).map((s) => Number(s.id)) }, "BSE quotes");
    if (!r.ok) {
      failedCalls++;
      continue;
    }
    const quotes = ((r.data as { data?: { BSE_EQ?: Record<string, Quote> } }).data?.BSE_EQ) ?? {};
    const rows: unknown[][] = [], fixes: unknown[][] = [];
    for (const [id, q] of Object.entries(quotes)) {
      const symbol = symbolOf.get(id);
      if (!symbol) continue;
      const row = quoteRow(symbol, q), fix = closeFix(symbol, q);
      if (row) rows.push(row);
      if (fix) fixes.push(fix);
    }
    await savePrices(env, rows);
    saved += rows.length;
    corrected += await correctCloses(env, fixes);
  }
  await env.DB.prepare("INSERT INTO pipeline_runs (job, target, status, rows, message) VALUES (?, ?, ?, ?, ?)")
    .bind("bse:prices", istDate(Date.now()), failedCalls ? "error" : "ok", saved, failedCalls ? `${failedCalls} quote calls failed` : null).run()
    .catch((e) => console.error("pipeline_runs:", e));
  return { stocks: stocks.length, saved, corrected, failedCalls };
}
