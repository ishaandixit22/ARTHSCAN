// NSE daily reports beyond the bhavcopy, all public archive files:
//   sec_bhavdata_full  → delivery quantity and % per stock
//   ind_close_all      → every index's close with P/E, P/B, dividend yield
//   fo_secban          → securities in the F&O ban period, for the session just
//                        closed and for the next one (NSE publishes it after the close)
//   combineoi          → each F&O stock's open interest against its limit (near-ban list)
// Each loader is idempotent and returns the rows it wrote (0 on holidays).

import type { SqliteDatabase } from "../../../api/src/db/sqlite.js";
import { addDays, download, isoDate, isWeekday, num, parseCsv, sleep, todayIST, unzipFirst } from "../lib.js";

const ddmmyyyy = (d: string) => `${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(0, 4)}`;
const text = (b: Uint8Array) => new TextDecoder().decode(b);

export async function loadDeliveries(db: SqliteDatabase, date: string): Promise<number> {
  const buf = await download(`https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy(date)}.csv`, { cache: date !== todayIST() });
  if (!buf) return 0;
  const set = db.raw.prepare("UPDATE daily_prices SET deliv_qty = ?, deliv_pct = ? WHERE symbol = ? AND date = ?");
  let n = 0;
  db.raw.exec("BEGIN");
  try {
    for (const r of parseCsv(text(buf))) {
      const pct = num(r.DELIV_PER);
      if (pct === null) continue; // "-" for series without delivery (e.g. BE is all-delivery but reported blank)
      n += Number(set.run(num(r.DELIV_QTY), pct, r.SYMBOL, date).changes);
    }
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  return n;
}

export async function loadIndices(db: SqliteDatabase, date: string): Promise<number> {
  const buf = await download(`https://nsearchives.nseindia.com/content/indices/ind_close_all_${ddmmyyyy(date)}.csv`, { cache: date !== todayIST() });
  if (!buf) return 0;
  const ins = db.raw.prepare(`INSERT OR REPLACE INTO index_daily
    (index_name, date, open, high, low, close, change_pct, volume, turnover_cr, pe, pb, div_yield) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  db.raw.exec("BEGIN");
  try {
    for (const r of parseCsv(text(buf))) {
      const name = r["Index Name"];
      const close = num(r["Closing Index Value"]);
      if (!name || close === null) continue;
      ins.run(name, isoDate(r["Index Date"] ?? "") ?? date, num(r["Open Index Value"]), num(r["High Index Value"]), num(r["Low Index Value"]), close,
        num(r["Change(%)"]), num(r.Volume), num(r["Turnover (Rs. Cr.)"]), num(r["P/E"]), num(r["P/B"]), num(r["Div Yield"]));
      n++;
    }
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  return n;
}

/** Loads the ban list for one trade date. Returns the count, or null when NSE has no file for it yet. */
export async function loadFoBan(db: SqliteDatabase, date: string): Promise<number | null> {
  const buf = await download(`https://nsearchives.nseindia.com/archives/fo/sec_ban/fo_secban_${ddmmyyyy(date)}.csv`, { cache: date < todayIST() });
  if (!buf) return null;
  // "Securities in Ban For Trade Date 28-OCT-2026:" then "1,SAIL" lines (or "NIL").
  const lines = text(buf).split(/\r?\n/);
  const forDate = isoDate(/Trade Date (\d{2}-[A-Z]{3}-\d{4})/i.exec(lines[0] ?? "")?.[1] ?? "");
  if (forDate && forDate !== date) return null; // a file for some other day; don't file it under this one
  const symbols = lines.slice(1).map((l) => l.split(",")[1]?.trim()).filter((s): s is string => !!s && /^[A-Z0-9&-]+$/.test(s));
  db.raw.prepare("DELETE FROM fo_ban WHERE date = ?").run(date);
  const ins = db.raw.prepare("INSERT OR IGNORE INTO fo_ban (date, symbol) VALUES (?, ?)");
  for (const s of symbols) ins.run(date, s);
  db.raw.prepare("INSERT OR REPLACE INTO fo_ban_days (date, stocks) VALUES (?, ?)").run(date, symbols.length);
  return symbols.length;
}

/** The next weekday after a date (exchange holidays show up as a missing file). */
function nextWeekday(date: string): string {
  let d = addDays(date, 1);
  while (!isWeekday(d)) d = addDays(d, 1);
  return d;
}

/** Each F&O stock's open interest against its market-wide position limit, end of day. */
export async function loadOpenInterest(db: SqliteDatabase, date: string): Promise<number> {
  const buf = await download(`https://nsearchives.nseindia.com/archives/nsccl/mwpl/combineoi_${ddmmyyyy(date)}.zip`, { cache: date < todayIST() });
  if (!buf) return 0;
  const ins = db.raw.prepare(`INSERT OR REPLACE INTO fo_oi (date, symbol, mwpl, open_interest, fut_eq_oi, pct_mwpl, next_day_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  db.raw.exec("BEGIN");
  try {
    db.raw.prepare("DELETE FROM fo_oi WHERE date = ?").run(date);
    for (const r of parseCsv(unzipFirst(buf))) {
      // Headers carry a leading space (", NSE Symbol"); parseCsv trims values, not keys.
      const get = (k: string) => r[k] ?? r[` ${k}`];
      const symbol = get("NSE Symbol")?.trim();
      const mwpl = num(get("MWPL"));
      const futEq = num(get("Future Equivalent Open Interest"));
      if (!symbol || !mwpl) continue;
      ins.run(date, symbol, mwpl, num(get("Open Interest")), futEq, futEq == null ? null : Math.round((futEq / mwpl) * 10000) / 100, get("Limit for Next Day")?.trim() ?? null);
      n++;
    }
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  return n;
}

export async function loadReports(db: SqliteDatabase, date: string) {
  const [deliveries, indices, foBan, openInterest] = [
    await loadDeliveries(db, date), await loadIndices(db, date), await loadFoBan(db, date), await loadOpenInterest(db, date),
  ];
  // NSE publishes the next session's ban list after this one closes: load it too, so the
  // site shows the list in force today rather than yesterday's.
  const next = nextWeekday(date);
  const foBanNext = await loadFoBan(db, next);
  return { date, deliveries, indices, foBan: foBan ?? 0, openInterest, next, foBanNext };
}

/** Reports for every trading day in the last `days` that has prices but no index data yet. */
export async function backfillReports(db: SqliteDatabase, days: number, { deliveriesDays = 90, delayMs = 600 } = {}): Promise<void> {
  const end = todayIST();
  const haveIdx = new Set((db.raw.prepare("SELECT DISTINCT date FROM index_daily").all() as { date: string }[]).map((r) => r.date));
  const haveDel = new Set((db.raw.prepare("SELECT DISTINCT date FROM daily_prices WHERE deliv_pct IS NOT NULL").all() as { date: string }[]).map((r) => r.date));
  const traded = new Set((db.raw.prepare("SELECT DISTINCT date FROM daily_prices WHERE date >= date(?, ?)").all(end, `-${days} days`) as { date: string }[]).map((r) => r.date));
  const delCutoff = addDays(end, -deliveriesDays);
  for (const date of [...traded].sort()) {
    const parts: string[] = [];
    if (!haveIdx.has(date)) parts.push(`indices ${await loadIndices(db, date)}`, `ban ${(await loadFoBan(db, date)) ?? 0}`);
    if (date >= delCutoff && !haveDel.has(date)) parts.push(`deliveries ${await loadDeliveries(db, date)}`);
    if (parts.length) {
      console.log(`  ${date}: ${parts.join(", ")}`);
      await sleep(delayMs);
    }
  }
}


