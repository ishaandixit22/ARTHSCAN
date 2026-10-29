// The shared data layer. Every feature is defined once here as a tool; the MCP
// server lists and calls these, the REST API mounts each at /v1/<route>, and the
// website reads through the same REST routes. Add a tool here and it appears on
// all three surfaces.

import type { Database } from "../db/types.js";
import type { Env } from "../env.js";
import { nseFetch } from "../lib/nse.js";
import { ToolError } from "./errors.js";
import { EARNINGS_TOOLS } from "./earnings.js";
import { FILINGS_TOOLS } from "./filings.js";
import { MARKET_DATA_TOOLS } from "./market-data.js";

export type JsonSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface Tool {
  name: string;
  /** REST path under /v1. `:symbol` segments are filled from args. */
  route: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  /** Counts against the daily quota when called with a user token. */
  metered: boolean;
  /** env is only needed by tools that call an outside data provider. */
  handler: (db: Database, args: Record<string, any>, env: Env) => Promise<unknown>;
}

export { ToolError };

// ── Screener fields ────────────────────────────────────────────────

export const SCREENER_FIELDS: Record<string, { label: string; unit: string; description: string }> = {
  close:          { label: "Price",              unit: "INR", description: "Last closing price" },
  change_pct:     { label: "Day change",         unit: "%",   description: "Change vs previous close" },
  volume:         { label: "Volume",             unit: "shares", description: "Shares traded on the last day" },
  turnover:       { label: "Turnover",           unit: "INR", description: "Value traded on the last day" },
  avg_volume_20d: { label: "Avg volume (20d)",   unit: "shares", description: "Average daily volume, last 20 sessions" },
  high_52w:       { label: "52-week high",       unit: "INR", description: "Highest close in the last 252 sessions" },
  low_52w:        { label: "52-week low",        unit: "INR", description: "Lowest close in the last 252 sessions" },
  pct_from_high:  { label: "From 52w high",      unit: "%",   description: "Distance below the 52-week high (0 = at the high)" },
  ret_1w:         { label: "Return 1W",          unit: "%",   description: "5-session price return" },
  ret_1m:         { label: "Return 1M",          unit: "%",   description: "21-session price return" },
  ret_3m:         { label: "Return 3M",          unit: "%",   description: "63-session price return" },
  ret_6m:         { label: "Return 6M",          unit: "%",   description: "126-session price return" },
  ret_1y:         { label: "Return 1Y",          unit: "%",   description: "252-session price return" },
  volatility_1y:  { label: "Volatility 1Y",      unit: "%",   description: "Annualised std. dev. of daily log returns" },
  sma_50:         { label: "SMA 50",             unit: "INR", description: "50-session simple moving average" },
  sma_200:        { label: "SMA 200",            unit: "INR", description: "200-session simple moving average" },
  pe:             { label: "P/E (TTM)",          unit: "x",   description: "Price / trailing four-quarter EPS (needs imported results)" },
  eps_ttm:        { label: "EPS (TTM)",          unit: "INR", description: "Sum of the last four quarterly EPS" },
  promoter_pct:   { label: "Promoter holding",   unit: "%",   description: "Latest promoter shareholding (needs imported data)" },
  sma_20:         { label: "SMA 20",             unit: "INR", description: "20-session simple moving average" },
  rsi_14:         { label: "RSI 14",             unit: "",    description: "14-session relative strength index (below 30 oversold, above 70 overbought)" },
  macd_hist:      { label: "MACD histogram",     unit: "",    description: "MACD(12,26,9) line minus its signal line; positive = bullish momentum" },
  vol_ratio:      { label: "Volume vs 20D avg",  unit: "x",   description: "Last session's volume divided by the prior 20-session average" },
  deliv_pct:      { label: "Delivery",           unit: "%",   description: "Share of traded quantity taken for delivery, last session" },
  deliv_pct_avg_20: { label: "Delivery avg 20D", unit: "%",   description: "Average delivery % over the last 20 sessions" },
};

const OPS: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=" };

/** Ordinary shares only: keeps ETFs, liquid funds and exchange test symbols out of market-wide lists. */
/** Index heatmaps: NSE's constituent list for each, from its public archive. */
const HEATMAP_INDICES: Record<string, { name: string; file: string }> = {
  nifty50: { name: "Nifty 50", file: "ind_nifty50list" },
  niftynext50: { name: "Nifty Next 50", file: "ind_niftynext50list" },
  nifty100: { name: "Nifty 100", file: "ind_nifty100list" },
  midcap150: { name: "Nifty Midcap 150", file: "ind_niftymidcap150list" },
  smallcap250: { name: "Nifty Smallcap 250", file: "ind_niftysmallcap250list" },
};

const SHARES_ONLY = "COALESCE(s.instrument_type, 'ES') = 'ES'";

const LIST_COLUMNS = `s.symbol, s.name, s.sector, s.series, m.close, m.change_pct, m.volume, m.turnover,
  m.ret_1m, m.ret_1y, m.high_52w, m.low_52w, m.pct_from_high, m.pe, m.as_of,
  COALESCE(m.first_date = m.as_of, 0) AS listed_today`;

// ── Helpers ────────────────────────────────────────────────────────

async function requireStock(db: Database, symbol: unknown) {
  const sym = String(symbol ?? "").trim().toUpperCase();
  if (!sym) throw new ToolError("E_BAD_ARGS", "symbol is required.");
  const row = await db.prepare("SELECT * FROM stocks WHERE symbol = ?").bind(sym).first<Record<string, unknown>>();
  if (!row) throw new ToolError("E_NOT_FOUND", `No stock with symbol ${sym}. Try search_stocks first.`, 404);
  return row;
}

function clampLimit(v: unknown, def: number, max: number): number {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, Math.floor(n))) : def;
}

