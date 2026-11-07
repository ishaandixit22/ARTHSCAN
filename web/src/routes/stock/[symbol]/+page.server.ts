import { redirect } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import bseTickers from "$lib/server/bse-tickers.json";

export async function load({ params, url }) {
  const symbol = params.symbol.toUpperCase();
  const stock = encodeURIComponent(symbol);
  // Stocks listed only on BSE carry a BSE- prefix and have none of NSE's stored results or holdings.
  const bseOnly = symbol.startsWith("BSE-");
  const [company, financials, shareholding, dhanInfo] = await Promise.all([
    api(`/v1/stocks/${stock}`),
    bseOnly ? { periods: [] } : api(`/v1/stocks/${stock}/financials?limit=8`),
    bseOnly ? { quarters: [] } : api(`/v1/stocks/${stock}/shareholding?limit=8`),
    // Dhan's ratios against industry averages; the page loads without it.
    api(`/api/live/company?symbol=${stock}`, { allowError: true }).catch(() => null),
  ]);
  // A retired ticker answers with the company under its current symbol.
  if (company.symbol !== symbol) redirect(301, `/stock/${encodeURIComponent(company.symbol)}${url.search}`);
  // TradingView's free chart refuses NSE symbols, so it gets the company's BSE ticker, matched by ISIN.
  const bseTicker = (bseTickers as Record<string, string>)[company.isin ?? ""];
  return { company, bseOnly, tvSymbol: bseTicker ? `BSE:${bseTicker}` : null, financials, shareholding, industryInfo: dhanInfo?.ok ? dhanInfo : null };
}
