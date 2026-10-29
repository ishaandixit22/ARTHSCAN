// Maps NSE symbols to Dhan security ids using Dhan's public instrument list
// (one CSV of every tradable instrument, refreshed by Dhan each morning).
// The live feed subscribes by these ids, not by symbol. The same list tells
// ordinary shares apart from ETFs and exchange test symbols.

import type { SqliteDatabase } from "../../../api/src/db/sqlite.js";
import { download, parseCsv } from "../lib.js";

const SCRIP_MASTER = "https://images.dhan.co/api-data/api-scrip-master.csv";
// Same equity series the bhavcopy job keeps.
const SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST"]);

export async function syncDhanIds(db: SqliteDatabase): Promise<number> {
  const buf = await download(SCRIP_MASTER, { cache: false });
  if (!buf) throw new Error("Dhan instrument list not found");
  const ids = new Map<string, { id: string; type: string }>();
  for (const r of parseCsv(new TextDecoder().decode(buf))) {
    if (r.SEM_EXM_EXCH_ID === "NSE" && r.SEM_SEGMENT === "E" && SERIES.has(r.SEM_SERIES) && r.SEM_TRADING_SYMBOL) {
      ids.set(r.SEM_TRADING_SYMBOL, { id: r.SEM_SMST_SECURITY_ID, type: r.SEM_EXCH_INSTRUMENT_TYPE || "ES" });
    }
  }
  const set = db.raw.prepare("UPDATE stocks SET dhan_security_id = ?, instrument_type = ? WHERE symbol = ?");
  let matched = 0;
  db.raw.exec("BEGIN");
  try {
    db.raw.exec("UPDATE stocks SET dhan_security_id = NULL, instrument_type = NULL");
    for (const [symbol, { id, type }] of ids) matched += Number(set.run(id, type, symbol).changes);
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  return matched;
}
