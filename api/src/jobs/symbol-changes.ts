// Ticker changes. NSE's bhavcopy is keyed by symbol, so a renamed stock arrives looking like a new
// listing, with the history left behind on the old symbol. Two symbols with one ISIN and no shared
// session are the same security, so the old symbol's data moves onto the new one.

import type { Env } from "../env.js";

// Anything odder than this is left for a person to look at.
const MAX_GAP_DAYS = 60;
const MIN_RATIO = 0.65; // the same bounds the daily job treats as a split
const MAX_RATIO = 1.6;

export type SymbolChange = { oldSymbol: string; newSymbol: string; isin: string; oldName: string; changedOn: string };
export type SkippedChange = { isin: string; symbols: string[]; reason: string };

type Row = { isin: string; symbol: string; name: string; first_d: string | null; last_d: string | null };

/** Every ISIN held by several symbols, split into those safe to merge and those that aren't. */
export async function findSymbolChanges(env: Env): Promise<{ changes: SymbolChange[]; skipped: SkippedChange[] }> {
  const { results } = await env.DB.prepare(`SELECT s.isin, s.symbol, s.name, MIN(p.date) AS first_d, MAX(p.date) AS last_d
    FROM stocks s LEFT JOIN daily_prices p ON p.symbol = s.symbol
    WHERE s.isin IN (SELECT isin FROM stocks WHERE isin IS NOT NULL GROUP BY isin HAVING COUNT(*) > 1)
    GROUP BY s.symbol ORDER BY s.isin, first_d`).all<Row>();

  const groups = new Map<string, Row[]>();
  for (const r of results) groups.set(r.isin, [...(groups.get(r.isin) ?? []), r]);

  const changes: SymbolChange[] = [], skipped: SkippedChange[] = [];
  for (const [isin, rows] of groups) {
    const skip = (reason: string) => skipped.push({ isin, symbols: rows.map((r) => r.symbol), reason });
    if (rows.length !== 2) { skip("more than two symbols"); continue; }
    const [a, b] = rows;
    if (!a.first_d || !a.last_d || !b.first_d) { skip("a symbol has no prices"); continue; }
    if (a.last_d >= b.first_d) { skip("both traded in the same period"); continue; }
    const gap = (Date.parse(b.first_d) - Date.parse(a.last_d)) / 86_400_000;
    if (gap > MAX_GAP_DAYS) { skip(`${gap} days between the two`); continue; }
    const last = await env.DB.prepare("SELECT close FROM daily_prices WHERE symbol = ? AND date = ?").bind(a.symbol, a.last_d).first<{ close: number }>();
    const first = await env.DB.prepare("SELECT close FROM daily_prices WHERE symbol = ? AND date = ?").bind(b.symbol, b.first_d).first<{ close: number }>();
    const ratio = first && last?.close ? first.close / last.close : null;
    if (ratio === null || ratio < MIN_RATIO || ratio > MAX_RATIO) { skip(`price jumped by a factor of ${ratio?.toFixed(2)} at the change`); continue; }
    changes.push({ oldSymbol: a.symbol, newSymbol: b.symbol, isin, oldName: a.name, changedOn: b.first_d });
  }
  return { changes, skipped };
}

/** Moves one old symbol onto its new one as a single transaction, so a failure leaves both as they were. */
export async function mergeSymbolChange(env: Env, c: SymbolChange) {
  const { results: splits } = await env.DB.prepare("SELECT factor FROM price_adjustments WHERE symbol = ?").bind(c.newSymbol).all<{ factor: number }>();
  // Splits since the change were only applied to the new symbol's rows; the older rows need them too.
  const factor = splits.reduce((p, s) => p * s.factor, 1);

  const sql = (q: string, ...args: unknown[]) => env.DB.prepare(q).bind(...args);
  // The new symbol's row wins wherever both hold the same period.
  const move = (table: string) => [
    sql(`UPDATE OR IGNORE ${table} SET symbol = ? WHERE symbol = ?`, c.newSymbol, c.oldSymbol),
    sql(`DELETE FROM ${table} WHERE symbol = ?`, c.oldSymbol),
  ];
  await env.DB.batch([
    sql(`UPDATE stocks SET
        sector = COALESCE(sector, (SELECT sector FROM stocks WHERE symbol = ?1)),
        listing_date = COALESCE((SELECT listing_date FROM stocks WHERE symbol = ?1), listing_date),
        face_value = COALESCE(face_value, (SELECT face_value FROM stocks WHERE symbol = ?1)),
        market_lot = COALESCE(market_lot, (SELECT market_lot FROM stocks WHERE symbol = ?1)),
        dhan_security_id = COALESCE(dhan_security_id, (SELECT dhan_security_id FROM stocks WHERE symbol = ?1)),
        instrument_type = COALESCE(instrument_type, (SELECT instrument_type FROM stocks WHERE symbol = ?1))
      WHERE symbol = ?2`, c.oldSymbol, c.newSymbol),
    sql("UPDATE daily_prices SET adj = adj * ? WHERE symbol = ?", factor, c.oldSymbol),
    ...move("daily_prices"),
    ...move("price_adjustments"),
    ...move("financials"),
    ...move("shareholding"),
    ...move("results_checks"),
    ...move("fo_ban"),
    ...move("fo_oi"),
    // One row a company: an empty lookup under the new symbol shouldn't beat real statements.
    sql("DELETE FROM company_statements WHERE symbol = ? AND found = 0 AND EXISTS (SELECT 1 FROM company_statements WHERE symbol = ? AND found = 1)", c.newSymbol, c.oldSymbol),
    ...move("company_statements"),
    sql("DELETE FROM stock_metrics WHERE symbol = ?", c.oldSymbol),
    sql("UPDATE symbol_changes SET new_symbol = ? WHERE new_symbol = ?", c.newSymbol, c.oldSymbol),
    sql(`INSERT OR REPLACE INTO symbol_changes (old_symbol, new_symbol, isin, old_name, changed_on, merged_at) VALUES (?, ?, ?, ?, ?, ?)`,
      c.oldSymbol, c.newSymbol, c.isin, c.oldName, c.changedOn, Math.floor(Date.now() / 1000)),
    sql("DELETE FROM stocks WHERE symbol = ?", c.oldSymbol),
  ]);
}

/** Merges every safe change, or just one old symbol. A failed merge is reported and the rest carry on. */
export async function applySymbolChanges(env: Env, opts: { only?: string } = {}) {
  const { changes, skipped } = await findSymbolChanges(env);
  const merged: SymbolChange[] = [], failed: { oldSymbol: string; message: string }[] = [];
  for (const c of changes) {
    if (opts.only && c.oldSymbol !== opts.only) continue;
    try {
      await mergeSymbolChange(env, c);
      merged.push(c);
    } catch (err) {
      console.error(`symbol change ${c.oldSymbol}:`, err);
      failed.push({ oldSymbol: c.oldSymbol, message: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    }
  }
  return { merged, skipped, failed };
}
