import { error } from "@sveltejs/kit";
import { api } from "$lib/server/api";

// The owner's daily funnel dashboard: visits, signups, activation, WAU, MAU and MCP users, by channel.
export async function load({ locals, request, url }) {
  if (!locals.owner) error(404, "Not found");
  const days = Math.min(Number(url.searchParams.get("days")) || 30, 90);
  const f = await api(`/api/analytics/funnel?days=${days}`, { cookie: request.headers.get("cookie") });
  return { f, days };
}
