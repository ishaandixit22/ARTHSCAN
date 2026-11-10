// The index page's 1D chart: minute candles for the latest session, from Dhan.
import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { indexBySlug } from "$lib/indices";

export async function GET({ params, request, setHeaders }) {
  const info = indexBySlug(params.slug);
  if (!info) return json({ error: "unknown index" }, { status: 404 });
  const r = await api(`/api/live/index-candles?index=${encodeURIComponent(info.name)}`, { cookie: request.headers.get("cookie"), allowError: true }).catch(() => null);
  if (r?.ok && r.candles?.length) {
    setHeaders({ "cache-control": "private, max-age=30" });
    return json(r);
  }
  return json({ error: r?.error ?? "unavailable", candles: null }, { status: 503 });
}
