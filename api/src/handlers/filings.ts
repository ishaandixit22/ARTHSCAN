// Company events from NSE: every exchange filing with its PDF (results,
// earnings-call transcripts, investor presentations, press releases, board
// outcomes), the calendar of upcoming board meetings and results, corporate
// actions with their ex-dates, and the day's bulk and block deals.
// All are public NSE data; answers say so and when they were fetched.

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
