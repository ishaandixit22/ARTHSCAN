// The pieces of one IPO's page: reading NSE's issue text, how the issue is split between investor
// categories, the bids table, the timetable with each step's state, the day-wise premium table
// and a markdown rendering of the whole thing. Pure functions over what the handler fetched.

import type { Category } from "./ipo.js";

const num = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
};
const UNIT_TO_CR: Record<string, number> = { crore: 1, cr: 1, million: 0.1, lakh: 0.01, lakhs: 0.01 };

/** An NSE amount phrase such as "Rs. 1,830.57 million" in ₹ crore. */
function croreFrom(text: string, lead: RegExp): number | null {
  const m = new RegExp(`${lead.source}[^\\d]{0,80}?(?:Rs\\.?|₹)\\s*([\\d,]+(?:\\.\\d+)?)\\s*(crore|cr|million|lakhs?)`, "i").exec(text);
  return m ? Math.round(Number(m[1].replace(/,/g, "")) * UNIT_TO_CR[m[2].toLowerCase()] * 100) / 100 : null;
}

/** Fresh issue, offer for sale and anchor portion from NSE's free-text "Issue Size" line. */
export function parseIssueText(text: string | null | undefined) {
  const t = String(text ?? "");
  const anchor = /anchor[^\d]{0,60}?([\d,]{4,})\s*(?:equity\s*)?shares/i.exec(t);
  return {
    fresh_cr: croreFrom(t, /fresh\s+issue/),
    ofs_cr: croreFrom(t, /offer\s+for\s+sale/),
    anchor_shares: anchor ? num(anchor[1]) : null,
  };
}

export type ReserveRow = { key: string; label: string; shares: number; pct_net: number | null; pct_total: number | null; within: string | null };
const pc = (v: number, of: number) => (of > 0 ? Math.round((v / of) * 10000) / 100 : null);

/**
 * How the issue is split. Shares are NSE's net offer to the public; the anchor portion is carved
 * out of QIB before the issue opens, so the "total issue" is the net offer plus the anchor.
 */
export function reservation(cats: Category[], anchorShares: number | null): { rows: ReserveRow[]; net: number; total: number } {
  const by = Object.fromEntries(cats.map((c) => [c.key, c]));
  const net = by.total?.offered ?? cats.filter((c) => ["qib", "nii", "retail"].includes(c.key)).reduce((a, c) => a + (c.offered ?? 0), 0);
  const total = net + (anchorShares ?? 0);
  const rows: ReserveRow[] = [];
  const add = (key: string, label: string, shares: number | null | undefined, within: string | null = null, showNet = true) => {
    if (shares == null) return;
    rows.push({ key, label, shares, pct_net: showNet ? pc(shares, net) : null, pct_total: pc(shares, total), within });
  };
  add("qib", "QIB", by.qib?.offered);
  if (anchorShares) add("anchor", "Anchor investors", anchorShares, "qib", false);
  add("nii", "NII (HNI)", by.nii?.offered);
  add("bnii", "bNII, above ₹10 lakh", by.bnii?.offered, "nii", false);
  add("snii", "sNII, ₹2–10 lakh", by.snii?.offered, "nii", false);
  add("retail", "Retail (RII)", by.retail?.offered);
  return { rows, net, total };
}

export type Step = { key: string; label: string; date: string | null; state: "done" | "today" | "next" | "later" };
/** The timetable with where we are in it; the first step still ahead is "next". */
export function timelineSteps(d: { open: string | null; close: string | null; allotment: string | null; refund: string | null; demat: string | null; listing: string | null }, today: string): Step[] {
  const raw: [string, string, string | null][] = [["open", "Open", d.open], ["close", "Close", d.close], ["allotment", "Allotment", d.allotment], ["refund", "Refund", d.refund], ["demat", "Demat credit", d.demat], ["listing", "Listing", d.listing]];
  let nextSet = false;
  return raw.map(([key, label, date]) => {
    if (!date) return { key, label, date, state: "later" as const };
    if (date < today) return { key, label, date, state: "done" as const };
    if (date === today) { nextSet = true; return { key, label, date, state: "today" as const }; }
    const state = nextSet ? ("later" as const) : ("next" as const);
    nextSet = true;
    return { key, label, date, state };
  });
}

