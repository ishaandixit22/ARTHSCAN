// Company events from NSE: every exchange filing with its PDF (results,
// earnings-call transcripts, investor presentations, press releases, board
// outcomes), the calendar of upcoming board meetings and results, corporate
// actions with their ex-dates, and the day's bulk and block deals.
// All are public NSE data; answers say so and when they were fetched.

import { MACRO_EVENTS } from "../data/macro-events.js";
import { indianApi } from "../lib/indianapi.js";
import { addDaysISO, nseDate, nseFetch, nseQueryDate, todayIST } from "../lib/nse.js";
import { ToolError } from "./errors.js";
import type { Tool } from "./tools.js";

const MIN = 60;
const HOUR = 3600;
const SOURCE = "NSE (nseindia.com)";

const symbolArg = { type: "string", description: "NSE symbol, e.g. TCS, RELIANCE (optional: leave out for the whole market)" };
const sym = (v: unknown) => (v == null || v === "" ? null : String(v).trim().toUpperCase().replace(/[^A-Z0-9&-]/g, "") || null);
const clamp = (v: unknown, def: number, max: number) => {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, Math.floor(n))) : def;
};

// ── Filings ─────────────────────────────────────────────────────────

export type FilingKind = "results" | "transcript" | "concall" | "presentation" | "press" | "board" | "action" | "other";
export const FILING_KINDS: Record<FilingKind, string> = {
  results: "Financial results",
  transcript: "Earnings call transcript",
  concall: "Con call / analyst meet",
  presentation: "Investor presentation",
  press: "Press release",
  board: "Board meeting outcome",
  action: "Dividend, split or bonus",
  other: "Other filing",
};

/** Sorts one NSE announcement into the kinds people look for. */
export function filingKind(desc: string, text: string): FilingKind {
  if (/transcript/i.test(text)) return "transcript";
  if (/financial results?|unaudited|audited results/i.test(text) || /financial result/i.test(desc)) return "results";
  if (/investor presentation/i.test(desc) || /investor presentation/i.test(text)) return "presentation";
  if (/con\. call|analysts?\/institutional/i.test(desc)) return "concall";
  if (/press release/i.test(desc) || /press release/i.test(text)) return "press";
  if (/outcome of board meeting/i.test(desc)) return "board";
  if (/dividend|record date|bonus|split|buyback|rights/i.test(desc)) return "action";
  return "other";
}

type RawAnnouncement = { an_dt: string; symbol: string; sm_name: string; desc: string; attchmntText: string; attchmntFile: string; attFileSize?: string; sm_isin?: string };

function mapAnnouncements(body: string) {
  return (JSON.parse(body) as RawAnnouncement[]).map((a) => ({
    time: nseDate(a.an_dt, true),
    symbol: a.symbol,
    company: a.sm_name,
    category: a.desc,
    kind: filingKind(a.desc ?? "", a.attchmntText ?? ""),
    // "X Limited has informed the Exchange about Transcript" → "Transcript"
    subject: (a.attchmntText ?? "").replace(/^.*?has informed the Exchange (?:about|regarding|that)\s*/i, "").replace(/^'|'$/g, "").trim() || a.desc,
    pdf: a.attchmntFile && a.attchmntFile !== "-" ? a.attchmntFile : null,
    size: a.attFileSize ?? null,
  }));
}

// ── Board meetings and results calendar ─────────────────────────────

type RawEvent = { symbol: string; company: string; purpose: string; bm_desc: string; date: string };

// ── Corporate actions ───────────────────────────────────────────────

type RawAction = { symbol: string; comp: string; subject: string; exDate: string; recDate: string; faceVal: string; series: string };

export function actionType(subject: string): string {
  if (/dividend/i.test(subject)) return "Dividend";
  if (/bonus/i.test(subject)) return "Bonus";
  if (/split|sub-division|subdivision/i.test(subject)) return "Split";
  if (/rights/i.test(subject)) return "Rights";
  if (/buy ?back/i.test(subject)) return "Buyback";
  if (/demerger|scheme of arrangement/i.test(subject)) return "Demerger";
  if (/agm|egm|annual general/i.test(subject)) return "Meeting";
  return "Other";
}

