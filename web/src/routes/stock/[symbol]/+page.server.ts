import { api } from "$lib/server/api";

const PERIODS = ["1m", "3m", "6m", "1y", "max"];

export async function load({ params, url }) {
  const symbol = params.symbol.toUpperCase();
  const period = PERIODS.includes(url.searchParams.get("period") ?? "") ? url.searchParams.get("period")! : "1y";
  const [company, history, financials, shareholding] = await Promise.all([
    api(`/v1/stocks/${encodeURIComponent(symbol)}`),
    api(`/v1/stocks/${encodeURIComponent(symbol)}/history?period=${period}`, { allowError: true }),
    api(`/v1/stocks/${encodeURIComponent(symbol)}/financials?limit=8`),
    api(`/v1/stocks/${encodeURIComponent(symbol)}/shareholding?limit=8`),
  ]);
  return { company, history: history?.candles ? history : null, financials, shareholding, period, periods: PERIODS };
}
