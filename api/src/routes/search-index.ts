// Every listed company for the search box, as one table the browser matches against locally.
// Website only: reached over the internal key, so it never counts as public API access.

import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { jsonError } from "../lib/http.js";

export const searchIndex = new Hono<AppEnv>();

const HEADERS = ["symbol", "name", "isin", "close", "change_pct", "aka"] as const;

searchIndex.get("/", async (c) => {
  if (c.get("principal")?.kind !== "internal") return jsonError(c, 403, "E_FORBIDDEN", "Internal only.");
  // Busiest first, the order the search endpoint ranks by; stocks with no metrics go last.
  const { results } = await c.env.DB.prepare(`SELECT s.symbol, s.name, s.isin, m.close, m.change_pct,
      (SELECT GROUP_CONCAT(c.old_symbol || ' ' || COALESCE(c.old_name, ''), ' ') FROM symbol_changes c WHERE c.new_symbol = s.symbol) AS aka
    FROM stocks s LEFT JOIN stock_metrics m ON m.symbol = s.symbol
    ORDER BY (m.turnover IS NULL), m.turnover DESC`).all<Record<(typeof HEADERS)[number], unknown>>();
  // Stocks listed only on BSE go after the NSE list, with their bare symbol kept searchable.
  const bse = c.env.BSE_PAGES === "public"
    ? (await c.env.DB.prepare(`SELECT 'BSE-' || s.symbol AS symbol, s.name, s.isin, p.close,
          CASE WHEN p.prev_close > 0 THEN ROUND((p.close / p.prev_close - 1) * 100, 2) END AS change_pct, s.symbol AS aka
        FROM bse_stocks s LEFT JOIN bse_daily_prices p ON p.symbol = s.symbol AND p.date = (SELECT MAX(date) FROM bse_daily_prices)
        WHERE s.history_at IS NOT NULL ORDER BY s.median_turnover DESC`).all<Record<(typeof HEADERS)[number], unknown>>()).results
    : [];
  // One array per company rather than repeating five keys a few thousand times.
  return c.json({ headers: HEADERS, rows: [...results, ...bse].map((r) => HEADERS.map((h) => r[h])) });
});
