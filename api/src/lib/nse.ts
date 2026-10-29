// Client for NSE's public website data (www.nseindia.com/api and the
// nsearchives file host): corporate announcements with their PDF filings,
// the board-meeting calendar, corporate actions and bulk/block deals.
//
// Each caller maps NSE's response down to the fields it shows, and that
// smaller result is what gets cached in external_cache, so a 3 MB feed costs
// one request per TTL and a few KB of storage.

import type { Env } from "../env.js";
import { ToolError } from "../handlers/errors.js";

const TIMEOUT_MS = 20_000;
const MAX_CACHE_BYTES = 1_000_000;
export const NSE_HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-IN,en;q=0.9",
};

/** Fetch an NSE URL, map the body, cache the mapped result for `ttlSeconds`. */
export async function nseFetch<T>(
  env: Env,
  url: string,
  ttlSeconds: number,
  map: (body: string) => T,
): Promise<{ fetched_at: string; data: T }> {
  const cacheKey = `nse:${url.replace(/^https:\/\//, "")}`;
  const now = Math.floor(Date.now() / 1000);
  const hit = await env.DB.prepare("SELECT body, fetched_at FROM external_cache WHERE key = ? AND fetched_at > ?")
    .bind(cacheKey, now - ttlSeconds).first<{ body: string; fetched_at: number }>();
  if (hit) return { fetched_at: new Date(hit.fetched_at * 1000).toISOString(), data: JSON.parse(hit.body) as T };

  let res: Response;
  try {
    res = await fetch(url, { headers: NSE_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    console.error(`nse ${url} unreachable:`, err);
    throw new ToolError("E_UPSTREAM", "NSE did not respond. Try again shortly.", 502);
  }
  const text = await res.text();
  if (res.status === 404) throw new ToolError("E_NOT_FOUND", "NSE has no data for that request.", 404);
  if (!res.ok || text.trimStart().startsWith("<")) {
    console.error(`nse ${url} -> ${res.status}: ${text.slice(0, 200)}`);
    throw new ToolError("E_UPSTREAM", "NSE did not return data for this request right now.", 502);
  }
  let data: T;
  try {
    data = map(text);
  } catch (err) {
    console.error(`nse ${url} unreadable:`, err);
    throw new ToolError("E_UPSTREAM", "NSE returned a response this server could not read.", 502);
  }
  const body = JSON.stringify(data);
  if (body.length <= MAX_CACHE_BYTES) {
    await env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at")
      .bind(cacheKey, body, now).run();
  }
  return { fetched_at: new Date(now * 1000).toISOString(), data };
}

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

/** "29-Oct-2026" or "29-Oct-2026 19:25:24" → "2026-10-29" (with " 19:25" kept when present). NSE writes "-" for none. */
export function nseDate(v: string | null | undefined, keepTime = false): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{2}:\d{2}))?/.exec(v?.trim() ?? "");
  if (!m || !MONTHS[m[2].toUpperCase()]) return null;
  const d = `${m[3]}-${MONTHS[m[2].toUpperCase()]}-${m[1].padStart(2, "0")}`;
  return keepTime && m[4] ? `${d} ${m[4]}` : d;
}

/** YYYY-MM-DD → NSE's query format DD-MM-YYYY. */
export const nseQueryDate = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** Today in India, YYYY-MM-DD. */
export const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
