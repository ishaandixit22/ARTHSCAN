// The IPO pages. NSE's live feed gives subscription by investor category for issues on NSE, which
// is the freshest figure available, and what a lot and each investor bracket costs. IPO Guru gives
// the calendar across both exchanges, the grey-market premium, BSE-only issues and, on paid plans,
// the company itself: financials, promoters, documents and the anchor book. ipoalerts remains a
// fallback for company text and a premium while the IPO Guru plan does not cover them.

import { anchorDates, costs, isoDate, parseCategories, parseIssueInfo, priceBand, profitPerLot, retailOdds } from "../lib/ipo.js";
import { bidRows, gmpRows, ipoMarkdown, parseIssueText, reservation, timelineSteps } from "../lib/ipo-detail.js";
import { detail as alertsDetail, premiums } from "../lib/ipoalerts.js";
import { calendar, categoryDays, issue, nameKey, parseGmp, parseSummary, readings, sameCompany, toNum, type CalendarRow } from "../lib/ipoguru.js";
import { tradingHolidays } from "../lib/market-hours.js";
import { expectedFilings } from "../lib/sebi.js";
import type { Env } from "../env.js";
import { ToolError } from "./errors.js";
import { nseFetch, todayIST } from "../lib/nse.js";
import type { Tool } from "./tools.js";

const BASE = "https://www.nseindia.com/api";
const LIVE_TTL = 120;

type Current = { symbol: string; name: string; series: string; status: string; start: string | null; end: string | null; low: number | null; high: number | null; lot: number | null; bse_only: boolean; times?: number | null };
const toCurrent = (r: any): Current => {
  const band = priceBand(r.issuePrice ?? r.priceBand);
  return {
    symbol: String(r.symbol), name: r.companyName, series: r.series ?? "EQ", status: r.status ?? "", start: isoDate(r.issueStartDate), end: isoDate(r.issueEndDate),
    low: band.low, high: band.high, lot: Number(r.lotSize) || null, bse_only: r.isBse === "1", times: toNum(r.noOfTime),
  };
};

/** NSE's list of issues open or awaiting listing. */
export const currentIssues = async (env: any) => (await nseFetch(env, `${BASE}/ipo-current-issue`, LIVE_TTL, (b) => (JSON.parse(b) as any[]).filter((r) => r.symbol).map(toCurrent))).data;

