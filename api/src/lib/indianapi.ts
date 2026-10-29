// Client for the Indian Stock API (indianapi.in): live quotes, news, IPOs,
// mutual funds, analyst forecasts and statements that the NSE files don't carry.
// Responses are cached in external_cache so repeat calls don't spend the vendor plan.

import type { Env } from "../env.js";
import { ToolError } from "../handlers/errors.js";

const DEFAULT_BASE = "https://stock.indianapi.in";
const TIMEOUT_MS = 15_000;
// D1 caps a row near 2 MB; larger bodies are served but not cached.
const MAX_CACHE_BYTES = 1_000_000;

export async function indianApi(
  env: Env,
  path: string,
  params: Record<string, string | undefined>,
  ttlSeconds: number,
): Promise<{ fetched_at: string; cached: boolean; data: unknown }> {
  const key = env.INDIANAPI_KEY;
  if (!key) throw new ToolError("E_UNAVAILABLE", "This data source is not configured on this server.", 503);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, v);
  const pathAndQuery = `${path}${qs.size ? `?${qs}` : ""}`;
  const cacheKey = `indianapi:${pathAndQuery}`;
  const now = Math.floor(Date.now() / 1000);

  const hit = await env.DB.prepare("SELECT body, fetched_at FROM external_cache WHERE key = ? AND fetched_at > ?")
    .bind(cacheKey, now - ttlSeconds).first<{ body: string; fetched_at: number }>();
  if (hit) return { fetched_at: new Date(hit.fetched_at * 1000).toISOString(), cached: true, data: JSON.parse(hit.body) };

  let res: Response;
  try {
    res = await fetch(`${env.INDIANAPI_BASE_URL || DEFAULT_BASE}${pathAndQuery}`, {
      headers: { "x-api-key": key, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`indianapi ${path} unreachable:`, err);
    throw new ToolError("E_UPSTREAM", "The data provider did not respond. Try again shortly.", 502);
  }
  const text = await res.text();
  if (res.status === 404 || res.status === 422) {
    throw new ToolError("E_NOT_FOUND", "The data provider found nothing for those arguments. Check the name or try the full company name.", 404);
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`indianapi ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    throw new ToolError("E_UNAVAILABLE", "This data source is not available right now: the provider rejected our API key.", 503);
  }
  if (res.status === 429) throw new ToolError("E_UPSTREAM_QUOTA", "The data provider's request limit is used up for now. Try again later.", 503);
  if (!res.ok) {
    console.error(`indianapi ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    throw new ToolError("E_UPSTREAM", "The data provider returned an error.", 502);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ToolError("E_UPSTREAM", "The data provider returned an unreadable response.", 502);
  }

  if (text.length <= MAX_CACHE_BYTES) {
    await env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at")
      .bind(cacheKey, text, now).run();
  }
  return { fetched_at: new Date(now * 1000).toISOString(), cached: false, data };
}
