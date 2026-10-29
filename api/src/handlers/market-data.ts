// Tools backed by the Indian Stock API (indianapi.in) rather than our own
// NSE files: intraday quotes and company profiles, news, IPOs, mutual funds,
// analyst forecasts, statements and corporate actions. Each answer says where
// it came from and when, since it is not the end-of-day data the rest serves.

import type { Database } from "../db/types.js";
import type { Env } from "../env.js";
import { indianApi } from "../lib/indianapi.js";
import { ToolError } from "./errors.js";
import type { Tool } from "./tools.js";

const MIN = 60;
const HOUR = 3600;

/** The provider matches on company name; accept an NSE symbol too and swap in our name for it. */
async function companyName(db: Database, raw: unknown): Promise<string> {
  const q = String(raw ?? "").trim();
  if (!q) throw new ToolError("E_BAD_ARGS", "stock is required.");
  const row = await db.prepare("SELECT name FROM stocks WHERE symbol = ?").bind(q.toUpperCase()).first<{ name: string }>();
  return row?.name ? row.name.replace(/\s+(limited|ltd\.?)$/i, "").trim() : q;
}

async function fetchFrom(env: Env, path: string, params: Record<string, string | undefined>, ttl: number) {
  const r = await indianApi(env, path, params, ttl);
  return { source: "Indian Stock API (indianapi.in)", fetched_at: r.fetched_at, data: r.data };
}

const stockArg = { type: "string", description: "NSE symbol (e.g. TATASTEEL) or company name (e.g. 'Tata Steel')" };

