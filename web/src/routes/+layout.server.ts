import type { LayoutServerLoad } from "./$types";
import { api } from "$lib/server/api";
import { NIFTY_50 } from "$lib/nifty50";

// The ticker's closing prices change once a day, but every page asks for them: keep the
// last answer for five minutes in this Worker instead of querying the database per page view.
let tickerCache: { at: number; quotes: any[] } | null = null;

async function closingQuotes(): Promise<any[]> {
  if (tickerCache && Date.now() - tickerCache.at < 5 * 60_000) return tickerCache.quotes;
  const r = await api<{ quotes: any[] }>("/v1/quotes", { body: { symbols: NIFTY_50 }, allowError: true }).catch(() => null);
  const quotes = r?.quotes ?? [];
  if (quotes.length) tickerCache = { at: Date.now(), quotes };
  return quotes.length ? quotes : (tickerCache?.quotes ?? []);
}

export const load: LayoutServerLoad = async ({ locals }) => {
  // The ticker never blocks a page: if quotes can't be read, it simply doesn't show.
  const bySymbol = new Map((await closingQuotes()).map((q) => [q.symbol, q]));
  return {
    account: locals.account,
    usage: locals.usage,
    live: locals.live,
    owner: locals.owner,
    ticker: NIFTY_50.map((s) => bySymbol.get(s)).filter(Boolean),
  };
};
