import { api } from "$lib/server/api";
import { error } from "@sveltejs/kit";

export async function load({ params }) {
  const sector = params.sector;
  const data = await api(`/v1/stocks?sector=${encodeURIComponent(sector)}&limit=500`);
  if (!data.total) error(404, `No stocks in sector “${sector}”.`);
  return { sector, rows: data.results.sort((a: any, b: any) => (b.turnover ?? 0) - (a.turnover ?? 0)) };
}
