// What the stock page loads in the browser, after the page itself (?only=quote|stats|digest for one part): long-history figures and the
// session's quote from Dhan, About and news from the provider. Called only for real visitors (see the
// page), so crawlers walking every stock don't spend either plan. Each part can fail on its own.

import { json } from "@sveltejs/kit";
import { api, ext } from "$lib/server/api";

export async function GET({ params, url, setHeaders }) {
  const symbol = encodeURIComponent(params.symbol.toUpperCase());
  const only = url.searchParams.get("only");
  const live = (path: string) => api(`/api/live/${path}?symbol=${symbol}`, { allowError: true }).then((r) => (r?.ok ? r : null)).catch(() => null);
  setHeaders({ "cache-control": "private, max-age=15" });
  // The page asks for each part on its own, so a slow one never holds up the others.
  if (only === "quote") return json({ quote: await live("quote") });
  if (only === "stats") return json({ stats: await live("stats") });
  if (only === "digest") {
    const digest = await ext(`/digest?stock=${symbol}`);
    return json({ digest: digest.data, digest_at: digest.fetched_at });
  }
  const [quote, stats, digest] = await Promise.all([live("quote"), live("stats"), ext(`/digest?stock=${symbol}`)]);
  return json({ quote, stats, digest: digest.data, digest_at: digest.fetched_at });
}
