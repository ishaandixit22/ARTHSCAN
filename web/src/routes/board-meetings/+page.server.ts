import { api } from "$lib/server/api";

export async function load({ url }) {
  const [r, docs] = await Promise.all([
    api("/v1/market/events", { allowError: true }).catch(() => null),
    api("/v1/market/company-documents?days=14&limit=500", { allowError: true }).catch(() => null),
  ]);
  return { ev: r?.events ? r : null, companies: docs?.companies ?? [], error: r?.events ? null : (r?.error?.message ?? "The board-meeting calendar isn't available from NSE right now."), purpose: url.searchParams.get("purpose") ?? "" };
}
