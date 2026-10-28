// File importers for datasets that need a human download, a parser of their
// own, or a licensed vendor feed. Formats are documented in pipeline/README.md.

import { readFileSync } from "node:fs";
import type { SqliteDatabase } from "../../../api/src/db/sqlite.js";
import { isoDate, num, parseCsv } from "../lib.js";

function readRows(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".json")) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : (data.data ?? []);
    return arr.map((o: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)])));
  }
  return parseCsv(text);
}

/** Case/space-insensitive column lookup across a few accepted names. */
function col(r: Record<string, string>, ...names: string[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const want = new Set(names.map(norm));
  for (const [k, v] of Object.entries(r)) if (want.has(norm(k))) return v;
  return undefined;
}

/**
 * FII/DII cash-market activity. Accepts NSE's "FII/DII trading activity" JSON
 * (array of {category,date,buyValue,sellValue,netValue}) or a CSV with the same
 * columns. Values are INR crore.
 */
export function importFiiDii(db: SqliteDatabase, path: string): number {
  const stmt = db.raw.prepare(
    "INSERT OR REPLACE INTO fii_dii (date, category, buy_value, sell_value, net_value) VALUES (?, ?, ?, ?, ?)");
  let n = 0;
  db.raw.exec("BEGIN");
  try {
    for (const r of readRows(path)) {
      const date = isoDate(col(r, "date") ?? "");
      const rawCat = (col(r, "category") ?? "").toUpperCase();
      const category = rawCat.startsWith("FII") || rawCat.startsWith("FPI") ? "FII" : rawCat.startsWith("DII") ? "DII" : null;
      const buy = num(col(r, "buyValue", "buy", "grossPurchase"));
      const sell = num(col(r, "sellValue", "sell", "grossSales"));
      if (!date || !category || buy === null || sell === null) continue;
      const net = num(col(r, "netValue", "net")) ?? buy - sell;
      stmt.run(date, category, buy, sell, net);
      n++;
    }
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  return n;
}

const FIN_COLS = ["revenue", "expenses", "operating_profit", "other_income", "depreciation", "interest", "pbt", "tax", "net_profit", "eps"] as const;

/** Quarterly/annual results, INR crore (EPS in INR). One row per symbol + period. */
export function importFinancials(db: SqliteDatabase, path: string): number {
  const stmt = db.raw.prepare(`
    INSERT OR REPLACE INTO financials (symbol, period_end, period_type, consolidated, ${FIN_COLS.join(", ")})
    VALUES (?, ?, ?, ?, ${FIN_COLS.map(() => "?").join(", ")})`);
  let n = 0;
  db.raw.exec("BEGIN");
  try {
    for (const r of readRows(path)) {
      const symbol = (col(r, "symbol") ?? "").toUpperCase();
      const period = isoDate(col(r, "period_end", "period") ?? "");
      const type = (col(r, "period_type", "type") ?? "Q").toUpperCase().startsWith("A") ? "A" : "Q";
      const cons = (col(r, "consolidated") ?? "1").trim();
      if (!symbol || !period) continue;
      stmt.run(symbol, period, type, /^(0|false|no|standalone)$/i.test(cons) ? 0 : 1,
        ...FIN_COLS.map((c) => num(col(r, c))));
      n++;
    }
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  return n;
}

const SH_COLS = ["promoter", "fii", "dii", "public", "government", "others", "pledged_pct"] as const;

/** Quarterly shareholding pattern, as % of total shares. */
export function importShareholding(db: SqliteDatabase, path: string): number {
  const stmt = db.raw.prepare(`
    INSERT OR REPLACE INTO shareholding (symbol, quarter_end, ${SH_COLS.join(", ")})
    VALUES (?, ?, ${SH_COLS.map(() => "?").join(", ")})`);
  let n = 0;
  db.raw.exec("BEGIN");
  try {
    for (const r of readRows(path)) {
      const symbol = (col(r, "symbol") ?? "").toUpperCase();
      const quarter = isoDate(col(r, "quarter_end", "quarter", "date") ?? "");
      if (!symbol || !quarter) continue;
      stmt.run(symbol, quarter, ...SH_COLS.map((c) => num(col(r, c))));
      n++;
    }
    db.raw.exec("COMMIT");
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
  return n;
}