export async function detail(env: any, c: Pick<Current, "symbol" | "series" | "status">) {
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

async function loadBoard(env: any) {
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
}

const dates0 = (t: any, g: CalendarRow | null, c: Current): string | null => t?.open_date ?? g?.open ?? c.start;

export type Stage = "expected" | "upcoming" | "open" | "closing" | "closed" | "allotted" | "listed";
/** Where an issue stands, worked out from its dates in India time. */
export function stageOf(r: Pick<CalendarRow, "pre_rhp" | "listed" | "open" | "close" | "allotment" | "listing">, today: string): Stage {
  if (r.pre_rhp && !r.open) return "expected";
  if (r.listed || (r.listing && r.listing <= today)) return "listed";
  if (!r.open || today < r.open) return "upcoming";
  if (r.close && today < r.close) return "open";
  if (r.close === today) return "closing";
  return r.allotment && r.allotment <= today ? "allotted" : "closed";
}

/** NSE's stamp "Updated as on 02-Nov-2026 17:56:00" as an ISO time in India's offset. */
export function nseStamp(v: string | null | undefined): string | null {
  const m = /(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\d{2}:\d{2}:\d{2})/.exec(v ?? "");
  const d = m ? isoDate(m[1]) : null;
  return d ? `${d}T${m![2]}+05:30` : null;
}

/** The provider writes 0 for an issue it has no figure for, which is false once a day of bidding has passed: it is unknown. */
export const creditedTimes = (times: number | null, open: string | null, today: string) => (times === 0 && open && open < today ? null : times);
/** Bids only grow while an issue is open, so the higher figure is the newer one. A lower NSE figure is a stored copy that went stale. */
export const useExchange = (nse: number | null | undefined, provider: number | null | undefined) => nse != null && nse > 0 && nse >= (provider ?? 0);

async function loadDashboard(env: Env) {
  const [board, cal, sebi] = await Promise.all([loadBoard(env).catch(() => null), calendar(env), expectedFilings(env).catch(() => ({ filings: [], fetched_at: null, error: "SEBI's filing list could not be read" }))]);
  const today = todayIST();
  const nse = [...(board?.open ?? [])];
  const upcomingNse = board?.upcoming ?? [];
  const ranges = await env.DB.prepare("SELECT slug, MIN(gmp) AS low, MAX(gmp) AS high, COUNT(gmp) AS n FROM ipo_readings GROUP BY slug").all<{ slug: string; low: number | null; high: number | null; n: number }>();
  const rangeBy = new Map((ranges.results ?? []).map((r) => [r.slug, r]));
  // The latest split by investor category from our own record, for issues NSE has no table for (BSE-only, or NSE's stored copy gone stale).
  const cats = await env.DB.prepare("SELECT r.slug, r.qib, r.nii, r.snii, r.bnii, r.retail FROM ipo_category_readings r JOIN (SELECT slug, MAX(at) AS at FROM ipo_category_readings WHERE qib IS NOT NULL OR nii IS NOT NULL OR retail IS NOT NULL GROUP BY slug) l ON r.slug = l.slug AND r.at = l.at").all<{ slug: string; qib: number | null; nii: number | null; snii: number | null; bnii: number | null; retail: number | null }>();
  const catBy = new Map((cats.results ?? []).map((r) => [r.slug, r]));

  const rows = cal.rows.map((r) => {
    const n: any = nse.find((x) => sameCompany(x.name, r.name)) ?? null;
    const up: any = n ? null : upcomingNse.find((x) => sameCompany(x.name, r.name)) ?? null;
    const by: Record<string, any> = Object.fromEntries((n?.subscription ?? []).map((c: any) => [c.key, c]));
    const high = r.price_high ?? n?.price_high ?? up?.price_high ?? null;
    const lot = r.lot ?? n?.costs?.lot_size ?? up?.costs?.lot_size ?? null;
    const provider = creditedTimes(r.times_total, r.open, today);
    const fromNse = useExchange(by.total?.times, provider);
    const fallback = (n?.gmp ?? null) as number | null;
    const gmp = r.gmp.price ?? fallback;
    const range = rangeBy.get(r.slug);
    const cat = catBy.get(r.slug);
    return {
      slug: r.slug, symbol: n?.symbol ?? up?.symbol ?? null, name: r.name, board: r.board, exchange: r.exchange, stage: stageOf(r, today), logo: r.logo,
      open: r.open, close: r.close, allotment: r.allotment, listing: r.listing, price_low: r.price_low ?? n?.price_low ?? null, price_high: high, size_cr: r.size_cr, lot, costs: costs(lot, high),
      gmp, gmp_pct: r.gmp.price != null ? r.gmp.pct ?? (high ? Math.round((gmp! / high) * 10000) / 100 : null) : n?.gmp_pct ?? null,
      est_listing: gmp != null && high ? Math.round((high + gmp) * 100) / 100 : null, profit_per_lot: profitPerLot(gmp, lot), gmp_updated: r.gmp.price != null ? r.gmp.updated : n?.gmp_updated ?? null,
      gmp_low: range && range.n > 1 ? range.low : null, gmp_high: range && range.n > 1 ? range.high : null, sauda: r.gmp.sauda, kostak: r.gmp.kostak,
      times_total: fromNse ? by.total.times : provider, qib: (fromNse ? by.qib?.times : null) ?? cat?.qib ?? null, nii: (fromNse ? by.nii?.times : null) ?? cat?.nii ?? null, snii: (fromNse ? by.snii?.times : null) ?? cat?.snii ?? null, bnii: (fromNse ? by.bnii?.times : null) ?? cat?.bnii ?? null, retail: (fromNse ? by.retail?.times : null) ?? cat?.retail ?? null,
      demand_cr: fromNse ? n?.demand_cr ?? null : null, retail_odds: fromNse ? n?.retail_odds ?? null : null, sub_from: fromNse ? "nse" : provider != null ? "ipoguru" : null, sub_as_of: fromNse ? nseStamp(n?.data_as_of) : null,
      listing_price: r.listing_price, listing_gain: r.listing_gain, cmp: r.cmp, current_gain: r.current_gain,
    };
  });
  // NSE issues the calendar does not carry, or everything NSE has when the calendar is unavailable.
  const known = (name: string) => cal.rows.some((r) => sameCompany(name, r.name));
  const nseOnly = [...nse, ...upcomingNse].filter((x: any) => !known(x.name)).map((x: any) => {
    const by: Record<string, any> = Object.fromEntries((x.subscription ?? []).map((c: any) => [c.key, c]));
    const stage = stageOf({ pre_rhp: false, listed: false, open: x.start, close: x.end, allotment: x.dates?.allotment_est ?? null, listing: null }, today);
    return {
      slug: x.symbol, symbol: x.symbol, name: x.name, board: x.sme ? "SME" : "Mainboard", exchange: x.sme ? "NSE SME" : "NSE", stage, logo: null, open: x.start, close: x.end, allotment: x.dates?.allotment_est ?? null, listing: x.dates?.listing_est ?? null,
      price_low: x.price_low, price_high: x.price_high, size_cr: null, lot: x.costs?.lot_size ?? null, costs: x.costs, gmp: x.gmp ?? null, gmp_pct: x.gmp_pct ?? null, est_listing: x.est_listing ?? null, profit_per_lot: x.profit_per_lot ?? null, gmp_updated: x.gmp_updated ?? null, gmp_low: null, gmp_high: null, sauda: null, kostak: null,
      times_total: by.total?.times ?? null, qib: by.qib?.times ?? null, nii: by.nii?.times ?? null, snii: by.snii?.times ?? null, bnii: by.bnii?.times ?? null, retail: by.retail?.times ?? null,
      demand_cr: x.demand_cr ?? null, retail_odds: x.retail_odds ?? null, sub_from: by.total ? "nse" : null, sub_as_of: nseStamp(x.data_as_of), listing_price: null, listing_gain: null, cmp: null, current_gain: null,
    };
  });
  // Companies with a draft on file at SEBI that neither the calendar nor NSE carries. SEBI gives the name, the date and the filing, so everything else stays empty.
  const filed = sebi.filings.filter((f) => !known(f.name) && ![...nse, ...upcomingNse].some((x: any) => sameCompany(f.name, x.name))).map((f) => ({
    slug: `sebi-${nameKey(f.name)}`, symbol: null, name: f.name, board: "Mainboard", exchange: null, stage: "expected" as Stage, logo: null, open: null, close: null, allotment: null, listing: null,
    price_low: null, price_high: null, size_cr: null, lot: null, costs: null, gmp: null, gmp_pct: null, est_listing: null, profit_per_lot: null, gmp_updated: null, gmp_low: null, gmp_high: null, sauda: null, kostak: null,
    times_total: null, qib: null, nii: null, snii: null, bnii: null, retail: null, demand_cr: null, retail_odds: null, sub_from: null, sub_as_of: null, listing_price: null, listing_gain: null, cmp: null, current_gain: null,
    filing: { doc: f.doc, filed: f.filed, url: f.url },
  }));
  const all = [...rows, ...nseOnly, ...filed];
  const live =(s: string) => all.filter((r) => r.stage === s);
  const summary = (l: typeof all) => ({ count: l.length, size_cr: Math.round(l.reduce((a, r) => a + (r.size_cr ?? 0), 0)) });
  return {
    as_of: board?.as_of ?? cal.fetched_at, rows: all,
    counts: { open: summary([...live("open"), ...live("closing")]), closing: summary(live("closing")), upcoming: summary(live("upcoming")), expected: summary(live("expected")), closed: summary([...live("closed"), ...live("allotted")]), listed: summary(live("listed")) },
    sources: { ipoguru: { connected: cal.connected, plan: cal.plan, fetched_at: cal.fetched_at, error: cal.error }, nse: { connected: !!board, as_of: board?.as_of ?? null }, sebi: { fetched_at: sebi.fetched_at, error: sebi.error } },
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
    handler: async (_db, _args, env) => loadBoard(env),
  },
  {
    name: "get_ipo_dashboard",
    route: "/market/ipo-dashboard",
    title: "IPO dashboard",
    description: "Every mainboard and SME IPO from the last three months on NSE and BSE, one row each: stage (expected, upcoming, open, closing, closed, allotted, listed), dates, price band, lot, issue size, grey-market premium with its percentage, implied listing price, profit per lot and when it was read, subscription overall and by QIB, NII, sNII, bNII and retail where the exchange publishes it, and listing and current performance. Rows at the expected stage may come from draft offer documents filed with SEBI: those carry `filing` (document, date filed, link to SEBI's page) and no dates or prices, and a filing does not mean an issue will follow. Includes counts per stage and the freshness of each source. Grey-market premium is unofficial and is not a forecast.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (_db, _args, env) => loadDashboard(env),
  },
  {
    name: "get_ipo_detail",
    route: "/market/ipo-detail",
    title: "One IPO in full",
    description: "Everything about one IPO, by NSE symbol or IPO Guru slug: price band, lot, cost of one lot, timetable (open, close, allotment, refund, demat credit, listing), subscription and bids by category (QIB, NII, bNII, sNII, retail) in times, shares and ₹ crore, the day-wise grey-market premium with estimated listing price and gain per lot, how the issue is reserved between investor types and the smallest and largest bid for each, the anchor portion and lock-in dates, issue facts (face value, registrar, lead managers), the company's about, strengths, risks, objects of the issue, financials, KPIs and promoters, and offer documents. Company sections depend on the data plan; `locked` names any that are withheld. Includes a markdown rendering.",
    inputSchema: { type: "object", properties: { symbol: { type: "string", description: "NSE symbol of the issue, e.g. BLSPOLY, or an IPO Guru slug, e.g. bls-polymers-ipo" } }, required: ["symbol"] },
    metered: true,
    handler: async (_db, { symbol }, env) => {
      const raw = String(symbol ?? "").trim();
      const isSlug = raw.includes("-") && raw === raw.toLowerCase() && /^[a-z0-9-]{1,120}$/.test(raw);
      if (!isSlug && !/^[A-Z0-9&-]{1,20}$/i.test(raw)) throw new ToolError("E_BAD_INPUT", "Give the NSE symbol of an IPO, e.g. BLSPOLY, or its slug.", 400);
      const cal = await calendar(env);
      const cur = await nseFetch(env, `${BASE}/ipo-current-issue`, LIVE_TTL, (b) => (JSON.parse(b) as any[]).filter((r) => r.symbol).map(toCurrent)).catch(() => ({ data: [] as Current[] }));
      const up = await nseFetch(env, `${BASE}/all-upcoming-issues?category=ipo`, 600, (b) => (JSON.parse(b) as any[]).filter((r) => r.symbol).map(toCurrent)).catch(() => null);
      const nseList = [...cur.data, ...(up?.data ?? [])];
      const bySlug = isSlug ? cal.rows.find((r) => r.slug === raw) ?? null : null;
      let listed = isSlug ? (bySlug ? nseList.find((c) => sameCompany(c.name, bySlug.name)) ?? null : null) : nseList.find((c) => c.symbol.toUpperCase() === raw.toUpperCase()) ?? null;
      const guruRow = bySlug ?? (listed ? cal.rows.find((r) => sameCompany(listed!.name, r.name)) ?? null : null);
      const guru = guruRow || isSlug ? await issue(env, guruRow?.slug ?? raw) : null;
      const doc = guru?.doc ?? null;
      const nseSym = /^([A-Z0-9&-]+)\.NS$/.exec(doc?.issue?.nse_symbol ?? "")?.[1] ?? null;
      const sym = listed?.symbol.toUpperCase() ?? (isSlug ? nseSym : raw.toUpperCase());
      if (isSlug && !guruRow && !doc) throw new ToolError("E_NOT_FOUND", `There is no IPO with the slug ${raw}.`, 404);

      const tries = listed ? [listed.series] : guruRow?.board === "SME" ? ["SME", "EQ"] : ["EQ", "SME"];
      let d: Awaited<ReturnType<typeof detail>> = null, series = tries[0];
      if (sym) for (const sr of tries) { d = await detail(env, { symbol: sym, series: sr, status: listed?.status ?? "Closed" }); series = sr; if (d?.cats.length) break; }
      if (!d?.cats.length && !listed && !guruRow && !doc) throw new ToolError("E_NOT_FOUND", `NSE has no IPO with the symbol ${raw.toUpperCase()}.`, 404);

      const info = parseIssueInfo(d?.info);
      const get = (t: string) => (d?.info as any[] | undefined)?.find((x) => x.title?.toLowerCase() === t.toLowerCase())?.value ?? null;
      const period = /(\d{1,2}-[A-Za-z]{3}-\d{4})\s*to\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/.exec(get("Issue Period") ?? "");
      const t = doc?.timeline ?? null, iss = doc?.issue ?? null;
      const c: Current = listed ?? { symbol: sym ?? raw, name: guruRow?.name ?? String(get("Symbol") ?? sym), series, status: "Closed", start: guruRow?.open ?? isoDate(period?.[1]), end: guruRow?.close ?? isoDate(period?.[2]), low: info.band.low ?? guruRow?.price_low ?? null, high: info.band.high ?? guruRow?.price_high ?? null, lot: guruRow?.lot ?? null, bse_only: false };
      const band = info.band.high ? info.band : { low: c.low ?? toNum(iss?.price_min), high: c.high ?? toNum(iss?.price_max) };
      const lot = info.lot ?? c.lot ?? guruRow?.lot ?? toNum(iss?.lot_size);
      const holidays = await tradingHolidays(env);
      const today = todayIST();
      const hasCompany = !!doc?.company;
      const [alerts, latest] = await Promise.all([
        !hasCompany && sym ? alertsDetail(env, sym) : Promise.resolve({ detail: { ipo: null, series: [] }, error: null }),
        premiums(env, cur.data.filter((x) => !x.bse_only).map((x) => x.symbol)),
      ]);
      const allCats = d ? parseCategories(d.cats, band.high) : [];
      const nseTotal = allCats.find((x) => x.key === "total")?.times;
      const summary = parseSummary(doc?.subscription_summary);
      const providerTimes = creditedTimes(summary?.total ?? guruRow?.times_total ?? null, dates0(t, guruRow, c), today);
      // Without a provider figure the exchange's table stands as it is, even at zero bids.
      const cats = providerTimes == null || useExchange(nseTotal, providerTimes) ? allCats : [];
      const by = Object.fromEntries(cats.map((x) => [x.key, x]));
      const text = parseIssueText(get("Issue Size"));
      const after = anchorDates(c.end, holidays);
      const a = alerts.detail.ipo;
      const dates = { open: t?.open_date ?? guruRow?.open ?? c.start, close: t?.close_date ?? guruRow?.close ?? c.end, allotment: t?.allotment_date ?? guruRow?.allotment ?? after?.allotment_est ?? null, refund: t?.refund_date ?? after?.refund_est ?? null, demat: t?.credit_to_demat_date ?? after?.demat_est ?? null, listing: t?.listing_date ?? guruRow?.listing ?? a?.listing_date ?? after?.listing_est ?? null };
      const alertsCr = /([\d.]+)\s*cr/i.exec(a?.issue_size ?? "")?.[1];
      const guruCr = toNum(iss?.issue_size) ?? guruRow?.size_cr ?? null;
      const sizeCr = guruCr ?? (alertsCr ? Number(alertsCr) : text.fresh_cr != null || text.ofs_cr != null ? Math.round(((text.fresh_cr ?? 0) + (text.ofs_cr ?? 0)) * 100) / 100 : by.total?.offered && band.high ? Math.round((by.total.offered * band.high) / 1e5) / 100 : null);
      const sizeFrom = guruCr != null ? "ipoguru" : alertsCr ? "ipoalerts" : text.fresh_cr != null || text.ofs_cr != null ? "nse" : "estimate";
      const c0 = costs(lot, band.high);
      const reserve = reservation(allCats, text.anchor_shares);

      // Premium: IPO Guru's reading first, then ipoalerts. Day rows from IPO Guru's history when the plan has it.
      const g = doc?.gmp ? parseGmp(doc.gmp) : guruRow?.gmp ?? null;
      const premium = latest.premiums.get(String(sym ?? "").toUpperCase()) ?? null;
      const trend: any[] = guru?.gmp_history?.trend ?? [];
      const guruDays = trend.filter((p) => p.price_value != null).map((p) => ({ timestamp: `${p.date}T00:00:00.000Z`, price: p.price_value as number }));
      const days = gmpRows(guruDays.length ? guruDays : alerts.detail.series, band.high, lot).map((row) => (guruDays.length ? { ...row, sauda: toNum(trend.find((p) => p.date === row.date)?.subject_to_sauda) } : row));
      const range = days.length ? [Math.min(...days.map((x) => x.gmp)), Math.max(...days.map((x) => x.gmp))] : null;
      const latestGmp = g?.price ?? premium?.gmp ?? null;

      const today0 = stageOf({ pre_rhp: !!guruRow?.pre_rhp, listed: !!guruRow?.listed, open: dates.open, close: dates.close, allotment: dates.allotment, listing: dates.listing }, today);
      const status = listed ? (c.status === "Active" ? "open" : c.status === "Forthcoming" ? "upcoming" : "closed") : today0 === "open" || today0 === "closing" ? "open" : today0 === "upcoming" || today0 === "expected" ? "upcoming" : "closed";
      const anchor = text.anchor_shares && band.high ? {
        shares: text.anchor_shares, amount_cr: Math.round((text.anchor_shares * band.high) / 1e5) / 100, pct_of_total: reserve.total ? Math.round((text.anchor_shares / reserve.total) * 10000) / 100 : null,
        lockin_50pct: after?.lockin_50pct ?? null, lockin_rest: after?.lockin_rest ?? null, report_url: info.anchor_report,
      } : null;
      const co = doc?.company ?? null;
      const liveSub: any = guru?.subscription ?? null;
      const docs = doc?.documents ?? {};
      const documents = [
        info.rhp && { label: "Red Herring Prospectus (NSE)", url: info.rhp },
        docs.rhp && { label: "Red Herring Prospectus", url: docs.rhp }, docs.drhp && { label: "Draft prospectus (DRHP)", url: docs.drhp },
        a?.prospectus_url && { label: "Prospectus (SEBI)", url: a.prospectus_url },
        (info.anchor_report || docs.anchor) && { label: "Anchor allocation", url: info.anchor_report ?? docs.anchor },
        docs.basis_of_allotment && { label: "Basis of allotment", url: docs.basis_of_allotment },
        a?.nse_url && { label: "NSE issue page", url: a.nse_url }, a?.bse_url && { label: "BSE issue page", url: a.bse_url },
      ].filter(Boolean);
      // When NSE has no table for the issue (BSE-only), the provider's category totals stand in; they carry times only.
      const guruRows = !cats.length ? (liveSub?.categories ?? []).map((x: any) => ({ key: String(x.key).toLowerCase(), label: x.label, within: null, offered: toNum(x.shares_offered), bid: toNum(x.shares_applied), bid_cr: x.demand_crore ?? null, times: x.times_value ?? toNum(x.times), applications: toNum(x.applications) }))
        : [];
      const summaryRows = !cats.length && !guruRows.length && summary ? ([["qib", "QIB", summary.qib], ["nii", "NII", summary.nii], ["retail", "Retail", summary.retail], ["total", "Total", summary.total]] as const).filter(([, , v]) => v != null).map(([key, label, times]) => ({ key, label, within: null, offered: null, bid: null, bid_cr: null, times })) : [];
      const subscription = cats.length ? bidRows(cats) : guruRows.length ? guruRows : summaryRows;
      const timesTotal = by.total?.times ?? (subscription.find((r: any) => r.key === "total")?.times ?? providerTimes);
      const retailTimes = by.retail ? retailOdds(by.retail.offered ?? null, by.retail.bid ?? null, lot) : null;
      // The provider's day-wise table where the plan includes it (Pro), otherwise the record kept by jobs/ipo-readings.ts.
      const providerDays: any[] = guru?.subscription_history?.day_wise ?? [];
      const recordSlug = guruRow?.slug ?? (isSlug ? raw : sym);
      const subDays = providerDays.length || !recordSlug ? providerDays : await categoryDays(env, recordSlug, dates.open, dates.close, holidays);

      const out = {
        symbol: sym ?? raw, slug: guruRow?.slug ?? (isSlug ? raw : null), name: doc?.display_name ?? guruRow?.name ?? c.name, series: c.series, sme: guruRow ? guruRow.board === "SME" : c.series === "SME", status, stage: today0,
        logo: doc?.images?.logo ?? guruRow?.logo ?? a?.logo ?? null, feature_image: doc?.images?.feature ?? null,
        issue_type: get("Issue Type") ?? iss?.sale_type ?? null, board: (guruRow ? guruRow.board === "SME" : c.series === "SME") ? "SME" : "Mainboard", exchange: iss?.listing_on ?? guruRow?.exchange ?? null,
        price_low: band.low, price_high: band.high, issue_size_cr: sizeCr, issue_size_from: sizeFrom, costs: c0, cut_off_cost: c0?.lot_cost ?? null,
        dates, timeline: timelineSteps(dates, today), days_left: dates.close && status === "open" ? Math.max(0, Math.round((Date.parse(dates.close) - Date.parse(today)) / 86400000)) : null,
        subscription, times_total: timesTotal, retail_odds: retailTimes, data_as_of: d?.updated ?? null, sub_from: cats.length ? "nse" : subscription.length ? "ipoguru" : null, sub_updated: cats.length ? nseStamp(d?.updated) : summary?.updated ?? null,
        applications: summary?.applications ?? null, sub_days: subDays, sub_days_from: providerDays.length ? "ipoguru" : subDays.length ? "own" : null, qib_interest_cost: liveSub?.qib_interest_cost ?? null,
        gmp: latestGmp != null ? { latest: latestGmp, pct: band.high ? Math.round((latestGmp / band.high) * 10000) / 100 : null, updated: g?.updated ?? premium?.updated ?? null, est_listing: band.high ? Math.round((band.high + latestGmp) * 100) / 100 : null,
          profit_per_lot: profitPerLot(latestGmp, lot), change_24h: premium?.change_24h ?? null, range, days, sauda: g?.sauda ?? null, kostak: g?.kostak ?? null } : { latest: null, range, days, pct: null, updated: null, est_listing: null, profit_per_lot: null, change_24h: null, sauda: null, kostak: null },
        gmp_readings: guruRow || isSlug ? await readings(env, guruRow?.slug ?? raw) : [], gmp_intraday: guru?.gmp_history?.timeline ?? [],
        gmp_connected: !!(env.IPOGURU_API_KEY || env.IPOALERTS_API_KEY), gmp_error: guru?.error ?? alerts.error ?? latest.error,
        listing: doc?.listing ? { price: toNum(doc.listing.listing_price), gain: toNum(doc.listing.listing_gain_percent), cmp: toNum(doc.listing.cmp), current_gain: toNum(doc.listing.current_gain_percent), cmp_at: doc.listing.cmp_updated_at ?? null } : guruRow?.listed ? { price: guruRow.listing_price, gain: guruRow.listing_gain, cmp: guruRow.cmp, current_gain: guruRow.current_gain, cmp_at: null } : null,
        reservation: reserve, reservation_guru: doc?.reservation ?? [], shares_offered: doc?.shares_offered ?? null,
        application: c0 && { retail_min_lots: 1, retail_max_lots: c0.retail_max_lots, snii_min_lots: c0.snii_min_lots, snii_max_lots: c0.snii_max_lots, bnii_min_lots: c0.bnii_min_lots, lot_cost: c0.lot_cost, lot_size: c0.lot_size }, lot_calculator: doc?.lot_calculator ?? [],
        anchor, anchors: guru?.anchors ?? null,
        facts: { face_value: get("Face Value") ?? (iss?.face_value ? `₹${iss.face_value}` : null), tick_size: get("Tick Size"), bid_lot: get("Bid Lot"), registrar: info.registrar ?? doc?.contacts?.registrar?.name ?? null, lead_managers: get("Book Running Lead Managers") ?? ((doc?.contacts?.lead_managers ?? []).map?.((x: any) => x?.name ?? x).join(", ") || null), sponsor_bank: get("Sponsor Bank"),
          fresh_issue_cr: text.fresh_cr, offer_for_sale_cr: text.ofs_cr, max_retail_amount: get("Maximum Subscription Amount for Retail Investor"), type_of_issue: a?.type_of_issue ?? iss?.sale_type ?? null, listing_at: iss?.listing_on ?? null, employee_discount: iss?.employee_discount ?? null },
        about: co?.about ?? co?.description ?? a?.about ?? null, strengths: co?.strengths ?? a?.strengths ?? [], risks: co?.risks ?? a?.risks ?? [],
        company: co ? { objects: co.objects_of_issue ?? null, financials: co.financials ?? null, kpis: co.kpis ?? [], promoters: co.promoters?.length ? co.promoters : co.promoter_profiles?.length ? co.promoter_profiles : co.promoters_text ?? null, holding: co.pre_holding || co.post_holding ? { pre: co.pre_holding ?? null, post: co.post_holding ?? null } : null } : null,
        recent: cal.rows.filter((r) => r.listed && r.slug !== (guruRow?.slug ?? raw)).sort((x, y) => (y.listing ?? "").localeCompare(x.listing ?? "")).slice(0, 8).map((r) => ({ slug: r.slug, name: r.name, logo: r.logo, listing_gain: r.listing_gain })),
        contacts: doc?.contacts ?? null, registrar_status_url: doc?.contacts?.registrar?.status_page ?? null,
        documents, plan: guru?.plan ?? null, locked: doc?.locked?.fields ?? [], source_url: doc?.web_url ?? guruRow?.url ?? null,
      };
      return { ...out, markdown: ipoMarkdown(out) };
    },
  },
];
