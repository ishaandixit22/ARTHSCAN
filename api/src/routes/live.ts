// /api/live/* — live prices from Dhan, relayed by the LiveFeed Durable Object.
//
// LIVE_ACCESS decides who may see them:
//   "owner"   only OWNER_EMAILS (personal use of the owner's Dhan Data API plan)
//   "invited" every signed-in, invited user
//   "public"  everyone, signed in or not. Turned on after Dhan's founder's office
//             gave a verbal go-ahead (Oct 2026); written confirmation, including
//             that Dhan's exchange licence covers public display, is pending.
//             Set LIVE_ACCESS back to "invited" to withdraw it at once.
//   anything else: off

import { Hono, type Context } from "hono";
import type { Account, AppEnv, Env, Principal } from "../env.js";
import { jsonError } from "../lib/http.js";
import { type BreadthShow, liveBreadth, liveMarket } from "../live/market.js";

export const live = new Hono<AppEnv>();

const owners = (env: Env) => new Set((env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
const accountOf = (p: Principal | null): Account | null => (p && p.kind !== "internal" ? p.account : null);

export function isOwner(env: Env, p: Principal | null): boolean {
  const email = accountOf(p)?.email?.toLowerCase();
  return !!email && owners(env).has(email);
}

/** Whether this caller may see live prices. Invite-only gating already ran in the auth middleware. */
export function canSeeLive(env: Env, p: Principal | null): boolean {
  if (env.LIVE_ACCESS === "public") return true;
  if (!accountOf(p)) return false;
  if (env.LIVE_ACCESS === "invited") return true;
  if (env.LIVE_ACCESS === "owner") return isOwner(env, p);
  return false;
}

const feed = (env: Env) => env.LIVE_FEED!.get(env.LIVE_FEED!.idFromName("dhan"));

function forward(c: Context<AppEnv>, path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(c.req.url);
  return feed(c.env).fetch(new Request(`https://live${path}${url.search}`, init ?? c.req.raw));
}

live.use("*", async (c, next) => {
  if (!c.env.LIVE_FEED) return jsonError(c, 503, "E_LIVE_UNAVAILABLE", "Live prices run on Cloudflare only.");
  if (!canSeeLive(c.env, c.get("principal"))) return jsonError(c, 403, "E_LIVE_FORBIDDEN", "Live prices aren't enabled for your account.");
  return next();
});

// Browsers keep one WebSocket open and say which symbols they're showing.
live.get("/stream", (c) => forward(c, "/stream"));
live.get("/quotes", (c) => forward(c, "/snapshot"));
live.get("/status", (c) => forward(c, "/status"));
// Movers, breadth, sector moves and intraday signals over every live stock.
const snapshot = (env: Env) => () => feed(env).fetch(new Request("https://live/all")).then((r) => r.json()) as Promise<never>;
live.get("/market", async (c) => c.json(await liveMarket(c.env, snapshot(c.env))));
// One breadth bucket (advances, declines, unchanged, 52-week highs or lows) with every stock in it.
live.get("/breadth", async (c) => {
  const show = (["advances", "declines", "unchanged", "highs", "lows"] as const).find((k) => k === c.req.query("show")) ?? "advances";
  return c.json(await liveBreadth(c.env, snapshot(c.env), show as BreadthShow));
});

// The owner pastes a fresh Dhan access token here when the old one lapses.
live.post("/token", async (c) => {
  if (!isOwner(c.env, c.get("principal")) || c.get("principal")?.kind !== "session") {
    return jsonError(c, 403, "E_OWNER_ONLY", "Only the owner can change the Dhan token, from the website.");
  }
  return forward(c, "/token", { method: "POST", headers: { "content-type": "application/json" }, body: await c.req.text() });
});
