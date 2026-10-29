// Owner tools for the scheduled data refresh.
//   POST /api/admin/refresh          run the daily refresh now (optional ?date=YYYY-MM-DD&force=1)
//   GET  /api/admin/refresh-status   the latest pipeline runs and how fresh each dataset is

import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { runDaily } from "../jobs/daily.js";
import { jsonError } from "../lib/http.js";
import { fillStatements } from "../lib/statements.js";
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

// Fill the statement store now: POST /api/admin/statements?max=40 (default 25), optionally &cap=N for today's request cap.
admin.post("/statements", async (c) => {
  const max = Math.min(Number(c.req.query("max")) || 25, 150);
  const cap = c.req.query("cap") ? Number(c.req.query("cap")) : undefined;
  return c.json({ ok: true, ...(await fillStatements(c.env, { maxRequests: max, dailyCap: cap })) });
});

admin.get("/statements-status", async (c) => {
  const row = await c.env.DB.prepare(`SELECT COUNT(*) AS stored, SUM(found) AS found, MIN(fetched_at) AS oldest, MAX(fetched_at) AS newest FROM company_statements`).first();
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
