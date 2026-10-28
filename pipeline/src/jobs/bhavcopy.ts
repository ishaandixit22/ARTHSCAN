// End-of-day prices from NSE's Common Bhavcopy (UDiFF format, July 2024 onward).

import type { SqliteDatabase } from "../../../api/src/db/sqlite.js";
import { addDays, download, isWeekday, num, parseCsv, sleep, todayIST, unzipFirst } from "../lib.js";

// Equity series we keep: main board (EQ/BE/BZ) and SME (SM/ST).
const SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST"]);

function bhavUrl(date: string): string {
  return `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${date.replace(/-/g, "")}_F_0000.csv.zip`;
}

export type LoadResult = { date: string; status: "ok" | "holiday" | "exists"; rows: number };

export async function loadBhavcopy(db: SqliteDatabase, date: string, { force = false } = {}): Promise<LoadResult> {
  if (!force) {
    const have = db.raw.prepare("SELECT COUNT(*) AS n FROM daily_prices WHERE date = ?").get(date) as { n: number };
    if (have.n > 0) return { date, status: "exists", rows: have.n };
  }
  // Today's file can appear late in the evening; don't cache a missing one.
  const buf = await download(bhavUrl(date), { cache: date !== todayIST() });
  if (!buf) {
    db.raw.prepare("INSERT INTO pipeline_runs (job, target, status, rows, message) VALUES ('bhavcopy', ?, 'skipped', 0, 'no file (holiday or not yet published)')").run(date);
    return { date, status: "holiday", rows: 0 };
  }
  const rows = parseCsv(unzipFirst(buf)).filter((r) => SERIES.has(r.SctySrs));

  const insPrice = db.raw.prepare(`
    INSERT OR REPLACE INTO daily_prices (symbol, date, open, high, low, close, prev_close, volume, turnover, trades)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  // A symbol can trade before it reaches the equity list (fresh listings);
  // make sure every priced symbol exists in the master.
  const insStock = db.raw.prepare(`
    INSERT INTO stocks (symbol, name, isin, series) VALUES (?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET series = excluded.series`);

  db.raw.exec("BEGIN");
  try {
    for (const r of rows) {
      const close = num(r.ClsPric);
      if (close === null) continue;
      insStock.run(r.TckrSymb, r.FinInstrmNm || r.TckrSymb, r.ISIN || null, r.SctySrs);
      insPrice.run(
        r.TckrSymb, date, num(r.OpnPric), num(r.HghPric), num(r.LwPric), close,
        num(r.PrvsClsgPric), num(r.TtlTradgVol), num(r.TtlTrfVal), num(r.TtlNbOfTxsExctd),
      );
    }
    db.raw.prepare("INSERT INTO pipeline_runs (job, target, status, rows) VALUES ('bhavcopy', ?, 'ok', ?)").run(date, rows.length);
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  return { date, status: "ok", rows: rows.length };
}

/**
 * Load every day from `days` ago through today, oldest first, skipping dates
 * already loaded. Weekends are tried too: NSE holds special sessions on them
 * (Budget day, Muhurat trading), and a missing session breaks returns.
 */
export async function backfill(db: SqliteDatabase, days: number, delayMs = 800): Promise<void> {
  const end = todayIST();
  let date = addDays(end, -days);
  let loaded = 0;
  while (date <= end) {
    {
      const r = await loadBhavcopy(db, date);
      if (r.status === "ok") {
        loaded++;
        console.log(`  ${date}: ${r.rows} rows`);
        await sleep(delayMs);
      } else if (r.status === "holiday") {
        if (isWeekday(date)) console.log(`  ${date}: no file`);
        await sleep(delayMs);
      }
    }
    date = addDays(date, 1);
  }
  console.log(`Backfill done: ${loaded} new trading days.`);
}

/** Most recent weekday whose file exists, walking back up to a week. */
export async function loadLatest(db: SqliteDatabase): Promise<LoadResult | null> {
  let date = todayIST();
  for (let i = 0; i < 7; i++, date = addDays(date, -1)) {
    if (!isWeekday(date)) continue;
    const r = await loadBhavcopy(db, date);
    if (r.status !== "holiday") return r;
  }
  return null;
}
