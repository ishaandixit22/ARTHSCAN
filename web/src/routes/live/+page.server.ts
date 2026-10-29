import { redirect } from "@sveltejs/kit";
import { api } from "$lib/server/api";

// The 50 most traded stocks, watched live. Accounts without live access get the market page instead.
export async function load({ locals }) {
  if (!locals.live) redirect(303, "/");
  const active = await api("/v1/market/movers?kind=active&limit=50");
  return { stocks: active.results as { symbol: string; name: string; close: number; change_pct: number; sector: string | null }[] };
}