// ── Bulk and block deals ────────────────────────────────────────────

/** Small CSV reader for NSE's deal files (quoted fields allowed). */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field.trim()); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some((f) => f)) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

function mapDeals(body: string) {
  const [, ...rows] = csvRows(body);
  return rows
    .filter((r) => r.length >= 7 && nseDate(r[0]))
    .map((r) => ({
      date: nseDate(r[0]),
      symbol: r[1],
      company: r[2],
      client: r[3],
      side: /^b/i.test(r[4]) ? "Buy" : "Sell",
      quantity: Number(r[5].replace(/,/g, "")) || null,
      price: Number(r[6].replace(/,/g, "")) || null,
    }));
}

// ── Results documents per company ───────────────────────────────────

const DOC_KINDS = ["results", "press", "presentation", "concall", "transcript", "board"] as const;
type Doc = { time: string | null; subject: string; pdf: string | null };

/** Groups filings by company: each company's results PDF, press release, presentation, con calls and transcripts together. */
export function groupDocuments(filings: ReturnType<typeof mapAnnouncements>) {
  const by = new Map<string, { symbol: string; company: string; latest: string; docs: Record<(typeof DOC_KINDS)[number], Doc[]> }>();
  for (const f of filings) {
    if (!(DOC_KINDS as readonly string[]).includes(f.kind)) continue;
    const c = by.get(f.symbol) ?? { symbol: f.symbol, company: f.company, latest: "", docs: { results: [], press: [], presentation: [], concall: [], transcript: [], board: [] } as Record<(typeof DOC_KINDS)[number], Doc[]> };
    c.docs[f.kind as (typeof DOC_KINDS)[number]].push({ time: f.time, subject: f.subject, pdf: f.pdf });
    if ((f.time ?? "") > c.latest) c.latest = f.time ?? "";
    by.set(f.symbol, c);
  }
  return [...by.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}

// ── Market events calendar ──────────────────────────────────────────

type MarketEvent = { date: string; kind: "macro" | "expiry" | "holiday" | "results" | "ipo"; title: string; detail: string; impact: "high" | "medium" | "low"; symbol?: string; source: string; url?: string };

/** NIFTY expiries from NSE; the last one in each month is the monthly contract. */
async function expiryEvents(env: Parameters<Tool["handler"]>[2]): Promise<MarketEvent[]> {
  const r = await nseFetch(env, "https://www.nseindia.com/api/option-chain-contract-info?symbol=NIFTY", 6 * HOUR,
    (body) => ((JSON.parse(body).expiryDates ?? []) as string[]).map((d) => nseDate(d)).filter((d): d is string => !!d));
  const lastOfMonth = new Map<string, string>();
  for (const d of r.data) if (d > (lastOfMonth.get(d.slice(0, 7)) ?? "")) lastOfMonth.set(d.slice(0, 7), d);
  return r.data.map((d) => {
    const monthly = lastOfMonth.get(d.slice(0, 7)) === d;
    return {
      date: d, kind: "expiry" as const, impact: monthly ? ("high" as const) : ("low" as const),
      title: monthly ? "Monthly F&O expiry" : "Nifty weekly expiry",
      detail: monthly ? "Monthly index and stock futures and options expire; expect heavier volumes and position roll-overs." : "Nifty weekly options expire.",
      source: "NSE contract information (NIFTY)", url: "https://www.nseindia.com/option-chain",
    };
  });
}

async function holidayEvents(env: Parameters<Tool["handler"]>[2]): Promise<MarketEvent[]> {
  const r = await nseFetch(env, "https://www.nseindia.com/api/holiday-master?type=trading", 24 * HOUR, (body) =>
    ((JSON.parse(body).CM ?? []) as { tradingDate: string; description: string }[]).map((h) => ({ date: nseDate(h.tradingDate), name: h.description })));
  return r.data.filter((h): h is { date: string; name: string } => !!h.date).map((h) => ({
    date: h.date, kind: "holiday" as const, impact: "medium" as const,
    // NSE marks days with a special session (Diwali Muhurat trading) with an asterisk.
    title: h.name.endsWith("*") ? `${h.name.replace(/\*$/, "").trim()}: market holiday, special session` : `${h.name}: market closed`,
    detail: h.name.endsWith("*") ? "NSE is closed for regular trading; it announces a short special session (Muhurat trading) separately." : "NSE equity and F&O segments are closed.",
    source: "NSE trading holidays", url: "https://www.nseindia.com/resources/exchange-communication-holidays",
  }));
}

/** Results dates of the most traded companies (their numbers move indices and sectors). */
async function bigResultsEvents(env: Parameters<Tool["handler"]>[2], db: Parameters<Tool["handler"]>[0]): Promise<MarketEvent[]> {
  const { results: top } = await db.prepare(`SELECT s.symbol FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
    WHERE COALESCE(s.instrument_type, 'ES') = 'ES' AND m.as_of = (SELECT MAX(as_of) FROM stock_metrics) ORDER BY m.turnover DESC LIMIT 150`).all<{ symbol: string }>();
  const big = new Set(top.map((t) => t.symbol));
  const r = await nseFetch(env, "https://www.nseindia.com/api/event-calendar", HOUR, (body) =>
    (JSON.parse(body) as RawEvent[]).map((e) => ({ date: nseDate(e.date), symbol: e.symbol, company: e.company, purpose: e.purpose })));
  return r.data
    .filter((e): e is typeof e & { date: string } => !!e.date && big.has(e.symbol) && /financial result/i.test(e.purpose ?? ""))
    .map((e) => ({
      date: e.date, kind: "results" as const, impact: "medium" as const, symbol: e.symbol,
      title: `${e.symbol} results`, detail: `${e.company}: board meeting to consider financial results (${e.purpose}).`,
      source: "NSE event calendar",
    }));
}

async function ipoEvents(env: Parameters<Tool["handler"]>[2]): Promise<MarketEvent[]> {
  if (!env.INDIANAPI_KEY) return [];
  const r = await indianApi(env, "/ipo", {}, HOUR);
  const d = r.data as Record<string, { name: string; symbol: string; is_sme?: boolean; bidding_start_date?: string; bidding_end_date?: string; listing_date?: string }[]>;
  const out: MarketEvent[] = [];
  for (const group of ["upcoming", "active", "closed"]) {
    for (const i of d?.[group] ?? []) {
      if (i.is_sme) continue; // mainboard issues only; SME issues rarely move the market
      if (i.bidding_start_date) out.push({ date: i.bidding_start_date.slice(0, 10), kind: "ipo", impact: "low", symbol: i.symbol, title: `${i.name} IPO opens`, detail: `Bidding runs to ${i.bidding_end_date?.slice(0, 10) ?? "—"}.`, source: "Indian Stock API (IPO data)" });
      if (i.listing_date) out.push({ date: i.listing_date.slice(0, 10), kind: "ipo", impact: "low", symbol: i.symbol, title: `${i.name} lists`, detail: "Listing day on the exchanges.", source: "Indian Stock API (IPO data)" });
    }
  }
  return out;
}

export const FILINGS_TOOLS: Tool[] = [
  {
    name: "get_filings",
    route: "/market/filings",
    title: "Company filings",
    description: "Exchange filings by NSE-listed companies, newest first, each with a link to the PDF: financial results, earnings-call transcripts, con-call and analyst meet updates, investor presentations, press releases and board meeting outcomes. For the whole market over recent days, or for one company over a longer window.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolArg,
        kind: { type: "string", enum: Object.keys(FILING_KINDS), description: "Only one kind of filing" },
        days: { type: "integer", description: "Days back from today: default 2 for the market (max 7), 365 for one company (max 730)" },
        limit: { type: "integer", description: "Default 200, max 1000" },
      },
    },
    metered: true,
    handler: async (_db, { symbol, kind, days, limit }, env) => {
      const s = sym(symbol);
      const to = todayIST();
      const from = addDaysISO(to, -(s ? clamp(days, 365, 730) : clamp(days, 2, 7)) + 1);
      const url = `https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=${nseQueryDate(from)}&to_date=${nseQueryDate(to)}${s ? `&symbol=${encodeURIComponent(s)}` : ""}`;
      const r = await nseFetch(env, url, s ? 30 * MIN : 10 * MIN, mapAnnouncements);
      const k = kind && kind in FILING_KINDS ? (kind as FilingKind) : null;
      const rows = k ? r.data.filter((f) => f.kind === k) : r.data;
      const counts = Object.fromEntries(Object.keys(FILING_KINDS).map((key) => [key, r.data.filter((f) => f.kind === key).length]));
      return { source: SOURCE, fetched_at: r.fetched_at, from, to, symbol: s, kinds: FILING_KINDS, counts, total: rows.length, filings: rows.slice(0, clamp(limit, 200, 1000)) };
    },
  },
  {
    name: "get_event_calendar",
    route: "/market/events",
    title: "Board meetings and results calendar",
    description: "Upcoming board meetings announced to NSE, with their purpose (financial results, dividend, fund raising, buyback…), by date. Filter to results only for an earnings calendar.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolArg,
        results_only: { type: "boolean", description: "Only meetings that will consider financial results" },
      },
    },
    metered: true,
    handler: async (_db, { symbol, results_only }, env) => {
      const r = await nseFetch(env, "https://www.nseindia.com/api/event-calendar", HOUR, (body) =>
        (JSON.parse(body) as RawEvent[]).map((e) => ({
          date: nseDate(e.date),
          symbol: e.symbol,
          company: e.company,
          purpose: e.purpose,
          results: /financial result/i.test(e.purpose ?? ""),
          details: (e.bm_desc ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
        })).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.symbol.localeCompare(b.symbol)),
      );
      const s = sym(symbol);
      const rows = r.data.filter((e) => (!s || e.symbol === s) && (!results_only || e.results));
      return { source: SOURCE, fetched_at: r.fetched_at, total: rows.length, events: rows };
    },
  },
  {
    name: "get_corporate_actions_calendar",
    route: "/market/corporate-actions",
    title: "Corporate actions calendar",
    description: "Dividends, bonuses, splits, rights issues and buybacks with their ex-dates and record dates: for the whole market from a week ago to a month ahead, or one company's history.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolArg,
        type: { type: "string", enum: ["Dividend", "Bonus", "Split", "Rights", "Buyback", "Demerger", "Meeting", "Other"], description: "Only one kind of action" },
      },
    },
    metered: true,
    handler: async (_db, { symbol, type }, env) => {
      const s = sym(symbol);
      const today = todayIST();
      const url = s
        ? `https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol=${encodeURIComponent(s)}`
        : `https://www.nseindia.com/api/corporates-corporateActions?index=equities&from_date=${nseQueryDate(addDaysISO(today, -7))}&to_date=${nseQueryDate(addDaysISO(today, 30))}`;
      const r = await nseFetch(env, url, 2 * HOUR, (body) =>
        (JSON.parse(body) as RawAction[]).map((a) => ({
          symbol: a.symbol,
          company: a.comp,
          subject: a.subject,
          type: actionType(a.subject ?? ""),
          ex_date: nseDate(a.exDate),
          record_date: nseDate(a.recDate),
          face_value: Number(a.faceVal) || null,
        })),
      );
      const rows = r.data
        .filter((a) => !type || a.type === type)
        .sort((a, b) => (s ? (b.ex_date ?? "").localeCompare(a.ex_date ?? "") : (a.ex_date ?? "").localeCompare(b.ex_date ?? "")));
      return { source: SOURCE, fetched_at: r.fetched_at, today, total: rows.length, actions: rows };
    },
  },
  {
    name: "get_company_documents",
    route: "/market/company-documents",
    title: "Results documents by company",
    description: "This results season's documents grouped by company: the results PDF, press release, investor presentation, con-call details and earnings-call transcript, each linking to the filing on NSE. Newest company first.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolArg,
        days: { type: "integer", description: "Days back from today (default 7, max 14)" },
        limit: { type: "integer", description: "Companies to return (default 100, max 500)" },
      },
    },
    metered: true,
    handler: async (_db, { symbol, days, limit }, env) => {
      const to = todayIST();
      const from = addDaysISO(to, -clamp(days, 7, 14) + 1);
      const r = await nseFetch(env, `https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=${nseQueryDate(from)}&to_date=${nseQueryDate(to)}`, 10 * MIN, mapAnnouncements);
      const s = sym(symbol);
      const companies = groupDocuments(r.data).filter((c) => !s || c.symbol === s);
      return { source: SOURCE, fetched_at: r.fetched_at, from, to, total: companies.length, companies: companies.slice(0, clamp(limit, 100, 500)) };
    },
  },
  {
    name: "get_market_events",
    route: "/market/events-calendar",
    title: "Market events calendar",
    description: "Dates ahead that move Indian markets: RBI policy decisions, US Fed decisions, India CPI, IIP and GDP releases (from the RBI, the Fed and MoSPI's published calendars), monthly and weekly F&O expiries and market holidays (from NSE), results dates of the most traded companies, and mainboard IPO openings and listings.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", description: "Days ahead from today (default 60, max 180)" },
        kind: { type: "string", enum: ["macro", "expiry", "holiday", "results", "ipo"], description: "Only one kind of event" },
      },
    },
    metered: true,
    handler: async (db, { days, kind }, env) => {
      const today = todayIST();
      const until = addDaysISO(today, clamp(days, 60, 180));
      // Each source can fail on its own; the calendar shows what it has and says what's missing.
      const settled = await Promise.allSettled([expiryEvents(env), holidayEvents(env), bigResultsEvents(env, db), ipoEvents(env)]);
      const names = ["F&O expiries", "market holidays", "company results", "IPOs"];
      const missing = settled.flatMap((s, i) => (s.status === "rejected" ? [names[i]] : []));
      const macro: MarketEvent[] = MACRO_EVENTS.map((m) => ({ ...m, kind: "macro" }));
      const all = [...macro, ...settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []))]
        .filter((e) => e.date >= today && e.date <= until && (!kind || e.kind === kind))
        .sort((a, b) => a.date.localeCompare(b.date) || ({ high: 0, medium: 1, low: 2 }[a.impact] - { high: 0, medium: 1, low: 2 }[b.impact]));
      return { today, until, missing, total: all.length, events: all };
    },
  },
  {
    name: "get_bulk_block_deals",
    route: "/market/deals",
    title: "Bulk and block deals",
    description: "The latest session's bulk deals (a client trading over 0.5% of a company's shares) and block deals (single trades of ₹10 crore or more in the block window) on NSE, with the client, side, quantity and price.",
    inputSchema: { type: "object", properties: { symbol: symbolArg } },
    metered: true,
    handler: async (_db, { symbol }, env) => {
      const [bulk, block] = await Promise.all([
        nseFetch(env, "https://nsearchives.nseindia.com/content/equities/bulk.csv", 30 * MIN, mapDeals),
        nseFetch(env, "https://nsearchives.nseindia.com/content/equities/block.csv", 30 * MIN, mapDeals),
      ]);
      const s = sym(symbol);
      const only = <T extends { symbol: string }>(xs: T[]) => (s ? xs.filter((d) => d.symbol === s) : xs);
      const date = bulk.data[0]?.date ?? block.data[0]?.date ?? null;
      if (s && !only(bulk.data).length && !only(block.data).length && !date) throw new ToolError("E_NOT_FOUND", "No deals loaded.", 404);
      return { source: SOURCE, fetched_at: bulk.fetched_at, date, bulk: only(bulk.data), block: only(block.data) };
    },
  },
];
