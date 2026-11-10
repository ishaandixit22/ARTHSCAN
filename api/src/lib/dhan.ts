// Dhan's REST data APIs (intraday candles, company info), called from the API
// Worker. The LiveFeed Durable Object owns the access token (it renews it), so
// each call first asks it for the current one. Keeping these calls out of the
// Durable Object means a deploy takes effect at once: the object keeps running
// old code until it goes idle, which can be hours while someone watches prices.

import type { Env } from "../env.js";
import { UPSTREAM_TIMEOUT_MS } from "./upstream.js";

const BASE = "https://api.dhan.co/v2";
// Intraday chart ranges: candle size and how many sessions to keep.
export const CANDLE_RANGES: Record<string, { interval: string; sessions: number }> = { "1d": { interval: "5", sessions: 1 }, "5d": { interval: "15", sessions: 5 } };
const CANDLE_TTL_S = 60;
// Ratios and shareholding move slowly; one answer per stock serves for six hours.
const COMPANY_TTL_S = 6 * 3600;
const IST_MS = 5.5 * 3600_000;
// The indices the front page shows, by their Dhan id (segment IDX_I, from Dhan's scrip master).
// The names match index_daily, where their previous closes come from.
export const LIVE_INDICES: Record<string, number> = { "Nifty 50": 13, "Nifty Bank": 25, "NIFTY Midcap 100": 37, "NIFTY Smallcap 100": 5, "Nifty IT": 29, "India VIX": 21 };
// Market Quote allows one request a second; a few seconds' reuse keeps every viewer inside that.
const INDEX_TTL_S = 5;
const COMPANY_FIELDS = {
  overview: { MARKET_CAP: "market_cap_cr", INDUSTRY: "industry", SECTOR: "sector", DIVIDEND_YIELD: "dividend_yield", EPS: "eps", EBITDA: "ebitda_cr", BOOK_VALUE: "book_value", FIFTY_TWO_WEEK_HIGH: "high_52w", FIFTY_TWO_WEEK_LOW: "low_52w" },
  ratios: { PE_RATIO: "pe", PB_RATIO: "pb", DEBT_TO_EQUITY: "debt_to_equity", PE_TO_SECTOR_PE: "pe_to_sector_pe", ROE: "roe", ROCE: "roce", INDUSTRY_EPS: "industry_eps", INDUSTRY_DEBT_TO_EQUITY: "industry_debt_to_equity", INDUSTRY_PB_RATIO: "industry_pb", INDUSTRY_CURRENT_RATIO: "industry_current_ratio", INDUSTRY_DIVIDEND_YIELD: "industry_dividend_yield", INDUSTRY_OPERATING_MARGIN: "industry_operating_margin" },
  shareholding: { REPORTING_PERIOD: "period", PROMOTER_HOLDING: "promoter", DII_HOLDING: "dii", CHANGE_IN_DII_HOLDING: "dii_change", FII_HOLDING: "fii", CHANGE_IN_FII_HOLDING: "fii_change", PUBLIC_HOLDING: "public" },
} as const;
const SECTION_KEYS = { overview: "CO", ratios: "RATIOS", shareholding: "SHP" } as const;

export type Fail = { ok: false; status: number; error: string; /** Dhan's own status, when it answered. */ upstream?: number };
export const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

// The Workers edge cache, when there is one (absent under plain Node).
const edge = (): Cache | null => (typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : null);

/** Serve from the edge cache, or compute and keep successful answers for ttl seconds. */
export async function cached<T extends { ok: boolean }>(key: string, ttl: number, run: () => Promise<T | Fail>): Promise<T | Fail> {
  const cache = edge();
  const req = new Request(`https://dhan.cache/${key}`);
  const hit = await cache?.match(req).catch(() => undefined);
  if (hit) return (await hit.json()) as T;
  const out = await run();
  if (out.ok && cache) await cache.put(req, new Response(JSON.stringify(out), { headers: { "cache-control": `max-age=${ttl}` } })).catch(() => {});
  return out;
}

// Scans make hundreds of calls in one run, and each would otherwise spend a subrequest asking for the token.
let credsMemo: { at: number; creds: { token: string; clientId: string } } | null = null;
const CREDS_MEMO_MS = 60_000;

async function credentials(env: Env): Promise<{ token: string; clientId: string } | null> {
  if (credsMemo && Date.now() - credsMemo.at < CREDS_MEMO_MS) return credsMemo.creds;
  if (env.LIVE_FEED) {
    const res = await env.LIVE_FEED.get(env.LIVE_FEED.idFromName("dhan")).fetch(new Request("https://live/credentials")).catch(() => null);
    const creds = res?.ok ? ((await res.json().catch(() => null)) as { token: string; clientId: string } | null) : null;
    if (creds) { credsMemo = { at: Date.now(), creds }; return creds; }
    console.warn(`dhan credentials: live feed answered ${res?.status ?? "nothing"}; using the configured token`);
  }
  return env.DHAN_ACCESS_TOKEN && env.DHAN_CLIENT_ID ? { token: env.DHAN_ACCESS_TOKEN, clientId: env.DHAN_CLIENT_ID } : null;
}

