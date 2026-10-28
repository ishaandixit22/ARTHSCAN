// The shared data layer. Every feature is defined once here as a tool; the MCP
// server lists and calls these, the REST API mounts each at /v1/<route>, and the
// website reads through the same REST routes. Add a tool here and it appears on
// all three surfaces.

import type { Database } from "../db/types.js";

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
  handler: (db: Database, args: Record<string, any>) => Promise<unknown>;
}

export class ToolError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

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
};

const OPS: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=" };

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
    description: "Top gainers, top losers or most active stocks (by turnover) for the latest trading day. Ignores illiquid stocks; gainers and losers also leave out stocks on their listing day, whose change is measured against the issue price.",
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
        WHERE m.turnover >= 1e7 AND m.change_pct IS NOT NULL ${listing}
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
