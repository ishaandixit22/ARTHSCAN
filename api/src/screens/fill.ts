// Background loads the screens depend on, each a small batch on the ten-minute cron, so nothing
// waits on one long run and a provider limit only slows the fill.

import type { Env } from "../env.js";
import { dhanPost, companyInfo } from "../lib/dhan.js";
import { nseFetch } from "../lib/nse.js";
import { providerName } from "../lib/results.js";
import { INDIANAPI_TIMEOUT_MS } from "../lib/upstream.js";
import { floatsToBase64 } from "./store.js";

const DHAN_GAP_MS = 220; // Dhan allows 5 data calls a second
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IST_MS = 5.5 * 3600_000;
const istDate = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const FIELDS = 6;
/** Older daily rows kept per stock, on top of what daily_prices holds. */
const OLDER_DAILY_ROWS = 280;
/** Months kept beyond those: long enough for every monthly rule. */
const OLDER_MONTH_ROWS = 180;
const SNAPSHOT_DAYS = 7;
const DAY = 86400;

/** Older candles from Dhan, split into recent days and older months, on our share basis. */
export function splitHistory(rows: { date: string; o: number; h: number; l: number; c: number; v: number }[], firstLocal: string, localClose: number | null) {
  const overlap = rows.find((r) => r.date === firstLocal);
  // Dhan's close can differ a little from NSE's official one; matching them at the join removes a step.
  const scale = overlap && localClose && overlap.c > 0 ? localClose / overlap.c : 1;
  const older = rows.filter((r) => r.date < firstLocal);
  const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400_000);
  const recent = older.slice(-OLDER_DAILY_ROWS);
  const daily = new Float32Array(recent.length * FIELDS);
  recent.forEach((r, i) => daily.set([day(r.date), r.o * scale, r.h * scale, r.l * scale, r.c * scale, r.v / scale], i * FIELDS));
  // Months wholly before the kept daily rows.
  const cut = recent[0]?.date.slice(0, 7) ?? "9999";
  const months: number[][] = [];
  let open = "";
  for (const r of older) {
    const m = r.date.slice(0, 7);
    if (m >= cut) break;
    const last = months[months.length - 1];
    if (m !== open || !last) { months.push([day(r.date), r.o * scale, r.h * scale, r.l * scale, r.c * scale, r.v / scale]); open = m; }
    else { last[0] = day(r.date); last[2] = Math.max(last[2], r.h * scale); last[3] = Math.min(last[3], r.l * scale); last[4] = r.c * scale; last[5] += r.v / scale; }
  }
  const keptMonths = months.slice(-OLDER_MONTH_ROWS);
  const monthly = new Float32Array(keptMonths.length * FIELDS);
  keptMonths.forEach((m, i) => monthly.set(m, i * FIELDS));
  let ath: number | null = null, atl: number | null = null;
  for (const r of older) {
    if (r.h > 0 && (ath === null || r.h * scale > ath)) ath = r.h * scale;
    if (r.l > 0 && (atl === null || r.l * scale < atl)) atl = r.l * scale;
  }
  return { daily, monthly, ath, atl };
}