export type GmpRow = { date: string; gmp: number; pct: number | null; est_listing: number | null; gain_per_lot: number | null };
/** Day-wise premium table (newest first) from the provider's daily series. */
export function gmpRows(series: { timestamp: string; price: number }[], high: number | null, lot: number | null): GmpRow[] {
  return series.filter((p) => typeof p.price === "number").map((p) => ({
    date: p.timestamp.slice(0, 10), gmp: p.price,
    pct: high ? Math.round((p.price / high) * 10000) / 100 : null,
    est_listing: high ? Math.round((high + p.price) * 100) / 100 : null,
    gain_per_lot: lot ? Math.round(p.price * lot) : null,
  })).reverse();
}

/** The bids table: shares offered and bid for, what the bids are worth at the top of the band, and times. */
export function bidRows(cats: Category[]) {
  const order: [string, string | null][] = [["qib", null], ["nii", null], ["bnii", "nii"], ["snii", "nii"], ["retail", null], ["total", null]];
  return order.flatMap(([key, within]) => {
    const c = cats.find((x) => x.key === key);
    return c ? [{ key, label: c.label.replace(" (all)", ""), within, offered: c.offered, bid: c.bid, bid_cr: c.demand_cr, times: c.times }] : [];
  });
}

const inr = (v: number | null | undefined) => (v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`);
const x = (v: number | null | undefined) => (v == null ? "—" : `${v}×`);

/** One IPO as markdown: the numbers an assistant needs, in the order of the page. */
export function ipoMarkdown(o: any): string {
  const L: string[] = [];
  L.push(`# ${o.name} IPO (${o.symbol}, ${o.board})`, "");
  L.push(`**Status:** ${o.status} · **Price band:** ${inr(o.price_low)}–${inr(o.price_high)} · **Lot:** ${o.costs?.lot_size ?? "—"} shares (${inr(o.cut_off_cost)} at cut-off) · **Issue size:** ${o.issue_size_cr != null ? `₹${o.issue_size_cr} Cr` : "—"}`, "");
  L.push("## Timetable", "", ...o.timeline.map((s: any) => `- ${s.label}: ${s.date ?? "—"}${s.state === "done" ? " (done)" : ""}`), "");
  L.push(`## Subscription (${x(o.times_total)} overall${o.data_as_of ? `, ${o.data_as_of}` : ""})`, "", "| Category | Shares offered | Shares bid | Bids (₹ Cr) | Times |", "|---|---|---|---|---|");
  for (const r of o.subscription) L.push(`| ${r.within ? "↳ " : ""}${r.label} | ${r.offered?.toLocaleString("en-IN") ?? "—"} | ${r.bid?.toLocaleString("en-IN") ?? "—"} | ${r.bid_cr ?? "—"} | ${x(r.times)} |`);
  L.push("");
  if (o.gmp.latest != null) {
    L.push(`## Grey-market premium (unofficial, not a forecast)`, "", `Latest ₹${o.gmp.latest} (${o.gmp.pct}%), estimated listing ${inr(o.gmp.est_listing)}, profit per lot ${inr(o.gmp.profit_per_lot)}.`, "");
    if (o.gmp.days.length) L.push("| Date | GMP | % | Est. listing | Gain / lot |", "|---|---|---|---|---|", ...o.gmp.days.map((d: GmpRow) => `| ${d.date} | ₹${d.gmp} | ${d.pct ?? "—"}% | ${inr(d.est_listing)} | ${inr(d.gain_per_lot)} |`), "");
  }
  if (o.application) {
    const a = o.application;
    L.push("## Application size", "", `- Retail: ${a.retail_min_lots}–${a.retail_max_lots} lots (up to ₹2 lakh)`, `- sNII: ${a.snii_min_lots}–${a.snii_max_lots} lots (₹2–10 lakh)`, `- bNII: from ${a.bnii_min_lots} lots (above ₹10 lakh)`, "");
  }
  if (o.anchor) L.push("## Anchor", "", `${o.anchor.shares.toLocaleString("en-IN")} shares (₹${o.anchor.amount_cr} Cr). Lock-in ends ${o.anchor.lockin_50pct} (50%) and ${o.anchor.lockin_rest} (rest), estimated.`, "");
  L.push("_Dates, chances and bracket sizes are estimates from published numbers. Grey-market premium is unofficial. Not investment advice._");
  return L.join("\n");
}
