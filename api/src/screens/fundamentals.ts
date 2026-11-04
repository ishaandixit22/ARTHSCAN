// Company figures for screens, worked out from a company's stored statements. A line the provider
// doesn't report stays null: banks and lenders have no operating margin or ROCE, so they fall out
// of screens that test those rather than getting a stand-in. Figures are ₹ crore unless named.
//
// Twelve-month figures add the last four quarters. Growth over N years is the compound rate between
// annual reports N years apart, and only exists when both ends are positive.

import type { Bundle } from "../lib/statements.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodKey = (label: string) => {
  const m = /^([A-Za-z]{3}) (\d{4})$/.exec(label.trim());
  return m ? Number(m[2]) * 12 + MONTHS.indexOf(m[1]) : null;
};

/** One statement line, newest period first, with TTM columns left out. */
function line(section: Record<string, Record<string, number | null>> | undefined, ...names: string[]): { period: string; v: number | null }[] {
  const row = names.map((n) => section?.[n]).find(Boolean);
  if (!row) return [];
  return Object.entries(row)
    .flatMap(([period, v]) => { const k = periodKey(period); return k === null ? [] : [{ period, k, v: typeof v === "number" && Number.isFinite(v) ? v : null }]; })
    .sort((a, b) => b.k - a.k)
    .map(({ period, v }) => ({ period, v }));
}
const vals = (rows: { v: number | null }[]) => rows.map((r) => r.v);
const round = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10000) / 10000);
const sumOf = (xs: (number | null)[], n: number) => {
  if (xs.length < n) return null;
  let s = 0;
  for (let i = 0; i < n; i++) { const v = xs[i]; if (v === null) return null; s += v; }
  return s;
};
const avgOf = (xs: (number | null)[], n: number) => { const s = sumOf(xs, n); return s === null ? null : s / n; };
const pctGrowth = (now: number | null, before: number | null) => (now === null || before === null || before <= 0 ? null : (now / before - 1) * 100);
const cagr = (xs: (number | null)[], years: number) => {
  const a = xs[0], b = xs[years];
  return a == null || b == null || a <= 0 || b <= 0 ? null : (Math.pow(a / b, 1 / years) - 1) * 100;
};
const at = (xs: (number | null)[], i: number) => xs[i] ?? null;
const div = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);

export type Snapshot = { market_cap_cr: number | null; price: number | null; pe: number | null; pe_to_sector: number | null; industry_pb: number | null };
export type KeyMetrics = { current_ratio: number | null; cash_per_share: number | null };

export type Computed = {
  fund: Record<string, number | null>;
  years: Record<string, (number | null)[]>;
  fyEps: { month: string; eps: number | null }[];
  /** The newest quarter and year these figures cover. */
  latestQuarter: string | null;
  latestYear: string | null;
};

