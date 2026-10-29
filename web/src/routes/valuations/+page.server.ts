import { api } from "$lib/server/api";

export async function load({ url }) {
  const index = url.searchParams.get("index") || "Nifty 50";
  const [all, one] = await Promise.all([
    api("/v1/market/valuations"),
    api(`/v1/market/valuations?index=${encodeURIComponent(index)}&days=250`, { allowError: true }),
  ]);
  return { all, index, history: one?.history ? one : null };
}
