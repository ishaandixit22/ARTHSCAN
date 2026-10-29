import { api } from "$lib/server/api";

const PERIODS = ["1d", "1w", "1m", "3m", "1y"];

export async function load({ url }) {
  const period = PERIODS.includes(url.searchParams.get("period") ?? "") ? url.searchParams.get("period")! : "1d";
  return { heatmap: await api(`/v1/market/heatmap?period=${period}&limit=250`), period, periods: PERIODS };
}
