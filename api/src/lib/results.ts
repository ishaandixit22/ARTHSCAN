// Quarterly results from the Indian Stock API's historical_stats (quarter_results)
// turned into `financials` rows. Shared by the pipeline's results job and the
// Worker's scheduled refresh.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The quarter whose results are being filed now: the last quarter end before today. */
export function currentQuarterEnd(today: string): string {
  const y = Number(today.slice(0, 4));
  const ends = [`${y - 1}-12-31`, `${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`].filter((d) => d < today);
  return ends[ends.length - 1];
}

/** "Sep 2026" → "2026-09-30"; null for annual or odd labels. */
export function quarterEnd(label: string): string | null {
  const m = /^([A-Za-z]{3})\s+(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  return month < 0 ? null : new Date(Date.UTC(Number(m[2]), month + 1, 0)).toISOString().slice(0, 10);
}

export type Series = Record<string, Record<string, number | null>>;
export const FINANCIAL_COLUMNS = ["symbol", "period_end", "period_type", "consolidated", "revenue", "expenses", "operating_profit", "other_income", "depreciation", "interest", "pbt", "tax", "net_profit", "eps"] as const;

/** One financials row per quarter (period_type 'Q', consolidated where filed). */
export function quarterRows(symbol: string, s: Series): (string | number | null)[][] {
  // Banks report "Revenue" / "Financing Profit" where others report "Sales" / "Operating Profit".
  const row = (...names: string[]) => names.map((n) => s[n]).find(Boolean) ?? {};
  const sales = row("Sales", "Revenue"), op = row("Operating Profit", "Financing Profit");
  const out: (string | number | null)[][] = [];
  for (const label of Object.keys(sales)) {
    const end = quarterEnd(label);
    if (!end) continue;
    const pbt = row("Profit before tax")[label] ?? null;
    const taxPct = row("Tax %")[label] ?? null;
    out.push([symbol, end, "Q", 1, sales[label] ?? null, row("Expenses")[label] ?? null, op[label] ?? null, row("Other Income")[label] ?? null,
      row("Depreciation")[label] ?? null, row("Interest")[label] ?? null, pbt, pbt != null && taxPct != null ? Math.round(pbt * taxPct) / 100 : null,
      row("Net Profit")[label] ?? null, row("EPS in Rs")[label] ?? null]);
  }
  return out;
}

/** Names the provider recognises: without "The …" / "… Limited"; the NSE symbol is the fallback. */
export const providerName = (name: string) => name.replace(/^the\s+/i, "").replace(/\s+(limited|ltd\.?)$/i, "").replace(/\s+/g, " ").trim();
