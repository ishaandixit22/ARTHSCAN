// One company's exchange filings (last 12 months, with PDFs), corporate-action
// history and upcoming board meetings, for the stock page's Filings tab. The
// page asks for it when the tab opens, so crawlers don't trigger NSE requests.

import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";

export async function GET({ params, setHeaders }) {
  const s = encodeURIComponent(params.symbol.toUpperCase());
  const known = await api(`/v1/stocks/${s}`, { allowError: true }).catch(() => null);
  if (!known?.symbol) return json({ error: "unknown stock" }, { status: 404 });
  const [filings, actions, events] = await Promise.all([
    api(`/v1/market/filings?symbol=${s}&limit=300`, { allowError: true }).catch(() => null),
    api(`/v1/market/corporate-actions?symbol=${s}`, { allowError: true }).catch(() => null),
    api(`/v1/market/events?symbol=${s}`, { allowError: true }).catch(() => null),
  ]);
  setHeaders({ "cache-control": "private, max-age=900" });
  return json({
    filings: filings?.filings ?? null,
    kinds: filings?.kinds ?? {},
    counts: filings?.counts ?? {},
    actions: actions?.actions ?? null,
    events: events?.events ?? null,
    fetched_at: filings?.fetched_at ?? null,
  });
}
