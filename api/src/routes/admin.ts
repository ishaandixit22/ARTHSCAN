// Owner tools for the scheduled data refresh.
//   POST /api/admin/refresh          run the daily refresh now (optional ?date=YYYY-MM-DD&force=1)
//   POST /api/admin/check            run the daily self-check now: reload missed sessions, catch up metrics and BSE
//   GET  /api/admin/refresh-status   the latest pipeline runs and how fresh each dataset is
//   GET  /api/admin/symbol-changes   ticker changes waiting to merge, left alone, and already merged
//   POST /api/admin/screens?step=    run one screens step now: tick, series, weekly, minutes, intraday
//   POST /api/admin/symbol-changes   merge them now (optional ?old=SYMBOL for one) and recompute their metrics

import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { selfCheck } from "../jobs/check.js";
import { recomputeMetrics, runDaily } from "../jobs/daily.js";
import { applySymbolChanges, findSymbolChanges } from "../jobs/symbol-changes.js";
import { jsonError } from "../lib/http.js";
import { fillStatements } from "../lib/statements.js";
import { refreshMinuteHistory, runIntradayCycle, runWeekly } from "../screens/run.js";
import { buildSeries } from "../screens/series.js";
import { screensTick } from "../screens/tick.js";
import { isOwner } from "./live.js";

export const admin = new Hono<AppEnv>();

admin.use("*", async (c, next) => {
  const p = c.get("principal");
  // The owner from the website, or the site's own server with the internal key.
  if (!(p?.kind === "internal" || (p?.kind === "session" && isOwner(c.env, p)))) return jsonError(c, 403, "E_OWNER_ONLY", "Only the owner can run data refreshes.");
  return next();
});

admin.post("/refresh", async (c) => {
  const date = c.req.query("date");
  const report = await runDaily(c.env, {
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    force: c.req.query("force") === "1",
    results: c.req.query("results") ? Number(c.req.query("results")) : undefined,
  });
  return c.json({ ok: true, ...report });
});

admin.post("/check", async (c) => c.json({ ok: true, ...(await selfCheck(c.env)) }));

admin.post("/screens", async (c) => {
  const step = c.req.query("step");
  const steps: Record<string, () => Promise<unknown>> = {
    tick: () => screensTick(c.env), series: () => buildSeries(c.env), weekly: () => runWeekly(c.env),
    minutes: () => refreshMinuteHistory(c.env), intraday: () => runIntradayCycle(c.env, { force: true }),
  };
  if (!step || !steps[step]) return jsonError(c, 400, "E_BAD_STEP", `Step must be one of ${Object.keys(steps).join(", ")}.`);
  return c.json({ step, result: (await steps[step]()) ?? null });
});

admin.get("/symbol-changes", async (c) => {
  const { results: merged } = await c.env.DB.prepare("SELECT * FROM symbol_changes ORDER BY changed_on DESC").all();
  return c.json({ ok: true, ...(await findSymbolChanges(c.env)), merged });
});

admin.post("/symbol-changes", async (c) => {
  const r = await applySymbolChanges(c.env, { only: c.req.query("old")?.toUpperCase() });
  const metrics = r.merged.length ? await recomputeMetrics(c.env, r.merged.map((m) => m.newSymbol)) : null;
  return c.json({ ok: true, ...r, metrics });
});

// Fill the statement store now: POST /api/admin/statements?max=40 (default 25), optionally &cap=N for today's request cap.
admin.post("/statements", async (c) => {
  const max = Math.min(Number(c.req.query("max")) || 25, 150);
  const cap = c.req.query("cap") ? Number(c.req.query("cap")) : undefined;
  return c.json({ ok: true, ...(await fillStatements(c.env, { maxRequests: max, dailyCap: cap })) });
});

admin.get("/statements-status", async (c) => {
  const row = await c.env.DB.prepare(`SELECT COUNT(*) AS stored, SUM(found) AS found, MIN(fetched_at) AS oldest, MAX(fetched_at) AS newest FROM company_statements WHERE symbol NOT LIKE 'BSE-%'`).first();
  const total = await c.env.DB.prepare("SELECT COUNT(DISTINCT symbol) AS n FROM daily_prices WHERE date >= date((SELECT MAX(date) FROM daily_prices), '-14 days')").first<{ n: number }>();
  return c.json({ ok: true, active_stocks: total?.n, ...row });
});

admin.get("/refresh-status", async (c) => {
  const fresh = await c.env.DB.prepare(`SELECT
      (SELECT MAX(date) FROM daily_prices) AS prices, (SELECT MAX(as_of) FROM stock_metrics) AS metrics,
      (SELECT MAX(date) FROM fii_dii) AS fii_dii, (SELECT MAX(date) FROM index_daily) AS indices,
      (SELECT MAX(date) FROM fo_ban_days) AS fo_ban, (SELECT MAX(date) FROM fo_oi) AS open_interest,
      (SELECT MAX(date) FROM fpi_daily) AS nsdl_fpi_daily, (SELECT MAX(period_end) FROM fpi_sector) AS nsdl_fpi_sectors,
      (SELECT COUNT(*) FROM financials WHERE period_type = 'Q' AND period_end = (SELECT MAX(period_end) FROM financials WHERE period_type = 'Q')) AS results_latest_quarter`).first();
  const { results: runs } = await c.env.DB.prepare("SELECT job, target, status, rows, message, created_at FROM pipeline_runs ORDER BY id DESC LIMIT 30").all();
  return c.json({ ok: true, fresh, runs });
});