/** Loads full daily history for stocks not yet held, largest first. One-off per stock. */
export async function fillLongHistory(env: Env, max = 120) {
  const { results: queue } = await env.DB.prepare(`SELECT s.symbol, s.dhan_security_id AS id FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
    LEFT JOIN price_long p ON p.symbol = s.symbol
    WHERE s.dhan_security_id IS NOT NULL AND COALESCE(s.instrument_type, 'ES') = 'ES' AND p.symbol IS NULL ORDER BY COALESCE(m.turnover, 0) DESC LIMIT ?`).bind(max).all<{ symbol: string; id: string }>();
  let loaded = 0, failed = 0, stop: string | null = null;
  const today = istDate(Date.now());
  for (const { symbol, id } of queue) {
    const started = Date.now();
    const r = await dhanPost(env, "/charts/historical", {
      securityId: id, exchangeSegment: "NSE_EQ", instrument: "EQUITY", expiryCode: 0, oi: false,
      fromDate: "1995-01-01", toDate: today,
    }, "daily candles", 12_000);
    const d = r.ok ? (r.data as { timestamp?: number[]; open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }) : null;
    if (d && Array.isArray(d.timestamp)) {
      const first = await env.DB.prepare("SELECT date, close * adj AS c FROM daily_prices WHERE symbol = ? ORDER BY date LIMIT 1").bind(symbol).first<{ date: string; c: number }>();
      const rows = d.timestamp.map((t, i) => ({ date: istDate(t * 1000), o: d.open[i], h: d.high[i], l: d.low[i], c: d.close[i], v: d.volume?.[i] ?? 0 }));
      const s = splitHistory(rows, first?.date ?? today, first?.c ?? null);
      await env.DB.prepare("INSERT OR REPLACE INTO price_long (symbol, fetched_on, ath, atl, daily, monthly) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(symbol, today, s.ath, s.atl, floatsToBase64(s.daily), floatsToBase64(s.monthly)).run();
      loaded++;
    } else if (!r.ok && r.upstream === 400) {
      // Dhan holds nothing for this one. Mark it, or it would sit at the head of the queue for good.
      await env.DB.prepare("INSERT OR REPLACE INTO price_long (symbol, fetched_on) VALUES (?, ?)").bind(symbol, today).run();
      failed++;
    } else {
      failed++;
      stop = r.ok ? "no candles" : r.error;
      if (!r.ok && r.upstream !== undefined) break; // refused (limit or token): try again next run
    }
    const rest = DHAN_GAP_MS - (Date.now() - started);
    if (rest > 0) await wait(rest);
  }
  return { asked: queue.length, loaded, failed, stop };
}

/** Dhan's company snapshot for stocks not asked this week: market cap (for share count), sector P/E, industry P/B. */
export async function fillSnapshots(env: Env, max = 120) {
  const now = Math.floor(Date.now() / 1000);
  const { results: queue } = await env.DB.prepare(`SELECT s.symbol, m.close FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
    LEFT JOIN company_snapshot c ON c.symbol = s.symbol
    WHERE s.dhan_security_id IS NOT NULL AND COALESCE(s.instrument_type, 'ES') = 'ES' AND (c.symbol IS NULL OR c.fetched_at < ?)
    ORDER BY (c.symbol IS NULL) DESC, COALESCE(m.turnover, 0) DESC LIMIT ?`).bind(now - SNAPSHOT_DAYS * DAY, max).all<{ symbol: string; close: number | null }>();
  let saved = 0, failed = 0;
  for (const { symbol, close } of queue) {
    const started = Date.now();
    const r = await companyInfo(env, symbol);
    if (r.ok) {
      const o = (r as unknown as { overview: Record<string, number | null>; ratios: Record<string, number | null> });
      await env.DB.prepare("INSERT OR REPLACE INTO company_snapshot (symbol, fetched_at, price, market_cap_cr, pe, pe_to_sector, industry_pb) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(symbol, now, close, o.overview?.market_cap_cr ?? null, o.ratios?.pe ?? null, o.ratios?.pe_to_sector_pe ?? null, o.ratios?.industry_pb ?? null).run();
      saved++;
    } else {
      failed++;
      if (r.upstream === 400 || r.status === 404) {
        await env.DB.prepare("INSERT OR REPLACE INTO company_snapshot (symbol, fetched_at, price) VALUES (?, ?, ?)").bind(symbol, now, close).run();
      } else if (r.upstream !== undefined) break;
    }
    const rest = DHAN_GAP_MS - (Date.now() - started);
    if (rest > 0) await wait(rest);
  }
  return { asked: queue.length, saved, failed };
}

/** Current ratio and cash per share from the provider's company answer. Shares the statements' request budget. */
export async function fillKeyMetrics(env: Env, opts: { perRun?: number; dailyWhileStatementsFill?: number } = {}) {
  if (!env.INDIANAPI_KEY) return { asked: 0, saved: 0, stop: null as string | null };
  const now = Math.floor(Date.now() / 1000);
  // Shares the statements' daily request count, so the two together stay within the provider plan.
  const day = istDate(Date.now());
  const counter = `statements:count:${day}`, ownCounter = `screen_metrics:count:${day}`;
  const countOf = async (key: string) => Number((await env.DB.prepare("SELECT body FROM external_cache WHERE key = ?").bind(key).first<{ body: string }>())?.body ?? 0);
  const [used, own] = await Promise.all([countOf(counter), countOf(ownCounter)]);
  const cap = Number(env.STATEMENTS_DAILY_MAX) || 300;
  const waiting = (await env.DB.prepare("SELECT COUNT(*) AS n FROM stocks s LEFT JOIN company_statements c ON c.symbol = s.symbol JOIN stock_metrics m ON m.symbol = s.symbol WHERE c.symbol IS NULL").first<{ n: number }>())?.n ?? 0;
  // While company statements are still loading they come first, since far more screens need them.
  const limit = waiting > 0 ? Math.min(cap - used, (opts.dailyWhileStatementsFill ?? 60) - own) : cap - used;
  const room = Math.min(opts.perRun ?? 5, limit);
  if (room <= 0) return { asked: 0, saved: 0, stop: null as string | null };
  const { results: queue } = await env.DB.prepare(`SELECT s.symbol, s.name FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
    JOIN company_statements st ON st.symbol = s.symbol AND st.found = 1
    LEFT JOIN company_metrics c ON c.symbol = s.symbol
    WHERE c.symbol IS NULL OR c.fetched_at < ? ORDER BY (c.symbol IS NULL) DESC, COALESCE(m.turnover, 0) DESC LIMIT ?`).bind(now - 90 * DAY, room).all<{ symbol: string; name: string }>();
  let asked = 0, saved = 0, stop: string | null = null;
  const metric = (raw: any, group: string, key: string) => {
    const rows = raw?.keyMetrics?.[group];
    const v = Array.isArray(rows) ? rows.find((x: any) => x?.key === key)?.value : null;
    const n = v === null || v === undefined || v === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  for (const { symbol, name } of queue) {
    asked++;
    const res = await fetch(`${env.INDIANAPI_BASE_URL || "https://stock.indianapi.in"}/stock?${new URLSearchParams({ name: providerName(name) })}`,
      { headers: { "x-api-key": env.INDIANAPI_KEY, accept: "application/json" }, signal: AbortSignal.timeout(INDIANAPI_TIMEOUT_MS) }).catch(() => null);
    if (res?.status === 429) { stop = "provider limit"; break; }
    const raw = res?.ok ? await res.json().catch(() => null) as any : null;
    const found = raw?.keyMetrics ? 1 : 0;
    await env.DB.prepare("INSERT OR REPLACE INTO company_metrics (symbol, fetched_at, found, current_ratio, cash_per_share) VALUES (?, ?, ?, ?, ?)")
      .bind(symbol, now, found, found ? metric(raw, "financialstrength", "currentRatioMostRecentFiscalYear") : null, found ? metric(raw, "persharedata", "cashPerShareMostRecentFiscalYear") : null).run();
    if (found) saved++;
  }
  if (asked) {
    const put = "INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at";
    await env.DB.batch([env.DB.prepare(put).bind(counter, String(used + asked), now), env.DB.prepare(put).bind(ownCounter, String(own + asked), now)]);
  }
  return { asked, saved, stop };
}

/** Nifty 50 and 500 members from NSE's public lists. A failed read keeps the last good list. */
export async function refreshIndexMembers(env: Env) {
  const lists = { nifty50: "ind_nifty50list", nifty500: "ind_nifty500list" };
  const out: Record<string, number> = {};
  for (const [name, file] of Object.entries(lists)) {
    const r = await nseFetch(env, `https://nsearchives.nseindia.com/content/indices/${file}.csv`, 24 * 3600, (body) =>
      body.split(/\r?\n/).slice(1).map((l) => l.split(",")[2]?.trim()).filter((x): x is string => !!x)).catch((e) => { console.error(`index list ${name}:`, e); return null; });
    if (!r?.data?.length) continue;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM index_members WHERE index_name = ?").bind(name),
      env.DB.prepare("INSERT OR IGNORE INTO index_members (index_name, symbol) SELECT ?, value FROM json_each(?)").bind(name, JSON.stringify(r.data)),
    ]);
    out[name] = r.data.length;
  }
  return out;
}
