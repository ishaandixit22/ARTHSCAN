// Search-engine tags the layout adds for pages that don't write their own.

import { DOMAIN } from "./brand.ts";

// These pages set their own canonical address.
const OWN_CANONICAL = /^\/(calculators(\/|$)|about$|contact$|terms$|pricing$)/;
// And these their own description.
const OWN_DESCRIPTION = /^\/(calculators(\/|$)|about$|contact$|terms$|pricing$|ipos(\/expected\/.*)?$|screener(\/(?!custom$)[^/]+)?$|stock\/)/;
// Worth keeping out of search results: sign-in, private pages, and results that depend on what someone typed.
const NO_INDEX = /^\/(login$|settings(\/|$)|connect(\/|$)|screener\/custom$|mutual-funds\/fund$)/;

const DESCRIPTIONS: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/^\/$/, "Arthscan is a free Indian stock market research site: NSE share prices, stock screeners, sectors, IPOs, FII and DII flows and investing calculators, explained in plain language."],
  [/^\/stocks$/, "Browse every NSE-listed company on Arthscan, A to Z, with its latest share price and day's move."],
  [/^\/sectors\/(.+)$/, (m) => `${decodeURIComponent(m[1])} stocks on NSE: share prices, day's moves and how the sector's companies compare, on Arthscan.`],
  [/^\/sectors$/, "How Indian market sectors are moving today: returns, rotation and the stocks behind each sector, on Arthscan."],
  [/^\/heatmap$/, "Indian stock market heatmap: see which NSE stocks and sectors are up or down, today and over longer periods."],
  [/^\/fii-dii$/, "Daily FII and DII buying and selling in Indian markets, with foreign investors' sector flows and history."],
  [/^\/live$/, "Live Indian stock market: today's most active NSE stocks with prices during the trading session."],
  [/^\/breadth$/, "NSE market breadth: how many stocks are rising and falling, and the stocks making new 52-week highs and lows."],
  [/^\/signals$/, "Technical signals across NSE stocks: breakouts, moving-average crosses, volume spikes and RSI extremes."],
  [/^\/valuations$/, "P/E, P/B and dividend yield of Nifty indices, with their history, to see how expensive Indian markets are."],
  [/^\/deliveries$/, "NSE stocks with the highest delivery percentage: where shares are being taken home rather than traded in the day."],
  [/^\/deals$/, "Bulk and block deals on NSE: who bought and sold large blocks of shares, and at what price."],
  [/^\/corporate-actions$/, "Upcoming dividends, bonus issues, stock splits and rights issues for NSE-listed companies."],
  [/^\/board-meetings$/, "Upcoming board meetings of NSE-listed companies, including results dates and dividend decisions."],
  [/^\/earnings$/, "Indian earnings season: quarterly results of NSE-listed companies, who beat last year, and what's due next."],
  [/^\/events$/, "Dates that move Indian markets: RBI and Fed decisions, inflation data, F&O expiries, holidays, results and IPOs."],
  [/^\/filings$/, "Latest company announcements and filings from NSE-listed companies, in one place."],
  [/^\/fo-ban$/, "Which NSE stocks are in the F&O ban period today, and how long they've been there."],
  [/^\/mutual-funds$/, "Indian mutual funds: compare returns, categories and what funds hold."],
  [/^\/commodities$/, "Gold, silver, crude oil and other commodity prices for Indian investors."],
  [/^\/news$/, "Indian stock market and business news: the headlines moving markets today."],
  [/^\/developers$/, "Arthscan's API and MCP server: connect Indian stock market data to Claude, Cursor and your own apps."],
  [/^\/privacy$/, "How Arthscan handles your data: what is collected, why, and your choices."],
  [/^\/ipos\/(.+)$/, (m) => `${decodeURIComponent(m[1])} IPO: price band, dates, subscription and key details, on Arthscan.`],
];

export function pageSeo(path: string) {
  const match = DESCRIPTIONS.flatMap(([re, text]) => {
    const m = path.match(re);
    return m ? [typeof text === "string" ? text : text(m)] : [];
  })[0];
  return {
    canonical: OWN_CANONICAL.test(path) ? null : `https://${DOMAIN}${path === "/" ? "/" : path.replace(/\/$/, "")}`,
    description: OWN_DESCRIPTION.test(path) ? null : (match ?? null),
    noindex: NO_INDEX.test(path),
  };
}
