import { api } from "$lib/server/api";

const TABS = ["declared", "sectors", "leaderboard", "calendar"];
const SORTS = ["largest", "profit_growth", "sales_growth", "profit_fall"];
const RESULTS = ["Growing", "Mixed", "Shrinking", "Loss", "Back to profit"];

export async function load({ url }) {
  const p = url.searchParams;
  const tab = TABS.includes(p.get("tab") ?? "") ? p.get("tab")! : "declared";
  const sort = SORTS.includes(p.get("sort") ?? "") ? p.get("sort")! : "largest";
  const result = RESULTS.includes(p.get("result") ?? "") ? p.get("result")! : "";
  const sector = (p.get("sector") ?? "").slice(0, 80);
  const quarter = /^\d{4}-\d{2}-\d{2}$/.test(p.get("quarter") ?? "") ? p.get("quarter")! : "";
  const n = Math.min(1000, Math.max(100, Number(p.get("n")) || 100));

  // The leaderboard ranks every reporter; the declared tab pages through the filtered list.
  const q = new URLSearchParams({
    ...(quarter && { quarter }),
    ...(tab === "declared" ? { sort, ...(result && { result }), ...(sector && { sector }), limit: String(n) } : { limit: "1000" }),
  });
  const [season, events, docs] = await Promise.all([
    api(`/v1/market/earnings-season?${q}`, { allowError: true }).catch(() => null),
    tab === "calendar" ? api("/v1/market/events?results_only=true", { allowError: true }).catch(() => null) : null,
    tab === "calendar" ? api("/v1/market/company-documents?days=14&limit=500", { allowError: true }).catch(() => null) : null,
  ]);
  return {
    season: season?.quarters ? season : null,
    events: events?.events ?? null,
    companies: docs?.companies ?? null,
    tab, sort, result, sector, quarter, n,
    date: p.get("date"), only: p.get("only") ?? "",
    search: url.search,
  };
}
