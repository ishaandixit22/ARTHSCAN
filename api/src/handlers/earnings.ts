// Results season: every company that has reported a quarter, with revenue and
// profit against the same quarter a year ago (YoY) and the quarter before
// (QoQ), an eight-quarter profit trend and a plain-English verdict; plus the
// season's summary (how many grew, median growth, strongest and weakest
// sectors). Built from the `financials` table that the results job fills.

import { nseDate, nseFetch, todayIST } from "../lib/nse.js";
import type { Tool } from "./tools.js";

type Q = { symbol: string; period_end: string; revenue: number | null; operating_profit: number | null; net_profit: number | null; eps: number | null };
export type Verdict = "Growing" | "Mixed" | "Shrinking" | "Loss" | "Back to profit";

/** The quarter-end `months` months before a quarter-end date. */
export function shiftQuarter(end: string, months: number): string {
  const d = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months + 1, 0); // last day of the target month
  return d.toISOString().slice(0, 10);
}

/** "2026-09-30" → { short: "Q2 FY27", span: "Jul–Sep 2026" } (Indian financial year, April to March). */
export function quarterLabel(end: string) {
  const y = Number(end.slice(0, 4)), m = Number(end.slice(5, 7));
  const q = m === 6 ? 1 : m === 9 ? 2 : m === 12 ? 3 : 4;
  const fy = (m === 3 ? y : y + 1) % 100;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return { short: `Q${q} FY${String(fy).padStart(2, "0")}`, span: `${names[m - 3]}–${names[m - 1]} ${y}` };
}

/** Growth in % against a positive base; null when there is no meaningful base. */
export const growth = (now: number | null | undefined, base: number | null | undefined) =>
  now == null || base == null || base <= 0 ? null : Math.round(((now - base) / base) * 1000) / 10;

/** A one-word read of the quarter that anyone can follow. */
export function verdict(salesYoy: number | null, profit: number | null, profitPrevYear: number | null, profitYoy: number | null): Verdict {
  if (profit != null && profit < 0) return "Loss";
  if (profit != null && profit > 0 && profitPrevYear != null && profitPrevYear <= 0) return "Back to profit";
  if (profitYoy != null && salesYoy != null) {
    if (profitYoy >= 0 && salesYoy >= 0) return "Growing";
    if (profitYoy < 0 && salesYoy < 0) return "Shrinking";
  }
  return "Mixed";
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2) * 10) / 10;
};

