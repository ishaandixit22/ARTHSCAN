// Stock master: symbol, name, ISIN, series, listing date from NSE's public
// equity lists; sector from NSE index constituent lists (which carry an
// "Industry" column). Stocks outside those indices stay unclassified.

import type { SqliteDatabase } from "../../../api/src/db/sqlite.js";
import { download, isoDate, num, parseCsv } from "../lib.js";

const MAINBOARD = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const SME = "https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv";
const SECTOR_LISTS = [
  "https://nsearchives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv",
  "https://nsearchives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv",
];

export async function syncStocks(db: SqliteDatabase): Promise<number> {
  const rows: Record<string, string>[] = [];
  for (const url of [MAINBOARD, SME]) {
    const buf = await download(url, { cache: false });
    if (!buf) { console.warn(`  skipped (404): ${url}`); continue; }
    rows.push(...parseCsv(new TextDecoder().decode(buf)));
  }

  const sectors = new Map<string, string>();
  for (const url of SECTOR_LISTS) {
    const buf = await download(url, { cache: false });
    if (!buf) continue;
    for (const r of parseCsv(new TextDecoder().decode(buf))) {
      if (r.Symbol && r.Industry) sectors.set(r.Symbol, r.Industry);
    }
  }

  const upsert = db.raw.prepare(`
    INSERT INTO stocks (symbol, name, isin, series, sector, listing_date, face_value, market_lot, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name, isin = excluded.isin, series = excluded.series,
      sector = COALESCE(excluded.sector, stocks.sector),
      listing_date = excluded.listing_date, face_value = excluded.face_value,
      market_lot = excluded.market_lot, is_active = 1, updated_at = datetime('now')`);

  let n = 0;
  db.raw.exec("BEGIN");
  try {
    for (const r of rows) {
      const symbol = r.SYMBOL;
      if (!symbol) continue;
      upsert.run(
        symbol,
        r["NAME OF COMPANY"] || r.NAME_OF_COMPANY || symbol,
        r["ISIN NUMBER"] || r.ISIN_NUMBER || null,
        r.SERIES || null,
        sectors.get(symbol) ?? null,
        isoDate(r["DATE OF LISTING"] || r.DATE_OF_LISTING || ""),
        num(r["FACE VALUE"] || r.FACE_VALUE),
        num(r["MARKET LOT"] || r.MARKET_LOT),
      );
      n++;
    }
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  db.raw.prepare("INSERT INTO pipeline_runs (job, status, rows, message) VALUES ('stocks', 'ok', ?, ?)")
    .run(n, `${sectors.size} sector mappings`);
  return n;
}
