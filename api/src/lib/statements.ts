// Company financial statements, stored. The provider answers `stats=all` with every statement in
// one response (about 14 KB); we keep that per company in company_statements and serve pages from
// it. A company missing from the store, or stored long ago, is fetched live once and written back;
// a background job (fillStatements) works through the rest, largest companies first.

import type { Env } from "../env.js";
import { ToolError } from "../handlers/errors.js";
import { providerName } from "./results.js";

const BASE = "https://stock.indianapi.in";
/** A stored copy this young is served without asking the provider. */
export const FRESH_DAYS = 45;
/** A company the provider didn't know is asked about again after this long. */
const RETRY_UNKNOWN_DAYS = 30;
const DAY = 86400;

export type Bundle = Record<string, Record<string, Record<string, number | null>>>;

/** One request for everything about a company; null when the provider doesn't know it. Throws on a quota or key problem. */
async function askProvider(env: Env, names: string[]): Promise<Bundle | null> {
  for (const name of names) {
    const res = await fetch(`${env.INDIANAPI_BASE_URL || BASE}/historical_stats?${new URLSearchParams({ stock_name: name, stats: "all" })}`,
      { headers: { "x-api-key": env.INDIANAPI_KEY!, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 429) throw new ToolError("E_UPSTREAM_QUOTA", "The data provider's request limit is used up for now. Try again later.", 503);
    if (res.status === 401 || res.status === 403) throw new ToolError("E_UNAVAILABLE", "This data source is not available right now: the provider rejected our API key.", 503);
    if (!res.ok) continue;
    const j = (await res.json().catch(() => null)) as Bundle | null;
    if (j && typeof j === "object" && !("error" in j) && (j.quarter_results || j.yoy_results || j.balancesheet)) return j;
  }
  return null;
}

async function save(env: Env, symbol: string, bundle: Bundle | null, now: number) {
  await env.DB.prepare("INSERT INTO company_statements (symbol, body, fetched_at, found) VALUES (?, ?, ?, ?) ON CONFLICT(symbol) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, found = excluded.found")
    .bind(symbol, JSON.stringify(bundle ?? {}), now, bundle ? 1 : 0).run();
}

/**
 * The stored statements for a listed company. Fresh rows are served as they are; otherwise the
 * provider is asked once (symbol first, then our name for it) and the answer is written back. If
 * that fails, an older stored copy is served rather than an error. Undefined: not a listed symbol; null: the provider doesn't know the company.
 */
export async function statementsFor(env: Env, rawSymbol: string): Promise<{ bundle: Bundle; fetched_at: string; stored: boolean } | null | undefined> {
  // One round trip for both the stock and its stored statements: each D1 query costs a network hop.
  const row = await env.DB.prepare(`SELECT s.symbol, s.name, c.body, c.fetched_at, c.found FROM stocks s
    LEFT JOIN company_statements c ON c.symbol = s.symbol WHERE s.symbol = ?`)
    .bind(rawSymbol.trim().toUpperCase()).first<{ symbol: string; name: string; body: string | null; fetched_at: number | null; found: number | null }>();
  if (!row) return undefined;
  const stock = { symbol: row.symbol, name: row.name };
  const now = Math.floor(Date.now() / 1000);
  const stored = row.body != null && row.fetched_at != null ? { fetched_at: row.fetched_at, found: row.found ?? 1 } : null;
  const stale = stored ? JSON.parse(row.body!) as Bundle : null;
  if (stored?.found && now - stored.fetched_at <= FRESH_DAYS * DAY) return { bundle: stale!, fetched_at: new Date(stored.fetched_at * 1000).toISOString(), stored: true };
  if (stored && !stored.found && now - stored.fetched_at <= RETRY_UNKNOWN_DAYS * DAY) return null;
  if (!env.INDIANAPI_KEY) {
    if (stored?.found) return { bundle: stale!, fetched_at: new Date(stored.fetched_at * 1000).toISOString(), stored: true };
    throw new ToolError("E_UNAVAILABLE", "This data source is not configured on this server.", 503);
  }
  try {
    const bundle = await askProvider(env, [stock.symbol, providerName(stock.name)]);
    await save(env, stock.symbol, bundle, now);
    return bundle ? { bundle, fetched_at: new Date(now * 1000).toISOString(), stored: false } : null;
  } catch (err) {
    if (stored?.found) return { bundle: stale!, fetched_at: new Date(stored.fetched_at * 1000).toISOString(), stored: true };
    throw err;
  }
}

/**
 * One batch of the background fill: companies with nothing stored (largest turnover first), then
 * those stored longest ago. `maxRequests` caps the batch; `dailyCap` caps requests per day across
 * batches so a small provider plan isn't spent in one go. Stops at the provider's quota error.
 */
export async function fillStatements(env: Env, opts: { maxRequests?: number; dailyCap?: number } = {}) {
  if (!env.INDIANAPI_KEY) return { asked: 0, stored: 0, unknown: 0, skipped: "No provider key" as string | null };
  const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const counter = `statements:count:${day}`;
  const dailyCap = opts.dailyCap ?? (Number(env.STATEMENTS_DAILY_MAX) || 300);
  const used = Number((await env.DB.prepare("SELECT body FROM external_cache WHERE key = ?").bind(counter).first<{ body: string }>())?.body ?? 0);
  const room = Math.min(opts.maxRequests ?? 25, dailyCap - used);
  if (room <= 0) return { asked: 0, stored: 0, unknown: 0, skipped: `Daily cap of ${dailyCap} requests reached` };

  const now = Math.floor(Date.now() / 1000);
  const { results: queue } = await env.DB.prepare(`
    SELECT s.symbol, s.name FROM stocks s
    LEFT JOIN stock_metrics m ON m.symbol = s.symbol
    LEFT JOIN company_statements c ON c.symbol = s.symbol
    WHERE (c.symbol IS NULL OR (c.found = 1 AND c.fetched_at < ?) OR (c.found = 0 AND c.fetched_at < ?))
      AND s.symbol IN (SELECT DISTINCT symbol FROM daily_prices WHERE date >= date((SELECT MAX(date) FROM daily_prices), '-14 days'))
    ORDER BY (c.symbol IS NULL) DESC, COALESCE(m.turnover, 0) DESC LIMIT ?`)
    .bind(now - FRESH_DAYS * DAY, now - RETRY_UNKNOWN_DAYS * DAY, room).all<{ symbol: string; name: string }>();

  let asked = 0, stored = 0, unknown = 0, skipped: string | null = null;
  try {
    for (const { symbol, name } of queue) {
      asked++;
      const bundle = await askProvider(env, [symbol, providerName(name)]);
      await save(env, symbol, bundle, Math.floor(Date.now() / 1000));
      if (bundle) stored++; else unknown++;
    }
  } catch (err) {
    skipped = err instanceof Error ? err.message : "The provider stopped answering";
  }
  if (asked) {
    await env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at")
      .bind(counter, String(used + asked), now).run();
  }
  return { asked, stored, unknown, skipped };
}
