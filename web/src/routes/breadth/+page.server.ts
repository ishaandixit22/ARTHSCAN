import { api } from "$lib/server/api";

const SHOW = ["advances", "declines", "unchanged", "highs", "lows"];

export async function load({ url }) {
  const show = SHOW.includes(url.searchParams.get("show") ?? "") ? url.searchParams.get("show")! : "advances";
  const sector = (url.searchParams.get("sector") ?? "").slice(0, 80);
  const n = Math.min(1000, Math.max(200, Number(url.searchParams.get("n")) || 200));
  const q = new URLSearchParams({ show, limit: String(n), ...(sector && { sector }) });
  const [list, sectors] = await Promise.all([
    api(`/v1/market/breadth?${q}`),
    api("/v1/sectors", { allowError: true }).catch(() => null),
  ]);
  return { list, show, sector, n, sectorList: ((sectors?.sectors ?? []) as { sector: string }[]).map((s) => s.sector).sort() };
}
