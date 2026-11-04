// One stock's About, news, analyst view and corporate actions, cut down from the provider's 370 KB
// /stock answer to the few KB the page uses. Kept per stock, so a page view reads a small row and
// the provider is asked at most once per stock every few hours.

import type { Env } from "../env.js";
import { ToolError } from "../handlers/errors.js";
import { indianApi } from "./indianapi.js";

const FRESH_S = 6 * 3600;
const NEWS_LIMIT = 9;
const NEWS_HOST = "https://www.livemint.com";

export type Digest = ReturnType<typeof shape>;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const plain = (s: unknown) => str(String(s ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " "));

function metric(raw: any, group: string, key: string): number | null {
  const rows = raw?.keyMetrics?.[group];
  if (!Array.isArray(rows)) return null;
  return num(rows.find((x: any) => x?.key === key)?.value);
}

function newsOf(raw: any) {
  const items = Array.isArray(raw?.recentNews) ? raw.recentNews : [];
  return items.slice(0, NEWS_LIMIT).flatMap((n: any) => {
    const headline = plain(n?.headline);
    const path = str(n?.url);
    if (!headline || !path) return [];
    const images = n?.leadMedia?.image?.images;
    return [{
      headline, date: str(n?.date), summary: plain(n?.summary),
      url: path.startsWith("http") ? path : `${NEWS_HOST}${path}`,
      image: str(images?.bigImage) ?? str(n?.thumbnailImage),
    }];
  });
}

function analystsOf(raw: any) {
  const rows = Array.isArray(raw?.analystView) ? raw.analystView : [];
  const named = rows.filter((r: any) => r?.ratingName && r.ratingName !== "Total");
  const col = (field: string) => Object.fromEntries(named.map((r: any) => [r.ratingName, Math.round(num(r[field]) ?? 0)]));
  const latest = col("numberOfAnalystsLatest") as Record<string, number>;
  const total = Object.values(latest).reduce((a, b) => a + b, 0);
  if (!total) return null;
  return {
    total, latest, mean: num(raw?.recosBar?.meanValue),
    trend: [
      { label: "3 months ago", counts: col("numberOfAnalysts3MonthAgo") },
      { label: "2 months ago", counts: col("numberOfAnalysts2MonthAgo") },
      { label: "1 month ago", counts: col("numberOfAnalysts1MonthAgo") },
      { label: "1 week ago", counts: col("numberOfAnalysts1WeekAgo") },
      { label: "Now", counts: latest },
    ],
  };
}

/** Dividends, bonuses, rights and splits with the date the price changed; the chart marks these. */
function actionsOf(raw: any) {
  const a = raw?.stockCorporateActionData ?? {};
  const list = (rows: unknown, kind: string, when: string[]) => (Array.isArray(rows) ? rows : []).flatMap((r: any) => {
    const date = when.map((k) => str(r?.[k])).find(Boolean);
    return date ? [{ kind, date: date.slice(0, 10), text: plain(r?.remarks) ?? kind }] : [];
  });
  return [
    ...list(a.dividend, "dividend", ["xdDate", "recordDate", "sortDate"]),
    ...list(a.bonus, "bonus", ["xbDate", "exDate", "recordDate", "sortDate"]),
    ...list(a.rights, "rights", ["xrDate", "exDate", "recordDate", "sortDate"]),
    ...list(a.splits, "split", ["xsDate", "exDate", "recordDate", "sortDate"]),
  ].sort((x, y) => y.date.localeCompare(x.date));
}

