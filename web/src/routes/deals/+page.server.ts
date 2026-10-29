import { api } from "$lib/server/api";

export async function load() {
  const r = await api("/v1/market/deals", { allowError: true }).catch(() => null);
  return { deals: r?.bulk ? r : null, error: r?.bulk ? null : (r?.error?.message ?? "Deals aren't available from NSE right now.") };
}
