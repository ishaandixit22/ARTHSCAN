// The ten-minute housekeeping for screens: small data loads, then rebuilds and the weekly run when due.
// Steps run one after another, because Dhan's limit of 5 data calls a second covers them all.

import type { Env } from "../env.js";
import { istClock, isTradingDay, marketOpen } from "../lib/market-hours.js";
import { fillKeyMetrics, fillLongHistory, fillSnapshots, refreshIndexMembers } from "./fill.js";
import { refreshMinuteHistory, runIntradayCycle, runWeekly } from "./run.js";
import { buildSeries, seriesStale } from "./series.js";
import { blobBuild } from "./store.js";

const DAY = 86400;

export async function screensTick(env: Env) {
  const report: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      const r = await run();
      if (r) report.push(`${name} ${JSON.stringify(r)}`);
    } catch (err) {
      console.error(`screens ${name}:`, err);
    }
  };
  const open = await marketOpen(env);

  await step("index", async () => {
    const row = await env.DB.prepare("SELECT body FROM external_cache WHERE key = 'screens:index_at'").first<{ body: string }>();
    if (row && now - Number(row.body) < 7 * DAY) return null;
    const out = await refreshIndexMembers(env);
    if (Object.keys(out).length) await env.DB.prepare("INSERT OR REPLACE INTO external_cache (key, body, fetched_at) VALUES ('screens:index_at', ?, ?)").bind(String(now), now).run();
    return out;
  });
  // Not during trading: these share Dhan's limit of 5 data calls a second with the intraday scan.
  if (!open) {
    await step("long", async () => { const r = await fillLongHistory(env, 120); return r.asked ? r : null; });
    await step("snapshot", async () => { const r = await fillSnapshots(env, 120); return r.asked ? r : null; });
  }
  await step("metrics", async () => { const r = await fillKeyMetrics(env); return r.asked ? r : null; });

  // A new session's candles land after the close, so rebuilds never interrupt the market.
  if (!open) {
    await step("series", async () => ((await seriesStale(env)) ? buildSeries(env) : null));
    await step("weekly", async () => {
      const row = await env.DB.prepare("SELECT MAX(computed_at) AS at FROM screen_results WHERE kind = 'weekly'").first<{ at: number | null }>();
      const age = row?.at ? now - row.at : Infinity;
      // Sundays as a rule. In the first weeks, while company data is still loading, daily, so coverage climbs quickly.
      const waiting = (await env.DB.prepare("SELECT COUNT(*) AS n FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol LEFT JOIN company_snapshot c ON c.symbol = s.symbol WHERE s.dhan_security_id IS NOT NULL AND COALESCE(s.instrument_type, 'ES') = 'ES' AND c.symbol IS NULL").first<{ n: number }>())?.n ?? 0;
      const due = age >= 6 * DAY && istClock().weekday === 0 || age === Infinity || (waiting > 0 && age >= DAY);
      return due ? runWeekly(env) : null;
    });
    await step("minutes", async () => {
      const c = istClock();
      const built = (await blobBuild(env, "min5_index"))?.split("|")[0] ?? null;
      // After the close of a trading day only: on a holiday there are no new candles to fetch.
      const due = built === null || (c.minutes >= 16 * 60 && built !== c.date && (await isTradingDay(env, c.date)));
      return due ? refreshMinuteHistory(env) : null;
    });
    // Once per history load, so outside market hours the intraday screens show the session just ended.
    await step("intraday-close", async () => {
      const made = Number((await blobBuild(env, "min5_index"))?.split("|")[1] ?? 0);
      if (!made) return null;
      const row = await env.DB.prepare("SELECT MAX(computed_at) AS at FROM screen_results WHERE kind = 'intraday'").first<{ at: number | null }>();
      return (row?.at ?? 0) * 1000 >= made ? null : runIntradayCycle(env, { closed: true });
    });
  }
  if (report.length) console.log(`screens: ${report.join("; ")}`);
}
