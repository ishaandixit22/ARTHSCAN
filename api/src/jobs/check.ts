// The daily self-check, run every morning (weekends included) by its own cron and on demand by the owner.
// It compares what the site holds with what the exchanges have published, and repairs what it can:
//
//   sessions   every weekday of the last week that has an NSE bhavcopy but no rows here → runDaily for it
//   metrics    stock_metrics older than the latest session                              → recomputed
//   bse        BSE-only prices behind the latest NSE session                            → refreshBse
//
// The outcome goes to pipeline_runs (jobs `check:*`) and to external_cache 'health:last_check',
// which the public /health answer shows, so a missed or failed run is visible from outside.

import type { Env } from "../env.js";
import { addDaysISO, todayIST } from "../lib/nse.js";
import { refreshBse } from "./bse.js";
import { bhavcopyUrl, isWeekday, nseFile, recomputeMetrics, runDaily } from "./daily.js";

export type CheckItem = { check: string; status: "ok" | "fixed" | "failed" | "behind"; message: string };
export type CheckReport = { at: string; latest_published: string | null; latest_loaded: string | null; items: CheckItem[]; ms: number };

/** Sessions to reload in one run; each is a full daily refresh. */
const MAX_RELOADS = 3;
/** NSE publishes the bhavcopy from about 18:00 IST; before then today isn't expected. */
const PUBLISHED_BY_MIN = 18 * 60;

const latest = (env: Env, sql: string) => env.DB.prepare(sql).first<{ d: string | null }>().then((r) => r?.d ?? null);

/** How fresh each dataset is. Cheap: a handful of MAX() reads on indexed columns. */
export async function freshness(env: Env) {
  const row = await env.DB.prepare(`SELECT
      (SELECT MAX(date) FROM daily_prices) AS prices, (SELECT MAX(as_of) FROM stock_metrics) AS metrics,
      (SELECT MAX(date) FROM bse_daily_prices) AS bse_prices, (SELECT MAX(date) FROM index_daily) AS indices,
      (SELECT MAX(date) FROM fii_dii) AS fii_dii`).first<Record<string, string | null>>();
  return row ?? {};
}

export async function selfCheck(env: Env, now = Date.now()): Promise<CheckReport> {
  const started = Date.now();
  const items: CheckItem[] = [];
  const ist = new Date(now + 5.5 * 3600_000);
  const today = ist.toISOString().slice(0, 10);
  const todayExpected = ist.getUTCHours() * 60 + ist.getUTCMinutes() >= PUBLISHED_BY_MIN;

  // 1. Sessions: oldest first, so a reload never leaves an older gap behind a newer session.
  let latestPublished: string | null = null;
  const missing: string[] = [];
  for (let i = 0, d = todayExpected ? today : addDaysISO(today, -1); i < 8; i++, d = addDaysISO(d, -1)) {
    if (!isWeekday(d)) continue;
    const have = await env.DB.prepare("SELECT 1 FROM daily_prices WHERE date = ? LIMIT 1").bind(d).first();
    if (have) {
      latestPublished ??= d;
      continue;
    }
    // Not loaded: a holiday (no file) or a missed run (file is there).
    let published = false;
    try {
      published = !!(await nseFile(bhavcopyUrl(d)));
    } catch (err) {
      items.push({ check: `session ${d}`, status: "failed", message: `Couldn't ask NSE: ${err instanceof Error ? err.message : err}` });
      continue;
    }
    if (published) {
      latestPublished ??= d;
      missing.push(d);
    }
  }
  missing.reverse();
  for (const d of missing.slice(0, MAX_RELOADS)) {
    const r = await runDaily(env, { date: d });
    const prices = r.steps.find((s) => s.step === "prices");
    const ok = prices?.status === "ok" || prices?.status === "exists";
    items.push({
      check: `session ${d}`, status: ok ? "fixed" : "failed",
      message: ok ? `Loaded the missed session: ${prices?.rows ?? 0} stocks; ${r.steps.map((s) => `${s.step} ${s.status}`).join(", ")}` : `Reload failed: ${prices?.message ?? "no prices step"}`,
    });
  }
  if (missing.length > MAX_RELOADS) items.push({ check: "sessions", status: "behind", message: `${missing.length - MAX_RELOADS} more missed sessions wait for the next run` });
  if (!missing.length && !items.some((i) => i.check.startsWith("session"))) items.push({ check: "sessions", status: "ok", message: `Every published session of the last week is loaded (latest ${latestPublished ?? "none"})` });

  const fresh = await freshness(env);

  // 2. Metrics follow the latest session.
  if (fresh.prices && fresh.metrics && fresh.metrics < fresh.prices) {
    const r = await recomputeMetrics(env).catch((err) => ({ status: "error", message: String(err) }));
    items.push({ check: "metrics", status: r.status === "ok" ? "fixed" : "failed", message: `Were ${fresh.metrics}, prices ${fresh.prices}: ${r.message ?? r.status}` });
  } else {
    items.push({ check: "metrics", status: fresh.metrics ? "ok" : "failed", message: `As of ${fresh.metrics ?? "never"}` });
  }

  // 3. BSE-only prices: the quote API gives the last traded session, so a refresh catches up the latest one.
  const prices = await latest(env, "SELECT MAX(date) AS d FROM daily_prices");
  const bse = await latest(env, "SELECT MAX(date) AS d FROM bse_daily_prices");
  if (prices && (!bse || bse < prices)) {
    const r = await refreshBse(env).catch((err) => ({ saved: 0, failedCalls: -1, error: String(err) }));
    const after = await latest(env, "SELECT MAX(date) AS d FROM bse_daily_prices");
    items.push({ check: "bse prices", status: after && after >= prices ? "fixed" : "failed", message: `Were ${bse ?? "never"}, now ${after ?? "never"} (saved ${r.saved})` });
  } else {
    items.push({ check: "bse prices", status: "ok", message: `As of ${bse}` });
  }

  const report: CheckReport = { at: new Date(now).toISOString(), latest_published: latestPublished, latest_loaded: await latest(env, "SELECT MAX(date) AS d FROM daily_prices"), items, ms: Date.now() - started };
  await env.DB.batch([
    ...items.map((i) => env.DB.prepare("INSERT INTO pipeline_runs (job, target, status, rows, message) VALUES (?, ?, ?, NULL, ?)").bind(`check:${i.check}`, todayIST(), i.status, i.message.slice(0, 500))),
    env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES ('health:last_check', ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at")
      .bind(JSON.stringify(report), Math.floor(now / 1000)),
  ]).catch((e) => console.error("self-check log:", e));
  return report;
}
