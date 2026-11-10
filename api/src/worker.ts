// Cloudflare Workers entry. Same Hono app as server.ts; here `env` comes from
// the Worker bindings (D1 as DB, vars and secrets from wrangler.jsonc).
// `scheduled` runs the daily end-of-day refresh on the cron triggers in wrangler.jsonc.

import { app } from "./app.js";
import type { Env } from "./env.js";
import { bseHistoryTick, refreshBse } from "./jobs/bse.js";
import { selfCheck } from "./jobs/check.js";
import { watchdog } from "./jobs/watchdog.js";
import { eveningMessage, failureMessage, sendSummary } from "./jobs/health-report.js";
import { istClock, isTradingDay, MORNING_REFRESH_CRON, refreshDue } from "./lib/market-hours.js";
import { todayIST } from "./lib/nse.js";
import { notify } from "./lib/notify.js";
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
    // Every morning, weekends included: load any session a run missed and report what's stale (see jobs/check.ts).
    if (event.cron === "30 4 * * *") {
      // Then the morning summary by email and WhatsApp; a crash still sends an alert.
      ctx.waitUntil(selfCheck(env)
        .then(async (r) => {
          console.log(`self-check: ${r.items.map((i) => `${i.check}=${i.status}`).join(" ")} in ${r.ms} ms`);
          await sendSummary(env, r);
        })
        .catch(async (err) => {
          console.error("self-check:", err);
          await notify(env, { subject: "Arthscan alert: the daily self-check crashed", text: `${err instanceof Error ? err.stack ?? err.message : err}\n\nPrices may be stale. Details: https://arthscan.me/health` });
        }));
      return;
    }
    if (event.cron === "*/5 3-10 * * *") {
      ctx.waitUntil(runIntradayCycle(env).then((r) => r.ran && console.log(`intraday screens: ${JSON.stringify(r)}`)).catch((err) => console.error("intraday screens:", err)));
      return;
    }
    // Every 15 minutes in the evening: load today's session if the scheduled runs missed it (see jobs/watchdog.ts).
    if (event.cron === "7,22,37,52 12-17 * * *") {
      ctx.waitUntil(watchdog(env).then((s) => s && s.status !== "loaded" && console.log(`watchdog: ${s.status}: ${s.message}`)).catch(async (err) => {
        console.error("watchdog:", err);
        await notify(env, { subject: "Arthscan alert: the evening watchdog crashed", text: `${err instanceof Error ? err.stack ?? err.message : err}\n\nPrices may be stale. Details: https://arthscan.me/health` });
      }));
      return;
    }
    // Every ten minutes: one small batch of the statement store fill (the daily cap keeps it within the provider plan).
    if (event.cron === "*/10 * * * *") {
      setBackground((p) => ctx.waitUntil(p)); // the IPO readings read NSE's stored copies, which refresh behind the answer
      ctx.waitUntil(fillStatements(env).then((r) => r.asked && console.log(`statements: asked ${r.asked}, stored ${r.stored}, unknown ${r.unknown}${r.skipped ? ` (${r.skipped})` : ""}`)));
      ctx.waitUntil(bseHistoryTick(env).then((r) => r.asked && console.log(`bse history: asked ${r.asked}, loaded ${r.loaded}, failed ${r.failed}`)));
      ctx.waitUntil(recordIpoCategories(env).then((r) => r.saved && console.log(`ipo readings: saved ${r.saved} of ${r.issues}`)).catch((err) => console.error("ipo readings:", err)));
      ctx.waitUntil(refreshFilings(env).then((r) => { if (r.read) console.log(`sebi filings: ${r.filings} stored${r.error ? ` (${r.error})` : ""}`); return fillWebsites(env); }).then((r) => r.read && console.log(`sebi websites: read ${r.read}, found ${r.found}`)).catch((err) => console.error("sebi filings:", err)));
      ctx.waitUntil(screensTick(env).catch((err) => console.error("screens:", err)));
      return;
    }
    // These run every day so a weekend special session (Muhurat) is covered; ordinary weekends stop here.
    if (!refreshDue(event.cron)) return;
    // NSE holidays have no session either (NSE's yearly calendar, see lib/market-hours.ts). If the list is
    // wrong about a day, the 10:00 IST self-check still loads any file NSE published for it.
    const day = istClock(event.cron === MORNING_REFRESH_CRON ? Date.now() - 24 * 3600_000 : Date.now()).date;
    ctx.waitUntil(isTradingDay(env, day).then((open) => {
      if (open) return refresh(event.cron, env);
      console.log(`refresh skipped: ${day} is an NSE holiday`);
    }));
  },
};

/** The end-of-day refresh, then the alert or evening note from the runs that send one. */
function refresh(cron: string, env: Env) {
  const bse = refreshBse(env).then((r) => { console.log(`bse prices: saved ${r.saved} of ${r.stocks}, corrected ${r.corrected}, failed calls ${r.failedCalls}`); return r; });
  const daily = runDaily(env).then((r) => { console.log(`daily ${r.date}: ${r.steps.map((s) => `${s.step}=${s.status}${s.rows != null ? `(${s.rows})` : ""}`).join(" ")} in ${r.ms} ms`); return r; });
  // Alerts only from the last run of the evening and the morning catch-up: earlier runs often fail while NSE is still publishing.
  const final = { "30 16 * * *": "22:00 IST", [MORNING_REFRESH_CRON]: "08:30 IST" }[cron];
  return Promise.all([daily.catch(() => null), bse.catch(() => null)]).then(async ([d, b]) => {
    if (!final) return;
    const m = failureMessage(d, b, final) ?? (!d ? { subject: `Arthscan alert: the ${final} refresh crashed`, text: "See the Workers logs. Details: https://arthscan.me/health" } : null);
    if (m) await notify(env, m);
    // The evening note: one message a trading-day night saying whether today's session made it.
    else if (d && cron === "30 16 * * *") await notify(env, eveningMessage(d, b, todayIST()));
  });
}
