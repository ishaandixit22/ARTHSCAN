// Keeps the website's own GET /v1 answers at the Cloudflare edge for a few minutes.
// The data behind them changes once a day (the evening refresh), but each uncached answer
// costs database round trips to Tokyo (about 300 ms apiece), which made every page slow.
//
// Only the website's server (valid internal key, no visitor cookie or token) is served from
// the cache, so nobody's metered quota or personal data is involved; API users and MCP
// clients always get a fresh answer. Entries live per Cloudflare location for TTL seconds.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env.js";

const TTL_SECONDS = 300;

export function edgeCache(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    const eligible = cache && c.req.method === "GET" && c.get("principal")?.kind === "internal" && !c.req.header("cookie") && !c.req.header("authorization");
    if (!eligible) return next();

    // Keyed by the URL alone: the internal key is never part of a cache key.
    const key = new Request(c.req.url, { method: "GET" });
    const hit = await cache.match(key);
    if (hit) {
      const res = new Response(hit.body, hit);
      res.headers.set("x-edge-cache", "hit");
      return res;
    }
    await next();
    if (c.res.status === 200 && c.req.path.startsWith("/v1/")) {
      const copy = new Response(c.res.clone().body, c.res);
      copy.headers.set("cache-control", `public, max-age=${TTL_SECONDS}`);
      copy.headers.delete("set-cookie");
      try {
        c.executionCtx.waitUntil(cache.put(key, copy));
      } catch {
        /* no execution context (tests): skip */
      }
      c.res.headers.set("x-edge-cache", "miss");
    }
  };
}
