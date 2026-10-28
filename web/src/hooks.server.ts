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

export const handle: Handle = async ({ event, resolve }) => {
  const binding = event.platform?.env?.API;
  if (binding && API_PATHS.test(event.url.pathname)) return binding.fetch(event.request);

  event.locals.account = null;
  event.locals.usage = null;
  const cookie = event.request.headers.get("cookie");
  if (cookie?.includes("al_session=")) {
    try {
      const me = await api("/api/me", { cookie, allowError: true });
      event.locals.account = me.account ?? null;
      event.locals.usage = me.usage ?? null;
    } catch {
      /* API down: render signed-out */
    }
  }

  // Private beta: exchange data stays behind sign-in until display is licensed.
  const inviteOnly = env.INVITE_ONLY === "true";
  if (inviteOnly && !event.locals.account && !OPEN_PATHS.test(event.url.pathname)) {
    const path = event.url.pathname + event.url.search;
    redirect(303, path === "/" ? "/login" : `/login?return_to=${encodeURIComponent(path)}`);
  }

  const response = await resolve(event);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
  if (inviteOnly) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
};