export function computeFundamentals(b: Bundle, stock: { face_value: number | null }, snap: Snapshot | null, km: KeyMetrics | null): Computed {
  const q = b.quarter_results, y = b.yoy_results, bs = b.balancesheet, cf = b.cashflow, r = b.ratios, sh = b.shareholding_pattern_quarterly;

  const salesQ = vals(line(q, "Sales", "Revenue")), npQ = vals(line(q, "Net Profit")), epsQ = vals(line(q, "EPS in Rs")), opmQ = vals(line(q, "OPM %"));
  const opQ = vals(line(q, "Operating Profit")), oiQ = vals(line(q, "Other Income")), depQ = vals(line(q, "Depreciation")), intQ = vals(line(q, "Interest"));
  const pbtQ = vals(line(q, "Profit before tax")), taxPctQ = vals(line(q, "Tax %"));
  const salesRows = line(y, "Sales", "Revenue");
  const salesY = vals(salesRows), npY = vals(line(y, "Net Profit")), epsRows = line(y, "EPS in Rs"), epsY = vals(epsRows), opmY = vals(line(y, "OPM %"));
  const payoutY = vals(line(y, "Dividend Payout %"));
  const eqY = vals(line(bs, "Equity Capital")), resY = vals(line(bs, "Reserves")), debtY = vals(line(bs, "Borrowings", "Borrowing"));
  const assetsY = vals(line(bs, "Total Assets")), blockY = vals(line(bs, "Fixed Assets")), cwipY = vals(line(bs, "CWIP"));
  const cfoY = vals(line(cf, "Cash from Operating Activity")), fcfY = vals(line(cf, "Free Cash Flow"));
  const roceY = vals(line(r, "ROCE %")), debtorY = vals(line(r, "Debtor Days")), invDaysY = vals(line(r, "Inventory Days"));
  const promoter = vals(line(sh, "Promoters")), fii = vals(line(sh, "FIIs")), dii = vals(line(sh, "DIIs"));

  const bookY = eqY.map((e, i) => (e === null || resY[i] == null ? null : e + (resY[i] as number)));
  const roeY = npY.map((n, i) => { const bk = bookY[i]; return n === null || bk == null || bk <= 0 ? null : (n / bk) * 100; });
  const divY = payoutY.map((p, i) => { const n = npY[i]; return p === null || n == null ? null : (p / 100) * Math.max(n, 0); });

  const sales = sumOf(salesQ, 4), np = sumOf(npQ, 4), eps = sumOf(epsQ, 4), op = sumOf(opQ, 4), oi = sumOf(oiQ, 4), dep = sumOf(depQ, 4), interest = sumOf(intQ, 4), pbt = sumOf(pbtQ, 4);
  const salesPrev = salesQ.length >= 8 ? sumOf(salesQ.slice(4), 4) : null;
  const npPrev = npQ.length >= 8 ? sumOf(npQ.slice(4), 4) : null;
  const opPrev = opQ.length >= 8 ? sumOf(opQ.slice(4), 4) : null;

  const debt = at(debtY, 0), book = at(bookY, 0);
  // Shares (crore) from the market value Dhan reports for a known price; else capital over face value.
  const fromSnap = snap?.market_cap_cr && snap.price ? snap.market_cap_cr / snap.price : null;
  const fromFace = at(eqY, 0) !== null && stock.face_value ? (at(eqY, 0) as number) / stock.face_value : null;
  const shares = fromSnap ?? fromFace;
  const ebit = op === null || oi === null || dep === null ? null : op + oi - dep;
  const cash = km?.cash_per_share != null && shares !== null ? km.cash_per_share * shares : null;
  const taxAvg = avgOf(taxPctQ, 4);
  const taxRate = taxAvg === null ? null : taxAvg / 100;
  const invested = debt !== null && book !== null && cash !== null ? debt + book - cash : null;

  const fund: Record<string, number | null> = {
    shares, face_value: stock.face_value ?? null, bv: div(book, shares),
    sales, sales_fy: at(salesY, 0),
    sales_g: pctGrowth(sales, salesPrev), sales_g3: cagr(salesY, 3), sales_g5: cagr(salesY, 5), sales_g10: cagr(salesY, 10),
    np, np_fy: at(npY, 0), np_g: pctGrowth(np, npPrev), np_g3: cagr(npY, 3), np_g5: cagr(npY, 5), np_g7: cagr(npY, 7), np_g10: cagr(npY, 10),
    op_g: pctGrowth(op, opPrev), avg_np_10: avgOf(npY, 10),
    np_q0: at(npQ, 0), np_q1: at(npQ, 1), np_q2: at(npQ, 2), np_q3: at(npQ, 3),
    oi_q0: at(oiQ, 0),
    tax_q0: at(pbtQ, 0) !== null && at(taxPctQ, 0) !== null ? ((at(pbtQ, 0) as number) * (at(taxPctQ, 0) as number)) / 100 : null,
    sales_yoy: pctGrowth(at(salesQ, 0), at(salesQ, 4)), np_yoy: pctGrowth(at(npQ, 0), at(npQ, 4)),
    sales_qoq: pctGrowth(at(salesQ, 0), at(salesQ, 1)), np_qoq: pctGrowth(at(npQ, 0), at(npQ, 1)),
    eps, eps_fy: at(epsY, 0), eps_fy1: at(epsY, 1), eps_q0: at(epsQ, 0), eps_q4: at(epsQ, 4),
    opm: sales && op !== null ? (op / sales) * 100 : null, opm_fy: at(opmY, 0), opm_fy1: at(opmY, 1), opm_5: avgOf(opmY, 5),
    opm_q0: at(opmQ, 0), opm_q1: at(opmQ, 1), opm_q4: at(opmQ, 4),
    npm_fy: at(salesY, 0) ? (((at(npY, 0) ?? NaN) as number) / (at(salesY, 0) as number)) * 100 : null,
    npm_fy1: at(salesY, 1) ? (((at(npY, 1) ?? NaN) as number) / (at(salesY, 1) as number)) * 100 : null,
    roe: book && book > 0 && np !== null ? (np / book) * 100 : null, roe_fy1: at(roeY, 1), roe_3: avgOf(roeY, 3), roe_5: avgOf(roeY, 5), roe_g5: cagr(roeY, 5),
    roce: at(roceY, 0), roce_fy1: at(roceY, 1), roce_3: avgOf(roceY, 3), roce_5: avgOf(roceY, 5), roce_7: avgOf(roceY, 7), roce_10: avgOf(roceY, 10),
    roic: ebit !== null && taxRate !== null && invested !== null && invested > 0 ? ((ebit * (1 - taxRate)) / invested) * 100 : null,
    debt, debt_3: at(debtY, 3), de: book && book > 0 && debt !== null ? debt / book : null,
    reserves: at(resY, 0), total_assets: at(assetsY, 0),
    block: at(blockY, 0), block_1: at(blockY, 1), block_3: at(blockY, 3), cwip: at(cwipY, 0), cwip_1: at(cwipY, 1),
    icr: pbt !== null && interest ? (pbt + interest) / interest : null,
    current_ratio: km?.current_ratio ?? null, cash, ebit, ebitda: op !== null && oi !== null ? op + oi : null,
    cfo_fy: at(cfoY, 0), cfo_fy1: at(cfoY, 1), cfo_3: sumOf(cfoY, 3), cfo_5: sumOf(cfoY, 5), fcf_fy: at(fcfY, 0),
    debtor_days: at(debtorY, 0), inv_turn: at(invDaysY, 0) ? 365 / (at(invDaysY, 0) as number) : null,
    payout: at(payoutY, 0), payout_3: avgOf(payoutY, 3), div_fy: at(divY, 0), div_avg5: avgOf(divY, 5),
    promoter: at(promoter, 0), fii: at(fii, 0), dii: at(dii, 0),
    promoter_chg: at(promoter, 0) !== null && at(promoter, 1) !== null ? (at(promoter, 0) as number) - (at(promoter, 1) as number) : null,
    fii_chg: at(fii, 0) !== null && at(fii, 1) !== null ? (at(fii, 0) as number) - (at(fii, 1) as number) : null,
    dii_chg: at(dii, 0) !== null && at(dii, 1) !== null ? (at(dii, 0) as number) - (at(dii, 1) as number) : null,
    // Dhan's own sector P/E and industry P/B: this figure's P/E over its ratio to the sector.
    industry_pe: snap?.pe && snap.pe_to_sector ? snap.pe / snap.pe_to_sector : null,
    industry_pb: snap?.industry_pb ?? null,
  };
  for (const k of Object.keys(fund)) { const v = fund[k]; fund[k] = v === undefined ? null : round(v); }

  const fyMonth = (period: string) => { const k = periodKey(period)!; return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`; };
  return {
    fund,
    years: { sales: salesY.slice(0, 8), np: npY.slice(0, 8), eps: epsY.slice(0, 8), debt: debtY.slice(0, 8) },
    fyEps: epsRows.slice(0, 5).map((e) => ({ month: fyMonth(e.period), eps: e.v })),
    latestQuarter: line(q, "Net Profit")[0]?.period ?? null,
    latestYear: salesRows[0]?.period ?? null,
  };
}
