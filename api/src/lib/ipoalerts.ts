// Grey-market premium from ipoalerts.in. The trial plan refuses `includeGmp` on the IPO list,
// but its GMP-trends endpoint (GET /ipos/{symbol}/gmp, key in `x-api-key`) answers, so each
// issue's premium is the latest point of its hourly median series. The whole answer is kept in
// external_cache and reused for IPOALERTS_TTL seconds; if the provider fails the last stored
// copy is served and the reason is returned so the page can say why a premium is missing.

import type { Env } from "../env.js";

const BASE = "https://api.ipoalerts.in";
const KEEP = 24; // hourly points kept per issue: a day of movement
export type Premium = { symbol: string; gmp: number; updated: string; change_24h: number | null; history: number[] };
export type PremiumResult = { premiums: Map<string, Premium>; error: string | null; fetched_at: string | null };

/** The latest premium and a day's movement from one trends response; null when the issue has no premium yet. */
export function parseTrend(symbol: string, body: any): Premium | null {
  const series: { timestamp: string; price: number }[] = (Array.isArray(body?.series) ? body.series : []).filter((p: any) => typeof p?.price === "number" && p.timestamp);
  if (!series.length) return null;
  const last = series[series.length - 1];
  const dayAgo = series.length > 24 ? series[series.length - 25] : series[0];
  return {
    symbol: symbol.toUpperCase(), gmp: last.price, updated: last.timestamp,
    change_24h: series.length > 1 ? Math.round((last.price - dayAgo.price) * 100) / 100 : null,
    history: series.slice(-KEEP).map((p) => p.price),
  };
}

const refusal = (status: number) =>
  status === 429 ? "the plan's request limit is used up" : status === 401 || status === 403 ? "the key was refused" : `the provider answered ${status}`;

