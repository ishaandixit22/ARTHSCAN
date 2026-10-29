import { api } from "$lib/server/api";

export async function load({ url }) {
  const r = await api("/v1/market/events", { allowError: true }).catch(() => null);
  return { ev: r?.events ? r : null, error: r?.events ? null : (r?.error?.message ?? "The board-meeting calendar isn't available from NSE right now."), purpose: url.searchParams.get("purpose") ?? "" };
}