export const EARNINGS_TOOLS: Tool[] = [
  {
    name: "get_earnings_season",
    route: "/market/earnings-season",
    title: "Results season",
    description: "Quarterly results season for NSE companies: each company's revenue and net profit for the quarter with growth against the same quarter last year (YoY) and the previous quarter (QoQ), EPS, operating margin, a verdict (Growing, Mixed, Shrinking, Loss, Back to profit) and eight quarters of profit; plus the season's summary and a sector breakdown. INR crore.",
    inputSchema: {
      type: "object",
      properties: {
        quarter: { type: "string", description: "Quarter end date, e.g. 2026-09-30 (default: the latest quarter with results)" },
        sector: { type: "string", description: "Only one sector" },
        result: { type: "string", enum: ["Growing", "Mixed", "Shrinking", "Loss", "Back to profit"], description: "Only one verdict" },
        sort: { type: "string", enum: ["largest", "profit_growth", "sales_growth", "profit_fall"], description: "Default largest (by revenue)" },
        limit: { type: "integer", description: "Default 100, max 1000" },
        offset: { type: "integer", description: "For paging (default 0)" },
      },
    },
    metered: true,
    handler: async (db, { quarter, sector, result, sort, limit, offset }, env) => {
      const { results: quarters } = await db.prepare(`SELECT period_end, COUNT(*) AS n FROM financials WHERE period_type = 'Q'
        GROUP BY period_end HAVING n >= 10 ORDER BY period_end DESC LIMIT 4`).all<{ period_end: string; n: number }>();
      if (!quarters.length) return { quarter: null, quarters: [], summary: null, sectors: [], total: 0, companies: [] };
      const q = quarters.find((x) => x.period_end === quarter)?.period_end ?? quarters[0].period_end;
      const prevQ = shiftQuarter(q, 3), prevY = shiftQuarter(q, 12), from = shiftQuarter(q, 21);

      const { results: now } = await db.prepare(`SELECT f.symbol, s.name, COALESCE(s.sector, 'Other') AS sector, f.revenue, f.operating_profit, f.net_profit, f.eps
        FROM financials f JOIN stocks s ON s.symbol = f.symbol WHERE f.period_type = 'Q' AND f.period_end = ?`).bind(q)
        .all<Q & { name: string; sector: string }>();
      const { results: hist } = await db.prepare(`SELECT symbol, period_end, revenue, operating_profit, net_profit, eps FROM financials
        WHERE period_type = 'Q' AND period_end > ? AND period_end <= ? AND symbol IN (SELECT symbol FROM financials WHERE period_type = 'Q' AND period_end = ?)
        ORDER BY period_end`).bind(from, q, q).all<Q>();
      const bySymbol = new Map<string, Map<string, Q>>();
      for (const h of hist) {
        if (!bySymbol.has(h.symbol)) bySymbol.set(h.symbol, new Map());
        bySymbol.get(h.symbol)!.set(h.period_end, h);
      }

      const rows = now.map((r) => {
        const h = bySymbol.get(r.symbol)!;
        const py = h.get(prevY), pq = h.get(prevQ);
        const salesYoy = growth(r.revenue, py?.revenue), profitYoy = growth(r.net_profit, py?.net_profit);
        const opm = r.revenue ? Math.round(((r.operating_profit ?? 0) / r.revenue) * 1000) / 10 : null;
        const opmPrev = py?.revenue ? Math.round(((py.operating_profit ?? 0) / py.revenue) * 1000) / 10 : null;
        return {
          symbol: r.symbol, name: r.name, sector: r.sector,
          revenue: r.revenue, sales_yoy: salesYoy, sales_qoq: growth(r.revenue, pq?.revenue),
          net_profit: r.net_profit, profit_yoy: profitYoy, profit_qoq: growth(r.net_profit, pq?.net_profit),
          eps: r.eps, opm, opm_change: opm != null && opmPrev != null ? Math.round((opm - opmPrev) * 10) / 10 : null,
          verdict: verdict(salesYoy, r.net_profit, py?.net_profit ?? null, profitYoy),
          trend: [...h.values()].slice(-8).map((x) => ({ quarter: x.period_end, net_profit: x.net_profit })),
        };
      });

      // Season summary over every reporter (filters below don't change it).
      const comparable = rows.filter((r) => r.profit_yoy != null);
      const grew = comparable.filter((r) => r.profit_yoy! >= 0).length;
      const sectorsMap = new Map<string, typeof rows>();
      for (const r of rows) sectorsMap.set(r.sector, [...(sectorsMap.get(r.sector) ?? []), r]);
      const sectors = [...sectorsMap].map(([name, rs]) => {
        const c = rs.filter((r) => r.profit_yoy != null);
        return {
          sector: name, companies: rs.length,
          revenue: Math.round(rs.reduce((a, r) => a + (r.revenue ?? 0), 0)),
          net_profit: Math.round(rs.reduce((a, r) => a + (r.net_profit ?? 0), 0)),
          median_sales_yoy: median(rs.flatMap((r) => (r.sales_yoy == null ? [] : [r.sales_yoy]))),
          median_profit_yoy: median(c.map((r) => r.profit_yoy!)),
          pct_grew: c.length ? Math.round((c.filter((r) => r.profit_yoy! >= 0).length / c.length) * 100) : null,
        };
      }).sort((a, b) => b.revenue - a.revenue);
      const ranked = sectors.filter((s) => s.companies >= 5 && s.median_profit_yoy != null).sort((a, b) => b.median_profit_yoy! - a.median_profit_yoy!);

      // Companies with a results board meeting still ahead this season (NSE calendar; skipped if NSE is down).
      let pending: number | null = null;
      try {
        const ev = await nseFetch(env, "https://www.nseindia.com/api/event-calendar", 3600, (body) =>
          (JSON.parse(body) as { symbol: string; purpose: string; date: string }[]).map((e) => ({ symbol: e.symbol, date: nseDate(e.date), purpose: e.purpose })));
        const reported = new Set(rows.map((r) => r.symbol));
        pending = new Set(ev.data.filter((e) => e.date && e.date >= todayIST() && /financial result/i.test(e.purpose ?? "") && !reported.has(e.symbol)).map((e) => e.symbol)).size;
      } catch { /* the summary shows declared only */ }

      const SORTS: Record<string, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
        largest: (a, b) => (b.revenue ?? 0) - (a.revenue ?? 0),
        profit_growth: (a, b) => (b.profit_yoy ?? -Infinity) - (a.profit_yoy ?? -Infinity),
        sales_growth: (a, b) => (b.sales_yoy ?? -Infinity) - (a.sales_yoy ?? -Infinity),
        profit_fall: (a, b) => (a.profit_yoy ?? Infinity) - (b.profit_yoy ?? Infinity),
      };
      const listed = rows
        .filter((r) => (!sector || r.sector === sector) && (!result || r.verdict === result))
        .filter((r) => sort !== "profit_growth" && sort !== "profit_fall" ? true : r.profit_yoy != null)
        .sort(SORTS[String(sort)] ?? SORTS.largest);
      const off = Math.max(0, Math.floor(Number(offset) || 0));
      const lim = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 100)));

      return {
        quarter: { end: q, ...quarterLabel(q), previous_quarter: prevQ, year_ago: prevY },
        quarters: quarters.map((x) => ({ end: x.period_end, companies: x.n, ...quarterLabel(x.period_end) })),
        summary: {
          declared: rows.length, pending, comparable: comparable.length, grew, declined: comparable.length - grew,
          median_sales_yoy: median(rows.flatMap((r) => (r.sales_yoy == null ? [] : [r.sales_yoy]))),
          median_profit_yoy: median(comparable.map((r) => r.profit_yoy!)),
          margin_up: rows.filter((r) => (r.opm_change ?? 0) > 0).length,
          margin_down: rows.filter((r) => (r.opm_change ?? 0) < 0).length,
          verdicts: Object.fromEntries((["Growing", "Mixed", "Shrinking", "Loss", "Back to profit"] as Verdict[]).map((v) => [v, rows.filter((r) => r.verdict === v).length])),
          strongest: ranked[0] ?? null, weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
        },
        sectors,
        total: listed.length,
        companies: listed.slice(off, off + lim),
        note: "Figures are consolidated where the company files consolidated results. INR crore. Verdicts compare with the same quarter last year.",
      };
    },
  },
];
