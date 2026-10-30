// Dhan's REST data APIs (intraday candles, company info), called from the API
// Worker. The LiveFeed Durable Object owns the access token (it renews it), so
// each call first asks it for the current one. Keeping these calls out of the
// Durable Object means a deploy takes effect at once: the object keeps running
// old code until it goes idle, which can be hours while someone watches prices.

import type { Env } from "../env.js";

const BASE = "https://api.dhan.co/v2";
// Intraday chart ranges: candle size and how many sessions to keep.
export const CANDLE_RANGES: Record<string, { interval: string; sessions: number }> = { "1d": { interval: "5", sessions: 1 }, "5d": { interval: "15", sessions: 5 } };
const CANDLE_TTL_S = 60;
// Ratios and shareholding move slowly; one answer per stock serves for six hours.
const COMPANY_TTL_S = 6 * 3600;
const IST_MS = 5.5 * 3600_000;
const COMPANY_FIELDS = {
  overview: { MARKET_CAP: "market_cap_cr", INDUSTRY: "industry", SECTOR: "sector", DIVIDEND_YIELD: "dividend_yield", EPS: "eps", EBITDA: "ebitda_cr", BOOK_VALUE: "book_value", FIFTY_TWO_WEEK_HIGH: "high_52w", FIFTY_TWO_WEEK_LOW: "low_52w" },
  ratios: { PE_RATIO: "pe", PB_RATIO: "pb", DEBT_TO_EQUITY: "debt_to_equity", PE_TO_SECTOR_PE: "pe_to_sector_pe", ROE: "roe", ROCE: "roce", INDUSTRY_EPS: "industry_eps", INDUSTRY_DEBT_TO_EQUITY: "industry_debt_to_equity", INDUSTRY_PB_RATIO: "industry_pb", INDUSTRY_CURRENT_RATIO: "industry_current_ratio", INDUSTRY_DIVIDEND_YIELD: "industry_dividend_yield", INDUSTRY_OPERATING_MARGIN: "industry_operating_margin" },
  shareholding: { REPORTING_PERIOD: "period", PROMOTER_HOLDING: "promoter", DII_HOLDING: "dii", CHANGE_IN_DII_HOLDING: "dii_change", FII_HOLDING: "fii", CHANGE_IN_FII_HOLDING: "fii_change", PUBLIC_HOLDING: "public" },
} as const;
const SECTION_KEYS = { overview: "CO", ratios: "RATIOS", shareholding: "SHP" } as const;

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

// The Workers edge cache, when there is one (absent under plain Node).
const edge = (): Cache | null => (typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : null);

/** Serve from the edge cache, or compute and keep successful answers for ttl seconds. */
async function cached<T extends { ok: boolean }>(key: string, ttl: number, run: () => Promise<T | Fail>): Promise<T | Fail> {
  const cache = edge();
  const req = new Request(`https://dhan.cache/${key}`);
  const hit = await cache?.match(req).catch(() => undefined);
  if (hit) return (await hit.json()) as T;
  const out = await run();
  if (out.ok && cache) await cache.put(req, new Response(JSON.stringify(out), { headers: { "cache-control": `max-age=${ttl}` } })).catch(() => {});
  return out;
}

async function credentials(env: Env): Promise<{ token: string; clientId: string } | null> {
  if (env.LIVE_FEED) {
    const res = await env.LIVE_FEED.get(env.LIVE_FEED.idFromName("dhan")).fetch(new Request("https://live/credentials")).catch(() => null);
    const creds = res?.ok ? ((await res.json().catch(() => null)) as { token: string; clientId: string } | null) : null;
    if (creds) return creds;
    console.warn(`dhan credentials: live feed answered ${res?.status ?? "nothing"}; using the configured token`);
  }
  return env.DHAN_ACCESS_TOKEN && env.DHAN_CLIENT_ID ? { token: env.DHAN_ACCESS_TOKEN, clientId: env.DHAN_CLIENT_ID } : null;
}

async function securityId(env: Env, symbol: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT dhan_security_id AS id FROM stocks WHERE symbol = ?").bind(symbol).first<{ id: string | null }>();
  return row?.id ? String(row.id) : null;
}

/** POST to a Dhan data endpoint. Returns the parsed body, or a failure to show. */
async function post(env: Env, path: string, body: unknown, what: string): Promise<{ ok: true; data: any } | Fail> {
  const creds = await credentials(env);
  if (!creds) return fail(503, "Dhan is not configured");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "access-token": creds.token, "client-id": creds.clientId },
      body: JSON.stringify(body),
    });
  } catch {
    return fail(502, "Dhan is not reachable");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    console.error(`dhan ${what} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return fail(502, `Dhan returned no ${what}`);
  }
  return { ok: true, data };
}

/** The last few sessions of intraday candles for one stock. Times are IST shown as UTC seconds, for the chart. */
export function intradayCandles(env: Env, symbol: string, range: string) {
  return cached(`candles/${symbol}/${range}`, CANDLE_TTL_S, async () => {
    const id = await securityId(env, symbol);
    if (!id) return fail(404, `No Dhan instrument for ${symbol}`);
    const { interval, sessions } = CANDLE_RANGES[range];
    // Ask for two weeks so holidays and weekends still leave enough sessions.
    const ist = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
    const now = Date.now();
    const r = await post(env, "/charts/intraday", {
      securityId: id, exchangeSegment: "NSE_EQ", instrument: "EQUITY", interval, oi: false,
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
    const firstIdx = all.findIndex((c) => c.day === days[0]);
    const prevClose = firstIdx > 0 ? all[firstIdx - 1].close : null;
    return { ok: true as const, symbol, range, interval: Number(interval), sessions: days, prevClose, candles };
  });
}

/** Dhan's company snapshot: overview, ratios with industry averages, latest shareholding. `raw` skips parsing and the cache. */
export async function companyInfo(env: Env, symbol: string, raw = false) {
  const run = async () => {
    const id = await securityId(env, symbol);
    if (!id) return fail(404, `No Dhan instrument for ${symbol}`);
    const r = await post(env, "/data/companyinfo", { securityId: id, exchangeSegment: "NSE_EQ", instrument: "EQUITY", metrics: ["CO", "RATIOS", "SHP"] }, "company info");
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
