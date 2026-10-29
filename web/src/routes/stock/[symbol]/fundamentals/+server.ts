// Quarterly results and shareholding from the Indian Stock API, for stock pages
// whose fundamentals haven't been imported. The page calls this from the browser
// after it loads, so crawlers walking ~3,500 stock pages don't spend the plan.

import { json } from "@sveltejs/kit";
import { api, ext } from "$lib/server/api";

type Series = Record<string, Record<string, number | null>>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jun 2026" → "2026-06-30". */
function monthEnd(label: string): string | null {
  const [mon, year] = label.split(" ");
  const m = MONTHS.indexOf(mon);
  if (m < 0 || !/^\d{4}$/.test(year)) return null;
  return new Date(Date.UTC(+year, m + 1, 0)).toISOString().slice(0, 10);
}

/** Newest-first rows of {[periodKey]: date, ...fields} from the provider's {field: {period: value}} shape. */
function pivot(s: Series, fields: Record<string, string[]>, periodKey: string, limit: number) {
  const pick = (names: string[]) => names.map((n) => s[n]).find(Boolean) ?? {};
  const cols = Object.fromEntries(Object.entries(fields).map(([k, names]) => [k, pick(names)]));
  const labels = Object.keys(Object.values(cols).find((c) => Object.keys(c).length) ?? {});
  return labels
    .map((label) => ({ label, end: monthEnd(label) }))
    .filter((p) => p.end)
    .sort((a, b) => b.end!.localeCompare(a.end!))
    .slice(0, limit)
    .map(({ label, end }) => ({ [periodKey]: end, ...Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, c[label] ?? null])) }));
}

export async function GET({ params, setHeaders }) {
  const stock = encodeURIComponent(params.symbol.toUpperCase());
  // Known symbols only, so made-up names can't be used to spend the provider plan.
  const known = await api(`/v1/stocks/${stock}`, { allowError: true }).catch(() => null);
  if (!known?.symbol) return json({ periods: [], quarters: [], fetched_at: null }, { status: 404 });
  const [results, holding] = await Promise.all([
    ext<Series>(`/statements?stock=${stock}&stats=quarter_results`),
    ext<Series>(`/statements?stock=${stock}&stats=shareholding_pattern_quarterly`),
  ]);

  // Banks report "Revenue" / "Financing Profit" where others report "Sales" / "Operating Profit".
  const periods = results.data
    ? pivot(results.data, {
        revenue: ["Sales", "Revenue"],
        expenses: ["Expenses"],
        operating_profit: ["Operating Profit", "Financing Profit"],
        opm_pct: ["OPM %", "Financing Margin %"],
        other_income: ["Other Income"],
        depreciation: ["Depreciation"],
        interest: ["Interest"],
        pbt: ["Profit before tax"],
        tax_pct: ["Tax %"],
        net_profit: ["Net Profit"],
        eps: ["EPS in Rs"],
      }, "period_end", 8)
    : [];
  const quarters = holding.data
    ? pivot(holding.data, {
        promoter: ["Promoters"],
        fii: ["FIIs"],
        dii: ["DIIs"],
        government: ["Government"],
        public: ["Public"],
        others: ["Others"],
      }, "quarter_end", 8)
    : [];

  setHeaders({ "cache-control": "private, max-age=3600" });
  return json({ periods, quarters, fetched_at: results.fetched_at ?? holding.fetched_at });
}
