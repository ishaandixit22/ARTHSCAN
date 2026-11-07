import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";

// Typeahead for the header search box, served through the site so the
// browser never needs an API token.
export async function GET({ url }) {
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return json({ results: [] });
  const data = await api(`/v1/search?query=${encodeURIComponent(q)}&limit=8`);
  // Public and the same for everyone, so a popular query is answered from the edge for a minute.
  return json({ results: data.results }, { headers: { "cache-control": "public, max-age=60" } });
}
