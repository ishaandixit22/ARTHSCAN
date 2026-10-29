import { api } from "$lib/server/api";

export async function load({ url }) {
  const r = await api("/v1/market/corporate-actions", { allowError: true }).catch(() => null);
  return { ca: r?.actions ? r : null, error: r?.actions ? null : (r?.error?.message ?? "Corporate actions aren't available from NSE right now."), type: url.searchParams.get("type") ?? "" };
}
