// The evening watchdog. The scheduled refreshes run at fixed times, and NSE sometimes refuses one (HTTP 403)
// even though its file is out. Every 15 minutes each evening this compares NSE's file for today with the
// database, loads the session if it's missing, and tells the owner:
//
//   after a repair           one message saying the session was loaded late
//   still missing by 19:45   one alert, then keeps trying until the end of the evening
//
// It asks for the file on every day, so a weekend special session that nobody listed still loads.
// Its state goes to external_cache 'health:watchdog', which the public /health answer reads.

import type { Env } from "../env.js";
import { isTradingDay } from "../lib/market-hours.js";
import { notify } from "../lib/notify.js";
import { bhavcopyUrl, nseFile, recomputeMetrics, runDaily } from "./daily.js";

export type WatchdogStatus = "loaded" | "waiting" | "missing" | "failed";
export type WatchdogState = {
  date: string; status: WatchdogStatus; message: string; checked_at: string;
  /** Today's message has gone out, so the owner isn't told twice. */
  alerted: boolean; repaired: boolean;
};

/** After the 18:15 IST run has finished, so a session it loaded isn't reported as a repair. */
const START_MIN = 18 * 60 + 20;
/** Late enough that the 18:15 and 19:30 runs have both had their chance. */
const ALERT_MIN = 19 * 60 + 45;
const KEY = "health:watchdog";
/** The longest NSE normally goes without a session is a long weekend with a holiday beside it. */
const STALE_DAYS = 5;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

async function readState(env: Env): Promise<WatchdogState | null> {
  const row = await env.DB.prepare("SELECT body FROM external_cache WHERE key = ?").bind(KEY).first<{ body: string }>();
  return row ? (JSON.parse(row.body) as WatchdogState) : null;
}

async function writeState(env: Env, state: WatchdogState, now: number) {
  await env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at")
    .bind(KEY, JSON.stringify(state), Math.floor(now / 1000)).run();
}

const logRun = (env: Env, date: string, status: string, rows: number | null, text: string) =>
  env.DB.prepare("INSERT INTO pipeline_runs (job, target, status, rows, message) VALUES ('watchdog', ?, ?, ?, ?)").bind(date, status, rows, text.slice(0, 500)).run()
    .catch((e) => console.error("watchdog log:", e));

/** One pass. Returns null outside its hours. */
export async function watchdog(env: Env, now = Date.now()): Promise<WatchdogState | null> {
  const ist = new Date(now + 5.5 * 3600_000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (minutes < START_MIN) return null;
  const today = ist.toISOString().slice(0, 10);

  const saved = await readState(env);
  const earlier = saved?.date === today ? saved : null;
  const state: WatchdogState = { date: today, status: "waiting", message: "", checked_at: new Date(now).toISOString(), alerted: earlier?.alerted ?? false, repaired: earlier?.repaired ?? false };

  const have = await env.DB.prepare("SELECT 1 FROM daily_prices WHERE date = ? LIMIT 1").bind(today).first();
  if (have) {
    // A run can load the prices and still stop before the metrics.
    const metrics = await env.DB.prepare("SELECT MAX(as_of) AS d FROM stock_metrics").first<{ d: string | null }>();
    if (!metrics?.d || metrics.d < today) {
      const r = await recomputeMetrics(env).catch((err) => ({ status: "error", message: message(err) }));
      await logRun(env, today, r.status, null, `Metrics were behind: ${r.message ?? r.status}`);
    }
    if (earlier?.status === "loaded") return earlier;
    state.status = "loaded";
    state.message = `Session ${today} is loaded`;
    // Only a session that was reported missing needs a message here; the scheduled runs loaded it.
    if (earlier?.alerted && !earlier.repaired) {
      state.repaired = true;
      await notify(env, { subject: `Arthscan: ${today} prices are now loaded`, text: `A scheduled refresh has loaded today's session after the earlier alert.\n\nDetails: https://arthscan.me/health` });
    }
    await writeState(env, state, now);
    return state;
  }

  let published = false;
  let refused: string | null = null;
  try {
    published = !!(await nseFile(bhavcopyUrl(today)));
  } catch (err) {
    refused = message(err);
  }

  if (published) {
    const r = await runDaily(env, { date: today }).catch((err) => ({ date: null, steps: [{ step: "prices", status: "error", message: message(err), rows: undefined }] }));
    const prices = r.steps.find((s) => s.step === "prices");
    if (prices?.status === "ok" || prices?.status === "exists") {
      state.status = "loaded";
      state.message = `Loaded ${today} after the scheduled runs missed it: ${prices.rows ?? 0} stocks`;
      state.repaired = true;
      await logRun(env, today, "ok", prices.rows ?? null, state.message);
      await notify(env, {
        subject: `Arthscan: ${today} prices were missing and are now loaded`,
        text: `${state.message}.\n\n${r.steps.map((s) => `  ${s.status === "error" ? "✗" : "✓"} ${s.step}: ${s.status}${s.rows != null ? ` (${s.rows})` : ""}`).join("\n")}\n\nDetails: https://arthscan.me/health`,
        short: state.message,
      });
      await writeState(env, state, now);
      return state;
    }
    state.status = "failed";
    state.message = `NSE published ${today}, but loading it failed: ${prices?.message ?? "no prices step"}`;
    await logRun(env, today, "error", null, state.message);
  } else if (refused) {
    state.message = `NSE refused the request for ${today}'s file: ${refused}`;
    await logRun(env, today, "error", null, state.message);
  } else {
    state.message = `NSE has no file for ${today} yet`;
  }

  // No file on a weekend or a holiday is normal. A refusal says nothing either way, so it counts as expected on a session day.
  const expected = await isTradingDay(env, today);
  if (state.status !== "failed" && expected && minutes >= ALERT_MIN) state.status = "missing";
  if (state.status !== "waiting" && minutes >= ALERT_MIN && !state.alerted) {
    state.alerted = true;
    await notify(env, {
      subject: `Arthscan alert: ${today} prices are not loaded`,
      text: `${state.message}.\n\nThe site is still showing the previous session. The watchdog keeps trying every 15 minutes until about 23:20 IST, and the 08:30 run and 10:00 IST check try again in the morning. If today was an unlisted holiday, ignore this.\n\nDetails: https://arthscan.me/health`,
      short: state.message,
    });
  }
  await writeState(env, state, now);
  return state;
}

export { readState as watchdogState };

/** What's wrong with the data right now, for /health. Empty means it's as fresh as anyone can tell. */
export function dataProblems(
  fresh: { prices?: string | null; metrics?: string | null },
  state: WatchdogState | null,
  latestPublished: string | null,
  now = Date.now(),
): string[] {
  const problems: string[] = [];
  const prices = fresh.prices ?? null;
  if (!prices) return ["No prices stored"];
  const behind = (date: string) => prices < date;
  if (state && (state.status === "missing" || state.status === "failed") && behind(state.date)) problems.push(state.message);
  if (latestPublished && behind(latestPublished) && !problems.length) problems.push(`NSE has published ${latestPublished}, but the site has ${prices}`);
  if (fresh.metrics && fresh.metrics < prices) problems.push(`Stock metrics are on ${fresh.metrics}, prices on ${prices}`);
  const today = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
  const age = (Date.parse(today) - Date.parse(prices)) / 86400_000;
  if (age > STALE_DAYS && !problems.length) problems.push(`Latest prices are ${age} days old (${prices})`);
  return problems;
}
