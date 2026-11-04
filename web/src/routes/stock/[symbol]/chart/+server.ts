// Candles for the stock page's chart. Dhan first; if Dhan's data is withdrawn or down, an NSE stock's
// daily chart still draws from our stored closes rather than going blank.

import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";

export async function GET({ params, url, setHeaders }) {
  const symbol = encodeURIComponent(params.symbol.toUpperCase());
  const tf = url.searchParams.get("tf") ?? "D";
  const before = url.searchParams.get("before");
  const r = await api(`/api/live/chart?symbol=${symbol}&tf=${encodeURIComponent(tf)}${before ? `&before=${encodeURIComponent(before)}` : ""}`, { allowError: true }).catch(() => null);
  if (r?.candles) {
    setHeaders({ "cache-control": "private, max-age=30" });
    return json(r);
  }
  if (tf === "D" && !params.symbol.toUpperCase().startsWith("BSE-")) {
    const h = await api(`/v1/stocks/${symbol}/history?period=max`, { allowError: true }).catch(() => null);
    if (h?.candles?.length) {
      const candles = h.candles.map((c: any) => [Date.parse(`${c.date}T00:00:00+05:30`), c.open, c.high, c.low, c.close, c.volume]);
      return json({ ok: true, symbol: params.symbol, tf, candles, more: false, fallback: true });
    }
  }
  return json({ error: r?.error ?? "unavailable", candles: null }, { status: 503 });
}
