import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";

// The search box's company table. Same for everyone and only changes with the evening refresh;
// this header also makes the Cloudflare adapter keep it at the edge.
export async function GET({ setHeaders }) {
  const body = await api<{ rows: unknown[][] }>("/api/search-index");
  setHeaders({ "cache-control": "public, max-age=300" });
  return json({ rows: body.rows });
}
