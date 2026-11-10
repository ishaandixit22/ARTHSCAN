import { redirect } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import bseTickers from "$lib/server/bse-tickers.json";

export async function load({ params, url, locals }) {
  const symbol = params.symbol.toUpperCase();
  const stock = encodeURIComponent(symbol);
  // Stocks listed only on BSE carry a BSE- prefix and have none of NSE's stored results or holdings.
  const bseOnly = symbol.startsWith("BSE-");
  // Signed out: only what the summary at the top needs, and nothing from the Dhan plan, so crawlers can't spend it.
  const preview = locals.preview;
  // About and the long-history figures come from what we've stored, never from the providers, so they
  // render with the page (crawlers included) at the cost of two database reads. The browser refreshes
  // whichever is missing or old. The figures are left out of signed-out previews, which don't show them.
  const stored = (path: string) => api(path, { allowError: true }).then((r) => r ?? null).catch(() => null);
  const [company, financials, shareholding, dhanInfo, digest, stats] = await Promise.all([
    api(`/v1/stocks/${stock}`),
    bseOnly ? { periods: [] } : api(`/v1/stocks/${stock}/financials?limit=${preview ? 5 : 8}`),
    bseOnly ? { quarters: [] } : api(`/v1/stocks/${stock}/shareholding?limit=${preview ? 2 : 8}`),
    // Dhan's ratios against industry averages; the page loads without it.
    preview ? null : api(`/api/live/company?symbol=${stock}`, { allowError: true }).catch(() => null),
    stored(`/v1/ext/digest?stock=${stock}&stored=1`),
    preview ? null : stored(`/api/live/stats?symbol=${stock}&stored=1`),
  ]);
  // A retired ticker answers with the company under its current symbol.
  if (company.symbol !== symbol) redirect(301, `/stock/${encodeURIComponent(company.symbol)}${url.search}`);
  // TradingView's free chart refuses NSE symbols, so it gets the company's BSE ticker, matched by ISIN.
  const bseTicker = (bseTickers as Record<string, string>)[company.isin ?? ""];
  return { company, bseOnly, tvSymbol: bseTicker ? `BSE:${bseTicker}` : null, financials, shareholding, industryInfo: dhanInfo?.ok ? dhanInfo : null,
    digest: digest?.source ? { data: digest.data, fetched_at: digest.fetched_at as string } : null,
    stats: stats?.ok ? stats : null };
}
