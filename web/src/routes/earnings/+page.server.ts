import { api } from "$lib/server/api";

export async function load({ url }) {
  const [events, docs, week] = await Promise.all([
    api("/v1/market/events?results_only=true", { allowError: true }).catch(() => null),
    api("/v1/market/company-documents?days=14&limit=500", { allowError: true }).catch(() => null),
    api("/v1/market/filings?days=7&limit=1", { allowError: true }).catch(() => null),
  ]);
  return {
    events: events?.events ?? null,
    companies: docs?.companies ?? null,
    counts: week?.counts ?? null,
    fetched_at: docs?.fetched_at ?? events?.fetched_at ?? null,
    date: url.searchParams.get("date"),
    only: url.searchParams.get("only") ?? "",
  };
}