export const MARKET_DATA_TOOLS: Tool[] = [
  {
    name: "get_stock_profile",
    route: "/ext/stock",
    title: "Stock profile (intraday)",
    description: "Intraday price, company profile, key ratios, peers, recent news and analyst view for one company, from the Indian Stock API. Refreshed every few minutes, unlike get_quote's end-of-day close.",
    inputSchema: { type: "object", properties: { stock: stockArg }, required: ["stock"] },
    metered: true,
    handler: async (db, { stock }, env) => fetchFrom(env, "/stock", { name: await companyName(db, stock) }, 5 * MIN),
  },
  {
    name: "get_trending",
    route: "/ext/trending",
    title: "Trending stocks",
    description: "Today's top gainers and losers on NSE/BSE, intraday.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (_db, _args, env) => fetchFrom(env, "/trending", {}, 5 * MIN),
  },
  {
    name: "get_most_active",
    route: "/ext/most-active",
    title: "Most active stocks",
    description: "The most actively traded stocks today on NSE or BSE, intraday.",
    inputSchema: { type: "object", properties: { exchange: { type: "string", enum: ["NSE", "BSE"], description: "Default NSE" } } },
    metered: true,
    handler: async (_db, { exchange }, env) => fetchFrom(env, exchange === "BSE" ? "/BSE_most_active" : "/NSE_most_active", {}, 5 * MIN),
  },
  {
    name: "get_price_shockers",
    route: "/ext/price-shockers",
    title: "Price shockers",
    description: "Stocks with sudden, unusually large price moves today.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (_db, _args, env) => fetchFrom(env, "/price_shockers", {}, 5 * MIN),
  },
  {
    name: "get_52_week_extremes",
    route: "/ext/52-week",
    title: "52-week highs and lows",
    description: "Stocks trading at or near their 52-week high or low, on NSE and BSE.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (_db, _args, env) => fetchFrom(env, "/fetch_52_week_high_low_data", {}, HOUR),
  },
  {
    name: "get_news",
    route: "/ext/news",
    title: "Market news",
    description: "Latest Indian market and business news headlines with summaries and links.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (_db, _args, env) => fetchFrom(env, "/news", {}, 15 * MIN),
  },
  {
    name: "get_ipos",
    route: "/ext/ipo",
    title: "IPOs",
    description: "Upcoming, open, recently listed and closed IPOs with price bands, dates and listing gains.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (_db, _args, env) => fetchFrom(env, "/ipo", {}, HOUR),
  },
  {
    name: "get_commodities",
    route: "/ext/commodities",
    title: "Commodities",
    description: "Live commodity futures prices (gold, silver, crude oil, natural gas, base metals).",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (_db, _args, env) => fetchFrom(env, "/commodities", {}, 5 * MIN),
  },
  {
    name: "get_corporate_actions",
    route: "/ext/corporate-actions",
    title: "Corporate actions",
    description: "Dividends, splits, bonuses, rights issues and board meetings for one company.",
    inputSchema: { type: "object", properties: { stock: stockArg }, required: ["stock"] },
    metered: true,
    handler: async (db, { stock }, env) => fetchFrom(env, "/corporate_actions", { stock_name: await companyName(db, stock) }, 6 * HOUR),
  },
  {
    name: "get_announcements",
    route: "/ext/announcements",
    title: "Exchange announcements",
    description: "Recent exchange filings and announcements by one company.",
    inputSchema: { type: "object", properties: { stock: stockArg }, required: ["stock"] },
    metered: true,
    handler: async (db, { stock }, env) => fetchFrom(env, "/recent_announcements", { stock_name: await companyName(db, stock) }, HOUR),
  },
  {
    name: "get_statements",
    route: "/ext/statements",
    title: "Financial statements",
    description: "Historical financials for one company: quarterly or annual results, balance sheet, cash flow, ratios or shareholding pattern.",
    inputSchema: {
      type: "object",
      properties: {
        stock: stockArg,
        stats: {
          type: "string",
          description: "One of quarter_results, yoy_results, balancesheet, cashflow, ratios, shareholding_pattern_quarterly, shareholding_pattern_yearly, or all",
        },
      },
      required: ["stock", "stats"],
    },
    metered: true,
    handler: async (db, { stock, stats }, env) =>
      fetchFrom(env, "/historical_stats", { stock_name: await companyName(db, stock), stats }, 24 * HOUR),
  },
  {
    name: "get_valuation_history",
    route: "/ext/valuation-history",
    title: "Price and valuation history",
    description: "Long-run history of price or a valuation ratio (P/E, EV/EBITDA, price-to-book, market-cap/sales) for one company, up to its full listed history.",
    inputSchema: {
      type: "object",
      properties: {
        stock: stockArg,
        period: { type: "string", enum: ["1m", "6m", "1yr", "3yr", "5yr", "10yr", "max"], description: "Default 1yr" },
        filter: {
          type: "string",
          enum: ["default", "price", "pe", "sm", "evebitda", "ptb", "mcs"],
          description: "price, pe (P/E with EPS), sm (sales/margin), evebitda, ptb (price to book), mcs (market cap / sales). Default 'default' (price + moving averages)",
        },
      },
      required: ["stock"],
    },
    metered: true,
    handler: async (db, { stock, period, filter }, env) =>
      fetchFrom(env, "/historical_data", { stock_name: await companyName(db, stock), period: period ?? "1yr", filter: filter ?? "default" }, 6 * HOUR),
  },
  {
    name: "get_analyst_forecasts",
    route: "/ext/forecasts",
    title: "Analyst forecasts",
    description: "Consensus analyst estimates or reported actuals for one company's EPS, sales, net income, ROE and other measures. Takes the provider's stock_id (the ticker shown in get_stock_profile, e.g. TATASTEEL).",
    inputSchema: {
      type: "object",
      properties: {
        stock_id: { type: "string", description: "Ticker, e.g. TATASTEEL" },
        measure_code: {
          type: "string",
          enum: ["EPS", "CPS", "CPX", "DPS", "EBI", "EBT", "GPS", "GRM", "NAV", "NDT", "NET", "PRE", "ROA", "ROE", "SAL"],
          description: "EPS, SAL (sales), NET (net income), EBI (EBITDA), ROE, DPS (dividend/share), etc. Default EPS",
        },
        period_type: { type: "string", enum: ["Annual", "Interim"], description: "Default Annual" },
        data_type: { type: "string", enum: ["Actuals", "Estimates"], description: "Default Estimates" },
        age: { type: "string", enum: ["Current", "OneWeekAgo", "ThirtyDaysAgo", "SixtyDaysAgo", "NinetyDaysAgo"], description: "Snapshot of the consensus at this age. Default Current" },
      },
      required: ["stock_id"],
    },
    metered: true,
    handler: async (_db, a, env) =>
      fetchFrom(env, "/stock_forecasts", {
        stock_id: String(a.stock_id).toUpperCase(),
        measure_code: a.measure_code ?? "EPS",
        period_type: a.period_type ?? "Annual",
        data_type: a.data_type ?? "Estimates",
        age: a.age ?? "Current",
      }, 12 * HOUR),
  },
  {
    name: "get_target_price",
    route: "/ext/target-price",
    title: "Analyst target price",
    description: "Analysts' consensus target price (mean, high, low), recommendation mix and history for one company. Takes the ticker, e.g. TATASTEEL.",
    inputSchema: { type: "object", properties: { stock_id: { type: "string", description: "Ticker, e.g. TATASTEEL" } }, required: ["stock_id"] },
    metered: true,
    handler: async (_db, { stock_id }, env) => fetchFrom(env, "/stock_target_price", { stock_id: String(stock_id).toUpperCase() }, 12 * HOUR),
  },
  {
    name: "search_industry",
    route: "/ext/industry",
    title: "Search by industry",
    description: "Find listed companies by industry or business keyword, e.g. 'cement' or 'specialty chemicals'.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Industry or keyword" } }, required: ["query"] },
    metered: true,
    handler: async (_db, { query }, env) => fetchFrom(env, "/industry_search", { query }, 24 * HOUR),
  },
  {
    name: "list_mutual_funds",
    route: "/ext/mutual-funds",
    title: "Mutual funds",
    description: "Mutual fund schemes grouped by category with NAV and 1/3/5-year returns. Large; prefer search_mutual_funds for one scheme.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (_db, _args, env) => fetchFrom(env, "/mutual_funds", {}, 12 * HOUR),
  },
  {
    name: "search_mutual_funds",
    route: "/ext/mutual-funds/search",
    title: "Search mutual funds",
    description: "Find mutual fund schemes by name, e.g. 'parag parikh flexi'.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Scheme or fund house name" } }, required: ["query"] },
    metered: true,
    handler: async (_db, { query }, env) => fetchFrom(env, "/mutual_fund_search", { query }, 24 * HOUR),
  },
  {
    name: "get_mutual_fund",
    route: "/ext/mutual-funds/details",
    title: "Mutual fund details",
    description: "One scheme's NAV, returns, expense ratio, AUM, risk and portfolio holdings (the provider reports the Direct plan). Use the scheme name from search_mutual_funds.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "Scheme name" } }, required: ["name"] },
    metered: true,
    handler: async (_db, { name }, env) => {
      try {
        return await fetchFrom(env, "/mutual_funds_details", { stock_name: name }, 12 * HOUR);
      } catch (err) {
        // list_mutual_funds names carry a plan suffix ("... Regular Growth") the details lookup doesn't match.
        const base = String(name).replace(/\s+(regular|direct)(\s+plan)?(\s+(growth|idcw).*)?$/i, "").trim();
        if (!(err instanceof ToolError) || err.code !== "E_NOT_FOUND" || base === name) throw err;
        return fetchFrom(env, "/mutual_funds_details", { stock_name: base }, 12 * HOUR);
      }
    },
  },
];
