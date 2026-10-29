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

/** Rows of every <table> in an HTML page, cell text only (NSDL's reports are plain tables). */
function htmlRows(html: string): string[][] {
  const text = (s: string) =>
    s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1])));
}

/** NSDL writes negatives as (123.45). */
const nsdlNum = (v: string | undefined) => num(v?.replace(/^\((.*)\)$/, "-$1"));

function inTransaction(db: SqliteDatabase, fn: () => number): number {
  db.raw.exec("BEGIN");
  try {
    const n = fn();
    db.raw.exec("COMMIT");
    return n;
  } catch (err) {
    db.raw.exec("ROLLBACK");
    throw err;
  }
}

/**
 * NSDL daily FPI equity flows. Accepts a saved "Daily Trends in FPI Investments"
 * page (Reports → Current Month, or an Archive month) or a CSV of
 * date,equity_buy,equity_sell,equity_net.
 */
export function importFpiDaily(db: SqliteDatabase, path: string): number {
  const stmt = db.raw.prepare("INSERT OR REPLACE INTO fpi_daily (date, equity_buy, equity_sell, equity_net) VALUES (?, ?, ?, ?)");
  return inTransaction(db, () => {
    let n = 0;
    if (/\.html?$/i.test(path)) {
      const rows = htmlRows(readFileSync(path, "utf8"));
      const seen = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        // A day's block starts "date | Equity | Stock Exchange | …"; two rows later is the equity sub-total.
        if (r[1] !== "Equity" || r[2] !== "Stock Exchange" || rows[i + 2]?.[0] !== "Sub-total") continue;
        const date = isoDate(r[0]);
        if (!date || seen.has(date)) continue; // the derivatives table further down repeats dates
        seen.add(date);
        const sub = rows[i + 2];
        stmt.run(date, nsdlNum(sub[1]), nsdlNum(sub[2]), nsdlNum(sub[3]));
        n++;
      }
      return n;
    }
    for (const r of readRows(path)) {
      const date = isoDate(col(r, "date") ?? "");
      const net = num(col(r, "equity_net", "net"));
      if (!date || net === null) continue;
      stmt.run(date, num(col(r, "equity_buy", "buy")), num(col(r, "equity_sell", "sell")), net);
      n++;
    }
    return n;
  });
}

const LONG_MONTH: Record<string, string> = {
  JANUARY: "01", FEBRUARY: "02", MARCH: "03", APRIL: "04", MAY: "05", JUNE: "06",
  JULY: "07", AUGUST: "08", SEPTEMBER: "09", OCTOBER: "10", NOVEMBER: "11", DECEMBER: "12",
};

/**
 * NSDL fortnightly sector-wise FPI data. Accepts one or more saved
 * FIIInvestSector_*.html reports, or a CSV of period_end,sector,equity_net,equity_auc.
 */
export function importFpiSectors(db: SqliteDatabase, paths: string[]): number {
  const stmt = db.raw.prepare("INSERT OR REPLACE INTO fpi_sector (period_end, sector, equity_net, equity_auc) VALUES (?, ?, ?, ?)");
  return inTransaction(db, () => {
    let n = 0;
    for (const path of paths) {
      if (!/\.html?$/i.test(path)) {
        for (const r of readRows(path)) {
          const period = isoDate(col(r, "period_end", "date") ?? "");
          const sector = col(r, "sector")?.trim();
          if (!period || !sector) continue;
          stmt.run(period, sector, num(col(r, "equity_net")), num(col(r, "equity_auc")));
          n++;
        }
        continue;
      }
      const rows = htmlRows(readFileSync(path, "utf8"));
      // Header row: "AUC as on <prev>", "Net Investment <f1>", "Net Investment <f2>", "AUC as on <end>".
      const aucLabels = rows[0]?.filter((c) => /^AUC as on/i.test(c)) ?? [];
      const m = /AUC as on ([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i.exec(aucLabels[aucLabels.length - 1] ?? "");
      const period = m && LONG_MONTH[m[1].toUpperCase()] ? `${m[3]}-${LONG_MONTH[m[1].toUpperCase()]}-${m[2].padStart(2, "0")}` : null;
      const hi = rows.findIndex((r) => r[1] === "Sectors");
      if (!period || hi < 0) throw new Error(`${path}: not an NSDL sector-wise report`);
      // Eight column blocks (AUC, net, net, AUC × INR/USD), each ending in "Total".
      const totals = rows[hi].flatMap((v, i) => (v === "Total" ? [i] : []));
      if (totals.length < 8) throw new Error(`${path}: unexpected column layout`);
      const start = (k: number) => (k === 0 ? 2 : totals[k - 1] + 1);
      for (const r of rows.slice(hi + 1)) {
        if (!r[1] || r.length < rows[hi].length) continue;
        stmt.run(period, r[1], nsdlNum(r[start(4)]), nsdlNum(r[start(6)]));
        n++;
      }
    }
    return n;
  });
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
