// The live IPO board: every issue open or awaiting listing, with its subscription by investor
// category straight from NSE, what a lot and each investor bracket costs, a rough retail
// allotment chance, the demand in rupees, and the estimated anchor lock-in dates; plus the
// issues still to open. A grey-market premium and profit per lot are carried as empty fields
// until a licensed premium feed is connected (see lib/ipo.ts `profitPerLot`).

import { anchorDates, costs, isoDate, parseCategories, parseIssueInfo, priceBand, profitPerLot, retailOdds } from "../lib/ipo.js";
import { bidRows, gmpRows, ipoMarkdown, parseIssueText, reservation, timelineSteps } from "../lib/ipo-detail.js";
import { detail as alertsDetail, premiums } from "../lib/ipoalerts.js";
import { tradingHolidays } from "../lib/market-hours.js";
import { ToolError } from "./errors.js";
import { nseFetch, todayIST } from "../lib/nse.js";
import type { Tool } from "./tools.js";

const BASE = "https://www.nseindia.com/api";
const LIVE_TTL = 120;

type Current = { symbol: string; name: string; series: string; status: string; start: string | null; end: string | null; low: number | null; high: number | null; lot: number | null; bse_only: boolean };
const toCurrent = (r: any): Current => {
  const band = priceBand(r.issuePrice ?? r.priceBand);
  return {
    symbol: String(r.symbol), name: r.companyName, series: r.series ?? "EQ", status: r.status ?? "", start: isoDate(r.issueStartDate), end: isoDate(r.issueEndDate),
    low: band.low, high: band.high, lot: Number(r.lotSize) || null, bse_only: r.isBse === "1",
  };
};

async function detail(env: any, c: Pick<Current, "symbol" | "series" | "status">) {
  const url = `${BASE}/ipo-detail?symbol=${encodeURIComponent(c.symbol)}&series=${encodeURIComponent(c.series)}`;
  try {
    const r = await nseFetch(env, url, c.status === "Active" ? LIVE_TTL : 3600, (body) => {
      const d = JSON.parse(body);
      return { cats: d.activeCat?.dataList ?? [], updated: d.activeCat?.updateTime ?? null, info: d.issueInfo?.dataList ?? [] };
    });
    return r.data;
  } catch {
    return null; // one issue's detail failing never blanks the board
  }
}

/** The premium as a rupee amount per share, a percentage of the top of the band, a price it implies, and what it makes on one lot. */
function premiumFields(p: { gmp: number; change_24h: number | null; history: number[]; updated: string } | undefined, high: number | null, lot: number | null) {
  if (!p) return { gmp: null, gmp_pct: null, gmp_change_24h: null, gmp_history: null, gmp_updated: null, est_listing: null, profit_per_lot: null };
  return {
    gmp: p.gmp, gmp_pct: high ? Math.round((p.gmp / high) * 1000) / 10 : null, gmp_change_24h: p.change_24h, gmp_history: p.history, gmp_updated: p.updated, est_listing: high ? Math.round((high + p.gmp) * 100) / 100 : null, profit_per_lot: profitPerLot(p.gmp, lot),
  };
}

