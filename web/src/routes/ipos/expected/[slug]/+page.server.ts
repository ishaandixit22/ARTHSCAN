import { error } from "@sveltejs/kit";
import { api } from "$lib/server/api";

// A company with a draft on file at SEBI. Its row comes from the dashboard, the only place these rows live.
export async function load({ params }) {
  const dashboard = await api("/v1/market/ipo-dashboard", { allowError: true }).catch(() => null);
  if (!dashboard?.rows) error(502, "IPO data is not reachable right now.");
  const company = dashboard.rows.find((r: any) => r.slug === params.slug && r.filing);
  if (!company) error(404, "This company is no longer on our list of draft filings. It may have moved on to its IPO, so check the IPO page.");
  return { company, read_at: dashboard.sources?.sebi?.fetched_at ?? null };
}
