// Funnel events (lib/analytics.ts).
//   POST /api/analytics/visit   the site's beacon, once per browser session. Public; bots are ignored.
//                               Sets a first-touch cookie that the signup later reads.
//   POST /api/analytics/query   the website's server, after a signed-in view of an analysis page. Internal key only.
//   GET  /api/analytics/funnel  the daily dashboard figures (?days=30). Owner only.

import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { ATTRIBUTION_COOKIE, classifyTouch, funnelReport, isBot, recordQuery, recordVisit } from "../lib/analytics.js";
import { jsonError } from "../lib/http.js";
import { isOwner } from "./live.js";

export const analytics = new Hono<AppEnv>();

analytics.post("/visit", async (c) => {
  if (isBot(c.req.header("user-agent"))) return c.body(null, 204);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const touch = classifyTouch(body, new URL(c.env.PUBLIC_SITE_ORIGIN).hostname);
  await recordVisit(c.env, touch);
  if (!/(?:^|;\s*)al_src=/.test(c.req.header("cookie") ?? "")) {
    const value = encodeURIComponent(JSON.stringify({ channel: touch.channel, source: touch.source, medium: touch.medium, campaign: touch.campaign }));
    c.header("Set-Cookie", `${ATTRIBUTION_COOKIE}=${value}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Lax${c.env.PUBLIC_SITE_ORIGIN.startsWith("https://") ? "; Secure" : ""}`);
  }
  return c.body(null, 204);
});

analytics.post("/query", async (c) => {
  if (c.get("principal")?.kind !== "internal") return jsonError(c, 403, "E_INTERNAL_ONLY", "Internal only.");
  const body = (await c.req.json().catch(() => ({}))) as { account_id?: string; group?: string };
  if (!body.account_id || !body.group) return jsonError(c, 400, "E_BAD_ARGS", "account_id and group are required.");
  await recordQuery(c.env, body.account_id, body.group);
  return c.body(null, 204);
});

analytics.get("/funnel", async (c) => {
  const p = c.get("principal");
  if (!(p?.kind === "internal" || (p?.kind === "session" && isOwner(c.env, p)))) return jsonError(c, 403, "E_OWNER_ONLY", "Only the owner can read the analytics.");
  return c.json({ ok: true, ...(await funnelReport(c.env, Number(c.req.query("days")) || 30)) });
});
