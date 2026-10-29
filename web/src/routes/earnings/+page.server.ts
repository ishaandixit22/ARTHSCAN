import { api } from "$lib/server/api";

export async function load({ url }) {
  const [events, results, calls] = await Promise.all([
    api("/v1/market/events?results_only=true", { allowError: true }).catch(() => null),
    api("/v1/market/filings?kind=results&days=2&limit=40", { allowError: true }).catch(() => null),
    api("/v1/market/filings?days=7&limit=1000", { allowError: true }).catch(() => null),
  ]);
  // Transcripts first, then investor presentations, from the last week.
  const callFilings = (calls?.filings ?? []).filter((f: any) => f.kind === "transcript" || f.kind === "presentation")
    .sort((a: any, b: any) => (a.kind === b.kind ? 0 : a.kind === "transcript" ? -1 : 1) || (b.time ?? "").localeCompare(a.time ?? ""));
  return {
    events: events?.events ?? null,
    results: results?.filings ?? null,
    resultsTotal: results?.total ?? null,
    calls: calls?.filings ? callFilings.slice(0, 40) : null,
    callCounts: calls?.counts ?? null,
    kinds: results?.kinds ?? calls?.kinds ?? {},
    fetched_at: events?.fetched_at ?? null,
    date: url.searchParams.get("date"),
  };
}
