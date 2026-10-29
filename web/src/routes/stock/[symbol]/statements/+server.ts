// A company's full financial statements from the Indian Stock API: quarterly
// results, annual profit and loss, balance sheet, cash flow and efficiency
// ratios. The stock page asks for one when its Financials tab opens, from the
// browser, so crawlers walking every stock page don't spend the plan.
//
// Returns { periods: ["Mar 2024", …, "TTM"] oldest first, rows: [{ label, note, kind, values }] }.

import { json } from "@sveltejs/kit";
import { api, ext } from "$lib/server/api";

const STATS = ["quarter_results", "yoy_results", "balancesheet", "cashflow", "ratios"] as const;
type Series = Record<string, Record<string, number | null>>;

/** How a row's figures read: crore by default, or a percentage, days, or rupees per share. */
function kindOf(label: string): "cr" | "pct" | "days" | "rs" {
  if (/%|CFO\/EBITDA/i.test(label)) return "pct";
  if (/days|cycle/i.test(label)) return "days";
  if (/EPS/i.test(label)) return "rs";
  return "cr";
}

export async function GET({ params, url, setHeaders }) {
  const stats = url.searchParams.get("stats") as (typeof STATS)[number];
  if (!STATS.includes(stats)) return json({ error: "unknown statement" }, { status: 400 });
  const stock = encodeURIComponent(params.symbol.toUpperCase());
  // Known symbols only, so made-up names can't be used to spend the provider plan.
  const known = await api(`/v1/stocks/${stock}`, { allowError: true }).catch(() => null);
  if (!known?.symbol) return json({ periods: [], rows: [] }, { status: 404 });

  const r = await ext<Series>(`/statements?stock=${stock}&stats=${stats}`);
  if (!r.data) return json({ periods: [], rows: [], error: r.error });

  // The provider keys each row by period in date order; a row may miss a period.
  const periods: string[] = [];
  for (const values of Object.values(r.data)) for (const p of Object.keys(values ?? {})) if (!periods.includes(p)) periods.push(p);
  const rows = Object.entries(r.data).map(([raw, values]) => {
    // Some labels carry an explanation after a double space ("CFO/EBITDA  Share of operating profit…").
    const [label, ...rest] = raw.split(/\s{2,}/);
    const clean: Record<string, number | null> = {};
    for (const [p, v] of Object.entries(values ?? {})) clean[p.replace(/\s{2,}(\d+m)$/, " ($1)")] = typeof v === "number" ? v : null;
    return { label: label.trim(), note: rest.join(" ").trim() || null, kind: kindOf(label), values: clean };
  });

  setHeaders({ "cache-control": "private, max-age=3600" });
  return json({
    periods: periods.map((p) => p.replace(/\s{2,}(\d+m)$/, " ($1)")),
    rows,
    fetched_at: r.fetched_at,
  });
}