export const IPO_TOOLS: Tool[] = [
  {
    name: "get_ipo_board",
    route: "/market/ipo-board",
    title: "Live IPO board",
    description: "IPOs open now or awaiting listing on NSE (mainboard and SME): price band, lot size, cost of one lot, the smallest bid for retail, small NII (₹2–10 lakh) and big NII (above ₹10 lakh), live subscription for QIB, NII, sNII, bNII and retail in times and in ₹ crore, a rough retail allotment chance (assumes one lot per applicant), the estimated allotment date and anchor lock-in ends, plus issues opening soon. Grey-market premium (latest hourly median across sources, with its 24-hour change and history), its % of the top of the band, the price it implies and profit per lot are null when no premium is available; `gmp` at the top says whether the feed is connected and why it failed if it did.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (_db, _args, env) => {
      const cur = await nseFetch(env, `${BASE}/ipo-current-issue`, LIVE_TTL, (b) => (JSON.parse(b) as any[]).filter((r) => r.symbol).map(toCurrent));
      const up = await nseFetch(env, `${BASE}/all-upcoming-issues?category=ipo`, 600, (b) => (JSON.parse(b) as any[]).filter((r) => r.symbol).map(toCurrent)).catch(() => null);
      const today = todayIST();
      const holidays = await tradingHolidays(env);
      const gmpList = await premiums(env, cur.data.filter((c) => !c.bse_only).map((c) => c.symbol));

      const open = await Promise.all(cur.data.map(async (c) => {
        const d = await detail(env, c);
        const info = d ? parseIssueInfo(d.info) : null;
        const band = info?.band.high ? info.band : { low: c.low, high: c.high };
        const lot = info?.lot ?? c.lot;
        const categories = d ? parseCategories(d.cats, band.high) : [];
        const by = Object.fromEntries(categories.map((x) => [x.key, x]));
        return {
          symbol: c.symbol, name: c.name, series: c.series, sme: c.series === "SME", status: c.status === "Active" ? "open" : "closed",
          start: c.start, end: c.end, days_left: c.end && c.status === "Active" ? Math.max(0, Math.round((Date.parse(c.end) - Date.parse(today)) / 86400000)) : null,
          price_low: band.low, price_high: band.high, costs: costs(lot, band.high),
          subscription: categories, times_total: by.total?.times ?? null, demand_cr: by.total?.demand_cr ?? null,
          retail_odds: retailOdds(by.retail?.offered ?? null, by.retail?.bid ?? null, lot),
          dates: c.series === "SME" ? anchorDates(c.end, holidays) && { allotment_est: anchorDates(c.end, holidays)!.allotment_est } : anchorDates(c.end, holidays),
          rhp_url: info?.rhp ?? null, anchor_report_url: info?.anchor_report ?? null, registrar: info?.registrar ?? null,
          data_as_of: d?.updated ?? null, ...premiumFields(gmpList.premiums.get(c.symbol.toUpperCase()), band.high, lot),
        };
      }));
      const openSyms = new Set(cur.data.map((c) => c.symbol));
      const upcoming = (up?.data ?? []).filter((c) => !openSyms.has(c.symbol) && c.status !== "Closed").map((c) => ({
        symbol: c.symbol, name: c.name, series: c.series, sme: c.series === "SME", start: c.start, end: c.end, price_low: c.low, price_high: c.high, costs: costs(c.lot, c.high),
      }));
      return { as_of: cur.fetched_at, open, upcoming, gmp: { connected: !!env.IPOALERTS_API_KEY, error: gmpList.error, fetched_at: gmpList.fetched_at } };
    },
  },
  {
    name: "get_ipo_detail",
    route: "/market/ipo-detail",
    title: "One IPO in full",
    description: "Everything about one IPO on NSE: price band, lot, cost of one lot, timetable (open, close, allotment, refund, demat credit, listing under T+3), subscription and bids by category (QIB, NII, bNII, sNII, retail) in times, shares and ₹ crore, the day-wise grey-market premium with estimated listing price and gain per lot, how the issue is reserved between investor types and the smallest and largest bid for each, the anchor portion and lock-in dates, issue facts (face value, registrar, lead managers), the company's about, strengths and risks, and offer documents. Includes a markdown rendering.",
    inputSchema: { type: "object", properties: { symbol: { type: "string", description: "NSE symbol of the issue, e.g. BLSPOLY" } }, required: ["symbol"] },
    metered: true,
    handler: async (_db, { symbol }, env) => {
      const sym = String(symbol ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9&-]{1,20}$/.test(sym)) throw new ToolError("E_BAD_INPUT", "Give the NSE symbol of an IPO, e.g. BLSPOLY.", 400);
      const cur = await nseFetch(env, `${BASE}/ipo-current-issue`, LIVE_TTL, (b) => (JSON.parse(b) as any[]).filter((r) => r.symbol).map(toCurrent));
      const up = await nseFetch(env, `${BASE}/all-upcoming-issues?category=ipo`, 600, (b) => (JSON.parse(b) as any[]).filter((r) => r.symbol).map(toCurrent)).catch(() => null);
      const listed = [...cur.data, ...(up?.data ?? [])].find((c) => c.symbol.toUpperCase() === sym);
      const tries = listed ? [listed.series] : ["EQ", "SME"];
      let d: Awaited<ReturnType<typeof detail>> = null, series = tries[0];
      for (const sr of tries) { d = await detail(env, { symbol: sym, series: sr, status: listed?.status ?? "Closed" }); series = sr; if (d?.cats.length) break; }
      if (!d?.cats.length && !listed) throw new ToolError("E_NOT_FOUND", `NSE has no IPO with the symbol ${sym}.`, 404);

      const info = parseIssueInfo(d?.info);
      const get = (t: string) => (d?.info as any[] | undefined)?.find((x) => x.title?.toLowerCase() === t.toLowerCase())?.value ?? null;
      const period = /(\d{1,2}-[A-Za-z]{3}-\d{4})\s*to\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/.exec(get("Issue Period") ?? "");
      const c = listed ?? { symbol: sym, name: String(get("Symbol") ?? sym), series, status: "Closed", start: isoDate(period?.[1]), end: isoDate(period?.[2]), low: info.band.low, high: info.band.high, lot: null, bse_only: false };
      const band = info.band.high ? info.band : { low: c.low, high: c.high };
      const lot = info.lot ?? c.lot;
      const holidays = await tradingHolidays(env);
      const today = todayIST();
      const [alerts, latest] = await Promise.all([
        alertsDetail(env, sym),
        premiums(env, cur.data.filter((x) => !x.bse_only).map((x) => x.symbol)),
      ]);
      const cats = d ? parseCategories(d.cats, band.high) : [];
      const by = Object.fromEntries(cats.map((x) => [x.key, x]));
      const text = parseIssueText(get("Issue Size"));
      const after = anchorDates(c.end, holidays);
      const dates = { open: c.start, close: c.end, allotment: after?.allotment_est ?? null, refund: after?.refund_est ?? null, demat: after?.demat_est ?? null, listing: alerts.detail.ipo?.listing_date ?? after?.listing_est ?? null };
      const alertsCr = /([\d.]+)\s*cr/i.exec(alerts.detail.ipo?.issue_size ?? "")?.[1];
      const sizeCr = alertsCr ? Number(alertsCr) : text.fresh_cr != null || text.ofs_cr != null ? Math.round(((text.fresh_cr ?? 0) + (text.ofs_cr ?? 0)) * 100) / 100 : by.total?.offered && band.high ? Math.round((by.total.offered * band.high) / 1e5) / 100 : null;
      const sizeFrom = alertsCr ? "ipoalerts" : text.fresh_cr != null || text.ofs_cr != null ? "nse" : "estimate";
      const c0 = costs(lot, band.high);
      const reserve = reservation(cats, text.anchor_shares);
      const premium = latest.premiums.get(sym) ?? null;
      const days = gmpRows(alerts.detail.series, band.high, lot);
      const range = days.length ? [Math.min(...days.map((x) => x.gmp)), Math.max(...days.map((x) => x.gmp))] : null;
      const status = c.status === "Active" ? "open" : c.status === "Forthcoming" ? "upcoming" : "closed";
      const anchor = text.anchor_shares && band.high ? {
        shares: text.anchor_shares, amount_cr: Math.round((text.anchor_shares * band.high) / 1e5) / 100, pct_of_total: reserve.total ? Math.round((text.anchor_shares / reserve.total) * 10000) / 100 : null,
        lockin_50pct: after?.lockin_50pct ?? null, lockin_rest: after?.lockin_rest ?? null, report_url: info.anchor_report,
      } : null;
      const a = alerts.detail.ipo;
      const out = {
        symbol: sym, name: c.name, series: c.series, sme: c.series === "SME", status, logo: a?.logo ?? null,
        issue_type: get("Issue Type"), board: c.series === "SME" ? "SME" : "Mainboard",
        price_low: band.low, price_high: band.high, issue_size_cr: sizeCr, issue_size_from: sizeFrom, costs: c0, cut_off_cost: c0?.lot_cost ?? null,
        dates, timeline: timelineSteps(dates, today), days_left: c.end && status === "open" ? Math.max(0, Math.round((Date.parse(c.end) - Date.parse(today)) / 86400000)) : null,
        subscription: bidRows(cats), times_total: by.total?.times ?? null, retail_odds: retailOdds(by.retail?.offered ?? null, by.retail?.bid ?? null, lot), data_as_of: d?.updated ?? null,
        gmp: premium ? { latest: premium.gmp, pct: band.high ? Math.round((premium.gmp / band.high) * 10000) / 100 : null, updated: premium.updated, est_listing: band.high ? Math.round((band.high + premium.gmp) * 100) / 100 : null,
          profit_per_lot: profitPerLot(premium.gmp, lot), change_24h: premium.change_24h, range, days } : { latest: null, range, days, pct: null, updated: null, est_listing: null, profit_per_lot: null, change_24h: null },
        gmp_connected: !!env.IPOALERTS_API_KEY, gmp_error: alerts.error ?? latest.error,
        reservation: reserve, application: c0 && { retail_min_lots: 1, retail_max_lots: c0.retail_max_lots, snii_min_lots: c0.snii_min_lots, snii_max_lots: c0.snii_max_lots, bnii_min_lots: c0.bnii_min_lots, lot_cost: c0.lot_cost, lot_size: c0.lot_size },
        anchor,
        facts: { face_value: get("Face Value"), tick_size: get("Tick Size"), bid_lot: get("Bid Lot"), registrar: info.registrar, lead_managers: get("Book Running Lead Managers"), sponsor_bank: get("Sponsor Bank"),
          fresh_issue_cr: text.fresh_cr, offer_for_sale_cr: text.ofs_cr, max_retail_amount: get("Maximum Subscription Amount for Retail Investor"), type_of_issue: a?.type_of_issue ?? null },
        about: a?.about ?? null, strengths: a?.strengths ?? [], risks: a?.risks ?? [],
        documents: [
          info.rhp && { label: "Red Herring Prospectus (NSE)", url: info.rhp },
          a?.prospectus_url && { label: "Prospectus (SEBI)", url: a.prospectus_url },
          info.anchor_report && { label: "Anchor allocation (NSE)", url: info.anchor_report },
          a?.nse_url && { label: "NSE issue page", url: a.nse_url }, a?.bse_url && { label: "BSE issue page", url: a.bse_url },
        ].filter(Boolean),
      };
      return { ...out, markdown: ipoMarkdown(out) };
    },
  },
];
