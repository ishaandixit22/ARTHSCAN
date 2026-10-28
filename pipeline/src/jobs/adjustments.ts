// Detects splits, bonuses and consolidations from the price series itself and
// writes per-row adjustment multipliers.
//
// NSE's bhavcopy is unadjusted and its "previous close" is not rebased on
// ex-dates, so a 1:10 split shows up as a -90% day. Most stocks are held to a
// ±20% daily band, so a close-to-close move beyond -35%/+60% is almost always a
// corporate action. We snap the observed ratio to the nearest standard ratio
// (a real stock also moves on the ex-date) and keep it only if it is close.
// Manual rows (source='manual', from an announcements feed later) are never
// overwritten and win over detection.

import type { SqliteDatabase } from "../../../api/src/db/sqlite.js";

// 1:1 bonus = 1/2, 2:1 bonus = 1/3, 1:2 bonus = 2/3, splits 1/2…1/10, consolidations 2…10.
const STANDARD = [1 / 10, 1 / 5, 1 / 4, 1 / 3, 2 / 5, 1 / 2, 3 / 5, 2 / 3, 3 / 4, 4 / 5, 5 / 4, 3 / 2, 2, 5 / 2, 3, 4, 5, 10];

function snap(ratio: number): number | null {
  let best: number | null = null;
  let err = Infinity;
  for (const s of STANDARD) {
    const e = Math.abs(Math.log(ratio / s));
    if (e < err) { err = e; best = s; }
  }
  // Within ~12% of a standard ratio: room for a genuine move on the ex-date.
  return err < 0.12 ? best : null;
}

export function rebuildAdjustments(db: SqliteDatabase): number {
  const jumps = db.raw.prepare(`
    WITH t AS (
      SELECT symbol, date, close, LAG(close) OVER (PARTITION BY symbol ORDER BY date) AS pc FROM daily_prices
    )
    SELECT symbol, date, close / pc AS ratio FROM t
    WHERE pc > 0 AND (close / pc < 0.65 OR close / pc > 1.6)`).all() as { symbol: string; date: string; ratio: number }[];

  const ins = db.raw.prepare(`INSERT INTO price_adjustments (symbol, ex_date, factor, source, note)
    VALUES (?, ?, ?, 'detected', ?) ON CONFLICT(symbol, ex_date) DO NOTHING`);
  db.raw.exec("BEGIN");
  try {
    db.raw.exec("DELETE FROM price_adjustments WHERE source = 'detected'");
    let detected = 0;
    for (const j of jumps) {
      const factor = snap(j.ratio);
      if (factor === null) continue;
      ins.run(j.symbol, j.date, factor, `observed ${j.ratio.toFixed(4)}`);
      detected++;
    }

    // Recompute multipliers from scratch: each row gets the product of every later factor.
    db.raw.exec("UPDATE daily_prices SET adj = 1 WHERE adj != 1");
    const events = db.raw.prepare("SELECT symbol, ex_date, factor FROM price_adjustments").all() as { symbol: string; ex_date: string; factor: number }[];
    const upd = db.raw.prepare("UPDATE daily_prices SET adj = adj * ? WHERE symbol = ? AND date < ?");
    for (const e of events) upd.run(e.factor, e.symbol, e.ex_date);
    db.raw.exec("COMMIT");
    return detected;
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
}
