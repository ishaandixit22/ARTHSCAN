// Results season loader. Finds the companies that have filed quarterly results
// on NSE since the quarter ended, and for each one not yet stored asks the
// Indian Stock API for its quarterly results (about 12 quarters, consolidated
// where filed). Rows go into `financials` (period_type 'Q'), which feeds the
// earnings tracker, stock pages and P/E.
//
// Each company costs one provider request per season: `results_checks` records
// who was asked. A company the provider hasn't updated yet is retried after a
// day. Largest companies (by turnover) go first, and `max` caps a run.

import type { SqliteDatabase } from "../../../api/src/db/sqlite.js";
import { filingKind } from "../../../api/src/handlers/filings.js";
import { addDays, download, sleep, todayIST } from "../lib.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nseQuery = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** The quarter whose results are being filed now: the last quarter end before today. */
export function currentQuarterEnd(today = todayIST()): string {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const ends = [[y, 3, 31], [y, 6, 30], [y, 9, 30], [y, 12, 31], [y - 1, 12, 31]] as const;
  const past = ends.map(([yy, mm, dd]) => `${yy}-${String(mm).padStart(2, "0")}-${dd}`).filter((d) => d < today).sort();
  return past[past.length - 1] ?? `${y - 1}-12-31`;
}

/** "Sep 2026" → "2026-09-30"; null for annual or odd labels. */
function quarterEnd(label: string): string | null {
  const m = /^([A-Za-z]{3})\s+(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  if (month < 0) return null;
  return new Date(Date.UTC(Number(m[2]), month + 1, 0)).toISOString().slice(0, 10);
}

/** Symbols with a results filing on NSE between `from` and today, fetched a week at a time. */
async function declaredSymbols(from: string): Promise<Set<string>> {
  const out = new Set<string>();
  const today = todayIST();
  for (let start = from; start <= today; start = addDays(start, 7)) {
    const end = addDays(start, 6) < today ? addDays(start, 6) : today;
    const buf = await download(`https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=${nseQuery(start)}&to_date=${nseQuery(end)}`, { cache: end < today });
    if (!buf) continue;
    for (const a of JSON.parse(new TextDecoder().decode(buf)) as { symbol: string; desc: string; attchmntText: string }[]) {
      if (filingKind(a.desc ?? "", a.attchmntText ?? "") === "results" && a.symbol) out.add(a.symbol);
    }
    await sleep(400);
  }
  return out;
}

type Series = Record<string, Record<string, number | null>>;

async function fetchQuarterly(name: string): Promise<Series | null> {
  const key = process.env.INDIANAPI_KEY;
  if (!key) throw new Error("INDIANAPI_KEY is not set in .env");
  const base = process.env.INDIANAPI_BASE_URL || "https://stock.indianapi.in";
  const res = await fetch(`${base}/historical_stats?${new URLSearchParams({ stock_name: name, stats: "quarter_results" })}`, {
    headers: { "x-api-key": key }, signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) throw new Error("The provider's request limit is used up; run again later.");
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  return j && typeof j === "object" && !("error" in j) ? (j as Series) : null;
}

export async function loadResults(db: SqliteDatabase, { max = 250, quarter = currentQuarterEnd() } = {}) {
  const declared = await declaredSymbols(addDays(quarter, 1));
  // Largest first; skip companies already stored for this quarter or asked within a day.
  const queue = db.raw.prepare(`
    SELECT s.symbol, s.name FROM stocks s LEFT JOIN stock_metrics m ON m.symbol = s.symbol
    WHERE NOT EXISTS (SELECT 1 FROM financials f WHERE f.symbol = s.symbol AND f.period_type = 'Q' AND f.period_end = ?)
      AND NOT EXISTS (SELECT 1 FROM results_checks c WHERE c.symbol = s.symbol AND c.quarter_end = ? AND c.checked_at > datetime('now', '-1 day'))
    ORDER BY COALESCE(m.turnover, 0) DESC`).all(quarter, quarter) as { symbol: string; name: string }[];
  const todo = queue.filter((r) => declared.has(r.symbol)).slice(0, max);

  const upsert = db.raw.prepare(`INSERT OR REPLACE INTO financials
    (symbol, period_end, period_type, consolidated, revenue, expenses, operating_profit, other_income, depreciation, interest, pbt, tax, net_profit, eps)
    VALUES (?, ?, 'Q', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const check = db.raw.prepare("INSERT OR REPLACE INTO results_checks (symbol, quarter_end, checked_at, found) VALUES (?, ?, datetime('now'), ?)");
  let found = 0;
  let asked = 0;
  for (const { symbol, name } of todo) {
    // The provider matches on the company name without "The …" / "… Limited"; when that's
    // unknown to it (e.g. "Dr. Reddy's Laboratories"), the NSE symbol usually works.
    const cleaned = name.replace(/^the\s+/i, "").replace(/\s+(limited|ltd\.?)$/i, "").replace(/\s+/g, " ").trim();
    let s = await fetchQuarterly(cleaned);
    asked++;
    if (!s?.Sales && !s?.Revenue) {
      await sleep(350);
      s = await fetchQuarterly(symbol);
      asked++;
    }
    // Banks report "Revenue" / "Financing Profit" where others report "Sales" / "Operating Profit".
    const row = (...names: string[]) => names.map((n) => s?.[n]).find(Boolean) ?? {};
    const sales = row("Sales", "Revenue"), op = row("Operating Profit", "Financing Profit");
    let hasQuarter = false;
    if (s) {
      db.raw.exec("BEGIN");
      for (const label of Object.keys(sales)) {
        const end = quarterEnd(label);
        if (!end) continue;
        const pbt = row("Profit before tax")[label] ?? null;
        const taxPct = row("Tax %")[label] ?? null;
        upsert.run(symbol, end, sales[label] ?? null, row("Expenses")[label] ?? null, op[label] ?? null, row("Other Income")[label] ?? null,
          row("Depreciation")[label] ?? null, row("Interest")[label] ?? null, pbt, pbt != null && taxPct != null ? Math.round(pbt * taxPct) / 100 : null,
          row("Net Profit")[label] ?? null, row("EPS in Rs")[label] ?? null);
        if (end === quarter) hasQuarter = true;
      }
      db.raw.exec("COMMIT");
    }
    check.run(symbol, quarter, hasQuarter ? 1 : 0);
    if (hasQuarter) found++;
    if (asked % 25 === 0) console.log(`  ${asked}/${todo.length} asked, ${found} with ${quarter} results`);
    await sleep(350);
  }
  return { quarter, declared: declared.size, asked, found, remaining: Math.max(0, queue.filter((r) => declared.has(r.symbol)).length - todo.length) };
}
