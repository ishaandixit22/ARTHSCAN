// IPO board maths: parses NSE's public IPO feeds (ipo-current-issue and ipo-detail) and works out
// what an applicant needs to know: lot cost, how many lots each investor type can bid, the
// subscription of every category in times and in rupees, a rough retail allotment chance, the
// estimated allotment date and anchor lock-in dates, and profit per lot once a grey-market
// premium is supplied. Pure functions; the handler does the fetching.

import { addDaysISO } from "./nse.js";

export const RETAIL_LIMIT = 2_00_000;
export const BNII_FLOOR = 10_00_000;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/** "29-Oct-2026" → "2026-10-29". */
export function isoDate(v: unknown): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(String(v ?? "").trim());
  return m && MONTHS[m[2]] ? `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}` : null;
}

/** "Rs.78 to Rs.82" or "Rs. 78/- to Rs. 82/- per Equity Share" → { low: 78, high: 82 }. */
export function priceBand(v: unknown): { low: number | null; high: number | null } {
  const nums = [...String(v ?? "").matchAll(/(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, ""))).filter(Number.isFinite);
  return nums.length ? { low: Math.min(...nums), high: Math.max(...nums) } : { low: null, high: null };
}

/** Trading days after a date: weekends and the given exchange holidays are skipped. */
export function addWorkingDays(iso: string, n: number, holidays: string[] = []): string {
  let d = iso;
  for (let left = n; left > 0; ) {
    d = addDaysISO(d, 1);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.includes(d)) left--;
  }
  return d;
}

export type CategoryKey = "qib" | "nii" | "bnii" | "snii" | "retail" | "total";
export type Category = { key: CategoryKey; label: string; offered: number | null; bid: number | null; times: number | null; demand_cr: number | null };
const LABELS: Record<CategoryKey, string> = { qib: "QIB", nii: "NII (all)", bnii: "bNII (above ₹10 lakh)", snii: "sNII (₹2–10 lakh)", retail: "Retail", total: "Total" };
const BY_SR: Record<string, CategoryKey> = { "1": "qib", "2": "nii", "2.1": "bnii", "2.2": "snii", "3": "retail" };

/** Category rows of NSE's `activeCat` table (all exchanges combined), with demand in ₹ crore at the upper band. */
export function parseCategories(rows: any[] | undefined, upper: number | null): Category[] {
  const out: Category[] = [];
  for (const r of rows ?? []) {
    const key = r.srNo == null && /^total$/i.test(r.category ?? "") ? "total" : BY_SR[String(r.srNo ?? "")];
    if (!key) continue;
    const offered = num(r.noOfShareOffered ?? r.noOfSharesOffered), bid = num(r.noOfSharesBid ?? r.noOfsharesBid);
    const times = num(r.noOfTotalMeant ?? r.noOfTime) ?? (offered && bid != null ? bid / offered : null);
    out.push({ key, label: LABELS[key], offered, bid, times: times == null ? null : Math.round(times * 100) / 100, demand_cr: bid != null && upper ? Math.round((bid * upper) / 1e5) / 100 : null });
  }
  return out;
}

export type Costs = {
  lot_size: number; lot_cost: number;
  retail_max_lots: number; retail_max_cost: number;
  snii_min_lots: number; snii_min_cost: number; snii_max_lots: number; snii_max_cost: number;
  bnii_min_lots: number; bnii_min_cost: number;
};

/** What one lot costs and the smallest bid in each investor bracket (upper band: the cut-off cost). */
export function costs(lot: number | null, upper: number | null): Costs | null {
  if (!lot || !upper) return null;
  const lotCost = lot * upper;
  const retailLots = Math.max(1, Math.floor(RETAIL_LIMIT / lotCost));
  const sLots = Math.floor(RETAIL_LIMIT / lotCost) + 1, bLots = Math.floor(BNII_FLOOR / lotCost) + 1;
  return {
    lot_size: lot, lot_cost: Math.round(lotCost),
    retail_max_lots: retailLots, retail_max_cost: Math.round(retailLots * lotCost),
    snii_min_lots: sLots, snii_min_cost: Math.round(sLots * lotCost), snii_max_lots: bLots - 1, snii_max_cost: Math.round((bLots - 1) * lotCost),
    bnii_min_lots: bLots, bnii_min_cost: Math.round(bLots * lotCost),
  };
}

/**
 * Rough chance of a retail lot, assuming each applicant bids one lot: lots on offer ÷ lots bid for.
 * It cannot see how many applications there are, so it is an estimate, never a promise.
 */
export function retailOdds(offered: number | null, bid: number | null, lot: number | null) {
  if (!offered || !lot || bid == null) return null;
  const lotsOffered = Math.floor(offered / lot);
  const lotsBid = bid / lot;
  return { lots_offered: lotsOffered, lots_bid: Math.round(lotsBid), chance: lotsBid <= lotsOffered ? 1 : Math.round((lotsOffered / lotsBid) * 1000) / 1000 };
}

/**
 * The post-close timetable under SEBI's T+3 listing: allotment the next trading day, refund and
 * demat credit the day after, listing the day after that, and the anchor lock-in ends (30 and 90
 * days after allotment). Tentative: an exchange can shift a step.
 */
export function anchorDates(closeISO: string | null, holidays: string[] = []) {
  if (!closeISO) return null;
  const allotment = addWorkingDays(closeISO, 1, holidays);
  const refund = addWorkingDays(closeISO, 2, holidays);
  return {
    allotment_est: allotment, refund_est: refund, demat_est: refund, listing_est: addWorkingDays(closeISO, 3, holidays),
    lockin_50pct: addDaysISO(allotment, 30), lockin_rest: addDaysISO(allotment, 90),
  };
}

/** Rupees of profit on one lot at a grey-market premium (₹ per share). Null until a premium is known. */
export function profitPerLot(gmp: number | null | undefined, lot: number | null | undefined) {
  return gmp == null || !lot ? null : Math.round(gmp * lot);
}

/** Facts from NSE's `ipo-detail` issueInfo list. */
export function parseIssueInfo(list: { title: string | null; value: string | null }[] | undefined) {
  const get = (t: string) => list?.find((x) => x.title?.toLowerCase() === t.toLowerCase())?.value ?? null;
  const lot = num(/\d[\d,]*/.exec(get("Bid Lot") ?? "")?.[0]);
  const band = priceBand(get("Price Range"));
  const link = (v: string | null) => (v && /^https?:\/\//.test(v) ? v : null);
  return { lot, band, rhp: link(get("Red Herring Prospectus")), anchor_report: link(get("Anchor Allocation Report")), registrar: get("Name of the Registrar") };
}
