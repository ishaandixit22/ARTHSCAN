// Cloudflare Workers entry. Same Hono app as server.ts; here `env` comes from
// the Worker bindings (D1 as DB, vars and secrets from wrangler.jsonc).
// `scheduled` runs the daily end-of-day refresh on the cron triggers in wrangler.jsonc.

import { app } from "./app.js";
import type { Env } from "./env.js";
import { runDaily } from "./jobs/daily.js";
import { setBackground } from "./lib/nse.js";

export { LiveFeed } from "./live/feed.js";

type Ctx = { waitUntil(p: Promise<unknown>): void };

export default {
  fetch: (request: Request, env: Env, ctx: unknown) => {
    // Lets NSE-backed answers refresh their stored copy after the response is sent.
    setBackground((p) => (ctx as Ctx).waitUntil(p));
    return app.fetch(request, env, ctx as never);
  },
  scheduled: (_event: { cron: string }, env: Env, ctx: Ctx) => {
    ctx.waitUntil(runDaily(env).then((r) => console.log(`daily ${r.date}: ${r.steps.map((s) => `${s.step}=${s.status}${s.rows != null ? `(${s.rows})` : ""}`).join(" ")} in ${r.ms} ms`)));
  },
};