export async function premiums(env: Env, symbols: string[]): Promise<PremiumResult> {
  const empty = (error: string | null): PremiumResult => ({ premiums: new Map(), error, fetched_at: null });
  if (!env.IPOALERTS_API_KEY || !symbols.length) return empty(null);
  const key = "ipoalerts:gmp";
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(env.IPOALERTS_TTL) > 0 ? Number(env.IPOALERTS_TTL) : 900;
  const row = await env.DB.prepare("SELECT body, fetched_at FROM external_cache WHERE key = ?").bind(key).first<{ body: string; fetched_at: number }>();
  const stored = row ? (JSON.parse(row.body) as { symbols: string[]; list: Premium[] }) : null;
  const wrap = (list: Premium[], at: number, error: string | null): PremiumResult => ({ premiums: new Map(list.map((p) => [p.symbol, p])), error, fetched_at: new Date(at * 1000).toISOString() });
  const wanted = symbols.map((s) => s.toUpperCase());
  const covers = stored && wanted.every((s) => stored.symbols.includes(s));
  if (stored && row && covers && now - row.fetched_at <= ttl) return wrap(stored.list, row.fetched_at, null);

  try {
    const from = new Date(Date.now() - 3 * 86400_000).toISOString();
    const list: Premium[] = [];
    for (const symbol of wanted) {
      const res = await fetch(`${BASE}/ipos/${encodeURIComponent(symbol)}/gmp?interval=hourly&field=median&from=${encodeURIComponent(from)}`,
        { headers: { "x-api-key": env.IPOALERTS_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (res.status === 404) continue; // an issue the provider does not track
      if (!res.ok) throw new Error(refusal(res.status));
      const p = parseTrend(symbol, await res.json());
      if (p) list.push(p);
    }
    await env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at")
      .bind(key, JSON.stringify({ symbols: wanted, list }), now).run();
    return wrap(list, now, null);
  } catch (err) {
    const why = err instanceof Error ? err.message : "the provider did not answer";
    console.error("ipoalerts:", why);
    return stored && row ? wrap(stored.list, row.fetched_at, why) : empty(why);
  }
}

/** An hourly series reduced to the last reading of each India-time day, as the day's closing premium. */
export function lastPerDay(series: { timestamp: string; price: number }[], now = Date.now()): { timestamp: string; price: number }[] {
  const days = new Map<string, number>();
  for (const p of series) {
    if (typeof p?.price !== "number" || !p.timestamp) continue;
    const t = Date.parse(p.timestamp);
    if (Number.isFinite(t)) days.set(new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10), p.price);
  }
  const out = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([d, price]) => ({ timestamp: `${d}T00:00:00.000Z`, price }));
  // Today's row only once it says something new: after midnight it would just repeat yesterday's closing reading.
  const today = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
  const n = out.length;
  if (n > 1 && out[n - 1].timestamp.startsWith(today) && out[n - 1].price === out[n - 2].price) out.pop();
  return out;
}

export type Detail = {
  ipo: { logo: string | null; about: string | null; strengths: string[]; risks: string[]; prospectus_url: string | null; info_url: string | null; nse_url: string | null; bse_url: string | null; issue_size: string | null; type_of_issue: string | null; listing_date: string | null } | null;
  series: { timestamp: string; price: number }[];
};
export type DetailResult = { detail: Detail; error: string | null };

/** One issue's profile (logo, about, strengths, risks, documents) and its day-wise premium series, reused for IPOALERTS_TTL seconds. */
export async function detail(env: Env, symbol: string): Promise<DetailResult> {
  const none: Detail = { ipo: null, series: [] };
  if (!env.IPOALERTS_API_KEY) return { detail: none, error: null };
  const sym = symbol.toUpperCase();
  const key = `ipoalerts:detail:${sym}`;
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(env.IPOALERTS_TTL) > 0 ? Number(env.IPOALERTS_TTL) : 900;
  const row = await env.DB.prepare("SELECT body, fetched_at FROM external_cache WHERE key = ?").bind(key).first<{ body: string; fetched_at: number }>();
  const stored = row ? (JSON.parse(row.body) as Detail) : null;
  if (stored && row && now - row.fetched_at <= ttl) return { detail: stored, error: null };
  const headers = { "x-api-key": env.IPOALERTS_API_KEY, accept: "application/json" };
  try {
    const [a, g] = await Promise.all([
      fetch(`${BASE}/ipos/${encodeURIComponent(sym)}`, { headers, signal: AbortSignal.timeout(15_000) }),
      fetch(`${BASE}/ipos/${encodeURIComponent(sym)}/gmp?interval=hourly&field=median&from=${encodeURIComponent(new Date(Date.now() - 30 * 86400_000).toISOString())}`, { headers, signal: AbortSignal.timeout(15_000) }),
    ]);
    for (const r of [a, g]) if (!r.ok && r.status !== 404) throw new Error(refusal(r.status));
    const body: any = a.ok ? await a.json() : null;
    const o = body?.ipo ?? body;
    const gb: any = g.ok ? await g.json() : null;
    const out: Detail = {
      ipo: o?.symbol ? {
        logo: o.logo ?? null, about: o.about ?? null, strengths: o.strengths ?? [], risks: o.risks ?? [], prospectus_url: o.prospectusUrl ?? null, info_url: o.infoUrl ?? null,
        nse_url: o.nseInfoUrl ?? null, bse_url: o.bseInfoUrl ?? null, issue_size: o.issueSize ?? null, type_of_issue: o.typeOfIssue ?? null, listing_date: o.listingDate ?? null,
      } : null,
      series: lastPerDay(Array.isArray(gb?.series) ? gb.series : []),
    };
    await env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at").bind(key, JSON.stringify(out), now).run();
    return { detail: out, error: null };
  } catch (err) {
    const why = err instanceof Error ? err.message : "the provider did not answer";
    console.error("ipoalerts detail:", why);
    return { detail: stored ?? none, error: why };
  }
}
