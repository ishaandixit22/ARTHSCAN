// Server-side client for the Arthlens API. Page loads go through here with the
// internal key, so browsing never spends a visitor's API quota; the visitor's
// cookie is forwarded so account routes know who they are.

import { env } from "$env/dynamic/private";
import { error } from "@sveltejs/kit";

const BASE = env.API_URL ?? "http://localhost:8787";

export async function api<T = any>(
  path: string,
  opts: { cookie?: string | null; method?: string; body?: unknown; allowError?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "x-internal-key": env.INTERNAL_API_KEY ?? "" };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    error(503, "The data API is not running. Start it with `npm run dev:api`.");
  }
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok && !opts.allowError) error(res.status, json?.error?.message ?? `API error ${res.status}`);
  return (json.data ?? json) as T;
}