const PERIOD_DAYS: Record<string, number> = { "1m": 31, "3m": 92, "6m": 183, "1y": 366, "2y": 731, "5y": 1827, max: 36500 };

// ── Tools ──────────────────────────────────────────────────────────

const symbolArg = { type: "string", description: "NSE symbol, e.g. RELIANCE, TCS, HDFCBANK" };

export const TOOLS: Tool[] = [
  {
    name: "guide",
    route: "/guide",
    title: "How to use this server",
    description: "Explains the available tools, data coverage, update times and limits. Call this first if unsure which tool fits.",
    inputSchema: { type: "object", properties: {} },
    metered: false,
    handler: async (db) => {
      const cov = await db.prepare(`SELECT (SELECT COUNT(*) FROM stocks) AS stocks,
        (SELECT MIN(date) FROM daily_prices) AS price_from, (SELECT MAX(date) FROM daily_prices) AS price_to,
        (SELECT MAX(date) FROM fii_dii) AS fii_dii_to,
        (SELECT MAX(date) FROM fpi_daily) AS fpi_daily_to, (SELECT MAX(period_end) FROM fpi_sector) AS fpi_sector_to,
        (SELECT COUNT(DISTINCT symbol) FROM financials) AS with_financials,
        (SELECT COUNT(DISTINCT symbol) FROM shareholding) AS with_shareholding`).first();
      return {
        about: "End-of-day research data for NSE-listed Indian stocks. Prices update each trading day after NSE publishes the bhavcopy (~6-7 pm IST). Not real-time.",
        coverage: cov,
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
        tips: [
          "Resolve company names to symbols with search_stocks before other calls.",
          "screen_stocks accepts filters like {field:'ret_1y', op:'gt', value:20}; list fields with list_screener_fields.",
          "Values are INR; financials are INR crore.",
          "Tools under /v1/ext (get_stock_profile, get_news, get_ipos, mutual funds, analyst forecasts…) come from the Indian Stock API and are intraday; each answer carries fetched_at.",
        ],
        disclaimer: "Not investment advice. This service is not a SEBI-registered research analyst or investment adviser.",
      };
    },
  },
  {
    name: "search_stocks",
    route: "/search",
    title: "Search stocks",
    description: "Find NSE stocks by symbol or company name. Returns symbol, name, sector and last price. Use this to resolve a company name to its symbol.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Symbol or part of the company name, e.g. 'infosys' or 'HDFC'" },
        limit: { type: "integer", description: "Max results (1-50, default 10)" },
      },
      required: ["query"],
    },
    metered: true,
    handler: async (db, { query, limit }) => {
      const q = String(query ?? "").trim();
      if (q.length < 1) throw new ToolError("E_BAD_ARGS", "query is required.");
      const up = q.toUpperCase();
      const { results } = await db.prepare(`
        SELECT ${LIST_COLUMNS} FROM stocks s LEFT JOIN stock_metrics m ON m.symbol = s.symbol
        WHERE s.symbol LIKE ? OR UPPER(s.name) LIKE ?
        ORDER BY (s.symbol = ?) DESC, (s.symbol LIKE ?) DESC, (m.turnover IS NULL), m.turnover DESC
        LIMIT ?`).bind(`${up}%`, `%${up}%`, up, `${up}%`, clampLimit(limit, 10, 50)).all();
      return { query: q, results };
    },
  },
  {
    name: "get_company",
    route: "/stocks/:symbol",
    title: "Company profile",
    description: "Profile for one stock: name, ISIN, sector, listing date, face value, plus the latest price snapshot and computed metrics.",
    inputSchema: { type: "object", properties: { symbol: symbolArg }, required: ["symbol"] },
    metered: true,
    handler: async (db, { symbol }) => {
      const stock = await requireStock(db, symbol);
      const metrics = await db.prepare("SELECT * FROM stock_metrics WHERE symbol = ?").bind(stock.symbol).first();
      const peers = stock.sector
        ? (await db.prepare(`SELECT ${LIST_COLUMNS} FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
            WHERE s.sector = ? AND s.symbol != ? ORDER BY m.turnover DESC LIMIT 6`).bind(stock.sector, stock.symbol).all()).results
        : [];
      return { ...stock, metrics, peers };
    },
  },
  {
    name: "get_quote",
    route: "/quote/:symbol",
    title: "Stock quote",
    description: "Latest end-of-day quote for one stock: open, high, low, close, previous close, change, volume and turnover.",
    inputSchema: { type: "object", properties: { symbol: symbolArg }, required: ["symbol"] },
    metered: true,
    handler: async (db, { symbol }) => {
      const stock = await requireStock(db, symbol);
      const { results: [q, prior] } = await db.prepare(`SELECT date, open, high, low, close, prev_close, volume, turnover, trades, adj
        FROM daily_prices WHERE symbol = ? ORDER BY date DESC LIMIT 2`).bind(stock.symbol).all<Record<string, number>>();
      if (!q) throw new ToolError("E_NO_DATA", `No price data for ${stock.symbol} yet.`, 404);
      // Compare against the prior session on today's share basis (handles split ex-dates).
      const base = prior ? prior.close * prior.adj : q.prev_close;
      const change = base ? q.close - base : null;
      const { adj: _adj, ...quote } = q;
      return {
        symbol: stock.symbol, name: stock.name, ...quote, prev_close: base,
        change: change === null ? null : Math.round(change * 100) / 100,
        change_pct: change === null ? null : Math.round((change / base) * 10000) / 100,
        delayed: "end of day",
      };
    },
  },
  {
    name: "get_quotes",
    route: "/quotes",
    title: "Batch quotes",
    description: "Latest end-of-day close and change for up to 50 stocks in one call.",
    inputSchema: {
      type: "object",
      properties: { symbols: { type: "array", items: { type: "string" }, description: "NSE symbols, max 50" } },
      required: ["symbols"],
    },
    metered: true,
    handler: async (db, { symbols }) => {
      const list = (Array.isArray(symbols) ? symbols : String(symbols ?? "").split(","))
        .map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 50);
      if (!list.length) throw new ToolError("E_BAD_ARGS", "symbols is required.");
      const { results } = await db.prepare(`SELECT ${LIST_COLUMNS} FROM stocks s LEFT JOIN stock_metrics m ON m.symbol = s.symbol
        WHERE s.symbol IN (${list.map(() => "?").join(",")})`).bind(...list).all<{ symbol: string }>();
      const found = new Set(results.map((r) => r.symbol));
      return { quotes: results, not_found: list.filter((s: string) => !found.has(s)) };
    },
  },
  {
    name: "get_price_history",
    route: "/stocks/:symbol/history",
    title: "Price history",
    description: "Daily OHLCV candles for one stock, adjusted for splits and bonuses. Choose a period (1m, 3m, 6m, 1y, 2y, 5y, max) or explicit from/to dates.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolArg,
        period: { type: "string", enum: Object.keys(PERIOD_DAYS), description: "Lookback window (default 1y)" },
        from: { type: "string", description: "Start date YYYY-MM-DD (overrides period)" },
        to: { type: "string", description: "End date YYYY-MM-DD (default latest)" },
      },
      required: ["symbol"],
    },
    metered: true,
    handler: async (db, { symbol, period, from, to }) => {
      const stock = await requireStock(db, symbol);
      const end = to ?? (await db.prepare("SELECT MAX(date) AS d FROM daily_prices WHERE symbol = ?").bind(stock.symbol).first<{ d: string }>())?.d;
      if (!end) throw new ToolError("E_NO_DATA", `No price data for ${stock.symbol} yet.`, 404);
      const days = PERIOD_DAYS[period ?? "1y"] ?? 366;
      const start = from ?? new Date(Date.parse(end) - days * 86400_000).toISOString().slice(0, 10);
      const { results } = await db.prepare(`SELECT date, ROUND(open * adj, 2) AS open, ROUND(high * adj, 2) AS high,
          ROUND(low * adj, 2) AS low, ROUND(close * adj, 2) AS close, CAST(volume / adj AS INTEGER) AS volume
        FROM daily_prices WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date`).bind(stock.symbol, start, end).all();
      const { results: adjustments } = await db.prepare("SELECT ex_date, factor, source FROM price_adjustments WHERE symbol = ? ORDER BY ex_date")
        .bind(stock.symbol).all();
      return { symbol: stock.symbol, from: start, to: end, adjusted: true, adjustments, count: results.length, candles: results };
    },
  },
  {
    name: "get_financials",
    route: "/stocks/:symbol/financials",
    title: "Financial results",
    description: "Quarterly or annual income statement lines (revenue, operating profit, net profit, EPS) for one stock. INR crore.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolArg,
        period_type: { type: "string", enum: ["quarterly", "annual"], description: "Default quarterly" },
        limit: { type: "integer", description: "Number of periods (default 8, max 40)" },
      },
      required: ["symbol"],
    },
    metered: true,
    handler: async (db, { symbol, period_type, limit }) => {
      const stock = await requireStock(db, symbol);
      const type = period_type === "annual" ? "A" : "Q";
      // Prefer consolidated; fall back to standalone when a company files only that.
      const { results } = await db.prepare(`SELECT * FROM financials WHERE symbol = ? AND period_type = ?
        AND consolidated = (SELECT MAX(consolidated) FROM financials WHERE symbol = ? AND period_type = ?)
        ORDER BY period_end DESC LIMIT ?`).bind(stock.symbol, type, stock.symbol, type, clampLimit(limit, 8, 40)).all();
      return {
        symbol: stock.symbol, period_type: type === "A" ? "annual" : "quarterly", unit: "INR crore", periods: results,
        ...(results.length ? {} : { note: "No results loaded for this stock yet." }),
      };
    },
  },
  {
    name: "get_shareholding",
    route: "/stocks/:symbol/shareholding",
    title: "Shareholding pattern",
    description: "Quarterly shareholding pattern for one stock: promoter, FII, DII, public, government and promoter pledge, as % of shares.",
    inputSchema: {
      type: "object",
      properties: { symbol: symbolArg, limit: { type: "integer", description: "Number of quarters (default 8)" } },
      required: ["symbol"],
    },
    metered: true,
    handler: async (db, { symbol, limit }) => {
      const stock = await requireStock(db, symbol);
      const { results } = await db.prepare("SELECT * FROM shareholding WHERE symbol = ? ORDER BY quarter_end DESC LIMIT ?")
        .bind(stock.symbol, clampLimit(limit, 8, 40)).all();
      return {
        symbol: stock.symbol, unit: "% of total shares", quarters: results,
        ...(results.length ? {} : { note: "No shareholding loaded for this stock yet." }),
      };
    },
  },
  {
    name: "list_screener_fields",
    route: "/screener/fields",
    title: "Screener fields",
    description: "Lists every field screen_stocks can filter and sort on, with units, definitions and whether any stock has data for it yet.",
    inputSchema: { type: "object", properties: {} },
    metered: false,
    handler: async (db) => {
      // Fundamentals-based fields stay empty until results are imported; say so
      // rather than letting a screen on them silently return nothing.
      const counts = await db.prepare(`SELECT COUNT(pe) AS pe, COUNT(eps_ttm) AS eps_ttm, COUNT(promoter_pct) AS promoter_pct FROM stock_metrics`)
        .first<Record<string, number>>();
      return {
      fields: Object.entries(SCREENER_FIELDS).map(([key, f]) => ({ key, ...f, available: counts?.[key] === undefined || counts[key] > 0 })),
      operators: Object.keys(OPS),
      extra_filters: ["sector (exact match)", "series (EQ, BE, SM ...)"],
      };
    },
  },
  {
    name: "screen_stocks",
    route: "/screener",
    title: "Stock screener",
    description: "Filter all NSE stocks by price, returns, 52-week range, volume, volatility, moving averages, P/E and sector. Filters combine with AND.",
    inputSchema: {
      type: "object",
      properties: {
        filters: {
          type: "array",
          description: "e.g. [{\"field\":\"ret_1y\",\"op\":\"gt\",\"value\":20},{\"field\":\"close\",\"op\":\"lt\",\"value\":500}]",
          items: {
            type: "object",
            properties: {
              field: { type: "string", enum: Object.keys(SCREENER_FIELDS) },
              op: { type: "string", enum: Object.keys(OPS) },
              value: { type: "number" },
            },
            required: ["field", "op", "value"],
          },
        },
        sector: { type: "string", description: "Restrict to one sector (see list_sectors)" },
        above_sma_200: { type: "boolean", description: "Only stocks trading above their 200-day average" },
        sort: { type: "string", enum: Object.keys(SCREENER_FIELDS), description: "Sort field (default turnover)" },
        order: { type: "string", enum: ["asc", "desc"], description: "Default desc" },
        limit: { type: "integer", description: "Max rows (default 50, max 200)" },
        offset: { type: "integer", description: "Rows to skip, for paging" },
      },
    },
    metered: true,
    handler: async (db, { filters, sector, above_sma_200, sort, order, limit, offset }) => {
      const where: string[] = ["m.close IS NOT NULL"];
      const binds: unknown[] = [];
      const parsed = typeof filters === "string" ? JSON.parse(filters) : (filters ?? []);
      if (!Array.isArray(parsed)) throw new ToolError("E_BAD_ARGS", "filters must be an array.");
      for (const f of parsed) {
        if (!f || !(f.field in SCREENER_FIELDS)) throw new ToolError("E_BAD_ARGS", `Unknown field '${f?.field}'. Call list_screener_fields.`);
        const op = OPS[f.op];
        const value = Number(f.value);
        if (!op || !Number.isFinite(value)) throw new ToolError("E_BAD_ARGS", `Bad filter on ${f.field}: op must be one of ${Object.keys(OPS).join(", ")} and value a number.`);
        where.push(`m.${f.field} ${op} ?`);
        binds.push(value);
      }
      if (sector) { where.push("s.sector = ?"); binds.push(String(sector)); }
      if (above_sma_200 === true || above_sma_200 === "true") where.push("m.sma_200 IS NOT NULL AND m.close > m.sma_200");
      const sortCol = sort && sort in SCREENER_FIELDS ? sort : "turnover";
      const dir = order === "asc" ? "ASC" : "DESC";
      const sql = `FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol WHERE ${where.join(" AND ")}`;
      const total = await db.prepare(`SELECT COUNT(*) AS n ${sql}`).bind(...binds).first<{ n: number }>();
      const { results } = await db.prepare(`SELECT ${LIST_COLUMNS}, m.ret_1w, m.ret_3m, m.ret_6m, m.volatility_1y, m.sma_50, m.sma_200, m.promoter_pct
        ${sql} ORDER BY (m.${sortCol} IS NULL), m.${sortCol} ${dir} LIMIT ? OFFSET ?`)
        .bind(...binds, clampLimit(limit, 50, 200), Math.max(0, Number(offset) || 0)).all();
      return { total: total?.n ?? 0, sort: sortCol, order: dir.toLowerCase(), results };
    },
  },
  {
    name: "list_stocks",
    route: "/stocks",
    title: "Browse stocks",
    description: "Lists stocks alphabetically, optionally by first letter or by sector. Use for browsing; use search_stocks to find a specific company.",
    inputSchema: {
      type: "object",
      properties: {
        letter: { type: "string", description: "First letter A-Z, or '0' for digits" },
        sector: { type: "string", description: "Exact sector name (see list_sectors)" },
        limit: { type: "integer", description: "Max rows (default 100, max 500)" },
        offset: { type: "integer" },
      },
    },
    metered: true,
    handler: async (db, { letter, sector, limit, offset }) => {
      const where: string[] = ["m.close IS NOT NULL"];
      const binds: unknown[] = [];
      if (letter) {
        const l = String(letter).toUpperCase().slice(0, 1);
        if (/[0-9]/.test(l)) where.push("substr(s.symbol, 1, 1) BETWEEN '0' AND '9'");
        else { where.push("s.symbol LIKE ?"); binds.push(`${l}%`); }
      }
      if (sector) { where.push("s.sector = ?"); binds.push(String(sector)); }
      const sql = `FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol WHERE ${where.join(" AND ")}`;
      const total = await db.prepare(`SELECT COUNT(*) AS n ${sql}`).bind(...binds).first<{ n: number }>();
      const { results } = await db.prepare(`SELECT ${LIST_COLUMNS} ${sql} ORDER BY s.symbol LIMIT ? OFFSET ?`)
        .bind(...binds, clampLimit(limit, 100, 500), Math.max(0, Number(offset) || 0)).all();
      return { total: total?.n ?? 0, results };
    },
  },
  {
    name: "list_sectors",
    route: "/sectors",
    title: "Sectors",
    description: "Every sector with its stock count, average 1-day and 1-month return, and total turnover. Good for a sector overview.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (db) => {
      const { results } = await db.prepare(`
        SELECT s.sector, COUNT(*) AS stocks, ROUND(AVG(m.change_pct), 2) AS avg_change_pct,
               ROUND(AVG(m.ret_1m), 2) AS avg_ret_1m, ROUND(SUM(m.turnover)) AS turnover
        FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
        WHERE s.sector IS NOT NULL GROUP BY s.sector ORDER BY turnover DESC`).all();
      return { sectors: results };
    },
  },
  {
    name: "get_market_movers",
    route: "/market/movers",
    title: "Market movers",
    description: "Top gainers, top losers or most active stocks (by turnover) for the latest trading day. Ordinary shares only (no ETFs); ignores illiquid stocks; gainers and losers also leave out stocks on their listing day, whose change is measured against the issue price.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["gainers", "losers", "active"], description: "Default gainers" },
        limit: { type: "integer", description: "Default 10, max 50" },
      },
    },
    metered: true,
    handler: async (db, { kind, limit }) => {
      const k = kind === "losers" || kind === "active" ? kind : "gainers";
      const order = k === "gainers" ? "m.change_pct DESC" : k === "losers" ? "m.change_pct ASC" : "m.turnover DESC";
      // A listing-day "change" is vs the IPO price, not a prior close — it would top every gainers list.
      const listing = k === "active" ? "" : "AND (m.first_date IS NULL OR m.first_date < m.as_of)";
      // ₹1 crore of turnover keeps penny-stock noise out of the lists.
      const { results } = await db.prepare(`SELECT ${LIST_COLUMNS} FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
        WHERE m.turnover >= 1e7 AND m.change_pct IS NOT NULL AND ${SHARES_ONLY} ${listing}
          AND m.as_of = (SELECT MAX(as_of) FROM stock_metrics)
        ORDER BY ${order} LIMIT ?`).bind(clampLimit(limit, 10, 50)).all();
      return { kind: k, results };
    },
  },
  {
    name: "get_market_summary",
    route: "/market/summary",
    title: "Market summary",
    description: "Breadth for the latest trading day: advances, declines, unchanged, stocks at 52-week highs/lows, total turnover, plus the latest FII/DII net flows.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (db) => {
      const breadth = await db.prepare(`SELECT MAX(as_of) AS as_of,
          SUM(change_pct > 0) AS advances, SUM(change_pct < 0) AS declines, SUM(change_pct = 0) AS unchanged,
          SUM(close >= high_52w) AS at_52w_high, SUM(close <= low_52w) AS at_52w_low,
          ROUND(SUM(turnover) / 1e7) AS turnover_cr
        FROM stock_metrics WHERE as_of = (SELECT MAX(as_of) FROM stock_metrics)`).first();
      const { results: flows } = await db.prepare(
        "SELECT * FROM fii_dii WHERE date = (SELECT MAX(date) FROM fii_dii) ORDER BY category DESC").all();
      return { breadth, fii_dii: flows };
    },
  },
  {
    name: "get_fii_dii",
    route: "/market/fii-dii",
    title: "FII/DII flows",
    description: "Daily FII/FPI and DII cash-market buy, sell and net values (INR crore), plus monthly totals.",
    inputSchema: {
      type: "object",
      properties: { days: { type: "integer", description: "Trading days of daily data (default 30, max 500)" } },
    },
    metered: true,
    handler: async (db, { days }) => {
      const { results: daily } = await db.prepare(`
        SELECT date,
          SUM(CASE WHEN category='FII' THEN buy_value END) AS fii_buy, SUM(CASE WHEN category='FII' THEN sell_value END) AS fii_sell,
          SUM(CASE WHEN category='FII' THEN net_value END) AS fii_net,
          SUM(CASE WHEN category='DII' THEN buy_value END) AS dii_buy, SUM(CASE WHEN category='DII' THEN sell_value END) AS dii_sell,
          SUM(CASE WHEN category='DII' THEN net_value END) AS dii_net
        FROM fii_dii GROUP BY date ORDER BY date DESC LIMIT ?`).bind(clampLimit(days, 30, 500)).all();
      const { results: monthly } = await db.prepare(`
        SELECT substr(date, 1, 7) AS month,
          ROUND(SUM(CASE WHEN category='FII' THEN net_value ELSE 0 END), 2) AS fii_net,
          ROUND(SUM(CASE WHEN category='DII' THEN net_value ELSE 0 END), 2) AS dii_net,
          COUNT(DISTINCT date) AS days
        FROM fii_dii GROUP BY month ORDER BY month DESC LIMIT 24`).all();
      return { unit: "INR crore", daily, monthly };
    },
  },

  {
    name: "get_fpi_flows",
    route: "/market/fpi",
    title: "FPI flows by sector",
    description: "Foreign portfolio (FPI/FII) equity flows from NSDL, INR crore: daily net buying for the whole market, and net investment per sector for each fortnight with each sector's equity holdings (assets under custody). NSDL publishes sector figures every fortnight only, never daily.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", description: "Daily history in trading days (default 260, max 600)" },
        fortnights: { type: "integer", description: "Sector history in fortnights (default 24 ≈ one year, max 60)" },
        sector: { type: "string", description: "Only this sector, e.g. 'Financial Services', 'Information Technology'" },
      },
    },
    metered: true,
    handler: async (db, { days, fortnights, sector }) => {
      const { results: daily } = await db.prepare(`SELECT date, equity_buy AS buy, equity_sell AS sell, equity_net AS net
        FROM fpi_daily ORDER BY date DESC LIMIT ?`).bind(clampLimit(days, 260, 600)).all();
      const { results: periods } = await db.prepare("SELECT DISTINCT period_end FROM fpi_sector ORDER BY period_end DESC LIMIT ?")
        .bind(clampLimit(fortnights, 24, 60)).all<{ period_end: string }>();
      const ends = periods.map((p) => p.period_end).reverse();
      const { results: rows } = ends.length
        ? await db.prepare(`SELECT period_end, sector, equity_net, equity_auc FROM fpi_sector WHERE period_end >= ?
            ${sector ? "AND sector = ?" : ""}`).bind(...(sector ? [ends[0], String(sector)] : [ends[0]]))
            .all<{ period_end: string; sector: string; equity_net: number | null; equity_auc: number | null }>()
        : { results: [] };
      if (sector && !rows.length) throw new ToolError("E_NOT_FOUND", `No sector called '${sector}'. Call get_fpi_flows without a sector to list them.`, 404);
      const idx = new Map(ends.map((e, i) => [e, i]));
      const bySector = new Map<string, { sector: string; auc: number | null; flows: (number | null)[] }>();
      for (const r of rows) {
        const s = bySector.get(r.sector) ?? { sector: r.sector, auc: null, flows: ends.map(() => null) };
        s.flows[idx.get(r.period_end)!] = r.equity_net;
        if (r.period_end === ends[ends.length - 1]) s.auc = r.equity_auc;
        bySector.set(r.sector, s);
      }
      const total = bySector.get("Grand Total") ?? null;
      bySector.delete("Grand Total");
      bySector.delete("Sovereign"); // government debt only; always zero equity
      return {
        unit: "INR crore",
        source: "NSDL (custodian-confirmed). Daily date = reporting date, covering the previous session's trades.",
        daily: daily.reverse(),
        fortnights: ends,
        total,
        sectors: [...bySector.values()].sort((a, b) => (b.auc ?? 0) - (a.auc ?? 0)),
      };
    },
  },

  // ── Phase 1 market insights ──────────────────────────────────────
  {
    name: "get_heatmap",
    route: "/market/heatmap",
    title: "Market heatmap",
    description: "Stocks grouped by sector with their change for a period and their turnover, for a heatmap. Pick an index (Nifty 50, Nifty Next 50, Nifty 100, Midcap 150, Smallcap 250), one sector, or level=sectors for one tile per sector across the market. Without either, the most traded stocks.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["1d", "1w", "1m", "3m", "1y"], description: "Return period to colour by (default 1d)" },
        index: { type: "string", enum: Object.keys(HEATMAP_INDICES), description: "Only this index's constituents" },
        sector: { type: "string", description: "Only this sector's stocks" },
        level: { type: "string", enum: ["stocks", "sectors"], description: "sectors = one tile per sector across all traded stocks (default stocks)" },
        limit: { type: "integer", description: "Stocks to include, most traded first (default 200, max 500; an index returns all its members)" },
      },
    },
    metered: true,
    handler: async (db, { period, index, sector, level, limit }, env) => {
      const col = ({ "1w": "ret_1w", "1m": "ret_1m", "3m": "ret_3m", "1y": "ret_1y" } as Record<string, string>)[period ?? "1d"] ?? "change_pct";
      const idx = index && String(index) in HEATMAP_INDICES ? HEATMAP_INDICES[String(index)] : null;
      const members = idx
        ? (await nseFetch(env, `https://nsearchives.nseindia.com/content/indices/${idx.file}.csv`, 24 * 3600, (body) =>
            body.split(/\r?\n/).slice(1).map((l) => l.split(",")[2]?.trim()).filter((x): x is string => !!x))).data
        : null;
      const wantSectors = level === "sectors" && !idx && !sector;
      // An index or a sector shows all its stocks; the market-wide views cap at the most traded.
      const cap = idx ? 600 : wantSectors ? 5000 : sector ? clampLimit(limit, 120, 500) : clampLimit(limit, 200, 500);
      const filters = [`${SHARES_ONLY}`, "m.as_of = (SELECT MAX(as_of) FROM stock_metrics)", `m.${col} IS NOT NULL`, idx ? "1 = 1" : "m.turnover > 0"];
      const binds: unknown[] = [];
      if (members) {
        filters.push(`s.symbol IN (${members.map(() => "?").join(",")})`);
        binds.push(...members);
      }
      if (sector) {
        filters.push("COALESCE(s.sector, 'Other') = ?");
        binds.push(String(sector));
      }
      const { results } = await db.prepare(`SELECT s.symbol, s.name, COALESCE(s.sector, 'Other') AS sector, m.${col} AS change, m.turnover, m.close
        FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol WHERE ${filters.join(" AND ")}
        ORDER BY m.turnover DESC LIMIT ?`).bind(...binds, cap).all<{ symbol: string; sector: string; turnover: number; change: number }>();

      const bySector = new Map<string, { sector: string; turnover: number; weighted: number; sum: number; count: number; stocks: typeof results }>();
      for (const r of results) {
        const g = bySector.get(r.sector) ?? { sector: r.sector, turnover: 0, weighted: 0, sum: 0, count: 0, stocks: [] };
        g.turnover += r.turnover ?? 0;
        g.weighted += r.change * (r.turnover ?? 0);
        g.sum += r.change;
        g.count++;
        g.stocks.push(r);
        bySector.set(r.sector, g);
      }
      const round = (v: number) => Math.round(v * 100) / 100;
      const sectors = [...bySector.values()]
        .map(({ weighted, sum, stocks, ...g }) => ({
          ...g,
          change: g.turnover ? round(weighted / g.turnover) : round(sum / g.count), // turnover-weighted
          avg_change: round(sum / g.count),                                         // every stock counts once
          advances: stocks.filter((x) => x.change > 0).length,
          declines: stocks.filter((x) => x.change < 0).length,
          ...(wantSectors ? {} : { stocks }),
        }))
        .sort((a, b) => b.turnover - a.turnover);
      const asOf = await db.prepare("SELECT MAX(as_of) AS d FROM stock_metrics").first<{ d: string }>();
      return {
        as_of: asOf?.d, period: period ?? "1d",
        view: idx ? { kind: "index", key: String(index), name: idx.name } : sector ? { kind: "sector", name: String(sector) } : wantSectors ? { kind: "sectors", name: "All sectors" } : { kind: "market", name: "Most traded" },
        stocks: results.length, sizing: "turnover", sectors,
      };
    },
  },
  {
    name: "get_index_valuations",
    route: "/market/valuations",
    title: "Index valuations",
    description: "P/E, P/B and dividend yield for NSE indices. Without an index: the latest values for every index. With an index (e.g. 'Nifty 50'): its daily history.",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "string", description: "Exact index name, e.g. 'Nifty 50', 'Nifty Bank', 'Nifty Midcap 100'" },
        days: { type: "integer", description: "History length in trading days when an index is given (default 250, max 1000)" },
      },
    },
    metered: true,
    handler: async (db, { index, days }) => {
      if (index) {
        const { results } = await db.prepare(`SELECT date, close, change_pct, pe, pb, div_yield FROM index_daily
          WHERE index_name = ? ORDER BY date DESC LIMIT ?`).bind(String(index), clampLimit(days, 250, 1000)).all<{ pe: number | null }>();
        if (!results.length) throw new ToolError("E_NOT_FOUND", `No index called '${index}'. Call get_index_valuations without an index to list them.`, 404);
        const pes = results.map((r) => r.pe).filter((v): v is number => v !== null).sort((a, b) => a - b);
        const pct = (v: number | null) => (v === null || !pes.length ? null : Math.round((pes.filter((p) => p <= v).length / pes.length) * 100));
        return {
          index, history: results.reverse(),
          pe_range: pes.length ? { min: pes[0], median: pes[Math.floor(pes.length / 2)], max: pes[pes.length - 1], current_percentile: pct(results[results.length - 1]?.pe ?? null) } : null,
        };
      }
      const { results } = await db.prepare(`SELECT index_name, date, close, change_pct, pe, pb, div_yield FROM index_daily
        WHERE date = (SELECT MAX(date) FROM index_daily) ORDER BY turnover_cr DESC`).all();
      return { as_of: (results[0] as { date?: string } | undefined)?.date ?? null, indices: results };
    },
  },
  {
    name: "get_sector_rotation",
    route: "/market/sector-rotation",
    title: "Sector rotation",
    description: "Median return of each sector over 1 week, 1 month, 3 months, 6 months and 1 year, plus the share of its stocks above their 50-day average. Shows which sectors are gaining or losing leadership.",
    inputSchema: { type: "object", properties: {} },
    metered: true,
    handler: async (db) => {
      const { results } = await db.prepare(`SELECT s.sector, m.ret_1w, m.ret_1m, m.ret_3m, m.ret_6m, m.ret_1y, m.close, m.sma_50
        FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
        WHERE s.sector IS NOT NULL AND ${SHARES_ONLY} AND m.turnover >= 1e6`).all<Record<string, number | null> & { sector: string }>();
      const median = (xs: (number | null)[]) => {
        const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
        return v.length ? Math.round(v[Math.floor(v.length / 2)] * 100) / 100 : null;
      };
      const groups = new Map<string, typeof results>();
      for (const r of results) groups.set(r.sector, [...(groups.get(r.sector) ?? []), r]);
      const sectors = [...groups].map(([sector, rows]) => ({
        sector, stocks: rows.length,
        ret_1w: median(rows.map((r) => r.ret_1w)), ret_1m: median(rows.map((r) => r.ret_1m)), ret_3m: median(rows.map((r) => r.ret_3m)),
        ret_6m: median(rows.map((r) => r.ret_6m)), ret_1y: median(rows.map((r) => r.ret_1y)),
        pct_above_sma50: Math.round((rows.filter((r) => r.sma_50 && r.close! > r.sma_50).length / rows.length) * 100),
      })).sort((a, b) => (b.ret_1m ?? -999) - (a.ret_1m ?? -999));
      const asOf = await db.prepare("SELECT MAX(as_of) AS d FROM stock_metrics").first<{ d: string }>();
      return { as_of: asOf?.d, method: "median of stocks with ≥ ₹10 lakh turnover", sectors };
    },
  },
  {
    name: "get_technical_signals",
    route: "/market/signals",
    title: "Technical signals",
    description: "Stocks currently showing a technical signal: RSI oversold/overbought, 50/200-day golden or death cross (last 5 sessions), 52-week breakout or breakdown, volume spike, or MACD bullish/bearish. Liquid stocks only.",
    inputSchema: {
      type: "object",
      properties: {
        signal: {
          type: "string",
          enum: ["rsi_oversold", "rsi_overbought", "golden_cross", "death_cross", "breakout_high", "breakout_low", "volume_spike", "macd_bullish", "macd_bearish"],
          description: "Which signal (default volume_spike)",
        },
        limit: { type: "integer", description: "Default 50, max 200" },
      },
    },
    metered: true,
    handler: async (db, { signal, limit }) => {
      const SIGNALS: Record<string, { where: string; order: string; about: string }> = {
        rsi_oversold: { where: "m.rsi_14 < 30", order: "m.rsi_14 ASC", about: "RSI(14) below 30" },
        rsi_overbought: { where: "m.rsi_14 > 70", order: "m.rsi_14 DESC", about: "RSI(14) above 70" },
        golden_cross: { where: "m.cross_signal = 'golden'", order: "m.cross_date DESC, m.turnover DESC", about: "50-day average crossed above the 200-day in the last 5 sessions" },
        death_cross: { where: "m.cross_signal = 'death'", order: "m.cross_date DESC, m.turnover DESC", about: "50-day average crossed below the 200-day in the last 5 sessions" },
        breakout_high: { where: "m.breakout = 'high'", order: "m.turnover DESC", about: "Closed above its prior 52-week high" },
        breakout_low: { where: "m.breakout = 'low'", order: "m.turnover DESC", about: "Closed below its prior 52-week low" },
        volume_spike: { where: "m.vol_ratio >= 3", order: "m.vol_ratio DESC", about: "Volume at least 3x the prior 20-session average" },
        macd_bullish: { where: "m.macd_hist > 0 AND m.macd > 0", order: "m.macd_hist DESC", about: "MACD above its signal line and above zero" },
        macd_bearish: { where: "m.macd_hist < 0 AND m.macd < 0", order: "m.macd_hist ASC", about: "MACD below its signal line and below zero" },
      };
      const key = signal && signal in SIGNALS ? signal : "volume_spike";
      const sig = SIGNALS[key];
      const { results } = await db.prepare(`SELECT ${LIST_COLUMNS}, m.rsi_14, m.macd_hist, m.vol_ratio, m.cross_date, m.breakout, m.deliv_pct
        FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
        WHERE ${sig.where} AND ${SHARES_ONLY} AND m.turnover >= 1e7 AND m.as_of = (SELECT MAX(as_of) FROM stock_metrics)
        ORDER BY ${sig.order} LIMIT ?`).bind(clampLimit(limit, 50, 200)).all();
      const asOf = await db.prepare("SELECT MAX(as_of) AS d FROM stock_metrics").first<{ d: string }>();
      return { as_of: asOf?.d, signal: key, definition: sig.about, results };
    },
  },
  {
    name: "get_top_deliveries",
    route: "/market/deliveries",
    title: "Top deliveries",
    description: "Stocks with the highest share of traded quantity taken for delivery in the last session — often read as conviction buying or selling rather than intraday trading. Includes the 20-day average for comparison.",
    inputSchema: {
      type: "object",
      properties: {
        sort: { type: "string", enum: ["deliv_pct", "deliv_jump"], description: "deliv_pct (highest %) or deliv_jump (biggest rise vs 20-day average). Default deliv_pct" },
        min_turnover_cr: { type: "number", description: "Minimum turnover in ₹ crore (default 5)" },
        limit: { type: "integer", description: "Default 50, max 200" },
      },
    },
    metered: true,
    handler: async (db, { sort, min_turnover_cr, limit }) => {
      const order = sort === "deliv_jump" ? "(m.deliv_pct - m.deliv_pct_avg_20) DESC" : "m.deliv_pct DESC";
      const { results } = await db.prepare(`SELECT ${LIST_COLUMNS}, m.deliv_pct, m.deliv_pct_avg_20, m.vol_ratio
        FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
        WHERE m.deliv_pct IS NOT NULL AND ${SHARES_ONLY} AND m.turnover >= ? AND m.as_of = (SELECT MAX(as_of) FROM stock_metrics)
          ${sort === "deliv_jump" ? "AND m.deliv_pct_avg_20 IS NOT NULL" : ""}
        ORDER BY ${order} LIMIT ?`).bind((Number(min_turnover_cr) || 5) * 1e7, clampLimit(limit, 50, 200)).all();
      const asOf = await db.prepare("SELECT MAX(as_of) AS d FROM stock_metrics").first<{ d: string }>();
      return { as_of: asOf?.d, sort: sort === "deliv_jump" ? "deliv_jump" : "deliv_pct", results };
    },
  },
  {
    name: "get_fo_ban",
    route: "/market/fo-ban",
    title: "F&O ban list",
    description: "Securities in the F&O ban period (market-wide open interest above 95% of the limit, so no new positions) for the latest trade date NSE has published, which after the close is the next session, plus recent days and the stocks near the limit (open interest at 80% or more of MWPL).",
    inputSchema: { type: "object", properties: { days: { type: "integer", description: "Trade dates of history (default 10, max 60)" } } },
    metered: true,
    handler: async (db, { days }) => {
      const { results: dates } = await db.prepare("SELECT date FROM fo_ban_days ORDER BY date DESC LIMIT ?").bind(clampLimit(days, 10, 60)).all<{ date: string }>();
      const { results } = dates.length
        ? await db.prepare(`SELECT date, symbol FROM fo_ban WHERE date >= ? ORDER BY date DESC, symbol`).bind(dates[dates.length - 1].date).all<{ date: string; symbol: string }>()
        : { results: [] as { date: string; symbol: string }[] };
      const byDate = dates.map(({ date }) => ({ date, symbols: results.filter((r) => r.date === date).map((r) => r.symbol) }));
      const banned = new Set(byDate[0]?.symbols ?? []);
      // Near the limit: a stock enters the ban above 95% and leaves it below 80%.
      const { results: near } = await db.prepare(`SELECT o.symbol, s.name, o.pct_mwpl, o.fut_eq_oi, o.mwpl, o.next_day_limit
        FROM fo_oi o LEFT JOIN stocks s ON s.symbol = o.symbol
        WHERE o.date = (SELECT MAX(date) FROM fo_oi) AND o.pct_mwpl >= 80 ORDER BY o.pct_mwpl DESC`).all<{ symbol: string }>();
      const oiAsOf = await db.prepare("SELECT MAX(date) AS d FROM fo_oi").first<{ d: string | null }>();
      return {
        latest: byDate[0] ?? null,
        history: byDate,
        open_interest: { as_of: oiAsOf?.d ?? null, near: near.map((r) => ({ ...r, in_ban: banned.has(r.symbol) })) },
      };
    },
  },
  ...MARKET_DATA_TOOLS,
  ...FILINGS_TOOLS,
  ...EARNINGS_TOOLS,
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/**
 * Light coercion against the tool's schema so REST query strings ("20",
 * "true", "A,B") and MCP JSON arguments behave the same. Unknown keys drop.
 */
export function coerceArgs(tool: Tool, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
    let v = raw[key];
    if (v === undefined || v === null || v === "") continue;
    if (schema.type === "integer" || schema.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new ToolError("E_BAD_ARGS", `${key} must be a number.`);
      v = n;
    } else if (schema.type === "boolean") {
      v = v === true || v === "true" || v === "1";
    } else if (schema.type === "array" && typeof v === "string") {
      v = v.trim().startsWith("[") ? JSON.parse(v) : v.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (schema.type === "string") {
      v = String(v);
      const allowed = schema.enum as string[] | undefined;
      if (allowed && !allowed.includes(v as string)) throw new ToolError("E_BAD_ARGS", `${key} must be one of: ${allowed.join(", ")}.`);
    }
    out[key] = v;
  }
  for (const req of tool.inputSchema.required ?? []) {
    if (out[req] === undefined) throw new ToolError("E_BAD_ARGS", `${req} is required.`);
  }
  return out;
}
