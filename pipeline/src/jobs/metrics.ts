// Rebuilds stock_metrics: one precomputed row per stock from its price history
// plus any imported financials/shareholding. Lists and the screener read only
// this table, so they stay fast no matter how much history is stored.

import type { SqliteDatabase } from "../../../api/src/db/sqlite.js";
import { type Bar, METRIC_COLUMNS, metricsRow, ttmEps } from "../../../api/src/lib/indicators.js";
import { rebuildAdjustments } from "./adjustments.js";

export function rebuildMetrics(db: SqliteDatabase): number {
  const events = rebuildAdjustments(db);
  if (events) console.log(`  ${events} split/bonus adjustments detected.`);
  const latest = db.raw.prepare("SELECT MAX(date) AS d FROM daily_prices").get() as { d: string | null };
  if (!latest.d) return 0;

  // ~13 months of history covers every lookback below (252 trading days).
  const bars = db.raw.prepare(`
    SELECT symbol, date, close * adj AS close, prev_close * adj AS prev_close, volume / adj AS volume, turnover, deliv_pct FROM daily_prices
    WHERE date >= date(?, '-400 days') ORDER BY symbol, date`).all(latest.d) as Bar[];

  // TTM EPS = last four quarters, consolidated preferred over standalone.
  const epsTtm = ttmEps(db.raw.prepare(`
    SELECT symbol, consolidated, eps FROM financials
    WHERE period_type = 'Q' AND eps IS NOT NULL ORDER BY symbol, consolidated DESC, period_end DESC`).all() as
    { symbol: string; consolidated: number; eps: number }[]);

  const promoter = new Map(
    (db.raw.prepare(`
      SELECT s.symbol, s.promoter FROM shareholding s
      JOIN (SELECT symbol, MAX(quarter_end) q FROM shareholding GROUP BY symbol) m
        ON m.symbol = s.symbol AND m.q = s.quarter_end`).all() as { symbol: string; promoter: number }[])
      .map((r) => [r.symbol, r.promoter]),
  );

  const ins = db.raw.prepare(`INSERT INTO stock_metrics (${METRIC_COLUMNS.join(", ")}) VALUES (${METRIC_COLUMNS.map(() => "?").join(", ")})`);

  let n = 0;
  db.raw.exec("BEGIN");
  try {
    db.raw.exec("DELETE FROM stock_metrics");
    let i = 0;
    while (i < bars.length) {
      const sym = bars[i].symbol;
      let j = i;
      while (j < bars.length && bars[j].symbol === sym) j++;
      const series = bars.slice(i, j);
      i = j;

      const row = metricsRow(series, latest.d, epsTtm.get(sym) ?? null, promoter.get(sym) ?? null);
      if (!row) continue;
      ins.run(...row);
      n++;
    }
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  return n;
}