/** Where Dhan lists a stock. BSE-only stocks carry a BSE- prefix, since a BSE symbol can be another company's NSE symbol. */
export async function instrument(env: Env, symbol: string): Promise<{ id: string; segment: "NSE_EQ" | "BSE_EQ" } | null> {
  const bse = symbol.startsWith("BSE-");
  const row = bse
    ? await env.DB.prepare("SELECT dhan_security_id AS id FROM bse_stocks WHERE symbol = ?").bind(symbol.slice(4)).first<{ id: string | null }>()
    : await env.DB.prepare("SELECT dhan_security_id AS id FROM stocks WHERE symbol = ?").bind(symbol).first<{ id: string | null }>();
  return row?.id ? { id: String(row.id), segment: bse ? "BSE_EQ" : "NSE_EQ" } : null;
}

/** POST to a Dhan data endpoint. Returns the parsed body, or a failure to show. */
async function post(env: Env, path: string, body: unknown, what: string, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<{ ok: true; data: any } | Fail> {
  const creds = await credentials(env);
  if (!creds) return fail(503, "Dhan is not configured");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "access-token": creds.token, "client-id": creds.clientId },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return fail(502, "Dhan is not reachable");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    console.error(`dhan ${what} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return { ...fail(502, `Dhan returned no ${what}`), upstream: res.status };
  }
  return { ok: true, data };
}

export { post as dhanPost };

/** Asks again after a pause when Dhan refuses for the rate limit, which every job on the account shares. */
export async function patient<T extends { ok: boolean }>(ask: () => Promise<T>, pauses = [1200, 2400, 3600]): Promise<T> {
  let r = await ask();
  for (const ms of pauses) {
    if (r.ok || (r as { upstream?: number }).upstream !== 429) break;
    await new Promise((done) => setTimeout(done, ms));
    r = await ask();
  }
  return r;
}

/** The last few sessions of intraday candles for one stock. Times are IST shown as UTC seconds, for the chart. */
export function intradayCandles(env: Env, symbol: string, range: string) {
  return cached(`candles/${symbol}/${range}`, CANDLE_TTL_S, async () => {
    const inst = await instrument(env, symbol);
    if (!inst) return fail(404, `No Dhan instrument for ${symbol}`);
    const { interval, sessions } = CANDLE_RANGES[range];
    // Ask for two weeks so holidays and weekends still leave enough sessions.
    const ist = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
    const now = Date.now();
    const r = await post(env, "/charts/intraday", {
      securityId: inst.id, exchangeSegment: inst.segment, instrument: "EQUITY", interval, oi: false,
      fromDate: `${ist(now - 14 * 86400_000)} 09:15:00`, toDate: `${ist(now + 86400_000)} 00:00:00`,
    }, "candles");
    if (!r.ok) return r;
    const data = r.data as Record<string, number[]>;
    if (!Array.isArray(data.timestamp)) return fail(502, "Dhan returned no candles");
    const all = data.timestamp.map((t, i) => ({
      time: Math.round(t + IST_MS / 1000), day: ist(t * 1000),
      open: data.open[i], high: data.high[i], low: data.low[i], close: data.close[i], volume: Math.round(data.volume[i] ?? 0),
    }));
    const days = [...new Set(all.map((c) => c.day))].slice(-sessions);
    const candles = all.filter((c) => days.includes(c.day)).map(({ day, ...c }) => c);
    // The close before the first kept session, so a one-day chart can say how far the stock has moved.
    // NSE's official close (the last half hour's weighted average) is the base every other page
    // measures from; the previous session's last candle is only a fallback.
    const firstIdx = all.findIndex((c) => c.day === days[0]);
    const official = await env.DB.prepare("SELECT close FROM daily_prices WHERE symbol = ? AND date < ? ORDER BY date DESC LIMIT 1")
      .bind(symbol, days[0]).first<{ close: number }>().catch(() => null);
    const prevClose = official?.close ?? (firstIdx > 0 ? all[firstIdx - 1].close : null);
    return { ok: true as const, symbol, range, interval: Number(interval), sessions: days, prevClose, candles };
  });
}

/** Live index levels from Dhan, each measured against NSE's previous close as stored in index_daily. */
export function liveIndices(env: Env) {
  return cached("indices", INDEX_TTL_S, async () => {
    const r = await post(env, "/marketfeed/ltp", { IDX_I: Object.values(LIVE_INDICES) }, "index prices");
    if (!r.ok) return r;
    const quotes = (r.data?.data?.IDX_I ?? {}) as Record<string, { last_price?: number }>;
    const today = new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
    const names = Object.keys(LIVE_INDICES);
    const { results } = await env.DB.prepare(`
      SELECT d.index_name, d.close FROM index_daily d
      JOIN (SELECT index_name, MAX(date) AS date FROM index_daily WHERE date < ? AND index_name IN (${names.map(() => "?").join(",")}) GROUP BY index_name) last
        ON last.index_name = d.index_name AND last.date = d.date`).bind(today, ...names).all<{ index_name: string; close: number | null }>();
    const prev = new Map(results.map((x) => [x.index_name, x.close]));
    const indices = names.flatMap((index_name) => {
      const ltp = quotes[String(LIVE_INDICES[index_name])]?.last_price;
      if (!ltp) return [];
      const prev_close = prev.get(index_name) ?? null;
      const change_pct = prev_close ? Math.round(((ltp - prev_close) / prev_close) * 10000) / 100 : null;
      return [{ index_name, ltp, prev_close, change_pct }];
    });
    if (!indices.length) return fail(502, "Dhan returned no index prices");
    return { ok: true as const, fetched_at: new Date().toISOString(), indices };
  });
}

/** One index's minute candles for its latest session, with NSE's previous close as the base. Times are IST shown as UTC seconds. */
export function indexIntraday(env: Env, name: string) {
  const id = LIVE_INDICES[name];
  if (id == null) return Promise.resolve(fail(404, `No live index called ${name}`));
  return cached(`index-candles/${id}`, CANDLE_TTL_S, async () => {
    const ist = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
    const now = Date.now();
    const r = await post(env, "/charts/intraday", {
      securityId: String(id), exchangeSegment: "IDX_I", instrument: "INDEX", interval: "1", oi: false,
      fromDate: `${ist(now - 7 * 86400_000)} 09:15:00`, toDate: `${ist(now + 86400_000)} 00:00:00`,
    }, "index candles");
    if (!r.ok) return r;
    const data = r.data as Record<string, number[]>;
    if (!Array.isArray(data.timestamp) || !data.timestamp.length) return fail(502, "Dhan returned no index candles");
    const all = data.timestamp.map((t, i) => ({ time: Math.round(t + IST_MS / 1000), day: ist(t * 1000), open: data.open[i], high: data.high[i], low: data.low[i], close: data.close[i] }));
    const day = all[all.length - 1].day;
    const candles = all.filter((c) => c.day === day).map(({ day: _, ...c }) => c);
    const official = await env.DB.prepare("SELECT close FROM index_daily WHERE index_name = ? AND date < ? ORDER BY date DESC LIMIT 1")
      .bind(name, day).first<{ close: number }>().catch(() => null);
    const before = all.filter((c) => c.day < day);
    const prevClose = official?.close ?? before[before.length - 1]?.close ?? null;
    return { ok: true as const, index: name, session: day, prevClose, candles };
  });
}

/** Dhan's company snapshot: overview, ratios with industry averages, latest shareholding. `raw` skips parsing and the cache. */
export async function companyInfo(env: Env, symbol: string, raw = false) {
  const run = async () => {
    const inst = await instrument(env, symbol);
    if (!inst) return fail(404, `No Dhan instrument for ${symbol}`);
    // Short pauses: a stock page is waiting on this answer.
    const r = await patient(() => post(env, "/data/companyinfo", { securityId: inst.id, exchangeSegment: inst.segment, instrument: "EQUITY", metrics: ["CO", "RATIOS", "SHP"] }, "company info"), [600, 1500]);
    if (!r.ok) return r;
    if (raw) return { ok: true as const, symbol, raw: r.data };
    // The sections sit in a one-element array somewhere under `data`; find the object that holds them.
    const find = (v: unknown, depth = 0): Record<string, unknown> | null => {
      if (!v || typeof v !== "object" || depth > 4) return null;
      if (!Array.isArray(v) && Object.values(SECTION_KEYS).some((k) => k in (v as object))) return v as Record<string, unknown>;
      for (const x of Object.values(v as object)) {
        const hit = find(x, depth + 1);
        if (hit) return hit;
      }
      return null;
    };
    const block = find(r.data);
    if (!block) return fail(502, "Dhan's company info had no sections");
    const out: Record<string, Record<string, string | number | null>> = {};
    for (const [section, fields] of Object.entries(COMPANY_FIELDS)) {
      let src = block[SECTION_KEYS[section as keyof typeof SECTION_KEYS]] as unknown;
      if (Array.isArray(src)) src = src[0];
      const obj = (src ?? {}) as Record<string, unknown>;
      out[section] = Object.fromEntries(Object.entries(fields).map(([from, to]) => {
        const v = obj[from];
        if (v == null || v === "" || v === "NA") return [to, null];
        const n = Number(v);
        return [to, Number.isFinite(n) && to !== "period" ? n : String(v)];
      }));
    }
    return { ok: true as const, symbol, isin: (block.isin ?? block.ISIN ?? null) as string | null, fetched_at: new Date().toISOString(), ...out };
  };
  return raw ? run() : cached(`company/${symbol}`, COMPANY_TTL_S, run);
}
