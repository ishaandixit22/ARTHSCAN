// Signed-out pages kept at the Cloudflare edge, because a first visit otherwise waits on several
// API calls and their database round trips. A copy younger than `fresh` is served as it is; an
// older one within `stale` is served at once and re-rendered in the background.
//
// The copies live under their own URL and the browser never sees a cacheable Cache-Control: the
// Cloudflare adapter looks a request's own URL up before any of our code runs and saves any
// response with such a header, which would hand a signed-out page to signed-in visitors.

import { version } from "$app/environment";
import type { RequestEvent } from "@sveltejs/kit";

const NAMESPACE = "https://page-cache.arthscan.internal";
const STOCK = { fresh: 300, stale: 14_400 };
const MARKET = { fresh: 300, stale: 3_600 };
const MARKET_PAGES = /^\/(stocks|screener(\/custom)?|sectors(\/[^/]+)?|heatmap|valuations|breadth)?$/;

function ruleFor(url: URL) {
  if (/^\/stock\/[^/]+$/.test(url.pathname)) return STOCK;
  return MARKET_PAGES.test(url.pathname) ? MARKET : null;
}

const refreshing = new Set<string>();

export async function cachedPage(event: RequestEvent, render: () => Promise<Response>): Promise<Response> {
  const rule = event.request.method === "GET" ? ruleFor(event.url) : null;
  const cache = event.platform?.caches?.default;
  if (!rule || !cache) return render();

  const { pathname, search } = new URL(event.request.url);
  // Per build: an older copy's HTML names script files that a deploy has removed.
  const key = new Request(`${NAMESPACE}/${version}${pathname}${search}`);
  const toBrowser = (res: Response, state: string) => {
    const out = new Response(res.body, res);
    out.headers.set("cache-control", "no-cache");
    out.headers.set("cdn-cache-control", `max-age=${rule.fresh}, stale-while-revalidate=${rule.stale}`);
    out.headers.delete("x-cached-at");
    out.headers.set("x-page-cache", state);
    return out;
  };
  const renderAndStore = async () => {
    const res = await render();
    // A cookie or an error page is never shared.
    if (res.status !== 200 || res.headers.has("set-cookie")) return res;
    const copy = new Response(res.clone().body, res);
    copy.headers.set("cache-control", `public, max-age=${rule.fresh + rule.stale}`);
    copy.headers.set("x-cached-at", String(Date.now()));
    await cache.put(key, copy);
    return res;
  };

  const hit = await cache.match(key).catch(() => undefined);
  if (hit) {
    const age = (Date.now() - Number(hit.headers.get("x-cached-at"))) / 1000;
    if (age <= rule.fresh) return toBrowser(hit, "hit");
    if (!refreshing.has(key.url)) {
      refreshing.add(key.url);
      event.platform!.ctx.waitUntil(renderAndStore().catch(() => {}).finally(() => refreshing.delete(key.url)));
    }
    return toBrowser(hit, "stale");
  }
  const res = await renderAndStore();
  return res.status === 200 ? toBrowser(res, "miss") : res;
}
