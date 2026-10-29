import { api } from "$lib/server/api";

const RANGES = ["1d", "1w", "1m", "1y"];

export async function load({ url }) {
  const range = RANGES.includes(url.searchParams.get("range") ?? "") ? url.searchParams.get("range")! : "1m";
  const [fpi, flows] = await Promise.all([
    api("/v1/market/fpi?days=300&fortnights=24", { allowError: true }).catch(() => null),
    api("/v1/market/fii-dii?days=60"),
  ]);
  return { fpi, flows, range, ranges: RANGES, sector: url.searchParams.get("sector") };
}
