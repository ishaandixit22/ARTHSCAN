import { api } from "$lib/server/api";

export async function load({ url }) {
  const r = await api("/v1/market/events-calendar?days=120", { allowError: true }).catch(() => null);
  return {
    cal: r?.events ? r : null,
    error: r?.events ? null : (r?.error?.message ?? "The events calendar isn't available right now."),
    kind: url.searchParams.get("kind") ?? "",
    all: url.searchParams.get("all") === "1",
  };
}
