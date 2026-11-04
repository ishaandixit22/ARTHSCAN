// Cloudflare Workers entry. Same Hono app as server.ts; here `env` comes from
// the Worker bindings (D1 as DB, vars and secrets from wrangler.jsonc).
// `scheduled` runs the daily end-of-day refresh on the cron triggers in wrangler.jsonc.

import { app } from "./app.js";
import type { Env } from "./env.js";
import { fillBseHistory, refreshBse } from "./jobs/bse.js";
import { runDaily } from "./jobs/daily.js";
import { recordIpoCategories } from "./jobs/ipo-readings.js";
import { fillWebsites, refreshFilings } from "./lib/sebi.js";
import { fillStatements } from "./lib/statements.js";
import { setBackground } from "./lib/nse.js";
import { runIntradayCycle } from "./screens/run.js";
import { screensTick } from "./screens/tick.js";

export { LiveFeed } from "./live/feed.js";

type Ctx = { waitUntil(p: Promise<unknown>): void };

export default {
  fetch: (request: Request, env: Env, ctx: unknown) => {
    // Lets NSE-backed answers refresh their stored copy after the response is sent.
    setBackground((p) => (ctx as Ctx).waitUntil(p));
    return app.fetch(request, env, ctx as never);
  },
  scheduled: (event: { cron: string }, env: Env, ctx: Ctx) => {
    // Every five minutes in market hours: the intraday screens, on the candles that just finished.
    if (event.cron === "*/5 3-10 * * 1-5") {
      ctx.waitUntil(runIntradayCycle(env).then((r) => r.ran && console.log(`intraday screens: ${JSON.stringify(r)}`)).catch((err) => console.error("intraday screens:", err)));
      return;
    }
    // Every ten minutes: one small batch of the statement store fill (the daily cap keeps it within the provider plan).
    if (event.cron === "*/10 * * * *") {
      setBackground((p) => ctx.waitUntil(p)); // the IPO readings read NSE's stored copies, which refresh behind the answer
      ctx.waitUntil(fillStatements(env).then((r) => r.asked && console.log(`statements: asked ${r.asked}, stored ${r.stored}, unknown ${r.unknown}${r.skipped ? ` (${r.skipped})` : ""}`)));
      ctx.waitUntil(fillBseHistory(env).then((r) => r.asked && console.log(`bse history: asked ${r.asked}, loaded ${r.loaded}, failed ${r.failed}`)));
      ctx.waitUntil(recordIpoCategories(env).then((r) => r.saved && console.log(`ipo readings: saved ${r.saved} of ${r.issues}`)).catch((err) => console.error("ipo readings:", err)));
      ctx.waitUntil(refreshFilings(env).then((r) => { if (r.read) console.log(`sebi filings: ${r.filings} stored${r.error ? ` (${r.error})` : ""}`); return fillWebsites(env); }).then((r) => r.read && console.log(`sebi websites: read ${r.read}, found ${r.found}`)).catch((err) => console.error("sebi filings:", err)));
      ctx.waitUntil(screensTick(env).catch((err) => console.error("screens:", err)));
      return;
    }
    ctx.waitUntil(refreshBse(env).then((r) => console.log(`bse prices: saved ${r.saved} of ${r.stocks}, corrected ${r.corrected}, failed calls ${r.failedCalls}`)));
    ctx.waitUntil(runDaily(env).then((r) => console.log(`daily ${r.date}: ${r.steps.map((s) => `${s.step}=${s.status}${s.rows != null ? `(${s.rows})` : ""}`).join(" ")} in ${r.ms} ms`)));
  },
};