export function shape(raw: any, symbol: string) {
  const p = raw?.companyProfile ?? {};
  const officers = Array.isArray(p?.officers?.officer) ? p.officers.officer : [];
  return {
    symbol,
    name: str(raw?.companyName),
    about: plain(p?.companyDescription),
    industry: str(raw?.industry) ?? str(p?.mgIndustry),
    bse_code: str(p?.exchangeCodeBse), nse_code: str(p?.exchangeCodeNse),
    officers: officers.slice(0, 4).flatMap((o: any) => {
      const name = [o?.firstName, o?.lastName].filter(Boolean).join(" ");
      return name ? [{ name, title: str(o?.title?.Value) }] : [];
    }),
    news: newsOf(raw),
    analysts: analystsOf(raw),
    risk: raw?.riskMeter?.categoryName ? { category: str(raw.riskMeter.categoryName), std_dev: num(raw.riskMeter.stdDev) } : null,
    actions: actionsOf(raw),
    figures: {
      beta: metric(raw, "priceandVolume", "beta"),
      market_cap_cr: metric(raw, "priceandVolume", "marketCap"),
      eps_ttm: metric(raw, "persharedata", "ePSBasicExcludingExtraordinaryItemsItrailing12Month"),
      eps_ttm_yoy: metric(raw, "growth", "ePSChangePercentTTMOverTTM"),
      book_value: metric(raw, "persharedata", "bookValuePerShareMostRecentFiscalYear"),
      pe_ttm: metric(raw, "valuation", "pPerEBasicExcludingExtraordinaryItemsTTM"),
      pb: metric(raw, "valuation", "priceToBookMostRecentFiscalYear"),
      revenue_growth_ttm: metric(raw, "growth", "revenueChangePercentTTMPOverTTM"),
    },
    peers: (Array.isArray(p?.peerCompanyList) ? p.peerCompanyList : []).slice(0, 8).flatMap((x: any) => {
      const name = str(x?.companyName);
      return name ? [{ name, price: num(x?.price), change_pct: num(x?.percentChange), pe: num(x?.priceToEarningsValueRatio), pb: num(x?.priceToBookValueRatio), market_cap_cr: num(x?.marketCap) }] : [];
    }),
  };
}

/** The company as our tables know it: the names to ask the provider for, and the ISIN its answer must carry. */
async function identity(env: Env, symbol: string) {
  const name = (s: string) => s.replace(/\s+(limited|ltd\.?)$/i, "").trim();
  if (symbol.startsWith("BSE-")) {
    const code = symbol.slice(4);
    const row = await env.DB.prepare("SELECT name, isin FROM bse_stocks WHERE symbol = ?").bind(code).first<{ name: string; isin: string }>();
    // The name first: a BSE symbol can be a different company's NSE symbol.
    return row ? { isin: row.isin, names: [name(row.name), code] } : null;
  }
  const row = await env.DB.prepare("SELECT name, isin FROM stocks WHERE symbol = ?").bind(symbol).first<{ name: string; isin: string | null }>();
  return row ? { isin: row.isin, names: [symbol, name(row.name)] } : null;
}

async function ask(env: Env, who: { isin: string | null; names: string[] }, symbol: string) {
  let last: unknown = null;
  for (const name of who.names) {
    try {
      const r = await indianApi(env, "/stock", { name }, 0, { store: false });
      const raw = r.data as any;
      // The provider matches names loosely. An answer about another company must never show here.
      const isin = str(raw?.companyProfile?.isInId);
      if (who.isin && isin && isin !== who.isin) {
        last = new ToolError("E_NOT_FOUND", "The data provider has no profile for this company.", 404);
        continue;
      }
      return shape(raw, symbol);
    } catch (err) {
      if (!(err instanceof ToolError) || err.code !== "E_NOT_FOUND") throw err;
      last = err;
    }
  }
  throw last ?? new ToolError("E_NOT_FOUND", "The data provider has no profile for this company.", 404);
}

export async function stockDigest(env: Env, rawSymbol: string): Promise<{ source: string; fetched_at: string; data: Digest }> {
  const symbol = rawSymbol.trim().toUpperCase();
  const who = await identity(env, symbol);
  if (!who) throw new ToolError("E_NOT_FOUND", `No stock with symbol ${symbol}.`, 404);
  const key = `digest:${symbol}`;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT body, fetched_at FROM external_cache WHERE key = ?").bind(key).first<{ body: string; fetched_at: number }>();
  const stored = (fetched_at: number, data: Digest) => ({ source: "Indian Stock API (indianapi.in)", fetched_at: new Date(fetched_at * 1000).toISOString(), data });
  if (row && now - row.fetched_at < FRESH_S) return stored(row.fetched_at, JSON.parse(row.body));
  try {
    const data = await ask(env, who, symbol);
    await env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at")
      .bind(key, JSON.stringify(data), now).run();
    return stored(now, data);
  } catch (err) {
    // An older copy beats nothing when the provider is out or its limit is used up.
    if (row) return stored(row.fetched_at, JSON.parse(row.body));
    throw err;
  }
}
