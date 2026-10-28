// Server-side client for the Arthscan API. Page loads go through here with the
// internal key, so browsing never spends a visitor's API quota; the visitor's
// cookie is forwarded so account routes know who they are.
//
// On Cloudflare the call goes over the API service binding; locally it's a
// plain fetch to the Node API (API_URL, default http://localhost:8787).

import { env } from "$env/dynamic/private";
import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

/** Raw request to the API, picking the service binding when deployed. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const binding = getRequestEvent().platform?.env?.API;
  if (binding) return binding.fetch(new Request(`https://api.internal${path}`, init));
  return fetch(`${env.API_URL ?? "http://localhost:8787"}${path}`, init);
}

export async function api<T = any>(
  path: string,
  opts: { cookie?: string | null; method?: string; body?: unknown; allowError?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "x-internal-key": env.INTERNAL_API_KEY ?? "" };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await apiFetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    error(503, "The data API is not reachable right now.");
  }
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok && !opts.allowError) error(res.status, json?.error?.message ?? `API error ${res.status}`);
  return (json.data ?? json) as T;
}
