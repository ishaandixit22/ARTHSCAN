import { api } from "$lib/server/api";

const PERIODS = ["1d", "5d", "1m", "3m", "6m", "1y", "max"];
// These two come from Dhan's intraday candles; the rest are stored daily prices.
const INTRADAY = new Set(["1d", "5d"]);

export async function load({ params, url }) {
  const symbol = params.symbol.toUpperCase();
  const period = PERIODS.includes(url.searchParams.get("period") ?? "") ? url.searchParams.get("period")! : "1y";
  const [company, history, financials, shareholding, dhanInfo] = await Promise.all([
    api(`/v1/stocks/${encodeURIComponent(symbol)}`),
    INTRADAY.has(period)
      ? api(`/api/live/candles?symbol=${encodeURIComponent(symbol)}&range=${period}`, { allowError: true }).catch(() => null)
      : api(`/v1/stocks/${encodeURIComponent(symbol)}/history?period=${period}`, { allowError: true }),
    api(`/v1/stocks/${encodeURIComponent(symbol)}/financials?limit=8`),
    api(`/v1/stocks/${encodeURIComponent(symbol)}/shareholding?limit=8`),
    // Dhan's ratios against industry averages; the page loads without it.
    api(`/api/live/company?symbol=${encodeURIComponent(symbol)}`, { allowError: true }).catch(() => null),
  ]);
  return { company, history: history?.candles ? { ...history, intraday: INTRADAY.has(period) } : null, financials, shareholding, industryInfo: dhanInfo?.ok ? dhanInfo : null, period, periods: PERIODS };
}
