import { redirect, type Handle } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { api } from "$lib/server/api";

// Paths the API Worker owns. In production Cloudflare routes send them to it
// before this Worker runs; under `wrangler dev` there are no routes, so we
// forward them over the service binding ourselves.
const API_PATHS = /^\/(api|v1|mcp|oauth|\.well-known|health)(\/|$)/;

// Reachable without signing in while the site is invite-only.
const OPEN_PATHS = /^\/(login|robots\.txt|sitemap\.xml|favicon\.svg)$/;

// Content-Security-Policy itself comes from kit.csp in svelte.config.js, which
// adds per-request nonces for SvelteKit's inline hydration script.
const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

// Whether live prices are public: the API's LIVE_ACCESS = "public", mirrored here as
// LIVE_PUBLIC so a signed-out page view doesn't wait on a call to the API first. Without
// the variable (local dev), ask the API once a minute.
let livePublic: { value: boolean; at: number } | null = null;
async function liveIsPublic(): Promise<boolean> {
  if (env.LIVE_PUBLIC !== undefined) return env.LIVE_PUBLIC === "true";
  if (livePublic && Date.now() - livePublic.at < 60_000) return livePublic.value;
  const cfg = await api("/api/auth/config", { allowError: true }).catch(() => null);
  livePublic = { value: cfg?.live_public === true, at: Date.now() };
  return livePublic.value;
}

export const handle: Handle = async ({ event, resolve }) => {
  const binding = event.platform?.env?.API;
  if (binding && API_PATHS.test(event.url.pathname)) return binding.fetch(event.request);

  event.locals.account = null;
  event.locals.usage = null;
  event.locals.live = false;
  event.locals.owner = false;
  const cookie = event.request.headers.get("cookie");
  if (cookie?.includes("al_session=")) {
    try {
      const me = await api("/api/me", { cookie, allowError: true });
      event.locals.account = me.account ?? null;
      event.locals.usage = me.usage ?? null;
      event.locals.live = me.live === true;
      event.locals.owner = me.owner === true;
    } catch {
      /* API down: render signed-out */
    }
  }
  if (!event.locals.live) event.locals.live = await liveIsPublic();

  // Private beta: exchange data stays behind sign-in until display is licensed.
  const inviteOnly = env.INVITE_ONLY === "true";
  if (inviteOnly && !event.locals.account && !OPEN_PATHS.test(event.url.pathname)) {
    const path = event.url.pathname + event.url.search;
    redirect(303, path === "/" ? "/login" : `/login?return_to=${encodeURIComponent(path)}`);
  }

  const t0 = Date.now();
  const response = await resolve(event);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
  // Where a page's time went, visible in the browser's network panel: each API call, and the page in all.
  const calls = (event.locals.timings ?? []).map((t, i) => `api${i};desc="${t.path.slice(0, 40)}";dur=${t.ms}`);
  response.headers.set("Server-Timing", [`page;dur=${Date.now() - t0}`, ...calls].join(", "));
  if (inviteOnly) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
};
