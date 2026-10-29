import { error } from "@sveltejs/kit";
import { api } from "$lib/server/api";

export async function load({ params }) {
  const r = await api(`/v1/market/ipo-detail?symbol=${encodeURIComponent(params.symbol)}`, { allowError: true }).catch(() => null);
  if (!r?.symbol) error(r?.error?.code === "E_NOT_FOUND" ? 404 : 502, r?.error?.message ?? "NSE's IPO data is not reachable right now.");
  return { ipo: r };
}
